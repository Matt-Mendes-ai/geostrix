// TASKS.csv #3404 (addLayoutPages keeps a page's format), #3331 (one setter for the elements of every page) and #2883 (Geochem > Compositing's last settings
// kept in the project): small store.jsx edits, each commented with its row id. SYNTHETIC settings.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { lastCompositing, rememberCompositing, forgetCompositing, compositingToSave } from "../src/lib/lastCompositing.js";

const s = fs.readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#2883: the project's saved settings are offered when this window has none, for the same element only; the window's own win", () => {
  forgetCompositing();
  const saved = compositingToSave({ symbol: "Cu", length: 2, minCoverage: 0.5, cap: 5000, domain: null, token: "x" });
  assert.deepEqual(saved, { symbol: "Cu", length: 2, minCoverage: 0.5, cap: 5000, domain: null }, "no token in the file");
  assert.equal(lastCompositing(() => true, "Cu", saved), saved);
  assert.equal(lastCompositing(() => true, "Au", saved), null, "another element: none");
  assert.equal(lastCompositing(() => true, null, null), null);
  rememberCompositing("t", { symbol: "Cu", length: 1, minCoverage: 1, cap: null, domain: null });
  assert.equal(lastCompositing((t) => t === "t", "Cu", saved).length, 1, "this window's settings win");
  assert.equal(lastCompositing((t) => t !== "t", "Cu", saved), saved, "a window of another project falls back to the saved ones");
  assert.equal(compositingToSave({ symbol: "Cu", length: 0 }), null);
  forgetCompositing();
});

test("store: setLastCompositing writes project.lastCompositing (no new state when unchanged), mapLayoutPagesElements maps every page, addLayoutPages keeps format", () => {
  assert.match(s, /const setLastCompositing = useCallback\(\(s\) => setProject\(\(p\) => \(JSON\.stringify\(p\.lastCompositing \?\? null\) === JSON\.stringify\(s \?\? null\) \? p : \{ \.\.\.p, lastCompositing: s \|\| undefined \}\)\), \[\]\);/);
  assert.match(s, /const mapLayoutPagesElements = useCallback\(\(fn\) => setLayoutPages\(\(p\) => p\.map\(\(pg\) => \(\{ \.\.\.pg, elements: fn\(pg\.elements \|\| \[\]\) \}\)\)\), \[\]\);/);
  assert.match(s, /\.\.\.\(pg\.format \? \{ format: pg\.format \} : \{\}\) \/\* #3404/);
  assert.match(s, /mapLayoutPagesElements \/\* #3331 \*\/, setLastCompositing \/\* #2883 \*\//);
});

test("wired: the modal saves into the project, the note reads it, Layout offers 'Clear it on every page'", () => {
  const m = fs.readFileSync(new URL("../src/components/CompositingModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /setLastCompositing\?\.\(compositingToSave\(s\)\);/);
  const n = fs.readFileSync(new URL("../src/components/GeochemCompositingNote.jsx", import.meta.url), "utf8");
  assert.match(n, /lastCompositing\(isSameProject, symbol, project\?\.lastCompositing\)/);
  const l = fs.readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(l, /mapLayoutPagesElements\(\(els\) => clearCodeOrders\(els, groups\)\)/);
});
