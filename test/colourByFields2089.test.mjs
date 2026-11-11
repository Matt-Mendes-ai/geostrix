// TASKS.csv #2089 (review #2013, Woodjam) — 'Colour by' for surface samples: the fields that tell samples apart first; lab bookkeeping,
// one-value and one-per-sample fields after them under their own heading
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { textAttrFieldGroups } from "../src/lib/anomalyMap.js";

test("the Woodjam soils in small: loc_meth / purpose / status first; cert numbers, analysis codes, uuid, tstamp, a constant last", () => {
  const samples = Array.from({ length: 49 }, (_, i) => ({ attrs: {
    loc_meth: ["GPS", "DGPS"][i % 2], purpose: ["soil grid", "infill"][i % 2], status: ["final", "draft"][i % 3 ? 0 : 1],
    ag_cert_num: "KL24267749", ag_analysis_code: "AuME-TL43", uuid: `u-${i}`, sampled_tstamp: `2024-06-${10 + (i % 9)}T10:${i}`, data_source: "ARIS 42648Z", sampled_by: ["JD", "MK"][i % 2],
  } }));
  const g = textAttrFieldGroups(samples);
  assert.deepEqual(g.main, ["loc_meth", "purpose", "sampled_by", "status"]);
  assert.deepEqual(g.other.sort(), ["ag_analysis_code", "ag_cert_num", "data_source", "sampled_tstamp", "uuid"]);
});

test("the select lists the main fields, then an 'Other fields' group", () => {
  const s = readFileSync(new URL("../src/components/SurfaceAnomalyControls.jsx", import.meta.url), "utf8");
  assert.match(s, /attrFields\.main\.map\(/);
  assert.match(s, /<optgroup label=\{tr\("Other fields: lab bookkeeping, one value on every sample, or a different one on each"\)\}>/);
});
