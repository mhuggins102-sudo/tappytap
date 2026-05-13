import { getOutputNode } from './audioContext';

export interface ClickOptions {
  freq: number;
  gain: number;
  decaySec: number;
}

const DEFAULTS: ClickOptions = { freq: 1000, gain: 0.6, decaySec: 0.05 };

export function scheduleClick(ctx: AudioContext, when: number, opts: Partial<ClickOptions> = {}): void {
  const { freq, gain, decaySec } = { ...DEFAULTS, ...opts };
  const start = Math.max(when, ctx.currentTime);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, start + decaySec);

  osc.connect(env).connect(getOutputNode(ctx));
  osc.start(start);
  osc.stop(start + decaySec + 0.01);
}

export function scheduleDownbeat(ctx: AudioContext, when: number): void {
  scheduleClick(ctx, when, { freq: 1400, gain: 0.65, decaySec: 0.06 });
}

export interface BeepOptions {
  freq: number;
  gain: number;
  durationSec: number;
}

export function scheduleBeep(ctx: AudioContext, when: number, opts: BeepOptions): void {
  const { freq, gain, durationSec } = opts;
  const start = Math.max(when, ctx.currentTime);
  const attack = 0.02;
  const release = 0.08;
  const sustainEnd = Math.max(start + attack, start + durationSec - release);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + attack);
  env.gain.linearRampToValueAtTime(gain, sustainEnd);
  env.gain.linearRampToValueAtTime(0, start + durationSec);

  osc.connect(env).connect(getOutputNode(ctx));
  osc.start(start);
  osc.stop(start + durationSec + 0.02);
}

export function playFeedbackClick(ctx: AudioContext): void {
  scheduleClick(ctx, ctx.currentTime, { freq: 1000, gain: 0.5, decaySec: 0.05 });
}

function noiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Kick: a high-frequency click transient layered over a pitched sine
// thump. The click gives a punchy attack ("beater-on-head" definition),
// the thump is the sub-bass body that drops from 180 Hz to 40 Hz.
export function scheduleKick(ctx: AudioContext, when: number): void {
  const start = Math.max(when, ctx.currentTime);
  const mix = ctx.createGain();
  mix.gain.value = 1;
  mix.connect(getOutputNode(ctx));

  // Click — sharp bandpassed noise for "snap".
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.01);
  const clickFilt = ctx.createBiquadFilter();
  clickFilt.type = 'bandpass';
  clickFilt.frequency.value = 3000;
  clickFilt.Q.value = 1.5;
  const clickEnv = ctx.createGain();
  clickEnv.gain.setValueAtTime(0, start);
  clickEnv.gain.linearRampToValueAtTime(0.4, start + 0.001);
  clickEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.008);
  click.connect(clickFilt).connect(clickEnv).connect(mix);
  click.start(start);
  click.stop(start + 0.015);

  // Body — sine sweep from 180 Hz to 40 Hz.
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(180, start);
  body.frequency.exponentialRampToValueAtTime(40, start + 0.1);
  const bodyEnv = ctx.createGain();
  bodyEnv.gain.setValueAtTime(0.0001, start);
  bodyEnv.gain.exponentialRampToValueAtTime(0.85, start + 0.004);
  bodyEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
  body.connect(bodyEnv).connect(mix);
  body.start(start);
  body.stop(start + 0.28);
}

// Snare: three layers — the pitched drumhead "body", the buzzing
// "wires" underneath (highpassed noise), and a very brief high-shelf
// crackle that gives the initial "smack". The crackle is what makes
// the snare read as sharp rather than a fuzzy hiss.
export function scheduleSnare(ctx: AudioContext, when: number): void {
  const start = Math.max(when, ctx.currentTime);
  const mix = ctx.createGain();
  mix.gain.value = 1;
  mix.connect(getOutputNode(ctx));

  // Drumhead body — pitched triangle sweep.
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(230, start);
  body.frequency.exponentialRampToValueAtTime(140, start + 0.05);
  const bodyEnv = ctx.createGain();
  bodyEnv.gain.setValueAtTime(0.0001, start);
  bodyEnv.gain.exponentialRampToValueAtTime(0.36, start + 0.003);
  bodyEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
  body.connect(bodyEnv).connect(mix);
  body.start(start);
  body.stop(start + 0.1);

  // Snare wires — highpassed noise.
  const wires = ctx.createBufferSource();
  wires.buffer = noiseBuffer(ctx, 0.2);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1500;
  const wiresEnv = ctx.createGain();
  wiresEnv.gain.setValueAtTime(0.0001, start);
  wiresEnv.gain.exponentialRampToValueAtTime(0.5, start + 0.003);
  wiresEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
  wires.connect(hp).connect(wiresEnv).connect(mix);
  wires.start(start);
  wires.stop(start + 0.2);

  // Initial smack — very brief high-shelf transient.
  const crackle = ctx.createBufferSource();
  crackle.buffer = noiseBuffer(ctx, 0.01);
  const crackleFilt = ctx.createBiquadFilter();
  crackleFilt.type = 'highpass';
  crackleFilt.frequency.value = 4000;
  const crackleEnv = ctx.createGain();
  crackleEnv.gain.setValueAtTime(0, start);
  crackleEnv.gain.linearRampToValueAtTime(0.25, start + 0.001);
  crackleEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.01);
  crackle.connect(crackleFilt).connect(crackleEnv).connect(mix);
  crackle.start(start);
  crackle.stop(start + 0.015);
}

export function scheduleHat(ctx: AudioContext, when: number): void {
  const start = Math.max(when, ctx.currentTime);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.08);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.28, start + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
  noise.connect(hp).connect(env).connect(getOutputNode(ctx));
  noise.start(start);
  noise.stop(start + 0.07);
}

export function scheduleTom(ctx: AudioContext, when: number): void {
  const start = Math.max(when, ctx.currentTime);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, start);
  osc.frequency.exponentialRampToValueAtTime(110, start + 0.15);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.55, start + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
  osc.connect(env).connect(getOutputNode(ctx));
  osc.start(start);
  osc.stop(start + 0.25);
}

export function scheduleHiTom(ctx: AudioContext, when: number): void {
  const start = Math.max(when, ctx.currentTime);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(330, start);
  osc.frequency.exponentialRampToValueAtTime(180, start + 0.12);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.5, start + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
  osc.connect(env).connect(getOutputNode(ctx));
  osc.start(start);
  osc.stop(start + 0.2);
}

export function scheduleClap(ctx: AudioContext, when: number): void {
  // Three quick noise bursts stacked, band-passed in the clap range.
  const start = Math.max(when, ctx.currentTime);
  const offsets = [0, 0.012, 0.024];
  for (const off of offsets) {
    const t = start + off;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 0.06);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 1.5;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.45, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    noise.connect(bp).connect(env).connect(getOutputNode(ctx));
    noise.start(t);
    noise.stop(t + 0.07);
  }
}

export function scheduleCowbell(ctx: AudioContext, when: number): void {
  // Two detuned square oscillators band-passed for a metallic bell tone.
  const start = Math.max(when, ctx.currentTime);
  const freqs = [560, 845];
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.32, start + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 700;
  bp.Q.value = 4;
  env.connect(getOutputNode(ctx));
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(f, start);
    osc.connect(bp).connect(env);
    osc.start(start);
    osc.stop(start + 0.18);
  }
}

export function scheduleRim(ctx: AudioContext, when: number): void {
  // Short woody click — band-passed square plus a tiny noise transient.
  const start = Math.max(when, ctx.currentTime);
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1500, start);
  const oscEnv = ctx.createGain();
  oscEnv.gain.setValueAtTime(0.0001, start);
  oscEnv.gain.exponentialRampToValueAtTime(0.3, start + 0.001);
  oscEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.04);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500;
  bp.Q.value = 5;
  osc.connect(bp).connect(oscEnv).connect(getOutputNode(ctx));
  osc.start(start);
  osc.stop(start + 0.06);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.03);
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0.18, start);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.025);
  noise.connect(noiseEnv).connect(getOutputNode(ctx));
  noise.start(start);
  noise.stop(start + 0.035);
}

export function scheduleRide(ctx: AudioContext, when: number): void {
  // Long-decay band-passed noise with a metallic shimmer.
  const start = Math.max(when, ctx.currentTime);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.3);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5500;
  const peak = ctx.createBiquadFilter();
  peak.type = 'peaking';
  peak.frequency.value = 9500;
  peak.Q.value = 6;
  peak.gain.value = 9;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.22, start + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
  noise.connect(hp).connect(peak).connect(env).connect(getOutputNode(ctx));
  noise.start(start);
  noise.stop(start + 0.3);
}

export function scheduleShaker(ctx: AudioContext, when: number): void {
  const start = Math.max(when, ctx.currentTime);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.1);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4000;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.22, start + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
  noise.connect(hp).connect(env).connect(getOutputNode(ctx));
  noise.start(start);
  noise.stop(start + 0.1);
}

export function scheduleClave(ctx: AudioContext, when: number): void {
  const start = Math.max(when, ctx.currentTime);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(2500, start);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.4, start + 0.001);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.04);
  osc.connect(env).connect(getOutputNode(ctx));
  osc.start(start);
  osc.stop(start + 0.05);
}

// Marimba: warm pitched mallet. Sine partials at the inharmonic mode
// ratios of a real marimba bar (~1 : 3.98 : 9.95), a soft mallet click
// transient for the wood-on-bar attack, plus a quiet odd-harmonic
// "color" partial to add body. Each partial decays at its own rate
// (lower partials sustain, upper partials fade quickly).
export function scheduleMarimba(ctx: AudioContext, when: number, freq: number): void {
  const start = Math.max(when, ctx.currentTime);
  const mix = ctx.createGain();
  mix.gain.value = 1;
  mix.connect(getOutputNode(ctx));

  // Mallet "tock" — lowpassed noise transient that disappears almost
  // immediately. Without this the bar sounds like it's struck out of
  // nowhere; with it you hear the mallet contact.
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.03);
  const noiseFilt = ctx.createBiquadFilter();
  noiseFilt.type = 'lowpass';
  noiseFilt.frequency.value = 2200;
  noiseFilt.Q.value = 1.2;
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0, start);
  noiseEnv.gain.linearRampToValueAtTime(0.05, start + 0.002);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.02);
  noise.connect(noiseFilt).connect(noiseEnv).connect(mix);
  noise.start(start);
  noise.stop(start + 0.03);

  // Bar partials. Marimba bars are usually undercut so the second mode
  // tunes very close to 4× the fundamental and the third mode to ~10×.
  // The extra 6× partial is a softer color tone that fills out the body.
  const partials: Array<[number, number, number]> = [
    [1.0, 0.42, 0.7],
    [3.98, 0.18, 0.45],
    [9.95, 0.05, 0.22],
    [6.0, 0.04, 0.3],
  ];
  for (const [ratio, gain, decay] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * ratio, start);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(env).connect(mix);
    osc.start(start);
    osc.stop(start + decay + 0.02);
  }
}

// Synth bass: a layered voice with a saw body filtered down, a sub-octave
// sine for thump, and a tiny bandpassed noise transient on attack for
// definition. Sounds noticeably fatter than a single-osc saw.
export function scheduleSynthBass(ctx: AudioContext, when: number, freq: number): void {
  const start = Math.max(when, ctx.currentTime);
  const mix = ctx.createGain();
  mix.gain.value = 1;
  mix.connect(getOutputNode(ctx));

  // Body: sawtooth through a resonant lowpass that sweeps down.
  const body = ctx.createOscillator();
  body.type = 'sawtooth';
  body.frequency.setValueAtTime(freq, start);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(1200, start);
  filt.frequency.exponentialRampToValueAtTime(180, start + 0.32);
  filt.Q.value = 6;
  const bodyEnv = ctx.createGain();
  bodyEnv.gain.setValueAtTime(0.0001, start);
  bodyEnv.gain.exponentialRampToValueAtTime(0.36, start + 0.005);
  bodyEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
  body.connect(filt).connect(bodyEnv).connect(mix);
  body.start(start);
  body.stop(start + 0.45);

  // Sub: sine an octave below the fundamental adds a felt low end.
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(freq * 0.5, start);
  const subEnv = ctx.createGain();
  subEnv.gain.setValueAtTime(0.0001, start);
  subEnv.gain.exponentialRampToValueAtTime(0.22, start + 0.005);
  subEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
  sub.connect(subEnv).connect(mix);
  sub.start(start);
  sub.stop(start + 0.4);

  // Pluck transient: a brief bandpassed noise burst gives each note a
  // crisper "thwack" attack, the way a real bass guitar or synth pluck
  // articulates each pitch.
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.02);
  const noiseFilt = ctx.createBiquadFilter();
  noiseFilt.type = 'bandpass';
  noiseFilt.frequency.value = Math.min(4000, freq * 8);
  noiseFilt.Q.value = 2;
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0, start);
  noiseEnv.gain.linearRampToValueAtTime(0.06, start + 0.002);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.025);
  noise.connect(noiseFilt).connect(noiseEnv).connect(mix);
  noise.start(start);
  noise.stop(start + 0.03);
}

// Rhodes-style electric piano: a "bar" sine fundamental that sustains
// for a moment plus a quick-decaying "tine" partial four octaves up.
// Add a soft second partial slightly detuned for color. Approximates
// the iconic bell-meets-sine voicing of a Fender Rhodes.
export function scheduleRhodes(ctx: AudioContext, when: number, freq: number): void {
  const start = Math.max(when, ctx.currentTime);
  const mix = ctx.createGain();
  mix.gain.value = 1;
  mix.connect(getOutputNode(ctx));

  // Bar fundamental — long sustain.
  const bar = ctx.createOscillator();
  bar.type = 'sine';
  bar.frequency.setValueAtTime(freq, start);
  const barEnv = ctx.createGain();
  barEnv.gain.setValueAtTime(0.0001, start);
  barEnv.gain.exponentialRampToValueAtTime(0.32, start + 0.008);
  barEnv.gain.exponentialRampToValueAtTime(0.0001, start + 1.2);
  bar.connect(barEnv).connect(mix);
  bar.start(start);
  bar.stop(start + 1.25);

  // Tine — sharp bell-like attack two octaves up that fades fast.
  const tine = ctx.createOscillator();
  tine.type = 'sine';
  tine.frequency.setValueAtTime(freq * 4, start);
  const tineEnv = ctx.createGain();
  tineEnv.gain.setValueAtTime(0.0001, start);
  tineEnv.gain.exponentialRampToValueAtTime(0.18, start + 0.003);
  tineEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
  tine.connect(tineEnv).connect(mix);
  tine.start(start);
  tine.stop(start + 0.27);

  // Color partial — slightly-detuned octave for warmth.
  const color = ctx.createOscillator();
  color.type = 'sine';
  color.frequency.setValueAtTime(freq * 2.005, start);
  const colorEnv = ctx.createGain();
  colorEnv.gain.setValueAtTime(0.0001, start);
  colorEnv.gain.exponentialRampToValueAtTime(0.1, start + 0.005);
  colorEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.8);
  color.connect(colorEnv).connect(mix);
  color.start(start);
  color.stop(start + 0.85);
}

// Synth lead: filtered square wave with a slow filter sweep down.
export function scheduleSynthLead(ctx: AudioContext, when: number, freq: number): void {
  const start = Math.max(when, ctx.currentTime);
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, start);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(2400, start);
  filt.frequency.exponentialRampToValueAtTime(900, start + 0.45);
  filt.Q.value = 2;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.16, start + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
  osc.connect(filt).connect(env).connect(getOutputNode(ctx));
  osc.start(start);
  osc.stop(start + 0.45);
}

// Piano: additive synthesis with slightly-stretched (inharmonic) sine
// partials plus a brief percussive noise burst representing the hammer
// strike. Each partial gets its own decay: the fundamental sustains the
// longest, higher partials fall off sooner, which is what real piano
// strings do. Closer in voicing to an actual piano than the original
// triangle+saw blend.
export function schedulePiano(ctx: AudioContext, when: number, freq: number): void {
  const start = Math.max(when, ctx.currentTime);
  const mix = ctx.createGain();
  mix.gain.value = 1;

  // Hammer attack — bandpassed noise transient centered on a multiple of
  // the fundamental. Adds the "thunk" you hear before the string sings.
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.05);
  const noiseFilt = ctx.createBiquadFilter();
  noiseFilt.type = 'bandpass';
  noiseFilt.frequency.value = Math.min(8000, freq * 4);
  noiseFilt.Q.value = 1.5;
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0, start);
  noiseEnv.gain.linearRampToValueAtTime(0.07, start + 0.003);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.04);
  noise.connect(noiseFilt).connect(noiseEnv).connect(mix);
  noise.start(start);
  noise.stop(start + 0.06);

  // Inharmonic partials. Ratios deviate from pure integer multiples to
  // mimic the stretch in real piano strings; decays decrease with
  // partial number for a natural roll-off.
  const partials: Array<[number, number, number]> = [
    [1.000, 0.30, 1.3],
    [2.005, 0.18, 0.85],
    [3.012, 0.10, 0.6],
    [4.025, 0.06, 0.4],
    [5.04, 0.035, 0.28],
  ];
  for (const [ratio, gain, decay] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * ratio, start);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(env).connect(mix);
    osc.start(start);
    osc.stop(start + decay + 0.02);
  }
  mix.connect(getOutputNode(ctx));
}

// Kalimba (thumb piano): clean sine partials with a soft pluck
// transient. Lower partials sustain noticeably longer than higher ones,
// giving the gentle "bonk-bonk" character of a thumb-plucked tine.
export function scheduleKalimba(ctx: AudioContext, when: number, freq: number): void {
  const start = Math.max(when, ctx.currentTime);
  const mix = ctx.createGain();
  mix.gain.value = 1;
  mix.connect(getOutputNode(ctx));

  // Soft pluck — short lowpassed noise transient.
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.015);
  const noiseFilt = ctx.createBiquadFilter();
  noiseFilt.type = 'lowpass';
  noiseFilt.frequency.value = 4000;
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0, start);
  noiseEnv.gain.linearRampToValueAtTime(0.04, start + 0.002);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.015);
  noise.connect(noiseFilt).connect(noiseEnv).connect(mix);
  noise.start(start);
  noise.stop(start + 0.02);

  const partials: Array<[number, number, number]> = [
    [1.0, 0.4, 0.9],
    [2.0, 0.18, 0.5],
    [3.0, 0.08, 0.3],
    [4.0, 0.04, 0.2],
  ];
  for (const [ratio, gain, decay] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * ratio, start);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(env).connect(mix);
    osc.start(start);
    osc.stop(start + decay + 0.02);
  }
}

// Steel pan: bright, tropical melodic percussion. The defining feature
// is a 2nd-harmonic that's actually louder than the fundamental, plus
// strong odd-mode color. A tiny per-partial detune is applied
// deterministically per-call so the shimmer is consistent rather than
// random-jitter (using ratio-based mod, not Math.random, keeps it stable).
export function scheduleSteelPan(ctx: AudioContext, when: number, freq: number): void {
  const start = Math.max(when, ctx.currentTime);
  const mix = ctx.createGain();
  mix.gain.value = 1;
  mix.connect(getOutputNode(ctx));

  const partials: Array<[number, number, number]> = [
    [1.0, 0.2, 0.55],
    [2.0, 0.32, 0.5],
    [3.0, 0.1, 0.3],
    [4.0, 0.14, 0.35],
    [5.0, 0.06, 0.22],
  ];
  for (const [ratio, gain, decay] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    // Tiny deterministic detune based on the ratio so the partials
    // shimmer slightly out of phase with each other.
    const detune = 1 + (ratio % 0.013) * 0.002;
    osc.frequency.setValueAtTime(freq * ratio * detune, start);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(env).connect(mix);
    osc.start(start);
    osc.stop(start + decay + 0.02);
  }
}

// Bell: additive synthesis with inharmonic partials chosen to suggest
// a tubular bell / glockenspiel spectrum (hum, strike, minor-third,
// fifth, nominal, plus a couple of upper "shimmer" partials). Pure
// sines so the tone is clean and ringing rather than buzzy. Decays
// kept shorter than a real church bell so the sound works in grooves.
export function scheduleBell(ctx: AudioContext, when: number, freq: number): void {
  const start = Math.max(when, ctx.currentTime);
  const mix = ctx.createGain();
  mix.gain.value = 1;
  const partials: Array<[number, number, number]> = [
    [0.500, 0.14, 1.1],
    [1.000, 0.26, 0.9],
    [1.183, 0.20, 0.75],
    [1.500, 0.16, 0.65],
    [2.000, 0.12, 0.5],
    [2.667, 0.08, 0.35],
    [3.500, 0.05, 0.25],
  ];
  for (const [ratio, gain, decay] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * ratio, start);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(env).connect(mix);
    osc.start(start);
    osc.stop(start + decay + 0.02);
  }
  mix.connect(getOutputNode(ctx));
}

// Kazoo: nasal pitched buzz. Sawtooth through a tight bandpass filter
// near the formant region of a human "ooh" gives the characteristic
// buzzy-vocal timbre.
export function scheduleKazoo(ctx: AudioContext, when: number, freq: number): void {
  const start = Math.max(when, ctx.currentTime);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, start);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.max(700, freq * 2.4);
  bp.Q.value = 6;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.32, start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.18, start + 0.18);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
  osc.connect(bp).connect(env).connect(getOutputNode(ctx));
  osc.start(start);
  osc.stop(start + 0.38);
}

// Bicycle horn: short bulb-honk. A pair of square oscillators a fifth
// apart, with a tiny pitch slide and a slightly soft attack — sounds
// like a hand-squeezed rubber-bulb horn.
export function scheduleBikeHorn(ctx: AudioContext, when: number, freq: number): void {
  const start = Math.max(when, ctx.currentTime);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2000;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.34, start + 0.02);
  env.gain.linearRampToValueAtTime(0.3, start + 0.16);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
  lp.connect(env).connect(getOutputNode(ctx));
  for (const ratio of [1, 1.5]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    const f0 = freq * ratio;
    osc.frequency.setValueAtTime(f0 * 1.02, start);
    osc.frequency.exponentialRampToValueAtTime(f0, start + 0.06);
    osc.connect(lp);
    osc.start(start);
    osc.stop(start + 0.3);
  }
}

// Whoopee cushion: nasal noise-burst with a falling pitch sweep on a
// bandpass. Not pitched in a musical sense — every tap sounds the same.
export function scheduleWhoopee(ctx: AudioContext, when: number): void {
  const start = Math.max(when, ctx.currentTime);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.35);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(900, start);
  bp.frequency.exponentialRampToValueAtTime(180, start + 0.3);
  bp.Q.value = 4;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.55, start + 0.015);
  env.gain.linearRampToValueAtTime(0.35, start + 0.18);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.33);
  noise.connect(bp).connect(env).connect(getOutputNode(ctx));
  noise.start(start);
  noise.stop(start + 0.36);
}

export function scheduleTriangle(ctx: AudioContext, when: number): void {
  const start = Math.max(when, ctx.currentTime);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(3200, start);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.18, start + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
  osc.connect(env).connect(getOutputNode(ctx));
  osc.start(start);
  osc.stop(start + 0.42);
}
