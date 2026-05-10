import { generatePattern } from '../src/patterns/generator.ts';
import { generateDailyPattern } from '../src/patterns/daily.ts';
import { rngFromString } from '../src/lib/rng.ts';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('PASS:', msg);
  }
}

const easy = generatePattern('easy', rngFromString('seed-a'));
assert(easy.onsets.length >= 4 && easy.onsets.length <= 4, `easy onsets in range (${easy.onsets.length})`);
assert(easy.onsets[0] === 0, 'easy starts on downbeat');

const medium = generatePattern('medium', rngFromString('seed-b'));
assert(medium.onsets.length >= 6 && medium.onsets.length <= 8, `medium onsets in range (${medium.onsets.length})`);

const hard = generatePattern('hard', rngFromString('seed-c'));
assert(hard.onsets.length >= 8 && hard.onsets.length <= 12, `hard onsets in range (${hard.onsets.length})`);

const d1 = generateDailyPattern('2026-05-10');
const d2 = generateDailyPattern('2026-05-10');
assert(JSON.stringify(d1.onsets) === JSON.stringify(d2.onsets), 'daily is deterministic');

const d3 = generateDailyPattern('2026-05-11');
assert(JSON.stringify(d1.onsets) !== JSON.stringify(d3.onsets), 'different dates produce different patterns');

for (const p of [easy, medium, hard]) {
  for (let i = 1; i < p.onsets.length; i++) {
    assert(p.onsets[i] > p.onsets[i - 1], `${p.difficulty} onsets strictly increasing`);
  }
}

console.log('Sample patterns:');
console.log('  easy:  ', easy.onsets.map((o) => o.toFixed(3)).join(', '));
console.log('  medium:', medium.onsets.map((o) => o.toFixed(3)).join(', '));
console.log('  hard:  ', hard.onsets.map((o) => o.toFixed(3)).join(', '));
console.log('  daily: ', d1.onsets.map((o) => o.toFixed(3)).join(', '));
