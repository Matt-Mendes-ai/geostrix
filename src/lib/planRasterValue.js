// TASKS.csv #2853 (review GSC geophysics) — the Maps plan's cursor chip read 'E 712,690 N 5,215,782' and nothing more: comparing conductance,
// tau and magnetics meant hiding layers or going to the 3D View's Identify. The value (and unit) of the top visible grid under the cursor,
// the one drawn last. Grids are decoded once per raster. Pure apart from the decode cache.
import { b64ToF32 } from "./inversion.js";
import { rasterUnitOf } from "./rasterMethod.js";

const decoded = new Map(); // raster id -> { key, values }
function valuesOf(r) {
  const key = r.grid?.values;
  if (!key) return null;
  const hit = decoded.get(r.id);
  if (hit && hit.key === key) return hit.values;
  const values = b64ToF32(key);
  decoded.set(r.id, { key, values });
  if (decoded.size > 40) decoded.delete(decoded.keys().next().value);
  return values;
}

// the value of grid g at (x, y): the node whose cell holds the point, or null outside / no data
export function gridValueAt(g, values, x, y) {
  if (!g || !values) return null;
  const i = Math.round((x - g.x0) / g.dx), j = Math.round((g.yTop - y) / g.dy);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return null;
  const v = values[j * g.nx + i];
  return Number.isFinite(v) ? v : null;
}

// rasters in draw order (the last on top) -> { name, value, unit } of the top visible grid with a value at (x, y), or null
export function topRasterValueAt(rasters, x, y) {
  for (let k = (rasters || []).length - 1; k >= 0; k--) {
    const r = rasters[k];
    if (r.visible === false || !r.grid || !Array.isArray(r.bbox)) continue;
    if (x < r.bbox[0] || x > r.bbox[2] || y < r.bbox[1] || y > r.bbox[3]) continue;
    const v = gridValueAt(r.grid, valuesOf(r), x, y);
    if (v != null) return { name: r.name, value: v, unit: rasterUnitOf(r) };
  }
  return null;
}
