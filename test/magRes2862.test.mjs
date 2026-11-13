// TASKS.csv #2862 (review GSC geophysics) — 'bathurst_megatem_all_mag_res.GRD' (the residual magnetic field) opened the filter form on upward
// continuation: 'res' was read as resistivity and beat the magnetic word. Now a magnetic word wins over 'res', and the form says the guess.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { defaultFilterKind, magneticsFromName } from "../src/lib/filterDefault.js";
test("a magnetic word beats 'res'", () => {
  for (const n of ["bathurst_megatem_all_mag_res.GRD", "tmi_res.tif", "res_mag.grd", "Area_TMI_res_25m.tif"]) assert.equal(defaultFilterKind({ name: n }), "rtp", n);
  for (const n of ["Res_100_geo.tif", "mag_resistivity.tif", "mag_grav_joint.tif", "Chg_z1445_float.tif"]) assert.equal(defaultFilterKind({ name: n }), "upward", n);
  assert.equal(magneticsFromName({ name: "x_mag_res.grd" }), true);
  assert.equal(magneticsFromName({ name: "x_mag_res.grd" }, "mag"), false, "a method set: not a guess");
  assert.equal(magneticsFromName({ name: "dem.tif" }), false);
  assert.ok(fs.readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8").includes('filt.kind === "rtp" && magneticsFromName(r, rasterMethodOf(r, geophysSurveys))'));
});
