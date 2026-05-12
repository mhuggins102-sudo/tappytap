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

// Per-tap residuals above this threshold get their leverage on the slope
// fit dampened (Huber weighting). 60 ms is one tier past 'great' — a tap
// that's already in 'good' territory or worse counts less when deciding
// the player's overall pace.
const SLOPE_HUBER_THRESHOLD_MS = 60;
const SLOPE_IRLS_ITERATIONS = 3;

/**
 * Outlier-resistant OLS through origin. The line is pinned at (0, 0)
 * because the first tap is forced to time zero. The slope itself comes
 * from iteratively-reweighted least squares with Huber weights on the
 * per-tap residual, seeded by the median ratio so the first reweight
 * is already operating on a robust anchor rather than a badly-skewed
 * pure-OLS fit.
 *
 * A tap whose residual exceeds 60 ms gets weight 60/|residual|, so a
 * single way-off tap contributes only fractionally to the slope. A
 * consistently fast/slow player's taps all fall close to the fitted
 * line, so weights stay near 1 and the slope behaves like plain OLS.
 */
function fitSlopeRobustOls(expected: number[], taps: number[], n: number): number {
  const ratios: number[] = [];
  for (let i = 0; i < n; i++) {
    if (expected[i] > 1e-6) ratios.push(taps[i] / expected[i]);
  }
  if (ratios.length === 0) return 1;
  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  let slope = ratios.length % 2 === 0
    ? (ratios[mid - 1] + ratios[mid]) / 2
    : ratios[mid];

  for (let iter = 0; iter < SLOPE_IRLS_ITERATIONS; iter++) {
    let wNum = 0;
    let wDen = 0;
    for (let i = 0; i < n; i++) {
      if (expected[i] <= 1e-6) continue;
      const residualMs = Math.abs((taps[i] - slope * expected[i]) * 1000);
      const w = residualMs <= SLOPE_HUBER_THRESHOLD_MS
        ? 1
        : SLOPE_HUBER_THRESHOLD_MS / residualMs;
      wNum += w * taps[i] * expected[i];
      wDen += w * expected[i] * expected[i];
    }
    if (wDen > 1e-9) slope = wNum / wDen;
  }
  return slope;
}

/**
 * Tempo statistics computed from local IOI ratios, expressed in milliseconds.
 * Each per-IOI deviation is clamped to `capMs` before being averaged so a
 * single huge IOI doesn't dominate the score; the signed mean is kept
 * uncapped so the direction label still reflects the raw lean.
 */
function tempoStatistics(
  expected: number[],
  taps: number[],
  n: number,
  capMs: number,
): { meanAbsMsDev: number; meanMsDev: number } {
  if (n < 2) return { meanAbsMsDev: 0, meanMsDev: 0 };
  let sumAbs = 0;
  let sumSigned = 0;
  let count = 0;
  for (let i = 0; i < n - 1; i++) {
    const expIoi = expected[i + 1] - expected[i];
    if (expIoi <= 1e-6) continue;
    const tapIoi = taps[i + 1] - taps[i];
    // ms-level deviation of this beat-to-beat interval from target.
    const devMs = (tapIoi - expIoi) * 1000;
    sumAbs += Math.min(Math.abs(devMs), capMs);
    sumSigned += devMs;
    count++;
  }
  if (count === 0) return { meanAbsMsDev: 0, meanMsDev: 0 };
  return {
    meanAbsMsDev: sumAbs / count,
    meanMsDev: sumSigned / count,
  };
}

// Score-side cap: each per-tap residual and each per-IOI deviation is
// clamped to this value before being averaged into the rhythm and tempo
// scores. The judgment tiers above (used for color coding) still use the
// 120 ms miss threshold — these two purposes are decoupled. Setting the
// scoring cap higher (and using a smaller coefficient below) gives
// outliers room above zero so a single bad tap doesn't tank the score.
const SCORE_PENALTY_CAP_MS = 300;
// Linear slope: each ms of average capped error costs 1/3 of a point. With
// the 300 ms cap, a fully-capped element contributes exactly 100 / N to
// the deduction, so an all-miss round still floors at 0 just as before.
const SCORE_COEFFICIENT = 1 / 3;

export function scoreRound(expectedOnsets: number[], tapsSec: number[]): RoundResult {
  const taps = [...tapsSec].sort((a, b) => a - b);
  const expectedCount = expectedOnsets.length;
  const totalTaps = taps.length;
  // Positional 1:1: tap[i] is the player's attempt at expectedOnsets[i].
  // Input is capped at expectedCount upstream so extras can't occur; any
  // shortfall (player stopped early) becomes a miss for the unmatched
  // expected onsets at the tail.
  const matchedCount = Math.min(expectedCount, totalTaps);

  const slope = matchedCount >= 2 ? fitSlopeRobustOls(expectedOnsets, taps, matchedCount) : 1;
  const intercept = 0;

  const tapResults: TapResult[] = [];
  let rhythmErrorSum = 0;
  // The forced first tap (always at time 0, residual always 0) is excluded
  // from the rhythm average so it doesn't inflate the score for free. We
  // track the actual denominator separately.
  let rhythmContribCount = 0;
  let successCount = 0;

  for (let i = 0; i < matchedCount; i++) {
    const expRaw = expectedOnsets[i];
    const expCorr = slope * expRaw + intercept;
    const errorMs = (taps[i] - expCorr) * 1000;
    const rawErrorMs = (taps[i] - expRaw) * 1000;
    const { judgment } = judge(errorMs);
    if (judgment !== 'miss') successCount++;
    if (i > 0) {
      rhythmErrorSum += Math.min(Math.abs(errorMs), SCORE_PENALTY_CAP_MS);
      rhythmContribCount++;
    }
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
  // early hurts rhythm proportionally. (i is always ≥ 1 here if any taps
  // were made; if matchedCount = 0, the first iteration's i = 0 starts a
  // round where no first tap was forced, so it correctly counts.)
  for (let i = matchedCount; i < expectedCount; i++) {
    rhythmErrorSum += SCORE_PENALTY_CAP_MS;
    rhythmContribCount++;
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

  // Rhythm averages residuals over every meaningful onset — misses
  // included, but excluding the forced first tap which is always at time
  // 0 (residual 0) and would otherwise dilute the average. When there's
  // nothing past the first tap to measure (single-onset pattern that the
  // player completed) the round is trivially perfect.
  const meanAbsErrorMs = rhythmContribCount > 0
    ? rhythmErrorSum / rhythmContribCount
    : 0;
  const rhythmScore = rhythmContribCount === 0
    ? (matchedCount === 0 ? 0 : 100)
    : Math.max(0, Math.round(100 - meanAbsErrorMs * SCORE_COEFFICIENT));

  const tempoFactor = matchedCount >= 2 ? slope : 1;
  const tempoIntercept = 0;
  // Tempo is slope-based: the deviation of the best-fit line's slope from
  // 1 (the target pace). 4 points lost per percent of slope deviation, so
  // 5% off ⇒ 80, 10% ⇒ 60, 20% ⇒ 20, and 25% (or more) hits the floor at 0.
  const hasTempoData = matchedCount >= 2;
  const slopeDevPct = Math.abs(tempoFactor - 1) * 100;
  const tempoPct = Math.round(slopeDevPct);
  const tempoScore = hasTempoData
    ? Math.max(0, Math.round(100 - 4 * slopeDevPct))
    : 0;

  // Direction label is independent of the slope-based score. It comes from
  // per-IOI stats so mid-pattern wobble (slope ≈ 1 but bouncing gaps)
  // surfaces as 'unsteady' instead of being silently hidden by a clean slope.
  const tStats = hasTempoData
    ? tempoStatistics(expectedOnsets, taps, matchedCount, SCORE_PENALTY_CAP_MS)
    : { meanAbsMsDev: 0, meanMsDev: 0 };
  const tempoMsDev = tStats.meanAbsMsDev;
  // Direction:
  //   • If slope is clearly off the target (≥ 0.5%), it's the obvious story —
  //     direction is 'fast' or 'slow' from the slope sign.
  //   • If slope is ≈ 1 but per-IOI deviations exist, check the signed mean:
  //     a uniformly-signed lean ⇒ direction; cancelling fluctuations ⇒ 'mixed'.
  //   • Otherwise 'on' tempo (no measurable deviation).
  let tempoDirection: 'fast' | 'slow' | 'mixed' | 'on';
  if (!hasTempoData) {
    tempoDirection = 'on';
  } else if (slopeDevPct >= 2.0) {
    tempoDirection = tempoFactor < 1 ? 'fast' : 'slow';
  } else if (tStats.meanAbsMsDev < 3) {
    tempoDirection = 'on';
  } else if (Math.abs(tStats.meanMsDev) > 0.5 * tStats.meanAbsMsDev) {
    tempoDirection = tStats.meanMsDev < 0 ? 'fast' : 'slow';
  } else {
    tempoDirection = 'mixed';
  }

  const completeness = expectedCount > 0 ? successCount / expectedCount : 1;

  // Total = geometric mean of the two visible subscores. This rewards
  // balance: 75/75 ⇒ 75 stays put, but 50/100 drops to 71 — the same
  // arithmetic average, lower geo mean. A zero on either dimension
  // (no taps, way-off tempo) zeroes the total too.
  const totalScore = Math.max(
    0,
    Math.round(Math.sqrt(rhythmScore * tempoScore)),
  );

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
    tempoMsDev,
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
