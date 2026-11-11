// TASKS.csv #2110 / #2115 / #2119 — the coarsening line names the size that changed; a by-product on another grid said on pick; the
// 'hide the earlier pits' box says when it acts
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runPitShell, joinByProduct } from "../src/lib/pitShell.js";

const cells = (o = 0) => { const c = []; for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) for (let k = 0; k < 4; k++) c.push({ x: 505 + o + i * 10, y: 505 + j * 10, z: 995 - k * 12.5, dx: 10, dy: 10, dz: 12.5, value: 3 }); return c; };

test("the pit reports the model's bench height beside its plan cell", () => {
  const r = runPitShell({ unit: "g/t", element: "Au", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 15, density: 2.7, slopeDeg: 45, cells: cells() }, { groundAt: () => 1000 });
  assert.equal(r.modelCellM, 10); assert.equal(r.modelCellZM, 12.5);
});

test("another grid matches no block centre (what the pane now tests on pick)", () => {
  assert.equal(joinByProduct(cells(), cells(5)).matched, 0);
  assert.equal(joinByProduct(cells(), cells()).matched, 144);
});

test("the pane's lines", () => {
  const p = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  assert.ok(p.includes("The grid's blocks are {s} m: the benches were made taller than the block model's {h} m to stay within the cell limit; the plan cells keep {c} m."));
  assert.match(p, /rel: Math\.abs\(res\.cell\[0\] - \(res\.modelCellM \|\| 0\)\) < 1e-6 \? tr\("the same as"\)/);
  assert.match(p, /const byGridMiss = useMemo\(\(\) => \(model && byModel \? joinByProduct\(model\.cells, byModel\.cells\)\.matched === 0 : false\)/);
  assert.match(p, /const byBad = !!byModel && \(byGridMiss \|\|/);
  assert.ok(p.includes('tr("Hide the earlier pits when this one is made")'));
});
