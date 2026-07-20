import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Button, Input } from './ui';
import {
  importGif,
  searchGifs,
  type GifSearchItem,
} from '../services/gifs';
import type { Media } from '../services/media';

interface Props {
  roomId?: string;
  selectedMediaId: string;
  onPicked: (media: Media) => void;
}

/**
 * Inline KLIPY GIF browser for the prank composer.
 * Picking a GIF imports it into the media library (so pranks still use media_id).
 */
export function GifPicker({ roomId, selectedMediaId, onPicked }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<GifSearchItem[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [attribution, setAttribution] = useState('Powered by KLIPY');
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const debounceRef = useRef<number | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await searchGifs({ q, page: 1, perPage: 24 });
      setEnabled(res.enabled);
      setItems(res.items);
      setAttribution(res.attribution);
      if (!res.enabled) {
        setError(
          'KLIPY is not configured. Add KLIPY_API_KEY to the server .env (partner.klipy.com), then restart.',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'GIF search failed');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load trending on mount.
  useEffect(() => {
    void runSearch('');
  }, [runSearch]);

  // Debounced search as the user types.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void runSearch(query);
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const pick = async (item: GifSearchItem) => {
    setImportingId(item.id);
    setError('');
    try {
      const media = await importGif({
        url: item.gif_url,
        title: item.title || item.slug,
        slug: item.slug,
        roomId,
      });
      onPicked(media);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import GIF');
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-raid-border bg-raid-surface/60 p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label="Search KLIPY GIFs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="laugh, cat, wow…"
          />
        </div>
        <Button
          variant="secondary"
          className="mb-0.5"
          disabled={loading}
          onClick={() => void runSearch(query)}
        >
          <Search size={16} />
        </Button>
      </div>

      {error && <p className="text-xs text-raid-warning">{error}</p>}

      {loading && items.length === 0 ? (
        <p className="text-xs text-raid-text-secondary">Loading GIFs…</p>
      ) : (
        <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {items.map((item) => {
            const busy = importingId === item.id;
            // selectedMediaId is our library id — we highlight after import via parent state.
            return (
              <button
                key={item.id}
                type="button"
                disabled={busy || !!importingId}
                title={item.title || item.slug}
                onClick={() => void pick(item)}
                className="group relative aspect-square overflow-hidden rounded-lg border border-raid-border bg-raid-bg transition hover:border-raid-accent disabled:opacity-60"
              >
                <img
                  src={item.preview_url}
                  alt={item.title || item.slug}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {busy && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-medium text-white">
                    Import…
                  </span>
                )}
              </button>
            );
          })}
          {enabled && !loading && items.length === 0 && (
            <p className="col-span-full text-xs text-raid-text-secondary">No GIFs found.</p>
          )}
        </div>
      )}

      <p className="text-[10px] uppercase tracking-wide text-raid-text-secondary">
        {attribution}
        {selectedMediaId ? ' · GIF ready to send' : ''}
      </p>
    </div>
  );
}
