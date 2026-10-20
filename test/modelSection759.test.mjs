// TASKS.csv #759 — modelled lithology on cross-sections: section grids, which sections a run evaluates, packing.
import test from "node:test";
import assert from "node:assert/strict";
import { sectionGrid, pickSections, sameLine, packUnits, unpackUnits, sectionPixels, blockSpacing, sectionZRange } from "../src/lib/modelSection.js";

test("grid: spacing >= the minimum, row 0 on top, capped, nodes above the ground left out", () => {
  const g = sectionGrid({ x: 0, y: 0 }, { x: 300, y: 400 }, 0, 100, { maxPts: 1e6, minSpacing: 5 }); // 500 m line
  assert.equal(g.nx, 100); assert.equal(g.ny, 20); assert.equal(g.nodes.length, 2000);
  assert.ok(g.nodes[0].z > g.nodes[1].z && g.nodes[0].j === 0);
  assert.ok(Math.abs(g.nodes[0].x - 1.5) < 1e-9 && Math.abs(g.nodes[0].y - 2) < 1e-9); // half a cell along the line
  const capped = sectionGrid({ x: 0, y: 0 }, { x: 1000, y: 0 }, 0, 500, { maxPts: 4000, minSpacing: 2 });
  assert.ok(capped.nodes.length <= 4100 && capped.nodes.length >= 3800, String(capped.nodes.length));
  // ground at 50 m: only nodes at or below it (and none above, where the model is air)
  const clipped = sectionGrid({ x: 0, y: 0 }, { x: 100, y: 0 }, 0, 100, { maxPts: 1e6, minSpacing: 10, groundAt: () => 50 });
  assert.equal(clipped.nodes.length, 10 * 5);
  assert.ok(clipped.nodes.every((n) => n.z <= 50));
  // off the terrain (NaN): kept
  assert.equal(sectionGrid({ x: 0, y: 0 }, { x: 100, y: 0 }, 0, 100, { maxPts: 1e6, minSpacing: 10, groundAt: () => NaN }).nodes.length, 100);
  assert.equal(sectionGrid({ x: 0, y: 0 }, { x: 0, y: 0 }, 0, 100), null);
});

test("pick: single sections before fence series, newest first, budget shared", () => {
  const S = (id, groupId) => ({ id, ax: 0, ay: 0, bx: 100, by: 0, ...(groupId ? { groupId } : {}) });
  const all = [S("a"), S("f1", "g"), S("b"), S("f2", "g"), S("c"), { id: "bad", ax: 0, ay: 0, bx: 0, by: 0 }];
  const p = pickSections(all, { maxSections: 4, perSection: 4000, total: 10000 });
  assert.deepEqual(p.sections.map((s) => s.id), ["c", "b", "a", "f2"]);
  assert.equal(p.perSection, 2500);
  assert.equal(pickSections([], {}).perSection, 0);
  assert.equal(pickSections([S("x")]).perSection, 8000);
  assert.equal(pickSections([S("x"), S("y"), S("z"), S("w"), S("v")]).perSection, 2000);
  assert.equal(pickSections([S("x"), S("y"), S("z"), S("w"), S("v")]).sections.length, 4);
});

test("same line, unit packing round trip, pixels", () => {
  assert.ok(sameLine({ ax: 1, ay: 2, bx: 3, by: 4 }, { ax: 1, ay: 2, bx: 3, by: 4 }));
  assert.ok(!sameLine({ ax: 1, ay: 2, bx: 3, by: 4.5 }, { ax: 1, ay: 2, bx: 3, by: 4 }));
  const u = ["A", null, "B", "A"];
  const p = packUnits(u);
  assert.deepEqual(p.labels, ["A", "B"]);
  assert.deepEqual([...p.codes], [0, -1, 1, 0]);
  assert.deepEqual(unpackUnits(p), u);
  const g = { nx: 2, ny: 2, nodes: [{ i: 0, j: 0 }, { i: 1, j: 1 }] };
  const px = sectionPixels(g, ["A", null], () => "#102030");
  assert.deepEqual([...px.slice(0, 4)], [16, 32, 48, 255]);
  assert.equal(px[15], 0);
  assert.deepEqual(blockSpacing({ extent: [0, 100, 0, 200, 0, 50], resolution: [10, 10, 5] }), { horizontal: 10, vertical: 10 });
});

test("z range: the holes near the line, padded, inside the model box", () => {
  const a = { x: 0, y: 0 }, b = { x: 1000, y: 0 };
  const pts = [{ x: 100, y: 10, z: 900 }, { x: 200, y: -20, z: 500 }, { x: 300, y: 500, z: -2000 }, { x: -50, y: 0, z: 5000 }];
  assert.deepEqual(sectionZRange(pts, a, b, 50, -1000, 2000), [400, 1000]); // span 400, pad 100; the far ones ignored
  assert.deepEqual(sectionZRange(pts, a, b, 50, 450, 950), [450, 950]);
  assert.deepEqual(sectionZRange([{ x: 10, y: 0, z: 700 }], a, b, 50, 0, 2000), [675, 725]); // one point: 25 m pad
  assert.deepEqual(sectionZRange([], a, b, 50, 0, 2000), [0, 2000]);
});
