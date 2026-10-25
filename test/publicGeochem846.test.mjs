// TASKS.csv #846 — the public geochemistry catalogue: requests, parsers (shapes taken from real responses of the BC
// RGS and NGSA services, 2026-10-25), the host allow-list and the privacy page.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CATALOGUE, searchCatalogue, coversArea, areaUrl, parseCsv, serviceError, bcColumn, parseBcRgs, ngsaColumn, ngsaChoices, parseNgsa, projectBoxXY } from "../src/lib/publicGeochem.js";
import { pickElementColumns, readAssayCell } from "../src/lib/geochem.js";

const BC = [
  "FID,MASTER_ID,MATERIAL,LATITUDE,LONGITUDE,ELEVATION,COPPER_AAS_PPM,COPPER_ICPMS_PPM,SILVER_AAS_PPM,GOLD_FA_PPB,GOLD_FA_PPB_2,IRON_AAS_PERCENTAGE,WATER_URANIUM_PPB,LOSS_ON_IGNITION_PERCENTAGE,GEOMETRY",
  'a.1,93L861788,Water and sediment,54.87002,-127.2701,,30,,0,1,,3.28,0.02,3.2,"POINT (-127.27 54.87)"',
  'a.2,93L861789,Lake Sediment,54.80000,-127.1000,850,45,44.5,2,7,9,2.10,,4.0,"POINT (-127.1 54.8)"',
].join("\r\n") + "\r\n";

const NGSA_HEAD = "FID,SITE_ID,SAMPLE_ID,SUBSAMPLE_ID,LAT_GDA94,LONG_GDA94,SAMPLING_FEATURE_LOCATION,SIO2_WEIGHT_PERCENT,FE2O3_TOTAL_WEIGHT_PERCENT,H2O_PLUS_WEIGHT_PERCENT,CU_PPM,CU_TECHNIQUE,ARS_PPM,AU_PPB,REE_PPM,PROJECT";
const row = (site, n, frac, dig, cu) => `x,${site},${site}${n} ${frac},${dig},-31.39,140.01,POINT (-31.39 140.01),${dig === "WHOLE ROCK" ? "61.2" : ""},${dig === "WHOLE ROCK" ? "5.1" : ""},,${cu},ICPMS,-0.01,-0.1,120,NGSA`;
const NGSA = [NGSA_HEAD,
  row("2007191138", "001", "Coarse", "AR", "5.75"), row("2007191138", "001", "Coarse", "MMI", "0.67"), row("2007191138", "001", "Coarse", "WHOLE ROCK", ""),
  row("2007191138", "002", "Coarse", "AR", "6.1"), row("2007191138", "001", "Fine", "AR", "9.4"),
  row("2007190501", "001", "Coarse", "AR", "12.5"),
].join("\n");

test("catalogue: every entry has its licence, page and date; downloadable ones a tested host and request", () => {
  for (const e of CATALOGUE) {
    assert.ok(e.licence && /^https:\/\//.test(e.licenceUrl) && /^https:\/\//.test(e.page) && e.attribution && e.caveat, e.id);
    if (e.downloadable) { assert.ok(e.host, e.id); assert.equal(new URL(areaUrl(e.id, [-127.4, 54.6, -127, 54.9])).hostname, e.host); }
    else assert.equal(areaUrl(e.id, [0, 0, 1, 1]), null);
  }
  assert.deepEqual(searchCatalogue("australia stream").map((e) => e.id), []); // NGSA is "catchment outlet sediment"
  assert.deepEqual(searchCatalogue("australia sediment").map((e) => e.id), ["ga-ngsa"]);
  assert.deepEqual(searchCatalogue("USGS").map((e) => e.id), ["usgs-ngdb", "usgs-nure"]);
  assert.equal(searchCatalogue("").length, CATALOGUE.length);
  const bc = CATALOGUE.find((e) => e.id === "bc-rgs"), ga = CATALOGUE.find((e) => e.id === "ga-ngsa");
  assert.ok(coversArea(bc, [-130.5, 56.5, -130, 57]) && !coversArea(ga, [-130.5, 56.5, -130, 57]) && coversArea(ga, [140, -34, 143, -31]));
  const ngdb = CATALOGUE.find((e) => e.id === "usgs-ngdb");
  assert.ok(!coversArea(ngdb, [-129.7, 55.7, -129.4, 55.8]) && coversArea(ngdb, [-106.4, 39.2, -106.2, 39.3]) && coversArea(ngdb, [-150, 61, -149, 62])); // not BC; Colorado, Alaska
});

test("requests: BC pages of 10,000 with a lon,lat CRS:84 box; NGSA restricted to the NGSA project with a lon,lat CQL box", () => {
  const u = new URL(areaUrl("bc-rgs", [-127.4, 54.6, -127, 54.9], { page: 2 }));
  assert.equal(u.searchParams.get("startIndex"), "20000");
  assert.equal(u.searchParams.get("count"), "10000");
  assert.equal(u.searchParams.get("outputFormat"), "csv");
  assert.equal(u.searchParams.get("bbox"), "-127.400000,54.600000,-127.000000,54.900000,CRS:84");
  const g = new URL(areaUrl("ga-ngsa", [140, -34, 143, -31]));
  assert.equal(g.searchParams.get("CQL_FILTER"), "PROJECT ILIKE '%NGSA%' AND BBOX(SAMPLING_FEATURE_LOCATION,140.000000,-34.000000,143.000000,-31.000000,'EPSG:4326')");
});

test("CSV reader and service errors", () => {
  const t = parseCsv('﻿a,b\r\n1,"x, ""y"""\r\n\r\n2,\r\n');
  assert.deepEqual(t.headers, ["a", "b"]);
  assert.deepEqual(t.rows, [{ a: "1", b: 'x, "y"' }, { a: "2", b: "" }]);
  assert.equal(serviceError('<?xml version="1.0"?><ows:ExceptionReport><ows:Exception><ows:ExceptionText>Illegal property name</ows:ExceptionText></ows:Exception></ows:ExceptionReport>'), "Illegal property name");
  assert.equal(serviceError("FID,SITE_ID\n"), null);
});

test("BC RGS: element names to symbols with method and unit, zeros left empty, lake sediment not called stream", () => {
  assert.equal(bcColumn("COPPER_ICPMS_PPM"), "Cu_ICPMS_ppm");
  assert.equal(bcColumn("GOLD_FA_PPB_2"), "Au_FA_ppb_2");
  assert.equal(bcColumn("IRON_AAS_PERCENTAGE"), "Fe_AAS_pct");
  assert.equal(bcColumn("SULPHUR_ICPMS_PERCENTAGE"), "S_ICPMS_pct");
  assert.equal(bcColumn("WATER_URANIUM_PPB"), null);
  assert.equal(bcColumn("LOSS_ON_IGNITION_PERCENTAGE"), null);
  const t = parseBcRgs(BC);
  assert.equal(t.fetched, 2);
  assert.equal(t.rows.length, 2);
  assert.deepEqual(t.notes, [{ key: "{n} zero value(s) left empty: this layer has no below-detection marker, so a 0 is not a grade.", n: 1 }]);
  const [a, b] = t.rows;
  assert.equal(a.sample_id, "93L861788"); assert.equal(a.medium, "stream sediment"); assert.equal(a.Ag_AAS_ppm, "");
  assert.equal(b.medium, "other"); assert.equal(b.material, "Lake Sediment"); assert.equal(b.elevation, "850");
  assert.ok(t.headers.includes("Cu_ICPMS_ppm") && t.headers.includes("source") && t.headers.includes("licence"));
  assert.match(a.source, /^BC Regional Geochemical Survey/);
  assert.equal(a.licence, "Open Government Licence – British Columbia v2.0".slice(0, 60));
  // the normal column picker reads them: the more complete Cu column, ppb for gold, % for iron
  const els = Object.fromEntries(pickElementColumns(t.headers.slice(5), t.rows).map((e) => [e.symbol, e]));
  assert.equal(els.Cu.header, "Cu_AAS_ppm"); assert.equal(els.Au.unit, "ppb"); assert.equal(els.Fe.unit, "%");
  assert.equal(els.U, undefined);
});

test("NGSA: oxides, arsenic, rare-earth sums skipped; one fraction / depth / digestion; -DL read as below detection", () => {
  assert.equal(ngsaColumn("ARS_PPM"), "As_ppm");
  assert.equal(ngsaColumn("FE2O3_TOTAL_WEIGHT_PERCENT"), "Fe2O3T_pct");
  assert.equal(ngsaColumn("H2O_PLUS_WEIGHT_PERCENT"), null);
  assert.equal(ngsaColumn("REE_PPM"), null);
  assert.equal(ngsaColumn("CU_TECHNIQUE"), null);
  assert.equal(ngsaColumn("AU_PPB"), "Au_ppb");
  const c = ngsaChoices(NGSA);
  assert.equal(c.sites, 2);
  assert.deepEqual(c.combos.find((k) => k.fraction === "coarse" && k.depth === "top" && k.digestion === "aqua regia").n, 2);
  assert.ok(c.combos.some((k) => k.depth === "bottom") && c.combos.some((k) => k.digestion === "MMI") && c.combos.some((k) => k.fraction === "fine"));
  const t = parseNgsa(NGSA);
  assert.deepEqual(t.rows.map((r) => r.Cu_ppm), ["5.75", "12.5"]);
  assert.equal(t.rows[0].sample_id, "2007191138001_Coarse");
  assert.equal(t.rows[0].longitude, "140.01"); // LONG_GDA94, not the axis-swapped WKT
  assert.ok(!t.headers.includes("SiO2_pct")); // empty for aqua regia: not offered
  assert.deepEqual(readAssayCell(t.rows[0].As_ppm), { value: 0.005, qualifier: "<", kind: "neg_bdl" });
  const w = parseNgsa(NGSA, { digestion: "whole rock" });
  assert.equal(w.rows.length, 1); assert.ok(w.headers.includes("SiO2_pct") && w.headers.includes("Fe2O3T_pct"));
  assert.equal(parseNgsa(NGSA, { depth: "bottom" }).rows[0].depth, "about 0.6-0.8 m");
});

test("project area: collars first, then samples / boundaries / map layers, with a margin; null when nothing is located", () => {
  assert.deepEqual(projectBoxXY({ collars: [{ x: 1000, y: 5000 }, { x: 1400, y: 5100 }] }), [-9000, -5000, 11400, 15100]);
  assert.deepEqual(projectBoxXY({ surfaceSamples: [{ x: 0, y: 0 }, { x: 40000, y: 20000 }] }), [-10000, -10000, 50000, 30000]);
  assert.ok(projectBoxXY({ mapLayers: [{ features: [{ geometry: [[5, 5], [6, 6]] }] }] }));
  assert.equal(projectBoxXY({}), null);
});

test("network: geochem-fetch reads only the catalogue's tested hosts, and the privacy pages list them", () => {
  const main = fs.readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  const hosts = JSON.parse(main.match(/const GEOCHEM_HOSTS = new Set\((\[[^\]]*\])\)/)[1]);
  assert.deepEqual(hosts.sort(), CATALOGUE.filter((e) => e.downloadable).map((e) => e.host).sort());
  assert.match(main, /ipcMain\.handle\("geochem-fetch"[\s\S]{0,400}u\.protocol !== "https:" \|\| !GEOCHEM_HOSTS\.has\(u\.hostname\)/);
  for (const p of ["../PRIVACY.md", "../website/privacy.html", "../website/es/privacy.html", "../website/pt-br/privacy.html", "../website/fr/privacy.html", "../website/ar/privacy.html"]) {
    const s = fs.readFileSync(new URL(p, import.meta.url), "utf8");
    for (const h of hosts) assert.ok(s.includes(h), `${p} lists ${h}`);
  }
});
