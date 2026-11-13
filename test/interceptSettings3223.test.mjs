// TASKS.csv #3223 (review #3195, Galore Creek) — Best intercepts opened a porphyry on its 90th-percentile cut-off, said only in a tooltip,
// and forgot every setting when the dialog closed
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");

test("the settings are kept per project (useKeptState)", () => {
  for (const k of ["bi.asPct", "bi.cutoff", "bi.suggested", "bi.dilution", "bi.minLength", "bi.minGradeLen", "bi.includeCutoff", "bi.meqOn", "bi.meqInputs", "bi.extraSymbols", "bi.cutOnEq"]) {
    assert.match(s, new RegExp(`useKeptState\\(keptScope, "${k.replace(".", "\\.")}"`), k);
  }
  assert.match(s, /const keptScope = scopeOf\(getProjectToken\?\.\(\)\);/);
  assert.match(s, /kept0\.set\("bi\.cutoffBySymbol", \{\}\)/);
  assert.doesNotMatch(s, /const \[maxInternalDilution, setMaxInternalDilution\] = useState\(/);
});

test("the suggestion is said beside the box, with the median and Q3 offered", () => {
  assert.match(s, /\{suggested != null && cutoff === suggested && \(\(\) => \{ const med = quantileOf\(symbol, 0\.5\), q3 = quantileOf\(symbol, 0\.75\);/);
  assert.match(s, /tr\("Suggested: the 90th percentile\. Set the cut-off you report at, or try:"\)/);
  assert.match(s, /const p90Of = \(sym\) => quantileOf\(sym, 0\.9\);/);
});
