// TASKS.csv #448 — the project file's fields, in ONE table. store.jsx used to hand-copy the field list into
// ~9 places (save bundle, load, New, autosave x2, undo snapshot, undo restore, the unsaved-change watcher and
// five useCallback dependency arrays); fields fell out of some of them (#343 New kept 7 fields of the old
// project, #462 edits outside undo were never marked unsaved). Everything below is generated from FIELDS, and
// it is plain JS so test/projectFields.test.mjs can exercise save -> load -> New without React.
//
// Each field:
//   empty()        value for a New project, and the fallback when an older file lacks the key
//   track          "undo"  — undoable, and marks the project unsaved (reference-compared on every change)
//                  "dirty" — not undoable (large: models, rasters...) but still marks the project unsaved
//                  "view"  — saved for convenience; changing it is not an edit (camera, legend styling...)
//   save(v)        optional: compact form written to the file / autosave
//   load(data)     optional: read the value from a payload (default: data[key] || empty())
import { f32ToB64, b64ToF32 } from "./inversion.js";
import { bytesToB64, b64ToBytes } from "./base64.js"; // TASKS.csv #1114

// TASKS.csv #796 — a High / Very high detail terrain (up to 1025 x 1025 nodes) as JSON numbers is ~10 MB of text;
// as Float32 base64 it is 5.6 MB and exact to Float32 (~0.1 mm at 1,000 m). Grids up to the Standard 200 x 200 keep
// the plain array, so those files stay as they were.
const TERRAIN_COMPACT_MIN = 201 * 201;
export function compactTerrain(t) {
  if (!t || !t.elevations || t.elevations.length < TERRAIN_COMPACT_MIN) return t;
  const { elevations, ...rest } = t;
  return { ...rest, elevationsF32: f32ToB64(elevations) };
}
export function expandTerrain(t) {
  if (!t || !t.elevationsF32) return t ?? null;
  const { elevationsF32, ...rest } = t;
  return { ...rest, elevations: Array.from(b64ToF32(elevationsF32)) };
}
import { compactLayers, expandLayers } from "./compactRows.js"; // TASKS.csv #374
import { compactTable, expandTable, compactIntervalLayers, expandIntervalLayers } from "./compactTable.js"; // TASKS.csv #555
import { compactSurfaces, expandSurfaces } from "./compactSurfaces.js"; // TASKS.csv #483
import { DEFAULT_DESURVEY_METHOD, normalizeDesurveyMethod } from "./desurvey.js";

// v6 adds terrain + layerGroups (TASKS.csv #77/#81 SRTM terrain, #76 named layer groups) — v5 and
// older files still open fine, terrain falls back to null (no terrain surface) and layerGroups to [].
// v7 (TASKS.csv #514) — the format changed several times while still writing 6, so an older GeoStrix opened
// newer files with no warning (#342's guard compares this number) and silently dropped or misread data:
// compact point-survey layers (#374), compact voxel models (#321), compact generated surfaces (#483), and new
// fields (lithoGroups #176, geophysSurveys #451, crmCertificates #400, mapLayers #316, surfaceStructures
// #317, fieldStructuralRefs, dcipLines #322...). Older files still open here unchanged.
// RULE: any change to FIELDS (a key added / removed, or a field's save/load encoding) bumps this number —
// test/projectFields.test.mjs freezes the format fingerprint and fails until it is bumped.
// v8 (TASKS.csv #599) adds modellingCodes (per-interval modelling codes, the code list, correlation ties).
// v9 (TASKS.csv #503) adds alterationBoxes (the user's least-altered box limits + litho code -> protolith map).
// v10 (TASKS.csv #555) stores assays and interval layers of 2,000+ rows as exact columns (compactTable.js).
// v12 (TASKS.csv #650) adds structuralTrends (named trends + which trend each model uses).
// v13 (TASKS.csv #660) compacts estimated / geoML / imported voxel models too (compactCells.keys names the columns).
// v14 (TASKS.csv #796) stores a terrain bigger than the Standard 200 x 200 as Float32 base64 (terrain.elevationsF32).
// v15 (TASKS.csv #811) adds explicitSurfaces (hand-picked surfaces: picks + settings; the mesh is a generated surface).
// v16 (TASKS.csv #841) adds geochemThresholds (the anomaly threshold rule chosen per surface element, with its values).
// v17 (TASKS.csv #842) adds surfaceQc (QC records of surface programs: lab checks and program inserts, certificates,
// and the program's QC settings).
// v18 (TASKS.csv #1003) adds evidenceOverlay (the Evidence overlay pane's recipe: evidence sources and memberships, operator,
// training points; values are recomputed from the sources), so a targeting score can be re-run and audited after reopening.
export const PROJECT_VERSION = 20; // #1081: no dbConnections (per computer now). Was 19 // #1073: surface samples may be stored as exact columns. Was 18 // #1003: evidenceOverlay. Was 17 // #842: surfaceQc. Was 16 // #841: geochemThresholds. Was 15 // #811: explicitSurfaces. Was 14 // #796: big terrain grids as elevationsF32. Was 13 // #660: every voxel model may be compacted (compactCells.keys). Was 12 // #650: structuralTrends. Was 11 // #630: sectionImages. Was 10 // #555: assays and big interval layers may be stored as exact columns ({ __compactTable })

export const EMPTY_LAYERS = { litho: [], alt: [], vein: [], geotech: [], mnlgy: [], magsusc: [], structure: [], litho_gc: [], alt_gc: [], geophys_pts: [] };

// TASKS.csv #68 — the Layout page's starter elements (a new project's single page). Page content lives in the
// store, not in LayoutModule's own state: LayoutModule unmounts on every tab trip (including the one its own
// "Add viewport"/"Refresh" force), which used to reset a real layout to this starter set.
export const DEFAULT_LAYOUT_ELEMENTS = [
  { id: "title", type: "title", x: 40, y: 30, text: "Untitled Section", w: 400 },
  { id: "north", type: "north", x: 1000, y: 40 },
  { id: "scale", type: "scale", x: 40, y: 720, meters: 100 },
  { id: "legend", type: "legend", x: 900, y: 500, items: [["Lithology", "#c98a5a"], ["Alteration", "#4a6b4a"], ["Fault", "#c0392b"]] },
];

// TASKS.csv #321 (database review) — a SimPEG model can hold tens of thousands of cells, and voxel models
// are written into every save AND every 60 s autosave. As cell objects ({x,y,z,dx,dy,dz,value,support})
// that is ~70-100 bytes of JSON per cell; as Float32 base64 columns it is ~4 bytes per value. The compact form
// is cached per model object, so the repeated snapshot/dirty-check calls re-encode nothing.
// TASKS.csv #660 — every source now, not only "simpeg": estimated and geoML block models (up to millions of cells)
// were written raw, 98-132 MB and 2-6.5 s of frozen UI per autosave at 1M blocks. A model is compacted when every
// cell has the same keys and each key is a number in every cell (a Float32 column) or a string in every cell (a
// dictionary + index column, e.g. the support class); anything else is saved as it was. `keys` lists the columns
// (a file without it is a v12-or-older simpeg model: COMPACT_KEYS).
const COMPACT_KEYS = ["x", "y", "z", "dx", "dy", "dz", "value", "support"];
// #660 — the modelled value itself is kept exact (Float64): Float32 brought a 0.7 g/t block back as 0.699999988 and
// every later export would print that. Geometry and the support figures stay Float32.
const f64ToB64 = (arr) => bytesToB64(new Uint8Array(new Float64Array(arr).buffer));
const b64ToF64 = (b64) => new Float64Array(b64ToBytes(b64).buffer); // base64.js: #1114
const compactCache = new WeakMap();
function cellColumns(cells) {
  const keys = cells.length ? Object.keys(cells[0]) : null;
  if (!keys || !keys.length) return null;
  const kind = {};
  for (const k of keys) kind[k] = typeof cells[0][k] === "number" ? "n" : typeof cells[0][k] === "string" ? "s" : null;
  if (keys.some((k) => !kind[k])) return null;
  for (let i = 1; i < cells.length; i++) {
    const c = cells[i];
    let n = 0;
    for (const k in c) { n++; if (kind[k] === undefined || (kind[k] === "n" ? typeof c[k] !== "number" : typeof c[k] !== "string")) return null; }
    if (n !== keys.length) return null;
  }
  return { keys, kind };
}
export function compactVoxelModels(list) {
  return (list || []).map((m) => {
    if (!Array.isArray(m.cells) || !m.cells.length) return m;
    let c = compactCache.get(m);
    if (!c) {
      const { cells, ...rest } = m;
      const shape = cellColumns(cells);
      if (!shape) { compactCache.set(m, m); return m; }
      const cols = {};
      shape.keys.forEach((k) => {
        if (shape.kind[k] === "s") {
          const dict = [], at = new Map();
          const idx = cells.map((cell) => { let v = at.get(cell[k]); if (v === undefined) { v = dict.length; dict.push(cell[k]); at.set(cell[k], v); } return v; });
          cols[k] = { dict, b64: f32ToB64(idx) };
          return;
        }
        // Coordinates as offsets from the first cell: Float32 would lose ~0.5 m at UTM northings (~6.2e6).
        // TASKS.csv #985 — every column but `value` is Float32: exact for sizes, counts and support up to 2^24 (16.7 M).
        // A future integer column that can exceed that (a database block id) must be f64 like `value`, or it rounds silently.
        const base = k === "x" || k === "y" || k === "z" ? cells[0][k] : 0;
        cols[k] = k === "value"
          ? { base: 0, f64: true, b64: f64ToB64(cells.map((cell) => cell[k])) }
          : { base, b64: f32ToB64(cells.map((cell) => cell[k] - base)) };
      });
      c = { ...rest, compactCells: { n: cells.length, keys: shape.keys, cols } };
      compactCache.set(m, c);
    }
    return c;
  });
}
export function expandVoxelModels(list) {
  return (list || []).map((m) => {
    if (!m.compactCells) return m;
    const { compactCells, ...rest } = m;
    const keys = compactCells.keys || COMPACT_KEYS;
    const get = {};
    keys.forEach((k) => {
      const c = compactCells.cols[k]; const arr = c.f64 ? b64ToF64(c.b64) : b64ToF32(c.b64);
      get[k] = c.dict ? (i) => c.dict[arr[i]] : (i) => arr[i] + c.base;
    });
    const cells = Array.from({ length: compactCells.n }, (_, i) => {
      const cell = {};
      keys.forEach((k) => { cell[k] = get[k](i); });
      return cell;
    });
    return { ...rest, cells };
  });
}

const newPageId = () => `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const list = () => [];
const map = () => ({});

// Order is the order keys are written to the file (cosmetic only).
export const FIELDS = [
  // `project` holds name / EPSG / desurvey method (#135: a project setting, so it travels with the file). Its
  // name comes from the file name when there is one (#199), so load() takes the display name too. Its own
  // edits mark the project unsaved through extraDirtyValues (EPSG and desurvey method only — a rename is not).
  { key: "project", track: "view",
    // TASKS.csv #615 — crsSet: did the USER choose the CRS? A new project still carries a number (97 call sites read
    // project.epsg), but 3156 is only a placeholder until crsSet: the status bar says "CRS not set" and imports /
    // online fetches ask. A file saved before #615 counts as chosen unless it holds the old silent default.
    empty: () => ({ name: "Untitled project", epsg: 3156, crsSet: false, desurveyMethod: DEFAULT_DESURVEY_METHOD }), // 3156 = NAD83 UTM 9N (placeholder)
    load: (data, name) => {
      const p = data.project || { epsg: 3156 };
      return { ...p, crsSet: p.crsSet ?? (p.epsg != null && Number(p.epsg) !== 3156), name: name || p.name || "Untitled project" };
    } },
  { key: "collars", track: "undo", empty: list },
  { key: "survey", track: "undo", empty: list },
  { key: "layers", track: "undo", empty: () => ({ ...EMPTY_LAYERS }),
    save: (l) => compactIntervalLayers(compactLayers(l)), load: (data) => ({ ...EMPTY_LAYERS, ...(expandIntervalLayers(expandLayers(data.layers)) || {}) }) }, // #374 point surveys (Float32); #555 big interval layers (exact columns)
  { key: "assays", track: "undo", empty: list, save: compactTable, load: (data) => expandTable(data.assays) || [] }, // #555 — exact columns from 2,000 rows
  { key: "assayElements", track: "undo", empty: list },
  { key: "customLayers", track: "undo", empty: list },
  // Older project files (version < 2) won't have this — null, and ViewerModule falls back to its defaults.
  { key: "viewerUiState", track: "view", empty: () => null },
  { key: "themes", track: "dirty", empty: list },
  // TASKS.csv #220 — rasters/terrain are not undo-tracked: large enough that keeping them in the undo
  // snapshot cost ~49 ms per compare with one 4 MB raster. #462: they still mark the project unsaved.
  { key: "rasters", track: "dirty", empty: list },
  { key: "boundaries", track: "undo", empty: list },
  { key: "mapLayers", track: "dirty", empty: list }, // TASKS.csv #316
  { key: "sectionImages", track: "dirty", empty: list }, // TASKS.csv #630 — georeferenced vertical (cross-section) images
  { key: "surfaceStructures", track: "dirty", empty: list }, // TASKS.csv #317
  { key: "fieldStructuralRefs", track: "dirty", empty: list },
  { key: "lithoGroups", track: "dirty", empty: list }, // TASKS.csv #176 — a grouping belongs to the project it was built for
  { key: "geophysSurveys", track: "dirty", empty: map }, // TASKS.csv #451 — older files: every survey unlabelled
  { key: "crmCertificates", track: "dirty", empty: map }, // TASKS.csv #400
  { key: "dcipLines", track: "dirty", empty: list },
  // TASKS.csv #599 — per-interval modelling codes + the code list (role, pile order) + correlation ties.
  // Undo-tracked: assigning and connecting intervals are hand edits, small, and easy to get wrong.
  // TASKS.csv #503 — the AI / CCPI least-altered boxes per protolith (provisional defaults until edited) and
  // the logged-code -> protolith map; null = never edited (the app then uses the provisional defaults).
  { key: "alterationBoxes", track: "dirty", empty: () => null, load: (data) => data.alterationBoxes ?? null },
  { key: "modellingCodes", track: "undo", empty: () => ({ codes: [], assign: {}, ties: [] }),
    load: (data) => ({ codes: [], assign: {}, ties: [], ...(data.modellingCodes || {}) }) }, // TASKS.csv #322 — DC/IP line data (+ last section) kept with the project
  // TASKS.csv #650 — named structural trends ({ id, name, dip, dipAzimuth, pitch, ratios }, lib/trend.js) and which one
  // each model uses: use = { implicit, alteration, gradeShell, estimation, geoml } -> trend id | undefined (none)
  { key: "structuralTrends", track: "undo", empty: () => ({ trends: [], use: {} }),
    load: (data) => ({ trends: [], use: {}, ...(data.structuralTrends || {}) }) },
  // TASKS.csv #811 — explicit surfaces: [{ id, name, color, picks: [{ id, x, y, z, hole_id?, md?, src }], margin, resolution,
  // cutAtTerrain, surfaceId }] (world coordinates). The mesh itself is a generated surface (surfaceId), saved with those.
  { key: "explicitSurfaces", track: "undo", empty: list },
  { key: "omfObjects", track: "undo", empty: list },
  { key: "terrain", track: "dirty", empty: () => null, save: compactTerrain, load: (data) => expandTerrain(data.terrain) }, // TASKS.csv #796
  // Geophysics point-cloud legend (pre-#122 files have none): display preferences.
  { key: "geophysPtsStops", track: "view", empty: list },
  { key: "geophysPtsColorMode", track: "view", empty: () => "continuous" },
  { key: "geophysPtsMin", track: "view", empty: () => null, load: (data) => data.geophysPtsMin ?? null },
  { key: "geophysPtsMax", track: "view", empty: () => null, load: (data) => data.geophysPtsMax ?? null },
  { key: "voxelModels", track: "dirty", empty: list,
    save: compactVoxelModels, load: (data) => expandVoxelModels(data.voxelModels || []) }, // TASKS.csv #321 — SimPEG models stored compact
  { key: "layerGroups", track: "undo", empty: list },
  // TASKS.csv #69 — multi-page layout. Files saved before #69 only had one flat `layoutElements` array: it is
  // wrapped as "Page 1" rather than lost. New starts with a single fresh page (not just the active page
  // cleared, which would leave the old project's other pages behind). #463: undo tracks the whole pages list.
  { key: "layoutPages", track: "undo",
    empty: () => [{ id: newPageId(), name: "Page 1", elements: DEFAULT_LAYOUT_ELEMENTS }],
    load: (data) => (data.layoutPages && data.layoutPages.length ? data.layoutPages : [{ id: newPageId(), name: "Page 1", elements: data.layoutElements || DEFAULT_LAYOUT_ELEMENTS }]) },
  // Which page is showing: navigation, not an edit. Resolved against the pages actually loaded (see below).
  { key: "activeLayoutPageId", track: "view", empty: () => null },
  // Saved connection profiles — host/db/user only; DatabaseConnectModal strips the password before storing.
  // (dbConnections left the project file in TASKS.csv #1081: connection profiles are per computer, lib/dbProfiles.js)
  { key: "excludedIntercepts", track: "undo", empty: list },
  { key: "softIntercepts", track: "undo", empty: list },
  { key: "interceptSets", track: "undo", empty: list }, // TASKS.csv #52 (c)
  { key: "sections", track: "undo", empty: list },
  { key: "sectionGroups", track: "undo", empty: list },
  // Saved layout templates round-trip through the project file like themes, so New resets them too.
  { key: "layoutTemplates", track: "dirty", empty: list },
  { key: "plannedHoles", track: "undo", empty: list }, // TASKS.csv #188
  // TASKS.csv #1073 (review #1016) — exact columns from 2,000 rows, like assays: 50k samples x 48 elements were 29 MB and
  // 1.8 s of JSON.stringify per autosave as one object per sample; columns are ~14 MB and cached per array
  { key: "surfaceSamples", track: "undo", empty: list, save: compactTable, load: (data) => expandTable(data.surfaceSamples) || [] }, // TASKS.csv #228
  { key: "surfaceElements", track: "undo", empty: list },
  { key: "geochemThresholds", track: "undo", empty: list }, // TASKS.csv #841
  { key: "surfaceQc", track: "undo", empty: () => null }, // TASKS.csv #842 — { records, certificates, settings } or null
  { key: "evidenceOverlay", track: "dirty", empty: () => null }, // TASKS.csv #1003 — { layers, operator, gamma, training } or null
  { key: "generatedSurfaces", track: "dirty", empty: list, // TASKS.csv #52
    save: compactSurfaces, load: (data) => expandSurfaces(data.generatedSurfaces || []) }, // #483 — large meshes stored compact
  { key: "modelDomains", track: "dirty", empty: list },
];

export const FIELD_KEYS = FIELDS.map((f) => f.key);
export const UNDO_KEYS = FIELDS.filter((f) => f.track === "undo").map((f) => f.key);
export const DIRTY_KEYS = FIELDS.filter((f) => f.track === "dirty").map((f) => f.key);

// The active page must be one of the pages actually present; otherwise the first.
const resolveActivePage = (pages, wanted) => (wanted && pages.some((p) => p.id === wanted) ? wanted : pages[0]?.id ?? null);

// Values for a brand-new project.
export function emptyFields() {
  const out = {};
  for (const f of FIELDS) out[f.key] = f.empty();
  out.activeLayoutPageId = resolveActivePage(out.layoutPages, null);
  return out;
}

// Live values from a saved / autosaved / stashed-tab payload. `name` (optional) is the real file or tab name.
// TASKS.csv #1262 — a stored value of the wrong shape (collars: {}, assayElements: 5, a string where a list belongs) is dropped
// for the field's empty value, and its key is pushed to `dropped`, instead of reaching every consumer as "x.find is not a
// function" on first render. checkProjectFile (#342) only looks at which keys exist. A compact table (#555) stands for a list.
export function fieldShapeOk(value, empty) {
  if (value == null) return true; // absent: the empty value is used anyway
  if (Array.isArray(empty)) return Array.isArray(value) || (typeof value === "object" && !!value.__compactTable);
  if (empty && typeof empty === "object") return typeof value === "object" && !Array.isArray(value);
  if (empty == null) return true; // an optional field (terrain, a number range...): its own load() guards it
  return typeof empty === typeof value;
}
export function fieldsFromPayload(data, name, dropped = []) {
  const out = {};
  for (const f of FIELDS) {
    const raw = data[f.key];
    if (!fieldShapeOk(raw, f.empty())) { dropped.push(f.key); out[f.key] = f.empty(); continue; }
    out[f.key] = f.load ? f.load(data, name) : raw || f.empty();
  }
  out.activeLayoutPageId = resolveActivePage(out.layoutPages, data.activeLayoutPageId);
  return out;
}

// The file / autosave / stashed-tab payload from live values (only the fields in FIELDS are written).
export function payloadFromFields(live) {
  const out = { version: PROJECT_VERSION };
  for (const f of FIELDS) out[f.key] = f.save ? f.save(live[f.key]) : live[f.key];
  return out;
}

// TASKS.csv #513 — does this project hold anything worth a crash-recovery autosave (and should a recovered
// autosave go into its own tab rather than replace it)? Derived from FIELDS — any field that is not view state
// and is not empty — instead of a hand-kept list: that list (collars, assays, layers, sections, surface
// samples, map layers, surface structures) missed inversion models, survey, rasters, terrain, DC/IP lines,
// generated surfaces, boundaries..., so a project holding only an inversion was never autosaved. layoutPages
// is skipped: a new project already has its default page.
const NOT_CONTENT = new Set(["layoutPages"]);
const isEmptyValue = (v) => v == null || (Array.isArray(v) ? v.length === 0 : typeof v === "object" ? Object.values(v).every(isEmptyValue) : false);
export function projectHasContent(live) {
  return FIELDS.some((f) => f.track !== "view" && !NOT_CONTENT.has(f.key) && !isEmptyValue(live[f.key]));
}

// TASKS.csv #514 — what an older GeoStrix needs to know about to read a file: the field keys in order and
// which fields have their own encoding. The test pins it per PROJECT_VERSION.
export function formatFingerprint() {
  return FIELDS.map((f) => `${f.key}${f.save ? "+save" : ""}${f.load ? "+load" : ""}`).join(",");
}

// Values the unsaved-change watcher reference-compares (every "dirty" field, plus the project settings that
// change geometry; a rename alone is handled by Save As, not an edit). Always the same length.
export function extraDirtyValues(live) {
  return [...DIRTY_KEYS.map((k) => live[k]), live.project?.epsg, normalizeDesurveyMethod(live.project?.desurveyMethod)];
}
