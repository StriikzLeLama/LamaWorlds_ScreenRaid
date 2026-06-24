import { createRoot } from 'react-dom/client';
import './index.css';
import { AppReceiver } from './App.receiver';
import { loadServerUrlFromSettings } from './services/serverConfig';

async function bootstrap() {
  await loadServerUrlFromSettings();
  createRoot(document.getElementById('root')!).render(<AppReceiver />);
}

void bootstrap();
