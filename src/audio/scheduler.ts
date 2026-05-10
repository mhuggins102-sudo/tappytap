import type { Pattern } from '../patterns/types';
import { scheduleBeep, scheduleClick } from './clickSynth';

export function schedulePattern(ctx: AudioContext, pattern: Pattern, startTime: number): number {
  for (let i = 0; i < pattern.onsets.length; i++) {
    scheduleClick(ctx, startTime + pattern.onsets[i]);
  }
  return startTime + pattern.durationSec;
}

const COUNTDOWN_FREQS = [659.25, 523.25, 392.0, 1046.5];

export function scheduleCountdown(ctx: AudioContext, startTime: number, beats: number, bpm: number): number {
  const secPerBeat = 60 / bpm;
  const beepDuration = Math.min(0.3, secPerBeat * 0.55);
  for (let i = 0; i < beats; i++) {
    const when = startTime + i * secPerBeat;
    const isFinal = i === beats - 1;
    const freq = COUNTDOWN_FREQS[Math.min(i, COUNTDOWN_FREQS.length - 1)];
    scheduleBeep(ctx, when, {
      freq,
      gain: isFinal ? 0.5 : 0.32,
      durationSec: isFinal ? Math.min(0.45, secPerBeat * 0.8) : beepDuration,
    });
  }
  return startTime + beats * secPerBeat;
}
