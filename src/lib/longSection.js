// TASKS.csv #3089 (Matt, 2026-11-12, after a published figure: the Sanshandao gold deposit's thickness / grade / grade x thickness contour
// maps) — Grade x thickness on a LONG SECTION, for a steep vein or lode: each hole's intercept pierce point (the intercepts' mid-point,
// weighted by length) projected onto a vertical plane along strike, at a typed azimuth or at the strike of the intercepts' best-fit plane
// (lib/vein.js fitPlane); thickness true (normal to the plane), horizontal (across strike, level) or downhole; then thickness, grade and GT
// gridded in (along strike, elevation) with the plan's own estimator (lib/accumulation.js planGrid) and masked to the drilled extent (the
// outline of the pierce points), so the contours stop where the data stops. Every deposit style: no cut-off or unit is assumed here, the
// caller passes the intercepts it built from the user's typed cut-off and the element's own unit. Pure: no DOM.
import { fitPlane } from "./vein.js";
import { planGrid, planSpacing } from "./accumulation.js";

const RAD = Math.PI / 180;
const az360 = (a) => ((a % 360) + 360) % 360;

// The plane. mode "azimuth": a vertical plane whose strike (the direction along strike, left to right on the section) is azimuthDeg.
// mode "fit": the intercepts' best-fit plane (at least 3 pierce points with an intercept, not in a line): its strike, dip and normal; the
// section is still the vertical plane along that strike (a vertical longitudinal projection), and true thickness is measured normal to the
// fitted plane. -> { strikeAz, dip, normal: { x, y, z } (unit), origin: { x, y }, fit: fitPlane's result | null } | { error }
export function sectionFrame(pierces, { mode = "azimuth", azimuthDeg = null } = {}) {
  const P = (pierces || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (P.length < 2) return { error: "few" };
  const origin = { x: Math.min(...P.map((p) => p.x)), y: Math.min(...P.map((p) => p.y)) };
  const ore = P.filter((p) => p.thicknessM > 0);
  const fit = ore.length >= 3 ? fitPlane(ore.map((p) => ({ x: p.x, y: p.y, z: p.z }))) : null;
  const usable = fit && fit.collinearity >= 0.05;
  if (mode === "fit") {
    if (!usable) return { error: "nofit", fit };
    const strikeAz = az360(fit.dipDir - 90);
    return { strikeAz, dip: fit.dip, normal: fit.normal, origin, fit };
  }
  if (!Number.isFinite(azimuthDeg)) return { error: "azimuth", fit: usable ? fit : null };
  const a = az360(azimuthDeg) * RAD;
  // the horizontal normal of a vertical plane striking at a (strike vector (sin a, cos a, 0))
  return { strikeAz: az360(azimuthDeg), dip: 90, normal: { x: Math.cos(a), y: -Math.sin(a), z: 0 }, origin, fit: usable ? fit : null };
}

// The three thicknesses of an intercept from its downhole length and the hole's direction across it (dir: a unit vector, or null):
// true = downhole x |cos(hole, plane normal)|; horizontal = true / sin(dip) (a vertical plane: the same as true); downhole as logged.
// Without a direction (no survey, one point) the downhole length is all there is: true and horizontal are null.
export function thicknesses(downholeM, dir, frame) {
  if (!(downholeM > 0)) return { downhole: 0, true: 0, horizontal: 0 };
  if (!dir || !frame?.normal) return { downhole: downholeM, true: null, horizontal: null };
  const n = frame.normal, c = Math.abs(dir.x * n.x + dir.y * n.y + dir.z * n.z);
  const t = downholeM * Math.min(1, c), s = Math.sin(Math.max(1, Math.min(90, frame.dip)) * RAD);
  return { downhole: downholeM, true: t, horizontal: t / s };
}

// pierces: [{ hole_id, x, y, z, thicknessM (downhole), meanGrade, dir }] (a hole assayed with no intercept: thicknessM 0); kind: "true" |
// "horizontal" | "downhole". -> [{ hole_id, along, elev, x, y, z, thick, grade, gt, downhole, true, horizontal }]: along strike from the
// westmost / southmost pierce point's projection (metres, left to right), elevation as it is; GT = grade x the chosen thickness. A hole
// with no direction keeps its downhole thickness (counted in `noDir`).
export function projectPierces(pierces, frame, kind = "true") {
  const a = frame.strikeAz * RAD, sx = Math.sin(a), sy = Math.cos(a);
  let noDir = 0;
  const out = [];
  for (const p of pierces || []) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
    const th = thicknesses(p.thicknessM, p.dir, frame);
    let t = kind === "downhole" ? th.downhole : th[kind];
    if (t == null) { t = th.downhole; if (p.thicknessM > 0) noDir++; }
    const grade = p.thicknessM > 0 && Number.isFinite(p.meanGrade) ? p.meanGrade : 0;
    out.push({ hole_id: p.hole_id, along: (p.x - frame.origin.x) * sx + (p.y - frame.origin.y) * sy, elev: p.z, x: p.x, y: p.y, z: p.z, thick: t, grade, gt: grade * t, ...th });
  }
  // start the along-strike axis at the first pierce point
  const a0 = out.length ? Math.min(...out.map((q) => q.along)) : 0;
  for (const q of out) q.along -= a0;
  out.noDir = noDir;
  return out;
}

// the convex hull of [x, y] points (monotone chain), counter-clockwise
export function hull2d(pts) {
  const P = [...pts].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
const inHull = (h, x, y, tol) => {
  if (h.length < 3) return false;
  for (let i = 0; i < h.length; i++) {
    const [ax, ay] = h[i], [bx, by] = h[(i + 1) % h.length], ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey) || 1;
    if ((ex * (y - ay) - ey * (x - ax)) / l < -tol) return false; // outside this edge by more than tol
  }
  return true;
};

// The three grids on the section, (along, elevation): thickness and GT by the plan's estimator (inverse distance within `radius`), grade =
// GT / thickness where there is a thickness; every node outside the pierce points' outline (plus half a cell) left out, so the panels stop
// where the drilling stops. -> { nx, ny, x0, y0, cell, thickness, gt, grade, hull, estimated, radius, cellAsked } | null
export function sectionGrids(points, { cell, radius, maxNodes = 120000 } = {}) {
  const P = (points || []).map((q) => ({ x: q.along, y: q.elev, gt: q.gt, thicknessM: q.thick }));
  const g = planGrid(P, { cell, radius, pad: 0, maxNodes });
  if (!g) return null;
  const hull = hull2d(P.map((p) => [p.x, p.y]));
  const grade = new Float64Array(g.nx * g.ny).fill(NaN);
  let n = 0;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const k = i + g.nx * j, x = g.x0 + i * g.cell, y = g.y0 + j * g.cell;
    if (!inHull(hull, x, y, g.cell / 2)) { g.gt[k] = NaN; g.thickness[k] = NaN; continue; }
    if (!Number.isFinite(g.gt[k])) continue;
    n++;
    if (g.thickness[k] > 1e-9) grade[k] = g.gt[k] / g.thickness[k];
  }
  return { ...g, grade, hull, estimated: n };
}

// the typical spacing of the pierce points on the section (for the default cell and search)
export const sectionSpacing = (points) => planSpacing((points || []).map((q) => ({ x: q.along, y: q.elev })));

// Contour levels: `step` when typed, else a round step (1, 2 or 5 x 10^n) giving about `n` bands over the finite values above 0.
// -> [levels ascending, the first > 0]
export function contourLevels(values, { step = null, n = 6 } = {}) {
  let hi = -Infinity, lo = Infinity;
  for (const v of values) if (Number.isFinite(v) && v > 0) { if (v > hi) hi = v; if (v < lo) lo = v; }
  if (!(hi > 0)) return [];
  let s = Number(step) > 0 ? Number(step) : null;
  if (!s) { const raw = hi / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; s = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
  const out = [];
  for (let k = 1; k * s <= hi * (1 + 1e-9) && out.length < 40; k++) out.push(+(k * s).toPrecision(12));
  return out.length ? out : [s];
}
// the band of a value: 0 below the first level, k between level k - 1 and level k, levels.length at or above the last
export function bandOf(v, levels) { let k = 0; while (k < levels.length && v >= levels[k]) k++; return k; }

// a light-to-dark ramp (pale yellow, orange, red, dark red) of `n` colours, as CSS rgb strings
export function rampColours(n) {
  const stops = [[255, 255, 204], [254, 217, 118], [253, 141, 60], [227, 26, 28], [128, 0, 38]];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0, f = t * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(f)), u = f - k;
    const c = stops[k].map((a, m) => Math.round(a + (stops[k + 1][m] - a) * u));
    out.push(`rgb(${c[0]},${c[1]},${c[2]})`);
  }
  return out;
}

// the pierce points as CSV rows (the export)
export function pierceRows(points, { gradeLabel, gtLabel, kind }) {
  const g = String(gradeLabel).replace(/[^\w%]+/g, "_"), t = String(gtLabel).replace(/[^\w%]+/g, "_");
  return points.map((q) => ({ hole_id: q.hole_id, along_strike_m: +q.along.toFixed(1), elevation_m: +q.elev.toFixed(1), x: +q.x.toFixed(1), y: +q.y.toFixed(1), z: +q.z.toFixed(1),
    downhole_m: +q.downhole.toFixed(2), true_m: q.true == null ? "" : +q.true.toFixed(2), horizontal_m: q.horizontal == null ? "" : +q.horizontal.toFixed(2),
    [`thickness_used_${kind}_m`]: +q.thick.toFixed(2), [`grade_${g}`]: +q.grade.toPrecision(5), [`gt_${t}`]: +q.gt.toPrecision(5) }));
}
