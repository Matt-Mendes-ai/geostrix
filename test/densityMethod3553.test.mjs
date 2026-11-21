// TASKS.csv #3553 (Fireweed rehearsal, Macpass) — the density's kept method column (MEAS / REG / LAB-SPG04): colour a numeric hole layer by it, hide
// a value, list the values and counts in the layer panel and the 3D legend, and show the kept columns in the layer's row table.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keptTextFields, fieldColourer, fieldValueOf } from "../src/lib/fieldColours.js";
import { inspectorColumns, keptColumnNames } from "../src/lib/inspectorColumns.js";
import { numericLayerLegendGroups } from "../src/lib/legendGroups.js";

const rows = [];
for (let i = 0; i < 60; i++) rows.push({ hole_id: `H${i % 4}`, from: i, to: i + 1, value: 2.7 + (i % 7) * 0.1, method: i < 40 ? "MEAS" : i < 55 ? "REG" : "LAB-SPG04", low_recovery: i % 10 === 0 ? "Y" : "", comment: `note ${i}`, sg_lab_no: String(1000 + i), _src: "sg.csv" });

test("the kept text columns: method and low_recovery (with its blanks), not a number column nor a comment per row", () => {
  const f = keptTextFields(rows);
  assert.deepEqual(f.map((x) => x.field), ["low_recovery", "method"]);
  assert.deepEqual(f.find((x) => x.field === "method").values, [["MEAS", 40], ["REG", 15], ["LAB-SPG04", 5]]);
  assert.deepEqual(f.find((x) => x.field === "low_recovery").values, [["", 54], ["Y", 6]]);
});

test("colour by method: one colour per value, a hidden value is not shown, an unknown field colours by the value", () => {
  assert.equal(fieldColourer(null, rows), null);
  assert.equal(fieldColourer({ byField: { field: "nope" } }, rows), null);
  const c = fieldColourer({ stops: [], byField: { field: "method", hidden: ["REG"] } }, rows);
  const meas = rows[0], reg = rows[45], lab = rows[58];
  assert.notEqual(c.colourOf(meas), c.colourOf(reg));
  assert.notEqual(c.colourOf(meas), c.colourOf(lab));
  assert.equal(c.shown(meas), true);
  assert.equal(c.shown(reg), false);
  assert.equal(fieldValueOf({ method: " REG " }, "method"), "REG");
  assert.deepEqual(c.values.map((v) => [v.value, v.n, v.hidden]), [["MEAS", 40, false], ["REG", 15, true], ["LAB-SPG04", 5, false]]);
});

test("the 3D legend lists the shown values with counts; the section ribbons' legend keeps the ramp", () => {
  const sym = { sg: { byField: { field: "method", hidden: ["REG"] } } };
  const args = { keys: ["sg"], layers: { sg: rows }, layerVisible: { sg: true }, colorOf: () => "#000", symbology: sym };
  const [g] = numericLayerLegendGroups(args);
  assert.deepEqual(g.items.map((it) => it[0]), ["method: MEAS (40)", "method: LAB-SPG04 (5)"]);
  const [r] = numericLayerLegendGroups({ ...args, fieldColours: false });
  assert.ok(r.ramp && !r.items.length);
});

test("the row table shows the kept columns by their own names", () => {
  assert.deepEqual(keptColumnNames(rows), ["method", "low_recovery", "comment", "sg_lab_no"]);
  const cols = inspectorColumns("sg", rows);
  const kept = cols.filter((c) => c.kept);
  assert.deepEqual(kept.map((c) => c.label), ["method", "low_recovery", "comment", "sg_lab_no"]);
  assert.equal(kept[0].get(rows[45]), "REG");
  assert.ok(!cols.some((c) => c.label === "_src"));
});

test("the wiring: the 3D build, the layer panel, the section legend", () => {
  const s = readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8");
  assert.match(s, /fieldColourer\(numericSymbology\?\.\[k\], layers\[k\]\)/);
  assert.equal((s.match(/ bf \? bf\.colourOf\(row\) : meta\.numeric \?/g) || []).length, 3, "the intervals (straight and bent) and the points"); // after #3941's rb (a number field) choice
  assert.equal((s.match(/&& \(!bf \|\| bf\.shown\(r\)\)/g) || []).length, 2);
  const p = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.match(p, /<FieldColourPanel rows=\{rows\} sym=\{numericSym\} onChange=\{onNumericSymChange\}>/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /clips: numericClip, fieldColours: true \/\* #3553 off; #3704 — the key names the methods the ribbons are coloured by \*\/ \}\)\)\); \} \/\/ TASKS\.csv #3377/); // #3704: the section follows the 3D view
});
