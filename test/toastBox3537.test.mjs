// TASKS.csv #3537 (Fireweed rehearsal) — the Identify panel opened over the close button of a long, sticky notice toast. While the panel is
// open the toast keeps to the space left of it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toastBoxStyle, IDENTIFY_PANEL } from "../src/lib/viewer/toastBox.js";

test("closed: centred, up to 70 % (as before); open: left of the panel with a gap, centred there", () => {
  assert.deepEqual(toastBoxStyle(false), { position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", maxWidth: "70%", pointerEvents: "none" });
  const s = toastBoxStyle(true);
  assert.equal(s.left, 12); assert.equal(s.justifyContent, "center"); assert.equal(s.pointerEvents, "none");
  const clear = Number(/min\((\d+)px, 50%\)/.exec(s.right)[1]);
  assert.equal(clear, IDENTIFY_PANEL.right + IDENTIFY_PANEL.width + 12);
  // the rehearsal's window: a 1,920-px screen, a view about 1,610 px wide — the toast's box ends left of the panel's left edge
  const W = 1610, panelLeft = W - IDENTIFY_PANEL.right - IDENTIFY_PANEL.width, boxRight = W - Math.min(clear, W / 2);
  assert.ok(boxRight < panelLeft, `${boxRight} < ${panelLeft}`);
});

test("wiring: the panel's place and the toast's box come from one place", () => {
  const p = readFileSync(new URL("../src/components/IdentifyPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /style=\{\{ position: "absolute", \.\.\.IDENTIFY_PANEL, maxHeight:/);
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /style=\{toastBoxStyle\(identify\.on\) \/\* #3537/);
});
