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
  assert(r.accuracyPct === 100, 'exact taps → 100% accuracy');
}

{
  // Quality drops within Perfect tier (~+8% off → ~92% score)
  const r = scoreRound(expected, expected.map((t) => t + 0.025));
  assert(r.judgmentCounts.perfect === 3, '+25ms → 3 perfect');
  assert(r.totalScore >= 90 && r.totalScore < 100, `+25ms score 90..99 (got ${r.totalScore})`);
  assert(r.accuracyPct === 100, '+25ms → 100% accuracy (all on target)');
}

{
  const r = scoreRound(expected, expected.map((t) => t + 0.05));
  assert(r.judgmentCounts.great === 3, '+50ms → 3 great');
}

{
  const r = scoreRound(expected, expected.map((t) => t + 0.08));
  assert(r.judgmentCounts.ok === 3, '+80ms → 3 ok');
}

{
  // Missed 2 of 3 expected onsets → completeness drops
  const r = scoreRound(expected, [0]);
  assert(r.judgmentCounts.perfect === 1, 'partial → 1 perfect');
  assert(r.judgmentCounts.miss === 2, 'partial → 2 miss');
  assert(r.accuracyPct === 100, 'partial → accuracy 100% (their tap was on target)');
  // quality=100, completeness=1/3, precision=1 → ~33
  assert(r.totalScore >= 32 && r.totalScore <= 34, `partial → score 32..34 (got ${r.totalScore})`);
}

{
  // 1 mid-round extra; the 4th tap still matches expected[2]
  const r = scoreRound(expected, [0, 0.1, 0.5, 1.0]);
  assert(r.judgmentCounts.perfect === 3, '3 perfect');
  assert(r.judgmentCounts.extra === 1, '1 extra');
  // quality=100, completeness=1, precision=3/4=0.75 → 75
  assert(r.totalScore === 75, `mid-round extra → score 75 (got ${r.totalScore})`);
  assert(r.accuracyPct === 75, 'accuracy = 3/4 = 75%');
}

{
  // Trailing extras: nailed pattern then kept tapping
  const r = scoreRound(expected, [0, 0.5, 1.0, 1.5, 2.0]);
  assert(r.judgmentCounts.perfect === 3, '3 perfect');
  assert(r.judgmentCounts.extra === 2, '2 trailing extras');
  // quality=100, completeness=1, precision=3/5=0.6 → 60
  assert(r.totalScore === 60, `trailing 2 extras → score 60 (got ${r.totalScore})`);
  assert(r.accuracyPct === 60, 'accuracy = 3/5 = 60%');
}

{
  // Frantic spam: pattern of 4, player taps 12 times, ~4 land in window
  const big = [0, 1.0, 2.0, 3.0];
  const taps = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 2.0, 2.4, 2.8, 3.0];
  const r = scoreRound(big, taps);
  assert(r.judgmentCounts.perfect >= 3, `spam: at least 3 land perfectly (got ${r.judgmentCounts.perfect})`);
  assert(r.totalScore < 40, `spam → score < 40 (got ${r.totalScore})`);
  assert(r.accuracyPct < 50, `spam → accuracy < 50% (got ${r.accuracyPct})`);
}

{
  // 2-5-3 vs 2-4-3: 9 expected, 9 perfect + 1 extra
  const big = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
  const r = scoreRound(big, [...big, 4.5]);
  assert(r.judgmentCounts.perfect === 9, '9 perfect');
  assert(r.judgmentCounts.extra === 1, '1 extra');
  // quality=100, completeness=1, precision=9/10=0.9 → 90
  assert(r.totalScore >= 88 && r.totalScore <= 91, `2-5-3 → score 88..91 (got ${r.totalScore})`);
  assert(r.accuracyPct === 90, '2-5-3 accuracy 90%');
}

{
  // Symmetry check: missing 1 vs adding 1 on a 9-onset pattern give similar scores
  const big = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
  const missOne = scoreRound(big, big.slice(0, 8));
  const extraOne = scoreRound(big, [...big, 4.5]);
  const diff = Math.abs(missOne.totalScore - extraOne.totalScore);
  assert(diff <= 2, `1 miss (${missOne.totalScore}) ≈ 1 extra (${extraOne.totalScore}) within 2 pts`);
}

{
  // No taps at all: score should be 0
  const r = scoreRound(expected, []);
  assert(r.totalScore === 0, 'no taps → score 0');
  assert(r.accuracyPct === 0, 'no taps → accuracy 0%');
  assert(r.judgmentCounts.miss === 3, 'no taps → 3 misses');
}
