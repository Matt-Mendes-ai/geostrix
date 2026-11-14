// TASKS.csv #3184 (from #3028 (9)) — one Ctrl+Z took back four Layout inserts and a duplicate made half a second apart: the store's undo
// history coalesces every change inside a 500 ms quiet period into one step (so a drag undoes as one). A discrete action now closes the
// burst under way first (undoCheckpoint), so each insert / duplicate / paste is its own step.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the store commits a burst in one place, from the quiet-period timer and from undoCheckpoint", () => {
  const s = read("../src/lib/store.jsx");
  assert.match(s, /const commitUndoBurst = useLatestCallback\(\(\) => \{/);
  assert.match(s, /undoDebounceTimer\.current = setTimeout\(commitUndoBurst, UNDO_DEBOUNCE_MS\)/);
  assert.match(s, /undoCheckpoint: commitUndoBurst/);
  const body = s.slice(s.indexOf("const commitUndoBurst"), s.indexOf("useLayoutEffect(() => {", s.indexOf("const commitUndoBurst")));
  assert.match(body, /if \(!undoBeforeBurst\.current\) return;/, "nothing under way: no empty step");
  for (const k of ["capRemovedMapLayers", "capTables", "undoFuture.current = []", "setUndoCount"]) assert.ok(body.includes(k), k);
});

test("Layout's insert, duplicate and paste each start with undoCheckpoint", () => {
  const L = read("../src/modules/LayoutModule.jsx");
  for (const fn of ["const addElement = (type) => {", "const duplicateSelected = () => {", "const pasteClipboard = () => {"]) {
    const at = L.indexOf(fn);
    assert.ok(at >= 0, fn);
    assert.match(L.slice(at, at + 260), /undoCheckpoint\?\.\(\)/, fn);
  }
});
