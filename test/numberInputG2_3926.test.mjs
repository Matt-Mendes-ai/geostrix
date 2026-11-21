// TASKS.csv #3926 group G2 — coordinates and ground geometry: the number boxes read '0,05' as 0.05 (components/NumberInput.jsx), an empty box
// stays 'not set' where it meant that, a min / max is kept with a plain line, and a box that kept its text in state still gets text
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
// files whose number boxes are all G2 (none left as <input type="number">)
const DONE = [
  "components/PlannedHolePattern.jsx", "components/ModelAreaRange.jsx", "components/LocalGridPanel.jsx", "components/SectionImageVerticalModal.jsx",
  "components/SlicePlaceRow.jsx", "components/LevelPlanWindow.jsx", "components/ProjectCrsModal.jsx", "components/GeoreferencerModal.jsx",
  "components/InterpretPane.jsx", "components/ImportMappingModal.jsx", "components/AlterationBoxModal.jsx",
];

test("every G2 box in these files is a NumberInput", () => {
  for (const f of DONE) {
    const s = read(f);
    assert.match(s, /import NumberInput from "\.\/NumberInput\.jsx";/, f);
    assert.doesNotMatch(s, /<input[^>]*type="number"/, f);
    assert.match(s, /<NumberInput /, f);
  }
});

test("the wrapper and the rules: text state stays text, empty stays 'not set', min / max kept", () => {
  const p = read("components/PlannedHolePattern.jsx");
  assert.match(p, /type === "number"[\s\S]{0,120}\? <NumberInput allowEmpty value=\{value === "" \? null : value\} placeholder=\{placeholder\} onChange=\{\(v\) => onChange\(v == null \? "" : String\(v\)\)\}/);
  const g = read("components/LocalGridPanel.jsx");
  assert.match(g, /<NumberInput allowEmpty value=\{rl === "" \? null : rl\} onChange=\{\(v\) => \{ const s = v == null \? "" : String\(v\); setRl\(s\); setLocalGridDatum\(\{ rlOffset: s \}\); \}\}/);
  const a = read("components/AlterationBoxModal.jsx");
  assert.match(a, /<NumberInput min=\{0\} max=\{100\} value=\{boxes\[p\]\[axis\]\[i\]\} onChange=\{\(v\) => setLimit\(p, axis, i, v\)\}/);
  const l = read("components/LevelPlanWindow.jsx");
  assert.match(l, /<NumberInput min=\{0\.1\} value=\{half === "" \? null : half\} onChange=\{\(v\) => setHalf\(String\(v\)\)\}/);
});

test("NumberInput takes a wrapper style (a box that fills a row), and nothing else changes", () => {
  const n = read("components/NumberInput.jsx");
  assert.match(n, /wrapStyle = null/);
  assert.match(n, /<span style=\{\{ display: "inline-flex", flexDirection: "column", gap: 2, \.\.\.\(wrapStyle \|\| \{\}\) \}\}>/);
});
