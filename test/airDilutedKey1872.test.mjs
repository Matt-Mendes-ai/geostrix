// TASKS.csv #1872 (review #1646, Kodiak) — a chargeability model saved before #1659 (the -1 air slab still in it, and blocks averaged with
// the air a little below 0) printed its key from -0.035 mV/V when its range was typed or its colours edited.
import { test } from "node:test";
import assert from "node:assert/strict";
import { voxelLegendGroups } from "../src/lib/legendGroups.js";
import { airDilutedFloor } from "../src/lib/voxelStretch.js";

const kodiak = () => {
  const cells = [];
  for (let i = 0; i < 19824; i++) cells.push({ value: -1 });
  for (let i = 0; i < 439; i++) cells.push({ value: -0.75 + (i / 438) * 0.7146 });
  for (let i = 0; i < 70000; i++) cells.push({ value: 23.1 * (i / 69999) ** 3 });
  return { id: "c", name: "3dmesh_utm", property: "Chargeability (mV/V)", cells, min: -0.0354, max: 23.1 };
};

test("#1872 the key of a model with a negative air flag starts at its lowest value at or above 0", () => {
  const m = { ...kodiak(), stretch: "minmax" };
  assert.equal(voxelLegendGroups([m])[0].ramp.minLabel, "0");
  const st = { ...kodiak(), stops: [{ value: -0.0354, color: "#000000" }, { value: 23.1, color: "#ffffff" }] };
  assert.equal(voxelLegendGroups([st])[0].ramp.minLabel, "0");
  assert.equal(voxelLegendGroups([st])[0].ramp.maxLabel, "23.1");
});

test("#1872 a model that really holds negatives (no air flag) keeps its range", () => {
  const cells = Array.from({ length: 5000 }, (_, i) => ({ value: -0.02 + (i / 4999) * 0.1 })); // a susceptibility, no flag value
  const m = { id: "s", name: "susc", cells, min: -0.02, max: 0.08, stretch: "minmax" };
  assert.equal(airDilutedFloor(m, -0.02), -0.02);
  assert.match(voxelLegendGroups([m])[0].ramp.minLabel, /^-0\.020?$/);
  assert.equal(airDilutedFloor(kodiak(), 2), 2, "a low end at or above 0 is left alone");
});
