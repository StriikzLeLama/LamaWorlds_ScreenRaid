import { SignJWT, jwtVerify } from 'jose';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { ApiError, type Env } from './http';

const PBKDF2_ITERS = 210_000;
const ACCESS_TTL_DEFAULT = 900;
const REFRESH_TTL_DEFAULT = 2_592_000;

export interface AccessClaims {
  sub: string;
  sid: string;
  exp: number;
  iat: number;
}

function secretKey(env: Env): Uint8Array {
  const secret = env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new ApiError('JWT_SECRET is not configured', 500, 'misconfigured');
  }
  return new TextEncoder().encode(secret);
}

/** Decode PHC / argon2 base64 (std alphabet, optional padding). */
function b64Decode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? s : s + '='.repeat(4 - (s.length % 4));
  const bin = atob(pad.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Verify a Rust/PHC argon2id hash: `$argon2id$v=19$m=...,t=...,p=...$salt$hash`
 */
async function verifyArgon2Phc(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  // ['', 'argon2id', 'v=19', 'm=19456,t=2,p=1', salt, hash]
  if (parts.length < 6 || parts[1] !== 'argon2id') return false;
  const params = parts[3]!;
  const salt = b64Decode(parts[4]!);
  const expected = b64Decode(parts[5]!);
  let m = 19456;
  let t = 2;
  let p = 1;
  for (const kv of params.split(',')) {
    const [k, v] = kv.split('=');
    if (k === 'm') m = Number(v);
    if (k === 't') t = Number(v);
    if (k === 'p') p = Number(v);
  }
  try {
    const derived = await argon2idAsync(password, salt, {
      t,
      m,
      p,
      dkLen: expected.length,
    });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = pbkdf2(sha256, password, salt, { c: PBKDF2_ITERS, dkLen: 32 });
  return `pbkdf2$${PBKDF2_ITERS}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$argon2id$') || stored.startsWith('$argon2i$') || stored.startsWith('$argon2d$')) {
    return verifyArgon2Phc(password, stored);
  }
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iters = Number(parts[1]);
  const salt = hexToBytes(parts[2]!);
  const expected = hexToBytes(parts[3]!);
  const derived = pbkdf2(sha256, password, salt, { c: iters, dkLen: expected.length });
  return timingSafeEqual(derived, expected);
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export function accessTtl(env: Env): number {
  return Number(env.ACCESS_TOKEN_TTL_SEC || ACCESS_TTL_DEFAULT);
}

export function refreshTtl(env: Env): number {
  return Number(env.REFRESH_TOKEN_TTL_SEC || REFRESH_TTL_DEFAULT);
}

export async function signAccessToken(
  env: Env,
  userId: string,
  sessionId: string,
): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = accessTtl(env);
  const token = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secretKey(env));
  return { token, expiresIn };
}

export async function verifyAccessToken(env: Env, token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, secretKey(env));
    const sub = payload.sub;
    const sid = payload.sid;
    if (typeof sub !== 'string' || typeof sid !== 'string') {
      throw new ApiError('Invalid token', 401, 'unauthorized');
    }
    return {
      sub,
      sid,
      exp: Number(payload.exp ?? 0),
      iat: Number(payload.iat ?? 0),
    };
  } catch {
    throw new ApiError('Invalid or expired token', 401, 'unauthorized');
  }
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function requireUser(
  env: Env,
  request: Request,
): Promise<AccessClaims> {
  const token = bearerToken(request);
  if (!token) throw new ApiError('Missing Authorization', 401, 'unauthorized');
  return verifyAccessToken(env, token);
}

export function isAdminUsername(env: Env, username: string): boolean {
  const list = (env.ADMIN_USERNAMES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(username.toLowerCase());
}

export function newRefreshToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(bytes);
}
