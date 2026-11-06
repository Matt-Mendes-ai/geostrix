// TASKS.csv #1405 (review #1352, Silvertip) — the 3D grid's walls were a fixed 1,000 m while Silvertip's fans reach ~1.3 km down. How far
// the drilling goes below the scene origin (y 0 = the mean collar elevation, see the viewer's origin) from the collars alone: each hole's
// end at its length along its collar dip (no deviation - a reference box, not a desurvey). 0 without collars or lengths.
export function drillDepthBelowOrigin(collars) {
  const cs = (collars || []).filter((c) => Number.isFinite(Number(c.z)));
  if (!cs.length) return 0;
  const meanZ = cs.reduce((s, c) => s + Number(c.z), 0) / cs.length;
  let deepest = 0;
  for (const c of cs) {
    const len = Number(c.length), dip = Number(c.dip);
    if (!(len > 0)) continue;
    const down = len * Math.sin((Number.isFinite(dip) ? Math.abs(dip) : 90) * Math.PI / 180);
    deepest = Math.max(deepest, meanZ - (Number(c.z) - down));
  }
  return deepest;
}

// The wall height: the grid size, or the drilled depth rounded up to whole grid cells when that is deeper
export function gridWallHeight(size, divisions, depth) {
  const cell = size / Math.max(1, divisions);
  return depth > size ? Math.ceil(depth / cell) * cell : size;
}
