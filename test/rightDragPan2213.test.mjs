// TASKS.csv #2043 / #2213 — a right-drag pans the 3D View and opens no context menu; a clean right-click still opens it, whether the
// platform sends the contextmenu event after the release (Windows) or on the press (macOS / Linux).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rightDragTracker } from "../src/modules/viewer/rightDrag.js";

test("Windows order (press, move, release, contextmenu): a drag skips the menu, a clean click opens it", () => {
  const t = rightDragTracker();
  t.down(900, 500); t.move(950, 520); t.move(1000, 540);
  assert.equal(t.up(1000), null);
  assert.equal(t.onMenu(1010), "skip");
  assert.equal(t.onMenu(1020), "open", "only the menu right after the drag is skipped");
  t.down(900, 500); t.move(902, 501);
  assert.equal(t.up(2000), null);
  assert.equal(t.onMenu(2010), "open");
});

test("macOS / Linux order (press, contextmenu, release): the menu waits for the release and opens only when the pointer stayed put", () => {
  const t = rightDragTracker();
  t.down(900, 500);
  assert.equal(t.onMenu(1000, { clientX: 900, clientY: 500 }), "defer");
  t.move(901, 502);
  assert.deepEqual(t.up(1100), { clientX: 900, clientY: 500 });
  t.down(900, 500);
  assert.equal(t.onMenu(2000, { clientX: 900, clientY: 500 }), "defer");
  t.move(1000, 600);
  assert.equal(t.up(2100), null, "a drag: no deferred menu");
});

test("a menu with no right press at all (keyboard, a stale skip window) opens", () => {
  const t = rightDragTracker();
  assert.equal(t.onMenu(0), "open");
  t.down(0, 0); t.move(100, 0); t.up(1000);
  assert.equal(t.onMenu(5000), "open", "long after the drag");
});

test("ViewerModule wiring: a right press starts a pan; the menu asks the tracker", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /if \(e\.button === 2\) \{ rightDrag\.down\(e\.clientX, e\.clientY\); dragRef\.current = \{ dragging: true, panning: true,/);
  assert.match(v, /const rd = rightDrag\.onMenu\(Date\.now\(\), \{ clientX: e\.clientX, clientY: e\.clientY \}\); if \(rd !== "open"\) return;/);
  assert.match(v, /if \(e\.button === 2\) \{ const at = rightDrag\.up\(Date\.now\(\)\); if \(at\) onContextMenuEvt\(/);
  assert.match(v, /rightDrag\.move\(e\.clientX, e\.clientY\);/);
});
