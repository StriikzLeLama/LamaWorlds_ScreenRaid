import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { useAuthStore } from '../stores/authStore';
import { useConsentStore } from '../stores/consentStore';
import { getServerUrl } from '../services/api';
import { ackPrank, type PrankIncomingPayload } from '../services/pranks';
import { onWsMessage } from '../services/websocket';

async function fetchAuthenticatedMediaUrl(relativeUrl: string): Promise<string | null> {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;

  const url = relativeUrl.startsWith('http')
    ? relativeUrl
    : `${getServerUrl()}${relativeUrl}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function usePrankReceiver() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const globalConsent = useConsentStore((s) => s.globalConsent);
  const isPaused = useConsentStore((s) => s.isPaused);

  useEffect(() => {
    if (!isAuthenticated) return;

    const unsub = onWsMessage(async (type, payload) => {
      if (type !== 'prank:incoming') return;

      const prank = payload as PrankIncomingPayload;

      if (!globalConsent || isPaused) {
        ackPrank(prank.prank_id, false);
        return;
      }

      let mediaUrl: string | null = null;
      if (prank.media?.url) {
        mediaUrl = await fetchAuthenticatedMediaUrl(prank.media.url);
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

        await invoke('show_overlay', {
          payload: {
            id: prank.prank_id,
            overlay_type: prank.overlay_type,
            media_url: mediaUrl,
            local_path: null,
            text: prank.text_content,
            duration_ms: prank.duration_ms,
            animation: prank.config.animation,
            sender_name: prank.sender.display_name,
            position_x: prank.config.position.x,
            position_y: prank.config.position.y,
            monitor_index: prank.config.position.monitor_index ?? 0,
            scale: prank.config.scale,
            opacity: prank.config.opacity,
          },
        });

        ackPrank(prank.prank_id, true);

        if (mediaUrl?.startsWith('blob:')) {
          setTimeout(() => URL.revokeObjectURL(mediaUrl!), prank.duration_ms + 5000);
        }
      } catch {
        ackPrank(prank.prank_id, false);
      }
    });

    return unsub;
  }, [isAuthenticated, globalConsent, isPaused]);
}
