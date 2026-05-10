// Quick verification of scoring per the plan's automated sanity checks.
// Run: node scripts/smoke-scoring.mjs (after `npm run build`)

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
}

{
  const r = scoreRound(expected, expected.map((t) => t + 0.05));
  assert(r.judgmentCounts.great === 3, '+50ms taps → 3 great');
}

{
  const r = scoreRound(expected, expected.map((t) => t + 0.08));
  assert(r.judgmentCounts.ok === 3, '+80ms taps → 3 ok (exceeds great tier)');
}

{
  const r = scoreRound(expected, [0]);
  assert(r.judgmentCounts.perfect === 1, 'partial → 1 perfect');
  assert(r.judgmentCounts.miss === 2, 'partial → 2 miss');
}

{
  const r = scoreRound(expected, [0, 0.1, 0.5, 1.0]);
  assert(r.judgmentCounts.extra === 1, 'extra tap detected');
  assert(r.judgmentCounts.perfect === 3, '3 expected matched perfectly');
}
