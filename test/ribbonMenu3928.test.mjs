// TASKS.csv #3928 — StrixViewer's Model button: its info card stayed open over the Model menu and hid the first tools. Opening the menu now suppresses
// the card (as Grid, Figure and Themes already did), and the menu is keyboard-usable (components/RibbonMenu.jsx): focus moves to its first item, the
// arrows move between items, Escape closes it and gives focus back to the button. Layout's Add menu (a native tooltip, no card) gets the same keys.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3928 every ribbon button with a menu or popover suppresses its own info card while it is open", () => {
  const v = read("../src/modules/viewer/ViewerParts.jsx");
  assert.match(v, /<HoverToolInfo title=\{tr\("Model"\)\}[^\n]*suppress=\{openPopover === "model"/);
  for (const k of ["grid", "figure", "themes"]) assert.match(v, new RegExp(`suppress=\{openPopover === "${k}"`), k);
  assert.match(v, /<RibbonMenu label=\{tr\("Model"\)\} onClose=\{\(\) => setOpenPopover\(null\)\}/);
  assert.match(read("../src/modules/LayoutModule.jsx"), /<RibbonMenu data-add-menu="" label=\{tr\("Add"\)\} onClose=\{\(\) => setAddMenu\(null\)\}/);
});

test("#3928 RibbonMenu: focus to the first item on open; arrows, Home / End; Escape closes and returns focus to the opener", () => {
  const m = read("../src/components/RibbonMenu.jsx");
  assert.match(m, /opener\.current = document\.activeElement;\n    ref\.current\?\.querySelector\('\[role="menuitem"\]:not\(\[disabled\]\)'\)\?\.focus\(\);/);
  assert.match(m, /if \(e\.key === "Escape"\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); onClose\?\.\(\); opener\.current\?\.focus\?\.\(\); \}/);
  for (const k of ["ArrowDown", "ArrowUp", "Home", "End"]) assert.match(m, new RegExp(`e\.key === "${k}"`));
  assert.match(m, /<div ref=\{ref\} role="menu" aria-label=\{label\}/);
});
