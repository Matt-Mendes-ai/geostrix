// TASKS.csv #3082 — the #3025 leftovers: distinct shell names, the checked-hole collar note, a stale result greyed, the domain note's search shape
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { distinctShellName } from "../src/modules/viewer/modellingRuns.js";

test("a shell name already in use takes its cell size, then a number", () => {
  const l = "Fe > 55 % shell (trend 10:10:1, 228 checked holes)";
  assert.equal(distinctShellName(l, [], 5), l);
  assert.equal(distinctShellName(l, [l], 5), `${l}, 5 m cells`);
  assert.equal(distinctShellName(l, [l, `${l}, 5 m cells`], 5), `${l}, 5 m cells #2`);
  assert.equal(distinctShellName(l, [l], null), `${l} #2`);
});
test("wiring: levelCollars, the stale-result signature, the search shape in the domain note, the samples in the tooltip", () => {
  const src = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const g = src("../src/components/GradeEstimationModal.jsx");
  assert.match(g, /<CollarLevelsNote collars=\{levelCollars\}/);
  assert.match(g, /resultSig !== settingsSig/);
  assert.match(g, /setResultSig\(runSig\.current\)/);
  assert.match(g, /that search is \{shape\} through all the data/);
  assert.match(src("../src/modules/GeophysicsModule.jsx"), /samples from the \$\{p\.samplesFrom\}/);
});
