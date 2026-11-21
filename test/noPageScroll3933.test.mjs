// TASKS.csv #3933 — clicking "Gentle" in the trend helper turned the whole window blank (v0.2.3): the hidden radio was absolutely placed with no
// positioned box around it, so it sat at the page's foot (about 2,600 px down), and focusing it scrolled the whole app out of the window. The fix
// gives the radio's label a box, and the page itself can no longer scroll: app.css keeps its scroll range at zero, lib/noPageScroll.js is the backstop.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { installNoPageScroll } from "../src/lib/noPageScroll.js";

const src = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

function fakeWindow() {
  const box = (tag) => ({ tagName: tag, scrollTop: 0, scrollLeft: 0 });
  const html = box("HTML"), body = box("BODY"), root = box("DIV"), pane = box("DIV");
  const doc = { documentElement: html, body, scrollingElement: html, getElementById: (id) => (id === "root" ? root : null) };
  const listeners = [];
  const win = { document: doc, addEventListener: (t, fn, o) => listeners.push([t, fn, o]), removeEventListener: (t, fn) => { const i = listeners.findIndex((l) => l[0] === t && l[1] === fn); if (i >= 0) listeners.splice(i, 1); } };
  const fire = (target) => listeners.filter((l) => l[0] === "scroll").forEach((l) => l[1]({ target }));
  return { win, doc, html, body, root, pane, fire, listeners };
}

test("the page, body and #root are put back at once when something scrolls them; a pane's own scroll is left alone", () => {
  const w = fakeWindow();
  const off = installNoPageScroll(w.win);
  assert.equal(w.listeners.length, 1);
  assert.deepEqual(w.listeners[0][2], { capture: true, passive: true }); // capture: an element's scroll does not bubble
  w.html.scrollTop = 1627; w.fire(w.doc); // what v0.2.3 did: the page scrolled 1,627 px
  assert.equal(w.html.scrollTop, 0);
  w.body.scrollTop = 900; w.fire(w.body); assert.equal(w.body.scrollTop, 0);
  w.root.scrollLeft = 40; w.fire(w.root); assert.equal(w.root.scrollLeft, 0);
  w.pane.scrollTop = 500; w.html.scrollTop = 0; w.fire(w.pane);
  assert.equal(w.pane.scrollTop, 500); // the side panel scrolling through its own content stays where the user put it
  off();
  assert.equal(w.listeners.length, 0);
  w.html.scrollTop = 10; w.fire(w.doc); assert.equal(w.html.scrollTop, 10);
  assert.doesNotThrow(() => installNoPageScroll({})()); // no document (Node): nothing to guard
});

test("app.css: html takes the window's overflow, body is the box for stray elements and clips them, as #root does", () => {
  const css = src("src/styles/app.css"), screen = css.split("@media print")[0];
  assert.match(screen, /^html \{ overflow: hidden; \}/m);
  assert.match(screen, /^body \{ position: relative; \}/m);
  assert.match(screen, /^#root \{ overflow: clip; \}/m);
  const bodyRule = /^body \{\n?([^}]*)\}/gm, overflows = [...screen.matchAll(bodyRule)].map((m) => /overflow:\s*([a-z]+)/.exec(m[1])?.[1]).filter(Boolean);
  assert.deepEqual(overflows, ["clip"]); // not hidden: with html taking the window's overflow, a hidden body is a scroll box of its own
  for (const sel of ["html", "body", "#root"]) {
    const later = [...screen.matchAll(new RegExp(`(^|[,}\\s])${sel.replace("#", "\\#")}\\s*[,{][^}]*overflow(-[xy])?:\\s*(auto|scroll|visible)`, "gm"))];
    assert.equal(later.length, 0, `${sel} is given a scrolling overflow on screen`);
  }
});

test("the guard is installed at start-up, and no hidden input in the app sits outside a positioned label", () => {
  assert.match(src("src/main.jsx"), /\ninstallNoPageScroll\(\);/);
  // a visually hidden input placed absolutely must be inside a box of its own: the label it sits in is position: relative
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(new URL(`../${d}`, import.meta.url), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.jsx$/.test(e.name)) files.push(p); } };
  walk("src");
  let seen = 0;
  for (const f of files) {
    const lines = src(f).split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!/<input\b.*position: "absolute", opacity: 0/.test(line)) return;
      seen++;
      const label = lines.slice(Math.max(0, i - 3), i).reverse().find((l) => /<label\b/.test(l));
      assert.ok(label && /position: "relative"/.test(label), `${path.basename(f)}:${i + 1}: a hidden input whose label has no position`);
    });
  }
  assert.ok(seen >= 1, "the trend helper's strength radios are found by this check");
});
