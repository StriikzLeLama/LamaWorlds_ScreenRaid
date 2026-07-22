import { useAuthStore } from '../stores/authStore';
import { refreshToken } from './auth';
import { getServerUrl } from './serverConfig';
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
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const accessToken = token ?? useAuthStore.getState().accessToken;
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const doFetch = () => appFetch(`${getServerUrl()}${path}`, { ...options, headers });

  let response = await doFetch();

  if (response.status === 401 && accessToken) {
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
  try {
    const res = await appFetch(`${getServerUrl()}/v1/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export { getServerUrl } from './serverConfig';
