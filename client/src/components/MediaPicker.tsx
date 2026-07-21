import { MediaThumb } from './MediaThumb';
import { formatBytes, type Media } from '../services/media';

interface Props {
  items: Media[];
  value: string;
  onChange: (mediaId: string) => void;
  emptyHint?: string;
}

export function MediaPicker({ items, value, onChange, emptyHint }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-raid-text-secondary">
        {emptyHint ?? 'Aucun media dans la bibliothèque pour ce type.'}
      </p>
    );
  }

  return (
    <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
      {items.map((m) => {
        const selected = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            title={m.original_name}
            onClick={() => onChange(m.id)}
            className={`flex flex-col items-stretch gap-1 rounded-xl border p-1.5 text-left transition ${
              selected
                ? 'border-raid-accent bg-raid-accent/10 ring-1 ring-raid-accent'
                : 'border-raid-border bg-raid-bg/40 hover:border-raid-accent/60'
            }`}
          >
            <div className="aspect-square w-full overflow-hidden rounded-lg">
              <MediaThumb media={m} sizeClass="h-full w-full" />
            </div>
            <span className="truncate px-0.5 text-[11px] text-raid-text">{m.original_name}</span>
            <span className="px-0.5 text-[10px] text-raid-text-secondary">
              {formatBytes(m.size_bytes)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
