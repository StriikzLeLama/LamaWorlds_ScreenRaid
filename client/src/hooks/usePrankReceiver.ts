import { useEffect } from 'react';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { useAuthStore } from '../stores/authStore';
import { useConsentStore } from '../stores/consentStore';
import { enforceCacheLimit, resolveMediaForPrank } from '../services/mediaCache';
import { ackPrank, type PrankIncomingPayload } from '../services/pranks';
import { onWsMessage } from '../services/websocket';
import { unlockAudio } from '../lib/sfx';
import { log } from '../lib/log';

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

export function usePrankReceiver() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    const unsub = onWsMessage(async (type, payload) => {
      if (type !== 'prank:incoming') return;

      const prank = payload as PrankIncomingPayload;
      log.info('prank:incoming', prank.prank_id, prank.overlay_type, 'from', prank.sender?.display_name);
      const { globalConsent, isPaused } = useConsentStore.getState();

      if (!globalConsent || isPaused) {
        log.warn('prank blocked by consent (globalConsent=', globalConsent, 'isPaused=', isPaused, ')');
        await ackPrank(prank.prank_id, false, prank.room_id);
        return;
      }

      const token = useAuthStore.getState().accessToken;
      if (!token) {
        log.warn('prank dropped — no access token');
        await ackPrank(prank.prank_id, false, prank.room_id);
        return;
      }

      try {
        const { invoke } = await import('@tauri-apps/api/core');

        try {
          await sendNotification({
            title: 'ScreenRaid',
            body: `${prank.sender.display_name} sent you a prank`,
          });
        } catch (e) {
          log.warn('notification failed', e);
        }

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
            // Still show something so raids never silently disappear.
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
          return;
        }

        // Soft mode: cap opacity from receiver settings.
        let opacity = safeNumber(prank.config?.opacity, 1);
        try {
          const settings = await invoke<{
            soft_mode?: boolean;
            max_opacity?: number;
          }>('get_settings');
          if (settings.soft_mode) {
            const cap = settings.max_opacity ?? 0.55;
            opacity = Math.min(opacity, cap);
          }
        } catch {
          // settings optional
        }
        opacity = Math.min(1, Math.max(0.15, opacity));

        void unlockAudio();

        const pos = prank.config?.position;
        const positionX = safeNumber(pos?.x, 0.5);
        const positionY = safeNumber(pos?.y, 0.5);
        const monitorIndex = safeNumber(pos?.monitor_index, 0);
        const scale = safeNumber(prank.config?.scale, 1);
        const animation = prank.config?.animation || 'fade';

        log.info('prank invoking show_overlay', prank.prank_id, overlayType);
        await invoke('show_overlay', {
          payload: {
            id: prank.prank_id,
            overlay_type: overlayType,
            media_url: mediaUrl,
            local_path: localPath,
            text: textContent,
            duration_ms: prank.duration_ms,
            animation,
            sender_name: prank.sender.display_name,
            position_x: positionX,
            position_y: positionY,
            monitor_index: monitorIndex,
            scale,
            opacity,
            volume: safeNumber(prank.config?.volume, 0.8),
            sfx: prank.config?.sfx ?? 'none',
            text_color: prank.config?.text_color ?? null,
            bg_color: prank.config?.bg_color ?? null,
            accent_color: prank.config?.accent_color ?? null,
            font_family: prank.config?.font_family ?? null,
          },
        });
        log.info('prank show_overlay ok', prank.prank_id);

        await ackPrank(prank.prank_id, true, prank.room_id);
      } catch (e) {
        log.error('prank render failed', e);
        await ackPrank(prank.prank_id, false, prank.room_id);
      }
    });

    return unsub;
  }, [isAuthenticated]);
}
