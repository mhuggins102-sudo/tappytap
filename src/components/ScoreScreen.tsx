import { useEffect, useState } from 'react';
import type { GameState } from '../game/stateMachine';
import type { RoundResult } from '../patterns/types';
import { goToPicker, playAgain } from '../game/gameLoop';
import { loadHighScores } from '../lib/storage';
import { loadDailyEntry } from '../lib/storage';
import { todayUtcDateString } from '../patterns/daily';
import { TimelineCompare } from './TimelineCompare';

interface Props {
  state: GameState;
}

export function ScoreScreen({ state }: Props) {
  const result = state.lastResult;
  const [share, setShare] = useState<string | null>(null);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.isDailyChallenge) {
      const entry = loadDailyEntry(todayUtcDateString());
      setShare(entry?.shareString ?? null);
    } else if (!state.isPractice) {
      const scores = loadHighScores();
      setBestScore(scores[state.difficulty]?.bestScore ?? null);
    } else {
      setBestScore(null);
    }
  }, [state.isDailyChallenge, state.isPractice, state.difficulty, result]);

  if (!result) {
    return (
      <div className="screen screen--score">
        <p>No result.</p>
        <button className="btn" type="button" onClick={goToPicker}>Back</button>
      </div>
    );
  }

  const isNewBest =
    !state.isDailyChallenge &&
    !state.isPractice &&
    bestScore !== null &&
    result.totalScore === bestScore;

  const onCopy = async () => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; silently ignore
    }
  };

  return (
    <div className="screen screen--score">
      {state.lastPattern && <TimelineCompare pattern={state.lastPattern} result={result} />}

      <div className="score-headline">
        <div className="score-headline__number">{result.totalScore}</div>
        <div className="score-headline__label">{result.accuracyPct}% accuracy</div>
        <div className="score-headline__tempo">{tempoText(result.tempoFactor)}</div>
        {isNewBest && <div className="score-headline__badge">New best!</div>}
        {state.isPractice && <div className="score-headline__badge score-headline__badge--practice">Practice — not saved</div>}
      </div>

      <JudgmentSummary result={result} />

      {state.isDailyChallenge && share && (
        <div className="share-box">
          <code className="share-box__text">{share}</code>
          <button className="btn btn--small" type="button" onClick={onCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}

      <div className="score-actions">
        {!state.isDailyChallenge && (
          <button className="btn btn--primary" type="button" onClick={playAgain}>
            Play again
          </button>
        )}
        <button className="btn" type="button" onClick={goToPicker}>
          Change level
        </button>
      </div>
    </div>
  );
}

function JudgmentSummary({ result }: { result: RoundResult }) {
  const c = result.judgmentCounts;
  return (
    <div className="judgment-summary">
      <Tally label="Perfect" n={c.perfect} variant="perfect" />
      <Tally label="Great" n={c.great} variant="great" />
      <Tally label="OK" n={c.ok} variant="ok" />
      <Tally label="Miss" n={c.miss} variant="miss" />
      {c.extra > 0 && <Tally label="Extra" n={c.extra} variant="extra" />}
    </div>
  );
}

function tempoText(slope: number): string {
  const pct = (slope - 1) * 100;
  if (Math.abs(pct) < 1) return 'On tempo';
  const rounded = Math.round(Math.abs(pct));
  return pct < 0 ? `Tempo: ${rounded}% fast` : `Tempo: ${rounded}% slow`;
}

function Tally({ label, n, variant }: { label: string; n: number; variant: string }) {
  return (
    <div className={`tally tally--${variant}`}>
      <span className="tally__n">{n}</span>
      <span className="tally__label">{label}</span>
    </div>
  );
}
