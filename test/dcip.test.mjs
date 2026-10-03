// TASKS.csv #322 — DC/IP line data helpers (src/lib/dcip.js).
import test from "node:test";
import assert from "node:assert/strict";
import { guessDcipColumns, parseDcipRows, lineGeometry, terrainProfile, pseudoPositions, sectionCells, slimDcipResult, savedLineToFile, sectionTableRows } from "../src/lib/dcip.js";
import { niceStep } from "../src/lib/dcipSectionImage.js";

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

test("#322 a saved line reloads through the normal parse path unchanged; section table rows; slim result", () => {
  const readings = [[0, 10, 20, 30], [0, null, 20, 30], [10, 20, 30, null], [5.5, 15.5, 25.5, 35.5]];
  const rho = [120.5, 98, 1e4, 0.75], ip = [3.2, 0, 11.75, 7];
  for (const withIp of [true, false]) {
    const entry = { name: "L100N", readings, rho, ip: withIp ? ip : null };
    const { file, mapping } = savedLineToFile(entry);
    assert.equal(file.name, "L100N");
    assert.equal(file.headers.length, withIp ? 6 : 5);
    const p = parseDcipRows(file.rows, mapping);
    assert.deepEqual(p.readings, readings);
    assert.deepEqual(p.rho, rho);
    assert.deepEqual(p.ip, withIp ? ip : null);
    assert.equal(p.skipped, 0);
  }
  const result = { cells: { s: [5, 15], z: [990, 980], ds: [10, 10], dz: [5, 5], resistivity: [100, 200], support: [0.5, 0.01], chargeability: [1, 2] },
    electrodes: [[0, 1000]], predicted: [1, 2, 3], standardDeviation: [1], history: [{}], phi_d: 4, target: 4, reachedTarget: true, iterations: 3,
    ip: { phi_d: 5, history: [{}], predicted: [1] }, mesh: { cell: 10 }, versions: { simpeg: "0.25.2" } };
  const slim = slimDcipResult(result);
  assert.equal(slim.predicted, undefined); assert.equal(slim.history, undefined);
  assert.deepEqual(slim.ip, { phi_d: 5 }); assert.deepEqual(slim.cells, result.cells);
  const geom = lineGeometry([1000, 2000], [1000, 2100]); // due north
  const rows = sectionTableRows(slim, geom);
  assert.deepEqual(rows[1], { distance_m: 15, x: 1000, y: 2015, z: 980, ds_m: 10, dz_m: 5, resistivity_ohmm: 200, chargeability_mVV: 2, support: 0.01 });
  assert.equal("chargeability_mVV" in sectionTableRows({ cells: { ...result.cells, chargeability: undefined } }, geom)[0], false);
  assert.equal(niceStep(0, 1000, 10), 100); assert.equal(niceStep(0, 230, 6), 50); assert.equal(niceStep(-120, -40, 4), 20);
});
