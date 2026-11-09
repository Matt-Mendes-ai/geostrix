// TASKS.csv #2153 / #2184 (WA drillhole review, WA gold review) — a geology log with a primary lithology column is a lithology log before
// its mineral / alteration columns are read; WAMEX alteration, vein and density names are recognized.
import test from "node:test";
import assert from "node:assert/strict";
import { guessTarget, guessMapping } from "../src/lib/layers.js";
const g = (h) => { const t = guessTarget(h); const m = guessMapping(t, h); return [t, m.value, m.intensity || ""]; };
const H = ["Hole_ID", "From", "To"];

test("#2153 lithology first: Lithology1 / Lith1 / GEOL_Rock1 / Maj Lithcode beside mineral columns", () => {
  assert.deepEqual(g([...H, "Lithology1", "Lithology2", "Colour1", "Min1_Type", "Alt1_Mineral", "Alt1_Intensity", "GeolComments"]).slice(0, 2), ["litho", "Lithology1"]);
  assert.deepEqual(g([...H, "Lith1", "Min1_Type", "Mineral_Pct"]).slice(0, 2), ["litho", "Lith1"]);
  assert.deepEqual(g([...H, "GEOL_Rock1", "Mineralisation"]).slice(0, 2), ["litho", "GEOL_Rock1"]);
  assert.deepEqual(g([...H, "Maj Lithcode", "Minerals"]).slice(0, 2), ["litho", "Maj Lithcode"]);
  assert.deepEqual(g([...H, "Rock1"]).slice(0, 2), ["litho", "Rock1"]);
});

test("#2153 / #2184 alteration named by mineral or style; switched to Alteration, geology_4's value is Alt1_Mineral", () => {
  assert.deepEqual(g([...H, "Alt1_Mineral", "Alt1_Intensity", "Alt1_Style"]), ["alt", "Alt1_Mineral", "Alt1_Intensity"]);
  assert.deepEqual(g([...H, "AltN1", "Alt1_Int"]), ["alt", "AltN1", "Alt1_Int"]);
  const geology4 = [...H, "Lithology1", "Lithology2", "Colour1", "Min1_Type", "Alt1_Mineral", "Alt1_Intensity", "GeolComments"];
  assert.equal(guessMapping("alt", geology4).value, "Alt1_Mineral");
  assert.equal(guessMapping("alt", geology4).intensity, "Alt1_Intensity");
});

test("#2153 veins, density readings and the cases that did not change", () => {
  assert.deepEqual(g([...H, "Veins", "Vein1_Width"]).slice(0, 2), ["vein", "Veins"]);
  assert.deepEqual(g([...H, "Vein2_Code", "Vein1_Width"]).slice(0, 2), ["vein", "Vein2_Code"]);
  assert.deepEqual(g([...H, "Weight_Wet", "Weight_Dry", "Reading"]).slice(0, 2), ["sg", "Reading"]);
  assert.deepEqual(g([...H, "Min1_Code", "Min1_Pct"]).slice(0, 2), ["mnlgy", "Min1_Code"]);
  assert.deepEqual(g([...H, "Alt1_Code", "Lithology1"]).slice(0, 2), ["alt", "Alt1_Code"]); // a coded alteration log stays alteration
  assert.deepEqual(g([...H, "Mineral", "Percent"]).slice(0, 2), ["mnlgy", "Mineral"]);
});
