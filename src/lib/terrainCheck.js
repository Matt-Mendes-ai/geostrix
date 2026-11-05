// TASKS.csv #1620 (review #1497, Lawyers) — a new terrain checked against the collars: a picture imported as a DEM put the ground ~1,500 m
// under 446 collars and nothing said so. The median collar elevation minus the terrain under it (collars inside the terrain only).
import { terrainGroundAt } from "./viewer/geomath.js";
import { median } from "./arrayStats.js";

// collars: [{ x, y, z }]; terrain: { bbox, gridW, gridH, elevations, noDataMask } -> { n, median } (at least 3 collars over it) | null
export function collarTerrainOffset(collars, terrain) {
  const d = [];
  for (const c of collars || []) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y) || !Number.isFinite(c?.z)) continue;
    const g = terrainGroundAt(terrain, c.x, c.y);
    if (Number.isFinite(g)) d.push(c.z - g);
  }
  return d.length >= 3 ? { n: d.length, median: median(d) } : null;
}
