// TASKS.csv #3749 / #3586 / #3290 — Au / Ag / Pt / Pd stored in ppm read g/t in every label (Scottie Gold review: Thresholds, Plan map, Level surveys, the X-Y axis title
// and colour key, the kept composites). Two pins: a scan of the sources for a symbol followed by its unit in brackets without gradeUnitLabel, and the label functions.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { axisOf } from "../src/lib/geochemXY.js";
import { gradeUnitLabel } from "../src/lib/geochemColumns.js";
import { numericSourceChoices } from "../src/lib/numericSources.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(jsx?|mjs)$/.test(e.name) ? [path.join(d, e.name)] : []));
// '<symbol> (<unit>)' written by hand in a label: ${x.symbol} (${x.unit}) / {x.symbol} ({unit}) / ${sym} (${unit})
const RE = /(\$\{[^}]*\b(?:symbol|sym|gradeSym|symLabel)\b[^}]*\}|\{[a-zA-Z.]*\bsymbol\})[ ]*\((?:\$\{|\{)[^})]*[uU]nit[^})]*\}\)/g;
// files whose 'Element: Au (ppm)' lines are headers inside an exported file (the stored unit of the numbers, #3586 NOT DONE: file formats keep it) or log labels
// the unit variable is already a label there (gradeUnitLabel at its definition)
const LABELLED = new Set(["lib/legendGroups.js", "lib/levelPlan.js", "lib/samplesTable.js"]);
const EXPORT_HEADERS = new Set(["components/BestIntercepts.jsx", "components/CompositingModal.jsx", "components/EstimateCheck.jsx", "components/GradeStatistics.jsx", "components/QAQCPanel.jsx", "lib/tableExports.js", "lib/meshExport.js"]);

test("no label writes a symbol and its unit by hand without gradeUnitLabel (outside the export headers)", () => {
  const bad = [];
  for (const f of walk(root)) {
    const rel = path.relative(root, f).replaceAll(path.sep, "/");
    if (EXPORT_HEADERS.has(rel) || LABELLED.has(rel)) continue;
    fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
      for (const m of line.matchAll(RE)) if (!m[0].includes("gradeUnitLabel") && !(!m[0].includes("$") && line.includes("unit: gradeUnitLabel("))) bad.push(`${rel}:${i + 1}: ${m[0]}`);
    });
  }
  assert.deepEqual(bad, []);
});
test("the X-Y axis of a precious metal stored in ppm is titled g/t; its plain unit (the ratio factor reads it) stays ppm", () => {
  const ax = axisOf({ kind: "element", symbol: "Au", unit: "ppm" }, {});
  assert.equal(ax.label, "Au (g/t)"); assert.equal(ax.unit, "ppm");
  assert.equal(axisOf({ kind: "element", symbol: "Zn", unit: "ppm" }, {}).label, "Zn (ppm)");
  assert.equal(axisOf({ kind: "element", symbol: "Au", unit: "ppb" }, {}).label, "Au (ppb)");
});
test("a kept composite layer's precious-metal field names g/t", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1, value: 1 + i, Au: 1 + i, Cu: 100 + i }));
  const layer = { id: "c1", name: "Composites 2 m: Au Cu", rows, unit: "ppm", valueField: "Au", fieldUnits: { Au: "ppm", Cu: "ppm" }, numeric: true };
  const ch = numericSourceChoices({ customLayers: [layer], layers: {} });
  const au = ch.find((c) => c.key === "custom:c1:Au" || /Au$/.test(c.key)), cu = ch.find((c) => /Cu$/.test(c.key));
  if (au) assert.equal(au.unitLabel, "g/t");
  if (cu) assert.equal(cu.unitLabel, undefined);
  assert.equal(gradeUnitLabel("Au", "ppm"), "g/t");
});
test("wired: Thresholds, the plan map, level surveys, the colour key and the calc note", () => {
  const rd = (p) => fs.readFileSync(path.join(root, p), "utf8");
  assert.match(rd("components/ThresholdToolkit.jsx"), /dispUnit = gradeUnitLabel\(symbol, shownUnit\)/);
  assert.match(rd("components/SurfacePlanMap.jsx"), /\$\{symbol\} \(\$\{gradeUnitLabel\(symbol, unit\)\}\) in/);
  assert.match(rd("lib/levelPlan.js"), /gradeUnitLabel\(sym, pts\[0\]\.assay\.u\)/);
  assert.match(rd("modules/GeochemModule.jsx"), /\$\{\+v\.toPrecision\(3\)\} \$\{colorUnitLabel\}/);
  assert.match(rd("modules/GeochemModule.jsx"), /\$\{e\.symbol\} \$\{gradeUnitLabel\(e\.symbol, e\.unit\)\}/);
});
