import { createRoot } from 'react-dom/client';
import '../index.css';
import './overlay.css';
import { OverlayApp } from './OverlayApp';

createRoot(document.getElementById('root')!).render(<OverlayApp />);
