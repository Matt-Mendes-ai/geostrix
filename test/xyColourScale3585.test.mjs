// TASKS.csv #3585 (left over from #3577) — the X-Y scatter coloured by a field of the Y layer, and a log / linear switch per axis
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { colourFields, fieldColouring, FIELD_MAX_VALUES } from "../src/lib/geochemXYColour.js";
import { xyDiagram } from "../src/lib/geochemXY.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// a density layer: intervals with the method, the low-recovery flag, a year and a free-text comment (too many values)
const rows = [];
for (let h = 0; h < 4; h++) for (let k = 0; k < 5; k++) rows.push({ hole_id: `H${h}`, from: k * 2, to: k * 2 + 2, value: 2.7 + k * 0.1, method: k < 3 ? "Archimedes" : "Pycnometer", low_recovery: k === 4, year: 2015 + h, comment: `c${h}${k}`.repeat(1) + String(h * 5 + k) });
const layer = { id: "custom_d", name: "Density", rows, unit: "t/m3" };
const choice = { key: "custom:custom_d:value", label: "Density", symbol: "Density", unit: "t/m3", field: "value", layerId: "custom_d" };
const ctx = { layers: {}, customLayers: [layer] };

test("the fields worth colouring by: few distinct values; not the value, the depths, the hole id or a free-text column", () => {
  const f = colourFields(choice, ctx);
  assert.deepEqual(f.map((x) => x.field), ["method", "low_recovery", "year"]);
  assert.deepEqual(f.find((x) => x.field === "method").values, [{ value: "Archimedes", n: 12 }, { value: "Pycnometer", n: 8 }]);
  assert.deepEqual(f.find((x) => x.field === "low_recovery").values.map((v) => v.value), ["no", "yes"]);
  assert.ok(FIELD_MAX_VALUES >= 4 && f.every((x) => x.values.length <= FIELD_MAX_VALUES));
});

test("a sample takes the value of the field at its own interval and a colour per value; a sample with no interval is grey", () => {
  const c = fieldColouring(choice, "method", ctx);
  assert.deepEqual(c.values, ["Archimedes", "Pycnometer"]);
  const a = { hole_id: "H1", from: 0, to: 2 }, b = { hole_id: "H1", from: 6, to: 8 }, none = { hole_id: "H9", from: 0, to: 2 };
  assert.equal(c.at(a), "Archimedes");
  assert.equal(c.at(b), "Pycnometer");
  assert.equal(c.at(none), null);
  assert.notEqual(c.colourOf(a), c.colourOf(b));
  assert.equal(c.colourOf(none), "#b8bec7");
  assert.equal(fieldColouring(choice, "comment", ctx), null, "a free-text field is not offered");
});

test("log / linear per axis: auto keeps the rule, linear forces a decade-wide axis linear, log needs positive values", () => {
  const ax = { label: "Zn (%)", element: true, unit: "%", value: (s) => s.v }, ay = { label: "Pb (%)", element: true, unit: "%", value: (s) => s.w };
  const samples = [{ v: 0.01, w: 1 }, { v: 1, w: 2 }, { v: 5, w: 3 }, { v: 40, w: 4 }];
  assert.equal(xyDiagram(ax, ay, samples, {}).logX, true, "auto: a decade or more of positive values");
  assert.equal(xyDiagram(ax, ay, samples, {}, { scaleX: "linear" }).logX, false);
  assert.equal(xyDiagram(ax, ay, samples, {}).logY, false);
  const forced = xyDiagram(ax, ay, samples, {}, { scaleY: "log" });
  assert.equal(forced.logY, true);
  assert.ok(forced.yRange[0] > 0 && forced.yRange[1] > 4);
  const withZero = [{ v: 0, w: 1 }, { v: 3, w: 2 }];
  const d = xyDiagram(ax, ay, withZero, {}, { scaleX: "log" });
  assert.equal(d.logX, true);
  assert.equal(d.project(withZero[0], {}), null, "a zero is not on a log axis");
  assert.deepEqual(d.project(withZero[1], {}), { x: 3, y: 2 });
});
