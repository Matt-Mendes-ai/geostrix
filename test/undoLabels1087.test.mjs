// TASKS.csv #1087 — undo / redo say what they changed
import { test } from "node:test";
import assert from "node:assert/strict";
import { changedKeys, undoMessage } from "../src/lib/undoLabels.js";

test("#1087 changedKeys compares by reference", () => {
  const a = [1], b = [2], same = [3];
  assert.deepEqual(changedKeys({ assays: a, collars: same }, { assays: b, collars: same }), ["assays"]);
});

test("#1087 the message names each kind once, and says when there was nothing", () => {
  assert.equal(undoMessage("undo", ["assays", "assayElements", "layoutPages"]), "Undone: assays, Layout pages.");
  assert.equal(undoMessage("redo", ["sections"]), "Redone: sections.");
  assert.equal(undoMessage("undo", null), "Nothing to undo.");
  assert.equal(undoMessage("undo", []), "Undone (no data changed).");
});
