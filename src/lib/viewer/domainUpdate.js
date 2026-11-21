// TASKS.csv #3673 phase 2 (Matt, 2026-11-15: "these meshes were done in 2024 so not including 2025 drilling and 2026. I was thinking we could
// update them and include recent drilling") — update an imported domain (a consultant's DXF / OMF solid) with the holes drilled since it was
// drawn, keeping it where they agree with it and changing it only where they do not.
//
// The old mesh is a soft prior: its inside / outside on the grid (vertical-ray parity, meshInsideMask), a signed distance to its boundary
// (signedDistance: an exact Euclidean distance transform), and a probability from it, 1 / (1 + exp(-d / width)) (priorField). The holes drilled
// since are the data: their composites as indicators at the cut-off, interpolated as the envelope's are (the estimate, in the worker). The two
// are blended by how near a node is to a new composite, alpha = exp(-(d / influence)^2) (blendWithPrior): next to a new hole the new data
// decide, a few spacings away the old domain stands. The surface is drawn where the result reaches 0.5, cleaned and smoothed like an envelope.
// updateReport says what changed: per new hole whether its composites agree with the old domain (at or above the cut-off inside it, below
// it outside), the intervals at or above the cut-off outside the old domain and below it inside, and the volume added and removed.

// triangles in XY buckets, for the vertical lines through a mesh. positions: world (x east, y north, z up), Float64Array; indices: Uint32Array
import { shellPlaneSearch, PLANE_MIN_COMPOSITES } from "./shellPlane.js"; // TASKS.csv #3876 (#3674): the domain's own plane
function columnIndex(positions, indices, cell) {
  const buckets = new Map(), key = (a, b) => a * 1000003 + b;
  for (let t = 0; t < indices.length; t += 3) {
    const a = 3 * indices[t], b = 3 * indices[t + 1], c = 3 * indices[t + 2];
    const x0 = Math.min(positions[a], positions[b], positions[c]), x1 = Math.max(positions[a], positions[b], positions[c]);
    const y0 = Math.min(positions[a + 1], positions[b + 1], positions[c + 1]), y1 = Math.max(positions[a + 1], positions[b + 1], positions[c + 1]);
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
      const k = key(gx, gy); let l = buckets.get(k); if (!l) buckets.set(k, (l = [])); l.push(t);
    }
  }
  // the elevations where the vertical line at (x, y) crosses the mesh, sorted
  return (x, y) => {
    const out = [], l = buckets.get(key(Math.floor(x / cell), Math.floor(y / cell)));
    if (!l) return out;
    for (const t of l) {
      const a = 3 * indices[t], b = 3 * indices[t + 1], c = 3 * indices[t + 2];
      const ax = positions[a], ay = positions[a + 1], bx = positions[b], by = positions[b + 1], cx = positions[c], cy = positions[c + 1];
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (d === 0) continue;
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      out.push(l1 * positions[a + 2] + l2 * positions[b + 2] + l3 * positions[c + 2]);
    }
    out.sort((p, q) => p - q);
    // a line through an edge (or a vertex) shared by two triangles meets both at one elevation: counted once (a grid at round coordinates
    // over a mesh with round coordinates hits the diagonals of its square faces)
    let w = 0; for (let r = 0; r < out.length; r++) if (!w || Math.abs(out[r] - out[w - 1]) > 1e-6) out[w++] = out[r];
    out.length = w;
    return out;
  };
}
const above = (cr, z) => { let n = 0; for (const zz of cr) if (zz > z) n++; return n; };

// a point tester: inside a closed mesh (an odd number of crossings above the point)
export function meshInsideTester(positions, indices, cell = 20) {
  const cols = columnIndex(positions, indices, cell);
  return (x, y, z) => above(cols(x, y), z) % 2 === 1;
}

// grid: { nx, ny, nz, origin, cellSize: { dx, dy, dz } } -> Uint8Array (1 inside) at the grid's nodes
export function meshInsideMask(positions, indices, grid) {
  const { nx, ny, nz, origin, cellSize } = grid, m = new Uint8Array(nx * ny * nz);
  const cols = columnIndex(positions, indices, 2 * Math.max(cellSize.dx, cellSize.dy));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const cr = cols(origin.x + i * cellSize.dx, origin.y + j * cellSize.dy);
    if (cr.length < 2) continue;
    for (let k = 0, c = 0; k < nz; k++) {
      const z = origin.z + k * cellSize.dz;
      while (c < cr.length && cr[c] <= z) c++;
      if ((cr.length - c) % 2 === 1) m[i + nx * (j + ny * k)] = 1;
    }
  }
  return m;
}

// 1D squared distance transform (Felzenszwalb & Huttenlocher 2012) of f (0 at a feature, Infinity elsewhere), samples h apart: the lower envelope
// of the parabolas of the finite samples (an empty line stays Infinity)
function dt1(f, n, h, d, v, z) {
  let k = -1;
  for (let q = 0; q < n; q++) {
    if (f[q] === Infinity) continue;
    const xq = q * h; let s = -Infinity;
    while (k >= 0) {
      const xp = v[k] * h;
      s = ((f[q] + xq * xq) - (f[v[k]] + xp * xp)) / (2 * (xq - xp));
      if (s <= z[k]) k--; else break;
    }
    if (k < 0) { k = 0; v[0] = q; z[0] = -Infinity; z[1] = Infinity; }
    else { k++; v[k] = q; z[k] = s; z[k + 1] = Infinity; }
  }
  if (k < 0) { for (let q = 0; q < n; q++) d[q] = Infinity; return; }
  k = 0;
  for (let q = 0; q < n; q++) {
    const x = q * h;
    while (z[k + 1] < x) k++;
    d[q] = (x - v[k] * h) ** 2 + f[v[k]];
  }
}
// squared distance (m²) from every node to the nearest node where mask === target, over the grid's three spacings
export function squaredDistanceTo(mask, grid, target) {
  const { nx, ny, nz, cellSize } = grid, N = nx * ny * nz, D = new Float64Array(N);
  for (let i = 0; i < N; i++) D[i] = mask[i] === target ? 0 : Infinity;
  const L = Math.max(nx, ny, nz), f = new Float64Array(L), d = new Float64Array(L), v = new Int32Array(L), z = new Float64Array(L + 1);
  const pass = (n, h, at) => { for (let q = 0; q < n; q++) f[q] = D[at(q)]; dt1(f, n, h, d, v, z); for (let q = 0; q < n; q++) D[at(q)] = d[q]; };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) pass(nx, cellSize.dx, (q) => q + nx * (j + ny * k));
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) pass(ny, cellSize.dy, (q) => i + nx * (q + ny * k));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pass(nz, cellSize.dz, (q) => i + nx * (j + ny * q));
  return D;
}
// signed distance (m) to the mask's boundary: positive inside, negative outside, about 0 halfway between an inside and an outside node
export function signedDistance(mask, grid) {
  const toOut = squaredDistanceTo(mask, grid, 0), toIn = squaredDistanceTo(mask, grid, 1), h = Math.min(grid.cellSize.dx, grid.cellSize.dy, grid.cellSize.dz) / 2;
  const sd = new Float64Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i] ? Math.sqrt(toOut[i]) : Math.sqrt(toIn[i]);
    sd[i] = !Number.isFinite(a) ? (mask[i] ? 1e9 : -1e9) : mask[i] ? a - h : -(a - h);
  }
  return sd;
}
// the old domain as a probability: 1 / (1 + exp(-d / width))
export function priorField(sd, widthM) {
  const p = new Float64Array(sd.length), w = Math.max(1e-6, widthM);
  for (let i = 0; i < sd.length; i++) p[i] = 1 / (1 + Math.exp(-sd[i] / w));
  return p;
}

// the blend: p = (1 - alpha) * prior + alpha * new, alpha = exp(-(d / influence)^2) with d the distance to the nearest new composite (none
// within 2.5 influences: alpha 0); a node the new estimate did not reach (NaN) keeps the prior. -> { values, touched (nodes with alpha > 0.05) }
export function blendWithPrior(prior, pNew, newPoints, grid, influenceM) {
  const { nx, ny, nz, origin, cellSize } = grid, N = nx * ny * nz, out = Float64Array.from(prior);
  if (!newPoints?.length || !(influenceM > 0)) return { values: out, touched: 0 };
  const B = influenceM, R = 2.5 * influenceM, buckets = new Map(), key = (a, b, c) => `${a},${b},${c}`;
  for (const p of newPoints) { const k = key(Math.floor(p.x / B), Math.floor(p.y / B), Math.floor(p.z / B)); let l = buckets.get(k); if (!l) buckets.set(k, (l = [])); l.push(p); }
  const reach = Math.ceil(R / B);
  let touched = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const at = i + nx * (j + ny * k), pn = pNew[at];
    if (!Number.isFinite(pn)) continue;
    const x = origin.x + i * cellSize.dx, y = origin.y + j * cellSize.dy, z = origin.z + k * cellSize.dz;
    const bx = Math.floor(x / B), by = Math.floor(y / B), bz = Math.floor(z / B);
    let d2 = Infinity;
    for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) for (let c = -reach; c <= reach; c++) {
      const l = buckets.get(key(bx + a, by + b, bz + c)); if (!l) continue;
      for (const p of l) { const e = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2; if (e < d2) d2 = e; }
    }
    if (!(d2 <= R * R)) continue;
    const alpha = Math.exp(-d2 / (influenceM * influenceM));
    out[at] = (1 - alpha) * prior[at] + alpha * pn;
    if (alpha > 0.05) touched++;
  }
  void N;
  return { values: out, touched };
}

// what changed. oldMask / newMask: Uint8Array on the grid (grid.sd: the old domain's signed distance); points: the new holes' composites
// [{ x, y, z, value, length, hole_id }]; refPoints: the older holes' composites, for the domain's own reference; insideOld(x, y, z): the old mesh's
// tester; nearM: 'just outside' (the composites within nearM outside the boundary); tol: how far from the reference a hole may sit.
// A domain drawn to keep the dilution has composites below the cut-off inside it (a share of them at the cut-off, not all), so a new hole is
// judged against the domain's OWN shares, from the older holes: at the cut-off inside it, and just outside it. Status: "agrees", "grade
// outside" (more at the cut-off just outside it than the reference), "weaker inside" (fewer inside), "disagrees" (both), "away" (no composite
// inside or just outside it).
// -> { oldM3, newM3, addedM3, removedM3, reference: { insideShare, outsideShare }, holes: [{ hole_id, n, inside, insideShare, outside,
//      outsideShare, atCutOutside, atCutOutsideM, belowInside, belowInsideM, status }], atCutOutside: { n, m }, belowInside: { n, m } }
export function updateReport({ oldMask, newMask, grid, points, refPoints = [], insideOld, cutoff, nearM, tol = 0.15 }) {
  const cv = grid.cellSize.dx * grid.cellSize.dy * grid.cellSize.dz;
  let o = 0, n = 0, add = 0, rem = 0;
  for (let i = 0; i < oldMask.length; i++) { if (oldMask[i]) o++; if (newMask[i]) n++; if (newMask[i] && !oldMask[i]) add++; if (oldMask[i] && !newMask[i]) rem++; }
  const { nx, ny, nz, origin, cellSize } = grid, sd = grid.sd;
  const nodeOf = (p) => { const i = Math.round((p.x - origin.x) / cellSize.dx), j = Math.round((p.y - origin.y) / cellSize.dy), k = Math.round((p.z - origin.z) / cellSize.dz); return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : i + nx * (j + ny * k); };
  // where a composite sits: "in", "near" (outside, within nearM of the boundary), or null
  const where = (p) => { if (insideOld(p.x, p.y, p.z)) return "in"; const v = nodeOf(p); return v >= 0 && sd && sd[v] >= -nearM ? "near" : null; };
  const ref = { in: 0, inAt: 0, near: 0, nearAt: 0 };
  for (const p of refPoints) { const w = where(p); if (!w) continue; const at = p.value >= cutoff; if (w === "in") { ref.in++; if (at) ref.inAt++; } else { ref.near++; if (at) ref.nearAt++; } }
  const reference = { insideShare: ref.in ? ref.inAt / ref.in : null, outsideShare: ref.near ? ref.nearAt / ref.near : null, composites: ref.in + ref.near };
  const by = new Map(), tot = { atCutOutside: { n: 0, m: 0 }, belowInside: { n: 0, m: 0 } };
  for (const p of points || []) {
    let h = by.get(p.hole_id);
    if (!h) by.set(p.hole_id, (h = { hole_id: p.hole_id, n: 0, inside: 0, insideAt: 0, outside: 0, outsideAt: 0, atCutOutside: 0, atCutOutsideM: 0, belowInside: 0, belowInsideM: 0 }));
    h.n++;
    const w = where(p); if (!w) continue;
    const at = p.value >= cutoff, len = p.length > 0 ? p.length : 0;
    if (w === "in") { h.inside++; if (at) h.insideAt++; else { h.belowInside++; h.belowInsideM += len; tot.belowInside.n++; tot.belowInside.m += len; } }
    else { h.outside++; if (at) { h.outsideAt++; h.atCutOutside++; h.atCutOutsideM += len; tot.atCutOutside.n++; tot.atCutOutside.m += len; } }
  }
  const holes = [...by.values()].map((h) => {
    const insideShare = h.inside ? h.insideAt / h.inside : null, outsideShare = h.outside ? h.outsideAt / h.outside : null;
    const weaker = insideShare != null && reference.insideShare != null && insideShare < reference.insideShare - tol;
    const beyond = outsideShare != null && reference.outsideShare != null && outsideShare > reference.outsideShare + tol;
    const status = !h.inside && !h.outside ? "away" : weaker && beyond ? "disagrees" : beyond ? "grade outside" : weaker ? "weaker inside" : "agrees";
    const { insideAt: _a, outsideAt: _b, ...rest } = h;
    return { ...rest, insideShare, outsideShare, status };
  });
  return { oldM3: o * cv, newM3: n * cv, addedM3: add * cv, removedM3: rem * cv, reference, holes, ...tot };
}

// the year a hole was drilled: its collar's year field (a number since #3545, or a whole year as text), else the year in an id of the
// common form PREFIX-YY-NNN (DH-25-012 -> 2025), else null (an older hole, as far as an update can tell)
export function holeYear(collar) {
  const a = collar?.attrs || {};
  for (const k of Object.keys(a)) {
    if (!/(^|[\s_-])(year|yr)$|^(year|yr)([\s_-]|$)/i.test(k)) continue;
    const v = Number(a[k]);
    if (Number.isInteger(v) && v >= 1800 && v <= 2200) return v;
  }
  const m = /^[A-Za-z]+-(\d\d)-/.exec(String(collar?.hole_id ?? ""));
  return m ? 2000 + Number(m[1]) : null;
}

// TASKS.csv #3674 (#3673 phase 2) — the new holes by more than a year: a typed list of hole ids, or a collar date field (a date in the field, ISO-like:
// 2025-03-12, 2025/03/12, 2025-03, or a bare year) on or after a date. A hole with no readable date is an older hole, as one with no year is.
export function holeDate(collar, field) {
  const v = collar?.attrs?.[field];
  const m = /^\s*(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?(?:[T\s].*)?\s*$/.exec(String(v ?? ""));
  if (!m) return null;
  const y = Number(m[1]), mo = m[2] ? Number(m[2]) : 1, d = m[3] ? Number(m[3]) : 1;
  if (y < 1800 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`; // sortable as text
}
// the collar fields whose values mostly read as dates (at least half of the collars that have the field, and at least one)
export function collarDateFields(collars) {
  const by = new Map();
  for (const c of collars || []) for (const k of Object.keys(c?.attrs || {})) { const e = by.get(k) || { n: 0, ok: 0 }; e.n++; if (holeDate(c, k)) e.ok++; by.set(k, e); }
  return [...by].filter(([, e]) => e.ok >= 1 && e.ok * 2 >= e.n).map(([k]) => k);
}
// the ids of the new holes. sel: { mode: "year", year } | { mode: "list", ids: [...] } | { mode: "date", field, date: "YYYY-MM-DD" }
export function newHoleIds(collars, sel) {
  const out = [];
  if (sel?.mode === "list") { const want = new Set((sel.ids || []).map((x) => String(x).trim()).filter(Boolean)); for (const c of collars || []) if (want.has(String(c.hole_id))) out.push(c.hole_id); return out; }
  if (sel?.mode === "date") { for (const c of collars || []) { const d = holeDate(c, sel.field); if (d != null && d >= sel.date) out.push(c.hole_id); } return out; }
  for (const c of collars || []) { const y = holeYear(c); if (y != null && y >= sel?.year) out.push(c.hole_id); }
  return out;
}
// a typed list read: ids separated by commas, spaces, semicolons or new lines
export const parseIdList = (text) => [...new Set(String(text || "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];

// TASKS.csv #3876 (#3674's open point) — the new holes' indicator was searched in a sphere of two sample spacings, whatever the domain's shape: a
// steep vein domain took grade from the new holes as far across it as along it. It is now searched along the domain's OWN plane: the plane of the
// old mesh's vertices (thinned to maxPoints, fitted as the grade shell's plane search fits the composites at the cut-off, lib/viewer/shellPlane.js),
// an ellipsoid with the volume of the sphere and the ratios capped as there. A domain with no clear plane (its vertices about as wide every way,
// under minRatio, or parts too far apart for one plane) keeps the sphere. positions: the old mesh, x y z per vertex (the composites' frame).
// -> shellPlaneSearch's result ({ trend, basis, scales, majorM, axesM, ... }) or null (the sphere)
export function domainPlaneSearch(positions, radiusM, { maxPoints = 5000, minRatio = 1.5 } = {}) {
  const n = Math.floor((positions?.length || 0) / 3);
  if (!(radiusM > 0) || n < PLANE_MIN_COMPOSITES) return null;
  const step = Math.max(1, Math.ceil(n / maxPoints)), pts = [];
  for (let i = 0; i < n; i += step) pts.push({ x: positions[3 * i], y: positions[3 * i + 1], z: positions[3 * i + 2], hole_id: "domain" });
  const s = shellPlaneSearch(pts, radiusM, { minHoles: 1 });
  return s?.trend && s.trend.ratios.max >= minRatio ? s : null;
}
