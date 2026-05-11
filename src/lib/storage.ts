import type { Difficulty, RoundResult } from '../patterns/types';

const HIGHSCORES_KEY = 'tappytap.highscores';
const DAILY_KEY = 'tappytap.daily';
const SETTINGS_KEY = 'tappytap.settings';
const VERSION = 2;

export interface DifficultyRecord {
  bestScore: number;
  bestAccuracy: number;
  playedAt: string;
  games: number;
  totalScore: number;
  totalAccuracy: number;
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
  // Older saves had only best fields. Seed cumulative totals from the best so
  // averages aren't undefined for returning players, even though that
  // overestimates their actual average until they play a few more rounds.
  if (typeof r.games !== 'number' || typeof r.totalScore !== 'number' || typeof r.totalAccuracy !== 'number') {
    return {
      bestScore: r.bestScore,
      bestAccuracy: r.bestAccuracy,
      playedAt: r.playedAt,
      games: 1,
      totalScore: r.bestScore,
      totalAccuracy: r.bestAccuracy,
    };
  }
  return r;
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
  };
  localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(scores));

  return { scores, isNewBest };
}

export function clearHighScores(): void {
  localStorage.removeItem(HIGHSCORES_KEY);
}

export function loadDailyEntry(todayDateStr: string): DailyEntry | null {
  const parsed = safeParse<DailyEntry>(localStorage.getItem(DAILY_KEY));
  if (!parsed || parsed.v !== VERSION) return null;
  if (parsed.date !== todayDateStr) return null;
  return parsed;
}

export function saveDailyEntry(entry: Omit<DailyEntry, 'v'>): void {
  const full: DailyEntry = { v: VERSION, ...entry };
  localStorage.setItem(DAILY_KEY, JSON.stringify(full));
}

export type SoundTheme = 'tones' | 'groove';

export interface Settings {
  v: number;
  liveFeedback: boolean;
  practiceMode: boolean;
  soundTheme: SoundTheme;
}

const DEFAULT_SETTINGS: Settings = {
  v: VERSION,
  liveFeedback: true,
  practiceMode: false,
  soundTheme: 'tones',
};

export function loadSettings(): Settings {
  const parsed = safeParse<Partial<Settings>>(localStorage.getItem(SETTINGS_KEY));
  if (!parsed || parsed.v !== VERSION) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...parsed };
}

export function saveSettings(next: Partial<Omit<Settings, 'v'>>): Settings {
  const current = loadSettings();
  const merged: Settings = { ...current, ...next, v: VERSION };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}
