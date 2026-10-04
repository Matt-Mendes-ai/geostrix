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
import { compactLayers, expandLayers } from "./compactRows.js"; // TASKS.csv #374
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
export const PROJECT_VERSION = 7;

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
// that is ~70-100 bytes of JSON per cell; as Float32 base64 columns it is ~4 bytes per value. Only models
// with source "simpeg" are compacted (imported UBC/OMF models keep their existing shape, untouched). The
// compact form is cached per model object, so the repeated snapshot/dirty-check calls re-encode nothing.
const COMPACT_KEYS = ["x", "y", "z", "dx", "dy", "dz", "value", "support"];
const compactCache = new WeakMap();
export function compactVoxelModels(list) {
  return (list || []).map((m) => {
    if (m.source !== "simpeg" || !Array.isArray(m.cells)) return m;
    let c = compactCache.get(m);
    if (!c) {
      const { cells, ...rest } = m;
      const cols = {};
      COMPACT_KEYS.forEach((k) => {
        // Coordinates as offsets from the first cell: Float32 would lose ~0.5 m at UTM northings (~6.2e6).
        const base = k === "x" || k === "y" || k === "z" ? cells[0]?.[k] ?? 0 : 0;
        cols[k] = { base, b64: f32ToB64(cells.map((cell) => (cell[k] ?? NaN) - base)) };
      });
      c = { ...rest, compactCells: { n: cells.length, cols } };
      compactCache.set(m, c);
    }
    return c;
  });
}
export function expandVoxelModels(list) {
  return (list || []).map((m) => {
    if (!m.compactCells) return m;
    const { compactCells, ...rest } = m;
    const cols = {};
    COMPACT_KEYS.forEach((k) => { const c = compactCells.cols[k]; const arr = b64ToF32(c.b64); cols[k] = (i) => arr[i] + c.base; });
    const cells = Array.from({ length: compactCells.n }, (_, i) => {
      const cell = {};
      COMPACT_KEYS.forEach((k) => { cell[k] = cols[k](i); });
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
    empty: () => ({ name: "Untitled project", epsg: 3156, desurveyMethod: DEFAULT_DESURVEY_METHOD }), // 3156 = NAD83 UTM 9N
    load: (data, name) => ({ ...(data.project || { epsg: 3156 }), name: name || data.project?.name || "Untitled project" }) },
  { key: "collars", track: "undo", empty: list },
  { key: "survey", track: "undo", empty: list },
  { key: "layers", track: "undo", empty: () => ({ ...EMPTY_LAYERS }),
    save: compactLayers, load: (data) => ({ ...EMPTY_LAYERS, ...(expandLayers(data.layers) || {}) }) }, // #374 — point surveys stored compact
  { key: "assays", track: "undo", empty: list },
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
  { key: "surfaceStructures", track: "dirty", empty: list }, // TASKS.csv #317
  { key: "fieldStructuralRefs", track: "dirty", empty: list },
  { key: "lithoGroups", track: "dirty", empty: list }, // TASKS.csv #176 — a grouping belongs to the project it was built for
  { key: "geophysSurveys", track: "dirty", empty: map }, // TASKS.csv #451 — older files: every survey unlabelled
  { key: "crmCertificates", track: "dirty", empty: map }, // TASKS.csv #400
  { key: "dcipLines", track: "dirty", empty: list }, // TASKS.csv #322 — DC/IP line data (+ last section) kept with the project
  { key: "omfObjects", track: "undo", empty: list },
  { key: "terrain", track: "dirty", empty: () => null },
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
  { key: "dbConnections", track: "view", empty: list },
  { key: "excludedIntercepts", track: "undo", empty: list },
  { key: "softIntercepts", track: "undo", empty: list },
  { key: "interceptSets", track: "undo", empty: list }, // TASKS.csv #52 (c)
  { key: "sections", track: "undo", empty: list },
  { key: "sectionGroups", track: "undo", empty: list },
  // Saved layout templates round-trip through the project file like themes, so New resets them too.
  { key: "layoutTemplates", track: "dirty", empty: list },
  { key: "plannedHoles", track: "undo", empty: list }, // TASKS.csv #188
  { key: "surfaceSamples", track: "undo", empty: list }, // TASKS.csv #228
  { key: "surfaceElements", track: "undo", empty: list },
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
export function fieldsFromPayload(data, name) {
  const out = {};
  for (const f of FIELDS) out[f.key] = f.load ? f.load(data, name) : data[f.key] || f.empty();
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
