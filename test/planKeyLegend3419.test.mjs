// TASKS.csv #3419 (#3383 (12)) — Insert > Legend on a page whose only map is a drill plan builds its rows from the plan's key (its title, note,
// colour classes, symbol shapes and the planned hole), not from the 3D View. SYNTHETIC key.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planKeyItems } from "../src/lib/planKeyLegend.js";
import { drillPlanColouring } from "../src/lib/drillPlan.js";

test("the key's rows become legend rows: headings for the title and note, a swatch for each class, shape and the planned hole", () => {
  const items = planKeyItems({
    colouring: { title: "Cu grade × length, whole hole", note: "cut-off 3 %", key: [{ label: "< 111 m × %", colour: "#9ecae1" }, { label: "≥ 297 m × %", colour: "#08519c" }, { label: "+ 4 more", note: true }] },
    shapeKey: [{ label: "Type: DDH", shape: "circle" }], plannedKey: [{ label: "Planned hole" }],
  });
  assert.deepEqual(items, [
    ["Cu grade × length, whole hole", null, { heading: true }], ["cut-off 3 %", null, { heading: true }],
    ["< 111 m × %", "#9ecae1"], ["≥ 297 m × %", "#08519c"], ["+ 4 more", null, { heading: true }],
    ["Type: DDH", "#55606e"], ["Planned hole", "#e27f1a"],
  ]);
  assert.deepEqual(planKeyItems(null), []);
  assert.deepEqual(planKeyItems({ colouring: { key: [] } }), []);
});

test("a real key: a plan coloured by series gives one row per series", () => {
  const holes = [{ id: "AB-1", series: "AB" }, { id: "AB-2", series: "AB" }, { id: "CD-1", series: "CD" }];
  const c = drillPlanColouring({ colourBy: "series" }, holes, holes.map((h) => ({ hole_id: h.id })), {});
  const items = planKeyItems({ colouring: c });
  assert.deepEqual(items.map((i) => i[0]).sort(), ["AB", "CD"]);
  assert.ok(items.every((i) => /^#|^rgb|^hsl/.test(i[1])), "each has its colour");
});

test("the Layout legend takes the plan's key when the page's only map is one drill plan (no viewport), else the view's rows as before", () => {
  const l = fs.readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(l, /const plans = elements\.filter\(\(el\) => el\.type === "drillplan"\);\n\s*if \(!only\.length && plans\.length === 1\) \{\n\s*const pk = planKeyItems\(drillPlanDrawing\(plans\[0\], tableCollars/);
  assert.match(l, /if \(pk\.length\) \{ base\.items = pk; delete base\.loadedGroups; \}/);
  assert.match(l, /import \{ planKeyItems \} from "\.\.\/lib\/planKeyLegend\.js";/);
});
