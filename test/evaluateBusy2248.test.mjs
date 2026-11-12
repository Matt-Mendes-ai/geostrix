// TASKS.csv #2248 — Evaluate block model onto the drillholes: a busy line before the work, the time it took after, no second run while
// one is going; and the sampling itself stays quick (36,000 cells x 245 surveyed holes)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sampleModelOnHoles } from "../src/lib/voxelSample.js";
const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");

test("#2248 the busy line, the time and the guard", () => {
  assert.match(g, /const evaluateOnHoles = async \(model\) => \{\r?\n\s+if \(evaluatingRef\.current\) return;/);
  assert.match(g, /tr\("Evaluating \\"\{name\}\\" \(\{cells\} cells\) along \{holes\} hole\(s\)…"/);
  assert.match(g, /await new Promise\(\(r\) => setTimeout\(r, 30\)\);/);
  assert.match(g, /finally \{ evaluatingRef\.current = false; \}/);
  assert.match(g, /tr\("\(\{s\} s\)", \{ s: secs < 10 \? secs\.toFixed\(1\) : Math\.round\(secs\) \}\)/);
});

test("#2248 36,000 cells along 245 surveyed holes in well under the reviewed 31 s", () => {
  // SYNTHETIC: 10 m blocks, holes with a survey station every 5 m (dip positive down, as stored)
  const cells = [];
  for (let i = 0; i < 60; i++) for (let j = 0; j < 30; j++) for (let k = 0; k < 20; k++) cells.push({ x: 5 + i * 10, y: 5 + j * 10, z: 205 - k * 10, dx: 10, dy: 10, dz: 10, value: i + j + k });
  const collars = [], survey = [];
  for (let h = 0; h < 245; h++) { const id = `H${h}`; collars.push({ hole_id: id, x: (h % 35) * 17, y: Math.floor(h / 35) * 40, z: 210, length: 400 }); for (let d = 0; d <= 400; d += 5) survey.push({ hole_id: id, depth: d, dip: 60 - d / 50, azimuth: 90 + d / 40 }); }
  const t0 = performance.now();
  const r = sampleModelOnHoles({ model: { cells }, collars, survey, desurveyMethod: "minimum_curvature" });
  const ms = performance.now() - t0;
  assert.ok(r.rows.length > 5000 && r.holes > 200, `${r.rows.length} rows, ${r.holes} holes`);
  assert.ok(ms < 8000, `${Math.round(ms)} ms`); // ~0.2 s alone; generous for a loaded machine
});
