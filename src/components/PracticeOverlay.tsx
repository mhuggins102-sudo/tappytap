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

const MATCH_WINDOW_SEC = 0.15;
const EXPECTED_BASE_CLASS = 'practice-dot practice-dot--expected';
const EXPECTED_MISS_CLASS = 'practice-dot practice-dot--expected-missed';

export function PracticeOverlay({ phase }: Props) {
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const expectedDotRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const { pattern, echoStartTime, taps, tapJudgments, tapExpectedIndices } = phase;
  const duration = Math.max(0.001, pattern.durationSec);

  useEffect(() => {
    let raf = 0;
    let stop = false;

    const matchedSet = new Set<number>();
    for (const idx of tapExpectedIndices) {
      if (idx !== null) matchedSet.add(idx);
    }

    const tick = () => {
      if (stop) return;
      const eng = getEngine();
      const cursor = cursorRef.current;
      if (eng) {
        const now = eng.audioTimeNow();
        const elapsed = echoStartTime === null ? 0 : Math.max(0, now - echoStartTime);
        const cursorPct = (Math.min(duration, elapsed) / duration) * 100;
        if (cursor) {
          cursor.style.left = `${cursorPct}%`;
          cursor.style.opacity = echoStartTime === null ? '0' : '1';
        }

        const dots = expectedDotRefs.current;
        for (let i = 0; i < dots.length; i++) {
          const dot = dots[i];
          if (!dot) continue;
          const onset = pattern.onsets[i];
          const isMissed =
            echoStartTime !== null &&
            !matchedSet.has(i) &&
            elapsed > onset + MATCH_WINDOW_SEC;
          const desired = isMissed ? EXPECTED_MISS_CLASS : EXPECTED_BASE_CLASS;
          if (dot.className !== desired) dot.className = desired;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
    };
  }, [echoStartTime, duration, pattern, tapExpectedIndices]);

  return (
    <div className="practice">
      <div className="practice__row">
        <span className="practice__label">Pattern</span>
        <div className="practice__track">
          {pattern.onsets.map((onset, i) => (
            <span
              key={i}
              ref={(el) => {
                expectedDotRefs.current[i] = el;
              }}
              className={EXPECTED_BASE_CLASS}
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
