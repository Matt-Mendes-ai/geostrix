// TASKS.csv #851 — the evidence overlay for targeting (Matt: "let's do A to D", A): evidence layers on one grid,
// combined by fuzzy overlay (An, Moon & Rencz 1991, Canadian Journal of Exploration Geophysics 27, 1-11; Bonham-Carter
// 1994, Geographic Information Systems for Geoscientists, ch. 9) and, with known occurrences, by weights of evidence
// (Bonham-Carter, Agterberg & Wright 1989; Agterberg & Bonham-Carter 1990), with a prediction-area plot (Yousefi &
// Carranza 2015, Computers & Geosciences 79, 69-81) to judge the result.
//
// Honesty: a fuzzy overlay only says where the chosen evidence agrees under the memberships the geologist typed - it
// predicts nothing by itself. Weights of evidence are statistics of a handful of known points over many cells: with
// few points the weights are unstable (their standard errors are shown), the layers are assumed conditionally
// independent given the deposits (the omnibus check below reports when the posterior over-predicts), and the result
// is only as good as the training points, which at property scale are usually the drilled targets - circular when
// the evidence was what led to the drilling. All of that is printed with the result.
import { populations, groupKeyFn, robustZ, defaultPopulations } from "./thresholds.js";
import { quantileLinear } from "./arrayStats.js"; // TASKS.csv #1114
import { PATHFINDER_PRESETS } from "./anomalyMap.js";
import { valueIn } from "./geochem.js";
import { gridValues } from "./gridExport.js";

export const MAX_CELLS = 400000;

// ---------- the grid ----------
// From the terrain (node grid, coarsened by an integer factor to MAX_CELLS) or from an extent at a cell size
export function evidenceGrid({ terrain = null, extent = null, cellSize = null, maxCells = MAX_CELLS } = {}) {
  if (terrain?.bbox) {
    const [xmin, ymin, xmax, ymax] = terrain.bbox;
    let f = 1;
    while ((Math.ceil(terrain.gridW / f) * Math.ceil(terrain.gridH / f)) > maxCells) f++;
    const dx = ((xmax - xmin) / Math.max(1, terrain.gridW - 1)) * f, dy = ((ymax - ymin) / Math.max(1, terrain.gridH - 1)) * f;
    const nx = Math.ceil(terrain.gridW / f), ny = Math.ceil(terrain.gridH / f);
    return { nx, ny, x0: xmin, yTop: ymax, dx, dy, from: "terrain", coarsened: f };
  }
  if (!extent) return null;
  const [xmin, ymin, xmax, ymax] = extent;
  let cell = cellSize || Math.max(10, Math.max(xmax - xmin, ymax - ymin) / 500);
  while (Math.ceil((xmax - xmin) / cell) * Math.ceil((ymax - ymin) / cell) > maxCells) cell *= 1.25;
  const nx = Math.max(1, Math.ceil((xmax - xmin) / cell)), ny = Math.max(1, Math.ceil((ymax - ymin) / cell));
  return { nx, ny, x0: xmin + cell / 2, yTop: ymax - cell / 2, dx: cell, dy: cell, from: "extent", coarsened: 1 };
}
export const cellXY = (g, k) => [g.x0 + (k % g.nx) * g.dx, g.yTop - Math.floor(k / g.nx) * g.dy];

// ---------- evidence layers (Float32Array over the grid, NaN = no evidence) ----------
// a #326 value grid (x0 / yTop cell centres, dx / dy) sampled bilinearly
export function rasterEvidence(g, raster) {
  const v = gridValues(raster.values), out = new Float32Array(g.nx * g.ny).fill(NaN);
  const { nx, ny, x0, yTop, dx, dy } = raster;
  for (let k = 0; k < out.length; k++) {
    const [x, y] = cellXY(g, k);
    const fx = (x - x0) / dx, fy = (yTop - y) / dy;
    if (fx < -0.5 || fy < -0.5 || fx > nx - 0.5 || fy > ny - 0.5) continue;
    const i0 = Math.max(0, Math.min(nx - 1, Math.floor(fx))), j0 = Math.max(0, Math.min(ny - 1, Math.floor(fy)));
    const i1 = Math.min(nx - 1, i0 + 1), j1 = Math.min(ny - 1, j0 + 1), tx = Math.max(0, Math.min(1, fx - i0)), ty = Math.max(0, Math.min(1, fy - j0));
    const a = v[j0 * nx + i0], b = v[j0 * nx + i1], c = v[j1 * nx + i0], d = v[j1 * nx + i1];
    const top = Number.isFinite(a) && Number.isFinite(b) ? a * (1 - tx) + b * tx : Number.isFinite(a) ? a : b;
    const bot = Number.isFinite(c) && Number.isFinite(d) ? c * (1 - tx) + d * tx : Number.isFinite(c) ? c : d;
    const r = Number.isFinite(top) && Number.isFinite(bot) ? top * (1 - ty) + bot * ty : Number.isFinite(top) ? top : bot;
    if (Number.isFinite(r)) out[k] = r;
  }
  return out;
}

// distance (m) to the nearest feature: parts = [[[x, y], ...], ...] (lines, polygon rings or single points), rasterized
// then a Euclidean distance transform (Felzenszwalb & Huttenlocher 2012, Theory of Computing 8, 415-428)
export function distanceEvidence(g, parts) {
  const n = g.nx * g.ny, hit = new Uint8Array(n);
  const mark = (x, y) => { const i = Math.round((x - g.x0) / g.dx), j = Math.round((g.yTop - y) / g.dy); if (i >= 0 && j >= 0 && i < g.nx && j < g.ny) hit[j * g.nx + i] = 1; };
  const step = Math.min(g.dx, g.dy) / 2;
  for (const part of parts) {
    if (!part?.length) continue;
    mark(part[0][0], part[0][1]);
    for (let i = 1; i < part.length; i++) {
      const [ax, ay] = part[i - 1], [bx, by] = part[i], L = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.ceil(L / step));
      for (let s = 1; s <= m; s++) mark(ax + ((bx - ax) * s) / m, ay + ((by - ay) * s) / m);
    }
  }
  if (!hit.some((h) => h)) return new Float32Array(n).fill(NaN);
  return squaredDistanceTransform(hit, g.nx, g.ny, g.dx, g.dy).map((d2) => Math.sqrt(d2));
}
// f = 0 on marked cells, +inf elsewhere; 1-D lower envelope of parabolas along rows (spacing dx) then columns (dy)
export function squaredDistanceTransform(hit, nx, ny, dx, dy) {
  const INF = 1e30, f = new Float64Array(nx * ny);
  for (let i = 0; i < f.length; i++) f[i] = hit[i] ? 0 : INF;
  const pass = (len, stride, count, base, s) => {
    const v = new Int32Array(len), z = new Float64Array(len + 1), d = new Float64Array(len), src = new Float64Array(len);
    for (let line = 0; line < count; line++) {
      const off = base(line);
      for (let q = 0; q < len; q++) src[q] = f[off + q * stride];
      let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < len; q++) {
        let sIntersect = ((src[q] + (q * s) ** 2) - (src[v[k]] + (v[k] * s) ** 2)) / (2 * s * (q - v[k]));
        while (sIntersect <= z[k]) { k--; sIntersect = ((src[q] + (q * s) ** 2) - (src[v[k]] + (v[k] * s) ** 2)) / (2 * s * (q - v[k])); }
        k++; v[k] = q; z[k] = sIntersect; z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < len; q++) { while (z[k + 1] < q * s) k++; d[q] = ((q - v[k]) * s) ** 2 + src[v[k]]; }
      for (let q = 0; q < len; q++) f[off + q * stride] = d[q];
    }
  };
  pass(nx, 1, ny, (j) => j * nx, dx); // along rows
  pass(ny, nx, nx, (i) => i, dy); // along columns
  return Float32Array.from(f, (x) => (x >= INF ? NaN : x));
}

// inverse-distance weighting of points [{ x, y, value }] onto the grid within maxDistance (NaN beyond)
export function pointEvidence(g, points, { power = 2, maxDistance = 500, maxPoints = 12 } = {}) {
  const out = new Float32Array(g.nx * g.ny).fill(NaN);
  const pts = points.filter((p) => Number.isFinite(p.value) && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!pts.length) return out;
  const R = Math.max(1, maxDistance), key = (x, y) => `${Math.floor(x / R)},${Math.floor(y / R)}`, buckets = new Map();
  pts.forEach((p, i) => { const k = key(p.x, p.y); (buckets.get(k) || buckets.set(k, []).get(k)).push(i); });
  const cand = [];
  for (let k = 0; k < out.length; k++) {
    const [x, y] = cellXY(g, k), cx = Math.floor(x / R), cy = Math.floor(y / R);
    cand.length = 0;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (const i of buckets.get(`${cx + ox},${cy + oy}`) || []) { const d = Math.hypot(pts[i].x - x, pts[i].y - y); if (d <= R) cand.push([d, i]); }
    if (!cand.length) continue;
    cand.sort((a, b) => a[0] - b[0]);
    let num = 0, den = 0, exact = null;
    for (const [d, i] of cand.slice(0, maxPoints)) { if (d < 1e-9) { exact = pts[i].value; break; } const w = 1 / d ** power; num += w * pts[i].value; den += w; }
    out[k] = exact != null ? exact : num / den;
  }
  return out;
}

// per-sample values for point evidence: an element's robust z within its medium, or a pathfinder index (mean robust z).
// TASKS.csv #932 — within medium x source when public and project samples are both loaded.
export function sampleValues(samples, { kind, symbol, preset, elements }, units) {
  const keyOf = groupKeyFn(defaultPopulations(samples));
  const z = (sym) => { const out = new Map(); populations(samples, { valueOf: (s) => valueIn(s, sym, units[sym] || "ppm", units), keyOf }).forEach((p) => p.idx.forEach((i, k) => { const v = robustZ(p.values[k], p.summary); if (v != null) out.set(i, v); })); return out; };
  if (kind === "element") { const m = z(symbol); return samples.map((s, i) => ({ x: s.x, y: s.y, value: m.has(i) ? m.get(i) : NaN })); }
  const pr = PATHFINDER_PRESETS.find((p) => p.id === preset) || PATHFINDER_PRESETS[0];
  const els = (elements?.length ? elements : pr.elements).filter((e) => units[e]);
  const maps = els.map(z), need = Math.max(1, Math.ceil(els.length / 2));
  return samples.map((s, i) => { const vs = maps.map((m) => m.get(i)).filter((v) => v != null); return { x: s.x, y: s.y, value: vs.length >= need ? vs.reduce((a, v) => a + v, 0) / vs.length : NaN }; });
}

// ---------- fuzzy overlay ----------
export const quantile = quantileLinear; // TASKS.csv #1114 — arrayStats.js
// membership: linear ramp from `low` (0) to `high` (1), or the reverse when decreasing
export function membership(values, { shape = "increasing", low, high }) {
  const out = new Float32Array(values.length);
  const a = shape === "decreasing" ? high : low, b = shape === "decreasing" ? low : high, span = b - a;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) { out[i] = NaN; continue; }
    const m = span === 0 ? (v >= b ? 1 : 0) : (v - a) / span;
    out[i] = Math.max(0, Math.min(1, m));
  }
  return out;
}
export const FUZZY_OPERATORS = ["and", "or", "product", "sum", "gamma"];
// members: [Float32Array]. AND / product / gamma: a cell with any NaN member -> NaN (every evidence must speak). TASKS.csv #1162 —
// OR / algebraic sum: an evidence with no value there is absent, not a veto (a geologist uses OR to reach past the drilling with the
// survey), so only a cell with NO evidence at all is NaN.
export function fuzzyCombine(members, operator = "gamma", gamma = 0.9) {
  const n = members[0]?.length || 0, out = new Float32Array(n), lenient = operator === "or" || operator === "sum";
  for (let i = 0; i < n; i++) {
    let mn = 1, mx = 0, prod = 1, sum1 = 1, bad = false, seen = 0;
    for (const m of members) { const v = m[i]; if (!Number.isFinite(v)) { if (lenient) continue; bad = true; break; } seen++; mn = Math.min(mn, v); mx = Math.max(mx, v); prod *= v; sum1 *= 1 - v; }
    if (bad || !seen) { out[i] = NaN; continue; }
    const sum = 1 - sum1;
    out[i] = operator === "and" ? mn : operator === "or" ? mx : operator === "product" ? prod : operator === "sum" ? sum : Math.pow(sum, gamma) * Math.pow(prod, 1 - gamma);
  }
  return out;
}

// ---------- weights of evidence ----------
// training points -> the set of cells holding at least one (NaN-evidence cells are not part of the study area)
export function trainingCells(g, points, valid) {
  const set = new Set();
  for (const p of points) { const i = Math.round((p.x - g.x0) / g.dx), j = Math.round((g.yTop - p.y) / g.dy); if (i >= 0 && j >= 0 && i < g.nx && j < g.ny) { const k = j * g.nx + i; if (!valid || valid[k]) set.add(k); } }
  return set;
}
// Weights of a binary pattern B over the study area: counts and W+, W-, contrast, their standard errors
export function weights(nB, nBD, N, ND) {
  const a = nBD, b = nB - nBD, c = ND - nBD, d = N - nB - ND + nBD; // B&D, B&~D, ~B&D, ~B&~D
  if (a <= 0 || b <= 0 || c <= 0 || d <= 0) return null; // a zero cell makes a weight infinite
  const wPlus = Math.log((a / ND) / (b / (N - ND))), wMinus = Math.log((c / ND) / (d / (N - ND)));
  const sPlus = Math.sqrt(1 / a + 1 / b), sMinus = Math.sqrt(1 / c + 1 / d), C = wPlus - wMinus, sC = Math.sqrt(sPlus ** 2 + sMinus ** 2);
  return { nB, nBD, wPlus, wMinus, sPlus, sMinus, C, sC, studC: C / sC };
}
// For a continuous evidence: the cutoff (over its quantiles) with the largest contrast; `direction` increasing means
// B = value >= cutoff. -> { best, table: [{ cutoff, quantile, ...weights }] }
export function bestCutoff(values, D, valid, { direction = "increasing", steps = 40 } = {}) {
  const idx = [];
  for (let k = 0; k < values.length; k++) if (valid[k]) idx.push(k);
  const N = idx.length, ND = idx.reduce((c, k) => c + (D.has(k) ? 1 : 0), 0);
  const sorted = idx.map((k) => values[k]).sort((a, b) => a - b);
  const table = [];
  for (let s = 1; s < steps; s++) {
    const q = s / steps, cutoff = sorted[Math.floor(q * (sorted.length - 1))];
    let nB = 0, nBD = 0;
    for (const k of idx) { const inB = direction === "increasing" ? values[k] >= cutoff : values[k] <= cutoff; if (inB) { nB++; if (D.has(k)) nBD++; } }
    const w = weights(nB, nBD, N, ND);
    if (w) table.push({ cutoff, quantile: q, ...w });
  }
  const best = table.reduce((b, r) => (!b || r.C > b.C ? r : b), null);
  return { best, table, N, ND };
}
// posterior probability per cell from the chosen binary patterns: layers = [{ values, cutoff, direction, wPlus, wMinus }]
export function posterior(layers, valid, N, ND) {
  const n = valid.length, out = new Float32Array(n).fill(NaN), prior = Math.log(ND / (N - ND));
  let expected = 0;
  for (let k = 0; k < n; k++) {
    if (!valid[k]) continue;
    let logit = prior;
    for (const L of layers) { const v = L.values[k]; const inB = L.direction === "increasing" ? v >= L.cutoff : v <= L.cutoff; logit += inB ? L.wPlus : L.wMinus; }
    const p = 1 / (1 + Math.exp(-logit));
    out[k] = p; expected += p;
  }
  // omnibus conditional-independence check (Bonham-Carter 1994): the posterior summed over the area should give back
  // about the number of known occurrences; a sum well above it (ratio under 0.85) means the layers double-count
  return { prob: out, expected, ratio: expected > 0 ? ND / expected : NaN };
}

// ---------- prediction-area plot ----------
// score grid + training cells -> curves over 200 thresholds: area (fraction of cells >= t), prediction rate (fraction of
// training cells >= t); the P-A point where prediction rate + area = 1 (Yousefi & Carranza 2015), Nd = rate / area
export function predictionArea(score, D, valid, steps = 200) {
  const vals = [], train = [];
  for (let k = 0; k < score.length; k++) if (valid[k] && Number.isFinite(score[k])) { vals.push(score[k]); if (D.has(k)) train.push(score[k]); }
  if (!vals.length || !train.length) return null;
  vals.sort((a, b) => a - b); train.sort((a, b) => a - b);
  const curve = [];
  for (let s = 0; s <= steps; s++) {
    const t = vals[Math.min(vals.length - 1, Math.floor((s / steps) * (vals.length - 1)))];
    const area = (vals.length - lowerBound(vals, t)) / vals.length, rate = (train.length - lowerBound(train, t)) / train.length;
    curve.push({ t, area, rate });
  }
  // above the top score nothing is predicted: closes the step so a score with few distinct values (a binary posterior)
  // still has a crossing - the one on the jump, where rate / area is well defined
  curve.push({ t: vals[vals.length - 1], area: 0, rate: 0 });
  let point = null;
  for (let i = 1; i < curve.length; i++) { const a = curve[i - 1], b = curve[i]; const fa = a.rate + a.area - 1, fb = b.rate + b.area - 1; if ((fa >= 0 && fb <= 0) || (fa <= 0 && fb >= 0)) { const u = fa === fb ? 0 : fa / (fa - fb); point = { t: a.t + u * (b.t - a.t), area: a.area + u * (b.area - a.area), rate: a.rate + u * (b.rate - a.rate) }; break; } }
  if (point) point.nd = point.area > 0 ? point.rate / point.area : NaN;
  return { curve, point, nTrain: train.length, nCells: vals.length };
}
function lowerBound(sorted, t) { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < t) lo = m + 1; else hi = m; } return lo; }

// ---------- a score grid as a raster drape (RGBA, 0 -> pale, 1 -> dark red; NaN transparent) ----------
export function scoreImage(score, nx, ny) {
  const data = new Uint8ClampedArray(nx * ny * 4);
  const stops = [[255, 255, 204], [254, 217, 118], [253, 141, 60], [227, 26, 28], [128, 0, 38]];
  for (let k = 0; k < nx * ny; k++) {
    const v = score[k];
    if (!Number.isFinite(v)) continue;
    const t = Math.max(0, Math.min(1, v)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t)), u = t - i;
    data[k * 4] = stops[i][0] + u * (stops[i + 1][0] - stops[i][0]); data[k * 4 + 1] = stops[i][1] + u * (stops[i + 1][1] - stops[i][1]); data[k * 4 + 2] = stops[i][2] + u * (stops[i + 1][2] - stops[i][2]); data[k * 4 + 3] = 200;
  }
  return { width: nx, height: ny, data };
}
