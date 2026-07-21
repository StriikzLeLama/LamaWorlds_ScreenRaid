import { useEffect, useState } from 'react';
import { Image, Music, Video } from 'lucide-react';
import { resolveMediaPreviewUrl } from '../services/mediaPreview';
import type { Media } from '../services/media';

interface Props {
  media: Media;
  className?: string;
  /** Square thumb size classes; default h-14 w-14 */
  sizeClass?: string;
}

function TypeFallback({ type, sizeClass }: { type: Media['media_type']; sizeClass: string }) {
  const Icon = type === 'video' ? Video : type === 'audio' ? Music : Image;
  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-raid-surface text-raid-accent ${sizeClass}`}
    >
      <Icon size={22} />
    </div>
  );
}

export function MediaThumb({ media, className = '', sizeClass = 'h-14 w-14' }: Props) {
  const visual = media.media_type === 'image' || media.media_type === 'gif';
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visual) return;
    let cancelled = false;
    setFailed(false);
    setSrc(null);
    void resolveMediaPreviewUrl(media)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [media, visual]);

  if (!visual || failed || !src) {
    return <TypeFallback type={media.media_type} sizeClass={sizeClass} />;
  }

  return (
    <img
      src={src}
      alt={media.original_name}
      className={`${sizeClass} rounded-lg object-cover bg-raid-surface ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
