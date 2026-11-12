// TASKS.csv #2045 (review #2013, Woodjam) — the Shortcuts reference's 'View: Ctrl+0 Reset zoom, Ctrl+= / - Zoom in / out' read as 3D-view
// zoom; those keys are the window's zoom (text size).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#2045 the group says it is the window's zoom, not the 3D view's", () => {
  const s = readFileSync(new URL("../src/components/ShortcutsModal.jsx", import.meta.url), "utf8");
  assert.match(s, /title: "Window zoom \(text size, not the 3D view\)"/);
  assert.match(s, /\["Ctrl\/Cmd\+0", "Reset the window zoom"\]/);
  assert.ok(!s.includes('title: "View",'));
});
