// TASKS.csv #3086 (split from #2905) — the layer-cake stack with faults: one cake per fault block (a side of each fault plane), so the
// tops step at the fault; the faults as planes from their picks; a block with too few picks of a top takes it from all of them, and says so.
import test from "node:test";
import assert from "node:assert/strict";
import { layerCake, faultPlane, MIN_BLOCK_PICKS } from "../src/lib/layerCake.js";

const EXT = [0, 1000, 0, 1000, 0, 200], RES = [20, 20, 20];
// holes on a 100 m grid; top A at 100 m west of x = 500 and 80 m east of it (a 20 m throw), top B 10 m under A
function pile({ eastHoles = true } = {}) {
  const A = [], B = [];
  for (let x = 50; x < 1000; x += 100) for (let y = 50; y < 1000; y += 100) {
    if (!eastHoles && x > 500 && !(x === 550 && y === 50)) continue;
    const id = `H${x}_${y}`, za = x < 500 ? 100 : 80;
    A.push({ x, y, z: za, hole_id: id }); B.push({ x, y, z: za - 10, hole_id: id });
  }
  return [{ meshName: "A", points: A }, { meshName: "B", points: B }];
}
// a vertical fault along x = 500, picked on its trace (points in a line in plan, at two depths), dipping 90 toward the east
const FAULT = { meshName: "F1", points: [100, 500, 900].flatMap((y) => [{ x: 500, y, z: 150 }, { x: 500, y, z: 50 }]), orientations: [{ dip: 90, azimuth: 90 }] };

test("a fault plane: from its measured dip, else the plane through its points; none from points in a line with no dip", () => {
  const p = faultPlane(FAULT);
  assert.ok(Math.abs(Math.abs(p.n[0]) - 1) < 1e-9 && Math.abs(p.n[2]) < 1e-9, "vertical, facing east");
  assert.ok(Math.abs(p.c[0] - 500) < 1e-9);
  // no dip: the plane through points that span it (x = 500 at two depths and three places along it)
  const q = faultPlane({ points: FAULT.points });
  assert.ok(Math.abs(Math.abs(q.n[0]) - 1) < 1e-6, JSON.stringify(q.n));
  // a trace at one elevation and no dip: no plane
  assert.equal(faultPlane({ points: [{ x: 500, y: 0, z: 100 }, { x: 500, y: 500, z: 100 }, { x: 500, y: 900, z: 100 }] }), null);
  // a 60-degree dip toward the east (azimuth 90): the pole leans west of vertical by 60 degrees
  const d = faultPlane({ points: [{ x: 0, y: 0, z: 0 }], orientations: [{ dip: 60, azimuth: 90 }] });
  assert.ok(Math.abs(d.n[0] - Math.sin(Math.PI / 3)) < 1e-9 && Math.abs(d.n[2] - 0.5) < 1e-9);
});

test("the tops step at the fault: each side through its own picks; no triangle across it; the block and the evaluated points by side", () => {
  const r = layerCake(pile(), EXT, RES, { evalPts: [[250, 500, 95], [750, 500, 95], [750, 500, 75]], faults: [FAULT] });
  assert.equal(r.report.blocks.blocks, 2);
  assert.deepEqual(r.report.blocks.faults, ["F1"]);
  assert.equal(r.report.blocks.fromAll.length, 0);
  const A = r.surfaces.find((s) => s.name === "A"), B = r.surfaces.find((s) => s.name === "B");
  for (const v of A.vertices) {
    if (Math.abs(v[0] - 500) < 30) continue; // the nodes next to the fault
    assert.ok(Math.abs(v[2] - (v[0] < 500 ? 100 : 80)) < 0.5, `A at ${v[0]}: ${v[2]}`);
  }
  B.vertices.forEach((v, i) => { if (Math.abs(v[0] - 500) >= 30) assert.ok(Math.abs(A.vertices[i][2] - v[2] - 10) < 0.5); });
  // no triangle has nodes on both sides of x = 500
  for (const [a, b, c] of A.faces) { const xs = [A.vertices[a][0], A.vertices[b][0], A.vertices[c][0]]; assert.ok(xs.every((x) => x < 500) || xs.every((x) => x > 500)); }
  assert.ok(A.faces.length > 0);
  // the fault comes back as its plane, cut to the box
  const F = r.surfaces.find((s) => s.name === "F1");
  assert.ok(F && F.faces.length > 0 && F.vertices.every((v) => Math.abs(v[0] - 500) < 1e-6));
  // a thin, wide box (WA iron's 24 km x 20 km x 300 m): the plane still has triangles inside it, inside the box
  const thin = layerCake(pile(), [0, 24000, 0, 20000, 0, 300], RES, { faults: [FAULT] }).surfaces.find((s) => s.name === "F1");
  assert.ok(thin.faces.length > 100, `${thin.faces.length}`);
  assert.ok(thin.vertices.every((v) => v[2] >= 0 && v[2] <= 300 && v[1] >= 0 && v[1] <= 20000));
  // the block: at 95 m, under A (100) in the west, above A (80) in the east
  const id = (x, y, z) => { const [bx, by, bz] = RES; const ix = Math.floor((x / 1000) * bx), iy = Math.floor((y / 1000) * by), iz = Math.floor((z / 200) * bz); return r.block.ids[ix * by * bz + iy * bz + iz]; };
  assert.equal(id(250, 500, 95), 2); assert.equal(id(750, 500, 95), 1); assert.equal(id(750, 500, 75), 2);
  assert.deepEqual(r.evaluated, [2, 1, 2]);
});

test("a block with too few picks of a top takes it from all the picks, and says so; no fault: one block, as before", () => {
  const r = layerCake(pile({ eastHoles: false }), EXT, RES, { faults: [FAULT] });
  assert.ok(MIN_BLOCK_PICKS > 1);
  const fa = r.report.blocks.fromAll.map((f) => f.unit);
  assert.ok(fa.includes("A") && fa.includes("B"), JSON.stringify(r.report.blocks));
  // a fault that cannot be a plane is left out, said in the report, and the cake is one block
  const lo = layerCake(pile(), EXT, RES, { faults: [{ meshName: "Flat trace", points: [{ x: 500, y: 0, z: 100 }, { x: 500, y: 900, z: 100 }] }] });
  assert.deepEqual(lo.report.faultsLeftOut, ["Flat trace"]);
  assert.equal(lo.report.blocks, undefined);
  // without faults the result is the same as before (one block)
  const a = layerCake(pile(), EXT, RES), b = layerCake(pile(), EXT, RES, { faults: [] });
  assert.deepEqual(a.surfaces.map((s) => s.vertices), b.surfaces.map((s) => s.vertices));
  assert.deepEqual([...a.block.ids], [...b.block.ids]);
});

test("wiring: the faults go to the cake (client, worker, the stack run); the pane no longer asks to remove them", async () => {
  const fs = await import("node:fs");
  const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(read("../src/lib/layerCakeClient.js"), /worker\.postMessage\(\{ id, specs: slim, extent, resolution, evalPts, faults: slimFaults \}\);/);
  assert.match(read("../src/lib/layerCake.worker.js"), /layerCake\(specs, extent, resolution, \{ evalPts, faults, onProgress:/);
  assert.match(read("../src/modules/viewer/modellingRuns.js"), /faults: specs\.filter\(\(sp\) => sp\.fault\)/);
  const pane = read("../src/modules/viewer/ModellingPanes.jsx");
  assert.doesNotMatch(pane, /Remove the faults from the stack to run it as a layer-cake/);
  assert.match(pane, /A fault in the stack splits it into fault blocks, each a layer-cake of its own/);
});
