// TASKS.csv #2788 — keyboard zoom on the focused 3D view: + / = in, - out, Home fits; never with Ctrl / Cmd / Alt (the window zoom, #2045).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { viewKeyZoom, KEY_ZOOM_STEP } from "../src/lib/viewer/viewKeys.js";

const ev = (key, mods = {}) => ({ key, ...mods, prevented: false, preventDefault() { this.prevented = true; } });
const run = (e) => { const calls = []; const handled = viewKeyZoom(e, { zoom: (f) => calls.push(["zoom", f]), fit: () => calls.push(["fit"]) }); return { handled, calls, prevented: e.prevented }; };

test("+ and = zoom in, - and _ zoom out, Home fits; each press handled once and its default stopped", () => {
  for (const k of ["+", "="]) assert.deepEqual(run(ev(k)), { handled: true, calls: [["zoom", KEY_ZOOM_STEP]], prevented: true });
  for (const k of ["-", "_"]) assert.deepEqual(run(ev(k)), { handled: true, calls: [["zoom", 1 / KEY_ZOOM_STEP]], prevented: true });
  assert.deepEqual(run(ev("Home")), { handled: true, calls: [["fit"]], prevented: true });
});

test("other keys, and any key with Ctrl / Cmd / Alt, are left alone", () => {
  for (const e of [ev("a"), ev("ArrowUp"), ev("Escape"), ev("ContextMenu"), ev("+", { ctrlKey: true }), ev("-", { metaKey: true }), ev("Home", { altKey: true })]) {
    assert.deepEqual(run(e), { handled: false, calls: [], prevented: false }, e.key);
  }
});

test("wiring: on the focused view only (#575's handler), the radius clamped, Home as the Fit button; listed in Shortcuts", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(v, /if \(e\.target !== e\.currentTarget\) return; \/\/ a control inside the view \(Fit, Top…\) keeps its own keys\n\s+if \(viewKeyZoom\(e, \{ zoom: \(f\) => \{ camState\.current\.radius = Math\.min\(4e6, Math\.max\(0\.05, camState\.current\.radius \* f\)\); cameraRef\.current\?\.__update\?\.\(\); \}, fit: \(\) => fitButton\(\) \}\)\) return;/);
  const s = fs.readFileSync(new URL("../src/components/ShortcutsModal.jsx", import.meta.url), "utf8");
  assert.match(s, /\["\+ \/ - \(the 3D view focused: click it first\)", "Zoom in \/ out"\]/);
  assert.match(s, /\["Home \(the 3D view focused\)", "Fit the view, as the Fit button"\]/);
});
