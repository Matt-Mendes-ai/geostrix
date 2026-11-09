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
  // #1830 — a width that is a whole number of cells (a raster with this grid's own box) must not gain a column from rounding
  const nx = Math.max(1, Math.ceil((xmax - xmin) / cell - 1e-9)), ny = Math.max(1, Math.ceil((ymax - ymin) / cell - 1e-9));
  return { nx, ny, x0: xmin + cell / 2, yTop: ymax - cell / 2, dx: cell, dy: cell, from: "extent", coarsened: 1 };
}
// TASKS.csv #1450 (review #1352, Silvertip) — the grid over the area the geologist chooses: "all" (every source, as before), "samples"
// (the surface samples' main cluster), "drilling" (the hole traces plus the drill reach) or "box" ([x0, y0, x1, y1] typed); padded by
// `pad` m. parts: { all: box, samples: box, drilling: box } (each [x0, y0, x1, y1] or null). -> [x0, y0, x1, y1] | null
export function evidenceExtent(area, parts, box = null, pad = 0) {
  const b = area === "box" ? box : parts?.[area] || null;
  if (!b || !b.every(Number.isFinite) || !(b[2] > b[0] && b[3] > b[1])) return null;
  return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
}

// TASKS.csv #1830 — a raster this overlay made ("Fuzzy score → map", "Posterior → map"; params.tool, #1003)
export const isOverlayOutput = (r) => /^(fuzzy overlay|weights of evidence)/.test(String(r?.params?.tool || ""));
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
// TASKS.csv #1567 (review #1497, Lawyers) — a modelled body (a grade shell, an envelope, an imported resistivity isosurface) as evidence:
// the distance in plan from each cell to the body's footprint, 0 over it. Every triangle is laid flat and the cells whose centres it
// covers are marked (and its corners, so a sliver narrower than a cell still marks one); then the same distance transform as a line.
// positions: flat world [x, y, z, ...]; indices: triangle corners.
export function solidFootprintEvidence(g, positions, indices) {
  const n = g.nx * g.ny, hit = new Uint8Array(n);
  const col = (x) => (x - g.x0) / g.dx, row = (y) => (g.yTop - y) / g.dy; // fractional cell index of a world point (cell centres at integers)
  const mark = (i, j) => { if (i >= 0 && j >= 0 && i < g.nx && j < g.ny) hit[j * g.nx + i] = 1; };
  const T = Math.floor((indices?.length || 0) / 3);
  for (let t = 0; t < T; t++) {
    const a = indices[3 * t] * 3, b = indices[3 * t + 1] * 3, c = indices[3 * t + 2] * 3;
    const ax = col(positions[a]), ay = row(positions[a + 1]), bx = col(positions[b]), by = row(positions[b + 1]), cx = col(positions[c]), cy = row(positions[c + 1]);
    if (![ax, ay, bx, by, cx, cy].every(Number.isFinite)) continue;
    mark(Math.round(ax), Math.round(ay)); mark(Math.round(bx), Math.round(by)); mark(Math.round(cx), Math.round(cy));
    const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(d) < 1e-12) continue; // seen edge-on from above (a vertical wall): its corners are enough
    const i0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx))), i1 = Math.min(g.nx - 1, Math.floor(Math.max(ax, bx, cx)));
    const j0 = Math.max(0, Math.ceil(Math.min(ay, by, cy))), j1 = Math.min(g.ny - 1, Math.floor(Math.max(ay, by, cy)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const w1 = ((bx - i) * (cy - j) - (by - j) * (cx - i)) / d, w2 = ((cx - i) * (ay - j) - (cy - j) * (ax - i)) / d, w3 = 1 - w1 - w2;
      if (w1 >= -1e-9 && w2 >= -1e-9 && w3 >= -1e-9) hit[j * g.nx + i] = 1;
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
  // TASKS.csv #1281 — one string key per neighbour of every cell was most of a 200 ms stall when an evidence was picked: number keys, and cells beyond reach of every point skip at once
  const R = Math.max(1, maxDistance), BUCKET = 2 ** 26, key = (cx, cy) => cx * BUCKET + cy, buckets = new Map();
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  pts.forEach((p, i) => {
    const k = key(Math.floor(p.x / R), Math.floor(p.y / R)); (buckets.get(k) || buckets.set(k, []).get(k)).push(i);
    if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x; if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
  });
  const cand = [];
  for (let k = 0; k < out.length; k++) {
    const x = g.x0 + (k % g.nx) * g.dx, y = g.yTop - Math.floor(k / g.nx) * g.dy;
    if (x < xMin - R || x > xMax + R || y < yMin - R || y > yMax + R) continue;
    const cx = Math.floor(x / R), cy = Math.floor(y / R);
    cand.length = 0;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (const i of buckets.get(key(cx + ox, cy + oy)) || []) { const d = Math.hypot(pts[i].x - x, pts[i].y - y); if (d <= R) cand.push([d, i]); }
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
// membership: linear ramp from `low` (0) to `high` (1), or the reverse when decreasing. TASKS.csv #1555 (review #1497,
// Lawyers) — `floor` runs the ramp over [floor, 1 - floor] instead of [0, 1]: with six layers each at 0 below its own 10th
// percentile, one 0 in any layer made the product term (and so AND, product and gamma) exactly 0 on 98 % of the cells, and
// the "top" cells were the few with no zero rather than the gold; a 0.01 floor keeps the ranking and stops the veto.
// `log` runs the ramp on the logarithm of the values (a grade ramp 10th -> 90th percentile is otherwise flat over the
// low grades and saturates on the few highs); a value <= 0 is then below any low point.
export function membership(values, { shape = "increasing", low, high, floor = 0, log = false }) {
  const out = new Float32Array(values.length);
  const f = log ? (v) => (v > 0 ? Math.log(v) : -Infinity) : (v) => v;
  const a = shape === "decreasing" ? f(high) : f(low), b = shape === "decreasing" ? f(low) : f(high), span = b - a;
  const lo = Math.max(0, Math.min(0.49, Number(floor) || 0)), hi = 1 - lo;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) { out[i] = NaN; continue; }
    const x = f(v), m = span === 0 || !Number.isFinite(span) ? (x >= b ? 1 : 0) : (x - a) / span;
    out[i] = lo + (hi - lo) * Math.max(0, Math.min(1, m));
  }
  return out;
}
export const FUZZY_OPERATORS = ["and", "or", "product", "sum", "gamma"];
// members: [Float32Array]. AND / product / gamma: a cell with any NaN member -> NaN (every evidence must speak). TASKS.csv #1162 —
// OR / algebraic sum: an evidence with no value there is absent, not a veto (a geologist uses OR to reach past the drilling with the
// survey), so only a cell with NO evidence at all is NaN.
// TASKS.csv #2252 (review #2174, WA gold) — one evidence with values on one hole (Recovery %, 263 readings) emptied the whole gamma score: the
// share of the grid each evidence has a value on, and the ones that leave a strict operator (and / product / gamma) little or nothing.
export function evidenceCoverage(values) {
  const n = values?.length || 0;
  if (!n) return 0;
  let k = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(values[i])) k++;
  return k / n;
}
export const LOW_COVERAGE = 0.05;
// -> the cards (with their coverage) to name when the score is empty or nearly so, lowest first; [] when the score is fine or the operator
// is lenient (or / sum skip a missing evidence)
export function scoreBlockers(layers, nValid, n, operator) {
  if (operator === "or" || operator === "sum" || !n || nValid / n >= LOW_COVERAGE) return [];
  return (layers || []).map((l) => ({ label: l.label, coverage: evidenceCoverage(l.values) })).sort((a, b) => a.coverage - b.coverage).slice(0, 3);
}
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
// TASKS.csv #1558 (review #1497, Lawyers) — what became of the training points: how many fell in the grid, their cells, and the cells
// the study-area mask dropped (647 points became '83 occurrence cells' in silence: 428 of their 511 cells had no soil value).
export function trainingCoverage(g, points, valid) {
  const all = trainingCells(g, points, null), kept = trainingCells(g, points, valid);
  let inGrid = 0;
  for (const p of points) { const i = Math.round((p.x - g.x0) / g.dx), j = Math.round((g.yTop - p.y) / g.dy); if (i >= 0 && j >= 0 && i < g.nx && j < g.ny) inGrid++; }
  return { points: points.length, inGrid, cells: all.size, validCells: kept.size, droppedCells: all.size - kept.size, droppedShare: all.size ? (all.size - kept.size) / all.size : 0 };
}
export function trainingCells(g, points, valid) {
  const set = new Set();
  for (const p of points) { const i = Math.round((p.x - g.x0) / g.dx), j = Math.round((g.yTop - p.y) / g.dy); if (i >= 0 && j >= 0 && i < g.nx && j < g.ny) { const k = j * g.nx + i; if (!valid || valid[k]) set.add(k); } }
  return set;
}
// Weights of a binary pattern B over the study area: counts and W+, W-, contrast, their standard errors
// TASKS.csv #1726 (review #1645, Copley) — a zero cell (every occurrence inside the pattern, or none) used to return null, which
// dropped the evidence that predicts the occurrences best ('no usable cutoff' for Cu when the occurrences are Cu >= 5000) while the
// weaker layers went into the posterior. A zero cell now takes the usual continuity correction: 0.5 added to each of the four
// counts (Bonham-Carter 1994, ch. 9), flagged `corrected` so the row says so. Nothing at all in B or in D stays null.
export function weights(nB, nBD, N, ND) {
  let a = nBD, b = nB - nBD, c = ND - nBD, d = N - nB - ND + nBD; // B&D, B&~D, ~B&D, ~B&~D
  if (nB <= 0 || nB >= N || ND <= 0 || ND >= N) return null; // an empty or all-area pattern, or no occurrences, has no weights
  const corrected = a <= 0 || b <= 0 || c <= 0 || d <= 0;
  if (corrected) { a += 0.5; b += 0.5; c += 0.5; d += 0.5; }
  const nd = a + c, nnd = b + d;
  const wPlus = Math.log((a / nd) / (b / nnd)), wMinus = Math.log((c / nd) / (d / nnd));
  const sPlus = Math.sqrt(1 / a + 1 / b), sMinus = Math.sqrt(1 / c + 1 / d), C = wPlus - wMinus, sC = Math.sqrt(sPlus ** 2 + sMinus ** 2);
  return { nB, nBD, wPlus, wMinus, sPlus, sMinus, C, sC, studC: C / sC, corrected };
}
// For a continuous evidence: the cutoff (over its quantiles) with the largest contrast; `direction` increasing means
// B = value >= cutoff. -> { best, table: [{ cutoff, quantile, ...weights }], N, ND, nMissing }
// TASKS.csv #1556 (review #1497, Lawyers) — the weights come from the cells where THIS evidence has a value: a cell with none
// (beyond the drill layers' reach, under fuzzy OR the study area reaches there) used to count as "not in the pattern" and
// took W-, so the posterior was a map of where the holes are (98 % of the occurrences in 2 % of the area). Missing evidence
// is neither B nor not-B (Bonham-Carter 1994, ch. 9: missing data); `nMissing` says how many study-area cells it skipped.
// TASKS.csv #1559 (review #1497, Lawyers) — fewer than MIN_SIDE occurrence cells on a side is a weak basis for a weight (Bonham-Carter
// 1994): the largest raw contrast landed where ONE occurrence cell was left outside the pattern (s(W-) = 1.00, c = 1), e.g. 'within
// 1,387 m' of Vn4, nearly the whole area.
export const MIN_SIDE = 5;
export function bestCutoff(values, D, valid, { direction = "increasing", steps = 40 } = {}) {
  // TASKS.csv #1562 — one numeric sort of the values and one of the occurrence cells' values, then each cutoff's counts by binary
  // search: the same nB / nBD as counting every cell per cutoff (39 passes over 198,000 cells, ~0.7 s of a fuzzy OR's Compute)
  const inD = cellMask(D, values.length);
  let N = 0, ND = 0, nMissing = 0;
  for (let k = 0; k < values.length; k++) if (valid[k]) { if (Number.isFinite(values[k])) { N++; ND += inD[k]; } else nMissing++; }
  const sorted = new Float64Array(N), sortedD = new Float64Array(ND);
  for (let k = 0, i = 0, j = 0; k < values.length; k++) if (valid[k] && Number.isFinite(values[k])) { sorted[i++] = values[k]; if (inD[k]) sortedD[j++] = values[k]; }
  sorted.sort(); sortedD.sort();
  const table = [];
  for (let s = 1; s < steps; s++) {
    const q = s / steps, cutoff = sorted[Math.floor(q * (sorted.length - 1))];
    // increasing: B = value >= cutoff; decreasing: B = value <= cutoff
    const nB = direction === "increasing" ? N - lowerBound(sorted, cutoff) : upperBound(sorted, cutoff);
    const nBD = direction === "increasing" ? ND - lowerBound(sortedD, cutoff) : upperBound(sortedD, cutoff);
    const w = weights(nB, nBD, N, ND);
    if (w) table.push({ cutoff, quantile: q, ...w });
  }
  // #1726 — the best cutoff among the uncorrected rows when there are any (a corrected contrast is inflated by the 0.5); only an
  // evidence whose every cutoff has a zero cell (the one that defines the occurrences) takes its best from the corrected rows
  const pool = table.some((r) => !r.corrected) ? table.filter((r) => !r.corrected) : table;
  // #1559 — the largest STUDENTIZED contrast C/s, not the largest C: s(W-) carries sqrt(1/c), so a cutoff that strands one
  // occurrence outside the pattern is paid for its uncertainty. A chosen cutoff with fewer than MIN_SIDE occurrence cells on a
  // side is flagged thin (a pattern can still rightly hold every occurrence: #851's synthetic deposits, #1726's Cu).
  const soundRow = (r) => r.nBD >= MIN_SIDE && ND - r.nBD >= MIN_SIDE;
  const b0 = pool.reduce((b, r) => (!b || r.studC > b.studC ? r : b), null);
  const best = b0 ? { ...b0, nD: ND, thin: !soundRow(b0) } : null;
  return { best, table, N, ND, nMissing };
}
// posterior probability per cell from the chosen binary patterns: layers = [{ values, cutoff, direction, wPlus, wMinus }];
// N, ND = the study area (the valid cells) and its occurrence cells, for the prior. TASKS.csv #1556 — an evidence with no
// value at a cell adds a weight of 0 there (the prior stands); `missingCells` counts the cells where at least one did.
export function posterior(layers, valid, N, ND) {
  const n = valid.length, out = new Float32Array(n).fill(NaN), prior = Math.log(ND / (N - ND));
  let expected = 0, missingCells = 0;
  for (let k = 0; k < n; k++) {
    if (!valid[k]) continue;
    let logit = prior, miss = false;
    for (const L of layers) { const v = L.values[k]; if (!Number.isFinite(v)) { miss = true; continue; } const inB = L.direction === "increasing" ? v >= L.cutoff : v <= L.cutoff; logit += inB ? L.wPlus : L.wMinus; }
    if (miss) missingCells++;
    const p = 1 / (1 + Math.exp(-logit));
    out[k] = p; expected += p;
  }
  // omnibus conditional-independence check (Bonham-Carter 1994): the posterior summed over the area should give back
  // about the number of known occurrences; a sum well above it (ratio under 0.85) means the layers double-count
  return { prob: out, expected, ratio: expected > 0 ? ND / expected : NaN, missingCells };
}

// ---------- prediction-area plot ----------
// score grid + training cells -> curves over 200 thresholds: area (fraction of cells >= t), prediction rate (fraction of
// training cells >= t); the P-A point where prediction rate + area = 1 (Yousefi & Carranza 2015), Nd = rate / area.
// TASKS.csv #1555 — the crossing is interpolated between two thresholds only when they are close in area (`maxJump`, 5 %
// of the cells): a score with few distinct values (98 % of the cells at exactly 0, or a binary posterior) jumps across the
// line, and the point interpolated on the jump ("50 % in 50 % of the area, Nd 1.0") is one no threshold gives. Then
// `point` is null and `step` holds the two thresholds either side, with Nd at the one nearer the line (`at`).
export function predictionArea(score, D, valid, steps = 200, { maxJump = 0.05 } = {}) {
  // #1562 — typed arrays and a numeric sort (the comparator sort of ~198,000 plain numbers was most of this)
  const inD = cellMask(D, score.length);
  let nv = 0, nt = 0;
  for (let k = 0; k < score.length; k++) if (valid[k] && Number.isFinite(score[k])) { nv++; nt += inD[k]; }
  if (!nv || !nt) return null;
  const vals = new Float64Array(nv), train = new Float64Array(nt);
  for (let k = 0, i = 0, j = 0; k < score.length; k++) if (valid[k] && Number.isFinite(score[k])) { vals[i++] = score[k]; if (inD[k]) train[j++] = score[k]; }
  vals.sort(); train.sort();
  const curve = [];
  for (let s = 0; s <= steps; s++) {
    const t = vals[Math.min(vals.length - 1, Math.floor((s / steps) * (vals.length - 1)))];
    const area = (vals.length - lowerBound(vals, t)) / vals.length, rate = (train.length - lowerBound(train, t)) / train.length;
    curve.push({ t, area, rate });
  }
  // above the top score nothing is predicted: closes the step so a score with few distinct values (a binary posterior)
  // still has a crossing - the one on the jump, where rate / area is well defined
  curve.push({ t: vals[vals.length - 1], area: 0, rate: 0 });
  let point = null, step = null;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1], b = curve[i]; const fa = a.rate + a.area - 1, fb = b.rate + b.area - 1;
    if (!((fa >= 0 && fb <= 0) || (fa <= 0 && fb >= 0))) continue;
    if (fa === 0) { point = { ...a }; break; }
    if (fb === 0) { point = { ...b }; break; }
    if (Math.abs(a.area - b.area) > maxJump) { const at = b.area > 0 && Math.abs(fb) < Math.abs(fa) ? "above" : "below", s = at === "above" ? b : a; step = { below: { ...a }, above: { ...b }, at, nd: s.area > 0 ? s.rate / s.area : NaN }; break; }
    const u = fa / (fa - fb);
    point = { t: a.t + u * (b.t - a.t), area: a.area + u * (b.area - a.area), rate: a.rate + u * (b.rate - a.rate) }; break;
  }
  if (point) point.nd = point.area > 0 ? point.rate / point.area : NaN;
  return { curve, point, step, nTrain: train.length, nCells: vals.length };
}
function lowerBound(sorted, t) { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < t) lo = m + 1; else hi = m; } return lo; }
// a Set of cell indices as a 0 / 1 byte per cell (#1562: a lookup per cell, not a hash per cell)
function cellMask(D, n) { const m = new Uint8Array(n); for (const k of D) if (k >= 0 && k < n) m[k] = 1; return m; }
// the number of values <= t (#1562)
function upperBound(sorted, t) { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= t) lo = m + 1; else hi = m; } return lo; }

// ---------- a score grid as a raster drape (RGBA, 0 -> pale, 1 -> dark red; NaN transparent) ----------
// TASKS.csv #1456 (review #1352, Silvertip) — the highest-scoring places of an overlay, to plan a hole to: the best cells, each at least
// minSepM from those already taken (the 2nd-best cell is usually the best one's neighbour, the same target). Cell centres as the
// grid places them (x0 + i dx, yTop - j dy). -> [{ i, j, x, y, score }], best first
export function topCells(score, g, { n = 5, minSepM = null } = {}) {
  if (!score || !g) return [];
  const sep = minSepM > 0 ? minSepM : 5 * Math.max(g.dx, g.dy);
  const idx = [];
  for (let k = 0; k < score.length; k++) if (Number.isFinite(score[k])) idx.push(k);
  idx.sort((a, b) => score[b] - score[a]);
  const out = [];
  for (const k of idx) {
    const i = k % g.nx, j = Math.floor(k / g.nx), x = g.x0 + i * g.dx, y = g.yTop - j * g.dy;
    if (out.some((c) => Math.hypot(c.x - x, c.y - y) < sep)) continue;
    out.push({ i, j, x, y, score: score[k] });
    if (out.length >= n) break;
  }
  return out;
}

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

// TASKS.csv #1563 (review #1497, Lawyers) — a score sent to the map lay under the opaque MVI block model and three geophysics drapes, and the
// Targeting tab has no layer list: the visible rasters and block models whose plan footprint overlaps the score's box [x0, y0, x1, y1].
// -> { rasters: [{ id, name }], models: [{ id, name }] }
export function coveringLayers(box, rasters = [], voxelModels = []) {
  const hit = (b) => b && b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1];
  const rasterBox = (r) => (Array.isArray(r.bbox) && r.bbox.length === 4 ? r.bbox : null);
  const modelBox = (m) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of m.cells || []) { if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) continue; const hx = (c.dx || 0) / 2, hy = (c.dy || 0) / 2; if (c.x - hx < x0) x0 = c.x - hx; if (c.y - hy < y0) y0 = c.y - hy; if (c.x + hx > x1) x1 = c.x + hx; if (c.y + hy > y1) y1 = c.y + hy; }
    return x1 >= x0 && y1 >= y0 ? [x0, y0, x1, y1] : null;
  };
  return {
    rasters: rasters.filter((r) => r.visible !== false && hit(rasterBox(r))).map((r) => ({ id: r.id, name: r.name })),
    models: voxelModels.filter((m) => m.visible !== false && hit(modelBox(m))).map((m) => ({ id: m.id, name: m.name })),
  };
}
