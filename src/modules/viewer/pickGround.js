// TASKS.csv #2574 (review #2486, WA lithium) — Pick on view with no terrain: a click on bare ground was read on the flat fallback plane (the data's
// origin, RL 249 there) in a perspective view, and only the Elev was then put on the collar surface. On a hilltop at RL 330 the collar landed
// 39-45 m from the click. Here the click ray is followed to the collar surface itself (the same surface the Elev comes from): marched from
// the camera to the first place it goes under that surface, then bisected there. A fixed-point walk would bounce on a step in the surface.
import { collarGround } from "../../lib/pitShell.js";
import { hitLabel } from "../../lib/viewer/hitLabel.js"; // #2447

const cache = new WeakMap();
const groundOf = (collars) => { if (!cache.has(collars)) cache.set(collars, collarGround(collars)); return cache.get(collars); };

// ray: a THREE.Ray in scene coordinates (scene y = elevation - origin.z, scene z = -(northing - origin.y)); world: a picked point in project
// coordinates ({ x, y, z, on }); collars: the project's (null = a terrain is loaded); origin: the scene origin -> the point on the collar surface
export function pickOnCollarSurface(ray, world, collars, origin) {
  if (!world || world.on != null || !collars?.length || !ray) return world; // a real object was hit, or there is terrain: as it is
  const g = groundOf(collars);
  if (!g) return world;
  const at = (t) => ({ x: ray.origin.x + ray.direction.x * t + origin.x, y: -(ray.origin.z + ray.direction.z * t) + origin.y, h: ray.origin.y + ray.direction.y * t + origin.z });
  const above = (t) => { const q = at(t), z = g(q.x, q.y); return Number.isFinite(z) ? q.h - z : NaN; };
  // as far as the flat plane hit, and as far again (the surface may lie under the plane)
  const tPlane = Math.hypot(world.x - origin.x - ray.origin.x, world.z - origin.z - ray.origin.y, -(world.y - origin.y) - ray.origin.z);
  const tMax = Math.max(1, tPlane * 2), N = 400;
  let t0 = 0, f0 = above(0);
  for (let i = 1; i <= N; i++) {
    const t1 = (tMax * i) / N, f1 = above(t1);
    if (Number.isFinite(f0) && Number.isFinite(f1) && f0 > 0 && f1 <= 0) {
      let a = t0, b = t1;
      for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (above(m) > 0) a = m; else b = m; }
      const q = at(b);
      return { x: q.x, y: q.y, z: g(q.x, q.y), on: null, onCollarSurface: true };
    }
    t0 = t1; f0 = f1;
  }
  return world; // the ray never meets it (looking up, or off the collars' reach): as it was
}

// TASKS.csv #2447 / #2576 (reviews #2325 / #2486) — Pick on view over a raster: the E / N of the cell under the pointer. A score map was
// skipped (#1453: its sheet's elevation is not the ground) and the ray went on to the ground, 60-122 m from the hot cell clicked. Now a drawn
// raster hit nearer than any other drawn object gives the E / N; the Elev comes from the collar surface (no terrain) as before.
// hits: the ray's hits, nearest first; toWorld(hits) -> ViewerModule's worldPointFromHits (the nearest drawn hit, else the flat plane)
const drawn = (h) => {
  const m = h.object.material;
  if (m && (m.visible === false || (m.opacity < 0.02 && (m.transparent || m.blending === 5)))) return false; // 5: CustomBlending (#2447 collar drapes)
  for (let n = h.object; n; n = n.parent) if (n.visible === false) return false;
  return true;
};
export function pickOnView(ray, hits, toWorld, collars, origin) {
  const isRaster = (h) => !!h.object.userData.flatRaster;
  const solid = hits.filter((h) => !isRaster(h));
  const r = hits.find((h) => isRaster(h) && drawn(h)), s = solid.find(drawn);
  if (r && (!s || r.distance <= s.distance)) {
    const x = r.point.x + origin.x, y = -r.point.z + origin.y;
    const g = collars?.length ? groundOf(collars) : null, gz = g ? g(x, y) : NaN;
    return Number.isFinite(gz) ? { x, y, z: gz, on: null, onRaster: true, onCollarSurface: true } : { x, y, z: r.point.y + origin.z, on: hitLabel(r.object) || "a raster", onRaster: true };
  }
  return pickOnCollarSurface(ray, toWorld(solid), collars, origin);
}
