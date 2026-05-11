import { useEffect, useState } from 'react';
import { startRound, goToDailyScreen } from '../game/gameLoop';
import {
  clearHighScores,
  loadHighScores,
  loadSettings,
  saveSettings,
  type HighScores,
} from '../lib/storage';
import { loadDailyEntry } from '../lib/storage';
import { todayUtcDateString } from '../patterns/daily';
import type { Difficulty } from '../patterns/types';

const LEVELS: Array<{ id: Difficulty; label: string; blurb: string }> = [
  { id: 'easy', label: 'Easy', blurb: '4-tap motif, repeats ×4–5' },
  { id: 'medium', label: 'Medium', blurb: 'Quarters + eighths' },
  { id: 'hard', label: 'Hard', blurb: 'Syncopation + 16ths' },
];

export function DifficultyPicker() {
  const [scores, setScores] = useState<HighScores | null>(null);
  const [dailyDone, setDailyDone] = useState(false);
  const [liveFeedback, setLiveFeedback] = useState(true);
  const [practiceMode, setPracticeMode] = useState(false);
  const [grooveSounds, setGrooveSounds] = useState(false);

  useEffect(() => {
    setScores(loadHighScores());
    setDailyDone(loadDailyEntry(todayUtcDateString()) !== null);
    const s = loadSettings();
    setLiveFeedback(s.liveFeedback);
    setPracticeMode(s.practiceMode);
    setGrooveSounds(s.soundTheme === 'groove');
  }, []);

  const onToggleLive = () => {
    const next = !liveFeedback;
    setLiveFeedback(next);
    saveSettings({ liveFeedback: next });
  };

  const onTogglePractice = () => {
    const next = !practiceMode;
    setPracticeMode(next);
    saveSettings({ practiceMode: next });
  };

  const onToggleGroove = () => {
    const next = !grooveSounds;
    setGrooveSounds(next);
    saveSettings({ soundTheme: next ? 'groove' : 'tones' });
  };

  const onClearStats = () => {
    const hasAny =
      (scores?.easy?.games ?? 0) +
        (scores?.medium?.games ?? 0) +
        (scores?.hard?.games ?? 0) >
      0;
    if (!hasAny) return;
    const ok = window.confirm(
      'Clear best scores and lifetime averages for Easy, Medium, and Hard? Daily challenge history is kept.',
    );
    if (!ok) return;
    clearHighScores();
    setScores(loadHighScores());
  };

  return (
    <div className="screen screen--picker">
      <h2 className="subtitle">Choose your challenge</h2>
      <div className="picker-grid">
        {LEVELS.map((lvl) => {
          const best = scores?.[lvl.id];
          return (
            <button
              key={lvl.id}
              className="picker-card"
              type="button"
              onClick={() => void startRound(lvl.id)}
            >
              <div className="picker-card__primary">
                <div className="picker-card__label">{lvl.label}</div>
                <div className="picker-card__blurb">{lvl.blurb}</div>
              </div>
              <div className="picker-card__stats">
                {best && best.games > 0 ? (
                  <>
                    <div className="picker-card__best">Best {best.bestScore}</div>
                    <div className="picker-card__avg">
                      Avg {Math.round(best.totalScore / best.games)}
                    </div>
                    <div className="picker-card__sub">
                      {Math.round(best.totalRhythm / best.games)}r · {Math.round(best.totalTempo / best.games)}t
                    </div>
                    <div className="picker-card__sub">
                      {best.games} {best.games === 1 ? 'play' : 'plays'}
                    </div>
                  </>
                ) : (
                  <div className="picker-card__no-best">No best yet</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <button
        className={`btn btn--daily ${dailyDone ? 'btn--done' : ''}`}
        type="button"
        onClick={goToDailyScreen}
        disabled={practiceMode}
        title={practiceMode ? 'Disable Practice Mode to play the daily' : undefined}
      >
        Daily challenge {dailyDone ? '✓' : ''}
      </button>

      <div className="toggles">
        <button
          className={`toggle ${practiceMode ? 'toggle--on' : ''}`}
          type="button"
          role="switch"
          aria-checked={practiceMode}
          onClick={onTogglePractice}
        >
          <span className="toggle__indicator" />
          <span className="toggle__label">Practice mode (no scores saved)</span>
        </button>

        <button
          className={`toggle ${liveFeedback ? 'toggle--on' : ''} ${practiceMode ? '' : 'toggle--disabled'}`}
          type="button"
          role="switch"
          aria-checked={liveFeedback}
          aria-disabled={!practiceMode}
          disabled={!practiceMode}
          onClick={onToggleLive}
          title={practiceMode ? undefined : 'Turn on Practice Mode to use live feedback'}
        >
          <span className="toggle__indicator" />
          <span className="toggle__label">Live timing feedback</span>
        </button>

        <button
          className={`toggle ${grooveSounds ? 'toggle--on' : ''}`}
          type="button"
          role="switch"
          aria-checked={grooveSounds}
          onClick={onToggleGroove}
        >
          <span className="toggle__indicator" />
          <span className="toggle__label">Groove sounds (drums)</span>
        </button>

        {(scores?.easy?.games || scores?.medium?.games || scores?.hard?.games) ? (
          <button
            className="btn btn--small btn--clear-stats"
            type="button"
            onClick={onClearStats}
          >
            Clear best scores
          </button>
        ) : null}
      </div>
    </div>
  );
}
