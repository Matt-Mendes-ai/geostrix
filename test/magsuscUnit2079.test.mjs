// TASKS.csv #2079 — Downhole logs labelled the Woodjam mag-susc log 'Mag. susc. (SI)' with values 0.055-181 (KT-class readings in 10^-3 SI;
// 181 SI is more than pure magnetite). The log's unit is SI only when its readings can be SI; otherwise 'as logged'.
import test from "node:test";
import assert from "node:assert/strict";
import { numericSourceChoices, CUSTOM_UNIT } from "../src/lib/numericSources.js";

const rows = (vals) => vals.map((v, i) => ({ hole_id: "H1", depth: i + 1, value: v }));

test("KT-style readings are 'as logged'; true SI readings stay SI", () => {
  const kt = numericSourceChoices({ layers: { magsusc: rows([0.055, 5.82, 20.7, 181, 9.25]) }, customLayers: [] });
  assert.equal(kt[0].unit, CUSTOM_UNIT);
  const si = numericSourceChoices({ layers: { magsusc: rows([0.0002, 0.0011, 0.004, 0.0009]) }, customLayers: [] });
  assert.equal(si[0].unit, "SI");
  const sg = numericSourceChoices({ layers: { sg: rows([2.62, 2.65, 2.7]) }, customLayers: [] });
  assert.equal(sg[0].unit, "g/cc"); // other logs unchanged
});
