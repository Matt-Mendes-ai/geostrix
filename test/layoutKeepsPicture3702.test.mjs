// TASKS.csv #3702 (rehearsal round 3, a regression from #3657) — a strip log, section or Maps plan sent to Layout DISAPPEARED when the open page had room for it, first use included. The #3657 effect wrote
// setElements(refitStarter(elements, ...)) — the render's own element list — whenever any element differed by identity, and refitStarter returned new objects for the starter's north arrow even when nothing
// moved, so it always wrote, and the write replaced the list the picture-adding effect had just extended. Now refitStarter keeps an unmoved element as the same object, refitStarterOf returns the list itself when
// nothing moves, and the Layout's two callers update functionally (on the elements as they are when the update runs).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { starterLayout, refitStarter, refitStarterOf } from "../src/lib/layoutCredits.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const a4 = { size: "a4", orientation: "landscape" }, tab = { size: "tabloid", orientation: "landscape" };
const CREDIT = "Drilling data courtesy of Fireweed Metals Corp., Macpass Project, Yukon (fireweedmetals.com). Used with permission; see Fireweed's data disclaimer. Terrain: Copernicus GLO-30 DEM, ESA 2021, distributed under the Copernicus licence; imagery as credited by its source."; // two lines on A4: the credit box grows
const starter = (f, text = "") => { const L = starterLayout(f, text); return [{ id: "title", type: "title", x: 40, y: 30, text: "{project}" }, { id: "north", type: "north", ...L.north }, { id: "scale", type: "scale", x: 40, y: L.scale.y, meters: 100 }, { id: "credits", type: "text", x: L.credits.x, y: L.credits.y, w: L.credits.w, text: "{credits}" }]; };

test("nothing to move: every element comes back as the same object, and refitStarterOf returns the list itself", () => {
  const els = starter(a4, CREDIT);
  const out = refitStarter(els, a4, a4, CREDIT, CREDIT);
  out.forEach((el, i) => assert.equal(el, els[i], `${els[i].id} is the same object`));
  assert.equal(refitStarterOf(els, a4, a4, CREDIT, CREDIT), els);
  // the north arrow is where both layouts put it (only the scale bar and the credit move for a longer credit): it stays the same object
  const s0 = starter(a4, ""), late = refitStarter(s0, a4, a4, CREDIT, "");
  assert.equal(late[1], s0[1], "the unmoved north arrow is the same object (it was a new one: the cause)");
  assert.notEqual(late[3], s0[3]); assert.ok(late[3].y < s0[3].y, "the credit moves up for a longer credit");
});

test("the regression: a picture added in the same render survives the refit (functional), where the old write-back lost it", () => {
  // the state the page holds, and the setter the Layout uses (the store's: a value or an updater)
  let state = starter(a4, "");
  const setElements = (u) => { state = typeof u === "function" ? u(state) : u; };
  const renderElements = state; // what the effect's closure saw
  // the picture-adding effect runs first: a strip log goes onto the page
  setElements((els) => [...els, { id: "img_strip", type: "image", x: 600, y: 60, w: 300, h: 600 }]);
  // OLD: computed from the render's list and written back whole
  const old = refitStarter(renderElements, a4, a4, CREDIT, "");
  const oldState = old.some((el, i) => el !== renderElements[i]) ? old : state;
  assert.ok(!oldState.some((el) => el.id === "img_strip"), "the old write-back drops the picture (the bug, reproduced)");
  // NEW: a functional update on the elements as they are
  setElements((prev) => refitStarterOf(prev, a4, a4, CREDIT, ""));
  assert.ok(state.some((el) => el.id === "img_strip"), "the picture is still on the page");
  assert.ok(state.find((el) => el.id === "credits").y < starter(a4, "")[3].y, "and the credit was still refitted");
  // with nothing to move the update is a no-op: the very same list
  const before = state; setElements((prev) => refitStarterOf(prev, a4, a4, CREDIT, CREDIT)); assert.equal(state, before);
});

test("a paper change still moves the starter, and leaves an element the user moved", () => {
  const els = starter(a4, ""), out = refitStarterOf(els, a4, tab, "");
  const T = starterLayout(tab, "");
  assert.deepEqual([out[1].x, out[2].y, out[3].y, out[3].w], [T.north.x, T.scale.y, T.credits.y, T.credits.w]);
  const moved = [...els]; moved[2] = { ...els[2], y: 300 };
  assert.equal(refitStarterOf(moved, a4, tab, "")[2], moved[2], "the moved scale bar stays as it is");
});

test("wired: both LayoutModule callers update functionally through refitStarterOf", () => {
  const l = read("../src/modules/LayoutModule.jsx");
  assert.match(l, /setElements\(\(prev\) => refitStarterOf\(prev \|\| \[\], f, f, credits, ""\)\);/);
  assert.match(l, /setElements\(\(prev\) => \{ const t = refitStockTemplate\(prev \|\| \[\], f\)/);
  assert.doesNotMatch(l, /if \(next\.some\(\(el, i\) => el !== elements\[i\]\)\) setElements\(next\);/);
  assert.doesNotMatch(l, /\brefitStarter\(/, "no caller left on the identity-returning version");
});
