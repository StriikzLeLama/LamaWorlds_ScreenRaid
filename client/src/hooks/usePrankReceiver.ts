import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { useAuthStore } from '../stores/authStore';
import { useConsentStore } from '../stores/consentStore';
import { enforceCacheLimit, resolveMediaForPrank } from '../services/mediaCache';
import { ackPrank, type PrankIncomingPayload } from '../services/pranks';
import { onWsMessage } from '../services/websocket';

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
      const { globalConsent, isPaused } = useConsentStore.getState();

      if (!globalConsent || isPaused) {
        await ackPrank(prank.prank_id, false, prank.room_id);
        return;
      }

      const token = useAuthStore.getState().accessToken;
      if (!token) {
        await ackPrank(prank.prank_id, false, prank.room_id);
        return;
      }

      try {
        try {
          await sendNotification({
            title: 'ScreenRaid',
            body: `${prank.sender.display_name} sent you a prank`,
          });
        } catch {
          // notifications optional
        }

        let mediaUrl: string | null = null;
        let localPath: string | null = null;

        if (prank.media) {
          const resolved = await resolveMediaForPrank(prank.media, token);
          if (!resolved) {
            await ackPrank(prank.prank_id, false, prank.room_id);
            return;
          }
          mediaUrl = resolved.mediaUrl;
          localPath = resolved.localPath;
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const settings = await invoke<{ cache_limit_mb: number }>('get_settings');
            void enforceCacheLimit(settings.cache_limit_mb).catch(() => undefined);
          } catch {
            void enforceCacheLimit(500).catch(() => undefined);
          }
        }

        if (prank.overlay_type === 'sound') {
          if (!mediaUrl) {
            await ackPrank(prank.prank_id, false, prank.room_id);
            return;
          }
          await playSoundPrank(mediaUrl, prank.config.volume, prank.duration_ms);
          await ackPrank(prank.prank_id, true, prank.room_id);
          return;
        }

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

        await ackPrank(prank.prank_id, true, prank.room_id);
      } catch {
        await ackPrank(prank.prank_id, false, prank.room_id);
      }
    });

    return unsub;
  }, [isAuthenticated]);
}
