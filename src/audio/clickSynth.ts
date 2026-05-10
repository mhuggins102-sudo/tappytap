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
