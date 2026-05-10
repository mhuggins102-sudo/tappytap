import type { Pattern } from '../patterns/types';
import { scheduleClick, scheduleDownbeat } from './clickSynth';

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

export function scheduleCountdown(ctx: AudioContext, startTime: number, beats: number, bpm: number): number {
  const secPerBeat = 60 / bpm;
  for (let i = 0; i < beats; i++) {
    const when = startTime + i * secPerBeat;
    if (i === beats - 1) {
      scheduleDownbeat(ctx, when);
    } else {
      scheduleClick(ctx, when, { freq: 700, gain: 0.4, decaySec: 0.04 });
    }
  }
  return startTime + beats * secPerBeat;
}
