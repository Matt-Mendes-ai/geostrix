// TASKS.csv #2590 / #2125 (reviews #2486 WA lithium, #2013 Woodjam) — where an imported raster or a georeferenced picture landed, against
// the drilling. A picture georeferenced with mine-grid control points went in 6,240 km from the collars, and a wrong-zone GeoTIFF 409 km
// west of them, both 'placed 5 m above the highest collar under it' with no collar under them; the fetch-area lists then offered the stray
// layer as an area. One check for all of them: a footprint that does not reach the collars' extent, and lies farther from it than the
// extent is wide (5 km at least), is far: its distance and direction from the drilling. Pure.
import { t as tr } from "./i18n.js";

const finite = (c) => Number.isFinite(c?.x) && Number.isFinite(c?.y);
export function collarsBox(collars) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of collars || []) { if (!finite(c)) continue; if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y; }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}
export const boxesOverlap = (a, b) => !!a && !!b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export const FAR_MIN_M = 5000;

// box [xmin, ymin, xmax, ymax] in the project CRS -> null (touches or near the collars, or no collars) | { distM, dir } (dir 0 = N, 1 = NE ... 7 = NW)
export function farFromCollars(box, collars) {
  const ref = collarsBox(collars);
  if (!ref || !box || !box.every(Number.isFinite) || boxesOverlap(box, ref)) return null;
  const gx = Math.max(0, ref[0] - box[2], box[0] - ref[2]), gy = Math.max(0, ref[1] - box[3], box[1] - ref[3]);
  const distM = Math.hypot(gx, gy);
  if (distM < Math.max(FAR_MIN_M, Math.hypot(ref[2] - ref[0], ref[3] - ref[1]))) return null;
  const deg = ((Math.atan2((box[0] + box[2]) / 2 - (ref[0] + ref[2]) / 2, (box[1] + box[3]) / 2 - (ref[1] + ref[3]) / 2) * 180) / Math.PI + 360) % 360;
  return { distM, dir: Math.round(deg / 45) % 8 };
}
export const kmText = (m) => (m >= 10000 ? Math.round(m / 1000).toLocaleString() : (m / 1000).toFixed(1));

// the sentence for an import notice
export function farNote(far) {
  if (!far) return "";
  const km = kmText(far.distM);
  return [
    tr("It lies about {km} km north of the drillholes: check its CRS, or its control points if it was georeferenced (a local mine grid's numbers read as a real CRS land far away).", { km }),
    tr("It lies about {km} km north-east of the drillholes: check its CRS, or its control points if it was georeferenced (a local mine grid's numbers read as a real CRS land far away).", { km }),
    tr("It lies about {km} km east of the drillholes: check its CRS, or its control points if it was georeferenced (a local mine grid's numbers read as a real CRS land far away).", { km }),
    tr("It lies about {km} km south-east of the drillholes: check its CRS, or its control points if it was georeferenced (a local mine grid's numbers read as a real CRS land far away).", { km }),
    tr("It lies about {km} km south of the drillholes: check its CRS, or its control points if it was georeferenced (a local mine grid's numbers read as a real CRS land far away).", { km }),
    tr("It lies about {km} km south-west of the drillholes: check its CRS, or its control points if it was georeferenced (a local mine grid's numbers read as a real CRS land far away).", { km }),
    tr("It lies about {km} km west of the drillholes: check its CRS, or its control points if it was georeferenced (a local mine grid's numbers read as a real CRS land far away).", { km }),
    tr("It lies about {km} km north-west of the drillholes: check its CRS, or its control points if it was georeferenced (a local mine grid's numbers read as a real CRS land far away).", { km }),
  ][far.dir];
}
// a fetch-area list entry's label, marked when the layer lies far from the drilling
export const farLabel = (label, far) => (far ? tr("{label} (far from the drillholes: about {km} km)", { label, km: kmText(far.distM) }) : label);
