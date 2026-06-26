import { createRoot } from 'react-dom/client';
import './index.css';
import { AppReceiver } from './App.receiver';
import { loadServerUrlFromSettings } from './services/serverConfig';
import { isTauriRuntime, isWebApp } from './lib/platform';
import { log } from './lib/log';

async function bootstrap() {
  log.info('main.tsx bootstrap', {
    isTauriRuntime: isTauriRuntime(),
    isWebApp: isWebApp(),
    location: typeof window !== 'undefined' ? window.location.href : 'no-window',
  });
  if (!isTauriRuntime()) {
    log.warn('main.tsx: NOT running in Tauri runtime — overlays/invoke will fail. Run npm run tauri:dev');
  }
  await loadServerUrlFromSettings();
  const { getServerUrl } = await import('./services/serverConfig');
  log.info('main.tsx server url after load =', getServerUrl());
  createRoot(document.getElementById('root')!).render(<AppReceiver />);
}

void bootstrap();
