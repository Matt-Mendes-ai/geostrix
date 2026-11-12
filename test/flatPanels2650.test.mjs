// TASKS.csv #2650 — a flat body taken in square panels judged by grade × thickness: #2419's plan grid from the drillholes, or a block
// model's columns as the same kind of grid
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gridPanels, blockModelGrid } from "../src/lib/flatPanels.js";
import { planGrid } from "../src/lib/accumulation.js";

// a 100 x 50 m sheet of 10 m columns, 2 m blocks: the west half 4 m at 500 ppm (GT 2000), the east half 2 m at 300 ppm (GT 600), 2 m of
// 100 ppm under each (below the 200 ppm cut-off, not counted)
const sheet = () => {
  const cells = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 5; j++) {
    const x = 5 + i * 10, y = 5 + j * 10, west = i < 5;
    for (const [z, v] of west ? [[101, 500], [99, 500]] : [[101, 300]]) cells.push({ x, y, z, dx: 10, dy: 10, dz: 2, value: v });
    cells.push({ x, y, z: west ? 97 : 99, dx: 10, dy: 10, dz: 2, value: 100 });
  }
  return cells;
};

test("a block model as a plan grid: thickness and GT per column at the cut-off; 0 inside the model, NaN outside", () => {
  const g = blockModelGrid(sheet(), 200);
  assert.equal(g.nx, 10); assert.equal(g.ny, 5); assert.equal(g.cell, 10);
  assert.equal(g.thickness[0], 4); assert.equal(g.gt[0], 2000); assert.equal(g.gt[9], 600); assert.equal(g.thickness[9], 2);
  const holey = blockModelGrid([{ x: 5, y: 5, z: 1, dx: 10, dy: 10, dz: 2, value: 50 }, { x: 25, y: 5, z: 1, dx: 10, dy: 10, dz: 4, value: 250, coverage: 0.5 }], 200);
  assert.deepEqual([...holey.gt], [0, NaN, 500]); assert.deepEqual([...holey.thickness], [0, NaN, 2]);
  assert.equal(blockModelGrid([], 1), null); assert.equal(blockModelGrid(sheet(), NaN), null);
});

test("by hand: 50 m panels; the west panel reaches a GT of 1000, the east does not", () => {
  const r = gridPanels(blockModelGrid(sheet(), 200), { panelM: 50, gtCut: 1000, density: 2 });
  assert.equal(r.totals.panels, 2);
  const [w, e] = r.panels;
  assert.equal(w.area, 2500); assert.equal(w.thick, 4); assert.equal(w.gt, 2000); assert.equal(w.tonnes, 2500 * 4 * 2); assert.ok(w.ore);
  assert.equal(e.gt, 600); assert.equal(e.thick, 2); assert.ok(!e.ore);
  assert.equal(r.totals.orePanels, 1); assert.equal(r.totals.tonnes, 20000); assert.equal(r.totals.grade, 500); assert.equal(r.totals.thick, 4);
  assert.equal(gridPanels(blockModelGrid(sheet(), 200), { panelM: 50, gtCut: 600, density: 2 }).totals.orePanels, 2);
  const one = gridPanels(blockModelGrid(sheet(), 200), { panelM: 200, gtCut: 1000, density: 2 });
  assert.equal(one.totals.panels, 1); assert.equal(one.panels[0].gt, 1300); assert.ok(one.panels[0].ore); // a mean over the whole sheet
  assert.equal(gridPanels(null, { panelM: 50, gtCut: 1, density: 2 }), null);
  assert.equal(gridPanels(blockModelGrid(sheet(), 200), { panelM: 0, gtCut: 1, density: 2 }), null);
});

test("#2419's plan grid from the drillholes cuts into the same panels; unestimated nodes are left out", () => {
  const holes = [{ x: 0, y: 0, gt: 2000, thicknessM: 4 }, { x: 40, y: 0, gt: 2000, thicknessM: 4 }, { x: 200, y: 0, gt: 0, thicknessM: 0 }, { x: 240, y: 0, gt: 0, thicknessM: 0 }];
  const grid = planGrid(holes, { cell: 10, radius: 30 });
  const r = gridPanels(grid, { panelM: 100, gtCut: 1000, density: 2 });
  assert.ok(r.totals.orePanels >= 1 && r.panels.some((p) => !p.ore), JSON.stringify(r.panels.map((p) => [p.i, p.ore, Math.round(p.gt)])));
  const nodes = r.panels.reduce((s, p) => s + p.nodes, 0);
  assert.equal(nodes, grid.estimated);
});

test("the panes: Stope outlines' flat-body panels from the block model, Grade × thickness in plan's Panel side", () => {
  const p = fs.readFileSync("src/components/StopesPane.jsx", "utf8");
  assert.match(p, /\{flat\?\.flat && <FlatPanels model=\{models\.find\(\(m\) => m\.name === res\.model\) \|\| model\} cutoff=\{Number\(res\.inputs\?\.cutoff\)\} density=\{Number\(res\.inputs\?\.density\)\}/);
  const c = fs.readFileSync("src/components/FlatPanels.jsx", "utf8");
  assert.match(c, /blockModelGrid\(model\.cells, cutoff\)/); assert.match(c, /gridPanels\(grid, \{ panelM, gtCut, density \}\)/);
  assert.match(c, /useState\(""\), \[gtText, setGtText\] = useState\(""\)/); // no default panel or GT cut-off
  const g = fs.readFileSync("src/components/GradeThicknessModal.jsx", "utf8");
  assert.match(g, /gridPanels\(grid, \{ panelM: Number\(panelText\), gtCut: gtc, density: Number\(density\) \}\)/);
});
