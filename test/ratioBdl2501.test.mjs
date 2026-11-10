// TASKS.csv #2501 (review #2486, WA lithium) — immobile-element ratio and ternary diagrams, and the Winchester classifier, leave out a sample
// whose operand is below detection; sums of majors (TAS) keep the half-limit point
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DIAGRAMS, GEOCHEM_METHODS, RATIO_DIAGRAMS, censoredOperand, censoredLeftOut } from "../src/lib/geochemDiagrams.js";

const u = { Zr: "ppm", Ti: "%", Nb: "ppm", Y: "ppm", Si: "%", Na: "%", K: "%", Th: "ppm", Yb: "ppm", Hf: "ppm", Ta: "ppm" };
const real = { values: { Zr: 150, Ti: 0.6, Nb: 12, Y: 25, Si: 30, Na: 2, K: 1.5 } };
const yBdl = { values: { Zr: 150, Ti: 0.6, Nb: 12, Y: 0.5 }, qualifiers: { Y: "<" } }; // Y at half its limit
const naBdl = { values: { Si: 30, Na: 0.005, K: 1.5 }, qualifiers: { Na: "<" } };

test("Winchester leaves out a sample with a '<' operand, and says which element", () => {
  assert.ok(DIAGRAMS.winchester.project(real, u));
  assert.equal(DIAGRAMS.winchester.project(yBdl, u), null);
  assert.ok(DIAGRAMS.winchester.projectRaw(yBdl, u)); // the old point, from half the limit
  assert.equal(censoredOperand(yBdl, DIAGRAMS.winchester.requires), "Y");
  assert.deepEqual(censoredLeftOut(DIAGRAMS.winchester, [real, yBdl, yBdl], u), { total: 2, bySymbol: { Y: 2 } });
  assert.ok(RATIO_DIAGRAMS.every((id) => DIAGRAMS[id].ratio));
});

test("the Winchester classifier names no rock from a detection limit; TAS keeps its half-limit point", () => {
  const m = GEOCHEM_METHODS.litho_winchester;
  assert.equal(m.ratio, true);
  assert.equal(m.classify(yBdl.values, u, yBdl), null);
  assert.ok(m.classify(real.values, u, real));
  assert.ok(DIAGRAMS.tas.project(naBdl, u)); // a sum of majors: kept
  assert.equal(DIAGRAMS.tas.ratio, undefined);
});

test("the pane and the Classify notice count the samples left out", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const ratioLeftOut = useMemo\(\(\) => censoredLeftOut\(diagram, plotted, elementUnits\)/);
  assert.match(g, /if \(method\.ratio\) \{ const c = censoredOperand\(a, method\.requires\); if \(c\) \{ bdlLeft\[c\] = \(bdlLeft\[c\] \|\| 0\) \+ 1; return null; \} \}/);
  assert.match(g, /\+ trendText \+ sedText \+ bdlText \+ jensenText/);
});
