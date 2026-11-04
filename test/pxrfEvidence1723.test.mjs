// TASKS.csv #1723 (review #1645, Copley) — pXRF readings are not drill grades: the overlay's grade sources are the lab elements,
// pXRF is offered apart, and an element with no lab value is not listed
import test from "node:test";
import assert from "node:assert/strict";
import { elementsWithValues, holeGradePoints } from "../src/lib/evidenceSources.js";
import { excludeQAQC, isPxrfRow } from "../src/lib/qaqc.js";

const units = { Cu: "ppm", Au: "ppb", Br: "ppm" };
const elements = [{ symbol: "Cu", unit: "ppm" }, { symbol: "Au", unit: "ppb" }, { symbol: "Br", unit: "ppm" }];
const assays = [
  { hole_id: "H1", from: 0, to: 2, values: { Cu: 120, Au: 5 } },
  { hole_id: "H1", from: 2, to: 4, values: { Cu: 161 } },
  { hole_id: "H1", from: 0, to: 0, source: "pXRF", values: { Cu: 5703, Br: 12 } }, // a 0 m screening reading
];

test("#1723 lab elements and pXRF elements are listed apart; Br (pXRF only) is no lab grade source", () => {
  const lab = excludeQAQC(assays), px = assays.filter(isPxrfRow);
  assert.deepEqual(elementsWithValues(lab, elements, units).map((e) => e.symbol), ["Cu", "Au"]);
  assert.deepEqual(elementsWithValues(px, elements, units).map((e) => e.symbol), ["Cu", "Br"]);
  assert.deepEqual(elementsWithValues([], elements, units), []);
});

test("#1723 the lab grade along a hole is the lab value; the pXRF reading no longer wins its bin", () => {
  const traces = new Map([["H1", [{ md: 0, x: 0, y: 0, z: 0 }, { md: 10, x: 0, y: 0, z: -10 }]]]);
  const lab = holeGradePoints(excludeQAQC(assays), "Cu", "ppm", units, traces);
  assert.deepEqual(lab.map((p) => p.value), [161]);
  const px = holeGradePoints(assays.filter(isPxrfRow), "Cu", "ppm", units, traces);
  assert.deepEqual(px.map((p) => p.value), [5703]);
});
