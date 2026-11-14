// TASKS.csv #3286 (Galore Creek review) — small slips in the Grade tools: one unit, one spacing and one wording per thing. Items (1)-(5), (7),
// (8) here; (6) the 3D legend and (9) the evaluated layer are in other sessions' files; (10) #3109, (11) #3082; (12) a residual rule is a feature.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { numericTrackSources } from "../src/lib/fenceTrack.js";

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("(1) back to Assays, the remembered element; (5) the set's other elements added hidden, said; (8) 'no variogram' for the method chosen", () => {
  const m = src("components/GradeEstimationModal.jsx");
  assert.match(m, /setSourceKey\(k\); if \(s\) setSymbolRaw\(s\.symbol\); else setSymbol\(preferredElement\(\(assayElementsProp \|\| \[\]\)\.map\(\(x\) => x\.symbol\), "estimate", lead\) \|\| assayElementsProp\[0\]\?\.symbol \|\| "Au"\);/); // found live: setSymbol remembered the log's name
  assert.ok(!m.includes('setSymbol(s ? s.symbol : (assayElementsProp[0]?.symbol || "Au"))'));
  assert.match(m, /cells: m\.cells, \.\.\.rampOf\(m\.cells\), params: m\.params, visible: false \}\);/);
  assert.match(m, /\{added && result\.params\?\.set && <span[^>]*>\{tr\("\{el\} is shown; the set's other elements are added hidden/);
  assert.match(m, /tr\("no declustering, no variogram \(the method chosen uses none; ordinary kriging does\), and no resource classification\./);
});

test("(3) gold, silver and palladium in g/t in the Fence track and the Block models list", () => {
  const tracks = numericTrackSources({ assays: [{ hole_id: "H", from: 0, to: 1, values: { Au: 1.2, Cu: 3000 } }], assayElements: [{ symbol: "Au", unit: "ppm" }, { symbol: "Cu", unit: "ppm" }], layers: {}, customLayers: [] });
  const au = tracks.find((t) => t.key === "assay:Au"), cu = tracks.find((t) => t.key === "assay:Cu");
  if (au) assert.equal(au.label, "Au (g/t)");
  if (cu) assert.equal(cu.label, "Cu (ppm)");
  assert.ok(au || cu, JSON.stringify(tracks.map((t) => t.key)));
  assert.match(src("modules/GeophysicsModule.jsx"), /unit: gradeUnitLabel\(model\.params\.element, model\.params\.unit\) \/\* #3286 \(3\) \*\//);
});

test("(2) the shell's spacing is Estimation's; (4) gold's metal named for it; (7) coverage in %", () => {
  assert.match(src("modules/viewer/modellingRuns.js"), /const gsSpacing = \(await import\("\.\.\/\.\.\/lib\/holeSpacing\.js"\)\)\.holeSpacingSummary\(gsCollars\)\?\.medianM \|\| autoHaloParams\(gsCollars, tracesRef\.current \|\| null\)\.spacing;/);
  const g = src("components/GradeTonnageModal.jsx");
  assert.equal((g.match(/\{element \? memberMetalLabel\(c, element\) : tr\(c\.label, c\.args\)\}/g) || []).length, 2);
  const v = src("components/VariogramModal.jsx");
  assert.match(v, /\{tr\("Min coverage \(%\)"\)\}<input type="number" min="0" max="100" step="1" value=\{Math\.round\(minCoverage \* 100\)\}/);
  assert.ok(!v.includes('tr("Min coverage (0-1)")'));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["{el} is shown; the set's other elements are added hidden: they share the blocks, so show one at a time.", "Min coverage (%)"]) assert.ok(d[k], `${l}: ${k}`);
    assert.ok(Object.keys(d).some((k) => k.startsWith("no declustering, no variogram (the method chosen uses none; ordinary kriging does)")), l);
  }
});
