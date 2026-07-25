import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { Card, Button, Badge } from '../components/ui';
import { MediaThumb } from '../components/MediaThumb';
import { formatBytes, listMedia, uploadMedia, deleteMedia, type Media } from '../services/media';
import { formatCompressionNote, maybeCompressImage } from '../lib/compressImage';
import { useT } from '../hooks/useT';
import { revokeMediaPreview } from '../services/mediaPreview';

export function MediaLibraryPage() {
  const t = useT();
  const [items, setItems] = useState<Media[]>([]);
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
      const res = await listMedia({ page: 1, limit: 50 });
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load media');
    } finally {
      setLoading(false);
    }
  }, []);

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
      setError(e instanceof Error ? e.message : 'Upload failed');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-raid-text">Media Library</h1>
          <p className="text-sm text-raid-text-secondary">
            Images, GIFs, videos, and sounds for pranks
          </p>
          <p className="mt-1 text-xs text-raid-text-secondary">{t('compress.limits')}</p>
        </div>
        <Button disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Upload size={18} />
          {uploading ? `${progress}%` : 'Upload'}
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
          <p className="text-sm text-raid-text-secondary">Loading media…</p>
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
            <p className="mt-3 text-sm text-raid-text-secondary">
              Drag & drop or click Upload to add media
            </p>
            <p className="mt-1 text-xs text-raid-text-secondary">
              PNG, JPEG, WebP, GIF, MP4, WebM, MP3, WAV, OGG — size limits apply
            </p>
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
                  aria-label="Delete"
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
