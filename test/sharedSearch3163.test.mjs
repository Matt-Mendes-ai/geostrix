// TASKS.csv #3163 (split from #3014) — a set's members each ran a full neighbour search of their own. A member whose sample points are the
// primary's is now estimated in the primary's search (the same samples and weights), and its nearest-neighbour check in the check's run. Each
// such member must equal its own run exactly; kriging (a variogram per member) keeps its own runs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateBlockModel } from "../src/lib/estimation.js";
import { runEstimation } from "../src/lib/estimationClient.js";

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
// 8 inclined holes, 2 m composites, three elements on every composite, two domains down the holes
const pts = [], A = [], B = [];
for (let h = 0; h < 8; h++) {
  const x0 = (h % 4) * 45 + rnd() * 10, y0 = Math.floor(h / 4) * 50 + rnd() * 10, dip = (55 + rnd() * 30) * Math.PI / 180, az = rnd() * 2 * Math.PI;
  for (let k = 0; k < 24; k++) {
    const md = 1 + 2 * k, r = md * Math.cos(dip);
    const p = { hole_id: `H${h}`, x: x0 + r * Math.sin(az), y: y0 + r * Math.cos(az), z: 400 - md * Math.sin(dip), value: 20 + 40 * rnd(), length: 2, from: md - 1, to: md + 1, domain: k < 11 ? "OX" : "FR" };
    pts.push(p); A.push(rnd() * 3); B.push(rnd() < 0.1 ? 0 : 1 + rnd() * 9);
  }
}
const withValues = (v) => pts.map((p, i) => ({ ...p, value: v[i] }));
const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), zs = pts.map((p) => p.z);
const bounds = { xmin: Math.min(...xs) - 20, xmax: Math.max(...xs) + 20, ymin: Math.min(...ys) - 20, ymax: Math.max(...ys) + 20, zmin: Math.min(...zs) - 10, zmax: Math.max(...zs) + 5 };
const base = { bounds, cellSize: { dx: 12, dy: 12, dz: 8 }, searchRadius: 60, minSamples: 1, maxSamples: 12, minHoles: 2, materialHoles: true, support: true, columns: true, maxBlocks: 200000 };
// unsampled drill points of member B only (a few metres along two holes)
const unsB = pts.filter((p, i) => i % 37 === 0).map((p) => ({ x: p.x + 1.5, y: p.y, z: p.z - 1, hole_id: p.hole_id }));

const same = (own, sh, m, label) => {
  assert.equal(own.n, sh.n, `${label}: blocks`);
  for (let i = 0; i < own.n; i++) {
    if (own.x[i] !== sh.x[i] || own.y[i] !== sh.y[i] || own.z[i] !== sh.z[i]) assert.fail(`${label}: lattice at ${i}`);
    if (own.value[i] !== sh.mv[m][i]) assert.fail(`${label}: value at ${i}: ${own.value[i]} vs ${sh.mv[m][i]}`);
  }
};

test("each member from the shared search equals its own run, value for value (NN, IDW, MLS; domains, a trend)", () => {
  const trend = { basis: { major: { x: 0.8, y: 0.6, z: 0 }, semiMajor: { x: -0.6, y: 0.8, z: 0 }, minor: { x: 0, y: 0, z: 1 } }, scales: { major: 1, semiMajor: 1.6, minor: 3 } };
  for (const [label, o] of [["nn", { method: "nn" }], ["idw1", { method: "idw1" }], ["idw2", { method: "idw2" }], ["idw3", { method: "idw3" }], ["mls1", { method: "mls1" }],
    ["idw2 domains", { method: "idw2", restrictToDomain: true }], ["idw2 trend", { method: "idw2", trend }], ["mls1 trend minHoles 1", { method: "mls1", trend, minHoles: 1 }]]) {
    const opts = { ...base, ...o };
    const primary = estimateBlockModel(pts, opts).columns;
    const sh = estimateBlockModel(pts, { ...opts, members: { values: [Float64Array.from(A), Float64Array.from(B)] } }).columns;
    assert.ok(sh.n > 100, `${label}: ${sh.n} blocks`);
    assert.deepEqual([...sh.value], [...primary.value], `${label}: the primary is unchanged`);
    same(estimateBlockModel(withValues(A), opts).columns, sh, 0, `${label} A`);
    same(estimateBlockModel(withValues(B), opts).columns, sh, 1, `${label} B`);
  }
});

test("a member's own near-unsampled flags; kriging and object cells take no members", () => {
  const opts = { ...base, method: "idw2" };
  const own = estimateBlockModel(withValues(B), { ...opts, unsampledPoints: unsB }).columns;
  const sh = estimateBlockModel(pts, { ...opts, members: { values: [Float64Array.from(A), Float64Array.from(B)], unsampled: [null, unsB] } }).columns;
  assert.ok(own.nearUnsampled.some((v) => v === 1), "some blocks flagged");
  assert.deepEqual([...sh.nu[1]], [...own.nearUnsampled]);
  assert.equal(sh.nu[0], null, "A has no unsampled points: no flags");
  assert.equal(sh.nearUnsampled, undefined, "the primary had none given");
  const ok = estimateBlockModel(pts, { ...base, method: "ok", variogram: { model: "spherical" }, members: { values: [Float64Array.from(A)] } }).columns;
  assert.equal(ok.mv, undefined);
  const objects = estimateBlockModel(pts, { ...base, columns: false, method: "idw2", members: { values: [Float64Array.from(A)] } });
  assert.ok(objects.cells.length > 0 && !("mv" in objects.cells[0]));
});

test("runEstimation: the members' cells and check columns beside the primary's (this thread: no Worker in Node)", async () => {
  const opts = { ...base, columns: undefined, method: "idw2" };
  const r = await runEstimation("block", pts, { ...opts, members: { values: [Float64Array.from(A), Float64Array.from(B)], unsampled: [null, unsB] } });
  const ownA = await runEstimation("block", withValues(A), opts), ownB = await runEstimation("block", withValues(B), { ...opts, unsampledPoints: unsB });
  assert.deepEqual(r.memberCells[0], ownA.cells);
  assert.deepEqual(r.memberCells[1], ownB.cells);
  assert.deepEqual(r.cells, (await runEstimation("block", pts, opts)).cells);
  const nn = { ...base, columns: undefined, method: "nn", maxSamples: 1, minHoles: 1 };
  const c = await runEstimation("block", pts, { ...nn, members: { values: [Float64Array.from(B)] } }, { checkOnly: true });
  const cB = await runEstimation("block", withValues(B), nn, { checkOnly: true });
  assert.deepEqual([...c.memberCheckColumns[0].value], [...cB.checkColumns.value]);
  assert.deepEqual([...c.memberCheckColumns[0].x], [...cB.checkColumns.x]);
});

test("wiring: the dialog shares the search with the members on the primary's points, not under kriging or log10", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /const sharedIdx = method !== "ok" && !logInfo \? prep\.map\(\(q, k\) => \(q\.mp\.length && samePoints\(q\.mp, estPts\) \? k : -1\)\)/);
  assert.match(m, /q\.hole_id === r\.hole_id && q\.x === r\.x && q\.y === r\.y && q\.z === r\.z && \(q\.length \?\? null\) === \(r\.length \?\? null\) && \(q\.domain \?\? null\) === \(r\.domain \?\? null\)/);
  assert.match(m, /\.\.\.\(sharedValues \? \{ members: \{ values: sharedValues, unsampled: sharedIdx\.map\(\(k\) => prep\[k\]\.mUns\) \} \} : \{\}\), \/\/ #3163/);
  assert.match(m, /if \(j >= 0\) me = \{ cells: sharedRun\.cells\[j\], supportCounts: sharedRun\.supportCounts, dominatedCells: sharedRun\.dominated, mlsCounts: sharedRun\.mlsCounts \};/);
  assert.match(m, /const \{ el, u, unsM, fm, mCap, mp, mUns \} = prep\[k\];/);
  const w = readFileSync(new URL("../src/lib/estimationCells.js", import.meta.url), "utf8");
  assert.match(w, /\.\.\.\(cols\.mv \|\| \[\]\), \.\.\.\(cols\.nu \|\| \[\]\)\]\.filter\(Boolean\)/, "the members' columns are transferred, not cloned");
});
