import type { GifSearchItem } from './gifs';

const KEY = 'screenraid-gif-favorites';

/** Persist KLIPY favorites locally so users can re-pick without searching. */
export function loadGifFavorites(): GifSearchItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GifSearchItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGifFavorites(items: GifSearchItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, 60)));
}

export function toggleGifFavorite(item: GifSearchItem): GifSearchItem[] {
  const current = loadGifFavorites();
  const exists = current.some((f) => f.id === item.id && f.slug === item.slug);
  const next = exists
    ? current.filter((f) => !(f.id === item.id && f.slug === item.slug))
    : [item, ...current];
  saveGifFavorites(next);
  return next;
}

export function isGifFavorite(item: GifSearchItem): boolean {
  return loadGifFavorites().some((f) => f.id === item.id && f.slug === item.slug);
}
