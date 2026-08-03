import { ApiError, empty, json, newId, nowIso, type Env } from '../lib/http';
import { requireUser } from '../lib/auth';
import { canAccessMedia } from '../lib/db';
import {
  assertUploadAllowed,
  storageQuotasEnforced,
  userQuotaBytes,
} from '../lib/storageLimits';
import { validateUploadBytes } from '../lib/mimeValidation';

function mediaTypeFromMime(mime: string): string {
  if (mime.startsWith('image/gif')) return 'gif';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'sound';
  return 'image';
}

export async function handleMedia(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (path === '/v1/media/upload' && request.method === 'POST') {
    const claims = await requireUser(env, request);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError('file required', 400);
    const roomId = (form.get('room_id') as string | null) || null;
    const declaredMime = file.type || 'application/octet-stream';
    const bytes = await file.arrayBuffer();
    const mime = validateUploadBytes(declaredMime, bytes);
    await assertUploadAllowed(env, claims.sub, mime, bytes.byteLength);

    const id = newId();
    const original = file.name || 'upload.bin';
    const ext = original.includes('.') ? original.split('.').pop()! : 'bin';
    const filename = `${id}.${ext}`;
    const storageKey = `media/${claims.sub}/${filename}`;
    await env.MEDIA.put(storageKey, bytes, {
      httpMetadata: { contentType: mime },
    });
    const ts = nowIso();
    await env.DB.prepare(
      `INSERT INTO media
       (id, uploader_id, room_id, filename, original_name, mime_type, size_bytes, media_type, storage_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        claims.sub,
        roomId,
        filename,
        original,
        mime,
        bytes.byteLength,
        mediaTypeFromMime(mime),
        storageKey,
        ts,
      )
      .run();
    return json(
      {
        id,
        filename,
        original_name: original,
        mime_type: mime,
        size_bytes: bytes.byteLength,
        media_type: mediaTypeFromMime(mime),
        url: `/v1/media/${id}/file`,
        created_at: ts,
      },
      201,
      request,
    );
  }

  if (path === '/v1/media/storage' && request.method === 'GET') {
    const claims = await requireUser(env, request);
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(size_bytes), 0) AS used FROM media WHERE uploader_id = ?`,
    )
      .bind(claims.sub)
      .first<{ used: number }>();
    const used = Number(row?.used ?? 0);
    const quota = userQuotaBytes(env);
    const remaining = Math.max(0, quota - used);
    return json(
      {
        used_bytes: used,
        quota_bytes: quota,
        remaining_bytes: remaining,
        enforced: storageQuotasEnforced(env),
      },
      200,
      request,
    );
  }

  if (path === '/v1/media' && request.method === 'GET') {
    const claims = await requireUser(env, request);
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));
    const offset = (page - 1) * limit;
    const roomId = url.searchParams.get('room_id');

    let countSql = `SELECT COUNT(*) AS c FROM media WHERE uploader_id = ?`;
    let listSql = `SELECT id, uploader_id, room_id, filename, original_name, mime_type, size_bytes, media_type,
                          COALESCE(hash_sha256, '') AS hash_sha256, duration_ms, width, height, created_at
                   FROM media WHERE uploader_id = ?`;
    const binds: (string | number)[] = [claims.sub];
    if (roomId) {
      countSql += ` AND room_id = ?`;
      listSql += ` AND room_id = ?`;
      binds.push(roomId);
    }
    listSql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;

    const totalRow = await env.DB.prepare(countSql)
      .bind(...binds)
      .first<{ c: number }>();
    const { results } = await env.DB.prepare(listSql)
      .bind(...binds, limit, offset)
      .all();

    const items = (results ?? []).map((m) => {
      const row = m as { id: string };
      return { ...row, url: `/v1/media/${row.id}/file` };
    });
    return json(
      { items, total: totalRow?.c ?? items.length, page, limit },
      200,
      request,
    );
  }

  const fileMatch = path.match(/^\/v1\/media\/([^/]+)\/file$/);
  if (fileMatch && request.method === 'GET') {
    const claims = await requireUser(env, request);
    const id = fileMatch[1]!;
    const allowed = await canAccessMedia(env, id, claims.sub);
    if (!allowed) throw new ApiError('Forbidden', 403, 'forbidden');
    const row = await env.DB.prepare(`SELECT * FROM media WHERE id = ?`)
      .bind(id)
      .first<{ storage_key: string; mime_type: string; original_name: string }>();
    if (!row) throw new ApiError('Not found', 404);
    const obj = await env.MEDIA.get(row.storage_key);
    if (!obj) throw new ApiError('Not found', 404);
    const headers = new Headers();
    headers.set('Content-Type', row.mime_type);
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('Content-Disposition', `inline; filename="${row.original_name.replace(/"/g, '')}"`);
    return new Response(obj.body, { headers });
  }

  const deleteMatch = path.match(/^\/v1\/media\/([^/]+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    const claims = await requireUser(env, request);
    const id = deleteMatch[1]!;
    const row = await env.DB.prepare(
      `SELECT storage_key, uploader_id FROM media WHERE id = ?`,
    )
      .bind(id)
      .first<{ storage_key: string; uploader_id: string }>();
    if (!row) throw new ApiError('Not found', 404);
    if (row.uploader_id !== claims.sub) throw new ApiError('Forbidden', 403);
    await env.MEDIA.delete(row.storage_key);
    await env.DB.prepare(`DELETE FROM media WHERE id = ?`).bind(id).run();
    return empty(204, request);
  }

  return null;
}
