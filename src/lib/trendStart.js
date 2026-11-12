// TASKS.csv #2428 (review #2325, WA palaeochannel uranium) — a new structural trend opened at dip 45° → 90°, pitch 90°, 3 : 2 : 1
// on 430 vertical holes through flat strata, a steep plane presented as a starting fact (#264: never assume a deposit type). A new
// trend now starts from the data: the best-fit plane of the tops of the unit logged in the most holes, or flat when no unit's
// tops fix a plane. Pure: the caller gives each unit's top points (east, north, up).
import { planeFromPoints } from "./trend.js";
import { fitPlane } from "./vein.js";

export const MIN_TOP_HOLES = 3;

// units: [{ code, pts: [{ x, y, z }] }] -> { dip, dipAzimuth, code, n, planarity } from the unit with the most tops whose points
// span a plane, or { dip: 0, dipAzimuth: null, code: null, n: 0 } (flat) when none does
export function startingTrendPlane(units) {
  const ranked = (units || [])
    .map((u) => ({ code: u.code, pts: (u.pts || []).filter((p) => p && [p.x, p.y, p.z].every(Number.isFinite)) }))
    .filter((u) => u.pts.length >= MIN_TOP_HOLES)
    .sort((a, b) => b.pts.length - a.pts.length || String(a.code).localeCompare(String(b.code)));
  for (const u of ranked) {
    const fit = fitPlane(u.pts);
    if (!fit || !(fit.collinearity >= 0.02)) continue; // tops along one line (holes on a single fence) fix no plane
    const plane = planeFromPoints(u.pts);
    if (!plane) continue;
    return { dip: Math.round(plane.dip * 10) / 10, dipAzimuth: Math.round(plane.dipAzimuth * 10) / 10, code: u.code, n: u.pts.length, planarity: Number.isFinite(fit.planarity) ? fit.planarity : null };
  }
  return { dip: 0, dipAzimuth: null, code: null, n: 0, planarity: null };
}
