// TASKS.csv #4040 (Matt, 2026-11-23, v0.2.9, WA lode gold from the top: Fence series, Area on 'Draw a box...', "when I try to draw a box it rotates the
// view instead"). Two real drags on master drew the box (a fresh choice, and after an orbit), so the cause on Matt's machine was not found; the drawing is made
// robust instead: while a box is being drawn the press and the moves are taken before the view's own handlers (so no orbit state, stale or not, can turn the
// view), a press the ground cannot answer is swallowed, a plain click leaves drawing armed, Esc ends it, and the pane says what is happening.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const src = read("../src/modules/viewer/FenceOptions.jsx");

test("while drawing, the press is taken in the capture phase, before the view's orbit and the drag-hook chain", () => {
  assert.match(src, /dom\.addEventListener\("pointerdown", onDown, true\)/);
  assert.match(src, /const onDown = \(e\) => \{ if \(e\.button !== 0 \|\| !st\.current\.drawing\) return; e\.stopImmediatePropagation\(\);/);
  assert.match(src, /dom\.removeEventListener\("pointerdown", onDown, true\)/);
  // a press the ground cannot answer (a ray that misses the plane) is swallowed while drawing, and handed on only for a corner of the box
  assert.match(src, /if \(!start\) return corner < 0;/);
});

test("the drag's moves and release are taken before the view's window handlers", () => {
  assert.match(src, /window\.addEventListener\("pointermove", onMove, true\); window\.addEventListener\("pointerup", onUp, true\);/);
  assert.match(src, /ev\.stopImmediatePropagation\(\); \/\/ the view's window pointermove would orbit on a stale drag state/);
  assert.ok(!/window\.addEventListener\("pointermove", onMove\);/.test(src), "no bubble-phase listener left that the orbit could outrun");
});

test("a plain click draws nothing and leaves drawing armed; one drag ends it; Esc cancels it", () => {
  assert.match(src, /corner >= 0 \|\| moved \? true : "click"/);
  assert.match(src, /if \(done === "click"\) \{ draftRef\.current = null; setDraft\(null\); return; \}/);
  assert.match(src, /if \(done === "cancel"\) \{ stopDrawing\(\); return; \}/);
  assert.match(src, /if \(e\.key !== "Escape" \|\| !\(active \|\| st\.current\.drawing\)\) return;/);
  assert.match(src, /if \(active\) active\(e\); else st\.current\.onCancel\?\.\(\);/);
  assert.match(src, /const stopDrawing = \(\) => \{ draftRef\.current = null; setDraft\(null\); setDrawing\(false\); \};/);
});

test("the box still shows while dragging (the draft) and a corner of a saved box still drags through the hook", () => {
  assert.match(src, /if \(b\) \{ draftRef\.current = b; setDraft\(b\); \}/);
  assert.match(src, /const box = draft \|\| saved;/);
  assert.match(src, /const hook = \(e\) => \{ const corner = cornerAt\(e\); return corner >= 0 \? down\(e, corner\) : prev \? prev\(e\) : false; \}/);
  assert.match(src, /if \(drawing\) dom\.style\.cursor = "crosshair";/);
});

test("the pane says it is drawing, and how to stop", () => {
  const hint = "Drawing: drag a box on the view (or on Maps › Fence box), Esc to cancel.";
  assert.ok(src.includes(`tr("${hint}")`));
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(read(`../src/locales/${lang}.json`)); assert.ok(d[hint] && d[hint] !== hint, lang); }
  assert.ok(!src.includes("Drag on the view, or on Maps"), "the old hint is gone");
});
