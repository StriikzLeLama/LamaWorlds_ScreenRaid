import { ApiError, json, newId, nowIso, readJson, type Env } from '../lib/http';
import { requireUser } from '../lib/auth';
import { assertUploadAllowed } from '../lib/storageLimits';

const KLIPY_BASE = 'https://api.klipy.com/api/v1';
const MAX_IMPORT = 15 * 1024 * 1024;

function normalizeKind(kind: string | null): string {
  const k = (kind || 'gifs').toLowerCase();
  if (k === 'sticker' || k === 'stickers') return 'stickers';
  if (k === 'meme' || k === 'memes') return 'memes';
  return 'gifs';
}

function publicKind(kind: string): string {
  if (kind === 'stickers') return 'sticker';
  if (kind === 'memes') return 'meme';
  return 'gif';
}

function pickUrl(node: unknown): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.url === 'string') return o.url;
    if (typeof o.gif === 'string') return o.gif;
  }
  return '';
}

function pickRendition(
  file: Record<string, unknown>,
  sizes: string[],
  formats: string[],
): { url: string; width: number; height: number } | null {
  for (const size of sizes) {
    const bucket = file[size];
    if (!bucket || typeof bucket !== 'object') continue;
    const b = bucket as Record<string, unknown>;
    for (const fmt of formats) {
      const r = b[fmt];
      if (!r || typeof r !== 'object') continue;
      const o = r as Record<string, unknown>;
      const url = typeof o.url === 'string' ? o.url : '';
      if (!url) continue;
      return {
        url,
        width: Number(o.width ?? 0),
        height: Number(o.height ?? 0),
      };
    }
  }
  return null;
}

function parseItems(raw: unknown, kind: string) {
  const root = raw as {
    data?: { data?: unknown[]; has_next?: boolean };
    result?: unknown[];
  };
  const list = (root?.data?.data ?? root?.result ?? []) as Array<Record<string, unknown>>;
  const formats =
    kind === 'stickers' || kind === 'memes'
      ? ['webp', 'png', 'gif', 'jpg']
      : ['gif', 'webp', 'png', 'jpg'];

  const items = list
    .map((it) => {
      const file = (it.file ?? it.files ?? {}) as Record<string, unknown>;
      const preview =
        pickRendition(file, ['sm', 'xs', 'md', 'hd'], formats) ??
        pickRendition(file, ['hd', 'md', 'sm', 'xs'], formats);
      const full =
        pickRendition(file, ['md', 'hd', 'sm', 'xs'], formats) ?? preview;
      const preview_url =
        preview?.url ||
        pickUrl(it.blur_preview) ||
        pickUrl(it.url) ||
        '';
      const gif_url = full?.url || preview_url;
      if (!gif_url) return null;
      return {
        id: String(it.id ?? it.slug ?? crypto.randomUUID()),
        slug: String(it.slug ?? ''),
        title: String(it.title ?? it.name ?? 'GIF'),
        preview_url,
        gif_url,
        width: full?.width ?? preview?.width ?? Number(it.width ?? 0),
        height: full?.height ?? preview?.height ?? Number(it.height ?? 0),
        kind: publicKind(kind),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const has_next = Boolean(root?.data?.has_next);
  return { items, has_next };
}

function allowedHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'static.klipy.com' || u.hostname.endsWith('.klipy.com');
  } catch {
    return false;
  }
}

export async function handleGifs(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (!path.startsWith('/v1/gifs')) return null;
  await requireUser(env, request);

  if (path === '/v1/gifs/search' && request.method === 'GET') {
    const url = new URL(request.url);
    const kind = normalizeKind(url.searchParams.get('kind'));
    const q = url.searchParams.get('q');
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const per_page = Math.min(48, Math.max(8, Number(url.searchParams.get('per_page') || 24)));
    const key = env.KLIPY_API_KEY || '';

    if (!key) {
      return json(
        {
          enabled: false,
          items: [],
          page,
          per_page,
          has_next: false,
          attribution: 'Powered by KLIPY',
          kind: publicKind(kind),
        },
        200,
        request,
      );
    }

    const endpoint = q?.trim()
      ? `${KLIPY_BASE}/${key}/${kind}/search`
      : `${KLIPY_BASE}/${key}/${kind}/trending`;
    const u = new URL(endpoint);
    u.searchParams.set('page', String(page));
    u.searchParams.set('per_page', String(per_page));
    if (q?.trim()) u.searchParams.set('q', q.trim());

    const res = await fetch(u.toString(), {
      headers: { 'User-Agent': 'ScreenRaid/0.1 (+cloudflare)' },
    });
    if (!res.ok) throw new ApiError(`klipy returned ${res.status}`, 502, 'klipy_error');
    const raw = await res.json();
    const { items, has_next } = parseItems(raw, kind);
    return json(
      {
        enabled: true,
        items,
        page,
        per_page,
        has_next,
        attribution: 'Powered by KLIPY',
        kind: publicKind(kind),
      },
      200,
      request,
    );
  }

  if (path === '/v1/gifs/import' && request.method === 'POST') {
    const claims = await requireUser(env, request);
    const body = await readJson<{
      url: string;
      room_id?: string | null;
      title?: string | null;
      slug?: string | null;
      kind?: string | null;
    }>(request);
    const gifUrl = body.url?.trim();
    if (!gifUrl || !/^https?:\/\//i.test(gifUrl)) {
      throw new ApiError(
        `gif url must be http(s) (got: ${String(body.url).slice(0, 80)})`,
        400,
        'invalid_gif_url',
      );
    }
    if (!allowedHost(gifUrl)) {
      let host = '';
      try {
        host = new URL(gifUrl).hostname;
      } catch {
        host = '?';
      }
      throw new ApiError(
        `gif url host not allowed: ${host} (expected *.klipy.com)`,
        400,
        'gif_host_denied',
      );
    }

    const res = await fetch(gifUrl, {
      headers: { 'User-Agent': 'ScreenRaid/0.1 (+cloudflare)', Accept: 'image/*,*/*' },
    });
    if (!res.ok) {
      throw new ApiError(`gif download HTTP ${res.status}`, 400, 'gif_download_failed');
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) throw new ApiError('gif download empty', 400);
    if (bytes.byteLength > MAX_IMPORT) throw new ApiError('gif too large', 400);

    const mime = res.headers.get('content-type')?.split(';')[0] || 'image/gif';
    await assertUploadAllowed(env, claims.sub, mime, bytes.byteLength);
    const ext = mime.includes('webp')
      ? 'webp'
      : mime.includes('png')
        ? 'png'
        : mime.includes('jpeg') || mime.includes('jpg')
          ? 'jpg'
          : 'gif';
    const id = newId();
    const original =
      (body.title || body.slug || 'klipy').trim().slice(0, 80) + `.${ext}`;
    const filename = `${id}.${ext}`;
    const storageKey = `media/${claims.sub}/${filename}`;
    await env.MEDIA.put(storageKey, bytes, { httpMetadata: { contentType: mime } });
    const ts = nowIso();
    await env.DB.prepare(
      `INSERT INTO media
       (id, uploader_id, room_id, filename, original_name, mime_type, size_bytes, media_type, storage_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'gif', ?, ?)`,
    )
      .bind(
        id,
        claims.sub,
        body.room_id ?? null,
        filename,
        original,
        mime,
        bytes.byteLength,
        storageKey,
        ts,
      )
      .run();

    return json(
      {
        id,
        uploader_id: claims.sub,
        room_id: body.room_id ?? null,
        filename,
        original_name: original,
        mime_type: mime,
        size_bytes: bytes.byteLength,
        media_type: 'gif',
        url: `/v1/media/${id}/file`,
        hash_sha256: '',
        duration_ms: null,
        width: null,
        height: null,
        created_at: ts,
      },
      201,
      request,
    );
  }

  return null;
}
