// TASKS.csv #1649 / #1502 — a guessed log layer that already holds another file's rows for the same holes is not the default
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
const modal = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");

test("the guess keeps its layer, with what it replaces (#2021), in every dialog path", () => {
  assert.ok(src.includes("return ov ? { target, mapping: m, guessNote: ov } : { target, mapping: m };")); // #2021: the recognized layer kept, with the note
  assert.ok(src.includes("...(forceTarget ? {} : guardGuess(target, mapping, headers, data, file.name))"), "single file (a forced type is the user's choice)");
  assert.ok(src.includes("...guardGuess(target, mapping, headers, rows, sourceName)"), "rows / database");
  assert.ok(src.includes("perRowEpsgCol: guessColumn(headers, EPSG_COL_ALIASES), ...guarded };"), "folder queue");
});

test("a folder drop never commits unseen into another file's log", () => {
  assert.ok(src.includes('const confident = target !== "custom" && !guarded.guessNote &&'));
  // the overlap check moved to lib/viewer/layerOverlap.js with the startup split (the hook reads it while the dialog renders)
  const lib = readFileSync(new URL("../src/lib/viewer/layerOverlap.js", import.meta.url), "utf8");
  assert.ok(lib.includes("if (holes.has(r.hole_id) && r._src !== name)"), "rows of the SAME file (a re-import) do not count");
});

test("the dialog says why, and what the chosen layer would replace", () => {
  assert.ok(modal.includes("TASKS.csv #1649 / #2021")); // #2021: the guess is kept; the replace alert (replaceInfo) says what it replaces
  assert.ok(modal.includes("{replaceInfo && ("));
});
