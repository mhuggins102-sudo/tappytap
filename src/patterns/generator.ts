import type { Difficulty, Pattern } from './types';
import type { Rng } from '../lib/rng';

interface DifficultyConfig {
  bpm: number;
  beatsPerMeasure: number;
  measures: number;
  subdivision: number;
  minOnsets: number;
  maxOnsets: number;
  density: number;
  syncopate: boolean;
}

const CONFIGS: Record<Exclude<Difficulty, 'easy'>, DifficultyConfig> = {
  medium: {
    bpm: 100,
    beatsPerMeasure: 4,
    measures: 2,
    subdivision: 2,
    minOnsets: 6,
    maxOnsets: 8,
    density: 0.55,
    syncopate: false,
  },
  hard: {
    bpm: 110,
    beatsPerMeasure: 4,
    measures: 2,
    subdivision: 4,
    minOnsets: 8,
    maxOnsets: 12,
    density: 0.5,
    syncopate: true,
  },
};

export function generatePattern(difficulty: Difficulty, rng: Rng): Pattern {
  if (difficulty === 'easy') return generateEasyPattern(rng);
  return generateStandardPattern(difficulty, rng);
}

function generateEasyPattern(rng: Rng): Pattern {
  const bpm = 100;
  const subdivision = 2;
  const motifBeats = 4;
  const slotsPerMotif = motifBeats * subdivision;
  const onsetsPerMotif = 4;
  const repeats = 4 + Math.floor(rng() * 2);
  const secPerSlot = 60 / bpm / subdivision;

  const motif: boolean[] = new Array(slotsPerMotif).fill(false);
  motif[0] = true;
  let placed = 1;
  const remainingSlots: number[] = [];
  for (let i = 1; i < slotsPerMotif; i++) remainingSlots.push(i);

  while (placed < onsetsPerMotif && remainingSlots.length > 0) {
    const idx = Math.floor(rng() * remainingSlots.length);
    const slot = remainingSlots.splice(idx, 1)[0];
    motif[slot] = true;
    placed++;
  }

  const onsets: number[] = [];
  const downbeats: boolean[] = [];
  for (let r = 0; r < repeats; r++) {
    for (let i = 0; i < slotsPerMotif; i++) {
      if (motif[i]) {
        onsets.push((r * slotsPerMotif + i) * secPerSlot);
        downbeats.push(false);
      }
    }
  }

  const durationSec = slotsPerMotif * repeats * secPerSlot;
  return { bpm, onsets, downbeats, durationSec, difficulty: 'easy' };
}

function generateStandardPattern(difficulty: Exclude<Difficulty, 'easy'>, rng: Rng): Pattern {
  const cfg = CONFIGS[difficulty];
  const totalSlots = cfg.beatsPerMeasure * cfg.measures * cfg.subdivision;
  const secPerSlot = 60 / cfg.bpm / cfg.subdivision;

  const slots: boolean[] = new Array(totalSlots).fill(false);
  slots[0] = true;

  for (let i = 1; i < totalSlots; i++) {
    if (rng() < cfg.density) slots[i] = true;
  }

  enforceOnsetCount(slots, cfg.minOnsets, cfg.maxOnsets, rng);

  if (cfg.syncopate) applySyncopation(slots, cfg.subdivision, rng);

  const onsets: number[] = [];
  const downbeats: boolean[] = [];
  for (let i = 0; i < totalSlots; i++) {
    if (slots[i]) {
      onsets.push(i * secPerSlot);
      downbeats.push(i % (cfg.beatsPerMeasure * cfg.subdivision) === 0);
    }
  }

  const durationSec = totalSlots * secPerSlot;
  return { bpm: cfg.bpm, onsets, downbeats, durationSec, difficulty };
}

function enforceOnsetCount(slots: boolean[], min: number, max: number, rng: Rng): void {
  let count = slots.filter(Boolean).length;

  while (count > max) {
    const candidates: number[] = [];
    for (let i = 1; i < slots.length; i++) if (slots[i]) candidates.push(i);
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(rng() * candidates.length)];
    slots[pick] = false;
    count--;
  }

  while (count < min) {
    const candidates: number[] = [];
    for (let i = 1; i < slots.length; i++) if (!slots[i]) candidates.push(i);
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(rng() * candidates.length)];
    slots[pick] = true;
    count++;
  }
}

function applySyncopation(slots: boolean[], subdivision: number, rng: Rng): void {
  for (let i = 1; i < slots.length - 1; i++) {
    if (slots[i] && i % subdivision === 0 && rng() < 0.3) {
      const dir = rng() < 0.5 ? -1 : 1;
      const target = i + dir;
      if (target > 0 && target < slots.length && !slots[target]) {
        slots[i] = false;
        slots[target] = true;
      }
    }
  }
}
