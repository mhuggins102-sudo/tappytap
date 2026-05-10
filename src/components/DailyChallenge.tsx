import { useEffect, useState } from 'react';
import { startDailyRound, goToPicker } from '../game/gameLoop';
import { loadDailyEntry, type DailyEntry } from '../lib/storage';
import { todayUtcDateString } from '../patterns/daily';

export function DailyChallenge() {
  const [entry, setEntry] = useState<DailyEntry | null>(null);
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    const today = todayUtcDateString();
    setDateStr(today);
    setEntry(loadDailyEntry(today));
  }, []);

  const onCopy = async () => {
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(entry.shareString);
    } catch {
      // ignore
    }
  };

  return (
    <div className="screen screen--daily">
      <h2 className="subtitle">Daily Challenge</h2>
      <div className="daily-date">{dateStr} (UTC)</div>
      {entry ? (
        <>
          <p className="daily-note">You've already played today. Come back tomorrow!</p>
          <div className="score-headline">
            <div className="score-headline__number">{entry.result.totalScore}</div>
            <div className="score-headline__label">{entry.result.accuracyPct}% accuracy</div>
          </div>
          <div className="share-box">
            <code className="share-box__text">{entry.shareString}</code>
            <button className="btn btn--small" type="button" onClick={onCopy}>
              Copy
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="daily-note">One pattern. One attempt. Same for everyone.</p>
          <button className="btn btn--primary btn--lg" type="button" onClick={() => void startDailyRound()}>
            Play today's pattern
          </button>
        </>
      )}
      <button className="btn" type="button" onClick={goToPicker}>
        Back
      </button>
    </div>
  );
}
