// TASKS.csv #2318 (from #2211, review #2174) — the reference grid's size and centre from the collars' extent while it is on auto.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoGridSize, isAutoGrid, buildGridGroup, gridPlacement } from "../src/lib/viewer/gridGroup.js";

test("a 500 x 800 m block: a 1,000 m grid of 50 m cells, centred on the box (not the mean collar)", () => {
  const collars = [{ x: 1000, y: 2000, z: 100 }, { x: 1500, y: 2000, z: 100 }, { x: 1000, y: 2800, z: 100 }, { x: 1100, y: 2100, z: 100 }];
  const a = autoGridSize(collars);
  assert.deepEqual(a, { size: 1000, divisions: 20, cx: 1250, cy: 2400 });
  // two holes 96 m apart: 10 m cells
  assert.deepEqual(autoGridSize([{ x: 0, y: 0 }, { x: 96, y: 0 }]), { size: 120, divisions: 12, cx: 48, cy: 0 }); // 96 m + 20 % in 10 m cells
  assert.equal(autoGridSize([{ x: 0, y: 0 }]), null);
});

test("auto while set so, or while never resized from 1,000 m / 20; a typed size is kept", () => {
  assert.equal(isAutoGrid({ size: 1000, divisions: 20 }), true);
  assert.equal(isAutoGrid({ sizeAuto: true, size: 300, divisions: 3 }), true);
  assert.equal(isAutoGrid({ sizeAuto: false, size: 1000, divisions: 20 }), false);
  assert.equal(isAutoGrid({ size: 2000, divisions: 20 }), false);
});

test("the built grid uses the auto size and sits on the box's centre, snapped to the cell", () => {
  const collars = [{ x: 1000, y: 2000, z: 100 }, { x: 1500, y: 2000, z: 100 }, { x: 1000, y: 2800, z: 100 }, { x: 1100, y: 2100, z: 100 }];
  const pl = gridPlacement(collars);
  const g = buildGridGroup({ visible: true, mode: "ground", size: 1000, divisions: 20 }, pl);
  // scene x = E - mean E (1150); the grid's centre at 1250 E -> +100; scene z = -(N - mean N (2225)); 2400 N -> -175
  assert.ok(Math.abs(g.position.x - 100) < 1e-9, `x ${g.position.x}`);
  assert.ok(Math.abs(g.position.z - -175) < 1e-9, `z ${g.position.z}`);
  const typed = buildGridGroup({ visible: true, mode: "ground", size: 3000, divisions: 30, sizeAuto: false }, pl);
  assert.ok(Math.abs(typed.position.x - (1200 - 1150)) < 1e-9, "a typed grid keeps the mean collar centre, snapped (#2369)");
});

test("the grid popover shows the auto size and a typed size turns auto off", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.match(p, /value=\{gridOnAuto \? gridAuto\.size : gridConfig\.size\} onChange=\{\(e\) => setGridConfig\(\(g\) => \(\{ \.\.\.g, sizeAuto: false,/);
  assert.match(p, /\{tr\("Size from the data \(\{cell\} m cells\)"/);
});
