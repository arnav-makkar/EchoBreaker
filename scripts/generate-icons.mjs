#!/usr/bin/env node
// EchoBreaker icon generator.
//
// Draws a two-tone "split filter bubble" icon at 16/48/128 px:
//
//   - rounded off-white square background
//   - a large centered circle
//     - left half: soft red  (#ef4444)
//     - right half: soft blue (#3b82f6)
//   - thin white gap between the two halves (the "break" in the bubble)
//   - dark-gray 1-2 px outer ring around the circle
//
// Pure Node, no dependencies: we hand-roll the PNG (IHDR, IDAT via zlib,
// IEND) because pulling in `sharp` or `canvas` would be absurd for three
// small icons.

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');

// ---- colors (rgb tuples) -------------------------------------------------

const BG         = [249, 250, 251];  // #f9fafb off-white
const LEFT_FILL  = [239,  68,  68];  // #ef4444 red
const RIGHT_FILL = [ 59, 130, 246];  // #3b82f6 blue
const RING       = [ 31,  41,  55];  // #1f2937 dark gray
const GAP        = [255, 255, 255];  // pure white

// ---- PNG helpers ---------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function writePng(path, size, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8]  = 8;   // bit depth
  ihdr[9]  = 2;   // color type = RGB
  ihdr[10] = 0;   // compression
  ihdr[11] = 0;   // filter
  ihdr[12] = 0;   // interlace

  // IDAT: each scanline = filter byte (0) + RGB triples
  const rowLen = 1 + size * 3;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowLen;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3;
      const [r, g, b] = pixels[y * size + x];
      raw[px]     = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  const idat = deflateSync(raw);

  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  return png.length;
}

// ---- icon drawing --------------------------------------------------------

function drawIcon(size) {
  const pixels = new Array(size * size).fill(null).map(() => BG);

  // Geometry, normalized to the icon size
  const cx = size / 2;
  const cy = size / 2;

  // Circle radii — tuned so the design still reads at 16px.
  const outerR = size * 0.44;
  const ringThickness = Math.max(1, Math.round(size * 0.035));
  const innerR = outerR - ringThickness;

  // Width of the vertical white gap down the middle of the bubble.
  // Proportional to size but capped at 1 pixel on 16px so it stays crisp.
  const gapHalfWidth = size >= 48 ? size * 0.025 : 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy);

      if (r > outerR) continue;                  // background
      if (r > innerR) {
        pixels[y * size + x] = RING;             // outer ring
        continue;
      }

      // Inside the circle: split left/right with a thin white gap.
      if (Math.abs(dx) < gapHalfWidth) {
        pixels[y * size + x] = GAP;
      } else if (dx < 0) {
        pixels[y * size + x] = LEFT_FILL;
      } else {
        pixels[y * size + x] = RIGHT_FILL;
      }
    }
  }

  return pixels;
}

// ---- main ----------------------------------------------------------------

mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  const pixels = drawIcon(size);
  const path = join(outDir, `icon${size}.png`);
  const bytes = writePng(path, size, pixels);
  console.log(`wrote ${path} (${bytes} bytes, ${size}x${size})`);
}
