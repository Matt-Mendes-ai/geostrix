// TASKS.csv #3239 — the 3D View's write-back of its custom layers (viewerDirty mirrorCustomLayers) kept a fixed list of fields, so a layer's
// sourceModel (Block models > Evaluate onto drillholes, read by Downhole logs #2558 to leave the model out of the Log list) fell off the
// store's copy at the view's next write, and a layer new to the store lost a valid range. The store's copy now wins for every field the view
// does not set; a layer new to the store keeps every field but the view's three.js group.
import test from "node:test";
import assert from "node:assert/strict";
import { mirrorCustomLayers } from "../src/lib/viewerDirty.js";

const rows = [{ hole_id: "A", from: 0, to: 1, value: 2, modelled: true }];
const group = { isGroup: true, children: [] };

test("a field only the store's copy has (sourceModel, a colour, a despike) survives the view's write-back", () => {
  const store = [{ id: "c1", name: "On holes: Mag", rows, sourceModel: "vm7", unit: "SI", validRange: [0, 5], despikeM: 1, colour: "#123456" }];
  const view = [{ id: "c1", name: "On holes: Mag", rows, group, sourceModel: "vm7" /* the snapshot it was built from */ }];
  const renamed = [{ ...view[0], name: "Mag on holes", rows: [...rows] }];
  const out = mirrorCustomLayers(store, renamed)[0];
  assert.equal(out.name, "Mag on holes"); assert.equal(out.rows, renamed[0].rows, "the view's name and rows win");
  assert.equal(out.sourceModel, "vm7"); assert.equal(out.colour, "#123456");
  assert.deepEqual([out.unit, out.validRange, out.despikeM], ["SI", [0, 5], 1]);
  assert.equal(out.group, undefined, "the three.js group never reaches the store");
  // a store-only field set AFTER the view built its snapshot is not undone by the stale snapshot
  const later = [{ ...store[0], sourceModel: "vm8" }];
  assert.equal(mirrorCustomLayers(later, renamed)[0].sourceModel, "vm8");
});

test("unchanged: the same list (the undo watcher compares by reference, #1656)", () => {
  const store = [{ id: "c1", name: "L", rows, sourceModel: "vm7", notes: "n" }];
  assert.equal(mirrorCustomLayers(store, [{ id: "c1", name: "L", rows, group, notes: "n" }]), store);
  assert.notEqual(mirrorCustomLayers(store, [{ id: "c1", name: "L2", rows, group, notes: "n" }]), store);
  assert.notEqual(mirrorCustomLayers(store, [{ id: "c1", name: "L", rows, group, notes: "new note" }]), store, "the view's notes still win");
});

test("a layer new to the store keeps every field the view has but its group (an import's valid range, unit, bin)", () => {
  const out = mirrorCustomLayers([], [{ id: "c2", name: "log: Gamma", rows, group, unit: "cps", binM: 0.5, validRange: [0, null], despikeM: 2 }])[0];
  assert.deepEqual(out, { id: "c2", name: "log: Gamma", rows, unit: "cps", binM: 0.5, validRange: [0, null], despikeM: 2 });
});

test("a field the store's copy has and the view's does not set, removed in the store, stays removed", () => {
  const store = [{ id: "c1", name: "L", rows }];
  const out = mirrorCustomLayers(store, [{ id: "c1", name: "L", rows, group, validRange: [0, 9] /* stale snapshot */ }]);
  assert.equal(out, store, "the store's (absent) range wins: nothing changed");
});
