import React, { useRef, useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { lazyModal } from "../lib/lazyModal.jsx"; // TASKS.csv #301
import * as THREE from "three";
import Papa from "papaparse";
import { Upload, Scissors, RotateCcw, RefreshCw, Eye, EyeOff, Trash2, ListFilter, Maximize2, Database, Camera, Grid3x3, Bookmark, BookmarkPlus, Pencil, X, Layers3, ChevronUp, ChevronDown, ShieldAlert, GitFork, Milestone, Map as MapIcon, Mountain, Image, FileBarChart2, Settings2, Box, Waypoints, Triangle, MapPin, ArrowUpRight, Shapes, Ruler, TerminalSquare, Beaker, Compass, Activity, GitCompare, Check } from "lucide-react"; // GitCompare/Check: TASKS.csv #93
import AssayStyleModal, { seedBreaks } from "../components/AssayStyleModal.jsx";
const GradeEstimationModal = lazyModal(() => import("../components/GradeEstimationModal.jsx"));  // TASKS.csv #301
const VariogramModal = lazyModal(() => import("../components/VariogramModal.jsx")); // TASKS.csv #147  // TASKS.csv #301
import LocatorMap from "../components/LocatorMap.jsx";
const BasemapView = lazyModal(() => import("../components/BasemapView.jsx"));  // TASKS.csv #301
import PromptModal from "../components/PromptModal.jsx";
import { toLonLat, reprojectXY, guessEpsgFromPrjWkt, isMetricProjectedEpsg } from "../lib/reproject.js";
import { useStore, useSetCursor, useSetTaskProgress } from "../lib/store.jsx";
import { desurveyHole, surveyAzimuthDipAt } from "../lib/desurvey.js";
import { openSectionWindow, pythonImplicitModel, saveFile, loadSampleFiles } from "../lib/desktop.js";
import { buildShapefileZip, parseShapefileZip, parseShapefileParts, shapefileFeaturesToRows } from "../lib/shapefile.js";
import { buildGeoPackage, parseGeoPackage, gpkgFeaturesToRows } from "../lib/gpkg.js";
import { buildDXF, parseDXF } from "../lib/dxf.js"; // parseDXF: TASKS.csv #289
import { parseSolidFile, solidBounds, SOLID_IMPORT_EXTENSIONS } from "../lib/solidImport.js"; // TASKS.csv #148
import { buildRasterImport } from "../lib/raster.js"; // TASKS.csv #289
import { pointInBoundary } from "../lib/geoprocessing.js";
import { buildVeinModel } from "../lib/vein.js"; // TASKS.csv #144 — paired hangingwall/footwall vein modelling
import { iconAction } from "../lib/a11y.js"; // TASKS.csv #296 — keyboard-reachable icon-only controls
const AttributeTableModal = lazyModal(() => import("../components/AttributeTableModal.jsx"));  // TASKS.csv #301
import { createCompassRose } from "../components/CompassRose.js";
import { createAxisGizmo } from "../components/AxisGizmo.js";
import HoverToolInfo from "../components/HoverToolInfo.jsx";
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";
import PanelSplitHandle from "../components/PanelSplitHandle.jsx";
import { useBrowserPanelHeight } from "../lib/useBrowserPanelHeight.js";
import DbBrowserPanel from "../components/DbBrowserPanel.jsx";
const ImportMappingModal = lazyModal(() => import("../components/ImportMappingModal.jsx"));  // TASKS.csv #301
import LayerPickerModal from "../components/LayerPickerModal.jsx"; // TASKS.csv #288
const DatabaseConnectModal = lazyModal(() => import("../components/DatabaseConnectModal.jsx"));  // TASKS.csv #301
import SectionEditModal from "../components/SectionEditModal.jsx";
const LayerInspector = lazyModal(() => import("../components/LayerInspector.jsx"));  // TASKS.csv #301
const DataQCModal = lazyModal(() => import("../components/DataQCModal.jsx"));  // TASKS.csv #301
// TASKS.csv #224 (software-design-specialist audit finding: sql.js's 658KB wasm was the single
// strongest lazy-loading candidate) — SQLWorkspaceModal statically imports sqlWorkspace.js, which
// statically imports sql.js, so a plain top-level import here pulled that wasm in on every app launch
// regardless of whether SQL workspace is ever opened. React.lazy defers the whole chain until the
// modal is actually rendered (see the Suspense wrapper at its render site below).
const SQLWorkspaceModal = React.lazy(() => import("../components/SQLWorkspaceModal.jsx"));
const BoundaryInterceptsModal = lazyModal(() => import("../components/BoundaryInterceptsModal.jsx"));  // TASKS.csv #301
const StripLog = lazyModal(() => import("../components/StripLog.jsx"));  // TASKS.csv #301
const StereonetModal = lazyModal(() => import("../components/StereonetModal.jsx"));  // TASKS.csv #301
const DownholeStructurePlot = lazyModal(() => import("../components/DownholeStructurePlot.jsx")); // TASKS.csv #277  // TASKS.csv #301
const SurfaceQueryModal = lazyModal(() => import("../components/SurfaceQueryModal.jsx")); // TASKS.csv #146  // TASKS.csv #301
const SurfaceCompareModal = lazyModal(() => import("../components/SurfaceCompareModal.jsx")); // TASKS.csv #93  // TASKS.csv #301
import { buildLineages, candidatePredecessors } from "../lib/surfaceVersions.js"; // TASKS.csv #93
const FenceDiagramModal = lazyModal(() => import("../components/FenceDiagramModal.jsx")); // TASKS.csv #139  // TASKS.csv #301
const CoreOrientationCalculator = lazyModal(() => import("../components/CoreOrientationCalculator.jsx"));  // TASKS.csv #301
import {
  LAYER_META, TARGET_SCHEMAS, guessColumn, guessTarget, getCol, EPSG_COL_ALIASES,
  diffCollarImport, // TASKS.csv #283
  colorForLithology, colorForAlteration, colorForVein, colorForMineral, colorForStructure,
  rqdColor, magColor, hashColor, UNIT_NAMES, distinctValues, minMax, colorForVoxelValue, makeVoxelColorResolverRGB,
  roleForLithology, isCrossCuttingRole,
  colorForMedium, classifyBreaks, paletteColorsHex, PALETTES,
} from "../lib/layers.js";
import { computeMeshVolume, computeTonnage } from "../lib/volumetrics.js";
import { exportSurfaceOBJ, exportSurfaceDXF, exportSurfaceGLTF, sceneVertsToWorld } from "../lib/meshExport.js";
import { checkTopology } from "../lib/topology.js"; // TASKS.csv #90
import { truncateAgainstSolid, splitAcrossSurface } from "../lib/crosscut.js"; // TASKS.csv #52 (d) — cross-cutting
import { useSculpt } from "../lib/useSculpt.js"; // TASKS.csv #145 — manual surface editing
import SculptPanel from "../components/SculptPanel.jsx"; // TASKS.csv #145
// TASKS.csv #142 — numeric (grade-shell) implicit model: composites/assays -> dense IDW grid -> marching cubes
import { samplePointsFromIntervals, estimateDenseGrid, MAX_BLOCKS, SUPPORT_COLORS, summarizeSupport, ESTIMATION_METHODS } from "../lib/estimation.js"; // SUPPORT_*: TASKS.csv #91/#92
import { marchingCubes } from "../lib/marchingCubes.js";
import { compositeDownhole, PRECIOUS_METALS } from "../lib/geochem.js";
import { excludeQAQC } from "../lib/qaqc.js"; // TASKS.csv #266
import PlannedHoleTargeting from "../components/PlannedHoleTargeting.jsx"; // TASKS.csv #119 - target solver + planned-vs-as-drilled
import { solveOrientationToTarget } from "../lib/holePlanning.js"; // TASKS.csv #119 - shared, Node-verified target math
import { normalizeCommaDecimals } from "../lib/numberLocale.js"; // TASKS.csv #284

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
  // TASKS.csv #135 — deliberately does NOT take the project's desurvey method. A planned hole has no
  // survey stations at all, so desurveyHole's collar-only fallback builds a single constant-attitude
  // interval — and all four methods are provably IDENTICAL on a constant azimuth/inclination hole
  // (verified to 0.000e+0 m in #135's Node check). Passing the method here would be a no-op that
  // implied the plan's geometry depends on a setting it cannot depend on.
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
// TASKS.csv #227 (continuation) — the layer keys whose geometry is one plain THREE.Mesh per row
// (buildIntervalTube/buildPointMarkers/the structure loop), and therefore support the cheap post-hoc
// visibility/color passes below instead of a full rebuild for a categoryFilter/legendOverride change.
const CATEGORY_LAYER_KEYS = ["litho", "alt", "vein", "litho_gc", "alt_gc", "mnlgy", "structure"];

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
// TASKS.csv #131 — small canvas-rendered text sprite, the standard three.js technique for always-
// camera-facing labels (a Sprite auto-billboards, unlike a Mesh) without pulling in a font/SDF-text
// library just for hole names. Rendered at a fixed pixel-ish canvas resolution then scaled in world
// units via sprite.scale — legible at a normal drillhole-scale zoom without turning into a giant
// screen-filling label right on top of a collar (three.js Sprites don't have a native "distance-
// independent" screen-space size mode without a custom shader, which felt like real overkill here).
function makeTextSprite(text, { color = "#1a2028", bg = "rgba(255,255,255,0.85)" } = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = 32;
  ctx.font = `600 ${fontSize}px 'Exo 2', system-ui, sans-serif`;
  const padX = 10, padY = 6;
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  const h = fontSize + padY * 2;
  canvas.width = w; canvas.height = h;
  ctx.font = `600 ${fontSize}px 'Exo 2', system-ui, sans-serif`;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, padX, h / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  const scale = 0.09; // world-units-per-canvas-pixel — tuned to read clearly at a typical drillhole-project zoom
  sprite.scale.set(w * scale, h * scale, 1);
  sprite.renderOrder = 999; // draw after (on top of) opaque geometry — depthTest:false already ignores occlusion, this just keeps draw order consistent across sprites
  return sprite;
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
// onDone(rows, errorMessage, localeNote) — TASKS.csv #284: Papa's dynamicTyping leaves a
// European-locale value like "1,5" as the literal STRING "1,5", and Number("1,5") is NaN, so every
// numeric filter downstream silently dropped the whole row and the only symptom was a short row count
// in the toast. normalizeCommaDecimals converts the columns it can PROVE are comma-decimal and hands
// back a note explaining what it did (or, for the genuinely ambiguous "1,234" case, what it
// deliberately did NOT do) — see src/lib/numberLocale.js for the heuristic and why it's shaped that way.
function parseCSV(file, onDone) {
  Papa.parse(file, {
    header: true, dynamicTyping: true, skipEmptyLines: true,
    complete: (res) => { const { rows, note } = normalizeCommaDecimals(res.data); onDone(rows, null, note); },
    error: (err) => onDone(null, err.message),
  });
}
// TASKS.csv #190/#191 — user request: "let's do those 3" (shapefile import, GeoPackage export,
// GeoPackage import). Both new import formats get converted to the exact same flat-row-array shape
// Papa.parse already produces for a CSV (via shapefileFeaturesToRows/gpkgFeaturesToRows), so every
// existing CSV-shaped import consumer (openImportModal below, and GeophysicsModule's block-model
// import) can accept a shapefile .zip or a .gpkg with no format-specific logic beyond this one
// dispatch point — extension decides which parser runs, everything downstream is unchanged.
// onDone(rows, errorMessage, meta) — meta.note is an optional extra string (multi-layer/skipped-
// feature caveats) the caller should fold into its own notice rather than silently dropping.
// TASKS.csv #288 — `chosenLayer` (a layer/table NAME) selects which layer of a multi-layer .zip or
// multi-table .gpkg to read. When a file has more than one and the caller hasn't chosen yet, this
// reports the available layers back through meta.layerOptions and imports NOTHING, so the caller can
// put a picker up instead of silently taking the first one (which is what it used to do).
function parseVectorFile(file, onDone, chosenLayer = null) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".gpkg")) {
    file.arrayBuffer().then((buf) => parseGeoPackage(buf)).then(({ layers }) => {
      const usable = layers.filter((l) => l.features.length);
      if (!usable.length) { onDone(null, "No usable point/line features found in this GeoPackage."); return; }
      if (usable.length > 1 && !chosenLayer) {
        onDone(null, null, { layerOptions: usable.map((l) => ({ name: l.name, count: l.features.length, geomType: l.geomType })) });
        return;
      }
      const layer = (chosenLayer && usable.find((l) => l.name === chosenLayer)) || usable[0];
      const { rows, headers } = gpkgFeaturesToRows(layer);
      let note = "";
      if (usable.length > 1) note += ` Imported the "${layer.name}" table of ${usable.length} in this GeoPackage — open the file again to bring in another one.`;
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
      ? file.arrayBuffer().then((buf) => parseShapefileZip(buf, chosenLayer))
      : file.arrayBuffer().then((buf) => parseShapefileParts({ shp: new Uint8Array(buf) }));
    reader.then((parsed) => {
      // TASKS.csv #288 — same "ask, don't silently take the first one" gate as the GeoPackage branch
      // above. parseShapefileZip now returns the real basenames, not just a count of the skipped ones.
      if (parsed.layerNames?.length > 1 && !chosenLayer) {
        onDone(null, null, { layerOptions: parsed.layerNames.map((n) => ({ name: n })) });
        return;
      }
      const { rows, headers } = shapefileFeaturesToRows(parsed);
      let note = "";
      if (parsed.otherBaseNames) note += ` This .zip bundles ${parsed.otherBaseNames + 1} separate shapefiles — "${parsed.layerName}" was imported; open the file again to pick another.`;
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
  // TASKS.csv #284 — the comma-decimal note rides the existing meta.note channel, so it surfaces in
  // the same toast/notice every other import caveat already uses (no new plumbing).
  parseCSV(file, (data, err, localeNote) => onDone(data, err, { headers: data && data.length ? Object.keys(data[0]) : [], note: localeNote || "" }));
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
  // TASKS.csv #241 — overburden is stratigraphically real (it does sit on top, in order) but
  // shouldn't be read as "basement rock" by anything downstream that cares about that distinction
  // (target-generation, true-width calcs against bedrock, etc), so it gets its own type rather than
  // being lumped under stratigraphic_contact like every other litho top.
  { key: "overburden_base", label: "Overburden (base of)" },
  { key: "fault", label: "Fault" },
  { key: "dyke", label: "Dyke (cross-cutting)" },
  { key: "breccia_body", label: "Breccia body (cross-cutting)" },
  { key: "mineralization_envelope", label: "Mineralization envelope" },
  { key: "alteration_envelope", label: "Alteration envelope" },
  // TASKS.csv #144 — a vein/dyke is modelled as a PAIR of walls plus (optionally) the solid between
  // them, so the three parts get distinct types: they are not interchangeable, and the checker (#90)
  // reads "hangingwall is above footwall" off the relationship these are created with.
  { key: "vein_hangingwall", label: "Vein/dyke — hangingwall" },
  { key: "vein_footwall", label: "Vein/dyke — footwall" },
  { key: "vein_solid", label: "Vein/dyke — solid" },
  { key: "unconformity", label: "Unconformity (erosional)" },
  { key: "intrusive_contact", label: "Intrusive contact" },
  // TASKS.csv #148 — an imported solid (pit shell, stope design, another package's wireframe) is a
  // first-class entry in this same list, so it needs a type of its own. It is deliberately NOT one of
  // the geological types above: those describe something GeoStrix modelled from this project's data,
  // and an engineering design or a third-party wireframe is neither.
  { key: "imported", label: "Imported solid / design (not modelled here)" },
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
    if (/DYKE|DIKE/.test(s)) return "dyke";
    if (/\bBX\b|BRECCIA/.test(s)) return "breccia_body";
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

// TASKS.csv #272 — helpers for the alteration-halo tool's own (non-GemPy) construction.
//
// Why the halo needs its own construction at all: every other categorical tool in this module models a
// DIRECTED contact — a surface with a coherent "younger" side and an "older" side, fitted through the
// interval TOPS only. That's the right model for a stratigraphic top or a fault plane. An alteration
// halo is not that shape: it's a closed, roughly-equant envelope wrapped around a mineralising conduit,
// with no single "up" side anywhere on it, and its base is just as much part of the body as its top.
// Feeding halo tops through the directed-contact machinery produced *a* surface, but never a halo.
// The construction below instead treats "is this rock altered?" as a 0/1 indicator field sampled along
// every hole, interpolates it onto a grid, and takes the 0.5 iso-surface — the standard implicit way to
// get a closed envelope, and the same pipeline the numeric grade-shell tool already uses.

// Median nearest-neighbour horizontal distance between collars — the natural length scale of a
// drillhole property, used to auto-pick a halo search radius/cell size that suits the actual hole
// spacing instead of a hardcoded metre value that's wrong on all but one property size.
function medianCollarSpacing(collarList) {
  if (!collarList || collarList.length < 2) return null;
  const nn = [];
  for (let i = 0; i < collarList.length; i++) {
    let best = Infinity;
    for (let j = 0; j < collarList.length; j++) {
      if (i === j) continue;
      const dx = collarList[i].x - collarList[j].x, dy = collarList[i].y - collarList[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0 && d < best) best = d;
    }
    if (Number.isFinite(best)) nn.push(best);
  }
  if (!nn.length) return null;
  nn.sort((a, b) => a - b);
  return nn[Math.floor(nn.length / 2)];
}

// Auto search radius / cell size for the halo, from the hole spacing. Radius ~1.2x the median spacing
// so neighbouring holes actually inform each other's cells (below ~1x, holes interpolate in isolation
// and the halo breaks into one blob per hole); cell size ~1/8 of the radius, which resolves the
// envelope without exploding the grid. Both are clamped to sane absolute bounds for the degenerate
// cases (a single hole, or two collars a metre apart).
function autoHaloParams(collarList) {
  const spacing = medianCollarSpacing(collarList);
  const radius = Math.min(1000, Math.max(15, (spacing || 60) * 1.2));
  const cell = Math.min(50, Math.max(1, radius / 8));
  return { radius, cell, spacing };
}

// Split a downhole interval into sub-intervals of at most `maxLen` so a thick logged interval
// contributes several sample points down its length rather than one midpoint. Without this a 60 m
// alteration run and a 1 m one carry identical weight and identical spatial footprint, which visibly
// pinches the halo in the holes that actually have the most alteration.
function splitIntervalForSampling(from, to, maxLen) {
  const len = to - from;
  if (!(len > 0)) return [];
  const n = Math.max(1, Math.ceil(len / Math.max(0.25, maxLen)));
  const step = len / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ from: from + i * step, to: from + (i + 1) * step });
  return out;
}

// TASKS.csv #275 — spatial-coherence check for lithology groups (#176). Grouping is purely label-based:
// any interval whose code is in the group's set feeds the group's surface. That's exactly what makes it
// useful ("a basalt logged as andesite in one hole"), and exactly what makes a mistaken merge invisible
// — two genuinely separate bodies grouped together get stitched into ONE surface spanning the gap
// between them, which looks like a real (if odd) result rather than an error. Single-linkage clustering
// over the group's own interface points answers "do these points actually form one body?": union-find,
// joining any two points closer than `threshold` apart. O(n^2) over a per-unit control-point count
// (tens to a few hundred), the same complexity filterBySearchSupport already accepts.
// Returns clusters sorted largest-first, each with its size, its own centroid, and the source codes that
// contributed to it — the codes are the actionable part, since "cluster A is all DACT, cluster B is all
// SED" is the signal that the merge was wrong, whereas both clusters containing both codes just means
// the unit itself outcrops in two places.
function spatialClusters(points, threshold) {
  const n = points.length;
  const parent = new Array(n).fill(0).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const t2 = threshold * threshold;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (find(i) === find(j)) continue;
      const dx = points[i].x - points[j].x, dy = points[i].y - points[j].y, dz = points[i].z - points[j].z;
      if (dx * dx + dy * dy + dz * dz <= t2) union(i, j);
    }
  }
  const byRoot = new Map();
  points.forEach((p, i) => {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, { size: 0, sx: 0, sy: 0, sz: 0, codes: new Set() });
    const c = byRoot.get(r);
    c.size++; c.sx += p.x; c.sy += p.y; c.sz += p.z;
    if (p.srcCode) c.codes.add(p.srcCode);
  });
  return [...byRoot.values()]
    .map((c) => ({ size: c.size, centroid: { x: c.sx / c.size, y: c.sy / c.size, z: c.sz / c.size }, codes: [...c.codes] }))
    .sort((a, b) => b.size - a.size);
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
  // Same split, same reasoning, for taskProgress (TASKS.csv #226 follow-up) — this component calls
  // setTaskProgress repeatedly during a modeling run/multi-file import but never reads its value.
  const setTaskProgress = useSetTaskProgress();
  const {
    collars, setCollars, survey, setSurvey, layers, setLayers, replaceLayer, assays, assayElements,
    desurveyMethod, // TASKS.csv #135 — project-wide desurvey method; every trace built here must use it
    surfaceSamples, surfaceElements,
    plannedHoles, addPlannedHole, updatePlannedHole, removePlannedHole,
    generatedSurfaces, setGeneratedSurfaces, modelDomains, setModelDomains, // TASKS.csv #52 — persisted implicit surfaces + domains
    customLayers: storeCustomLayers, setCustomLayers: setStoreCustomLayers,
    viewerUiState, setViewerUiState, viewerUiStateSeq,
    lastCamState, setLastCamState,
    addLayoutImage, goToModule,
    themes, addTheme, updateTheme, renameTheme, deleteTheme,
    viewportRenderRequest, viewportRenderRequestSeq, viewportPendingRequest, resolveViewportRender,
    rasters, addRaster, updateRaster, removeRaster,
    boundaries, addBoundary, updateBoundary, removeBoundary,
    fieldStructuralRefs, addFieldRef, removeFieldRef,
    lithoGroups, addLithoGroup, updateLithoGroup, removeLithoGroup,
    omfObjects, updateOmfObject, removeOmfObject,
    terrain, updateTerrain,
    geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax,
    voxelModels, addVoxelModel, updateVoxelModel, removeVoxelModel,
    project,
    layerGroups, addLayerGroup, renameLayerGroup, deleteLayerGroup, toggleLayerGroupCollapsed, setLayerGroupFor,
    excludedIntercepts, toggleExcludedIntercept,
    softIntercepts, toggleSoftIntercept,
    interceptSets, addInterceptSet, renameInterceptSet, deleteInterceptSet, setInterceptsInSet, toggleInterceptInSet, // TASKS.csv #52 (c)
    sections, upsertSection, renameSection, deleteSection,
    sectionGroups, addSectionGroup, deleteSectionGroup, deleteAllSections, updateSections, renameSectionsBulk,
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
  // TASKS.csv #237 sub-item (3) — user-configurable graduated/classed symbology for the NUMERIC
  // interval/point layers (geotech, recovery, sg, magsusc). Until now only geophys_pts got this
  // (#122); these four were locked to a hardcoded ramp — rqdColor's fixed 0-100 scale for geotech/
  // recovery, and a continuous 2-colour magColor over the project min/max for sg/magsusc — with no
  // way to set your own class breaks or colours. Shape: { [layerKey]: { stops: [{value,color}],
  // colorMode: "continuous"|"discrete" } }. A layer with NO entry here (the default for every
  // existing project) keeps the exact previous hardcoded behaviour, so this is purely additive.
  //
  // Deliberately kept in ViewerModule state + persisted through viewerUiState (like legendOverride/
  // numericRange right above) rather than as new top-level store fields: geophys_pts' own version
  // used four separate store fields, which was fine for one layer but would mean sixteen new fields
  // and sixteen new persistence touch-points for these four — this is per-layer display state, the
  // same category legendOverride already occupies, not project data.
  const [numericSymbology, setNumericSymbology] = useState({});
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
  // TASKS.csv #247 — a newly-toggled-on element used to default to a single flat color regardless of
  // grade (a 0.01 g/t and a 50 g/t intercept looked identical) until a user found the small gear icon
  // and manually set grade breaks. Now the FIRST time an element is turned on (no assayStyle entry yet,
  // or one with no breaks — e.g. from an older saved project), it's auto-seeded with the same 3-class
  // split AssayStyleModal's own "Add break" button seeds with (seedBreaks), so grade patterns are
  // visible immediately — still fully overridable/removable via that same modal.
  const toggleAssayElement = (symbol) => {
    const turningOn = !assayDisplayElements.includes(symbol);
    setAssayDisplayElements((p) => p.includes(symbol) ? p.filter((s) => s !== symbol) : [...p, symbol]);
    if (turningOn) {
      setAssayStyle((s) => {
        if (s[symbol]?.breaks?.length) return s; // user already has their own breaks -- don't clobber
        const range = globalAssayRanges[symbol] || { min: 0, max: 0 };
        return { ...s, [symbol]: { ...(s[symbol] || {}), breaks: seedBreaks(range) } };
      });
    }
  };
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
  const [variogramOpen, setVariogramOpen] = useState(false); // TASKS.csv #147 — variogram / spatial continuity
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
  // TASKS.csv #131 — QGIS-specialist audit finding: "no configurable label expression in the 3D/plan
  // view." Scoped narrowly here to collar (hole) labels specifically, since that's the concrete case
  // every downhole tool actually labels by default and GeoStrix currently has NO text labeling
  // anywhere in the 3D scene at all (confirmed by grep before starting — not just "fixed" labeling as
  // the audit's phrasing implied, genuinely absent). A full QGIS-style label-expression engine across
  // every layer type would be a much larger feature; this covers the single most-wanted case (reading
  // which hole is which without opening the sidebar or hovering every collar one at a time) with a
  // small fixed set of label contents rather than an arbitrary expression language.
  const [holeLabelMode, setHoleLabelMode] = useState("none"); // "none" | "hole_id" | "hole_id_z" | "hole_id_depth"

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
  const [tadpoleOpen, setTadpoleOpen] = useState(false); // TASKS.csv #277 — downhole structural plot
  const [surfaceQueryOpen, setSurfaceQueryOpen] = useState(false); // TASKS.csv #146 — distance/point-in-domain report
  // TASKS.csv #93 — iterative modelling workflow. Holds the surface id the compare dialog was opened
  // from (so it can preselect that lineage), or null when closed.
  const [compareVersionsFor, setCompareVersionsFor] = useState(null);
  const [fenceOpen, setFenceOpen] = useState(false); // TASKS.csv #139 — fence/panel correlation diagram
  const [coreOrientOpen, setCoreOrientOpen] = useState(false);
  const [alterationTarget, setAlterationTarget] = useState("");
  // TASKS.csv #272 — the alteration halo is now built as a closed indicator envelope (see
  // runAlterationModel), which needs a grid cell size and a search radius the way the grade-shell tool
  // does. 0 means "auto" — derived at run time from the actual drillhole spacing (see autoHaloParams),
  // so a user who never touches these still gets scale-appropriate values on any property.
  const [alterationCellSize, setAlterationCellSize] = useState(0);
  const [alterationSearchRadius, setAlterationSearchRadius] = useState(0);
  const [alterationBusy, setAlterationBusy] = useState(false);
  // TASKS.csv #144 — vein/dyke tool state. `veinDip`/`veinDipDir` are empty strings when the attitude
  // is to be FITTED from the intercept midpoints (the normal case); typing both overrides the fit,
  // which is what a single section line of holes needs, since collinear midpoints cannot fix a plane.
  const [veinTarget, setVeinTarget] = useState("");
  const [veinDip, setVeinDip] = useState("");
  const [veinDipDir, setVeinDipDir] = useState("");
  const [veinCellSize, setVeinCellSize] = useState(0);
  const [veinSearchRadius, setVeinSearchRadius] = useState(0);
  const [veinBusy, setVeinBusy] = useState(false);
  const [stackUnits, setStackUnits] = useState([]); // ordered youngest -> oldest, for the stratigraphic stack tool
  // TASKS.csv #271 — GemPy StackRelationType. Defaults to ONLAP (conformable) for two reasons: it's the
  // right model for the volcanic-hosted stratigraphy this app targets, and it is also exactly the
  // geometry every stack run produced before #271 (a single shared-scalar-field group — see the
  // sidecar's own comment), so this default changes nothing about existing results while making the
  // erosional case genuinely available for the first time.
  const [stackRelation, setStackRelation] = useState("onlap");
  const [stackAdd, setStackAdd] = useState("");
  const [expandedLithoGroupId, setExpandedLithoGroupId] = useState(null); // TASKS.csv #176 — which group's code checklist is open
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
  // TASKS.csv #240 — which section groups (fence-series runs) are expanded to show their individual
  // sections in the sidebar. Defaults to collapsed for every group (a fence run can be thousands of
  // sections — see this row's own notes — so opting IN to rendering that many DOM rows, rather than
  // it happening automatically on generation, matters for real sidebar responsiveness). Pure UI
  // convenience state, deliberately not persisted — same category as openPopover right above.
  const [expandedSectionGroups, setExpandedSectionGroups] = useState({});
  // TASKS.csv #240 follow-up — user request: "edit a single section but also bulk edit a bunch of
  // sections and also bulk rename them." selectedSectionIds drives both bulk actions below; single-
  // section edit reuses the exact same modal/flow with a one-element selection rather than a
  // separate code path, so there's only one "edit a section's content scope" implementation to keep
  // correct. sectionEditOpen is a plain boolean (the ids to edit are read from selectedSectionIds at
  // the moment the modal opens) rather than snapshotting the id list, so it always reflects whatever
  // is currently selected.
  const [selectedSectionIds, setSelectedSectionIds] = useState(new Set());
  const [sectionEditOpen, setSectionEditOpen] = useState(false);
  const [implicitBusy, setImplicitBusy] = useState(false);
  // TASKS.csv #142 — numeric implicit model (grade shell) inputs. Session-only UI state, same as the
  // other modelling tools' pickers. Cutoff is in the element's own display unit (assayElements' unit),
  // compositing mirrors GradeEstimationModal's useComposites/compositeLength pattern exactly.
  const [numericSymbol, setNumericSymbol] = useState("");
  const [numericCutoff, setNumericCutoff] = useState(1);
  const [numericCellSize, setNumericCellSize] = useState(10);
  const [numericSearchRadius, setNumericSearchRadius] = useState(50);
  const [numericMethod, setNumericMethod] = useState("idw2");
  const [numericUseComposites, setNumericUseComposites] = useState(true);
  const [numericCompositeLength, setNumericCompositeLength] = useState(2);
  // TASKS.csv #262 — minCoverage was hardcoded at 0.5 here, so a half-missing-core composite silently
  // counted as a full sample in the grade shell with no way to tighten it. Same control/default as
  // CompositingModal and GradeEstimationModal (0.5 = unchanged behaviour until the user moves it).
  const [numericMinCoverage, setNumericMinCoverage] = useState(0.5);
  // TASKS.csv #257 - defaults to FALSE. Closing the shell at the search-radius boundary manufactures a
  // watertight solid whose volume is set by the radius rather than by a grade boundary, so the honest
  // open shell is the default and the artificial closure is a deliberate opt-in.
  const [numericCloseShell, setNumericCloseShell] = useState(false);
  const [numericCapValue, setNumericCapValue] = useState(NaN); // TASKS.csv #259 - high-grade cap
  const [numericMinHoles, setNumericMinHoles] = useState(2);   // TASKS.csv #258 - min distinct holes
  const [numericIncludeQAQC, setNumericIncludeQAQC] = useState(false); // TASKS.csv #266
  const [numericPadding, setNumericPadding] = useState(25);
  const [numericBusy, setNumericBusy] = useState(false);
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
  // TASKS.csv #52 (d) — which surface is selected as the cross-cutting body for the expanded surface.
  // One draft, not one per row, for the same reason relationDraft is: only one row is ever expanded.
  const [cutterDraft, setCutterDraft] = useState("");
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
  // implicitSurfaces themselves. TASKS.csv #52 — both now persist: surface ids are stable across a
  // save/reload, so a domain's fault references survive with them.
  // TASKS.csv #52 — domains now live in the store's persisted `modelDomains` (see store.jsx), not in
  // local state. Aliased rather than renamed at ~30 call sites below: the shape and every setter call
  // (`setDomains((p) => ...)`) is identical, so this is a one-line change of WHERE the list lives, not
  // a rewrite of how it's used. #89's note said domain persistence was blocked on surfaces persisting
  // first (a domain references a fault surface by id); that's now true, so both persist together.
  const domains = modelDomains;
  const setDomains = setModelDomains;
  const [expandedDomainId, setExpandedDomainId] = useState(null);
  const [domainConstraintDraft, setDomainConstraintDraft] = useState({ faultId: "", side: 1 });
  // Shared across all four modelling tools below (litho/stack/structural/alteration) — a domain is a
  // property of the RUN, not of one tool, so one selector covers all of them rather than repeating it
  // four times. "" = whole property (today's original, undomained behavior).
  const [modelDomainId, setModelDomainId] = useState("");
  // TASKS.csv #52 (c) — which named intercept set (store.interceptSets) the modelling tools are
  // restricted to. Session state, not persisted, for exactly the reason modelDomainId isn't: the SETS
  // are project data and are saved; which one you happen to have selected right now is a UI choice.
  // "" means every intercept feeds a run, which is the pre-#52(c) behaviour, bit for bit.
  const [activeInterceptSetId, setActiveInterceptSetId] = useState("");
  // A Set for O(1) membership — a run touches every litho row of the target unit in every hole, and
  // Array.includes on a few hundred ids inside that loop is the kind of cost this project's performance
  // priority says to just not introduce. Null when no set is active, and every call site reads that as
  // "no restriction" rather than "an empty set that excludes everything".
  const activeInterceptSet = useMemo(() => (interceptSets || []).find((x) => x.id === activeInterceptSetId) || null, [interceptSets, activeInterceptSetId]);
  const activeInterceptSetIds = useMemo(() => (activeInterceptSet ? new Set(activeInterceptSet.ids || []) : null), [activeInterceptSet]);
  const interceptInActiveSet = useCallback((id) => !activeInterceptSetIds || activeInterceptSetIds.has(id), [activeInterceptSetIds]);
  // Read-only, for stamping provenance onto a finished surface. A ref rather than the value itself so
  // runSurfaceStack's dependency array (deliberately tuned, and documented as such) is untouched.
  const activeInterceptSetRef = useRef(null);
  useEffect(() => { activeInterceptSetRef.current = activeInterceptSet; }, [activeInterceptSet]);
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
  // TASKS.csv #274 — GemPy's potential-field range, as a multiplier of GemPy's own default (see the
  // sidecar's range_multiplier field). 0 = Auto, i.e. don't send the parameter at all and let GemPy do
  // exactly what it always did; the effective value comes back in the response either way and is
  // reported in the run notice + stamped into every generated surface's provenance.
  const [rangeMultiplier, setRangeMultiplier] = useState(0);
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

  // TASKS.csv #237 sub-item (3) — single resolver for every numeric-layer colour lookup, so the 3D
  // view, the cross-section payload and the legend can't drift apart. When the user has defined
  // stops for this layer they win; otherwise this falls through to the ORIGINAL hardcoded behaviour
  // (rqdColor's fixed 0-100 ramp for geotech/recovery, magColor over the supplied project range for
  // sg/magsusc), so a project that never touches the new editor renders byte-identically to before.
  // Reuses colorForVoxelValue (layers.js) rather than a second interpolator — it already implements
  // exactly the continuous-lerp-between-stops / discrete-step-down semantics wanted here, and is
  // what geophys_pts and the voxel models already use, so "a colour means the same thing" holds
  // across every classified thing in the app.
  const numericLayerColor = useCallback((layerKey, value, range) => {
    const sym = numericSymbology[layerKey];
    if (sym?.stops?.length) {
      return colorForVoxelValue({ stops: sym.stops, colorMode: sym.colorMode, min: range?.min, max: range?.max }, value);
    }
    if (layerKey === "geotech" || layerKey === "recovery") return rqdColor(value);
    return magColor(value, range?.min ?? 0, range?.max ?? 0);
  }, [numericSymbology]);

  const effectiveColor = useCallback((layerKey, value) => {
    const ov = legendOverride[layerKey]?.[value];
    if (ov?.color) return ov.color;
    return LAYER_META[layerKey].colorFn(value);
  }, [legendOverride]);
  // TASKS.csv #227 (continuation) — used ONLY inside the big geometry-rebuild effect's build loops,
  // instead of effectiveColor, for the same reason isRowVisibleForBuild exists: a mesh's baked-at-build
  // color should be the layer's plain default, NOT legendOverride-aware, so a legendOverride edit never
  // needs to rebuild geometry — the post-hoc applyLegendOverrideColors pass below (which DOES call the
  // real effectiveColor) repaints matching meshes' material.color directly instead.
  const baseColorForBuild = useCallback((layerKey, value) => LAYER_META[layerKey].colorFn(value), []);
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
  // TASKS.csv #227 (continuation) — used ONLY inside the big geometry-rebuild effect's build loops,
  // instead of isRowVisible, for the same reason customVisible was pulled out of that effect's
  // dependency array: a category-hidden row's mesh is still built (numericRange-based exclusion is
  // unchanged/unaffected — out of scope for this pass), just left for the small post-hoc visibility
  // pass below (applyCategoryVisibility) to hide via `.visible = false` instead of never existing —
  // so toggling a category chip becomes a cheap per-mesh flip instead of a full rebuild.
  const isRowVisibleForBuild = useCallback((groupKey, row) => {
    const meta = LAYER_META[groupKey];
    if (meta.numeric) return isRowVisible(groupKey, row);
    return true;
  }, [isRowVisible]);
  // TASKS.csv #227 (continuation) — the post-hoc half of the pair above: walks each category-
  // filterable layer's already-built children and hides the ones whose tagged catValue is in that
  // layer's categoryFilter set, using the exact same `hidden.has(String(value))` semantics
  // isRowVisible already used at build time — just applied after the fact instead of before, so it
  // never needs to touch geometry. Called directly (not a hook) from two places: inline at the end of
  // the big rebuild effect (reapplies current filters to freshly-built children after a real rebuild),
  // and from the small effect right after it below (the common case — only categoryFilter changed).
  const applyCategoryVisibility = useCallback(() => {
    const groups = layerGroupsRef.current;
    CATEGORY_LAYER_KEYS.forEach((key) => {
      const g = groups[key];
      if (!g) return;
      const hidden = categoryFilter[key];
      g.children.forEach((child) => { child.visible = !(hidden && hidden.has(String(child.userData?.catValue))); });
    });
  }, [categoryFilter]);
  // TASKS.csv #227 (continuation) — the post-hoc half of baseColorForBuild above: walks each category
  // layer's already-built children and repaints material.color from the REAL effectiveColor (which does
  // check legendOverride), using the same catValue tag categoryFilter's own pass already relies on. A
  // legendOverride edit (recolor one lithology code, say) becomes a per-mesh material.color.set() instead
  // of a full geometry rebuild. Labels (tooltips) are NOT repainted here — they stay baked at build time
  // and simply lag until the next real rebuild, a deliberately accepted, documented gap (tooltip text is
  // not a perf-sensitive path the way color is; see this row's own notes for why).
  const applyLegendOverrideColors = useCallback(() => {
    const groups = layerGroupsRef.current;
    CATEGORY_LAYER_KEYS.forEach((key) => {
      const g = groups[key];
      if (!g) return;
      g.children.forEach((child) => {
        if (child.userData?.catValue === undefined || !child.material?.color) return;
        child.material.color.set(effectiveColor(key, child.userData.catValue));
      });
    });
  }, [effectiveColor]);

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
      setCategoryFilter({}); setNumericRange({}); setLegendOverride({}); setNumericSymbology({});
      setVisibleHoles({}); setCustomVisible({});
      setAssayVisible(true); setAssayDisplayElements([]); setAssayStyle({});
      setGridConfig({ ...DEFAULT_GRID });
      setBgColor("#ffffff");
      setHoleLabelMode("none");
      return;
    }
    if (s.layerVisible) setLayerVisible({ ...DEFAULT_LAYER_VISIBLE, ...s.layerVisible });
    setCategoryFilter(Object.fromEntries(Object.entries(s.categoryFilter || {}).map(([k, v]) => [k, new Set(v)])));
    setNumericRange(s.numericRange || {});
    setLegendOverride(s.legendOverride || {});
    setNumericSymbology(s.numericSymbology || {});
    setVisibleHoles(s.visibleHoles || {});
    setCustomVisible(s.customVisible || {});
    setAssayVisible(s.assayVisible !== false);
    // Migrates older saved projects' single assayDisplayElement (string) into the new
    // assayDisplayElements (array) shape — see the multi-element display state comment above.
    setAssayDisplayElements(s.assayDisplayElements || (s.assayDisplayElement ? [s.assayDisplayElement] : []));
    setAssayStyle(s.assayStyle || {});
    setGridConfig({ ...DEFAULT_GRID, ...(s.gridConfig || {}) });
    setBgColor(s.bgColor || "#ffffff");
    setHoleLabelMode(s.holeLabelMode || "none");
  }, [viewerUiStateSeq, viewerUiState, lastCamState]);

  // Push local UI state up to the store on every relevant change, so it's captured whenever
  // saveProject next runs. Sets aren't JSON-safe, so categoryFilter is serialized to arrays here.
  useEffect(() => {
    setViewerUiState({
      layerVisible,
      categoryFilter: Object.fromEntries(Object.entries(categoryFilter).map(([k, v]) => [k, Array.from(v)])),
      numericRange,
      legendOverride,
      numericSymbology,
      visibleHoles,
      customVisible,
      assayVisible,
      assayDisplayElements,
      assayStyle,
      gridConfig,
      bgColor,
      holeLabelMode,
    });
  }, [layerVisible, categoryFilter, numericRange, legendOverride, numericSymbology, visibleHoles, customVisible, assayVisible, assayDisplayElements, assayStyle, gridConfig, bgColor, holeLabelMode, setViewerUiState]);

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
    // TASKS.csv #236 (software-design-specialist audit finding) — preserveDrawingBuffer:true forces
    // the browser to retain the WebGL drawing buffer after every single presented frame, a real,
    // permanent per-frame cost (extra memory bandwidth, and it can block certain GPU-side present-path
    // optimizations) paid forever just to support two toDataURL() snapshot call sites (snapshotToLayout
    // and the Layout-Viewport render-request capture) — a real concern for this app's own target
    // hardware (budget-constrained geologists' laptops, not gaming rigs). Both of those call sites
    // already call renderer.render(scene, camera) synchronously, in the same JS task, immediately
    // before reading canvas.toDataURL() — the browser doesn't actually clear/present the drawing
    // buffer until control returns to its own event loop after the current synchronous task finishes,
    // so that existing "render then immediately read, same task" pattern already produces a correct,
    // non-blank capture without needing the buffer preserved between frames at all. Verified live
    // (see this row's own commit) that both snapshot paths still work correctly with this removed.
    const renderer = new THREE.WebGLRenderer({ antialias: true });
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
    // TASKS.csv #131 — hole (collar) labels, own group for the same reason surface_samples/geophys_pts
    // get one: driven by its own toggle (holeLabelMode), built/cleared by the generic Object.values(groups)
    // loops the rebuild effect already uses, no special-casing needed there.
    const holeLabelGroup = new THREE.Group(); holeLabelGroup.name = "hole_labels"; root.add(holeLabelGroup); groups.hole_labels = holeLabelGroup;
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
    // TASKS.csv #201 follow-up — user report (real screenshot): "opacity of voxels is not working
    // the way it should, it doesn't make the voxels opaque, the blocks will be displayed depending
    // on the angle of view." This is the exact residual limitation #201's own fix comment already
    // named and deliberately deferred: depthWrite:false (that fix) stops instances from wrongly
    // OCCLUDING each other, but three.js still draws an InstancedMesh's instances in fixed array
    // order, not back-to-front by camera distance — so with alpha blending, which voxel visually
    // "wins" where two overlap depends on which happened to draw last, and since screen-space overlap
    // changes as the camera orbits, so does the blend result. #201 dismissed this as "a subtle
    // blending-order nuance" — a real user, on a real large model, reports it's not subtle in
    // practice. Fixed here with actual back-to-front instance re-sorting, gated and throttled so it
    // costs nothing for the common case: only meshes an opaque model NEVER gets this treatment at
    // all (mesh.userData.transparentCells is only populated for opacity<1 models — see the voxel-
    // build effect), and even a transparent model is only re-sorted at most every
    // VOXEL_SORT_INTERVAL_MS AND only when the camera has actually moved since the last sort (a
    // static view re-sorts once, not on every idle-throttled tick).
    const voxelSortTmpMatrix = new THREE.Matrix4();
    const voxelSortTmpColor = new THREE.Color();
    const IDENTITY_QUAT = new THREE.Quaternion();
    const VOXEL_SORT_INTERVAL_MS = 150;
    let lastVoxelSortAt = 0;
    const lastVoxelSortCamPos = new THREE.Vector3(NaN, NaN, NaN);
    const resortTransparentVoxels = (now) => {
      if (now - lastVoxelSortAt < VOXEL_SORT_INTERVAL_MS) return;
      if (camera.position.distanceToSquared(lastVoxelSortCamPos) < 0.01) return; // camera hasn't moved meaningfully since the last sort
      let didWork = false;
      Object.values(voxelMeshesRef.current).forEach((mesh) => {
        const cells = mesh.userData.transparentCells;
        if (!cells || !mesh.material.transparent) return;
        didWork = true;
        const camPos = camera.position;
        const order = mesh.userData.sortOrder || (mesh.userData.sortOrder = cells.map((_, i) => i));
        const distSq = mesh.userData.sortDistSq || (mesh.userData.sortDistSq = new Float32Array(cells.length));
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          const dx = c.x - camPos.x, dy = c.y - camPos.y, dz = c.z - camPos.z;
          distSq[i] = dx * dx + dy * dy + dz * dz;
        }
        order.sort((a, b) => distSq[b] - distSq[a]); // farthest first (painter's algorithm — correct draw order for alpha blending)
        for (let j = 0; j < order.length; j++) {
          const c = cells[order[j]];
          voxelSortTmpMatrix.compose(new THREE.Vector3(c.x, c.y, c.z), IDENTITY_QUAT, new THREE.Vector3(c.dx, c.dy, c.dz));
          mesh.setMatrixAt(j, voxelSortTmpMatrix);
          voxelSortTmpColor.setRGB(c.r / 255, c.g / 255, c.b / 255, THREE.SRGBColorSpace);
          mesh.setColorAt(j, voxelSortTmpColor);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });
      if (didWork) { lastVoxelSortAt = now; lastVoxelSortCamPos.copy(camera.position); }
    };

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
        resortTransparentVoxels(now);
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
  // TASKS.csv #52 (b) — a theme can now reference generated surfaces, so re-applying it brings the
  // right surfaces back on screen instead of leaving whatever was last toggled. Read through a REF, not
  // from `implicitSurfaces` directly, deliberately: adding it to this callback's dependency array would
  // change currentViewBundle's identity every time a surface is generated, hidden or renamed, and the
  // #198/#202 comments below record what that class of dependency ripple already cost this file once.
  // A ref has stable identity and is exactly as current at call time.
  const implicitSurfacesRef = useRef([]);
  useEffect(() => { implicitSurfacesRef.current = implicitSurfaces; }, [implicitSurfaces]);
  // {id: visible} plus the names, so a theme whose surface has since been deleted can say WHICH one is
  // missing rather than silently doing nothing. Surfaces are persisted by #52's first half, so an id
  // saved in a theme still resolves after a reload — that is what makes this worth storing at all.
  const surfaceVisibilityBundle = useCallback(() => {
    const list = implicitSurfacesRef.current || [];
    return {
      surfaceVisible: Object.fromEntries(list.map((s) => [s.id, s.visible !== false])),
      surfaceNames: Object.fromEntries(list.map((s) => [s.id, s.name])),
    };
  }, []);

  const currentViewBundle = useCallback(() => {
    const cs = camState.current;
    return {
      layerVisible, numericRange, legendOverride, numericSymbology, visibleHoles, customVisible, assayVisible, assayDisplayElements, assayStyle,
      categoryFilter: Object.fromEntries(Object.entries(categoryFilter).map(([k, v]) => [k, Array.from(v)])),
      gridConfig,
      ...surfaceVisibilityBundle(),
      camState: { theta: cs.theta, phi: cs.phi, radius: cs.radius, target: { x: cs.target.x, y: cs.target.y, z: cs.target.z } },
    };
  }, [layerVisible, categoryFilter, numericRange, legendOverride, numericSymbology, visibleHoles, customVisible, assayVisible, assayDisplayElements, assayStyle, gridConfig, surfaceVisibilityBundle]);

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
      numericSymbology: s?.numericSymbology || {},
      visibleHoles: s?.visibleHoles || {},
      customVisible: s?.customVisible || {},
      assayVisible: s?.assayVisible !== false,
      assayDisplayElements: s?.assayDisplayElements || (s?.assayDisplayElement ? [s.assayDisplayElement] : []),
      assayStyle: s?.assayStyle || {},
      gridConfig: { ...DEFAULT_GRID, ...(s?.gridConfig || {}) },
      // #52 (b) — read from the live scene, not from viewerUiState (surfaces aren't mirrored there), so
      // a Layout-viewport render that applies a theme hiding a surface puts it back afterwards.
      ...surfaceVisibilityBundle(),
      camState: { theta: cs.theta, phi: cs.phi, radius: cs.radius, target: { x: cs.target.x, y: cs.target.y, z: cs.target.z } },
    };
  }, [viewerUiState, surfaceVisibilityBundle]);

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
    setNumericSymbology(theme.numericSymbology || {});
    setVisibleHoles(theme.visibleHoles || {});
    setCustomVisible(theme.customVisible || {});
    setAssayVisible(theme.assayVisible !== false);
    setAssayDisplayElements(theme.assayDisplayElements || (theme.assayDisplayElement ? [theme.assayDisplayElement] : []));
    setAssayStyle(theme.assayStyle || {});
    setGridConfig({ ...DEFAULT_GRID, ...(theme.gridConfig || {}) });
    // TASKS.csv #52 (b) — generated surfaces the theme knows about. Only ids the theme actually lists
    // are touched: a surface modelled AFTER the theme was saved is left exactly as it is, rather than
    // being hidden by a theme that never knew about it. Missing ids are reported once, by name, because
    // "the theme silently didn't restore your surface" is precisely the failure this row is fixing.
    const sv = theme.surfaceVisible;
    if (sv && typeof sv === "object") {
      const known = new Set(Object.keys(implicitMeshesRef.current));
      Object.entries(sv).forEach(([id, vis]) => {
        const mesh = implicitMeshesRef.current[id];
        if (mesh) mesh.visible = !!vis;
      });
      setImplicitSurfaces((p) => p.map((s) => (Object.prototype.hasOwnProperty.call(sv, s.id) ? { ...s, visible: !!sv[s.id] } : s)));
      const missing = Object.keys(sv).filter((id) => !known.has(id));
      if (missing.length) {
        const names = missing.map((id) => (theme.surfaceNames || {})[id] || id);
        setNotices((p) => [...p, `Theme "${theme.name}" refers to ${missing.length} generated surface(s) that aren't in this project any more: ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}. Everything else in the theme was applied.`]);
      }
    }
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
      numericSymbology: bundle.numericSymbology,
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
  // TASKS.csv #176 — lithology groups (store.lithoGroups) sit alongside raw codes in the Implicit
  // model / Stratigraphic stack pickers, value-namespaced as `group:<id>` so the existing raw-code
  // value space (a raw code string is used verbatim as the <option> value) is untouched. The
  // `group:` key rides through implicitTarget / stackUnits unchanged and is only resolved to the
  // real group object at the point gatherLithoSurfaceSpec is actually called (or a badge is drawn).
  const isLithoGroupKey = (v) => typeof v === "string" && v.startsWith("group:");
  const lithoGroupKey = (g) => `group:${g.id}`;
  // Returns the group object for a `group:` key (null if it was deleted since), else the raw code.
  const resolveLithoTarget = (v) => (isLithoGroupKey(v) ? (lithoGroups.find((g) => g.id === v.slice(6)) || null) : v);
  // A group's role comes from its member codes: shared role if every member agrees, else null
  // ("mixed" — no badge, no guessing). Cross-cutting if ANY member is, which is what keeps a group
  // off the Stack picker under the same safety rail a raw fault/dyke/breccia code already gets.
  const lithoGroupRole = (g) => { const roles = new Set((g.codes || []).map(roleForLithology)); return roles.size === 1 ? [...roles][0] : null; };
  const lithoGroupCrossCuts = (g) => (g.codes || []).some((c) => isCrossCuttingRole(roleForLithology(c)));
  const alt_units = distinctValues(layers.alt || []).map(([v]) => v);
  const vein_units = distinctValues(layers.vein || []).map(([v]) => v); // TASKS.csv #144
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
  // TASKS.csv #281 — `domainIdOverride` lets a caller ask for a SPECIFIC domain rather than whatever
  // the Modeling tab's domain selector currently holds. Added for the Stereonet's own domain filter,
  // which is a QC choice made inside that modal and must not silently retarget (or be retargeted by)
  // the modelling tools' selection. Every existing caller omits it and behaves exactly as before.
  const filterRowsByDomain = (rows, traces, getDepth, domainIdOverride) => {
    const wantId = domainIdOverride === undefined ? modelDomainId : domainIdOverride;
    const domain = domains.find((d) => d.id === wantId);
    if (!domain) return rows;
    return rows.filter((r) => {
      const t = traces.find((tr) => tr.hole_id === r.hole_id);
      if (!t) return false;
      const p = findOnTrace(t.pts, getDepth(r));
      if (!p) return false;
      return pointInDomain(p, domain, implicitMeshesRef.current);
    });
  };

  // TASKS.csv #277 / #280 — structure picks enriched with the HOLE'S OWN attitude (azimuth/dip) at each
  // pick's depth. Two features need this and neither can compute it for itself: the tadpole plot's alpha
  // axis (the angle between the structure and the core axis) and the stereonet's Terzaghi sampling-bias
  // weighting (1/sin(alpha)). Both are pure functions of (pick orientation, hole orientation at that
  // depth), and the hole's attitude at an arbitrary depth is only knowable here, where collars + survey
  // live — surveyAzimuthDipAt (desurvey.js) is the same interpolation the core-orientation calculator
  // already uses to auto-fill a hole's attitude, so the number means the same thing in both places.
  // Picks whose hole has no usable survey keep holeAz/holeDip null rather than being dropped: both
  // consumers degrade honestly (the plot falls back to true dip and says so; the Terzaghi weighting
  // leaves those picks at weight 1 and reports how many).
  const structurePicksWithHoleAttitude = useMemo(() => {
    const rows = layers.structure || [];
    if (!rows.length) return rows;
    const collarById = new Map(collars.map((c) => [c.hole_id, c]));
    const surveyByHole = new Map();
    survey.forEach((s) => {
      if (!surveyByHole.has(s.hole_id)) surveyByHole.set(s.hole_id, []);
      surveyByHole.get(s.hole_id).push(s);
    });
    // Memoize per (hole, depth) — several picks routinely share a depth, and a project can carry
    // hundreds of picks; recomputing stationsWithInclination per pick would be needless work on the
    // modest hardware this app targets.
    const cache = new Map();
    return rows.map((p) => {
      if (p.hole_id == null || p.depth == null || isNaN(p.depth)) return p;
      const key = `${p.hole_id}|${p.depth}`;
      if (!cache.has(key)) {
        const c = collarById.get(p.hole_id);
        cache.set(key, c ? surveyAzimuthDipAt(c, surveyByHole.get(p.hole_id) || [], Number(p.depth)) : null);
      }
      const att = cache.get(key);
      return att ? { ...p, holeAz: att.azimuth, holeDip: att.dip } : p;
    });
  }, [layers.structure, collars, survey]);

  // TASKS.csv #281 — the Stereonet's spatial-domain filter, handed to the modal as a callback so the
  // modal never needs to know what a domain IS (fault-side constraints evaluated against implicit
  // meshes) — it just asks "which of these picks are in domain X". Deliberately the SAME
  // filterRowsByDomain the GemPy orientation feed uses (#89/#231), so a domain means one thing app-wide
  // and a pick can't be inside "Fault block A" for modelling but outside it for QC.
  const domainStereonetFilter = useCallback(
    (rows, domainId) => filterRowsByDomain(rows, tracesRef.current, (s) => s.depth, domainId || ""),
    [domains, implicitSurfaces]
  );

  // TASKS.csv #277 — hole list (with logged length) for the tadpole plot's hole selector.
  const holesForTadpole = useMemo(() => {
    const maxByHole = new Map();
    survey.forEach((s) => {
      if (s.depth == null || isNaN(s.depth)) return;
      const cur = maxByHole.get(s.hole_id) || 0;
      if (Number(s.depth) > cur) maxByHole.set(s.hole_id, Number(s.depth));
    });
    return collars.map((c) => ({ hole_id: c.hole_id, maxDepth: maxByHole.get(c.hole_id) || null }));
  }, [collars, survey]);

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
  // TASKS.csv #271 — `relation` is GemPy's StackRelationType for the whole structural group: ERODE
  // (each younger unit truncates the ones below it — an unconformity) or ONLAP (units drape/onlap
  // rather than cutting, i.e. a conformable pile). The sidecar has implemented both since day one
  // (python-sidecar/app/main.py L182/L259) but nothing here ever set it, so every stack was modelled
  // as erosional — the wrong default for a conformable volcanic pile, which is exactly the setting
  // GeoStrix targets (VMS/epithermal). Single-surface tools pass nothing and keep "erode", which is a
  // no-op for a one-element group.
  const runSurfaceStack = useCallback(async (rawSpecs, stackOpts = {}) => {
    const relation = stackOpts.relation === "onlap" ? "onlap" : "erode";
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
      // TASKS.csv #271 (relation) / #274 (rangeMultiplier — omitted when 0/Auto, see desktop.js)
      { resolution: [modelResolution, modelResolution, modelResolution], relation, rangeMultiplier: rangeMultiplier || 0, signal: abortController.signal },
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
      // TASKS.csv #276 — until now only the numeric grade-shell tool attached a `params` block, so every
      // GemPy-generated surface exported to OBJ/DXF/glTF carried the #269 provenance HEADER with no
      // actual parameters in it. These are exactly the settings that change the shape of the surface
      // being exported, including #274's effective potential-field range as GemPy itself reported it.
      const params = {
        tool: specs.length > 1 ? "stratigraphic stack (GemPy)" : "implicit surface (GemPy)",
        surface: spec.meshName, sourcePoints: spec.points.length, orientations: spec.orientations.length,
        relation, resolution: [modelResolution, modelResolution, modelResolution],
        gempyRange: res.rangeUsed ?? null, gempyRangeDefault: res.rangeDefault ?? null,
        gempyRangeMultiplier: rangeMultiplier || null, gempyCO: res.cO ?? null,
        anisotropy: anisotropy.enabled ? { azimuth: anisotropy.azimuth, dip: anisotropy.dip, major: anisotropy.major, semiMajor: anisotropy.semiMajor, minor: anisotropy.minor } : null,
        searchEllipsoid: searchEllipsoid.enabled ? { ...searchEllipsoid } : null,
        domain: clipDomain ? clipDomain.name : (domains.find((d) => d.id === modelDomainId)?.name || null),
        clippedToDomain: !!clipDomain,
        // TASKS.csv #52 (c) — WHICH picks fed this surface, by name. Without it two surfaces modelled
        // from the same logged code (upper vs lower basalt) would carry identical provenance and be
        // indistinguishable a month later.
        interceptSet: activeInterceptSetRef.current ? { name: activeInterceptSetRef.current.name, intercepts: (activeInterceptSetRef.current.ids || []).length } : null,
        extent: extent.map((v) => Math.round(v)),
        generatedAt: new Date().toISOString(),
      };
      setImplicitSurfaces((p) => [...p, { id, name: spec.label, visible: true, vertexCount: surf.vertices.length, faceCount: faces.length, type: spec.type || "other", relationships: [], params }]);
    });
    if (missing.length) setNotices((p) => [...p, `GemPy returned no mesh for: ${missing.join(", ")} (try adding more points or a wider spread of orientations for those).`]);
    if (newMeshes.length) {
      // TASKS.csv #274 — the effective potential-field range is now part of what a run reports. Without
      // it, two runs of the same job that came back looking different had no visible reason why.
      const rangeNote = res.rangeUsed != null
        ? ` Interpolation: ${specs.length > 1 ? (relation === "erode" ? "erosional (each unit truncates those below)" : "conformable (units onlap)") : "single surface"}, potential-field range ${res.rangeUsed.toFixed(3)}${res.rangeDefault != null && Math.abs(res.rangeUsed - res.rangeDefault) > 1e-9 ? ` (GemPy's own default ${res.rangeDefault.toFixed(3)} x ${rangeMultiplier})` : " (GemPy's own default)"}.`
        : "";
      setNotices((p) => [...p, `Added ${newMeshes.length} surface${newMeshes.length > 1 ? "s" : ""}: ${specs.filter((s) => byName[s.meshName]?.vertices?.length).map((s) => `"${s.label}"`).join(", ")}.${rangeNote}`]);
      // Fit the camera to all newly-created meshes together (not just one) — without this, a
      // successful run can be visually indistinguishable from a silent failure: the mesh is added to
      // the scene but the camera doesn't move, so unless it happens to land inside the current view
      // the user sees nothing change and assumes the button did nothing.
      const box = new THREE.Box3();
      newMeshes.forEach((m) => box.expandByObject(m));
      fitBox(box);
    }
  }, [fitBox, setTaskProgress, anisotropy, clipToDomainBoundary, domains, modelDomainId, modelResolution, rangeMultiplier, searchEllipsoid]);

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
    // TASKS.csv #52 (c) — the VEIN layer is listed here too now. #84's exclusions already applied to
    // vein intercepts inside runVeinModel, but the table that exists to review them only ever showed
    // litho and alteration, so a vein pick could be silently excluded by a filter with no UI to see it,
    // and (c)'s named sets could not have contained one at all. Listing it closes both gaps at once.
    [["litho", "Lithology"], ["alt", "Alteration"], ["vein", "Vein / dyke"]].forEach(([layerKey, layerLabel]) => {
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
  }, [layers.litho, layers.alt, layers.vein]);

  // TASKS.csv #176 — `target` is either a raw litho code string (original behavior, unchanged for
  // that case) or a lithology-group object {id, name, color, codes} from store.lithoGroups. Matt:
  // "sometimes a basalt can be logged as andesite in one hole, or a siltstone can be logged as
  // greywacke" — matching by exact string (`r.value === unitName`, the old code) meant two logging
  // conventions for one real unit produced two separate, incomplete surfaces. A group matches any
  // interval (and any drawn section contact) whose code is IN its code set, so every convention's
  // intervals feed ONE surface, named/colored by the group itself.
  const gatherLithoSurfaceSpec = (target, traces, { silent = false } = {}) => {
    const isGroup = typeof target === "object" && target !== null;
    const unitName = isGroup ? target.name : target;
    const codes = new Set(isGroup ? (target.codes || []) : [target]);
    const domain = domains.find((d) => d.id === modelDomainId);
    const points = [];
    traces.forEach((t) => {
      (layers.litho || []).filter((r) => r.hole_id === t.hole_id && codes.has(r.value) && !isNaN(r.from)).forEach((r) => {
        // TASKS.csv #84 — a boundary intercept the user has explicitly reviewed and excluded (via the
        // Boundary intercepts table) never feeds a modelling run, same as if the row didn't exist.
        if (excludedIntercepts.includes(interceptId("litho", r))) return;
        // TASKS.csv #52 (c) — and, when a named intercept set is active, only the picks IN it. This is
        // what lets one repeated unit be modelled as the several surfaces it really is (#61): the upper
        // basalt and the lower basalt are the same logged code, so without this every pick of that code
        // across the property is forced onto one surface no matter how many times the unit repeats.
        if (!interceptInActiveSet(interceptId("litho", r))) return;
        const p = findOnTrace(t.pts, r.from);
        if (p && (!domain || pointInDomain(p, domain, implicitMeshesRef.current))) {
          const api = sceneToApi(p);
          if (softIntercepts.includes(interceptId("litho", r))) api.nugget = SOFT_NUGGET;
          // TASKS.csv #275 — which logged code this point came from, so the group coherence check below
          // can say WHICH codes make up each spatial cluster. Rides along on the point object the same
          // way #88's nugget does; the sidecar's pydantic models ignore fields they don't declare.
          api.srcCode = r.value;
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
          if (!codes.has(c.unit) || !c.isUpperContact) return; // #176 — any member code's contact feeds the group
          (c.points || []).forEach((cp) => {
            const api = { x: cp.x - o.x, y: cp.y - o.y, z: cp.z - o.z, srcCode: c.unit }; // srcCode: TASKS.csv #275
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

    // TASKS.csv #275 — spatial-coherence check on a GROUP's merged codes (raw single codes are exempt:
    // one code modelled on its own producing two clusters is a genuine geological statement — the unit
    // crops out in two places — not a possible data-entry mistake). Link distance is 2.5x the median
    // collar spacing, i.e. "points in neighbouring holes count as connected": below the real hole
    // spacing everything is disconnected, far above it nothing ever is. Warn, never block — a merge
    // spanning two clusters can be perfectly correct, and only the geologist can say. What the notice
    // has to do is make sure the choice was actually SEEN.
    // The rule is deliberately NOT "the group's points form more than one cluster". That was the first
    // version and it was useless: measured against the real 37-hole Harry dataset, a SINGLE code's own
    // top picks (DACT, 88 points) already form 5 clusters at any sane link distance, because drilling
    // happens in fans and sections, not in a continuous blanket. Every group would have warned.
    // What actually distinguishes a mistaken merge is SEGREGATION: two of the group's codes that never
    // once turn up in the same cluster. On the same real data, every genuine code pair tested
    // (DACT+VCL, DACT+SED, CAS+MINT, FINT+VCL, DACT+VCL+FINT, CAS+BSL) has zero segregated pairs at both
    // 2.5x and 4x hole spacing, while a synthetic merge of DACT with a body 3 km away is caught with the
    // separation reported. Zero false positives on the real dataset was the bar this had to clear to be
    // worth showing at all.
    if (isGroup && points.length > 2) {
      const codeCounts = {};
      points.forEach((p) => { if (p.srcCode) codeCounts[p.srcCode] = (codeCounts[p.srcCode] || 0) + 1; });
      // A code contributing one or two intervals is noise (a single mis-logged run), not a second body.
      const liveCodes = Object.keys(codeCounts).filter((c) => codeCounts[c] >= 3);
      if (liveCodes.length > 1) {
        const linkDist = Math.max(25, (medianCollarSpacing(collars) || 60) * 2.5);
        const clusters = spatialClusters(points, linkDist);
        const weightedCentroid = (cs) => {
          const n = cs.reduce((s, c) => s + c.size, 0) || 1;
          return { x: cs.reduce((s, c) => s + c.centroid.x * c.size, 0) / n, y: cs.reduce((s, c) => s + c.centroid.y * c.size, 0) / n, z: cs.reduce((s, c) => s + c.centroid.z * c.size, 0) / n };
        };
        const segregated = [];
        for (let i = 0; i < liveCodes.length; i++) {
          for (let j = i + 1; j < liveCodes.length; j++) {
            const a = liveCodes[i], b = liveCodes[j];
            if (clusters.some((c) => c.codes.includes(a) && c.codes.includes(b))) continue; // they do occur together somewhere
            const ca = weightedCentroid(clusters.filter((c) => c.codes.includes(a)));
            const cb = weightedCentroid(clusters.filter((c) => c.codes.includes(b)));
            segregated.push({ a, b, sep: Math.round(Math.sqrt((ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2 + (ca.z - cb.z) ** 2)) });
          }
        }
        // Deliberately NOT gated on `silent`: that flag exists to keep the stack tool from repeating
        // routine per-unit information, but this is a correctness warning about the surface the user is
        // about to get, and a stack run is exactly where a bad group would otherwise slip past unseen.
        if (segregated.length) {
          const pairs = segregated.slice(0, 3).map((s) => `${s.a} vs ${s.b} (~${s.sep} m apart)`).join(", ");
          setNotices((p) => [...p, `Group "${unitName}" may merge unrelated bodies: ${segregated.length === 1 ? "these codes never" : "some of its codes never"} appear near each other anywhere in the data — ${pairs}${segregated.length > 3 ? ", and others" : ""}. One surface will still be fitted across the gap. Check the group's code list; if they really are one unit in two places, ignore this.`]);
        }
      }
    }

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
    // TASKS.csv #241 — the surface's type now comes from the source litho unit's own role
    // (roleForLithology, src/lib/layers.js) instead of always being hardcoded "stratigraphic_contact",
    // so a surface generated from e.g. "FLT" or a dyke code is correctly tagged fault/dyke rather than
    // silently mislabeled as an ordinary stratigraphic top.
    // TASKS.csv #176 — for a group, the role is the members' shared role when they all agree; if they
    // disagree it falls back to "stratigraphic" (the same default an unlisted raw code already gets)
    // rather than guessing from one member.
    let role;
    if (isGroup) { const roles = new Set([...codes].map(roleForLithology)); role = roles.size === 1 ? [...roles][0] : "stratigraphic"; }
    else role = roleForLithology(unitName);
    const type = role === "overburden" ? "overburden_base" : role === "fault" ? "fault" : role === "dyke" ? "dyke" : role === "breccia" ? "breccia_body" : "stratigraphic_contact";
    // A group's own assignable color drives its surface/legend; falls back to the first member's
    // per-code color if none set. Raw intervals in the 3D log keep their individual code colors.
    const color = isGroup ? (target.color || colorForLithology([...codes][0])) : colorForLithology(unitName);
    return { label: `Top of ${unitName}`, meshName: unitName, points, orientations, color, type };
  };

  const runImplicitModel = useCallback(async (unitName) => {
    if (!unitName) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, "Load collars/survey data before running the implicit model."]); return; }
    // TASKS.csv #176 — a `group:<id>` pick resolves to its group object here; the raw-code path is untouched.
    const target = resolveLithoTarget(unitName);
    if (!target) { setNotices((p) => [...p, "That lithology group no longer exists — pick another unit."]); return; }
    const spec = gatherLithoSurfaceSpec(target, traces);
    if (!spec) return;
    await runSurfaceModel(spec);
  }, [layers.litho, layers.structure, runSurfaceModel, domains, modelDomainId, excludedIntercepts, interceptInActiveSet /* #52 (c) */, searchEllipsoid, softIntercepts, sections, includeSectionContacts, lithoGroups]);

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
      // TASKS.csv #176 — stackUnits carries `group:<id>` keys verbatim; resolve to the group object
      // only here, at the point the spec is actually gathered.
      const target = resolveLithoTarget(u);
      const spec = target ? gatherLithoSurfaceSpec(target, traces, { silent: true }) : null;
      if (spec) specs.push(spec); else skipped.push(target && typeof target === "object" ? target.name : target || "(deleted group)");
    });
    if (skipped.length) setNotices((p) => [...p, `Skipping from the stack (no lithology intervals found): ${skipped.join(", ")}.`]);
    if (specs.length < 2) { setNotices((p) => [...p, "Need at least 2 units with data to model a stack — add more units or check your lithology import."]); return; }

    await runSurfaceStack(specs, { relation: stackRelation }); // TASKS.csv #271
  }, [layers.litho, layers.structure, runSurfaceStack, domains, modelDomainId, excludedIntercepts, interceptInActiveSet /* #52 (c) */, searchEllipsoid, softIntercepts, sections, includeSectionContacts, lithoGroups, stackRelation]);

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

  // Alteration modeling tool. TASKS.csv #272 — REWRITTEN (Leapfrog-specialist review).
  //
  // What this used to do, and why it was wrong: it gathered the alteration intervals' TOP contacts and
  // pushed them through runSurfaceModel — i.e. the same directed, single-polarity, one-sided-contact
  // GemPy machinery the stratigraphic/structural tools use. That machinery models a surface with a
  // coherent "younger above, older below" polarity, fitted through top picks only. An alteration halo
  // has no such polarity: it's a closed 3D envelope around a mineralising conduit whose base is as much
  // part of the body as its top, and it can wrap around, pinch and swell in any direction. The old code
  // did return *a* surface (so nothing looked broken), but it was a draped contact through the tops of
  // the altered intervals, not a halo — a geologist comparing it to the same data in Leapfrog would not
  // recognise the result.
  //
  // What it does now: treats "is this rock altered with this assemblage?" as a 0/1 INDICATOR sampled
  // along every hole that has any alteration logging (1 inside a target-assemblage interval, 0 inside
  // any other logged alteration interval), interpolates that indicator onto a regular grid with the same
  // estimateDenseGrid used by the numeric grade-shell tool, and extracts the 0.5 iso-surface with
  // marching cubes. That produces a genuinely closed envelope with no assumed up-direction — the
  // standard implicit construction for this kind of body, and the fix direction #272 asked for. No
  // GemPy/sidecar involvement any more, so it also runs offline and in a few hundred ms.
  //
  // Deliberate consequences worth knowing: (a) the structure layer no longer feeds this tool, because a
  // dip/azimuth constraint is meaningless for a closed envelope; (b) the search ellipsoid's
  // minimum-neighbour filter no longer applies (it exists to drop under-supported CONTACT picks), but
  // the anisotropy trend IS honoured, by warping into the same normalized space runSurfaceStack uses;
  // (c) the model domain still restricts which sample points are used.
  const runAlterationModel = useCallback((altValue) => {
    if (!altValue) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, "Load collars/survey data before running the alteration model."]); return; }

    const domain = domains.find((d) => d.id === modelDomainId);
    const o = originRef.current;
    const label = `Alteration halo: ${altValue}`;
    setAlterationBusy(true);
    setTaskProgress?.({ label, pct: 20 });
    // Deferred exactly like runNumericModel (see its comment) so the busy state paints before the
    // synchronous grid pass — a timer, not rAF, because rAF never fires in a hidden window.
    setTimeout(() => {
      try {
        const altRows = (layers.alt || []).filter((r) => r.hole_id != null && r.from != null && r.to != null && !isNaN(r.from) && !isNaN(r.to) && Number(r.to) > Number(r.from));
        // TASKS.csv #52 (c) — an active intercept set restricts the TARGET picks only. The zeros (every
        // other logged alteration interval) are what close the envelope (#272), so filtering those by a
        // set the user built to describe the target would open the halo up instead of narrowing it.
        const targetRows = altRows.filter((r) => r.value === altValue && !excludedIntercepts.includes(interceptId("alt", r)) && interceptInActiveSet(interceptId("alt", r)));
        if (!targetRows.length) throw new Error(`No alteration intervals found for "${altValue}" — nothing to model.`);

        // Auto parameters come from the spacing of the holes that actually carry alteration logging,
        // not every collar in the project — a regional hole 5 km away shouldn't set the halo's scale.
        const loggedHoles = new Set(altRows.map((r) => r.hole_id));
        const auto = autoHaloParams(collars.filter((c) => loggedHoles.has(c.hole_id)));
        const radius = alterationSearchRadius > 0 ? alterationSearchRadius : auto.radius;
        const cs = alterationCellSize > 0 ? alterationCellSize : auto.cell;

        // Indicator intervals: 1 inside the target assemblage, 0 inside any other logged alteration.
        // The zeros are what CLOSE the envelope — without a "definitely not altered" sample between two
        // altered holes, an indicator interpolation has nothing pulling it back below 0.5.
        const subLen = Math.max(0.5, cs / 2);
        const intervals = [];
        altRows.forEach((r) => {
          const isTarget = r.value === altValue;
          if (isTarget && excludedIntercepts.includes(interceptId("alt", r))) return; // #84 — reviewed-out intercepts never model
          if (isTarget && !interceptInActiveSet(interceptId("alt", r))) return; // #52 (c) — target picks outside the active set
          splitIntervalForSampling(Number(r.from), Number(r.to), subLen).forEach((seg) => {
            intervals.push({ hole_id: r.hole_id, from: seg.from, to: seg.to, avgGrade: isTarget ? 1 : 0 });
          });
        });
        const { points: worldPts, dropped } = samplePointsFromIntervals(intervals, collars, survey, desurveyHole, desurveyMethod); // #135
        if (!worldPts.length) throw new Error("No alteration sample points could be placed in 3D — check that the logged holes have collars.");

        // World -> api (east, north, up, origin-relative) — the space every spatial control in this
        // module (domain test, anisotropy warp) already speaks.
        let pts = worldPts.map((p) => ({ ...p, x: p.x - o.x, y: p.y - o.y, z: p.z - o.z }));
        if (domain) {
          const before = pts.length;
          pts = pts.filter((p) => pointInDomain(apiToScene([p.x, p.y, p.z]), domain, implicitMeshesRef.current));
          if (pts.length < before) setNotices((q) => [...q, `Domain "${domain.name}": excluded ${before - pts.length} of ${before} alteration sample point(s) outside the domain.`]);
        }
        const insideCount = pts.filter((p) => p.value >= 0.5).length;
        if (!insideCount) throw new Error(domain
          ? `No "${altValue}" intervals fall inside domain "${domain.name}" — nothing to model.`
          : `No "${altValue}" sample points could be placed — nothing to model.`);

        // TASKS.csv #86 — same normalized-space trick runSurfaceStack uses: warp every point into the
        // space where the declared anisotropy ellipsoid is a sphere, grid/isosurface there with an
        // isotropic search, then un-warp the resulting mesh vertices. An isotropic interpolator in
        // warped space IS an anisotropic one in real space.
        const basis = anisotropy.enabled ? searchEllipsoidBasis(anisotropy.azimuth, anisotropy.dip) : null;
        const scl = anisotropy.enabled ? anisoScales(anisotropy) : null;
        const center = anisotropy.enabled
          ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length }
          : null;
        const gridPts = anisotropy.enabled ? pts.map((p) => anisoWarpPoint(p, center, basis, scl)) : pts;

        // Grid extent: the ALTERED points' own box (the zeros only need to be inside the search radius
        // of it, not inside it), padded by the search radius so the envelope has room to close outside
        // the outermost altered sample instead of being cut flat at it.
        const inside = gridPts.filter((p) => p.value >= 0.5);
        const xr = minMax(inside.map((p) => p.x)), yr = minMax(inside.map((p) => p.y)), zr = minMax(inside.map((p) => p.z));
        const pad = radius;
        const bounds = { xmin: xr.min - pad, xmax: xr.max + pad, ymin: yr.min - pad, ymax: yr.max + pad, zmin: zr.min - pad, zmax: zr.max + pad };
        // Keep the grid under estimation.js's MAX_BLOCKS by coarsening rather than throwing: the auto
        // cell size is derived from hole spacing, which says nothing about how BIG the padded box is.
        let cell = cs;
        const cellsAt = (c) => Math.max(1, Math.round((bounds.xmax - bounds.xmin) / c)) * Math.max(1, Math.round((bounds.ymax - bounds.ymin) / c)) * Math.max(1, Math.round((bounds.zmax - bounds.zmin) / c));
        let coarsened = false;
        while (cellsAt(cell) > MAX_BLOCKS * 0.75) { cell *= 1.5; coarsened = true; }

        const grid = estimateDenseGrid(gridPts, {
          bounds, cellSize: { dx: cell, dy: cell, dz: cell }, method: "idw2",
          searchRadius: radius, minSamples: 1, maxSamples: 16, minHoles: 1,
        });
        if (!grid.estimated) throw new Error("No grid cell had an alteration sample within the search radius — increase the search radius.");
        // noData: "outside" — a no-data cell reads as "not altered", which is what lets the envelope
        // close against the edge of the informed region instead of leaving an open shell.
        const mc = marchingCubes(grid.values, grid.nx, grid.ny, grid.nz, 0.5, {
          origin: grid.origin, spacing: grid.cellSize, noData: "outside",
        });
        if (!mc.faces.length) throw new Error(`The interpolated "${altValue}" indicator never crosses 0.5 — no envelope to extract (try a larger search radius or a smaller cell size).`);

        // api (un-warp if needed) -> scene, the same apiToScene every other surface in this module uses.
        const unwarp = anisotropy.enabled ? invScales(scl) : null;
        const pos = new Float32Array(mc.vertices.length * 3);
        mc.vertices.forEach(([ax, ay, az], i) => {
          const a = anisotropy.enabled ? anisoWarpPoint({ x: ax, y: ay, z: az }, center, basis, unwarp) : { x: ax, y: ay, z: az };
          const s = apiToScene([a.x, a.y, a.z]);
          pos[i * 3] = s.x; pos[i * 3 + 1] = s.y; pos[i * 3 + 2] = s.z;
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setIndex(mc.faces.flat());
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colorForAlteration(altValue), side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
        const vol = computeMeshVolume(geo);
        // Same honesty rule as the grade shell (#257): if part of the boundary is the search-radius
        // wall rather than a real 0/1 alteration boundary, the enclosed volume is a parameter choice.
        const closure = mc.closingVertices > 0 ? "artificial" : "natural";
        // TASKS.csv #276 — provenance for this surface, so the panel and every export can stamp it.
        const params = {
          tool: "alteration halo (indicator envelope)", target: altValue, isoLevel: 0.5,
          method: "idw2", searchRadiusM: radius, searchRadiusAuto: !(alterationSearchRadius > 0),
          cellSizeM: cell, cellSizeAuto: !(alterationCellSize > 0), cellSizeCoarsened: coarsened,
          paddingM: pad, closure, holeSpacingM: auto.spacing,
          anisotropy: anisotropy.enabled ? { azimuth: anisotropy.azimuth, dip: anisotropy.dip, major: anisotropy.major, semiMajor: anisotropy.semiMajor, minor: anisotropy.minor } : null,
          domain: domain ? domain.name : null,
          interceptSet: activeInterceptSetRef.current ? { name: activeInterceptSetRef.current.name, intercepts: (activeInterceptSetRef.current.ids || []).length } : null, // TASKS.csv #52 (c)
          samplePoints: pts.length, alteredSamplePoints: insideCount, cellsEstimated: grid.estimated,
          generatedAt: new Date().toISOString(),
        };
        mesh.userData = { tip: `${label}\n${mc.vertices.length} vertices, ${mc.faces.length} faces\nindicator envelope, ${cell.toFixed(1)} m cells, ${Math.round(radius)} m search${vol.watertight ? `\n${vol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³ enclosed` : "\n(open envelope)"}` };
        implicitGroupRef.current?.add(mesh);
        const id = `impl_${Date.now()}_alt_${altValue}`;
        implicitMeshesRef.current[id] = mesh;
        setImplicitSurfaces((p) => [...p, { id, name: label, visible: true, vertexCount: mc.vertices.length, faceCount: mc.faces.length, type: "alteration_envelope", relationships: [], closure, params }]);
        setNotices((p) => [...p, `Added "${label}": ${insideCount} altered of ${pts.length} indicator sample point(s)${dropped ? `, ${dropped} unplaceable` : ""} → ${grid.nx}×${grid.ny}×${grid.nz} grid (${cell.toFixed(1)} m cells${coarsened ? ", coarsened to stay under the grid limit" : ""}, ${Math.round(radius)} m search${anisotropy.enabled ? ", anisotropy applied" : ""}) → ${mc.vertices.length.toLocaleString()} vertices / ${mc.faces.length.toLocaleString()} faces${vol.watertight ? `, closed (${vol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³)` : ", open"}. Closed indicator envelope, not a draped contact — see TASKS.csv #272.`]);
        if (closure === "artificial") setNotices((p) => [...p, `"${label}" closes partly against the search-radius boundary rather than a logged alteration boundary, so its extent there reflects the ${Math.round(radius)} m search radius, not the data.`]);
        fitBox(new THREE.Box3().setFromObject(mesh));
      } catch (e) {
        setNotices((p) => [...p, `Alteration halo failed: ${e.message || e}`]);
      }
      setTaskProgress?.(null);
      setAlterationBusy(false);
    }, 40);
  }, [layers.alt, collars, survey, domains, modelDomainId, excludedIntercepts, interceptInActiveSet /* #52 (c) */, anisotropy, alterationCellSize, alterationSearchRadius, fitBox, setTaskProgress]);

  // TASKS.csv #144 — vein/dyke hangingwall–footwall modelling.
  //
  // Why this is its own tool and not a call into the stack/structural machinery: a vein intercept gives
  // TWO contacts of ONE structure (the from-depth and the to-depth of the logged interval) plus a true
  // thickness between them. The stack tool refuses cross-cutting bodies by design, and the structural
  // tool fits a single self-referential surface, so neither can express "these two surfaces belong
  // together and must stay a consistent thickness apart". The construction — one midplane plus a
  // thickness field, offset by ±t/2 to get the pair — lives in src/lib/vein.js, which documents in full
  // why it was chosen over fitting the two contacts independently (short version: with a positive
  // thickness field the two surfaces CANNOT cross, so negative thickness is impossible by construction
  // rather than something to detect afterwards).
  //
  // Like the alteration halo (#272) this runs entirely in-app — no GemPy/sidecar. GemPy's stratigraphic
  // machinery models a scalar field with an assumed polarity and would have to be run twice, once per
  // contact, with nothing tying the two runs together — exactly the failure mode this row exists to
  // avoid.
  const runVeinModel = useCallback((veinValue) => {
    if (!veinValue) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, "Load collars/survey data before running the vein model."]); return; }
    const o = originRef.current;
    const domain = domains.find((d) => d.id === modelDomainId);
    const label = `Vein: ${veinValue}`;
    setVeinBusy(true);
    setTaskProgress?.({ label, pct: 20 });
    setTimeout(() => {
      try {
        const traceOf = new Map(traces.map((t) => [t.hole_id, t]));
        const rows = (layers.vein || []).filter((r) => r.value === veinValue && r.hole_id != null
          && r.from != null && r.to != null && !isNaN(r.from) && !isNaN(r.to) && Number(r.to) > Number(r.from)
          && !excludedIntercepts.includes(interceptId("vein", r)) // #84 — reviewed-out intercepts never model
          && interceptInActiveSet(interceptId("vein", r))); // #52 (c) — restricted to the active intercept set, if any
        if (!rows.length) throw new Error(`No "${veinValue}" intervals found — nothing to model.`);

        // Both contacts of every intercept, in world ENU (east, north, elevation) — the frame vein.js,
        // trueWidth.js and stereonet.js all speak, so no conversion happens inside the maths.
        const intercepts = [];
        let unplaceable = 0;
        rows.forEach((r) => {
          const t = traceOf.get(r.hole_id);
          if (!t) { unplaceable++; return; }
          const a = findOnTraceWorld(t, Number(r.from));
          const b = findOnTraceWorld(t, Number(r.to));
          if (!a || !b) { unplaceable++; return; }
          intercepts.push({ holeId: r.hole_id, from: Number(r.from), to: Number(r.to),
            hw: { x: a[0], y: a[1], z: a[2] }, fw: { x: b[0], y: b[1], z: b[2] } });
        });
        if (!intercepts.length) throw new Error("No vein intercepts could be located in 3D — check that the logged holes have collars and survey.");

        let used = intercepts;
        if (domain) {
          const inDomain = (p) => pointInDomain(apiToScene([p.x - o.x, p.y - o.y, p.z - o.z]), domain, implicitMeshesRef.current);
          used = intercepts.filter((i) => inDomain(i.hw) || inDomain(i.fw));
          if (used.length < intercepts.length) setNotices((q) => [...q, `Domain "${domain.name}": excluded ${intercepts.length - used.length} of ${intercepts.length} vein intercept(s) outside the domain.`]);
          if (!used.length) throw new Error(`No "${veinValue}" intercepts fall inside domain "${domain.name}" — nothing to model.`);
        }

        const dip = veinDip === "" ? null : Number(veinDip);
        const dipDir = veinDipDir === "" ? null : Number(veinDipDir);
        const model = buildVeinModel(used, {
          cellSize: veinCellSize > 0 ? veinCellSize : 0,
          searchRadius: veinSearchRadius > 0 ? veinSearchRadius : 0,
          ...(Number.isFinite(dip) && Number.isFinite(dipDir) ? { dip, dipDir } : {}),
        });

        const toScene = (p) => apiToScene([p.x - o.x, p.y - o.y, p.z - o.z]);
        const makeMesh = (part, color, opacity) => {
          const pos = new Float32Array(part.positions.length * 3);
          part.positions.forEach((p, i) => { const s = toScene(p); pos[i * 3] = s.x; pos[i * 3 + 1] = s.y; pos[i * 3 + 2] = s.z; });
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          geo.setIndex(part.faces.flat());
          geo.computeVertexNormals();
          return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity }));
        };

        const th = model.thickness, ck = model.checks, pl = model.plane;
        const base = {
          tool: "vein/dyke (midplane + thickness field)", target: veinValue,
          construction: "one midplane surface plus an interpolated TRUE-thickness field, offset by ±t/2 along the reference pole — the hangingwall and footwall are the same structure, so they cannot cross",
          attitudeSource: pl.attitudeSource, dip: pl.dip, dipDir: pl.dipDir,
          rmsOffReferencePlaneM: pl.rmsOffPlane, planarityRatio: pl.planarity,
          intercepts: model.intercepts.length,
          trueThicknessMinM: th.trueMin, trueThicknessMaxM: th.trueMax, trueThicknessMeanM: th.trueMean,
          downholeThicknessMeanM: th.downholeMean, thicknessRefinedToLocalNormal: th.refined,
          cellSizeM: model.grid.cellSize, cellSizeAuto: !(veinCellSize > 0),
          searchRadiusM: model.grid.searchRadius, searchRadiusAuto: !(veinSearchRadius > 0),
          gridCoarsened: model.grid.coarsened, informedNodes: model.grid.informedNodes,
          contactResidualRmsM: ck.contactResidualRms, contactResidualMaxM: ck.contactResidualMax,
          midplaneLooRmsM: ck.midplaneLooRms, midplaneLooMaxM: ck.midplaneLooMax, incoherentSheet: ck.incoherentSheet,
          minSeparationM: ck.minSeparation, nonCrossingByConstruction: true, pinchOut: ck.pinchOut,
          nominalHwFwLabels: ck.nominalLabels,
          domain: domain ? domain.name : null,
          interceptSet: activeInterceptSetRef.current ? { name: activeInterceptSetRef.current.name, intercepts: (activeInterceptSetRef.current.ids || []).length } : null, // TASKS.csv #52 (c)
          generatedAt: new Date().toISOString(),
        };
        const stamp = (part, suffix, color, opacity, type, relationships = []) => {
          const mesh = makeMesh(part, color, opacity);
          const vol = computeMeshVolume(mesh.geometry);
          mesh.userData = { tip: `${label} — ${suffix}\n${part.positions.length} vertices, ${part.faces.length} faces` };
          implicitGroupRef.current?.add(mesh);
          const id = `impl_${Date.now()}_vein_${suffix}_${Math.random().toString(36).slice(2, 7)}`;
          implicitMeshesRef.current[id] = mesh;
          setImplicitSurfaces((p) => [...p, { id, name: `${label} — ${suffix}`, visible: true,
            vertexCount: part.positions.length, faceCount: part.faces.length, type,
            relationships, params: { ...base, part: suffix } }]);
          return { id, vol };
        };
        // Footwall first, so the hangingwall can be created already declaring "is above" it — the
        // relationship #90's topology checker reads. The construction makes that true by definition;
        // declaring it means the checker can independently confirm it rather than take it on trust.
        const fwSurf = stamp(model.footwall, "footwall", 0x3d8ecf, 0.75, "vein_footwall");
        // Only declared for a vein flat enough for "above" to mean something VERTICALLY, which is how
        // topology.js's sidedness check reads it. On a near-vertical vein the two walls barely overlap
        // in plan and "above" would be a meaningless (and possibly falsely violated) claim.
        const aboveRel = pl.dip <= 75 ? [{ relation: "above", targetId: fwSurf.id }] : [];
        stamp(model.hangingwall, "hangingwall", 0xe08a3c, 0.75, "vein_hangingwall", aboveRel);
        const solidVol = stamp(model.solid, "solid", 0xb5477e, 0.45, "vein_solid").vol;

        const fmt = (n, d = 2) => Number(n).toFixed(d);
        setNotices((p) => [...p, `Added "${label}": ${model.intercepts.length} paired intercept(s)${unplaceable ? `, ${unplaceable} unplaceable` : ""} → midplane ${fmt(pl.dip, 1)}° / ${fmt(pl.dipDir, 1)}° (${pl.attitudeSource}), TRUE thickness ${fmt(th.trueMin)}–${fmt(th.trueMax)} m (mean ${fmt(th.trueMean)} m; mean DOWNHOLE length ${fmt(th.downholeMean)} m)${th.refined ? ", thickness corrected against the local modelled normal" : ""} → ${model.grid.nu}×${model.grid.nv} grid, ${model.grid.informedNodes.toLocaleString()} informed nodes, ${fmt(model.grid.cellSize, 1)} m cells, ${fmt(model.grid.searchRadius, 0)} m search${model.grid.coarsened ? " (coarsened to stay under the grid limit)" : ""}${solidVol?.watertight ? `. Solid ${solidVol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³` : ""}.`]);
        setNotices((p) => [...p, `"${label}": hangingwall and footwall are offset ±half the interpolated thickness from one shared midplane, so they cannot cross — minimum modelled thickness ${fmt(ck.minSeparation, 3)} m${ck.pinchOut ? " (the vein pinches out to zero somewhere in the model)" : ""}. Modelled contacts sit ${fmt(ck.contactResidualRms, 2)} m RMS (max ${fmt(ck.contactResidualMax, 2)} m) from the logged ones — measured AT the intercepts, where an inverse-distance field nearly reproduces its own data, so a small number here says the pair honours the logging, not that the shape between holes is right.${pl.rmsOffPlane != null ? ` The intercept midpoints scatter ${fmt(pl.rmsOffPlane, 1)} m RMS off a single plane, so the ${fmt(pl.dip, 0)}°/${fmt(pl.dipDir, 0)}° figure is a reference attitude, not a measurement of one continuous surface.` : ""}`]);
        setNotices((p) => [...p, `A vein fitted from ${model.intercepts.length} intercept(s) is an interpretation, not a measurement: away from the holes its shape, its thickness and its extent are the interpolation's, not the data's. Thickness between holes is interpolated, so a pinch-out or a swell that no hole cut will not appear.`]);
        if (pl.attitudeSource === "fitted to intercept midpoints" && pl.planarity != null && pl.planarity > 0.15) setNotices((p) => [...p, `"${label}": the intercept midpoints are not very planar (out-of-plane spread is ${Math.round(pl.planarity * 100)}% of their in-plane spread), so the fitted ${fmt(pl.dip, 0)}°/${fmt(pl.dipDir, 0)}° reference attitude is a weak average — consider entering the vein's dip and dip direction instead.`]);
        // A hole that logs one vein logs it ONCE. Many intercepts per hole means this code is a vein
        // SET (sheeted veinlets, a stockwork), and a single hangingwall/footwall pair is then the
        // envelope of the set at best — worth saying out loud, because the result still looks like a
        // confident single structure on screen.
        if (ck.midplaneLooRms != null) setNotices((p) => [...p, `"${label}": leave-one-out cross-validation — dropping each intercept and predicting it from the others misses by ${fmt(ck.midplaneLooRms, 1)} m RMS (worst ${fmt(ck.midplaneLooMax, 1)} m) against a ${fmt(model.grid.searchRadius, 0)} m search radius.${ck.incoherentSheet ? " That is no better than guessing at this hole spacing: these intercepts are NOT behaving like one continuous sheet, and a single hangingwall/footwall pair is the wrong picture for them." : ""}`]);
        const holeCount = new Set(used.map((i) => i.holeId)).size;
        if (holeCount && used.length / holeCount > 2.5) setNotices((p) => [...p, `"${label}": ${used.length} intercepts in ${holeCount} hole(s) — about ${(used.length / holeCount).toFixed(1)} per hole. A single vein is cut once per hole, so this code is behaving like a vein SET or stockwork; the pair below is the average envelope of all of them, not one vein. To model one vein, log or filter it as its own code.`]);
        if (ck.nominalLabels) setNotices((p) => [...p, `"${label}" is near-vertical (${fmt(pl.dip, 0)}° dip), so "hangingwall" and "footwall" are nominal labels here — the two surfaces are simply the two walls of the structure.`]);
        const meshes = Object.values(implicitMeshesRef.current);
        if (meshes.length) fitBox(new THREE.Box3().setFromObject(meshes[meshes.length - 1]));
      } catch (e) {
        setNotices((p) => [...p, `Vein model failed: ${e.message || e}`]);
      }
      setTaskProgress?.(null);
      setVeinBusy(false);
    }, 40);
  }, [layers.vein, domains, modelDomainId, excludedIntercepts, interceptInActiveSet /* #52 (c) */, veinDip, veinDipDir, veinCellSize, veinSearchRadius, fitBox, setTaskProgress]);

  // TASKS.csv #142 — numeric (continuous-variable) implicit model: a grade-shell wireframe built
  // DIRECTLY from assay values, no GemPy/sidecar involved. Every other tool above keys off categorical
  // litho/alt/structure codes; this is the "Au > 1 g/t envelope" Leapfrog users expect. Pipeline, all
  // client-side and synchronous: (1) composite (optional, same compositeDownhole call as
  // GradeEstimationModal) -> (2) samplePointsFromIntervals desurveys every interval midpoint into world
  // space -> (3) estimateDenseGrid IDW/NN-interpolates a regular lattice (NaN where no sample is in
  // range) -> (4) marchingCubes extracts the cutoff iso-surface -> (5) world->scene via originRef.current
  // (scene x = east offset, y = elevation offset, z = -(north offset) — same map every other geometry in
  // this file uses) -> (6) registered into implicitMeshesRef/implicitSurfaces exactly like a GemPy
  // surface, so volume/tonnage (#140), OBJ/DXF/glTF export (#143), relationships and domain clipping all
  // work on it with no separate code path. Deferred via a short setTimeout so the busy state paints
  // before the (potentially few-hundred-ms) main-thread loop — same idea as GradeEstimationModal's
  // requestAnimationFrame deferral, but a timer rather than rAF because rAF never fires while the
  // window/tab is hidden (caught during #142's own live verification: the run sat on "Running…"
  // forever in a background preview tab), which would silently strand a run started right before
  // the user alt-tabs away.
  const runNumericModel = useCallback(() => {
    const symbol = numericSymbol || assayElements[0]?.symbol;
    if (!symbol) { setNotices((p) => [...p, "No assay elements loaded — import assays before running the numeric model."]); return; }
    if (!collars.length) { setNotices((p) => [...p, "Load collars/survey data before running the numeric model."]); return; }
    if (!Number.isFinite(numericCutoff)) { setNotices((p) => [...p, "Enter a numeric cutoff grade."]); return; }
    const elementUnits = Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit]));
    const unit = elementUnits[symbol] || "ppm";
    const label = `${symbol} > ${numericCutoff} ${unit} shell`;
    setNumericBusy(true);
    setTaskProgress?.({ label, pct: 20 });
    setTimeout(() => {
      try {
        // TASKS.csv #266 — QC inserts (standards/blanks/duplicates) are excluded by default here, the
        // same as Best Intercepts / Compositing / Grade Statistics already do. They used to reach the
        // grade shell unfiltered; most got dropped downstream only because their synthetic hole_id has
        // no collar, which is luck rather than design — a field duplicate logged under its PARENT
        // hole's id was genuinely double-counted.
        const srcAssays = numericIncludeQAQC ? assays : excludeQAQC(assays);
        let intervals;
        if (numericUseComposites) {
          // TASKS.csv #259 — high-grade capping. compositeDownhole has always accepted capValue and
          // applied it per RAW sample before length-weighted averaging (the correct order), but only
          // CompositingModal ever passed it: the grade shell composited uncapped, so one bonanza Au
          // assay drove IDW² across its whole search neighbourhood.
          intervals = compositeDownhole(srcAssays, symbol, unit, elementUnits, {
            length: numericCompositeLength, minCoverage: numericMinCoverage, // TASKS.csv #262 — was hardcoded 0.5
            capValue: Number.isFinite(numericCapValue) && numericCapValue > 0 ? numericCapValue : null,
          });
        } else {
          const cap = Number.isFinite(numericCapValue) && numericCapValue > 0 ? numericCapValue : null;
          intervals = srcAssays
            .filter((a) => a.hole_id != null && a.from != null && a.to != null)
            .map((a) => ({ hole_id: a.hole_id, from: a.from, to: a.to, avgGrade: a.values?.[symbol] != null ? a.values[symbol] : null }))
            .filter((iv) => iv.avgGrade != null)
            .map((iv) => (cap != null && iv.avgGrade > cap ? { ...iv, avgGrade: cap } : iv));
        }
        const { points: rawPoints, dropped, clamped } = samplePointsFromIntervals(intervals, collars, survey, desurveyHole, desurveyMethod); // #135
        if (!rawPoints.length) throw new Error("No sample points could be placed in 3D — check that holes have collars and (ideally) survey data.");
        // TASKS.csv #273 — this tool used to ignore the model domain and the anisotropy trend entirely,
        // so a user who had set up either for the categorical tools silently got neither here. The
        // domain now restricts which samples inform the shell (same rule the categorical tools apply to
        // their control points), and the anisotropy trend is honoured by the same warp-grid-unwarp trick
        // runSurfaceStack/the alteration halo use. The search ellipsoid's minimum-neighbour filter is
        // still deliberately NOT applied: it exists to drop under-supported CONTACT picks, and dropping
        // isolated assay samples would quietly delete grade from a shell rather than improve it.
        const gradeDomain = domains.find((d) => d.id === modelDomainId);
        let points = rawPoints;
        if (gradeDomain) {
          const o0 = originRef.current;
          points = rawPoints.filter((p) => pointInDomain({ x: p.x - o0.x, y: p.z - o0.z, z: -(p.y - o0.y) }, gradeDomain, implicitMeshesRef.current));
          if (!points.length) throw new Error(`No assay sample points fall inside domain "${gradeDomain.name}" — nothing to model.`);
          if (points.length < rawPoints.length) setNotices((q) => [...q, `Domain "${gradeDomain.name}": excluded ${rawPoints.length - points.length} of ${rawPoints.length} assay sample point(s) outside the domain.`]);
        }
        const above = points.filter((p) => p.value >= numericCutoff).length;
        if (!above) throw new Error(`None of the ${points.length} sample points reach the ${numericCutoff} ${unit} cutoff — nothing to enclose. Lower the cutoff.`);

        // TASKS.csv #273/#86 — anisotropy: warp every sample into the space where the declared ellipsoid
        // is a sphere, grid and iso-surface there with the isotropic search this tool already does, then
        // un-warp the mesh vertices. World coordinates are (east, north, up), the same axis order
        // searchEllipsoidBasis/anisoWarpPoint are defined in, and the warp is centred on the samples'
        // own centroid, so it can be applied to world coordinates directly with no api round-trip.
        const gsBasis = anisotropy.enabled ? searchEllipsoidBasis(anisotropy.azimuth, anisotropy.dip) : null;
        const gsScl = anisotropy.enabled ? anisoScales(anisotropy) : null;
        const gsCenter = anisotropy.enabled
          ? { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length, z: points.reduce((s, p) => s + p.z, 0) / points.length }
          : null;
        const gridPoints = anisotropy.enabled ? points.map((p) => anisoWarpPoint(p, gsCenter, gsBasis, gsScl)) : points;

        // Grid extent: the sample points' own bounding box plus padding (not the collar box — assays
        // define where a grade shell can exist, and padding lets the shell close beyond the last hole).
        const xr = minMax(gridPoints.map((p) => p.x)), yr = minMax(gridPoints.map((p) => p.y)), zr = minMax(gridPoints.map((p) => p.z));
        const pad = Math.max(0, numericPadding);
        const bounds = { xmin: xr.min - pad, xmax: xr.max + pad, ymin: yr.min - pad, ymax: yr.max + pad, zmin: zr.min - pad, zmax: zr.max + pad };
        const cs = Math.max(0.5, numericCellSize);
        // TASKS.csv #292 — the search radius is never allowed to be unbounded any more. An unlimited
        // search made every sample a candidate for every cell: measured at 62,500 cells x 5,000 points
        // that is 81 s of blocked main thread (250 s at the MAX_BLOCKS cap), versus 0.2 s with a real
        // radius and the new spatial index. "Unlimited" is capped to the grid's own diagonal, which is
        // a mathematical no-op (no cell can be further than the diagonal from any in-grid sample) for
        // small projects and a genuine bound for large ones.
        const gridDiagonal = Math.sqrt(
          (bounds.xmax - bounds.xmin) ** 2 + (bounds.ymax - bounds.ymin) ** 2 + (bounds.zmax - bounds.zmin) ** 2
        );
        const effectiveRadius = numericSearchRadius > 0 ? numericSearchRadius : gridDiagonal;
        const grid = estimateDenseGrid(gridPoints, {
          bounds, cellSize: { dx: cs, dy: cs, dz: cs }, method: numericMethod,
          searchRadius: effectiveRadius, minSamples: 1, maxSamples: 16,
          minHoles: Math.max(1, numericMinHoles), // TASKS.csv #258
          support: true, // TASKS.csv #91/#92 — classify every grid node so the shell can be coloured by it
        });
        if (!grid.estimated) throw new Error(numericMinHoles > 1
          ? `No grid cell had samples from at least ${numericMinHoles} distinct holes within the search radius — widen the search, or lower "Min holes".`
          : "No grid cell had a sample within the search radius — widen it.");
        const mc = marchingCubes(grid.values, grid.nx, grid.ny, grid.nz, numericCutoff, {
          origin: grid.origin, spacing: grid.cellSize, noData: numericCloseShell ? "outside" : "skip",
        });
        if (!mc.faces.length) throw new Error(`The interpolated ${symbol} grid never crosses ${numericCutoff} ${unit} — no shell to extract (try a lower cutoff, a larger search radius, or a smaller cell size).`);

        const o = originRef.current;
        const pos = new Float32Array(mc.vertices.length * 3);
        const gsUnwarp = anisotropy.enabled ? invScales(gsScl) : null; // TASKS.csv #273 — undo the warp above
        mc.vertices.forEach((v, i) => {
          const [wx, wy, wz] = anisotropy.enabled
            ? (() => { const u = anisoWarpPoint({ x: v[0], y: v[1], z: v[2] }, gsCenter, gsBasis, gsUnwarp); return [u.x, u.y, u.z]; })()
            : v;
          pos[i * 3] = wx - o.x; pos[i * 3 + 1] = wz - o.z; pos[i * 3 + 2] = -(wy - o.y);
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setIndex(mc.faces.flat());
        geo.computeVertexNormals();
        // TASKS.csv #91 — per-vertex data-support colour, computed here and cached on the geometry as a
        // standard "color" attribute so the sidebar toggle is a one-line material flip rather than a
        // second interpolation pass. Every marching-cubes vertex lies on a grid EDGE, so it is looked up
        // at the nearest grid node — the same lattice the value it sits on came from, in the same
        // (possibly anisotropy-warped) space, since this runs on the pre-unwarp vertex `v`.
        // Green = interpolated (bracketed by composites from >= 2 holes), amber = extrapolated (a real
        // estimate, but all the informing data lies to one side), red = unsupported.
        const supColors = new Float32Array(mc.vertices.length * 3);
        const surfCounts = { interpolated: 0, extrapolated: 0, unsupported: 0 };
        if (grid.supportCode) {
          const rgb = {};
          Object.entries(SUPPORT_COLORS).forEach(([k, hex]) => { const c = new THREE.Color(hex); rgb[k] = [c.r, c.g, c.b]; });
          const clampI = (n, hi) => (n < 0 ? 0 : n > hi ? hi : n);
          const NAMES = ["unsupported", "extrapolated", "interpolated"];
          mc.vertices.forEach((v, i) => {
            const gx = clampI(Math.round((v[0] - grid.origin.x) / grid.cellSize.dx), grid.nx - 1);
            const gy = clampI(Math.round((v[1] - grid.origin.y) / grid.cellSize.dy), grid.ny - 1);
            const gz = clampI(Math.round((v[2] - grid.origin.z) / grid.cellSize.dz), grid.nz - 1);
            const name = NAMES[grid.supportCode[gx + grid.nx * (gy + grid.ny * gz)]] || "unsupported";
            surfCounts[name]++;
            const c = rgb[name];
            supColors[i * 3] = c[0]; supColors[i * 3 + 1] = c[1]; supColors[i * 3 + 2] = c[2];
          });
          geo.setAttribute("color", new THREE.BufferAttribute(supColors, 3));
        }
        const mat = new THREE.MeshLambertMaterial({ color: 0xe2a63c, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
        const mesh = new THREE.Mesh(geo, mat);
        const vol = computeMeshVolume(geo);
        // TASKS.csv #257 - record HOW this shell closed. "artificial" means part of its boundary is the
        // search-radius wall (marching cubes placed vertices on no-data edges), not a grade boundary:
        // the enclosed volume is then a function of the search radius, not only of the data (volume
        // scales roughly as R^3 - 25 m radius gave 67,750 m3 on one sample point, 100 m gave 4,188,833).
        // The UI must not report that as a measured volume, and the old !watertight-only caution never
        // fired for it because an artificially closed shell IS watertight.
        const closure = numericCloseShell && mc.closingVertices > 0 ? "artificial" : "natural";
        // TASKS.csv #270 (LOW-2) - mean interpolated grade of the cells the shell encloses. Without it
        // the only grade a user has to pair with the tonnage is the CUTOFF, which is exactly how
        // "X tonnes at Y g/t" gets quoted wrong. Cells are equal volume, so a plain mean over the
        // at/above-cutoff cells IS the volume-weighted mean.
        let gradeSum = 0, gradeCells = 0;
        for (let i = 0; i < grid.values.length; i++) {
          const gv = grid.values[i];
          if (Number.isFinite(gv) && gv >= numericCutoff) { gradeSum += gv; gradeCells++; }
        }
        const meanGradeInShell = gradeCells > 0 ? gradeSum / gradeCells : null;
        // TASKS.csv #270 (LOW-3) / #269 - the parameter block that produced this surface, kept ON the
        // surface so the panel can show it and every export can stamp it. A tonnage with no record of
        // the cutoff/method/radius/cell size/closure mode behind it can't be reproduced or audited.
        const params = {
          tool: "numeric grade shell", element: symbol, unit, cutoff: numericCutoff,
          method: numericMethod, searchRadiusM: effectiveRadius,
          searchRadiusWasUnlimited: !(numericSearchRadius > 0),
          cellSizeM: cs, paddingM: pad, closure,
          composited: numericUseComposites, compositeLengthM: numericUseComposites ? numericCompositeLength : null,
          minCoverage: numericUseComposites ? numericMinCoverage : null, // TASKS.csv #262
          capValue: Number.isFinite(numericCapValue) && numericCapValue > 0 ? numericCapValue : null,
          minHoles: Math.max(1, numericMinHoles), includeQAQC: numericIncludeQAQC,
          // TASKS.csv #273 — the shared controls this tool now honours, recorded like every other param.
          anisotropy: anisotropy.enabled ? { azimuth: anisotropy.azimuth, dip: anisotropy.dip, major: anisotropy.major, semiMajor: anisotropy.semiMajor, minor: anisotropy.minor } : null,
          domain: gradeDomain ? gradeDomain.name : null,
          samplePoints: points.length, cellsEstimated: grid.estimated,
          singleHoleCells: grid.singleHoleCells, meanGradeInShell,
          // TASKS.csv #91/#92 — grid-wide classification, and the same classification restricted to the
          // shell's own surface. The second is the one that matters for a reported volume: it says what
          // fraction of the BOUNDARY is bracketed by data rather than carried out beyond it.
          supportCounts: grid.supportCounts, surfaceSupportCounts: surfCounts,
          generatedAt: new Date().toISOString(),
        };
        mesh.userData = { tip: `${label}\n${mc.vertices.length} vertices, ${mc.faces.length} faces\n${numericMethod.toUpperCase()} on ${points.length} points, ${cs} m cells${vol.watertight ? `\n${vol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³ enclosed${closure === "artificial" ? " (artificially closed — see panel)" : ""}` : "\n(open shell)"}` };
        implicitGroupRef.current?.add(mesh);
        const id = `impl_${Date.now()}_numeric_${symbol}`;
        implicitMeshesRef.current[id] = mesh;
        setImplicitSurfaces((p) => [...p, { id, name: label, visible: true, vertexCount: mc.vertices.length, faceCount: mc.faces.length, type: "mineralization_envelope", relationships: [], closure, params, surfaceSupportCounts: surfCounts, supportColored: false }]); // surfaceSupportCounts/supportColored: TASKS.csv #91
        setNotices((p) => [...p, `Added "${label}": ${points.length} sample point${points.length === 1 ? "" : "s"} (${intervals.length} ${numericUseComposites ? `${numericCompositeLength} m composite` : "raw interval"}${intervals.length === 1 ? "" : "s"}, ${dropped} dropped, ${above} at/above cutoff${clamped ? `, ${clamped} negative grade${clamped === 1 ? "" : "s"} clamped to zero` : ""}) → ${grid.nx}×${grid.ny}×${grid.nz} grid (${grid.estimated.toLocaleString()} cells estimated, ${grid.skipped.toLocaleString()} outside the search radius${grid.singleHoleCells ? `, ${grid.singleHoleCells.toLocaleString()} informed by only ONE hole` : ""}) → ${mc.vertices.length.toLocaleString()} vertices / ${mc.faces.length.toLocaleString()} faces${vol.watertight ? `, closed (${vol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³)` : `, open (${vol.openEdgeCount} open edges — shell reaches the edge of the estimated region)`}. Exploration target volume only — not a Mineral Resource.`]);
        // TASKS.csv #91/#92 — say what the model is actually supported by, for the whole grid and for
        // the shell surface itself, and point at the sidebar toggle that draws it.
        if (grid.supportCounts) setNotices((p) => [...p, `"${label}" data support — grid: ${summarizeSupport(grid.supportCounts)}. Shell surface vertices: ${summarizeSupport(surfCounts)}. Only "interpolated" means the composites that produced that part of the shell bracket it on all three axes from at least two holes; everything else is grade carried outward from the data. Expand the surface in the list and use "Colour by data support" to see where. This is a geometric data-support measure, NOT a statistical confidence or a kriging variance.`]);
        if (closure === "artificial") setNotices((p) => [...p, `"${label}" was closed ARTIFICIALLY at the search-radius boundary (${mc.closingVertices.toLocaleString()} of its vertices sit on that wall, not on a grade boundary). Its volume depends on your search radius, not only on the data — doubling the radius roughly multiplies the volume by eight. Treat it as a visualisation of where grades might extend, not a measured volume.`]);
        fitBox(new THREE.Box3().setFromObject(mesh));
      } catch (e) {
        setNotices((p) => [...p, `Numeric model failed: ${e.message || e}`]);
      }
      setTaskProgress?.(null);
      setNumericBusy(false);
    }, 40);
  }, [numericSymbol, assayElements, assays, collars, survey, numericCutoff, numericCellSize, numericSearchRadius, numericMethod, numericUseComposites, numericCompositeLength, numericMinCoverage, numericCloseShell, numericPadding, numericCapValue, numericMinHoles, numericIncludeQAQC, fitBox, setTaskProgress, anisotropy, domains, modelDomainId]); // anisotropy/domains/modelDomainId: TASKS.csv #273

  // TASKS.csv #148 — import an existing solid/wireframe (pit shell, stope design, someone else's
  // modelled domain) and overlay it against the drillholes and GeoStrix's own generated surfaces.
  //
  // Registered into implicitMeshesRef/implicitSurfaces exactly like a generated surface, deliberately:
  // that single decision is what makes an imported solid behave like every other scene object with no
  // parallel code path — show/hide, remove, the surface list, the distance/inside query (#146),
  // volumetrics (#140), domain clipping and OBJ/DXF/glTF re-export all already operate on that list.
  //
  // `type: "imported"` and a params block marked `tool: "imported solid"` keep it honest in the two
  // places it matters: the surface list shows what it is, and #269's export provenance stamp records
  // that this geometry came from a file rather than from any GeoStrix calculation — an imported pit
  // shell re-exported six months later must not read as something this app modelled.
  const importSolidRef = useRef(null);
  const importSolidFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const solid = parseSolidFile(file.name, text);
      const bounds = solidBounds(solid.vertices);
      const o = originRef.current;
      // World (easting, northing, elevation) -> scene, the exact inverse of meshExport.js's
      // sceneVertsToWorld (scene x = east offset, y = elevation offset, z = -(north offset)).
      const sceneVerts = solid.vertices.map(([e, n, z]) => [e - o.x, z - o.z, o.y - n]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(sceneVerts.flat(), 3));
      geo.setIndex(solid.indices);
      geo.computeVertexNormals();
      // Wireframe-ish translucent grey, visually distinct from the gold/coloured generated surfaces —
      // an imported reference shape should not look like something this app modelled.
      const mat = new THREE.MeshLambertMaterial({ color: 0x8fa3b8, side: THREE.DoubleSide, transparent: true, opacity: 0.45 });
      const mesh = new THREE.Mesh(geo, mat);
      const label = file.name.replace(/\.(dxf|obj)$/i, "");
      mesh.userData = { tip: `${label} (imported ${solid.format})\n${solid.vertices.length} vertices, ${solid.triangleCount} triangles` };
      implicitGroupRef.current?.add(mesh);
      const id = `impl_${Date.now()}_imported`;
      implicitMeshesRef.current[id] = mesh;
      setImplicitSurfaces((p) => [...p, {
        id, name: `${label} (imported)`, visible: true,
        vertexCount: solid.vertices.length, faceCount: solid.triangleCount,
        type: "imported", relationships: [], closure: null,
        params: {
          tool: "imported solid", sourceFile: file.name, format: solid.format,
          detail: solid.note, vertices: solid.vertices.length, triangles: solid.triangleCount,
          crsAssumed: project?.epsg ? `assumed already in EPSG:${project.epsg}` : "assumed already in the project CRS",
          importedAt: new Date().toISOString(),
        },
      }]);
      const bb = bounds
        ? ` Extent: E ${bounds.min.x.toFixed(0)}–${bounds.max.x.toFixed(0)}, N ${bounds.min.y.toFixed(0)}–${bounds.max.y.toFixed(0)}, Z ${bounds.min.z.toFixed(0)}–${bounds.max.z.toFixed(0)}.`
        : "";
      setNotices((p) => [...p, `Imported "${file.name}" as a solid: ${solid.vertices.length.toLocaleString()} vertices / ${solid.triangleCount.toLocaleString()} triangles (${solid.format}, ${solid.note}). It appears under Generated surfaces with the same show/hide, remove and query controls.${bb} Coordinates are used AS-IS — a DXF/OBJ carries no CRS, so GeoStrix does not reproject it; if it lands away from your holes, the file is in a different CRS.`]);
      fitBox(new THREE.Box3().setFromObject(mesh));
    } catch (e) {
      setNotices((p) => [...p, `${file.name}: couldn't import as a solid (${e.message || e}).`]);
    }
  }, [fitBox, project?.epsg]);

  const toggleImplicitSurface = useCallback((id) => {
    setImplicitSurfaces((p) => p.map((s) => {
      if (s.id !== id) return s;
      const mesh = implicitMeshesRef.current[id];
      if (mesh) mesh.visible = !s.visible;
      return { ...s, visible: !s.visible };
    }));
  }, []);
  // TASKS.csv #91/#92 — flip a generated surface between its normal appearance and its data-support
  // colouring. The per-vertex colours were computed once at generation time and cached on the geometry
  // as the "color" attribute, so this is only a material flag: setting vertexColors makes three.js
  // multiply the material colour by the attribute, hence white as the base so the class colour shows
  // through unchanged. Reverting restores the original material colour, kept on the mesh's userData.
  const toggleSurfaceSupportColors = useCallback((id) => {
    setImplicitSurfaces((p) => p.map((s) => {
      if (s.id !== id) return s;
      const mesh = implicitMeshesRef.current[id];
      if (!mesh || !mesh.geometry?.getAttribute?.("color")) return s;
      const on = !s.supportColored;
      if (on) {
        if (mesh.userData.baseColorHex == null) mesh.userData.baseColorHex = mesh.material.color.getHex();
        mesh.material.vertexColors = true;
        mesh.material.color.set(0xffffff);
      } else {
        mesh.material.vertexColors = false;
        mesh.material.color.setHex(mesh.userData.baseColorHex != null ? mesh.userData.baseColorHex : 0xe2a63c);
      }
      mesh.material.needsUpdate = true;
      return { ...s, supportColored: on };
    }));
  }, []);
  const removeImplicitSurface = useCallback((id) => {
    const mesh = implicitMeshesRef.current[id];
    if (mesh) { implicitGroupRef.current?.remove(mesh); mesh.geometry?.dispose?.(); mesh.material?.dispose?.(); delete implicitMeshesRef.current[id]; }
    // TASKS.csv #83 — drop any relationship pointing AT the surface being removed too, so the
    // remaining surfaces don't end up referencing a dangling id.
    // TASKS.csv #93 — and HEAL THE VERSION CHAIN in the same pass: if the removed surface was a middle
    // version, its successor's `supersedes` would point at nothing, so re-point it at the removed
    // surface's own predecessor and v1 -> v3 stays one lineage instead of silently splitting in two.
    // (surfaceVersions.buildLineages already survives a dangling pointer without losing a surface —
    // this is about keeping the lineage the user built, not about avoiding a crash.) Done as ONE
    // updater rather than the two chained ones this used to be, because the healing step has to read
    // the removed surface's own `supersedes` while it is still in the list.
    setImplicitSurfaces((p) => {
      const goneParent = p.find((s) => s.id === id)?.supersedes || null;
      return p.filter((s) => s.id !== id).map((s) => {
        const next = { ...s, relationships: (s.relationships || []).filter((r) => r.targetId !== id) };
        if (next.supersedes === id) {
          if (goneParent) next.supersedes = goneParent; else delete next.supersedes;
        }
        return next;
      });
    });
  }, []);
  // TASKS.csv #83 — surface type + declared relationships (geological-architecture layer 2). Purely
  // metadata until #90's checker reads it (see the long comment above SURFACE_TYPES/RELATION_TYPES).
  // TASKS.csv #52 — type and relationships now persist with the surface itself, so a relationship
  // declared today is still there (and still checkable) after a restart.
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

  // ---------- TASKS.csv #93 — ITERATIVE MODELLING WORKFLOW (versioned runs / compare / accept) ----------
  //
  // Every modelling tool above already PUSHES a new surface rather than overwriting the previous one,
  // so two runs are already two independent, independently-persisted surfaces. The only thing missing
  // was the link saying one descends from the other — that is `supersedes`, a plain id on the surface.
  // See src/lib/surfaceVersions.js for the full reasoning on why a flat link beats a nested `versions`
  // array here (short version: a mesh nested inside another surface would be hydrated by nothing, so
  // an old version could not be drawn, zoomed to, exported or compared without a second code path).
  //
  // NOTHING BELOW EVER DELETES A RUN. Retention is uncapped on purpose — the same trade #52 made for
  // persistence ("silently dropping a surface on save is worse than a large file"). Accept HIDES the
  // superseded versions; removing one stays the explicit X the user already has.
  //
  // Both `supersedes` and `accepted` ride through the #52 save path for free: hydration spreads
  // `...meta` off the persisted object and the sync-out effect spreads `...s` back, so no change to
  // store.jsx or to either of those effects was needed to make versions round-trip.
  const setSurfaceSupersedes = useCallback((id, targetId) => {
    setImplicitSurfaces((p) => p.map((s) => {
      if (s.id !== id) return s;
      if (!targetId) { const { supersedes: _drop, ...rest } = s; return rest; }
      return { ...s, supersedes: targetId };
    }));
  }, []);

  // "Accept this version": a label saying which run the user is working from — NOT a claim that the
  // run is correct. It flags one surface in the lineage and hides (never removes) the others, so the
  // scene shows the accepted interpretation without the earlier attempts disappearing from the project.
  const acceptSurfaceVersion = useCallback((id) => {
    setImplicitSurfaces((p) => {
      const { byId } = buildLineages(p);
      const hit = byId.get(id);
      const ids = new Set((hit ? hit.lineage : [{ id }]).map((s) => s.id));
      const next = p.map((s) => {
        if (!ids.has(s.id)) return s;
        const isAccepted = s.id === id;
        const mesh = implicitMeshesRef.current[s.id];
        if (mesh) mesh.visible = isAccepted;
        return { ...s, accepted: isAccepted, visible: isAccepted };
      });
      const name = p.find((s) => s.id === id)?.name || "surface";
      const others = ids.size - 1;
      setNotices((n) => [...n, `Accepted "${name}" as the version you are working from${others > 0 ? `; the other ${others} version${others === 1 ? "" : "s"} in this lineage ${others === 1 ? "was" : "were"} hidden but NOT deleted (they still save with the project and can be shown again from the list)` : ""}. "Accepted" records your choice — it is not a check that this run is correct.`]);
      return next;
    });
  }, []);

  // Overlay compare: both meshes are already in the one scene, so this is two material writes — no
  // second viewport, no second camera, no extra per-frame cost beyond drawing two surfaces the user
  // could already have had visible at once. Performance is priority #1; a split-screen viewport would
  // have doubled the cost of the heaviest part of the app to show something this shows for free.
  const COMPARE_A_HEX = 0x6f8fb5, COMPARE_B_HEX = 0xe2843c;
  const overlayCompareSurfaces = useCallback((aId, bId) => {
    setImplicitSurfaces((p) => {
      const { byId } = buildLineages(p);
      const lineageIds = new Set((byId.get(bId)?.lineage || []).map((s) => s.id));
      return p.map((s) => {
        const mesh = implicitMeshesRef.current[s.id];
        if (s.id === aId || s.id === bId) {
          if (mesh) {
            // Remember the surface's own colour once, so "Reset colours" is exact rather than a guess.
            if (mesh.userData.preCompareColorHex == null) mesh.userData.preCompareColorHex = mesh.material.color.getHex();
            mesh.material.color.setHex(s.id === aId ? COMPARE_A_HEX : COMPARE_B_HEX);
            mesh.material.needsUpdate = true;
            mesh.visible = true;
          }
          return { ...s, visible: true };
        }
        // Hide the rest of the same lineage so the two being compared aren't buried under a third run.
        if (lineageIds.has(s.id)) { if (mesh) mesh.visible = false; return { ...s, visible: false }; }
        return s;
      });
    });
    setNotices((n) => [...n, `Overlay: the older version is grey-blue, the newer is orange. Other versions of the same surface are hidden (not deleted). Use "Reset colours" in the compare dialog to put them back.`]);
  }, []);

  const clearCompareOverlay = useCallback(() => {
    setImplicitSurfaces((p) => p.map((s) => {
      const mesh = implicitMeshesRef.current[s.id];
      if (mesh && mesh.userData.preCompareColorHex != null) {
        mesh.material.color.setHex(mesh.userData.preCompareColorHex);
        mesh.material.needsUpdate = true;
        mesh.userData.preCompareColorHex = null;
      }
      return s;
    }));
  }, []);

  // Lineage bookkeeping for the surface list below. Pure metadata over a handful of surfaces (no mesh
  // is touched), so it's cheap; memoised anyway because the list re-renders on every visibility toggle.
  const surfaceLineageInfo = useMemo(() => buildLineages(implicitSurfaces), [implicitSurfaces]);

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
    // TASKS.csv #269 — every exported mesh carries its own parameter provenance + the "not a Mineral
    // Resource estimate" stamp, so it can't come back later stripped of the assumptions behind it.
    const prov = surf.params || null;
    const extra = { epsg: project?.epsg, densityTPerM3: surf.density ?? null, volumeM3: computeMeshVolume(mesh.geometry).volumeM3 };
    // TASKS.csv #145 — a hand-sculpted surface must not leave this app claiming to be a clean
    // interpolation of its stated parameters. The edit log travels with the mesh (see
    // meshExport.js's provenanceLines, where it is stamped ahead of every parameter line), including
    // the volume as generated vs. the volume now, since volume is what drives tonnage.
    if (surf.editCount > 0) {
      const edits = surf.edits || [];
      extra.manualEdits = {
        count: surf.editCount,
        edits,
        volumeAsGeneratedM3: edits.length ? edits[0].volumeBeforeM3 : null,
        volumeNowM3: extra.volumeM3,
      };
    }
    try {
      if (format === "obj") {
        const content = exportSurfaceOBJ(surf.name, mesh.geometry, originRef.current, prov, extra);
        await saveFile({ suggestedName: `${baseName}.obj`, filters: [{ name: "Wavefront OBJ", extensions: ["obj"] }], content, encoding: "text" });
      } else if (format === "dxf") {
        const content = exportSurfaceDXF(surf.name, mesh.geometry, originRef.current, prov, extra);
        await saveFile({ suggestedName: `${baseName}.dxf`, filters: [{ name: "AutoCAD DXF", extensions: ["dxf"] }], content, encoding: "text" });
      } else if (format === "glb") {
        const buf = await exportSurfaceGLTF(surf.name, mesh.geometry, originRef.current, prov, extra);
        await saveFile({ suggestedName: `${baseName}.glb`, filters: [{ name: "glTF Binary", extensions: ["glb"] }], content: uint8ToBase64(new Uint8Array(buf)), encoding: "base64" });
      }
      setNotices((p) => [...p, `Exported "${surf.name}" as ${format.toUpperCase()} (real-world coordinates).`]);
    } catch (err) {
      setNotices((p) => [...p, `Export failed for "${surf.name}": ${err.message}`]);
    }
  }, [implicitSurfaces, project?.epsg]);

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
    // TASKS.csv #131 — c.material?.map?.dispose?.() added alongside the existing geometry/material
    // disposal: every OTHER mesh type built into these groups uses a plain color-only material (no
    // .map), so this was a harmless no-op for all of them, but hole-label Sprites use a CanvasTexture
    // (SpriteMaterial.map) that this loop would otherwise leak — a growing, uncollectable GPU texture
    // per rebuild — since disposing the material alone does not dispose a texture it merely references.
    Object.values(groups).forEach((g) => { while (g.children.length) { const c = g.children.pop(); c.geometry?.dispose?.(); c.material?.map?.dispose?.(); c.material?.dispose?.(); } });
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
      const raw = desurveyHole(c, hs, desurveyMethod); // TASKS.csv #135
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

      // TASKS.csv #131 — collar (hole) labels, opt-in via holeLabelMode (defaults to "none" so this
      // is a pure addition, no behavior change for anyone who hasn't turned it on).
      if (holeLabelMode !== "none") {
        const totalDepth = pts.length ? pts[pts.length - 1].md : 0;
        const text = holeLabelMode === "hole_id_z" ? `${c.hole_id} (${c.z.toFixed(0)}m)`
          : holeLabelMode === "hole_id_depth" ? `${c.hole_id} (${totalDepth.toFixed(0)}m)`
          : c.hole_id;
        const sprite = makeTextSprite(text);
        sprite.position.set(pts[0].x, pts[0].y + 6, pts[0].z); // offset above the collar marker so it doesn't overlap it
        sprite.userData = { tip: `${c.hole_id}\nLabel` };
        groups.hole_labels.add(sprite);
      }

      // TASKS.csv #137 — geotech/recovery are both known 0-100 percentages, so rqdColor's fixed
      // ramp fits both; specific gravity has no such fixed domain (real values run ~2-5), so it
      // uses the project's own actual min/max instead (globalPointRanges.sg above), same as the
      // numeric point-marker layers (mnlgy/magsusc) below already do via magColor.
      // TASKS.csv #237 — now routed through numericLayerColor so a user-defined class scheme (if any)
      // wins; with no scheme defined this returns exactly what it always did.
      const numericIntervalColor = (groupKey, value) =>
        numericLayerColor(groupKey, value, groupKey === "sg" ? globalPointRanges.sg : { min: 0, max: 100 });
      const buildIntervalTube = (groupKey) => {
        const meta = LAYER_META[groupKey];
        (rowsByHole[groupKey]?.get(c.hole_id) || []).filter((r) => isRowVisibleForBuild(groupKey, r)).forEach((row) => {
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
            const color = meta.numeric ? numericIntervalColor(groupKey, row.value) : baseColorForBuild(groupKey, row.value);
            const mat = new THREE.MeshLambertMaterial({ color, transparent: meta.opacity < 1, opacity: meta.opacity });
            mesh_ = new THREE.Mesh(geo, mat);
            mesh_.position.set(p1.x, p1.y, p1.z);
            mesh_.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
          } else {
            const curve = new THREE.CatmullRomCurve3(vecs);
            geo = new THREE.TubeGeometry(curve, Math.max(2, vecs.length * 2), meta.radius, 6, false);
            const color = meta.numeric ? numericIntervalColor(groupKey, row.value) : baseColorForBuild(groupKey, row.value);
            const mat = new THREE.MeshLambertMaterial({ color, transparent: meta.opacity < 1, opacity: meta.opacity });
            mesh_ = new THREE.Mesh(geo, mat);
          }
          const mesh = mesh_;
          const lbl = meta.numeric ? row.value : effectiveLabel(groupKey, row.value);
          // TASKS.csv #208 — surface a mapped Description column (litho's new optional field, or any
          // custom field named "description") in the hover tooltip alongside the other interval layers
          // that share this same tube-building path — harmless no-op for rows that don't have one.
          // TASKS.csv #227 (continuation) — catValue lets the post-hoc applyCategoryVisibility pass
          // (below) decide this mesh's .visible without needing the original row data.
          mesh.userData = { tip: `${c.hole_id}\n${meta.label}: ${lbl}${row.extra != null ? ` (${row.extra})` : ""}\n${row.from.toFixed(0)}–${row.to.toFixed(0)} m${row.description ? `\n${row.description}` : ""}`, catValue: row.value };
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
        const vals = (rowsByHole[groupKey]?.get(c.hole_id) || []).filter((r) => isRowVisibleForBuild(groupKey, r));
        const { min, max } = globalPointRanges[groupKey] || { min: 0, max: 0 };
        vals.forEach((row) => {
         try {
          const mid = (row.from + row.to) / 2;
          const p = findOnTrace(pts, mid);
          if (!p) return;
          const size = meta.numeric ? 1.6 + 3.5 * (max > min ? (row.value - min) / (max - min) : 0.3) : 2 + Math.min(3, (row.extra || 1) * 0.4);
          const color = meta.numeric ? numericLayerColor(groupKey, row.value, { min, max }) : baseColorForBuild(groupKey, row.value);
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 10), new THREE.MeshLambertMaterial({ color }));
          mesh.position.set(p.x, p.y, p.z);
          const lbl = meta.numeric ? row.value : effectiveLabel(groupKey, row.value);
          mesh.userData = { tip: `${c.hole_id}\n${meta.label}: ${lbl}${row.extra != null ? ` (${row.extra}%)` : ""}\n@ ${mid.toFixed(0)} m`, catValue: row.value };
          groups[groupKey].add(mesh);
         } catch (err) { buildErrors.push(`${groupKey} ${c.hole_id}: ${err.message}`); }
        });
      };
      buildPointMarkers("mnlgy");
      buildPointMarkers("magsusc");

      (rowsByHole.structure?.get(c.hole_id) || []).filter((s) => isRowVisibleForBuild("structure", s)).forEach((s) => {
        const p = findOnTrace(pts, s.depth);
        if (!p) return;
        const dip = s.dip != null && !isNaN(s.dip) ? s.dip : 45;
        const az = s.azimuth != null && !isNaN(s.azimuth) ? s.azimuth : 0;
        const geo = new THREE.CircleGeometry(6, 24);
        const color = baseColorForBuild("structure", s.value);
        const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
        const disc = new THREE.Mesh(geo, mat);
        disc.rotation.order = "YXZ";
        disc.rotation.x = Math.PI / 2 - toRad(dip);
        disc.rotation.y = -toRad(az);
        disc.position.set(p.x, p.y, p.z);
        const lbl = effectiveLabel("structure", s.value);
        disc.userData = { tip: `${c.hole_id}\nStructure: ${lbl}\ndip ${isNaN(dip) ? "?" : dip.toFixed(0)}° / az ${isNaN(az) ? "?" : az.toFixed(0)}°\n@ ${s.depth.toFixed(0)} m`, catValue: s.value };
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
    // TASKS.csv #227 (continuation) — categoryFilter was pulled out of this effect's own dependency
    // array (see isRowVisibleForBuild above: category-hidden rows are still built now, not skipped),
    // so a real rebuild triggered by something else entirely (e.g. a new CSV import) creates fresh,
    // three.js-default-visible children that must have the CURRENTLY active category filters
    // reapplied here, or a category a user had already hidden would incorrectly reappear until they
    // touched the filter again. The companion effect below (keyed on [categoryFilter] alone) handles
    // the common case — toggling a chip with no rebuild involved.
    applyCategoryVisibility();
    // Same reasoning for legendOverride: build-time color now comes from baseColorForBuild (plain
    // default, no override), so a real rebuild's fresh meshes need any currently-active legend color
    // overrides reapplied here too, or they'd flash back to default colors until legendOverride itself
    // next changes.
    applyLegendOverrideColors();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- voxelGeomSignature intentionally replaces
    // voxelModels here (see the comment above this effect): a mere visibility/opacity/legend toggle
    // must NOT re-trigger this effect's unconditional fitView() call and wipe out the user's pan/zoom.
    // applyCategoryVisibility/applyLegendOverrideColors are deliberately NOT listed either, for the
    // same reason categoryFilter/legendOverride were removed from this array — both are called
    // directly above using whatever this render closed over, not as re-trigger conditions.
  }, [collars, survey, desurveyMethod /* #135 — switching method must rebuild every trace */, layers, customLayers, numericRange, isRowVisible, isRowVisibleForBuild, baseColorForBuild, effectiveLabel, numericLayerColor, fitView, assays, assayDisplayElements, assayStyle, assayElements, assayVisible, terrain, rasters, boundaries, omfObjects, voxelGeomSignature, fitBox, rebuildSeq, geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax, surfaceSamples, layerVisible.surface_samples, holeLabelMode]);

  // ---------- TASKS.csv #52 — PERSIST GENERATED SURFACES THROUGH SAVE / OPEN / AUTOSAVE ----------
  //
  // Two effects, deliberately in this order (hydrate, then sync-out) and deliberately placed HERE,
  // immediately after the geometry-rebuild effect above: that effect is what recomputes
  // originRef.current from the current collars, and effects run in declaration order within a commit,
  // so by the time hydration converts world coordinates back to scene coordinates the origin already
  // belongs to the project being opened, not the one being replaced. That is the same reasoning the
  // raster-drape effect right below documents for itself.
  //
  // Why the meshes are stored in WORLD coordinates: see store.jsx's generatedSurfaces comment. Scene
  // space is relative to originRef, which is the mean collar position — saving scene coordinates would
  // silently shift every surface if a collar were added or removed between save and reload.
  const surfaceHydrationRef = useRef({ seq: -1, installed: null });
  // id -> { uuid, vertices, indices }. Converting a mesh to world coordinates is O(vertices), and the
  // sync-out effect runs on EVERY change to implicitSurfaces — including pure metadata edits (renaming
  // a surface's type, toggling visibility, adding a #83 relationship, editing a #140 density), which
  // don't touch geometry at all. Keying the cache on the geometry's own uuid means a metadata edit
  // re-serialises nothing; only a genuinely new/regenerated mesh pays the conversion.
  const surfaceGeomCacheRef = useRef({});

  useEffect(() => {
    // Only ever hydrate ONCE per project load. viewerUiStateSeq is the store's existing
    // "a different project is now loaded" counter (bumped by newProject/openProject/tab switch), which
    // is exactly the event this needs and already exists — no new signal invented for it.
    if (surfaceHydrationRef.current.seq === viewerUiStateSeq) return;
    const group = implicitGroupRef.current;
    if (!group) return; // scene not built yet; `sceneReady` below gives this a second chance
    // Tear down whatever the previous project left in the scene, so opening project B never inherits
    // project A's surfaces.
    Object.keys(implicitMeshesRef.current).forEach((id) => {
      const m = implicitMeshesRef.current[id];
      group.remove(m); m.geometry?.dispose?.(); m.material?.dispose?.();
    });
    implicitMeshesRef.current = {};
    surfaceGeomCacheRef.current = {};
    const o = originRef.current;
    const restored = [];
    (generatedSurfaces || []).forEach((s) => {
      const verts = s.vertices || [];
      const idx = s.indices || [];
      if (verts.length < 9 || idx.length < 3) return; // nothing renderable — skip rather than add an invisible ghost row
      // World (easting, northing, elevation) -> scene. Exact inverse of meshExport.js's
      // sceneVertsToWorld, identical to the #148 solid importer's own conversion.
      const scene = new Float32Array(verts.length);
      for (let i = 0; i < verts.length; i += 3) {
        scene[i] = verts[i] - o.x;
        scene[i + 1] = verts[i + 2] - o.z;
        scene[i + 2] = o.y - verts[i + 1];
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(scene, 3));
      geo.setIndex(Array.from(idx));
      // Normals are recomputed rather than saved — exact for a triangle soup, and it keeps the mesh's
      // share of the project file to positions + indices only (store.jsx's size note).
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({
        color: s.color ?? 0xc8a24a, side: THREE.DoubleSide,
        transparent: true, opacity: s.opacity ?? 0.75,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = s.visible !== false;
      mesh.userData = { tip: `${s.name}\n${(verts.length / 3) | 0} vertices (restored from the project file)` };
      group.add(mesh);
      implicitMeshesRef.current[s.id] = mesh;
      surfaceGeomCacheRef.current[s.id] = { uuid: geo.uuid, vertices: verts, indices: idx };
      const { vertices: _v, indices: _i, ...meta } = s;
      restored.push({ ...meta, visible: s.visible !== false });
    });
    surfaceHydrationRef.current = { seq: viewerUiStateSeq, installed: restored };
    setImplicitSurfaces(restored);
    if (restored.length) {
      setNotices((p) => [...p, `Restored ${restored.length} generated surface${restored.length > 1 ? "s" : ""} from the project file, with the parameters that produced ${restored.length > 1 ? "them" : "it"} (see each surface's "Parameters used").`]);
    }
    // `generatedSurfaces` is in the deps so a project whose surfaces arrive in a later commit than the
    // seq bump still hydrates; the seq guard at the top makes the extra runs free. `sceneReady` covers
    // the case where this component's three.js scene didn't exist yet on the first attempt.
  }, [viewerUiStateSeq, generatedSurfaces, sceneReady]);

  useEffect(() => {
    // BUG, caught live rather than by reading the code (a hot reload remounted this component
    // mid-session and every persisted surface silently vanished from the project): this effect ALSO
    // runs on mount, when implicitSurfaces is still its initial [] — so without this guard, mounting
    // ViewerModule wrote an empty list straight over the surfaces the store had just loaded from the
    // project file, destroying them before the hydration effect above ever got to render them. That
    // is not a hot-reload-only problem: hydration bails out early when implicitGroupRef isn't built
    // yet (the three.js init effect is declared further down, so on the first mount pass the scene
    // group genuinely doesn't exist), and it is exactly on that first pass that this effect would
    // have fired. Nothing may be written back until hydration has actually run FOR THIS PROJECT —
    // seq matching viewerUiStateSeq is precisely that condition.
    if (surfaceHydrationRef.current.seq !== viewerUiStateSeq) return;
    // The array identity hydration just installed is already exactly what's in the store — writing it
    // back would be a pointless full re-serialisation of every mesh on every project open.
    if (surfaceHydrationRef.current.installed === implicitSurfaces) return;
    const o = originRef.current;
    const r2 = (v) => Math.round(v * 100) / 100; // 1 cm — see store.jsx's size note
    const payload = implicitSurfaces.map((s) => {
      const mesh = implicitMeshesRef.current[s.id];
      const geo = mesh?.geometry;
      let cached = surfaceGeomCacheRef.current[s.id];
      if (geo && (!cached || cached.uuid !== geo.uuid)) {
        const { vertices, indices } = sceneVertsToWorld(geo, o);
        const flat = new Array(vertices.length * 3);
        for (let i = 0; i < vertices.length; i++) {
          flat[i * 3] = r2(vertices[i][0]);
          flat[i * 3 + 1] = r2(vertices[i][1]);
          flat[i * 3 + 2] = r2(vertices[i][2]);
        }
        cached = { uuid: geo.uuid, vertices: flat, indices };
        surfaceGeomCacheRef.current[s.id] = cached;
      }
      return {
        ...s,
        color: mesh?.material?.color?.getHex?.() ?? null,
        opacity: mesh?.material?.opacity ?? 0.75,
        vertices: cached?.vertices || [],
        indices: cached?.indices || [],
      };
    });
    // Drop cache entries for surfaces that have been removed, so a long session doesn't hold onto the
    // world-coordinate copy of every mesh the user ever deleted.
    const live = new Set(implicitSurfaces.map((s) => s.id));
    Object.keys(surfaceGeomCacheRef.current).forEach((id) => { if (!live.has(id)) delete surfaceGeomCacheRef.current[id]; });
    setGeneratedSurfaces(payload);
    // DEPS ARE [implicitSurfaces] ONLY, AND THAT IS load-bearing — verified live, not reasoned about.
    // Adding viewerUiStateSeq here (which looks harmless, since the guard above reads it) breaks the
    // restore path: opening a project bumps the seq, so this effect fires in the SAME commit as the
    // hydration effect above, at which point `implicitSurfaces` is still the OUTGOING project's list —
    // it passed both guards and wrote an empty list over the surfaces that had just been loaded from
    // the file. Symptom is nasty and quiet: the restored surfaces render correctly, but the store's
    // copy is empty, so the NEXT save silently drops them. With deps of [implicitSurfaces] alone this
    // effect can only ever run after hydration has already replaced that array, where the identity
    // guard above catches it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [implicitSurfaces]);

  // ---------- TASKS.csv #145 — MANUAL SURFACE EDITING / SCULPTING ----------
  // Implicit fits are never perfect near sparse data, and until now a generated surface was
  // regenerate-only: a 3 m error next to one hole could only be "fixed" by changing a global parameter
  // and re-running, which moves the surface everywhere else too. This lets a patch be corrected in
  // place, with a smooth falloff, an exact volume delta, and an honest provenance flag.
  //
  // Deliberately placed here, immediately after the #52 persistence effects, because of
  // `onGeometryEdited`: the sync-out effect above caches each mesh's world-space serialisation keyed
  // on the GEOMETRY'S uuid so that metadata-only edits don't re-serialise tens of thousands of
  // vertices. A sculpt mutates the position buffer IN PLACE, so the uuid is unchanged and that cache
  // would hand the old geometry to the next save — the edit would render correctly and then quietly
  // vanish from the project file. Dropping the surface's cache entry on commit is the fix, and it has
  // to happen where surfaceGeomCacheRef is in scope.
  //
  // Everything else (the maths, the picking, the undo stack, the marker) is in src/lib/sculpt.js and
  // src/lib/useSculpt.js, hand-verified in bare Node against analytic ground truth before any of this
  // was wired up — see the TASKS.csv #145 notes for the numbers.
  const sculpt = useSculpt({
    surfaces: implicitSurfaces, // so sculpt mode can't be left pointing at a surface that no longer exists
    meshesRef: implicitMeshesRef,
    groupRef: implicitGroupRef,
    mountRef, cameraRef, originRef,
    setImplicitSurfaces, setNotices,
    onGeometryEdited: useCallback((id) => { delete surfaceGeomCacheRef.current[id]; }, []),
  });

  // ---------- TASKS.csv #90 — topological relationship checking ----------
  // The consumer #83 was missing. Runs src/lib/topology.js over every surface currently in the scene,
  // using their #83 declared relationships, and reports the ones the GEOMETRY contradicts. Meshes are
  // handed over in SCENE space (up = +Y) — the check is scale/frame-agnostic, and this avoids
  // converting tens of thousands of vertices just to ask a yes/no question.
  const [topologyBusy, setTopologyBusy] = useState(false);
  const runTopologyCheck = useCallback(() => {
    if (!implicitSurfaces.length) { setNotices((p) => [...p, "No generated surfaces to check yet."]); return; }
    setTopologyBusy(true);
    // Deferred a tick so the "Checking..." state actually paints before a multi-second check on large
    // meshes blocks the main thread — same pattern the modelling tools use for their own busy state.
    setTimeout(() => {
      try {
        const input = implicitSurfaces.map((s) => {
          const geo = implicitMeshesRef.current[s.id]?.geometry;
          const pos = geo?.attributes?.position?.array;
          const idx = geo?.index?.array;
          return {
            id: s.id, name: s.name, type: s.type, closure: s.closure,
            relationships: s.relationships || [],
            positions: pos || [], indices: idx || [],
          };
        });
        const res = checkTopology(input, { up: "y" });
        if (!res.checked) {
          setNotices((p) => [...p, `Nothing to check: none of the ${res.surfacesChecked} surface(s) declare a relationship that implies a geometric constraint. Declare "is below" / "is above" / "must not cross" on a surface (expand its row) and run this again.`]);
        } else if (!res.violations.length) {
          setNotices((p) => [...p, `Topology check passed: ${res.checked} check(s) across ${res.surfacesChecked} surface(s), no violations.${res.skipped ? ` ${res.skipped} declared relationship(s) skipped — either the target surface no longer exists, or the relationship (truncates / terminates against / cuts) is one where an intersection is expected and so has nothing to violate.` : ""}`]);
        } else {
          setNotices((p) => [...p, `Topology check found ${res.violations.length} violation(s) in ${res.checked} check(s):`, ...res.violations.map((v) => `  • ${v.message}`)]);
        }
      } catch (err) {
        setNotices((p) => [...p, `Topology check failed: ${err.message}`]);
      } finally {
        setTopologyBusy(false);
      }
    }, 40);
  }, [implicitSurfaces]);

  // ---------- TASKS.csv #52 (d) — CROSS-CUTTING: truncate a surface against a dyke, split it on a fault ----------
  //
  // The gap this closes: the stratigraphic stack tool (#61) EXCLUDES veins and dykes by design — a
  // stack is a set of ordered iso-surfaces of one shared scalar field, which is exactly what makes it
  // non-crossing, and a cross-cutting body breaks that premise. #144 then modelled veins/dykes properly
  // but with no relationship to the stratigraphy: a dyke and the contacts it cuts were two independent
  // meshes that merely overlapped on screen, with the contact still drawn straight through the dyke.
  //
  // So cross-cutting is applied AFTER the fact, as a geometric operation on the finished meshes, rather
  // than by teaching the stack about veins (which would cost the property that makes the stack
  // trustworthy). That is also the order the geology happened in. The maths is src/lib/crosscut.js,
  // hand-verified in bare Node against planted ground truth before any of this existed — including the
  // two cases that must NOT report a truncation (a dyke that stops short of the contact) and the one
  // that must report two bodies (a dyke that fully severs it). See TASKS.csv #52 for the numbers.
  //
  // WHICH OPERATION RUNS IS DECIDED BY THE CUTTER'S GEOMETRY, not by a mode switch: a closed body (a
  // vein/dyke SOLID, a grade shell, an imported wireframe) has an inside, so the host is truncated
  // against it; an open surface (a fault plane, a draped contact) has no inside, so the host is split
  // into the two fault blocks instead. Meshes are handed over in SCENE space (up = +Y), the same frame
  // #90's checker uses, so no coordinate conversion happens for what is a purely geometric question.
  const [crossCutBusy, setCrossCutBusy] = useState(false);
  const runCrossCut = useCallback((hostId, cutterId) => {
    const host = implicitSurfaces.find((s) => s.id === hostId);
    const cutter = implicitSurfaces.find((s) => s.id === cutterId);
    if (!host || !cutter || hostId === cutterId) return;
    const hostMesh = implicitMeshesRef.current[hostId], cutMesh = implicitMeshesRef.current[cutterId];
    if (!hostMesh || !cutMesh) { setNotices((p) => [...p, "Cross-cut failed: one of the two surfaces has no mesh in the scene."]); return; }
    const geoOf = (m) => ({ positions: m.geometry?.attributes?.position?.array || [], indices: m.geometry?.index?.array || [] });
    setCrossCutBusy(true);
    setTimeout(() => {
      try {
        const h = geoOf(hostMesh), c = geoOf(cutMesh);
        const mkGeo = (positions, indices) => {
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute(Float32Array.from(positions), 3));
          g.setIndex(Array.from(indices));
          g.computeVertexNormals();
          return g;
        };
        const res = truncateAgainstSolid(h, c);
        if (!res.ok && res.reason === "cutter-not-closed") {
          // Not an error — it is the fault case, and the fault case is a SPLIT, not a truncation.
          const sp = splitAcrossSurface(h, c);
          if (!sp.ok || !sp.changed) {
            setNotices((p) => [...p, `"${cutter.name}" does not divide "${host.name}": ${sp.reason === "no-overlap" ? "the two surfaces are nowhere near each other" : "the whole surface falls on one side of it"}. Nothing was changed.`]);
            return;
          }
          const stamp = (part, suffix, sense) => {
            const mesh = new THREE.Mesh(mkGeo(part.positions, part.indices), new THREE.MeshLambertMaterial({
              color: hostMesh.material?.color?.getHex?.() ?? 0xc8a24a, side: THREE.DoubleSide, transparent: true, opacity: hostMesh.material?.opacity ?? 0.75,
            }));
            const name = `${host.name} — ${suffix}`;
            mesh.userData = { tip: `${name}\n${Math.floor(part.positions.length / 3)} vertices, ${Math.floor(part.indices.length / 3)} faces` };
            implicitGroupRef.current?.add(mesh);
            const id = `impl_${Date.now()}_block_${sense}_${Math.random().toString(36).slice(2, 7)}`;
            implicitMeshesRef.current[id] = mesh;
            return {
              id, name, visible: true, type: host.type || "other",
              vertexCount: Math.floor(part.positions.length / 3), faceCount: Math.floor(part.indices.length / 3),
              relationships: [{ relation: "terminates_against", targetId: cutterId }],
              params: {
                tool: "fault block split (TASKS.csv #52)", derivedFrom: host.name, fault: cutter.name, block: sense,
                triangles: Math.floor(part.indices.length / 3), components: sense === "+" ? sp.stats.positiveComponents : sp.stats.negativeComponents,
                edgesBeyondTheFaultTip: sp.stats.unresolvedEdges,
                note: "Geometry only: the surface is divided where the fault mesh cuts it. NO fault displacement is applied — the blocks are not offset along the fault, because no slip has been measured here.",
                sourceParams: host.params || null, generatedAt: new Date().toISOString(),
              },
            };
          };
          const a = stamp(sp.positive, "block (+ side of fault)", "+");
          const b = stamp(sp.negative, "block (− side of fault)", "-");
          hostMesh.visible = false;
          setImplicitSurfaces((p) => [...p.map((s) => (s.id === hostId ? { ...s, visible: false } : s)), a, b]);
          setNotices((p) => [...p, `Split "${host.name}" along fault "${cutter.name}": ${a.faceCount.toLocaleString()} + ${b.faceCount.toLocaleString()} triangles in two blocks. The original surface is kept but hidden, so nothing is lost. NO displacement has been applied — the blocks are exactly where the surface already was, just separated at the fault.`]);
          if (sp.stats.unresolvedEdges > 0) {
            setNotices((p) => [...p, `"${cutter.name}" does not span the whole of "${host.name}": ${sp.stats.unresolvedEdges} edge(s) change sides beyond the fault's own extent, where it has no surface to cut against. Those triangles were left whole and assigned to the block holding most of their corners rather than cut at an invented position, so read the division as approximate near the fault's tip.`]);
          }
          return;
        }
        if (!res.ok) { setNotices((p) => [...p, `Cross-cut failed (${res.reason}).`]); return; }
        if (!res.changed) {
          setNotices((p) => [...p, `"${cutter.name}" does not cut "${host.name}" — ${res.reason === "no-overlap" ? "the two bodies do not even overlap in space" : "no part of the surface falls inside it"}. Nothing was changed, which is the correct result: a dyke that stops short of a contact does not truncate it.`]);
          return;
        }
        // Replace the geometry (a NEW BufferGeometry, so the #52 sync-out cache keyed on geometry uuid
        // re-serialises it and the truncation actually reaches the project file).
        const old = hostMesh.geometry;
        hostMesh.geometry = mkGeo(res.positions, res.indices);
        old?.dispose?.();
        delete surfaceGeomCacheRef.current[hostId];
        const st = res.stats;
        const vertexCount = Math.floor(res.positions.length / 3), faceCount = Math.floor(res.indices.length / 3);
        hostMesh.userData = { tip: `${host.name}\n${vertexCount} vertices, ${faceCount} faces (truncated against ${cutter.name})` };
        setImplicitSurfaces((p) => p.map((s) => {
          if (s.id === hostId) {
            return {
              ...s, vertexCount, faceCount,
              relationships: [...(s.relationships || []).filter((r) => !(r.relation === "cuts" && r.targetId === cutterId)), { relation: "cuts", targetId: cutterId }],
              params: {
                ...(s.params || {}),
                truncatedBy: [...((s.params || {}).truncatedBy || []), {
                  cutter: cutter.name, cutterId,
                  trianglesRemoved: st.trianglesDropped, trianglesClipped: st.trianglesClipped,
                  componentsBefore: st.componentsBefore, componentsAfter: st.componentsAfter,
                  openEdgeLengthBeforeM: st.boundaryLengthBeforeM, openEdgeLengthAfterM: st.boundaryLengthAfterM,
                  at: new Date().toISOString(),
                }],
              },
            };
          }
          if (s.id === cutterId) {
            return { ...s, relationships: [...(s.relationships || []).filter((r) => !(r.relation === "truncates" && r.targetId === hostId)), { relation: "truncates", targetId: hostId }] };
          }
          return s;
        }));
        const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
        setNotices((p) => [...p, `Truncated "${host.name}" against "${cutter.name}": ${fmt(st.trianglesDropped)} triangle(s) removed and ${fmt(st.trianglesClipped)} cut at the contact, leaving ${fmt(faceCount)}. ${st.componentsAfter > st.componentsBefore ? `The body cuts right through it — the surface is now ${st.componentsAfter} separate pieces (was ${st.componentsBefore}).` : `The surface is still ${st.componentsAfter} connected piece(s), so the cut is a notch rather than a full severance.`} Its open edge went from ${fmt(st.boundaryLengthBeforeM)} m to ${fmt(st.boundaryLengthAfterM)} m.`]);
        setNotices((p) => [...p, `The truncation is not re-run automatically: regenerating either surface produces a fresh, untruncated mesh, and the cut has to be applied again. What was cut is recorded in "${host.name}"'s Parameters used.`]);
      } catch (err) {
        setNotices((p) => [...p, `Cross-cut failed: ${err.message}`]);
      } finally {
        setCrossCutBusy(false);
      }
    }, 40);
  }, [implicitSurfaces]);

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
      // already drawn behind it instead of fighting the depth buffer. FOLLOW-UP (TASKS.csv #201
      // again) — depthWrite:false alone still doesn't give correct back-to-front BLEND order (three.js
      // draws instances in fixed array order, not camera-distance order), which a real user on a real
      // large model reported as still visibly wrong ("blocks displayed depending on the angle of
      // view"). True per-frame instance sorting is now done in the mount effect's animate() loop
      // (see resortTransparentVoxels/mesh.userData.transparentCells there) — throttled and gated so
      // it only ever runs for a model actually at opacity<1, never for the opaque default.
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
      // Only a transparent (opacity<1) model needs its cells' local-space positions/sizes/colors kept
      // around for the render loop's per-frame re-sort — an opaque model never gets re-sorted at all
      // (see resortTransparentVoxels's own gate on mesh.material.transparent), so building this array
      // for one would be pure wasted memory for the common, default (opaque) case.
      const transparentCells = opacity < 1 ? [] : null;
      cells.forEach((c, i) => {
        const lx = c.x - ox, ly = c.z - oz, lz = -(c.y - oy);
        const sx = Math.max(c.dx, 0.01), sy = Math.max(c.dz, 0.01), sz = Math.max(c.dy, 0.01);
        tmpMatrix.compose(new THREE.Vector3(lx, ly, lz), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
        mesh.setMatrixAt(i, tmpMatrix);
        const [cr, cg, cb] = resolveColorRGB(c.value);
        // setRGB's default colorSpace is ColorManagement.workingColorSpace (linear), NOT sRGB — unlike
        // setStyle's own default (SRGBColorSpace). Passing SRGBColorSpace explicitly here is required
        // to reproduce the exact same displayed color setStyle("rgb(...)") used to produce; omitting
        // it would silently reinterpret these 0-255 sRGB values as already-linear, visibly darkening
        // every voxel's color relative to before this change.
        tmpColor.setRGB(cr / 255, cg / 255, cb / 255, THREE.SRGBColorSpace);
        mesh.setColorAt(i, tmpColor);
        if (transparentCells) transparentCells.push({ x: lx, y: ly, z: lz, dx: sx, dy: sy, dz: sz, r: cr, g: cg, b: cb });
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = model.visible !== false;
      mesh.userData.transparentCells = transparentCells;
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

  // TASKS.csv #227 (continuation) — the common-case trigger for applyCategoryVisibility (see its own
  // definition above): toggling a category chip only changes categoryFilter, so this alone is enough
  // to re-hide/re-show the right meshes with no geometry rebuild. The big rebuild effect's own inline
  // call handles the other case (a real rebuild reapplying whatever filters are currently active).
  useEffect(() => { applyCategoryVisibility(); }, [applyCategoryVisibility]);
  // Same idea for legendOverride — applyLegendOverrideColors' own identity changes only when
  // effectiveColor's does, i.e. only when legendOverride itself changes, so this fires exactly when
  // (and only when) a legend color/label override is added/edited/removed.
  useEffect(() => { applyLegendOverrideColors(); }, [applyLegendOverrideColors]);

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
  const openImportModal = (file, forceTarget, chosenLayer = null) => {
    parseVectorFile(file, (data, err, meta) => {
      // TASKS.csv #288 — a multi-layer .zip/.gpkg reports its layers instead of importing the first
      // one; put the picker up and come back through this same function with the chosen layer name.
      if (meta?.layerOptions) { setLayerPicker({ file, forceTarget, options: meta.layerOptions }); return; }
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
    }, chosenLayer);
  };
  // TASKS.csv #288 — {file, forceTarget, options} while the layer picker is open, null otherwise.
  const [layerPicker, setLayerPicker] = useState(null);

  // TASKS.csv #289 (QGIS-specialist review) — the Browser panel's file filter used to be
  // `[".csv", ".zip", ".shp", ".gpkg"]`, so .tif/.gxf rasters and .dxf CAD files — both fully
  // supported elsewhere in this app (RasterModule/GeophysicsModule/dxf.js) — never appeared as
  // importable in the tree at all. A geologist used to QGIS's Browser, where the Browser IS the one
  // place you pull in ANY supported file, reaches for it here for an airborne grid or a surveyor's
  // DXF and simply doesn't find it, with no explanation. The dispatch below is purely that filter-list
  // gap being closed: each extension is routed to the handler that already exists for it, so a file
  // picked from the Browser behaves exactly like the same file imported from its own module's button.
  const importBrowserFile = async (file) => {
    const name = (file?.name || "").toLowerCase();
    // Drape elevation default, same rule RasterModule/GeophysicsModule use: roughly collar level if
    // holes are loaded, else 0. The per-raster elevation control on the Raster tab moves it after.
    const defaultElevation = collars.length ? collars.reduce((s, c) => s + c.z, 0) / collars.length : 0;
    if (/\.(tiff?|gxf)$/.test(name)) {
      try {
        const { raster, msg } = await buildRasterImport(file, { epsg: project?.epsg, defaultElevation });
        addRaster(raster);
        setNotices((p) => [...p, `${msg} Set its elevation/opacity (or a Source CRS, if it landed in the wrong place) on the Raster tab.`]);
      } catch (err) { setNotices((p) => [...p, `${file.name}: ${err.message}`]); }
      return;
    }
    if (/\.dxf$/.test(name)) {
      try {
        const { polylines } = parseDXF(await file.text());
        if (!polylines?.length) { setNotices((p) => [...p, `${file.name}: no polylines/LWPOLYLINEs found — nothing to import.`]); return; }
        addBoundary({ name: file.name.replace(/\.dxf$/i, ""), polylines, elevation: defaultElevation });
        setNotices((p) => [...p, `Imported "${file.name}" as a boundary (${polylines.length} polyline(s)) — edit or remove it under Geophysics → Boundaries. DXF coordinates are assumed to already be in the project's EPSG.`]);
      } catch (err) { setNotices((p) => [...p, `${file.name}: couldn't read DXF (${err.message}).`]); }
      return;
    }
    openImportModal(file);
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

      // TASKS.csv #283 — this used to be a bare last-write-wins merge
      // (`new Map([...collars, ...rows].map(c => [c.hole_id, c]))`): re-dropping a collar file
      // silently replaced every matching hole's coordinates with no diff and no chance to say no,
      // which is quietly destructive when the file was grabbed from the wrong folder. Now the diff is
      // computed FIRST (diffCollarImport, layers.js — pure and unit-verified) and the user is only
      // interrupted when it would actually change something: a re-import of the identical file, or one
      // that only adds new holes, still commits straight through with no extra click.
      const diff = diffCollarImport(collars, rows);
      let overwriteExisting = true;
      if (diff.changed.length) {
        const preview = diff.changed.slice(0, 6).map((c) => {
          const moved = c.shift > 1e-6 ? ` — moves ${c.shift < 10 ? c.shift.toFixed(2) : c.shift.toFixed(0)} world units` : "";
          return `  • ${c.hole_id}: ${c.fields.join(", ")} differ${moved}`;
        }).join("\n");
        overwriteExisting = window.confirm(
          `${fileName} contains ${diff.changed.length} hole(s) that already exist in this project with DIFFERENT values:\n\n${preview}` +
          `${diff.changed.length > 6 ? `\n  …and ${diff.changed.length - 6} more` : ""}\n\n` +
          `OK — overwrite those ${diff.changed.length} collar(s) with this file's values (the old ones are lost).\n` +
          `Cancel — keep the existing collars and import only the ${diff.newHoles.length} new hole(s).`
        );
      }
      const existingIds = new Set(collars.map((c) => c.hole_id));
      const applied = overwriteExisting ? rows : rows.filter((r) => !existingIds.has(r.hole_id));
      const map = new Map([...collars, ...applied].map((c) => [c.hole_id, c]));
      setCollars(Array.from(map.values()));
      setVisibleHoles((prev) => ({ ...prev, ...Object.fromEntries(applied.map((r) => [r.hole_id, true])) }));
      // The specific accounting the finding asked for ("12 of 40 collars already existed; 3 had
      // different coordinates and were updated") rather than a bare "Loaded N collars".
      const parts = [];
      if (diff.newHoles.length) parts.push(`${diff.newHoles.length} new`);
      if (diff.changed.length) parts.push(overwriteExisting ? `${diff.changed.length} existing hole(s) updated with different values` : `${diff.changed.length} existing hole(s) left untouched (you chose not to overwrite)`);
      if (diff.unchanged.length) parts.push(`${diff.unchanged.length} already present and identical`);
      if (diff.duplicatesInFile.length) parts.push(`${diff.duplicatesInFile.length} duplicate hole_id(s) WITHIN the file itself (last one won: ${[...new Set(diff.duplicatesInFile)].slice(0, 5).join(", ")})`);
      setNotices((p) => [...p, `Loaded ${rows.length} collars from ${fileName}${parts.length ? ` — ${parts.join("; ")}` : ""}.${reprojectNote}`]);
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
      // TASKS.csv #288 — a multi-layer .zip/.gpkg in a multi-file drop opens the picker and pauses the
      // queue here; the picker's own onPick/onCancel resumes it (openImportModal -> mapping modal ->
      // commitImport/cancel -> processImportQueue), so the queue can't advance past an unanswered
      // question or double-import the same file.
      if (meta?.layerOptions) { setLayerPicker({ file, options: meta.layerOptions }); return; }
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

  // TASKS.csv #293 — "Load sample project" from the empty 3D View. The single highest-leverage
  // onboarding fix from the UX review: sample_data/ is now actually shipped in the installer (see
  // package.json's build.extraResources and main.js's sample-data-path handler), and this is the
  // in-app path to it, so a first-time user with no data of their own has something to look at
  // within one click instead of an empty grid.
  //
  // Deliberately reuses the multi-file drag-and-drop queue verbatim (importQueueRef +
  // processImportQueue) rather than a bespoke loader — the files are turned into real File objects
  // by loadSampleFiles(), so every confidence check, column guess and notice behaves exactly as if
  // the user had dragged these same CSVs onto the viewport. assay_wide.csv is intentionally NOT in
  // this list: assays belong to the Geochem module's own import path (looksLikeAssay would just
  // reject it here with a notice), and the user is pointed there by the closing notice instead.
  const [sampleLoading, setSampleLoading] = useState(false);
  const SAMPLE_FILES = ["collars.csv", "litho.csv", "alt.csv", "vein.csv", "mnlgy.csv", "geotech.csv", "magsusc.csv", "structure.csv"];
  const loadSampleProject = async () => {
    if (sampleLoading || importActiveRef.current) return;
    setSampleLoading(true);
    try {
      const files = await loadSampleFiles("harry_property", SAMPLE_FILES);
      setNotices((p) => [...p, `Loading the Harry property sample project — 37 real drillholes from BC's public ARIS database (report #37584), with the interval layers synthesized around the real assay anomalies. See sample_data/harry_property/README.md for exactly what's real vs. synthetic. Assays for these holes can be imported from the Geochem tab (sample_data/harry_property/assay_wide.csv).`]);
      importActiveRef.current = true;
      importQueueTotalRef.current = files.length;
      importQueueRef.current = files;
      processImportQueue();
    } catch (err) {
      setNotices((p) => [...p, `Couldn't load the sample project: ${err.message}`]);
    } finally {
      setSampleLoading(false);
    }
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
        <LayerQuickPanel rows={layers[key] || []} meta={meta} layerKey={key} categoryFilter={categoryFilter[key] || new Set()}
          onToggleCategory={(v) => toggleCategory(key, v)} onIsolate={(v) => isolateCategory(key, v)} onRemoveSource={(src) => removeLayerSource(key, src)}
          numericSym={numericSymbology[key]}
          onNumericSymChange={(next) => setNumericSymbology((p) => { const n = { ...p }; if (next) n[key] = next; else delete n[key]; return n; })} />
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
  // TASKS.csv #240 — user report: "there's no way to choose which layers/voxels/rasters a section
  // actually shows -- an unrelated large SRTM terrain area was ending up in a section that should
  // have shown one voxel model and the drillholes." `scope` (a section's own `.scope` field, default
  // {} — every key below defaults to "whatever's currently visible in the 3D view", i.e. the exact
  // pre-existing behavior) lets a section opt OUT of specific content instead of always drawing
  // everything currently visible regardless of relevance. null/undefined on any individual scope key
  // means "don't override — use the live visibility state", so an old section with no scope field at
  // all (every section saved before this feature existed) renders identically to before.
  const buildSectionPayload = (a, b, corridor, scope = {}) => {
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
      if (!model.cells?.length) return;
      // scope.voxelModelIds (an explicit array, possibly empty) OVERRIDES live 3D-view visibility for
      // this section specifically; scope.voxelModelIds == null falls back to the pre-existing
      // model.visible check, unchanged.
      if (scope.voxelModelIds != null) { if (!scope.voxelModelIds.includes(model.id)) return; }
      else if (model.visible === false) return;
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
      if (scope.layerKeys != null ? !scope.layerKeys.includes(key) : !layerVisible[key]) return;
      const meta = LAYER_META[key];
      (layers[key] || []).forEach((row) => {
        if (!holeIds.has(row.hole_id) || !isRowVisible(key, row)) return;
        const color = meta.numeric ? numericLayerColor(key, row.value, key === "sg" ? sgRange : { min: 0, max: 100 }) : effectiveColor(key, row.value);
        const label = meta.numeric ? row.value : effectiveLabel(key, row.value);
        intervals.push({ hole_id: row.hole_id, from: row.from, to: row.to, color, label: `${meta.label}: ${label}` });
      });
    });

    const points = [];
    ["mnlgy", "magsusc"].forEach((key) => {
      if (scope.layerKeys != null ? !scope.layerKeys.includes(key) : !layerVisible[key]) return;
      const meta = LAYER_META[key];
      const vals = (layers[key] || []).filter((r) => holeIds.has(r.hole_id) && isRowVisible(key, r));
      const numeric = vals.map((r) => r.value).filter((v) => typeof v === "number" && !isNaN(v));
      const { min, max } = minMax(numeric); // not Math.min/max(...) — see layers.js's minMax comment
      vals.forEach((row) => {
        const mid = (row.from + row.to) / 2;
        const color = meta.numeric ? numericLayerColor(key, row.value, { min, max }) : effectiveColor(key, row.value);
        const label = meta.numeric ? row.value : effectiveLabel(key, row.value);
        points.push({ hole_id: row.hole_id, md: mid, color, label: `${meta.label}: ${label}` });
      });
    });
    const showAssays = scope.showAssays != null ? scope.showAssays : assayVisible;
    if (showAssays && assayDisplayElements.length) {
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
    if (scope.layerKeys != null ? scope.layerKeys.includes("structure") : layerVisible.structure) {
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

    const showCustomLayers = scope.showCustomLayers != null ? scope.showCustomLayers : true;
    customLayers.forEach((layer) => {
      if (!showCustomLayers) return;
      if (scope.showCustomLayers == null && customVisible[layer.id] === false) return;
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
    const showTerrain = scope.showTerrain != null ? scope.showTerrain : true;
    if (terrain && showTerrain) {
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
    const { holes, intervals, points, planes, elevationProfile, legendItems, voxelSlices } = buildSectionPayload(a, b, s.corridor, s.scope || {});
    openSectionWindow({ id: s.id, title: s.name, section: { ax: s.ax, ay: s.ay, bx: s.bx, by: s.by, azimuth: s.azimuth, corridor: s.corridor }, holes, intervals, points, planes, contacts: s.contacts || [], lithoUnits: litho_units, elevationProfile, legendItems, voxelSlices });
  }, [layers, layerVisible, customLayers, customVisible, assays, assayVisible, assayDisplayElements, assayStyle, isRowVisible, effectiveColor, effectiveLabel, numericLayerColor, litho_units, terrain, voxelModels]);

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

    // TASKS.csv #240 — user report: a single run against a large voxel model produced 3144
    // individual sections with no group to manage them as a unit. Every section this run creates is
    // tagged with ONE shared groupId so the sidebar can collapse them into a single row and
    // deleteSectionGroup can clear the whole run in one action.
    const groupId = addSectionGroup(`Fence series (az ${sliceSeriesAzimuth.toFixed(0)}°, ${width}m)`);
    let created = 0;
    for (let i = 0; i < n; i++) {
      const tCenter = tStart + width * (i + 0.5);
      const a = { x: sMin * dirX + tCenter * perpX, y: sMin * dirY + tCenter * perpY };
      const b = { x: sMax * dirX + tCenter * perpX, y: sMax * dirY + tCenter * perpY };
      const id = `sect_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`;
      const name = `Fence ${i + 1}/${n} (az ${sliceSeriesAzimuth.toFixed(0)}°, ${width}m)`;
      upsertSection({ id, name, ax: a.x, ay: a.y, bx: b.x, by: b.y, azimuth: sliceSeriesAzimuth, corridor: width / 2, contacts: [], groupId });
      created++;
    }
    setNotices((p) => [...p, `Generated ${created} section${created === 1 ? "" : "s"} spaced ${width}m apart at azimuth ${sliceSeriesAzimuth.toFixed(0)}° — grouped together in the Cross-sections list.`]);
  }, [sliceSeriesAzimuth, sliceSeriesWidth, voxelModels, upsertSection, addSectionGroup]);

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
      <div className="ge-panel-outer" style={{ width: sidebarWidth, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--color-bg)", borderRight: "1px solid var(--color-border)" }}>
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

        {/* TASKS.csv #131 — hole (collar) labels, QGIS-specialist audit finding: GeoStrix had no text
            labeling anywhere in the 3D scene at all. Scoped to a small fixed set of label contents
            rather than a full expression language — see holeLabelMode's own declaration comment. Only
            shown once there's something to label, same "don't clutter the sidebar with nothing to
            show" convention every other conditional sidebar section here already follows. */}
        {collars.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", flexShrink: 0 }}>Hole labels</span>
            <select
              value={holeLabelMode}
              onChange={(e) => setHoleLabelMode(e.target.value)}
              style={{ flex: 1, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: 11 }}
            >
              <option value="none">Off</option>
              <option value="hole_id">Hole ID</option>
              <option value="hole_id_z">Hole ID + elevation</option>
              <option value="hole_id_depth">Hole ID + total depth</option>
            </select>
          </div>
        )}

        {/* TASKS.csv #155 — Connect database / Run data QC / Boundary intercepts moved to the toolbar
            above (they're tools/dialogs, not data) — see the ge-subtoolbar block near the top of this
            return. */}

        {/* TASKS.csv #124 — select by location: only shown once there's both something to select
            (collars) and something to select against (a boundary or claim — both the same store
            collection, see #126). */}
        {collars.length > 0 && boundaries.length > 0 && (
          <div style={{ marginTop: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 10.5, color: "var(--color-text-muted)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <MapPin size={11} /> Select by location
            </div>
            <select value={selectByLocationBoundaryId} onChange={(e) => setSelectByLocationBoundaryId(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: 11.5, marginBottom: 5 }}>
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
            style={{ cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 10, textTransform: "none", letterSpacing: 0 }} title="New layer group">+ Group</span>
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
          <div key={g.id} style={{ marginBottom: 8, border: "1px solid var(--color-divider)", borderRadius: 7, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "#151b23" }}>
              <div onClick={() => toggleLayerGroupCollapsed(g.id)} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} title={g.collapsed ? "Expand group" : "Collapse group"}>
                {g.collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                onClick={() => askPrompt("Rename group:", g.name, (name) => { if (name && name.trim()) renameLayerGroup(g.id, name.trim()); })} title="Click to rename">
                {g.name} <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>({populatedKeys.length})</span>
              </div>
              {/* Bulk show/hide every layer currently in this group — "on" if ANY member is visible,
                  clicking turns them all off; clicking again (all off) turns them all on. */}
              <div onClick={() => { const anyOn = g.keys.some((k) => layerVisible[k]); g.keys.forEach((k) => { if (anyOn ? layerVisible[k] : !layerVisible[k]) toggleLayer(k); }); }}
                style={{ cursor: "pointer", color: g.keys.some((k) => layerVisible[k]) ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }} title="Toggle all layers in this group">
                {g.keys.some((k) => layerVisible[k]) ? <Eye size={13} /> : <EyeOff size={13} />}
              </div>
              <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { if (window.confirm(`Delete group "${g.name}"? Its layers stay — they just go back to being ungrouped.`)) deleteLayerGroup(g.id); }, `Delete group "${g.name}" (its layers stay, just ungrouped)`)} />
            </div>
            {!g.collapsed && (
              <div style={{ padding: "6px 6px 2px" }}>
                {populatedKeys.length === 0
                  ? <div style={{ fontSize: 10.5, color: "var(--color-text-muted)", padding: "2px 4px 6px" }}>{g.keys.length === 0 ? 'Empty — right-click a layer below and "Add to group…"' : "Every layer in this group is currently empty (no data loaded)."}</div>
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
            style={{ width: "100%", background: "var(--color-bg-subtle)", border: "1px dashed var(--color-border-light)", borderRadius: 6, padding: "7px 8px", color: "var(--color-text-secondary)", fontSize: 11.5, marginBottom: 4 }}
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
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                <div onClick={() => updateTerrain?.({ visible: terrain.visible === false })} style={{ cursor: "pointer", color: terrain.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                  {terrain.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                </div>
                <Mountain size={13} style={{ color: terrain.color || "var(--color-text-secondary)", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{terrain.name}</span>
                <input
                  type="range" min={0.1} max={1} step={0.05} value={terrain.opacity ?? 1}
                  onChange={(e) => updateTerrain?.({ opacity: Number(e.target.value) })}
                  style={{ width: 46, flexShrink: 0 }} title="Opacity"
                />
                {/* Color/opacity are also editable right here inline (terrain has no other exotic
                    settings the way rasters' drape-mode/elevation do), but the jump still goes to
                    Geophysics — that's where SRTM/DEM was imported from and where "Remove terrain"
                    lives — for consistency with every other row's edit-jump icon. */}
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("geophysics"), "Edit or remove this geophysics layer in the Geophysics tab")} />
              </div>
            )}
            {rasters.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                <div onClick={() => updateRaster(r.id, { visible: r.visible === false })} style={{ cursor: "pointer", color: r.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                  {r.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                </div>
                <Image size={13} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <input
                  type="range" min={0.1} max={1} step={0.05} value={r.opacity ?? 0.85}
                  onChange={(e) => updateRaster(r.id, { opacity: Number(e.target.value) })}
                  style={{ width: 46, flexShrink: 0 }} title="Opacity"
                />
                {/* User request ("I wanna be able to edit them from there"): jump to the full raster
                    editor (drape mode terrain/flat, fixed elevation) — the sidebar row only has room
                    for the two quick controls every layer type gets (visibility + opacity), same as
                    the Geophysics section's own ArrowUpRight pattern right below this one. */}
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("raster"), "Edit drape mode / elevation for this raster in the Raster tab")} />
                <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => removeRaster(r.id), `Remove raster "${r.name}"`)} />
              </div>
            ))}
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 10 }}>Imported via the Raster module</div>
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
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                <div onClick={() => updateBoundary(b.id, { visible: b.visible === false })} style={{ cursor: "pointer", color: b.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                  {b.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                </div>
                <Shapes size={13} style={{ color: b.color || "var(--color-text-secondary)", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
                <span style={{ color: "var(--color-text-muted)", fontSize: 10, flexShrink: 0 }}>boundary</span>
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("geophysics"), `Edit boundary "${b.name}" in the Geophysics tab`)} />
                <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => removeBoundary(b.id), `Remove boundary "${b.name}"`)} />
              </div>
            ))}
            {omfObjects.map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                <div onClick={() => updateOmfObject(o.id, { visible: o.visible === false })} style={{ cursor: "pointer", color: o.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                  {o.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                </div>
                {o.kind === "points" ? <MapPin size={13} style={{ color: o.color || "var(--color-text-secondary)", flexShrink: 0 }} />
                  : o.kind === "lines" ? <Waypoints size={13} style={{ color: o.color || "var(--color-text-secondary)", flexShrink: 0 }} />
                  : <Triangle size={13} style={{ color: o.color || "var(--color-text-secondary)", flexShrink: 0 }} />}
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                <span style={{ color: "var(--color-text-muted)", fontSize: 10, flexShrink: 0 }}>OMF {o.kind}</span>
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("geophysics"), `Edit OMF object "${o.name}" in the Geophysics tab`)} />
                <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => removeOmfObject(o.id), `Remove OMF object "${o.name}"`)} />
              </div>
            ))}
            {voxelModels.map((v) => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                <div onClick={() => updateVoxelModel(v.id, { visible: v.visible === false })} style={{ cursor: "pointer", color: v.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                  {v.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                </div>
                <Box size={13} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
                <input
                  type="range" min={0.1} max={1} step={0.05} value={v.opacity ?? 1}
                  onChange={(e) => updateVoxelModel(v.id, { opacity: Number(e.target.value) })}
                  style={{ width: 46, flexShrink: 0 }} title="Opacity"
                />
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("geophysics"), "Edit legend / classify / palette for this model in the Geophysics tab")} />
                <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => removeVoxelModel(v.id), `Remove block/voxel model "${v.name}"`)} />
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
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 4 }}>
              <div onClick={() => setLayerVisible((p) => ({ ...p, surface_samples: !p.surface_samples }))} style={{ cursor: "pointer", color: layerVisible.surface_samples ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                {layerVisible.surface_samples ? <Eye size={13} /> : <EyeOff size={13} />}
              </div>
              <Beaker size={13} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--color-text)" }}>{surfaceSamples.length} sample{surfaceSamples.length === 1 ? "" : "s"}</span>
              <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("geochem"), "Import more assays, or edit them, in the Geochem tab")} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "2px 2px 8px" }}>
              {Array.from(new Set(surfaceSamples.map((s) => s.medium))).map((m) => (
                <div key={m} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--color-text-secondary)" }}>
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
              <div onClick={() => setAssayVisible((v) => !v)} title={assayVisible ? "Hide all assay elements" : "Show assay elements"} style={{ cursor: "pointer", color: assayVisible ? "var(--color-accent)" : "var(--color-text-disabled)" }}>{assayVisible ? <Eye size={14} /> : <EyeOff size={14} />}</div>
              <div style={{ flex: 1, fontSize: 11, color: "var(--color-text-caption)" }}>
                {assayDisplayElements.length === 0 ? "No elements selected" : `${assayDisplayElements.length} element${assayDisplayElements.length > 1 ? "s" : ""} shown`}
              </div>
              {assayDisplayElements.length > 0 && (
                <span onClick={() => setAssayDisplayElements([])} style={{ cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 10.5 }}>Clear</span>
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
                      background: on ? "var(--color-bg-subtle)" : "var(--color-bg)", border: `1px solid ${on ? color : "var(--color-border)"}`, color: on ? "var(--color-text)" : "var(--color-text-caption)",
                    }}
                  >
                    <span onClick={() => toggleAssayElement(e.symbol)} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      {on && <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />}
                      {e.symbol}
                    </span>
                    {on && (
                      <Settings2
                        size={11}
                        style={{ color: styled ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}
                        {...iconAction((ev) => { ev.stopPropagation(); setAssayStyleModalSymbol(e.symbol); }, `Style ${e.symbol}${styled ? " (customized)" : ""}`)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 10, padding: "0 10px" }}>{assays.length} intervals loaded via Geochem module</div>
          </>
        )}

        <div className="ge-section-label" style={{ marginTop: 16 }}>Custom layers</div>
        {customLayers.map((l) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
            <div onClick={() => toggleCustom(l.id)} style={{ cursor: "pointer", flex: 1, fontSize: 12, color: customVisible[l.id] === false ? "var(--color-text-disabled)" : "var(--color-text)", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {customVisible[l.id] === false ? <EyeOff size={13} /> : <Eye size={13} />} <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span> <span style={{ color: "var(--color-text-muted)", fontSize: 10, flexShrink: 0 }}>({l.rows.length})</span>
            </div>
            <Maximize2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => zoomToCustom(l.id), `Zoom to custom layer "${l.name}"`)} />
            <Trash2 size={13} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => removeCustomLayer(l.id), `Remove custom layer "${l.name}"`)} />
          </div>
        ))}
        <div onClick={() => fileInputs.current.customCsv.click()} style={{ cursor: "pointer", padding: "8px 10px", background: "var(--color-bg-subtle)", border: "1px dashed var(--color-border-light)", borderRadius: 6, fontSize: 12, color: "var(--color-text-secondary)", textAlign: "center" }}>+ Add CSV layer</div>
        <input ref={setInputRef("customCsv")} type="file" accept=".csv,.zip,.gpkg,.shp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) openImportModal(f, "custom"); e.target.value = ""; }} />

        {/* TASKS.csv #155 — Snapshot to Layout / Draw cross-section (+ its buffer setting) moved to
            the toolbar above (Camera / Scissors icons) — same reasoning as Grid/Themes above. The
            saved-sections list right below stays here: it's project DATA (like a layer), not a tool. */}

        {/* TASKS.csv — slice series / fence-section generator ("slice the voxel in equal parts on a
            specified azi and width"). Generates N parallel sections tiling the visible voxel model(s)'
            and/or drilling's extent, added to the same saved-sections list below rather than opened all
            at once. */}
        <div className="ge-section-label" style={{ marginTop: sections.length ? 0 : 16 }}>Slice series (fence)</div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          Cuts the visible voxel model(s)/drilling into equal-width parallel sections at a fixed azimuth —
          each one added to the list below, ready to open individually. Includes the geophysics voxel
          slice automatically, same as any other section.
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField, flex: 1 }}>
            Azimuth (°)
            <input type="number" min="0" max="359" step="1" value={sliceSeriesAzimuth} onChange={(e) => setSliceSeriesAzimuth(((Number(e.target.value) || 0) % 360 + 360) % 360)} style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: 11 }} />
          </label>
          <label style={{ ...miniField, flex: 1 }}>
            Width (m)
            <input type="number" min="1" step="10" value={sliceSeriesWidth} onChange={(e) => setSliceSeriesWidth(Math.max(1, Number(e.target.value) || 50))} style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: 11 }} />
          </label>
          <button onClick={generateSliceSeries} style={{ ...pBtn, width: "auto", flexShrink: 0, marginBottom: 0, alignSelf: "flex-end", padding: "6px 10px" }} title="Generate the slice series"><Scissors size={13} /> Generate</button>
        </div>

        {sections.length > 0 && (() => {
          // TASKS.csv #240 — user report: a single fence-series run against a large voxel model
          // produced 3144 individual sections with no easy way to manage or clear them as a unit.
          // Grouped sections (groupId set — every fence-series run tags its own output, see
          // generateSliceSeries above) render as one collapsed row per run instead of one row per
          // section; ungrouped sections (hand-drawn via "Draw cross-section") keep rendering
          // individually exactly as before.
          const grouped = new Map();
          const ungrouped = [];
          sections.forEach((s) => {
            if (s.groupId) { if (!grouped.has(s.groupId)) grouped.set(s.groupId, []); grouped.get(s.groupId).push(s); }
            else ungrouped.push(s);
          });
          const toggleSelected = (id) => setSelectedSectionIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
          const sectionRow = (s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
              <input type="checkbox" checked={selectedSectionIds.has(s.id)} onChange={() => toggleSelected(s.id)} style={{ flexShrink: 0 }} title="Select for bulk edit/rename" />
              <div onClick={() => reopenSection(s)} title="Reopen this section" style={{ cursor: "pointer", flex: 1, minWidth: 0, fontSize: 12, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                <Scissors size={12} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                {s.contacts?.length > 0 && <span style={{ color: "var(--color-text-muted)", fontSize: 10, flexShrink: 0 }}>({s.contacts.length} contact{s.contacts.length === 1 ? "" : "s"})</span>}
              </div>
              <Layers3 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { setSelectedSectionIds(new Set([s.id])); setSectionEditOpen(true); }, `Edit what section "${s.name}" shows`)} />
              <Pencil size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => askPrompt("Section name?", s.name, (name) => { if (name && name.trim()) renameSection(s.id, name.trim()); }), `Rename section "${s.name}"`)} />
              <X size={13} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => { if (window.confirm(`Delete "${s.name}" and any contacts drawn on it?`)) deleteSection(s.id); }, `Delete section "${s.name}"`)} />
            </div>
          );
          return (
            <>
              <div className="ge-section-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Cross-sections ({sections.length})</span>
                <span
                  onClick={() => { if (window.confirm(`Delete all ${sections.length} section(s) and any contacts drawn on them? This can't be undone from here.`)) deleteAllSections(); }}
                  style={{ cursor: "pointer", color: "var(--color-danger-icon)", fontSize: 10, textTransform: "none", letterSpacing: 0 }}
                  title="Delete every section and section group"
                >Delete all</span>
              </div>
              {/* TASKS.csv #240 follow-up — user request: "edit a single section but also bulk edit a
                  bunch of sections and also bulk rename them." Bar only appears once at least one
                  section is checked (individually or via a group's own select-all checkbox below). */}
              {selectedSectionIds.size > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-selected-bg)", border: "1px solid var(--color-selected-border)", borderRadius: 6, marginBottom: 6, fontSize: 11 }}>
                  <span style={{ flex: 1, color: "var(--color-text)" }}>{selectedSectionIds.size} selected</span>
                  <span onClick={() => setSectionEditOpen(true)} style={{ cursor: "pointer", color: "var(--color-primary)" }}>Edit</span>
                  <span
                    onClick={() => askPrompt("Base name for the selected sections? (numbered automatically)", "", (base) => { if (base && base.trim()) renameSectionsBulk(Array.from(selectedSectionIds), base.trim()); })}
                    style={{ cursor: "pointer", color: "var(--color-primary)" }}
                  >Rename</span>
                  <span onClick={() => setSelectedSectionIds(new Set())} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }}>Clear</span>
                </div>
              )}
              {sectionGroups.filter((g) => grouped.has(g.id)).map((g) => {
                const members = grouped.get(g.id);
                const expanded = !!expandedSectionGroups[g.id];
                const allSelected = members.every((s) => selectedSectionIds.has(s.id));
                return (
                  <div key={g.id} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-hover-bg)", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                      <input
                        type="checkbox" checked={allSelected}
                        onChange={() => setSelectedSectionIds((p) => {
                          const n = new Set(p);
                          members.forEach((s) => allSelected ? n.delete(s.id) : n.add(s.id));
                          return n;
                        })}
                        title="Select every section in this group for bulk edit/rename" style={{ flexShrink: 0 }}
                      />
                      <div onClick={() => setExpandedSectionGroups((p) => ({ ...p, [g.id]: !p[g.id] }))} title={expanded ? "Collapse" : "Expand to show individual sections"} style={{ cursor: "pointer", flex: 1, minWidth: 0, fontSize: 12, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                        {expanded ? <ChevronUp size={12} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} /> : <ChevronDown size={12} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} />}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                        <span style={{ color: "var(--color-text-muted)", fontSize: 10, flexShrink: 0 }}>({members.length})</span>
                      </div>
                      <X size={13} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => { if (window.confirm(`Delete "${g.name}" — all ${members.length} section(s) in this group and any contacts drawn on them?`)) deleteSectionGroup(g.id); }, `Delete section group "${g.name}" and all ${members.length} section(s) in it`)} />
                    </div>
                    {expanded && <div style={{ paddingLeft: 10, marginTop: 6 }}>{members.map(sectionRow)}</div>}
                  </div>
                );
              })}
              {ungrouped.map(sectionRow)}
            </>
          );
        })()}
        </>)}

        {sidebarTab === "modeling" && (<>
        <div className="ge-section-label">Domain</div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          Restricts every tool below to one side of one or more faults — build domains
          in "Domains" further down first, then pick one here. Applies to all four tools; "Whole
          property" is the original, undomained behavior.
        </div>
        <select value={modelDomainId} onChange={(e) => setModelDomainId(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: 11.5, marginBottom: 4 }}>
          <option value="">Whole property</option>
          {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {/* TASKS.csv #52 (c) — named intercept sets. Sits with the Domain selector because it is the
            same kind of control: both narrow WHICH picks feed every tool below, one spatially and one
            by hand. */}
        <div className="ge-section-label" style={{ marginTop: 14 }}>Intercept set</div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          Restricts every tool below to a hand-picked set of intercepts — the way to model a unit that
          repeats in the pile as the separate surfaces it really is, instead of every pick of that code
          feeding one surface. Build sets in "Boundary intercepts" on the Home tab. "All intercepts" is
          the original behaviour. Structural orientation picks are not covered: the tools read those
          directly from the structure layer, not through this table.
        </div>
        <select value={activeInterceptSetId} onChange={(e) => setActiveInterceptSetId(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: 11.5, marginBottom: 4 }}>
          <option value="">All intercepts</option>
          {(interceptSets || []).map((x) => <option key={x.id} value={x.id}>{x.name} ({(x.ids || []).length})</option>)}
        </select>
        {activeInterceptSet && (activeInterceptSet.ids || []).length === 0 && (
          <div style={{ fontSize: 10, color: "var(--color-danger-icon-strong)", marginBottom: 4, lineHeight: 1.4 }}>
            "{activeInterceptSet.name}" is empty, so every tool below has nothing to model. Add
            intercepts to it in "Boundary intercepts", or switch back to All intercepts.
          </div>
        )}

        {/* TASKS.csv #88 — boundary constraint: #89 above only restricts which control points feed a
            run, this additionally clips the OUTPUT mesh to the domain, since GemPy still fits/
            extrapolates across the whole extent regardless. */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: modelDomainId ? "var(--color-text-secondary)" : "#4a5262", marginBottom: 4, cursor: modelDomainId ? "pointer" : "default" }}>
          <input type="checkbox" checked={clipToDomainBoundary} disabled={!modelDomainId} onChange={(e) => setClipToDomainBoundary(e.target.checked)} />
          Clip result to domain boundary
        </label>

        {/* TASKS.csv #231 — resolution control for every GemPy run (Implicit Model, Stratigraphic
            Stack, Structural, Alteration all funnel through the same runSurfaceStack). Lower = faster/
            coarser, higher = slower/finer; GemPy's own cost scales with grid cell count, so this is the
            single biggest lever a user has over the 80s+ run times real properties hit. */}
        <div className="ge-section-label" style={{ marginTop: 16 }}>Resolution</div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>
          Grid cells per axis for every modelling run below. Lower is faster; higher is slower but
          finer-detailed. A real property-scale run at 36 (the default) commonly takes 60-90+ seconds —
          try 24 or lower for a quick first look.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <input type="range" min={12} max={64} step={4} value={modelResolution} onChange={(e) => setModelResolution(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "var(--color-text)", width: 46, textAlign: "right", flexShrink: 0 }}>{modelResolution}³</span>
        </div>

        {/* TASKS.csv #274 — GemPy's potential-field range: the parameter that actually controls how
            tight or smooth a fitted surface is. It was never set and never reported, so the same job
            re-run could look different with nothing in the UI to point at. Auto = don't send it (GemPy's
            own default, byte-identical to every run before this control existed); the effective value is
            reported in the run notice and stamped into the surface's export provenance either way. */}
        <div className="ge-section-label" style={{ marginTop: 12 }}>Surface stiffness (advanced)</div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>
          Scales GemPy's potential-field range — the interpolator's own smoothness lever. Lower follows
          your control points more tightly (more curvature, more risk of over-fitting sparse data);
          higher gives stiffer, smoother surfaces. Leave on Auto unless a surface is visibly too
          wobbly or too flat for the data.
        </div>
        <select value={rangeMultiplier} onChange={(e) => setRangeMultiplier(Number(e.target.value))} style={{ ...smallSel, width: "100%", marginBottom: 10 }}>
          <option value={0}>Auto — GemPy's own default</option>
          <option value={0.5}>0.5x — tighter, follows the points more closely</option>
          <option value={0.75}>0.75x — slightly tighter</option>
          <option value={1.5}>1.5x — slightly smoother</option>
          <option value={2}>2x — smoother, stiffer surfaces</option>
        </select>

        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Search ellipsoid</span>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--color-text-secondary)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            <input type="checkbox" checked={searchEllipsoid.enabled} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, enabled: e.target.checked }))} /> On
          </label>
        </div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          GemPy fits one global surface, not per-query local kriging, so this can't steer the interpolator's
          own search the way classic kriging software would — what it does instead: drops
          any control point with fewer than the minimum neighbor count within an ellipsoid oriented along
          the structural trend below, so isolated points don't quietly feed a run alongside well-supported
          ones. Same trend the anisotropy layer below reuses.
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
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--color-text-secondary)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            <input type="checkbox" checked={anisotropy.enabled} onChange={(e) => setAnisotropy((p) => ({ ...p, enabled: e.target.checked }))} /> On
          </label>
        </div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          Warps every coordinate into a normalized space where this ellipsoid becomes a sphere before
          the surface is fit, then warps the result back — the standard way to get directional
          continuity (a vein behaving very differently along strike than across it) out of an
          interpolator that's otherwise isotropic. Same azimuth/dip idea as the search
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
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          Populate a block model FROM composited assays — nearest-neighbour or inverse-
          distance weighting, not a surface — a separate workflow from the implicit surface tools below.
        </div>
        <button onClick={() => setGradeEstOpen(true)} disabled={!assayElements.length} style={{ ...pBtn, opacity: assayElements.length ? 1 : 0.5, marginBottom: 8 }}>
          <FileBarChart2 size={13} /> Estimate grade into block model…
        </button>
        {/* TASKS.csv #147 — deliberately sits directly under the estimation button, because it is the
            diagnostic you are supposed to run BEFORE choosing a search radius or an anisotropy ratio,
            not a separate curiosity. It does NOT feed the estimator (GeoStrix still does not krige) —
            the modal itself says so up front; see VariogramModal.jsx's header. */}
        <button onClick={() => setVariogramOpen(true)} disabled={!assayElements.length} style={{ ...pBtn, opacity: assayElements.length ? 1 : 0.5, marginBottom: 16 }}>
          <Activity size={13} /> Variogram / spatial continuity…
        </button>

        {/* TASKS.csv #176 — lithology groups: lump codes logged differently for the same real unit
            (AND + BAS, SLT + GWK...) into one modelled unit. Same terse add/remove-list style as the
            Layers "+ Group" header above and CoreOrientationCalculator's field-reference library —
            a short, infrequently-edited list, not a modal workflow. */}
        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Lithology groups</span>
          <span onClick={() => askPrompt("New lithology group name:", "", (name) => { if (name && name.trim()) setExpandedLithoGroupId(addLithoGroup({ name: name.trim() })); })}
            style={{ cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 10, textTransform: "none", letterSpacing: 0 }} title="New lithology group">+ New group</span>
        </div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          Lump codes that were logged differently for the same real unit (e.g. andesite + basalt) into one
          modelled unit. Groups appear alongside raw codes in the pickers below; raw intervals keep their
          own colors in 3D.
        </div>
        {lithoGroups.length === 0 && (
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>No groups yet.</div>
        )}
        {lithoGroups.map((g) => {
          const open = expandedLithoGroupId === g.id;
          const codesInGroup = g.codes || [];
          const crossCuts = lithoGroupCrossCuts(g);
          const role = lithoGroupRole(g);
          return (
            <div key={g.id} style={{ border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6, background: "var(--color-bg-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
                <div onClick={() => setExpandedLithoGroupId(open ? null : g.id)} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0, display: "flex" }} title={open ? "Collapse" : "Choose which codes belong to this group"}>
                  {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </div>
                <input type="color" value={g.color || "#8a7fbf"} onChange={(e) => updateLithoGroup(g.id, { color: e.target.value })} title="Surface / legend color for this group"
                  style={{ width: 20, height: 18, padding: 0, border: "1px solid var(--color-border)", borderRadius: 3, background: "transparent", cursor: "pointer", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                  onClick={() => askPrompt("Rename lithology group:", g.name, (name) => { if (name && name.trim()) updateLithoGroup(g.id, { name: name.trim() }); })} title="Click to rename">
                  {g.name} <span style={{ color: "var(--color-text-muted)" }}>({codesInGroup.length})</span>
                </div>
                {crossCuts && <span title="Contains a cross-cutting code (fault/dyke/breccia) — excluded from the Stratigraphic stack, same rail as a raw cross-cutting code" style={{ fontSize: 9, color: "var(--color-danger-icon)", background: "#f3e3e3", border: "1px solid #dcc2c2", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>X-cut</span>}
                {!crossCuts && role === "overburden" && <span title="Every member is overburden — modelled as an overburden_base surface" style={{ fontSize: 9, color: "#8a7860", background: "#eee6da", border: "1px solid #d9cdb8", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>OB</span>}
                <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { if (window.confirm(`Delete lithology group "${g.name}"? Its codes stay in the log — they just stop being modelled together.`)) removeLithoGroup(g.id); }, `Delete lithology group "${g.name}" (its codes stay in the log, just ungrouped)`)} />
              </div>
              {open && (
                <div style={{ padding: "0 8px 8px", display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {litho_units.length === 0 && <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>No lithology codes loaded yet — import a litho CSV first.</div>}
                  {litho_units.map((u) => {
                    const on = codesInGroup.includes(u);
                    return (
                      <span key={u} onClick={() => updateLithoGroup(g.id, { codes: on ? codesInGroup.filter((c) => c !== u) : [...codesInGroup, u] })}
                        title={on ? `Remove ${u} from this group` : `Add ${u} to this group`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, padding: "2px 7px", borderRadius: 10, cursor: "pointer", userSelect: "none",
                          background: on ? "var(--color-success-bg)" : "var(--color-bg)", color: on ? "var(--color-success-text)" : "var(--color-text-secondary)", border: `1px solid ${on ? "var(--color-success-border)" : "var(--color-border)"}` }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: colorForLithology(u), flexShrink: 0 }} />{u}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* TASKS.csv #139 — fence/panel diagram. Deliberately sits immediately ABOVE the implicit
            modelling tools because it is the lighter-weight companion to them: three holes on a line
            cannot support a GemPy surface but can absolutely support a hand correlation, and that is
            the stage of a project this answers. */}
        <div className="ge-section-label" style={{ marginTop: 16 }}>Section correlation</div>
        <button
          onClick={() => setFenceOpen(true)}
          disabled={!collars.length}
          style={{ ...pBtn, marginBottom: 8, opacity: collars.length ? 1 : 0.5, cursor: collars.length ? "pointer" : "default" }}
          title="Fence / panel diagram — project the holes onto a common vertical panel along the drill line and correlate lithology hole-to-hole, with each hole's perpendicular offset from the section shown"
        ><Layers3 size={13} /> Fence / panel diagram…</button>

        <div className="ge-section-label" style={{ marginTop: 16 }}>Implicit model (beta)</div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          Models the top contact of one unit from litho intervals, via GemPy in the Python sidecar.
          Uses structure dip/azimuth for orientation when available; if not, estimates one from the
          contact points themselves so it can still run.
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "var(--color-text-secondary)", marginBottom: 8, cursor: "pointer" }} title="Also feed drawn cross-section contacts (Draw upper contact, in the section pop-out) tagged as this unit's upper contact into the run as extra interface points">
          <input type="checkbox" checked={includeSectionContacts} onChange={(e) => setIncludeSectionContacts(e.target.checked)} />
          Include drawn cross-section contacts{sections?.some((s) => s.contacts?.length) ? ` (${sections.reduce((n, s) => n + (s.contacts?.length || 0), 0)} drawn)` : ""}
        </label>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={implicitTarget} onChange={(e) => setImplicitTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: 11.5 }}>
            <option value="">Choose a unit…</option>
            {litho_units.map((u) => {
              const role = roleForLithology(u);
              return <option key={u} value={u}>{u}{role !== "stratigraphic" ? ` (${role}${isCrossCuttingRole(role) ? ", cross-cutting" : ""})` : ""}</option>;
            })}
            {/* TASKS.csv #176 — groups under their own optgroup; a mixed-role group gets no role
                suffix (no guessing), a cross-cutting group is still offered HERE (this tool has no
                non-crossing constraint), just labelled. */}
            {lithoGroups.length > 0 && (
              <optgroup label="Groups">
                {lithoGroups.map((g) => {
                  const role = lithoGroupRole(g);
                  const xcut = lithoGroupCrossCuts(g);
                  const empty = !(g.codes || []).length;
                  return <option key={g.id} value={lithoGroupKey(g)} disabled={empty}>{g.name} [{(g.codes || []).join("+") || "no codes yet"}]{xcut ? " (cross-cutting)" : role && role !== "stratigraphic" ? ` (${role})` : ""}</option>;
                })}
              </optgroup>
            )}
          </select>
          <button
            onClick={() => runImplicitModel(implicitTarget)}
            disabled={!implicitTarget || implicitBusy}
            title="Requires the Python sidecar (see status bar) with gempy installed"
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", opacity: implicitTarget && !implicitBusy ? 1 : 0.5, cursor: implicitTarget && !implicitBusy ? "pointer" : "default" }}
          >{implicitBusy ? <span style={{ fontSize: 11 }}>…</span> : <Layers3 size={14} />}</button>
        </div>

        <div className="ge-section-label" style={{ marginTop: 16 }}>Stratigraphic stack (beta)</div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          Models several units' top contacts together in one run so they can't cross each other —
          add units below in order, youngest (shallowest) first. Litho-only: veins/dykes cut across a
          stack by nature, so model those with the Structural tool instead, not here.
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={stackAdd} onChange={(e) => { addStackUnit(e.target.value); setStackAdd(""); }} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: 11.5 }}>
            <option value="">Add a unit…</option>
            {/* TASKS.csv #241 — cross-cutting units (fault/dyke/breccia) are hidden here, not just
                warned about in the paragraph above: they break the tool's own non-crossing guarantee,
                so they're unselectable rather than trusting the user to read the warning first. */}
            {litho_units.filter((u) => !stackUnits.includes(u) && !isCrossCuttingRole(roleForLithology(u))).map((u) => {
              const role = roleForLithology(u);
              return <option key={u} value={u}>{u}{role === "overburden" ? " (overburden)" : ""}</option>;
            })}
            {/* TASKS.csv #176 — groups with ANY cross-cutting member are excluded here, same rail as
                a raw cross-cutting code just above. */}
            {lithoGroups.some((g) => !stackUnits.includes(lithoGroupKey(g)) && !lithoGroupCrossCuts(g)) && (
              <optgroup label="Groups">
                {lithoGroups.filter((g) => !stackUnits.includes(lithoGroupKey(g)) && !lithoGroupCrossCuts(g)).map((g) => {
                  const empty = !(g.codes || []).length;
                  return <option key={g.id} value={lithoGroupKey(g)} disabled={empty}>{g.name} [{(g.codes || []).join("+") || "no codes yet"}]{lithoGroupRole(g) === "overburden" ? " (overburden)" : ""}</option>;
                })}
              </optgroup>
            )}
          </select>
        </div>
        {stackUnits.length === 0 && (
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>No units added yet.</div>
        )}
        {stackUnits.map((u, i) => {
          // TASKS.csv #176 — a `group:` entry shows the group's name and gets a badge only when every
          // member shares the role (mixed => plain, no guessing); a since-deleted group is flagged.
          const grp = isLithoGroupKey(u) ? resolveLithoTarget(u) : null;
          const role = isLithoGroupKey(u) ? (grp ? lithoGroupRole(grp) : null) : roleForLithology(u);
          const display = isLithoGroupKey(u) ? (grp ? grp.name : "(deleted group)") : u;
          return (
          <div key={u} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: "var(--color-text-muted)", width: 14, flexShrink: 0 }}>{i + 1}</span>
            {grp && <span style={{ width: 8, height: 8, borderRadius: 2, background: grp.color || "#8a7fbf", flexShrink: 0 }} title={`Group: ${(grp.codes || []).join(" + ")}`} />}
            <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: grp || !isLithoGroupKey(u) ? "var(--color-text)" : "var(--color-danger-icon)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={grp ? `Group: ${(grp.codes || []).join(" + ")}` : undefined}>{display}</div>
            {role === "overburden" && <span title="Overburden — tagged as its own surface type (overburden_base) rather than an ordinary stratigraphic contact" style={{ fontSize: 9, color: "#8a7860", background: "#eee6da", border: "1px solid #d9cdb8", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>OB</span>}
            <ChevronUp size={13} style={{ cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "var(--color-border-light)" : "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => moveStackUnit(u, -1), `Move "${u}" up in the stratigraphic stack`)} />
            <ChevronDown size={13} style={{ cursor: i === stackUnits.length - 1 ? "default" : "pointer", color: i === stackUnits.length - 1 ? "var(--color-border-light)" : "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => moveStackUnit(u, 1), `Move "${u}" down in the stratigraphic stack`)} />
            <X size={13} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => removeStackUnit(u), `Remove "${u}" from the stratigraphic stack`)} />
          </div>
          );
        })}
        {/* TASKS.csv #271 — GemPy's own StructuralGroup semantics, exposed instead of hardcoded. */}
        <label style={{ display: "block", fontSize: 10, color: "var(--color-text-secondary)", marginTop: 6 }} title="Erode: each younger unit truncates everything below it — an erosional unconformity. Onlap: units drape onto and terminate against the surface below rather than cutting it — a conformable pile, which is the usual case for a volcanic stratigraphy (and so for VMS-hosting sequences).">
          Unit relationship
          <select value={stackRelation} onChange={(e) => setStackRelation(e.target.value)} style={{ ...smallSel, width: "100%", marginTop: 3 }}>
            <option value="erode">Erode — younger units truncate older (unconformity)</option>
            <option value="onlap">Onlap — units drape/terminate against those below (conformable pile)</option>
          </select>
        </label>
        <div style={{ fontSize: 9.5, color: "var(--color-text-muted)", margin: "4px 0 6px", lineHeight: 1.45 }}>
          {stackRelation === "erode"
            ? "Erosional: each unit is fitted in its own structural group and truncates the ones beneath it. Right for an unconformity; wrong for a conformable volcanic pile, where it will cut contacts that should simply drape."
            : "Conformable: every unit shares one interpolated field, so the surfaces stay parallel and can never cross. Usually the right choice for a layered volcanic/sedimentary sequence — including the VMS-hosting stratigraphy this app is built around — and the default."}
        </div>
        <button
          onClick={() => runStackModel(stackUnits)}
          disabled={stackUnits.length < 2 || implicitBusy}
          title="Requires the Python sidecar (see status bar) with gempy installed"
          style={{ ...pBtn, marginTop: 4, opacity: stackUnits.length >= 2 && !implicitBusy ? 1 : 0.5, cursor: stackUnits.length >= 2 && !implicitBusy ? "pointer" : "default" }}
        ><Layers3 size={13} /> {implicitBusy ? "Running…" : `Run stack (${stackUnits.length} unit${stackUnits.length === 1 ? "" : "s"})`}</button>

        <div className="ge-section-label" style={{ marginTop: 16 }}>Structural modeling (beta)</div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          Models a surface from one structure-plane type (e.g. a fault or shear) using each pick's own
          position and dip/azimuth — no separate contact layer needed.
        </div>
        {/* User request: "we need to find a way to calculate the beta angle for non-oriented drilling
            based on field structural measurements" — the alpha-beta method (coreOrientation.js), placed
            right above the Stereonet QC button since it's the natural upstream step: solve a pick's true
            orientation here, then feed it (or the whole layer) into that QC/trend-checking tool. */}
        <button
          onClick={() => setCoreOrientOpen(true)}
          style={{ ...pBtn, marginBottom: 8 }}
          title="Recover a non-oriented core pick's true dip/dip-direction by calibrating against a known field/outcrop structural reading"
        ><Compass size={13} /> Core orientation calculator</button>
        {/* TASKS.csv #141 — check the structure picks' own orientation trend/scatter BEFORE feeding them
            into the anisotropy or structural-surface tools above/below. */}
        <button
          onClick={() => setStereonetOpen(true)}
          disabled={!(layers.structure || []).some((s) => s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth))}
          style={{ ...pBtn, marginBottom: 8, opacity: (layers.structure || []).length ? 1 : 0.5, cursor: (layers.structure || []).length ? "pointer" : "default" }}
          title="Pole-plot / great-circle stereonet of the Structure layer's dip/azimuth picks"
        ><Milestone size={13} /> Stereonet (QC picks)</button>
        {/* TASKS.csv #277 — the downhole (tadpole) view, sitting next to the Stereonet because the two
            are the pair a geologist works structural data with: this one answers "where in the hole,
            and does it change at a contact", the stereonet answers "what is the orientation
            population". Neither replaces the other, and this one is normally opened first. */}
        <button
          onClick={() => setTadpoleOpen(true)}
          disabled={!(layers.structure || []).some((s) => s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth))}
          style={{ ...pBtn, marginBottom: 8, opacity: (layers.structure || []).length ? 1 : 0.5, cursor: (layers.structure || []).length ? "pointer" : "default" }}
          title="Downhole tadpole plot — depth vs alpha/dip with an azimuth tail, plus lithology and structure-frequency tracks, per hole"
        ><Milestone size={13} /> Downhole structure (tadpole)</button>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={structuralTarget} onChange={(e) => setStructuralTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: 11.5 }}>
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
        {/* TASKS.csv #272 — this tool no longer builds a draped contact through the alteration tops via
            GemPy; it interpolates a 0/1 "altered?" indicator and takes the 0.5 iso-surface, which is a
            closed envelope with no assumed up-direction. Runs in-app, no sidecar. */}
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          Builds a closed halo envelope for one assemblage: every logged alteration interval becomes a
          0/1 "altered?" sample down its hole, interpolated onto a grid, iso-surfaced at 0.5. Unlike the
          lithology/structural tools this makes no assumption about which way is "up" — a halo wraps its
          conduit rather than draping like a contact. Runs in-app, no Python sidecar needed.
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={alterationTarget} onChange={(e) => setAlterationTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: 11.5 }}>
            <option value="">Choose an assemblage…</option>
            {alt_units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button
            onClick={() => runAlterationModel(alterationTarget)}
            disabled={!alterationTarget || alterationBusy}
            title="Build a closed alteration-halo envelope from the logged intervals (runs in-app)"
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", opacity: alterationTarget && !alterationBusy ? 1 : 0.5, cursor: alterationTarget && !alterationBusy ? "pointer" : "default" }}
          >{alterationBusy ? <span style={{ fontSize: 11 }}>…</span> : <Layers3 size={14} />}</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField }} title="Grid cell size for the indicator interpolation. 0 = auto (about 1/8 of the search radius).">Cell size (m)
            <input type="number" min={0} value={alterationCellSize} onChange={(e) => setAlterationCellSize(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
          </label>
          <label style={{ ...miniField }} title="Search radius for the indicator interpolation, and the padding the envelope is given to close outside the outermost altered sample. 0 = auto (about 1.2x the median hole spacing).">Search (m)
            <input type="number" min={0} value={alterationSearchRadius} onChange={(e) => setAlterationSearchRadius(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
          </label>
        </div>
        <div style={{ fontSize: 9.5, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          0 = auto (derived from your own hole spacing). The model domain and the anisotropy trend are
          honoured; the search ellipsoid's minimum-neighbour filter is not — it exists to drop
          under-supported contact picks, which a closed envelope has none of.
        </div>
        {alterationBusy && <div style={{ fontSize: 10, color: "var(--color-success-text)", marginTop: -4, marginBottom: 8 }}>Building the halo envelope…</div>}

        {/* TASKS.csv #144 — vein/dyke tool. The copy here deliberately states what the construction can
            and cannot do (paired by construction; thickness between holes is interpolated), because a
            vein drawn from a handful of intercepts looks far more certain on screen than it is. */}
        <div className="ge-section-label" style={{ marginTop: 16 }}>Vein / dyke modeling (beta)</div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          Models a vein or dyke as a PAIR of contacts: each logged interval's from-depth and to-depth are
          the two walls of one structure. A midplane is fitted through the intercept midpoints and a
          TRUE-thickness field (downhole length corrected for how obliquely each hole cuts the vein) is
          interpolated over it; the hangingwall and footwall are that midplane offset by half the
          thickness each way, so they stay a consistent thickness apart and cannot cross. Runs in-app,
          no Python sidecar needed.
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select value={veinTarget} onChange={(e) => setVeinTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: 11.5 }}>
            <option value="">Choose a vein / dyke…</option>
            {vein_units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button
            onClick={() => runVeinModel(veinTarget)}
            disabled={!veinTarget || veinBusy}
            title="Build paired hangingwall/footwall surfaces plus a closed solid from the logged vein intervals (runs in-app)"
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", opacity: veinTarget && !veinBusy ? 1 : 0.5, cursor: veinTarget && !veinBusy ? "pointer" : "default" }}
          >{veinBusy ? <span style={{ fontSize: 11 }}>…</span> : <Layers3 size={14} />}</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField }} title="Grid spacing across the vein plane. 0 = auto (about 1/12 of the search radius).">Cell size (m)
            <input type="number" min={0} value={veinCellSize} onChange={(e) => setVeinCellSize(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
          </label>
          <label style={{ ...miniField }} title="In-plane search radius for the midplane and thickness interpolation, and how far the modelled vein is allowed to extend past the outermost intercept. 0 = auto (about 1.5x the median intercept spacing).">Search (m)
            <input type="number" min={0} value={veinSearchRadius} onChange={(e) => setVeinSearchRadius(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField }} title="Optional. Leave both blank to fit the vein's attitude from the intercept midpoints. Required when every intercept lies on one section line, because collinear midpoints cannot fix a plane.">Dip (°)
            <input type="number" min={0} max={90} value={veinDip} placeholder="fit" onChange={(e) => setVeinDip(e.target.value)} style={{ ...smallSel, width: "100%" }} />
          </label>
          <label style={{ ...miniField }} title="Optional. Dip DIRECTION (not strike), 0-360. Only used when a dip is also entered.">Dip dir (°)
            <input type="number" min={0} max={360} value={veinDipDir} placeholder="fit" onChange={(e) => setVeinDipDir(e.target.value)} style={{ ...smallSel, width: "100%" }} />
          </label>
        </div>
        <div style={{ fontSize: 9.5, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          0 = auto (derived from your own intercept spacing). Dip / dip direction blank = fitted from the
          data. Adds three surfaces: hangingwall, footwall, and a closed solid for volume. Between holes
          the shape and thickness are interpolated, so treat the result as an interpretation — a pinch-out
          or swell no hole intersected will not be in it.
        </div>
        {veinBusy && <div style={{ fontSize: 10, color: "var(--color-success-text)", marginTop: -4, marginBottom: 8 }}>Building the vein pair…</div>}

        {/* TASKS.csv #142 — numeric implicit model (grade shell). Runs entirely in the browser (no
            sidecar): IDW onto a dense grid + marching cubes at the cutoff. Result lands in the
            Generated surfaces list below like any GemPy surface. */}
        <div className="ge-section-label" style={{ marginTop: 16 }}>Numeric implicit model (grade shell)</div>
        {/* TASKS.csv #269 — standing, unmissable framing. The QP review's explicit recommendation was
            NOT to add a Measured/Indicated/Inferred classifier (that is a QP's professional judgement,
            and deriving a regulatory label from a search radius would launder a parameter choice into
            a regulatory term). The real live risk is the opposite one: the app emitted confident
            tonnages with zero classification context. This is the fix — framing, not features. */}
        <div style={{ fontSize: 10.5, color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "8px 9px", marginBottom: 8, lineHeight: 1.45 }}>
          <strong>Not a resource estimate.</strong> This builds an interpolated envelope to help you
          visualise and target mineralisation. It has no anisotropy, no variogram, no classification and
          no dilution or recovery. Nothing it produces is a Mineral Resource under NI 43-101 or JORC, and
          it must not be reported publicly as one.
        </div>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          Builds a wireframe envelope of everything at or above a cutoff grade directly from
          assay values — inverse-distance interpolation onto a grid, then an iso-surface at the cutoff.
          Runs in-app, no Python sidecar needed.
          {/* TASKS.csv #273 — this tool was a second, uncoupled interpolator that consumed none of the
              shared search-ellipsoid/anisotropy/domain machinery. The domain and the anisotropy trend
              are now threaded through it (see runNumericModel); the search ellipsoid's minimum-neighbour
              filter deliberately still isn't, and the panel says so instead of leaving the difference
              for the user to discover. */}
          {" "}It honours the model domain and the anisotropy trend set above. It does <strong>not</strong>{" "}
          apply the search ellipsoid's minimum-neighbour filter — that exists to drop under-supported
          contact picks, and dropping isolated assays would delete grade rather than improve the shell.
        </div>
        {(() => {
          const symbols = assayElements.map((e) => e.symbol);
          const sym = numericSymbol || symbols[0] || "";
          const unit = assayElements.find((e) => e.symbol === sym)?.unit || "ppm";
          const canRun = symbols.length > 0 && collars.length > 0 && !numericBusy && Number.isFinite(numericCutoff);
          return (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <label style={{ ...miniField }} title="Assay element to model">Element
                  <select value={sym} onChange={(e) => setNumericSymbol(e.target.value)} style={{ ...smallSel, width: "100%" }} disabled={!symbols.length}>
                    {symbols.length === 0 && <option value="">— no assays —</option>}
                    {symbols.map((s) => <option key={s} value={s}>{s} ({assayElements.find((e) => e.symbol === s)?.unit || "ppm"})</option>)}
                  </select>
                </label>
                {/* TASKS.csv #270 (LOW-1) — every geologist and every press release says g/t, never ppm.
                    Numerically identical for a solid, but a cutoff typo of one order of magnitude is a
                    real risk, so show the unit the user actually thinks in and keep ppm in the tooltip. */}
                <label style={{ ...miniField }} title={`Iso-value: the shell encloses every interpolated cell at or above this grade.${PRECIOUS_METALS.has(sym) && unit === "ppm" ? " Displayed as g/t; stored as ppm \u2014 numerically identical for a solid (1 g/t = 1 ppm)." : ""}`}>Cutoff ({PRECIOUS_METALS.has(sym) && unit === "ppm" ? "g/t" : unit})
                  <input type="number" step="any" value={numericCutoff} onChange={(e) => setNumericCutoff(e.target.value === "" ? NaN : Number(e.target.value))} style={{ ...smallSel, width: "100%" }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <label style={{ ...miniField }} title="Interpolation grid cell size (cubic). Smaller = smoother shell but more cells; capped by the same block limit as grade estimation.">Cell (m)
                  <input type="number" min="0.5" step="any" value={numericCellSize} onChange={(e) => setNumericCellSize(Math.max(0.5, Number(e.target.value) || 10))} style={{ ...smallSel, width: "100%" }} />
                </label>
                {/* TASKS.csv #292 — "0 = unlimited" actively invited the pathological setting: an
                    unbounded search made every sample a candidate for every cell (measured: 81 s of
                    blocked main thread at 62,500 cells x 5,000 points, 250 s at the block cap). 0 now
                    means "cap at the grid diagonal", which is a no-op mathematically and a real bound
                    computationally. */}
                <label style={{ ...miniField }} title="No sample within this distance of a grid cell leaves it un-estimated (no shell there) rather than extrapolating grade far from real data. 0 = no radius assumption, capped internally at the grid's own diagonal so the run can't hang — but a real radius is both faster and far more defensible.">Search (m)
                  <input type="number" min="0" step="any" value={numericSearchRadius} onChange={(e) => setNumericSearchRadius(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
                </label>
                <label style={{ ...miniField }} title="Extends the grid past the outermost sample so the shell can close beyond the last hole">Pad (m)
                  <input type="number" min="0" step="any" value={numericPadding} onChange={(e) => setNumericPadding(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "flex-end" }}>
                <label style={{ ...miniField }}>Method
                  {/* TASKS.csv #87 — one shared method table (estimation.js) drives this dropdown and
                      GradeEstimationModal's, so the grade shell and the block model can never offer
                      different methods or mean different things by the same method id. */}
                  <select value={numericMethod} onChange={(e) => setNumericMethod(e.target.value)} style={{ ...smallSel, width: "100%" }} title={ESTIMATION_METHODS.find((m) => m.id === numericMethod)?.blurb || ""}>
                    {ESTIMATION_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </label>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title="Regularize raw assay intervals to a fixed length first (recommended — same compositing as Grade estimation, TASKS #118)">
                <input type="checkbox" checked={numericUseComposites} onChange={(e) => setNumericUseComposites(e.target.checked)} />
                Composite first
                {numericUseComposites && (
                  <input type="number" step="any" min="0.1" value={numericCompositeLength} onChange={(e) => setNumericCompositeLength(Math.max(0.1, Number(e.target.value) || 2))} style={{ ...smallSel, width: 50, marginLeft: 4 }} title="Composite length (m)" />
                )}
                {numericUseComposites && <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>m</span>}
              </label>
              {/* TASKS.csv #262 — minCoverage was hardcoded at 0.5 here with no way to tighten it. */}
              {numericUseComposites && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "var(--color-text-secondary)", marginBottom: 4 }} title="Minimum fraction of a composite interval that must actually be covered by real assay data (vs. missing/lost core) for it to be used. At the 50% default, a half-missing-core composite still counts as a full sample.">
                  Min coverage
                  <input type="number" step="1" min="0" max="100" value={Math.round(numericMinCoverage * 100)} onChange={(e) => setNumericMinCoverage(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)} style={{ ...smallSel, width: 50 }} />
                  <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>%</span>
                </label>
              )}
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                {/* TASKS.csv #259 — high-grade capping was implemented in compositeDownhole and wired
                    only into CompositingModal; the grade shell composited uncapped, so a single bonanza
                    assay drove IDW² across its whole search neighbourhood. */}
                <label style={{ ...miniField }} title="Cap every RAW assay at this grade before compositing (commonly the 97.5th-99th percentile of the element's distribution). Blank = no cap. For a nuggety, log-normal element like Au in an epithermal system, estimating without a cap overstates grade.">High-grade cap ({PRECIOUS_METALS.has(sym) && unit === "ppm" ? "g/t" : unit})
                  <input type="number" min="0" step="any" placeholder="none" value={Number.isFinite(numericCapValue) ? numericCapValue : ""} onChange={(e) => setNumericCapValue(e.target.value === "" ? NaN : Number(e.target.value))} style={{ ...smallSel, width: "100%" }} />
                </label>
                {/* TASKS.csv #258 — minSamples counts sample POINTS: one hole composited at 2 m supplies
                    ~25 of them inside a 50 m radius, so it can never express "at least two holes must
                    see this cell". This can. */}
                <label style={{ ...miniField }} title="A grid cell is only estimated if samples from at least this many DISTINCT drillholes fall inside its search radius. 1 lets a single hole populate a whole 50m-radius sphere of 'mineralisation' with continuity asserted rather than demonstrated; 2 (or 3) is the standard first sanity constraint.">Min holes
                  <input type="number" min="1" step="1" value={numericMinHoles} onChange={(e) => setNumericMinHoles(Math.max(1, Math.round(Number(e.target.value) || 1)))} style={{ ...smallSel, width: "100%" }} />
                </label>
              </div>
              {/* TASKS.csv #266 — QC inserts were excluded from Best Intercepts / Compositing / Grade
                  Statistics but reached the grade shell unfiltered. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title="QC samples (standards/blanks/duplicates, detected by hole_id naming) are excluded by default, the same as the Best Intercepts, Compositing and Grade Statistics panels. A field duplicate logged under its parent hole's id would otherwise be double-counted in the estimate.">
                <input type="checkbox" checked={numericIncludeQAQC} onChange={(e) => setNumericIncludeQAQC(e.target.checked)} />
                Include QC samples (standards/blanks/duplicates)
              </label>
              {/* TASKS.csv #257 — relabelled and now defaulting OFF. With this on, every grid node with
                  no sample in range reads as below cutoff and the shell closes halfway to it: that wall
                  is the SEARCH RADIUS, not a grade boundary, and computeMeshVolume happily calls the
                  result watertight. Volume then scales as R³ while looking converged and stable. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title="Off (default): the shell stays open where the data runs out - honest, but there is no enclosed volume to report. On: the shell is sealed at the search-radius boundary so it becomes a watertight solid with a volume and tonnage - but that seal is your search radius, not a grade boundary, so the volume is an assumption you are making, not something measured. Doubling the search radius roughly multiplies the volume by eight.">
                <input type="checkbox" checked={numericCloseShell} onChange={(e) => setNumericCloseShell(e.target.checked)} />
                Close shell artificially at the search-radius boundary (volume becomes an assumption)
              </label>
              {numericCloseShell && (
                <div style={{ fontSize: 9.5, color: "#a5691f", marginBottom: 8, lineHeight: 1.45 }}>
                  Part of this shell's boundary will not be a grade boundary — it is where the search
                  radius ran out of samples. Its volume will depend on your search radius, not only on
                  the data.
                </div>
              )}
              {/* TASKS.csv #292 — warn before the work, not after (pattern from #209). */}
              {!(numericSearchRadius > 0) && (
                <div style={{ fontSize: 9.5, color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "6px 7px", marginBottom: 8, lineHeight: 1.45 }}>
                  With no search radius, every grid cell is estimated from the whole dataset — the run can
                  take a minute or more and the window will be unresponsive while it does. Set a real
                  search radius unless you specifically want an unbounded first pass.
                </div>
              )}
              <button
                onClick={runNumericModel}
                disabled={!canRun}
                title={symbols.length ? (collars.length ? "Interpolate grades onto a grid and extract the cutoff iso-surface" : "Load collars first") : "Import assays first"}
                style={{ ...pBtn, marginBottom: 8, opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "default" }}
              ><Shapes size={13} /> {numericBusy ? "Running…" : `Generate ${sym || "grade"} shell`}</button>
            </>
          );
        })()}

        <div className="ge-section-label" style={{ marginTop: 16 }}>Generated surfaces</div>
        {/* TASKS.csv #146 — query the generated surfaces rather than only look at them: how far is each
            hole from this surface, where does it pierce it, and how many downhole metres sit inside it.
            Lives here because every one of those questions is about a surface in this list. */}
        <button
          onClick={() => setSurfaceQueryOpen(true)}
          disabled={!implicitSurfaces.length}
          style={{ ...pBtn, marginBottom: 8, opacity: implicitSurfaces.length ? 1 : 0.5, cursor: implicitSurfaces.length ? "pointer" : "default" }}
          title="Distance-to-surface / point-in-domain report — closest approach and pierce depths for every hole, downhole metres inside a closed shell, and a single-point distance/inside query"
        ><Ruler size={13} /> Distance / inside query…</button>
        {/* TASKS.csv #148 — overlay an imported solid (pit shell, stope design, someone else's
            wireframe) alongside the generated ones for an as-built vs. as-planned check. Sits in this
            section, not in a separate one, because an imported solid IS an entry in the list below —
            it gets the same show/hide, remove, query and export controls with no parallel code path. */}
        <button
          onClick={() => importSolidRef.current?.click()}
          style={{ ...pBtn, marginBottom: 8 }}
          title="Import a DXF (3DFACE / polyface mesh) or OBJ solid — pit shell, stope design, or a wireframe from another package — and overlay it on the drillholes. Coordinates are used as-is, in the project CRS."
        ><Box size={13} /> Import solid (DXF / OBJ)…</button>
        <input
          ref={importSolidRef}
          type="file"
          accept={SOLID_IMPORT_EXTENSIONS}
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importSolidFile(f); e.target.value = ""; }}
        />
        {/* TASKS.csv #90 — topological relationship checking. #83 let a surface DECLARE that it sits
            below / above / must not cross another one, but nothing ever checked the geometry against
            those declarations, so a run could produce a well-triangulated surface that cuts straight
            through a unit it is declared to sit under and the app said nothing. This is the checker:
            mesh-mesh intersection plus a vertical sidedness test (src/lib/topology.js), reported into
            the same notices/toast stream every modelling run already uses. */}
        <button
          onClick={runTopologyCheck}
          disabled={!implicitSurfaces.length || topologyBusy}
          style={{ ...pBtn, marginBottom: 8, opacity: implicitSurfaces.length && !topologyBusy ? 1 : 0.5, cursor: implicitSurfaces.length && !topologyBusy ? "pointer" : "default" }}
          title="Check the generated surfaces against the relationships declared on them (expand a surface's row to declare one): surfaces that intersect where they shouldn't, a surface on the wrong side of one it is declared below/above, and contact surfaces that fold back over themselves."
        ><ShieldAlert size={13} /> {topologyBusy ? "Checking relationships…" : "Check relationships"}</button>
        {implicitSurfaces.length === 0 && (
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 10, lineHeight: 1.4 }}>None yet — run one of the tools above. Generated surfaces now save with the project (mesh, type, declared relationships and the parameters that produced them), so a reported volume or tonnage can be reproduced after a restart. Binding a surface to a saved theme is still a follow-up.</div>
        )}
        {implicitSurfaces.map((s) => {
          const expanded = expandedSurfaceId === s.id;
          const otherSurfaces = implicitSurfaces.filter((o) => o.id !== s.id);
          return (
            <div key={s.id} style={{ background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
                <div onClick={() => toggleImplicitSurface(s.id)} style={{ cursor: "pointer", color: s.visible ? "var(--color-accent)" : "var(--color-text-disabled)" }}>{s.visible ? <Eye size={13} /> : <EyeOff size={13} />}</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${s.vertexCount} vertices, ${s.faceCount} faces`}>{s.name}</div>
                {/* TASKS.csv #93 — version badge, only when this surface is actually part of a lineage,
                    so a project with no re-runs looks exactly as it did before. */}
                {(() => {
                  const info = surfaceLineageInfo.byId.get(s.id);
                  if (!info || info.lineage.length < 2) return null;
                  return (
                    <span
                      style={{ flexShrink: 0, fontSize: 9, color: s.accepted ? "#20512f" : "var(--color-text-secondary)", background: s.accepted ? "#eaf3ec" : "#e8eaee", border: `1px solid ${s.accepted ? "#c6e0cb" : "var(--color-border)"}`, borderRadius: 4, padding: "1px 4px" }}
                      title={s.accepted ? `Version ${info.index + 1} of ${info.lineage.length} — marked as the version you are working from (a record of your choice, not a validation of the run)` : `Version ${info.index + 1} of ${info.lineage.length} of this surface`}
                    >v{info.index + 1}/{info.lineage.length}{s.accepted ? " ✓" : ""}</span>
                  );
                })()}
                {/* TASKS.csv #83 — expand to set this surface's geological type + declared
                    relationships to other surfaces (metadata only for now — see this entry's own
                    TASKS.csv note on what reads it later: #88 constraints, #90 topology checks). */}
                <div onClick={() => setExpandedSurfaceId(expanded ? null : s.id)} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} title="Type & relationships">
                  {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </div>
                <Maximize2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => zoomToImplicitSurface(s.id), `Zoom to surface "${s.name}"`)} />
                <X size={13} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => removeImplicitSurface(s.id), `Remove surface "${s.name}"`)} />
              </div>
              {expanded && (
                <div style={{ padding: "0 8px 8px", borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>
                  {/* TASKS.csv #91/#92 — data-support display for surfaces that carry a classification. */}
                  {s.surfaceSupportCounts && (
                    <div style={{ marginBottom: 8 }}>
                      <button
                        onClick={() => toggleSurfaceSupportColors(s.id)}
                        style={{ width: "100%", padding: "5px 0", borderRadius: 5, fontSize: 10.5, cursor: "pointer", border: "1px solid var(--color-border-light)", background: s.supportColored ? "#eef3ee" : "transparent", color: "var(--color-text-secondary)" }}
                      >
                        {s.supportColored ? "Show normal colours" : "Colour by data support"}
                      </button>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 5, fontSize: 9.5, color: "var(--color-text-secondary)" }}>
                        {["interpolated", "extrapolated", "unsupported"].map((k) => (
                          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: SUPPORT_COLORS[k], display: "inline-block" }} />
                            {(s.surfaceSupportCounts[k] || 0).toLocaleString()} {k}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: 9.5, color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.45 }}>
                        Counted over this surface's own vertices. Green means the composites that produced
                        that part of the surface bracket it on all three axes from at least two holes.
                        A geometric data-support measure — not a confidence interval or a kriging variance.
                      </div>
                    </div>
                  )}
                  <label style={{ fontSize: 10, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>
                    Type
                    <select value={s.type || "other"} onChange={(e) => setSurfaceType(s.id, e.target.value)} style={{ ...smallSel, width: "100%", marginTop: 3 }}>
                      {SURFACE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </label>
                  <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 4 }}>Relationships to other surfaces</div>
                  {(s.relationships || []).length === 0 && <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 6 }}>None declared.</div>}
                  {(s.relationships || []).map((r, i) => {
                    const target = implicitSurfaces.find((o) => o.id === r.targetId);
                    const relLabel = RELATION_TYPES.find((rt) => rt.key === r.relation)?.label || r.relation;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, marginBottom: 4 }}>
                        <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {relLabel} <span style={{ color: "var(--color-text-secondary)" }}>{target ? target.name : "(removed surface)"}</span>
                        </div>
                        <X size={11} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => removeSurfaceRelationship(s.id, i), `Remove this relationship from surface "${s.name}"`)} />
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
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Generate another surface to declare a relationship to it.</div>
                  )}

                  {/* TASKS.csv #52 (d) — CROSS-CUTTING. The stack tool excludes veins and dykes by
                      design (see #61), so a dyke and the contacts it cuts were previously two
                      unrelated meshes drawn through each other. This applies the cut. */}
                  <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 10, marginBottom: 4, borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>Cross-cutting</div>
                  {otherSurfaces.length > 0 ? (
                    <>
                      <div style={{ display: "flex", gap: 4 }}>
                        <select value={cutterDraft} onChange={(e) => setCutterDraft(e.target.value)} style={{ ...smallSel, flex: 1 }}>
                          <option value="">— cut this surface with… —</option>
                          {otherSurfaces.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <button
                          disabled={!cutterDraft || crossCutBusy}
                          onClick={() => runCrossCut(s.id, cutterDraft)}
                          style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "4px 8px", opacity: !cutterDraft || crossCutBusy ? 0.5 : 1, cursor: !cutterDraft || crossCutBusy ? "default" : "pointer" }}
                        >{crossCutBusy ? "Cutting…" : "Apply"}</button>
                      </div>
                      <div style={{ fontSize: 9.5, color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.45 }}>
                        A closed body (a vein/dyke solid, a shell) removes the part of this surface inside
                        it and leaves a clean truncation. An open surface (a fault) divides this one into
                        two fault blocks instead — geometry only, with no displacement applied. If the
                        cutting body doesn't reach this surface, nothing changes and it says so.
                        Regenerating either surface undoes the cut; what was cut is recorded below under
                        Parameters used.
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Model a dyke, vein or fault to cut this surface with it.</div>
                  )}

                  {/* TASKS.csv #140 — volume/tonnage. Only meaningful for a genuinely closed solid, so a
                      non-watertight mesh (e.g. a clipped-open surface, a fault plane, a draped contact
                      sheet) still shows the raw divergence-theorem number but flags it rather than
                      presenting it with false confidence. */}
                  <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 10, marginBottom: 4, borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>Volume &amp; tonnage</div>
                  {expandedSurfaceVolume ? (
                    <>
                      {/* TASKS.csv #268 — computeMeshVolume documents that it assumes scene units are
                          metres; the panel printed m³/t unconditionally. A project left in geographic
                          degrees, or in feet, produced a confidently-labelled number in the wrong unit
                          with no complaint. dataQC already warns about a missing EPSG; that warning
                          never reached here. */}
                      {isMetricProjectedEpsg(project?.epsg) !== true ? (
                        <div style={{ fontSize: 10, color: "var(--color-danger-icon-strong)", lineHeight: 1.45, marginBottom: 6 }}>
                          {project?.epsg
                            ? `This project's CRS (EPSG:${project.epsg}) isn't a projected, metre-based system — or isn't one GeoStrix can confirm as one.`
                            : "No CRS is set for this project."}
                          {" "}Volume and tonnage assume the coordinates are in metres, so nothing here can
                          be reported in m³ or tonnes until a projected, metre-based CRS is set (Project
                          settings). The mesh itself is unaffected.
                        </div>
                      ) : (
                      <>
                      <div style={{ fontSize: 11, color: "var(--color-text)", marginBottom: 4 }}>
                        Volume: <strong>{expandedSurfaceVolume.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³</strong>
                      </div>
                      {/* TASKS.csv #257 — an ARTIFICIALLY closed shell is watertight, so the old
                          !watertight-only caution never fired for the single most misleading case in
                          the whole tool. Closure mode is recorded on the surface at generation time. */}
                      {s.closure === "artificial" && (
                        <div style={{ fontSize: 10, color: "#a5691f", marginBottom: 6, lineHeight: 1.45 }}>
                          <strong>This shell was closed artificially.</strong> Part of its boundary is not a
                          grade boundary — it is where the search radius ran out of samples. The volume
                          therefore depends on your search radius, not only on the data: doubling the search
                          radius roughly multiplies the volume by eight. Treat it as a visualisation of where
                          grades might extend, not a measured volume.
                        </div>
                      )}
                      {/* TASKS.csv #263 — the watertight test is a manifold test, not a connectivity
                          test: two disjoint balloons 200 m apart are each closed and report as one
                          volume. Union-find over the indexed mesh says how many bodies there really are. */}
                      {expandedSurfaceVolume.componentCount > 1 && (
                        <div style={{ fontSize: 10, color: "#a5691f", marginBottom: 6, lineHeight: 1.45 }}>
                          This shell is <strong>{expandedSurfaceVolume.componentCount} separate bodies</strong> totalling {expandedSurfaceVolume.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³, not one continuous body.
                        </div>
                      )}
                      {!expandedSurfaceVolume.watertight && (
                        <div style={{ fontSize: 10, color: "#a5691f", marginBottom: 6, lineHeight: 1.4 }}>
                          This surface isn't a closed solid ({expandedSurfaceVolume.openEdgeCount} open edge{expandedSurfaceVolume.openEdgeCount === 1 ? "" : "s"}). That can mean several things: it's a single draped contact or fault sheet rather than a solid; it was clipped against a modelling domain; the shell reaches the edge of the estimated region; or the iso-surface extraction left cracks on ambiguous cells (this app uses the classic marching-cubes tables with no asymptotic decider). The volume above is computed anyway but doesn't represent a real enclosed shape — treat it as informational only.
                        </div>
                      )}
                      {/* TASKS.csv #270 (LOW-2) — a tonnage with no grade beside it invites quoting the
                          CUTOFF as the grade. Report the interpolated mean inside the shell instead. */}
                      {s.params?.meanGradeInShell != null && (
                        <div style={{ fontSize: 10.5, color: "var(--color-text)", marginBottom: 4 }}>
                          Mean interpolated grade inside the shell: <strong>{s.params.meanGradeInShell.toFixed(3)} {PRECIOUS_METALS.has(s.params.element) && s.params.unit === "ppm" ? "g/t" : s.params.unit}</strong>
                          <span style={{ color: "var(--color-text-muted)" }}> — not a resource grade (no dilution, no recovery, no declustering; it is the mean of the interpolated cells at or above the {s.params.cutoff} cutoff).</span>
                        </div>
                      )}
                      {/* TASKS.csv #264 — no more silent 2.7 prefill: a bold tonnage the user never
                          authorised a density for is exactly the number that gets quoted. */}
                      <label style={{ fontSize: 10, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ flexShrink: 0 }}>Density (t/m³ or g/cm³)</span>
                        <input
                          type="number" min={0} step={0.01} placeholder="required"
                          value={s.density ?? ""}
                          onChange={(e) => setSurfaceDensity(s.id, e.target.value === "" ? "" : Number(e.target.value))}
                          style={{ ...smallSel, width: 70 }}
                        />
                      </label>
                      {(() => {
                        const tonnage = computeTonnage(expandedSurfaceVolume.volumeM3, Number(s.density));
                        return tonnage != null ? (
                          <>
                            <div style={{ fontSize: 11, color: "var(--color-text)" }}>
                              Tonnage: <strong>{tonnage.toLocaleString(undefined, { maximumFractionDigits: 0 })} t</strong>
                            </div>
                            {/* TASKS.csv #269 — permanent, beside the figure, not buried in helper text. */}
                            <div style={{ fontSize: 9.5, color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "6px 7px", marginTop: 5, lineHeight: 1.45 }}>
                              <strong>Exploration target volume only — not a Mineral Resource.</strong> Public
                              disclosure of a tonnage requires an estimate prepared by a Qualified Person.
                              {/* TASKS.csv #264 */}
                              {" "}In-situ, dry, undiluted tonnes at the density you entered. No mining dilution,
                              mining recovery, metallurgical recovery or moisture is applied. Bulk density here is
                              a single assumed value, not a measured one — a real estimate uses measured SG by domain.
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Enter a bulk density to compute tonnage — there is no default, because the tonnage is only as real as the density behind it.</div>
                        );
                      })()}
                      </>
                      )}
                      {/* TASKS.csv #270 (LOW-3) — the parameter block that produced this surface, so a
                          number can be reproduced and audited rather than re-derived from memory. */}
                      {s.params && (
                        <div style={{ fontSize: 9.5, color: "var(--color-text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
                          <div style={{ color: "var(--color-text-muted)", marginBottom: 2 }}>Parameters used</div>
                          {/* BUG FIXED HERE, found by live verification for TASKS.csv #52 (d): this line
                              formatted the NUMERIC grade-shell parameter block unconditionally, for every
                              surface that had any params at all. A vein/dyke (#144) or a GemPy stack
                              surface has no `cellsEstimated`, so expanding its row threw
                              "Cannot read properties of undefined (reading 'toLocaleString')" and the
                              whole 3D view went to the error boundary. Reproduced against the Harry
                              sample: build a vein, expand its row, crash. The numeric line now renders
                              only for the surfaces it describes; everything else gets its own parameter
                              block printed generically, which is strictly more than it had before. */}
                          {s.params.cellsEstimated != null && s.params.element ? (
                            <>{s.params.element} cutoff {s.params.cutoff} {s.params.unit} · {String(s.params.method).toUpperCase()} · search {Math.round(s.params.searchRadiusM)} m{s.params.searchRadiusWasUnlimited ? " (unlimited, capped at the grid diagonal)" : ""} · {s.params.cellSizeM} m cells · pad {s.params.paddingM} m · {s.params.composited ? `${s.params.compositeLengthM} m composites` : "raw intervals"} · cap {s.params.capValue == null ? "none" : s.params.capValue} · min {s.params.minHoles} hole{s.params.minHoles === 1 ? "" : "s"} · QC {s.params.includeQAQC ? "included" : "excluded"} · closure {s.params.closure} · {s.params.samplePoints} sample points · {s.params.cellsEstimated.toLocaleString()} cells estimated{s.params.singleHoleCells ? ` (${s.params.singleHoleCells.toLocaleString()} from a single hole)` : ""}</>
                          ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "1px 8px" }}>
                              {Object.entries(s.params).filter(([k, v]) => k !== "generatedAt" && v !== null && v !== undefined).map(([k, v]) => (
                                <React.Fragment key={k}>
                                  <div style={{ color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</div>
                                  {/* Objects (the #52 (c) intercept-set stamp, the #52 (d) truncation log) are
                                      printed rather than skipped: a parameter block that quietly omits half of
                                      what produced the surface is worse than a slightly ugly one. */}
                                  <div style={{ wordBreak: "break-word" }}>{typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(3)) : typeof v === "object" ? JSON.stringify(v) : String(v)}</div>
                                </React.Fragment>
                              ))}
                            </div>
                          )}
                          <div style={{ color: "var(--color-text-muted)", marginTop: 2 }}>Generated {new Date(s.params.generatedAt).toLocaleString()}. Saved with the project (TASKS #52), so this record — and the surface it describes — survives a restart; the mesh export carries the same stamp.</div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>No mesh geometry found for this surface.</div>
                  )}

                  {/* TASKS.csv #145 — manual sculpting of this surface, plus its hand-edit provenance.
                      Placed directly under the volume/tonnage block on purpose: an edit changes the
                      enclosed volume, and the number it changes is the one immediately above. */}
                  <SculptPanel surface={s} sculpt={sculpt} pBtn={pBtn} smallSel={smallSel} />

                  {/* TASKS.csv #93 — VERSIONS. Re-running a tool already produces a second surface; this
                      is where the user says the second one is a re-run OF the first, which is what makes
                      the two comparable and what "accept" then chooses between. Linking never moves or
                      copies a mesh — it writes one id — so it costs nothing at save time. */}
                  {(() => {
                    const info = surfaceLineageInfo.byId.get(s.id);
                    const chain = info ? info.lineage : [s];
                    const vNum = info ? info.index + 1 : 1;
                    const cands = candidatePredecessors(implicitSurfaces, s.id);
                    return (
                      <>
                        <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 10, marginBottom: 4, borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>
                          Version {vNum} of {chain.length}
                          {s.accepted && <span style={{ color: "#20512f", background: "#f1f7f2", border: "1px solid #c6e0cb", borderRadius: 4, padding: "1px 5px", marginLeft: 6 }}>accepted</span>}
                        </div>
                        <label style={{ fontSize: 10, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                          <span style={{ flexShrink: 0 }}>New version of</span>
                          <select
                            value={s.supersedes || ""}
                            onChange={(e) => setSurfaceSupersedes(s.id, e.target.value)}
                            style={{ ...smallSel, flex: 1, minWidth: 0 }}
                            title="Record that this run replaces an earlier one. Both runs stay in the project — this only links them so they can be compared."
                          >
                            <option value="">— nothing (this is an original run) —</option>
                            {cands.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </label>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            onClick={() => setCompareVersionsFor(s.id)}
                            disabled={chain.length < 2}
                            style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: 10.5, opacity: chain.length < 2 ? 0.5 : 1, cursor: chain.length < 2 ? "default" : "pointer" }}
                            title={chain.length < 2 ? "Link this surface to an earlier run first" : "Compare this version against another run of the same surface: volume delta, how far the surface moved, and which parameters changed"}
                          ><GitCompare size={12} /> Compare versions…</button>
                          <button
                            onClick={() => acceptSurfaceVersion(s.id)}
                            style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: 10.5 }}
                            title="Mark this run as the version you are working from. Hides the other versions of this surface — it does not delete them, and it is not a check that this run is correct."
                          ><Check size={12} /> {s.accepted ? "Accepted" : "Accept this version"}</button>
                        </div>
                        {chain.length > 1 && (
                          <div style={{ fontSize: 9.5, color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.45 }}>
                            Every version keeps its own mesh and its own parameter block, so nothing is
                            overwritten and nothing is dropped on save — which also means each one costs
                            its own space in the project file. Delete a version you no longer want with
                            the × on its row; GeoStrix will not do it for you.
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* TASKS.csv #143 — export to a standard mesh format, at real-world project coordinates
                      (not GeoStrix's internal scene-space), for handoff to other software. */}
                  <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 10, marginBottom: 4, borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>Export mesh</div>
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
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>
          A domain is one or more faults plus which side of each — an AND of constraints, so you can
          bound a domain between two faults, not just split the property in two. Pick which fault
          surfaces to use as constraints below (any generated surface typed "Fault" above); the domain
          fails open (matches everything) until it has at least one constraint, and again for any
          constraint whose fault surface gets deleted. Domains save with the project (TASKS #52), along
          with the surfaces they reference.
        </div>
        {(() => { const faultSurfaces = implicitSurfaces.filter((s) => s.type === "fault"); return (
        <>
        {domains.length === 0 && (
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>None yet.</div>
        )}
        {domains.map((d) => {
          const expanded = expandedDomainId === d.id;
          return (
            <div key={d.id} style={{ background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
                <GitFork size={13} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
                <div onClick={() => setExpandedDomainId(expanded ? null : d.id)} style={{ cursor: "pointer", flex: 1, minWidth: 0, fontSize: 12, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${d.constraints.length} constraint${d.constraints.length === 1 ? "" : "s"}`}>{d.name}</div>
                <div onClick={() => setExpandedDomainId(expanded ? null : d.id)} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }}>
                  {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </div>
                <X size={13} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => deleteDomain(d.id), `Delete domain "${d.name}"`)} />
              </div>
              {expanded && (
                <div style={{ padding: "0 8px 8px", borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>
                  <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginBottom: 4 }}>Fault-side constraints</div>
                  {d.constraints.length === 0 && <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 6 }}>None declared — matches the whole property.</div>}
                  {d.constraints.map((c, i) => {
                    const fault = implicitSurfaces.find((s) => s.id === c.faultId);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, marginBottom: 4 }}>
                        <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {fault ? fault.name : "(deleted fault)"} <span style={{ color: "var(--color-text-secondary)" }}>— side {c.side === 1 ? "A" : "B"}</span>
                        </div>
                        <button onClick={() => flipDomainConstraint(d.id, i)} title="Flip side" style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 7px", fontSize: 10 }}>Flip</button>
                        <X size={11} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => removeDomainConstraint(d.id, i), `Remove this fault constraint from domain "${d.name}"`)} />
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
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>No fault surfaces yet — generate one with the Structural tool above and set its type to "Fault".</div>
                  )}
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 8 }}>{countCollarsInDomain(d)} of {collars.length} collars fall inside this domain (collar-only estimate — the modelling tools above classify each control point individually).</div>
                </div>
              )}
            </div>
          );
        })}
        </>
        ); })()}
        <div onClick={() => askPrompt("Domain name?", "", (name) => { if (name && name.trim()) setExpandedDomainId(addDomain(name.trim())); })} style={{ cursor: "pointer", padding: "8px 10px", background: "var(--color-bg-subtle)", border: "1px dashed var(--color-border-light)", borderRadius: 6, fontSize: 12, color: "var(--color-text-secondary)", textAlign: "center", marginBottom: 4 }}>+ Domain</div>
        </>)}

        {sidebarTab === "targeting" && (<>
        <div className="ge-section-label">Geophysical voxel ranges</div>
        {voxelModels.length === 0 ? (
          <div style={{ padding: "8px 10px", background: "var(--color-bg-subtle)", border: "1px dashed var(--color-border-light)", borderRadius: 6, fontSize: 11.5, color: "var(--color-text-muted)", marginBottom: 12 }}>
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
            <FileBarChart2 size={13} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(exportPlannedHolesCSV, "Export all planned holes to CSV")} />
          )}
        </div>
        <PlannedHoleAddForm onAdd={addPlannedHole} pickMode={pickHoleMode} onStartPick={() => setPickHoleMode((v) => !v)} pickedPoint={pickedHolePoint} collars={collars} />
        {plannedHoles.length === 0 ? (
          <div style={{ padding: "8px 10px", background: "var(--color-bg-subtle)", border: "1px dashed var(--color-border-light)", borderRadius: 6, fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 8 }}>
            No planned holes yet — add a collar position and design orientation above. A planned hole renders as a dashed cyan line (distinct from real, drilled holes) in the 3D view, in every module tab.
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {plannedHoles.map((hole) => (
              <PlannedHoleRow key={hole.id} hole={hole} onUpdate={updatePlannedHole} onRemove={removePlannedHole} collars={collars} survey={survey} />
            ))}
          </div>
        )}
        {plannedHoles.length > 0 && (
          <button onClick={exportPlannedHolesCSV} style={{ ...pBtn, marginTop: 8 }}><FileBarChart2 size={13} /> Export {plannedHoles.length} planned hole{plannedHoles.length === 1 ? "" : "s"} to CSV</button>
        )}
        {plannedHoles.length > 0 && (
          <PlannedHoleChecks plannedHoles={plannedHoles} collars={collars} survey={survey} voxelModels={voxelModels} desurveyMethod={desurveyMethod} />
        )}
        </>)}

        {collars.length > 0 && (
          <>
            <div className="ge-section-label" style={{ marginTop: 16 }}>Holes ({collars.length})</div>
            {/* TASKS.csv #222 — a filter box, the other half of the audit's "no virtualization/filter"
                finding; finding one hole by ID in a 200+ hole project by eye alone was the real
                usability gap, not just the render cost (fixed separately via HoleRow's memoization). */}
            {collars.length > 8 && (
              <input placeholder="Filter holes…" value={holeFilter} onChange={(e) => setHoleFilter(e.target.value)} style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 8px", color: "var(--color-text)", fontSize: 11.5, fontFamily: "inherit", marginBottom: 4 }} />
            )}
            {collars.filter((c) => !holeFilter || c.hole_id.toLowerCase().includes(holeFilter.toLowerCase())).map((c) => (
              <HoleRow key={c.hole_id} hole_id={c.hole_id} visible={visibleHoles[c.hole_id]} onToggle={toggleHole} onOpenStripLog={setStripLogHoleId} />
            ))}
          </>
        )}

        {/* TASKS.csv #298 — deliberately NOT a live region: the floating toast above already announces
            each new notice, and a second live region over the same message would make a screen reader
            read every message twice. This is the persistent record of the same messages, so it just
            gets a name so it can be found by landmark/region navigation. */}
        {notices.length > 0 && (
          <div role="region" aria-label="Recent messages" style={{ marginTop: 14, padding: "8px 10px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 10, color: "var(--color-text-caption)", lineHeight: 1.5, maxHeight: 140, overflowY: "auto" }}>
            {notices.slice(-6).map((n, i) => <div key={i} style={{ marginBottom: 4 }}>{n}</div>)}
          </div>
        )}
      </div>

      {sidebarTab === "home" && (<>
        <PanelSplitHandle height={browserHeight} onResize={setBrowserHeight} invert title="Drag to resize the Browser panel" />
        <div style={{ height: browserHeight, flexShrink: 0 }}>
          <DbBrowserPanel onImportFile={importBrowserFile} onImportRows={openImportFromRows} />
        </div>
      </>)}
      </div>

      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      {/* TASKS.csv #145 — sculpt.handleViewClick joins the same click chain as the section/measure/
          pick-hole tools; it is a no-op unless sculpt mode is on for a specific surface. */}
      <div className="ge-main" onClick={(e) => { onSectionClick(e); onMeasureClick(e); onPickHoleClick(e); sculpt.handleViewClick(e); }} style={{ cursor: sectionMode || rectZoomMode || measureMode || pickHoleMode || sculpt.targetId ? "crosshair" : "default" }}>
        <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
        {/* TASKS.csv #294 — the fresh-project empty state. This used to be a single grey line
            ("Import collars, or drag a CSV in") on the very first tab every user lands on, while
            Geochem and Geophysics both had full multi-paragraph empty states explaining every
            accepted format in the reader's own vocabulary. Ported that same pattern here: what the
            tab is for, exactly what a collar file needs, what else can be dropped, and — per
            TASKS.csv #293 — a one-click way to see the app working with real data before you've
            got any of your own. The wrapper stays pointerEvents:none so it never eats an orbit
            drag on the canvas behind it; only the card itself re-enables pointer events. */}
        {!collars.length && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", padding: 20 }}>
            <div style={{ pointerEvents: "auto", maxWidth: 520, background: "#ffffffee", border: "1px solid var(--color-border)", borderRadius: 8, padding: "18px 20px", color: "var(--color-text-secondary)", fontSize: 12, lineHeight: 1.55, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 14, color: "var(--color-text)", fontWeight: 600, marginBottom: 8 }}>Nothing loaded yet</div>
              <div style={{ marginBottom: 8 }}>
                This is the 3D view — drillhole traces in real world coordinates, with lithology, alteration, veining, geotech and assay data hung off them downhole. Everything starts from a <b>collar</b> file.
              </div>
              <div style={{ marginBottom: 8 }}>
                Use <b>Import ▸ Collars</b> in the panel on the left, or drag a file straight onto this view. Collars: a CSV (or zipped shapefile / GeoPackage) with a hole ID and x/y/z — <code>hole_id, x, y, z</code>, plus optional <code>azimuth</code>, <code>dip</code> and <code>length</code>. Column names are guessed for you (easting/northing/elevation and friends all work) and anything ambiguous opens a mapping dialog rather than importing wrong.
              </div>
              <div style={{ marginBottom: 12 }}>
                Then add downhole survey stations, and any interval layers you have (lithology, alteration, veins, mineralization, geotech, mag susceptibility, structure). Assays live in the <b>Geochem</b> tab; grids, GeoTIFFs and survey lines in <b>Geophysics</b>. Coordinates are reprojected to the project CRS on import if the source CRS differs.
              </div>
              <button
                onClick={loadSampleProject}
                disabled={sampleLoading}
                title="Load the bundled Harry property sample project — 37 real drillholes from BC's public ARIS database, with synthesized interval layers"
                style={{ background: "#2f6f9f", border: "1px solid #2a6291", color: "#fff", borderRadius: 6, padding: "8px 12px", fontSize: 12, fontFamily: "inherit", cursor: sampleLoading ? "default" : "pointer", opacity: sampleLoading ? 0.6 : 1 }}
              >
                {sampleLoading ? "Loading sample project…" : "Load sample project (Harry property, 37 real holes)"}
              </button>
              <div style={{ fontSize: 10.5, color: "var(--color-text-muted)", marginTop: 7 }}>
                No data of your own yet? This loads a real 37-hole dataset from BC's public ARIS drillhole database (report #37584) so you can see what a full project looks like. Some interval layers in it are synthesized — the bundled README says exactly which.
              </div>
            </div>
          </div>
        )}
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}>
          <button onClick={() => setShowLocator((v) => !v)} title="Toggle locator map (shows your project's real-world location)" style={{ ...iconBtn, ...(showLocator ? { background: "var(--color-divider)", borderColor: "var(--color-selected-border)" } : {}) }}><MapIcon size={15} /></button>
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
          <div style={{ position: "absolute", top: 12, left: 12, fontSize: 11, color: "var(--color-success-text)", background: "var(--color-bg)", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-success-border)" }}>Start point set — click the end point</div>
        )}
        {/* TASKS.csv #298 — the toast is now a real ARIA live region, so setNotices() messages reach a
            screen-reader user instead of only sighted ones. Two details matter here:
            1. The live region WRAPPER is rendered unconditionally, with only its contents appearing
               and disappearing. A live region that gets inserted into the DOM at the same moment as
               its text is routinely missed by screen readers — the region has to already be there
               and observed for the text change to be announced.
            2. Errors/failures go out as "assertive" (interrupt), everything else "polite" (wait for
               a pause). A self-dismissing 5-second toast with no announcement at all was the worst
               possible combination for this audience — the messages themselves are specific and
               actionable, they were just silent. */}
        <div
          aria-live={toast && /couldn'?t|can'?t|cannot|failed|error|unable|invalid|unsupported|only \./i.test(toast.text) ? "assertive" : "polite"}
          aria-atomic="true"
          style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", maxWidth: "70%", pointerEvents: "none" }}
        >
          {toast && (
            <div key={toast.key} style={{ fontSize: 11.5, color: "var(--color-text)", background: "var(--color-bg)", padding: "8px 14px", borderRadius: 7, border: "1px solid var(--color-border-light)", boxShadow: "0 4px 14px rgba(0,0,0,0.4)" }}>
              {toast.text}
            </div>
          )}
        </div>
        {/* TASKS.csv #198 (part 3) — QGIS-style "enter a Layout Viewport" banner. Everything below the
            camera is already live and interactive (the existing orbit-drag/wheel handlers on this same
            canvas), so this banner is the ONLY new UI the feature needs — just a way to tell the user
            they're editing a specific Viewport and to explicitly commit or discard the new camera
            angle before leaving. */}
        {interactiveViewportSession && (
          <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--color-text)", background: "var(--color-bg)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border-light)", boxShadow: "0 4px 14px rgba(0,0,0,0.4)", zIndex: 20 }}>
            <span>Editing Layout viewport — drag to orbit, scroll to zoom</span>
            <button onClick={doExitInteractiveViewport} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 10px", fontSize: 11.5 }}>Update Viewport &amp; Return to Layout</button>
            <button onClick={doCancelInteractiveViewport} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 10px", fontSize: 11.5, background: "transparent", border: "1px solid var(--color-border-light)", color: "var(--color-text-secondary)" }}>Cancel</button>
          </div>
        )}
        {rectZoomMode && !rectVisual && (
          <div style={{ position: "absolute", top: 12, left: 12, fontSize: 11, color: "var(--color-success-text)", background: "var(--color-bg)", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-success-border)" }}>Drag a rectangle to zoom in — right-click to cancel</div>
        )}
        {rectVisual && (
          <div style={{ position: "absolute", left: rectVisual.x, top: rectVisual.y, width: rectVisual.w, height: rectVisual.h, border: "1.5px dashed var(--color-info)", background: "rgba(74,155,224,0.12)", pointerEvents: "none" }} />
        )}
        {tooltip && (
          <div style={{ position: "fixed", left: tooltip.x + 14, top: tooltip.y + 14, background: "var(--color-divider)", border: "1px solid var(--color-border-light)", borderRadius: 6, padding: "8px 10px", fontSize: 11.5, whiteSpace: "pre-line", pointerEvents: "none", zIndex: 10, maxWidth: 220 }}>{tooltip.text}</div>
        )}
      </div>

      {contextMenu && (
        <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, background: "var(--color-divider)", border: "1px solid var(--color-border-light)", borderRadius: 8, padding: 6, fontSize: 12.5, minWidth: 180, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
            {contextMenu.hit ? (
              <>
                <div style={{ padding: "6px 10px", color: "var(--color-text-muted)", fontSize: 10.5, whiteSpace: "pre-line", borderBottom: "1px solid var(--color-border)", marginBottom: 4 }}>{contextMenu.hit.tip}</div>
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
            <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 4, paddingTop: 4 }}>
              <label
                htmlFor="viewport-bg-color-picker"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: 5, cursor: "pointer", color: "var(--color-text)" }}
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
                  style={{ width: 26, height: 18, padding: 0, border: "1px solid var(--color-border-light)", borderRadius: 3, cursor: "pointer", background: "none" }}
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
          <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: layerContextMenu.x, top: layerContextMenu.y, background: "var(--color-divider)", border: "1px solid var(--color-border-light)", borderRadius: 8, padding: 6, fontSize: 12.5, minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
            <div style={{ padding: "4px 10px 6px", color: "var(--color-text-muted)", fontSize: 10.5, borderBottom: "1px solid var(--color-border)", marginBottom: 4 }}>{layerContextMenu.label}</div>
            {!isVector && <>
              <ContextItem label="Zoom to layer" onClick={() => { zoomToLayer(layerContextMenu.key); setLayerContextMenu(null); }} />
              <ContextItem label={layerVisible[layerContextMenu.key] ? "Hide layer" : "Show layer"} onClick={() => { toggleLayer(layerContextMenu.key); setLayerContextMenu(null); }} />
              <ContextItem label="Clear layer data…" onClick={() => { clearLayer(layerContextMenu.key); setLayerContextMenu(null); }} />
            </>}
            {/* TASKS.csv — export/inspect, the same for real layers and the collars/survey sentinels. */}
            <div style={{ borderTop: "1px solid var(--color-border)", margin: "4px 0" }} />
            <ContextItem label="Export Shapefile (.zip)…" onClick={() => { exportVectorShapefile(vectorKind, layerContextMenu.key, layerContextMenu.label); setLayerContextMenu(null); }} />
            <ContextItem label="Export GeoPackage (.gpkg)…" onClick={() => { exportVectorGeoPackage(vectorKind, layerContextMenu.key, layerContextMenu.label); setLayerContextMenu(null); }} />
            <ContextItem label="Export DXF (.dxf)…" onClick={() => { exportVectorDXF(vectorKind, layerContextMenu.key, layerContextMenu.label); setLayerContextMenu(null); }} />
            <ContextItem label="Inspect / edit table…" onClick={() => { setAttrTableTarget({ kind: vectorKind, key: layerContextMenu.key, label: layerContextMenu.label }); setLayerContextMenu(null); }} />
            {!isVector && <>
              {/* TASKS.csv #76 — sort this layer into a named group (or back out of one). */}
              {layerGroups.length > 0 && <div style={{ borderTop: "1px solid var(--color-border)", margin: "4px 0" }} />}
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

      {/* TASKS.csv #288 — multi-layer .zip/.gpkg layer picker. Cancelling resumes the multi-file drop
          queue exactly like cancelling the mapping modal does, so a mixed drop doesn't stall. */}
      {layerPicker && (
        <LayerPickerModal
          fileName={layerPicker.file.name}
          options={layerPicker.options}
          onPick={(name) => { const { file, forceTarget } = layerPicker; setLayerPicker(null); openImportModal(file, forceTarget, name); }}
          onCancel={() => { setLayerPicker(null); processImportQueue(); }}
        />
      )}
      {importModal && <ImportMappingModal modal={importModal} onChange={setImportModal} onCancel={() => { setImportModal(null); processImportQueue(); }} onCommit={commitImport} projectEpsg={project?.epsg} />}
      {dbModalOpen && <DatabaseConnectModal onCancel={() => setDbModalOpen(false)} onResults={openImportFromRows} />}
      {sectionEditOpen && (() => {
        const ids = Array.from(selectedSectionIds);
        const first = sections.find((s) => s.id === ids[0]);
        return (
          <SectionEditModal
            sectionCount={ids.length}
            initialCorridor={first?.corridor}
            voxelModels={voxelModels}
            onClose={() => setSectionEditOpen(false)}
            onSave={(scope, corridorValue) => {
              updateSections(ids, corridorValue !== undefined ? { scope, corridor: corridorValue } : { scope });
              setSectionEditOpen(false);
              setNotices((p) => [...p, `Updated content scope for ${ids.length} section${ids.length === 1 ? "" : "s"} — reopen ${ids.length === 1 ? "it" : "them"} to see the change.`]);
            }}
          />
        );
      })()}
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
      {/* TASKS.csv #147 — a read-only diagnostic: it takes no onAdd-style callback, so nothing it
          computes can enter the project or any estimate. */}
      {variogramOpen && (
        <VariogramModal
          assays={assays}
          assayElements={assayElements}
          layers={layers}
          collars={collars}
          survey={survey}
          onClose={() => setVariogramOpen(false)}
        />
      )}
      {/* TASKS.csv #236 — onUseAsTrend closes the loop this feature was created for: the Stereonet
          exists to sanity-check an orientation BEFORE it's fed to the anisotropy/structural tools, so
          the computed mean plane can now be pushed straight into the anisotropy trend fields instead
          of the user reading two numbers off the screen and retyping them. Also switches to the
          Modeling sidebar so the fields it just wrote are actually visible — writing state into a
          panel the user can't see would look like nothing happened. */}
      {stereonetOpen && (
        <StereonetModal
          picks={structurePicksWithHoleAttitude}
          domains={domains}
          domainFilter={domainStereonetFilter}
          onClose={() => setStereonetOpen(false)}
          onUseAsTrend={({ azimuth, dip }) => {
            setAnisotropy((p) => ({ ...p, enabled: true, azimuth: Math.round(azimuth * 10) / 10, dip: Math.round(dip * 10) / 10 }));
            setStereonetOpen(false);
            goToModule("modeling");
            setNotices((p) => [...p, `Anisotropy trend set from the stereonet mean orientation (dip ${dip.toFixed(1)}° / dipdir ${azimuth.toFixed(1)}°).`]);
          }}
        />
      )}
      {/* TASKS.csv #277 — downhole structural (tadpole) plot. Fed the SAME hole-attitude-enriched picks
          the stereonet's Terzaghi correction uses, so alpha means one thing across both tools. */}
      {tadpoleOpen && (
        <DownholeStructurePlot
          picks={structurePicksWithHoleAttitude}
          holes={holesForTadpole}
          litho={layers.litho || []}
          onClose={() => setTadpoleOpen(false)}
        />
      )}
      {/* TASKS.csv #146 — distance-to-surface / point-in-domain report. Reads the SAME scene-space
          meshes the viewport draws (implicitMeshesRef) and the SAME desurveyed traces everything else
          uses (tracesRef), so no number here can drift from what is on screen. Packaged only while the
          modal is open — pulling ~100k vertices out of every surface's BufferGeometry on every render
          would be pure waste the other 99% of the time. */}
      {/* TASKS.csv #139 — fence/panel diagram. Fed tracesRef (the same desurveyed traces the 3D scene
          draws, in real-world coordinates) rather than re-desurveying: one source of truth, and it
          keeps this out of desurvey.js entirely. */}
      {fenceOpen && (
        <FenceDiagramModal
          traces={tracesRef.current.map((t) => ({ hole_id: t.hole_id, md: t.pts.map((p) => p.md), wx: t.wx, wy: t.wy, wz: t.wz }))}
          litho={layers.litho || []}
          onClose={() => setFenceOpen(false)}
        />
      )}
      {surfaceQueryOpen && (
        <SurfaceQueryModal
          surfaces={implicitSurfaces.map((s) => {
            const g = implicitMeshesRef.current[s.id]?.geometry;
            return { id: s.id, name: s.name, positions: g?.attributes?.position?.array || null, indices: g?.index?.array || null };
          }).filter((s) => s.positions && s.indices)}
          traces={tracesRef.current}
          sceneToWorld={(p) => { const o = originRef.current; return { x: p.x + o.x, y: o.y - p.z, z: p.y + o.z }; }}
          worldToScene={(p) => { const o = originRef.current; return { x: p.x - o.x, y: p.z - o.z, z: -(p.y - o.y) }; }}
          onClose={() => setSurfaceQueryOpen(false)}
        />
      )}
      {/* TASKS.csv #93 — version compare. Meshes are handed over BY REFERENCE out of the live scene
          (same pattern as SurfaceQueryModal above): the dialog never copies a mesh, and it only walks
          them when the user presses "Compare geometry". */}
      {compareVersionsFor && (
        <SurfaceCompareModal
          surfaces={implicitSurfaces}
          initialId={compareVersionsFor}
          getMesh={(id) => {
            const g = implicitMeshesRef.current[id]?.geometry;
            if (!g?.attributes?.position || !g.index) return null;
            return { positions: g.attributes.position.array, indices: g.index.array };
          }}
          onOverlay={overlayCompareSurfaces}
          onClearOverlay={clearCompareOverlay}
          onAccept={acceptSurfaceVersion}
          onClose={() => setCompareVersionsFor(null)}
        />
      )}
      {coreOrientOpen && (
        <CoreOrientationCalculator
          collars={collars}
          survey={survey}
          fieldStructuralRefs={fieldStructuralRefs}
          addFieldRef={addFieldRef}
          removeFieldRef={removeFieldRef}
          onSaveStructurePick={(row) => {
            setLayers((p) => ({ ...p, structure: [...(p.structure || []), row] }));
            setNotices((p) => [...p, `Saved "${row.value}" to the Structure layer (${row.hole_id} @ ${row.depth}m, dip ${row.dip}° / dipdir ${row.azimuth}°).`]);
          }}
          onClose={() => setCoreOrientOpen(false)}
        />
      )}
      {interceptsModalOpen && (
        <BoundaryInterceptsModal
          intercepts={computeIntercepts()}
          excludedIntercepts={excludedIntercepts}
          softIntercepts={softIntercepts}
          onToggle={toggleExcludedIntercept}
          onToggleSoft={toggleSoftIntercept}
          interceptSets={interceptSets}
          onAddSet={addInterceptSet}
          onRenameSet={renameInterceptSet}
          onDeleteSet={(id) => { deleteInterceptSet(id); if (activeInterceptSetId === id) setActiveInterceptSetId(""); }}
          onToggleInSet={toggleInterceptInSet}
          onSetMembership={setInterceptsInSet}
          onCancel={() => setInterceptsModalOpen(false)}
        />
      )}

      {dragOver && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(226,166,60,0.08)", border: "3px dashed var(--color-accent)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 18, color: "var(--color-accent)", background: "var(--color-bg)", padding: "14px 22px", borderRadius: 8, border: "1px solid var(--color-accent)", textAlign: "center" }}>Drop CSV(s) to import<div style={{ fontSize: 12, color: "var(--color-success-text)", marginTop: 4, fontWeight: 400 }}>Drop several at once — each auto-detects its layer, or asks if unsure</div></div>
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
            <div style={popoverHeader}>Grid<X size={13} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setOpenPopover(null), "Close the grid settings popover")} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
              <div onClick={() => setGridConfig((g) => ({ ...g, visible: !g.visible }))} style={{ cursor: "pointer", color: gridConfig.visible ? "var(--color-accent)" : "var(--color-text-disabled)" }}>
                {gridConfig.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <div style={{ flex: 1, fontSize: 12.5, color: gridConfig.visible ? "var(--color-text)" : "var(--color-text-faint)" }}>Show grid</div>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--color-text-secondary)", cursor: "pointer" }} title="Add two vertical wall grids to the ground grid, forming a 3D reference box">
                <input type="checkbox" checked={gridConfig.mode === "3d"} onChange={(e) => setGridConfig((g) => ({ ...g, mode: e.target.checked ? "3d" : "ground" }))} /> 3D
              </label>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" title="Grid size (m)" value={gridConfig.size} onChange={(e) => setGridConfig((g) => ({ ...g, size: Math.max(10, Number(e.target.value) || g.size) }))} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: 11, fontFamily: "inherit" }} />
              <input type="number" title="Divisions" value={gridConfig.divisions} onChange={(e) => setGridConfig((g) => ({ ...g, divisions: Math.max(1, Number(e.target.value) || g.divisions) }))} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: 11, fontFamily: "inherit" }} />
              <input type="color" title="Grid color" value={gridConfig.color} onChange={(e) => setGridConfig((g) => ({ ...g, color: e.target.value }))} style={{ width: 30, height: 28, padding: 0, border: "1px solid var(--color-border)", borderRadius: 5, background: "none", cursor: "pointer" }} />
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
            <div style={popoverHeader}>Themes<X size={13} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setOpenPopover(null), "Close the themes popover")} /></div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input
                type="text" placeholder="Theme name…" value={themeNameDraft}
                onChange={(e) => setThemeNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && themeNameDraft.trim()) { captureCurrentTheme(themeNameDraft.trim()); setThemeNameDraft(""); } }}
                style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: 11.5 }}
              />
              <button
                onClick={() => { if (themeNameDraft.trim()) { captureCurrentTheme(themeNameDraft.trim()); setThemeNameDraft(""); } }}
                disabled={!themeNameDraft.trim()}
                title="Save the current view (layers, filters, grid, camera, and which generated surfaces are shown) as a named theme"
                style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "6px 9px", opacity: themeNameDraft.trim() ? 1 : 0.5, cursor: themeNameDraft.trim() ? "pointer" : "default" }}
              ><BookmarkPlus size={14} /></button>
            </div>
            {themes.length === 0 && (
              <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 4, lineHeight: 1.4 }}>
                Save the current view as a theme to reload it later, or bind it to a Viewport element on the Layout page.
              </div>
            )}
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {themes.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                  {renamingThemeId === t.id ? (
                    <input
                      autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => { if (renameDraft.trim()) renameTheme(t.id, renameDraft.trim()); setRenamingThemeId(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenamingThemeId(null); }}
                      style={{ flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid #3a4658", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: 12 }}
                    />
                  ) : (
                    <div onClick={() => applyTheme(t)} title="Apply this theme's layers, filters, grid, camera position, and the generated surfaces it was saved with" style={{ cursor: "pointer", flex: 1, minWidth: 0, fontSize: 12, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                      <Bookmark size={13} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                    </div>
                  )}
                  <Pencil size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { setRenamingThemeId(t.id); setRenameDraft(t.name); }, `Rename theme "${t.name}"`)} />
                  <X size={13} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => deleteTheme(t.id), `Delete theme "${t.name}"`)} />
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
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-text-secondary)", marginLeft: 4 }} title="Every currently visible layer (litho, alteration, assays, structure, custom…) gets carried into the section">
          Buffer (m)
          <input type="number" value={sectionCorridor} onChange={(e) => setSectionCorridor(Math.max(1, Number(e.target.value) || 100))} style={{ width: 60, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: 11, fontFamily: "inherit" }} />
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
const popoverStyle = { position: "absolute", top: "calc(100% + 4px)", left: 0, width: 230, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.12)", padding: 10, zIndex: 50 };
const popoverHeader = { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "#55606e", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" };

function ContextItem({ label, onClick, disabled, title }) {
  if (disabled) {
    return <div title={title} style={{ padding: "7px 10px", borderRadius: 5, cursor: "default", color: "var(--color-text-disabled)" }}>{label}</div>;
  }
  return <div onClick={onClick} title={title} onMouseEnter={(e) => (e.currentTarget.style.background = "#242e3c")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")} style={{ padding: "7px 10px", borderRadius: 5, cursor: "pointer", color: "var(--color-text)" }}>{label}</div>;
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
    <div onClick={() => onToggle(hole_id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 5, cursor: "pointer", fontSize: 12, color: visible === false ? "var(--color-text-disabled)" : "var(--color-text)" }}>
      {visible === false ? <EyeOff size={12} /> : <Eye size={12} />}
      <span style={{ flex: 1 }}>{hole_id}</span>
      <span
        onClick={(e) => { e.stopPropagation(); onOpenStripLog(hole_id); }}
        title={`Strip log — ${hole_id}`}
        style={{ display: "flex", alignItems: "center", color: "var(--color-text-muted)", padding: 2, borderRadius: 4 }}
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
    <div style={{ background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }} onContextMenu={onContextMenu}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px" }}>
        {/* TASKS.csv #66 — inline expand (category chips + sources) without opening the full
            LayerInspector modal. Only offered once there's something to expand. */}
        {count > 0 && onToggleExpand ? (
          <div onClick={onToggleExpand} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} title={expanded ? "Collapse" : "Expand"}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        ) : <div style={{ width: 13, flexShrink: 0 }} />}
        <div onClick={onToggle} style={{ cursor: "pointer", color: visible ? "var(--color-accent)" : "var(--color-text-disabled)" }} title={visible ? "Hide layer" : "Show layer"}>{visible ? <Eye size={14} /> : <EyeOff size={14} />}</div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: visible ? "var(--color-text)" : "var(--color-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        {count > 0 && <Maximize2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(onZoom, `Zoom to the ${label} layer`)} />}
        {count > 0 && <ListFilter size={13} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(onInspect, `Filter / legend / sources for the ${label} layer (full view)`)} />}
        {/* TASKS.csv #63 — "unload" this layer's data entirely. Separate from the per-source removal
            inside the inspector (ListFilter above) — this is the "I don't want this tab's data at all
            anymore" case, the inspector handles "just pull out one of several CSVs I merged in". */}
        {count > 0 && onClear && <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(onClear, `Remove all data from the ${label} layer`)} />}
        <div onClick={onUpload} style={{ cursor: "pointer", fontSize: 10.5, color: count ? "var(--color-accent)" : "var(--color-text-muted)", flexShrink: 0 }} title="Import CSV">{count ? `${count}` : <Upload size={12} />}</div>
        {input}
      </div>
      {expanded && children && (
        <div style={{ padding: "0 10px 9px 32px", borderTop: "1px solid var(--color-divider)" }}>{children}</div>
      )}
    </div>
  );
}
// TASKS.csv #66 — the inline-expand content: category chips (click to toggle, shift-click to
// isolate) for non-numeric layers, plus a compact sources list, both reusing the same
// categoryFilter/legendOverride/_src data #63 already introduced for the full LayerInspector modal.
// Deliberately terser than that modal (chips instead of rows with color pickers/labels/counts) since
// the point of this view is a quick glance + quick toggle, not the full editing surface.
// TASKS.csv #237 sub-item (3) — graduated/classed symbology editor for the numeric layers. Rendered
// inside the layer's existing expandable panel (which, for a numeric layer, previously showed only
// the sources list — `categories` is hard-coded empty for meta.numeric, so there was literally
// nothing symbology-related there before). Deliberately mirrors the geophys_pts/voxel legend editor's
// own vocabulary — class count, equal-interval vs quantile, named palettes, continuous vs discrete —
// so the two classification UIs in the app behave the same way rather than inventing a second idiom.
function NumericSymbologyEditor({ layerKey, rows, sym, onChange }) {
  const [classCount, setClassCount] = useState(5);
  const [method, setMethod] = useState("equal");
  // TASKS.csv #249 (colorblind-safety review) — defaults to the perceptually-uniform, colorblind-safe
  // viridis palette rather than the plain blue-red "default" ramp, so a new classification starts safe
  // without the user needing to know to pick it. "default" stays selectable (and unchanged) for anyone
  // who explicitly wants it.
  const [palette, setPalette] = useState("viridis");
  const values = React.useMemo(
    () => (rows || []).map((r) => r.value).filter((v) => typeof v === "number" && !isNaN(v)),
    [rows]
  );
  const { min, max } = minMax(values);
  const apply = () => {
    const breaks = classifyBreaks(values, classCount, method);
    if (!breaks.length) return;
    const colors = paletteColorsHex(palette, breaks.length);
    onChange({ stops: breaks.map((v, i) => ({ value: v, color: colors[i] })), colorMode: "discrete" });
  };
  const stops = sym?.stops || [];
  return (
    <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #e3e6ea" }}>
      <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 5 }}>
        Symbology — {values.length.toLocaleString()} value{values.length === 1 ? "" : "s"}
        {values.length > 0 && ` (${min.toLocaleString(undefined, { maximumFractionDigits: 2 })} – ${max.toLocaleString(undefined, { maximumFractionDigits: 2 })})`}
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
        <input type="number" min="2" max="12" value={classCount} onChange={(e) => setClassCount(Math.max(2, Math.min(12, Number(e.target.value) || 5)))}
          title="Number of classes" style={{ width: 40, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 4px", fontSize: 10.5, color: "var(--color-text)" }} />
        <select value={method} onChange={(e) => setMethod(e.target.value)} title="How the class breaks are computed"
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 4px", fontSize: 10.5, color: "var(--color-text)" }}>
          <option value="equal">Linear (equal interval)</option>
          <option value="log">Log-linear</option>
          <option value="quantile">Histogram equalization (quantile)</option>
          <option value="normal">Normal distribution</option>
          {/* TASKS.csv #291 — QGIS parity, see GeophysicsModule's copy of this picker. */}
          <option value="jenks">Natural breaks (Jenks)</option>
        </select>
        <select value={palette} onChange={(e) => setPalette(e.target.value)} title="Colour ramp"
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 4px", fontSize: 10.5, color: "var(--color-text)", maxWidth: 110 }}>
          {Object.entries(PALETTES).map(([k, p]) => <option key={k} value={k}>{p.label.split(" — ")[0]}</option>)}
        </select>
        <button onClick={apply} disabled={!values.length}
          style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--color-selected-border)", background: values.length ? "var(--color-selected-bg)" : "var(--color-bg-subtle)", color: "var(--color-primary)", fontSize: 10.5, cursor: values.length ? "pointer" : "default", opacity: values.length ? 1 : 0.5 }}
        >Classify</button>
        {stops.length > 0 && (
          <span onClick={() => onChange(null)} title="Remove the custom classes and go back to the default ramp"
            style={{ fontSize: 10, color: "var(--color-danger-icon)", cursor: "pointer" }}>Reset</span>
        )}
      </div>
      {stops.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--color-text-secondary)", cursor: "pointer" }}>
              <input type="checkbox" checked={sym.colorMode !== "discrete"}
                onChange={(e) => onChange({ ...sym, colorMode: e.target.checked ? "continuous" : "discrete" })} />
              Blend between classes
            </label>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 150, overflowY: "auto" }}>
            {stops.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5 }}>
                <input type="color" value={s.color}
                  onChange={(e) => { const next = stops.map((x, j) => j === i ? { ...x, color: e.target.value } : x); onChange({ ...sym, stops: next }); }}
                  style={{ width: 22, height: 16, padding: 0, border: "1px solid var(--color-border-light)", borderRadius: 3, background: "none", cursor: "pointer", flexShrink: 0 }} />
                <input type="number" value={s.value}
                  onChange={(e) => { const next = stops.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x); onChange({ ...sym, stops: next }); }}
                  title="Lower bound of this class"
                  style={{ flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "2px 4px", fontSize: 10.5, color: "var(--color-text)" }} />
                <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>&ge;</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LayerQuickPanel({ rows, meta, layerKey, categoryFilter, onToggleCategory, onIsolate, onRemoveSource, numericSym, onNumericSymChange }) {
  const categories = meta.numeric ? [] : distinctValues(rows);
  const sources = (() => {
    const counts = new Map();
    rows.forEach((r) => { const s = r._src || "(unlabeled)"; counts.set(s, (counts.get(s) || 0) + 1); });
    return Array.from(counts.entries());
  })();
  return (
    <div style={{ paddingTop: 8 }}>
      {meta.numeric && onNumericSymChange && (
        <NumericSymbologyEditor layerKey={layerKey} rows={rows} sym={numericSym} onChange={onNumericSymChange} />
      )}
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
                  fontSize: 10, cursor: "pointer", border: `1px solid ${hidden ? "var(--color-border-light)" : color}`,
                  color: hidden ? "var(--color-text-disabled)" : "var(--color-text)", background: hidden ? "transparent" : "var(--color-divider)",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, opacity: hidden ? 0.35 : 1 }} />
                {lbl} <span style={{ color: "var(--color-text-muted)" }}>{count}</span>
              </span>
            );
          })}
        </div>
      )}
      {sources.length > 1 && (
        <div>
          {sources.map(([src, count]) => (
            <div key={src} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, marginBottom: 3 }}>
              <div style={{ flex: 1, minWidth: 0, color: "var(--color-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={src}>{src}</div>
              <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>{count}</span>
              <Trash2 size={10} style={{ cursor: "pointer", color: "var(--color-text-faint)", flexShrink: 0 }} {...iconAction(() => onRemoveSource(src), `Remove the ${count} row(s) imported from "${src}"`)} />
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
  const box = { display: "flex", alignItems: "center", gap: 10, marginLeft: 6, fontSize: 11, color: "#55606e", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "5px 10px" };
  const clearBtn = { display: "flex", alignItems: "center", gap: 3, cursor: "pointer", color: "#8a5555", fontSize: 10.5, flexShrink: 0 };
  const pillWrap = { display: "flex", alignItems: "center", gap: 2, background: "#e8eaed", borderRadius: 5, padding: 2, flexShrink: 0 };
  const pill = (active) => ({ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10.5, color: active ? "#1a2028" : "#6b7684", background: active ? "var(--color-bg)" : "transparent", boxShadow: active ? "0 1px 2px rgba(0,0,0,0.1)" : "none" });

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
        <span><b style={{ color: "var(--color-text)" }}>Total:</b> {fmtLen(totalPath)}</span>
        {pts.length > 2 && <span><b style={{ color: "var(--color-text)" }}>Straight-line:</b> {fmtLen(straight.dist3d)}</span>}
        <span><b style={{ color: "var(--color-text)" }}>Last segment:</b> {fmtLen(last.dist3d)} @ {last.azimuth.toFixed(1)}° (Δelev {last.vert >= 0 ? "+" : ""}{last.vert.toFixed(1)} m)</span>
        <span style={{ color: "var(--color-text-muted)" }}>{pts.length} pt(s)</span>
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
      <span><b style={{ color: "var(--color-text)" }}>Area:</b> {fmtArea(area)}</span>
      <span><b style={{ color: "var(--color-text)" }}>Perimeter:</b> {fmtLen(perimeter)}</span>
      <span style={{ color: "var(--color-text-muted)" }}>{pts.length} pt(s)</span>
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
    <div style={{ marginTop: 8, padding: "8px 9px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 11.5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div onClick={() => onUpdate(model.id, { visible: model.visible === false })} style={{ cursor: "pointer", color: model.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }} title={model.visible !== false ? "Hide" : "Show"}>
          {model.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{model.name}</div>
        {isFiltered && <span style={{ color: "var(--color-info)", fontSize: 10, flexShrink: 0 }} title="A range filter is active on this model">band</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
        <span style={{ color: "var(--color-text-faint)", width: 30, flexShrink: 0 }}>Min</span>
        <input type="range" min={model.min} max={model.max} step={(model.max - model.min) / 200 || 0.01} value={dispMin} onChange={(e) => onMinInput(Math.min(Number(e.target.value), dispMax))} style={{ flex: 1 }} />
        <span style={{ color: "var(--color-text-secondary)", width: 58, textAlign: "right", flexShrink: 0 }}>{dispMin.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
        <span style={{ color: "var(--color-text-faint)", width: 30, flexShrink: 0 }}>Max</span>
        <input type="range" min={model.min} max={model.max} step={(model.max - model.min) / 200 || 0.01} value={dispMax} onChange={(e) => onMaxInput(Math.max(Number(e.target.value), dispMin))} style={{ flex: 1 }} />
        <span style={{ color: "var(--color-text-secondary)", width: 58, textAlign: "right", flexShrink: 0 }}>{dispMax.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, fontSize: 10.5, color: "var(--color-text-muted)" }}>
        <span>Showing {visibleCount.toLocaleString()} of {model.cells.length.toLocaleString()} cell(s)</span>
        {isFiltered && <span onClick={reset} style={{ cursor: "pointer", color: "var(--color-info)" }}>Reset</span>}
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
// TASKS.csv #239 — mineral-exploration/QGIS-specialist audit finding: "no utility to pick a target
// point and solve azimuth/dip from a chosen collar." Straight-line solve only (matches how a planned
// hole is already designed here — a single azimuth/dip/length, not a multi-segment survey plan): given
// a start point (an existing real collar, or the x/y/z fields above) and a typed target point, computes
// the azimuth/dip a straight hole from the start would need to pass through the target, and the
// straight-line distance (pre-filled into Length so "+ Add hole" produces a hole that actually reaches
// it, not the previous default length falling short or overshooting).
// TASKS.csv #119 — this used to be a local 10-line implementation here. It is now a thin adapter over
// holePlanning.js's solveOrientationToTarget, which is the same math (verified bit-identical over
// 200,000 random collar/target pairs: max azimuth/dip difference 0.000e+0 deg, max length difference
// 9.095e-13 m) but lives in a pure, Node-unit-tested module that the per-hole targeting panel
// (components/PlannedHoleTargeting.jsx) also uses. Two copies of the same trigonometry in one app is
// exactly how the two halves of a feature drift apart.
//
// The one behavioural difference is deliberate: solveOrientationToTarget returns null when the target
// IS the collar (no direction is defined) where the old local version silently returned az 0 / dip 0 /
// distance 0. Callers here already gate on targetReady/fromReady, and the `|| { ... }` fallback below
// preserves the old shape for that degenerate case so no call site has to change.
function solveAzDipToTarget(from, to) {
  const s = solveOrientationToTarget(from, to) || { azimuth: 0, dip: 0, length: 0 };
  return { azimuth: s.azimuth, dip: s.dip, distance: s.length };
}
function PlannedHoleAddForm({ onAdd, pickMode, onStartPick, pickedPoint, collars }) {
  const [draft, setDraft] = useState({ name: "", x: "", y: "", z: "", azimuth: 0, dip: -60, length: 100 });
  const [fromCollarId, setFromCollarId] = useState("");
  const [target, setTarget] = useState({ x: "", y: "", z: "" });
  const set = (k, v) => setDraft((p) => ({ ...p, [k]: v }));
  const lastAppliedPick = useRef(null);
  useEffect(() => {
    if (!pickedPoint || pickedPoint === lastAppliedPick.current) return;
    lastAppliedPick.current = pickedPoint;
    setDraft((p) => ({ ...p, x: Math.round(pickedPoint.x * 10) / 10, y: Math.round(pickedPoint.y * 10) / 10, z: Math.round(pickedPoint.z * 10) / 10 }));
  }, [pickedPoint]);
  const applyFromCollar = (holeId) => {
    setFromCollarId(holeId);
    const c = collars.find((h) => h.hole_id === holeId);
    if (c) setDraft((p) => ({ ...p, name: p.name || `${holeId}-target`, x: c.x, y: c.y, z: c.z }));
  };
  const targetReady = ["x", "y", "z"].every((k) => target[k] !== "" && !isNaN(Number(target[k])));
  const fromReady = draft.x !== "" && draft.y !== "" && draft.z !== "" && !isNaN(Number(draft.x)) && !isNaN(Number(draft.y)) && !isNaN(Number(draft.z));
  const solveTarget = () => {
    if (!targetReady || !fromReady) return;
    const { azimuth, dip, distance } = solveAzDipToTarget(
      { x: Number(draft.x), y: Number(draft.y), z: Number(draft.z) },
      { x: Number(target.x), y: Number(target.y), z: Number(target.z) },
    );
    setDraft((p) => ({ ...p, azimuth: Math.round(azimuth * 10) / 10, dip: Math.round(dip * 10) / 10, length: Math.round(distance * 10) / 10 }));
  };
  const canAdd = draft.x !== "" && draft.y !== "" && draft.z !== "" && !isNaN(Number(draft.x)) && !isNaN(Number(draft.y)) && !isNaN(Number(draft.z)) && !isNaN(Number(draft.azimuth)) && !isNaN(Number(draft.dip)) && Number(draft.length) > 0;
  const submit = () => {
    if (!canAdd) return;
    onAdd({ name: draft.name.trim() || undefined, x: Number(draft.x), y: Number(draft.y), z: Number(draft.z), azimuth: Number(draft.azimuth), dip: Number(draft.dip), length: Number(draft.length) });
    setDraft({ name: "", x: "", y: "", z: "", azimuth: 0, dip: -60, length: 100 });
    setFromCollarId(""); setTarget({ x: "", y: "", z: "" });
  };
  return (
    <div style={{ padding: "8px 9px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6 }}>
      <input placeholder="Hole name (optional)" value={draft.name} onChange={(e) => set("name", e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", fontSize: 11.5, color: "var(--color-text)", marginBottom: 5 }} />
      {collars.length > 0 && (
        <select
          value={fromCollarId}
          onChange={(e) => applyFromCollar(e.target.value)}
          style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", fontSize: 11, color: "var(--color-text)", marginBottom: 5 }}
          title="Fill E/N/Elev below from an existing real collar, to design a new hole starting there"
        >
          <option value="">Collar (E/N/Elev): custom, typed below</option>
          {collars.map((c) => <option key={c.hole_id} value={c.hole_id}>{c.hole_id}</option>)}
        </select>
      )}
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
          style={{ ...miniBtn, flex: 1, background: pickMode ? "var(--color-primary)" : miniBtn.background, border: pickMode ? "1px solid var(--color-primary)" : miniBtn.border, color: pickMode ? "var(--color-bg)" : miniBtn.color }}
          title="Click, then click anywhere in the 3D view to place a hole there"
        >
          {pickMode ? "Click on the view…" : "Pick on view"}
        </button>
        <button onClick={submit} disabled={!canAdd} style={{ ...miniBtn, flex: 1, background: canAdd ? "var(--color-selected-bg)" : "var(--color-bg-subtle)", borderColor: canAdd ? "var(--color-selected-border)" : "var(--color-border-light)", opacity: canAdd ? 1 : 0.5 }}>+ Add hole</button>
      </div>
      <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 7, paddingTop: 7 }}>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 4 }}>Solve azimuth/dip/length to hit a target from the E/N/Elev above</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
          <NumField label="Target E" value={target.x} onChange={(v) => setTarget((p) => ({ ...p, x: v }))} />
          <NumField label="Target N" value={target.y} onChange={(v) => setTarget((p) => ({ ...p, y: v }))} />
          <NumField label="Target Elev" value={target.z} onChange={(v) => setTarget((p) => ({ ...p, z: v }))} />
        </div>
        <button onClick={solveTarget} disabled={!targetReady || !fromReady} style={{ ...miniBtn, width: "100%", background: targetReady && fromReady ? "var(--color-selected-bg)" : "var(--color-bg-subtle)", borderColor: targetReady && fromReady ? "var(--color-selected-border)" : "var(--color-border-light)", opacity: targetReady && fromReady ? 1 : 0.5 }}>Solve az/dip/length to target</button>
      </div>
    </div>
  );
}
function NumField({ label, value, onChange, placeholder }) {
  return (
    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, fontSize: 9.5, color: "var(--color-text-faint)" }}>
      {label}
      <input type="number" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 5px", fontSize: 11, color: "var(--color-text)" }} />
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
function planCollisionAndTargetChecks(plannedHoles, collars, survey, voxelModels, desurveyMethod) {
  // TASKS.csv #135 — the real-hole traces a planned hole is checked for collisions against must be
  // built with the SAME method the 3D view draws them with, or the reported clearance is measured
  // against a trace the user can't see.
  const realTraces = collars
    .map((c) => ({ hole_id: c.hole_id, pts: desurveyHole(c, survey.filter((s) => s.hole_id === c.hole_id && !isNaN(s.depth)), desurveyMethod) }))
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

function PlannedHoleChecks({ plannedHoles, collars, survey, voxelModels, desurveyMethod }) { // #135
  const [minSpacing, setMinSpacing] = useState(25);
  const [costPerM, setCostPerM] = useState("");
  const results = useMemo(() => planCollisionAndTargetChecks(plannedHoles, collars, survey, voxelModels, desurveyMethod), [plannedHoles, collars, survey, voxelModels, desurveyMethod]);
  const totalM = plannedHoles.reduce((s, h) => s + (Number(h.length) || 0), 0);
  const rate = Number(costPerM);
  const totalCost = costPerM !== "" && Number.isFinite(rate) && rate > 0 ? totalM * rate : null;
  const anyTargetModel = voxelModels.some((m) => Number.isFinite(m.threshold) && Number.isFinite(m.rangeMax) && (m.threshold > m.min || m.rangeMax < m.max));

  return (
    <div style={{ marginTop: 10, padding: "9px 10px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6 }}>
      <div style={{ fontSize: 11, color: "var(--color-text)", fontWeight: 600, marginBottom: 6 }}>Planned hole checks</div>
      <div style={{ display: "flex", gap: 4, marginBottom: 7 }}>
        <NumField label="Min. spacing (m)" value={minSpacing} onChange={(v) => setMinSpacing(v === "" ? 0 : Math.max(0, v))} />
        <NumField label="Cost ($/m)" value={costPerM} placeholder="enter your rate" onChange={setCostPerM} />
      </div>
      <div style={{ fontSize: 10.5, color: "var(--color-text-secondary)", marginBottom: 7 }}>
        {plannedHoles.length} hole{plannedHoles.length === 1 ? "" : "s"}, {totalM.toLocaleString()} m total
        {totalCost != null ? ` — est. $${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} at $${rate}/m` : ""}
      </div>
      {voxelModels.length > 0 && !anyTargetModel && (
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 7, lineHeight: 1.4 }}>
          Narrow a voxel model's Min/Max range above (in "Geophysical voxel ranges") to check planned holes against a target band.
        </div>
      )}
      {results.map(({ hole, nearestReal, targetHits }) => {
        const tooClose = nearestReal && nearestReal.distance < minSpacing;
        return (
          <div key={hole.id} style={{ padding: "6px 8px", marginBottom: 5, borderRadius: 5, background: tooClose ? "var(--color-danger-bg)" : "var(--color-bg-subtle)", border: `1px solid ${tooClose ? "var(--color-danger-border)" : "var(--color-border)"}`, fontSize: 10.5 }}>
            <div style={{ color: "var(--color-text)", marginBottom: 2 }}>{hole.name || "Planned hole"}</div>
            {nearestReal ? (
              <div style={{ color: tooClose ? "var(--color-danger-text)" : "var(--color-text-caption)" }}>
                Nearest existing hole: {nearestReal.hole_id} — {nearestReal.distance.toFixed(1)} m{tooClose ? ` (within the ${minSpacing} m minimum)` : ""}
              </div>
            ) : (
              <div style={{ color: "var(--color-text-muted)" }}>No existing drilled holes to compare against.</div>
            )}
            {targetHits.length > 0 && (
              <div style={{ color: "var(--color-info)", marginTop: 2 }}>
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
function PlannedHoleRow({ hole, onUpdate, onRemove, collars, survey }) { // #119 - collars/survey for the as-drilled comparison
  const [expanded, setExpanded] = useState(false);
  const raw = plannedHoleTrace(hole);
  const toe = raw.length ? raw[raw.length - 1] : null;
  return (
    <div style={{ marginBottom: 6, padding: "7px 9px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 11.5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div onClick={() => onUpdate(hole.id, { visible: hole.visible === false })} style={{ cursor: "pointer", color: hole.visible !== false ? "#22c9e0" : "var(--color-text-disabled)", flexShrink: 0 }} title={hole.visible !== false ? "Hide" : "Show"}>
          {hole.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
        </div>
        <div onClick={() => setExpanded((v) => !v)} style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>{hole.name || "Planned hole"}</div>
        {expanded ? <ChevronUp size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setExpanded(false), "Collapse this planned hole")} /> : <ChevronDown size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setExpanded(true), "Expand this planned hole")} />}
        <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { if (window.confirm(`Remove planned hole "${hole.name || hole.id}"?`)) onRemove(hole.id); }, `Remove planned hole "${hole.name || hole.id}"`)} />
      </div>
      <div style={{ marginTop: 3, fontSize: 10.5, color: "var(--color-text-muted)" }}>
        Az {Math.round(hole.azimuth)}° / Dip {Math.round(hole.dip)}° / {Math.round(hole.length)} m{toe ? ` — toe E ${toe.x.toFixed(0)} N ${toe.y.toFixed(0)} Elev ${toe.z.toFixed(0)}` : ""}
      </div>
      {expanded && (
        <div style={{ marginTop: 6, borderTop: "1px solid var(--color-divider)", paddingTop: 6 }}>
          <input placeholder="Name" value={hole.name || ""} onChange={(e) => onUpdate(hole.id, { name: e.target.value })} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", fontSize: 11.5, color: "var(--color-text)", marginBottom: 5 }} />
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
          <textarea placeholder="Notes" value={hole.notes || ""} onChange={(e) => onUpdate(hole.id, { notes: e.target.value })} rows={2} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", fontSize: 11, color: "var(--color-text)", resize: "vertical" }} />
          {/* TASKS.csv #119 - drill-to-target solver and planned-vs-as-drilled comparison. `raw` is
              this row's already-built trace, so the panel never desurveys the planned hole again. */}
          <PlannedHoleTargeting hole={hole} onUpdate={onUpdate} plannedPts={raw} collars={collars} survey={survey} />
        </div>
      )}
    </div>
  );
}

const pBtn = { display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px", marginBottom: 6, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "#1a2028", fontSize: 12, cursor: "pointer" };
const miniBtn = { width: 60, padding: "5px 0", borderRadius: 6, fontSize: 10.5, cursor: "pointer", border: "1px solid var(--color-border-light)", background: "var(--color-bg-subtle)", color: "#55606e" };
const iconBtn = { width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "#1a2028", cursor: "pointer" };
const smallSel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "#1a2028", fontSize: 10.5, padding: "3px 4px" };
const miniField = { flex: 1, display: "flex", flexDirection: "column", gap: 3, fontSize: 9.5, color: "#55606e" };
