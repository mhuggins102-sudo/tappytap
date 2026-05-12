import { scoreRound } from '../src/lib/scoring.ts';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('PASS:', msg);
  }
}

const expected3 = [0, 0.5, 1.0];
const expected5 = [0, 0.5, 1.0, 1.5, 2.0];

{
  const r = scoreRound(expected3, [0, 0.5, 1.0]);
  assert(r.judgmentCounts.perfect === 3, 'exact taps → 3 perfect');
  assert(r.totalScore === 100, 'exact taps → total 100');
  assert(r.rhythmScore === 100 && r.tempoScore === 100, 'exact taps → both subs 100');
  assert(r.accuracyPct === 100, 'exact taps → 100% accuracy');
  assert(Math.abs(r.tempoFactor - 1) < 0.001, 'exact taps → tempo 1.0');
}

{
  // 5% fast: slope ≈ 0.95 → 5% dev → tempo = 100 − 4·5 = 80.
  // Total = sqrt(100 · 80) ≈ 89.
  const taps = expected5.map((t) => t * 0.95);
  const r = scoreRound(expected5, taps);
  assert(r.judgmentCounts.perfect === 5, '5% fast → 5 perfect after correction');
  assert(r.rhythmScore === 100, `5% fast → rhythm 100 (got ${r.rhythmScore})`);
  assert(r.tempoScore === 80, `5% fast → tempo 80 (got ${r.tempoScore})`);
  assert(r.totalScore === 89, `5% fast → total 89 (got ${r.totalScore})`);
}

{
  // 10% fast: slope ≈ 0.9 → 10% dev → tempo = 60. Total = sqrt(100·60) ≈ 77.
  const taps = expected5.map((t) => t * 0.9);
  const r = scoreRound(expected5, taps);
  assert(r.tempoScore === 60, `10% fast → tempo 60 (got ${r.tempoScore})`);
  assert(r.totalScore === 77, `10% fast → total 77 (got ${r.totalScore})`);
}

{
  // 30% fast (1.3x speed): slope ≈ 0.769 → ~23% dev → tempo floors at ~8.
  // Total = sqrt(100 · 8) ≈ 28. Geometric mean tanks when one sub is low.
  const taps = expected5.map((t) => t / 1.3);
  const r = scoreRound(expected5, taps);
  assert(Math.abs(r.tempoFactor - 1 / 1.3) < 0.01, `1.3x → slope ≈ 0.77 (got ${r.tempoFactor.toFixed(3)})`);
  assert(r.rhythmScore === 100, `1.3x → rhythm 100`);
  assert(r.tempoScore >= 6 && r.tempoScore <= 10, `1.3x → tempo 6..10 (got ${r.tempoScore})`);
  assert(r.totalScore >= 24 && r.totalScore <= 32, `1.3x → total 24..32 (got ${r.totalScore})`);
}

{
  // Double-time (16 onsets at half time). rhythm 100, tempo 0 → total 0.
  const exp = [];
  for (let i = 0; i < 16; i++) exp.push(i * 0.3);
  const taps = exp.map((t) => t / 2);
  const r = scoreRound(exp, taps);
  assert(r.judgmentCounts.perfect === 16, 'double-time → 16 perfect');
  assert(r.rhythmScore === 100, 'double-time → rhythm 100');
  // Double-time: slope = 0.5 → 50% dev → tempo hits the floor at 0.
  assert(r.tempoScore === 0, `double-time → tempo 0 (got ${r.tempoScore})`);
  assert(Math.abs(r.tempoFactor - 0.5) < 0.01, 'double-time → slope 0.5');
}

{
  // On-tempo *average* but with mid-pattern rushing/slowing. Fitted slope
  // is close to 1 (mean ratio leans a bit because the first non-zero
  // ratio is weighted alongside the rest, but stays under the 2% 'fast/slow'
  // threshold), so the wobble surfaces in the direction label ('mixed')
  // and in lowered rhythm (residuals from the flat slope line are large).
  const taps = [0, 0.55, 0.95, 1.55, 1.95];
  const r = scoreRound(expected5, taps);
  assert(Math.abs(r.tempoFactor - 1) < 0.05, 'jittery → fitted slope ≈ 1');
  assert(r.tempoScore >= 90, `jittery → tempo stays high (got ${r.tempoScore})`);
  assert(r.tempoDirection === 'mixed', `jittery → direction 'mixed' (got ${r.tempoDirection})`);
  assert(r.rhythmScore < 95, `jittery → rhythm drops (got ${r.rhythmScore})`);
}

{
  // First tap is the time-zero anchor and is always judged 'perfect'.
  const drifty = [0, 0.7, 0.9, 1.1, 1.3];
  const r = scoreRound(expected5, drifty);
  assert(r.taps[0].judgment === 'perfect', `first tap perfect (got ${r.taps[0].judgment})`);
  assert(r.taps[0].errorMs === 0, `first tap error 0 (got ${r.taps[0].errorMs})`);
}

{
  // Way-off tap counts toward Rhythm via the miss penalty. Mean ratio
  // weights each tap's ratio equally, so a +200ms tap mid-pattern drags
  // the slope ~5%, smearing modest residuals onto the surrounding taps —
  // the offending tap still reads 'miss' while nearby taps slip a tier.
  const taps = [0, 0.5, 1.2, 1.5, 2.0]; // tap #2 is +200ms
  const r = scoreRound(expected5, taps);
  assert(r.judgmentCounts.miss === 1, `way-off → 1 miss (got ${r.judgmentCounts.miss})`);
  const successes =
    r.judgmentCounts.perfect +
    r.judgmentCounts.great +
    r.judgmentCounts.good +
    r.judgmentCounts.ok;
  assert(successes === 4, `way-off → 4 non-miss taps (got ${successes})`);
  assert(r.rhythmScore < 100, `way-off → rhythm drops (got ${r.rhythmScore})`);
  assert(r.rhythmScore >= 55 && r.rhythmScore <= 85, `way-off → rhythm 55..85 (got ${r.rhythmScore})`);
}

{
  // Stopped early: only 2 of 5 taps. Forced first tap excluded from rhythm;
  // remaining contributions are 1 matched-perfect (0 ms, i=1) and 3 tail
  // misses (300 ms each). mean = 900/4 = 225 → rhythm = 100 − 75 = 25.
  const r = scoreRound(expected5, [0, 0.5]);
  assert(r.judgmentCounts.miss === 3, `stopped early → 3 misses`);
  assert(r.judgmentCounts.perfect === 2, `stopped early → 2 perfect`);
  assert(r.accuracyPct === 40, `stopped early → 40% hit (got ${r.accuracyPct})`);
  assert(r.rhythmScore === 25, `stopped early → rhythm 25 (got ${r.rhythmScore})`);
}

{
  // No taps at all → zero score, default tempo.
  const r = scoreRound(expected3, []);
  assert(r.totalScore === 0, 'no taps → 0');
  assert(r.tempoFactor === 1, 'no taps → tempo 1.0 default');
  assert(r.judgmentCounts.miss === 3, 'no taps → 3 misses');
}

{
  // Direction convention: tempoDirection labels fast vs slow; tempoMsDev is
  // the unsigned magnitude of the typical IOI deviation in ms.
  const fast = scoreRound([0, 0.5, 1.0], [0, 0.475, 0.95]);
  assert(fast.tempoDirection === 'fast', `5% fast → direction fast (got ${fast.tempoDirection})`);
  assert(fast.tempoMsDev > 0, `5% fast → positive magnitude (got ${fast.tempoMsDev})`);
  const slow = scoreRound([0, 0.5, 1.0], [0, 0.525, 1.05]);
  assert(slow.tempoDirection === 'slow', `5% slow → direction slow (got ${slow.tempoDirection})`);
  assert(slow.tempoMsDev > 0, `5% slow → positive magnitude (got ${slow.tempoMsDev})`);
}

{
  // Mid-pattern rushing then a late recovery tap. Despite the end-time
  // recovery, the OLS-fitted slope absorbs the sustained mid-pattern rush
  // — slope ≈ 0.91, well above the 1% direction threshold, so this reads
  // as 'fast' rather than 'mixed'.
  const exp = [0, 0.5, 1.0, 1.5, 2.0, 2.5];
  const taps = [0, 0.5, 0.85, 1.2, 1.7, 2.5];
  const r = scoreRound(exp, taps);
  assert(r.tempoFactor < 0.95, `rushed → slope < 0.95 (got ${r.tempoFactor.toFixed(3)})`);
  assert(r.tempoDirection === 'fast', `rushed → direction 'fast' (got ${r.tempoDirection})`);
  assert(r.rhythmScore < 90, `rushed → rhythm drops (got ${r.rhythmScore})`);
}

{
  // Wonky-middle pattern that ends on the last expected onset. Under mean
  // ratio, an early-pattern outlier (tap #1 at 0.3 vs expected 0.5 — ratio
  // 0.6) gets equal weight in the slope mean, so the round reads as
  // distinctly fast rather than 'on tempo'. This is the inverse trade-off
  // of OLS: late outliers are softened, early outliers count harder.
  const exp = [0, 0.5, 1.0, 1.5, 2.0];
  const taps = [0, 0.3, 1.0, 1.6, 2.0];
  const r = scoreRound(exp, taps);
  assert(r.tempoFactor < 0.95, `wonky early → slope clearly fast (got ${r.tempoFactor.toFixed(3)})`);
  assert(r.tempoDirection === 'fast', `wonky early → direction 'fast' (got ${r.tempoDirection})`);
  assert(r.rhythmScore < 70, `wonky early → rhythm drops hard (got ${r.rhythmScore})`);
}

{
  // No extras possible: positional 1:1 means every tap maps to exactly one
  // expected onset. The judgment tally must always sum to the expected count.
  const r = scoreRound(expected5, [0, 0.5, 1.0, 1.5, 2.0]);
  const totalEvents =
    r.judgmentCounts.perfect +
    r.judgmentCounts.great +
    r.judgmentCounts.good +
    r.judgmentCounts.ok +
    r.judgmentCounts.miss;
  assert(totalEvents === expected5.length, `tally sums to N (got ${totalEvents})`);
}

{
  // New 'good' tier (60–90 ms residual).
  const taps = [0, 0.5 + 0.075, 1.0, 1.5, 2.0]; // tap #1 is +75ms
  const r = scoreRound(expected5, taps);
  assert(r.judgmentCounts.good === 1, `75ms residual → 1 good (got ${r.judgmentCounts.good})`);
}

{
  // Tier boundaries — 30/60/90/120 ms. Perturb the last tap so chronological
  // order is preserved (the taps array gets sorted in scoreRound). Under
  // mean ratio with 10 non-zero ratios, perturbing the last tap by Δ moves
  // the slope by Δ × (1/exp[last]) / 10 = Δ / 10, so the residual at the
  // perturbed index is Δ × (1 − 1/10) = 0.9 × Δ. Injected errors are sized
  // to land cleanly in each tier after that absorption.
  const exp = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const last = exp.length - 1;
  const cases = [
    { err: 0.020, tier: 'perfect' }, // residual ~18 ms
    { err: 0.060, tier: 'great' },   // residual ~54 ms
    { err: 0.090, tier: 'good' },    // residual ~81 ms
    { err: 0.125, tier: 'ok' },      // residual ~113 ms
    { err: 0.220, tier: 'miss' },    // residual ~198 ms
  ];
  for (const c of cases) {
    const taps = [...exp];
    taps[last] = exp[last] + c.err;
    const r = scoreRound(exp, taps);
    assert(
      r.taps[last].judgment === c.tier,
      `injected ${c.err * 1000}ms at last → ${c.tier} (got ${r.taps[last].judgment})`,
    );
  }
}
