// TASKS.csv #3838 (Scottie Gold review) — with no terrain a click on bare ground (Unit polygons, Interpret, Measure, Draw section, the status bar's
// E / N) was read on a flat plane at the scene origin's elevation (RL ~860 there) while the map is drawn draped on the collar surface (808 m at the
// pads): every corner landed at 0.885 of its clicked distance from the view centre, 21 m off at 184 m. The bare-ground click now follows the ray to
// the surface the map layers are drawn on with no terrain (the collar surface, sceneBuilders mapLayerOnCollars; flat on a project drilled from
// underground), as Pick on view has since #2574. Moved out of ViewerModule (its worldPointFromHits).
// TASKS.csv #1125 — the nearest hit that is actually DRAWN. three.js raycasting ignores .visible, so a hidden voxel model, a toggled-off layer, a hidden
// hole or a filtered category was still hit: the object and every ancestor visible, and a material that is shown and not fully transparent.
import { pickOnCollarSurface } from "./pickGround.js";
import { hitLabel } from "../../lib/viewer/hitLabel.js";
import { collarsLookUnderground } from "../../lib/collarGround.js";

const drawn = (h) => {
  const m = h.object.material;
  if (m && (m.visible === false || (m.transparent && m.opacity < 0.02))) return false;
  for (let n = h.object; n; n = n.parent) if (n.visible === false) return false;
  return true;
};

const zMinOf = new WeakMap();
const lowestCollar = (collars) => {
  if (!zMinOf.has(collars)) { let z = Infinity; for (const c of collars) if (Number.isFinite(c?.z) && c.z < z) z = c.z; zMinOf.set(collars, z); }
  return zMinOf.get(collars);
};

// the collars a bare-ground click is followed to (the map layers' ground with no terrain), or null (a terrain is loaded, fewer than three collars,
// or the project is drilled from underground: its map lies flat)
export function groundCollarsFor(terrain, collars) {
  if (terrain || (collars?.length || 0) < 3) return null;
  return collarsLookUnderground(collars).underground ? null : collars;
}

// ray: a THREE.Ray in scene coordinates (x = E - ox, y = Z - oz, z = oy - N); hits: the ray's hits, nearest first; origin: the scene origin;
// groundCollars: groundCollarsFor(...). -> { x, y, z (world), on } for a drawn hit; { ..., on: null, onCollarSurface: true } on the collar surface;
// { ..., on: null, plane: true } on the reference level (#2526: not ground); or null (the ray never meets the level)
export function worldPointOnGround(ray, hits, origin, groundCollars = null) {
  const o = origin;
  const near = (hits || []).find(drawn);
  if (near) { const p = near.point; return { x: p.x + o.x, y: -p.z + o.y, z: p.y + o.z, on: hitLabel(near.object) }; } // on: #1891
  const d = ray.direction, r0 = ray.origin;
  let w = null;
  if (Math.abs(d.y) > 1e-12) { const t = -r0.y / d.y; if (t >= 0) w = { x: r0.x + d.x * t + o.x, y: -(r0.z + d.z * t) + o.y, z: o.z, on: null, plane: true }; }
  else if (Math.abs(r0.y) < 1e-9) w = { x: r0.x + o.x, y: -r0.z + o.y, z: o.z, on: null, plane: true };
  if (!groundCollars || !(d.y < 0)) return w;
  // the march (pickOnCollarSurface) runs to twice the point it is given: far enough down the ray to pass under the lowest collar
  const zLow = lowestCollar(groundCollars), tLow = Number.isFinite(zLow) ? (r0.y + o.z - zLow) / -d.y : 0;
  const tGive = Math.max(w ? Math.hypot(w.x - o.x - r0.x, -(w.y - o.y) - r0.z, w.z - o.z - r0.y) : 0, tLow * 0.55, 1);
  const w0 = { x: r0.x + d.x * tGive + o.x, y: -(r0.z + d.z * tGive) + o.y, z: r0.y + d.y * tGive + o.z, on: null };
  const g = pickOnCollarSurface(ray, w0, groundCollars, o);
  return g?.onCollarSurface ? g : w;
}
