// TASKS.csv #1828 (review #1646, Kodiak) — the surface samples' Populations list: the lab's bookkeeping columns last and labelled, the
// field descriptors first, header line breaks as spaces
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isLabMetaField, fieldLabel } from "../src/lib/labMetaFields.js";
import { groupOptions } from "../src/lib/thresholds.js";
import { surfaceAttrs } from "../src/lib/geochem.js";

test("lab bookkeeping vs field descriptors (the Kodiak and Woodjam names)", () => {
  for (const k of ["Au ppm AuME-ST43 certificate", "Au ppm AuME-ST43 certificate completed", "Cu ppm ME-ICP61 laboratory", "Digest_Run NA \r\nPb-OG62", "Instr_Seq NA ME-ICP61i", "Pass2mm % CRU-QC", "Rmnd75um % PUL-QC", "Recvd Wt. kg WEI-21", "ag_analysis_code", "ag_cert_num", "au_flag", "uuid", "colour_rgb", "sampled_tstamp"]) assert.ok(isLabMetaField(k), k);
  for (const k of ["Horizon", "Texture", "Target", "Lithology", "Alteration", "Occurrence", "loc_meth", "elev_meth", "purpose", "status", "data_source", "sampled_by", "Lab", "Batch"]) assert.ok(!isLabMetaField(k), k);
  assert.equal(fieldLabel("Digest_Run NA \r\nPb-OG62"), "Digest_Run NA Pb-OG62");
});

test("Populations: the descriptors first, the lab columns after them as their own kind", () => {
  const samples = Array.from({ length: 12 }, (_, i) => ({ medium: "rock", attrs: { Horizon: ["A", "B", "C"][i % 3], "Au ppm AuME-ST43 status": ["done", "pending"][i % 2], Texture: ["fine", "coarse"][i % 2], "Cu ppm ME-ICP61 laboratory": ["Vancouver", "Reno"][i % 2] } }));
  const opts = groupOptions(samples).filter((o) => o.kind === "column" || o.kind === "labmeta");
  assert.deepEqual(opts.map((o) => [o.kind, o.label]), [["column", "Horizon"], ["column", "Texture"], ["labmeta", "Cu ppm ME-ICP61 laboratory"], ["labmeta", "Au ppm AuME-ST43 status"]]); // within each kind the survey-style names (lab, horizon...) first, as before (#1796)
});

test("a header's line break never reaches an attribute key", () => {
  assert.deepEqual(surfaceAttrs({ "Digest_Run NA \r\nPb-OG62": "R12" }, ["Digest_Run NA \r\nPb-OG62"]), { attrs: { "Digest_Run NA Pb-OG62": "R12" } });
});

test("both population pickers label the lab columns", () => {
  for (const f of ["SurfaceAnomalyControls.jsx", "ThresholdToolkit.jsx"]) {
    const s = readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8");
    assert.match(s, /o\.kind === "labmeta" \? tr\("Lab column: \{v\}", \{ v: o\.label \}\)/, f);
  }
});
