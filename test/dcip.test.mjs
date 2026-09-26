// TASKS.csv #322 — DC/IP line data helpers (src/lib/dcip.js).
import test from "node:test";
import assert from "node:assert/strict";
import { guessDcipColumns, parseDcipRows, lineGeometry, terrainProfile, pseudoPositions, sectionCells } from "../src/lib/dcip.js";

test("#322 columns guessed, poles kept as null, bad rows skipped, spacing and array type", () => {
  const map = guessDcipColumns(["C1", "C2", "P1", "P2", "Rho_a (ohm.m)", "M (mV/V)", "Line"]);
  assert.deepEqual(map, { a: "C1", b: "C2", m: "P1", n: "P2", rho: "Rho_a (ohm.m)", ip: "M (mV/V)" });
  const rows = [
    { A: "0", B: "", M: "20", N: "30", R: "105.2", IP: "12" },
    { A: "10", B: "", M: "30", N: "40", R: "98,5", IP: "11" },   // comma decimal
    { A: "20", B: "", M: "40", N: "50", R: "-3", IP: "10" },     // not a resistivity
    { A: "30", B: "", M: "50", N: "60", R: "101", IP: "*" },     // no chargeability -> skipped when IP is mapped
  ];
  const p = parseDcipRows(rows, { a: "A", b: "B", m: "M", n: "N", rho: "R", ip: "IP" });
  assert.deepEqual(p.readings, [[0, null, 20, 30], [10, null, 30, 40]]);
  assert.deepEqual(p.rho, [105.2, 98.5]);
  assert.deepEqual(p.ip, [12, 11]);
  assert.equal(p.skipped, 2);
  assert.equal(p.spacing, 10);
  assert.deepEqual(p.span, [0, 40]);
  assert.equal(p.array, "pole-dipole");
  assert.equal(parseDcipRows(rows.slice(0, 2), { a: "A", b: "B", m: "M", n: "N", rho: "R" }).ip, null);
});

test("#322 line geometry, terrain profile along it, pseudo positions, 3D cells on the line", () => {
  const g = lineGeometry([1000, 2000], [1300, 2400]); // 300 E, 400 N -> 500 m, azimuth 36.87
  assert.equal(g.length, 500);
  assert.ok(Math.abs(g.azimuth - 36.8699) < 1e-3);
  assert.deepEqual(g.at(250), [1150, 2200]);
  const terrain = { bbox: [0, 0, 5000, 5000], gridW: 2, gridH: 2, elevations: [500, 500, 500, 500] };
  const prof = terrainProfile(terrain, g, -50, 550, 5);
  assert.deepEqual(prof.map((p) => p[1]), [500, 500, 500, 500, 500]);
  assert.equal(terrainProfile(terrain, lineGeometry([4900, 100], [6000, 100]), 0, 1000, 3), null); // leaves the terrain
  assert.deepEqual(pseudoPositions([[0, 10, 30, 40], [0, null, 20, 30]]), [{ s: 20, depth: 15 }, { s: 12.5, depth: 12.5 }]);
  const res = { cells: { s: [100], z: [480], ds: [5], dz: [2.5], resistivity: [20], support: [0.5] } };
  const [c] = sectionCells(res, g, "resistivity", 10);
  assert.deepEqual([c.x, c.y, c.z, c.value], [1060, 2080, 480, 20]);
  assert.ok(Math.abs(c.dx - (0.6 * 5 + 0.8 * 10)) < 1e-9 && Math.abs(c.dy - (0.8 * 5 + 0.6 * 10)) < 1e-9);
});
