// TASKS.csv #2208 — holes fanned from one collar share one label ('first id +n'), every id in its tip
import test from "node:test";
import assert from "node:assert/strict";
import { groupSharedCollars, syncHoleLabels } from "../src/lib/viewer/holeLabels.js";

const fan = (id0, n, x, z) => Array.from({ length: n }, (_, i) => ({ id: `${id0}${i}`, x: x + i * 0.1, y: 0, z, zWorld: 100, depth: 150 + i }));

test("collars within 1 m group, in anchor order; others stay apart", () => {
  const anchors = [...fan("A", 4, 0, 0), ...fan("B", 3, 10, 0), { id: "C", x: 1.5, y: 0, z: 0, zWorld: 100, depth: 50 }];
  const g = groupSharedCollars(anchors);
  assert.deepEqual(g.map((x) => x.map((a) => a.id)), [["A0", "A1", "A2", "A3"], ["B0", "B1", "B2"], ["C"]]);
  assert.equal(groupSharedCollars([]).length, 0);
});

test("one sprite per shared collar, with the count and every id in the tip", () => {
  const made = [];
  const group = { children: [], add(s) { this.children.push(s); } };
  const makeSprite = (text) => { const s = { text, position: { set() {} } }; made.push(text); return s; };
  const n = syncHoleLabels(group, [...fan("WB081", 7, 0, 0), { id: "WB0900D", x: 50, y: 0, z: 0, zWorld: 100, depth: 80 }], "hole_id_depth", makeSprite);
  assert.equal(n, 2);
  assert.deepEqual(made, ["WB0810 (150m) +6", "WB0900D (80m)"]);
  assert.equal(group.children[0].userData.tip.split("\n").length, 7);
});
