// TASKS.csv #3497 — value, not metal, for non-metal variables; #3499 the Grade shell offer; #3500 Compute both
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isNonMetal } from "../src/lib/nonMetal.js";
import { anisotropyFor, rememberAnisotropy, anisotropyFromFits } from "../src/lib/estimateMemory.js";
const src = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("which variables are not metals", () => {
  for (const s of ["SiO2", "Al2O3", "LOI", "P", "S", "sio2", "Density", "SG"]) assert.equal(isNonMetal(s), true, s);
  for (const s of ["Cu", "Au", "Fe", "Mn", "Zn", "Ag", "Mo"]) assert.equal(isNonMetal(s), false, s);
  assert.equal(isNonMetal("Cu", { fromLog: true }), true, "a log is always a value");
});
test("the result lines choose the wording", () => {
  const g = src("../src/components/GradeEstimationModal.jsx");
  assert.equal((g.match(/tr\(nonMetal \? "[^"]*estimated value/g) || []).length, 6);
  assert.match(g, /const nonMetal = isNonMetal\(symbol, \{ fromLog: sourceKey !== "assay" \}\)/);
});
test("#3499: the anisotropy is remembered per project and element, and the Grade shell pane offers it", () => {
  const project = { id: "p3499" };
  assert.equal(anisotropyFor(project, "Fe"), null);
  rememberAnisotropy(project, "Fe", anisotropyFromFits({ range: 40 }, { range: 400 }));
  assert.equal(anisotropyFor(project, "Fe").ratio, 10);
  assert.equal(anisotropyFor(project, "Cu"), null);
  const m = src("../src/modules/viewer/ModellingPanes.jsx");
  assert.match(m, /anisotropyFor\(storeProject, numericSymbol\)/);
  assert.match(m, /setNumericSearchRadius\(Math\.round\(an\.acrossM\)\); setNumericFlatReach\(Math\.round\(an\.downholeM\)\)/);
});
test("#3500: Compute both runs the downhole variogram and then the in-plane one", () => {
  const v = src("../src/components/VariogramModal.jsx");
  assert.match(v, /const runAs = \(holeMode, inPlane\) => new Promise/);
  assert.match(v, /await runAs\("downhole", false\); await runAs\("all", true\)/);
});
