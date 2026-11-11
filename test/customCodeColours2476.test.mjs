// TASKS.csv #2476 — a custom layer's codes were coloured by a hash that put codes one character apart one degree of hue apart (E1 / E2 / E3
// at hues 260 / 261 / 262: twelve stratigraphic units in about five colours). They now take the colour-blind-safe palette in sorted order.
import test from "node:test";
import assert from "node:assert/strict";
import { customColour, customCodeColour, customLegendGroups } from "../src/lib/customColour.js";
import { CATEGORICAL_SAFE_COLORS } from "../src/lib/layers.js";

const codes = ["E3", "E2", "E1", "H", "I", "G2", "G1", "F2", "F1", "QA", "Dcbs", "DWS"];
const L = { id: "su", name: "Strat unit", rows: codes.map((v, i) => ({ hole_id: "A", from: i, to: i + 1, value: v })) };

test("twelve units get twelve different palette colours, in their sorted order", () => {
  const cols = codes.map((c) => customColour(L, {}, { value: c }));
  assert.equal(new Set(cols).size, 12);
  assert.ok(cols.every((c) => CATEGORICAL_SAFE_COLORS.includes(c)));
  assert.equal(customCodeColour(L, "value", "Dcbs"), CATEGORICAL_SAFE_COLORS[0], "Dcbs sorts first");
  assert.equal(customCodeColour(L, "value", "E1"), CATEGORICAL_SAFE_COLORS[2]);
  assert.equal(customCodeColour(L, "value", "E2"), CATEGORICAL_SAFE_COLORS[3]);
});

test("the legend uses the same colours as the holes", () => {
  const g = customLegendGroups([L], {}, {})[0];
  for (const [code, colour] of g.items) assert.equal(colour, customColour(L, {}, { value: code }), code);
});
