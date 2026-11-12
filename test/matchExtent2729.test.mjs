// TASKS.csv #2729 (split from #2598) — Estimation's 'Match <model>' took the matched model's lattice but the data's box, so a by-product
// estimate did not land on the same blocks. It now takes the model's own extent too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blockModelExtent, blockModelLattice } from "../src/lib/estimationMeta.js";

test("a block model's extent is its cells' box, on its own lattice", () => {
  const cells = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++) cells.push({ x: 1005 + i * 10, y: 2005 + j * 10, z: 95 - k * 5, dx: 10, dy: 10, dz: 5, value: 1 });
  const e = blockModelExtent({ cells });
  assert.deepEqual(e, { xmin: 1000, xmax: 1040, ymin: 2000, ymax: 2030, zmin: 87.5, zmax: 97.5 });
  const L = blockModelLattice({ cells });
  for (const [v, o, d] of [[e.xmin, L.ox, L.dx], [e.ymin, L.oy, L.dy], [e.zmin, L.oz, L.dz]]) assert.ok(Math.abs(((v - o) / d) - Math.round((v - o) / d)) < 1e-9, "on the lattice");
  assert.equal(blockModelExtent({ cells: [] }), null);
});

test("the dialog uses it when matching, and says so", () => {
  const g = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(g, /const matchedExtent = useMemo\(\(\) => \(matched \? blockModelExtent\(matched\.m\) : null\), \[matched\]\);/);
  assert.match(g, /const bounds = matchedExtent \|\| \(dataBounds && lattice \? snapBoundsToLattice\(dataBounds, lattice\) : dataBounds\);/);
  assert.match(g, /\{matchedExtent && <div[^>]*>\{tr\("The grid takes \{name\}'s blocks and its extent/);
});
