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
  // Percentile is only meaningful (and shown) once the player pool for the
  // day is large enough that the number isn't dominated by noise. Below
  // this threshold a "top 50%" reading from 1 of 2 is misleading.
  const PERCENTILE_MIN_PLAYERS = 5;
  const percentile =
    rank.total >= PERCENTILE_MIN_PLAYERS && rank.rank > 0
      ? Math.round(((rank.total - rank.rank) / (rank.total - 1)) * 100)
      : null;

  return (
    <div className="rank-box">
      <div className="rank-box__header">
        <div className="rank-box__rank">
          <span className="rank-box__pos">#{rank.rank}</span>
          <span className="rank-box__total">/ {rank.total}</span>
        </div>
        {percentile !== null && (
          <div className="rank-box__pct">
            top {Math.max(1, 100 - percentile)}%
          </div>
        )}
      </div>
      <DistributionChart
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

function DistributionChart({
  distribution,
  highlightScore,
}: {
  distribution: number[];
  highlightScore: number | null;
}) {
  const max = Math.max(1, ...distribution);
  const highlightBucket =
    highlightScore !== null
      ? Math.max(0, Math.min(9, Math.floor(highlightScore / 10)))
      : null;
  return (
    <div className="dist-chart" role="img" aria-label="Score distribution">
      {distribution.map((count, i) => {
        const h = (count / max) * 100;
        const isMine = i === highlightBucket;
        return (
          <div
            key={i}
            className={`dist-chart__bar ${isMine ? 'dist-chart__bar--mine' : ''}`}
            style={{ height: `${Math.max(2, h)}%` }}
            title={`${i * 10}–${i === 9 ? 100 : i * 10 + 9}: ${count}`}
          />
        );
      })}
    </div>
  );
}
