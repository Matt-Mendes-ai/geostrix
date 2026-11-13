// TASKS.csv #3107 — builds sample_data/wa_zinc_copper/ from one open-file report (A77713) of the Western Australian WAMEX mineral
// drillhole and surface geochemistry database (DEMIRS, CC BY 4.0): the 32 holes of a 2007 drilling program on zinc-copper sulphide
// prospects in felsic volcanic rocks of the east Pilbara (21.2 to 21.35 S, 119.2 E), with their logs and assays, and the soil and
// stream-sediment samples of the same year. The report also lists 49 older holes (1991 to 2006) as collars with no logs or assays in
// the database; they are left out. Nothing is invented.
//
//   node scripts/samples/build-wa-zinc-copper.mjs "<path to the report's csv folder>"
//
// The folder is the WA drillhole review's per-report export (docs/ideas/wa-drillhole-database-review.md): collars.csv, survey.csv,
// geology.csv, alteration.csv, mineralogy.csv, assays.csv, and surface.csv (the report's surface samples, one row per sample), all
// with the company's column names and values verbatim.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const src = process.argv[2];
if (!src || !existsSync(src)) { console.error("usage: node scripts/samples/build-wa-zinc-copper.mjs <path to the report's csv folder>"); process.exit(1); }
const out = path.resolve("sample_data/wa_zinc_copper");
mkdirSync(out, { recursive: true });
const read = (p) => Papa.parse(readFileSync(path.join(src, p), "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const num = (v) => { const s = String(v ?? "").trim(); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; };
const txt = (v) => String(v ?? "").trim();
const write = (name, header, rows) => {
  const body = rows.map((r) => header.map((h) => { const v = r[h]; if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(","));
  writeFileSync(path.join(out, name), [header.join(","), ...body].join("\n") + "\n");
  console.log(`${name}: ${rows.length} rows`);
};

// collars: the holes that have a log. GDA94 / MGA zone 50 (EPSG:28350) on every one of them (the source's DATUM / ORIG_COORD columns);
// the company's RL; the prospect name kept as an attribute (the four prospects lie along 16 km).
const geo = read("geology.csv");
const logged = new Set(geo.map((r) => txt(r.HOLE)));
const allCollars = read("collars.csv");
const kept = allCollars.filter((r) => logged.has(txt(r.HOLE)));
if (kept.some((r) => txt(r.DATUM) !== "GDA94" || txt(r.ORIG_COORD) !== "MGA50" || txt(r.ZONE) !== "50")) throw new Error("a logged hole is not on GDA94 / MGA50: decide how to bring it in");
const collars = kept.map((r) => ({ hole_id: txt(r.HOLE), x: num(r.AMGE), y: num(r.AMGN), z: num(r.RL), length: num(r.TOTAL_DTH), hole_type: txt(r.DRILL_TYPE), prospect: txt(r.PROSPECT), epsg: 28350 }))
  .filter((r) => r.hole_id && r.x != null && r.y != null && r.z != null && r.length != null);
write("collars.csv", ["hole_id", "x", "y", "z", "length", "hole_type", "prospect", "epsg"], collars);
console.log(`  ${allCollars.length - collars.length} of the report's ${allCollars.length} collars have no log and are left out`);
const holes = new Map(collars.map((c) => [c.hole_id, c]));

// survey: the source azimuths are MAGNETIC (AZIM_TYPE MAG) with the company's own correction to the grid beside them (UTM_ADJUST,
// 2.5 degrees): the grid azimuth is their sum. Four collar stations of vertical holes are typed VER (azimuth 0, no correction).
const survey = read("survey.csv").filter((r) => holes.has(txt(r.HOLE))).map((r) => {
  const az = num(r.AZIM), adj = num(r.UTM_ADJUST) ?? 0;
  if (!["MAG", "VER"].includes(txt(r.AZIM_TYPE))) throw new Error(`survey azimuth type ${r.AZIM_TYPE}: decide how to read it`);
  return { hole_id: txt(r.HOLE), depth: num(r.DEPTH), azimuth: az == null ? null : (((az + adj) % 360) + 360) % 360, dip: num(r.DIP) };
}).filter((r) => r.depth != null && r.azimuth != null && r.dip != null && r.depth <= holes.get(r.hole_id).length + 0.01);
write("survey.csv", ["hole_id", "depth", "azimuth", "dip"], survey);

// lithology: the primary code, the weathering state and the geologist's remark. No overlaps; the table has no version column.
const within = (r) => r.from != null && r.to != null && r.to > r.from;
const litho = geo.filter((r) => holes.has(txt(r.HOLE))).map((r) => ({ hole_id: txt(r.HOLE), from: num(r.FROM), to: num(r.TO), lithology: txt(r.LITH1), weathering: txt(r.WEATH), description: txt(r.COMMENTS) })).filter((r) => within(r) && r.lithology);
write("litho.csv", ["hole_id", "from", "to", "lithology", "description"], litho);
write("weath.csv", ["hole_id", "from", "to", "weathering"], litho.filter((r) => r.weathering));

// alteration: the first mineral code and its intensity (s / m / w)
write("alt.csv", ["hole_id", "from", "to", "assemblage", "intensity"], read("alteration.csv").filter((r) => holes.has(txt(r.HOLE)))
  .map((r) => ({ hole_id: txt(r.HOLE), from: num(r.FROM), to: num(r.TO), assemblage: txt(r.MIN1), intensity: txt(r.INTENSITY) })).filter((r) => within(r) && r.assemblage));

// sulphide estimates: the log's visual percentages of pyrite, sphalerite, chalcopyrite and galena, one row per mineral present
{
  const rows = [];
  for (const r of read("mineralogy.csv")) {
    const h = txt(r.HOLE), from = num(r.FROM), to = num(r.TO);
    if (!holes.has(h) || from == null || to == null || !(to > from)) continue;
    for (const [mineral, col] of [["py", "PYPC"], [txt(r.MIN1), "MIN1PC"], [txt(r.MIN2), "MIN2PC"], [txt(r.MIN3), "MIN3PC"]]) { const p = num(r[col]); if (mineral && p != null && p > 0) rows.push({ hole_id: h, from, to, mineral, percent: p }); }
  }
  write("mnlgy.csv", ["hole_id", "from", "to", "mineral", "percent"], rows);
}

// assays: ROUTINE samples only (the source's QC_TYPE also holds CHECK and REJECT rows: laboratory repeats and reject re-splits of the
// same intervals). One column per element, in the source's units (ppm; gold in ppb, its first determination). A negative number is the
// laboratory's below-detection code and is kept. Where two routine samples cover the same ground (a 5 m or 10 m composite and the
// 1 m samples taken later, or two 1 m samples), the shorter one is kept, then the earlier sampling method (DS, XS, SP, XX): no depth
// is counted twice.
const EL = [["Cu_ppm", "Cu"], ["Zn_ppm", "Zn"], ["Pb_ppm", "Pb"], ["Ag_ppm", "Ag"], ["Au_ppb", "Au1"], ["As_ppm", "As"], ["Ba_ppm", "Ba"], ["Fe_ppm", "Fe"], ["S_ppm", "S"], ["Mn_ppm", "Mn"], ["Ni_ppm", "Ni"], ["Sb_ppm", "Sb"], ["Hg_ppm", "Hg"]];
const rawAll = read("assays.csv").filter((r) => holes.has(txt(r.HOLE)));
const routine = rawAll.filter((r) => txt(r.QC_TYPE) === "ROUTINE").map((r) => { const o = { hole_id: txt(r.HOLE), from: num(r.FROM), to: num(r.TO), sample_id: txt(r.SAMPLE), method: txt(r.SMP_METHOD) }; for (const [k, c] of EL) o[k] = txt(r[c]); return o; })
  .filter((r) => within(r) && EL.some(([k]) => r[k] !== ""));
const rank = { DS: 0, XS: 1, SP: 2, XX: 3 };
const order = [...routine].sort((a, b) => (a.to - a.from) - (b.to - b.from) || (rank[a.method] ?? 9) - (rank[b.method] ?? 9));
const taken = new Map(), assays = [];
for (const r of order) {
  const iv = taken.get(r.hole_id) || [];
  if (iv.some(([a, b]) => r.from < b - 1e-6 && r.to > a + 1e-6)) continue;
  iv.push([r.from, r.to]); taken.set(r.hole_id, iv); assays.push(r);
}
assays.sort((a, b) => a.hole_id.localeCompare(b.hole_id) || a.from - b.from);
write("assays.csv", ["hole_id", "from", "to", "sample_id", ...EL.map((e) => e[0])], assays);
console.log(`  of ${rawAll.length} rows: ${rawAll.length - rawAll.filter((r) => txt(r.QC_TYPE) === "ROUTINE").length} CHECK / REJECT left out, ${routine.length - assays.length} routine rows left out for covering ground a shorter sample covers`);

// surface samples: ROUTINE soils and stream sediments (the 19 CHECK rows are repeats). GDA94 / MGA zone 50; no elevation in the source.
const SEL = [["Au_ppb", "Au1"], ["Ag_ppm", "Ag"], ["As_ppm", "As"], ["Ba_ppm", "Ba"], ["Bi_ppm", "Bi"], ["Cd_ppm", "Cd"], ["Co_ppm", "Co"], ["Cr_ppm", "Cr"], ["Cu_ppm", "Cu"], ["Fe_ppm", "Fe"], ["Hg_ppm", "Hg"], ["In_ppm", "In"], ["Mn_ppm", "Mn"], ["Mo_ppm", "Mo"],
  ["Ni_ppm", "Ni"], ["Pb_ppm", "Pb"], ["Sb_ppm", "Sb"], ["Te_ppm", "Te"], ["Tl_ppm", "Tl"], ["U_ppm", "U"], ["W_ppm", "W"], ["Y_ppm", "Y"], ["Zn_ppm", "Zn"]];
const surf = read("surface.csv");
if (surf.some((r) => txt(r.datum) !== "GDA94" || txt(r.zone) !== "50")) throw new Error("a surface sample is not on GDA94 / MGA50");
for (const [file, type, medium] of [["soils.csv", "SOIL", "soil"], ["streams.csv", "STREAMSED", "stream sediment"]]) {
  const rows = surf.filter((r) => txt(r.type) === type && txt(r.QC_TYPE) === "ROUTINE")
    .map((r) => { const o = { sample_id: txt(r.sample_id), x: num(r.easting), y: num(r.northing), z: "", medium }; for (const [k, c] of SEL) o[k] = txt(r[c]); return o; }).filter((r) => r.x != null && r.y != null);
  if (new Set(rows.map((r) => r.sample_id)).size !== rows.length) throw new Error(`${file}: a sample id is repeated`);
  write(file, ["sample_id", "x", "y", "z", "medium", ...SEL.map((e) => e[0])], rows);
}
console.log("done ->", out);
