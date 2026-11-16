// TASKS.csv #3590 (startup trim) — the generic import's schemas and column-mapping helpers, moved out of layers.js (verbatim). The startup chunk had to carry
// every name a lazily-loaded module imports from a module it also loads, so the import half of layers.js (schemas, header guessing, collar merge) was in the startup
// bundle although only the import dialog and pipeline use it. Nothing here changes: layers.js keeps the layer kinds, colours and legends.
// (This file imports what it needs from layers.js; layers.js does not import this one.)
import { looksLikeLogTable, zeroLengthRows } from "./downholeLogChannels.js"; // TASKS.csv #2160; zeroLengthRows: #2884
import { looksLikeEventTable } from "./downholeEvents.js"; // TASKS.csv #2317
import { guessStructureColumns } from "./mapStructures.js"; // TASKS.csv #3590 // TASKS.csv #426
import { gridCoordinateColumns, gridElevation } from "./gridColumns.js"; // TASKS.csv #2151, moved: #2564
import { isElementColumn } from "./geochemColumns.js"; // TASKS.csv #2150; #3159: geochemColumns, not geochem.js (the whole geochem library in startup)
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language

// ============================================================
// generic CSV import: target schemas + column-mapping helpers
// ============================================================
// TASKS.csv #2149 (WA drillhole database review #2148) — mTo is the commonest unmatched column in WAMEX (14,164 files) and
// DMIRS's own harmonized pair is FromDepth / ToDepth: "to" is too short for the substring pass, so every such interval table
// opened with To empty and Import disabled. One list for the interval schemas, the custom layer and the assay dialog.
export const INTERVAL_FROM_ALIASES = ["from", "from_m", "depth_from", "from_depth", "fromdepth", "depthfrom", "mfrom", "m_from", "dfrom", "geolfrom", "sampfrom", "geol_from", "samp_from", "interval_from", "start_depth", "startdepth", "depth_start"];
export const INTERVAL_TO_ALIASES = ["to", "to_m", "depth_to", "to_depth", "todepth", "depthto", "mto", "m_to", "dto", "geolto", "sampto", "geol_to", "samp_to", "interval_to", "end_depth", "enddepth", "depth_end"];
function intervalFields(valueAliases, extraAliases, numeric, descriptionAliases) {
  const fields = [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid", "dhid", "ddh", "ddh_id", "ddh_no"] },
    { key: "from", label: "From", required: true, aliases: INTERVAL_FROM_ALIASES },
    { key: "to", label: "To", required: true, aliases: INTERVAL_TO_ALIASES },
    // TASKS.csv #320 — "value"/"val" as LAST-resort aliases: a hand-built hole_id,from,to,value file left
    // Value unmapped. Appended, so every layer's own names (litho, rock_type...) still win.
    { key: "value", label: numeric ? "Value (numeric)" : "Value", required: true, aliases: [...valueAliases, ...["value", "val"].filter((a) => !valueAliases.includes(a))] },
  ];
  if (extraAliases) fields.push({ key: "extra", label: "Extra (optional, e.g. %)", required: false, aliases: extraAliases });
  // TASKS.csv #208 — real source data (esp. lithology logs) very often carries a free-text
  // description/comments column alongside the coded value ("Pale green. Consistent fine grain.");
  // previously unmappable and silently dropped on import.
  if (descriptionAliases) fields.push({ key: "description", label: "Description (optional)", required: false, aliases: descriptionAliases });
  return fields;
}

// TASKS.csv #205 — name-guess aliases for an optional per-row source-CRS column (e.g. a merged
// regional DB export where different collars were surveyed in different UTM zones), matched the
// same way guessColumn already resolves hole_id/x/y/z against real-world header variants.
export const EPSG_COL_ALIASES = ["epsg_srid", "source_epsg", "epsg", "srid", "crs_epsg", "crs"];

export const TARGET_SCHEMAS = {
  collars: { label: "Collars", fields: [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid", "dhid", "ddh", "ddh_id", "ddh_no", "hole_name"] },
    { key: "x", label: "Easting (X)", required: true, aliases: ["x", "easting", "east", "utm_e", "utme"] },
    { key: "y", label: "Northing (Y)", required: true, aliases: ["y", "northing", "north", "utm_n", "utmn"] },
    { key: "z", label: "Elevation (Z)", required: true, aliases: ["z", "elevation", "elev", "rl", "utm_z"] },
    { key: "azimuth", label: "Azimuth (for straight holes w/ no survey)", required: false, aliases: ["azimuth", "azim_grid", "azi", "az", "brg", "bearing", "collar_az", "hole_az"] }, // collar_az / hole_az: #1655 (acQuire's Collar_Az_D; 'az' alone matches a whole header only) // az / brg / bearing: #546; azim_grid: GeoStrix's own collar export (#577) — exact, so it beats azim_true
    { key: "dip", label: "Dip (for straight holes w/ no survey)", required: false, aliases: ["dip", "inclination", "incl"] }, // #605: inclination (MX-style collar sheets)
    { key: "length", label: "Hole length (optional)", required: false, aliases: ["length", "total_depth", "eoh", "max_depth", "hole_length", "actual depth", "actual_depth", "final_depth", "final depth", "td", "depth"] }, // td: #2151 (WAMEX); #600: "Actual depth" before a planned "Target depth"
  ], dipConvention: true },
  survey: { label: "Survey", fields: [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid", "dhid", "ddh", "ddh_id", "ddh_no"] },
    { key: "depth", label: "Depth", required: true, aliases: ["depth", "at", "md", "station", "dist", "distance"] }, // dist: #1105 (Micromine HOLEID, DIST, AZIMUTH, DIP)
    { key: "azimuth", label: "Azimuth", required: true, aliases: ["azimuth", "azi", "az", "azim", "brg", "bearing"] }, // brg / bearing: Datamine (#546)
    { key: "dip", label: "Dip", required: true, aliases: ["dip", "inclination", "incl"] },
  ], dipConvention: true },
  // TASKS.csv #600 — Lith_Code / Lith1_Code / Rock_Code before the generic "unit": a real ARIS export has
  // Lith_Code (filled) beside Lith_Group_Unit (blank on every row), and "unit" picked the blank one.
  litho: { label: "Lithology", fields: intervalFields(["lithology", "lith_code", "lith1_code", "lith1_gf_code", "lithcode", "lithology1", "lith1", "rock1", "geol_rock1", "maj_lithcode", "major_lithcode", /* #2153 */ "rock_code", "rock_type", "rocktype", "litho", "lith", "rock", "unit", "litho_unit"], null, false, ["description", "comments", "comment", "notes", "desc", "lith_desc", "lith1_local_comments", /* #3735 */ "lith_name", "lithology_name", "rock_name"]) },
  // TASKS.csv #600 — the column names real logging exports use (acQuire / MX Deposit, seen in BC ARIS reports):
  // numbered primary columns (Alt1_Code, Min1_Code / Min_Code1, Vein1_Comp / Vein_Type1, MagSus1, Ave_Reading,
  // BulkDens_Calc, SG_D). Listed FIRST so the primary (1st) column wins over a later one.
  alt: { label: "Alteration", fields: [
    ...intervalFields(["alt1_code", "alt_code", "alt_assemblage", "alt_rx_min1_type", "alt_min1_type", "alt_min_1_type", "alt1_mineral", "alt_mineral", "alt1_min", "altn1", "alt1_style", "alt2_code", "assemblage", "assemb", "alteration"]), // alt_rx_min1_type: #1345 (acQuire); alt1_mineral…: #2153 / #2184 (WAMEX); assemb: #3204 (AL_HIGHT_ASSEMB / AL_LOWT_ASSEMB, the first one)
    // TASKS.csv #1511 — intensity as logged (text: "3", "W", "strong"), as structural zones keep it (#604)
    { key: "intensity", label: "Intensity (optional)", required: false, aliases: ["alt1_intensity", "alt_intensity", "alt1_int", "alt_int", "alteration_intensity", "intensity"] },
  ] },
  vein: { label: "Veins", fields: intervalFields(["vein1_comp", "vein_type1", "vein1_type", "vein_comp", "vein1_code", "vein_code", "vein2_code", "veins", "assemblage", "type", "vein_type", "type_code"]) }, // type_code: 40958Z "Vein type"; vein1_code / veins: #2153
  // TASKS.csv #2162 — WA weathering (5,096 files), oxidation (2,237) and regolith (3,217) logs: one layer, whichever word the file uses
  weath: { label: "Weathering", fields: intervalFields(["weathering", "weath", "weath_code", "weathering_code", "weath1", "weath_code1", "oxidation", "oxid", "oxidation_state", "ox_state", "oxide_zone", "redox", "regolith", "regol", "regolith_code", "regolith_unit", "reg_code"], null, false, ["description", "comments", "comment", "notes", "desc"]) },
  breccia: { label: "Breccia", fields: intervalFields(["breccia_type", "brecc_type", "brx_type", "bx_type", "bx_class", "breccia", "assemblage", "genesis", "type"]) }, // TASKS.csv #608; bx_class: #1345
  // TASKS.csv #604 — structure logged as zones (from / to + code + intensity + alpha), Matt 2026-10-21: "keep it as
  // intervals, as a layer of structural zones". Intensity stays text (Copley "4", Woodjam "M"); alpha is the zone's
  // representative core angle when logged, kept but not turned into a plane (one angle for a whole zone is not a pick).
  structzone: { label: "Structural zones", fields: [
    ...intervalFields(["struc_code", "struct_code", "structure_code", "structure_type", "struc_type", "struct_type", "zone_type", "structure", "struct", "type"], null, false, ["struc_desc", "struct_desc", "structure_desc", "comments", "comment", "description", "desc", "notes"]),
    { key: "intensity", label: "Intensity (optional)", required: false, aliases: ["struc_intensity", "struct_intensity", "structure_intensity", "structure_int", "intensity"] },
    { key: "alpha", label: "Alpha (core angle, optional)", required: false, aliases: ["struc_alpha", "struct_alpha", "structure_alpha", "alpha", "alpha_deg"] },
  ] },
  mnlgy: { label: "Mineralization", fields: intervalFields(["min1_code", "min_code1", "min_code", "min_mnlgy", "sul_min_1", "sulph_min_1", "mineral"], ["min1_pct", "min_pct1", "min_int_pct", "sul_min_1_pct", "percent", "pct"]) }, // sul_min_1: #1345 (acQuire sulphide log)
  geotech: { label: "Geotech (numeric)", fields: intervalFields(["rqd_pct", "rqd_pct_d", "rqq_pct_d", "rqd", "value"], null, true) }, // #1345: the percent column before REC_RQD_M (metres)
  recovery: { label: "Recovery % (numeric)", fields: intervalFields(["recovery_pct", "recovery", "rec_pct", "rec_pct_d", "core_recovery", "value"], null, true) },
  sg: { label: "Specific gravity (numeric)", fields: intervalFields(["sg", "sg_d", "bulkdens_calc", "sg_calc", "calc_sg" /* #3204: CALC-SG */, "specific_gravity", "specific_grav", "bulk_density", "density", "reading", "value"], null, true) }, // reading: #2153 (beside Weight_Wet / Weight_Dry)
  // TASKS.csv #605 — mag sus is often logged as POINT readings (depth + value, an MX-style "Mag Susc" sheet), so a
  // Depth column is an alternative to From / To (oneOf below; the reading is placed at that depth).
  magsusc: { label: "Mag. susceptibility (numeric)", oneOf: [["from", "to"], ["depth"]], fields: [
    ...intervalFields(["mag_avg_si", "ave_reading", "avg_reading", "mag_reading", "ms_reading" /* #3204 */, "magsus1", "magsus", "mag_si", "mag_sus", "mag_avg", "mag", "value"], null, true) // mag_reading: #1345
      .map((f) => (f.key === "from" || f.key === "to" ? { ...f, required: false, label: `${f.label} (or Depth below)` } : f)),
    { key: "depth", label: "Depth (point readings, instead of From / To)", required: false, aliases: ["depth", "depth_m", "md", "at"] },
  ] },
  structure: { label: "Structure planes", fields: [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid", "dhid", "ddh", "ddh_id", "ddh_no"] },
    { key: "depth", label: "Depth", required: true, aliases: ["depth_m", "depth", "at", "md", "geolfrom", "from"] }, // geolfrom / from: #1345 (acQuire point table, GEOLFROM = GEOLTO)
    { key: "value", label: "Structure type", required: true, aliases: ["structure_type", "stpt_feature", "type", "struct", "structure"] },
    { key: "dip", label: "Dip (optional)", required: false, aliases: ["inferred_dip_deg", "dip"] },
    { key: "azimuth", label: "Dip direction / dip azimuth (optional)", required: false, aliases: ["assumed_dip_azimuth", "dip_azimuth", "dip_direction", "dipdirection", "dip_dir", "dipdir", "ddir", "dd", "azimuth"] },
    // TASKS.csv #426 — strike (right-hand rule) is converted to dip direction = strike + 90 when there is
    // no dip-direction column; it used to be silently ignored.
    { key: "strike", label: "Strike, right-hand rule (optional — used when no dip direction)", required: false, aliases: ["strike", "strike_rhr"] },
    // TASKS.csv #427 — oriented-core logging: alpha/beta are converted to dip / dip direction on import
    // using the hole's survey (when the file has no dip/dip-direction of its own); alpha alone is kept.
    { key: "alpha", label: "Alpha (core angle, optional)", required: false, aliases: ["alpha", "alpha_deg", "alpha_angle"] },
    { key: "beta", label: "Beta (optional, clockwise looking down-hole)", required: false, aliases: ["beta", "beta_deg", "beta_angle"] },
    // TASKS.csv #362 — which individual structure a pick belongs to (e.g. "Main Fault", "F2"). Without it,
    // every pick of one type (all 'FLT') is modelled as ONE surface even when they are several faults.
    { key: "structure_id", label: "Structure name / ID (optional — which fault/vein)", required: false, aliases: ["structure_id", "structure_name", "struct_id", "fault_id", "fault_name", "vein_id"] },
    // TASKS.csv #430 — overturned bedding: the implicit model is told the younging side is the other way
    // (GemPy orientation polarity -1). Y / overturned / -1 / down mark a pick as overturned.
    { key: "overturned", label: "Overturned / younging (optional — Y, overturned, -1 or down = overturned)", required: false, aliases: ["overturned", "younging", "facing", "polarity", "way_up"] },
  ] },
  custom: { label: "Custom layer", fields: [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid", "dhid", "ddh", "ddh_id", "ddh_no"] },
    { key: "from", label: "From (leave unset if point data)", required: false, aliases: INTERVAL_FROM_ALIASES },
    { key: "to", label: "To (leave unset if point data)", required: false, aliases: INTERVAL_TO_ALIASES },
    { key: "depth", label: "Depth (for point data)", required: false, aliases: ["depth", "at", "md", "event_depth", "depth_m"] }, // event_depth: #2317
    { key: "value", label: "Value / category", required: true, aliases: ["value", "label", "event_code", "eventcode", "event_type", "boundary_code", "event", "boundary"] }, // event*: #2317
  ] },
};

// TASKS.csv #335 — exact (case-insensitive) header match only, no substring pass. The multi-file drop
// uses this to decide whether a guess is safe to commit without showing the mapping dialog: a required
// field that only matched via guessColumn's substring pass ("inferred_dip_deg" contains "dip") is a
// guess the user must see.
// TASKS.csv #337 — CSV/DB cell -> number, with BLANK meaning "missing" (NaN), never 0. Papa's
// dynamicTyping turns "" into null and Number(null) === 0, so a blank collar RL used to put the collar at
// sea level, a blank survey dip made the hole horizontal and a blank RQD read as 0 %. Common no-data
// spellings count as blank too.
const NO_DATA_TEXT = new Set(["", "na", "n/a", "nan", "null", "none", "-", "--", "nd"]);
// TASKS.csv #2159 (WA drillhole review) — the numeric no-data codes of drillhole databases and LAS logs (las.js COMMON_NULLS): 101,078
// WAMEX density readings of -999 / -999.25 imported as densities, collar PCDEPTH -999, X_east -99999. Read as missing wherever num() reads
// a collar, survey or interval number. Exact values only: -998 or -1000 stay numbers.
export const NULL_SENTINELS = new Set([-999, -999.25, -9999, -99999, -999999]);
export const isNullSentinel = (v) => NULL_SENTINELS.has(typeof v === "number" ? v : Number(String(v ?? "").trim()));
export function num(v) {
  if (v == null) return NaN;
  if (typeof v === "number") return NULL_SENTINELS.has(v) ? NaN : v;
  const s = String(v).trim();
  if (NO_DATA_TEXT.has(s.toLowerCase())) return NaN;
  const n = Number(s);
  return NULL_SENTINELS.has(n) ? NaN : n; // #2159
}

// TASKS.csv #336 — re-importing a hole's rows REPLACES that hole's existing rows instead of appending a
// second copy. Daily camp re-imports of corrected survey/logging files used to leave old and new rows
// interleaved (holes zig-zagging between two surveys, intercept metres doubled); QC only warned after
// the fact. Holes not in the new file are untouched, so building one layer from several files that
// cover DIFFERENT holes still works. Returns the merged list and which holes were replaced.
// TASKS.csv #605 — keepRows (a Set/WeakSet of row objects): rows committed earlier in the SAME drop are never
// replaced. Two files of one delivery feeding one layer (a workbook's Alteration and Breccia sheets) add up;
// before, the second wiped the first's rows for every hole they shared.
// TASKS.csv #582 — a hole-EXTENSION file (a deepening / re-entry campaign shipping only the new metres, e.g.
// 150-300 m) used to wipe the hole's 0-150 m logging and its upper survey stations. Per hole now: when everything
// incoming lies at or below the deepest existing row (touching allowed), the rows are APPENDED (appendedHoles);
// only overlapping depth ranges replace. Rows without depths (from / to / depth) keep the #336 replace rule. For
// point rows (survey stations, structure picks) a station repeated at exactly the join depth is not doubled: the
// incoming one wins.
const rowTop = (r) => (Number.isFinite(r.from) ? r.from : Number.isFinite(r.depth) ? r.depth : NaN);
const rowBottom = (r) => (Number.isFinite(r.to) ? r.to : Number.isFinite(r.depth) ? r.depth : NaN);
// TASKS.csv #2799 — opts.identical false: only the rows (a state setter after the notice's own call): the identical-hole check is most of the
// cost (0.29 s of 0.35 s for 430 holes x 50 rows) and the import ran it two or three times per file
export function replaceRowsByHole(prev, incoming, keepRows = null, { identical = true } = {}) {
  const incomingHoles = new Set(incoming.map((r) => r.hole_id));
  const inTop = new Map();
  incoming.forEach((r) => { const t = rowTop(r); if (Number.isFinite(t)) inTop.set(r.hole_id, Math.min(inTop.get(r.hole_id) ?? Infinity, t)); });
  const oldBottom = new Map(), oldUndated = new Set();
  (prev || []).forEach((r) => {
    if (!incomingHoles.has(r.hole_id) || keepRows?.has(r)) return;
    const b = rowBottom(r);
    if (Number.isFinite(b)) oldBottom.set(r.hole_id, Math.max(oldBottom.get(r.hole_id) ?? -Infinity, b)); else oldUndated.add(r.hole_id);
  });
  const appendHole = (h) => inTop.has(h) && oldBottom.has(h) && !oldUndated.has(h) && inTop.get(h) >= oldBottom.get(h) - 1e-6;
  const replacedHoles = new Set(), appendedHoles = new Set();
  const kept = [];
  (prev || []).forEach((r) => {
    if (!incomingHoles.has(r.hole_id) || keepRows?.has(r)) { kept.push(r); return; }
    if (appendHole(r.hole_id)) {
      appendedHoles.add(r.hole_id);
      // a point row at exactly the join depth is the same station / pick: the incoming one replaces it
      if (!Number.isFinite(r.from) && Number.isFinite(r.depth) && Math.abs(r.depth - inTop.get(r.hole_id)) < 1e-6) return;
      kept.push(r);
      return;
    }
    replacedHoles.add(r.hole_id);
  });
  // TASKS.csv #2191 (review #2174) — a byte-identical re-import was told as 'replaced 216 holes' and 'extended 16': a hole whose rows equal the
  // ones it had (every field but the internal _ ones) is reported as identical, neither replaced nor extended
  if (!identical) return { rows: [...kept, ...incoming], replacedHoles: [...replacedHoles], appendedHoles: [...appendedHoles], identicalHoles: [] }; // #2799
  // #2799 — the check compares values, not strings: each hole's old and new rows (only holes with as many rows as before can be identical)
  // sorted by depth and compared field by field; a hole with two rows at the same depth falls back to the signature compare (as before)
  const keyCache = new Map();
  const keysOf = (r) => { const raw = Object.keys(r), id = raw.join("\u0002"); let e = keyCache.get(id); if (!e) { const ks = raw.filter((k) => !k.startsWith("_")).sort(); e = { ks, id: ks.join("\u0002") }; keyCache.set(id, e); } return e; };
  const sig = (r) => { const e = keysOf(r); return e.id + "\u0003" + JSON.stringify(e.ks.map((k) => r[k])); };
  const sameVal = (x, y) => x === y || (Number.isNaN(x) && Number.isNaN(y)) || (x && y && typeof x === "object" && typeof y === "object" && JSON.stringify(x) === JSON.stringify(y));
  const sameRow = (a, b) => { const ea = keysOf(a), eb = keysOf(b); if (ea.id !== eb.id) return false; for (const k of ea.ks) if (!sameVal(a[k], b[k])) return false; return true; };
  const depthKey = (r) => { const t = rowTop(r), b = rowBottom(r); return [Number.isFinite(t) ? t : -Infinity, Number.isFinite(b) ? b : -Infinity]; };
  const group = (rows, keep) => { const m = new Map(); for (const r of rows) { if (!keep.has(r.hole_id)) continue; (m.get(r.hole_id) || m.set(r.hole_id, []).get(r.hole_id)).push(r); } return m; };
  const count = (rows) => { const m = new Map(); for (const r of rows) m.set(r.hole_id, (m.get(r.hole_id) || 0) + 1); return m; };
  const oldRows = (prev || []).filter((r) => incomingHoles.has(r.hole_id) && !keepRows?.has(r)), oldN = count(oldRows), newN = count(incoming);
  const maybe = new Set([...replacedHoles, ...appendedHoles].filter((h) => oldN.get(h) && oldN.get(h) === newN.get(h)));
  const oldBy = group(oldRows, maybe), newBy = group(incoming, maybe);
  const sorted = (rows) => { const d = rows.map((r) => [depthKey(r), r]); d.sort((p, q) => p[0][0] - q[0][0] || p[0][1] - q[0][1]); let tie = false; for (let k = 1; k < d.length; k++) if (d[k][0][0] === d[k - 1][0][0] && d[k][0][1] === d[k - 1][0][1]) { tie = true; break; } return { rows: d.map((x) => x[1]), tie }; };
  const identicalHole = (h) => {
    const a = sorted(oldBy.get(h) || []), b = sorted(newBy.get(h) || []);
    if (a.rows.length !== b.rows.length || !a.rows.length) return false;
    if (a.tie || b.tie) return a.rows.map(sig).sort().join("\u0001") === b.rows.map(sig).sort().join("\u0001");
    for (let k = 0; k < a.rows.length; k++) if (!sameRow(a.rows[k], b.rows[k])) return false;
    return true;
  };
  const identicalHoles = [...replacedHoles, ...appendedHoles].filter((h) => maybe.has(h) && identicalHole(h));
  const same = new Set(identicalHoles);
  return { rows: [...kept, ...incoming], replacedHoles: [...replacedHoles].filter((h) => !same.has(h)), appendedHoles: [...appendedHoles].filter((h) => !same.has(h)), identicalHoles };
}
// TASKS.csv #1234 — a structure pick worked out in the app (with its calibration provenance, #429) is not "the earlier file" a new file
// replaces. Wraps the keep set replaceRowsByHole takes.
export const isDerivedPick = (r) => r?._src === "Core orientation calculator";
export const keepDerivedPicks = (keep) => ({ has: (r) => !!keep?.has(r) || isDerivedPick(r) });
const holeList = (hs) => `${hs.length} hole(s) (${hs.slice(0, 6).join(", ")}${hs.length > 6 ? ", …" : ""})`;
// the import notice's sentence about what happened to holes that were already loaded
export function replaceNote(res, what) {
  return (res.replacedHoles.length ? tr(" Replaced the earlier {what} of {v} — Ctrl+Z to undo.", { what, v: holeList(res.replacedHoles) }) : "")
    + (res.appendedHoles?.length ? tr(" Added below the existing {what} of {v} (the file starts at or below where they end, so it was read as an extension) — Ctrl+Z to undo.", { what, v: holeList(res.appendedHoles) }) : "")
    + (res.identicalHoles?.length ? tr(" The {what} of {v} was identical to the one already loaded: nothing changed there.", { what, v: holeList(res.identicalHoles) }) : ""); // #2191
}

// TASKS.csv #426 — one place that turns (target, headers) into a first-guess mapping. For structure
// tables the dip / dip-direction pair comes from mapLayers.guessStructureColumns, which knows that
// "DipDirection", "dip_dir", "DipDir" and "dd" are the DIRECTION and must not be taken as the dip:
// guessColumn's substring pass matched "dip" inside "DipDirection" first, so a HoleID,Depth,Type,
// DipDirection,Dip_deg file mapped DIP to the dip-direction column and left azimuth unmapped.
// TASKS.csv #2151 (WA review #2148) — collar coordinates named for their grid: MGA_East / MGA_North, GDA94_E / GDA94_N, AMG_E, GBMG_East,
// Nat_East, Local_E, with MGA_RL / Orig_RL. Three of six WA collar files were not collars (Veins / Custom, Import disabled) and these names
// miss x / y about 9,000 times each in the database. An east and a north column count only as a PAIR with the same prefix (so "Dip_E" or
// "Line_E" + "Station_N" never do); a one-letter suffix needs its underscore. -> [{ prefix, x, y, z }], map grids (MGA / GDA / AMG / UTM)
// first and local / mine grids last; z is the same grid's RL / elevation when the file has one.
// moved to gridColumns.js (#2564): one detector for collars, surface samples and outcrop structures
export { gridCoordinateColumns } from "./gridColumns.js";
// TASKS.csv #2152 — columns that name a hole's attribute, never its id; and columns that are not the hole's measured length / azimuth / dip
const HOLE_ID_VETO = /(length|depth|_len$|_m$|azi|dip|elev|type|status|parent|purpose|path|diam)/;
const NOT_HOLE_LENGTH = /(depth|dep)_(of|to)_|(^|_)(best|peak|top|base|bottom|intercept|basement|bedrock|regolith|oxide|fresh|transition)(_|$)/; // #2659
const NOT_MEASURED = /(comment|cmnts?|nominal|planned|plan_|design|target|(^|_)ref(_|$)|precollar|pre_collar|boco|tofr|water)/;
export function guessMapping(target, headers) {
  const schema = TARGET_SCHEMAS[target];
  const mapping = {};
  if (!schema) return mapping;
  schema.fields.forEach((f) => { mapping[f.key] = guessColumn(headers, f.aliases); });
  // TASKS.csv #1071 — "Hole_Length" / "Hole_Depth" matched "hole" in the substring pass and became the Hole ID
  // TASKS.csv #2152 (WA drillhole review) — and Hole_Type / Hole_Status / Parent_Hole_ID / Hole_Purpose / Hole_Diameter did too: the id is
  // guessed again among the other columns (HoleNo, Hole_Name), and left blank when none is left
  const reguess = (key, veto) => {
    if (!mapping[key] || !veto.test(normHeader(mapping[key]))) return;
    const f = schema.fields.find((x) => x.key === key);
    mapping[key] = f ? guessColumn(headers.filter((h) => !veto.test(normHeader(h))), f.aliases) : "";
  };
  reguess("hole_id", HOLE_ID_VETO);
  // #2152 — a planned, nominal, design or comment column, or the depth of a regolith boundary (pre-collar, BOCO, TOFR, water), is not the
  // hole's measured length, azimuth or dip ("depth" inside Precollar_Depth won the length; Nominal_Azimuth, Azimuth_Ref the azimuth)
  if (target === "collars" || target === "survey") for (const k of ["length", "azimuth", "dip", "depth"]) reguess(k, NOT_MEASURED);
  // TASKS.csv #2659 — the depth OF something (Depth_of_best_m, Depth_to_basement, Top_Depth) is not the hole's length: a per-hole table's
  // best-intercept depth became 'Hole length'
  if (target === "collars") reguess("length", NOT_HOLE_LENGTH);
  // TASKS.csv #2149 — the point-data Depth took FromDepth by substring ("depth" inside it) next to From = FromDepth: an interval table's
  // from / to column is never also its point depth
  if (mapping.depth && (mapping.depth === mapping.from || mapping.depth === mapping.to)) mapping.depth = "";
  if (target === "custom" && !mapping.value && spectralColumns(headers) >= 4) mapping.value = spectralMineralColumn(headers); // #2339 — the dominant mineral
  // TASKS.csv #2338 — a custom layer with From and To found is an interval table: Casing_Depth is not its point depth
  if (target === "custom" && mapping.from && mapping.to && mapping.depth) mapping.depth = "";
  // TASKS.csv #2151 — a collar file whose coordinates are named for their grid: the best grid pair, unless plain x / y names are there
  if (target === "collars") {
    const g = gridCoordinateColumns(headers)[0];
    const plain = (key) => guessColumnExact(headers, schema.fields.find((f) => f.key === key).aliases);
    if (g && !(plain("x") && plain("y"))) {
      mapping.x = g.x; mapping.y = g.y;
      if (!plain("z")) mapping.z = g.z || gridElevation(headers) || mapping.z;
    } else if (!mapping.z) mapping.z = gridElevation(headers);
  }
  // TASKS.csv #1345 (42807Z) — MAG_INSTRUMENT matched "mag" and the mag-sus log loaded 0 of 6,264 rows: a numeric layer's value is
  // never the instrument, the logger, a date or a comment
  // #2152 — nor a comment (Cmnts_Core_Recovery won Recovery % over Core_Rec_Pct), a nominal / planned / reference / original value, or a
  // regolith boundary depth
  const notAValue = (h) => /(instrument|device|logged|entered|_by$|date|comment|cmnts?|desc|model|serial|srm_name|photo|nominal|planned|(^|_)ref(_|$)|orig|precollar|pre_collar|boco|tofr|water)/.test(normHeader(h));
  if (schema.fields.some((f) => f.key === "value" && /numeric/.test(f.label)) && mapping.value && notAValue(mapping.value)) {
    const vf = schema.fields.find((f) => f.key === "value");
    mapping.value = guessColumn(headers.filter((h) => !notAValue(h)), vf.aliases);
  }
  if (target === "structure") {
    const g = guessStructureColumns(headers);
    // Only where the structure-aware guesser found something: sample_data's inferred_dip_deg /
    // assumed_dip_azimuth are exact schema aliases it doesn't know, and must keep their mapping.
    if (g.dip) mapping.dip = g.dip;
    if (g.dipDir) mapping.azimuth = g.dipDir;
    else if (mapping.azimuth && mapping.azimuth === mapping.dip) mapping.azimuth = "";
    if (g.strike) mapping.strike = g.strike;
    if (!mapping.value && g.type) mapping.value = g.type;
  }
  return mapping;
}

// TASKS.csv #600 (ARIS 40958Z) — a header as an alias would spell it: unit suffix dropped ("To (m)" -> "to",
// "Depth [m]" -> "depth"), spaces / dashes / slashes to "_" ("Mag Avg" -> "mag_avg"), "%" to "pct" ("RQD %" ->
// "rqd_pct"). Matching uses BOTH this and the plain lower-case header, so nothing that matched before stops
// matching. "To (m)" never matched: "to" is too short for the substring pass (#600 above) and "to (m)" is not "to".
export function normHeader(h) {
  return String(h ?? "").toLowerCase().trim()
    .replace(/\s*[([][^)\]]*[)\]]\s*$/, "")
    .replace(/%/g, " pct ").trim()
    .replace(/[\s\-/]+/g, "_").replace(/^_+|_+$/g, "");
}
const headerForms = (headers) => headers.map((h) => [h.toLowerCase().trim(), normHeader(h)]);
export function guessColumnExact(headers, aliases) {
  const forms = headerForms(headers);
  for (const a of aliases) { const i = forms.findIndex((f) => f[0] === a || f[1] === a); if (i >= 0) return headers[i]; }
  return "";
}

// TASKS.csv #600 — the substring pass skips aliases of one or two letters: on a real ARIS collar header file
// "y" matched "Hole tYpe" and "z" matched "Hole siZe", so Northing and Elevation were mapped to those columns.
// Short aliases (x, y, z, az, dd, md, at, rl, sg...) now match a whole header only.
export function guessColumn(headers, aliases) {
  const forms = headerForms(headers);
  for (const a of aliases) { const i = forms.findIndex((f) => f[0] === a || f[1] === a); if (i >= 0) return headers[i]; }
  for (const a of aliases) { if (a.length <= 2 || WHOLE_ONLY.has(a)) continue; const i = forms.findIndex((f) => f[0].includes(a) || f[1].includes(a)); if (i >= 0) return headers[i]; }
  return "";
}
// TASKS.csv #1345 (ARIS 42807Z) — "val" matched inside "GEO_INTERVAL_D" (inter-VAL), so an acQuire alteration log was coloured by
// each interval's length. A last-resort alias that is a fragment of common words matches a whole header only.
const WHOLE_ONLY = new Set(["val", "mto", "dto", "dfrom", "event", "boundary"]); // event / boundary: #2317 (not inside "event_depth") // mto / dto / dfrom: #2149 (fragments: "comMTOtal", "oDTOp")
export function guessTarget(headers) {
  // #600 (40958Z): the normalised forms too ("Mag Avg" -> mag_avg, "Specific Gravity" -> specific_gravity)
  const lower = [...new Set(headers.flatMap((h) => [h.toLowerCase(), normHeader(h)]))];
  const has = (s) => lower.some((h) => h.includes(s));
  // Exact-column check for the short x/y/z headers real collar exports commonly use — a plain
  // substring test on single letters would false-positive on all sorts of unrelated columns.
  const hasCol = (s) => lower.some((h) => h.trim() === s);

  // Collars: some x/y/z-ish trio and nothing that marks this as interval/point data instead.
  // Bug fix: this used to require "easting" literally, or "x" together with "northing" — real
  // exports (including the app's own sample datasets) commonly just use bare x/y/z headers,
  // which that check missed entirely, silently falling through to "custom" and forcing a manual
  // mapping every time.
  // TASKS.csv #335 — a "depth"/"total_depth" column no longer vetoes collars: it is the hole LENGTH in
  // most collar exports (total_depth is the collar schema's own length alias), and the veto sent
  // hole_id,x,y,z,azimuth,dip,total_depth to the survey rule below, which the multi-file drop then
  // auto-committed as "N survey stations" with the coordinates thrown away. A survey table has no
  // coordinate trio, so the trio itself is the discriminator. UTM_E/UTM_N/RL headers count too.
  const hasEast = has("easting") || hasCol("x") || hasCol("utm_e") || hasCol("utme") || hasCol("east");
  const hasNorth = has("northing") || hasCol("y") || hasCol("utm_n") || hasCol("utmn") || hasCol("north");
  const hasElev = has("elevation") || hasCol("z") || hasCol("rl") || hasCol("elev") || hasCol("utm_z");
  if (!has("from") && hasEast && hasNorth && hasElev) return "collars";
  // TASKS.csv #2151 — MGA_East / MGA_North / MGA_RL, GDA94_E / GDA94_N, GBMG_East / GBMG_North + Orig_RL: a grid pair and an elevation
  if (!has("from") && !has("depth_from") && gridCoordinateColumns(headers).length && (hasElev || gridElevation(headers))) return "collars";
  // Structure picks checked before survey: real bug found here — a structure CSV with columns
  // like depth_m/inferred_dip_deg/assumed_dip_azimuth satisfies the survey check below (it has
  // "azimuth", "depth", and no "from"), AND guessColumn's substring matching resolves survey's
  // dip/azimuth/depth fields against those same columns (inferred_dip_deg contains "dip", etc.) —
  // so a structure CSV used to get auto-committed as bogus downhole survey stations, silently
  // and confidently, no mapping dialog and no chance to catch it. Checking structure_type first
  // (before survey ever gets a look) fixes it at the source.
  if (has("structure_type") && !has("from")) return "structure"; // #604: with from / to it is a zone log (below)
  // TASKS.csv #426 — a downhole structure file without a literal structure_type column (HoleID, Depth,
  // Type, DipDirection, Dip_deg) used to fall through to the vein rule. Point data (depth, no from) with a
  // dip AND something only a structure table has — a type/struct column, a dip direction, strike or alpha.
  const structy = has("struct") || hasCol("type") || has("dipdir") || has("dip_dir") || has("dipdirection") || has("dip_direction") || hasCol("dd") || has("strike") || has("alpha");
  if (!has("from") && has("depth") && has("dip") && structy) return "structure";
  if (!has("from") && has("depth") && has("alpha")) return "structure"; // #427 — oriented-core alpha/beta logging
  if (has("azimuth") && (has("depth") || hasCol("dist") || hasCol("distance")) && !has("from")) return "survey"; // dist: #1105
  // TASKS.csv #546 — Micromine (HOLE, DEPTH, AZI, DIP) and Datamine (BHID, AT, BRG, DIP) survey files: a short
  // azimuth column and a depth / AT column, a dip, no from/to and nothing only a structure table has. They used to
  // open as "Structure planes" and "Custom".
  const shortAz = hasCol("azi") || hasCol("az") || hasCol("azim") || hasCol("brg") || hasCol("bearing");
  if (!has("from") && shortAz && (has("depth") || hasCol("at") || hasCol("md") || hasCol("dist") || hasCol("distance")) && has("dip") && !structy) return "survey"; // dist / distance: #1105 (Micromine HOLEID, DIST, AZIMUTH, DIP)
  // TASKS.csv #600 — interval logs from logging software, recognised by their PRIMARY column's name (the
  // header after any "Table." prefix): Alt1_Code / Alt_Assemblage, Min1_Code / Min_Code1, Vein1_Comp /
  // Vein_Type1, Ave_Reading / MagSus1, BulkDens_Calc / SG_D. They used to fall through to "litho" (a UnitCode
  // column made the mag-sus log a lithology) or "vein" (a Sample_Type column), with the value unmapped.
  const base = lower.map((h) => h.trim().split(".").pop());
  const any = (re) => base.some((h) => re.test(h));
  if ((has("from") || has("depth")) && any(/^(ave|avg)_reading$|^magsus\d*$|^mag_?sus(ceptibility)?(_si)?$|^mag_si$|^mag_reading$/)) return "magsusc"; // #605: point readings (depth) too; mag_reading: #1345
  if (has("from") && any(/^sul(ph|f)?(ide)?s?_min_?1$/)) return "mnlgy"; // #1345 — a sulphide log (SUL_MIN_1, SUL_MIN_1_PCT) was read as lithology
  if (has("from") && any(/^bulkdens|^sg(_d|_calc)?$|^specific_gravity$/)) return "sg";
  if (has("from") && any(/^min\d*_code\d*$|^min_mnlgy$/)) return "mnlgy";
  // #600 (40958Z) — a domain log ("Domain Type": waste / ore zone...) is not veins (the bare "type" rule below) nor
  // lithology: a custom layer, so the dialog asks instead of committing it into Veins.
  if (has("from") && any(/(^|_)domain(_type|_code|_name)?$/)) return "custom";
  if (has("from") && any(/^vein\d*_(comp|type|code)\d*$|^veins$/)) return "vein"; // code / veins: TASKS.csv #2153 (WAMEX Vein2_Code, "Veins")
  if (has("from") && any(/^brecc|^breccia|^brx(_|$)|^bx_(type|code)$/)) return "breccia"; // #608 (MX: brecc_lith)
  if (has("from") && any(/^alt\d*_code$|^alt_assemblage$/)) return "alt";
  // TASKS.csv #2153 (WA drillhole review) — a geology log's primary lithology column (Lithology1, Lith1, Rock1, GEOL_Rock1, LithCode, Maj Lithcode)
  // makes it a lithology log before its other columns are read: Alt1_Mineral / Min1_Type sent WAMEX geology_1 / geology_4 to Mineralization
  if (has("from") && any(/^(geol_)?(maj(or)?_)?(lith(ology)?|rock|lith_?code)\d*(_code)?\d*$/)) return "litho";
  // #2162 — a weathering / oxidation / regolith log
  if (has("from") && any(/^(weath(ering)?|oxid(ation)?|ox_?state|oxide_?zone|redox|regol(ith)?|reg)(_?(code|state|type|zone|class|unit|grade))?\d*$/)) return "weath";
  // #2153 — an alteration log named by its mineral or style (Alt1_Mineral, Alt1_Style, AltN1), not by a code
  if (has("from") && any(/^alt\d*_(mineral|min|style)$|^altn\d+$/)) return "alt";
  // #2153 — a density log read as wet and dry weights with the result in "Reading"
  if (has("from") && any(/^weight_?wet$|^wet_?weight$/) && any(/^weight_?dry$|^dry_?weight$/)) return "sg";
  // TASKS.csv #604 — a structure log by interval (GEOLFROM / GEOLTO + Struc_Code, From / To + Structure_Type): a
  // layer of structural zones. It used to fall to lithology (Copley) or, by its name, to point structure picks.
  if (has("from") && any(/^struc(t|ture)?_?(code|type)$/)) return "structzone";
  // Mineralization: was previously gated on BOTH "assemblage" AND "mineral" being present, but
  // the mnlgy schema's own value-column aliases are just ["mineral"] (see TARGET_SCHEMAS.mnlgy
  // above) — a real mnlgy CSV never has an "assemblage" column, so that combined check could
  // never actually match one, and it fell through to the generic from/to→"litho" guess instead.
  // TASKS.csv #1345 (42807Z) — oriented-core picks logged with GEOLFROM = GEOLTO (acQuire "STRUCTURE POINTS"): alpha AND beta columns, and no
  // primary interval column matched above (a vein log with Vein1_Alpha / Vein1_Beta stays veins), so STPT_MINERALIZATION no longer sends
  // 551 picks to Mineralization
  if (any(/(^|_)alpha$/) && any(/(^|_)beta$/)) return "structure";
  if (has("mineral")) return "mnlgy";
  if (has("rqd")) return "geotech";
  if (has("recovery") || has("rec_pct")) return "recovery";
  // "sg"/"density" are common enough words to false-positive against other schemas' own columns
  // (e.g. a lithology "unit" description mentioning density in free text) — checked after every
  // other from/to-interval schema's own more specific keywords above, same "least specific last"
  // ordering as the vein/alteration "type"/"assemblage" disambiguation below.
  if (has("specific_gravity") || hasCol("sg") || has("density")) return "sg";
  if (has("mag_avg") || has("mag_susc")) return "magsusc";
  if (has("litho") || has("unit")) return "litho";
  // Veins and alteration share the "assemblage" alias (both schemas list it), so a CSV that uses
  // "type"/"vein_type" rather than "assemblage" is checked first to disambiguate the common case
  // (see sample_data's own vein.csv, which uses a "type" column).
  // TASKS.csv #2150 (WA review #2148) — the bare "type" rule took a gold assay table (SAMPLETYPE, Au, AuRp1) as a vein log. A type column
  // that is the sample's, the hole's or the lab's is not a vein type, and a table with element columns is not a vein log.
  // #2189 — anywhere in the name, not only at its start: WAMEX's dsHoleType (the drilling method by interval) went to Veins
  const NOT_VEIN_TYPE = /(samp(le)?|hole|drill|dh|qc|lab|assay|analy(sis|te)|method|survey|instr(ument)?|data|record|point|row|rig|bit|core)_?type/;
  const typeCols = base.filter((h) => /type/.test(h));
  const veinishType = typeCols.some((h) => !NOT_VEIN_TYPE.test(h));
  const elements = headers.some((h) => isElementColumn(h));
  if (has("vein_type") || (veinishType && !elements && !has("assemblage"))) return "vein";
  if (has("assemblage")) return "alt";
  // #2189 — an interval table whose only 'type' is the hole's / drilling's, with nothing geological to colour by, is a custom layer
  if (has("from") && typeCols.length && !veinishType && !any(/lith|rock|unit|formation|strat/)) return "custom";
  if (has("from") && has("to")) return "litho";
  if (has("depth")) return "structure";
  return "custom";
}
// TASKS.csv #605 — what a file or worksheet NAME says it is ("Vein Log.csv", a workbook's "Specific Gravity"
// sheet). Used by guessTargetFor only when that type's required columns can be mapped from the headers;
// otherwise the header-based guess stands. Assays are recognised separately (looksLikeAssay).
const NAME_HINTS = [
  [/collar|coordinates|\bheaders?\b/, "collars"], [/survey/, "survey"], [/litholog|\blitho/, "litho"],
  [/\bweathering|\boxidation|\bregolith/, "weath"] /* #2162 */, [/alteration|\balt\b/, "alt"], [/mineral/, "mnlgy"], [/\bveins?\b(?!\s*min)/, "vein"], /* "Vein Min" is a mineral list (40958Z) */ [/breccia|\bbrx\b|\bbx\b/, "breccia"], [/geotech|\brqd\b/, "geotech"],
  [/recovery/, "recovery"], [/specific.?gravity|\bsg\b|density/, "sg"], [/mag.?sus|magnetic/, "magsusc"], [/struct\w*\s+(interval|zone)/, "structzone"] /* #604 */, [/struct/, "structure"],
];
export function targetFromName(name) {
  const base = String(name || "").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[_]+/g, " ");
  for (const [re, t] of NAME_HINTS) if (re.test(base)) return t;
  return null;
}
export function schemaSatisfied(target, mapping) {
  const schema = TARGET_SCHEMAS[target];
  if (!schema) return false;
  if (schema.fields.some((f) => f.required && !mapping[f.key])) return false;
  return !schema.oneOf || schema.oneOf.some((keys) => keys.every((k) => mapping[k]));
}
// Logs with no built-in layer, named for what they hold: ask, as a custom layer. #600 (40958Z): a void / cavity log is not veins (its bare
// "Type" column hit the vein rule); #1345: a UV fluorescence log is not lithology; #1502 (40958Z): Oxidation, Silicification and
// OriCore (the core-orientation marks) were all guessed as Lithology from a generic code / description column.
// TASKS.csv #3204 (#3195, Galore Creek) — geotechnical test tables (lock angles, pocket penetrometer, point load, UCS) and an overburden log went to
// Lithology / Structure planes / Veins / SG by a stray 'LITH' / 'Structure' / 'Test Type' column: a custom layer, asked
const CUSTOM_LOG_NAMES = /\b(voids?|cavit(y|ies))\b|fluoresc|silicif|\bori(ented)?[\s_-]*core\b|\boricore\b|lock[\s_-]*angles?|penetrometer|point[\s_-]*load|(^|[^a-z])ucs([^a-z]|$)|overburden/i; // oxidation / weathering: their own layer since #2162
// TASKS.csv #2339 (review #2325, WA uranium) — a hyperspectral (HyLogger TSA) table: mineral / weight pairs and absorption-feature
// parameters (TSA_S Mineral1, TSA_S Weight1, w2200, d2200, hqd2200, kaol_cryst, FeOx ...). geophysics_1.csv (34 columns, one U3O8_ppm
// among them) went to the assay import as 5,394 U results, double-counting the lab's. -> the number of spectral columns
const SPECTRAL_COL = /(^|[\s_])tsa([\s_]|$)|mineral[\s_]*\d|weight[\s_]*\d|^[wd]\d{3,4}$|hqd|kaol|feox|swir|vnir/i;
export const spectralColumns = (headers) => (headers || []).filter((h) => SPECTRAL_COL.test(String(h).trim())).length;
// the mineral column of a spectral table: the first Mineral1 (TSA_S before TSA_V by header order)
export const spectralMineralColumn = (headers) => (headers || []).find((h) => /mineral[\s_]*1$/i.test(String(h).trim())) || "";
// rows (optional, TASKS.csv #2884): the file's rows, for the zero-length test below
// #3204 — a type column with the orientation of each pick (alpha and beta, or dip with dip direction / strike): structure planes, whatever else is numeric
function structurePicks(headers) {
  const m = guessMapping("structure", headers);
  return !!(m.value && ((m.alpha && m.beta) || (m.dip && (m.azimuth || m.strike))));
}
// TASKS.csv #3210 (#3195, Galore Creek) — a numeric kind is never guessed from a value column of words: an overburden log went to Specific gravity
// by its 'Relative Density (for non cohesive soils)' column ('Very Dense', 'N/A') and loaded 0 of 374 rows. With the rows at hand, a numeric
// guess whose value column holds more words than numbers (first 200 filled cells) becomes a custom layer, which asks for its value.
const NUMERIC_KINDS = new Set(["sg", "magsusc", "geotech", "recovery"]);
export function valueColumnIsWords(target, headers, rows) {
  if (!NUMERIC_KINDS.has(target) || !rows?.length) return false;
  const col = guessMapping(target, headers).value;
  if (!col) return false;
  let num = 0, word = 0;
  for (let i = 0; i < rows.length && num + word < 200; i++) {
    const s = String(rows[i]?.[col] ?? "").trim();
    if (!s) continue;
    if (Number.isFinite(Number(s.replace(/^[<>]\s*/, "")))) num++; else word++;
  }
  return word > num;
}
// TASKS.csv #3665 (Matt: 'C now, B later') — a file named for specific gravity whose From equals To on every row is a table of point density readings. It stays a Custom layer (a zero-length density reading cannot be
// length-weighted, so the density summary and the tonnage would leave it out) and the import dialog says so, and what to do. -> true when that is why a file named for density was guessed Custom
export function pointDensityFile(headers, name, rows) {
  if (!rows?.length || targetFromName(name) !== "sg" || CUSTOM_LOG_NAMES.test(String(name || ""))) return false;
  return zeroLengthRows(headers, rows) === true && schemaSatisfied("sg", guessMapping("sg", headers)) && guessTargetFor(headers, name, rows) === "custom";
}
export function guessTargetFor(headers, name, rows = null) {
  const t = guessTargetForRaw(headers, name, rows);
  return valueColumnIsWords(t, headers, rows) ? "custom" : t; // #3210
}
function guessTargetForRaw(headers, name, rows) {
  if (CUSTOM_LOG_NAMES.test(String(name || ""))) return "custom";
  // #2884 (review #2876, WA iron) — From equals To on every sampled row and a log channel is named (Density_Best, Gamma_Best ...): point
  // readings, a downhole log, before any name hint ("density.csv" would keep Specific gravity: millions of zero-length intervals)
  // TASKS.csv #3204 (#3195, Galore Creek) — not a table of oriented structure picks: Point Structures (GEOLFROM = GEOLTO; PTSTR_STR_TYPE, PTSTR_ALPHA,
  // PTSTR_BETA) has numbers in every row too, and went to Custom layer while the same columns of Fault Structures were read as Structure planes
  // TASKS.csv #3245 — a file NAMED for magnetic susceptibility ('Mag Sus.csv') whose From equals To on every row is a table of point readings, which is what the Mag susc layer holds: it keeps that layer (it was opened as
  // a Custom layer, as 'Specific Gravity.csv' with From = To still is: a zero-length density interval has no length to weight, and the tonnage tools leave it out). A downhole log's channel names (Density_Best ...) are not this.
  const pointMagSus = targetFromName(name) === "magsusc" && schemaSatisfied("magsusc", guessMapping("magsusc", headers)) && !(headers || []).some((h) => /_best$/i.test(String(h).trim()));
  if (rows && !pointMagSus && zeroLengthRows(headers, rows) === true && looksLikeLogTable(headers, rows) && !structurePicks(headers)) return "custom";
  if (spectralColumns(headers) >= 4) return "custom"; // #2339 — a mineral table from spectra, not Mineralization (ore minerals)
  // TASKS.csv #2317 — regolith boundary events (BOCO, TOFR, ... at one depth per hole, no from / to): a custom point layer of codes, not
  // structure picks without an orientation (where 'Event_Code + Depth' used to land)
  if (looksLikeEventTable(headers)) return "custom";
  const hint = targetFromName(name);
  if (hint) {
    const m = guessMapping(hint, headers);
    if (schemaSatisfied(hint, m)) return hint;
    // TASKS.csv #1502 — the name is the stronger hint: a file shaped like the named layer (its hole and depth columns found) whose value
    // column has a name GeoStrix does not know keeps that layer, and the dialog asks for the column (never committed unseen: the value
    // is missing). Mineralization.csv with only a Description column went to Lithology, whose aliases include "description".
    // A "structure" name on a file with a To column is an interval log (structural zones, #604: Copley's GEOLFROM / GEOLTO): the headers decide.
    const interval = hint === "structure" && guessMapping("structzone", headers).to;
    if (!interval && TARGET_SCHEMAS[hint]?.fields.every((f) => !f.required || f.key === "value" || m[f.key])) return hint;
  }
  if (looksLikeLogTable(headers, rows)) return "custom"; // TASKS.csv #2160 — a gamma / density / susceptibility log, not SG or Lithology (after the name hint)
  return guessTarget(headers);
}
export function getCol(row, keys) {
  for (const k of keys) { const found = Object.keys(row).find((rk) => rk.toLowerCase().trim() === k); if (found && row[found] !== undefined && row[found] !== "") return row[found]; }
  return undefined;
}

// TASKS.csv #283 (Micromine-specialist review) — collar import used to be a bare
// `new Map([...collars, ...rows].map(c => [c.hole_id, c]))`: last-write-wins keyed on hole_id, with
// no diff and no confirmation, both for duplicates WITHIN one file and for a hole_id that already
// existed in the project. The dangerous real-world case isn't the deliberate re-import of an updated
// surveyor list — it's grabbing an OLD collar file from the wrong folder, after which every matching
// hole silently takes on stale x/y/z/azimuth/dip and the previous values are simply gone. dataQC.js
// flags repeated hole_ids, but only as a generic warning that doesn't run on import and never says
// whether the COORDINATES actually changed.
//
// This is the pure diff the importer now runs first, so it can say exactly what would change (and ask)
// before anything is committed. Kept here in layers.js beside the other import helpers
// (guessColumn/guessTarget/TARGET_SCHEMAS) and free of any React/state so it can be unit-verified in
// plain Node.
const COLLAR_COMPARE_FIELDS = ["x", "y", "z", "azimuth", "dip", "length"];

// "Same value" for a collar field. Both missing counts as same (an import that simply doesn't carry
// an optional azimuth column must not read as "azimuth changed"), and numbers compare with a small
// tolerance so a re-export that round-trips 520000.5 through more decimal places isn't reported as an
// edit. NaN (an unparseable cell) is treated as missing for the same reason.
function sameCollarValue(a, b) {
  const ma = a == null || (typeof a === "number" && Number.isNaN(a));
  const mb = b == null || (typeof b === "number" && Number.isNaN(b));
  if (ma && mb) return true;
  if (ma || mb) return false;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
  return String(a) === String(b);
}

// existing/incoming: arrays of collar objects ({hole_id, x, y, z, azimuth?, dip?, length?}).
// Returns { newHoles, unchanged, changed:[{hole_id, fields, before, after, shift}], duplicatesInFile }
// where `shift` is the horizontal+vertical distance the collar would move (world units), which is the
// number that actually matters to a geologist looking at this prompt.
// TASKS.csv #600 — a value only one side has is not a conflict: collars often come in two files (a BC ARIS
// export: "Coordinates" with x / y / z, then "Headers" with the same x / y / z plus the actual depth and the
// planned azimuth / dip). The second file used to count every hole as CHANGED (length: missing -> 452), asked
// to overwrite all 19, and declining dropped the depths; importing them the other way round "changed" the
// depth to missing, and accepting wiped it. Now: incoming missing -> keep the existing value; existing missing
// -> a FILL (merged without asking); only two different present values are a change. mergeCollar applies it.
const missingCollarValue = (v) => v == null || v === "" || (typeof v === "number" && Number.isNaN(v));
export function mergeCollar(prev, incoming, overwrite) {
  const out = { ...prev };
  for (const [k, v] of Object.entries(incoming)) {
    if (missingCollarValue(v)) continue;
    if (k === "attrs" && v && typeof v === "object") { out.attrs = mergeCollar(prev.attrs || {}, v, overwrite); continue; } // #1655 — kept columns merge one by one too
    if (overwrite || missingCollarValue(prev[k])) out[k] = v;
  }
  return out;
}
// TASKS.csv #600 — a collar table can hold SEVERAL location records per hole with a rank (an MX Deposit
// "Collar Locations" export: rank 0 the current location, higher ranks older/alternative fixes — the
// 42648Z file has 691 rows for 544 holes, DH24-119 seven times, one of them with a 118.9 m depth for a 700 m
// hole). "Last row wins" kept whichever came last. When the file has a rank column, the LOWEST numeric rank
// wins (ties: the later row); with no rank column nothing changes here. Raw rows in, raw rows out (first-
// appearance order); { rows, rankColumn, dropped, holes } for the notice.
const RANK_ALIASES = ["rank", "loc_rank", "location_rank", "collar_rank", "priority"];
export function pickRankedCollarRows(rawRows, holeCol, headers) {
  const rankColumn = guessColumnExact(headers || [], RANK_ALIASES);
  if (!rankColumn || !holeCol) return { rows: rawRows, rankColumn: null, dropped: 0, holes: [] };
  const best = new Map(), order = [];
  const rankOf = (r) => { const v = num(r[rankColumn]); return Number.isFinite(v) ? v : Infinity; };
  for (const r of rawRows) {
    const id = String(r[holeCol] ?? "").trim();
    const prev = best.get(id);
    if (!prev) { best.set(id, r); order.push(id); continue; }
    if (rankOf(r) <= rankOf(prev)) best.set(id, r);
  }
  const counts = new Map(); rawRows.forEach((r) => { const id = String(r[holeCol] ?? "").trim(); counts.set(id, (counts.get(id) || 0) + 1); });
  return { rows: order.map((id) => best.get(id)), rankColumn, dropped: rawRows.length - order.length, holes: [...counts].filter(([, n]) => n > 1).map(([id]) => id) };
}

// TASKS.csv #1655 (review #1645, Copley) — the other fields a collar carries (an import's extra fields, the kept columns in attrs) are
// compared too: re-importing 9 collars with PROSPECT / Drill_Purpose / STARTDATE added said '9 already present and identical' though
// all three were then on every collar. -> [[label, before, after]] for each field either side has
const collarExtraValues = (c) => {
  const out = new Map();
  for (const [k, v] of Object.entries(c || {})) if (k !== "hole_id" && k !== "attrs" && !k.startsWith("_") && !COLLAR_COMPARE_FIELDS.includes(k)) out.set(k, v);
  for (const [k, v] of Object.entries(c?.attrs || {})) if (!out.has(k)) out.set(k, v);
  return out;
};
function extraFieldsDiff(prev, r) {
  const a = collarExtraValues(prev), b = collarExtraValues(r), fills = [], fields = [];
  for (const [k, v] of b) { if (missingCollarValue(v)) continue; const p = a.get(k); if (missingCollarValue(p)) fills.push(k); else if (!sameCollarValue(p, v)) fields.push(k); }
  return { fills, fields, before: Object.fromEntries(fields.map((k) => [k, a.get(k)])), after: Object.fromEntries(fields.map((k) => [k, b.get(k)])) };
}

export function diffCollarImport(existing, incoming) {
  const byId = new Map((existing || []).map((c) => [c.hole_id, c]));
  const newHoles = [], unchanged = [], changed = [], duplicatesInFile = [], filled = [];
  // #600: a repeated hole is reported as a duplicate and judged ONCE, on its last row (the one the merge keeps)
  const lastById = new Map();
  for (const r of incoming || []) { if (lastById.has(r.hole_id)) duplicatesInFile.push(r.hole_id); lastById.set(r.hole_id, r); }
  for (const r of lastById.values()) {
    const prev = byId.get(r.hole_id);
    if (!prev) { newHoles.push(r.hole_id); continue; }
    const ex = extraFieldsDiff(prev, r); // #1655
    const fills = [...COLLAR_COMPARE_FIELDS.filter((k) => missingCollarValue(prev[k]) && !missingCollarValue(r[k])), ...ex.fills];
    if (fills.length) filled.push({ hole_id: r.hole_id, fields: fills });
    const fields = [...COLLAR_COMPARE_FIELDS.filter((k) => !missingCollarValue(prev[k]) && !missingCollarValue(r[k]) && !sameCollarValue(prev[k], r[k])), ...ex.fields];
    if (!fields.length) { if (!fills.length) unchanged.push(r.hole_id); continue; }
    const d = (k) => (Number.isFinite(prev[k]) && Number.isFinite(r[k]) ? r[k] - prev[k] : 0);
    changed.push({
      hole_id: r.hole_id, fields,
      before: { ...Object.fromEntries(fields.filter((k) => COLLAR_COMPARE_FIELDS.includes(k)).map((k) => [k, prev[k]])), ...ex.before },
      after: { ...Object.fromEntries(fields.filter((k) => COLLAR_COMPARE_FIELDS.includes(k)).map((k) => [k, r[k]])), ...ex.after },
      shift: Math.hypot(d("x"), d("y"), d("z")),
    });
  }
  return { newHoles, unchanged, changed, duplicatesInFile, filled };
}
