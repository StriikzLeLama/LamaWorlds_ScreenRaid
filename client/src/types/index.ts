export interface UserSummary {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserSummary | null;
  isAuthenticated: boolean;
}

export interface ConsentState {
  globalConsent: boolean;
  isPaused: boolean;
  roomConsents: Record<string, boolean>;
}

export interface RoomSummary {
  id: string;
  name: string;
  invite_code: string;
  role: string;
  member_count: number;
}

export type MediaType = 'image' | 'gif' | 'video' | 'audio';
