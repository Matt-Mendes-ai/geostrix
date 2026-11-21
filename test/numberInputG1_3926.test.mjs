// TASKS.csv #3926 (G1 of the rollout plan: grades, cut-offs, thresholds, densities, detection limits) — these files read a typed number through NumberInput ('0,05' and '0.05'),
// not <input type="number"> (a comma there is silently dropped). Source-matching: no number box is left in a converted file, each one imports NumberInput, and a box
// that may be left empty says so (allowEmpty), so an empty entry still means 'no value'. The behaviour of the component itself is test/numberInput3926.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const DONE = [
  "src/components/AssayStyleModal.jsx", "src/components/BestIntercepts.jsx", "src/components/CompositingModal.jsx",
  "src/components/DataQCModal.jsx", "src/components/DomainCaps.jsx", "src/components/DownholeLogsPane.jsx", "src/components/EndInOreList.jsx",
  "src/components/EquivalentBuilder.jsx", "src/components/FlatPanels.jsx", "src/components/GradeStatistics.jsx", "src/components/GradeThicknessModal.jsx", "src/components/GradeTonnageModal.jsx",
  "src/components/EvidenceOverlayPane.jsx",
  "src/components/HoleValueGridPanel.jsx", "src/components/IsoconTool.jsx", "src/components/LayerInspector.jsx", "src/components/LayerStyleModal.jsx", "src/components/LogChannelsBox.jsx", "src/components/MineralPercentBox.jsx",
  "src/components/NumericSymbologyEditor.jsx", "src/components/OxideTotalsTab.jsx", "src/components/QAQCPanel.jsx", "src/components/SurfaceQaqcPanel.jsx",
];

test("#3926 G1: converted files have no <input type=\"number\"> left and import NumberInput", () => {
  for (const f of DONE) {
    const s = src(f);
    assert.ok(!/<input[^>]*type=\{?["']number["']/.test(s) && !/<input\s*\n[^>]*type="number"/.test(s), `${f}: a number input is left`);
    assert.match(s, /import NumberInput from "\.{1,2}\/(?:\.\.\/components\/)?NumberInput\.jsx"/, `${f}: import`);
    assert.ok((s.match(/<NumberInput /g) || []).length >= 1, f);
  }
});

test("#3926 G1: no step=\"any\" is passed on (the arrow keys use a numeric step), and an emptiable box says allowEmpty", () => {
  for (const f of DONE) {
    const s = src(f);
    assert.ok(!/<NumberInput [^>]*step="any"/.test(s), `${f}: step any`);
  }
  const bi = src("src/components/BestIntercepts.jsx");
  assert.match(bi, /<NumberInput allowEmpty min="0" value=\{includeCutoff === "" \? null/);
  assert.match(bi, /<NumberInput allowEmpty min="0" value=\{topCutKept === "" \? null/);
});
