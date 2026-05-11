import type { Pattern } from '../patterns/types';
import {
  scheduleBeep,
  scheduleClap,
  scheduleClave,
  scheduleClick,
  scheduleCowbell,
  scheduleHat,
  scheduleHiTom,
  scheduleKick,
  scheduleRide,
  scheduleRim,
  scheduleShaker,
  scheduleSnare,
  scheduleTom,
  scheduleTriangle,
} from './clickSynth';

export type SoundTheme = 'tones' | 'groove';

type Drum =
  | 'kick'
  | 'snare'
  | 'hat'
  | 'tom'
  | 'hiTom'
  | 'clap'
  | 'cowbell'
  | 'rim'
  | 'ride'
  | 'shaker'
  | 'clave'
  | 'triangle';

// Each groove is a cycle of drum hits tiled across the pattern. The scheduler
// picks one per round so the player hears variety. Mix simple 4-step rock
// patterns with longer Latin/hip-hop/electronic flavors so different sound
// palettes appear at random.
const GROOVES: Drum[][] = [
  // 4-step rock/pop kits
  ['kick', 'hat', 'snare', 'hat'],
  ['kick', 'kick', 'snare', 'hat'],
  ['kick', 'hat', 'hat', 'snare'],
  ['snare', 'hat', 'kick', 'hat'],
  ['kick', 'tom', 'snare', 'tom'],
  ['kick', 'rim', 'snare', 'rim'],
  // hip-hop / electronic
  ['kick', 'shaker', 'clap', 'shaker'],
  ['kick', 'hat', 'clap', 'hat'],
  ['kick', 'cowbell', 'snare', 'cowbell'],
  ['kick', 'hat', 'snare', 'clap'],
  // Latin / percussion
  ['cowbell', 'clave', 'cowbell', 'clave'],
  ['clave', 'shaker', 'clave', 'shaker'],
  ['kick', 'clave', 'snare', 'clave'],
  ['cowbell', 'hat', 'snare', 'hat'],
  ['shaker', 'shaker', 'clap', 'shaker'],
  // jazz / ride-driven
  ['kick', 'ride', 'snare', 'ride'],
  ['ride', 'ride', 'snare', 'ride'],
  // 8-step grooves with more variety
  ['kick', 'hat', 'snare', 'tom', 'kick', 'hat', 'snare', 'hat'],
  ['hat', 'kick', 'hat', 'snare', 'hat', 'kick', 'hat', 'snare'],
  ['kick', 'hiTom', 'hat', 'snare', 'kick', 'tom', 'hat', 'snare'],
  ['kick', 'shaker', 'clap', 'shaker', 'kick', 'shaker', 'snare', 'shaker'],
  ['kick', 'clave', 'cowbell', 'clave', 'snare', 'clave', 'cowbell', 'clave'],
  ['triangle', 'ride', 'snare', 'ride', 'triangle', 'ride', 'snare', 'ride'],
  ['kick', 'rim', 'hat', 'rim', 'snare', 'rim', 'hat', 'rim'],
  ['kick', 'hat', 'hat', 'snare', 'hat', 'hat', 'kick', 'snare'],
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
    case 'hiTom':
      scheduleHiTom(ctx, when);
      break;
    case 'clap':
      scheduleClap(ctx, when);
      break;
    case 'cowbell':
      scheduleCowbell(ctx, when);
      break;
    case 'rim':
      scheduleRim(ctx, when);
      break;
    case 'ride':
      scheduleRide(ctx, when);
      break;
    case 'shaker':
      scheduleShaker(ctx, when);
      break;
    case 'clave':
      scheduleClave(ctx, when);
      break;
    case 'triangle':
      scheduleTriangle(ctx, when);
      break;
  }
}

export function playTapFeedback(
  ctx: AudioContext,
  theme: SoundTheme,
  grooveIdx: number,
  tapIndex: number,
): void {
  if (theme === 'groove') {
    const groove = GROOVES[grooveIdx % GROOVES.length];
    scheduleDrum(ctx, ctx.currentTime, groove[tapIndex % groove.length]);
  } else {
    scheduleClick(ctx, ctx.currentTime, { freq: 1000, gain: 0.5, decaySec: 0.05 });
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
