import type { Judgment, RoundResult, TapResult } from '../patterns/types';

const WINDOW_MS = 150;
const EXTRA_PENALTY = 20;

interface Tier {
  maxMs: number;
  judgment: Judgment;
  points: number;
}

const TIERS: Tier[] = [
  { maxMs: 30, judgment: 'perfect', points: 100 },
  { maxMs: 60, judgment: 'great', points: 70 },
  { maxMs: 120, judgment: 'ok', points: 40 },
];

function judge(errorMs: number): { judgment: Judgment; points: number } {
  const abs = Math.abs(errorMs);
  for (const tier of TIERS) {
    if (abs <= tier.maxMs) return { judgment: tier.judgment, points: tier.points };
  }
  return { judgment: 'miss', points: 0 };
}

export function scoreRound(expectedOnsets: number[], tapsSec: number[]): RoundResult {
  const matched: Array<TapResult & { _order: number }> = [];
  const usedExpected = new Set<number>();
  const taps = [...tapsSec].sort((a, b) => a - b);

  const windowSec = WINDOW_MS / 1000;

  for (const tap of taps) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < expectedOnsets.length; i++) {
      if (usedExpected.has(i)) continue;
      const dist = Math.abs(tap - expectedOnsets[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestDist <= windowSec) {
      const errorMs = (tap - expectedOnsets[bestIdx]) * 1000;
      const { judgment } = judge(errorMs);
      usedExpected.add(bestIdx);
      matched.push({
        _order: bestIdx,
        expectedIdx: bestIdx,
        tapTime: tap,
        errorMs,
        judgment,
      });
    } else {
      matched.push({
        _order: expectedOnsets.length + matched.length,
        expectedIdx: null,
        tapTime: tap,
        errorMs: null,
        judgment: 'extra',
      });
    }
  }

  for (let i = 0; i < expectedOnsets.length; i++) {
    if (!usedExpected.has(i)) {
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
  let rawScore = 0;
  for (const r of results) {
    counts[r.judgment]++;
    if (r.judgment === 'extra') {
      rawScore -= EXTRA_PENALTY;
    } else if (r.errorMs !== null) {
      rawScore += judge(r.errorMs).points;
    }
  }

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
