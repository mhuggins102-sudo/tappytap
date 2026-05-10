import { dismissStart } from '../game/gameLoop';

export function StartScreen() {
  return (
    <div className="screen screen--start">
      <h1 className="title">
        Tappy<span className="title__accent">Tap</span>
      </h1>
      <p className="tagline">Listen. Then tap it back.</p>
      <button className="btn btn--primary btn--lg" type="button" onClick={() => void dismissStart()}>
        Tap to start
      </button>
      <p className="hint">Use the spacebar or tap the screen.</p>
    </div>
  );
}
