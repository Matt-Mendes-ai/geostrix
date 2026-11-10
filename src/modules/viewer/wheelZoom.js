// TASKS.csv #2368 (review #2325, WA uranium) — wheel zoom toward the cursor. onWheel changed the orbit radius only, so the view closed in on
// its centre: the collar under the pointer slid 115 px away in three notches, and reaching one drill line from Fit on a 10 km block took
// about ten notches with a pan between each few. Now the whole orbit (camera and target) is scaled about the point under the cursor, so
// that point keeps its place on screen: the first object hit, else the horizontal plane through the orbit target; with neither, the
// centre as before. Pure geometry plus one raycast; no React.

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

// e: the wheel event; el: the canvas; raycaster: a THREE.Raycaster; cs: { radius, target }; hitPoint(raycaster) -> a point or null
export function wheelZoom(e, el, camera, raycaster, cs, hitPoint, { min = 0.05, max = 4000000, rate = 0.0012 } = {}) {
  const r0 = cs.radius, r1 = Math.max(min, Math.min(max, r0 * (1 + e.deltaY * rate)));
  cs.radius = r1;
  if (r1 === r0 || !el || !camera || !raycaster) return;
  const rect = el.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return;
  raycaster.setFromCamera({ x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1 }, camera);
  let p = null;
  try { p = hitPoint ? hitPoint(raycaster) : null; } catch { p = null; }
  scaleTargetAbout(cs.target, p || rayPlaneY(raycaster.ray, cs.target.y), r0, r1);
}
