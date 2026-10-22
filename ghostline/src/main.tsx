import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts (cached for offline use). Latin subsets only.
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './App';
import { registerServiceWorker } from './lib/pwa';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
