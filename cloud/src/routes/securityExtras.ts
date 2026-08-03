import { ApiError, json, nowIso, readJson, type Env } from '../lib/http';
import { requireUser } from '../lib/auth';

const DEFAULT_PREFS = {
  preset: 'friends',
  allow_sound: true,
  allow_video: true,
  allow_fullscreen: true,
  local_cooldown_ms: 2000,
  max_pranks_per_minute: null as number | null,
  target_cooldown_ms: null as number | null,
  max_duration_ms: null as number | null,
  max_volume: null as number | null,
};

function rowToPrefs(row: Record<string, unknown> | null) {
  if (!row) return { ...DEFAULT_PREFS };
  return {
    preset: String(row.preset ?? 'friends'),
    allow_sound: Number(row.allow_sound ?? 1) !== 0,
    allow_video: Number(row.allow_video ?? 1) !== 0,
    allow_fullscreen: Number(row.allow_fullscreen ?? 1) !== 0,
    local_cooldown_ms: Math.max(0, Number(row.local_cooldown_ms ?? 2000)),
    max_pranks_per_minute:
      row.max_pranks_per_minute == null ? null : Number(row.max_pranks_per_minute),
    target_cooldown_ms:
      row.target_cooldown_ms == null ? null : Number(row.target_cooldown_ms),
    max_duration_ms: row.max_duration_ms == null ? null : Number(row.max_duration_ms),
    max_volume: row.max_volume == null ? null : Number(row.max_volume),
  };
}

export async function handleSecurityExtras(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (path === '/v1/audit/me' && request.method === 'GET') {
    const claims = await requireUser(env, request);
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 20)));
    const offset = (page - 1) * limit;

    const totalRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM audit_log WHERE actor_id = ?`,
    )
      .bind(claims.sub)
      .first<{ c: number }>();

    const { results } = await env.DB.prepare(
      `SELECT id, action, resource_type, resource_id, metadata, actor_username, created_at
       FROM audit_log
       WHERE actor_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(claims.sub, limit, offset)
      .all();

    const items = (results ?? []).map((r) => {
      const row = r as {
        id: string;
        action: string;
        resource_type: string | null;
        resource_id: string | null;
        metadata: string | null;
        actor_username: string | null;
        created_at: string;
      };
      let metadata: unknown = null;
      if (row.metadata) {
        try {
          metadata = JSON.parse(row.metadata);
        } catch {
          metadata = null;
        }
      }
      return {
        id: row.id,
        action: row.action,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        metadata,
        actor_username: row.actor_username,
        created_at: row.created_at,
      };
    });

    return json(
      { items, total: totalRow?.c ?? items.length, page, limit },
      200,
      request,
    );
  }

  if (path === '/v1/users/me/security' && request.method === 'GET') {
    const claims = await requireUser(env, request);
    try {
      const row = await env.DB.prepare(
        `SELECT * FROM user_security_prefs WHERE user_id = ?`,
      )
        .bind(claims.sub)
        .first();
      return json(rowToPrefs(row as Record<string, unknown> | null), 200, request);
    } catch {
      return json({ ...DEFAULT_PREFS }, 200, request);
    }
  }

  if (path === '/v1/users/me/security' && request.method === 'PATCH') {
    const claims = await requireUser(env, request);
    const body = await readJson<Partial<typeof DEFAULT_PREFS>>(request);
    let current = { ...DEFAULT_PREFS };
    try {
      const row = await env.DB.prepare(
        `SELECT * FROM user_security_prefs WHERE user_id = ?`,
      )
        .bind(claims.sub)
        .first();
      current = rowToPrefs(row as Record<string, unknown> | null);
    } catch {
      // table may be missing until migration
    }

    const next = {
      preset: body.preset ?? current.preset,
      allow_sound: body.allow_sound ?? current.allow_sound,
      allow_video: body.allow_video ?? current.allow_video,
      allow_fullscreen: body.allow_fullscreen ?? current.allow_fullscreen,
      local_cooldown_ms: body.local_cooldown_ms ?? current.local_cooldown_ms,
      max_pranks_per_minute:
        body.max_pranks_per_minute !== undefined
          ? body.max_pranks_per_minute
          : current.max_pranks_per_minute,
      target_cooldown_ms:
        body.target_cooldown_ms !== undefined
          ? body.target_cooldown_ms
          : current.target_cooldown_ms,
      max_duration_ms:
        body.max_duration_ms !== undefined ? body.max_duration_ms : current.max_duration_ms,
      max_volume: body.max_volume !== undefined ? body.max_volume : current.max_volume,
    };

    try {
      await env.DB.prepare(
        `INSERT INTO user_security_prefs
         (user_id, preset, allow_sound, allow_video, allow_fullscreen, local_cooldown_ms,
          max_pranks_per_minute, target_cooldown_ms, max_duration_ms, max_volume, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           preset = excluded.preset,
           allow_sound = excluded.allow_sound,
           allow_video = excluded.allow_video,
           allow_fullscreen = excluded.allow_fullscreen,
           local_cooldown_ms = excluded.local_cooldown_ms,
           max_pranks_per_minute = excluded.max_pranks_per_minute,
           target_cooldown_ms = excluded.target_cooldown_ms,
           max_duration_ms = excluded.max_duration_ms,
           max_volume = excluded.max_volume,
           updated_at = excluded.updated_at`,
      )
        .bind(
          claims.sub,
          next.preset,
          next.allow_sound ? 1 : 0,
          next.allow_video ? 1 : 0,
          next.allow_fullscreen ? 1 : 0,
          next.local_cooldown_ms,
          next.max_pranks_per_minute,
          next.target_cooldown_ms,
          next.max_duration_ms,
          next.max_volume,
          nowIso(),
        )
        .run();
    } catch (e) {
      throw new ApiError(
        e instanceof Error ? e.message : 'Failed to save security prefs',
        500,
      );
    }
    return json(next, 200, request);
  }

  return null;
}
