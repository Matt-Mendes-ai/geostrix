// TASKS.csv #3110 (split from #2916) — a calculated element's Add kept a full copy of every assay row in the undo history (about 60 MB at
// 148,000 samples). A NEW element's Add is undone as 'remove it' (a self-checking token); a symbol already on a row keeps the snapshot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addCalculatedElement } from "../src/lib/calcElement.js";
import { symbolPresent, removeCalculatedElement, rowsWithSymbol, calcUndoToken, applyCalcUndo } from "../src/lib/calcUndo.js";
import { capUndoTables } from "../src/lib/undoTableCap.js";

const els = [{ symbol: "Cu", unit: "ppm" }, { symbol: "Au", unit: "ppm" }];
const assays = [
  { hole_id: "H1", from: 0, to: 1, values: { Cu: 1200, Au: 0.4 } },
  { hole_id: "H1", from: 1, to: 2, values: { Cu: 800, Au: null } }, // Au missing: the ratio is skipped on this row
  { hole_id: "H1", from: 2, to: 3, values: { Cu: 300, Au: 0.1 } },
];

test("#3110 the inverse of an Add gives back the rows, by value", () => {
  const r = addCalculatedElement(assays, els, "CuAu", "Cu / Au", "index");
  assert.equal(rowsWithSymbol(r.assays, "CuAu"), 2, "the row without Au was skipped");
  assert.deepEqual(removeCalculatedElement(r.assays, "CuAu"), assays);
  assert.equal(removeCalculatedElement(r.assays, "CuAu")[1], r.assays[1], "a row the Add left alone is the same object");
});

test("#3110 condition 1: the inverse only for a NEW symbol", () => {
  assert.equal(symbolPresent(assays, "CuAu"), false);
  assert.equal(symbolPresent(assays, "Cu"), true);
  assert.equal(symbolPresent([{ values: {}, bdl: ["Zn"] }], "Zn"), true, "a below-detection mark counts");
  assert.equal(symbolPresent([{ values: {}, qualifiers: { Zn: "<" } }], "Zn"), true, "a qualifier counts");
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /if \(setAssaysWithInverse && !symbolPresent\(assays, r\.element\.symbol\)\) setAssaysWithInverse\(r\.assays, r\.element\.symbol\); else setAssays\(r\.assays\);/);
});

test("#3110 condition 2: the token checks itself; a table that no longer matches is left as it is", () => {
  const r = addCalculatedElement(assays, els, "CuAu", "Cu / Au", "index");
  const token = calcUndoToken(r.assays, "CuAu");
  assert.deepEqual(token, { __inverse: { removeElement: "CuAu", rows: 3, withSymbol: 2 } });
  assert.deepEqual(applyCalcUndo(token, r.assays).assays, assays);
  assert.deepEqual(applyCalcUndo(token, [...r.assays, { hole_id: "H2", from: 0, to: 1, values: { Cu: 5 } }]), { failed: true }, "a row added since");
  const edited = r.assays.map((a, i) => (i === 0 ? { ...a, values: { Cu: 1200, Au: 0.4 } } : a));
  assert.deepEqual(applyCalcUndo(token, edited), { failed: true }, "a row lost the symbol since");
  assert.deepEqual(applyCalcUndo(token, null), { failed: true });
});

test("#3110 the history cap never hands a token on as an older step's table", () => {
  const big = Array.from({ length: 5 }, (_, i) => ({ hole_id: "H", from: i, to: i + 1, values: {} }));
  const older = Array.from({ length: 5 }, (_, i) => ({ hole_id: "H", from: i, to: i + 1, values: {} }));
  const token = calcUndoToken(big, "X");
  const steps = [{ assays: older }, { assays: token }];
  const r = capUndoTables(steps, [{ assays: big }], { keepAssays: 0, big: 5 });
  assert.notEqual(r.steps[0].assays, token, "the dropped table becomes a real table, not the token");
  assert.equal(r.steps[1].assays, token);
});

test("#3110 the store wiring", () => {
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /if \(undoIntent\.current && current\.assays === undoIntent\.current\.next\) \{ undoBeforeBurst\.current = \{ \.\.\.undoBeforeBurst\.current, assays: undoIntent\.current\.token \}; undoIntent\.current = null; commitUndoBurst\(\); return; \}/);
  assert.match(s, /if \(snap\.assays\?\.__inverse\) \{/);
  assert.match(s, /Undo could not remove \{symbol\}/);
  assert.match(s, /setAssaysWithInverse: \(next, symbol\) => \{ commitUndoBurst\(\); undoIntent\.current = \{ next, token: calcUndoToken\(next, symbol\) \}; setAssays\(next\); \},/);
});
