import { Trash2 } from 'lucide-react';
import { MediaThumb } from './MediaThumb';
import { type Media } from '../services/media';
import { useT } from '../hooks/useT';

interface Props {
  items: Media[];
  value: string;
  onChange: (mediaId: string) => void;
  /** When set, shows a trash control that permanently deletes from the library. */
  onDelete?: (media: Media) => void;
  emptyHint?: string;
  /** Compact grid for room composer (default true). */
  compact?: boolean;
}

/**
 * Grid of library media for picking a raid asset.
 * Optional onDelete lets the room composer remove files without leaving the page.
 */
export function MediaPicker({
  items,
  value,
  onChange,
  onDelete,
  emptyHint,
  compact = true,
}: Props) {
  const t = useT();
  if (items.length === 0) {
    return (
      <p className="text-xs text-raid-text-secondary">
        {emptyHint ?? t('media.emptyLibrary')}
      </p>
    );
  }

  return (
    <div
      className={
        compact
          ? 'grid max-h-40 grid-cols-5 gap-1.5 overflow-y-auto sm:grid-cols-6 md:grid-cols-7'
          : 'grid max-h-48 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4'
      }
    >
      {items.map((m) => {
        const selected = m.id === value;
        return (
          <div
            key={m.id}
            className={`group relative overflow-hidden rounded-lg border transition ${
              selected
                ? 'border-raid-accent bg-raid-accent/10 ring-1 ring-raid-accent'
                : 'border-raid-border bg-raid-bg/40 hover:border-raid-accent/60'
            }`}
          >
            <button
              type="button"
              title={m.original_name}
              onClick={() => onChange(m.id)}
              className="block w-full p-1 text-left"
            >
              <div className="aspect-square w-full overflow-hidden rounded-md">
                <MediaThumb media={m} sizeClass="h-full w-full" />
              </div>
              {!compact && (
                <span className="mt-1 block truncate px-0.5 text-[11px] text-raid-text">
                  {m.original_name}
                </span>
              )}
            </button>
            {onDelete && (
              <button
                type="button"
                title={t('media.delete')}
                aria-label={t('media.delete')}
                className="absolute right-0.5 top-0.5 rounded bg-black/70 p-0.5 text-white opacity-0 transition group-hover:opacity-100 hover:bg-raid-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(m);
                }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
