import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { gameStore } from './game/gameLoop';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Deep-link support: `?d=YYYY-MM-DD` jumps straight to that daily challenge
// instead of the start/picker screens. Used by the share URLs in share.ts so
// recipients open the exact challenge that was shared. The query string gets
// stripped after read so back/forward navigation doesn't bounce the player
// back to the daily screen unexpectedly.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const params = new URLSearchParams(window.location.search);
const dParam = params.get('d');
if (dParam && DATE_RE.test(dParam)) {
  gameStore.set({
    ...gameStore.get(),
    screen: 'daily',
    dailyDateStr: dParam,
    isDailyChallenge: true,
  });
  // Clean the URL so it doesn't keep re-routing on subsequent navigations.
  window.history.replaceState(null, '', window.location.pathname);
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
