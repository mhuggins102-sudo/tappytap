import { ensureAudioEngine } from '../audio/audioContext';
import { schedulePattern, scheduleCountdown } from '../audio/scheduler';
import { playFeedbackClick } from '../audio/clickSynth';
import { generatePattern } from '../patterns/generator';
import { generateDailyPattern, todayUtcDateString } from '../patterns/daily';
import type { Difficulty, Pattern } from '../patterns/types';
import { rngFromRandom } from '../lib/rng';
import { scoreRound, shareString } from '../lib/scoring';
import { recordRound, saveDailyEntry, loadDailyEntry } from '../lib/storage';
import { startCapture } from './inputCapture';
import { Store } from './store';
import { INITIAL_STATE, type GameState } from './stateMachine';

export const gameStore = new Store<GameState>(INITIAL_STATE);

const COUNTDOWN_BEATS = 4;
const ECHO_GAP_SEC = 0.8;
const ECHO_TAIL_SEC = 0.5;
const FIRST_TAP_TIMEOUT_SEC = 3;

let pendingTimers: number[] = [];
let releaseCapture: (() => void) | null = null;
let currentTaps: number[] = [];
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
  const eng = await ensureAudioEngine();
  const pattern = generatePattern(difficulty, rngFromRandom());
  await beginRound(eng.ctx, pattern, difficulty, false);
}

export async function startDailyRound(): Promise<void> {
  const dateStr = todayUtcDateString();
  const existing = loadDailyEntry(dateStr);
  if (existing) {
    gameStore.set({
      ...gameStore.get(),
      screen: 'score',
      difficulty: 'medium',
      isDailyChallenge: true,
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

  const now = ctx.currentTime;
  const leadIn = 0.15;
  const countdownStart = now + leadIn;
  const countdownEnd = scheduleCountdown(ctx, countdownStart, COUNTDOWN_BEATS, pattern.bpm);

  const patternStart = countdownEnd;
  const patternEnd = schedulePattern(ctx, pattern, patternStart);
  const echoStart = patternEnd + ECHO_GAP_SEC;

  gameStore.set({
    screen: 'game',
    difficulty,
    isDailyChallenge,
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
      enterEchoPhase(ctx, pattern, difficulty, isDailyChallenge, echoStart);
    }, msUntilEcho),
  );
}

function enterEchoPhase(
  ctx: AudioContext,
  pattern: Pattern,
  difficulty: Difficulty,
  isDailyChallenge: boolean,
  echoStart: number,
): void {
  currentTaps = [];

  gameStore.set({
    ...gameStore.get(),
    phase: {
      kind: 'echoing',
      pattern,
      phaseStartedAt: echoStart,
      echoStartTime: null,
      taps: [],
    },
  });

  abortTimer = window.setTimeout(() => {
    abortTimer = null;
    teardownCapture();
    clearTimers();
    gameStore.set({ ...gameStore.get(), screen: 'picker', phase: { kind: 'idle' } });
  }, FIRST_TAP_TIMEOUT_SEC * 1000);

  releaseCapture = startCapture((audioTime) => {
    const phase = gameStore.get().phase;
    if (phase.kind !== 'echoing') return;

    playFeedbackClick(ctx);

    if (phase.echoStartTime === null) {
      if (abortTimer !== null) {
        window.clearTimeout(abortTimer);
        abortTimer = null;
      }
      currentTaps = [0];
      gameStore.set({
        ...gameStore.get(),
        phase: { ...phase, echoStartTime: audioTime, taps: [0] },
      });

      const finalizeMs = (pattern.durationSec + ECHO_TAIL_SEC) * 1000;
      finalizeTimer = window.setTimeout(() => {
        finalizeTimer = null;
        teardownCapture();
        finalizeRound(pattern, difficulty, isDailyChallenge);
      }, finalizeMs);
      return;
    }

    const rel = audioTime - phase.echoStartTime;
    currentTaps.push(rel);
    gameStore.set({
      ...gameStore.get(),
      phase: { ...phase, taps: [...currentTaps] },
    });
  });
}

function finalizeRound(pattern: Pattern, difficulty: Difficulty, isDailyChallenge: boolean): void {
  const result = scoreRound(pattern.onsets, currentTaps);

  if (isDailyChallenge) {
    const dateStr = todayUtcDateString();
    saveDailyEntry({ date: dateStr, result, shareString: shareString(dateStr, result) });
  } else {
    recordRound(difficulty, result);
  }

  gameStore.set({
    screen: 'score',
    difficulty,
    isDailyChallenge,
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
