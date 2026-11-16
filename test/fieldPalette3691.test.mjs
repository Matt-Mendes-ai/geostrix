// TASKS.csv #3691 — 'MEAS' (the density's commonest method) took the amber of the zinc classes drawn beside it: the by-field palette opens with hues the assay classes do not use.
import test from "node:test";
import assert from "node:assert/strict";
import { FIELD_PALETTE, fieldValueColours } from "../src/lib/fieldColours.js";
import { CATEGORICAL_SAFE_COLORS } from "../src/lib/layers.js";

const WARM = ["#E69F00", "#F0E442", "#D55E00", "#DDCC77", "#999933"];
test("the first by-field colours are not amber / yellow / vermillion; the same colours, the warm ones last", () => {
  assert.deepEqual([...FIELD_PALETTE].sort(), [...CATEGORICAL_SAFE_COLORS].sort(), "the same set");
  for (const c of FIELD_PALETTE.slice(0, 3)) assert.ok(!WARM.includes(c), c + " is not a warm hue");
  const m = fieldValueColours([["MEAS", 25464], ["REG", 6489], ["LAB-SPG04", 545]]);
  assert.ok(![...m.values()].some((c) => WARM.includes(c)), "the density's three methods avoid the zinc classes' warm hues");
  assert.equal(new Set(m.values()).size, 3);
  assert.equal(fieldValueColours([["", 3]]).get(""), "#9aa3ad", "a blank cell stays grey");
});
