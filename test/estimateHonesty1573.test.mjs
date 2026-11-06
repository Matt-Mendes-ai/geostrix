// TASKS.csv #1573 (review #1497, Lawyers) — a second hole counts toward "min distinct holes" only when its weight is material;
// the result says the support split first; a CV over 150 % starts capped at P99; the Add button carries the interpolated share
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { materialHoles, MATERIAL_SHARE, DOMINANT_SHARE, estimateBlockModel } from "../src/lib/estimation.js";

test("material holes: a hole with under 5 % of the inverse-distance weight is not a second hole", () => {
  assert.ok(Math.abs(MATERIAL_SHARE - (1 - DOMINANT_SHARE)) < 1e-12);
  // the Lawyers block: eight composites of one hole 35 m away, eight of another 48 m away -> the far hole still carries
  // 8/48^2 / (8/35^2 + 8/48^2) = 35 % of the weight: material (it IS a second hole, with zeros that pull the grade down)
  const near = Array.from({ length: 8 }, () => ({ hole_id: "A", d2: 35 * 35, len: 2 }));
  const far = Array.from({ length: 8 }, () => ({ hole_id: "B", d2: 48 * 48, len: 2 }));
  assert.deepEqual([...materialHoles([...near, ...far], 2)].sort(), ["A", "B"]);
  // one composite of a hole 160 m away beside eight at 35 m: 1/160^2 / (8/35^2 + 1/160^2) = 0.6 %: not a second hole
  const token = [{ hole_id: "C", d2: 160 * 160, len: 2 }];
  assert.deepEqual([...materialHoles([...near, ...token], 2)], ["A"]);
  // at power 1 the same token carries 2.7 %: still under 5 %; at 1 m it is 100 % and A is the one that drops out
  assert.deepEqual([...materialHoles([...near, ...token], 1)], ["A"]);
  assert.deepEqual([...materialHoles([...near, { hole_id: "C", d2: 1, len: 2 }], 2)], ["C"]);
  assert.deepEqual([...materialHoles([], 2)], []);
});

test("min distinct holes 2 with the material rule: a far token is no second hole; a material one estimates the block", () => {
  // hole A: composites down a vertical hole at x = 0; hole B: one composite 150 m east; the block at 20 m east of A
  const A = Array.from({ length: 10 }, (_, i) => ({ x: 0, y: 0, z: -2 * i, value: 10, hole_id: "A", len: 2 }));
  const far = [{ x: 150, y: 0, z: -10, value: 0, hole_id: "B", len: 2 }];
  const nearB = [{ x: 40, y: 0, z: -10, value: 0, hole_id: "B", len: 2 }];
  const opts = { bounds: { xmin: 10, xmax: 30, ymin: -10, ymax: 10, zmin: -20, zmax: 0 }, cellSize: { dx: 20, dy: 20, dz: 20 }, method: "idw2", searchRadius: 200, minSamples: 1, maxSamples: 16, minHoles: 2, materialHoles: true };
  const withFar = estimateBlockModel([...A, ...far], opts);
  assert.equal(withFar.blocksEstimated, 0, "the 150 m token is not a second hole");
  const withNear = estimateBlockModel([...A, ...nearB], opts);
  assert.equal(withNear.blocksEstimated, 1);
  assert.ok(withNear.cells[0].value < 10 && withNear.cells[0].value > 0);
  const oneHole = estimateBlockModel([...A, ...far], { ...opts, minHoles: 1 });
  assert.equal(oneHole.blocksEstimated, 1, "min holes 1 does not use the rule");
  const off = estimateBlockModel([...A, ...far], { ...opts, materialHoles: false });
  assert.equal(off.blocksEstimated, 1, "the library's default keeps the old rule (#642 / #676)");
});

test("the modal: support split first, a P99 cap by default over CV 150 %, the Add button's interpolated share", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /None of these \{n\} blocks lies between holes: every one is extrapolated from the nearest holes\./);
  assert.match(m, /\{k\} of \{n\} blocks \(\{pct\}%\) lie between holes \(interpolated\); \{e\} are extrapolated beyond the data\./);
  assert.ok(m.indexOf("TASKS.csv #1573 — the support split first") < m.indexOf("{samplePointCount} sample point(s) placed"), "the split comes before the sample-points line");
  assert.match(m, /const p99 = lengthWeightedPercentile\(srcAssays, symbol, unit, elementUnits, 99\);/);
  assert.match(m, /capClearedFor\.current = Number\.isFinite\(v\) && v > 0 \? null : symbol;/);
  assert.match(m, /Add as block model \(\{pct\}% interpolated\)/);
  const e = readFileSync(new URL("../src/lib/estimation.js", import.meta.url), "utf8");
  assert.equal((e.match(/minHoles > 1 && wantMaterial \? materialHoles\(used, /g) || []).length, 2, "the estimator and the support classifier share the rule");
  assert.match(m, /const \[materialHoles, setMaterialHoles\] = useState\(true\);/); // on by default in the dialog
});
