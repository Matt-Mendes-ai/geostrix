// TASKS.csv #3656 / #3657 / #3658 (re-test R2) — (3657) the starter credit and scale bar follow the paper, (3658) the credit and the title block sit inside a 40 px (10.6 mm) margin and the block is as tall as its
// wrapped Data row, (3656) the print page clips its elements in a box of its own so one element far past a sheet cannot shrink every page of the PDF. SYNTHETIC.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { creditsElement, starterLayout, refitStarter, PAGE_MARGIN } from "../src/lib/layoutCredits.js";
import { titleBlockHeight, titleBlockSpot } from "../src/lib/layoutTitleBlock.js";
import { pagePx } from "../src/lib/pageFormats.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const LONG = "Drilling data courtesy of Fireweed Metals Corp. Assessment report data of the BC Geological Survey. Contains information licensed under the Open Government Licence; no warranty. Not a resource estimate; for exploration use only, see the disclaimer.";
const PAPERS = [["a4", "landscape"], ["letter", "landscape"], ["tabloid", "landscape"], ["a3", "landscape"], ["letter", "portrait"], ["a4", "portrait"]].map(([size, orientation]) => ({ size, orientation }));

test("on every paper the credit ends inside the margin, the scale bar is above it, the title block above it and inside the page", () => {
  for (const f of PAPERS) {
    const { w, h } = pagePx(f), c = creditsElement(f, LONG), L = starterLayout(f, LONG);
    assert.equal(c.x, PAGE_MARGIN); assert.equal(c.w, w - 2 * PAGE_MARGIN); assert.ok(c.y + 15 * Math.ceil((LONG.length * 5.9) / c.w) <= h - PAGE_MARGIN + 1, `${f.size} ${f.orientation}: ends at the margin`);
    assert.ok(L.scale.y + 50 <= c.y, "the scale bar is above the credit"); assert.ok(L.north.x + 60 <= w - PAGE_MARGIN + 17 && L.north.y >= PAGE_MARGIN);
    const tb = titleBlockSpot(f, { credit: true, creditText: LONG }), th = titleBlockHeight({ credit: true, creditText: LONG });
    assert.ok(tb.y + th <= c.y, `${f.size}: the title block ends above the credit`); assert.ok(tb.x + 340 <= w - PAGE_MARGIN + 1);
  }
  assert.ok(titleBlockHeight({ credit: true, creditText: LONG }) > 12 * 19 + 4, "the wrapped Data row makes it taller than 12 one-line rows");
  assert.equal(titleBlockHeight({}), 11 * 19 + 4);
});

test("a paper change moves the starter's north arrow, scale bar and credit with it; one the user moved stays", () => {
  const a4 = { size: "a4", orientation: "landscape" }, tab = { size: "tabloid", orientation: "landscape" }, L = starterLayout(a4, "");
  const els = [{ id: "north", type: "north", ...L.north }, { id: "scale", type: "scale", x: 40, y: L.scale.y, meters: 100 }, { id: "credits", type: "text", x: L.credits.x, y: L.credits.y, w: L.credits.w, text: "{credits}" }];
  const out = refitStarter(els, a4, tab, "");
  const T = starterLayout(tab, ""); assert.deepEqual([out[0].x, out[0].y, out[1].y, out[2].y, out[2].w], [T.north.x, T.north.y, T.scale.y, T.credits.y, T.credits.w]);
  const moved = refitStarter([{ ...els[1], y: 123 }], a4, tab, ""); assert.equal(moved[0].y, 123);
  // a credit that arrives later: a longer box, the bar above it
  const late = refitStarter(els, a4, a4, LONG, ""); assert.ok(late[2].y < els[2].y && late[1].y < els[1].y);
});

test("the print page clips its elements in a box of its own, and the pieces are wired", () => {
  const l = read("../src/modules/LayoutModule.jsx");
  assert.match(l, /<div className="ge-print-clip" style=\{\{ position: "absolute", inset: 0, overflow: "hidden", contain: "strict" \}\}>/); // contain: #3703
  assert.match(l, /const starterFor = \(format, creditText = ""\)/); assert.match(l, /titleBlockSpot\(pageFormatOf\(activePage\)/);
  assert.match(l, /refitStarterOf\(base, oldFormat, f, credit\)/); // #3702 — functional now
});

// TASKS.csv #3662 — the credit's lines are measured (canvas text in the app) and word-wrapped, not estimated from its length; with no canvas the old estimate
import { textLines, creditLines } from "../src/lib/layoutCredits.js";
test("#3662 words are measured and wrapped to the box; a very long word-free run does not fake extra lines; with no canvas the estimate", () => {
  const m = (t) => t.length * 10; // 10 px a letter
  assert.equal(textLines("aaa bbb ccc", 60, 11, m), 3, "each word on its own line at 60 px");
  assert.equal(textLines("aaa bbb ccc", 100, 11, m), 2, "aaa bbb (70) fits, then ccc");
  assert.equal(textLines("aaa bbb ccc", 400, 11, m), 1);
  assert.equal(textLines("one\ntwo three", 400, 11, m), 2, "a new line in the credit is a new line");
  assert.equal(textLines("", 400, 11, m), 1);
  assert.equal(creditLines(LONG, 1043, (t) => t.length * 3), 1, "a narrow letter fits the long credit on one A4 line"); assert.ok(creditLines(LONG, 1043, (t) => t.length * 12) >= 3);
  assert.equal(creditLines(LONG, 1043), Math.max(1, Math.ceil((LONG.length * 5.9) / 1043)), "no canvas in Node: the estimate");
  assert.match(fs.readFileSync(new URL("../src/lib/creditLine.js", import.meta.url) /* #3854: the credit line moved out of layoutCredits.js (startup bundle) */, "utf8"), /document\.createElement\("canvas"\)\.getContext\("2d"\)/);
});
