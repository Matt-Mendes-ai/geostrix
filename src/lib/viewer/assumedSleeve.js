// TASKS.csv #3761 (Scottie Gold review: DH23-313 is a solid coloured tube to its end of hole although its survey stops at 71 m of 179 m, and the dashed
// bare trace is hidden inside the tubes every user has on) — the stretch of a hole with no survey station (lib/viewer/unsurveyedTail.js unsurveyedSpans)
// is wrapped in a pale, translucent open sleeve a little wider than the interval tubes: whatever is drawn there reads washed out, "assumed", and the
// layer colours still show through. Depth-tested (the terrain still hides what is under it), drawn after the tubes, never picked.
// pts: the span's trace points [{ x, y, z }] in order -> THREE.BufferGeometry (an open tube of `sides` sides, one ring per point), or null
import * as THREE from "three";

export const SLEEVE_RADIUS = 2.8; // metres: over the lithology tube (2.2), the veins and breccia; the fat translucent layers (alteration 3.4) show through it
export const SLEEVE_OPACITY = 0.4;
export const SLEEVE_MAX_HOLES = 300; // one mesh per hole with an unsurveyed stretch: past this the dashed trace says it alone

export function sleeveGeometry(pts, radius = SLEEVE_RADIUS, sides = 8) {
  if (!pts || pts.length < 2) return null;
  const n = pts.length, pos = new Float32Array(n * sides * 3), idx = [];
  const t = [0, 0, 0], u = [0, 0, 0], b = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
    t[0] = c.x - a.x; t[1] = c.y - a.y; t[2] = c.z - a.z;
    const tl = Math.hypot(t[0], t[1], t[2]) || 1; t[0] /= tl; t[1] /= tl; t[2] /= tl;
    // a stable perpendicular: the up axis (scene y) crossed with the tangent, the east axis when the hole is vertical
    const up = Math.abs(t[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0];
    u[0] = up[1] * t[2] - up[2] * t[1]; u[1] = up[2] * t[0] - up[0] * t[2]; u[2] = up[0] * t[1] - up[1] * t[0];
    const ul = Math.hypot(u[0], u[1], u[2]) || 1; u[0] /= ul; u[1] /= ul; u[2] /= ul;
    b[0] = t[1] * u[2] - t[2] * u[1]; b[1] = t[2] * u[0] - t[0] * u[2]; b[2] = t[0] * u[1] - t[1] * u[0];
    for (let k = 0; k < sides; k++) {
      const th = (k / sides) * Math.PI * 2, cs = Math.cos(th) * radius, sn = Math.sin(th) * radius, o = (i * sides + k) * 3;
      pos[o] = pts[i].x + cs * u[0] + sn * b[0]; pos[o + 1] = pts[i].y + cs * u[1] + sn * b[1]; pos[o + 2] = pts[i].z + cs * u[2] + sn * b[2];
    }
  }
  for (let i = 0; i + 1 < n; i++) for (let k = 0; k < sides; k++) {
    const a = i * sides + k, a2 = i * sides + ((k + 1) % sides), c = (i + 1) * sides + k, c2 = (i + 1) * sides + ((k + 1) % sides);
    idx.push(a, c, a2, a2, c, c2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

let shared = null;
// one material for every sleeve: white, translucent, depth-tested and not written, both sides (a hole seen from inside its sleeve, an end-on view)
export function sleeveMaterial() {
  return shared || (shared = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: SLEEVE_OPACITY, depthWrite: false, side: THREE.DoubleSide }));
}

// holes: [{ holeId, spans: [pts] }] -> the meshes (one per hole, its spans merged), each with userData.holeId (the Holes list hides it) and no raycast
export function sleeveMeshes(holes, order = 5) {
  const out = [];
  for (const h of holes.slice(0, SLEEVE_MAX_HOLES)) {
    const geos = h.spans.map((p) => sleeveGeometry(p)).filter(Boolean);
    if (!geos.length) continue;
    let geo = geos[0];
    if (geos.length > 1) { // merge the spans of one hole into one geometry
      const pos = [], idx = []; let base = 0;
      for (const g of geos) { pos.push(...g.attributes.position.array); const gi = g.index.array; for (let i = 0; i < gi.length; i++) idx.push(gi[i] + base); base += g.attributes.position.count; }
      geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3)); geo.setIndex(idx);
    }
    const m = new THREE.Mesh(geo, sleeveMaterial());
    m.renderOrder = order; m.userData = { holeId: h.holeId, assumedSleeve: true }; m.raycast = () => {}; m.frustumCulled = true;
    out.push(m);
  }
  return out;
}
