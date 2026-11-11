// TASKS.csv #2354 — QAQC's detection-limit suggestion comes from the lab assays (not pXRF readings) and is printed without float noise
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suggestDetectionLimit, labAssays } from "../src/lib/qaqc.js";

test("the review's Fe: the lab's lowest is 0.02 %, a pXRF reading of 0.016349000000000002 % is not the lab's limit", () => {
  const assays = [
    { hole_id: "A", from: 0, to: 1, values: { Fe: 0.02 }, source: "assay" },
    { hole_id: "A", from: 1, to: 2, values: { Fe: 3.1 }, source: "assay" },
    { hole_id: "A", from: 0.5, to: 0.6, values: { Fe: 0.016349000000000002 }, source: "pXRF" },
  ];
  assert.deepEqual(suggestDetectionLimit(labAssays(assays), "Fe"), { limit: 0.02, basis: "min" });
  assert.equal(suggestDetectionLimit([{ values: { Fe: 0.016349000000000002 } }], "Fe").limit, 0.016349); // and no float noise
});

test("QAQC asks it of the lab assays", () => {
  const q = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(q, /suggestDetectionLimit\(labAssays\(assays\), symbol\)/);
});
