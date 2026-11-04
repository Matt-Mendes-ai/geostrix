// TASKS.csv #1500 — traceLookup answers exactly what findOnTrace and the md filter answered, by binary search
import { test } from "node:test";
import assert from "node:assert/strict";
import { traceLookup, findOnTrace } from "../src/lib/viewer/modelHelpers.js";

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const trace = (n, step) => { const pts = []; let md = 0; for (let i = 0; i < n; i++) { pts.push({ md, x: md * 0.3 + rnd(), y: -md, z: rnd() * 5 }); md += step * (0.5 + rnd()); } return pts; };

test("at() matches findOnTrace on every md, inside, at the ends and beyond them", () => {
  for (let t = 0; t < 40; t++) {
    const pts = trace(2 + Math.floor(rnd() * 200), 3), look = traceLookup(pts), end = pts[pts.length - 1].md;
    for (let k = 0; k < 300; k++) {
      const md = k % 7 === 0 ? pts[Math.floor(rnd() * pts.length)].md + (rnd() - 0.5) * 0.02 : -5 + rnd() * (end + 10);
      const a = findOnTrace(pts, md), b = look.at(md);
      assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9, `md ${md}`);
    }
  }
});

test("between() returns the same points as the md filter", () => {
  for (let t = 0; t < 40; t++) {
    const pts = trace(2 + Math.floor(rnd() * 200), 3), look = traceLookup(pts), end = pts[pts.length - 1].md;
    for (let k = 0; k < 100; k++) {
      const from = -3 + rnd() * end, to = from + rnd() * 40;
      assert.deepEqual(look.between(from, to), pts.filter((p) => p.md >= from - 0.01 && p.md <= to + 0.01));
    }
  }
});

test("an empty or one-point trace", () => {
  assert.equal(traceLookup([]).at(5), null);
  const one = [{ md: 0, x: 1, y: 2, z: 3 }];
  assert.deepEqual(traceLookup(one).at(9), findOnTrace(one, 9));
  assert.deepEqual(traceLookup(one).between(-1, 1), one);
});
