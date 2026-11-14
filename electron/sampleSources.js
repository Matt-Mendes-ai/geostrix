// TASKS.csv #3100 — the BC samples GeoStrix may not ship. BC's copyright terms do not allow redistributing ARIS data without the
// Province's written permission (ARIS digital data has no open licence: the BC Data Catalogue lists it "Access Only"), so the installer
// leaves out Harry, Perk-Rocky, Silvertip and Woodjam. On request, the first three are downloaded from the Province's public servers and
// converted on this computer with the same steps that made the copies in the repo (each sample's README; scripts/samples/build-*.mjs call
// these converters too), into <userData>/sample_data/<dir>. Woodjam is not offered: its ARIS package is 1.94 GB (Matt, 2026-11-12).
// Plain Node (CommonJS), no Electron: the main process and the build scripts use it, and the tests run it.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// what is downloaded for each sample; bytes: the size the server reported on 2026-11-12 (said before asking)
const SAMPLE_DOWNLOADS = {
  perk: { dir: "perk_rocky", report: "42317", url: "https://apps.nrs.gov.bc.ca/pub/aris/Report/42317Z.zip/", bytes: 18055542 },
  silvertip: { dir: "silvertip", report: "42807", url: "https://apps.nrs.gov.bc.ca/pub/aris/Report/42807Z.zip/", bytes: 15244094 },
  harry: { dir: "harry_property", report: "37584", url: "https://cmscontent.nrs.gov.bc.ca/geoscience/PublicationCatalogue/GeoFile/BCGS_GF2025-11.zip", bytes: 77992695, geofile: "2025-11" },
};
// the samples that are BC ARIS data (not shipped); woodjam has no download
const BC_SAMPLES = { harry: "harry_property", woodjam: "woodjam", perk: "perk_rocky", silvertip: "silvertip" };
const SAMPLE_HOSTS = new Set(["apps.nrs.gov.bc.ca", "cmscontent.nrs.gov.bc.ca"]);
// a file each complete sample folder has (the bundled copy, or a converted download)
const MARKER = { harry_property: "collars.csv", woodjam: "collars.csv", perk_rocky: "PR_Master_StrPoint_Oct17_2024.TAB", silvertip: "collars.csv" };
const SOURCE_FILE = "_source.json"; // written last by a conversion: its presence says the folder is complete

// ---------- a small .zip reader: the central directory, then each wanted entry inflated on its own ----------
const ENTRY_MAX = 512 * 1024 * 1024;
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a .zip file (no end of central directory).");
  const count = buf.readUInt16LE(eocd + 10), cdOffset = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  let p = cdOffset;
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("A damaged .zip (central directory).");
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nLen = buf.readUInt16LE(p + 28), xLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString(flags & 0x800 ? "utf8" : "latin1", p + 46, p + 46 + nLen).replace(/\\/g, "/");
    entries.set(name, { method, compSize, size, local });
    p += 46 + nLen + xLen + cLen;
  }
  const read = (name) => {
    const e = entries.get(name);
    if (!e) throw new Error(`"${name}" is not in the downloaded package.`);
    if (e.size > ENTRY_MAX) throw new Error(`"${name}" is larger than expected.`);
    if (buf.readUInt32LE(e.local) !== 0x04034b50) throw new Error("A damaged .zip (local header).");
    const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28), raw = buf.subarray(start, start + e.compSize);
    if (e.method === 0) return Buffer.from(raw);
    if (e.method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: ENTRY_MAX });
    throw new Error(`"${name}" uses a compression this reader does not know (${e.method}).`);
  };
  return { names: [...entries.keys()], read };
}

// ---------- CSV helpers shared by the converters (the build scripts' own) ----------
let Papa = null;
const papa = () => Papa || (Papa = require("papaparse"));
const parseTable = (text) => papa().parse(String(text).replace(/^﻿/, ""), { header: true, skipEmptyLines: true, delimiter: "" }).data;
const num = (v) => { const s = String(v ?? "").trim(); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; };
const txt = (v) => String(v ?? "").trim();
const csvText = (header, rows) => [header.join(","), ...rows.map((r) => header.map((h) => { const v = r[h]; if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(","))].join("\n") + "\n";

// ---------- Perk-Rocky (ARIS 42317): the report's MapInfo mapping layers, as delivered (the terrain is shipped: Copernicus) ----------
const PERK_LAYERS = ["PR-Litho_interpV3", "PR-Str_interp", "PR_Master_StLines_Sept03_2024", "PR_Master_StrPoint_Oct17_2024", "PR_Master_LithOut_Oct17_2024", "PR-Alt_interpV2"];
// getFile(rel) -> Buffer of "<the 42317Z folder>/<rel>"
function convertPerk(getFile, write) {
  const files = [];
  for (const base of PERK_LAYERS) for (const ext of ["TAB", "MAP", "ID", "DAT"]) { const name = `${base}.${ext}`; write(name, getFile(`Mapping/${name}`)); files.push(name); }
  return files;
}

// ---------- Silvertip (ARIS 42807): the acQuire tables as tidy CSVs (scripts/samples/build-silvertip.mjs, unchanged in what it writes) ----------
function convertSilvertip(getText, write, log = () => {}) {
  const H = "Appendix H - Drill Hole Data and Analytical Results", LOGS = `${H}/GEOLOGY LOGS`, files = [];
  const read = (rel) => parseTable(getText(rel));
  const out = (name, header, rows) => { write(name, Buffer.from(csvText(header, rows))); files.push(name); log(`${name}: ${rows.length} rows`); };
  const interval = (r) => ({ hole_id: txt(r.HOLEID), from: num(r.GEOLFROM), to: num(r.GEOLTO) });
  const okInterval = (r) => r.hole_id && r.from != null && r.to != null && r.to > r.from;
  // collars — surveyed coordinates in NAD83 / UTM zone 9N (EPSG:26909, the NAD83_9N_SUR_* columns); end-of-hole depth
  out("collars.csv", ["hole_id", "x", "y", "z", "length"], read(`${H}/SVT_2024_DRILLHOLE_COLLAR.csv`).map((r) => ({
    hole_id: txt(r.HOLEID), x: num(r.NAD83_9N_SUR_X), y: num(r.NAD83_9N_SUR_Y), z: num(r.NAD83_9N_SUR_Z), length: num(r["EOH (M)"]) ?? num(r["DEPTH (M)"]),
  })).filter((r) => r.hole_id && r.x != null && r.y != null && r.z != null));
  // downhole survey — the TRUSURVEY stations; a hole with none keeps its one PLAN record (drawn at its planned orientation, not vertical)
  const surveyRows = read(`${H}/SVT_2024_DRILLHOLE_SURVEYS.csv`).map((r) => ({ type: txt(r.SURVTYPE), hole_id: txt(r.HOLEID), depth: num(r["DEPTH (M)"]), azimuth: num(r.AZIMUTH), dip: num(r.DIP) }))
    .filter((r) => r.hole_id && r.depth != null && r.azimuth != null && r.dip != null);
  const surveyed = new Set(surveyRows.filter((r) => r.type !== "PLAN").map((r) => r.hole_id));
  const planOnly = surveyRows.filter((r) => r.type === "PLAN" && !surveyed.has(r.hole_id));
  if (planOnly.length) log(`  planned orientation only: ${planOnly.map((r) => `${r.hole_id} (${r.azimuth}/${r.dip})`).join(", ")}`);
  out("survey.csv", ["hole_id", "depth", "azimuth", "dip"], surveyRows.filter((r) => r.type !== "PLAN" || !surveyed.has(r.hole_id)));
  out("litho.csv", ["hole_id", "from", "to", "lithology", "description"], read(`${LOGS}/SVT_2024_GEO_LITHOLOGY.txt`).map((r) => ({ ...interval(r), lithology: txt(r.LIT_ROCK_CODE), description: txt(r.LIT_COMMENTS) })).filter((r) => okInterval(r) && r.lithology));
  out("alt.csv", ["hole_id", "from", "to", "assemblage"], read(`${LOGS}/SVT_2024_GEO_ALTERATION.txt`).map((r) => ({ ...interval(r), assemblage: txt(r.ALT_RX_MIN1_TYPE) })).filter((r) => okInterval(r) && r.assemblage));
  out("breccia.csv", ["hole_id", "from", "to", "breccia_type"], read(`${LOGS}/SVT_2024_GEO_BRECCIA.txt`).map((r) => ({ ...interval(r), breccia_type: txt(r.BX_CLASS) })).filter((r) => okInterval(r) && r.breccia_type));
  out("vein.csv", ["hole_id", "from", "to", "type"], read(`${LOGS}/SVT_2024_GEO_VEIN.txt`).map((r) => ({ ...interval(r), type: txt(r.VEI_1_TYPE) })).filter((r) => okInterval(r) && r.type));
  const minRows = [];
  for (const r of read(`${LOGS}/SVT_2024_GEO_SULPHIDES.txt`)) {
    const iv = interval(r);
    if (!okInterval(iv)) continue;
    for (let k = 1; k <= 9; k++) { const m = txt(r[`SUL_MIN_${k}`]); if (m) minRows.push({ ...iv, mineral: m, percent: num(r[`SUL_MIN_${k}_PCT`]) }); }
  }
  out("mnlgy.csv", ["hole_id", "from", "to", "mineral", "percent"], minRows);
  out("struct_zones.csv", ["hole_id", "from", "to", "struc_code", "intensity", "description"], read(`${LOGS}/SVT_2024_GEO_STRUCT_INTERVALS.txt`)
    .map((r) => ({ ...interval(r), struc_code: txt(r.STIN_TYPE), intensity: txt(r.STIN_INTENSITY), description: txt(r.STIN_DESCRIPTION) })).filter((r) => okInterval(r) && r.struc_code));
  const geo = read(`${LOGS}/SVT_2024_GEO_GEOTECH.txt`);
  out("geotech.csv", ["hole_id", "from", "to", "rqd_pct"], geo.map((r) => ({ ...interval(r), rqd_pct: num(r.RQQ_PCT_D) })).filter((r) => okInterval(r) && r.rqd_pct != null));
  out("recovery.csv", ["hole_id", "from", "to", "recovery_pct"], geo.map((r) => ({ ...interval(r), recovery_pct: num(r.REC_PCT_D) })).filter((r) => okInterval(r) && r.recovery_pct != null));
  out("magsusc.csv", ["hole_id", "depth", "mag_reading"], read(`${LOGS}/SVT_2024_GEO_MAG_SUSC.txt`).map((r) => ({ hole_id: txt(r.HOLEID), depth: num(r.GEOLFROM), mag_reading: num(r.MAG_READING) })).filter((r) => r.hole_id && r.depth != null && r.mag_reading != null));
  out("structure.csv", ["hole_id", "depth_m", "structure_type", "alpha", "beta"], read(`${LOGS}/SVT_2024_GEO_STRUCT_POINTS.txt`)
    .map((r) => ({ hole_id: txt(r.HOLEID), depth_m: num(r.GEOLFROM), structure_type: txt(r.STPT_FEATURE) || "Unspecified", alpha: num(r.STPT_ALPHA), beta: num(r.STPT_BETA) })).filter((r) => r.hole_id && r.depth_m != null && r.alpha != null));
  // assays and surface samples — the "best element" columns (<El>_<unit>_BESTEL), values as delivered
  const elementCols = (headers) => headers.map((h) => { const m = /^([A-Z][a-z]?)_(ppm|pct)_BESTEL$/.exec(h); return m ? { src: h, out: `${m[1]}_${m[2]}` } : null; }).filter(Boolean);
  const assays = read(`${H}/SVT_2024_SAMPLES_DRILLING_ASSAYS.csv`), ae = elementCols(Object.keys(assays[0]));
  out("assays.csv", ["hole_id", "from", "to", "sample_id", ...ae.map((e) => e.out)], assays.map((r) => {
    const row = { hole_id: txt(r.HOLEID), from: num(r.SAMPFROM), to: num(r.SAMPTO), sample_id: txt(r.SAMPLEID) };
    for (const e of ae) row[e.out] = txt(r[e.src]) || null;
    return row;
  }).filter(okInterval));
  const surface = (rel, name, medium) => {
    const rows = read(rel), el = elementCols(Object.keys(rows[0]));
    out(name, ["sample_id", "x", "y", "z", "medium", ...el.map((e) => e.out)], rows.map((r) => {
      const row = { sample_id: txt(r.SAMPLEID), x: num(r.NAD83_9N_BEST_X), y: num(r.NAD83_9N_BEST_Y), z: num(r.NAD83_9N_BEST_Z), medium };
      for (const e of el) row[e.out] = txt(r[e.src]) || null;
      return row;
    }).filter((r) => r.sample_id && r.x != null && r.y != null));
  };
  surface("Appendix G - Rock Sample Locations and Analytical Results/SVT_2024_SAMPLES_SURFACE_ROCKS_UPDATED.csv", "rocks.csv", "rock chip");
  surface(`${H}/SVT_2024_SAMPLES_SURFACE_SOILS.txt`, "soils.csv", "soil");
  surface("Appendix E - Stream Seds Sample Locations and Analytical Results/SVT_2024_SAMPLES_SURFACE_STREAMS.csv", "streams.csv", "stream sediment");
  return files;
}

// ---------- Harry (ARIS 37584, from the BCGS assessment-report drillhole database, GeoFile 2025-11) ----------
// The real tables only: collars, lithology and assays. The repo's copy also has interval layers and two geophysics files synthesized
// around the real assays (its README says which); no conversion can repeat those, so a download does not have them.
// collars: the report's holes (ar_number 37584), coordinates as stored (EPSG:3156); lithology: litho_unit; assays: one row per sample
// (by hole name, then the sample's database order) with 14 elements — Au by fire assay (Au-AA23, or the gravimetric Au-GRA21 where it
// has a number), the rest from the four-acid ICP package (ME-MS61), an over-limit Ag / Cu / Pb / Zn replaced by its ore-grade assay
// (OG62, % read as ppm × 10,000); a value that is not a number ("<0.005", ">10.0" with no ore-grade assay) is left blank.
const HARRY_REPORT = "37584";
const HARRY_ELEMENTS = [["Au", 30, "ppm"], ["Ag", 142, "ppm"], ["Cu", 142, "ppm"], ["Pb", 142, "ppm"], ["Zn", 142, "ppm"], ["As", 142, "ppm"], ["Al", 142, "pct"], ["Fe", 142, "pct"], ["Mg", 142, "pct"], ["Ca", 142, "pct"], ["Na", 142, "pct"], ["K", 142, "pct"], ["Ti", 142, "pct"], ["S", 142, "pct"]];
const HARRY_ORE_GRADE = { Au: [169, 1], Ag: [174, 1], Cu: [36, 10000], Pb: [175, 10000], Zn: [176, 10000] };
// a number as the repo's CSVs write it (Python's float repr: 261.0, 0.018)
const pyFloat = (v) => (v == null ? "" : Number.isInteger(v) ? v.toFixed(1) : String(v));
const fnum = (v) => { if (v == null || v === "") return null; const n = Number(String(v).trim()); return Number.isFinite(n) ? n : null; };
function convertHarry(gpkgPath, write) {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(gpkgPath, { readOnly: true });
  try {
    const collars = db.prepare("SELECT hole_id, hole_name, easting, northing, elevation, azimuth, dip, length FROM collar WHERE ar_number = ? ORDER BY hole_name").all(HARRY_REPORT);
    if (!collars.length) throw new Error(`No hole of report ${HARRY_REPORT} in the database.`);
    const name = new Map(collars.map((c) => [c.hole_id, c.hole_name])), ids = [...name.keys()], q = ids.map(() => "?").join(",");
    const line = (vals) => vals.map((v) => (typeof v === "number" ? pyFloat(v) : v == null ? "" : typeof v === "object" && "csv" in v ? v.csv /* #3308: already CSV-quoted */ : String(v))).join(",");
    const files = [];
    const out = (fname, header, rows) => { write(fname, Buffer.from([header.join(","), ...rows.map(line)].join("\n") + "\n")); files.push(fname); };
    out("collars.csv", ["hole_id", "x", "y", "z", "azimuth", "dip", "length"], collars.map((c) => [c.hole_name, c.easting, c.northing, c.elevation, c.azimuth, c.dip, c.length]));
    // TASKS.csv #3308 (Matt: the lithology description field in the samples) — the database's litho `comments` (101 of Harry's 343 intervals:
    // 'conglomerate', 'altered after 149.5 - Fe-carbonate?') as the description, quoted where it holds a comma; read only when the table has it
    const hasComments = db.prepare("PRAGMA table_info(litho)").all().some((c) => c.name === "comments");
    const lit = db.prepare(`SELECT hole_id, from_depth, to_depth, litho_unit${hasComments ? ", comments" : ""} FROM litho WHERE hole_id IN (${q})`).all(...ids)
      .sort((a, b) => (name.get(a.hole_id) < name.get(b.hole_id) ? -1 : name.get(a.hole_id) > name.get(b.hole_id) ? 1 : a.from_depth - b.from_depth));
    const descCell = (v) => { const t = v == null ? "" : String(v).trim().replace(/\s+/g, " "); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    out("litho.csv", ["hole_id", "from", "to", "lithology", ...(hasComments ? ["description"] : [])], lit.map((r) => [name.get(r.hole_id), r.from_depth, r.to_depth, r.litho_unit, ...(hasComments ? [{ csv: descCell(r.comments) }] : [])]));
    const samples = db.prepare(`SELECT fid, sample_id, hole_id, from_depth, to_depth FROM sample WHERE hole_id IN (${q})`).all(...ids);
    const det = new Map();
    for (const d of db.prepare(`SELECT d.sample_id AS s, a.analyte_abbr AS el, d.method_code AS m, d.abundance AS v FROM determin d JOIN sample s ON s.sample_id = d.sample_id JOIN code_analytes a ON a.analyte_code = d.analyte_code WHERE s.hole_id IN (${q})`).iterate(...ids)) det.set(`${d.s}|${d.el}|${d.m}`, d.v);
    const rows = [];
    for (const s of samples) {
      const vals = HARRY_ELEMENTS.map(([el, m]) => {
        const og = HARRY_ORE_GRADE[el];
        if (og) { const x = fnum(det.get(`${s.sample_id}|${el}|${og[0]}`)); if (x != null) return Math.round(x * og[1] * 1e10) / 1e10; }
        return fnum(det.get(`${s.sample_id}|${el}|${m}`));
      });
      if (vals.every((v) => v == null)) continue;
      rows.push({ hole: name.get(s.hole_id), fid: s.fid, vals: [name.get(s.hole_id), s.from_depth, s.to_depth, ...vals] });
    }
    rows.sort((a, b) => (a.hole < b.hole ? -1 : a.hole > b.hole ? 1 : a.fid - b.fid));
    out("assay_wide.csv", ["hole_id", "from", "to", ...HARRY_ELEMENTS.map(([el, , u]) => `${el}_${u}`)], rows.map((r) => r.vals));
    return files;
  } finally { db.close(); }
}

// ---------- where a sample is, and the conversion of a downloaded package into <root>/<dir> ----------
// -> "bundled" | "downloaded" | "missing"
function sampleState(dir, bundledRoot, userRoot) {
  const m = MARKER[dir];
  if (bundledRoot && m && fs.existsSync(path.join(bundledRoot, dir, m))) return "bundled";
  if (userRoot && fs.existsSync(path.join(userRoot, dir, SOURCE_FILE))) return "downloaded";
  return "missing";
}
// zipBuf: the downloaded package; tmpDir: a scratch folder (Harry's GeoPackage is written there to be opened); -> { files, source }
function convertDownload(id, zipBuf, userRoot, tmpDir, { now = new Date() } = {}) {
  const src = SAMPLE_DOWNLOADS[id];
  if (!src) throw new Error("No download for this sample.");
  const zip = readZip(zipBuf), outDir = path.join(userRoot, src.dir), work = `${outDir}.part`;
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const write = (name, data) => fs.writeFileSync(path.join(work, name), data);
  let files;
  if (id === "perk") files = convertPerk((rel) => zip.read(rel), write);
  else if (id === "silvertip") files = convertSilvertip((rel) => zip.read(rel).toString("utf8"), write);
  else {
    const gpkg = zip.names.find((n) => /\.gpkg$/i.test(n));
    if (!gpkg) throw new Error("The GeoFile package has no GeoPackage in it.");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, `harry_${process.pid}.gpkg`);
    fs.writeFileSync(tmp, zip.read(gpkg));
    try { files = convertHarry(tmp, write); } finally { fs.rmSync(tmp, { force: true }); }
  }
  const source = { sample: id, report: src.report, ...(src.geofile ? { geofile: src.geofile } : {}), url: src.url, downloaded: now.toISOString(), files };
  fs.writeFileSync(path.join(work, SOURCE_FILE), JSON.stringify(source, null, 2));
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.renameSync(work, outDir); // the folder appears complete, or not at all
  return { files, source };
}

module.exports = { SAMPLE_DOWNLOADS, BC_SAMPLES, SAMPLE_HOSTS, MARKER, SOURCE_FILE, PERK_LAYERS, readZip, convertPerk, convertSilvertip, convertHarry, sampleState, convertDownload, csvText };
