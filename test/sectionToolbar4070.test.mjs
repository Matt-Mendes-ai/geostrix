// TASKS.csv #4070 (Sections tab, Main 2026-11-25) — the Section window's toolbar was four wrapped rows (41 controls, 226 words): now two lines: the header (title, counts, Snapshot to Layout as the gold primary, Export)
// and one compact row (Draw, Buffer, VE, zoom and Fit); the rest is folded per group (Draw options, View options, Export). Pinned: every control the window had is still in it, in its place; Save contacts stays in the row (disabled with nothing to save);
// the folds are absolutely positioned (the toolbar's height is held while drawing, #1230) and close on an outside click; the new labels are in every language; the word count reads the groups as folded.
import test from "node:test";
import assert from "node:assert/strict";
import { readSrc, localeMissing } from "./helpers/stepSplit.mjs";

const w = readSrc("src/components/SectionWindow.jsx");
const start = w.indexOf('data-section-controls=""'), outStart = w.indexOf('data-section-group-row="output"');
const end = w.indexOf("TASKS.csv #395 — planned-hole design bar");
const bar = w.slice(outStart, end); // the header's Output group, then the controls row
const g = (id) => {
  const a = bar.indexOf(`<SectionToolbarGroup id="${id}"`), b = bar.indexOf("</SectionToolbarGroup>", a);
  return [a, b];
};
const [dA, dB] = g("draw"), [vA, vB] = g("view"), [oA, oB] = g("output");
const where = (t) => {
  const i = bar.indexOf(t);
  if (i < 0) return "MISSING";
  return i > dA && i < dB ? "draw" : i > vA && i < vB ? "view" : i > oA && i < oB ? "output" : "row";
};

const WHERE = {
  row: ["aria-label={tr(\"What to draw\")}", "aria-label={tr(\"Unit\")}", "onClick={startDrawing}", "onClick={undoPoint}", "onClick={finishContact}", "onClick={cancelDrawing}", "onClick={saveContacts}",
    "aria-label={tr(\"Buffer ±\")}", "{tr(\"VE\")}", "data-zoom-controls", "setZoom(FIT)", "gs-btn--primary", "snapshotToLayout()"],
  draw: ["setSnapOn(", "setProjectSnaps(", "step: -1 })", "step: 1 })", "by: \"buffer\""],
  view: ["setTextFont(", "setTextScale(", "setStructOpacity(", "toggleRibbon(", "setGradeLabelMode(", "setHoleWidth(", "setPatternsOn(", "setShowModel(", "setShowSectionImages(", "setFitWhole(", "refresh: true"],
  output: ["onPopOut(", "onClick={exportPNG}", "onClick={exportSVG}", "onClick={exportPDF}"],
};

test("#4070 every control of the Section window toolbar is in its place: the compact row or its group's fold", () => {
  for (const [place, tokens] of Object.entries(WHERE)) for (const t of tokens) assert.equal(where(t), place, `${t} should be in ${place}`);
});

test("#4070 Snapshot to Layout is the one gold primary, in the header; Save contacts is in the row, disabled when there is nothing to save", () => {
  assert.equal((bar.match(/gs-btn--primary/g) || []).length, 1);
  assert.ok(/gs-btn--sm gs-btn--primary"[^>]*>\s*<Camera/.test(bar) || /snapshotToLayout\(\)\} className="gs-btn gs-btn--sm gs-btn--primary"/.test(bar));
  assert.ok(bar.includes("disabled={!contacts.length && !drawing}"), "Save contacts is always drawn (the toolbar must not change height when a line starts, #1230), disabled with nothing to save");
  assert.ok(bar.indexOf("onClick={saveContacts}") < dA, "…and it sits in the row, not in a fold");
  assert.ok(w.indexOf("snapshotToLayout()") > outStart && w.indexOf("snapshotToLayout()") < start, "Snapshot is in the header, always in view");
});

test("#4070 the 'Text under 7 px' note stays in view when Fit to window is folded; the toolbar keeps its ref and its drawing-time height", () => {
  const note = w.indexOf("fitTextPx != null && fitTextPx < 7");
  assert.ok(note > 0 && note < start, "the note is in the header, above the controls row");
  assert.ok(w.includes("ref={toolbarRef}") && w.includes("toolbarHeight.current"));
});

test("#4070 the folds: absolutely positioned, closed by an outside click, not counted as seen first", () => {
  const c = readSrc("src/components/SectionToolbarGroup.jsx");
  assert.ok(c.includes('position: "absolute"') && c.includes('"pointerdown"') && c.includes("el.open = false") && c.includes("data-section-group"));
  assert.ok(readSrc("scripts/word-count.mjs").includes('name === "SectionToolbarGroup"'));
  assert.ok(w.includes('import SectionToolbarGroup from "./SectionToolbarGroup.jsx"'));
});

test("#4070 its labels are in every language", () => assert.deepEqual(localeMissing(["Draw options", "View options", "Export"]), []));
