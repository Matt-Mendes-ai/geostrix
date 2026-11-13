// TASKS.csv #3107 — builds sample_data/wa_lead_zinc/ from one open-file report (A91581) of the Western Australian WAMEX mineral
// drillhole database (DEMIRS, CC BY 4.0): 99 reverse-circulation and diamond holes drilled in 2010 on a carbonate-hosted
// lead-silver-zinc deposit in the east Kimberley (15.45 S, 128.97 E), with their lithology logs and assays. The input is the report's
// tables as exported from the database by the WA drillhole review (docs/ideas/wa-drillhole-database-review.md: one column per
// attribute, the company's column names, values verbatim); this script renames the columns to GeoStrix's own and drops the database's
// no-data code. Nothing is invented.
//
//   node scripts/samples/build-wa-lead-zinc.mjs "<path to the report's csv folder>"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const src = process.argv[2];
if (!src || !existsSync(src)) { console.error("usage: node scripts/samples/build-wa-lead-zinc.mjs <path to the report's csv folder>"); process.exit(1); }
const out = path.resolve("sample_data/wa_lead_zinc");
mkdirSync(out, { recursive: true });
const read = (p) => Papa.parse(readFileSync(path.join(src, p), "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const num = (v) => { const s = String(v ?? "").trim(); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; };
const txt = (v) => String(v ?? "").trim();
const write = (name, header, rows) => {
  const body = rows.map((r) => header.map((h) => { const v = r[h]; if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(","));
  writeFileSync(path.join(out, name), [header.join(","), ...body].join("\n") + "\n");
  console.log(`${name}: ${rows.length} rows`);
};

// collars: GDA94 / MGA zone 52 (EPSG:28352), the company's MGA_East / MGA_North / MGA_RL (surveyed by differential GPS)
const collars = read("collars.csv").map((r) => ({ hole_id: txt(r.Hole_ID), x: num(r.MGA_East), y: num(r.MGA_North), z: num(r.MGA_RL), length: num(r.Max_Depth), hole_type: txt(r.Hole_Type) === "DDH" ? "DD" : txt(r.Hole_Type), epsg: 28352 }))
  .filter((r) => r.hole_id && r.x != null && r.y != null && r.z != null && r.length != null);
write("collars.csv", ["hole_id", "x", "y", "z", "length", "hole_type", "epsg"], collars);
const holes = new Map(collars.map((c) => [c.hole_id, c]));

// survey: the azimuth on the company's grid (Orig_Azimuth, grid id MGA94_52 on every row); dips negative down. Stations logged deeper
// than their hole's total depth are left out and counted.
const sv = read("survey.csv").filter((r) => holes.has(txt(r.Hole_ID)));
if (sv.some((r) => txt(r.Orig_Grid_ID) !== "MGA94_52")) throw new Error("a survey row is not on MGA94_52: decide which azimuth to keep");
const survey = sv.map((r) => ({ hole_id: txt(r.Hole_ID), depth: num(r.Depth), azimuth: num(r.Orig_Azimuth), dip: num(r.Dip) })).filter((r) => r.depth != null && r.azimuth != null && r.dip != null);
const past = survey.filter((r) => r.depth > holes.get(r.hole_id).length + 0.01);
write("survey.csv", ["hole_id", "depth", "azimuth", "dip"], survey.filter((r) => !past.includes(r)));
console.log(`  ${past.length} station(s) deeper than their hole left out: ${[...new Set(past.map((r) => r.hole_id))].join(", ")}`);

// lithology: the primary code, the company's stratigraphic unit (BH_Lith_Code, written with stray spaces and two spellings of one unit
// in the source: trimmed, and CZ read as Cz) and the colour code. No interval overlaps another; the table has no superseded rows.
const geo = read("geology.csv").filter((r) => holes.has(txt(r.Hole_ID)));
const strat = (v) => { const s = txt(v); return s === "CZ" ? "Cz" : s; };
const litho = geo.map((r) => ({ hole_id: txt(r.Hole_ID), from: num(r.mFrom), to: num(r.mTo), lithology: txt(r.Lith1_Code), strat: strat(r.BH_Lith_Code), colour: txt(r.Colour), weathering: txt(r.Weathering) }))
  .filter((r) => r.from != null && r.to != null && r.to > r.from && r.lithology);
write("litho.csv", ["hole_id", "from", "to", "lithology", "strat", "colour"], litho);
write("weath.csv", ["hole_id", "from", "to", "weathering"], litho.filter((r) => r.weathering));

// assays: Pb, Zn and Fe and S in per cent, Ag, Cd and Sb in ppm, one value per element (the source repeats Pb, Zn and S in ppm and
// keeps the laboratory's two instrument columns: the first is the value in the main column, the second a repeat on 490 samples, not
// used). A negative number is the laboratory's below-detection code and is kept for GeoStrix to read as such; -5557 is the database's
// no-data code and becomes blank. Rows with no result in any kept column are left out (most are typed NS, not sampled; the type alone is
// not the test, because 100 rows typed NS in one hole carry results and are kept). No row is flagged superseded.
const raw = read("assays.csv").filter((r) => holes.has(txt(r.Hole_ID)));
if (raw.some((r) => txt(r.Superseded) !== "0" && txt(r.Superseded) !== "")) throw new Error("a superseded assay row: decide which version to keep");
const COLS = [["Pb_pct", "Pb_pct"], ["Zn_pct", "Zn_pct"], ["Ag_ppm", "Ag_ppm"], ["Cd_ppm", "Cd_ppm"], ["Sb_ppm", "Sb_ppm"], ["Fe_pct", "Fe_pct"], ["S_pct", "S_pct"]];
const cell = (v) => { const n = num(v); return n == null || n <= -5557 ? "" : txt(v); };
const assays = raw
  .map((r) => { const o = { hole_id: txt(r.Hole_ID), from: num(r.mFrom), to: num(r.mTo), sample_id: txt(r.SampleID) }; for (const [k, c] of COLS) o[k] = cell(r[c]); return o; })
  .filter((r) => r.from != null && r.to != null && r.to > r.from && COLS.some(([k]) => r[k] !== ""));
write("assays.csv", ["hole_id", "from", "to", "sample_id", ...COLS.map((c) => c[0])], assays);
console.log(`  ${raw.length - assays.length} of ${raw.length} rows had no result and were left out`);

// density: the pycnometer specific gravity measured on 424 samples (SG_SGP_PYC)
write("sg.csv", ["hole_id", "from", "to", "sg"], raw.map((r) => ({ hole_id: txt(r.Hole_ID), from: num(r.mFrom), to: num(r.mTo), sg: num(r.SG_SGP_PYC) })).filter((r) => r.sg != null && r.sg > 0 && r.from != null && r.to > r.from));
console.log("done ->", out);
