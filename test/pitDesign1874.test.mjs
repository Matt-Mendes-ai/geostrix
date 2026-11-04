// TASKS.csv #1874 — a benched pit design from a pit shell
import test from "node:test";
import assert from "node:assert/strict";
import { shellFloors, benchedPit, toeRL, benchStringRows, benchTableRows } from "../src/lib/pitDesign.js";

// a shell on a 10 m lattice: a 90 x 90 m floor (9 x 9 columns, edges at +-45 m) at 940 m under flat ground at 1,000 m, with a ring of ground nodes around it
function squareShell(floorZ = 940) {
  const pos = [];
  for (let y = -70; y <= 70; y += 10) for (let x = -70; x <= 70; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 45 && Math.abs(y) <= 45 ? floorZ : 1000);
  return Float64Array.from(pos);
}
const GROUND = () => 1000;

test("shell floors are read off the mesh: a node below the ground is a mined column", () => {
  const s = shellFloors(squareShell(), GROUND);
  assert.equal(s.dx, 10); assert.equal(s.nx, 15); assert.equal(s.mined, 81); assert.equal(s.zMin, 940);
  assert.equal(toeRL(1003.4, 10), 1000); assert.equal(toeRL(1006, 10), 1010); assert.equal(toeRL(1003.4, 10, 5), 1005);
});

test("benches climb from the pit bottom at the face angle, step out by the berm, and daylight at the ground", () => {
  const s = shellFloors(squareShell(), GROUND);
  const d = benchedPit(s, { groundAt: GROUND, benchH: 10, berm: 5, batterDeg: 60 });
  assert.equal(d.benches.length, 6, "floors at 940, 950, ... 990");
  assert.equal(d.floorRL, 940); assert.equal(d.crestRL, 1000);
  assert.ok(Math.abs(d.interRampDeg - Math.atan(10 / (10 / Math.tan(Math.PI / 3) + 5)) * 180 / Math.PI) < 1e-9);
  assert.ok(d.daylights);
  // the top crest: 6 faces and 5 berms out from the bottom edge (45 m, the mined columns' edge), each face 5.77 m
  const crest = d.strings.find((x) => x.kind === "crest" && x.rl === 1000);
  const xs = crest.lines.flat().map((p) => p[0] - 500000);
  const reachOut = 6 * (10 / Math.tan(Math.PI / 3)) + 5 * 5;
  assert.ok(Math.abs(Math.max(...xs) - (45 + reachOut)) < 2 * d.cell, `crest at ${Math.max(...xs)} m, expected ${45 + reachOut}`);
  const toe = d.strings.find((x) => x.kind === "toe" && x.rl === 940);
  assert.ok(Math.abs(Math.max(...toe.lines.flat().map((p) => p[0] - 500000)) - 45) < 2 * d.cell);
  assert.equal(d.strings.filter((x) => x.kind === "toe").length, 6);
  // every vertex of the surface is at or below the ground; rock grows bench by bench towards the top
  for (let i = 2; i < d.positions.length; i += 3) assert.ok(d.positions[i] <= 1000 + 1e-9);
  assert.equal(d.indices.length % 3, 0);
  for (let k = 1; k < d.benches.length; k++) assert.ok(d.benches[k].rockT > d.benches[k - 1].rockT);
  assert.ok(d.totals.rockT > 90 * 90 * 60, "more rock than the shell's prism: the walls step out");
});

test("ore comes from the blocks above the cut-off inside the design, per bench slab", () => {
  const s = shellFloors(squareShell(), GROUND);
  const cells = [
    { x: 500000, y: 5000000, z: 950, dx: 20, dy: 20, dz: 20, value: 1.0 }, // inside, 940-960: half in bench 940, half in 950
    { x: 500000, y: 5000000, z: 950, dx: 20, dy: 20, dz: 20, value: 0.1 }, // below cut-off
    { x: 500800, y: 5000000, z: 950, dx: 20, dy: 20, dz: 20, value: 5.0 }, // far outside the pit
  ];
  const d = benchedPit(s, { groundAt: GROUND, cells, cutoff: 0.5, density: 2.5, benchH: 10, berm: 5, batterDeg: 60 });
  const expect = 20 * 20 * 20 * 2.5;
  assert.ok(Math.abs(d.totals.oreT - expect) < expect * 0.03, `ore ${d.totals.oreT}`);
  assert.ok(Math.abs(d.benches[0].oreT - expect / 2) < expect * 0.03);
  assert.ok(Math.abs(d.benches[1].oreT - expect / 2) < expect * 0.03);
  assert.equal(d.benches[2].oreT, 0);
  assert.ok(Math.abs(d.totals.meanGrade - 1.0) < 1e-9);
  const rows = benchTableRows(d.benches, "g/t");
  assert.equal(rows.length, 6); assert.equal(rows[0].floor_rl, 940); assert.ok("mean_grade_g/t" in rows[0]);
  assert.ok(benchStringRows(d.strings).every((r) => Number.isFinite(r.x) && Number.isFinite(r.z)));
});

test("a flat 'model top' ground when there is no terrain; a cell budget coarsens the grid", () => {
  const s = shellFloors(squareShell(), null);
  assert.equal(s.top, 1000); assert.equal(s.mined, 81);
  const d = benchedPit(s, { benchH: 10, berm: 5, batterDeg: 60, maxCells: 5000 });
  assert.ok(d.coarsened); assert.ok(d.cell > 10 / Math.tan(Math.PI / 3) / 4 + 1e-9);
  assert.equal(d.benches.length, 6);
});
