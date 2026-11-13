// TASKS.csv #3256 (Galore Creek review) — the Estimation dialog's defaults (500 m search, Min distinct holes 2) did not finish in five
// minutes on 14 holes: the neighbour walk made an object for every composite in reach and sorted them, and with the per-hole cap the stopping
// test filtered and sorted the whole candidate list on every ring. Now buffers, running figures and only the usable candidates sorted: the
// SAME estimate (pinned below: the hashes the code before the change produced on this set, for twelve configurations) about 4x faster.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { estimateBlockModel, estimateDenseGrid } from "../src/lib/estimation.js";

let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pts = [];
for (let h = 0; h < 10; h++) {
  const x0 = (h % 4) * 120 + rnd() * 30, y0 = Math.floor(h / 4) * 130 + rnd() * 30, dip = 55 + rnd() * 30, az = rnd() * 360;
  for (let k = 0; k < 60; k++) { const md = k * 2 + 1, r = md * Math.cos((dip * Math.PI) / 180); pts.push({ x: x0 + r * Math.sin((az * Math.PI) / 180), y: y0 + r * Math.cos((az * Math.PI) / 180), z: 500 - md * Math.sin((dip * Math.PI) / 180), value: Math.exp(rnd() * 2 - 1), hole_id: `H${h}`, len: 2, length: 2, domain: k % 9 < 3 ? "OX" : k % 9 < 7 ? "FR" : null }); }
}
const b = { xmin: -60, xmax: 560, ymin: -60, ymax: 420, zmin: 350, zmax: 520 };
const base = { bounds: b, cellSize: { dx: 30, dy: 30, dz: 15 }, method: "idw2", minSamples: 1, maxSamples: 16, maxBlocks: 400000 };
const cfgs = {
  holes1_r200: { searchRadius: 200, minHoles: 1 },
  holes2_material_r300: { searchRadius: 300, minHoles: 2, materialHoles: true },
  holes2_r300_support: { searchRadius: 300, minHoles: 2, support: true },
  holes3_perHole4_r250: { searchRadius: 250, minHoles: 3, maxPerHole: 4 },
  domain_r200: { searchRadius: 200, restrictToDomain: true },
  domain_nocode_holes2: { searchRadius: 250, restrictToDomain: true, noCodeAsDomain: true, minHoles: 2 },
  ok_r250: { searchRadius: 250, method: "ok", variogram: { model: "spherical", nugget: 0.1, sill: 1, range: 150 } },
  nn_r150: { searchRadius: 150, method: "nn" },
  minSamples5_r120: { searchRadius: 120, minSamples: 5 },
  trend_holes2: { searchRadius: 300, minHoles: 2, trend: { basis: { major: { x: 0.8, y: 0.6, z: 0 }, semiMajor: { x: -0.6, y: 0.8, z: 0 }, minor: { x: 0, y: 0, z: 1 } }, scales: { major: 1, semiMajor: 1.6, minor: 3 } } },
  unlimited_support: { searchRadius: null, support: true, maxBlocks: 400000 },
};
// produced by the estimator before #3256 (commit 839d7057) on this set
const BEFORE = { holes1_r200: { hash: "687bcd174aa98387", blocks: 3444 }, holes2_material_r300: { hash: "755fdef2c85ac756", blocks: 3475 }, holes2_r300_support: { hash: "b856499ee4e12397", blocks: 3488 }, holes3_perHole4_r250: { hash: "f85f0bd77f4184a7", blocks: 2817 }, domain_r200: { hash: "c07f5a29d97d3eb6", blocks: 2956 }, domain_nocode_holes2: { hash: "dd176d7a378362fc", blocks: 3172 }, ok_r250: { hash: "520c263878096ef0", blocks: 3635 }, nn_r150: { hash: "024d1a0cf97a9614", blocks: 3032 }, minSamples5_r120: { hash: "31a4039f1603fcc0", blocks: 2690 }, trend_holes2: { hash: "bf864f5d82732fb6", blocks: 3218 }, unlimited_support: { hash: "bc5b2492d2fb1d24", blocks: 3696 }, dense: { hash: "51f2a8add757c8e6", blocks: 2860 } };

test("every block of twelve configurations is the same as before the rewrite (values, holes, support, flags, counts)", () => {
  for (const [k, o] of Object.entries(cfgs)) {
    const r = estimateBlockModel(pts, { ...base, ...o });
    const h = createHash("sha256");
    for (const c of r.cells) h.update(JSON.stringify(c));
    h.update(JSON.stringify({ e: r.blocksEstimated, s: r.blocksSkipped, sh: r.singleHoleCells, d: r.dominatedCells, sc: r.supportCounts, bc: r.beyondCounts, pb: r.piercedBlocks, ok: r.okCounts }));
    assert.deepEqual({ hash: h.digest("hex").slice(0, 16), blocks: r.blocksEstimated }, BEFORE[k], k);
  }
  const dg = estimateDenseGrid(pts, { ...base, searchRadius: 200, minHoles: 2 });
  assert.deepEqual({ hash: createHash("sha256").update(Buffer.from(new Float64Array(Array.from(dg.values, (v) => (Number.isFinite(v) ? v : -1))).buffer)).digest("hex").slice(0, 16), blocks: dg.estimated }, BEFORE.dense, "dense");
});

test("the walk keeps no per-candidate objects and sorts only the usable ones; the budget menu gives memory, the run its time left", () => {
  const e = readFileSync(new URL("../src/lib/estimation.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(e, /let D2 = new Float64Array\(1024\), P = new Array\(1024\), n = 0/);
  assert.match(e, /const st = inc \? settledRunning\(inc, safeD2, maxSamples, need\) : settled\(D2, P, n, safeD2,/);
  assert.match(e, /if \(st\) \{ if \(st === SETTLED\) keepD2 = safeD2; break; \}/);
  const settledBody = e.slice(e.indexOf("function settled(D2, P, n,"), e.indexOf("// TASKS.csv #142"));
  assert.doesNotMatch(settledBody, /\.sort\(/, "no sort in the stopping test");
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /const timeLeft = \(p\) => \{/);
  assert.match(m, /Math\.round\(progress \* 100\) \+ "%" \+ timeLeft\(progress\)/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of [" (about {s} s left)", " (about {m} min left)", "~0.1 GB of memory", "~0.4 GB of memory", "~0.9 GB of memory"]) assert.ok(d[k], `${l}: ${k}`);
  }
});
