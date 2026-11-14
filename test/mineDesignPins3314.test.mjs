// TASKS.csv #3311, #3314, #3326, #3327, #3328 (review Galore Creek, Mine Design): the pane wiring (the logic is tested in pitPricedAlso3311,
// pitGround3313, designDepth3316, pitCutoffUnits3318 and stopeGround2438).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3311 a 'report too' grade can be priced; the run, the saved pit and the downstream panes carry it", () => {
  const s = read("../src/components/PitShellPane.jsx");
  assert.match(s, /const alsoPrices = alsoChosen\.map\(alsoPriceOf\);/);
  assert.match(s, /by: byInputs, alsoPrices \/\* #3311 \*\/, typedCutoff: typedCut/);
  assert.match(s, /if \(alsoPrices\.some\(Boolean\)\) \{ inputs\.alsoPrices = alsoPrices; runInputs\.alsoPrices = alsoPrices; \}/);
  assert.match(s, /pricing: alsoPrices\[k\], containedMetal:/);
  assert.match(read("../src/components/NestedPitsPane.jsx"), /const alsoPrices = alsoPairs\.map\(\(\{ g \}\) => g\.pricing \|\| null\);/);
  assert.match(read("../src/components/PitDesignPane.jsx"), /economics: \(byIn && byModel\) \|\| alsoPrices\.some\(Boolean\) \?/);
});

test("#3314 the model's blocks outside a Pit area go in as waste (grade 0), within the walls' reach, and the pane says so", () => {
  const s = read("../src/components/PitShellPane.jsx");
  assert.match(s, /cells\.push\(\{ \.\.\.c, value: 0, areaOut: true \}\)/);
  assert.match(s, /coded = modelWithCodeDensity\(areaWithWaste\(model\),/);
  assert.match(s, /const byIn = clip\(byModel\)/, "the by-product stays clipped: no outside block earns revenue");
  assert.match(s, /res\.areaOutBlocks > 0 && <div style=\{note\}>/);
});

test("#3317 a massive body is named as one; seam panels only for a flat one", () => {
  const s = read("../src/components/StopesPane.jsx");
  assert.match(s, /\{flat\?\.massive && <div style=\{warn\}>\{tr\("A massive body:/);
  assert.match(s, /\{flat\?\.flat && <FlatPanels/);
});

test("#3326 the series table at its own width, units in its headers, the typed cut-off / limit / cells said, unchanged shells told apart", () => {
  const s = read("../src/components/NestedPitsPane.jsx");
  assert.match(s, /width: "max-content", minWidth: "100%"/);
  assert.match(s, /u = g\.unit \? gradeUnitText\(g\.unit, g\.element \|\| l\) : ""; return u \? `\$\{l\} \(\$\{u\}\)` : l;/);
  assert.match(s, /The series keeps the shell's \{list\}\./);
  assert.match(s, /sameShells\(runs\) \? tr\("The shells barely change with the factor/);
});

test("#3327 the line's start takes the ground it is checked against; #3328 small slips", () => {
  const d = read("../src/components/DesignLinesPane.jsx");
  assert.match(d, /const groundAt = \(x, y\) => \{ const g = terrain \? terrainGroundAt\(terrain, x, y\) : collarSurf \? collarSurf\(x, y\) : nearestZ\(collars, x, y\);/);
  assert.match(d, /const g = s\.line\.start\.zAuto \? s\.groundAt\(p\[0\], p\[1\]\) : null;/);
  assert.match(d, /Start Z taken from the ground interpolated between the collars \(the nearest collar is \{d\} m away\)\./);
  const s = read("../src/components/PitShellPane.jsx");
  assert.match(s, /\{!typedCut && <div style=\{note\}>\{tr\("A block is ore when its revenue over both metals/, "(4)");
  assert.match(s, /const orePitsOf = \(r\) => \(r\?\.parts\?\.pits \|\| \[\]\)\.filter\(\(p\) => p\.oreT > 0\);/, "(2)");
  assert.match(read("../src/components/DesignStringsPane.jsx"), /u && el \? gradeWithElement\(g, u, el\)/, "(3)");
});
