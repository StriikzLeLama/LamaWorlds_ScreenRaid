import { useEffect, useState } from 'react';
import { Music, Video } from 'lucide-react';
import { animationClass } from '../lib/overlayAnimation';
import type { Animation } from '../services/pranks';
import type { Media } from '../services/media';
import type { OverlayType } from '../services/pranks';
import { resolveMediaPreviewUrl } from '../services/mediaPreview';
import { useT } from '../hooks/useT';
import '../overlay/overlay.css';

interface Props {
  animation: Animation;
  label?: string;
  overlayType?: OverlayType;
  /** Primary media for image/gif/video preview */
  media?: Media | null;
  /** Extra media when raid bomb / multi-select */
  mediaList?: Media[];
  textColor?: string;
  bgColor?: string;
  accentColor?: string;
  fontFamily?: string;
  opacity?: number;
  scale?: number;
}

function MediaVisual({
  media,
  className = 'max-h-24 max-w-full rounded-lg object-contain',
}: {
  media: Media;
  className?: string;
}) {
  const visual =
    media.media_type === 'image' ||
    media.media_type === 'gif' ||
    media.media_type === 'video';
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
    const Icon = media.media_type === 'video' ? Video : Music;
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-raid-surface text-raid-accent">
        <Icon size={28} />
      </div>
    );
  }

  if (media.media_type === 'video') {
    return (
      <video
        src={src}
        className={className}
        muted
        loop
        autoPlay
        playsInline
      />
    );
  }

  return (
    <img
      src={src}
      alt={media.original_name}
      className={className}
    />
  );
}

/** Live miniature of the raid before sending — shows media when selected. */
export function AnimationPreview({
  animation,
  label = 'Preview',
  overlayType = 'text',
  media,
  mediaList = [],
  textColor = '#f5f5f5',
  bgColor = 'rgba(20,20,22,0.94)',
  accentColor = '#2dd4bf',
  fontFamily,
  opacity = 1,
  scale = 1,
}: Props) {
  const t = useT();
  const anim = animationClass(animation, false);
  const previewKey = `${animation}|${label}|${media?.id ?? ''}|${scale}|${textColor}|${bgColor}|${accentColor}|${fontFamily ?? ''}`;
  const extras = mediaList.filter((m) => m.id !== media?.id);
  const showTextCard = overlayType === 'text' || (!media && overlayType !== 'sound');
  const caption = label.trim();

  return (
    <div className="rounded-xl border border-raid-border bg-raid-bg/80 p-4">
      <p className="mb-3 text-xs text-raid-text-secondary">{t('animation.preview')}</p>
      <div className="relative flex min-h-28 items-center justify-center overflow-visible py-2">
        <div key={previewKey} className={anim}>
          <div
            style={{
              opacity,
              transform: `scale3d(${scale}, ${scale}, 1)`,
            }}
          >
          {showTextCard ? (
            <div
              className="rounded-xl px-5 py-3 text-center"
              style={{
                background: bgColor,
                border: `2px solid ${accentColor}`,
                color: textColor,
                fontFamily: fontFamily || undefined,
              }}
            >
              <p className="text-[10px] uppercase tracking-wide" style={{ color: accentColor }}>
                Raid
              </p>
              <p className="max-w-[220px] truncate text-sm font-bold">{caption || t('room.preview')}</p>
            </div>
          ) : media ? (
            <div className="flex flex-col items-center gap-2">
              <MediaVisual media={media} />
              {caption && overlayType !== 'sound' && (
                <p
                  className="max-w-[240px] truncate text-center text-xs font-medium"
                  style={{ color: textColor }}
                >
                  {caption}
                </p>
              )}
              {extras.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {extras.slice(0, 4).map((m) => (
                    <MediaVisual
                      key={m.id}
                      media={m}
                      className="h-10 w-10 rounded-md object-cover"
                    />
                  ))}
                  {extras.length > 4 && (
                    <span className="self-center text-xs text-raid-text-secondary">
                      +{extras.length - 4}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
