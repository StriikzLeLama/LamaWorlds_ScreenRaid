import { apiFetch } from './api';
import type {
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  UserProfile,
} from '../types/auth';

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function refreshToken(refresh_token: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/v1/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token }),
  });
}

export async function logout(accessToken: string, refreshToken: string): Promise<void> {
  await apiFetch<void>(
    '/v1/auth/logout',
    {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
    accessToken,
  );
}

export async function getMe(accessToken: string): Promise<UserProfile> {
  return apiFetch<UserProfile>('/v1/auth/me', {}, accessToken);
}
