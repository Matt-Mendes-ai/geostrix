// TASKS.csv #3014 part b — Grade-tonnage across a set of same-lattice models: limits on the set's other elements, and each member's mean over the
// blocks counted at each cutoff. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setJoin, applyLimits, memberMeans, memberMeanColumns } from "../src/lib/setLimits.js";
import { gradeTonnageTable } from "../src/lib/gradeTonnage.js";
import { estimateBlockModel } from "../src/lib/estimation.js";
import { blockModelLattice } from "../src/lib/estimationMeta.js";

const cell = (x, y, z, value, extra = {}) => ({ x, y, z, dx: 10, dy: 10, dz: 5, value, ...extra });
// four Fe blocks in a row; SiO2 on three of them (none at x = 35), Al2O3 on all four
const fe = [cell(5, 5, 2.5, 62), cell(15, 5, 2.5, 60), cell(25, 5, 2.5, 58), cell(35, 5, 2.5, 55)];
const si = [cell(5, 5, 2.5, 3), cell(15, 5, 2.5, 6), cell(25, 5, 2.5, 2)];
const al = [cell(5, 5, 2.5, 1), cell(15, 5, 2.5, 2), cell(25, 5, 2.5, 3), cell(35, 5, 2.5, 4)];
const lat = blockModelLattice({ cells: fe });
const join = setJoin(lat, [{ element: "SiO2", unit: "%", name: "SiO2 estimate", cells: si }, { element: "Al2O3", unit: "%", name: "Al2O3 estimate", cells: al }]);

test("members are joined by lattice index, not by exact coordinates", () => {
  assert.equal(join.valueAt(fe[0], 0), 3);
  assert.equal(join.valueAt({ ...fe[1], x: 15.0000001 }, 0), 6);
  assert.equal(join.valueAt(fe[3], 0), undefined); // SiO2 did not reach that block
  assert.equal(join.valueAt(fe[3], 1), 4);
  assert.deepEqual(join.members.map((m) => m.element), ["SiO2", "Al2O3"]);
});

test("a block counts only when it meets every limit; one with no value of a limited element is left out and counted", () => {
  const none = applyLimits(fe, join, [{ op: "max", value: "" }, { op: "max", value: "" }]);
  assert.equal(none.cells, fe, "no limit typed: the same blocks");
  const r = applyLimits(fe, join, [{ op: "max", value: "4" }, { op: "max", value: "" }]);
  assert.deepEqual(r.cells.map((c) => c.value), [62, 58]); // SiO2 6 fails; the block with no SiO2 is missing, not failed
  assert.equal(r.failed, 1);
  assert.deepEqual(r.missing, [1, 0]);
  const both = applyLimits(fe, join, [{ op: "max", value: 4 }, { op: "max", value: 2.5 }]);
  assert.deepEqual(both.cells.map((c) => c.value), [62]);
  const floor = applyLimits(fe, join, [{ op: "min", value: 3 }, null]);
  assert.deepEqual(floor.cells.map((c) => c.value), [62, 60]);
  assert.equal(applyLimits(fe, join, [null, { op: "max", value: 0 }]).cells.length, 0); // a limit of 0 is a limit
});

test("each member's mean over the blocks at or above each cutoff, by volume, or by tonnes with a density per block", () => {
  const m = memberMeans(fe, join, { cutoffs: [59, 0] });
  assert.deepEqual(m.map((r) => r.cutoff), [0, 59]);
  assert.equal(m[1].means[0].mean, 4.5); // Fe >= 59: blocks 62 and 60, SiO2 3 and 6
  assert.equal(m[1].means[0].covered, 1);
  assert.ok(Math.abs(m[0].means[0].mean - 11 / 3) < 1e-12); // all four: SiO2 on three of them
  assert.equal(m[0].means[0].covered, 0.75);
  assert.equal(m[0].means[1].mean, 2.5);
  const rho = new Map([[fe[0], 3], [fe[1], 1]]);
  const t = memberMeans(fe, join, { cutoffs: [59], densityOf: (c) => rho.get(c) || null });
  assert.equal(t[0].means[0].mean, (3 * 3 + 6 * 1) / 4); // tonnage-weighted, as the table's mean grade is then
  const io = memberMeans(fe.map((c, i) => ({ ...c, support: i === 0 ? "interpolated" : "extrapolated" })), join, { cutoffs: [0], interpolatedOnly: true });
  assert.equal(io[0].means[0].mean, 3);
});

test("the CSV columns are the same on every row; a member short of some blocks gets its covered share", () => {
  const cols = memberMeanColumns(memberMeans(fe, join, { cutoffs: [0, 59] }), [{ col: "SiO2_pct", element: "SiO2" }, { col: "Al2O3_pct", element: "Al2O3" }]);
  assert.deepEqual(cols.map((r) => Object.keys(r)), [["mean_SiO2_pct", "SiO2_covered_pct", "mean_Al2O3_pct"], ["mean_SiO2_pct", "SiO2_covered_pct", "mean_Al2O3_pct"]]);
  assert.deepEqual(cols[0], { mean_SiO2_pct: 3.6667, SiO2_covered_pct: 75, mean_Al2O3_pct: 2.5 });
  assert.equal(cols[1].SiO2_covered_pct, 100);
});

test("on two estimated elements of one set: the limited table equals the table of the blocks meeting the limit", () => {
  const pts = (valueOf) => { const out = []; for (const [h, x, y] of [["A", 0, 0], ["B", 40, 0], ["C", 0, 40], ["D", 40, 40]]) for (let z = -1; z > -40; z -= 2) out.push({ x, y, z, hole_id: h, value: valueOf(x, y, z), length: 2 }); return out; };
  const opts = { bounds: { xmin: -10, xmax: 50, ymin: -10, ymax: 50, zmin: -40, zmax: 0 }, cellSize: { dx: 10, dy: 10, dz: 5 }, method: "idw2", searchRadius: 60, maxSamples: 8 };
  const feCells = estimateBlockModel(pts((x, y, z) => 55 + x / 8 + z / 20), opts).cells;
  const siCells = estimateBlockModel(pts((x, y) => 2 + y / 8), opts).cells;
  const j = setJoin(blockModelLattice({ cells: feCells }), [{ element: "SiO2", unit: "%", name: "SiO2", cells: siCells }]);
  const lim = applyLimits(feCells, j, [{ op: "max", value: 4 }]);
  assert.ok(lim.cells.length > 0 && lim.failed > 0, `${lim.cells.length} kept, ${lim.failed} failed`);
  const manual = feCells.filter((c) => siCells.find((s) => s.x === c.x && s.y === c.y && s.z === c.z).value <= 4);
  assert.deepEqual(gradeTonnageTable(lim.cells, { cutoffs: [56, 58], density: 3 }), gradeTonnageTable(manual, { cutoffs: [56, 58], density: 3 }));
  const means = memberMeans(lim.cells, j, { cutoffs: [56] });
  assert.ok(means[0].means[0].mean <= 4);
});

test("the dialog finds the set's members (project or the Estimation result) and puts the limits and means in the table and CSV", () => {
  const g = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(g, /const list = setModels \|\| setMembersOf\(model, voxelModels\);/);
  assert.match(g, /const cellsUsed = limited \? limited\.cells : cellsInside;/);
  assert.match(g, /!\(model\.params\?\.set\?\.id && m\.params\?\.set\?\.id === model\.params\.set\.id\)/, "the set's own grades are not offered as a density");
  assert.match(g, /memberMeanColumns\(means, members\.map\(\(m\) => \(\{ col: m\.col, element: m\.element \}\)\)\)/);
  const e = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(e, /setModels=\{result\.params\?\.set \?/);
});
