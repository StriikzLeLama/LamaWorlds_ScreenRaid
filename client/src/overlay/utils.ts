import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { ActiveOverlay } from './types';

export function overlayMediaSrc(overlay: ActiveOverlay): string | null {
  if (overlay.local_path) return convertFileSrc(overlay.local_path);
  return overlay.media_url;
}

export function animationClass(animation: string, exiting: boolean): string {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (exiting) {
    if (reduced) return 'overlay-anim animate-overlay-fade-out';
    if (animation === 'zoom') return 'overlay-anim animate-overlay-zoom-out';
    return 'overlay-anim animate-overlay-fade-out';
  }
  if (animation === 'zoom') return 'overlay-anim animate-overlay-zoom';
  if (animation === 'bounce') return 'overlay-anim animate-overlay-bounce';
  if (animation === 'none') return '';
  return 'overlay-anim animate-overlay-fade';
}

/** Drop will-change after entrance animation to avoid permanent GPU layer cost. */
export function useAnimationDone(active: boolean, ms: number): boolean {
  const [done, setDone] = useState(!active);
  useEffect(() => {
    if (!active) {
      setDone(true);
      return;
    }
    setDone(false);
    const timer = window.setTimeout(() => setDone(true), ms);
    return () => window.clearTimeout(timer);
  }, [active, ms]);
  return done;
}
