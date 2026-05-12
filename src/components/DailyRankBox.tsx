import { useEffect, useRef, useState } from 'react';
import {
  fetchDailyRank,
  submitDailyScore,
  type RankResult,
} from '../lib/api';
import { loadDailyEntry, loadPlayerId, updateDailyEntryRank } from '../lib/storage';
import type { RoundResult } from '../patterns/types';

interface Props {
  dateStr: string;
  /** When set, POST the score to update the leaderboard for the day. */
  freshResult?: RoundResult;
}

/**
 * Daily-challenge rank readout. On mount, either submits a fresh score to
 * the ranking endpoint or fetches the existing rank for the saved entry.
 * Falls back silently if the backend is unreachable so the local-only
 * experience still works.
 */
export function DailyRankBox({ dateStr, freshResult }: Props) {
  const [rank, setRank] = useState<RankResult | null>(() => {
    const entry = loadDailyEntry(dateStr);
    if (entry?.rank) {
      return {
        rank: entry.rank.position,
        total: entry.rank.total,
        score: entry.result.totalScore,
        distribution: entry.rank.distribution,
      };
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    const playerId = loadPlayerId();
    setLoading(true);
    const promise = freshResult
      ? submitDailyScore(dateStr, playerId, {
          totalScore: freshResult.totalScore,
          rhythmScore: freshResult.rhythmScore,
          tempoScore: freshResult.tempoScore,
        })
      : fetchDailyRank(dateStr, playerId);

    void promise.then((result) => {
      setLoading(false);
      if (!result) return;
      setRank(result);
      updateDailyEntryRank(dateStr, {
        position: result.rank,
        total: result.total,
        distribution: result.distribution,
      });
    });
    // We want this effect to run once per (dateStr, freshResult.totalScore).
    // The ref guards against React 18 strict-mode double-invocation in dev.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, freshResult?.totalScore]);

  if (!rank && loading) {
    return <div className="rank-box rank-box--placeholder">Fetching rank…</div>;
  }
  if (!rank) {
    // Backend unreachable; the local experience is still complete.
    return null;
  }

  const myScore = rank.score;

  return (
    <div className="rank-box">
      <div className="rank-box__header">
        <div className="rank-box__rank">
          <span className="rank-box__pos">#{rank.rank}</span>
          <span className="rank-box__total">/ {rank.total}</span>
        </div>
      </div>
      <DistributionCurve
        distribution={rank.distribution}
        highlightScore={myScore ?? freshResult?.totalScore ?? null}
      />
      <div className="rank-box__axis">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

/**
 * Build a smooth SVG path through a series of points using Catmull-Rom
 * splines converted to cubic Beziers. The control points are derived from
 * the neighbours on each side so the resulting curve passes exactly
 * through every input point with continuous tangents.
 */
function catmullRomPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  const segs: string[] = [`M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    segs.push(
      `C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`,
    );
  }
  return segs.join(' ');
}

function DistributionCurve({
  distribution,
  highlightScore,
}: {
  distribution: number[];
  highlightScore: number | null;
}) {
  const n = distribution.length;
  // Logical drawing area; SVG scales to the rendered size via viewBox.
  const w = 100;
  const h = 32;
  const padY = 2;
  const max = Math.max(1, ...distribution);
  // Bucket centers, spread evenly across the full width so each bucket
  // sits at the midpoint of its band.
  const points = distribution.map((count, i) => {
    const x = ((i + 0.5) / n) * w;
    const y = h - padY - (count / max) * (h - padY * 2);
    return { x, y };
  });
  const linePath = catmullRomPath(points);
  const areaPath = `${linePath} L ${w},${h} L 0,${h} Z`;

  // 100/n is the score range per bucket; clamp to the last bucket so
  // a perfect 100 still lands inside the curve.
  const bucketSize = 100 / n;
  const highlightBucket =
    highlightScore !== null
      ? Math.max(0, Math.min(n - 1, Math.floor(highlightScore / bucketSize)))
      : null;
  const highlight =
    highlightBucket !== null ? points[highlightBucket] : null;

  return (
    <svg
      className="dist-chart"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Score distribution"
    >
      <path className="dist-chart__area" d={areaPath} />
      <path className="dist-chart__line" d={linePath} />
      {highlight && (
        <>
          <line
            className="dist-chart__highlight-line"
            x1={highlight.x}
            x2={highlight.x}
            y1={highlight.y}
            y2={h}
          />
          <circle
            className="dist-chart__highlight-dot"
            cx={highlight.x}
            cy={highlight.y}
            r={1.6}
          />
        </>
      )}
    </svg>
  );
}
