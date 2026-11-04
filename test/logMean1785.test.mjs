// TASKS.csv #1785 (review #1646, Kodiak) — block-averaging a log-normal property on its logs: a .res and a .con of the same inversion
// (con = 1 / res cell by cell) must merge to the same model
import test from "node:test";
import assert from "node:assert/strict";
import { coarsenUBCModel, wantsLogMean, coarsenRecord, MEAN_RULE } from "../src/lib/voxel.js";
import { coarsenBlockCells } from "../src/lib/blockModelCsv.js";

// 4 x 2 x 4 cells of 10 m; resistivity from 15 to 5,000 ohm.m, a conductor in one corner
const mesh = { nx: 4, ny: 2, nz: 4, x0: 0, y0: 0, z0: 0, dx: [10, 10, 10, 10], dy: [10, 10], dz: [10, 10, 10, 10] };
const res = Array.from({ length: 32 }, (_, i) => (i % 7 === 0 ? 15 : 200 + (i * 157) % 4800));
const con = res.map((v) => 1 / v);

test("#1785 on the logs, the merged resistivity is the reciprocal of the merged conductivity; the arithmetic mean was not", () => {
  assert.ok(wantsLogMean(res) && wantsLogMean(con));
  assert.ok(!wantsLogMean([1, 5, 9]), "under two decades");
  assert.ok(!wantsLogMean([-1, 5, 900]), "a negative value");
  const r = coarsenUBCModel(mesh, res, 2, 1, 2, { log: true }).values, c = coarsenUBCModel(mesh, con, 2, 1, 2, { log: true }).values;
  r.forEach((v, i) => assert.ok(Math.abs(v * c[i] - 1) < 1e-9, `cell ${i}: ${v} x ${c[i]}`));
  const ra = coarsenUBCModel(mesh, res, 2, 1, 2).values, ca = coarsenUBCModel(mesh, con, 2, 1, 2).values;
  assert.ok(ra.some((v, i) => Math.abs(v * ca[i] - 1) > 0.1), "arithmetic: they disagree");
  // a block of 15 and 5,000: geometric mean 273.9, arithmetic 2,507.5
  const two = coarsenUBCModel({ nx: 2, ny: 1, nz: 1, x0: 0, y0: 0, z0: 0, dx: [1, 1], dy: [1], dz: [1] }, [15, 5000], 2, 1, 1, { log: true }).values[0];
  assert.ok(Math.abs(two - Math.sqrt(15 * 5000)) < 1e-9);
  assert.equal(coarsenRecord({ shape: [4, 2, 4], factors: [2, 1, 2], cellsTo: 8, values: res, rule: MEAN_RULE.log }).rule, MEAN_RULE.log);
});

test("#1785 the block-model CSV merge: volume-weighted mean of log10 when asked", () => {
  const cells = res.map((v, i) => ({ x: 5 + 10 * (i % 4), y: 5 + 10 * (Math.floor(i / 4) % 2), z: 5 + 10 * Math.floor(i / 8), dx: 10, dy: 10, dz: 10, value: v }));
  const r = coarsenBlockCells(cells, 8, { log: true }).cells, c = coarsenBlockCells(cells.map((x) => ({ ...x, value: 1 / x.value })), 8, { log: true }).cells;
  assert.equal(r.length, c.length);
  r.forEach((x, i) => assert.ok(Math.abs(x.value * c[i].value - 1) < 1e-9));
});
