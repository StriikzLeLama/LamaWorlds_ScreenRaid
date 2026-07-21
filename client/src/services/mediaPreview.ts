import { useAuthStore } from '../stores/authStore';
import { getServerUrl } from './api';
import { appFetch } from './appFetch';
import type { Media } from './media';

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function mediaPath(media: Media): string {
  if (media.url.startsWith('http')) {
    try {
      const u = new URL(media.url);
      return u.pathname + u.search;
    } catch {
      return media.url;
    }
  }
  return media.url;
}

/** Authenticated blob URL for thumbnails (img tags cannot send Bearer). */
export async function resolveMediaPreviewUrl(media: Media): Promise<string> {
  const cached = cache.get(media.id);
  if (cached) return cached;

  const pending = inflight.get(media.id);
  if (pending) return pending;

  const task = (async () => {
    const token = useAuthStore.getState().accessToken;
    const path = mediaPath(media);
    const url = path.startsWith('http') ? path : `${getServerUrl()}${path}`;
    const res = await appFetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      throw new Error(`media preview ${res.status}`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    cache.set(media.id, objectUrl);
    return objectUrl;
  })().finally(() => {
    inflight.delete(media.id);
  });

  inflight.set(media.id, task);
  return task;
}

export function revokeMediaPreview(mediaId: string): void {
  const url = cache.get(mediaId);
  if (url) {
    URL.revokeObjectURL(url);
    cache.delete(mediaId);
  }
}
