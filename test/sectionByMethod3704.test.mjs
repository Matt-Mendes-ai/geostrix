// TASKS.csv #3704 (follow-up of #3691 (2)) — a section cut from a view that colours the density by a kept column (its method) draws the ribbons so, with the methods in its key.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { numericLayerLegendGroups } from "../src/lib/legendGroups.js";
import { sectionNumericLegendItems } from "../src/lib/sectionLegend.js";
import { fieldColourer, FIELD_PALETTE } from "../src/lib/fieldColours.js";
const numericLayerColor = () => "#336699"; // the viewer's own ramp colour: the by-field path does not use it

const rows = [];
for (let i = 0; i < 12; i++) rows.push({ hole_id: "H" + (i % 3), from: i, to: i + 1, value: 2.5 + i * 0.1, method: i < 7 ? "MEAS" : i < 10 ? "REG" : "LAB" });
const symbology = { sg: { byField: { field: "method", hidden: [] } } };

test("the key names the methods, in the 3D legend's colours, as 'Specific gravity: method: MEAS' rows, without the layer's row counts", () => {
  const groups = numericLayerLegendGroups({ keys: ["sg"], layers: { sg: rows }, layerVisible: { sg: true }, isRowVisible: () => true, colorOf: numericLayerColor, symbology, clips: {}, fieldColours: true });
  const items = sectionNumericLegendItems(groups);
  assert.deepEqual(items.map(([n]) => n), ["Specific gravity: method: MEAS", "Specific gravity: method: REG", "Specific gravity: method: LAB"]);
  assert.deepEqual(items.map(([, c]) => c), FIELD_PALETTE.slice(0, 3), "the cool palette, not the zinc classes' amber");
  // the key as it was: a value ramp
  const ramp = sectionNumericLegendItems(numericLayerLegendGroups({ keys: ["sg"], layers: { sg: rows }, layerVisible: { sg: true }, isRowVisible: () => true, colorOf: numericLayerColor, symbology: {}, clips: {}, fieldColours: true }));
  assert.equal(ramp.length, 1);
  assert.ok(ramp[0][2]?.ramp);
});

test("the ribbons take the method's colour and leave out a hidden method", () => {
  const bf = fieldColourer({ byField: { field: "method", hidden: ["REG"] } }, rows);
  assert.equal(bf.colourOf(rows[0]), FIELD_PALETTE[0]);
  assert.equal(bf.shown(rows[0]), true);
  assert.equal(bf.shown(rows[8]), false);
  assert.equal(fieldColourer({}, rows), null, "no 'Colour by': coloured by value as before");
});

test("wiring: the section's primitives and key read it", () => {
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /const bf = meta\.numeric \? fieldColourer\(numericSymbology\[key\], layers\[key\]\) : null; \/\/ #3704/);
  assert.match(vm, /\(bf && !bf\.shown\(row\)\)\) return;/);
  assert.match(vm, /const color = bf \? bf\.colourOf\(row\) : meta\.numeric \? numericLayerColor\(key, row\.value, key === "sg"/);
  assert.match(vm, /clips: numericClip, fieldColours: true \/\* #3553 off; #3704/);
});
