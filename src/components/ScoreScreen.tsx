import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../game/stateMachine';
import type { RoundResult } from '../patterns/types';
import { goToArchiveScreen, goToPicker, playAgain, tryAgain } from '../game/gameLoop';
import { loadHighScores, loadDailyEntry, MAX_DAILY_ATTEMPTS } from '../lib/storage';
import { todayUtcDateString } from '../patterns/daily';
import { shareDailyResult } from '../lib/share';
import { TimelineCompare } from './TimelineCompare';
import { DailyRankBox } from './DailyRankBox';

interface Props {
  state: GameState;
}

export function ScoreScreen({ state }: Props) {
  const result = state.lastResult;
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [shareLabel, setShareLabel] = useState('Share');

  useEffect(() => {
    if (state.isDailyChallenge || state.isPractice) {
      setBestScore(null);
      return;
    }
    const scores = loadHighScores();
    setBestScore(scores[state.difficulty]?.bestScore ?? null);
  }, [state.isDailyChallenge, state.isPractice, state.difficulty, result]);

  if (!result) {
    return (
      <div className="screen screen--score">
        <p>No result.</p>
        <button className="btn" type="button" onClick={goToPicker}>Back</button>
      </div>
    );
  }

  const isToday = state.dailyDateStr === todayUtcDateString();
  // Re-read the saved attempt count so we know whether the player has a
  // retry available. saveDailyEntry has already advanced this for the
  // round we just finished.
  const dailyAttempts =
    state.isDailyChallenge && state.dailyDateStr
      ? (loadDailyEntry(state.dailyDateStr)?.attempts ?? 0)
      : 0;
  const canRetryDaily =
    state.isDailyChallenge && !state.isPractice && dailyAttempts < MAX_DAILY_ATTEMPTS;

  const isNewBest =
    !state.isDailyChallenge &&
    !state.isPractice &&
    !state.isReplay &&
    bestScore !== null &&
    result.totalScore === bestScore;

  const onShare = async () => {
    if (!state.dailyDateStr) return;
    const outcome = await shareDailyResult(state.dailyDateStr, result);
    if (outcome === 'copied') {
      setShareLabel('Copied!');
      window.setTimeout(() => setShareLabel('Share'), 1500);
    }
  };

  const backFromDaily = () => (isToday ? goToPicker() : goToArchiveScreen());

  return (
    <div className="screen screen--score">
      {state.lastPattern && <TimelineCompare pattern={state.lastPattern} result={result} />}

      <div className="score-headline">
        <div className="score-headline__number">{result.totalScore}</div>
        <div className="score-headline__label">Overall</div>
        {isNewBest && <div className="score-headline__badge">New best!</div>}
        {state.dailyImprovedOnRetry && (
          <div className="score-headline__badge score-headline__badge--improved">
            New best for this day!
            {state.dailyPreviousScore !== null && (
              <span className="score-headline__badge-sub">
                {' '}(was {state.dailyPreviousScore})
              </span>
            )}
          </div>
        )}
        {state.isPractice && <div className="score-headline__badge score-headline__badge--practice">Practice — not saved</div>}
        {state.isReplay && !state.isPractice && (
          <div className="score-headline__badge score-headline__badge--practice">Replay — not saved</div>
        )}
      </div>

      <SubScores result={result} />

      <JudgmentSummary result={result} />

      {state.isDailyChallenge && state.dailyDateStr && !state.isPractice && (
        <DailyRankBox dateStr={state.dailyDateStr} freshResult={result} />
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
            <button className="btn" type="button" onClick={goToPicker}>
              Change level
            </button>
          </>
        )}
        {state.isDailyChallenge && (
          <>
            {canRetryDaily && (
              <button className="btn btn--primary" type="button" onClick={tryAgain}>
                Try again
              </button>
            )}
            <button className="btn" type="button" onClick={backFromDaily}>
              Back
            </button>
            {state.dailyDateStr && (
              <button className="btn" type="button" onClick={() => void onShare()}>
                {shareLabel}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const SUBSCORE_INFO = {
  rhythm:
    "How tight your spacing was around your own pace. We fit a best-fit line through your taps (one or two way-off taps count less, so they don't pull the line) and measure how far each tap fell from it. Sloppy or missed taps lower this; a steady (even if wrong-speed) player keeps rhythm high.",
  tempo:
    "How close your overall pace was to the target. The slope of the best-fit line through your taps is compared to the target slope of 1. Each percent off costs ~4 points (5% off ≈ 80, 10% ≈ 60, 25% ≈ 0). Mid-pattern wobble around an on-target average gets the 'unsteady' label rather than dragging the score.",
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
  if (r.tempoDirection === 'mixed') return `~${Math.round(r.tempoMsDev)} ms unsteady`;
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
