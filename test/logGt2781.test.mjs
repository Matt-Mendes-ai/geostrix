// TASKS.csv #2781 — per-hole grade × thickness / metres above a cut-off for a numeric downhole log (the gamma log), as #2653 does for assays
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { logIntervals, gtlRef, parseGtlRef, holeIntervalPoints } from "../src/lib/evidenceSources.js";
import { computeBestIntercepts } from "../src/lib/geochem.js";
import { holeTotals } from "../src/lib/accumulation.js";
import { evidenceDeps } from "../src/lib/evidenceCache.js";

test("a point log becomes intervals to the next reading (the last as long as the median step); an interval log stays", () => {
  const pts = [{ hole_id: "A", depth: 0.0, value: 50 }, { hole_id: "A", depth: 0.5, value: 600 }, { hole_id: "A", depth: 1.0, value: 700 }, { hole_id: "A", depth: 1.5, value: 40 }, { hole_id: "A", depth: 2.0, value: "x" }];
  assert.deepEqual(logIntervals(pts, "value").map((r) => [r.from, r.to, r.values.v]), [[0, 0.5, 50], [0.5, 1, 600], [1, 1.5, 700], [1.5, 2, 40]]);
  assert.deepEqual(logIntervals([{ hole_id: "B", from: 2, to: 4, eU: "350" }], "eU").map((r) => [r.from, r.to, r.values.v]), [[2, 4, 350]]);
});

test("the gamma log's GT and metres at or above 200 per hole, by hand", () => {
  const vertical = (x) => [{ x, y: 0, z: 100, md: 0 }, { x, y: 0, z: 50, md: 50 }];
  const traces = new Map([["A", vertical(0)], ["B", vertical(100)]]);
  const log = [];
  for (let d = 0; d < 10; d += 0.5) log.push({ hole_id: "A", depth: d, value: d >= 4 && d < 6 ? 500 : 30 }); // 2 m at 500 = GT 1000
  for (let d = 0; d < 10; d += 0.5) log.push({ hole_id: "B", depth: d, value: 30 }); // nothing at 200: a 0
  const iv = logIntervals(log, "value");
  const gt = holeIntervalPoints(iv, "v", "ppm", { v: "ppm" }, traces, { how: "gt", cutoff: 200, computeBestIntercepts, holeTotals });
  assert.deepEqual(Object.fromEntries(gt.map((p) => [p.hole_id, p.value])), { A: 1000, B: 0 });
  const m = holeIntervalPoints(iv, "v", "ppm", { v: "ppm" }, traces, { how: "m", cutoff: 200, computeBestIntercepts, holeTotals });
  assert.deepEqual(Object.fromEntries(m.map((p) => [p.hole_id, p.value])), { A: 2, B: 0 });
});

test("the ref and its cache; the pane offers one entry per numeric log and builds the card", () => {
  const ref = gtlRef("custom:cl1:eU3O8_ppm", "gt", 200);
  assert.deepEqual(parseGtlRef(ref), { ref: "custom:cl1:eU3O8_ppm", how: "gt", cutoff: 200 });
  assert.equal(parseGtlRef("gt:U:gt:200"), null);
  const rows = [{ hole_id: "A" }], d = { customLayers: [{ id: "cl1", rows }], collars: [1], survey: [2], desurveyMethod: "m" };
  assert.deepEqual(evidenceDeps({ kind: "numeric", ref }, {}, d), [rows, d.collars, d.survey, d.desurveyMethod]);
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /key: `gtlpick:\$\{s\.ref\}`/);
  assert.match(p, /holeIntervalPoints\(logIntervals\(rows, field\), "v", "ppm", \{ v: "ppm" \}, traces/);
});
