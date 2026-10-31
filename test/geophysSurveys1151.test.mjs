// TASKS.csv #1151 — the survey types: the old keys unchanged, every entry complete, and a method read from a column header.
import test from "node:test";
import assert from "node:assert/strict";
import { SURVEY_METHODS, SURVEY_METHOD_GROUPS, guessSurveyMethod, methodIsInvertible, surveyExportRows } from "../src/lib/geophysSurveys.js";

test("#1151 the first nine keys saved projects use are still there, and every method has a label, units and a group", () => {
  for (const k of ["mag", "grav", "rad_k", "rad_th", "rad_u", "rad_tc", "ip", "res", "other"]) assert.ok(SURVEY_METHODS[k], k);
  assert.equal(SURVEY_METHODS.mag.label, "Magnetics (TMI)");
  assert.equal(SURVEY_METHODS.res.units, "Ω·m");
  for (const [k, m] of Object.entries(SURVEY_METHODS)) {
    assert.ok(m.label && typeof m.units === "string" && SURVEY_METHOD_GROUPS[m.group], k);
  }
  assert.ok(Object.keys(SURVEY_METHODS).length >= 25);
  for (const g of Object.keys(SURVEY_METHOD_GROUPS)) assert.ok(Object.values(SURVEY_METHODS).some((m) => m.group === g), g);
});

test("#1151 only the measured fields are inverted: a derivative or an EM channel is not", () => {
  assert.equal(methodIsInvertible("mag"), true);
  assert.equal(methodIsInvertible("grav"), true);
  for (const k of ["mag_rtp", "mag_1vd", "mag_as", "grav_fa", "em_cond", "rad_k", "ip", undefined]) assert.equal(methodIsInvertible(k), false, k);
});

test("#1151 a method from the value column's header", () => {
  const cases = [["TMI_nT", "mag"], ["Raw_Mag_nT", "mag"], ["RTP", "mag_rtp"], ["Mag_1VD", "mag_1vd"], ["AS_nT_m", "mag_as"],
    ["Bouguer_mGal", "grav"], ["FreeAir", "grav_fa"], ["Gzz_Eo", "grav_gzz"], ["K_pct", "rad_k"], ["eTh_ppm", "rad_th"], ["eU", "rad_u"], ["Total_Count_cps", "rad_tc"], ["U_Th", "rad_uth"],
    ["Cond_mSm", "em_cond"], ["Apparent conductivity", "em_cond"], ["InPhase_ppm", "em_inphase"], ["Quad_ppm", "em_quad"], ["dBdt_ch12", "em_dbdt"], ["Tau_ms", "em_tau"], ["VLF_tilt", "vlf_tilt"], ["Tzx_inphase", "ztem_tipper"], ["RhoA", "mt_rho"],
    ["Chargeability_mVV", "ip"], ["IP", "ip"], ["Resistivity_ohmm", "res"], ["SP_mV", "sp"],
    ["dip", null], ["Kelvin", null], ["Easting", null], ["", null]];
  for (const [h, m] of cases) assert.equal(guessSurveyMethod(h), m, h);
});

test("#1151 the CSV value column keeps a readable name for the new units", () => {
  assert.equal(surveyExportRows([{ x: 1, y: 2, z: 3, value: 4 }], { method: "em_cond", units: "mS/m" }).valueName, "em_cond_mSm");
  assert.equal(surveyExportRows([{ x: 1, y: 2, z: 3, value: 4 }], { method: "grav_gzz", units: "Eö" }).valueName, "grav_gzz_E");
});
