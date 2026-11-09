// TASKS.csv #2288 (review #2174, WA gold; Matt's decision 2026-11-09) — a local-grid project (#2180) may be TIED to a real CRS (MGA, UTM…):
// a 2D similarity (scale, rotation, two shifts) from local grid metres to that CRS, fitted from 2-3 control points (lib/localGrid.js
// fitSimilarity) or typed as an origin, a rotation and a scale. Files that carry their own CRS (the WA project's MGA94_51 holes, a .prj)
// are brought INTO the local grid through it. Pure: no UI.
//   world = [a -b; b a] * local + [tx, ty]   (a = s cos t, b = s sin t, t counter-clockwise from local x to world x)
import { fitSimilarity, parseControlPoints, applySimilarity } from "./localGrid.js";
import { reprojectXY } from "./reproject.js";

const r6 = (v) => Math.round(v * 1e6) / 1e6;
// -> a tie { epsg, mode: "points", controlText, a, b, tx, ty, scale, rotationDeg, rmsM, n, residuals } (throws as fitSimilarity does)
export function tieFromControlPoints(text, epsg) {
  const f = fitSimilarity(parseControlPoints(text));
  return { epsg: Number(epsg), mode: "points", controlText: String(text || ""), a: f.a, b: f.b, tx: f.tx, ty: f.ty, scale: f.scale, rotationDeg: f.rotationDeg, rmsM: f.rmsM, n: f.n, residuals: f.residuals.map(r6) };
}
// origin: the same point on both grids (lx, ly local; wx, wy in the CRS); rotationDeg counter-clockwise from local x to world x; scale (1 = metres)
export function tieFromOrigin({ lx, ly, wx, wy, rotationDeg = 0, scale = 1, epsg }) {
  if (![lx, ly, wx, wy, rotationDeg, scale].every(Number.isFinite) || !(scale > 0)) throw new Error("origin, rotation and scale must be numbers (scale above 0)");
  const t = (rotationDeg * Math.PI) / 180, a = scale * Math.cos(t), b = scale * Math.sin(t);
  return { epsg: Number(epsg), mode: "origin", origin: { lx, ly, wx, wy }, a, b, tx: wx - (a * lx - b * ly), ty: wy - (b * lx + a * ly), scale, rotationDeg, rmsM: null, n: 1, residuals: [] };
}
export const localToWorld = (tie, x, y) => applySimilarity(tie, x, y);
export function worldToLocal(tie, X, Y) {
  const dx = X - tie.tx, dy = Y - tie.ty, d = tie.a * tie.a + tie.b * tie.b;
  return { x: (tie.a * dx + tie.b * dy) / d, y: (-tie.b * dx + tie.a * dy) / d };
}
// the project's tie, when it is a local-grid project with one
export function tieOf(project) {
  const t = project?.crsSet === false ? project?.localGrid?.tie : null;
  return t && Number(t.epsg) > 0 && [t.a, t.b, t.tx, t.ty].every(Number.isFinite) ? t : null;
}
// a point in srcEpsg -> the local grid through the tie (reprojected to the tie's CRS first). null when it cannot be placed.
export function fileToLocal(tie, x, y, srcEpsg) {
  const w = Number(srcEpsg) && Number(srcEpsg) !== Number(tie.epsg) ? reprojectXY(x, y, Number(srcEpsg), Number(tie.epsg)) : { x, y };
  return w && Number.isFinite(w.x) && Number.isFinite(w.y) ? worldToLocal(tie, w.x, w.y) : null;
}
// a bearing measured from the tie CRS's grid north -> from the local grid's north (#490: local -> world lowers it by the rotation)
export const bearingToLocal = (tie, deg) => (((deg + tie.rotationDeg) % 360) + 360) % 360;
