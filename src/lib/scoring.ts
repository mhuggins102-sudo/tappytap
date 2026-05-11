import type { Judgment, JudgmentOrExtra, RoundResult, TapResult } from '../patterns/types';

const WINDOW_MS = 150;
const WINDOW_SEC = WINDOW_MS / 1000;
const MAX_MATCH_COST_SEC = WINDOW_SEC;
// Tiny epsilon over the window so a match at exactly 150 ms beats an extra+miss tie.
const GAP_TAP_SEC = WINDOW_SEC + 0.0001;
const GAP_EXP_SEC = WINDOW_SEC + 0.0001;

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
  { maxMs: 150, judgment: 'off', ptsHi: 50, ptsLo: 25 },
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
  // Constrained linear regression through the origin. The game forces the
  // player's first tap to time 0 and the pattern's first onset is also at 0,
  // so the fit must pass through (0, 0). A free-intercept OLS can pick a
  // non-zero intercept to balance residuals across the run, which then makes
  // the first tap look "early" or "late" even though it dictates time zero.
  const n = xs.length;
  if (n < 1) return { slope: 1, intercept: 0 };
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += xs[i] * ys[i];
    den += xs[i] * xs[i];
  }
  if (den === 0) return { slope: 1, intercept: 0 };
  return { slope: num / den, intercept: 0 };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

type Op = { kind: 'match'; i: number; j: number } | { kind: 'miss'; i: number } | { kind: 'extra'; j: number };

interface AlignResult {
  ops: Op[];
  totalCost: number;
  matchCount: number;
  longestRun: number;
}

function alignDP(expected: number[], taps: number[], slope: number, intercept: number): AlignResult {
  const n = expected.length;
  const m = taps.length;
  const corrected = new Array<number>(n);
  for (let i = 0; i < n; i++) corrected[i] = slope * expected[i] + intercept;

  // D[i][j] = min cost aligning expected[0..i) with taps[0..j)
  const D: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  // back[i][j]: 0=match, 1=miss(expected i), 2=extra(tap j)
  const back: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    D[i][0] = i * GAP_EXP_SEC;
    back[i][0] = 1;
  }
  for (let j = 1; j <= m; j++) {
    D[0][j] = j * GAP_TAP_SEC;
    back[0][j] = 2;
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const matchCost = Math.min(Math.abs(taps[j - 1] - corrected[i - 1]), MAX_MATCH_COST_SEC);
      const cMatch = D[i - 1][j - 1] + matchCost;
      const cMiss = D[i - 1][j] + GAP_EXP_SEC;
      const cExtra = D[i][j - 1] + GAP_TAP_SEC;
      let best = cMatch;
      let dir = 0;
      if (cMiss < best) {
        best = cMiss;
        dir = 1;
      }
      if (cExtra < best) {
        best = cExtra;
        dir = 2;
      }
      D[i][j] = best;
      back[i][j] = dir;
    }
  }

  const opsRev: Op[] = [];
  let i = n;
  let j = m;
  let matchCount = 0;
  while (i > 0 || j > 0) {
    if (i === 0) {
      opsRev.push({ kind: 'extra', j: j - 1 });
      j--;
      continue;
    }
    if (j === 0) {
      opsRev.push({ kind: 'miss', i: i - 1 });
      i--;
      continue;
    }
    const dir = back[i][j];
    if (dir === 0) {
      opsRev.push({ kind: 'match', i: i - 1, j: j - 1 });
      matchCount++;
      i--;
      j--;
    } else if (dir === 1) {
      opsRev.push({ kind: 'miss', i: i - 1 });
      i--;
    } else {
      opsRev.push({ kind: 'extra', j: j - 1 });
      j--;
    }
  }
  opsRev.reverse();
  let longestRun = 0;
  let currentRun = 0;
  for (const op of opsRev) {
    if (op.kind === 'match') {
      currentRun++;
      if (currentRun > longestRun) longestRun = currentRun;
    } else {
      currentRun = 0;
    }
  }
  return { ops: opsRev, totalCost: D[n][m], matchCount, longestRun };
}

interface Seed {
  slope: number;
  intercept: number;
}

function identitySeed(): Seed {
  return { slope: 1, intercept: 0 };
}

function medianIoiSeed(expected: number[], taps: number[]): Seed | null {
  if (expected.length < 2 || taps.length < 2) return null;
  const pairs = Math.min(expected.length, taps.length) - 1;
  if (pairs < 1) return null;
  const ratios: number[] = [];
  for (let k = 0; k < pairs; k++) {
    const expIoi = expected[k + 1] - expected[k];
    const tapIoi = taps[k + 1] - taps[k];
    if (expIoi > 1e-6) ratios.push(tapIoi / expIoi);
  }
  if (ratios.length === 0) return null;
  const slope = median(ratios);
  if (!isFinite(slope) || slope < 0.2 || slope > 5) return null;
  return { slope, intercept: 0 };
}

function spanSeed(expected: number[], taps: number[]): Seed | null {
  if (expected.length < 2 || taps.length < 2) return null;
  const expSpan = expected[expected.length - 1] - expected[0];
  if (expSpan <= 0) return null;
  const slope = (taps[taps.length - 1] - taps[0]) / expSpan;
  if (slope < 0.3 || slope > 3) return null;
  return { slope, intercept: 0 };
}

interface FitResult {
  slope: number;
  intercept: number;
  align: AlignResult;
}

function iterativeFitDP(expected: number[], taps: number[], seed: Seed): FitResult {
  let slope = seed.slope;
  let intercept = seed.intercept;
  let align = alignDP(expected, taps, slope, intercept);
  for (let iter = 0; iter < 5; iter++) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const op of align.ops) {
      if (op.kind === 'match') {
        xs.push(expected[op.i]);
        ys.push(taps[op.j]);
      }
    }
    if (xs.length < 2) break;
    const next = linearFit(xs, ys);
    if (Math.abs(next.slope - slope) < 0.001 && Math.abs(next.intercept - intercept) < 0.001) {
      slope = next.slope;
      intercept = next.intercept;
      align = alignDP(expected, taps, slope, intercept);
      break;
    }
    slope = next.slope;
    intercept = next.intercept;
    align = alignDP(expected, taps, slope, intercept);
  }
  return { slope, intercept, align };
}

function isBetterFit(a: FitResult, b: FitResult): boolean {
  // Higher matchCount wins; ties broken by lower cost; then by the longest
  // contiguous run of MATCH ops (so an alignment that places extras in a
  // single cluster is preferred over one that interleaves them between
  // matches — e.g. double-time-twice picks slope ≈ 0.5 with extras at the
  // end instead of slope=1 with every-other match); then by |slope-1|.
  if (a.align.matchCount !== b.align.matchCount) return a.align.matchCount > b.align.matchCount;
  if (Math.abs(a.align.totalCost - b.align.totalCost) > 1e-9) {
    return a.align.totalCost < b.align.totalCost;
  }
  if (a.align.longestRun !== b.align.longestRun) {
    return a.align.longestRun > b.align.longestRun;
  }
  return Math.abs(a.slope - 1) < Math.abs(b.slope - 1);
}

export function scoreRound(expectedOnsets: number[], tapsSec: number[]): RoundResult {
  const taps = [...tapsSec].sort((a, b) => a - b);
  const expectedCount = expectedOnsets.length;
  const totalTaps = taps.length;

  const seeds: Seed[] = [identitySeed()];
  const m = medianIoiSeed(expectedOnsets, taps);
  if (m) seeds.push(m);
  const s = spanSeed(expectedOnsets, taps);
  if (s) seeds.push(s);

  let best: FitResult | null = null;
  for (const seed of seeds) {
    const fit = iterativeFitDP(expectedOnsets, taps, seed);
    if (!best || isBetterFit(fit, best)) best = fit;
  }
  if (!best) {
    best = iterativeFitDP(expectedOnsets, taps, identitySeed());
  }

  const { slope, intercept, align } = best;

  // A MATCH whose residual exceeds the window is still a single event — the
  // player took one tap aimed at one expected onset, just with bad timing.
  // We label it 'miss' (poor timing) but keep it as a single MATCH so it is
  // not also counted as an EXTRA. Hit rate excludes miss-judged matches
  // (defined further below), so the per-tap categories don't overlap:
  //   • Hit rate counts only successful matches (perfect/great/ok/off).
  //   • Miss tally counts unmatched expected onsets PLUS miss-judged matches.
  //   • Extra tally counts taps with no expected onset at all.
  // These three categories partition every tap and every expected onset.
  const ops: Op[] = align.ops;

  type Ordered = TapResult & { _order: number };
  const results: Ordered[] = [];
  let matchedAbsErrorSum = 0;
  let matchCount = 0;
  let successfulMatchCount = 0;
  let lastExpectedSeen = -1;

  for (const op of ops) {
    if (op.kind === 'match') {
      const expRaw = expectedOnsets[op.i];
      const expCorr = slope * expRaw + intercept;
      const errorSec = taps[op.j] - expCorr;
      const errorMs = errorSec * 1000;
      const rawErrorMs = (taps[op.j] - expRaw) * 1000;
      const { judgment } = judge(errorMs);
      matchedAbsErrorSum += Math.abs(errorMs);
      matchCount++;
      if (judgment !== 'miss') successfulMatchCount++;
      lastExpectedSeen = op.i;
      results.push({
        _order: op.i * 2,
        expectedIdx: op.i,
        tapTime: taps[op.j],
        errorMs,
        rawErrorMs,
        judgment,
      });
    } else if (op.kind === 'miss') {
      lastExpectedSeen = op.i;
      results.push({
        _order: op.i * 2,
        expectedIdx: op.i,
        tapTime: null,
        errorMs: null,
        rawErrorMs: null,
        judgment: 'miss',
      });
    } else {
      results.push({
        _order: lastExpectedSeen * 2 + 1,
        expectedIdx: null,
        tapTime: taps[op.j],
        errorMs: null,
        rawErrorMs: null,
        judgment: 'extra',
      });
    }
  }

  results.sort((a, b) => a._order - b._order);
  const tapResults: TapResult[] = results.map(({ _order: _, ...rest }) => rest);

  const counts: Record<Judgment | 'extra', number> = {
    perfect: 0,
    great: 0,
    ok: 0,
    off: 0,
    miss: 0,
    extra: 0,
  };
  for (const r of tapResults) counts[r.judgment]++;

  const meanAbsErrorMs = matchCount > 0 ? matchedAbsErrorSum / matchCount : 0;
  const baseRhythm = Math.max(0, 100 - meanAbsErrorMs * (5 / 6));
  // Cherry-picking matches from a flood of taps would otherwise let a spammer
  // achieve rhythmScore=100 (the chosen matches happen to be on-beat). Scale
  // rhythm down by how many surplus taps the player produced per expected
  // onset, with a floor of 10. One extra-per-expected (e.g. double-time-twice)
  // costs 5 points; 24 extras-per-expected (typical spam) hits the floor.
  const extrasPerExpected = expectedCount > 0
    ? Math.max(0, (totalTaps - expectedCount) / expectedCount)
    : 0;
  const rhythmFactor = Math.max(0.1, 1 - 0.05 * extrasPerExpected);
  const rhythmScore = Math.round(baseRhythm * rhythmFactor);

  const tempoFactor = matchCount >= 2 ? slope : 1;
  const tempoIntercept = matchCount >= 2 ? intercept : 0;
  const tempoScore = Math.max(0, Math.round(100 * (1 - 2 * Math.abs(tempoFactor - 1))));
  const tempoPct = tempoFactor > 0 ? (1 / tempoFactor - 1) * 100 : 0;

  const completeness = expectedCount > 0 ? successfulMatchCount / expectedCount : 1;
  const cleanliness = totalTaps > 0 ? matchCount / totalTaps : matchCount === 0 ? 1 : 0;

  const totalScore =
    matchCount === 0
      ? 0
      : Math.max(
          0,
          Math.round((rhythmScore * tempoScore * completeness * cleanliness) / 100),
        );

  const accuracyPct = totalTaps > 0 ? Math.round(cleanliness * 100) : 0;

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
    cleanlinessPct: Math.round(cleanliness * 100),
    meanAbsErrorMs,
  };
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
      case 'off':
        return 'F';
      case 'miss':
        return 'M';
      case 'extra':
        return 'X';
    }
  };
  const seq = result.taps.map((t) => code(t.judgment)).join('');
  return `TappyTap ${dateStr}: ${result.accuracyPct}% — ${seq}`;
}
