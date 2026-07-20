import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { ActiveOverlay } from './types';

export { animationClass } from '../lib/overlayAnimation';

/** Prefer a local disk path (asset protocol) over a remote URL. */
export function overlayMediaSrc(overlay: ActiveOverlay): string | null {
  if (overlay.local_path) return convertFileSrc(overlay.local_path);
  return overlay.media_url;
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
