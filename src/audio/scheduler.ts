import type { Pattern } from '../patterns/types';
import {
  scheduleBeep,
  scheduleClick,
  scheduleHat,
  scheduleKick,
  scheduleSnare,
  scheduleTom,
} from './clickSynth';

export type SoundTheme = 'tones' | 'groove';

type Drum = 'kick' | 'snare' | 'hat' | 'tom';

// A "groove" is just an assignment of onset-index → drum. The scheduler picks
// one of these per round so the player hears variety. They tile cyclically
// across the pattern.
const GROOVES: Drum[][] = [
  ['kick', 'hat', 'snare', 'hat'],
  ['kick', 'kick', 'snare', 'hat'],
  ['kick', 'hat', 'hat', 'snare'],
  ['snare', 'hat', 'kick', 'hat'],
  ['kick', 'tom', 'snare', 'tom'],
  ['kick', 'hat', 'snare', 'tom', 'kick', 'hat', 'snare', 'hat'],
  ['hat', 'kick', 'hat', 'snare', 'hat', 'kick', 'hat', 'snare'],
];

export function pickGrooveIndex(): number {
  return Math.floor(Math.random() * GROOVES.length);
}

function scheduleDrum(ctx: AudioContext, when: number, drum: Drum): void {
  switch (drum) {
    case 'kick':
      scheduleKick(ctx, when);
      break;
    case 'snare':
      scheduleSnare(ctx, when);
      break;
    case 'hat':
      scheduleHat(ctx, when);
      break;
    case 'tom':
      scheduleTom(ctx, when);
      break;
  }
}

export function schedulePattern(
  ctx: AudioContext,
  pattern: Pattern,
  startTime: number,
  theme: SoundTheme = 'tones',
  grooveIdx: number = 0,
): number {
  const groove = GROOVES[grooveIdx % GROOVES.length];
  for (let i = 0; i < pattern.onsets.length; i++) {
    const when = startTime + pattern.onsets[i];
    if (theme === 'groove') {
      scheduleDrum(ctx, when, groove[i % groove.length]);
    } else {
      scheduleClick(ctx, when);
    }
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
