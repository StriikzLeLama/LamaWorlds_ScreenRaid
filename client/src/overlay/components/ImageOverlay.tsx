import type { ActiveOverlay } from '../types';
import { animationClass, overlayMediaSrc, useAnimationDone } from '../utils';

interface Props {
  overlay: ActiveOverlay;
}

export function ImageOverlay({ overlay }: Props) {
  const src = overlayMediaSrc(overlay);
  const exiting = Boolean(overlay.exiting);
  const animDone = useAnimationDone(!exiting, 500);
  const anim = animationClass(overlay.animation, exiting);
  const animClass = animDone && !exiting ? `${anim} overlay-anim--done` : anim;

  if (!src) return null;

  return (
    <div className={animClass}>
      <img
        src={src}
        alt=""
        draggable={false}
        decoding="async"
        className="overlay-media pointer-events-none max-h-[70vh] max-w-[70vw] object-contain"
        style={{
          transform: `scale3d(${overlay.scale}, ${overlay.scale}, 1)`,
          opacity: overlay.opacity,
        }}
      />
    </div>
  );
}
