import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { Card, Button, Badge } from '../components/ui';
import { MediaThumb } from '../components/MediaThumb';
import {
  formatBytes,
  listMedia,
  uploadMedia,
  deleteMedia,
  getMediaStorage,
  type Media,
  type MediaStorageUsage,
} from '../services/media';
import { formatCompressionNote, maybeCompressImage } from '../lib/compressImage';
import { useT } from '../hooks/useT';
import { revokeMediaPreview } from '../services/mediaPreview';

function StorageBar({ usage }: { usage: MediaStorageUsage }) {
  const t = useT();
  const pct =
    usage.quota_bytes > 0
      ? Math.min(100, Math.round((usage.used_bytes / usage.quota_bytes) * 1000) / 10)
      : 0;
  const warn = pct >= 85;
  const full = pct >= 100;
  const barColor = full
    ? 'bg-raid-danger'
    : warn
      ? 'bg-raid-warning'
      : 'bg-raid-accent';

  return (
    <Card>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-raid-text">{t('media.storage')}</p>
          <p className="mt-0.5 text-xs text-raid-text-secondary">
            {t('media.storageUsed', {
              used: formatBytes(usage.used_bytes),
              remaining: formatBytes(usage.remaining_bytes),
            })}
            {usage.enforced ? '' : ` ${t('media.softLimit')}`}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-raid-text">
          {pct}%
          <span className="ml-1 font-normal text-raid-text-secondary">
            / {formatBytes(usage.quota_bytes)}
          </span>
        </p>
      </div>
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-raid-surface"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('media.storage')}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Card>
  );
}

export function MediaLibraryPage() {
  const t = useT();
  const [items, setItems] = useState<Media[]>([]);
  const [storage, setStorage] = useState<MediaStorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, usage] = await Promise.all([
        listMedia({ page: 1, limit: 50 }),
        getMediaStorage().catch(() => null),
      ]);
      setItems(res.items ?? []);
      setStorage(usage);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('media.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    setHint(null);
    try {
      for (const file of Array.from(files)) {
        const compressed = await maybeCompressImage(file);
        const note = formatCompressionNote(
          compressed.originalBytes,
          compressed.compressedBytes,
          t,
        );
        if (note) setHint(note);
        await uploadMedia(compressed.file, undefined, setProgress);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('media.uploadFailed'));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMedia(id);
      revokeMediaPreview(id);
      setItems((prev) => prev.filter((m) => m.id !== id));
      const usage = await getMediaStorage().catch(() => null);
      setStorage(usage);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('media.deleteFailed'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-raid-text">{t('media.title')}</h1>
          <p className="text-sm text-raid-text-secondary">{t('media.subtitle')}</p>
          <p className="mt-1 text-xs text-raid-text-secondary">{t('compress.limits')}</p>
        </div>
        <Button disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Upload size={18} />
          {uploading ? t('media.uploading', { pct: String(progress) }) : t('media.upload')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {storage && <StorageBar usage={storage} />}

      {hint && (
        <div className="rounded-lg border border-raid-accent/30 bg-raid-accent/10 px-4 py-2 text-sm text-raid-text">
          {hint}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <Card>
          <p className="text-sm text-raid-text-secondary">{t('common.loading')}</p>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <div
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-raid-border py-16"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void handleFiles(e.dataTransfer.files);
            }}
          >
            <Upload size={32} className="text-raid-text-secondary" />
            <p className="mt-3 text-sm font-medium text-raid-text">{t('media.emptyTitle')}</p>
            <p className="mt-1 max-w-sm text-center text-sm text-raid-text-secondary">
              {t('media.emptyHint')}
            </p>
            <Button className="mt-4" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> {t('media.emptyCta')}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <div className="flex items-start gap-3">
                <MediaThumb media={item} sizeClass="h-16 w-16" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-raid-text">
                    {item.original_name}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge>{item.media_type}</Badge>
                    <span className="text-xs text-raid-text-secondary">
                      {formatBytes(item.size_bytes)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(item.id)}
                  className="rounded p-1 text-raid-text-secondary hover:bg-raid-surface hover:text-red-400"
                  aria-label={t('media.delete')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
