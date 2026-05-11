import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../game/stateMachine';
import type { RoundResult } from '../patterns/types';
import { goToPicker, playAgain, tryAgain } from '../game/gameLoop';
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
    !state.isReplay &&
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
        <div className="score-headline__label">Overall</div>
        {isNewBest && <div className="score-headline__badge">New best!</div>}
        {state.isPractice && <div className="score-headline__badge score-headline__badge--practice">Practice — not saved</div>}
        {state.isReplay && !state.isPractice && (
          <div className="score-headline__badge score-headline__badge--practice">Replay — not saved</div>
        )}
      </div>

      <SubScores result={result} />

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
          <>
            <button className="btn btn--primary" type="button" onClick={tryAgain}>
              Replay
            </button>
            <button className="btn" type="button" onClick={playAgain}>
              New beat
            </button>
          </>
        )}
        <button className="btn" type="button" onClick={goToPicker}>
          Change level
        </button>
      </div>
    </div>
  );
}

const SUBSCORE_INFO = {
  rhythm:
    "How well-timed your taps were. After correcting for your overall tempo, this is the average timing error per note (misses count as max error). 100 means every tap was right on the beat.",
    tempo:
    "How steadily you kept time. The % shown is the RMS deviation of your beat-to-beat IOIs from the target; the score drops by 3 for each percent (5% ≈ 85, 10% ≈ 70). Single sharp wobbles cost a bit more than the same total deviation spread evenly.",
};

function SubScores({ result }: { result: RoundResult }) {
  const [openInfo, setOpenInfo] = useState<keyof typeof SUBSCORE_INFO | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openInfo) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenInfo(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [openInfo]);

  const toggle = (k: keyof typeof SUBSCORE_INFO) => () =>
    setOpenInfo((prev) => (prev === k ? null : k));

  return (
    <div className="subscores" ref={ref}>
      <Subscore
        label="Rhythm"
        value={result.rhythmScore}
        sub={`~${Math.round(result.meanAbsErrorMs)} ms avg`}
        isOpen={openInfo === 'rhythm'}
        onToggle={toggle('rhythm')}
      />
      <Subscore
        label="Tempo"
        value={result.tempoScore}
        sub={tempoText(result)}
        isOpen={openInfo === 'tempo'}
        onToggle={toggle('tempo')}
      />
      {openInfo && (
        <div className="subscores__popover" role="tooltip">
          <strong className="subscores__popover-title">
            {openInfo === 'rhythm' ? 'Rhythm' : 'Tempo'}
          </strong>
          <span>{SUBSCORE_INFO[openInfo]}</span>
        </div>
      )}
    </div>
  );
}

function Subscore({
  label,
  value,
  sub,
  isOpen,
  onToggle,
}: {
  label: string;
  value: number;
  sub: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="subscore">
      <button
        type="button"
        className="subscore__info"
        onClick={onToggle}
        aria-label={`About ${label}`}
        aria-expanded={isOpen}
      >
        i
      </button>
      <div className="subscore__value">{value}</div>
      <div className="subscore__label">{label}</div>
      <div className="subscore__sub">{sub}</div>
    </div>
  );
}

function JudgmentSummary({ result }: { result: RoundResult }) {
  const c = result.judgmentCounts;
  return (
    <div className="judgment-summary">
      <Tally label="Perfect" n={c.perfect} variant="perfect" />
      <Tally label="Great" n={c.great} variant="great" />
      <Tally label="Good" n={c.good} variant="good" />
      <Tally label="OK" n={c.ok} variant="ok" />
      <Tally label="Miss" n={c.miss} variant="miss" />
    </div>
  );
}

function tempoText(r: RoundResult): string {
  if (r.tempoDirection === 'on') return 'On tempo';
  if (r.tempoDirection === 'mixed') return `~${r.tempoPct}% unsteady`;
  return `~${r.tempoPct}% ${r.tempoDirection}`;
}

function Tally({ label, n, variant }: { label: string; n: number; variant: string }) {
  return (
    <div className={`tally tally--${variant}`}>
      <span className="tally__n">{n}</span>
      <span className="tally__label">{label}</span>
    </div>
  );
}
