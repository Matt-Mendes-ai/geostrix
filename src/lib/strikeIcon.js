// TASKS.csv #2681 (split from #2090) — the outcrop KML export rotated Google Earth's default pushpin by each measurement's strike: the
// heading was there, the symbol was not. This draws a strike-and-dip symbol as a small PNG (no network: it goes INSIDE the .kmz):
// a white strike line north-south through the centre and a dip tick pointing east, on a transparent ground. White, so the style's
// <color> tints it to the structure class's colour. Google Earth turns an icon clockwise by <heading>, so with heading = the
// right-hand-rule strike the long line lies along the strike and the tick points down dip (strike + 90). Pure: no DOM.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes, c = 0xffffffff) {
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return c;
}
const be32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

function chunk(type, data) {
  const t = new TextEncoder().encode(type);
  const crc = (crc32(data, crc32(t)) ^ 0xffffffff) >>> 0;
  return Uint8Array.from([...be32(data.length), ...t, ...data, ...be32(crc)]);
}
// zlib with STORED (uncompressed) deflate blocks: valid, and a 64 px icon is a few kB either way
function zlibStored(raw) {
  const out = [0x78, 0x01];
  for (let off = 0; off < raw.length || off === 0; off += 65535) {
    const n = Math.min(65535, raw.length - off), last = off + n >= raw.length ? 1 : 0;
    out.push(last, n & 255, n >>> 8, ~n & 255, (~n >>> 8) & 255);
    for (let i = 0; i < n; i++) out.push(raw[off + i]);
    if (!raw.length) break;
  }
  let a = 1, b = 0;
  for (let i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
  out.push(...be32(((b << 16) | a) >>> 0));
  return Uint8Array.from(out);
}
// an RGBA picture (row 0 at the top) -> PNG bytes
export function rgbaToPng(width, height, rgba) {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1); }
  const ihdr = Uint8Array.from([...be32(width), ...be32(height), 8, 6, 0, 0, 0]); // 8-bit RGBA
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  return Uint8Array.from([...sig, ...chunk("IHDR", ihdr), ...chunk("IDAT", zlibStored(raw)), ...chunk("IEND", new Uint8Array(0))]);
}
// the symbol's pixels: { width, height, rgba }
export function strikeSymbolPixels(size = 64) {
  const rgba = new Uint8Array(size * size * 4), c = size / 2, w = Math.max(2, Math.round(size / 16));
  const paint = (x0, x1, y0, y1) => { for (let y = Math.max(0, y0); y < Math.min(size, y1); y++) for (let x = Math.max(0, x0); x < Math.min(size, x1); x++) { const i = (y * size + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 255; } };
  const m = Math.round(size * 0.08);
  paint(Math.round(c - w / 2), Math.round(c + w / 2), m, size - m); // the strike line, north-south
  paint(Math.round(c), Math.round(c + size * 0.28), Math.round(c - w / 2), Math.round(c + w / 2)); // the dip tick, east
  return { width: size, height: size, rgba };
}
export const STRIKE_ICON_PATH = "files/strike.png";
export function strikeSymbolPng(size = 64) {
  const p = strikeSymbolPixels(size);
  return rgbaToPng(p.width, p.height, p.rgba);
}
