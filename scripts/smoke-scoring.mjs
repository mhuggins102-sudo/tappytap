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
  assert(r.totalScore < 100, `+25ms → totalScore <100 (got ${r.totalScore})`);
  assert(r.totalScore >= 90, `+25ms → totalScore >=90 (got ${r.totalScore})`);
}

{
  const r = scoreRound(expected, expected.map((t) => t + 0.005));
  assert(r.totalScore >= 98, `+5ms → totalScore >=98 (got ${r.totalScore})`);
  assert(r.totalScore < 100, `+5ms → totalScore <100 (got ${r.totalScore})`);
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
  const r = scoreRound(expected, [0, 0.1, 0.5, 1.0]);
  assert(r.judgmentCounts.extra === 1, 'mid-round extra detected');
  assert(r.judgmentCounts.perfect === 2, '2 perfect after truncation');
  assert(r.judgmentCounts.miss === 1, 'truncated 4th tap leaves 1 miss');
}

{
  const r = scoreRound(expected, [0, 0.5, 1.0, 1.5, 2.0]);
  assert(r.judgmentCounts.perfect === 3, 'overflow: 3 perfect from first 3 taps');
  assert(r.judgmentCounts.extra === 0, 'overflow: trailing tap not counted as extra');
  assert(r.totalScore === 100, 'overflow: 4th tap dropped, score remains 100');
}

{
  const r = scoreRound(expected, [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]);
  assert(r.taps.length === 3, 'overflow heavy: only first 3 taps scored');
  assert(r.judgmentCounts.extra === 0, 'overflow heavy: no extras recorded');
}
