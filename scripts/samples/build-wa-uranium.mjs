// TASKS.csv #2168 — builds sample_data/wa_uranium/ from one open-file report (A87304) of the Western Australian WAMEX mineral
// drillhole database (DEMIRS, CC BY 4.0): a calcrete-hosted uranium prospect on the south-western edge of the Canning Basin, 430
// aircore and diamond holes drilled 2009-2010, with downhole gamma logs (eU3O8), multi-element assays, lithology and alteration logs.
// The input is the report's tables as exported from the database by the WA drillhole review (docs/ideas/wa-drillhole-database-review.md:
// one column per attribute, the company's column names, values verbatim); this script renames the columns to GeoStrix's own, joins the
// lab's several method columns per element into one, thins the gamma log and drops the database's no-data codes. Nothing is invented.
//
//   node scripts/samples/build-wa-uranium.mjs "<path to the review's projects\uranium\csv folder>"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const src = process.argv[2];
if (!src || !existsSync(src)) { console.error("usage: node scripts/samples/build-wa-uranium.mjs <path to the uranium csv folder>"); process.exit(1); }
const out = path.resolve("sample_data/wa_uranium");
mkdirSync(out, { recursive: true });
const read = (p) => Papa.parse(readFileSync(path.join(src, p), "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const num = (v) => { const s = String(v ?? "").trim(); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; };
const txt = (v) => String(v ?? "").trim();
const write = (name, header, rows) => {
  const body = rows.map((r) => header.map((h) => { const v = r[h]; if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(","));
  writeFileSync(path.join(out, name), [header.join(","), ...body].join("\n") + "\n");
  console.log(`${name}: ${rows.length} rows`);
};

// collars: MGA94 zone 51 (EPSG:28351) as the company reported them; the RL is the company's MGA_RL; the hole type kept as an attribute.
// The epsg column names the source CRS per row (layers.js EPSG_COL_ALIASES), so a drop of this file asks no CRS question either.
const collars = read("collars.csv").map((r) => ({ hole_id: txt(r.Hole_ID), x: num(r.MGA_East), y: num(r.MGA_North), z: num(r.MGA_RL), length: num(r.Max_Depth), hole_type: txt(r.Hole_Type), epsg: 28351 }))
  .filter((r) => r.hole_id && r.x != null && r.y != null && r.z != null);
write("collars.csv", ["hole_id", "x", "y", "z", "length", "hole_type", "epsg"], collars);
const holes = new Set(collars.map((c) => c.hole_id));

// survey: one collar station per hole (AMG azimuth = grid north, dip negative down); every hole was drilled vertically
write("survey.csv", ["hole_id", "depth", "azimuth", "dip"], read("survey.csv").map((r) => ({ hole_id: txt(r.Hole_ID), depth: num(r.Depth), azimuth: num(r.AMG_Azimuth), dip: num(r.Dip) }))
  .filter((r) => holes.has(r.hole_id) && r.depth != null && r.azimuth != null && r.dip != null));

// lithology: the primary code, its oxidation state and the geologist's comment
write("litho.csv", ["hole_id", "from", "to", "lithology", "oxidation", "description"], read("geology.csv").map((r) => ({ hole_id: txt(r.Hole_ID), from: num(r.From), to: num(r.To), lithology: txt(r.Lith1_Code), oxidation: txt(r.Lith1_Oxidation), description: txt(r.Comments) }))
  .filter((r) => holes.has(r.hole_id) && r.from != null && r.to != null && r.to > r.from && r.lithology));

// alteration: first code and intensity
write("alt.csv", ["hole_id", "from", "to", "assemblage", "intensity"], read("alteration.csv").map((r) => ({ hole_id: txt(r.Hole_ID), from: num(r.mFrom), to: num(r.mTo), assemblage: txt(r.Alt1_Code), intensity: txt(r.Alt1_Int) }))
  .filter((r) => holes.has(r.hole_id) && r.from != null && r.to != null && r.to > r.from && r.assemblage));

// assays: the lab reported each element under several method columns (the database suffixes them _100, _101 ...), and every sample
// was analysed by one method set, so the columns do not overlap: they are joined into one value per element, the fullest column
// first. Units: ppm for the trace elements, % for the majors (Al, Ca, Fe, K), as the value ranges of every method column confirm;
// the one exception is S, reported in % by one method (53 core samples) and in ppm by the other (1,104), joined as ppm.
// "X" and "N/L" mean not analysed / not listed and become blank; a negative number is the lab's below-detection code and is kept
// for GeoStrix to read as such. Rows the database marks Superseded (-1) are left out.
const raw = read("assays_1.csv").filter((r) => txt(r.Superseded) !== "-1");
const ELEMENTS = ["U", "Th", "V", "Cu", "Pb", "Zn", "Ni", "Co", "As", "Mo", "Se", "Ce", "La", "Nd", "Pr", "Sm", "Y", "Sr", "Ba", "Rb", "Mn", "P", "Fe", "Ca", "K", "Mg", "Al", "S"];
const PCT = new Set(["Al", "Ca", "Fe", "K", "Mg", "Na", "Ti"]);
const COLUMN_UNIT = { S: "pct" }; // the plain S column is in %; S_100 is in ppm (the output unit for S)
const cols = Object.keys(raw[0] || {});
const count = (c) => raw.reduce((k, r) => k + (num(r[c]) != null ? 1 : 0), 0);
const pick = {};
for (const el of ELEMENTS) {
  const cands = cols.filter((c) => c === el || new RegExp(`^${el}_\\d+$`).test(c)).map((c) => ({ c, n: count(c) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  if (cands.length && cands[0].n > 100) pick[el] = cands.map((x) => x.c);
}
console.log("assay columns joined:", Object.fromEntries(Object.entries(pick).map(([el, cs]) => [el, cs.join(" > ")])));
const outUnit = (el) => (PCT.has(el) ? "pct" : "ppm");
const cellValue = (el, r) => {
  for (const c of pick[el]) {
    const v = txt(r[c]);
    if (!/^[<>]?\s*-?\d*\.?\d+$/.test(v)) continue; // "X", "N/L", blank: not analysed by this method
    const unit = COLUMN_UNIT[c] || outUnit(el);
    if (unit === outUnit(el) || /^[<>-]/.test(v)) return v; // a below-detection code or qualifier is kept as written
    const n = Number(v);
    return String(unit === "pct" ? n * 10000 : n / 10000); // % -> ppm, ppm -> %
  }
  return "";
};
const aHeader = ["hole_id", "from", "to", "sample_id", ...Object.keys(pick).map((el) => `${el}_${outUnit(el)}`)];
write("assays.csv", aHeader, raw.map((r) => {
  const o = { hole_id: txt(r.Hole_ID), from: num(r.mFrom), to: num(r.mTo), sample_id: txt(r.SampleID) };
  for (const el of Object.keys(pick)) o[`${el}_${outUnit(el)}`] = cellValue(el, r);
  return o;
}).filter((r) => holes.has(r.hole_id) && r.from != null && r.to != null && r.to > r.from));

// downhole gamma: 439,780 readings at 5 cm; thinned to every 10th (0.5 m) to keep the sample small; eU3O8 (ppm) from the cased probe.
// The database's no-data codes go: eU3O8 of -1 and -1,830,000,000 (555 readings) are dropped, a raw count of 10,700,000 cps (10
// readings, a sentinel beside readings that never pass 20,000) is blanked.
const gamma = read("geophysics_2.csv").map((r) => ({ hole_id: txt(r.Hole_ID), depth: num(r.mFrom), raw_cps: num(r.Raw_cps), eU3O8_ppm: num(r.eU3O8_cased_ppm) }))
  .filter((r) => holes.has(r.hole_id) && r.depth != null && r.eU3O8_ppm != null && r.eU3O8_ppm >= 0)
  .map((r) => (r.raw_cps != null && r.raw_cps >= 1e6 ? { ...r, raw_cps: null } : r));
write("gamma.csv", ["hole_id", "depth", "raw_cps", "eU3O8_ppm"], gamma.filter((r, i) => i % 10 === 0));
console.log("done ->", out);
