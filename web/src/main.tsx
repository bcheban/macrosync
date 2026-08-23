import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Side-effect import: configures i18next before the first render.
import './i18n';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/** Releases the decorative animations gated in `index.css` (see `data-booted`). */
const markBooted = () => document.documentElement.setAttribute('data-booted', '');

if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(markBooted, { timeout: 2500 });
} else {
  window.setTimeout(markBooted, 1200);
}
