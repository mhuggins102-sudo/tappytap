// Generate the OpenGraph share-preview PNG. iMessage and several other
// link-preview clients don't reliably render SVG og:images, so we ship
// a PNG version alongside (or instead of) the SVG.
//
// Same dot motif as apple-touch-icon, but in the 1200×630 landscape
// aspect ratio expected by OG / Twitter Card consumers.

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'public', 'og-image.png');

const W = 1200;
const H = 630;
const BG_TOP = [28, 31, 47];
const BG_BOT = [11, 13, 18];
const DOT_LEFT = [88, 197, 255];
const DOT_RIGHT = [123, 139, 255];
// Five dots centered horizontally and vertically — slightly larger
// "anchor" in the middle to give the row a visual focal point.
const CIRCLES = [
  { cx: 380, cy: 315, r: 28, t: 0.0 },
  { cx: 480, cy: 315, r: 28, t: 0.25 },
  { cx: 600, cy: 315, r: 42, t: 0.5 },
  { cx: 720, cy: 315, r: 28, t: 0.75 },
  { cx: 820, cy: 315, r: 28, t: 1.0 },
];

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function lerpColor(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

const pixels = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  const bg = lerpColor(BG_TOP, BG_BOT, y / (H - 1));
  for (let x = 0; x < W; x++) {
    let r = bg[0], g = bg[1], b = bg[2];
    for (const c of CIRCLES) {
      const d = Math.sqrt((x - c.cx) ** 2 + (y - c.cy) ** 2);
      if (d <= c.r + 1) {
        const dc = lerpColor(DOT_LEFT, DOT_RIGHT, c.t);
        if (d <= c.r - 0.5) {
          r = dc[0]; g = dc[1]; b = dc[2];
        } else {
          const e = Math.max(0, Math.min(1, c.r + 0.5 - d));
          r = lerp(r, dc[0], e); g = lerp(g, dc[1], e); b = lerp(b, dc[2], e);
        }
      }
    }
    const i = (y * W + x) * 3;
    pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
  }
}

const stride = 1 + W * 3;
const filtered = Buffer.alloc(H * stride);
for (let y = 0; y < H; y++) {
  filtered[y * stride] = 0;
  pixels.copy(filtered, y * stride + 1, y * W * 3, (y + 1) * W * 3);
}
const compressed = deflateSync(filtered);

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
  const tb = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crcBuf]);
}

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  SIG,
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(OUT, png);
console.log(`Wrote ${OUT} (${png.length} bytes, ${W}x${H})`);
