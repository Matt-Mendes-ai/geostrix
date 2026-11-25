// TASKS.csv #3772 (hole labels at the toe: the two options), #3774 (the drawn radius of a surface sample is capped), #3775 (2) (a hover tip does not
// outlive a camera move) and (4) (a cluster button clears the Holes filter box), #3779 (1) (notice volumes to three figures, as the card prints them):
// the small ViewerModule edits Main granted for them (a few hundred bytes; the file's LF size is kept under test/viewerModuleSize1084.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cappedRadiusM, minSymbolRadiusM } from "../src/lib/viewer/symbolScale.js";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs"; // TASKS.csv #4070 — the panes in their own files

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const vm = read("../src/modules/ViewerModule.jsx");

test("#3774 a sample symbol is never more than twice its readable minimum, never under it", () => {
  const minR = minSymbolRadiusM(0.5, 6); // a pad: 50 m across 100 px -> 0.5 m a pixel: minimum radius 1.5 m
  assert.equal(minR, 1.5);
  assert.equal(cappedRadiusM(11, minR), 3); // the 22 m rock-chip sphere of the review: 6 m across at that zoom
  assert.equal(cappedRadiusM(1, minR), 1.5); // under the minimum: the minimum (as before)
  assert.equal(cappedRadiusM(2, minR), 2); // between: as sized
  assert.equal(cappedRadiusM(11, 0), 11); // no zoom known: as before
  assert.equal(cappedRadiusM(11, NaN), 11);
  assert.match(vm, /mesh\.scale\.setScalar\(cappedRadiusM\(radiusOf\(row\.medium\), minR\) \* st\.size/);
});

test("#3772 the Hole labels select offers the toe and both ends", () => {
  assert.match(vm, /<option value="hole_id_toe">\{tr\("Hole ID at the toe"\)\}<\/option><option value="hole_id_both">\{tr\("Hole ID at both ends"\)\}<\/option>/);
  for (const k of ["Hole ID at the toe", "Hole ID at both ends"]) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k}`);
});

test("#3775 (2) the hover tip is cleared when the camera moves; (4) the cluster button clears the filter box", () => {
  assert.match(vm, /if \(sig !== tipSigRef\.current\) \{ tipSigRef\.current = sig; setTooltip\(null\); \}/);
  assert.match(vm, /<ModellingPanes \{\.\.\.\{ setStackUnits, visibleHoles, setVisibleHoles, setHoleFilter,/);
  assert.match(modellingPanesSource(), /setModelArea\("checked"\); setHoleFilter\?\.\(""\); \}\}/);
});

test("#3779 (1) the volumes in the notices are rounded as the surface card rounds them (three figures)", () => {
  assert.equal((vm.match(/v: Number\(w\.volume\.toPrecision\(3\)\)\.toLocaleString\(\)/g) || []).length, 2);
  assert.doesNotMatch(vm, /Math\.round\(w\.volume\)\.toLocaleString\(\)/);
  assert.equal(Number((24550862).toPrecision(3)).toLocaleString("en-US"), "24,600,000"); // the card's 'Volume: 24,600,000 m³'
});
