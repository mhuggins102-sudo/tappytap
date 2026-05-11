import { ensureAudioEngine, kickAudioSync } from '../audio/audioContext';
import {
  pickGrooveIndex,
  playTapFeedback,
  schedulePattern,
  scheduleCountdown,
  type SoundTheme,
} from '../audio/scheduler';
import { generatePattern } from '../patterns/generator';
import { generateDailyPattern, todayUtcDateString } from '../patterns/daily';
import type { Difficulty, Judgment, Pattern } from '../patterns/types';
import { rngFromRandom } from '../lib/rng';
import { matchTapLive, scoreRound, shareString } from '../lib/scoring';
import { loadSettings, recordRound, saveDailyEntry, loadDailyEntry } from '../lib/storage';
import { startCapture } from './inputCapture';
import { Store } from './store';
import { INITIAL_STATE, type GameState } from './stateMachine';

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
  gameStore.set({ ...gameStore.get(), screen: 'picker', phase: { kind: 'idle' } });
}

export function goToDailyScreen(): void {
  clearTimers();
  teardownCapture();
  gameStore.set({ ...gameStore.get(), screen: 'daily', phase: { kind: 'idle' } });
}

export async function dismissStart(): Promise<void> {
  await ensureAudioEngine();
  gameStore.set({ ...gameStore.get(), screen: 'picker' });
}

export async function startRound(difficulty: Difficulty): Promise<void> {
  kickAudioSync();
  const eng = await ensureAudioEngine();
  const pattern = generatePattern(difficulty, rngFromRandom());
  await beginRound(eng.ctx, pattern, difficulty, false);
}

export async function startDailyRound(): Promise<void> {
  kickAudioSync();
  const dateStr = todayUtcDateString();
  const existing = loadDailyEntry(dateStr);
  if (existing) {
    gameStore.set({
      ...gameStore.get(),
      screen: 'score',
      difficulty: 'medium',
      isDailyChallenge: true,
      isPractice: false,
      lastResult: existing.result,
      phase: { kind: 'idle' },
    });
    return;
  }
  const eng = await ensureAudioEngine();
  const pattern = generateDailyPattern(dateStr);
  await beginRound(eng.ctx, pattern, 'medium', true);
}

async function beginRound(
  ctx: AudioContext,
  pattern: Pattern,
  difficulty: Difficulty,
  isDailyChallenge: boolean,
): Promise<void> {
  clearTimers();
  teardownCapture();
  currentTaps = [];
  currentJudgments = [];

  const settings = loadSettings();
  const isPractice = !isDailyChallenge && settings.practiceMode;

  const now = ctx.currentTime;
  const leadIn = 0.15;
  const countdownStart = now + leadIn;
  const countdownEnd = scheduleCountdown(ctx, countdownStart, COUNTDOWN_BEATS, pattern.bpm);

  const patternStart = countdownEnd;
  const grooveIdx = pickGrooveIndex();
  const patternEnd = schedulePattern(ctx, pattern, patternStart, settings.soundTheme, grooveIdx);
  const echoStart = patternEnd + ECHO_GAP_SEC;

  gameStore.set({
    screen: 'game',
    difficulty,
    isDailyChallenge,
    isPractice,
    lastResult: gameStore.get().lastResult,
    lastPattern: pattern,
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

  const msUntilEcho = Math.max(0, (echoStart - ctx.currentTime) * 1000);
  pendingTimers.push(
    window.setTimeout(() => {
      enterEchoPhase(
        ctx,
        pattern,
        difficulty,
        isDailyChallenge,
        isPractice,
        echoStart,
        settings.soundTheme,
        grooveIdx,
      );
    }, msUntilEcho),
  );
}

function enterEchoPhase(
  ctx: AudioContext,
  pattern: Pattern,
  difficulty: Difficulty,
  isDailyChallenge: boolean,
  isPractice: boolean,
  echoStart: number,
  soundTheme: SoundTheme,
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

    playTapFeedback(ctx, soundTheme, grooveIdx, currentTaps.length);

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
    const tapIdx = currentTaps.length;
    const match = matchTapLive(rel, pattern.onsets[tapIdx], tapIdx);
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

  if (!isPractice) {
    if (isDailyChallenge) {
      const dateStr = todayUtcDateString();
      saveDailyEntry({ date: dateStr, result, shareString: shareString(dateStr, result) });
    } else {
      recordRound(difficulty, result);
    }
  }

  gameStore.set({
    screen: 'score',
    difficulty,
    isDailyChallenge,
    isPractice,
    lastResult: result,
    lastPattern: pattern,
    phase: { kind: 'scoring', pattern, result },
  });
}

export function playAgain(): void {
  const state = gameStore.get();
  if (state.isDailyChallenge) {
    goToDailyScreen();
    return;
  }
  void startRound(state.difficulty);
}
