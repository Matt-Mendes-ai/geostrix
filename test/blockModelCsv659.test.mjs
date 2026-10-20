// TASKS.csv #659 — Micromine sub-blocked block models: size columns and a volume-preserving coarsener
import { test } from "node:test";
import assert from "node:assert/strict";
import { guessBlockModelMapping, blockModelCellsFromRows, coarsenBlockCells } from "../src/lib/blockModelCsv.js";

test("Micromine _EAST / _NORTH / _RL are the block sizes, not attributes", () => {
  const headers = ["EAST", "NORTH", "RL", "_EAST", "_NORTH", "_RL", "AU_PPM"];
  const rows = [{ EAST: 5, NORTH: 5, RL: 2.5, _EAST: 10, _NORTH: 10, _RL: 5, AU_PPM: 1 }, { EAST: 11.25, NORTH: 1.25, RL: 0.625, _EAST: 2.5, _NORTH: 2.5, _RL: 1.25, AU_PPM: 2 }];
  const g = guessBlockModelMapping(headers, rows);
  assert.deepEqual(g.mapping, { x: "EAST", y: "NORTH", z: "RL", dx: "_EAST", dy: "_NORTH", dz: "_RL" });
  assert.deepEqual(g.attributes, ["AU_PPM"]);
  const { cells, inferred } = blockModelCellsFromRows(rows, g.mapping, "AU_PPM");
  assert.equal(inferred, null);
  assert.deepEqual([cells[0].dx, cells[0].dy, cells[0].dz], [10, 10, 5]);
  // the generic and Datamine names still map as before
  assert.equal(guessBlockModelMapping(["XC", "YC", "ZC", "XINC", "YINC", "ZINC", "CU"], [{ XC: 1, YC: 1, ZC: 1, XINC: 2, YINC: 2, ZINC: 2, CU: 3 }]).mapping.dx, "XINC");
});

test("coarsening a sub-blocked model keeps its volume and its volume-weighted mean", () => {
  // 10 x 10 x 5 m parents on a 6 x 6 x 6 lattice; every other parent split into 2.5 x 2.5 x 1.25 m sub-blocks
  const cells = [];
  let vol = 0, metal = 0, k = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) for (let l = 0; l < 6; l++) {
    const x = i * 10, y = j * 10, z = l * 5, g = (i + 2 * j + 3 * l) % 7;
    if ((k++) % 2) { cells.push({ x: x + 5, y: y + 5, z: z + 2.5, dx: 10, dy: 10, dz: 5, value: g }); vol += 500; metal += 500 * g; }
    else for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
      const v = g + 0.1 * a;
      cells.push({ x: x + 1.25 + 2.5 * a, y: y + 1.25 + 2.5 * b, z: z + 0.625 + 1.25 * c, dx: 2.5, dy: 2.5, dz: 1.25, value: v });
      vol += 7.8125; metal += 7.8125 * v;
    }
  }
  const { cells: out, factors } = coarsenBlockCells(cells, 2000);
  assert.ok(out.length <= 2000 && factors, `${out.length}`);
  const outVol = out.reduce((s, c) => s + c.dx * c.dy * c.dz, 0);
  const outMetal = out.reduce((s, c) => s + c.dx * c.dy * c.dz * c.value, 0);
  assert.ok(Math.abs(outVol - vol) / vol < 1e-9, `volume ${outVol} vs ${vol}`);
  assert.ok(Math.abs(outMetal / outVol - metal / vol) < 1e-9, `mean ${outMetal / outVol} vs ${metal / vol}`);
});

test("a regular model coarsens exactly as before", () => {
  const cells = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) cells.push({ x: i * 5 + 2.5, y: j * 5 + 2.5, z: 2.5, dx: 5, dy: 5, dz: 5, value: i + j });
  const { cells: out, factors } = coarsenBlockCells(cells, 100);
  assert.deepEqual(factors, { fx: 2, fy: 2, fz: 1 });
  assert.equal(out.length, 100);
  const c = out.find((q) => q.x === 5 && q.y === 5);
  assert.equal(c.value, 1); // mean of 0, 1, 1, 2
});
