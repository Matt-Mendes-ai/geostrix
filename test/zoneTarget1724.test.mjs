// TASKS.csv #1724 (review #1645, Copley) — an undrilled zone wrapping a hole aims "Plan a hole to here" away from that hole
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { undrilledZones } from "../src/lib/undrilledZones.js";

function box(x0, x1, y0, y1, z0, z1) {
  const positions = new Float64Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7]);
  return { positions, indices };
}

test("a ring around a vertical hole: the centroid sits on the hole, the target is far from it", () => {
  const r = undrilledZones({ solid: box(0, 200, 0, 200, 0, 200), traces: [[{ x: 100, y: 100, z: 210 }, { x: 100, y: 100, z: -10 }]], coverM: 25, cellM: 10 });
  const z = r.zones[0];
  const off = (p) => Math.hypot(p.x - 100, p.y - 100);
  assert.ok(off(z.centre) < 5, `centroid ${off(z.centre)} m from the hole`);
  assert.ok(off(z.target) > 100, `target ${off(z.target)} m from the hole`);
});

test("a zone touching no covered block keeps its centroid", () => {
  const r = undrilledZones({ solid: box(0, 100, 0, 100, 0, 100), traces: [[{ x: 5000, y: 5000, z: 100 }, { x: 5000, y: 5000, z: 0 }]], coverM: 25, cellM: 10 });
  assert.deepEqual(r.zones[0].target, r.zones[0].centre);
});

test("the pane plans to the target", () => {
  assert.ok(readFileSync(new URL("../src/components/UndrilledZonesPane.jsx", import.meta.url), "utf8").includes("onPlanTo(z.target || z.centre)"));
});
