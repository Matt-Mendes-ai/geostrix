// TASKS.csv #1500 — a pick stand-in is hit exactly as the Mesh it replaces, joins and leaves a group as an Object3D does, and
// becomes a real Mesh when it must be drawn on its own
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PickStandIn, PICK_ONLY_LAYER, colorFrom } from "../src/lib/viewer/pickStandIn.js";

const proto = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false).translate(0, 0.5, 0);
const place = (o) => { o.scale.set(0.4, 12, 0.4); o.position.set(3, -20, 5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.3, -0.9, 0.3).normalize()); };

test("a stand-in raycasts like the Mesh it stands for", () => {
  const group = new THREE.Group(); group.position.set(100, 0, -50); group.updateMatrixWorld(true);
  const mesh = new THREE.Mesh(proto, new THREE.MeshLambertMaterial({ color: "#aabbcc" })), standIn = new PickStandIn(proto, { color: "#aabbcc" });
  place(mesh); place(standIn);
  group.add(mesh); group.add(standIn);
  assert.equal(standIn.parent, group); assert.equal(group.children.length, 2);
  group.updateMatrixWorld(true); standIn.updateMatrix(); standIn.updateMatrixWorld();
  assert.deepEqual([...standIn.matrixWorld.elements], [...mesh.matrixWorld.elements]);
  const ray = new THREE.Raycaster(new THREE.Vector3(103 + 1.5, -5, -45 + 1.5), new THREE.Vector3(0, -1, 0));
  ray.layers.enable(PICK_ONLY_LAYER);
  const a = ray.intersectObject(mesh, false), b = ray.intersectObject(standIn, false);
  assert.ok(a.length > 0, "the mesh is hit");
  assert.equal(b.length, a.length);
  for (let i = 0; i < a.length; i++) { assert.ok(Math.abs(a[i].distance - b[i].distance) < 1e-9); assert.equal(b[i].object, standIn); }
  // a stand-in sits on the pick-only channel: a raycaster without it never sees it, as the camera never draws it
  const plain = new THREE.Raycaster(new THREE.Vector3(103 + 1.5, -5, -45 + 1.5), new THREE.Vector3(0, -1, 0));
  assert.equal(plain.intersectObject(standIn, false).length, 0);
  group.remove(standIn);
  assert.equal(standIn.parent, null); assert.equal(group.children.length, 1);
});

test("the colour is its own copy, and toMesh carries the placement, colour, visibility and userData", () => {
  const s = new PickStandIn(proto, { color: "#ff0000", transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const t = new PickStandIn(proto, { color: "#ff0000" });
  s.material.color.set("#00ff00");
  assert.equal(t.material.color.getHexString(), "ff0000");
  assert.equal(colorFrom("#123456").getHexString(), "123456");
  place(s); s.userData = { tip: "x" }; s.visible = false;
  const m = s.toMesh();
  assert.ok(m.isMesh && !m.isPickStandIn && m.material.isMeshLambertMaterial);
  assert.equal(m.material.color.getHexString(), "00ff00");
  assert.equal(m.material.opacity, 0.5); assert.equal(m.material.transparent, true); assert.equal(m.material.side, THREE.DoubleSide);
  assert.deepEqual(m.position.toArray(), s.position.toArray()); assert.deepEqual(m.scale.toArray(), s.scale.toArray());
  assert.equal(m.userData, s.userData); assert.equal(m.visible, false);
  assert.ok(s.id > 1e9 && t.id > s.id);
});
