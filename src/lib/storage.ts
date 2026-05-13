import type { Difficulty, RoundResult } from '../patterns/types';

const HIGHSCORES_KEY = 'tappytap.highscores';
const DAILY_KEY = 'tappytap.daily'; // legacy: single-day entry. Migrated to DAILY_HISTORY_KEY on first read.
const DAILY_HISTORY_KEY = 'tappytap.dailyHistory';
const PLAYER_ID_KEY = 'tappytap.playerId';
const SETTINGS_KEY = 'tappytap.settings';
const VERSION = 2;
// Settings has its own version so we can ship new defaults (and add fields
// like `instrument`) without invalidating high-score and daily-challenge data.
const SETTINGS_VERSION = 3;

export interface DifficultyRecord {
  bestScore: number;
  bestAccuracy: number;
  playedAt: string;
  games: number;
  totalScore: number;
  totalAccuracy: number;
  totalRhythm: number;
  totalTempo: number;
}

export interface HighScores {
  v: number;
  easy: DifficultyRecord | null;
  medium: DifficultyRecord | null;
  hard: DifficultyRecord | null;
}

export interface DailyEntry {
  v: number;
  date: string;
  result: RoundResult;
  shareString: string;
  /** How many attempts the player has used for this date. Capped at 2. */
  attempts: number;
  /** Rank info from the server (populated after a successful submit). */
  rank?: { position: number; total: number; distribution: number[] } | null;
}

export interface DailyHistory {
  v: number;
  entries: Record<string, DailyEntry>;
}

const EMPTY_HIGHSCORES: HighScores = { v: VERSION, easy: null, medium: null, hard: null };

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function migrateRecord(r: DifficultyRecord | null): DifficultyRecord | null {
  if (!r) return null;
  // Older saves are missing one or more aggregate fields. Seed any missing
  // cumulative totals from the existing best so averages aren't undefined for
  // returning players. This overestimates the average until a few more rounds
  // are played, but is non-destructive.
  const games = typeof r.games === 'number' && r.games > 0 ? r.games : 1;
  return {
    bestScore: r.bestScore,
    bestAccuracy: r.bestAccuracy,
    playedAt: r.playedAt,
    games,
    totalScore: typeof r.totalScore === 'number' ? r.totalScore : r.bestScore * games,
    totalAccuracy: typeof r.totalAccuracy === 'number' ? r.totalAccuracy : r.bestAccuracy * games,
    totalRhythm: typeof r.totalRhythm === 'number' ? r.totalRhythm : r.bestScore * games,
    totalTempo: typeof r.totalTempo === 'number' ? r.totalTempo : r.bestScore * games,
  };
}

export function loadHighScores(): HighScores {
  const parsed = safeParse<HighScores>(localStorage.getItem(HIGHSCORES_KEY));
  if (!parsed || parsed.v !== VERSION) return { ...EMPTY_HIGHSCORES };
  return {
    ...EMPTY_HIGHSCORES,
    ...parsed,
    easy: migrateRecord(parsed.easy),
    medium: migrateRecord(parsed.medium),
    hard: migrateRecord(parsed.hard),
  };
}

export function recordRound(difficulty: Difficulty, result: RoundResult): {
  scores: HighScores;
  isNewBest: boolean;
} {
  const scores = loadHighScores();
  const current = scores[difficulty];
  const isNewBest = !current || result.totalScore > current.bestScore;

  scores[difficulty] = {
    bestScore: isNewBest ? result.totalScore : current!.bestScore,
    bestAccuracy: isNewBest ? result.accuracyPct : current!.bestAccuracy,
    playedAt: new Date().toISOString(),
    games: (current?.games ?? 0) + 1,
    totalScore: (current?.totalScore ?? 0) + result.totalScore,
    totalAccuracy: (current?.totalAccuracy ?? 0) + result.accuracyPct,
    totalRhythm: (current?.totalRhythm ?? 0) + result.rhythmScore,
    totalTempo: (current?.totalTempo ?? 0) + result.tempoScore,
  };
  localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(scores));

  return { scores, isNewBest };
}

export function clearHighScores(): void {
  localStorage.removeItem(HIGHSCORES_KEY);
}

/** Backfill `attempts` for entries saved before the field existed. */
function migrateDailyEntry(e: DailyEntry): DailyEntry {
  return { ...e, attempts: typeof e.attempts === 'number' ? e.attempts : 1 };
}

export function loadDailyHistory(): DailyHistory {
  const parsed = safeParse<DailyHistory>(localStorage.getItem(DAILY_HISTORY_KEY));
  if (parsed && parsed.v === VERSION && parsed.entries) {
    const entries: Record<string, DailyEntry> = {};
    for (const [k, v] of Object.entries(parsed.entries)) entries[k] = migrateDailyEntry(v);
    return { v: VERSION, entries };
  }
  // One-time migration from the legacy single-entry key: bring the old
  // entry forward into the history map so a returning player doesn't
  // lose their last result, then drop the old key.
  const legacy = safeParse<DailyEntry>(localStorage.getItem(DAILY_KEY));
  if (legacy && legacy.v === VERSION && legacy.date) {
    const history: DailyHistory = {
      v: VERSION,
      entries: { [legacy.date]: migrateDailyEntry(legacy) },
    };
    localStorage.setItem(DAILY_HISTORY_KEY, JSON.stringify(history));
    localStorage.removeItem(DAILY_KEY);
    return history;
  }
  return { v: VERSION, entries: {} };
}

export const MAX_DAILY_ATTEMPTS = 2;

export function loadDailyEntry(dateStr: string): DailyEntry | null {
  return loadDailyHistory().entries[dateStr] ?? null;
}

/**
 * Save the result for a date with best-score-wins semantics. The entry's
 * attempt count is always advanced (capped at MAX_DAILY_ATTEMPTS) so the
 * "you've used your retries" check in the game loop sees the new total
 * even when the new score was worse than the existing one. Returns the
 * stored entry plus the previous score (if any) so the caller can show
 * an "improved!" indicator.
 */
export function saveDailyEntry(
  entry: Omit<DailyEntry, 'v' | 'attempts'>,
): { entry: DailyEntry; previousScore: number | null; wasImprovement: boolean } {
  const history = loadDailyHistory();
  const existing = history.entries[entry.date];
  const previousScore = existing?.result.totalScore ?? null;
  const attempts = Math.min(MAX_DAILY_ATTEMPTS, (existing?.attempts ?? 0) + 1);
  const keepExisting =
    existing && existing.result.totalScore >= entry.result.totalScore;
  const stored: DailyEntry = keepExisting
    ? { ...existing, attempts }
    : { v: VERSION, ...entry, attempts, rank: existing?.rank };
  history.entries[entry.date] = stored;
  localStorage.setItem(DAILY_HISTORY_KEY, JSON.stringify(history));
  const wasImprovement =
    previousScore !== null && entry.result.totalScore > previousScore;
  return { entry: stored, previousScore, wasImprovement };
}

export function updateDailyEntryRank(dateStr: string, rank: DailyEntry['rank']): void {
  const history = loadDailyHistory();
  const existing = history.entries[dateStr];
  if (!existing) return;
  history.entries[dateStr] = { ...existing, rank };
  localStorage.setItem(DAILY_HISTORY_KEY, JSON.stringify(history));
}

/**
 * Stable anonymous identifier for ranking submissions. Generated on first
 * use and persisted in localStorage. Never displayed to the player.
 */
export function loadPlayerId(): string {
  const existing = localStorage.getItem(PLAYER_ID_KEY);
  if (existing) return existing;
  const fresh = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `p-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  localStorage.setItem(PLAYER_ID_KEY, fresh);
  return fresh;
}

export type SoundTheme = 'tones' | 'groove';
export type Instrument =
  | 'drums'
  | 'marimba'
  | 'bass'
  | 'synth'
  | 'piano'
  | 'bell'
  | 'kazoo'
  | 'bikeHorn'
  | 'whoopee';

export interface Settings {
  v: number;
  liveFeedback: boolean;
  practiceMode: boolean;
  soundTheme: SoundTheme;
  instrument: Instrument;
}

const DEFAULT_SETTINGS: Settings = {
  v: SETTINGS_VERSION,
  liveFeedback: false,
  practiceMode: false,
  soundTheme: 'groove',
  instrument: 'drums',
};

export function loadSettings(): Settings {
  const parsed = safeParse<Partial<Settings>>(localStorage.getItem(SETTINGS_KEY));
  if (!parsed || parsed.v !== SETTINGS_VERSION) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...parsed };
}

export function saveSettings(next: Partial<Omit<Settings, 'v'>>): Settings {
  const current = loadSettings();
  const merged: Settings = { ...current, ...next, v: SETTINGS_VERSION };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}
