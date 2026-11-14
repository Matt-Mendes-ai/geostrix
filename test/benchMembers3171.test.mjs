// TASKS.csv #3171 (split from #3014 part b) — the by-bench table gave the primary's mean only: the set's other elements bench by bench now, over
// the blocks each bench row counts, split across benches by vertical overlap exactly as gradeTonnageByBench splits them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeTonnageByBench, forEachBench } from "../src/lib/gradeTonnage.js";
import { setJoin, memberMeans, memberMeansByBench, memberMeanColumns } from "../src/lib/setLimits.js";
import { blockModelLattice } from "../src/lib/estimationMeta.js";

// a 2 x 1 x 4 column of 10 m blocks, z centres 5, 15, 25, 35 (Fe), with SiO2 on all of them and Al2O3 on the lower half only
const cell = (x, z, value) => ({ x, y: 5, z, dx: 10, dy: 10, dz: 10, value });
const fe = [], si = [], al = [];
for (const x of [5, 15]) for (const [z, f] of [[5, 50], [15, 56], [25, 60], [35, 40]]) {
  fe.push(cell(x, z, f + (x === 15 ? 2 : 0)));
  si.push(cell(x, z, z / 10));
  if (z < 20) al.push(cell(x, z, 1 + x / 10));
}
const join = setJoin(blockModelLattice({ cells: fe }), [{ element: "SiO2", unit: "%", name: "SiO2", cells: si }, { element: "Al2O3", unit: "%", name: "Al2O3", cells: al }]);

test("forEachBench: a block's share in each bench it spans", () => {
  const got = []; forEachBench({ z: 15, dz: 10 }, 20, 0, (k, lo, share) => got.push([k, lo, share]));
  assert.deepEqual(got, [[0, 0, 1]]);
  got.length = 0; forEachBench({ z: 15, dz: 10 }, 10, 5, (k, lo, share) => got.push([k, lo, share]));
  assert.deepEqual(got, [[0, 5, 0.5], [1, 15, 0.5]]);
});

test("the members' means per bench: same benches and order as the bench rows; split blocks weighted by their share", () => {
  const opts = { cutoff: 45, benchH: 20, datum: 0 };
  const rows = gradeTonnageByBench(fe, { ...opts, density: 3, unit: "%" });
  const by = memberMeansByBench(fe, join, opts);
  assert.deepEqual(by.map((b) => b.floorRL), rows.map((r) => r.floorRL));
  assert.deepEqual(by.map((b) => b.floorRL), [20, 0]);
  // bench 20-40: only the z 25 blocks pass the 45 cutoff (z 35 is 40-42): SiO2 2.5, no Al2O3 there
  assert.equal(by[0].means[0].mean, 2.5);
  assert.equal(by[0].means[1].mean, null);
  assert.equal(by[0].means[1].covered, 0);
  // bench 0-20: z 5 and 15 at both x: SiO2 (0.5 + 1.5) / 2; Al2O3 (1.5 + 2.5) / 2
  assert.equal(by[1].means[0].mean, 1);
  assert.ok(Math.abs(by[1].means[1].mean - 2) < 1e-12);
  assert.equal(by[1].means[1].covered, 1);
  // one bench holding everything: the per-cutoff means
  const all = memberMeansByBench(fe, join, { cutoff: 45, benchH: 1000, datum: -500 });
  const per = memberMeans(fe, join, { cutoffs: [45] });
  assert.equal(all.length, 1);
  for (let m = 0; m < 2; m++) { assert.ok(Math.abs(all[0].means[m].mean - per[0].means[m].mean) < 1e-12); assert.ok(Math.abs(all[0].means[m].covered - per[0].means[m].covered) < 1e-12); }
  // benches that cut the blocks in half: each half counts in its bench
  const half = memberMeansByBench(fe, join, { cutoff: 45, benchH: 10, datum: 0 + 5 });
  assert.deepEqual(half.map((b) => b.floorRL), gradeTonnageByBench(fe, { cutoff: 45, benchH: 10, datum: 5 }).map((r) => r.floorRL));
  assert.equal(half.find((b) => b.floorRL === 25).means[0].mean, 2.5); // the top half of z 25 only (z 35 is under the cutoff)
  assert.equal(half.find((b) => b.floorRL === 15).means[0].mean, 2); // half of z 15 (1.5) and half of z 25 (2.5)
  // tonnage-weighted with a density per block; a block with none is left out, as in the bench row
  const dens = (c) => (c.z === 5 ? 2 : c.z === 15 ? 4 : null);
  const t = memberMeansByBench(fe, join, { ...opts, densityOf: dens });
  assert.ok(Math.abs(t[1].means[0].mean - (2 * 0.5 + 4 * 1.5) / 6) < 1e-12);
  assert.equal(t[0].means[0].mean, 2.5, "no tonnes in the bench: by volume");
  // CSV columns as the main table's
  const cols = memberMeanColumns(by, [{ col: "SiO2_pct", element: "SiO2" }, { col: "Al2O3_pct", element: "Al2O3" }]);
  assert.deepEqual(cols[1], { mean_SiO2_pct: 1, mean_Al2O3_pct: 2, Al2O3_covered_pct: 100 });
  assert.equal(memberMeansByBench(fe, join, { cutoff: 0, benchH: 0 }).length, 0);
});

test("wiring: the bench table and its CSV carry the members", () => {
  const g = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(g, /const benchMeans = useMemo\(\(\) => \(join && benchRows\.length \? memberMeansByBench\(cellsUsed, join, \{ cutoff: benchCut, benchH: Number\(benchH\), datum: Number\(benchDatum\) \|\| 0, interpolatedOnly: interpOnly, densityOf: byModel\?\.of \|\| byCode\?\.of \|\| null \}\)/);
  assert.match(g, /\{benchMeans && members\.map\(\(m\) => <th key=\{m\.element\}/);
  assert.match(g, /\{benchMeans && benchMeans\.find\(\(x\) => x\.floorRL === r\.floorRL\)\?\.means\.map\(/);
  assert.match(g, /\{benchMeans && memberMetalOn && members\.map\(\(mb, i\) =>/);
  assert.match(g, /const benchExtra = benchOut && benchMeans \? memberMeanColumns\(benchMeans,/);
  const t = readFileSync(new URL("../src/lib/gradeTonnage.js", import.meta.url), "utf8");
  assert.match(t, /forEachBench\(c, h, datum, \(k, lo, share\) => \{ \/\/ #3171/);
});
