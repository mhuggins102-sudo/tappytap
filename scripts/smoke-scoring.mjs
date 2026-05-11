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
  assert(r.rhythmScore === 100 && r.tempoScore === 100, 'exact taps → both sub-scores 100');
}

{
  // 5% fast, perfect rhythm. Multiplicative: 100*90*1*1/100 = 90.
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  const taps = exp.map((t) => t * 0.95);
  const r = scoreRound(exp, taps);
  assert(r.judgmentCounts.perfect === 5, '5% fast perfect rhythm → 5 perfect after correction');
  assert(r.totalScore === 90, `5% fast → 90 (got ${r.totalScore})`);
  assert(r.tempoScore === 90, `5% fast → tempoScore 90 (got ${r.tempoScore})`);
  assert(Math.abs(r.tempoFactor - 0.95) < 0.01, `tempoFactor ≈ 0.95 (got ${r.tempoFactor.toFixed(3)})`);
}

{
  // 10% fast, perfect rhythm. Multiplicative: 100*80*1*1/100 = 80.
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  const taps = exp.map((t) => t * 0.9);
  const r = scoreRound(exp, taps);
  assert(r.judgmentCounts.perfect === 5, `10% fast → 5 perfect after correction (got perfect=${r.judgmentCounts.perfect})`);
  assert(r.totalScore === 80, `10% fast → 80 (got ${r.totalScore})`);
  assert(r.tempoScore === 80, `10% fast → tempoScore 80 (got ${r.tempoScore})`);
  assert(Math.abs(r.tempoFactor - 0.9) < 0.01, `tempoFactor ≈ 0.9 (got ${r.tempoFactor.toFixed(3)})`);
}

{
  // 2% fast: tempo penalty 4% → 100*96*1*1/100 = 96.
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  const taps = exp.map((t) => t * 0.98);
  const r = scoreRound(exp, taps);
  assert(r.totalScore === 96, `2% fast → 96 (got ${r.totalScore})`);
}

{
  // 30% fast (1.3x speed). tempoScore ≈ 54 → total ≈ 54.
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  const taps = exp.map((t) => t / 1.3);
  const r = scoreRound(exp, taps);
  assert(Math.abs(r.tempoFactor - 1 / 1.3) < 0.01, `1.3x → tempoFactor ≈ 0.77 (got ${r.tempoFactor.toFixed(3)})`);
  assert(r.judgmentCounts.perfect === 5, `1.3x → 5 perfect after correction (got ${r.judgmentCounts.perfect})`);
  assert(r.tempoScore >= 50 && r.tempoScore <= 58, `1.3x → tempoScore 50..58 (got ${r.tempoScore})`);
  assert(r.totalScore >= 50 && r.totalScore <= 58, `1.3x → total 50..58 (got ${r.totalScore})`);
}

{
  // Easy-style 16-onset pattern at 1.3x speed — the realistic case the user reported.
  const exp = [];
  for (let i = 0; i < 16; i++) exp.push(i * 0.3);
  const taps = exp.map((t) => t / 1.3);
  const r = scoreRound(exp, taps);
  assert(Math.abs(r.tempoFactor - 1 / 1.3) < 0.01, `16-onset 1.3x → tempoFactor ≈ 0.77 (got ${r.tempoFactor.toFixed(3)})`);
}

{
  // On tempo, jittery rhythm. rhythm drops, tempo stays high.
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  const taps = [0, 0.55, 0.95, 1.55, 1.95];
  const r = scoreRound(exp, taps);
  assert(Math.abs(r.tempoFactor - 1) < 0.05, `jittery on tempo → factor ≈ 1 (got ${r.tempoFactor.toFixed(3)})`);
  assert(r.totalScore < 95, `jittery on tempo → not perfect score (got ${r.totalScore})`);
  assert(r.judgmentCounts.perfect + r.judgmentCounts.great === 5, 'jittery → all hit within great or better');
}

{
  // Mid-round extra: 3 matched + 1 extra. clean=75, rest=100 → avg=94
  const r = scoreRound(expected, [0, 0.1, 0.5, 1.0]);
  assert(r.judgmentCounts.perfect === 3, '3 perfect after tempo correction');
  assert(r.judgmentCounts.extra === 1, '1 extra (the stray)');
  assert(r.accuracyPct === 75, 'accuracy = 3/4 = 75%');
  assert(r.cleanlinessPct === 75, 'cleanliness = 75');
}

{
  // Trailing extras: 3 matched + 2 extras. Multiplicative: 100*100*1*0.6/100 = 60.
  const r = scoreRound(expected, [0, 0.5, 1.0, 1.5, 2.0]);
  assert(r.judgmentCounts.perfect === 3, '3 perfect');
  assert(r.judgmentCounts.extra === 2, '2 trailing extras');
  assert(r.totalScore === 60, `trailing 2 extras → 60 (got ${r.totalScore})`);
  assert(r.cleanlinessPct === 60, `trailing 2 extras → clean 60 (got ${r.cleanlinessPct})`);
}

{
  // Spam — 12 taps on 4-onset pattern. Cleanliness multiplier crushes the total.
  const big = [0, 1.0, 2.0, 3.0];
  const taps = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 2.0, 2.4, 2.8, 3.0];
  const r = scoreRound(big, taps);
  assert(r.totalScore < 40, `spam → score < 40 (got ${r.totalScore})`);
  assert(r.accuracyPct < 50, `spam → accuracy < 50% (got ${r.accuracyPct})`);
  assert(r.judgmentCounts.extra >= 6, `spam → many extras (got ${r.judgmentCounts.extra})`);
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
  // Off tempo + intentionally bad rhythm: both factors should hurt the total.
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  // Each tap is 5% fast PLUS individual jitter of ±50ms
  const taps = [0, 0.475 + 0.05, 0.95 - 0.05, 1.425 + 0.05, 1.9 - 0.05];
  const r = scoreRound(exp, taps);
  assert(r.totalScore < 80, `off-tempo + bad rhythm → < 80 (got ${r.totalScore})`);
  assert(r.totalScore > 40, `off-tempo + bad rhythm → > 40 (got ${r.totalScore})`);
  assert(r.rhythmScore < 80, `off-tempo + bad rhythm → rhythmScore < 80 (got ${r.rhythmScore})`);
  assert(r.tempoScore < 95, `off-tempo + bad rhythm → tempoScore < 95 (got ${r.tempoScore})`);
}

{
  // First tap is the player's time-zero anchor and must always be 'perfect'.
  // Constrained fit (intercept=0) guarantees this even when later taps drift.
  const exp = [0, 0.3, 0.6, 0.9, 1.2];
  const drifty = [0, 0.5, 0.8, 1.1, 1.4]; // big offset from tap 2 onward
  const r = scoreRound(exp, drifty);
  assert(r.taps[0].judgment === 'perfect', `first tap perfect (got ${r.taps[0].judgment})`);
  assert(r.taps[0].errorMs === 0, `first tap errorMs 0 (got ${r.taps[0].errorMs})`);
  assert(Math.abs(r.tempoIntercept) < 1e-6, `intercept anchored to 0 (got ${r.tempoIntercept})`);
}

{
  // The tally counts and matchCount-derived rates must agree: if matches all
  // landed cleanly we shouldn't see any 'miss' judgments at the same time as
  // 100% completeness. Demoting >150ms matches to MISS+EXTRA enforces this.
  const exp = [0, 0.3, 0.6, 0.9, 1.2];
  const drifty = [0, 0.5, 0.8, 1.1, 1.4];
  const r = scoreRound(exp, drifty);
  const missesFromTally = r.judgmentCounts.miss;
  const missesFromCompleteness = r.taps.length > 0
    ? exp.length - Math.round((r.completenessPct / 100) * exp.length)
    : 0;
  assert(
    missesFromTally === missesFromCompleteness,
    `miss tally (${missesFromTally}) matches completeness (${missesFromCompleteness})`,
  );
}

{
  // Perfect-rhythm double-time: rhythm 100, tempo 0 (clamped by |slope-1|=0.5),
  // hit 100, clean 100 → multiplicative total = 0 by design (rhythm gates
  // through tempo). Slope ≈ 0.5, all taps perfect after correction.
  const exp = [];
  for (let i = 0; i < 16; i++) exp.push(i * 0.3);
  const taps = exp.map((t) => t / 2);
  const r = scoreRound(exp, taps);
  assert(r.judgmentCounts.perfect === 16, `double-time → 16 perfect (got ${r.judgmentCounts.perfect})`);
  assert(r.rhythmScore === 100, `double-time → rhythmScore 100 (got ${r.rhythmScore})`);
  assert(Math.abs(r.tempoFactor - 0.5) < 0.01, `double-time → slope 0.5 (got ${r.tempoFactor.toFixed(3)})`);
  assert(Math.abs(r.tempoIntercept) < 0.01, `double-time → intercept ≈ 0 (got ${r.tempoIntercept.toFixed(3)})`);
}

{
  // Grouped 3-2-5 pattern with an extra tap in the middle group.
  // The alignment should detect the insertion and let the final group resync.
  const exp  = [0, 0.3, 0.6,  1.2, 1.5,  2.1, 2.4, 2.7, 3.0, 3.3];
  const taps = [0, 0.3, 0.6,  1.2, 1.35, 1.5,  2.1, 2.4, 2.7, 3.0, 3.3];
  const r = scoreRound(exp, taps);
  assert(r.judgmentCounts.extra === 1, `3-3-5 → 1 extra (got ${r.judgmentCounts.extra})`);
  assert(r.judgmentCounts.perfect >= 9, `3-3-5 → ≥9 perfect after resync (got ${r.judgmentCounts.perfect})`);
  assert(r.judgmentCounts.miss === 0, `3-3-5 → no misses (got ${r.judgmentCounts.miss})`);
}

{
  // Grouped 3-2-5 pattern with a skipped middle tap (3-1-5 against 3-2-5).
  const exp   = [0, 0.3, 0.6,  1.2, 1.5,  2.1, 2.4, 2.7, 3.0, 3.3];
  const taps2 = [0, 0.3, 0.6,  1.2,       2.1, 2.4, 2.7, 3.0, 3.3];
  const r2 = scoreRound(exp, taps2);
  assert(r2.judgmentCounts.miss === 1, `3-1-5 → 1 miss (got ${r2.judgmentCounts.miss})`);
  assert(r2.judgmentCounts.perfect === 9, `3-1-5 → 9 perfect (got ${r2.judgmentCounts.perfect})`);
  assert(r2.judgmentCounts.extra === 0, `3-1-5 → no extras`);
}

{
  // 1.2x speed + one insertion: both should be detected.
  const exp3  = [0, 0.5, 1.0, 1.5, 2.0, 2.5];
  const taps3 = [0, 0.417, 0.5, 0.833, 1.25, 1.667, 2.083];
  const r3 = scoreRound(exp3, taps3);
  assert(r3.judgmentCounts.extra === 1, `1.2x + insertion → 1 extra (got ${r3.judgmentCounts.extra})`);
  assert(
    Math.abs(r3.tempoFactor - 1 / 1.2) < 0.02,
    `1.2x + insertion → tempoFactor ≈ ${ (1/1.2).toFixed(3) } (got ${r3.tempoFactor.toFixed(3)})`,
  );
}

{
  // Sign convention: positive tempoPct = fast, negative = slow.
  const r4 = scoreRound([0, 0.5, 1.0], [0, 0.475, 0.95]); // 5% fast
  assert(r4.tempoPct > 0, `5% fast → positive tempoPct (got ${r4.tempoPct.toFixed(2)})`);
  assert(Math.abs(r4.tempoPct - (1/0.95 - 1) * 100) < 0.5, `5% fast → ~5.3% (got ${r4.tempoPct.toFixed(2)})`);

  const r5 = scoreRound([0, 0.5, 1.0], [0, 0.525, 1.05]); // 5% slow
  assert(r5.tempoPct < 0, `5% slow → negative tempoPct (got ${r5.tempoPct.toFixed(2)})`);
}

{
  // Sub-scores: on-tempo perfect taps → both 100.
  const r = scoreRound([0, 0.5, 1.0], [0, 0.5, 1.0]);
  assert(r.rhythmScore === 100, `perfect → rhythmScore 100 (got ${r.rhythmScore})`);
  assert(r.tempoScore === 100, `perfect → tempoScore 100 (got ${r.tempoScore})`);
}

{
  // Sub-scores: on-tempo jitter degrades rhythm but not tempo.
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  const taps = [0, 0.55, 0.95, 1.55, 1.95];
  const r = scoreRound(exp, taps);
  assert(r.tempoScore >= 92, `on-tempo jitter → tempoScore stays high (got ${r.tempoScore})`);
  assert(r.rhythmScore < 80, `on-tempo jitter → rhythmScore drops (got ${r.rhythmScore})`);
}

{
  // Sub-scores: tempo-only deviation (10% fast, no jitter) → rhythm stays 100.
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  const taps = exp.map((t) => t * 0.9);
  const r = scoreRound(exp, taps);
  assert(r.rhythmScore === 100, `10% fast tight rhythm → rhythmScore 100 (got ${r.rhythmScore})`);
  assert(r.tempoScore === 80, `10% fast → tempoScore 80 (got ${r.tempoScore})`);
}
