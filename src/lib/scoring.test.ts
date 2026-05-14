import { describe, expect, it } from 'vitest';
import { fitSlopeRobustOls, scoreRound } from './scoring';

const expected3 = [0, 0.5, 1.0];
const expected5 = [0, 0.5, 1.0, 1.5, 2.0];

describe('scoreRound: exact taps', () => {
  it('returns 100/100/100 for perfect timing', () => {
    const r = scoreRound(expected3, [0, 0.5, 1.0]);
    expect(r.judgmentCounts.perfect).toBe(3);
    expect(r.totalScore).toBe(100);
    expect(r.rhythmScore).toBe(100);
    expect(r.tempoScore).toBe(100);
    expect(r.accuracyPct).toBe(100);
    expect(r.completenessPct).toBe(100);
    expect(r.tempoFactor).toBeCloseTo(1, 3);
  });
});

describe('scoreRound: tempo deviation', () => {
  it('5% fast → rhythm 100, tempo 80, total ≈ 89', () => {
    const taps = expected5.map((t) => t * 0.95);
    const r = scoreRound(expected5, taps);
    expect(r.judgmentCounts.perfect).toBe(5);
    expect(r.rhythmScore).toBe(100);
    expect(r.tempoScore).toBe(80);
    expect(r.totalScore).toBe(89);
    expect(r.tempoDirection).toBe('fast');
  });

  it('10% fast → tempo 60, total ≈ 77', () => {
    const taps = expected5.map((t) => t * 0.9);
    const r = scoreRound(expected5, taps);
    expect(r.tempoScore).toBe(60);
    expect(r.totalScore).toBe(77);
  });

  it('30% fast (1.3x speed) → slope ~0.77, tempo floors near 0', () => {
    const taps = expected5.map((t) => t / 1.3);
    const r = scoreRound(expected5, taps);
    expect(r.tempoFactor).toBeCloseTo(1 / 1.3, 2);
    expect(r.rhythmScore).toBe(100);
    expect(r.tempoScore).toBeGreaterThanOrEqual(6);
    expect(r.tempoScore).toBeLessThanOrEqual(10);
    expect(r.totalScore).toBeGreaterThanOrEqual(24);
    expect(r.totalScore).toBeLessThanOrEqual(32);
  });

  it('double-time (slope 0.5) → tempo floors at 0, total 0', () => {
    const exp: number[] = [];
    for (let i = 0; i < 16; i++) exp.push(i * 0.3);
    const taps = exp.map((t) => t / 2);
    const r = scoreRound(exp, taps);
    expect(r.judgmentCounts.perfect).toBe(16);
    expect(r.rhythmScore).toBe(100);
    expect(r.tempoScore).toBe(0);
    expect(r.tempoFactor).toBeCloseTo(0.5, 2);
    expect(r.totalScore).toBe(0);
  });
});

describe('scoreRound: tempo direction labels', () => {
  it('flags directional rushing as fast', () => {
    const r = scoreRound([0, 0.5, 1.0], [0, 0.475, 0.95]);
    expect(r.tempoDirection).toBe('fast');
    expect(r.tempoMsDev).toBeGreaterThan(0);
  });

  it('flags directional dragging as slow', () => {
    const r = scoreRound([0, 0.5, 1.0], [0, 0.525, 1.05]);
    expect(r.tempoDirection).toBe('slow');
    expect(r.tempoMsDev).toBeGreaterThan(0);
  });

  it('flags wobble with no directional lean as mixed', () => {
    const taps = [0, 0.55, 0.95, 1.55, 1.95];
    const r = scoreRound(expected5, taps);
    expect(r.tempoFactor).toBeCloseTo(1, 1);
    expect(r.tempoScore).toBeGreaterThanOrEqual(95);
    expect(r.tempoDirection).toBe('mixed');
    expect(r.rhythmScore).toBeLessThan(95);
  });

  it('sustained mid-pattern rush reads as fast even with end-recovery', () => {
    const exp = [0, 0.5, 1.0, 1.5, 2.0, 2.5];
    const taps = [0, 0.5, 0.85, 1.2, 1.7, 2.5];
    const r = scoreRound(exp, taps);
    expect(r.tempoFactor).toBeLessThan(0.95);
    expect(r.tempoDirection).toBe('fast');
    expect(r.rhythmScore).toBeLessThan(90);
  });
});

describe('scoreRound: forced first-tap anchor', () => {
  it('always judges the first tap as perfect with 0ms error', () => {
    const drifty = [0, 0.7, 0.9, 1.1, 1.3];
    const r = scoreRound(expected5, drifty);
    expect(r.taps[0].judgment).toBe('perfect');
    expect(r.taps[0].errorMs).toBe(0);
  });
});

describe('scoreRound: outlier robustness', () => {
  it('damps a single +300ms outlier so non-outlier taps stay clean', () => {
    const taps = [0, 0.5, 1.3, 1.5, 2.0]; // tap #2 is +300ms
    const r = scoreRound(expected5, taps);
    expect(r.judgmentCounts.miss).toBe(1);
    expect(r.judgmentCounts.perfect).toBe(4);
    expect(r.rhythmScore).toBeLessThan(100);
    expect(r.rhythmScore).toBeGreaterThanOrEqual(60);
    expect(r.rhythmScore).toBeLessThanOrEqual(85);
  });
});

describe('scoreRound: completion-ratio scaling (replaces tail-miss penalty)', () => {
  it('stopped early at 2 of 5 perfect taps → rhythm 40, tempo 40, total 40', () => {
    const r = scoreRound(expected5, [0, 0.5]);
    expect(r.judgmentCounts.miss).toBe(3);
    expect(r.judgmentCounts.perfect).toBe(2);
    expect(r.accuracyPct).toBe(40);
    expect(r.completenessPct).toBe(40);
    expect(r.rhythmScore).toBe(40);
    expect(r.tempoScore).toBe(40);
    expect(r.totalScore).toBe(40);
  });

  it('stopped early at 6 of 8 perfect taps → rhythm 75, tempo 75, total 75', () => {
    const exp: number[] = [];
    for (let i = 0; i < 8; i++) exp.push(i * 0.5);
    const r = scoreRound(exp, exp.slice(0, 6));
    expect(r.completenessPct).toBe(75);
    expect(r.rhythmScore).toBe(75);
    expect(r.tempoScore).toBe(75);
    expect(r.totalScore).toBe(75);
  });

  it('no taps → total 0', () => {
    const r = scoreRound(expected3, []);
    expect(r.totalScore).toBe(0);
    expect(r.tempoFactor).toBe(1);
    expect(r.judgmentCounts.miss).toBe(3);
    expect(r.completenessPct).toBe(0);
  });
});

describe('scoreRound: tier boundaries', () => {
  it('classifies a 75ms residual as good', () => {
    const taps = [0, 0.5 + 0.075, 1.0, 1.5, 2.0];
    const r = scoreRound(expected5, taps);
    expect(r.judgmentCounts.good).toBe(1);
  });

  it('classifies injected errors into the right tier (perfect/great/good/ok/miss)', () => {
    const exp = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const last = exp.length - 1;
    const cases = [
      { err: 0.02, tier: 'perfect' },
      { err: 0.06, tier: 'great' },
      { err: 0.09, tier: 'good' },
      { err: 0.125, tier: 'ok' },
      { err: 0.22, tier: 'miss' },
    ];
    for (const c of cases) {
      const taps = [...exp];
      taps[last] = exp[last] + c.err;
      const r = scoreRound(exp, taps);
      expect(r.taps[last].judgment).toBe(c.tier);
    }
  });
});

describe('scoreRound: judgment tally', () => {
  it('judgment counts always sum to expected onset count', () => {
    const r = scoreRound(expected5, [0, 0.5, 1.0, 1.5, 2.0]);
    const total =
      r.judgmentCounts.perfect +
      r.judgmentCounts.great +
      r.judgmentCounts.good +
      r.judgmentCounts.ok +
      r.judgmentCounts.miss;
    expect(total).toBe(expected5.length);
  });

  it('counts unmatched tail onsets as misses in tally', () => {
    const r = scoreRound(expected5, [0, 0.5, 1.0]);
    const total =
      r.judgmentCounts.perfect +
      r.judgmentCounts.great +
      r.judgmentCounts.good +
      r.judgmentCounts.ok +
      r.judgmentCounts.miss;
    expect(total).toBe(expected5.length);
    expect(r.judgmentCounts.miss).toBe(2);
  });
});

describe('fitSlopeRobustOls', () => {
  it('returns 1 for taps that exactly match expected onsets', () => {
    const slope = fitSlopeRobustOls(expected5, [...expected5], expected5.length);
    expect(slope).toBeCloseTo(1, 3);
  });

  it('returns ≈ 0.95 for consistently-5%-fast taps', () => {
    const taps = expected5.map((t) => t * 0.95);
    const slope = fitSlopeRobustOls(expected5, taps, expected5.length);
    expect(slope).toBeCloseTo(0.95, 2);
  });

  it('damps a single outlier so the slope stays near 1.0', () => {
    const taps = [0, 0.5, 1.3, 1.5, 2.0];
    const slope = fitSlopeRobustOls(expected5, taps, expected5.length);
    expect(slope).toBeGreaterThan(0.95);
    expect(slope).toBeLessThan(1.1);
  });
});
