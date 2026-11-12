// TASKS.csv #2792 (split from #2055) — the Downhole plot drew true dips from alpha / beta without saying which beta reference line they rest
// on; the Stereonet and the Structures pane say it since #2055. It now says it too, in True dip mode (alpha does not depend on the line).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { betaReferenceCounts } from "../src/lib/coreOrientation.js";

const src = readFileSync(new URL("../src/components/DownholeStructurePlot.jsx", import.meta.url), "utf8");

test("counts the hole's oriented picks by their beta line; alpha-only and logged picks are not counted", () => {
  const picks = [
    { hole_id: "A", depth: 10, dip: 40, azimuth: 120, abRef: "bottom", oriented: true },
    { hole_id: "A", depth: 12, dip: 55, azimuth: 300, abRef: "top", oriented: true },
    { hole_id: "A", depth: 14, dip: 30, azimuth: 90, oriented: true }, // logged dip / dip direction
    { hole_id: "A", depth: 16, dip: null, azimuth: null, alpha: 35, abRef: "bottom", oriented: false }, // not oriented yet
  ];
  assert.deepEqual(betaReferenceCounts(picks.filter((p) => p.oriented)), { top: 1, bottom: 1 });
});

test("the note is shown in True dip mode only, from this hole's shown picks, with the Stereonet's sentence", () => {
  assert.match(src, /const betaRefs = useMemo\(\(\) => betaReferenceCounts\(holePicks\.filter\(\(p\) => p\.oriented\)\), \[holePicks\]\);/);
  assert.match(src, /\{effectiveMode === "dip" && betaRefs\.top \+ betaRefs\.bottom > 0 && <div role="note"/);
  const key = 'tr("{n} of these picks were oriented from alpha / beta with beta measured from the {ref}-of-hole line, as chosen when they were imported (a structure file does not say). Had the core been marked on the other line, each would plot elsewhere, by tens of degrees for some."';
  assert.equal(src.split(key).length - 1, 2, "the bottom- and top-line sentences");
  assert.ok(readFileSync(new URL("../src/components/StereonetModal.jsx", import.meta.url), "utf8").includes(key), "the same key as the Stereonet (already translated)");
});
