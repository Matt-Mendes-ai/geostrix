// TASKS.csv #1155 — the second batch of public geochemistry. The fixtures keep the shape of real responses (2026-10-31): each
// survey's own no-result and below-detection codes, multipoint geometry, a sample split over lab packages, the paging.
import test from "node:test";
import assert from "node:assert/strict";
import proj4 from "proj4";
import { CATALOGUE, coversArea } from "../src/lib/publicGeochem.js";
import { pickElementColumns } from "../src/lib/geochem.js";
import { esriColumn, nlColumn, gscColumn, waColumn, tellusColumn, vicGoldOther, mergeSamples, parseArcFeatures, parseWachem, parseVic, parseSgb, parseTellus, arcQueryUrl, wfsUrl, waUrl, numberMatched, fetchServiceSamples, SERVICE_MAX_ROWS } from "../src/lib/publicGeochemServices.js";

const entry = (id) => CATALOGUE.find((e) => e.id === id);
const AREA = [-180, -90, 180, 90];

test("#1155 every new entry is complete, and covers a real place of its own", () => {
  const at = { "nl-atlas": [-57, 48.8], "sk-geoatlas": [-105, 55.2], "yt-rgs": [-135.3, 63.9], "wa-wachem": [121.5, -30.8], "vic-gchem": [144, -37], "ie-tellus": [-8, 54.5], "br-sgb": [-50, -6] };
  for (const [id, [lon, lat]] of Object.entries(at)) {
    const e = entry(id);
    assert.ok(e, id);
    for (const k of ["name", "agency", "country", "media", "samples", "licence", "licenceUrl", "attribution", "page", "host", "caveat", "checked"]) assert.ok(e[k], `${id}.${k}`);
    assert.ok(e.licence.length <= 60, `${id}: the licence attribute is cut at 60`);
    assert.ok(e.downloadable && e.service, id);
    assert.ok(coversArea(e, [lon - 0.1, lat - 0.1, lon + 0.1, lat + 0.1]), `${id} covers its own test box`);
  }
  assert.equal(entry("nl-atlas").sourceEpsg, "4267", "the Atlas answers NAD27 even when asked for 4326");
  assert.match(entry("nl-atlas").caveat, /third party/, "the Atlas's redistribution term is said");
  assert.match(entry("br-sgb").caveat, /CC BY-NC/, "Brazil's unclear licence is said");
});

test("#1155 column names: real element columns only, in the import's form", () => {
  assert.equal(nlColumn("AG3_PPM"), "Ag_3_ppm");
  assert.equal(nlColumn("AU1_PPB"), "Au_INA_ppb");
  assert.equal(nlColumn("CU2_PPM"), "Cu_ICP_ppm");
  assert.equal(nlColumn("FW9_PPB"), null, "fluorine in water");
  assert.equal(nlColumn("UW10_PPB"), null, "uranium in water");
  assert.equal(nlColumn("LOI_PCT"), null);
  assert.equal(esriColumn("AG_ICP_PPB"), "Ag_ICP_ppb");
  assert.equal(esriColumn("AU_AAS_FA_PPB"), "Au_AAS-FA_ppb");
  assert.equal(esriColumn("AU2_AAS_FA_PPB"), "Au_AAS-FA2_ppb");
  assert.equal(esriColumn("SN_INA_PPM_FUSION"), "Sn_INA_ppm");
  assert.equal(esriColumn("AS_HYD_PPM"), "As_HYD_ppm");
  assert.equal(esriColumn("AU_PPB"), "Au_ppb");
  assert.equal(esriColumn("AL2O3_PCT"), "Al2O3_pct");
  assert.equal(esriColumn("FE2O3_TOT_PCT"), "Fe2O3T_pct");
  for (const no of ["AU_INA_WT", "ND_INA_SS", "TC_PCT", "TS_PCT", "LOI_PCT", "AL2O3_PPM", "PB204_PPM", "ORG_C_PPM", "CALCITE_WTPCT"]) assert.equal(esriColumn(no), null, no);
  assert.equal(gscColumn("AS_"), "As_ppm");
  assert.equal(gscColumn("C0_INA"), "Co_INA_ppm", "the layer's own typo");
  assert.equal(gscColumn("AU"), "Au_ppb");
  assert.equal(gscColumn("HG"), "Hg_ppb");
  assert.equal(gscColumn("FE"), "Fe_pct");
  assert.equal(gscColumn("NA_INA"), "Na_INA_pct");
  for (const no of ["AU_R", "LOI", "NTS_SHT", "UNIQ_ID", "LK_AREA", "OBJECTID", "UTME_N83"]) assert.equal(gscColumn(no), null, no);
  assert.equal(waColumn("ars_ppm"), "As_ppm");
  assert.equal(waColumn("ind_ppm"), "In_ppm");
  assert.equal(waColumn("fe2o3t_pct"), "Fe2O3T_pct");
  for (const no of ["h2oneg_pct", "loi_pct", "co2_pct", "so3_pct", "f_143_144_nd"]) assert.equal(waColumn(no), null, no);
  assert.equal(tellusColumn("Cu_mgkg_XRFS"), "Cu_XRFS_ppm");
  assert.equal(tellusColumn("Au_µgkg_FA_ICPMS"), "Au_FA-ICPMS_ppb");
  assert.equal(tellusColumn("Na2O_%_XRFS"), "Na2O_pct");
  assert.equal(tellusColumn("Easting_ING"), null);
  // the import recognizes each form as the right element and unit
  const headers = ["Ag_3_ppm", "Au_AAS-FA2_ppb", "Fe2O3T_pct", "Cu_XRFS_ppm", "Au_FA-ICPMS_ppb", "Cu_ppm", "Hg_ppb"];
  const picked = pickElementColumns(headers, headers.map(() => Object.fromEntries(headers.map((h) => [h, "1"]))));
  assert.ok(picked.length >= 5, JSON.stringify(picked));
  assert.ok(picked.some((p) => p.symbol === "Au" && /ppb/.test(p.unit)), JSON.stringify(picked));
});

test("#1155 Newfoundland: -9 is no result, a 0 is kept as reported, multipoint geometry, NAD27 kept as given", () => {
  const f = [{ attributes: { SAMPLE_ID: 120208, YEAR: 1977, AG3_PPM: -9, AS1_PPM: 5, AU1_PPB: 1, TA1_PPM: 0, FW9_PPB: 40 }, geometry: { points: [[-56.8289, 48.8615]] } }];
  const t = parseArcFeatures(f, { parse: "nl", label: "Regional lake sediment", medium: "other" }, entry("nl-atlas"), AREA);
  const r = t.rows[0];
  assert.equal(r.Ag_3_ppm, "", "not a below-detection of 9 ppm");
  assert.equal(r.As_INA_ppm, "5");
  assert.equal(r.Ta_INA_ppm, "");
  assert.deepEqual(r.zeroReported, ["Ta_INA_ppm"]);
  assert.equal(r.longitude, "-56.8289");
  assert.equal(r.year, "1977");
  assert.equal(r.medium, "other");
  assert.ok(!t.headers.some((h) => /^Fw/i.test(h)));
  assert.equal(t.notes.length, 1);
  assert.ok(!t.headers.includes("Ag_3_ppm"), "a method no sample ran is not offered");
});

test("#1155 Saskatchewan: below detection, blanks and stars, the two-digit year, the GSC units", () => {
  const gsc = parseArcFeatures([{ attributes: { UNIQ_ID: "073P741016", GSC_OF: 1129, AG: -0.2, AS_: 1, AS_INA: "*", AU: 1, CD: " ", FE: 1.20000005, HG: 22, ZN: 36 }, geometry: { x: -105.32, y: 55.25 } }], { parse: "sk-gsc", label: "GSC lake sediment", medium: "other" }, entry("sk-geoatlas"), AREA);
  const g = gsc.rows[0];
  assert.equal(g.Ag_ppm, "<0.2");
  assert.equal(g.As_ppm, "1");
  assert.equal(g.As_INA_ppm, "");
  assert.equal(g.Fe_pct, "1.2", "float noise tidied");
  assert.equal(g.Hg_ppb, "22");
  assert.equal(g.survey, "GSC OF 1129");
  const lake = parseArcFeatures([{ attributes: { SAMPLE_NO: 3062174201, YR: 78, TYPE: "Lake Sediment", TECHNIQUE: "AAS", CU_PPM: 9, FE_PPM: 66000, AL2O3_PPM: " ", U_PPM: -1 }, geometry: { x: -109.2, y: 57.7 } }], { parse: "sk-lake", label: "Provincial lake sediment", medium: "other" }, entry("sk-geoatlas"), AREA).rows[0];
  assert.equal(lake.year, "1978");
  assert.equal(lake.U_ppm, "<1");
  assert.equal(lake.Fe_ppm, "66000");
  const till = parseArcFeatures([
    { attributes: { SAMPLE_NUMBER_ID: "MH13-018-1-1", SAMPLE_TYPE: "till", DIGESTION: "near-total", ANALYTICAL_METHOD: "ICP-OES", DATE_SAMPLE_COLLECTED: 1370995200000, BA_PPM: 628, CD_PPM: -1, AL2O3_PCT: 9.92, CU_PPM: 0 }, geometry: { x: -104.95, y: 56.87 } },
    { attributes: { SAMPLE_NUMBER_ID: "MH13-018-1-1", SAMPLE_TYPE: "till", DIGESTION: "partial", ANALYTICAL_METHOD: "ICP-MS", DATE_SAMPLE_COLLECTED: 1370995200000, CU_PPM: 12, BA_PPM: 0 }, geometry: { x: -104.95, y: 56.87 } },
  ], { parse: "sk-till", label: "Till", medium: "other" }, entry("sk-geoatlas"), AREA);
  assert.equal(till.rows.length, 1, "two lab packages, one sample");
  assert.equal(till.rows[0].Ba_ppm, "628");
  assert.equal(till.rows[0].Cu_ppm, "12");
  assert.equal(till.rows[0].Cd_ppm, "<1");
  assert.equal(till.rows[0].Al2O3_pct, "9.92");
  assert.equal(till.rows[0].method, "near-total, ICP-OES; partial, ICP-MS");
  assert.equal(till.rows[0].year, "2013");
});

test("#1155 Yukon: stream methods side by side; assessment report rows of one sample merge; a real conflict stays apart", () => {
  const rgs = parseArcFeatures([{ attributes: { SAMPLE_ID: "105M871245", YEAR: "1987", OPEN_FILE_ORIGINAL: "GSC OF 1962", AG_ICP_PPB: 83, AG_AAS_PPM: 0.1, B_ICP_PPM: -20, BI_AAS_PPM: 0, AU_INA_PPB: null, AU_INA_WT: 30 }, geometry: { x: -135.47, y: 63.8 } }], { parse: "yt-rgs", label: "Regional stream sediment", medium: "stream sediment" }, entry("yt-rgs"), AREA);
  const r = rgs.rows[0];
  assert.equal(r.Ag_ICP_ppb, "83");
  assert.equal(r.Ag_AAS_ppm, "0.1");
  assert.equal(r.B_ICP_ppm, "<20");
  assert.equal(r.Bi_AAS_ppm, "", "a 0 in a method not run");
  assert.ok(!r.zeroReported, "not counted as censored");
  assert.equal(r.medium, "stream sediment");
  const ar = parseArcFeatures([
    { attributes: { SAMPLE_NAME: "1567901", REPORT_NUMBER: "97020", SAMPLE_TYPE: "Soil", ANALYTICAL_METHOD_FAMILY: "Aqua Regia", AS_PPM: 142, COORDINATE_CONFIDENCE: "h" }, geometry: { x: -135.58, y: 63.85 } },
    { attributes: { SAMPLE_NAME: "1567901", REPORT_NUMBER: "97020", SAMPLE_TYPE: "Soil", ANALYTICAL_METHOD_FAMILY: "Fire Assay", AU_PPB: 12 }, geometry: { x: -135.58, y: 63.85 } },
    { attributes: { SAMPLE_NAME: "1567901", REPORT_NUMBER: "97020", SAMPLE_TYPE: "Soil", ANALYTICAL_METHOD_FAMILY: "Fire Assay", AU_PPB: 40 }, geometry: { x: -135.58, y: 63.85 } },
  ], { parse: "yt-ar", label: "AR", medium: "other" }, entry("yt-rgs"), AREA);
  assert.equal(ar.rows.length, 2);
  assert.equal(ar.rows[0].As_ppm, "142");
  assert.equal(ar.rows[0].Au_ppb, "12");
  assert.equal(ar.rows[1].sample_id, "1567901-2");
  assert.equal(ar.rows[0].medium, "soil");
  assert.equal(ar.rows[0].report, "AR 97020");
});

test("#1155 mergeSamples keeps different places apart under their own ids", () => {
  const a = { sample_id: "1", longitude: "1", latitude: "1", Cu_ppm: "5" }, b = { sample_id: "1", longitude: "2", latitude: "2", Cu_ppm: "6" };
  const m = mergeSamples([a, b]);
  assert.deepEqual(m.map((r) => r.sample_id), ["1", "1-2"]);
});

test("#1155 Western Australia: -9999 is no result, other negatives are below detection, core is left out", () => {
  const csv = `objectid,sampleid,dlat,dlong,reliability,sampletype,lithname,ag_ppm,al2o3_pct,ars_ppm,au_ppm,zn_ppm,si_ppm,tm_ppm\n1,A1,-30.8,121.5,Within:10,Outcr,basalt,-0.5,-9999.00000000,4.00000000,,262.00000000,-9999.00000000,0.25999999\n2,A2,-30.8,121.5,Within:1,Drill,metabasalt,1,1,1,1,1,1,1\n3,A3,-30.7,121.6,Within:9999,Regol,stream sediment,0.1,12.5,3,0.01,20,-9999,1\n`;
  const t = parseWachem(csv, entry("wa-wachem"));
  assert.equal(t.rows.length, 2);
  const r = t.rows[0];
  assert.equal(r.Ag_ppm, "<0.5");
  assert.equal(r.Al2O3_pct, "");
  assert.equal(r.As_ppm, "4");
  assert.equal(r.Tm_ppm, "0.26");
  assert.equal(r.medium, "rock chip");
  assert.equal(r.location_within_m, "10");
  assert.equal(t.rows[1].medium, "stream sediment");
  assert.equal(t.rows[1].location_within_m, "9999");
  assert.equal(t.notes[0].n, 1);
  assert.ok(!t.headers.includes("Si_ppm"), "a column of only no-data is not offered");
});

test("#1155 Victoria: -999 is no result, gold in free text is read only when plain, the location comes from the geometry", () => {
  assert.equal(vicGoldOther(".001 ppm"), "1");
  assert.equal(vicGoldOther("0.091 ppm"), "91");
  assert.equal(vicGoldOther("5 ppb"), "5");
  assert.equal(vicGoldOther("<.01 g/t"), "<10");
  assert.equal(vicGoldOther("-999"), "");
  assert.equal(vicGoldOther(" "), "");
  assert.equal(vicGoldOther("see report"), "");
  const csv = `FID,siteid,samp_type,company,au_ppb,au_other,cu_ppm,ag_ppm,ag_ppb,locn_acc,geom\ngeochemistry.771,461247,SED,Golden Triangle,-999,.001 ppm,-999,1.5,-999,100,POINT (144.199343969006 -37.00969495421566)\ngeochemistry.772,461248,SOIL,X,80, ,12,-999,-999,50,POINT (144.2 -37.0)\ngeochemistry.773,461249,UNK,X,-999,-999,-999,-999,-999,50,\n`;
  const t = parseVic(csv, entry("vic-gchem"));
  assert.equal(parseVic("siteid,samp_type,cu_ppm,as_ppm,zn_ppm,geom\n1,SOIL,-5,-20,-0.999,POINT (144 -37)\n", entry("vic-gchem")).rows[0].Cu_ppm, "<5");
  assert.equal(parseVic("siteid,samp_type,cu_ppm,as_ppm,zn_ppm,geom\n1,SOIL,-5,-20,-0.999,POINT (144 -37)\n", entry("vic-gchem")).rows[0].Zn_ppm, "");
  assert.equal(t.rows.length, 2, "no geometry, no place");
  assert.equal(t.rows[0].Au_ppb, "1");
  assert.equal(t.rows[0].medium, "stream sediment");
  assert.equal(t.rows[0].longitude, "144.199343969006");
  assert.equal(t.rows[0].Cu_ppm, "");
  assert.equal(t.rows[1].Au_ppb, "80");
  assert.equal(t.rows[1].medium, "soil");
  assert.equal(t.notes[0].n, 1);
});

test("#1155 Brazil: each result's own unit and qualifier", () => {
  const lab = JSON.stringify({ b: { valor: 10, unidade: "ppm", qualificador: "<" }, k: { valor: 0.02, unidade: "pct", qualificador: null }, ag: { valor: 0.17, unidade: "ppm", qualificador: null }, au: { valor: 9000, unidade: "ppm", qualificador: ">" }, xx: { valor: 1, unidade: "ppm" } }).replace(/"/g, '""');
  const csv = `objectid,projeto_amostragem,classe,numero_de_campo,numero_de_laboratorio,latitude,longitude,laboratorio,data_de_analise,abertura,leitura,analitos\n100599,Serra Pelada,Sedimento de corrente,4049-JH-S-0027,DDM229,-5.937805,-49.667046,SGS Geosol,2010-02-24T00:00:00,Agua Regia,ICP-MS,"${lab}"\n`;
  const t = parseSgb(csv, entry("br-sgb"));
  const r = t.rows[0];
  assert.equal(r.B_ppm, "<10");
  assert.equal(r.K_pct, "0.02");
  assert.equal(r.Ag_ppm, "0.17");
  assert.equal(r.Au_ppm, "9000");
  assert.equal(r.medium, "stream sediment");
  assert.equal(r.year, "2010");
  assert.equal(r.project, "Serra Pelada");
  assert.equal(t.notes[0].n, 1, "the result above the limit is said");
  assert.ok(!t.headers.some((h) => /^Xx/.test(h)));
});

test("#1155 Ireland: below-limit values marked, clipped to the area, Irish Grid converted", () => {
  // EPSG:29902. Check point: the Spire of Dublin, Irish Grid about 315904, 234671, is 53.3498 N, 6.2603 W
  const def = "+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=1.000035 +x_0=200000 +y_0=250000 +ellps=mod_airy +towgs84=482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15 +units=m +no_defs";
  const T = (e, n) => proj4(def, "WGS84", [e, n]);
  const [lon, lat] = T(315904, 234671);
  assert.ok(Math.abs(lon - -6.2603) < 0.001 && Math.abs(lat - 53.3498) < 0.001, `${lon} ${lat}`);
  const sheets = [
    { rows: [["Sample_ID", "Easting_ING", "Northing_ING", "Na2O_%_XRFS", "Cu_mgkg_XRFS", "Au_µgkg_FA_ICPMS"], ...Array.from({ length: 25 }, (_, i) => [`S${i}`, 251230, 432606, "1.3", i === 0 ? "0.25" : "43.56", ""])] },
    { rows: [["Sample_ID", "Easting_ING", "Northing_ING", "Na2O_%_XRFS", "Cu_mgkg_XRFS", "Au_µgkg_FA_ICPMS"], ["LLD", "", "", "0.3", "0.5", "1"], ["HDL (=0.5*LLD)", "", "", "0.15", "0.25", "0.5"]] },
  ];
  const t = parseTellus(sheets, [-8, 54, -6, 56], T, entry("ie-tellus"));
  assert.equal(t.rows.length, 25);
  assert.equal(t.rows[0].Cu_XRFS_ppm, "<0.5");
  assert.equal(t.rows[1].Cu_XRFS_ppm, "43.56");
  assert.equal(t.rows[0].Na2O_pct, "1.3");
  assert.equal(t.notes[0].n, 1);
  assert.ok(Math.abs(Number(t.rows[0].longitude) - -7.2) < 0.2 && Math.abs(Number(t.rows[0].latitude) - 55.1) < 0.2, `${t.rows[0].longitude} ${t.rows[0].latitude}`);
  assert.equal(parseTellus(sheets, [-2, 50, -1, 51], T, entry("ie-tellus")).rows.length, 0, "outside the area");
  assert.throws(() => parseTellus([{ rows: [["x"]] }], AREA, T, entry("ie-tellus")));
});

test("#1155 requests: axis order per server, the page parameters, no project data", () => {
  const u = new URL(arcQueryUrl("https://a.example/MapServer", 84, [-57.2, 48.6, -56.6, 49], { offset: 1000, pageSize: 1000 }));
  assert.equal(u.searchParams.get("geometry"), "-57.200000,48.600000,-56.600000,49.000000");
  assert.equal(u.searchParams.get("resultOffset"), "1000");
  assert.equal(u.searchParams.get("orderByFields"), "OBJECTID", "pages need a stable order");
  assert.equal(new URL(arcQueryUrl("https://a.example/MapServer", 84, [1, 2, 3, 4], { count: true })).searchParams.get("returnCountOnly"), "true");
  const w = wfsUrl("https://b.example/wfs", "p3m:x", [-50.5, -6.5, -49.5, -5.5], { count: 5000, startIndex: 5000, sortBy: "objectid" });
  assert.match(w, /bbox=-50\.500000,-6\.500000,-49\.500000,-5\.500000,EPSG:4326$/);
  assert.match(w, /sortBy=objectid/);
  const f = new URL(waUrl("https://c.example/WFSServer", "esri:G", [121.3, -30.9, 121.7, -30.6])).searchParams.get("FILTER");
  assert.match(f, /<gml:lowerCorner>-30\.900000 121\.300000<\/gml:lowerCorner>/, "latitude first on this server");
  assert.match(f, /<Literal>Drill<\/Literal>/);
  assert.equal(numberMatched('<wfs:FeatureCollection numberMatched="21525" numberReturned="0">'), 21525);
  assert.equal(numberMatched("nope"), null);
});

test("#1155 fetchServiceSamples: pages to the count, refuses too much, says a service's error", async () => {
  const pages = [];
  const nl = entry("nl-atlas"), layer = nl.layers[0];
  const feature = (i) => ({ attributes: { OBJECTID: i, SAMPLE_ID: i, CU3_PPM: i + 1 }, geometry: { points: [[-57, 48.8]] } });
  const arc = async ({ url }) => {
    const q = new URL(url).searchParams;
    if (q.get("returnCountOnly")) return { ok: true, status: 200, text: JSON.stringify({ count: 2500 }) };
    const off = Number(q.get("resultOffset")); pages.push(off);
    return { ok: true, status: 200, text: JSON.stringify({ features: Array.from({ length: Math.min(1000, 2500 - off) }, (_, i) => feature(off + i)) }) };
  };
  const steps = [];
  const t = await fetchServiceSamples(nl, layer, [-58, 48, -56, 49], arc, (p) => steps.push(p));
  assert.deepEqual(pages, [0, 1000, 2000]);
  assert.deepEqual(steps, [1, 2, 3]);
  assert.equal(t.rows.length, 2500);
  await assert.rejects(fetchServiceSamples(nl, layer, [-58, 48, -56, 49], async () => ({ ok: true, status: 200, text: JSON.stringify({ count: SERVICE_MAX_ROWS + 1 }) })), /draw a smaller one/);
  await assert.rejects(fetchServiceSamples(nl, layer, [-58, 48, -56, 49], async () => ({ ok: true, status: 200, text: JSON.stringify({ error: { message: "Invalid query" } }) })), /Invalid query/);
  await assert.rejects(fetchServiceSamples(nl, layer, [-58, 48, -56, 49], async () => ({ ok: false, status: 503 })), /503/);
  const none = await fetchServiceSamples(nl, layer, [-58, 48, -56, 49], async () => ({ ok: true, status: 200, text: JSON.stringify({ count: 0 }) }));
  assert.equal(none.rows.length, 0);
  // a WFS exception page with a 200 is an error, not an empty table
  await assert.rejects(fetchServiceSamples(entry("br-sgb"), entry("br-sgb").layers[0], [-50, -6, -49, -5], async () => ({ ok: true, status: 200, text: '<ows:ExceptionReport><ows:ExceptionText>Bad</ows:ExceptionText></ows:ExceptionReport>' })), /Bad/);
  // WFS paging joins the pages and adds up their notes
  const br = entry("br-sgb");
  const lab = JSON.stringify({ au: { valor: 9000, unidade: "ppm", qualificador: ">" } }).replace(/"/g, '""');
  const hdr = "objectid,classe,numero_de_campo,latitude,longitude,data_de_analise,analitos";
  const seen = [];
  const wfs = async ({ url }) => {
    const q = new URL(url).searchParams;
    if (q.get("resultType") === "hits") return { ok: true, status: 200, text: '<x numberMatched="7000">' };
    const start = Number(q.get("startIndex")); seen.push(start);
    return { ok: true, status: 200, text: `${hdr}\n${start},Solo,F${start},-6,-50,2010-01-01,"${lab}"\n` };
  };
  const b = await fetchServiceSamples(br, br.layers[1], [-51, -7, -49, -5], wfs);
  assert.deepEqual(seen, [0, 5000]);
  assert.equal(b.rows.length, 2);
  assert.equal(b.notes[0].n, 2);
});
