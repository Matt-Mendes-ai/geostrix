// TASKS.csv #878 — change history of explicit surfaces and source fingerprints of what is built from them
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDefChange, withChangeLog, outlinesKey, blockSourceKey } from "../src/lib/explicitLog.js";

test("#878 each kind of edit is described; bookkeeping is not", () => {
  const a = { id: "s", name: "Top", picks: [{ id: "p1", x: 0, y: 0, z: 0 }], margin: null, surfaceId: "m1", builtKey: "k1" };
  assert.equal(describeDefChange(a, { ...a, surfaceId: "m2", builtKey: "k2" }), null);
  assert.match(describeDefChange(a, { ...a, picks: [...a.picks, { id: "p2", x: 1, y: 1, z: 1, hole_id: "H7", md: 12.34 }] }), /1 pick\(s\) added on H7 at 12\.3 m/);
  assert.match(describeDefChange(a, { ...a, picks: [{ id: "p1", x: 0, y: 0, z: 5 }] }), /1 pick\(s\) moved/);
  assert.match(describeDefChange(a, { ...a, picks: [] }), /1 pick\(s\) removed/);
  assert.match(describeDefChange(a, { ...a, picks: [...a.picks, { id: "p3", seeded: true }, { id: "p4", seeded: true }] }), /2 pick\(s\) added \(2 from logged tops\)/);
  assert.equal(describeDefChange(a, { ...a, margin: 80 }), "margin: none -> 80");
});

test("#878 withChangeLog appends one entry per real change, with an ISO time, and starts a log on creation", () => {
  let state = [{ id: "s", name: "Top", picks: [] }];
  const set = (fn) => { state = typeof fn === "function" ? fn(state) : fn; };
  const logged = withChangeLog(set, () => "2026-10-25T10:00:00.000Z");
  logged((p) => p.map((d) => ({ ...d, picks: [{ id: "a", x: 1, y: 2, z: 3 }] })));
  logged((p) => p.map((d) => ({ ...d, surfaceId: "m" }))); // bookkeeping only
  logged((p) => [...p, { id: "t", name: "Base", picks: [] }]);
  assert.deepEqual(state[0].log, [{ at: "2026-10-25T10:00:00.000Z", what: "1 pick(s) added" }]);
  assert.deepEqual(state[1].log, [{ at: "2026-10-25T10:00:00.000Z", what: "created" }]);
});

test("#878 an outline edit or a new tie changes the wireframe's source key; another body does not", () => {
  const sec = (pts, extra = []) => [{ id: "A", contacts: [{ kind: "outline", unit: "Lens", points: pts }, ...extra] }];
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }];
  const k = outlinesKey(sec(pts), "Lens");
  assert.equal(outlinesKey(sec(pts, [{ kind: "outline", unit: "Other", points: pts }]), "Lens"), k);
  assert.notEqual(outlinesKey(sec([{ ...pts[0], z: 1 }, pts[1], pts[2]]), "Lens"), k);
  assert.notEqual(outlinesKey(sec([{ ...pts[0], tie: true }, pts[1], pts[2]]), "Lens"), k);
});

test("#878 a unit volume's sources: a rebuilt, sculpted or removed surface changes the key", () => {
  const recipe = { roles: { a: "top" }, cell: 10, base: 0, cutGround: false };
  const s0 = [{ id: "a", vertexCount: 100, faceCount: 180, params: { builtKey: "k1" } }];
  const k = blockSourceKey(recipe, ["a"], s0);
  assert.equal(blockSourceKey(recipe, ["a"], [{ ...s0[0], params: { builtKey: "k1", builtAt: "later" } }]), k, "a rebuild from the same inputs is the same state");
  assert.notEqual(blockSourceKey(recipe, ["a"], [{ ...s0[0], params: { builtKey: "k2" } }]), k);
  assert.notEqual(blockSourceKey(recipe, ["a"], [{ ...s0[0], editCount: 1 }]), k);
  assert.notEqual(blockSourceKey(recipe, ["a"], []), k);
  assert.notEqual(blockSourceKey({ ...recipe, cell: 5 }, ["a"], s0), k);
});
