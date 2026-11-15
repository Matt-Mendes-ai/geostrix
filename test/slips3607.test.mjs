// TASKS.csv #3607 (Fireweed rehearsal, Macpass, step 5's small slips): (1) a grade shell run without the unsampled choice is a prompt, not 'Numeric model
// failed'; (3) a search the user typed (even the opening 50 m) is never replaced by the one from the spacing; (4) no backlog number in the shell's
// stored record; (7) the Block calculator's summary in the new model's unit.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("the slips: a prompt, a typed search kept, no backlog number, the calculator's unit", () => {
  const r = read("modules/viewer/modellingRuns.js");
  assert.match(r, /if \(!u\.ready\) throw Object\.assign\(new Error\(tr\("Choose how the unsampled metres inside the sampled holes are read \(and, for barren, type their value\) before running\."\)\), \{ prompt: true \}\);/);
  assert.match(r, /e\?\.prompt \? \{ text: e\.message, level: "info" \}/);
  assert.doesNotMatch(r, /capped \(#803\)/, "(4) no backlog number in the stored record");
  const p = read("modules/viewer/ModellingPanes.jsx");
  assert.match(p, /onChange=\{\(e\) => \{ shellSearchTyped\.current = true;/);
  assert.match(p, /if \(shellSearchAuto && !shellSearchTyped\.current && /);
  const c = read("components/BlockCalculatorModal.jsx");
  assert.match(c, /const unitSuffix = unit\.trim\(\) \? ` \$\{unit\.trim\(\)\}` : "";/);
  assert.match(c, /mean: fmt\(mean\) \+ unitSuffix, min: fmt\(rampOf\(result\.cells\)\.min\) \+ unitSuffix, max: fmt\(rampOf\(result\.cells\)\.max\) \+ unitSuffix/);
});
