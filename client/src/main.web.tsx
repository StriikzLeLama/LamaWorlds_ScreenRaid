import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { applyTheme, useThemeStore } from './stores/themeStore';
import { AppWeb } from './App.web';
import { ErrorBoundary } from './components/ErrorBoundary';

applyTheme(useThemeStore.getState().theme);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <AppWeb />
      </ErrorBoundary>
    </StrictMode>,
  );
}
