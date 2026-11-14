// TASKS.csv #2997 / #3468 (WA iron review) — a tenement of 12 x 10 km at a zone edge read 'Area 12,000 ha' where the ground area is 11,982 ha: the
// area of a polygon in a projected CRS is a GRID area, off by the square of the point scale factor (1.0008 at 306 km from a UTM central
// meridian: 0.16 % in area). The point scale factor at a place, numerically: a 1 km step along its parallel, on the grid over on the ellipsoid
// (the arc of the parallel, N cos(phi) d(lambda), exact to far better than the effect measured). Pure.
import { reprojectXY } from "./reproject.js";

const A = 6378137, E2 = 0.00669437999014; // GRS80 / WGS 84 (the two differ by less than a nanometre per metre here)
// -> k (grid distance / ground distance) at grid point (x, y) of a projected epsg, or null when it cannot be worked out
export function pointScaleFactor(x, y, epsg) {
  const ll = reprojectXY(x, y, epsg, 4326);
  if (!ll || !Number.isFinite(ll.x) || !Number.isFinite(ll.y) || Math.abs(ll.y) > 85) return null;
  const phi = (ll.y * Math.PI) / 180, N = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
  const dLon = 500 / (N * Math.cos(phi)) * (180 / Math.PI); // 500 m of ground each side
  const a = reprojectXY(ll.x - dLon, ll.y, 4326, epsg), b = reprojectXY(ll.x + dLon, ll.y, 4326, epsg);
  if (!a || !b) return null;
  return Math.hypot(b.x - a.x, b.y - a.y) / 1000;
}
// the area of a boundary's parts on the grid (ha) -> { gridHa, groundHa, k } with the scale factor at the boundary's centre; groundHa null when the
// CRS has none to work out (a local grid) or the correction is under 0.02 % (not worth a second figure)
export function groundArea(gridHa, polylines, epsg) {
  let sx = 0, sy = 0, n = 0;
  for (const pl of polylines || []) for (const p of pl || []) if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) { sx += p.x; sy += p.y; n++; }
  const k = n && epsg ? pointScaleFactor(sx / n, sy / n, epsg) : null;
  if (!k || Math.abs(k - 1) < 1e-4) return { gridHa, groundHa: null, k };
  return { gridHa, groundHa: gridHa / (k * k), k };
}
