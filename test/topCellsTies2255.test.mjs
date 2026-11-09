// TASKS.csv #2255 (review #2174, WA gold) — equal top scores are ranked by the cells around them and flagged as tied
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { topCells } from "../src/lib/evidence.js";

// a 20 x 20 grid of 10 m cells, 0.2 everywhere; a 3 x 3 plateau of 0.629 at (5..7, 5..7) and a lone 0.629 cell at (15, 15)
const nx = 20, ny = 20, g = { nx, ny, dx: 10, dy: 10, x0: 0, yTop: 200 };
const score = new Float32Array(nx * ny).fill(0.2);
for (let j = 5; j <= 7; j++) for (let i = 5; i <= 7; i++) score[j * nx + i] = 0.629;
score[15 * nx + 15] = 0.629;

test("the plateau's middle cell comes first (its neighbours score high too), the lone cell after; both flagged as tied", () => {
  const top = topCells(score, g, { n: 3 });
  assert.equal(top[0].i, 6); assert.equal(top[0].j, 6);
  assert.equal(top[1].i, 15); assert.equal(top[1].j, 15);
  assert.ok(top[0].around > top[1].around);
  assert.equal(top[0].tied, true); assert.equal(top[1].tied, true);
  assert.equal(top[2].tied, false); // a 0.2 cell: no tie with the listed ones
});

test("distinct scores keep their order and are not flagged", () => {
  const s2 = Float32Array.from({ length: nx * ny }, (_, k) => k / (nx * ny));
  const top = topCells(s2, g, { n: 3 });
  assert.ok(top[0].score > top[1].score && top[1].score > top[2].score);
  assert.ok(top.every((c) => !c.tied));
});

test("the pane says the order of tied cells is a tie", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(p, /top\.some\(\(c\) => c\.tied\) && <div/);
  assert.match(p, /\{c\.tied \? " " \+ tr\("\(tied\)"\) : ""\}/);
});
