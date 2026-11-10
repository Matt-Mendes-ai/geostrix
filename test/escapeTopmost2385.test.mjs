// TASKS.csv #2385 (review #2325, WA uranium) — one Escape on a dialog over a task pane closes the dialog only
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the dialog that takes the Escape stops it before the window-level pane handler", () => {
  const s = readFileSync(new URL("../src/lib/useEscapeKey.js", import.meta.url), "utf8");
  const fn = s.slice(s.indexOf("function onKeyDown(e)"));
  assert.match(fn, /if \(e\.key !== "Escape" \|\| !stack\.length\) return;\s*e\.stopPropagation\(\);\s*stack\[stack\.length - 1\]\.current\?\.\(\);/);
  // the 3D view's pane handler listens on window, after document in the bubble path
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /window\.addEventListener\("keydown", onKey\);/);
});
