// TASKS.csv #1699 (review #1645, Copley) — a classified numeric layer's legend shows its classes, not a min-max ramp
import test from "node:test";
import assert from "node:assert/strict";
import { numericLayerLegendGroups } from "../src/lib/legendGroups.js";

const rows = [-0.845, 0.05, 0.1, 0.2, 0.5, 1, 310].map((v, i) => ({ hole_id: "H", from: i, to: i + 1, value: v }));
const args = { keys: ["magsusc"], layers: { magsusc: rows }, layerVisible: { magsusc: true }, colorOf: () => "#888888" };

test("#1699 quantile classes (stepped) become swatches with their breaks; no symbology keeps the ramp", () => {
  const stops = [-0.845, 0.068, 0.163, 0.391, 0.797].map((value, i) => ({ value, color: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"][i] }));
  const [g] = numericLayerLegendGroups({ ...args, symbology: { magsusc: { stops, colorMode: "discrete" } } });
  assert.equal(g.ramp, undefined);
  assert.deepEqual(g.items.map((i) => i[0]), ["-0.845 – 0.068", "0.068 – 0.163", "0.163 – 0.391", "0.391 – 0.797", "≥ 0.797"]);
  assert.equal(g.items[4][1], "#fde725");
  const [plain] = numericLayerLegendGroups(args);
  assert.equal(plain.ramp.kind, "ramp");
  assert.deepEqual([plain.ramp.minLabel, plain.ramp.maxLabel], ["-0.845", "310"]);
});
