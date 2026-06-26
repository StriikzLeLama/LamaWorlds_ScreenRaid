import { useEffect } from 'react';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { useAuthStore } from '../stores/authStore';
import { useConsentStore } from '../stores/consentStore';
import { enforceCacheLimit, resolveMediaForPrank } from '../services/mediaCache';
import { ackPrank, type PrankIncomingPayload } from '../services/pranks';
import { onWsMessage } from '../services/websocket';
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

        if (prank.media) {
          log.info('prank resolving media', prank.media.id);
          const resolved = await resolveMediaForPrank(prank.media, token);
          if (!resolved) {
            log.error('prank media resolve failed');
            await ackPrank(prank.prank_id, false, prank.room_id);
            return;
          }
          mediaUrl = resolved.mediaUrl;
          localPath = resolved.localPath;
          log.info('prank media resolved', { mediaUrl, localPath });
          try {
            const settings = await invoke<{ cache_limit_mb: number }>('get_settings');
            void enforceCacheLimit(settings.cache_limit_mb).catch(() => undefined);
          } catch {
            void enforceCacheLimit(500).catch(() => undefined);
          }
        }

        if (prank.overlay_type === 'sound') {
          if (!mediaUrl) {
            log.warn('sound prank has no media');
            await ackPrank(prank.prank_id, false, prank.room_id);
            return;
          }
          await playSoundPrank(mediaUrl, prank.config.volume, prank.duration_ms);
          await ackPrank(prank.prank_id, true, prank.room_id);
          return;
        }

        log.info('prank invoking show_overlay', prank.prank_id);
        await invoke('show_overlay', {
          payload: {
            id: prank.prank_id,
            overlay_type: prank.overlay_type,
            media_url: mediaUrl,
            local_path: localPath,
            text: prank.text_content,
            duration_ms: prank.duration_ms,
            animation: prank.config.animation,
            sender_name: prank.sender.display_name,
            position_x: prank.config.position.x,
            position_y: prank.config.position.y,
            monitor_index: prank.config.position.monitor_index ?? 0,
            scale: prank.config.scale,
            opacity: prank.config.opacity,
            volume: prank.config.volume,
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
