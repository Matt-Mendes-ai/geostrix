import React, { useRef, useEffect, useState, useCallback, useMemo, Suspense } from "react";
import * as THREE from "three";
import Papa from "papaparse";
import { Upload, Scissors, RotateCcw, RefreshCw, Eye, EyeOff, Trash2, ListFilter, Maximize2, Database, Camera, Grid3x3, Bookmark, BookmarkPlus, Pencil, X, Layers3, ChevronUp, ChevronDown, ShieldAlert, GitFork, Milestone, Map as MapIcon, Mountain, Image, FileBarChart2, Settings2, Box, Waypoints, Triangle, MapPin, ArrowUpRight, Shapes, Ruler, TerminalSquare, Beaker } from "lucide-react";
import AssayStyleModal from "../components/AssayStyleModal.jsx";
import GradeEstimationModal from "../components/GradeEstimationModal.jsx";
import LocatorMap from "../components/LocatorMap.jsx";
import BasemapView from "../components/BasemapView.jsx";
import PromptModal from "../components/PromptModal.jsx";
import { toLonLat, reprojectXY, guessEpsgFromPrjWkt } from "../lib/reproject.js";
import { useStore, useSetCursor } from "../lib/store.jsx";
import { desurveyHole } from "../lib/desurvey.js";
import { openSectionWindow, pythonImplicitModel, saveFile } from "../lib/desktop.js";
import { buildShapefileZip, parseShapefileZip, parseShapefileParts, shapefileFeaturesToRows } from "../lib/shapefile.js";
import { buildGeoPackage, parseGeoPackage, gpkgFeaturesToRows } from "../lib/gpkg.js";
import { buildDXF } from "../lib/dxf.js";
import { pointInBoundary } from "../lib/geoprocessing.js";
import AttributeTableModal from "../components/AttributeTableModal.jsx";
import { createCompassRose } from "../components/CompassRose.js";
import { createAxisGizmo } from "../components/AxisGizmo.js";
import HoverToolInfo from "../components/HoverToolInfo.jsx";
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";
import PanelSplitHandle from "../components/PanelSplitHandle.jsx";
import { useBrowserPanelHeight } from "../lib/useBrowserPanelHeight.js";
import DbBrowserPanel from "../components/DbBrowserPanel.jsx";
import ImportMappingModal from "../components/ImportMappingModal.jsx";
import DatabaseConnectModal from "../components/DatabaseConnectModal.jsx";
import LayerInspector from "../components/LayerInspector.jsx";
import DataQCModal from "../components/DataQCModal.jsx";
// TASKS.csv #224 (software-design-specialist audit finding: sql.js's 658KB wasm was the single
// strongest lazy-loading candidate) — SQLWorkspaceModal statically imports sqlWorkspace.js, which
// statically imports sql.js, so a plain top-level import here pulled that wasm in on every app launch
// regardless of whether SQL workspace is ever opened. React.lazy defers the whole chain until the
// modal is actually rendered (see the Suspense wrapper at its render site below).
const SQLWorkspaceModal = React.lazy(() => import("../components/SQLWorkspaceModal.jsx"));
import BoundaryInterceptsModal from "../components/BoundaryInterceptsModal.jsx";
import StripLog from "../components/StripLog.jsx";
import StereonetModal from "../components/StereonetModal.jsx";
import {
  LAYER_META, TARGET_SCHEMAS, guessColumn, guessTarget, getCol, EPSG_COL_ALIASES,
  colorForLithology, colorForAlteration, colorForVein, colorForMineral, colorForStructure,
  rqdColor, magColor, hashColor, UNIT_NAMES, distinctValues, minMax, colorForVoxelValue, makeVoxelColorResolverRGB,
  colorForMedium,
} from "../lib/layers.js";
import { computeMeshVolume, computeTonnage } from "../lib/volumetrics.js";
import { exportSurfaceOBJ, exportSurfaceDXF, exportSurfaceGLTF } from "../lib/meshExport.js";

const toRad = (d) => (d * Math.PI) / 180;

// TASKS.csv #188 — bug caught during verification (hand-checked a planned hole's rendered toe
// position against its azimuth/dip/length and found it pointing UP instead of down): desurveyHole
// (src/lib/desurvey.js) internally expects dip as POSITIVE-below-horizontal (verified directly:
// dip=+60 on a real sample_data collar drops elevation by the expected amount over its length,
// dip=-60 RAISES it) — but real collar/survey CSV IMPORTS (commitImportData's `flipDip`, further
// down this file) negate the user's raw CSV value on the way in specifically because CSVs
// conventionally use NEGATIVE-below-horizontal (see sample_data/collars.csv: -60, -65, -70 for
// genuinely downward holes, and dataQC.js's own "this app's convention: negative = down" comment,
// which describes that external/CSV-facing convention). Planned holes have no import step to do
// that flip for them — a user typing "-60" into the Targeting form (the natural, CSV-matching way
// to describe a hole angled 60° below horizontal) would otherwise get a hole that plots pointing up.
// Rather than storing plannedHoles.dip in the internal (positive-down) convention and translating at
// every UI touchpoint (the add form, the row display, the row's inline edit — three places to get
// right and re-verify), this keeps plannedHoles.dip in the SAME natural convention the user types/
// sees/exports everywhere (matching real collars.csv), and negates it at the ONE place it actually
// needs the internal convention: right before handing off to desurveyHole. Module-level (not inside
// ViewerModule) since PlannedHoleRow, a separate top-level component below, needs it too — all three
// desurveyHole call sites for planned holes (the CSV export, the 3D render effect, and the row's toe
// display) go through this one function, so there's exactly one place this conversion could go wrong.
function plannedHoleTrace(hole) {
  return desurveyHole({ ...hole, dip: -hole.dip }, []);
}

// interpolate a position on a desurveyed polyline at a given MD
// Same interpolation as findOnTrace below, but over a trace's ABSOLUTE world coordinate arrays
// (t.wx/t.wy/t.wz, parallel to t.pts) instead of scene-local ones — used by the new "Export
// Shapefile" vector export (TASKS.csv, user request), which needs real-world coordinates, not the
// origin-relative scene positions everything else in this file works in.
function findOnTraceWorld(t, md) {
  const pts = t.pts;
  if (!pts.length) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    if (md >= pts[i].md - 0.01 && md <= pts[i + 1].md + 0.01) {
      const span = pts[i + 1].md - pts[i].md, frac = span <= 0 ? 0 : (md - pts[i].md) / span;
      return [
        t.wx[i] + (t.wx[i + 1] - t.wx[i]) * frac,
        t.wy[i] + (t.wy[i + 1] - t.wy[i]) * frac,
        t.wz[i] + (t.wz[i + 1] - t.wz[i]) * frac,
      ];
    }
  }
  const idx = md <= pts[0].md ? 0 : pts.length - 1;
  return [t.wx[idx], t.wy[idx], t.wz[idx]];
}
function stripInternalFields(r) { return Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("_"))); }
// Chunked base64 encode — String.fromCharCode.apply blows the call stack on large arrays if done in
// one shot, so this feeds it in 32K-byte slices. Used to hand shapefile.js's binary zip output to
// desktop.js's saveFile({ encoding: "base64" }) path.
function uint8ToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function findOnTrace(pts, md) {
  if (!pts.length) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    if (md >= pts[i].md - 0.01 && md <= pts[i + 1].md + 0.01) {
      const span = pts[i + 1].md - pts[i].md, t = span <= 0 ? 0 : (md - pts[i].md) / span;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t, z: pts[i].z + (pts[i + 1].z - pts[i].z) * t };
    }
  }
  const edge = md <= pts[0].md ? pts[0] : pts[pts.length - 1];
  return { x: edge.x, y: edge.y, z: edge.z };
}

// TASKS.csv #84 — geological architecture layer 3. A "boundary intercept" is just an existing litho/alt
// interval's top (`from`), which is the same row #29/#55's implicit-modelling tools already read as an
// interface point — this doesn't introduce a separate stored table, it gives that same row a stable id
// so the user's decision to review/exclude it as a control point can be remembered (in
// store.jsx's excludedIntercepts) without duplicating the interval data itself. Deliberately keyed off
// from/value rather than an array index, since layers.litho/layers.alt can be re-filtered/re-ordered by
// import/removal without changing which physical intercept a row represents.
function interceptId(layerKey, row) {
  return `${layerKey}:${row.hole_id}:${row.from}:${row.value}`;
}
// TASKS.csv #88 — nugget value sent for a point marked "soft" in the Boundary intercepts table. GemPy's
// own default is ~2e-5 (verified directly against the installed package — effectively "pass through
// exactly"); 0.5 is a deliberately loose starting tolerance so the difference is visually obvious on a
// first try rather than needing to be tuned before it does anything.
const SOFT_NUGGET = 0.5;
// TASKS.csv — bug report: "surfaces wrapping around itself" on properties with a large hole-to-hole
// spread. Cause: the modelling extent used to pad 15% of the drillhole trace SPAN on every axis with
// no ceiling, so on a property where holes are spread over kilometers, GemPy was asked to extrapolate
// its implicit potential field hundreds of meters to kilometers past any real data — far enough that
// the field can fold back on itself and produce a spurious closed/self-wrapping surface, a known
// implicit-modelling artifact once you're extrapolating rather than interpolating (see #91's own note
// on that distinction, still Planned). Capping padding to a fixed ceiling bounds how far past the
// actual drillhole data any surface is asked to extend, regardless of how spread out the property is.
const MODEL_EXTENT_PAD_M = 500;

// TASKS.csv #208 — generic "extra fields" plumbing, designed once and reused by every row-builder
// below (and by the collars/survey/custom branches of commitImportData directly) rather than a
// one-off special case just for litho's new `description` field. customFields is an array of
// {column, name} pairs the user maps in ImportMappingModal — each maps an arbitrary source column
// into an arbitrarily-named field on the imported row, carried straight through to the attribute
// table (AttributeTableModal already derives its columns from Object.keys() of whatever a row
// actually has, so this needs zero changes there) and hover tooltips (added explicitly below, since
// those use fixed string templates rather than iterating keys).
// TASKS.csv #213 — user request: "other software will let the user assign a data type to the added
// column eg. text, number, category, etc." `type` (added alongside column/name in ImportMappingModal)
// controls how the raw CSV value is coerced: "number" parses it so the field behaves like any other
// numeric layer value (filterable/sortable), "category" trims it to a clean string for a coded value
// expected to match consistently, "text" (the default, and the ONLY behavior before this fix) keeps
// it exactly as Papa Parse read it, unchanged, for full backward compatibility with any code path that
// still passes {column, name} pairs with no type at all.
function applyCustomFields(row, r, customFields) {
  if (!customFields || !customFields.length) return row;
  customFields.forEach(({ column, name, type }) => {
    if (!column || !name) return;
    const raw = r[column];
    row[name] = type === "number" ? (raw === "" || raw == null ? null : Number(raw))
      : type === "category" ? String(raw ?? "").trim()
      : raw;
  });
  return row;
}
function normInterval(r, mapping, customFields) {
  return applyCustomFields({
    hole_id: String(r[mapping.hole_id] ?? "").trim(),
    from: Number(r[mapping.from]),
    to: Number(r[mapping.to]),
    value: String(r[mapping.value] ?? "Unknown").trim(),
    extra: mapping.extra ? Number(r[mapping.extra]) : undefined,
    description: mapping.description ? (String(r[mapping.description] ?? "").trim() || undefined) : undefined,
  }, r, customFields);
}
function normNumericInterval(r, mapping, customFields) {
  return applyCustomFields({
    hole_id: String(r[mapping.hole_id] ?? "").trim(),
    from: Number(r[mapping.from]),
    to: Number(r[mapping.to]),
    value: Number(r[mapping.value]),
  }, r, customFields);
}
function normStructure(r, mapping, customFields) {
  return applyCustomFields({
    hole_id: String(r[mapping.hole_id] ?? "").trim(),
    depth: Number(r[mapping.depth]),
    value: String(r[mapping.value] ?? "").trim(),
    dip: mapping.dip ? Number(r[mapping.dip]) : undefined,
    azimuth: mapping.azimuth ? Number(r[mapping.azimuth]) : undefined,
  }, r, customFields);
}
function normCollar(r) {
  return {
    hole_id: String(getCol(r, ["hole_id", "holeid", "hole", "bhid"]) ?? "").trim(),
    x: Number(getCol(r, ["x", "easting", "east"])), y: Number(getCol(r, ["y", "northing", "north"])), z: Number(getCol(r, ["z", "elevation", "elev"])),
    azimuth: undefined, dip: undefined, length: undefined,
  };
}
function normSurvey(r) {
  return { hole_id: String(getCol(r, ["hole_id", "holeid", "hole", "bhid"]) ?? "").trim(), depth: Number(getCol(r, ["depth", "at", "md", "station"])), azimuth: Number(getCol(r, ["azimuth", "azi", "az"])), dip: Number(getCol(r, ["dip", "inclination", "incl"])) };
}
function parseCSV(file, onDone) {
  Papa.parse(file, { header: true, dynamicTyping: true, skipEmptyLines: true, complete: (res) => onDone(res.data, null), error: (err) => onDone(null, err.message) });
}
// TASKS.csv #190/#191 — user request: "let's do those 3" (shapefile import, GeoPackage export,
// GeoPackage import). Both new import formats get converted to the exact same flat-row-array shape
// Papa.parse already produces for a CSV (via shapefileFeaturesToRows/gpkgFeaturesToRows), so every
// existing CSV-shaped import consumer (openImportModal below, and GeophysicsModule's block-model
// import) can accept a shapefile .zip or a .gpkg with no format-specific logic beyond this one
// dispatch point — extension decides which parser runs, everything downstream is unchanged.
// onDone(rows, errorMessage, meta) — meta.note is an optional extra string (multi-layer/skipped-
// feature caveats) the caller should fold into its own notice rather than silently dropping.
function parseVectorFile(file, onDone) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".gpkg")) {
    file.arrayBuffer().then((buf) => parseGeoPackage(buf)).then(({ layers }) => {
      const usable = layers.filter((l) => l.features.length);
      if (!usable.length) { onDone(null, "No usable point/line features found in this GeoPackage."); return; }
      const layer = usable[0];
      const { rows, headers } = gpkgFeaturesToRows(layer);
      let note = "";
      if (usable.length > 1) note += ` Only the first of ${usable.length} feature tables in this file ("${layer.name}") was imported — drop it again to bring in another one.`;
      if (layer.skippedCount) note += ` ${layer.skippedCount} feature(s) with an unsupported/empty geometry were skipped.`;
      // TASKS.csv #223 — GeoPackage already read its own SRS registry properly (gpkg_spatial_ref_sys,
      // a structured field, more reliable than shapefile's .prj WKT-name-sniffing above) but never
      // surfaced it as a Source CRS suggestion — same fix, same "only ever suggests" caveat.
      const detectedEpsg = layer.epsg ? Number(layer.epsg) : null;
      if (detectedEpsg) note += ` Detected source CRS EPSG:${detectedEpsg} from this GeoPackage's own SRS registry — pre-filled below, double-check it's correct.`;
      onDone(rows, null, { headers, note, detectedEpsg });
    }).catch((err) => onDone(null, err.message));
    return;
  }
  if (name.endsWith(".zip") || name.endsWith(".shp")) {
    const reader = name.endsWith(".zip")
      ? file.arrayBuffer().then((buf) => parseShapefileZip(buf))
      : file.arrayBuffer().then((buf) => parseShapefileParts({ shp: new Uint8Array(buf) }));
    reader.then((parsed) => {
      const { rows, headers } = shapefileFeaturesToRows(parsed);
      let note = "";
      if (parsed.otherBaseNames) note += ` This .zip bundles ${parsed.otherBaseNames + 1} separate shapefiles — only the first was imported.`;
      if (parsed.skippedCount) note += ` ${parsed.skippedCount} feature(s) with an unsupported shape type were skipped.`;
      if (parsed.hasAttributes === false) note += " No .dbf attribute table was found alongside the .shp — only coordinates came through.";
      // TASKS.csv #223 — read the .prj sidecar's declared CRS instead of silently ignoring it. Only
      // ever SUGGESTS a Source CRS for the user to confirm (prefills the import modal's field, doesn't
      // reproject unasked) — guessEpsgFromPrjWkt returns null for anything it can't confidently
      // recognize, so an unmatched .prj falls through to exactly today's behavior (ask the user).
      let detectedEpsg = null;
      if (parsed.prjWkt) {
        detectedEpsg = guessEpsgFromPrjWkt(parsed.prjWkt);
        note += detectedEpsg
          ? ` Detected source CRS EPSG:${detectedEpsg} from the bundled .prj file — pre-filled below, double-check it's correct.`
          : " This shapefile includes a .prj file, but its CRS wasn't one GeoStrix recognizes automatically — set Source CRS manually below if it's not already in the project's EPSG.";
      }
      onDone(rows, null, { headers, note, detectedEpsg });
    }).catch((err) => onDone(null, err.message));
    return;
  }
  parseCSV(file, (data, err) => onDone(data, err, { headers: data && data.length ? Object.keys(data[0]) : [], note: "" }));
}
function looksLikeAssay(headers) {
  const ELEMENTS = new Set(["Ag","Al","As","Au","Ba","Be","Bi","Ca","Cd","Co","Cr","Cu","Fe","Ga","K","La","Mg","Mn","Mo","Na","Ni","P","Pb","S","Sb","Sc","Sr","Th","Ti","Tl","U","V","W","Zn","Zr","Nb","Y","Yb"]);
  const count = headers.filter((h) => ELEMENTS.has(h.trim())).length;
  return count >= 4;
}

const DEFAULT_LAYER_VISIBLE = { litho: true, alt: false, vein: false, geotech: false, recovery: false, sg: false, mnlgy: false, magsusc: false, structure: false, litho_gc: false, alt_gc: false, geophys_pts: true, surface_samples: true };
// TASKS.csv #76 — every sidebar layer key that can be sorted into a named group, same set the
// generic upload loop + geophys_pts special case used to enumerate separately.
// TASKS.csv #137 added recovery/sg — same interval-kind layers as geotech, just different fields.
const ALL_LAYER_KEYS = ["litho", "alt", "vein", "mnlgy", "geotech", "recovery", "sg", "magsusc", "structure", "litho_gc", "alt_gc", "geophys_pts"];
const DEFAULT_GRID = { visible: true, mode: "ground", size: 1000, divisions: 20, color: "#30394a" };
// Multi-element assay display — a fixed, distinct-hue-per-slot palette (not a value-driven gradient
// like magColor) so simultaneously-shown elements stay visually distinguishable from each other; each
// element's OWN value still modulates marker size within its own min/max range (see the marker-
// building loop below). Cycles if more than 8 elements are ever toggled on at once.
const ASSAY_ELEMENT_COLORS = ["#e05a4a", "#4a9be0", "#e2a63c", "#2fae6b", "#b47ee0", "#e0708f", "#2ab5b0", "#a97c3f"];

// User request: "change the assay legend — change colour, size, recategorize, ignore values lower
// than". `style` is one entry of the assayStyle state (or undefined for "never customized" — every
// helper below falls back to the original fixed-hue/continuous-size behavior in that case, so a
// project with no styling set up looks and behaves exactly as before this feature existed).
//
// assayColorFor: with style.breaks set (a "recategorized"/graduated element), color comes from the
// first break whose `max` the value is <= — i.e. breaks act like class upper bounds, same convention
// as a QGIS graduated-symbol renderer. A value above every break's max still gets a color (the last
// break's, rather than falling through to nothing) since an unclassified high outlier disappearing
// from the view would be a worse surprise than it being lumped into the top class.
function assayColorFor(value, idx, style) {
  if (style?.breaks?.length) {
    const sorted = style.breaks; // stored pre-sorted by max — see AssayStyleModal
    const hit = sorted.find((b) => value <= b.max);
    return (hit || sorted[sorted.length - 1]).color;
  }
  return style?.color || ASSAY_ELEMENT_COLORS[idx % ASSAY_ELEMENT_COLORS.length];
}
// assaySizeFor: same continuous min/max normalization as the original hardcoded 1.2–3.8 range, just
// scaled by style.sizeMult (default 1) so "change the size" has an effect without changing what the
// size differences MEAN (still "bigger sphere = higher grade within this element's own range").
function assaySizeFor(value, min, max, style) {
  const mult = style?.sizeMult ?? 1;
  return (1.2 + 2.6 * (max > min ? (value - min) / (max - min) : 0.3)) * mult;
}
// assayPassesCutoff: "ignore values lower than X" — a value strictly below minCutoff is dropped
// entirely (not just recolored/shrunk), matching how a geologist would actually want a screening
// cutoff to behave for a 3D view (decluttering below-threshold noise), not just visually de-emphasized.
function assayPassesCutoff(value, style) {
  return style?.minCutoff == null || value >= style.minCutoff;
}

// Builds the grid display object(s) into a fresh THREE.Group from scratch — called whenever
// gridConfig changes. "ground" is the original flat XZ grid; "3d" adds two vertical wall grids
// (rotated copies of the same GridHelper) forming an open corner/box, similar to the reference
// grid frame in implicit-modelling tools — useful for judging depth/extent, not just plan position.
function buildGridGroup(config) {
  const group = new THREE.Group(); group.name = "gridHelpers";
  if (!config.visible) return group;
  const size = Math.max(1, config.size) || 1000;
  const divisions = Math.max(1, Math.round(config.divisions) || 20);
  const color = new THREE.Color(config.color || "#30394a");
  const mkGrid = () => new THREE.GridHelper(size, divisions, color, color);
  group.add(mkGrid()); // ground plane (XZ, y=0) — same as the original always-on grid
  if (config.mode === "3d") {
    const back = mkGrid(); // rotate XZ -> XY, forms the "north" wall
    back.rotation.x = Math.PI / 2;
    back.position.set(0, size / 2, -size / 2);
    group.add(back);
    const side = mkGrid(); // rotate XZ -> ZY, forms the "west" wall
    side.rotation.z = Math.PI / 2;
    side.position.set(-size / 2, size / 2, 0);
    group.add(side);
  }
  return group;
}
function disposeThreeGroup(group) {
  group.traverse((obj) => { obj.geometry?.dispose?.(); obj.material?.dispose?.(); });
}

// TASKS.csv #83 — geological-architecture layer 2 (surface/domain semantics). What a generated
// implicit surface (#29/#30/#55/#61) actually IS geologically, and how it relates to other surfaces —
// the vocabulary from the user's design doc, not exhaustive but covering the relationships/types they
// specifically named. This is metadata only for now: declaring "C must not cross D" doesn't yet
// enforce or check anything (that's #88 constraints / #90 topology validation, both still Planned and
// explicitly listed as depending on this layer existing first) — it's captured so those later passes
// have something to read.
const SURFACE_TYPES = [
  { key: "stratigraphic_contact", label: "Stratigraphic contact" },
  { key: "fault", label: "Fault" },
  { key: "mineralization_envelope", label: "Mineralization envelope" },
  { key: "alteration_envelope", label: "Alteration envelope" },
  { key: "unconformity", label: "Unconformity (erosional)" },
  { key: "intrusive_contact", label: "Intrusive contact" },
  { key: "other", label: "Other" },
];
const RELATION_TYPES = [
  { key: "below", label: "is below" },
  { key: "above", label: "is above" },
  { key: "within", label: "is within (between)" },
  { key: "truncates", label: "truncates" },
  { key: "terminates_against", label: "terminates against" },
  { key: "cuts", label: "is cut by" },
  { key: "must_not_cross", label: "must not cross" },
];
// A rough starting guess at a new surface's type from the tool/name that created it — the user can
// always override it via the dropdown next to each surface in the Modeling tab's list. Structural
// picks are the ambiguous case (a "structure" layer covers contacts, faults, shear zones, foliation,
// veins all under one layer type — see sample_data's own structure.csv) — a fault/shear-sounding
// value guesses "fault", everything else falls back to "other" rather than guessing wrong.
function guessSurfaceType(label, meshName) {
  const s = `${label} ${meshName}`.toUpperCase();
  if (s.startsWith("TOP OF") || s.includes("STRATIGRAPHIC")) return "stratigraphic_contact";
  if (s.includes("ALTERATION:")) return "alteration_envelope";
  if (s.includes("STRUCTURE:")) {
    if (/FLT|FAULT|SHR|SHEAR/.test(s)) return "fault";
    return "other";
  }
  return "other";
}

// TASKS.csv #89 — faults as first-class objects that PARTITION the modelling domain, so an
// interpolation run never averages control points from opposite sides of a fault into one
// unrealistic surface. A fault surface (any implicitSurfaces entry with type "fault" — #83) is
// treated as a real dividing surface, not just a plane: classifies a query point's side by finding
// the NEAREST vertex on the fault's already-built three.js mesh and taking the sign of the dot
// product between (point - nearestVertex) and that vertex's normal (computeVertexNormals() already
// runs when the mesh is built in runSurfaceStack, so normals are ready to use here). Brute-force
// nearest-vertex search, not a spatial index — fault meshes are a few thousand vertices at most
// (36^3 GemPy resolution) and this only runs once per control point when a domain-scoped modelling
// tool is actually invoked, not on every frame.
function classifyPointAgainstFault(point, faultMesh) {
  const geo = faultMesh?.geometry;
  const pos = geo?.attributes?.position, norm = geo?.attributes?.normal;
  // Bug-hunt pass: this used to return 1 ("side A") here, which silently classified every point as
  // side A instead of "fail open" — a domain constraint checking for side B would then wrongly exclude
  // ALL data whenever a fault mesh happened to be missing normals, contradicting the documented
  // fail-open contract (matches pointInDomain's own handling of a missing mesh entirely). Returning
  // null and having pointInDomain treat null as "can't classify, don't exclude" makes the two
  // defensive branches actually agree.
  if (!pos || !norm) return null;
  let bestD2 = Infinity, bestIdx = 0;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - point.x, dy = pos.getY(i) - point.y, dz = pos.getZ(i) - point.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
  }
  const dot = (point.x - pos.getX(bestIdx)) * norm.getX(bestIdx) + (point.y - pos.getY(bestIdx)) * norm.getY(bestIdx) + (point.z - pos.getZ(bestIdx)) * norm.getZ(bestIdx);
  return dot >= 0 ? 1 : -1;
}
// A domain is an AND of fault-side constraints: [{faultId, side: 1 | -1}, ...] — a point belongs to
// the domain only if it's on the declared side of EVERY constraint (supports the "domain bounded by
// two faults" case the user's design doc mentions, not just a single fault splitting the property in
// two). `meshesRef` is implicitMeshesRef.current — passed explicitly rather than closed over so this
// stays a plain function usable from anywhere, not tied to component render scope.
function pointInDomain(point, domain, meshesRef) {
  if (!domain || !domain.constraints?.length) return true; // no constraints = unconstrained ("whole property")
  return domain.constraints.every((c) => {
    const mesh = meshesRef[c.faultId];
    if (!mesh) return true; // referenced fault surface was removed — don't silently exclude everything
    const side = classifyPointAgainstFault(point, mesh);
    if (side == null) return true; // couldn't classify (e.g. mesh missing normals) — fail open, not side A
    return side === c.side;
  });
}

// TASKS.csv #85 — geological architecture layer 4 (spatial-distribution-aware search, not just
// nearest-N). GemPy's implicit potential-field fit is a GLOBAL model, not per-query local kriging, so
// there's no honest way to give it a true "search ellipsoid used at every interpolation query" the way
// a classic kriging engine would use one — that would mean bypassing GemPy's own interpolator entirely,
// out of scope here. What this DOES give the user real control over: which control points are trusted
// enough to feed the run at all. A point with fewer than `minSamples` neighbors within an ellipsoid
// oriented along the structural trend (azimuth/dip of the ellipsoid's long axis) is isolated relative
// to that trend and gets excluded before the run, rather than silently averaged in alongside well-
// supported points — the ellipsoid's orientation is shared with #86's anisotropy input per this entry's
// own note ("usually the same structural trend, worth sharing one input").
// Builds an orthonormal (major, semi-major, minor) basis in (east, north, up) — the same axis order the
// sidecar's API already uses (see sceneToApi) — from a single azimuth/dip pair: major = the dip-
// direction vector itself, semi-major = the horizontal strike direction (perpendicular to major within
// the horizontal plane), minor = whatever's left (their cross product) — a full 3D orientation from
// just two angles, not three, matching how the rest of this app already only ever asks for dip/azimuth.
function searchEllipsoidBasis(azimuth, dip) {
  const az = toRad(azimuth), dp = toRad(dip);
  const major = { x: Math.sin(az) * Math.cos(dp), y: Math.cos(az) * Math.cos(dp), z: -Math.sin(dp) };
  const semiMajor = { x: Math.cos(az), y: -Math.sin(az), z: 0 };
  const minor = {
    x: major.y * semiMajor.z - major.z * semiMajor.y,
    y: major.z * semiMajor.x - major.x * semiMajor.z,
    z: major.x * semiMajor.y - major.y * semiMajor.x,
  };
  return { major, semiMajor, minor };
}
// Squared normalized anisotropic distance — <= 1 means "inside the ellipsoid". `apiA`/`apiB` are both
// (east, north, up) points (the sidecar's coordinate convention, i.e. already sceneToApi'd).
function searchEllipsoidDistSq(apiA, apiB, basis, ranges) {
  const de = apiB.x - apiA.x, dn = apiB.y - apiA.y, du = apiB.z - apiA.z;
  const p1 = de * basis.major.x + dn * basis.major.y + du * basis.major.z;
  const p2 = de * basis.semiMajor.x + dn * basis.semiMajor.y + du * basis.semiMajor.z;
  const p3 = de * basis.minor.x + dn * basis.minor.y + du * basis.minor.z;
  return (p1 / ranges.major) ** 2 + (p2 / ranges.semiMajor) ** 2 + (p3 / ranges.minor) ** 2;
}
// Filters a list of {x,y,z} api-space points down to only those with at least `minSamples` OTHER
// points inside their own search ellipsoid — O(n²) but n is a per-unit control-point count (tens to a
// few hundred), not the whole project, so this is cheap in practice.
function filterBySearchSupport(apiPoints, ellipsoid) {
  // TASKS.csv #217 — must return a COPY here, not apiPoints itself: callers do
  // `points.length = 0; points.push(...supportedPoints)`, and when supportedPoints
  // was the same reference as points, that truncation emptied the array before the
  // spread ever read it, silently zeroing out every point whenever the ellipsoid was off.
  if (!ellipsoid?.enabled) return [...apiPoints];
  const basis = searchEllipsoidBasis(ellipsoid.azimuth, ellipsoid.dip);
  return apiPoints.filter((p, i) => {
    let count = 0;
    for (let j = 0; j < apiPoints.length; j++) {
      if (i === j) continue;
      if (searchEllipsoidDistSq(p, apiPoints[j], basis, ellipsoid) <= 1) count++;
      if (count >= ellipsoid.minSamples) break;
    }
    return count >= ellipsoid.minSamples;
  });
}

// TASKS.csv #86 — geological architecture layer 5 (per-domain anisotropy). GemPy's own interpolator
// (and the RBF/kriging kernels underneath it) assume ISOTROPIC distance — a point 100m away "costs" the
// same regardless of direction. The standard geostatistical trick for getting genuinely anisotropic
// behavior out of an isotropic kernel, used here rather than reimplementing GemPy's math: warp every
// coordinate (both interface points AND orientation positions) into a "normalized" space where the
// declared ellipsoid becomes a sphere BEFORE sending them to the sidecar, then warp the returned mesh
// vertices back afterward (see runSurfaceStack). In the warped space, "close along the short axis, far
// along the long axis" becomes simply "close" or "far" uniformly — which is exactly what makes the
// isotropic kernel behave anisotropically once un-warped.
// Builds a uniform-volume-preserving scale per axis: isoScale (the geometric mean of the three ranges)
// is the "size" an isotropic ellipsoid of the same volume would have along every axis, so a perfectly
// isotropic input (major=semiMajor=minor) produces scale=1 on every axis (the identity warp, i.e. zero
// behavior change) rather than arbitrarily shrinking/inflating the whole model.
function anisoScales(ranges) {
  const isoScale = Math.cbrt(ranges.major * ranges.semiMajor * ranges.minor);
  return { major: isoScale / ranges.major, semiMajor: isoScale / ranges.semiMajor, minor: isoScale / ranges.minor };
}
// Affine warp of one (east,north,up) point: project the offset from `center` onto the ellipsoid's own
// orthonormal basis, scale each axis independently, then reconstruct in the original (east,north,up)
// frame using that same basis — a pure rotate-scale-rotate-back, no shear, so it's cleanly invertible by
// passing 1/scale for each axis (see unwarpFactor below).
function anisoWarpPoint(apiPt, center, basis, scales) {
  const dx = apiPt.x - center.x, dy = apiPt.y - center.y, dz = apiPt.z - center.z;
  const p1 = (dx * basis.major.x + dy * basis.major.y + dz * basis.major.z) * scales.major;
  const p2 = (dx * basis.semiMajor.x + dy * basis.semiMajor.y + dz * basis.semiMajor.z) * scales.semiMajor;
  const p3 = (dx * basis.minor.x + dy * basis.minor.y + dz * basis.minor.z) * scales.minor;
  // Spreads `apiPt` first so any extra fields riding along with a point (e.g. #88's per-point `nugget`
  // for a soft constraint) survive the warp/unwarp round-trip untouched — only x/y/z actually move.
  return {
    ...apiPt,
    x: center.x + p1 * basis.major.x + p2 * basis.semiMajor.x + p3 * basis.minor.x,
    y: center.y + p1 * basis.major.y + p2 * basis.semiMajor.y + p3 * basis.minor.y,
    z: center.z + p1 * basis.major.z + p2 * basis.semiMajor.z + p3 * basis.minor.z,
  };
}
const invScales = (scales) => ({ major: 1 / scales.major, semiMajor: 1 / scales.semiMajor, minor: 1 / scales.minor });
// Transforms an orientation's dip/azimuth by the SAME linear map (basis+scales, no translation) applied
// to the unit gradient direction, then renormalizes and converts back to dip/azimuth. This is the
// practical approximation used here rather than the mathematically exact inverse-transpose Jacobian a
// general (non-orthogonal-preserving) warp would need — exact for the common case this feature targets
// (a surface whose local tangent is close to the declared structural trend near its own control points,
// which is the entire premise of declaring one trend for the domain in the first place); worth a visual
// sanity-check against a known structure before trusting it on an unfamiliar one.
function anisoWarpDirection(dip, azimuth, basis, scales) {
  const dr = toRad(dip), ar = toRad(azimuth);
  const g = { x: Math.sin(dr) * Math.sin(ar), y: Math.sin(dr) * Math.cos(ar), z: Math.cos(dr) };
  const p1 = (g.x * basis.major.x + g.y * basis.major.y + g.z * basis.major.z) * scales.major;
  const p2 = (g.x * basis.semiMajor.x + g.y * basis.semiMajor.y + g.z * basis.semiMajor.z) * scales.semiMajor;
  const p3 = (g.x * basis.minor.x + g.y * basis.minor.y + g.z * basis.minor.z) * scales.minor;
  const wx = p1 * basis.major.x + p2 * basis.semiMajor.x + p3 * basis.minor.x;
  const wy = p1 * basis.major.y + p2 * basis.semiMajor.y + p3 * basis.minor.y;
  const wz = p1 * basis.major.z + p2 * basis.semiMajor.z + p3 * basis.minor.z;
  const len = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1;
  const nz = wz / len;
  const newDip = (Math.acos(Math.min(1, Math.max(-1, nz))) * 180) / Math.PI;
  let newAzimuth = (Math.atan2(wx / len, wy / len) * 180) / Math.PI;
  if (newAzimuth < 0) newAzimuth += 360;
  return { dip: newDip, azimuth: newAzimuth };
}

// TASKS.csv #77/#81 — bilinear-sample a terrain heightfield ({bbox,gridW,gridH,elevations}) at a
// real-world (x,y) point. Used both to build the terrain mesh itself (trivially — every mesh vertex
// IS a grid sample) and to drape a raster onto it (#81 — a raster's own footprint/resolution rarely
// lines up with the terrain grid, so each raster-mesh vertex needs an interpolated height at an
// arbitrary point, not just a nearest grid cell). Row 0 of `elevations` is the bbox's north/ymax edge
// (matching parseDEM's own row order, which matches image row order for a north-up GeoTIFF).
function sampleTerrainElevation(terrain, x, y) {
  const [xmin, ymin, xmax, ymax] = terrain.bbox;
  const { gridW, gridH, elevations } = terrain;
  const fx = gridW <= 1 ? 0 : ((x - xmin) / (xmax - xmin)) * (gridW - 1);
  const fy = gridH <= 1 ? 0 : ((ymax - y) / (ymax - ymin)) * (gridH - 1); // row 0 = north/ymax
  const cx = Math.min(gridW - 1, Math.max(0, fx));
  const cy = Math.min(gridH - 1, Math.max(0, fy));
  const x0 = Math.floor(cx), x1 = Math.min(gridW - 1, x0 + 1);
  const y0 = Math.floor(cy), y1 = Math.min(gridH - 1, y0 + 1);
  const tx = cx - x0, ty = cy - y0;
  const at = (xi, yi) => elevations[yi * gridW + xi];
  const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const bot = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return top * (1 - ty) + bot * ty;
}

// TASKS.csv #155 — "3D Modeling" is now its own top-level module (a peer of "3D View" in App.jsx's
// module bar) rather than a sub-tab nested inside the Viewer. Both are still this SAME component
// underneath — the 3D scene/camera/rendering machinery, and every piece of modelling state
// (implicitSurfaces, domains, search ellipsoid, etc.), all live here and would be a large, risky
// undertaking to duplicate into a truly separate component. `mode` just picks which sidebar content
// renders: "view" (collars/survey/layers/rasters — the former "Home" tab) or "modeling" (domains/
// surfaces/implicit-modelling tools — the former "Modeling" tab). App.jsx renders one or the other
// depending on which top-level tab is active, never both at once.
// TASKS.csv #225 — `visible` defaults to `true` deliberately: every existing call site (App.jsx, before
// this row's own fix lands there) doesn't pass it at all, so every behavior below is a pure no-op until
// App.jsx actually starts rendering ViewerModule as a single persistent instance and passing `false`
// while another tab is shown. See this row's own TASKS.csv notes for the staged rollout this follows.
export default function ViewerModule({ mode = "view", visible = true }) {
  const store = useStore();
  // TASKS.csv #226/#214 — cursor's own tiny context (see store.jsx's CursorProvider comment): this
  // component calls setCursor() on every pointermove but never actually reads the live cursor VALUE
  // anywhere in its own render output (only the status bar in App.jsx does), so subscribing here only
  // to the stable setter — never to CursorValueContext — means this, the single largest and most
  // render-expensive component in the app, is no longer forced to re-render on every mouse-move tick.
  const setCursor = useSetCursor();
  const {
    collars, setCollars, survey, setSurvey, layers, setLayers, replaceLayer, assays, assayElements,
    surfaceSamples, surfaceElements,
    plannedHoles, addPlannedHole, updatePlannedHole, removePlannedHole,
    customLayers: storeCustomLayers, setCustomLayers: setStoreCustomLayers,
    viewerUiState, setViewerUiState, viewerUiStateSeq,
    lastCamState, setLastCamState,
    addLayoutImage, goToModule,
    themes, addTheme, updateTheme, renameTheme, deleteTheme,
    viewportRenderRequest, viewportRenderRequestSeq, viewportPendingRequest, resolveViewportRender,
    setTaskProgress,
    rasters, updateRaster, removeRaster,
    boundaries, updateBoundary, removeBoundary,
    omfObjects, updateOmfObject, removeOmfObject,
    terrain, updateTerrain,
    geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax,
    voxelModels, addVoxelModel, updateVoxelModel, removeVoxelModel,
    project,
    layerGroups, addLayerGroup, renameLayerGroup, deleteLayerGroup, toggleLayerGroupCollapsed, setLayerGroupFor,
    excludedIntercepts, toggleExcludedIntercept,
    softIntercepts, toggleSoftIntercept,
    sections, upsertSection, renameSection, deleteSection,
  } = store;

  // TASKS.csv #228 — surface sample hover tooltip text. Values are stored in their native import unit
  // (same convention assays/assayElements already use — see store.jsx's own comment on that), so this
  // just looks up each element's unit from surfaceElements rather than doing any conversion.
  const surfaceElementUnits = useMemo(() => Object.fromEntries(surfaceElements.map((e) => [e.symbol, e.unit])), [surfaceElements]);
  const surfaceSampleTip = (row) => {
    const vals = Object.entries(row.values || {}).map(([sym, v]) => `${sym}: ${v}${surfaceElementUnits[sym] || "ppm"}`).join("\n");
    return `Surface sample${row.sample_id ? ` ${row.sample_id}` : ""} (${row.medium})\n${vals}\n${row.x.toFixed(0)}E ${row.y.toFixed(0)}N ${row.z.toFixed(0)}Z`;
  };

  const mountRef = useRef(null);
  const modelAbortControllerRef = useRef(null); // TASKS.csv #231 — cancel button for an in-flight GemPy run
  // TASKS.csv #225 — visibleRef mirrors the `visible` prop for long-lived closures (the mount effect's
  // event handlers, the animate loop) that can't see prop changes directly; resizeFnRef exposes the
  // mount effect's own `resize` function to the reveal effect below, which runs outside that closure.
  const visibleRef = useRef(visible);
  useEffect(() => { visibleRef.current = visible; }, [visible]);
  const resizeFnRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const layerGroupsRef = useRef({});
  const raycasterRef = useRef(new THREE.Raycaster());
  // Restore the camera angle/distance/target from wherever it was left last time this component was
  // mounted (View<->Modeling round trip, or any other module round trip) — see lastCamState's own
  // comment in store.jsx for why this couldn't just live in React state directly.
  const camState = useRef(lastCamState
    ? { theta: lastCamState.theta, phi: lastCamState.phi, radius: lastCamState.radius, target: new THREE.Vector3(lastCamState.target.x, lastCamState.target.y, lastCamState.target.z) }
    : { theta: Math.PI / 4, phi: Math.PI / 3, radius: 600, target: new THREE.Vector3(0, 0, 0) });
  // TASKS.csv #225 — now effectively vestigial for its ORIGINAL purpose: this only ever fires on a real
  // component unmount, and since a single ViewerModule instance now stays mounted persistently across
  // View/Modeling/Targeting (see App.jsx), that no longer happens on every mode switch the way it used
  // to — camState.current itself keeps living across those switches regardless, so nothing is lost.
  // Left in place harmlessly (it still correctly persists the final camera position at real app
  // teardown/project-tab-close), not removed, since store.jsx's `lastCamState` is also still read by
  // the viewerUiStateSeq hydrate effect above on a genuine New/Open project.
  useEffect(() => {
    return () => {
      const cs = camState.current;
      setLastCamState({ theta: cs.theta, phi: cs.phi, radius: cs.radius, target: { x: cs.target.x, y: cs.target.y, z: cs.target.z } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // unmount-only — see the comment above camState's declaration
  const dragRef = useRef({ dragging: false, panning: false, lastX: 0, lastY: 0 });
  const originRef = useRef({ x: 0, y: 0, z: 0 });
  const tracesRef = useRef([]);
  const compassRef = useRef(null);
  const axisGizmoRef = useRef(null); // TASKS.csv #189 — small camera-synced N/E/Z axis-triad widget, bottom-left of the 3D view
  const lastTracesRef = useRef([]);
  // TASKS.csv — user report: "we have to make it stop resetting the zoom every time user loads a new
  // layer." Same class of bug as the earlier voxel-visibility camera-reset fix a few lines below (see
  // voxelGeomSignature's own comment) — the geometry-rebuild effect calls fitView() unconditionally
  // every time it runs, and that effect's dependency array includes `layers` directly, so importing
  // ANY new layer (lithology, alteration, a raster, a boundary, a geophys classification change, etc.)
  // reran the whole effect and wiped out the user's pan/zoom, not just a voxel-visibility toggle. This
  // ref makes the auto-fit a true one-time "frame the data when it first appears" action instead of an
  // every-rebuild side effect — reset to false whenever collars are cleared back to zero (a genuinely
  // fresh dataset should still get an initial auto-frame), otherwise left alone so every subsequent
  // layer/legend/filter change leaves the camera exactly where the user put it. "Zoom to fit all" (the
  // existing toolbar/context-menu action) remains available for whenever a user actually wants to
  // refit after adding something.
  const hasAutoFitRef = useRef(false);
  // Perf (user report: "the app is getting a bit heavy on my laptop") — the render loop below used to
  // call renderer.render() unconditionally every requestAnimationFrame tick, forever, even when the
  // camera hasn't moved and nothing in the scene changed — a genuinely idle 3D view (which, realistically,
  // is most of the time a geologist spends looking at a model rather than actively dragging it) was still
  // pushing a full re-render of every tube/sphere/mesh in the scene at 60fps, burning GPU/CPU (and, on a
  // laptop, battery/fan) for frames that are pixel-identical to the one before. lastActivityRef is bumped
  // on every camera change (updateCamera, below, covers drag/wheel/fitView/fitBox/compass-snap — every
  // path that moves the camera already funnels through it) and read in the animate() loop to drop the
  // render rate to a low idle cap after a short quiet period, snapping straight back to full rate the
  // instant there's new activity — no visual change while interacting, no stale-frame risk (idle cap is a
  // THROTTLE, never a full skip, so any scene change from elsewhere — an import, a filter, a style edit —
  // still reaches the screen within one idle-interval, imperceptibly).
  const lastActivityRef = useRef(Date.now());
  const lastFrameAtRef = useRef(0);

  const [layerVisible, setLayerVisible] = useState({ ...DEFAULT_LAYER_VISIBLE });
  // TASKS.csv #66 — which sidebar LayerRows are expanded inline (category chips + sources), a
  // lighter-weight alternative to opening the full LayerInspector modal for quick "toggle just this
  // one category" or "which files fed this layer" checks. Purely local UI state, not persisted —
  // like categoryFilter etc. below it, this is view-state, not project data.
  const [expandedLayers, setExpandedLayers] = useState({});
  const [categoryFilter, setCategoryFilter] = useState({});
  const [numericRange, setNumericRange] = useState({});
  const [legendOverride, setLegendOverride] = useState({});
  const [visibleHoles, setVisibleHoles] = useState({});
  const [holeFilter, setHoleFilter] = useState(""); // TASKS.csv #222 — sidebar Holes list filter, UI-only (not persisted)
  const [customLayers, setCustomLayers] = useState([]);
  const [customVisible, setCustomVisible] = useState({});
  const [assayVisible, setAssayVisible] = useState(true);
  // User request: show several elements at once (e.g. Au/Ag/Zn/Cu/Pb together), each individually
  // toggleable, instead of the old single-<select> "one element at a time" picker. Kept as an ordered
  // array (not a Set) so ASSAY_ELEMENT_COLORS assignment below is stable/predictable by pick order
  // rather than shuffling around as elements are toggled on/off.
  const [assayDisplayElements, setAssayDisplayElements] = useState([]);
  const toggleAssayElement = (symbol) => setAssayDisplayElements((p) => p.includes(symbol) ? p.filter((s) => s !== symbol) : [...p, symbol]);
  // User request: "I wanna be able to change the assay legend. Change colour, size, recategorize,
  // ignore values lower than (what the user specifies)". Per-symbol styling, keyed by element symbol:
  // { color: "#rrggbb" | null (null = use the default pick-order color), sizeMult: number (default 1,
  // multiplies the existing value-scaled sphere radius), minCutoff: number | null (rows below this
  // value in the element's display unit are simply not rendered — "ignore values lower than"), breaks:
  // [{max, color, label}] | null ("recategorize" — graduated/classed coloring: if set, a point's color
  // comes from the first break whose max it's <= rather than the element's flat single color; null/empty
  // means "not recategorized", the plain single-color behavior). Same save/restore/theme-capture
  // treatment as legendOverride/numericRange right above — view-display state, not raw project data.
  const [assayStyle, setAssayStyle] = useState({});
  const [assayStyleModalSymbol, setAssayStyleModalSymbol] = useState(null); // symbol string | null
  const [gradeEstOpen, setGradeEstOpen] = useState(false); // TASKS.csv #117 — grade estimation into block models
  // Per-element min/max across ALL loaded assays for that symbol (not just the currently-visible/
  // cutoff-passing ones) — used by AssayStyleModal so its "suggest even breaks" helper and range
  // display reflect the element's real data range regardless of what's currently toggled on/filtered.
  // Deliberately a separate useMemo from the big rebuild effect's own local globalAssayRanges (that
  // one only computes ranges for currently-toggled-on elements and lives inside a non-render effect
  // closure, so it isn't available to read from JSX) — this one covers every element with a picker
  // regardless of toggle state, cheap enough to recompute on every assays/assayElements change.
  const globalAssayRanges = useMemo(() => {
    const out = {};
    assayElements.forEach((e) => {
      const vals = assays.filter((a) => a.values[e.symbol] != null).map((a) => a.values[e.symbol]);
      out[e.symbol] = minMax(vals); // not Math.min/max(...vals) — a large assay dataset can exceed the JS engine's argument-spread limit, see layers.js's minMax comment
    });
    return out;
  }, [assays, assayElements]);
  const [tooltip, setTooltip] = useState(null);
  const [notices, setNotices] = useState([]);
  const [toast, setToast] = useState(null); // { text, key } — most recent notice, shown briefly over the viewport
  const [inspectLayer, setInspectLayer] = useState(null);
  const [importModal, setImportModal] = useState(null);
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [qcModalOpen, setQcModalOpen] = useState(false); // TASKS.csv #82 — data QA/QC modal
  // TASKS.csv #239 — SQL workspace (#50) was only reachable from the Geochem module's toolbar despite
  // querying collars/survey/layers/boundaries too, not just assays — discoverability gap flagged by the
  // QGIS-specialist audit. Same modal, same store data, just also reachable from here.
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [stripLogHoleId, setStripLogHoleId] = useState(null); // TASKS.csv #133 — downhole strip log modal, holds the hole_id or null
  const [interceptsModalOpen, setInterceptsModalOpen] = useState(false); // TASKS.csv #84 — boundary intercepts
  const [contextMenu, setContextMenu] = useState(null);
  // TASKS.csv — right-click on a sidebar layer row for a small extensible menu ("for now" per the
  // user's request, just Zoom to layer — the icon-row already offers that as a left-click too, but a
  // right-click menu is the more discoverable/extensible home for "a few options" as more get added).
  const [layerContextMenu, setLayerContextMenu] = useState(null); // { key, label, x, y } | null — key can be a real LAYER_META key, or the sentinels "__collars__"/"__survey__" (see renderVectorContextItems)
  const [attrTableTarget, setAttrTableTarget] = useState(null); // { kind: "collars"|"survey"|"layer", key, label } | null
  const [dragOver, setDragOver] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();
  const [browserHeight, setBrowserHeight] = useBrowserPanelHeight(); // TASKS.csv #206 — Browser panel dock height
  const [dataLoaded, setDataLoaded] = useState(false);

  // TASKS.csv #188 follow-up — user report: "there is a bug on the select from cursor button. it
  // should let me click on the view to retrieve the coordinates, instead it just grabs the coordinates
  // of the exact moment I click on the button." That was the ORIGINAL, deliberately-scoped-down design
  // (see PlannedHoleAddForm's own header comment) — "Use cursor" just read the live status-bar cursor
  // value at click time, which is wherever the mouse last was over the 3D view BEFORE moving onto the
  // sidebar button, not a real "click to place" pick. This is that real follow-up: an armed pick mode,
  // same shape as sectionMode/measureMode above (a boolean + a one-shot click handler on .ge-main),
  // reusing onMeasureClick's exact raycast pattern (raycastWorldPoint — terrain/voxel/drillhole-aware,
  // not just a flat plane) so a picked point reflects whatever's actually under the cursor.
  const [pickHoleMode, setPickHoleMode] = useState(false);
  const pickHoleModeRef = useRef(false); // mirrors pickHoleMode for the mount-once pointer-event effect below, same reason rectZoomRef mirrors rectZoomMode
  useEffect(() => { pickHoleModeRef.current = pickHoleMode; }, [pickHoleMode]);
  const [pickedHolePoint, setPickedHolePoint] = useState(null);

  const [sectionMode, setSectionMode] = useState(false);
  const sectionPts = useRef([]);
  const [sectionPreview, setSectionPreview] = useState(null);
  const [sectionCorridor, setSectionCorridor] = useState(100);

  // TASKS.csv #121 (QGIS-specialist audit finding, approved) — distance/bearing/area measurement
  // tools in the 3D view. `measureMode` null = off; "distance" = click to chain a polyline ruler
  // (each click adds a vertex, running total + last-segment bearing shown live); "area" = click to
  // build a polygon (shoelace-formula plan-view area, auto-closed visually with a dashed final edge,
  // no separate "finish" gesture needed — it's just always treated as the current in-progress
  // polygon). measurePts is plain React state (not a ref) since a measuring session is realistically
  // a handful to a few dozen points — cheap enough to re-render on every click, and the 3D visual
  // (measureGroupRef, see the scene-setup effect) is rebuilt from it in its own effect, same pattern
  // #188 used for plannedHoles.
  const [measureMode, setMeasureMode] = useState(null); // null | "distance" | "area"
  const [measurePts, setMeasurePts] = useState([]); // [{x,y,z}, ...] world coordinates
  // TASKS.csv — "slice series" / fence-section generator (user request: "I wanna be able to slice the
  // voxel in equal parts on a specified azi and width"). See generateSliceSeries below.
  const [sliceSeriesAzimuth, setSliceSeriesAzimuth] = useState(0);
  const [sliceSeriesWidth, setSliceSeriesWidth] = useState(50);

  const [gridConfig, setGridConfig] = useState({ ...DEFAULT_GRID });
  const gridGroupRef = useRef(null);

  // Viewport background color — defaults to white (matching the rest of the app's UI theme), but the
  // user can pick a different one from the viewport's right-click menu (below) for cases where white
  // washes out a light-colored model/raster, or just personal preference. Persisted the same way as
  // every other viewer UI setting (layerVisible, gridConfig, etc. — see the hydrate/push effects below).
  const [bgColor, setBgColor] = useState("#ffffff");

  // Manual "Refresh view" trigger — the user asked for this after seeing collars render a few meters
  // off from a DEM following a delete + re-import. The geometry-rebuild effects below are all correct
  // (they recompute originRef.current and every group's positions from the CURRENT collars/terrain on
  // every relevant state change, and a shared vertical origin cancels out of the collar-vs-terrain
  // relative distance by construction, so it can't itself cause a relative offset), but dev-mode hot
  // reload — or any other case where the store and the live scene fall out of sync — has no other way
  // to force a from-scratch rebuild short of restarting the app. Bumping this forces every geometry
  // effect (rebuild-all, raster drape, terrain, boundaries) to re-run against current state.
  const [rebuildSeq, setRebuildSeq] = useState(0);

  // Persistent locator mini-map (TASKS.csv, user request) — an OpenStreetMap orientation aid docked in
  // the viewport, toggled on/off, showing where the project's collars actually sit in the real world.
  // Deliberately NOT persisted to viewerUiState like bgColor/gridConfig above — this is a per-session
  // "let me check where I am" glance, not a saved view setting.
  const [showLocator, setShowLocator] = useState(false);
  const [showBasemap, setShowBasemap] = useState(false);
  const [projectLonLat, setProjectLonLat] = useState(null);

  // Bug fix (user report): replaces every window.prompt() call in this file — see PromptModal.jsx's
  // header comment for why window.prompt() doesn't reliably work in Electron's renderer (this was the
  // actual cause of "Group feature is not working, can't create group layers": addLayerGroup itself
  // was always fine, the prompt just never appeared for a name to be typed into).
  const [promptState, setPromptState] = useState(null); // { title, defaultValue, onSubmit } | null
  const askPrompt = (title, defaultValue, onSubmit) => setPromptState({ title, defaultValue: defaultValue || "", onSubmit });

  // ---- Implicit surface modelling (TASKS.csv #29, first pass — see comment above runImplicitModel
  // below for what this does and doesn't do yet). Meshes live in their own group (implicitGroupRef),
  // separate from layerGroupsRef, so they survive the frequent layer-visibility/filter re-renders
  // instead of getting wiped every time a checkbox changes — they're only touched by the functions
  // below, on purpose, since a network round-trip generated them and re-generating on every render
  // would be both wasteful and slow. Not persisted in the project file or in themes yet (first-pass
  // scope limitation, noted in TASKS.csv) — regenerate after reopening a project.
  const implicitGroupRef = useRef(null);
  const implicitMeshesRef = useRef({}); // id -> THREE.Mesh

  // ---- Raster drapes (TASKS.csv #24) — GeoTIFF planes, own group for the same reason as
  // implicitGroupRef: they're driven by the store's `rasters` list (persisted, unlike implicit
  // surfaces), not by the frequent layer-visibility/filter churn that rebuilds layerGroupsRef.
  const rasterGroupRef = useRef(null);
  const rasterMeshesRef = useRef({}); // id -> THREE.Mesh
  // Boundary polylines (Geosoft .ply import) — own group/refs, same reasoning as rasters above: driven
  // by the store's persisted `boundaries` list, not by layer-visibility churn.
  const boundaryGroupRef = useRef(null);
  const boundaryLinesRef = useRef({}); // id -> THREE.Group (one child LineLoop per polyline/part)
  const omfGroupRef = useRef(null);
  const omfMeshesRef = useRef({}); // id -> THREE.Object3D (Points | LineSegments | Mesh, one per omfObject)
  // ---- Terrain surface (TASKS.csv #77) — own group/mesh ref, same pattern as the raster drapes just
  // above. Only ever one mesh (store.terrain is a single object, not a list — see its store.jsx note).
  const terrainGroupRef = useRef(null);
  const terrainMeshRef = useRef(null);
  // ---- Voxel / block models (TASKS.csv #27/#28) — own group, same reasoning as rasters/terrain
  // above: driven by the store's persisted `voxelModels` list, not layer-visibility churn. One
  // THREE.InstancedMesh per model (not one Mesh per cell — a real UBC mesh or block model can be tens
  // of thousands of cells, which would be its own perf cliff as individual draw calls).
  const voxelGroupRef = useRef(null);
  const voxelMeshesRef = useRef({}); // id -> THREE.InstancedMesh
  // ---- Planned drillholes (TASKS.csv #188 — drillhole planning/targeting module) — own group, same
  // reasoning as rasters/terrain/voxels above: driven by the store's persisted `plannedHoles` list,
  // not layer-visibility churn. Always rendered regardless of which module tab is active (same as
  // every other store-driven group here — `mode` only ever gates which SIDEBAR content shows, never
  // what's in the 3D scene itself), so a planned hole stays visible for context while working in 3D
  // View or 3D Modeling too, not just the Targeting tab where it's edited.
  const plannedGroupRef = useRef(null);
  const plannedMeshesRef = useRef({}); // id -> THREE.Group (line + toe marker)
  const measureGroupRef = useRef(null); // TASKS.csv #121 — line/polygon + vertex markers for the active measurement
  const [implicitSurfaces, setImplicitSurfaces] = useState([]); // [{id, name, visible, vertexCount, faceCount}]
  const [implicitTarget, setImplicitTarget] = useState("");
  // TASKS.csv #98 — feed drawn cross-section contacts into 3D surface generation. Off by default:
  // drawn contacts are an interpretation, not raw data, so they shouldn't silently join every run —
  // this is the "source picker" the task note called for, kept as one explicit toggle rather than a
  // full per-source review UI (that's still a real follow-up if this turns out to need finer control).
  const [includeSectionContacts, setIncludeSectionContacts] = useState(false);
  const [structuralTarget, setStructuralTarget] = useState("");
  const [stereonetOpen, setStereonetOpen] = useState(false); // TASKS.csv #141
  const [alterationTarget, setAlterationTarget] = useState("");
  const [stackUnits, setStackUnits] = useState([]); // ordered youngest -> oldest, for the stratigraphic stack tool
  const [stackAdd, setStackAdd] = useState("");
  // TASKS.csv #155 — this used to be its own toggleable state (an internal "Home | Modeling" pill
  // switcher). Now that View and Modeling are separate top-level modules, which content shows is
  // dictated entirely by the `mode` prop App.jsx passes in — kept as a local alias so the render code
  // below (`sidebarTab === "home"` / `=== "modeling"`) didn't need a mechanical find/replace.
  const sidebarTab = mode === "modeling" ? "modeling" : mode === "targeting" ? "targeting" : "home";
  // TASKS.csv #155 — QGIS-style toolbar (view mode only, this pass): which of the Grid/Themes
  // popovers is open, if any. Null closes both. The Database/QC/Boundary-intercepts/Snapshot toolbar
  // buttons don't need this — they trigger the SAME existing modal-open booleans (dbModalOpen etc.)
  // that used to be triggered from sidebar buttons, just moved.
  const [openPopover, setOpenPopover] = useState(null); // null | "grid" | "themes"
  const [implicitBusy, setImplicitBusy] = useState(false);
  // Bug-hunt pass: bumped once by the three.js init effect right after sceneRef.current is set, purely
  // so effects that guard on `sceneRef.current` (like the custom-layers rebuild effect below, which is
  // declared before the init effect and so runs with a null sceneRef on first mount) get a reliable
  // second chance to run once the scene actually exists — otherwise a project opened while the Viewer
  // tab isn't mounted could permanently miss rebuilding its custom CSV layers into the 3D scene.
  const [sceneReady, setSceneReady] = useState(0);
  // TASKS.csv #83 — which generated surface's type/relationships editor is expanded (one at a time,
  // same pattern as #66's layer-row inline expand).
  const [expandedSurfaceId, setExpandedSurfaceId] = useState(null);
  const [relationDraft, setRelationDraft] = useState({ relation: RELATION_TYPES[0].key, targetId: "" });
  // TASKS.csv #140 — volume/watertightness for whichever surface is currently expanded. Only computed
  // for the expanded one (not all of them on every render) since a marching-cubes mesh can run into
  // the tens of thousands of triangles and there's no reason to pay that cost for collapsed rows.
  // Re-runs when implicitSurfaces changes too, so regenerating the same surface (new vertex/face
  // counts) picks up the new mesh rather than showing a stale volume.
  const expandedSurfaceVolume = useMemo(() => {
    if (!expandedSurfaceId) return null;
    const mesh = implicitMeshesRef.current[expandedSurfaceId];
    if (!mesh?.geometry) return null;
    return computeMeshVolume(mesh.geometry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedSurfaceId, implicitSurfaces]);
  // TASKS.csv #89 — domains: named partitions of the modelling space, each an AND of fault-side
  // constraints ({id, name, constraints: [{faultId, side}]}). Not persisted yet, same as
  // implicitSurfaces themselves (a domain references fault surfaces by id, which don't outlive a
  // session either — see #52's still-open persistence follow-up, which now covers this too).
  const [domains, setDomains] = useState([]);
  const [expandedDomainId, setExpandedDomainId] = useState(null);
  const [domainConstraintDraft, setDomainConstraintDraft] = useState({ faultId: "", side: 1 });
  // Shared across all four modelling tools below (litho/stack/structural/alteration) — a domain is a
  // property of the RUN, not of one tool, so one selector covers all of them rather than repeating it
  // four times. "" = whole property (today's original, undomained behavior).
  const [modelDomainId, setModelDomainId] = useState("");
  // TASKS.csv #88 — the "boundary" constraint type: #89's domain already restricts which CONTROL
  // POINTS feed a run, but GemPy still fits/extrapolates its potential field across the WHOLE extent,
  // so the output mesh can bulge past the domain into territory the domain says isn't this unit's. When
  // on, any generated-mesh triangle with a vertex outside the selected domain is dropped after the run
  // (post-processing the mesh, not a solver-level constraint — GemPy has no such concept). Off by
  // default and only has any effect when a domain is actually selected above.
  const [clipToDomainBoundary, setClipToDomainBoundary] = useState(false);
  // TASKS.csv #85 — shared across all four modelling tools, same as modelDomainId above. Off by
  // default (matches pre-#85 behavior exactly: every gathered control point feeds the run). azimuth/dip
  // define the ellipsoid's long (major) axis — the structural trend — major/semiMajor/minor are ranges
  // in meters along that basis (see searchEllipsoidBasis), minSamples is how many OTHER control points
  // must fall inside a point's own ellipsoid for that point to be trusted.
  const [searchEllipsoid, setSearchEllipsoid] = useState({ enabled: false, azimuth: 45, dip: 60, major: 300, semiMajor: 150, minor: 50, minSamples: 2 });
  // TASKS.csv #231 (Leapfrog-specialist audit finding: real GemPy runs took 80-88s with no resolution
  // control, resolution was never sent from the client at all) — the sidecar's own pythonImplicitModel
  // wrapper already accepted an opts.resolution override, it just was never surfaced; hardcoded 36 here
  // matches the value runSurfaceStack used to hardcode, so existing behavior/timing is unchanged until
  // a user actually moves this slider. GemPy cost scales with grid cells, so lower = faster/coarser,
  // higher = slower/finer — 64 matches the sidecar's own documented cap (python-sidecar/app/main.py).
  const [modelResolution, setModelResolution] = useState(36);
  // TASKS.csv #86 — same shared-across-all-four-tools pattern as domain/searchEllipsoid above. Distinct
  // state from searchEllipsoid (not literally shared) since the two are conceptually independent knobs
  // (which points are trusted vs. how the surface itself should stretch) even though they usually share
  // the same real-world structural trend — "Copy from search ellipsoid" in the UI covers that overlap
  // without forcing the two to always move together.
  const [anisotropy, setAnisotropy] = useState({ enabled: false, azimuth: 45, dip: 60, major: 300, semiMajor: 150, minor: 50 });

  // ---- Saved themes (TASKS.csv #45) ----
  const [themeNameDraft, setThemeNameDraft] = useState("");
  const [renamingThemeId, setRenamingThemeId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const lastHandledRequestId = useRef(null); // TASKS.csv #202 — see the viewportRenderRequestSeq effect below
  // TASKS.csv #198 (part 3) — set once an interactive Layout-Viewport edit session has applied its
  // theme and is waiting for the user to actually orbit/pan/zoom (the existing pointer handlers below
  // already do this unconditionally, no new interaction code needed) and then explicitly exit, rather
  // than the non-interactive path's automatic 400ms-timer capture. Drives the small floating banner
  // rendered near the bottom of this component's JSX.
  const [interactiveViewportSession, setInteractiveViewportSession] = useState(null); // { req, liveViewBeforeRender } | null

  // "Zoom to selected area" (right-click menu -> drag a rectangle). rectZoomMode drives the cursor
  // style (plain React state, cheap) while rectZoomRef mirrors it for the pointer handlers set up
  // once in the three.js init effect below (which only runs on mount, so it can't see fresh state —
  // refs are the standard escape hatch for that). rectDragRef holds the in-progress drag rectangle
  // imperatively; rectVisual is the same rectangle mirrored into state just so the dashed-box overlay
  // can actually render.
  const [rectZoomMode, setRectZoomMode] = useState(false);
  const rectZoomRef = useRef(false);
  const rectDragRef = useRef(null);
  const [rectVisual, setRectVisual] = useState(null);
  const zoomToScreenRectRef = useRef(() => {});
  useEffect(() => { rectZoomRef.current = rectZoomMode; }, [rectZoomMode]);

  // TASKS.csv #225 — armed-click tool modes (section/measure/rect-zoom/pick-hole) and transient UI
  // popovers used to implicitly disarm on every mode switch, since that switch used to unmount this
  // whole component. Now that a single persistent instance survives View<->Modeling<->Targeting
  // switches, that disarm has to be explicit instead of an accident of unmounting — otherwise, e.g.,
  // arming the measure tool in 3D View and then switching to Modeling would leave it armed there too.
  // Deliberately NOT resetting modal-open booleans (dbModalOpen, qcModalOpen, etc.) here — leaving a
  // modal open across a mode switch reads as reasonable, arguably better, UX, not a bug to fix.
  useEffect(() => {
    setSectionMode(false);
    setMeasureMode(null); setMeasurePts([]);
    setRectZoomMode(false); setRectVisual(null); rectDragRef.current = null;
    setPickHoleMode(false);
    setContextMenu(null); setLayerContextMenu(null); setTooltip(null); setOpenPopover(null);
    dragRef.current = { dragging: false, panning: false, lastX: 0, lastY: 0 };
  }, [mode]);

  const fileInputs = useRef({});
  const setInputRef = (key) => (el) => { fileInputs.current[key] = el; };

  const effectiveColor = useCallback((layerKey, value) => {
    const ov = legendOverride[layerKey]?.[value];
    if (ov?.color) return ov.color;
    return LAYER_META[layerKey].colorFn(value);
  }, [legendOverride]);
  const effectiveLabel = useCallback((layerKey, value) => {
    const ov = legendOverride[layerKey]?.[value];
    if (ov?.label) return ov.label;
    const meta = LAYER_META[layerKey];
    return meta.nameFn ? (meta.nameFn(value) || value) : value;
  }, [legendOverride]);
  const isRowVisible = useCallback((layerKey, row) => {
    const meta = LAYER_META[layerKey];
    if (meta.numeric) { const range = numericRange[layerKey]; if (range && (row.value < range.min || row.value > range.max)) return false; return true; }
    const hidden = categoryFilter[layerKey];
    if (hidden && hidden.has(String(row.value))) return false;
    return true;
  }, [categoryFilter, numericRange]);

  // ---------- project save/load: mirror custom layers (plain data) into the store, and
  // reconstruct three.js groups for any custom layers a loaded project brought in ----------
  useEffect(() => {
    setStoreCustomLayers(customLayers.map(({ id, name, rows }) => ({ id, name, rows })));
  }, [customLayers, setStoreCustomLayers]);

  // ---------- viewer UI state persistence (TASKS.csv #10) ----------
  // Hydrate local UI state from the store whenever a fresh load happens (New/Open project).
  // viewerUiStateSeq is bumped by store.newProject/openProject specifically for this — it's the
  // signal that this isn't just another local edit echoing back, but an actual load event.
  const lastHydratedSeq = useRef(-1);
  useEffect(() => {
    if (viewerUiStateSeq === lastHydratedSeq.current) return;
    lastHydratedSeq.current = viewerUiStateSeq;
    // TASKS.csv #225 — both of these used to reset implicitly on every tab-switch-triggered
    // unmount/remount; now that ViewerModule stays mounted persistently across View/Modeling/
    // Targeting, that implicit reset never happens again unless done explicitly here, on the one
    // signal (viewerUiStateSeq) that reliably means "a real New/Open project just happened", not just
    // a tab switch. hasAutoFitRef: without this, a newly-opened project would keep the PREVIOUS
    // project's camera framing forever instead of auto-fitting to its own data (see hasAutoFitRef's
    // own comment at the geometry-rebuild effect for why it exists at all). camState: store.jsx
    // deliberately sets lastCamState to null on newProject/loadProjectPayload specifically so a
    // different project doesn't inherit a meaningless leftover camera position — respected here the
    // same way the (now effectively mount-only-forever) initial camState.current setup already did.
    hasAutoFitRef.current = false;
    if (!lastCamState) {
      camState.current = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 600, target: new THREE.Vector3(0, 0, 0) };
      cameraRef.current?.__update?.();
    }
    const s = viewerUiState;
    if (!s) {
      // New project (or an older save with no saved UI state) — reset to defaults rather than
      // leaving stale filters/visibility from whatever was open before.
      setLayerVisible({ ...DEFAULT_LAYER_VISIBLE });
      setCategoryFilter({}); setNumericRange({}); setLegendOverride({});
      setVisibleHoles({}); setCustomVisible({});
      setAssayVisible(true); setAssayDisplayElements([]); setAssayStyle({});
      setGridConfig({ ...DEFAULT_GRID });
      setBgColor("#ffffff");
      return;
    }
    if (s.layerVisible) setLayerVisible({ ...DEFAULT_LAYER_VISIBLE, ...s.layerVisible });
    setCategoryFilter(Object.fromEntries(Object.entries(s.categoryFilter || {}).map(([k, v]) => [k, new Set(v)])));
    setNumericRange(s.numericRange || {});
    setLegendOverride(s.legendOverride || {});
    setVisibleHoles(s.visibleHoles || {});
    setCustomVisible(s.customVisible || {});
    setAssayVisible(s.assayVisible !== false);
    // Migrates older saved projects' single assayDisplayElement (string) into the new
    // assayDisplayElements (array) shape — see the multi-element display state comment above.
    setAssayDisplayElements(s.assayDisplayElements || (s.assayDisplayElement ? [s.assayDisplayElement] : []));
    setAssayStyle(s.assayStyle || {});
    setGridConfig({ ...DEFAULT_GRID, ...(s.gridConfig || {}) });
    setBgColor(s.bgColor || "#ffffff");
  }, [viewerUiStateSeq, viewerUiState, lastCamState]);

  // Push local UI state up to the store on every relevant change, so it's captured whenever
  // saveProject next runs. Sets aren't JSON-safe, so categoryFilter is serialized to arrays here.
  useEffect(() => {
    setViewerUiState({
      layerVisible,
      categoryFilter: Object.fromEntries(Object.entries(categoryFilter).map(([k, v]) => [k, Array.from(v)])),
      numericRange,
      legendOverride,
      visibleHoles,
      customVisible,
      assayVisible,
      assayDisplayElements,
      assayStyle,
      gridConfig,
      bgColor,
    });
  }, [layerVisible, categoryFilter, numericRange, legendOverride, visibleHoles, customVisible, assayVisible, assayDisplayElements, assayStyle, gridConfig, bgColor, setViewerUiState]);

  // Applies bgColor to the live three.js scene whenever it changes — separate from the push-to-store
  // effect above since this one needs sceneRef.current (set up in the big scene-setup effect further
  // down), not just to persist the value.
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.background = new THREE.Color(bgColor);
  }, [bgColor]);

  useEffect(() => {
    if (!sceneRef.current) return;
    const localIds = new Set(customLayers.map((l) => l.id));
    const missing = (storeCustomLayers || []).filter((l) => !localIds.has(l.id));
    if (!missing.length) return;
    const root = sceneRef.current.getObjectByName("root");
    const rebuilt = missing.map((l) => {
      const group = new THREE.Group(); group.name = l.id;
      layerGroupsRef.current[l.id] = group;
      root.add(group);
      return { ...l, group };
    });
    setCustomLayers((p) => [...p, ...rebuilt]);
    setCustomVisible((p) => ({ ...p, ...Object.fromEntries(missing.map((l) => [l.id, true])) }));
  }, [storeCustomLayers, sceneReady]);

  // User report: "Z value is stuck at 1619.9. let's make it capture the Z of the feature the mouse is
  // hovering whether it's a voxel, drillhole, srtm, etc." The live status-bar cursor readout (and this
  // tool's own "what's under the cursor" click handlers, e.g. #121's measurement tool) previously only
  // ever raycast the terrain mesh, falling back to a perfectly FLAT plane fixed at the origin's own
  // elevation whenever there was no terrain hit — so hovering over a voxel model, a drillhole trace, an
  // OMF surface, a draped raster, or a planned hole with no terrain loaded silently reported that one
  // fixed number (the origin/collar-average elevation) no matter where the mouse actually was, which is
  // exactly the "stuck" symptom reported. Broadened to every renderable 3D feature currently in the
  // scene (terrain, voxel/block models, OMF objects, draped rasters, planned holes, implicit surfaces,
  // boundary polylines, and every visible drillhole-data layer — litho/alt/vein/geotech/assay spheres/
  // geophysics points/custom CSV layers, which is where the actual drillhole trace lines and collar
  // markers live) and picks whichever is nearest the camera along the ray, exactly matching what's
  // visually closest to the surface under the cursor — falling back to the flat plane only when the ray
  // hits nothing real at all (e.g. pointed at open sky with no terrain).
  const pickHoverTargets = useCallback(() => {
    const list = [];
    if (terrainMeshRef.current) list.push(terrainMeshRef.current);
    if (voxelGroupRef.current) list.push(...voxelGroupRef.current.children);
    if (omfGroupRef.current) list.push(...omfGroupRef.current.children);
    if (rasterGroupRef.current) list.push(...rasterGroupRef.current.children);
    if (plannedGroupRef.current) list.push(...plannedGroupRef.current.children);
    if (implicitGroupRef.current) list.push(...implicitGroupRef.current.children);
    if (boundaryGroupRef.current) list.push(...boundaryGroupRef.current.children.flatMap((g) => g.children || []));
    Object.values(layerGroupsRef.current).forEach((g) => { if (g && g.visible !== false) list.push(...g.children); });
    return list;
  }, []);
  // Shared raycast-and-convert-to-world-coords helper used by both the live status-bar cursor (inside
  // the three.js init effect below) and onMeasureClick further down — one raycaster, nearest hit among
  // pickHoverTargets() above, falling back to a flat plane at local y=0 (the origin's own elevation).
  const raycastWorldPoint = useCallback((raycaster) => {
    const o = originRef.current;
    const targets = pickHoverTargets();
    const hits = targets.length ? raycaster.intersectObjects(targets, false) : [];
    if (hits.length) {
      const p = hits[0].point;
      return { x: p.x + o.x, y: -p.z + o.y, z: p.y + o.z };
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, hit)) {
      return { x: hit.x + o.x, y: -hit.z + o.y, z: hit.y + o.z };
    }
    return null;
  }, [pickHoverTargets]);

  // ---------- three.js init ----------
  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#ffffff"); sceneRef.current = scene;
    // Far plane bumped alongside the zoom max below — a camera can't see past its far plane, so
    // raising how far out the wheel can zoom is pointless without raising this too.
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000000); cameraRef.current = camera;
    // preserveDrawingBuffer is needed so canvas.toDataURL() (used by the "Snapshot to Layout"
    // button below) can read back whatever was last rendered — without it, WebGL is free to clear
    // the buffer right after presenting a frame and toDataURL() would come back blank/black.
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer; mount.appendChild(renderer.domElement);

    const root = new THREE.Group(); root.name = "root"; scene.add(root);
    const groups = {};
    Object.keys(LAYER_META).forEach((k) => { const g = new THREE.Group(); g.name = k; root.add(g); groups[k] = g; });
    const assayGroup = new THREE.Group(); assayGroup.name = "assay"; root.add(assayGroup); groups.assay = assayGroup;
    // TASKS.csv #228 — surface geochemistry samples get their own group (not part of LAYER_META/
    // `layers`, since surfaceSamples is its own top-level store list, same reasoning as assays/
    // assayElements not living in `layers` either) — built/cleared by the same generic
    // Object.values(groups) loops the geometry-rebuild effect already uses for every other group.
    const surfaceGroup = new THREE.Group(); surfaceGroup.name = "surface_samples"; root.add(surfaceGroup); groups.surface_samples = surfaceGroup;
    layerGroupsRef.current = groups;
    const implicitGroup = new THREE.Group(); implicitGroup.name = "implicit"; root.add(implicitGroup);
    implicitGroupRef.current = implicitGroup;
    implicitMeshesRef.current = {};
    setImplicitSurfaces([]);

    const rasterGroup = new THREE.Group(); rasterGroup.name = "rasters"; root.add(rasterGroup);
    rasterGroupRef.current = rasterGroup;
    rasterMeshesRef.current = {};

    const boundaryGroup = new THREE.Group(); boundaryGroup.name = "boundaries"; root.add(boundaryGroup);
    boundaryGroupRef.current = boundaryGroup;
    boundaryLinesRef.current = {};

    // TASKS.csv — OMF import (own group, own mesh ref, same reasoning as boundaryGroup above: driven
    // by the store's `omfObjects` list, not layer-visibility churn).
    const omfGroup = new THREE.Group(); omfGroup.name = "omf"; root.add(omfGroup);
    omfGroupRef.current = omfGroup;
    omfMeshesRef.current = {};

    // TASKS.csv #77 — terrain surface (own group, own mesh ref, same reasoning as rasterGroup above:
    // driven by the store's `terrain`, not rebuilt on every layer-visibility churn).
    const terrainGroup = new THREE.Group(); terrainGroup.name = "terrain"; root.add(terrainGroup);
    terrainGroupRef.current = terrainGroup;
    terrainMeshRef.current = null;

    // TASKS.csv #27/#28 — voxel/block models, own group, same reasoning as rasterGroup/terrainGroup.
    const voxelGroup = new THREE.Group(); voxelGroup.name = "voxels"; root.add(voxelGroup);
    voxelGroupRef.current = voxelGroup;
    voxelMeshesRef.current = {};

    // TASKS.csv #188 — planned drillholes, own group, same reasoning as voxelGroup/terrainGroup.
    const plannedGroup = new THREE.Group(); plannedGroup.name = "planned"; root.add(plannedGroup);
    plannedGroupRef.current = plannedGroup;
    plannedMeshesRef.current = {};

    // TASKS.csv #121 — measurement tool's own group, same reasoning as plannedGroup/voxelGroup.
    const measureGroup = new THREE.Group(); measureGroup.name = "measure"; root.add(measureGroup);
    measureGroupRef.current = measureGroup;

    // See sceneReady's own comment above — lets effects declared earlier in the component (and thus
    // run before this one on initial mount) re-run now that sceneRef.current is actually populated.
    setSceneReady((v) => v + 1);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(200, 400, 200); scene.add(dl);
    // The grid itself is now built/rebuilt by a dedicated effect below (see gridGroupRef), driven by
    // gridConfig — replaces this single hardcoded GridHelper so visibility/size/divisions/color/3D
    // mode are all user-adjustable instead of fixed at scene-creation time.
    const mkAxis = (dir, color) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(80)]), new THREE.LineBasicMaterial({ color }));
    scene.add(mkAxis(new THREE.Vector3(1, 0, 0), 0xe05a4a));
    scene.add(mkAxis(new THREE.Vector3(0, 1, 0), 0x4ac96a));
    scene.add(mkAxis(new THREE.Vector3(0, 0, -1), 0x4a9be0));

    const updateCamera = () => {
      const cs = camState.current;
      camera.position.set(
        cs.target.x + cs.radius * Math.sin(cs.phi) * Math.sin(cs.theta),
        cs.target.y + cs.radius * Math.cos(cs.phi),
        cs.target.z + cs.radius * Math.sin(cs.phi) * Math.cos(cs.theta)
      );
      camera.lookAt(cs.target);
      lastActivityRef.current = Date.now(); // every camera move (drag/wheel/fitView/fitBox/compass) counts as activity — see lastActivityRef comment above
    };
    updateCamera(); camera.__update = updateCamera;

    const compass = createCompassRose({ camStateRef: camState, updateCamera, dragRef });
    compassRef.current = compass;
    const axisGizmo = createAxisGizmo({ camStateRef: camState });
    axisGizmoRef.current = axisGizmo;

    // TASKS.csv #225 — the 0-size guard matters once ViewerModule can stay mounted-but-hidden
    // (display:none) behind another tab: a hidden element's clientWidth/Height are both 0, and
    // without this guard camera.aspect becomes 0/0 (NaN), corrupting the projection matrix. Exposed
    // via resizeFnRef so the reveal effect below (which runs outside this mount effect's closure) can
    // force a real resize the moment the viewer becomes visible again, since a ResizeObserver doesn't
    // fire just because `display` changed if the element's box size didn't change while hidden.
    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); lastActivityRef.current = Date.now();
    };
    resizeFnRef.current = resize;
    resize(); const ro = new ResizeObserver(resize); ro.observe(mount);

    // Real bug fix (TASKS.csv #63): hover/right-click hit-testing used to flatten EVERY layer group's
    // children regardless of the group's own .visible flag, so a toggled-off layer's meshes (still
    // present in the scene graph, just not drawn) could still be hit and show a tooltip/context menu
    // for data the user explicitly hid. Centralized here so both call sites below use the same fix.
    const visibleLayerObjects = () =>
      Object.values(layerGroupsRef.current).filter((g) => g.visible !== false).flatMap((g) => g.children);

    const onPointerDown = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (e.button === 2) return; // handled by contextmenu event
      if (rectZoomRef.current && e.button === 0) {
        // "Zoom to selected area" (armed via the right-click menu): this click starts a drag
        // rectangle instead of an orbit-drag. See onPointerMove/onPointerUp below and
        // zoomToScreenRect (defined outside this effect, called via a stable ref-captured closure).
        rectDragRef.current = { x1: mx, y1: my, x2: mx, y2: my };
        setRectVisual({ x: mx, y: my, w: 0, h: 0 });
        renderer.domElement.setPointerCapture(e.pointerId);
        return;
      }
      const compassResult = e.button === 0 ? compass.handlePointerDown(mount, mx, my, e.button) : false;
      if (compassResult === true) return; // click consumed (snapped to a face)
      // TASKS.csv #212 — user report, persisting after the stale-dragRef/pointercancel hardening
      // already applied here: "drag still not working, it's doing the same as left click on mouse,
      // it is rotating the view" — i.e. a real middle-mouse drag is STILL coming through as a rotate.
      // That can only mean e.button genuinely isn't reporting 1 for Matt's middle click at the moment
      // of pointerdown (mouse driver software remapping the middle button, or Windows/Chromium's own
      // middle-click autoscroll gesture intercepting the button-down before it reaches this handler
      // as a normal click — both outside this app's control, and neither fixable by hardening the
      // move-handler's stale-state logic, which is all the earlier pass could actually address without
      // hardware to test against). Rather than keep guessing at the exact OS/driver cause, Shift+Left-
      // drag is added here as a reliable, driver-independent pan gesture that doesn't depend on the
      // middle button being reported correctly at all — same fallback QGIS/Blender-style tools offer
      // alongside (not instead of) a literal middle-drag. Plain middle-click (e.button === 1) still
      // works exactly as before for anyone whose hardware reports it correctly.
      dragRef.current = { dragging: true, panning: e.button === 1 || (e.button === 0 && e.shiftKey), lastX: e.clientX, lastY: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onPointerUp = (e) => {
      if (!visibleRef.current) return; // TASKS.csv #225 — same reasoning as onPointerMove's own guard
      if (rectDragRef.current) {
        const d = rectDragRef.current;
        rectDragRef.current = null; setRectVisual(null); setRectZoomMode(false);
        if (Math.abs(d.x2 - d.x1) > 4 && Math.abs(d.y2 - d.y1) > 4) zoomToScreenRectRef.current(d);
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
        return;
      }
      dragRef.current.dragging = false;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      // TASKS.csv #225 — this handler is registered on `window` (see below), not the canvas, and never
      // checked whether the viewer is even the visible tab. Once ViewerModule can stay mounted-but-
      // hidden, moving the mouse anywhere in the app (Geochem, Layout, ...) would otherwise still
      // raycast this hidden scene's every visible layer object and push a setCursor() store update on
      // every single mousemove — a real, new perf regression, not just a correctness one. A hidden
      // element's own getBoundingClientRect() is all zeros, so !rect.width already catches it, but the
      // explicit visibleRef check makes the intent obvious rather than relying on that as a side effect.
      if (!visibleRef.current || !rect.width) return;
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (rectDragRef.current) {
        rectDragRef.current.x2 = mx; rectDragRef.current.y2 = my;
        const d = rectDragRef.current;
        setRectVisual({ x: Math.min(d.x1, d.x2), y: Math.min(d.y1, d.y2), w: Math.abs(d.x2 - d.x1), h: Math.abs(d.y2 - d.y1) });
        return;
      }
      // TASKS.csv #212 — user report: "pan is not the same. Now instead of pan it rotates." dragRef
      // is only ever SET on pointerdown (dragging + panning based on e.button there), and this handler
      // never re-checks whether a button is actually still held — it just trusts that stale state. If
      // the matching pointerup is ever missed (the exact "OS/browser swallows an expected mouse event"
      // class of bug #207 already found and fixed elsewhere in this file, e.g. Chromium's own native
      // middle-click autoscroll potentially intercepting a real middle-click before this app's own
      // preventDefault fully suppresses it), dragRef.current.dragging can stay stuck true with
      // whatever `panning` value the LAST real drag happened to set — so plain mouse movement
      // afterward, with no button actually held, keeps being interpreted as a drag of the WRONG kind
      // (e.g. a stale panning:false from an earlier rotate silently turning a later middle-click drag
      // into more rotation). e.buttons is a live bitmask of what's currently held — checking it here
      // makes a dropped release self-heal on the very next mousemove instead of staying stuck until
      // some other click happens to reset it.
      if (dragRef.current.dragging && e.buttons === 0) {
        dragRef.current.dragging = false;
      }
      if (dragRef.current.dragging) {
        const dx = e.clientX - dragRef.current.lastX, dy = e.clientY - dragRef.current.lastY;
        dragRef.current.lastX = e.clientX; dragRef.current.lastY = e.clientY;
        const cs = camState.current;
        if (dragRef.current.panning) {
          // Bug fix (user report): vertical drag used to always move the target along world Y
          // (0,1,0) — correct in a side-on view, but in Top view (phi near 0, camera looking
          // straight down) that meant dragging up/down changed elevation instead of panning
          // across the ground, while horizontal drag panned correctly. The actual requirement is
          // "drag on the plane parallel to the current view" — i.e. pan along the camera's own
          // screen-space right/up axes, not fixed world axes. `right` (unchanged, already
          // correct — it's always horizontal, perpendicular to the current view azimuth) and a
          // freshly-derived `panUp` = cross(right, viewDir), which is exactly the camera's true
          // screen-vertical world direction: world Y at a side-on view (phi=90°, matching the old
          // behavior exactly — see the -dy sign below), smoothly rotating to a horizontal
          // ground-plane direction as the view tilts toward Top (phi=0°), so a top-down drag never
          // touches Y/elevation at all.
          const sp = cs.radius * 0.0015;
          const right = new THREE.Vector3(Math.cos(cs.theta), 0, -Math.sin(cs.theta));
          const viewDir = new THREE.Vector3(
            Math.sin(cs.phi) * Math.sin(cs.theta),
            Math.cos(cs.phi),
            Math.sin(cs.phi) * Math.cos(cs.theta)
          );
          const panUp = new THREE.Vector3().crossVectors(right, viewDir).normalize();
          cs.target.addScaledVector(right, -dx * sp);
          cs.target.addScaledVector(panUp, -dy * sp);
        } else { cs.theta -= dx * 0.006; cs.phi = Math.max(0.02, Math.min(Math.PI - 0.02, cs.phi - dy * 0.006)); }
        updateCamera();
        return;
      }
      if (compass.isOver(mount, mx, my)) { setTooltip(null); return; }
      // world coords under cursor -> status bar. Raycasts every real feature in the scene (terrain,
      // voxels, drillholes, OMF, rasters, etc. — see pickHoverTargets/raycastWorldPoint above) and
      // takes whichever is nearest the camera, falling back to a flat plane only when nothing is hit —
      // see the comment on raycastWorldPoint's definition for the full history (this used to be
      // terrain-only, which is what the "Z stuck at a fixed number" report was tracing back to).
      const mxN = (mx / rect.width) * 2 - 1, myN = -(my / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(new THREE.Vector2(mxN, myN), camera);
      const worldPt = raycastWorldPoint(raycasterRef.current);
      if (worldPt) setCursor(worldPt);
      // hover tooltip on layer objects — real bug fixed here: intersectObjects() is given the raw
      // mesh children directly (not their parent THREE.Group), and Raycaster only skips an object
      // whose OWN .visible is false, not an ancestor's — so a toggled-off layer's group.visible=false
      // never actually stopped its children from being hit-tested, meshes just weren't drawn, and
      // hovering over (say) a hidden lithology interval that happened to sit at the same spot as a
      // visible one would show the wrong tooltip, or a tooltip for data the user just turned off.
      // Filtering to only visible groups' children here (mirrors what actually renders) fixes it.
      const objs = visibleLayerObjects();
      const hits = raycasterRef.current.intersectObjects(objs, false);
      if (hits.length && hits[0].object.userData?.tip) setTooltip({ x: e.clientX, y: e.clientY, text: hits[0].object.userData.tip });
      else setTooltip(null);
    };
    // Max radius raised again (500km -> 4,000km) alongside the far-plane bump above, so there's no
    // practical ceiling a user would ever actually reach for a mine-scale (or even regional-scale)
    // property — a true Infinity isn't meaningful here since floating-point precision and the
    // camera's far plane both have real limits regardless.
    const onWheel = (e) => { e.preventDefault(); const cs = camState.current; cs.radius = Math.max(0.05, Math.min(4000000, cs.radius * (1 + e.deltaY * 0.0012))); updateCamera(); };
    const onContextMenuEvt = (e) => {
      e.preventDefault();
      if (rectZoomRef.current) { setRectZoomMode(false); rectDragRef.current = null; setRectVisual(null); return; } // right-click cancels an armed/in-progress rectangle-zoom
      if (pickHoleModeRef.current) { setPickHoleMode(false); return; } // right-click cancels an armed planned-hole pick
      const rect = renderer.domElement.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1, my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(new THREE.Vector2(mx, my), camera);
      const objs = visibleLayerObjects();
      const hits = raycasterRef.current.intersectObjects(objs, false);
      if (hits.length && hits[0].object.userData?.tip) {
        const tip = hits[0].object.userData.tip;
        setContextMenu({ x: e.clientX, y: e.clientY, hit: { tip, holeId: tip.split("\n")[0], point: hits[0].point.clone() } });
      } else setContextMenu({ x: e.clientX, y: e.clientY, hit: null });
    };
    const onAuxClick = (e) => { if (e.button === 1) e.preventDefault(); };

    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("contextmenu", onContextMenuEvt);
    dom.addEventListener("mousedown", onAuxClick);
    // TASKS.csv #207 — same "OS steals input mid-drag" safety net as SidebarResizeHandle.jsx/
    // LayoutModule.jsx's twin fixes: without this, an orbit/pan drag or an armed rectangle-zoom drag
    // left in progress when the window loses focus (screenshot tool, Alt-Tab, a notification) would
    // otherwise never see its "pointerup" and stay stuck — subsequent mouse moves anywhere would keep
    // orbiting the camera even with no button held. onPointerUp already tolerates being called without
    // a real PointerEvent (releasePointerCapture(undefined) is wrapped in try/catch), so it's reused
    // directly rather than duplicating its cleanup logic.
    window.addEventListener("blur", onPointerUp);
    // TASKS.csv #212 — user report: middle-mouse pan starting to rotate instead. "pointercancel" is
    // the browser's own explicit signal for "I'm taking over this pointer sequence for something else"
    // (its native middle-click autoscroll gesture being exactly that "something else" — onAuxClick's
    // preventDefault above is meant to suppress it, but isn't airtight across every Chromium/Electron
    // version) — a real pointerup may never follow once that happens. Combined with onPointerMove's own
    // new e.buttons===0 self-heal check just above, this closes the same "stuck drag state" class of
    // bug #207 fixed for window-blur, for this specific likely trigger instead.
    dom.addEventListener("pointercancel", onPointerUp);

    // Perf — idle-throttled render loop (see lastActivityRef comment above). requestAnimationFrame
    // itself always keeps ticking (so the throttle check below runs every ~16ms and idle→active
    // transitions are picked up immediately), but the actual expensive renderer.render() call is
    // skipped on ticks that land inside the idle cap's interval once the view has been still for
    // IDLE_AFTER_MS. This is a pure throttle, not a dirty-flag skip: it never depends on anything
    // "knowing" the scene changed, so there's no risk of a stale frame — worst case, an off-screen
    // change (an import finishing, a filter changing) takes up to one idle interval (~120ms) to
    // reach the screen instead of ~16ms, which is imperceptible for anything that isn't itself an
    // animation. Deliberately NOT gating tooltip/hover raycasting or camera math on this — those stay
    // exactly as responsive as before; only the GPU draw call is throttled.
    const IDLE_AFTER_MS = 400;
    const IDLE_FRAME_INTERVAL_MS = 120; // ~8fps while idle vs. ~60fps (uncapped) while active
    let raf;
    const animate = () => {
      // TASKS.csv #225 — while hidden (another tab showing), skip the render entirely rather than
      // falling back to the idle-throttled ~8fps: there's no viewer on screen at all, so even that is
      // pure waste. Keep the rAF loop itself ticking (re-arm unconditionally) rather than cancelling
      // it, so there's no separate "restart the loop on reveal" code path to ever miss — see the
      // reveal effect below for why a resize is still needed when this bail lifts.
      if (!visibleRef.current) { raf = requestAnimationFrame(animate); return; }
      const now = Date.now();
      const idle = now - lastActivityRef.current > IDLE_AFTER_MS;
      if (!idle || now - lastFrameAtRef.current >= IDLE_FRAME_INTERVAL_MS) {
        renderer.setViewport(0, 0, mount.clientWidth, mount.clientHeight);
        renderer.setScissorTest(false);
        renderer.render(scene, camera);
        compass.renderEachFrame(renderer, mount);
        axisGizmo.renderEachFrame(renderer, mount);
        lastFrameAtRef.current = now;
      }
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("contextmenu", onContextMenuEvt);
      dom.removeEventListener("mousedown", onAuxClick);
      window.removeEventListener("blur", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerUp);
      // Bug-hunt pass: this cleanup used to only remove the canvas + call renderer.dispose(), which
      // frees GL programs but NOT per-object geometry/material/texture buffers. Since only one module
      // is mounted at a time (see store.jsx), navigating away from the Viewer tab and back rebuilds the
      // whole scene from scratch every time, leaking every drillhole mesh/raster texture/terrain mesh/
      // implicit surface that existed at unmount. Walk the scene and dispose everything before tearing
      // down the renderer.
      scene.traverse((obj) => {
        obj.geometry?.dispose?.();
        const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        mats.forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
      });
      mount.removeChild(renderer.domElement); renderer.dispose();
    };
  }, [setCursor]);

  // TASKS.csv #225 — on becoming visible again, the ResizeObserver above won't necessarily have fired
  // (the mount's box size while `display:none` and its size just after `display:flex` can be
  // identical if the window itself didn't resize meanwhile — a CSS display change alone doesn't
  // guarantee a ResizeObserver callback), so force one resize + a full-rate frame explicitly. The
  // rAF wait lets the `display` change actually flush to layout first, so clientWidth/Height read
  // real numbers instead of the pre-change ones.
  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => {
      resizeFnRef.current?.();
      lastActivityRef.current = Date.now();
    });
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  const fitBox = useCallback((box, padFactor = 1.3, minRadius = 80) => {
    if (box.isEmpty()) return false;
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
    camState.current.target.copy(center); camState.current.radius = Math.max(minRadius, size * padFactor);
    cameraRef.current?.__update?.();
    return true;
  }, []);
  const fitView = useCallback((traces) => { const box = new THREE.Box3(); traces.forEach((pts) => pts.forEach((p) => box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z)))); fitBox(box); }, [fitBox]);
  const zoomToLayer = useCallback((key) => {
    const group = layerGroupsRef.current[key];
    if (!group || !group.children.length) { setNotices((p) => [...p, `${LAYER_META[key]?.label || key}: nothing rendered to zoom to.`]); return; }
    fitBox(new THREE.Box3().setFromObject(group));
  }, [fitBox]);
  const zoomToCustom = useCallback((id) => { const g = layerGroupsRef.current[id]; if (g && g.children.length) fitBox(new THREE.Box3().setFromObject(g)); }, [fitBox]);
  const zoomToFitAll = () => fitView(lastTracesRef.current);
  const zoomToPoint = (point) => fitBox(new THREE.Box3().setFromCenterAndSize(point, new THREE.Vector3(80, 80, 80)));
  const resetView = () => { camState.current.theta = Math.PI / 4; camState.current.phi = Math.PI / 3; cameraRef.current?.__update?.(); };

  // ---------- right-click "Zoom to selected area": drag a rectangle, fit the view to it ----------
  const projectToScreen = useCallback((v3, mount, camera) => {
    const p = v3.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * mount.clientWidth, y: (-p.y * 0.5 + 0.5) * mount.clientHeight };
  }, []);
  const zoomToScreenRect = useCallback((d) => {
    const mount = mountRef.current, camera = cameraRef.current;
    if (!mount || !camera) return;
    const x0 = Math.min(d.x1, d.x2), x1 = Math.max(d.x1, d.x2);
    const y0 = Math.min(d.y1, d.y2), y1 = Math.max(d.y1, d.y2);
    // Primary approach: which drillhole-trace points project inside the rectangle? This covers the
    // full 3D extent of the model (not just the ground plane), using trace geometry that's always
    // present once holes are loaded, regardless of which layers happen to be visible.
    const box = new THREE.Box3();
    tracesRef.current.forEach((t) => {
      t.pts.forEach((p) => {
        const sp = projectToScreen(new THREE.Vector3(p.x, p.y, p.z), mount, camera);
        if (sp.x >= x0 && sp.x <= x1 && sp.y >= y0 && sp.y <= y1) box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z));
      });
    });
    if (!box.isEmpty()) { fitBox(box, 1.25, 20); return; }
    // Fallback (e.g. the rectangle only covers empty ground, no traces underneath): unproject its
    // four corners onto the ground plane instead, same ray/plane technique as cross-section picking.
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const box2 = new THREE.Box3();
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([sx, sy]) => {
      const nx = (sx / mount.clientWidth) * 2 - 1, ny = -(sy / mount.clientHeight) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, hit)) box2.expandByPoint(hit);
    });
    if (!box2.isEmpty()) fitBox(box2, 1.25, 20);
  }, [fitBox, projectToScreen]);
  useEffect(() => { zoomToScreenRectRef.current = zoomToScreenRect; }, [zoomToScreenRect]);

  // ---------- grid display (TASKS.csv: grid toggle/adjust/3D) ----------
  useEffect(() => {
    if (!sceneRef.current) return;
    if (gridGroupRef.current) { sceneRef.current.remove(gridGroupRef.current); disposeThreeGroup(gridGroupRef.current); }
    const group = buildGridGroup(gridConfig);
    sceneRef.current.add(group);
    gridGroupRef.current = group;
  }, [gridConfig]);

  // ---------- TASKS.csv #16: snapshot the live 3D viewport into a Layout page image ----------
  const snapshotToLayout = useCallback(() => {
    const renderer = rendererRef.current, scene = sceneRef.current, camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    // Force one fresh render right before capture (the compass overlay uses setScissor/setViewport
    // tricks each frame, so grabbing the canvas mid-frame could catch it half-drawn).
    renderer.setViewport(0, 0, mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setScissorTest(false);
    renderer.render(scene, camera);
    const canvas = renderer.domElement;
    let dataUrl;
    try { dataUrl = canvas.toDataURL("image/png"); } catch (err) { setNotices((p) => [...p, `Snapshot failed: ${err.message}`]); return; }
    addLayoutImage({ label: "3D Viewport", src: dataUrl, naturalW: canvas.width, naturalH: canvas.height });
    goToModule("layout");
    setNotices((p) => [...p, "Viewport snapshot added to the Layout page."]);
  }, [addLayoutImage, goToModule]);

  // ---------- TASKS.csv #45: saved "themes" (named view configurations) ----------
  // Bundles everything already tracked in viewerUiState (layer visibility/filters/legend/grid/etc.)
  // plus the camera (camState isn't part of viewerUiState — that mirror only covers *display*
  // preferences, not "where the camera happens to be pointed", which a theme also needs to capture).
  // TASKS.csv #202 — factored out of captureCurrentTheme so the SAME "everything a theme captures"
  // bundle can also be used to snapshot the user's own live view before a Layout Viewport render
  // temporarily applies a DIFFERENT theme, and restore it afterward (see the viewportRenderRequestSeq
  // effect below) — without that restore, opening/refreshing a themed Viewport on the Layout page
  // silently overwrote whatever layers/filters/camera angle the user actually had live in the 3D
  // View tab with that viewport's theme, which is exactly the "3d view... reload[s] layers that were
  // turned off... when switching to another module and then switching back to 3d view" bug report —
  // reproduced and confirmed via Playwright before this fix (see TASKS.csv notes).
  const currentViewBundle = useCallback(() => {
    const cs = camState.current;
    return {
      layerVisible, numericRange, legendOverride, visibleHoles, customVisible, assayVisible, assayDisplayElements, assayStyle,
      categoryFilter: Object.fromEntries(Object.entries(categoryFilter).map(([k, v]) => [k, Array.from(v)])),
      gridConfig,
      camState: { theta: cs.theta, phi: cs.phi, radius: cs.radius, target: { x: cs.target.x, y: cs.target.y, z: cs.target.z } },
    };
  }, [layerVisible, categoryFilter, numericRange, legendOverride, visibleHoles, customVisible, assayVisible, assayDisplayElements, assayStyle, gridConfig]);

  // TASKS.csv #202 — root-cause fix. currentViewBundle() above reads local component state
  // (layerVisible, etc), which is fine for a NORMAL user action (Save theme) but turned out to be
  // exactly wrong for the Layout-Viewport-render round trip: that flow mounts a FRESH ViewerModule
  // instance specifically to do the render (goToModule("viewer") from LayoutModule), and on that
  // fresh mount, local state starts at its hardcoded defaults (DEFAULT_LAYER_VISIBLE etc) for the
  // very first render/effect-flush — the hydrate-from-store effect that would correct it to the
  // user's ACTUAL last state hasn't committed yet by the time this SAME initial flush also runs the
  // theme-apply effect below. Confirmed via instrumented Playwright logging: currentViewBundle()
  // captured litho:true (the stale hardcoded default) as "the user's live view" on that fresh mount,
  // even though the user had actually just toggled litho OFF — so "restoring" it only put back the
  // wrong default, never the user's real prior state. The store's own `viewerUiState` doesn't have
  // this problem: it's owned by StoreProvider (never unmounts) and was already correctly updated by
  // the PREVIOUS ViewerModule instance's last push before it unmounted — so building the "live view to
  // restore" bundle from viewerUiState directly, instead of from local state, sidesteps the race
  // entirely rather than trying to win it.
  const liveViewBundleFromStore = useCallback(() => {
    const cs = camState.current;
    const s = viewerUiState;
    return {
      layerVisible: { ...DEFAULT_LAYER_VISIBLE, ...(s?.layerVisible || {}) },
      categoryFilter: s?.categoryFilter || {},
      numericRange: s?.numericRange || {},
      legendOverride: s?.legendOverride || {},
      visibleHoles: s?.visibleHoles || {},
      customVisible: s?.customVisible || {},
      assayVisible: s?.assayVisible !== false,
      assayDisplayElements: s?.assayDisplayElements || (s?.assayDisplayElement ? [s.assayDisplayElement] : []),
      assayStyle: s?.assayStyle || {},
      gridConfig: { ...DEFAULT_GRID, ...(s?.gridConfig || {}) },
      camState: { theta: cs.theta, phi: cs.phi, radius: cs.radius, target: { x: cs.target.x, y: cs.target.y, z: cs.target.z } },
    };
  }, [viewerUiState]);

  // TASKS.csv #198 — root-cause fix for the Layout Viewport render round-trip silently never
  // completing (no capture, no error, no hop back to Layout — permanently stuck showing the applied
  // theme on the 3D View tab). The viewport-render effect below used to list liveViewBundleFromStore
  // directly in its dependency array, but that callback's own identity depends on `viewerUiState`
  // (see its definition above) — and viewerUiState is EXACTLY what the "push local state up to the
  // store" effect (a few lines up) updates every time applyTheme() changes layerVisible/etc, which
  // this same effect calls as its very first action. So: effect runs -> applyTheme() changes local
  // state -> the push-effect fires -> setViewerUiState() -> liveViewBundleFromStore's identity
  // changes -> THIS effect's dependency array changed -> React tears down the just-scheduled 400ms
  // capture timer via the cleanup function before it ever fires, then re-runs the effect body, which
  // now short-circuits on the lastHandledRequestId guard (correctly avoiding re-applying the theme a
  // second time) but returns without scheduling a REPLACEMENT timer either — permanently stranding
  // the request with no timer, no capture, no error, nothing. Confirmed via instrumented Playwright-
  // style testing: patched toDataURL and setTimeout(…,400) to log calls, triggered a brand-new
  // Layout Viewport bind, and confirmed BOTH fired zero times, with the module stuck on the 3D View
  // tab indefinitely. Fix: read the live-view snapshot through a ref that's updated in its own
  // separate, harmless effect, instead of depending on the reactive binding directly — the render
  // effect below now depends on liveViewBundleFromStoreRef (a stable ref object, never a new
  // identity) instead of liveViewBundleFromStore itself, so the theme-apply side effect's ripple
  // through viewerUiState no longer retriggers (and kills) this effect.
  const liveViewBundleFromStoreRef = useRef(liveViewBundleFromStore);
  useEffect(() => { liveViewBundleFromStoreRef.current = liveViewBundleFromStore; }, [liveViewBundleFromStore]);

  const captureCurrentTheme = useCallback((name) => {
    addTheme({ name, ...currentViewBundle() });
    setNotices((p) => [...p, `Saved theme "${name}".`]);
  }, [addTheme, currentViewBundle]);

  const applyTheme = useCallback((theme) => {
    setLayerVisible({ ...DEFAULT_LAYER_VISIBLE, ...(theme.layerVisible || {}) });
    setCategoryFilter(Object.fromEntries(Object.entries(theme.categoryFilter || {}).map(([k, v]) => [k, new Set(v)])));
    setNumericRange(theme.numericRange || {});
    setLegendOverride(theme.legendOverride || {});
    setVisibleHoles(theme.visibleHoles || {});
    setCustomVisible(theme.customVisible || {});
    setAssayVisible(theme.assayVisible !== false);
    setAssayDisplayElements(theme.assayDisplayElements || (theme.assayDisplayElement ? [theme.assayDisplayElement] : []));
    setAssayStyle(theme.assayStyle || {});
    setGridConfig({ ...DEFAULT_GRID, ...(theme.gridConfig || {}) });
    if (theme.camState) {
      const cs = camState.current;
      cs.theta = theme.camState.theta; cs.phi = theme.camState.phi; cs.radius = theme.camState.radius;
      const t = theme.camState.target || { x: 0, y: 0, z: 0 };
      cs.target.set(t.x, t.y, t.z);
      cameraRef.current?.__update?.();
    }
  }, []);

  // TASKS.csv #202 fix, continued — restoring the user's live view via applyTheme() alone (which only
  // sets LOCAL component state) turned out not to be enough: goToModule("layout") fires from store.jsx
  // right after resolveViewportRender, and when that lands in the same React batch as this restore,
  // ViewerModule can unmount before its own "push local state up to store.viewerUiState" effect (the
  // one a few lines below, keyed on [layerVisible, ...]) gets a chance to actually run for the RESTORED
  // values — so the store was left holding the THEME's values even though local state looked right for
  // an instant. Confirmed via Playwright: applyTheme(liveViewBeforeRender) alone did NOT fix the repro.
  // Writing straight to setViewerUiState here removes the dependency on that effect ordering entirely —
  // the store is corrected directly, synchronously, regardless of whether ViewerModule sticks around
  // long enough to run its own effects again.
  const restoreLiveView = useCallback((bundle) => {
    applyTheme(bundle);
    setViewerUiState({
      layerVisible: bundle.layerVisible,
      categoryFilter: bundle.categoryFilter, // already array-serialized by currentViewBundle()
      numericRange: bundle.numericRange,
      legendOverride: bundle.legendOverride,
      visibleHoles: bundle.visibleHoles,
      customVisible: bundle.customVisible,
      assayVisible: bundle.assayVisible,
      assayDisplayElements: bundle.assayDisplayElements,
      assayStyle: bundle.assayStyle,
      gridConfig: bundle.gridConfig,
      bgColor,
    });
  }, [applyTheme, setViewerUiState, bgColor]);

  // Layout's Viewport element (#46) asks for a re-render of a theme via store.requestViewportRender()
  // — see the long comment on that in store.jsx. This module isn't guaranteed to be mounted when the
  // request is made (Layout and Viewer are never both mounted), so goToModule("viewer") on the caller
  // side handles getting us mounted; from here it's just "apply the theme, wait for it to actually be
  // on screen, capture, resolve". The state changes above are async (React state + a full geometry/
  // visibility re-render), but there's already a continuous requestAnimationFrame render loop running
  // (see `animate` in the mount effect) redrawing every frame regardless — so a short fixed delay
  // after applying is enough for the state to have committed and painted at least a few frames before
  // capture, without needing to thread a completion signal through every state setter.
  // TASKS.csv #198 (part 3) — the actual "render + capture" work, extracted out of the setTimeout
  // callback so it can be invoked either by the automatic 400ms timer (non-interactive: "Add
  // viewport" / "Refresh from theme") or by the interactive session's manual "Update Viewport &
  // Return to Layout" button, once the user has finished orbiting/panning/zooming. Identical logic
  // either way — only WHEN it's called differs.
  const doCaptureViewportRender = useCallback((req, liveViewBeforeRender) => {
    const theme = themes.find((t) => t.id === req.themeId);
    const renderer = rendererRef.current, scene = sceneRef.current, camera = cameraRef.current;
    if (!renderer || !scene || !camera) { restoreLiveView(liveViewBeforeRender); resolveViewportRender({ requestId: req.requestId, error: "Viewport not ready." }); return; }
    renderer.setViewport(0, 0, mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setScissorTest(false);

    const cs = camState.current;
    const fovRad = (camera.fov * Math.PI) / 180;
    // TASKS.csv #69 — true-scale (orthographic) capture. A perspective camera's world-to-pixel
    // scale is only exact AT the target distance (cs.radius) — nearer/farther geometry reads
    // larger/smaller than that ratio, same as a real photo. An orthographic (parallel) projection
    // has no such depth-dependent foreshortening: its frustum's world height is the SAME everywhere
    // along the view direction, so reusing that same height for BOTH the frustum size and the
    // reported scale makes worldHeightAtTarget exact across the whole image, not an estimate valid
    // only at one particular distance. Built fresh per capture (not a persistent second camera) —
    // this never touches the live interactive `camera`, which stays perspective for normal use.
    let renderCamera = camera;
    let orthoCamera = null;
    if (req.trueScale) {
      const aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      const halfH = cs.radius * Math.tan(fovRad / 2); // same half-height the perspective camera frames AT the target distance — reused so the orthographic capture shows "the same amount of world" as what was already framed, just without the depth-dependent scale drift
      const halfW = halfH * aspect;
      orthoCamera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, camera.near, camera.far);
      orthoCamera.position.copy(camera.position);
      orthoCamera.quaternion.copy(camera.quaternion);
      orthoCamera.updateProjectionMatrix();
      renderCamera = orthoCamera;
    }
    renderer.render(scene, renderCamera);
    // No disposal needed for orthoCamera even though it's discarded right after this — a THREE
    // camera holds no GPU resources (no geometry/material/texture), just plain JS-side matrices.
    const canvas = renderer.domElement;
    let dataUrl;
    try { dataUrl = canvas.toDataURL("image/png"); } catch (err) { restoreLiveView(liveViewBeforeRender); resolveViewportRender({ requestId: req.requestId, error: err.message }); return; }
    const worldHeightAtTarget = 2 * cs.radius * Math.tan(fovRad / 2); // same figure either way — see the orthographic branch's comment for why it's exact (not approximate) when req.trueScale is set
    // TASKS.csv #67 — north-arrow sync. Worked out from first principles and checked numerically
    // (not just by analogy) rather than trusting a guess: CompassRose.js rotates its 3D ring by
    // -cs.theta about Y and views it through a straight-down navCamera with up=(0,0,-1), so N (ring
    //-local (0,0,-1)) ends up at screen position (right, up) = (0,1) at theta=0, (1,0) at theta=90°,
    // (0,-1) at theta=180°, (-1,0) at theta=270° — i.e. N sweeps CLOCKWISE on screen as theta
    // increases (verified with the camera's actual basis vectors, not assumed). A plain CSS
    // `rotate(deg)` is also clockwise-positive, so matching that screen motion with a printed north
    // arrow (which defaults to pointing "up" = N at theta=0) needs `rotate(+thetaDeg)` — the SAME
    // sign as cs.theta itself, the OPPOSITE of the ring's own -theta. The two need opposite signs
    // because rendering the ring through a top-down camera flips handedness relative to a flat 2D
    // CSS rotation on the printed page — reusing the ring's -theta directly here would point every
    // synced arrow off by a mirror-flip, not just a wrong-but-consistent offset.
    const cameraAzimuthDeg = ((cs.theta * 180) / Math.PI) % 360;
    // Restore the user's own live view now that every value the capture needed (dataUrl,
    // worldHeightAtTarget, cameraAzimuthDeg) has already been read out of `cs`/the canvas above —
    // this is what actually fixes #202 (see this effect's top comment): without it, the theme
    // applied for this capture was left in place, silently showing up as "my toggled-off layers
    // are back on" whenever the user next looked at the 3D View tab.
    restoreLiveView(liveViewBeforeRender);
    resolveViewportRender({
      requestId: req.requestId, src: dataUrl, naturalW: canvas.width, naturalH: canvas.height,
      worldHeightAtTarget, themeName: theme?.name, cameraAzimuthDeg, trueScale: !!req.trueScale,
    });
    // Hopping back to "layout" now happens in store.jsx's own result-effect (right after it applies
    // this result to layoutElements), not here — that effect also covers the "Theme not found"/
    // "Viewport not ready" error returns above, which never used to hop back at all, leaving the
    // user stranded on the Viewer tab with no visible error.
  }, [themes, restoreLiveView, resolveViewportRender]);

  useEffect(() => {
    const req = viewportRenderRequest;
    if (!req) return;
    // TASKS.csv #225 — must come BEFORE lastHandledRequestId is ever set for this request (below): if
    // this effect fires while the viewer is the hidden tab (a Layout viewport request can arrive
    // before goToModule("viewer") has actually made ViewerModule the visible one), the capture below
    // would run against a 0-size hidden canvas (NaN aspect, garbage/blank PNG) — the exact #198-era bug
    // class this whole round-trip already had to fix once. Returning here WITHOUT marking the request
    // handled means once `visible` flips true (it's in this effect's own dependency array below) this
    // same effect re-runs and proceeds normally — marking it handled first would permanently swallow
    // the request instead.
    if (!visible) return;
    // TASKS.csv #202 — root-cause fix #2. The old guard compared viewportRenderRequestSeq against a
    // local `lastRenderReqSeq` ref that starts fresh at -1/0 on every mount, while the seq itself is
    // store-level and never resets — so ANY fresh ViewerModule mount (a plain manual switch back to
    // the 3D View tab, with NO Layout viewport involved at all) would see "seq changed since my own
    // -1" and spuriously REPLAY the last-ever viewport render request, silently re-applying that old
    // theme over whatever the user actually had visible. Confirmed via instrumented Playwright
    // logging: switching to 3D View a SECOND time (well after the Layout viewport round trip had
    // already finished and correctly restored the live view) re-triggered "applyTheme ThemeA" again
    // out of nowhere. viewportPendingRequest is the fix: store.jsx clears it to null once a request is
    // actually serviced (see its own result-effect), so checking it here — rather than a mount-local
    // seq ref — correctly distinguishes "there is real, unserviced work for me to do" from "this is
    // just the same old request object sitting around from earlier in the session".
    if (!viewportPendingRequest || viewportPendingRequest.requestId !== req.requestId) return;
    if (lastHandledRequestId.current === req.requestId) return; // avoid double-handling within one mount's re-renders
    lastHandledRequestId.current = req.requestId;
    // TASKS.csv — user request: "add a feature on the layout view that will let the user add a
    // viewport with the current view and not only when save a theme." A falsy themeId (null/
    // undefined) means "just capture whatever's live right now" — no theme to look up or apply at
    // all, skip straight to the same snapshot/capture/restore path every themed viewport already uses.
    // A NON-falsy themeId that doesn't resolve to a real theme is still the original error case (the
    // theme was deleted after this request was queued).
    const theme = req.themeId ? themes.find((t) => t.id === req.themeId) : null;
    if (req.themeId && !theme) { resolveViewportRender({ requestId: req.requestId, error: "Theme not found (it may have been deleted)." }); return; }
    // TASKS.csv #202 fix — snapshot whatever the user actually had live (layers/filters/camera)
    // BEFORE temporarily swapping in the requested theme, so it can be restored once the capture
    // below is done rather than left showing the theme's config after the fact. For a themeless
    // "current view" request this snapshot IS what gets captured (applyTheme below is skipped
    // entirely), and restoring it afterward is still correct — it's a no-op restore of the exact
    // state that's already live.
    const liveViewBeforeRender = liveViewBundleFromStoreRef.current();
    if (theme) applyTheme(theme);
    // TASKS.csv #198 (part 3) — interactive sessions skip the automatic timer entirely: the theme's
    // camera is now live on screen, the existing orbit/pan/zoom pointer handlers already work
    // unconditionally, and the user drives when capture actually happens via the banner below
    // (doExitInteractiveViewport / doCancelInteractiveViewport).
    if (req.interactive) {
      setInteractiveViewportSession({ req, liveViewBeforeRender });
      return;
    }
    const timer = setTimeout(() => doCaptureViewportRender(req, liveViewBeforeRender), 400);
    return () => clearTimeout(timer);
    // liveViewBundleFromStore deliberately NOT in this list — see liveViewBundleFromStoreRef's own
    // comment above for why depending on it directly reintroduces the bug it looks like it should
    // have nothing to do with.
  }, [viewportRenderRequest, viewportPendingRequest, themes, applyTheme, doCaptureViewportRender, resolveViewportRender, goToModule, visible]);

  // TASKS.csv #198 (part 3) — the interactive session's two exit paths. Both restore/resolve exactly
  // like the non-interactive path; "cancel" just resolves with an error instead of a captured image,
  // which store.jsx's existing result-effect already treats as "leave the viewport element alone,
  // just hop back to Layout" (see its `res.error` branch) — no new store-side handling needed.
  const doExitInteractiveViewport = useCallback(() => {
    if (!interactiveViewportSession) return;
    const { req, liveViewBeforeRender } = interactiveViewportSession;
    setInteractiveViewportSession(null);
    doCaptureViewportRender(req, liveViewBeforeRender);
  }, [interactiveViewportSession, doCaptureViewportRender]);
  const doCancelInteractiveViewport = useCallback(() => {
    if (!interactiveViewportSession) return;
    const { req, liveViewBeforeRender } = interactiveViewportSession;
    setInteractiveViewportSession(null);
    restoreLiveView(liveViewBeforeRender);
    resolveViewportRender({ requestId: req.requestId, error: "Cancelled — viewport left unchanged." });
  }, [interactiveViewportSession, restoreLiveView, resolveViewportRender]);

  // ---------- TASKS.csv #29: implicit surface modelling (GemPy), first pass ----------
  // Scope of this first pass, deliberately kept narrow: model ONE contact surface at a time (the
  // top of a chosen lithology unit), from whatever data is already in the project — no new import
  // type, no UI for hand-picking which points/orientations to use. Interface points come from every
  // litho interval's top-of-unit depth (row.from) across all holes where that unit occurs; orientation
  // data comes from the structure layer (preferring "CON"/contact picks, falling back to any
  // structure pick if there are no contacts logged) — both already sit in the store, desurveyed via
  // the same tracesRef used to draw everything else, so points/orientations are computed in the same
  // local scene coordinate system the rest of the viewer already uses (origin at the collar
  // centroid, Y = elevation/up, Z = -northing offset) rather than raw world coordinates — that way
  // the mesh GemPy returns can be added to the scene with zero extra transform. What this does NOT
  // do yet: multi-surface stratigraphic stacks, faults, or picking which points feed the model by
  // hand — see TASKS.csv for the follow-up items this opens up.
  const litho_units = distinctValues(layers.litho || []).map(([v]) => v);
  const alt_units = distinctValues(layers.alt || []).map(([v]) => v);
  const struct_types = distinctValues(layers.structure || []).map(([v]) => v);

  // The sidebar's notices list sits below the (potentially long) Holes list, so on a property with
  // many holes a new notice can land far off-screen with nothing drawing the eye to it — from the
  // user's side that reads as "I clicked the button and nothing happened", even when it actually
  // failed (or succeeded) and said so. Mirror the latest notice as a floating toast over the
  // viewport itself, which is always visible regardless of sidebar scroll position.
  useEffect(() => {
    if (!notices.length) return;
    const text = notices[notices.length - 1];
    const key = notices.length;
    setToast({ text, key });
    const t = setTimeout(() => setToast((cur) => (cur && cur.key === key ? null : cur)), 5000);
    return () => clearTimeout(t);
  }, [notices]);

  // The sidecar's /implicit-model endpoint computes each orientation's gradient from dip/azimuth
  // assuming standard geographic axes (x=east, y=north, z=up) — a sensible default for an endpoint
  // meant to be generically reusable, not tied to this viewer's internal scene layout. But this
  // module's local scene axes are different (see the tracesRef.current.push(...) a few hundred lines
  // up: scene x = east offset, scene y = elevation/up, scene z = -(northing offset)) — chosen so the
  // camera's default "Y is up" orientation works without extra rotation. So points/extent are
  // permuted to (east, north, up) on the way out, and the returned mesh vertices are permuted back to
  // (x, up, -north) on the way in, keeping the dip/azimuth math correct without leaking this scene's
  // particular axis choice into the sidecar's API.
  const sceneToApi = (p) => ({ x: p.x, y: -p.z, z: p.y });
  const apiToScene = (v) => ({ x: v[0], y: v[2], z: -v[1] });

  // Turns a set of structure picks into GemPy orientations (scene coords, permuted to the sidecar's
  // geographic axes). Shared by all three modeling tools below — the litho and alteration tools look
  // this up from a separate structure-layer pick (preferring "CON" contacts, else any pick with a
  // dip/azimuth); the structural tool instead feeds its own picks in here, since a fault or shear
  // pick's own dip/azimuth already IS the orientation it wants modelled.
  // TASKS.csv #89 — restricts a set of interval/structure rows to only those whose scene position
  // falls on the correct side of every fault constraint in the currently-selected domain (or returns
  // rows unchanged if "Whole property" is selected — same behavior as before #89 existed). Applied
  // before rows are converted into interface points/orientations in the litho/structural/alteration
  // tools below, so a domain genuinely restricts what a modelling run sees rather than just labeling
  // the output afterward.
  const filterRowsByDomain = (rows, traces, getDepth) => {
    const domain = domains.find((d) => d.id === modelDomainId);
    if (!domain) return rows;
    return rows.filter((r) => {
      const t = traces.find((tr) => tr.hole_id === r.hole_id);
      if (!t) return false;
      const p = findOnTrace(t.pts, getDepth(r));
      if (!p) return false;
      return pointInDomain(p, domain, implicitMeshesRef.current);
    });
  };

  // TASKS.csv #85 — same idea as filterBySearchSupport above, but for rows (like the structural tool's
  // own picks) whose position AND some other per-row payload (dip/azimuth) both need to stay in sync,
  // so it filters the rows themselves rather than a plain points array.
  const filterRowsBySearchEllipsoid = (rows, traces, getDepth) => {
    if (!searchEllipsoid.enabled) return rows;
    const withPos = rows.map((r) => {
      const t = traces.find((tr) => tr.hole_id === r.hole_id);
      if (!t) return null;
      const p = findOnTrace(t.pts, getDepth(r));
      if (!p) return null;
      return { r, api: sceneToApi(p) };
    }).filter(Boolean);
    const basis = searchEllipsoidBasis(searchEllipsoid.azimuth, searchEllipsoid.dip);
    return withPos.filter((item, i) => {
      let count = 0;
      for (let j = 0; j < withPos.length; j++) {
        if (i === j) continue;
        if (searchEllipsoidDistSq(item.api, withPos[j].api, basis, searchEllipsoid) <= 1) count++;
        if (count >= searchEllipsoid.minSamples) break;
      }
      return count >= searchEllipsoid.minSamples;
    }).map((item) => item.r);
  };

  const structureRowsToOrientations = (rows, traces) => {
    const orientations = [];
    rows.forEach((s) => {
      const t = traces.find((tr) => tr.hole_id === s.hole_id);
      if (!t) return;
      const p = findOnTrace(t.pts, s.depth);
      if (!p) return;
      const api = sceneToApi(p);
      orientations.push({ x: api.x, y: api.y, z: api.z, dip: s.dip, azimuth: s.azimuth });
    });
    return orientations;
  };

  // Fallback for when there's no structure-layer data to draw an orientation from: fits a best-fit
  // plane (ordinary least squares, z ≈ a·x + b·y + c — a standard "trend surface" fit, reasonable
  // for a lithology or alteration contact, which is never anywhere near vertical) through the
  // interface points themselves, and derives a single averaged dip/azimuth from the plane's normal.
  // This is what lets the litho/alteration tools model a surface from contacts alone, without
  // requiring a separate structure CSV — GemPy still needs at least one orientation to know which
  // way is "up" across the surface, so if none is supplied explicitly, the points imply one instead.
  // Needs 3+ points to fit a plane; with fewer, falls back to a flat (dip 0) guess at the centroid,
  // which is the best "we don't know" default when there isn't enough geometry to infer a trend.
  const estimateOrientationFromPoints = (points) => {
    const n = points.length;
    const cx = points.reduce((s, p) => s + p.x, 0) / n;
    const cy = points.reduce((s, p) => s + p.y, 0) / n;
    const cz = points.reduce((s, p) => s + p.z, 0) / n;
    if (n < 3) return { x: cx, y: cy, z: cz, dip: 0, azimuth: 0 };

    let Sxx = 0, Sxy = 0, Sx = 0, Syy = 0, Sy = 0, Sxz = 0, Syz = 0, Sz = 0;
    points.forEach((p) => {
      Sxx += p.x * p.x; Sxy += p.x * p.y; Sx += p.x;
      Syy += p.y * p.y; Sy += p.y;
      Sxz += p.x * p.z; Syz += p.y * p.z; Sz += p.z;
    });
    // Solve [[Sxx,Sxy,Sx],[Sxy,Syy,Sy],[Sx,Sy,n]] · [a,b,c]ᵀ = [Sxz,Syz,Sz]ᵀ via Cramer's rule.
    const det3 = (m) => (
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
    const M = [[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, n]];
    const D = det3(M);
    if (Math.abs(D) < 1e-9) return { x: cx, y: cy, z: cz, dip: 0, azimuth: 0 }; // degenerate (collinear) point set
    const Ma = [[Sxz, Sxy, Sx], [Syz, Syy, Sy], [Sz, Sy, n]];
    const Mb = [[Sxx, Sxz, Sx], [Sxy, Syz, Sy], [Sx, Sz, n]];
    const a = det3(Ma) / D, b = det3(Mb) / D;

    // Plane normal (unnormalized) is (-a, -b, 1) in (east, north, up); normalize with z>0 so it
    // points "up" out of the layer, matching the sidecar's gradient convention
    // (gx=sin(dip)sin(az), gy=sin(dip)cos(az), gz=cos(dip)) — so dip/azimuth fall straight out of
    // the normalized normal's components.
    const len = Math.sqrt(a * a + b * b + 1);
    const nx = -a / len, ny = -b / len, nz = 1 / len;
    const dip = (Math.acos(Math.min(1, Math.max(-1, nz))) * 180) / Math.PI;
    let azimuth = (Math.atan2(nx, ny) * 180) / Math.PI;
    if (azimuth < 0) azimuth += 360;
    return { x: cx, y: cy, z: cz, dip, azimuth };
  };

  // Shared core for all modeling tools: takes one or more already-gathered {label, meshName, points,
  // orientations, color} specs, sends them all in a SINGLE sidecar request, and adds each resulting
  // mesh to the scene. Sending multiple surfaces together (rather than one call per unit) matters for
  // more than efficiency: the sidecar puts every surface in the request into one GemPy
  // StructuralGroup (see python-sidecar/app/main.py), which fits them as ordered iso-surfaces of ONE
  // shared scalar field — that's what makes a stratigraphic stack come out non-crossing by
  // construction, rather than as N independently-fit planes that happen to intersect each other.
  // Order in `specs` matters: GemPy treats it as youngest-first (see runStackModel below).
  const runSurfaceStack = useCallback(async (rawSpecs) => {
    const traces = tracesRef.current;
    // TASKS.csv #187 — bug fix: a real user hit "Stratigraphic stack (DACT, VCL, SED) failed:
    // [object Object],[object Object],[object Object]" (fixed the unreadable-error half of this in
    // desktop.js's pythonImplicitModel/pythonInterpolate — FastAPI's 422 `detail` is an array of
    // {loc,msg,type} objects, not a string, and used to be handed straight to a template string).
    // This half addresses the likely CAUSE of a validation error in the first place: any point or
    // orientation carrying a non-finite x/y/z/dip/azimuth (e.g. a bad/blank cell surviving CSV
    // import as a string, or a hole trace gap producing an unexpected value) serializes through
    // JSON.stringify as `null` for that field, which FastAPI's `float` type rejects — one 422 entry
    // per bad field, i.e. exactly the "3 items" shape seen in the report for a 3-unit stack. Rather
    // than letting that reach the sidecar as an inscrutable per-field validation error, filter each
    // spec's points/orientations to finite values here, with a clear notice about what got dropped
    // and why — same "explain, don't silently degrade" pattern used for the search-ellipsoid/domain
    // filters elsewhere in this function's callers.
    const isFiniteNum = (v) => typeof v === "number" ? Number.isFinite(v) : Number.isFinite(Number(v)) && String(v).trim() !== "";
    const specs = [];
    rawSpecs.forEach((spec) => {
      const badPoints = spec.points.length;
      const points = spec.points.filter((p) => isFiniteNum(p.x) && isFiniteNum(p.y) && isFiniteNum(p.z)).map((p) => ({ ...p, x: Number(p.x), y: Number(p.y), z: Number(p.z) }));
      const badOrientations = spec.orientations.length;
      const orientations = spec.orientations.filter((o) => isFiniteNum(o.x) && isFiniteNum(o.y) && isFiniteNum(o.z) && isFiniteNum(o.dip) && isFiniteNum(o.azimuth))
        .map((o) => ({ ...o, x: Number(o.x), y: Number(o.y), z: Number(o.z), dip: Number(o.dip), azimuth: Number(o.azimuth) }));
      const droppedPoints = badPoints - points.length, droppedOrientations = badOrientations - orientations.length;
      if (droppedPoints || droppedOrientations) {
        const parts = [];
        if (droppedPoints) parts.push(`${droppedPoints} point(s)`);
        if (droppedOrientations) parts.push(`${droppedOrientations} orientation(s)`);
        setNotices((p) => [...p, `"${spec.label}": dropped ${parts.join(" and ")} with a missing/invalid x, y, z, dip, or azimuth value before sending to the sidecar — check the source CSV for blank or non-numeric cells in those columns.`]);
      }
      if (!points.length) { setNotices((p) => [...p, `"${spec.label}": no usable points left after removing invalid ones — skipped.`]); return; }
      if (!orientations.length) { setNotices((p) => [...p, `"${spec.label}": no usable orientations left after removing invalid ones — skipped.`]); return; }
      specs.push({ ...spec, points, orientations });
    });
    if (!specs.length) { setNotices((p) => [...p, "Nothing left to model after removing invalid points/orientations — see notices above for which columns to check."]); return; }
    const clipDomain = clipToDomainBoundary ? domains.find((d) => d.id === modelDomainId) : null;
    // Extent spans every hole trace (not just these surfaces' own points) so the modelled surface(s)
    // cover the whole property, with ~15% padding on each side. Computed in API (east/north/up)
    // space to match the points/orientations above.
    const allApiPts = traces.flatMap((t) => t.pts).map(sceneToApi);

    // TASKS.csv #86 — when anisotropy is enabled, EVERY api-space coordinate that crosses the sidecar
    // boundary (extent corners, interface points, orientation positions+directions) gets warped by the
    // same transform before the request, and every returned mesh vertex gets un-warped after — see the
    // anisoWarp*/anisoScales module functions' own comments for why. `center` is the centroid of all
    // hole-trace points (not just this run's own control points) so the warp is anchored consistently
    // across different tools/runs rather than drifting per-request.
    const anisoBasis = anisotropy.enabled ? searchEllipsoidBasis(anisotropy.azimuth, anisotropy.dip) : null;
    const anisoScl = anisotropy.enabled ? anisoScales(anisotropy) : null;
    const anisoCenter = anisotropy.enabled && allApiPts.length
      ? { x: allApiPts.reduce((s, p) => s + p.x, 0) / allApiPts.length, y: allApiPts.reduce((s, p) => s + p.y, 0) / allApiPts.length, z: allApiPts.reduce((s, p) => s + p.z, 0) / allApiPts.length }
      : null;
    const warpedApiPts = anisotropy.enabled ? allApiPts.map((p) => anisoWarpPoint(p, anisoCenter, anisoBasis, anisoScl)) : allApiPts;

    const xs = warpedApiPts.map((p) => p.x), ys = warpedApiPts.map((p) => p.y), zs = warpedApiPts.map((p) => p.z);
    // Never pads more than MODEL_EXTENT_PAD_M past the actual data on any axis, however large the
    // property's own span is — was previously an uncapped 15% of span, which is what let the modelled
    // extent balloon far past real drillhole data on a widely-spread property (see MODEL_EXTENT_PAD_M's
    // own comment for why that produced self-wrapping surfaces).
    const pad = (lo, hi) => { const span = Math.max(1, hi - lo); const p = Math.min(span * 0.15, MODEL_EXTENT_PAD_M); return [lo - p, hi + p]; };
    const xr = minMax(xs), yr = minMax(ys), zr = minMax(zs); // not Math.min/max(...) — see layers.js's minMax comment
    const [xmin, xmax] = pad(xr.min, xr.max);
    const [ymin, ymax] = pad(yr.min, yr.max);
    const [zmin, zmax] = pad(zr.min, zr.max);
    const extent = [xmin, xmax, ymin, ymax, zmin, zmax];

    const sidecarSpecs = anisotropy.enabled
      ? specs.map((s) => ({
          ...s,
          points: s.points.map((p) => anisoWarpPoint(p, anisoCenter, anisoBasis, anisoScl)),
          orientations: s.orientations.map((o) => {
            const pos = anisoWarpPoint(o, anisoCenter, anisoBasis, anisoScl);
            const dir = anisoWarpDirection(o.dip, o.azimuth, anisoBasis, anisoScl);
            return { ...o, x: pos.x, y: pos.y, z: pos.z, dip: dir.dip, azimuth: dir.azimuth };
          }),
        }))
      : specs;

    const label = specs.length === 1 ? specs[0].label : `Stratigraphic stack (${specs.map((s) => s.meshName).join(", ")})`;
    const totalPoints = specs.reduce((s, x) => s + x.points.length, 0);
    const totalOrientations = specs.reduce((s, x) => s + x.orientations.length, 0);

    setImplicitBusy(true);
    setNotices((p) => [...p, `Running ${label} (${totalPoints} points, ${totalOrientations} orientations across ${specs.length} surface${specs.length > 1 ? "s" : ""})${anisotropy.enabled ? ", with anisotropy" : ""}…`]);
    // The sidecar call is one opaque round-trip with no real progress ticks to report, so this is a
    // "fake but honest" ramp: creeps toward 90% while waiting (never claiming completion it hasn't
    // reached), jumps to 100% on an actual response, and clears shortly after — enough for the
    // status bar to show "something is happening and roughly how far along" for a run that can take
    // several seconds, without pretending to know GemPy's actual internal progress.
    // TASKS.csv #231 — a real cancel button for a run that can take 80s+: an AbortController whose
    // signal threads through to the fetch in desktop.js, wired to a "Cancel" action on the status
    // bar's taskProgress display (App.jsx's StatusBar) via onCancel below.
    const abortController = new AbortController();
    modelAbortControllerRef.current = abortController;
    setTaskProgress?.({ label, pct: 8, onCancel: () => abortController.abort("user-cancelled") });
    const rampTimer = setInterval(() => {
      setTaskProgress?.((cur) => (cur && cur.label === label ? { ...cur, pct: Math.min(90, cur.pct + 6 + Math.random() * 8) } : cur));
    }, 500);
    const res = await pythonImplicitModel(
      extent,
      sidecarSpecs.map((s) => ({ name: s.meshName, points: s.points, orientations: s.orientations })),
      { resolution: [modelResolution, modelResolution, modelResolution], signal: abortController.signal },
    );
    clearInterval(rampTimer);
    setImplicitBusy(false);
    modelAbortControllerRef.current = null;
    if (!res.ok) {
      setTaskProgress?.(null);
      if (!res.cancelled) setNotices((p) => [...p, `${label} failed: ${res.error}`]);
      return;
    }
    setTaskProgress?.({ label, pct: 100 });
    setTimeout(() => setTaskProgress?.((cur) => (cur && cur.label === label ? null : cur)), 1000);

    const byName = Object.fromEntries((res.surfaces || []).map((s) => [s.name, s]));
    const newMeshes = [];
    const missing = [];
    const unwarpScl = anisotropy.enabled ? invScales(anisoScl) : null;
    specs.forEach((spec) => {
      const surf = byName[spec.meshName];
      if (!surf || !surf.vertices?.length) { missing.push(spec.label); return; }
      const apiVerts = anisotropy.enabled
        ? surf.vertices.map(([x, y, z]) => { const w = anisoWarpPoint({ x, y, z }, anisoCenter, anisoBasis, unwarpScl); return [w.x, w.y, w.z]; })
        : surf.vertices;
      const sceneVerts = apiVerts.map(apiToScene);
      // TASKS.csv #88 — boundary constraint: drop any triangle with a vertex outside the selected
      // domain, since GemPy fit/extrapolated across the whole extent regardless of which control points
      // fed it (#89 only restricted the INPUT, not the output). Leaves the vertex buffer itself alone
      // (unused vertices just go unreferenced) — simpler than compacting, and three.js doesn't care.
      let faces = surf.faces;
      if (clipDomain) {
        const vertexIn = sceneVerts.map((v) => pointInDomain(v, clipDomain, implicitMeshesRef.current));
        faces = faces.filter((f) => f.every((idx) => vertexIn[idx]));
        if (!faces.length) { missing.push(`${spec.label} (entirely clipped by domain "${clipDomain.name}")`); return; }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(sceneVerts.flatMap((v) => [v.x, v.y, v.z]), 3));
      geo.setIndex(faces.flat());
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ color: spec.color, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { tip: `${spec.label}\n${surf.vertices.length} vertices${clipDomain ? ` (clipped to "${clipDomain.name}")` : ""}` };
      implicitGroupRef.current?.add(mesh);
      const id = `impl_${Date.now()}_${spec.meshName}`;
      implicitMeshesRef.current[id] = mesh;
      newMeshes.push(mesh);
      // TASKS.csv #83 — `type` starts from each tool's own guess (see guessSurfaceType/the inline
      // guesses at each spec's construction site above); `relationships` starts empty — declared
      // afterward in the Modeling tab's surface list, since a relationship needs another surface to
      // already exist to point at.
      setImplicitSurfaces((p) => [...p, { id, name: spec.label, visible: true, vertexCount: surf.vertices.length, faceCount: faces.length, type: spec.type || "other", relationships: [] }]);
    });
    if (missing.length) setNotices((p) => [...p, `GemPy returned no mesh for: ${missing.join(", ")} (try adding more points or a wider spread of orientations for those).`]);
    if (newMeshes.length) {
      setNotices((p) => [...p, `Added ${newMeshes.length} surface${newMeshes.length > 1 ? "s" : ""}: ${specs.filter((s) => byName[s.meshName]?.vertices?.length).map((s) => `"${s.label}"`).join(", ")}.`]);
      // Fit the camera to all newly-created meshes together (not just one) — without this, a
      // successful run can be visually indistinguishable from a silent failure: the mesh is added to
      // the scene but the camera doesn't move, so unless it happens to land inside the current view
      // the user sees nothing change and assumes the button did nothing.
      const box = new THREE.Box3();
      newMeshes.forEach((m) => box.expandByObject(m));
      fitBox(box);
    }
  }, [fitBox, setTaskProgress, anisotropy, clipToDomainBoundary, domains, modelDomainId, modelResolution]);

  // Thin single-surface wrapper for the three single-unit tools below.
  const runSurfaceModel = useCallback((spec) => runSurfaceStack([spec]), [runSurfaceStack]);

  // Shared by the single-unit litho tool and the stratigraphic stack tool below: gathers a unit's
  // interface points (litho interval tops across every hole) and an orientation (real structure
  // picks if available, an estimate from the points' own shape otherwise). Returns null (with a
  // notice) if there's nothing to model — callers decide whether that aborts the whole run (single
  // tool) or just skips that one unit (stack tool, which shouldn't fail the whole stack because one
  // unit had no data).
  // TASKS.csv #84 — builds the inspectable "boundary intercepts" table for the modal: every litho/alt
  // interval top, resolved to a real 3D position along its hole's desurveyed trace (same findOnTrace
  // used everywhere else — never a straight-hole assumption). Read-only/derived, not its own stored
  // list — see interceptId's comment for why.
  const computeIntercepts = useCallback(() => {
    const traces = tracesRef.current;
    const o = originRef.current;
    const out = [];
    [["litho", "Lithology"], ["alt", "Alteration"]].forEach(([layerKey, layerLabel]) => {
      (layers[layerKey] || []).forEach((r) => {
        if (isNaN(r.from)) return;
        const t = traces.find((tr) => tr.hole_id === r.hole_id);
        if (!t) return;
        const p = findOnTrace(t.pts, r.from);
        if (!p) return;
        const api = sceneToApi(p);
        // TASKS.csv #232 — api coords are origin-relative (see sceneToApi's own comment); add the
        // scene origin back in so the table/CSV export shows real-world E/N/Z, matching what the
        // mesh-export path (meshExport.js's sceneVertsToWorld) already does for the same conversion.
        out.push({ id: interceptId(layerKey, r), layerKey, layerLabel, hole_id: r.hole_id, unit: r.value, from: r.from, x: api.x + o.x, y: api.y + o.y, z: api.z + o.z });
      });
    });
    return out;
  }, [layers.litho, layers.alt]);

  const gatherLithoSurfaceSpec = (unitName, traces, { silent = false } = {}) => {
    const domain = domains.find((d) => d.id === modelDomainId);
    const points = [];
    traces.forEach((t) => {
      (layers.litho || []).filter((r) => r.hole_id === t.hole_id && r.value === unitName && !isNaN(r.from)).forEach((r) => {
        // TASKS.csv #84 — a boundary intercept the user has explicitly reviewed and excluded (via the
        // Boundary intercepts table) never feeds a modelling run, same as if the row didn't exist.
        if (excludedIntercepts.includes(interceptId("litho", r))) return;
        const p = findOnTrace(t.pts, r.from);
        if (p && (!domain || pointInDomain(p, domain, implicitMeshesRef.current))) {
          const api = sceneToApi(p);
          if (softIntercepts.includes(interceptId("litho", r))) api.nugget = SOFT_NUGGET;
          points.push(api);
        }
      });
    });
    // TASKS.csv #98 — drawn cross-section contacts as extra interface points. Each contact point
    // carries real-world x/y/z (store.jsx's `sections` comment); gatherLithoSurfaceSpec's own `points`
    // are origin-relative api coords (see sceneToApi above), so each contact point is converted the
    // same way here (subtract originRef.current) before joining the same array — from GemPy's side
    // these are indistinguishable from a litho-interval-derived point, which is exactly the point: a
    // contact tagged with the same unit name + "this is its upper contact" IS an interface point for
    // that surface, no separate matching step. Domain-filtered the same way litho points are, so a
    // contact drawn outside the active modelling domain doesn't leak into a run scoped to exclude it.
    let sectionContactCount = 0;
    if (includeSectionContacts) {
      const o = originRef.current;
      (sections || []).forEach((s) => {
        (s.contacts || []).forEach((c) => {
          if (c.unit !== unitName || !c.isUpperContact) return;
          (c.points || []).forEach((cp) => {
            const api = { x: cp.x - o.x, y: cp.y - o.y, z: cp.z - o.z };
            const scenePt = { x: api.x, y: api.z, z: -api.y }; // inverse of sceneToApi, for the domain check
            if (domain && !pointInDomain(scenePt, domain, implicitMeshesRef.current)) return;
            points.push(api);
            sectionContactCount++;
          });
        });
      });
      if (sectionContactCount && !silent) {
        setNotices((p) => [...p, `Included ${sectionContactCount} drawn cross-section contact point(s) for "${unitName}" as extra interface points.`]);
      }
    }

    if (!points.length) {
      if (!silent) setNotices((p) => [...p, domain ? `No lithology intervals for "${unitName}" fall inside domain "${domain.name}" — nothing to model.` : `No lithology intervals found for "${unitName}" — nothing to model.`]);
      return null;
    }
    // TASKS.csv #85 — drop control points too isolated (along the declared structural trend) to trust.
    const supportedPoints = filterBySearchSupport(points, searchEllipsoid);
    if (searchEllipsoid.enabled && supportedPoints.length < points.length && !silent) {
      setNotices((p) => [...p, `Search ellipsoid: excluded ${points.length - supportedPoints.length} of ${points.length} "${unitName}" point(s) with fewer than ${searchEllipsoid.minSamples} neighbor(s) along the declared trend.`]);
    }
    if (!supportedPoints.length) {
      if (!silent) setNotices((p) => [...p, `All "${unitName}" points were excluded by the search ellipsoid — widen its ranges or lower the minimum neighbor count.`]);
      return null;
    }
    points.length = 0; points.push(...supportedPoints);

    // TASKS.csv #231 (Leapfrog-specialist audit finding: "every structure pick with ANY dip/azimuth in
    // the whole project gets fed as an orientation constraint to whatever surface is being modelled" --
    // confirmed live, 317 orientations fed into one 88-point run, dominated by unrelated picks) --
    // filterRowsBySearchEllipsoid already existed and was already used by the Structural tool below,
    // but was never applied here or in the alteration tool's identical block, so with no domain built
    // (the default "Whole property" case) every CON-type pick anywhere on the property fed every single
    // surface's orientations regardless of distance. Same spatial-relevance filter the interface points
    // just above already get, now applied to orientations too.
    let structRows = (layers.structure || []).filter((s) => String(s.value).toUpperCase() === "CON" && s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth));
    if (!structRows.length) structRows = (layers.structure || []).filter((s) => s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth));
    structRows = filterRowsByDomain(structRows, traces, (s) => s.depth);
    const preSearchCount = structRows.length;
    structRows = filterRowsBySearchEllipsoid(structRows, traces, (s) => s.depth);
    if (searchEllipsoid.enabled && structRows.length < preSearchCount && !silent) {
      setNotices((p) => [...p, `Search ellipsoid: excluded ${preSearchCount - structRows.length} of ${preSearchCount} structure orientation(s) with fewer than ${searchEllipsoid.minSamples} neighbor(s) along the declared trend.`]);
    }
    let orientations = structureRowsToOrientations(structRows, traces);
    if (!orientations.length) {
      // No structure/contact data to draw an orientation from — estimate one from the shape of the
      // litho points themselves instead of blocking the run. Less accurate than a real structure
      // pick, but lets the tool interpolate a surface from contacts alone, which is the point.
      const est = estimateOrientationFromPoints(points);
      orientations = [est];
      if (!silent) setNotices((p) => [...p, `No structure picks found — estimated a single dip/azimuth (~${est.dip.toFixed(0)}°/~${est.azimuth.toFixed(0)}°) from the shape of the "${unitName}" contact points. Import a structure CSV for a more accurate result.`]);
    }
    return { label: `Top of ${unitName}`, meshName: unitName, points, orientations, color: colorForLithology(unitName), type: "stratigraphic_contact" };
  };

  const runImplicitModel = useCallback(async (unitName) => {
    if (!unitName) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, "Load collars/survey data before running the implicit model."]); return; }
    const spec = gatherLithoSurfaceSpec(unitName, traces);
    if (!spec) return;
    await runSurfaceModel(spec);
  }, [layers.litho, layers.structure, runSurfaceModel, domains, modelDomainId, excludedIntercepts, searchEllipsoid, softIntercepts, sections, includeSectionContacts]);

  // Stratigraphic stack tool (TASKS.csv #52 follow-up): models several lithology units' top contacts
  // in ONE sidecar request instead of one at a time. This isn't just a convenience batch — sending
  // multiple surfaces together puts them in a single GemPy StructuralGroup, which fits them as
  // ordered iso-surfaces of one shared scalar field, guaranteeing the resulting surfaces don't cross
  // each other (the "hard rule" a stratigraphic pile has to obey). `unitNames` order matters: GemPy
  // treats the first entry as youngest and works down, so this expects the user's list to already be
  // arranged youngest (shallowest) to oldest (deepest) — the stack panel's UI enforces that ordering.
  // Deliberately litho-only, not structure/vein/dyke picks: cross-cutting features violate the very
  // non-crossing assumption this tool exists to enforce, so they're excluded from this tool by scope
  // (model them with the Structural tool instead, which has no such constraint) rather than trying to
  // half-support fault-cuts-through-stack modeling as a first pass — noted as a real follow-up (#52).
  const runStackModel = useCallback(async (unitNames) => {
    if (!unitNames || unitNames.length < 2) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, "Load collars/survey data before running the stratigraphic stack."]); return; }

    const specs = [];
    const skipped = [];
    unitNames.forEach((u) => {
      const spec = gatherLithoSurfaceSpec(u, traces, { silent: true });
      if (spec) specs.push(spec); else skipped.push(u);
    });
    if (skipped.length) setNotices((p) => [...p, `Skipping from the stack (no lithology intervals found): ${skipped.join(", ")}.`]);
    if (specs.length < 2) { setNotices((p) => [...p, "Need at least 2 units with data to model a stack — add more units or check your lithology import."]); return; }

    await runSurfaceStack(specs);
  }, [layers.litho, layers.structure, runSurfaceStack, domains, modelDomainId, excludedIntercepts, searchEllipsoid, softIntercepts, sections, includeSectionContacts]);

  const addStackUnit = useCallback((u) => {
    if (!u || stackUnits.includes(u)) return;
    // Matches the sidecar's own surfaces[] cap (python-sidecar/app/main.py, max_length=12) — capping
    // here too gives a clear notice instead of a raw validation error back from the sidecar.
    if (stackUnits.length >= 12) { setNotices((p) => [...p, "Stacks are capped at 12 units (matches the sidecar's own limit) — remove one before adding another."]); return; }
    setStackUnits((p) => [...p, u]);
  }, [stackUnits]);
  const removeStackUnit = useCallback((u) => setStackUnits((p) => p.filter((x) => x !== u)), []);
  const moveStackUnit = useCallback((u, dir) => {
    setStackUnits((p) => {
      const i = p.indexOf(u);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  // Structural modeling tool: models a surface from one structure-plane type (e.g. a fault or shear
  // pick's "value"), self-referentially — each pick's own position feeds the interface point AND its
  // own dip/azimuth feeds the orientation at that point. Unlike the litho/alteration tools, this
  // doesn't need a separate structure-layer lookup, since the structure picks ARE the thing being
  // modelled here.
  const runStructuralModel = useCallback(async (structType) => {
    if (!structType) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, "Load collars/survey data before running the structural model."]); return; }

    let rows = (layers.structure || []).filter((s) => String(s.value).toUpperCase() === String(structType).toUpperCase() && s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth));
    if (!rows.length) { setNotices((p) => [...p, `No "${structType}" structure picks with dip/azimuth found — nothing to model.`]); return; }
    const domain = domains.find((d) => d.id === modelDomainId);
    rows = filterRowsByDomain(rows, traces, (s) => s.depth);
    if (!rows.length) { setNotices((p) => [...p, `No "${structType}" picks fall inside domain "${domain?.name}" — nothing to model.`]); return; }
    const preEllipsoid = rows.length;
    rows = filterRowsBySearchEllipsoid(rows, traces, (s) => s.depth);
    if (searchEllipsoid.enabled && rows.length < preEllipsoid) {
      setNotices((p) => [...p, `Search ellipsoid: excluded ${preEllipsoid - rows.length} of ${preEllipsoid} "${structType}" pick(s) with fewer than ${searchEllipsoid.minSamples} neighbor(s) along the declared trend.`]);
    }
    if (!rows.length) { setNotices((p) => [...p, `All "${structType}" picks were excluded by the search ellipsoid — widen its ranges or lower the minimum neighbor count.`]); return; }

    const points = [];
    rows.forEach((s) => {
      const t = traces.find((tr) => tr.hole_id === s.hole_id);
      if (!t) return;
      const p = findOnTrace(t.pts, s.depth);
      if (p) points.push(sceneToApi(p));
    });
    const orientations = structureRowsToOrientations(rows, traces);
    if (!points.length || !orientations.length) { setNotices((p) => [...p, `Couldn't locate "${structType}" picks along the hole traces.`]); return; }

    // TASKS.csv #83 — a "structure" layer covers contacts, faults, shear zones, foliation, veins all
    // under one layer type (see sample_data's structure.csv), so this tool's own picked structType
    // string is the best available signal for a starting-guess surface type — refined further by
    // guessSurfaceType's regex, overridable by the user afterward regardless.
    await runSurfaceModel({ label: `Structure: ${structType}`, meshName: structType, points, orientations, color: colorForStructure(structType), type: guessSurfaceType(`Structure: ${structType}`, structType) });
  }, [layers.structure, runSurfaceModel, domains, modelDomainId, searchEllipsoid]);

  // Alteration modeling tool: same mechanic as the litho-based tool (interval tops as interface
  // points, structure-layer picks for orientation), just sourced from the alteration layer instead of
  // lithology — for outlining an alteration halo (e.g. QSP, SIL) as a surface rather than reading it
  // interval-by-interval off each hole.
  const runAlterationModel = useCallback(async (altValue) => {
    if (!altValue) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, "Load collars/survey data before running the alteration model."]); return; }

    const domain = domains.find((d) => d.id === modelDomainId);
    const points = [];
    traces.forEach((t) => {
      (layers.alt || []).filter((r) => r.hole_id === t.hole_id && r.value === altValue && !isNaN(r.from)).forEach((r) => {
        if (excludedIntercepts.includes(interceptId("alt", r))) return;
        const p = findOnTrace(t.pts, r.from);
        if (p && (!domain || pointInDomain(p, domain, implicitMeshesRef.current))) {
          const api = sceneToApi(p);
          if (softIntercepts.includes(interceptId("alt", r))) api.nugget = SOFT_NUGGET;
          points.push(api);
        }
      });
    });
    if (!points.length) { setNotices((p) => [...p, domain ? `No alteration intervals for "${altValue}" fall inside domain "${domain.name}" — nothing to model.` : `No alteration intervals found for "${altValue}" — nothing to model.`]); return; }
    const preEllipsoid = points.length;
    const supportedPoints = filterBySearchSupport(points, searchEllipsoid);
    if (searchEllipsoid.enabled && supportedPoints.length < preEllipsoid) {
      setNotices((p) => [...p, `Search ellipsoid: excluded ${preEllipsoid - supportedPoints.length} of ${preEllipsoid} "${altValue}" point(s) with fewer than ${searchEllipsoid.minSamples} neighbor(s) along the declared trend.`]);
    }
    if (!supportedPoints.length) { setNotices((p) => [...p, `All "${altValue}" points were excluded by the search ellipsoid — widen its ranges or lower the minimum neighbor count.`]); return; }
    points.length = 0; points.push(...supportedPoints);

    // TASKS.csv #231 — see gatherLithoSurfaceSpec's identical fix for the full explanation: the search-
    // ellipsoid spatial-relevance filter already existed and was already used by the Structural tool,
    // but not here, so every CON-type pick on the whole property fed every alteration surface too.
    let structRows = (layers.structure || []).filter((s) => String(s.value).toUpperCase() === "CON" && s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth));
    if (!structRows.length) structRows = (layers.structure || []).filter((s) => s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth));
    structRows = filterRowsByDomain(structRows, traces, (s) => s.depth);
    const preSearchCount2 = structRows.length;
    structRows = filterRowsBySearchEllipsoid(structRows, traces, (s) => s.depth);
    if (searchEllipsoid.enabled && structRows.length < preSearchCount2) {
      setNotices((p) => [...p, `Search ellipsoid: excluded ${preSearchCount2 - structRows.length} of ${preSearchCount2} structure orientation(s) with fewer than ${searchEllipsoid.minSamples} neighbor(s) along the declared trend.`]);
    }
    let orientations = structureRowsToOrientations(structRows, traces);
    if (!orientations.length) {
      // Same fallback as the litho tool (see its comment) — estimate an orientation from the
      // alteration points themselves rather than requiring a structure CSV.
      const est = estimateOrientationFromPoints(points);
      orientations = [est];
      setNotices((p) => [...p, `No structure picks found — estimated a single dip/azimuth (~${est.dip.toFixed(0)}°/~${est.azimuth.toFixed(0)}°) from the shape of the "${altValue}" points. Import a structure CSV for a more accurate result.`]);
    }

    await runSurfaceModel({ label: `Alteration: ${altValue}`, meshName: altValue, points, orientations, color: colorForAlteration(altValue), type: "alteration_envelope" });
  }, [layers.alt, layers.structure, runSurfaceModel, domains, modelDomainId, excludedIntercepts, searchEllipsoid, softIntercepts]);

  const toggleImplicitSurface = useCallback((id) => {
    setImplicitSurfaces((p) => p.map((s) => {
      if (s.id !== id) return s;
      const mesh = implicitMeshesRef.current[id];
      if (mesh) mesh.visible = !s.visible;
      return { ...s, visible: !s.visible };
    }));
  }, []);
  const removeImplicitSurface = useCallback((id) => {
    const mesh = implicitMeshesRef.current[id];
    if (mesh) { implicitGroupRef.current?.remove(mesh); mesh.geometry?.dispose?.(); mesh.material?.dispose?.(); delete implicitMeshesRef.current[id]; }
    setImplicitSurfaces((p) => p.filter((s) => s.id !== id));
    // TASKS.csv #83 — drop any relationship pointing AT the surface being removed too, so the
    // remaining surfaces don't end up referencing a dangling id.
    setImplicitSurfaces((p) => p.map((s) => ({ ...s, relationships: (s.relationships || []).filter((r) => r.targetId !== id) })));
  }, []);
  // TASKS.csv #83 — surface type + declared relationships (geological-architecture layer 2). Purely
  // metadata for now (see the long comment above SURFACE_TYPES/RELATION_TYPES) — not persisted yet,
  // same as the rest of implicitSurfaces (#52's still-open "persist a generated surface" follow-up
  // covers this too, not solved separately here).
  const setSurfaceType = useCallback((id, type) => {
    setImplicitSurfaces((p) => p.map((s) => s.id === id ? { ...s, type } : s));
  }, []);
  // TASKS.csv #140 — bulk/specific gravity for this surface's volume->tonnage conversion. Kept per
  // surface (not global) since different lithologies/mineralization styles in the same model can have
  // very different SG. Defaults to 2.7 t/m3 (a generic country-rock density) only as a starting point
  // to edit, not a real estimate — this app has no way to know the true SG.
  const setSurfaceDensity = useCallback((id, density) => {
    setImplicitSurfaces((p) => p.map((s) => s.id === id ? { ...s, density } : s));
  }, []);
  const addSurfaceRelationship = useCallback((id, relation, targetId) => {
    if (!relation || !targetId || targetId === id) return;
    setImplicitSurfaces((p) => p.map((s) => {
      if (s.id !== id) return s;
      const exists = (s.relationships || []).some((r) => r.relation === relation && r.targetId === targetId);
      if (exists) return s;
      return { ...s, relationships: [...(s.relationships || []), { relation, targetId }] };
    }));
  }, []);
  const removeSurfaceRelationship = useCallback((id, index) => {
    setImplicitSurfaces((p) => p.map((s) => s.id === id ? { ...s, relationships: (s.relationships || []).filter((_, i) => i !== index) } : s));
  }, []);

  // TASKS.csv #89 — domain CRUD. A domain with zero constraints exists but matches everything (same
  // as no domain at all) until at least one fault-side constraint is added.
  const addDomain = useCallback((name) => {
    const id = `domain_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setDomains((p) => [...p, { id, name: name || "New domain", constraints: [] }]);
    return id;
  }, []);
  const renameDomain = useCallback((id, name) => setDomains((p) => p.map((d) => d.id === id ? { ...d, name } : d)), []);
  const deleteDomain = useCallback((id) => {
    setDomains((p) => p.filter((d) => d.id !== id));
    if (modelDomainId === id) setModelDomainId("");
  }, [modelDomainId]);
  const addDomainConstraint = useCallback((domainId, faultId, side) => {
    if (!faultId) return;
    setDomains((p) => p.map((d) => {
      if (d.id !== domainId) return d;
      if (d.constraints.some((c) => c.faultId === faultId)) return d; // one constraint per fault
      return { ...d, constraints: [...d.constraints, { faultId, side }] };
    }));
  }, []);
  const removeDomainConstraint = useCallback((domainId, index) => {
    setDomains((p) => p.map((d) => d.id === domainId ? { ...d, constraints: d.constraints.filter((_, i) => i !== index) } : d));
  }, []);
  const flipDomainConstraint = useCallback((domainId, index) => {
    setDomains((p) => p.map((d) => d.id === domainId ? { ...d, constraints: d.constraints.map((c, i) => i === index ? { ...c, side: -c.side } : c) } : d));
  }, []);
  // Live "N holes" feedback while building a domain — classifies each collar's own position (a
  // reasonable per-hole proxy; the actual modelling tools classify each individual control point,
  // finer-grained than one classification per hole, see gatherLithoSurfaceSpec/runStructuralModel/
  // runAlterationModel below).
  const countCollarsInDomain = useCallback((domain) => {
    const traces = tracesRef.current;
    return traces.filter((t) => t.pts.length && pointInDomain(t.pts[0], domain, implicitMeshesRef.current)).length;
  }, []);
  // The auto-zoom in runSurfaceModel only fires once, right when a surface is created — if the user
  // then orbits/pans away (or generates a second surface, which re-zooms to THAT one instead), there
  // was no way back to a specific earlier surface short of hunting for it. Also doubles as a real
  // diagnostic: if clicking this reveals nothing, the mesh isn't just out of view — the surface
  // itself is degenerate (e.g. too thin/small to see, or genuinely empty).
  const zoomToImplicitSurface = useCallback((id) => {
    const mesh = implicitMeshesRef.current[id];
    if (!mesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) {
      setNotices((p) => [...p, "This surface's geometry looks degenerate (empty or non-finite bounds) — nothing to zoom to. Try regenerating it with more/better-spread points."]);
      return;
    }
    fitBox(box, 1.6); // extra padding vs. the default — a thin/near-flat implicit surface can be easy to clip right at the edge of frame otherwise
  }, [fitBox]);

  // TASKS.csv #143 — export a generated surface's mesh to a standard format for downstream software
  // (Vulcan/Surpac/Datamine, geotechnical tools, Blender, or just a generic mesh viewer). Every format
  // is written in real-world (project) coordinates via meshExport.js's sceneVertsToWorld, using the
  // SAME originRef.current this component already uses everywhere else to convert scene<->world.
  const exportImplicitSurface = useCallback(async (id, format) => {
    const mesh = implicitMeshesRef.current[id];
    const surf = implicitSurfaces.find((s) => s.id === id);
    if (!mesh?.geometry || !surf) return;
    const baseName = (surf.name || "surface").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
    try {
      if (format === "obj") {
        const content = exportSurfaceOBJ(surf.name, mesh.geometry, originRef.current);
        await saveFile({ suggestedName: `${baseName}.obj`, filters: [{ name: "Wavefront OBJ", extensions: ["obj"] }], content, encoding: "text" });
      } else if (format === "dxf") {
        const content = exportSurfaceDXF(surf.name, mesh.geometry, originRef.current);
        await saveFile({ suggestedName: `${baseName}.dxf`, filters: [{ name: "AutoCAD DXF", extensions: ["dxf"] }], content, encoding: "text" });
      } else if (format === "glb") {
        const buf = await exportSurfaceGLTF(surf.name, mesh.geometry, originRef.current);
        await saveFile({ suggestedName: `${baseName}.glb`, filters: [{ name: "glTF Binary", extensions: ["glb"] }], content: uint8ToBase64(new Uint8Array(buf)), encoding: "base64" });
      }
      setNotices((p) => [...p, `Exported "${surf.name}" as ${format.toUpperCase()} (real-world coordinates).`]);
    } catch (err) {
      setNotices((p) => [...p, `Export failed for "${surf.name}": ${err.message}`]);
    }
  }, [implicitSurfaces]);

  // TASKS.csv #188 — "Our planned drill holes need the option to get exported to csv." One row per
  // planned hole, real-world collar (x/y/z — same east/north/elevation convention every other export
  // in this app uses, e.g. exportImplicitSurface above), plus the design orientation/length and a
  // computed toe (bottom-of-hole) position so the CSV is immediately usable for staking/permitting
  // without anyone having to hand-calculate the endpoint from azimuth/dip/length themselves.
  const exportPlannedHolesCSV = useCallback(async () => {
    if (!plannedHoles.length) { setNotices((p) => [...p, "No planned drillholes to export yet."]); return; }
    const rows = plannedHoles.map((h) => {
      const raw = plannedHoleTrace(h);
      const toe = raw.length ? raw[raw.length - 1] : null;
      return {
        name: h.name || "", x: h.x, y: h.y, z: h.z,
        azimuth: h.azimuth, dip: h.dip, length: h.length,
        toe_x: toe ? Number(toe.x.toFixed(2)) : "", toe_y: toe ? Number(toe.y.toFixed(2)) : "", toe_z: toe ? Number(toe.z.toFixed(2)) : "",
        notes: h.notes || "",
      };
    });
    const csv = Papa.unparse(rows);
    const res = await saveFile({ suggestedName: `${(project.name || "project").replace(/[^\w\- ]/g, "")}_planned_holes.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: csv, encoding: "text" });
    if (res.ok) setNotices((p) => [...p, `Exported ${plannedHoles.length} planned hole(s) to CSV.`]);
  }, [plannedHoles, project]);

  // Bug fix (user report: "when I turn off one of the voxels, the view will reset to zoom all. It
  // would be good to keep the zoom unchanged as I turn off and on layers. sometimes I do that to
  // compare different surveys.") Root cause: the big geometry-rebuild effect right below this depends
  // on `voxelModels` directly (added for the earlier camera-fit-for-voxel-models fix — see that
  // effect's own header comment) and unconditionally calls fitView(...) every time it runs — so ANY
  // change to voxelModels, including just flipping one model's `visible` flag via updateVoxelModel
  // (which creates a new array reference even though no cell/position data actually changed), reran
  // the WHOLE effect and re-fit the camera, wiping out whatever pan/zoom Matt had set up to compare
  // two block models side by side. Fix: depend on a signature that only changes when the actual SET of
  // voxel models or their cell geometry changes (ids + cell counts) — NOT on display-only fields like
  // visible/opacity/stops/colorMode/threshold — and use that signature in the big effect's dependency
  // array instead of the raw voxelModels reference. The effect body still reads the latest voxelModels
  // via closure (harmless: when only a display flag changed and the effect correctly does NOT rerun,
  // the cell positions it needs for the camera-fit bounding box are identical either way).
  const voxelGeomSignature = useMemo(
    () => voxelModels.map((m) => `${m.id}:${m.cells?.length || 0}`).join("|"),
    [voxelModels]
  );

  // ---------- rebuild all geometry ----------
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups.litho) return;
    Object.values(groups).forEach((g) => { while (g.children.length) { const c = g.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); } });
    if (!collars.length) {
      setDataLoaded(false);
      hasAutoFitRef.current = false;
      // No drillhole collars yet, but there may still be a terrain surface or raster drape loaded on
      // its own (e.g. testing a DEM/GeoTIFF import before any collar data exists) — without this,
      // originRef stays at its useRef default of (0,0,0) and a real-world-coordinate terrain/raster
      // (easting/northing in the hundreds of thousands to millions) would sit far outside the
      // camera's default framing. That renders successfully — it's just off-screen — which reads
      // exactly like "I imported it but it won't display" (the bug this session's SRTM fix targets;
      // see raster.js parseDEMFiles). The terrain/raster effects below already read originRef.current
      // and rebuild whenever it changes, so setting it here and fitting the camera is enough to make
      // them visible without duplicating their own geometry-building logic.
      // Boundaries (Geosoft .ply import) don't carry a bbox directly — computed from their own vertices
      // — same off-screen-without-collars risk as terrain/rasters, so included in the same fallback.
      const boundaryBbox = (() => {
        const pts = (boundaries || []).flatMap((b) => b.polylines || []).flat();
        if (!pts.length) return null;
        const bxr = minMax(pts, (p) => p.x), byr = minMax(pts, (p) => p.y); // not Math.min/max(...) — see layers.js's minMax comment
        return [bxr.min, byr.min, bxr.max, byr.max];
      })();
      // Same off-screen-without-collars risk for OMF imports (a project with only points/lines/
      // surfaces and no drillholes yet) — world position is origin + each vertex triple.
      let omfZs = null;
      const omfBbox = (() => {
        const xs = [], ys = [], zs = [];
        (omfObjects || []).forEach((o) => {
          const [gox, goy, goz] = o.origin || [0, 0, 0];
          const n = (o.vertices || []).length / 3;
          for (let i = 0; i < n; i++) {
            xs.push(gox + o.vertices[i * 3]); ys.push(goy + o.vertices[i * 3 + 1]); zs.push(goz + o.vertices[i * 3 + 2]);
          }
        });
        (voxelModels || []).forEach((m) => (m.cells || []).forEach((c) => { xs.push(c.x); ys.push(c.y); zs.push(c.z); }));
        if (!xs.length) return null;
        omfZs = zs;
        const xr = minMax(xs), yr = minMax(ys);
        return [xr.min, yr.min, xr.max, yr.max];
      })();
      // TASKS.csv #228 (mineral-exploration-specialist audit finding, real live bug — confirmed by code
      // read, not just reported) — this whole `!collars.length` branch returns before the geophys_pts
      // build below ever runs and before its extent was considered as a camera anchor, so a project
      // with NO drillholes yet (a geophysics-survey-only or, once #228 lands, surface-geochem-only
      // project — exactly the "before ever drilling" workflow this app's target audience actually
      // starts most programs with) imported cleanly, reported the right point count, and rendered
      // nothing at all. Same class of "off-screen, not actually broken" bug this fallback already
      // exists to fix for terrain/rasters/boundaries/OMF — geophys_pts just wasn't included.
      const geophysPtsBbox = (() => {
        const pts = layers.geophys_pts || [];
        if (!pts.length) return null;
        const gxr = minMax(pts, (p) => p.x), gyr = minMax(pts, (p) => p.y);
        return [gxr.min, gyr.min, gxr.max, gyr.max];
      })();
      // TASKS.csv #228 — same "off-screen, not actually broken" anchor consideration as geophysPtsBbox
      // right above, for a surface-geochem-only project (no drillholes, no geophysics points either).
      const surfaceSamplesBbox = (() => {
        if (!surfaceSamples.length) return null;
        const sxr = minMax(surfaceSamples, (p) => p.x), syr = minMax(surfaceSamples, (p) => p.y);
        return [sxr.min, syr.min, sxr.max, syr.max];
      })();
      const anchorBbox = terrain?.bbox || rasters?.[0]?.bbox || boundaryBbox || omfBbox || geophysPtsBbox || surfaceSamplesBbox || null;
      if (anchorBbox) {
        const [bxmin, bymin, bxmax, bymax] = anchorBbox;
        const ox = (bxmin + bxmax) / 2, oy = (bymin + bymax) / 2;
        let ezMin = -50, ezMax = 500; // sane fallback vertical range for a raster/boundary-only anchor (no elevation data to measure)
        if (terrain?.elevations?.length) {
          const er = minMax(terrain.elevations); // not Math.min/max(...) — see layers.js's minMax comment
          ezMin = er.min; ezMax = er.max;
        } else if (omfZs?.length) {
          // Bug fix (found while testing OMF import): the -50..500 fallback assumes elevations near
          // sea level, which real OMF projects (typically at a mine site's actual elevation, e.g.
          // ~1000m+) don't satisfy — the camera would fit to a vertical range that doesn't contain any
          // of the actual imported geometry, rendering an apparently-empty scene. Measure OMF objects'
          // real z-extent instead when there's no terrain to measure it from.
          const zr = minMax(omfZs);
          ezMin = zr.min; ezMax = zr.max;
        } else if (geophysPtsBbox && layers.geophys_pts?.length) {
          const zr = minMax(layers.geophys_pts, (p) => p.z);
          ezMin = zr.min; ezMax = zr.max;
        } else if (surfaceSamplesBbox && surfaceSamples.length) {
          const zr = minMax(surfaceSamples, (p) => p.z);
          ezMin = zr.min; ezMax = zr.max;
        }
        originRef.current = { x: ox, y: oy, z: (ezMin + ezMax) / 2 };
        const { x: rox, y: roy, z: roz } = originRef.current;
        const box = new THREE.Box3(
          new THREE.Vector3(bxmin - rox, ezMin - roz, -(bymax - roy)),
          new THREE.Vector3(bxmax - rox, ezMax - roz, -(bymin - roy)),
        );
        fitBox(box, 1.3);
        // TASKS.csv #228 — build the geophys_pts group here too (same rendering as the main per-collar
        // path below, just using this branch's own rox/roy/roz and a local buildErrors since the main
        // one isn't declared until after this early return). Without this, the anchor-bbox fit above
        // would correctly frame the camera on the right spot, but nothing would actually be drawn there.
        const geophysPtsRows = (layers.geophys_pts || []).filter((r) => isRowVisible("geophys_pts", r));
        if (geophysPtsRows.length) {
          const gBuildErrors = [];
          const vals = geophysPtsRows.map((r) => r.value).filter((v) => typeof v === "number" && !isNaN(v));
          const { min: gmin, max: gmax } = minMax(vals);
          const geophysPtsModel = { stops: geophysPtsStops, colorMode: geophysPtsColorMode, min: geophysPtsMin ?? gmin, max: geophysPtsMax ?? gmax };
          geophysPtsRows.forEach((row) => {
            try {
              const x = row.x - rox, y = row.z - roz, z = -(row.y - roy);
              const size = 1.4 + 2.8 * (gmax > gmin ? (row.value - gmin) / (gmax - gmin) : 0.3);
              const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), new THREE.MeshLambertMaterial({ color: colorForVoxelValue(geophysPtsModel, row.value) }));
              mesh.position.set(x, y, z);
              mesh.userData = { tip: `Geophysics point\n${row.label || "value"}: ${row.value}\n${row.x.toFixed(0)}E ${row.y.toFixed(0)}N ${row.z.toFixed(0)}Z` };
              groups.geophys_pts.add(mesh);
            } catch (err) { gBuildErrors.push(`geophys_pts point: ${err.message}`); }
          });
          if (gBuildErrors.length) setNotices((p) => [...p, `${gBuildErrors.length} geophysics point(s) failed to render: ${gBuildErrors.slice(0, 3).join(" · ")}`]);
        }
        // TASKS.csv #228 — surface geochemistry samples, same zero-collar-anchor reasoning as the
        // geophys_pts block right above: a surface-geochem-only project (no drillholes at all — the
        // exact "before ever drilling" workflow this feature targets) must still render here.
        if (layerVisible.surface_samples && surfaceSamples.length) {
          const sBuildErrors = [];
          surfaceSamples.forEach((row) => {
            try {
              const x = row.x - rox, y = row.z - roz, z = -(row.y - roy);
              const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), new THREE.MeshLambertMaterial({ color: colorForMedium(row.medium) }));
              mesh.position.set(x, y, z);
              mesh.userData = { tip: surfaceSampleTip(row) };
              groups.surface_samples.add(mesh);
            } catch (err) { sBuildErrors.push(`surface sample: ${err.message}`); }
          });
          if (sBuildErrors.length) setNotices((p) => [...p, `${sBuildErrors.length} surface sample(s) failed to render: ${sBuildErrors.slice(0, 3).join(" · ")}`]);
        }
      }
      return;
    }

    const ox = collars.reduce((s, c) => s + c.x, 0) / collars.length;
    const oy = collars.reduce((s, c) => s + c.y, 0) / collars.length;
    const oz = collars.reduce((s, c) => s + c.z, 0) / collars.length;
    originRef.current = { x: ox, y: oy, z: oz };

    const allTraces = [];
    const elementUnits = Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit]));

    // Perf (user report: "the app is getting a bit heavy on my laptop") — every builder below used to
    // do `rows.filter(r => r.hole_id === c.hole_id)` INSIDE the per-collar loop, i.e. a full scan of
    // the entire layer array once per hole (O(holes × rows) per layer, repeated for every interval/
    // point/structure/custom layer, on every rebuild of this effect — which happens on nearly any
    // sidebar change since collars/layers aren't the only deps). Grouping each layer by hole_id ONCE
    // up front (O(rows) total) and looking up each hole's own rows via Map.get() below turns that into
    // O(rows) overall regardless of hole count — same rendered result, just without redoing a full
    // linear scan per hole for every layer type. Biggest win on real projects (hundreds of holes ×
    // thousands of assay/lithology rows), where the old approach was quietly quadratic.
    const groupByHole = (rows) => {
      const m = new Map();
      (rows || []).forEach((r) => {
        if (!r.hole_id) return;
        let arr = m.get(r.hole_id);
        if (!arr) { arr = []; m.set(r.hole_id, arr); }
        arr.push(r);
      });
      return m;
    };
    const rowsByHole = {
      litho: groupByHole(layers.litho), alt: groupByHole(layers.alt), vein: groupByHole(layers.vein),
      geotech: groupByHole(layers.geotech), litho_gc: groupByHole(layers.litho_gc), alt_gc: groupByHole(layers.alt_gc),
      mnlgy: groupByHole(layers.mnlgy), magsusc: groupByHole(layers.magsusc), structure: groupByHole(layers.structure),
      recovery: groupByHole(layers.recovery), sg: groupByHole(layers.sg),
    };
    const assaysByHole = groupByHole(assays);
    const customRowsByHoleByLayer = new Map(customLayers.map((l) => [l.id, groupByHole(l.rows)]));
    // TASKS.csv #209 — same quadratic-scan fix as the groupByHole comment above already applied to
    // litho/alt/etc., just never extended to survey: `survey.filter(s => s.hole_id === c.hole_id)`
    // inside the per-collar loop below was still an O(holes × survey rows) full-array scan every
    // rebuild. Real projects carry multiple survey stations per hole (unlike this task's own
    // profiling repro, which used straight synthetic holes with none), so this was a live, if
    // smaller, contributor on real datasets — grouped once here instead, same O(rows) shape.
    const surveyByHole = groupByHole(survey.filter((s) => !isNaN(s.depth)));

    // Bug-hunt pass: color/size range for numeric point layers (mnlgy/magsusc) used to be computed
    // per-hole inside buildPointMarkers below, so the same absolute value rendered a different color
    // depending on which hole it happened to be in (each hole got its own 0-1 scale). Computed once
    // here across ALL holes/rows (still respecting the current visibility filter) so values compare
    // consistently across the whole project — same approach the geophysics point cloud already used.
    const numericRangeFor = (groupKey, rows) => {
      const numeric = (rows || []).filter((r) => isRowVisible(groupKey, r)).map((r) => r.value).filter((v) => typeof v === "number" && !isNaN(v));
      return minMax(numeric); // not Math.min/max(...) — see layers.js's minMax comment
    };
    const globalPointRanges = {
      mnlgy: numericRangeFor("mnlgy", layers.mnlgy),
      magsusc: numericRangeFor("magsusc", layers.magsusc),
      // TASKS.csv #137 — specific gravity has no fixed, universally-known domain the way RQD%/
      // recovery% do (0-100), so it needs the actual project data's own min/max the same way
      // mnlgy/magsusc's point markers already do, rather than rqdColor's hardcoded 0-100 ramp
      // (which would render almost every real SG value, ~2-5, as a near-identical dark red).
      sg: numericRangeFor("sg", layers.sg),
    };
    // Same per-hole-scale bug for the assay spheres below — now one range PER selected element (each
    // element gets its own size scale, since e.g. Au in g/t and Cu in % are on totally different
    // numeric scales and sharing one min/max would flatten one of them to barely-visible dots).
    const globalAssayRanges = {};
    if (assayVisible) {
      assayDisplayElements.forEach((sym) => {
        const vals = assays.filter((a) => a.values[sym] != null).map((a) => a.values[sym]);
        globalAssayRanges[sym] = minMax(vals); // not Math.min/max(...) — see layers.js's minMax comment
      });
    }

    const buildErrors = [];
    collars.forEach((c) => {
     try {
      const hs = surveyByHole.get(c.hole_id) || [];
      const raw = desurveyHole(c, hs);
      if (!raw.length) return;
      const pts = raw.map((p) => ({ md: p.md, x: p.x - ox, y: p.z - oz, z: -(p.y - oy) }));
      allTraces.push(pts);
      tracesRef.current = tracesRef.current.filter((t) => t.hole_id !== c.hole_id);
      tracesRef.current.push({ hole_id: c.hole_id, pts, wx: raw.map((p) => p.x), wy: raw.map((p) => p.y), wz: raw.map((p) => p.z) });

      const marker = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 12), new THREE.MeshBasicMaterial({ color: 0xf2e9d8 }));
      marker.position.set(pts[0].x, pts[0].y, pts[0].z);
      marker.userData = { tip: `${c.hole_id}\ncollar` };
      groups.litho.add(marker);

      const traceLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z))), new THREE.LineBasicMaterial({ color: 0x445064, transparent: true, opacity: 0.5 }));
      groups.litho.add(traceLine);

      // TASKS.csv #137 — geotech/recovery are both known 0-100 percentages, so rqdColor's fixed
      // ramp fits both; specific gravity has no such fixed domain (real values run ~2-5), so it
      // uses the project's own actual min/max instead (globalPointRanges.sg above), same as the
      // numeric point-marker layers (mnlgy/magsusc) below already do via magColor.
      const numericIntervalColor = (groupKey, value) => {
        if (groupKey === "sg") {
          const { min, max } = globalPointRanges.sg;
          return magColor(value, min, max);
        }
        return rqdColor(value);
      };
      const buildIntervalTube = (groupKey) => {
        const meta = LAYER_META[groupKey];
        (rowsByHole[groupKey]?.get(c.hole_id) || []).filter((r) => isRowVisible(groupKey, r)).forEach((row) => {
         try {
          if (isNaN(row.from) || isNaN(row.to)) return;
          const p1 = findOnTrace(pts, row.from), p2 = findOnTrace(pts, row.to);
          const mid = pts.filter((p) => p.md >= row.from - 0.01 && p.md <= row.to + 0.01);
          const vecs = [new THREE.Vector3(p1.x, p1.y, p1.z), ...mid.map((p) => new THREE.Vector3(p.x, p.y, p.z)), new THREE.Vector3(p2.x, p2.y, p2.z)];
          if (vecs.length < 2) return;
          // TASKS.csv #209 — perf fix, profiled not guessed. A real repro (400 holes x 60 litho
          // intervals = 24,000 rows) froze the main thread for ~11.3s on import; instrumented timing
          // (temporarily, since removed) showed 10.1s of that — 89% — was CatmullRomCurve3+TubeGeometry
          // construction alone, ~0.42ms x 24,000 calls. The other candidate hot spots from this task's
          // own notes (findOnTrace's linear scan, desurvey, mesh/material setup) measured under 800ms
          // combined — comparatively negligible.
          //
          // TubeGeometry's cost comes from sampling a Frenet-ish frame along a curve, which is only
          // actually needed when an interval spans a REAL bend in the hole's desurveyed trace. A first
          // attempt gated the fast path on `mid.length === 0` (no internal ~3m-spaced sample point
          // crossed) — wrong, and measurably WORSE (re-profiled at 13.1s, not better): that 3m spacing
          // is just desurveyHole's arbitrary sampling resolution, not a proxy for curvature, so a
          // perfectly straight hole with an ordinary 5m logging interval still crosses one of those grid
          // points constantly and never took the fast path. The real question is whether p1/mid/p2 are
          // actually colinear — checked directly below by measuring each mid point's perpendicular
          // distance from the p1->p2 line — which correctly recognizes a straight interval as straight
          // regardless of how many arbitrary sample points it happens to cross. Re-profiled after this
          // correction: the 24,000-interval rebuild's single longest main-thread block went from ~10.9s
          // to ~2.6s (see TASKS.csv #209's notes for the exact before/after numbers and the remaining-
          // cost breakdown) on this fully-straight synthetic dataset — a real, measured ~4x win, not a
          // guess — with a curved dataset (holes given a real per-station azimuth/dip change) confirmed
          // to still route through the original curve-following TubeGeometry path unchanged.
          const straight = (() => {
            if (!mid.length) return true; // p1/p2 only, nothing to check
            const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
            const lenSq = dx * dx + dy * dy + dz * dz;
            if (lenSq < 1e-9) return true;
            const tol = 0.05; // metres — well under drawing precision at typical viewer scales
            for (const p of mid) {
              const t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy + (p.z - p1.z) * dz) / lenSq;
              const projX = p1.x + t * dx, projY = p1.y + t * dy, projZ = p1.z + t * dz;
              const ddx = p.x - projX, ddy = p.y - projY, ddz = p.z - projZ;
              if (ddx * ddx + ddy * ddy + ddz * ddz > tol * tol) return false;
            }
            return true;
          })();
          let geo, mesh_ = null;
          if (straight) {
            const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len < 1e-6) return;
            geo = new THREE.CylinderGeometry(meta.radius, meta.radius, len, 6, 1, false);
            geo.translate(0, len / 2, 0); // CylinderGeometry is centered on its own axis by default — shift so position=p1 places the BASE at p1, matching TubeGeometry's own from-p1-to-p2 extent
            const color = meta.numeric ? numericIntervalColor(groupKey, row.value) : effectiveColor(groupKey, row.value);
            const mat = new THREE.MeshLambertMaterial({ color, transparent: meta.opacity < 1, opacity: meta.opacity });
            mesh_ = new THREE.Mesh(geo, mat);
            mesh_.position.set(p1.x, p1.y, p1.z);
            mesh_.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
          } else {
            const curve = new THREE.CatmullRomCurve3(vecs);
            geo = new THREE.TubeGeometry(curve, Math.max(2, vecs.length * 2), meta.radius, 6, false);
            const color = meta.numeric ? numericIntervalColor(groupKey, row.value) : effectiveColor(groupKey, row.value);
            const mat = new THREE.MeshLambertMaterial({ color, transparent: meta.opacity < 1, opacity: meta.opacity });
            mesh_ = new THREE.Mesh(geo, mat);
          }
          const mesh = mesh_;
          const lbl = meta.numeric ? row.value : effectiveLabel(groupKey, row.value);
          // TASKS.csv #208 — surface a mapped Description column (litho's new optional field, or any
          // custom field named "description") in the hover tooltip alongside the other interval layers
          // that share this same tube-building path — harmless no-op for rows that don't have one.
          mesh.userData = { tip: `${c.hole_id}\n${meta.label}: ${lbl}${row.extra != null ? ` (${row.extra})` : ""}\n${row.from.toFixed(0)}–${row.to.toFixed(0)} m${row.description ? `\n${row.description}` : ""}` };
          groups[groupKey].add(mesh);
         } catch (err) { buildErrors.push(`${groupKey} ${c.hole_id} ${row.from}-${row.to}: ${err.message}`); }
        });
      };
      buildIntervalTube("litho");
      buildIntervalTube("alt");
      buildIntervalTube("vein");
      buildIntervalTube("geotech");
      buildIntervalTube("recovery");
      buildIntervalTube("sg");
      buildIntervalTube("litho_gc");
      buildIntervalTube("alt_gc");

      const buildPointMarkers = (groupKey) => {
        const meta = LAYER_META[groupKey];
        const vals = (rowsByHole[groupKey]?.get(c.hole_id) || []).filter((r) => isRowVisible(groupKey, r));
        const { min, max } = globalPointRanges[groupKey] || { min: 0, max: 0 };
        vals.forEach((row) => {
         try {
          const mid = (row.from + row.to) / 2;
          const p = findOnTrace(pts, mid);
          if (!p) return;
          const size = meta.numeric ? 1.6 + 3.5 * (max > min ? (row.value - min) / (max - min) : 0.3) : 2 + Math.min(3, (row.extra || 1) * 0.4);
          const color = meta.numeric ? magColor(row.value, min, max) : effectiveColor(groupKey, row.value);
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 10), new THREE.MeshLambertMaterial({ color }));
          mesh.position.set(p.x, p.y, p.z);
          const lbl = meta.numeric ? row.value : effectiveLabel(groupKey, row.value);
          mesh.userData = { tip: `${c.hole_id}\n${meta.label}: ${lbl}${row.extra != null ? ` (${row.extra}%)` : ""}\n@ ${mid.toFixed(0)} m` };
          groups[groupKey].add(mesh);
         } catch (err) { buildErrors.push(`${groupKey} ${c.hole_id}: ${err.message}`); }
        });
      };
      buildPointMarkers("mnlgy");
      buildPointMarkers("magsusc");

      (rowsByHole.structure?.get(c.hole_id) || []).filter((s) => isRowVisible("structure", s)).forEach((s) => {
        const p = findOnTrace(pts, s.depth);
        if (!p) return;
        const dip = s.dip != null && !isNaN(s.dip) ? s.dip : 45;
        const az = s.azimuth != null && !isNaN(s.azimuth) ? s.azimuth : 0;
        const geo = new THREE.CircleGeometry(6, 24);
        const color = effectiveColor("structure", s.value);
        const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
        const disc = new THREE.Mesh(geo, mat);
        disc.rotation.order = "YXZ";
        disc.rotation.x = Math.PI / 2 - toRad(dip);
        disc.rotation.y = -toRad(az);
        disc.position.set(p.x, p.y, p.z);
        const lbl = effectiveLabel("structure", s.value);
        disc.userData = { tip: `${c.hole_id}\nStructure: ${lbl}\ndip ${isNaN(dip) ? "?" : dip.toFixed(0)}° / az ${isNaN(az) ? "?" : az.toFixed(0)}°\n@ ${s.depth.toFixed(0)} m` };
        groups.structure.add(disc);
      });

      if (assayVisible && assayDisplayElements.length) {
        // Multi-element display (user request): each selected element gets its own fixed hue (not a
        // value-driven gradient — with several elements on screen at once, distinguishing "which
        // color is which element" matters more than each one's own gradient) and its own small radial
        // offset around the hole trace, fanned out by pick order, so e.g. Au/Cu/Zn markers at the same
        // depth render as separate visible spheres instead of one totally occluding the others. A
        // single selected element gets no offset (offX/offZ both 0) — sits exactly on the trace, same
        // as the old single-element behavior.
        const n = assayDisplayElements.length;
        assayDisplayElements.forEach((sym, idx) => {
          const style = assayStyle[sym];
          const holeAssays = (assaysByHole.get(c.hole_id) || []).filter((a) => a.values[sym] != null && assayPassesCutoff(a.values[sym], style));
          const { min, max } = globalAssayRanges[sym] || { min: 0, max: 0 };
          const angle = (2 * Math.PI * idx) / n;
          const offX = n > 1 ? Math.cos(angle) * 2.2 : 0, offZ = n > 1 ? Math.sin(angle) * 2.2 : 0;
          holeAssays.forEach((a) => {
            const mid = (a.from + a.to) / 2;
            const p = findOnTrace(pts, mid);
            if (!p) return;
            const v = a.values[sym];
            const size = assaySizeFor(v, min, max, style);
            const color = assayColorFor(v, idx, style);
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 10), new THREE.MeshLambertMaterial({ color }));
            mesh.position.set(p.x + offX, p.y, p.z + offZ);
            const unit = assayElements.find((e) => e.symbol === sym)?.unit || "";
            mesh.userData = { tip: `${c.hole_id}\n${sym}: ${v} ${unit}\n${a.from.toFixed(0)}–${a.to.toFixed(0)} m` };
            groups.assay.add(mesh);
          });
        });
      }

      customLayers.forEach((layer) => {
        // TASKS.csv #227 — geometry is now built regardless of customVisible (visibility is toggled
        // cheaply afterward via the layer's own group.visible, see the small effect near layerVisible's
        // own visibility effect) so this rebuild no longer needs to re-run every time a custom layer's
        // checkbox is toggled — see customVisible's removal from this effect's own dependency array.
        (customRowsByHoleByLayer.get(layer.id)?.get(c.hole_id) || []).forEach((row) => {
          if (row.to != null && !isNaN(row.to)) {
            const p1 = findOnTrace(pts, row.from), p2 = findOnTrace(pts, row.to);
            const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(p2.x, p2.y, p2.z)]);
            const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 2, 1.6, 6, false), new THREE.MeshLambertMaterial({ color: hashColor(row.value) }));
            mesh.userData = { tip: `${c.hole_id}\n${layer.name}: ${row.value}\n${row.from.toFixed(0)}–${row.to.toFixed(0)} m` };
            layer.group.add(mesh);
          } else if (row.depth != null && !isNaN(row.depth)) {
            const p = findOnTrace(pts, row.depth);
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 10), new THREE.MeshLambertMaterial({ color: hashColor(row.value) }));
            mesh.position.set(p.x, p.y, p.z);
            mesh.userData = { tip: `${c.hole_id}\n${layer.name}: ${row.value}\n@ ${row.depth.toFixed(0)} m` };
            layer.group.add(mesh);
          }
        });
      });
     } catch (err) {
       buildErrors.push(`${c.hole_id}: ${err.message}`);
     }
    });

    // Geophysics point cloud (TASKS.csv #25) — unlike everything above, these aren't hole-relative
    // (no hole_id/depth to desurvey against): they're raw x/y/z survey points from a geophysics
    // instrument (mag, IP, gravity, whatever). Rendered once here, outside the per-hole loop, using
    // the same origin-recentering (ox/oy/oz) and axis convention as everything else in the scene
    // (scene x = world x - ox, scene y = world z - oz [elevation], scene z = -(world y - oy)
    // [-northing]) so they line up correctly with drillholes rather than needing their own transform.
    const geophysPts = (layers.geophys_pts || []).filter((r) => isRowVisible("geophys_pts", r));
    if (geophysPts.length) {
      const vals = geophysPts.map((r) => r.value).filter((v) => typeof v === "number" && !isNaN(v));
      const { min, max } = minMax(vals); // not Math.min/max(...) — a real airborne survey import can have far more points than the JS engine's argument-spread limit allows (see layers.js's minMax comment)
      // TASKS.csv #122 — graduated/classed symbology: honor the user-defined class breaks/palette set
      // via GeophysicsModule's VoxelLegendEditor (geophysPtsStops/geophysPtsColorMode/geophysPtsMin/
      // geophysPtsMax), falling back to the original 2-color magColor gradient when no stops have been
      // set yet — same "model" shape colorForVoxelValue already expects, just built from these flat
      // store fields instead of a real voxel model object.
      const geophysPtsModel = { stops: geophysPtsStops, colorMode: geophysPtsColorMode, min: geophysPtsMin ?? min, max: geophysPtsMax ?? max };
      geophysPts.forEach((row) => {
        try {
          const x = row.x - ox, y = row.z - oz, z = -(row.y - oy);
          const size = 1.4 + 2.8 * (max > min ? (row.value - min) / (max - min) : 0.3);
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), new THREE.MeshLambertMaterial({ color: colorForVoxelValue(geophysPtsModel, row.value) }));
          mesh.position.set(x, y, z);
          mesh.userData = { tip: `Geophysics point\n${row.label || "value"}: ${row.value}\n${row.x.toFixed(0)}E ${row.y.toFixed(0)}N ${row.z.toFixed(0)}Z` };
          groups.geophys_pts.add(mesh);
        } catch (err) { buildErrors.push(`geophys_pts point: ${err.message}`); }
      });
    }

    // TASKS.csv #228 — surface geochemistry samples (soil/rock-chip/stream-sediment/talus-fines), same
    // "raw world x/y/z, no hole to desurvey against" rendering as the geophys_pts block just above —
    // colored by sampling medium (colorForMedium) rather than by value, since a surface program often
    // mixes media (a soil grid plus a few rock-chip grabs) that shouldn't be blended into one gradient.
    if (layerVisible.surface_samples && surfaceSamples.length) {
      surfaceSamples.forEach((row) => {
        try {
          const x = row.x - ox, y = row.z - oz, z = -(row.y - oy);
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), new THREE.MeshLambertMaterial({ color: colorForMedium(row.medium) }));
          mesh.position.set(x, y, z);
          mesh.userData = { tip: surfaceSampleTip(row) };
          groups.surface_samples.add(mesh);
        } catch (err) { buildErrors.push(`surface sample: ${err.message}`); }
      });
    }

    // Bug fix (user report: imported a real OMF block model — resistivity.omf — into a project that
    // already had drillholes loaded, and it just never appeared, no matter how they panned/zoomed).
    // Root cause: this auto-fit only ever looked at drillhole trace points (`allTraces` above) — a
    // voxel/block model (UBC mesh, block-model CSV, or an OMF volume) never participated in the camera
    // fit AT ALL, in any code path, including the no-collars fallback above. A block model can sit
    // anywhere relative to the drillholes (a regional geophysics inversion is often centered somewhere
    // else entirely), so it would silently render fully off-screen — passing every "did it import
    // correctly" check (no errors, correct cell count reported) while being genuinely invisible.
    // Contributing each model's own min/max corner (in the same local/origin-relative, z-up-flipped
    // space `allTraces` points already use — see the `pts` mapping above) is enough to expand the fit
    // box to include it; a full per-cell contribution isn't needed since fitView only cares about the
    // overall AABB.
    (voxelModels || []).forEach((model) => {
      if (!model.cells?.length) return;
      const xs = minMax(model.cells, (c) => c.x), ys = minMax(model.cells, (c) => c.y), zs = minMax(model.cells, (c) => c.z);
      allTraces.push([
        { x: xs.min - ox, y: zs.min - oz, z: -(ys.min - oy) },
        { x: xs.max - ox, y: zs.max - oz, z: -(ys.max - oy) },
      ]);
    });

    lastTracesRef.current = allTraces;
    if (buildErrors.length) setNotices((p) => [...p, `${buildErrors.length} row(s) failed to render (skipped, rest of the model is unaffected): ${buildErrors.slice(0, 3).join(" · ")}${buildErrors.length > 3 ? "…" : ""}`]);
    if (allTraces.length) {
      if (!hasAutoFitRef.current) { fitView(allTraces); hasAutoFitRef.current = true; }
      setDataLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- voxelGeomSignature intentionally replaces
    // voxelModels here (see the comment above this effect): a mere visibility/opacity/legend toggle
    // must NOT re-trigger this effect's unconditional fitView() call and wipe out the user's pan/zoom.
  }, [collars, survey, layers, customLayers, categoryFilter, numericRange, legendOverride, isRowVisible, effectiveColor, effectiveLabel, fitView, assays, assayDisplayElements, assayStyle, assayElements, assayVisible, terrain, rasters, boundaries, omfObjects, voxelGeomSignature, fitBox, rebuildSeq, geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax, surfaceSamples, layerVisible.surface_samples]);

  // ---------- rebuild raster drapes (TASKS.csv #24, #81) ----------
  // Deliberately its own effect, not folded into the geometry-rebuild effect above: rasters come from
  // the store's persisted `rasters` list (imported once via the Geophysics module, not re-derived from
  // collars/survey/layers every render), so it only needs to re-run when that list changes, the origin
  // shifts (collars changing re-centers everything else in the scene, so the drape has to follow to
  // stay aligned — reads originRef.current, which the effect above keeps current, and this effect is
  // declared after it so within one render pass the origin is already up to date), or `terrain`
  // changes (a "drape on terrain" raster needs to re-sample if the terrain surface itself changed).
  useEffect(() => {
    const group = rasterGroupRef.current;
    if (!group) return;
    const wantedIds = new Set(rasters.map((r) => r.id));
    // Drop meshes for rasters that were removed.
    Object.keys(rasterMeshesRef.current).forEach((id) => {
      if (!wantedIds.has(id)) {
        const mesh = rasterMeshesRef.current[id];
        group.remove(mesh); mesh.geometry?.dispose?.(); mesh.material?.map?.dispose?.(); mesh.material?.dispose?.();
        delete rasterMeshesRef.current[id];
      }
    });
    const { x: ox, y: oy, z: oz } = originRef.current;
    rasters.forEach((r) => {
      const [xmin, ymin, xmax, ymax] = r.bbox;
      const w = Math.max(0.001, xmax - xmin), h = Math.max(0.001, ymax - ymin);
      const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
      const elevation = r.elevation ?? oz;
      // TASKS.csv #81 — "drape on terrain" only actually applies if a terrain surface exists; a
      // raster imported before any terrain was loaded (or with drapeMode explicitly "flat") stays a
      // flat plane at `elevation`, same as #24's original behavior.
      const drapeOnTerrain = r.drapeMode === "terrain" && !!terrain;
      // Rebuild geometry when the drape MODE changes (flat <-> terrain) or the terrain surface itself
      // changes (a re-imported/updated terrain would otherwise leave a stale drape shape) — everything
      // else (opacity, elevation for flat mode) is a cheap in-place update on the existing mesh.
      const geoKey = drapeOnTerrain ? `terrain:${terrain.id}` : "flat";
      let mesh = rasterMeshesRef.current[r.id];
      if (mesh && mesh.userData.geoKey !== geoKey) {
        // Dispose geometry AND material/texture here — the `!mesh` branch below always builds a fresh
        // texture+material from `r.dataUrl` rather than reusing the old ones, so leaving the old
        // material/texture undisposed here leaked a full-resolution GPU texture on every drape-mode
        // toggle or terrain replacement (TASKS.csv bug pass).
        group.remove(mesh); mesh.geometry.dispose(); mesh.material?.map?.dispose?.(); mesh.material?.dispose?.();
        mesh = null;
      }
      if (!mesh) {
        const texture = new THREE.TextureLoader().load(r.dataUrl);
        texture.colorSpace = THREE.SRGBColorSpace;
        // Sharpen oblique/close-up viewing of the drape (TASKS.csv "bad quality" report) — anisotropic
        // filtering only helps texels that ARE there look crisper at a grazing angle, it can't invent
        // resolution the source grid didn't have (see raster.js's MAX_TEXTURE_SIZE comment).
        texture.anisotropy = rendererRef.current?.capabilities?.getMaxAnisotropy?.() ?? 1;
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: r.opacity ?? 0.85, side: THREE.DoubleSide, depthWrite: false });
        let geometry;
        if (drapeOnTerrain) {
          // Bug fix (user report: "image is not draping correctly... zones of discrepancies"). Two
          // compounding issues here, both about how closely this mesh actually hugs the terrain mesh
          // underneath it: (1) SEG was a flat 48 regardless of how much of the terrain's own (up to
          // 200x200) grid this raster's footprint covers — a raster spanning most/all of a rugged
          // terrain (real mountain topography, not a gentle slope) was being approximated by a much
          // coarser mesh than the terrain itself, so the drape cut straight across ridges/valleys the
          // terrain mesh actually resolves, instead of following them — visible as patchy gaps/seams
          // wherever local relief was sharper than 48 segments could capture. Now scaled to the
          // terrain's own resolution over the raster's footprint fraction (capped for perf). (2) even
          // with matched resolution, a drape sampled to sit exactly ON the terrain surface is a classic
          // z-fighting setup — two coincident (or near-coincident, given #1's approximation error)
          // surfaces at the same depth flicker unpredictably between which one the GPU draws on top,
          // which reads exactly as "overall ok, but some zones look wrong" since it's viewpoint- and
          // precision-dependent, not a real gap in the data. A small constant elevation nudge (well
          // under a metre, invisible at any real-world project scale) lifts the drape just clear of the
          // terrain so it always wins the depth test cleanly.
          const rasterFracX = w / Math.max(1e-6, terrain.bbox[2] - terrain.bbox[0]);
          const rasterFracY = h / Math.max(1e-6, terrain.bbox[3] - terrain.bbox[1]);
          const SEG = Math.round(Math.min(160, Math.max(48, Math.max(rasterFracX * terrain.gridW, rasterFracY * terrain.gridH))));
          const Z_FIGHT_EPSILON = 0.15; // world units (metres) — lifts the drape just clear of the terrain mesh
          geometry = new THREE.PlaneGeometry(w, h, SEG, SEG);
          const pos = geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            // Plane starts in the XY plane (local X = world easting offset, local Y = world northing
            // offset, BEFORE the -90° X rotation below lays it flat) — sample the real-world point at
            // this vertex and set local Z (which becomes scene Y = elevation, post-rotation).
            const localX = pos.getX(i), localY = pos.getY(i);
            const worldX = cx + localX, worldY = cy + localY;
            const el = sampleTerrainElevation(terrain, worldX, worldY);
            pos.setZ(i, el - oz + Z_FIGHT_EPSILON);
          }
          pos.needsUpdate = true;
          geometry.computeVertexNormals();
        } else {
          geometry = new THREE.PlaneGeometry(w, h);
        }
        mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2; // lie flat: plane's local Y (image "up"/north, per texture V) becomes -scene.z, matching the app's north = -z convention
        mesh.userData.geoKey = geoKey;
        group.add(mesh);
        rasterMeshesRef.current[r.id] = mesh;
      } else {
        // Same shape as before — only position/material properties can change live via the sidebar
        // controls.
        mesh.material.opacity = r.opacity ?? 0.85;
      }
      mesh.visible = r.visible !== false;
      // A terrain-draped mesh's vertices already carry their own (terrain-relative) elevation — only
      // its X/Z footprint comes from cx/cy; a flat drape's single elevation still comes from `r.elevation`.
      mesh.position.set(cx - ox, drapeOnTerrain ? 0 : elevation - oz, -(cy - oy));
    });
  }, [rasters, collars, terrain, rebuildSeq]);

  // ---------- rebuild boundary polylines (Geosoft .ply import) ----------
  // Own effect/group, same reasoning as the raster-drape effect above. Each boundary can have multiple
  // polylines (multi-part boundaries are real — see geosoft.js's parsePLYBoundary comment), rendered
  // as one THREE.LineLoop per part under a per-boundary THREE.Group so visibility/color/opacity toggle
  // the whole boundary at once. Every loop is closed (LineLoop, not Line) even for source files that
  // don't explicitly repeat the first vertex — real samples are inconsistent about that, and a closed
  // loop is the more useful default for a property/survey boundary either way.
  useEffect(() => {
    const group = boundaryGroupRef.current;
    if (!group) return;
    const wantedIds = new Set(boundaries.map((b) => b.id));
    Object.keys(boundaryLinesRef.current).forEach((id) => {
      if (!wantedIds.has(id)) {
        const g = boundaryLinesRef.current[id];
        group.remove(g);
        g.children.forEach((line) => { line.geometry.dispose(); line.material.dispose(); });
        delete boundaryLinesRef.current[id];
      }
    });
    const { x: ox, y: oy, z: oz } = originRef.current;
    boundaries.forEach((b) => {
      // Rebuilt from scratch on every relevant change (own polylines, drape mode, terrain content, or
      // origin shift) rather than diffed in place — a boundary is a handful of vertices at most (real
      // samples: a few dozen), so this is cheap enough not to need the raster effect's more careful
      // geoKey-based reuse.
      let g = boundaryLinesRef.current[b.id];
      if (g) { group.remove(g); g.children.forEach((line) => { line.geometry.dispose(); line.material.dispose(); }); }
      g = new THREE.Group();
      const drapeOnTerrain = b.drapeMode === "terrain" && !!terrain;
      const elevation = b.elevation ?? oz;
      const material = new THREE.LineBasicMaterial({ color: b.color || "#e2a63c" });
      (b.polylines || []).forEach((pts) => {
        if (pts.length < 2) return;
        const positions = new Float32Array(pts.length * 3);
        pts.forEach((p, i) => {
          const el = drapeOnTerrain ? sampleTerrainElevation(terrain, p.x, p.y) : elevation;
          positions[i * 3] = p.x - ox;
          positions[i * 3 + 1] = el - oz;
          positions[i * 3 + 2] = -(p.y - oy);
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        g.add(new THREE.LineLoop(geometry, material));
      });
      g.visible = b.visible !== false;
      group.add(g);
      boundaryLinesRef.current[b.id] = g;
    });
  }, [boundaries, collars, terrain, rebuildSeq]);

  // ---------- rebuild OMF objects (TASKS.csv — Open Mining Format import) ----------
  // Own effect/group, same reasoning as the boundary/raster effects above. Unlike boundaries (always a
  // handful of vertices), an OMF point set/surface can be genuinely large (a real lithology wireframe
  // or an assay-derived point set can run into the thousands to tens of thousands of vertices), so
  // this deliberately uses ONE draw call per object (THREE.Points for point sets, THREE.LineSegments
  // for line sets, a single indexed THREE.Mesh for triangulated surfaces) rather than one mesh per
  // vertex/point the way e.g. the per-hole assay spheres do — same "don't do it the expensive way"
  // lesson from this session's render-loop/geometry-grouping performance work, applied proactively
  // here since OMF imports are exactly the kind of large external dataset that would suffer most from
  // a one-mesh-per-point approach.
  useEffect(() => {
    const group = omfGroupRef.current;
    if (!group) return;
    const disposeObj = (obj) => {
      group.remove(obj);
      obj.geometry?.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
      mats.forEach((m) => m.dispose?.());
    };
    const wantedIds = new Set(omfObjects.map((o) => o.id));
    Object.keys(omfMeshesRef.current).forEach((id) => {
      if (!wantedIds.has(id)) { disposeObj(omfMeshesRef.current[id]); delete omfMeshesRef.current[id]; }
    });
    const { x: ox, y: oy, z: oz } = originRef.current;
    omfObjects.forEach((o) => {
      if (omfMeshesRef.current[o.id]) { disposeObj(omfMeshesRef.current[o.id]); delete omfMeshesRef.current[o.id]; }
      const [gox, goy, goz] = o.origin || [0, 0, 0];
      const n = (o.vertices || []).length / 3;
      if (!n) return;
      // Same world->scene convention as everywhere else in this file: scene x = world x - ox,
      // scene y = world z - oz (elevation is "up" in the 3D view), scene z = -(world y - oy).
      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const wx = gox + o.vertices[i * 3], wy = goy + o.vertices[i * 3 + 1], wz = goz + o.vertices[i * 3 + 2];
        positions[i * 3] = wx - ox;
        positions[i * 3 + 1] = wz - oz;
        positions[i * 3 + 2] = -(wy - oy);
      }
      const color = o.color || "#5a9bd4";
      let obj;
      if (o.kind === "points") {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        obj = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 3.5, sizeAttenuation: true }));
      } else if (o.kind === "lines") {
        const segs = o.segments || [];
        const segPositions = new Float32Array(segs.length * 3);
        for (let i = 0; i < segs.length; i++) {
          const vi = segs[i];
          segPositions[i * 3] = positions[vi * 3]; segPositions[i * 3 + 1] = positions[vi * 3 + 1]; segPositions[i * 3 + 2] = positions[vi * 3 + 2];
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(segPositions, 3));
        obj = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
      } else if (o.kind === "surface") {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(o.triangles || []);
        geometry.computeVertexNormals();
        obj = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
      } else {
        return;
      }
      obj.visible = o.visible !== false;
      group.add(obj);
      omfMeshesRef.current[o.id] = obj;
    });
  }, [omfObjects, collars, rebuildSeq]);

  // ---------- rebuild terrain surface (TASKS.csv #77) ----------
  // Own effect, own group, same reasoning as the raster-drape effect above: driven by the store's
  // persisted (single) `terrain` object, not by layer-visibility churn, and needs to re-run when the
  // scene origin shifts so it stays aligned with everything else.
  useEffect(() => {
    const group = terrainGroupRef.current;
    if (!group) return;
    if (terrainMeshRef.current) {
      group.remove(terrainMeshRef.current);
      terrainMeshRef.current.geometry.dispose();
      terrainMeshRef.current.material.dispose();
      terrainMeshRef.current = null;
    }
    if (!terrain) return;
    const { x: ox, y: oy, z: oz } = originRef.current;
    const [xmin, ymin, xmax, ymax] = terrain.bbox;
    const { gridW, gridH, elevations } = terrain;
    // Built directly as a custom BufferGeometry (not PlaneGeometry+per-vertex Z tweak like the raster
    // drape above) since every vertex here has an independently meaningful world position, not just a
    // displaced flat grid — keeps the row/column -> world -> scene mapping explicit and easy to check
    // against parseDEM's own row-0-is-north convention.
    const positions = new Float32Array(gridW * gridH * 3);
    const uvs = new Float32Array(gridW * gridH * 2);
    for (let j = 0; j < gridH; j++) {
      const worldY = ymax - (j / (gridH - 1)) * (ymax - ymin); // row 0 = north/ymax edge
      for (let i = 0; i < gridW; i++) {
        const worldX = xmin + (i / (gridW - 1)) * (xmax - xmin);
        const el = elevations[j * gridW + i];
        const idx = j * gridW + i;
        positions[idx * 3] = worldX - ox;
        positions[idx * 3 + 1] = el - oz;
        positions[idx * 3 + 2] = -(worldY - oy);
        uvs[idx * 2] = i / (gridW - 1);
        uvs[idx * 2 + 1] = 1 - j / (gridH - 1);
      }
    }
    const indices = [];
    for (let j = 0; j < gridH - 1; j++) {
      for (let i = 0; i < gridW - 1; i++) {
        const a = j * gridW + i, b = a + 1, c = a + gridW, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ color: terrain.color || "#8a7f68", side: THREE.DoubleSide, transparent: (terrain.opacity ?? 1) < 1, opacity: terrain.opacity ?? 1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = terrain.visible !== false;
    group.add(mesh);
    terrainMeshRef.current = mesh;
  }, [terrain, collars, rebuildSeq]);

  // Keeps the locator mini-map's real-world position in sync with wherever the scene's origin actually
  // sits — same trigger set as the origin-computing effect above (collars/terrain changes, or a manual
  // Refresh view) since originRef.current is what that effect recomputes and this one just converts to
  // lon/lat for display. A separate effect (not folded into the one above) because toLonLat is async
  // (a proj4 lookup) and that one needs to stay synchronous so every OTHER effect reading
  // originRef.current right after it runs in the same commit sees the final value, not a stale one
  // waiting on a promise. The cancelled-guard stops a slow/overlapping call from clobbering a newer one.
  useEffect(() => {
    let cancelled = false;
    const { x, y } = originRef.current;
    toLonLat(x, y, project?.epsg).then((ll) => { if (!cancelled) setProjectLonLat(ll); });
    return () => { cancelled = true; };
  }, [collars, terrain, project?.epsg, rebuildSeq]);

  // ---- rebuild voxel / block models (TASKS.csv #27/#28) ----
  // One THREE.InstancedMesh per model, cheap to move/scale per-instance via instanceMatrix rather
  // than one Mesh per cell (a real UBC mesh or block model import can be tens of thousands of cells —
  // that many individual draw calls would be its own perf cliff). Rebuilds the whole instance set
  // whenever a model's cell list or threshold changes (same full-rebuild-on-change approach as the
  // raster/terrain effects above, not incremental patching) — GeophysicsModule debounces the
  // threshold slider before it reaches the store specifically so this doesn't rebuild on every pixel
  // of a drag.
  useEffect(() => {
    const group = voxelGroupRef.current;
    if (!group) return;
    const wantedIds = new Set(voxelModels.map((v) => v.id));
    Object.keys(voxelMeshesRef.current).forEach((id) => {
      if (!wantedIds.has(id)) {
        const mesh = voxelMeshesRef.current[id];
        group.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        delete voxelMeshesRef.current[id];
      }
    });
    const { x: ox, y: oy, z: oz } = originRef.current;
    const tmpMatrix = new THREE.Matrix4();
    const tmpColor = new THREE.Color();
    voxelModels.forEach((model) => {
      // Always rebuilt from scratch (see comment above) — dispose any previous instance of this model.
      const prev = voxelMeshesRef.current[model.id];
      if (prev) { group.remove(prev); prev.geometry.dispose(); prev.material.dispose(); delete voxelMeshesRef.current[model.id]; }

      const threshold = Number.isFinite(model.threshold) ? model.threshold : -Infinity;
      // TASKS.csv #188 — drillhole targeting module: "an option in the voxels that will turn off
      // the specified geophysical survey ranges — if I just wanna see my mag high, or my mag low or
      // IP high". The existing `threshold` field (GeophysicsModule's "Cutoff" slider) was always a
      // lower bound only (value >= threshold, i.e. "hide everything below X"), which alone can't
      // isolate a band like "IP high" or "mag low" — for that you need BOTH ends. Adding an upper
      // bound `rangeMax` alongside it (defaults to +Infinity, i.e. unbounded, for every model that
      // predates this — same backward-compatible-default pattern as every other optional model
      // field here) turns the same cutoff into a genuine min/max range: set threshold high for "mag
      // high", set rangeMax low for "mag low", or bracket both for an isolated IP-high band. The
      // Targeting module's sidebar (below) is what exposes rangeMax in the UI; GeophysicsModule's
      // own Cutoff slider is untouched and keeps working exactly as before (rangeMax simply stays at
      // its unbounded default unless the Targeting tab's controls are used).
      const rangeMax = Number.isFinite(model.rangeMax) ? model.rangeMax : Infinity;
      const cells = model.cells.filter((c) => c.value >= threshold && c.value <= rangeMax);
      if (!cells.length) return;

      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const opacity = model.opacity ?? 0.85;
      // IMPORTANT: do NOT set vertexColors:true here. That flag is for a geometry's own per-VERTEX
      // "color" attribute (BoxGeometry has none), and three.js's InstancedMesh per-INSTANCE color
      // (mesh.setColorAt/instanceColor) is applied automatically via its own USE_INSTANCING_COLOR
      // shader path regardless of this flag. Turning vertexColors on anyway made every voxel/block
      // model render 100% solid black (root-caused by reading three.js's own color_vertex shader
      // chunk): with USE_COLOR defined, the vertex shader declares an `attribute vec3 color` that
      // this geometry never binds a buffer for, WebGL defaults an unbound attribute to (0,0,0), and
      // `vColor *= color` zeroed the color out BEFORE it was multiplied by the correct instanceColor
      // — so the JS-side color data (verified correct via a live instanceColor.array dump) never
      // reached the screen. Confirmed live: forcing vertexColors:false while leaving instanceColor
      // set turned the fragment from rgb(0,0,0) into the correct rgb(91,62,91)-family color.
      // TASKS.csv #201 — bug fix: "voxel has a bug that it will only display the selected opacity
      // from certain angles." Root cause: a transparent material with the default depthWrite:true
      // still writes into the depth buffer, and three.js does NOT depth-sort individual instances
      // within one InstancedMesh draw call — so whichever voxel happens to rasterize first (an order
      // that shifts with camera angle) occludes the ones behind it in the depth test, making them
      // vanish outright instead of blending, rather than a uniform semi-transparent appearance from
      // every angle. depthWrite:false (only while actually transparent — an opaque model at
      // opacity>=1 keeps depthWrite:true, unchanged, so it still occludes other opaque geometry
      // correctly) removes that per-angle culling: every instance now blends over whatever was
      // already drawn behind it instead of fighting the depth buffer. This doesn't add true
      // back-to-front instance sorting (a real per-frame sort would be its own perf cost at tens of
      // thousands of cells), so overlapping voxels can still blend in draw order rather than strict
      // depth order — but that's a subtle blending-order nuance, not the reported bug (voxels
      // disappearing/reappearing depending on view angle).
      const material = new THREE.MeshLambertMaterial({ transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
      const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
      const { min, max } = model;
      // TASKS.csv #209 — perf fix, profiled not guessed. Real repro: an OMF-style model with its own
      // colour stops (Matt's own real workflow — see makeVoxelColorResolverRGB's comment) hitting
      // colorForVoxelValue() once per cell was re-sorting the stops array AND re-parsing every stop's
      // hex string on every single call, then handing a freshly-built string to tmpColor.setStyle()
      // for a THIRD parse (regex-based CSS color grammar) — all of that repeated per cell rather than
      // once per model. Built once here instead: a closure that only does cheap numeric interpolation,
      // paired with tmpColor.setRGB() (plain numbers, no string anywhere) instead of setStyle().
      const resolveColorRGB = makeVoxelColorResolverRGB(model);
      cells.forEach((c, i) => {
        tmpMatrix.compose(
          new THREE.Vector3(c.x - ox, c.z - oz, -(c.y - oy)),
          new THREE.Quaternion(),
          new THREE.Vector3(Math.max(c.dx, 0.01), Math.max(c.dz, 0.01), Math.max(c.dy, 0.01))
        );
        mesh.setMatrixAt(i, tmpMatrix);
        const [cr, cg, cb] = resolveColorRGB(c.value);
        // setRGB's default colorSpace is ColorManagement.workingColorSpace (linear), NOT sRGB — unlike
        // setStyle's own default (SRGBColorSpace). Passing SRGBColorSpace explicitly here is required
        // to reproduce the exact same displayed color setStyle("rgb(...)") used to produce; omitting
        // it would silently reinterpret these 0-255 sRGB values as already-linear, visibly darkening
        // every voxel's color relative to before this change.
        tmpColor.setRGB(cr / 255, cg / 255, cb / 255, THREE.SRGBColorSpace);
        mesh.setColorAt(i, tmpColor);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = model.visible !== false;
      group.add(mesh);
      voxelMeshesRef.current[model.id] = mesh;
    });
  }, [voxelModels, collars]);

  // TASKS.csv #188 — planned drillholes (drillhole planning/targeting module). A planned hole has no
  // downhole survey (it hasn't been drilled yet) — just a collar plus a single design azimuth/dip/
  // length, which is EXACTLY the "no survey stations" branch desurveyHole already supports (see its
  // own comment: "no survey stations -> straight line from collar.azimuth/dip/length"), so this reuses
  // that shared math verbatim rather than re-deriving a straight-line trajectory here. Rendered
  // distinctly from real (drilled) holes — dashed line (LineDashedMaterial, matches the common
  // industry convention of drawing planned/proposed holes dashed on a section) in a bright cyan that
  // doesn't collide with any lithology/alteration/vein color already in use, plus a small diamond-
  // shaped toe marker so the hole's endpoint (not just its direction) is visible at a glance.
  useEffect(() => {
    const group = plannedGroupRef.current;
    if (!group) return;
    const wantedIds = new Set(plannedHoles.map((h) => h.id));
    Object.keys(plannedMeshesRef.current).forEach((id) => {
      if (!wantedIds.has(id)) {
        const obj = plannedMeshesRef.current[id];
        group.remove(obj);
        obj.traverse((child) => { child.geometry?.dispose(); child.material?.dispose(); });
        delete plannedMeshesRef.current[id];
      }
    });
    const { x: ox, y: oy, z: oz } = originRef.current;
    const PLANNED_COLOR = 0x22c9e0;
    plannedHoles.forEach((hole) => {
      const prev = plannedMeshesRef.current[hole.id];
      if (prev) { group.remove(prev); prev.traverse((child) => { child.geometry?.dispose(); child.material?.dispose(); }); delete plannedMeshesRef.current[hole.id]; }
      if (hole.x == null || hole.y == null || hole.z == null || !isFinite(hole.x) || !isFinite(hole.y) || !isFinite(hole.z)) return;

      const raw = plannedHoleTrace(hole); // no survey stations -> straight line from hole.azimuth/dip/length
      if (!raw.length) return;
      const pts = raw.map((p) => ({ x: p.x - ox, y: p.z - oz, z: -(p.y - oy) }));

      const holeGroup = new THREE.Group();
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z))),
        new THREE.LineDashedMaterial({ color: PLANNED_COLOR, dashSize: 4, gapSize: 2.5, transparent: true, opacity: 0.9 })
      );
      line.computeLineDistances(); // required for LineDashedMaterial to actually render dashed, not solid
      holeGroup.add(line);

      const collarMarker = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 10), new THREE.MeshBasicMaterial({ color: PLANNED_COLOR }));
      collarMarker.position.set(pts[0].x, pts[0].y, pts[0].z);
      collarMarker.userData = { tip: `${hole.name || "Planned hole"}\ncollar (planned)\nAz ${Math.round(hole.azimuth)}° / Dip ${Math.round(hole.dip)}° / ${Math.round(hole.length)} m` };
      holeGroup.add(collarMarker);

      const toe = pts[pts.length - 1];
      const toeMarker = new THREE.Mesh(new THREE.OctahedronGeometry(2.8, 0), new THREE.MeshBasicMaterial({ color: PLANNED_COLOR, wireframe: false }));
      toeMarker.position.set(toe.x, toe.y, toe.z);
      toeMarker.userData = { tip: `${hole.name || "Planned hole"}\ntoe (planned, ${Math.round(hole.length)} m)` };
      holeGroup.add(toeMarker);

      holeGroup.visible = hole.visible !== false;
      group.add(holeGroup);
      plannedMeshesRef.current[hole.id] = holeGroup;
    });
  }, [plannedHoles]);

  // TASKS.csv #121 — measurement tool's own 3D visual: a solid line/polyline for distance mode (each
  // segment is a real placed measurement, unlike the dashed "planned/proposed" convention #188 uses),
  // or the same line auto-closed with one dashed segment back to the start for area mode (dashed
  // specifically on the closing edge only, so it reads as "this edge is implied, not clicked" — the
  // rest of the polygon outline stays solid since those edges WERE explicitly clicked). Small sphere
  // markers at each vertex double as click targets for nothing in particular yet, but give a clear
  // visual anchor for exactly where each point landed (useful feedback since the terrain-aware
  // raycast in onMeasureClick can land at a slightly different screen position than expected on
  // steep/complex terrain). Same world->scene transform plannedHoles' own render effect uses just
  // above, and the same dispose-before-rebuild pattern every other store-driven 3D group here follows.
  useEffect(() => {
    const group = measureGroupRef.current;
    if (!group) return;
    while (group.children.length) {
      const obj = group.children.pop();
      obj.traverse((child) => { child.geometry?.dispose(); child.material?.dispose(); });
    }
    if (!measurePts.length) return;
    const { x: ox, y: oy, z: oz } = originRef.current;
    const MEASURE_COLOR = 0xe2a63c;
    const pts = measurePts.map((p) => ({ x: p.x - ox, y: p.z - oz, z: -(p.y - oy) }));

    if (pts.length > 1) {
      const solidLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z))),
        new THREE.LineBasicMaterial({ color: MEASURE_COLOR, transparent: true, opacity: 0.95 })
      );
      group.add(solidLine);
    }
    if (measureMode === "area" && pts.length > 2) {
      const closeLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([pts[pts.length - 1], pts[0]].map((p) => new THREE.Vector3(p.x, p.y, p.z))),
        new THREE.LineDashedMaterial({ color: MEASURE_COLOR, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.85 })
      );
      closeLine.computeLineDistances();
      group.add(closeLine);
    }
    pts.forEach((p, i) => {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 10), new THREE.MeshBasicMaterial({ color: MEASURE_COLOR }));
      marker.position.set(p.x, p.y, p.z);
      marker.userData = { tip: `Point ${i + 1}\nE ${measurePts[i].x.toFixed(1)} / N ${measurePts[i].y.toFixed(1)} / Elev ${measurePts[i].z.toFixed(1)}` };
      group.add(marker);
    });
  }, [measurePts, measureMode]);

  useEffect(() => {
    const groups = layerGroupsRef.current;
    Object.keys(LAYER_META).forEach((k) => { if (groups[k]) groups[k].visible = !!layerVisible[k]; });
    if (groups.assay) groups.assay.visible = assayVisible;
    // TASKS.csv #227 — custom CSV layers get the same cheap visibility toggle standard layer types
    // already had here, instead of a check that used to live INSIDE the big geometry-rebuild effect
    // (gating whether a hidden custom layer's per-hole geometry got built at all) — that coupling meant
    // toggling one custom layer's visibility retriggered a full rebuild of EVERY layer's geometry, not
    // just its own. Geometry for a hidden custom layer is still built (see that effect's own comment)
    // so this can just flip .visible on its already-populated group instead.
    customLayers.forEach((layer) => { if (groups[layer.id]) groups[layer.id].visible = customVisible[layer.id] !== false; });
  }, [layerVisible, assayVisible, customLayers, customVisible]);

  useEffect(() => {
    const groups = layerGroupsRef.current;
    Object.values(groups).forEach((g) => {
      g.children.forEach((child) => {
        const tip = child.userData?.tip || "";
        const holeId = tip.split("\n")[0];
        child.visible = !(holeId && visibleHoles[holeId] === false);
      });
    });
  }, [visibleHoles]);

  // ---------- generic import pipeline ----------
  const openImportModal = (file, forceTarget) => {
    parseVectorFile(file, (data, err, meta) => {
      if (err || !data || !data.length) { setNotices((p) => [...p, `${file.name}: couldn't read ${err ? "file (" + err + ")" : "— no rows found"}.`]); return; }
      const headers = meta?.headers || Object.keys(data[0]);
      if (!forceTarget && looksLikeAssay(headers)) {
        setNotices((p) => [...p, `${file.name} looks like assay data — import it from the Geochem module instead (it needs the element checklist).`]);
        return;
      }
      const target = forceTarget || guessTarget(headers);
      const schema = TARGET_SCHEMAS[target];
      const mapping = {};
      schema.fields.forEach((f) => { mapping[f.key] = guessColumn(headers, f.aliases); });
      const perRowEpsgCol = guessColumn(headers, EPSG_COL_ALIASES);
      setImportModal({ file, fileName: file.name, headers, rowCount: data.length, sampleRows: data.slice(0, 5), allRows: data, target, mapping, dipConvention: "neg_down", perRowEpsgCol, sourceEpsg: meta?.detectedEpsg ? String(meta.detectedEpsg) : "" });
      if (meta?.note) setNotices((p) => [...p, `${file.name}:${meta.note}`]);
    });
  };

  // same pipeline as CSV import, just fed from a database query result instead of a parsed file
  const openImportFromRows = ({ headers, rows, sourceName }) => {
    if (!rows.length) return;
    if (looksLikeAssay(headers)) { setNotices((p) => [...p, `${sourceName} looks like assay data — import it from the Geochem module instead.`]); return; }
    const target = guessTarget(headers);
    const schema = TARGET_SCHEMAS[target];
    const mapping = {};
    schema.fields.forEach((f) => { mapping[f.key] = guessColumn(headers, f.aliases); });
    const perRowEpsgCol = guessColumn(headers, EPSG_COL_ALIASES);
    setImportModal({ fileName: sourceName, headers, rowCount: rows.length, sampleRows: rows.slice(0, 5), allRows: rows, target, mapping, dipConvention: "neg_down", perRowEpsgCol });
    setDbModalOpen(false);
  };

  // Does the actual import given a fully-resolved {target, mapping, allRows, dipConvention, fileName}
  // — split out from the modal's "Import" button handler so a multi-file drag-and-drop (see
  // handleDrop/processImportQueue below) can commit files it's confident about without ever opening
  // the modal, while still routing through the exact same logic or one that needs confirmation.
  // Returns false (and leaves the caller to show a notice) if required fields aren't mapped.
  const commitImportData = ({ target, mapping, allRows, dipConvention, fileName, sourceEpsg, perRowEpsgCol, customFields }) => {
    const schema = TARGET_SCHEMAS[target];
    const missing = schema.fields.filter((f) => f.required && !mapping[f.key]);
    if (missing.length) { setNotices((p) => [...p, `${fileName}: map required field(s) — ${missing.map((f) => f.label).join(", ")}`]); return false; }
    const flipDip = (raw) => (dipConvention === "neg_down" ? -raw : raw);

    if (target === "collars") {
      let rows = allRows.map((r) => applyCustomFields({
        hole_id: String(r[mapping.hole_id] ?? "").trim(), x: Number(r[mapping.x]), y: Number(r[mapping.y]), z: Number(r[mapping.z]),
        azimuth: mapping.azimuth ? Number(r[mapping.azimuth]) : undefined,
        dip: mapping.dip ? flipDip(Number(r[mapping.dip])) : undefined,
        length: mapping.length ? Number(r[mapping.length]) : undefined,
        // Per-row source EPSG (TASKS.csv #205), carried alongside the row only long enough to drive
        // the reprojection pass below — stripped before the collar is stored.
        _rowEpsg: perRowEpsgCol ? String(r[perRowEpsgCol] ?? "").trim() : "",
      }, r, customFields)).filter((r) => r.hole_id && !isNaN(r.x));
      // TASKS.csv #120 — on-the-fly reprojection for general vector layers. Collars are the primary
      // absolute-world-coordinate import in this app (every other layer is hole-relative and inherits
      // its position by desurveying against a collar+survey trace), so reprojecting here is what
      // actually lets a geologist combine a collar list pulled in a different UTM zone with the rest
      // of the project — same "reproject at import" approach parseDEMFiles already uses for rasters.
      //
      // TASKS.csv #205 — a per-row source-CRS column (e.g. a merged regional DB export spanning two
      // UTM zones, like 3157/3156) can't be handled by one global "Source CRS" reprojection pass over
      // the whole batch: each row needs to be reprojected FROM ITS OWN declared EPSG. Rows are grouped
      // by their own per-row EPSG value and each group is reprojected separately; a row with a missing
      // or unrecognized per-row value falls back to the single global `sourceEpsg` override exactly
      // like the pre-#205 behavior (and if that's also unset/unrecognized, its x/y is left as-is).
      let reprojectNote = "";
      if (project?.epsg && (perRowEpsgCol || (sourceEpsg && Number(sourceEpsg) !== Number(project.epsg)))) {
        const toEpsg = project.epsg;
        const groups = new Map(); // fromEpsg key ("" = fall back to global sourceEpsg) -> rows in that group
        rows.forEach((r) => {
          const key = r._rowEpsg || "";
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(r);
        });
        let reprojectedCount = 0, unreprojectedCount = 0;
        const okEpsgs = [], badEpsgs = [];
        for (const [rowEpsgKey, groupRows] of groups) {
          const fromEpsg = rowEpsgKey || sourceEpsg;
          if (!fromEpsg || Number(fromEpsg) === Number(toEpsg)) { unreprojectedCount += groupRows.length; continue; }
          let groupFailed = 0;
          groupRows.forEach((r) => {
            const p = reprojectXY(r.x, r.y, fromEpsg, toEpsg);
            if (!p) { groupFailed++; return; }
            r.x = p.x; r.y = p.y;
          });
          if (groupFailed && !badEpsgs.includes(fromEpsg)) badEpsgs.push(fromEpsg);
          unreprojectedCount += groupFailed;
          const succeeded = groupRows.length - groupFailed;
          if (succeeded) { reprojectedCount += succeeded; if (!okEpsgs.includes(fromEpsg)) okEpsgs.push(fromEpsg); }
        }
        const parts = [];
        if (reprojectedCount) parts.push(`reprojected ${reprojectedCount} row(s) from EPSG:${okEpsgs.join("/")} to the project's EPSG:${toEpsg}`);
        if (unreprojectedCount) parts.push(`left ${unreprojectedCount} row(s) unchanged${badEpsgs.length ? ` (unrecognized EPSG:${badEpsgs.join("/")})` : " (already the project CRS, or no source CRS given)"}`);
        reprojectNote = parts.length ? ` On import: ${parts.join("; ")}.` : "";
      }
      rows = rows.map(({ _rowEpsg, ...rest }) => rest);
      const map = new Map([...collars, ...rows].map((c) => [c.hole_id, c]));
      setCollars(Array.from(map.values()));
      setVisibleHoles((prev) => ({ ...prev, ...Object.fromEntries(rows.map((r) => [r.hole_id, true])) }));
      setNotices((p) => [...p, `Loaded ${rows.length} collars from ${fileName}.${reprojectNote}`]);
    } else if (target === "survey") {
      const rows = allRows.map((r) => applyCustomFields({ hole_id: String(r[mapping.hole_id] ?? "").trim(), depth: Number(r[mapping.depth]), azimuth: Number(r[mapping.azimuth]), dip: flipDip(Number(r[mapping.dip])) }, r, customFields)).filter((r) => r.hole_id && !isNaN(r.depth));
      setSurvey((prev) => [...prev, ...rows]);
      setNotices((p) => [...p, `Loaded ${rows.length} survey stations from ${fileName}.`]);
    } else if (target === "structure") {
      const rows = allRows.map((r) => ({ ...normStructure(r, mapping, customFields), _src: fileName })).filter((r) => r.hole_id && !isNaN(r.depth));
      setLayers((p) => ({ ...p, structure: [...(p.structure || []), ...rows] }));
      setLayerVisible((p) => ({ ...p, structure: true }));
      setNotices((p) => [...p, `Loaded ${rows.length} structure points from ${fileName}.`]);
    } else if (target === "custom") {
      const isPoint = mapping.depth && !mapping.from;
      const rows = allRows.map((r) => applyCustomFields({
        hole_id: String(r[mapping.hole_id] ?? "").trim(),
        from: mapping.from ? Number(r[mapping.from]) : undefined, to: mapping.to ? Number(r[mapping.to]) : undefined,
        depth: mapping.depth ? Number(r[mapping.depth]) : undefined, value: r[mapping.value],
      }, r, customFields)).filter((r) => r.hole_id);
      const id = `custom_${Date.now()}`;
      const group = new THREE.Group(); group.name = id;
      layerGroupsRef.current[id] = group;
      sceneRef.current.getObjectByName("root").add(group);
      setCustomLayers((p) => [...p, { id, name: fileName.replace(/\.csv$/i, ""), rows, group }]);
      setCustomVisible((p) => ({ ...p, [id]: true }));
      setNotices((p) => [...p, `Added "${fileName}" as a custom layer (${rows.length} rows).`]);
    } else {
      // _src (source filename) is stamped on every row here — TASKS.csv #63: lets the layer inspector
      // (LayerInspector.jsx) break a layer down by which import it came from, since it's common to
      // build up one layer (e.g. lithology) from several CSVs (different holes, different field
      // seasons) and later want to pull just one of those back out without clearing the whole layer.
      const numeric = LAYER_META[target].numeric;
      const rows = (numeric ? allRows.map((r) => normNumericInterval(r, mapping, customFields)).filter((r) => r.hole_id && !isNaN(r.from) && !isNaN(r.value))
        : allRows.map((r) => normInterval(r, mapping, customFields)).filter((r) => r.hole_id && !isNaN(r.from))).map((r) => ({ ...r, _src: fileName }));
      setLayers((p) => ({ ...p, [target]: [...(p[target] || []), ...rows] }));
      setLayerVisible((p) => ({ ...p, [target]: true }));
      if (numeric) { const vals = rows.map((r) => r.value); setNumericRange((p) => ({ ...p, [target]: minMax(vals) })); } // not Math.min/max(...) — see layers.js's minMax comment
      setNotices((p) => [...p, `Loaded ${rows.length} rows into ${LAYER_META[target].label} from ${fileName}.`]);
    }
    return true;
  };

  // Modal's "Import" button: commit whatever's currently in importModal state, then close it and
  // let the multi-file queue (if there is one) move on to the next file.
  const commitImport = () => {
    if (!importModal) return;
    commitImportData(importModal);
    setImportModal(null);
    processImportQueue();
  };

  // ---------- multi-file drag-and-drop (drop several CSVs on the viewport at once) ----------
  // Files this module is CONFIDENT about (guessTarget picked a specific known type, not the
  // "custom" fallback, and every required column was found by guessColumn) import immediately with
  // no dialog. Anything less certain — an unrecognized shape, a required column guessColumn
  // couldn't find — still opens the same mapping modal used for a single-file drop, one at a time,
  // so nothing gets imported wrong silently. The queue (importQueueRef) advances after each modal
  // commit/cancel and after each auto-import, until every dropped file has been handled.
  const importQueueRef = useRef([]);
  const importQueueTotalRef = useRef(0); // total files this drop started with, for the progress bar
  // TASKS.csv #229 — re-entrancy guard against a double-import: if handleDrop somehow fires twice for
  // one physical drop (nested drop zones, or the OS/Electron bridging a file drop through more than
  // one path), the second call used to overwrite importQueueRef.current with a fresh copy of the SAME
  // files mid-flight, while the first call's async parseVectorFile chain was still running — so when
  // that first chain's callback called processImportQueue() again, it resumed draining the SECOND
  // call's freshly-reset array from the top, re-importing files the first chain had already committed.
  // importActiveRef blocks a second queue from starting while one is already draining.
  const importActiveRef = useRef(false);
  const processImportQueue = useCallback(() => {
    const file = importQueueRef.current.shift();
    if (!file) { importActiveRef.current = false; setTaskProgress?.(null); importQueueTotalRef.current = 0; return; }
    const total = importQueueTotalRef.current || importQueueRef.current.length + 1;
    const doneCount = total - importQueueRef.current.length; // this file counts as "now processing"
    setTaskProgress?.({ label: `Importing files (${doneCount}/${total}): ${file.name}`, pct: Math.round((doneCount / total) * 100) });
    parseVectorFile(file, (data, err, meta) => {
      if (err || !data || !data.length) { setNotices((p) => [...p, `${file.name}: couldn't read ${err ? "file (" + err + ")" : "— no rows found"}.`]); processImportQueue(); return; }
      const headers = meta?.headers || Object.keys(data[0]);
      if (meta?.note) setNotices((p) => [...p, `${file.name}:${meta.note}`]);
      if (looksLikeAssay(headers)) {
        setNotices((p) => [...p, `${file.name} looks like assay data — import it from the Geochem module instead (it needs the element checklist).`]);
        processImportQueue();
        return;
      }
      const target = guessTarget(headers);
      const schema = TARGET_SCHEMAS[target];
      const mapping = {};
      schema.fields.forEach((f) => { mapping[f.key] = guessColumn(headers, f.aliases); });
      const missingRequired = schema.fields.filter((f) => f.required && !mapping[f.key]);
      const confident = target !== "custom" && missingRequired.length === 0;
      const modalData = { file, fileName: file.name, headers, rowCount: data.length, sampleRows: data.slice(0, 5), allRows: data, target, mapping, dipConvention: "neg_down" };
      if (confident) {
        commitImportData(modalData);
        processImportQueue();
      } else {
        const remaining = importQueueRef.current.length;
        setImportModal({ ...modalData, fileName: remaining ? `${file.name} (${remaining} more queued)` : file.name });
      }
    });
  }, [setTaskProgress]);

  // TASKS.csv #190/#191 — .zip (shapefile bundle) and .gpkg accepted here alongside .csv, matching
  // the file inputs' own accept="" lists below. A bare .shp (no surrounding .zip) is also accepted —
  // it just imports with no attributes if no .dbf was dropped alongside it in the SAME drop (loose
  // multi-file .shp/.shx/.dbf sets dropped together aren't grouped by basename here — out of scope
  // for this pass; the .zip bundle this app's own shapefile export already produces, or that any GIS
  // tool's "export as zipped shapefile" option produces, is the primary supported path).
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []).filter((f) => /\.(csv|zip|gpkg|shp)$/i.test(f.name));
    const skipped = e.dataTransfer.files.length - files.length;
    if (!files.length) { setNotices((p) => [...p, "Only .csv, .zip (shapefile), .shp, or .gpkg files can be dropped in directly."]); return; }
    if (skipped) setNotices((p) => [...p, `${skipped} unrecognized file(s) skipped.`]);
    if (files.length === 1) { openImportModal(files[0]); return; }
    // TASKS.csv #229 — ignore a second drop-queue start while one is still draining (see
    // importActiveRef's own comment above processImportQueue) instead of stomping the in-flight queue.
    if (importActiveRef.current) { setNotices((p) => [...p, "Already importing a previous drop — please wait for it to finish before dropping more files."]); return; }
    importActiveRef.current = true;
    setNotices((p) => [...p, `Importing ${files.length} files — auto-detecting each one, will ask when unsure…`]);
    importQueueTotalRef.current = files.length;
    importQueueRef.current = files;
    processImportQueue();
  };

  const removeCustomLayer = (id) => { const g = layerGroupsRef.current[id]; if (g) { g.parent?.remove(g); delete layerGroupsRef.current[id]; } setCustomLayers((p) => p.filter((l) => l.id !== id)); };
  // TASKS.csv #222 — useCallback so this keeps a stable identity across renders, required for
  // HoleRow's React.memo (below) to actually skip re-rendering sibling rows on an unrelated toggle.
  const toggleHole = useCallback((id) => setVisibleHoles((p) => ({ ...p, [id]: p[id] === false ? true : false })), []);
  // TASKS.csv #124 — QGIS-specialist audit finding: "No way to select all collars within a polygon."
  // Scoped to spatial selection against an already-loaded boundary/claim (both live in the same
  // `boundaries` store collection — see #126) — reuses the existing visibleHoles/toggleHole hole-
  // visibility mechanism (the same one "Hide {holeId}" in the context menu already uses) rather than
  // introducing a separate "selection" concept, so isolating/hiding by location composes naturally
  // with every other hole-visibility control already in this sidebar. The attribute-expression half of
  // this task ("Au > 1 AND lithology = V6") is intentionally NOT built here — that's a fundamentally
  // different, much bigger feature (a real expression parser/evaluator across assay+layer data) this
  // task's own notes tie to the separate, also-Planned DuckDB-WASM SQL panel (#50) instead of
  // duplicating a one-off mini-parser here.
  const [selectByLocationBoundaryId, setSelectByLocationBoundaryId] = useState("");
  const selectByLocation = (mode) => {
    const boundary = boundaries.find((b) => b.id === selectByLocationBoundaryId);
    if (!boundary) return;
    const inside = new Set(collars.filter((c) => pointInBoundary(c.x, c.y, boundary.polylines)).map((c) => c.hole_id));
    if (mode === "isolate") {
      setVisibleHoles(Object.fromEntries(collars.map((c) => [c.hole_id, inside.has(c.hole_id)])));
      setNotices((p) => [...p, `Showing only the ${inside.size} of ${collars.length} collar(s) inside "${boundary.name}" — every other hole is now hidden.`]);
    } else {
      setVisibleHoles((prev) => { const next = { ...prev }; collars.forEach((c) => { if (inside.has(c.hole_id)) next[c.hole_id] = false; }); return next; });
      setNotices((p) => [...p, `Hid ${inside.size} collar(s) inside "${boundary.name}".`]);
    }
  };
  const toggleLayer = (key) => setLayerVisible((p) => ({ ...p, [key]: !p[key] }));
  const toggleCustom = (id) => setCustomVisible((p) => ({ ...p, [id]: p[id] === false ? true : false }));
  const toggleCategory = (layerKey, value) => setCategoryFilter((p) => { const cur = new Set(p[layerKey] || []); if (cur.has(value)) cur.delete(value); else cur.add(value); return { ...p, [layerKey]: cur }; });
  const setLegendColor = (layerKey, value, color) => setLegendOverride((p) => ({ ...p, [layerKey]: { ...p[layerKey], [value]: { ...p[layerKey]?.[value], color } } }));
  const setLegendLabel = (layerKey, value, label) => setLegendOverride((p) => ({ ...p, [layerKey]: { ...p[layerKey], [value]: { ...p[layerKey]?.[value], label } } }));
  // TASKS.csv #63 — bulk category visibility (show all / hide all / "only" this one), on top of the
  // existing one-at-a-time per-category eye icons. "Only" is the one the user actually asked for
  // (hide everything, then turn on just the one lithology code they care about) — the other two are
  // the natural companions for resetting back out of a filtered state.
  const showAllCategories = (layerKey) => setCategoryFilter((p) => ({ ...p, [layerKey]: new Set() }));
  const hideAllCategories = (layerKey) => {
    const values = distinctValues(layers[layerKey] || []).map(([v]) => v);
    setCategoryFilter((p) => ({ ...p, [layerKey]: new Set(values) }));
  };
  const isolateCategory = (layerKey, value) => {
    const values = distinctValues(layers[layerKey] || []).map(([v]) => v).filter((v) => v !== value);
    setCategoryFilter((p) => ({ ...p, [layerKey]: new Set(values) }));
  };
  // TASKS.csv #63 — remove just the rows that came from one imported CSV, without clearing the rest
  // of a layer that was built up from several files.
  const removeLayerSource = (layerKey, src) => {
    setLayers((p) => ({ ...p, [layerKey]: (p[layerKey] || []).filter((r) => (r._src || "(unlabeled — imported before this was tracked)") !== src) }));
  };
  // TASKS.csv #63 — "unload" a layer entirely (distinct from the per-source removal above): drops
  // every row at once, e.g. when a whole CSV's worth of data was imported to the wrong layer target
  // or just isn't wanted anymore, without deleting the drillholes it was hung off of.
  const clearLayer = (layerKey) => {
    const n = (layers[layerKey] || []).length;
    if (!n) return;
    if (!window.confirm(`Remove all ${n} row(s) from "${LAYER_META[layerKey].label}"? This can't be undone.`)) return;
    setLayers((p) => ({ ...p, [layerKey]: [] }));
    setNotices((p) => [...p, `Cleared ${n} row(s) from ${LAYER_META[layerKey].label}.`]);
  };

  // TASKS.csv — user request: right-click a vector layer (litho/alt/vein/etc., or collars/survey) to
  // export it as a Shapefile, or inspect/edit its raw attribute table. Converts whichever data kind
  // into world-coordinate geometry + a flat attributes object per row, using the same desurvey
  // machinery (tracesRef, findOnTraceWorld) everything else in this file already relies on for
  // "where does this hole_id/depth actually sit in the real world" — collars are already world points,
  // survey is exported as the desurveyed trace (a raw survey STATION table has no geometry on its own;
  // the trace it produces does), interval-kind layers (litho/alt/vein/geotech) become 2-vertex
  // polylines from their from/to depths, point-kind layers (mnlgy/magsusc) and structure planes become
  // single points at their depth, and geophys_pts (already raw world x/y/z) pass through unchanged.
  const buildVectorFeatures = (kind, key) => {
    if (kind === "collars") {
      return {
        features: collars.filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y)).map((c) => ({
          geometry: [[c.x, c.y, c.z ?? 0]],
          // BUG FOUND & FIXED (TASKS.csv #190/#191, shapefile/GeoPackage export+reimport round-trip
          // testing) — c.dip is stored in this app's INTERNAL positive-below-horizontal convention
          // (see commitImportData's flipDip, and the same dip-sign gotcha already documented/fixed for
          // planned holes: desurveyHole needs positive-down, but every user-facing CSV in this app —
          // sample_data/collars.csv included — uses negative-down, and commitImportData's default
          // "neg_down" dip-convention flips one to the other on the way IN). Writing c.dip straight out
          // here put the INTERNAL value in front of the user/GIS software, and reimporting that file
          // through the same default "neg_down" assumption flipped it AGAIN — silently reversing the
          // sign a second time. Negating on the way out (like flipDip does on the way in) keeps the
          // exported attribute in the same negative-down convention every other file in this app uses,
          // so the round-trip is lossless and an opened-in-QGIS attribute table matches what the user
          // actually typed.
          attributes: { hole_id: c.hole_id, azimuth: c.azimuth ?? null, dip: Number.isFinite(c.dip) ? -c.dip : null, length: c.length ?? null },
        })),
        geomType: "point",
      };
    }
    if (kind === "survey") {
      return {
        features: tracesRef.current.filter((t) => t.pts.length > 1).map((t) => ({
          geometry: t.pts.map((p, i) => [t.wx[i], t.wy[i], t.wz[i]]),
          attributes: { hole_id: t.hole_id },
        })),
        geomType: "polyline",
      };
    }
    const meta = LAYER_META[key];
    const rows = layers[key] || [];
    if (meta.kind === "point3d") {
      return {
        features: rows.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y)).map((r) => ({ geometry: [[r.x, r.y, r.z ?? 0]], attributes: stripInternalFields(r) })),
        geomType: "point",
      };
    }
    const traceByHole = Object.fromEntries(tracesRef.current.map((t) => [t.hole_id, t]));
    if (meta.kind === "interval") {
      const features = [];
      rows.forEach((r) => {
        const t = traceByHole[r.hole_id]; if (!t) return;
        const p1 = findOnTraceWorld(t, r.from), p2 = findOnTraceWorld(t, r.to);
        if (!p1 || !p2) return;
        features.push({ geometry: [p1, p2], attributes: stripInternalFields(r) });
      });
      return { features, geomType: "polyline" };
    }
    if (meta.kind === "point" || meta.kind === "plane") {
      const features = [];
      rows.forEach((r) => {
        const t = traceByHole[r.hole_id]; if (!t) return;
        const md = meta.kind === "plane" ? r.depth : (r.from + r.to) / 2;
        const p = findOnTraceWorld(t, md);
        if (!p) return;
        features.push({ geometry: [p], attributes: stripInternalFields(r) });
      });
      return { features, geomType: "point" };
    }
    return { features: [], geomType: "point" };
  };

  const exportVectorShapefile = (kind, key, label) => {
    const { features, geomType } = buildVectorFeatures(kind, key);
    if (!features.length) { setNotices((p) => [...p, `Nothing to export for "${label}" — no rows with usable/desurveyed coordinates.`]); return; }
    try {
      const zipBytes = buildShapefileZip({ features, geomType, epsg: project?.epsg, baseName: label });
      saveFile({
        suggestedName: `${label.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.zip`,
        filters: [{ name: "Shapefile (zipped)", extensions: ["zip"] }],
        content: uint8ToBase64(zipBytes), encoding: "base64",
      });
      setNotices((p) => [...p, `Exported ${features.length} feature(s) from "${label}" as a shapefile (.zip — .shp/.shx/.dbf${project?.epsg ? "/.prj" : ""}).`]);
    } catch (err) {
      setNotices((p) => [...p, `Shapefile export failed: ${err.message}`]);
    }
  };

  // TASKS.csv #191 — user request: "let's do those 3" (GeoPackage export was the previously-disabled
  // context menu item — "needs an in-browser SQLite writer" — now built on sql.js, see src/lib/gpkg.js).
  const exportVectorGeoPackage = async (kind, key, label) => {
    const { features, geomType } = buildVectorFeatures(kind, key);
    if (!features.length) { setNotices((p) => [...p, `Nothing to export for "${label}" — no rows with usable/desurveyed coordinates.`]); return; }
    try {
      const tableName = label.replace(/[^a-zA-Z0-9_]+/g, "_") || "layer";
      const gpkgBytes = await buildGeoPackage([{ name: tableName, features, geomType, epsg: project?.epsg }]);
      saveFile({
        suggestedName: `${label.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.gpkg`,
        filters: [{ name: "GeoPackage", extensions: ["gpkg"] }],
        content: uint8ToBase64(gpkgBytes), encoding: "base64",
      });
      setNotices((p) => [...p, `Exported ${features.length} feature(s) from "${label}" as a GeoPackage (.gpkg).`]);
    } catch (err) {
      setNotices((p) => [...p, `GeoPackage export failed: ${err.message}`]);
    }
  };

  // TASKS.csv #128 — DXF export, the CAD/GIS interop format surveyors and mine planners actually work
  // in day to day, alongside Shapefile/GeoPackage above. Same buildVectorFeatures() data path, just a
  // third output format — plan-view only (X/Y; Z dropped), per src/lib/dxf.js's own scope note.
  const exportVectorDXF = (kind, key, label) => {
    const { features, geomType } = buildVectorFeatures(kind, key);
    if (!features.length) { setNotices((p) => [...p, `Nothing to export for "${label}" — no rows with usable/desurveyed coordinates.`]); return; }
    try {
      const dxfText = buildDXF({ features, geomType });
      saveFile({
        suggestedName: `${label.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.dxf`,
        filters: [{ name: "DXF", extensions: ["dxf"] }],
        content: dxfText,
      });
      setNotices((p) => [...p, `Exported ${features.length} feature(s) from "${label}" as a DXF (.dxf, plan-view — elevation dropped).`]);
    } catch (err) {
      setNotices((p) => [...p, `DXF export failed: ${err.message}`]);
    }
  };
  // TASKS.csv #184 — a layer key "has data" once its rows array is non-empty (geophys_pts uses the
  // same `layers[key]` array as every other key, so this one check covers all ten ALL_LAYER_KEYS).
  // Used to hide empty layer rows from the sidebar (see the Layers section render below) so an
  // unloaded layer type never looks like it was already imported.
  const hasLayerData = (key) => (layers[key] || []).length > 0;
  const emptyLayerKeys = ALL_LAYER_KEYS.filter((key) => !hasLayerData(key));
  // TASKS.csv #76 — one shared row renderer for every sidebar layer key, grouped or not (used both
  // inside a group's body and for the ungrouped tail below it). geophys_pts (#25) is the one
  // exception baked in here: its rows are raw x/y/z with no hole_id, so "upload" hops to the
  // Geophysics module instead of opening the generic hole-relative ImportMappingModal file picker,
  // and it has no fileInputs ref (nothing to click).
  const renderLayerRow = (key) => {
    const meta = LAYER_META[key];
    const isGeophys = key === "geophys_pts";
    return (
      <LayerRow key={key} label={meta.label} count={(layers[key] || []).length} visible={layerVisible[key]}
        onToggle={() => toggleLayer(key)}
        onUpload={isGeophys ? () => goToModule("geophysics") : () => fileInputs.current[key].click()}
        onInspect={() => setInspectLayer(key)} onZoom={() => zoomToLayer(key)} onClear={() => clearLayer(key)}
        onContextMenu={(e) => { e.preventDefault(); setLayerContextMenu({ key, label: meta.label, x: e.clientX, y: e.clientY }); }}
        expanded={!!expandedLayers[key]} onToggleExpand={() => setExpandedLayers((p) => ({ ...p, [key]: !p[key] }))}
        input={isGeophys ? null : <input ref={setInputRef(key)} type="file" accept=".csv,.zip,.gpkg,.shp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) openImportModal(f, key); e.target.value = ""; }} />}
      >
        <LayerQuickPanel rows={layers[key] || []} meta={meta} categoryFilter={categoryFilter[key] || new Set()}
          onToggleCategory={(v) => toggleCategory(key, v)} onIsolate={(v) => isolateCategory(key, v)} onRemoveSource={(src) => removeLayerSource(key, src)} />
      </LayerRow>
    );
  };
  // TASKS.csv #63 — unload collars/survey too, not just the layer rows. Collars are the one that
  // matters most to warn clearly about: every layer (litho/alt/.../geophys) stays in the project
  // untouched, but nothing renders without a matching collar to desurvey against, so this can look
  // like data loss even though it isn't — the warning says so explicitly.
  const clearCollars = () => {
    if (!collars.length) return;
    if (!window.confirm(`Remove all ${collars.length} collar(s)? Every layer's data stays in the project, but nothing will render until collars are re-imported (there's nothing to desurvey against). This can't be undone.`)) return;
    setCollars([]);
    setNotices((p) => [...p, `Cleared ${collars.length} collar(s).`]);
  };
  const clearSurvey = () => {
    if (!survey.length) return;
    if (!window.confirm(`Remove all ${survey.length} survey station(s)? Holes fall back to a straight-hole projection from each collar's own azimuth/dip. This can't be undone.`)) return;
    setSurvey([]);
    setNotices((p) => [...p, `Cleared ${survey.length} survey station(s).`]);
  };

  // ---------- cross-section (plan-view draw -> pop-out window) ----------
  const onSectionClick = useCallback((e) => {
    if (!sectionMode) return;
    const rect = mountRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1, my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mx, my), cameraRef.current);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const o = originRef.current;
    const world = { x: hit.x + o.x, y: -hit.z + o.y };
    sectionPts.current.push(world);
    if (sectionPts.current.length === 2) { launchSection(); sectionPts.current = []; setSectionMode(false); setSectionPreview(null); }
    else setSectionPreview({ a: world });
  }, [sectionMode]);

  // TASKS.csv #121 — measurement tool. Same self-contained per-click raycast style as onSectionClick
  // above (a fresh raycast right here rather than trusting the `cursor` store value, which is only
  // guaranteed current as of the last pointermove — reading it from inside this click handler's own
  // stale-by-one-render closure risks a one-frame-old point; a fresh raycast never can be stale).
  // Unlike onSectionClick's fixed y=0 plane (a cross-section always wants a flat reference plane to
  // slice against), this raycasts the real terrain mesh first, falling back to the flat ground plane
  // only where there's no terrain — the same "what's actually under the cursor" logic onPointerMove
  // already uses to drive the live status-bar cursor readout and #188's planned-hole "Use cursor"
  // button, so a measurement reflects the real terrain-draped point, not an idealized flat plane.
  const onMeasureClick = useCallback((e) => {
    if (!measureMode) return;
    const rect = mountRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1, my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mx, my), cameraRef.current);
    // Same broadened "nearest real feature" raycast the status-bar cursor uses (see raycastWorldPoint's
    // comment) — a distance/elevation-change measurement across a voxel model or drillhole should read
    // the model's real surface, not always the flat terrain-only fallback.
    const world = raycastWorldPoint(raycaster);
    if (!world) return;
    setMeasurePts((pts) => [...pts, world]);
  }, [measureMode, raycastWorldPoint]);
  const clearMeasure = () => setMeasurePts([]);
  const onPickHoleClick = useCallback((e) => {
    if (!pickHoleMode) return;
    const rect = mountRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1, my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mx, my), cameraRef.current);
    const world = raycastWorldPoint(raycaster);
    if (!world) return;
    setPickedHolePoint(world);
    setPickHoleMode(false);
  }, [pickHoleMode, raycastWorldPoint]);
  // TASKS.csv #121 follow-up — user request: "let's kinda merge the two buttons, we really only need
  // one" (originally shipped as two separate toolbar buttons, Ruler for distance and Shapes for area).
  // One toolbar button now turns measuring on (defaulting to distance) or off; while it's on, a small
  // Distance/Area pill pair in the readout bar (see MeasureResults) switches which kind of measurement
  // is being taken, without needing a second icon in the always-visible toolbar.
  const toggleMeasureOnOff = () => {
    if (measureMode) { setMeasureMode(null); setMeasurePts([]); return; }
    setRectZoomMode(false); setSectionMode(false); sectionPts.current = []; setSectionPreview(null);
    setMeasurePts([]);
    setMeasureMode("distance");
  };
  const switchMeasureMode = (mode) => {
    if (mode === measureMode) return;
    setMeasurePts([]);
    setMeasureMode(mode);
  };

  // TASKS.csv — factored out of launchSection so a SAVED section (store.sections, see below) can be
  // reopened later and rebuilt from the CURRENT layer/filter/color state, rather than only ever being
  // buildable from a fresh 2-click pick. Pure function of (a, b, corridor) — everything else it reads
  // (layers, layerVisible, isRowVisible, etc.) is current component state, so a reopened section always
  // reflects whatever's visible/colored right now, same as a freshly-drawn one would.
  const buildSectionPayload = (a, b, corridor) => {
    const azimuth = (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360;
    const holesInBand = tracesRef.current.filter((t) => t.wx.some((wx, i) => distToSegment(wx, t.wy[i], a.x, a.y, b.x, b.y) <= corridor));
    const holeIds = new Set(holesInBand.map((t) => t.hole_id));
    const holes = holesInBand.map((t) => ({ hole_id: t.hole_id, trace: t.pts.map((p, i) => ({ md: p.md, x: t.wx[i], y: t.wy[i], z: t.wz[i] })) }));

    // User request: "make the geophysics voxel display on the cross section too" (reference: a Rogue
    // Geoscience section PDF showing a classified geophysics grid draped as a colored background behind
    // the drillhole traces). Slices every visible block/voxel model along the same section line/corridor
    // used for holes above, reusing the model's OWN color legend (colorForVoxelValue — the same stops/
    // palette/colorMode already driving its 3D-view appearance, imported from layers.js) so a color here
    // means exactly the same thing it does in the 3D view. Method: for each cell whose CENTER falls
    // within the corridor of the section line (same distToSegment test used for holes — an approximation,
    // not exact cell-polygon/plane intersection, but consistent with how every other section element
    // here already works via center-point/interpolation rather than true 3D geometry), project the cell
    // onto the section line to get its position (l = distance along the line) and width there. A cell is
    // an axis-aligned box in world x/y, and the section line can run at any azimuth relative to that grid
    // — the correct projected width of an axis-aligned box with half-extents (dx/2, dy/2) onto a unit
    // direction (ux, uy) is |ux|*dx/2 + |uy|*dy/2 (a standard separating-axis-theorem projection, not a
    // guess), so that's used for each rectangle's along-line half-width rather than just dx or dy alone.
    const secDx = b.x - a.x, secDy = b.y - a.y;
    const secLen = Math.hypot(secDx, secDy) || 1;
    const secUx = secDx / secLen, secUy = secDy / secLen;
    const along = (x, y) => (x - a.x) * secUx + (y - a.y) * secUy;
    const voxelSlices = [];
    (voxelModels || []).forEach((model) => {
      if (model.visible === false || !model.cells?.length) return;
      const rects = [];
      model.cells.forEach((c) => {
        if (distToSegment(c.x, c.y, a.x, a.y, b.x, b.y) > corridor) return;
        const l = along(c.x, c.y);
        const halfWidthL = Math.abs(secUx * (c.dx || 0)) / 2 + Math.abs(secUy * (c.dy || 0)) / 2;
        if (l + halfWidthL < 0 || l - halfWidthL > secLen) return; // entirely off the drawn extent
        rects.push({ l0: l - halfWidthL, l1: l + halfWidthL, z0: c.z - (c.dz || 0) / 2, z1: c.z + (c.dz || 0) / 2, color: colorForVoxelValue(model, c.value) });
      });
      if (rects.length) voxelSlices.push({ id: model.id, name: model.name, rects });
    });

    // Flatten every currently-visible layer into plain {color,label} primitives here, in the main
    // window, where all the color/legend/filter logic already lives — so the pop-out window just
    // draws shapes and never needs to know about layer types, filters, or overrides.
    const intervals = [];
    // TASKS.csv #137 — SG has no fixed domain the way RQD%/recovery% do (see the main geometry
    // effect's numericIntervalColor comment for the same reasoning) — its actual project min/max
    // is computed once here too, same values that effect's globalPointRanges.sg would produce.
    const sgVals = (layers.sg || []).filter((r) => holeIds.has(r.hole_id) && isRowVisible("sg", r)).map((r) => r.value).filter((v) => typeof v === "number" && !isNaN(v));
    const sgRange = minMax(sgVals);
    ["litho", "alt", "vein", "geotech", "recovery", "sg", "litho_gc", "alt_gc"].forEach((key) => {
      if (!layerVisible[key]) return;
      const meta = LAYER_META[key];
      (layers[key] || []).forEach((row) => {
        if (!holeIds.has(row.hole_id) || !isRowVisible(key, row)) return;
        const color = meta.numeric ? (key === "sg" ? magColor(row.value, sgRange.min, sgRange.max) : rqdColor(row.value)) : effectiveColor(key, row.value);
        const label = meta.numeric ? row.value : effectiveLabel(key, row.value);
        intervals.push({ hole_id: row.hole_id, from: row.from, to: row.to, color, label: `${meta.label}: ${label}` });
      });
    });

    const points = [];
    ["mnlgy", "magsusc"].forEach((key) => {
      if (!layerVisible[key]) return;
      const meta = LAYER_META[key];
      const vals = (layers[key] || []).filter((r) => holeIds.has(r.hole_id) && isRowVisible(key, r));
      const numeric = vals.map((r) => r.value).filter((v) => typeof v === "number" && !isNaN(v));
      const { min, max } = minMax(numeric); // not Math.min/max(...) — see layers.js's minMax comment
      vals.forEach((row) => {
        const mid = (row.from + row.to) / 2;
        const color = meta.numeric ? magColor(row.value, min, max) : effectiveColor(key, row.value);
        const label = meta.numeric ? row.value : effectiveLabel(key, row.value);
        points.push({ hole_id: row.hole_id, md: mid, color, label: `${meta.label}: ${label}` });
      });
    });
    if (assayVisible && assayDisplayElements.length) {
      assayDisplayElements.forEach((sym, idx) => {
        const style = assayStyle[sym];
        const vals = assays.filter((a) => holeIds.has(a.hole_id) && a.values[sym] != null && assayPassesCutoff(a.values[sym], style));
        if (!vals.length) return;
        vals.forEach((a) => {
          const mid = (a.from + a.to) / 2, v = a.values[sym];
          points.push({ hole_id: a.hole_id, md: mid, color: assayColorFor(v, idx, style), label: `${sym}: ${v}` });
        });
      });
    }

    const planes = [];
    if (layerVisible.structure) {
      (layers.structure || []).filter((s) => holeIds.has(s.hole_id) && isRowVisible("structure", s)).forEach((s) => {
        const color = effectiveColor("structure", s.value);
        const label = effectiveLabel("structure", s.value);
        let apparentDip = null;
        if (s.dip != null && !isNaN(s.dip) && s.azimuth != null && !isNaN(s.azimuth)) {
          const deltaAz = toRad(s.azimuth - azimuth);
          apparentDip = Math.atan(Math.tan(toRad(s.dip)) * Math.cos(deltaAz)) * (180 / Math.PI);
        }
        planes.push({ hole_id: s.hole_id, depth: s.depth, color, label: `Structure: ${label}`, apparentDip });
      });
    }

    customLayers.forEach((layer) => {
      if (customVisible[layer.id] === false) return;
      layer.rows.filter((r) => holeIds.has(r.hole_id)).forEach((row) => {
        const color = hashColor(row.value);
        if (row.to != null && !isNaN(row.to)) intervals.push({ hole_id: row.hole_id, from: row.from, to: row.to, color, label: `${layer.name}: ${row.value}` });
        else if (row.depth != null && !isNaN(row.depth)) points.push({ hole_id: row.hole_id, md: row.depth, color, label: `${layer.name}: ${row.value}` });
      });
    });

    // User request (TASKS.csv #112): "Will need an elevation profile on the cross section from SRTM."
    // Samples the loaded terrain surface at regular steps along the section line (same
    // sampleTerrainElevation bilinear sampler the raster-drape/terrain-following code above already
    // uses) and hands the pop-out a simple {d, z} polyline — d = distance along the section line in
    // world units from point a, z = terrain elevation there — so it can draw a topographic profile
    // above the drillhole traces. null (not an empty array) when there's no terrain loaded, so
    // SectionWindow.jsx can tell "no terrain" apart from "terrain but this line is entirely off its
    // coverage" (the latter still returns an array, just possibly a short/partial one).
    let elevationProfile = null;
    if (terrain) {
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const STEPS = 100;
      const pts = [];
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        const el = sampleTerrainElevation(terrain, x, y);
        if (Number.isFinite(el)) pts.push({ d: dist * t, z: el });
      }
      elevationProfile = pts;
    }

    // User request: "we need the legend to update matching the cross section" — a Layout legend bound
    // to a cross-section snapshot needs to know exactly which discrete categories are actually drawn
    // in THAT section (not the project's full lithology vocabulary, and not a live theme, since a
    // snapshot has neither once it's flattened to an image). Built from the SAME {color,label} pairs
    // already computed above for intervals/planes, so it's guaranteed to match the picture pixel-for-
    // pixel — deliberately excludes geotech/mag.susc./assay values (their color encodes a continuous
    // number, and assay point labels embed the sample's own grade, so deduping those would produce
    // either a meaningless single swatch or one row per sample rather than a bounded category list).
    const legendPrefixes = ["litho", "alt", "vein", "litho_gc", "alt_gc"].map((k) => `${LAYER_META[k].label}: `);
    const legendSeen = new Set();
    const legendItems = [];
    intervals.forEach((r) => {
      if (!legendPrefixes.some((p) => r.label.startsWith(p))) return;
      const dedupeKey = `${r.label}|${r.color}`;
      if (legendSeen.has(dedupeKey)) return;
      legendSeen.add(dedupeKey);
      legendItems.push([r.label, r.color]);
    });
    planes.forEach((r) => {
      const dedupeKey = `${r.label}|${r.color}`;
      if (legendSeen.has(dedupeKey)) return;
      legendSeen.add(dedupeKey);
      legendItems.push([r.label, r.color]);
    });
    legendItems.sort((a, b) => a[0].localeCompare(b[0]));

    return { azimuth, holes, intervals, points, planes, elevationProfile, legendItems, voxelSlices };
  };

  // TASKS.csv — cross-section contact drawing. Every launched section is auto-registered in
  // store.sections (id/name/geometry, no contacts yet) the moment it opens, so the pop-out window
  // always has somewhere to persist interpreted contacts to — no separate "save this section" step
  // the user has to remember before drawing. Re-launching the SAME geometry from a fresh 2-point pick
  // still creates a new section entry (matches the pre-existing ephemeral behavior); reopening a
  // previously-saved one goes through reopenSection below instead, which reuses its id/name so drawn
  // contacts keep accumulating on it.
  const launchSection = () => {
    const [a, b] = sectionPts.current;
    const corridor = sectionCorridor;
    const { azimuth, holes, intervals, points, planes, elevationProfile, legendItems, voxelSlices } = buildSectionPayload(a, b, corridor);
    const id = `sect_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const name = `Section ${azimuth.toFixed(0)}°`;
    upsertSection({ id, name, ax: a.x, ay: a.y, bx: b.x, by: b.y, azimuth, corridor, contacts: [] });
    // lithoUnits: the same distinct-litho-value list the Modeling tab's unit pickers use (litho_units
    // above) — passed through so the pop-out's "Draw contact" flow can offer a real unit picker instead
    // of a freeform typed name (see SectionWindow.jsx's finishContact comment for why: a contact tied
    // to an actual litho unit, tagged as that unit's upper contact, is what #98 needs to feed drawn
    // contacts into 3D surface generation as real interface points later).
    openSectionWindow({ id, title: name, section: { ax: a.x, ay: a.y, bx: b.x, by: b.y, azimuth, corridor }, holes, intervals, points, planes, contacts: [], lithoUnits: litho_units, elevationProfile, legendItems, voxelSlices });
  };

  const reopenSection = useCallback((s) => {
    const a = { x: s.ax, y: s.ay }, b = { x: s.bx, y: s.by };
    const { holes, intervals, points, planes, elevationProfile, legendItems, voxelSlices } = buildSectionPayload(a, b, s.corridor);
    openSectionWindow({ id: s.id, title: s.name, section: { ax: s.ax, ay: s.ay, bx: s.bx, by: s.by, azimuth: s.azimuth, corridor: s.corridor }, holes, intervals, points, planes, contacts: s.contacts || [], lithoUnits: litho_units, elevationProfile, legendItems, voxelSlices });
  }, [layers, layerVisible, customLayers, customVisible, assays, assayVisible, assayDisplayElements, assayStyle, isRowVisible, effectiveColor, effectiveLabel, litho_units, terrain, voxelModels]);

  // TASKS.csv — "slice series" / fence-section generator. User request, verbatim: "I wanna be able to
  // slice the voxel in equal parts on a specified azi and width." Generates a whole series of parallel
  // section lines, all running at the given azimuth, spaced exactly `width` meters apart so together
  // they tile the model's extent into equal-width slabs with no gaps or overlaps — each slice's corridor
  // (buffer half-width) is exactly width/2, matching the tiling spacing. Rather than immediately popping
  // open N separate windows (chaotic for anything more than 2-3 slices), each generated line is added to
  // the existing saved-sections list (store.sections, the same list #98's drawn-contact persistence and
  // the "Cross-sections" sidebar section already use) under a descriptive name, so the user can browse
  // and open each one individually via the existing reopenSection flow whenever they're ready to look at
  // it — voxel geophysics slices included automatically, same as any other section (see
  // buildSectionPayload's voxelSlices).
  //
  // Math: azimuth is a compass bearing (0=north/+Y, 90=east/+X), matching the SAME convention
  // buildSectionPayload's own `azimuth` return already uses (atan2(dx,dy)) — so a line running AT that
  // azimuth has unit direction dir=(sin(az), cos(az)), and the perpendicular "stepping" direction the
  // slices are spaced along is perp=(cos(az), -sin(az)) (a 90-degree rotation). Since dir/perp form an
  // orthonormal 2D basis through the world origin, any point decomposes exactly as p = s*dir + t*perp
  // where s=p.dir (distance along the section direction) and t=p.perp (perpendicular offset) — the
  // standard orthonormal change-of-basis identity, not an approximation — which is what's used both to
  // find the extent to cover (projecting every source point to get its [s,t] range) and to reconstruct
  // each slice's own line endpoints from a chosen s-range and t-offset.
  const generateSliceSeries = useCallback(() => {
    const az = toRad(((sliceSeriesAzimuth % 360) + 360) % 360);
    const width = Math.max(1, sliceSeriesWidth);
    const dirX = Math.sin(az), dirY = Math.cos(az);
    const perpX = Math.cos(az), perpY = -Math.sin(az);

    // Gather every point that should be "covered" by the fence: visible voxel model cell centers
    // (±half-extent, so the fence reaches each model's true edge, not just cell centers) and every
    // drillhole collar/trace point — a fence is only useful if it actually spans the data being
    // sliced, whether that's a block model, the drilling, or (typically) both together.
    const pts = [];
    (voxelModels || []).forEach((m) => {
      if (m.visible === false) return;
      (m.cells || []).forEach((c) => {
        const hx = (c.dx || 0) / 2, hy = (c.dy || 0) / 2;
        pts.push({ x: c.x - hx, y: c.y - hy }, { x: c.x + hx, y: c.y + hy }, { x: c.x - hx, y: c.y + hy }, { x: c.x + hx, y: c.y - hy });
      });
    });
    tracesRef.current.forEach((t) => t.wx.forEach((wx, i) => pts.push({ x: wx, y: t.wy[i] })));

    if (!pts.length) {
      setNotices((p) => [...p, "Slice series needs a visible voxel/block model or at least one drillhole to know what extent to cover — nothing found."]);
      return;
    }

    let sMin = Infinity, sMax = -Infinity, tMin = Infinity, tMax = -Infinity;
    pts.forEach((p) => {
      const s = p.x * dirX + p.y * dirY, t = p.x * perpX + p.y * perpY;
      sMin = Math.min(sMin, s); sMax = Math.max(sMax, s);
      tMin = Math.min(tMin, t); tMax = Math.max(tMax, t);
    });
    // Small along-direction pad so a slice line's endpoints clear the extent's own edge (matches the
    // spirit of MODEL_EXTENT_PAD_M elsewhere in this file — a line ending exactly ON the last cell's
    // edge would clip that cell's rendered slice to a sliver).
    const alongPad = Math.max(5, (sMax - sMin) * 0.02);
    sMin -= alongPad; sMax += alongPad;

    const spanT = tMax - tMin;
    const n = Math.max(1, Math.ceil(spanT / width));
    const usedT = n * width;
    const tStart = tMin - (usedT - spanT) / 2; // center the tiling on the actual data span rather than always starting flush at tMin

    let created = 0;
    for (let i = 0; i < n; i++) {
      const tCenter = tStart + width * (i + 0.5);
      const a = { x: sMin * dirX + tCenter * perpX, y: sMin * dirY + tCenter * perpY };
      const b = { x: sMax * dirX + tCenter * perpX, y: sMax * dirY + tCenter * perpY };
      const id = `sect_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`;
      const name = `Fence ${i + 1}/${n} (az ${sliceSeriesAzimuth.toFixed(0)}°, ${width}m)`;
      upsertSection({ id, name, ax: a.x, ay: a.y, bx: b.x, by: b.y, azimuth: sliceSeriesAzimuth, corridor: width / 2, contacts: [] });
      created++;
    }
    setNotices((p) => [...p, `Generated ${created} section${created === 1 ? "" : "s"} spaced ${width}m apart at azimuth ${sliceSeriesAzimuth.toFixed(0)}° — see the Cross-sections list to open them.`]);
  }, [sliceSeriesAzimuth, sliceSeriesWidth, voxelModels, upsertSection]);

  return (
    <div style={{ display: visible ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0, width: "100%" }}>
      {mode === "view" && (
        <ViewToolbar
          openPopover={openPopover} setOpenPopover={setOpenPopover}
          gridConfig={gridConfig} setGridConfig={setGridConfig}
          themes={themes} themeNameDraft={themeNameDraft} setThemeNameDraft={setThemeNameDraft}
          captureCurrentTheme={captureCurrentTheme} applyTheme={applyTheme}
          renamingThemeId={renamingThemeId} setRenamingThemeId={setRenamingThemeId}
          renameDraft={renameDraft} setRenameDraft={setRenameDraft}
          renameTheme={renameTheme} deleteTheme={deleteTheme}
          onDbConnect={() => setDbModalOpen(true)}
          onQc={() => setQcModalOpen(true)} qcDisabled={!collars.length}
          onBoundaryIntercepts={() => setInterceptsModalOpen(true)} boundaryDisabled={!collars.length}
          onSqlWorkspace={() => setSqlModalOpen(true)} sqlDisabled={!collars.length && !assays.length}
          onSnapshot={snapshotToLayout} snapshotDisabled={!dataLoaded}
          sectionMode={sectionMode}
          onToggleSection={() => { setRectZoomMode(false); setMeasureMode(null); setMeasurePts([]); setSectionMode((s) => !s); sectionPts.current = []; setSectionPreview(null); }}
          sectionCorridor={sectionCorridor} setSectionCorridor={setSectionCorridor}
          measureMode={measureMode} onToggleMeasure={toggleMeasureOnOff} onSwitchMeasureMode={switchMeasureMode} measurePts={measurePts} clearMeasure={clearMeasure}
        />
      )}
      <div className="ge-body" style={{ width: "100%" }} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
      <div className="ge-panel-outer" style={{ width: sidebarWidth, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0, background: "#ffffff", borderRight: "1px solid #d9dce1" }}>
      <div className="ge-panel" style={{ padding: "16px 14px", border: "none", width: "100%", flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
        {sidebarTab === "home" && (<>
        <div className="ge-section-label">Geometry</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <button onClick={() => fileInputs.current.collar.click()} onContextMenu={(e) => { if (!collars.length) return; e.preventDefault(); setLayerContextMenu({ key: "__collars__", label: "Collars", x: e.clientX, y: e.clientY }); }} style={{ ...pBtn, marginBottom: 0, flex: 1 }} title="Import collars — CSV, shapefile (.zip/.shp), or GeoPackage (.gpkg) — right-click for export/inspect"><Upload size={13} /> Collars {collars.length ? `(${collars.length})` : ""}</button>
          {collars.length > 0 && <div onClick={clearCollars} style={iconBtn} title="Remove all collars"><Trash2 size={13} /></div>}
        </div>
        <input ref={setInputRef("collar")} type="file" accept=".csv,.zip,.gpkg,.shp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) openImportModal(f, "collars"); e.target.value = ""; }} />
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <button onClick={() => fileInputs.current.survey.click()} onContextMenu={(e) => { if (!survey.length) return; e.preventDefault(); setLayerContextMenu({ key: "__survey__", label: "Survey", x: e.clientX, y: e.clientY }); }} style={{ ...pBtn, marginBottom: 0, flex: 1 }} title="Import survey — CSV, shapefile (.zip/.shp), or GeoPackage (.gpkg) — right-click for export/inspect"><Upload size={13} /> Survey {survey.length ? `(${survey.length})` : ""}</button>
          {survey.length > 0 && <div onClick={clearSurvey} style={iconBtn} title="Remove all survey stations"><Trash2 size={13} /></div>}
        </div>
        <input ref={setInputRef("survey")} type="file" accept=".csv,.zip,.gpkg,.shp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) openImportModal(f, "survey"); e.target.value = ""; }} />
        {/* TASKS.csv #155 — Connect database / Run data QC / Boundary intercepts moved to the toolbar
            above (they're tools/dialogs, not data) — see the ge-subtoolbar block near the top of this
            return. */}

        {/* TASKS.csv #124 — select by location: only shown once there's both something to select
            (collars) and something to select against (a boundary or claim — both the same store
            collection, see #126). */}
        {collars.length > 0 && boundaries.length > 0 && (
          <div style={{ marginTop: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 10.5, color: "#94a1b0", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <MapPin size={11} /> Select by location
            </div>
            <select value={selectByLocationBoundaryId} onChange={(e) => setSelectByLocationBoundaryId(e.target.value)} style={{ width: "100%", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 11.5, marginBottom: 5 }}>
              <option value="">— pick a boundary/claim —</option>
              {boundaries.map((b) => <option key={b.id} value={b.id}>{b.name}{b.kind === "claim" ? " (claim)" : ""}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => selectByLocation("isolate")} disabled={!selectByLocationBoundaryId} style={{ ...pBtn, flex: 1, marginBottom: 0, opacity: selectByLocationBoundaryId ? 1 : 0.5, cursor: selectByLocationBoundaryId ? "pointer" : "not-allowed" }} title="Show only collars inside this boundary, hide every other hole">Isolate inside</button>
              <button onClick={() => selectByLocation("hide")} disabled={!selectByLocationBoundaryId} style={{ ...pBtn, flex: 1, marginBottom: 0, opacity: selectByLocationBoundaryId ? 1 : 0.5, cursor: selectByLocationBoundaryId ? "pointer" : "not-allowed" }} title="Hide collars inside this boundary, leave every other hole as-is">Hide inside</button>
            </div>
          </div>
        )}

        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Layers</span>
          {/* TASKS.csv #76 — create a new named group; layers get sorted into it via the right-click
              menu below ("Add to group…"), a lighter-weight interaction than drag-to-group. */}
          <span onClick={() => askPrompt("New group name:", "", (name) => { if (name && name.trim()) addLayerGroup(name.trim()); })}
            style={{ cursor: "pointer", color: "#55606e", fontSize: 10, textTransform: "none", letterSpacing: 0 }} title="New layer group">+ Group</span>
        </div>
        {/* TASKS.csv #76 — groups render first (each a collapsible header wrapping its member
            LayerRows), then any ungrouped keys below in their original order — same renderLayerRow
            helper either way so a layer's row looks identical whether it's grouped or not. Both loops
            below only render a row for a key that actually HAS data — see hasLayerData/emptyLayerKeys'
            comment right below this block for why, and the "+ Add layer" control right after this list
            for how a not-yet-loaded layer type is still reachable to import. */}
        {layerGroups.map((g) => {
          const populatedKeys = g.keys.filter((key) => hasLayerData(key));
          return (
          <div key={g.id} style={{ marginBottom: 8, border: "1px solid #dde1e6", borderRadius: 7, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "#151b23" }}>
              <div onClick={() => toggleLayerGroupCollapsed(g.id)} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} title={g.collapsed ? "Expand group" : "Collapse group"}>
                {g.collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                onClick={() => askPrompt("Rename group:", g.name, (name) => { if (name && name.trim()) renameLayerGroup(g.id, name.trim()); })} title="Click to rename">
                {g.name} <span style={{ color: "#94a1b0", fontWeight: 400 }}>({populatedKeys.length})</span>
              </div>
              {/* Bulk show/hide every layer currently in this group — "on" if ANY member is visible,
                  clicking turns them all off; clicking again (all off) turns them all on. */}
              <div onClick={() => { const anyOn = g.keys.some((k) => layerVisible[k]); g.keys.forEach((k) => { if (anyOn ? layerVisible[k] : !layerVisible[k]) toggleLayer(k); }); }}
                style={{ cursor: "pointer", color: g.keys.some((k) => layerVisible[k]) ? "#e2a63c" : "#9aa5b3", flexShrink: 0 }} title="Toggle all layers in this group">
                {g.keys.some((k) => layerVisible[k]) ? <Eye size={13} /> : <EyeOff size={13} />}
              </div>
              <Trash2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} title="Delete group (layers stay, just ungrouped)"
                onClick={() => { if (window.confirm(`Delete group "${g.name}"? Its layers stay — they just go back to being ungrouped.`)) deleteLayerGroup(g.id); }} />
            </div>
            {!g.collapsed && (
              <div style={{ padding: "6px 6px 2px" }}>
                {populatedKeys.length === 0
                  ? <div style={{ fontSize: 10.5, color: "#94a1b0", padding: "2px 4px 6px" }}>{g.keys.length === 0 ? 'Empty — right-click a layer below and "Add to group…"' : "Every layer in this group is currently empty (no data loaded)."}</div>
                  : populatedKeys.map((key) => renderLayerRow(key))}
              </div>
            )}
          </div>
          );
        })}
        {ALL_LAYER_KEYS.filter((key) => !layerGroups.some((g) => g.keys.includes(key)) && hasLayerData(key)).map((key) => renderLayerRow(key))}

        {/* User report: "if layers are not loaded they should not be displayed on the side bar. It
            will give the idea there were loaded if we leave them there." Every ALL_LAYER_KEYS row used
            to render unconditionally (just visually muted when empty) — now a key only gets a row once
            it actually has data (hasLayerData below). A layer type with no data yet is still reachable
            to import via this "+ Add layer" picker rather than disappearing from the app entirely —
            same idea as the "+ Add CSV layer" affordance for custom layers, and the "+ Group" control
            right above this whole section. Its own hidden file input is rendered in the block right
            after this picker (a not-yet-loaded layer's row, and the input that used to live inside it,
            doesn't exist yet — see that block's comment for why a SEPARATE persistent input is needed
            here rather than reusing renderLayerRow's). */}
        {emptyLayerKeys.length > 0 && (
          <select
            value=""
            onChange={(e) => { const key = e.target.value; if (!key) return; if (key === "geophys_pts") goToModule("geophysics"); else fileInputs.current[key]?.click(); }}
            style={{ width: "100%", background: "#f4f5f7", border: "1px dashed #c7ccd3", borderRadius: 6, padding: "7px 8px", color: "#55606e", fontSize: 11.5, marginBottom: 4 }}
          >
            <option value="">+ Add layer…</option>
            {emptyLayerKeys.map((key) => <option key={key} value={key}>{LAYER_META[key].label}</option>)}
          </select>
        )}
        {emptyLayerKeys.filter((key) => key !== "geophys_pts").map((key) => (
          <input key={key} ref={setInputRef(key)} type="file" accept=".csv,.zip,.gpkg,.shp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) openImportModal(f, key); e.target.value = ""; }} />
        ))}

        {/* User request: rasters/terrain show up as toggleable layer rows here too, not just inside
            the Geophysics module's own import panel — and only once something's actually been
            imported, not as a permanent empty section (same "don't clutter the sidebar with nothing
            to show" request that applies to the layer rows above). */}
        {(rasters.length > 0 || terrain) && (
          <>
            <div className="ge-section-label" style={{ marginTop: 16 }}>Rasters & terrain</div>
            {terrain && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }}>
                <div onClick={() => updateTerrain?.({ visible: terrain.visible === false })} style={{ cursor: "pointer", color: terrain.visible !== false ? "#e2a63c" : "#9aa5b3", flexShrink: 0 }}>
                  {terrain.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                </div>
                <Mountain size={13} style={{ color: terrain.color || "#55606e", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{terrain.name}</span>
                <input
                  type="range" min={0.1} max={1} step={0.05} value={terrain.opacity ?? 1}
                  onChange={(e) => updateTerrain?.({ opacity: Number(e.target.value) })}
                  style={{ width: 46, flexShrink: 0 }} title="Opacity"
                />
                {/* Color/opacity are also editable right here inline (terrain has no other exotic
                    settings the way rasters' drape-mode/elevation do), but the jump still goes to
                    Geophysics — that's where SRTM/DEM was imported from and where "Remove terrain"
                    lives — for consistency with every other row's edit-jump icon. */}
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} title="Edit / remove in Geophysics" onClick={() => goToModule("geophysics")} />
              </div>
            )}
            {rasters.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }}>
                <div onClick={() => updateRaster(r.id, { visible: r.visible === false })} style={{ cursor: "pointer", color: r.visible !== false ? "#e2a63c" : "#9aa5b3", flexShrink: 0 }}>
                  {r.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                </div>
                <Image size={13} style={{ color: "#55606e", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <input
                  type="range" min={0.1} max={1} step={0.05} value={r.opacity ?? 0.85}
                  onChange={(e) => updateRaster(r.id, { opacity: Number(e.target.value) })}
                  style={{ width: 46, flexShrink: 0 }} title="Opacity"
                />
                {/* User request ("I wanna be able to edit them from there"): jump to the full raster
                    editor (drape mode terrain/flat, fixed elevation) — the sidebar row only has room
                    for the two quick controls every layer type gets (visibility + opacity), same as
                    the Geophysics section's own ArrowUpRight pattern right below this one. */}
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} title="Edit drape mode / elevation in Raster" onClick={() => goToModule("raster")} />
                <Trash2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => removeRaster(r.id)} />
              </div>
            ))}
            <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 10 }}>Imported via the Raster module</div>
          </>
        )}

        {/* User request (QGIS-style unified layers panel): "I want something similar to qgis. All
            layers have to be in there, including rasters, SRTM, dem, geophysics." Rasters/DEM/terrain
            already showed up above (see the "Rasters & terrain" section right above this one) — this
            adds the remaining geophysics-derived layer types (boundary polylines, OMF point/line/
            surface objects, and UBC/OMF/CSV voxel block models) as the same kind of toggleable row,
            instead of them only being visible/editable from inside the separate Geophysics tab. Each
            row still opens its full editor (legend/classify/palette for voxels, etc.) via the
            ArrowUpRight jump icon rather than duplicating that whole UI here — this panel's job is
            visibility + a quick opacity nudge + delete, exactly like the raster rows above it. */}
        {(boundaries.length > 0 || omfObjects.length > 0 || voxelModels.length > 0) && (
          <>
            <div className="ge-section-label" style={{ marginTop: 16 }}>Geophysics</div>
            {boundaries.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }}>
                <div onClick={() => updateBoundary(b.id, { visible: b.visible === false })} style={{ cursor: "pointer", color: b.visible !== false ? "#e2a63c" : "#9aa5b3", flexShrink: 0 }}>
                  {b.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                </div>
                <Shapes size={13} style={{ color: b.color || "#55606e", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
                <span style={{ color: "#94a1b0", fontSize: 10, flexShrink: 0 }}>boundary</span>
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} title="Edit in Geophysics" onClick={() => goToModule("geophysics")} />
                <Trash2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => removeBoundary(b.id)} />
              </div>
            ))}
            {omfObjects.map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }}>
                <div onClick={() => updateOmfObject(o.id, { visible: o.visible === false })} style={{ cursor: "pointer", color: o.visible !== false ? "#e2a63c" : "#9aa5b3", flexShrink: 0 }}>
                  {o.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                </div>
                {o.kind === "points" ? <MapPin size={13} style={{ color: o.color || "#55606e", flexShrink: 0 }} />
                  : o.kind === "lines" ? <Waypoints size={13} style={{ color: o.color || "#55606e", flexShrink: 0 }} />
                  : <Triangle size={13} style={{ color: o.color || "#55606e", flexShrink: 0 }} />}
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                <span style={{ color: "#94a1b0", fontSize: 10, flexShrink: 0 }}>OMF {o.kind}</span>
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} title="Edit in Geophysics" onClick={() => goToModule("geophysics")} />
                <Trash2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => removeOmfObject(o.id)} />
              </div>
            ))}
            {voxelModels.map((v) => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }}>
                <div onClick={() => updateVoxelModel(v.id, { visible: v.visible === false })} style={{ cursor: "pointer", color: v.visible !== false ? "#e2a63c" : "#9aa5b3", flexShrink: 0 }}>
                  {v.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                </div>
                <Box size={13} style={{ color: "#55606e", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
                <input
                  type="range" min={0.1} max={1} step={0.05} value={v.opacity ?? 1}
                  onChange={(e) => updateVoxelModel(v.id, { opacity: Number(e.target.value) })}
                  style={{ width: 46, flexShrink: 0 }} title="Opacity"
                />
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} title="Edit legend / classify / palette in Geophysics" onClick={() => goToModule("geophysics")} />
                <Trash2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => removeVoxelModel(v.id)} />
              </div>
            ))}
          </>
        )}

        {/* TASKS.csv #228 — surface geochemistry samples get one toggleable row (not a row per sample —
            unlike boundaries/OMF objects/voxel models, these are one flat imported collection, same
            "single row for the whole collection" treatment terrain gets). Color legend by medium is
            shown inline since there's no per-sample edit UI to jump to yet — "Edit" just goes to
            Geochem, where the import/element data actually lives. */}
        {surfaceSamples.length > 0 && (
          <>
            <div className="ge-section-label" style={{ marginTop: 16 }}>Surface samples</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 4 }}>
              <div onClick={() => setLayerVisible((p) => ({ ...p, surface_samples: !p.surface_samples }))} style={{ cursor: "pointer", color: layerVisible.surface_samples ? "#e2a63c" : "#9aa5b3", flexShrink: 0 }}>
                {layerVisible.surface_samples ? <Eye size={13} /> : <EyeOff size={13} />}
              </div>
              <Beaker size={13} style={{ color: "#55606e", flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#1a2028" }}>{surfaceSamples.length} sample{surfaceSamples.length === 1 ? "" : "s"}</span>
              <ArrowUpRight size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} title="Import more / edit in Geochem" onClick={() => goToModule("geochem")} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "2px 2px 8px" }}>
              {Array.from(new Set(surfaceSamples.map((s) => s.medium))).map((m) => (
                <div key={m} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#55606e" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: colorForMedium(m), flexShrink: 0 }} />
                  {m}
                </div>
              ))}
            </div>
          </>
        )}

        {/* TASKS.csv #155 — Grid and Themes moved off the sidebar into toolbar popovers (Grid3x3 /
            Bookmark icons in the ge-subtoolbar above) — sidebar space is for DATA now, these are
            display settings / saved-view management, i.e. tools. */}

        {assayElements.length > 0 && (
          <>
            <div className="ge-section-label" style={{ marginTop: 16 }}>Assays</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px 4px" }}>
              <div onClick={() => setAssayVisible((v) => !v)} title={assayVisible ? "Hide all assay elements" : "Show assay elements"} style={{ cursor: "pointer", color: assayVisible ? "#e2a63c" : "#9aa5b3" }}>{assayVisible ? <Eye size={14} /> : <EyeOff size={14} />}</div>
              <div style={{ flex: 1, fontSize: 11, color: "#7b8794" }}>
                {assayDisplayElements.length === 0 ? "No elements selected" : `${assayDisplayElements.length} element${assayDisplayElements.length > 1 ? "s" : ""} shown`}
              </div>
              {assayDisplayElements.length > 0 && (
                <span onClick={() => setAssayDisplayElements([])} style={{ cursor: "pointer", color: "#55606e", fontSize: 10.5 }}>Clear</span>
              )}
            </div>
            {/* User request: show several elements at once (e.g. Au/Ag/Zn/Cu/Pb together), each
                individually toggleable — replaces the old single-<select> "one at a time" picker. Each
                chip's swatch matches that element's marker color (custom, if styled — see
                AssayStyleModal — else the default fixed pick-order hue), so this list doubles as the
                legend. The gear icon (shown once an element is on) opens the style editor: color,
                size, grade-break recategorization, and a "hide below" cutoff (TASKS.csv follow-up,
                user request: "change the assay legend — change colour, size, recategorize, ignore
                values lower than"). */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "0 10px 6px" }}>
              {assayElements.map((e) => {
                const idx = assayDisplayElements.indexOf(e.symbol);
                const on = idx !== -1;
                const style = assayStyle[e.symbol];
                // Chip swatch: a styled single color, the middle grade-break's color if recategorized
                // (a representative sample rather than any one specific value), or the default hue.
                const color = on ? (style?.breaks?.length ? style.breaks[Math.floor(style.breaks.length / 2)].color : style?.color || ASSAY_ELEMENT_COLORS[idx % ASSAY_ELEMENT_COLORS.length]) : null;
                const defaultHue = ASSAY_ELEMENT_COLORS[idx % ASSAY_ELEMENT_COLORS.length];
                const styled = !!(style && ((style.color && style.color !== defaultHue) || (style.sizeMult != null && style.sizeMult !== 1) || style.minCutoff != null || style.breaks?.length));
                return (
                  <div
                    key={e.symbol}
                    title={on ? `Hide ${e.symbol}` : `Show ${e.symbol}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "4px 6px 4px 9px", borderRadius: 12, cursor: "pointer", fontSize: 11.5,
                      background: on ? "#f4f5f7" : "#ffffff", border: `1px solid ${on ? color : "#d9dce1"}`, color: on ? "#1a2028" : "#7b8794",
                    }}
                  >
                    <span onClick={() => toggleAssayElement(e.symbol)} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      {on && <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />}
                      {e.symbol}
                    </span>
                    {on && (
                      <Settings2
                        size={11}
                        onClick={(ev) => { ev.stopPropagation(); setAssayStyleModalSymbol(e.symbol); }}
                        title={`Style ${e.symbol}${styled ? " (customized)" : ""}`}
                        style={{ color: styled ? "#e2a63c" : "#9aa5b3", flexShrink: 0 }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 10, padding: "0 10px" }}>{assays.length} intervals loaded via Geochem module</div>
          </>
        )}

        <div className="ge-section-label" style={{ marginTop: 16 }}>Custom layers</div>
        {customLayers.map((l) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }}>
            <div onClick={() => toggleCustom(l.id)} style={{ cursor: "pointer", flex: 1, fontSize: 12, color: customVisible[l.id] === false ? "#9aa5b3" : "#1a2028", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {customVisible[l.id] === false ? <EyeOff size={13} /> : <Eye size={13} />} <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span> <span style={{ color: "#94a1b0", fontSize: 10, flexShrink: 0 }}>({l.rows.length})</span>
            </div>
            <Maximize2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => zoomToCustom(l.id)} />
            <Trash2 size={13} style={{ cursor: "pointer", color: "#8a5555", flexShrink: 0 }} onClick={() => removeCustomLayer(l.id)} />
          </div>
        ))}
        <div onClick={() => fileInputs.current.customCsv.click()} style={{ cursor: "pointer", padding: "8px 10px", background: "#f4f5f7", border: "1px dashed #c7ccd3", borderRadius: 6, fontSize: 12, color: "#55606e", textAlign: "center" }}>+ Add CSV layer</div>
        <input ref={setInputRef("customCsv")} type="file" accept=".csv,.zip,.gpkg,.shp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) openImportModal(f, "custom"); e.target.value = ""; }} />

        {/* TASKS.csv #155 — Snapshot to Layout / Draw cross-section (+ its buffer setting) moved to
            the toolbar above (Camera / Scissors icons) — same reasoning as Grid/Themes above. The
            saved-sections list right below stays here: it's project DATA (like a layer), not a tool. */}

        {/* TASKS.csv — slice series / fence-section generator ("slice the voxel in equal parts on a
            specified azi and width"). Generates N parallel sections tiling the visible voxel model(s)'
            and/or drilling's extent, added to the same saved-sections list below rather than opened all
            at once. */}
        <div className="ge-section-label" style={{ marginTop: sections.length ? 0 : 16 }}>Slice series (fence)</div>
        <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 8, lineHeight: 1.4 }}>
          Cuts the visible voxel model(s)/drilling into equal-width parallel sections at a fixed azimuth —
          each one added to the list below, ready to open individually. Includes the geophysics voxel
          slice automatically, same as any other section.
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField, flex: 1 }}>
            Azimuth (°)
            <input type="number" min="0" max="359" step="1" value={sliceSeriesAzimuth} onChange={(e) => setSliceSeriesAzimuth(((Number(e.target.value) || 0) % 360 + 360) % 360)} style={{ background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 6px", color: "#1a2028", fontSize: 11 }} />
          </label>
          <label style={{ ...miniField, flex: 1 }}>
            Width (m)
            <input type="number" min="1" step="10" value={sliceSeriesWidth} onChange={(e) => setSliceSeriesWidth(Math.max(1, Number(e.target.value) || 50))} style={{ background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 6px", color: "#1a2028", fontSize: 11 }} />
          </label>
          <button onClick={generateSliceSeries} style={{ ...pBtn, width: "auto", flexShrink: 0, marginBottom: 0, alignSelf: "flex-end", padding: "6px 10px" }} title="Generate the slice series"><Scissors size={13} /> Generate</button>
        </div>

        {sections.length > 0 && (
          <>
            {/* Every drawn section is auto-saved here the moment it's launched (see launchSection), so
                interpreted contacts drawn in the pop-out (TASKS.csv) always have somewhere to persist
                to. Reopening rebuilds the section from current layer/filter/color state and re-sends
                whatever contacts were already drawn on it. */}
            <div className="ge-section-label">Cross-sections ({sections.length})</div>
            {sections.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }}>
                <div onClick={() => reopenSection(s)} title="Reopen this section" style={{ cursor: "pointer", flex: 1, minWidth: 0, fontSize: 12, color: "#1a2028", display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                  <Scissors size={12} style={{ flexShrink: 0, color: "#55606e" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  {s.contacts?.length > 0 && <span style={{ color: "#94a1b0", fontSize: 10, flexShrink: 0 }}>({s.contacts.length} contact{s.contacts.length === 1 ? "" : "s"})</span>}
                </div>
                <Pencil size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => askPrompt("Section name?", s.name, (name) => { if (name && name.trim()) renameSection(s.id, name.trim()); })} />
                <X size={13} style={{ cursor: "pointer", color: "#8a5555", flexShrink: 0 }} onClick={() => { if (window.confirm(`Delete "${s.name}" and any contacts drawn on it?`)) deleteSection(s.id); }} />
              </div>
            ))}
          </>
        )}
        </>)}

        {sidebarTab === "modeling" && (<>
        <div className="ge-section-label">Domain</div>
        <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 8, lineHeight: 1.4 }}>
          Restricts every tool below to one side of one or more faults (TASKS.csv #89) — build domains
          in "Domains" further down first, then pick one here. Applies to all four tools; "Whole
          property" is the original, undomained behavior.
        </div>
        <select value={modelDomainId} onChange={(e) => setModelDomainId(e.target.value)} style={{ width: "100%", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "6px 8px", color: "#1a2028", fontSize: 11.5, marginBottom: 4 }}>
          <option value="">Whole property</option>
          {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {/* TASKS.csv #88 — boundary constraint: #89 above only restricts which control points feed a
            run, this additionally clips the OUTPUT mesh to the domain, since GemPy still fits/
            extrapolates across the whole extent regardless. */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: modelDomainId ? "#55606e" : "#4a5262", marginBottom: 4, cursor: modelDomainId ? "pointer" : "default" }}>
          <input type="checkbox" checked={clipToDomainBoundary} disabled={!modelDomainId} onChange={(e) => setClipToDomainBoundary(e.target.checked)} />
          Clip result to domain boundary (#88)
        </label>

        {/* TASKS.csv #231 — resolution control for every GemPy run (Implicit Model, Stratigraphic
            Stack, Structural, Alteration all funnel through the same runSurfaceStack). Lower = faster/
            coarser, higher = slower/finer; GemPy's own cost scales with grid cell count, so this is the
            single biggest lever a user has over the 80s+ run times real properties hit. */}
        <div className="ge-section-label" style={{ marginTop: 16 }}>Resolution</div>
        <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 6, lineHeight: 1.4 }}>
          Grid cells per axis for every modelling run below. Lower is faster; higher is slower but
          finer-detailed. A real property-scale run at 36 (the default) commonly takes 60-90+ seconds —
          try 24 or lower for a quick first look.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <input type="range" min={12} max={64} step={4} value={modelResolution} onChange={(e) => setModelResolution(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "#1a2028", width: 46, textAlign: "right", flexShrink: 0 }}>{modelResolution}³</span>
        </div>

        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Search ellipsoid</span>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#55606e", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            <input type="checkbox" checked={searchEllipsoid.enabled} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, enabled: e.target.checked }))} /> On
          </label>
        </div>
        <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 8, lineHeight: 1.4 }}>
          GemPy fits one global surface, not per-query local kriging, so this can't steer the interpolator's
          own search the way classic kriging software would (TASKS.csv #85) — what it does instead: drops
          any control point with fewer than the minimum neighbor count within an ellipsoid oriented along
          the structural trend below, so isolated points don't quietly feed a run alongside well-supported
          ones. Same trend the anisotropy layer (#86) will reuse once it exists.
        </div>
        {searchEllipsoid.enabled && (
          <div style={{ opacity: searchEllipsoid.enabled ? 1 : 0.5, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <label style={miniField}>Azimuth°
                <input type="number" value={searchEllipsoid.azimuth} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, azimuth: Number(e.target.value) || 0 }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>Dip°
                <input type="number" value={searchEllipsoid.dip} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, dip: Number(e.target.value) || 0 }))} style={{ ...smallSel, width: "100%" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <label style={miniField}>Major (m)
                <input type="number" value={searchEllipsoid.major} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, major: Math.max(1, Number(e.target.value) || 1) }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>Semi-major (m)
                <input type="number" value={searchEllipsoid.semiMajor} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, semiMajor: Math.max(1, Number(e.target.value) || 1) }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>Minor (m)
                <input type="number" value={searchEllipsoid.minor} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, minor: Math.max(1, Number(e.target.value) || 1) }))} style={{ ...smallSel, width: "100%" }} />
              </label>
            </div>
            <label style={miniField}>Min. neighbors required
              <input type="number" value={searchEllipsoid.minSamples} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, minSamples: Math.max(0, Number(e.target.value) || 0) }))} style={{ ...smallSel, width: 70 }} />
            </label>
          </div>
        )}

        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Anisotropy</span>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#55606e", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            <input type="checkbox" checked={anisotropy.enabled} onChange={(e) => setAnisotropy((p) => ({ ...p, enabled: e.target.checked }))} /> On
          </label>
        </div>
        <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 8, lineHeight: 1.4 }}>
          Warps every coordinate into a normalized space where this ellipsoid becomes a sphere before
          the surface is fit, then warps the result back — the standard way to get directional
          continuity (a vein behaving very differently along strike than across it) out of an
          interpolator that's otherwise isotropic (TASKS.csv #86). Same azimuth/dip idea as the search
          ellipsoid above — usually the same real structural trend.
        </div>
        {anisotropy.enabled && (
          <div style={{ marginBottom: 8 }}>
            <button onClick={() => setAnisotropy((p) => ({ ...p, azimuth: searchEllipsoid.azimuth, dip: searchEllipsoid.dip, major: searchEllipsoid.major, semiMajor: searchEllipsoid.semiMajor, minor: searchEllipsoid.minor }))} style={{ ...pBtn, padding: "5px 8px", fontSize: 10.5, marginBottom: 8 }}>
              Copy from search ellipsoid
            </button>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <label style={miniField}>Azimuth°
                <input type="number" value={anisotropy.azimuth} onChange={(e) => setAnisotropy((p) => ({ ...p, azimuth: Number(e.target.value) || 0 }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>Dip°
                <input type="number" value={anisotropy.dip} onChange={(e) => setAnisotropy((p) => ({ ...p, dip: Number(e.target.value) || 0 }))} style={{ ...smallSel, width: "100%" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <label style={miniField}>Major (m)
                <input type="number" value={anisotropy.major} onChange={(e) => setAnisotropy((p) => ({ ...p, major: Math.max(1, Number(e.target.value) || 1) }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>Semi-major (m)
                <input type="number" value={anisotropy.semiMajor} onChange={(e) => setAnisotropy((p) => ({ ...p, semiMajor: Math.max(1, Number(e.target.value) || 1) }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>Minor (m)
                <input type="number" value={anisotropy.minor} onChange={(e) => setAnisotropy((p) => ({ ...p, minor: Math.max(1, Number(e.target.value) || 1) }))} style={{ ...smallSel, width: "100%" }} />
              </label>
            </div>
          </div>
        )}

        <div className="ge-section-label" style={{ marginTop: 16 }}>Grade estimation</div>
        <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 8, lineHeight: 1.4 }}>
          Populate a block model FROM composited assays (TASKS #117) — nearest-neighbour or inverse-
          distance weighting, not a surface — a separate workflow from the implicit surface tools below.
        </div>
        <button onClick={() => setGradeEstOpen(true)} disabled={!assayElements.length} style={{ ...pBtn, opacity: assayElements.length ? 1 : 0.5, marginBottom: 16 }}>
          <FileBarChart2 size={13} /> Estimate grade into block model…
        </button>

        <div className="ge-section-label" style={{ marginTop: 16 }}>Implicit model (beta)</div>
        <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 8, lineHeight: 1.4 }}>
          Models the top contact of one unit from litho intervals, via GemPy in the Python sidecar.
          Uses structure dip/azimuth for orientation when available; if not, estimates one from the
          contact points themselves so it can still run.
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "#55606e", marginBottom: 8, cursor: "pointer" }} title="Also feed drawn cross-section contacts (Draw upper contact, in the section pop-out) tagged as this unit's upper contact into the run as extra interface points">
          <input type="checkbox" checked={includeSectionContacts} onChange={(e) => setIncludeSectionContacts(e.target.checked)} />
          Include drawn cross-section contacts{sections?.some((s) => s.contacts?.length) ? ` (${sections.reduce((n, s) => n + (s.contacts?.length || 0), 0)} drawn)` : ""}
        </label>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={implicitTarget} onChange={(e) => setImplicitTarget(e.target.value)} style={{ width: 0, flex: 1, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "6px 8px", color: "#1a2028", fontSize: 11.5 }}>
            <option value="">Choose a unit…</option>
            {litho_units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button
            onClick={() => runImplicitModel(implicitTarget)}
            disabled={!implicitTarget || implicitBusy}
            title="Requires the Python sidecar (see status bar) with gempy installed"
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", opacity: implicitTarget && !implicitBusy ? 1 : 0.5, cursor: implicitTarget && !implicitBusy ? "pointer" : "default" }}
          >{implicitBusy ? <span style={{ fontSize: 11 }}>…</span> : <Layers3 size={14} />}</button>
        </div>

        <div className="ge-section-label" style={{ marginTop: 16 }}>Stratigraphic stack (beta)</div>
        <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 8, lineHeight: 1.4 }}>
          Models several units' top contacts together in one run so they can't cross each other —
          add units below in order, youngest (shallowest) first. Litho-only: veins/dykes cut across a
          stack by nature, so model those with the Structural tool instead, not here.
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={stackAdd} onChange={(e) => { addStackUnit(e.target.value); setStackAdd(""); }} style={{ width: 0, flex: 1, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "6px 8px", color: "#1a2028", fontSize: 11.5 }}>
            <option value="">Add a unit…</option>
            {litho_units.filter((u) => !stackUnits.includes(u)).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {stackUnits.length === 0 && (
          <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 8, lineHeight: 1.4 }}>No units added yet.</div>
        )}
        {stackUnits.map((u, i) => (
          <div key={u} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: "#94a1b0", width: 14, flexShrink: 0 }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u}</div>
            <ChevronUp size={13} style={{ cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "#c7ccd3" : "#55606e", flexShrink: 0 }} onClick={() => moveStackUnit(u, -1)} />
            <ChevronDown size={13} style={{ cursor: i === stackUnits.length - 1 ? "default" : "pointer", color: i === stackUnits.length - 1 ? "#c7ccd3" : "#55606e", flexShrink: 0 }} onClick={() => moveStackUnit(u, 1)} />
            <X size={13} style={{ cursor: "pointer", color: "#8a5555", flexShrink: 0 }} onClick={() => removeStackUnit(u)} />
          </div>
        ))}
        <button
          onClick={() => runStackModel(stackUnits)}
          disabled={stackUnits.length < 2 || implicitBusy}
          title="Requires the Python sidecar (see status bar) with gempy installed"
          style={{ ...pBtn, marginTop: 4, opacity: stackUnits.length >= 2 && !implicitBusy ? 1 : 0.5, cursor: stackUnits.length >= 2 && !implicitBusy ? "pointer" : "default" }}
        ><Layers3 size={13} /> {implicitBusy ? "Running…" : `Run stack (${stackUnits.length} unit${stackUnits.length === 1 ? "" : "s"})`}</button>

        <div className="ge-section-label" style={{ marginTop: 16 }}>Structural modeling (beta)</div>
        <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 8, lineHeight: 1.4 }}>
          Models a surface from one structure-plane type (e.g. a fault or shear) using each pick's own
          position and dip/azimuth — no separate contact layer needed.
        </div>
        {/* TASKS.csv #141 — check the structure picks' own orientation trend/scatter BEFORE feeding them
            into the anisotropy or structural-surface tools above/below. */}
        <button
          onClick={() => setStereonetOpen(true)}
          disabled={!(layers.structure || []).some((s) => s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth))}
          style={{ ...pBtn, marginBottom: 8, opacity: (layers.structure || []).length ? 1 : 0.5, cursor: (layers.structure || []).length ? "pointer" : "default" }}
          title="Pole-plot / great-circle stereonet of the Structure layer's dip/azimuth picks"
        ><Milestone size={13} /> Stereonet (QC picks)</button>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={structuralTarget} onChange={(e) => setStructuralTarget(e.target.value)} style={{ width: 0, flex: 1, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "6px 8px", color: "#1a2028", fontSize: 11.5 }}>
            <option value="">Choose a structure type…</option>
            {struct_types.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button
            onClick={() => runStructuralModel(structuralTarget)}
            disabled={!structuralTarget || implicitBusy}
            title="Requires the Python sidecar (see status bar) with gempy installed"
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", opacity: structuralTarget && !implicitBusy ? 1 : 0.5, cursor: structuralTarget && !implicitBusy ? "pointer" : "default" }}
          >{implicitBusy ? <span style={{ fontSize: 11 }}>…</span> : <Layers3 size={14} />}</button>
        </div>

        <div className="ge-section-label" style={{ marginTop: 16 }}>Alteration modeling (beta)</div>
        <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 8, lineHeight: 1.4 }}>
          Models an alteration halo from interval tops for one assemblage — same mechanic as the
          lithology tool (structure dip/azimuth if available, otherwise estimated), sourced from the
          Alteration layer.
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={alterationTarget} onChange={(e) => setAlterationTarget(e.target.value)} style={{ width: 0, flex: 1, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "6px 8px", color: "#1a2028", fontSize: 11.5 }}>
            <option value="">Choose an assemblage…</option>
            {alt_units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button
            onClick={() => runAlterationModel(alterationTarget)}
            disabled={!alterationTarget || implicitBusy}
            title="Requires the Python sidecar (see status bar) with gempy installed"
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", opacity: alterationTarget && !implicitBusy ? 1 : 0.5, cursor: alterationTarget && !implicitBusy ? "pointer" : "default" }}
          >{implicitBusy ? <span style={{ fontSize: 11 }}>…</span> : <Layers3 size={14} />}</button>
        </div>
        {implicitBusy && <div style={{ fontSize: 10, color: "#8fd9ab", marginTop: -4, marginBottom: 8 }}>Running — this calls the Python sidecar. Usually a few seconds, but the first run after the sidecar starts can take well over a minute (GemPy's own import is heavy) — it's still working even if the progress bar sits for a while.</div>}

        <div className="ge-section-label" style={{ marginTop: 16 }}>Generated surfaces</div>
        {implicitSurfaces.length === 0 && (
          <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 10, lineHeight: 1.4 }}>None yet — run one of the tools above. Not persisted in the project file or in themes yet (first pass). Each surface's type and its declared relationships to other surfaces (the chevron next to it) aren't persisted yet either.</div>
        )}
        {implicitSurfaces.map((s) => {
          const expanded = expandedSurfaceId === s.id;
          const otherSurfaces = implicitSurfaces.filter((o) => o.id !== s.id);
          return (
            <div key={s.id} style={{ background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
                <div onClick={() => toggleImplicitSurface(s.id)} style={{ cursor: "pointer", color: s.visible ? "#e2a63c" : "#9aa5b3" }}>{s.visible ? <Eye size={13} /> : <EyeOff size={13} />}</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${s.vertexCount} vertices, ${s.faceCount} faces`}>{s.name}</div>
                {/* TASKS.csv #83 — expand to set this surface's geological type + declared
                    relationships to other surfaces (metadata only for now — see this entry's own
                    TASKS.csv note on what reads it later: #88 constraints, #90 topology checks). */}
                <div onClick={() => setExpandedSurfaceId(expanded ? null : s.id)} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} title="Type & relationships">
                  {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </div>
                <Maximize2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} title="Zoom to this surface" onClick={() => zoomToImplicitSurface(s.id)} />
                <X size={13} style={{ cursor: "pointer", color: "#8a5555", flexShrink: 0 }} onClick={() => removeImplicitSurface(s.id)} />
              </div>
              {expanded && (
                <div style={{ padding: "0 8px 8px", borderTop: "1px solid #dde1e6", paddingTop: 8 }}>
                  <label style={{ fontSize: 10, color: "#55606e", display: "block", marginBottom: 6 }}>
                    Type
                    <select value={s.type || "other"} onChange={(e) => setSurfaceType(s.id, e.target.value)} style={{ ...smallSel, width: "100%", marginTop: 3 }}>
                      {SURFACE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </label>
                  <div style={{ fontSize: 10, color: "#55606e", marginBottom: 4 }}>Relationships to other surfaces</div>
                  {(s.relationships || []).length === 0 && <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 6 }}>None declared.</div>}
                  {(s.relationships || []).map((r, i) => {
                    const target = implicitSurfaces.find((o) => o.id === r.targetId);
                    const relLabel = RELATION_TYPES.find((rt) => rt.key === r.relation)?.label || r.relation;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, marginBottom: 4 }}>
                        <div style={{ flex: 1, minWidth: 0, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {relLabel} <span style={{ color: "#55606e" }}>{target ? target.name : "(removed surface)"}</span>
                        </div>
                        <X size={11} style={{ cursor: "pointer", color: "#8a5555", flexShrink: 0 }} onClick={() => removeSurfaceRelationship(s.id, i)} />
                      </div>
                    );
                  })}
                  {otherSurfaces.length > 0 ? (
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      <select value={relationDraft.relation} onChange={(e) => setRelationDraft((p) => ({ ...p, relation: e.target.value }))} style={{ ...smallSel, flex: 1 }}>
                        {RELATION_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                      <select value={relationDraft.targetId} onChange={(e) => setRelationDraft((p) => ({ ...p, targetId: e.target.value }))} style={{ ...smallSel, flex: 1 }}>
                        <option value="">— surface —</option>
                        {otherSurfaces.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      <button
                        onClick={() => { if (relationDraft.targetId) { addSurfaceRelationship(s.id, relationDraft.relation, relationDraft.targetId); setRelationDraft((p) => ({ ...p, targetId: "" })); } }}
                        style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "4px 8px" }}
                      >+</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: "#94a1b0" }}>Generate another surface to declare a relationship to it.</div>
                  )}

                  {/* TASKS.csv #140 — volume/tonnage. Only meaningful for a genuinely closed solid, so a
                      non-watertight mesh (e.g. a clipped-open surface, a fault plane, a draped contact
                      sheet) still shows the raw divergence-theorem number but flags it rather than
                      presenting it with false confidence. */}
                  <div style={{ fontSize: 10, color: "#55606e", marginTop: 10, marginBottom: 4, borderTop: "1px solid #dde1e6", paddingTop: 8 }}>Volume &amp; tonnage</div>
                  {expandedSurfaceVolume ? (
                    <>
                      <div style={{ fontSize: 11, color: "#1a2028", marginBottom: 4 }}>
                        Volume: <strong>{expandedSurfaceVolume.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³</strong>
                      </div>
                      {!expandedSurfaceVolume.watertight && (
                        <div style={{ fontSize: 10, color: "#a5691f", marginBottom: 6, lineHeight: 1.4 }}>
                          This surface isn't a closed solid ({expandedSurfaceVolume.openEdgeCount} open edge{expandedSurfaceVolume.openEdgeCount === 1 ? "" : "s"} — likely clipped against a domain, or a single draped/fault sheet). The volume above is computed anyway but doesn't represent a real enclosed shape — treat it as informational only.
                        </div>
                      )}
                      <label style={{ fontSize: 10, color: "#55606e", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ flexShrink: 0 }}>Density (t/m³ or g/cm³)</span>
                        <input
                          type="number" min={0} step={0.01}
                          value={s.density ?? 2.7}
                          onChange={(e) => setSurfaceDensity(s.id, e.target.value === "" ? "" : Number(e.target.value))}
                          style={{ ...smallSel, width: 70 }}
                        />
                      </label>
                      {(() => {
                        const tonnage = computeTonnage(expandedSurfaceVolume.volumeM3, Number(s.density ?? 2.7));
                        return tonnage != null ? (
                          <div style={{ fontSize: 11, color: "#1a2028" }}>
                            Tonnage: <strong>{tonnage.toLocaleString(undefined, { maximumFractionDigits: 0 })} t</strong>
                          </div>
                        ) : (
                          <div style={{ fontSize: 10, color: "#94a1b0" }}>Enter a density above 0 to compute tonnage.</div>
                        );
                      })()}
                    </>
                  ) : (
                    <div style={{ fontSize: 10, color: "#94a1b0" }}>No mesh geometry found for this surface.</div>
                  )}

                  {/* TASKS.csv #143 — export to a standard mesh format, at real-world project coordinates
                      (not GeoStrix's internal scene-space), for handoff to other software. */}
                  <div style={{ fontSize: 10, color: "#55606e", marginTop: 10, marginBottom: 4, borderTop: "1px solid #dde1e6", paddingTop: 8 }}>Export mesh</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => exportImplicitSurface(s.id, "obj")} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: 10.5 }} title="Wavefront OBJ — universal, human-readable">OBJ</button>
                    <button onClick={() => exportImplicitSurface(s.id, "dxf")} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: 10.5 }} title="AutoCAD DXF (3DFACE) — Vulcan/Surpac/Datamine and most mining software read this">DXF</button>
                    <button onClick={() => exportImplicitSurface(s.id, "glb")} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: 10.5 }} title="glTF Binary — modern standard, keeps normals, good for Blender/web viewers">glTF</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="ge-section-label" style={{ marginTop: 16 }}>Domains</div>
        <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 8, lineHeight: 1.4 }}>
          A domain is one or more faults plus which side of each — an AND of constraints, so you can
          bound a domain between two faults, not just split the property in two. Pick which fault
          surfaces to use as constraints below (any generated surface typed "Fault" above); the domain
          fails open (matches everything) until it has at least one constraint, and again for any
          constraint whose fault surface gets deleted. Not persisted yet, same as the surfaces it
          references.
        </div>
        {(() => { const faultSurfaces = implicitSurfaces.filter((s) => s.type === "fault"); return (
        <>
        {domains.length === 0 && (
          <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 8, lineHeight: 1.4 }}>None yet.</div>
        )}
        {domains.map((d) => {
          const expanded = expandedDomainId === d.id;
          return (
            <div key={d.id} style={{ background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
                <GitFork size={13} style={{ color: "#55606e", flexShrink: 0 }} />
                <div onClick={() => setExpandedDomainId(expanded ? null : d.id)} style={{ cursor: "pointer", flex: 1, minWidth: 0, fontSize: 12, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${d.constraints.length} constraint${d.constraints.length === 1 ? "" : "s"}`}>{d.name}</div>
                <div onClick={() => setExpandedDomainId(expanded ? null : d.id)} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }}>
                  {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </div>
                <X size={13} style={{ cursor: "pointer", color: "#8a5555", flexShrink: 0 }} onClick={() => deleteDomain(d.id)} />
              </div>
              {expanded && (
                <div style={{ padding: "0 8px 8px", borderTop: "1px solid #dde1e6", paddingTop: 8 }}>
                  <div style={{ fontSize: 10, color: "#55606e", marginBottom: 4 }}>Fault-side constraints</div>
                  {d.constraints.length === 0 && <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 6 }}>None declared — matches the whole property.</div>}
                  {d.constraints.map((c, i) => {
                    const fault = implicitSurfaces.find((s) => s.id === c.faultId);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, marginBottom: 4 }}>
                        <div style={{ flex: 1, minWidth: 0, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {fault ? fault.name : "(deleted fault)"} <span style={{ color: "#55606e" }}>— side {c.side === 1 ? "A" : "B"}</span>
                        </div>
                        <button onClick={() => flipDomainConstraint(d.id, i)} title="Flip side" style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 7px", fontSize: 10 }}>Flip</button>
                        <X size={11} style={{ cursor: "pointer", color: "#8a5555", flexShrink: 0 }} onClick={() => removeDomainConstraint(d.id, i)} />
                      </div>
                    );
                  })}
                  {faultSurfaces.length > 0 ? (
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      <select value={domainConstraintDraft.faultId} onChange={(e) => setDomainConstraintDraft((p) => ({ ...p, faultId: e.target.value }))} style={{ ...smallSel, flex: 1 }}>
                        <option value="">— fault surface —</option>
                        {faultSurfaces.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      <select value={domainConstraintDraft.side} onChange={(e) => setDomainConstraintDraft((p) => ({ ...p, side: Number(e.target.value) }))} style={{ ...smallSel, width: 68 }}>
                        <option value={1}>Side A</option>
                        <option value={-1}>Side B</option>
                      </select>
                      <button
                        onClick={() => { if (domainConstraintDraft.faultId) { addDomainConstraint(d.id, domainConstraintDraft.faultId, domainConstraintDraft.side); setDomainConstraintDraft((p) => ({ ...p, faultId: "" })); } }}
                        style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "4px 8px" }}
                      >+</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: "#94a1b0" }}>No fault surfaces yet — generate one with the Structural tool above and set its type to "Fault".</div>
                  )}
                  <div style={{ fontSize: 10, color: "#94a1b0", marginTop: 8 }}>{countCollarsInDomain(d)} of {collars.length} collars fall inside this domain (collar-only estimate — the modelling tools above classify each control point individually).</div>
                </div>
              )}
            </div>
          );
        })}
        </>
        ); })()}
        <div onClick={() => askPrompt("Domain name?", "", (name) => { if (name && name.trim()) setExpandedDomainId(addDomain(name.trim())); })} style={{ cursor: "pointer", padding: "8px 10px", background: "#f4f5f7", border: "1px dashed #c7ccd3", borderRadius: 6, fontSize: 12, color: "#55606e", textAlign: "center", marginBottom: 4 }}>+ Domain</div>
        </>)}

        {sidebarTab === "targeting" && (<>
        <div className="ge-section-label">Geophysical voxel ranges</div>
        {voxelModels.length === 0 ? (
          <div style={{ padding: "8px 10px", background: "#f4f5f7", border: "1px dashed #c7ccd3", borderRadius: 6, fontSize: 11.5, color: "#94a1b0", marginBottom: 12 }}>
            No voxel/block models loaded yet — import one from the Geophysics tab first, then come back here to isolate a value range (e.g. just a mag high, or an IP high band).
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            {voxelModels.map((model) => <VoxelRangeRow key={model.id} model={model} onUpdate={updateVoxelModel} />)}
          </div>
        )}

        <div className="ge-section-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Planned drillholes ({plannedHoles.length})</span>
          {plannedHoles.length > 0 && (
            <FileBarChart2 size={13} style={{ cursor: "pointer", color: "#55606e" }} onClick={exportPlannedHolesCSV} title="Export all planned holes to CSV" />
          )}
        </div>
        <PlannedHoleAddForm onAdd={addPlannedHole} pickMode={pickHoleMode} onStartPick={() => setPickHoleMode((v) => !v)} pickedPoint={pickedHolePoint} />
        {plannedHoles.length === 0 ? (
          <div style={{ padding: "8px 10px", background: "#f4f5f7", border: "1px dashed #c7ccd3", borderRadius: 6, fontSize: 11.5, color: "#94a1b0", marginTop: 8 }}>
            No planned holes yet — add a collar position and design orientation above. A planned hole renders as a dashed cyan line (distinct from real, drilled holes) in the 3D view, in every module tab.
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {plannedHoles.map((hole) => (
              <PlannedHoleRow key={hole.id} hole={hole} onUpdate={updatePlannedHole} onRemove={removePlannedHole} />
            ))}
          </div>
        )}
        {plannedHoles.length > 0 && (
          <button onClick={exportPlannedHolesCSV} style={{ ...pBtn, marginTop: 8 }}><FileBarChart2 size={13} /> Export {plannedHoles.length} planned hole{plannedHoles.length === 1 ? "" : "s"} to CSV</button>
        )}
        {plannedHoles.length > 0 && (
          <PlannedHoleChecks plannedHoles={plannedHoles} collars={collars} survey={survey} voxelModels={voxelModels} />
        )}
        </>)}

        {collars.length > 0 && (
          <>
            <div className="ge-section-label" style={{ marginTop: 16 }}>Holes ({collars.length})</div>
            {/* TASKS.csv #222 — a filter box, the other half of the audit's "no virtualization/filter"
                finding; finding one hole by ID in a 200+ hole project by eye alone was the real
                usability gap, not just the render cost (fixed separately via HoleRow's memoization). */}
            {collars.length > 8 && (
              <input placeholder="Filter holes…" value={holeFilter} onChange={(e) => setHoleFilter(e.target.value)} style={{ width: "100%", boxSizing: "border-box", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 8px", color: "#1a2028", fontSize: 11.5, fontFamily: "inherit", marginBottom: 4 }} />
            )}
            {collars.filter((c) => !holeFilter || c.hole_id.toLowerCase().includes(holeFilter.toLowerCase())).map((c) => (
              <HoleRow key={c.hole_id} hole_id={c.hole_id} visible={visibleHoles[c.hole_id]} onToggle={toggleHole} onOpenStripLog={setStripLogHoleId} />
            ))}
          </>
        )}

        {notices.length > 0 && (
          <div style={{ marginTop: 14, padding: "8px 10px", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 10, color: "#7b8794", lineHeight: 1.5, maxHeight: 140, overflowY: "auto" }}>
            {notices.slice(-6).map((n, i) => <div key={i} style={{ marginBottom: 4 }}>{n}</div>)}
          </div>
        )}
      </div>

      {sidebarTab === "home" && (<>
        <PanelSplitHandle height={browserHeight} onResize={setBrowserHeight} invert title="Drag to resize the Browser panel" />
        <div style={{ height: browserHeight, flexShrink: 0 }}>
          <DbBrowserPanel onImportFile={openImportModal} onImportRows={openImportFromRows} />
        </div>
      </>)}
      </div>

      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      <div className="ge-main" onClick={(e) => { onSectionClick(e); onMeasureClick(e); onPickHoleClick(e); }} style={{ cursor: sectionMode || rectZoomMode || measureMode || pickHoleMode ? "crosshair" : "default" }}>
        <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
        {!collars.length && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", color: "#94a1b0", fontSize: 13 }}>
            Import collars, or drag a CSV in
          </div>
        )}
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}>
          <button onClick={() => setShowLocator((v) => !v)} title="Toggle locator map (shows your project's real-world location)" style={{ ...iconBtn, ...(showLocator ? { background: "#dde1e6", borderColor: "#a9c6e0" } : {}) }}><MapIcon size={15} /></button>
          <button onClick={() => { setRebuildSeq((n) => n + 1); setNotices((p) => [...p, "View refreshed — geometry rebuilt from current data"]); }} title="Refresh view (force full geometry rebuild)" style={iconBtn}><RefreshCw size={15} /></button>
          <button onClick={resetView} title="Reset orientation" style={iconBtn}><RotateCcw size={15} /></button>
        </div>
        {showLocator && (
          <div style={{ position: "absolute", bottom: 12, right: 12 }}>
            <LocatorMap
              lon={projectLonLat?.lon}
              lat={projectLonLat?.lat}
              onClose={() => setShowLocator(false)}
              onExpand={() => setShowBasemap(true)}
            />
          </div>
        )}
        {showBasemap && (
          <BasemapView
            mode="locate"
            lon={projectLonLat?.lon}
            lat={projectLonLat?.lat}
            onClose={() => setShowBasemap(false)}
          />
        )}
        <div style={{ position: "absolute", top: 160, right: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={() => { camState.current.phi = 0.02; cameraRef.current.__update(); }} style={miniBtn}>Top</button>
          <button onClick={() => { camState.current.phi = Math.PI - 0.02; cameraRef.current.__update(); }} style={miniBtn}>Bottom</button>
        </div>
        {/* TASKS.csv #189 — the old "■ East ■ Elevation ■ North" text legend used to render here;
            replaced by axisGizmo (created above, rendered every frame via the same viewport/scissor
            technique CompassRose uses), a real camera-synced N/E/Z arrow-triad drawn directly onto
            the canvas at this same bottom-left corner — no DOM element needed for it anymore. */}
        {sectionMode && sectionPreview && (
          <div style={{ position: "absolute", top: 12, left: 12, fontSize: 11, color: "#8fd9ab", background: "#ffffff", padding: "6px 10px", borderRadius: 6, border: "1px solid #3d6b52" }}>Start point set — click the end point</div>
        )}
        {toast && (
          <div key={toast.key} style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", maxWidth: "70%", fontSize: 11.5, color: "#1a2028", background: "#ffffff", padding: "8px 14px", borderRadius: 7, border: "1px solid #c7ccd3", boxShadow: "0 4px 14px rgba(0,0,0,0.4)", pointerEvents: "none" }}>
            {toast.text}
          </div>
        )}
        {/* TASKS.csv #198 (part 3) — QGIS-style "enter a Layout Viewport" banner. Everything below the
            camera is already live and interactive (the existing orbit-drag/wheel handlers on this same
            canvas), so this banner is the ONLY new UI the feature needs — just a way to tell the user
            they're editing a specific Viewport and to explicitly commit or discard the new camera
            angle before leaving. */}
        {interactiveViewportSession && (
          <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#1a2028", background: "#ffffff", padding: "8px 12px", borderRadius: 8, border: "1px solid #c7ccd3", boxShadow: "0 4px 14px rgba(0,0,0,0.4)", zIndex: 20 }}>
            <span>Editing Layout viewport — drag to orbit, scroll to zoom</span>
            <button onClick={doExitInteractiveViewport} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 10px", fontSize: 11.5 }}>Update Viewport &amp; Return to Layout</button>
            <button onClick={doCancelInteractiveViewport} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 10px", fontSize: 11.5, background: "transparent", border: "1px solid #c7ccd3", color: "#55606e" }}>Cancel</button>
          </div>
        )}
        {rectZoomMode && !rectVisual && (
          <div style={{ position: "absolute", top: 12, left: 12, fontSize: 11, color: "#8fd9ab", background: "#ffffff", padding: "6px 10px", borderRadius: 6, border: "1px solid #3d6b52" }}>Drag a rectangle to zoom in — right-click to cancel</div>
        )}
        {rectVisual && (
          <div style={{ position: "absolute", left: rectVisual.x, top: rectVisual.y, width: rectVisual.w, height: rectVisual.h, border: "1.5px dashed #4a9be0", background: "rgba(74,155,224,0.12)", pointerEvents: "none" }} />
        )}
        {tooltip && (
          <div style={{ position: "fixed", left: tooltip.x + 14, top: tooltip.y + 14, background: "#dde1e6", border: "1px solid #c7ccd3", borderRadius: 6, padding: "8px 10px", fontSize: 11.5, whiteSpace: "pre-line", pointerEvents: "none", zIndex: 10, maxWidth: 220 }}>{tooltip.text}</div>
        )}
      </div>

      {contextMenu && (
        <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, background: "#dde1e6", border: "1px solid #c7ccd3", borderRadius: 8, padding: 6, fontSize: 12.5, minWidth: 180, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
            {contextMenu.hit ? (
              <>
                <div style={{ padding: "6px 10px", color: "#94a1b0", fontSize: 10.5, whiteSpace: "pre-line", borderBottom: "1px solid #d9dce1", marginBottom: 4 }}>{contextMenu.hit.tip}</div>
                <ContextItem label="Zoom here" onClick={() => { zoomToPoint(contextMenu.hit.point); setContextMenu(null); }} />
                <ContextItem label={`Hide ${contextMenu.hit.holeId}`} onClick={() => { toggleHole(contextMenu.hit.holeId); setContextMenu(null); }} />
                <ContextItem label="Copy details" onClick={() => { navigator.clipboard?.writeText(contextMenu.hit.tip); setContextMenu(null); }} />
                <ContextItem label="Zoom to selected area…" onClick={() => { setSectionMode(false); setMeasureMode(null); setRectZoomMode(true); setContextMenu(null); }} />
                <ContextItem label="Zoom to fit all" onClick={() => { zoomToFitAll(); setContextMenu(null); }} />
                <ContextItem label="Reset orientation" onClick={() => { resetView(); setContextMenu(null); }} />
              </>
            ) : (
              <>
                <ContextItem label="Zoom to selected area…" onClick={() => { setSectionMode(false); setMeasureMode(null); setRectZoomMode(true); setContextMenu(null); }} />
                <ContextItem label="Zoom to fit all" onClick={() => { zoomToFitAll(); setContextMenu(null); }} />
                <ContextItem label="Reset orientation" onClick={() => { resetView(); setContextMenu(null); }} />
              </>
            )}
            {/* Viewport background color — user-requested placeholder location ("for now") for overriding
                the white default. Shown in both branches since it's not tied to what was clicked on. */}
            <div style={{ borderTop: "1px solid #d9dce1", marginTop: 4, paddingTop: 4 }}>
              <label
                htmlFor="viewport-bg-color-picker"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: 5, cursor: "pointer", color: "#1a2028" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#242e3c")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span>Background color</span>
                <input
                  id="viewport-bg-color-picker"
                  type="color"
                  value={bgColor}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setBgColor(e.target.value)}
                  style={{ width: 26, height: 18, padding: 0, border: "1px solid #c7ccd3", borderRadius: 3, cursor: "pointer", background: "none" }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {layerContextMenu && (() => {
        // TASKS.csv — user request: right-click Collars/Survey too, not just the LAYERS list, to get
        // the same export/inspect actions. Those two aren't real LAYER_META entries (they're separate
        // store fields, collars[]/survey[]), so they arrive here via sentinel keys — everything about
        // group management (which only makes sense for the real layer list) is skipped for them, but
        // the new vector actions below apply to all three cases identically.
        const isVector = layerContextMenu.key === "__collars__" || layerContextMenu.key === "__survey__";
        const vectorKind = layerContextMenu.key === "__collars__" ? "collars" : layerContextMenu.key === "__survey__" ? "survey" : "layer";
        return (
        <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setLayerContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setLayerContextMenu(null); }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: layerContextMenu.x, top: layerContextMenu.y, background: "#dde1e6", border: "1px solid #c7ccd3", borderRadius: 8, padding: 6, fontSize: 12.5, minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
            <div style={{ padding: "4px 10px 6px", color: "#94a1b0", fontSize: 10.5, borderBottom: "1px solid #d9dce1", marginBottom: 4 }}>{layerContextMenu.label}</div>
            {!isVector && <>
              <ContextItem label="Zoom to layer" onClick={() => { zoomToLayer(layerContextMenu.key); setLayerContextMenu(null); }} />
              <ContextItem label={layerVisible[layerContextMenu.key] ? "Hide layer" : "Show layer"} onClick={() => { toggleLayer(layerContextMenu.key); setLayerContextMenu(null); }} />
              <ContextItem label="Clear layer data…" onClick={() => { clearLayer(layerContextMenu.key); setLayerContextMenu(null); }} />
            </>}
            {/* TASKS.csv — export/inspect, the same for real layers and the collars/survey sentinels. */}
            <div style={{ borderTop: "1px solid #d9dce1", margin: "4px 0" }} />
            <ContextItem label="Export Shapefile (.zip)…" onClick={() => { exportVectorShapefile(vectorKind, layerContextMenu.key, layerContextMenu.label); setLayerContextMenu(null); }} />
            <ContextItem label="Export GeoPackage (.gpkg)…" onClick={() => { exportVectorGeoPackage(vectorKind, layerContextMenu.key, layerContextMenu.label); setLayerContextMenu(null); }} />
            <ContextItem label="Export DXF (.dxf)…" onClick={() => { exportVectorDXF(vectorKind, layerContextMenu.key, layerContextMenu.label); setLayerContextMenu(null); }} />
            <ContextItem label="Inspect / edit table…" onClick={() => { setAttrTableTarget({ kind: vectorKind, key: layerContextMenu.key, label: layerContextMenu.label }); setLayerContextMenu(null); }} />
            {!isVector && <>
              {/* TASKS.csv #76 — sort this layer into a named group (or back out of one). */}
              {layerGroups.length > 0 && <div style={{ borderTop: "1px solid #d9dce1", margin: "4px 0" }} />}
              {layerGroups.map((g) => {
                const alreadyIn = g.keys.includes(layerContextMenu.key);
                return (
                  <ContextItem key={g.id} label={alreadyIn ? `✓ ${g.name}` : `Add to "${g.name}"`}
                    onClick={() => { setLayerGroupFor(layerContextMenu.key, alreadyIn ? null : g.id); setLayerContextMenu(null); }} />
                );
              })}
              {layerGroups.some((g) => g.keys.includes(layerContextMenu.key)) && (
                <ContextItem label="Remove from group" onClick={() => { setLayerGroupFor(layerContextMenu.key, null); setLayerContextMenu(null); }} />
              )}
              <ContextItem label="New group…" onClick={() => {
                const key = layerContextMenu.key;
                setLayerContextMenu(null);
                askPrompt("New group name:", "", (name) => {
                  if (!name || !name.trim()) return;
                  const id = addLayerGroup(name.trim());
                  setLayerGroupFor(key, id);
                });
              }} />
            </>}
          </div>
        </div>
        );
      })()}

      {attrTableTarget && (
        <AttributeTableModal
          title={attrTableTarget.label}
          rows={attrTableTarget.kind === "collars" ? collars : attrTableTarget.kind === "survey" ? survey : (layers[attrTableTarget.key] || [])}
          onSave={(newRows) => {
            if (attrTableTarget.kind === "collars") setCollars(newRows);
            else if (attrTableTarget.kind === "survey") setSurvey(newRows);
            else replaceLayer(attrTableTarget.key, newRows);
            setNotices((p) => [...p, `Saved edits to "${attrTableTarget.label}" (${newRows.length} row(s)).`]);
          }}
          onClose={() => setAttrTableTarget(null)}
        />
      )}

      {inspectLayer && (
        <LayerInspector
          layerKey={inspectLayer} rows={layers[inspectLayer] || []} meta={LAYER_META[inspectLayer]}
          categoryFilter={categoryFilter[inspectLayer] || new Set()} numericRange={numericRange[inspectLayer]} legendOverride={legendOverride[inspectLayer] || {}}
          onToggleCategory={(v) => toggleCategory(inspectLayer, v)}
          onSetRange={(range) => setNumericRange((p) => ({ ...p, [inspectLayer]: range }))}
          onSetColor={(v, color) => setLegendColor(inspectLayer, v, color)}
          onSetLabel={(v, label) => setLegendLabel(inspectLayer, v, label)}
          onShowAll={() => showAllCategories(inspectLayer)}
          onHideAll={() => hideAllCategories(inspectLayer)}
          onIsolate={(v) => isolateCategory(inspectLayer, v)}
          onRemoveSource={(src) => removeLayerSource(inspectLayer, src)}
          onClose={() => setInspectLayer(null)}
        />
      )}

      {importModal && <ImportMappingModal modal={importModal} onChange={setImportModal} onCancel={() => { setImportModal(null); processImportQueue(); }} onCommit={commitImport} projectEpsg={project?.epsg} />}
      {dbModalOpen && <DatabaseConnectModal onCancel={() => setDbModalOpen(false)} onResults={openImportFromRows} />}
      {qcModalOpen && <DataQCModal onCancel={() => setQcModalOpen(false)} />}
      {sqlModalOpen && (
        <Suspense fallback={null}>
          <SQLWorkspaceModal
            collars={collars}
            survey={survey}
            layers={layers}
            assays={assays}
            assayElements={assayElements}
            boundaries={boundaries}
            onClose={() => setSqlModalOpen(false)}
          />
        </Suspense>
      )}
      {stripLogHoleId && (
        <StripLog
          holeId={stripLogHoleId}
          collars={collars}
          layers={layers}
          assays={assays}
          assayElements={assayElements}
          onClose={() => setStripLogHoleId(null)}
        />
      )}
      {assayStyleModalSymbol && (
        <AssayStyleModal
          symbol={assayStyleModalSymbol}
          unit={assayElements.find((e) => e.symbol === assayStyleModalSymbol)?.unit || "ppm"}
          defaultColor={ASSAY_ELEMENT_COLORS[assayDisplayElements.indexOf(assayStyleModalSymbol) % ASSAY_ELEMENT_COLORS.length]}
          range={globalAssayRanges[assayStyleModalSymbol] || { min: 0, max: 0 }}
          style={assayStyle[assayStyleModalSymbol] || null}
          onChange={(next) => setAssayStyle((p) => ({ ...p, [assayStyleModalSymbol]: next }))}
          onClose={() => setAssayStyleModalSymbol(null)}
        />
      )}
      {gradeEstOpen && (
        <GradeEstimationModal
          assays={assays}
          assayElements={assayElements}
          layers={layers}
          collars={collars}
          survey={survey}
          onAddModel={(model) => { const id = addVoxelModel(model); setNotices((p) => [...p, `Added block model "${model.name}" (${model.cells.length.toLocaleString()} cells).`]); return id; }}
          onClose={() => setGradeEstOpen(false)}
        />
      )}
      {stereonetOpen && <StereonetModal picks={layers.structure || []} onClose={() => setStereonetOpen(false)} />}
      {interceptsModalOpen && (
        <BoundaryInterceptsModal
          intercepts={computeIntercepts()}
          excludedIntercepts={excludedIntercepts}
          softIntercepts={softIntercepts}
          onToggle={toggleExcludedIntercept}
          onToggleSoft={toggleSoftIntercept}
          onCancel={() => setInterceptsModalOpen(false)}
        />
      )}

      {dragOver && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(226,166,60,0.08)", border: "3px dashed #e2a63c", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 18, color: "#e2a63c", background: "#ffffff", padding: "14px 22px", borderRadius: 8, border: "1px solid #e2a63c", textAlign: "center" }}>Drop CSV(s) to import<div style={{ fontSize: 12, color: "#8fd9ab", marginTop: 4, fontWeight: 400 }}>Drop several at once — each auto-detects its layer, or asks if unsure</div></div>
        </div>
      )}

      {promptState && (
        <PromptModal
          title={promptState.title}
          defaultValue={promptState.defaultValue}
          onCancel={() => setPromptState(null)}
          onConfirm={(value) => { promptState.onSubmit(value); setPromptState(null); }}
        />
      )}
    </div>
    </div>
  );
}

// TASKS.csv #155 — QGIS-style icon toolbar for the 3D View module. Icon-only buttons with tooltips,
// grouped with separators; Grid and Themes open a small popover panel anchored under their button
// (closes on an explicit close click or picking an action — no outside-click listener yet, kept
// simple for this first pass); everything else fires the same handlers the old sidebar buttons used
// to (a modal-open setter, or a one-shot action). Modeling mode doesn't render this yet (TASKS.csv
// #155 follow-up) — its sidebar is unchanged for now.
function ViewToolbar({
  openPopover, setOpenPopover, gridConfig, setGridConfig,
  themes, themeNameDraft, setThemeNameDraft, captureCurrentTheme, applyTheme,
  renamingThemeId, setRenamingThemeId, renameDraft, setRenameDraft, renameTheme, deleteTheme,
  onDbConnect, onQc, qcDisabled, onBoundaryIntercepts, boundaryDisabled, onSqlWorkspace, sqlDisabled,
  onSnapshot, snapshotDisabled, sectionMode, onToggleSection, sectionCorridor, setSectionCorridor,
  measureMode, onToggleMeasure, onSwitchMeasureMode, measurePts, clearMeasure,
}) {
  const toggle = (name) => setOpenPopover((p) => (p === name ? null : name));
  return (
    <div className="ge-subtoolbar">
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
        <HoverToolInfo title="Grid" text="Toggles the ground reference grid on or off, and lets you resize it, change its division spacing/color, or add two vertical wall grids for a full 3D reference box. Turn it off if it's cluttering a dense model or a figure you're about to snapshot." suppress={openPopover === "grid"}>
          <button className={`ge-subtool-btn ${openPopover === "grid" ? "active" : ""}`} onClick={() => toggle("grid")}>
            <Grid3x3 size={15} />
          </button>
        </HoverToolInfo>
        {openPopover === "grid" && (
          <div style={popoverStyle}>
            <div style={popoverHeader}>Grid<X size={13} style={{ cursor: "pointer", color: "#55606e" }} onClick={() => setOpenPopover(null)} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }}>
              <div onClick={() => setGridConfig((g) => ({ ...g, visible: !g.visible }))} style={{ cursor: "pointer", color: gridConfig.visible ? "#e2a63c" : "#9aa5b3" }}>
                {gridConfig.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <div style={{ flex: 1, fontSize: 12.5, color: gridConfig.visible ? "#1a2028" : "#6b7684" }}>Show grid</div>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#55606e", cursor: "pointer" }} title="Add two vertical wall grids to the ground grid, forming a 3D reference box">
                <input type="checkbox" checked={gridConfig.mode === "3d"} onChange={(e) => setGridConfig((g) => ({ ...g, mode: e.target.checked ? "3d" : "ground" }))} /> 3D
              </label>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" title="Grid size (m)" value={gridConfig.size} onChange={(e) => setGridConfig((g) => ({ ...g, size: Math.max(10, Number(e.target.value) || g.size) }))} style={{ width: 0, flex: 1, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 6px", color: "#1a2028", fontSize: 11, fontFamily: "inherit" }} />
              <input type="number" title="Divisions" value={gridConfig.divisions} onChange={(e) => setGridConfig((g) => ({ ...g, divisions: Math.max(1, Number(e.target.value) || g.divisions) }))} style={{ width: 0, flex: 1, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 6px", color: "#1a2028", fontSize: 11, fontFamily: "inherit" }} />
              <input type="color" title="Grid color" value={gridConfig.color} onChange={(e) => setGridConfig((g) => ({ ...g, color: e.target.value }))} style={{ width: 30, height: 28, padding: 0, border: "1px solid #d9dce1", borderRadius: 5, background: "none", cursor: "pointer" }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
        <HoverToolInfo title="Themes" text="Saves the current view — visible layers, active filters, grid settings, and camera position — as a named theme you can reload later with one click, or bind to a Viewport element on a Layout page so a report figure re-frames itself automatically." suppress={openPopover === "themes"}>
          <button className={`ge-subtool-btn ${openPopover === "themes" ? "active" : ""}`} onClick={() => toggle("themes")}>
            <Bookmark size={15} />
          </button>
        </HoverToolInfo>
        {openPopover === "themes" && (
          <div style={{ ...popoverStyle, width: 260 }}>
            <div style={popoverHeader}>Themes<X size={13} style={{ cursor: "pointer", color: "#55606e" }} onClick={() => setOpenPopover(null)} /></div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input
                type="text" placeholder="Theme name…" value={themeNameDraft}
                onChange={(e) => setThemeNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && themeNameDraft.trim()) { captureCurrentTheme(themeNameDraft.trim()); setThemeNameDraft(""); } }}
                style={{ width: 0, flex: 1, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "6px 8px", color: "#1a2028", fontSize: 11.5 }}
              />
              <button
                onClick={() => { if (themeNameDraft.trim()) { captureCurrentTheme(themeNameDraft.trim()); setThemeNameDraft(""); } }}
                disabled={!themeNameDraft.trim()}
                title="Save the current view (layers, filters, grid, camera) as a named theme"
                style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "6px 9px", opacity: themeNameDraft.trim() ? 1 : 0.5, cursor: themeNameDraft.trim() ? "pointer" : "default" }}
              ><BookmarkPlus size={14} /></button>
            </div>
            {themes.length === 0 && (
              <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 4, lineHeight: 1.4 }}>
                Save the current view as a theme to reload it later, or bind it to a Viewport element on the Layout page.
              </div>
            )}
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {themes.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }}>
                  {renamingThemeId === t.id ? (
                    <input
                      autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => { if (renameDraft.trim()) renameTheme(t.id, renameDraft.trim()); setRenamingThemeId(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenamingThemeId(null); }}
                      style={{ flex: 1, minWidth: 0, background: "#ffffff", border: "1px solid #3a4658", borderRadius: 5, padding: "4px 6px", color: "#1a2028", fontSize: 12 }}
                    />
                  ) : (
                    <div onClick={() => applyTheme(t)} title="Apply this theme's layers, filters, grid, and camera position" style={{ cursor: "pointer", flex: 1, minWidth: 0, fontSize: 12, color: "#1a2028", display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                      <Bookmark size={13} style={{ flexShrink: 0, color: "#55606e" }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                    </div>
                  )}
                  <Pencil size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => { setRenamingThemeId(t.id); setRenameDraft(t.name); }} />
                  <X size={13} style={{ cursor: "pointer", color: "#8a5555", flexShrink: 0 }} onClick={() => deleteTheme(t.id)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="ge-subtool-sep" />
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <HoverToolInfo title="Connect database" text="Connects directly to a PostgreSQL database and pulls collars, survey, or other tables straight in — no CSV export/import round trip needed if your data already lives in a database.">
          <button className="ge-subtool-btn" onClick={onDbConnect}><Database size={15} /></button>
        </HoverToolInfo>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <HoverToolInfo title="Run data QC" text={qcDisabled ? "Load some collars/survey data first. Scans the currently loaded collars, survey, and interval data for common drilling-data mistakes — duplicate hole IDs, out-of-order or overlapping depths, survey stations beyond a hole's stated length, and similar — and lists everything it finds so you can fix it before modeling." : "Scans the currently loaded collars, survey, and interval data for common drilling-data mistakes — duplicate hole IDs, out-of-order or overlapping depths, survey stations beyond a hole's stated length, and similar — and lists everything it finds so you can fix it before modeling."}>
          <button className="ge-subtool-btn" onClick={onQc} disabled={qcDisabled}><ShieldAlert size={15} /></button>
        </HoverToolInfo>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <HoverToolInfo title="Boundary intercepts" text={boundaryDisabled ? "Load some lithology/alteration interval data first. Lists every geological unit boundary (top of each litho/alteration interval) resolved to a real 3D position along each hole — the same control points the implicit-modelling tools use — so you can review, exclude, or mark individual points \"soft\" before running a surface." : "Lists every geological unit boundary (top of each litho/alteration interval) resolved to a real 3D position along each hole — the same control points the implicit-modelling tools use — so you can review, exclude, or mark individual points \"soft\" before running a surface."}>
          <button className="ge-subtool-btn" onClick={onBoundaryIntercepts} disabled={boundaryDisabled}><Milestone size={15} /></button>
        </HoverToolInfo>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <HoverToolInfo title="SQL workspace" text={sqlDisabled ? "Load some data first. Ad hoc SQL queries against whatever's currently loaded (collars, survey, layers, assays, boundaries) — no Postgres connection needed. Also reachable from the Geochem module's toolbar." : "Ad hoc SQL queries against whatever's currently loaded (collars, survey, layers, assays, boundaries) — no Postgres connection needed. Also reachable from the Geochem module's toolbar."}>
          <button className="ge-subtool-btn" onClick={onSqlWorkspace} disabled={sqlDisabled}><TerminalSquare size={15} /></button>
        </HoverToolInfo>
      </div>

      <div className="ge-subtool-sep" />
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <HoverToolInfo title="Snapshot to Layout" text={snapshotDisabled ? "Load some data first. Captures the current 3D view exactly as it's framed right now and drops it onto the Layout page as a fixed image — good for a report figure that shouldn't change if you keep exploring the model afterward. For a figure that stays live and re-frames itself, use a Theme + Viewport instead." : "Captures the current 3D view exactly as it's framed right now and drops it onto the Layout page as a fixed image — good for a report figure that shouldn't change if you keep exploring the model afterward. For a figure that stays live and re-frames itself, use a Theme + Viewport instead."}>
          <button className="ge-subtool-btn" onClick={onSnapshot} disabled={snapshotDisabled}><Camera size={15} /></button>
        </HoverToolInfo>
      </div>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
        <HoverToolInfo title="Draw cross-section" text={sectionMode ? "Active — click 2 points on the plan view to draw the section, or click the button again to cancel. Drillholes, layers, and voxels all get projected onto it, opening in its own window. Every currently visible layer gets carried into the section; the Buffer setting controls how far off the line a hole/point can be and still be included." : "Click two points on the plan view to slice a vertical section through the model along that line — drillholes, layers, and voxels all get projected onto it, opening in its own window. Every currently visible layer gets carried into the section; the Buffer setting controls how far off the line a hole/point can be and still be included."}>
          <button className={`ge-subtool-btn ${sectionMode ? "active" : ""}`} onClick={onToggleSection}>
            <Scissors size={15} />
          </button>
        </HoverToolInfo>
      </div>
      {sectionMode && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#55606e", marginLeft: 4 }} title="Every currently visible layer (litho, alteration, assays, structure, custom…) gets carried into the section">
          Buffer (m)
          <input type="number" value={sectionCorridor} onChange={(e) => setSectionCorridor(Math.max(1, Number(e.target.value) || 100))} style={{ width: 60, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "4px 6px", color: "#1a2028", fontSize: 11, fontFamily: "inherit" }} />
        </label>
      )}

      <div className="ge-subtool-sep" />
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <HoverToolInfo title="Measure" text={measureMode ? "Active — click points on the model to measure, or click the button again to stop. Distance mode chains a running line — each click extends it, showing the total path length, the straight-line start-to-end distance, and the last segment's own length/bearing/elevation change. Area mode builds a polygon — the closing edge back to your first point is drawn dashed automatically, and the readout shows the plan-view (horizontal) area and perimeter. Switch between the two with the Distance/Area pills in the readout." : "Click points on the model (plan or 3D) to measure. Distance mode chains a running line — each click extends it, showing the total path length, the straight-line start-to-end distance, and the last segment's own length/bearing/elevation change. Area mode builds a polygon — the closing edge back to your first point is drawn dashed automatically, and the readout shows the plan-view (horizontal) area and perimeter. Switch between the two with the Distance/Area pills that appear once measuring is on."}>
          <button className={`ge-subtool-btn ${measureMode ? "active" : ""}`} onClick={onToggleMeasure}>
            <Ruler size={15} />
          </button>
        </HoverToolInfo>
      </div>
      {measureMode && <MeasureResults mode={measureMode} pts={measurePts} onClear={clearMeasure} onSwitchMode={onSwitchMeasureMode} />}
    </div>
  );
}
const popoverStyle = { position: "absolute", top: "calc(100% + 4px)", left: 0, width: 230, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.12)", padding: 10, zIndex: 50 };
const popoverHeader = { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "#55606e", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" };

function ContextItem({ label, onClick, disabled, title }) {
  if (disabled) {
    return <div title={title} style={{ padding: "7px 10px", borderRadius: 5, cursor: "default", color: "#9aa5b3" }}>{label}</div>;
  }
  return <div onClick={onClick} title={title} onMouseEnter={(e) => (e.currentTarget.style.background = "#242e3c")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")} style={{ padding: "7px 10px", borderRadius: 5, cursor: "pointer", color: "#1a2028" }}>{label}</div>;
}
// TASKS.csv #222 (QGIS-specialist audit finding: 38ms blocking per single hole-visibility toggle at
// 200 holes) — collars.map(...) recreated every hole row's JSX on every render, so toggling ONE hole's
// eye icon forced React to reconcile all 200 sibling rows too, not just the one that actually changed.
// React.memo here + toggleHole/onOpenStripLog both being useCallback-stable (see their own definitions)
// means an unrelated row's props are referentially unchanged across that render, so React skips it
// entirely. A full windowed-scroll virtualization (like DataQCModal/AttributeTableModal got) wasn't
// used here because the Holes list isn't its own isolated scroll region — it's one section inline
// within the whole sidebar's single mixed-content scroll container (Geometry/Layers/Slice-series/Holes/
// notices all together), and windowing a sub-range of a larger shared scroll needs real layout
// restructuring this pass didn't attempt; memoization fixes the actual measured symptom (the toggle
// cost) without that risk.
const HoleRow = React.memo(function HoleRow({ hole_id, visible, onToggle, onOpenStripLog }) {
  return (
    <div onClick={() => onToggle(hole_id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 5, cursor: "pointer", fontSize: 12, color: visible === false ? "#9aa5b3" : "#1a2028" }}>
      {visible === false ? <EyeOff size={12} /> : <Eye size={12} />}
      <span style={{ flex: 1 }}>{hole_id}</span>
      <span
        onClick={(e) => { e.stopPropagation(); onOpenStripLog(hole_id); }}
        title={`Strip log — ${hole_id}`}
        style={{ display: "flex", alignItems: "center", color: "#94a1b0", padding: 2, borderRadius: 4 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#1a2028")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#94a1b0")}
      >
        <FileBarChart2 size={12} />
      </span>
    </div>
  );
});

function LayerRow({ label, count, visible, onToggle, onUpload, onInspect, onZoom, onClear, onContextMenu, input, expanded, onToggleExpand, children }) {
  return (
    <div style={{ background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, marginBottom: 6 }} onContextMenu={onContextMenu}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px" }}>
        {/* TASKS.csv #66 — inline expand (category chips + sources) without opening the full
            LayerInspector modal. Only offered once there's something to expand. */}
        {count > 0 && onToggleExpand ? (
          <div onClick={onToggleExpand} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} title={expanded ? "Collapse" : "Expand"}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        ) : <div style={{ width: 13, flexShrink: 0 }} />}
        <div onClick={onToggle} style={{ cursor: "pointer", color: visible ? "#e2a63c" : "#9aa5b3" }} title={visible ? "Hide layer" : "Show layer"}>{visible ? <Eye size={14} /> : <EyeOff size={14} />}</div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: visible ? "#1a2028" : "#6b7684", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        {count > 0 && <Maximize2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={onZoom} title="Zoom to this layer" />}
        {count > 0 && <ListFilter size={13} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={onInspect} title="Filter / legend / sources (full view)" />}
        {/* TASKS.csv #63 — "unload" this layer's data entirely. Separate from the per-source removal
            inside the inspector (ListFilter above) — this is the "I don't want this tab's data at all
            anymore" case, the inspector handles "just pull out one of several CSVs I merged in". */}
        {count > 0 && onClear && <Trash2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={onClear} title="Remove all data from this layer" />}
        <div onClick={onUpload} style={{ cursor: "pointer", fontSize: 10.5, color: count ? "#e2a63c" : "#94a1b0", flexShrink: 0 }} title="Import CSV">{count ? `${count}` : <Upload size={12} />}</div>
        {input}
      </div>
      {expanded && children && (
        <div style={{ padding: "0 10px 9px 32px", borderTop: "1px solid #dde1e6" }}>{children}</div>
      )}
    </div>
  );
}
// TASKS.csv #66 — the inline-expand content: category chips (click to toggle, shift-click to
// isolate) for non-numeric layers, plus a compact sources list, both reusing the same
// categoryFilter/legendOverride/_src data #63 already introduced for the full LayerInspector modal.
// Deliberately terser than that modal (chips instead of rows with color pickers/labels/counts) since
// the point of this view is a quick glance + quick toggle, not the full editing surface.
function LayerQuickPanel({ rows, meta, categoryFilter, onToggleCategory, onIsolate, onRemoveSource }) {
  const categories = meta.numeric ? [] : distinctValues(rows);
  const sources = (() => {
    const counts = new Map();
    rows.forEach((r) => { const s = r._src || "(unlabeled)"; counts.set(s, (counts.get(s) || 0) + 1); });
    return Array.from(counts.entries());
  })();
  return (
    <div style={{ paddingTop: 8 }}>
      {!meta.numeric && categories.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: sources.length > 1 ? 8 : 0 }}>
          {categories.map(([value, count]) => {
            const hidden = categoryFilter.has(value);
            const color = meta.colorFn ? meta.colorFn(value) : "#55606e";
            const lbl = meta.nameFn ? (meta.nameFn(value) || value) : value;
            return (
              <span
                key={value}
                onClick={(e) => (e.shiftKey ? onIsolate(value) : onToggleCategory(value))}
                title={`${lbl} (${count}) — click to toggle, shift-click to show only this one`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 10,
                  fontSize: 10, cursor: "pointer", border: `1px solid ${hidden ? "#c7ccd3" : color}`,
                  color: hidden ? "#9aa5b3" : "#1a2028", background: hidden ? "transparent" : "#dde1e6",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, opacity: hidden ? 0.35 : 1 }} />
                {lbl} <span style={{ color: "#94a1b0" }}>{count}</span>
              </span>
            );
          })}
        </div>
      )}
      {sources.length > 1 && (
        <div>
          {sources.map(([src, count]) => (
            <div key={src} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, marginBottom: 3 }}>
              <div style={{ flex: 1, minWidth: 0, color: "#6b7684", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={src}>{src}</div>
              <span style={{ color: "#94a1b0", flexShrink: 0 }}>{count}</span>
              <Trash2 size={10} style={{ cursor: "pointer", color: "#6b7684", flexShrink: 0 }} onClick={() => onRemoveSource(src)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// TASKS.csv #121 — measurement tool math. segmentStats mirrors buildSectionPayload's own azimuth
// formula exactly (Math.atan2(dx, dy), dx=east diff/dy=north diff, 0=N/90=E/clockwise) so a bearing
// read off a measurement matches the convention a drawn cross-section already uses elsewhere in this
// same file — one bearing convention across the whole app, not two that could disagree.
function segmentStats(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const horiz = Math.hypot(dx, dy);
  const dist3d = Math.hypot(dx, dy, dz);
  const azimuth = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  return { dist3d, horiz, vert: dz, azimuth };
}
// Plan-view (horizontal, x/y — elevation ignored) polygon area via the shoelace formula. Matches how
// a claim/target-spacing area is actually used in practice (a plan-view footprint), not a literal 3D
// surface area of a possibly-non-planar polygon, which wouldn't have one well-defined value anyway.
function polygonArea(pts) {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    a += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(a) / 2;
}
function polylineLength(pts, closeLoop) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (closeLoop && pts.length > 2) total += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return total;
}
function fmtLen(m) {
  if (!Number.isFinite(m)) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(3)} km (${m.toFixed(1)} m)` : `${m.toFixed(2)} m`;
}
function fmtArea(m2) {
  if (!Number.isFinite(m2)) return "—";
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(3)} ha (${m2.toFixed(0)} m²)` : `${m2.toFixed(1)} m²`;
}

// TASKS.csv #121 — live measurement readout, rendered inline in ViewToolbar's subtoolbar row (same
// spot the Buffer(m) control uses for sectionMode) rather than a positioned popover, so it stays
// visible and readable while the user keeps clicking points in the 3D view below — a popover the
// user would have to keep re-hovering the toolbar button to see would defeat the point of a LIVE
// running readout.
// TASKS.csv #121 follow-up — the tool used to be two separate toolbar buttons (Ruler=distance,
// Shapes=area); merged into one "Measure" button per the user's request ("we really only need one"),
// with a small Distance/Area pill pair here in the readout bar taking over the job of picking which
// kind of measurement is being taken. Switching pills clears any in-progress points (via
// onSwitchMode/switchMeasureMode) rather than trying to reinterpret an existing polyline as a polygon
// or vice versa, which would silently give a nonsense reading.
function MeasureResults({ mode, pts, onClear, onSwitchMode }) {
  const box = { display: "flex", alignItems: "center", gap: 10, marginLeft: 6, fontSize: 11, color: "#55606e", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, padding: "5px 10px" };
  const clearBtn = { display: "flex", alignItems: "center", gap: 3, cursor: "pointer", color: "#8a5555", fontSize: 10.5, flexShrink: 0 };
  const pillWrap = { display: "flex", alignItems: "center", gap: 2, background: "#e8eaed", borderRadius: 5, padding: 2, flexShrink: 0 };
  const pill = (active) => ({ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10.5, color: active ? "#1a2028" : "#6b7684", background: active ? "#ffffff" : "transparent", boxShadow: active ? "0 1px 2px rgba(0,0,0,0.1)" : "none" });

  const modeSwitch = (
    <div style={pillWrap}>
      <span style={pill(mode === "distance")} onClick={() => onSwitchMode("distance")}>Distance</span>
      <span style={pill(mode === "area")} onClick={() => onSwitchMode("area")}>Area</span>
    </div>
  );

  if (mode === "distance") {
    if (pts.length < 2) {
      return (
        <div style={box}>
          {modeSwitch}
          <span>{pts.length === 0 ? "Click on the model to start measuring…" : "1 point placed — click to add the next."}</span>
          {pts.length > 0 && <span onClick={onClear} style={clearBtn}><X size={11} /> Clear</span>}
        </div>
      );
    }
    const totalPath = polylineLength(pts, false);
    const straight = segmentStats(pts[0], pts[pts.length - 1]);
    const last = segmentStats(pts[pts.length - 2], pts[pts.length - 1]);
    return (
      <div style={box}>
        {modeSwitch}
        <span><b style={{ color: "#1a2028" }}>Total:</b> {fmtLen(totalPath)}</span>
        {pts.length > 2 && <span><b style={{ color: "#1a2028" }}>Straight-line:</b> {fmtLen(straight.dist3d)}</span>}
        <span><b style={{ color: "#1a2028" }}>Last segment:</b> {fmtLen(last.dist3d)} @ {last.azimuth.toFixed(1)}° (Δelev {last.vert >= 0 ? "+" : ""}{last.vert.toFixed(1)} m)</span>
        <span style={{ color: "#94a1b0" }}>{pts.length} pt(s)</span>
        <span onClick={onClear} style={clearBtn}><X size={11} /> Clear</span>
      </div>
    );
  }

  // area mode
  if (pts.length < 3) {
    return (
      <div style={box}>
        {modeSwitch}
        <span>{pts.length} point(s) placed — need at least 3 to compute an area.</span>
        {pts.length > 0 && <span onClick={onClear} style={clearBtn}><X size={11} /> Clear</span>}
      </div>
    );
  }
  const area = polygonArea(pts);
  const perimeter = polylineLength(pts, true);
  return (
    <div style={box}>
      {modeSwitch}
      <span><b style={{ color: "#1a2028" }}>Area:</b> {fmtArea(area)}</span>
      <span><b style={{ color: "#1a2028" }}>Perimeter:</b> {fmtLen(perimeter)}</span>
      <span style={{ color: "#94a1b0" }}>{pts.length} pt(s)</span>
      <span onClick={onClear} style={clearBtn}><X size={11} /> Clear</span>
    </div>
  );
}

// TASKS.csv #188 — Targeting module: min/max range control per voxel/block model, debounced the
// same way as GeophysicsModule's own VoxelModelRow ("Cutoff" slider) — a plain useState for the
// displayed values, only pushed to the store (which triggers ViewerModule's full InstancedMesh
// rebuild) after 150ms of no further dragging, so a slider drag doesn't rebuild a model that can be
// tens of thousands of instances on every pixel of movement. `threshold` is the pre-existing lower
// bound (GeophysicsModule's Cutoff); `rangeMax` is the new upper bound this task added — together
// they isolate a BAND (e.g. "just my IP high", "just my mag low"), not just a single cutoff.
function VoxelRangeRow({ model, onUpdate }) {
  const [dispMin, setDispMin] = useState(Number.isFinite(model.threshold) ? model.threshold : model.min);
  const [dispMax, setDispMax] = useState(Number.isFinite(model.rangeMax) ? model.rangeMax : model.max);
  const debounceRef = useRef(null);
  const push = (patch) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onUpdate(model.id, patch), 150);
  };
  const onMinInput = (v) => { setDispMin(v); push({ threshold: v }); };
  const onMaxInput = (v) => { setDispMax(v); push({ rangeMax: v }); };
  const reset = () => { setDispMin(model.min); setDispMax(model.max); onUpdate(model.id, { threshold: model.min, rangeMax: model.max }); };
  const visibleCount = model.cells.filter((c) => c.value >= dispMin && c.value <= dispMax).length;
  const isFiltered = dispMin > model.min || dispMax < model.max;
  return (
    <div style={{ marginTop: 8, padding: "8px 9px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 11.5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div onClick={() => onUpdate(model.id, { visible: model.visible === false })} style={{ cursor: "pointer", color: model.visible !== false ? "#e2a63c" : "#9aa5b3", flexShrink: 0 }} title={model.visible !== false ? "Hide" : "Show"}>
          {model.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{model.name}</div>
        {isFiltered && <span style={{ color: "#4a9be0", fontSize: 10, flexShrink: 0 }} title="A range filter is active on this model">band</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
        <span style={{ color: "#6b7684", width: 30, flexShrink: 0 }}>Min</span>
        <input type="range" min={model.min} max={model.max} step={(model.max - model.min) / 200 || 0.01} value={dispMin} onChange={(e) => onMinInput(Math.min(Number(e.target.value), dispMax))} style={{ flex: 1 }} />
        <span style={{ color: "#55606e", width: 58, textAlign: "right", flexShrink: 0 }}>{dispMin.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
        <span style={{ color: "#6b7684", width: 30, flexShrink: 0 }}>Max</span>
        <input type="range" min={model.min} max={model.max} step={(model.max - model.min) / 200 || 0.01} value={dispMax} onChange={(e) => onMaxInput(Math.max(Number(e.target.value), dispMin))} style={{ flex: 1 }} />
        <span style={{ color: "#55606e", width: 58, textAlign: "right", flexShrink: 0 }}>{dispMax.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, fontSize: 10.5, color: "#94a1b0" }}>
        <span>Showing {visibleCount.toLocaleString()} of {model.cells.length.toLocaleString()} cell(s)</span>
        {isFiltered && <span onClick={reset} style={{ cursor: "pointer", color: "#4a9be0" }}>Reset</span>}
      </div>
    </div>
  );
}

// TASKS.csv #188/follow-up — Targeting module: add-planned-hole form. Originally "Use cursor" just
// read the live status-bar cursor value (store.cursor) at the moment of the click — which is wherever
// the mouse last was over the 3D view BEFORE moving onto this sidebar button, not the point the user
// actually meant to pick. Real user report: "there is a bug on the select from cursor button. it
// should let me click on the view to retrieve the coordinates, instead it just grab the coordinates of
// the exact moment I click on the button." Now a real two-step pick: clicking the button ARMS
// pickHoleMode (in the parent — same shape as sectionMode/measureMode's own click-to-place tools) and
// changes its own label/style to "Click on the view…"; the next click anywhere in the 3D view raycasts
// a real world point (onPickHoleClick, terrain/voxel/drillhole-aware, not just a flat plane) and this
// form picks it up via the `pickedPoint` prop.
function PlannedHoleAddForm({ onAdd, pickMode, onStartPick, pickedPoint }) {
  const [draft, setDraft] = useState({ name: "", x: "", y: "", z: "", azimuth: 0, dip: -60, length: 100 });
  const set = (k, v) => setDraft((p) => ({ ...p, [k]: v }));
  const lastAppliedPick = useRef(null);
  useEffect(() => {
    if (!pickedPoint || pickedPoint === lastAppliedPick.current) return;
    lastAppliedPick.current = pickedPoint;
    setDraft((p) => ({ ...p, x: Math.round(pickedPoint.x * 10) / 10, y: Math.round(pickedPoint.y * 10) / 10, z: Math.round(pickedPoint.z * 10) / 10 }));
  }, [pickedPoint]);
  const canAdd = draft.x !== "" && draft.y !== "" && draft.z !== "" && !isNaN(Number(draft.x)) && !isNaN(Number(draft.y)) && !isNaN(Number(draft.z)) && !isNaN(Number(draft.azimuth)) && !isNaN(Number(draft.dip)) && Number(draft.length) > 0;
  const submit = () => {
    if (!canAdd) return;
    onAdd({ name: draft.name.trim() || undefined, x: Number(draft.x), y: Number(draft.y), z: Number(draft.z), azimuth: Number(draft.azimuth), dip: Number(draft.dip), length: Number(draft.length) });
    setDraft({ name: "", x: "", y: "", z: "", azimuth: 0, dip: -60, length: 100 });
  };
  return (
    <div style={{ padding: "8px 9px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6 }}>
      <input placeholder="Hole name (optional)" value={draft.name} onChange={(e) => set("name", e.target.value)} style={{ width: "100%", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 6px", fontSize: 11.5, color: "#1a2028", marginBottom: 5 }} />
      <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
        <NumField label="E" value={draft.x} onChange={(v) => set("x", v)} />
        <NumField label="N" value={draft.y} onChange={(v) => set("y", v)} />
        <NumField label="Elev" value={draft.z} onChange={(v) => set("z", v)} />
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
        <NumField label="Az°" value={draft.azimuth} onChange={(v) => set("azimuth", v)} />
        <NumField label="Dip°" value={draft.dip} onChange={(v) => set("dip", v)} />
        <NumField label="Length m" value={draft.length} onChange={(v) => set("length", v)} />
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <button
          onClick={onStartPick}
          style={{ ...miniBtn, flex: 1, background: pickMode ? "#2f6fe0" : miniBtn.background, border: pickMode ? "1px solid #2f6fe0" : miniBtn.border, color: pickMode ? "#ffffff" : miniBtn.color }}
          title="Click, then click anywhere in the 3D view to place a hole there"
        >
          {pickMode ? "Click on the view…" : "Pick on view"}
        </button>
        <button onClick={submit} disabled={!canAdd} style={{ ...miniBtn, flex: 1, background: canAdd ? "#eaf1fa" : "#f4f5f7", borderColor: canAdd ? "#a9c6e0" : "#c7ccd3", opacity: canAdd ? 1 : 0.5 }}>+ Add hole</button>
      </div>
    </div>
  );
}
function NumField({ label, value, onChange, placeholder }) {
  return (
    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, fontSize: 9.5, color: "#6b7684" }}>
      {label}
      <input type="number" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: "100%", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "4px 5px", fontSize: 11, color: "#1a2028" }} />
    </label>
  );
}

// TASKS.csv #170 — user request: "when you get to the #170/#188 overlap, just fill in the gaps like
// you suggested." #170 was originally scoped as a full drillhole-planning module; #188 (Targeting,
// above) already covers planning against the 3D model, visualizing planned traces, and CSV export.
// The gaps identified against #170's original wishlist were: automated intersection/target-proximity
// checking, collision/spacing checks against existing holes, and cost/meterage estimation. All three
// land here as one "Planned hole checks" panel, computed fresh from React state (collars/survey/
// voxelModels) rather than read from the three.js scene refs, so it can't be stale relative to the
// last render and always agrees with what's actually drawn.
function planCollisionAndTargetChecks(plannedHoles, collars, survey, voxelModels) {
  const realTraces = collars
    .map((c) => ({ hole_id: c.hole_id, pts: desurveyHole(c, survey.filter((s) => s.hole_id === c.hole_id && !isNaN(s.depth))) }))
    .filter((t) => t.pts.length);

  // Only voxel models the user has actually narrowed (threshold/rangeMax set inside the model's own
  // min/max, via the "Geophysical voxel ranges" sliders above) count as a defined "target band" — an
  // un-narrowed model spans its whole value range, and scoring a hole against literally every cell in
  // the model wouldn't tell a geologist anything useful, so those are skipped rather than silently
  // reported as a match.
  const targetModels = voxelModels.filter((m) => Number.isFinite(m.threshold) && Number.isFinite(m.rangeMax) && (m.threshold > m.min || m.rangeMax < m.max));

  return plannedHoles.map((hole) => {
    const pts = plannedHoleTrace(hole); // dense (~3m spacing) desurveyed world-coord points — see desurveyHole
    if (!pts.length) return { hole, nearestReal: null, targetHits: [] };

    // Nearest existing hole: minimum 3D distance between this planned trace and every real trace,
    // sampled at desurveyHole's own point spacing — dense enough for a spacing/collision check
    // without a true continuous-segment (point-to-line) distance calculation.
    let nearestReal = null;
    realTraces.forEach((rt) => {
      let best = Infinity;
      pts.forEach((p) => { rt.pts.forEach((q) => { const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); if (d < best) best = d; }); });
      if (best < Infinity && (!nearestReal || best < nearestReal.distance)) nearestReal = { hole_id: rt.hole_id, distance: best };
    });

    // Target-band intersection: metres of trace whose midpoints fall inside any cell (of any
    // currently-narrowed voxel model) within that model's own active threshold/rangeMax band —
    // straightforward axis-aligned box containment against the block model's own cell extents.
    const targetHits = targetModels.map((model) => {
      const cells = model.cells.filter((c) => c.value >= model.threshold && c.value <= model.rangeMax);
      let metres = 0;
      for (let i = 1; i < pts.length; i++) {
        const mid = { x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2, z: (pts[i].z + pts[i - 1].z) / 2 };
        const inside = cells.some((c) => Math.abs(mid.x - c.x) <= c.dx / 2 && Math.abs(mid.y - c.y) <= c.dy / 2 && Math.abs(mid.z - c.z) <= c.dz / 2);
        if (inside) metres += pts[i].md - pts[i - 1].md;
      }
      return { modelId: model.id, modelName: model.name, metres };
    }).filter((h) => h.metres > 0);

    return { hole, nearestReal, targetHits };
  });
}

function PlannedHoleChecks({ plannedHoles, collars, survey, voxelModels }) {
  const [minSpacing, setMinSpacing] = useState(25);
  const [costPerM, setCostPerM] = useState("");
  const results = useMemo(() => planCollisionAndTargetChecks(plannedHoles, collars, survey, voxelModels), [plannedHoles, collars, survey, voxelModels]);
  const totalM = plannedHoles.reduce((s, h) => s + (Number(h.length) || 0), 0);
  const rate = Number(costPerM);
  const totalCost = costPerM !== "" && Number.isFinite(rate) && rate > 0 ? totalM * rate : null;
  const anyTargetModel = voxelModels.some((m) => Number.isFinite(m.threshold) && Number.isFinite(m.rangeMax) && (m.threshold > m.min || m.rangeMax < m.max));

  return (
    <div style={{ marginTop: 10, padding: "9px 10px", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6 }}>
      <div style={{ fontSize: 11, color: "#1a2028", fontWeight: 600, marginBottom: 6 }}>Planned hole checks</div>
      <div style={{ display: "flex", gap: 4, marginBottom: 7 }}>
        <NumField label="Min. spacing (m)" value={minSpacing} onChange={(v) => setMinSpacing(v === "" ? 0 : Math.max(0, v))} />
        <NumField label="Cost ($/m)" value={costPerM} placeholder="enter your rate" onChange={setCostPerM} />
      </div>
      <div style={{ fontSize: 10.5, color: "#55606e", marginBottom: 7 }}>
        {plannedHoles.length} hole{plannedHoles.length === 1 ? "" : "s"}, {totalM.toLocaleString()} m total
        {totalCost != null ? ` — est. $${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} at $${rate}/m` : ""}
      </div>
      {voxelModels.length > 0 && !anyTargetModel && (
        <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 7, lineHeight: 1.4 }}>
          Narrow a voxel model's Min/Max range above (in "Geophysical voxel ranges") to check planned holes against a target band.
        </div>
      )}
      {results.map(({ hole, nearestReal, targetHits }) => {
        const tooClose = nearestReal && nearestReal.distance < minSpacing;
        return (
          <div key={hole.id} style={{ padding: "6px 8px", marginBottom: 5, borderRadius: 5, background: tooClose ? "#2a1f1f" : "#f4f5f7", border: `1px solid ${tooClose ? "#4a2f2f" : "#d9dce1"}`, fontSize: 10.5 }}>
            <div style={{ color: "#1a2028", marginBottom: 2 }}>{hole.name || "Planned hole"}</div>
            {nearestReal ? (
              <div style={{ color: tooClose ? "#e0a0a0" : "#7b8794" }}>
                Nearest existing hole: {nearestReal.hole_id} — {nearestReal.distance.toFixed(1)} m{tooClose ? ` (within the ${minSpacing} m minimum)` : ""}
              </div>
            ) : (
              <div style={{ color: "#94a1b0" }}>No existing drilled holes to compare against.</div>
            )}
            {targetHits.length > 0 && (
              <div style={{ color: "#4a9be0", marginTop: 2 }}>
                {targetHits.map((h) => `${h.metres.toFixed(0)} m in "${h.modelName}"'s target band`).join("; ")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// TASKS.csv #188 — Targeting module: one row per planned hole, all fields inline-editable (same
// "click into place, no separate edit modal" pattern as AttributeTableModal's cells) since a planned
// hole is a handful of numbers a geologist will realistically keep nudging while designing a
// program, not a big enough object to warrant a whole edit modal like VoxelLegendEditor's.
function PlannedHoleRow({ hole, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const raw = plannedHoleTrace(hole);
  const toe = raw.length ? raw[raw.length - 1] : null;
  return (
    <div style={{ marginBottom: 6, padding: "7px 9px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 11.5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div onClick={() => onUpdate(hole.id, { visible: hole.visible === false })} style={{ cursor: "pointer", color: hole.visible !== false ? "#22c9e0" : "#9aa5b3", flexShrink: 0 }} title={hole.visible !== false ? "Hide" : "Show"}>
          {hole.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
        </div>
        <div onClick={() => setExpanded((v) => !v)} style={{ flex: 1, minWidth: 0, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>{hole.name || "Planned hole"}</div>
        {expanded ? <ChevronUp size={12} style={{ cursor: "pointer", color: "#55606e" }} onClick={() => setExpanded(false)} /> : <ChevronDown size={12} style={{ cursor: "pointer", color: "#55606e" }} onClick={() => setExpanded(true)} />}
        <Trash2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => { if (window.confirm(`Remove planned hole "${hole.name || hole.id}"?`)) onRemove(hole.id); }} />
      </div>
      <div style={{ marginTop: 3, fontSize: 10.5, color: "#94a1b0" }}>
        Az {Math.round(hole.azimuth)}° / Dip {Math.round(hole.dip)}° / {Math.round(hole.length)} m{toe ? ` — toe E ${toe.x.toFixed(0)} N ${toe.y.toFixed(0)} Elev ${toe.z.toFixed(0)}` : ""}
      </div>
      {expanded && (
        <div style={{ marginTop: 6, borderTop: "1px solid #dde1e6", paddingTop: 6 }}>
          <input placeholder="Name" value={hole.name || ""} onChange={(e) => onUpdate(hole.id, { name: e.target.value })} style={{ width: "100%", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 6px", fontSize: 11.5, color: "#1a2028", marginBottom: 5 }} />
          <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
            <NumField label="E" value={hole.x} onChange={(v) => onUpdate(hole.id, { x: v })} />
            <NumField label="N" value={hole.y} onChange={(v) => onUpdate(hole.id, { y: v })} />
            <NumField label="Elev" value={hole.z} onChange={(v) => onUpdate(hole.id, { z: v })} />
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
            <NumField label="Az°" value={hole.azimuth} onChange={(v) => onUpdate(hole.id, { azimuth: v })} />
            <NumField label="Dip°" value={hole.dip} onChange={(v) => onUpdate(hole.id, { dip: v })} />
            <NumField label="Length m" value={hole.length} onChange={(v) => onUpdate(hole.id, { length: v })} />
          </div>
          <textarea placeholder="Notes" value={hole.notes || ""} onChange={(e) => onUpdate(hole.id, { notes: e.target.value })} rows={2} style={{ width: "100%", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 6px", fontSize: 11, color: "#1a2028", resize: "vertical" }} />
        </div>
      )}
    </div>
  );
}

const pBtn = { display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px", marginBottom: 6, background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, color: "#1a2028", fontSize: 12, cursor: "pointer" };
const miniBtn = { width: 60, padding: "5px 0", borderRadius: 6, fontSize: 10.5, cursor: "pointer", border: "1px solid #c7ccd3", background: "#f4f5f7", color: "#55606e" };
const iconBtn = { width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, color: "#1a2028", cursor: "pointer" };
const smallSel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 4, color: "#1a2028", fontSize: 10.5, padding: "3px 4px" };
const miniField = { flex: 1, display: "flex", flexDirection: "column", gap: 3, fontSize: 9.5, color: "#55606e" };
