import { memo, useCallback, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ActiveOverlay } from '../types';
import { ImageOverlay } from './ImageOverlay';
import { TextOverlay } from './TextOverlay';
import { VideoOverlay } from './VideoOverlay';
import { log } from '../../lib/log';
import { useT } from '../../hooks/useT';

interface Props {
  overlays: ActiveOverlay[];
}

function TakeoverBanner({ overlay }: { overlay: ActiveOverlay }) {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background:
          overlay.bg_color ||
          'linear-gradient(180deg, rgba(11,17,29,0.95), rgba(15,23,42,0.92))',
        opacity: overlay.opacity,
      }}
    >
      <div className="text-center">
        <p
          className="text-sm font-semibold uppercase tracking-[0.35em]"
          style={{ color: overlay.accent_color || '#2dd4bf' }}
        >
          {overlay.sender_name}
        </p>
        <p
          className="mt-4 text-5xl font-black tracking-tight md:text-7xl"
          style={{ color: overlay.text_color || '#f1f5f9' }}
        >
          {overlay.text || 'RAID INCOMING'}
        </p>
      </div>
    </div>
  );
}

function ClickbaitChrome({
  overlay,
  children,
}: {
  overlay: ActiveOverlay;
  children: ReactNode;
}) {
  const t = useT();
  const [spawned, setSpawned] = useState(false);

  const onFakeClose = useCallback(async () => {
    if (spawned) return;
    setSpawned(true);
    try {
      await invoke('show_overlay', {
        payload: {
          id: `${overlay.id}-bait`,
          overlay_type: overlay.overlay_type,
          media_url: overlay.media_url,
          local_path: overlay.local_path,
          text: overlay.text,
          duration_ms: Math.max(overlay.duration_ms, 2500),
          animation: 'bounce',
          sender_name: overlay.sender_name,
          position_x: 0.2 + Math.random() * 0.6,
          position_y: 0.2 + Math.random() * 0.6,
          monitor_index: overlay.monitor_index,
          scale: Math.max(0.7, overlay.scale * 0.9),
          opacity: overlay.opacity,
          volume: overlay.volume,
          sfx: 'pop',
          text_color: overlay.text_color ?? null,
          bg_color: overlay.bg_color ?? null,
          accent_color: overlay.accent_color ?? null,
          font_family: overlay.font_family ?? null,
          motion: null,
        },
      });
      await invoke('set_overlay_clickthrough', {
        monitorIndex: overlay.monitor_index,
        ignore: true,
      });
    } catch (e) {
      log.warn('clickbait second raid failed', e);
    }
  }, [overlay, spawned]);

  return (
    <div className="relative flex flex-col items-center gap-3">
      {children}
      <button
        type="button"
        onClick={() => void onFakeClose()}
        className="pointer-events-auto cursor-pointer rounded-md border border-slate-500 bg-slate-800 px-4 py-1.5 text-sm font-semibold text-slate-100 shadow-lg hover:bg-slate-700"
        style={{ fontFamily: 'Segoe UI, system-ui, sans-serif' }}
      >
        {t('overlay.close')}
      </button>
      {spawned && (
        <span className="pointer-events-none text-xs font-bold text-teal-300">gotcha ✨</span>
      )}
    </div>
  );
}

const OverlayItem = memo(function OverlayItem({ overlay }: { overlay: ActiveOverlay }) {
  const type = overlay.overlay_type;
  const motion = overlay.motion;

  if (motion === 'takeover_banner') {
    return <TakeoverBanner overlay={overlay} />;
  }

  const body =
    type === 'text' ? (
      <TextOverlay overlay={overlay} />
    ) : type === 'video' ? (
      <VideoOverlay overlay={overlay} />
    ) : (
      <ImageOverlay overlay={overlay} />
    );

  return (
    <div
      className={`overlay-item absolute ${motion === 'clickbait' ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{
        left: `${overlay.position_x * 100}%`,
        top: `${overlay.position_y * 100}%`,
        transform: 'translate3d(-50%, -50%, 0)',
        zIndex: 10,
        transition: 'left 40ms linear, top 40ms linear',
      }}
    >
      {motion === 'clickbait' ? (
        <ClickbaitChrome overlay={overlay}>{body}</ClickbaitChrome>
      ) : (
        body
      )}
    </div>
  );
});

export function OverlayCanvas({ overlays }: Props) {
  return (
    <div className="overlay-root fixed inset-0 overflow-visible bg-transparent">
      {overlays.map((o) => (
        <OverlayItem key={o.id} overlay={o} />
      ))}
    </div>
  );
}
