import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { OverlayCanvas } from './components/OverlayCanvas';
import { log } from '../lib/log';
import { playEntranceSfx } from '../lib/sfx';
import type { ActiveOverlay, OverlayShowPayload } from './types';

const MAX_STACK = 8;

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
  const readyRef = useRef(false);
  // Must stay at component top-level — a useRef inside useEffect is an invalid
  // hook call and aborts listener setup (blank always-on-top surface).
  const playedSfxRef = useRef(new Set<string>());

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
    if (overlays.length === 0 && readyRef.current) {
      requestSurfaceIdle();
    }
  }, [overlays.length, requestSurfaceIdle]);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    const onShow = (payload: OverlayShowPayload) => {
      log.info('overlay:show received', payload.id, payload.overlay_type);
      // Play entrance SFX once per overlay id (retries/sync re-emit overlay:show).
      if (
        payload.sfx &&
        payload.sfx !== 'none' &&
        !playedSfxRef.current.has(payload.id)
      ) {
        playedSfxRef.current.add(payload.id);
        playEntranceSfx(payload.sfx, 0.35);
      }
      setOverlays((prev) => {
        const next = prev.filter((o) => o.id !== payload.id);
        const item: ActiveOverlay = { ...payload, visible: true, exiting: false };
        return [...next, item].slice(-MAX_STACK);
      });
    };

    const onHide = (id: string) => {
      log.info('overlay:hide received', id);
      playedSfxRef.current.delete(id);
      exitingCountRef.current += 1;
      setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, exiting: true } : o)));
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
    };

    (async () => {
      try {
        // Await every listener BEFORE sync — otherwise the first overlay:show
        // (and the sync re-emit) are dropped and nothing paints on screen.
        const showUnsub = await listen<OverlayShowPayload>('overlay:show', (event) => {
          onShow(event.payload);
        });
        if (cancelled) {
          showUnsub();
          return;
        }
        unlisteners.push(showUnsub);

        const hideUnsub = await listen<string>('overlay:hide', (event) => {
          onHide(event.payload);
        });
        if (cancelled) {
          hideUnsub();
          return;
        }
        unlisteners.push(hideUnsub);

        const clearUnsub = await listen('overlay:clear', () => {
          exitingCountRef.current = 0;
          playedSfxRef.current.clear();
          setOverlays([]);
          requestSurfaceIdle();
        });
        if (cancelled) {
          clearUnsub();
          return;
        }
        unlisteners.push(clearUnsub);

        readyRef.current = true;
        log.info('OverlayApp listeners ready, syncing monitor', monitorIndexRef.current);

        await invoke('sync_overlays_for_monitor', {
          monitorIndex: monitorIndexRef.current,
        });
        log.info('OverlayApp sync done');

        // Second pull shortly after — covers payloads stored while the first
        // sync raced with window show / click-through re-apply.
        window.setTimeout(() => {
          if (cancelled) return;
          void invoke('sync_overlays_for_monitor', {
            monitorIndex: monitorIndexRef.current,
          }).catch((e) => log.warn('OverlayApp delayed sync failed', e));
        }, 400);
      } catch (e) {
        log.error('OverlayApp listener setup failed', e);
      }
    })();

    return () => {
      cancelled = true;
      readyRef.current = false;
      unlisteners.forEach((fn) => fn());
    };
  }, [requestSurfaceIdle]);

  return <OverlayCanvas overlays={overlays} />;
}
