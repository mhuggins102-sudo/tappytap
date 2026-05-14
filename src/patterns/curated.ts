import type { Pattern, Difficulty } from './types';
import type { Rng } from '../lib/rng';
import { jitterBpm } from './generator';

// A curated rhythmic figure: a hand-authored slot grid for a recognizable
// musical rhythm. Mixed in with procedurally-generated patterns to give
// rounds character beyond purely random density placement.
interface CuratedFigure {
  name: string;
  difficulties: Exclude<Difficulty, 'easy'>[];
  /** Slots per beat. 2 = eighth-notes, 4 = sixteenth-notes. */
  subdivision: number;
  /** Total slot count covering the figure's full duration. */
  totalSlots: number;
  /** Slot indices that carry an onset. Must include slot 0 so the round's forced first tap aligns with the first expected onset. */
  onsetSlots: number[];
}

const FIGURES: CuratedFigure[] = [
  // Tresillo: 3+3+2 over a half-measure of 16ths, played end-to-end
  // across 2 measures of 4/4. Iconic Afro-Cuban shape; foundational for
  // many Latin and Latin-derived rhythms. The 2-measure form (12 onsets,
  // 4.8s at 100 BPM) keeps the round length consistent with the other
  // curated figures on both Medium and Hard.
  {
    name: 'tresillo',
    difficulties: ['medium', 'hard'],
    subdivision: 4,
    totalSlots: 32,
    onsetSlots: [0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 27, 30],
  },
  // Habanera bass figure (dotted-eighth + sixteenth + 2 eighths in 16th
  // grid: 0,3,4,6) doubled across 2 measures of 16ths.
  {
    name: 'habanera_double',
    difficulties: ['medium', 'hard'],
    subdivision: 4,
    totalSlots: 32,
    onsetSlots: [0, 3, 4, 6, 16, 19, 20, 22],
  },
  // Bossa-style partido-alto motif: syncopated 5-stroke per measure
  // (0,3,6,10,14) doubled across 2 measures of 16ths.
  {
    name: 'bossa_partido',
    difficulties: ['hard'],
    subdivision: 4,
    totalSlots: 32,
    onsetSlots: [0, 3, 6, 10, 14, 16, 19, 22, 26, 30],
  },
  // Dembow kick figure (boom-ch-boom-chick): 0,6,10,14 per measure of
  // 16ths, doubled. Classic reggaeton/dancehall pulse.
  {
    name: 'dembow',
    difficulties: ['hard'],
    subdivision: 4,
    totalSlots: 32,
    onsetSlots: [0, 6, 10, 14, 16, 22, 26, 30],
  },
];

/**
 * Probability that a Medium or Hard round uses a curated rhythmic figure
 * instead of the procedural generator. Dialed back to 20% so most rounds
 * — especially on Hard — are free-form syncopation rather than a
 * recognizable repeating motif, but the named figures still surface
 * often enough to develop pattern recognition.
 */
export const CURATED_FIGURE_PROBABILITY = 0.2;

function pickFigure(
  difficulty: Exclude<Difficulty, 'easy'>,
  rng: Rng,
): CuratedFigure | null {
  const eligible = FIGURES.filter((f) => f.difficulties.includes(difficulty));
  if (eligible.length === 0) return null;
  return eligible[Math.floor(rng() * eligible.length)];
}

/**
 * Materialize a curated figure into a Pattern. Returns null if no figures
 * are tagged for the given difficulty (easy never gets curated figures —
 * those rely on the simple motif-on-loop generator for predictability).
 */
export function generateCuratedPattern(
  difficulty: Exclude<Difficulty, 'easy'>,
  rng: Rng,
): Pattern | null {
  const fig = pickFigure(difficulty, rng);
  if (!fig) return null;
  const baseBpm = difficulty === 'medium' ? 100 : 110;
  const bpm = jitterBpm(baseBpm, rng);
  const secPerSlot = 60 / bpm / fig.subdivision;
  const onsets = fig.onsetSlots.map((s) => s * secPerSlot);
  const durationSec = fig.totalSlots * secPerSlot;
  return { bpm, onsets, durationSec, difficulty };
}
