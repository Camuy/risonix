import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

// Gli hook di diagnostica usano Cornerstone3D: caricati in modo differito e
// solo in sviluppo, per non appesantire il bundle iniziale (P2-08).
if (import.meta.env.DEV) {
  void import('./cornerstone/debug').then((module) => module.installDebugHooks());
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento root #root non trovato');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
