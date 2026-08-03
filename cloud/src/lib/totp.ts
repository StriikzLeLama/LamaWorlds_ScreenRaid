import * as OTPAuth from 'otpauth';
import { bytesToHex } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { ApiError, type Env } from './http';

function encodeSecret(env: Env, rawBase32: string): string {
  return btoa(`${env.JWT_SECRET}:${rawBase32}`);
}

function decodeSecret(env: Env, stored: string): string {
  try {
    const decoded = atob(stored);
    const prefix = `${env.JWT_SECRET}:`;
    if (!decoded.startsWith(prefix)) throw new Error('bad prefix');
    return decoded.slice(prefix.length);
  } catch {
    throw new ApiError('totp secret corrupt', 500, 'totp_corrupt');
  }
}

export function generateTotpSetup(env: Env, username: string): {
  secret: string;
  otpauth_url: string;
  secret_encrypted: string;
} {
  const totp = new OTPAuth.TOTP({
    issuer: 'ScreenRaid',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });
  const secret = totp.secret.base32;
  return {
    secret,
    otpauth_url: totp.toString(),
    secret_encrypted: encodeSecret(env, secret),
  };
}

export function verifyTotpCode(env: Env, secretEncrypted: string, code: string): boolean {
  const raw = decodeSecret(env, secretEncrypted);
  const totp = new OTPAuth.TOTP({
    issuer: 'ScreenRaid',
    label: 'user',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(raw),
  });
  const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1 });
  return delta !== null;
}

export function generateRecoveryCodes(count = 8): { codes: string[]; hashesJson: string } {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const n = new DataView(bytes.buffer).getUint32(0);
    codes.push(n.toString(16).toUpperCase().padStart(8, '0'));
  }
  const hashes = codes.map((c) => bytesToHex(sha256(new TextEncoder().encode(c))));
  return { codes, hashesJson: JSON.stringify(hashes) };
}

export function consumeRecoveryCode(
  hashesJson: string,
  code: string,
): { ok: boolean; nextHashesJson: string } {
  const hashes = JSON.parse(hashesJson || '[]') as string[];
  const target = bytesToHex(sha256(new TextEncoder().encode(code.trim().toUpperCase())));
  const idx = hashes.indexOf(target);
  if (idx < 0) return { ok: false, nextHashesJson: hashesJson };
  hashes.splice(idx, 1);
  return { ok: true, nextHashesJson: JSON.stringify(hashes) };
}
