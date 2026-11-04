// TASKS.csv #1881 — a pit slope per wall sector
import test from "node:test";
import assert from "node:assert/strict";
import { precedenceArcs, wallAngles, runPitShell, sectorOfBearing, slopeForSector, hasSectorSlopes, flattestSlope } from "../src/lib/pitShell.js";

test("sectors and the slope each takes", () => {
  assert.equal(sectorOfBearing(0), "N"); assert.equal(sectorOfBearing(44), "NE"); assert.equal(sectorOfBearing(90), "E"); assert.equal(sectorOfBearing(181), "S"); assert.equal(sectorOfBearing(-45), "NW"); assert.equal(sectorOfBearing(350), "N");
  const s = { N: 30, S: "", E: "60" };
  assert.equal(slopeForSector(45, s, "N"), 30); assert.equal(slopeForSector(45, s, "S"), 45); assert.equal(slopeForSector(45, s, "E"), 60); assert.equal(slopeForSector(45, null, "W"), 45);
  assert.ok(hasSectorSlopes(s)); assert.ok(!hasSectorSlopes({ N: "", S: null })); assert.equal(flattestSlope(45, s), 30);
});

test("arcs reach farther on the flat side: a 30-degree north wall allows wider steps north than the 60-degree south wall", () => {
  const arcs = precedenceArcs(10, 10, 10, 45, null, { N: 30, S: 60 });
  const north = arcs.filter(([a, b]) => b > 0 && Math.abs(a) <= b), south = arcs.filter(([a, b]) => b < 0 && Math.abs(a) <= -b);
  const reachOf = (list) => Math.max(...list.map(([a, b, l]) => Math.hypot(a, b) / l));
  assert.ok(reachOf(north) > reachOf(south), `north ${reachOf(north)} south ${reachOf(south)}`);
  // never flatter than each sector's slope
  for (const [a, b, l] of arcs) { const bearing = (Math.atan2(a, b) * 180) / Math.PI; const slope = slopeForSector(45, { N: 30, S: 60 }, sectorOfBearing(bearing)); assert.ok(Math.hypot(a * 10, b * 10) <= (l * 10) / Math.tan((slope * Math.PI) / 180) + 1e-9); }
  const w = wallAngles(10, 10, 10, 45, 32, { N: 30, S: 60 });
  assert.ok(w.bySector.N < w.bySector.S, `N ${w.bySector.N} S ${w.bySector.S}`);
  // nothing anywhere is flatter than the flattest sector; the south wall is near its 60 (a wall a little off due south mixes in
  // the 45-degree neighbours, so the cone grades from one sector's slope to the next rather than stepping)
  assert.ok(w.bySector.N >= 30 - 1e-6 && w.bySector.S > 50, `N ${w.bySector.N} S ${w.bySector.S}`);
});

test("the shell of one deep block leans: it opens farther on the flat side", () => {
  const cells = [];
  for (let k = 0; k < 8; k++) for (let j = 0; j < 21; j++) for (let i = 0; i < 21; i++) cells.push({ x: i * 10 + 5, y: j * 10 + 5, z: k * 10 + 5, dx: 10, dy: 10, dz: 10, value: i === 10 && j === 10 && k === 0 ? 60 : 0 });
  const inputs = { cells, unit: "g/t", element: "Au", price: 80, priceUnit: "g", recovery: 100, miningCost: 2, processingCost: 5, density: 2.5, slopeDeg: 45, revenueFactor: 1, size: null };
  const r = runPitShell({ ...inputs, sectorSlopes: { N: 30, S: 60 } });
  assert.ok(r.blocks > 0);
  // the pit's floor nodes: how far north and south of the ore block (y = 105) the mined columns reach at the top
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < r.positions.length; i += 3) { const y = r.positions[i + 1], z = r.positions[i + 2]; if (z < 79) { if (y < yMin) yMin = y; if (y > yMax) yMax = y; } }
  assert.ok(yMax - 105 > 105 - yMin + 10, `north ${yMax - 105} m, south ${105 - yMin} m`);
  assert.ok(r.walls.bySector.N < r.walls.bySector.S);
  const plain = runPitShell(inputs);
  assert.ok(plain.walls.bySector.N >= 45 - 1e-6 && plain.walls.bySector.S >= 45 - 1e-6);
});
