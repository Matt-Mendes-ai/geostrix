// TASKS.csv #1049 — a kriged block model's CSV carries KV / NEAREST_M and its header the variogram and the applied per-hole cap
import test from "node:test";
import assert from "node:assert/strict";
import { blockModelRows, blockModelCsvTextSync, blockModelParamLines } from "../src/lib/blockModelExport.js";
import { toExportCsv } from "../src/lib/tabular.js";

const model = { name: "Au OK", source: "estimate-ok", cells: [
  { x: 1, y: 2, z: 3, dx: 10, dy: 10, dz: 5, value: 0.52, nSamples: 12, nHoles: 3, support: "interpolated", supportIndex: 0.81, nearestSampleM: 7.346, kv: 0.0123456789 },
  { x: 11, y: 2, z: 3, dx: 10, dy: 10, dz: 5, value: 0.31, nSamples: 8, nHoles: 2, support: "extrapolated", supportIndex: 0.5, nearestSampleM: 21.5, kv: 0.04 },
], params: { element: "Au", unit: "ppm", method: "ok", maxSamples: 16, minHoles: 2, maxSamplesPerHole: 3,
  variogram: { model: "spherical", nugget: 0.1, sill: 1.2, range: 85, fitted: true, lagM: 12.5, frame: "isotropic" }, krigingBlocks: { kriged: 1500, exact: 2, negativeWeights: 40, fallbackIdw: 0, beyondRange: 120 } } };

test("#1049 KV and NEAREST_M columns, the same from both writers", () => {
  const rows = blockModelRows(model);
  assert.deepEqual([rows[0].KV, rows[0].NEAREST_M], [0.0123457, 7.35]);
  assert.equal(blockModelCsvTextSync(model), toExportCsv(rows));
  assert.match(blockModelCsvTextSync(model).split("\r\n")[0], /,KV,NEAREST_M$/);
});

test("#1049 the header names the variogram, the kriging counts and one applied per-hole cap", () => {
  const l = blockModelParamLines(model).join("\n");
  assert.match(l, /variogram: spherical, nugget 0\.1, sill 1\.2, range 85 m, fitted to the composites at run time \(lag 12\.5 m\), isotropic/);
  assert.match(l, /krigingBlocks: kriged 1500, exact 2, negativeWeights 40, fallbackIdw 0, beyondRange 120/);
  const caps = l.split("\n").filter((x) => x.startsWith("maxSamplesPerHole"));
  assert.deepEqual(caps, ["maxSamplesPerHole: 3 applied (entered 3; the smaller of: max samples / min holes = 8)"]);
  assert.match(l, /KV: the block's ordinary-kriging variance \(ppm squared\)/);
});
