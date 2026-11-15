// TASKS.csv #2368 (review #2325, WA uranium) — wheel zoom toward the cursor. onWheel changed the orbit radius only, so the view closed in on
// its centre: the collar under the pointer slid 115 px away in three notches, and reaching one drill line from Fit on a 10 km block took
// about ten notches with a pan between each few. Now the whole orbit (camera and target) is scaled about the point under the cursor, so
// that point keeps its place on screen: the first object hit, else the horizontal plane through the orbit target; with neither, the
// centre as before. Pure geometry plus one raycast; no React.
// TASKS.csv #3247 (review #2325, #2941 (6); reproduced on Macpass at VE 10x, 2026-11-15) — over a dense block seen obliquely the cursor sits in the
// gaps between 1-2 px traces: the ray misses all of them (34 of 36 cursor positions over the Macpass cluster), the zoom closes on the reference
// plane through the orbit target, which lies BEHIND the block, so six notches fly the camera through the block and the 100 m view is empty. Now
// a miss tries the drawn holes' own points first: the one nearest the cursor on screen (within ANCHOR_RADIUS_PX) sets the zoom's depth — the point
// of the cursor's ray nearest to it — so the camera converges on the block, not past it; the cursor's own point stays put (the ray is the same).
import * as THREE from "three";
export const ANCHOR_RADIUS_PX = 60;

// target moved toward p as the radius goes r0 -> r1 (a homothety about p, ratio r1 / r0, applied to the target; the camera follows from
// the radius and angles). Mutates and returns target.
export function scaleTargetAbout(target, p, r0, r1) {
  if (!p || !(r0 > 0)) return target;
  const f = 1 - r1 / r0;
  target.x += (p.x - target.x) * f;
  target.y += (p.y - target.y) * f;
  target.z += (p.z - target.z) * f;
  return target;
}

// the ray's crossing of the horizontal plane y = h (scene y is elevation), in front of the camera; null when parallel or behind
export function rayPlaneY(ray, h) {
  const dy = ray.direction.y;
  if (Math.abs(dy) < 1e-9) return null;
  const t = (h - ray.origin.y) / dy;
  return t > 0 ? { x: ray.origin.x + ray.direction.x * t, y: h, z: ray.origin.z + ray.direction.z * t } : null;
}

// anchors: x, y, z, x, y, z… (scene coordinates; Float32Array or array) -> the point of the ray (true frame) nearest in depth to the anchor that is nearest the
// cursor on screen and within radiusPx, or null. One pass of projections: a few tenths of a ms for 30,000 anchors.
const _M = new THREE.Matrix4();
export function anchorOnRay(ray, camera, anchors, rect, clientX, clientY, radiusPx = ANCHOR_RADIUS_PX) {
  if (!anchors || anchors.length < 3 || !camera || !(rect.width > 0) || !(rect.height > 0)) return null;
  const m = _M.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements; // the view matrix carries the vertical exaggeration (#2623)
  const cx = ((clientX - rect.left) / rect.width) * 2 - 1, cy = -((clientY - rect.top) / rect.height) * 2 + 1, kx = rect.width / 2, ky = rect.height / 2;
  let best = -1, bd = radiusPx * radiusPx;
  for (let i = 0; i + 2 < anchors.length; i += 3) {
    const x = anchors[i], y = anchors[i + 1], z = anchors[i + 2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (!(w > 0)) continue; // behind the camera
    const dx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w - cx) * kx, dy = ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w - cy) * ky, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) return null;
  const o = ray.origin, r = ray.direction, t = (anchors[best] - o.x) * r.x + (anchors[best + 1] - o.y) * r.y + (anchors[best + 2] - o.z) * r.z;
  return t > 0 ? { x: o.x + r.x * t, y: o.y + r.y * t, z: o.z + r.z * t } : null;
}

// TASKS.csv #3669 — boxes: minx, miny, minz, maxx, maxy, maxz, … (scene coordinates: the shown block models' and OMF models' own extents) -> the point of the ray where it
// enters the nearest box it crosses ahead of the camera (from inside a box: halfway to where it leaves), or null. A cursor in a gap of a block model, with no
// hole near it, zooms on the block, not on the plane behind it.
export function boxOnRay(ray, boxes) {
  if (!boxes || boxes.length < 6) return null;
  const o = ray.origin, d = ray.direction;
  let best = Infinity;
  for (let i = 0; i + 5 < boxes.length; i += 6) {
    let t0 = 0, t1 = Infinity, ok = true;
    for (let a = 0; a < 3 && ok; a++) {
      const oa = a === 0 ? o.x : a === 1 ? o.y : o.z, da = a === 0 ? d.x : a === 1 ? d.y : d.z, lo = boxes[i + a], hi = boxes[i + 3 + a];
      if (Math.abs(da) < 1e-12) { if (oa < lo || oa > hi) ok = false; continue; }
      let s0 = (lo - oa) / da, s1 = (hi - oa) / da;
      if (s0 > s1) { const x = s0; s0 = s1; s1 = x; }
      if (s0 > t0) t0 = s0;
      if (s1 < t1) t1 = s1;
      if (t0 > t1) ok = false;
    }
    if (!ok || !(t1 > 0)) continue;
    const t = t0 > 0 ? t0 : t1 / 2; // outside: the entry; inside (t0 is 0): halfway to the exit
    if (t < best) best = t;
  }
  return best < Infinity ? { x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best } : null;
}

// e: the wheel event; el: the canvas; raycaster: a THREE.Raycaster; cs: { radius, target }; hitPoint(raycaster) -> a point or null
export function wheelZoom(e, el, camera, raycaster, cs, hitPoint, { min = 0.05, max = 4000000, rate = 0.0012, anchors = null, boxes = null } = {}) {
  const r0 = cs.radius, r1 = Math.max(min, Math.min(max, r0 * (1 + e.deltaY * rate)));
  cs.radius = r1;
  if (r1 === r0 || !el || !camera || !raycaster) return;
  const rect = el.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return;
  raycaster.setFromCamera({ x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1 }, camera);
  let p = null;
  try { p = hitPoint ? hitPoint(raycaster) : null; } catch { p = null; }
  if (!p && anchors) { try { p = anchorOnRay(raycaster.ray, camera, typeof anchors === "function" ? anchors() : anchors, rect, e.clientX, e.clientY); } catch { p = null; } } // #3247 — a miss: the holes' own depth before the plane
  if (!p && boxes) { try { p = boxOnRay(raycaster.ray, typeof boxes === "function" ? boxes() : boxes); } catch { p = null; } } // #3669 — no hole near: a block model it crosses
  scaleTargetAbout(cs.target, p || rayPlaneY(raycaster.ray, cs.target.y), r0, r1);
}
