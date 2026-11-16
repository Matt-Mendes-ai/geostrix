// TASKS.csv #3448 (#3442 (10)) — a unit box for the built-in logs (Mag. susc., SG, RQD...), kept in project.logValidRange[key].unit beside the range: the numeric-source choice
// carries it (it beats the guess), and the pane has the box. SYNTHETIC readings.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { numericSourceChoices } from "../src/lib/numericSources.js";
const layers = { magsusc: Array.from({ length: 12 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1, value: 20 + i })), sg: Array.from({ length: 12 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1, value: 2.6 + i / 100 })) };
const choice = (k, v) => numericSourceChoices({ layers, customLayers: [], logValidRange: v }).find((c) => c.key === `log:${k}`);
test("the stated unit wins over the guess; without it the guess and the default stand", () => {
  assert.equal(choice("magsusc", null).unit, "as logged", "readings of 20-31 cannot be SI");
  assert.equal(choice("magsusc", { magsusc: { unit: "x10-3 SI" } }).unit, "x10-3 SI");
  assert.equal(choice("sg", null).unit, "t/m³"); assert.equal(choice("sg", { sg: { unit: "t/m3" } }).unit, "t/m3");
  assert.equal(choice("sg", { sg: { unit: "  " } }).unit, "t/m³", "a blank unit is none");
  assert.equal(choice("sg", { sg: { unit: "t/m3", range: [1, 5] } }).validRange[0], 1, "the range beside it still applies");
});
test("wired: the setter keeps an entry that has only a unit; the pane has the box", () => {
  const s = fs.readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("entry.range || entry.despikeM > 0 || entry.unit"));
  const p = fs.readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("{builtinKey && <LogUnitField layer={{ id: builtinKey, name: source?.label, unit: logValidRange?.[builtinKey]?.unit }}"));
});
