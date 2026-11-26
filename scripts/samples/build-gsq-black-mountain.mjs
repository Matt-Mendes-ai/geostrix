// TASKS.csv #4056 — builds sample_data/gsq_black_mountain/ from the Geological Survey of Queensland open-file report cr046541 (EPM 14432, Black Mountain,
// near Mingela, south of Townsville): Minotaur Exploration Ltd's 2007 annual report, with 24 RC holes over two programs (10 in 2006, 14 in 2007), their
// lithology and assays, a gradient-array IP survey, six dipole-dipole IP lines, ground magnetics and the report area.
// (c) State of Queensland, CC BY 4.0: GSQ confirmed (2026-11-25) that open-file data, company data included, may be used for any purpose with attribution.
//
//   node scripts/samples/build-gsq-black-mountain.mjs "<cr046541 download: the portal's .zip or its folder>"
//
// The download is unpacked OUTSIDE the repository (scripts/samples/gsqUnpack.mjs: every entry's path checked, inner zips unpacked beside them).
// CONTENTS (for the sample list's categories, TASKS.csv #4094): 24 holes (collars with a collar azimuth / dip, lithology, assays); IP: a gradient-array
// survey (666 readings as points) and 6 dipole-dipole lines (Zonge-style .dat with their station coordinates); magnetics: the ground survey as line data
// (Geosoft .xyz, every 4th reading); mapping: the report area (shapefile). No terrain, no grids. The downhole IP of 7 holes is in the report, but GeoStrix
// does not read downhole IP yet: not copied.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { reportFiles, listFiles, readTable, writeCsv, overlaps } from "./gsqUnpack.mjs";
import { parseDcipWhitespaceText } from "../../src/lib/dcip.js";
import { converter } from "../../src/lib/reproject.js";

const [src] = process.argv.slice(2);
if (!src) { console.error('usage: node scripts/samples/build-gsq-black-mountain.mjs "<cr046541 .zip or folder>"'); process.exit(1); }
const out = path.resolve("sample_data/gsq_black_mountain");
const readme = existsSync(path.join(out, "README.md")) ? readFileSync(path.join(out, "README.md")) : null; // the README is written by hand: kept
rmSync(out, { recursive: true, force: true });
for (const d of ["geophysics/ip", "geophysics/mag"]) mkdirSync(path.join(out, d), { recursive: true });
if (readme) writeFileSync(path.join(out, "README.md"), readme);
// the 2006 holes, the gradient array and the DDIP stations are AGD66 / AMG zone 55 (their columns say AGD66 / AMG66); the 2007 holes AGD84 / AMG zone 55 ("AMG84")
const AGD66 = 20255, AGD84 = 20355;

const R = await reportFiles(src, "cr046541");
const findIn = (re) => { const f = listFiles(R.root).find((x) => re.test(x)); if (!f) throw new Error(`not in the download: ${re}`); return path.join(R.root, f); };
const tableOf = (k) => readTable(findIn(new RegExp(`cr_46541_${k}\\.txt$`)));
const txt = (v) => String(v ?? "").trim();
const num = (v) => { const s = txt(v).replace(/,/g, ""); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; }; // "489,829.68": thousands separators
const checks = [];
const col = (t, re) => t.headers.find((h) => re.test(h.trim()));

// collars: two tables, one per program, in two datums; each row says its own (the epsg column). The collar's azimuth and dip are the only survey: dips
// written positive down (63.5) and made negative here, as GeoStrix reads them; azimuths as given (grid)
// the 2006 collar table calls hole 11 BMRC02-11 (once); its logs and every assay table call it BMRC06-11: corrected to that (counted)
const fixId = (id) => (id === "BMRC02-11" ? "BMRC06-11" : id);
const c6 = tableOf(2).rows.map((r) => ({ hole_id: fixId(txt(r.Hole_ID)), x: num(r["Easting (AGD66)"]), y: num(r["Northing (AGD66)"]), z: num(r.RL), length: num(r.Depth), azimuth: num(r.Azimuth), dip: num(r.Dip), program: "2006", epsg: AGD66 }));
const c7 = tableOf(3).rows.map((r) => ({ hole_id: txt(r["Hole-ID"]), x: num(r.EastingAMG84), y: num(r.NorthingAMG84), z: num(r["Height (MSL)"]), length: num(r.Depth), azimuth: num(r.Azimuth), dip: num(r.Dip), program: "2007", epsg: AGD84 }));
const collars = [...c6, ...c7].filter((c) => c.hole_id && c.x != null && c.y != null && c.z != null);
// one CRS for the whole sample: the gradient array, the IP stations and the magnetics are AGD66, so the 2007 collars are converted from AGD84 to AGD66 with
// the definitions GeoStrix itself uses (src/lib/epsgRegistry.json, each datum's 7-parameter shift to WGS 84); their own coordinates are kept beside. With
// two datums in one collar file the import takes no project CRS from it, and the report area's longitude / latitude set the project instead (found live)
const reg = JSON.parse(readFileSync(path.resolve("src/lib/epsgRegistry.json"), "utf8"));
const toAgd66 = converter(reg.codes[AGD84][1], reg.codes[AGD66][1]);
let shift = 0;
for (const c of collars) {
  c.x_source = c.x; c.y_source = c.y; c.epsg_source = c.epsg;
  if (c.epsg === AGD84) { const [x, y] = toAgd66.forward([c.x, c.y]); shift = Math.max(shift, Math.hypot(x - c.x, y - c.y)); c.x = +x.toFixed(2); c.y = +y.toFixed(2); c.epsg = AGD66; }
}
checks.push(`collars: ${c6.length} of 2006 (AGD66), ${c7.length} of 2007 converted from AGD84 to AGD66 (moved ${shift.toFixed(1)} m at most)`);
writeCsv(path.join(out, "collars.csv"), ["hole_id", "x", "y", "z", "length", "program", "epsg", "x_source", "y_source", "epsg_source"], collars);
writeCsv(path.join(out, "survey.csv"), ["hole_id", "depth", "azimuth", "dip"], collars.filter((c) => c.azimuth != null && c.dip != null).map((c) => ({ hole_id: c.hole_id, depth: 0, azimuth: c.azimuth, dip: -Math.abs(c.dip) })));
const holes = new Set(collars.map((c) => c.hole_id));
checks.push(`holes: ${collars.length} (${c6.length} of 2006 in AGD66 / AMG55 EPSG:${AGD66}, ${c7.length} of 2007 in AGD84 / AMG55 EPSG:${AGD84}), collar azimuth / dip only; ${tableOf(2).rows.filter((r) => txt(r.Hole_ID) === "BMRC02-11").length} collar id corrected (BMRC02-11 -> BMRC06-11)`);

// lithology: one table per program
const litho = [9, 10].flatMap((k) => tableOf(k).rows.map((r) => ({ hole_id: txt(r["Hole-ID"]), from: num(r.From), to: num(r.To), lithology: txt(r.Lithology) })))
  .filter((r) => holes.has(r.hole_id) && r.from != null && r.to != null && r.to > r.from);
writeCsv(path.join(out, "litho.csv"), ["hole_id", "from", "to", "lithology"], litho);
checks.push(`litho.csv: ${litho.length} intervals, ${overlaps(litho).length} overlapping`);

// assays: five lab batches. 2006: 4 m composites of every hole (table 5), then 1 m re-splits of the mineralised parts of eight (table 6), 5 multi-element
// check assays of composites (table 4) and one 1 m Mo / W re-assay (table 7); 2007: 4 m samples of the fourteen holes (table 8). assays.csv keeps the 1 m
// re-splits, the composites they do not cover, and 2007; the check assays and the composites under a re-split are left out (counted). Units: the 2006
// tables name a unit only for Au, Fe, S and Ti (the rest ppm, as the 2007 table states for the same lab suite); the 2007 Fe, S and Ti in ppm are turned
// to per cent and its gold from ppb to ppm, so each element is one column.
const EL_PCT = new Set(["Fe", "S", "Ti"]);
const parseBatch = (k) => {
  const t = tableOf(k), hid = col(t, /hole/i), fr = col(t, /^from$/i), to = col(t, /^to$/i), sid = col(t, /^(samp|sample|sampleno|sample no)$/i);
  return t.rows.map((r) => {
    const row = { hole_id: txt(r[hid]), from: num(r[fr]), to: num(r[to]), sample_id: txt(r[sid]), batch: `table ${k}`, el: {} };
    for (const h of t.headers) {
      const m = h.trim().match(/^([A-Z][a-z]?)\s*(?:_(ppm|ppb)|\((ppm|ppb)\)|\s*(%)|\(?(?:ppm)?\)?)?$/); if (!m || [hid, fr, to, sid].includes(h) || /^(To|From)$/.test(h.trim())) continue;
      const el = m[1], unit = m[2] || m[3] || (m[4] ? "%" : EL_PCT.has(el) ? "%" : "ppm"), v = num(r[h]);
      if (v == null && !/^</.test(txt(r[h]))) continue;
      let val = txt(r[h]);
      if (el === "Au" && unit === "ppb") { if (row.el.Au != null) continue; val = v != null ? String(+(v / 1000).toPrecision(6)) : val; } // Au (ppm) kept where both
      else if (EL_PCT.has(el) && unit === "ppm") val = v != null ? String(+(v / 10000).toPrecision(6)) : val;
      row.el[el] = val;
    }
    return row;
  }).filter((r) => r.hole_id && r.from != null && r.to != null && r.to > r.from);
};
const b5 = parseBatch(5), b6 = parseBatch(6), b8 = parseBatch(8), b4 = parseBatch(4), b7 = parseBatch(7);
const covered = (r) => b6.some((s) => s.hole_id === r.hole_id && s.from < r.to - 1e-6 && s.to > r.from + 1e-6);
const comps = b5.filter((r) => !covered(r));
let moOg = 0; for (const r of b7) { const s = b6.find((x) => x.hole_id === r.hole_id && x.from === r.from && x.to === r.to); const pct = num(r.el.Mo) ; if (s && pct != null && (num(s.el.Mo) ?? 0) >= 10000) { s.el.Mo = String(Math.round(pct * 10000)); moOg++; } }
const kept = [...b6, ...comps, ...b8].filter((r) => holes.has(r.hole_id));
const els = [...new Set(kept.flatMap((r) => Object.keys(r.el)))].sort();
const unitOf = (el) => (EL_PCT.has(el) ? "%" : "ppm");
writeCsv(path.join(out, "assays.csv"), ["hole_id", "from", "to", "sample_id", "sample_type", "batch", ...els.map((e) => `${e} (${unitOf(e)})`)], kept.map((r) => ({ ...r, sample_type: "Sample", ...Object.fromEntries(els.map((e) => [`${e} (${unitOf(e)})`, r.el[e] ?? ""])) })));
checks.push(`assays.csv: ${kept.length} intervals (${b6.length} 1 m re-splits, ${comps.length} 4 m composites, ${b8.length} of 2007), ${overlaps(kept).length} overlapping; left out: ${b5.length - comps.length} composites under a re-split, ${b4.length} check assays, ${b7.length} Mo / W re-assay (${moOg} used over a capped value); ${els.length} elements`);

// geophysics. Gradient array: 666 readings at their AGD66 positions, as points (resistivity, chargeability and the windows)
const grad = readTable(findIn(/bm_grad_all_agd66\.csv$/));
writeCsv(path.join(out, "geophysics", "ip", "gradient_array.csv"), ["x", "y", "resistivity", "chargeability", "rho_error", "sp", "mx", "epsg"], grad.rows.map((r) => ({ x: num(r.East), y: num(r.North), resistivity: num(r.Rho), chargeability: num(r.MTot), rho_error: num(r.RhoErr), sp: num(r.SP), mx: num(r.Mx), epsg: AGD66 })).filter((r) => r.x != null && r.y != null));
checks.push(`IP gradient array: ${grad.rows.length} readings`);
// DDIP: the six lines (F1x / F2x / M1x / M2x on the local line chainage) as delivered; each line's station file rewritten as a table GeoStrix reads (its
// header said "localE, AMG66E, AMG66N, RL" over space-separated rows): line, station, easting, northing, rl in AGD66
const near = (pts) => collars.map((c) => Math.round(Math.min(...pts.map(([x, y]) => Math.hypot(x - c.x, y - c.y)))));
for (const f of listFiles(R.root).filter((f) => /_final\.dat$/i.test(f))) {
  const line = path.basename(f).replace(/_final\.dat$/i, "").toUpperCase(), d = parseDcipWhitespaceText(readFileSync(path.join(R.root, f), "latin1"));
  copyFileSync(path.join(R.root, f), path.join(out, "geophysics", "ip", `${line}.dat`));
  const stnFile = listFiles(R.root).find((x) => new RegExp(`/${line}\\.stn$`, "i").test(x));
  const rows = readFileSync(path.join(R.root, stnFile), "latin1").split(/\r?\n/).slice(1).map((l) => l.trim().split(/[\s,]+/).map(Number)).filter((a) => a.length >= 3 && a.every(Number.isFinite));
  writeCsv(path.join(out, "geophysics", "ip", `${line}.stn`), ["line", "station", "easting", "northing", "rl"], rows.map((a) => ({ line, station: a[0], easting: a[1], northing: a[2], rl: a[3] ?? "" })));
  checks.push(`IP line ${line}: ${d?.rows?.length ?? 0} readings, ${rows.length} station control points, nearest to the holes ${Math.min(...near(rows.map((a) => [a[1], a[2]])))} m`);
}
// magnetics: the ground survey as Geosoft line data (.xyz: x_agd66, y_agd66, the corrected field and the raw), every 4th reading of each line (152,000
// readings at about 1 m along lines 25-50 m apart: every 4th keeps the anomalies' shapes); the same survey's Intrepid .dat copy left out
const xyz = readFileSync(findIn(/mingela_line\.xyz$/), "latin1").split(/\r?\n/);
let kth = 0, total = 0, keptMag = 0;
const thin = xyz.filter((l) => { if (/^\s*\//.test(l) || /^\s*(Line|Tie)\b/i.test(l) || !l.trim()) { kth = 0; return true; } total++; if (kth++ % 4 === 0) { keptMag++; return true; } return false; });
writeFileSync(path.join(out, "geophysics", "mag", "ground_mag_lines.xyz"), thin.join("\n"));
checks.push(`ground magnetics: ${keptMag} of ${total} readings (every 4th along each line)`);
// mapping: the report's area (the GSQ shapefile), as delivered
copyFileSync(findIn(/(^|\/)46541\.zip$/), path.join(out, "report_area_epm14432.zip"));

const size = listFiles(out).reduce((t, f) => t + statSync(path.join(out, f)).size, 0);
checks.push(`sample size: ${(size / 1e6).toFixed(2)} MB in ${listFiles(out).length} files`);
if (R.refused.length) checks.push(`unpacker refused ${R.refused.length} entries`);
console.log(checks.join("\n"));
writeFileSync(path.join(out, "build-checks.txt"), checks.join("\n") + "\n");
