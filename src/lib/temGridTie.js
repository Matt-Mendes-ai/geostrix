// TASKS.csv #4058 — a ground TEM file on a LOCAL grid (eastings 50,000 to 52,600 and northings 2,000 to 8,000, the way a survey contractor's
// own grid is written) is placed on the map by two or more control points ('grid east, grid north, map east, map north' of the same place):
// the same least-squares similarity as a local-grid collar file (localGrid.js, #412). Moves d.x / d.y in place (the grid's own values are kept in
// d.localXY, so a second set of points replaces the first). Throws the fit's message when it cannot be fitted.
import { fitSimilarity, parseControlPoints, applySimilarity } from "./localGrid.js";

export function tieTemToMap(d, text) {
  const fit = fitSimilarity(parseControlPoints(text));
  if (!d.localXY) d.localXY = { x: Float64Array.from(d.x), y: Float64Array.from(d.y) };
  for (let i = 0; i < d.n; i++) {
    const p = applySimilarity(fit, d.localXY.x[i], d.localXY.y[i]);
    d.x[i] = Number.isFinite(d.localXY.x[i]) ? p.x : NaN; d.y[i] = Number.isFinite(d.localXY.y[i]) ? p.y : NaN;
  }
  d.placed = "tie";
  d.tie = { n: fit.residuals.length, scale: fit.scale, rotationDeg: fit.rotationDeg, rmsM: fit.rmsM };
  return d.tie;
}
