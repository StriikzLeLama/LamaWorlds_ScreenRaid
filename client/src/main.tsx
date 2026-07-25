import { createRoot } from 'react-dom/client';
import './index.css';
import { AppReceiver } from './App.receiver';
import { ErrorBoundary } from './components/ErrorBoundary';
import { loadServerUrlFromSettings } from './services/serverConfig';
import { checkForAppUpdates } from './services/updater';
import { isTauriRuntime, isWebApp } from './lib/platform';
import { log } from './lib/log';

/**
 * Desktop receiver entry.
 * Order matters: hydrate server URL from disk (with timeout) before React mounts,
 * so the first API/WS attempt uses the user's configured host — not an empty default.
 */
async function bootstrap() {
  log.info('main.tsx bootstrap', {
    isTauriRuntime: isTauriRuntime(),
    isWebApp: isWebApp(),
    location: typeof window !== 'undefined' ? window.location.href : 'no-window',
  });
  if (!isTauriRuntime()) {
    log.warn('main.tsx: NOT running in Tauri runtime — overlays/invoke will fail. Run npm run tauri:dev');
  }

  // Never block the UI forever if invoke('get_settings') hangs.
  await Promise.race([
    loadServerUrlFromSettings(),
    new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
  ]);

  const { getServerUrl } = await import('./services/serverConfig');
  log.info('main.tsx server url after load =', getServerUrl());

  // Fire-and-forget: updater may relaunch after download; UI must still mount.
  void checkForAppUpdates();

  const root = document.getElementById('root');
  if (!root) {
    log.error('main.tsx: #root missing');
    return;
  }
  createRoot(root).render(
    <ErrorBoundary>
      <AppReceiver />
    </ErrorBoundary>,
  );
}

void bootstrap();
