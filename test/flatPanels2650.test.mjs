// TASKS.csv #2650 — a flat body judged by grade-thickness in square panels, from the block model
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { flatPanels } from "../src/lib/flatPanels.js";

// a 100 x 50 m sheet of 10 m columns, 2 m blocks: the west half 4 m at 500 ppm (GT 2000), the east half 2 m at 300 ppm (GT 600), 2 m of
// 100 ppm below each (under the 200 ppm cut-off, not counted)
const sheet = () => {
  const cells = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 5; j++) {
    const x = 5 + i * 10, y = 5 + j * 10, west = i < 5;
    const ore = west ? [[101, 500], [99, 500]] : [[101, 300]];
    for (const [z, v] of ore) cells.push({ x, y, z, dx: 10, dy: 10, dz: 2, value: v });
    cells.push({ x, y, z: west ? 97 : 99, dx: 10, dy: 10, dz: 2, value: 100 });
  }
  return cells;
};

test("by hand: 50 m panels; the west panels reach a GT of 1000, the east do not", () => {
  const r = flatPanels(sheet(), { cutoff: 200, panelM: 50, gtCut: 1000, density: 2 });
  assert.equal(r.totals.panels, 2);
  const [w, e] = r.panels;
  assert.equal(w.area, 2500); assert.equal(w.minArea, 2500);
  assert.equal(w.thick, 4); assert.equal(w.grade, 500); assert.equal(w.gt, 2000); assert.equal(w.tonnes, 2500 * 4 * 2); assert.ok(w.ore);
  assert.equal(e.gt, 600); assert.equal(e.thick, 2); assert.ok(!e.ore);
  assert.equal(r.totals.orePanels, 1); assert.equal(r.totals.tonnes, 20000); assert.equal(r.totals.grade, 500); assert.equal(r.totals.thick, 4);
  assert.equal(r.totals.metal, 2500 * 2000 * 2); // GT x area x density: grade x tonnes
  // a GT cut-off of 600 takes both; one panel over the whole sheet averages the GT over its area
  assert.equal(flatPanels(sheet(), { cutoff: 200, panelM: 50, gtCut: 600, density: 2 }).totals.orePanels, 2);
  const one = flatPanels(sheet(), { cutoff: 200, panelM: 200, gtCut: 1000, density: 2 });
  assert.equal(one.totals.panels, 1); assert.equal(one.panels[0].gt, 1300); assert.ok(one.panels[0].ore);
});

test("partial coverage counts by its share; no input, no result", () => {
  const r = flatPanels([{ x: 5, y: 5, z: 1, dx: 10, dy: 10, dz: 4, value: 250, coverage: 0.5 }], { cutoff: 200, panelM: 10, gtCut: 0, density: 2 });
  assert.equal(r.panels[0].thick, 2); assert.equal(r.panels[0].gt, 500);
  assert.equal(flatPanels(sheet(), { cutoff: 200, panelM: 0, gtCut: 1, density: 2 }), null);
  assert.equal(flatPanels(sheet(), { cutoff: 200, panelM: 10, gtCut: 1 }), null);
  assert.equal(flatPanels([], { cutoff: 200, panelM: 10, gtCut: 1, density: 2 }), null);
});

test("Stope outlines offers the panels under its flat-body warning, with the pane's model, cut-off and density", () => {
  const p = fs.readFileSync("src/components/StopesPane.jsx", "utf8");
  assert.match(p, /\{flat\?\.flat && <FlatPanels model=\{models\.find\(\(m\) => m\.name === res\.model\) \|\| model\} cutoff=\{Number\(res\.inputs\?\.cutoff\)\} density=\{Number\(res\.inputs\?\.density\)\}/);
  const c = fs.readFileSync("src/components/FlatPanels.jsx", "utf8");
  assert.match(c, /useState\(""\), \[gtText, setGtText\] = useState\(""\)/); // no default panel or GT cut-off
});
