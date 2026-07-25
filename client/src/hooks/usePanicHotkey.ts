import { useEffect } from 'react';
import { useConsentStore } from '../stores/consentStore';
import { isTauriRuntime } from '../lib/platform';

export function usePanicHotkey() {
  const pause = useConsentStore((s) => s.pause);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const { invoke } = await import('@tauri-apps/api/core');
        if (cancelled) return;
        unlistenFn = await listen('panic:triggered', async () => {
          try {
            await invoke('panic_hide_all');
          } catch {
            // overlay clear is best-effort
          }
          try {
            await pause();
          } catch {
            // consent pause is best-effort; panic must never throw
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
}
