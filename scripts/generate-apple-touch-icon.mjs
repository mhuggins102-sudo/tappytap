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
// Solid dark background — matches the favicon.
const BG = [11, 13, 18]; // #0b0d12
// Two circles, purple and green, matching favicon.svg.
const CIRCLES = [
  { cx: 176, cy: 256, r: 64, color: [124, 92, 255] }, // #7c5cff
  { cx: 336, cy: 256, r: 64, color: [25, 211, 162] }, // #19d3a2
];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

// Rasterize into a raw RGB buffer (no alpha).
const pixels = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let r = BG[0], g = BG[1], b = BG[2];
    for (const c of CIRCLES) {
      const dx = x - c.cx;
      const dy = y - c.cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= c.r + 1) {
        if (d <= c.r - 0.5) {
          r = c.color[0]; g = c.color[1]; b = c.color[2];
        } else {
          // One-pixel anti-aliased edge between background and circle colour.
          const edge = Math.max(0, Math.min(1, c.r + 0.5 - d));
          r = lerp(r, c.color[0], edge);
          g = lerp(g, c.color[1], edge);
          b = lerp(b, c.color[2], edge);
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
