// TASKS.csv #1592 — no grade-tonnage icon on an OMF / UBC model whose values are not stated (a geophysics model).
import test from "node:test";
import assert from "node:assert/strict";
import { offersGradeTonnage } from "../src/lib/gradeTonnage.js";

const geo = (p) => ["Susceptibility (SI)", "Resistivity (ohm·m)"].includes(p);

test("unstated OMF / UBC: none; stated as a grade: offered; a geophysical property: none", () => {
  assert.equal(offersGradeTonnage({ source: "omf", property: "" }, { geophysProperty: geo }), false); // Lawyers' MVI amplitude
  assert.equal(offersGradeTonnage({ source: "ubc" }, { geophysProperty: geo }), false);
  assert.equal(offersGradeTonnage({ source: "omf", property: "Au g/t" }, { geophysProperty: geo }), true);
  assert.equal(offersGradeTonnage({ source: "omf", property: "Susceptibility (SI)" }, { geophysProperty: geo }), false);
});

test("estimates and block-model CSV imports keep it; SimPEG, categorical, indices and variances never", () => {
  assert.equal(offersGradeTonnage({ source: "estimate-ok", params: { element: "Au" } }, { geophysProperty: geo }), true);
  assert.equal(offersGradeTonnage({ source: "blockmodel-csv" }, { geophysProperty: geo }), false); // since #2667: a CSV model waits until it is said to be a grade
  assert.equal(offersGradeTonnage({ source: "blockmodel-csv", params: { element: "Cu", unit: "ppm", declaredGrade: true } }, { geophysProperty: geo }), true);
  assert.equal(offersGradeTonnage({ source: "simpeg" }, { geophysProperty: geo }), false);
  assert.equal(offersGradeTonnage({ source: "estimate-ok" }, { categorical: true }), false);
  assert.equal(offersGradeTonnage({ source: "support-index-ok" }), false);
  assert.equal(offersGradeTonnage({ source: "kriging-variance" }), false);
});
