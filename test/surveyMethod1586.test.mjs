// TASKS.csv #1586 (review #1497, Lawyers) — GEM walk-VLF ip_21p4 / op_21p4 are VLF in-phase / quadrature, not IP chargeability;
// GEM walk-mag rawmag / cormag / rawmag_dc are magnetics; the file's instrument and column set are read before the words;
// the diurnal correction is offered for a magnetic (or unnamed) channel only
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SURVEY_METHODS, guessSurveyMethod, guessSurveyMethodFrom, fileHints, diurnalApplies } from "../src/lib/geophysSurveys.js";

const VLF_COLS = ["X", "Y", "elev", "sat", "time", "station", "f_21p4", "ip_21p4", "op_21p4", "h1_21p4", "f_25p2", "ip_25p2", "op_25p2", "pT_25p2"];
const GEM = "Gem Systems GSM-19WV 5026975 v7.0 6 V 2019 M ewv6flu..v7o";

test("the VLF channels by their own names, with or without the column set", () => {
  assert.equal(guessSurveyMethod("ip_21p4"), "vlf_inphase");
  assert.equal(guessSurveyMethod("op_21p4"), "vlf_quad");
  assert.equal(guessSurveyMethod("ip_21p4", { columns: VLF_COLS }), "vlf_inphase");
  assert.equal(guessSurveyMethod("op_25p2", { columns: VLF_COLS }), "vlf_quad");
  assert.equal(guessSurveyMethod("tilt_21p4", { columns: VLF_COLS }), "vlf_tilt");
  assert.equal(guessSurveyMethod("ip"), "ip"); // a plain IP chargeability column still is one
  assert.equal(guessSurveyMethod("chargeability_mvv"), "ip");
  assert.deepEqual(SURVEY_METHODS.vlf_inphase, { label: "VLF-EM: in-phase", units: "%", group: "em" });
  assert.deepEqual(SURVEY_METHODS.vlf_quad, { label: "VLF-EM: quadrature", units: "%", group: "em" });
});

test("GEM magnetics columns, and a magnetometer header for a column the words cannot name", () => {
  for (const h of ["rawmag", "cormag", "rawmag_dc", "cormag_dc", "mag_dc"]) assert.equal(guessSurveyMethod(h), "mag", h);
  assert.equal(guessSurveyMethod("field", { instrument: GEM }), "mag");
  assert.equal(guessSurveyMethod("field"), null); // without the header, unknown
  assert.equal(guessSurveyMethod("sq", { instrument: GEM }), null); // the signal-quality column is not the field
  assert.deepEqual(fileHints({ instrument: GEM, columns: VLF_COLS }), { magnetometer: true, vlfSet: true, mtSet: false }); // mtSet: #3323
  assert.deepEqual(fileHints({ instrument: "Scintrex CG-5", columns: ["x", "y", "boug"] }), { magnetometer: false, vlfSet: false, mtSet: false });
  assert.equal(guessSurveyMethodFrom("value", ["rawmag"], { instrument: GEM }), "mag");
});

test("the diurnal correction is a magnetics step", () => {
  assert.equal(diurnalApplies("rawmag"), true);
  assert.equal(diurnalApplies("rawmag_dc"), true);
  assert.equal(diurnalApplies("field", { instrument: GEM }), true);
  assert.equal(diurnalApplies("reading"), true); // unnamed: offered, the user knows
  assert.equal(diurnalApplies("ip_21p4", { columns: VLF_COLS }), false);
  assert.equal(diurnalApplies("boug"), false);
  assert.equal(diurnalApplies("eth_ppm"), false);
});

test("the picker passes the file's instrument and columns, and shows the diurnal box only when it applies", () => {
  const s = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.equal((s.match(/\{ instrument: xyzPending\.header\?\.instrument, columns: xyzPending\.columns \}/g) || []).length, 4);
  assert.match(s, /!xyzPending\.batch && diurnalApplies\(xyzPending\.valueCol/);
  assert.match(s, /xyzPending\.source !== "csv" && diurnalApplies\(xyzPending\.valueCol/);
});
