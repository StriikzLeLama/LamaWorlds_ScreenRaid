import { ApiError, empty, json, newId, nowIso, readJson, type Env } from '../lib/http';
import { requireUser } from '../lib/auth';
import { assertRoomMember, getUserById, hubBroadcast, userSummary } from '../lib/db';
import { deliverPrank } from '../lib/prankDelivery';
import { assertPrankSendAllowed } from '../lib/raidLimits';

interface SendPrankBody {
  target_id: string | null;
  media_id: string | null;
  overlay_type: string;
  text_content: string | null;
  duration_ms: number;
  config: unknown;
}

async function deliverSelfTest(
  env: Env,
  userId: string,
  body: SendPrankBody,
): Promise<{ id: string; expires_at: string; created_at: string }> {
  const duration = Math.min(Math.max(body.duration_ms || 4000, 500), 60_000);
  const id = newId();
  const ts = nowIso();
  const expiresAt = new Date(Date.now() + duration).toISOString();
  const sender = await getUserById(env, userId);
  if (!sender) throw new ApiError('Not found', 404);

  let mediaPayload: {
    id: string;
    url: string;
    mime_type: string;
    hash_sha256: string;
  } | null = null;
  if (body.media_id) {
    const media = await env.DB.prepare(`SELECT * FROM media WHERE id = ?`)
      .bind(body.media_id)
      .first<{ id: string; mime_type: string; hash_sha256: string | null; uploader_id: string }>();
    if (!media || media.uploader_id !== userId) {
      throw new ApiError('media not found', 404);
    }
    mediaPayload = {
      id: media.id,
      url: `/v1/media/${media.id}/file`,
      mime_type: media.mime_type,
      hash_sha256: media.hash_sha256 ?? '',
    };
  }

  await hubBroadcast(env, [userId], {
    type: 'prank:incoming',
    payload: {
      prank_id: id,
      room_id: 'self-test',
      self_test: true,
      sender: userSummary(sender),
      overlay_type: body.overlay_type || 'text',
      media: mediaPayload,
      text_content: body.text_content ?? 'ScreenRaid self-test',
      duration_ms: duration,
      config: body.config ?? {
        animation: 'pop',
        position: { monitor_index: 0, x: 0.5, y: 0.5, preset: 'center' },
        scale: 1,
        opacity: 1,
        volume: 0.8,
        sfx: 'none',
      },
      expires_at: expiresAt,
    },
  });

  return { id, expires_at: expiresAt, created_at: ts };
}

export async function handlePranks(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (path === '/v1/pranks/self-test' && request.method === 'POST') {
    const claims = await requireUser(env, request);
    const body = await readJson<SendPrankBody>(request);
    const result = await deliverSelfTest(env, claims.sub, body);
    return json(
      {
        id: result.id,
        room_id: 'self-test',
        status: 'delivered',
        expires_at: result.expires_at,
        created_at: result.created_at,
      },
      201,
      request,
    );
  }

  const sendMatch = path.match(/^\/v1\/rooms\/([^/]+)\/pranks$/);
  if (sendMatch && request.method === 'POST') {
    const roomId = decodeURIComponent(sendMatch[1]!);
    const claims = await requireUser(env, request);
    await assertRoomMember(env, roomId, claims.sub);
    const body = await readJson<SendPrankBody>(request);

    if (body.target_id && body.target_id === claims.sub) {
      const result = await deliverSelfTest(env, claims.sub, body);
      return json(
        {
          id: result.id,
          room_id: 'self-test',
          status: 'delivered',
          expires_at: result.expires_at,
          created_at: result.created_at,
        },
        201,
        request,
      );
    }

    const duration = Math.min(Math.max(body.duration_ms || 5000, 500), 120_000);
    const limits = await assertPrankSendAllowed(env, claims.sub, roomId, body.target_id);
    const cappedDuration = Math.min(duration, limits.max_duration_ms);
    const id = newId();
    const ts = nowIso();
    const expiresAt = new Date(Date.now() + cappedDuration).toISOString();

    await env.DB.prepare(
      `INSERT INTO pranks
       (id, room_id, sender_id, target_id, media_id, overlay_type, text_content, config, duration_ms, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
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
        cappedDuration,
        ts,
        expiresAt,
      )
      .run();

    const delivered = await deliverPrank(env, {
      id,
      room_id: roomId,
      sender_id: claims.sub,
      target_id: body.target_id,
      media_id: body.media_id,
      overlay_type: body.overlay_type,
      text_content: body.text_content,
      config: body.config,
      duration_ms: cappedDuration,
      expires_at: expiresAt,
    });

    return json(
      {
        id,
        room_id: roomId,
        status: delivered > 0 ? 'delivered' : 'blocked',
        expires_at: expiresAt,
        created_at: ts,
      },
      201,
      request,
    );
  }

  if (sendMatch && request.method === 'GET') {
    const roomId = decodeURIComponent(sendMatch[1]!);
    const claims = await requireUser(env, request);
    await assertRoomMember(env, roomId, claims.sub);
    const { results } = await env.DB.prepare(
      `SELECT id, sender_id, target_id, overlay_type, status, created_at
       FROM pranks WHERE room_id = ? ORDER BY created_at DESC LIMIT 20`,
    )
      .bind(roomId)
      .all();
    return json({ items: results ?? [] }, 200, request);
  }

  const ackMatch = path.match(/^\/v1\/rooms\/([^/]+)\/pranks\/([^/]+)\/ack$/);
  if (ackMatch && request.method === 'POST') {
    const claims = await requireUser(env, request);
    const prankId = ackMatch[2]!;
    await env.DB.prepare(
      `UPDATE pranks SET status = 'acked' WHERE id = ? AND (target_id = ? OR target_id IS NULL)`,
    )
      .bind(prankId, claims.sub)
      .run();
    return empty(204, request);
  }

  if (path.match(/^\/v1\/pranks\/[^/]+\/ack$/) && request.method === 'POST') {
    await requireUser(env, request);
    return empty(204, request);
  }

  return null;
}
