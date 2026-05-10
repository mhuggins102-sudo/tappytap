import { useEffect, useState } from 'react';
import { startRound, goToDailyScreen } from '../game/gameLoop';
import { loadHighScores, type HighScores } from '../lib/storage';
import { loadDailyEntry } from '../lib/storage';
import { todayUtcDateString } from '../patterns/daily';
import type { Difficulty } from '../patterns/types';

const LEVELS: Array<{ id: Difficulty; label: string; blurb: string }> = [
  { id: 'easy', label: 'Easy', blurb: '4 steady taps' },
  { id: 'medium', label: 'Medium', blurb: 'Quarters + eighths' },
  { id: 'hard', label: 'Hard', blurb: 'Syncopation + 16ths' },
];

export function DifficultyPicker() {
  const [scores, setScores] = useState<HighScores | null>(null);
  const [dailyDone, setDailyDone] = useState(false);

  useEffect(() => {
    setScores(loadHighScores());
    setDailyDone(loadDailyEntry(todayUtcDateString()) !== null);
  }, []);

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
    </div>
  );
}
