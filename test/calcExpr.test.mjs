// TASKS.csv #554 — field-calculator conditionals: comparisons, and / or / not, if(), 'text', [Column name].
import test from "node:test";
import assert from "node:assert/strict";
import { compileCalc } from "../src/lib/calcExpr.js";

const cols = ["Au", "Cu", "Au (g/t)", "Cu%", "2nd_split", "LITH"];

test("#554 domain flag: if(Au >= 0.5, 'MIN', 'WASTE') with text results", () => {
  const f = compileCalc("if(Au >= 0.5, 'MIN', 'WASTE')", cols, { allowText: true });
  assert.equal(f({ Au: 0.7 }), "MIN");
  assert.equal(f({ Au: "0.5" }), "MIN"); // numeric text compares as a number
  assert.equal(f({ Au: 0.2 }), "WASTE");
  assert.equal(f({}), null); // missing Au: unknown, blank — never 'WASTE' by default
});

test("#554 and / or / not, comparisons on text, [quoted] columns", () => {
  const f = compileCalc("if([Au (g/t)] > 1 and not (LITH = 'dyke'), [Cu%] * 2, 0)", cols, { allowText: true });
  assert.equal(f({ "Au (g/t)": 2, LITH: "AND", "Cu%": 0.4 }), 0.8);
  assert.equal(f({ "Au (g/t)": 2, LITH: "Dyke", "Cu%": 0.4 }), 0); // text compare is case-insensitive
  const g = compileCalc("Au > 1 or Cu >= 1000", cols, { allowText: true });
  assert.equal(g({ Au: 0.1, Cu: 2000 }), true);
  assert.equal(g({ Au: 0.1, Cu: 10 }), false);
  assert.equal(g({ Au: 2 }), true); // short-circuits on a known true
  assert.equal(g({ Cu: 10 }), null); // unknown or false -> unknown
  assert.equal(compileCalc("[2nd_split] <> 'x'", cols, { allowText: true })({ "2nd_split": "y" }), true);
});

test("#554 numeric mode unchanged; text refused where a number is required; still no code execution", () => {
  const f = compileCalc("Au + Cu * 1.5", cols);
  assert.equal(f({ Au: 1, Cu: 2 }), 4);
  assert.ok(Number.isNaN(f({ Au: 1 })));
  assert.equal(compileCalc("Au > 1", cols)({ Au: 2 }), 1); // a bare comparison is 1 / 0 in numeric mode
  assert.throws(() => compileCalc("if(Au > 1, 'A', 'B')", cols), /must give a number/);
  assert.throws(() => compileCalc("[Nope] + 1", cols), /Unknown column \[Nope\]/);
  assert.throws(() => compileCalc("if(Au, 1)", cols, { allowText: true }), /three parts/);
  assert.throws(() => compileCalc("constructor.constructor('x')()", cols, { allowText: true })); // rejected (no property access exists)
  assert.throws(() => compileCalc("'unclosed", cols, { allowText: true }), /never closed/);
});
