import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useConsentStore } from '../stores/consentStore';
import { enforceCacheLimit, resolveMediaForPrank } from '../services/mediaCache';
import { ackPrank, type PrankIncomingPayload } from '../services/pranks';
import { onWsMessage } from '../services/websocket';
import { unlockAudio } from '../lib/sfx';
import { log } from '../lib/log';
import { getMySecurityPrefs } from '../services/security';
import {
  isCursorMotion,
  runCursorMotion,
  sampleCursor,
  type MotionPreset,
} from '../lib/cursorMotion';

/** Minimum gap between accepted overlays on this device (from account security prefs). */
let lastLocalPrankAt = 0;
/** Sliding window for inbound burst protection (raid bomb / flood). */
const inboundWindow: number[] = [];
const INBOUND_WINDOW_MS = 10_000;
const INBOUND_MAX = 12;

function isVideoOverlay(prank: PrankIncomingPayload): boolean {
  if (prank.overlay_type === 'video') return true;
  const mime = prank.media?.mime_type ?? '';
  return mime.startsWith('video/');
}

function isFullscreenMotion(preset: MotionPreset): boolean {
  return preset === 'takeover' || preset === 'clickbait';
}

async function playSoundPrank(
  mediaUrl: string,
  volume: number,
  durationMs: number,
): Promise<void> {
  const audio = new Audio(mediaUrl);
  audio.volume = Math.min(1, Math.max(0, volume));
  await audio.play();
  window.setTimeout(() => {
    audio.pause();
    audio.src = '';
  }, durationMs);
}

function safeNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

type OverlayInvokePayload = {
  id: string;
  overlay_type: string;
  media_url: string | null;
  local_path: string | null;
  text: string | null;
  duration_ms: number;
  animation: string;
  sender_name: string;
  position_x: number;
  position_y: number;
  monitor_index: number;
  scale: number;
  opacity: number;
  volume: number;
  sfx: string;
  text_color: string | null;
  bg_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  motion: string | null;
};

export function usePrankReceiver() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    const unsub = onWsMessage(async (type, payload) => {
      if (type !== 'prank:incoming') return;

      const prank = payload as PrankIncomingPayload & { self_test?: boolean };
      log.info('prank:incoming', prank.prank_id, prank.overlay_type, 'from', prank.sender?.display_name);
      // Receive pipeline: consent → quiet hours → security prefs → media → placement → show_overlay.
      // Drop excess when a flood of pranks arrives (raid bomb / multi-sender).
      const nowBurst = Date.now();
      while (inboundWindow.length && nowBurst - inboundWindow[0]! > INBOUND_WINDOW_MS) {
        inboundWindow.shift();
      }
      if (inboundWindow.length >= INBOUND_MAX && !prank.self_test) {
        log.warn('prank dropped — inbound burst cap', inboundWindow.length);
        await ackPrank(prank.prank_id, false, prank.room_id === 'self-test' ? undefined : prank.room_id);
        return;
      }
      inboundWindow.push(nowBurst);

      const { globalConsent, isPaused } = useConsentStore.getState();

      // Intentional self-test always shows (no room / consent gate).
      if (!prank.self_test && (!globalConsent || isPaused)) {
        log.warn('prank blocked by consent (globalConsent=', globalConsent, 'isPaused=', isPaused, ')');
        await ackPrank(prank.prank_id, false, prank.room_id === 'self-test' ? undefined : prank.room_id);
        return;
      }

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const settings = await invoke<{
          quiet_hours_enabled?: boolean;
          quiet_hours_start?: string;
          quiet_hours_end?: string;
        }>('get_settings');
        if (settings.quiet_hours_enabled) {
          const start = settings.quiet_hours_start ?? '22:00';
          const end = settings.quiet_hours_end ?? '08:00';
          const now = new Date();
          const mins = now.getHours() * 60 + now.getMinutes();
          const parse = (hhmm: string) => {
            const [h, m] = hhmm.split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
          };
          const s = parse(start);
          const e = parse(end);
          const inQuiet = s <= e ? mins >= s && mins < e : mins >= s || mins < e;
          if (inQuiet && !(prank as { self_test?: boolean }).self_test) {
            log.warn('prank blocked by quiet hours', start, end);
            await ackPrank(prank.prank_id, false, prank.room_id === 'self-test' ? undefined : prank.room_id);
            return;
          }
        }
      } catch {
        // settings optional outside Tauri
      }

      const token = useAuthStore.getState().accessToken;
      if (!token) {
        log.warn('prank dropped — no access token');
        await ackPrank(prank.prank_id, false, prank.room_id);
        return;
      }

      // Account security prefs (cloud `/v1/users/me/security`) — enforced locally on receive.
      if (!prank.self_test) {
        try {
          const prefs = await getMySecurityPrefs(token);
          const preset = (prank.config?.position?.preset || 'exact') as MotionPreset;
          const now = Date.now();

          if (prefs.local_cooldown_ms > 0 && now - lastLocalPrankAt < prefs.local_cooldown_ms) {
            log.warn('prank blocked by local cooldown', prefs.local_cooldown_ms);
            await ackPrank(prank.prank_id, false, prank.room_id);
            return;
          }
          if (!prefs.allow_sound && prank.overlay_type === 'sound') {
            log.warn('prank blocked — sound disabled in security prefs');
            await ackPrank(prank.prank_id, false, prank.room_id);
            return;
          }
          if (!prefs.allow_video && isVideoOverlay(prank)) {
            log.warn('prank blocked — video disabled in security prefs');
            await ackPrank(prank.prank_id, false, prank.room_id);
            return;
          }
          if (!prefs.allow_fullscreen && isFullscreenMotion(preset)) {
            log.warn('prank blocked — fullscreen motion disabled in security prefs');
            await ackPrank(prank.prank_id, false, prank.room_id);
            return;
          }
        } catch (e) {
          log.warn('security prefs load failed — continuing with defaults', e);
        }
      }

      try {
        const { invoke } = await import('@tauri-apps/api/core');

        let mediaUrl: string | null = null;
        let localPath: string | null = null;
        let overlayType = prank.overlay_type;
        let textContent = prank.text_content;

        if (prank.media) {
          log.info('prank resolving media', prank.media.id);
          try {
            const resolved = await resolveMediaForPrank(prank.media, token);
            if (resolved) {
              mediaUrl = resolved.mediaUrl;
              localPath = resolved.localPath;
              log.info('prank media resolved', { mediaUrl, localPath });
            } else {
              log.error('prank media resolve returned null');
            }
          } catch (e) {
            log.error('prank media resolve threw', e);
          }

          if (!mediaUrl && overlayType !== 'text') {
            overlayType = 'text';
            textContent = `${prank.sender.display_name} sent a ${prank.overlay_type} (media failed to load)`;
          }

          try {
            const settings = await invoke<{ cache_limit_mb: number }>('get_settings');
            void enforceCacheLimit(settings.cache_limit_mb).catch(() => undefined);
          } catch {
            void enforceCacheLimit(500).catch(() => undefined);
          }
        }

        if (overlayType === 'sound') {
          if (!mediaUrl) {
            log.warn('sound prank has no media');
            await ackPrank(prank.prank_id, false, prank.room_id);
            return;
          }
          await playSoundPrank(mediaUrl, safeNumber(prank.config?.volume, 0.8), prank.duration_ms);
          await ackPrank(prank.prank_id, true, prank.room_id);
          lastLocalPrankAt = Date.now();
          return;
        }

        let opacity = safeNumber(prank.config?.opacity, 1);
        let preferredMonitor: number | null = null;
        let forcePreferred = false;
        try {
          const settings = await invoke<{
            soft_mode?: boolean;
            max_opacity?: number;
            selected_monitor?: string;
            force_preferred_monitor?: boolean;
          }>('get_settings');
          if (settings.soft_mode) {
            const cap = settings.max_opacity ?? 0.55;
            opacity = Math.min(opacity, cap);
          }
          forcePreferred = Boolean(settings.force_preferred_monitor);
          preferredMonitor = await invoke<number>('resolve_preferred_monitor', {
            selected: settings.selected_monitor ?? 'primary',
          });
        } catch {
          // settings optional
        }
        opacity = Math.min(1, Math.max(0.15, opacity));

        void unlockAudio();

        const pos = prank.config?.position;
        const preset = (pos?.preset || 'exact') as MotionPreset;
        let positionX = safeNumber(pos?.x, 0.5);
        let positionY = safeNumber(pos?.y, 0.5);
        // Sender monitor_index is 0-based; clamp to local layout unless force-preferred is on.
        let monitorIndex = safeNumber(pos?.monitor_index, preferredMonitor ?? 0);
        const cursorDriven = isCursorMotion(preset);

        // Placement presets that ignore freeform x/y (legacy + explicit).
        if (preset === 'center') {
          positionX = 0.5;
          positionY = 0.5;
        } else if (preset === 'top_left') {
          positionX = 0.12;
          positionY = 0.12;
        } else if (preset === 'top_right') {
          positionX = 0.88;
          positionY = 0.12;
        } else if (preset === 'bottom_left') {
          positionX = 0.12;
          positionY = 0.88;
        } else if (preset === 'bottom_right') {
          positionX = 0.88;
          positionY = 0.88;
        }

        if (forcePreferred && preferredMonitor != null) {
          monitorIndex = preferredMonitor;
        } else if (!cursorDriven) {
          try {
            const monitors = await invoke<Array<{ id: number }>>('collect_monitors');
            if (monitors.length > 0 && !monitors.some((m) => m.id === monitorIndex)) {
              // Sender asked for a screen this machine does not have — clamp, don't force primary.
              monitorIndex = Math.min(
                Math.max(0, monitorIndex),
                Math.max(0, monitors.length - 1),
              );
            }
          } catch {
            // keep sender index
          }
        }

        if (cursorDriven || preset === 'clickbait') {
          try {
            const cursor = await sampleCursor();
            monitorIndex = cursor.monitor_index;
            if (preset === 'follow_mouse' || preset === 'orbit' || preset === 'trail') {
              positionX = cursor.x;
              positionY = cursor.y;
            } else if (preset === 'dodge') {
              // Start away from cursor so dodge has room to flee
              positionX = cursor.x < 0.5 ? 0.75 : 0.25;
              positionY = cursor.y < 0.5 ? 0.7 : 0.3;
            }
          } catch (e) {
            log.warn('cursor sample failed', e);
          }
        }

        if (preset === 'takeover' || preset === 'clickbait') {
          positionX = 0.5;
          positionY = 0.5;
        }

        log.info(
          'prank placement',
          `monitor=${monitorIndex}`,
          `xy=${positionX.toFixed(2)},${positionY.toFixed(2)}`,
          `preset=${preset}`,
        );

        const scale = safeNumber(prank.config?.scale, 1);
        const animation = prank.config?.animation || 'fade';
        const volume = safeNumber(prank.config?.volume, 0.8);

        const basePayload = (): Omit<OverlayInvokePayload, 'id' | 'position_x' | 'position_y' | 'scale' | 'duration_ms' | 'motion' | 'text' | 'overlay_type'> => ({
          media_url: mediaUrl,
          local_path: localPath,
          animation,
          sender_name: prank.sender.display_name,
          monitor_index: monitorIndex,
          opacity,
          volume,
          sfx: prank.config?.sfx ?? 'none',
          text_color: prank.config?.text_color ?? null,
          bg_color: prank.config?.bg_color ?? null,
          accent_color: prank.config?.accent_color ?? null,
          font_family: prank.config?.font_family ?? null,
        });

        // Screen takeover: full-bleed banner ~1s, then main content centered.
        if (preset === 'takeover') {
          await invoke('show_overlay', {
            payload: {
              ...basePayload(),
              id: `${prank.prank_id}-banner`,
              overlay_type: 'text',
              text: '⚠ RAID INCOMING',
              duration_ms: 1100,
              animation: 'fade',
              position_x: 0.5,
              position_y: 0.5,
              scale: 1,
              motion: 'takeover_banner',
              bg_color: 'rgba(11,17,29,0.92)',
              accent_color: '#2dd4bf',
              text_color: '#f1f5f9',
            } satisfies OverlayInvokePayload,
          });
          await sleep(1000);
        }

        if (preset === 'clickbait') {
          try {
            await invoke('set_overlay_clickthrough', {
              monitorIndex,
              ignore: false,
            });
          } catch (e) {
            log.warn('clickthrough disable failed', e);
          }
        }

        log.info('prank invoking show_overlay', prank.prank_id, overlayType, preset);
        await invoke('show_overlay', {
          payload: {
            ...basePayload(),
            id: prank.prank_id,
            overlay_type: overlayType,
            text: textContent,
            duration_ms: prank.duration_ms,
            position_x: positionX,
            position_y: positionY,
            scale,
            motion: preset === 'exact' ? null : preset,
          } satisfies OverlayInvokePayload,
        });
        log.info('prank show_overlay ok', prank.prank_id);

        if (preset === 'clickbait') {
          // Re-disable after show_overlay's delayed click-through re-apply (~250ms).
          window.setTimeout(() => {
            void invoke('set_overlay_clickthrough', {
              monitorIndex,
              ignore: false,
            }).catch(() => undefined);
          }, 350);
        }

        // Trail: three mini clones lagging behind the cursor.
        const trailIds: string[] = [];
        if (preset === 'trail' && mediaUrl) {
          for (let i = 0; i < 3; i++) {
            const tid = `${prank.prank_id}-trail-${i}`;
            trailIds.push(tid);
            await invoke('show_overlay', {
              payload: {
                ...basePayload(),
                id: tid,
                overlay_type: overlayType,
                text: null,
                duration_ms: prank.duration_ms,
                position_x: positionX,
                position_y: positionY,
                scale: Math.max(0.35, scale * 0.45),
                opacity: Math.min(opacity, 0.75),
                motion: 'trail',
                sfx: 'none',
              } satisfies OverlayInvokePayload,
            });
          }
        }

        if (cursorDriven) {
          void runCursorMotion({
            preset,
            overlayId: prank.prank_id,
            durationMs: prank.duration_ms,
            trailIds: trailIds.length ? trailIds : undefined,
            startX: positionX,
            startY: positionY,
          });
        }

        if (preset === 'clickbait') {
          // Restore click-through after overlay duration (+ small buffer).
          const restoreMs = Math.min(Math.max(prank.duration_ms, 1500), 12000) + 400;
          window.setTimeout(() => {
            void invoke('set_overlay_clickthrough', {
              monitorIndex,
              ignore: true,
            }).catch(() => undefined);
          }, restoreMs);
        }

        await ackPrank(prank.prank_id, true, prank.room_id);
        lastLocalPrankAt = Date.now();
      } catch (e) {
        log.error('prank render failed', e);
        await ackPrank(prank.prank_id, false, prank.room_id);
      }
    });

    return unsub;
  }, [isAuthenticated]);
}
