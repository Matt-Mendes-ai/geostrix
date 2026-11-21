// TASKS.csv #3931 (Main: "so no import path is left") — every file input's 'change' is held while a project is coming forward and given again
// once it has loaded (lib/useImportGate.js, mounted once in App), so the pane's own handler reads the project that came forward.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldHold, releaseHeld } from "../src/lib/importGateRule.js";

const input = (files = 1, connected = true) => { const seen = []; return { tagName: "INPUT", type: "file", files: { length: files }, isConnected: connected, seen, dispatchEvent(e) { seen.push(e.type); return true; } }; };

test("held only while a project loads, only a file input with files, never the event it gives again itself", () => {
  const released = new Set();
  assert.equal(shouldHold(input(), true, released), true);
  assert.equal(shouldHold(input(), false, released), false); // no load: the pane reads it as before
  assert.equal(shouldHold(input(0), true, released), false); // a cleared input (the handler resets value)
  assert.equal(shouldHold({ tagName: "INPUT", type: "text", files: null }, true, released), false);
  const el = input(); released.add(el);
  assert.equal(shouldHold(el, true, released), false); // the released 'change' goes through to React
});

test("released: a fresh 'change' on the same input when it is still there; an input gone meanwhile is reported", () => {
  const released = new Set(), el = input();
  assert.equal(releaseHeld(el, released), true);
  assert.deepEqual(el.seen, ["change"]);
  assert.equal(released.size, 0);
  const gone = input(1, false);
  assert.equal(releaseHeld(gone, released), false);
  assert.deepEqual(gone.seen, []);
});

test("mounted once in App, at the window's capture phase, with the message", () => {
  const g = readFileSync(new URL("../src/lib/useImportGate.js", import.meta.url), "utf8");
  assert.match(g, /window\.addEventListener\("change", onChange, true\)/);
  assert.match(g, /e\.stopImmediatePropagation\(\);/);
  const a = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(a, /const importGate = useImportGate\(\); \/\/ TASKS\.csv #3931/);
  assert.match(a, /tr\("The project is still loading: the files are read when it has loaded\."\)/);
});
