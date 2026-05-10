interface AudioEngine {
  ctx: AudioContext;
  audioTimeFromEvent(evt: { timeStamp: number }): number;
  audioTimeNow(): number;
  recaptureClockOffset(): void;
}

let engine: AudioEngine | null = null;

type AudioContextCtor = typeof AudioContext;
function getAudioContextCtor(): AudioContextCtor {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio API is not supported in this browser');
  return Ctor;
}

function captureOffset(ctx: AudioContext): number {
  return ctx.currentTime - performance.now() / 1000;
}

export async function ensureAudioEngine(): Promise<AudioEngine> {
  if (engine && engine.ctx.state !== 'closed') {
    if (engine.ctx.state === 'suspended') {
      await engine.ctx.resume();
      engine.recaptureClockOffset();
    }
    return engine;
  }

  const Ctor = getAudioContextCtor();
  const ctx = new Ctor({ latencyHint: 'interactive' });
  if (ctx.state === 'suspended') await ctx.resume();

  let offset = captureOffset(ctx);

  const eng: AudioEngine = {
    ctx,
    audioTimeFromEvent(evt) {
      return evt.timeStamp / 1000 + offset;
    },
    audioTimeNow() {
      return ctx.currentTime;
    },
    recaptureClockOffset() {
      offset = captureOffset(ctx);
    },
  };

  engine = eng;
  return eng;
}

export function getEngine(): AudioEngine | null {
  return engine;
}
