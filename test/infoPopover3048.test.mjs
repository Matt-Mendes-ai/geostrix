// TASKS.csv #3048 — info (i) popovers are drawn in document.body at window coordinates, kept inside the window.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { infoPopoverPlace } from "../src/lib/infoPopoverPlace.js";

const btn = (left, top) => ({ left, top, right: left + 15, bottom: top + 15 });

test("a popover near the right edge is moved left to stay inside the window", () => {
  const p = infoPopoverPlace(btn(160, 70), { width: 300, height: 120, viewW: 440, viewH: 900 });
  assert.equal(p.width, 300);
  assert.ok(p.left + p.width <= 440 - 8, JSON.stringify(p));
  assert.equal(p.top, 70 + 15 + 6);
});

test("with no room below it opens above the button; a narrow window narrows it", () => {
  const p = infoPopoverPlace(btn(100, 860), { width: 240, height: 150, viewW: 1200, viewH: 900 });
  assert.ok(p.top + 150 <= 860, JSON.stringify(p));
  const n = infoPopoverPlace(btn(20, 50), { width: 300, height: 0, viewW: 250, viewH: 600 });
  assert.equal(n.width, 250 - 16);
  assert.equal(n.left, 8);
});

test("align right keeps the right edges together when there is room", () => {
  const p = infoPopoverPlace(btn(900, 100), { width: 240, align: "right", viewW: 1400, viewH: 900 });
  assert.equal(p.left, 915 - 240);
});

test("InfoButton renders the popover through a portal at fixed position", () => {
  const s = fs.readFileSync("src/components/InfoButton.jsx", "utf8");
  assert.match(s, /createPortal\(/);
  assert.match(s, /position: "fixed"/);
  assert.doesNotMatch(s, /position: "absolute", zIndex: 90/);
});
