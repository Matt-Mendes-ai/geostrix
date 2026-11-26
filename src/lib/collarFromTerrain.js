// TASKS.csv #3955 (Matt, 2026-11-21: "I worked in projects where they wouldn't have a z for drill holes. We should give the user the option to calculate the z
// from DEM.") — collar elevations taken from the terrain, on request. #2169 already places a collar with no elevation on a terrain that is LOADED at import; the
// usual order is collars first and the terrain fetched after, which left them at the median or 0 m. Pure, so Node can check it:
//   planCollarsFromTerrain(collars, terrain, { which })  -> the preview: what would change, and the holes the terrain does not cover
//   applyCollarsFromTerrain(collars, plan, terrain)     -> the collars with the new elevations (the file's own kept in z_before_snap, the source in z_source)
//   assumedForTerrain(collars)                          -> the collars the one-click offer is about
// which: "assumed" (default) = the collars with no elevation in their file (zAssumed: median or 0 m, #2169); "all" = every collar, a file's own elevation
// included (the user's explicit choice: nothing else overwrites one).
import { terrainGroundAt } from "./viewer/geomath.js";

const num = Number.isFinite;
// a collar whose elevation is a guess made at import (the median or 0 m): the ones that wait for a terrain
export const needsTerrainZ = (c) => !!c && (c.zAssumed === "median" || c.zAssumed === "zero" || c.zAssumed === "fixed" /* #4085 */ || !num(c.z));
export const assumedForTerrain = (collars) => (collars || []).filter((c) => c && c.hole_id != null && num(c.x) && num(c.y) && needsTerrainZ(c));
export const terrainSourceWords = (terrain) => `terrain: ${terrain?.name || "DEM"}`; // English: it travels in the project file and the exports

// -> { which, items: [{ hole_id, before, after, dz }], off: [hole_id], count, maxChange: { hole_id, dz } | null, medianChange }
export function planCollarsFromTerrain(collars, terrain, { which = "assumed", groundAt = null } = {}) {
  const ground = groundAt || ((x, y) => terrainGroundAt(terrain, x, y));
  const inBox = (c) => !terrain?.bbox || (c.x >= terrain.bbox[0] && c.x <= terrain.bbox[2] && c.y >= terrain.bbox[1] && c.y <= terrain.bbox[3]);
  const items = [], off = [];
  for (const c of collars || []) {
    if (!c || c.hole_id == null || !num(c.x) || !num(c.y)) continue;
    if (which !== "all" && !needsTerrainZ(c)) continue;
    const g = inBox(c) ? ground(c.x, c.y) : NaN;
    if (!num(g)) { off.push(c.hole_id); continue; }
    const after = Math.round(g * 100) / 100;
    items.push({ hole_id: c.hole_id, before: num(c.z) ? c.z : null, after, dz: num(c.z) ? after - c.z : null });
  }
  const withDz = items.filter((i) => i.dz != null);
  const dzs = withDz.map((i) => Math.abs(i.dz)).sort((a, b) => a - b);
  const maxItem = withDz.reduce((m, i) => (!m || Math.abs(i.dz) > Math.abs(m.dz) ? i : m), null);
  const medianChange = dzs.length ? (dzs.length % 2 ? dzs[dzs.length >> 1] : (dzs[dzs.length / 2 - 1] + dzs[dzs.length / 2]) / 2) : null;
  return { which, items, off, count: items.length, maxChange: maxItem ? { hole_id: maxItem.hole_id, dz: maxItem.dz } : null, medianChange };
}

// the file's own elevation is kept once, in z_before_snap (the Data QC snap's field); zAssumed "terrain" says the elevation is a ground height, not a
// surveyed RL (collarGround.js treats it as usable), z_source says which terrain
export function applyCollarsFromTerrain(collars, plan, terrain) {
  const by = new Map(plan.items.map((i) => [i.hole_id, i]));
  return (collars || []).map((c) => {
    const i = by.get(c?.hole_id);
    if (!i) return c;
    return { ...c, ...(c.z_before_snap === undefined && num(c.z) ? { z_before_snap: c.z } : {}), z: i.after, zAssumed: "terrain", z_source: terrainSourceWords(terrain) };
  });
}

// the figures of a plan for a notice: counts, and the largest / median change in metres to one decimal
export const planBrief = (plan) => ({ n: plan.count, off: plan.off.length, max: plan.maxChange ? Math.round(Math.abs(plan.maxChange.dz) * 10) / 10 : null, median: plan.medianChange != null ? Math.round(plan.medianChange * 10) / 10 : null });
