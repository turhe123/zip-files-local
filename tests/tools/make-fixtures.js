// Generates the fictional "Solar Oven Report" fixtures used by __demo and smoke tests.
// Run with: node tests/tools/make-fixtures.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const out = path.join(__dirname, '..', 'fixtures', 'solar-oven-report');
fs.mkdirSync(path.join(out, 'notes'), { recursive: true });

fs.writeFileSync(path.join(out, 'outline.txt'), [
  'Solar Oven Report - Outline',
  '',
  '1. Question: can a pizza-box oven reach 80 C on a sunny afternoon?',
  '2. Materials: cardboard box, aluminium foil, black paper, plastic wrap, thermometer.',
  '3. Method: build the oven, face it toward the sun, read the temperature every 5 minutes.',
  '4. Results: see temperatures.csv and chart.png.',
  '5. Conclusion: the foil flap angle mattered more than the black paper.',
  '6. Next steps: test a double-wall box and a glass lid.',
  '',
].join('\n'));

const rows = ['minute,inside_c,outside_c,sun'];
for (let m = 0; m <= 120; m += 1) {
  const inside = (24 + 58 * (1 - Math.exp(-m / 35)) + Math.sin(m / 9) * 1.5).toFixed(1);
  const outside = (24 + m / 60 + Math.cos(m / 13) * 0.6).toFixed(1);
  rows.push(`${m},${inside},${outside},${m >= 33 && m <= 37 ? 'cloud' : 'clear'}`);
}
fs.writeFileSync(path.join(out, 'temperatures.csv'), rows.join('\n') + '\n');

fs.writeFileSync(path.join(out, 'notes', 'build-notes.txt'), [
  'Build notes (team Sunbeam)',
  '- Day 1: cut the flap, glued foil, the glue stick was too weak, used tape instead.',
  '- Day 2: added plastic wrap window, sealed the edges with tape.',
  '- Day 3: first test, 61 C after 30 minutes. A cloud dropped it by 4 C.',
  '- Day 4: propped the flap at about 45 degrees, reached 79 C.',
  '',
].join('\n'));

// A small bar-chart PNG (RGB, 240x160) with a little texture so it is not trivially compressible.
const W = 240, H = 160;
const raw = Buffer.alloc((W * 3 + 1) * H);
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const bars = [30, 52, 66, 74, 79, 81, 80];
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    let r = 250, g = 248, b = 240;
    if (y % 20 === 0) { r = 220; g = 222; b = 230; }
    const bi = Math.floor((x - 12) / 32);
    if (bi >= 0 && bi < bars.length && (x - 12) % 32 < 22) {
      const top = H - 10 - bars[bi] * 1.6;
      if (y > top && y < H - 10) { r = 240; g = 120 + bi * 12; b = 40; }
    }
    const n = rnd() < 0.08 ? Math.floor(rnd() * 6) - 3 : 0;
    const o = y * (W * 3 + 1) + 1 + x * 3;
    raw[o] = Math.max(0, Math.min(255, r + n));
    raw[o + 1] = Math.max(0, Math.min(255, g + n));
    raw[o + 2] = Math.max(0, Math.min(255, b + n));
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(path.join(out, 'chart.png'), png);
console.log('fixtures written to', out);
