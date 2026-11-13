import { plannedTrace } from "./plannedTrace.js"; // TASKS.csv #524 — the deviated planned trace (#3159: moved there)
// TASKS.csv #119 — drillhole planning / target design. #188 already built the planned-hole ENTITY
// (store.jsx `plannedHoles`, the Targeting sidebar's CRUD + dashed 3D rendering (colors.planned, #1121) + CSV export)
// and the "does this plan collide with an existing hole / how many metres of a narrowed voxel band
// does it cut" checks. #119's remaining, distinct asks — both quoted from the Micromine- and
// Leapfrog-specialist audits in its own TASKS.csv row — are the two things in this file:
//
//   1. "plan a hole from a collar with target azimuth/dip to HIT A 3D TARGET POINT or depth"
//      -> solveOrientationToTarget(): the inverse problem. Given where you can put the rig and where
//         you want the hole to end up, give me the azimuth/dip/length to type in.
//      -> missDistanceToTarget(): the forward check for a plan you already have.
//
//   2. "compare PLANNED VS. ACTUAL (as-drilled) trace once surveyed"
//      -> comparePlannedToActual(): once the hole is drilled and its survey is imported, how far did
//         it wander from the design?
//
// Everything here is pure — no React, no three.js — so it is unit-checkable in plain Node (see #119's
// TASKS.csv notes for the verification numbers), which is the whole reason it isn't inlined into
// ViewerModule.jsx like the #188 checks were.
//
// ---------------------------------------------------------------------------------------------
// DIP SIGN CONVENTION — the single most dangerous thing in this file. Read before editing.
// ---------------------------------------------------------------------------------------------
// This module speaks the USER-FACING convention throughout: dip is NEGATIVE below horizontal, i.e.
// exactly what a user types into the Targeting form, what a collars.csv contains (sample_data:
// -60, -65, -70 for downward holes), and what plannedHoles.dip stores. It is NOT desurvey.js's
// internal positive-down convention. ViewerModule's plannedHoleTrace() is the one place that flips
// the sign on the way into desurveyHole (see its own long comment, TASKS.csv #188), and this file
// deliberately stays on the outside of that flip so that a value produced by solveOrientationToTarget
// can be written straight into a plannedHole with no further conversion.
//
// NOTE the asymmetry that follows from the above and is easy to get wrong: `collars` rows in the
// store have ALREADY been flipped to positive-down by commitImportData's `flipDip`, so a real
// drilled hole's collar.dip is positive-down while a planned hole's dip is negative-down. Only
// comparePlannedToActual touches both, and it goes through desurveyHole for the real side (which
// wants positive-down, i.e. the stored value, unflipped) and through the caller-supplied planned
// trace for the planned side. Neither is re-flipped here.

const toDeg = (r) => (r * 180) / Math.PI;
const norm360 = (a) => ((a % 360) + 360) % 360;

// Shortest signed difference between two compass bearings, in [-180, 180). Byte-for-byte the same
// expression as desurvey.js's shortAzDelta, deliberately — an azimuth deviation of "5 degrees" must
// not be reported as 355 (TASKS.csv #218 is the bug that taught this codebase never to subtract
// bearings raw). Note the half-open interval: an exact 180-degree reversal returns -180, not +180
// (verified against shortAzDelta, which does the same). The two are the same physical rotation and
// the case is degenerate for a drillhole, so matching the existing helper beats picking a prettier
// sign here and having two subtly different bearing-difference conventions in one codebase.
export const azDiff = (from, to) => ((((to - from) % 360) + 540) % 360) - 180;

// ---------------------------------------------------------------------------------------------
// 1a. Inverse problem: collar + target point -> the orientation to drill.
// ---------------------------------------------------------------------------------------------
// `collar` and `target` are both world {x (easting), y (northing), z (elevation)} — the same frame
// desurveyHole outputs and the same one the 3D scene's pick/cursor produces.
//
// Returns { azimuth (deg, 0-360, compass bearing), dip (deg, NEGATIVE below horizontal), length
// (metres, straight-line collar->target), horizontal (metres), vertical (metres, positive = target
// is BELOW the collar) }, or null when the target is the collar itself (no direction is defined).
//
// A planned hole is a straight line, so this is exact, and the straight line is also trivially the
// SHALLOWEST way to reach the point (any curved or differently-oriented path is at least as long) —
// which is what the audit's "hits the modelled contact at the shallowest depth" phrasing is after.
export function solveOrientationToTarget(collar, target) {
  if (!collar || !target) return null;
  const dE = target.x - collar.x;
  const dN = target.y - collar.y;
  const dDown = collar.z - target.z; // positive when the target is below the collar
  const horizontal = Math.hypot(dE, dN);
  const length = Math.hypot(horizontal, dDown);
  if (!(length > 1e-9)) return null;

  // Straight-up / straight-down: azimuth is genuinely undefined (any bearing gives the same line).
  // Report 0 rather than whatever atan2(0,0) happens to be, so the number written into the form is
  // stable and doesn't jitter with floating-point dust in dE/dN.
  const azimuth = horizontal < 1e-9 ? 0 : norm360(toDeg(Math.atan2(dE, dN)));
  // atan2(dE, dN) — NOT atan2(dN, dE): a compass bearing is measured clockwise FROM NORTH, so north
  // is the first argument. This matches desurvey.js's dirNET (n = sin I cos Az, e = sin I sin Az).
  const dip = -toDeg(Math.atan2(dDown, horizontal)); // negative below horizontal (user convention)
  return { azimuth, dip, length, horizontal, vertical: dDown };
}

// TASKS.csv #2250 (review #2174, underground planning) — a rig stands where a collar already is: the n existing collars nearest the target
// (3D distance) with the azimuth, dip (negative down, positive for an uphole) and length a straight hole from each needs. The planner solved
// a 523 m hole from a collar picked by hand where a 60 m hole from the nearest cuddy would do. -> [{ hole_id, x, y, z, azimuth, dip, length }]
export function nearestCollarsToTarget(collars, target, n = 5) {
  if (!target || ![target.x, target.y, target.z].every(Number.isFinite)) return [];
  return (collars || [])
    .filter((c) => [c?.x, c?.y, c?.z].every(Number.isFinite))
    .map((c) => ({ c, d: Math.hypot(c.x - target.x, c.y - target.y, c.z - target.z) }))
    .filter((e) => e.d > 1e-6)
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(({ c }) => { const s = solveOrientationToTarget(c, target); return { hole_id: c.hole_id, x: c.x, y: c.y, z: c.z, azimuth: s.azimuth, dip: s.dip, length: s.length }; });
}

// ---------------------------------------------------------------------------------------------
// 1b. Forward check: how close does an EXISTING plan actually get to a target point?
// ---------------------------------------------------------------------------------------------
// `pts` is a desurveyed trace ([{md,x,y,z}] — whatever ViewerModule's plannedHoleTrace returns for a
// planned hole, or desurveyHole for a real one). Returns the closest approach to `target`:
// { distance, md (depth of closest approach), point, beyondToe } where `beyondToe` flags "the hole
// is pointing the right way but isn't long enough" — the closest point is the toe itself, so the
// plan needs more metres rather than a different orientation. That distinction is the difference
// between a useful readout and a bare number.
//
// Measures against the polyline's SEGMENTS, not just its vertices: on a ~3 m-sampled trace, vertex-
// only sampling can overstate the miss by up to 1.5 m, which is the same order as the misses a
// targeting tool is being asked to resolve.
export function missDistanceToTarget(pts, target) {
  if (!pts || pts.length === 0 || !target) return null;
  let best = { distance: Infinity, md: 0, point: null, beyondToe: false };
  const consider = (p, md) => {
    const d = Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z);
    if (d < best.distance) best = { distance: d, md, point: p, beyondToe: false };
  };
  consider(pts[0], pts[0].md);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z;
    const len2 = vx * vx + vy * vy + vz * vz;
    consider(b, b.md);
    if (len2 <= 1e-12) continue;
    // Project the target onto the segment and keep it only if the foot lands strictly inside —
    // the endpoints are already covered by consider() above.
    let t = ((target.x - a.x) * vx + (target.y - a.y) * vy + (target.z - a.z) * vz) / len2;
    if (t <= 0 || t >= 1) continue;
    consider({ x: a.x + vx * t, y: a.y + vy * t, z: a.z + vz * t }, a.md + (b.md - a.md) * t);
  }
  const toe = pts[pts.length - 1];
  // "Beyond the toe" means the nearest point IS the toe and the target lies further along the hole's
  // own direction — i.e. drilling deeper would close the gap. If the target is off to the side of the
  // toe instead, more metres won't help and the orientation is what's wrong.
  if (best.point && Math.abs(best.md - toe.md) < 1e-6 && pts.length > 1) {
    const prev = pts[pts.length - 2];
    const dx = toe.x - prev.x, dy = toe.y - prev.y, dz = toe.z - prev.z;
    const tx = target.x - toe.x, ty = target.y - toe.y, tz = target.z - toe.z;
    if (dx * tx + dy * ty + dz * tz > 0) best.beyondToe = true;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// 2. Planned vs. as-drilled.
// ---------------------------------------------------------------------------------------------
// `plannedPts` and `actualPts` are both desurveyed world traces. The actual one MUST have been built
// with the project's selected desurvey method (TASKS.csv #135) — that is precisely why #119 and #135
// were paired: a "the hole wandered 12 m off plan" readout is meaningless if the 12 m is partly an
// artifact of desurveying the as-drilled hole differently from how the 3D view draws it.
//
// Returns null if either trace is empty. Otherwise:
//   collarOffset  — distance between the two collars (did the rig actually set up where planned?)
//   toeOffset     — distance between the two toes (the headline "how far off did it end up" number)
//   maxSeparation / meanSeparation (+ maxSeparationMd) — sampled at `step` metres over the depth
//                   range the two holes SHARE, so a hole drilled deeper or shallower than planned
//                   doesn't manufacture a huge separation out of the non-overlapping tail
//   plannedLength / actualLength / lengthDiff — the depth difference reported separately, since it's
//                   a different decision (did we stop short?) from "did it deviate?"
//   azimuthDiff / dipDiff — attitude at the shared TD, signed, planned -> actual
//   sharedDepth   — how much of the hole the separation numbers actually cover
//
// `step` defaults to 5 m: fine enough that the max is not materially undersampled on a real hole
// (desurveyHole's own trace is ~3 m), coarse enough that a 1,000 m hole is 200 samples, not 200,000.
export function comparePlannedToActual(plannedPts, actualPts, step = 5) {
  if (!plannedPts?.length || !actualPts?.length) return null;
  const plannedLength = plannedPts[plannedPts.length - 1].md;
  const actualLength = actualPts[actualPts.length - 1].md;
  const sharedDepth = Math.min(plannedLength, actualLength);

  const at = (pts, md) => {
    // Local copy of desurvey.js's pointOnTrace semantics, kept here so this module stays dependency-
    // free and Node-checkable on its own; both are plain linear interpolation between trace points.
    if (md <= pts[0].md) return pts[0];
    for (let i = 0; i < pts.length - 1; i++) {
      if (md >= pts[i].md && md <= pts[i + 1].md) {
        const span = pts[i + 1].md - pts[i].md, t = span <= 0 ? 0 : (md - pts[i].md) / span;
        return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t, z: pts[i].z + (pts[i + 1].z - pts[i].z) * t };
      }
    }
    return pts[pts.length - 1];
  };
  const sep = (md) => { const a = at(plannedPts, md), b = at(actualPts, md); return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); };

  let maxSeparation = 0, maxSeparationMd = 0, sum = 0, n = 0;
  const nSteps = Math.max(1, Math.ceil(sharedDepth / step));
  for (let i = 0; i <= nSteps; i++) {
    const md = Math.min(sharedDepth, (sharedDepth * i) / nSteps);
    const d = sep(md);
    if (d > maxSeparation) { maxSeparation = d; maxSeparationMd = md; }
    sum += d; n++;
  }

  // Attitude comparison at the shared TD. Taken over the last `step` metres of each trace rather than
  // from the stored design angles, so it reflects the trace as actually drawn (and works even if a
  // planned hole's stored azimuth/dip were edited without its trace being rebuilt).
  const attitude = (pts) => {
    const end = at(pts, Math.min(sharedDepth, pts[pts.length - 1].md));
    const back = at(pts, Math.max(pts[0].md, Math.min(sharedDepth, pts[pts.length - 1].md) - step));
    const dE = end.x - back.x, dN = end.y - back.y, dDown = back.z - end.z;
    const h = Math.hypot(dE, dN);
    if (h < 1e-9 && Math.abs(dDown) < 1e-9) return null;
    return { azimuth: h < 1e-9 ? null : norm360(toDeg(Math.atan2(dE, dN))), dip: -toDeg(Math.atan2(dDown, h)) };
  };
  const ap = attitude(plannedPts), aa = attitude(actualPts);

  const pc = plannedPts[0], ac = actualPts[0];
  const pt = plannedPts[plannedPts.length - 1], atoe = actualPts[actualPts.length - 1];
  return {
    collarOffset: Math.hypot(pc.x - ac.x, pc.y - ac.y, pc.z - ac.z),
    toeOffset: Math.hypot(pt.x - atoe.x, pt.y - atoe.y, pt.z - atoe.z),
    maxSeparation, maxSeparationMd, meanSeparation: sum / n,
    plannedLength, actualLength, lengthDiff: actualLength - plannedLength,
    sharedDepth,
    azimuthDiff: ap?.azimuth != null && aa?.azimuth != null ? azDiff(ap.azimuth, aa.azimuth) : null,
    dipDiff: ap && aa ? aa.dip - ap.dip : null,
  };
}

// TASKS.csv #524 — lift / drift: hasDeviation, deviationStations and plannedTrace live in plannedTrace.js (TASKS.csv #3159), re-exported here.
export { hasDeviation, deviationStations, plannedTrace } from "./plannedTrace.js";

// Aim off so the CURVED hole reaches the target: start from the straight solution, see where the deviated hole
// actually passes, move the aim point by the miss, repeat (converges in a few steps for realistic lift / drift).
// Returns { azimuth, dip, length (md at the target), miss, iterations } in the user convention, or null.
export function solveWithDeviation(collar, target, { lift = 0, drift = 0, tol = 0.05, maxIter = 12 } = {}) {
  let aim = { ...target }, best = null;
  for (let k = 1; k <= maxIter; k++) {
    const s = solveOrientationToTarget(collar, aim);
    if (!s) return null;
    const probe = plannedTrace({ ...collar, azimuth: s.azimuth, dip: s.dip, length: s.length * 1.25 + 50, lift, drift });
    const m = missDistanceToTarget(probe, target);
    if (!m) return null;
    const cand = { azimuth: s.azimuth, dip: s.dip, length: m.md, miss: m.distance, iterations: k };
    if (!best || cand.miss < best.miss) best = cand;
    if (m.distance < tol) break;
    aim = { x: aim.x + (target.x - m.point.x), y: aim.y + (target.y - m.point.y), z: aim.z + (target.z - m.point.z) };
  }
  return best;
}

// TASKS.csv #1835 (review #1646, Kodiak) — the other way round: keep the dip and azimuth a rig can drill and find the COLLAR. The
// solver above took any picked collar and returned a -21.8 deg hole to the chargeability high without comment. A line through the
// target at (azimuth, dip) is walked up-hole until it meets the ground: the terrain (groundAt(x, y) -> z or NaN, iterated until the
// collar sits on it) or, with no terrain, the typed surface elevation. dip is NEGATIVE below horizontal (the user convention).
// -> { x, y, z, length (target to collar), horizontal, source: "terrain" | "elevation", iterations, converged } or null (a flat or
// upward dip, a target above the surface, or ground not found)
export function solveCollarForTarget(target, azimuth, dip, { groundAt = null, surfaceZ = NaN, maxIter = 25 } = {}) {
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) return null;
  if (!Number.isFinite(azimuth) || !Number.isFinite(dip) || !(dip < 0)) return null;
  const rad = (v) => (v * Math.PI) / 180;
  const a = rad(azimuth), d = rad(-dip);
  const sE = Math.sin(a) * Math.cos(d), sN = Math.cos(a) * Math.cos(d); // per metre down the hole (plan); the hole falls sin(d) per metre
  const at = (zs) => { const L = (zs - target.z) / Math.sin(d); return { x: target.x - L * sE, y: target.y - L * sN, z: zs, length: L, horizontal: L * Math.cos(d) }; };
  if (typeof groundAt === "function") {
    let zs = Number.isFinite(surfaceZ) ? surfaceZ : groundAt(target.x, target.y);
    if (!Number.isFinite(zs)) return null;
    let c = at(zs);
    for (let i = 0; i < maxIter; i++) {
      if (!(c.length > 0)) return null;
      const g = groundAt(c.x, c.y);
      if (!Number.isFinite(g)) return null;
      if (Math.abs(g - c.z) < 0.05) return { ...c, source: "terrain", iterations: i + 1, converged: true };
      c = at(g);
    }
    return c.length > 0 ? { ...c, source: "terrain", iterations: maxIter, converged: false } : null;
  }
  if (!Number.isFinite(surfaceZ) || !(surfaceZ > target.z)) return null;
  return { ...at(surfaceZ), source: "elevation", iterations: 0, converged: true };
}
// a dip flatter than this (below horizontal) is hard to set a rig up for and wanders more: said, not refused (#1835)
export const SHALLOW_DIP_DEG = 40;
export const isShallowDip = (dip) => Number.isFinite(dip) && dip < 0 && dip > -SHALLOW_DIP_DEG;
