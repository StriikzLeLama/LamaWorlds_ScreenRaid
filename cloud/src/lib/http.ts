export type Env = Cloudflare.Env;

export type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const DEFAULT_CORS_ORIGINS = [
  'https://screenraid.app.lama-worlds.com',
  'http://localhost:1420',
  'http://localhost:5173',
  'tauri://localhost',
  'https://tauri.localhost',
];

/** Parse comma-separated allowlist from `CORS_ORIGINS` (falls back to prod + dev defaults). */
export function parseCorsOrigins(env?: Env): string[] {
  const raw = env?.CORS_ORIGINS?.trim();
  if (!raw) return DEFAULT_CORS_ORIGINS;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | null, env?: Env): boolean {
  if (!origin) return false;
  const allowed = parseCorsOrigins(env);
  return allowed.includes(origin) || allowed.includes('*');
}

/**
 * CORS for credentialed SPA + Tauri webviews.
 * Only reflects Origin when it is on the allowlist — never `*` with credentials.
 */
export function corsHeaders(request: Request, env?: Env): HeadersInit {
  const origin = request.headers.get('Origin');
  const base: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  };
  if (origin && isOriginAllowed(origin, env)) {
    base['Access-Control-Allow-Origin'] = origin;
    base['Access-Control-Allow-Credentials'] = 'true';
  }
  return base;
}

/** Baseline HTTP security headers (not applied to WebSocket upgrade responses). */
export function securityHeaders(): HeadersInit {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

function applyResponseHeaders(headers: Headers, request?: Request, env?: Env): void {
  for (const [k, v] of Object.entries(securityHeaders())) {
    if (!headers.has(k)) headers.set(k, v);
  }
  if (request) {
    for (const [k, v] of Object.entries(corsHeaders(request, env))) {
      if (!headers.has(k)) headers.set(k, v);
    }
  }
}

export function json(
  data: unknown,
  status = 200,
  request?: Request,
  env?: Env,
): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  applyResponseHeaders(headers, request, env);
  return new Response(JSON.stringify(data), { status, headers });
}

export function empty(status: number, request?: Request, env?: Env): Response {
  const headers = new Headers();
  applyResponseHeaders(headers, request, env);
  return new Response(null, { status, headers });
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = 'bad_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorResponse(err: unknown, request: Request, env?: Env): Response {
  if (err instanceof ApiError) {
    return json({ error: err.message, code: err.code }, err.status, request, env);
  }
  console.error('unhandled', err);
  return json(
    { error: 'Internal server error', code: 'internal' },
    500,
    request,
    env,
  );
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError('Invalid JSON body', 400, 'invalid_json');
  }
}
