// TASKS.csv #3410 (#3373's half, review #3195 Galore Creek) — a section re-drawn at a large text factor (a narrow placement in Layout): the
// title wraps to the frame, the band above the drawing follows its lines, and the two end coordinates stack instead of overprinting.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sectionHeaderLayout, stackEndLabels, textWidth } from "../src/lib/sectionHeader.js";

const W = 1100;
const at = (k) => ({ PAD: Math.round(60 * k), fs: (n) => +(n * k).toFixed(2) });

test("at the default size: one title line where it always was (the subtitle's first line less fs(14)), nothing added on top", () => {
  const { PAD, fs } = at(1), sub = ["Azimuth 65° · looking NW · no vertical exaggeration · elevation in m"];
  const h = sectionHeaderLayout("Section through GC23-0976 (az 65°)", sub, W, PAD, fs);
  assert.deepEqual(h.titleLines, ["Section through GC23-0976 (az 65°)"]);
  assert.equal(h.subtitleY, PAD - fs(8));
  assert.equal(h.titleY, PAD - fs(22));
  assert.equal(h.topExtra, 0);
});

test("a long title at a 2.6x text factor wraps to the frame, and the drawing grows up to hold every line", () => {
  const { PAD, fs } = at(2.6), sub = ["Azimuth 65° · looking NW · 3x vertical exaggeration · data within 50 m", "· elevation in m", "Ribbons on each hole, left to right: Lithology · Alteration", "· Mineralization · Specific gravity · Geotech (RQD%)"];
  const title = "Section through GC23-0976 and GC23-0981 along the Central Zone fan (az 65°)";
  const h = sectionHeaderLayout(title, sub, W, PAD, fs);
  assert.ok(h.titleLines.length >= 2, h.titleLines.join(" | "));
  for (const l of h.titleLines) assert.ok(textWidth(l, fs(12), 0.6) <= W - 2 * PAD + 1e-6, l);
  assert.equal(h.titleLines.join(" "), title);
  // the first title line's top (its baseline less a cap height) is inside the grown viewBox (which starts at -topExtra)
  assert.ok(h.titleY - fs(12) >= -h.topExtra - 4, `${h.titleY} ${h.topExtra}`);
  // and the last title line sits above the subtitle's first
  assert.ok(h.titleY + (h.titleLines.length - 1) * fs(14) <= h.subtitleY - fs(12));
});

test("end coordinates: side by side while they fit; the right one a line lower when they would overprint", () => {
  const l = "395,412 E  6,312,880 N", r = "395,988 E  6,313,140 N";
  assert.equal(stackEndLabels(l, r, W, 60, 10), false, "full size: 1,100 px holds both");
  assert.equal(stackEndLabels(l, r, W, Math.round(60 * 2.6), 26), false, "at 2.6x: ~652 px of 788, side by side");
  assert.equal(stackEndLabels(l, r, W, Math.round(60 * 3.5), 35), true, "at 3.5x the two need ~874 px of 680: stacked");
});

test("wiring: the title lines, the subtitle's y, the stacked end label", () => {
  const s = fs.readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const \{ titleLines, titleY, subtitleY, topExtra \} = sectionHeaderLayout\(title \|\| tr\("Cross-section"\), subtitleLines, W, PAD, fs\);/);
  assert.match(s, /\{titleLines\.map\(\(l, i\) => <tspan key=\{i\} x=\{PAD\} dy=\{i \? fs\(14\) : 0\}>\{l\}<\/tspan>\)\}/);
  assert.match(s, /<text x=\{PAD\} y=\{subtitleY\}/);
  assert.match(s, /y=\{stack \? y \+ fs\(12\) : y\}/);
});
