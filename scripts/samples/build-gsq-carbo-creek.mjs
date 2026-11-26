// TASKS.csv #4056 — builds sample_data/gsq_carbo_creek/ from two Geological Survey of Queensland open-file reports on EPM 18575 (Carbo Creek, about 135 km
// north-east of Boulia), both by Minotaur Operations Pty Ltd: cr107430 (the final report, 2018: three diamond holes with every log, assays, pXRF, magnetic
// susceptibility and density, ground EM and the IP lines) and cr078224 (the 2013 annual report: the same IP lines as H / D tables and the first ground EM).
// (c) State of Queensland, CC BY 4.0: GSQ confirmed (2026-11-25) that open-file data, company data included, may be used for any purpose with attribution.
//
//   node scripts/samples/build-gsq-carbo-creek.mjs "<cr107430 download: the portal's .zip or its folder>" "<cr078224 download: .zip or folder>"
//
// Each download is unpacked OUTSIDE the repository (scripts/samples/gsqUnpack.mjs: every entry's path checked, inner zips unpacked beside them).
// CONTENTS (for the sample list's categories, TASKS.csv #4094): 3 diamond holes (collars, surveys, lithology, mineralisation, structure, veins, assays
// with 2 inline standards, pXRF, magnetic susceptibility, density); IP: 7 dipole-dipole lines (Zonge TQIPdb tables with their station files); ground EM:
// 4 in-loop TEM files (Maxwell .tem, MGA94 zone 54); mapping: the report area (shapefile). No terrain, no grids.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { reportFiles, listFiles, readTable, writeCsv, overlaps } from "./gsqUnpack.mjs";
import { azimuthToGridOffset, loadIgrf } from "../../src/lib/azimuthRef.js";
import { parseTemReceiver } from "../../src/lib/maxwellTem.js";

const [srcA, srcB] = process.argv.slice(2);
if (!srcA || !srcB) { console.error('usage: node scripts/samples/build-gsq-carbo-creek.mjs "<cr107430 .zip or folder>" "<cr078224 .zip or folder>"'); process.exit(1); }
const out = path.resolve("sample_data/gsq_carbo_creek");
const readme = existsSync(path.join(out, "README.md")) ? readFileSync(path.join(out, "README.md")) : null; // the README is written by hand: kept
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
if (readme) writeFileSync(path.join(out, "README.md"), readme);
mkdirSync(path.join(out, "geophysics", "ip"), { recursive: true });
mkdirSync(path.join(out, "geophysics", "em"), { recursive: true });
const EPSG = 28354; // MGA94 zone 54: the collars' CollarGrid (MGA94_54) and the EM files' names (_mga54)

const A = await reportFiles(srcA, "cr107430"), B = await reportFiles(srcB, "cr078224");
const findIn = (rep, re) => { const f = listFiles(rep.root).find((x) => re.test(x)); if (!f) throw new Error(`not in the download: ${re}`); return path.join(rep.root, f); };
const tableOf = (re) => readTable(findIn(A, re)).rows;
const txt = (v) => String(v ?? "").trim();
const num = (v) => { const s = txt(v); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; };
const iso = (v) => { const m = txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null; }; // d/mm/yyyy
const checks = [];

// collars: MGA94 zone 54 as GPS'd by the company; the end-of-hole depth as the length; the date drilled
const collars = tableOf(/cr_107430_12\.txt$/).map((r) => ({ hole_id: txt(r.SiteID), x: num(r.Collar_mE), y: num(r.Collar_mN), z: num(r.CollarRL), length: num(r.EOHDepth),
  hole_type: "DD", collar_method: txt(r.CollarMethod), collar_reliability: txt(r.CollarReliability), date: iso(r.CollarDate), epsg: EPSG, surveyDate: iso(r.SurveyDate) }))
  .filter((c) => c.hole_id && c.x != null && c.y != null && c.z != null);
writeCsv(path.join(out, "collars.csv"), ["hole_id", "x", "y", "z", "length", "hole_type", "collar_method", "collar_reliability", "date", "epsg"], collars);
const holes = new Set(collars.map((c) => c.hole_id));
checks.push(`holes: ${collars.length} (grid ${[...new Set(tableOf(/cr_107430_12\.txt$/).map((r) => txt(r.CollarGrid)))].join(", ")} -> EPSG:${EPSG})`);

// survey: the azimuths are MAGNETIC (Grid = Magnetic on every row, SurveyGrid = Mag on the collars): turned to grid azimuths with the IGRF declination at each
// hole for the survey's own date (the hole's date where a station has none); the magnetic azimuth kept beside. Dips are negative down, as GeoStrix reads them.
await loadIgrf();
const byHole = new Map(collars.map((c) => [c.hole_id, c]));
let offs = [];
const survey = tableOf(/cr_107430_13\.txt$/).map((r) => {
  const c = byHole.get(txt(r.Hole_ID)), azm = num(r.Azimuth);
  if (!c || azm == null) return null;
  const when = iso(r.SurveyDate) || c.surveyDate || c.date, o = azimuthToGridOffset("magnetic", c.x, c.y, EPSG, when)?.offset;
  if (!Number.isFinite(o)) throw new Error(`no declination for ${c.hole_id} on ${when}`);
  offs.push(o);
  return { hole_id: c.hole_id, depth: num(r.DepthAt), azimuth: +(((azm + o) % 360 + 360) % 360).toFixed(2), dip: num(r.Dip), azimuth_magnetic: azm, method: txt(r.Method), reliability: txt(r.Reliability) };
}).filter((r) => r && r.depth != null && r.dip != null);
writeCsv(path.join(out, "survey.csv"), ["hole_id", "depth", "azimuth_grid=azimuth", "dip", "azimuth_magnetic", "method", "reliability"], survey);
checks.push(`survey: ${survey.length} stations, magnetic -> grid by ${Math.min(...offs).toFixed(2)} to ${Math.max(...offs).toFixed(2)} degrees (IGRF at each survey date)`);

// interval logs (personal names, LoggedBy, left out)
const interval = (re, map, name, header) => {
  const rows = tableOf(re).map((r) => ({ hole_id: txt(r.SiteID), from: num(r.DepthFrom), to: num(r.DepthTo), ...map(r) })).filter((r) => holes.has(r.hole_id) && r.from != null && r.to != null && r.to > r.from);
  writeCsv(path.join(out, name), ["hole_id", "from", "to", ...header], rows);
  checks.push(`${name}: ${rows.length} intervals, ${overlaps(rows).length} overlapping`);
  return rows;
};
const join = (...v) => v.map(txt).filter(Boolean).join("; ");
const litho = interval(/cr_107430_14\.txt$/, (r) => ({ lithology: txt(r.Lithology1), lithology2: txt(r.Lithology2), colour: join(r.L1Shade1, r.L1Colour1), minerals: join(r.Mineral1, r.Mineral2, r.Mineral3), grain_size: txt(r.Grainsize), weathering: txt(r.Weathering), comments: txt(r.Comments) }),
  "litho.csv", ["lithology", "lithology2", "colour", "minerals", "grain_size", "weathering", "comments"]);
writeCsv(path.join(out, "weath.csv"), ["hole_id", "from", "to", "weathering"], litho.filter((r) => r.weathering));
interval(/cr_107430_15\.txt$/, (r) => ({ mineral: txt(r.Min1), mineral_pct: num(r.Min1PCT), style: txt(r.Min1Mode), mineral2: txt(r.Min2), mineral2_pct: num(r.Min2PCT), style2: txt(r.Min2Mode), magnetite_pct: num(r.MagnetitePCT), comments: txt(r.Comments) }),
  "mineralisation.csv", ["mineral", "mineral_pct", "style", "mineral2", "mineral2_pct", "style2", "magnetite_pct", "comments"]);
interval(/cr_107430_16\.txt$/, (r) => ({ structure: txt(r.StructureType), comments: txt(r.Comments) }), "struct_zones.csv", ["structure", "comments"]); // intervals, no alpha / beta logged: Structural zones (a structure.csv would be read as planes)
interval(/cr_107430_17\.txt$/, (r) => ({ vein: join(r.VeinMin1, r.VeinMin2, r.VeinMin3), vein_mineral1: txt(r.VeinMin1), vein_mineral2: txt(r.VeinMin2), vein_mineral3: txt(r.VeinMin3), comments: txt(r.Comments) }),
  "veins.csv", ["vein_type=vein", "vein_mineral1", "vein_mineral2", "vein_mineral3", "comments"]);

// assays: the lab's columns as they are ("Au (ppm)": the unit in the name, read by the assay import); "<0.005" is the lab's below-detection value and kept;
// the two inline certified standards (Type = Standard, a Standard ID) marked sample_type Standard, so GeoStrix keeps them out of the grades (QC)
const raw = tableOf(/cr_107430_18\.txt$/);
const els = Object.keys(raw[0] || {}).filter((h) => /\((ppm|ppb|%)\)$/.test(h));
const assays = raw.map((r) => ({ hole_id: txt(r.HOLEID), from: num(r["Depth From"]), to: num(r["Depth To"]), sample_id: txt(r.SampleID), sample_type: txt(r.Type) === "Standard" ? "Standard" : "Sample", standard_id: txt(r["Standard ID"]),
  ...Object.fromEntries(els.map((e) => [e, txt(r[e])])) })).filter((r) => r.sample_type === "Standard" || (holes.has(r.hole_id) && r.from != null && r.to != null && r.to > r.from));
writeCsv(path.join(out, "assays.csv"), ["hole_id", "from", "to", "sample_id", "sample_type", "standard_id", ...els], assays);
const samples = assays.filter((r) => r.sample_type === "Sample");
checks.push(`assays: ${samples.length} intervals (${overlaps(samples).length} overlapping), ${assays.length - samples.length} QC standard(s) flagged, ${els.filter((e) => !/^pass/i.test(e)).length} elements${els.some((e) => /^pass/i.test(e)) ? " and the crushing check (Pass2mm %)" : ""}`);

// pXRF (a handheld Niton on core: readings at a depth, with the instrument's error per element); the reading's operator, time and sequence left out
const px = tableOf(/cr_107430_20\.txt$/);
const pxEls = Object.keys(px[0] || {}).filter((h) => /\(ppm\)$/.test(h));
const pxrf = px.map((r) => ({ hole_id: txt(r.LOCATION), depth: num(r["Depth(m)"]), sample_type: txt(r.Type), ...Object.fromEntries(pxEls.map((e) => [e, txt(r[e])])) })).filter((r) => holes.has(r.hole_id) && r.depth != null);
writeCsv(path.join(out, "pxrf.csv"), ["hole_id", "from=depth", "to=depth", "sample_type", ...pxEls] /* a reading at one depth: From = To (the pXRF import needs both) */, pxrf);
checks.push(`pxrf.csv: ${pxrf.length} readings (${pxEls.length / 2} elements with their errors), sample types ${[...new Set(pxrf.map((r) => r.sample_type))].join(", ")}`);

// point logs: magnetic susceptibility (SI x 10^-3) and density, each at a depth
const point = (re, hole, depth, value, name, col) => {
  const rows = tableOf(re).map((r) => ({ hole_id: txt(r[hole]), depth: num(r[depth]), [col]: num(r[value]) })).filter((r) => holes.has(r.hole_id) && r.depth != null && r[col] != null);
  writeCsv(path.join(out, name), ["hole_id", "depth", col], rows);
  checks.push(`${name}: ${rows.length} readings`);
};
point(/cr_107430_19\.txt$/, "Hole ID", "Depth", "Mag Susc SIx10-3", "magsus.csv", "magsus_si_e3");
point(/cr_107430_21\.txt$/, "HOLE_ID", "Depth", "Specific Gravity (g/cc)", "density.csv", "density_gcc");

// geophysics. IP: the 7 dipole-dipole lines of 2012-2013 (Zonge TQIPdb plot-point tables, .dat, with the stations' MGA coordinates, .utm.stn); cr078224
// holds the same lines as H / D tables (not copied twice); the plot pictures, the receiver's raw files and the field sheets left out.
const near = (pts) => collars.map((c) => Math.round(Math.min(...pts.map(([x, y]) => Math.hypot(x - c.x, y - c.y)))));
const ipLines = listFiles(A.root).filter((f) => /\/Line_[^/]+\.dat$/i.test(f));
for (const f of ipLines) {
  const dir = path.dirname(path.join(A.root, f)), line = path.basename(f).replace(/^Line_|\.dat$/gi, "");
  const stnName = listFiles(dir).find((x) => /\.utm\.stn$/i.test(x));
  copyFileSync(path.join(A.root, f), path.join(out, "geophysics", "ip", `Line_${line}.dat`));
  const stn = readFileSync(path.join(dir, stnName), "latin1");
  writeFileSync(path.join(out, "geophysics", "ip", `${line}.utm.stn`), stn);
  const pts = stn.split(/\r?\n/).map((l) => l.trim().split(/[\s,]+/).map(Number)).filter((a) => a.length >= 3 && a[1] > 1e5 && a[2] > 1e6).map((a) => [a[1], a[2]]);
  checks.push(`IP line ${line}: ${pts.length} stations, nearest to each hole ${near(pts).join(" / ")} m`);
}
const crossed = (m) => m.filter((d) => d <= 100).length;
// EM: the in-loop TEM files in MGA94 zone 54 whose stations come within 3.5 km of a hole (of the six); cr078224's copies of the same lines and the Kite
// prospect's files (cr107430_9, on local line coordinates, 15-20 km away) left out
const ems = listFiles(A.root).filter((f) => /_mga54\.tem$/i.test(f));
for (const f of ems) {
  const m = parseTemReceiver(readFileSync(path.join(A.root, f), "latin1"));
  const pts = m.stations.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => [p.x, p.y]), d = near(pts);
  if (Math.min(...d) > 3500) { checks.push(`EM ${path.basename(f)}: left out (nearest station ${Math.min(...d)} m from a hole)`); continue; }
  copyFileSync(path.join(A.root, f), path.join(out, "geophysics", "em", path.basename(f)));
  checks.push(`EM ${path.basename(f)}: ${m.stations.length} stations (${m.config}), nearest to each hole ${d.join(" / ")} m`);
}
// mapping: the report's area (the GSQ shapefile, GDA2020 longitude / latitude), as delivered
copyFileSync(findIn(A, /(^|\/)107430\.zip$/), path.join(out, "report_area_epm18575.zip"));

const size = listFiles(out).reduce((t, f) => t + statSync(path.join(out, f)).size, 0);
checks.push(`sample size: ${(size / 1e6).toFixed(2)} MB in ${listFiles(out).length} files`);
if (A.refused.length || B.refused.length) checks.push(`unpacker refused ${A.refused.length + B.refused.length} entries`);
console.log(checks.join("\n"));
writeFileSync(path.join(out, "build-checks.txt"), checks.join("\n") + "\n");
