// TASKS.csv #2553 (review #2486, WA lithium) — where an Euler solution sits in 3D. Euler's depth is below the grid's observation level. A grid
// computed at a stated level (equivalent sources at the survey's height, #2392; upward continued from it) hangs its solutions from THAT
// level; only a grid that follows the ground (an IDW grid of a ground survey) hangs them under the terrain. Before, every solution was put at
// terrain - depth, or got no elevation where the terrain had none: on a grid at 332 m over ground at 160-330 m they plotted up to 129 m too
// deep (median 49 m), and 222 of 265 had no elevation while the notice said "placed under the terrain".

// the level (m) a raster's values were computed at, or null when the grid follows the ground
export function rasterLevelM(r) {
  const v = Number(r?.levelM ?? r?.provenance?.elevationM ?? r?.filter?.params?.elevationM);
  return Number.isFinite(v) && (r?.levelM != null || r?.provenance?.elevationM != null || r?.filter?.params?.elevationM != null) ? v : null;
}
// the level a filtered raster keeps: its source's, raised by an upward continuation
export function filteredLevelM(src, kind, params = {}) {
  const lv = rasterLevelM(src);
  if (lv == null) return null;
  return kind === "upward" && Number(params.height) > 0 ? lv + Number(params.height) : lv;
}

// TASKS.csv #2560 (review #2486) — how a filter's product is drawn: as its parent is (RTP, 1VD, tilt ... of a grid drawn flat at its 332 m level
// were draped on the terrain, the store's default once a terrain exists), and an upward continuation by h is drawn h higher (it kept 332).
// -> { drapeMode, elevation, raisedM }
export function filteredPlacement(src, kind, params = {}) {
  const mode = src?.drapeMode === "terrain" || src?.drapeMode === "collars" ? src.drapeMode : "flat";
  const h = kind === "upward" && mode === "flat" && Number(params.height) > 0 ? Number(params.height) : 0;
  return { drapeMode: mode, elevation: (Number(src?.elevation) || 0) + h, raisedM: h };
}

// solutions { x[], y[], depth[] } -> { z[] (null where none), placed, byLevel, byTerrain, missing }
export function placeEulerSolutions(d, { levelM = null, groundAt = null } = {}) {
  const z = [];
  let byLevel = 0, byTerrain = 0, missing = 0;
  for (let i = 0; i < (d.x || []).length; i++) {
    if (levelM != null) { z.push(+(levelM - d.depth[i]).toFixed(1)); byLevel++; continue; }
    const g = groundAt ? groundAt(d.x[i], d.y[i]) : NaN;
    if (Number.isFinite(g)) { z.push(+(g - d.depth[i]).toFixed(1)); byTerrain++; } else { z.push(null); missing++; }
  }
  return { z, placed: byLevel + byTerrain, byLevel, byTerrain, missing };
}
