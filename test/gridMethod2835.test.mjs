// TASKS.csv #2835 / #2842 (GSC geophysics review) — an imported grid had no method and nowhere to state one: RTP ran on EM conductance, a TEM
// decay constant, eU and a Bouguer grid. The card now has 'This grid is' (raster.surveyMethod, so #2557's blocking applies), a guess from the
// name / unit is offered, and the field filters wait for the method or a tick on a grid of unknown method.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessRasterMethod, filterBlockedBy, rasterMethodOf, fieldFilterNeedsMethod } from "../src/lib/rasterMethod.js";

test("the guess, from the typed unit first, then the name (offered, not set)", () => {
  const g = (name, unit = "") => guessRasterMethod({ name, unit });
  assert.equal(g("bathurst_megatem_all_cond.GRD"), "em_cond");
  assert.equal(g("bathurst_megatem_all_tau_x7_20.GRD"), "em_tau");
  assert.equal(g("Athabasca_URA.GRD"), "rad_u");
  assert.equal(g("BR_bou_2009_geosoft.GRD"), "grav");
  assert.equal(g("bathurst_megatem_all_mag_res.GRD"), "mag"); // a residual magnetic grid, not resistivity
  assert.equal(g("dcip_res_slice.tif"), "res");
  assert.equal(g("grid_7.tif", "mGal"), "grav");
  assert.equal(g("grid_7.tif", "nT"), "mag");
  assert.equal(g("survey.tif"), null);
});

test("once set, #2557's rules apply to an imported grid", () => {
  const r = { name: "BR_bou_2009_geosoft.GRD", surveyMethod: "grav" };
  assert.equal(rasterMethodOf(r, {}), "grav");
  assert.equal(filterBlockedBy("rtp", rasterMethodOf(r, {})), "magnetic");
  assert.equal(filterBlockedBy("vd1", rasterMethodOf(r, {})), null);
  assert.equal(filterBlockedBy("rtp", rasterMethodOf({ surveyMethod: "em_cond" }, {})), "potential");
  assert.equal(fieldFilterNeedsMethod("rtp"), true);
  assert.equal(fieldFilterNeedsMethod("upward"), false);
});

test("the card offers 'This grid is' and the guess; the filter form waits for the method or a tick", () => {
  const c = readFileSync(new URL("../src/components/RasterColourControls.jsx", import.meta.url), "utf8");
  assert.match(c, /\{!r\.provenance\?\.survey && !r\.geochem && !r\.terrainDerivative && \(\(\) => \{/);
  assert.match(c, /onChange=\{\(e\) => onUpdate\(r\.id, \{ surveyMethod: e\.target\.value \|\| null \}\)\}/);
  assert.match(c, /tr\("From its name or unit it looks like \{method\}\."/);
  const m = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(m, /const unknownNeedsTick = \(r\) => !rasterMethodOf\(r, geophysSurveys\) && fieldFilterNeedsMethod\(filt\.kind\) && !assumeField\[r\.id\];/);
  assert.match(m, /disabled=\{filtering \|\| !!filterBlockedBy\(filt\.kind, rasterMethodOf\(r, geophysSurveys\)\) \|\| unknownNeedsTick\(r\) \/\* #2835 \*\/\}/);
  assert.match(m, /if \(unknownNeedsTick\(r\)\) return;/);
});
