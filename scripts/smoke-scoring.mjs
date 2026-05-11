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
  // 5% fast, perfect rhythm. meanAbsDev = 0.05 → tempo = 90.
  const taps = expected5.map((t) => t * 0.95);
  const r = scoreRound(expected5, taps);
  assert(r.judgmentCounts.perfect === 5, '5% fast → 5 perfect after correction');
  assert(r.rhythmScore === 100, `5% fast → rhythm 100 (got ${r.rhythmScore})`);
  assert(r.tempoScore === 90, `5% fast → tempo 90 (got ${r.tempoScore})`);
  assert(r.totalScore === 90, `5% fast → total 90 (got ${r.totalScore})`);
}

{
  // 10% fast: meanAbsDev = 0.1 → tempo = 80.
  const taps = expected5.map((t) => t * 0.9);
  const r = scoreRound(expected5, taps);
  assert(r.tempoScore === 80, `10% fast → tempo 80 (got ${r.tempoScore})`);
  assert(r.totalScore === 80, `10% fast → 80 (got ${r.totalScore})`);
}

{
  // 30% fast (1.3x speed): meanAbsDev ≈ 0.231 → tempo ≈ 54.
  const taps = expected5.map((t) => t / 1.3);
  const r = scoreRound(expected5, taps);
  assert(Math.abs(r.tempoFactor - 1 / 1.3) < 0.01, `1.3x → slope ≈ 0.77 (got ${r.tempoFactor.toFixed(3)})`);
  assert(r.rhythmScore === 100, `1.3x → rhythm 100`);
  assert(r.tempoScore >= 52 && r.tempoScore <= 56, `1.3x → tempo 52..56 (got ${r.tempoScore})`);
}

{
  // Double-time (16 onsets at half time). rhythm 100, tempo 0 → total 0.
  const exp = [];
  for (let i = 0; i < 16; i++) exp.push(i * 0.3);
  const taps = exp.map((t) => t / 2);
  const r = scoreRound(exp, taps);
  assert(r.judgmentCounts.perfect === 16, 'double-time → 16 perfect');
  assert(r.rhythmScore === 100, 'double-time → rhythm 100');
  assert(r.tempoScore === 0, 'double-time → tempo 0 (100% off)');
  assert(Math.abs(r.tempoFactor - 0.5) < 0.01, 'double-time → slope 0.5');
}

{
  // On-tempo *average* but with mid-pattern rushing/slowing. Median ratio
  // ≈ 1, so the old slope-only tempo gave 100; the new RMS formula picks
  // up the local IOI fluctuations so tempo drops too.
  const taps = [0, 0.55, 0.95, 1.55, 1.95];
  const r = scoreRound(expected5, taps);
  assert(Math.abs(r.tempoFactor - 1) < 0.05, 'jittery → median slope ≈ 1');
  assert(r.tempoScore < 75, `jittery → tempo drops with IOI variance (got ${r.tempoScore})`);
  assert(r.rhythmScore < 80, `jittery → rhythm drops (got ${r.rhythmScore})`);
}

{
  // First tap is the time-zero anchor and is always judged 'perfect'.
  const drifty = [0, 0.7, 0.9, 1.1, 1.3];
  const r = scoreRound(expected5, drifty);
  assert(r.taps[0].judgment === 'perfect', `first tap perfect (got ${r.taps[0].judgment})`);
  assert(r.taps[0].errorMs === 0, `first tap error 0 (got ${r.taps[0].errorMs})`);
}

{
  // Way-off taps count toward Rhythm via the miss penalty. 4 perfect + 1
  // 300ms-off tap → mean error ≈ 24ms, rhythm ≈ 80.
  const taps = [0, 0.5, 1.3, 1.5, 2.0]; // tap #2 is +300ms
  const r = scoreRound(expected5, taps);
  assert(r.judgmentCounts.miss === 1, `way-off → 1 miss (got ${r.judgmentCounts.miss})`);
  assert(r.judgmentCounts.perfect === 4, `way-off → 4 perfect`);
  assert(r.rhythmScore < 100, `way-off → rhythm drops (got ${r.rhythmScore})`);
  assert(r.rhythmScore >= 70 && r.rhythmScore <= 90, `way-off → rhythm 70..90 (got ${r.rhythmScore})`);
}

{
  // Stopped early: only 2 of 5 taps. The remaining 3 expected onsets are
  // misses and contribute the miss-penalty to rhythm.
  const r = scoreRound(expected5, [0, 0.5]);
  assert(r.judgmentCounts.miss === 3, `stopped early → 3 misses`);
  assert(r.judgmentCounts.perfect === 2, `stopped early → 2 perfect`);
  assert(r.accuracyPct === 40, `stopped early → 40% hit (got ${r.accuracyPct})`);
  // mean = (0+0+120+120+120)/5 = 72; rhythm = 100 - 60 = 40
  assert(r.rhythmScore === 40, `stopped early → rhythm 40 (got ${r.rhythmScore})`);
}

{
  // No taps at all → zero score, default tempo.
  const r = scoreRound(expected3, []);
  assert(r.totalScore === 0, 'no taps → 0');
  assert(r.tempoFactor === 1, 'no taps → tempo 1.0 default');
  assert(r.judgmentCounts.miss === 3, 'no taps → 3 misses');
}

{
  // Direction convention: tempoDirection labels fast vs slow; tempoPct is the
  // unsigned magnitude of the typical IOI deviation.
  const fast = scoreRound([0, 0.5, 1.0], [0, 0.475, 0.95]);
  assert(fast.tempoDirection === 'fast', `5% fast → direction fast (got ${fast.tempoDirection})`);
  assert(fast.tempoPct > 0, `5% fast → positive magnitude (got ${fast.tempoPct})`);
  const slow = scoreRound([0, 0.5, 1.0], [0, 0.525, 1.05]);
  assert(slow.tempoDirection === 'slow', `5% slow → direction slow (got ${slow.tempoDirection})`);
  assert(slow.tempoPct > 0, `5% slow → positive magnitude (got ${slow.tempoPct})`);
}

{
  // Mid-pattern rushing then recovering: median slope ≈ 1 but local IOIs
  // are wobbly. Direction should read 'mixed', not 'on tempo', and the
  // tempo score should drop with the RMS deviation.
  const exp = [0, 0.5, 1.0, 1.5, 2.0, 2.5];
  // Tap 2 and 3 are rushed (early), then tap 4 is late to recover.
  const taps = [0, 0.5, 0.85, 1.2, 1.7, 2.5];
  const r = scoreRound(exp, taps);
  assert(r.tempoDirection === 'mixed', `wobbly → direction mixed (got ${r.tempoDirection})`);
  assert(r.tempoScore < 60, `wobbly → tempo drops (got ${r.tempoScore})`);
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
  // order is preserved (the taps array gets sorted in scoreRound). With many
  // unperturbed ratios, the median-ratio slope locks to 1.0 so the residual
  // at the perturbed index equals the injected error exactly.
  const exp = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const last = exp.length - 1;
  const cases = [
    { err: 0.020, tier: 'perfect' },
    { err: 0.045, tier: 'great' },
    { err: 0.075, tier: 'good' },
    { err: 0.105, tier: 'ok' },
    { err: 0.200, tier: 'miss' },
  ];
  for (const c of cases) {
    const taps = [...exp];
    taps[last] = exp[last] + c.err;
    const r = scoreRound(exp, taps);
    assert(
      r.taps[last].judgment === c.tier,
      `residual ${c.err * 1000}ms at last → ${c.tier} (got ${r.taps[last].judgment})`,
    );
  }
}
