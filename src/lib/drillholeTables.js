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
import { collarAttrPairs, collarAttrNames, collarsWithFirstStation, attFromText } from "./collarAttrExport.js"; // TASKS.csv #3613; #3623 — the attitude from the first survey station
import { LAYER_META } from "./layers.js";

// the value column under a name the importer maps to that layer on its own (TARGET_SCHEMAS aliases), and a file name
// its filename hint (NAME_HINTS) sends to the same layer
const LAYER_COLUMNS = {
  litho: ["lithology", "lithology"], litho_gc: ["lithology", "lithology_geochem"],
  alt: ["alteration", "alteration"], alt_gc: ["alteration", "alteration_geochem"],
  vein: ["vein_type", "veins"], breccia: ["breccia_type", "breccia"], weath: ["weathering", "weathering"], // weath: #2162
  geotech: ["rqd_pct", "geotech_rqd"], recovery: ["recovery_pct", "recovery"], sg: ["sg", "specific_gravity"],
  mnlgy: ["mineral", "mineralization"], magsusc: ["mag_sus", "mag_sus"],
  structzone: ["structure_code", "structure_zones"], structure: ["structure_type", "structure"],
};
const cell = (v) => (typeof v === "number" && !Number.isFinite(v) ? "" : v ?? "");
const negDown = (d) => (Number.isFinite(d) ? -d : "");
const rest = (r, skip) => Object.fromEntries(Object.entries(r).filter(([k, v]) => !k.startsWith("_") && !skip.has(k) && v !== undefined).map(([k, v]) => [k, cell(typeof v === "object" && v !== null ? JSON.stringify(v) : v)]));

// TASKS.csv #3613 — the collar's own fields (collar.attrs) as one column each, the same columns on every row; #3615 — epsg: the project's CRS as a column, which the importer reads back, so the table set
// opens with no question
export function collarTableRows(collars, { epsg = null, dataCredit = "" } = {}) { // dataCredit: #3659 — the data owner's credit as a column, so a project rebuilt from these tables gets it back
  const skip = new Set(["hole_id", "x", "y", "z", "azimuth", "dip", "length", "attrs"]);
  const reserved = ["hole_id", "x", "y", "z", "azim_grid", "dip", "length", "epsg", "data_credit"];
  const names = collarAttrNames(collars, reserved), attFrom = (collars || []).some((c) => c?._attFrom);
  return (collars || []).map((c, ci) => { const pairs = Object.fromEntries(collarAttrPairs(c, reserved)); return { hole_id: c.hole_id, x: cell(c.x), y: cell(c.y), z: cell(c.z), azim_grid: cell(c.azimuth), dip: negDown(c.dip), length: cell(c.length), ...(epsg ? { epsg } : {}), ...(dataCredit && ci === 0 ? { data_credit: dataCredit } : dataCredit ? { data_credit: "" } : {}), /* #3719 (f) — the credit once, on the first row (the importer takes the first one): it was 150 characters on 559 rows, 84 KB of 159 KB */ ...(attFrom ? { attitude_from: attFromText(c) } : {}), ...rest(c, skip), ...Object.fromEntries(names.map((n) => [n, cell(pairs[n])])) }; });
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

// -> [{ name, text }]: collars.csv, survey.csv, one CSV per loaded hole log, one per custom layer (#1701), assays.csv (#1701) and provenance.txt
// (geophysics points have no hole: not a table here)
// TASKS.csv #3614 (Fireweed rehearsal) — the tables were exact but opened badly: four '#' lines (the first a Mineral Resource disclaimer on a collar table) above every header, so an import wizard's
// first row was not the column names. Each CSV is now clean (row 1 = the column names); the conventions (CRS, dip sign, units, the tool and its version) are one provenance.txt beside them in the zip.
// A collar, survey or assay table is data, not an estimate: the not-a-resource line is not on it.
export function drillholeTableFiles({ collars = [], survey = [], layers = {}, customLayers = [], assays = [], assayElements = [], epsg, version, dataCredit = "" }) { // dataCredit: TASKS.csv #3659
  const files = [], notes = [];
  collars = collarsWithFirstStation(collars, survey); // #3623
  const add = (name, text, note) => { files.push({ name, text }); notes.push(`${name}: ${note}`); };
  const epsgNum = Number.isFinite(Number(epsg)) && Number(epsg) > 0 ? Number(epsg) : null;
  if (collars.length) add("collars.csv", toExportCsv(collarTableRows(collars, { epsg: epsgNum, dataCredit })), "one row per hole" + (epsgNum ? `; the epsg column is the project CRS (EPSG:${epsgNum}), which the import reads` : "") + "; one column for each of the collar's own fields");
  if (collars.length) { // TASKS.csv #3635 — a data dictionary of the collar columns beside collars.csv: what each field is, how many holes have it
    const rows = collarTableRows(collars, { epsg: epsgNum, dataCredit }), cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const core = { hole_id: "the hole's id", x: "easting (project coordinates)", y: "northing (project coordinates)", z: "collar elevation (m)", azim_grid: "azimuth of the hole, a grid bearing", dip: "dip, negative = down", length: "hole length (m)", epsg: "the project's coordinate system (EPSG code)", attitude_from: "where an azimuth / dip the collar did not carry came from", data_credit: "the data owner's credit (the project's data credit; a re-import restores it)" };
    const dict = cols.map((c0) => { const c = c0;
      const vals = rows.map((r) => r[c]).filter((v) => v !== "" && v != null);
      // the type the Shapefile / GeoPackage give the field: a number only where the value IS a number (a year kept as the text '2023' is text there too, so the dictionary says so)
      const raw = (collars || []).map((c) => (collarAttrPairs(c, ["hole_id", "x", "y", "z", "azim_grid", "dip", "length", "epsg", "data_credit"]).find(([k]) => k === c0)?.[1])).filter((v) => v !== undefined && v !== "" && v != null);
      const isCore = ["x", "y", "z", "azim_grid", "dip", "length", "epsg"].includes(c), kind = !vals.length ? "empty" : isCore ? "number" : ["hole_id", "attitude_from", "data_credit"].includes(c) ? "text" : raw.length && raw.every((v) => typeof v === "number") ? "number" : "text";
      return { field: c0, meaning: core[c] || "the hole's own field from the file", type: kind, holes_with_a_value: vals.length, holes: rows.length, distinct_values: new Set(vals.map(String)).size, example: vals.length ? String(vals[0]) : "" };
    });
    add("collars_fields.csv", toExportCsv(dict), "one row per column of collars.csv: its meaning, type, how many holes have a value and an example");
  }
  if (survey.length) add("survey.csv", toExportCsv(surveyTableRows(survey)), "survey stations (depth, azimuth, dip)");
  for (const [key, rows] of Object.entries(layers || {})) {
    if (!Array.isArray(rows) || !rows.length || key === "geophys_pts") continue;
    add(layerTableFileName(key), toExportCsv(layerTableRows(key, rows)), LAYER_META[key]?.label || key);
  }
  const taken = new Set(files.map((f) => f.name));
  (customLayers || []).forEach((l, i) => {
    if (!l?.rows?.length) return;
    let name = customLayerFileName(l.name, i);
    for (let k = 2; taken.has(name); k++) name = customLayerFileName(`${l.name}_${k}`, i);
    taken.add(name);
    add(name, toExportCsv(layerTableRows("custom", l.rows)), `custom layer ${l.name || i + 1}`);
  });
  if ((assays || []).length && (assayElements || []).length) {
    add("assays.csv", toExportCsv(assayTableRows(assays, assayElements)), "one column per element, named with its unit (_pct = %); a '<' or '>' result keeps its qualifier in front of the value; a below-detection value is the one the app holds (half the limit when read from '<x')");
  }
  if (files.length) {
    const lines = [
      `GeoStrix drillhole tables${version ? ` | GeoStrix ${version}` : ""} | generated ${new Date().toISOString()}`,
      dataCredit ? `Data credit: ${String(dataCredit).replace(/\s+/g, " ")}` : null, // #3659
      epsg === "unset" ? "Project CRS: not set (the coordinates are the project's own numbers, with no real-world reference)" : epsgNum ? `Project CRS: EPSG:${epsgNum}` : null,
      "Dip: negative = down (import with the default \"Negative = down\"). Azimuths and dip directions: project-grid bearings (import as grid north).",
      "", ...notes,
    ].filter((l) => l !== null);
    files.push({ name: "provenance.txt", text: `${lines.join("\r\n")}\r\n` });
  }
  return files;
}

