// Shared prototype geometries of the 3D view's drillhole layers, moved out of ViewerModule.jsx unchanged (TASKS.csv #2176; its
// #1084 size cap). One module instance, so ViewerModule and viewer/drillholeScene.js use the same geometry objects.
import * as THREE from "three";

// Shared prototype geometries. Batching requires the members of a family to share ONE geometry, so
// the build code below creates unit-sized primitives and encodes the real size in the object's
// scale instead of baking it into a per-object geometry (a unit cylinder scaled by (r, len, r) is
// vertex-for-vertex the same shape CylinderGeometry(r, r, len) produced, and three.js's raycast
// transforms the ray into local space, so picking is unaffected). `sharedProto` also tags them so
// the rebuild/unmount disposal passes skip them — disposing a shared prototype would free buffers
// still referenced by every other user of it.
export function sharedProto(geo, key) { geo.userData.protoKey = key; geo.userData.sharedProto = true; return geo; }
// Cylinder centred on its own axis by default; translated so scale.y = interval length places the
// BASE at position, matching what the per-interval CylinderGeometry(...).translate(0, len/2, 0) did.
export const PROTO_CYLINDER = sharedProto(new THREE.CylinderGeometry(1, 1, 1, 6, 1, false).translate(0, 0.5, 0), "cyl6");
export const PROTO_SPHERE_10 = sharedProto(new THREE.SphereGeometry(1, 10, 10), "sph10");
export const PROTO_SPHERE_8 = sharedProto(new THREE.SphereGeometry(1, 8, 8), "sph8");
export const PROTO_SPHERE_12 = sharedProto(new THREE.SphereGeometry(1, 12, 12), "sph12");
export const PROTO_CIRCLE_24 = sharedProto(new THREE.CircleGeometry(1, 24), "circ24");
// TASKS.csv #635 — the extra shapes a layer style can pick (same unit-size + scale convention, so they batch too)
export const PROTO_CYLINDER_16 = sharedProto(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false).translate(0, 0.5, 0), "cyl16");
export const PROTO_PRISM_4 = sharedProto(new THREE.CylinderGeometry(1, 1, 1, 4, 1, false).rotateY(Math.PI / 4).translate(0, 0.5, 0), "prism4");
export const PROTO_CUBE = sharedProto(new THREE.BoxGeometry(1.6, 1.6, 1.6), "cube"); // ~ the sphere's visual size
export const PROTO_DISC_FLAT = sharedProto(new THREE.CircleGeometry(1.2, 24).rotateX(-Math.PI / 2), "discflat"); // horizontal
export const PROTO_PILLAR = sharedProto(new THREE.CylinderGeometry(0.8, 0.8, 2, 12, 1, false), "pillar"); // vertical, centred
export const PROTO_SQUARE = sharedProto(new THREE.PlaneGeometry(1.8, 1.8), "square"); // ~ the disc's area
export const PIN_AXIS = new THREE.Vector3(0, 1, 0), dipPinDir = new THREE.Vector3(); // #1241 — PROTO_PRISM_4 runs up +Y from its base
export const INTERVAL_PROTO = { cylinder: PROTO_CYLINDER, smooth: PROTO_CYLINDER_16, square: PROTO_PRISM_4 };
export const UP_Y = new THREE.Vector3(0, 1, 0), DIR_TMP = new THREE.Vector3(); // #1500 — an interval's rotation without two new vectors each
export const POINT_PROTO = { sphere: PROTO_SPHERE_10, cube: PROTO_CUBE, disc: PROTO_DISC_FLAT, pillar: PROTO_PILLAR };
