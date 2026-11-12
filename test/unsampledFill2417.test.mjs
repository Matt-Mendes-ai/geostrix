// TASKS.csv #2417 / #2542 (reviews #2325 WA uranium, #2486 WA lithium) — unsampled metres inside a sampled hole: not known (left
// out, as before) or barren at a typed value; under 60 % sampled the dialogs ask; blocks above / below every informing sample flagged
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fillUnsampled, sampledShare, unsampledReady, defaultUnsampledMode } from "../src/lib/unsampledFill.js";
import { compositeDownhole } from "../src/lib/geochem.js";
import { estimateBlockModel } from "../src/lib/estimation.js";
import { cellsFromColumns } from "../src/lib/estimationCells.js";
import { gradeTonnageTable, gradeTonnageRows } from "../src/lib/gradeTonnage.js";

// A: 100 m, Li stored in %, sampled 20-30 m (0.8 %) and 50-60 m (1.2 %), Cu over 0-100 m; B: 80 m, no Li sample; C: no collar length
const collars = [{ hole_id: "A", max_depth: 100 }, { hole_id: "B", max_depth: 80 }, { hole_id: "C" }];
const assays = [
  { hole_id: "A", from: 20, to: 30, values: { Li: 0.8, Cu: 10 } },
  { hole_id: "A", from: 50, to: 60, values: { Li: 1.2 } },
  { hole_id: "A", from: 0, to: 20, values: { Cu: 5 } }, // assayed for Cu only: no Li there
  { hole_id: "B", from: 0, to: 80, values: { Cu: 3 } },
  { hole_id: "C", from: 4, to: 6, values: { Li: 0.5 } },
];
const eu = { Li: "%", Cu: "ppm" };

test("the share of the sampled holes' metres that carry the element; ask under 60 %", () => {
  const s = sampledShare(assays, collars, "Li", "%", eu);
  assert.equal(s.holes, 2); // B carries no Li: not counted
  assert.equal(s.drilledM, 106); // A 100 m; C has no length: its deepest sample (6 m)
  assert.equal(s.sampledM, 22);
  assert.equal(s.holesNoLength, 1);
  assert.equal(defaultUnsampledMode(s.share), ""); // 21 % sampled: no default, the user chooses
  assert.equal(defaultUnsampledMode(0.8), "unknown");
  assert.ok(!unsampledReady("", ""));
  assert.ok(unsampledReady("unknown", ""));
  assert.ok(!unsampledReady("barren", "")); // the value is typed, never chosen for the user
  assert.ok(unsampledReady("barren", "0"));
  assert.ok(!unsampledReady("barren", "-1"));
});

test("barren: the gaps of every hole carrying the element filled at the typed value, in the element's stored unit", () => {
  const f = fillUnsampled(assays, collars, "Li", "ppm", eu, 50); // 50 ppm typed, Li stored in %
  assert.equal(f.filledM, 80 + 4); // A: 0-20, 30-50, 60-100; C: 0-4
  assert.equal(f.holesFilled, 2);
  assert.ok(!f.fills.some((r) => r.hole_id === "B"));
  assert.deepEqual(f.fills.filter((r) => r.hole_id === "A").map((r) => [r.from, r.to]), [[0, 20], [30, 50], [60, 100]]);
  assert.ok(f.fills.every((r) => Math.abs(r.values.Li - 0.005) < 1e-12 && r.unsampledFill));
  assert.equal(assays.length, 5); // the project's rows are not touched
  // composited: the unsampled metres now composite at the barren value; not known: no composite there (#657)
  const before = compositeDownhole(assays, "Li", "%", eu, { length: 10 }).filter((c) => c.hole_id === "A");
  const after = compositeDownhole(f.assays, "Li", "%", eu, { length: 10 }).filter((c) => c.hole_id === "A");
  assert.deepEqual(before.map((c) => c.from), [20, 50]); // no composite where no Li was assayed (#657)
  assert.equal(after.length, 10);
  assert.ok(Math.abs(after[0].avgGrade - 0.005) < 1e-12);
  assert.ok(Math.abs(after.find((c) => c.from === 20).avgGrade - 0.8) < 1e-12);
  assert.equal(fillUnsampled(assays, collars, "Li", "%", eu, NaN).filledM, 0);
});

test("a block wholly above or below every sample informing it is flagged; grade-tonnage gives that metal's share", () => {
  // two vertical holes sampled from RL -20 to -40 (2 m composites); blocks from RL +10 down to -50
  const pts = [];
  for (const [hx, hole] of [[0, "H1"], [20, "H2"]]) for (let z = -21; z >= -39; z -= 2) pts.push({ x: hx, y: 0, z, value: 10, hole_id: hole, length: 2 });
  const bounds = { xmin: -5, xmax: 25, ymin: -5, ymax: 5, zmin: -50, zmax: 10 };
  const r = estimateBlockModel(pts, { bounds, cellSize: { dx: 10, dy: 10, dz: 10 }, searchRadius: 60, method: "idw2", noReach: true });
  const at = (z) => r.cells.filter((c) => Math.abs(c.z - z) < 1e-9);
  assert.ok(at(5).length && at(5).every((c) => c.beyond === "above")); // RL 0-10: above the highest sample (-21)
  assert.ok(at(-5).every((c) => c.beyond === "above")); // RL -10-0
  assert.ok(at(-15).every((c) => c.beyond === "above")); // RL -20 to -10: its base is above the highest composite centre (-21)
  assert.ok(at(-25).every((c) => c.beyond == null) && at(-35).every((c) => c.beyond == null)); // among the samples
  assert.ok(at(-45).length && at(-45).every((c) => c.beyond === "below")); // RL -50 to -40: under the lowest (-39)
  assert.equal(r.beyondCounts.above, at(5).length + at(-5).length + at(-15).length);
  assert.equal(r.beyondCounts.below, at(-45).length);
  // the worker's columns carry the same flag
  const col = estimateBlockModel(pts, { bounds, cellSize: { dx: 10, dy: 10, dz: 10 }, searchRadius: 60, method: "idw2", noReach: true, columns: true });
  assert.deepEqual(cellsFromColumns(col.columns).map((c) => c.beyond ?? null), r.cells.map((c) => c.beyond ?? null));
  // grade-tonnage: the metal share in flagged blocks, only for a model whose estimate flagged them
  const rows = gradeTonnageTable(r.cells, { cutoffs: [0], beyondKnown: true });
  const flagged = r.cells.filter((c) => c.beyond).length;
  assert.ok(Math.abs(rows[0].beyondShare - flagged / r.cells.length) < 1e-9); // equal grades and volumes: the block share
  assert.equal(gradeTonnageRows(rows, { vname: "Li" })[0].beyond_samples_metal_pct, Math.round((100 * flagged) / r.cells.length));
  assert.equal(gradeTonnageTable(r.cells, { cutoffs: [0] })[0].beyondShare, undefined); // an imported model: no column
});

test("the three tools read the choice and the estimate says where the metal is", () => {
  const e = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(e, /const filled = uns\.apply\(srcAssays\), runAssays = filled\.assays;/);
  assert.match(e, /intervals = compositeDownhole\(runAssays, symbol/);
  assert.match(e, /rawSampleIntervals\(runAssays, symbol/);
  assert.match(e, /\.\.\.uns\.params\(filled\), beyondFlagged: true/);
  assert.match(e, /!symbol \|\| !uns\.ready/);
  const v = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(v, /compositeDownhole\(filled\.assays, symbol/);
  const g = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(g, /resolveUnsampled\("gradeShell", \{ assays: srcAssays, collars, symbol, unit, elementUnits, logCtx: \{ layers, customLayers \} \}\)/); // #2721: and the logs one may pick
  assert.match(g, /intervals = compositeDownhole\(runAssays, symbol/);
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /<GradeShellUnsampled assays=\{assays\}/);
});
