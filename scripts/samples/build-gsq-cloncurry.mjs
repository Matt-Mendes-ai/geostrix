// TASKS.csv #4056 — builds sample_data/gsq_cloncurry/ from the Geological Survey of Queensland open-file report cr103990 (EPM 16251, Little Sandy Creek,
// about 150 km south of Cloncurry): Chinova Resources Pty Ltd's 2017 annual report, with five RC / diamond holes, downhole EM in three of them, fixed-loop and
// in-loop ground EM, a dipole-dipole IP line and its 2D inversion, rock chips, soils and the prospect's mapping.
// (c) State of Queensland, CC BY 4.0: GSQ confirmed (2026-11-25) that open-file data, company data included, may be used for any purpose with attribution.
//
//   node scripts/samples/build-gsq-cloncurry.mjs "<cr103990 download: the portal's .zip or its folder>"
//
// The download is unpacked OUTSIDE the repository (scripts/samples/gsqUnpack.mjs: every entry's path checked, inner zips unpacked beside them).
// CONTENTS (for the sample list's categories, TASKS.csv #4094): 5 holes (collars, gyro surveys, lithology, magnetic susceptibility, assays with 16 QC
// rows, density, oriented structure); surface geochemistry: 28 rock chips, 468 soils; downhole EM: 3 holes (SMARTem .tem with the loops); ground EM:
// 7 fixed-loop and 3 in-loop TEM lines (Maxwell .tem) with the fixed loop; IP: 1 dipole-dipole line (Zonge TQIPdb .esf) and its 2D inversion as model
// points (X, Y, Z, IP, DC); mapping: two MapInfo TAB layers (mapping and structure). No terrain, no grids.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { reportFiles, listFiles, readTable, writeCsv, overlaps } from "./gsqUnpack.mjs";
import { azimuthToGridOffset } from "../../src/lib/azimuthRef.js";
import { parseTemReceiver } from "../../src/lib/maxwellTem.js";

const [src] = process.argv.slice(2);
if (!src) { console.error('usage: node scripts/samples/build-gsq-cloncurry.mjs "<cr103990 .zip or folder>"'); process.exit(1); }
const out = path.resolve("sample_data/gsq_cloncurry");
const readme = existsSync(path.join(out, "README.md")) ? readFileSync(path.join(out, "README.md")) : null; // the README is written by hand: kept
rmSync(out, { recursive: true, force: true });
for (const d of ["geophysics/dhem", "geophysics/em", "geophysics/ip", "mapping"]) mkdirSync(path.join(out, d), { recursive: true });
if (readme) writeFileSync(path.join(out, "README.md"), readme);
const EPSG = 28354; // MGA94 zone 54: the tables' MGA_Z54 columns and the EM files' GPS_ZONE:54

const R = await reportFiles(src, "cr103990");
const findIn = (re) => { const f = listFiles(R.root).find((x) => re.test(x)); if (!f) throw new Error(`not in the download: ${re}`); return path.join(R.root, f); };
const tableOf = (k) => readTable(findIn(new RegExp(`cr_103990_${k}\\.txt$`))).rows;
const txt = (v) => String(v ?? "").trim();
const num = (v) => { const s = txt(v); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; };
const iso = (v) => { const s = txt(v); const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/) || null; return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const checks = [];
const UNIT = { ppm: "ppm", ppb: "ppb", pct: "%" };
// "Cu_MEICP41s_ppm" / "Cu_ppm_BEST_D" / "Al_pct" -> { el, unit }: the element and its unit, the lab method dropped (the README names them)
const elementOf = (h) => { const m = h.match(/^([A-Z][a-z]?)_(?:([A-Za-z0-9]+)_)?(ppm|ppb|pct)(?:_BEST_D)?$/) || h.match(/^([A-Z][a-z]?)_(ppm|ppb|pct)_BEST_D$/); if (!m) return null; const unit = m[3] || m[2]; return { el: m[1], unit: UNIT[unit], best: /_BEST_D$/.test(h) }; };
// one column per element: the "best" column (the database's choice of method) where there is one, else the first
const elementColumns = (headers) => { const by = new Map(); for (const h of headers) { const e = elementOf(h); if (!e) continue; const prev = by.get(e.el); if (!prev || (e.best && !prev.best)) by.set(e.el, { ...e, col: h }); } return [...by.values()].map((e) => ({ ...e, name: `${e.el} (${e.unit})` })); };

// collars: MGA94 zone 54 as given; three holes share one collar (a pad: an RC hole and its diamond tail, and a second RC hole)
const collars = tableOf(13).map((r) => ({ hole_id: txt(r.HOLEID), x: num(r.MGA_Z54_East), y: num(r.MGA_Z54_North), z: num(r.MGA_Z54_RL), length: num(r.DEPTH), hole_type: txt(r.DrillholeType), date: iso(r.STARTDATE), epsg: EPSG }))
  .filter((c) => c.hole_id && c.x != null && c.y != null && c.z != null);
writeCsv(path.join(out, "collars.csv"), ["hole_id", "x", "y", "z", "length", "hole_type", "date", "epsg"], collars);
const holes = new Set(collars.map((c) => c.hole_id)), byHole = new Map(collars.map((c) => [c.hole_id, c]));
checks.push(`holes: ${collars.length} (${[...new Set(collars.map((c) => c.hole_type))].join(", ")}), EPSG:${EPSG}; ${new Set(collars.map((c) => `${c.x},${c.y}`)).size} distinct collar positions`);

// survey: gyro, TRUE-north azimuths (AZIMUTHGRIDNAME TrueNorth_CLN) turned to grid with the grid convergence at each collar; the true azimuth kept beside
let conv = [];
const survey = tableOf(14).map((r) => {
  const c = byHole.get(txt(r.HOLEID)), az = num(r.AZIMUTH); if (!c || az == null) return null;
  const o = azimuthToGridOffset("true", c.x, c.y, EPSG)?.offset; if (!Number.isFinite(o)) throw new Error(`no convergence for ${c.hole_id}`);
  conv.push(o);
  return { hole_id: c.hole_id, depth: num(r.DEPTH), azimuth: +(((az + o) % 360 + 360) % 360).toFixed(2), dip: num(r.DIP), azimuth_true: az, survey_type: txt(r.SURVTYPE) };
}).filter((r) => r && r.depth != null && r.dip != null);
writeCsv(path.join(out, "survey.csv"), ["hole_id", "depth", "azimuth_grid=azimuth", "dip", "azimuth_true", "survey_type"], survey);
checks.push(`survey: ${survey.length} gyro stations, true -> grid by ${Math.min(...conv).toFixed(2)} to ${Math.max(...conv).toFixed(2)} degrees (grid convergence)`);

const intervals = (rows, name, header) => { const ok = rows.filter((r) => holes.has(r.hole_id) && r.from != null && r.to != null && r.to > r.from); writeCsv(path.join(out, name), ["hole_id", "from", "to", ...header], ok); checks.push(`${name}: ${ok.length} intervals, ${overlaps(ok).length} overlapping`); return ok; };
const join = (...v) => v.map(txt).filter(Boolean).join("; ");
intervals(tableOf(15).map((r) => ({ hole_id: txt(r.HOLEID), from: num(r.FROM), to: num(r.TO), lithology: txt(r.Lith1), lithology_pct: num(r.Lith1_pct), texture: join(r.Lith1Text1, r.Lith1Text2), lithology2: txt(r.Lith2), zone: txt(r.LithZone),
  grain_size: txt(r.Grainsize), colour: join(r.Colour1Int, r.Colour1), mineral: txt(r.Mineral1), mineral_pct: num(r.Mineral1_pct), mineral2: txt(r.Mineral2), mineral2_pct: num(r.Mineral2_pct), comments: txt(r.GeolComments) })),
  "litho.csv", ["lithology", "lithology_pct", "texture", "lithology2", "zone", "grain_size", "colour", "mineral", "mineral_pct", "mineral2", "mineral2_pct", "comments"]);
intervals(tableOf(16).map((r) => ({ hole_id: txt(r.HOLEID), from: num(r.FROM), to: num(r.TO), magsus_si_e3: num(r["Reading10-3"]), instrument: txt(r.MagSusType) })).filter((r) => r.magsus_si_e3 != null), "magsus.csv", ["magsus_si_e3", "instrument"]);

// assays: one column per element as "Cu (ppm)"; RC chips and half core (HC) are samples, the 16 QC rows (lab duplicates / standards inserted with a depth)
// are marked sample_type QC so GeoStrix keeps them out of the grades; the one ICP copper at its 10,000 ppm ceiling takes the ore-grade (CU-OG46) value
const raw = tableOf(17);
const els = elementColumns(Object.keys(raw[0] || {}).filter((h) => h !== "Cu_CUOG46_pct")); // the ore-grade copper only fills the capped ICP value below
let og = 0;
const assays = raw.map((r) => {
  const row = { hole_id: txt(r.HOLEID), from: num(r.FROM), to: num(r.TO), sample_id: txt(r.SAMPLEID), sample_type: txt(r.SAMPLETYPE) === "QC" ? "QC" : "Sample", sample_kind: txt(r.SAMPLETYPE) };
  for (const e of els) row[e.name] = txt(r[e.col]);
  const ogPct = num(r.Cu_CUOG46_pct); if (ogPct != null && (num(r.Cu_MEICP41s_ppm) ?? 0) >= 10000) { row["Cu (ppm)"] = String(Math.round(ogPct * 10000)); og++; }
  return row;
});
const smp = intervals(assays.filter((r) => r.sample_type === "Sample"), "assays_tmp.csv", []);
rmSync(path.join(out, "assays_tmp.csv")); checks.pop();
writeCsv(path.join(out, "assays.csv"), ["hole_id", "from", "to", "sample_id", "sample_type", "sample_kind", ...els.map((e) => e.name)], assays.filter((r) => holes.has(r.hole_id)));
checks.push(`assays: ${smp.length} intervals (${overlaps(smp).length} overlapping), ${assays.filter((r) => r.sample_type === "QC").length} QC rows flagged, ${els.length} elements, ${og} over-range Cu from the ore-grade assay`);

// density: the core's specific gravity by weighing (dry / wet, waxed); the three rows that weigh the lab's reference masses (SG_QC_Standard 1000 / 2000 g) are not core: left out
const sgRows = tableOf(18);
intervals(sgRows.filter((r) => !txt(r.SG_QC_Standard)).map((r) => ({ hole_id: txt(r.HOLEID), from: num(r.GEOLFROM), to: num(r.GEOLTO), sg: num(r.SG) })).filter((r) => r.sg != null), "sg.csv", ["sg"]);
checks.push(`  (${sgRows.filter((r) => txt(r.SG_QC_Standard)).length} reference-mass QC rows left out of sg.csv)`);

// structure: oriented core, alpha / beta at a depth (no true dip / dip direction computed in the file: GeoStrix computes them from the hole's survey)
const st = tableOf(19).map((r) => ({ hole_id: txt(r.HOLEID), depth: num(r.GEOLFROM), alpha: num(r.Alpha), beta: num(r.Beta), structure: txt(r.StructType), line_type: txt(r.LineType), confidence: txt(r.Confidence), comments: txt(r.StructComment) }))
  .filter((r) => holes.has(r.hole_id) && r.depth != null && r.alpha != null);
writeCsv(path.join(out, "structure.csv"), ["hole_id", "depth", "alpha", "beta", "structure", "line_type", "confidence", "comments"], st);
checks.push(`structure.csv: ${st.length} oriented measurements (alpha / beta)`);

// surface geochemistry: rock chips and soils at their GPS positions, one column per element (the database's "best" method where it chose one); the
// sampler's initials and the lab despatch numbers left out
const surface = (k, name, medium, x, y, z, keep) => { // medium: the surface-sample import reads it (with none, every sample is taken as soil)
  const rows = tableOf(k), el = elementColumns(Object.keys(rows[0] || {}));
  const out2 = rows.map((r) => ({ sample_id: txt(r.SAMPLEID), x: num(r[x]), y: num(r[y]), z: num(r[z]), medium, ...Object.fromEntries(keep.map(([to, from]) => [to, txt(r[from])])), ...Object.fromEntries(el.map((e) => [e.name, txt(r[e.col])])), epsg: EPSG }))
    .filter((r) => r.x != null && r.y != null);
  writeCsv(path.join(out, name), ["sample_id", "x", "y", "z", "medium", ...keep.map(([to]) => to), ...el.map((e) => e.name), "epsg"], out2);
  checks.push(`${name}: ${out2.length} samples, ${el.length} elements`);
};
surface(3, "rocks.csv", "rock chip", "MGA_Z54_GPS_X", "MGA_Z54_GPS_Y", "MGA_Z54_GPS_Z", [["sample_type", "Rock_SampType"], ["lithology", "Lith1"], ["mineral", "Mineral1"], ["date", "GeoChemDate"], ["comments", "RockComment"]]);
surface(4, "soils.csv", "soil", "MGA_Z54_E", "MGA_Z54_N", "MGA_Z54_RL", [["sample_type", "Soil_Type"], ["sieve", "Sieve_mesh"], ["depth", "SampDepth"], ["horizon", "Soil_Horizon"], ["date", "GeoChemDate"]]);

// geophysics (as delivered, their names kept)
const near = (pts) => collars.map((c) => Math.round(Math.min(...pts.map(([x, y]) => Math.hypot(x - c.x, y - c.y)))));
// downhole EM: the SMARTem exports (.tem) of the three holes and the loops (.tx); the raw .dat (the same readings before export) and the logger's side files left out
for (const f of listFiles(R.root).filter((f) => /DHEM2017_\d\.tem$|LS_?C?_?DHEM2017_\d\.tx$|LSC_DHEM2017_\d\.tx$/i.test(f))) copyFileSync(path.join(R.root, f), path.join(out, "geophysics", "dhem", path.basename(f)));
checks.push(`downhole EM: ${listFiles(path.join(out, "geophysics", "dhem")).filter((f) => /\.tem$/.test(f)).length} holes (.tem), ${listFiles(path.join(out, "geophysics", "dhem")).filter((f) => /\.tx$/.test(f)).length} loop files`);
// ground EM: fixed-loop (7 lines and the loop) and in-loop (3 lines)
for (const f of listFiles(R.root).filter((f) => /\.tem$/i.test(f) && !/DHEM/i.test(f))) {
  const m = parseTemReceiver(readFileSync(path.join(R.root, f), "latin1")), pts = m.stations.filter((p) => Number.isFinite(p.x)).map((p) => [p.x, p.y]);
  const tag = m.config === "FIXEDLOOP" ? "fixedloop" : "inloop";
  copyFileSync(path.join(R.root, f), path.join(out, "geophysics", "em", `${tag}_${path.basename(f)}`));
  checks.push(`EM ${tag} ${path.basename(f)}: ${m.stations.length} stations, nearest to each hole ${near(pts).join(" / ")} m`);
}
copyFileSync(findIn(/LSC_FLEM_1\.tx$/), path.join(out, "geophysics", "em", "fixedloop_LSC_FLEM_1.tx"));
// IP: the dipole-dipole line (TQIPdb .esf, time-domain windows) and the contractor's 2D inversion as model points; the .mod files have no mesh with them: left out
copyFileSync(findIn(/LSC_DDIP_all\.esf$/), path.join(out, "geophysics", "ip", "LSC_DDIP_all.esf"));
const inv = readTable(findIn(/LSC_3600N_DCIP2D\.csv$/));
writeCsv(path.join(out, "geophysics", "ip", "LSC_3600N_DCIP2D_model.csv"), ["x", "y", "z", "chargeability", "resistivity"], inv.rows.map((r) => ({ x: num(r.X), y: num(r.Y), z: num(r.Z), chargeability: num(r.IP), resistivity: num(r.DC) })).filter((r) => r.x != null && r.y != null && r.z != null));
checks.push(`IP: 1 line (.esf), the 2D model as ${inv.rows.length} points, nearest to each hole ${near(inv.rows.map((r) => [num(r.X), num(r.Y)]).filter(([a, b]) => a != null && b != null)).join(" / ")} m`);
// mapping: the two MapInfo TAB layers, renamed (the source file names carry a person's name); a TAB set is its five files under one base name
for (const [from, to] of [["2017_LSC_Map_TPearson", "lsc_mapping_2017"], ["Sandy Creek Structural", "lsc_structure_mapping"]]) {
  for (const ext of ["TAB", "DAT", "ID", "IND", "MAP"]) copyFileSync(findIn(new RegExp(`${from.replace(/ /g, " ")}\\.${ext}$`)), path.join(out, "mapping", `${to}.${ext}`));
}

const size = listFiles(out).reduce((t, f) => t + statSync(path.join(out, f)).size, 0);
checks.push(`sample size: ${(size / 1e6).toFixed(2)} MB in ${listFiles(out).length} files`);
if (R.refused.length) checks.push(`unpacker refused ${R.refused.length} entries`);
console.log(checks.join("\n"));
writeFileSync(path.join(out, "build-checks.txt"), checks.join("\n") + "\n");
