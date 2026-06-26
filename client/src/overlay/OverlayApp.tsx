import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { OverlayCanvas } from './components/OverlayCanvas';
import { log } from '../lib/log';
import type { ActiveOverlay, OverlayShowPayload } from './types';

const MAX_STACK = 4;

function exitDurationMs(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 350;
}

function parseMonitorIndex(label: string): number {
  const match = /^overlay-(\d+)$/.exec(label);
  return match ? Number.parseInt(match[1], 10) : 0;
}

export function OverlayApp() {
  const [overlays, setOverlays] = useState<ActiveOverlay[]>([]);
  const exitingCountRef = useRef(0);
  const monitorIndexRef = useRef(0);

  log.info('OverlayApp mounting');

  const requestSurfaceIdle = useCallback(() => {
    if (exitingCountRef.current > 0) return;
    void invoke('overlay_surface_idle', { monitorIndex: monitorIndexRef.current }).catch(
      (e) => log.warn('overlay_surface_idle failed', e),
    );
  }, []);

  useEffect(() => {
    try {
      const label = getCurrentWebviewWindow().label;
      monitorIndexRef.current = parseMonitorIndex(label);
      log.info('OverlayApp window label=', label, 'monitor=', monitorIndexRef.current);
    } catch (e) {
      log.warn('getCurrentWebviewWindow failed', e);
      monitorIndexRef.current = 0;
    }
  }, []);

  useEffect(() => {
    if (overlays.length === 0) {
      requestSurfaceIdle();
    }
  }, [overlays.length, requestSurfaceIdle]);

  useEffect(() => {
    const unsubs: Array<Promise<() => void>> = [];

    unsubs.push(
      listen<OverlayShowPayload>('overlay:show', (event) => {
        const payload = event.payload;
        log.info('overlay:show received', payload.id, payload.overlay_type);
        setOverlays((prev) => {
          const next = prev.filter((o) => o.id !== payload.id);
          const item: ActiveOverlay = { ...payload, visible: true, exiting: false };
          const merged = [...next, item];
          return merged.slice(-MAX_STACK);
        });
      }),
    );

    unsubs.push(
      listen<string>('overlay:hide', (event) => {
        const id = event.payload;
        log.info('overlay:hide received', id);
        exitingCountRef.current += 1;
        setOverlays((prev) =>
          prev.map((o) => (o.id === id ? { ...o, exiting: true } : o)),
        );
        window.setTimeout(() => {
          exitingCountRef.current = Math.max(0, exitingCountRef.current - 1);
          setOverlays((prev) => {
            const next = prev.filter((o) => o.id !== id);
            if (next.length === 0 && exitingCountRef.current === 0) {
              requestSurfaceIdle();
            }
            return next;
          });
        }, exitDurationMs());
      }),
    );

    unsubs.push(
      listen('overlay:clear', () => {
        exitingCountRef.current = 0;
        setOverlays([]);
        requestSurfaceIdle();
      }),
    );

    // Pull any overlays that were shown before this webview mounted its
    // listeners (race when the overlay window is created fresh).
    log.info('OverlayApp syncing overlays for monitor', monitorIndexRef.current);
    void invoke('sync_overlays_for_monitor', {
      monitorIndex: monitorIndexRef.current,
    })
      .then(() => log.info('OverlayApp sync done'))
      .catch((e) => log.error('sync_overlays_for_monitor failed', e));

    return () => {
      unsubs.forEach((p) => p.then((fn) => fn()));
    };
  }, [requestSurfaceIdle]);

  return <OverlayCanvas overlays={overlays} />;
}
