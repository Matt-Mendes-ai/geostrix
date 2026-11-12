// TASKS.csv #1480 — the strip log goes to Layout with its tracks and a bound legend; a tall image fits the sheet
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripLogTextPt } from "../src/lib/atlas.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("the strip log window sends the exported figure and its colour-track legend", () => {
  const src = read("src/components/StripLog.jsx");
  assert.match(src, /exportSvgMarkup\(svg, \{ furniture: furniture\(\) \}\);\s*const legendItems = tracks\.filter\(\(t\) => t\.kind === "fill" \|\| t\.kind === "struct"\)/);
  assert.match(src, /const addTo = onAddToLayout;\s*embedFigureFont\(markup\)\.catch\(\(\) => markup\)\.then\(\(m\) => addTo\(\{ label: `Strip log — \$\{holeId\}\$\{rangeText\}`/); // #2610 — after the font goes in
  assert.match(src, /\{onAddToLayout && <button onClick=\{addToLayout\}/);
  assert.match(read("src/modules/ViewerModule.jsx"), /onAddToLayout=\{\(img\) => \{ addLayoutImage\(img\); goToModule\("layout"\); \}\} onAdvice=/);
});

test("Layout caps a queued image at the sheet height", () => {
  assert.match(read("src/modules/LayoutModule.jsx"), /const maxH = A4\.h - 160, w = Math\.round\(Math\.min\(maxW, 700, maxH \* aspect\)\);/);
});

test("a 3,000 px log fitted to a 634 px sheet height prints its labels too small to read", () => {
  assert.ok(stripLogTextPt(3000, 634) < 6);
  assert.ok(stripLogTextPt(700, 634) > 6);
});

test("a depth range trims every track, and the axis, exports and caption follow it", async () => {
  const src = read("src/components/StripLog.jsx");
  assert.match(src, /const sy = \(d\) => PAD_TOP \+ \(d - d0\) \* pxPerMeter;/);
  assert.match(src, /const tracks = ranged \? allTracks\.map\(\(t\) => \(\{ \.\.\.t, rows: t\.kind === "struct" \? t\.rows\.filter\(\(s\) => s\.depth >= d0 && s\.depth <= d1\) : clip\(t\.rows\) \}\)\) : allTracks;/);
  assert.match(src, /stripLogFurniture\(\{ holeId, collar, fromDepth: d0, maxDepth: d1,/);
  assert.match(src, /depthTicks\(d0, d1, pxPerMeter\)/);
  assert.match(src, /const wide = 700 \* \(fh \/ fw\) <= 794 - 160;/);
  const { stripLogFurniture } = await import("../src/lib/figureFurniture.js");
  assert.match(stripLogFurniture({ holeId: "H", collar: {}, fromDepth: 900, maxDepth: 1000, pxPerMeter: 4, tracks: [] }).caption[1], /^Depth 900\.0-1000\.0 m along the hole/);
  assert.match(stripLogFurniture({ holeId: "H", collar: {}, maxDepth: 402.5, pxPerMeter: 6, tracks: [] }).caption[1], /^Depth 0-402\.5 m/);
});
