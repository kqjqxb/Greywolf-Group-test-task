// Must be the first import: configures Zod before any schema is used.
import './lib/zodConfig';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { browserStorage } from './lib/history';
import { applyThemeChoice, loadThemeChoice } from './lib/theme';
import './index.css';

// Apply a saved light/dark choice before the first render, so the page never shows the other
// theme first. The strict CSP forbids inline scripts in index.html, so this runs here, in the
// bundle, before React; without a saved choice the OS setting decides in pure CSS.
applyThemeChoice(document.documentElement, loadThemeChoice(browserStorage()));

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
