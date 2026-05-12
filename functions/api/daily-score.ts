import {
  getRankAndDistribution,
  isScore,
  isValidDate,
  isValidPlayerId,
  json,
  type PagesFunction,
} from '../_shared';

interface SubmitBody {
  date?: unknown;
  playerId?: unknown;
  totalScore?: unknown;
  rhythmScore?: unknown;
  tempoScore?: unknown;
}

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  if (
    !isValidDate(body.date) ||
    !isValidPlayerId(body.playerId) ||
    !isScore(body.totalScore) ||
    !isScore(body.rhythmScore) ||
    !isScore(body.tempoScore)
  ) {
    return json({ error: 'invalid payload' }, 400);
  }

  // Upsert: a replay only overwrites the existing row if the new total is
  // strictly greater. Keeps "best score for this player + date" semantics
  // on the server even if a client sends a worse retry.
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO daily_scores (date, player_id, total_score, rhythm_score, tempo_score, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(date, player_id) DO UPDATE SET
       total_score = excluded.total_score,
       rhythm_score = excluded.rhythm_score,
       tempo_score = excluded.tempo_score,
       submitted_at = excluded.submitted_at
     WHERE excluded.total_score > daily_scores.total_score`,
  )
    .bind(
      body.date,
      body.playerId,
      Math.round(body.totalScore),
      Math.round(body.rhythmScore),
      Math.round(body.tempoScore),
      now,
    )
    .run();

  const stats = await getRankAndDistribution(env.DB, body.date, body.playerId);
  return json(stats);
};
