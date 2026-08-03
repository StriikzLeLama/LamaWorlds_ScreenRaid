import { ApiError, type Env } from './http';

export function turnstileConfigured(env: Env): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY);
}

export function turnstileSiteKey(env: Env): string | null {
  return env.TURNSTILE_SITE_KEY || null;
}

export async function verifyTurnstile(
  env: Env,
  token: string | undefined | null,
  remoteIp?: string | null,
): Promise<void> {
  if (!turnstileConfigured(env)) return;
  if (!token) throw new ApiError('captcha required', 400, 'captcha_required');

  const body = new URLSearchParams();
  body.set('secret', env.TURNSTILE_SECRET_KEY);
  body.set('response', token);
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  const data = (await res.json()) as { success?: boolean };
  if (!data.success) throw new ApiError('captcha verification failed', 400, 'captcha_failed');
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
