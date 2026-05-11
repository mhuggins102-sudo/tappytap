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
  installResumeHandlers();
  return eng;
}

export function getEngine(): AudioEngine | null {
  return engine;
}

let resumeHandlersInstalled = false;

function installResumeHandlers(): void {
  if (resumeHandlersInstalled) return;
  resumeHandlersInstalled = true;

  const tryResume = () => {
    if (!engine) return;
    if (engine.ctx.state === 'suspended') {
      void engine.ctx
        .resume()
        .then(() => engine?.recaptureClockOffset())
        .catch(() => {
          // Some browsers refuse to resume without a user gesture; the
          // pointerdown handler below will retry on the next tap.
        });
    } else {
      // Already 'running'; refresh the clock offset so timestamps line up
      // with audio time again after the tab was suspended.
      engine.recaptureClockOffset();
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryResume();
  });
  window.addEventListener('pointerdown', tryResume, { capture: true });
}
