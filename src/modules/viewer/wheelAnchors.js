// TASKS.csv #3247 — the points the wheel zoom falls back on when the cursor's ray hits nothing (wheelZoom.js anchorOnRay): the drawn holes' own
// trace points, in scene coordinates, thinned to at most `cap` so the per-notch pass stays a few tenths of a millisecond on a 20,000-hole project.
// Hidden holes (the Holes list's unchecked ones) are left out. Kept until the traces or the visibility change (same objects), so a burst of
// notches builds it once.
import * as THREE from "three";
import { ownBox } from "../../lib/viewer/fitAll.js"; // TASKS.csv #3669
import { sceneMinRadius, sceneSizeOf } from "./wheelZoom.js"; // TASKS.csv #3927
export const WHEEL_ANCHOR_CAP = 30000;
// TASKS.csv #3927 follow-up — the + / - keys' closest orbit: the wheel's own rule (wheelZoom.js sceneMinRadius over the shown holes' points and the
// shown models' boxes), so the keys cannot fold the orbit to 5 cm against the ground as the wheel once could. groups: the wheel's own groups.
export function sceneFloor(traces, visible, groups) {
  return sceneMinRadius(sceneSizeOf(wheelAnchors(traces, visible), wheelBoxes(groups)));
}
export function wheelAnchors(traces, visible, cap = WHEEL_ANCHOR_CAP) {
  const shown = (traces || []).filter((t) => t?.pts?.length && visible?.[t.hole_id] !== false);
  let total = 0;
  for (const t of shown) total += t.pts.length;
  const stride = Math.max(1, Math.ceil(total / cap)), out = new Float32Array(Math.ceil(total / stride) * 3 + 6);
  let n = 0;
  for (const t of shown) {
    const p = t.pts;
    for (let i = 0; i < p.length; i += stride) { out[n++] = p[i].x; out[n++] = p[i].y; out[n++] = p[i].z; }
    const l = p[p.length - 1]; if ((p.length - 1) % stride) { out[n++] = l.x; out[n++] = l.y; out[n++] = l.z; } // the end of the hole is kept
  }
  return out.subarray(0, n);
}
// the same, remembered while the traces array and the visibility object are the same ones
export function makeWheelAnchors() {
  let kt = null, kv = null, val = null;
  return (traces, visible) => { if (val && kt === traces && kv === visible) return val; kt = traces; kv = visible; return (val = wheelAnchors(traces, visible)); };
}

// TASKS.csv #3669 — the own extent of every SHOWN child of the given groups (the block models' and OMF models' groups), in scene coordinates, as minx, miny, minz,
// maxx, maxy, maxz per box: what a missed wheel zoom falls back on when no hole point is near the cursor (wheelZoom.js boxOnRay). A model's box is cached on its
// mesh by three (InstancedMesh.boundingBox); the groups are walked on a miss only.
const _b = new THREE.Box3();
export function wheelBoxes(groups) {
  const out = [];
  for (const g of groups || []) {
    if (!g || g.visible === false) continue;
    for (const c of g.children) {
      if (c.visible === false || !ownBox(c, _b)) continue;
      out.push(_b.min.x, _b.min.y, _b.min.z, _b.max.x, _b.max.y, _b.max.z);
    }
  }
  return Float32Array.from(out);
}
