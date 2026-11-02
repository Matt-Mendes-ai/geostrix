import { test } from "node:test";
import assert from "node:assert/strict";
import { contactFootprint, reachPad, MIN_MARGIN_M } from "../src/lib/contactReach.js";
import { clipMesh } from "../src/lib/clipMesh.js";

const grid = (x0, x1, y0, y1, n, zOf) => {
  const pts = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * j) / n; pts.push({ x, y, z: zOf(x, y) }); }
  return pts;
};

test("a flat cluster keeps its surface near the contacts and drops the far part", () => {
  const f = contactFootprint(grid(0, 1000, 0, 500, 4, () => 100), 100);
  assert.equal(f.margin, 100);
  assert.equal(f.isOutside({ x: 500, y: 250, z: 100 }), false);
  assert.equal(f.isOutside({ x: 1090, y: 250, z: 100 }), false);
  assert.equal(f.isOutside({ x: 1110, y: 250, z: 100 }), true);
  assert.equal(f.isOutside({ x: 5000, y: 5000, z: 100 }), true);
});

test("the corner of the footprint is rounded by the margin, not a square", () => {
  const f = contactFootprint(grid(0, 1000, 0, 1000, 4, () => 0), 100);
  assert.equal(f.isOutside({ x: 1060, y: 1060, z: 0 }), false); // 85 m from the corner
  assert.equal(f.isOutside({ x: 1090, y: 1090, z: 0 }), true); // 127 m, inside the bounding box
});

test("a diagonal cluster leaves the empty corners of its box out", () => {
  const pts = Array.from({ length: 21 }, (_, i) => ({ x: i * 100, y: i * 100 + (i % 2) * 30, z: 0 }));
  const f = contactFootprint(pts, 100);
  assert.equal(f.isOutside({ x: 1000, y: 1000, z: 0 }), false);
  assert.equal(f.isOutside({ x: 2000, y: 0, z: 0 }), true);
});

test("a steep contact is limited down-dip, which a hull seen from above would miss", () => {
  const pts = [];
  for (let i = 0; i <= 5; i++) for (let k = 0; k <= 5; k++) pts.push({ x: i * 100, y: k * 2, z: -k * 100 });
  const f = contactFootprint(pts, 100);
  assert.equal(f.isOutside({ x: 250, y: 4, z: -200 }), false);
  assert.equal(f.isOutside({ x: 250, y: 22, z: -1100 }), true);
});

test("the automatic margin follows the shorter span, with a floor", () => {
  const long = contactFootprint(grid(0, 4000, 0, 2000, 4, () => 0));
  assert.ok(Math.abs(long.margin - 300) < 1, String(long.margin));
  const narrow = contactFootprint(grid(0, 4000, 0, 100, 4, () => 0));
  assert.ok(Math.abs(narrow.margin - 150) < 1, String(narrow.margin)); // a quarter of the long span's 15 %
  assert.equal(contactFootprint([{ x: 5, y: 5, z: 5 }]).margin, MIN_MARGIN_M);
});

test("one point and one line of points still give a usable footprint", () => {
  const one = contactFootprint([{ x: 0, y: 0, z: 0 }], 100);
  assert.equal(one.isOutside({ x: 60, y: 0, z: 0 }), false);
  assert.equal(one.isOutside({ x: 160, y: 0, z: 0 }), true);
  const line = contactFootprint(Array.from({ length: 5 }, (_, i) => ({ x: i * 100, y: 0, z: 0 })), 50);
  assert.equal(line.isOutside({ x: 200, y: 0, z: 0 }), false);
  assert.equal(line.isOutside({ x: 900, y: 0, z: 0 }), true);
  assert.equal(contactFootprint([]), null);
});

test("cutting a property-wide sheet to a local cluster keeps only the local part", () => {
  const n = 40, verts = [], faces = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) verts.push({ x: i * 250, y: j * 250, z: 0 });
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1; faces.push([a, c, b], [b, c, d]); }
  const f = contactFootprint(grid(4000, 5000, 4000, 4500, 3, () => 0), 100);
  const cut = clipMesh(verts, faces, f.isOutside);
  const used = new Set(cut.faces.flat());
  const xs = [...used].map((i) => cut.verts[i].x);
  assert.ok(Math.min(...xs) > 3850 && Math.max(...xs) < 5150, `${Math.min(...xs)} to ${Math.max(...xs)}`);
  assert.ok(cut.faces.length < faces.length / 20);
});

test("the padded box always holds the margin and gives a flat unit room to bend", () => {
  assert.equal(reachPad(1000, 1000, 100, 500), 250);
  assert.equal(reachPad(2, 2000, 100, 500), 500);
  assert.equal(reachPad(10, 40, 80, 500), 80);
  assert.equal(reachPad(10000, 10000, 100, 500), 500);
});
