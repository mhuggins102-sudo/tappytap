import { rngFromString } from '../lib/rng';
import { generatePattern } from './generator';
import type { Pattern } from './types';

export function todayUtcDateString(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function generateDailyPattern(dateStr: string): Pattern {
  const rng = rngFromString(`tappytap:${dateStr}`);
  return generatePattern('medium', rng);
}
