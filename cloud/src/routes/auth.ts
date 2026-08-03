import { SignJWT, jwtVerify } from 'jose';
import {
  ApiError,
  empty,
  json,
  newId,
  nowIso,
  readJson,
  type Env,
} from '../lib/http';
import {
  hashPassword,
  hashToken,
  isAdminUsername,
  newRefreshToken,
  refreshTtl,
  requireUser,
  signAccessToken,
  verifyPassword,
} from '../lib/auth';
import { getUserById, getUserByUsername, userProfile, userSummary } from '../lib/db';
import {
  clientIp,
  turnstileConfigured,
  turnstileSiteKey,
  verifyTurnstile,
} from '../lib/turnstile';
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotpSetup,
  verifyTotpCode,
} from '../lib/totp';

interface RegisterBody {
  username: string;
  email: string;
  password: string;
  display_name: string;
  turnstile_token?: string;
}

interface LoginBody {
  username: string;
  password: string;
  turnstile_token?: string;
}

interface RefreshBody {
  refresh_token: string;
}

function validateUsername(u: string): string {
  const username = u.trim();
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    throw new ApiError('Invalid username', 400, 'invalid_username');
  }
  return username;
}

function validatePassword(p: string): void {
  if (p.length < 8) throw new ApiError('Password too short', 400, 'weak_password');
}

function secretKey(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

async function issueTokens(
  env: Env,
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
) {
  const sessionId = newId();
  const refresh = newRefreshToken();
  const refreshHash = await hashToken(refresh);
  const expiresAt = new Date(Date.now() + refreshTtl(env) * 1000).toISOString();
  const createdAt = nowIso();
  try {
    await env.DB.prepare(
      `INSERT INTO refresh_tokens
       (id, user_id, token_hash, session_id, expires_at, created_at, user_agent, ip_address, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId(),
        userId,
        refreshHash,
        sessionId,
        expiresAt,
        createdAt,
        meta.userAgent ?? null,
        meta.ip ?? null,
        createdAt,
      )
      .run();
  } catch {
    // Pre-migration schema without UA/IP columns
    await env.DB.prepare(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, session_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(newId(), userId, refreshHash, sessionId, expiresAt, createdAt)
      .run();
  }
  const { token, expiresIn } = await signAccessToken(env, userId, sessionId);
  return { access_token: token, refresh_token: refresh, expires_in: expiresIn, sessionId };
}

async function audit(
  env: Env,
  action: string,
  opts: {
    actor_id?: string;
    actor_username?: string;
    ip?: string;
    metadata?: unknown;
  } = {},
) {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, action, actor_id, actor_username, ip_address, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId(),
        action,
        opts.actor_id ?? null,
        opts.actor_username ?? null,
        opts.ip ?? null,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
        nowIso(),
      )
      .run();
  } catch {
    // table may not exist yet during migration rollouts
  }
}

async function signTemp2fa(env: Env, userId: string): Promise<string> {
  return new SignJWT({ typ: 'temp_2fa' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secretKey(env));
}

async function verifyTemp2fa(env: Env, token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secretKey(env));
    if (payload.typ !== 'temp_2fa' || typeof payload.sub !== 'string') {
      throw new Error('bad');
    }
    return payload.sub;
  } catch {
    throw new ApiError('Invalid or expired 2FA token', 401, 'unauthorized');
  }
}

export async function handleAuth(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (path === '/v1/auth/security-policy' && request.method === 'GET') {
    const ts = turnstileConfigured(env);
    return json(
      {
        turnstile_required_on_register: ts,
        turnstile_required_on_login: ts,
        turnstile_site_key: turnstileSiteKey(env),
        totp_available: true,
      },
      200,
      request,
    );
  }

  if (path === '/v1/auth/register' && request.method === 'POST') {
    const body = await readJson<RegisterBody>(request);
    await verifyTurnstile(env, body.turnstile_token, clientIp(request));
    const username = validateUsername(body.username);
    const email = body.email?.trim().toLowerCase();
    const displayName = (body.display_name || username).trim().slice(0, 64);
    if (!email || !email.includes('@')) throw new ApiError('Invalid email', 400, 'invalid_email');
    validatePassword(body.password);

    const existing = await getUserByUsername(env, username);
    if (existing) throw new ApiError('Username taken', 409, 'conflict');

    const id = newId();
    const ts = nowIso();
    const passwordHash = await hashPassword(body.password);
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO users (id, username, email, password_hash, display_name, avatar_url, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
        ).bind(id, username, email, passwordHash, displayName, ts, ts),
        env.DB.prepare(
          `INSERT INTO user_consent (user_id, global_consent, is_paused, room_consents, consented_at, updated_at)
           VALUES (?, 0, 0, '{}', NULL, ?)`,
        ).bind(id, ts),
      ]);
    } catch {
      throw new ApiError('Username or email already exists', 409, 'conflict');
    }

    const tokens = await issueTokens(env, id, {
      userAgent: request.headers.get('user-agent'),
      ip: clientIp(request),
    });
    return json(
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        user: {
          id,
          username,
          display_name: displayName,
          avatar_url: null as string | null,
        },
      },
      201,
      request,
    );
  }

  if (path === '/v1/auth/login' && request.method === 'POST') {
    const body = await readJson<LoginBody>(request);
    const ip = clientIp(request);
    await verifyTurnstile(env, body.turnstile_token, ip);
    const user = await getUserByUsername(env, body.username.trim());
    if (!user || !user.is_active) {
      await audit(env, 'login_failed', { actor_username: body.username, ip });
      throw new ApiError('Invalid credentials', 401, 'unauthorized');
    }
    const ok = await verifyPassword(body.password, user.password_hash);
    if (!ok) {
      await audit(env, 'login_failed', {
        actor_id: user.id,
        actor_username: user.username,
        ip,
      });
      throw new ApiError('Invalid credentials', 401, 'unauthorized');
    }

    const totp = await env.DB.prepare(
      `SELECT enabled FROM user_totp WHERE user_id = ? AND enabled = 1`,
    )
      .bind(user.id)
      .first();
    if (totp) {
      const temp_token = await signTemp2fa(env, user.id);
      return json(
        {
          requires_2fa: true,
          temp_token,
        },
        200,
        request,
      );
    }

    const tokens = await issueTokens(env, user.id, {
      userAgent: request.headers.get('user-agent'),
      ip,
    });
    await audit(env, 'login_success', {
      actor_id: user.id,
      actor_username: user.username,
      ip,
    });
    return json(
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        user: userSummary(user),
        requires_2fa: false,
        temp_token: null,
      },
      200,
      request,
    );
  }

  if (path === '/v1/auth/2fa/verify' && request.method === 'POST') {
    const body = await readJson<{ temp_token: string; code: string }>(request);
    const userId = await verifyTemp2fa(env, body.temp_token);
    const row = await env.DB.prepare(`SELECT * FROM user_totp WHERE user_id = ?`)
      .bind(userId)
      .first<{ secret_encrypted: string; recovery_hashes: string; enabled: number }>();
    if (!row?.enabled) throw new ApiError('2FA not enabled', 400);

    let ok = verifyTotpCode(env, row.secret_encrypted, body.code || '');
    if (!ok) {
      const consumed = consumeRecoveryCode(row.recovery_hashes, body.code || '');
      if (consumed.ok) {
        ok = true;
        await env.DB.prepare(
          `UPDATE user_totp SET recovery_hashes = ?, updated_at = ? WHERE user_id = ?`,
        )
          .bind(consumed.nextHashesJson, nowIso(), userId)
          .run();
      }
    }
    if (!ok) throw new ApiError('Invalid 2FA code', 401, 'unauthorized');

    const user = await getUserById(env, userId);
    if (!user) throw new ApiError('Not found', 404);
    const tokens = await issueTokens(env, user.id, {
      userAgent: request.headers.get('user-agent'),
      ip: clientIp(request),
    });
    await audit(env, 'login_success', {
      actor_id: user.id,
      actor_username: user.username,
      ip: clientIp(request),
      metadata: { via: '2fa' },
    });
    return json(
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        user: userSummary(user),
      },
      200,
      request,
    );
  }

  if (path === '/v1/auth/2fa/setup' && request.method === 'POST') {
    const claims = await requireUser(env, request);
    const user = await getUserById(env, claims.sub);
    if (!user) throw new ApiError('Not found', 404);
    const setup = generateTotpSetup(env, user.username);
    const ts = nowIso();
    await env.DB.prepare(
      `INSERT INTO user_totp (user_id, secret_encrypted, enabled, recovery_hashes, created_at, updated_at)
       VALUES (?, ?, 0, '[]', ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         secret_encrypted = excluded.secret_encrypted,
         enabled = 0,
         updated_at = excluded.updated_at`,
    )
      .bind(claims.sub, setup.secret_encrypted, ts, ts)
      .run();
    return json(
      {
        secret: setup.secret,
        otpauth_uri: setup.otpauth_url,
        otpauth_url: setup.otpauth_url,
      },
      200,
      request,
    );
  }

  if (path === '/v1/auth/2fa/enable' && request.method === 'POST') {
    const claims = await requireUser(env, request);
    const body = await readJson<{ code: string }>(request);
    const row = await env.DB.prepare(`SELECT * FROM user_totp WHERE user_id = ?`)
      .bind(claims.sub)
      .first<{ secret_encrypted: string }>();
    if (!row) throw new ApiError('Run setup first', 400);
    if (!verifyTotpCode(env, row.secret_encrypted, body.code || '')) {
      throw new ApiError('Invalid code', 400);
    }
    const recovery = generateRecoveryCodes(8);
    await env.DB.prepare(
      `UPDATE user_totp SET enabled = 1, recovery_hashes = ?, updated_at = ? WHERE user_id = ?`,
    )
      .bind(recovery.hashesJson, nowIso(), claims.sub)
      .run();
    return json({ recovery_codes: recovery.codes }, 200, request);
  }

  if (path === '/v1/auth/2fa/disable' && request.method === 'POST') {
    const claims = await requireUser(env, request);
    const body = await readJson<{ password: string; code: string }>(request);
    const user = await getUserById(env, claims.sub);
    if (!user) throw new ApiError('Not found', 404);
    if (!(await verifyPassword(body.password, user.password_hash))) {
      throw new ApiError('Invalid password', 401);
    }
    const row = await env.DB.prepare(`SELECT * FROM user_totp WHERE user_id = ?`)
      .bind(claims.sub)
      .first<{ secret_encrypted: string; recovery_hashes: string }>();
    if (!row) return empty(204, request);
    let ok = verifyTotpCode(env, row.secret_encrypted, body.code || '');
    if (!ok) {
      ok = consumeRecoveryCode(row.recovery_hashes, body.code || '').ok;
    }
    if (!ok) throw new ApiError('Invalid code', 401);
    await env.DB.prepare(`DELETE FROM user_totp WHERE user_id = ?`).bind(claims.sub).run();
    return empty(204, request);
  }

  if (path === '/v1/auth/refresh' && request.method === 'POST') {
    const body = await readJson<RefreshBody>(request);
    if (!body.refresh_token) throw new ApiError('Missing refresh_token', 400);
    const tokenHash = await hashToken(body.refresh_token);
    const row = await env.DB.prepare(
      `SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL`,
    )
      .bind(tokenHash)
      .first<{
        id: string;
        user_id: string;
        session_id: string;
        expires_at: string;
      }>();
    if (!row || row.expires_at < nowIso()) {
      throw new ApiError('Invalid refresh token', 401, 'unauthorized');
    }
    await env.DB.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?`)
      .bind(nowIso(), row.id)
      .run();
    const user = await getUserById(env, row.user_id);
    if (!user || !user.is_active) throw new ApiError('Invalid refresh token', 401, 'unauthorized');
    const tokens = await issueTokens(env, user.id, {
      userAgent: request.headers.get('user-agent'),
      ip: clientIp(request),
    });
    return json(
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        user: userSummary(user),
      },
      200,
      request,
    );
  }

  if (path === '/v1/auth/logout' && request.method === 'POST') {
    await requireUser(env, request);
    const body = await readJson<RefreshBody>(request);
    if (body.refresh_token) {
      const tokenHash = await hashToken(body.refresh_token);
      await env.DB.prepare(
        `UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?`,
      )
        .bind(nowIso(), tokenHash)
        .run();
    }
    return empty(204, request);
  }

  if (path === '/v1/auth/logout-all' && request.method === 'POST') {
    const claims = await requireUser(env, request);
    await env.DB.prepare(
      `UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
    )
      .bind(nowIso(), claims.sub)
      .run();
    return empty(204, request);
  }

  if (path === '/v1/auth/me' && request.method === 'GET') {
    const claims = await requireUser(env, request);
    const user = await getUserById(env, claims.sub);
    if (!user) throw new ApiError('Not found', 404, 'not_found');
    return json(userProfile(user, isAdminUsername(env, user.username)), 200, request);
  }

  if (path === '/v1/auth/change-password' && request.method === 'POST') {
    const claims = await requireUser(env, request);
    const body = await readJson<{ current_password: string; new_password: string }>(request);
    validatePassword(body.new_password);
    const user = await getUserById(env, claims.sub);
    if (!user) throw new ApiError('Not found', 404);
    if (!(await verifyPassword(body.current_password, user.password_hash))) {
      throw new ApiError('Invalid password', 401);
    }
    const hash = await hashPassword(body.new_password);
    await env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
      .bind(hash, nowIso(), claims.sub)
      .run();
    await env.DB.prepare(
      `UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
    )
      .bind(nowIso(), claims.sub)
      .run();
    const tokens = await issueTokens(env, claims.sub, {
      userAgent: request.headers.get('user-agent'),
      ip: clientIp(request),
    });
    return json(
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        user: userSummary(user),
      },
      200,
      request,
    );
  }

  if (path === '/v1/auth/sessions' && request.method === 'GET') {
    const claims = await requireUser(env, request);
    const now = nowIso();
    let results: Record<string, unknown>[] = [];
    try {
      const q = await env.DB.prepare(
        `SELECT id, session_id, user_agent, ip_address, created_at, last_seen_at, expires_at, label
         FROM refresh_tokens
         WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
         ORDER BY COALESCE(last_seen_at, created_at) DESC`,
      )
        .bind(claims.sub, now)
        .all();
      results = (q.results ?? []) as Record<string, unknown>[];
    } catch {
      const q = await env.DB.prepare(
        `SELECT id, session_id, created_at, expires_at
         FROM refresh_tokens
         WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC`,
      )
        .bind(claims.sub, now)
        .all();
      results = (q.results ?? []) as Record<string, unknown>[];
    }

    const sessions = results.map((row) => {
      const sessionId = String(row.session_id ?? row.id);
      return {
        id: sessionId,
        label: (row.label as string | null) ?? null,
        user_agent: (row.user_agent as string | null) ?? null,
        ip_address: (row.ip_address as string | null) ?? null,
        created_at: String(row.created_at),
        last_seen_at: (row.last_seen_at as string | null) ?? null,
        expires_at: String(row.expires_at),
        is_current: sessionId === claims.sid,
      };
    });
    return json({ sessions }, 200, request);
  }

  const sessionDel = path.match(/^\/v1\/auth\/sessions\/([^/]+)$/);
  if (sessionDel && request.method === 'DELETE') {
    const claims = await requireUser(env, request);
    const sessionId = decodeURIComponent(sessionDel[1]!);
    const res = await env.DB.prepare(
      `UPDATE refresh_tokens SET revoked_at = ?
       WHERE user_id = ? AND revoked_at IS NULL AND (session_id = ? OR id = ?)`,
    )
      .bind(nowIso(), claims.sub, sessionId, sessionId)
      .run();
    if ((res.meta.changes ?? 0) === 0) throw new ApiError('Not found', 404);
    await audit(env, 'session_revoked', {
      actor_id: claims.sub,
      metadata: { session_id: sessionId },
    });
    return empty(204, request);
  }

  return null;
}
