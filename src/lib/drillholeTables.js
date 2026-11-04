// TASKS.csv #1034 (review #1016, drillhole-database admin) — the drillhole database as TABLES (collars, survey, one CSV
// per log), in the columns and conventions the CSV importer reads back unaided: a geologist who cleaned or merged data in
// GeoStrix can hand it back. Before, collars / survey / logs left only as geometry (SHP / GPKG / DXF), and the SQL
// workspace's CSV carried the internal positive-down dip and dropped structure dips and custom fields.
// - dip: stored positive-down inside the app (the importer's "Negative = down" flips it); written negative = down
//   again, so the default re-import gives back the same hole (#190).
// - azimuths are project-grid bearings (#577): the collar column is azim_grid (an importer alias), the survey column
//   "azimuth" with the stamp saying grid; structure dip directions are grid too.
// - every custom field (#208) is kept; internal "_" fields are not written.
// - each file starts with a "#" stamp (skipped by the importer, #720) naming the CRS and the conventions.
import { toExportCsv } from "./tabular.js";
import { stampLines, withStamp } from "./provenance.js";
import { LAYER_META } from "./layers.js";

// the value column under a name the importer maps to that layer on its own (TARGET_SCHEMAS aliases), and a file name
// its filename hint (NAME_HINTS) sends to the same layer
const LAYER_COLUMNS = {
  litho: ["lithology", "lithology"], litho_gc: ["lithology", "lithology_geochem"],
  alt: ["alteration", "alteration"], alt_gc: ["alteration", "alteration_geochem"],
  vein: ["vein_type", "veins"], breccia: ["breccia_type", "breccia"],
  geotech: ["rqd_pct", "geotech_rqd"], recovery: ["recovery_pct", "recovery"], sg: ["sg", "specific_gravity"],
  mnlgy: ["mineral", "mineralization"], magsusc: ["mag_sus", "mag_sus"],
  structzone: ["structure_code", "structure_zones"], structure: ["structure_type", "structure"],
};
const cell = (v) => (typeof v === "number" && !Number.isFinite(v) ? "" : v ?? "");
const negDown = (d) => (Number.isFinite(d) ? -d : "");
const rest = (r, skip) => Object.fromEntries(Object.entries(r).filter(([k, v]) => !k.startsWith("_") && !skip.has(k) && v !== undefined).map(([k, v]) => [k, cell(typeof v === "object" && v !== null ? JSON.stringify(v) : v)]));

export function collarTableRows(collars) {
  const skip = new Set(["hole_id", "x", "y", "z", "azimuth", "dip", "length"]);
  return (collars || []).map((c) => ({ hole_id: c.hole_id, x: cell(c.x), y: cell(c.y), z: cell(c.z), azim_grid: cell(c.azimuth), dip: negDown(c.dip), length: cell(c.length), ...rest(c, skip) }));
}
export function surveyTableRows(survey) {
  const skip = new Set(["hole_id", "depth", "azimuth", "dip"]);
  return (survey || []).map((s) => ({ hole_id: s.hole_id, depth: cell(s.depth), azimuth: cell(s.azimuth), dip: negDown(s.dip), ...rest(s, skip) }));
}
export function layerTableRows(key, rows) {
  const valueCol = LAYER_COLUMNS[key]?.[0] || "value";
  if (key === "structure") {
    const skip = new Set(["hole_id", "depth", "value", "dip", "azimuth", "alpha", "beta", "structure_id", "overturned"]);
    return (rows || []).map((r) => ({ hole_id: r.hole_id, depth: cell(r.depth), [valueCol]: cell(r.value), dip: cell(r.dip), dip_direction: cell(r.azimuth), alpha: cell(r.alpha), beta: cell(r.beta), structure_id: cell(r.structure_id), overturned: r.overturned ? "Y" : "", ...rest(r, skip) }));
  }
  const skip = new Set(["hole_id", "from", "to", "depth", "value", "extra"]);
  return (rows || []).map((r) => ({
    hole_id: r.hole_id,
    ...(r.from !== undefined || r.to !== undefined ? { from: cell(r.from), to: cell(r.to) } : {}),
    ...(r.depth !== undefined ? { depth: cell(r.depth) } : {}),
    [valueCol]: cell(r.value),
    ...(r.extra !== undefined ? { [key === "mnlgy" ? "pct" : "extra"]: cell(r.extra) } : {}),
    ...rest(r, skip),
  }));
}
export function layerTableFileName(key) {
  return `${LAYER_COLUMNS[key]?.[1] || String(key).replace(/[^\w-]+/g, "_").toLowerCase() || "layer"}.csv`;
}

// TASKS.csv #1701 (review #1645, Copley) — the assays as one wide table: hole_id, from, to, one column per element named with its unit
// (Cu_ppm, Au_ppb, Zn_pct: the importer reads the unit from the header), a '<' / '>' qualifier kept in front of the value, then the
// row's own fields (sample_id, source, ...). Copley's 2,095 lab and pXRF intervals were left out of 'all drillhole tables'.
const unitTag = (u) => String(u || "ppm").replace("%", "pct");
export function assayTableRows(assays, assayElements = []) {
  const els = assayElements.map((e) => e.symbol);
  const unit = Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit]));
  const skip = new Set(["hole_id", "from", "to", "values", "qualifiers", "bdl"]);
  return (assays || []).map((r) => {
    const row = { hole_id: r.hole_id, from: cell(r.from), to: cell(r.to) };
    for (const s of els) { const v = r.values?.[s], q = r.qualifiers?.[s]; row[`${s}_${unitTag(unit[s])}`] = v == null ? "" : q === "<" || q === ">" ? `${q}${v}` : cell(v); }
    return { ...row, ...rest(r, skip) };
  });
}
// a custom layer's file: its own name, made safe, under custom_
export const customLayerFileName = (name, i) => `custom_${String(name || `layer_${i + 1}`).replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || `layer_${i + 1}`}.csv`;

// -> [{ name, text }]: collars.csv, survey.csv, one CSV per loaded hole log, one per custom layer (#1701) and assays.csv (#1701)
// (geophysics points have no hole: not a table here)
export function drillholeTableFiles({ collars = [], survey = [], layers = {}, customLayers = [], assays = [], assayElements = [], epsg, version }) {
  const conv = (what) => stampLines({ tool: `Drillhole tables: ${what}`, version, epsg, params: [
    "Dip: negative = down (import with the default \"Negative = down\"). Azimuths and dip directions: project-grid bearings (import as grid north).",
  ] });
  const files = [];
  if (collars.length) files.push({ name: "collars.csv", text: withStamp(toExportCsv(collarTableRows(collars)), conv("collars")) });
  if (survey.length) files.push({ name: "survey.csv", text: withStamp(toExportCsv(surveyTableRows(survey)), conv("survey")) });
  for (const [key, rows] of Object.entries(layers || {})) {
    if (!Array.isArray(rows) || !rows.length || key === "geophys_pts") continue;
    files.push({ name: layerTableFileName(key), text: withStamp(toExportCsv(layerTableRows(key, rows)), conv(LAYER_META[key]?.label || key)) });
  }
  const taken = new Set(files.map((f) => f.name));
  (customLayers || []).forEach((l, i) => {
    if (!l?.rows?.length) return;
    let name = customLayerFileName(l.name, i);
    for (let k = 2; taken.has(name); k++) name = customLayerFileName(`${l.name}_${k}`, i);
    taken.add(name);
    files.push({ name, text: withStamp(toExportCsv(layerTableRows("custom", l.rows)), conv(`custom layer ${l.name || i + 1}`)) });
  });
  if ((assays || []).length && (assayElements || []).length) {
    files.push({ name: "assays.csv", text: withStamp(toExportCsv(assayTableRows(assays, assayElements)), stampLines({ tool: "Drillhole tables: assays", version, epsg, params: ["One column per element, named with its unit (_pct = %). A '<' or '>' result keeps its qualifier in front of the value; a below-detection value is the one the app holds (half the limit when read from '<x')."] })) });
  }
  return files;
}

