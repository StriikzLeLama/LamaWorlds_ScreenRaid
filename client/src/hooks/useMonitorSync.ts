import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '../stores/authStore';
import * as monitorsApi from '../services/monitors';

export function useMonitorSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    const sync = async () => {
      try {
        const collected = await invoke<monitorsApi.MonitorDescriptor[]>('collect_monitors');
        if (collected.length > 0) {
          await monitorsApi.updateMyMonitors(collected);
        }
      } catch {
        // desktop only
      }
    };

    sync().catch(() => undefined);
  }, [isAuthenticated]);
}
