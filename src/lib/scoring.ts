import type { Judgment, JudgmentOrExtra, RoundResult, TapResult } from '../patterns/types';

const WINDOW_MS = 150;
const EXTRA_PENALTY = 20;

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
  const windowSec = WINDOW_MS / 1000;
  if (bestIdx >= 0 && bestDist <= windowSec) {
    const errorMs = (tap - expected[bestIdx]) * 1000;
    const { judgment, points } = judge(errorMs);
    return { expectedIdx: bestIdx, errorMs, judgment, points };
  }
  return { expectedIdx: null, errorMs: null, judgment: 'extra', points: -EXTRA_PENALTY };
}

export function scoreRound(expectedOnsets: number[], tapsSec: number[]): RoundResult {
  const taps = [...tapsSec].sort((a, b) => a - b);
  const used = new Set<number>();
  const matched: Array<TapResult & { _order: number }> = [];
  let rawScore = 0;

  for (const tap of taps) {
    const m = matchTapLive(tap, expectedOnsets, used);
    if (m.expectedIdx !== null) used.add(m.expectedIdx);
    rawScore += m.points;
    matched.push({
      _order: m.expectedIdx ?? expectedOnsets.length + matched.length,
      expectedIdx: m.expectedIdx,
      tapTime: tap,
      errorMs: m.errorMs,
      judgment: m.judgment,
    });
  }

  for (let i = 0; i < expectedOnsets.length; i++) {
    if (!used.has(i)) {
      matched.push({
        _order: i,
        expectedIdx: i,
        tapTime: null,
        errorMs: null,
        judgment: 'miss',
      });
    }
  }

  matched.sort((a, b) => a._order - b._order);
  const results: TapResult[] = matched.map(({ _order: _, ...rest }) => rest);

  const counts: Record<Judgment | 'extra', number> = {
    perfect: 0,
    great: 0,
    ok: 0,
    miss: 0,
    extra: 0,
  };
  for (const r of results) counts[r.judgment]++;

  const maxScore = expectedOnsets.length * 100;
  const totalScore = maxScore > 0 ? Math.max(0, Math.round((rawScore / maxScore) * 100)) : 0;
  const hits = counts.perfect + counts.great + counts.ok;
  const accuracyPct = expectedOnsets.length > 0 ? Math.round((hits / expectedOnsets.length) * 100) : 0;

  return { taps: results, totalScore, accuracyPct, judgmentCounts: counts };
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
