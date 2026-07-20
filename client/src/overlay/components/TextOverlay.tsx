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
        className="overlay-media pointer-events-none max-w-[80vw] rounded-2xl px-10 py-8 text-center"
        style={{
          transform: `scale3d(${overlay.scale}, ${overlay.scale}, 1)`,
          opacity: overlay.opacity,
          background: 'rgba(20, 20, 22, 0.94)',
          border: '2px solid #f97316',
          boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
        }}
      >
        <p
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: '#f97316' }}
        >
          {overlay.sender_name}
        </p>
        <p className="mt-2 text-3xl font-bold" style={{ color: '#f5f5f5' }}>
          {overlay.text}
        </p>
      </div>
    </div>
  );
}
