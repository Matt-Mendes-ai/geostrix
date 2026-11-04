// TASKS.csv #1953 / #1956 / #1958 / #1961 (Vulcan review) — stopes along a dip, a tie vertex honoured by the loft, a plain
// triangulation of points, and the square-off and crossing snaps
import { test } from "node:test";
import assert from "node:assert/strict";
import { stopeOutlines } from "../src/lib/stopeOutlines.js";
import { loftStrings } from "../src/lib/stringSolids.js";
import { tinSurface } from "../src/lib/tinSurface.js";
import { squarePoint, stringCrossings } from "../src/lib/designStrings.js";
import { meshVolume } from "../src/lib/unitVolumes.js";

test("stopes along a dip: the vein is followed, the solids lean, the width is measured across the vein", () => {
  // a vein 10 m wide (in x) dipping 60 degrees towards east (090): at height z its centre is at x = 100 - z / tan(60)
  const cells = [], cot = 1 / Math.tan(Math.PI / 3);
  for (let k = 0; k < 10; k++) for (let j = 0; j < 10; j++) for (let i = 0; i < 40; i++) {
    const x = 5 + i * 10, y = 5 + j * 10, z = 5 + k * 10, xc = 100 - z * cot;
    cells.push({ x, y, z, dx: 10, dy: 10, dz: 10, value: Math.abs(x - xc) <= 7 ? 5 : 0 });
  }
  const vertical = stopeOutlines({ cells }, { cutoff: 1, levelH: 20, minWidth: 0, skin: 0, density: 2.7 });
  const dipping = stopeOutlines({ cells }, { cutoff: 1, levelH: 20, minWidth: 0, skin: 0, density: 2.7, dipDeg: 60, dipDirDeg: 90 });
  assert.ok(vertical.totals.stopes > 0 && dipping.totals.stopes > 0);
  assert.deepEqual(dipping.dip, { dipDeg: 60, dipDirDeg: 90, widthOnGroundM: 0, skinOnGroundM: 0 });
  // a leaning stope: its top ring sits up-dip (west) of its bottom ring by the level's height / tan(dip)
  const s = dipping.levels[1].stopes[0];
  const n = s.outline.length, P = s.positions;
  const xb = P[0], xt = P[3 * n];
  assert.ok(Math.abs((xb - xt) - 20 * cot) < 1e-6, `lean ${xb - xt} vs ${20 * cot}`);
  assert.ok(Math.abs(s.volume - Math.abs(meshVolume(P, s.indices))) < 1e-6);
  // a typed width across the vein is wider on the ground
  const wide = stopeOutlines({ cells }, { cutoff: 1, levelH: 20, minWidth: 8, skin: 2, density: 2.7, dipDeg: 60, dipDirDeg: 90 });
  assert.ok(Math.abs(wide.dip.widthOnGroundM - 8 / Math.sin(Math.PI / 3)) < 1e-9 && Math.abs(wide.dip.skinOnGroundM - 2 / Math.sin(Math.PI / 3)) < 1e-9);
  // the vertical columns catch the vein on the lower levels but the tonnes differ from the leaning ones
  assert.ok(dipping.totals.tonnes > 0);
});

test("a tie vertex pairs the rings of a loft, and the same-level refusal names the levels", () => {
  const ring = (z, rot) => ({ name: `r${z}`, closed: true, vertices: Array.from({ length: 8 }, (_, i) => { const a = ((i + rot) / 8) * 2 * Math.PI; return [100 * Math.cos(a), 100 * Math.sin(a), z]; }) });
  const plain = loftStrings([ring(0, 0), ring(50, 3)]);
  const tied = loftStrings([{ ...ring(0, 0), tieVertex: 0 }, { ...ring(50, 3), tieVertex: 5 }]); // the rotated ring's vertex 5 is the first ring's vertex 0
  assert.ok(plain.volume > 0 && tied.volume > 0);
  assert.equal(tied.tied, 2); assert.equal(plain.tied, 0);
  assert.ok(tied.volume >= plain.volume - 1, "pairing the ties undoes the twist, so the solid is at least as full");
  const same = loftStrings([ring(0, 0), ring(0, 1), ring(50, 0)]);
  assert.equal(same.failed, "same-level"); assert.deepEqual(same.levels, [0, 0, 50]);
});

test("a plain triangulation of points: Delaunay in plan, long edges dropped, triangles facing up, nothing beyond the points", () => {
  const pts = [];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) pts.push({ x: i * 10, y: j * 10, z: 100 + i + j });
  pts.push({ x: 500, y: 500, z: 50 }); // a far-off point: its triangles have long edges and are dropped
  const t = tinSurface(pts);
  assert.equal(t.stats.points, 26); assert.ok(t.stats.triangles >= 32 && t.stats.longDropped >= 1);
  for (let k = 0; k < t.indices.length; k += 3) { const a = t.indices[k] * 3, b = t.indices[k + 1] * 3, c = t.indices[k + 2] * 3; const cross = (t.positions[b] - t.positions[a]) * (t.positions[c + 1] - t.positions[a + 1]) - (t.positions[b + 1] - t.positions[a + 1]) * (t.positions[c] - t.positions[a]); assert.ok(cross > 0, "faces up"); }
  let xMax = -Infinity; for (let k = 0; k < t.indices.length; k++) xMax = Math.max(xMax, t.positions[t.indices[k] * 3]);
  assert.equal(xMax, 40, "the far point is in no kept triangle");
  assert.equal(tinSurface([{ x: 0, y: 0, z: 1 }, { x: 1, y: 1, z: 1 }]), null);
  assert.equal(tinSurface([{ x: 0, y: 0, z: 1 }, { x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 1 }]), null, "points on a line");
});

test("Alt squares off the last segment; strings' crossings are snap targets", () => {
  const prev = [0, 0, 0], last = [10, 10, 0];
  const p = squarePoint(prev, last, [15, 6, 0]); // the last segment runs north-east; the cursor is a little south of east of it
  const rel = (Math.atan2(p[0] - last[0], p[1] - last[1]) * 180) / Math.PI - 45;
  assert.ok(Math.abs(((rel % 90) + 90) % 90) < 1e-9, `square: ${rel}`);
  assert.ok(Math.abs(Math.hypot(p[0] - last[0], p[1] - last[1]) - Math.hypot(5, -4)) < 1e-9, "the same distance");
  const a = { name: "a", vertices: [[0, 0, 10], [100, 100, 20]] }, b = { name: "b", vertices: [[0, 100, 0], [100, 0, 0]] };
  const x = stringCrossings(a, b);
  assert.equal(x.length, 1); assert.deepEqual(x[0].map((v) => +v.toFixed(6)), [50, 50, 15]);
  const self = { name: "s", vertices: [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, -50, 0]] }; // the last segment crosses the first
  assert.equal(stringCrossings(self, self).length, 1);
  assert.equal(stringCrossings(a, a).length, 0);
});
