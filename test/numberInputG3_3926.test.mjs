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
  "components/GradeEstimationModal.jsx": 18,
  "components/VariogramModal.jsx": 11,
  "components/ExplicitSurfacePanel.jsx": 6,
  "components/ModellingCodesPane.jsx": 6,
  "components/StructFitPanel.jsx": 6,
  "components/LongSectionGT.jsx": 5,
  "components/CatchmentsPanel.jsx": 4,
  "components/SampleGridPanel.jsx": 4,
  "components/UndrilledZonesPane.jsx": 4,
  "components/SurfaceSolidsPanel.jsx": 3,
  "modules/viewer/DomainUpdateSection.jsx": 3,
  "components/SculptPanel.jsx": 2,
  "components/SpatialAnalysis.jsx": 2,
  "components/SpectralIndexModal.jsx": 2,
  "modules/viewer/TrendHelper.jsx": 2,
  "components/HyperspectralTab.jsx": 1,
  "components/TableColumnsModal.jsx": 1,
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

test("Grade estimation and the variogram: the clamps are min / max; empty keeps none / fit / cubic / sphere; text state stays text", () => {
  const g = read("components/GradeEstimationModal.jsx");
  assert.match(g, /<NumberInput min="1" value=\{minSamples\} onChange=\{\(n\) => setMinSamples\(n\)\}/);
  assert.match(g, /allowEmpty value=\{Number\.isFinite\(capValue\) \? capValue : null\} onChange=\{\(n\) => \{ const v = n == null \? NaN : n; capClearedFor\.current/);
  assert.match(g, /allowEmpty value=\{hgMin === "" \|\| hgMin == null \? null : hgMin\} onChange=\{\(n\) => setHgMin\(n == null \? "" : String\(n\)\)\}/);
  assert.match(g, /allowEmpty value=\{matched \|\| cellHeight === "" \|\| cellHeight == null \? null : cellHeight\}/);
  assert.match(g, /setMemberCaps\(\(m\) => \(\{ \.\.\.m, \[el\]: x \}\)\); setResult\(null\);/);
  const v = read("components/VariogramModal.jsx");
  assert.match(v, /<NumberInput min="3" max="60" step="1" value=\{nLags\} onChange=\{\(n\) => setNLags\(Math\.round\(n\)\)\}/);
  assert.match(v, /<NumberInput min="1" max="89" value=\{angleTol\} onChange=\{\(n\) => setAngleTol\(n\)\}/);
  assert.match(v, /allowEmpty value=\{planeHalf === "" \|\| planeHalf == null \? null : planeHalf\} placeholder=\{String\(compositeLength\)\} onChange=\{\(n\) => setPlaneHalf\(n == null \? "" : n\)\}/);
});

test("the surface, codes, fitting, long section, catchments, gridding, undrilled zones and solids panes: the same rules", () => {
  const x = read("components/ExplicitSurfacePanel.jsx");
  assert.match(x, /<NumberInput min=\{0\.5\} step=\{0\.5\} value=\{def\.downholeGuide\.windowM \?\? 3\} onChange=\{\(n\) => update\(\{ downholeGuide: \{ \.\.\.def\.downholeGuide, windowM: n \} \}\)\}/);
  assert.match(x, /allowEmpty value=\{def\.margin \?\? null\} placeholder=\{tr\("auto"\)\} onChange=\{\(n\) => update\(\{ margin: n \}\)\}/);
  const m = read("components/ModellingCodesPane.jsx");
  assert.match(m, /allowEmpty value=\{unitBody\.search \|\| null\} placeholder=\{tr\("auto"\)\} onChange=\{\(n\) => setUnitBody\(\(b\) => \(\{ \.\.\.b, search: n \?\? 0 \}\)\)\}/);
  assert.match(m, /setSheetAtt\(\(a\) => \(\{ \.\.\.a, dip: n == null \? "" : String\(n\) \}\)\)/);
  assert.match(read("components/StructFitPanel.jsx"), /set\(\{ bounds: \{ \.\.\.st\.bounds, \[u\.id\]: \{ \.\.\.st\.bounds\?\.\[u\.id\], lo: n == null \? "" : String\(n\) \} \} \}\)/);
  assert.match(read("components/LongSectionGT.jsx"), /onChange=\{\(n\) => \{ setAzText\(n == null \? "" : String\(n\)\); setFig\(null\); \}\}/);
  const c = read("components/CatchmentsPanel.jsx");
  assert.match(c, /<NumberInput min="50" max="99\.9" step="1" value=\{opts\.percentile\} onChange=\{\(n\) => set\(\{ percentile: n \}\)\}/);
  assert.match(c, /allowEmpty value=\{opts\.backgroundValue \?\? null\} onChange=\{\(n\) => set\(\{ backgroundValue: n \|\| null \}\)\}/);
  assert.match(read("components/SampleGridPanel.jsx"), /<NumberInput min="0" max="1" step="0\.05" value=\{tension\} onChange=\{\(n\) => setTension\(n\)\}/);
  assert.match(read("components/UndrilledZonesPane.jsx"), /<NumberInput min="1" step="5" value=\{coverM\} onChange=\{\(n\) => setCoverM\(n\)\}/);
  assert.match(read("components/SurfaceSolidsPanel.jsx"), /style=\{\{ \.\.\.numInput, width: 80, flex: "none" \}\} wrapStyle=\{\{ flex: "none" \}\}/);
});

test("the last small panes; Trends keeps its draft boxes (Escape cancels) and reads them with parseDecimal", () => {
  assert.match(read("modules/viewer/DomainUpdateSection.jsx"), /allowEmpty value=\{fy === "" \|\| fy == null \? null : fy\} onChange=\{\(n\) => setFirstYear\(n == null \? "" : String\(n\)\)\}/);
  assert.match(read("modules/viewer/TrendHelper.jsx"), /onChange=\{\(n\) => \{ setTyped\(\(p\) => \(\{ \.\.\.p, dip: n == null \? "" : String\(n\) \}\)\); setSelId\("typed"\); \}\}/);
  assert.match(read("components/TableColumnsModal.jsx"), /style=\{\{ \.\.\.inp, flex: "none", width: 70 \}\} wrapStyle=\{\{ flex: "none" \}\}/);
  const t = read("components/TrendsPanel.jsx");
  assert.doesNotMatch(t, /type="number"/);
  assert.match(t, /const numOf = \(x\) => \{ const r = parseDecimal\(String\(x \?\? ""\)\); return r\.ok && !r\.empty \? r\.value : NaN; \};/);
  assert.match(t, /const v = numOf\(draft\);/);
  assert.match(t, /const r = \{ max: numOf\(next\.max\), int: numOf\(next\.int\), min: numOf\(next\.min\) \};/);
  assert.match(t, /else if \(e\.key === "Escape"\) setDraft\(null\);/); // the draft is still cancelled with Escape
  assert.equal((t.match(/<input type="text" inputMode="decimal"/g) || []).length, 2);
});
