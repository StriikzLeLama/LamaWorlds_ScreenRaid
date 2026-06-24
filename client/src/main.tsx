import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { loadServerUrlFromSettings } from './services/serverConfig';

async function bootstrap() {
  await loadServerUrlFromSettings();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
