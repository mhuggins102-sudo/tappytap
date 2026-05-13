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
  // "Show on-tempo timing" toggle for the TimelineCompare. Lives here so
  // the Tempo subscore tile (rendered separately, in SubScores below)
  // can flip it — no separate toggle button needed above the timeline.
  const [corrected, setCorrected] = useState(false);

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

  // Only enable the toggle when the slope is meaningfully off-target —
  // otherwise the "raw" and "on-tempo" views look identical.
  const tempoToggleable = Math.abs((result.tempoFactor ?? 1) - 1) > 0.01;

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
      {state.lastPattern && (
        <TimelineCompare
          pattern={state.lastPattern}
          result={result}
          corrected={corrected}
        />
      )}

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

      <SubScores
        result={result}
        tempoToggleable={tempoToggleable}
        corrected={corrected}
        onToggleCorrected={() => setCorrected((c) => !c)}
      />

      <JudgmentSummary result={result} />

      {state.isDailyChallenge && state.dailyDateStr && !state.isPractice && (
        <DailyRankBox dateStr={state.dailyDateStr} freshResult={result} />
      )}

      <div className="score-actions">
        {!state.isDailyChallenge && (
          <>
            <button className="btn btn--primary" type="button" onClick={tryAgain}>
              Retry
            </button>
            <button className="btn" type="button" onClick={playAgain}>
              New
            </button>
            <button className="btn" type="button" onClick={goToPicker}>
              Back
            </button>
          </>
        )}
        {state.isDailyChallenge && (
          <>
            {canRetryDaily && (
              <button className="btn btn--primary" type="button" onClick={tryAgain}>
                Retry
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

// Plain-English info copy. No mention of slope fits, IOIs, or
// outlier weighting — players just want to know what the score means
// and what the number under it represents.
const RHYTHM_INFO =
  'How precisely you tapped relative to your own pace. The number below ' +
  'is roughly how many milliseconds, on average, each tap was off — after ' +
  'adjusting for whether you were overall fast or slow. Lower is better; ' +
  'a perfect 100 means every tap landed right where you expected.';

const RHYTHM_INFO_TAP_HINT =
  'Tap any colored dot in the timeline above to see how far off that ' +
  'individual tap was.';

const TEMPO_INFO_BASE =
  'How close your overall pace was to the target. If you were ' +
  'consistently fast or slow, the label shows by how much; otherwise ' +
  'it just says "On tempo". Wobble in your individual taps (without a ' +
  'consistent lean) shows up in your Rhythm score, not here.';

const TEMPO_INFO_TAP_HINT =
  'Tap the Tempo tile above to switch the timeline between raw timing ' +
  'and tempo-corrected timing.';

interface SubScoresProps {
  result: RoundResult;
  tempoToggleable: boolean;
  corrected: boolean;
  onToggleCorrected: () => void;
}

function SubScores({ result, tempoToggleable, corrected, onToggleCorrected }: SubScoresProps) {
  const [openInfo, setOpenInfo] = useState<'rhythm' | 'tempo' | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openInfo) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenInfo(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [openInfo]);

  const toggleInfo = (k: 'rhythm' | 'tempo') => () =>
    setOpenInfo((prev) => (prev === k ? null : k));

  const tempoInfo = TEMPO_INFO_BASE;

  return (
    <div className="subscores" ref={ref}>
      <Subscore
        label="Rhythm"
        value={result.rhythmScore}
        sub={`~${Math.round(result.meanAbsErrorMs)} ms avg`}
        isOpen={openInfo === 'rhythm'}
        onInfoToggle={toggleInfo('rhythm')}
      />
      <Subscore
        label="Tempo"
        value={result.tempoScore}
        sub={tempoText(result)}
        isOpen={openInfo === 'tempo'}
        onInfoToggle={toggleInfo('tempo')}
        onTap={tempoToggleable ? onToggleCorrected : undefined}
        active={tempoToggleable && corrected}
      />
      {openInfo && (
        <div className="subscores__popover" role="tooltip">
          <strong className="subscores__popover-title">
            {openInfo === 'rhythm' ? 'Rhythm' : 'Tempo'}
          </strong>
          {openInfo === 'rhythm' ? (
            <>
              <span>{RHYTHM_INFO}</span>
              {/* Separate, slightly-bolder line so the actionable hint
                  doesn't blend into the explanatory paragraph above it. */}
              <span className="subscores__popover-hint">{RHYTHM_INFO_TAP_HINT}</span>
            </>
          ) : (
            <>
              <span>{tempoInfo}</span>
              {tempoToggleable && (
                <span className="subscores__popover-hint">{TEMPO_INFO_TAP_HINT}</span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface SubscoreProps {
  label: string;
  value: number;
  sub: string;
  isOpen: boolean;
  onInfoToggle: () => void;
  /** When provided, the tile becomes a button that calls this on click
   *  (used by Tempo to toggle the timeline view). */
  onTap?: () => void;
  /** When true, the tile gets a highlighted style (used to show the
   *  Tempo tile is currently in tempo-corrected mode). */
  active?: boolean;
}

function Subscore({ label, value, sub, isOpen, onInfoToggle, onTap, active }: SubscoreProps) {
  // The "i" button is a sibling of the tile (not a child) so the tile
  // can itself be a <button> without violating HTML's no-nested-buttons
  // rule. Both buttons sit inside a positioned wrapper.
  return (
    <div className={`subscore-wrapper ${active ? 'subscore-wrapper--active' : ''}`}>
      {onTap ? (
        <button
          type="button"
          className="subscore subscore--clickable"
          onClick={onTap}
          aria-pressed={active ?? false}
        >
          <SubscoreContent value={value} label={label} sub={sub} />
        </button>
      ) : (
        <div className="subscore">
          <SubscoreContent value={value} label={label} sub={sub} />
        </div>
      )}
      <button
        type="button"
        className="subscore__info"
        onClick={onInfoToggle}
        aria-label={`About ${label}`}
        aria-expanded={isOpen}
      >
        i
      </button>
    </div>
  );
}

function SubscoreContent({ value, label, sub }: { value: number; label: string; sub: string }) {
  return (
    <>
      <div className="subscore__value">{value}</div>
      <div className="subscore__label">{label}</div>
      <div className="subscore__sub">{sub}</div>
    </>
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
  // 'mixed' (wobble without a slope lean) collapses into "On tempo"
  // because tempo measures pace — and the pace is fine. The wobble's
  // penalty already lives in the rhythm score via per-tap residuals,
  // so reporting it here too would imply a tempo cost that doesn't
  // exist.
  if (r.tempoDirection === 'on' || r.tempoDirection === 'mixed') return 'On tempo';
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
