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
  /** Average absolute beat-to-beat IOI deviation in milliseconds. */
  tempoMsDev: number;
  /** Whether the deviation has a dominant direction; 'mixed' when it doesn't. */
  tempoDirection: 'fast' | 'slow' | 'mixed' | 'on';
  completenessPct: number;
  meanAbsErrorMs: number;
}
