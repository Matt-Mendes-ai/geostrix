// TASKS.csv #874 — folded strips are reported, and tie points pair outlines
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkOutlines } from "../src/lib/wireframe.js";
import { setTieVertex, moveVertex } from "../src/lib/sectionDigitise.js";

// sections run east-west (ax..bx along x), stepping north; an outline in (x, z) at northing y
const rect = (y, w, h, tieAt = -1) => ({ section: `N${y}`, ax: 0, ay: y, bx: 1000, by: y, points: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, z], i) => ({ x: 500 + x, y, z: 100 + z, ...(i === tieAt ? { tie: true } : {}) })) });

test("#874 the review's 100 x 20 -> 20 x 100 pair: folded strips counted and named", () => {
  const w = linkOutlines([rect(0, 100, 20), rect(50, 20, 100)], { n: 64 });
  assert.ok(w.twisted.length === 1 && w.twisted[0].folded > 0 && w.twisted[0].of === 64, JSON.stringify(w.twisted));
  assert.match(w.warnings.join(" "), /between N(0|50) and N(50|0) 36 of 64 strips are folded/); // the review measured 36 / 64
});

test("#874 a plain extrusion folds nothing and has no warning", () => {
  const w = linkOutlines([rect(0, 100, 20), rect(50, 100, 20)], { n: 64 });
  assert.deepEqual(w.twisted, []);
  assert.ok(Math.abs(w.volume - 100 * 20 * 50) / 1e5 < 0.005, `${w.volume}`); // corners cut a little by resampling (#570)
});

test("#874 tie points pair the outlines: tie to tie, whatever the automatic alignment would pick", () => {
  // the same rectangle, tie on corner 0 of the first and corner 2 (the opposite corner) of the second: the strips
  // are forced to twist half a turn, which the fold count shows - proof the ties, not the search, set the pairing
  const auto = linkOutlines([rect(0, 100, 20), rect(50, 100, 20)], { n: 64 });
  const tied = linkOutlines([rect(0, 100, 20, 0), rect(50, 100, 20, 2)], { n: 64 });
  assert.equal(tied.tied, 2);
  assert.ok(tied.twisted.length === 1 && auto.twisted.length === 0);
  // matching corners tied: the same as the automatic result
  const same = linkOutlines([rect(0, 100, 20, 0), rect(50, 100, 20, 0)], { n: 64 });
  assert.deepEqual(same.twisted, []); assert.ok(Math.abs(same.volume - auto.volume) < 1e-6);
});

test("#874 setTieVertex: one tie per outline, toggled; moving a vertex keeps its tie", () => {
  let pts = [{ l: 0, z: 0 }, { l: 1, z: 0 }, { l: 1, z: 1 }];
  pts = setTieVertex(pts, 1);
  assert.deepEqual(pts.map((p) => !!p.tie), [false, true, false]);
  pts = setTieVertex(pts, 2);
  assert.deepEqual(pts.map((p) => !!p.tie), [false, false, true]);
  pts = moveVertex(pts, 2, { l: 2, z: 2, x: 0, y: 0 });
  assert.equal(pts[2].tie, true);
  assert.deepEqual(setTieVertex(pts, 2).map((p) => !!p.tie), [false, false, false]);
});
