// TASKS.csv #2953 (review #2876, WA iron) — Downhole logs had no range, clip or outlier rule: one bin of -821,754.9 flattened the
// susceptibility box plot, gamma ran to 49,900 on a linear axis, and nothing counted the implausible readings.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceAssays } from "../src/lib/numericSources.js";
import { implausibleReadings } from "../src/lib/logUnits.js";

const rows = [0.001, 0.002, -821754.9, 0.003, 77100, 0.004].map((v, i) => ({ hole_id: "A", from: i, to: i + 1, value: v }));
const choice = { key: "custom:3:value", layerId: 3, field: "value", symbol: "S", unit: "SI" };

test("a valid range stored on the layer leaves the readings outside it out of every reader, and counts them", () => {
  const plain = sourceAssays(choice, { customLayers: [{ id: 3, name: "Suscep_Best", rows }] });
  assert.equal(plain.assays.length, 6);
  assert.equal(plain.outOfRange, undefined, "no range: nothing said");
  const r = sourceAssays(choice, { customLayers: [{ id: 3, name: "Suscep_Best", rows, validRange: [0, 10] }] });
  assert.deepEqual(r.assays.map((a) => a.values.S), [0.001, 0.002, 0.003, 0.004]);
  assert.equal(r.outOfRange, 2);
  assert.deepEqual(r.validRange, [0, 10]);
  const open = sourceAssays(choice, { customLayers: [{ id: 3, name: "Suscep_Best", rows, validRange: [null, 10] }] });
  assert.equal(open.outOfRange, 1, "a blank end is open");
  // only the value channel: a binned layer's min / max fields are read as they are
  assert.equal(sourceAssays({ ...choice, field: "value", layerKey: undefined }, { customLayers: [{ id: 3, rows, validRange: [0, 10] }] }).outOfRange, 2);
  assert.equal(sourceAssays({ ...choice, field: "max" }, { customLayers: [{ id: 3, rows: rows.map((r) => ({ ...r, max: r.value })), validRange: [0, 10] }] }).outOfRange, undefined);
});

test("readings no rock can give in a stated unit are counted (a check, never removed by it)", () => {
  assert.deepEqual(implausibleReadings([2.6, 3.1, 0, 5.25, -1.47, 4.9], "g/cc"), { n: 3, rule: "density", lo: 1, hi: 5, unit: "g/cc" });
  assert.equal(implausibleReadings([2600, 900], "kg/m³").n, 1);
  assert.equal(implausibleReadings([40, -3, 49900], "cps").n, 1, "gamma: only below 0");
  assert.equal(implausibleReadings([-0.5, 2], "SI"), null, "a susceptibility can be slightly negative: no rule");
  assert.equal(implausibleReadings([2.6], ""), null, "no unit, no rule");
});

test("the pane: whiskers at P2-P98 with the count beyond them, the valid range on the layer, the notes", () => {
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(p, /const lo = quantileSorted\(s, 0\.02\), hi = quantileSorted\(s, 0\.98\);/);
  assert.match(p, /return \{ \.\.\.g, stats: \{ \.\.\.g\.stats, min: lo, max: hi \} \};/);
  assert.match(p, /<BoxPlots fit groups=\{boxes\.groups\}/);
  assert.match(p, /tr\("Whiskers run from P2 to P98 of each code, so a stray reading cannot squash the plot; \{k\} reading\(s\) lie beyond them\."/);
  assert.match(p, /setCustomLayers\(\(p\) => p\.map\(\(c\) => \(c\.id === logLayer\.id \? \{ \.\.\.c, validRange: r \} : c\)\)\)/);
  assert.match(p, /data\?\.outOfRange > 0 &&/);
  assert.match(p, /\{logScale && !vsLogX && <div style=\{note\}>\{tr\("The scatter keeps a linear axis for the log: \{n\} of its readings are zero or negative\."/);
  assert.doesNotMatch(p, /\buseState\(/, "#2394");
  // the first live run crashed the tab ("Cannot access 'T' before initialization"): the memo ran unitOf before its const was reached
  assert.ok(p.indexOf("const unitOf = ") < p.indexOf("implausibleReadings(logValues, unitOf("), "unitOf is declared before the memo calls it");
});
