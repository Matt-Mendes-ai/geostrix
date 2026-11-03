// TASKS.csv #1402 — the layer table's columns follow the data: Hole everywhere, description, intensity, percent
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectorColumns, inspectorCell } from "../src/lib/inspectorColumns.js";

const labels = (cols) => cols.map((c) => c.label);

test("lithology: Hole and Description shown, no empty 'extra' column", () => {
  const rows = [{ hole_id: "CCF24-PAD18-001", from: 0, to: 18, value: "OB", description: "Overburden composed of light brown clays" }, { hole_id: "CCF24-PAD18-002", from: 18, to: 30.5, value: "LMST" }];
  const cols = inspectorColumns("litho", rows);
  assert.deepEqual(labels(cols), ["Hole", "from/depth", "to", "value", "Description"]);
  assert.equal(inspectorCell(cols[0], rows[1]), "CCF24-PAD18-002");
  assert.equal(inspectorCell(cols[2], rows[1]), "30.50");
  assert.equal(inspectorCell(cols[4], rows[1]), "—");
  assert.ok(cols[4].wide);
});

test("structures keep their #1233 columns", () => {
  assert.deepEqual(labels(inspectorColumns("structure", [{ hole_id: "A", depth: 233.3, value: "Bedding", alpha: 52 }])), ["Hole", "from/depth", "value", "Dip", "Dip dir.", "α", "β"]);
});

test("structural zones get intensity and alpha; mineralization its percent", () => {
  assert.deepEqual(labels(inspectorColumns("structzone", [{ hole_id: "A", from: 1, to: 2, value: "FLT", intensity: "4", alpha: 40 }])), ["Hole", "from/depth", "to", "value", "Intensity", "α"]);
  assert.deepEqual(labels(inspectorColumns("mnlgy", [{ hole_id: "A", from: 1, to: 2, value: "PYR", extra: 3 }])), ["Hole", "from/depth", "to", "value", "%"]);
});

test("a layer without hole ids (an imported point set) has no Hole column", () => {
  assert.deepEqual(labels(inspectorColumns("geophys_pts", [{ from: 1, value: 2 }])), ["from/depth", "value"]);
});

test("LayerInspector draws the columns from the helper", () => {
  const src = readFileSync(new URL("../src/components/LayerInspector.jsx", import.meta.url), "utf8");
  assert.match(src, /inspectorColumns\(layerKey, rows\)/);
  assert.match(src, /columns\.map\(\(c\) => \{ const text = inspectorCell\(c, r\);/);
});
