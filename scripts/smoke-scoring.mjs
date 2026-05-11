import { scoreRound } from '../src/lib/scoring.ts';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('PASS:', msg);
  }
}

const expected = [0, 0.5, 1.0];

{
  const r = scoreRound(expected, [0, 0.5, 1.0]);
  assert(r.judgmentCounts.perfect === 3, 'exact taps → 3 perfect');
  assert(r.totalScore === 100, 'exact taps → score 100');
}

{
  const r = scoreRound(expected, expected.map((t) => t + 0.025));
  assert(r.judgmentCounts.perfect === 3, '+25ms taps → 3 perfect');
  assert(r.totalScore >= 90 && r.totalScore < 100, `+25ms → totalScore 90..99 (got ${r.totalScore})`);
}

{
  const r = scoreRound(expected, expected.map((t) => t + 0.005));
  assert(r.totalScore >= 98 && r.totalScore < 100, `+5ms → totalScore 98..99 (got ${r.totalScore})`);
}

{
  const r = scoreRound(expected, expected.map((t) => t + 0.05));
  assert(r.judgmentCounts.great === 3, '+50ms taps → 3 great');
}

{
  const r = scoreRound(expected, expected.map((t) => t + 0.08));
  assert(r.judgmentCounts.ok === 3, '+80ms taps → 3 ok');
}

{
  const r = scoreRound(expected, [0]);
  assert(r.judgmentCounts.perfect === 1, 'partial → 1 perfect');
  assert(r.judgmentCounts.miss === 2, 'partial → 2 miss');
}

{
  // Mid-round extra: player taps 4 times against 3 expected. First tap is a stray; the rest line up.
  const r = scoreRound(expected, [0, 0.1, 0.5, 1.0]);
  assert(r.judgmentCounts.perfect === 3, '3 expected matched perfectly');
  assert(r.judgmentCounts.extra === 1, 'one stray tap counted as extra');
  // Extra penalty = 100/3 ≈ 33.3 → score = (3×100 − 33.3)/300 ≈ 89
  assert(r.totalScore >= 88 && r.totalScore <= 90, `mid-round extra → 88..90 (got ${r.totalScore})`);
}

{
  // Trailing extras: pattern fully nailed, then the player keeps tapping past the end.
  const r = scoreRound(expected, [0, 0.5, 1.0, 1.5, 2.0]);
  assert(r.judgmentCounts.perfect === 3, 'trailing: 3 perfect from in-window taps');
  assert(r.judgmentCounts.extra === 2, 'trailing: 2 extras recorded');
  // Each extra costs 100/3 ≈ 33.3, two extras → score ≈ 100 − 66.7/3 = 78
  assert(r.totalScore >= 76 && r.totalScore <= 80, `trailing 2 extras → 76..80 (got ${r.totalScore})`);
}

{
  // Bigger pattern: extras hurt less proportionally (symmetric with miss opportunity-cost).
  const big = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]; // 9 expected
  const taps = [...big, 4.5, 5.0]; // 9 perfect + 2 trailing
  const r = scoreRound(big, taps);
  assert(r.judgmentCounts.perfect === 9, 'big pattern: 9 perfect');
  assert(r.judgmentCounts.extra === 2, 'big pattern: 2 extras');
  // Each extra = 100/9 ≈ 11.1. Two extras → 22.2 deducted. (9×100 − 22.2)/900 ≈ 97.5 → 98
  assert(r.totalScore >= 97 && r.totalScore <= 99, `big pattern w/ 2 extras → 97..99 (got ${r.totalScore})`);
}

{
  // Extras are intentionally lighter than misses: a missed beat forfeits
  // a full Perfect (~100/N points), while an extra only deducts 100/N.
  // So extras feel like minor ornamentation; misses feel like broken rhythm.
  const big = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
  const missOne = scoreRound(big, big.slice(0, 8));
  const extraOne = scoreRound(big, [...big, 4.5]);
  assert(missOne.totalScore < extraOne.totalScore, `1 miss should cost more than 1 extra (miss=${missOne.totalScore}, extra=${extraOne.totalScore})`);
}
