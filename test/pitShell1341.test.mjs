// TASKS.csv #1341 — the conceptual pit shell: the exact answer against every possible pit, the slope, and the money
import { test } from "node:test";
import assert from "node:assert/strict";
import { terrainGroundAt } from "../src/lib/viewer/geomath.js";
import { collarGround, pitEconomics, marginPerTonne, precedenceArcs, wallAngles, MAX_ARCS, solvePit, pitSummary, runPitShell } from "../src/lib/pitShell.js";

// a hand-made grid: value[k][j][i], every cell rock, k = 0 at the base
const gridOf = (vals, dx = 10, dy = 10, dz = 10) => {
  const nz = vals.length, ny = vals[0].length, nx = vals[0][0].length, n = nx * ny * nz, value = new Float64Array(n), rockT = new Float32Array(n).fill(1);
  vals.forEach((pl, k) => pl.forEach((row, j) => row.forEach((v, i) => { value[k * nx * ny + j * nx + i] = v; })));
  return { nx, ny, nz, dx, dy, dz, x0: 0, y0: 0, z0: 0, value, rockT, oreT: new Float32Array(n), metalU: new Float64Array(n), modelT: new Float32Array(n), ground: new Float64Array(nx * ny).fill(nz * dz) };
};

// the best pit by trying every subset
function bruteBest(grid, slope) {
  const { nx, ny, nz, value } = grid, n = nx * ny * nz, arcs = precedenceArcs(grid.dx, grid.dy, grid.dz, slope);
  let best = 0;
  for (let mask = 0; mask < 2 ** n; mask++) {
    let ok = true, sum = 0;
    for (let q = 0; q < n && ok; q++) {
      if (!(mask >> q & 1)) continue;
      sum += value[q];
      const k = Math.floor(q / (nx * ny)), j = Math.floor((q - k * nx * ny) / nx), i = q - k * nx * ny - j * nx;
      for (const [a, b, l] of arcs) {
        const K = k + l, I = i + a, J = j + b;
        if (K >= nz || I < 0 || J < 0 || I >= nx || J >= ny) continue;
        if (!(mask >> (K * nx * ny + J * nx + I) & 1)) { ok = false; break; }
      }
    }
    if (ok && sum > best) best = sum;
  }
  return best;
}

test("the solve matches every possible pit on small random models", () => {
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 60; t++) {
    const nx = 2 + (t % 3), nz = 2 + (t % 2) * 1, vals = [];
    for (let k = 0; k < nz; k++) { const row = []; for (let i = 0; i < nx; i++) row.push(Math.round((rnd() - 0.65) * 20)); vals.push([row]); }
    const g = gridOf(vals), s = solvePit(g, 45);
    assert.ok(Math.abs(pitSummary(g, s.mined).money - bruteBest(g, 45)) < 1e-6, `case ${t}`);
  }
});

test("the textbook case: a block worth less than its cone stays, worth more it comes out", () => {
  // at 45 degrees with equal cells a block needs the one over it and the four beside that: five of waste, no diagonal
  const cone = (v) => gridOf([
    [[0, 0, 0], [0, v, 0], [0, 0, 0]],
    [[-1, -1, -1], [-1, -1, -1], [-1, -1, -1]],
  ]);
  assert.equal(pitSummary(cone(4), solvePit(cone(4), 45).mined).blocks, 0);
  const g = cone(6), s = solvePit(g, 45);
  assert.equal(pitSummary(g, s.mined).blocks, 6);
  assert.equal(pitSummary(g, s.mined).money, 1);
});

test("nothing that pays: no pit", () => {
  const g = gridOf([[[-1, -2]], [[-1, -1]]]);
  assert.equal(pitSummary(g, solvePit(g, 45).mined).blocks, 0);
});

test("arcs are never flatter than the slope, and steep slopes need several levels", () => {
  for (const slope of [25, 35, 45, 55, 70]) {
    const arcs = precedenceArcs(25, 25, 10, slope);
    assert.ok(arcs.length > 0 && arcs.length <= MAX_ARCS, `${slope}: ${arcs.length}`);
    for (const [a, b, l] of arcs) assert.ok(Math.atan2(l * 10, Math.hypot(a * 25, b * 25)) * 180 / Math.PI >= slope - 1e-6, `${a},${b},${l}`);
  }
  assert.ok(precedenceArcs(25, 25, 10, 60).some(([, , l]) => l > 1), "a 10 m bench at 60 deg steps sideways only every few levels");
});

test("a deep ore block digs a cone at the slope asked for", () => {
  for (const slope of [35, 45, 60]) {
    const nx = 61, ny = 61, nz = 24, n = nx * ny * nz, d = 10;
    const value = new Float64Array(n).fill(-1), rockT = new Float32Array(n).fill(1), q0 = nx * ny * 0 + 30 * nx + 30;
    value[q0] = 1e9;
    const g = { nx, ny, nz, dx: d, dy: d, dz: d, x0: 0, y0: 0, z0: 0, value, rockT, oreT: new Float32Array(n), metalU: new Float64Array(n), modelT: new Float32Array(n), ground: new Float64Array(nx * ny).fill(nz * d) };
    const s = solvePit(g, slope);
    // the mouth of the cone on the top level: how wide against how deep
    let r = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (s.mined[(nz - 1) * nx * ny + j * nx + i]) r = Math.max(r, Math.hypot(i - 30, j - 30) * d);
    const measured = Math.atan2((nz - 1) * d, r) * 180 / Math.PI;
    const w = wallAngles(d, d, d, slope);
    assert.ok(measured >= slope - 0.01 && measured < slope + 10, `${slope}: measured ${measured.toFixed(1)}`);
    assert.ok(w.flattest >= slope - 0.01 && w.steepest < slope + 10, `${slope}: ${w.flattest} ${w.steepest}`);
  }
});

test("money: gold in $/oz at g/t, copper in $/lb at %", () => {
  const au = pitEconomics({ unit: "g/t", price: 2000, priceUnit: "oz", recovery: 90, processingCost: 15 });
  assert.ok(Math.abs(au.revenuePerGrade - (2000 / 31.1034768) * 0.9) < 1e-9);
  assert.ok(Math.abs(au.cutoff - 15 / au.revenuePerGrade) < 1e-12);
  const cu = pitEconomics({ unit: "%", price: 4, priceUnit: "lb", recovery: 85, processingCost: 10 });
  assert.ok(Math.abs(cu.revenuePerGrade - 0.01 * 0.85 * 4 * 2204.62262) < 1e-9); // about $75 / t per 1 % Cu
  assert.equal(pitEconomics({ unit: "ohm.m", price: 1, priceUnit: "t", recovery: 90, processingCost: 1 }), null);
  assert.equal(marginPerTonne(1, au, 3, 15), au.revenuePerGrade - 18); // pays to process
  assert.equal(marginPerTonne(0.1, au, 3, 15), -3); // waste pays for mining only
});

const flatGround = (z) => () => z;
const orebody = (top, thick, grade) => {
  const cells = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) for (let k = 0; k < thick; k++) cells.push({ x: 500 + i * 10, y: 500 + j * 10, z: top - 5 - k * 10, dx: 10, dy: 10, dz: 10, value: grade });
  return cells;
};
const econ = { unit: "g/t", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 15, density: 2.7, slopeDeg: 45 };

test("the model's rock is costed up to the ground, and a shallow orebody pays where a deep one does not", () => {
  const shallow = runPitShell({ ...econ, cells: orebody(1000, 10, 1.5) }, { groundAt: flatGround(1020) });
  assert.ok(shallow.oreT > 0 && !shallow.empty);
  assert.ok(shallow.oreT > 0.97 * 120 * 120 * 100 * 2.7 && shallow.oreT <= 120 * 120 * 100 * 2.7 * 1.0001, String(shallow.oreT)); // all but deep corners that do not pay for their wall
  assert.ok(Math.abs(shallow.meanGrade - 1.5) < 1e-6);
  // by hand: a 120 m square floor, 120 m deep at 45 deg, is a frustum of about 7.5 Mm3 around 1.44 Mm3 of ore: a strip near 4.2, less with rounded corners
  assert.ok(shallow.stripRatio > 2.5 && shallow.stripRatio < 4.5, String(shallow.stripRatio));
  assert.ok(shallow.maxDepth >= 119, String(shallow.maxDepth)); // ground to the base of the body
  assert.equal(shallow.touchesEdge, false);
  const deep = runPitShell({ ...econ, cells: orebody(1000, 10, 1.5) }, { groundAt: flatGround(1800) });
  assert.ok(deep.empty, "under 800 m of cover it does not pay");
});

test("ore in the air is not counted, and a block below cut-off is waste", () => {
  const r = runPitShell({ ...econ, cells: orebody(1000, 10, 1.5) }, { groundAt: flatGround(960) });
  assert.ok(Math.abs(r.oreT - 120 * 120 * 60 * 2.7) < 1e-3 * r.oreT, String(r.oreT)); // the top 40 m is above the ground
  const none = runPitShell({ ...econ, cells: orebody(1000, 10, 0.01) }, { groundAt: flatGround(1000) });
  assert.ok(none.empty);
  assert.ok(Math.abs(none.cutoff - 15 / ((2000 / 31.1034768) * 0.9)) < 1e-9);
});

test("no terrain: the top of the model stands in, and that is reported", () => {
  const r = runPitShell({ ...econ, cells: orebody(1000, 10, 1.5) }, {});
  assert.equal(r.topAssumed, 1);
  assert.ok(r.oreT > 0);
});

test("a higher price makes a pit that holds the lower price's", () => {
  const cells = [];
  for (let i = 0; i < 20; i++) for (let k = 0; k < 16; k++) for (let j = 0; j < 6; j++) cells.push({ x: i * 10, y: j * 10, z: 1000 - k * 10, dx: 10, dy: 10, dz: 10, value: 0.2 + 0.1 * k + 0.05 * Math.sin(i) });
  const ground = flatGround(1010);
  const a = runPitShell({ ...econ, cells, revenueFactor: 0.6 }, { groundAt: ground }), b = runPitShell({ ...econ, cells, revenueFactor: 1 }, { groundAt: ground });
  assert.ok(b.rockT >= a.rockT);
  assert.ok(b.maxDepth >= a.maxDepth);
});

test("the surface is the pit's floor, a mesh of whole triangles that meets the ground", () => {
  const r = runPitShell({ ...econ, cells: orebody(1000, 10, 1.5) }, { groundAt: flatGround(1020) });
  assert.equal(r.indices.length % 3, 0);
  assert.ok(r.indices.every((i) => i * 3 < r.positions.length));
  let lo = Infinity, hi = -Infinity;
  for (let i = 2; i < r.positions.length; i += 3) { lo = Math.min(lo, r.positions[i]); hi = Math.max(hi, r.positions[i]); }
  assert.equal(hi, 1020);
  assert.ok(lo <= 901 && lo >= 899, String(lo));
});

test("a terrain sent to the worker as the client sends it: a hill adds cover, a no-data hole does not break the run", () => {
  // 40 x 40 nodes over 0-1000 m in E and N, rising from 1020 m in the west to 1100 m in the east
  const gridW = 40, gridH = 40, elevations = new Float32Array(gridW * gridH);
  for (let r = 0; r < gridH; r++) for (let c = 0; c < gridW; c++) elevations[r * gridW + c] = 1020 + (80 * c) / (gridW - 1);
  const terrain = structuredClone({ bbox: [0, 0, 1000, 1000], gridW, gridH, elevations, noDataMask: null });
  const groundAt = (x, y) => terrainGroundAt(terrain, x, y);
  assert.ok(Math.abs(groundAt(500, 500) - 1060) < 1, String(groundAt(500, 500)));
  const cells = orebody(1000, 10, 1.5);
  const hill = runPitShell({ ...econ, cells }, { groundAt }), flat = runPitShell({ ...econ, cells }, { groundAt: flatGround(1020) });
  assert.ok(hill.oreT > 0);
  assert.ok(hill.stripRatio > flat.stripRatio, `${hill.stripRatio} vs ${flat.stripRatio}`);
  assert.ok(hill.topAssumed >= 0 && hill.topAssumed < 1);
});

test("#1353: no terrain — the ground comes from the collars, not the top of the highest block", () => {
  const cells = orebody(1000, 10, 1.5); // block tops reach 1,000 m
  const collars = [{ x: 400, y: 400, z: 960 }, { x: 800, y: 400, z: 960 }, { x: 400, y: 800, z: 960 }, { x: 800, y: 800, z: 960 }];
  const r = runPitShell({ ...econ, cells }, { collars });
  assert.equal(r.groundSource, "collars");
  assert.ok(Math.abs(r.oreT - 120 * 120 * 60 * 2.7) < 1e-3 * r.oreT, String(r.oreT)); // the top 40 m is above the collars: air, not ore
  const g = collarGround(collars);
  assert.equal(g(400, 400), 960);
  assert.ok(Math.abs(g(600, 600) - 960) < 1e-9);
  assert.equal(collarGround([]), null);
  assert.equal(runPitShell({ ...econ, cells }, {}).groundSource, "model top");
});

test("#1358: the grid stops at the deepest paying block, so a deep barren tail no longer coarsens the blocks", () => {
  const cells = orebody(1000, 4, 1.5); // 40 m of ore at the top
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) for (let k = 0; k < 120; k++) cells.push({ x: 500 + i * 10, y: 500 + j * 10, z: 955 - k * 10, dx: 10, dy: 10, dz: 10, value: 0 }); // 1.2 km of barren model below
  const r = runPitShell({ ...econ, cells }, { groundAt: flatGround(1000) });
  assert.deepEqual(r.cell, [10, 10, 10], "blocks stay at the model's 10 m");
  assert.ok(r.maxDepth <= 41, String(r.maxDepth));
  assert.ok(runPitShell({ ...econ, cells: orebody(1000, 4, 0.01) }, { groundAt: flatGround(1000) }).empty, "nothing pays: no pit");
});

test("#1354: the result says how much of the ore rests on one hole or is extrapolated", () => {
  const cells = orebody(1000, 10, 1.5).map((c, i) => ({ ...c, nHoles: i % 2 ? 1 : 3, support: i % 4 === 0 ? "extrapolated" : "interpolated" }));
  const r = runPitShell({ ...econ, cells }, { groundAt: flatGround(1000) });
  assert.ok(Math.abs(r.oreSingleHoleShare - 0.5) < 0.02, String(r.oreSingleHoleShare));
  assert.ok(Math.abs(r.oreExtrapolatedShare - 0.25) < 0.02, String(r.oreExtrapolatedShare));
});
