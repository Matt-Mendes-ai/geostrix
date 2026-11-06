// TASKS.csv #1710 (review #1645, Copley) — a drill-only project can forward-model a planned station grid (survey design), and
// the Inversion pane's empty state says what it can do
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultPlannedExtent, generatePlannedStations, DEFAULT_PLANNED } from "../src/lib/plannedGrid.js";

test("the default extent is the collars' box, padded", () => {
  const collars = [{ x: 380500, y: 5954500, z: 800 }, { x: 382500, y: 5956300, z: 900 }, { x: 381000, y: 5955000, z: 850 }];
  assert.deepEqual(defaultPlannedExtent(collars), { xmin: 380000, ymin: 5954000, xmax: 383000, ymax: 5956800 }); // 25 % of the 2,000 m side
  assert.deepEqual(defaultPlannedExtent([{ x: 0, y: 0 }, { x: 100, y: 100 }]), { xmin: -200, ymin: -200, xmax: 300, ymax: 300 }); // at least 200 m
  assert.equal(defaultPlannedExtent([{ x: 1, y: 1 }]), null);
});

test("stations on lines: spacing, direction, sensor height over the ground, a cap", () => {
  const g = generatePlannedStations({ xmin: 0, ymin: 0, xmax: 200, ymax: 100, line: 100, station: 25, dir: "NS", height: 2 }, (x, y) => 1000 + x * 0.01);
  assert.deepEqual([g.stats.lines, g.stats.perLine, g.stats.n, g.stats.capped], [3, 5, 15, false]);
  assert.deepEqual(g.rows[0], { x: 0, y: 0, z: 1002, value: 0, _src: "Planned grid", line: "L0E", label: "0" });
  assert.equal(g.rows[14].x, 200); assert.equal(g.rows[14].y, 100); assert.ok(Math.abs(g.rows[14].z - 1004) < 1e-9);
  const ew = generatePlannedStations({ xmin: 0, ymin: 0, xmax: 200, ymax: 100, line: 50, station: 50, dir: "EW" }, () => NaN);
  assert.deepEqual([ew.stats.lines, ew.stats.perLine, ew.rows[0].z, ew.rows[0].line], [3, 5, DEFAULT_PLANNED.height, "L0N"]); // unknown ground: height above 0
  const capped = generatePlannedStations({ xmin: 0, ymin: 0, xmax: 1000, ymax: 1000, line: 10, station: 10 }, () => 0, { cap: 500 });
  assert.deepEqual([capped.rows.length, capped.stats.capped], [500, true]);
  assert.deepEqual(generatePlannedStations({ xmin: 5, ymin: 0, xmax: 5, ymax: 10 }).rows, []);
});

test("the pane: the empty state lists what a survey allows, the planned grid stands in for a survey, the result says the predicted range", () => {
  const p = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const rows = planned\.on \? plannedGrid\.rows : surveyRows;/);
  assert.match(p, /const zModeEff = planned\.on \? "sensor" : zMode;/);
  assert.match(p, /if \(!confirmed && !planned\.on\) problems\.push/);
  assert.match(p, /A planned grid has no measured values to invert: untick it, or import a survey\./);
  assert.match(p, /No survey loaded\. With a magnetic or gravity survey/);
  assert.match(p, /constrain that inversion with the \{ms\} mag-susc and \{sg\} SG log readings in the drillholes;/);
  assert.match(p, /tr\("Forward model on a planned grid"\)/);
  assert.match(p, /Planned grid, no observed values: the predicted anomaly over the \{n\} stations runs from \{lo\} to \{hi\} \{unit\}/);
  assert.match(p, /Add the predicted anomaly as a survey/);
  assert.equal((p.match(/plannedGrid: planned\.on \? plannedGrid\.stats : null/g) || []).length, 2);
});
