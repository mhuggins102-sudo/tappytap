-- TappyTap daily-challenge ranking schema (Cloudflare D1 / SQLite).
--
-- Apply with:
--   wrangler d1 execute tappytap --remote --file=./schema.sql
-- (or omit --remote for the local dev database).

CREATE TABLE IF NOT EXISTS daily_scores (
  date TEXT NOT NULL,            -- YYYY-MM-DD (UTC, same key as the pattern seed)
  player_id TEXT NOT NULL,       -- anonymous UUID minted client-side, never displayed
  total_score INTEGER NOT NULL,  -- 0..100
  rhythm_score INTEGER NOT NULL, -- 0..100
  tempo_score INTEGER NOT NULL,  -- 0..100
  submitted_at INTEGER NOT NULL, -- ms since epoch
  PRIMARY KEY (date, player_id)
);

-- Rank queries (count of entries with a higher score for a given date) hit
-- this index directly.
CREATE INDEX IF NOT EXISTS idx_daily_scores_date_total
  ON daily_scores (date, total_score DESC);
