// TASKS.csv #2979 (split from #2483, WA uranium) — (1) two custom ribbons both read 'Gamma': a layer named 'Gamma: eU3O8_cased_ppm' was cut at
// its label's first ': '; (2) a hole past the line's B end, inside the end cap, was clipped by the frame while its name floated beyond the axes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ribbonLayers, ribbonOrder, groupSectionLegend } from "../src/lib/sectionLegend.js";

const nm = (name) => String(name).replace(/: /g, " – "); // as layerPrimitivesFor writes a custom layer's name

test("a custom layer whose name holds ': ' keeps its whole name in the ribbon list, the caption and the legend", () => {
  const ivs = [
    { layer: "custom:a", label: `${nm("Gamma: eU3O8_cased_ppm")}: 12` },
    { layer: "custom:b", label: `${nm("Gamma: Raw_cps")}: 76` },
    { layer: "litho", label: "Lithology: SST" },
  ];
  assert.deepEqual(ribbonLayers(ivs).map((r) => r.label), ["Gamma – eU3O8_cased_ppm", "Gamma – Raw_cps", "Lithology"]);
  assert.deepEqual(new Set(ribbonOrder(ivs)), new Set(["Gamma – eU3O8_cased_ppm", "Gamma – Raw_cps", "Lithology"]));
  const heads = groupSectionLegend(ivs.map((iv) => [iv.label, "#000"])).filter((r) => r[2]?.heading).map((r) => r[0]);
  assert.ok(heads.includes("Gamma – eU3O8_cased_ppm") && heads.includes("Gamma – Raw_cps"), JSON.stringify(heads));
});

test("wiring: the name is written with a dash where it had ': '", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const nm = String\(layer\.name\)\.replace\(\/: \/g, " – "\);/);
  assert.equal((v.match(/label: `\$\{nm\}: \$\{row\.value\}`/g) || []).length, 2, "intervals and points");
});

test("the frame spans the holes' in-buffer runs past either end; the corner coordinates are the frame's ends", () => {
  const w = fs.readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(w, /let minL = 0, maxL = len,/);
  assert.match(w, /if \(h\.runs && !h\.runs\.some\(\(\[m0, m1\]\) => p\.md >= m0 && p\.md <= m1\)\) continue; const l = \(p\.x - ax\) \* ux \+ \(p\.y - ay\) \* uy; if \(l < minL\) minL = l; if \(l > maxL\) maxL = l;/);
  // TASKS.csv #4009 — the same mapping through the zoom window (win.L0 is minL, win.L1 maxL at fit: windowOf returns the extents exactly)
  assert.match(w, /const hScale0 = \(W - 2 \* PAD\) \/ \(maxL - minL\);/);
  assert.match(w, /const sx = \(l\) => PAD \+ \(l - win\.L0\) \* hScale;/);
  assert.match(w, /const invSx = \(screenX\) => win\.L0 \+ \(screenX - PAD\) \/ hScale;/);
  assert.match(w, /niceTicks\(win\.L0, win\.L1, 8\)\.filter\(\(l\) => l >= win\.L0 && l <= win\.L1\)/);
  assert.match(w, /Math\.round\(ax \+ win\.L0 \* ux\)/);
  assert.match(w, /Math\.round\(ax \+ win\.L1 \* ux\)/);
  // the same along-the-line arithmetic: a hole 90 m past B on a 1,089 m line widens the axis to 1,179 m
  const len = 1089, ux = 1, uy = 0, ax = 0, ay = 0;
  let minL = 0, maxL = len;
  for (const p of [{ x: 1179, y: 8, md: 10 }, { x: 1179, y: 8, md: 60 }]) { const l = (p.x - ax) * ux + (p.y - ay) * uy; if (l < minL) minL = l; if (l > maxL) maxL = l; }
  assert.deepEqual([minL, maxL], [0, 1179]);
});
