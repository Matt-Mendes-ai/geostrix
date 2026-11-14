// TASKS.csv #3325 — on the Geophysics tab the survey's own colour key leads the 3D legend, and each survey can be hidden from its card
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { geophysLegendGroups } from "../src/lib/legendGroups.js";

const pts = [];
for (let i = 0; i < 50; i++) pts.push({ x: i, y: 0, z: 100, value: 1 + i, _src: "IP.xyz" }, { x: i, y: 0, z: 100, value: 10 * (1 + i), _src: "Resistivity.xyz" });

test("#3325 a hidden survey has no ramp; the other keeps its own", () => {
  const both = geophysLegendGroups({ rows: pts, surveys: { "IP.xyz": { units: "mV/V" }, "Resistivity.xyz": { units: "Ω·m" } } });
  assert.deepEqual(both.map((g) => g.key), ["geophys_pts_IP.xyz", "geophys_pts_Resistivity.xyz"]);
  const one = geophysLegendGroups({ rows: pts, surveys: { "IP.xyz": { units: "mV/V", hidden: true }, "Resistivity.xyz": { units: "Ω·m" } } });
  assert.deepEqual(one.map((g) => g.key), ["geophys_pts_Resistivity.xyz"]);
  assert.match(one[0].label, /^Resistivity\.xyz \(Ω·m\)$/); // still named by its survey: the colours do not change when the other is hidden
  assert.deepEqual(one[0].ramp, both[1].ramp);
});

test("#3325 the 3D build keeps a hidden survey's batch and does not draw it; pick and Fit follow its visibility", () => {
  const g = readFileSync(new URL("../src/lib/viewer/geophysPts.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /for \(const \[k, entry\] of cache\) \{ const show = !surveys\?\.\[k\]\?\.hidden; for \(const b of entry\.batches\) b\.visible = show; \}/);
  const lb = readFileSync(new URL("../src/lib/viewer/layerBatches.js", import.meta.url), "utf8");
  assert.match(lb, /if \(c\.userData\?\.compact\) \{ if \(c\.visible !== false\) fn\(c\); continue; \}/); // eachPickTarget (#3144)
  assert.match(lb, /c\.visible === false \? "h" : ""/); // batchTag: the pick index is rebuilt
  const fit = readFileSync(new URL("../src/lib/viewer/fitAll.js", import.meta.url), "utf8");
  assert.match(fit, /if \(!o\.visible/); // visibleSceneBox
});

test("#3325 beside the Geophysics sidebar the survey ramps lead the legend; a card has its eye", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(v, /if \(bare\) groups\.unshift\(\.\.\.geo\); else groups\.push\(\.\.\.geo\);/);
  assert.match(v, /\}, \[mode \/\* #3046 \*\/, bare \/\* #3325 \*\/,/);
  const m = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /onClick=\{\(\) => updateGeophysSurvey\(sv\.key, \{ hidden: !meta\.hidden \}\)\}/);
  assert.match(m, /aria-pressed=\{!meta\.hidden\}/);
});
