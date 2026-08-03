import { ApiError, empty, json, newId, nowIso, readJson, type Env } from '../lib/http';
import { hashPassword, isAdminUsername, requireUser } from '../lib/auth';
import { getUserById } from '../lib/db';
import { hubStub } from '../lib/db';

async function requireAdmin(env: Env, request: Request) {
  const claims = await requireUser(env, request);
  const user = await getUserById(env, claims.sub);
  if (!user || !isAdminUsername(env, user.username)) {
    throw new ApiError('Forbidden', 403, 'forbidden');
  }
  return { claims, user };
}

function pageLimit(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));
  return { page, limit, offset: (page - 1) * limit };
}

export async function handleAdmin(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (!path.startsWith('/v1/admin')) return null;
  await requireAdmin(env, request);
  const url = new URL(request.url);

  if (path === '/v1/admin/stats' && request.method === 'GET') {
    const usersTotal = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users`).first<{ c: number }>();
    const usersActive = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM users WHERE is_active = 1`,
    ).first<{ c: number }>();
    const roomsActive = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM rooms WHERE is_active = 1`,
    ).first<{ c: number }>();
    const mediaTotal = await env.DB.prepare(`SELECT COUNT(*) AS c FROM media`).first<{ c: number }>();
    let online_count = 0;
    try {
      const stub = await hubStub(env);
      const res = await stub.fetch('https://hub/internal/online-count');
      const data = (await res.json()) as { count?: number };
      online_count = data.count ?? 0;
    } catch {
      online_count = 0;
    }
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const fail = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM audit_log WHERE action = 'login_failed' AND created_at >= ?`,
    )
      .bind(since)
      .first<{ c: number }>();
    const ok = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM audit_log WHERE action = 'login_success' AND created_at >= ?`,
    )
      .bind(since)
      .first<{ c: number }>();
    return json(
      {
        users_total: usersTotal?.c ?? 0,
        users_active: usersActive?.c ?? 0,
        users_inactive: (usersTotal?.c ?? 0) - (usersActive?.c ?? 0),
        rooms_active: roomsActive?.c ?? 0,
        media_total: mediaTotal?.c ?? 0,
        online_count,
        login_failed_24h: fail?.c ?? 0,
        login_success_24h: ok?.c ?? 0,
      },
      200,
      request,
    );
  }

  if (path === '/v1/admin/users' && request.method === 'GET') {
    const { page, limit, offset } = pageLimit(url);
    const total = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users`).first<{ c: number }>();
    const { results } = await env.DB.prepare(
      `SELECT id, username, email, display_name, is_active, created_at
       FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(limit, offset)
      .all();
    return json(
      {
        users: (results ?? []).map((u) => ({
          ...u,
          is_active: !!(u as { is_active: number }).is_active,
        })),
        total: total?.c ?? 0,
        page,
        limit,
      },
      200,
      request,
    );
  }

  const userAction = path.match(
    /^\/v1\/admin\/users\/([^/]+)(?:\/(reactivate|password|revoke-sessions|disable-2fa))?$/,
  );
  if (userAction) {
    const userId = decodeURIComponent(userAction[1]!);
    const action = userAction[2];

    if (!action && request.method === 'DELETE') {
      await env.DB.prepare(`UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?`)
        .bind(nowIso(), userId)
        .run();
      return empty(204, request);
    }
    if (action === 'reactivate' && request.method === 'POST') {
      await env.DB.prepare(`UPDATE users SET is_active = 1, updated_at = ? WHERE id = ?`)
        .bind(nowIso(), userId)
        .run();
      return empty(204, request);
    }
    if (action === 'password' && request.method === 'POST') {
      const body = await readJson<{ new_password: string }>(request);
      if (!body.new_password || body.new_password.length < 8) {
        throw new ApiError('Password too short', 400);
      }
      const hash = await hashPassword(body.new_password);
      await env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
        .bind(hash, nowIso(), userId)
        .run();
      return empty(204, request);
    }
    if (action === 'revoke-sessions' && request.method === 'POST') {
      await env.DB.prepare(
        `UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
      )
        .bind(nowIso(), userId)
        .run();
      return empty(204, request);
    }
    if (action === 'disable-2fa' && request.method === 'POST') {
      await env.DB.prepare(`DELETE FROM user_totp WHERE user_id = ?`).bind(userId).run();
      return empty(204, request);
    }
  }

  if (path === '/v1/admin/media' && request.method === 'GET') {
    const { page, limit, offset } = pageLimit(url);
    const total = await env.DB.prepare(`SELECT COUNT(*) AS c FROM media`).first<{ c: number }>();
    const { results } = await env.DB.prepare(
      `SELECT m.*, u.username AS uploader_username
       FROM media m JOIN users u ON u.id = m.uploader_id
       ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(limit, offset)
      .all();
    return json(
      {
        items: (results ?? []).map((m) => {
          const row = m as { id: string; uploader_username: string };
          return {
            ...row,
            url: `/v1/media/${row.id}/file`,
            uploader_username: row.uploader_username,
          };
        }),
        total: total?.c ?? 0,
        page,
        limit,
      },
      200,
      request,
    );
  }

  const mediaDel = path.match(/^\/v1\/admin\/media\/([^/]+)$/);
  if (mediaDel && request.method === 'DELETE') {
    const id = decodeURIComponent(mediaDel[1]!);
    const row = await env.DB.prepare(`SELECT storage_key FROM media WHERE id = ?`)
      .bind(id)
      .first<{ storage_key: string }>();
    if (!row) throw new ApiError('Not found', 404);
    await env.MEDIA.delete(row.storage_key);
    await env.DB.prepare(`DELETE FROM media WHERE id = ?`).bind(id).run();
    return empty(204, request);
  }

  if (path === '/v1/admin/rooms' && request.method === 'GET') {
    const { page, limit, offset } = pageLimit(url);
    const total = await env.DB.prepare(`SELECT COUNT(*) AS c FROM rooms`).first<{ c: number }>();
    const { results } = await env.DB.prepare(
      `SELECT r.id, r.name, r.invite_code, r.owner_id, r.is_active, r.created_at,
              u.username AS owner_username,
              (SELECT COUNT(*) FROM room_members m WHERE m.room_id = r.id) AS member_count
       FROM rooms r JOIN users u ON u.id = r.owner_id
       ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(limit, offset)
      .all();
    return json(
      {
        rooms: (results ?? []).map((r) => ({
          ...r,
          is_active: !!(r as { is_active: number }).is_active,
        })),
        total: total?.c ?? 0,
        page,
        limit,
      },
      200,
      request,
    );
  }

  const roomDel = path.match(/^\/v1\/admin\/rooms\/([^/]+)$/);
  if (roomDel && request.method === 'DELETE') {
    await env.DB.prepare(`UPDATE rooms SET is_active = 0, updated_at = ? WHERE id = ?`)
      .bind(nowIso(), decodeURIComponent(roomDel[1]!))
      .run();
    return empty(204, request);
  }

  if (path === '/v1/admin/presence' && request.method === 'GET') {
    try {
      const stub = await hubStub(env);
      const res = await stub.fetch('https://hub/internal/presence');
      const data = (await res.json()) as {
        online: Array<{ user_id: string; session_count: number }>;
        online_count: number;
      };
      const online = [];
      for (const row of data.online ?? []) {
        const u = await getUserById(env, row.user_id);
        online.push({
          user_id: row.user_id,
          username: u?.username ?? '',
          display_name: u?.display_name ?? '',
          session_count: row.session_count,
        });
      }
      return json({ online, online_count: online.length }, 200, request);
    } catch {
      return json({ online: [], online_count: 0 }, 200, request);
    }
  }

  if (path === '/v1/admin/audit' && request.method === 'GET') {
    const { page, limit, offset } = pageLimit(url);
    const total = await env.DB.prepare(`SELECT COUNT(*) AS c FROM audit_log`).first<{ c: number }>();
    const { results } = await env.DB.prepare(
      `SELECT id, action, resource_type, resource_id, actor_username, ip_address, metadata, created_at
       FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(limit, offset)
      .all();
    return json(
      {
        items: (results ?? []).map((a) => {
          const row = a as { metadata: string | null };
          let metadata: unknown = null;
          try {
            metadata = row.metadata ? JSON.parse(row.metadata) : null;
          } catch {
            metadata = null;
          }
          return { ...row, metadata };
        }),
        total: total?.c ?? 0,
        page,
        limit,
      },
      200,
      request,
    );
  }

  void newId;
  throw new ApiError('Not found', 404);
}
