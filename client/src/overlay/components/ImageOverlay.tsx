import type { ActiveOverlay } from '../types';

interface Props {
  overlay: ActiveOverlay;
}

export function ImageOverlay({ overlay }: Props) {
  if (!overlay.media_url) return null;

  const animClass =
    overlay.animation === 'zoom'
      ? 'animate-overlay-zoom'
      : overlay.animation === 'bounce'
        ? 'animate-overlay-bounce'
        : 'animate-overlay-fade';

  return (
    <img
      src={overlay.media_url}
      alt=""
      draggable={false}
      className={`pointer-events-none max-h-[70vh] max-w-[70vw] object-contain drop-shadow-2xl ${animClass}`}
      style={{
        transform: `scale(${overlay.scale})`,
        opacity: overlay.opacity,
      }}
    />
  );
}
