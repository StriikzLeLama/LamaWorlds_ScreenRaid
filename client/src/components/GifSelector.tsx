import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Heart, Search, Sparkles, X } from 'lucide-react';
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
  /** Allow picking several GIFs (default true). */
  multi?: boolean;
  onPicked: (media: Media, meta: GifSearchItem) => void;
  onPickedMany?: (items: Array<{ media: Media; meta: GifSearchItem }>) => void;
}

const TABS: { id: KlipyKind | 'favorites'; label: string }[] = [
  { id: 'gifs', label: 'GIFs' },
  { id: 'stickers', label: 'Stickers' },
  { id: 'memes', label: 'Memes' },
  { id: 'favorites', label: 'Favoris' },
];

const MAX_MULTI = 8;

function itemKey(item: GifSearchItem, tab: string): string {
  return `${item.kind ?? tab}-${item.id}-${item.slug}`;
}

/**
 * KLIPY browser: search, trending, stickers, memes, favorites.
 * Multi-select with small preview strip; confirm imports into the library.
 */
export function GifSelector({
  open,
  onClose,
  roomId,
  multi = true,
  onPicked,
  onPickedMany,
}: Props) {
  const [tab, setTab] = useState<KlipyKind | 'favorites'>('gifs');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<GifSearchItem[]>([]);
  const [favorites, setFavorites] = useState<GifSearchItem[]>(() => loadGifFavorites());
  const [selected, setSelected] = useState<GifSearchItem[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [attribution, setAttribution] = useState('Powered by KLIPY');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
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

  useEffect(() => {
    if (!open) return;
    justOpenedRef.current = true;
    setFavorites(loadGifFavorites());
    setQuery('');
    setHovered(null);
    setSelected([]);
    setPage(1);
    setError('');
  }, [open]);

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

  const resolveKind = (item: GifSearchItem): KlipyKind => {
    const rawKind = (item.kind || (tab === 'favorites' ? 'gifs' : tab)) as string;
    return rawKind === 'stickers' || rawKind === 'memes' || rawKind === 'gifs' ? rawKind : 'gifs';
  };

  const importOne = async (item: GifSearchItem): Promise<{ media: Media; meta: GifSearchItem }> => {
    const kind = resolveKind(item);
    const media = await importGif({
      url: item.gif_url,
      title: item.title || item.slug,
      slug: item.slug,
      roomId,
      kind,
    });
    return { media, meta: { ...item, kind } };
  };

  const pickSingle = async (item: GifSearchItem) => {
    setImportingId(item.id);
    setError('');
    try {
      const { media, meta } = await importOne(item);
      onPicked(media, meta);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import impossible');
    } finally {
      setImportingId(null);
    }
  };

  const toggleSelect = (item: GifSearchItem) => {
    setSelected((prev) => {
      const key = itemKey(item, tab);
      if (prev.some((s) => itemKey(s, tab) === key)) {
        return prev.filter((s) => itemKey(s, tab) !== key);
      }
      if (prev.length >= MAX_MULTI) {
        setError(`Maximum ${MAX_MULTI} GIFs à la fois.`);
        return prev;
      }
      setError('');
      return [...prev, { ...item, kind: resolveKind(item) }];
    });
  };

  const confirmMulti = async () => {
    if (selected.length === 0) return;
    setImporting(true);
    setError('');
    try {
      const results: Array<{ media: Media; meta: GifSearchItem }> = [];
      for (const item of selected) {
        setImportingId(item.id);
        results.push(await importOne(item));
      }
      if (onPickedMany) {
        onPickedMany(results);
      } else {
        for (const r of results) onPicked(r.media, r.meta);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import impossible');
    } finally {
      setImportingId(null);
      setImporting(false);
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
  const selectedKeys = new Set(selected.map((s) => itemKey(s, s.kind || tab)));
  const busy = importing || !!importingId;

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

        {multi && selected.length > 0 && (
          <div className="rounded-xl border border-raid-accent/30 bg-raid-surface/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-raid-text-secondary">
                Sélection ({selected.length}/{MAX_MULTI})
              </p>
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setSelected([])}>
                Tout retirer
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.map((item) => {
                const key = itemKey(item, item.kind || tab);
                return (
                  <div
                    key={key}
                    className="group relative h-16 w-16 overflow-hidden rounded-lg border border-raid-border"
                  >
                    <img
                      src={item.preview_url}
                      alt={item.title || item.slug}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      title="Retirer"
                      className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100"
                      onClick={() =>
                        setSelected((prev) => prev.filter((s) => itemKey(s, s.kind || tab) !== key))
                      }
                    >
                      <X size={16} className="text-white" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
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
              <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
                {displayItems.map((item) => {
                  const key = itemKey(item, tab);
                  const isSelected = selectedKeys.has(key);
                  const thisBusy = importingId === item.id;
                  const fav = isGifFavorite(item);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={busy}
                      title={item.title || item.slug}
                      onMouseEnter={() => setHovered(item)}
                      onClick={() => {
                        if (multi) toggleSelect(item);
                        else void pickSingle(item);
                      }}
                      className={`group relative aspect-square overflow-hidden rounded-xl border bg-raid-bg transition disabled:opacity-60 ${
                        isSelected
                          ? 'border-raid-accent ring-2 ring-raid-accent/40'
                          : 'border-raid-border hover:border-raid-accent'
                      }`}
                    >
                      <img
                        src={item.preview_url}
                        alt={item.title || item.slug}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      {isSelected && (
                        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-raid-accent p-1 text-white">
                          <Check size={12} />
                        </span>
                      )}
                      <span
                        role="presentation"
                        onClick={(e) => onToggleFavorite(item, e)}
                        className={`absolute top-1.5 right-1.5 rounded-full p-1.5 ${
                          fav ? 'bg-raid-accent text-white' : 'bg-black/50 text-white/80'
                        }`}
                      >
                        <Heart size={12} fill={fav ? 'currentColor' : 'none'} />
                      </span>
                      {thisBusy && (
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
                  disabled={loading || busy}
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
                  {multi
                    ? 'Clique pour ajouter / retirer de la sélection'
                    : 'Clique pour importer et sélectionner'}
                </p>
              </>
            ) : (
              <p className="text-xs text-raid-text-secondary">
                Survole un résultat pour prévisualiser.
                {multi ? ' Sélectionne plusieurs GIFs puis confirme.' : ''}
              </p>
            )}
            <p className="mt-4 text-[10px] uppercase tracking-wide text-raid-text-secondary">
              {attribution}
              {enabled ? '' : ' · désactivé'}
            </p>
          </aside>
        </div>

        {multi && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-raid-border pt-3">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Annuler
            </Button>
            <Button
              disabled={selected.length === 0 || busy}
              onClick={() => void confirmMulti()}
            >
              {importing
                ? `Import ${importingId ? '…' : ''} (${selected.length})`
                : selected.length <= 1
                  ? 'Utiliser ce GIF'
                  : `Utiliser ${selected.length} GIFs`}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
