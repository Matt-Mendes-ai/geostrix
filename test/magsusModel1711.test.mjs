// TASKS.csv #1711 — Copley's magsus_blockmodel.csv (attribute MAGSUS) was read as a grade: Grade-tonnage gave 'mean grade 3.32' and offered
// the SG layer's mean for tonnes. Since #1786 a CSV block model has the 'Values are' picker and a name read as a physical property hides
// Grade-tonnage; 'magsus' / 'magsusc' were not read as susceptibility.
import test from "node:test";
import assert from "node:assert/strict";
import { guessVoxelProperty } from "../src/lib/voxelProperty.js";
import { offersGradeTonnage } from "../src/lib/gradeTonnage.js";

const PROPS = ["Conductivity (S/m)", "Resistivity (ohm·m)", "Chargeability (mV/V)", "Chargeability (ms)", "Susceptibility (SI)", "Density (g/cc)", "Density contrast (g/cc)"];

test("magsus, magsusc and msusc names read as susceptibility; 'mag' alone and grade names do not", () => {
  assert.equal(guessVoxelProperty("magsus_blockmodel", "MAGSUS"), "Susceptibility (SI)");
  assert.equal(guessVoxelProperty("block", "MagSusc"), "Susceptibility (SI)");
  assert.equal(guessVoxelProperty("copley_msusc_idw"), "Susceptibility (SI)");
  assert.equal(guessVoxelProperty("mag_tmi_model"), null);
  assert.equal(guessVoxelProperty("cu_estimate", "CU_PCT"), null);
  assert.equal(guessVoxelProperty("magnesium_model", "MgO"), null);
});

test("a susceptibility CSV model offers no Grade-tonnage; a grade CSV model still does", () => {
  const sus = { source: "csv", property: guessVoxelProperty("magsus_blockmodel", "MAGSUS"), cells: [{ value: 1 }], attribute: "MAGSUS" };
  const geophys = (p) => PROPS.includes(p);
  assert.equal(offersGradeTonnage(sus, { geophysProperty: geophys }), false);
  const cu = { source: "csv", property: guessVoxelProperty("cu_estimate", "CU_PCT"), cells: [{ value: 1 }], attribute: "CU_PCT" };
  assert.equal(cu.property, null);
});
