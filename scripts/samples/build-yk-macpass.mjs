// TASKS.csv #3496 — builds sample_data/yk_macpass/ from three of the files of Fireweed Metals Corp.'s Macpass dataset (FW_Dataset_20240227):
// MPA_Collar_20240227.csv, MPA_Survey_20240227.csv and MPA_Samples_BD_20240227.csv. 559 holes of the Macpass project, Yukon, drilled 1952-2023,
// on NAD83 / UTM zone 9N (EPSG:26909), with their down-hole surveys and 32,546 sampled intervals (Ag, Pb, Zn and a bulk density). Used with
// Fireweed's written permission for these three files (2026-11-14). Nothing else of
// the dataset's folder (interpretations, topography, sections, PDFs) is read or shipped. The script renames the columns to GeoStrix's own, sorts
// one hole's survey stations by depth and drops nothing else; every count it prints is in the sample's README.
//
//   node scripts/samples/build-yk-macpass.mjs "<path to FW_Dataset_20240227>"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const src = process.argv[2];
if (!src || !existsSync(src)) { console.error("usage: node scripts/samples/build-yk-macpass.mjs <path to FW_Dataset_20240227>"); process.exit(1); }
const out = path.resolve("sample_data/yk_macpass");
mkdirSync(out, { recursive: true });
const read = (p) => Papa.parse(readFileSync(path.join(src, p), "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const num = (v) => { const s = String(v ?? "").trim(); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; };
const txt = (v) => String(v ?? "").trim();
const write = (name, header, rows) => {
  const body = rows.map((r) => header.map((h) => { const v = r[h]; if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(","));
  writeFileSync(path.join(out, name), [header.join(","), ...body].join("\n") + "\n");
  console.log(`${name}: ${rows.length} rows`);
};

// collars: NAD83 / UTM zone 9N on every row (the file's Grid column); the collar's own dip and azimuth are the survey's first station
const rawCollars = read("MPA_Collar_20240227.csv");
if (rawCollars.some((r) => txt(r.Grid) !== "NAD83 / UTM zone 9N")) throw new Error("a collar is not on NAD83 / UTM zone 9N: decide which CRS to keep");
const collars = rawCollars.map((r) => ({ hole_id: txt(r.HoleID), x: num(r.Easting), y: num(r.Northing), z: num(r.Elevation), length: num(r.Length_m), hole_type: txt(r.HoleType), year: num(r.Year), property: txt(r.Property), prospect: txt(r.Prospect), news_release: txt(r.NewsRelease), epsg: 26909 }))
  .filter((r) => r.hole_id && r.x != null && r.y != null && r.z != null && r.length != null);
console.log(`collars read ${rawCollars.length}, kept ${collars.length}, duplicate ids ${collars.length - new Set(collars.map((c) => c.hole_id)).size}`);
write("collars.csv", ["hole_id", "x", "y", "z", "length", "hole_type", "year", "property", "prospect", "news_release", "epsg"], collars);
const holes = new Map(collars.map((c) => [c.hole_id, c]));

// survey: dips negative down (up-holes positive), azimuth on the UTM 9N grid north; stations sorted by depth within a hole (one hole lists two out of order)
const rawSurvey = read("MPA_Survey_20240227.csv");
const survey = rawSurvey.map((r, i) => ({ hole_id: txt(r.HoleID), depth: num(r.Depth_m), azimuth: num(r.Azimuth), dip: num(r.Dip), i })).filter((r) => holes.has(r.hole_id) && r.depth != null && r.azimuth != null && r.dip != null);
const outOfOrder = new Set();
{ const last = new Map(); for (const r of survey) { if (last.has(r.hole_id) && r.depth < last.get(r.hole_id)) outOfOrder.add(r.hole_id); last.set(r.hole_id, r.depth); } }
survey.sort((a, b) => (a.hole_id < b.hole_id ? -1 : a.hole_id > b.hole_id ? 1 : a.depth - b.depth || a.i - b.i));
const surveyHoles = new Set(survey.map((r) => r.hole_id));
console.log(`survey read ${rawSurvey.length}, kept ${survey.length}; holes ${surveyHoles.size}; holes without a collar ${[...new Set(rawSurvey.map((r) => txt(r.HoleID)))].filter((h) => !holes.has(h)).length}; collars without a survey ${collars.filter((c) => !surveyHoles.has(c.hole_id)).length}; holes whose stations were out of order: ${[...outOfOrder].join(", ") || "none"}`);
write("survey.csv", ["hole_id", "depth", "azimuth", "dip"], survey);

// samples: Ag in ppm, Pb and Zn in %, as the source writes them (blank where the source is blank); the bulk density (t/m3) with Method, Comment
// and the low-recovery flag go to sg.csv, a Specific gravity layer whose extra columns GeoStrix keeps as fields
const rawSamples = read("MPA_Samples_BD_20240227.csv");
const samples = rawSamples.map((r) => ({ hole_id: txt(r.HoleID), from: num(r.From_m), to: num(r.To_m), Ag_ppm: num(r.Ag_ppm), Pb_pct: num(r.Pb_pct), Zn_pct: num(r.Zn_pct), sg: num(r.BD_tonnes_m3), method: txt(r.Method), low_recovery: txt(r["LowRecovery_<=85pct"]), comment: txt(r.Comment) }))
  .filter((r) => holes.has(r.hole_id) && r.from != null && r.to != null && r.to > r.from);
const sampleHoles = new Set(samples.map((r) => r.hole_id));
console.log(`samples read ${rawSamples.length}, kept ${samples.length}; holes ${sampleHoles.size}; holes without a collar ${[...new Set(rawSamples.map((r) => txt(r.HoleID)))].filter((h) => !holes.has(h)).length}; collars without samples ${collars.filter((c) => !sampleHoles.has(c.hole_id)).length}`);
write("assays.csv", ["hole_id", "from", "to", "Ag_ppm", "Pb_pct", "Zn_pct"], samples);
const withSg = samples.filter((r) => r.sg != null);
write("sg.csv", ["hole_id", "from", "to", "sg", "method", "low_recovery", "comment"], withSg);
console.log(`bulk density on ${withSg.length} of ${samples.length} intervals; ${samples.length - withSg.length} without (their low-recovery flag Y: ${samples.filter((r) => r.sg == null && r.low_recovery === "Y").length})`);
