// TASKS.csv #3990 — the slices' drawing, loaded with the first layer drawn in slices (slicesRegistry.js; startup size). A wedge is a prism sector
// of the unit interval tube (radius 1, from y 0 to 1, as the cylinder prototypes): span whole per cent of the circle from angle 0, placed by its
// interval's matrix and turned about the trace by its start. One shared prototype per span (and per light / full drawing), so a layer's wedges
// batch into at most a hundred-odd draw calls whatever their number; light drawing draws each wedge with fewer arc segments, never fewer wedges.
import * as THREE from "three";
import { sharedProto } from "./protos.js";
export { slicesOf, wedgeSpans, MIN_SLIVER } from "../mineralSlices.js";

export const FULL_SEGMENTS = 24, LIGHT_SEGMENTS = 8; // arc segments of a whole circle
const protos = new Map();

// the triangles of a wedge of `span` per cent with `circle` segments for a whole circle -> Float32Array positions (non-indexed, outward winding)
export function wedgePositions(span, circle = FULL_SEGMENTS) {
  const frac = Math.min(100, Math.max(1, span)) / 100, seg = Math.max(1, Math.ceil(frac * circle)), whole = frac >= 1;
  const a = (k) => (k / seg) * frac * Math.PI * 2;
  const P = [];
  const tri = (p, q, r) => { P.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]); };
  for (let k = 0; k < seg; k++) {
    const c0 = Math.cos(a(k)), s0 = Math.sin(a(k)), c1 = Math.cos(a(k + 1)), s1 = Math.sin(a(k + 1));
    // the round side (angle runs from +X toward -Z: x = cos, z = -sin, counter-clockwise seen from +Y)
    const b0 = [c0, 0, -s0], b1 = [c1, 0, -s1], t0 = [c0, 1, -s0], t1 = [c1, 1, -s1];
    tri(b0, b1, t1); tri(b0, t1, t0);
    tri([0, 1, 0], t0, t1); // top
    tri([0, 0, 0], b1, b0); // bottom
  }
  if (!whole) { // the two cut faces
    const e = a(seg), ce = Math.cos(e), se = Math.sin(e);
    tri([0, 0, 0], [1, 0, 0], [1, 1, 0]); tri([0, 0, 0], [1, 1, 0], [0, 1, 0]);
    tri([0, 0, 0], [0, 1, 0], [ce, 1, -se]); tri([0, 0, 0], [ce, 1, -se], [ce, 0, -se]);
  }
  return new Float32Array(P);
}

export function wedgeProto(span, light = false) {
  const s = Math.min(100, Math.max(1, Math.round(span))), key = `${light ? "wedgeL" : "wedge"}${s}`;
  let g = protos.get(key);
  if (!g) {
    g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(wedgePositions(s, light ? LIGHT_SEGMENTS : FULL_SEGMENTS), 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    protos.set(key, sharedProto(g, key));
  }
  return g;
}

// the turn about the trace (the prototype's +Y) for a wedge starting at `start` (0-1 of the circle), into q
const Y = new THREE.Vector3(0, 1, 0);
export const rollOf = (start, q = new THREE.Quaternion()) => q.setFromAxisAngle(Y, start * Math.PI * 2);
