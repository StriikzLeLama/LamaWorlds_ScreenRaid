import Database from '@tauri-apps/plugin-sql';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { getServerUrl } from './serverConfig';
import { appFetch } from './appFetch';
import { log } from '../lib/log';

const DB_URL = 'sqlite:screenraid-client.db';
/** Chunk size for IPC disk writes (avoid freezing on large GIFs). */
const WRITE_CHUNK = 256 * 1024;

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

function extensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
  };
  return map[mime] ?? mime.split('/').pop() ?? 'bin';
}

export interface ResolvedMedia {
  /** URL for WebView (asset protocol). Must be convertFileSrc — blob URLs fail in overlay webviews. */
  mediaUrl: string;
  /** Absolute path on disk when cached locally. */
  localPath: string | null;
}

async function lookupCachedPath(mediaId: string): Promise<string | null> {
  try {
    const db = await getDb();
    const rows = await db.select<{ file_path: string }[]>(
      'SELECT file_path FROM cached_media WHERE media_id = ? LIMIT 1',
      [mediaId],
    );
    const path = rows[0]?.file_path;
    if (!path) return null;
    return path;
  } catch {
    return null;
  }
}

async function recordCacheEntry(
  mediaId: string,
  url: string,
  filePath: string,
  mimeType: string,
  sizeBytes: number,
  hash: string | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO cached_media (media_id, url, file_path, mime_type, size_bytes, hash_sha256, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(media_id) DO UPDATE SET
       url = excluded.url,
       file_path = excluded.file_path,
       mime_type = excluded.mime_type,
       size_bytes = excluded.size_bytes,
       hash_sha256 = excluded.hash_sha256,
       last_used_at = datetime('now')`,
    [mediaId, url, filePath, mimeType, sizeBytes, hash],
  );
}

async function touchCacheEntry(mediaId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE cached_media SET last_used_at = datetime('now') WHERE media_id = ?`,
    [mediaId],
  );
}

/** Write bytes to disk in chunks so large GIFs don't freeze on Array.from(IPC). */
async function writeToDiskCache(
  mediaId: string,
  buffer: ArrayBuffer,
  extension: string,
): Promise<string> {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength <= WRITE_CHUNK) {
    return invoke<string>('write_media_cache', {
      mediaId,
      bytes: Array.from(bytes),
      extension,
    });
  }

  let localPath = '';
  for (let offset = 0; offset < bytes.byteLength; offset += WRITE_CHUNK) {
    const slice = bytes.subarray(offset, Math.min(offset + WRITE_CHUNK, bytes.byteLength));
    localPath = await invoke<string>('write_media_cache_chunk', {
      mediaId,
      bytes: Array.from(slice),
      extension,
      append: offset > 0,
    });
  }
  return localPath;
}

/** Download (or reuse) authenticated media and return a displayable URL. */
export async function resolveMediaForPrank(
  media: {
    id: string;
    url: string;
    mime_type: string;
    hash_sha256: string;
  },
  accessToken: string,
): Promise<ResolvedMedia | null> {
  const cached = await lookupCachedPath(media.id);
  if (cached) {
    await touchCacheEntry(media.id).catch(() => undefined);
    return { mediaUrl: convertFileSrc(cached), localPath: cached };
  }

  const remoteUrl = media.url.startsWith('http') ? media.url : `${getServerUrl()}${media.url}`;
  const response = await appFetch(remoteUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    log.warn('media download failed', response.status, remoteUrl);
    return null;
  }

  const buffer = await response.arrayBuffer();
  const ext = extensionFromMime(media.mime_type);

  try {
    const localPath = await writeToDiskCache(media.id, buffer, ext);

    await recordCacheEntry(
      media.id,
      remoteUrl,
      localPath,
      media.mime_type,
      buffer.byteLength,
      media.hash_sha256 || null,
    ).catch(() => undefined);

    return { mediaUrl: convertFileSrc(localPath), localPath };
  } catch (e) {
    log.warn('media cache write failed', e);
    return null;
  }
}

export async function clearMediaCache(): Promise<number> {
  const removed = await invoke<number>('clear_media_cache');
  const db = await getDb();
  await db.execute('DELETE FROM cached_media');
  return removed;
}

/** Evict oldest entries when over limit (best-effort). */
export async function enforceCacheLimit(limitMb: number): Promise<void> {
  if (limitMb <= 0) return;
  const db = await getDb();
  const rows = await db.select<{ total: number }[]>(
    'SELECT COALESCE(SUM(size_bytes), 0) as total FROM cached_media',
  );
  const total = rows[0]?.total ?? 0;
  const limitBytes = limitMb * 1024 * 1024;
  if (total <= limitBytes) return;

  const victims = await db.select<{ media_id: string; file_path: string }[]>(
    `SELECT media_id, file_path FROM cached_media
     ORDER BY last_used_at ASC LIMIT 10`,
  );
  for (const row of victims) {
    await db.execute('DELETE FROM cached_media WHERE media_id = ?', [row.media_id]);
    await invoke('remove_media_cache_file', { path: row.file_path }).catch(() => undefined);
  }
}
