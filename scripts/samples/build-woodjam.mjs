// TASKS.csv #637 — builds sample_data/woodjam/ from the public assessment report ARIS 41597 (Woodjam property,
// 2023 drilling, IP and ZTEM). The source tables are copied into tidy CSVs whose column names GeoStrix's importer
// matches exactly, so "Load sample project → Woodjam" imports them without questions. Nothing is invented: every
// value comes from the report's files (see sample_data/woodjam/README.md for the file-by-file mapping).
//
//   node scripts/samples/build-woodjam.mjs "<path to 41597Z>"
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const src = process.argv[2];
if (!src || !existsSync(src)) { console.error("usage: node scripts/samples/build-woodjam.mjs <path to the 41597Z folder>"); process.exit(1); }
const out = path.resolve("sample_data/woodjam");
mkdirSync(path.join(out, "ip"), { recursive: true });

const DHDB = path.join(src, "Appendix F - DHDB");
const read = (name) => Papa.parse(readFileSync(path.join(DHDB, name), "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const num = (v) => { const n = Number(String(v ?? "").trim()); return String(v ?? "").trim() !== "" && Number.isFinite(n) ? n : null; };
const txt = (v) => String(v ?? "").trim();
const write = (name, header, rows) => {
  const body = rows.map((r) => header.map((h) => { const v = r[h]; if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(","));
  writeFileSync(path.join(out, name), [header.join(","), ...body].join("\n") + "\n");
  console.log(`${name}: ${rows.length} rows`);
};
const interval = (r) => ({ hole_id: txt(r["Hole number"]), from: num(r.From), to: num(r.To) });
const okInterval = (r) => r.hole_id && r.from != null && r.to != null && r.to > r.from;

// collars — DGPS coordinates already in NAD83 / UTM zone 10N (EPSG:26910); planned azimuth / dip; final depth
const headers = read("Diamond Drilling_Headers.csv");
write("collars.csv", ["hole_id", "x", "y", "z", "azimuth", "dip", "length"], headers.map((r) => ({
  hole_id: txt(r["Hole number"]), x: num(r["converted.coordinates.Easting"] ?? r["coordinates.Easting"]), y: num(r["converted.coordinates.Northing"] ?? r["coordinates.Northing"]),
  z: num(r["coordinates.Elevation"]), azimuth: num(r.Azi_Planned), dip: num(r.Dip_Planned), length: num(r["Actual depth"]),
})).filter((r) => r.hole_id && r.x != null && r.y != null));

// downhole survey (gyro)
write("survey.csv", ["hole_id", "depth", "azimuth", "dip"], read("Diamond Drilling_Downhole Survey.csv").map((r) => ({ hole_id: txt(r["Hole number"]), depth: num(r.Depth), azimuth: num(r.Azimuth), dip: num(r.Dip) })).filter((r) => r.hole_id && r.depth != null && r.azimuth != null && r.dip != null));

// lithology — the logged unit code (MX "Lith1_GF_Code") with the geologist's description
const lith = read("Diamond Drilling_Lithology Log.csv");
const lithCode = Object.keys(lith[0]).find((k) => /Lith1_GF_Code/i.test(k));
const lithNote = Object.keys(lith[0]).find((k) => /^Lithological_Log\.Comments$/i.test(k)) || Object.keys(lith[0]).find((k) => /comments?$/i.test(k) && !/Lith2/i.test(k));
write("litho.csv", ["hole_id", "from", "to", "lithology", "description"], lith.map((r) => ({ ...interval(r), lithology: txt(r[lithCode]), description: lithNote ? txt(r[lithNote]) : "" })).filter((r) => okInterval(r) && r.lithology));

// alteration — the dominant (first) alteration code
write("alt.csv", ["hole_id", "from", "to", "assemblage"], read("Diamond Drilling_Alteration Log.csv").map((r) => ({ ...interval(r), assemblage: txt(r.Alt1_Code) })).filter((r) => okInterval(r) && r.assemblage));

// veins — the first vein composition of each logged vein interval
write("vein.csv", ["hole_id", "from", "to", "type"], read("Diamond Drilling_Vein Log.csv").map((r) => ({ ...interval(r), type: txt(r.Vein1_Comp) })).filter((r) => okInterval(r) && r.type));

// mineralisation — every logged sulphide (Min1..Min4) with its percent
const minRows = [];
for (const r of read("Diamond Drilling_Mineralisation Log.csv")) {
  const iv = interval(r);
  if (!okInterval(iv)) continue;
  for (let k = 1; k <= 4; k++) { const m = txt(r[`Min${k}_Code`]); if (m) minRows.push({ ...iv, mineral: m, percent: num(r[`Min${k}_pct`]) }); }
}
write("mnlgy.csv", ["hole_id", "from", "to", "mineral", "percent"], minRows);

// geotechnical — RQD %
write("geotech.csv", ["hole_id", "from", "to", "rqd_pct"], read("Diamond Drilling_Geotechnical Data.csv").map((r) => ({ ...interval(r), rqd_pct: num(r.RQD_Pct) })).filter((r) => okInterval(r) && r.rqd_pct != null));

// magnetic susceptibility — the average of the three readings (SI ×10⁻³)
write("magsusc.csv", ["hole_id", "from", "to", "mag_avg_si"], read("Diamond Drilling_Magnetic Susceptibility.csv").map((r) => ({ ...interval(r), mag_avg_si: num(r.Ave_Reading) })).filter((r) => okInterval(r) && r.mag_avg_si != null));

// specific gravity — measured bulk density
write("sg.csv", ["hole_id", "from", "to", "sg"], read("Diamond Drilling_Specific Gravity.csv").map((r) => ({ ...interval(r), sg: num(r.BulkDens_Calc) })).filter((r) => okInterval(r) && r.sg != null));

// structures — oriented-core events: type with alpha / beta (GeoStrix orients them from the hole's survey)
write("structure.csv", ["hole_id", "depth_m", "structure_type", "alpha", "beta"], read("Diamond Drilling_Downhole Structure Event Log.csv").map((r) => ({ hole_id: txt(r["Hole number"]), depth_m: num(r.Depth), structure_type: txt(r.Structure_Type), alpha: num(r.Alpha), beta: num(r.Beta) })).filter((r) => r.hole_id && r.depth_m != null && r.structure_type));

// assays — ALS ME-MS61 four-acid (Al, Ca, Fe, K, Mg, Na, S, Ti in %; the rest ppm) and Au (g/t = ppm). Cu above the
// 10,000 ppm upper limit takes the Cu-OG62 ore-grade result (%, ×10,000); the source's "_plot_" columns are derived
// and left out.
const samples = Papa.parse(readFileSync(path.join(DHDB, "Diamond Drilling_Samples.csv"), "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const PCT = new Set(["Al", "Ca", "Fe", "K", "Mg", "Na", "S", "Ti"]);
const elementCols = Object.keys(samples[0]).filter((h) => /^[A-Z][a-z]?$/.test(h) && h !== "To");
const assayHeader = ["hole_id", "from", "to", "sample_id", ...elementCols.map((e) => `${e}_${PCT.has(e) ? "pct" : "ppm"}`)];
let og = 0;
write("assays.csv", assayHeader, samples.map((r) => {
  const row = { ...interval(r), sample_id: txt(r["Sample Number"]) };
  for (const e of elementCols) {
    let v = num(r[e]);
    if (e === "Cu") { const ogPct = num(r["Cu % Cu-OG62"]); if (ogPct != null) { v = +(ogPct * 10000).toFixed(1); og++; } }
    row[`${e}_${PCT.has(e) ? "pct" : "ppm"}`] = v;
  }
  return row;
}).filter(okInterval));
console.log(`  Cu ore-grade (OG62) values used: ${og}`);

// IP (2023, Scott Geophysics pole-dipole) — the line data files and the GPS station list, as delivered
const IP = path.join(src, "Appendix E - IP Survey Data", "IP Survey 2023", "DataFiles");
for (const f of ["109N.dat", "112N.dat", "115N.dat", "118N.dat", "6200E.dat", "6400E.dat", "2357GPS_All.txt"]) copyFileSync(path.join(IP, f), path.join(out, "ip", f));
console.log("ip/: 6 line files + GPS stations");

// ZTEM 2023 3D inversion (OMF)
copyFileSync(path.join(src, "Appendix C - ZTEM Survey Data", "2023 ZTEM Inversion", "20230814", "Woodjam_ZTEM_mesh.omf"), path.join(out, "ztem_inversion_2023.omf"));
console.log("ztem_inversion_2023.omf");
