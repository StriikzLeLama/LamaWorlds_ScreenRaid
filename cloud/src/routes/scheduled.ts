import { ApiError, empty, json, newId, nowIso, readJson, type Env } from '../lib/http';
import { requireUser } from '../lib/auth';
import { assertRoomMember } from '../lib/db';
import { fireScheduledRow } from '../lib/prankDelivery';

interface ScheduleBody {
  target_id: string | null;
  media_id: string | null;
  overlay_type: string;
  text_content: string | null;
  duration_ms: number;
  config: unknown;
  trigger_type: 'at_time' | 'on_online';
  run_at?: string | null;
  online_user_id?: string | null;
}

export async function handleScheduled(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  const listMatch = path.match(/^\/v1\/rooms\/([^/]+)\/scheduled$/);
  if (listMatch && request.method === 'POST') {
    const roomId = decodeURIComponent(listMatch[1]!);
    const claims = await requireUser(env, request);
    await assertRoomMember(env, roomId, claims.sub);
    const body = await readJson<ScheduleBody>(request);
    if (body.trigger_type !== 'at_time' && body.trigger_type !== 'on_online') {
      throw new ApiError('Invalid trigger_type', 400);
    }
    if (body.trigger_type === 'at_time' && !body.run_at) {
      throw new ApiError('run_at required', 400);
    }
    if (body.trigger_type === 'on_online' && !body.online_user_id) {
      throw new ApiError('online_user_id required', 400);
    }

    const id = newId();
    const ts = nowIso();
    const duration = Math.min(Math.max(body.duration_ms || 5000, 500), 120_000);
    await env.DB.prepare(
      `INSERT INTO scheduled_pranks
       (id, room_id, sender_id, target_id, media_id, overlay_type, text_content, config,
        duration_ms, trigger_type, run_at, online_user_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
      .bind(
        id,
        roomId,
        claims.sub,
        body.target_id,
        body.media_id,
        body.overlay_type,
        body.text_content,
        JSON.stringify(body.config ?? {}),
        duration,
        body.trigger_type,
        body.run_at ?? null,
        body.online_user_id ?? null,
        ts,
      )
      .run();

    // If already due, fire immediately
    if (body.trigger_type === 'at_time' && body.run_at && body.run_at <= ts) {
      const row = await env.DB.prepare(`SELECT * FROM scheduled_pranks WHERE id = ?`)
        .bind(id)
        .first<{
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
      if (row) await fireScheduledRow(env, row);
    }

    return json(
      {
        id,
        room_id: roomId,
        trigger_type: body.trigger_type,
        run_at: body.run_at ?? null,
        online_user_id: body.online_user_id ?? null,
        status: 'pending',
        created_at: ts,
      },
      201,
      request,
    );
  }

  if (listMatch && request.method === 'GET') {
    const roomId = decodeURIComponent(listMatch[1]!);
    const claims = await requireUser(env, request);
    await assertRoomMember(env, roomId, claims.sub);
    const { results } = await env.DB.prepare(
      `SELECT id, room_id, sender_id, target_id, trigger_type, run_at, online_user_id,
              status, created_at, fired_at, overlay_type, text_content
       FROM scheduled_pranks WHERE room_id = ?
       ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(roomId)
      .all();
    return json({ items: results ?? [] }, 200, request);
  }

  const cancelMatch = path.match(/^\/v1\/rooms\/([^/]+)\/scheduled\/([^/]+)$/);
  if (cancelMatch && request.method === 'DELETE') {
    const roomId = decodeURIComponent(cancelMatch[1]!);
    const schedId = decodeURIComponent(cancelMatch[2]!);
    const claims = await requireUser(env, request);
    await assertRoomMember(env, roomId, claims.sub);
    const row = await env.DB.prepare(
      `SELECT sender_id, status FROM scheduled_pranks WHERE id = ? AND room_id = ?`,
    )
      .bind(schedId, roomId)
      .first<{ sender_id: string; status: string }>();
    if (!row) throw new ApiError('Not found', 404);
    if (row.sender_id !== claims.sub) throw new ApiError('Forbidden', 403);
    if (row.status !== 'pending') throw new ApiError('Already resolved', 409);
    await env.DB.prepare(
      `UPDATE scheduled_pranks SET status = 'cancelled', fired_at = ? WHERE id = ?`,
    )
      .bind(nowIso(), schedId)
      .run();
    return empty(204, request);
  }

  return null;
}
