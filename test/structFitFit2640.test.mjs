// TASKS.csv #2640 Stage 2 — the fit's request and result on the app's side (python-sidecar structfit.run_fit is checked by
// python-sidecar/tests/test_structfit.py): the readings required, at most 8 points, each point's own distance, the rounds capped; the result back
// in project coordinates with the labels; the audit CSV; the record with the fitted heights. SYNTHETIC records only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFitRequest, fitRows, fitPointsCsv, recordWithFit, FIT_STOPPED, MAX_FIT_POINTS } from "../src/lib/structFit.js";

const O = { x: 540000, y: 4930000, z: 1000 };
const pts = (z0, n, holes = 0) => Array.from({ length: n }, (_, i) => ({ x: O.x + 300 + i * 150, y: O.y + 500, z: O.z + z0 - i * 5, hole_id: i < holes ? `DH-23-00${i}` : null, nugget: null }));
const record = () => ({
  at: "2026-11-17T00:00:00Z", tool: "Stack model", trendFrame: false, origin: O, extent: [0, 2000, 0, 2000, -1000, 0], resolution: [24, 24, 24],
  surfaces: [
    { name: "top_B", fault: false, points: pts(-200, 6, 2), orientations: [{ x: O.x + 1000, y: O.y + 1000, z: O.z - 200, dip: 10, azimuth: 90 }] },
    { name: "top_C", fault: false, points: pts(-800, 5), orientations: [{ x: O.x + 1000, y: O.y + 1000, z: O.z - 800, dip: 5, azimuth: 90 }] },
  ],
});
const stations = [[O.x + 100, O.y + 100, O.z + 30], [O.x + 900, O.y + 600, O.z + 32], [O.x + 1800, O.y + 1700, O.z + 31]];
const base = { record: record(), method: "grav", stations, uncertainty: { floor: "0.05", percent: "" }, props: { 1: "2.67", 2: "2.9", 3: "3.1" }, maxM: "100" };

test("#2640 Stage 2 the fit's request: the readings, the mode, the rounds, each point's own distance", () => {
  const b = buildFitRequest({ ...base, observed: [1, 2, 3], movable: [{ surface: "top_B", index: 3 }, { surface: "top_B", index: 4, maxM: 40 }] }, { maxIter: 20 });
  assert.equal(b.problems, undefined);
  assert.equal(b.request.mode, "fit");
  assert.equal(b.request.maxIter, 8, "capped at 8 rounds");
  assert.deepEqual(b.request.observed, [1, 2, 3]);
  assert.deepEqual(b.request.movable.map((m) => m.maxM), [100, 40], "a point's own distance when it has one");
  assert.equal(b.request.model.surfaces[0].points[0].hole_id, "DH-23-000", "drillhole contacts go with their hole id: the engine keeps them where they are");
});

test("#2640 Stage 2 what the fit refuses: no readings, more than 8 points, and everything the sensitivity pass refuses", () => {
  assert.match(buildFitRequest({ ...base, movable: [{ surface: "top_B", index: 3 }] }).problems.join(" "), /needs the survey's readings/);
  const nine = Array.from({ length: 9 }, () => ({ surface: "top_B", index: 3 }));
  assert.match(buildFitRequest({ ...base, observed: [1, 2, 3], movable: nine }).problems.join(" "), new RegExp(`at most ${MAX_FIT_POINTS} points`));
  assert.match(buildFitRequest({ ...base, observed: [1, 2, 3], movable: [{ surface: "top_B", index: 3 }], uncertainty: { floor: "" } }).problems.join(" "), /uncertainty floor/);
});

test("#2640 Stage 2 the result in project coordinates, the audit CSV, the record with the fitted heights", () => {
  const result = { points: [
    { surface: "top_B", index: 3, x: 750, y: 500, zStart: -215, z: -175.5, movedM: 39.5, maxM: 100, constrained: true, perM: 0.3 },
    { surface: "top_C", index: 2, x: 600, y: 500, zStart: -810, z: -810, movedM: 0, maxM: 100, constrained: false, perM: 0.002 },
  ], stopped: "fit" };
  const rows = fitRows(result, record());
  assert.deepEqual([rows[0].x, rows[0].y, rows[0].zStart, rows[0].z], [O.x + 750, O.y + 500, O.z - 215, O.z - 175.5]);
  assert.equal(rows[1].constrained, false);
  const csv = fitPointsCsv(rows).trim().split("\n");
  assert.equal(csv[0], "surface,point,x,y,z_start,z_fitted,moved_m,max_m,constrained");
  assert.equal(csv[1], `top_B,4,${(O.x + 750).toFixed(2)},${(O.y + 500).toFixed(2)},${(O.z - 215).toFixed(2)},${(O.z - 175.5).toFixed(2)},39.50,100.00,yes`);
  const fitted = recordWithFit(record(), rows);
  assert.equal(fitted.surfaces[0].points[3].z, O.z - 175.5, "the fitted height");
  assert.equal(fitted.surfaces[1].points[2].z, record().surfaces[1].points[2].z, "a point the survey does not constrain stays");
  assert.equal(fitted.surfaces[0].points[0].hole_id, "DH-23-000", "drillhole contacts untouched");
  assert.equal(fitted.fittedFrom, "2026-11-17T00:00:00Z");
  assert.ok(FIT_STOPPED.fit && FIT_STOPPED["no point is constrained"]);
});

test("#2640 Stage 2 the engine: the fit job beside the sensitivity pass, validated, the drillhole contacts read from the request as sent", () => {
  const py = readFileSync(new URL("../python-sidecar/app/geophys/structfit.py", import.meta.url), "utf8");
  assert.match(py, /if req\.get\("mode"\) == "fit":\n\s+return run_fit\(req, progress\)/);
  assert.match(py, /contacts = _contacts\(req\["model"\]\)/);
  assert.match(py, /why = checks\(s_try\)/);
  const main = readFileSync(new URL("../python-sidecar/app/main.py", import.meta.url), "utf8");
  assert.match(main, /if req\.get\("mode"\) == "fit":\n\s+from app\.geophys\.structfit import MAX_FIT_POINTS, MAX_FIT_ITER/);
});

test("#2640 Stage 2 the panel: the fit offered after a pass with seen points, on those points only, its result and the audit CSV", () => {
  const p = readFileSync(new URL("../src/components/StructFitPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const seenPoints = \(out\?\.rows \|\| \[\]\)\.filter\(\(r\) => r\.verdict === "seen"\)\.slice\(0, MAX_FIT_POINTS\);/);
  assert.match(p, /movable: seenPoints\.map\(\(r\) => \(\{ surface: r\.surface, index: r\.index, maxM: r\.maxM \}\)\)/);
  assert.match(p, /\{seenPoints\.length > 0 && !busy && \(/);
  assert.match(p, /the result is one geometry that fits the survey to the stated uncertainty, not the answer/);
  assert.match(p, /content: fitPointsCsv\(fit\.rows\)/);
});
