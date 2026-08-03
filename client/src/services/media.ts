import type { MediaType } from '../types';
import { useAuthStore } from '../stores/authStore';
import { apiFetch, getServerUrl } from './api';

export interface Media {
  id: string;
  uploader_id: string;
  room_id: string | null;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  media_type: MediaType;
  url: string;
  hash_sha256: string;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface MediaListResponse {
  items: Media[];
  total: number;
  page: number;
  limit: number;
}

export interface MediaStorageUsage {
  used_bytes: number;
  quota_bytes: number;
  remaining_bytes: number;
  enforced: boolean;
}

export async function uploadMedia(
  file: File,
  roomId?: string,
  onProgress?: (pct: number) => void,
): Promise<Media> {
  const form = new FormData();
  form.append('file', file);
  if (roomId) form.append('room_id', roomId);

  const token = useAuthStore.getState().accessToken;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getServerUrl()}/v1/media/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as Media);
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err?.error?.message ?? 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(form);
  });
}

export async function listMedia(params?: {
  roomId?: string;
  page?: number;
  limit?: number;
}): Promise<MediaListResponse> {
  const qs = new URLSearchParams();
  if (params?.roomId) qs.set('room_id', params.roomId);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return apiFetch<MediaListResponse>(`/v1/media${query ? `?${query}` : ''}`);
}

export async function getMediaStorage(): Promise<MediaStorageUsage> {
  return apiFetch<MediaStorageUsage>('/v1/media/storage');
}

export async function deleteMedia(id: string): Promise<void> {
  await apiFetch<void>(`/v1/media/${id}`, { method: 'DELETE' });
}

export function mediaFileUrl(media: Media): string {
  if (media.url.startsWith('http')) return media.url;
  return `${getServerUrl()}${media.url}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
