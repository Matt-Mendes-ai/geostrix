// TASKS.csv #4005 — T / B / N / S / E / W on the 3D view: each key's camera, the guards (focus or pointer, typing, modifiers, dialogs, hidden tab), the wiring.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { VIEW_DIRECTIONS, TOP_PHI, viewDirectionKey, isTypingTarget, viewDirectionFor, applyViewDirection } from "../src/lib/viewer/viewDirections.js";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// ViewerModule's updateCamera: position = target + radius * (sin phi sin theta, cos phi, sin phi cos theta); world north = -z, east = +x
const at = (cs) => ({ x: cs.radius * Math.sin(cs.phi) * Math.sin(cs.theta), y: cs.radius * Math.cos(cs.phi), z: cs.radius * Math.sin(cs.phi) * Math.cos(cs.theta) });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
const key = (k, extra = {}) => ({ key: k, code: "Key" + k.toUpperCase(), ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra });
const ctx = (extra = {}) => ({ visible: true, over: true, focusInside: false, typing: false, modalOpen: false, ...extra });

test("#4005 each key puts the camera on its side, level, at the same distance and target", () => {
  const R = 850;
  const place = (k, from = {}) => { const cs = { theta: 1.1, phi: 0.9, radius: R, target: { x: 5, y: 6, z: 7 }, ...from }; assert.ok(applyViewDirection(cs, k)); return cs; };
  const n = at(place("n")), s = at(place("s")), e = at(place("e")), w = at(place("w"));
  near(n.x, 0); near(n.y, 0); near(n.z, -R); // from the north: on the north (-z) side, looking south
  near(s.x, 0); near(s.y, 0); near(s.z, R);
  near(e.x, R); near(e.y, 0); near(e.z, 0); // from the east: on the +x side
  near(w.x, -R); near(w.y, 0); near(w.z, 0);
  const top = place("t"); assert.equal(top.theta, 0); assert.equal(top.phi, TOP_PHI); near(at(top).y, R * Math.cos(TOP_PHI)); // as the Top button: north up
  const bottom = place("b"); assert.equal(bottom.theta, 1.1, "Bottom keeps the azimuth, as its button did"); assert.equal(bottom.phi, Math.PI - TOP_PHI);
  for (const k of ["t", "b", "n", "s", "e", "w"]) { const cs = place(k); assert.equal(cs.radius, R, k); assert.deepEqual(cs.target, { x: 5, y: 6, z: 7 }, k); }
});

test("#4005 a side view from any starting angle, and a turn-wound azimuth, ends on the same side", () => {
  for (const theta of [-9, -3.2, 0, 2.5, 40]) {
    const cs = { theta, phi: 0.3, radius: 100, target: {} }; applyViewDirection(cs, "e");
    near(at(cs).x, 100); near(at(cs).z, 0);
  }
  assert.equal(applyViewDirection({ theta: 0, phi: 1 }, "x"), false); assert.equal(applyViewDirection(null, "t"), false);
  assert.deepEqual(Object.keys(VIEW_DIRECTIONS).sort(), ["b", "e", "n", "s", "t", "w"]);
});

test("#4005 which key press is a view key: the six letters, either case; never with Ctrl / Alt / Meta or a key repeat", () => {
  for (const k of ["t", "T", "b", "B", "n", "N", "s", "S", "e", "E", "w", "W"]) assert.equal(viewDirectionKey(key(k)), k.toLowerCase(), k);
  for (const k of ["a", "x", "Home", "+", "Escape", "F10", "1"]) assert.equal(viewDirectionKey({ key: k, code: "" }), null, k);
  for (const m of ["ctrlKey", "metaKey", "altKey", "repeat"]) assert.equal(viewDirectionKey(key("t", { [m]: true })), null, m);
  // a layout without Latin letters: the physical key decides (Arabic: ت on KeyT)
  assert.equal(viewDirectionKey({ key: "ت", code: "KeyT" }), "t"); assert.equal(viewDirectionKey({ key: "ش", code: "KeyS" }), "s");
  assert.equal(viewDirectionKey({ key: "ش", code: "KeyQ" }), null);
  // a Latin letter that is not one of the six is not moved to another key by its code (an AZERTY 'a' on the physical Q)
  assert.equal(viewDirectionKey({ key: "a", code: "KeyT" }), null);
});

test("#4005 the guards: the pointer over the view or the focus in it; never typing, a dialog, or a 3D view that is not shown", () => {
  const e = key("n");
  assert.equal(viewDirectionFor(e, ctx()), "n", "pointer over");
  assert.equal(viewDirectionFor(e, ctx({ over: false, focusInside: true })), "n", "focus in the view");
  assert.equal(viewDirectionFor(e, ctx({ over: false })), null, "neither");
  assert.equal(viewDirectionFor(e, ctx({ typing: true })), null, "typing");
  assert.equal(viewDirectionFor(e, ctx({ modalOpen: true })), null, "a dialog is open");
  assert.equal(viewDirectionFor(e, ctx({ visible: false })), null, "another tab is showing");
  assert.equal(viewDirectionFor(key("n", { ctrlKey: true }), ctx()), null, "Ctrl+N is not ours");
  assert.equal(viewDirectionFor(key("s", { ctrlKey: true }), ctx()), null, "Ctrl+S stays Save");
});

test("#4005 what counts as typing: text fields, text areas, selects and editable text; not a checkbox, a button or a slider", () => {
  for (const el of [{ tagName: "INPUT", type: "text" }, { tagName: "INPUT" }, { tagName: "INPUT", type: "number" }, { tagName: "INPUT", type: "search" }, { tagName: "TEXTAREA" }, { tagName: "SELECT" }, { tagName: "DIV", isContentEditable: true }]) assert.equal(isTypingTarget(el), true, JSON.stringify(el));
  for (const el of [{ tagName: "INPUT", type: "checkbox" }, { tagName: "INPUT", type: "range" }, { tagName: "BUTTON" }, { tagName: "DIV" }, null, undefined]) assert.equal(isTypingTarget(el), false, JSON.stringify(el));
});

test("#4005 the wiring: one hook on the view, the buttons use the same views, the keys are in the tooltips, the shortcuts list and the Help card", () => {
  const v = read("src/modules/ViewerModule.jsx");
  assert.match(v, /import \{ applyViewDirection \} from "\.\.\/lib\/viewer\/viewDirections\.js"; import \{ useViewDirectionKeys \} from "\.\/viewer\/useViewDirectionKeys\.js";/);
  assert.match(v, /useViewDirectionKeys\(\{ viewRef: viewFocusRef, visibleRef, camState, cameraRef \}\);/);
  assert.match(v, /applyViewDirection\(camState\.current, "t"\); cameraRef\.current\.__update\(\); \}\} style=\{miniBtn\} title=\{tr\("Top view, north up \(T\)\./);
  assert.match(v, /applyViewDirection\(camState\.current, "b"\); cameraRef\.current\.__update\(\); \}\} style=\{miniBtn\} title=\{tr\("Bottom view \(B\)"\)\}/);
  const h = read("src/modules/viewer/useViewDirectionKeys.js");
  assert.match(h, /window\.addEventListener\("keydown", onKey\)/); assert.match(h, /pointerenter/); assert.match(h, /pointerleave/);
  assert.match(h, /document\.querySelector\("\[role=dialog\], \[aria-modal=true\]"\)/); assert.match(h, /isTypingTarget\(e\.target\) \|\| isTypingTarget\(a\)/);
  const s = read("src/components/ShortcutsModal.jsx");
  assert.match(s, /\["T \/ B \(pointer over the 3D view\)"/); assert.match(s, /\["N \/ S \/ E \/ W \(pointer over the 3D view\)"/);
  assert.match(read("src/help/pages/everyday.js"), /T, B, N, S, E and W jump to the top, the bottom, or level from that side/);
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(read(`src/locales/${lang}.json`)); assert.ok(d["Bottom view (B)"], lang); assert.ok(d["Top view, north up (T). Also B: bottom; N, S, E, W: level, from that side"], lang); }
});
