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

export async function deleteAdminMedia(mediaId: string): Promise<void> {
  await apiFetch<void>(`/v1/admin/media/${mediaId}`, { method: 'DELETE' });
}
