import type { Difficulty, Pattern } from './types';
import type { Rng } from '../lib/rng';
import { CURATED_FIGURE_PROBABILITY, generateCuratedPattern } from './curated';

// Per-round BPM jitter: ±15% of the difficulty's base tempo. Same RNG as
// pattern generation, so the daily challenge stays deterministic. The
// slope-based tempo scoring handles arbitrary BPMs natively. ±15% gives
// medium a 85–115 BPM range and hard a 93.5–126.5 range, so the
// per-round tempo feel varies noticeably without crossing into "this
// difficulty doesn't feel like itself anymore".
const BPM_JITTER_RANGE = 0.15;

export function jitterBpm(baseBpm: number, rng: Rng): number {
  const factor = 1 + (rng() - 0.5) * 2 * BPM_JITTER_RANGE;
  return Math.round(baseBpm * factor);
}

interface StandardConfig {
  bpm: number;
  beatsPerMeasure: number;
  measures: number;
  subdivision: number;
  minOnsets: number;
  maxOnsets: number;
  density: number;
  syncopate: boolean;
}

const STANDARD_CONFIGS: Record<Exclude<Difficulty, 'easy'>, StandardConfig> = {
  medium: {
    bpm: 100,
    beatsPerMeasure: 4,
    measures: 2,
    subdivision: 2,
    // Medium non-repeating rounds carry a 7-onset minimum so a round
    // always has enough material to read as "medium" rather than "easy".
    // The widened max + per-round density jitter (below) inject more
    // round-to-round variety than the old 7-8 / fixed-density combo.
    minOnsets: 7,
    maxOnsets: 10,
    density: 0.55,
    syncopate: false,
  },
  hard: {
    bpm: 110,
    beatsPerMeasure: 4,
    measures: 2,
    subdivision: 4,
    minOnsets: 8,
    maxOnsets: 13,
    density: 0.5,
    syncopate: true,
  },
};

// Per-round density jitter added on top of the difficulty's base density
// when generating standard procedural patterns. Onset count is still
// clamped to [minOnsets, maxOnsets], so density mainly changes *where*
// the onsets land (clustered vs spread). ±0.10 is enough to produce
// noticeably sparser or denser rounds without breaking the difficulty's
// general feel.
const DENSITY_JITTER_RANGE = 0.1;

// On Medium, a portion of rounds use a "repeated motif" mode: a single
// measure with 6–8 onsets, played back-to-back twice. The motif itself is
// still random (so the timing stays interesting) but because the second
// half mirrors the first, the player has a memorable shape to hold onto.
// Dialed back from 40% so most medium rounds are free-form — the
// memorable repeat used to land too often and felt easy relative to the
// rest of the medium pool.
const MEDIUM_REPEATED_MOTIF_PROBABILITY = 0.25;

export function generatePattern(difficulty: Difficulty, rng: Rng): Pattern {
  if (difficulty === 'easy') return generateEasyPattern(rng);
  // Curated rhythmic figures (tresillo, son clave, habanera, etc.) get
  // a slice of Medium and Hard rounds for musical character; the
  // procedural generators still produce the majority of patterns.
  if (rng() < CURATED_FIGURE_PROBABILITY) {
    const curated = generateCuratedPattern(difficulty, rng);
    if (curated) return curated;
  }
  if (difficulty === 'medium' && rng() < MEDIUM_REPEATED_MOTIF_PROBABILITY) {
    return generateMediumRepeated(rng);
  }
  return generateStandardPattern(difficulty, rng);
}

function generateMediumRepeated(rng: Rng): Pattern {
  const bpm = jitterBpm(100, rng);
  // 16th-note resolution (subdivision 4 = four slots per beat) so the
  // motif's inter-onset intervals can land anywhere from a 16th to a
  // dotted-eighth apart. Coarser subdivision made these motifs sound
  // metronomic — every 8th-note slot was filled, which felt like Easy.
  const subdivision = 4;
  const motifBeats = 4;
  const slotsPerMotif = motifBeats * subdivision; // 16
  // Leave the last slot empty so the repeat boundary stays audible.
  const fillableSlots = slotsPerMotif - 1;
  // Enough onsets for "close succession" while leaving room for gaps.
  // Three possible counts so the player isn't stuck always seeing the
  // same density when the repeated mode comes up.
  const onsetsPerMotif = 6 + Math.floor(rng() * 3); // 6, 7, or 8
  const repeats = 2;
  const secPerSlot = 60 / bpm / subdivision;

  const motif: boolean[] = new Array(slotsPerMotif).fill(false);
  motif[0] = true;
  const remaining: number[] = [];
  for (let i = 1; i < fillableSlots; i++) remaining.push(i);

  let placed = 1;
  while (placed < onsetsPerMotif && remaining.length > 0) {
    const idx = Math.floor(rng() * remaining.length);
    const slot = remaining.splice(idx, 1)[0];
    motif[slot] = true;
    placed++;
  }

  const onsets: number[] = [];
  for (let r = 0; r < repeats; r++) {
    for (let i = 0; i < slotsPerMotif; i++) {
      if (motif[i]) onsets.push((r * slotsPerMotif + i) * secPerSlot);
    }
  }
  const durationSec = slotsPerMotif * repeats * secPerSlot;

  return { bpm, onsets, durationSec, difficulty: 'medium' };
}

// Easy patterns are a short motif repeated several times. The motif length
// rotates between 3, 4 (the classic), and 5 beats so the rhythmic feel
// varies — 4 lands square, 3 feels like a waltz, 5 has a wobbly meter.
// Onset count scales with motif length (50% density) and the repeat count
// is tuned so the total round length stays in the same ballpark.
const EASY_MOTIF_CONFIGS: Array<{
  beats: number;
  onsets: number;
  repeatsMin: number;
  repeatsMax: number;
}> = [
  { beats: 3, onsets: 3, repeatsMin: 4, repeatsMax: 5 },
  { beats: 4, onsets: 4, repeatsMin: 4, repeatsMax: 5 },
  { beats: 5, onsets: 5, repeatsMin: 3, repeatsMax: 4 },
];

function generateEasyPattern(rng: Rng): Pattern {
  const bpm = jitterBpm(100, rng);
  const subdivision = 2;
  const cfg = EASY_MOTIF_CONFIGS[Math.floor(rng() * EASY_MOTIF_CONFIGS.length)];
  const slotsPerMotif = cfg.beats * subdivision;
  // Leave the final couple of slots empty so each motif breathes — players
  // hear a clear "and now it repeats" boundary instead of a wall of onsets.
  const fillableSlots = slotsPerMotif - 2;
  const onsetsPerMotif = cfg.onsets;
  const repeats = cfg.repeatsMin + Math.floor(rng() * (cfg.repeatsMax - cfg.repeatsMin + 1));
  const secPerSlot = 60 / bpm / subdivision;

  const motif: boolean[] = new Array(slotsPerMotif).fill(false);
  motif[0] = true;
  const remaining: number[] = [];
  for (let i = 1; i < fillableSlots; i++) remaining.push(i);

  let placed = 1;
  while (placed < onsetsPerMotif && remaining.length > 0) {
    const idx = Math.floor(rng() * remaining.length);
    const slot = remaining.splice(idx, 1)[0];
    motif[slot] = true;
    placed++;
  }

  const onsets: number[] = [];
  for (let r = 0; r < repeats; r++) {
    for (let i = 0; i < slotsPerMotif; i++) {
      if (motif[i]) onsets.push((r * slotsPerMotif + i) * secPerSlot);
    }
  }
  const durationSec = slotsPerMotif * repeats * secPerSlot;

  return { bpm, onsets, durationSec, difficulty: 'easy' };
}

function generateStandardPattern(difficulty: Exclude<Difficulty, 'easy'>, rng: Rng): Pattern {
  const cfg = STANDARD_CONFIGS[difficulty];
  const bpm = jitterBpm(cfg.bpm, rng);
  const totalSlots = cfg.beatsPerMeasure * cfg.measures * cfg.subdivision;
  const secPerSlot = 60 / bpm / cfg.subdivision;

  // Density jitter changes the onset distribution shape per round —
  // sparser rounds tend to cluster onsets, denser rounds spread them.
  // Clamped to a safe range so we never overflow into "all slots" or
  // "almost no slots".
  const densityShift = (rng() - 0.5) * 2 * DENSITY_JITTER_RANGE;
  const density = Math.max(0.2, Math.min(0.8, cfg.density + densityShift));

  const slots: boolean[] = new Array(totalSlots).fill(false);
  slots[0] = true;
  for (let i = 1; i < totalSlots; i++) {
    if (rng() < density) slots[i] = true;
  }

  enforceOnsetCount(slots, cfg.minOnsets, cfg.maxOnsets, rng);
  if (cfg.syncopate) applySyncopation(slots, cfg.subdivision, rng);

  const onsets: number[] = [];
  for (let i = 0; i < totalSlots; i++) {
    if (slots[i]) onsets.push(i * secPerSlot);
  }
  const durationSec = totalSlots * secPerSlot;

  return { bpm, onsets, durationSec, difficulty };
}

function enforceOnsetCount(slots: boolean[], min: number, max: number, rng: Rng): void {
  let count = slots.filter(Boolean).length;
  while (count > max) {
    const candidates: number[] = [];
    for (let i = 1; i < slots.length; i++) if (slots[i]) candidates.push(i);
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(rng() * candidates.length)];
    slots[pick] = false;
    count--;
  }
  while (count < min) {
    const candidates: number[] = [];
    for (let i = 1; i < slots.length; i++) if (!slots[i]) candidates.push(i);
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(rng() * candidates.length)];
    slots[pick] = true;
    count++;
  }
}

function applySyncopation(slots: boolean[], subdivision: number, rng: Rng): void {
  for (let i = 1; i < slots.length - 1; i++) {
    if (slots[i] && i % subdivision === 0 && rng() < 0.3) {
      const dir = rng() < 0.5 ? -1 : 1;
      const target = i + dir;
      if (target > 0 && target < slots.length && !slots[target]) {
        slots[i] = false;
        slots[target] = true;
      }
    }
  }
}
