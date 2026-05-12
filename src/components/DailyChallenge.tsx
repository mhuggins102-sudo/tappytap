import { useEffect, useState } from 'react';
import { startDailyRound, goToPicker, goToArchiveScreen } from '../game/gameLoop';
import { loadDailyEntry, MAX_DAILY_ATTEMPTS, type DailyEntry } from '../lib/storage';
import { todayUtcDateString } from '../patterns/daily';
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

  const [entry, setEntry] = useState<DailyEntry | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEntry(loadDailyEntry(dateStr));
  }, [dateStr]);

  const onCopy = async () => {
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(entry.shareString);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const backToList = () => (isToday ? goToPicker() : goToArchiveScreen());
  const canRetry = entry !== null && entry.attempts < MAX_DAILY_ATTEMPTS;

  return (
    <div className="screen screen--daily">
      <h2 className="subtitle">{isToday ? 'Daily Challenge' : 'Past Challenge'}</h2>
      <div className="daily-date">{dateStr} (UTC)</div>
      {entry ? (
        <>
          <p className="daily-note">
            {canRetry
              ? 'Your best for this day so far — one more attempt available.'
              : "You've used both attempts. Come back tomorrow for a new pattern."}
          </p>
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
                Try again
              </button>
            )}
            <button className="btn" type="button" onClick={backToList}>
              {isToday ? 'Back' : 'Back to archive'}
            </button>
            <button className="btn" type="button" onClick={onCopy}>
              {copied ? 'Copied!' : 'Copy'}
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
            {isToday ? 'Back' : 'Back to archive'}
          </button>
        </>
      )}
    </div>
  );
}
