// TASKS.csv #3231 (#2925 (3)) — 'n of m samples plotted' counted points drawn outside a fixed diagram's axes
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/GeochemPlot.jsx", import.meta.url), "utf8");
const { onAxes } = new Function(`${src.match(/export const onAxes = [^\n]*;/)[0].replace("export ", "")} return { onAxes };`)();

test("a point counts when it is inside the diagram's axes", () => {
  const tas = { xRange: [35, 80], yRange: [0, 16] };
  assert.equal(onAxes(tas, { x: 50, y: 5 }), true);
  assert.equal(onAxes(tas, { x: 30, y: 5 }), false);
  assert.equal(onAxes(tas, { x: 50, y: 20 }), false);
  assert.equal(onAxes({ ...tas, dynamicRange: true }, { x: 30, y: 5 }), true, "a fitted range holds every point");
  assert.equal(onAxes({ ternary: true }, { x: 2, y: 2 }), true);
  const m = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(m, /const p = diagram\.project\(a, elementUnits\); return p && onAxes\(diagram, p\);/);
});
