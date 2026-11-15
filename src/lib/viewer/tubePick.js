// TASKS.csv #3667 (follow-up of #3643) — an interval tube drawn at the pixel floor (tubeShader.js) has a true radius far under a pixel, so a pick ray
// that goes through the tube's real geometry misses it and the tube cannot be hovered or identified from far out. A tube is also hit when the ray
// passes within TUBE_PICK_PX pixels of its AXIS: the nearest points of the ray and the axis segment, at that point's depth. The true geometry still
// decides when it is hit (a wide tube near the camera is unchanged); the pick tree (pickIndex.js) widens the boxes of a tube batch by the same
// pixels at the box's depth, so the extra candidates are found without a scan.
import * as THREE from "three";
import { TUBE_UNIFORMS } from "./tubeShader.js";

export const TUBE_PICK_PX = 4;

// the world metres one pixel spans: metres = c + k * depth (a perspective camera: k; an orthographic one: c); null when the camera's projection or the
// viewport is unknown
export function tubePixelScale(camera, viewportH = TUBE_UNIFORMS.uViewportH.value) {
  const p = camera?.projectionMatrix?.elements;
  if (!p || !(viewportH > 0) || !(p[5] > 0)) return null;
  const perPx = 2 / (p[5] * viewportH);
  return p[15] === 1 ? { k: 0, c: perPx } : { k: perPx, c: 0 };
}

// the ray's nearest approach to the segment a -> b: the distance between them and the ray parameter t of the nearest point (>= 0), or null when the
// segment is a point
export function rayToSegment(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz) {
  const ux = bx - ax, uy = by - ay, uz = bz - az, wx = ax - ox, wy = ay - oy, wz = az - oz;
  const a = ux * ux + uy * uy + uz * uz;
  if (!(a > 0)) return null;
  const b = ux * dx + uy * dy + uz * dz, c = dx * dx + dy * dy + dz * dz, d = ux * wx + uy * wy + uz * wz, e = dx * wx + dy * wy + dz * wz;
  const den = a * c - b * b;
  let s = den > 1e-12 * a * c ? (b * e - c * d) / den : 0; // parallel: any s will do
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  let t = (s * b + e) / c;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -d / a)); } // the nearest point is behind the camera: the ray's origin to the segment
  const qx = wx + s * ux - t * dx, qy = wy + s * uy - t * dy, qz = wz + s * uz - t * dz;
  return { dist: Math.sqrt(qx * qx + qy * qy + qz * qz), t, s };
}

// instance i of a batch whose placements are `base` (16 floats each, in the batch's frame): the tube's axis a -> b and its radius, in the world frame.
// mw: the batch's matrixWorld elements. The prototype runs from its base up +Y for one unit, so the axis is the matrix's Y column.
export function tubeAxis(base, i, mw) {
  const o = i * 16;
  const px = base[o + 12], py = base[o + 13], pz = base[o + 14], yx = base[o + 4], yy = base[o + 5], yz = base[o + 6];
  const X = (x, y, z) => mw[0] * x + mw[4] * y + mw[8] * z + mw[12], Y = (x, y, z) => mw[1] * x + mw[5] * y + mw[9] * z + mw[13], Z = (x, y, z) => mw[2] * x + mw[6] * y + mw[10] * z + mw[14];
  const sc = Math.max(Math.hypot(mw[0], mw[1], mw[2]), Math.hypot(mw[4], mw[5], mw[6]), Math.hypot(mw[8], mw[9], mw[10]));
  return { ax: X(px, py, pz), ay: Y(px, py, pz), az: Z(px, py, pz), bx: X(px + yx, py + yy, pz + yz), by: Y(px + yx, py + yy, pz + yz), bz: Z(px + yx, py + yy, pz + yz), r: Math.hypot(base[o], base[o + 1], base[o + 2]) * sc };
}

// the hit of a ray on tube i of a batch within px pixels of its axis (the true radius or px pixels at that depth, whichever is wider): { distance, point } or null
export function tubeAxisHit(base, i, mw, ray, scale, px = TUBE_PICK_PX) {
  if (!scale) return null;
  const A = tubeAxis(base, i, mw), d = ray.direction, o = ray.origin;
  const h = rayToSegment(o.x, o.y, o.z, d.x, d.y, d.z, A.ax, A.ay, A.az, A.bx, A.by, A.bz);
  if (!h) return null;
  if (h.dist > Math.max(A.r, px * (scale.c + scale.k * h.t))) return null;
  return { distance: h.t, point: { x: o.x + d.x * h.t, y: o.y + d.y * h.t, z: o.z + d.z * h.t } };
}

// TASKS.csv #3670 — a family of fewer than 24 tubes is not batched: each is a real Mesh (layerBatches.js promote) with the pixel-floor material, and this is its
// raycast: the true geometry first, then the axis within TUBE_PICK_PX pixels (the mesh's world matrix is the placement: its Y column the axis, its X column the radius)
const _I = new THREE.Matrix4().elements;
export function tubeMeshRaycast(raycaster, hits) {
  const before = hits.length;
  THREE.Mesh.prototype.raycast.call(this, raycaster, hits);
  if (hits.length !== before || this.visible === false) return;
  const h = tubeAxisHit(this.matrixWorld.elements, 0, _I, raycaster.ray, tubePixelScale(raycaster.camera));
  if (h && h.distance >= raycaster.near && h.distance <= raycaster.far) hits.push({ distance: h.distance, point: new THREE.Vector3(h.point.x, h.point.y, h.point.z), object: this, face: null, faceIndex: null });
}
