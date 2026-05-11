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

  const tapTimes = result.taps
    .map((t) => t.tapTime)
    .filter((t): t is number => t !== null);

  const onTempoMaxTap = tapTimes.length
    ? Math.max(...tapTimes.map((t) => (slope > 0 ? (t - intercept) / slope : t)))
    : 0;

  const maxTime = Math.max(
    pattern.durationSec,
    tapTimes.length ? Math.max(...tapTimes) : 0,
    showOnTempo ? onTempoMaxTap : 0,
  );
  const denom = maxTime > 0 ? maxTime : 1;

  return (
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
            if (tap.tapTime !== null) {
              const tint = tap.rawErrorMs === null
                ? ''
                : tap.rawErrorMs < -2
                  ? ' timeline-dot--early'
                  : tap.rawErrorMs > 2
                    ? ' timeline-dot--late'
                    : '';
              return (
                <span
                  key={i}
                  className={`timeline-dot timeline-dot--${tap.judgment}${tint}`}
                  style={{ left: `${(tap.tapTime / denom) * 100}%` }}
                  title={titleFor(tap)}
                />
              );
            }
            if (tap.judgment === 'miss' && tap.expectedIdx !== null) {
              const pos = slope * expected[tap.expectedIdx] + intercept;
              return (
                <span
                  key={i}
                  className="timeline-dot timeline-dot--miss"
                  style={{ left: `${(pos / denom) * 100}%` }}
                  title="Missed onset"
                />
              );
            }
            return null;
          })}
        </div>
      </div>
      {showOnTempo && (
        <div className="timeline__row">
          <span className="timeline__label">On tempo</span>
          <div className="timeline__track timeline__track--corrected">
            {result.taps.map((tap, i) => {
              if (tap.tapTime === null) return null;
              const pos = slope > 0 ? (tap.tapTime - intercept) / slope : tap.tapTime;
              return (
                <span
                  key={i}
                  className={`timeline-dot timeline-dot--${tap.judgment}`}
                  style={{ left: `${(pos / denom) * 100}%` }}
                  title={titleFor(tap)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function titleFor(tap: TapResult): string {
  if (tap.judgment === 'extra') return 'Extra tap';
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
