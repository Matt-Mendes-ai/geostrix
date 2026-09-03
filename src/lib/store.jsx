import React, { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { saveFile, openFile, autosaveWrite, autosaveRead, autosaveClear, dbConnect as dbConnectIpc, dbDisconnect as dbDisconnectIpc } from "./desktop.js";

const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

// TASKS.csv #226/#214 (software-design-specialist audit finding, performance follow-up) — cursor was
// previously plain useState INSIDE StoreProvider, exposed through the same single giant context value
// as everything else. setCursor(worldPt) fires on every pointermove while hovering the 3D view (see
// ViewerModule.jsx's onPointerMove, which drives the live status-bar readout) — since a single Context
// re-renders EVERY consumer of useStore() on any value change regardless of which field actually
// changed, that meant ViewerModule.jsx (the app's single largest, most render-expensive component —
// 78 state hooks per the audit, a huge sidebar JSX tree) was re-rendering on every mouse-move tick
// during ordinary camera interaction — confirmed live (see this row's own commit) that ViewerModule
// destructured `cursor` from the store but never actually READ its value anywhere in its own render
// output, only ever calling the setter — meaning every one of those re-renders was pure waste.
// Splitting cursor into its own pair of tiny contexts fixes this at the root: CursorSetterContext's
// value is the raw useState setter, which React guarantees keeps a stable identity for the lifetime of
// the component that owns it — so a consumer that only ever calls useSetCursor() (ViewerModule) is
// NEVER forced to re-render by a cursor change, no matter how often it fires. CursorValueContext holds
// the actual live value and DOES change identity on every update — consumed only by the one place that
// genuinely needs to re-render on it, the status bar's own small, cheap `<span>` readout in App.jsx.
const CursorValueContext = createContext({ x: null, y: null, z: null });
const CursorSetterContext = createContext(() => {});
export function CursorProvider({ children }) {
  const [cursor, setCursor] = useState({ x: null, y: null, z: null }); // world coords under pointer, for status bar
  return (
    <CursorSetterContext.Provider value={setCursor}>
      <CursorValueContext.Provider value={cursor}>{children}</CursorValueContext.Provider>
    </CursorSetterContext.Provider>
  );
}
export const useCursorValue = () => useContext(CursorValueContext);
export const useSetCursor = () => useContext(CursorSetterContext);

// TASKS.csv #226/#214 follow-up — taskProgress was the other candidate flagged (but not yet fixed)
// when the cursor split above closed the measured case: setTaskProgress fires repeatedly during any
// long-running foreground action (a modeling run's progress-bar tick, once per file in a multi-file
// import queue — see ViewerModule.jsx's callers), and like cursor it lived in the single giant store
// context, so every one of those ticks re-rendered every useStore() consumer including ViewerModule
// itself — which, same as cursor, only ever calls the setter and never reads taskProgress's value in
// its own render output (only App.jsx's status bar does). Identical split, same reasoning.
const TaskProgressValueContext = createContext(null);
const TaskProgressSetterContext = createContext(() => {});
export function TaskProgressProvider({ children }) {
  const [taskProgress, setTaskProgress] = useState(null);
  return (
    <TaskProgressSetterContext.Provider value={setTaskProgress}>
      <TaskProgressValueContext.Provider value={taskProgress}>{children}</TaskProgressValueContext.Provider>
    </TaskProgressSetterContext.Provider>
  );
}
export const useTaskProgressValue = () => useContext(TaskProgressValueContext);
export const useSetTaskProgress = () => useContext(TaskProgressSetterContext);

const EMPTY_LAYERS = { litho: [], alt: [], vein: [], geotech: [], mnlgy: [], magsusc: [], structure: [], litho_gc: [], alt_gc: [], geophys_pts: [] };
// v6 adds terrain + layerGroups (TASKS.csv #77/#81 SRTM terrain, #76 named layer groups) — v5 and
// older files still open fine, terrain falls back to null (no terrain surface) and layerGroups to [].
const PROJECT_VERSION = 6;

// TASKS.csv #199 — user request: "we need the project name (file name) instead of untitled." The tab
// bar/title previously always showed whatever project.name happened to be (usually still "Untitled
// project" forever, since nothing updated it on save/open — see saveProject/openProject below), never
// the actual file the project was saved to or opened from. This strips GeoStrix's own save extensions
// off a raw file name (e.g. "MyProperty.geostrix.json" -> "MyProperty") so the displayed name matches
// what the user actually sees in their file browser, the same way any other desktop app's title does.
function fileNameToProjectName(fileName) {
  if (!fileName) return null;
  return fileName.replace(/\.(geostrix\.json|geox\.json|json)$/i, "");
}

// TASKS.csv #68 — the Layout page's element list used to live in LayoutModule's own useState, which
// meant it reset to this same starter set every time LayoutModule unmounted — which happens on
// every trip to another tab, including the trip "Add viewport"/"Refresh" themselves force (Layout
// asks Viewer to render a theme, hops to the Viewer tab to do it, then hops back — see
// requestViewportRender below) — so a real layout could be wiped out by using its own core feature.
// Moved into the store (same pattern as themes/customLayers) so it survives tab switches and now
// round-trips through project save/load too.
const DEFAULT_LAYOUT_ELEMENTS = [
  { id: "title", type: "title", x: 40, y: 30, text: "Untitled Section", w: 400 },
  { id: "north", type: "north", x: 1000, y: 40 },
  { id: "scale", type: "scale", x: 40, y: 720, meters: 100 },
  { id: "legend", type: "legend", x: 900, y: 500, items: [["Lithology", "#c98a5a"], ["Alteration", "#4a6b4a"], ["Fault", "#c0392b"]] },
];

export function StoreProvider({ children }) {
  const [project, setProject] = useState({ name: "Untitled project", epsg: 3156 }); // 3156 = NAD83 UTM 9N (Golden Triangle)
  const [collars, setCollars] = useState([]);
  const [survey, setSurvey] = useState([]);
  const [layers, setLayers] = useState({ ...EMPTY_LAYERS });
  const [assays, setAssays] = useState([]);
  const [assayElements, setAssayElements] = useState([]);
  // TASKS.csv #228 — surface geochemistry (soil/rock-chip/stream-sediment/talus-fines samples), the
  // single highest-value gap the mineral-exploration-specialist audit found: early-stage programs
  // very commonly run surface geochem before ever drilling, and until now the app had nowhere to put
  // it (`assays` hard-requires hole_id/from/to). Deliberately a flat {x,y,z,medium,elements:{...}}
  // list rather than shoehorned into `assays` — same reasoning as plannedHoles vs collars/survey: a
  // different real-world concept shouldn't get mixed into a hole-interval table. Small/user-imported-
  // scale (a real surface program is realistically hundreds to low thousands of samples, not the
  // tens-of-thousands voxelModels has to worry about), so — unlike voxelModels — this DOES participate
  // in undo/redo and the tab-dirty indicator, set directly via setSurfaceSamples/setSurfaceElements by
  // GeochemModule's import flow, the same pattern assays/assayElements already use.
  const [surfaceSamples, setSurfaceSamples] = useState([]);
  const [surfaceElements, setSurfaceElements] = useState([]);
  const [customLayers, setCustomLayers] = useState([]); // plain {id,name,rows} mirror for save/load; ViewerModule owns the live three.js groups
  const [dbConnections, setDbConnections] = useState([]); // saved (non-secret) connection profiles
  // TASKS.csv #206 — "the database stays connected and accessible on a database side panel... so I
  // don't have [to] enter the password everytime." keyed by connection NAME (matches dbConnections'
  // profile.name — the same thing the "— saved connections —" dropdown already keys on) so both the
  // Browser panel and DatabaseConnectModal can look up "is this one already connected?" the same way.
  // Session-only by construction: it mirrors electron/main.js's in-memory liveDbConnections Map, which
  // is itself never persisted — nothing here is written to the project file or localStorage, and a
  // fresh app launch always starts with this empty (the whole point being no password survives past
  // the live session it was typed into).
  const [liveDbConnections, setLiveDbConnections] = useState({}); // name -> { id, config, connectedAt }

  const connectDb = useCallback(async (config) => {
    const existing = config.name && liveDbConnections[config.name];
    if (existing) return { ok: true, id: existing.id, info: existing.info, reused: true };
    const res = await dbConnectIpc(config);
    if (res.ok && config.name) {
      setLiveDbConnections((prev) => ({ ...prev, [config.name]: { id: res.id, config: res.config, connectedAt: Date.now(), info: res.info } }));
    }
    return res;
  }, [liveDbConnections]);

  const disconnectDb = useCallback(async (name) => {
    const entry = liveDbConnections[name];
    if (!entry) return { ok: true };
    const res = await dbDisconnectIpc(entry.id);
    setLiveDbConnections((prev) => { const next = { ...prev }; delete next[name]; return next; });
    return res;
  }, [liveDbConnections]);
  // TASKS.csv #84 — geological architecture layer 3. Which boundary intercepts (litho/alt interval
  // tops, the same rows the implicit-modelling tools read) the user has explicitly excluded from
  // feeding a modelling run, by id (see ViewerModule's interceptId — `${layerKey}:${hole_id}:${from}:
  // ${value}`). A plain array of ids, not a richer "intercepts" table, since the intercepts themselves
  // are still derived on demand from layers.litho/layers.alt + the current desurveyed traces, not
  // stored as their own data — this is just the user's review/exclude decisions layered on top.
  const [excludedIntercepts, setExcludedIntercepts] = useState([]);
  const toggleExcludedIntercept = useCallback((id) => {
    setExcludedIntercepts((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }, []);
  // TASKS.csv #88 — geological architecture layer 7 (surface constraints), the "soft" constraint type
  // from the user's design doc: a control point that should be approximately honoured rather than
  // passed through exactly. Same id/array pattern as excludedIntercepts right above — GemPy natively
  // supports this per-point via SurfacePointsTable's `nugget` field (higher nugget = looser fit,
  // verified directly against the installed gempy package before wiring the sidecar endpoint), so
  // marking an intercept "soft" here sets a real solver-level tolerance, not just a UI label.
  const [softIntercepts, setSoftIntercepts] = useState([]);
  const toggleSoftIntercept = useCallback((id) => {
    setSoftIntercepts((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }, []);
  // TASKS.csv — cross-section contact drawing. Each entry is
  // {id, name, ax, ay, bx, by, azimuth, corridor, contacts: [{id, unit, color, points: [{l, z, x, y}]}]}
  // — `ax/ay/bx/by/corridor` are the section line/buffer (world coords, same as everywhere else in the
  // project), `contacts` are user-drawn interpreted lithological/other contacts on that section
  // (`l` = distance along the section line in meters, `z` = elevation, both real-world so they redraw
  // correctly regardless of which holes/layers happen to be visible on a later reopen; `x/y` are the
  // corresponding world easting/northing, kept for the eventual "match 3D surfaces to these 2D
  // contacts" follow-up the user asked for, so a contact point is already a usable 3D control point
  // without re-deriving it from `l`/the section line later). A section is auto-registered (via
  // upsertSection) the moment it's launched from ViewerModule's "Draw cross-section" tool, so drawn
  // contacts always have somewhere to persist to — see ViewerModule's launchSection/reopenSection.
  const [sections, setSections] = useState([]);
  // TASKS.csv #240 — user report, real screenshot: a single "slice series (fence)" run against a
  // large voxel model produced 3144 individual sections, flooding the flat Cross-sections list (one
  // DOM row each) and giving no easy way to clear them out again. sectionGroups is a small parallel
  // list (mirroring layerGroups' own shape/reasoning) — a fence-series run creates ONE group entry
  // and tags every section it generates with that group's id, so ViewerModule's sidebar can render
  // one collapsed row per fence run instead of one row per section, and deleteSectionGroup can wipe
  // an entire run in one action instead of hundreds of individual deletes. A manually drawn section
  // (ViewerModule's "Draw cross-section" tool) has no groupId and still renders as its own row, same
  // as before this row existed.
  const [sectionGroups, setSectionGroups] = useState([]);
  const upsertSection = useCallback((section) => {
    setSections((p) => {
      const i = p.findIndex((s) => s.id === section.id);
      if (i === -1) return [...p, section];
      const next = [...p]; next[i] = { ...next[i], ...section };
      return next;
    });
  }, []);
  const renameSection = useCallback((id, name) => setSections((p) => p.map((s) => s.id === id ? { ...s, name } : s)), []);
  const deleteSection = useCallback((id) => setSections((p) => p.filter((s) => s.id !== id)), []);
  // TASKS.csv #240 follow-up — user request: "edit a single section but also bulk edit a bunch of
  // sections and also bulk rename them." A single setSections pass over an id Set (not N individual
  // upsertSection calls looped from the caller) matters once a "bunch" can realistically mean an
  // entire fence-series group — see #240's own note on that scale (3144 sections from one run).
  const updateSections = useCallback((ids, patch) => {
    const idSet = new Set(ids);
    setSections((p) => p.map((s) => idSet.has(s.id) ? { ...s, ...patch } : s));
  }, []);
  // Numbered bulk rename (baseName -> "baseName 1", "baseName 2", ...) rather than assigning every
  // selected section the SAME literal name, which would make them indistinguishable in the list —
  // same numbering convention generateSliceSeries' own "Fence i/n (...)" names already use. `ids`
  // order (as passed by the caller, i.e. the order sections currently render in) decides the
  // numbering order.
  const renameSectionsBulk = useCallback((ids, baseName) => {
    const order = new Map(ids.map((id, i) => [id, i]));
    setSections((p) => p.map((s) => order.has(s.id) ? { ...s, name: `${baseName} ${order.get(s.id) + 1}` } : s));
  }, []);
  const addSectionGroup = useCallback((name) => {
    const id = `sectgrp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setSectionGroups((p) => [...p, { id, name }]);
    return id;
  }, []);
  const deleteSectionGroup = useCallback((id) => {
    setSections((p) => p.filter((s) => s.groupId !== id));
    setSectionGroups((p) => p.filter((g) => g.id !== id));
  }, []);
  const deleteAllSections = useCallback(() => { setSections([]); setSectionGroups([]); }, []);
  const setSectionContacts = useCallback((id, contacts) => {
    setSections((p) => p.map((s) => s.id === id ? { ...s, contacts } : s));
  }, []);
  // Viewer UI state (layerVisible/categoryFilter/numericRange/legendOverride/visibleHoles/customVisible/
  // assayVisible/assayDisplayElement) is owned by ViewerModule but mirrored here (plain JSON, Sets ->
  // arrays) so it round-trips through save/open. `viewerUiStateSeq` bumps on newProject/openProject so
  // ViewerModule knows a fresh load happened and should re-hydrate (or reset to defaults) instead of
  // treating it as just another local edit.
  const [viewerUiState, setViewerUiState] = useState(null);
  const [viewerUiStateSeq, setViewerUiStateSeq] = useState(0);

  // TASKS.csv #101 — which Viewport element (if any) the Layout page's grid overlay is bound to, plus
  // the desired real-world spacing in metres. Lives here (not as local LayoutModule state, which is
  // where gridMm/showGrid intentionally stay — see LayoutModule's own comment) because the Viewport
  // Enter/Refresh round-trip unmounts LayoutModule entirely (Layout and Viewer are never both
  // mounted), which would otherwise silently drop the binding on every refresh — exactly the
  // "doesn't automatically track a refreshed viewport" gap #101 was filed to close. Session-only
  // (not persisted with the project file), matching gridMm/showGrid.
  const [gridBoundViewportId, setGridBoundViewportId] = useState("");
  const [gridMeters, setGridMeters] = useState(100);

  // TASKS.csv #155 — "3D Modeling" promoted to its own top-level module (a peer of 3D View, not a
  // sub-tab inside it), which means ViewerModule now fully unmounts/remounts when switching between
  // the two (same as switching to Geochem and back already did) — camState (theta/phi/radius/target)
  // lives in a plain useRef inside ViewerModule for performance (updated many times per second while
  // dragging; putting it in React state would re-render on every drag frame), so it was always lost on
  // unmount. Mirrored here on UNMOUNT ONLY (not every drag frame — same "cheap, infrequent write"
  // discipline as viewerUiState above) so the camera survives a View<->Modeling round trip instead of
  // resetting to the default angle every time, which would make switching between them while working
  // genuinely annoying.
  const [lastCamState, setLastCamState] = useState(null);

  // ---- Saved "themes" (TASKS.csv #45) — named bundles of the viewer's full display state
  // (everything already in viewerUiState) PLUS a camera position, since a theme needs to reproduce
  // an exact view, not just layer visibility. Unlike viewerUiState (the viewer's *current* live
  // state, always overwritten), themes are a list the user explicitly saves/names/deletes, and they
  // persist in the project file independent of whatever the viewer happens to be showing right now.
  // Each theme: { id, name, layerVisible, categoryFilter, numericRange, legendOverride, visibleHoles,
  // customVisible, assayVisible, assayDisplayElement, gridConfig, camState: {theta,phi,radius,target:{x,y,z}} }
  const [themes, setThemes] = useState([]);
  const addTheme = useCallback((theme) => {
    const id = `theme_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setThemes((p) => [...p, { ...theme, id }]);
    return id;
  }, []);
  const updateTheme = useCallback((id, patch) => setThemes((p) => p.map((t) => t.id === id ? { ...t, ...patch } : t)), []);
  const renameTheme = useCallback((id, name) => setThemes((p) => p.map((t) => t.id === id ? { ...t, name } : t)), []);
  const deleteTheme = useCallback((id) => setThemes((p) => p.filter((t) => t.id !== id)), []);

  // TASKS.csv #18 — saved layout templates. Same "explicitly saved, named list" pattern as themes
  // just above, but bundling a full snapshot of layoutElements instead of viewer display state — a
  // reusable page starting point (company letterhead + north arrow + scale bar + legend placement,
  // say) that a project can be seeded from without hand-rebuilding it every time.
  const [layoutTemplates, setLayoutTemplates] = useState([]);
  const addLayoutTemplate = useCallback((name, elements) => {
    const id = `layouttpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setLayoutTemplates((p) => [...p, { id, name, elements }]);
    return id;
  }, []);
  const renameLayoutTemplate = useCallback((id, name) => setLayoutTemplates((p) => p.map((t) => t.id === id ? { ...t, name } : t)), []);
  const deleteLayoutTemplate = useCallback((id) => setLayoutTemplates((p) => p.filter((t) => t.id !== id)), []);

  // ---- Raster drapes (TASKS.csv #24) — GeoTIFF (and eventually other grid) imports, drape onto the
  // 3D plan view as a textured plane at a chosen elevation. Parsing happens in the Geophysics module
  // (src/lib/raster.js); the store just holds the result: a PNG data URL (already downsampled/
  // colour-mapped client-side — keeps a big source GeoTIFF from bloating every project save) plus the
  // raster's real-world bounding box, so ViewerModule can position/size the plane without needing to
  // touch the original GeoTIFF again. Each: { id, name, bbox:[xmin,ymin,xmax,ymax], elevation, opacity,
  // visible, dataUrl, drapeMode }. drapeMode (TASKS.csv #81) is "flat" (default — a plane at
  // `elevation`, the original #24 behavior) or "terrain" (conform to the loaded `terrain` surface
  // below instead, ignoring `elevation`; only meaningful once a terrain surface actually exists).
  const [rasters, setRasters] = useState([]);
  const addRaster = useCallback((raster) => {
    const id = `raster_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setRasters((p) => [...p, { opacity: 0.85, visible: true, drapeMode: "flat", ...raster, id }]);
    return id;
  }, []);
  const updateRaster = useCallback((id, patch) => setRasters((p) => p.map((r) => r.id === id ? { ...r, ...patch } : r)), []);
  const removeRaster = useCallback((id) => setRasters((p) => p.filter((r) => r.id !== id)), []);

  // ---- Boundary polylines (Geosoft .ply import, src/lib/geosoft.js) — same list-of-objects shape as
  // `rasters` above, since boundaries are the same kind of thing (an imported overlay with visibility/
  // color/elevation controls, not tied to a drillhole). Each: { id, name, polylines: {x,y}[][] (one
  // or more closed loops — multi-part boundaries are real, see qcbound.ply-style samples), color,
  // elevation, visible, drapeMode }. drapeMode mirrors rasters' "flat"/"terrain" (#81) — a boundary
  // more often wants to sit ON the ground than a raster drape does, but "flat" stays the default for
  // consistency with every other importer in the app.
  const [boundaries, setBoundaries] = useState([]);
  const addBoundary = useCallback((boundary) => {
    const id = `boundary_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setBoundaries((p) => [...p, { color: "#e2a63c", opacity: 1, elevation: 0, visible: true, drapeMode: "flat", ...boundary, id }]);
    return id;
  }, []);
  const updateBoundary = useCallback((id, patch) => setBoundaries((p) => p.map((b) => b.id === id ? { ...b, ...patch } : b)), []);
  const removeBoundary = useCallback((id) => setBoundaries((p) => p.filter((b) => b.id !== id)), []);

  // TASKS.csv — "we need to find a way to calculate the beta angle for non-oriented drilling based on
  // field structural measurements." A small reusable library of surface/outcrop structural readings
  // (known true dip/dip-direction), independent of any specific drillhole or core interval — the
  // CoreOrientationCalculator picks from these as the "known" attitude it calibrates a non-oriented
  // core run's rotational offset against. { id, label, dipDirDeg, dipDeg, notes }.
  const [fieldStructuralRefs, setFieldStructuralRefs] = useState([]);
  const addFieldRef = useCallback((ref) => {
    const id = `fieldref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setFieldStructuralRefs((p) => [...p, { label: "", dipDirDeg: 0, dipDeg: 0, notes: "", ...ref, id }]);
    return id;
  }, []);
  const removeFieldRef = useCallback((id) => setFieldStructuralRefs((p) => p.filter((r) => r.id !== id)), []);

  // ---- OMF objects (TASKS.csv — Open Mining Format import, src/lib/omf.js) — same list-of-objects
  // shape as `boundaries`/`rasters` above (an imported overlay, not tied to a drillhole), covering
  // whatever mix of point/line/surface elements a single .omf project actually contained. Each:
  // { id, name, kind: "points"|"lines"|"surface", description, color, vertices (flat Float64Array-ish
  // [x,y,z,...] in world coords), segments (kind="lines" only, flat [i0,j0,i1,j1,...] vertex-index
  // pairs), triangles (kind="surface" only, flat [i0,j0,k0,...] vertex-index triples), attributes
  // ([{name,location,kind,values,min,max}], see omf.js), visible }. Volume elements (block models) go
  // through the existing voxelModels list instead (addVoxelModel) — no new shape needed there, since
  // an OMF tensor grid + a chosen numeric cell attribute is exactly the same {x,y,z,dx,dy,dz,value}
  // cell shape the UBC/CSV voxel importers already produce.
  const [omfObjects, setOmfObjects] = useState([]);
  const addOmfObject = useCallback((obj) => {
    const id = `omf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setOmfObjects((p) => [...p, { color: "#5a9bd4", visible: true, ...obj, id }]);
    return id;
  }, []);
  const updateOmfObject = useCallback((id, patch) => setOmfObjects((p) => p.map((o) => o.id === id ? { ...o, ...patch } : o)), []);
  const removeOmfObject = useCallback((id) => setOmfObjects((p) => p.filter((o) => o.id !== id)), []);

  // ---- Terrain surface (TASKS.csv #77) — one SRTM/DEM-derived heightfield per project (not a list —
  // draping multiple overlapping DEMs is an edge case not worth the extra UI for a first pass).
  // Parsing (src/lib/raster.js parseDEM) keeps the raw elevation grid rather than baking a texture,
  // since ViewerModule needs real per-vertex heights to build actual terrain geometry, not a flat
  // colour-mapped plane like raster drapes (#24). { id, name, bbox:[xmin,ymin,xmax,ymax], gridW, gridH,
  // elevations: number[] (row-major, row 0 = bbox's north/ymax edge), visible, opacity, color }.
  const [terrain, setTerrain] = useState(null);
  const addTerrain = useCallback((t) => {
    const id = `terrain_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setTerrain({ visible: true, opacity: 1, color: "#8a7f68", ...t, id });
    return id;
  }, []);
  const updateTerrain = useCallback((patch) => setTerrain((p) => (p ? { ...p, ...patch } : p)), []);
  const removeTerrain = useCallback(() => setTerrain(null), []);

  // TASKS.csv #122 — graduated/classed symbology for the geophysics point cloud (layers.geophys_pts),
  // which previously only had a fixed 2-color magColor gradient with no way to pick class breaks
  // (equal interval/quantile) or an adjustable palette — unlike voxel models, which already got this
  // (VoxelLegendEditor in GeophysicsModule.jsx, driven by model.stops/model.colorMode). geophys_pts is
  // a single flat layer (not a list of models each with their own slot), so its classification config
  // lives here as its own small set of fields instead of on a per-item object. min/max default to null
  // (meaning "derive from the live data", same behavior as before this existed) until the user
  // explicitly overrides them via the same Range inputs VoxelLegendEditor already provides.
  const [geophysPtsStops, setGeophysPtsStops] = useState([]);
  const [geophysPtsColorMode, setGeophysPtsColorMode] = useState("continuous");
  const [geophysPtsMin, setGeophysPtsMin] = useState(null);
  const [geophysPtsMax, setGeophysPtsMax] = useState(null);

  // ---- Voxel / block models (TASKS.csv #27/#28) — UBC-GIF mesh+model imports and block-model CSV
  // imports (src/lib/voxel.js) both land here as the same shape: a flat list of world-space cells
  // {x,y,z (center), dx,dy,dz, value}, plus display state. A list (not a single slot like `terrain`)
  // since — unlike terrain, where draping more than one heightfield is a genuine edge case — having
  // both an inversion model and a separate block model loaded at once is a completely ordinary
  // working setup. Deliberately NOT included in the undo-tracked snapshot below or in
  // snapshotCurrentPayload's dirty-detection scope: a real mesh import can be tens of thousands of
  // cells, and undo's change-detection does a JSON.stringify comparison on every tracked field on
  // every relevant edit — including a model that size in that comparison would make routine unrelated
  // edits (moving a Layout element, say) noticeably slower. Voxel models still save/load with the
  // project like everything else; they just don't participate in Ctrl+Z or the tab "unsaved changes"
  // dot, the same documented tradeoff themes/dbConnections/layoutTemplates already accept.
  const [voxelModels, setVoxelModels] = useState([]);
  // Perf fix (user report: importing a real ~200,000-cell OMF block model froze the 3D view for a long
  // time). A 0.85 default opacity forces THREE's `transparent: true` blending path on the whole
  // InstancedMesh — every semi-transparent instance needs depth-sorted alpha blending instead of the
  // much cheaper opaque/depth-tested path, and with a large real-world block model (tens to low
  // hundreds of thousands of overlapping instances) that's a genuine GPU cost, not just cosmetic.
  // Defaulting new models to fully opaque (1) keeps them on the fast path out of the box; a user who
  // specifically wants to see through the model can still lower the opacity slider themselves and
  // accept that cost intentionally, rather than it being silently on for every import.
  const addVoxelModel = useCallback((model) => {
    const id = `voxel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { min, max } = model.cells.length
      ? model.cells.reduce((acc, c) => ({ min: Math.min(acc.min, c.value), max: Math.max(acc.max, c.value) }), { min: Infinity, max: -Infinity })
      : { min: 0, max: 1 };
    // TASKS.csv #188 — rangeMax is the upper-bound counterpart to `threshold` (the pre-existing
    // lower bound), letting the Targeting module isolate a value BAND (e.g. "IP high" or "mag low"),
    // not just cut off everything below one number. Defaults to `max` (i.e. unbounded/no filtering)
    // so every model still shows fully until a user explicitly narrows it — same backward-compatible
    // default the rest of this object's fields already follow.
    setVoxelModels((p) => [...p, { visible: true, opacity: 1, threshold: min, rangeMax: max, min, max, ...model, id }]);
    return id;
  }, []);
  const updateVoxelModel = useCallback((id, patch) => setVoxelModels((p) => p.map((v) => (v.id === id ? { ...v, ...patch } : v))), []);
  const removeVoxelModel = useCallback((id) => setVoxelModels((p) => p.filter((v) => v.id !== id)), []);

  // TASKS.csv #188 — drillhole planning / targeting module. Planned holes are just a collar + a
  // straight-line design orientation (azimuth/dip/length) — no downhole survey exists yet since
  // they haven't been drilled — kept as its own small list rather than shoehorned into `collars`/
  // `survey` (which represent real, drilled holes with actual survey shots) so the two concepts
  // never get mixed up in an export or a hole count. Small list (planning a program is realistically
  // tens of holes, not the tens-of-thousands scale voxelModels has to worry about), so unlike
  // voxelModels this DOES participate in undo/redo and the tab-dirty indicator — see undoSnapshot/
  // applySnapshot/the undo-tracking effect below, where it's added alongside `sections` (another
  // small user-authored list).
  const [plannedHoles, setPlannedHoles] = useState([]);
  const addPlannedHole = useCallback((hole) => {
    const id = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setPlannedHoles((p) => [...p, { name: `PLAN-${p.length + 1}`, x: 0, y: 0, z: 0, azimuth: 0, dip: -60, length: 100, notes: "", ...hole, id }]);
    return id;
  }, []);
  const updatePlannedHole = useCallback((id, patch) => setPlannedHoles((p) => p.map((h) => (h.id === id ? { ...h, ...patch } : h))), []);
  const removePlannedHole = useCallback((id) => setPlannedHoles((p) => p.filter((h) => h.id !== id)), []);

  // User question after the coarsening budget (voxel.js's MAX_CELLS) was lowered for this sandbox's
  // software-rendered GPU: "do you think we can increase the 100,000 3d budget? Is it gonna make
  // GeoStrix crash?" MAX_CELLS was picked from THIS sandbox's own render-time measurements (no real
  // GPU here — SwiftShader software WebGL), which may not reflect Matt's actual hardware at all, so
  // hand-picking a single new hardcoded number for everyone would just be guessing again. Instead this
  // makes the budget a user setting (defaults to voxel.js's own MAX_CELLS, persisted with the rest of
  // the project) — GeophysicsModule's import panel exposes it with a plain-language explanation of the
  // tradeoff, so Matt can raise it and see for himself how his own machine handles it, and lower it
  // again if a particular import is sluggish, rather than the app enforcing one guess as a hard limit.
  const [voxelCellBudget, setVoxelCellBudget] = useState(null); // null = use voxel.js's own MAX_CELLS default

  // ---- Named layer groups (TASKS.csv #76) — purely organizational: an ordered list of layer keys
  // (litho/alt/vein/.../geophys_pts — the same keys LAYER_META and the sidebar's LayerRow loop use)
  // under a user-given name, so a project with many imported layers can be folded into logical
  // sections (e.g. by drilling campaign or by property) instead of one long flat list. A layer can
  // belong to at most one group; ungrouped layers keep showing in the sidebar's default ungrouped
  // section. Grouping by individual imported CSV (_src) rather than whole layer-type was considered
  // and is more powerful, but a bigger lift (see #76's TASKS.csv note) — this is the v1 scope.
  // Each: { id, name, keys: string[], collapsed }.
  const [layerGroups, setLayerGroups] = useState([]);
  const addLayerGroup = useCallback((name) => {
    const id = `lgroup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setLayerGroups((p) => [...p, { id, name: name || "New group", keys: [], collapsed: false }]);
    return id;
  }, []);
  const renameLayerGroup = useCallback((id, name) => setLayerGroups((p) => p.map((g) => g.id === id ? { ...g, name } : g)), []);
  const deleteLayerGroup = useCallback((id) => setLayerGroups((p) => p.filter((g) => g.id !== id)), []);
  const toggleLayerGroupCollapsed = useCallback((id) => setLayerGroups((p) => p.map((g) => g.id === id ? { ...g, collapsed: !g.collapsed } : g)), []);
  // Moves a layer key into group `groupId` (removing it from whichever group it was in, if any) —
  // pass groupId null to just remove it from its current group (back to ungrouped).
  const setLayerGroupFor = useCallback((key, groupId) => {
    setLayerGroups((p) => p.map((g) => {
      const keys = g.keys.filter((k) => k !== key);
      return g.id === groupId ? { ...g, keys: [...keys, key] } : { ...g, keys };
    }));
  }, []);

  // ---- Layout pages (TASKS.csv #68, extended by #69) — see DEFAULT_LAYOUT_ELEMENTS comment above for
  // why page content lives here instead of in LayoutModule's own state. #69 added multiple named pages
  // per project; `layoutPages` is the real persisted state, `layoutElements`/`setLayoutElements` below
  // are kept as derived accessors bound to whichever page is currently active, so every existing call
  // site (LayoutModule.jsx, the viewport-render-result effect further down, undo, save/load…) that
  // already reads/writes "layoutElements" as a single flat array needed ZERO changes — they're just
  // reading/writing through to the active page's elements now instead of one global array.
  // switchLayoutPage/addLayoutPage/renameLayoutPage/deleteLayoutPage are defined further down (after
  // clearUndoHistory, which they call — see that section for why).
  const [layoutPages, setLayoutPages] = useState([{ id: "page_initial", name: "Page 1", elements: DEFAULT_LAYOUT_ELEMENTS }]);
  const [activeLayoutPageId, setActiveLayoutPageId] = useState("page_initial");
  const layoutElements = layoutPages.find((p) => p.id === activeLayoutPageId)?.elements || [];
  const setLayoutElements = useCallback((updater) => {
    setLayoutPages((pages) => pages.map((p) => (p.id === activeLayoutPageId
      ? { ...p, elements: typeof updater === "function" ? updater(p.elements) : updater }
      : p)));
  }, [activeLayoutPageId]);

  // ---- Layout "Viewport" element (TASKS.csv #46) render round-trip. LayoutModule and ViewerModule
  // are never mounted at the same time (App.jsx only renders the active tab), so a Viewport element
  // asking "re-render this theme for me" can't call into ViewerModule directly — it goes through the
  // store instead, the same way #16/#17's snapshot-to-Layout queue does, but request/response shaped
  // (matched by requestId) since the caller needs the resulting image routed back to a *specific*
  // existing Layout element rather than just appended as a new one. Sequence: LayoutModule calls
  // requestViewportRender(themeId, targetElementId) and goToModule("viewer") switches the active tab
  // so ViewerModule mounts (or is already mounted) and its own effect (keyed on
  // viewportRenderRequestSeq) applies the theme, renders, captures, and calls resolveViewportRender().
  //
  // TASKS.csv #70 (bug report) — the requestId -> targetElementId mapping used to live in a plain ref
  // inside LayoutModule (pendingViewportReqs), plus a lastViewportResultSeq ref to dedupe. But the
  // whole point of this round-trip is that LayoutModule *unmounts* while ViewerModule renders (App.jsx
  // only renders the active tab) — so by the time ViewerModule calls resolveViewportRender() and hops
  // back to "layout", LayoutModule remounts as a brand-new instance with those refs reset to empty,
  // and the result effect's `pendingViewportReqs.current[res.requestId]` lookup always missed ->
  // "Add viewport" silently did nothing. Fixed by moving the pending-request bookkeeping AND the
  // result-application logic here into the store (which never unmounts), so it survives the
  // LayoutModule unmount/remount the round-trip itself causes.
  const [viewportPendingRequest, setViewportPendingRequest] = useState(null); // {requestId, targetElementId, themeId} | null
  const [viewportRenderRequest, setViewportRenderRequest] = useState(null);
  const [viewportRenderRequestSeq, setViewportRenderRequestSeq] = useState(0);
  // TASKS.csv #69 — trueScale (orthographic capture) rides along in both the pending-request and
  // render-request objects: the pending one so the result-application effect below can stamp it back
  // onto the element, the render-request one so ViewerModule's capture effect knows which camera to
  // use.
  // TASKS.csv #198 (part 3) — `interactive` rides along the same request/pending shape as
  // trueScale above: true means ViewerModule should apply the theme and then let the user freely
  // orbit/pan/zoom (no auto-capture timer, no auto-restore) until they explicitly exit, instead of
  // the normal "apply, wait 400ms, capture, restore" one-shot round trip.
  const requestViewportRender = useCallback((themeId, targetElementId, trueScale, interactive) => {
    const requestId = `vprend_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setViewportPendingRequest({ requestId, targetElementId, themeId, trueScale, interactive });
    setViewportRenderRequest({ requestId, themeId, trueScale, interactive });
    setViewportRenderRequestSeq((s) => s + 1);
    return requestId;
  }, []);
  const [viewportRenderResult, setViewportRenderResult] = useState(null);
  const [viewportRenderResultSeq, setViewportRenderResultSeq] = useState(0);
  const resolveViewportRender = useCallback((result) => {
    setViewportRenderResult(result);
    setViewportRenderResultSeq((s) => s + 1);
  }, []);
  // Selecting the newly-created viewport element (or re-selecting a refreshed one) also used to be
  // LayoutModule's job in that same result effect — same unmount problem, so it's routed through this
  // one-shot "please select this id next time you mount" slot instead.
  const [layoutSelectRequest, setLayoutSelectRequest] = useState(null);

  // Applies a viewport render result to layoutElements as soon as it matches the outstanding pending
  // request, regardless of whether LayoutModule happens to be mounted right now, then hops back to
  // the Layout tab. Runs in StoreProvider, which is mounted for the whole app lifetime.
  useEffect(() => {
    if (!viewportRenderResult || !viewportPendingRequest) return;
    if (viewportRenderResult.requestId !== viewportPendingRequest.requestId) return;
    const res = viewportRenderResult;
    const { targetElementId } = viewportPendingRequest;
    setViewportPendingRequest(null);

    if (res.error) {
      if (targetElementId !== "new") {
        setLayoutElements((els) => els.map((el) => el.id === targetElementId ? { ...el, refreshing: false } : el));
      }
      goToModule("layout");
      return;
    }
    const aspect = res.naturalW && res.naturalH ? res.naturalW / res.naturalH : 16 / 9;
    if (targetElementId === "new") {
      const w = Math.min(1123 - 160, 700); // 1123 = A4-landscape page width in px @ ~96dpi (LayoutModule's A4.w)
      const h = Math.round(w / aspect);
      const id = `viewport_${Date.now()}`;
      setLayoutElements((els) => [...els, {
        id, type: "viewport", themeId: viewportPendingRequest.themeId,
        x: 90, y: 90, w, h, aspect, src: res.src, worldHeightAtTarget: res.worldHeightAtTarget, cameraAzimuthDeg: res.cameraAzimuthDeg,
        trueScale: !!res.trueScale,
        rotation: 0, frameWidth: 1, frameColor: "#1a1a1a", frameStyle: "solid", refreshing: false,
      }]);
      setLayoutSelectRequest(id);
    } else {
      setLayoutElements((els) => els.map((el) => el.id === targetElementId
        ? { ...el, src: res.src, aspect, worldHeightAtTarget: res.worldHeightAtTarget, cameraAzimuthDeg: res.cameraAzimuthDeg, trueScale: !!res.trueScale, refreshing: false, h: Math.round((el.w || 700) / aspect) }
        : el));
      setLayoutSelectRequest(targetElementId);
    }
    goToModule("layout");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportRenderResultSeq]);

  // ---- Layout snapshots (TASKS.csv #16/#17): a small queue of images (3D viewport PNGs, or
  // cross-section SVGs) waiting to be dropped onto the Layout page. LayoutModule drains this queue
  // in a useEffect whenever it's mounted; producers (ViewerModule, or the section pop-out relayed
  // via IPC) just push and don't need to know whether Layout happens to be mounted right now. ----
  const [pendingLayoutImages, setPendingLayoutImages] = useState([]);
  const addLayoutImage = useCallback((img) => {
    setPendingLayoutImages((p) => [...p, { id: `snap_${Math.random().toString(36).slice(2)}`, ...img }]);
  }, []);
  const consumeLayoutImage = useCallback((id) => {
    setPendingLayoutImages((p) => p.filter((i) => i.id !== id));
  }, []);

  // ---- Cross-module navigation: lets a module (e.g. "snapshot this view to Layout") ask App.jsx
  // to switch the active tab. moduleRequestSeq bumps on every call so App's effect fires even if
  // the target module name repeats (e.g. two snapshots to Layout in a row). ----
  const [requestedModule, setRequestedModule] = useState(null);
  const [moduleRequestSeq, setModuleRequestSeq] = useState(0);
  const goToModule = useCallback((name) => {
    setRequestedModule(name);
    setModuleRequestSeq((s) => s + 1);
  }, []);

  // Global task progress (status-bar "what's happening right now" indicator) moved to its own
  // TaskProgressProvider/useTaskProgressValue/useSetTaskProgress pair above (TASKS.csv #226 follow-up)
  // — see that context's own comment for why it's split out of this giant one.

  const setEpsg = useCallback((epsg) => setProject((p) => ({ ...p, epsg })), []);
  const setProjectName = useCallback((name) => setProject((p) => ({ ...p, name })), []);

  const mergeLayer = useCallback((key, rows) => setLayers((p) => ({ ...p, [key]: [...(p[key] || []), ...rows] })), []);
  const replaceLayer = useCallback((key, rows) => setLayers((p) => ({ ...p, [key]: rows })), []);

  const newProject = useCallback(() => {
    setProject({ name: "Untitled project", epsg: 3156 });
    setCollars([]); setSurvey([]); setLayers({ ...EMPTY_LAYERS });
    setAssays([]); setAssayElements([]); setCustomLayers([]);
    setViewerUiState(null); setViewerUiStateSeq((s) => s + 1);
    setLastCamState(null);
    setPendingLayoutImages([]);
    setThemes([]);
    setRasters([]);
    setTerrain(null);
    setGeophysPtsStops([]); setGeophysPtsColorMode("continuous"); setGeophysPtsMin(null); setGeophysPtsMax(null);
    setVoxelModels([]);
    setLayerGroups([]);
    // TASKS.csv #69 — reset to a single fresh page rather than just clearing the active page's
    // elements (setLayoutElements(DEFAULT_LAYOUT_ELEMENTS) would leave any OTHER pages behind as
    // orphaned leftovers from the previous project).
    { const id = `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; setLayoutPages([{ id, name: "Page 1", elements: DEFAULT_LAYOUT_ELEMENTS }]); setActiveLayoutPageId(id); }
    setDbConnections([]);
    setExcludedIntercepts([]);
    setSoftIntercepts([]);
    setSections([]);
    // Saved layout templates round-trip through the project file just like themes (below), so a
    // "New project" resets them too — there's no global/user-level storage outside a project file
    // yet, so a template that should survive across projects needs to be re-saved from the new
    // project once it's set up, same as themes already work.
    setLayoutTemplates([]);
    // Historically doNew() in App.jsx confirmed with the user before calling this ("Unsaved changes
    // will be lost"), since it reset the only project in place. TASKS.csv #34 (workspace tabs, below)
    // now calls this only from newWorkspaceTab() / closeWorkspaceTab()'s "last tab closed" branch,
    // both of which have already stashed or discarded-with-confirmation whatever was live — so this
    // reset itself never has to reprompt.
    autosaveClear();
    // TASKS.csv #31 — undoing "back into" a project that no longer exists would be nonsensical, so a
    // fresh project starts with a clean undo history rather than one that could restore the old one.
    clearUndoHistory();
    setActiveTabDirty(false);
  }, []);

  // Bug-hunt pass: dbConnections (saved, password-stripped database connection profiles — see
  // DatabaseConnectModal, which already omits the password before storing here) was plain useState with
  // no persistence path at all — a "saved" connection silently vanished on save/reopen or app restart.
  // Included below without bumping PROJECT_VERSION since it's purely additive and backward-compatible
  // (older files just lack the key, same `|| []` fallback pattern as every other field here).
  // Shared field list for save / tab-stash / dirty-comparison, so these can't drift apart the way
  // three separate hand-written object literals eventually would.
  const snapshotCurrentPayload = () => ({
    version: PROJECT_VERSION, project, collars, survey, layers, assays, assayElements, customLayers,
    viewerUiState, themes, rasters, boundaries, fieldStructuralRefs, omfObjects, terrain, geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax, voxelModels, layerGroups, layoutPages, activeLayoutPageId, dbConnections,
    excludedIntercepts, softIntercepts, sections, sectionGroups, layoutTemplates, plannedHoles, surfaceSamples, surfaceElements,
  });

  // TASKS.csv #34 — multi-project workspace tabs. Declared here (ahead of saveProject/loadProjectPayload
  // below, which both reference activeTabId) rather than after them — several of those callbacks close
  // over activeTabId in their dependency arrays, which are evaluated during render, so the state needs
  // to already be initialized by the time those useCallback calls run or React throws a temporal-dead-
  // zone ReferenceError. See each function's own comment further down for what these are for.
  const [workspaceTabs, setWorkspaceTabs] = useState([{ id: "tab_initial", name: "Untitled project", payload: null, dirty: false }]);
  const [activeTabId, setActiveTabId] = useState("tab_initial");
  // Whether the active tab has changed since it was last loaded/created/saved. Piggybacks on the
  // undo-tracking effect further down (which already detects "a real tracked change happened" on
  // every meaningful edit) rather than a separate deep-diff against a saved snapshot — cheap, and
  // reuses an already-correct detector instead of adding a second one that could disagree with it.
  // Shares that effect's tracked-field scope, so edits to project name/EPSG, themes, saved layout
  // templates, or db connection profiles don't flip this — a known gap (those fields DO still save/
  // load correctly, only this indicator can miss them), not worth widening undo's own tracked-field
  // set just to fix.
  const [activeTabDirty, setActiveTabDirty] = useState(false);

  const saveProject = useCallback(async () => {
    const payload = snapshotCurrentPayload();
    const res = await saveFile({
      // TASKS.csv #186 — project format renamed from .geox(.json) to .geostrix(.json). "json" stays
      // in the filter list so old .geox.json project files the user already has on disk still show up
      // and open fine (JSON.parse doesn't care about the filename, and both extensions end in "json").
      suggestedName: `${(project.name || "project").replace(/[^\w\- ]/g, "")}.geostrix.json`,
      filters: [{ name: "GeoStrix Project", extensions: ["geostrix.json", "geox.json", "json"] }],
      content: JSON.stringify(payload),
    });
    // A real save just happened — the crash-recovery snapshot's whole job was to protect work that
    // hadn't reached a real save yet, so it's redundant now (and stale-recovery-prompt bait later).
    if (res.ok) {
      autosaveClear();
      setActiveTabDirty(false);
      // TASKS.csv #199 — derive the display name from the actual saved file path (a "Save As" can
      // rename the file), not from whatever project.name happened to be before this save — that field
      // was never being kept in sync with the real on-disk file name, which is the actual bug behind
      // the tab/title bar always reading "Untitled project" even for a saved, named file.
      const savedFileName = res.filePath ? res.filePath.split(/[\\/]/).pop() : null;
      const displayName = fileNameToProjectName(savedFileName) || project.name;
      setProject((p) => ({ ...p, name: displayName }));
      // TASKS.csv #34 — keep the workspace tab bar's label in sync with whatever the project was
      // just saved as, and clear its own dirty flag now that this tab's on-disk copy matches what's
      // live. Undo history deliberately still survives a save (you can undo past a save point, same
      // as most editors) — only the tab-dirty *indicator* resets here, tracked separately from undo
      // for exactly this reason.
      setWorkspaceTabs((tabs) => tabs.map((t) => (t.id === activeTabId ? { ...t, name: displayName, dirty: false } : t)));
    }
    return res;
  }, [project, collars, survey, layers, assays, assayElements, customLayers, viewerUiState, themes, rasters, boundaries, fieldStructuralRefs, omfObjects, terrain, geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax, voxelModels, layerGroups, layoutPages, activeLayoutPageId, dbConnections, excludedIntercepts, softIntercepts, sections, sectionGroups, layoutTemplates, plannedHoles, surfaceSamples, surfaceElements, activeTabId]);

  // Shared by openProject (loading a user-picked file), restoreAutosave (loading the silent
  // crash-recovery snapshot), and workspace-tab switching (TASKS.csv #34) — same payload shape, same
  // fallbacks for older-version fields.
  const loadProjectPayload = useCallback((data, fallbackName) => {
    // TASKS.csv #199 — `fallbackName` (when given) is the real on-disk/tab display name, and takes
    // priority over whatever project.name happens to be saved INSIDE the file's own JSON payload —
    // that stored value could be stale (e.g. the file was renamed on disk since GeoStrix last wrote
    // it, or it simply predates this fix and was never anything but "Untitled project"). Falls back to
    // the payload's own name, then "Untitled project", only when no real file name is available at all
    // (e.g. restoring the silent crash-recovery autosave, which isn't a named file on disk).
    setProject({ ...(data.project || { epsg: 3156 }), name: fallbackName || data.project?.name || "Untitled project" });
    setCollars(data.collars || []);
    setSurvey(data.survey || []);
    setLayers({ ...EMPTY_LAYERS, ...(data.layers || {}) });
    setAssays(data.assays || []);
    setAssayElements(data.assayElements || []);
    setCustomLayers(data.customLayers || []);
    // Older project files (version < 2) simply won't have this — viewerUiState comes back
    // undefined -> null, and ViewerModule falls back to its defaults, same as before this feature.
    setViewerUiState(data.viewerUiState || null);
    setViewerUiStateSeq((s) => s + 1);
    setLastCamState(null); // a different project's saved camera has no meaning here — fall back to the default view
    setPendingLayoutImages([]);
    // Older (pre-v3) project files have no themes key — comes back [], same graceful fallback
    // pattern as viewerUiState on pre-v2 files.
    setThemes(data.themes || []);
    // Same fallback for pre-v4 files and rasters. Boundaries (Geosoft .ply import) are newer still —
    // any file saved before that feature also just falls back to [].
    setRasters(data.rasters || []);
    setBoundaries(data.boundaries || []);
    setFieldStructuralRefs(data.fieldStructuralRefs || []);
    setOmfObjects(data.omfObjects || []);
    // TASKS.csv #69 — multi-page layout. Files saved before #69 (or with no persisted layout at all)
    // only ever had a single flat `layoutElements` array — wrap it as "Page 1" rather than losing it.
    // A #69+ file has `layoutPages` directly.
    if (data.layoutPages && data.layoutPages.length) {
      setLayoutPages(data.layoutPages);
      const wantedActive = data.activeLayoutPageId;
      setActiveLayoutPageId(wantedActive && data.layoutPages.some((p) => p.id === wantedActive) ? wantedActive : data.layoutPages[0].id);
    } else {
      const id = `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setLayoutPages([{ id, name: "Page 1", elements: data.layoutElements || DEFAULT_LAYOUT_ELEMENTS }]);
      setActiveLayoutPageId(id);
    }
    // Same fallback for pre-v6 files: no terrain/groups yet.
    setTerrain(data.terrain || null);
    // Fallback for pre-#122 files: no geophysics-point classification saved yet.
    setGeophysPtsStops(data.geophysPtsStops || []);
    setGeophysPtsColorMode(data.geophysPtsColorMode || "continuous");
    setGeophysPtsMin(data.geophysPtsMin ?? null);
    setGeophysPtsMax(data.geophysPtsMax ?? null);
    // Fallback for pre-#27/#28 files: no voxel models yet.
    setVoxelModels(data.voxelModels || []);
    setLayerGroups(data.layerGroups || []);
    setDbConnections(data.dbConnections || []);
    setExcludedIntercepts(data.excludedIntercepts || []);
    setSoftIntercepts(data.softIntercepts || []);
    setSections(data.sections || []);
    setSectionGroups(data.sectionGroups || []);
    // Fallback for pre-#18 files: no saved layout templates yet.
    setLayoutTemplates(data.layoutTemplates || []);
    // Fallback for pre-#188 files: no planned drillholes yet.
    setPlannedHoles(data.plannedHoles || []);
    // Fallback for pre-#228 files: no surface geochem samples yet.
    setSurfaceSamples(data.surfaceSamples || []);
    setSurfaceElements(data.surfaceElements || []);
    setActiveTabDirty(false);
  }, []);

  // TASKS.csv #34 — multi-project workspace tabs. Deliberately NOT a rewrite of the ~20 individual
  // useState calls above into a keyed-by-project-id structure (every module calls useStore() assuming
  // one live project, and touching all of that would be a much bigger, much riskier change) — instead
  // each background tab just holds a full stashed payload (same shape as saveProject's, built via
  // snapshotCurrentPayload above) that gets swapped into the single live state on switch, the same
  // machinery openProject already used. The one tab that IS currently showing never carries its own
  // stashed payload (would just be a second, instantly-stale copy of the same data) — its payload is
  // always derived on demand from live state instead; see the `payload: null` used everywhere a tab
  // becomes active below, and dirty-checked via activeTabDirty instead of a payload diff. (workspaceTabs/
  // activeTabId/activeTabDirty themselves are declared earlier, just above saveProject — see that
  // comment for why.)
  const switchToTab = useCallback((tabId) => {
    if (tabId === activeTabId) return;
    const target = workspaceTabs.find((t) => t.id === tabId);
    if (!target) return;
    const current = snapshotCurrentPayload();
    setWorkspaceTabs(workspaceTabs.map((t) => (t.id === activeTabId ? { ...t, payload: current, dirty: activeTabDirty } : t)));
    loadProjectPayload(target.payload, target.name);
    setActiveTabId(tabId);
    autosaveClear();
    clearUndoHistory();
  }, [activeTabId, workspaceTabs, activeTabDirty, loadProjectPayload, project, collars, survey, layers, assays, assayElements, customLayers, viewerUiState, themes, rasters, boundaries, fieldStructuralRefs, omfObjects, terrain, geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax, voxelModels, layerGroups, layoutPages, activeLayoutPageId, dbConnections, excludedIntercepts, softIntercepts, sections, sectionGroups, layoutTemplates, plannedHoles, surfaceSamples, surfaceElements]);

  const newWorkspaceTab = useCallback(() => {
    const current = snapshotCurrentPayload();
    const id = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setWorkspaceTabs([
      ...workspaceTabs.map((t) => (t.id === activeTabId ? { ...t, payload: current, dirty: activeTabDirty } : t)),
      { id, name: "Untitled project", payload: null, dirty: false },
    ]);
    setActiveTabId(id);
    newProject();
  }, [activeTabId, workspaceTabs, activeTabDirty, newProject, project, collars, survey, layers, assays, assayElements, customLayers, viewerUiState, themes, rasters, boundaries, fieldStructuralRefs, omfObjects, terrain, geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax, voxelModels, layerGroups, layoutPages, activeLayoutPageId, dbConnections, excludedIntercepts, softIntercepts, sections, sectionGroups, layoutTemplates, plannedHoles, surfaceSamples, surfaceElements]);

  // Opens a project file into a brand-new tab (never disturbs whatever's already open in other tabs —
  // this replaces the old single-project openProject, which used to overwrite the only project in
  // place; File > Open / Ctrl+O now always means "open into a new tab").
  const openProject = useCallback(async () => {
    // Generic "json" filter (not "geostrix.json" specifically) so both new .geostrix.json files and
    // pre-rename .geox.json files a user already has saved are still selectable/openable here.
    const res = await openFile({ filters: [{ name: "GeoStrix Project", extensions: ["json"] }] });
    if (!res.ok) return res;
    try {
      const data = JSON.parse(res.content);
      const current = snapshotCurrentPayload();
      const id = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      // TASKS.csv #199 — the tab/title should show the actual opened file's name, not whatever
      // project.name happens to be stored inside that file's own JSON (see loadProjectPayload's
      // comment for why that field can be stale/wrong). res.filePath (Electron) or res.name (browser
      // fallback, already just a bare file name) both still carry GeoStrix's own save extension.
      const openedFileName = res.filePath ? res.filePath.split(/[\\/]/).pop() : res.name;
      const displayName = fileNameToProjectName(openedFileName) || data.project?.name || "Untitled project";
      setWorkspaceTabs([
        ...workspaceTabs.map((t) => (t.id === activeTabId ? { ...t, payload: current, dirty: activeTabDirty } : t)),
        { id, name: displayName, payload: null, dirty: false },
      ]);
      loadProjectPayload(data, displayName);
      setActiveTabId(id);
      // A freshly-opened project supersedes whatever crash-recovery snapshot might be sitting
      // around — keeping a stale one would offer to "restore" work from a different project entirely
      // the next time the app starts.
      autosaveClear();
      clearUndoHistory();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, [loadProjectPayload, activeTabId, workspaceTabs, activeTabDirty, project, collars, survey, layers, assays, assayElements, customLayers, viewerUiState, themes, rasters, boundaries, fieldStructuralRefs, omfObjects, terrain, geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax, voxelModels, layerGroups, layoutPages, activeLayoutPageId, dbConnections, excludedIntercepts, softIntercepts, sections, sectionGroups, layoutTemplates, plannedHoles, surfaceSamples, surfaceElements]);

  // Closes a tab, confirming first if it (or its stashed copy) has unsaved changes. Closing the last
  // remaining tab is equivalent to New Project rather than leaving zero tabs, which the tab bar isn't
  // built to represent.
  const closeWorkspaceTab = useCallback((tabId) => {
    const tab = workspaceTabs.find((t) => t.id === tabId);
    if (!tab) return;
    const dirty = tabId === activeTabId ? activeTabDirty : tab.dirty;
    if (dirty && !window.confirm(`Close "${tabId === activeTabId ? project.name : tab.name}" without saving? Unsaved changes will be lost.`)) return;
    const remaining = workspaceTabs.filter((t) => t.id !== tabId);
    if (tabId !== activeTabId) { setWorkspaceTabs(remaining); return; }
    if (!remaining.length) {
      const id = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      newProject();
      setWorkspaceTabs([{ id, name: "Untitled project", payload: null, dirty: false }]);
      setActiveTabId(id);
      return;
    }
    const next = remaining[0];
    loadProjectPayload(next.payload, next.name);
    setActiveTabId(next.id);
    autosaveClear();
    clearUndoHistory();
    setWorkspaceTabs(remaining);
  }, [workspaceTabs, activeTabId, activeTabDirty, project.name, newProject, loadProjectPayload]);

  // TASKS.csv #33 — autosave / crash recovery. Periodically (and silently — no save dialog) writes
  // the full project payload to a fixed location, refreshed on an interval while there's actually
  // something to lose. This is a safety net for a crash/power-loss before the user hits the real
  // "Save", not a replacement for it — real saves and explicit discards both clear it (see
  // saveProject, openProject, newProject, discardAutosave above/below) so a stale snapshot never
  // outlives its usefulness or gets offered up after the user has already moved on.
  const hasWork = collars.length > 0 || assays.length > 0 || surfaceSamples.length > 0 || Object.values(layers).some((rows) => rows.length > 0) || sections.length > 0;
  const autosaveRef = useRef({ project, collars, survey, layers, assays, assayElements, customLayers, viewerUiState, themes, rasters, boundaries, fieldStructuralRefs, omfObjects, terrain, geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax, voxelModels, layerGroups, layoutPages, activeLayoutPageId, dbConnections, excludedIntercepts, softIntercepts, sections, sectionGroups, layoutTemplates, plannedHoles, surfaceSamples, surfaceElements, hasWork });
  autosaveRef.current = { project, collars, survey, layers, assays, assayElements, customLayers, viewerUiState, themes, rasters, boundaries, fieldStructuralRefs, omfObjects, terrain, geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax, voxelModels, layerGroups, layoutPages, activeLayoutPageId, dbConnections, excludedIntercepts, softIntercepts, sections, sectionGroups, layoutTemplates, plannedHoles, surfaceSamples, surfaceElements, hasWork };
  useEffect(() => {
    const AUTOSAVE_INTERVAL_MS = 60000; // frequent enough to matter after a crash, infrequent enough not to be a perf/disk concern for a JSON payload this size
    const id = setInterval(() => {
      const snap = autosaveRef.current;
      if (!snap.hasWork) return; // nothing worth protecting yet — an empty new project autosaving itself would just be noise
      const { hasWork: _drop, ...payload } = snap;
      autosaveWrite(JSON.stringify({ version: PROJECT_VERSION, ...payload, autosavedAt: Date.now() }));
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Called once on app startup (see App.jsx) to check whether a crash-recovery snapshot exists.
  // Returns metadata only — doesn't touch current state — so App.jsx can show a banner and let the
  // user choose restore vs. discard rather than silently overwriting whatever's already open.
  const checkAutosave = useCallback(async () => {
    const res = await autosaveRead();
    if (!res.ok) return null;
    try {
      const data = JSON.parse(res.content);
      return { data, projectName: data.project?.name || "Untitled project", autosavedAt: data.autosavedAt || res.mtime || null };
    } catch (_) {
      return null;
    }
  }, []);
  const restoreAutosave = useCallback((data) => { loadProjectPayload(data); clearUndoHistory(); }, [loadProjectPayload]);
  const discardAutosave = useCallback(() => { autosaveClear(); }, []);

  // TASKS.csv #31 — undo/redo. Snapshot-based rather than instrumenting every individual setter call
  // site across every module (collars/survey/layers/assays/customLayers/layoutElements/sections/
  // rasters/terrain/layerGroups are each mutated from several different components) — a snapshot diff
  // is far less invasive to wire up correctly and, since every one of these fields is already plain
  // JSON (they all round-trip through project save/load), cheap enough to clone wholesale on every
  // settled change rather than needing per-field patches.
  //
  // Debounced: a drag gesture (moving a Layout element, say) fires its setter on every mousemove —
  // without coalescing, undo would only ever step back one pixel at a time, and the history array
  // would balloon. Instead, a change starts (or extends) a quiet-period timer; only once nothing
  // tracked has changed for UNDO_DEBOUNCE_MS does the state from BEFORE that whole burst get pushed
  // as a single undo step. This means undo works at the granularity of "a drag", "an import", "a
  // delete" — not "one mousemove tick" — which is what a user actually wants to step back through.
  const UNDO_MAX = 60;
  const UNDO_DEBOUNCE_MS = 500;
  // TASKS.csv #220 — rasters/terrain excluded here (and from applySnapshot/the tracking effect's
  // dependency array below), same treatment voxelModels/themes/dbConnections/layoutTemplates already
  // get and for the same reason: this snapshot is deep-JSON.stringify-compared on every tracked change
  // (see the useLayoutEffect below), and a real GeoTIFF/DEM-derived raster or terrain grid is large
  // enough (measured: ~49ms per compare with just a 4MB raster loaded) that re-serializing it on every
  // unrelated edit (typing in a litho interval, say) added real, avoidable cost. Trade-off, same as the
  // existing exclusions: importing/removing/editing a raster or terrain surface is no longer undoable
  // and no longer flips the tab's unsaved-changes indicator — it IS still fully included in save/open
  // and autosave (autosaveRef below), so nothing is lost on disk, only from the in-session undo stack.
  const undoSnapshot = () => ({ collars, survey, layers, assays, assayElements, customLayers, layoutElements, sections, sectionGroups, boundaries, omfObjects, layerGroups, excludedIntercepts, softIntercepts, plannedHoles, surfaceSamples, surfaceElements });
  // Bug fix (found while adding plannedHoles to undo-tracking for #188 and testing redo end-to-end —
  // NOT a new bug, this affected every undo-tracked field, not just plannedHoles): `undo`/`redo` below
  // are `useCallback(fn, [applySnapshot])`, and `applySnapshot` never changes identity, so `undo`/
  // `redo` are created exactly ONCE, at mount — their function bodies permanently close over THAT
  // render's `undoSnapshot` identifier, which itself closed over whatever collars/survey/.../
  // plannedHoles were at mount (typically all empty, for a fresh project). Every later call to
  // `undo()`'s `undoFuture.current.push(undoSnapshot())` and `redo()`'s `undoPast.current.push(
  // undoSnapshot())` was therefore pushing that same frozen MOUNT-TIME snapshot, not "the state being
  // moved away from right now" — confirmed live: after loading data, undo-ing a change and then
  // redo-ing it restored an empty/initial project instead of the change, i.e. redo after undo could
  // silently discard real work back to launch-time state. The auto-tracking useLayoutEffect right
  // below (which populates undoPast/undoFuture during NORMAL editing, not via undo()/redo()
  // themselves) was unaffected — it re-declares its own `undoSnapshot` closure fresh on every render,
  // so first-level undo already worked correctly; only the SECOND direction (redo, and undo-after-
  // redo) was broken. Fixed with the standard "ref that's kept fresh every render, read from inside a
  // stable callback" pattern: undoSnapshotRef.current is reassigned to the current render's
  // undoSnapshot on every render (a plain reassignment, not a hook, so it's always up to date by the
  // time any event handler runs), and undo/redo call undoSnapshotRef.current() instead of the
  // module-level identifier — same stable function identity for undo/redo (nothing that depends on
  // their reference, e.g. App.jsx's keydown effect, needs to change), but no longer stale data.
  const undoSnapshotRef = useRef(undoSnapshot);
  undoSnapshotRef.current = undoSnapshot;
  const [undoCount, setUndoCount] = useState(0); // just for UI enable/disable — the stacks themselves live in refs so pushing to them doesn't itself trigger renders
  const [redoCount, setRedoCount] = useState(0);
  const undoPast = useRef([]);
  const undoFuture = useRef([]);
  const undoBeforeBurst = useRef(null); // snapshot from the moment the CURRENT quiet-period burst started
  const undoDebounceTimer = useRef(null);
  const undoApplying = useRef(false); // true while undo()/redo() itself is writing state, so that write doesn't get mistaken for a new user change
  const undoPrevSnapshot = useRef(undoSnapshot());

  // useLayoutEffect (not useEffect) deliberately — applySnapshot's setTimeout(0) that clears
  // undoApplying needs this watcher to have already run and seen the flag first, and a layout effect
  // is guaranteed to fire synchronously after the DOM commit, strictly before any macrotask (a plain
  // useEffect's passive-effect timing is close enough in practice but not guaranteed the same way).
  useLayoutEffect(() => {
    if (undoApplying.current) { undoPrevSnapshot.current = undoSnapshot(); setActiveTabDirty(true); return; }
    const current = undoSnapshot();
    if (JSON.stringify(current) === JSON.stringify(undoPrevSnapshot.current)) return; // no real change (e.g. a set-to-same-value call)
    setActiveTabDirty(true); // TASKS.csv #34 — see activeTabDirty's own comment above for scope/limits
    if (!undoBeforeBurst.current) undoBeforeBurst.current = undoPrevSnapshot.current;
    undoPrevSnapshot.current = current;
    if (undoDebounceTimer.current) clearTimeout(undoDebounceTimer.current);
    undoDebounceTimer.current = setTimeout(() => {
      undoPast.current.push(undoBeforeBurst.current);
      if (undoPast.current.length > UNDO_MAX) undoPast.current.shift();
      undoBeforeBurst.current = null;
      undoFuture.current = [];
      setUndoCount(undoPast.current.length);
      setRedoCount(0);
    }, UNDO_DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collars, survey, layers, assays, assayElements, customLayers, layoutElements, sections, sectionGroups, boundaries, omfObjects, layerGroups, excludedIntercepts, softIntercepts, plannedHoles, surfaceSamples, surfaceElements]);

  const applySnapshot = useCallback((snap) => {
    undoApplying.current = true;
    setCollars(snap.collars); setSurvey(snap.survey); setLayers(snap.layers);
    setAssays(snap.assays); setAssayElements(snap.assayElements); setCustomLayers(snap.customLayers);
    setLayoutElements(snap.layoutElements); setSections(snap.sections); setSectionGroups(snap.sectionGroups || []); setBoundaries(snap.boundaries); setOmfObjects(snap.omfObjects || []);
    setLayerGroups(snap.layerGroups);
    setExcludedIntercepts(snap.excludedIntercepts); setSoftIntercepts(snap.softIntercepts);
    setPlannedHoles(snap.plannedHoles || []);
    setSurfaceSamples(snap.surfaceSamples || []); setSurfaceElements(snap.surfaceElements || []);
    // React batches these, but the flag needs to survive until AFTER the effect above re-runs on the
    // new state — a plain synchronous reset here would race it. A setTimeout(0) micro-delay lets
    // this render's effects flush first.
    setTimeout(() => { undoApplying.current = false; }, 0);
  }, []);

  const undo = useCallback(() => {
    if (undoDebounceTimer.current) { clearTimeout(undoDebounceTimer.current); undoDebounceTimer.current = null; }
    // A burst still "in flight" (mid-drag, say) counts as the thing to undo first — commit it as a
    // step rather than silently discarding it.
    if (undoBeforeBurst.current) { undoPast.current.push(undoBeforeBurst.current); undoBeforeBurst.current = null; }
    if (!undoPast.current.length) return;
    const prev = undoPast.current.pop();
    undoFuture.current.push(undoSnapshotRef.current());
    applySnapshot(prev);
    setUndoCount(undoPast.current.length);
    setRedoCount(undoFuture.current.length);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    if (!undoFuture.current.length) return;
    const next = undoFuture.current.pop();
    undoPast.current.push(undoSnapshotRef.current());
    applySnapshot(next);
    setUndoCount(undoPast.current.length);
    setRedoCount(undoFuture.current.length);
  }, [applySnapshot]);

  const clearUndoHistory = useCallback(() => {
    undoPast.current = []; undoFuture.current = []; undoBeforeBurst.current = null;
    if (undoDebounceTimer.current) { clearTimeout(undoDebounceTimer.current); undoDebounceTimer.current = null; }
    setUndoCount(0); setRedoCount(0);
  }, []);

  // TASKS.csv #69 — layout page management (add/switch/rename/delete). Defined here rather than
  // alongside layoutPages/layoutElements above because these call clearUndoHistory, which needs to
  // already exist — see that state's own comment further up for why. Every switch clears undo history
  // (undo is scoped to whichever page is active — see undoSnapshot's own comment), same reasoning as
  // switchToTab already applies to workspace tabs.
  const switchLayoutPage = useCallback((pageId) => {
    setActiveLayoutPageId(pageId);
    clearUndoHistory();
  }, [clearUndoHistory]);
  const addLayoutPage = useCallback((name) => {
    const id = `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setLayoutPages((p) => [...p, { id, name: name || `Page ${p.length + 1}`, elements: DEFAULT_LAYOUT_ELEMENTS }]);
    setActiveLayoutPageId(id);
    clearUndoHistory();
    return id;
  }, [clearUndoHistory]);
  const renameLayoutPage = useCallback((id, name) => setLayoutPages((p) => p.map((pg) => (pg.id === id ? { ...pg, name } : pg))), []);
  // TASKS.csv #130 — Atlas (batch page generation, one page per drillhole/section). Deliberately a
  // separate bulk method rather than N calls to addLayoutPage(): that always seeds DEFAULT_LAYOUT_
  // ELEMENTS (wrong — atlas pages carry their own generated `elements`) and switches the active page +
  // clears undo history on every single call, which for N pages would mean N wasted undo-history
  // clears and end with an arbitrary LAST generated page active rather than a deliberate choice.
  // Switches to the FIRST newly-created page once, clears undo history once, same as any other
  // page-navigating action.
  const addLayoutPages = useCallback((pages) => {
    if (!pages || !pages.length) return [];
    const withIds = pages.map((pg, i) => ({ id: `page_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`, name: pg.name, elements: pg.elements }));
    setLayoutPages((p) => [...p, ...withIds]);
    setActiveLayoutPageId(withIds[0].id);
    clearUndoHistory();
    return withIds.map((p) => p.id);
  }, [clearUndoHistory]);
  // Closing the last page is treated as resetting to one fresh blank page rather than leaving zero —
  // same reasoning as closeWorkspaceTab's "last tab closed" branch above.
  const deleteLayoutPage = useCallback((id) => {
    setLayoutPages((pages) => {
      const remaining = pages.filter((p) => p.id !== id);
      if (!remaining.length) {
        const freshId = `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        if (id === activeLayoutPageId) { setActiveLayoutPageId(freshId); clearUndoHistory(); }
        return [{ id: freshId, name: "Page 1", elements: DEFAULT_LAYOUT_ELEMENTS }];
      }
      if (id === activeLayoutPageId) { setActiveLayoutPageId(remaining[0].id); clearUndoHistory(); }
      return remaining;
    });
  }, [activeLayoutPageId, clearUndoHistory]);

  const value = {
    project, setEpsg, setProjectName,
    collars, setCollars,
    survey, setSurvey,
    layers, setLayers, mergeLayer, replaceLayer,
    assays, setAssays,
    assayElements, setAssayElements,
    surfaceSamples, setSurfaceSamples,
    surfaceElements, setSurfaceElements,
    customLayers, setCustomLayers,
    dbConnections, setDbConnections,
    liveDbConnections, connectDb, disconnectDb,
    excludedIntercepts, setExcludedIntercepts, toggleExcludedIntercept,
    softIntercepts, setSoftIntercepts, toggleSoftIntercept,
    sections, setSections, upsertSection, renameSection, deleteSection, setSectionContacts, updateSections, renameSectionsBulk,
    sectionGroups, addSectionGroup, deleteSectionGroup, deleteAllSections,
    viewerUiState, setViewerUiState, viewerUiStateSeq,
    gridBoundViewportId, setGridBoundViewportId, gridMeters, setGridMeters,
    lastCamState, setLastCamState,
    pendingLayoutImages, addLayoutImage, consumeLayoutImage,
    requestedModule, moduleRequestSeq, goToModule,
    themes, addTheme, updateTheme, renameTheme, deleteTheme,
    rasters, addRaster, updateRaster, removeRaster,
    boundaries, addBoundary, updateBoundary, removeBoundary,
    fieldStructuralRefs, addFieldRef, removeFieldRef,
    omfObjects, addOmfObject, updateOmfObject, removeOmfObject,
    terrain, addTerrain, updateTerrain, removeTerrain,
    geophysPtsStops, setGeophysPtsStops, geophysPtsColorMode, setGeophysPtsColorMode,
    geophysPtsMin, setGeophysPtsMin, geophysPtsMax, setGeophysPtsMax,
    voxelModels, addVoxelModel, updateVoxelModel, removeVoxelModel,
    voxelCellBudget, setVoxelCellBudget,
    plannedHoles, addPlannedHole, updatePlannedHole, removePlannedHole,
    layerGroups, addLayerGroup, renameLayerGroup, deleteLayerGroup, toggleLayerGroupCollapsed, setLayerGroupFor,
    layoutElements, setLayoutElements,
    layoutPages, activeLayoutPageId, switchLayoutPage, addLayoutPage, addLayoutPages, renameLayoutPage, deleteLayoutPage,
    layoutTemplates, addLayoutTemplate, renameLayoutTemplate, deleteLayoutTemplate,
    viewportRenderRequest, viewportRenderRequestSeq, requestViewportRender, viewportPendingRequest,
    viewportRenderResult, viewportRenderResultSeq, resolveViewportRender,
    layoutSelectRequest, setLayoutSelectRequest,
    newProject, saveProject, openProject,
    workspaceTabs, activeTabId, activeTabDirty, switchToTab, newWorkspaceTab, closeWorkspaceTab,
    checkAutosave, restoreAutosave, discardAutosave,
    undo, redo, canUndo: undoCount > 0, canRedo: redoCount > 0,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
