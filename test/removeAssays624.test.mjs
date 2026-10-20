// TASKS.csv #624 — imported assays can be removed again: by file, by element, or all (the UI's Remove all).
import test from "node:test";
import assert from "node:assert/strict";
import { mergeAssayRows, assayFileSummary, removeAssayFile, removeAssayElement, srcFilesOf } from "../src/lib/geochem.js";

const row = (hole, from, values, srcFile) => ({ hole_id: hole, from, to: from + 1, values, source: "assay", ...(srcFile ? { srcFile } : {}) });

test("#624 merging records both files on a shared interval; summary counts per file", () => {
  let a = mergeAssayRows([], [row("H1", 0, { Au: 1 }, "a.csv"), row("H1", 1, { Au: 2 }, "a.csv")]).rows;
  a = mergeAssayRows(a, [row("H1", 1, { Cu: 50 }, "b.csv"), row("H2", 0, { Cu: 9 }, "b.csv")]).rows; // H1 1-2 gains Cu from b
  assert.deepEqual(srcFilesOf(a.find((r) => r.hole_id === "H1" && r.from === 1)), ["a.csv", "b.csv"]);
  const s = Object.fromEntries(assayFileSummary([...a, row("OLD", 0, { Au: 3 })]).map((f) => [f.file, [f.intervals, f.shared]]));
  assert.deepEqual(s, { "a.csv": [2, 1], "b.csv": [2, 1], null: [1, 0] });
});

test("#624 removing a file keeps intervals shared with another file", () => {
  let a = mergeAssayRows([], [row("H1", 0, { Au: 1 }, "a.csv"), row("H1", 1, { Au: 2 }, "a.csv")]).rows;
  a = mergeAssayRows(a, [row("H1", 1, { Cu: 50 }, "b.csv")]).rows;
  const r = removeAssayFile(a, "a.csv");
  assert.equal(r.removed, 1); assert.equal(r.keptShared, 1);
  assert.deepEqual(r.assays.map((x) => [x.from, x.srcFile]), [[1, "b.csv"]]);
  // the untracked (older) rows as one group
  const old = removeAssayFile([row("OLD", 0, { Au: 3 }), ...a], null);
  assert.equal(old.removed, 1); assert.equal(old.assays.length, a.length);
});

test("#624 removing an element clears it everywhere and drops intervals left empty", () => {
  const a = [{ ...row("H1", 0, { Au: 1, Cu: 5 }), qualifiers: { Au: "<" } }, row("H1", 1, { Au: 2 })];
  const r = removeAssayElement(a, "Au");
  assert.equal(r.cleared, 2); assert.equal(r.emptied, 1);
  assert.deepEqual(r.assays, [row("H1", 0, { Cu: 5 })]);
});
