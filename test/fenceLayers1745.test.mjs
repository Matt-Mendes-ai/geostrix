// TASKS.csv #1745 / #2327 / #2426 — the Fence diagram:
// #1745 drew lithology only (no alteration, veins, or a custom unit layer);
// #2426 stopped at 5× vertical (60 m holes on a 6 km line are a 50 px band) and read RL 500-2,500 m for holes at RL 250-347;
// #2327 55 stacked collar labels took the top of the figure and stretched the RL axis.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suggestFenceVe, FENCE_VE, FENCE_LABEL_SLOTS, stackCollarLabels } from "../src/lib/fence.js";
import { fenceFurniture } from "../src/lib/figureFurniture.js";

test("#2426 — exaggeration up to 50×, proposed from the section's length to depth", () => {
  assert.deepEqual(FENCE_VE, [1, 1.5, 2, 3, 5, 10, 20, 50]);
  assert.equal(suggestFenceVe({ min: 0, max: 6000 }, { min: 250, max: 347 }), 20, "6 km over 97 m: 20×");
  assert.equal(suggestFenceVe({ min: 0, max: 600 }, { min: 0, max: 400 }), 1, "a deep section stays at true scale");
  assert.equal(suggestFenceVe({ min: 0, max: 0 }, { min: 0, max: 0 }), 1);
});

test("#2327 — labels stack at most three high", () => {
  const pts = Array.from({ length: 55 }, (_, i) => ({ id: "H" + i, x: 100 + (i % 3), y: 50 }));
  const slots = stackCollarLabels(pts);
  assert.ok(Math.max(...Object.values(slots)) >= 50, "55 labels on one spot stack 55 high");
  assert.equal(FENCE_LABEL_SLOTS, 3);
  const m = readFileSync(new URL("../src/components/FenceDiagramModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const need = 26 \+ 19 \* Math\.min\(FENCE_LABEL_SLOTS - 1, Math\.max\(0, \.\.\.Object\.values\(slots\)\)\);/);
  assert.match(m, /const labelled = \(slots\[h\.hole_id\] \|\| 0\) < FENCE_LABEL_SLOTS;/);
  assert.match(m, /<circle [^>]*><title>\{`\$\{h\.hole_id\} — \$\{h\.maxAbsOffset\.toFixed\(0\)\} m off section`\}<\/title><\/circle>/);
});

test("#1745 — a Show picker over the interval logs and coded custom layers drives columns, legend, bands and export", () => {
  const m = readFileSync(new URL("../src/components/FenceDiagramModal.jsx", import.meta.url), "utf8");
  assert.match(m, /\{ key: "litho", label: tr\("Lithology"\) \}/);
  assert.match(m, /customLayers\.filter\(\(c\) => \(c\.rows \|\| \[\]\)\.some\(\(r\) => r\.value != null && r\.value !== "" && !Number\.isFinite\(Number\(r\.value\)\)\)\)/);
  assert.match(m, /\(shownRows \|\| \[\]\)\.forEach\(\(r\) => \{ \/\/ #1745/);
  assert.match(m, /fill=\{colorOf\(b\.code\)\}/);
  assert.match(m, /fill=\{colorOf\(r\.value\)\}/);
  assert.match(m, /keyTitle: showSrc\?\.label/);
  assert.match(m, /if \(showSrc && showSrc\.key !== "litho"\) return null;/, "FGDC patterns stay lithology's");
  const f = fenceFurniture({ holeIds: ["A", "B"], azimuth: 90, fitted: true, ve: 20, offsetLimit: 100, bands: true, codes: ["E1"], colorOf: () => "#123456", keyTitle: "Strat unit", date: "2026-11-11" });
  assert.equal(f.keys[0].title, "Strat unit");
  assert.equal(fenceFurniture({ holeIds: ["A"], azimuth: 0, fitted: false, ve: 1, offsetLimit: 50, bands: false, codes: ["X"], colorOf: () => "#000", date: "x" }).keys[0].title, "Lithology");
});
