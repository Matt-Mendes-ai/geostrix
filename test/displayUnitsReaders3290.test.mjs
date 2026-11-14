// TASKS.csv #3236 / #3290 — Thresholds and the X-Y scatter read the project's display unit (display only); Compositing does not yet. Source checks (.jsx).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { displayUnitOf, displayFactor, toDisplay } from "../src/lib/displayUnits.js";
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the factor the axis labels use: ppm stored, % shown", () => {
  const project = { displayUnits: { Cu: "%" } };
  const shown = displayUnitOf(project, "Cu", "ppm"), k = displayFactor("ppm", shown);
  assert.equal(shown, "%"); assert.ok(Math.abs(k - 1e-4) < 1e-12); assert.equal(toDisplay(7900, "ppm", "%"), 0.79);
  assert.equal(displayUnitOf(project, "Au", "ppm"), "ppm");
});
test("Thresholds: table, notes and axis labels in the shown unit; the select writes project.displayUnits", () => {
  const s = rd("../src/components/ThresholdToolkit.jsx");
  assert.ok(s.includes("{fmt(sh(p.cand.values[m.id]))}</td>"));
  assert.ok(s.includes("method={method} unit={dispUnit} k={dk} log={logOn} />"));
  assert.equal((s.match(/\{fmt\(ax\.inv\(d\) \* k\)\}<\/text>/g) || []).length, 2);
  assert.ok(s.includes("setDisplayUnit(symbol, e.target.value || null)"));
  assert.ok(s.includes("floor: formatLimit(sh(floor.floor)), unit: dispUnit"));
});
test("X-Y: an element axis is built in the display unit and the memos follow a change", () => {
  const g = rd("../src/modules/GeochemModule.jsx");
  assert.ok(g.includes('unit: displayUnitOf(store.project, e.symbol, e.unit) /* #3236 / #3290'));
  assert.equal((g.match(/store\.customLayers, store\.project\?\.displayUnits\]/g) || []).length, 3);
});
