// TASKS.csv #2154 / #2187 — the north read from the azimuth column's NAME (Azimuth_MAG, AMG_AZIMUTH, Azimuth_UTM, MGA_Azimuth) and from
// AZIMUTHGRIDNAME; two named azimuth columns are listed and asked; a survey's method column is kept; upholes and unsurveyed holes said.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectAzimuthRef } from "../src/lib/azimuthRef.js";
import { surveyMethodFields } from "../src/lib/viewer/autoExtras.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const one = (h, v) => detectAzimuthRef(h, [Object.fromEntries(h.map((k, i) => [k, v[i]]))]);

test("#2154 north from the column name", () => {
  assert.deepEqual(one(["HoleID", "Depth", "Azimuth_MAG", "Dip"], [1, 10, 45, -60]), { ref: "magnetic", col: "Azimuth_MAG", mixed: false, azimuthCol: "Azimuth_MAG" });
  for (const c of ["AMG_AZIMUTH", "Azimuth_UTM", "MGA_Azimuth", "GDA94_Azi", "Azimuth_Grid"]) assert.equal(one(["HoleID", "Depth", c, "Dip"], [1, 10, 45, -60]).ref, "grid", c);
  assert.equal(one(["HoleID", "Depth", "Azimuth_TRUE", "Dip"], [1, 10, 45, -60]).ref, "true");
  assert.equal(one(["HoleID", "Depth", "Azimuth", "Dip"], [1, 10, 45, -60]), null); // a plain name says nothing, as before
});

test("#2154 AZIMUTHGRIDNAME: a grid name means grid north; a north word is read; a true / magnetic column's name wins", () => {
  assert.deepEqual(one(["HoleID", "Depth", "Azimuth", "Dip", "AZIMUTHGRIDNAME"], [1, 10, 45, -60, "MGA94_51"]), { ref: "grid", col: "AZIMUTHGRIDNAME", mixed: false });
  assert.equal(one(["HoleID", "Depth", "Azimuth", "Dip", "AZIMUTHGRIDNAME"], [1, 10, 45, -60, "TRUE"]).ref, "true");
  assert.equal(one(["HoleID", "Depth", "Azimuth_MAG", "Dip", "AZIMUTHGRIDNAME"], [1, 10, 45, -60, "AMG84_51"]).ref, "magnetic");
  assert.equal(one(["HoleID", "Depth", "Azimuth", "Dip", "AZIMUTHGRIDNAME"], [1, 10, 45, -60, ""]), null);
});

test("#2154 two named azimuth columns: the first (grid, true, magnetic) is read and the other listed; a plain Azimuth is not a rival", () => {
  const d = one(["HoleID", "Depth", "Azimuth_MAG", "Azimuth_TRUE", "Dip"], [1, 10, 45, 46, -60]);
  assert.equal(d.azimuthCol, "Azimuth_TRUE"); assert.deepEqual(d.also, [{ col: "Azimuth_MAG", ref: "magnetic" }]);
  assert.equal(one(["HoleID", "Depth", "Azimuth", "Azimuth_TRUE", "Dip"], [1, 10, 45, 46, -60]).also, undefined);
});

test("#2187 a survey's method / surveyor column is kept as an extra field", () => {
  const rows = [{ SURVTYPE: "GYRO", SurveyBy: "ABC", DEPTH: 10 }, { SURVTYPE: "REFLEX", SurveyBy: "", DEPTH: 20 }];
  assert.deepEqual(surveyMethodFields(["HOLEID", "DEPTH", "SURVTYPE", "AMG_AZIMUTH", "DIP", "SurveyBy", "Survey_Method"], rows).map((f) => f.column), ["SURVTYPE", "SurveyBy"]); // Survey_Method is empty
});

test("#2154 / #2187 wiring", () => {
  const p = read("src/modules/viewer/importPipelineImpl.js");
  assert.match(p, /if \(target !== "survey" && target !== "collars"\) return mapping;/);
  assert.match(p, /!azDetected\.hint && !azDetected\.also\)/);
  assert.match(p, /azimuthRefAlso: d\.also/);
  assert.match(p, /const up = rows\.filter\(\(r\) => r\.dip < 0\)/);
  assert.match(p, /hole\(s\) still have no survey/);
  assert.match(p, /target === "survey" \? surveyMethodFields\(headers, data\)/);
  assert.match(read("src/components/ImportMappingModal.jsx"), /This file has more than one azimuth column/);
});
