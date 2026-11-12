// TASKS.csv #2055 (review #2013, Woodjam) — 97 orientations rested on a bottom-of-hole beta reference chosen at import (the sheet has no
// reference column), and the Stereonet, Structures pane and Downhole plot never said so; a top-of-hole reference moved one pick 37°.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { betaReferenceCounts } from "../src/lib/coreOrientation.js";

test("the picks oriented from alpha / beta, by reference line", () => {
  const picks = [
    { dip: 60, azimuth: 120, abRef: "bottom" }, { dip: 40, azimuth: 10, abRef: "bottom" }, { dip: 30, azimuth: 200, abRef: "top" },
    { dip: 50, azimuth: 90 }, // measured dip / dip direction: no reference
    { dip: null, azimuth: null, abRef: "bottom" }, // alpha only, not oriented
  ];
  assert.deepEqual(betaReferenceCounts(picks), { top: 1, bottom: 2 });
  assert.deepEqual(betaReferenceCounts([]), { top: 0, bottom: 0 });
});

test("the Stereonet and the Structures pane say it", () => {
  const s = readFileSync(new URL("../src/components/StereonetModal.jsx", import.meta.url), "utf8");
  assert.match(s, /const betaRefs = useMemo\(\(\) => betaReferenceCounts\(picks\), \[picks\]\);/);
  assert.ok(s.indexOf("const picks = useMemo") < s.indexOf("const betaRefs = useMemo"), "picks is declared first");
  assert.match(s, /\(betaRefs\.top \+ betaRefs\.bottom\) > 0 && <div role="note"/);
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /const b = betaReferenceCounts\(layers\.structure \|\| \[\]\); return b\.top \+ b\.bottom > 0/);
  assert.match(p, /with beta measured from the \{ref\}-of-hole line, as chosen when they were imported/);
});
