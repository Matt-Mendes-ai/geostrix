// TASKS.csv #3853 (Main, 2026-11-17) — a ~3 px click that snapped to a collar 34 m below the ground it hit read 'moved 34 m', which alarms. In a plan look the move is the horizontal
// distance, and the vertical part is said apart only when large; in other views the 3D distance as before. Synthetic points.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { snapInterpretClick } from "../src/lib/viewer/interpretSnap.js";
import { tiesText } from "../src/lib/interpretation.js";

const origin = { x: 0, y: 0, z: 0 };
// scene coordinates (x east, y up, z -north): a vertical hole whose collar is at E 100, N 50, RL 100 -> scene (100, 100, -50)
const traces = [{ hole_id: "DH-23-001", pts: [{ x: 100, y: 100, z: -50, md: 0 }, { x: 100, y: 60, z: -50, md: 40 }] }];
const camera = (looksDown) => { const c = new THREE.PerspectiveCamera(50, 1, 1, 5000); c.position.set(100, 600, -50); c.lookAt(looksDown ? 100 : 700, looksDown ? 0 : 600, -50); c.updateMatrixWorld(true); return c; };
const click = (cam, hit) => {
  const dir = new THREE.Vector3(hit.x, hit.z, -hit.y).sub(cam.position).normalize(); // world (E, N, Z) -> scene
  const ray = new THREE.Ray(cam.position.clone(), dir);
  return snapInterpretClick(hit, ray, { on: true, traces, layers: {}, visible: {}, origin, camera: cam, heightPx: 800 });
};

test("#3853 plan look: moved is horizontal, the vertical part apart and only when large", () => {
  const cam = camera(true);
  // clicked on the ground 66 m below the collar and 0.4 m east of it in plan: the collar is the snap
  const r = click(cam, { x: 100.4, y: 50, z: 34 });
  assert.equal(r.snap?.kind, "collar");
  assert.equal(r.snap.inPlan, true);
  assert.ok(r.snap.moved < 1, String(r.snap.moved));
  assert.equal(r.snap.vert, 66);
  const text = tiesText([r]);
  assert.equal(text, "DH-23-001 collar (moved 0.4 m in plan; the collar is 66 m above where you clicked)");
  // a small vertical part is not said
  const r2 = click(cam, { x: 100.4, y: 50, z: 98 });
  assert.equal(r2.snap.vert, undefined);
  assert.equal(tiesText([r2]), "DH-23-001 collar");
});

test("#3853 an oblique look keeps the 3D distance and says nothing in plan", () => {
  const cam = new THREE.PerspectiveCamera(50, 1, 1, 5000); cam.position.set(100, 100, 300); cam.lookAt(100, 100, -50); cam.updateMatrixWorld(true); // along the horizon at the collar
  const r = click(cam, { x: 100.4, y: 50, z: 99 });
  assert.equal(r.snap?.kind, "collar");
  assert.equal(r.snap.inPlan, undefined);
  assert.equal(r.snap.vert, undefined);
  assert.equal(r.snap.moved, 1.1); // the 3D distance: 0.4 m east, 1 m up
  assert.equal(tiesText([r]), "DH-23-001 collar (moved 1.1 m)");
});

test("#3853 tiesText: a plan move of 1 m or more says 'in plan'; other views keep the 3D distance text", () => {
  assert.equal(tiesText([{ snap: { hole_id: "DH-23-002", kind: "collar", moved: 3.2, inPlan: true } }]), "DH-23-002 collar (moved 3.2 m in plan)");
  assert.equal(tiesText([{ snap: { hole_id: "DH-23-002", kind: "collar", moved: 3.2 } }]), "DH-23-002 collar (moved 3.2 m)");
  assert.equal(tiesText([{ snap: { hole_id: "DH-23-002", kind: "collar", moved: 0.4 } }]), "DH-23-002 collar");
  assert.equal(tiesText([{ snap: { hole_id: "DH-23-002", kind: "collar", moved: 0.4, inPlan: true, vert: -34 } }]), "DH-23-002 collar (moved 0.4 m in plan; the collar is 34 m below where you clicked)");
});
