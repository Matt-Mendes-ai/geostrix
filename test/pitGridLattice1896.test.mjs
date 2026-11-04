// TASKS.csv #1896 — the pit grid stays on the block lattice whatever the slope, so a 1-degree change cannot move the origin and
// split every block over four columns; the margin then only rises (or holds) as the walls steepen
import test from "node:test";
import assert from "node:assert/strict";
import { buildPitGrid, runPitShell, pitEconomics } from "../src/lib/pitShell.js";
import { transformSync } from "esbuild";
import { readFileSync } from "node:fs";
// parseFactors / droppedFactors live in the Nested pits pane (JSX): lift the two pure functions out of the transformed source
const paneSrc = transformSync(readFileSync(new URL("../src/components/NestedPitsPane.jsx", import.meta.url), "utf8"), { loader: "jsx", format: "esm" }).code;
const fnSrc = ["parseFactors", "droppedFactors"].map((n) => { const m = new RegExp(`function ${n}\\(text\\) \\{[\\s\\S]*?\\n\\}`).exec(paneSrc); return m[0]; }).join("\n");
const { parseFactors, droppedFactors } = new Function(`${fnSrc}; return { parseFactors, droppedFactors };`)();

function model() {
  const cells = [];
  for (let k = 0; k < 6; k++) for (let j = 0; j < 15; j++) for (let i = 0; i < 15; i++) {
    const r = Math.hypot(i - 7, j - 7);
    cells.push({ x: 1000 + i * 20 + 10, y: 2000 + j * 20 + 10, z: 500 + k * 20 + 10, dx: 20, dy: 20, dz: 20, value: r < 3 && k < 4 ? 2.5 : 0.05 });
  }
  return cells;
}
const inputs = { unit: "g/t", element: "Au", price: 80, priceUnit: "g", recovery: 90, miningCost: 2, processingCost: 10, density: 2.5, revenueFactor: 1, size: null };

test("the grid origin is a whole number of cells from the blocks' edge at every slope", () => {
  const cells = model(), eco = pitEconomics(inputs);
  for (const slopeDeg of [30, 38, 44, 45, 46, 50, 55, 63]) {
    const g = buildPitGrid(cells, { slopeDeg, density: 2.5, economics: eco, miningCost: 2, processingCost: 10 });
    const offX = ((1000 - g.x0) / g.dx), offY = ((2000 - g.y0) / g.dy);
    assert.ok(Math.abs(offX - Math.round(offX)) < 1e-9 && Math.abs(offY - Math.round(offY)) < 1e-9, `slope ${slopeDeg}: origin ${offX}, ${offY} cells off the lattice`);
    assert.ok(g.x0 <= 1000 - (560 - 500) / Math.tan((slopeDeg * Math.PI) / 180) + 1e-9, "the reach is still covered");
  }
});

test("steeper walls never lower the margin on the same blocks", () => {
  const cells = model();
  let last = -Infinity;
  for (const slopeDeg of [35, 40, 45, 50, 55]) {
    const r = runPitShell({ ...inputs, cells, slopeDeg });
    assert.ok(r.money >= last - 1e-6, `slope ${slopeDeg}: $${r.money} after $${last}`);
    last = r.money;
  }
});

test("the factor list is unique and ascending, and says what it dropped (#1901)", () => {
  assert.deepEqual(parseFactors("1,1,1"), [1]);
  assert.deepEqual(parseFactors("1 0.8 0.6"), [0.6, 0.8, 1]);
  assert.deepEqual(parseFactors("0, -1, 2"), [2]);
  assert.deepEqual(droppedFactors("0, -1, 2"), [0, -1]);
  assert.deepEqual(droppedFactors("0.4-1.2 step 0.2"), []);
  assert.deepEqual(parseFactors("0.4-0.8 step 0.2"), [0.4, 0.6, 0.8]);
});
