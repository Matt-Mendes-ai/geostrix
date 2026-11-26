// TASKS.csv #4103 (a Portuguese user, relayed by Matt 2026-11-26: valley faults traced in Google Earth as a KML polyline, draped on the DTM, a fault plane fitted as close as possible to the
// points, optionally a polynomial surface of order N) — fit a fault or vein from a LINE: any imported line (KML / KMZ / shapefile / GeoJSON / drawn), whatever its attributes.
//   traceLines(mapLayers)           every line of the map layers, as a list to choose from
//   drapeTrace(part, { ground })    its 3D points: the vertices' own altitudes when the file carries them (a KML with altitudeMode absolute), else the terrain's height under each point
//   fitTracePlane(points)           the best plane (least squares, the eigen / SVD fit of faultEvidence.fitPlane): strike, dip, dip direction, RMS, points used, the dip's error and,
//                                   when the dip is poorly constrained, WHY (a near-straight trace, little relief across it, level ground)
//   fitTraceSurface(points, order)  order 1 (the plane), 2 or 3: a polynomial height over the plane, w = f(u, v), in the plane's own strike / down-dip frame; its residuals and the caution flags
//   tracedEvidence(line, opts)      the evidence ITEM the Faults builder takes (points + orientations) and what to tell the geologist
// Pure: no React, no store; the caller gives the ground (x, y) -> z (NaN off the terrain). A plane through points that lie along a line is not defined: that is said, never guessed.
import { fitPlane, thinLine, mappedFaultAttitude } from "./faultEvidence.js";
import { lineLength } from "./faultPick.js";
import { arrMax, arrMin } from "./arrayStats.js";

const finite = (...v) => v.every(Number.isFinite);
const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const norm360 = (a) => ((a % 360) + 360) % 360;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// ---- THE KNOBS (tune here, once Matt or the user has tried it on real traces; each is read in one place and pinned by test/traceFit4103.test.mjs)
export const TRACE_STEP_M = 50; // the trace is read every 50 m (or a quarter of a short line), the relief the plane is fitted to
export const HEIGHT_SIGMA_M = 5; // what a terrain height and a hand-placed vertex are good to: the floor of the misfit the dip's error is judged by. Raise it for a coarse DEM
// POORLY CONSTRAINED: the dip's standard error (degrees) over which a fitted dip is warned about and the map / default dip offered. 10 is a first guess: with a 5 m height uncertainty it
// means a trace whose points leave the plane by less than a few metres over some 500 m is flagged. Lower it to warn more, raise it to trust short or gentle traces.
export const MAX_DIP_ERROR_DEG = 10;
export const LEVEL_DIP_DEG = 5; // a fitted dip under this is the ground itself (a trace on level ground), not a fault
export const DEGREES_BOX = 5; // a line whose every vertex lies within +-180 / +-90 and spans under this many "units" is read as longitude / latitude left unprojected

// the lines of the map layers (and the interpretation lines), to choose from: [{ id, name, layerName, layerId, feature, part, hasZ, lengthM, vertices }]
export function traceLines(mapLayers) {
  const out = [];
  (mapLayers || []).forEach((l, li) => {
    if (!l || !Array.isArray(l.features)) return;
    if (!l.interpretation && l.geomType !== "polyline") return;
    l.features.forEach((f, i) => (f.parts || (f.geometry ? [f.geometry] : [])).forEach((part, j) => {
      if (!Array.isArray(part) || part.length < 2) return;
      const a = f.attributes || {};
      const named = Object.entries(a).find(([k, v]) => /^name$/i.test(k) && v)?.[1] || Object.values(a).find((v) => typeof v === "string" && v.trim()) || "";
      const lengthM = lineLength(part);
      if (!(lengthM > 0)) return;
      out.push({ id: `trace:${l.id ?? li}:${i}:${j}`, name: String(named || `Line ${out.length + 1}`).slice(0, 60), layerName: String(l.name || ""), layerId: l.id ?? li, feature: f, part, hasZ: part.some((v) => Number.isFinite(v[2])), lengthM, vertices: part.length });
    }));
  });
  return out;
}

// longitude / latitude left in degrees (a KML whose CRS could not be brought into the project's): the plane would be fitted in degrees, nonsense. Said, not fitted.
export function looksLikeDegrees(part) {
  const v = (part || []).filter((p) => finite(p[0], p[1]));
  if (v.length < 2) return false;
  const xs = v.map((p) => p[0]), ys = v.map((p) => p[1]);
  return arrMax(xs.map(Math.abs)) <= 180 && arrMax(ys.map(Math.abs)) <= 90 && arrMax(xs) - arrMin(xs) < DEGREES_BOX && arrMax(ys) - arrMin(ys) < DEGREES_BOX;
}

// the 3D points of a line. heights: "auto" (the vertices' own altitudes where the file has them, the terrain elsewhere), "terrain" (always the terrain), "line" (only the file's altitudes).
// -> { points: [{ x, y, z }], source: "line" | "terrain" | "mixed", dropped (points with no height), lengthM, vertices }
export function drapeTrace(part, { ground = () => NaN, stepM = TRACE_STEP_M, heights = "auto" } = {}) {
  const clean = (part || []).filter((v) => finite(v[0], v[1]));
  const lengthM = lineLength(clean);
  const own = (v) => (heights !== "terrain" && Number.isFinite(v[2]) ? v[2] : NaN);
  const nOwn = clean.filter((v) => Number.isFinite(own(v))).length;
  if (clean.length < 2) return { points: [], source: "terrain", dropped: 0, lengthM, vertices: clean.length };
  let points = [], dropped = 0, source;
  if (nOwn === 0 || heights === "terrain") {
    source = "terrain";
    for (const [x, y] of thinLine(clean.map((v) => [v[0], v[1]]), stepM)) { const z = ground(x, y); if (Number.isFinite(z)) points.push({ x, y, z }); else dropped++; }
  } else {
    // the file's own altitudes, between the vertices straight; a vertex without one takes the terrain's (mixed), or goes when there is none (heights "line")
    source = nOwn === clean.length ? "line" : "mixed";
    const withZ = clean.map((v) => [v[0], v[1], Number.isFinite(own(v)) ? own(v) : heights === "line" ? NaN : ground(v[0], v[1])]).filter((v) => { const ok = Number.isFinite(v[2]); if (!ok) dropped++; return ok; });
    points = thinLine(withZ, stepM).map(([x, y, z]) => ({ x, y, z }));
  }
  return { points, source, dropped, lengthM, vertices: clean.length };
}

// the best plane through the points, and how well the dip is known. The dip's error is the standard error of the slope across the trace: the points' misfit (never under
// sigmaM, a height's own uncertainty) over the spread of the points across the trace and the square root of the independent points (`vertices`, the line's own, not the densified).
// -> { ok, why? ("few" | "straight": the points lie along a line, fitPlane's flat), strike, dip, dipDir, rms, n, dipErrorDeg, wellConstrained, problems: ["straight" | "little-relief" | "level"], plane }
export function fitTracePlane(points, { sigmaM = HEIGHT_SIGMA_M, vertices = null, maxErrorDeg = MAX_DIP_ERROR_DEG } = {}) {
  const P = (points || []).filter((p) => finite(p.x, p.y, p.z));
  if (P.length < 3) return { ok: false, why: "few", n: P.length, problems: [] };
  const f = fitPlane(P);
  if (f.flat || !f.spread) return { ok: false, why: "straight", n: P.length, problems: ["straight"] };
  const nEff = Math.max(3, Math.min(vertices ?? P.length, P.length));
  const sigma = Math.max(f.rms, sigmaM);
  const dipErrorDeg = Math.min(90, deg(Math.atan(sigma / (Math.sqrt(nEff) * f.spread[1]))));
  const problems = [];
  if (dipErrorDeg > maxErrorDeg) problems.push("little-relief"); // the dip's own error decides: a trace whose points leave a plane by a few metres only, over a long run, still fixes the dip well
  if (f.dip < LEVEL_DIP_DEG) problems.push("level");
  return { ok: true, strike: norm360(f.dipDir - 90), dip: f.dip, dipDir: f.dipDir, rms: f.rms, n: P.length, dipErrorDeg, wellConstrained: problems.length === 0, problems, plane: f };
}

// solves A x = b (small, dense) by Gaussian elimination with partial pivoting
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j]; x[r] = s / M[r][r]; }
  return x;
}

// the plane's own frame: u along strike (horizontal), v down the dip in the plane, n the upward normal. A level plane has no strike: u east, v north.
function frameOf(plane) {
  const n = plane.normal;
  let u = [-n[1], n[0], 0]; const ul = Math.hypot(u[0], u[1]);
  u = ul > 1e-9 ? [u[0] / ul, u[1] / ul, 0] : [1, 0, 0];
  let v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]]; // n x u
  if (v[2] > 0) v = v.map((x) => -x); // down the dip
  return { u, v, n };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// a polynomial height over the plane, w = sum c_ij x^i y^j (i + j <= order; x, y the in-plane coordinates scaled to +-1), least squares. -> { ok, order, terms, rms, worst, worstAt,
// residuals: [{ x, y, z, r }], evaluate(x, y, z), normalAt(x, y, z) -> { dip, dipDir }, caution: ["overfit" | "line" | "extrapolates"] } (the plane itself for order 1)
export function fitTraceSurface(points, order = 2, { vertices = null } = {}) {
  const P = (points || []).filter((p) => finite(p.x, p.y, p.z));
  const k = Math.max(1, Math.min(3, Math.round(order)));
  const T = ((k + 1) * (k + 2)) / 2;
  const f = fitPlane(P);
  if (P.length < Math.max(3, T) || f.flat || !f.centroid) return { ok: false, why: P.length < Math.max(3, T) ? "few" : "straight", order: k, terms: T, n: P.length };
  const c = f.centroid, { u, v, n } = frameOf(f);
  const local = P.map((p) => { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; return { pu: dot(d, u), pv: dot(d, v), pw: dot(d, n) }; });
  const su = Math.max(1e-9, arrMax(local.map((q) => Math.abs(q.pu)))), sv = Math.max(1e-9, arrMax(local.map((q) => Math.abs(q.pv))));
  const exps = [];
  for (let i = 0; i <= k; i++) for (let j = 0; i + j <= k; j++) exps.push([i, j]);
  const basis = (x, y) => exps.map(([i, j]) => x ** i * y ** j);
  const G = exps.map(() => exps.map(() => 0)), h = exps.map(() => 0);
  for (const q of local) { const b = basis(q.pu / su, q.pv / sv); for (let a = 0; a < T; a++) { h[a] += b[a] * q.pw; for (let e = 0; e < T; e++) G[a][e] += b[a] * b[e]; } }
  const ridge = 1e-4 * (G.reduce((s, r, i) => s + r[i], 0) / T || 1) + 1e-12; // terms the points cannot fix (a trace along one line: only its own curve is on the surface) fall to zero, not to centimetre noise blown up across the trace (at 1e-9 an exact plane read 15-30 degrees)
  for (let a = 0; a < T; a++) G[a][a] += ridge;
  const coef = solve(G, h);
  if (!coef) return { ok: false, why: "straight", order: k, terms: T, n: P.length };
  const wAt = (x, y) => basis(x, y).reduce((s, b, a) => s + b * coef[a], 0);
  const residuals = P.map((p, i) => ({ x: p.x, y: p.y, z: p.z, r: local[i].pw - wAt(local[i].pu / su, local[i].pv / sv) }));
  const rms = Math.sqrt(residuals.reduce((s, q) => s + q.r * q.r, 0) / residuals.length);
  let worst = 0, worstAt = 0; residuals.forEach((q, i) => { if (Math.abs(q.r) > worst) { worst = Math.abs(q.r); worstAt = i; } });
  const grad = (x, y) => {
    let gu = 0, gv = 0;
    exps.forEach(([i, j], a) => { if (i) gu += coef[a] * i * x ** (i - 1) * y ** j; if (j) gv += coef[a] * j * x ** i * y ** (j - 1); });
    return [gu / su, gv / sv];
  };
  const normalAt = (px, py, pz) => {
    const d = [px - c.x, py - c.y, pz - c.z], [gu, gv] = grad(dot(d, u) / su, dot(d, v) / sv);
    let m = [-gu, -gv, 1]; const L = Math.hypot(...m); m = m.map((q) => q / L);
    let w = [m[0] * u[0] + m[1] * v[0] + m[2] * n[0], m[0] * u[1] + m[1] * v[1] + m[2] * n[1], m[0] * u[2] + m[1] * v[2] + m[2] * n[2]];
    if (w[2] < 0) w = w.map((q) => -q);
    return { dip: deg(Math.acos(Math.min(1, Math.abs(w[2])))), dipDir: norm360(deg(Math.atan2(w[0], w[1]))) };
  };
  const nEff = Math.max(3, Math.min(vertices ?? P.length, P.length));
  const spreadV = Math.sqrt(local.reduce((s, q) => s + q.pv * q.pv, 0) / local.length), spreadU = Math.sqrt(local.reduce((s, q) => s + q.pu * q.pu, 0) / local.length);
  const caution = [];
  if (k > 1) {
    if (nEff < 2 * T) caution.push("overfit"); // fewer than two independent points a coefficient
    if (spreadV < 0.05 * spreadU) caution.push("line"); // the points lie along one line in the plane: the surface across it is not fixed by them
    caution.push("extrapolates"); // a higher order bends where there are no points
  }
  // the surface in the plane's own coordinates (a, b metres along strike and down dip from the centre): the world point at (a, b), its height over the plane held to a few times what the points span
  // (a cubic runs away past the points), and where a world point falls
  const wLimit = Math.max(50, 3 * arrMax(local.map((q) => Math.abs(q.pw))) + 0.25 * Math.max(su, sv));
  const localOf = (p) => { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; return [dot(d, u), dot(d, v)]; };
  const pointAt = (a, b) => { const w = Math.max(-wLimit, Math.min(wLimit, wAt(a / su, b / sv))); return { x: c.x + a * u[0] + b * v[0] + w * n[0], y: c.y + a * u[1] + b * v[1] + w * n[1], z: c.z + a * u[2] + b * v[2] + w * n[2] }; };
  return { ok: true, order: k, terms: T, n: P.length, rms, worst, worstAt, residuals, caution, centre: c, frame: { u, v, n }, localOf, pointAt, evaluate: (px, py, pz) => { const d = [px - c.x, py - c.y, pz - c.z]; return wAt(dot(d, u) / su, dot(d, v) / sv); }, normalAt };
}

// orientations along the trace from a fitted surface (the surface's own dip and dip direction there), `count` of them, evenly spread over the points
export function orientationsAlong(points, surface, count = 6) {
  const n = points.length, take = Math.max(1, Math.min(count, n));
  const at = new Set(Array.from({ length: take }, (_, i) => (take === 1 ? Math.floor(n / 2) : Math.round((i * (n - 1)) / (take - 1)))));
  return points.filter((_, i) => at.has(i)).map((p) => { const a = surface.normalAt(p.x, p.y, p.z); return { x: p.x, y: p.y, z: p.z, dip: a.dip, azimuth: a.dipDir }; });
}

// the evidence item the Faults builder takes, from one line. In: line (traceLines' row), { ground, order (1 | 2 | 3), heights, mapDip (use the map's / the default dip, not the fit), stepM }.
// -> { ok, why?, item, fit } with fit = { source, dropped, points, vertices, plane, surface, order, usedMapDip, dip, dipDir, strike, problems, wellConstrained }
export function tracedEvidence(line, { ground = () => NaN, order = 1, heights = "auto", mapDip = false, stepM = TRACE_STEP_M } = {}) {
  const dr = drapeTrace(line.part, { ground, stepM, heights });
  if (dr.points.length < 3) return { ok: false, why: dr.points.length ? "few" : looksLikeDegrees(line.part) ? "degrees" : "no-height", drape: dr };
  const plane = fitTracePlane(dr.points, { vertices: dr.vertices });
  const surface = order > 1 ? fitTraceSurface(dr.points, order, { vertices: dr.vertices }) : null;
  const base = { source: dr.source, dropped: dr.dropped, points: dr.points.length, vertices: dr.vertices, order, plane, surface: surface?.ok ? surface : null, problems: plane.problems || [] };
  const mapAtt = mappedFaultAttitude(line.feature, line.part, []);
  let orientations, dip, dipDir, usedMapDip = false;
  if (mapDip || !plane.ok) { // the map's own dip (an attribute) or the type's default, towards the right-hand side of the trace
    usedMapDip = true; dip = mapAtt.dip; dipDir = mapAtt.dipDir;
    orientations = orientationsAcross(dr.points, dip, dipDir);
  } else if (surface?.ok) {
    orientations = orientationsAlong(dr.points, surface, 6); const mid = orientations[Math.floor(orientations.length / 2)]; dip = mid.dip; dipDir = mid.azimuth;
  } else {
    dip = plane.dip; dipDir = plane.dipDir;
    orientations = [{ x: plane.plane.centroid.x, y: plane.plane.centroid.y, z: plane.plane.centroid.z, dip, azimuth: dipDir }];
  }
  const fit = { ...base, usedMapDip, mapSource: mapAtt.source, dip, dipDir, strike: norm360(dipDir - 90), wellConstrained: usedMapDip ? null : plane.wellConstrained };
  const item = { id: line.id, kind: "traced", name: line.name, points: dr.points, orientations, holes: 0, dipSource: usedMapDip ? mapAtt.source : "fitted", fit };
  return { ok: true, item, fit, drape: dr };
}

// orientations at a few points along the trace with a given dip and dip direction (the map's, or the default dip)
function orientationsAcross(points, dip, dipDir) {
  const n = points.length, take = Math.max(2, Math.min(8, Math.round(n / 8)));
  const at = new Set(Array.from({ length: take }, (_, i) => Math.round((i * (n - 1)) / (take - 1))));
  return points.filter((_, i) => at.has(i)).map((p) => ({ x: p.x, y: p.y, z: p.z, dip, azimuth: dipDir }));
}

export const roundFit = (f) => f && { strike: Math.round(f.strike), dip: Math.round(f.dip), dipDir: Math.round(f.dipDir), rms: r2(f.plane?.rms ?? 0), dipError: r1(f.plane?.dipErrorDeg ?? 0), points: f.points };
export { rad };
