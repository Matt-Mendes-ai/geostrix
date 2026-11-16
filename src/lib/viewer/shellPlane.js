// TASKS.csv #3655 (Review's re-test R1 of #3580, Macpass) — after #3580 the grade shell's default search was a sphere of 2.5 times the sample
// spacing (60 m on Tom West, 80 m on the property): the shells held 73-84 % of the composites at the cut-off but did not follow them. Tom West
// Zn 2 % went from 4.95 to 16.74 Mm³, 49-64 % of its volume lay more than 25 m from every composite at the cut-off (76 % on the property), and
// it ran 59-63 m past them: a slab ~130 m thick round zones a few to tens of metres thick, about three times the volume.
//
// The default search now follows the plane of the composites at or above the cut-off, in each drilled cluster the shell grids
// (lib/viewer/shellBoxes.js), fitted as the Trends panel fits it (#3593, lib/samplesTrend.js; Tom West Zn >= 2 %: 66° -> 239°, 6 : 2.8 : 1):
//  - the search is an ellipsoid along that plane with the volume of the pane's search sphere (the pane's 60 m: 134 x 72 x 22 m), searched in
//    the estimate's own trend frame (estimation.js withTrend), so the grid stays in real coordinates and its cut, iso-surface and counts stay
//    in the worker (#3580 (b));
//  - a block is kept in the shell only within REACH_SHARE of that ellipsoid from a composite at the cut-off (40 x 22 x 7 m), the field lowered
//    to the cut-off there as the ground cut does (groundCap.js), so the surface closes at that reach instead of running on to the search's
//    edge.
// A cluster with too few composites at the cut-off for a plane (under PLANE_MIN_COMPOSITES, or from under PLANE_MIN_HOLES holes), or whose
// composites lie along a line, keeps the sphere. Measured on Macpass (#3655's notes):
//   Tom West Zn >= 2 %:        inside 82 -> 88 %, 17.6 -> 5.3 Mm³ of blocks, far (> 25 m) 66 -> 19 %, reach 60 -> 45 m
//   the property Ag >= 29.8:   inside 75 -> 73 %, 27.8 -> 6.6 Mm³, far 77 -> 29 %, reach 80 -> 61 m
import { samplesTrendByArea } from "../samplesTrend.js";
import { trendBasis, trendSearchScales } from "../trend.js";
import { planeVsDrilling } from "../drillingPlane.js"; // TASKS.csv #3782

export const PLANE_MIN_COMPOSITES = 30, PLANE_MIN_HOLES = 4, PLANE_MAX_RATIO = 6, REACH_SHARE = 0.3;
const r1 = (v) => Math.round(v * 10) / 10;

// atPts: the cluster's composites at or above the cut-off ({ x, y, z, hole_id }); radiusM: the pane's search (a sphere's radius)
// -> null (keep the sphere) or { trend: { name, dip, dipAzimuth, pitch, ratios }, basis, scales, majorM, axesM: [a, b, c], reachM: [a, b, c], n, holes }
// TASKS.csv #3782 — allPts (the area's composites, grade ignored): the plane is tested against the drilling first (lib/drillingPlane.js); the shape
// of the drilling -> { trend: null, drilling, rejected: { dip, dipAzimuth }, n, holes } (keep the sphere, and say why). Every return carries `drilling`.
export function shellPlaneSearch(atPts, radiusM, { minComposites = PLANE_MIN_COMPOSITES, minHoles = PLANE_MIN_HOLES, maxRatio = PLANE_MAX_RATIO, reachShare = REACH_SHARE, allPts = null } = {}) {
  const pts = (atPts || []).filter((p) => [p?.x, p?.y, p?.z].every(Number.isFinite));
  const holes = new Set(pts.map((p) => p.hole_id)).size;
  if (!(radiusM > 0) || pts.length < minComposites || holes < minHoles) return null;
  const fit = samplesTrendByArea(pts.map((p) => ({ x: p.x, y: p.y, z: p.z })));
  const t0 = fit.trend;
  if (!t0) return null;
  const drilling = allPts ? planeVsDrilling(t0, allPts, fit.used || pts.length, { usedPts: pts }) : null;
  if (drilling?.drilling) return { trend: null, drilling, rejected: { dip: t0.dip, dipAzimuth: t0.dipAzimuth }, n: pts.length, holes, leftOut: fit.leftOut || 0 };
  // a very elongated fit (a few composites in one hole's line) would leave a needle: the ratios are capped, the intermediate kept in proportion
  const max = Math.min(maxRatio, t0.ratios.max), int = Math.max(1, Math.min(max, t0.ratios.int * (max / t0.ratios.max)));
  const trend = { name: "the plane of the composites at the cut-off", dip: t0.dip, dipAzimuth: t0.dipAzimuth, pitch: t0.pitch, ratios: { max: r1(max), int: r1(int), min: 1 } };
  const majorM = radiusM * Math.cbrt((trend.ratios.max * trend.ratios.max) / trend.ratios.int); // a * b * c = R³ with a : b : c = max : int : 1
  const axesM = [majorM, (majorM * trend.ratios.int) / trend.ratios.max, majorM / trend.ratios.max].map(r1);
  return { trend, basis: trendBasis(trend), scales: trendSearchScales(trend), majorM: r1(majorM), axesM, reachM: axesM.map((a) => r1(a * reachShare)), reachShare, n: pts.length, holes, leftOut: fit.leftOut || 0, drilling };
}

// The reach cut: every node at or above `iso` farther than reach.limM (in the search frame: along the major axis in metres, the others scaled
// by `scales`) from every point of reach.points has its value lowered to iso + s * (limM - d), so the iso-surface closes at that reach (as
// groundCap.js closes a shell at the ground). Nodes below the cut-off are left as they are. Points are looked up in buckets of limM (the reach's
// largest real extent, along the major axis). -> { values (a copy when anything changed), cut }
export function reachCutField(values, grid, iso, reach) {
  const { nx, ny, nz, origin, cellSize } = grid, dx = cellSize.dx, dy = cellSize.dy, dz = cellSize.dz;
  const lim = reach?.limM, P = reach?.points || [];
  if (!(lim > 0) || !P.length) return { values, cut: 0 };
  const { major: A, semiMajor: Bv, minor: C } = reach.basis, sB = reach.scales.semiMajor, sC = reach.scales.minor;
  const key = (i, j, k) => `${i},${j},${k}`, buckets = new Map();
  for (const p of P) { const k = key(Math.floor(p.x / lim), Math.floor(p.y / lim), Math.floor(p.z / lim)); (buckets.get(k) || buckets.set(k, []).get(k)).push(p); }
  let vmax = -Infinity;
  for (let i = 0; i < values.length; i++) if (values[i] > vmax) vmax = values[i];
  const cellMax = Math.max(dx, dy, dz), s = Math.max(vmax - iso, Math.abs(iso) * 0.01, 1e-9) / cellMax;
  let out = null, cut = 0;
  for (let k = 0; k < nz; k++) {
    const z = origin.z + k * dz, bz = Math.floor(z / lim);
    for (let j = 0; j < ny; j++) {
      const y = origin.y + j * dy, by = Math.floor(y / lim);
      for (let i = 0; i < nx; i++) {
        const at = i + nx * (j + ny * k), v = values[at];
        if (!(v >= iso)) continue;
        const x = origin.x + i * dx, bx = Math.floor(x / lim);
        let d = Infinity;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
          const l = buckets.get(key(bx + a, by + b, bz + c));
          if (!l) continue;
          for (const p of l) {
            const ex = x - p.x, ey = y - p.y, ez = z - p.z;
            const u = ex * A.x + ey * A.y + ez * A.z, w = (ex * Bv.x + ey * Bv.y + ez * Bv.z) * sB, q = (ex * C.x + ey * C.y + ez * C.z) * sC;
            const dd = u * u + w * w + q * q;
            if (dd < d) d = dd;
          }
        }
        d = Number.isFinite(d) ? Math.sqrt(d) : lim + cellMax;
        if (d <= lim) continue;
        const cap = iso + s * (lim - Math.min(d, lim + cellMax));
        if (!out) out = Float64Array.from(values);
        out[at] = cap; cut++;
      }
    }
  }
  return { values: out || values, cut };
}
