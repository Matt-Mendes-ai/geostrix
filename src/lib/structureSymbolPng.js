// TASKS.csv #3066 — a USGS (FGDC) structure symbol (lib/structureSymbols.js) as a small white PNG for a KMZ, replacing #2681's single strike
// icon: drawn with its strike line north-south and its dip side east, as Google Earth turns an icon clockwise by <heading> = the right-hand-rule
// strike (so v, down dip, points to strike + 90). White, so the KML <color> tints it to the class colour. Pure: no DOM.
import { symbolGeometry } from "./structureSymbols.js";
import { rgbaToPng } from "./strikeIcon.js";

// the symbol's pixels: { width, height, rgba }. The icon spans the symbol's largest reach from the point (the point at the centre, as
// Google Earth anchors an icon at its centre), with a margin; strokes `strokePx` wide.
export function symbolPixels(symbol, size = 64, { strokePx = null } = {}) {
  const { segments, triangles } = symbolGeometry(symbol);
  let reach = 0;
  for (const [a, b, c, d] of segments) reach = Math.max(reach, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  for (const t of triangles) for (const v of t) reach = Math.max(reach, Math.abs(v));
  const k = (size / 2 - 2) / Math.max(reach, 0.5), cx = size / 2, cy = size / 2, w = strokePx ?? Math.max(1.5, size / 32);
  const px = (u, v) => [cx + v * k, cy - u * k]; // u (strike) up, v (down dip) right
  const rgba = new Uint8Array(size * size * 4);
  const set = (x, y) => { if (x < 0 || y < 0 || x >= size || y >= size) return; const i = (y * size + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 255; };
  for (const [u1, v1, u2, v2] of segments) {
    const [x1, y1] = px(u1, v1), [x2, y2] = px(u2, v2), r = w / 2;
    const x0 = Math.floor(Math.min(x1, x2) - r), x3 = Math.ceil(Math.max(x1, x2) + r), y0 = Math.floor(Math.min(y1, y2) - r), y3 = Math.ceil(Math.max(y1, y2) + r);
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1e-9;
    for (let y = y0; y <= y3; y++) for (let x = x0; x <= x3; x++) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / L2));
      if (Math.hypot(x + 0.5 - (x1 + t * dx), y + 0.5 - (y1 + t * dy)) <= r) set(x, y);
    }
  }
  for (const t of triangles) {
    const [a, b, c] = [px(t[0], t[1]), px(t[2], t[3]), px(t[4], t[5])];
    const x0 = Math.floor(Math.min(a[0], b[0], c[0])), x3 = Math.ceil(Math.max(a[0], b[0], c[0])), y0 = Math.floor(Math.min(a[1], b[1], c[1])), y3 = Math.ceil(Math.max(a[1], b[1], c[1]));
    const s = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    for (let y = y0; y <= y3; y++) for (let x = x0; x <= x3; x++) {
      const p = [x + 0.5, y + 0.5], d1 = s(a, b, p), d2 = s(b, c, p), d3 = s(c, a, p);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) set(x, y);
    }
  }
  return { width: size, height: size, rgba };
}
// strokeScale: TASKS.csv #3091 — the set's line thickness, a factor on the default stroke
export function symbolPng(symbol, size = 64, { strokeScale = 1 } = {}) { const p = symbolPixels(symbol, size, { strokePx: Math.max(1.5, size / 32) * strokeScale }); return rgbaToPng(p.width, p.height, p.rgba); }
// the icon's path inside the KMZ, one per symbol: "files/fgdc_6_2.png"
export const symbolIconPath = (symbol) => `files/fgdc_${String(symbol.fgdc).replace(/[^0-9a-z]+/gi, "_")}.png`;
