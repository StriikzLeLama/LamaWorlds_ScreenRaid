import { ApiError, json, nowIso, readJson, type Env } from '../lib/http';
import { requireUser } from '../lib/auth';

interface ConsentRow {
  user_id: string;
  global_consent: number;
  is_paused: number;
  room_consents: string;
  consented_at: string | null;
  updated_at: string;
}

function toState(row: ConsentRow) {
  let room_consents: Record<string, boolean> = {};
  try {
    room_consents = JSON.parse(row.room_consents) as Record<string, boolean>;
  } catch {
    room_consents = {};
  }
  return {
    global_consent: !!row.global_consent,
    is_paused: !!row.is_paused,
    room_consents,
    consented_at: row.consented_at,
    updated_at: row.updated_at,
  };
}

async function getOrCreate(env: Env, userId: string): Promise<ConsentRow> {
  let row = await env.DB.prepare(`SELECT * FROM user_consent WHERE user_id = ?`)
    .bind(userId)
    .first<ConsentRow>();
  if (!row) {
    const ts = nowIso();
    await env.DB.prepare(
      `INSERT INTO user_consent (user_id, global_consent, is_paused, room_consents, consented_at, updated_at)
       VALUES (?, 0, 0, '{}', NULL, ?)`,
    )
      .bind(userId, ts)
      .run();
    row = {
      user_id: userId,
      global_consent: 0,
      is_paused: 0,
      room_consents: '{}',
      consented_at: null,
      updated_at: ts,
    };
  }
  return row;
}

export async function handleConsent(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (!path.startsWith('/v1/consent')) return null;
  const claims = await requireUser(env, request);

  if (path === '/v1/consent' && request.method === 'GET') {
    return json(toState(await getOrCreate(env, claims.sub)), 200, request);
  }

  if (path === '/v1/consent/grant' && request.method === 'POST') {
    const ts = nowIso();
    await getOrCreate(env, claims.sub);
    await env.DB.prepare(
      `UPDATE user_consent SET global_consent = 1, consented_at = COALESCE(consented_at, ?), updated_at = ?
       WHERE user_id = ?`,
    )
      .bind(ts, ts, claims.sub)
      .run();
    return json(toState(await getOrCreate(env, claims.sub)), 200, request);
  }

  if (path === '/v1/consent/revoke' && request.method === 'POST') {
    const ts = nowIso();
    await getOrCreate(env, claims.sub);
    await env.DB.prepare(
      `UPDATE user_consent SET global_consent = 0, updated_at = ? WHERE user_id = ?`,
    )
      .bind(ts, claims.sub)
      .run();
    return json(toState(await getOrCreate(env, claims.sub)), 200, request);
  }

  if (path === '/v1/consent/pause' && request.method === 'POST') {
    const ts = nowIso();
    await getOrCreate(env, claims.sub);
    await env.DB.prepare(
      `UPDATE user_consent SET is_paused = 1, updated_at = ? WHERE user_id = ?`,
    )
      .bind(ts, claims.sub)
      .run();
    return json(toState(await getOrCreate(env, claims.sub)), 200, request);
  }

  if (path === '/v1/consent/resume' && request.method === 'POST') {
    const ts = nowIso();
    await getOrCreate(env, claims.sub);
    await env.DB.prepare(
      `UPDATE user_consent SET is_paused = 0, updated_at = ? WHERE user_id = ?`,
    )
      .bind(ts, claims.sub)
      .run();
    return json(toState(await getOrCreate(env, claims.sub)), 200, request);
  }

  const roomMatch = path.match(/^\/v1\/consent\/rooms\/([^/]+)$/);
  if (roomMatch && request.method === 'PATCH') {
    const roomId = decodeURIComponent(roomMatch[1]!);
    const body = await readJson<{ consented: boolean }>(request);
    const row = await getOrCreate(env, claims.sub);
    let map: Record<string, boolean> = {};
    try {
      map = JSON.parse(row.room_consents) as Record<string, boolean>;
    } catch {
      map = {};
    }
    map[roomId] = !!body.consented;
    const ts = nowIso();
    await env.DB.prepare(
      `UPDATE user_consent SET room_consents = ?, updated_at = ? WHERE user_id = ?`,
    )
      .bind(JSON.stringify(map), ts, claims.sub)
      .run();
    return json(toState(await getOrCreate(env, claims.sub)), 200, request);
  }

  const checkMatch = path.match(/^\/v1\/consent\/rooms\/([^/]+)\/check$/);
  if (checkMatch && request.method === 'GET') {
    const roomId = decodeURIComponent(checkMatch[1]!);
    const url = new URL(request.url);
    const targetId = url.searchParams.get('user_id') ?? claims.sub;
    const row = await getOrCreate(env, targetId);
    const state = toState(row);
    const roomOk = state.room_consents[roomId] !== false;
    const can_receive = state.global_consent && !state.is_paused && roomOk;
    return json({ can_receive }, 200, request);
  }

  throw new ApiError('Not found', 404);
}
