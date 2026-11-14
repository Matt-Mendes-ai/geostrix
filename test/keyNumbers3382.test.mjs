// TASKS.csv #3382 — key numbers: three significant figures with thousands separators in the drill plan's key and the legend alike, classes
// not split where two percentiles nearly coincide, and the drill plan in the element's chosen display unit
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fmtSig3 } from "../src/lib/numberFormat.js";
import { fmtClassNumber, gradeBreaks } from "../src/lib/drillPlan.js";
import { fmtLegendValue } from "../src/lib/legendGroups.js";

test("one format: 3 significant figures, separators, short scientific under 0.001", () => {
  assert.equal(fmtSig3(1531044), "1,530,000");
  assert.equal(fmtSig3(2677533), "2,680,000");
  assert.equal(fmtSig3(6590), "6,590");
  assert.equal(fmtSig3(16600), "16,600");
  assert.equal(fmtSig3(460), "460");
  assert.equal(fmtSig3(0.163), "0.163");
  assert.equal(fmtSig3(41.4), "41.4");
  assert.equal(fmtSig3(1.2e-5), "1.2e-5");
  assert.equal(fmtSig3(0), "0");
  assert.equal(fmtClassNumber(1531044), "1,530,000");
  assert.equal(fmtLegendValue(460), "460", "was '460.0'");
  assert.equal(fmtLegendValue(6590), "6,590", "was '6590'");
});

test("percentiles that nearly coincide are one class", () => {
  // SYNTHETIC best-intercept GT of 16 holes: the 75th and 90th percentiles 514,406 and 518,514 (0.8 % apart)
  const v = [100, 200, 300, 400, 399940, 400000, 420000, 450000, 480000, 500000, 510000, 514406, 515000, 516000, 518514, 600000];
  const b = gradeBreaks(v);
  assert.ok(!b.some((x, i) => i && x - b[i - 1] < 0.05 * x), b.join(", "));
  assert.ok(b.length >= 1);
  // skewed grades keep their low classes (the rule is relative to the bound, not the range)
  const skew = Array.from({ length: 100 }, (_, i) => 0.1 * 1.07 ** i);
  assert.equal(gradeBreaks(skew).length, 3);
  // the earlier cases hold
  assert.deepEqual(gradeBreaks(Array.from({ length: 100 }, (_, i) => i + 1)), [50, 75, 90]);
  assert.deepEqual(gradeBreaks([0, 0, 0, 0, 0, 0, 0, 0, 3, 9]), [3]);
});

test("wired: the drill plan takes the project's display units on both render paths and in the sidebar", () => {
  const d = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(d, /export function drillPlanGradeInput\(el, assays, assayElements, displayUnits = null\)/);
  assert.match(d, /const chosen = displayUnits\?\.\[key\], shown = isPlainUnit\(unit\) && isPlainUnit\(chosen\) && chosen !== unit \? chosen : null;/);
  assert.match(d, /drillPlanDrawing\(el, collars, assays, assayElements, plannedHoles, traces, desurveyMethod, displayUnits\)/);
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.equal((m.match(/displayUnits: project\?\.displayUnits \/\* #3382 \*\//g) || []).length, 2, "the page and the print root");
  assert.match(m, /displayUnits=\{ctx\?\.displayUnits \|\| null\}/);
  assert.match(m, /project\?\.desurveyMethod, project\?\.displayUnits \/\* #3382 \*\/\);/);
});
