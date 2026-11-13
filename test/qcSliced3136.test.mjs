// TASKS.csv #3136 (the rest of #3099, WA iron) — Data QC runs a slice at a time: the three heavy checks (assays, survey, interval logs) pause
// every few thousand rows / few hundred holes, the dialog keeps painting and says how far it is, and the issues are exactly those of the
// one-block run.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runDataQC, runDataQCSliced, runDataQCSteps } from "../src/lib/dataQC.js";

// 1,200 holes with surveys, logs and assays, and a few planted problems of each kind
function project() {
  const collars = [], survey = [], litho = [], assays = [];
  for (let h = 0; h < 1200; h++) {
    const id = `H${h}`;
    collars.push({ hole_id: id, x: h * 25, y: 0, z: 400, azimuth: 0, dip: 60, length: 60 });
    for (let d = 0; d <= 60; d += 30) survey.push({ hole_id: id, depth: d, azimuth: h === 7 && d === 30 ? 120 : 0, dip: 60 });
    for (let d = 0; d < 60; d += 6) litho.push({ hole_id: id, from: d, to: h === 9 && d === 12 ? 20 : d + 6, value: d < 30 ? "BIF" : "SH" });
    for (let d = 0; d < 60; d += 2) assays.push({ hole_id: id, from: d, to: d + 2, values: { Fe: h === 11 && d === 4 ? -1 : 50, SiO2: 10 } });
  }
  assays.push({ hole_id: "NOPE", from: 0, to: 2, values: { Fe: 40 } });
  return { project: { name: "t" }, collars, survey, layers: { litho }, boundaries: [], assays };
}
const key = (r) => JSON.stringify(r.issues.map((i) => [i.severity, i.category, i.holeId, i.message]));

test("the sliced run gives exactly the one-block run's issues, and reports its four stages", async () => {
  const args = project(), whole = runDataQC(args), steps = [];
  assert.ok(whole.issues.length >= 4, "the planted problems are found");
  const sliced = await runDataQCSliced(args, { sliceMs: 1, onProgress: (p) => steps.push(p.step) });
  assert.equal(key(sliced), key(whole));
  assert.deepEqual(sliced.summary, whole.summary);
  assert.deepEqual(steps, [1, 2, 3, 4]);
});

test("it pauses often: 36,000 assay rows and 1,200 holes give many short steps", () => {
  const g = runDataQCSteps(project());
  let n = 0, r;
  do { r = g.next(); n++; } while (!r.done);
  assert.ok(n > 30, `${n} pauses`);
});

test("a newer run (or closing the dialog) cancels: the promise resolves null", async () => {
  let stop = false;
  const p = runDataQCSliced(project(), { sliceMs: 0, cancelled: () => stop });
  stop = true;
  assert.equal(await p, null);
});

test("wiring: the dialog runs the sliced check, shows its progress, and a newer run supersedes the one under way", () => {
  const s = fs.readFileSync(new URL("../src/components/DataQCModal.jsx", import.meta.url), "utf8");
  assert.match(s, /runDataQCSliced\(qcArgs\(\), \{ onProgress: \(p\) => \{ if \(runGen\.current === gen\) setProgress\(p\); \}, cancelled: \(\) => runGen\.current !== gen \}\)/);
  assert.match(s, /useEffect\(\(\) => \(\) => \{ runGen\.current\+\+; \}, \[\]\);/);
  assert.match(s, /<button onClick=\{check\} disabled=\{!!progress\}/);
  const q = fs.readFileSync(new URL("../src/lib/dataQC.js", import.meta.url), "utf8");
  for (const f of ["validateSurveyAndTrajectorySteps", "validateIntervalLayerSteps", "validateAssaysSteps"]) assert.match(q, new RegExp(`function\\* ${f}\\(`));
});
