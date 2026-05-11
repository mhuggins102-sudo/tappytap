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

  osc.connect(env).connect(ctx.destination);
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

  osc.connect(env).connect(ctx.destination);
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

export function scheduleKick(ctx: AudioContext, when: number): void {
  const start = Math.max(when, ctx.currentTime);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, start);
  osc.frequency.exponentialRampToValueAtTime(45, start + 0.12);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(0.9, start + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
  osc.connect(env).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.25);
}

export function scheduleSnare(ctx: AudioContext, when: number): void {
  const start = Math.max(when, ctx.currentTime);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.2);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0.0001, start);
  noiseEnv.gain.exponentialRampToValueAtTime(0.55, start + 0.003);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
  noise.connect(hp).connect(noiseEnv).connect(ctx.destination);
  noise.start(start);
  noise.stop(start + 0.2);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, start);
  osc.frequency.exponentialRampToValueAtTime(140, start + 0.06);
  const oscEnv = ctx.createGain();
  oscEnv.gain.setValueAtTime(0.0001, start);
  oscEnv.gain.exponentialRampToValueAtTime(0.35, start + 0.003);
  oscEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
  osc.connect(oscEnv).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.1);
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
  noise.connect(hp).connect(env).connect(ctx.destination);
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
  osc.connect(env).connect(ctx.destination);
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
  osc.connect(env).connect(ctx.destination);
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
    noise.connect(bp).connect(env).connect(ctx.destination);
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
  env.connect(ctx.destination);
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
  osc.connect(bp).connect(oscEnv).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.06);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.03);
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0.18, start);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, start + 0.025);
  noise.connect(noiseEnv).connect(ctx.destination);
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
  noise.connect(hp).connect(peak).connect(env).connect(ctx.destination);
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
  noise.connect(hp).connect(env).connect(ctx.destination);
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
  osc.connect(env).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.05);
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
  osc.connect(env).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.42);
}
