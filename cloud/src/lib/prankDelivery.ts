import { getUserById, hubBroadcast, roomMemberIds, userSummary } from './db';
import { nowIso, type Env } from './http';

/**
 * Consent gate + fan-out for room pranks.
 * Each target is checked individually; blocked targets notify the sender via `prank:blocked`.
 */
async function canReceive(env: Env, userId: string, roomId: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT * FROM user_consent WHERE user_id = ?`)
    .bind(userId)
    .first<{
      global_consent: number;
      is_paused: number;
      room_consents: string;
    }>();
  if (!row || !row.global_consent || row.is_paused) return false;
  try {
    const map = JSON.parse(row.room_consents) as Record<string, boolean>;
    if (map[roomId] === false) return false;
  } catch {
    // ignore
  }
  return true;
}

export interface DeliverPrankInput {
  id: string;
  room_id: string;
  sender_id: string;
  target_id: string | null;
  media_id: string | null;
  overlay_type: string;
  text_content: string | null;
  config: unknown;
  duration_ms: number;
  expires_at: string;
}

export async function deliverPrank(env: Env, prank: DeliverPrankInput): Promise<number> {
  const sender = await getUserById(env, prank.sender_id);
  if (!sender) return 0;

  let mediaPayload: {
    id: string;
    url: string;
    mime_type: string;
    hash_sha256: string;
  } | null = null;
  if (prank.media_id) {
    const media = await env.DB.prepare(`SELECT * FROM media WHERE id = ?`)
      .bind(prank.media_id)
      .first<{ id: string; mime_type: string; hash_sha256: string | null }>();
    if (media) {
      mediaPayload = {
        id: media.id,
        url: `/v1/media/${media.id}/file`,
        mime_type: media.mime_type,
        hash_sha256: media.hash_sha256 ?? '',
      };
    }
  }

  const members = await roomMemberIds(env, prank.room_id);
  const targets = prank.target_id
    ? members.filter((id) => id === prank.target_id)
    : members.filter((id) => id !== prank.sender_id);

  let delivered = 0;
  for (const targetId of targets) {
    if (!(await canReceive(env, targetId, prank.room_id))) {
      await hubBroadcast(env, [prank.sender_id], {
        type: 'prank:blocked',
        payload: {
          prank_id: prank.id,
          room_id: prank.room_id,
          target_id: targetId,
          reason: 'no_consent',
        },
      });
      continue;
    }
    delivered += 1;
    await hubBroadcast(env, [targetId], {
      type: 'prank:incoming',
      payload: {
        prank_id: prank.id,
        room_id: prank.room_id,
        sender: userSummary(sender),
        overlay_type: prank.overlay_type,
        media: mediaPayload,
        text_content: prank.text_content,
        duration_ms: prank.duration_ms,
        config: prank.config,
        expires_at: prank.expires_at,
      },
    });
  }

  if (delivered > 0) {
    await env.DB.prepare(
      `UPDATE pranks SET status = 'delivered', delivered_at = ? WHERE id = ?`,
    )
      .bind(nowIso(), prank.id)
      .run();
  }

  await hubBroadcast(env, [prank.sender_id], {
    type: 'prank:sent',
    payload: {
      prank_id: prank.id,
      room_id: prank.room_id,
      delivered_count: delivered,
    },
  });

  return delivered;
}

export async function fireScheduledRow(
  env: Env,
  row: {
    id: string;
    room_id: string;
    sender_id: string;
    target_id: string | null;
    media_id: string | null;
    overlay_type: string;
    text_content: string | null;
    config: string;
    duration_ms: number;
  },
): Promise<void> {
  const prankId = crypto.randomUUID();
  const ts = nowIso();
  const expiresAt = new Date(Date.now() + row.duration_ms).toISOString();
  let config: unknown = {};
  try {
    config = JSON.parse(row.config);
  } catch {
    config = {};
  }

  await env.DB.prepare(
    `INSERT INTO pranks
     (id, room_id, sender_id, target_id, media_id, overlay_type, text_content, config, duration_ms, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(
      prankId,
      row.room_id,
      row.sender_id,
      row.target_id,
      row.media_id,
      row.overlay_type,
      row.text_content,
      row.config,
      row.duration_ms,
      ts,
      expiresAt,
    )
    .run();

  try {
    await deliverPrank(env, {
      id: prankId,
      room_id: row.room_id,
      sender_id: row.sender_id,
      target_id: row.target_id,
      media_id: row.media_id,
      overlay_type: row.overlay_type,
      text_content: row.text_content,
      config,
      duration_ms: row.duration_ms,
      expires_at: expiresAt,
    });
    await env.DB.prepare(
      `UPDATE scheduled_pranks SET status = 'fired', fired_at = ? WHERE id = ?`,
    )
      .bind(ts, row.id)
      .run();
  } catch {
    await env.DB.prepare(
      `UPDATE scheduled_pranks SET status = 'failed', fired_at = ? WHERE id = ?`,
    )
      .bind(ts, row.id)
      .run();
  }
}

export async function fireDueScheduled(env: Env): Promise<number> {
  const now = nowIso();
  const { results } = await env.DB.prepare(
    `SELECT * FROM scheduled_pranks
     WHERE status = 'pending' AND trigger_type = 'at_time' AND run_at IS NOT NULL AND run_at <= ?
     LIMIT 50`,
  )
    .bind(now)
    .all<{
      id: string;
      room_id: string;
      sender_id: string;
      target_id: string | null;
      media_id: string | null;
      overlay_type: string;
      text_content: string | null;
      config: string;
      duration_ms: number;
    }>();

  let n = 0;
  for (const row of results ?? []) {
    await fireScheduledRow(env, row);
    n += 1;
  }
  return n;
}

export async function fireOnOnline(env: Env, userId: string): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM scheduled_pranks
     WHERE status = 'pending' AND trigger_type = 'on_online' AND online_user_id = ?
     LIMIT 20`,
  )
    .bind(userId)
    .all<{
      id: string;
      room_id: string;
      sender_id: string;
      target_id: string | null;
      media_id: string | null;
      overlay_type: string;
      text_content: string | null;
      config: string;
      duration_ms: number;
    }>();

  let n = 0;
  for (const row of results ?? []) {
    await fireScheduledRow(env, row);
    n += 1;
  }
  return n;
}
