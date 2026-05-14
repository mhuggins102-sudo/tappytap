export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Pattern {
  bpm: number;
  onsets: number[];
  durationSec: number;
  difficulty: Difficulty;
}

export type Judgment = 'perfect' | 'great' | 'good' | 'ok' | 'miss';

export interface TapResult {
  expectedIdx: number;
  tapTime: number | null;
  errorMs: number | null;
  rawErrorMs: number | null;
  judgment: Judgment;
}

export interface RoundResult {
  taps: TapResult[];
  totalScore: number;
  accuracyPct: number;
  judgmentCounts: Record<Judgment, number>;
  tempoFactor: number;
  tempoIntercept: number;
  rhythmScore: number;
  tempoScore: number;
  /** Percent the player's slope deviated from 1.0 — the magnitude shown with the fast/slow label. */
  tempoPct: number;
  /** Average absolute beat-to-beat IOI deviation in milliseconds. Kept for diagnostics; the user-facing 'unsteady' label now uses tempoUnsteadyPct. */
  tempoMsDev: number;
  /** Same wobble expressed as a percentage of the pattern's mean inter-onset interval — the value shown alongside the 'unsteady' label. */
  tempoUnsteadyPct: number;
  /** Whether the deviation has a dominant direction; 'mixed' when it doesn't. */
  tempoDirection: 'fast' | 'slow' | 'mixed' | 'on';
  /** Fraction of expected onsets the player tapped at all (regardless of accuracy). Used to scale rhythm and tempo subscores so incomplete rounds are penalized proportionally. */
  completenessPct: number;
  meanAbsErrorMs: number;
}
