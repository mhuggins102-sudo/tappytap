import type { Difficulty, Judgment, Pattern, RoundResult } from '../patterns/types';
import type { Instrument } from '../lib/storage';

export type Screen =
  | 'start'
  | 'picker'
  | 'game'
  | 'score'
  | 'daily'
  | 'archive'
  | 'passAndPlaySetup'
  | 'passAndPlayInterlude'
  | 'passAndPlayRoundSummary'
  | 'passAndPlayGameOver';

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

export type PlayerId = 'p1' | 'p2';

export interface PassAndPlayConfig {
  p1Name: string;
  p2Name: string;
  p1Instrument: Instrument;
  p2Instrument: Instrument;
  /** When 'random', a fresh Difficulty is rolled for each round. */
  difficulty: Difficulty | 'random';
  grooveSounds: boolean;
}

export interface PassAndPlayRoundOutcome {
  roundIndex: number; // 0-based, 0..9
  difficulty: Difficulty;
  firstPlayer: PlayerId;
  p1Result: RoundResult;
  p2Result: RoundResult;
  winner: PlayerId | 'tie';
}

/**
 * Live state for an in-progress Pass-and-Play match. Created when the
 * host taps "Start Game" in the setup modal; cleared when they navigate
 * out of the match (game over screen → home, or early quit). Not
 * persisted across browser refresh — a refresh ends the match.
 */
export interface PassAndPlayMatch {
  config: PassAndPlayConfig;
  // Cumulative tallies across rounds played so far.
  p1Wins: number;
  p2Wins: number;
  ties: number;
  history: PassAndPlayRoundOutcome[];
  // Round in progress.
  currentRoundIndex: number; // 0..9
  currentRoundDifficulty: Difficulty;
  currentRoundPattern: Pattern;
  currentRoundGrooveIdx: number;
  /** Which player kicks off this round. Alternates each round. */
  currentRoundFirstPlayer: PlayerId;
  /** The player whose turn is in progress (first then second). */
  currentRoundActivePlayer: PlayerId;
  /** First player's result for the current round, stashed so the
   * interlude screen can show the score-to-beat and the round summary
   * can pair it with the second player's result. */
  currentRoundFirstResult: RoundResult | null;
}

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
  /** Non-null while a Pass-and-Play match is in progress. */
  passAndPlay: PassAndPlayMatch | null;
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
  passAndPlay: null,
};
