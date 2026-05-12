interface AudioEngine {
  ctx: AudioContext;
  audioTimeFromEvent(evt: { timeStamp: number }): number;
  audioTimeNow(): number;
  recaptureClockOffset(): void;
}

let engine: AudioEngine | null = null;
let silentAudio: HTMLAudioElement | null = null;

type AudioContextCtor = typeof AudioContext;
function getAudioContextCtor(): AudioContextCtor {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio API is not supported in this browser');
  return Ctor;
}

/**
 * Build a tiny silent WAV as a base64 data URL — small enough to ship
 * inline (~2 KB) and self-contained so it works offline immediately.
 * iOS Safari decodes WAV data URLs reliably.
 */
function buildSilentAudioDataURL(): string {
  const sampleRate = 8000;
  const durationMs = 50;
  const samples = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = samples * 2; // 16-bit mono
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true); // file size − 8
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // fmt subchunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // PCM fmt subchunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  // data subchunk header (samples themselves are already zero)
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/**
 * Start (or restart) a silent HTML5 audio element looping in the
 * background. This sounds backwards but it's a standard iOS Safari
 * trick: with an `<audio>` element actively playing, the OS categorises
 * the page as "media playback" instead of "ambient sound", which means
 * Web Audio output goes through the media channel — and the media
 * channel ignores the iPhone's hardware ring/silent switch.
 *
 * Without this, a player with their iPhone's silent switch flipped
 * hears nothing from TappyTap even though the regular volume slider is
 * all the way up. Must be called inside a user gesture so .play()
 * resolves rather than getting blocked by autoplay policy.
 */
function ensureSilentAudioLoop(): void {
  if (silentAudio) {
    if (silentAudio.paused) silentAudio.play().catch(() => {});
    return;
  }
  const a = new Audio(buildSilentAudioDataURL());
  a.loop = true;
  a.preload = 'auto';
  a.setAttribute('playsinline', '');
  a.setAttribute('webkit-playsinline', '');
  a.volume = 1.0; // data is silent; volume here just keeps iOS confident audio is active
  silentAudio = a;
  a.play().catch(() => {
    // Autoplay can still be blocked in edge cases (not in a real user
    // gesture, e.g. after a setTimeout). The silent loop is a quality
    // improvement, not a hard requirement — Web Audio still works without it.
  });
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
    if (document.visibilityState !== 'visible') return;
    if (engine && engine.ctx.state === 'running') {
      // Currently-running context: just resync the event-time offset.
      engine.recaptureClockOffset();
    }
    // The silent loop usually pauses when the tab goes to the background.
    // Resume it so the page stays in "media playback" mode on return.
    if (silentAudio && silentAudio.paused) {
      silentAudio.play().catch(() => {});
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
  // Start the silent loop first, while we're definitely inside a user
  // gesture. iOS treats the page as media playback as soon as the audio
  // element calls .play(), which makes the Web Audio context we create
  // moments later route through the same media session.
  ensureSilentAudioLoop();
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
  // Cover the case where kickAudioSync wasn't called for this gesture
  // (e.g. the daily challenge "Play" button path).
  ensureSilentAudioLoop();
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

// Shared master GainNode that every scheduled sound routes through (via
// getOutputNode below). Going through a master lets us silence audio
// that's already been scheduled into Web Audio — disconnecting the
// master from ctx.destination cuts off every in-flight oscillator
// immediately, where calling .stop() on each one would require tracking
// every node we ever created.
let outputNode: GainNode | null = null;

function makeOutput(ctx: AudioContext): GainNode {
  const node = ctx.createGain();
  node.gain.value = 1;
  node.connect(ctx.destination);
  return node;
}

/** Returns the current master destination. clickSynth.ts uses this in
 *  place of `ctx.destination` so all sounds can be cut at once. */
export function getOutputNode(ctx: AudioContext): AudioNode {
  if (!outputNode || outputNode.context !== ctx) {
    outputNode = makeOutput(ctx);
  }
  return outputNode;
}

/** Silence everything currently scheduled and install a fresh master.
 *  Subsequent scheduled sounds connect to the new node and play
 *  normally; the disconnected old master receives the leftover
 *  scheduled audio but can't route it to the speakers. */
export function resetOutputNode(ctx: AudioContext): AudioNode {
  if (outputNode) {
    try {
      outputNode.disconnect();
    } catch {
      // already disconnected — ignore
    }
  }
  outputNode = makeOutput(ctx);
  return outputNode;
}
