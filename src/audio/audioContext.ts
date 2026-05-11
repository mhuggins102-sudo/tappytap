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
  const ctx = newContext();
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Will retry on next user gesture.
    }
  }
  return wrap(ctx);
}

function newContext(): AudioContext {
  const Ctor = getAudioContextCtor();
  return new Ctor({ latencyHint: 'interactive' });
}

function wrap(ctx: AudioContext): AudioEngine {
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
 * Synchronously ensure a usable audio context exists inside this user
 * gesture. iOS Safari only honors AudioContext creation/resume when the
 * call originates directly from a gesture; awaited code paths lose that
 * standing. Call this at the top of click handlers, before any awaits.
 *
 * When the page is backgrounded and returned, the existing context can be
 * silently broken: resume() succeeds but no audio plays. The pointerdown
 * handler below drops the engine on the first tap after a hide event, and
 * this function then creates a fresh one *synchronously* inside the same
 * gesture so the subsequent async ensureAudioEngine() has nothing to do
 * across an await boundary.
 */
export function kickAudioSync(): void {
  if (engine && engine.ctx.state !== 'closed') {
    if (engine.ctx.state === 'suspended') {
      engine.ctx.resume().catch(() => {});
    }
    return;
  }
  try {
    const ctx = newContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    engine = wrap(ctx);
    installResumeHandlers();
  } catch {
    // ensureAudioEngine() async path will retry on the next tick.
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
