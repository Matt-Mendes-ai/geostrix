// TASKS.csv #1679 — the element list follows the values present, not the import / remove history.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { elementsWithValues } from "../src/lib/presentElements.js";

const els = [{ symbol: "Cu" }, { symbol: "Si" }, { symbol: "Yb" }, { symbol: "Au" }];

test("an element with no value in any row is left out; the order stays", () => {
  const rows = [{ values: { Cu: 12, Au: NaN } }, { values: { Au: 0.004 } }, { values: {} }, {}];
  assert.deepEqual(elementsWithValues(els, rows).map((e) => e.symbol), ["Cu", "Au"]);
});

test("the same array when every element has a value; empty input passes through", () => {
  const all = [{ values: { Cu: 1, Si: 20 } }, { values: { Yb: 0.5, Au: 0.1 } }];
  assert.equal(elementsWithValues(els, all), els);
  assert.deepEqual(elementsWithValues([], all), []);
  assert.deepEqual(elementsWithValues(els, []), []);
});

test("the store hands out the present list, the diagram caption says why nothing plotted, the dialog lists empty columns", () => {
  const store = fs.readFileSync("src/lib/store.jsx", "utf8");
  assert.match(store, /assayElements: presentAssayElements, setAssayElements,/);
  assert.match(store, /useMemo\(\(\) => elementsWithValues\(assayElements, assays\), \[assayElements, assays\]\)/);
  assert.match(fs.readFileSync("src/modules/GeochemModule.jsx", "utf8"), /plottedCount === 0 && sourceRows\.length && !missingForDiagram\.length && diagram\.requires\.length/);
  assert.match(fs.readFileSync("src/components/AssayImportModal.jsx", "utf8"), /Empty on every row, so left unticked: \{list\} \(\{n\} columns\)\./);
});
