// TASKS.csv #683 — per-reading observed / predicted / normalised residual, and the saved section keeps predicted data
import { test } from "node:test";
import assert from "node:assert/strict";
import { dataFitRows, worstReadings, slimDcipResult } from "../src/lib/dcip.js";

const readings = [[0, 10, 20, 30], [10, 20, 30, 40], [20, 30, 40, 50]];
test("residuals are (obs - pred) / std, in file order; missing values give null", () => {
  const rows = dataFitRows(readings, [100, 200, 300], [110, 200, 240], [10, 20, 0]);
  assert.deepEqual(rows.map((r) => r.r), [-1, 0, null]);
  assert.equal(rows[0].s, 15); assert.equal(rows[0].depth, 10);
});
test("worst readings beyond k sigma, largest first", () => {
  const rows = dataFitRows(readings, [100, 200, 300], [160, 200, 240], [10, 20, 10]);
  assert.deepEqual(worstReadings(rows, 3).map((r) => r.i), [0, 2]);
});
test("a saved section keeps predicted and standard deviations (5 significant digits), DC and IP", () => {
  const res = { cells: { s: [], z: [], ds: [], dz: [], resistivity: [], support: [] }, electrodes: [], predicted: [123.456789], standardDeviation: [6.1728394],
    ip: { phi_d: 1, predicted: [12.3456789], standardDeviation: [0.5] } };
  const s = slimDcipResult(res);
  assert.deepEqual(s.predicted, [123.46]); assert.deepEqual(s.standardDeviation, [6.1728]);
  assert.deepEqual(s.ip.predicted, [12.346]); assert.deepEqual(s.ip.standardDeviation, [0.5]);
});

test("deepest pseudo-depth is half the largest current-to-potential separation", async () => {
  const { deepestPseudoDepth } = await import("../src/lib/dcip.js");
  assert.equal(deepestPseudoDepth([[0, 10, 20, 30], [0, 10, 500, 510]]), 250);
});

test("the file's error column is mapped and parsed, null where empty, and survives a saved line", async () => {
  const { guessDcipColumns, parseDcipRows, savedLineToFile, SAVED_LINE_HEADERS } = await import("../src/lib/dcip.js");
  const headers = ["T1X", "T2X", "R1X", "R2X", "RHO", "MX", "SD"];
  const map = guessDcipColumns(headers);
  assert.equal(map.err, "SD"); assert.equal(map.ip, "MX");
  const p = parseDcipRows([{ T1X: "100", T2X: "*", R1X: "0", R2X: "50", RHO: "120", MX: "3", SD: "0.4" }, { T1X: "100", T2X: "*", R1X: "50", R2X: "0", RHO: "90", MX: "2", SD: "*" }], map);
  assert.deepEqual(p.err, [0.4, null]);
  const back = savedLineToFile({ name: "L", readings: p.readings, rho: p.rho, ip: p.ip, err: p.err });
  assert.equal(back.mapping.err, "Error");
  assert.deepEqual(parseDcipRows(back.file.rows, back.mapping).err, [0.4, null]);
  assert.equal(SAVED_LINE_HEADERS.length, 6); // not mutated
});
