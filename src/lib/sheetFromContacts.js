// TASKS.csv #2642 — the dip and dip direction OFFERED for an intrusion built as a sheet: the mean of the outcrop contact readings on or
// near the unit's mapped polygons (the review: 13 contact readings said 39 toward 256). An offer the user clicks, never a default.
import { meanPole } from "./sectionStructures.js";
import { dipDDFromPole } from "./coreOrientation.js";
import { featureCategoryValue, pointInRings } from "./mapLayers.js";

const segDist = (x, y, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)) : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
};
// the distance from (x, y) to a polygon's rings (0 inside)
export function distToRings(x, y, rings) {
  if (pointInRings([x, y], rings)) return 0;
  let d = Infinity;
  for (const r of rings || []) for (let i = 1; i < r.length; i++) d = Math.min(d, segDist(x, y, r[i - 1], r[i]));
  return d;
}

// rows: outcrop measurements { x, y, dip, dipDir, cls }; layer / field / units: the map polygons of the chosen units.
// -> { dip, dipDir, n, maxM } (rounded to the degree) or null when fewer than `minN` readings, or no common orientation
export function contactOrientationNear(rows, layer, field, units, { maxM = 250, minN = 3 } = {}) {
  const want = new Set((units || []).map(String));
  const polys = (layer?.features || []).filter((f) => want.has(String(featureCategoryValue(f, field)))).map((f) => f.parts || []);
  if (!polys.length) return null;
  const near = (rows || []).filter((r) => r.cls === "contact" && [r.x, r.y, r.dip, r.dipDir].every(Number.isFinite) && polys.some((rings) => distToRings(r.x, r.y, rings) <= maxM));
  if (near.length < minN) return null;
  const pole = meanPole(near.map((r) => ({ dip: r.dip, azimuth: r.dipDir })));
  if (!pole) return null;
  const { dipDeg, dipDirDeg } = dipDDFromPole(pole);
  return { dip: Math.round(dipDeg), dipDir: Math.round(((dipDirDeg % 360) + 360) % 360), n: near.length, maxM };
}
