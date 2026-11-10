// TASKS.csv #2574 (review #2486, WA lithium) — Pick on view with no terrain: a click on bare ground was read on the flat fallback plane (the data's
// origin, RL 249 there) in a perspective view, and only the Elev was then put on the collar surface. On a hilltop at RL 330 the collar landed
// 39-45 m from the click. Here the click ray is followed to the collar surface itself (the same surface the Elev comes from): marched from
// the camera to the first place it goes under that surface, then bisected there. A fixed-point walk would bounce on a step in the surface.
import { collarGround } from "../../lib/pitShell.js";

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
