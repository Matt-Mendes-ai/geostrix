// TASKS.csv #1346 — builds sample_data/silvertip/ from the public assessment report ARIS 42807 (Silvertip property, 2024
// drilling and surface sampling; the property and operator are named in the report's lab certificates). The acQuire tables are
// copied into tidy CSVs whose column names GeoStrix's importer matches exactly, so "Sample: Silvertip" imports them without
// questions. Nothing is invented: every value comes from the report's files (README.md maps them one by one).
//
//   node scripts/samples/build-silvertip.mjs "<path to 42807Z>"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const src = process.argv[2];
if (!src || !existsSync(src)) { console.error("usage: node scripts/samples/build-silvertip.mjs <path to the 42807Z folder>"); process.exit(1); }
const out = path.resolve("sample_data/silvertip");
mkdirSync(out, { recursive: true });

const H = path.join(src, "Appendix H - Drill Hole Data and Analytical Results");
const LOGS = path.join(H, "GEOLOGY LOGS");
const read = (p) => Papa.parse(readFileSync(p, "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true, delimiter: "" }).data;
const num = (v) => { const s = String(v ?? "").trim(); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; };
const txt = (v) => String(v ?? "").trim();
const write = (name, header, rows) => {
  const body = rows.map((r) => header.map((h) => { const v = r[h]; if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(","));
  writeFileSync(path.join(out, name), [header.join(","), ...body].join("\n") + "\n");
  console.log(`${name}: ${rows.length} rows`);
};
const interval = (r) => ({ hole_id: txt(r.HOLEID), from: num(r.GEOLFROM), to: num(r.GEOLTO) });
const okInterval = (r) => r.hole_id && r.from != null && r.to != null && r.to > r.from;

// collars — surveyed coordinates in NAD83 / UTM zone 9N (EPSG:26909, the NAD83_9N_SUR_* columns); end-of-hole depth
write("collars.csv", ["hole_id", "x", "y", "z", "length"], read(path.join(H, "SVT_2024_DRILLHOLE_COLLAR.csv")).map((r) => ({
  hole_id: txt(r.HOLEID), x: num(r.NAD83_9N_SUR_X), y: num(r.NAD83_9N_SUR_Y), z: num(r.NAD83_9N_SUR_Z), length: num(r["EOH (M)"]) ?? num(r["DEPTH (M)"]),
})).filter((r) => r.hole_id && r.x != null && r.y != null && r.z != null));

// downhole survey — the TRUSURVEY stations (grid azimuths, AZIMUTHGRIDNAME NAD83_9N). A hole with no TRUSURVEY at all (CCF24-PAD42-002, stopped at
// 348 m and redrilled as 002A) keeps its one PLAN record, so it is drawn at its planned orientation rather than vertical
const surveyRows = read(path.join(H, "SVT_2024_DRILLHOLE_SURVEYS.csv")).map((r) => ({ type: txt(r.SURVTYPE), hole_id: txt(r.HOLEID), depth: num(r["DEPTH (M)"]), azimuth: num(r.AZIMUTH), dip: num(r.DIP) }))
  .filter((r) => r.hole_id && r.depth != null && r.azimuth != null && r.dip != null);
const surveyed = new Set(surveyRows.filter((r) => r.type !== "PLAN").map((r) => r.hole_id));
const planOnly = surveyRows.filter((r) => r.type === "PLAN" && !surveyed.has(r.hole_id));
if (planOnly.length) console.log(`  planned orientation only: ${planOnly.map((r) => `${r.hole_id} (${r.azimuth}/${r.dip})`).join(", ")}`);
write("survey.csv", ["hole_id", "depth", "azimuth", "dip"], surveyRows.filter((r) => r.type !== "PLAN" || !surveyed.has(r.hole_id)));

// lithology — the logged rock code with the geologist's comments
write("litho.csv", ["hole_id", "from", "to", "lithology", "description"], read(path.join(LOGS, "SVT_2024_GEO_LITHOLOGY.txt")).map((r) => ({ ...interval(r), lithology: txt(r.LIT_ROCK_CODE), description: txt(r.LIT_COMMENTS) })).filter((r) => okInterval(r) && r.lithology));

// alteration — the first alteration mineral (ALT_RX_MIN1_TYPE)
write("alt.csv", ["hole_id", "from", "to", "assemblage"], read(path.join(LOGS, "SVT_2024_GEO_ALTERATION.txt")).map((r) => ({ ...interval(r), assemblage: txt(r.ALT_RX_MIN1_TYPE) })).filter((r) => okInterval(r) && r.assemblage));

// breccia — the breccia class
write("breccia.csv", ["hole_id", "from", "to", "breccia_type"], read(path.join(LOGS, "SVT_2024_GEO_BRECCIA.txt")).map((r) => ({ ...interval(r), breccia_type: txt(r.BX_CLASS) })).filter((r) => okInterval(r) && r.breccia_type));

// veins — the first vein type of each vein interval
write("vein.csv", ["hole_id", "from", "to", "type"], read(path.join(LOGS, "SVT_2024_GEO_VEIN.txt")).map((r) => ({ ...interval(r), type: txt(r.VEI_1_TYPE) })).filter((r) => okInterval(r) && r.type));

// mineralisation — every logged sulphide (SUL_MIN_1 .. SUL_MIN_n) with its percent
const minRows = [];
for (const r of read(path.join(LOGS, "SVT_2024_GEO_SULPHIDES.txt"))) {
  const iv = interval(r);
  if (!okInterval(iv)) continue;
  for (let k = 1; k <= 9; k++) { const m = txt(r[`SUL_MIN_${k}`]); if (m) minRows.push({ ...iv, mineral: m, percent: num(r[`SUL_MIN_${k}_PCT`]) }); }
}
write("mnlgy.csv", ["hole_id", "from", "to", "mineral", "percent"], minRows);

// structural zones — interval structures (fault, vein zone, foliation...) with their logged intensity
write("struct_zones.csv", ["hole_id", "from", "to", "struc_code", "intensity", "description"], read(path.join(LOGS, "SVT_2024_GEO_STRUCT_INTERVALS.txt"))
  .map((r) => ({ ...interval(r), struc_code: txt(r.STIN_TYPE), intensity: txt(r.STIN_INTENSITY), description: txt(r.STIN_DESCRIPTION) })).filter((r) => okInterval(r) && r.struc_code));

// geotechnical — RQD % (RQQ_PCT_D, = REC_RQD_M over the run length) and core recovery % (REC_PCT_D)
const geo = read(path.join(LOGS, "SVT_2024_GEO_GEOTECH.txt"));
write("geotech.csv", ["hole_id", "from", "to", "rqd_pct"], geo.map((r) => ({ ...interval(r), rqd_pct: num(r.RQQ_PCT_D) })).filter((r) => okInterval(r) && r.rqd_pct != null));
write("recovery.csv", ["hole_id", "from", "to", "recovery_pct"], geo.map((r) => ({ ...interval(r), recovery_pct: num(r.REC_PCT_D) })).filter((r) => okInterval(r) && r.recovery_pct != null));

// magnetic susceptibility — point readings (GEOLFROM = GEOLTO), as logged; the unit is not stated in the export
write("magsusc.csv", ["hole_id", "depth", "mag_reading"], read(path.join(LOGS, "SVT_2024_GEO_MAG_SUSC.txt")).map((r) => ({ hole_id: txt(r.HOLEID), depth: num(r.GEOLFROM), mag_reading: num(r.MAG_READING) })).filter((r) => r.hole_id && r.depth != null && r.mag_reading != null));

// structures — oriented-core points: the logged feature with alpha / beta (GeoStrix orients them from the hole's survey)
write("structure.csv", ["hole_id", "depth_m", "structure_type", "alpha", "beta"], read(path.join(LOGS, "SVT_2024_GEO_STRUCT_POINTS.txt"))
  .map((r) => ({ hole_id: txt(r.HOLEID), depth_m: num(r.GEOLFROM), structure_type: txt(r.STPT_FEATURE) || "Unspecified", alpha: num(r.STPT_ALPHA), beta: num(r.STPT_BETA) })).filter((r) => r.hole_id && r.depth_m != null && r.alpha != null));

// assays and surface samples — the "best element" columns (<El>_<unit>_BESTEL): one value per element, the lab method chosen by
// the database; elements only (the oxide, carbon and silver-equivalent columns are left out); values as delivered (a negative
// number is the lab's below-detection code and is read as such on loading)
const elementCols = (headers) => headers.map((h) => { const m = /^([A-Z][a-z]?)_(ppm|pct)_BESTEL$/.exec(h); return m ? { src: h, out: `${m[1]}_${m[2]}` } : null; }).filter(Boolean);
const assays = read(path.join(H, "SVT_2024_SAMPLES_DRILLING_ASSAYS.csv"));
const ae = elementCols(Object.keys(assays[0]));
write("assays.csv", ["hole_id", "from", "to", "sample_id", ...ae.map((e) => e.out)], assays.map((r) => {
  const row = { hole_id: txt(r.HOLEID), from: num(r.SAMPFROM), to: num(r.SAMPTO), sample_id: txt(r.SAMPLEID) };
  for (const e of ae) row[e.out] = txt(r[e.src]) || null;
  return row;
}).filter(okInterval));

const surface = (file, name, medium) => {
  const rows = read(file), el = elementCols(Object.keys(rows[0]));
  write(name, ["sample_id", "x", "y", "z", "medium", ...el.map((e) => e.out)], rows.map((r) => {
    const row = { sample_id: txt(r.SAMPLEID), x: num(r.NAD83_9N_BEST_X), y: num(r.NAD83_9N_BEST_Y), z: num(r.NAD83_9N_BEST_Z), medium };
    for (const e of el) row[e.out] = txt(r[e.src]) || null;
    return row;
  }).filter((r) => r.sample_id && r.x != null && r.y != null));
};
surface(path.join(src, "Appendix G - Rock Sample Locations and Analytical Results", "SVT_2024_SAMPLES_SURFACE_ROCKS_UPDATED.csv"), "rocks.csv", "rock chip");
surface(path.join(H, "SVT_2024_SAMPLES_SURFACE_SOILS.txt"), "soils.csv", "soil");
surface(path.join(src, "Appendix E - Stream Seds Sample Locations and Analytical Results", "SVT_2024_SAMPLES_SURFACE_STREAMS.csv"), "streams.csv", "stream sediment");
