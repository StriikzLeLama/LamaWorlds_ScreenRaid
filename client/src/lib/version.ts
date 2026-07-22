import { useEffect, useState } from 'react';
import { isTauriRuntime } from './platform';

declare const __APP_VERSION__: string;

/** Fallback from package.json (injected at build time via Vite). */
export const PACKAGE_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/** Resolve the running app version (Tauri package version when desktop). */
export async function resolveAppVersion(): Promise<string> {
  if (isTauriRuntime()) {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      return await getVersion();
    } catch {
      // fall through
    }
  }
  return PACKAGE_VERSION;
}

export function useAppVersion(): string {
  const [version, setVersion] = useState(PACKAGE_VERSION);

  useEffect(() => {
    let cancelled = false;
    void resolveAppVersion().then((v) => {
      if (!cancelled) setVersion(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}
