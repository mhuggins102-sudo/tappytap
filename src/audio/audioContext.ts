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

let visibilityHandlerInstalled = false;
function installVisibilityHandler(): void {
  if (visibilityHandlerInstalled) return;
  visibilityHandlerInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && engine && engine.ctx.state === 'running') {
      // Currently-running context: just resync the event-time offset.
      engine.recaptureClockOffset();
    }
  });
}

/**
 * Synchronously prepare an AudioContext usable inside this user gesture.
 *
 * Strategy: every call creates a fresh AudioContext. iOS Safari is reliable
 * about honoring `new AudioContext()` + `resume()` inside a user gesture,
 * but unreliable about reviving a context that was suspended while the page
 * was backgrounded — `resume()` succeeds but the audio output stays dead.
 * Throwing the old context away and starting clean is simpler and more
 * reliable than trying to repair it.
 *
 * The old context (if any) is closed asynchronously; its close() returning
 * before the new context is created is not required for correctness.
 */
export function kickAudioSync(): void {
  if (engine) {
    const old = engine;
    engine = null;
    try {
      void old.ctx.close();
    } catch {
      // ignore
    }
  }
  try {
    const ctx = newContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    engine = wrap(ctx);
    installVisibilityHandler();
  } catch {
    // ensureAudioEngine() async path will retry.
  }
}

export async function ensureAudioEngine(): Promise<AudioEngine> {
  if (!engine) {
    const ctx = newContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // ignore
      }
    }
    engine = wrap(ctx);
    installVisibilityHandler();
    return engine;
  }
  if (engine.ctx.state === 'suspended') {
    try {
      await engine.ctx.resume();
    } catch {
      // ignore
    }
  }
  return engine;
}

export function getEngine(): AudioEngine | null {
  return engine;
}
