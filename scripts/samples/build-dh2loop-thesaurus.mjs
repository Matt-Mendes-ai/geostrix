// TASKS.csv #3429 — builds src/lib/lithoThesaurusDh2loop.js, the lithology thesaurus's second source, from ONE file of the dh2loop project's thesauri:
//   thesauri/thesaurus_geology_hierarchical.csv  (Loop3D/dh2loop v1.0.0, MIT licence, Copyright (c) 2020 Mark Jessell;
//   Joshi et al. 2021, Geoscientific Model Development 14, 6711; the rock terms follow the CGI Simple Lithology vocabulary)
// Data only: the rock names and the other words that name them, and the group each belongs to (mapped to GeoStrix's families). No definitions, no code from the
// repository, none of its company lithology-code tables. Entries whose name or words GeoStrix's own short thesaurus (lithoThesaurus.js) already has are left to it.
//
//   node scripts/samples/build-dh2loop-thesaurus.mjs "<folder holding thesaurus_geology_hierarchical.csv>"
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { THESAURUS } from "../../src/lib/lithoThesaurus.js";

const dir = process.argv[2];
const file = dir && path.join(dir, "thesaurus_geology_hierarchical.csv");
if (!file || !existsSync(file)) { console.error("usage: node scripts/samples/build-dh2loop-thesaurus.mjs <folder with thesaurus_geology_hierarchical.csv>"); process.exit(1); }
const rows = Papa.parse(readFileSync(file, "utf8"), { header: true, skipEmptyLines: true }).data;

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z\s]+/g, " ").replace(/\s+/g, " ").trim(); // the same rule as lithoThesaurus.js
const taken = new Set();
for (const [name, , syn] of THESAURUS) { taken.add(norm(name)); for (const s of syn) taken.add(norm(s)); }

// dh2loop's group / subgroup -> GeoStrix's families (display only); groups with no family here (textures, ore, unclassified) are left out
const INTRUSIVE = /coarse|ultramafic|plutonic/, VOLCANIC = /fine|glassy|volcaniclastic|leucitic/;
function familyOf(r) {
  const g = r.lithology_group, s = r.lithology_subgroup;
  if (g === "igneous_rock" && /^exotic/.test(s)) return "intrusive"; // carbonatites, cumulates (ilmenitite, chromitite): crystalline, plutonic
  if (g === "igneous_rock") return INTRUSIVE.test(s) && !/fine|glassy/.test(s) ? "intrusive" : VOLCANIC.test(s) ? "volcanic" : /granit|syenit|diorit|gabbr|tonalit|monzon|peridot|pyroxen|dunit|norit|anorthos|pegmat|carbonatit/.test(r.detailed_lithology) ? "intrusive" : "volcanic";
  if (g === "sedimentary_rock" || g === "sediment") return "sedimentary";
  if (g === "metamorphic_rock") return "metamorphic";
  // surficial_rock (soils, made ground, landforms, brick, plastic ...) is left out: GeoStrix's own regolith entries cover what a log means, and most of that group is not a rock
  if (g === "texture_structure" && s === "fault_rock") return "structure";
  return null;
}
// a word that names many rocks, not one: never a synonym
const GENERIC = new Set(["flow", "flows", "complex", "field", "facies", "series", "undivided", "setting", "origin", "grade", "front", "zone", "site", "basic", "acid", "acidic", "felsic", "mafic", "intermediate", "sheet", "lava", "lapilli", "head", "pan", "spread", "metal", "mud", "silt", "terrain", "stone", "stones", "glass", "salt", "paper", "plastic", "waste", "veneer", "intrusive", "intrusion", "plutonic", "volcanic", "dyke", "dike", "sill", "sediment", "sediments", "rock", "rocks", "igneous", "metamorphic", "sedimentary", "unit", "undifferentiated", "material", "deposit", "deposits", "ground", "fill", "soil"]);
const title = (s) => { const t = s.replace(/_/g, " ").trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

// GeoStrix's matcher reads 'basaltic andesite' as an andesite (the last noun wins, and the words before it are qualifiers, #3770): a name or word whose last word is one
// GeoStrix already has would change that reading, so such terms are left out. Only names and words that end in a rock GeoStrix does not have yet are added.
const lastWord = (k) => k.split(" ").pop();
const readAlready = (k) => taken.has(lastWord(k));
const out = [], seen = new Set(taken);
for (const r of rows) {
  const family = familyOf(r);
  if (!family) continue;
  const name = title(r.detailed_lithology || "");
  const key = norm(name);
  if (!key || seen.has(key) || readAlready(key) || GENERIC.has(lastWord(key))) continue;
  const words = new Set();
  for (const w of String(r.fuzzywuzzy_terms || "").split(/\s+/)) {
    const k = norm(w.replace(/_/g, " "));
    if (!k || k === key || k.length < 4 || GENERIC.has(k) || seen.has(k) || words.has(k) || readAlready(k) || GENERIC.has(lastWord(k))) continue;
    words.add(k);
  }
  seen.add(key); for (const w of words) seen.add(w);
  out.push([name, family, [...words].sort()]);
}
out.sort((a, b) => (a[0] < b[0] ? -1 : 1));

const header = `// TASKS.csv #3429 — the lithology thesaurus's second source: rock names and the other words that name them, with GeoStrix's family for each, from the dh2loop project's
// hierarchical lithology thesaurus (Loop3D/dh2loop v1.0.0, https://github.com/Loop3D/dh2loop, MIT licence, Copyright (c) 2020 Mark Jessell; Joshi et al. 2021,
// Geoscientific Model Development 14, 6711, https://doi.org/10.5194/gmd-14-6711-2021). Its rock terms follow the CGI Simple Lithology vocabulary. Data only
// (names, words, group): no definitions and no code from the repository. GENERATED by scripts/samples/build-dh2loop-thesaurus.mjs: do not edit by hand.
// lithoThesaurus.js reads these AFTER its own entries: a word GeoStrix's own thesaurus has is never overridden. Same shape: [name, family, synonyms].
`;
const body = `export const DH2LOOP = [\n${out.map((e) => `  ${JSON.stringify(e)},`).join("\n")}\n];\n`;
writeFileSync("src/lib/lithoThesaurusDh2loop.js", header + body);
console.log(`${out.length} entries from ${rows.length} rows (${(header.length + body.length).toLocaleString()} bytes)`);
const by = {}; for (const e of out) by[e[1]] = (by[e[1]] || 0) + 1; console.log(by);
