// TASKS.csv #2205 — a project whose assays lack the opening diagram's elements opens on the X-Y scatter, and the Classify buttons are greyed
// with the elements they need instead of an error after the click
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GEOCHEM_METHODS } from "../src/lib/geochemDiagrams.js";

const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");

test("the Classify methods name the elements they need", () => {
  for (const k of ["alteration_boxplot", "litho_winchester", "litho_jensen"]) assert.ok(GEOCHEM_METHODS[k].requires.length > 0, k);
});

test("the buttons are disabled with 'Needs ... in the assays' when an element is missing", () => {
  for (const [label, key] of [["AI / CCPI", "alteration_boxplot"], ["Winchester", "litho_winchester"], ["Jensen", "litho_jensen"]]) {
    const line = g.split(/\r?\n/).find((l) => l.includes(`label="${label}"`));
    assert.ok(line.includes(`disabled={!assayElements.length || methodMissing("${key}").length > 0}`), label);
    assert.ok(line.includes(`tr("Needs {list} in the assays", { list: methodMissing("${key}").join(", ") })`), label);
  }
});

test("the first look at a project opens on the X-Y scatter when the kept diagram cannot plot", () => {
  assert.match(g, /const req = ALL_DIAGRAMS\[diagramId\]\?\.requires \|\| \[\];\r?\n {4}if \(req\.length && req\.some\(\(sym\) => !assaySymSet\.has\(sym\)\)\) setDiagramId\("xy"\);/);
  assert.match(g, /if \(openingChecked\.current \|\| !assayElements\.length\) return;/);
});
