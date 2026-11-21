// TASKS.csv #3969 (Matt's first-time test) — the Model card ('Grade model … Build it for me') stayed drawn over the Best intercepts dialog
// opened after it; the ribbon's popovers too. They close when a modal dialog opens, on a press outside them and on Escape (lib/useDismiss.js).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addsModal } from "../src/lib/useDismiss.js";

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// a stand-in element: matches / querySelector for '[aria-modal="true"]'
const el = ({ modal = false, holds = null } = {}) => ({ nodeType: 1, matches: (s) => s === '[aria-modal="true"]' && modal, querySelector: (s) => (s === '[aria-modal="true"]' ? holds : null) });

test("a modal dialog appearing is noticed (itself or inside what was added); ours, text and plain nodes are not", () => {
  const dialog = el({ modal: true });
  assert.equal(addsModal(dialog, () => false), true, "the Best intercepts dialog (role=dialog aria-modal=true)");
  assert.equal(addsModal(el({ holds: dialog }), () => false), true, "a portal holding one");
  assert.equal(addsModal(el(), () => false), false, "a plain element");
  assert.equal(addsModal(dialog, (n) => n === dialog), false, "one inside the card itself");
  assert.equal(addsModal({ nodeType: 3 }, () => false), false, "a text node");
  assert.equal(addsModal(null, () => false), false);
});

test("wired: the guided card and the ribbon's popovers close on a dialog, a press outside and Escape", () => {
  const h = read("lib/useDismiss.js");
  assert.match(h, /document\.addEventListener\("pointerdown", onDown, true\);/);
  assert.match(h, /e\.key === "Escape" && !typing\(e\.target\) && !document\.querySelector\(MODAL\)/, "Escape: not while typing, and a dialog takes its own");
  assert.match(h, /mo\.observe\(document\.body, \{ childList: true, subtree: true \}\);/);
  assert.match(h, /if \(!open \|\| typeof document === "undefined"\) return undefined;/, "listening only while open");
  const g = read("modules/viewer/guided/GuidedTool.jsx");
  assert.match(g, /useDismiss\(true, \(n\) => !!box\.current\?\.contains\(n\), close\);/);
  assert.match(g, /<div ref=\{box\} data-guided-card="">/);
  const v = read("modules/ViewerModule.jsx");
  assert.match(v, /useDismiss\(!!openPopover, \(n\) => !!n\?\.closest\?\.\("\[data-ribbon-popover\], \[aria-haspopup\]\[aria-expanded\]"\), \(\) => setOpenPopover\(null\)\);/);
  const p = read("modules/viewer/ViewerParts.jsx");
  assert.equal((p.match(/data-ribbon-popover=""/g) || []).length, 4, "the Model menu, Grid, Figure and Themes");
  // the dialogs opened from the ribbon declare themselves modal, so the rule sees them
  assert.match(read("components/BestIntercepts.jsx"), /role="dialog" aria-modal="true"/);
});
