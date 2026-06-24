import { useEffect, useRef, useState } from 'react';
import type { ActiveOverlay } from '../types';
import { animationClass, overlayMediaSrc, useAnimationDone } from '../utils';

interface Props {
  overlay: ActiveOverlay;
}

function releaseVideo(el: HTMLVideoElement | null): void {
  if (!el) return;
  el.pause();
  el.removeAttribute('src');
  el.load();
}

export function VideoOverlay({ overlay }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const src = overlayMediaSrc(overlay);
  const exiting = Boolean(overlay.exiting);
  const animDone = useAnimationDone(!exiting, 500);
  const [failedAudio, setFailedAudio] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !src || exiting) return;

    el.volume = Math.min(1, Math.max(0, overlay.volume ?? 0.8));
    el.muted = failedAudio;
    void el.play().catch(() => {
      setFailedAudio(true);
      el.muted = true;
      void el.play().catch(() => undefined);
    });
  }, [src, overlay.volume, exiting, failedAudio]);

  useEffect(() => {
    if (exiting) {
      releaseVideo(ref.current);
    }
  }, [exiting]);

  useEffect(() => () => releaseVideo(ref.current), []);

  if (!src) return null;

  const anim = animationClass(overlay.animation, exiting);
  const animClass = animDone && !exiting ? `${anim} overlay-anim--done` : anim;

  return (
    <div className={animClass}>
      <video
        ref={ref}
        src={src}
        loop
        playsInline
        preload="metadata"
        className="overlay-media pointer-events-none max-h-[70vh] max-w-[70vw] object-contain"
        style={{
          transform: `scale3d(${overlay.scale}, ${overlay.scale}, 1)`,
          opacity: overlay.opacity,
        }}
      />
    </div>
  );
}
