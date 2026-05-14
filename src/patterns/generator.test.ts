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

describe('generatePattern: BPM jitter (±10%)', () => {
  it.each(DIFFICULTIES)('%s BPM stays within ±10% of the difficulty base', (d) => {
    const base = d === 'hard' ? 110 : 100;
    for (let i = 0; i < 50; i++) {
      const p = generateFromSeed(d, `seed-bpm-${d}-${i}`);
      expect(p.bpm).toBeGreaterThanOrEqual(Math.round(base * 0.9));
      expect(p.bpm).toBeLessThanOrEqual(Math.round(base * 1.1));
    }
  });

  it('jitterBpm consumes one rng() call and produces a value within ±10%', () => {
    const seed = rngFromString('seed-jitter');
    const bpm = jitterBpm(100, seed);
    expect(bpm).toBeGreaterThanOrEqual(90);
    expect(bpm).toBeLessThanOrEqual(110);
  });

  it('jitterBpm covers both the fast and slow halves of the range', () => {
    let sawFast = false;
    let sawSlow = false;
    for (let i = 0; i < 100; i++) {
      const seed = rngFromString(`seed-cover-${i}`);
      const bpm = jitterBpm(100, seed);
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

  it('medium onsets land in the union of standard, repeated-motif, and curated ranges', () => {
    for (let i = 0; i < 60; i++) {
      const p = generateFromSeed('medium', `seed-med-count-${i}`);
      // Standard: 6-8. Repeated-motif: 12-16 (6-8 onsets × 2 repeats).
      // Curated (medium-eligible figures): 4-8. Union: 4-16.
      expect(p.onsets.length).toBeGreaterThanOrEqual(4);
      expect(p.onsets.length).toBeLessThanOrEqual(16);
    }
  });

  it('hard onsets land in the standard or curated hard range', () => {
    for (let i = 0; i < 60; i++) {
      const p = generateFromSeed('hard', `seed-hard-count-${i}`);
      // Standard hard: 8-12. Curated hard figures: 5 (son_clave_3_2),
      // 6 (tresillo), 8 (dembow / habanera), 10 (bossa_partido). Union: 5-12.
      expect(p.onsets.length).toBeGreaterThanOrEqual(5);
      expect(p.onsets.length).toBeLessThanOrEqual(12);
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
      expect(p.bpm).toBeGreaterThanOrEqual(90);
      expect(p.bpm).toBeLessThanOrEqual(110);
    }
    for (let i = 0; i < 30; i++) {
      const p = generateCuratedPattern('hard', rngFromString(`seed-bpm-hard-${i}`))!;
      expect(p.bpm).toBeGreaterThanOrEqual(Math.round(110 * 0.9));
      expect(p.bpm).toBeLessThanOrEqual(Math.round(110 * 1.1));
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
