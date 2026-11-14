// TASKS.csv #3107 — builds sample_data/wa_gold/ from one open-file report (A122506) of the Western Australian WAMEX mineral drillhole
// database (DEMIRS, CC BY 4.0): the 66 surveyed reverse-circulation and diamond holes drilled in 2018-2019 on one gold prospect
// about 110 km east-south-east of Kalgoorlie (31.07 S, 122.56 E), with their lithology, alteration, veining and oriented-structure logs and
// their assays. The report covers four prospects over 60 km (104 holes); this sample is the one with nearly all the logging, the
// holes whose ids carry "ST". Nothing is invented.
//
//   node scripts/samples/build-wa-gold.mjs "<path to the report's csv folder>"
//
// The folder is the WA drillhole review's per-report export (docs/ideas/wa-drillhole-database-review.md): collars.csv, survey.csv,
// geology.csv, alteration.csv, veining.csv, structure.csv, assays.csv with the company's column names and values verbatim, and
// collar_core.csv, the hole type and total depth the State's database keeps in its own collar table (the export leaves them out).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const src = process.argv[2];
if (!src || !existsSync(src)) { console.error("usage: node scripts/samples/build-wa-gold.mjs <path to the report's csv folder>"); process.exit(1); }
const out = path.resolve("sample_data/wa_gold");
mkdirSync(out, { recursive: true });
const read = (p) => Papa.parse(readFileSync(path.join(src, p), "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const num = (v) => { const s = String(v ?? "").trim(); const n = Number(s); return s !== "" && Number.isFinite(n) ? n : null; };
const txt = (v) => String(v ?? "").trim();
const write = (name, header, rows) => {
  const body = rows.map((r) => header.map((h) => { const v = r[h]; if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(","));
  writeFileSync(path.join(out, name), [header.join(","), ...body].join("\n") + "\n");
  console.log(`${name}: ${rows.length} rows`);
};
const inProspect = (id) => /^\d\dST/.test(id);

// survey first: a hole with no downhole survey is left out (two inclined diamond holes; they would be drawn vertical). The azimuth is
// the one on the national grid (NAT_Azimuth, grid id MGA94_51 on every row). Ten holes were surveyed twice: the source marks one run
// Priority 1 (every 5 m) and the other Priority 0 (every 10 m) and does not say which is preferred; the two differ by about 1.5 degrees
// in azimuth. One run per hole is kept: the Priority 1 run where there is one.
const svAll = read("survey.csv").filter((r) => inProspect(txt(r.Hole_ID)));
if (svAll.some((r) => txt(r.NAT_Grid_ID) !== "MGA94_51")) throw new Error("a survey row is not on MGA94_51");
const hasP1 = new Set(svAll.filter((r) => txt(r.Priority) === "1").map((r) => txt(r.Hole_ID)));
const surveyRows = svAll.filter((r) => (hasP1.has(txt(r.Hole_ID)) ? txt(r.Priority) === "1" : true)).map((r) => ({ hole_id: txt(r.Hole_ID), depth: num(r.Depth), azimuth: num(r.NAT_Azimuth), dip: num(r.Dip) })).filter((r) => r.depth != null && r.azimuth != null && r.dip != null);
const surveyed = new Set(surveyRows.map((r) => r.hole_id));

// collars: GDA94 / MGA zone 51 (EPSG:28351), surveyed positions and elevations (Best_RL, method MGA94_51_Surveyed_Z on every hole
// here); the hole type and total depth from the database's own collar table
const core = new Map(read("collar_core.csv").map((r) => [txt(r.Hole_ID), { type: txt(r.Hole_Type), depth: num(r.Max_Depth) }]));
const cAll = read("collars.csv").filter((r) => inProspect(txt(r.Hole_ID)));
if (cAll.some((r) => txt(r.Orig_Grid_ID) !== "MGA94_51" || txt(r.Best_RL_Method) !== "MGA94_51_Surveyed_Z")) throw new Error("a collar is not a surveyed MGA94_51 position");
const collars = cAll.filter((r) => surveyed.has(txt(r.Hole_ID))).map((r) => ({ hole_id: txt(r.Hole_ID), x: num(r.Orig_East), y: num(r.Orig_North), z: num(r.Best_RL), length: core.get(txt(r.Hole_ID))?.depth ?? null, hole_type: core.get(txt(r.Hole_ID))?.type ?? "", epsg: 28351 }))
  .filter((r) => r.x != null && r.y != null && r.z != null && r.z !== 0 && r.length != null);
write("collars.csv", ["hole_id", "x", "y", "z", "length", "hole_type", "epsg"], collars);
console.log(`  of ${cAll.length} holes of the prospect, left out for no survey: ${cAll.filter((r) => !surveyed.has(txt(r.Hole_ID))).map((r) => txt(r.Hole_ID)).join(", ") || "none"}`);
const holes = new Map(collars.map((c) => [c.hole_id, c]));
write("survey.csv", ["hole_id", "depth", "azimuth", "dip"], surveyRows.filter((r) => holes.has(r.hole_id) && r.depth <= holes.get(r.hole_id).length + 0.01));
console.log(`  ${hasP1.size} holes surveyed twice: the Priority 1 run kept`);

const within = (r) => r.from != null && r.to != null && r.to > r.from;
const iv = (r) => ({ hole_id: txt(r.Hole_ID), from: num(r.Depth_From), to: num(r.Depth_To) });
const only = (name) => read(name).filter((r) => holes.has(txt(r.Hole_ID)));

// lithology: the primary code and the oxidation state. Every row is Priority 0 (one log per hole); no interval overlaps another.
const geo = only("geology.csv");
if (new Set(geo.map((r) => txt(r.Priority))).size !== 1) throw new Error("the lithology log has more than one priority: decide which to keep");
// TASKS.csv #3308 (Matt: "re import the lithologies for the sample projects and add the description field") — the geologist's
// comment on the interval (the source's Comments: 4,456 of 4,629 rows), whitespace collapsed, as the layer's description
const litho = geo.map((r) => ({ ...iv(r), lithology: txt(r.Lith1_Code), weathering: txt(r.Lith1_Oxidation), description: txt(r.Comments).replace(/\s+/g, " ") })).filter((r) => within(r) && r.lithology);
write("litho.csv", ["hole_id", "from", "to", "lithology", "description"], litho);
write("weath.csv", ["hole_id", "from", "to", "weathering"], litho.filter((r) => r.weathering));

// alteration: the first code of each interval and its intensity (0 to 5). The company logs sulphides (PO, PY) in this table too.
write("alt.csv", ["hole_id", "from", "to", "assemblage", "intensity"], only("alteration.csv").map((r) => ({ ...iv(r), assemblage: txt(r.Alt1_Code), intensity: txt(r.Alt1_Int) })).filter((r) => within(r) && r.assemblage));

// veining: the first vein composition, its style and its percentage of the interval
write("vein.csv", ["hole_id", "from", "to", "type", "style", "percent"], only("veining.csv").map((r) => ({ ...iv(r), type: txt(r.Vein1_Comp), style: txt(r.Vein1_Style), percent: num(r.Vein1_pct) })).filter((r) => within(r) && r.type));

// oriented structures: alpha and beta against the bottom-of-hole line (the source's Reference_Line is BOH on every row), the
// convention GeoStrix reads by default. Rows with no beta are left out.
const st = only("structure.csv");
if (st.some((r) => txt(r.Reference_Line) !== "BOH")) throw new Error("a structure row is not measured from the bottom-of-hole line");
write("structure.csv", ["hole_id", "depth_m", "structure_type", "alpha", "beta"], st.map((r) => ({ hole_id: txt(r.Hole_ID), depth_m: num(r.Depth_From), structure_type: txt(r.Structure_Type), alpha: num(r.Alpha), beta: num(r.Beta) }))
  .filter((r) => r.depth_m != null && r.alpha != null && r.beta != null && r.depth_m <= holes.get(r.hole_id).length + 0.01));

// assays: gold in ppm on every sample, and a multi-element suite on about one sample in nine. Rows flagged Superseded (-1) are left
// out. A sample with a multi-element analysis appears twice in the source, once with its gold and once without: the two rows are
// joined (same hole, interval and sample id). "<0.005" is the laboratory's below-detection notation and is kept as written; a cell
// that is not a number (the laboratory's status codes: IE, IS, X ...) is left blank and counted.
const EL = [["Au_ppm", "Au"], ["Ag_ppm", "Ag"], ["As_ppm", "As"], ["Bi_ppm", "Bi"], ["Cu_ppm", "Cu"], ["Mo_ppm", "Mo"], ["Pb_ppm", "Pb"], ["Sb_ppm", "Sb"], ["Te_ppm", "Te"], ["W_ppm", "W"], ["Zn_ppm", "Zn"], ["S_pct", "S"]];
const rawAll = only("assays.csv");
const current = rawAll.filter((r) => txt(r.Superseded) === "0");
const merged = new Map(), codes = {};
for (const r of current) {
  const o = { ...iv(r), sample_id: txt(r.SampleID) };
  if (!within(o)) continue;
  const key = `${o.hole_id}|${o.from}|${o.to}|${o.sample_id}`;
  const m = merged.get(key) || (merged.set(key, o), o);
  for (const [k, c] of EL) {
    const v = txt(r[c]), ok = /^[<>]?\s*-?\d*\.?\d+$/.test(v);
    if (v !== "" && !ok) codes[v] = (codes[v] || 0) + 1;
    if (ok && (m[k] == null || m[k] === "")) m[k] = v; else if (m[k] == null) m[k] = "";
  }
}
const assays = [...merged.values()].filter((r) => EL.some(([k]) => r[k] !== "")).sort((a, b) => a.hole_id.localeCompare(b.hole_id) || a.from - b.from);
write("assays.csv", ["hole_id", "from", "to", "sample_id", ...EL.map((e) => e[0])], assays);
console.log(`  of ${rawAll.length} rows: ${rawAll.length - current.length} superseded, ${current.length - merged.size} joined to their twin, ${merged.size - assays.length} with no result`);
console.log("  cells that are not numbers, left blank:", codes);
console.log("done ->", out);
