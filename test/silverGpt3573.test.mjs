// TASKS.csv #3573 / #3607 / #3698 (rehearsal round 3) — silver (and Au / Pt / Pd) stored in ppm reads g/t on every screen: Identify, the strip log's hover, the section's top-grade labels, the Data table's heading, the X-Y axis
// lists and Data QC's 'the sample there'; other elements and units are as stored. (#3586 had done the Grade tools, the legend, the 3D hover and the strip-log track.) SYNTHETIC rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildTable } from "../src/lib/dataTable.js";
import { gradesAtFn } from "../src/lib/dataQC.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the Data table's heading and Data QC's 'the sample there' say g/t for silver in ppm, % for lead", () => {
  const store = { assays: [{ hole_id: "H1", from: 0, to: 1, values: { Ag: 4.8, Pb: 0.05 } }], assayElements: [{ symbol: "Ag", unit: "ppm" }, { symbol: "Pb", unit: "%" }, { symbol: "Cu", unit: "ppm" }], collars: [], survey: [], layers: {} };
  const t = buildTable("assays", store);
  const labels = t.columns.map((c) => c.label);
  assert.ok(labels.includes("Ag (g/t)"), labels.join(" | ")); assert.ok(labels.includes("Pb (%)")); assert.ok(labels.includes("Cu (ppm)"), "base metals in ppm stay ppm");
  assert.equal(gradesAtFn(store.assays, store.assayElements)("H1", 0, 1), "Ag 4.8 g/t, Pb 0.05 %");
});
test("Identify, the strip log hover, the section labels and the X-Y lists use the same label helper", () => {
  assert.match(read("../src/lib/viewer/identify.js"), /assayValueText\(row, sym, ctx\.units\?\.\[sym\] \? gradeUnitLabel\(sym, ctx\.units\[sym\]\) : ""\)/);
  assert.match(read("../src/components/StripLog.jsx"), /\$\{v\} \$\{gradeUnitLabel\(t\.sym, elementUnits\[t\.sym\]\)\}/);
  assert.match(read("../src/components/SectionWindow.jsx"), /\$\{gradeUnitLabel\(a\.sym, a\.u\)\} \$\{a\.sym\}/);
  const g = read("../src/modules/GeochemModule.jsx");
  assert.equal((g.match(/\(\$\{gradeUnitLabel\(e\.symbol, e\.unit\)\}\)/g) || []).length, 2, "both X-Y axis lists");
});
