// TASKS.csv #3172 (split from #3014 part b) — Grade-tonnage's 'Density by' offered any block model on the same blocks whose values could fall in
// 1-6 t/m³ (an Fe or Al2O3 grade, a Cu grade in %): only a model named or estimated as a density is offered now.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDensityModel } from "../src/lib/densityFromModel.js";

test("a density by its element, value, column, property or name; a grade is not one", () => {
  const yes = [
    { name: "SG — IDW", params: { element: "SG" } },
    { name: "x", params: { element: "Specific gravity" } }, // a built-in log estimated (its label is the element)
    { name: "x", params: { element: "Density (g/cm3)" } }, // a custom log
    { name: "x", params: { element: "Geotech · DBD" } }, // a custom layer's field
    { name: "Resource model (density)", params: {} }, // an imported attribute: '<file> (<column>)'
    { name: "Resource model (S.G.)" },
    { name: "Imported", property: "density" },
    { name: "Bulk density estimate" },
  ];
  for (const m of yes) assert.equal(isDensityModel(m), true, JSON.stringify(m));
  const no = [
    { name: "Fe — IDW", params: { element: "Fe", unit: "%" } },
    { name: "Al2O3 — ordinary kriging", params: { element: "Al2O3" } },
    { name: "Cu % estimate", params: { element: "Cu" } },
    { name: "Resource model (Au_ppm)" },
    { name: "Sgr shale volume", params: { element: "SGR" } }, // spectral gamma, not SG
    { name: "Bdx", params: {} },
    null,
  ];
  for (const m of no) assert.equal(isDensityModel(m), false, JSON.stringify(m));
});

test("wiring: the density choice keeps only density models (besides the same lattice and not the set's other elements)", () => {
  const g = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(g, /import \{ sameLattice, densityFromModel, DENSITY_RANGE, isDensityModel \} from "\.\.\/lib\/densityFromModel\.js";/);
  assert.match(g, /const densityModels = useMemo\(\(\) => \(latticeOf \? voxelModels\.filter\(\(m\) => [^\n]*isDensityModel\(m\) \/\* #3172 \*\/ && sameLattice\(blockModelLattice\(m\), latticeOf\)\)/);
});
