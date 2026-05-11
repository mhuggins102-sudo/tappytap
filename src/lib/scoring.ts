import type { Judgment, RoundResult, TapResult } from '../patterns/types';

interface TierRange {
  maxMs: number;
  judgment: Judgment;
  ptsHi: number;
  ptsLo: number;
}

const TIERS: TierRange[] = [
  { maxMs: 30, judgment: 'perfect', ptsHi: 100, ptsLo: 90 },
  { maxMs: 60, judgment: 'great', ptsHi: 90, ptsLo: 75 },
  { maxMs: 90, judgment: 'good', ptsHi: 75, ptsLo: 60 },
  { maxMs: 120, judgment: 'ok', ptsHi: 60, ptsLo: 40 },
];

function judge(errorMs: number): { judgment: Judgment; points: number } {
  const abs = Math.abs(errorMs);
  let prev = 0;
  for (const tier of TIERS) {
    if (abs <= tier.maxMs) {
      const span = tier.maxMs - prev;
      const t = span > 0 ? (abs - prev) / span : 0;
      const points = tier.ptsHi - t * (tier.ptsHi - tier.ptsLo);
      return { judgment: tier.judgment, points };
    }
    prev = tier.maxMs;
  }
  return { judgment: 'miss', points: 0 };
}

export interface LiveMatch {
  expectedIdx: number;
  errorMs: number;
  judgment: Judgment;
  points: number;
}

/**
 * Judge an in-progress tap against the expected onset at the same positional
 * index. Used for live colored-flash feedback during the echo phase. Live
 * judgments are raw (no tempo correction); the final score on the result
 * screen applies tempo correction so a player who's consistently fast/slow
 * but rhythmically tight will see better post-correction judgments.
 */
export function matchTapLive(
  tap: number,
  expectedOnset: number,
  expectedIdx: number,
): LiveMatch {
  const errorMs = (tap - expectedOnset) * 1000;
  const { judgment, points } = judge(errorMs);
  return { expectedIdx, errorMs, judgment, points };
}

/**
 * Estimate tempo as the median of tap[i]/expected[i] across matched pairs.
 * Median is robust: a single very-late or very-early tap won't drag the
 * fitted slope, so that tap's residual reflects only its own error rather
 * than being smeared across the rest of the round.
 *
 * The first tap is always time 0 (game forces it), so it doesn't contribute
 * a ratio; the residual computation then naturally pins tap 0 to perfect.
 */
function fitSlopeMedianRatio(expected: number[], taps: number[], n: number): number {
  const ratios: number[] = [];
  for (let i = 0; i < n; i++) {
    if (expected[i] > 1e-6) {
      ratios.push(taps[i] / expected[i]);
    }
  }
  if (ratios.length === 0) return 1;
  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 === 0
    ? (ratios[mid - 1] + ratios[mid]) / 2
    : ratios[mid];
}

/**
 * Tempo statistics computed from local IOI ratios. The score and the
 * displayed % both come from meanAbsDev, so they move together: each
 * percent of typical IOI deviation costs 2 points (5% off ⇒ 90, 10% ⇒ 80).
 */
function tempoStatistics(
  expected: number[],
  taps: number[],
  n: number,
): { meanAbsDev: number; meanDev: number } {
  if (n < 2) return { meanAbsDev: 0, meanDev: 0 };
  let sumAbs = 0;
  let sumSigned = 0;
  let count = 0;
  for (let i = 0; i < n - 1; i++) {
    const expIoi = expected[i + 1] - expected[i];
    if (expIoi <= 1e-6) continue;
    const tapIoi = taps[i + 1] - taps[i];
    const dev = tapIoi / expIoi - 1;
    sumAbs += Math.abs(dev);
    sumSigned += dev;
    count++;
  }
  if (count === 0) return { meanAbsDev: 0, meanDev: 0 };
  return {
    meanAbsDev: sumAbs / count,
    meanDev: sumSigned / count,
  };
}

const MISS_MS = 120;
// A miss — whether a way-off tap or a note the player didn't reach — feeds
// this fixed penalty into the rhythm calculation. Matched residuals are
// capped at the same value so a single very-late tap is no worse for rhythm
// than not tapping at all.
const RHYTHM_MISS_PENALTY_MS = MISS_MS;

export function scoreRound(expectedOnsets: number[], tapsSec: number[]): RoundResult {
  const taps = [...tapsSec].sort((a, b) => a - b);
  const expectedCount = expectedOnsets.length;
  const totalTaps = taps.length;
  // Positional 1:1: tap[i] is the player's attempt at expectedOnsets[i].
  // Input is capped at expectedCount upstream so extras can't occur; any
  // shortfall (player stopped early) becomes a miss for the unmatched
  // expected onsets at the tail.
  const matchedCount = Math.min(expectedCount, totalTaps);

  const slope = matchedCount >= 2 ? fitSlopeMedianRatio(expectedOnsets, taps, matchedCount) : 1;
  const intercept = 0;

  const tapResults: TapResult[] = [];
  let rhythmErrorSum = 0;
  let successCount = 0;

  for (let i = 0; i < matchedCount; i++) {
    const expRaw = expectedOnsets[i];
    const expCorr = slope * expRaw + intercept;
    const errorMs = (taps[i] - expCorr) * 1000;
    const rawErrorMs = (taps[i] - expRaw) * 1000;
    const { judgment } = judge(errorMs);
    if (judgment !== 'miss') successCount++;
    rhythmErrorSum += Math.min(Math.abs(errorMs), RHYTHM_MISS_PENALTY_MS);
    tapResults.push({
      expectedIdx: i,
      tapTime: taps[i],
      errorMs,
      rawErrorMs,
      judgment,
    });
  }

  // Tail expected onsets the player didn't reach are misses with no tap.
  // They feed the same penalty into rhythm as a matched miss, so stopping
  // early hurts rhythm proportionally.
  for (let i = matchedCount; i < expectedCount; i++) {
    rhythmErrorSum += RHYTHM_MISS_PENALTY_MS;
    tapResults.push({
      expectedIdx: i,
      tapTime: null,
      errorMs: null,
      rawErrorMs: null,
      judgment: 'miss',
    });
  }

  const counts: Record<Judgment, number> = {
    perfect: 0,
    great: 0,
    good: 0,
    ok: 0,
    miss: 0,
  };
  for (const r of tapResults) counts[r.judgment]++;

  // Rhythm averages across ALL expected onsets — including misses — so a
  // miss already shows up here. Hit rate is therefore not a separate
  // subscore, only the Miss tally and the red dots on the You row.
  const meanAbsErrorMs = expectedCount > 0 ? rhythmErrorSum / expectedCount : 0;
  const rhythmScore = expectedCount === 0
    ? 0
    : Math.max(0, Math.round(100 - meanAbsErrorMs * (5 / 6)));

  const tempoFactor = matchedCount >= 2 ? slope : 1;
  const tempoIntercept = 0;
  // Score and displayed % both use meanAbsDev so the two stay in lockstep:
  // tempoScore ≈ 100 − 2 × tempoPct (each percent of typical IOI deviation
  // costs 2 points). Captures both consistent off-pace AND mid-pattern
  // wobble — both raise meanAbsDev.
  const tStats = matchedCount >= 2
    ? tempoStatistics(expectedOnsets, taps, matchedCount)
    : { meanAbsDev: 0, meanDev: 0 };
  const tempoScore = Math.max(0, Math.round(100 - 200 * tStats.meanAbsDev));
  const tempoPct = Math.round(tStats.meanAbsDev * 100);
  // Direction: 'fast' or 'slow' only when the signed mean is dominant enough
  // (≥ 50% of the absolute mean) to be the obvious story; otherwise the
  // fluctuations roughly cancel and we label it 'mixed' so the player knows
  // they were unsteady rather than systematically off.
  let tempoDirection: 'fast' | 'slow' | 'mixed' | 'on';
  if (tStats.meanAbsDev < 0.005) {
    tempoDirection = 'on';
  } else if (Math.abs(tStats.meanDev) > 0.5 * tStats.meanAbsDev) {
    // Negative dev = tap_ioi < exp_ioi = playing faster.
    tempoDirection = tStats.meanDev < 0 ? 'fast' : 'slow';
  } else {
    tempoDirection = 'mixed';
  }

  const completeness = expectedCount > 0 ? successCount / expectedCount : 1;

  const totalScore =
    matchedCount === 0
      ? 0
      : Math.max(0, Math.round((rhythmScore * tempoScore) / 100));

  const accuracyPct = Math.round(completeness * 100);

  return {
    taps: tapResults,
    totalScore,
    accuracyPct,
    judgmentCounts: counts,
    tempoFactor,
    tempoIntercept,
    rhythmScore,
    tempoScore,
    tempoPct,
    tempoDirection,
    completenessPct: Math.round(completeness * 100),
    meanAbsErrorMs,
  };
}

export function shareString(dateStr: string, result: RoundResult): string {
  const code = (j: Judgment): string => {
    switch (j) {
      case 'perfect':
        return 'P';
      case 'great':
        return 'G';
      case 'good':
        return 'D';
      case 'ok':
        return 'O';
      case 'miss':
        return 'M';
    }
  };
  const seq = result.taps.map((t) => code(t.judgment)).join('');
  return `TappyTap ${dateStr}: ${result.accuracyPct}% — ${seq}`;
}
