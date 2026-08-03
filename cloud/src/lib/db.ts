import type { Env } from './http';

export interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  avatar_url: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export function userSummary(u: Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url'>) {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
  };
}

export function userProfile(u: UserRow, isAdmin: boolean) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    created_at: u.created_at,
    is_admin: isAdmin,
  };
}

export async function getUserById(env: Env, id: string): Promise<UserRow | null> {
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export async function getUserByUsername(env: Env, username: string): Promise<UserRow | null> {
  return env.DB.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
    .bind(username)
    .first<UserRow>();
}

export async function hubStub(env: Env) {
  return env.WS_HUB.get(env.WS_HUB.idFromName('global'));
}

export async function hubBroadcast(
  env: Env,
  userIds: string[],
  message: { type: string; payload: unknown; timestamp?: string },
): Promise<void> {
  if (userIds.length === 0) return;
  const stub = await hubStub(env);
  await stub.fetch('https://hub/internal/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_ids: userIds,
      message: {
        type: message.type,
        payload: message.payload,
        timestamp: message.timestamp ?? new Date().toISOString(),
      },
    }),
  });
}

export async function roomMemberIds(env: Env, roomId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    'SELECT user_id FROM room_members WHERE room_id = ?',
  )
    .bind(roomId)
    .all<{ user_id: string }>();
  return (results ?? []).map((r) => r.user_id);
}

export async function assertRoomMember(env: Env, roomId: string, userId: string): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT 1 AS ok FROM room_members WHERE room_id = ? AND user_id = ?',
  )
    .bind(roomId, userId)
    .first();
  if (!row) {
    const { ApiError } = await import('./http');
    throw new ApiError('Not a room member', 403, 'forbidden');
  }
}

/** True if user may download media (owner, room member, or prank-linked room member). */
export async function canAccessMedia(
  env: Env,
  mediaId: string,
  userId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT uploader_id, room_id FROM media WHERE id = ?`,
  )
    .bind(mediaId)
    .first<{ uploader_id: string; room_id: string | null }>();
  if (!row) return false;
  if (row.uploader_id === userId) return true;

  if (row.room_id) {
    const member = await env.DB.prepare(
      `SELECT 1 AS ok FROM room_members WHERE room_id = ? AND user_id = ?`,
    )
      .bind(row.room_id, userId)
      .first();
    if (member) return true;
  }

  const viaPrank = await env.DB.prepare(
    `SELECT 1 AS ok FROM pranks p
     INNER JOIN room_members rm ON rm.room_id = p.room_id AND rm.user_id = ?
     WHERE p.media_id = ?
     LIMIT 1`,
  )
    .bind(userId, mediaId)
    .first();
  return Boolean(viaPrank);
}
