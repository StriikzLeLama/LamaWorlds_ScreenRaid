import type { ActiveOverlay } from '../types';

interface Props {
  overlay: ActiveOverlay;
}

export function TextOverlay({ overlay }: Props) {
  if (!overlay.text) return null;

  const animClass =
    overlay.animation === 'zoom'
      ? 'animate-overlay-zoom'
      : overlay.animation === 'bounce'
        ? 'animate-overlay-bounce'
        : 'animate-overlay-fade';

  return (
    <div
      className={`pointer-events-none max-w-[80vw] rounded-2xl border border-raid-border bg-raid-card/95 px-8 py-6 text-center shadow-2xl ${animClass}`}
      style={{
        transform: `scale(${overlay.scale})`,
        opacity: overlay.opacity,
      }}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-raid-accent">
        {overlay.sender_name}
      </p>
      <p className="mt-2 text-3xl font-bold text-raid-text">{overlay.text}</p>
    </div>
  );
}
