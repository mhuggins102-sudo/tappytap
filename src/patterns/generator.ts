import type { Difficulty, Pattern } from './types';
import type { Rng } from '../lib/rng';
import { CURATED_FIGURE_PROBABILITY, generateCuratedPattern } from './curated';

// Per-difficulty BPM jitter ranges. Wider jitter on harder difficulties
// adds more tempo unpredictability — itself part of the challenge — while
// keeping easy predictable enough to learn against. The slope-based
// tempo scoring handles any BPM natively, so the per-round tempo can
// vary freely without breaking scoring.
export const BPM_JITTER: Record<Difficulty, number> = {
  easy: 0.15,
  medium: 0.2,
  hard: 0.25,
};

export function jitterBpm(baseBpm: number, rng: Rng, range: number): number {
  const factor = 1 + (rng() - 0.5) * 2 * range;
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

// Variant probabilities applied inside the "standard procedural" path
// (i.e. after curated and repeated-motif paths haven't fired). Drawn
// from a single rng() roll so they stay mutually exclusive and the
// remaining ~70-80% falls through to a regular 2-measure round.
const VARIANT_LONG_PROBABILITY = 0.10;          // 3-measure surprise
const VARIANT_SPARSE_PROBABILITY = 0.08;        // few onsets, long rests
const VARIANT_MIXED_SUB_PROBABILITY = 0.10;     // medium only: 8ths → 16ths

export function generatePattern(difficulty: Difficulty, rng: Rng): Pattern {
  if (difficulty === 'easy') return generateEasyPattern(rng);
  // Curated rhythmic figures (tresillo, habanera, cascara, etc.) get a
  // slice of Medium and Hard rounds for musical character; the procedural
  // generators still produce the majority of patterns.
  if (rng() < CURATED_FIGURE_PROBABILITY) {
    const curated = generateCuratedPattern(difficulty, rng);
    if (curated) return curated;
  }
  if (difficulty === 'medium' && rng() < MEDIUM_REPEATED_MOTIF_PROBABILITY) {
    return generateMediumRepeated(rng);
  }
  // Inside the standard procedural path, dispatch to a variant some of
  // the time so the player keeps getting surprised. Single rng() roll
  // walks the cumulative probabilities; whatever's left falls through to
  // a regular 2-measure round.
  const r = rng();
  if (r < VARIANT_LONG_PROBABILITY) {
    return generateStandardPattern(difficulty, rng, { measures: 3 });
  }
  if (r < VARIANT_LONG_PROBABILITY + VARIANT_SPARSE_PROBABILITY) {
    return generateSparseStandard(difficulty, rng);
  }
  if (
    difficulty === 'medium' &&
    r < VARIANT_LONG_PROBABILITY + VARIANT_SPARSE_PROBABILITY + VARIANT_MIXED_SUB_PROBABILITY
  ) {
    return generateMixedSubdivisionMedium(rng);
  }
  return generateStandardPattern(difficulty, rng);
}

function generateMediumRepeated(rng: Rng): Pattern {
  const bpm = jitterBpm(100, rng, BPM_JITTER.medium);
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
  const bpm = jitterBpm(100, rng, BPM_JITTER.easy);
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

interface StandardOptions {
  /** Override the default 2 measures (3 for the "long round" surprise variant). Onset count bounds scale proportionally. */
  measures?: number;
}

function generateStandardPattern(
  difficulty: Exclude<Difficulty, 'easy'>,
  rng: Rng,
  opts: StandardOptions = {},
): Pattern {
  const cfg = STANDARD_CONFIGS[difficulty];
  const bpm = jitterBpm(cfg.bpm, rng, BPM_JITTER[difficulty]);
  const measures = opts.measures ?? cfg.measures;
  // Linear scaling of onset count bounds keeps density (and so the
  // difficulty feel) roughly constant when the measure count changes.
  const onsetScale = measures / cfg.measures;
  const minOnsets = Math.round(cfg.minOnsets * onsetScale);
  const maxOnsets = Math.round(cfg.maxOnsets * onsetScale);
  const totalSlots = cfg.beatsPerMeasure * measures * cfg.subdivision;
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

  enforceOnsetCount(slots, minOnsets, maxOnsets, rng);
  if (cfg.syncopate) applySyncopation(slots, cfg.subdivision, rng);

  const onsets: number[] = [];
  for (let i = 0; i < totalSlots; i++) {
    if (slots[i]) onsets.push(i * secPerSlot);
  }
  const durationSec = totalSlots * secPerSlot;

  return { bpm, onsets, durationSec, difficulty };
}

/**
 * Sparse "surprise" round: 4–6 onsets spaced so the player gets long
 * rests between hits. Same 2-measure footprint as the regular standard
 * round, just with deliberately empty space.
 */
function generateSparseStandard(
  difficulty: Exclude<Difficulty, 'easy'>,
  rng: Rng,
): Pattern {
  const cfg = STANDARD_CONFIGS[difficulty];
  const bpm = jitterBpm(cfg.bpm, rng, BPM_JITTER[difficulty]);
  const totalSlots = cfg.beatsPerMeasure * cfg.measures * cfg.subdivision;
  const secPerSlot = 60 / bpm / cfg.subdivision;
  // 4–6 onsets — sparse enough that the gaps between them read as
  // intentional rests, not "the player ran out of pattern".
  const targetOnsets = 4 + Math.floor(rng() * 3);
  // Reject placements within minSpacing of any existing onset so the
  // gaps stay audible. minSpacing is roughly "round duration / onsets",
  // which forces the onsets to spread instead of clustering.
  const minSpacing = Math.max(2, Math.floor(totalSlots / (targetOnsets + 1)));

  const slots: boolean[] = new Array(totalSlots).fill(false);
  slots[0] = true;
  const placed: number[] = [0];
  let attempts = 0;
  while (placed.length < targetOnsets && attempts < totalSlots * 4) {
    attempts++;
    const candidate = 1 + Math.floor(rng() * (totalSlots - 1));
    if (slots[candidate]) continue;
    const tooClose = placed.some((p) => Math.abs(p - candidate) < minSpacing);
    if (tooClose) continue;
    slots[candidate] = true;
    placed.push(candidate);
  }

  const onsets: number[] = [];
  for (let i = 0; i < totalSlots; i++) {
    if (slots[i]) onsets.push(i * secPerSlot);
  }
  return { bpm, onsets, durationSec: totalSlots * secPerSlot, difficulty };
}

/**
 * Mixed-subdivision Medium round: measure 1 in 8ths (steadier), measure
 * 2 in 16ths (denser, more demanding). The density ramp catches the
 * player off-guard halfway through the round.
 */
function generateMixedSubdivisionMedium(rng: Rng): Pattern {
  const bpm = jitterBpm(100, rng, BPM_JITTER.medium);
  const beatSec = 60 / bpm;
  // Measure 1: 4 beats in 8ths → 8 slots
  const m1Slots = 8;
  const m1SecPerSlot = beatSec / 2;
  const m1Onsets = 3 + Math.floor(rng() * 2); // 3 or 4
  // Measure 2: 4 beats in 16ths → 16 slots
  const m2Slots = 16;
  const m2SecPerSlot = beatSec / 4;
  const m2Onsets = 4 + Math.floor(rng() * 3); // 4, 5, or 6

  const m1 = pickSlots(m1Slots, m1Onsets, rng, /* anchor0 */ true);
  const m2 = pickSlots(m2Slots, m2Onsets, rng, /* anchor0 */ false);

  const onsets: number[] = [];
  for (let i = 0; i < m1Slots; i++) if (m1[i]) onsets.push(i * m1SecPerSlot);
  const m1Duration = m1Slots * m1SecPerSlot;
  for (let i = 0; i < m2Slots; i++) if (m2[i]) onsets.push(m1Duration + i * m2SecPerSlot);
  const durationSec = m1Duration + m2Slots * m2SecPerSlot;

  return { bpm, onsets, durationSec, difficulty: 'medium' };
}

/** Place `count` onsets uniformly at random across `total` slots. When
 * anchor0 is true, slot 0 is forced (used for the first measure so the
 * round's forced first tap aligns with onset 0). */
function pickSlots(total: number, count: number, rng: Rng, anchor0: boolean): boolean[] {
  const slots: boolean[] = new Array(total).fill(false);
  const remaining: number[] = [];
  if (anchor0) {
    slots[0] = true;
    for (let i = 1; i < total; i++) remaining.push(i);
  } else {
    for (let i = 0; i < total; i++) remaining.push(i);
  }
  let placed = anchor0 ? 1 : 0;
  while (placed < count && remaining.length > 0) {
    const idx = Math.floor(rng() * remaining.length);
    const slot = remaining.splice(idx, 1)[0];
    slots[slot] = true;
    placed++;
  }
  return slots;
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
