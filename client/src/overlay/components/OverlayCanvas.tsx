import type { ActiveOverlay } from '../types';
import { ImageOverlay } from './ImageOverlay';
import { TextOverlay } from './TextOverlay';

interface Props {
  overlays: ActiveOverlay[];
}

function OverlayItem({ overlay }: { overlay: ActiveOverlay }) {
  const isText = overlay.overlay_type === 'text';

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${overlay.position_x * 100}%`,
        top: `${overlay.position_y * 100}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: 10,
      }}
    >
      {isText ? <TextOverlay overlay={overlay} /> : <ImageOverlay overlay={overlay} />}
    </div>
  );
}

export function OverlayCanvas({ overlays }: Props) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-transparent">
      {overlays.map((o) => (
        <OverlayItem key={o.id} overlay={o} />
      ))}
    </div>
  );
}
