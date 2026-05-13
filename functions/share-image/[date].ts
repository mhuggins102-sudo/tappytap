// /share-image/:date.png — dynamically generated 1200×630 PNG that
// shows the player's score (huge), subscores (medium), and
// difficulty + date (small) baked into the image itself. iMessage
// renders the og:image as the dominant visual element in the preview
// card, so putting the numbers in the image guarantees the recipient
// sees them regardless of which client they're using.
//
// The function builds the PNG from scratch with a tiny inline 5×7
// bitmap font, scaled up so the score reads from across the room.
// No external image library — uses only the CompressionStream Web API
// (built into the Workers runtime) for the deflate step.

import { isScore, isValidDate, type PagesFunction } from '../_shared';

// ─── Inline FNV-1a + mulberry32 so we can derive the daily difficulty
// from just the date string (matches src/lib/rng.ts + src/patterns/daily.ts).
function dailyDifficultyFor(dateStr: string): 'MEDIUM' | 'HARD' {
  const seed = `tappytap:difficulty:${dateStr}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let a = h >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return r < 0.5 ? 'MEDIUM' : 'HARD';
}

// ─── 5×7 bitmap font. '#' is a lit pixel, '.' is empty. Only chars we
// actually use in the image are defined; everything else renders as a
// blank space-width gap.
const FONT: Record<string, string[]> = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  A: ['..#..', '.#.#.', '#...#', '#...#', '#####', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['....#', '....#', '....#', '....#', '....#', '#...#', '.###.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '.####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
};

// ─── Geometry helpers
function getGlyph(ch: string): string[] | null {
  return FONT[ch] ?? FONT[ch.toUpperCase()] ?? null;
}

function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  // 5 cols per glyph + 1 col of spacing per glyph except the last.
  return text.length * 6 * scale - scale;
}

function fillRect(
  pixels: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  rw: number,
  rh: number,
  color: number[],
): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(w, x + rw);
  const y1 = Math.min(h, y + rh);
  for (let py = y0; py < y1; py++) {
    const rowStart = (py * w + x0) * 3;
    for (let px = x0; px < x1; px++) {
      const i = rowStart + (px - x0) * 3;
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
    }
  }
}

function drawText(
  pixels: Uint8Array,
  w: number,
  h: number,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: number[],
): void {
  let cur = x;
  const upper = text.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i];
    const glyph = getGlyph(ch);
    if (glyph) {
      for (let row = 0; row < 7; row++) {
        const r = glyph[row];
        for (let col = 0; col < 5; col++) {
          if (r[col] === '#') {
            fillRect(pixels, w, h, cur + col * scale, y + row * scale, scale, scale, color);
          }
        }
      }
    }
    cur += 6 * scale;
  }
}

function drawCircle(
  pixels: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
  color: number[],
): void {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const x1 = Math.min(w, Math.ceil(cx + r + 1));
  const y1 = Math.min(h, Math.ceil(cy + r + 1));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const dx = px - cx;
      const dy = py - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= r + 1) {
        const i = (py * w + px) * 3;
        if (d <= r - 0.5) {
          pixels[i] = color[0];
          pixels[i + 1] = color[1];
          pixels[i + 2] = color[2];
        } else {
          // One-pixel anti-aliased edge.
          const e = Math.max(0, Math.min(1, r + 0.5 - d));
          pixels[i] = Math.round(pixels[i] + (color[0] - pixels[i]) * e);
          pixels[i + 1] = Math.round(pixels[i + 1] + (color[1] - pixels[i + 1]) * e);
          pixels[i + 2] = Math.round(pixels[i + 2] + (color[2] - pixels[i + 2]) * e);
        }
      }
    }
  }
}

// ─── PNG building
const CRC_TABLE = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = (CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  // Pipe a one-shot Blob through CompressionStream and read everything
  // back as one ArrayBuffer. Blob acts as the type bridge between
  // ArrayBufferLike-backed Uint8Arrays and the strict BufferSource the
  // streams API expects.
  const blob = new Blob([data as BlobPart]);
  const stream = blob.stream().pipeThrough(new CompressionStream('deflate'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function buildPng(pixels: Uint8Array, w: number, h: number): Promise<Uint8Array> {
  const stride = 1 + w * 3;
  const filtered = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    filtered[y * stride] = 0; // filter type: None
    filtered.set(pixels.subarray(y * w * 3, (y + 1) * w * 3), y * stride + 1);
  }
  const compressed = await deflate(filtered);

  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w, false);
  dv.setUint32(4, h, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', compressed);
  const iendChunk = chunk('IEND', new Uint8Array(0));

  const total = sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const out = new Uint8Array(total);
  let off = 0;
  out.set(sig, off); off += sig.length;
  out.set(ihdrChunk, off); off += ihdrChunk.length;
  out.set(idatChunk, off); off += idatChunk.length;
  out.set(iendChunk, off);
  return out;
}

// ─── Handler
function asNumber(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const onRequestGet: PagesFunction = async ({ request, params }) => {
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const date = typeof rawDate === 'string' ? rawDate : '';
  if (!isValidDate(date)) {
    return new Response('Bad date', { status: 400 });
  }

  const url = new URL(request.url);
  const total = asNumber(url.searchParams.get('s'));
  const rhythm = asNumber(url.searchParams.get('r'));
  const tempo = asNumber(url.searchParams.get('t'));

  // Canvas + palette
  const W = 1200;
  const H = 630;
  const BG = [11, 13, 18];
  const TEXT = [233, 236, 242];
  const DIM = [138, 147, 166];
  const PURPLE = [124, 92, 255];
  const GREEN = [25, 211, 162];

  // Allocate pixel buffer and fill background.
  const pixels = new Uint8Array(W * H * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = BG[0];
    pixels[i + 1] = BG[1];
    pixels[i + 2] = BG[2];
  }

  // Brand dots at top center.
  drawCircle(pixels, W, H, W / 2 - 32, 80, 28, PURPLE);
  drawCircle(pixels, W, H, W / 2 + 32, 80, 28, GREEN);

  // Big score, slightly less monumental than scale 38 — at 38 the
  // bitmap pixelation reads as overwhelming rather than punchy.
  const scoreText = total !== null && isScore(total) ? String(Math.round(total)) : '—';
  const scoreScale = 32;
  const scoreW = textWidth(scoreText, scoreScale);
  drawText(pixels, W, H, scoreText, Math.round((W - scoreW) / 2), 145, scoreScale, TEXT);

  // Subscores line (RHYTHM nn · TEMPO nn). Only render if we got valid
  // numbers for both — otherwise we'd produce gibberish.
  if (rhythm !== null && tempo !== null && isScore(rhythm) && isScore(tempo)) {
    const subText = `RHYTHM ${Math.round(rhythm)}  ·  TEMPO ${Math.round(tempo)}`;
    const subScale = 7;
    const subW = textWidth(subText, subScale);
    drawText(pixels, W, H, subText, Math.round((W - subW) / 2), 425, subScale, TEXT);
  }

  // Footer: difficulty · date.
  const difficulty = dailyDifficultyFor(date);
  const footer = `${difficulty}  ·  ${date}`;
  const footerScale = 5;
  const footerW = textWidth(footer, footerScale);
  drawText(pixels, W, H, footer, Math.round((W - footerW) / 2), 510, footerScale, DIM);

  const png = await buildPng(pixels, W, H);

  return new Response(new Blob([png as BlobPart], { type: 'image/png' }), {
    headers: {
      // Each share URL is unique per (date, score), so once a preview
      // is fetched it's safe to cache long-term.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
