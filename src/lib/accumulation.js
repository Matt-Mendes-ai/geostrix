// TASKS.csv #2419 (review #2325, WA uranium; Matt's decision 2026-11-11: every deposit style) — grade x thickness, the number a thin flat
// body is resourced on: per hole, the mineralized thickness and GT (metres x grade, over the sampled metres) from Best intercepts' own
// rules (lib/geochem.js computeBestIntercepts: cut-off, minimum length, internal dilution), its top and base RL; then a 2D estimate of GT
// and thickness on a plan grid (inverse distance), a contour at a GT cut-off the user types, and area x GT x density = metal. Lighter than
// a block model, so it suits modest hardware. Pure: no DOM.
import { interceptSampledM, interceptGradeLength, unitBasis } from "./geochem.js";
import { CALC_PRESETS } from "./calcElement.js";
import { metalOf } from "./gradeTonnage.js";

// intercepts: computeBestIntercepts rows; positionAt(hole_id, md) -> { x, y, z } (world: east, north, elevation) | null
// -> [{ hole_id, thicknessM, sampledM, gt, meanGrade, intercepts, from, to, x, y, z, dir, topRL, baseRL }], best GT first. z: the intercepts'
// mid-point elevation (length-weighted, with x and y: the pierce point of a long section, #3089); dir: the hole's unit direction from the
// first intercept's top to the last one's base (null when they share a place), for a true thickness across a plane
export function holeTotals(intercepts, positionAt = null) {
  const by = new Map();
  for (const r of intercepts || []) {
    const h = by.get(r.hole_id) || { hole_id: r.hole_id, thicknessM: 0, sampledM: 0, gt: 0, intercepts: 0, from: Infinity, to: -Infinity, sx: 0, sy: 0, sz: 0, sw: 0 };
    const len = Number(r.length) || 0, s = interceptSampledM(r);
    h.thicknessM += len; h.sampledM += s; h.gt += interceptGradeLength(r); h.intercepts++;
    h.from = Math.min(h.from, r.from); h.to = Math.max(h.to, r.to);
    const p = positionAt ? positionAt(r.hole_id, (r.from + r.to) / 2) : null;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) { h.sx += p.x * len; h.sy += p.y * len; h.sz += (Number.isFinite(p.z) ? p.z : 0) * len; h.sw += len; }
    by.set(r.hole_id, h);
  }
  const out = [];
  for (const h of by.values()) {
    const top = positionAt ? positionAt(h.hole_id, h.from) : null, base = positionAt ? positionAt(h.hole_id, h.to) : null;
    const d = top && base ? [base.x - top.x, base.y - top.y, base.z - top.z] : null, dl = d ? Math.hypot(...d) : 0;
    out.push({ hole_id: h.hole_id, thicknessM: h.thicknessM, sampledM: h.sampledM, gt: h.gt, meanGrade: h.sampledM > 0 ? h.gt / h.sampledM : null, intercepts: h.intercepts,
      from: h.from, to: h.to, x: h.sw > 0 ? h.sx / h.sw : null, y: h.sw > 0 ? h.sy / h.sw : null, z: h.sw > 0 ? h.sz / h.sw : null, dir: dl > 1e-9 ? { x: d[0] / dl, y: d[1] / dl, z: d[2] / dl } : null, // #3089
      topRL: top ? top.z : null, baseRL: base ? base.z : null });
  }
  return out.sort((a, b) => b.gt - a.gt);
}

// TASKS.csv #3218 (review #3195, Galore Creek) — 'Total per hole' with 'Show as %' printed ppm under per-cent headings ('Cu (%) 14,810.997'):
// the totals in the unit the headings say, through the same display conversion as the intercept rows (toDisplay: stored -> shown, e.g.
// ppm -> % is v / 10,000). Thickness and counts are not grades and are unchanged. -> rows of the same shape
export function holeTotalsDisplay(totals, toDisplay = (v) => v) {
  return (totals || []).map((h) => ({ ...h, gt: toDisplay(h.gt), meanGrade: h.meanGrade == null ? null : toDisplay(h.meanGrade) }));
}

// assays restricted to the metres inside one logged unit: rows clipped to the unit's intervals of their hole (the grade is the row's)
// unitRows: [{ hole_id, from, to, value }] of a layer; code: the unit
export function clipAssaysToUnit(assays, unitRows, code) {
  const by = new Map();
  for (const r of unitRows || []) {
    if (String(r.value) !== String(code)) continue;
    const f = Number(r.from), t = Number(r.to);
    if (t > f) (by.get(r.hole_id) || by.set(r.hole_id, []).get(r.hole_id)).push([f, t]);
  }
  const out = [];
  for (const a of assays || []) {
    const iv = by.get(a.hole_id);
    if (!iv) continue;
    const f = Number(a.from), t = Number(a.to);
    for (const [u0, u1] of iv) { const x0 = Math.max(f, u0), x1 = Math.min(t, u1); if (x1 > x0 + 1e-9) out.push({ ...a, from: x0, to: x1 }); }
  }
  return out;
}

// the median distance from each hole to its nearest neighbour in plan (the plan grid's scale)
export function planSpacing(points) {
  const P = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (P.length < 2) return null;
  const d = P.map((a) => { let m = Infinity; for (const b of P) if (b !== a) m = Math.min(m, Math.hypot(a.x - b.x, a.y - b.y)); return m; }).filter(Number.isFinite).sort((a, b) => a - b);
  return d.length ? d[d.length >> 1] : null;
}

// points [{ x, y, gt, thicknessM }] -> a plan grid of GT and thickness by inverse distance (power 2) within `radius` of the holes, over the
// holes' box padded by `pad`; a node with no hole within the radius is NaN (not estimated, not barren). A hole with no intercept is a 0:
// pass it with gt 0 and thicknessM 0 (drilled, nothing at the cut-off), so the estimate closes against it.
export function planGrid(points, { cell, radius, pad = 0, power = 2, maxNodes = 250000 }) {
  const P = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.gt));
  if (!P.length || !(cell > 0) || !(radius > 0)) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  let c = cell;
  while (Math.ceil((x1 - x0) / c + 1) * Math.ceil((y1 - y0) / c + 1) > maxNodes) c *= 1.25;
  const nx = Math.max(1, Math.ceil((x1 - x0) / c) + 1), ny = Math.max(1, Math.ceil((y1 - y0) / c) + 1);
  const gt = new Float64Array(nx * ny).fill(NaN), th = new Float64Array(nx * ny).fill(NaN);
  // buckets of `radius` for the neighbour search
  const b = radius, key = (i, j) => i * 100003 + j, buckets = new Map();
  for (const p of P) { const k = key(Math.floor((p.x - x0) / b), Math.floor((p.y - y0) / b)); (buckets.get(k) || buckets.set(k, []).get(k)).push(p); }
  let n = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * c, y = y0 + j * c, bi = Math.floor((x - x0) / b), bj = Math.floor((y - y0) / b);
    let sw = 0, sg = 0, st = 0, exact = null;
    for (let a = -1; a <= 1; a++) for (let d = -1; d <= 1; d++) {
      const l = buckets.get(key(bi + a, bj + d)); if (!l) continue;
      for (const p of l) {
        const r = Math.hypot(p.x - x, p.y - y);
        if (r > radius) continue;
        if (r < 1e-6) { exact = p; continue; }
        const w = 1 / r ** power; sw += w; sg += w * p.gt; st += w * (p.thicknessM || 0);
      }
    }
    if (exact) { gt[i + nx * j] = exact.gt; th[i + nx * j] = exact.thicknessM || 0; n++; }
    else if (sw > 0) { gt[i + nx * j] = sg / sw; th[i + nx * j] = st / sw; n++; }
  }
  return { nx, ny, x0, y0, cell: c, cellAsked: cell, gt, thickness: th, estimated: n, radius };
}

// the nodes at or above a GT cut-off: area (each node stands for cell^2), tonnes (thickness x area x density), metal (GT x area x density,
// in metalOf(unit)'s unit: g for ppm / g/t, t for %), the mean grade (metal / tonnes, back in the grade unit)
export function planSummary(grid, cutoffGT, density, unit) {
  if (!grid) return null;
  const A = grid.cell * grid.cell, rho = Number(density) > 0 ? Number(density) : null, m = metalOf(unit);
  let nodes = 0, area = 0, vol = 0, gtArea = 0;
  for (let k = 0; k < grid.gt.length; k++) {
    const g = grid.gt[k];
    if (!Number.isFinite(g) || g < cutoffGT) continue;
    nodes++; area += A; vol += (grid.thickness[k] || 0) * A; gtArea += g * A;
  }
  const tonnes = rho ? vol * rho : null;
  return { nodes, areaM2: area, volumeM3: vol, tonnes, meanGrade: vol > 0 ? gtArea / vol : null, metal: rho && m ? gtArea * rho * m.factor : null, metalUnit: m ? m.unit : null, meanThicknessM: area > 0 ? vol / area : null };
}

// marching squares: the segments where the grid's `values` cross `level` (no segment through a NaN cell) -> [[x1, y1, x2, y2]]
export function contourSegments(grid, values, level) {
  if (!grid) return [];
  const { nx, ny, x0, y0, cell } = grid, out = [];
  const v = (i, j) => values[i + nx * j];
  const lerp = (a, b, va, vb) => a + ((level - va) / (vb - va)) * (b - a);
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
    const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
    if (![a, b, c, d].every(Number.isFinite)) continue;
    const X = x0 + i * cell, Y = y0 + j * cell, X1 = X + cell, Y1 = Y + cell;
    const pts = [];
    if ((a >= level) !== (b >= level)) pts.push([lerp(X, X1, a, b), Y]);
    if ((b >= level) !== (c >= level)) pts.push([X1, lerp(Y, Y1, b, c)]);
    if ((c >= level) !== (d >= level)) pts.push([lerp(X1, X, c, d), Y1]);
    if ((d >= level) !== (a >= level)) pts.push([X, lerp(Y1, Y, d, a)]);
    if (pts.length === 2) out.push([...pts[0], ...pts[1]]);
    else if (pts.length === 4) { out.push([...pts[0], ...pts[1]]); out.push([...pts[2], ...pts[3]]); }
  }
  return out;
}

// the element's oxide as Calc. element offers it (#2357): { oxide, factor, unit } when one preset converts this element alone
export function oxideOffer(symbol, unit) {
  if (unitBasis(unit).oxide) return null; // already reported as an oxide (#2487): its numbers are the oxide's
  for (const p of CALC_PRESETS) {
    const m = /^([A-Z][a-z]?)\*([\d.]+)$/.exec(String(p.expr || "").replace(/\s+/g, ""));
    if (m && m[1] === symbol && p.needs?.length === 1 && (!p.units?.[symbol] || p.units[symbol] === unit)) return { oxide: p.name, factor: Number(m[2]) };
  }
  return null;
}
// 'm·ppm', 'm% U3O8', 'm·g/t': the unit of a GT number
export function gtUnitLabel(gradeLabel, oxide = null) {
  const g = String(gradeLabel || "");
  const base = g === "%" ? "m%" : `m·${g}`;
  return oxide ? `${base} ${oxide}` : base;
}
