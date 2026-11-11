// TASKS.csv #1579 / #1580 / #1581 (review #1497, Lawyers) — the Grade estimation dialog froze the window 1.7-2.5 s on opening and 0.7-1.0 s
// per cap button: the cap statistics rebuilt every assay's segments with a JSON key per row (now built once per list and element, the
// JSON only for rows sharing a hole and depths), and the reach counts and cell-fit searches ran on the main thread (now in a worker,
// reachSummary). Its settings now come back when it is reopened; raw assays are called samples, not composites.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reachSummary, blockReach, densifyTraces, cellToFitReach, segmentReach, tracesToSegments } from "../src/lib/blockReach.js";
import { resolvedSegments, lengthWeightedPercentile, capAudit, compositeDownhole } from "../src/lib/geochem.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("reachSummary is what the dialog computed on the main thread", () => {
  // #2636 — counted from the trace segments (capsules), no longer from points densified along them: never more blocks than the old
  // count (the same quarter-cell margin, no gaps between points), never fewer than the blocks a point on the traces reaches
  const traces = [[{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -200 }], [{ x: 500, y: 0, z: 0 }, { x: 450, y: 30, z: -180 }]];
  const bounds = { xmin: -60, xmax: 560, ymin: -60, ymax: 100, zmin: -260, zmax: 40 };
  const cell3 = { dx: 5, dy: 5, dz: 5 }, radius = 40;
  const segs = tracesToSegments(traces, 5 / 4), so = { margin: 5 / 4, segments: true }; // the traces simplified to a quarter cell, the radius widened by it
  const exact = segmentReach(segs, bounds, cell3, radius, { margin: 5 / 4 });
  const s = reachSummary({ traces, bounds, cell3, radius, budget: 20000, maxBudget: 100000, from: 5, fit10: true });
  assert.equal(s.reach, exact.reach); assert.equal(s.tooBig, false);
  const d = densifyTraces(traces, Math.min(5, radius) / 2);
  const old = blockReach(d.points, bounds, cell3, radius, { margin: d.margin }), fine = blockReach(densifyTraces(traces, 0.05).points, bounds, cell3, radius);
  assert.ok(s.reach <= old.reach && s.reach >= fine.reach, `${fine.reach} <= ${s.reach} <= ${old.reach}`);
  assert.equal(s.fitCell, cellToFitReach(segs, bounds, radius, 20000, 5, so));
  assert.equal(s.fitCellMax, cellToFitReach(segs, bounds, radius, 100000, 5, so));
  assert.equal(s.fit10, cellToFitReach(segs, bounds, radius, 20000, 10, so));
  const fits = reachSummary({ traces, bounds, cell3, radius, budget: 1e7, maxBudget: 2e7, from: 5 });
  assert.equal(fits.fitCell, null, "under the budget: no fit asked"); assert.equal(fits.fit10, null);
  assert.equal(reachSummary({ traces, bounds, cell3, radius, budget: 10, from: 5, fitAllowed: false }).fitCell, null, "a block model's lattice is not refitted");
});

test("the cap statistics: duplicates still dropped, the same numbers, and cached per list and element", () => {
  const units = { Au: "ppm", Ag: "ppm" };
  const a = [
    { hole_id: "H1", from: 0, to: 2, values: { Au: 1, Ag: 5 } },
    { hole_id: "H1", from: 0, to: 2, values: { Au: 1, Ag: 5 } }, // an exact duplicate: dropped
    { hole_id: "H1", from: 0, to: 2, values: { Au: 3, Ag: 5 } }, // same depths, other values: an overlap, averaged
    { hole_id: "H1", from: 2, to: 6, values: { Au: 10, Ag: 1 } },
    { hole_id: "H2", from: 0, to: 1, values: { Au: 0.5 } },
  ];
  const segs = resolvedSegments(a, "Au", "ppm", units);
  assert.deepEqual(segs.map((s) => [s.hole_id, s.from, s.to, s.value]), [["H1", 0, 2, 2], ["H1", 2, 6, 10], ["H2", 0, 1, 0.5]]);
  assert.equal(resolvedSegments(a, "Au", "ppm", units), segs, "the same list and element: the cached segments");
  assert.ok(Object.isFrozen(segs));
  assert.notEqual(resolvedSegments(a, "Ag", "ppm", units), segs);
  assert.equal(lengthWeightedPercentile(a, "Au", "ppm", units, 50), 10); // 4 of 7 m are at 10
  const au = capAudit(a, "Au", "ppm", units, 5);
  assert.deepEqual([au.nSamples, au.nCapped, au.lenCapped], [3, 1, 4]);
  assert.ok(Math.abs(au.pctMetalRemoved - 100 * (40 - 20) / (4 + 40 + 0.5)) < 1e-9);
  // compositing drops the same exact duplicate (groupAssayRowsByHole shares the check)
  const comp = compositeDownhole(a, "Au", "ppm", units, { length: 100 });
  assert.ok(Array.isArray(comp.composites ?? comp));
});

test("wired: the worker, the counting state, the remembered settings, the samples wording", () => {
  const m = read("src/components/GradeEstimationModal.jsx");
  assert.ok(m.includes('import { makeReachClient } from "../lib/blockReachClient.js";') && !m.includes("blockReach(reachPts"));
  assert.ok(m.includes("disabled={!bounds || overLimit || reachPending || running || !symbol || !uns.ready /* #2417 */}"));
  assert.ok(m.includes('tr(", counting the blocks within {r} m of the drilling…", { r: reachRadius })'));
  assert.ok(read("src/lib/blockReach.worker.js").includes("reachSummary(reachArgsWithSolid(args))")); // #2422: a restricting solid is clipped first
  assert.ok(m.includes("lastEstimateSettings.set(settingsKey, remember.current)") && m.includes('const [method, setMethod] = useState(() => keep("method", "idw2"));'));
  assert.ok(m.includes('const [capValue, setCapValue] = useState(() => (sameElement ? keep("capValue", NaN) : NaN));'), "a cap belongs to its element");
  assert.ok(m.includes("composited={result.params.composited !== false}"));
  assert.ok(read("src/components/EstimateCheck.jsx").includes('tr("Sample mean (length-weighted, clustered)")'));
});
