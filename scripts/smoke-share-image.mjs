import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(__dirname, '..', 'functions', 'share-image', '[date].ts');
const mod = await import(TARGET);

async function gen(name, qs, params = { date: '2026-05-12' }) {
  const url = `https://example.test/share-image/${params.date}${qs}`;
  const response = await mod.onRequestGet({
    request: new Request(url), env: {}, params, waitUntil: () => {},
  });
  const buf = Buffer.from(await response.arrayBuffer());
  const out = resolve(__dirname, '..', 'dist', `share-image-${name}.png`);
  writeFileSync(out, buf);
  console.log(`  ${name}: ${buf.length} bytes`);
}

await gen('2digit', '?s=87&r=84&t=92');
await gen('3digit', '?s=100&r=100&t=100');
await gen('1digit', '?s=3&r=2&t=4');
await gen('hard', '?s=42&r=38&t=46', { date: '2026-05-13' });
await gen('no-subscores', '?s=87');
console.log('done');
