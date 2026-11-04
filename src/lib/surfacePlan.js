// TASKS.csv #1792 / #1864 (review #1646, Kodiak) — a plan map of surface samples in Geochem: each sample at its X / Y, classed by the
// element's saved threshold (lib/anomalyMap.js, as the 3D view does), over a level slice of a block model (the IP chargeability at
// an elevation), drawn on a canvas that goes to Layout as an image with its real-world width (so a scale bar binds to it) and its
// legend. Soils carry no elevation as a rule, so a plan is how a geochemist reads them. These are the pure parts.
import { maskAirCells } from "./voxel.js";

// The air value of a model saved before air was masked at import (#481 / #1659: Kodiak's chargeability keeps -1 above the ground),
// by the import's own rule, on a copy (the model is not changed), or null
const airCache = new WeakMap();
export function modelAirValue(model) {
  if (!model?.cells) return null;
  if (airCache.has(model)) return airCache.get(model);
  const v = maskAirCells(Float64Array.from(model.cells, (c) => c.value)).value;
  airCache.set(model, v);
  return v;
}
const hasValue = (c, air) => Number.isFinite(c.value) && c.value !== air;

// [xmin, ymin, xmax, ymax] of the model's cells with a value (air left out), or null
export function modelFootprint(model) {
  const air = modelAirValue(model);
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const c of model?.cells || []) {
    if (!hasValue(c, air)) continue;
    xmin = Math.min(xmin, c.x - c.dx / 2); xmax = Math.max(xmax, c.x + c.dx / 2); ymin = Math.min(ymin, c.y - c.dy / 2); ymax = Math.max(ymax, c.y + c.dy / 2);
  }
  return Number.isFinite(xmin) ? [xmin, ymin, xmax, ymax] : null;
}

// a box grown by `pad` of its size on every side
export const padBox = (b, pad = 0.06) => { const w = b[2] - b[0], h = b[3] - b[1]; return [b[0] - w * pad, b[1] - h * pad, b[2] + w * pad, b[3] + h * pad]; };
export const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

// [xmin, ymin, xmax, ymax] of the points with a margin; a single point gets a 100 m box
export function planExtent(points, pad = 0.06) {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const p of points || []) { if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue; if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
  if (!Number.isFinite(xmin)) return null;
  const w = Math.max(xmax - xmin, 100), h = Math.max(ymax - ymin, 100);
  const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2, px = w * (0.5 + pad), py = h * (0.5 + pad);
  return [cx - px, cy - py, cx + px, cy + py];
}

// The extent fitted into a canvas of W x H px at one scale (metres per pixel the same on both axes), centred: -> { toPx(x, y) ->
// [px, py], mPerPx, box: the world box the whole canvas shows }
export function fitTransform(extent, W, H) {
  const [x0, y0, x1, y1] = extent;
  const mPerPx = Math.max((x1 - x0) / W, (y1 - y0) / H);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const left = cx - (W / 2) * mPerPx, top = cy + (H / 2) * mPerPx;
  return { mPerPx, box: [left, top - H * mPerPx, left + W * mPerPx, top], toPx: (x, y) => [(x - left) / mPerPx, (top - y) / mPerPx] };
}

// The distinct cell-centre elevations of a block model, highest first
export function modelLevels(model) {
  const zs = new Set();
  for (const c of model?.cells || []) if (Number.isFinite(c.z)) zs.add(+c.z.toFixed(3));
  return [...zs].sort((a, b) => b - a);
}

// The highest level that has a cell with a value (the top of the model below its air cells), or null
export function topLevelWithValues(model) {
  const air = modelAirValue(model);
  let best = -Infinity;
  for (const c of model?.cells || []) if (hasValue(c, air) && Number.isFinite(c.z) && c.z > best) best = c.z;
  return Number.isFinite(best) ? +best.toFixed(3) : null;
}

// The level a plan starts at: the highest one where at least half as many cells have a value as on the fullest level, i.e. below
// the ground over most of the model (the very top level with a value cuts only the highest hill)
export function defaultPlanLevel(model) {
  const air = modelAirValue(model), n = new Map();
  for (const c of model?.cells || []) if (hasValue(c, air) && Number.isFinite(c.z)) { const k = +c.z.toFixed(3); n.set(k, (n.get(k) || 0) + 1); }
  if (!n.size) return null;
  const most = Math.max(...n.values());
  return [...n.entries()].filter(([, v]) => v >= 0.5 * most).map(([z]) => z).sort((a, b) => b - a)[0];
}

// The cells cut by the horizontal plane at elevation z (its interval [z - dz/2, z + dz/2) holds z) that have a value
export function modelSliceAt(model, z) {
  const air = modelAirValue(model), out = [];
  for (const c of model?.cells || []) {
    if (!hasValue(c, air)) continue;
    const h = (c.dz || 0) / 2;
    if (z >= c.z - h && z < c.z + h) out.push(c);
  }
  return out;
}

// A scale bar of a round length (1, 2 or 5 x 10^n m) no longer than maxPx at mPerPx -> { m, px, label }
export function niceScaleBar(mPerPx, maxPx = 160) {
  const maxM = mPerPx * maxPx;
  const p = 10 ** Math.floor(Math.log10(maxM));
  const m = [5, 2, 1].map((k) => k * p).find((v) => v <= maxM) || p;
  return { m, px: m / mPerPx, label: m >= 1000 ? `${+(m / 1000).toPrecision(3)} km` : `${m} m` };
}
