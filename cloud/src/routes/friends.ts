import { ApiError, empty, json, newId, nowIso, readJson, type Env } from '../lib/http';
import { requireUser } from '../lib/auth';
import { getUserById, hubStub, userSummary } from '../lib/db';

async function onlineUserIds(env: Env): Promise<Set<string>> {
  try {
    const stub = await hubStub(env);
    const res = await stub.fetch('https://hub/internal/presence');
    if (!res.ok) return new Set();
    const body = (await res.json()) as { online?: { user_id: string }[] };
    return new Set((body.online ?? []).map((o) => o.user_id));
  } catch {
    return new Set();
  }
}

export async function handleFriends(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (!path.startsWith('/v1/friends')) return null;
  const claims = await requireUser(env, request);

  if (path === '/v1/friends' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT f.id, f.status, f.created_at,
              CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END AS friend_id
       FROM friendships f
       WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'`,
    )
      .bind(claims.sub, claims.sub, claims.sub)
      .all<{ id: string; status: string; created_at: string; friend_id: string }>();

    const online = await onlineUserIds(env);
    const friends = [];
    for (const row of results ?? []) {
      const u = await getUserById(env, row.friend_id);
      if (!u) continue;
      friends.push({
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        status: online.has(u.id) ? 'online' : 'offline',
      });
    }
    return json({ friends }, 200, request);
  }

  if (path === '/v1/friends/requests' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT f.id, f.requester_id, f.addressee_id, f.created_at
       FROM friendships f
       WHERE (f.addressee_id = ? OR f.requester_id = ?) AND f.status = 'pending'`,
    )
      .bind(claims.sub, claims.sub)
      .all<{ id: string; requester_id: string; addressee_id: string; created_at: string }>();

    const incoming = [];
    const outgoing = [];
    for (const row of results ?? []) {
      const otherId = row.addressee_id === claims.sub ? row.requester_id : row.addressee_id;
      const u = await getUserById(env, otherId);
      if (!u) continue;
      const item = {
        id: row.id,
        created_at: row.created_at,
        user: userSummary(u),
      };
      if (row.addressee_id === claims.sub) incoming.push(item);
      else outgoing.push(item);
    }
    return json({ incoming, outgoing }, 200, request);
  }

  if (path === '/v1/friends/request' && request.method === 'POST') {
    const body = await readJson<{ user_id?: string; username?: string }>(request);
    let targetId = body.user_id;
    if (!targetId && body.username) {
      const u = await env.DB.prepare(
        `SELECT id FROM users WHERE username = ? COLLATE NOCASE`,
      )
        .bind(body.username.trim())
        .first<{ id: string }>();
      targetId = u?.id;
    }
    if (!targetId) throw new ApiError('user_id or username required', 400);
    if (targetId === claims.sub) throw new ApiError('Cannot friend yourself', 400);

    const id = newId();
    const ts = nowIso();
    try {
      await env.DB.prepare(
        `INSERT INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`,
      )
        .bind(id, claims.sub, targetId, ts, ts)
        .run();
    } catch {
      throw new ApiError('Friend request already exists', 409, 'conflict');
    }
    return json({ friendship_id: id, status: 'pending' }, 201, request);
  }

  const actionMatch = path.match(/^\/v1\/friends\/([^/]+)\/(accept|decline|block)$/);
  if (actionMatch && request.method === 'POST') {
    const friendshipId = actionMatch[1]!;
    const action = actionMatch[2]!;
    const row = await env.DB.prepare(`SELECT * FROM friendships WHERE id = ?`)
      .bind(friendshipId)
      .first<{
        id: string;
        requester_id: string;
        addressee_id: string;
        status: string;
      }>();
    if (!row) throw new ApiError('Not found', 404);
    if (row.addressee_id !== claims.sub && row.requester_id !== claims.sub) {
      throw new ApiError('Forbidden', 403);
    }
    if (action === 'accept') {
      if (row.addressee_id !== claims.sub) throw new ApiError('Forbidden', 403);
      await env.DB.prepare(
        `UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?`,
      )
        .bind(nowIso(), friendshipId)
        .run();
      return json({ friendship_id: friendshipId, status: 'accepted' }, 200, request);
    }
    if (action === 'decline') {
      await env.DB.prepare(`DELETE FROM friendships WHERE id = ?`).bind(friendshipId).run();
      return empty(204, request);
    }
    if (action === 'block') {
      await env.DB.prepare(
        `UPDATE friendships SET status = 'blocked', updated_at = ? WHERE id = ?`,
      )
        .bind(nowIso(), friendshipId)
        .run();
      return json({ friendship_id: friendshipId, status: 'blocked' }, 200, request);
    }
  }

  const deleteMatch = path.match(/^\/v1\/friends\/([^/]+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    const friendshipId = deleteMatch[1]!;
    await env.DB.prepare(
      `DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)`,
    )
      .bind(friendshipId, claims.sub, claims.sub)
      .run();
    return empty(204, request);
  }

  return null;
}
