import type { Difficulty, JudgmentOrExtra, Pattern, RoundResult } from '../patterns/types';

export type Screen = 'start' | 'picker' | 'game' | 'score' | 'daily';

export interface TapFlash {
  judgment: JudgmentOrExtra;
  at: number;
}

export type Phase =
  | { kind: 'idle' }
  | { kind: 'countdown'; startedAt: number; endsAt: number; beats: number }
  | { kind: 'listening'; pattern: Pattern; patternStartTime: number; patternEndTime: number }
  | {
      kind: 'echoing';
      pattern: Pattern;
      phaseStartedAt: number;
      echoStartTime: number | null;
      taps: number[];
      tapJudgments: JudgmentOrExtra[];
      lastFlash: TapFlash | null;
      isPractice: boolean;
    }
  | { kind: 'scoring'; pattern: Pattern; result: RoundResult };

export interface GameState {
  screen: Screen;
  difficulty: Difficulty;
  isDailyChallenge: boolean;
  isPractice: boolean;
  phase: Phase;
  lastResult: RoundResult | null;
  lastPattern: Pattern | null;
}

export const INITIAL_STATE: GameState = {
  screen: 'start',
  difficulty: 'easy',
  isDailyChallenge: false,
  isPractice: false,
  phase: { kind: 'idle' },
  lastResult: null,
  lastPattern: null,
};
