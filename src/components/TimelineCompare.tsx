import { useEffect, useState } from 'react';
import type { Pattern, RoundResult, TapResult } from '../patterns/types';

interface Props {
  pattern: Pattern;
  result: RoundResult;
}

function ioiTier(absDev: number): 'great' | 'good' | 'ok' | 'miss' {
  if (absDev < 0.05) return 'great';
  if (absDev < 0.1) return 'good';
  if (absDev < 0.2) return 'ok';
  return 'miss';
}

export function TimelineCompare({ pattern, result }: Props) {
  const expected = pattern.onsets;
  const slope = result.tempoFactor || 1;
  const intercept = result.tempoIntercept || 0;
  const showOnTempo = Math.abs(slope - 1) > 0.01 || Math.abs(intercept) > 0.01;

  const tapTimes = result.taps
    .map((t) => t.tapTime)
    .filter((t): t is number => t !== null);

  const firstTapTime = tapTimes.length ? tapTimes[0] : 0;
  const firstExpected = expected.length ? expected[0] : 0;
  const onTempo = (t: number) =>
    slope > 0 ? (t - firstTapTime) / slope + firstExpected : t;

  const maxTap = tapTimes.length ? Math.max(...tapTimes) : 0;
  const maxOnTempo = tapTimes.length ? Math.max(...tapTimes.map(onTempo)) : 0;
  const denom = Math.max(0.001, pattern.durationSec, maxTap, maxOnTempo);

  const [corrected, setCorrected] = useState(false);
  const [selectedTap, setSelectedTap] = useState<number | null>(null);

  // Dismiss the tap-detail popover when the user clicks/taps anywhere that
  // isn't another tap dot. The setTimeout prevents the click that opened it
  // from immediately closing it.
  useEffect(() => {
    if (selectedTap === null) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest('.timeline-dot')) setSelectedTap(null);
    };
    const id = window.setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', onDocClick);
    };
  }, [selectedTap]);

  // Pre-compute the IOI deviation between each pair of consecutive matched
  // taps so we can render a colored band on the You row underneath the dots.
  // Each band's color reflects how steady that one IOI was relative to the
  // expected interval.
  const segments: Array<{ key: number; from: number; to: number; tier: 'great' | 'good' | 'ok' | 'miss'; deviation: number }> = [];
  let prev: { tapTime: number; expectedIdx: number } | null = null;
  for (let i = 0; i < result.taps.length; i++) {
    const t = result.taps[i];
    if (t.tapTime === null || t.expectedIdx === null) {
      prev = null;
      continue;
    }
    if (prev !== null) {
      const expIoi = expected[t.expectedIdx] - expected[prev.expectedIdx];
      if (expIoi > 1e-6) {
        const tapIoi = t.tapTime - prev.tapTime;
        const dev = tapIoi / expIoi - 1;
        segments.push({
          key: i,
          from: prev.tapTime,
          to: t.tapTime,
          tier: ioiTier(Math.abs(dev)),
          deviation: dev,
        });
      }
    }
    prev = { tapTime: t.tapTime, expectedIdx: t.expectedIdx };
  }

  return (
    <>
      {showOnTempo && (
        <button
          className="btn btn--small timeline__reveal"
          type="button"
          onClick={() => setCorrected((c) => !c)}
        >
          {corrected ? 'Show raw timing' : 'Show on-tempo timing'}
        </button>
      )}
      <div className="timeline">
        <div className="timeline__row">
          <span className="timeline__label">Pattern</span>
          <div className="timeline__track timeline__track--expected">
            {expected.map((onset, i) => (
              <span
                key={i}
                className="timeline-dot timeline-dot--expected"
                style={{ left: `${(onset / denom) * 100}%` }}
              />
            ))}
          </div>
        </div>
        <div className="timeline__row">
          <span className="timeline__label">You</span>
          <div className="timeline__track timeline__track--actual">
            {/* (A) Per-segment IOI shading: each band shows how steady the
                interval to the previous tap was. Lives behind the dots. */}
            {segments.map((seg) => {
              const fromPos = corrected ? onTempo(seg.from) : seg.from;
              const toPos = corrected ? onTempo(seg.to) : seg.to;
              const left = (fromPos / denom) * 100;
              const width = ((toPos - fromPos) / denom) * 100;
              return (
                <span
                  key={`seg-${seg.key}`}
                  className={`timeline-segment timeline-segment--${seg.tier}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${(seg.deviation * 100).toFixed(0)}% ${seg.deviation < 0 ? 'fast' : 'slow'} on this beat`}
                />
              );
            })}
            {result.taps.map((tap, i) => {
              if (tap.tapTime === null) return null;
              const pos = corrected ? onTempo(tap.tapTime) : tap.tapTime;
              const isSelected = selectedTap === i;
              return (
                <span
                  key={i}
                  className={`timeline-dot timeline-dot--${tap.judgment} timeline-dot--animated${isSelected ? ' timeline-dot--selected' : ''}`}
                  style={{ left: `${(pos / denom) * 100}%` }}
                  title={titleFor(tap)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTap((prev) => (prev === i ? null : i));
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
      {/* (C) Tap-to-show popover: shows raw + corrected error for the
          selected tap. Tap a dot to open; tap elsewhere to dismiss. */}
      {selectedTap !== null && result.taps[selectedTap] && (
        <TapDetail tap={result.taps[selectedTap]} index={selectedTap} />
      )}
    </>
  );
}

function TapDetail({ tap, index }: { tap: TapResult; index: number }) {
  return (
    <div className="timeline__tap-popover">
      <span className={`timeline__tap-popover-tier timeline__tap-popover-tier--${tap.judgment}`}>
        {tap.judgment}
      </span>
      <span className="timeline__tap-popover-text">
        Tap {index + 1}
        {tap.errorMs !== null && (
          <>
            {' · corrected '}
            <strong>{formatMs(tap.errorMs)}</strong>
          </>
        )}
        {tap.rawErrorMs !== null && tap.errorMs !== null &&
          Math.abs(tap.rawErrorMs - tap.errorMs) >= 1 && (
            <>
              {' · raw '}
              <strong>{formatMs(tap.rawErrorMs)}</strong>
            </>
          )}
      </span>
    </div>
  );
}

function formatMs(ms: number): string {
  const sign = ms >= 0 ? '+' : '';
  return `${sign}${Math.round(ms)} ms`;
}

function titleFor(tap: TapResult): string {
  if (tap.errorMs === null) return tap.judgment;
  const corrSign = tap.errorMs >= 0 ? '+' : '';
  const corrMs = Math.round(tap.errorMs);
  if (tap.rawErrorMs === null || Math.abs(tap.rawErrorMs - tap.errorMs) < 1) {
    return `${tap.judgment} (${corrSign}${corrMs} ms)`;
  }
  const rawSign = tap.rawErrorMs >= 0 ? '+' : '';
  const rawMs = Math.round(tap.rawErrorMs);
  return `${tap.judgment} (corr ${corrSign}${corrMs} ms, raw ${rawSign}${rawMs} ms)`;
}
