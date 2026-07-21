import { apiFetch } from './api';
import type {
  AuditListResponse,
  RoomSecuritySettings,
  SecurityPolicyResponse,
  SessionsListResponse,
  TotpEnableResponse,
  TotpSetupResponse,
  UpdateRoomSecurityRequest,
  UpdateUserSecurityPrefsRequest,
  UserSecurityPrefs,
} from '../types/security';
import type { TotpDisablePayload, TotpEnablePayload, TotpVerifyPayload } from '../types/auth';
import type { AuthResponse } from '../types/auth';

export async function getSecurityPolicy(): Promise<SecurityPolicyResponse> {
  return apiFetch<SecurityPolicyResponse>('/v1/auth/security-policy');
}

export async function listSessions(accessToken: string): Promise<SessionsListResponse> {
  return apiFetch<SessionsListResponse>('/v1/auth/sessions', {}, accessToken);
}

export async function revokeSession(accessToken: string, sessionId: string): Promise<void> {
  await apiFetch<void>(`/v1/auth/sessions/${sessionId}`, { method: 'DELETE' }, accessToken);
}

export async function setup2fa(accessToken: string): Promise<TotpSetupResponse> {
  return apiFetch<TotpSetupResponse>('/v1/auth/2fa/setup', { method: 'POST' }, accessToken);
}

export async function enable2fa(
  accessToken: string,
  payload: TotpEnablePayload,
): Promise<TotpEnableResponse> {
  return apiFetch<TotpEnableResponse>(
    '/v1/auth/2fa/enable',
    { method: 'POST', body: JSON.stringify(payload) },
    accessToken,
  );
}

export async function disable2fa(accessToken: string, payload: TotpDisablePayload): Promise<void> {
  await apiFetch<void>(
    '/v1/auth/2fa/disable',
    { method: 'POST', body: JSON.stringify(payload) },
    accessToken,
  );
}

export async function verify2fa(payload: TotpVerifyPayload): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/v1/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listMyAudit(
  accessToken: string,
  page = 1,
  limit = 20,
): Promise<AuditListResponse> {
  return apiFetch<AuditListResponse>(
    `/v1/audit/me?page=${page}&limit=${limit}`,
    {},
    accessToken,
  );
}

export async function getMySecurityPrefs(accessToken: string): Promise<UserSecurityPrefs> {
  return apiFetch<UserSecurityPrefs>('/v1/users/me/security', {}, accessToken);
}

export async function updateMySecurityPrefs(
  accessToken: string,
  payload: UpdateUserSecurityPrefsRequest,
): Promise<UserSecurityPrefs> {
  return apiFetch<UserSecurityPrefs>(
    '/v1/users/me/security',
    { method: 'PATCH', body: JSON.stringify(payload) },
    accessToken,
  );
}

export async function getRoomSecurity(
  accessToken: string,
  roomId: string,
): Promise<RoomSecuritySettings> {
  return apiFetch<RoomSecuritySettings>(`/v1/rooms/${roomId}/security`, {}, accessToken);
}

export async function updateRoomSecurity(
  accessToken: string,
  roomId: string,
  payload: UpdateRoomSecurityRequest,
): Promise<RoomSecuritySettings> {
  return apiFetch<RoomSecuritySettings>(
    `/v1/rooms/${roomId}/security`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    accessToken,
  );
}
