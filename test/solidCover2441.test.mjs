// TASKS.csv #2441 / #2599 — a solid from strings says what share of it the blocks fill and the metal they hold
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { solidTonnage, extrudeString } from "../src/lib/stringSolids.js";
import { pitMetalOf, metalAmountText } from "../src/lib/pitShell.js";

test("a 100 x 100 x 100 m solid with 350 blocks in it: 35 % covered, Li metal of the blocks", () => {
  const r = extrudeString([[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]], 0, 100);
  assert.ok(r && Math.abs(r.volume - 1e6) < 1, String(r?.volume));
  const cells = []; for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) for (let k = 0; k < 4; k++) if (k < 3 || (i + j) % 2 === 0) cells.push({ x: 5 + i * 10, y: 5 + j * 10, z: 5 + k * 10, dx: 10, dy: 10, dz: 10, value: 0.25 });
  const t = solidTonnage(r.positions, r.indices, cells, 2.7);
  assert.equal(t.blocks, 350);
  assert.ok(Math.abs(t.tonnes / (1e6 * 2.7) - 0.35) < 1e-9);
  const m = pitMetalOf("%", "Li");
  assert.match(metalAmountText(t.metalU * m.factor, m.unit, "Li", (v) => String(Math.round(v))), /^2363 t Li \(/); // 945,000 t x 0.25 % = 2,362.5 t
});

test("the pane appends it", () => {
  const p = fs.readFileSync("src/components/DesignStringsPane.jsx", "utf8");
  assert.match(p, /\+ solidCoverText\(tonnage, tonnes\) \/\* #2441 \/ #2599 \*\//);
  assert.match(p, /share < 0\.95 \? " " \+ tr\("The blocks fill \{p\} % of the solid/);
});
