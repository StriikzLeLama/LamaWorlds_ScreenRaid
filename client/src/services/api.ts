import { useAuthStore } from '../stores/authStore';
import { refreshToken } from './auth';

const DEFAULT_SERVER = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:8080';

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

  const doFetch = () =>
    fetch(`${DEFAULT_SERVER}${path}`, {
      ...options,
      headers,
    });

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
      error: { message: response.statusText, code: 'UNKNOWN' },
    }));
    throw new ApiError(
      error?.error?.message ?? 'Request failed',
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
    const res = await fetch(`${DEFAULT_SERVER}/v1/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export function getServerUrl(): string {
  return DEFAULT_SERVER;
}
