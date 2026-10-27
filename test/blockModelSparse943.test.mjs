// TASKS.csv #943 — a sparse sub-blocked model (sub-blocks only where the domain edge is) merged to fit the cell budget:
// the merged cells are full cells, so each carries the share the source blocks filled, and the CSV writes the real volume
import { test } from "node:test";
import assert from "node:assert/strict";
import { coarsenBlockCells } from "../src/lib/blockModelCsv.js";
import { blockModelRows, blockModelParamLines } from "../src/lib/blockModelExport.js";

// the review's Micromine-style file: 12 parents 10 x 10 x 5 m, plus 2 sub-blocks 5 x 5 x 2.5 m at 3.3 and 4.4 g/t
function sparseModel() {
  const cells = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) cells.push({ x: 5 + 10 * i, y: 5 + 10 * j, z: 2.5, dx: 10, dy: 10, dz: 5, value: 0 });
  cells.push({ x: 42.5, y: 2.5, z: 1.25, dx: 5, dy: 5, dz: 2.5, value: 3.3 });
  cells.push({ x: 42.5, y: 7.5, z: 1.25, dx: 5, dy: 5, dz: 2.5, value: 4.4 });
  return cells;
}
const vol = (c) => c.dx * c.dy * c.dz;

test("#943 merged cells carry their coverage: the covered volume and metal are the source model's", () => {
  const src = sparseModel();
  const srcVol = src.reduce((s, c) => s + vol(c), 0), srcMetal = src.reduce((s, c) => s + vol(c) * c.value, 0);
  const { cells, factors, sourceM3, mergedM3 } = coarsenBlockCells(src, 6);
  assert.ok(factors && cells.length <= 6);
  assert.ok(Math.abs(sourceM3 - srcVol) < 1e-6, `${sourceM3} vs ${srcVol}`);
  assert.ok(mergedM3 > srcVol * 1.1, `the full cells are larger: ${mergedM3} vs ${srcVol}`);
  const covVol = cells.reduce((s, c) => s + c.coverage * vol(c), 0), covMetal = cells.reduce((s, c) => s + c.coverage * vol(c) * c.value, 0);
  assert.ok(Math.abs(covVol - srcVol) < 1e-6, `covered volume ${covVol} vs ${srcVol}`);
  assert.ok(Math.abs(covMetal / covVol - srcMetal / srcVol) < 1e-9, "the covered mean is the model's");
  assert.ok(cells.every((c) => c.coverage > 0 && c.coverage <= 1));
  assert.ok(cells.some((c) => c.coverage < 0.5), "the cell holding only the two sub-blocks is mostly empty");
});

test("#943 the CSV export writes COVERAGE and VOLUME_M3 for merged cells, and says what they are", () => {
  const { cells } = coarsenBlockCells(sparseModel(), 6);
  const model = { name: "bm (AU)", cells };
  const rows = blockModelRows(model);
  assert.ok(rows.every((r) => r.COVERAGE > 0 && Math.abs(r.VOLUME_M3 - r.COVERAGE * r.XINC * r.YINC * r.ZINC) <= 1e-4 * r.XINC * r.YINC * r.ZINC));
  assert.ok(Math.abs(rows.reduce((s, r) => s + r.VOLUME_M3, 0) - 6125) < 0.1);
  assert.ok(blockModelParamLines(model).some((l) => l.startsWith("COVERAGE:")));
  // a model that was not merged has neither column
  const plain = blockModelRows({ name: "x", cells: [{ x: 1, y: 1, z: 1, dx: 2, dy: 2, dz: 2, value: 1 }] });
  assert.equal(plain[0].COVERAGE, undefined);
  assert.equal(plain[0].VOLUME_M3, undefined);
});
