import { useEffect, useState } from 'react';
import type { Pattern, RoundResult, TapResult } from '../patterns/types';
import { playTapSequence } from '../audio/scheduler';
import { loadSettings } from '../lib/storage';

interface Props {
  pattern: Pattern;
  result: RoundResult;
  /** When true, taps render at their tempo-corrected position. The
   *  Tempo subscore tile in ScoreScreen owns this state. */
  corrected: boolean;
  /** Groove index the original round was played with; reused so the
   *  playback sounds like what the player heard during the round. */
  grooveIdx: number;
}

export function TimelineCompare({ pattern, result, corrected, grooveIdx }: Props) {
  const expected = pattern.onsets;
  const slope = result.tempoFactor || 1;

  const tapTimes = result.taps
    .map((t) => t.tapTime)
    .filter((t): t is number => t !== null);

  const firstTapTime = tapTimes.length ? tapTimes[0] : 0;
  const firstExpected = expected.length ? expected[0] : 0;
  const onTempo = (t: number) =>
    slope > 0 ? (t - firstTapTime) / slope + firstExpected : t;

  const maxTap = tapTimes.length ? Math.max(...tapTimes) : 0;
  const maxOnTempo = tapTimes.length ? Math.max(...tapTimes.map(onTempo)) : 0;
  const denom = Math.max(0.001, pattern.durationSec, maxTap, maxOnTempo);

  // Tail misses: expected onsets the player never reached (tapTime is null).
  // These are excluded from the rhythm-error average; the cost lands as a
  // completion-ratio multiplier on both Rhythm and Tempo. Surfaced here so
  // the player can see exactly which dots dragged the score down.
  const tailMissCount = result.taps.filter(
    (t) => t.tapTime === null && t.judgment === 'miss',
  ).length;
  const tailMissPct =
    expected.length > 0 ? Math.round((tailMissCount / expected.length) * 100) : 0;

  const [selectedTap, setSelectedTap] = useState<number | null>(null);
  const [tailMissOpen, setTailMissOpen] = useState(false);

  // Dismiss the tap-detail popover (or the tail-miss popover) when the
  // user clicks/taps anywhere that isn't a timeline dot. The setTimeout
  // prevents the click that opened a popover from immediately closing it.
  useEffect(() => {
    if (selectedTap === null && !tailMissOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest('.timeline-dot')) {
        setSelectedTap(null);
        setTailMissOpen(false);
      }
    };
    const id = window.setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', onDocClick);
    };
  }, [selectedTap, tailMissOpen]);

  const onPlayYou = () => {
    // Play each tap at its dot's current position — raw times by
    // default, tempo-corrected times when the Tempo toggle is on. Each
    // note's audio envelope (decay length) is fixed by the synth
    // function regardless of tap spacing, so individual notes ring for
    // the same duration in either mode; only the intervals between
    // them change.
    const taps = result.taps
      .map((t) => t.tapTime)
      .filter((t): t is number => t !== null)
      .map((t) => (corrected ? onTempo(t) : t));
    const settings = loadSettings();
    void playTapSequence(taps, settings.instrument, grooveIdx);
  };
  const hasTaps = tapTimes.length > 0;

  return (
    <>
      <div className="timeline">
        <div className="timeline__row">
          <span className="timeline__label">Pattern</span>
          <div className="timeline__track timeline__track--expected">
            {expected.map((onset, i) => {
              const tap = result.taps[i];
              const isTailMiss =
                !!tap && tap.tapTime === null && tap.judgment === 'miss';
              if (isTailMiss) {
                return (
                  <span
                    key={i}
                    className={`timeline-dot timeline-dot--miss timeline-dot--tail-miss${tailMissOpen ? ' timeline-dot--selected' : ''}`}
                    style={{ left: `${(onset / denom) * 100}%` }}
                    title={`${tailMissCount}/${expected.length} taps missed: ${tailMissPct}% score penalty`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTap(null);
                      setTailMissOpen((prev) => !prev);
                    }}
                  />
                );
              }
              return (
                <span
                  key={i}
                  className="timeline-dot timeline-dot--expected"
                  style={{ left: `${(onset / denom) * 100}%` }}
                />
              );
            })}
          </div>
        </div>
        <div className="timeline__row">
          <span className="timeline__label">
            <button
              type="button"
              className="timeline__play"
              onClick={onPlayYou}
              disabled={!hasTaps}
              aria-label={corrected ? 'Play your taps on-tempo' : 'Play your taps'}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <polygon points="2.5,1.5 9,5 2.5,8.5" fill="currentColor" />
              </svg>
            </button>
            You
          </span>
          <div
            className={`timeline__track timeline__track--actual${corrected ? ' is-corrected' : ''}`}
          >
            {result.taps.map((tap, i) => {
              if (tap.tapTime === null) return null;
              const pos = corrected ? onTempo(tap.tapTime) : tap.tapTime;
              const isSelected = selectedTap === i;
              return (
                <span
                  key={i}
                  className={`timeline-dot timeline-dot--${tap.judgment} timeline-dot--animated${isSelected ? ' timeline-dot--selected' : ''}`}
                  style={{ left: `${(pos / denom) * 100}%` }}
                  title={titleFor(tap, corrected)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTailMissOpen(false);
                    setSelectedTap((prev) => (prev === i ? null : i));
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
      {/* Tap a dot to see its error in ms; tap elsewhere to dismiss. The
          value shown matches whichever timing view is active above. */}
      {selectedTap !== null && result.taps[selectedTap] && (
        <TapDetail tap={result.taps[selectedTap]} index={selectedTap} corrected={corrected} />
      )}
      {tailMissOpen && tailMissCount > 0 && (
        <TailMissDetail
          missed={tailMissCount}
          total={expected.length}
          penaltyPct={tailMissPct}
        />
      )}
    </>
  );
}

function TailMissDetail({
  missed,
  total,
  penaltyPct,
}: {
  missed: number;
  total: number;
  penaltyPct: number;
}) {
  return (
    <div className="timeline__tap-popover">
      <span className="timeline__tap-popover-tier timeline__tap-popover-tier--miss">
        miss
      </span>
      <span className="timeline__tap-popover-text">
        <strong>{missed}/{total}</strong> taps missed:{' '}
        <strong>{penaltyPct}% score penalty</strong>
      </span>
    </div>
  );
}

function TapDetail({
  tap,
  index,
  corrected,
}: {
  tap: TapResult;
  index: number;
  corrected: boolean;
}) {
  const errorMs = corrected ? tap.errorMs : tap.rawErrorMs;
  return (
    <div className="timeline__tap-popover">
      <span className={`timeline__tap-popover-tier timeline__tap-popover-tier--${tap.judgment}`}>
        {tap.judgment}
      </span>
      <span className="timeline__tap-popover-text">
        Tap {index + 1}
        {errorMs !== null && (
          <>
            {' · '}
            <strong>{formatMs(errorMs)}</strong>
            <span className="timeline__tap-popover-mode"> {corrected ? '(on-tempo)' : '(raw)'}</span>
          </>
        )}
      </span>
    </div>
  );
}

function formatMs(ms: number): string {
  const sign = ms >= 0 ? '+' : '';
  return `${sign}${Math.round(ms)} ms`;
}

function titleFor(tap: TapResult, corrected: boolean): string {
  const errorMs = corrected ? tap.errorMs : tap.rawErrorMs;
  if (errorMs === null) return tap.judgment;
  return `${tap.judgment} (${formatMs(errorMs)})`;
}
