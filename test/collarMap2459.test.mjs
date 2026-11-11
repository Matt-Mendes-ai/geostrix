// TASKS.csv #2459 / #2591 — the Maps plan drew every collar as the same black dot; now: colour by a collar field or a per-hole assay
// statistic, with a legend, and decluttered hole-id labels
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarColourFields, perHoleAssay, collarColouring, declutterLabels } from "../src/lib/collarMapStyle.js";

const collars = [];
const types = ["AC", "AC", "AC", "RC", "RC", "DD"];
for (let i = 0; i < 30; i++) collars.push({ hole_id: `H${i}`, x: i * 10, y: 0, z: 300, depth: 40 + i, dip: -60, azimuth: 90, Drill_Code: types[i % 6], Grid_RL: 300 + i * 0.37, Prospect: i < 15 ? "North" : "South" });

test("collar fields worth colouring by: categories (2-16 values) and numbers; geometry and ids are not offered", () => {
  const f = collarColourFields(collars);
  assert.deepEqual(f.map((x) => [x.key, x.kind]), [["Drill_Code", "category"], ["Grid_RL", "number"], ["Prospect", "category"]]);
  assert.deepEqual(collarColourFields([{ hole_id: "A", x: 1, y: 1 }]), []);
});

test("a category gets one colour per value, most common first, with counts", () => {
  const c = collarColouring(collars, { field: "Drill_Code" });
  assert.equal(c.kind, "category");
  assert.deepEqual(c.legend.map((l) => l.label), ["AC (15)", "RC (10)", "DD (5)"]);
  assert.equal(c.colourOf(collars[0]), c.legend[0].colour);
  assert.equal(c.colourOf(collars[5]), c.legend[2].colour);
  assert.equal(c.colourOf({ hole_id: "X" }), null); // no value: drawn as a grey ring
});

test("per hole: the highest value or the length-weighted mean; numbers in five quintile classes", () => {
  const assays = [
    { hole_id: "H0", from: 0, to: 1, values: { U: 100 } }, { hole_id: "H0", from: 1, to: 4, values: { U: 500 } },
    { hole_id: "H1", from: 0, to: 2, values: { U: 50 } }, { hole_id: "H1", from: 2, to: 3, values: { Li2O: 1.2 } },
  ];
  assert.deepEqual([...perHoleAssay(assays, "U", "max")], [["H0", 500], ["H1", 50]]);
  assert.deepEqual([...perHoleAssay(assays, "U", "mean")], [["H0", 400], ["H1", 50]]); // (100 x 1 + 500 x 3) / 4
  const vals = new Map(collars.map((c, i) => [c.hole_id, i * 10])); // 0 ... 290
  const c = collarColouring(collars, { values: vals });
  assert.equal(c.kind, "number");
  assert.equal(c.legend.length, 5);
  assert.equal(c.legend[0].label, "0 – 60");
  assert.equal(c.legend[4].label, "230 – 290");
  assert.equal(c.colourOf(collars[0]), c.legend[0].colour);
  assert.equal(c.colourOf(collars[29]), c.legend[4].colour);
  assert.notEqual(c.legend[0].colour, c.legend[4].colour);
  assert.equal(collarColouring(collars, { values: new Map() }), null);
});

test("labels that would overlap one already placed are left out", () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 60, y: 0 }, { x: 0, y: 20 }, { x: NaN, y: 0 }];
  assert.deepEqual(declutterLabels(pts, 50, 13).map((l) => l.i), [0, 2, 3]);
});

test("the plan wires the colour-by, the legend and the labels", () => {
  const src = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8");
  assert.match(src, /collarColouring\(collars, \{ values: perHoleAssay\(assays, key, kind\) \}\)/);
  assert.match(src, /for \(const l of declutterLabels\(pts, w, 13\)\)/);
  assert.match(src, /aria-label=\{tr\("Colour collars by"\)\}/);
});
