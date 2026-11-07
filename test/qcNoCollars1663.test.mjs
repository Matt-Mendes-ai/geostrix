// TASKS.csv #1663 — with no collars, Data QC's interval checks run (#1810), but each interval, point and assay row of a hole with no
// collar gave its own error: thousands of identical lines over the overlaps and gaps. One error per hole, with the count.
import test from "node:test";
import assert from "node:assert/strict";
import { runDataQC } from "../src/lib/dataQC.js";

test("interval checks run without collars, and a hole with no collar is named once per layer", () => {
  const layers = { litho: [{ hole_id: "AXE-23-001", from: 0, to: 10, value: "AND" }, { hole_id: "AXE-23-001", from: 8, to: 20, value: "TUFF" }, { hole_id: "AXE-23-001", from: 25, to: 22, value: "DYK" }, { hole_id: "AXE-23-002", from: 0, to: 5, value: "AND" }] };
  const assays = Array.from({ length: 40 }, (_, i) => ({ hole_id: "AXE-23-001", from: i, to: i + 1, values: { Au: 0.1 } }));
  const r = runDataQC({ project: {}, collars: [], survey: [], layers, boundaries: [], assays });
  const msgs = (r.issues || r).map((i) => String(i.message));
  assert.ok(msgs.some((m) => /Overlapping intervals: 0–10m/.test(m)));
  assert.ok(msgs.some((m) => /from \(25\) is greater than to \(22\)/.test(m)));
  const orphanLines = msgs.filter((m) => /no matching collar/.test(m));
  assert.deepEqual(orphanLines.sort(), [
    "3 intervals reference hole \"AXE-23-001\", which has no matching collar.",
    "40 assay intervals reference hole \"AXE-23-001\", which has no matching collar.",
    "Interval references hole \"AXE-23-002\", which has no matching collar.",
  ].sort());
});
