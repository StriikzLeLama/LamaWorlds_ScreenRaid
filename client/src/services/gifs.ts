import { apiFetch } from './api';
import type { Media } from './media';

export type KlipyKind = 'gifs' | 'stickers' | 'memes';

export interface GifSearchItem {
  id: string;
  slug: string;
  title: string;
  preview_url: string;
  gif_url: string;
  width: number;
  height: number;
  kind?: string;
}

export interface GifSearchResponse {
  enabled: boolean;
  items: GifSearchItem[];
  page: number;
  per_page: number;
  has_next: boolean;
  attribution: string;
  kind?: string;
}

/** Proxy → KLIPY search/trending. Empty `q` returns trending. */
export async function searchGifs(params?: {
  q?: string;
  kind?: KlipyKind;
  page?: number;
  perPage?: number;
}): Promise<GifSearchResponse> {
  const qs = new URLSearchParams();
  if (params?.q?.trim()) qs.set('q', params.q.trim());
  qs.set('kind', params?.kind ?? 'gifs');
  if (params?.page) qs.set('page', String(params.page));
  if (params?.perPage) qs.set('per_page', String(params.perPage));
  return apiFetch<GifSearchResponse>(`/v1/gifs/search?${qs.toString()}`);
}

/** Download a KLIPY asset into the ScreenRaid media library. */
export async function importGif(params: {
  url: string;
  title?: string;
  slug?: string;
  roomId?: string;
  kind?: KlipyKind;
}): Promise<Media> {
  return apiFetch<Media>('/v1/gifs/import', {
    method: 'POST',
    body: JSON.stringify({
      url: params.url,
      title: params.title ?? null,
      slug: params.slug ?? null,
      room_id: params.roomId ?? null,
      kind: params.kind ?? 'gifs',
    }),
  });
}
