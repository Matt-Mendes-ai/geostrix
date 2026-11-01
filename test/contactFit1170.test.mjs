// TASKS.csv #1170 / #1171 — structure picks tied to the contact they steer; the mesh's miss of its own contact points
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { autoReachM, orientationsNearContacts, meshCellSize, contactFit, octreeCellM, REACH_MIN_M, REACH_MAX_M } from "../src/lib/viewer/contactFit.js";

test("#1170 the automatic reach is twice the collar spacing, within limits", () => {
  assert.equal(autoReachM(188), 376, "Woodjam");
  assert.equal(autoReachM(5), REACH_MIN_M);
  assert.equal(autoReachM(5000), REACH_MAX_M);
  assert.equal(autoReachM(null), 300, "one hole: medianCollarSpacing has no answer");
});

test("#1170 a pick counts only near this unit's contacts, in 3D", () => {
  const contacts = [{ x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }];
  const near = { x: 100, y: 0, z: 0, dip: 40 }, deep = { x: 0, y: 0, z: -800, dip: 40 }, far = { x: 5000, y: 0, z: 0, dip: 40 };
  const r = orientationsNearContacts([near, deep, far], contacts, 300);
  assert.deepEqual(r.kept, [near], "800 m below the ground is not the ground's orientation");
  assert.equal(r.total, 3);
  assert.deepEqual(orientationsNearContacts([far], contacts, 300).kept, [], "none near: the caller estimates from the points, it does not use a far pick");
});

test("#1171 the fit measures the mesh against its contact points", () => {
  // a flat 100 m cell of the plane z = 0
  const verts = [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]], faces = [[0, 1, 2], [0, 2, 3]];
  const f = contactFit([[50, 50, 0], [50, 50, 10], [50, 50, 30]], verts, faces);
  assert.equal(f.n, 3);
  assert.ok(Math.abs(f.typical - 10) < 1e-6, String(f.typical));
  assert.ok(Math.abs(f.worst - 30) < 1e-6, String(f.worst));
  assert.ok(f.cell >= 100 && f.cell < 150, String(f.cell));
  assert.equal(contactFit([], verts, faces), null);
  assert.equal(contactFit([[0, 0, 0]], verts, []), null);
  assert.ok(Number.isNaN(meshCellSize(verts, [])));
});

test("#1171 a large point set is measured on a sample and still reported at full size", () => {
  const verts = [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]], faces = [[0, 1, 2], [0, 2, 3]];
  const f = contactFit(Array.from({ length: 5000 }, () => [50, 50, 7]), verts, faces);
  assert.equal(f.n, 5000);
  assert.ok(Math.abs(f.worst - 7) < 1e-6);
});

test("#1171 the run hands the fit scene-frame arrays: apiToScene takes [x, y, z], and a point object gave NaN, so no notice", () => {
  const src = fs.readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /spec\.points\.map\(apiToScene\)/);
  assert.match(src, /spec\.points\.map\(\(p\) => apiToScene\(\[p\.x, p\.y, p\.z\]\)\)/);
});

test("#1171 the octree cell follows the model box, as measured on Woodjam", () => {
  const box = [0, 5790, 0, 5853, 0, 934];
  assert.equal(Math.round(octreeCellM(box, 4)), 366);
  assert.equal(Math.round(octreeCellM(box, 5)), 183);
  assert.equal(Math.round(octreeCellM(box, 6)), 91);
});
