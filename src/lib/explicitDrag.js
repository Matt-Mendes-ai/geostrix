// TASKS.csv #813 — dragging an explicit-surface pick in the 3D view (used by ExplicitSurfacePanel). Scene coordinates are
// the viewer's: x = E - origin.x, y = elevation - origin.z, z = -(N - origin.y). sc: { origin, traces } refs and litho rows.
import * as THREE from "three";
import { findOnTraceWorld } from "./viewer/modelHelpers.js";

export // TASKS.csv #813 — where a dragged pick goes for the mouse ray `ray` (scene coordinates). A pick on a hole slides along
// that hole's trace: the trace point nearest the ray, snapped to the hole's nearest logged litho boundary when snapping
// is on. Any other pick moves vertically in the plane facing the camera, or (Shift) horizontally at its own elevation.
function dragTarget(pick, ray, sc, snap, shift) {
  const o = sc.origin.current;
  const t = pick.hole_id && sc.traces.current.find((tc) => tc.hole_id === pick.hole_id);
  if (t && t.pts.length > 1) {
    let best = Infinity, md = pick.md;
    const onSeg = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < t.pts.length - 1; i++) {
      a.set(t.pts[i].x, t.pts[i].y, t.pts[i].z); b.set(t.pts[i + 1].x, t.pts[i + 1].y, t.pts[i + 1].z);
      const d = ray.distanceSqToSegment(a, b, null, onSeg);
      if (d < best) { best = d; const L = a.distanceTo(b); md = t.pts[i].md + (L > 0 ? onSeg.distanceTo(a) / L : 0) * (t.pts[i + 1].md - t.pts[i].md); }
    }
    if (snap) {
      let bm = null;
      for (const r of sc.litho || []) {
        if (r.hole_id !== pick.hole_id) continue;
        for (const v of [Number(r.from), Number(r.to)]) if (Number.isFinite(v) && (bm == null || Math.abs(v - md) < Math.abs(bm - md))) bm = v;
      }
      if (bm != null) md = bm;
    }
    const w = findOnTraceWorld(t, md);
    return w ? { ...pick, x: w[0], y: w[1], z: w[2], md, src: snap ? "boundary" : "trace" } : null;
  }
  const P = new THREE.Vector3(pick.x - o.x, pick.z - o.z, o.y - pick.y);
  let plane;
  if (shift) plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -P.y);
  else {
    const n = new THREE.Vector3(ray.direction.x, 0, ray.direction.z);
    if (n.lengthSq() < 1e-9) return null; // looking straight down: no vertical plane faces the camera
    plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n.normalize(), P);
  }
  const hit = new THREE.Vector3();
  if (!ray.intersectPlane(plane, hit)) return null;
  const q = shift ? { x: hit.x, y: P.y, z: hit.z } : { x: P.x, y: hit.y, z: P.z };
  return { ...pick, x: q.x + o.x, y: o.y - q.z, z: q.y + o.z };
}
