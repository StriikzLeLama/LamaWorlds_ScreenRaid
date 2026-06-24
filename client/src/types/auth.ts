import type { UserSummary } from './index';

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserSummary;
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
}

export interface LoginPayload {
  username: string;
  password: string;
}
