// TASKS.csv #3935 — adding a Layout page (a one-click sheet, an atlas, Best intercepts, an AI app's page) cleared the whole undo history, so Ctrl+Z could
// not take back anything done before it; deleting the page shown and switching pages did the same (the page bar's delete even says "Ctrl+Z undoes
// this"). Page changes are ordinary undo steps now, and an Undo shows the page it changes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pageAfterUndo } from "../src/lib/layoutPageUndo.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const pg = (id, elements = []) => ({ id, name: id, elements });

test("an Undo / Redo shows the page it changes", () => {
  const p1 = pg("p1"), p2 = pg("p2"), p3 = pg("p3");
  // undo an add (the new page p3 was shown): back to the page the add was made from
  assert.equal(pageAfterUndo([p1, p2, p3], [p1, p2], "p3", "p2"), "p2");
  // ... with no page recorded for the step: the first page
  assert.equal(pageAfterUndo([p1, p2, p3], [p1, p2], "p3", undefined), "p1");
  // redo that add, and undo a delete: the page it brings back
  assert.equal(pageAfterUndo([p1, p2], [p1, p2, p3], "p2", "p2"), "p3");
  assert.equal(pageAfterUndo([p1, p3], [p1, p2, p3], "p1", "p1"), "p2");
  // an edit made on p1 undone while p2 is shown: p1, so the change is in front of the user
  assert.equal(pageAfterUndo([p1, p2], [pg("p1", [{ id: "a" }]), p2], "p2", "p1"), "p1");
  // a step made on a page that is gone again: the page shown stays
  assert.equal(pageAfterUndo([p1, p2], [p1, p2], "p2", "gone"), "p2");
  assert.equal(pageAfterUndo([p1], [], "p1", "p1"), "p1"); // nothing to show: as it was
});

test("no page action clears the history; an add or a delete is a step of its own", () => {
  const s = read("../src/lib/store.jsx");
  const body = (name) => { const at = s.indexOf(`const ${name} = useLatestCallback(`); assert.ok(at >= 0, name); return s.slice(at, s.indexOf("\n  });\n", at)); };
  for (const fn of ["switchLayoutPage", "addLayoutPage", "addLayoutPages", "deleteLayoutPage"]) assert.ok(!body(fn).includes("clearUndoHistory"), `${fn} clears the undo history`);
  for (const fn of ["addLayoutPage", "addLayoutPages", "deleteLayoutPage"]) assert.match(body(fn), /pageStep\(\);/, fn);
  assert.match(s, /const pageStep = \(\) => \{ commitUndoBurst\(\); undoOwnStep\.current = true; \};/); // the edit before it is its own step
  assert.match(body("deleteLayoutPage"), /if \(!layoutPages\.some\(\(p\) => gone\.has\(p\.id\)\)\) return;/); // nothing deleted: no step
  // the watcher commits the page step as soon as it lands, so a drag right after it is not folded into it
  assert.match(s, /if \(undoOwnStep\.current\) \{ undoOwnStep\.current = false; const step = undoBeforeBurst\.current; commitUndoBurst\(\); lastOwnStep\.current = step; return; \}/);
  // an AI app's label, given after the change settled, still names that step (mcpActions: undoCheckpoint(label) after the action)
  assert.match(s, /if \(!undoBeforeBurst\.current\) \{ if \(typeof label === "string" && label && lastOwnStep\.current\) undoStepLabels\.current\.set\(lastOwnStep\.current/);
  assert.match(s, /undoOwnStep\.current = false; lastOwnStep\.current = null; \/\/ own step: #3935/); // a load / new forgets it
});

test("each step remembers its page; Undo and Redo show it; the history keeps the pages by reference", () => {
  const s = read("../src/lib/store.jsx");
  assert.match(s, /undoPageOf\.current\.set\(undoBeforeBurst\.current, activePageSeen\.current\)/);
  // the page seen is updated AFTER the watcher, so a step made by an add records the page it was made from, not the new one
  const watcher = s.indexOf("}, [...UNDO_KEYS.map((k) => live[k]), surfaceIds]);"), seen = s.indexOf("useLayoutEffect(() => { activePageSeen.current = activeLayoutPageId; }, [activeLayoutPageId]);");
  assert.ok(watcher > 0 && seen > watcher);
  for (const fn of ["undo", "redo"]) {
    const at = s.indexOf(`const ${fn} = useLatestCallback(`), b = s.slice(at, s.indexOf("\n  });\n", at));
    assert.match(b, /const show = pageAfterUndo\(cur\.layoutPages, (prev|next)\.layoutPages, activeLayoutPageId, undoPageOf\.current\.get\((prev|next)\)\)/, fn);
    assert.match(b, /undoPageOf\.current\.set\(cur, show\)/, fn);
    assert.match(b, /applySnapshot\((prev|next), show\)/, fn);
  }
  assert.match(s, /showPage && snap\.layoutPages\.some\(\(p\) => p\.id === showPage\) \? showPage :/);
  // a step is the live values themselves: a page with big pictures is held once, never copied into the history
  const snap = s.slice(s.indexOf("const undoSnapshot = () =>"), s.indexOf("\n", s.indexOf("const undoSnapshot = () =>")));
  assert.match(snap, /snap\[k\] = live\[k\]/);
  assert.doesNotMatch(snap, /structuredClone|JSON\.|\.\.\.live/);
});
