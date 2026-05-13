import { useEffect, useState } from 'react';
import { startDailyRound, goToPicker, goToArchiveScreen } from '../game/gameLoop';
import { loadDailyEntry, MAX_DAILY_ATTEMPTS, type DailyEntry } from '../lib/storage';
import { dailyDifficultyFor, todayUtcDateString } from '../patterns/daily';
import { shareDailyResult } from '../lib/share';
import type { GameState } from '../game/stateMachine';
import { DailyRankBox } from './DailyRankBox';

interface Props {
  state: GameState;
}

export function DailyChallenge({ state }: Props) {
  // Default to today when the screen is opened from the picker; archive
  // entries pass their own date through the game state.
  const today = todayUtcDateString();
  const dateStr = state.dailyDateStr ?? today;
  const isToday = dateStr === today;
  const difficulty = dailyDifficultyFor(dateStr);

  const [entry, setEntry] = useState<DailyEntry | null>(null);
  const [shareLabel, setShareLabel] = useState('Share');

  useEffect(() => {
    setEntry(loadDailyEntry(dateStr));
  }, [dateStr]);

  const onShare = async () => {
    if (!entry) return;
    const outcome = await shareDailyResult(dateStr, entry.result);
    if (outcome === 'copied') {
      setShareLabel('Copied!');
      window.setTimeout(() => setShareLabel('Share'), 1500);
    }
    // 'shared' or 'cancelled' or 'failed' — leave the button label alone.
  };

  const backToList = () => (isToday ? goToPicker() : goToArchiveScreen());
  const canRetry = entry !== null && entry.attempts < MAX_DAILY_ATTEMPTS;

  return (
    <div className="screen screen--daily">
      <h2 className="subtitle">{isToday ? 'Daily Challenge' : 'Past Challenge'}</h2>
      <div className="daily-meta">
        <span className="daily-date">{dateStr} (UTC)</span>
        <span className={`daily-difficulty daily-difficulty--${difficulty}`}>
          {difficulty}
        </span>
      </div>
      {entry ? (
        <>
          <div className="score-headline">
            <div className="score-headline__number">{entry.result.totalScore}</div>
            <div className="score-headline__label">Overall</div>
          </div>
          <div className="subscores">
            <div className="subscore">
              <div className="subscore__value">{entry.result.rhythmScore}</div>
              <div className="subscore__label">Rhythm</div>
            </div>
            <div className="subscore">
              <div className="subscore__value">{entry.result.tempoScore}</div>
              <div className="subscore__label">Tempo</div>
            </div>
          </div>
          <DailyRankBox dateStr={dateStr} />
          <div className="score-actions">
            {canRetry && (
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => void startDailyRound(dateStr)}
              >
                Retry
              </button>
            )}
            <button className="btn" type="button" onClick={backToList}>
              Back
            </button>
            <button className="btn" type="button" onClick={() => void onShare()}>
              {shareLabel}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="daily-note">
            {isToday
              ? 'One pattern. Two attempts. Same for everyone.'
              : 'You missed this day — give it a shot now.'}
          </p>
          <button
            className="btn btn--primary btn--lg"
            type="button"
            onClick={() => void startDailyRound(dateStr)}
          >
            {isToday ? "Play today's pattern" : 'Play this challenge'}
          </button>
          <button className="btn" type="button" onClick={backToList}>
            Back
          </button>
        </>
      )}
    </div>
  );
}
