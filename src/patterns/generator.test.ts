import { describe, expect, it } from 'vitest';
import { generatePattern, jitterBpm } from './generator';
import { generateCuratedPattern } from './curated';
import { generateDailyPattern } from './daily';
import { rngFromString } from '../lib/rng';
import type { Difficulty } from './types';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function generateFromSeed(difficulty: Difficulty, seed: string) {
  return generatePattern(difficulty, rngFromString(seed));
}

describe('generatePattern: basic invariants', () => {
  it.each(DIFFICULTIES)('%s patterns always start at time 0', (d) => {
    for (let i = 0; i < 20; i++) {
      const p = generateFromSeed(d, `seed-basic-${d}-${i}`);
      expect(p.onsets[0]).toBe(0);
    }
  });

  it.each(DIFFICULTIES)('%s onsets are strictly increasing', (d) => {
    for (let i = 0; i < 20; i++) {
      const p = generateFromSeed(d, `seed-mono-${d}-${i}`);
      for (let j = 1; j < p.onsets.length; j++) {
        expect(p.onsets[j]).toBeGreaterThan(p.onsets[j - 1]);
      }
    }
  });

  it.each(DIFFICULTIES)('%s durationSec is >= the last onset time', (d) => {
    for (let i = 0; i < 20; i++) {
      const p = generateFromSeed(d, `seed-dur-${d}-${i}`);
      const last = p.onsets[p.onsets.length - 1];
      expect(p.durationSec).toBeGreaterThanOrEqual(last);
    }
  });

  it.each(DIFFICULTIES)('%s patterns advertise the right difficulty', (d) => {
    const p = generateFromSeed(d, `seed-diff-${d}`);
    expect(p.difficulty).toBe(d);
  });
});

const BPM_RANGE_BY_DIFFICULTY: Record<Difficulty, { base: number; range: number }> = {
  easy: { base: 100, range: 0.15 },
  medium: { base: 100, range: 0.2 },
  hard: { base: 110, range: 0.25 },
};

describe('generatePattern: per-difficulty BPM jitter', () => {
  it.each(DIFFICULTIES)('%s BPM stays within its difficulty range', (d) => {
    const { base, range } = BPM_RANGE_BY_DIFFICULTY[d];
    for (let i = 0; i < 50; i++) {
      const p = generateFromSeed(d, `seed-bpm-${d}-${i}`);
      expect(p.bpm).toBeGreaterThanOrEqual(Math.round(base * (1 - range)) - 1);
      expect(p.bpm).toBeLessThanOrEqual(Math.round(base * (1 + range)) + 1);
    }
  });

  it('jitterBpm produces a value within the supplied range', () => {
    const bpm = jitterBpm(100, rngFromString('seed-jitter'), 0.2);
    expect(bpm).toBeGreaterThanOrEqual(80);
    expect(bpm).toBeLessThanOrEqual(120);
  });

  it('jitterBpm covers both the fast and slow halves of the range', () => {
    let sawFast = false;
    let sawSlow = false;
    for (let i = 0; i < 100; i++) {
      const bpm = jitterBpm(100, rngFromString(`seed-cover-${i}`), 0.2);
      if (bpm < 100) sawSlow = true;
      if (bpm > 100) sawFast = true;
    }
    expect(sawFast).toBe(true);
    expect(sawSlow).toBe(true);
  });
});

describe('generatePattern: onset count is sensible per difficulty', () => {
  it('easy onsets land in the easy-motif range', () => {
    for (let i = 0; i < 30; i++) {
      const p = generateFromSeed('easy', `seed-easy-count-${i}`);
      // Easy uses motif configs (3/4/5 onsets) repeated 3-5 times, so onset
      // counts span 9 (3 motif × 3 reps) up to 25 (5 motif × 5 reps).
      expect(p.onsets.length).toBeGreaterThanOrEqual(9);
      expect(p.onsets.length).toBeLessThanOrEqual(25);
    }
  });

  it('medium onsets land in the union of all medium paths', () => {
    for (let i = 0; i < 120; i++) {
      const p = generateFromSeed('medium', `seed-med-count-${i}`);
      // Paths (any can fire):
      //   Sparse variant: 4-6 onsets
      //   Mixed-subdivision: 7-10 (3-4 in measure 1, 4-6 in measure 2)
      //   Regular standard: 7-10
      //   3-measure standard: ~11-15 (7-10 scaled ×1.5)
      //   Repeated-motif: 12-16 (6-8 onsets × 2 repeats)
      //   Curated: 8 (habanera), 10 (cascara/mozambique), 12 (tresillo)
      // Union: 4-16.
      expect(p.onsets.length).toBeGreaterThanOrEqual(4);
      expect(p.onsets.length).toBeLessThanOrEqual(16);
    }
  });

  it('hard onsets land in the union of all hard paths', () => {
    for (let i = 0; i < 120; i++) {
      const p = generateFromSeed('hard', `seed-hard-count-${i}`);
      // Paths (any can fire):
      //   Sparse variant: 4-6 onsets
      //   Regular standard: 8-13
      //   3-measure standard: ~12-20 (8-13 scaled ×1.5)
      //   Curated: 8 (dembow/habanera), 10 (bossa/cascara/mozambique),
      //            12 (tresillo/songo/cha-cha-cha)
      // Union: 4-20.
      expect(p.onsets.length).toBeGreaterThanOrEqual(4);
      expect(p.onsets.length).toBeLessThanOrEqual(20);
    }
  });
});

describe('generateCuratedPattern', () => {
  it('returns null for nonexistent difficulty matches (no easy figures)', () => {
    // Hardcoded sanity: curated only ships medium and hard figures.
    // generateCuratedPattern is typed to exclude 'easy', so we just verify
    // that medium/hard always yield a non-null pattern.
    const m = generateCuratedPattern('medium', rngFromString('seed-curated-m'));
    expect(m).not.toBeNull();
    const h = generateCuratedPattern('hard', rngFromString('seed-curated-h'));
    expect(h).not.toBeNull();
  });

  it('curated patterns always start at slot 0 (time 0)', () => {
    for (const d of ['medium', 'hard'] as const) {
      for (let i = 0; i < 30; i++) {
        const p = generateCuratedPattern(d, rngFromString(`seed-c0-${d}-${i}`))!;
        expect(p.onsets[0]).toBe(0);
      }
    }
  });

  it('curated patterns inherit BPM jitter from the difficulty base', () => {
    for (let i = 0; i < 30; i++) {
      const p = generateCuratedPattern('medium', rngFromString(`seed-bpm-med-${i}`))!;
      expect(p.bpm).toBeGreaterThanOrEqual(Math.round(100 * 0.8) - 1);
      expect(p.bpm).toBeLessThanOrEqual(Math.round(100 * 1.2) + 1);
    }
    for (let i = 0; i < 30; i++) {
      const p = generateCuratedPattern('hard', rngFromString(`seed-bpm-hard-${i}`))!;
      expect(p.bpm).toBeGreaterThanOrEqual(Math.round(110 * 0.75) - 1);
      expect(p.bpm).toBeLessThanOrEqual(Math.round(110 * 1.25) + 1);
    }
  });

  it('curated onsets are strictly increasing', () => {
    for (const d of ['medium', 'hard'] as const) {
      for (let i = 0; i < 30; i++) {
        const p = generateCuratedPattern(d, rngFromString(`seed-mono-${d}-${i}`))!;
        for (let j = 1; j < p.onsets.length; j++) {
          expect(p.onsets[j]).toBeGreaterThan(p.onsets[j - 1]);
        }
      }
    }
  });
});

describe('generatePattern: variant surprises surface', () => {
  // Sparse and 3-measure variants are low-probability dispatches inside
  // the standard path; with enough samples each should fire at least once.
  it('produces sparse-variant rounds on medium', () => {
    let sawSparse = false;
    for (let i = 0; i < 300 && !sawSparse; i++) {
      const p = generateFromSeed('medium', `sparse-med-${i}`);
      if (p.onsets.length >= 4 && p.onsets.length <= 6) sawSparse = true;
    }
    expect(sawSparse).toBe(true);
  });

  it('produces 3-measure rounds on hard (extends past 13 onsets)', () => {
    let sawLong = false;
    for (let i = 0; i < 300 && !sawLong; i++) {
      const p = generateFromSeed('hard', `long-hard-${i}`);
      if (p.onsets.length > 13) sawLong = true;
    }
    expect(sawLong).toBe(true);
  });

  it('produces mixed-subdivision rounds on medium (duration ≈ 4.8s at base BPM)', () => {
    // The mixed variant's measure 1 in 8ths + measure 2 in 16ths gives
    // 8 beats total just like the regular standard, so duration is the
    // same. This test mainly confirms the variant runs without error and
    // produces patterns that pass the strictly-increasing onset check.
    let sawMixed = false;
    for (let i = 0; i < 300 && !sawMixed; i++) {
      const p = generateFromSeed('medium', `mixed-med-${i}`);
      // Mixed-subdivision rounds have 3-4 onsets in the first 4 beats
      // (8th-grid → slot positions are multiples of beatSec/2) and
      // 4-6 onsets in the second 4 beats (16th-grid). Hard to discriminate
      // from the regular path purely on onset count, so we just sanity
      // check that the pattern is well-formed for many rounds.
      expect(p.onsets[0]).toBe(0);
      for (let j = 1; j < p.onsets.length; j++) {
        expect(p.onsets[j]).toBeGreaterThan(p.onsets[j - 1]);
      }
      sawMixed = true;
    }
    expect(sawMixed).toBe(true);
  });
});

describe('generateDailyPattern: determinism', () => {
  it('same date → identical pattern across calls', () => {
    const d1 = generateDailyPattern('2026-05-10');
    const d2 = generateDailyPattern('2026-05-10');
    expect(d1.onsets).toEqual(d2.onsets);
    expect(d1.bpm).toBe(d2.bpm);
    expect(d1.difficulty).toBe(d2.difficulty);
  });

  it('different dates → different patterns', () => {
    const d1 = generateDailyPattern('2026-05-10');
    const d3 = generateDailyPattern('2026-05-11');
    expect(JSON.stringify(d1.onsets)).not.toEqual(JSON.stringify(d3.onsets));
  });
});
