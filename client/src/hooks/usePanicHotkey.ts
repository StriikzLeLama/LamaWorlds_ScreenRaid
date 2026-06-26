import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useConsentStore } from '../stores/consentStore';

export function usePanicHotkey() {
  const pause = useConsentStore((s) => s.pause);

  useEffect(() => {
    const unlisten = listen('panic:triggered', async () => {
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
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [pause]);
}
