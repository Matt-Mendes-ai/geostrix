// TASKS.csv #3159 — grid convergence, moved verbatim out of inversion.js (which re-exports it): the azimuth reference and the
// map layers need it at startup, and importing it from inversion.js put the inversion helpers in the startup bundle.
import { reprojectXY } from "./reproject.js";

// ---------- grid convergence ----------
// SimPEG's x/y axes are the project grid's easting/northing, so the inducing field's declination has to
// be measured from GRID north, not true north (GIS review, #321). In UTM the two differ by the grid
// convergence — about 1-2.5 degrees across BC's zone 9. Computed numerically from the project's own
// projection: step 1 km due true-north from the survey centre and measure the bearing of that step in grid
// coordinates. That bearing is where true north points, clockwise from grid north; a declination (clockwise
// from true north) is therefore that much larger measured from grid north.
export function trueNorthBearingInGridDeg(x, y, epsg) {
  const ll = reprojectXY(x, y, epsg, 4326);
  if (!ll) return null;
  const n = reprojectXY(ll.x, ll.y + 0.009, 4326, epsg); // ~1 km north
  if (!n) return null;
  return (Math.atan2(n.x - x, n.y - y) * 180) / Math.PI;
}
export function gridDeclination(trueDeclinationDeg, x, y, epsg) {
  const b = trueNorthBearingInGridDeg(x, y, epsg);
  return b == null ? null : { grid: trueDeclinationDeg + b, convergence: b };
}
