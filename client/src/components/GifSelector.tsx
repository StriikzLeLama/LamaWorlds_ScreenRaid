import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Search, Sparkles } from 'lucide-react';
import { Button, Input, Modal } from './ui';
import {
  importGif,
  searchGifs,
  type GifSearchItem,
  type KlipyKind,
} from '../services/gifs';
import {
  isGifFavorite,
  loadGifFavorites,
  toggleGifFavorite,
} from '../services/gifFavorites';
import type { Media } from '../services/media';

interface Props {
  open: boolean;
  onClose: () => void;
  roomId?: string;
  onPicked: (media: Media, meta: GifSearchItem) => void;
}

const TABS: { id: KlipyKind | 'favorites'; label: string }[] = [
  { id: 'gifs', label: 'GIFs' },
  { id: 'stickers', label: 'Stickers' },
  { id: 'memes', label: 'Memes' },
  { id: 'favorites', label: 'Favoris' },
];

/**
 * Full KLIPY browser: search, trending, stickers, memes, favorites.
 * Opens as a modal — pick imports into the media library then closes.
 */
export function GifSelector({ open, onClose, roomId, onPicked }: Props) {
  const [tab, setTab] = useState<KlipyKind | 'favorites'>('gifs');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<GifSearchItem[]>([]);
  const [favorites, setFavorites] = useState<GifSearchItem[]>(() => loadGifFavorites());
  const [enabled, setEnabled] = useState(true);
  const [attribution, setAttribution] = useState('Powered by KLIPY');
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hovered, setHovered] = useState<GifSearchItem | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestSeq = useRef(0);
  const openRef = useRef(open);
  const justOpenedRef = useRef(false);
  openRef.current = open;

  const runSearch = useCallback(
    async (q: string, kind: KlipyKind, pageNum: number, append: boolean) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setError('');
      try {
        const res = await searchGifs({ q, kind, page: pageNum, perPage: 30 });
        if (seq !== requestSeq.current || !openRef.current) return;
        setEnabled(res.enabled);
        setAttribution(res.attribution);
        setHasNext(res.has_next);
        setPage(pageNum);
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        if (!res.enabled) {
          setError(
            'KLIPY non configuré. Ajoute KLIPY_API_KEY dans le .env serveur (partner.klipy.com), puis redémarre.',
          );
        }
      } catch (e) {
        if (seq !== requestSeq.current || !openRef.current) return;
        setError(e instanceof Error ? e.message : 'Recherche GIF échouée');
        if (!append) setItems([]);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [],
  );

  // Reset composer fields when the modal opens.
  useEffect(() => {
    if (!open) return;
    justOpenedRef.current = true;
    setFavorites(loadGifFavorites());
    setQuery('');
    setHovered(null);
    setPage(1);
    setError('');
  }, [open]);

  // Search / trending (skips the stale-query tick right after open).
  useEffect(() => {
    if (!open) return;

    if (tab === 'favorites') {
      setFavorites(loadGifFavorites());
      setItems(loadGifFavorites());
      setHasNext(false);
      setLoading(false);
      setError('');
      return;
    }

    if (justOpenedRef.current && query !== '') {
      // Wait for the open-reset that clears query.
      return;
    }
    justOpenedRef.current = false;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void runSearch(query, tab, 1, false);
    }, query ? 320 : 0);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [open, tab, query, runSearch]);

  const pick = async (item: GifSearchItem) => {
    setImportingId(item.id);
    setError('');
    try {
      const rawKind = (item.kind || (tab === 'favorites' ? 'gifs' : tab)) as string;
      const kind: KlipyKind =
        rawKind === 'stickers' || rawKind === 'memes' || rawKind === 'gifs'
          ? rawKind
          : 'gifs';
      const media = await importGif({
        url: item.gif_url,
        title: item.title || item.slug,
        slug: item.slug,
        roomId,
        kind,
      });
      onPicked(media, { ...item, kind });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import impossible');
    } finally {
      setImportingId(null);
    }
  };

  const onToggleFavorite = (item: GifSearchItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = toggleGifFavorite({
      ...item,
      kind: item.kind || (tab === 'favorites' ? 'gifs' : tab),
    });
    setFavorites(next);
    if (tab === 'favorites') setItems(next);
  };

  const displayItems = tab === 'favorites' ? favorites : items;

  return (
    <Modal open={open} onClose={onClose} title="Choisir un GIF / sticker / meme" size="full">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Button
              key={t.id}
              variant={tab === t.id ? 'primary' : 'secondary'}
              className="text-xs"
              onClick={() => setTab(t.id)}
            >
              {t.id === 'favorites' ? <Heart size={14} /> : null}
              {t.label}
              {t.id === 'favorites' ? ` (${favorites.length})` : ''}
            </Button>
          ))}
        </div>

        {tab !== 'favorites' && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Rechercher"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="rire, chat, wow, hello…"
                autoFocus
              />
            </div>
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => void runSearch(query, tab as KlipyKind, 1, false)}
            >
              <Search size={16} />
              Chercher
            </Button>
            <Button
              variant="ghost"
              disabled={loading}
              onClick={() => {
                setQuery('');
                void runSearch('', tab as KlipyKind, 1, false);
              }}
            >
              <Sparkles size={16} />
              Tendances
            </Button>
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-raid-warning/40 bg-raid-warning/10 px-3 py-2 text-sm text-raid-text">
            {error}
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <div>
            {loading && displayItems.length === 0 ? (
              <p className="text-sm text-raid-text-secondary">Chargement…</p>
            ) : displayItems.length === 0 ? (
              <p className="text-sm text-raid-text-secondary">
                {tab === 'favorites'
                  ? 'Aucun favori — clique le cœur sur un GIF pour l’enregistrer.'
                  : 'Aucun résultat.'}
              </p>
            ) : (
              <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
                {displayItems.map((item) => {
                  const busy = importingId === item.id;
                  const fav = isGifFavorite(item);
                  return (
                    <button
                      key={`${item.kind ?? tab}-${item.id}-${item.slug}`}
                      type="button"
                      disabled={busy || !!importingId}
                      title={item.title || item.slug}
                      onMouseEnter={() => setHovered(item)}
                      onClick={() => void pick(item)}
                      className="group relative aspect-square overflow-hidden rounded-xl border border-raid-border bg-raid-bg transition hover:border-raid-accent disabled:opacity-60"
                    >
                      <img
                        src={item.preview_url}
                        alt={item.title || item.slug}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      <span
                        role="presentation"
                        onClick={(e) => onToggleFavorite(item, e)}
                        className={`absolute top-1.5 right-1.5 rounded-full p-1.5 ${
                          fav ? 'bg-raid-accent text-white' : 'bg-black/50 text-white/80'
                        }`}
                      >
                        <Heart size={12} fill={fav ? 'currentColor' : 'none'} />
                      </span>
                      {busy && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-medium text-white">
                          Import…
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {tab !== 'favorites' && hasNext && (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="secondary"
                  disabled={loading}
                  onClick={() => void runSearch(query, tab as KlipyKind, page + 1, true)}
                >
                  {loading ? '…' : 'Charger plus'}
                </Button>
              </div>
            )}
          </div>

          <aside className="hidden rounded-xl border border-raid-border bg-raid-surface/50 p-3 lg:block">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-raid-text-secondary">
              Aperçu
            </p>
            {hovered ? (
              <>
                <img
                  src={hovered.gif_url || hovered.preview_url}
                  alt={hovered.title}
                  className="w-full rounded-lg object-contain"
                />
                <p className="mt-2 truncate text-sm text-raid-text">
                  {hovered.title || hovered.slug}
                </p>
                <p className="text-xs text-raid-text-secondary">
                  Clique pour importer et sélectionner
                </p>
              </>
            ) : (
              <p className="text-xs text-raid-text-secondary">
                Survole un résultat pour prévisualiser. Clique pour l’utiliser dans ton raid.
              </p>
            )}
            <p className="mt-4 text-[10px] uppercase tracking-wide text-raid-text-secondary">
              {attribution}
              {enabled ? '' : ' · désactivé'}
            </p>
          </aside>
        </div>
      </div>
    </Modal>
  );
}
