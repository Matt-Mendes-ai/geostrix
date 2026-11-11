// TASKS.csv #2367 (review #2325, WA uranium) — a numeric custom layer's ramp: range, linear / log and classes from its style; the default
// stays the 2nd-98th percentile; the unit in the legend; a Style icon on the row
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customColour, customLegendGroups, customScale, customScaleDefault } from "../src/lib/customColour.js";
import { cleanLayerStyle } from "../src/lib/layerStyle.js";

// a log: 1..100 ppm in 99 rows, one 7,464 ppm spike
const rows = Array.from({ length: 99 }, (_, i) => ({ hole_id: "H", from: i, to: i + 1, value: i + 1 }));
rows.push({ hole_id: "H", from: 99, to: 100, value: 7464 });
const L = { id: "g1", name: "Gamma eU3O8", unit: "ppm", rows };

test("the default is the 2nd-98th percentile; a style range, scale and classes replace it", () => {
  const d = customScaleDefault(L, "value");
  assert.equal(d.min, 3); assert.equal(d.max, 98); assert.ok(d.log); assert.equal(d.dataMax, 7464);
  const st = { rampMin: 1, rampMax: 8000 };
  const s = customScale(L, "value", st);
  assert.equal(s.min, 1); assert.equal(s.max, 8000); assert.ok(s.log); assert.ok(!s.clipHi); // the spike is inside now
  assert.notEqual(customColour(L, { "custom:g1": st }, { value: 7464 }), customColour(L, { "custom:g1": st }, { value: 98 })); // was one yellow
  assert.equal(customColour(L, {}, { value: 7464 }), customColour(L, {}, { value: 98 })); // the default clips both to the top colour
  assert.ok(!customScale(L, "value", { rampMin: 1, rampMax: 8000, rampScale: "linear" }).log);
  assert.ok(!customScale(L, "value", { rampMin: -5, rampMax: 8000, rampScale: "log" }).log); // log needs a positive minimum
  // classes: 4 equal steps on the scale; the legend lists them with their ranges
  const cl = { rampMin: 1, rampMax: 10000, classes: 4 };
  const c1 = customColour(L, { "custom:g1": cl }, { value: 2 }), c2 = customColour(L, { "custom:g1": cl }, { value: 5 });
  assert.equal(c1, c2); // the same class (1-10)
  const g = customLegendGroups([L], {}, { "custom:g1": cl })[0];
  assert.equal(g.items.length, 4);
  assert.match(g.items[3][0], /^1 – 10$/); // the lowest class last (the legend lists high to low)
  assert.equal(g.label, "Gamma eU3O8 (ppm)");
  const open = customLegendGroups([L], {}, { "custom:g1": { rampMin: 1, rampMax: 1000, classes: 3 } })[0];
  assert.equal(open.items[0][0], "≥ 100"); // the top class reaches past 1,000 (the 7,464 spike): open-ended
});

test("the Style dialog edits them (kept by the style cleaner); the custom layer row has a Style icon", () => {
  assert.deepEqual(cleanLayerStyle({ rampMin: 10, rampMax: 8000, rampScale: "log", classes: 5 }, "interval"), { rampMin: 10, rampMax: 8000, rampScale: "log", classes: 5 });
  assert.equal(cleanLayerStyle({ rampMin: null, rampScale: "", classes: 0 }, "interval"), null);
  const m = readFileSync(new URL("../src/components/LayerStyleModal.jsx", import.meta.url), "utf8");
  assert.match(m, /onChange=\{numIn\("rampMin"\)\}/);
  assert.match(m, /onChange=\{\(e\) => onChange\(\{ rampScale: e\.target\.value \|\| null \}\)\}/);
  assert.match(m, /onChange=\{numIn\("classes"\)\}/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /<Settings2 size=\{12\} style=\{\{ cursor: "pointer", flexShrink: 0 \}\} \{\.\.\.iconAction\(\(\) => openCustomStyle\(l\), tr\("Style"\)\)\} \/>/);
});
