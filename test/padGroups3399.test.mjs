// TASKS.csv #3399 / #3397 — the pad grouping shared by the 3D View's collar labels and the Maps plan (moved from holeLabels.js, #2208).
import test from "node:test";
import assert from "node:assert/strict";
import { groupPads } from "../src/lib/padGroups.js";
import { groupSharedCollars } from "../src/lib/viewer/holeLabels.js";

test("holes within tol of a group's first hole share its pad; input order kept; a plan (no z) works", () => {
  const pts = [{ id: "A", x: 0, y: 0, z: 0 }, { id: "B", x: 50, y: 0, z: 0 }, { id: "C", x: 0.6, y: 0.5, z: 0.2 }, { id: "D", x: 50.9, y: 0, z: 0 }, { id: "E", x: 3, y: 0, z: 0 }];
  assert.deepEqual(groupPads(pts).map((g) => g.map((p) => p.id)), [["A", "C"], ["B", "D"], ["E"]]);
  assert.deepEqual(groupPads(pts.map(({ z, ...p }) => p), 5).map((g) => g.map((p) => p.id)), [["A", "C", "E"], ["B", "D"]], "a plan: x, y only, a wider tol");
  assert.equal(groupPads(pts)[0][0], pts[0], "the points themselves, the first one the anchor");
  assert.deepEqual(groupPads([]), []);
  assert.deepEqual(groupPads(null), []);
});

test("the 3D View's old name is the same function", () => {
  assert.equal(groupSharedCollars, groupPads);
});
