// TASKS.csv #1697 — custom layers coloured by a chosen field, empty readings grey, a legend group per layer
import { test } from "node:test";
import assert from "node:assert/strict";
import { customColour, customLegendGroups, customFields, NO_VALUE_COLOUR } from "../src/lib/customColour.js";
import { cleanLayerStyle } from "../src/lib/layerStyle.js";
import { hashColor, magColor } from "../src/lib/layers.js";

const L = { id: "ai", name: "Copley_2023_DH_SWIR_aiSIRIS", rows: [
  { hole_id: "H", depth: 10, value: "Mu", ai_Wav_WtMica: 2200 },
  { hole_id: "H", depth: 20, value: null, ai_Wav_WtMica: 2210 },
  { hole_id: "H", depth: 30, value: "Kao", ai_Wav_WtMica: "" },
  { hole_id: "H", depth: 40, value: "Mu", ai_Wav_WtMica: 2205 },
] };

test("by the value column: categories, empty readings grey (not a 'null' class)", () => {
  assert.equal(customColour(L, {}, L.rows[0]), hashColor("Mu"));
  assert.equal(customColour(L, {}, L.rows[1]), NO_VALUE_COLOUR);
});
test("by a numeric field: a viridis ramp over its range; empty is grey", () => {
  const st = { "custom:ai": { colourBy: "ai_Wav_WtMica" } };
  assert.equal(customColour(L, st, L.rows[0]), magColor(2200, 2200, 2210));
  assert.equal(customColour(L, st, L.rows[1]), magColor(2210, 2200, 2210));
  assert.equal(customColour(L, st, L.rows[2]), NO_VALUE_COLOUR);
});
test("legend groups: categories with 'no value', or a ramp; hidden layers left out", () => {
  const g = customLegendGroups([L], {}, {});
  assert.deepEqual(g[0].items.map((i) => i[0]), ["Mu", "Kao", "no value"]);
  const r = customLegendGroups([L], {}, { "custom:ai": { colourBy: "ai_Wav_WtMica" } });
  assert.equal(r[0].label, "Copley_2023_DH_SWIR_aiSIRIS · ai_Wav_WtMica"); assert.equal(r[0].ramp.min, 2200); assert.equal(r[0].ramp.max, 2210);
  assert.deepEqual(customLegendGroups([L], { ai: false }, {}), []);
});
test("fields offered and the choice saved with the style", () => {
  assert.deepEqual(customFields(L), ["value", "ai_Wav_WtMica"]);
  assert.deepEqual(cleanLayerStyle({ colourBy: "ai_Wav_WtMica" }, "point"), { colourBy: "ai_Wav_WtMica" });
  assert.equal(cleanLayerStyle({ colourBy: "value" }, "point"), null);
});
