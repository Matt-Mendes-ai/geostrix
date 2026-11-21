// TASKS.csv #3926 group G4 — geophysics method and inversion parameters: the number boxes read '0,05' as 0.05 (components/NumberInput.jsx), a box
// that kept its text in state still gets text (an empty one stays empty: 'not set' as before), a min / max is kept with a plain line, and a box that
// parsed at once gets the number.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// files whose number boxes are all G4 (none left as <input type="number">)
const DONE = ["components/InversionPanel.jsx", "components/TemInvertPanel.jsx", "modules/GeophysicsModule.jsx",
  "components/DcipPanel.jsx", "components/Dcip3dArrayPanel.jsx", "components/Dcip3dPanel.jsx", "components/DcipMergePanel.jsx",
  "components/FdemPane.jsx", "components/TemPane.jsx", "modules/RasterModule.jsx", "components/EqsGridBox.jsx", "components/GravityReductionBox.jsx", "components/LevellingPanel.jsx"];
const imp = (f) => (f.startsWith("modules/") ? /import NumberInput from "\.\.\/components\/NumberInput\.jsx";/ : /import NumberInput from "\.\/NumberInput\.jsx";/);

test("#3926 G4 every number box in these files is a NumberInput", () => {
  for (const f of DONE) {
    const s = read(f);
    assert.match(s, imp(f), f);
    assert.doesNotMatch(s, /<input[^>]*type="number"/, f);
    assert.match(s, /<NumberInput\s/, f);
  }
});

test("#3926 G4 text kept in state stays text, an empty box stays empty (the [k, l] map helpers too)", () => {
  const inv = read("components/InversionPanel.jsx");
  assert.match(inv, /<NumberInput allowEmpty value=\{field\[k\]\} onChange=\{\(v\) => setField\(\(p\) => \(\{ \.\.\.p, \[k\]: \(v == null \? "" : String\(v\)\), source: "entered by user" \}\)\)\}/);
  assert.match(inv, /<NumberInput allowEmpty value=\{plate\[k\]\} onChange=\{\(v\) => setPlate\(\(p\) => \(\{ \.\.\.p, \[k\]: \(v == null \? "" : String\(v\)\) \}\)\)\}/);
  assert.match(inv, /<NumberInput allowEmpty min=\{1\} value=\{planned\.line\}/);
  assert.match(inv, /<NumberInput allowEmpty min=\{0\} max=\{1\} step=\{0\.01\} value=\{adv\.supportCutoff\}/);
  const tem = read("components/TemInvertPanel.jsx");
  assert.match(tem, /<NumberInput min=\{0\.01\} value=\{st\.wave\[k\]\.onMs\} onChange=\{\(v\) => setWave\(k, \{ onMs: v \}\)\}/, "parsed at once: the number, its min kept (an empty entry no longer stores 0)");
  assert.match(tem, /<NumberInput min=\{0\} value=\{st\.wave\[k\]\.rampUs\} onChange=\{\(v\) => setWave\(k, \{ rampUs: v \}\)\}/);
});

test("#3926 G4 GeophysicsModule: silent clamps are min / max with the plain line; the azimuth still wraps; the contour interval still says its raise", () => {
  const g = read("modules/GeophysicsModule.jsx");
  assert.match(g, /<NumberInput min=\{0\.5\} step=\{0\.5\} value=\{idwPower\} onChange=\{\(v\) => setIdwPower\(v\)\}/, "Number(x) || 2 -> v, with a min that blocks 0");
  assert.match(g, /<NumberInput min=\{0\} max=\{1\} step=\{0\.05\} value=\{idwTension\}/);
  assert.match(g, /<NumberInput min=\{1\} max=\{90\} value=\{hillshadeAltitude\}/);
  assert.match(g, /onChange=\{\(v\) => setHillshadeAzimuth\(\(v % 360 \+ 360\) % 360\)/);
  assert.match(g, /<NumberInput min=\{0\} max=\{99\} step=\{1\} value=\{xyzPending\.minQuality \?\? 50\}/);
  assert.match(g, /allowEmpty min=\{MIN_CELL_BUDGET\} max=\{MAX_BLOCK_MODEL_BUDGET\} step=\{10000\}\n\s+value=\{voxelCellBudget \?\? MAX_CELLS\}\n\s+onChange=\{\(v\) => setVoxelCellBudget\(v\)\}/, "empty: the default, as before");
  assert.match(g, /const effectiveMaxCells = clampCellBudget\(voxelCellBudget\) \|\| MAX_CELLS;/, "still clamped on use");
  assert.match(g, /<NumberInput min=\{2\} max=\{64\} step=\{1\} value=\{classCount\} onChange=\{\(v\) => setClassCount\(Math\.round\(v\)\)\}/);
});

test("#3926 G4 the last files: Number(x) || d became v only behind a min that blocks 0", () => {
  assert.match(read("components/FdemPane.jsx"), /<NumberInput style=\{num\} min=\{1\} step=\{1\} value=\{s\.every\}[^\n]*onChange=\{\(v\) => set\(\{ every: Math\.round\(v\) \}\)\}/);
  assert.match(read("components/LevellingPanel.jsx"), /<NumberInput min=\{1\} step=\{5\} value=\{radiusM\} onChange=\{\(v\) => setRadiusM\(v\)\}/);
  assert.match(read("modules/RasterModule.jsx"), /<NumberInput value=\{Math\.round\(r\.elevation\)\}[^\n]*onChange=\{\(v\) => updateRaster\(r\.id, \{ elevation: v \}\)\}/);
});

test("#3926 G4 a handler whose updater names its own `v` takes the typed value under another name (the level set's step, from and to)", () => {
  const g = read("modules/GeophysicsModule.jsx");
  for (const k of ["step", "lo", "hi"]) assert.ok(g.includes(`onChange={(t) => setLevelSet((v) => ({ ...v, ${k}: (t == null ? "" : String(t)) }))}`), k);
  assert.ok(!/onChange=\{\(v\) => set[A-Za-z]+\(\(v\) =>/.test(g), "no handler parameter shadowed by its updater's");
});
