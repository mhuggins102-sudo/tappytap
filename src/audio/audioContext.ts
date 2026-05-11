interface AudioEngine {
  ctx: AudioContext;
  audioTimeFromEvent(evt: { timeStamp: number }): number;
  audioTimeNow(): number;
  recaptureClockOffset(): void;
}

let engine: AudioEngine | null = null;
let wasHidden = false;

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

async function createEngine(): Promise<AudioEngine> {
  const Ctor = getAudioContextCtor();
  const ctx = new Ctor({ latencyHint: 'interactive' });
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Will retry on next user gesture.
    }
  }
  let offset = captureOffset(ctx);
  return {
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
}

export async function ensureAudioEngine(): Promise<AudioEngine> {
  if (engine) {
    const state = engine.ctx.state;
    if (state === 'running') {
      return engine;
    }
    if (state === 'suspended') {
      try {
        await engine.ctx.resume();
        if (engine.ctx.state === 'running') {
          engine.recaptureClockOffset();
          return engine;
        }
      } catch {
        // fall through to recreate
      }
    }
    // closed, interrupted, or resume didn't take effect — drop it and start fresh.
    try {
      await engine.ctx.close();
    } catch {
      // ignore
    }
    engine = null;
  }

  engine = await createEngine();
  installResumeHandlers();
  return engine;
}

export function getEngine(): AudioEngine | null {
  return engine;
}

/**
 * Synchronously kick the audio context inside a user gesture handler. iOS
 * Safari only honors resume()/audio scheduling when the call originates
 * directly from a gesture; awaiting earlier in the call chain loses that
 * standing. Call this at the top of click handlers, before any awaits.
 */
export function kickAudioSync(): void {
  if (!engine) return;
  const state = engine.ctx.state;
  if (state === 'suspended') {
    engine.ctx.resume().catch(() => {});
  }
}

let resumeHandlersInstalled = false;

function installResumeHandlers(): void {
  if (resumeHandlersInstalled) return;
  resumeHandlersInstalled = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      wasHidden = true;
      return;
    }
    if (!engine) return;
    if (engine.ctx.state === 'running') {
      engine.recaptureClockOffset();
    }
    // We don't try resume() here — many browsers refuse outside a user
    // gesture. The pointerdown handler below will retry on the next tap,
    // and ensureAudioEngine() will recreate the context if needed.
  });

  window.addEventListener(
    'pointerdown',
    () => {
      if (!engine) return;
      if (wasHidden && engine.ctx.state !== 'running') {
        // Most reliable fix on iOS after a long background: drop and recreate.
        // Doing it on pointerdown ensures the new context is created inside
        // a user gesture, so its resume() is allowed.
        wasHidden = false;
        const old = engine;
        engine = null;
        try {
          void old.ctx.close();
        } catch {
          // ignore
        }
        return;
      }
      if (engine.ctx.state === 'suspended') {
        engine.ctx.resume().then(() => engine?.recaptureClockOffset()).catch(() => {});
      }
    },
    { capture: true },
  );
}
