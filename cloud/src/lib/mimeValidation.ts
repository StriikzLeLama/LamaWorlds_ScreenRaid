import { ApiError } from './http';
import { maxBytesForMime } from './storageLimits';

/** Allowed MIME types — mirrors `crates/screenraid-validation/src/mime.rs`. */
const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
]);

function bytesEq(data: Uint8Array, offset: number, pattern: number[] | string): boolean {
  if (typeof pattern === 'string') {
    const enc = new TextEncoder().encode(pattern);
    if (offset + enc.length > data.length) return false;
    for (let i = 0; i < enc.length; i++) {
      if (data[offset + i] !== enc[i]) return false;
    }
    return true;
  }
  if (offset + pattern.length > data.length) return false;
  return pattern.every((b, i) => data[offset + i] === b);
}

/** Sniff MIME from magic bytes (subset aligned with Rust validator). */
export function detectMimeFromBytes(data: ArrayBuffer): string | null {
  const u8 = new Uint8Array(data);
  if (bytesEq(u8, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'image/jpeg';
  if (bytesEq(u8, 0, 'GIF87a') || bytesEq(u8, 0, 'GIF89a')) return 'image/gif';
  if (bytesEq(u8, 0, 'RIFF') && bytesEq(u8, 8, 'WEBP')) return 'image/webp';
  if (u8.length >= 12 && bytesEq(u8, 4, 'ftyp')) return 'video/mp4';
  if (bytesEq(u8, 0, 'RIFF') && !bytesEq(u8, 8, 'WEBP')) return 'audio/wav';
  if (bytesEq(u8, 0, 'OggS')) return 'audio/ogg';
  if (u8.length >= 2 && u8[0] === 0xff && (u8[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  return null;
}

/**
 * Validate upload bytes against declared Content-Type.
 * Rejects unknown types, MIME mismatches, and oversize files.
 */
export function validateUploadBytes(declaredMime: string, data: ArrayBuffer): string {
  const declared = (declaredMime || 'application/octet-stream').toLowerCase().split(';')[0]!.trim();
  const detected = detectMimeFromBytes(data);
  if (!detected) {
    throw new ApiError('invalid file type', 415, 'invalid_mime');
  }
  if (detected !== declared) {
    throw new ApiError(
      `mime mismatch: declared ${declared}, detected ${detected}`,
      415,
      'mime_mismatch',
    );
  }
  if (!ALLOWED_MIMES.has(detected)) {
    throw new ApiError('invalid file type', 415, 'invalid_mime');
  }
  const max = maxBytesForMime(detected);
  if (data.byteLength > max) {
    throw new ApiError(
      `File too large (max ${Math.floor(max / (1024 * 1024))} MB for this type)`,
      413,
      'file_too_large',
    );
  }
  return detected;
}
