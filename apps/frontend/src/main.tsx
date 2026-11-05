import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento root #root non trovato');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
