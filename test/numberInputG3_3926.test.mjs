// TASKS.csv #3926 group G3 — modelling parameters (estimation, variograms, cells and blocks, search radii, surfaces, trends): the number boxes read
// '0,05' as 0.05 (components/NumberInput.jsx), an empty box stays 'auto' / 'fit' / 'none' where it meant that, a silent clamp is now a min / max with
// the plain line, and a box that kept its text in state still gets text
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
// files whose number boxes are all converted (none left as <input type="number">), with how many NumberInputs each has
const DONE = {
  "modules/viewer/ModellingPanes.jsx": 31,
};

test("every G3 box in these files is a NumberInput", () => {
  for (const [f, n] of Object.entries(DONE)) {
    const s = read(f);
    assert.match(s, /import NumberInput from "(\.\.\/\.\.\/components|\.)\/NumberInput\.jsx"; \/\/ TASKS\.csv #3926/, f);
    assert.doesNotMatch(s, /<input[^>]*type="number"/, f);
    assert.equal((s.match(/<NumberInput\s/g) || []).length, n, f);
  }
});

test("ModellingPanes: empty keeps 'auto' / 'fit' / 'none' / 'cubic'; the clamps are min / max; text state stays text", () => {
  const p = read("modules/viewer/ModellingPanes.jsx");
  // empty = auto (0), as before; the floor of 10 m is said, not clamped
  assert.match(p, /<NumberInput min=\{10\} max=\{20000\} step=\{50\} allowEmpty value=\{contactReachM \|\| null\} placeholder=\{tr\("auto"\)\} onChange=\{\(v\) => setContactReachM\(v \?\? 0\)\}/);
  // a silent clamp is now the box's min / max
  assert.match(p, /<NumberInput min=\{5\} max=\{500\} step=\{5\} value=\{thinWindowM\} disabled=\{!thinPicks\} onChange=\{\(v\) => setThinWindowM\(v\)\}/);
  assert.match(p, /min=\{1\} value=\{searchEllipsoid\.major\} onChange=\{\(v\) => setSearchEllipsoid\(\(p\) => \(\{ \.\.\.p, major: v \}\)\)\}/);
  assert.match(p, /<NumberInput min="0\.5" value=\{numericCellSize\} onChange=\{\(v\) => \{ setNumericCellSize\(v\); setNumericBudgetHint\(null\); \}\}/);
  assert.match(p, /onChange=\{\(v\) => setNumericMinCoverage\(v \/ 100\)\}/);
  // text state stays text, empty stays empty
  assert.match(p, /allowEmpty value=\{sensN === "" \|\| sensN == null \? null : sensN\} onChange=\{\(v\) => setSensN\(v == null \? "" : String\(v\)\)\}/);
  assert.match(p, /allowEmpty value=\{veinDip === "" \|\| veinDip == null \? null : veinDip\} placeholder=\{tr\("fit"\)\} onChange=\{\(v\) => setVeinDip\(v == null \? "" : String\(v\)\)\}/);
  assert.match(p, /setNumericVariogram\(\(x\) => \(\{ \.\.\.x, \[k\]: v == null \? "" : String\(v\) \}\)\)/);
  // the cut-off and the cap: empty is NaN ('none'), as before
  assert.match(p, /allowEmpty value=\{Number\.isFinite\(numericCutoff\) \? numericCutoff : null\} onChange=\{\(v\) => setNumericCutoff\(v == null \? NaN : v\)\}/);
  assert.match(p, /allowEmpty value=\{Number\.isFinite\(numericCapValue\) \? numericCapValue : null\} onChange=\{\(v\) => setNumericCapValue\(v == null \? NaN : v\)\}/);
  // the cell height: empty = cubic; 0 is refused by the min (it was cubic silently)
  assert.match(p, /allowEmpty value=\{gt \|\| numericCellHeight === "" \|\| numericCellHeight == null \? null : numericCellHeight\} disabled=\{!!gt\} placeholder=\{gt \? tr\("trend"\) : tr\("cubic"\)\} onChange=\{\(v\) => \{ setNumericCellHeight\(v == null \? "" : v\); setNumericBudgetHint\(null\); \}\}/);
});
