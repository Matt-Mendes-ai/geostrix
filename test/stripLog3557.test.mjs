// TASKS.csv #3557 / #3558 / #3559 (Fireweed rehearsal) — the strip log: no empty Litho column on a project with no lithology and a plain line for an unsampled hole; the density track
// with its unit, a scale from the data's low end and its calculated values told apart; a 1,000 m hole that fits (Fit, the sampled stretch, a scale down to 0.05 px/m, a resizable dialog).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isCalculatedMethod, densityLo, fitPxPerMetre, openRange, FIT_MIN_PX, FIT_MAX_PX } from "../src/lib/stripDensity.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const loc = (lang) => JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
const src = read("../src/components/StripLog.jsx");

test("#3557 the Litho track is drawn when the project (or the hole) has lithology; an unlogged project draws none", () => {
  assert.match(src, /\.\.\.\(litho\.length \|\| \(layers\.litho \|\| \[\]\)\.length \? \[\{ key: "litho", label: "Litho"/);
});

test("#3557 a hole with nothing to draw: one plain line at the top, in place of the empty tracks", () => {
  assert.match(src, /const noData = allTracks\.every\(\(t\) => t\.rows\.length === 0\);/);
  assert.match(src, /\{noData && <div [^\n]*tr\("\{holeId\} has no samples and no logs \(\{length\} m\)\.", \{ holeId, length: \+maxDepth\.toFixed\(1\) \}\)/);
  assert.match(src, /\{!noData && <svg ref=\{svgRef\}/);
  assert.doesNotMatch(src, /import litho\/alt\/vein\/geotech\/assay data with matching hole_id/);
});

test("#3558 the density track: 'Density (t/m³)', a scale from a little below the data's low end, calculated values paler and dashed, the unit and method in the tip", () => {
  assert.match(src, /\["sg", "Density \(t\/m³\)"\]/);
  assert.match(src, /lo: densityLo\(rows\.map\(\(r\) => r\.value\)\)[^\n]*unit: LAYER_META\.sg\.unit, methodOf:/);
  assert.match(src, /opacity=\{calc \? 0\.3 : 0\.75\} stroke=\{calc \? "#4a9be0" : undefined\} strokeDasharray=\{calc \? "2 1\.5" : undefined\}/);
  assert.match(src, /\$\{t\.unit \? ` \$\{t\.unit\}` : ""\}\$\{meth \? ` \(\$\{meth\}\$\{calc \? tr\(": calculated, not measured"\) : ""\}\)` : ""\}/);
  // the scale also under the header
  assert.match(src, /y=\{PAD_TOP - 3\} fontSize="7" textAnchor="middle" fill="#65717e">\{barCaption\(t\)\}/);
  // the Macpass densities (1.92 to 4.839 on NB23-019): the scale starts at 1.6, not 0
  assert.equal(densityLo([1.92, 2.6, 3.4, 4.839]), 1.6);
  assert.equal(densityLo([2.5, 2.5]), null, "one value: no spread, the plain scale");
  assert.equal(densityLo([]), null);
  assert.equal(densityLo([0.05, 3]), 0, "never below 0");
  for (const m of ["REG", "reg", "Regressed", "CALC", "Estimated", "ASSUMED", "default"]) assert.equal(isCalculatedMethod(m), true, m);
  for (const m of ["MEAS", "LAB-SPG04", "Archimedes", "", null, undefined, 5]) assert.equal(isCalculatedMethod(m), false, String(m));
});

test("#3559 fit: px per metre so a hole fits the pane; the box goes down to 0.05; the longest hole here fits", () => {
  assert.equal(FIT_MIN_PX, 0.05); assert.equal(FIT_MAX_PX, 40);
  assert.equal(fitPxPerMetre(1042.72, 613), 0.48, "JS81-069 in a 613 px pane: about half a pixel a metre");
  assert.equal(fitPxPerMetre(50, 613), 10.06);
  assert.equal(fitPxPerMetre(0, 613), 6); assert.equal(fitPxPerMetre(100000, 613), FIT_MIN_PX); assert.equal(fitPxPerMetre(1, 5000), FIT_MAX_PX);
  const px = fitPxPerMetre(1042.72, 613);
  assert.ok(px * 1042.72 + 110 <= 613 + 1, `${px * 1042.72} px`);
});

test("#3559 a long hole opens on its sampled stretch when that is a small part of it; a short hole, or one sampled throughout, as before / whole", () => {
  assert.equal(openRange(60, 10, 20, 613), null, "60 m fits at 6 px/m");
  assert.deepEqual(openRange(1042.72, 854.5, 1040, 613), { from: 823, to: 1043 }, "JS81-069: 19 samples from 854.5 m: opens on them, not on ten screens of empty tracks");
  assert.deepEqual(openRange(1042.72, 854.5, 900, 613), { from: 823, to: 932 });
  assert.equal(openRange(1000, 100, 900, 613), null, "sampled over 80 % of it: the whole hole");
  assert.equal(openRange(1000, NaN, 900, 613), null);
});

test("#3559 wired: Fit, Sampled and Whole hole buttons, the log opens fitted once, the scale box goes below 1, the dialog resizes", () => {
  assert.match(src, /const fit = \(\) => setPxPerMeter\(fitPxPerMetre\(d1 - d0, paneH\(\)\)\);/);
  assert.match(src, /useLayoutEffect\(\(\) => \{ \/\/ once, when the pane has its height/);
  assert.match(src, /<input type="number" min=\{FIT_MIN_PX\} max=\{FIT_MAX_PX\} step="any" value=\{pxPerMeter\}|<NumberInput min=\{FIT_MIN_PX\} max=\{FIT_MAX_PX\} value=\{pxPerMeter\}/ /* #3926: a NumberInput, the same limits */);
  assert.match(src, /onClick=\{fit\}[^\n]*\{tr\("Fit"\)\}/); assert.match(src, /\{tr\("Sampled"\)\}/); assert.match(src, /\{ranged && <button type="button" onClick=\{wholeHole\}/);
  assert.match(src, /minWidth: 480, minHeight: 360, maxWidth: "98vw", maxHeight: "98vh", resize: "both"/);
  assert.match(src, /<div ref=\{scrollRef\} style=\{\{ flex: 1, overflow: "auto", padding: 16 \}\}>/);
});

test("the new words are in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = loc(lang); for (const k of ["{holeId} has no samples and no logs ({length} m).", ": calculated, not measured", "Fit", "Sampled", "Whole hole", "Draw the whole hole, fitted"]) assert.ok(d[k], `${lang}: ${k}`); }
});
