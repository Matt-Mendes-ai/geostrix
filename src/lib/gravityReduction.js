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
// TASKS.csv #2841 (GSC review B8, Blake River) — the reductions ran on a survey labelled 'Gravity (Bouguer)' with the proposed 'a free-air
// anomaly' and 'Bouguer plate' and took the plate off a second time (station 20713: -65.53 -> -100.84 mGal), without a word. True when the
// survey's method says the readings are already a Bouguer anomaly and their values are not absolute gravity (an observed-gravity column
// mislabelled 'Bouguer' is still reduced).
export const alreadyBouguer = (method, median) => method === "grav" && !looksAbsoluteGravity(median);

// TASKS.csv #2867 (GSC review B19, Matagami) — free-air anomalies from observed gravity sat 0.77 mGal below the Geological Survey of Canada's own
// FREEAIR column on every station (sd 0.003). The tool takes WGS84 normal gravity in closed form at each station's height (Boule); the
// Canadian gravity database uses GRS67 normal gravity at the ellipsoid and the free-air gradient 0.3086 mGal/m: with that convention the
// 2,165 Matagami stations come back within 0.004 mGal of the file (sd 0.003). An atmospheric correction alone would leave 0.035.
export function grs67Normal(latDeg) {
  const s = Math.sin((latDeg * Math.PI) / 180) ** 2;
  return 978031.846 * (1 + 0.005278895 * s + 0.000023462 * s * s);
}
export const grs67FreeAir = (g, latDeg, h) => g - grs67Normal(latDeg) + 0.3086 * h;
