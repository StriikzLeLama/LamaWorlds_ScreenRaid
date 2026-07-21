export interface SecurityPolicyResponse {
  turnstile_site_key: string | null;
  turnstile_required_on_register: boolean;
  password_min_length: number;
  password_requires_letter_and_digit: boolean;
}

export interface SessionInfo {
  id: string;
  label: string | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  last_seen_at: string | null;
  expires_at: string;
  is_current: boolean;
}

export interface SessionsListResponse {
  sessions: SessionInfo[];
}

export interface AuditEntry {
  id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  actor_username: string | null;
  created_at: string;
}

export interface AuditListResponse {
  items: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface TotpSetupResponse {
  secret: string;
  otpauth_uri: string;
}

export interface TotpEnableResponse {
  recovery_codes: string[];
}

export interface UserSecurityPrefs {
  preset: string;
  allow_sound: boolean;
  allow_video: boolean;
  allow_fullscreen: boolean;
  local_cooldown_ms: number;
  max_pranks_per_minute: number | null;
  target_cooldown_ms: number | null;
  max_duration_ms: number | null;
  max_volume: number | null;
}

export interface UpdateUserSecurityPrefsRequest {
  preset?: string;
  allow_sound?: boolean;
  allow_video?: boolean;
  allow_fullscreen?: boolean;
  local_cooldown_ms?: number;
  max_pranks_per_minute?: number | null;
  target_cooldown_ms?: number | null;
  max_duration_ms?: number | null;
  max_volume?: number | null;
}

export interface RoomSecuritySettings {
  preset: string;
  max_pranks_per_minute: number | null;
  target_cooldown_ms: number | null;
  max_duration_ms: number | null;
  max_volume: number | null;
  muted_senders: string[];
}

export interface UpdateRoomSecurityRequest {
  preset?: string;
  max_pranks_per_minute?: number | null;
  target_cooldown_ms?: number | null;
  max_duration_ms?: number | null;
  max_volume?: number | null;
  mute_user_id?: string;
  unmute_user_id?: string;
}
