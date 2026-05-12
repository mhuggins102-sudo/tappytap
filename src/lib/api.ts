/**
 * Client wrapper for the daily-challenge ranking API. Both endpoints return
 * the same shape so the UI can use one component for "just-played" results
 * and "viewing past entry" alike.
 *
 * All calls are best-effort: a network failure or a non-2xx response yields
 * `null` rather than throwing, so the UI can degrade silently to the
 * local-only experience.
 */

const API_BASE = '/api';

export interface RankResult {
  /** 1-based rank within the day's submissions. 0 if no submission found. */
  rank: number;
  total: number;
  score: number | null;
  /** Ten 10-point buckets, [0–9, 10–19, … , 90–100]. */
  distribution: number[];
}

interface ScorePayload {
  totalScore: number;
  rhythmScore: number;
  tempoScore: number;
}

export async function submitDailyScore(
  date: string,
  playerId: string,
  payload: ScorePayload,
): Promise<RankResult | null> {
  try {
    const res = await fetch(`${API_BASE}/daily-score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date, playerId, ...payload }),
    });
    if (!res.ok) return null;
    return (await res.json()) as RankResult;
  } catch {
    return null;
  }
}

export async function fetchDailyRank(
  date: string,
  playerId: string,
): Promise<RankResult | null> {
  try {
    const url = `${API_BASE}/daily-rank?date=${encodeURIComponent(date)}&playerId=${encodeURIComponent(playerId)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as RankResult;
  } catch {
    return null;
  }
}
