import { useEffect, useState } from 'react';
import type { Pattern, RoundResult, TapResult } from '../patterns/types';

interface Props {
  pattern: Pattern;
  result: RoundResult;
  /** When true, taps render at their tempo-corrected position. The
   *  Tempo subscore tile in ScoreScreen owns this state. */
  corrected: boolean;
}

export function TimelineCompare({ pattern, result, corrected }: Props) {
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

  const [selectedTap, setSelectedTap] = useState<number | null>(null);

  // Dismiss the tap-detail popover when the user clicks/taps anywhere that
  // isn't another tap dot. The setTimeout prevents the click that opened
  // the popover from immediately closing it.
  useEffect(() => {
    if (selectedTap === null) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest('.timeline-dot')) setSelectedTap(null);
    };
    const id = window.setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', onDocClick);
    };
  }, [selectedTap]);

  return (
    <>
      <div className="timeline">
        <div className="timeline__row">
          <span className="timeline__label">Pattern</span>
          <div className="timeline__track timeline__track--expected">
            {expected.map((onset, i) => (
              <span
                key={i}
                className="timeline-dot timeline-dot--expected"
                style={{ left: `${(onset / denom) * 100}%` }}
              />
            ))}
          </div>
        </div>
        <div className="timeline__row">
          <span className="timeline__label">You</span>
          <div className="timeline__track timeline__track--actual">
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
    </>
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
