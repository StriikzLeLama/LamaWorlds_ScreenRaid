import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppWeb } from './App.web';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWeb />
  </StrictMode>,
);
