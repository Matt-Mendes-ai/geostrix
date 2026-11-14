// TASKS.csv #3095 (Matt's pick B) — Terrain from samples and collars limited to a drawn area, so a wide field's grid follows the points inside it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the picker, the filter in project coordinates, and the chip with Clear are wired", () => {
  assert.match(g, /const \[projArea, setProjArea\] = useState\(null\);/);
  assert.match(g, /const areaBox = projAreaBox\(projArea, project\?\.epsg\);/);
  assert.match(g, /allSamplePts\.filter\(inArea\)/); assert.match(g, /allCollarPts\.filter\(inArea\)/);
  assert.match(g, /tr\("Limit to a drawn area…"\)/);
  assert.match(g, /onConfirm=\{\(bbox\) => \{ setProjArea\(bbox\); setProjAreaPicker\(false\); \}\}/);
});
test("projAreaBox: a lon / lat box becomes the extent of its four corners in the project CRS", async () => {
  const { pointTransform } = await import("../src/lib/reproject.js");
  const src = g.slice(g.indexOf("function projAreaBox"), g.indexOf("const numInput"));
  const fn = new Function("pointTransform", `${src}; return projAreaBox;`)(pointTransform);
  const b = fn([-131.5, 57.0, -131.3, 57.2], 26909);
  assert.ok(b[0] < b[2] && b[1] < b[3]);
  assert.ok(b[2] - b[0] > 10000 && b[2] - b[0] < 14000, `${b[2] - b[0]}`); // 0.2 degrees of longitude at 57 N is about 12 km
  assert.equal(fn(null, 26909), null); assert.equal(fn([0, 0, 1, 1], null), null);
});
