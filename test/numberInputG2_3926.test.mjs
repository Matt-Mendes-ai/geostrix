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
  "components/PlanModelsList.jsx", "components/PlannedHoleParts.jsx", "components/PlannedHoleTargeting.jsx", "components/SectionEditModal.jsx",
  "components/StereonetModal.jsx", "components/StripLog.jsx", "components/SurfaceGeologyProjection.jsx",
  "components/MapModelPanel.jsx", "components/SectionWindow.jsx",
  "components/CoreOrientationCalculator.jsx", "components/SectionGeorefModal.jsx", "components/SurfaceMappingPanel.jsx", "components/SurveyPlannerPanel.jsx",
];

test("every G2 box in these files is a NumberInput", () => {
  for (const f of DONE) {
    const s = read(f);
    assert.match(s, /import NumberInput from "\.\/NumberInput\.jsx";/, f);
    assert.doesNotMatch(s, /<input[^>]*type="number"/, f);
    assert.match(s, /<NumberInput\s/, f);
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

test("the planned hole's fields: the azimuth wrapped and the dip held when the box commits (#3824), as on blur before", () => {
  const h = read("components/PlannedHoleParts.jsx");
  assert.match(h, /<NumberInput allowEmpty value=\{value === "" \? null : value\} placeholder=\{placeholder\} onChange=\{\(v\) => onChange\(v == null \? "" : limit && limit\(v\) !== v \? Math\.round\(limit\(v\) \* 1000\) \/ 1000 : v\)\}/);
  assert.match(read("components/PlannedHoleTargeting.jsx"), /allowEmpty value=\{value \?\? null\} placeholder="—"/);
  assert.match(read("components/StereonetModal.jsx"), /<NumberInput min=\{0\} max=\{89\} step=\{5\} value=\{roseMinDip\}/);
});

test("the section window's buffer sends the corridor when the box commits, as its Enter / blur did", () => {
  const w = read("components/SectionWindow.jsx");
  assert.match(w, /<NumberInput min=\{1\} step=\{5\} value=\{data\.section\?\.corridor \?\? null\}\s+onChange=\{\(v\) => \{ if \(v > 0 && v !== data\.section\?\.corridor\) sendSectionContacts\(\{ id: data\.id, corridor: v \}\); \}\}/);
  assert.doesNotMatch(w, /bufferDraft/);
});

test("a box that filled its row still does (wrapStyle), and the survey grid's azimuth still wraps", () => {
  assert.match(read("components/CoreOrientationCalculator.jsx"), /const numWrap = \{ flex: 1, minWidth: 0 \}, numFill = \{ \.\.\.num, width: "100%", boxSizing: "border-box" \};/);
  assert.match(read("components/SurfaceMappingPanel.jsx"), /aria-label=\{tr\("Easting"\)\} style=\{\{ \.\.\.select, width: "100%", boxSizing: "border-box" \}\} wrapStyle=\{\{ flex: 1, minWidth: 0 \}\}/);
  const sp = read("components/SurveyPlannerPanel.jsx");
  assert.match(sp, /<NumberInput value=\{grid\.azimuth\} onChange=\{\(v\) => setGrid\(\(g\) => \(\{ \.\.\.g, azimuth: \(\(v % 360\) \+ 360\) % 360 \}\)\)\}/);
  assert.match(sp, /<NumberInput min=\{5\} value=\{grid\.lineSpacing\}/);
});

test("NumberInput takes a wrapper style (a box that fills a row), and nothing else changes", () => {
  const n = read("components/NumberInput.jsx");
  assert.match(n, /wrapStyle = null/);
  assert.match(n, /<span style=\{\{ display: "inline-flex", flexDirection: "column", gap: 2, \.\.\.\(wrapStyle \|\| \{\}\) \}\}>/);
});
