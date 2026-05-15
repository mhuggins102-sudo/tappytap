import type { Pattern } from '../patterns/types';
import { ensureAudioEngine, resetOutputNode } from './audioContext';
import {
  scheduleBeep,
  scheduleBell,
  scheduleBikeHorn,
  scheduleClap,
  scheduleClave,
  scheduleClick,
  scheduleCowbell,
  scheduleHat,
  scheduleHiTom,
  scheduleKalimba,
  scheduleKazoo,
  scheduleKick,
  scheduleMarimba,
  schedulePiano,
  scheduleRhodes,
  scheduleRide,
  scheduleRim,
  scheduleShaker,
  scheduleSnare,
  scheduleSteelPan,
  scheduleSynthBass,
  scheduleSynthLead,
  scheduleTom,
  scheduleTriangle,
  scheduleWhoopee,
} from './clickSynth';
import type { Instrument, SoundTheme } from '../lib/storage';

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

// Drum grooves: each entry tiles cyclically across the pattern. Mixed kit
// styles so different palettes appear at random.
const DRUM_GROOVES: Drum[][] = [
  ['kick', 'hat', 'snare', 'hat'],
  ['kick', 'kick', 'snare', 'hat'],
  ['kick', 'hat', 'hat', 'snare'],
  ['snare', 'hat', 'kick', 'hat'],
  ['kick', 'tom', 'snare', 'tom'],
  ['kick', 'rim', 'snare', 'rim'],
  ['kick', 'shaker', 'clap', 'shaker'],
  ['kick', 'hat', 'clap', 'hat'],
  ['kick', 'cowbell', 'snare', 'cowbell'],
  ['kick', 'hat', 'snare', 'clap'],
  ['cowbell', 'clave', 'cowbell', 'clave'],
  ['clave', 'shaker', 'clave', 'shaker'],
  ['kick', 'clave', 'snare', 'clave'],
  ['cowbell', 'hat', 'snare', 'hat'],
  ['shaker', 'shaker', 'clap', 'shaker'],
  ['kick', 'ride', 'snare', 'ride'],
  ['ride', 'ride', 'snare', 'ride'],
  ['kick', 'hat', 'snare', 'tom', 'kick', 'hat', 'snare', 'hat'],
  ['hat', 'kick', 'hat', 'snare', 'hat', 'kick', 'hat', 'snare'],
  ['kick', 'hiTom', 'hat', 'snare', 'kick', 'tom', 'hat', 'snare'],
  ['kick', 'shaker', 'clap', 'shaker', 'kick', 'shaker', 'snare', 'shaker'],
  ['kick', 'clave', 'cowbell', 'clave', 'snare', 'clave', 'cowbell', 'clave'],
  ['triangle', 'ride', 'snare', 'ride', 'triangle', 'ride', 'snare', 'ride'],
  ['kick', 'rim', 'hat', 'rim', 'snare', 'rim', 'hat', 'rim'],
  ['kick', 'hat', 'hat', 'snare', 'hat', 'hat', 'kick', 'snare'],
];

// Melodic grooves: each entry is a sequence of voice indices into the
// current instrument's scale. The same grooves work for any pitched
// instrument; the audible result depends on which note palette is used.
const MELODIC_GROOVES: number[][] = [
  [0, 2, 4, 2],
  [0, 4, 2, 5],
  [0, 1, 2, 3, 4, 3, 2, 1],
  [0, 2, 0, 4, 0, 2, 4, 2],
  [2, 4, 0, 2, 2, 4, 0, 2],
  [0, 2, 4, 5, 4, 2, 1, 0],
  [4, 2, 1, 0, 1, 2, 4, 5],
  [0, 0, 2, 0, 4, 2, 0, 0],
  [0, 4, 2, 4, 0, 5, 4, 2],
  [2, 0, 2, 4, 5, 4, 2, 0],
];

// C major pentatonic-like scales per instrument register.
const MARIMBA_FREQS = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C5..C6
const SYNTH_FREQS = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25]; // C4..C5
const PIANO_FREQS = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99]; // C4 E4 G4 C5 E5 G5
// Rhodes sits a bit lower than the bright piano voicing — it reads
// more "soul jazz" in a mid-low register.
const RHODES_FREQS = [196.0, 246.94, 293.66, 392.0, 493.88, 587.33]; // G3 B3 D4 G4 B4 D5
const BASS_FREQS = [65.41, 73.42, 82.41, 98.0, 110.0, 130.81]; // C2..C3
// Bell sits in a higher register where the inharmonic shimmer reads as
// glockenspiel / chime rather than tubular bell.
const BELL_FREQS = [659.25, 783.99, 880.0, 1046.5, 1318.51, 1567.98]; // E5..G6
// Kalimba sits in a mid register where the warm sine partials sound
// most like a thumb-piano tine rather than glockenspiel.
const KALIMBA_FREQS = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99]; // C4..G5
// Steel pan: bright mid register with its characteristic shimmer.
const STEEL_PAN_FREQS = [293.66, 369.99, 440.0, 523.25, 622.25, 740.0]; // D4..F#5
// Kazoo lives in the mid-range "humming" register where the buzz reads
// most clearly. Bicycle horn alternates between two-ish notes — a low
// "ah" and a high "oo" — for that bulb-honk back-and-forth feel.
const KAZOO_FREQS = [392.0, 440.0, 523.25, 587.33, 659.25, 783.99]; // G4..G5
const BIKE_HORN_FREQS = [349.23, 523.25, 349.23, 523.25, 349.23, 523.25]; // F4 / C5 alternating

function isDrumInstrument(instrument: Instrument): boolean {
  return instrument === 'drums';
}

// Whoopee has no musical scale — every "voice" plays the same noise burst.
function isNoiseInstrument(instrument: Instrument): boolean {
  return instrument === 'whoopee';
}

export function pickGrooveIndex(instrument: Instrument): number {
  const grooves = isDrumInstrument(instrument) ? DRUM_GROOVES : MELODIC_GROOVES;
  return Math.floor(Math.random() * grooves.length);
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

function scheduleMelodicVoice(
  ctx: AudioContext,
  when: number,
  instrument: Exclude<Instrument, 'drums' | 'whoopee'>,
  voiceIdx: number,
): void {
  const scale =
    instrument === 'bass'
      ? BASS_FREQS
      : instrument === 'piano'
        ? PIANO_FREQS
        : instrument === 'rhodes'
          ? RHODES_FREQS
          : instrument === 'synth'
            ? SYNTH_FREQS
            : instrument === 'kazoo'
              ? KAZOO_FREQS
              : instrument === 'bikeHorn'
                ? BIKE_HORN_FREQS
                : instrument === 'bell'
                  ? BELL_FREQS
                  : instrument === 'kalimba'
                    ? KALIMBA_FREQS
                    : instrument === 'steelPan'
                      ? STEEL_PAN_FREQS
                      : MARIMBA_FREQS;
  const freq = scale[voiceIdx % scale.length];
  switch (instrument) {
    case 'marimba':
      scheduleMarimba(ctx, when, freq);
      break;
    case 'bass':
      scheduleSynthBass(ctx, when, freq);
      break;
    case 'synth':
      scheduleSynthLead(ctx, when, freq);
      break;
    case 'piano':
      schedulePiano(ctx, when, freq);
      break;
    case 'rhodes':
      scheduleRhodes(ctx, when, freq);
      break;
    case 'bell':
      scheduleBell(ctx, when, freq);
      break;
    case 'kalimba':
      scheduleKalimba(ctx, when, freq);
      break;
    case 'steelPan':
      scheduleSteelPan(ctx, when, freq);
      break;
    case 'kazoo':
      scheduleKazoo(ctx, when, freq);
      break;
    case 'bikeHorn':
      scheduleBikeHorn(ctx, when, freq);
      break;
  }
}

function scheduleGrooveHit(
  ctx: AudioContext,
  when: number,
  instrument: Instrument,
  grooveIdx: number,
  positionIdx: number,
): void {
  if (isDrumInstrument(instrument)) {
    const groove = DRUM_GROOVES[grooveIdx % DRUM_GROOVES.length];
    scheduleDrum(ctx, when, groove[positionIdx % groove.length]);
    return;
  }
  if (isNoiseInstrument(instrument)) {
    scheduleWhoopee(ctx, when);
    return;
  }
  const groove = MELODIC_GROOVES[grooveIdx % MELODIC_GROOVES.length];
  const voiceIdx = groove[positionIdx % groove.length];
  scheduleMelodicVoice(
    ctx,
    when,
    instrument as Exclude<Instrument, 'drums' | 'whoopee'>,
    voiceIdx,
  );
}

export function playTapFeedback(
  ctx: AudioContext,
  theme: SoundTheme,
  instrument: Instrument,
  grooveIdx: number,
  tapIndex: number,
): void {
  if (theme === 'groove') {
    scheduleGrooveHit(ctx, ctx.currentTime, instrument, grooveIdx, tapIndex);
  } else {
    scheduleClick(ctx, ctx.currentTime, { freq: 1000, gain: 0.5, decaySec: 0.05 });
  }
}

export function schedulePattern(
  ctx: AudioContext,
  pattern: Pattern,
  startTime: number,
  theme: SoundTheme = 'tones',
  instrument: Instrument = 'drums',
  grooveIdx: number = 0,
): number {
  for (let i = 0; i < pattern.onsets.length; i++) {
    const when = startTime + pattern.onsets[i];
    if (theme === 'groove') {
      scheduleGrooveHit(ctx, when, instrument, grooveIdx, i);
    } else {
      scheduleClick(ctx, when);
    }
  }
  return startTime + pattern.durationSec;
}

/**
 * Play a fixed list of tap times back through the current sound theme.
 * When theme is 'groove', uses the supplied instrument + groove index
 * (matching how the round was played). When theme is 'tones', plays
 * plain clicks at the same times.
 *
 * Resets the master output first so back-to-back presses don't stack
 * playbacks on top of each other.
 */
export async function playTapSequence(
  taps: number[],
  theme: SoundTheme,
  instrument: Instrument,
  grooveIdx: number,
): Promise<void> {
  if (taps.length === 0) return;
  try {
    const eng = await ensureAudioEngine();
    const ctx = eng.ctx;
    resetOutputNode(ctx);
    // Small lead-in so the very first scheduled note isn't truncated
    // by an in-flight audio graph reconnection.
    const leadIn = 0.1;
    const start = ctx.currentTime + leadIn;
    for (let i = 0; i < taps.length; i++) {
      if (theme === 'groove') {
        scheduleGrooveHit(ctx, start + taps[i], instrument, grooveIdx, i);
      } else {
        scheduleClick(ctx, start + taps[i]);
      }
    }
  } catch {
    // Audio context may not be available; swallow.
  }
}
export async function previewInstrument(instrument: Instrument): Promise<void> {
  try {
    const eng = await ensureAudioEngine();
    const ctx = eng.ctx;
    // Mute any prior preview audio so back-to-back selections don't
    // smear together. Safe to do here because the settings panel is
    // only ever open outside an active round.
    resetOutputNode(ctx);
    const grooveIdx = pickGrooveIndex(instrument);
    const startTime = ctx.currentTime + 0.05;
    // 4 onsets ~180ms apart so the user hears the timbre's attack and
    // a bit of its tail without holding the dropdown open too long.
    const dt = 0.18;
    for (let i = 0; i < 4; i++) {
      scheduleGrooveHit(ctx, startTime + i * dt, instrument, grooveIdx, i);
    }
  } catch {
    // Audio context may not be available yet (e.g., before the user
    // has made any gesture). Silently swallow — the selection still
    // saves; the player just won't hear a preview that one time.
  }
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

export type { SoundTheme, Instrument } from '../lib/storage';
