import { useEffect } from 'react';
import { useConsentStore } from '../stores/consentStore';
import { isTauriRuntime } from '../lib/platform';
import { onWsMessage } from '../services/websocket';
import { apiFetch } from '../services/api';
import { useAuthStore } from '../stores/authStore';

async function hideAllOverlays(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('panic_hide_all');
  } catch {
    // best-effort
  }
}

/** Notify server so all sessions of this user hide overlays (remote kill-switch). */
async function notifyServerPanic(): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  if (!token) return;
  try {
    await apiFetch('/v1/consent/panic', { method: 'POST' }, token);
  } catch {
    // fall back to pause if panic route unavailable (older backends)
    try {
      await useConsentStore.getState().pause();
    } catch {
      // ignore
    }
  }
}

export function usePanicHotkey() {
  const pause = useConsentStore((s) => s.pause);

  // Local hotkey (Tauri) → hide + server panic broadcast
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        if (cancelled) return;
        unlistenFn = await listen('panic:triggered', async () => {
          await hideAllOverlays();
          try {
            await notifyServerPanic();
          } catch {
            try {
              await pause();
            } catch {
              // never throw from panic path
            }
          }
        });
      } catch {
        // not running inside Tauri
      }
    })();

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [pause]);

  // Remote kill-switch from any of the user's sessions (or server pause)
  useEffect(() => {
    return onWsMessage(async (type) => {
      if (type !== 'panic:force_hide') return;
      await hideAllOverlays();
      useConsentStore.setState({ isPaused: true });
    });
  }, []);
}
