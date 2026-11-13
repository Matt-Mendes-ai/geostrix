// TASKS.csv #1587 (review #1497, Lawyers) — with several point surveys loaded, each survey's own legend (stops, mode, range,
// edited on the Point survey pane and kept in geophysSurveys[key].legend) drives the 3D colours; unedited surveys keep
// their 2-98 % range
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeSurveyColorer } from "../src/lib/geophysSurveys.js";

const rows = [
  ...Array.from({ length: 50 }, (_, i) => ({ _src: "mag.xyz", x: i, y: 0, value: 56000 + i * 10 })),
  ...Array.from({ length: 50 }, (_, i) => ({ _src: "vlf.xyz", x: i, y: 1, value: -50 + i * 2 })),
];

test("an edited survey's range is used for that survey only; the other keeps its own 2-98 %", () => {
  const plain = makeSurveyColorer(rows, {});
  assert.equal(plain.perSurvey, true);
  const edited = makeSurveyColorer(rows, {}, { "mag.xyz": { units: "nT", legend: { min: 56000, max: 56100 } } });
  const magHigh = rows[49]; // 56,490: above the edited max
  assert.equal(edited.colorOf(magHigh).t, 1);
  assert.ok(plain.colorOf(magHigh).t >= 0.95 && plain.colorOf(magHigh).t <= 1);
  const magMid = rows[5]; // 56,050: the middle of the edited range, the bottom of the plain one
  assert.ok(Math.abs(edited.colorOf(magMid).t - 0.5) < 0.01, String(edited.colorOf(magMid).t));
  assert.ok(plain.colorOf(magMid).t < 0.15, String(plain.colorOf(magMid).t));
  // the VLF survey is untouched by the mag legend
  assert.equal(edited.colorOf(rows[99]).color, plain.colorOf(rows[99]).color);
  assert.equal(edited.models.get("mag.xyz").edited, true);
  assert.equal(edited.models.get("vlf.xyz").edited, undefined);
});

test("stops and a classed mode on one survey change its colours, not the other's", () => {
  const stops = [{ t: 0, color: "#000000" }, { t: 1, color: "#ffffff" }];
  const c = makeSurveyColorer(rows, {}, { "vlf.xyz": { legend: { stops, colorMode: "continuous" } } });
  const plain = makeSurveyColorer(rows, {});
  assert.notEqual(c.colorOf(rows[60]).color, plain.colorOf(rows[60]).color);
  assert.equal(c.colorOf(rows[10]).color, plain.colorOf(rows[10]).color);
});

test("one survey: its own legend wins over the global fields, which still apply without one", () => {
  const one = rows.slice(0, 50);
  const g = makeSurveyColorer(one, { min: 56000, max: 56100 });
  assert.equal(g.perSurvey, false);
  assert.equal(g.colorOf(one[49]).t, 1);
  const own = makeSurveyColorer(one, { min: 56000, max: 56100 }, { "mag.xyz": { legend: { min: 56000, max: 57000 } } });
  assert.ok(Math.abs(own.colorOf(one[49]).t - 0.49) < 0.01, String(own.colorOf(one[49]).t));
});

test("the pane edits one survey's legend when several are loaded; the 3D View and sections pass the surveys", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /aria-label=\{tr\("Survey whose legend to edit"\)\}/);
  assert.match(g, /updateGeophysSurvey\(legendKey, \{ legend: \{ \.\.\.\(geophysSurveys\[legendKey\]\?\.legend \|\| \{\}\), \.\.\.patch \} \}\)/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.equal((v.match(/max: geophysPtsMax \}, geophysSurveys\)/g) || []).length, 1); // the points' build; the legend's moved to lib/legendGroups.js (#2878)
  assert.match(v, /geophysLegendGroups\(\{ rows: layers\?\.geophys_pts, visible: !!layerVisible\.geophys_pts, surveys: geophysSurveys,/);
  assert.match(readFileSync(new URL("../src/lib/legendGroups.js", import.meta.url), "utf8"), /makeSurveyColorer\(pts, \{ stops, colorMode, min, max \}, surveys\)/);
  assert.match(v, /surveys: geophysSurveys \/\* #1587 \*\//);
  assert.match(readFileSync(new URL("../src/lib/sectionScatter.js", import.meta.url), "utf8"), /geophysStyle\.surveys \|\| null/);
});
