// TASKS.csv #2515 (review #2486, WA lithium) — a displayed assay value to an assay's precision, the same in every place that prints one
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeText } from "../src/lib/gradeText.js";

test("four significant figures, never fewer than the whole-number digits, whole numbers as they are", () => {
  assert.equal(gradeText(3.3163004598875836), "3.316");
  assert.equal(gradeText(0.0023226645607841317), "0.002323");
  assert.equal(gradeText(0.6698564593301436), "0.6699");
  assert.equal(gradeText(7.139), "7.139");
  assert.equal(gradeText(2.1527), "2.153");
  assert.equal(gradeText(12345), "12345");
  assert.equal(gradeText(1234.5), "1234.5");
  assert.equal(gradeText(0), "0");
  assert.equal(gradeText(null), "");
  assert.equal(gradeText("BDL"), "BDL");
});

test("the tooltip, the section labels, the level plan, Identify and the Style range use it", () => {
  const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(src("../src/modules/ViewerModule.jsx"), /\$\{sym\}: \$\{gradeText\(v\)\} \$\{elementUnits\[sym\] \|\| ""\}/);
  assert.match(src("../src/modules/ViewerModule.jsx"), /label: `\$\{sym\}: \$\{gradeText\(v\)\}/);
  assert.match(src("../src/components/SectionWindow.jsx"), /`\$\{gradeText\(a\.value\)\} \$\{a\.u\} \$\{a\.sym\}`/);
  assert.match(src("../src/lib/levelPlan.js"), /label = `\$\{sym\}: \$\{gradeText\(value\)\}/);
  assert.match(src("../src/lib/viewer/identify.js"), /fields\.push\(\[tr\("Value"\), gradeText\(row\.value\)\]\)/);
  assert.match(src("../src/components/AssayStyleModal.jsx"), /min: gradeText\(range\.min\), max: gradeText\(range\.max\)/);
});
