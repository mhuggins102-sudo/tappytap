import { useEffect, useRef } from 'react';
import { handlePointerTap } from '../game/inputCapture';
import { getEngine } from '../audio/audioContext';
import type { Phase } from '../game/stateMachine';

interface Props {
  phase: Phase;
  disabled?: boolean;
}

export function TapTarget({ phase, disabled }: Props) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      handlePointerTap(e);
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
  }, [disabled]);

  useEffect(() => {
    let raf = 0;
    let stop = false;

    const tick = () => {
      if (stop) return;
      const eng = getEngine();
      const el = ref.current;
      if (eng && el) {
        const now = eng.audioTimeNow();
        const intensity = computePulse(phase, now);
        el.style.setProperty('--pulse', intensity.toFixed(3));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
    };
  }, [phase]);

  const label = phaseLabel(phase);
  if (labelRef.current) labelRef.current.textContent = label;

  return (
    <button
      ref={ref}
      className={`tap-target tap-target--${phase.kind}`}
      type="button"
      aria-label="Tap"
      disabled={disabled}
    >
      <span className="tap-target__ring" />
      <span ref={labelRef} className="tap-target__label">{label}</span>
    </button>
  );
}

function phaseLabel(phase: Phase): string {
  switch (phase.kind) {
    case 'countdown':
      return 'Get ready';
    case 'listening':
      return 'Listen';
    case 'echoing':
      return 'Your turn';
    case 'scoring':
      return 'Done';
    case 'idle':
      return 'Tap';
  }
}

function computePulse(phase: Phase, now: number): number {
  if (phase.kind === 'listening') {
    const t = now - phase.patternStartTime;
    for (let i = 0; i < phase.pattern.onsets.length; i++) {
      const onset = phase.pattern.onsets[i];
      const dt = t - onset;
      if (dt >= 0 && dt < 0.25) {
        return Math.max(0, 1 - dt / 0.25);
      }
    }
    return 0;
  }
  if (phase.kind === 'countdown') {
    const beatSec = (phase.endsAt - phase.startedAt) / 4;
    const t = now - phase.startedAt;
    const within = t % beatSec;
    if (within < 0.2) return Math.max(0, 1 - within / 0.2) * 0.6;
    return 0;
  }
  return 0;
}
