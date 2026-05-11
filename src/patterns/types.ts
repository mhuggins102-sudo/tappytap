export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Pattern {
  bpm: number;
  onsets: number[];
  durationSec: number;
  difficulty: Difficulty;
}

export type Judgment = 'perfect' | 'great' | 'ok' | 'off' | 'miss';
export type JudgmentOrExtra = Judgment | 'extra';

export interface TapResult {
  expectedIdx: number | null;
  tapTime: number | null;
  errorMs: number | null;
  rawErrorMs: number | null;
  judgment: JudgmentOrExtra;
}

export interface RoundResult {
  taps: TapResult[];
  totalScore: number;
  accuracyPct: number;
  judgmentCounts: Record<Judgment | 'extra', number>;
  tempoFactor: number;
  tempoIntercept: number;
  rhythmScore: number;
  tempoScore: number;
  tempoPct: number;
  completenessPct: number;
  cleanlinessPct: number;
  meanAbsErrorMs: number;
}
