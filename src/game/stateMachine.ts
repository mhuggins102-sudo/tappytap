import type { Difficulty, Judgment, Pattern, RoundResult } from '../patterns/types';

export type Screen = 'start' | 'picker' | 'game' | 'score' | 'daily' | 'archive';

export interface TapFlash {
  judgment: Judgment;
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
      tapJudgments: Judgment[];
      lastFlash: TapFlash | null;
      isPractice: boolean;
    }
  | { kind: 'scoring'; pattern: Pattern; result: RoundResult };

export interface GameState {
  screen: Screen;
  difficulty: Difficulty;
  isDailyChallenge: boolean;
  /** Which date's daily challenge is in play; null outside daily mode. */
  dailyDateStr: string | null;
  isPractice: boolean;
  // True while the current round is a Try-again replay of the previous
  // pattern. Replays don't update high-score / lifetime-average stats so
  // only the first attempt at a beat counts.
  isReplay: boolean;
  phase: Phase;
  lastResult: RoundResult | null;
  lastPattern: Pattern | null;
  // The groove index used for the most recently started round. Re-used when
  // the player taps "Try again" so they hear the same beat.
  lastGrooveIdx: number | null;
  // Transient: set when the just-finished daily round produced a new
  // personal best for that date. Reset when starting any new round or
  // navigating away from the score screen so it never surfaces stale.
  dailyImprovedOnRetry: boolean;
  /** The previous best for the date, if dailyImprovedOnRetry is true. */
  dailyPreviousScore: number | null;
  /**
   * Whether the player is eligible for one extra pattern playback during
   * this round. True only on the first (scoring) attempt of a non-daily
   * medium/hard round; false otherwise.
   */
  listenAgainAvailable: boolean;
  /** Set once the player taps the Listen Again button. */
  listenAgainUsed: boolean;
}

export const INITIAL_STATE: GameState = {
  screen: 'start',
  difficulty: 'easy',
  isDailyChallenge: false,
  dailyDateStr: null,
  isPractice: false,
  isReplay: false,
  phase: { kind: 'idle' },
  lastResult: null,
  lastPattern: null,
  lastGrooveIdx: null,
  dailyImprovedOnRetry: false,
  dailyPreviousScore: null,
  listenAgainAvailable: false,
  listenAgainUsed: false,
};
