// TASKS.csv #3829 (Scottie Gold review) — the block models (an IP inversion) and the imported surfaces (DXF isosurfaces) were not on the Maps plan in any
// form: no footprint, no outline, no level slice under the collars (a point survey had 'Outline as boundary', a block model nothing). Pure: a model's
// footprint, its slice at an RL as a grid and its own colours, a surface's outline and its cut at an RL. The Maps plan adds them as a boundary or a raster.
import { colorForVoxelValue } from "./layers.js";
import { hexToRgb } from "./colorRamp.js";
import { convexHull } from "./planSurveys.js";
import { meshPlanCut } from "./levelPlan.js";
import { arrMin, arrMax, median } from "./arrayStats.js";

const sound = (c) => c && [c.x, c.y, c.z, c.dx, c.dy, c.dz, c.value].every(Number.isFinite) && c.dx > 0 && c.dy > 0 && c.dz > 0;
const sampleOf = (a, n = 20000) => { const st = Math.max(1, Math.ceil(a.length / n)), o = []; for (let i = 0; i < a.length; i += st) o.push(a[i]); return o; };

// the extent of a block model's cells: { box: [xmin, ymin, xmax, ymax], zmin, zmax, n } or null
export function modelExtent(model) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity, n = 0;
  for (const c of model?.cells || []) {
    if (!sound(c)) continue;
    n++;
    if (c.x - c.dx / 2 < x0) x0 = c.x - c.dx / 2; if (c.x + c.dx / 2 > x1) x1 = c.x + c.dx / 2;
    if (c.y - c.dy / 2 < y0) y0 = c.y - c.dy / 2; if (c.y + c.dy / 2 > y1) y1 = c.y + c.dy / 2;
    if (c.z - c.dz / 2 < z0) z0 = c.z - c.dz / 2; if (c.z + c.dz / 2 > z1) z1 = c.z + c.dz / 2;
  }
  return n ? { box: [x0, y0, x1, y1], zmin: z0, zmax: z1, n } : null;
}

// a model's footprint as a boundary (the rectangle round its cells), for addBoundary; null with no cells
export function modelFootprintBoundary(model) {
  const e = modelExtent(model);
  if (!e) return null;
  const [x0, y0, x1, y1] = e.box;
  const ring = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }];
  return { name: `${model.name || "Block model"} footprint`, polylines: [ring], closedFlags: [true], color: "#0e7490", source: { kind: "model footprint", model: model.id || null } };
}

// the model cut by the level rl (cells whose half-open vertical span holds it) laid on a grid of the cells' own plan size (median dx, dy; a coarser one when
// that is over maxCells). -> { nx, ny, x0, yTop, dx, dy, values: Float32Array (row 0 north, NaN blank), valid, bbox, min, max, cells } or { error: "outside", zmin, zmax }
// or { error: "empty" }. Cell sizes may differ; each cell paints every node centre inside it.
export function modelLevelSlice(model, rl, { maxCells = 1_500_000 } = {}) {
  { const e = modelExtent(model); if (e && Math.abs(rl - e.zmax) < 1e-6) rl = e.zmax - 1e-6; } // the model's own top face belongs to its top layer
  const sel = [];
  for (const c of model?.cells || []) if (sound(c) && rl >= c.z - c.dz / 2 && rl < c.z + c.dz / 2) sel.push(c);
  if (!sel.length) { const e = modelExtent(model); return e ? { error: "outside", zmin: e.zmin, zmax: e.zmax } : { error: "empty" }; }
  let dx = median(sampleOf(sel).map((c) => c.dx)), dy = median(sampleOf(sel).map((c) => c.dy));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of sel) { if (c.x - c.dx / 2 < x0) x0 = c.x - c.dx / 2; if (c.x + c.dx / 2 > x1) x1 = c.x + c.dx / 2; if (c.y - c.dy / 2 < y0) y0 = c.y - c.dy / 2; if (c.y + c.dy / 2 > y1) y1 = c.y + c.dy / 2; }
  let nx = Math.max(1, Math.round((x1 - x0) / dx)), ny = Math.max(1, Math.round((y1 - y0) / dy)), coarsened = false;
  if (nx * ny > maxCells) { const f = Math.sqrt((nx * ny) / maxCells); dx *= f; dy *= f; nx = Math.max(1, Math.round((x1 - x0) / dx)); ny = Math.max(1, Math.round((y1 - y0) / dy)); coarsened = true; }
  const values = new Float32Array(nx * ny).fill(NaN);
  for (const c of sel) {
    const a = (c.x - c.dx / 2 - x0) / dx - 0.5, b = (c.x + c.dx / 2 - x0) / dx - 0.5; // node i's centre (i + 0.5) dx lies in the cell when a <= i < b
    const p = (y1 - (c.y + c.dy / 2)) / dy - 0.5, q = (y1 - (c.y - c.dy / 2)) / dy - 0.5; // row j counts down from the north edge
    let i0 = Math.ceil(a - 1e-9), i1 = Math.ceil(b - 1e-9) - 1, j0 = Math.ceil(p - 1e-9), j1 = Math.ceil(q - 1e-9) - 1;
    if (i1 < i0) i0 = i1 = Math.min(nx - 1, Math.max(0, Math.round((a + b) / 2))); // smaller than a node: the nearest one
    if (j1 < j0) j0 = j1 = Math.min(ny - 1, Math.max(0, Math.round((p + q) / 2)));
    i0 = Math.max(0, i0); i1 = Math.min(nx - 1, i1); j0 = Math.max(0, j0); j1 = Math.min(ny - 1, j1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) values[j * nx + i] = c.value;
  }
  let valid = 0;
  for (let k = 0; k < values.length; k++) if (Number.isFinite(values[k])) valid++;
  return { nx, ny, x0: x0 + dx / 2, yTop: y1 - dy / 2, dx, dy, values, valid, bbox: [x0, y1 - ny * dy, x0 + nx * dx, y1], min: arrMin(values.filter(Number.isFinite)), max: arrMax(values.filter(Number.isFinite)), cells: sel.length, coarsened };
}

// the model's own colours for a slice: a lookup of 4096 colours over the values' range (log-spaced when the values are positive over two decades or more,
// as a resistivity's stops are), then the RGBA of each node. -> { rgba: Uint8ClampedArray, lo, hi, stops: [{ value, color }] }
export function sliceColours(model, values) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const rgba = new Uint8ClampedArray(values.length * 4);
  if (!(lo <= hi)) return { rgba, lo: null, hi: null, stops: [] };
  const N = 4096, log = lo > 0 && hi / lo >= 100, span = hi > lo ? (log ? Math.log(hi / lo) : hi - lo) : 1;
  const valueAt = (k) => (hi > lo ? (log ? lo * Math.exp((span * k) / (N - 1)) : lo + (span * k) / (N - 1)) : lo);
  const lut = new Uint8ClampedArray(N * 3);
  for (let k = 0; k < N; k++) {
    const col = String(colorForVoxelValue(model, valueAt(k)) || ""), m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(col), rgb = m ? [+m[1], +m[2], +m[3]] : hexToRgb(col) || [128, 128, 128];
    lut[k * 3] = rgb[0]; lut[k * 3 + 1] = rgb[1]; lut[k * 3 + 2] = rgb[2];
  }
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const k = hi > lo ? Math.min(N - 1, Math.max(0, Math.round(((log ? Math.log(v / lo) : v - lo) / span) * (N - 1)))) : 0;
    rgba[i * 4] = lut[k * 3]; rgba[i * 4 + 1] = lut[k * 3 + 1]; rgba[i * 4 + 2] = lut[k * 3 + 2]; rgba[i * 4 + 3] = 255;
  }
  const hex = (k) => { const r = (n) => lut[k * 3 + n].toString(16).padStart(2, "0"); return `#${r(0)}${r(1)}${r(2)}`; };
  const stops = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const k = Math.round((i / 7) * (N - 1)); return { value: valueAt(k), color: hex(k) }; });
  return { rgba, lo, hi, stops };
}

// the unit in a property's name: 'Chargeability (mV/V)' -> 'mV/V'
export const propertyUnit = (property) => { const m = /\(([^()]+)\)\s*$/.exec(String(property || "")); return m ? m[1] : ""; };

// ---- surfaces: { vertices: [x, y, z, ...] (world), indices: [i, j, k, ...] }
export function surfaceOutlineBoundary(surface) {
  const v = surface?.vertices || [], pts = [];
  for (let i = 0; i + 2 < v.length; i += 3) pts.push({ x: v[i], y: v[i + 1] });
  const ring = convexHull(pts);
  return ring ? { name: `${surface.name || "Surface"} outline`, polylines: [ring], closedFlags: [true], color: "#b45309", source: { kind: "surface outline", surface: surface.id || null } } : null;
}

// the surface cut by z = rl, the segments joined where they meet -> { polylines: [[{ x, y }, ...]], closedFlags, segments } or null with no cut
export function surfaceCutBoundary(surface, rl) {
  const v = surface?.vertices || [], ix = surface?.indices || [];
  const segs = meshPlanCut(Math.floor(v.length / 3), ix, (i) => ({ x: v[i * 3], y: v[i * 3 + 1], z: v[i * 3 + 2] }), rl);
  if (!segs.length) return null;
  const key = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`; // joined to the centimetre
  const at = new Map();
  segs.forEach((s, i) => { for (const k of [key(s[0], s[1]), key(s[2], s[3])]) (at.get(k) || at.set(k, []).get(k)).push(i); });
  const used = new Uint8Array(segs.length), lines = [], closed = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const line = [{ x: segs[s0][0], y: segs[s0][1] }, { x: segs[s0][2], y: segs[s0][3] }];
    for (const dir of [1, 0]) { // grow the end, then (reversed) the start
      if (!dir) line.reverse();
      for (;;) {
        const e = line[line.length - 1], next = (at.get(key(e.x, e.y)) || []).find((i) => !used[i]);
        if (next == null) break;
        used[next] = 1;
        const s = segs[next];
        line.push(key(s[0], s[1]) === key(e.x, e.y) ? { x: s[2], y: s[3] } : { x: s[0], y: s[1] });
      }
    }
    const a = line[0], b = line[line.length - 1], isClosed = line.length > 3 && key(a.x, a.y) === key(b.x, b.y);
    lines.push(line); closed.push(isClosed);
  }
  return { name: `${surface.name || "Surface"} at RL ${rl} m`, polylines: lines, closedFlags: closed, color: "#b45309", segments: segs.length, source: { kind: "surface cut", surface: surface.id || null, rl } };
}
