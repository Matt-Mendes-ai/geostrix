// TASKS.csv #4056 — builds sample_data/gsq_edinburgh_park/ from the Geological Survey of Queensland open-file report cr058516 (EPM 15969, Edinburgh Park,
// west of Bowen): Cleveland Minerals Pty Ltd's 2009 annual report, with 23 RC holes over three prospects, their logs, magnetic susceptibility and assays
// (with duplicates and standards), stream, rock and soil geochemistry (with QC), six IP lines and a ground magnetic survey.
// (c) State of Queensland, CC BY 4.0: GSQ confirmed (2026-11-25) that open-file data, company data included, may be used for any purpose with attribution.
//
//   node scripts/samples/build-gsq-edinburgh-park.mjs "<cr058516 download: the portal's .zip or its folder>"
//
// The download is unpacked OUTSIDE the repository (scripts/samples/gsqUnpack.mjs: every entry's path checked, inner zips unpacked beside them).
// CONTENTS (for the sample list's categories, TASKS.csv #4094): 23 holes (collars, surveys, lithology, alteration, veins, sulphides, magnetic susceptibility,
// assays with duplicates and standards); surface geochemistry: stream sediments, rock chips, soils (with standards and duplicates); IP: 6 lines (electrodes at
// their map positions, chargeability and resistivity); magnetics: the ground survey (points); mapping: the report area (shapefile). No terrain, no grids.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { reportFiles, listFiles, readTable, writeCsv, overlaps } from "./gsqUnpack.mjs";

const [src] = process.argv.slice(2);
if (!src) { console.error('usage: node scripts/samples/build-gsq-edinburgh-park.mjs "<cr058516 .zip or folder>"'); process.exit(1); }
const out = path.resolve("sample_data/gsq_edinburgh_park");
const readme = existsSync(path.join(out, "README.md")) ? readFileSync(path.join(out, "README.md")) : null; // the README is written by hand: kept
rmSync(out, { recursive: true, force: true });
for (const d of ["geophysics/ip", "geophysics/mag"]) mkdirSync(path.join(out, d), { recursive: true });
if (readme) writeFileSync(path.join(out, "README.md"), readme);
const EPSG = 28355; // MGA94 zone 55: the collars' and samples' Grid_ID MGA55 and the IP's X_MGA55 / Y_MGA55. The magnetics' columns say MGA56 but their numbers
// are the same zone-55 eastings as the collars (zone 56 would put them ~600 km east, at sea): taken as zone 55

const R = await reportFiles(src, "cr058516");
const findIn = (re) => { const f = listFiles(R.root).find((x) => re.test(x)); if (!f) throw new Error(`not in the download: ${re}`); return path.join(R.root, f); };
const txt = (v) => String(v ?? "").trim();
const num = (v) => { const s = txt(v).replace(/,/g, ""); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; };
const checks = [];
// a table whose first row is the units of its columns (the drill and surface assay tables): { rows (without that row), unit: { column: unit } }
const withUnits = (k, idCol) => {
  const t = readTable(findIn(new RegExp(`cr_58516_${k}\\.txt$`))), first = t.rows[0] || {};
  const isUnits = !txt(first[idCol]) && Object.values(first).some((v) => /^(ppm|ppb|%)$/i.test(txt(v)));
  const unit = isUnits ? Object.fromEntries(t.headers.map((h) => [h, txt(first[h])]).filter(([, u]) => u)) : {};
  return { headers: t.headers, rows: (isUnits ? t.rows.slice(1) : t.rows).filter((r) => txt(r[idCol])), unit };
};
const plain = (k, idCol) => readTable(findIn(new RegExp(`cr_58516_${k}\\.txt$`))).rows.filter((r) => txt(r[idCol])); // the tables are padded with empty rows

// collars: 23 RC holes (the table has 998 rows: the rest are empty); the logger and the contractor left out
const collars = plain(20, "HOLE_ID").map((r) => ({ hole_id: txt(r.HOLE_ID), x: num(r.GRID_E), y: num(r.GRID_N), z: num(r.RL), length: num(r.DEPTH), hole_type: txt(r.HOLE_TYPE), prospect: txt(r.PROSPECT),
  objective: txt(r.HOLE_OBJECTIVE), coord_type: txt(r.COORD_TYPE), date: txt(r.START), azimuth: num(r.GRID_AZI), azimuth_magnetic: num(r.MAG_AZI), dip: num(r.DIP), epsg: EPSG }))
  .filter((c) => c.x != null && c.y != null && c.z != null);
writeCsv(path.join(out, "collars.csv"), ["hole_id", "x", "y", "z", "length", "hole_type", "prospect", "objective", "coord_type", "date", "epsg"], collars);
const holes = new Set(collars.map((c) => c.hole_id));
checks.push(`holes: ${collars.length} (${[...new Set(collars.map((c) => c.prospect))].join(", ")}), Grid_ID MGA55 -> EPSG:${EPSG}`);

// survey: the collar's grid azimuth and dip for every hole, and the downhole stations where the table has them (grid azimuths, the magnetic kept)
// the table writes three holes' dips positive down and the rest negative (both mean down: an RC hole 182 m long at +60): GeoStrix reads negative as down, so every dip is written negative (TASKS.csv #4094)
const down = (v) => (v == null ? v : -Math.abs(v));
const sv = plain(23, "HOLE_ID").map((r) => ({ hole_id: txt(r.HOLE_ID), depth: num(r.DEPTH), azimuth: num(r.GRID_AZI), dip: down(num(r.DIP)), azimuth_magnetic: num(r.MAG_AZI), method: txt(r.METHOD) })).filter((r) => holes.has(r.hole_id) && r.depth != null && r.azimuth != null && r.dip != null);
const survey = [...collars.filter((c) => c.azimuth != null && c.dip != null && !sv.some((s) => s.hole_id === c.hole_id && s.depth === 0)).map((c) => ({ hole_id: c.hole_id, depth: 0, azimuth: c.azimuth, dip: down(c.dip), azimuth_magnetic: c.azimuth_magnetic, method: "collar" })), ...sv]
  .sort((a, b) => a.hole_id.localeCompare(b.hole_id) || a.depth - b.depth);
writeCsv(path.join(out, "survey.csv"), ["hole_id", "depth", "azimuth_grid=azimuth", "dip", "azimuth_magnetic", "method"], survey);
checks.push(`survey: ${survey.length} stations (${collars.length} collars, ${sv.length} downhole in ${new Set(sv.map((s) => s.hole_id)).size} holes)`);

// logs (274 logged intervals in a padded table): lithology, alteration, veins, sulphides (the per-mineral per cents: magnetite, galena, sphalerite,
// chalcopyrite, pyrrhotite, pyrite)
const L = plain(21, "HOLE ID").map((r) => ({ r, hole_id: txt(r["HOLE ID"]), from: num(r.FROM), to: num(r.TO) })).filter((x) => holes.has(x.hole_id) && x.from != null && x.to != null && x.to > x.from);
const iv = (name, header, map, keep = () => true) => { const rows = L.map((x) => ({ hole_id: x.hole_id, from: x.from, to: x.to, ...map(x.r) })).filter(keep); writeCsv(path.join(out, name), ["hole_id", "from", "to", ...header], rows); checks.push(`${name}: ${rows.length} intervals, ${overlaps(rows).length} overlapping`); return rows; };
const join = (...v) => v.map(txt).filter(Boolean).join("; ");
iv("litho.csv", ["lithology", "qualifier", "texture", "minerals", "colour", "weathering", "oxidation", "comments"], (r) => ({ lithology: txt(r["LITH CODE"]), qualifier: txt(r["LITH QUAL"]), texture: txt(r["LITH TEXT"]), minerals: join(r["LITH  MIN1"], r["LITH  MIN2"], r["LITH  MIN3"]), colour: join(r[" COL QUAL"], r.COL), weathering: txt(r.W), oxidation: txt(r.OX), comments: txt(r.COMMENT) }), (r) => r.lithology || r.comments);
iv("alt.csv", ["alteration", "intensity", "minerals"], (r) => ({ alteration: txt(r["ALTN TYPE"]), intensity: txt(r["ALTN INT"]), minerals: join(r["ALTN MIN1"], r["ALTN MIN2"]) }), (r) => r.alteration);
iv("veins.csv", ["vein_type=vein", "vein_pct", "minerals"], (r) => ({ vein: txt(r["VEIN TYPE"]), vein_pct: num(r["VEIN %"]), minerals: join(r["VEIN MIN1"], r["VEIN MIN2"]) }), (r) => r.vein);
const SUL = [["Mt%", "magnetite"], ["Gn%", "galena"], ["Sp%", "sphalerite"], ["Cp%", "chalcopyrite"], ["Po%", "pyrrhotite"], ["PY%", "pyrite"]];
iv("sulphides.csv", ["mineralisation", "mineralisation_pct", ...SUL.map(([, n]) => `${n}_pct`)], (r) => ({ mineralisation: txt(r["MINZ TYPE"]) || SUL.filter(([c]) => num(r[c]) > 0).map(([, n]) => n).join("; ") /* no type logged: the minerals given a % name it */, mineralisation_pct: num(r["MINZ %"]), ...Object.fromEntries(SUL.map(([c, n]) => [`${n}_pct`, num(r[c])])) }),
  (r) => r.mineralisation || SUL.some(([, n]) => r[`${n}_pct`] > 0));

// magnetic susceptibility: chip intervals (GMS2, x 10^-5 SI) with room for four readings and their average; only the first reading is filled, so it is
// the value, given here in 10^-3 SI as the other samples; the sampler left out
const ms = plain(22, "HOLE_ID").map((r) => ({ hole_id: txt(r.HOLE_ID), from: num(r.From), to: num(r.To), avg: num(r["Magsus av"]) ?? num(r["Magsus 1"]) })).filter((r) => holes.has(r.hole_id) && r.from != null && r.to != null && r.to > r.from && r.avg != null)
  .map((r) => ({ hole_id: r.hole_id, from: r.from, to: r.to, magsus_si_e3: +(r.avg / 100).toPrecision(6) }));
writeCsv(path.join(out, "magsus.csv"), ["hole_id", "from", "to", "magsus_si_e3"], ms);
checks.push(`magsus.csv: ${ms.length} intervals (GMS2, 10^-5 SI read, given as 10^-3 SI), ${overlaps(ms).length} overlapping`);

// assays: the units are the table's second row. Iron is given twice (ppm and %): the % column kept. The 28 field duplicates (Samp_Type Dup, the second of a
// DUP1 / DUP2 pair at the same depth) and the 28 standards (Std, with their OREAS ids) are marked QC; the original samples are the rest. Gold repeats
// (Au(R)) and screen fire assays (Au(S)) of a few samples left out; negatives are the lab's below-detection values, kept; Pb and Zn stop at 1,000 ppm
// in this suite (the method's ceiling: such values are "1,000 or more")
const A = withUnits(24, "HOLE_ID");
const ELS = A.headers.filter((h) => A.unit[h] && !/^Au\((R|S)\)$/.test(h) && h !== "Fe");
const name = (h) => `${h.replace(/_1$/, "")} (${A.unit[h]})`;
const assays = A.rows.map((r) => { const typ = txt(r.Samp_Type), qc = /^std$/i.test(typ) ? "Standard" : /^dup$/i.test(typ) ? "Duplicate" : "Sample";
  return { hole_id: txt(r.HOLE_ID), from: num(r.From), to: num(r.To), sample_id: txt(r["Sample No."]), sample_type: qc, sample_kind: typ, standard_id: txt(r.Std_Id), duplicate_of: txt(r.Dup_ID), lab: txt(r.Lab),
    ...Object.fromEntries(ELS.map((h) => [name(h), txt(r[h])])) }; }).filter((r) => holes.has(r.hole_id) || r.sample_type !== "Sample");
const samp = assays.filter((r) => r.sample_type === "Sample" && r.from != null && r.to != null && r.to > r.from);
writeCsv(path.join(out, "assays.csv"), ["hole_id", "from", "to", "sample_id", "sample_type", "sample_kind", "standard_id", "duplicate_of", "lab", ...ELS.map(name)], assays);
checks.push(`assays: ${samp.length} intervals (${overlaps(samp).length} overlapping), ${assays.filter((r) => r.sample_type === "Duplicate").length} duplicates and ${assays.filter((r) => r.sample_type === "Standard").length} standards marked QC, ${ELS.length} elements`);

// surface geochemistry (MGA55): stream sediments (two batches), rock chips, soils with their standards and duplicates; the samplers left out
const surface = (ks, file, keep) => {
  const all = ks.flatMap((k) => { const t = withUnits(k, "SampleID"); return t.rows.map((r) => ({ r, unit: t.unit, k })); });
  const els = [...new Set(all.flatMap(({ unit }) => Object.keys(unit)))].filter((h) => !/^Au[12]$/.test(h));
  const cols = els.map((h) => { const u = all.find((a) => a.unit[h])?.unit[h]; return { h, name: `${h} (${u})` }; });
  const rows = all.map(({ r, k }) => { const st = txt(r.Std_Id), dup = txt(r.OrigDupId); return { sample_id: txt(r.SampleID), x: num(r.Easting), y: num(r.Northing), sample_type: st || /^STD$/i.test(txt(r.SampleType)) ? "Standard" : dup ? "Duplicate" : "Sample",
    medium: txt(r.SampleType), standard_id: st, duplicate_of: dup, mesh: txt(r.MeshSize), batch: `table ${k}`, ...Object.fromEntries(cols.map((c) => [c.name, txt(r[c.h])])), epsg: EPSG }; })
    .filter((r) => (r.x != null && r.y != null) || r.sample_type !== "Sample").filter(keep);
  writeCsv(path.join(out, file), ["sample_id", "x", "y", "qc_type=sample_type", "medium", "standard_id", "duplicate_of", "mesh", "batch", ...cols.map((c) => c.name), "epsg"], rows);
  checks.push(`${file}: ${rows.filter((r) => r.sample_type === "Sample").length} samples, ${rows.filter((r) => r.sample_type === "Standard").length} standards, ${rows.filter((r) => r.sample_type === "Duplicate").length} duplicates, ${cols.length} elements`);
};
surface([16, 17], "streams.csv", () => true);
surface([18], "rocks.csv", () => true);
surface([19], "soils.csv", () => true);

// IP: each line's readings with its electrodes at their MAP positions (MGA55): the east-west lines (named by their northing) give the electrodes' eastings
// less 500,000 (T1X ...), the north-south lines (named by their easting) the northings less 7,700,000 (T1Y ...): both restored. Three east-west lines of the
// second table carry no electrode positions at all: left out (counted). The contractor's QC flag (1 = accepted) kept as a column.
const lineRows = new Map();
const ipTable = (k, axis) => {
  const t = readTable(findIn(new RegExp(`cr_58516_${k}\\.txt$`))); let skipped = 0;
  for (const r of t.rows) {
    const line = txt(r.Line), v = Number(line.replace(/^L/i, "")); if (!line || !Number.isFinite(v)) continue;
    const e = ["T1", "T2", "R1", "R2"].map((p) => num(r[`${p}${axis}`])); if (e.some((x) => x == null)) { skipped++; continue; }
    const pos = axis === "X" ? e.map((x) => [x + 500000, v]) : e.map((y) => [v, y + 7700000]);
    const row = { C1X: pos[0][0], C1Y: pos[0][1], C2X: pos[1][0], C2Y: pos[1][1], P1X: pos[2][0], P1Y: pos[2][1], P2X: pos[3][0], P2Y: pos[3][1], Vp: num(r.Vp), I: num(r.I), SP: num(r.Sp), ResMeas: num(r.ResMeas), Mx: num(r.Mx), StdDev: num(r.StdDev), QC: txt(r.QC) };
    (lineRows.get(line) || lineRows.set(line, []).get(line)).push(row);
  }
  return skipped;
};
const skippedIp = ipTable(25, "X") + ipTable(26, "Y");
const near = (pts) => Math.min(...collars.map((c) => Math.min(...pts.map(([x, y]) => Math.hypot(x - c.x, y - c.y)))));
for (const [line, rows] of lineRows) {
  writeCsv(path.join(out, "geophysics", "ip", `${line}.csv`), ["C1X", "C1Y", "C2X", "C2Y", "P1X", "P1Y", "P2X", "P2Y", "Vp", "I", "SP", "ResMeas", "Mx", "StdDev", "QC"], rows);
  checks.push(`IP line ${line}: ${rows.length} readings (${rows.filter((r) => r.QC !== "1").length} not flagged accepted), nearest electrode to a hole ${Math.round(near(rows.flatMap((r) => [[r.C1X, r.C1Y], [r.P1X, r.P1Y]])))} m`);
}
checks.push(`  IP rows with no electrode positions left out: ${skippedIp}`);

// magnetics: the ground survey's readings (corrected and raw total field) at their positions
const mag = plain(27, "Line").map((r) => ({ line: txt(r.Line), x: num(r.X_MGA56), y: num(r.Y_MGA56), elevation: num(r.elevation), mag_corrected: num(r.Mag_Corr), mag_raw: num(r.Mag_Raw), epsg: EPSG })).filter((r) => r.x != null && r.y != null && r.mag_corrected != null);
writeCsv(path.join(out, "geophysics", "mag", "ground_mag.csv"), ["line", "x", "y", "elevation", "mag_corrected", "mag_raw", "epsg"], mag);
checks.push(`ground magnetics: ${mag.length} readings on ${new Set(mag.map((r) => r.line)).size} lines, nearest to a hole ${Math.round(near(mag.filter((_, i) => i % 10 === 0).map((r) => [r.x, r.y])))} m`);
// mapping: the report's area (the GSQ shapefile), as delivered
copyFileSync(findIn(/(^|\/)58516\.zip$/), path.join(out, "report_area_epm15969.zip"));

const size = listFiles(out).reduce((t, f) => t + statSync(path.join(out, f)).size, 0);
checks.push(`sample size: ${(size / 1e6).toFixed(2)} MB in ${listFiles(out).length} files`);
if (R.refused.length) checks.push(`unpacker refused ${R.refused.length} entries`);
console.log(checks.join("\n"));
writeFileSync(path.join(out, "build-checks.txt"), checks.join("\n") + "\n");
