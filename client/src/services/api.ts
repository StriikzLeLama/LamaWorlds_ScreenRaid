import { useAuthStore } from '../stores/authStore';
import { refreshToken } from './auth';
import { getServerUrl, hasServerUrl } from './serverConfig';
import { reconnectWebSocket } from './websocket';
import { appFetch } from './appFetch';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  const { refreshToken: stored, login, logout } = useAuthStore.getState();
  if (!stored) {
    logout();
    return null;
  }

  if (!refreshPromise) {
    refreshPromise = refreshToken(stored)
      .then((res) => {
        login(
          { access: res.access_token, refresh: res.refresh_token },
          res.user,
        );
        reconnectWebSocket();
        return res.access_token;
      })
      .catch(() => {
        logout();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  // Desktop with no configured host would otherwise call a relative `/v1/...`
  // URL and produce confusing network errors.
  if (!hasServerUrl()) {
    throw new ApiError('Server URL is not configured', 0, 'NO_SERVER_URL');
  }

  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Never attach / refresh tokens on public auth endpoints — a stale Bearer on
  // /login caused confusing Unauthorized loops (refresh + retry).
  const isPublicAuth =
    path.startsWith('/v1/auth/login') ||
    path.startsWith('/v1/auth/register') ||
    path.startsWith('/v1/auth/refresh') ||
    path.startsWith('/v1/auth/2fa/verify') ||
    path.startsWith('/v1/auth/security-policy');

  const accessToken = isPublicAuth
    ? null
    : (token ?? useAuthStore.getState().accessToken);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const doFetch = () => appFetch(`${getServerUrl()}${path}`, { ...options, headers });

  let response = await doFetch();

  if (response.status === 401 && accessToken && !isPublicAuth) {
    const newToken = await tryRefresh();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await doFetch();
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: { message: response.statusText || `HTTP ${response.status}`, code: 'UNKNOWN' },
    }));
    throw new ApiError(
      error?.error?.message ?? `Request failed (${response.status})`,
      response.status,
      error?.error?.code,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function checkServerHealth(): Promise<boolean> {
  if (!hasServerUrl()) return false;
  try {
    const res = await appFetch(`${getServerUrl()}/v1/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export { getServerUrl } from './serverConfig';
