// TASKS.csv #3236 — the 3D legend (and the Layout legend, the section key) read the project's display unit for an assay element
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assayLegendGroups } from "../src/lib/legendGroups.js";
const assays = [{ hole_id: "a", from: 0, to: 1, values: { Cu: 50 } }, { hole_id: "a", from: 1, to: 2, values: { Cu: 400 } }];
const base = { assays, assayElements: [{ symbol: "Cu", unit: "ppm" }], assayVisible: true, assayDisplayElements: ["Cu"], assayStyle: { Cu: { breaks: [{ max: 100, color: "#00f" }, { max: 300, color: "#0f0" }, { max: 800, color: "#f00" }] } } };
test("the classes' limits and the unit follow the project's choice", () => {
  const as = assayLegendGroups(base)[0];
  assert.equal(as.label, "Cu (ppm)");
  assert.deepEqual(as.items.map((x) => x[0]), ["≤ 100 ppm", "100–300 ppm", "> 300 ppm"]);
  const pct = assayLegendGroups({ ...base, displayUnits: { Cu: "%" } })[0];
  assert.equal(pct.label, "Cu (%)");
  assert.match(pct.items[0][0], /^≤ 0\.01 %$/);
  assert.match(pct.items[1][0], /^0\.01.0\.03 %$/);
  assert.match(pct.items[2][0], /^> 0\.03 %$/);
  const ppb = assayLegendGroups({ ...base, displayUnits: { Cu: "ppb" } })[0];
  assert.equal(ppb.label, "Cu (ppb)");
  assert.match(ppb.items[0][0], /100,?000 ppb/);
  // an oxide basis / another element: as stored
  assert.equal(assayLegendGroups({ ...base, displayUnits: { Zn: "%" } })[0].label, "Cu (ppm)");
});
test("wiring: the 3D View, the section key and the Layout legend pass project.displayUnits", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.equal((v.match(/displayUnits: project\?\.displayUnits/g) || []).length, 3);
  assert.match(fs.readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8"), /displayUnits: project\?\.displayUnits/);
});
