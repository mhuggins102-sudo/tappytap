import { useEffect, useRef } from 'react';
import { handlePointerTap } from '../game/inputCapture';
import { getEngine } from '../audio/audioContext';
import type { Phase } from '../game/stateMachine';

interface Props {
  phase: Phase;
  disabled?: boolean;
}

const COUNTDOWN_LABELS = ['3', '2', '1', 'GO!'];

export function TapTarget({ phase, disabled }: Props) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const lastLabelRef = useRef<string>('');

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
    lastLabelRef.current = '';
    let raf = 0;
    let stop = false;

    const tick = () => {
      if (stop) return;
      const eng = getEngine();
      const el = ref.current;
      const labelEl = labelRef.current;
      if (eng && el) {
        const now = eng.audioTimeNow();
        const intensity = computePulse(phase, now);
        el.style.setProperty('--pulse', intensity.toFixed(3));

        const label = computeLabel(phase, now);
        if (labelEl && label !== lastLabelRef.current) {
          lastLabelRef.current = label;
          labelEl.textContent = label;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
    };
  }, [phase]);

  return (
    <button
      ref={ref}
      className={`tap-target tap-target--${phase.kind}`}
      type="button"
      aria-label="Tap"
      disabled={disabled}
    >
      <span className="tap-target__ring" />
      <span ref={labelRef} className="tap-target__label">{computeLabel(phase, 0)}</span>
    </button>
  );
}

function computeLabel(phase: Phase, now: number): string {
  switch (phase.kind) {
    case 'countdown': {
      const total = phase.endsAt - phase.startedAt;
      const beatSec = total / phase.beats;
      const elapsed = Math.max(0, now - phase.startedAt);
      const idx = Math.min(phase.beats - 1, Math.floor(elapsed / beatSec));
      return COUNTDOWN_LABELS[Math.min(idx, COUNTDOWN_LABELS.length - 1)];
    }
    case 'listening':
      return 'Listen';
    case 'echoing':
      return phase.echoStartTime === null ? 'Tap to start' : 'Your turn';
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
      const dt = t - phase.pattern.onsets[i];
      if (dt >= 0 && dt < 0.25) return Math.max(0, 1 - dt / 0.25);
    }
    return 0;
  }
  if (phase.kind === 'countdown') {
    const total = phase.endsAt - phase.startedAt;
    const beatSec = total / phase.beats;
    const within = (now - phase.startedAt) % beatSec;
    if (within < 0.2) return Math.max(0, 1 - within / 0.2) * 0.6;
    return 0;
  }
  return 0;
}
