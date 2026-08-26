import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Side-effect imports, in this order on purpose: the rename migration has to
// move the stored language before i18next reads it.
import './lib/storage-migration';
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
