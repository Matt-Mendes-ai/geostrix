// TASKS.csv #1673 / #1674 (review #1645, Copley) — pXRF readings stay out of the grade tools, whatever their QC toggle says
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { excludeQAQC, labAssays, isPxrfRow } from "../src/lib/qaqc.js";

const rows = [
  { hole_id: "COP-23-0001", from: 0, to: 1, values: { Cu: 7899 }, source: "assay" },
  { hole_id: "COP-23-0001", from: 0.5, to: 0.51, values: { Cu: 5860 }, source: "pXRF" },
  { hole_id: "COP-23-0001", from: 1, to: 2, values: { Cu: 120 } }, // older projects: no source = lab
];

test("excludeQAQC and labAssays leave pXRF out; rows without a source are lab", () => {
  assert.equal(isPxrfRow(rows[1]), true);
  assert.deepEqual(excludeQAQC(rows).map((r) => r.values.Cu), [7899, 120]);
  assert.deepEqual(labAssays(rows).map((r) => r.values.Cu), [7899, 120]);
});

test("the grade dialogs take lab assays at their input and say how many pXRF readings they left out", () => {
  for (const f of ["BestIntercepts", "CompositingModal", "GradeEstimationModal", "GradeStatistics"]) {
    const s = readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8");
    assert.ok(s.includes("const assays = useMemo(() => labAssays(assaysIn), [assaysIn]), pxrfLeft ="), f);
    assert.ok(s.includes("{pxrfLeft > 0 && <div"), f);
  }
  const c = readFileSync(new URL("../src/components/CorrelationMatrix.jsx", import.meta.url), "utf8");
  assert.ok(c.includes("const labRows = useMemo(() => (surface ? allAssays : labAssays(allAssays))") && c.includes("const assays = includeQAQC || surface || qaqcCount === 0 ? labRows : qcFree;") /* #2904 */); // #1799: drill assays still lab-only; surface samples are their own rows
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes("const rows = labRows.map((a) => {"), "Classify uses lab assays only");
});
