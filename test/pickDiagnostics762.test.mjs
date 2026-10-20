// TASKS.csv #762 — checks on a GemPy run's picks: duplicates, near-vertical conflicts, orientations vs contacts.
import test from "node:test";
import assert from "node:assert/strict";
import { duplicatePicks, conflictingPicks, orientationConflicts, pickReport } from "../src/lib/pickDiagnostics.js";

// a plane dipping 10 degrees east (z falls eastward), picks on a 100 m grid
const zOf = (x) => 500 - Math.tan((10 * Math.PI) / 180) * x;
const grid = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) grid.push({ x: i * 100, y: j * 100, z: zOf(i * 100), hole_id: `H${i}${j}` });

test("clean picks raise nothing", () => {
  assert.deepEqual(duplicatePicks(grid), []);
  assert.deepEqual(conflictingPicks(grid), []);
  assert.deepEqual(orientationConflicts(grid, [{ x: 250, y: 250, z: zOf(250), dip: 10, azimuth: 90 }]), []);
  assert.equal(pickReport({ label: "Top of A", points: grid, orientations: [{ x: 250, y: 250, z: zOf(250), dip: 12, azimuth: 80 }] }), null);
});

test("duplicates and near-vertical conflicts are found and named by hole", () => {
  const pts = [...grid, { ...grid[3], x: grid[3].x + 0.2 }, { x: 302, y: 201, z: zOf(302) - 40, hole_id: "H99" }];
  assert.deepEqual(duplicatePicks(pts), [[3, 36]]);
  const c = conflictingPicks(pts);
  assert.equal(c.length, 1);
  assert.equal(pts[c[0].i].hole_id, "H32"); assert.equal(pts[c[0].j].hole_id, "H99");
  assert.ok(c[0].dz > 39 && c[0].h < 3);
  const r = pickReport({ label: "Top of A", points: pts, orientations: [] });
  assert.equal(r.duplicates, 1); assert.equal(r.conflicts, 1);
  assert.deepEqual(r.duplicateExamples, ["H03"]);
  assert.match(r.conflictExamples[0], /^H32 \/ H99 \(2 m apart, 40 m in elevation\)$/);
  // a steep but real slope 5 m wide and 10 m high is not a conflict (under 15 m)
  assert.equal(conflictingPicks([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 10 }]).length, 0);
});

test("an orientation far from the contacts' plane is flagged; no verdict without a plane", () => {
  const ors = [{ x: 250, y: 250, z: zOf(250), dip: 10, azimuth: 90 }, { x: 250, y: 250, z: zOf(250), dip: 70, azimuth: 0 }];
  const o = orientationConflicts(grid, ors);
  assert.equal(o.length, 1); assert.equal(o[0].index, 1);
  assert.ok(o[0].angle > 60 && o[0].angle < 75, String(o[0].angle));
  // polarity does not matter (a plane is a plane): dip 10 toward 270 vs a plane dipping 10 toward 90 differ by 20
  assert.equal(orientationConflicts(grid, [{ x: 250, y: 250, z: zOf(250), dip: 10, azimuth: 270 }]).length, 0);
  // contacts on a line (one hole fence): no verdict
  const line = grid.filter((p) => p.y === 0);
  assert.equal(orientationConflicts(line, [{ x: 250, y: 0, z: zOf(250), dip: 80, azimuth: 0 }]).length, 0);
  // too few contacts within the radius: no verdict
  assert.equal(orientationConflicts(grid, [{ x: 5000, y: 5000, z: 0, dip: 80, azimuth: 0 }]).length, 0);
});

test("a halo-sized cloud is not checked", () => {
  assert.equal(pickReport({ points: Array.from({ length: 6000 }, (_, k) => ({ x: k, y: 0, z: 0 })), orientations: [] }), null);
});
