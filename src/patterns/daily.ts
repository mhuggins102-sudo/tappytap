import { rngFromString } from '../lib/rng';
import { generatePattern } from './generator';
import type { Difficulty, Pattern } from './types';

export function todayUtcDateString(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The daily challenge alternates between medium and hard from one date to
 * the next. A small dedicated seed (separate from the pattern seed) chooses
 * the difficulty so the result is stable for any given date but can be
 * computed without generating the full pattern.
 */
export function dailyDifficultyFor(dateStr: string): Exclude<Difficulty, 'easy'> {
  const rng = rngFromString(`tappytap:difficulty:${dateStr}`);
  return rng() < 0.5 ? 'medium' : 'hard';
}

export function generateDailyPattern(dateStr: string): Pattern {
  const difficulty = dailyDifficultyFor(dateStr);
  const rng = rngFromString(`tappytap:${dateStr}`);
  return generatePattern(difficulty, rng);
}
