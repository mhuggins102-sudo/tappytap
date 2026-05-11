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
  assert(r.totalScore === 100, 'exact taps → 100');
  assert(r.accuracyPct === 100, 'exact taps → 100%');
  assert(Math.abs(r.tempoFactor - 1) < 0.001, 'exact taps → tempo 1.0');
}

{
  // 5% fast, perfect rhythm: rhythm is 100, tempo penalty is 10% (sensitivity 2)
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  const taps = exp.map((t) => t * 0.95);
  const r = scoreRound(exp, taps);
  assert(r.judgmentCounts.perfect === 5, '5% fast perfect rhythm → 5 perfect after correction');
  assert(r.totalScore === 90, `5% fast → 90 (got ${r.totalScore})`);
  assert(Math.abs(r.tempoFactor - 0.95) < 0.01, `tempoFactor ≈ 0.95 (got ${r.tempoFactor.toFixed(3)})`);
}

{
  // 10% fast, perfect rhythm: rhythm is 100, tempo penalty is 20%
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  const taps = exp.map((t) => t * 0.9);
  const r = scoreRound(exp, taps);
  assert(r.judgmentCounts.perfect === 5, `10% fast → 5 perfect after correction (got perfect=${r.judgmentCounts.perfect})`);
  assert(r.totalScore === 80, `10% fast → 80 (got ${r.totalScore})`);
  assert(Math.abs(r.tempoFactor - 0.9) < 0.01, `tempoFactor ≈ 0.9 (got ${r.tempoFactor.toFixed(3)})`);
}

{
  // 2% fast, perfect rhythm: tempo penalty 4%
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  const taps = exp.map((t) => t * 0.98);
  const r = scoreRound(exp, taps);
  assert(r.totalScore === 96, `2% fast → 96 (got ${r.totalScore})`);
}

{
  // On tempo, jittery rhythm
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  const taps = [0, 0.55, 0.95, 1.55, 1.95];
  const r = scoreRound(exp, taps);
  // Linear fit will be near 1.0; residuals should still reflect jitter
  assert(Math.abs(r.tempoFactor - 1) < 0.05, `jittery on tempo → factor ≈ 1 (got ${r.tempoFactor.toFixed(3)})`);
  assert(r.totalScore < 95, `jittery on tempo → not perfect score (got ${r.totalScore})`);
  assert(r.judgmentCounts.perfect + r.judgmentCounts.great === 5, 'jittery → all hit within great or better');
}

{
  // Mid-round extra
  const r = scoreRound(expected, [0, 0.1, 0.5, 1.0]);
  assert(r.judgmentCounts.perfect === 3, '3 perfect after tempo correction');
  assert(r.judgmentCounts.extra === 1, '1 extra (the stray)');
  assert(r.accuracyPct === 75, 'accuracy = 3/4 = 75%');
}

{
  // Trailing extras
  const r = scoreRound(expected, [0, 0.5, 1.0, 1.5, 2.0]);
  assert(r.judgmentCounts.perfect === 3, '3 perfect');
  assert(r.judgmentCounts.extra === 2, '2 trailing extras');
  assert(r.totalScore === 60, `trailing 2 extras → 60 (got ${r.totalScore})`);
}

{
  // Spam — 12 taps on 4-onset pattern
  const big = [0, 1.0, 2.0, 3.0];
  const taps = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 2.0, 2.4, 2.8, 3.0];
  const r = scoreRound(big, taps);
  assert(r.totalScore < 40, `spam → score < 40 (got ${r.totalScore})`);
  assert(r.accuracyPct < 50, `spam → accuracy < 50% (got ${r.accuracyPct})`);
}

{
  // No taps
  const r = scoreRound(expected, []);
  assert(r.totalScore === 0, 'no taps → 0');
  assert(r.tempoFactor === 1, 'no taps → tempo 1.0 default');
}

{
  // 1 miss vs 1 extra symmetry on a 9-onset pattern
  const big = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
  const missOne = scoreRound(big, big.slice(0, 8));
  const extraOne = scoreRound(big, [...big, 4.5]);
  assert(Math.abs(missOne.totalScore - extraOne.totalScore) <= 2, `1 miss (${missOne.totalScore}) ≈ 1 extra (${extraOne.totalScore})`);
}

{
  // Off tempo + intentionally bad rhythm: both factors should hurt the score
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  // Each tap is 5% fast PLUS individual jitter of ±50ms
  const taps = [0, 0.475 + 0.05, 0.95 - 0.05, 1.425 + 0.05, 1.9 - 0.05];
  const r = scoreRound(exp, taps);
  assert(r.totalScore < 80, `off-tempo + bad rhythm → < 80 (got ${r.totalScore})`);
  assert(r.totalScore > 40, `off-tempo + bad rhythm → > 40 (got ${r.totalScore})`);
}
