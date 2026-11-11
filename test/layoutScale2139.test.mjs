// TASKS.csv #2139 — {scale} prefers a top-down fixed-scale map over an oblique fixed-scale view, and an empty placeholder takes its
// separator with it; #2484 — 'Coordinate grid', and the Fit lands on the Scale list's own steps
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pageScaleText } from "../src/lib/layoutGeometry.js";
import { fillPlaceholders } from "../src/lib/layoutText.js";

const oblique = { id: "v1", type: "viewport", src: "x", planView: false, trueScale: true, capturedFixedScale: 500000, w: 300, h: 200, worldHeightAtTarget: 1000 };
const plan = { id: "v2", type: "viewport", src: "x", planView: true, trueScale: true, capturedFixedScale: 50000, w: 600, h: 400, worldHeightAtTarget: 5000 };

test("#2139 — the plan's 1:50,000 names the page, not the oblique 1:500,000 placed before it", () => {
  assert.equal(pageScaleText([oblique, plan]), "1 : 50,000");
  assert.match(pageScaleText([oblique]), /^1 : 500,000/); // alone, the oblique view still gives its view-plane ratio
});

test("#2139 — an empty placeholder takes a separator with it", () => {
  const RE = /\{(project|date|scale|crs)\}/g;
  assert.equal(fillPlaceholders("{date} · {scale} · {crs}", { date: "2026-11-08", scale: "", crs: "NAD83 / UTM zone 10N" }, RE), "2026-11-08 · NAD83 / UTM zone 10N");
  assert.equal(fillPlaceholders("{scale} | {crs}", { scale: "", crs: "EPSG:28351" }, RE), "EPSG:28351");
  assert.equal(fillPlaceholders("Scale {scale}", { scale: "1 : 5,000" }, RE), "Scale 1 : 5,000");
  assert.equal(fillPlaceholders("{date} - {project}", { date: "2026-11-08", project: "x-y" }, RE), "2026-11-08 - x-y"); // nothing empty: untouched
  assert.equal(fillPlaceholders("{unknown}", { scale: "" }, RE), "{unknown}");
});

test("#2484 — the grid control's wording and the Fit's steps", () => {
  const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(L, /tr\("UTM grid \(labelled\)"\)/);
  assert.match(L, /tr\("A coordinate grid needs a top-down, true-scale capture\."\)/);
  const presets = JSON.parse(L.match(/const SCALE_PRESETS = (\[[^\]]*\]);/)[1]);
  for (const s of [1500, 15000, 150000]) assert.ok(presets.includes(s), String(s));
  // every scale the Fit can return (1, 1.5, 2, 2.5, 5 x 10^n) between 500 and 1,000,000 is on the list
  assert.match(L, /return \[1, 1\.5, 2, 2\.5, 5, 10\]\.map\(\(m\) => Math\.round\(m \* mg\)\)/);
  for (let mg = 100; mg <= 100000; mg *= 10) for (const m of [1, 1.5, 2, 2.5, 5, 10]) { const n = Math.round(m * mg); if (n >= 500 && n <= 1000000) assert.ok(presets.includes(n), String(n)); }
});
