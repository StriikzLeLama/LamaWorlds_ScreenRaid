import type { ActiveOverlay } from '../types';
import { animationClass, useAnimationDone } from '../utils';

interface Props {
  overlay: ActiveOverlay;
}

export function TextOverlay({ overlay }: Props) {
  const exiting = Boolean(overlay.exiting);
  const animDone = useAnimationDone(!exiting, 500);
  const anim = animationClass(overlay.animation, exiting);
  const animClass = animDone && !exiting ? `${anim} overlay-anim--done` : anim;

  if (!overlay.text) return null;

  return (
    <div className={animClass}>
      <div
        className="overlay-media pointer-events-none max-w-[80vw] rounded-2xl border border-raid-border bg-raid-card/95 px-8 py-6 text-center"
        style={{
          transform: `scale3d(${overlay.scale}, ${overlay.scale}, 1)`,
          opacity: overlay.opacity,
        }}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-raid-accent">
          {overlay.sender_name}
        </p>
        <p className="mt-2 text-3xl font-bold text-raid-text">{overlay.text}</p>
      </div>
    </div>
  );
}
