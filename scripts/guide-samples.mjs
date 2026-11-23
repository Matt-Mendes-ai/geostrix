// TASKS.csv #4031 (guided modelling row 1) — the guide's facts and suggested route on each sample: node scripts/guide-samples.mjs [sample ...]
// Reads the samples' own CSVs (and Mount Raymond's map shapefile) into the store's shape, the way the app's importers name the layers (Lithology's
// value from the lithology / type / assemblage column), then prints what guideFacts() finds and what suggestRoute() suggests. Counts only.
// The BC samples (silvertip, harry_property, perk_rocky, woodjam) are not in the repository: give their folder with GEOSTRIX_BC_SAMPLES (the
// app's userData sample_data, where it downloads them) and they are read from there.
// Structure picks: a sample's alpha / beta or inferred dip is counted as an oriented pick (the app computes the dip from the survey on import).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guideFacts, clearGuideFacts } from "../src/lib/guide/guideFacts.js";
import { suggestRoute } from "../src/lib/guide/suggestRoute.js";
import { parseShapefileParts } from "../src/lib/shapefile.js";
import { guessStyleField } from "../src/lib/mapLayers.js";
import { lithologyNoteRoles, setLithologyNoteRoles } from "../src/lib/layers.js"; // TASKS.csv #4036 - the roles the app reads from the logged notes

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES = ["(synthetic)", "wa_gold", "yk_macpass", "qld_century", "wa_iron", "wa_zinc_copper", "wa_lead_zinc", "wa_uranium", "geomet", "mount_raymond", "silvertip", "harry_property"];

function csv(file) {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const split = (l) => { const out = []; let cur = "", q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const head = split(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => { const v = split(l), o = {}; head.forEach((h, i) => { o[h] = v[i]; }); return o; });
}
const num = (v) => (v == null || v === "" ? NaN : Number(v));
const pickCol = (row, names) => names.find((n) => row && n in row);

function dirOf(name) {
  if (name === "(synthetic)") return path.join(ROOT, "sample_data");
  const local = path.join(ROOT, "sample_data", name);
  if (existsSync(path.join(local, "collars.csv")) || existsSync(path.join(local, "map_units.shp"))) return local;
  const bc = process.env.GEOSTRIX_BC_SAMPLES ? path.join(process.env.GEOSTRIX_BC_SAMPLES, name) : null;
  return bc && existsSync(bc) ? bc : null;
}

function interval(rows, cols, notes = false) {
  const c = pickCol(rows[0], cols);
  // notes: the log's description column rides along as the app keeps it (lib/layers.js lithologyNoteRoles reads roles from it: WA lode gold's no-recovery code is one)
  return c ? rows.map((r) => ({ hole_id: r.hole_id, from: num(r.from), to: num(r.to), value: r[c], ...(notes && r.description ? { description: r.description } : {}) })) : [];
}

function storeOf(dir) {
  const collars = csv(path.join(dir, "collars.csv")).map((r) => ({ hole_id: r.hole_id, x: num(r.x), y: num(r.y), z: num(r.z), length: num(r.length) }));
  const layers = {
    litho: interval(csv(path.join(dir, "litho.csv")), ["lithology", "litho", "rock", "code"], true),
    vein: interval(csv(path.join(dir, "vein.csv")), ["type", "vein", "code"]),
    alt: interval(csv(path.join(dir, "alt.csv")), ["assemblage", "alteration", "code"]),
    sg: csv(path.join(dir, "sg.csv")).map((r) => ({ hole_id: r.hole_id, from: num(r.from), to: num(r.to), value: 1 })),
    structure: csv(path.join(dir, "structure.csv")).map((r) => {
      const oriented = Number.isFinite(num(r.alpha)) || Number.isFinite(num(r.inferred_dip_deg)) || Number.isFinite(num(r.dip));
      return { hole_id: r.hole_id, value: r.structure_type ?? r.type ?? r.structure ?? "", structure_id: r.structure_id || "", dip: oriented ? 45 : NaN, azimuth: oriented ? 0 : NaN };
    }),
  };
  const assayRows = csv(path.join(dir, existsSync(path.join(dir, "assays.csv")) ? "assays.csv" : "assay_wide.csv"));
  const skip = new Set(["hole_id", "from", "to", "sample_id", "sample", "type", "method", "lab", "batch"]);
  const assayElements = assayRows.length ? Object.keys(assayRows[0]).filter((k) => !skip.has(k)) : [];
  const mapLayers = [];
  const shp = path.join(dir, "map_units.shp");
  if (existsSync(shp)) {
    const r = parseShapefileParts({ shp: new Uint8Array(readFileSync(shp)), dbf: new Uint8Array(readFileSync(path.join(dir, "map_units.dbf"))), cpg: existsSync(path.join(dir, "map_units.cpg")) ? readFileSync(path.join(dir, "map_units.cpg"), "utf8") : null });
    const fields = Object.keys(r.features[0]?.attributes || {});
    mapLayers.push({ id: "map", name: "map_units", geomType: r.geomType, features: r.features, fields, styleField: fields.includes("MAP_UNIT") ? "MAP_UNIT" /* the field the app loads Mount Raymond by (sampleMountRaymond.js) */ : guessStyleField(fields) || fields[0] });
  }
  for (const f of ["faults.shp"]) {
    const p = path.join(dir, f);
    if (existsSync(p)) { const r = parseShapefileParts({ shp: new Uint8Array(readFileSync(p)), dbf: new Uint8Array(readFileSync(p.replace(/\.shp$/, ".dbf"))) }); mapLayers.push({ id: f, name: f, geomType: r.geomType, features: r.features }); }
  }
  setLithologyNoteRoles(lithologyNoteRoles(layers.litho)); // as the store does on every render (a code dictionary's meanings are not read here: WA bedded iron's ALU is cover by its meaning in the app, by its name here)
  const survey = csv(path.join(dir, "survey.csv")).map((r) => ({ hole_id: r.hole_id, depth: num(r.depth), azimuth: num(r.azimuth), dip: num(r.dip) })); // #4037: the drill spacing at depth
  return { collars, survey, layers, assays: assayRows, assayElements, mapLayers, terrain: readdirSync(dir).some((f) => /\.tif$/i.test(f) && /terrain|dem/i.test(f)) ? {} : null, sections: [], explicitSurfaces: [], generatedSurfaces: [], stratStack: { units: [] }, modellingCodes: null, lithoGroups: [], surfaceStructures: [], voxelModels: [] };
}

const want = process.argv.slice(2).length ? process.argv.slice(2) : SAMPLES;
for (const name of want) {
  const dir = dirOf(name);
  if (!dir) { console.log(`${name}: not here (a BC sample needs GEOSTRIX_BC_SAMPLES)`); continue; }
  clearGuideFacts();
  const t0 = performance.now(), f = guideFacts(storeOf(dir)), ms = performance.now() - t0, r = suggestRoute(f);
  const ag = (u) => Math.round(100 * (f.order.agree.get(u) ?? 0));
  console.log(`\n== ${name} (facts in ${Math.round(ms)} ms)`);
  console.log(`  holes ${f.holes} (${f.positioned} placed), sites ${f.area.sites}, spacing ${f.area.spacing ? Math.round(f.area.spacing) : "-"} m, groups ${f.area.clusters.length}${f.area.clusters.length > 1 ? ` (largest ${f.area.clusters[0].n}, gap ${Math.round(f.area.gapM)} m)` : ""}, quick cells ${f.area.quickCellM ? Math.round(f.area.quickCellM) : "-"} m`);
  console.log(`  stack takes ${f.order.takes} (Add all ${f.order.addable}); rocks return in ${f.order.returns.repeating} of ${f.order.returns.holes} holes${f.order.returns.over ? " (over the run's bar)" : ""}; clusters ${f.area.clusters.length}`);
  console.log(`  logged: ${f.logged.rows} rows in ${f.logged.holes} holes, ${f.logged.codes} codes; contacts in ${f.contacts.holes} holes, steady tops in ${f.contacts.steadyHoles}`);
  console.log(`  order: ${f.order.steady.length} steady of ${f.order.eligible} eligible (the route's count; ${f.order.candidates} codes in 3+ holes) [${f.order.steady.slice().sort().join(" ")}], ${f.order.layered.length} layered${f.order.layered.length ? ` [${f.order.layered.map((u) => `${u} ${ag(u)}%`).join(", ")}]` : ""}; not layered ${f.order.bodies.length}${f.order.bodies.length ? ` [${f.order.bodies.slice(0, 6).map((u) => `${u} ${ag(u)}%`).join(", ")}${f.order.bodies.length > 6 ? ", ..." : ""}]` : ""}`);
  console.log(`  cover ${f.cover ? `${f.cover.unit} (${f.cover.starts} of ${f.cover.of})` : "-"}; body ${f.body ? `${f.body.unit} (${f.body.role}; inside in ${f.body.inside} of ${f.body.holes})` : "-"}; thin codes ${f.thinCodes.length}`);
  console.log(`  picks ${f.picks.oriented} (fault-like ${f.faults.picks} in ${f.faults.pickHoles} holes); logged fault intervals ${f.faults.logged}; mapped fault lines ${f.faults.mapped}; veins ${f.veins.length ? f.veins.slice(0, 4).map((v) => `${v.key} ${v.holes}h ${v.perHole.toFixed(1)}/h`).join(", ") : "-"}`);
  console.log(`  assays ${f.assays.rows} rows, ${f.assays.elements} columns; alteration ${f.alteration}; density ${f.density}; map ${f.map.polygons} polygons, ${f.map.units} units; terrain ${f.terrain ? "yes" : "no"}`);
  console.log(`  ROUTE: ${r.route ?? "none"} (${r.why}; open: ${r.routes.join(", ") || "none"}) - ${r.reason}`);
}
