import { ApiError, type Env } from './http';

/** Per-file caps (same as Rust `screenraid-validation`). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_GIF_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** Default per-user total media on Cloudflare R2 (prod). */
const DEFAULT_USER_QUOTA_BYTES = 200 * 1024 * 1024;
/** Default max uploads per UTC day (prod). */
const DEFAULT_UPLOADS_PER_DAY = 40;

export function storageQuotasEnforced(env: Env): boolean {
  const v = (env.ENFORCE_STORAGE_QUOTAS ?? '1').trim().toLowerCase();
  return !(v === '0' || v === 'false' || v === 'off');
}

export function userQuotaBytes(env: Env): number {
  const n = Number(env.USER_MEDIA_QUOTA_BYTES || DEFAULT_USER_QUOTA_BYTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_USER_QUOTA_BYTES;
}

export function uploadsPerDay(env: Env): number {
  const n = Number(env.MAX_UPLOADS_PER_DAY || DEFAULT_UPLOADS_PER_DAY);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_UPLOADS_PER_DAY;
}

export function maxBytesForMime(mime: string): number {
  const m = mime.toLowerCase();
  if (m.includes('gif')) return MAX_GIF_BYTES;
  if (m.startsWith('video/')) return MAX_VIDEO_BYTES;
  if (m.startsWith('audio/')) return MAX_AUDIO_BYTES;
  if (m.startsWith('image/')) return MAX_IMAGE_BYTES;
  return MAX_IMAGE_BYTES;
}

export async function assertUploadAllowed(
  env: Env,
  userId: string,
  mime: string,
  sizeBytes: number,
): Promise<void> {
  // Always enforce per-type file size caps (even when quota accounting is disabled).
  const maxFile = maxBytesForMime(mime);
  if (sizeBytes > maxFile) {
    throw new ApiError(
      `File too large (max ${Math.floor(maxFile / (1024 * 1024))} MB for this type)`,
      413,
      'file_too_large',
    );
  }

  if (!storageQuotasEnforced(env)) return;

  const used = await env.DB.prepare(
    `SELECT COALESCE(SUM(size_bytes), 0) AS used FROM media WHERE uploader_id = ?`,
  )
    .bind(userId)
    .first<{ used: number }>();
  const quota = userQuotaBytes(env);
  if ((used?.used ?? 0) + sizeBytes > quota) {
    throw new ApiError(
      `Storage quota exceeded (max ${Math.floor(quota / (1024 * 1024))} MB per user)`,
      413,
      'quota_exceeded',
    );
  }

  const day = new Date().toISOString().slice(0, 10);
  const today = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM media
     WHERE uploader_id = ? AND substr(created_at, 1, 10) = ?`,
  )
    .bind(userId, day)
    .first<{ c: number }>();
  if ((today?.c ?? 0) >= uploadsPerDay(env)) {
    throw new ApiError('Daily upload limit reached', 429, 'upload_rate_limited');
  }
}
