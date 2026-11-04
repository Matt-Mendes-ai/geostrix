// TASKS.csv #1780 (review #1646, Kodiak) — a shell of a block model at a value range
import test from "node:test";
import assert from "node:assert/strict";
import { voxelShell } from "../src/lib/voxelShell.js";

// a 10 x 10 x 10 model of 10 m blocks, value = the distance from the centre (a "low" at the middle)
function model(size = 10) {
  const cells = [];
  for (let k = 0; k < size; k++) for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = 5 + i * 10, y = 5 + j * 10, z = 5 + k * 10;
    cells.push({ x, y, z, dx: 10, dy: 10, dz: 10, value: Math.hypot(x - 50, y - 50, z - 50) });
  }
  return { cells, min: 0, max: 90 };
}

test("#1780 a 'low' (value <= 25) in the middle of the model is a closed shell whose volume is near the cells' own", () => {
  const r = voxelShell(model(), { hi: 25 });
  assert.ok(r && r.indices.length > 0);
  assert.equal(r.closingVertices, 0, "it does not touch the model's edge");
  assert.deepEqual(r.nodes, [11, 11, 11], "nodes from edge to edge at the 10 m cell"); assert.deepEqual(r.spacing, [10, 10, 10]);
  const sphere = (4 / 3) * Math.PI * 25 ** 3;
  assert.ok(Math.abs(r.volumeM3 - sphere) / sphere < 0.35, `${r.volumeM3} vs ${sphere}`);
  assert.ok(r.cellsInside > 50 && Math.abs(r.cellVolumeM3 - r.cellsInside * 1000) < 1e-6);
});

test("#1780 a 'high' (value >= 60) reaches the model's edge and is closed there, said by closingVertices", () => {
  const r = voxelShell(model(), { lo: 60 });
  assert.ok(r && r.closingVertices > 0);
  assert.ok(r.volumeM3 > 0 && r.volumeM3 < 1e6);
});

test("#1780 a band, an empty range, and a model that is not rectilinear", () => {
  const band = voxelShell(model(), { lo: 20, hi: 40 });
  assert.ok(band && band.cellsInside > 0 && band.closingVertices === 0);
  assert.equal(voxelShell(model(), { lo: 500 }), null);
  const m = model(); m.cells[0] = { ...m.cells[0], dx: 20 }; // a block spanning two intervals: sub-blocked
  assert.equal(voxelShell(m, { hi: 25 }), null);
  // a tensor mesh (padding cells 30 m wide) is resampled at the typical 10 m
  const t = model(); t.cells = t.cells.map((c) => (c.x < 10 ? { ...c, x: -5, dx: 30 } : c));
  const rt = voxelShell(t, { hi: 25 });
  assert.ok(rt && rt.nodes[0] > 10 && rt.spacing[0] === 10);
});
