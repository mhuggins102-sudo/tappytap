// Generate a PNG home-screen icon from scratch using only Node built-ins.
//
// iOS Safari's apple-touch-icon support for SVG is unreliable — older
// versions ignore SVG entirely and fall back to a screenshot or the
// first letter of the title. A PNG sidesteps that. We rasterize the
// same dotted-row design as the SVG into a 512x512 RGB image and write
// it directly to public/apple-touch-icon.png.
//
// PNG format reference: https://www.w3.org/TR/png/

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'public', 'apple-touch-icon.png');

const W = 512;
const H = 512;
// Gradient background (top → bottom). Mirrors the SVG version.
const BG_TOP = [28, 31, 47];   // #1c1f2f
const BG_BOT = [11, 13, 18];   // #0b0d12
// Dot colour gradient (left → right) for the row of dots.
const DOT_LEFT = [88, 197, 255];  // #58c5ff
const DOT_RIGHT = [123, 139, 255]; // #7b8bff
const CIRCLES = [
  { cx: 112, cy: 256, r: 40, t: 0.0 },
  { cx: 208, cy: 256, r: 40, t: 0.33 },
  { cx: 304, cy: 256, r: 52, t: 0.66 },
  { cx: 408, cy: 256, r: 40, t: 1.0 },
];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function lerpColor(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Rasterize into a raw RGB buffer (no alpha).
const pixels = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  const bg = lerpColor(BG_TOP, BG_BOT, y / (H - 1));
  for (let x = 0; x < W; x++) {
    let r = bg[0], g = bg[1], b = bg[2];
    for (const c of CIRCLES) {
      const dx = x - c.cx;
      const dy = y - c.cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= c.r + 1) {
        const dotColor = lerpColor(DOT_LEFT, DOT_RIGHT, c.t);
        if (d <= c.r - 0.5) {
          r = dotColor[0]; g = dotColor[1]; b = dotColor[2];
        } else {
          // Simple one-pixel anti-aliased edge.
          const edge = Math.max(0, Math.min(1, c.r + 0.5 - d));
          r = lerp(r, dotColor[0], edge);
          g = lerp(g, dotColor[1], edge);
          b = lerp(b, dotColor[2], edge);
        }
      }
    }
    const i = (y * W + x) * 3;
    pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
  }
}

// PNG requires each scanline to be prefixed with a filter-type byte.
// Filter 0 = None (raw pixel data).
const stride = 1 + W * 3;
const filtered = Buffer.alloc(H * stride);
for (let y = 0; y < H; y++) {
  filtered[y * stride] = 0;
  pixels.copy(filtered, y * stride + 1, y * W * 3, (y + 1) * W * 3);
}

const compressed = deflateSync(filtered);

// CRC-32 (PNG variant): polynomial 0xedb88320, init 0xffffffff, output XOR 0xffffffff.
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth: 8 bits per channel
ihdr[9] = 2;  // colour type 2 = RGB (no alpha)
ihdr[10] = 0; // compression: deflate
ihdr[11] = 0; // filter: standard set
ihdr[12] = 0; // interlace: none

const png = Buffer.concat([
  SIG,
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(OUT, png);
console.log(`Wrote ${OUT} (${png.length} bytes, ${W}x${H})`);
