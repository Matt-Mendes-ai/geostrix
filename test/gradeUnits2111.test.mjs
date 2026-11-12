// TASKS.csv #2111 — a ppm copper grade with its percent beside it, a ppm gold grade as g/t, and a stope cut-off typed in %
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gradeWithElement, oxideSuffix, gradeUnitText, readsAsPercent } from "../src/lib/pitShell.js";

test("the review's figures: Cu in ppm reads in %, Au in ppm as g/t, ppb gold with its g/t; uranium and % models unchanged", () => {
  assert.equal(gradeWithElement(6740, "ppm", "Cu"), "6740 ppm Cu (0.674 % Cu)");
  assert.equal(gradeWithElement(0.391, "ppm", "Au"), "0.391 g/t Au");
  assert.equal(gradeWithElement(391, "ppb", "Au"), "391 ppb Au (0.391 g/t Au)");
  assert.equal(gradeWithElement(2710, "ppm", "Li"), "2710 ppm Li (0.271 % Li; 0.583 % Li2O)");
  assert.equal(gradeWithElement(245, "ppm", "U"), "245 ppm U (289 ppm U3O8)");
  assert.equal(gradeWithElement(0.674, "%", "Cu"), "0.674 % Cu");
  assert.equal(gradeWithElement(6740, "ppm", null), "6740 ppm");
  // the cut-off line: 'Cu 1260 ppm' was the whole of it
  assert.equal(`${gradeUnitText("ppm", "Cu")} Cu${oxideSuffix(1260, "ppm", "Cu")}`, "ppm Cu (0.126 % Cu)");
  assert.equal(`${gradeUnitText("ppm", "Au")} Au${oxideSuffix(0.222, "ppm", "Au")}`, "g/t Au");
  assert.equal(gradeUnitText("ppm", "Ag"), "g/t");
  assert.equal(gradeUnitText("%", "Cu"), "%");
  assert.ok(readsAsPercent("ppm", "Cu") && readsAsPercent("PPM", "Zn") && !readsAsPercent("ppm", "Au") && !readsAsPercent("%", "Cu") && !readsAsPercent("ppm", "U"));
});

test("the panes: the cut-off lines, the solid's mean grade and the stope cut-off in %", () => {
  const pit = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  assert.equal((pit.match(/gradeUnitText\(/g) || []).length, 4);
  const st = fs.readFileSync("src/components/StopesPane.jsx", "utf8");
  assert.match(st, /const cutV = v\("cutoff"\) == null \? null : pctIn \? \+\(v\("cutoff"\) \* 1e4\)\.toPrecision\(12\) : v\("cutoff"\);/);
  assert.match(st, /\{ cutoff: cutV, levelH/);
  assert.match(st, /inputs: \{ \.\.\.f, \.\.\.\(pctIn \? \{ cutoff: String\(cutV\), cutIn: "" \} : \{\}\)/); // the record stays in ppm
  assert.match(st, /<option value="%">%<\/option>/);
  assert.match(fs.readFileSync("src/components/DesignStringsPane.jsx", "utf8"), /tr\("; mean grade \{g\}", \{ g: gradeWithElement\(tonnage\.meanGrade/);
});
