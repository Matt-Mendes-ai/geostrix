// TASKS.csv #2944 (split from #2144) — a double-click on a title or text box on the sheet edits its text in place
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("titles and texts, not locked, not the print copy, edit in place; keys and blur as described", () => {
  assert.match(L, /const canEdit = !print && !el\.locked && !!onTextEdit && \(el\.type === "title" \|\| el\.type === "text"\);/);
  assert.equal((L.match(/onDoubleClick=\{startEdit\}/g) || []).length, 2, "the title and the text box");
  assert.match(L, /if \(e\.key === "Escape"\) \{ e\.preventDefault\(\); e\.target\.dataset\.done = "1"; done\(false\); \}/);
  assert.match(L, /e\.key === "Enter" && \(!multi \|\| e\.ctrlKey \|\| e\.metaKey\)/);
  assert.match(L, /onBlur: \(e\) => \{ if \(!e\.target\.dataset\.done\) done\(true, e\.target\.value\); \}/);
  assert.match(L, /onMouseDown: \(e\) => e\.stopPropagation\(\)/, "typing or selecting text does not drag the box");
  assert.match(L, /onTextEdit=\{\(id, text\) => setElements\(\(els\) => els\.map\(\(x\) => \(x\.id === id \? \{ \.\.\.x, text \} : x\)\)\)\}/);
  // the print copy passes no onTextEdit
  const printLine = L.split(/\r?\n/).find((l) => l.includes("<LayoutElement") && l.includes(" print "));
  assert.ok(printLine && !printLine.includes("onTextEdit"));
});
