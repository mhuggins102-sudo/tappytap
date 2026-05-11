import { useEffect, useRef } from 'react';
import { getEngine } from '../audio/audioContext';
import type { Phase } from '../game/stateMachine';
import type { JudgmentOrExtra } from '../patterns/types';

interface Props {
  phase: Extract<Phase, { kind: 'echoing' }>;
}

const JUDGMENT_CLASS: Record<JudgmentOrExtra, string> = {
  perfect: 'practice-dot--perfect',
  great: 'practice-dot--great',
  ok: 'practice-dot--ok',
  miss: 'practice-dot--miss',
  extra: 'practice-dot--extra',
};

export function PracticeOverlay({ phase }: Props) {
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const { pattern, echoStartTime, taps, tapJudgments } = phase;
  const duration = Math.max(0.001, pattern.durationSec);

  useEffect(() => {
    let raf = 0;
    let stop = false;
    const tick = () => {
      if (stop) return;
      const eng = getEngine();
      const cursor = cursorRef.current;
      if (eng && cursor) {
        let elapsed = 0;
        if (echoStartTime !== null) {
          elapsed = Math.min(duration, Math.max(0, eng.audioTimeNow() - echoStartTime));
        }
        const pct = (elapsed / duration) * 100;
        cursor.style.left = `${pct}%`;
        cursor.style.opacity = echoStartTime === null ? '0' : '1';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
    };
  }, [echoStartTime, duration]);

  return (
    <div className="practice">
      <div className="practice__row">
        <span className="practice__label">Pattern</span>
        <div className="practice__track">
          {pattern.onsets.map((onset, i) => (
            <span
              key={i}
              className="practice-dot practice-dot--expected"
              style={{ left: `${(onset / duration) * 100}%` }}
            />
          ))}
          <span ref={cursorRef} className="practice__cursor" />
        </div>
      </div>
      <div className="practice__row">
        <span className="practice__label">You</span>
        <div className="practice__track practice__track--actual">
          {taps.map((t, i) => {
            const j = tapJudgments[i] ?? 'extra';
            const pct = Math.min(100, Math.max(0, (t / duration) * 100));
            return (
              <span
                key={i}
                className={`practice-dot ${JUDGMENT_CLASS[j]}`}
                style={{ left: `${pct}%` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
