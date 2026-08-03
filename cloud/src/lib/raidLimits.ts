import { ApiError, type Env } from './http';

export interface ResolvedRaidLimits {
  max_pranks_per_minute: number;
  target_cooldown_ms: number;
  max_duration_ms: number;
  max_volume: number;
}

const FRIENDS: ResolvedRaidLimits = {
  max_pranks_per_minute: 12,
  target_cooldown_ms: 3000,
  max_duration_ms: 15_000,
  max_volume: 1.0,
};

const STRICT: ResolvedRaidLimits = {
  max_pranks_per_minute: 5,
  target_cooldown_ms: 8000,
  max_duration_ms: 8000,
  max_volume: 0.7,
};

interface UserPrefsRow {
  preset: string;
  max_pranks_per_minute: number | null;
  target_cooldown_ms: number | null;
  max_duration_ms: number | null;
  max_volume: number | null;
}

async function loadUserPrefs(env: Env, userId: string): Promise<UserPrefsRow | null> {
  try {
    return await env.DB.prepare(
      `SELECT preset, max_pranks_per_minute, target_cooldown_ms, max_duration_ms, max_volume
       FROM user_security_prefs WHERE user_id = ?`,
    )
      .bind(userId)
      .first<UserPrefsRow>();
  } catch {
    return null;
  }
}

/** Resolve effective raid limits from user security prefs (Cloud has no room_security table yet). */
export async function resolveRaidLimits(env: Env, userId: string): Promise<ResolvedRaidLimits> {
  const prefs = await loadUserPrefs(env, userId);
  const base = prefs?.preset === 'strict' ? { ...STRICT } : { ...FRIENDS };
  if (prefs?.max_pranks_per_minute != null) {
    base.max_pranks_per_minute = Math.max(1, Number(prefs.max_pranks_per_minute));
  }
  if (prefs?.target_cooldown_ms != null) {
    base.target_cooldown_ms = Math.max(0, Number(prefs.target_cooldown_ms));
  }
  if (prefs?.max_duration_ms != null) {
    base.max_duration_ms = Math.max(500, Number(prefs.max_duration_ms));
  }
  if (prefs?.max_volume != null) {
    base.max_volume = Math.min(1, Math.max(0.1, Number(prefs.max_volume)));
  }
  return base;
}

/**
 * Enforce sender rate limits before inserting/delivering a prank.
 * Mirrors Rust `PrankService::send` checks (per-minute cap + target cooldown).
 */
export async function assertPrankSendAllowed(
  env: Env,
  senderId: string,
  roomId: string,
  targetId: string | null,
): Promise<ResolvedRaidLimits> {
  const limits = await resolveRaidLimits(env, senderId);

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM pranks
     WHERE sender_id = ? AND created_at >= datetime('now', '-1 minute')`,
  )
    .bind(senderId)
    .first<{ c: number }>();

  if ((recent?.c ?? 0) >= limits.max_pranks_per_minute) {
    throw new ApiError('Rate limit exceeded — try again in a moment', 429, 'rate_limited');
  }

  if (targetId && limits.target_cooldown_ms > 0) {
    const last = await env.DB.prepare(
      `SELECT created_at FROM pranks
       WHERE sender_id = ? AND target_id = ? AND room_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(senderId, targetId, roomId)
      .first<{ created_at: string }>();

    if (last?.created_at) {
      const ms = Date.now() - Date.parse(last.created_at);
      if (Number.isFinite(ms) && ms < limits.target_cooldown_ms) {
        throw new ApiError('Target cooldown — wait before raiding again', 429, 'rate_limited');
      }
    }
  }

  return limits;
}
