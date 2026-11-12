// TASKS.csv #3058 — the layer Style panel opens in the middle of the window and drags by its header, kept inside the window;
// TASKS.csv #3057 — a hovered menu item uses the theme's hover colour, not the old dark theme's near-black.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { clampPanel, centredPanel } from "../src/lib/useDragPanel.js";

test("centred in the window", () => {
  assert.deepEqual(centredPanel(300, 300, 1920, 983), { left: 810, top: 342 });
});

test("a drag cannot lose the panel: its header stays inside the window", () => {
  assert.deepEqual(clampPanel(-500, -40, 300, 300, 1920, 983), { left: 8, top: 8 });
  assert.deepEqual(clampPanel(5000, 5000, 300, 300, 1920, 983), { left: 1920 - 300 - 8, top: 983 - 48 - 8 });
});

test("wiring: the Style panel uses it; no fixed right-hand spot; menus hover in the theme colour", () => {
  const s = fs.readFileSync("src/components/LayerStyleModal.jsx", "utf8");
  assert.match(s, /useDragPanel\(300\)/);
  assert.match(s, /left: pos\.left, top: pos\.top/);
  assert.doesNotMatch(s, /right: 76, top: 150/);
  for (const f of ["src/modules/viewer/ViewerParts.jsx", "src/modules/ViewerModule.jsx"]) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /#242e3c/, f);
});
