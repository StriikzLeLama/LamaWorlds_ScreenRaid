import {
  ApiError,
  empty,
  inviteCode,
  json,
  newId,
  nowIso,
  readJson,
  type Env,
} from '../lib/http';
import { requireUser } from '../lib/auth';
import {
  assertRoomMember,
  getUserById,
  hubBroadcast,
  roomMemberIds,
  userSummary,
} from '../lib/db';

export async function handleRooms(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  // GET /v1/rooms
  if (path === '/v1/rooms' && request.method === 'GET') {
    const claims = await requireUser(env, request);
    const { results } = await env.DB.prepare(
      `SELECT r.id, r.name, r.invite_code, rm.role,
              (SELECT COUNT(*) FROM room_members m WHERE m.room_id = r.id) AS member_count
       FROM rooms r
       JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = ?
       WHERE r.is_active = 1
       ORDER BY r.updated_at DESC`,
    )
      .bind(claims.sub)
      .all<{
        id: string;
        name: string;
        invite_code: string;
        role: string;
        member_count: number;
      }>();
    return json(
      {
        rooms: (results ?? []).map((r) => ({
          ...r,
          is_member: true,
        })),
      },
      200,
      request,
    );
  }

  // POST /v1/rooms
  if (path === '/v1/rooms' && request.method === 'POST') {
    const claims = await requireUser(env, request);
    const body = await readJson<{ name: string }>(request);
    const name = (body.name || '').trim().slice(0, 64);
    if (name.length < 1) throw new ApiError('Room name required', 400);
    const id = newId();
    const code = inviteCode();
    const ts = nowIso();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO rooms (id, name, invite_code, owner_id, max_members, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 20, 1, ?, ?)`,
      ).bind(id, name, code, claims.sub, ts, ts),
      env.DB.prepare(
        `INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`,
      ).bind(id, claims.sub, ts),
    ]);
    return json(
      {
        id,
        name,
        invite_code: code,
        role: 'owner',
        member_count: 1,
        is_member: true,
      },
      201,
      request,
    );
  }

  // POST /v1/rooms/join
  if (path === '/v1/rooms/join' && request.method === 'POST') {
    const claims = await requireUser(env, request);
    const body = await readJson<{
      invite_code?: string;
      room_id?: string;
      invite_token?: string;
    }>(request);

    let room: {
      id: string;
      name: string;
      invite_code: string;
      max_members: number;
    } | null = null;
    let role = 'member';

    if (body.invite_token) {
      const inv = await env.DB.prepare(
        `SELECT * FROM room_invites WHERE token = ? AND is_active = 1`,
      )
        .bind(body.invite_token)
        .first<{
          id: string;
          room_id: string;
          role: string;
          expires_at: string | null;
          max_uses: number;
          use_count: number;
        }>();
      if (!inv) throw new ApiError('Invalid invite', 404, 'not_found');
      if (inv.expires_at && inv.expires_at < nowIso()) {
        throw new ApiError('Invite expired', 410, 'expired');
      }
      if (inv.use_count >= inv.max_uses) {
        throw new ApiError('Invite exhausted', 410, 'exhausted');
      }
      room = await env.DB.prepare(
        `SELECT id, name, invite_code, max_members FROM rooms WHERE id = ? AND is_active = 1`,
      )
        .bind(inv.room_id)
        .first();
      role = inv.role || 'guest';
      await env.DB.prepare(
        `UPDATE room_invites SET use_count = use_count + 1 WHERE id = ?`,
      )
        .bind(inv.id)
        .run();
    } else if (body.room_id) {
      room = await env.DB.prepare(
        `SELECT id, name, invite_code, max_members FROM rooms WHERE id = ? AND is_active = 1`,
      )
        .bind(body.room_id)
        .first();
    } else if (body.invite_code) {
      room = await env.DB.prepare(
        `SELECT id, name, invite_code, max_members FROM rooms
         WHERE invite_code = ? COLLATE NOCASE AND is_active = 1`,
      )
        .bind(body.invite_code.trim())
        .first();
    } else {
      throw new ApiError('invite_code, room_id or invite_token required', 400);
    }

    if (!room) throw new ApiError('Room not found', 404, 'not_found');

    const existing = await env.DB.prepare(
      `SELECT role FROM room_members WHERE room_id = ? AND user_id = ?`,
    )
      .bind(room.id, claims.sub)
      .first<{ role: string }>();
    if (existing) {
      return json(
        {
          id: room.id,
          name: room.name,
          invite_code: room.invite_code,
          role: existing.role,
          member_count: (await roomMemberIds(env, room.id)).length,
          is_member: true,
        },
        200,
        request,
      );
    }

    const count = (await roomMemberIds(env, room.id)).length;
    if (count >= room.max_members) throw new ApiError('Room full', 409, 'full');

    await env.DB.prepare(
      `INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`,
    )
      .bind(room.id, claims.sub, role, nowIso())
      .run();

    const user = await getUserById(env, claims.sub);
    if (user) {
      await hubBroadcast(env, await roomMemberIds(env, room.id), {
        type: 'room:member_joined',
        payload: {
          room_id: room.id,
          member: { ...userSummary(user), role },
        },
      });
    }

    return json(
      {
        id: room.id,
        name: room.name,
        invite_code: room.invite_code,
        role,
        member_count: count + 1,
        is_member: true,
      },
      200,
      request,
    );
  }

  const roomMatch = path.match(/^\/v1\/rooms\/([^/]+)(.*)$/);
  if (!roomMatch) return null;
  const roomId = decodeURIComponent(roomMatch[1]!);
  const rest = roomMatch[2] || '';

  // GET /v1/rooms/:id
  if (rest === '' && request.method === 'GET') {
    const claims = await requireUser(env, request);
    await assertRoomMember(env, roomId, claims.sub);
    const room = await env.DB.prepare(
      `SELECT id, name, invite_code, owner_id, max_members FROM rooms WHERE id = ?`,
    )
      .bind(roomId)
      .first<{
        id: string;
        name: string;
        invite_code: string;
        owner_id: string;
        max_members: number;
      }>();
    if (!room) throw new ApiError('Not found', 404);

    const { results } = await env.DB.prepare(
      `SELECT rm.user_id, u.username, u.display_name, rm.role,
              COALESCE(c.global_consent, 0) AS global_consent,
              COALESCE(c.is_paused, 0) AS is_paused,
              COALESCE(c.room_consents, '{}') AS room_consents
       FROM room_members rm
       JOIN users u ON u.id = rm.user_id
       LEFT JOIN user_consent c ON c.user_id = rm.user_id
       WHERE rm.room_id = ?`,
    )
      .bind(roomId)
      .all<{
        user_id: string;
        username: string;
        display_name: string;
        role: string;
        global_consent: number;
        is_paused: number;
        room_consents: string;
      }>();

    const members = (results ?? []).map((m) => {
      let roomConsents: Record<string, boolean> = {};
      try {
        roomConsents = JSON.parse(m.room_consents) as Record<string, boolean>;
      } catch {
        roomConsents = {};
      }
      const roomOk = roomConsents[roomId] !== false;
      let consent_status = 'denied';
      if (m.global_consent && !m.is_paused && roomOk) consent_status = 'granted';
      else if (m.is_paused) consent_status = 'paused';
      return {
        user_id: m.user_id,
        username: m.username,
        display_name: m.display_name,
        role: m.role,
        consent_status,
        presence: 'offline',
      };
    });

    return json({ ...room, members }, 200, request);
  }

  // DELETE /v1/rooms/:id
  if (rest === '' && request.method === 'DELETE') {
    const claims = await requireUser(env, request);
    const room = await env.DB.prepare(`SELECT owner_id FROM rooms WHERE id = ?`)
      .bind(roomId)
      .first<{ owner_id: string }>();
    if (!room) throw new ApiError('Not found', 404);
    if (room.owner_id !== claims.sub) throw new ApiError('Forbidden', 403, 'forbidden');
    await env.DB.prepare(`UPDATE rooms SET is_active = 0, updated_at = ? WHERE id = ?`)
      .bind(nowIso(), roomId)
      .run();
    return empty(204, request);
  }

  // POST /v1/rooms/:id/leave
  if (rest === '/leave' && request.method === 'POST') {
    const claims = await requireUser(env, request);
    await env.DB.prepare(
      `DELETE FROM room_members WHERE room_id = ? AND user_id = ?`,
    )
      .bind(roomId, claims.sub)
      .run();
    return empty(204, request);
  }

  // POST /v1/rooms/:id/invites
  if (rest === '/invites' && request.method === 'POST') {
    const claims = await requireUser(env, request);
    await assertRoomMember(env, roomId, claims.sub);
    const body = await readJson<{
      role?: string;
      expires_in_hours?: number;
      max_uses?: number;
    }>(request);
    const id = newId();
    const token = newId().replace(/-/g, '');
    const hours = body.expires_in_hours ?? 24;
    const expiresAt =
      hours > 0 ? new Date(Date.now() + hours * 3600_000).toISOString() : null;
    const ts = nowIso();
    await env.DB.prepare(
      `INSERT INTO room_invites
       (id, room_id, token, role, created_by, expires_at, max_uses, use_count, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`,
    )
      .bind(
        id,
        roomId,
        token,
        body.role ?? 'guest',
        claims.sub,
        expiresAt,
        body.max_uses ?? 1,
        ts,
      )
      .run();
    return json(
      {
        id,
        room_id: roomId,
        token,
        role: body.role ?? 'guest',
        expires_at: expiresAt,
        max_uses: body.max_uses ?? 1,
        use_count: 0,
        is_active: true,
        created_at: ts,
      },
      201,
      request,
    );
  }

  // GET /v1/rooms/:id/invites
  if (rest === '/invites' && request.method === 'GET') {
    const claims = await requireUser(env, request);
    await assertRoomMember(env, roomId, claims.sub);
    const { results } = await env.DB.prepare(
      `SELECT * FROM room_invites WHERE room_id = ? ORDER BY created_at DESC`,
    )
      .bind(roomId)
      .all();
    return json({ invites: results ?? [] }, 200, request);
  }

  return null;
}
