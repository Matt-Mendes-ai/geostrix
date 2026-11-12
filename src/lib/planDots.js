// TASKS.csv #2988 / #2989 (WA iron review) — the Maps plan's collars on a 6,390-hole project.
// #2988: every frame drew 6,390 dots with a beginPath / fill / stroke each, and every boundary vertex, on or off screen: a pan frame took
// 65-180 ms with the collars alone and 430-470 ms with the terrain, five rasters and 1,040 contour lines. The dots are now culled to the
// view and drawn as one path per colour; polylines off the view are skipped by their bounding box (computed once per line).
// #2989: at Fit (13 m a pixel, holes 25 m apart) each 2.6 px dot's white halo painted over its neighbours and the drilled blocks became
// pale blotches (black blobs when coloured). The dot shrinks with the holes' spacing on screen and loses its outline when the dots
// would touch. Pure, except drawDots (a canvas 2D context).

// the holes' typical spacing: the median distance to the nearest other hole (m), from up to `sample` holes; null under 2 holes
export function collarSpacing(collars, sample = 2000) {
  const pts = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y));
  if (pts.length < 2) return null;
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const p of pts) { if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
  const cell = Math.max(1e-6, Math.sqrt(((xmax - xmin) * (ymax - ymin) || 1) / pts.length)); // about one hole a cell
  const grid = new Map(), key = (i, j) => i * 1e6 + j;
  for (const p of pts) { const k = key(Math.floor((p.x - xmin) / cell), Math.floor((p.y - ymin) / cell)); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
  const step = Math.max(1, Math.floor(pts.length / sample)), d = [];
  for (let n = 0; n < pts.length; n += step) {
    const p = pts[n], ci = Math.floor((p.x - xmin) / cell), cj = Math.floor((p.y - ymin) / cell);
    let best = Infinity;
    for (let r = 1; r <= 64 && best === Infinity; r++) { // widen the ring until a neighbour is found, then one more ring for the true nearest
      for (let rr = r; rr <= r + 1; rr++) for (let i = ci - rr; i <= ci + rr; i++) for (let j = cj - rr; j <= cj + rr; j++) {
        for (const q of grid.get(key(i, j)) || []) { if (q === p) continue; const dd = Math.hypot(q.x - p.x, q.y - p.y); if (dd > 0 && dd < best) best = dd; }
      }
    }
    if (Number.isFinite(best)) d.push(best);
  }
  if (!d.length) return null;
  d.sort((a, b) => a - b);
  return d[d.length >> 1];
}

// the dot at this scale: { r (px), halo: an outline only when the dots are at least 6 px apart }
export function dotStyle(spacingM, mPerPx, coloured = false) {
  const base = coloured ? 3.6 : 2.6;
  const gapPx = Number.isFinite(spacingM) && spacingM > 0 && mPerPx > 0 ? spacingM / mPerPx : Infinity;
  // 0.4 x the gap keeps neighbours apart (a dot 0.8 of the spacing wide) down to 0.75 px, where a dot is still seen; one colour no longer paints
  // over the other in a drilled block
  return { r: Math.max(0.75, Math.min(base, 0.4 * gapPx)), halo: gapPx >= 6 };
}

// the dots in view, grouped by colour: Map(colour | null -> Float32Array [x0, y0, x1, y1 ...] in pixels). colourOf(c) -> colour | null
// (null: a hole with no value under the colouring, drawn as a grey ring); X / Y: world -> pixel; w / h: the canvas; pad: the dot radius
export function dotsInView(collars, colourOf, X, Y, w, h, pad = 4) {
  const acc = new Map();
  for (const c of collars || []) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y)) continue;
    const px = X(c.x), py = Y(c.y);
    if (px < -pad || py < -pad || px > w + pad || py > h + pad) continue;
    const col = colourOf(c);
    let a = acc.get(col);
    if (!a) acc.set(col, (a = []));
    a.push(px, py);
  }
  return new Map([...acc].map(([k, v]) => [k, Float32Array.from(v)]));
}

// one path per colour (a fill, and the outline when `halo`); the null group as small grey rings
export function drawDots(ctx, groups, { r, halo, stroke = "#ffffff", empty = "#8a9099" }) {
  const TAU = Math.PI * 2;
  for (const [col, xy] of groups) {
    ctx.beginPath();
    const rr = col ? r : Math.min(r, 2);
    for (let i = 0; i < xy.length; i += 2) { ctx.moveTo(xy[i] + rr, xy[i + 1]); ctx.arc(xy[i], xy[i + 1], rr, 0, TAU); }
    if (col) { ctx.fillStyle = col; ctx.fill(); if (halo) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } }
    else { ctx.strokeStyle = empty; ctx.lineWidth = 1; ctx.stroke(); }
  }
}

// a polyline's bounding box, computed once per line (the line arrays are the store's, unchanged between frames)
const boxes = new WeakMap();
export function polylineBox(pl) {
  let b = boxes.get(pl);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of pl) { if (p.x < b[0]) b[0] = p.x; if (p.y < b[1]) b[1] = p.y; if (p.x > b[2]) b[2] = p.x; if (p.y > b[3]) b[3] = p.y; }
    boxes.set(pl, b);
  }
  return b;
}
// does the polyline's box meet the view [xmin, ymin, xmax, ymax] (world)?
export const polylineInView = (pl, view) => { const b = polylineBox(pl); return b[2] >= view[0] && b[0] <= view[2] && b[3] >= view[1] && b[1] <= view[3]; };
