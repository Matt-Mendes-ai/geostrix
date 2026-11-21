// TASKS.csv #3927 follow-up — the + / - keys use the wheel's closest orbit (wheelZoom.js sceneMinRadius over the shown holes and models), not 5 cm:
// pressing + again and again cannot fold the camera onto the ground
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { sceneFloor, wheelAnchors, wheelBoxes } from "../src/modules/viewer/wheelAnchors.js";
import { sceneMinRadius, sceneSizeOf, MIN_ORBIT_M } from "../src/modules/viewer/wheelZoom.js";
import { viewKeyZoom } from "../src/lib/viewer/viewKeys.js";

// SYNTHETIC: 9 inclined holes over 2 km and one block model 600 m across
const traces = Array.from({ length: 9 }, (_, k) => ({ hole_id: `K-${k + 1}`, pts: [0, 1, 2].map((s) => ({ x: (k % 3) * 900 + s * 50, y: 100 - s * 100, z: Math.floor(k / 3) * 900 + s * 30 })) }));
const model = new THREE.Group(); model.add(new THREE.Mesh(new THREE.BoxGeometry(600, 200, 600)));

test("the keys' floor is the wheel's floor, for the same holes and models", () => {
  const f = sceneFloor(traces, {}, [model]);
  assert.equal(f, sceneMinRadius(sceneSizeOf(wheelAnchors(traces, {}), wheelBoxes([model]))));
  assert.ok(f >= MIN_ORBIT_M);
  assert.equal(sceneFloor([], {}, []), MIN_ORBIT_M, "nothing drawn: the 0.5 m floor");
  const hidden = Object.fromEntries(traces.map((t) => [t.hole_id, false]));
  assert.ok(sceneFloor(traces, hidden, []) <= f, "hidden holes do not widen it");
});

test("200 presses of + stop at the floor; - still backs out", () => {
  const floor = sceneFloor(traces, {}, [model]);
  const cs = { radius: 1500 };
  const zoom = (fac) => { cs.radius = Math.min(4e6, Math.max(floor, cs.radius * fac)); }; // the view's key line (ViewerModule), with the floor
  for (let i = 0; i < 200; i++) viewKeyZoom({ key: "+", preventDefault() {} }, { zoom, fit() {} });
  assert.equal(cs.radius, floor);
  viewKeyZoom({ key: "-", preventDefault() {} }, { zoom, fit() {} });
  assert.ok(cs.radius > floor);
});

test("wired: the key line takes the wheel's floor, with the wheel's own groups", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  const key = /Math\.max\(sceneFloor\(tracesRef\.current, visibleHolesRef\.current, (\[[^\]]*\])\) \/\* #3927: the wheel's floor \*\/, camState\.current\.radius \* f\)/.exec(v);
  assert.ok(key, "the + / - keys use sceneFloor");
  assert.doesNotMatch(v, /Math\.max\(0\.05, camState\.current\.radius \* f\)/);
  const wheel = /boxes: \(\) => wheelBoxes\((\[[^\]]*\])\)/.exec(v);
  assert.ok(wheel, "the wheel's boxes");
  assert.equal(key[1], wheel[1], "the same groups as the wheel");
});
