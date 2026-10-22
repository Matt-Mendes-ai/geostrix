// TASKS.csv #570 — explicit wireframes from section outlines: closed, consistently wound, the right volume.
import test from "node:test";
import assert from "node:assert/strict";
import { linkOutlines, resampleLoop } from "../src/lib/wireframe.js";
import { isMeshClosed } from "../src/lib/meshQuery.js";

// sections run east-west (a -> b along x) and are stacked north (y); an outline is a loop in x / z at that y
const E0 = 615000, N0 = 5789000;
const sec = (y) => ({ ax: E0 - 500, ay: N0 + y, bx: E0 + 500, by: N0 + y });
const rect = (y, x0, x1, z0, z1, ccw = true) => {
  const p = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  return { ...sec(y), points: (ccw ? p : p.reverse()).map(([x, z]) => ({ x: E0 + x, y: N0 + y, z })) };
};
const edges = (ix) => {
  const und = new Map(), dir = new Set(); let twice = 0;
  for (let t = 0; t < ix.length; t += 3) for (const [p, q] of [[ix[t], ix[t + 1]], [ix[t + 1], ix[t + 2]], [ix[t + 2], ix[t]]]) {
    const k = p < q ? `${p},${q}` : `${q},${p}`; und.set(k, (und.get(k) || 0) + 1);
    if (dir.has(`${p}>${q}`)) twice++; else dir.add(`${p}>${q}`);
  }
  return { open: [...und.values()].filter((n) => n !== 2).length, twice };
};

test("#570 two equal rectangles 100 m apart: a closed prism of area x spacing", () => {
  const w = linkOutlines([rect(0, 0, 80, 900, 950), rect(100, 0, 80, 900, 950)], { n: 64 });
  assert.equal(w.sections, 2);
  assert.ok(isMeshClosed(w.positions, w.indices).closed);
  assert.deepEqual(edges(w.indices), { open: 0, twice: 0 });
  assert.ok(Math.abs(w.volume - 80 * 50 * 100) / (80 * 50 * 100) < 0.003, `${w.volume}`); // corners between samples are cut slightly
});

test("#570 three sections, out of order, opposite windings, a shifted middle outline: still closed, the right volume", () => {
  // rectangles 80 x 50, the middle one shifted 30 m east and drawn clockwise; given in a scrambled order
  const w = linkOutlines([rect(200, 0, 80, 900, 950), rect(100, 30, 110, 900, 950, false), rect(0, 0, 80, 900, 950)], { n: 64 });
  assert.equal(w.sections, 3);
  assert.deepEqual(edges(w.indices), { open: 0, twice: 0 });
  // a sheared prism keeps area x length (Cavalieri): 80 x 50 x 200
  assert.ok(Math.abs(w.volume - 80 * 50 * 200) / (80 * 50 * 200) < 0.003, `${w.volume}`);
});

test("#570 an outline shrinking to a smaller one: between the two prisms; a concave (L-shaped) outline caps correctly", () => {
  const big = rect(0, 0, 100, 900, 1000), small = rect(50, 25, 75, 925, 975);
  const w = linkOutlines([big, small], { n: 64 });
  assert.deepEqual(edges(w.indices), { open: 0, twice: 0 });
  assert.ok(w.volume > 50 * 50 * 50 && w.volume < 100 * 100 * 50, `${w.volume}`);
  const L = (y) => ({ ...sec(y), points: [[0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]].map(([x, z]) => ({ x: E0 + x, y: N0 + y, z: 900 + z })) });
  const wl = linkOutlines([L(0), L(40)], { n: 96 });
  assert.deepEqual(edges(wl.indices), { open: 0, twice: 0 });
  assert.ok(Math.abs(wl.volume - (60 * 20 + 20 * 40) * 40) / ((60 * 20 + 20 * 40) * 40) < 0.02, `${wl.volume}`);
});

test("#570 resampling keeps the loop; one outline is not enough", () => {
  const r = resampleLoop([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }, { x: 0, y: 0, z: 10 }], 8);
  assert.equal(r.length, 8);
  assert.deepEqual(r.map((p) => [p.x, p.z]), [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5]]);
  assert.throws(() => linkOutlines([rect(0, 0, 10, 0, 10)]), /two sections/i);
});
