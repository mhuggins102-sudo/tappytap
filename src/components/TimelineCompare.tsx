import { useState } from 'react';
import type { Pattern, RoundResult, TapResult } from '../patterns/types';

interface Props {
  pattern: Pattern;
  result: RoundResult;
}

export function TimelineCompare({ pattern, result }: Props) {
  const expected = pattern.onsets;
  const slope = result.tempoFactor || 1;
  const intercept = result.tempoIntercept || 0;
  const showOnTempo = Math.abs(slope - 1) > 0.01 || Math.abs(intercept) > 0.01;

  const firstTapTime = (() => {
    for (const t of result.taps) {
      if (t.tapTime !== null) return t.tapTime;
    }
    return 0;
  })();
  const firstExpected = expected.length ? expected[0] : 0;
  const onTempo = (t: number) =>
    slope > 0 ? (t - firstTapTime) / slope + firstExpected : t;

  // Denominator is pinned to the pattern's duration (the canonical time
  // window). This keeps the Pattern row anchored end-to-end across the
  // track. Slow players' raw tap dots can overflow the right edge; toggling
  // on-tempo collapses them back inside the track. Fast players see the
  // inverse: dots compressed on the left in raw view, spread to fill the
  // track in on-tempo view.
  const denom = Math.max(0.001, pattern.durationSec);

  // When `corrected` is true, the You row's tap dots are positioned at their
  // tempo-corrected times. Toggling re-positions them; the CSS transition on
  // `left` produces the animation in both directions.
  const [corrected, setCorrected] = useState(false);

  return (
    <>
      {showOnTempo && (
        <button
          className="btn btn--small timeline__reveal"
          type="button"
          onClick={() => setCorrected((c) => !c)}
        >
          {corrected ? 'Show raw timing' : 'Show on-tempo timing'}
        </button>
      )}
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
              const tint =
                tap.rawErrorMs === null
                  ? ''
                  : tap.rawErrorMs < -2
                    ? ' timeline-dot--early'
                    : tap.rawErrorMs > 2
                      ? ' timeline-dot--late'
                      : '';
              const pos = corrected ? onTempo(tap.tapTime) : tap.tapTime;
              return (
                <span
                  key={i}
                  className={`timeline-dot timeline-dot--${tap.judgment} timeline-dot--animated${tint}`}
                  style={{ left: `${(pos / denom) * 100}%` }}
                  title={titleFor(tap)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function titleFor(tap: TapResult): string {
  if (tap.errorMs === null) return tap.judgment;
  const corrSign = tap.errorMs >= 0 ? '+' : '';
  const corrMs = Math.round(tap.errorMs);
  if (tap.rawErrorMs === null || Math.abs(tap.rawErrorMs - tap.errorMs) < 1) {
    return `${tap.judgment} (${corrSign}${corrMs} ms)`;
  }
  const rawSign = tap.rawErrorMs >= 0 ? '+' : '';
  const rawMs = Math.round(tap.rawErrorMs);
  return `${tap.judgment} (corr ${corrSign}${corrMs} ms, raw ${rawSign}${rawMs} ms)`;
}
