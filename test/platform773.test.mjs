// TASKS.csv #773 — Mac shortcut labels (src/lib/platform.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { kbd, IS_MAC } from "../src/lib/platform.js";

test("outside a page (node, on any OS — its navigator says MacIntel on a Mac): not a Mac", () => {
  assert.equal(IS_MAC, false);
  assert.equal(kbd("Ctrl/Cmd+S"), "Ctrl/Cmd+S");
});

test("Windows/Linux: labels untouched", () => {
  assert.equal(kbd("Ctrl/Cmd+S", false), "Ctrl/Cmd+S");
  assert.equal(kbd("You can undo this with Ctrl+Z.", false), "You can undo this with Ctrl+Z.");
});

test("Mac: glyphs in Apple's order, glued to the key", () => {
  const cases = [
    ["Ctrl/Cmd+N", "⌘N"],
    ["Ctrl/Cmd+Shift+S", "⇧⌘S"],
    ["Ctrl+Shift+S", "⇧⌘S"],
    ["Ctrl+Alt+Shift+K", "⌥⇧⌘K"],
    ["Ctrl/Cmd+/", "⌘/"],
    ["Ctrl/Cmd+0", "⌘0"],
    ["Ctrl/Cmd+= / -", "⌘= / -"],
    ["Ctrl/Cmd+Click", "⌘-click"],
    ["Ctrl+i", "⌘I"],
  ];
  for (const [win, mac] of cases) assert.equal(kbd(win, true), mac, win);
});

test("Mac: shortcuts inside sentences, everything else left alone", () => {
  assert.equal(kbd("Removed all assays. Ctrl+Z to undo.", true), "Removed all assays. ⌘Z to undo.");
  assert.equal(kbd("Save project (Ctrl+S — to its own file; Ctrl+Shift+S: Save As)", true), "Save project (⌘S — to its own file; ⇧⌘S: Save As)");
  assert.equal(kbd("Middle-drag or Shift+Left-drag", true), "Middle-drag or Shift+Left-drag");
  assert.equal(kbd("ControlPanel+X", true), "ControlPanel+X");
  assert.equal(kbd(null, true), null);
});
