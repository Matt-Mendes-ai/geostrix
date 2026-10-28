// TASKS.csv #1099 — Grade Statistics counts resolved segments (a repeated interval once), like the cap audit
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvedSegments, capAudit } from "../src/lib/geochem.js";

const units = { Au: "ppm" };
const assays = [
  { hole_id: "H1", from: 0, to: 1, values: { Au: 0.2 } },
  { hole_id: "H1", from: 1, to: 2, values: { Au: 1.0 } },
  { hole_id: "H1", from: 1, to: 2, values: { Au: 1.4 } }, // a repeat that disagrees: one metre, averaged
  { hole_id: "H1", from: 2, to: 3, values: { Au: -0.005 } }, // lab code, not an assay
  { hole_id: "H2", from: 0, to: 2, values: { Au: 0.5 } },
];

test("#1099 a repeated interval is one sample; negative codes are not samples", () => {
  const segs = resolvedSegments(assays, "Au", "ppm", units);
  assert.deepEqual(segs.map((s) => [s.hole_id, s.from, s.to, +s.value.toFixed(3)]), [["H1", 0, 1, 0.2], ["H1", 1, 2, 1.2], ["H2", 0, 2, 0.5]]);
  assert.equal(capAudit(assays, "Au", "ppm", units, 1).nSamples, 3); // the same samples the cap audit counts
});
