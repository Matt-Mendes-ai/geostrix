// TASKS.csv #2536 — checking a 500 x 500 m block of a 2,248-hole project took 357 ids pasted into the filter. A typed E / N range in Model
// settings checks the holes whose collars fall in it (and unchecks the others), with the block's size and hole count shown first.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holesInRange, visibilityPatch } from "../src/lib/holeFilter.js";

const collars = [];
for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) collars.push({ hole_id: `G${i}${j}`, x: 400000 + i * 100, y: 6500000 + j * 100 });
collars.push({ hole_id: "NOXY", x: NaN, y: 1 });

test("the collars in a range, bounds in either order, edges included", () => {
  const r = holesInRange(collars, { e0: 400500, e1: 400000, n0: 6500000, n1: 6500499 });
  assert.equal(r.ids.length, 6 * 5);
  assert.equal(r.width, 500); assert.equal(r.height, 499);
  assert.ok(!r.ids.includes("NOXY"));
  assert.deepEqual(holesInRange(collars, { e0: 0, e1: 1, n0: 0, n1: 1 }).ids, []);
});

test("'Check only these holes' checks the range and unchecks the rest", () => {
  const r = holesInRange(collars, { e0: 400000, e1: 400100, n0: 6500000, n1: 6500000 });
  const v = visibilityPatch({ G99: true }, collars.map((c) => c.hole_id), r.ids, "only");
  assert.equal(v.G00, true); assert.equal(v.G10, true); assert.equal(v.G01, false); assert.equal(v.G99, false);
});

test("wired: the box under Model area when it is 'holes checked'; ViewerModule passes the setter", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /modelArea === "checked" && <Suspense fallback=\{null\}><ModelAreaRange collars=\{collars\} visibleHoles=\{visibleHoles\} setVisibleHoles=\{setVisibleHoles\}/);
  const c = readFileSync(new URL("../src/components/ModelAreaRange.jsx", import.meta.url), "utf8");
  assert.match(c, /visibilityPatch\(v, collars\.map\(\(c\) => c\.hole_id\), hit\.ids, "only"\)/);
  assert.match(c, /\{n\} of \{m\} holes in \{w\} × \{h\} m\./);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /<ModellingPanes \{\.\.\.\{ visibleHoles, setVisibleHoles,/);
});
