// TASKS.csv #3584 (follow-up of #3567) — Best intercepts reads the kept composites layers (Compositing > Keep as a layer in the project) as elements, at the composites' own length
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compositeSourceAssays, isCompositeLayer } from "../src/lib/compositeSources.js";
import { compositeLayerRows } from "../src/lib/compositeSet.js";
import { computeBestIntercepts } from "../src/lib/geochem.js";
import { excludeQAQC, labAssays } from "../src/lib/qaqc.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// two holes composited at 2 m: Zn 5, 6, 0.4 down A and 0.2, 0.3 down B (the shape Compositing's keepAsLayer writes)
const set = [
  { hole_id: "A", from: 0, to: 2, avgGrade: 5, values: { Zn: { grade: 5, coverage: 1 } }, density: 3.1 },
  { hole_id: "A", from: 2, to: 4, avgGrade: 6, values: { Zn: { grade: 6, coverage: 1 } }, density: 3.2 },
  { hole_id: "A", from: 4, to: 6, avgGrade: 0.4, values: { Zn: { grade: 0.4, coverage: 1 } } },
  { hole_id: "B", from: 0, to: 2, avgGrade: 0.2, values: { Zn: { grade: 0.2, coverage: 1 } } },
  { hole_id: "B", from: 2, to: 4, avgGrade: 0.3, values: { Zn: { grade: 0.3, coverage: 1 } } },
];
const layer = { id: "custom_1", name: "Composites 2 m: Zn", rows: compositeLayerRows(set, ["Zn"]), unit: "%", notes: "Composites of Zn at 2 m, min coverage 50 %, grades length-weighted" };

test("a kept composites layer is read as assay-shaped intervals of the composite's own length, named by the layer, in the layer's unit", () => {
  assert.equal(isCompositeLayer(layer), true);
  assert.equal(isCompositeLayer({ id: "x", name: "Gamma", rows: [], unit: "cps" }), false, "another numeric layer is not offered");
  const r = compositeSourceAssays([layer, { id: "x", name: "Gamma", rows: [{ hole_id: "A", from: 0, to: 1, value: 3 }], unit: "cps" }]);
  assert.deepEqual(r.assayElements, [{ symbol: "Composites 2 m: Zn", unit: "%" }]);
  assert.equal(r.assays.length, 5);
  assert.deepEqual(r.assays[1], { hole_id: "A", from: 2, to: 4, values: { "Composites 2 m: Zn": 6 }, source: "log" });
  assert.equal(compositeSourceAssays([]).assays.length, 0);
});

test("the intercept is cut on the composites: 4 m at 5.5 % over the 4 % cut-off in hole A, none in B; they survive the lab / QAQC filters", () => {
  const { assays, assayElements } = compositeSourceAssays([layer]);
  const A = excludeQAQC(labAssays(assays));
  assert.equal(A.length, 5, "composite rows are neither pXRF nor QAQC");
  const sym = assayElements[0].symbol, U = { [sym]: "%" };
  const rows = computeBestIntercepts(A, sym, "%", U, { cutoff: 4, maxInternalDilution: 0, minLength: 0 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hole_id, "A");
  assert.equal(rows[0].from, 0); assert.equal(rows[0].to, 4);
  assert.ok(Math.abs(rows[0].avgGrade - 5.5) < 1e-9, String(rows[0].avgGrade));
});

test("the Best intercepts dialog merges them into its element list and its assay table (source pins)", () => {
  const b = read("../src/components/BestIntercepts.jsx");
  assert.match(b, /const kept = useMemo\(\(\) => compositeSourceAssays\(keptLayers\), \[keptLayers\]\);/);
  assert.match(b, /\.\.\.kept\.assays\]/);
  assert.match(b, /kept\.assayElements\.filter\(/);
});
