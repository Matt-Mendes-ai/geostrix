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

test("#1888 a later change outside the undo history is named, and stays", () => {
  assert.equal(undoMessage("undo", { keys: ["designStrings"], later: ["generatedSurfaces"] }), "Undone: design strings. A later change to generated surfaces is outside the undo history and stays.");
  assert.equal(undoMessage("undo", { keys: ["designStrings"], later: [] }), "Undone: design strings.");
  assert.equal(undoMessage("redo", { keys: ["designStrings"], later: ["generatedSurfaces"] }), "Redone: design strings.");
  assert.equal(undoMessage("undo", { keys: [], later: ["voxelModels", "rasters"] }), "Undone (no data changed). A later change to block models, rasters is outside the undo history and stays.");
});
