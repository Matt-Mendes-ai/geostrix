// TASKS.csv #3790 — the comparison and the proposal use the element's LARGEST closed shell, not the newest (a forced 1,059 m³ envelope hid a 0.67 Mm³ shell)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { shellComparison } from "../src/lib/shellCompare.js";

// an axis-aligned cube as a closed mesh: side s
const cube = (s) => {
  const v = [0, 0, 0, s, 0, 0, s, s, 0, 0, s, 0, 0, 0, s, s, 0, s, s, s, s, 0, s, s];
  const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { vertices: Float32Array.from(v), indices: Uint32Array.from(i) };
};
const shell = (id, side) => ({ id, name: `Au > 1 g/t shell ${id}`, ...cube(side), params: { tool: "numeric grade shell", element: "Au", cutoff: 1 } });
const model = { params: { element: "Au" }, cells: [{ value: 2, dx: 10, dy: 10, dz: 10 }] };

test("the largest shell of the element is the comparison, whatever its age", () => {
  const big = shell("a", 100), slim = shell("b", 10); // the slim envelope is the newest
  const cmp = shellComparison(model, [big, slim]);
  assert.equal(cmp.id, "a");
  assert.ok(Math.abs(cmp.shellM3 - 1e6) < 1);
  assert.equal(shellComparison(model, [slim, big]).id, "a", "in either order");
  assert.equal(shellComparison(model, [shell("c", 10), shell("d", 10)]).id, "d", "equal volumes: the newest");
});
test("wired: the proposal reads the same rule and small volumes print in m³", () => {
  const e = fs.readFileSync(new URL("../src/lib/estimatePlane.js", import.meta.url), "utf8");
  assert.match(e, /if \(!best \|\| v >= bestV\)/);
  const g = fs.readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(g, /shellCmp\.shellM3 < 1e4/);
});
