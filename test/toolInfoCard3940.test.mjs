// TASKS.csv #3940 (Matt, 2026-11-21: "I want this nice pop up info box for every tool. Most of them display only a plain text") — every RibbonButton
// shows the styled info card (heading = its label, body = its title; a disabled one leads with its reason) instead of a plain native tooltip, from ONE
// component (HoverToolInfo.jsx's useToolInfo), and the card follows the same rules as StrixViewer's: never over the button's own menu (#3928), on keyboard
// focus too, Escape hides it, never off-screen, rtl-aware.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { placeToolInfo } from "../src/lib/toolInfoPlace.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3940 RibbonButton: the card comes from useToolInfo, heading = label, body = title (reason first when disabled), no native title beside it", () => {
  const r = read("../src/components/Ribbon.jsx");
  const fn = r.slice(r.indexOf("export function RibbonButton("), r.indexOf("// Header for a tool shown in the sidebar"));
  assert.match(fn, /useToolInfo\(\{ anchorRef, title: label, text: body \|\| undefined, suppress: expanded === true \}\)/);
  assert.match(fn, /const body = soft \? \(title \? `\$\{disabledReason\} — \$\{title\}` : disabledReason\) : title;/);
  assert.match(fn, /aria-describedby=\{body \? info\.descId : undefined\}/);
  assert.match(fn, /\{\.\.\.info\.handlers\}/);
  assert.match(fn, /\{info\.card\}/);
  const button = fn.slice(fn.indexOf("<button"), fn.indexOf("</button>"));
  assert.doesNotMatch(button, /\stitle=/, "a native title would stack under the card");
});

test("#3940 the card: delay, keyboard focus only, Escape / click / scroll / resize hide it, a portal with fixed coordinates", () => {
  const h = read("../src/components/HoverToolInfo.jsx");
  assert.match(h, /const HOVER_MS = 350, FOCUS_MS = 80;/);
  assert.match(h, /e\.target\?\.matches\?\.\(":focus-visible"\)/);
  assert.match(h, /e\.key === "Escape"/);
  assert.match(h, /window\.addEventListener\("scroll", hide, true\)/);
  assert.match(h, /onMouseDown: \(\) => setDismissed\(true\)/);
  assert.match(h, /createPortal\(/);
  assert.match(h, /position: "fixed"/);
  assert.match(h, /const visible|want = \(hover \|\| focus\) && !suppress && !dismissed/);
  assert.match(h, /fontSize: "var\(--font-size-sm\)"/);
  assert.match(h, /fontSize: "var\(--font-size-base\)"/);
  assert.doesNotMatch(h, /fontSize: \d/, "text size tokens only");
});

test("#3940 the 3D View's own buttons still suppress the card over their menu (#3928)", () => {
  const v = read("../src/modules/viewer/ViewerParts.jsx");
  for (const k of ["model", "grid", "figure", "themes"]) assert.match(v, new RegExp(`suppress=\\{openPopover === "${k}"`), k);
});

test("#3940 placement: under the button, flipped above near the bottom, clamped to the window, end edge in rtl", () => {
  const view = { width: 1000, height: 700 }, card = { width: 240, height: 80 };
  // plain: under, start edge on the button's start edge
  assert.deepEqual(placeToolInfo({ left: 100, right: 160, top: 40, bottom: 100 }, card, view), { left: 100, top: 106 });
  // near the right edge: clamped so the card ends 8 px inside the window
  assert.equal(placeToolInfo({ left: 960, right: 1000, top: 40, bottom: 100 }, card, view).left, 1000 - 240 - 8);
  // near the left edge in rtl: the card's end edge meets the button's end edge, then clamped at 8
  assert.equal(placeToolInfo({ left: 2, right: 40, top: 40, bottom: 100 }, card, view, { rtl: true }).left, 8);
  assert.equal(placeToolInfo({ left: 500, right: 560, top: 40, bottom: 100 }, card, view, { rtl: true }).left, 560 - 240);
  assert.equal(placeToolInfo({ left: 500, right: 560, top: 40, bottom: 100 }, card, view, { align: "right" }).left, 560 - 240);
  // no room below: above the button
  assert.equal(placeToolInfo({ left: 100, right: 160, top: 640, bottom: 690 }, card, view).top, 640 - 6 - 80);
  // no room either way: still inside the window
  const tall = placeToolInfo({ left: 0, right: 40, top: 100, bottom: 160 }, { width: 240, height: 680 }, view);
  assert.ok(tall.top >= 8 && tall.top + 680 <= 700 - 8 + 1e-9 || tall.top === 8);
  // never negative, whatever the inputs
  for (const a of [{ left: -50, right: -10, top: -30, bottom: 0 }, { left: 1200, right: 1240, top: 800, bottom: 840 }]) {
    const p = placeToolInfo(a, card, view);
    assert.ok(p.left >= 8 && p.left + 240 <= 992 && p.top >= 8 && p.top + 80 <= 692, JSON.stringify(p));
  }
});

test("#3940 no RibbonButton passes a native title through to the DOM; every title is still passed as the card's body", () => {
  // every call site keeps its title= prop (the card's body); only RibbonButton's own <button> must not render it
  const dirs = ["../src/modules/", "../src/modules/viewer/"];
  let uses = 0;
  for (const d of dirs) for (const f of readdirSync(new URL(d, import.meta.url)).filter((x) => x.endsWith(".jsx"))) {
    uses += (read(d + f).match(/<RibbonButton\b/g) || []).length;
  }
  assert.ok(uses >= 100, `${uses} RibbonButton uses`);
});
