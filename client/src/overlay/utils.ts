import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { ActiveOverlay } from './types';

/** Prefer a local disk path (asset protocol) over a remote URL. */
export function overlayMediaSrc(overlay: ActiveOverlay): string | null {
  if (overlay.local_path) return convertFileSrc(overlay.local_path);
  return overlay.media_url;
}

/**
 * Map a prank animation name to CSS classes for enter / exit.
 * Exit always collapses to fade/zoom-out so we never leave a stuck transform.
 */
export function animationClass(animation: string, exiting: boolean): string {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (exiting) {
    if (reduced) return 'overlay-anim animate-overlay-fade-out';
    if (animation === 'zoom' || animation === 'pop') {
      return 'overlay-anim animate-overlay-zoom-out';
    }
    return 'overlay-anim animate-overlay-fade-out';
  }

  if (reduced) return 'overlay-anim animate-overlay-fade';

  switch (animation) {
    case 'zoom':
      return 'overlay-anim animate-overlay-zoom';
    case 'bounce':
      return 'overlay-anim animate-overlay-bounce';
    case 'slide_left':
      return 'overlay-anim animate-overlay-slide-left';
    case 'slide_right':
      return 'overlay-anim animate-overlay-slide-right';
    case 'slide_up':
      return 'overlay-anim animate-overlay-slide-up';
    case 'slide_down':
      return 'overlay-anim animate-overlay-slide-down';
    case 'shake':
      return 'overlay-anim animate-overlay-shake';
    case 'pop':
      return 'overlay-anim animate-overlay-pop';
    case 'none':
      return '';
    default:
      return 'overlay-anim animate-overlay-fade';
  }
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
