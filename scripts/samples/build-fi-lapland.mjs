// TASKS.csv #3107 — builds sample_data/fi_lapland/ (a regional sample with no drillholes) from two open-licence products of the
// Geological Survey of Finland (GTK, CC BY 4.0), cut to a 100 km by 70 km window of the Central Lapland greenstone belt
// (ETRS-TM35FIN E 400,000-500,000, N 7,490,000-7,560,000):
//   - Rock geochemical data of Finland: the 121 whole-rock samples of the window (major oxides by XRF, trace elements by XRF, ICP-MS
//     and GFAAS), with the rock type, composition and age group GTK gives each;
//   - Bedrock of Finland 1:1 000 000: the lithological units (polygons) and the faults that touch the window. (The 1:200 000 map of
//     the same window is 1,312 polygons and 4.6 MB: too heavy for a sample, and finer than a 100 km window needs.)
// The input is three GeoJSON files as GTK's public map service returns them for that window (layers kalliogeokemia,
// kalliopera_1m_kivilajiseurueet and kalliopera_1m_siirrosrakenteet of Rajapinnat/GTK_Bedrock_WFS, outSR 3067). Nothing is invented.
//
//   node scripts/samples/build-fi-lapland.mjs "<folder with rock_geochem.geojson, bedrock_units_1m.geojson, faults_1m.geojson>"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { shapefileZipFiles, buildZip } from "../../src/lib/shapefile.js";

const src = process.argv[2];
if (!src || !existsSync(src)) { console.error("usage: node scripts/samples/build-fi-lapland.mjs <folder with the three GeoJSON files>"); process.exit(1); }
const out = path.resolve("sample_data/fi_lapland");
mkdirSync(out, { recursive: true });
const load = (n) => JSON.parse(readFileSync(path.join(src, n), "utf8")).features;
// ETRS-TM35FIN (EPSG:3067) is ETRS89 / UTM zone 35N carried across all of Finland: the same projection and numbers as EPSG:25835, the
// code GeoStrix has a definition for. The files are written under 25835 and the README says so.
const EPSG = 25835;
const txt = (v) => (v == null ? "" : String(v).trim());

// ---- map layers: geometry as served (1:1 000 000), the descriptive attributes under short names ----
function layer(file, name, geomType, fields) {
  const feats = [];
  for (const f of load(file)) {
    const g = f.geometry, attributes = {};
    for (const [to, from] of fields) attributes[to] = txt(f.properties[from]) === "None" ? "" : txt(f.properties[from]);
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : g.type === "LineString" ? [[g.coordinates]] : g.type === "MultiLineString" ? g.coordinates.map((l) => [l]) : [];
    for (const rings of polys) feats.push({ geometry: rings[0], parts: rings, attributes });
  }
  const zip = buildZip(shapefileZipFiles({ features: feats, geomType, epsg: EPSG, baseName: name, keepFieldCase: true, flat: true }));
  writeFileSync(path.join(out, `${name}.zip`), zip);
  console.log(`${name}.zip: ${feats.length} ${geomType} parts, ${zip.length.toLocaleString()} bytes`);
  return feats;
}
layer("bedrock_units_1m.geojson", "bedrock_units", "polygon", [["ROCK_NAME", "ROCK_NAME_"], ["ROCK_CLASS", "ROCK_CLASS_"], ["ASSOC", "ROCK_ASSOCIATION_"], ["ERA", "ERA_"], ["PERIOD", "PERIOD_"],
  ["GROUP", "GROUP__"], ["FORMATION", "FORMATION_"], ["SUITE", "SUITE_"], ["LITHODEME", "LITHODEME_"], ["COMPLEX", "COMPLEX_"], ["SETTING", "TECTONIC_SETTING_"]]);
layer("faults_1m.geojson", "faults", "polyline", [["FAULT_TYPE", "STRUCTURAL_LINE_TYPE_"], ["NAME", "NAME"], ["BASIS", "BASIS_"]]);

// ---- whole-rock samples -> rocks.csv ----
// One value per element from the TOTAL methods: XRF for the major oxides (iron as FeO, total) and its trace elements, ICP-MS for the
// rare earths and other traces, GFAAS for As, Bi, Se, Au, Pd and Te. The ICP-AES columns are an aqua regia (partial) leach and are left
// out, as are carbon, CO2 and fluorine. Each value has a companion "LRC" column: "<" there means below detection, and the value is then the
// detection limit, written here as "<value". Rows GTK flags as duplicates (DUPLICATE = D) are left out.
const OX = [["SiO2", "SIO2"], ["TiO2", "TIO2"], ["Al2O3", "AL2O3"], ["FeO", "FEO"], ["MnO", "MNO"], ["MgO", "MGO"], ["CaO", "CAO"], ["Na2O", "NA2O"], ["K2O", "K2O"], ["P2O5", "P2O5"]].map(([h, c]) => [`${h}_pct`, `${c}_XRF_PERCENT`, `${c}_XRF_LRC`]);
const el = (sym, method, unit = "PPM") => [`${sym}_${unit === "PPB" ? "ppb" : "ppm"}`, `${sym.toUpperCase()}_${method}_${unit}`, `${sym.toUpperCase()}_${method}_LRC`];
const TR = [...["Ba", "Cl", "Cr", "Cu", "Ga", "Mo", "Ni", "Pb", "Rb", "S", "Sr", "V", "Zn", "Zr"].map((s) => el(s, "XRF")),
  ...["Ce", "Co", "Dy", "Er", "Eu", "Gd", "Hf", "Ho", "La", "Lu", "Nb", "Nd", "Pr", "Sc", "Sm", "Ta", "Tb", "Th", "Tm", "U", "Y", "Yb"].map((s) => el(s, "ICPMS")),
  ...["As", "Bi", "Se"].map((s) => el(s, "GFAAS")), ...["Au", "Pd", "Te"].map((s) => el(s, "GFAAS", "PPB"))];
const all = load("rock_geochem.geojson");
for (const [, c, l] of [...OX, ...TR]) if (!(c in all[0].properties) || !(l in all[0].properties)) throw new Error(`the service's table has no column ${c} / ${l}`);
const BOX = [400000, 7490000, 500000, 7560000];
const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const head = ["sample_id", "x", "y", "z", "medium", "rock_type", "rock_group", "composition", "age_group", "sample_type", ...OX.map((c) => c[0]), ...TR.map((c) => c[0])];
const rows = [];
let dup = 0, outside = 0;
for (const f of all) {
  const p = f.properties, [x, y] = f.geometry.coordinates;
  if (txt(p.DUPLICATE) === "D") { dup++; continue; }
  if (x < BOX[0] || x > BOX[2] || y < BOX[1] || y > BOX[3]) { outside++; continue; }
  const cell = ([, c, l]) => { const v = p[c]; if (v == null || v === "") return ""; const n = Number(v); if (!Number.isFinite(n)) return ""; const s = String(Number(n.toPrecision(6))); return txt(p[l]) === "<" ? `<${s}` : s; };
  rows.push([txt(p.LABNUM), x.toFixed(0), y.toFixed(0), "", "rock", txt(p.ROCKTYPE).toLowerCase(), txt(p.ROCKTYPEGROUP_), txt(p.COMPOSITION_), txt(p.AGEGROUP), txt(p.SAMTYPE), ...OX.map(cell), ...TR.map(cell)].map((v) => q(String(v))).join(","));
}
if (new Set(rows.map((r) => r.split(",")[0])).size !== rows.length) throw new Error("a sample id is repeated");
writeFileSync(path.join(out, "rocks.csv"), [head.join(","), ...rows].join("\n") + "\n");
console.log(`rocks.csv: ${rows.length} samples (${dup} duplicates and ${outside} outside the window left out), ${OX.length} oxides and ${TR.length} other columns`);
