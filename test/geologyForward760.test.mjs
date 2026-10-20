// TASKS.csv #760 — the geophysical check of a geology model: which models qualify, units, cell lookup, medians, body.
import test from "node:test";
import assert from "node:assert/strict";
import { categoricalModels, modelUnits, cellLocator, unitMedians, modelBody } from "../src/lib/geologyForward.js";

// a 2 x 1 x 2 block of 10 m cells: unit 1 (DACT) on top, unit 2 (VCL) below
const cells = [];
for (const x of [5, 15]) for (const z of [5, 15]) cells.push({ x, y: 5, z, dx: 10, dy: 10, dz: 10, value: z > 10 ? 1 : 2 });
const model = { id: "m", colorMode: "discrete", valueLabels: { 1: "DACT", 2: "VCL" }, cells };

test("qualifying models and their units", () => {
  assert.deepEqual(categoricalModels([model, { colorMode: "continuous", cells }, { colorMode: "discrete", valueLabels: {}, cells }]).map((m) => m.id), ["m"]);
  assert.deepEqual(modelUnits(model), [{ value: 1, label: "DACT", cells: 2 }, { value: 2, label: "VCL", cells: 2 }]);
});

test("cell lookup, also with mixed cell sizes", () => {
  const at = cellLocator(cells);
  assert.equal(cells[at(14, 5, 16)].value, 1);
  assert.equal(cells[at(1, 9, 1)].value, 2);
  assert.equal(at(25, 5, 5), -1);
  const mixed = [{ x: 10, y: 10, z: 10, dx: 20, dy: 20, dz: 20 }, { x: 22.5, y: 2.5, z: 2.5, dx: 5, dy: 5, dz: 5 }];
  const at2 = cellLocator(mixed);
  assert.equal(at2(19, 19, 19), 0);
  assert.equal(at2(24, 1, 4), 1);
  assert.equal(at2(24, 19, 4), -1);
});

test("downhole medians per unit", () => {
  const pts = [[5, 5, 18, 0.01], [12, 5, 12, 0.03], [8, 5, 15, 0.02], [5, 5, 2, 0.001], [50, 5, 5, 9]];
  assert.deepEqual(unitMedians(model, pts), { 1: { median: 0.02, n: 3 }, 2: { median: 0.001, n: 1 } });
});

test("body: contrast against the background, background units left out, nothing defaulted", () => {
  const b = modelBody(model, { 1: 2.9, 2: 2.67 }, 2.67);
  assert.equal(b.cells.length, 2);
  assert.ok(b.cells.every((r) => r.length === 7 && Math.abs(r[6] - 0.23) < 1e-12 && r[2] === 15));
  assert.match(modelBody(model, { 1: 2.9 }, 2.67).problem, /missing: VCL/);
  assert.match(modelBody(model, { 1: 2.9, 2: 2.67 }, NaN).problem, /background/);
  assert.match(modelBody(model, { 1: 2.67, 2: 2.67 }, 2.67).problem, /no contrast/);
});
