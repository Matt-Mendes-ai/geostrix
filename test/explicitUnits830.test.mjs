// TASKS.csv #830 / #831 / #832 — an explicit surface's unit, upper / lower contact and layer (A, B, C...)
import test from "node:test";
import assert from "node:assert/strict";
import { unitOf, contactOf, layerLabel, layerLetter, unitSummary, splitByElevation, nextLayer } from "../src/lib/explicitUnits.js";

test("#830 a surface from before #830 is the upper contact of a unit named after itself", () => {
  const d = { id: "a", name: "Top of SILBX" };
  assert.equal(unitOf(d), "Top of SILBX");
  assert.equal(contactOf(d), "upper");
  assert.equal(layerLabel(d), "Top of SILBX");
  assert.equal(layerLabel({ name: "x", unit: "Basalt", layer: "B", contact: "lower" }), "Basalt B");
  assert.equal(contactOf({ contact: "lower" }), "lower");
});

test("#832 layer letters run A..Z, then AA", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52].map(layerLetter), ["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
  assert.equal(nextLayer([{ name: "p", unit: "Basalt", layer: "A" }, { name: "q", unit: "Basalt", layer: "C" }, { name: "r", unit: "Shale", layer: "B" }], "Basalt"), "B");
});

test("#831 the units in use, with their layers and contacts", () => {
  const s = unitSummary([
    { id: 1, name: "Top Basalt", unit: "Basalt", layer: "B" }, { id: 2, name: "Base Basalt", unit: "Basalt", layer: "A", contact: "lower" },
    { id: 3, name: "Shale top" }, { id: 4, name: "Top Basalt A", unit: "Basalt", layer: "A" },
  ]);
  assert.deepEqual(s.map((u) => u.unit), ["Basalt", "Shale top"]);
  assert.deepEqual(s[0].layers.map((l) => [l.layer, l.upper.map((d) => d.id), l.lower.map((d) => d.id)]), [["A", [4], [2]], ["B", [1], []]]);
});

test("#832 split a unit into layers by elevation", () => {
  const up = (id, z) => ({ id, contact: "upper", z }), lo = (id, z) => ({ id, contact: "lower", z });
  assert.deepEqual(splitByElevation([lo("b1", 60), up("a1", 140), lo("a2", 120), up("b0", 80)]), { a1: "A", a2: "A", b0: "B", b1: "B" });
  assert.deepEqual(splitByElevation([up("x", 100), up("y", 50)]), { x: "A", y: "B" });
  assert.deepEqual(splitByElevation([lo("x", 100), lo("y", 50)]), { x: "A", y: "B" });
  assert.deepEqual(splitByElevation([lo("x", 100), up("y", 50), lo("z", 20)]), { x: "A", y: "B", z: "B" }, "a lower contact first is a layer whose top is not modelled");
  assert.deepEqual(splitByElevation([up("x", NaN)]), {}, "a surface not built yet is left as it is");
});
