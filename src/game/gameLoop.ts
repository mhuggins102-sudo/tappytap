import { ensureAudioEngine, kickAudioSync, resetOutputNode } from '../audio/audioContext';
import {
  pickGrooveIndex,
  playTapFeedback,
  schedulePattern,
  scheduleCountdown,
  type Instrument,
  type SoundTheme,
} from '../audio/scheduler';
import { generatePattern } from '../patterns/generator';
import { dailyDifficultyFor, generateDailyPattern, todayUtcDateString } from '../patterns/daily';
import type { Difficulty, Judgment, Pattern } from '../patterns/types';
import { rngFromRandom } from '../lib/rng';
import { matchTapLiveAdaptive, scoreRound, shareString } from '../lib/scoring';
import {
  loadSettings,
  recordRound,
  saveDailyEntry,
  loadDailyEntry,
  MAX_DAILY_ATTEMPTS,
} from '../lib/storage';
import { startCapture } from './inputCapture';
import { Store } from './store';
import {
  INITIAL_STATE,
  type GameState,
  type PassAndPlayConfig,
  type PassAndPlayMatch,
  type PassAndPlayRoundOutcome,
  type PlayerId,
} from './stateMachine';

export const gameStore = new Store<GameState>(INITIAL_STATE);

const COUNTDOWN_BEATS = 4;
const ECHO_GAP_SEC = 0.8;
const FIRST_TAP_TIMEOUT_SEC = 3;
// While the player is mid-pattern, end the round only after this many seconds
// of silence. Pattern duration is no longer a hard cap so slow players get a
// chance to finish; honest play with a 2.5s pause to recover still ends in a
// reasonable time.
const IDLE_TIMEOUT_SEC = 2.5;

let pendingTimers: number[] = [];
let releaseCapture: (() => void) | null = null;
let currentTaps: number[] = [];
let currentJudgments: Judgment[] = [];
let finalizeTimer: number | null = null;
let abortTimer: number | null = null;
let echoTimer: number | null = null;
// Snapshot of the audio/state info for the currently-running round, so
// listenAgain() can re-schedule pattern playback and the echo transition
// without re-deriving them from scratch.
let currentRound:
  | {
      ctx: AudioContext;
      pattern: Pattern;
      difficulty: Difficulty;
      isDailyChallenge: boolean;
      isPractice: boolean;
      soundTheme: SoundTheme;
      instrument: Instrument;
      grooveIdx: number;
    }
  | null = null;

function clearTimers(): void {
  for (const t of pendingTimers) window.clearTimeout(t);
  pendingTimers = [];
  if (finalizeTimer !== null) {
    window.clearTimeout(finalizeTimer);
    finalizeTimer = null;
  }
  if (abortTimer !== null) {
    window.clearTimeout(abortTimer);
    abortTimer = null;
  }
  if (echoTimer !== null) {
    window.clearTimeout(echoTimer);
    echoTimer = null;
  }
  // Cut any audio that was scheduled for the round we're tearing down so
  // it doesn't continue playing after the player navigates away.
  if (currentRound) {
    try {
      resetOutputNode(currentRound.ctx);
    } catch {
      // ignore — best-effort
    }
  }
  currentRound = null;
}

function teardownCapture(): void {
  if (releaseCapture) {
    releaseCapture();
    releaseCapture = null;
  }
}

export function goToPicker(): void {
  clearTimers();
  teardownCapture();
  gameStore.set({
    ...gameStore.get(),
    screen: 'picker',
    phase: { kind: 'idle' },
    dailyImprovedOnRetry: false,
    dailyPreviousScore: null,
  });
}

export function goToDailyScreen(dateStr?: string): void {
  clearTimers();
  teardownCapture();
  const date = dateStr ?? todayUtcDateString();
  gameStore.set({
    ...gameStore.get(),
    screen: 'daily',
    dailyDateStr: date,
    isDailyChallenge: true,
    phase: { kind: 'idle' },
    dailyImprovedOnRetry: false,
    dailyPreviousScore: null,
  });
}

export function goToArchiveScreen(): void {
  clearTimers();
  teardownCapture();
  gameStore.set({
    ...gameStore.get(),
    screen: 'archive',
    isDailyChallenge: false,
    dailyDateStr: null,
    phase: { kind: 'idle' },
    dailyImprovedOnRetry: false,
    dailyPreviousScore: null,
  });
}

export function goToPassAndPlaySetup(): void {
  clearTimers();
  teardownCapture();
  gameStore.set({
    ...gameStore.get(),
    screen: 'passAndPlaySetup',
    isDailyChallenge: false,
    dailyDateStr: null,
    phase: { kind: 'idle' },
    dailyImprovedOnRetry: false,
    dailyPreviousScore: null,
  });
}

export async function dismissStart(): Promise<void> {
  await ensureAudioEngine();
  gameStore.set({ ...gameStore.get(), screen: 'picker' });
}

export async function startRound(difficulty: Difficulty): Promise<void> {
  kickAudioSync();
  const eng = await ensureAudioEngine();
  const pattern = generatePattern(difficulty, rngFromRandom());
  await beginRound(eng.ctx, pattern, difficulty, false, false);
}

/**
 * Replay the most recent pattern with the same groove. Used by the "Try
 * again" button. Replays are flagged as such so finalizeRound skips
 * recording them to the player's lifetime stats — only the first attempt
 * at a beat counts toward best score / averages.
 *
 * Daily challenges (today and archived) allow a single retry, so a daily
 * round refuses to start when the entry has already used both attempts.
 */
export async function tryAgain(): Promise<void> {
  const state = gameStore.get();
  if (!state.lastPattern) return;
  if (state.isDailyChallenge && state.dailyDateStr) {
    const existing = loadDailyEntry(state.dailyDateStr);
    if (existing && existing.attempts >= MAX_DAILY_ATTEMPTS) return;
  }
  kickAudioSync();
  const eng = await ensureAudioEngine();
  // Daily retry: re-run the daily start path so the day's date is attached
  // to the resulting save. Lifetime-stat rounds use the regular replay flow
  // with isReplay=true (excluded from best-score/average updates).
  if (state.isDailyChallenge && state.dailyDateStr) {
    await beginRound(
      eng.ctx,
      state.lastPattern,
      state.lastPattern.difficulty,
      true,
      false,
      state.lastGrooveIdx ?? undefined,
      state.dailyDateStr,
    );
    return;
  }
  await beginRound(
    eng.ctx,
    state.lastPattern,
    state.difficulty,
    false,
    true,
    state.lastGrooveIdx ?? undefined,
  );
}

export async function startDailyRound(forDate?: string): Promise<void> {
  kickAudioSync();
  const dateStr = forDate ?? todayUtcDateString();
  const existing = loadDailyEntry(dateStr);
  // Two-attempt cap applies uniformly to today and to archived days. When
  // attempts are exhausted, surface the saved result instead of replaying.
  if (existing && existing.attempts >= MAX_DAILY_ATTEMPTS) {
    gameStore.set({
      ...gameStore.get(),
      screen: 'score',
      difficulty: dailyDifficultyFor(dateStr),
      isDailyChallenge: true,
      dailyDateStr: dateStr,
      isPractice: false,
      isReplay: false,
      lastResult: existing.result,
      dailyImprovedOnRetry: false,
      dailyPreviousScore: null,
      phase: { kind: 'idle' },
    });
    return;
  }
  const eng = await ensureAudioEngine();
  const pattern = generateDailyPattern(dateStr);
  await beginRound(eng.ctx, pattern, pattern.difficulty, true, false, undefined, dateStr);
}

/** Override sound + instrument for the round (used by Pass-and-Play so
 * each player hears their own instrument). When set, isPractice is
 * always false regardless of the global setting. */
interface BeginRoundOverride {
  instrument: Instrument;
  soundTheme: SoundTheme;
}

async function beginRound(
  ctx: AudioContext,
  pattern: Pattern,
  difficulty: Difficulty,
  isDailyChallenge: boolean,
  isReplay: boolean,
  forcedGrooveIdx?: number,
  dailyDateStr?: string,
  override?: BeginRoundOverride,
): Promise<void> {
  clearTimers();
  teardownCapture();
  currentTaps = [];
  currentJudgments = [];

  const settings = loadSettings();
  // P&P overrides force practice mode off — each turn is competitive
  // even though it doesn't write to the lifetime stats store.
  const isPractice = override ? false : !isDailyChallenge && settings.practiceMode;
  const instrument = override?.instrument ?? settings.instrument;
  const soundTheme = override?.soundTheme ?? settings.soundTheme;

  const now = ctx.currentTime;
  const leadIn = 0.15;
  const countdownStart = now + leadIn;
  const countdownEnd = scheduleCountdown(ctx, countdownStart, COUNTDOWN_BEATS, pattern.bpm);

  const patternStart = countdownEnd;
  const grooveIdx =
    forcedGrooveIdx !== undefined ? forcedGrooveIdx : pickGrooveIndex(instrument);
  const patternEnd = schedulePattern(
    ctx,
    pattern,
    patternStart,
    soundTheme,
    instrument,
    grooveIdx,
  );
  const echoStart = patternEnd + ECHO_GAP_SEC;

  // Listen Again is offered on the first scoring attempt of any non-daily
  // round (Easy, Medium, or Hard). Practice doesn't qualify since those
  // rounds don't count. One use per round. P&P rounds also get it.
  const listenAgainAvailable = !isDailyChallenge && !isReplay && !isPractice;

  currentRound = {
    ctx,
    pattern,
    difficulty,
    isDailyChallenge,
    isPractice,
    soundTheme,
    instrument,
    grooveIdx,
  };

  gameStore.set({
    ...gameStore.get(),
    screen: 'game',
    difficulty,
    isDailyChallenge,
    dailyDateStr: dailyDateStr ?? null,
    isPractice,
    isReplay,
    lastPattern: pattern,
    lastGrooveIdx: grooveIdx,
    dailyImprovedOnRetry: false,
    dailyPreviousScore: null,
    listenAgainAvailable,
    listenAgainUsed: false,
    phase: { kind: 'countdown', startedAt: countdownStart, endsAt: countdownEnd, beats: COUNTDOWN_BEATS },
  });

  const msUntilListening = Math.max(0, (patternStart - ctx.currentTime) * 1000);
  pendingTimers.push(
    window.setTimeout(() => {
      gameStore.set({
        ...gameStore.get(),
        phase: { kind: 'listening', pattern, patternStartTime: patternStart, patternEndTime: patternEnd },
      });
    }, msUntilListening),
  );

  scheduleEchoTransition(echoStart);
}

/**
 * (Re-)schedule the listening → echoing transition. Called once from
 * beginRound and again from listenAgain (after queuing a second pattern
 * playback). Keeping it in one place means the echo timer is always
 * consistent with the most recent pattern-end time.
 */
function scheduleEchoTransition(echoStart: number): void {
  if (!currentRound) return;
  if (echoTimer !== null) {
    window.clearTimeout(echoTimer);
    echoTimer = null;
  }
  const round = currentRound;
  const msUntilEcho = Math.max(0, (echoStart - round.ctx.currentTime) * 1000);
  echoTimer = window.setTimeout(() => {
    echoTimer = null;
    enterEchoPhase(
      round.ctx,
      round.pattern,
      round.difficulty,
      round.isDailyChallenge,
      round.isPractice,
      echoStart,
      round.soundTheme,
      round.instrument,
      round.grooveIdx,
    );
  }, msUntilEcho);
}

/**
 * Restart the listen sequence — count-in, pattern, echo phase — exactly
 * like the round's original opening, but cut the previous audio out
 * immediately. Available while the player is in the listening phase OR
 * in the echo phase before their first tap. One use per round, gated by
 * `listenAgainAvailable` (medium/hard, first scoring attempt only —
 * daily / replay / practice rounds don't qualify).
 *
 * `resetOutputNode` cuts any audio scheduled through the round's master
 * gain, so the user gets an instant restart instead of waiting for the
 * tail of the original playback to finish.
 */
export function listenAgain(): void {
  const state = gameStore.get();
  if (!state.listenAgainAvailable || state.listenAgainUsed) return;
  const phase = state.phase;
  const inListening = phase.kind === 'listening';
  const inPreTapEcho = phase.kind === 'echoing' && phase.echoStartTime === null;
  if (!inListening && !inPreTapEcho) return;
  if (!currentRound) return;

  const round = currentRound;
  const ctx = round.ctx;

  // Tear down all state transitions, watchdogs, and the tap capture set
  // up by the original round path.
  for (const t of pendingTimers) window.clearTimeout(t);
  pendingTimers = [];
  if (echoTimer !== null) {
    window.clearTimeout(echoTimer);
    echoTimer = null;
  }
  if (abortTimer !== null) {
    window.clearTimeout(abortTimer);
    abortTimer = null;
  }
  if (finalizeTimer !== null) {
    window.clearTimeout(finalizeTimer);
    finalizeTimer = null;
  }
  teardownCapture();
  currentTaps = [];
  currentJudgments = [];
  // Silence the original playback immediately. Subsequent scheduled
  // sounds route through the freshly-installed master and play normally.
  resetOutputNode(ctx);

  const leadIn = 0.15;
  const countdownStart = ctx.currentTime + leadIn;
  const countdownEnd = scheduleCountdown(
    ctx,
    countdownStart,
    COUNTDOWN_BEATS,
    round.pattern.bpm,
  );
  const patternStart = countdownEnd;
  const patternEnd = schedulePattern(
    ctx,
    round.pattern,
    patternStart,
    round.soundTheme,
    round.instrument,
    round.grooveIdx,
  );
  const echoStart = patternEnd + ECHO_GAP_SEC;

  gameStore.set({
    ...state,
    listenAgainUsed: true,
    phase: {
      kind: 'countdown',
      startedAt: countdownStart,
      endsAt: countdownEnd,
      beats: COUNTDOWN_BEATS,
    },
  });

  // Transition into the new listening phase when the count-in finishes.
  const msUntilListening = Math.max(0, (patternStart - ctx.currentTime) * 1000);
  pendingTimers.push(
    window.setTimeout(() => {
      gameStore.set({
        ...gameStore.get(),
        phase: {
          kind: 'listening',
          pattern: round.pattern,
          patternStartTime: patternStart,
          patternEndTime: patternEnd,
        },
      });
    }, msUntilListening),
  );

  // And finally hand off to the echo phase (the shared scheduler keeps
  // the echo timer reference consistent).
  scheduleEchoTransition(echoStart);
}

function enterEchoPhase(
  ctx: AudioContext,
  pattern: Pattern,
  difficulty: Difficulty,
  isDailyChallenge: boolean,
  isPractice: boolean,
  echoStart: number,
  soundTheme: SoundTheme,
  instrument: Instrument,
  grooveIdx: number,
): void {
  currentTaps = [];
  currentJudgments = [];

  gameStore.set({
    ...gameStore.get(),
    phase: {
      kind: 'echoing',
      pattern,
      phaseStartedAt: echoStart,
      echoStartTime: null,
      taps: [],
      tapJudgments: [],
      lastFlash: null,
      isPractice,
    },
  });

  abortTimer = window.setTimeout(() => {
    abortTimer = null;
    teardownCapture();
    clearTimers();
    gameStore.set({ ...gameStore.get(), screen: 'picker', phase: { kind: 'idle' } });
  }, FIRST_TAP_TIMEOUT_SEC * 1000);

  const armIdleWatchdog = () => {
    if (finalizeTimer !== null) {
      window.clearTimeout(finalizeTimer);
    }
    finalizeTimer = window.setTimeout(() => {
      finalizeTimer = null;
      teardownCapture();
      finalizeRound(pattern, difficulty, isDailyChallenge, isPractice);
    }, IDLE_TIMEOUT_SEC * 1000);
  };

  releaseCapture = startCapture((audioTime) => {
    const phase = gameStore.get().phase;
    if (phase.kind !== 'echoing') return;
    // Defensive: input is also released when the cap is hit, but a final
    // event in flight could still arrive — drop it.
    if (currentTaps.length >= pattern.onsets.length) return;

    playTapFeedback(ctx, soundTheme, instrument, grooveIdx, currentTaps.length);

    if (phase.echoStartTime === null) {
      if (abortTimer !== null) {
        window.clearTimeout(abortTimer);
        abortTimer = null;
      }
      currentTaps = [0];
      currentJudgments = ['perfect'];
      gameStore.set({
        ...gameStore.get(),
        phase: {
          ...phase,
          echoStartTime: audioTime,
          taps: [0],
          tapJudgments: ['perfect'],
          lastFlash: { judgment: 'perfect', at: audioTime },
        },
      });

      // Single-tap pattern: starting tap is the only tap. Finalize now.
      if (pattern.onsets.length <= 1) {
        teardownCapture();
        finalizeTimer = window.setTimeout(() => {
          finalizeTimer = null;
          finalizeRound(pattern, difficulty, isDailyChallenge, isPractice);
        }, 150);
        return;
      }

      armIdleWatchdog();
      return;
    }

    const rel = audioTime - phase.echoStartTime;
    // Tempo-correct each in-progress tap against the slope fit to the
    // taps so far, so the live color tracks what the final score will
    // show — a player who's consistently fast/slow gets green flashes
    // instead of red ones, just like they'll get on the result screen.
    const tapHistory = [...currentTaps, rel];
    const match = matchTapLiveAdaptive(rel, pattern.onsets, tapHistory);
    currentTaps.push(rel);
    currentJudgments.push(match.judgment);
    gameStore.set({
      ...gameStore.get(),
      phase: {
        ...phase,
        taps: [...currentTaps],
        tapJudgments: [...currentJudgments],
        lastFlash: { judgment: match.judgment, at: audioTime },
      },
    });

    // Each tap resets the idle watchdog so the player can keep going as
    // long as they're still tapping. The round still ends immediately
    // once the Nth (final) tap lands.
    if (currentTaps.length >= pattern.onsets.length) {
      if (finalizeTimer !== null) {
        window.clearTimeout(finalizeTimer);
        finalizeTimer = null;
      }
      teardownCapture();
      finalizeTimer = window.setTimeout(() => {
        finalizeTimer = null;
        finalizeRound(pattern, difficulty, isDailyChallenge, isPractice);
      }, 150);
    } else {
      armIdleWatchdog();
    }
  });
}

function finalizeRound(
  pattern: Pattern,
  difficulty: Difficulty,
  isDailyChallenge: boolean,
  isPractice: boolean,
): void {
  const result = scoreRound(pattern.onsets, currentTaps);
  const state = gameStore.get();
  const isReplay = state.isReplay;
  const isPassAndPlay = state.passAndPlay !== null;

  let dailyImprovedOnRetry = false;
  let dailyPreviousScore: number | null = null;
  // Replays, practice rounds, and Pass-and-Play turns don't update
  // lifetime stats — only fresh solo attempts count. Daily-challenge
  // saves use the round's stored date so archived days update the
  // history map for that date, not today.
  if (!isPractice && !isReplay && !isPassAndPlay) {
    if (isDailyChallenge) {
      const dateStr = state.dailyDateStr ?? todayUtcDateString();
      const save = saveDailyEntry({
        date: dateStr,
        result,
        shareString: shareString(dateStr, result),
      });
      dailyImprovedOnRetry = save.wasImprovement;
      dailyPreviousScore = save.previousScore;
    } else {
      recordRound(difficulty, result);
    }
  }

  gameStore.set({
    ...state,
    screen: 'score',
    difficulty,
    isDailyChallenge,
    isPractice,
    lastResult: result,
    lastPattern: pattern,
    dailyImprovedOnRetry,
    dailyPreviousScore,
    phase: { kind: 'scoring', pattern, result },
  });
}

export function playAgain(): void {
  const state = gameStore.get();
  if (state.isDailyChallenge) {
    // Archived daily: return to the archive list. Today's daily: bounce
    // back to today's daily screen, which surfaces the existing entry.
    if (state.dailyDateStr && state.dailyDateStr !== todayUtcDateString()) {
      goToArchiveScreen();
    } else {
      goToDailyScreen();
    }
    return;
  }
  void startRound(state.difficulty);
}

// === Pass and Play ===

const PASS_AND_PLAY_ROUNDS = 10;

function rollRandomDifficulty(): Difficulty {
  const r = Math.random();
  if (r < 1 / 3) return 'easy';
  if (r < 2 / 3) return 'medium';
  return 'hard';
}

function resolveDifficulty(config: PassAndPlayConfig): Difficulty {
  return config.difficulty === 'random' ? rollRandomDifficulty() : config.difficulty;
}

function overrideFor(config: PassAndPlayConfig, player: PlayerId): BeginRoundOverride {
  return {
    instrument: player === 'p1' ? config.p1Instrument : config.p2Instrument,
    soundTheme: config.grooveSounds ? 'groove' : 'tones',
  };
}

/**
 * Player-vs-player clinch check. Returns the player who can no longer be
 * caught (more wins than the opponent could possibly gain over the
 * remaining rounds), or null while the match is still contested.
 */
function checkPassAndPlayClinch(match: PassAndPlayMatch): PlayerId | null {
  const remaining = PASS_AND_PLAY_ROUNDS - match.history.length;
  if (match.p1Wins > match.p2Wins + remaining) return 'p1';
  if (match.p2Wins > match.p1Wins + remaining) return 'p2';
  return null;
}

/** Kick off a fresh Pass-and-Play match: generate round-1 pattern, set
 * up match state, hand off to Player 1's turn. */
export async function startPassAndPlayMatch(config: PassAndPlayConfig): Promise<void> {
  kickAudioSync();
  const eng = await ensureAudioEngine();
  const difficulty = resolveDifficulty(config);
  const pattern = generatePattern(difficulty, rngFromRandom());
  const grooveIdx = pickGrooveIndex(config.p1Instrument);

  const match: PassAndPlayMatch = {
    config,
    p1Wins: 0,
    p2Wins: 0,
    ties: 0,
    history: [],
    currentRoundIndex: 0,
    currentRoundDifficulty: difficulty,
    currentRoundPattern: pattern,
    currentRoundGrooveIdx: grooveIdx,
    currentRoundFirstPlayer: 'p1',
    currentRoundActivePlayer: 'p1',
    currentRoundFirstResult: null,
  };

  gameStore.set({ ...gameStore.get(), passAndPlay: match, lastResult: null });

  await beginRound(
    eng.ctx,
    pattern,
    difficulty,
    false,
    false,
    grooveIdx,
    undefined,
    overrideFor(config, 'p1'),
  );
}

/**
 * From the first player's score screen: stash their result and route to
 * the interlude. The interlude itself handles starting the second
 * player's turn when they tap to begin.
 */
export function passToNextPlayer(): void {
  const state = gameStore.get();
  if (!state.passAndPlay || !state.lastResult) return;
  const match = state.passAndPlay;
  const nextPlayer: PlayerId = match.currentRoundActivePlayer === 'p1' ? 'p2' : 'p1';
  gameStore.set({
    ...state,
    screen: 'passAndPlayInterlude',
    passAndPlay: {
      ...match,
      currentRoundFirstResult: state.lastResult,
      currentRoundActivePlayer: nextPlayer,
    },
  });
}

/**
 * Interlude tap → begin the active player's turn. Used for both the
 * round-start interlude (after Next Round, no score-to-beat) and the
 * within-round interlude (after first player's Pass, with score-to-beat).
 */
export async function beginActivePlayerTurn(): Promise<void> {
  const state = gameStore.get();
  if (!state.passAndPlay) return;
  const match = state.passAndPlay;
  const active = match.currentRoundActivePlayer;
  const instrument = active === 'p1' ? match.config.p1Instrument : match.config.p2Instrument;
  // Fresh groove index per player so each hears their own instrument's groove.
  const grooveIdx = pickGrooveIndex(instrument);

  kickAudioSync();
  const eng = await ensureAudioEngine();

  gameStore.set({
    ...state,
    passAndPlay: { ...match, currentRoundGrooveIdx: grooveIdx },
  });

  await beginRound(
    eng.ctx,
    match.currentRoundPattern,
    match.currentRoundDifficulty,
    false,
    false,
    grooveIdx,
    undefined,
    overrideFor(match.config, active),
  );
}

/** End-of-round button from the second player's score screen. Pairs the
 * two results, awards the round point (or tie), and routes to the round
 * summary screen. */
export function endPassAndPlayRound(): void {
  const state = gameStore.get();
  const match = state.passAndPlay;
  if (!match) return;
  const firstResult = match.currentRoundFirstResult;
  const secondResult = state.lastResult;
  if (!firstResult || !secondResult) return;
  const firstPlayer = match.currentRoundFirstPlayer;
  const p1Result = firstPlayer === 'p1' ? firstResult : secondResult;
  const p2Result = firstPlayer === 'p1' ? secondResult : firstResult;

  let winner: PlayerId | 'tie';
  if (p1Result.totalScore > p2Result.totalScore) winner = 'p1';
  else if (p2Result.totalScore > p1Result.totalScore) winner = 'p2';
  else winner = 'tie';

  const outcome: PassAndPlayRoundOutcome = {
    roundIndex: match.currentRoundIndex,
    difficulty: match.currentRoundDifficulty,
    firstPlayer,
    p1Result,
    p2Result,
    winner,
  };

  gameStore.set({
    ...state,
    screen: 'passAndPlayRoundSummary',
    passAndPlay: {
      ...match,
      p1Wins: winner === 'p1' ? match.p1Wins + 1 : match.p1Wins,
      p2Wins: winner === 'p2' ? match.p2Wins + 1 : match.p2Wins,
      ties: winner === 'tie' ? match.ties + 1 : match.ties,
      history: [...match.history, outcome],
      // Clear first-result; the round is now in history.
      currentRoundFirstResult: null,
    },
  });
}

/** From the round-summary screen, advance to either the next round
 * (set up state and route to the round-start interlude so the player
 * sees whose turn it is before the music kicks in) or the game-over
 * screen (clinched or all 10 rounds played). */
export function advancePassAndPlayRound(): void {
  const state = gameStore.get();
  if (!state.passAndPlay) return;
  const match = state.passAndPlay;

  const clinched = checkPassAndPlayClinch(match);
  if (clinched || match.history.length >= PASS_AND_PLAY_ROUNDS) {
    gameStore.set({ ...state, screen: 'passAndPlayGameOver' });
    return;
  }

  const nextRoundIndex = match.history.length; // 0-indexed
  const nextFirstPlayer: PlayerId = match.currentRoundFirstPlayer === 'p1' ? 'p2' : 'p1';
  const nextDifficulty = resolveDifficulty(match.config);
  const nextPattern = generatePattern(nextDifficulty, rngFromRandom());

  gameStore.set({
    ...state,
    screen: 'passAndPlayInterlude',
    lastResult: null,
    passAndPlay: {
      ...match,
      currentRoundIndex: nextRoundIndex,
      currentRoundDifficulty: nextDifficulty,
      currentRoundPattern: nextPattern,
      currentRoundFirstPlayer: nextFirstPlayer,
      currentRoundActivePlayer: nextFirstPlayer,
      currentRoundFirstResult: null,
    },
  });
}

/** Exit the in-progress match and return home. Discards all match state. */
export function exitPassAndPlay(): void {
  clearTimers();
  teardownCapture();
  gameStore.set({
    ...gameStore.get(),
    screen: 'picker',
    passAndPlay: null,
    phase: { kind: 'idle' },
    lastResult: null,
  });
}
