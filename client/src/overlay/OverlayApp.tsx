import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { OverlayCanvas } from './components/OverlayCanvas';
import type { ActiveOverlay, OverlayShowPayload } from './types';

const MAX_STACK = 4;

export function OverlayApp() {
  const [overlays, setOverlays] = useState<ActiveOverlay[]>([]);

  useEffect(() => {
    const unsubs: Array<Promise<() => void>> = [];

    unsubs.push(
      listen<OverlayShowPayload>('overlay:show', (event) => {
        const payload = event.payload;
        setOverlays((prev) => {
          const next = prev.filter((o) => o.id !== payload.id);
          const item: ActiveOverlay = { ...payload, visible: true };
          const merged = [...next, item];
          return merged.slice(-MAX_STACK);
        });
      }),
    );

    unsubs.push(
      listen<string>('overlay:hide', (event) => {
        const id = event.payload;
        setOverlays((prev) => prev.filter((o) => o.id !== id));
      }),
    );

    unsubs.push(
      listen('overlay:clear', () => {
        setOverlays([]);
      }),
    );

    return () => {
      unsubs.forEach((p) => p.then((fn) => fn()));
    };
  }, []);

  return <OverlayCanvas overlays={overlays} />;
}
