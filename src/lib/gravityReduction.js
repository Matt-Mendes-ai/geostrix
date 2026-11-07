// TASKS.csv #1985 — the app's side of the gravity reductions (the maths is python-sidecar/app/geophys/pfields.py "gravred")
import { f32ToB64 } from "./inversion.js";
import { terrainNodeIsFill } from "./viewer/geomath.js";

// absolute gravity is ~978,000-983,000 mGal; an anomaly is tens to hundreds
export const looksAbsoluteGravity = (median) => Number.isFinite(median) && median > 900000;

// the terrain as the engine's grid: nodes at the bbox (row 0 north), as terrain grids are kept; no-data fill nodes are NaN (sea level
// in the engine, as a node with no height)
export function terrainGrid(t) {
  const [x0, y0, x1, y1] = t.bbox;
  return { nx: t.gridW, ny: t.gridH, dx: (x1 - x0) / Math.max(1, t.gridW - 1), dy: (y1 - y0) / Math.max(1, t.gridH - 1), x0, yTop: y1, values: f32ToB64(Float32Array.from(t.elevations, (v, i) => (Number.isFinite(v) && !terrainNodeIsFill(t, i) ? v : NaN))) };
}
