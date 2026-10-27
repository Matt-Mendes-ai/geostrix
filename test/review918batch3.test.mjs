// TASKS.csv #930 / #933 — public samples keep their vintage; QC rows filed under a hole id are not that hole's grades.
import test from "node:test";
import assert from "node:assert/strict";
import { parseNgdbPackage, parseNure, parseBcRgs, yearOf } from "../src/lib/publicGeochem.js";
import { surfaceAttrColumns, pickElementColumns } from "../src/lib/geochem.js";
import { excludeQAQC } from "../src/lib/qaqc.js";

test("#930: yearOf reads a four-digit year from the date shapes the services write", () => {
  assert.equal(yearOf("1977/08/09"), "1977");
  assert.equal(yearOf("08/09/1977"), "1977");
  assert.equal(yearOf("svy210299 2003"), "2003"); // CDoGS survey key + year
  assert.equal(yearOf("svy200512"), ""); // a survey key is not a year
  assert.equal(yearOf(""), ""); assert.equal(yearOf(null), "");
});

test("#930: NURE rows get a year column that survives the attribute cap, and source names the survey's years, not the check date", () => {
  const lines = ["rec_no,latitude,longitude,smpmedia,sampsrc,sampdat,cu_ppm"];
  for (let i = 0; i < 300; i++) lines.push(`${i},39.3${i % 10},-106.38,SEDIMENT,STREAM,${1976 + (i % 3)}/${10 + (Math.floor(i / 28) % 12)}/${10 + (i % 28)},${i}`);
  const t = parseNure(lines.join("\n"), [-106.5, 39.2, -106.2, 39.4]);
  assert.equal(t.rows.length, 300);
  assert.ok(t.headers.includes("year"));
  assert.equal(t.rows[0].year, "1976");
  assert.match(t.rows[0].source, /^USGS NURE .* \(1976-1978\)$/);
  assert.doesNotMatch(t.rows[0].source, /2026/);
  assert.ok(t.rows[0].source.length <= 60);
  const attrs = surfaceAttrColumns(t.headers, t.rows, { x: "longitude", y: "latitude", sample_id: "sample_id" });
  assert.ok(attrs.includes("year") && !attrs.includes("collected"), attrs.join(","));
  assert.ok(!pickElementColumns(t.headers.slice(5), t.rows).some((e) => e.header === "year"));
});

test("#930: one date gives one year; no date anywhere gives neither a year column nor a date in source", () => {
  const main = "lab_id,field_id,date_collect,lat_wgs84,long_wgs84,sample_source,primary_class\r\nC1,F1,1977/08/09,39.30,-106.40,stream/river,sediment\r\n";
  const best = "rec_id,lab_id,species,unit,qvalue,amethod,summary,parameter,mthd_parameter\r\n1,C1,Cu,ppm,30,AES_HF,x,Cu_ppm,Cu_Mthd\r\n";
  const a = parseNgdbPackage({ main, bestvalue: best }, [-106.5, 39.2, -106.2, 39.4]).rows[0];
  assert.match(a.source, /\(1977\)$/);
  const bc = parseBcRgs("FID,MASTER_ID,MATERIAL,LATITUDE,LONGITUDE,ELEVATION,COPPER_AAS_PPM\na.1,X1,Stream sediment,54.8,-127.2,,30\n");
  assert.equal(bc.rows[0].source, "BC Regional Geochemical Survey");
  assert.ok(!bc.headers.includes("year") && !("year" in bc.rows[0]));
});

test("#933: a standard or blank filed under a real hole id is not one of that hole's grades", () => {
  const assays = [
    { hole_id: "DH1", from_m: 0, to_m: 1, sample_id: "A1", Au: 0.01 },
    { hole_id: "DH1", from_m: 1, to_m: 2, sample_id: "A2", sample_type: "STD", Au: 2.5 },
    { hole_id: "DH1", from_m: 2, to_m: 3, sample_id: "A3", sample_type: "BLK", Au: 0.002 },
  ];
  assert.deepEqual(excludeQAQC(assays).map((a) => a.sample_id), ["A1"]);
});
