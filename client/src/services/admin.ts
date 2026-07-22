import { apiFetch } from './api';
import type { Media } from './media';

export interface AdminUserItem {
  id: string;
  username: string;
  email: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
}

export interface AdminUsersResponse {
  users: AdminUserItem[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminMediaItem {
  id: string;
  uploader_id: string;
  uploader_username: string;
  room_id: string | null;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  media_type: Media['media_type'];
  url: string;
  hash_sha256: string;
  created_at: string;
}

export interface AdminMediaListResponse {
  items: AdminMediaItem[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminRoomItem {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  owner_username: string;
  member_count: number;
  is_active: boolean;
  created_at: string;
}

export interface AdminRoomsResponse {
  rooms: AdminRoomItem[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminPresenceUser {
  user_id: string;
  username: string;
  display_name: string;
  session_count: number;
}

export interface AdminPresenceResponse {
  online: AdminPresenceUser[];
  online_count: number;
}

export interface AdminAuditItem {
  id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  actor_username: string | null;
  ip_address?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface AdminAuditResponse {
  items: AdminAuditItem[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminStats {
  users_total: number;
  users_active: number;
  users_inactive: number;
  rooms_active: number;
  media_total: number;
  online_count: number;
  login_failed_24h: number;
  login_success_24h: number;
}

export async function listAdminUsers(page = 1, limit = 50): Promise<AdminUsersResponse> {
  return apiFetch<AdminUsersResponse>(`/v1/admin/users?page=${page}&limit=${limit}`);
}

export async function listAdminMedia(page = 1, limit = 50): Promise<AdminMediaListResponse> {
  const res = await apiFetch<{
    items: Array<{ media: Media; uploader_username: string }>;
    total: number;
    page: number;
    limit: number;
  }>(`/v1/admin/media?page=${page}&limit=${limit}`);

  return {
    total: res.total,
    page: res.page,
    limit: res.limit,
    items: res.items.map((item) => ({
      ...item.media,
      uploader_username: item.uploader_username,
    })),
  };
}

export async function deactivateUser(userId: string): Promise<void> {
  await apiFetch<void>(`/v1/admin/users/${userId}`, { method: 'DELETE' });
}

export async function reactivateUser(userId: string): Promise<void> {
  await apiFetch<void>(`/v1/admin/users/${userId}/reactivate`, { method: 'POST' });
}

export async function adminSetPassword(userId: string, newPassword: string): Promise<void> {
  await apiFetch<void>(`/v1/admin/users/${userId}/password`, {
    method: 'POST',
    body: JSON.stringify({ new_password: newPassword }),
  });
}

export async function adminRevokeSessions(userId: string): Promise<void> {
  await apiFetch<void>(`/v1/admin/users/${userId}/revoke-sessions`, { method: 'POST' });
}

export async function adminDisable2fa(userId: string): Promise<void> {
  await apiFetch<void>(`/v1/admin/users/${userId}/disable-2fa`, { method: 'POST' });
}

export async function listAdminStats(): Promise<AdminStats> {
  return apiFetch<AdminStats>('/v1/admin/stats');
}

export async function deleteAdminMedia(mediaId: string): Promise<void> {
  await apiFetch<void>(`/v1/admin/media/${mediaId}`, { method: 'DELETE' });
}

export async function listAdminRooms(page = 1, limit = 50): Promise<AdminRoomsResponse> {
  return apiFetch<AdminRoomsResponse>(`/v1/admin/rooms?page=${page}&limit=${limit}`);
}

export async function forceDeleteRoom(roomId: string): Promise<void> {
  await apiFetch<void>(`/v1/admin/rooms/${roomId}`, { method: 'DELETE' });
}

export async function listAdminPresence(): Promise<AdminPresenceResponse> {
  return apiFetch<AdminPresenceResponse>('/v1/admin/presence');
}

export async function listAdminAudit(page = 1, limit = 50): Promise<AdminAuditResponse> {
  return apiFetch<AdminAuditResponse>(`/v1/admin/audit?page=${page}&limit=${limit}`);
}
