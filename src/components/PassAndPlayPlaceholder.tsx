import { goToPicker } from '../game/gameLoop';

// Stub: the Pass-and-Play setup, interlude, round-summary, and game-over
// screens land here for now. Phase B replaces this with the real flow.
export function PassAndPlayPlaceholder() {
  return (
    <div className="screen">
      <h2 className="subtitle">Pass and Play</h2>
      <p className="tagline">Coming next — game flow lands in the next commit.</p>
      <button className="btn" type="button" onClick={goToPicker}>
        Back
      </button>
    </div>
  );
}
