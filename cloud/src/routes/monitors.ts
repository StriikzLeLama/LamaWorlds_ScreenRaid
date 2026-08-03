import { ApiError, json, nowIso, readJson, type Env } from '../lib/http';
import { requireUser } from '../lib/auth';
import { hubBroadcast, roomMemberIds } from '../lib/db';

interface Monitor {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
  is_primary: boolean;
}

export async function handleMonitors(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (path === '/v1/users/me/monitors' && request.method === 'GET') {
    const claims = await requireUser(env, request);
    const row = await env.DB.prepare(`SELECT * FROM monitor_layouts WHERE user_id = ?`)
      .bind(claims.sub)
      .first<{ monitors: string; updated_at: string }>();
    if (!row) throw new ApiError('Not found', 404);
    return json(
      {
        user_id: claims.sub,
        updated_at: row.updated_at,
        monitors: JSON.parse(row.monitors) as Monitor[],
      },
      200,
      request,
    );
  }

  if (path === '/v1/users/me/monitors' && request.method === 'PUT') {
    const claims = await requireUser(env, request);
    const body = await readJson<{ monitors: Monitor[] }>(request);
    const ts = nowIso();
    await env.DB.prepare(
      `INSERT INTO monitor_layouts (user_id, monitors, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET monitors = excluded.monitors, updated_at = excluded.updated_at`,
    )
      .bind(claims.sub, JSON.stringify(body.monitors ?? []), ts)
      .run();

    // Notify shared rooms
    const { results } = await env.DB.prepare(
      `SELECT room_id FROM room_members WHERE user_id = ?`,
    )
      .bind(claims.sub)
      .all<{ room_id: string }>();
    for (const r of results ?? []) {
      const members = await roomMemberIds(env, r.room_id);
      await hubBroadcast(env, members.filter((id) => id !== claims.sub), {
        type: 'monitor:changed',
        payload: {
          user_id: claims.sub,
          updated_at: ts,
          monitors: body.monitors ?? [],
        },
      });
    }

    return json(
      {
        user_id: claims.sub,
        updated_at: ts,
        monitors: body.monitors ?? [],
      },
      200,
      request,
    );
  }

  const userMatch = path.match(/^\/v1\/users\/([^/]+)\/monitors$/);
  if (userMatch && request.method === 'GET') {
    const claims = await requireUser(env, request);
    const targetId = decodeURIComponent(userMatch[1]!);
    // Must share a room
    const shared = await env.DB.prepare(
      `SELECT 1 AS ok FROM room_members a
       JOIN room_members b ON a.room_id = b.room_id
       WHERE a.user_id = ? AND b.user_id = ? LIMIT 1`,
    )
      .bind(claims.sub, targetId)
      .first();
    if (!shared && claims.sub !== targetId) {
      throw new ApiError('Forbidden', 403);
    }
    const row = await env.DB.prepare(`SELECT * FROM monitor_layouts WHERE user_id = ?`)
      .bind(targetId)
      .first<{ monitors: string; updated_at: string }>();
    if (!row) throw new ApiError('Not found', 404);
    return json(
      {
        user_id: targetId,
        updated_at: row.updated_at,
        monitors: JSON.parse(row.monitors) as Monitor[],
      },
      200,
      request,
    );
  }

  return null;
}
