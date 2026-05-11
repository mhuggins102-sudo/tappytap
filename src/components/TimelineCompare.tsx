import type { Pattern, RoundResult } from '../patterns/types';

interface Props {
  pattern: Pattern;
  result: RoundResult;
}

export function TimelineCompare({ pattern, result }: Props) {
  const expected = pattern.onsets;
  const tapTimes = result.taps
    .map((t) => t.tapTime)
    .filter((t): t is number => t !== null);

  const maxTime = Math.max(
    pattern.durationSec,
    tapTimes.length ? Math.max(...tapTimes) : 0,
  );
  const denom = maxTime > 0 ? maxTime : 1;

  const missedIndices = new Set<number>();
  for (const t of result.taps) {
    if (t.judgment === 'miss' && t.expectedIdx !== null) missedIndices.add(t.expectedIdx);
  }

  return (
    <div className="timeline">
      <div className="timeline__row">
        <span className="timeline__label">Pattern</span>
        <div className="timeline__track timeline__track--expected">
          {expected.map((onset, i) => {
            const missed = missedIndices.has(i);
            return (
              <span
                key={i}
                className={`timeline-dot ${missed ? 'timeline-dot--expected-missed' : 'timeline-dot--expected'}`}
                style={{ left: `${(onset / denom) * 100}%` }}
                title={missed ? 'Missed beat' : undefined}
              />
            );
          })}
        </div>
      </div>
      <div className="timeline__row">
        <span className="timeline__label">You</span>
        <div className="timeline__track timeline__track--actual">
          {result.taps.map((tap, i) => {
            if (tap.tapTime === null) return null;
            return (
              <span
                key={i}
                className={`timeline-dot timeline-dot--${tap.judgment}`}
                style={{ left: `${(tap.tapTime / denom) * 100}%` }}
                title={titleFor(tap)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function titleFor(tap: RoundResult['taps'][number]): string {
  if (tap.judgment === 'extra') return 'Extra tap';
  if (tap.errorMs === null) return tap.judgment;
  const sign = tap.errorMs >= 0 ? '+' : '';
  return `${tap.judgment} (${sign}${Math.round(tap.errorMs)} ms)`;
}
