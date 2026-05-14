# TappyTap

A tiny browser rhythm game. The app plays a short rhythmic pattern; you tap it back. Per-tap timing accuracy in milliseconds determines your score.

- **Three difficulty levels** — Easy (steady quarter notes), Medium (quarters + eighths), Hard (syncopation + sixteenths).
- **Daily challenge** — one deterministic pattern per UTC day, one attempt, copyable share string.
- **Local high scores** — saved per difficulty in `localStorage`. No backend.
- **All client-side** — synthesized audio via the Web Audio API, no asset files.

## Stack

- React 18 + Vite + TypeScript
- Web Audio API (synthesized clicks; sample-accurate scheduling on `AudioContext.currentTime`)
- Plain CSS (no UI framework)
- Deployment: Cloudflare Pages (static SPA)

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # outputs to dist/
npm run preview    # serve the built bundle locally
```

## Tests

```sh
npm test           # run the Vitest suite once
npm run test:watch # re-run tests on change
```

The suite covers the scoring algorithm (tempo/rhythm subscores, completion-ratio scaling, judgment tiers, outlier handling) and pattern generation (BPM jitter range, onset count bounds per difficulty, curated figure invariants, daily determinism).

## Deploy to Cloudflare Pages

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Framework preset:** Vite (or "None" with the values above)
- No environment variables required. SPA — no extra routing config needed for the single-page flow.

## How timing accuracy works

Tap accuracy is the entire point of the game, so the implementation keeps audio and input on the same clock:

- A single `AudioContext` is created on the user's first tap and resumed to satisfy autoplay rules.
- At creation we capture `clockOffset = ctx.currentTime - performance.now()/1000` and re-capture it on every resume.
- Every player tap (`keydown` Space or `pointerdown` on the tap target) is converted from `event.timeStamp` into `AudioContext` seconds via that offset, never via `Date.now()` or `performance.now()` at handler-time.
- Patterns are short (≤5s, ≤16 onsets), so every click is scheduled up front with `oscillator.start(when)` rather than via a setTimeout loop.

If you notice scores skewing systematically late, the most likely culprit is using `performance.now()` inside the handler instead of `event.timeStamp`.

## Project layout

```
src/
  audio/         # AudioContext singleton, click synthesis, pattern scheduling
  game/          # State machine, game loop, input capture, React bridge
  patterns/      # Difficulty-tuned generator, daily seed, types
  lib/           # mulberry32 RNG, scoring algorithm, localStorage helpers
  components/    # Start / Picker / Game / Score / Daily screens, TapTarget
```
