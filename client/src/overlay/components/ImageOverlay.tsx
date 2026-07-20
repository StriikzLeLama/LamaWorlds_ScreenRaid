import { useState } from 'react';
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
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={animClass}>
        <div
          className="overlay-media pointer-events-none rounded-xl px-6 py-4 text-center"
          style={{
            background: 'rgba(20,20,22,0.94)',
            border: '2px solid #ef4444',
            color: '#f5f5f5',
            transform: `scale3d(${overlay.scale}, ${overlay.scale}, 1)`,
            opacity: overlay.opacity,
          }}
        >
          <p style={{ color: '#ef4444', fontSize: 12, fontWeight: 600 }}>MEDIA FAILED</p>
          <p style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{overlay.sender_name}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={animClass}>
      <img
        src={src}
        alt=""
        draggable={false}
        decoding="async"
        onError={() => setFailed(true)}
        className="overlay-media pointer-events-none max-h-[70vh] max-w-[70vw] object-contain"
        style={{
          transform: `scale3d(${overlay.scale}, ${overlay.scale}, 1)`,
          opacity: overlay.opacity,
        }}
      />
    </div>
  );
}
