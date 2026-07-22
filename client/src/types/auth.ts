import type { UserSummary } from './index';

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserSummary;
}

/** Flattened auth fields when login succeeds without 2FA challenge. */
export interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: UserSummary;
  requires_2fa: boolean;
  temp_token?: string | null;
}

export function loginResponseToAuth(res: LoginResponse): AuthResponse | null {
  if (res.requires_2fa) return null;
  // Flat shape (current server).
  if (res.access_token && res.refresh_token && res.user) {
    return {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      expires_in: res.expires_in ?? 900,
      user: res.user,
    };
  }
  // Nested shape fallback (defensive).
  const nested = (res as LoginResponse & { auth?: AuthResponse }).auth;
  if (nested?.access_token && nested.refresh_token && nested.user) {
    return nested;
  }
  return null;
}

export interface UserProfile extends UserSummary {
  email: string;
  created_at: string;
  is_admin?: boolean;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  display_name: string;
  turnstile_token?: string;
}

export interface LoginPayload {
  username: string;
  password: string;
  turnstile_token?: string;
}

export interface TotpVerifyPayload {
  temp_token: string;
  code: string;
}

export interface TotpEnablePayload {
  code: string;
}

export interface TotpDisablePayload {
  password: string;
  code: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface ChangeUsernamePayload {
  current_password: string;
  new_username: string;
}

export interface ChangeDisplayNamePayload {
  current_password: string;
  new_display_name: string;
}
