import { useEffect, useState } from 'react';
import { startRound, goToDailyScreen } from '../game/gameLoop';
import { loadHighScores, loadSettings, saveSettings, type HighScores } from '../lib/storage';
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

  useEffect(() => {
    setScores(loadHighScores());
    setDailyDone(loadDailyEntry(todayUtcDateString()) !== null);
    setLiveFeedback(loadSettings().liveFeedback);
  }, []);

  const onToggleLive = () => {
    const next = !liveFeedback;
    setLiveFeedback(next);
    saveSettings({ liveFeedback: next });
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
              <div className="picker-card__label">{lvl.label}</div>
              <div className="picker-card__blurb">{lvl.blurb}</div>
              <div className="picker-card__best">
                {best ? `Best ${best.bestScore} · ${best.bestAccuracy}%` : 'No best yet'}
              </div>
            </button>
          );
        })}
      </div>
      <button
        className={`btn btn--daily ${dailyDone ? 'btn--done' : ''}`}
        type="button"
        onClick={goToDailyScreen}
      >
        Daily challenge {dailyDone ? '✓' : ''}
      </button>

      <button
        className={`toggle ${liveFeedback ? 'toggle--on' : ''}`}
        type="button"
        role="switch"
        aria-checked={liveFeedback}
        onClick={onToggleLive}
      >
        <span className="toggle__indicator" />
        <span className="toggle__label">Live timing feedback</span>
      </button>
    </div>
  );
}
