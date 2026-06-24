import { memo } from 'react';
import type { ActiveOverlay } from '../types';
import { ImageOverlay } from './ImageOverlay';
import { TextOverlay } from './TextOverlay';
import { VideoOverlay } from './VideoOverlay';

interface Props {
  overlays: ActiveOverlay[];
}

const OverlayItem = memo(function OverlayItem({ overlay }: { overlay: ActiveOverlay }) {
  const type = overlay.overlay_type;

  return (
    <div
      className="overlay-item pointer-events-none absolute"
      style={{
        left: `${overlay.position_x * 100}%`,
        top: `${overlay.position_y * 100}%`,
        transform: 'translate3d(-50%, -50%, 0)',
        zIndex: 10,
      }}
    >
      {type === 'text' ? (
        <TextOverlay overlay={overlay} />
      ) : type === 'video' ? (
        <VideoOverlay overlay={overlay} />
      ) : (
        <ImageOverlay overlay={overlay} />
      )}
    </div>
  );
});

export function OverlayCanvas({ overlays }: Props) {
  return (
    <div className="overlay-root fixed inset-0 overflow-hidden bg-transparent">
      {overlays.map((o) => (
        <OverlayItem key={o.id} overlay={o} />
      ))}
    </div>
  );
}
