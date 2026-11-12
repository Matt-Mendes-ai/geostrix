// TASKS.csv #2721 (split from #2626; Matt's decision 2026-11-11) — a continuous downhole log is the background for the unsampled metres only
// when the user PICKS it; the eU3O8 -> U factor is offered and stated, never applied silently; Grade-tonnage reports the metal from the log.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fillFromLog, logFactorOffer, unsampledReady } from "../src/lib/unsampledFill.js";
import { estimateBlockModel } from "../src/lib/estimation.js";
import { gradeTonnageTable } from "../src/lib/gradeTonnage.js";

// one hole, 40 m: U assayed 10-20 m only; a gamma eU3O8 log read every 5 m from 0 to 30 m
const collars = [{ hole_id: "A", x: 0, y: 0, z: 100, max_depth: 40 }];
const assays = [{ hole_id: "A", from: 10, to: 20, values: { U: 500 } }];
const log = [0, 5, 10, 15, 20, 25].map((f) => ({ hole_id: "A", from: f, to: f + 5, values: { eU3O8: 118 } }));

test("#2721: the gaps are filled from the picked log's readings x the factor; gaps it does not read stay not known", () => {
  const r = fillFromLog(assays, collars, "U", "ppm", { U: "ppm" }, log, "eU3O8", 1 / 1.1792);
  assert.equal(r.gapM, 30); // 0-10 and 20-40
  assert.equal(r.filledM, 20); // 0-10 and 20-30 have readings
  assert.equal(r.noReadingM, 10); // 30-40
  assert.ok(r.fills.every((f) => f.unsampledFill === "log" && Math.abs(f.values.U - 100.07) < 0.01), JSON.stringify(r.fills[0]));
  assert.ok(!r.fills.some((f) => f.from < 20 && f.to > 10), "sampled metres untouched");
  assert.equal(fillFromLog(assays, collars, "U", "ppm", { U: "ppm" }, log, "eU3O8", 0).filledM, 0, "no factor: nothing filled");
});

test("#2721: the documented factor is offered for eU3O8 / eU against U (or U reported as U3O8), never for anything else", () => {
  assert.deepEqual(logFactorOffer("Gamma eU3O8", "U", "ppm"), { factor: 0.848, from: "eU3O8", to: "U", ratio: 1.1792 });
  assert.deepEqual(logFactorOffer("eU3O8 (ppm)", "U", "ppm U3O8"), { factor: 1, from: "eU3O8", to: "U3O8" });
  assert.deepEqual(logFactorOffer("eU", "U", "ppm"), { factor: 1, from: "eU", to: "U" });
  assert.equal(logFactorOffer("Gamma eU3O8", "Th", "ppm"), null);
  assert.equal(logFactorOffer("Gamma (cps)", "U", "ppm"), null);
  assert.equal(unsampledReady("log", "", { source: null, factor: 1 }), false, "no log picked");
  assert.equal(unsampledReady("log", "", { source: { key: "x" }, factor: "" }), false, "no factor given");
  assert.equal(unsampledReady("log", "", { source: { key: "x" }, factor: "0.848" }), true);
});

test("#2721: a block's share of metal from the log follows its informing samples; Grade-tonnage reports it per cutoff", () => {
  // two holes: A's composites came from the log (logFrac 1), B's from assays
  const pts = [];
  for (let z = 99; z > 60; z -= 2) { pts.push({ hole_id: "A", x: 0, y: 0, z, value: 100, length: 2, logFrac: 1 }); pts.push({ hole_id: "B", x: 100, y: 0, z, value: 100, length: 2 }); }
  const r = estimateBlockModel(pts, { bounds: { xmin: -10, xmax: 110, ymin: -10, ymax: 10, zmin: 60, zmax: 100 }, cellSize: 20, method: "idw2", searchRadius: 200, logShare: true });
  const near = (x) => r.cells.filter((c) => Math.abs(c.x - x) < 1e-6);
  assert.ok(near(0).every((c) => c.fromLog > 0.9), "beside the logged hole");
  assert.ok(near(100).every((c) => (c.fromLog || 0) < 0.1), "beside the assayed hole");
  const gt = gradeTonnageTable(r.cells, { cutoffs: [0], density: 2, unit: "ppm", logKnown: true });
  assert.ok(gt[0].logShare > 0.3 && gt[0].logShare < 0.7, String(gt[0].logShare));
  assert.equal(gradeTonnageTable(r.cells, { cutoffs: [0], density: 2, unit: "ppm" })[0].logShare, undefined);
});

test("#2721: wiring: the picker lists the logs, the factor is only offered (a button), the estimate passes logShare, Grade-tonnage has its column", () => {
  const ch = fs.readFileSync("src/components/UnsampledChoice.jsx", "utf8");
  assert.match(ch, /<option value="log">\{tr\("from a downhole log I pick"\)\}<\/option>/);
  assert.match(ch, /onClick=\{\(\) => set\(\{ factor: String\(offer\.factor\) \}\)\}/);
  assert.match(ch, /set\(\{ logKey: e\.target\.value, factor: "" \}\)/, "a new log clears the factor");
  const est = fs.readFileSync("src/components/GradeEstimationModal.jsx", "utf8");
  assert.match(est, /\.\.\.\(logFills\.length \? \{ logShare: true \} : \{\}\)/);
  assert.match(est, /useUnsampled\("estimate", \{ assays: srcAssays, collars, symbol, unit, elementUnits, layers, customLayers \}\)/);
  const gtm = fs.readFileSync("src/components/GradeTonnageModal.jsx", "utf8");
  assert.match(gtm, /const logKnown = Number\(model\.params\?\.unsampledLogFilledM\) > 0;/);
  assert.match(fs.readFileSync("src/modules/viewer/modellingRuns.js", "utf8"), /resolveUnsampled\("gradeShell", \{ [^}]*logCtx: \{ layers, customLayers \} \}\)/);
});
