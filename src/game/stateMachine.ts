import type { Difficulty, Pattern, RoundResult } from '../patterns/types';

export type Screen = 'start' | 'picker' | 'game' | 'score' | 'daily';

export type Phase =
  | { kind: 'idle' }
  | { kind: 'countdown'; startedAt: number; endsAt: number }
  | { kind: 'listening'; pattern: Pattern; patternStartTime: number; patternEndTime: number }
  | { kind: 'echoing'; pattern: Pattern; echoStartTime: number; echoEndTime: number; taps: number[] }
  | { kind: 'scoring'; pattern: Pattern; result: RoundResult };

export interface GameState {
  screen: Screen;
  difficulty: Difficulty;
  isDailyChallenge: boolean;
  phase: Phase;
  lastResult: RoundResult | null;
}

export const INITIAL_STATE: GameState = {
  screen: 'start',
  difficulty: 'easy',
  isDailyChallenge: false,
  phase: { kind: 'idle' },
  lastResult: null,
};
