// TASKS.csv #828 — CAD line editing on a section image: ground profile, nearest point on a line, insert / split / join /
// extend
import test from "node:test";
import assert from "node:assert/strict";
import { imagePlane, imageCoords, groundProfileOnImage, nearestOnPolyline, insertPoint, splitAt, joinLines, extendTo } from "../src/lib/sectionDigitize3d.js";

// a vertical section image due east (azimuth 90), 400 m long, 1200 -> 800 m elevation
const E0 = 500000, N0 = 6000000;
const P = imagePlane([[E0, N0, 1200], [E0 + 400, N0, 1200], [E0 + 400, N0, 800], [E0, N0, 800]]);
const at = (s, z) => ({ x: E0 + s, y: N0, z }); // s metres along, elevation z

test("#828 the ground profile where the terrain crosses a vertical section", () => {
  const g = groundProfileOnImage(P, (e) => 1100 + 0.1 * (e - E0), 40);
  assert.equal(g.length, 41);
  assert.ok(Math.abs(g[0].z - 1100) < 1e-9 && Math.abs(g[40].z - 1140) < 1e-9 && Math.abs(g[40].x - (E0 + 400)) < 1e-9);
  for (const p of g) assert.ok(Math.abs(imageCoords([p.x, p.y, p.z], P).s * 400 - (p.x - E0)) < 1e-6);
  assert.deepEqual(groundProfileOnImage(P, () => NaN), []);
  const flat = imagePlane([[E0, N0, 1000], [E0 + 400, N0, 1000], [E0 + 400, N0 - 400, 1000], [E0, N0 - 400, 1000]]); // a plan image
  assert.deepEqual(groundProfileOnImage(flat, () => 1000), []);
});

test("#828 nearest point on a line, insert and split", () => {
  const n = nearestOnPolyline([[0, 0], [10, 0], [10, 10]], [12, 4]);
  assert.equal(n.i, 1); assert.ok(Math.abs(n.t - 0.4) < 1e-12 && Math.abs(n.d - 2) < 1e-12);
  const line = [at(0, 1000), at(100, 1000), at(200, 990)];
  assert.deepEqual(insertPoint(line, 0, at(50, 1005)).map((p) => p.x - E0), [0, 50, 100, 200]);
  const [a, b] = splitAt(line, 1);
  assert.equal(a.length, 2); assert.equal(b.length, 2); assert.deepEqual(a[1], b[0]);
  assert.equal(splitAt(line, 0), null); assert.equal(splitAt(line, 2), null);
});

test("#828 join two lines end to end, whichever ends are picked", () => {
  const a = [at(0, 1000), at(100, 1000)], b = [at(100, 1000), at(200, 990)], c = [at(300, 980), at(200, 990)];
  assert.deepEqual(joinLines(a, "end", b, "start").map((p) => p.x - E0), [0, 100, 200]); // shared point merged
  assert.deepEqual(joinLines(a, "end", c, "end").map((p) => p.x - E0), [0, 100, 200, 300]); // c reversed; 100 -> 200 kept
  assert.deepEqual(joinLines(a, "start", b, "start").map((p) => p.x - E0), [100, 0, 100, 200]);
});

test("#828 extend a line along its last segment to meet another; trim back too; nearest point when it misses", () => {
  const fault = [at(250, 1150), at(250, 850)]; // a vertical line at 250 m
  const contact = [at(0, 1000), at(100, 1000)];
  const ext = extendTo(contact, "end", fault, P);
  assert.equal(ext.length, 2);
  assert.ok(Math.abs(ext[1].x - (E0 + 250)) < 1e-6 && Math.abs(ext[1].z - 1000) < 1e-6, JSON.stringify(ext[1]));
  const long = [at(0, 1000), at(300, 1000)]; // past the fault: trimmed back to it
  const tr = extendTo(long, "end", fault, P);
  assert.ok(Math.abs(tr[1].x - (E0 + 250)) < 1e-6);
  const fromStart = extendTo([at(300, 900), at(400, 900)], "start", fault, P); // extending the start, leftwards
  assert.ok(Math.abs(fromStart[0].x - (E0 + 250)) < 1e-6 && Math.abs(fromStart[0].z - 900) < 1e-6);
  const miss = extendTo([at(0, 1000), at(100, 1000)], "end", [at(150, 1100), at(200, 1100)], P); // parallel: nearest point
  assert.ok(Math.abs(miss[1].x - (E0 + 150)) < 1e-6 && Math.abs(miss[1].z - 1100) < 1e-6);
});
