// TASKS.csv #770 — vector (remanence) inversion results: named as magnetisation amplitude, each cell keeps its
// direction, the declination goes back to true north, and the summary says when remanence matters.
import test from "node:test";
import assert from "node:assert/strict";
import { resultToVoxelModel, trueDeclination, remanenceText, gridDeclination } from "../src/lib/inversion.js";

const cells = { value: [0.02, 0.01], x: [0, 1], y: [0, 1], z: [0, 1], dx: [25, 25], dy: [25, 25], dz: [25, 25], support: [1, 0.5], inc: [-19.3, 10], dec: [91.6, 200] };

test("vector result: amplitude property, per-cell direction, style vector", () => {
  const m = resultToVoxelModel({ method: "mag", magModel: "vector", style: "vector", cells }, { surveyName: "s" });
  assert.equal(m.property, "Magnetization amplitude (SI)");
  assert.match(m.name, /vector inversion of s/);
  assert.equal(m.style, "vector");
  assert.deepEqual([m.cells[0].inc, m.cells[0].dec, m.cells[1].dec], [-19.3, 91.6, 200]);
});

test("scalar results carry no direction fields", () => {
  const m = resultToVoxelModel({ method: "mag", cells: { ...cells, inc: undefined, dec: undefined } }, { surveyName: "s" });
  assert.equal(m.cells[0].inc, undefined);
  assert.equal(m.property, "Recovered susceptibility (SI)");
});

test("true declination undoes gridDeclination's convergence, wrapping at 360", () => {
  assert.equal(trueDeclination(91.6, 1.6), 90);
  assert.equal(trueDeclination(1, 3), 358);
  const g = gridDeclination(18, 500000, 6250000, 32609) || { grid: 18 + 0.5, convergence: 0.5 };
  assert.ok(Math.abs(trueDeclination(g.grid, g.convergence) - 18) < 1e-9);
});

test("remanence wording follows the angle to the inducing field and flags scattered directions", () => {
  const far = remanenceText({ inclination: -19.3, declinationGrid: 91.6, cells: 161, consistency: 0.85, angleToInducingField: 104.4 }, 1.6);
  assert.match(far, /inclination -19°, declination 90° \(true north\)/);
  assert.match(far, /remanent component is likely/);
  assert.doesNotMatch(far, /scatter/);
  assert.match(remanenceText({ inclination: 70, declinationGrid: 18, cells: 10, consistency: 0.9, angleToInducingField: 8 }, 0), /mostly induced/);
  assert.match(remanenceText({ inclination: 60, declinationGrid: 40, cells: 10, consistency: 0.5, angleToInducingField: 20 }, 0), /some remanence is possible.*scatter/);
  assert.equal(remanenceText(null, 0), null);
  // nearly opposite the field: could be a magnetic low, not remanence (seen live on the Harry sample)
  const opp = remanenceText({ inclination: -75, declinationGrid: 12, cells: 321, consistency: 0.9, angleToInducingField: 148 }, 0);
  assert.match(opp, /magnetic LOW/);
  assert.doesNotMatch(opp, /remanent component is likely/);
});
