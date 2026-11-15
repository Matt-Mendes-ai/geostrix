// TASKS.csv #3616 (Fireweed rehearsal) — Ctrl+Z after colouring by Zn removed all 32,546 assays: the history holds data, not views, and said nothing before.
// The buttons name the step they will take; when the last thing done was a view change the first Ctrl+Z only says so (a toast, every time); an import is
// its own step.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { undoMessage, undoTooltip, stepName } from "../src/lib/undoLabels.js";
import { stylingTracker } from "../src/lib/viewerDirty.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3616 the tooltip names the step the next press takes", () => {
  assert.equal(stepName(["assays", "assayElements"]), "assays");
  assert.equal(undoTooltip("undo", { keys: ["assays", "assayElements"], viewFirst: false }, ""), "Undo (Ctrl/Cmd+Z): takes back: assays.");
  assert.equal(undoTooltip("undo", { keys: ["collars", "survey"] }, "List."), "Undo (Ctrl/Cmd+Z): takes back: collars, surveys. List.");
  assert.equal(undoTooltip("undo", null, ""), "Undo (Ctrl/Cmd+Z): nothing to undo.");
  assert.equal(undoTooltip("redo", { keys: ["assays"] }, ""), "Redo (Ctrl/Cmd+Shift+Z): puts back: assays.");
  const v = undoTooltip("undo", { keys: ["assays"], viewFirst: true }, "");
  assert.match(v, /the last thing done was a view change/); assert.match(v, /not undone/); assert.match(v, /again to undo: assays\.$/);
});

test("#3616 the first Ctrl+Z after a view change only tells: its message names the data step and says nothing was undone", () => {
  const m = undoMessage("undo", { viewOnly: true, keys: ["assays", "assayElements"], later: [] });
  assert.equal(m, "View changes (colours, checked holes, layers shown) are not undone. Press Undo again to undo: assays.");
  assert.match(undoMessage("undo", { viewOnly: true, keys: [], later: [] }), /Press Undo again to undo the last step\./);
  assert.equal(undoMessage("undo", { keys: ["assays"], later: [] }), "Undone: assays."); // a real undo is as before
  assert.equal(undoMessage("undo", null), "Nothing to undo.");
});

test("#3616 colouring and hiding holes are view changes the tracker sees (so the store can tell the next Undo)", () => {
  const t = stylingTracker();
  assert.equal(t({ assayStyle: { el: "Pb" }, visibleHoles: {}, layerVisible: { a: 1 } }, 1), false, "the baseline");
  assert.equal(t({ assayStyle: { el: "Zn" }, visibleHoles: {}, layerVisible: { a: 1 } }, 1), true, "colour by Zn");
  assert.equal(t({ assayStyle: { el: "Zn" }, visibleHoles: { H1: false }, layerVisible: { a: 1 } }, 1), true, "hide a hole");
  assert.equal(t({ assayStyle: { el: "Zn" }, visibleHoles: { H1: false }, layerVisible: { a: 1 } }, 1), false, "nothing changed");
});

test("#3616 the store: a view change newer than the step (past 2 s) makes the first undo only a notice, once; the buttons peek", () => {
  const s = read("../src/lib/store.jsx");
  assert.match(s, /const lastViewChangeAt = useRef\(0\), viewNoticeFor = useRef\(0\);/);
  assert.match(s, /if \(stylingChanged\.current\(viewerUiState, viewerUiStateSeq\)\) \{ lastViewChangeAt\.current = Date\.now\(\); setViewSeq\(\(n\) => n \+ 1\); setActiveTabDirty\(true\); \}/);
  const u = s.slice(s.indexOf("const undo = useLatestCallback"), s.indexOf("const redo = useLatestCallback"));
  assert.match(u, /if \(!undoPast\.current\.length\) return null;[\s\S]*if \(lastViewChangeAt\.current > topAt \+ 2000 && viewNoticeFor\.current !== lastViewChangeAt\.current\) \{ viewNoticeFor\.current = lastViewChangeAt\.current; setViewSeq\(\(n\) => n \+ 1\); return \{ viewOnly: true,/);
  assert.ok(u.indexOf("viewOnly: true") < u.indexOf("undoPast.current.pop()"), "nothing is popped for the notice");
  assert.match(s, /const peekUndo = useLatestCallback\(/); assert.match(s, /undo, redo, peekUndo, peekRedo, canUndo:/);
  const app = read("../src/App.jsx");
  assert.match(app, /const undoSay = useCallback\(\(\) => say\(undoMessage\("undo", undo\(\)\)\), \[undo\]\);/); // every result, the notice included, is a toast
  assert.match(app, /title=\{undoTooltip\("undo", peekUndo\?\.\(\)/);
});

test("#3616 each import commit closes the burst under way first: the edit before it is its own step, one import is one step", () => {
  assert.match(read("../src/modules/viewer/importPipelineImpl.js"), /const commitImportOnce = async \(\) => \{\n    undoCheckpoint\?\.\(\);/);
  assert.match(read("../src/modules/viewer/useImportPipeline.js"), /viewerUiState, undoCheckpoint \} = useStore\(\)/);
  assert.match(read("../src/modules/viewer/useImportPipeline.js"), /setSampleLoading, undoCheckpoint \} \};/);
});
