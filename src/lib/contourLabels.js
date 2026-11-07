// TASKS.csv #1466 (review #1352, Silvertip) / #1622 (review #1497, Lawyers) — a contour layer (a boundary with contourLevels, made by
// Maps > Terrain > Generate contours or a geochemistry grid's Contours) had no labels and no index contours: 28 terrain levels read
// alike, and a soil grid's 0.0059 / 0.012 / 0.02 / 0.04 ppm rings could not be told apart. Which levels are index contours, and where
// along their lines the labels go. Pure; the 3D view draws them (lib/viewer/sceneBuilders.js syncBoundaries).

const uniqueLevels = (levels) => [...new Set((levels || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);

// the interval between levels: the boundary's own (terrain contours store it), else the smallest step between distinct levels
export function contourIntervalOf(b) {
  if (Number(b?.contourInterval) > 0) return Number(b.contourInterval);
  const u = uniqueLevels(b?.contourLevels);
  let step = Infinity;
  for (let i = 1; i < u.length; i++) { const d = u[i] - u[i - 1]; if (d > 1e-9 && d < step) step = d; }
  return Number.isFinite(step) ? step : null;
}

// A few chosen levels (a geochemistry grid's 4 percentiles) are all index contours; a regular series (terrain every 50 m) has one
// every `every` intervals, on round multiples of it (every 250 m), so the labelled levels do not depend on where the data start.
export const FEW_LEVELS = 8;
export function indexLevels(b, every = 5) {
  const u = uniqueLevels(b?.contourLevels);
  if (u.length <= FEW_LEVELS) return new Set(u);
  const step = contourIntervalOf(b);
  if (!step) return new Set(u);
  const big = step * every;
  const out = u.filter((v) => Math.abs(v / big - Math.round(v / big)) < 1e-6);
  return new Set(out.length ? out : u.filter((_, i) => i % every === 0)); // irregular levels: every fifth
}

// short, as a contour label reads: 1250, 12.5, 0.012
export function levelText(v) {
  const a = Math.abs(v);
  if (a >= 100) return String(Math.round(v));
  if (a >= 1) return String(+v.toFixed(2));
  return String(+v.toPrecision(2));
}

const lineLength = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; };
// the point (and the vertex index before it) at arc length s
function pointAt(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + d >= s && d > 0) { const t = (s - acc) / d; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: Number.isFinite(a.z) && Number.isFinite(b.z) ? a.z + (b.z - a.z) * t : a.z }; }
    acc += d;
  }
  const p = pts[pts.length - 1];
  return { x: p.x, y: p.y, z: p.z };
}

// Label spots along the index contours: one every `spacing` metres of line (by default a quarter of the layer's extent), a line
// shorter than a fifth of the spacing unlabelled (a tiny loop round one sample would be all label). At most `max`, taken
// round-robin from the longest lines down, so a layer of 800 lines gets a label on each of its main contours before a second
// on any. -> [{ line, level, text, x, y, z }]
export function contourLabelSpots(b, { every = 5, max = 150, spacing = null } = {}) {
  const lines = b?.polylines || [], levels = b?.contourLevels || [];
  if (!lines.length || !levels.length) return [];
  const index = indexLevels(b, every);
  let sp = spacing;
  if (!(sp > 0)) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const l of lines) for (const p of l) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    sp = Math.max(1, Math.hypot(x1 - x0, y1 - y0) / 4);
  }
  const perLine = [];
  lines.forEach((pts, i) => {
    const level = Number(levels[i]);
    if (!Number.isFinite(level) || !index.has(level) || (pts?.length || 0) < 2) return;
    const L = lineLength(pts);
    if (L < sp / 5) return;
    const n = Math.max(1, Math.floor(L / sp));
    const spots = [];
    for (let k = 0; k < n; k++) spots.push({ line: i, level, text: levelText(level), ...pointAt(pts, (L * (k + 0.5)) / n) });
    perLine.push({ L, spots });
  });
  perLine.sort((a, b2) => b2.L - a.L);
  const out = [];
  for (let round = 0; out.length < max; round++) {
    let any = false;
    for (const pl of perLine) { if (round < pl.spots.length) { out.push(pl.spots[round]); any = true; if (out.length >= max) break; } }
    if (!any) break;
  }
  return out;
}
