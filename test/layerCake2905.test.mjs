// TASKS.csv #2905 (WA iron review; Matt's decision 2026-11-12) — the layer-cake stack: flat-lying tops as elevation grids, each lower top the
// one above minus an interpolated thickness, so tops never cross; an unconformity starts a new cake and truncates the one under it.
import test from "node:test";
import assert from "node:assert/strict";
import { layerCake, cakeGrid, gridAt, topsByHole, contactDipDeg, stackIsFlat } from "../src/lib/layerCake.js";
import { checkAgainstLogs, unitVolumes, unitAt } from "../src/lib/modelCheck.js";

// a gently dipping pile of thin strands on a 1 x 1 km block, 12 x 12 holes, as the review's (5-6.5 m strands under 18 m cells):
// top of A at 450 - 0.01 x (0.6 deg), then A 6 m, B 5 m (absent in the west quarter), C 6.5 m, D below
const holes = [];
for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) holes.push({ id: `H${i}_${j}`, x: 40 + i * 85, y: 40 + j * 85 });
const topA = (x, y) => 450 - 0.01 * x + 0.004 * y;
const thick = { A: () => 6, B: (x) => (x < 250 ? 0 : 5), C: () => 6.5 };
function pile() {
  const tops = { A: [], B: [], C: [], D: [] };
  for (const h of holes) {
    let z = topA(h.x, h.y);
    for (const u of ["A", "B", "C", "D"]) {
      if (u === "B" && thick.B(h.x) === 0) { z -= 0; continue; } // absent: no top of B in that hole (C sits on A)
      tops[u].push({ x: h.x, y: h.y, z, hole_id: h.id });
      if (thick[u]) z -= thick[u](h.x);
    }
  }
  return ["A", "B", "C", "D"].map((u) => ({ meshName: u, points: tops[u] }));
}
const EXT = [0, 1060, 0, 1060, 380, 470], RES = [36, 36, 5]; // 18 m vertical cells, as the review's

test("a thin flat pile: tops in order everywhere, through the picks, and the block puts the logged metres where they were logged", () => {
  const specs = pile();
  const t0 = performance.now();
  const r = layerCake(specs, EXT, RES, { evalPts: holes.flatMap((h) => { const zA = topA(h.x, h.y); return [[h.x, h.y, zA - 3, "A"], [h.x, h.y, zA - (h.x < 250 ? 6 + 3 : 6 + 5 + 3), "C"]]; }).map(([x, y, z]) => [x, y, z]) });
  const ms = performance.now() - t0;
  assert.ok(!r.error, r.error);
  assert.ok(ms < 3000, `${ms.toFixed(0)} ms (GemPy took 9.5 minutes on the review's block)`);
  // never crossing: every node of every top at or under the one above
  for (let k = 1; k < 4; k++) for (let i = 0; i < r.surfaces[k].vertices.length; i++) assert.ok(r.surfaces[k].vertices[i][2] <= r.surfaces[k - 1].vertices[i][2] + 1e-6);
  // through the picks: each top within a few decimetres of its pick in every hole (a grid node per 42.5 m cell)
  const g = r.grid;
  for (const [k, s] of specs.entries()) {
    const Zk = Float32Array.from(r.surfaces[k].vertices.map((v) => v[2]));
    const miss = s.points.map((p) => Math.abs(gridAt(Zk, g, p.x, p.y) - p.z)).sort((a, b) => a - b);
    assert.ok(miss[Math.floor(miss.length * 0.9)] < 0.5, `${s.meshName}: 90th percentile miss ${miss[Math.floor(miss.length * 0.9)].toFixed(2)} m`);
  }
  // B pinches out in the west: zero thickness there, 5 m in the east
  const ZA = Float32Array.from(r.surfaces[0].vertices.map((v) => v[2])), ZB = Float32Array.from(r.surfaces[1].vertices.map((v) => v[2])), ZC = Float32Array.from(r.surfaces[2].vertices.map((v) => v[2]));
  assert.ok(Math.abs(gridAt(ZB, g, 800, 500) - gridAt(ZC, g, 800, 500) - 5) < 0.6, "B 5 m in the east");
  assert.ok(gridAt(ZB, g, 80, 500) - gridAt(ZC, g, 80, 500) < 0.6, "B about 0 m in the west");
  assert.ok(Math.abs(gridAt(ZA, g, 800, 500) - gridAt(ZB, g, 800, 500) - 6) < 0.6, "A 6 m");
  // the block and the exact ids: the logged midpoints are in their unit
  assert.deepEqual(r.block.labels, [null, "A", "B", "C", "D"]);
  assert.equal(r.block.ids.length, 36 * 36 * 5);
  assert.ok(r.evaluated.every((id, i) => (i % 2 === 0 ? id === 2 : id === 4)), "A midpoints are A (id 2), C midpoints are C (id 4)");
  const samples = r.evaluated.map((id, i) => ({ hole_id: "x", x: 0, y: 0, z: 0, metres: 1, logged: i % 2 ? "C" : "A", modelled: r.block.labels[id - 1] }));
  const chk = checkAgainstLogs(r.block, samples);
  assert.equal(chk.matched, chk.total, "every midpoint in its unit");
  const vols = unitVolumes(r.block);
  assert.ok(vols.some((v) => v.name === "D") && vols.some((v) => v.name === null), "volumes by unit, with the ground above the first top");
  assert.equal(unitAt(r.block, 530, 530, 469), null, "above the first top");
  const tA = r.report.units.find((u) => u.unit === "A" && u.thickness);
  assert.ok(Math.abs(tA.thickness.median - 6) < 0.01);
  const tB = r.report.units.find((u) => u.unit === "B" && u.thickness);
  assert.ok(Math.abs(tB.thickness.median - 5) < 0.01 && tB.thickness.zeroHoles > 0, "B: 5 m where present, absent in the west (not a 0 m median)");
});

test("an unconformity starts a new cake that it truncates; a lone pick makes a flat top; bad input is said", () => {
  // an upper flat package (U1 top at 460, U2 5 m below), an unconformity (top of L1, flat at 440) over a tilted older package (L2, L3)
  const up = [], up2 = [], unc = [], l2 = [], l3 = [];
  for (const h of holes) {
    up.push({ ...h, hole_id: h.id, z: 460 }); up2.push({ ...h, hole_id: h.id, z: 455 }); unc.push({ ...h, hole_id: h.id, z: 440 });
    const zl2 = 420 + 0.05 * (h.x - 500); // a 2.9 deg older dip: up to 446 m in the east, above the unconformity there
    if (zl2 < 440) l2.push({ ...h, hole_id: h.id, z: zl2 });
    l3.push({ ...h, hole_id: h.id, z: zl2 - 10 });
  }
  const specs = [{ meshName: "U1", points: up, package: 0 }, { meshName: "U2", points: up2, package: 0 }, { meshName: "L1", points: unc, package: 1 }, { meshName: "L2", points: l2, package: 1 }, { meshName: "L3", points: l3, package: 1 }];
  const r = layerCake(specs, [0, 1060, 0, 1060, 380, 470], [20, 20, 10]);
  assert.ok(!r.error);
  const g = r.grid, Z = r.surfaces.map((s) => Float32Array.from(s.vertices.map((v) => v[2])));
  assert.ok(Math.abs(gridAt(Z[2], g, 900, 500) - 440) < 0.5, "the unconformity stays flat");
  for (const x of [900, 1000]) assert.ok(gridAt(Z[3], g, x, 500) <= 440 + 1e-4 && gridAt(Z[3], g, x, 500) > 437, `L2 at or just under the unconformity at ${x} E, where it is eroded (no picks)`);
  assert.ok(Math.abs(gridAt(Z[3], g, 100, 500) - 400) < 1.5, "L2 keeps its own dip in the west (not parallel to the unconformity)");
  assert.ok(Math.abs(gridAt(Z[4], g, 100, 500) - 390) < 1.5, "L3 10 m under L2");
  assert.ok(r.report.units.filter((u) => u.packageTop).map((u) => u.unit).join() === "U1,L1,L2", "cakes start at U1, the unconformity, and L2");
  // an older top picked above the unconformity (here a mis-pick 5 m above it in the east) is cut at it, and said
  const hi = holes.map((h) => ({ x: h.x, y: h.y, hole_id: h.id, z: h.x > 800 ? 445 : 430 }));
  const r2 = layerCake([{ meshName: "U", points: up, package: 0 }, { meshName: "L1", points: unc, package: 1 }, { meshName: "L2", points: hi, package: 1 }], [0, 1060, 0, 1060, 380, 470], [10, 10, 9]);
  assert.ok(Math.abs(gridAt(Float32Array.from(r2.surfaces[2].vertices.map((v) => v[2])), r2.grid, 1000, 500) - 440) < 1e-4, "cut at the unconformity");
  assert.ok(r2.report.clamped.some((c) => c.unit === "L2" && c.nodes > 0));
  const one = layerCake([{ meshName: "A", points: [{ x: 5, y: 5, z: 100 }] }, { meshName: "B", points: [{ x: 5, y: 5, z: 90 }] }], [0, 10, 0, 10, 80, 110], [2, 2, 3]);
  assert.ok(one.surfaces[0].vertices.every((v) => v[2] === 100) && one.surfaces[1].vertices.every((v) => Math.abs(v[2] - 90) < 1e-4));
  assert.match(layerCake([{ meshName: "A", points: [] }], EXT, RES).error, /A: no top picks/);
  assert.equal(layerCake([], EXT, RES).error, "no units");
});

test("tops by hole, the grid and its lookup, and the flat-pile check", () => {
  const t = topsByHole([{ x: 0, y: 0, z: 10, hole_id: "a" }, { x: 0, y: 0, z: 12, hole_id: "a" }, { x: 1, y: 1, z: 5 }, { x: NaN, y: 0, z: 1, hole_id: "b" }]);
  assert.equal(t.by.get("a").z, 12, "a hole's highest top");
  assert.equal(t.all.length, 2);
  const g = cakeGrid([0, 1000, 0, 500], 100);
  assert.deepEqual([g.cell, g.nx, g.ny], [10, 100, 50]);
  const v = new Float32Array(g.nx * g.ny).map((_, k) => (k % g.nx) * 2); // 2 per node eastward: 0.2 per metre
  assert.ok(Math.abs(gridAt(v, g, 505, 250) - 100) < 1e-4);
  assert.equal(gridAt(v, g, -50, 250), 0, "held at the edge");
  const plane = (dipDeg) => holes.map((h) => ({ ...h, z: 400 - Math.tan((dipDeg * Math.PI) / 180) * h.x }));
  assert.ok(Math.abs(contactDipDeg(plane(3)) - 3) < 1e-6);
  assert.ok(Math.abs(contactDipDeg(plane(30)) - 30) < 1e-6);
  assert.ok(Number.isNaN(contactDipDeg([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 }])), "picks in a line");
  assert.deepEqual(stackIsFlat([{ points: plane(1) }, { points: plane(4) }]).flat, true);
  assert.deepEqual(stackIsFlat([{ points: plane(1) }, { points: plane(5.8) }]).flat, true, "the review's block: 4.5-5.8 degrees");
  assert.deepEqual(stackIsFlat([{ points: plane(1) }, { points: plane(12) }]).flat, false);
  assert.equal(stackIsFlat([{ points: [] }]), null);
});

test("wiring: the stack run builds a layer-cake in place of the GemPy solve, refuses faults, offers it on a flat thin pile; the pane's Method", async () => {
  const fs = await import("node:fs");
  const r = fs.readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const cakeRun = stackOpts\.engine === "layercake";/);
  assert.match(r, /const r = layerCake\(specs\.filter\(\(sp\) => !sp\.fault\), extent, resolution, \{ evalPts \}\);/);
  assert.match(r, /return r\.error \? \{ ok: false, error: r\.error \} : \{ ok: true, surfaces: r\.surfaces, block: r\.block, evaluated: r\.evaluated, cake: r \};/);
  assert.match(r, /if \(cake && stackFaults\.length\) \{ setNotices/);
  assert.match(r, /if \(flat\?\.flat\) \{/);
  assert.match(r, /return runSurfaceStack\(rawSpecs, \{ \.\.\.stackOpts, engine: "layercake", offerCake: false \}\);/);
  assert.match(r, /\.\.\.\(cake \? \{ engine: "layercake" \} : \{ offerCake: !faultSpecs\.length, pinchFor \}\)/);
  assert.match(r, /tool: cakeRun \? "stratigraphic stack \(layer-cake\)"/);
  const p = fs.readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /onClick=\{\(\) => runStackModel\(stackUnits, \{ method: stackMethod \}\)\}/);
  assert.match(p, /<option value="layercake">\{tr\("Layer-cake \(flat-lying\) — tops as elevation grids, kept in order"\)\}<\/option>/);
});

test("speed: the grid no finer than half the hole spacing; the ground read once per block column", async () => {
  const { nearestSpacing } = await import("../src/lib/layerCake.js");
  const { capBlockAtGround } = await import("../src/lib/modelCheck.js");
  assert.ok(Math.abs(nearestSpacing(holes) - 85) < 1e-9, "the review-like grid of holes 85 m apart");
  assert.equal(nearestSpacing([{ x: 0, y: 0 }, { x: 1, y: 1 }]), 0);
  const g = cakeGrid([0, 1060, 0, 1060], 128, 85 / 2);
  assert.ok(Math.abs(g.cell - 85 / 2) < 1e-9 && g.nx === 25, `${g.cell} m, ${g.nx} nodes`);
  const r = layerCake(pile(), EXT, RES);
  assert.ok(r.grid.nx <= 26, "a coarser grid on 85 m holes (was 128 a side)");
  let calls = 0;
  const block = { extent: [0, 100, 0, 100, 0, 50], resolution: [4, 4, 10], ids: new Int32Array(160).fill(2), labels: [null, "A"] };
  const capped = capBlockAtGround(block, () => { calls++; return 25; }, (q) => q);
  assert.equal(calls, 16, "one ground per column, not per cell");
  assert.equal(capped.cut, 80, "the cells above 25 m");
});

test("wiring: the layer-cake summary is said with the model check (after the solve, the next notices pushed it out of view)", async () => {
  const fs = await import("node:fs");
  const r = fs.readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /if \(res\.cake\) setNotices\(\(p\) => \[\.\.\.p, cakeNotice\(\)\]\); \/\/ #2905\r?\n\s*if \(chk\.total > 0\) setNotices/);
  assert.match(r, /\(rowsByHole\(unitLitho \|\| importStateRef\.current\.layers\?\.litho \|\| \[\]\)\.get\(t\.hole_id\) \|\| \[\]\)\.forEach/);
});
