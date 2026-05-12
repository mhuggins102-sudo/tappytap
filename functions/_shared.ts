// Tiny ambient types for the bits of the Workers/Pages runtime we use.
// Avoids pulling in `@cloudflare/workers-types` as a dependency.

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

export interface Env {
  DB: D1Database;
}

export interface PagesContext<E = Env> {
  request: Request;
  env: E;
  params: Record<string, string | string[]>;
  waitUntil(promise: Promise<unknown>): void;
}

export type PagesFunction<E = Env> = (context: PagesContext<E>) => Response | Promise<Response>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// UUID v4 or the fallback `p-...-...` shape minted client-side when crypto.randomUUID
// isn't available. Both are 36 chars or less; cap at 64 to be safe.
const PLAYER_ID_RE = /^[A-Za-z0-9_\-]{1,64}$/;

export function isValidDate(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s);
}

export function isValidPlayerId(s: unknown): s is string {
  return typeof s === 'string' && PLAYER_ID_RE.test(s);
}

export function isScore(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Compute rank and distribution for a (date, playerId) pair. Single round-trip
 * worth of queries: player's score, total entries, count above player, and a
 * grouped bucket histogram.
 */
export async function getRankAndDistribution(
  db: D1Database,
  date: string,
  playerId: string,
): Promise<{ rank: number; total: number; score: number | null; distribution: number[] }> {
  const totalRow = await db
    .prepare('SELECT COUNT(*) AS n FROM daily_scores WHERE date = ?')
    .bind(date)
    .first<{ n: number }>();
  const total = totalRow?.n ?? 0;

  const meRow = await db
    .prepare('SELECT total_score FROM daily_scores WHERE date = ? AND player_id = ?')
    .bind(date, playerId)
    .first<{ total_score: number }>();
  const score = meRow?.total_score ?? null;

  let rank = 0;
  if (score !== null) {
    const higher = await db
      .prepare('SELECT COUNT(*) AS n FROM daily_scores WHERE date = ? AND total_score > ?')
      .bind(date, score)
      .first<{ n: number }>();
    rank = (higher?.n ?? 0) + 1;
  }

  // Bucket scores into 10-point bands; the 100 case falls into the top bucket.
  const distRows = await db
    .prepare(
      `SELECT MIN(total_score / 10, 9) AS bucket, COUNT(*) AS n
         FROM daily_scores
         WHERE date = ?
         GROUP BY bucket`,
    )
    .bind(date)
    .all<{ bucket: number; n: number }>();
  const distribution = new Array<number>(10).fill(0);
  for (const row of distRows.results) {
    const b = Math.max(0, Math.min(9, row.bucket | 0));
    distribution[b] = row.n;
  }

  return { rank, total, score, distribution };
}
