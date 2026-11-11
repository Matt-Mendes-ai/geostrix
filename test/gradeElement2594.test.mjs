// TASKS.csv #2594 — every grade and cut-off in Mine Design names its element, with the reported oxide beside it
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gradeWithElement, oxideSuffix, reportedOxide } from "../src/lib/pitShell.js";

test("a grade with its element and the oxide it is reported as", () => {
  assert.equal(gradeWithElement(0.555, "%", "Li"), "0.555 % Li (1.19 % Li2O)");
  assert.equal(gradeWithElement(0.4645, "%", "Li", (x) => String(Number(x.toPrecision(4)))), "0.4645 % Li (0.9999 % Li2O)"); // about the industry's 1 % Li2O
  assert.equal(gradeWithElement(245, "ppm", "U"), "245 ppm U (289 ppm U3O8)");
  assert.equal(gradeWithElement(245, "ppm", "eU3O8"), "245 ppm eU3O8");
  assert.equal(gradeWithElement(1.5, "g/t", "Au"), "1.5 g/t Au");
  assert.equal(gradeWithElement(0.5, "%", null), "0.5 %");
  assert.equal(gradeWithElement(null, "%", "Li"), "—");
  assert.equal(oxideSuffix(0.119, "%", "Li"), " (0.256 % Li2O)");
  assert.equal(oxideSuffix(1, "%", "Cu"), "");
  assert.deepEqual(reportedOxide("Ta"), ["Ta2O5", 1.221]);
  assert.equal(reportedOxide("Li")[0], "Li2O"); // not SC6 or LCE
});

test("the panes use it: Pit shell's mean grade and cut-offs, Stope outlines' cut-off label and grades, the designs and the series", () => {
  const pit = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  assert.match(pit, /line\(tr\("Mean grade"\), gradeWithElement\(res\.meanGrade, res\.unit, res\.element\)\)/);
  assert.equal((pit.match(/oxideSuffix\(/g) || []).length, 4);
  const st = fs.readFileSync("src/components/StopesPane.jsx", "utf8");
  assert.match(st, /tr\("Cut-off \(\{unit\}\)", \{ unit: element \? `\$\{unit\} \$\{element\}` : unit \}\)/);
  assert.match(st, /const g = \(x\) => \(x == null \? "—" : gradeWithElement\(x, res\.unit, res\.element\)\)/);
  assert.match(st, /element: res\.element \|\| ""/);
  assert.match(fs.readFileSync("src/components/PitDesignPane.jsx", "utf8"), /gradeWithElement\(g, unit, pit\?\.params\?\.element/);
  const nest = fs.readFileSync("src/components/NestedPitsPane.jsx", "utf8");
  assert.match(nest, /element: element \|\| "" \/\* #2594/);
  assert.match(nest, /unit: element \? `\$\{res\.unit\} \$\{element\}` : res\.unit/);
});
