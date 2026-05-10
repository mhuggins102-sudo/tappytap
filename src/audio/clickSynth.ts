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
