import type { Judgment, JudgmentOrExtra, RoundResult, TapResult } from '../patterns/types';

const WINDOW_MS = 150;
const WINDOW_SEC = WINDOW_MS / 1000;
const TEMPO_SENSITIVITY = 2;

interface TierRange {
  maxMs: number;
  judgment: Judgment;
  ptsHi: number;
  ptsLo: number;
}

const TIERS: TierRange[] = [
  { maxMs: 30, judgment: 'perfect', ptsHi: 100, ptsLo: 90 },
  { maxMs: 60, judgment: 'great', ptsHi: 90, ptsLo: 75 },
  { maxMs: 120, judgment: 'ok', ptsHi: 75, ptsLo: 50 },
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
  expectedIdx: number | null;
  errorMs: number | null;
  judgment: JudgmentOrExtra;
  points: number;
}

export function matchTapLive(tap: number, expected: number[], used: Set<number>): LiveMatch {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < expected.length; i++) {
    if (used.has(i)) continue;
    const dist = Math.abs(tap - expected[i]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0 && bestDist <= WINDOW_SEC) {
    const errorMs = (tap - expected[bestIdx]) * 1000;
    const { judgment, points } = judge(errorMs);
    return { expectedIdx: bestIdx, errorMs, judgment, points };
  }
  return { expectedIdx: null, errorMs: null, judgment: 'extra', points: 0 };
}

function linearFit(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 2) return { slope: 1, intercept: 0 };
  let xMean = 0;
  let yMean = 0;
  for (let i = 0; i < n; i++) {
    xMean += xs[i];
    yMean += ys[i];
  }
  xMean /= n;
  yMean /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    num += dx * (ys[i] - yMean);
    den += dx * dx;
  }
  if (den === 0) return { slope: 1, intercept: 0 };
  const slope = num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

interface MatchedTap {
  tapTime: number;
  expectedIdx: number | null;
  errorMs: number | null;
  judgment: JudgmentOrExtra;
  points: number;
}

function greedyMatch(taps: number[], expected: number[], offsetFn: (e: number) => number): MatchedTap[] {
  const used = new Set<number>();
  const out: MatchedTap[] = [];
  for (const tap of taps) {
    let bestIdx = -1;
    let bestErr = Infinity;
    for (let i = 0; i < expected.length; i++) {
      if (used.has(i)) continue;
      const err = tap - offsetFn(expected[i]);
      const absErr = Math.abs(err);
      if (absErr < Math.abs(bestErr)) {
        bestErr = err;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && Math.abs(bestErr) <= WINDOW_SEC) {
      used.add(bestIdx);
      const errorMs = bestErr * 1000;
      const { judgment, points } = judge(errorMs);
      out.push({ tapTime: tap, expectedIdx: bestIdx, errorMs, judgment, points });
    } else {
      out.push({ tapTime: tap, expectedIdx: null, errorMs: null, judgment: 'extra', points: 0 });
    }
  }
  return out;
}

export function scoreRound(expectedOnsets: number[], tapsSec: number[]): RoundResult {
  const taps = [...tapsSec].sort((a, b) => a - b);

  // Pass 1: greedy match against raw expected positions.
  const pass1 = greedyMatch(taps, expectedOnsets, (e) => e);

  // Fit a line through the matched pairs so we can separate tempo from rhythm.
  const xs: number[] = [];
  const ys: number[] = [];
  for (const m of pass1) {
    if (m.expectedIdx !== null) {
      xs.push(expectedOnsets[m.expectedIdx]);
      ys.push(m.tapTime);
    }
  }
  const { slope, intercept } = linearFit(xs, ys);

  // Pass 2: re-match against fitted positions so taps that drifted out of the
  // raw window can be reclaimed if they were rhythmically on-line.
  const pass2 = greedyMatch(taps, expectedOnsets, (e) => slope * e + intercept);

  const used = new Set<number>();
  const tapResults: Array<TapResult & { _order: number }> = [];
  let matchedPoints = 0;
  let matchCount = 0;
  for (const m of pass2) {
    if (m.expectedIdx !== null) {
      used.add(m.expectedIdx);
      matchedPoints += m.points;
      matchCount += 1;
      tapResults.push({
        _order: m.expectedIdx,
        expectedIdx: m.expectedIdx,
        tapTime: m.tapTime,
        errorMs: m.errorMs,
        judgment: m.judgment,
      });
    } else {
      tapResults.push({
        _order: expectedOnsets.length + tapResults.length,
        expectedIdx: null,
        tapTime: m.tapTime,
        errorMs: null,
        judgment: 'extra',
      });
    }
  }
  for (let i = 0; i < expectedOnsets.length; i++) {
    if (!used.has(i)) {
      tapResults.push({
        _order: i,
        expectedIdx: i,
        tapTime: null,
        errorMs: null,
        judgment: 'miss',
      });
    }
  }
  tapResults.sort((a, b) => a._order - b._order);
  const results: TapResult[] = tapResults.map(({ _order: _, ...rest }) => rest);

  const counts: Record<Judgment | 'extra', number> = {
    perfect: 0,
    great: 0,
    ok: 0,
    miss: 0,
    extra: 0,
  };
  for (const r of results) counts[r.judgment]++;

  const totalTaps = taps.length;
  const expectedCount = expectedOnsets.length;
  const avgMatchQuality = matchCount > 0 ? matchedPoints / matchCount : 0;
  const completeness = expectedCount > 0 ? matchCount / expectedCount : 1;
  const precision = totalTaps > 0 ? matchCount / totalTaps : 0;

  const tempoFactor = matchCount >= 2 ? slope : 1;
  const tempoQuality = Math.max(0, 1 - TEMPO_SENSITIVITY * Math.abs(tempoFactor - 1));

  const totalScore = Math.max(
    0,
    Math.round(avgMatchQuality * completeness * precision * tempoQuality),
  );
  const accuracyPct = totalTaps > 0 ? Math.round(precision * 100) : 0;

  return { taps: results, totalScore, accuracyPct, judgmentCounts: counts, tempoFactor };
}

export function shareString(dateStr: string, result: RoundResult): string {
  const code = (j: TapResult['judgment']): string => {
    switch (j) {
      case 'perfect':
        return 'P';
      case 'great':
        return 'G';
      case 'ok':
        return 'O';
      case 'miss':
        return 'M';
      case 'extra':
        return 'X';
    }
  };
  const seq = result.taps.map((t) => code(t.judgment)).join('');
  return `TappyTap ${dateStr}: ${result.accuracyPct}% — ${seq}`;
}
