// TASKS.csv #3843 (Matt, 2026-11-20) — the Stereonet can keep only the readings in the 3D View's window and/or inside one of the project's boundaries.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { keepWhere, pickXY } from "../src/lib/stereonetGroups.js";
import { pointInBoundary } from "../src/lib/pointInPolygon.js";
import { makeStereonetLocate } from "../src/lib/viewer/stereonetLocate.js";

const square = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]];
const collarXY = new Map([["H1", { x: 50, y: 50 }], ["H2", { x: 500, y: 500 }]]);
const picks = [{ hole_id: "H1", depth: 10 }, { hole_id: "H2", depth: 20 }, { outcrop: true, x: 10, y: 90 }, { outcrop: true, x: 300, y: 10 }, { hole_id: "H9" }];

test("a downhole pick sits at its collar, an outcrop reading at its own point; no position: out of a place filter", () => {
  assert.deepEqual(pickXY(picks[0], collarXY), { x: 50, y: 50 });
  assert.deepEqual(pickXY(picks[2], collarXY), { x: 10, y: 90 });
  assert.equal(pickXY(picks[4], collarXY), null);
  assert.equal(keepWhere(picks, null, pointInBoundary), picks);
  assert.equal(keepWhere(picks, { collarXY }, pointInBoundary), picks, "no place asked: all of them");
});

test("inside a boundary; in the view; both", () => {
  assert.deepEqual(keepWhere(picks, { boundary: square, collarXY }, pointInBoundary), [picks[0], picks[2]]);
  assert.deepEqual(keepWhere(picks, { inView: (x) => x < 400, collarXY }, pointInBoundary), [picks[0], picks[2], picks[3]]);
  assert.deepEqual(keepWhere(picks, { inView: (x) => x < 400, boundary: square, collarXY }, pointInBoundary), [picks[0], picks[2]]);
});

test("the camera test: a ground point in the window, scene axes x east, z -north", () => {
  const cam = new THREE.PerspectiveCamera(45, 1, 1, 100000);
  cam.position.set(0, 1000, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const loc = makeStereonetLocate(cam, { clientWidth: 800, clientHeight: 800 }, { x: 1000, y: 2000, z: 0 }, [{ id: "b", name: "B", polylines: square }, { id: "e", polylines: [] }], [{ hole_id: "H1", x: 5, y: 6 }]);
  assert.equal(loc.inView(1000, 2000), true, "the origin is at the centre");
  assert.equal(loc.inView(1000 + 5000, 2000), false, "5 km east is outside a ~830 m window");
  assert.equal(loc.boundaries.length, 1, "a boundary with no lines is not offered");
  assert.deepEqual(loc.collarXY.get("H1"), { x: 5, y: 6 });
  assert.equal(makeStereonetLocate(null, null, null, [], []).inView, null);
});
