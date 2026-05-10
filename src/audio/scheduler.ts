import type { Pattern } from '../patterns/types';
import { scheduleBeep, scheduleClick, scheduleDownbeat } from './clickSynth';

export function schedulePattern(ctx: AudioContext, pattern: Pattern, startTime: number): number {
  for (let i = 0; i < pattern.onsets.length; i++) {
    const when = startTime + pattern.onsets[i];
    if (pattern.downbeats[i]) {
      scheduleDownbeat(ctx, when);
    } else {
      scheduleClick(ctx, when);
    }
  }
  return startTime + pattern.durationSec;
}

const COUNTDOWN_FREQS = [392, 523, 659, 880];

export function scheduleCountdown(ctx: AudioContext, startTime: number, beats: number, bpm: number): number {
  const secPerBeat = 60 / bpm;
  const beepDuration = Math.min(0.32, secPerBeat * 0.55);
  for (let i = 0; i < beats; i++) {
    const when = startTime + i * secPerBeat;
    const isFinal = i === beats - 1;
    const freq = COUNTDOWN_FREQS[Math.min(i, COUNTDOWN_FREQS.length - 1)];
    scheduleBeep(ctx, when, {
      freq,
      gain: isFinal ? 0.45 : 0.32,
      durationSec: isFinal ? Math.min(0.4, secPerBeat * 0.7) : beepDuration,
    });
  }
  return startTime + beats * secPerBeat;
}
