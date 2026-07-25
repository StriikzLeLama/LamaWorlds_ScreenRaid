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
  const caption = overlay.text?.trim() || null;
  const textColor = overlay.text_color || '#f5f5f5';
  const bgColor = overlay.bg_color || 'rgba(10,10,12,0.82)';

  const mediaStyle = {
    transform: `scale3d(${overlay.scale}, ${overlay.scale}, 1)`,
    opacity: overlay.opacity,
  };

  if (!src || failed) {
    return (
      <div className={animClass}>
        <div
          className="overlay-media pointer-events-none rounded-xl px-6 py-4 text-center"
          style={{
            background: 'rgba(20,20,22,0.94)',
            border: '2px solid #ef4444',
            color: '#f5f5f5',
            ...mediaStyle,
          }}
        >
          <p style={{ color: '#ef4444', fontSize: 12, fontWeight: 600 }}>MEDIA FAILED</p>
          <p style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{overlay.sender_name}</p>
          {caption && (
            <p style={{ marginTop: 8, fontSize: 16, fontWeight: 600 }}>{caption}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={animClass}>
      <div
        className="overlay-media pointer-events-none flex flex-col items-center gap-2"
        style={mediaStyle}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          onError={() => setFailed(true)}
          className="max-h-[65vh] max-w-[70vw] object-contain"
        />
        {caption && (
          <div
            className="max-w-[70vw] rounded-xl px-4 py-2 text-center"
            style={{
              background: bgColor,
              color: textColor,
              fontFamily: overlay.font_family || undefined,
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.25,
              textShadow: '0 1px 3px rgba(0,0,0,0.45)',
            }}
          >
            {caption}
          </div>
        )}
      </div>
    </div>
  );
}
