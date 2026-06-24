import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useConsentStore } from '../stores/consentStore';

export function usePanicHotkey() {
  const pause = useConsentStore((s) => s.pause);

  useEffect(() => {
    const unlisten = listen('panic:triggered', async () => {
      await invoke('panic_hide_all');
      await pause();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [pause]);
}
