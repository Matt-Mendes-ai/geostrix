// TASKS.csv #4056 — builds sample_data/gsq_altia_south/ from the Geological Survey of Queensland open-file report cr105798 (EPM 25950, Altia South 2, about
// 80 km south-south-east of Cloncurry): Sandfire Resources NL's 2018 annual report, with nine RC / diamond holes, downhole EM in four of them and the
// in-loop ground EM over them, the drill database's assays, QAQC, pXRF and magnetic susceptibility, and rock chips.
// (c) State of Queensland, CC BY 4.0: GSQ confirmed (2026-11-25) that open-file data, company data included, may be used for any purpose with attribution.
//
//   node scripts/samples/build-gsq-altia-south.mjs "<cr105798 download: the portal's .zip or its folder>"
//
// The download is unpacked OUTSIDE the repository (scripts/samples/gsqUnpack.mjs: every entry's path checked, inner zips unpacked beside them).
// CONTENTS (for the sample list's categories, TASKS.csv #4094): 9 holes (collars, surveys, lithology, alteration, sulphides, veins, assays, the lab QAQC
// table, pXRF, magnetic susceptibility); surface geochemistry: 10 rock chips; downhole EM: 4 holes (Maxwell .tem) and 2 DHEM plates (DXF); ground EM: 1
// in-loop line (Maxwell .tem) with its stations (shapefile). No terrain, no grids, no mapping.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { reportFiles, listFiles, readTable, writeCsv, overlaps } from "./gsqUnpack.mjs";
import { parseTemReceiver } from "../../src/lib/maxwellTem.js";

const [src] = process.argv.slice(2);
if (!src) { console.error('usage: node scripts/samples/build-gsq-altia-south.mjs "<cr105798 .zip or folder>"'); process.exit(1); }
const out = path.resolve("sample_data/gsq_altia_south");
const readme = existsSync(path.join(out, "README.md")) ? readFileSync(path.join(out, "README.md")) : null; // the README is written by hand: kept
rmSync(out, { recursive: true, force: true });
for (const d of ["geophysics/dhem", "geophysics/em"]) mkdirSync(path.join(out, d), { recursive: true });
if (readme) writeFileSync(path.join(out, "README.md"), readme);
const EPSG = 28354; // MGA94 zone 54: the collars' NAT_Grid_ID (MGA94_54)

const R = await reportFiles(src, "cr105798");
const findIn = (re) => { const f = listFiles(R.root).find((x) => re.test(x)); if (!f) throw new Error(`not in the download: ${re}`); return path.join(R.root, f); };
const tableOf = (k) => readTable(findIn(new RegExp(`cr_105798_${k}\\.txt$`))).rows;
const txt = (v) => String(v ?? "").trim();
const num = (v) => { const s = txt(v); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; };
const iso = (v) => { const s = txt(v); const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const isTrue = (v) => /^(true|yes|y|1|-1)$/i.test(txt(v));
const checks = [];
const intervals = (rows, name, header) => { const ok = rows.filter((r) => holes.has(r.hole_id) && r.from != null && r.to != null && r.to > r.from); writeCsv(path.join(out, name), ["hole_id", "from", "to", ...header], ok); checks.push(`${name}: ${ok.length} intervals, ${overlaps(ok).length} overlapping`); return ok; };
const join = (...v) => v.map(txt).filter(Boolean).join("; ");

// collars: the database's national grid (NAT_*, MGA94 zone 54) — the original survey grid is the same here; the surveyors' names left out
const collars = tableOf(6).map((r) => ({ hole_id: txt(r.Hole_ID), x: num(r["NAT_East (m)"]), y: num(r["NAT_North (m)"]), z: num(r["NAT_RL (m)"]), length: num(r["Max_Depth (m)"]), hole_type: txt(r.Hole_Type),
  purpose: txt(r.Hole_Purpose), survey_method: txt(r.Nat_Survey_Method), accuracy: txt(r.Location_Accuracy), epsg: EPSG })).filter((c) => c.hole_id && c.x != null && c.y != null && c.z != null);
writeCsv(path.join(out, "collars.csv"), ["hole_id", "x", "y", "z", "length", "hole_type", "purpose", "survey_method", "accuracy", "epsg"], collars);
const holes = new Set(collars.map((c) => c.hole_id));
checks.push(`holes: ${collars.length} (${[...new Set(collars.map((c) => c.hole_type))].join(", ")}), grid ${[...new Set(tableOf(6).map((r) => txt(r.NAT_Grid_ID)))].join(", ")} -> EPSG:${EPSG}`);

// survey: the database's grid azimuths (NAT_Azimuth, MGA94 zone 54: the magnetic readings with the declination applied, MAG_Azimuth kept beside);
// the camera's operator left out; a station flagged Priority 1 is the database's own choice of two at one depth (none here overlap)
const survey = tableOf(14).map((r) => ({ hole_id: txt(r.Hole_ID), depth: num(r.Depth), azimuth: num(r.NAT_Azimuth), dip: num(r.Dip), azimuth_magnetic: num(r.MAG_Azimuth), method: txt(r.DHSurvey_Method), date: iso(r.Date_Surveyed) }))
  .filter((r) => holes.has(r.hole_id) && r.depth != null && r.azimuth != null && r.dip != null);
writeCsv(path.join(out, "survey.csv"), ["hole_id", "depth", "azimuth_grid=azimuth", "dip", "azimuth_magnetic", "method", "date"], survey);
checks.push(`survey: ${survey.length} stations, grid azimuths from the database (NAT_Grid_ID MGA94_54), magnetic kept`);

// logs: lithology, alteration (up to three), sulphides (up to five), veins (up to two); the logger left out
const lith = tableOf(7);
intervals(lith.map((r) => ({ hole_id: txt(r.Hole_ID), from: num(r["mFrom (m)"]), to: num(r["mto (m)"]), lithology: txt(r.Lith1_Code), lithology_pct: num(r.Lith1_pc), texture: join(r.Lith1_Text1, r.Lith1_Text2), structure: join(r.Lith1_Struct1, r.Lith1_Struct2),
  colour: join(r.Lith1_Colour_Tone, r.Lith1_Colour1), lithology2: txt(r.Lith2_Code), regolith: txt(r.Regolith_Profile) })), "litho.csv", ["lithology", "lithology_pct", "texture", "structure", "colour", "lithology2", "regolith"]);
intervals(lith.map((r) => ({ hole_id: txt(r.Hole_ID), from: num(r["mFrom (m)"]), to: num(r["mto (m)"]), alteration: txt(r.Alt1_Code), intensity: txt(r.Alt1_Int), style: txt(r.Alt1_Style), alteration2: txt(r.Alt2_Code), alteration3: txt(r.Alt3_Code) })).filter((r) => r.alteration),
  "alt.csv", ["alteration", "intensity", "style", "alteration2", "alteration3"]);
const sulph = (r) => [1, 2, 3, 4, 5].map((k) => [txt(r[`Sulph${k}_Code`]), num(r[`Sulph${k}_Pct`])]).filter(([c]) => c);
intervals(lith.map((r) => { const s = sulph(r); return { hole_id: txt(r.Hole_ID), from: num(r["mFrom (m)"]), to: num(r["mto (m)"]), sulphide: s[0]?.[0] || "", sulphide_pct: s[0]?.[1] ?? null, sulphides: s.map(([c, p]) => (p != null ? `${c} ${p}%` : c)).join("; "), total_pct: s.reduce((t, [, p]) => t + (p || 0), 0) || null }; }).filter((r) => r.sulphide),
  "sulphides.csv", ["mineral=sulphide", "mineral_pct=sulphide_pct", "minerals=sulphides", "total_pct"]);
intervals(lith.map((r) => ({ hole_id: txt(r.Hole_ID), from: num(r["mFrom (m)"]), to: num(r["mto (m)"]), vein: txt(r.Vein1_Comp), style: txt(r.Vein1_Style), vein_pct: num(r.Vein1_Pct), vein2: txt(r.Vein2_Comp), vein2_pct: num(r.Vein2_Pct) })).filter((r) => r.vein),
  "veins.csv", ["vein_type=vein", "style", "vein_pct", "vein2", "vein2_pct"]);

// assays: the database's merged table (one column per element and unit, the lab's method columns left out). An element in two units is joined into
// ppm (Cu, Pb, Zn: the ppm value, else the per-cent one x 10,000); gold is Au_ppm (Au1-Au4, the repeat assays, left out). -555 is the database's
// "not analysed" and becomes blank (GeoStrix would read a negative as a detection limit of 555); the other negatives (-0.002, -1, -0.05 …) are the
// lab's below-detection values and are kept. NS rows (not sampled: no analysis) are left out; superseded rows (none here) would be.
const A = tableOf(8);
const UNITS = { ppm: "ppm", ppb: "ppb", pct: "%" };
const SKIP = /^(Au[1-4]_ppm|Au_BLEG_ppb|Au_LWT_ppb|p75um_pct|SUM_pct|STotal_pct|SG_gm_cc|V2O5_ppm)$/;
const elCols = Object.keys(A[0] || {}).filter((h) => /^[A-Z][a-z]?\d?[A-Z]?[a-z]?\d?_(ppm|ppb|pct)$/.test(h) && !SKIP.test(h));
const byEl = new Map();
for (const h of elCols) { const [el, u] = h.split("_"); (byEl.get(el) || byEl.set(el, []).get(el)).push({ h, u }); }
const outCols = [...byEl.entries()].map(([el, cols]) => ({ el, cols, unit: cols.some((c) => c.u === "ppm") && cols.some((c) => c.u === "pct") ? "ppm" : UNITS[cols[0].u] }));
const valueOf = (r, e) => {
  const clean = (v) => { const n = num(v); return n === -555 ? null : txt(v) === "" ? null : txt(v); };
  if (e.cols.length === 1) return clean(r[e.cols[0].h]);
  const ppm = clean(r[e.cols.find((c) => c.u === "ppm").h]); if (ppm != null) return ppm;
  const pct = num(clean(r[e.cols.find((c) => c.u === "pct").h])); return pct == null ? null : pct < 0 ? String(pct * 10000) : String(+(pct * 10000).toPrecision(6));
};
let sentinel = 0; A.forEach((r) => elCols.forEach((h) => { if (num(r[h]) === -555) sentinel++; }));
const assays = A.filter((r) => !isTrue(r.Superseded) && !/^NS$/i.test(txt(r.Sample_Type))).map((r) => ({ hole_id: txt(r.Hole_ID), from: num(r["mFrom (m)"]), to: num(r["mTo (m)"]), sample_id: txt(r.SampleID), sample_type: "Sample",
  sample_kind: txt(r.Sample_Type).toUpperCase(), ...Object.fromEntries(outCols.map((e) => [`${e.el} (${e.unit})`, valueOf(r, e)])) }));
const kept = outCols.filter((e) => assays.some((r) => r[`${e.el} (${e.unit})`] != null)); // a column every kept row has blank (only -555) left out
const asOk = intervals(assays.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !/\(/.test(k) || kept.some((e) => `${e.el} (${e.unit})` === k)))), "assays.csv", ["sample_id", "sample_type", "sample_kind", ...kept.map((e) => `${e.el} (${e.unit})`)]);
checks.push(`  assays: ${A.length} rows in the table, ${A.filter((r) => /^NS$/i.test(txt(r.Sample_Type))).length} NS (not sampled) and ${A.filter((r) => isTrue(r.Superseded)).length} superseded left out, ${sentinel} -555 cells blanked, ${kept.length} element columns; kinds ${[...new Set(asOk.map((r) => r.sample_kind))].join(", ")}`);

// the lab's QC samples (standards, blanks, lab and field duplicates), as their own table; units per element inferred from the raw lab table (cr_105798_13,
// the same element names) against the merged table's ppm / per-cent values for the same core samples, checked to agree within 2 %
const raw = tableOf(13), merged = new Map(A.map((r) => [txt(r.SampleID), r]));
const unitOf = (el) => {
  const tgt = outCols.find((e) => e.el === (el === "Ars" ? "As" : el === "Ind" ? "In" : el)); if (!tgt) return null;
  const ratios = raw.filter((r) => !isTrue(r.Superseded)).map((r) => { const m = merged.get(txt(r.SampleID)); const a = num(r[el]), b = m ? num(valueOf(m, tgt)) : null; return a > 0 && b > 0 ? b / a : null; }).filter((x) => x != null).sort((x, y) => x - y);
  if (ratios.length < 5) return null;
  const med = ratios[ratios.length >> 1]; const unit = tgt.unit === "ppm" ? (Math.abs(med - 1) < 0.02 ? "ppm" : Math.abs(med - 10000) / 10000 < 0.02 ? "%" : Math.abs(med - 0.001) / 0.001 < 0.02 ? "ppb" : null) : Math.abs(med - 1) < 0.02 ? tgt.unit : null;
  return unit;
};
const qcRaw = tableOf(12), qcEls = Object.keys(qcRaw[0] || {}).filter((h) => !/^(SampleID|QAQCType|StandardID|OrigSampleID|batch_no|WtRecvd|p75um|Sample type)$/.test(h) && !/\(2\)$/.test(h));
const qcUnits = new Map(qcEls.map((el) => [el, unitOf(el)]));
const qcNamed = qcEls.filter((el) => qcUnits.get(el));
const qcName = (el) => `${el === "Ars" ? "As" : el === "Ind" ? "In" : el} (${qcUnits.get(el)})`;
const qc = qcRaw.filter((r) => txt(r.QAQCType) || txt(r.StandardID)).map((r) => ({ sample_id: txt(r.SampleID), sample_type: txt(r.QAQCType) || (/blank/i.test(txt(r.StandardID)) ? "Blank" : "Standard"), standard_id: txt(r.StandardID), original_sample_id: txt(r.OrigSampleID),
  ...Object.fromEntries(qcNamed.map((el) => [qcName(el), txt(r[el])])) }));
writeCsv(path.join(out, "qaqc.csv"), ["sample_id", "sample_type", "standard_id", "original_sample_id", ...qcNamed.map(qcName)], qc);
checks.push(`qaqc.csv: ${qc.length} QC samples (${[...new Set(qc.map((r) => r.sample_type))].map((t) => `${t} ${qc.filter((r) => r.sample_type === t).length}`).join(", ")}), ${qcNamed.length} of ${qcEls.length} elements with a unit confirmed (the rest left out)`);

// pXRF (Innov-X on RC chips, intervals): -100000 and -10 are the analyser's codes (no reading / under its limit) and become blank; a reading with any value
// over 1,000,000 ppm (over 100 %: the export's unit fault, iron up to 1.5 billion ppm) is left out whole; the operator and sampler left out
const P = tableOf(9);
const pEls = Object.keys(P[0] || {}).filter((h) => /_xrf_ppm$/.test(h));
const bad = (r) => pEls.some((h) => (num(r[h]) ?? 0) > 1e6);
const pxrf = P.filter((r) => !isTrue(r.Superseded) && !bad(r)).map((r) => ({ hole_id: txt(r.Hole_ID), from: num(r["mFrom (m)"]), to: num(r["mTo (m)"]), sample_type: txt(r.Sample_Type),
  ...Object.fromEntries(pEls.map((h) => { const v = num(r[h]); return [`${h.split("_")[0]} (ppm)`, v == null || v === -100000 || v === -10 ? "" : txt(r[h])]; })) }));
const pKeep = pEls.map((h) => `${h.split("_")[0]} (ppm)`).filter((c) => pxrf.some((r) => r[c] !== ""));
intervals(pxrf.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !/\(/.test(k) || pKeep.includes(k)))), "pxrf.csv", ["sample_type", ...pKeep]);
checks.push(`  pxrf: ${P.length} readings, ${P.filter(bad).length} with a value over 100 % left out, codes -100000 / -10 blanked, ${pKeep.length} elements kept`);

// magnetic susceptibility: the probe's average of up to four readings at a depth (SI x 10^-3); the reader left out
const ms = tableOf(10).map((r) => ({ hole_id: txt(r.Hole_ID), depth: num(r.Depth), magsus_si_e3: num(r.Ave_Reading), instrument: txt(r.Instrument) })).filter((r) => holes.has(r.hole_id) && r.depth != null && r.magsus_si_e3 != null);
writeCsv(path.join(out, "magsus.csv"), ["hole_id", "depth", "magsus_si_e3", "instrument"], ms);
checks.push(`magsus.csv: ${ms.length} readings (${[...new Set(tableOf(10).map((r) => txt(r.UnitCode)))].join(", ")})`);

// rock chips: the surface samples (MGA94 zone 54), their logging; their assays come from the surface QC-style table only for standards here, so the
// rock chips carry the geology alone (the report's surface assays are in the PDF)
const rk = tableOf(2).map((r) => ({ sample_id: txt(r.SampleID), x: num(r.NAT_East) ?? num(r.Orig_East), y: num(r.NAT_North) ?? num(r.Orig_North), z: num(r.NAT_RL) ?? num(r.Orig_RL), /* these carry only the original grid (MGA94_54) */ medium: "rock chip", sample_type: txt(r.Sample_Type), lithology: txt(r.Lith1_Code), description: txt(r.Lith_Description), alteration: txt(r.Alt1_Type), mineral: txt(r.Min1_Code), epsg: EPSG }))
  .filter((r) => r.x != null && r.y != null);
// the source swaps Orig_East and Orig_North (an "easting" of 7.65 million m is a northing in zone 54): swapped back where so
const swapped = rk.filter((r) => r.x > 1e6 && r.y < 1e6);
for (const r of swapped) [r.x, r.y] = [r.y, r.x];
writeCsv(path.join(out, "rocks.csv"), ["sample_id", "x", "y", "z", "medium", "sample_type", "lithology", "description", "alteration", "mineral", "epsg"], rk);
checks.push(`rocks.csv: ${rk.length} rock chips (geology only), ${swapped.length} with east and north swapped back`);

// geophysics: downhole EM (Maxwell DHEM tables of four holes, two of them in two parts) and the two DHEM plates the contractor modelled (DXF); the
// in-loop moving-loop line over the holes (ION_MLEM_2017) and its stations (shapefile); the LAN prospect's EM (4-10 km away) left out
const near = (pts) => collars.map((c) => Math.round(Math.min(...pts.map(([x, y]) => Math.hypot(x - c.x, y - c.y)))));
for (const f of listFiles(R.root).filter((f) => /17IZ\d+(_\d)?\.tem$|17IZ\d+_DHEM_Plate\.dxf$/i.test(f))) copyFileSync(path.join(R.root, f), path.join(out, "geophysics", "dhem", path.basename(f)));
checks.push(`downhole EM: ${listFiles(path.join(out, "geophysics/dhem")).filter((f) => /\.tem$/i.test(f)).length} files for ${new Set(listFiles(path.join(out, "geophysics/dhem")).filter((f) => /\.tem$/i.test(f)).map((f) => f.slice(0, 7))).size} holes, ${listFiles(path.join(out, "geophysics/dhem")).filter((f) => /\.dxf$/i.test(f)).length} plates (DXF)`);
const ion = findIn(/ION_MLEM_2017\.tem$/), m = parseTemReceiver(readFileSync(ion, "latin1"));
copyFileSync(ion, path.join(out, "geophysics", "em", "ION_MLEM_2017.tem"));
for (const ext of ["shp", "shx", "dbf", "prj", "cpg"]) copyFileSync(findIn(new RegExp(`MLEM_2017_ION_stns\\.${ext}$`)), path.join(out, "geophysics", "em", `MLEM_2017_ION_stns.${ext}`));
checks.push(`EM ION_MLEM_2017: ${m.stations.length} stations (${m.config}), nearest to each hole ${near(m.stations.filter((p) => Number.isFinite(p.x)).map((p) => [p.x, p.y])).join(" / ")} m`);

const size = listFiles(out).reduce((t, f) => t + statSync(path.join(out, f)).size, 0);
checks.push(`sample size: ${(size / 1e6).toFixed(2)} MB in ${listFiles(out).length} files`);
if (R.refused.length) checks.push(`unpacker refused ${R.refused.length} entries`);
console.log(checks.join("\n"));
writeFileSync(path.join(out, "build-checks.txt"), checks.join("\n") + "\n");
