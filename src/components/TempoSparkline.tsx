import type { Pattern, RoundResult } from '../patterns/types';

interface Props {
  pattern: Pattern;
  result: RoundResult;
}

/**
 * Mini bar chart of beat-to-beat tempo deviation. Each bar represents the
 * IOI between two consecutive matched taps. Bar height = magnitude of
 * deviation; bar direction = which side of the mid-line:
 *   • above = tap arrived early (faster than expected on that interval)
 *   • below = tap arrived late (slower)
 * Color reflects the same tier scale as the per-segment shading on the
 * timeline (great / good / ok / miss). X position is the EXPECTED midpoint
 * of the interval, normalised to pattern duration, so bars line up with
 * the Pattern row of the timeline.
 */
export function TempoSparkline({ pattern, result }: Props) {
  const onsets = pattern.onsets;
  if (onsets.length < 2) return null;

  const bars: Array<{ midPct: number; dev: number; tier: string }> = [];
  let prevIdx = -1;
  let prevTap = -1;
  for (const t of result.taps) {
    if (t.tapTime === null || t.expectedIdx === null) {
      prevIdx = -1;
      prevTap = -1;
      continue;
    }
    if (prevIdx >= 0 && prevTap >= 0) {
      const expIoi = onsets[t.expectedIdx] - onsets[prevIdx];
      if (expIoi > 1e-6) {
        const tapIoi = t.tapTime - prevTap;
        const dev = tapIoi / expIoi - 1;
        const midExpected = (onsets[t.expectedIdx] + onsets[prevIdx]) / 2;
        const midPct = (midExpected / pattern.durationSec) * 100;
        const absDev = Math.abs(dev);
        const tier =
          absDev > 0.2 ? 'miss' : absDev > 0.1 ? 'ok' : absDev > 0.05 ? 'good' : 'great';
        bars.push({ midPct, dev, tier });
      }
    }
    prevIdx = t.expectedIdx;
    prevTap = t.tapTime;
  }

  if (bars.length === 0) return null;

  const range = 0.3; // ±30% clamp; anything bigger pegs the bar at full height.

  return (
    <div className="tempo-sparkline" aria-hidden="true">
      <div className="tempo-sparkline__axis" />
      <span className="tempo-sparkline__edge tempo-sparkline__edge--top">fast</span>
      <span className="tempo-sparkline__edge tempo-sparkline__edge--bot">slow</span>
      {bars.map((b, i) => {
        const clamped = Math.max(-range, Math.min(range, b.dev));
        const heightPct = (Math.abs(clamped) / range) * 50;
        const isFast = clamped < 0;
        const positionStyle = isFast
          ? { bottom: '50%', height: `${heightPct}%` }
          : { top: '50%', height: `${heightPct}%` };
        return (
          <span
            key={i}
            className={`tempo-sparkline__bar tempo-sparkline__bar--${b.tier}`}
            style={{ left: `${b.midPct}%`, ...positionStyle }}
            title={`${(b.dev * 100).toFixed(0)}% ${isFast ? 'fast' : 'slow'} on this beat`}
          />
        );
      })}
    </div>
  );
}
