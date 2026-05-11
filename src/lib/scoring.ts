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
 * Tempo stability — RMS deviation of local IOI ratios from 1.0. Captures
 * BOTH consistent offset (all ratios = 1.1 ⇒ rms = 0.1) AND mid-pattern
 * fluctuation (ratios bouncing between 0.85 and 1.15 also gives a high
 * rms even if their mean is 1). The displayed tempo % still comes from the
 * median-ratio slope, but the tempoScore is driven by this number so a
 * player who "made it up at the end" no longer scores tempo 100.
 */
function tempoRmsDeviation(expected: number[], taps: number[], n: number): number {
  if (n < 2) return 0;
  let sumSqDev = 0;
  let count = 0;
  for (let i = 0; i < n - 1; i++) {
    const expIoi = expected[i + 1] - expected[i];
    if (expIoi <= 1e-6) continue;
    const tapIoi = taps[i + 1] - taps[i];
    const ratio = tapIoi / expIoi;
    const dev = ratio - 1;
    sumSqDev += dev * dev;
    count++;
  }
  if (count === 0) return 0;
  return Math.sqrt(sumSqDev / count);
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
  // Tempo score is driven by the RMS deviation of local IOI ratios from 1.0
  // (k = 300), not just the overall slope. This means a player who rushed
  // mid-pattern and recovered by the end gets a lower tempo score than one
  // who held a steady (even if slightly off) tempo throughout.
  const tempoRms = matchedCount >= 2 ? tempoRmsDeviation(expectedOnsets, taps, matchedCount) : 0;
  const tempoScore = Math.max(0, Math.round(100 - 300 * tempoRms));
  // Signed: positive = fast, negative = slow.
  const tempoPct = tempoFactor > 0 ? (1 / tempoFactor - 1) * 100 : 0;

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
