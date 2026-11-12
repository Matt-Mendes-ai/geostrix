// TASKS.csv #2550 — one density for the whole model: weathered and fresh rock took the same. Grade-tonnage can now take a density per code
// of a logged layer (each block the nearest logged interval within reach); the tonnes, metal and tonnage-weighted mean grade follow it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nearestCodeLookup, densityByCode, intervalCodePoints } from "../src/lib/densityByCode.js";
import { gradeTonnageTable } from "../src/lib/gradeTonnage.js";

test("a vertical hole: the top 20 m logged OX, the rest FR; points every 2 m at the right depths", () => {
  const trace = [{ md: 0, x: 0, y: 0, z: 100 }, { md: 60, x: 0, y: 0, z: 40 }];
  const ox = intervalCodePoints(trace, 0, 20, "OX", 2), fr = intervalCodePoints(trace, 20, 60, "FR", 2);
  assert.equal(ox.length, 10); assert.equal(ox[0].z, 99); assert.equal(fr[0].z, 79);
  const codeOf = nearestCodeLookup([...ox, ...fr], 50);
  assert.equal(codeOf({ x: 5, y: 0, z: 95 }), "OX");
  assert.equal(codeOf({ x: 5, y: 0, z: 50 }), "FR");
  assert.equal(codeOf({ x: 500, y: 0, z: 50 }), null, "beyond reach: no code");
  assert.deepEqual(intervalCodePoints([], 0, 5, "A", 2), []);
});

test("tonnes, metal and the mean grade weight each block by its own density; a code without a density takes the default", () => {
  const cells = [{ x: 0, y: 0, z: 95, dx: 10, dy: 10, dz: 10, value: 1 }, { x: 0, y: 0, z: 50, dx: 10, dy: 10, dz: 10, value: 2 }];
  const codeOf = (c) => (c.z > 80 ? "OX" : "FR");
  const one = gradeTonnageTable(cells, { cutoffs: [0], density: 2.7, unit: "%" })[0];
  const by = densityByCode(codeOf, { OX: 1.9, FR: "" }, 2.7);
  const two = gradeTonnageTable(cells, { cutoffs: [0], density: 2.7, unit: "%", densityOf: by.of })[0];
  assert.ok(Math.abs(one.tonnes - 5400) < 1e-6);
  assert.ok(Math.abs(two.tonnes - (1900 + 2700)) < 1e-6, String(two.tonnes));
  assert.ok(Math.abs(two.meanGrade - (1900 * 1 + 2700 * 2) / 4600) < 1e-9, String(two.meanGrade));
  assert.equal(by.used.get("OX"), 1); assert.equal(by.used.get("(default)"), 1);
});

test("the dialog offers Density by over the logged layers and passes densityOf to the table", () => {
  const s = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(s, /\["weath", "litho", "alt"\]/);
  assert.match(s, /densityOf: (byModel\?\.of \|\| )?byCode\?\.of \|\| null/);
  assert.match(s, /nearestCodeLookup\(pts, reachM\)/);
});
