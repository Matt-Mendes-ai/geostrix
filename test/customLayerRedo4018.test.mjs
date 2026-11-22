// TASKS.csv #4018 (found by side 3 under #4007) — Redo of a custom-layer removal left the layer in the sidebar, and an Undo put the restored layer at the END of the
// list. The store -> view sync (viewer/customLayerSync.js) only ever added layers; it now drops a layer the store HAD and no longer has, and keeps the store's order.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customLayerSync, arrangeLikeStore } from "../src/modules/viewer/customLayerSync.js";

const L = (...ids) => ids.map((id) => ({ id, name: "layer " + id }));
const ids = (list) => list.map((l) => l.id);

// the viewer's effect, in plain data: what the local list becomes when the store's list changes (the same calls ViewerModule makes)
function syncStep(state, store, fresh = false) {
  const { drop, missing } = customLayerSync(state.local, store, fresh, state.known);
  const gone = new Set(drop.map((l) => l.id));
  const local = fresh ? missing : arrangeLikeStore([...state.local.filter((l) => !gone.has(l.id)), ...missing], store);
  return { local, known: new Set(store.map((l) => l.id)) };
}

test("#4018 a layer the store had and no longer has is dropped from the view (Redo of a removal)", () => {
  const known = new Set(["a", "b", "c"]);
  const r = customLayerSync(L("a", "b", "c"), L("a", "c"), false, known);
  assert.deepEqual(ids(r.drop), ["b"]); assert.deepEqual(ids(r.keep), ["a", "c"]); assert.deepEqual(r.missing, []);
  // on the old sync (no 'known') the layer stays: this is the bug
  const old = customLayerSync(L("a", "b", "c"), L("a", "c"), false);
  assert.deepEqual(old.drop, [], "without the last-known ids nothing is dropped inside a project");
});

test("#4018 an import still on its way to the store is never dropped, with or without the known ids", () => {
  const known = new Set(["a", "b"]);
  const r = customLayerSync(L("a", "b", "new"), L("a", "b"), false, known); // the mirror write of 'new' has not landed yet
  assert.deepEqual(r.drop, []); assert.deepEqual(ids(r.keep), ["a", "b", "new"]);
  assert.deepEqual(customLayerSync(L("a", "new"), L("a"), false, null).drop, []);
});

test("#4018 Undo puts the restored layer back where it was, not at the end", () => {
  let s = { local: L("a", "b", "c", "d"), known: new Set(["a", "b", "c", "d"]) };
  s = syncStep(s, L("a", "c", "d")); // a removal reaches the store (Redo)
  assert.deepEqual(ids(s.local), ["a", "c", "d"]);
  s = syncStep(s, L("a", "b", "c", "d")); // Undo: the store has b again, in its place
  assert.deepEqual(ids(s.local), ["a", "b", "c", "d"]);
  // several at once, as the bulk delete of #4007 makes them (one store change)
  s = syncStep(s, L("a", "d"));
  assert.deepEqual(ids(s.local), ["a", "d"]);
  s = syncStep(s, L("a", "b", "c", "d"));
  assert.deepEqual(ids(s.local), ["a", "b", "c", "d"]);
});

test("#4018 remove, Undo, Redo, Undo with a pending import in the list", () => {
  let s = { local: L("a", "b", "c"), known: new Set(["a", "b", "c"]) };
  s.local = [...s.local, ...L("n")]; // an import added in the view; not in the store yet
  s = syncStep(s, L("a", "c")); // a store change (Redo of b's removal) lands before n is mirrored
  assert.deepEqual(ids(s.local), ["a", "c", "n"], "b is dropped, the pending n stays, last");
  s = syncStep(s, L("a", "c", "n")); // the mirror of n lands
  assert.deepEqual(ids(s.local), ["a", "c", "n"]);
  s = syncStep(s, L("a", "c")); // Undo of the import: the store loses n again
  assert.deepEqual(ids(s.local), ["a", "c"], "Undo of an add removes it from the sidebar too");
});

test("#4018 arrangeLikeStore keeps the same array when the order already matches, and puts unknown layers last in their own order", () => {
  const list = L("a", "b", "c");
  assert.equal(arrangeLikeStore(list, L("a", "b", "c")), list);
  assert.deepEqual(ids(arrangeLikeStore(L("x", "c", "y", "a"), L("a", "b", "c"))), ["a", "c", "x", "y"]);
  assert.deepEqual(ids(arrangeLikeStore([], L("a"))), []);
});

test("#4018 a project change still rebuilds from the store alone", () => {
  const s = syncStep({ local: L("a", "b"), known: new Set(["a", "b"]) }, L("b", "z"), true);
  assert.deepEqual(ids(s.local), ["b", "z"]);
});

test("#4018 the viewer passes the last-known ids, drops through the list and arranges by the store's order", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(v, /const customKnownRef = useRef\(null\);/);
  assert.match(v, /customLayerSync\(customLayers, storeCustomLayers, fresh, customKnownRef\.current\);[^\n]*\n\s+customKnownRef\.current = new Set\(/);
  assert.match(v, /arrangeLikeStore\(p\.filter\(\(l\) => !gone\.has\(l\.id\)\), storeCustomLayers\)/);
  assert.match(v, /arrangeLikeStore\(\[\.\.\.p\.filter\(\(l\) => !gone\.has\(l\.id\)\), \.\.\.rebuilt\], storeCustomLayers\)/);
});
