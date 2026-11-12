// TASKS.csv #1564 — Undrilled zones lists closed solids (with their volumes) apart from open meshes, which cannot be picked.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { solidChoices } from "../src/lib/solidChoices.js";

// a closed box a x b x c at the origin (8 vertices, 12 triangles), and the same box without its top (open)
function box(a, b, c, open = false) {
  const p = new Float64Array([0, 0, 0, a, 0, 0, a, b, 0, 0, b, 0, 0, 0, c, a, 0, c, a, b, c, 0, b, c]);
  const t = [0, 2, 1, 0, 3, 2, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, ...(open ? [] : [4, 5, 6, 4, 6, 7])];
  return { positions: p, indices: Uint32Array.from(t) };
}

test("closed solids first, largest first, with volumes; open meshes apart with their open edges", () => {
  const solids = [
    { id: "iso", name: "Isosurface 1500 (imported)", ...box(10, 10, 10, true) },
    { id: "s1", name: "Au > 1 ppm shell", ...box(2, 3, 4) },
    { id: "s2", name: "Au > 1 ppm shell", ...box(10, 10, 10) },
    { id: "empty", name: "nothing", positions: new Float64Array(), indices: new Uint32Array() },
  ];
  const c = solidChoices(solids);
  assert.deepEqual(c.closed.map((s) => [s.id, Math.round(s.volumeM3)]), [["s2", 1000], ["s1", 24]]);
  assert.deepEqual(c.open.map((s) => [s.id, s.openEdges]), [["iso", 4]]);
  // cached by the index array: the same answer again, without depending on a new positions copy
  const again = solidChoices([{ ...solids[1], positions: new Float64Array(solids[1].positions) }]);
  assert.equal(Math.round(again.closed[0].volumeM3), 24);
});

test("the pane: open meshes disabled in their own group, the route said, volumes in the closed names", () => {
  const s = fs.readFileSync("src/components/UndrilledZonesPane.jsx", "utf8");
  assert.match(s, /<optgroup label=\{tr\("Open meshes \(no inside to search\)"\)\}>/);
  assert.match(s, /<option key=\{s\.id\} value=\{s\.id\} disabled>/);
  assert.match(s, /Voxel ranges, on the Advanced ribbon > Shell at this range/); // #2261
  assert.doesNotMatch(s, /Close it first/);
});
