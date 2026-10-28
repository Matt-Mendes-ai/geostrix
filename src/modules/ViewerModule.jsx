import React, { useRef, useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useModuleAction } from "../lib/menuRequests.js"; // TASKS.csv #565
import { lazyModal } from "../lib/lazyModal.jsx"; // TASKS.csv #301
import * as THREE from "three";
import { piercePoints as surfacePierces, piercePointRows } from "../lib/piercePoints.js"; // TASKS.csv #1009
import { Upload, Scissors, AlertTriangle, RotateCcw, RefreshCw, Eye, EyeOff, Trash2, ListFilter, Maximize2, Database, Camera, Grid3x3, Bookmark, BookmarkPlus, Pencil, X, Layers3, ChevronUp, ChevronDown, ShieldAlert, GitFork, Milestone, Map as MapIcon, Mountain, Image, FileBarChart2, Settings2, Box, Waypoints, Triangle, MapPin, ArrowUpRight, Shapes, Ruler, TerminalSquare, Beaker, Compass, Activity, GitCompare, Check } from "../components/icons.js"; // TASKS.csv #445 step 4 — memoised lucide icons // GitCompare/Check: TASKS.csv #93
const AssayStyleModal = lazyModal(() => import("../components/AssayStyleModal.jsx")); // TASKS.csv #476
import { seedBreaks } from "../lib/colorRamp.js"; // TASKS.csv #476
const GradeEstimationModal = lazyModal(() => import("../components/GradeEstimationModal.jsx"));  // TASKS.csv #301
const VariogramModal = lazyModal(() => import("../components/VariogramModal.jsx")); // TASKS.csv #147  // TASKS.csv #301
import LocatorMap from "../components/LocatorMap.jsx";
const BasemapView = lazyModal(() => import("../components/BasemapView.jsx"));  // TASKS.csv #301
import PromptModal from "../components/PromptModal.jsx";
import { toLonLat, isMetricProjectedEpsg } from "../lib/reproject.js";
import { useStore, useSetCursor, useSetTaskProgress } from "../lib/store.jsx";
import { desurveyHole, surveyAzimuthDipAt } from "../lib/desurvey.js";
import { confirmDestructive } from "../lib/confirmDestructive.js"; // TASKS.csv #386
import { blockToCells, modelledIntervals, ABOVE_TOPS, unitAt } from "../lib/modelCheck.js"; // TASKS.csv #356
import { sectionGrid, sameLine, unpackUnits, sectionPixels, blockSpacing, sectionZRange } from "../lib/modelSection.js"; // TASKS.csv #759
import { openSectionWindow, saveFile, copyText, loadSampleFiles } from "../lib/desktop.js"; // copyText: TASKS.csv #589
import { sectionFromCentre, sectionThroughHole, fenceLines } from "../lib/sectionDefs.js";
import { Ribbon, RibbonGroup, RibbonButton, TaskPaneHeader, RIBBON_TONES } from "../components/Ribbon.jsx"; // TASKS.csv #458
import { Layers, Group, Droplets, Waves, Gem, Calculator, Settings, FileSpreadsheet, Globe, Spline, PenTool, Rows3, Crosshair, Target, SquareSplitVertical, LayoutTemplate, Sparkles } from "../components/icons.js"; // TASKS.csv #445 step 4 — memoised lucide icons // #458 ribbon icons
import { solidBounds, SOLID_IMPORT_EXTENSIONS, SOLID_FACE_WARN } from "../lib/solidImportMeta.js"; // TASKS.csv #148; #552 split
import { parseSolidInWorker } from "../lib/solidImportClient.js"; // TASKS.csv #414
// TASKS.csv #414 — imported solids, one tone per layer (grey-blue family: never the generated-surface gold).
const IMPORTED_SOLID_COLORS = [0x8fa3b8, 0xa89bbd, 0x8fb8aa, 0xbfae92, 0x93b3c4, 0xb89aa4];
const SurfaceGeologyProjection = lazyModal(() => import("../components/SurfaceGeologyProjection.jsx")); // TASKS.csv #476 // TASKS.csv #318
import { spreadColor, SPREAD_NOT_REPRODUCED } from "../lib/surfaceSpread.js"; // TASKS.csv #52 (a)
import { supportShadeFactors } from "../lib/explicitSupport.js"; // TASKS.csv #977
import { ensureExportCrs } from "../lib/projectCrsRequest.js"; // TASKS.csv #1021
import { pointInBoundary } from "../lib/pointInPolygon.js"; // TASKS.csv #903 — not geoprocessing.js, which loads d3-delaunay
import { buildPickIndex, queryPickIndex } from "../lib/pickIndex.js"; // TASKS.csv #304 — object-level BVH for hover/click picking
import { useMenuKeys } from "../lib/useMenuKeys.js"; // TASKS.csv #730
import { t as tr } from "../lib/i18n.js";
import { tx } from "../lib/i18nRich.js"; // TASKS.csv #786 // TASKS.csv #786 — "tr": this file uses t as a local name
import { iconAction, activateOnKey } from "../lib/a11y.js"; // TASKS.csv #296 — keyboard-reachable icon-only controls
const AttributeTableModal = lazyModal(() => import("../components/AttributeTableModal.jsx"));  // TASKS.csv #301
import { createCompassRose } from "../components/CompassRose.js";
import { createAxisGizmo } from "../components/AxisGizmo.js";
import ViewportFigureOverlay from "../components/ViewportFigureOverlay.jsx"; // TASKS.csv #311 — in-viewport title/legend/scale-bar figure furniture
import EmptyState from "../components/EmptyState.jsx"; // TASKS.csv #309 — the shared empty-state card, extracted from this file's own #294 card
import { fixedScaleHalfHeight } from "../lib/layoutGeometry.js";
import { worldHeightAtTargetM } from "../lib/figureScale.js"; // TASKS.csv #311 — the single shared metres-per-pixel derivation (Layout's scale bar uses it too)
import { legibilityRadius, densestCentre } from "../lib/cameraFit.js"; // TASKS.csv #313 — opening-view framing (read cameraFit.js's header before touching fitBox)
import HoverToolInfo from "../components/HoverToolInfo.jsx";
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";
import PanelSplitHandle from "../components/PanelSplitHandle.jsx";
import { useBrowserPanelHeight } from "../lib/useBrowserPanelHeight.js";
const DbBrowserPanel = React.lazy(() => import("../components/DbBrowserPanel.jsx")); // startup budget (#476): loads after the first paint
const ImportMappingModal = lazyModal(() => import("../components/ImportMappingModal.jsx"));  // TASKS.csv #301
const LayerPickerModal = lazyModal(() => import("../components/LayerPickerModal.jsx")); // TASKS.csv #476 // TASKS.csv #288
const DatabaseConnectModal = lazyModal(() => import("../components/DatabaseConnectModal.jsx"));  // TASKS.csv #301
const SectionEditModal = lazyModal(() => import("../components/SectionEditModal.jsx")); // TASKS.csv #476
const LayerInspector = lazyModal(() => import("../components/LayerInspector.jsx"));  // TASKS.csv #301
const DataQCModal = lazyModal(() => import("../components/DataQCModal.jsx"));  // TASKS.csv #301
// TASKS.csv #224 (software-design-specialist audit finding: sql.js's 658KB wasm was the single
// strongest lazy-loading candidate) — SQLWorkspaceModal statically imports sqlWorkspace.js, which
// statically imports sql.js, so a plain top-level import here pulled that wasm in on every app launch
// regardless of whether SQL workspace is ever opened. React.lazy defers the whole chain until the
// modal is actually rendered (see the Suspense wrapper at its render site below).
const SQLWorkspaceModal = React.lazy(() => import("../components/SQLWorkspaceModal.jsx"));
const SectionGeorefModal = React.lazy(() => import("../components/SectionGeorefModal.jsx")); // TASKS.csv #630
const LayerStyleModal = React.lazy(() => import("../components/LayerStyleModal.jsx")); // TASKS.csv #635
const TrendsPanel = React.lazy(() => import("../components/TrendsPanel.jsx")); // TASKS.csv #650
import { cleanTrend, trendBasis, trendScales, describeTrend } from "../lib/trend.js"; // TASKS.csv #650
import { colors } from "../lib/theme.js"; // TASKS.csv #700 — the trend preview's UI colours
import { mergeSurfaceStyle, applySurfaceStyle, surfaceBaseLook } from "../lib/surfaceStyle.js"; // TASKS.csv #636
const PredictivePanel = React.lazy(() => import("../components/PredictivePanel.jsx")); // TASKS.csv #638
const BoundaryInterceptsModal = lazyModal(() => import("../components/BoundaryInterceptsModal.jsx"));  // TASKS.csv #301
const StripLog = lazyModal(() => import("../components/StripLog.jsx"));  // TASKS.csv #301
const StereonetModal = lazyModal(() => import("../components/StereonetModal.jsx"));  // TASKS.csv #301
const DownholeStructurePlot = lazyModal(() => import("../components/DownholeStructurePlot.jsx")); // TASKS.csv #277  // TASKS.csv #301
const LevelPlanWindow = lazyModal(() => import("../components/LevelPlanWindow.jsx")); // TASKS.csv #525
const SurfaceQueryModal = lazyModal(() => import("../components/SurfaceQueryModal.jsx")); // TASKS.csv #146  // TASKS.csv #301
const SurfaceCompareModal = lazyModal(() => import("../components/SurfaceCompareModal.jsx")); // TASKS.csv #93  // TASKS.csv #301
import { buildLineages, candidatePredecessors } from "../lib/surfaceVersions.js"; // TASKS.csv #93
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
const FenceDiagramModal = lazyModal(() => import("../components/FenceDiagramModal.jsx")); // TASKS.csv #139  // TASKS.csv #301
const CoreOrientationCalculator = lazyModal(() => import("../components/CoreOrientationCalculator.jsx"));  // TASKS.csv #301
import { codesInUse, connectIntervals, effectiveCode, codeInfo } from "../lib/modellingCodes.js"; // TASKS.csv #599
import { ASSAY_ELEMENT_COLORS, assayColorFor, categoryLegendGroups, assayLegendGroups, voxelLegendGroups, scaleLegendGroup, LEGEND_CATEGORY_KEYS, mapLayerLegendGroups, boundaryLegendGroups, surfaceSampleLegendGroup } from "../lib/legendGroups.js"; // TASKS.csv #725; map / boundary / samples: #948
// TASKS.csv #843 — the anomaly map (lib/anomalyMap.js + lib/thresholds.js) and its controls load only when used: off the startup bundle
const SurfaceAnomalyControls = React.lazy(() => import("../components/SurfaceAnomalyControls.jsx"));
const EvidenceOverlayPane = React.lazy(() => import("../components/EvidenceOverlayPane.jsx")); // TASKS.csv #851 — Targeting: fuzzy overlay / weights of evidence
import { corridorRuns, mdInRuns } from "../lib/sectionCorridor.js"; // TASKS.csv #499
import { slabRuns, piercePoints, tracePolylines, pointAtMd, voxelPlanRects, meshPlanCut } from "../lib/levelPlan.js"; // TASKS.csv #525
import { structureGisAttributes } from "../lib/structureAttrs.js"; // TASKS.csv #1067
import { trueNorthBearingInGridDeg } from "../lib/inversion.js"; // TASKS.csv #577 (already in the startup chunk via compactRows)
import { outlinesKey, blockSourceKey } from "../lib/explicitLog.js"; // TASKS.csv #878
import { unitShell, meshVolume, blockUnitStats } from "../lib/unitVolumes.js"; // TASKS.csv #517; blockUnitStats: #877
const ModellingCodesPane = React.lazy(() => import("../components/ModellingCodesPane.jsx")); // TASKS.csv #599 — modelling view only, so loaded on demand (#476 budget)
import { resolveLayerStyle, cleanLayerStyle, TUBE_SEGMENTS } from "../lib/layerStyle.js"; // TASKS.csv #635
import { LAYER_META, colorForLithology, rqdColor, magColor, hashColor, distinctValues, minMax, colorForVoxelValue, makeVoxelColorResolverRGB, roleForLithology, isCrossCuttingRole, colorForMedium, classifyBreaks, paletteColorsHex, PALETTES } from "../lib/layers.js";
import { computeMeshVolume, computeTonnage } from "../lib/volumetrics.js";
import { sceneVertsToWorldFlat } from "../lib/meshFlat.js"; // TASKS.csv #600 — the exporters (meshExport.js) load on first export
import { useSculpt } from "../lib/useSculpt.js"; // TASKS.csv #145 — manual surface editing
const SculptPanel = lazyModal(() => import("../components/SculptPanel.jsx")); // TASKS.csv #476 // TASKS.csv #145
// TASKS.csv #142 — numeric (grade-shell) implicit model: composites/assays -> dense IDW grid -> marching cubes
import { SUPPORT_COLORS, MAX_BLOCKS, clampCellBudget } from "../lib/estimationMeta.js"; // SUPPORT_*: TASKS.csv #91/#92; budget: #625
import { rectilinearGrid, buildExposedFaces } from "../lib/voxelFaces.js"; // TASKS.csv #793
const SurfaceSolidsPanel = React.lazy(() => import("../components/SurfaceSolidsPanel.jsx")); // TASKS.csv #802 — loads when opened (startup budget)
const ExplicitSurfacePanel = React.lazy(() => import("../components/ExplicitSurfacePanel.jsx")); // TASKS.csv #811 — loads when opened
// TASKS.csv #693 — the 3D Modelling tool panes, loaded the first time one of them is opened
const ModellingPanes = React.lazy(() => import("./viewer/ModellingPanes.jsx"));
const MapModelPanel = React.lazy(() => import("../components/MapModelPanel.jsx")); // TASKS.csv #817
const SurfaceMappingPanel = React.lazy(() => import("../components/SurfaceMappingPanel.jsx")); // TASKS.csv #820 — the Surface Geology tab
const MODELLING_PANES = new Set(["mapmodel", "settings", "gradeEst", "explicit", "mcodes", "groups", "correlation", "geoml", "implicit", "stack", "structural", "alteration", "vein", "shell"]);
// TASKS.csv #793 — a model's rectilinear grid (or null) depends only on its cell list: built once per list
const voxelGridCache = new WeakMap();
const voxelGridOf = (model) => { let G = voxelGridCache.get(model.cells); if (G === undefined) { G = rectilinearGrid(model.cells); voxelGridCache.set(model.cells, G); } return G; };
import { PRECIOUS_METALS } from "../lib/geochem.js";
const PlannedHoleTargeting = lazyModal(() => import("../components/PlannedHoleTargeting.jsx")); // TASKS.csv #476 // TASKS.csv #119 - target solver + planned-vs-as-drilled
import { solveOrientationToTarget, plannedTrace } from "../lib/holePlanning.js"; // TASKS.csv #119 - shared, Node-verified target math; plannedTrace: #524
import { planGeometryKey, drilledTraceIndex, isTargetModel, targetBandIndex, planChecks } from "../lib/plannedHoleChecks.js"; // TASKS.csv #1039
import { extractMapContacts, orientationAt, projectContactRibbon, thinLine, densifyLine } from "../lib/mapLayers.js"; // TASKS.csv #316-#318
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
import { noticeText, noticeLevel, errorNotice, notice } from "../lib/notices.js"; // TASKS.csv #390
import { makeSurveyColorer } from "../lib/geophysSurveys.js"; // TASKS.csv #451
import { searchEllipsoidBasis, searchEllipsoidDistSq, voxelCellSupported, sampleTerrainElevation, terrainGroundAt } from "../lib/viewer/geomath.js"; // TASKS.csv #445
import { findOnTraceWorld, findOnTrace, pointInDomain, SOLID_SURFACE_TYPES } from "../lib/viewer/modelHelpers.js"; // TASKS.csv #445 step 2; SOLID_SURFACE_TYPES: #804
import { syncRasterDrapes, syncBoundaries, syncMapLayers, syncSectionImages, syncSurfaceStructures, syncOmfObjects, syncTerrain } from "../lib/viewer/sceneBuilders.js"; // TASKS.csv #693
import { syncDrawLods, dropDrawLod } from "../lib/viewer/drawLod.js"; // TASKS.csv #795
import { useModelling } from "./viewer/useModelling.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js"; // TASKS.csv #704 // TASKS.csv #445 step 2
import { isMarkedQcRow } from "../lib/qaqc.js"; // TASKS.csv #601
import { loadGpkg, groupShapefileParts } from "../lib/viewer/importHelpers.js"; // TASKS.csv #445 step 3; groupShapefileParts #600
import { useImportPipeline } from "./viewer/useImportPipeline.js"; // TASKS.csv #445 step 3
import { version as APP_VERSION } from "../../package.json"; // TASKS.csv #1034 — the drillhole tables' stamp

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
  // TASKS.csv #524 — with an expected lift / drift the trace curves (minimum curvature through synthetic
  // stations); holePlanning.plannedTrace is the one builder, so the 3D view, exports and targeting agree.
  return plannedTrace(hole);
}

function stripInternalFields(r) { return Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("_"))); }
// (binary exports go to saveFile as bytes since TASKS.csv #1040; the base64 encoder that was here is gone)


// TASKS.csv #227 (continuation) — the layer keys whose geometry is one plain THREE.Mesh per row
// (buildIntervalTube/buildPointMarkers/the structure loop), and therefore support the cheap post-hoc
// visibility/color passes below instead of a full rebuild for a categoryFilter/legendOverride change.
const CATEGORY_LAYER_KEYS = LEGEND_CATEGORY_KEYS; // TASKS.csv #725 — one list, shared with the Layout legend

// TASKS.csv #434 — back-to-front re-sort of a transparent voxel model's instances, run (throttled) while
// the camera orbits. The old version did a comparator sort of all cells plus two new Vector3 and a colour
// conversion per cell every pass: 131-165 ms per re-sort at the 100k-cell cap (measured), i.e. the main
// thread was nearly saturated while orbiting a see-through inversion. Now: per-mesh typed arrays built
// once (position, instance matrix, linear colour), a 16-bit counting sort on quantised distance (stable,
// O(n + 65536)), and a straight copy into instanceMatrix/instanceColor.
function sortVoxelInstancesBackToFront(mesh, cells, camPos) {
  let prep = mesh.userData.sortPrep;
  if (!prep || prep.n !== cells.length) {
    const n = cells.length;
    const pos = new Float32Array(n * 3), mat = new Float32Array(n * 16), col = new Float32Array(n * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const c = cells[i], m = i * 16;
      pos[i * 3] = c.x; pos[i * 3 + 1] = c.y; pos[i * 3 + 2] = c.z;
      // compose(position, identity, scale) in column-major order
      mat[m] = c.dx; mat[m + 5] = c.dy; mat[m + 10] = c.dz; mat[m + 12] = c.x; mat[m + 13] = c.y; mat[m + 14] = c.z; mat[m + 15] = 1;
      tmp.setRGB(c.r / 255, c.g / 255, c.b / 255, THREE.SRGBColorSpace);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    prep = mesh.userData.sortPrep = { n, pos, mat, col, key: new Uint16Array(n), order: new Uint32Array(n), counts: new Uint32Array(65537) };
  }
  const { n, pos, mat, col, key, order, counts } = prep;
  const px = camPos.x, py = camPos.y, pz = camPos.z;
  let maxD = 0;
  for (let i = 0; i < n; i++) {
    const dx = pos[i * 3] - px, dy = pos[i * 3 + 1] - py, dz = pos[i * 3 + 2] - pz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > maxD) maxD = d;
  }
  const scale = maxD > 0 ? 65535 / Math.sqrt(maxD) : 0;
  counts.fill(0);
  for (let i = 0; i < n; i++) {
    const dx = pos[i * 3] - px, dy = pos[i * 3 + 1] - py, dz = pos[i * 3 + 2] - pz;
    const k = 65535 - Math.min(65535, Math.floor(Math.sqrt(dx * dx + dy * dy + dz * dz) * scale)); // farthest first
    key[i] = k; counts[k + 1]++;
  }
  for (let k = 1; k <= 65536; k++) counts[k] += counts[k - 1];
  for (let i = 0; i < n; i++) order[counts[key[i]]++] = i;
  const im = mesh.instanceMatrix.array, ic = mesh.instanceColor ? mesh.instanceColor.array : null;
  for (let j = 0; j < n; j++) {
    const src = order[j];
    im.set(mat.subarray(src * 16, src * 16 + 16), j * 16);
    if (ic) { ic[j * 3] = col[src * 3]; ic[j * 3 + 1] = col[src * 3 + 1]; ic[j * 3 + 2] = col[src * 3 + 2]; }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// TASKS.csv #445 — interval merging moved to src/lib/viewer/intervals.js

// TASKS.csv #131 — small canvas-rendered text sprite, the standard three.js technique for always-
// camera-facing labels (a Sprite auto-billboards, unlike a Mesh) without pulling in a font/SDF-text
// library just for hole names. Rendered at a fixed pixel-ish canvas resolution then scaled in world
// units via sprite.scale — legible at a normal drillhole-scale zoom without turning into a giant
// screen-filling label right on top of a collar (three.js Sprites don't have a native "distance-
// independent" screen-space size mode without a custom shader, which felt like real overkill here).
//
// TASKS.csv #379 — labels are now a FIXED ON-SCREEN SIZE (SpriteMaterial.sizeAttenuation = false, which
// three.js does support; the note above was wrong). At 0.09 world units per canvas pixel a label was
// ~4 m tall: ~1.7 px at the 2,200 m overview and shimmering. fitScreenLabels() below sets each label's
// scale from the camera and the viewport height so it is LABEL_PX tall on screen, for the live
// perspective view and for orthographic captures alike. The text is also redrawn once the app font has
// loaded: measureText used to run before 'Exo 2' was ready and bake in a fallback font and width.
const LABEL_PX = 16;
const LABEL_FONT = "600 32px 'Exo 2', system-ui, sans-serif";
function makeTextSprite(text, { color = "#1a2028", bg = "rgba(255,255,255,0.85)" } = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = 32, padX = 10, padY = 6;
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false });
  const draw = () => {
    ctx.font = LABEL_FONT;
    const w = Math.ceil(ctx.measureText(text).width) + padX * 2, h = fontSize + padY * 2;
    canvas.width = w; canvas.height = h;
    ctx.font = LABEL_FONT;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, padX, h / 2);
    material.userData.labelAspect = w / h;
    texture.needsUpdate = true;
  };
  draw();
  if (document.fonts && !document.fonts.check(LABEL_FONT)) document.fonts.load(LABEL_FONT).then(() => { if (material.map) draw(); }).catch(() => {});
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, -0.35); // #379 — sit just above the collar on screen at any zoom, not on top of it
  sprite.renderOrder = 999; // draw after (on top of) opaque geometry — depthTest:false already ignores occlusion, this just keeps draw order consistent across sprites
  return sprite;
}
// Scale every fixed-size label under `group` so it is LABEL_PX tall on a viewport `viewportH` px high.
// Perspective (sizeAttenuation off): screen fraction = scale * P[5] / 2. Orthographic: three.js keeps
// the scale in world units, so it is px * world-height-per-pixel.
// TASKS.csv #380 — render ONE frame at print resolution for a capture, then restore. A capture used to be
// the live canvas: ~1,375 px across an A4 landscape page on a 1080p laptop (~118 dpi). The long side is
// raised to ~3,000 px (A4 at ~300 dpi), capped by the GPU's renderbuffer/viewport limits and 4,096 px (an
// Iris Xe-class budget). Nothing changes per frame; the canvas's CSS size never changes, so the page
// doesn't reflow. `draw()` does the actual render(s); returns the PNG data URL and its pixel size.
const CAPTURE_LONG_PX = 3000;
// TASKS.csv #906 — outW x outH (CSS px): the size the capture is drawn at, when it is not the canvas's own (a Layout
// frame's aspect); the renderer goes back to cssW x cssH afterwards.
function captureHiRes(renderer, cssW, cssH, draw, outW = cssW, outH = cssH) {
  const gl = renderer.getContext();
  const maxRb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096;
  const maxVp = gl.getParameter(gl.MAX_VIEWPORT_DIMS)?.[0] || 4096;
  const cap = Math.min(4096, maxRb, maxVp);
  const oldPr = renderer.getPixelRatio();
  const longCss = Math.max(outW, outH) || 1;
  const pr = Math.max(oldPr, Math.min(CAPTURE_LONG_PX, cap) / longCss);
  const resize = pr !== oldPr || outW !== cssW || outH !== cssH;
  try {
    if (resize) { renderer.setPixelRatio(pr); renderer.setSize(outW, outH, false); }
    renderer.setViewport(0, 0, outW, outH);
    renderer.setScissorTest(false);
    draw();
    const c = renderer.domElement;
    return { dataUrl: c.toDataURL("image/png"), width: c.width, height: c.height };
  } finally {
    if (resize) { renderer.setPixelRatio(oldPr); renderer.setSize(cssW, cssH, false); }
  }
}
function fitScreenLabels(group, camera, viewportH) {
  if (!group || !viewportH) return;
  const s = camera.isPerspectiveCamera
    ? (2 * LABEL_PX) / (viewportH * camera.projectionMatrix.elements[5])
    : (LABEL_PX * (camera.top - camera.bottom)) / (camera.zoom * viewportH);
  for (const sp of group.children) {
    const a = sp.material?.userData?.labelAspect;
    if (a) sp.scale.set(s * a, s, 1);
  }
}

// TASKS.csv #313 — how wide, in screen pixels, a lithology tube must be in the OPENING view before we
// stop zooming out to fit more of the property in. 2.5 px is the smallest width at which an
// antialiased coloured cylinder still reads as a coloured cylinder rather than as the 1 px trace line
// running down its own axis (measured on the harry_property sample; at 1 px they are indistinguishable
// — that indistinguishability is the entire bug). Lithology is the reference because it is the only
// interval layer on by default (DEFAULT_LAYER_VISIBLE below) and it is the thinnest of the tubes a
// first-time user will see; every other default-on interval layer is wider, so sizing to litho is
// conservative in the right direction.
const MIN_OPENING_TUBE_PX = 2.5;
const DEFAULT_LAYER_VISIBLE = { litho: true, alt: false, vein: false, breccia: false, structzone: false, geotech: false, recovery: false, sg: false, mnlgy: false, magsusc: false, structure: false, litho_gc: false, alt_gc: false, geophys_pts: true, surface_samples: true };
// TASKS.csv #76 — every sidebar layer key that can be sorted into a named group, same set the
// generic upload loop + geophys_pts special case used to enumerate separately.
// TASKS.csv #137 added recovery/sg — same interval-kind layers as geotech, just different fields.
const ALL_LAYER_KEYS = ["litho", "alt", "vein", "breccia", "structzone", "mnlgy", "geotech", "recovery", "sg", "magsusc", "structure", "litho_gc", "alt_gc", "geophys_pts"];
// TASKS.csv #308 (1) — the default grid colour used to be #30394a, a near-black slate at full opacity
// on a light background. Measured 11.60:1 contrast against white, against ~2.8:1 for a mid lithology
// colour, i.e. the reference grid had roughly 4x the contrast of the data it exists to reference, and
// on the loaded sample project it was genuinely the first thing the eye landed on. #c8ced8 is the same
// hue family a shade above the app's own --color-border, so the grid recedes to graph-paper the way
// Leapfrog/Micromine/Vulcan draw theirs. This is ONLY the default: gridConfig.color has had a picker in
// the grid popover since #155, and both the project file's viewerUiState and saved themes spread over
// DEFAULT_GRID (see the hydrate effect and applyTheme), so anyone who set their own keeps it, and any
// project already saved keeps whatever it stored — this changes the NEW-project/new-user default only.
const DEFAULT_GRID = { visible: false, mode: "ground", size: 1000, divisions: 20, color: "#c8ced8", axes: false }; // visible: off by default since TASKS.csv #800 (Matt)
// TASKS.csv #311 — the in-viewport figure overlay (title / legend / scale bar).
//
// DEFAULT ON, deliberately, and this was the judgement call the row asks for. The argument for
// default-off is real: a geologist working interactively may not want chrome over their data. But
// the two failure modes are not symmetric. Default-off fails INVISIBLY — the overlay is never
// discovered, the 3D snip stays unusable in a report, and #311 is still open in practice even though
// the code shipped. Default-on fails VISIBLY and cheaply — the user sees furniture they did not
// want, switches it off in one click from the Figure popover in the sub-toolbar, and (because this
// lives in viewerUiState alongside gridConfig/bgColor) it stays off for that project. The overlay is
// also small, corner-parked, pointer-transparent and less intrusive than the corner gizmos the view
// already carries. `titleText` empty means "use the project name" — see overlayTitle below.
const DEFAULT_FIGURE_OVERLAY = { enabled: true, title: true, legend: true, scale: true, titleText: "" };
// TASKS.csv #308 (4) — the scene background default. Was #ffffff, exactly the same white as the panels
// and toolbar around it, so the viewport had no visible edge and pale lithologies (m4 #d8d0b8,
// s6 #9bb8c2) nearly vanished into it. This is theme.js's `bgSubtle` token value, inlined rather than
// referenced because a three.js scene background is a JS colour value, not CSS — see theme.js's
// CSS-vs-JS boundary header. Same "default only" caveat as DEFAULT_GRID above (bgColor is persisted
// per project and has its own picker in the viewport right-click menu).
const DEFAULT_BG_COLOR = "#f4f5f7";
// TASKS.csv #378 — collar markers were a fixed cream (0xf2e9d8): 1.10:1 against this default background,
// i.e. invisible in plan view, where a vertical hole IS its collar. They now take the dark text colour
// on a light background and the old cream on a dark one (relative luminance threshold 0.35).
function collarColorFor(bg) {
  const c = new THREE.Color(bg);
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const Y = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  return Y > 0.35 ? 0x1a2028 : 0xf2e9d8;
}
// Multi-element assay display — a fixed, distinct-hue-per-slot palette (not a value-driven gradient
// like magColor) so simultaneously-shown elements stay visually distinguishable from each other; each
// element's OWN value still modulates marker size within its own min/max range (see the marker-
// building loop below). Cycles if more than 14 elements are ever toggled on at once.
//
// TASKS.csv #306 — this was eight hand-picked hues that #249's colourblind-safety pass never saw,
// because that pass was scoped to layers.js and this array lives here. A Vienot-1999 LMS-projection
// deuteranopia simulation over all 28 pairs found two genuine collisions: #4a9be0 (idx 1) vs #b47ee0
// (idx 4) at 10.2 units of simulated-sRGB distance, and #e05a4a (idx 0) vs #a97c3f (idx 7) at 12.1 —
// with the next-closest pair at 30.9, so those two were isolated failures rather than a palette-wide
// squeeze. The 1-vs-4 collision bites at a FIVE-element selection, an ordinary multi-element view.
// Replaced with CATEGORICAL_SAFE_COLORS (Okabe-Ito + Paul Tol, already in layers.js for exactly this),
// NOT a third bespoke palette. Two notes on the ordering:
//   • the first eight are Okabe-Ito in its canonical order, which is the straight substitution;
//   • the remaining six are a subset of layers.js's Paul Tol tail, reordered greedily for maximum
//     minimum-pair separation. Taking all 16 in their layers.js order is NOT safe past nine — #009E73
//     vs #CC6677 collapse to 10.3 and #CC79A7 vs #44AA99 to 11.1 under deuteranopia, i.e. as bad as the
//     palette being replaced. This 14 keeps the worst pair at 33.8 (deuteranopia and protanopia both),
//     ~3x the collision it replaces, and 14 is exactly the length of a routine multi-element ICP
//     package (the bundled harry_property assay_wide.csv has 14), so a full package now gets a
//     distinguishable colour per element instead of wrapping at 8.
// Verification numbers and the simulation are written up in this row's TASKS.csv notes.
// (ASSAY_ELEMENT_COLORS now lives in lib/legendGroups.js, shared with the Layout legend: TASKS.csv #725)

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
// assayColorFor: lib/legendGroups.js (TASKS.csv #725)
// assaySizeFor: same continuous min/max normalization as the original hardcoded 1.2–3.8 range, just
// scaled by style.sizeMult (default 1) so "change the size" has an effect without changing what the
// size differences MEAN (still "bigger sphere = higher grade within this element's own range").
// TASKS.csv #306 — the normalisation inside that 1.2-3.8 range used to be LINEAR in raw grade, and on
// real assay data that means the channel carries almost nothing. Measured over the bundled 37-hole
// harry_property assay_wide.csv: 99.2% of Au markers, 99.6% of Cu, 99.7% of Zn and 98.8% of As landed
// in the bottom 10% of the radius range, because a single high-grade outlier sets `max` three to five
// orders of magnitude above the median and every ordinary sample then maps to ~1.2. Combined with the
// per-element hue this row's palette work covers, that meant NEITHER channel actually carried grade.
// Replaced with a piecewise-linear QUANTILE map through the element's own distribution — (min, 0),
// (p50, 0.5), (p90, 0.9), (max, 1) — which is the same distribution-robust idea seedBreaks now uses for
// the colour classes, so size and colour encode the same quantity the same way. Redundant encoding is
// also what keeps grade readable for a colourblind user, radius being an achromatic channel.
// A log(value) map was implemented and measured first and is NOT what shipped: it fixes the trace
// elements (Au p05-p95 radius 1.20-2.49 instead of 1.20-1.24) but inverts on the near-normally-
// distributed major oxides in the same file, where the minimum is a tiny outlier — every Al_pct marker
// came out at radius 3.58-3.72, i.e. uniformly near-maximum, which is just the old failure at the
// other end. The quantile map fixes both: measured p05/p50/p95 radius Au 1.20/2.50/3.54 and
// Al_pct 2.27/2.50/3.56, and the share of markers stuck in the bottom tenth of the radius range falls
// from 98.8-99.7% (ore elements, linear) to 0.1-26.4% across all 14 — and what is left down there is
// now genuinely the low tail of the distribution rather than 99% of the dataset.
// `range` is one entry of globalAssayRanges. A range with no percentiles (any future caller, or a
// degenerate single-value element) falls back to the original linear min/max mapping rather than
// producing NaN radii; `min === max` keeps its original 0.3 midpoint constant.
function assaySizeFor(value, range, style) {
  const mult = style?.sizeMult ?? 1;
  const { min, max, p50, p90 } = range || {};
  let t = 0.3;
  if (max > min) {
    const seg = (v, lo, hi, tLo, tHi) => tLo + ((v - lo) / (hi - lo)) * (tHi - tLo);
    if (Number.isFinite(p50) && Number.isFinite(p90) && p50 > min && p90 > p50 && p90 < max) {
      t = value <= p50 ? seg(value, min, p50, 0, 0.5)
        : value <= p90 ? seg(value, p50, p90, 0.5, 0.9)
        : seg(value, p90, max, 0.9, 1);
    } else {
      t = (value - min) / (max - min);
    }
    t = Math.max(0, Math.min(1, t));
  }
  return (1.2 + 2.6 * t) * mult;
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
  const color = new THREE.Color(config.color || DEFAULT_GRID.color); // TASKS.csv #308 — one source of truth for the default
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
  // TASKS.csv #312 — skip shared prototype geometries (module-level singletons still referenced by
  // every other layer), and give an InstancedMesh batch its own .dispose() so its instance buffers
  // are released (disposing the geometry/material alone would not, and the geometry is shared anyway).
  group.traverse((obj) => { if (!obj.geometry?.userData?.sharedProto) obj.geometry?.dispose?.(); obj.material?.dispose?.(); obj.dispose?.(); });
}

// ---------- TASKS.csv #312 — GPU-side batching for drillhole layer objects ----------
// #304 fixed the CPU-side consequence of "one small mesh per interval" (a hover raycast linear-
// scanning 12,429 objects). This is the GPU-side half of the same structure: every one of those
// objects was also its own draw call. Measured on the real 37-hole harry_property sample in the
// REAL Electron window: 13,011 draw calls per main-scene frame, 9.86 fps while orbiting.
//
// THE APPROACH, and why it is shaped this way. Everything in this file that matters resolves a
// pick to ONE specific interval object: pickIndex.js (#304), the hover tooltip, the right-click
// context menu, applyCategoryVisibility, applyLegendOverrideColors, the visibleHoles effect,
// zoomToLayer. A naive merge would break those SILENTLY (a plausible-but-wrong interval). So the
// per-interval Mesh objects are NOT removed and NOT changed structurally — they stay exactly where
// they were, as direct children of their layer group, keeping their own userData.tip/catValue,
// their own material.color and their own .visible flag. They simply stop being DRAWN: each one is
// moved onto a non-camera three.js layer channel (PICK_ONLY_LAYER), and one InstancedMesh per
// (geometry prototype + material signature) family is added to the same group to draw all of them
// in a single call. The instanced mesh is a pure RENDER-SIDE MIRROR derived from those objects; the
// objects remain the single source of truth. Consequences worth stating explicitly:
//   * The picking path is untouched. pickHoverTargets/pickIndex/firstVisibleLayerHit still see the
//     same per-interval objects, in the same order, under the same parents.
//   * Because they are never rendered, three.js never uploads their 12,000+ geometries to the GPU.
//   * Category/legend/hole-visibility bookkeeping keeps operating on the individual objects and is
//     mirrored into the instance buffers afterwards by syncBatchedInstances().
// three.js's Raycaster does NOT test object.visible (only WebGLRenderer does — see the note in
// firstVisibleLayerHit), so moving an object to another layer channel is the only way to stop it
// drawing without changing what is pickable. pickHits() enables PICK_ONLY_LAYER on the raycaster.
const PICK_ONLY_LAYER = 1;
// Below this, an InstancedMesh (and its per-instance buffers) costs more than the draw calls it
// saves — a handful of collar markers is not worth batching.
const BATCH_MIN_MEMBERS = 24;

// Shared prototype geometries. Batching requires the members of a family to share ONE geometry, so
// the build code below creates unit-sized primitives and encodes the real size in the object's
// scale instead of baking it into a per-object geometry (a unit cylinder scaled by (r, len, r) is
// vertex-for-vertex the same shape CylinderGeometry(r, r, len) produced, and three.js's raycast
// transforms the ray into local space, so picking is unaffected). `sharedProto` also tags them so
// the rebuild/unmount disposal passes skip them — disposing a shared prototype would free buffers
// still referenced by every other user of it.
function sharedProto(geo, key) { geo.userData.protoKey = key; geo.userData.sharedProto = true; return geo; }
// Cylinder centred on its own axis by default; translated so scale.y = interval length places the
// BASE at position, matching what the per-interval CylinderGeometry(...).translate(0, len/2, 0) did.
const PROTO_CYLINDER = sharedProto(new THREE.CylinderGeometry(1, 1, 1, 6, 1, false).translate(0, 0.5, 0), "cyl6");
const PROTO_SPHERE_10 = sharedProto(new THREE.SphereGeometry(1, 10, 10), "sph10");
const PROTO_SPHERE_8 = sharedProto(new THREE.SphereGeometry(1, 8, 8), "sph8");
const PROTO_SPHERE_12 = sharedProto(new THREE.SphereGeometry(1, 12, 12), "sph12");
const PROTO_CIRCLE_24 = sharedProto(new THREE.CircleGeometry(1, 24), "circ24");
// TASKS.csv #635 — the extra shapes a layer style can pick (same unit-size + scale convention, so they batch too)
const PROTO_CYLINDER_16 = sharedProto(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false).translate(0, 0.5, 0), "cyl16");
const PROTO_PRISM_4 = sharedProto(new THREE.CylinderGeometry(1, 1, 1, 4, 1, false).rotateY(Math.PI / 4).translate(0, 0.5, 0), "prism4");
const PROTO_CUBE = sharedProto(new THREE.BoxGeometry(1.6, 1.6, 1.6), "cube"); // ~ the sphere's visual size
const PROTO_DISC_FLAT = sharedProto(new THREE.CircleGeometry(1.2, 24).rotateX(-Math.PI / 2), "discflat"); // horizontal
const PROTO_PILLAR = sharedProto(new THREE.CylinderGeometry(0.8, 0.8, 2, 12, 1, false), "pillar"); // vertical, centred
const PROTO_SQUARE = sharedProto(new THREE.PlaneGeometry(1.8, 1.8), "square"); // ~ the disc's area
const INTERVAL_PROTO = { cylinder: PROTO_CYLINDER, smooth: PROTO_CYLINDER_16, square: PROTO_PRISM_4 };
const POINT_PROTO = { sphere: PROTO_SPHERE_10, cube: PROTO_CUBE, disc: PROTO_DISC_FLAT, pillar: PROTO_PILLAR };

// TASKS.csv #695 — what a batched (never drawn) member keeps of its material; see buildLayerBatches
function pickOnlyMaterial(src) {
  return { isPickOnlyMaterial: true, color: src.color, side: src.side, transparent: src.transparent, opacity: src.opacity, visible: true, dispose() {} };
}

const _batchMatrix = new THREE.Matrix4();
const _batchZero = new THREE.Vector3(0, 0, 0);
// Mirrors the current state of a batch's member objects into its instance buffers. Called after a
// rebuild and after every in-place mutation of a member (applyCategoryVisibility's .visible flips,
// applyLegendOverrideColors' material.color repaints, the visibleHoles effect's .visible flips).
// A hidden member is written as a zero-scale matrix, which collapses its triangles to a point so
// nothing rasterizes — the instance is still there, so re-showing it is just another matrix write
// and never a rebuild.
function syncBatchedInstances(inst) {
  const members = inst.userData.batchMembers;
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    m.updateMatrix();
    // #695 — a member's world matrix is no longer refreshed by the render loop (see buildLayerBatches), so a change
    // made here must refresh it too, or picking would test the old placement
    m.updateMatrixWorld();
    _batchMatrix.copy(m.matrix);
    if (m.visible === false) _batchMatrix.scale(_batchZero);
    inst.setMatrixAt(i, _batchMatrix);
    inst.setColorAt(i, m.material.color);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  // Both are cached and would otherwise go stale: boundingSphere drives frustum culling, boundingBox
  // drives zoomToLayer's Box3.setFromObject.
  inst.boundingBox = null;
  inst.boundingSphere = null;
}

// Builds the InstancedMesh mirrors for one already-populated layer group. Members are grouped by
// (shared prototype geometry + every material property that affects how it draws), so two objects
// only ever share a draw call when they would have rendered identically apart from colour and
// transform. Anything without a shared prototype geometry (a curved TubeGeometry interval, a
// drillhole trace Line, a hole-label Sprite) is simply not a candidate and keeps drawing as before.
function buildLayerBatches(group) {
  const families = new Map();
  for (const child of group.children) {
    if (!child.isMesh || child.isInstancedMesh) continue;
    if (child.userData.batched) continue; // #695 — already mirrored by a batch (and holding a pick-only material)
    const protoKey = child.geometry?.userData?.protoKey;
    if (!protoKey) continue;
    const m = child.material;
    if (!m || Array.isArray(m) || !m.color) continue;
    const sig = `${protoKey}|${m.type}|${m.transparent ? 1 : 0}|${m.opacity}|${m.side}|${m.depthWrite ? 1 : 0}|${m.depthTest ? 1 : 0}`;
    let fam = families.get(sig);
    if (!fam) families.set(sig, (fam = { geometry: child.geometry, material: m, members: [] }));
    fam.members.push(child);
  }
  for (const fam of families.values()) {
    if (fam.members.length < BATCH_MIN_MEMBERS) continue;
    const material = fam.material.clone();
    // Per-instance colour comes from instanceColor, which the shader MULTIPLIES by the material's
    // own diffuse colour — so the batch material must be white or every interval would be tinted by
    // whichever member happened to be cloned. (Do NOT set vertexColors:true here either; see the
    // voxel InstancedMesh's own comment for the black-render bug that causes.)
    material.color.setHex(0xffffff);
    // three.js draws a transparent object's instances in fixed array order, not back-to-front, and
    // the whole batch now sorts as ONE object at the group's origin instead of as thousands of
    // individually depth-sorted tubes. With depthWrite left on, an instance that happens to be
    // drawn first would depth-reject everything behind it and whole tubes would visibly disappear
    // as the camera moves. depthWrite:false (exactly what #201 did for transparent voxels, for the
    // same reason) removes that: every instance blends over what is already there. Blend ORDER is
    // still approximate for overlapping transparent tubes, which is the one accepted visual
    // trade-off of this row — opaque layers are unaffected and keep depthWrite:true.
    if (material.transparent) material.depthWrite = false;
    const inst = new THREE.InstancedMesh(fam.geometry, material, fam.members.length);
    // Never a pick target: pickHoverTargets skips it, so a hit always resolves to the real
    // per-interval object and never to the batch (which could not answer "which interval?").
    inst.userData.pickIgnore = true;
    inst.userData.batchMembers = fam.members;
    // TASKS.csv #436 — a pick-only member never moves after the build (syncBatchedInstances calls
    // updateMatrix() itself on any change), so three.js need not re-compose its local matrix from
    // position/quaternion/scale on every rendered frame: measured 10.5 -> 6.2 ms per frame of pure CPU
    // at 60,000 intervals (~200 holes). World matrices keep updating (a parent transform stays correct).
    // TASKS.csv #695 — and its WORLD matrix need not be re-multiplied every frame either. That only pays off if
    // the ancestors stop recomposing too: three.js's updateMatrixWorld() forces the whole subtree whenever a
    // parent with matrixAutoUpdate recomposes its own matrix, which the scene, root and layer group did every
    // frame. None of them is ever moved (layer content is rebuilt, never transformed - see #304's pick-index
    // contract), so they are frozen here and at scene setup. Measured in Node, three r160, 250,000 members:
    // updateMatrixWorld 39.3 -> 3.9 ms per frame. matrixWorld is computed once now, which also means a pick
    // between a rebuild and the next frame sees the right placement.
    group.updateWorldMatrix(true, false);
    group.matrixAutoUpdate = false;
    for (const m of fam.members) {
      m.layers.set(PICK_ONLY_LAYER); m.updateMatrix(); m.matrixAutoUpdate = false; m.updateMatrixWorld(); m.matrixWorldAutoUpdate = false;
      // TASKS.csv #695 — a member is never drawn, so its MeshLambertMaterial (~1.2 kB of heap each, measured) only
      // ever answered two questions: its colour (read by syncBatchedInstances, repainted by applyLegendOverrideColors)
      // and its face side (read by Mesh.raycast). A stand-in holding just those is ~0.2 kB: about 160 MB less for an
      // 83k-assay project showing two elements. The original was never rendered, so it holds no GPU resources.
      m.material = pickOnlyMaterial(m.material);
      m.userData.batched = true;
    }
    group.add(inst);
    syncBatchedInstances(inst);
  }
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
  { key: "intrusion_body", label: "Intrusion body" }, // TASKS.csv #821 — a closed body from the geological map
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
  { key: "explicit_surface", label: "Explicit surface (through hand-picked contacts)" }, // TASKS.csv #811
  // TASKS.csv #570 — a solid linked by hand from section outlines: explicit, not interpolated
  { key: "explicit_wireframe", label: "Explicit wireframe (linked section outlines)" },
  { key: "explicit_surface_kept", label: "Explicit surface — kept version (frozen)" }, // TASKS.csv #878
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


// TASKS.csv #445 — search ellipsoid / anisotropy / clustering / terrain maths moved to src/lib/viewer/geomath.js

// TASKS.csv #155 — "3D Modelling" is now its own top-level module (a peer of "3D View" in App.jsx's
// module bar) rather than a sub-tab nested inside the Viewer. Both are still this SAME component
// underneath — the 3D scene/camera/rendering machinery, and every piece of modelling state
// (implicitSurfaces, domains, search ellipsoid, etc.), all live here and would be a large, risky
// undertaking to duplicate into a truly separate component. `mode` just picks which sidebar content
// renders: "view" (collars/survey/layers/rasters — the former "Home" tab) or "modelling" (domains/
// surfaces/implicit-modelling tools — the former "Modelling" tab). App.jsx renders one or the other
// depending on which top-level tab is active, never both at once.
// TASKS.csv #225 — `visible` defaults to `true` deliberately: every existing call site (App.jsx, before
// this row's own fix lands there) doesn't pass it at all, so every behavior below is a pure no-op until
// App.jsx actually starts rendering ViewerModule as a single persistent instance and passing `false`
// while another tab is shown. See this row's own TASKS.csv notes for the staged rollout this follows.
// TASKS.csv #696 — true when two versions of a voxel model draw the same instances: every field the same object /
// value except the display-only ones, and the same side of opaque / transparent (the transparent path keeps a
// per-cell list for the depth sort and a different depthWrite).
// TASKS.csv #700 — the trend preview in UI colours: it was drawn in 0xd9601a / 0x8f1f3d, two of the warm data ramp's
// own anchors (chargeability, geoML, log-coloured models), so over those models the ellipsoid changed a cell by
// dE00 0-10 and disappeared. Blue sits outside every warm ramp and away from viridis's ends.
const TREND_PREVIEW = { ellipsoid: colors.info, plane: colors.info, axis: colors.text };
// TASKS.csv #684 — a "point" layer row that is really an interval (mineralisation logs)
const isIntervalRow = (r) => Number.isFinite(r.from) && Number.isFinite(r.to) && r.to - r.from > 0.5;
const VOXEL_DISPLAY_ONLY = new Set(["opacity", "visible", "name"]);
// TASKS.csv #904 — above this many shown blocks a TRANSPARENT model is drawn as one face mesh (its skin and, for a unit
// model, its contacts) instead of sorted instanced boxes: Matt, "the block models render very fast even with a high
// budget of 10 million. But when I change the opacity they render very slow" - 10 M boxes are 120 M blended triangles,
// and the back-to-front re-sort of 10 M instances ran every 150 ms while the camera moved.
const TRANSPARENT_BOX_LIMIT = 200_000;
function voxelGeometryUnchanged(a, b) {
  if (a === b) return true;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!VOXEL_DISPLAY_ONLY.has(k) && a[k] !== b[k]) return false;
  return ((a.opacity ?? 0.85) < 1) === ((b.opacity ?? 0.85) < 1); // (a big model's transparent face mesh is built when it turns transparent: #904)
}

export default function ViewerModule({ mode = "view", visible = true }) {
  const store = useStore();
  // TASKS.csv #336 — latest survey/layers for import notices. commitImportData is reached through the
  // multi-file queue's long-lived callback, whose closure can hold stale store values.
  const importStateRef = useRef({});
  importStateRef.current = { survey: store.survey, layers: store.layers, collars: store.collars, project: store.project, terrain: store.terrain, addMapLayer: store.addMapLayer, projectIsEmpty: store.projectIsEmpty, setEpsg: store.setEpsg }; // terrain/addMapLayer: #609; projectIsEmpty/setEpsg: #607
  // TASKS.csv #226/#214 — cursor's own tiny context (see store.jsx's CursorProvider comment): this
  // component calls setCursor() on every pointermove but never actually reads the live cursor VALUE
  // anywhere in its own render output (only the status bar in App.jsx does), so subscribing here only
  // to the stable setter — never to CursorValueContext — means this, the single largest and most
  // render-expensive component in the app, is no longer forced to re-render on every mouse-move tick.
  const setCursor = useSetCursor();
  // Same split, same reasoning, for taskProgress (TASKS.csv #226 follow-up) — this component calls
  // setTaskProgress repeatedly during a modelling run/multi-file import but never reads its value.
  const setTaskProgress = useSetTaskProgress();
  const {
    collars, setCollars, survey, setSurvey, layers, setLayers, replaceLayer, assays, assayElements,
    desurveyMethod, // TASKS.csv #135 — project-wide desurvey method; every trace built here must use it
    surfaceSamples, surfaceElements,
    plannedHoles, addPlannedHole, updatePlannedHole, removePlannedHole,
    generatedSurfaces, setGeneratedSurfaces, modelDomains, setModelDomains, // TASKS.csv #52 — persisted implicit surfaces + domains
    getProjectToken, isSameProject, // TASKS.csv #466
    customLayers: storeCustomLayers, setCustomLayers: setStoreCustomLayers,
    viewerUiState, setViewerUiState, viewerUiStateSeq,
    lastCamState, setLastCamState,
    addLayoutImage, goToModule, requestViewportRender, // requestViewportRender: #1005
    themes, addTheme, renameTheme, deleteTheme,
    viewportRenderRequest, viewportPendingRequest, resolveViewportRender,
    rasters, addRaster, updateRaster, removeRaster,
    boundaries, addBoundary, updateBoundary, removeBoundary,
    mapLayers, surfaceStructures, // TASKS.csv #316/#317
    setSurfaceSampleLegend, // TASKS.csv #948
    geochemThresholds, // TASKS.csv #843 — saved anomaly thresholds, for the anomaly map
    updateMapLayer, removeMapLayer, // TASKS.csv #628 — the Map layers list in this sidebar
    sectionImages, addSectionImage, updateSectionImage, removeSectionImage, // TASKS.csv #630
    fieldStructuralRefs, addFieldRef, removeFieldRef,
    lithoGroups, addLithoGroup, updateLithoGroup, removeLithoGroup,
    modellingCodes, setModellingCodes, // TASKS.csv #599
    structuralTrends, setStructuralTrends, // TASKS.csv #650
    explicitSurfaces, setExplicitSurfaces, // TASKS.csv #811
    omfObjects, updateOmfObject, removeOmfObject,
    terrain, updateTerrain,
    geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax,
    geophysSurveys, // TASKS.csv #451
    voxelModels, addVoxelModel, updateVoxelModel, removeVoxelModel,
    setAssays, setAssayElements, addOmfObject, saveDcipLine, voxelCellBudget, // TASKS.csv #637 — the Woodjam sample's assays / ZTEM / IP
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
    return `Surface sample${row.sample_id ? ` ${row.sample_id}` : ""} (${row.medium})\n${vals}\n${row.x.toFixed(0)}E ${row.y.toFixed(0)}N ${row.z.toFixed(0)}Z${row.zDraped ? " (from the terrain — no elevation in the file)" : ""}`; // #606
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
  // TASKS.csv #453 — interactive 3D slice (clipping). Planes are applied only while the MAIN scene renders
  // (renderer.clippingPlanes), so the compass, the axis gizmo and helpers drawn afterwards are never cut.
  // Planes live in scene coordinates: x = east - origin, y = elevation - origin, z = -(north - origin).
  const [slice3d, setSlice3d] = useState({ on: false, mode: "vertical", azimuth: 0, pos: 0.5, thickness: 50 });
  const slicePlanesRef = useRef([]);
  const layerGroupsRef = useRef({});
  const raycasterRef = useRef(new THREE.Raycaster());
  const headlightRef = useRef(null); // TASKS.csv #308 — the scene's DirectionalLight, repositioned to follow the camera in updateCamera()
  // Restore the camera angle/distance/target from wherever it was left last time this component was
  // mounted (View<->Modelling round trip, or any other module round trip) — see lastCamState's own
  // comment in store.jsx for why this couldn't just live in React state directly.
  const camState = useRef(lastCamState
    ? { theta: lastCamState.theta, phi: lastCamState.phi, radius: lastCamState.radius, target: new THREE.Vector3(lastCamState.target.x, lastCamState.target.y, lastCamState.target.z) }
    : { theta: Math.PI / 4, phi: Math.PI / 3, radius: 600, target: new THREE.Vector3(0, 0, 0) });
  // TASKS.csv #225 — now effectively vestigial for its ORIGINAL purpose: this only ever fires on a real
  // component unmount, and since a single ViewerModule instance now stays mounted persistently across
  // View/Modelling/Targeting (see App.jsx), that no longer happens on every mode switch the way it used
  // to — camState.current itself keeps living across those switches regardless, so nothing is lost.
  // Left in place harmlessly (it still correctly persists the final camera position at real app
  // teardown/project-tab-close), not removed, since store.jsx's `lastCamState` is also still read by
  // the viewerUiStateSeq hydrate effect above on a genuine New/Open project.
  useEffect(() => {
    return () => {
      const cs = camState.current;
      setLastCamState({ theta: cs.theta, phi: cs.phi, radius: cs.radius, target: { x: cs.target.x, y: cs.target.y, z: cs.target.z } });
    };
  }, []); // unmount-only — see the comment above camState's declaration
  const dragRef = useRef({ dragging: false, panning: false, lastX: 0, lastY: 0 });
  const originRef = useRef({ x: 0, y: 0, z: 0 });
  const tracesRef = useRef([]);
  const compassRef = useRef(null);
  const axisGizmoRef = useRef(null); // TASKS.csv #189 — small camera-synced N/E/Z axis-triad widget, bottom-left of the 3D view
  const lastTracesRef = useRef([]);
  // TASKS.csv #313 — the opening (legibility-clamped) view, kept so a later canvas resize can redo it:
  // { traces, radius, target }. Cleared as soon as the camera no longer matches what the clamp set,
  // i.e. the moment the view belongs to the user. applyClampRef is the indirection the mount effect's
  // resize() needs, since the clamp callback is declared far below it.
  const openingFitRef = useRef(null);
  const applyClampRef = useRef(null);
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
  // TASKS.csv #319 — the seeded ramp is now built around the element's OWN colour, so switching several
  // elements on gives each its own hue with grade as lightness inside it, instead of painting all of
  // them with one shared three-colour ramp (which left identity carried only by a sub-pixel fan offset).
  // The colour used is the one this element will actually be drawn with: the user's override if they set
  // one, otherwise its pick-order colour — and the index is the position it is about to occupy, which is
  // the end of the list, matching how assayColorFor indexes the same array at marker-build time.
  const toggleAssayElement = (symbol) => {
    const turningOn = !assayDisplayElements.includes(symbol);
    const idx = turningOn ? assayDisplayElements.length : assayDisplayElements.indexOf(symbol);
    setAssayDisplayElements((p) => p.includes(symbol) ? p.filter((s) => s !== symbol) : [...p, symbol]);
    if (turningOn) {
      setAssayStyle((s) => {
        if (s[symbol]?.breaks?.length) return s; // user already has their own breaks -- don't clobber
        const range = globalAssayRanges[symbol] || { min: 0, max: 0 };
        const baseColor = s[symbol]?.color || ASSAY_ELEMENT_COLORS[idx % ASSAY_ELEMENT_COLORS.length];
        return { ...s, [symbol]: { ...(s[symbol] || {}), breaks: seedBreaks(range, baseColor) } };
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
      // TASKS.csv #306 — p50/p90 alongside min/max, because seedBreaks' default class boundaries are
      // now percentile-based rather than equal-interval (see seedBreaks' own comment for the measured
      // reason: equal-interval put 99.8-100% of every ore element in this file's data into class 1).
      // Cost is one sort of each element's values, once per assays/assayElements change — measured at
      // ~11 ms total for all 14 elements of the 6,297-interval harry_property assay file, inside a
      // useMemo that already walks the same array 14 times to build the ranges at all.
      const finite = vals.filter(Number.isFinite).sort((a, b) => a - b);
      const q = (p) => (finite.length ? finite[Math.min(finite.length - 1, Math.floor(p * (finite.length - 1)))] : undefined);
      out[e.symbol] = { ...minMax(vals), p50: q(0.5), p90: q(0.9) }; // not Math.min/max(...vals) — a large assay dataset can exceed the JS engine's argument-spread limit, see layers.js's minMax comment
    });
    return out;
  }, [assays, assayElements]);
  // TASKS.csv #437 — the hover tooltip is written straight to its DOM node instead of React state:
  // setTooltip({x, y, text}) ran on every pointermove over an interval and re-rendered this whole
  // 10k-line component (133 useState) each time. Same signature as before, so every caller is unchanged.
  const tooltipElRef = useRef(null);
  const setTooltip = useCallback((t) => {
    const el = tooltipElRef.current;
    if (!el) return;
    if (!t) { if (el.style.display !== "none") el.style.display = "none"; return; }
    if (el.textContent !== t.text) el.textContent = t.text;
    el.style.left = `${t.x + 14}px`; el.style.top = `${t.y + 14}px`;
    el.style.display = "block";
  }, []);
  const [notices, setNotices] = useState([]);
  const [toast, setToast] = useState(null); // { text, key } — most recent notice, shown briefly over the viewport
  const toastTimerRef = useRef(null); // #690
  const [inspectLayer, setInspectLayer] = useState(null);
  const [importModal, setImportModal] = useState(null);
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [qcModalOpen, setQcModalOpen] = useState(false); // TASKS.csv #82 — data QA/QC modal
  const [sectionGeorefOpen, setSectionGeorefOpen] = useState(false); // TASKS.csv #630
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
  // TASKS.csv #599 — modelling codes: pick an interval in the 3D view (Modelling tab), connect it to another hole
  const [mcPickMode, setMcPickMode] = useState(false);
  const [mcSelected, setMcSelected] = useState(null); // the litho row picked
  const [explicitPickFor, setExplicitPickFor] = useState(null); // TASKS.csv #811 — the explicit surface 3D clicks add picks to
  const [explicitSnap, setExplicitSnap] = useState(true);
  // TASKS.csv #813 — a tool (the Explicit surface panel's "Edit picks") may claim a left press in the 3D view before it
  // becomes an orbit: (event, x, y in the canvas) -> true when it took the press and handles the drag itself
  const viewDragHookRef = useRef(null);
  const [mcConnectFrom, setMcConnectFrom] = useState(null); // the row the next pick gets connected to
  const mcDownRef = useRef(null); // pointer-down position: a drag (orbit / pan) is not a pick
  const [pickedHolePoint, setPickedHolePoint] = useState(null);

  const [sectionMode, setSectionMode] = useState(false);
  const sectionPts = useRef([]);
  const [sectionPreview, setSectionPreview] = useState(null);
  const [sectionCorridor, setSectionCorridor] = useState(100);
  // TASKS.csv #393 — a section typed by centre / azimuth / length (blank centre = the data's centre).
  const [typedSection, setTypedSection] = useState({ e: "", n: "", azimuth: 0, length: 500 });

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
  // TASKS.csv #311 — the three saturated world-origin axis lines (mkAxis in the mount effect below)
  // are the single most debug-view-looking element in a screenshot, and they sit at the PROJECT
  // ORIGIN, which is an arbitrary place relative to the data (it can land straight through a hole
  // cluster). They are not vestigial — #189 matched the AxisGizmo's arrow colours to them on purpose
  // so the gizmo and the scene never disagree — so this makes them a toggle (grouped with the grid in
  // the same popover, the same kind of reference-furniture decision) defaulting OFF rather than
  // deleting them. The colour-agreement rationale still holds whenever they are switched back on.
  const axisLinesRef = useRef([]);
  // TASKS.csv #311 — figure overlay config; see DEFAULT_FIGURE_OVERLAY for the default-on reasoning.
  const [figureOverlay, setFigureOverlay] = useState({ ...DEFAULT_FIGURE_OVERLAY });
  // TASKS.csv #635 — per-layer style overrides (lib/layerStyle.js), saved in the project's view state like the legend
  // overrides; styleTarget = the layer whose Style dialog is open; rowMenu = the right-click menu of a non-interval row.
  const [layerStyles, setLayerStyles] = useState({});
  const [styleTarget, setStyleTarget] = useState(null); // { key, kind, label, defaults, categoriesKey }
  const [rowMenu, setRowMenu] = useState(null); // { x, y, title, items: [{ label, onClick } | "-"] }
  const setLayerStyle = useCallback((key, kind, patch) => setLayerStyles((p) => {
    const next = { ...p };
    const c = patch === null ? null : cleanLayerStyle({ ...(p[key] || {}), ...patch }, kind);
    if (c) next[key] = c; else delete next[key];
    return next;
  }, []), []);
  // Set by ViewportFigureOverlay to its own imperative scale-bar updater, and called from
  // updateCamera()/resize() below. Deliberately a ref-held callback rather than React state: a camera
  // move must NOT re-render this module (#312's 142.9 fps is not something to spend on chrome), and
  // the overlay's updater itself early-returns without touching the DOM when the bar is unchanged.
  const figureOverlaySignalRef = useRef(null);

  // Viewport background color — defaults to white (matching the rest of the app's UI theme), but the
  // user can pick a different one from the viewport's right-click menu (below) for cases where white
  // washes out a light-colored model/raster, or just personal preference. Persisted the same way as
  // every other viewer UI setting (layerVisible, gridConfig, etc. — see the hydrate/push effects below).
  const [bgColor, setBgColor] = useState(DEFAULT_BG_COLOR);
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
  const [tracesSeq, setTracesSeq] = useState(0); // TASKS.csv #888 — bumped once the hole traces are rebuilt (a survey / collar / desurvey change)

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
  // TASKS.csv #316/#317 — draped GIS map layers and outcrop structure symbols, same own-group pattern.
  // The geometry-rebuild effect only needs map data for its no-collar camera anchor, so it depends on
  // this extent signature rather than the layers themselves (style edits change mapLayers constantly).
  // TASKS.csv #407 — generated surfaces, imported solids and vein/structural meshes store SCENE vertices
  // computed once against whatever origin was current when they were built. The origin is the mean of the
  // collars, so importing or removing collars later moved every drillhole while these meshes stayed put:
  // they drifted relative to the holes, and their OBJ/DXF exports (which add back the CURRENT origin)
  // drifted by the same amount. meshOriginRef records the origin they were built against; whenever the
  // rebuild effect sets a new origin, syncImplicitOrigin shifts their vertices by the difference, once.
  const meshOriginRef = useRef({ x: 0, y: 0, z: 0 }); // same starting value as originRef: anything built before the first rebuild used it
  const syncImplicitOrigin = () => {
    const o = originRef.current;
    const prev = meshOriginRef.current;
    meshOriginRef.current = { x: o.x, y: o.y, z: o.z };
    if (prev.x === o.x && prev.y === o.y && prev.z === o.z) return;
    // scene = (E - ox, Z - oz, oy - N)  =>  moving from prev to o adds (prev.x - o.x, prev.z - o.z, o.y - prev.y)
    const dx = prev.x - o.x, dy = prev.z - o.z, dz = o.y - prev.y;
    Object.values(implicitMeshesRef.current || {}).forEach((m) => {
      const pos = m?.geometry?.attributes?.position;
      if (!pos) return;
      const a = pos.array;
      for (let i = 0; i < a.length; i += 3) { a[i] += dx; a[i + 1] += dy; a[i + 2] += dz; }
      pos.needsUpdate = true;
      m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere();
    });
  };
  // TASKS.csv #606 — a surface sample with no elevation (z null: blank, or an all-zero Z column at import) sits
  // on the terrain where the DEM covers it; outside the DEM (or with no DEM) it is left out and the panel says
  // how many. Same array back when every sample has its own z, so loading a DEM does not rebuild the scene then.
  const placedSurfaceSamples = useMemo(() => {
    if (surfaceSamples.every((r) => Number.isFinite(r.z))) return surfaceSamples;
    const b = terrain?.bbox;
    return surfaceSamples.map((r) => {
      if (Number.isFinite(r.z)) return r;
      const z = b ? terrainGroundAt(terrain, r.x, r.y) : NaN; // TASKS.csv #927 — over the terrain's fill a sample stays unplaced
      return Number.isFinite(z) ? { ...r, z, zDraped: true } : null;
    }).filter(Boolean);
  }, [surfaceSamples, terrain]);
  const surfaceSamplesUnplaced = surfaceSamples.length - placedSurfaceSamples.length;
  // TASKS.csv #843 — colour by an element's anomaly classes or a pathfinder index (null = by medium, as before);
  // its settings live in layerStyles.surface_anomaly, so they are saved with the view and in themes
  const [surfaceAnomaly, setSurfaceAnomaly] = useState(null);
  useEffect(() => {
    const cfg = layerStyles.surface_anomaly;
    if (!cfg || cfg.mode === "medium" || !placedSurfaceSamples.length) { setSurfaceAnomaly(null); return undefined; }
    let alive = true;
    import("../lib/anomalyMap.js").then((m) => {
      if (!alive) return;
      const a = m.anomalyClasses(placedSurfaceSamples, cfg, { units: surfaceElementUnits, mapLayers, thresholds: geochemThresholds });
      setSurfaceAnomaly(a ? { ...a, legendGroup: m.anomalyLegendGroup(a) } : null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [layerStyles.surface_anomaly, placedSurfaceSamples, surfaceElementUnits, mapLayers, geochemThresholds]);
  const mapAnchorKey = useMemo(() => JSON.stringify([(mapLayers || []).map((l) => l.bbox), (surfaceStructures || []).map((st) => st.rows?.length || 0)]), [mapLayers, surfaceStructures]);
  // TASKS.csv #435 — same idea for terrain, raster drapes, boundaries and OMF objects: the geometry rebuild
  // reads them ONLY for its no-collar camera anchor, so it depends on this extent signature instead of the
  // objects themselves. updateTerrain({visible}) or a raster opacity change used to rebuild every interval.
  const terrainElevRange = useMemo(() => (terrain?.elevations?.length ? minMax(terrain.elevations) : null), [terrain?.elevations]);
  const anchorSourcesKey = useMemo(() => JSON.stringify([
    terrain ? [terrain.bbox, terrainElevRange] : null,
    rasters?.[0]?.bbox || null,
    (boundaries || []).map((b) => [b.id, (b.polylines || []).length, (b.polylines || []).reduce((t, pl) => t + (pl?.length || 0), 0), b.polylines?.[0]?.[0] || null]),
    (omfObjects || []).map((o) => [o.id, (o.vertices || []).length, o.origin || null]),
  ]), [terrain?.bbox, terrainElevRange, rasters, boundaries, omfObjects]);
  const mapLayerGroupRef = useRef(null);
  const sectionImageGroupRef = useRef(null), sectionImageMeshesRef = useRef({}); // TASKS.csv #630
  const mapLayerMeshesRef = useRef({}); // id -> THREE.Mesh (one textured drape per layer)
  const surfStructGroupRef = useRef(null);
  const surfStructObjsRef = useRef({}); // id -> THREE.Group (InstancedMesh discs + dip ticks)
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
  // View or 3D Modelling too, not just the Targeting tab where it's edited.
  const plannedGroupRef = useRef(null);
  const sectionStringsGroupRef = useRef(null); // TASKS.csv #519
  const sectionLinesGroupRef = useRef(null); // TASKS.csv #1011
  // TASKS.csv #575 — keyboard path to the view's right-click menu (Zoom to fit all, Zoom to selected area, Reset
  // orientation, background colour): the ContextMenu key or Shift+F10 on the focused 3D view opens it at the view's
  // centre with the first item focused; arrows move, Escape closes and gives focus back to the view.
  const viewFocusRef = useRef(null);
  const contextMenuRef = useRef(null);
  const contextMenuByKeyRef = useRef(false);
  const onViewKeyDown = (e) => {
    if (e.target !== e.currentTarget) return; // a control inside the view (Fit, Top…) keeps its own keys
    if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
    e.preventDefault(); // no second, browser-dispatched contextmenu event
    const r = e.currentTarget.getBoundingClientRect();
    contextMenuByKeyRef.current = true;
    setContextMenu({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), hit: null });
  };
  const menuItemsOf = (el) => [...(el?.querySelectorAll('[tabindex="0"], input, button') || [])];
  const onContextMenuKeyDown = (e) => {
    if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); setContextMenu(null); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = menuItemsOf(contextMenuRef.current);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
  };
  useEffect(() => {
    if (!contextMenuByKeyRef.current) return;
    if (contextMenu) { menuItemsOf(contextMenuRef.current)[0]?.focus(); return; }
    // closed (an item chosen, Escape, or a click outside): focus back on the view, not lost to <body>
    contextMenuByKeyRef.current = false;
    viewFocusRef.current?.focus();
  }, [contextMenu]);
  // TASKS.csv #730 — the same keys for the layer and sidebar-row menus (lib/useMenuKeys.js)
  const layerMenuKeys = useMenuKeys(layerContextMenu, () => setLayerContextMenu(null));
  const rowMenuKeys = useMenuKeys(rowMenu, () => setRowMenu(null));
  const [showSectionStrings, setShowSectionStrings] = useState(true); // TASKS.csv #519
  const [showSectionLines, setShowSectionLines] = useState(true); // TASKS.csv #1011
  const plannedMeshesRef = useRef({}); // id -> THREE.Group (line + toe marker)
  const measureGroupRef = useRef(null); // TASKS.csv #121 — line/polygon + vertex markers for the active measurement
  const [implicitSurfaces, setImplicitSurfaces] = useState([]); // [{id, name, visible, vertexCount, faceCount}]
  const [implicitTarget, setImplicitTarget] = useState("");
  // TASKS.csv #52 (a) — sensitivity-spread inputs. The two sigmas deliberately start EMPTY and the run
  // button stays disabled until both are typed: #52's gate is that the input uncertainty must come from
  // the geologist, never from a default GeoStrix picked. Session-only UI state, like includeSectionContacts.
  const [sensOpen, setSensOpen] = useState(false);
  const [sensN, setSensN] = useState(8);
  const [sensSigmaPos, setSensSigmaPos] = useState("");
  const [sensSigmaDeg, setSensSigmaDeg] = useState("");
  const [sensBudget, setSensBudget] = useState(300);
  // TASKS.csv #98 — feed drawn cross-section contacts into 3D surface generation. Off by default:
  // drawn contacts are an interpretation, not raw data, so they shouldn't silently join every run —
  // this is the "source picker" the task note called for, kept as one explicit toggle rather than a
  // full per-source review UI (that's still a real follow-up if this turns out to need finer control).
  const [includeSectionContacts, setIncludeSectionContacts] = useState(true); // #810: on by default (drawn contacts are deliberate picks)
  // TASKS.csv #356 — the last implicit run's lithology block (session only), offered as a block model and as
  // a "modelled unit" interval layer. { block, units: [{name,label,color}], origin, when, title }
  const [lastLithBlock, setLastLithBlock] = useState(null);
  const [surfaceSolidsOpen, setSurfaceSolidsOpen] = useState(false); // TASKS.csv #802
  // TASKS.csv #318 — a mapped surface contact (plus nearby outcrop measurements) to feed the next
  // single-unit implicit run: { layerId, contactKey, units, classes, radius, tolerance, ... } | null.
  // Session-only, like includeSectionContacts: it is a per-run modelling choice, not project data.
  const [mapConstraint, setMapConstraint] = useState(null);
  const [structuralTarget, setStructuralTarget] = useState("");
  const [stereonetOpen, setStereonetOpen] = useState(false); // TASKS.csv #141
  const [tadpoleOpen, setTadpoleOpen] = useState(false); // TASKS.csv #277 — downhole structural plot
  const [levelPlanOpen, setLevelPlanOpen] = useState(false); // TASKS.csv #525 — horizontal section at an RL
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
  const [stackFaults, setStackFaults] = useState([]); // TASKS.csv #360 — "<structure type>|<structure_id>" keys of faults that offset the stack
  // TASKS.csv #271 — GemPy StackRelationType. Defaults to ONLAP (conformable) for two reasons: it's the
  // right model for the volcanic-hosted stratigraphy this app targets, and it is also exactly the
  // geometry every stack run produced before #271 (a single shared-scalar-field group — see the
  // sidecar's own comment), so this default changes nothing about existing results while making the
  // erosional case genuinely available for the first time.
  const [stackRelation, setStackRelation] = useState("onlap");
  const [stackAdd, setStackAdd] = useState("");
  const [expandedLithoGroupId, setExpandedLithoGroupId] = useState(null); // TASKS.csv #176 — which group's code checklist is open
  // TASKS.csv #155 — this used to be its own toggleable state (an internal "Home | Modelling" pill
  // switcher). Now that View and Modelling are separate top-level modules, which content shows is
  // dictated entirely by the `mode` prop App.jsx passes in — kept as a local alias so the render code
  // below (`sidebarTab === "home"` / `=== "modelling"`) didn't need a mechanical find/replace.
  const sidebarTab = mode === "modelling" ? "modelling" : mode === "targeting" ? "targeting" : mode === "surface" ? "surface" : "home"; // #750 — no Predictive tab; surface: #820
  // TASKS.csv #458 — the tool shown in the sidebar ("task pane") — picked from the ribbon; null = only the
  // tab's data. Targeting opens on its planned-holes pane (its main job). Reset when the tab changes.
  const [toolPane, setToolPane] = useState(mode === "targeting" ? "plan" : null);
  // TASKS.csv #820 — a pane to open in the NEXT tab (e.g. Surface Geology's "Model it" -> 3D Modelling's Model from map)
  const pendingPaneRef = useRef(null);
  useEffect(() => { setToolPane(pendingPaneRef.current || (mode === "targeting" ? "plan" : null)); pendingPaneRef.current = null; }, [mode]);
  const paneProps = (id) => ({ active: toolPane === id, expanded: toolPane === id, onClick: () => setToolPane((p) => (p === id ? null : id)) }); // expanded: #595
  const paneHeader = (title, icon, tone) => <TaskPaneHeader title={title} icon={icon} tone={tone} onClose={() => setToolPane(null)} />;
  // TASKS.csv #572 — a modelling pane with nothing to model says what to load, instead of an empty "Choose…" select
  const emptyPaneHint = (text) => <div role="note" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text-strong)", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", marginBottom: 8, lineHeight: 1.4 }}>{text}</div>;
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
  // TASKS.csv #625 — the grade shell's block budget (a per-computer preference: what this machine can afford), and the
  // hint left by an over-budget run ({ needed, budget, cell, fit, fitMax })
  const [numericMaxBlocks, setNumericMaxBlocksState] = useState(() => { try { return Number(localStorage.getItem("geostrix.gradeShellBlockBudget")) || MAX_BLOCKS; } catch { return MAX_BLOCKS; } });
  const setNumericMaxBlocks = (v) => { setNumericMaxBlocksState(v); try { localStorage.setItem("geostrix.gradeShellBlockBudget", String(v)); } catch { /* private window */ } };
  const [numericBudgetHint, setNumericBudgetHint] = useState(null);
  const [numericSearchRadius, setNumericSearchRadius] = useState(50);
  const [numericMethod, setNumericMethod] = useState("idw2");
  // TASKS.csv #1015 — ordinary kriging's variogram for the grade shell: blank = fitted at run time (as the block model's modal)
  const [numericVariogram, setNumericVariogram] = useState({ model: "spherical", nugget: "", sill: "", range: "" });
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
  // TASKS.csv #358 — cut modelled surfaces off at the ground. On by default; only acts when terrain exists.
  const [clipToTopo, setClipToTopo] = useState(true);
  const terrainForClipRef = useRef(null);
  terrainForClipRef.current = terrain || null;
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
  const [surfaceDetail, setSurfaceDetail] = useState(4); // TASKS.csv #766 — GemPy's octree level for the surface mesh
  // TASKS.csv #361 — which structure-pick codes count as CONTACT orientations for the litho/alteration
  // tools. Only exact 'CON' used to be preferred, and with none present EVERY pick type (faults, veins,
  // joints, foliation) was used silently; real codes like 'Contact' or 'BED' never matched. null = the
  // automatic choice (contact/bedding-like codes only); an array = the user's explicit selection.
  const [orientTypesSel, setOrientTypesSel] = useState(null);
  const structureTypes = useMemo(() => [...new Set((layers.structure || []).filter((s) => Number.isFinite(s.dip) && Number.isFinite(s.azimuth)).map((s) => String(s.value)).filter(Boolean))].sort(), [layers.structure]);
  const orientTypes = useMemo(() => {
    if (orientTypesSel) return orientTypesSel.filter((t) => structureTypes.includes(t));
    return structureTypes.filter((t) => /^(con|cont|contact|contacts|bed|bedding|bdg|s0|so|lith.?contact|lc)$/i.test(t.trim()));
  }, [orientTypesSel, structureTypes]);
  // TASKS.csv #274 — GemPy's potential-field range, as a multiplier of GemPy's own default (see the
  // sidecar's range_multiplier field). 0 = Auto, i.e. don't send the parameter at all and let GemPy do
  // exactly what it always did; the effective value comes back in the response either way and is
  // reported in the run notice + stamped into every generated surface's provenance.
  const [rangeMultiplier, setRangeMultiplier] = useState(0);
  const [thinPicks, setThinPicks] = useState(true); // TASKS.csv #765 — average structure picks per hole before GemPy
  const [thinWindowM, setThinWindowM] = useState(50); // #765 — depth window along the hole (m)
  const [smoothClusters, setSmoothClusters] = useState(false); // TASKS.csv #761 — off by default: it trades detail for stability
  // TASKS.csv #86 — same shared-across-all-four-tools pattern as domain/searchEllipsoid above. Distinct
  // state from searchEllipsoid (not literally shared) since the two are conceptually independent knobs
  // (which points are trusted vs. how the surface itself should stretch) even though they usually share
  // the same real-world structural trend — "Copy from search ellipsoid" in the UI covers that overlap
  // without forcing the two to always move together.
  // TASKS.csv #650 — the old single, unsaved anisotropy is replaced by named trends saved with the project; each
  // model type asks for its own (structuralTrends.use[tool]) and gets the warp the existing code already used.
  const trendFor = useCallback((tool) => {
    const id = structuralTrends?.use?.[tool];
    const t = id && (structuralTrends.trends || []).find((x) => x.id === id);
    return t ? cleanTrend(t) : null;
  }, [structuralTrends]);
  const [trendPreviewId, setTrendPreviewId] = useState(null); // #650 — the trend shown in 3D ("View")
  const explicitTrend = useMemo(() => trendFor("explicit"), [trendFor]); // TASKS.csv #881 — stable between renders
  const trendWarp = useCallback((tool) => {
    const t = trendFor(tool);
    if (!t) return { enabled: false };
    return { enabled: true, trend: t, basis: trendBasis(t), scales: trendScales(t),
      params: { trend: t.name, dip: t.dip, dipAzimuth: t.dipAzimuth, pitch: t.pitch, ratios: t.ratios } };
  }, [trendFor]);

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
  // whole component. Now that a single persistent instance survives View<->Modelling<->Targeting
  // switches, that disarm has to be explicit instead of an accident of unmounting — otherwise, e.g.,
  // arming the measure tool in 3D View and then switching to Modelling would leave it armed there too.
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

  // TASKS.csv #617 — Escape. Nothing in the 3D view listened for it: a right-click menu, a layer menu or a popover
  // stayed open, and an armed tool (Draw section, Measure, rectangle zoom, pick a hole, modelling-code pick) could
  // only be left by clicking its button again. Escape now closes the open menu first, else disarms the tool.
  // Left alone while typing in a field or when a dialog is open (dialogs handle their own Escape).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || !visibleRef.current) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector("[role=dialog], [aria-modal=true]")) return;
      if (contextMenu || layerContextMenu || openPopover) { setContextMenu(null); setLayerContextMenu(null); setOpenPopover(null); return; }
      if (rectZoomMode) { setRectZoomMode(false); setRectVisual(null); rectDragRef.current = null; return; }
      if (sectionMode) { setSectionMode(false); sectionPts.current = []; setSectionPreview(null); return; }
      if (pickHoleMode) { setPickHoleMode(false); return; }
      if (mcConnectFrom) { setMcConnectFrom(null); return; }
      if (measureMode) { setMeasureMode(null); setMeasurePts([]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contextMenu, layerContextMenu, openPopover, rectZoomMode, sectionMode, pickHoleMode, mcConnectFrom, measureMode]);

  const fileInputs = useRef({});
  const setInputRef = (key) => (el) => { fileInputs.current[key] = el; };
  // TASKS.csv #565 — File > Import CSV (Ctrl+I) opens the collar import here; View > Cross-section (Ctrl+Shift+C)
  // starts drawing a section (it used to only switch to this tab)
  useModuleAction(["open-geoml"], () => setToolPane("geoml")); // TASKS.csv #750 — links / menus that named the Predictive tab
  useModuleAction(["import-collars", "draw-section"], (a) => {
    if (a === "import-collars") { fileInputs.current.collar?.click(); return; }
    setRectZoomMode(false); setMeasureMode(null); setMeasurePts([]); setSectionMode(true); sectionPts.current = []; setSectionPreview(null);
  });

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
  // TASKS.csv #431 — the label callback is keyed on the LABEL overrides only. legendOverride also holds
  // colours, so depending on it directly made every legend COLOUR edit (and anything else that replaced
  // legendOverride) re-run the full geometry rebuild, whose tooltips bake labels in. A label edit still
  // rebuilds (tooltips need the new text); a colour edit is repainted by applyLegendOverrideColors.
  const labelOverrideSig = useMemo(() => JSON.stringify(Object.entries(legendOverride || {}).map(([k, m]) => [k, Object.entries(m || {}).filter(([, o]) => o?.label).map(([v, o]) => [v, o.label])]).filter(([, e]) => e.length)), [legendOverride]);
  const labelOverrides = useMemo(() => Object.fromEntries(JSON.parse(labelOverrideSig).map(([k, e]) => [k, Object.fromEntries(e)])), [labelOverrideSig]);
  const effectiveLabel = useCallback((layerKey, value) => {
    const lbl = labelOverrides[layerKey]?.[value];
    if (lbl) return lbl;
    const meta = LAYER_META[layerKey];
    return meta.nameFn ? (meta.nameFn(value) || value) : value;
  }, [labelOverrides]);
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
  // TASKS.csv #431 — depends on numericRange ONLY. It used to delegate to isRowVisible, whose deps include
  // categoryFilter, so every category chip toggle changed this callback and re-ran the full rebuild —
  // undoing #227's "cheap toggle" (up to 2.6 s per click at 24k intervals, #209).
  const isRowVisibleForBuild = useCallback((groupKey, row) => {
    const meta = LAYER_META[groupKey];
    if (meta?.numeric) { const range = numericRange[groupKey]; if (range && (row.value < range.min || row.value > range.max)) return false; }
    return true;
  }, [numericRange]);
  // TASKS.csv #227 (continuation) — the post-hoc half of the pair above: walks each category-
  // filterable layer's already-built children and hides the ones whose tagged catValue is in that
  // layer's categoryFilter set, using the exact same `hidden.has(String(value))` semantics
  // isRowVisible already used at build time — just applied after the fact instead of before, so it
  // never needs to touch geometry. Called directly (not a hook) from two places: inline at the end of
  // the big rebuild effect (reapplies current filters to freshly-built children after a real rebuild),
  // and from the small effect right after it below (the common case — only categoryFilter changed).
  // TASKS.csv #312 — the per-interval objects stay the source of truth for visibility and colour
  // (see buildLayerBatches' header); this pushes whatever they currently say into the InstancedMesh
  // batches that actually draw them. O(objects) but only ever on a real change (a category chip, a
  // legend colour edit, a hole show/hide) — never per frame, and never a geometry rebuild.
  const syncLayerBatches = useCallback((keys) => {
    const groups = layerGroupsRef.current;
    const walk = (g) => { if (!g) return; for (const c of g.children) if (c.isInstancedMesh && c.userData.batchMembers) syncBatchedInstances(c); };
    if (keys) keys.forEach((k) => walk(groups[k]));
    else for (const key in groups) walk(groups[key]);
  }, []);
  const applyCategoryVisibility = useCallback(() => {
    const groups = layerGroupsRef.current;
    CATEGORY_LAYER_KEYS.forEach((key) => {
      const g = groups[key];
      if (!g) return;
      const hidden = categoryFilter[key];
      g.children.forEach((child) => { child.visible = !(hidden && hidden.has(String(child.userData?.catValue))); });
    });
    syncLayerBatches(CATEGORY_LAYER_KEYS); // TASKS.csv #312
  }, [categoryFilter, syncLayerBatches]);
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
      const single = layerStyles[key]?.color; // TASKS.csv #635 — a one-colour layer style wins over category colours
      g.children.forEach((child) => {
        if (child.userData?.catValue === undefined || !child.material?.color) return;
        child.material.color.set(single || effectiveColor(key, child.userData.catValue));
      });
    });
    syncLayerBatches(CATEGORY_LAYER_KEYS); // TASKS.csv #312 — repaint the batches' instanceColor from the objects just repainted
  }, [effectiveColor, syncLayerBatches, layerStyles]);

  // ---------- project save/load: mirror custom layers (plain data) into the store, and
  // reconstruct three.js groups for any custom layers a loaded project brought in ----------
  useEffect(() => {
    // #478 — skip an empty-over-empty write: at startup it replaced [] with a new [] and the undo watcher
    // read that as an edit, marking an untouched project unsaved.
    setStoreCustomLayers((prev) => (!customLayers.length && !(prev || []).length ? prev : customLayers.map(({ id, name, rows }) => ({ id, name, rows }))));
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
    // unmount/remount; now that ViewerModule stays mounted persistently across View/Modelling/
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
      setBgColor(DEFAULT_BG_COLOR);
      setHoleLabelMode("none");
      setFigureOverlay({ ...DEFAULT_FIGURE_OVERLAY }); // TASKS.csv #311
      setLayerStyles({}); // #635
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
    setBgColor(s.bgColor || DEFAULT_BG_COLOR);
    setHoleLabelMode(s.holeLabelMode || "none");
    // TASKS.csv #311 — spread over the defaults (not replaced by them) so a project saved before this
    // row existed opens with the overlay on, same as a new one, rather than silently missing it.
    setFigureOverlay({ ...DEFAULT_FIGURE_OVERLAY, ...(s.figureOverlay || {}) });
    setLayerStyles(s.layerStyles || {}); // #635
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
      figureOverlay, // TASKS.csv #311
      layerStyles, // TASKS.csv #635
    });
  }, [layerVisible, categoryFilter, numericRange, legendOverride, numericSymbology, visibleHoles, customVisible, assayVisible, assayDisplayElements, assayStyle, gridConfig, bgColor, holeLabelMode, figureOverlay, layerStyles, setViewerUiState]);

  // Applies bgColor to the live three.js scene whenever it changes — separate from the push-to-store
  // effect above since this one needs sceneRef.current (set up in the big scene-setup effect further
  // down), not just to persist the value.
  const collarMaterialRef = useRef(null); // TASKS.csv #378 — one material shared by every collar marker
  const bgColorRef = useRef(bgColor);
  bgColorRef.current = bgColor;
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.background = new THREE.Color(bgColor);
    if (collarMaterialRef.current) collarMaterialRef.current.color.setHex(collarColorFor(bgColor));
    lastActivityRef.current = Date.now(); // #441 wake the render loop
  }, [bgColor]);

  // TASKS.csv #311 — world-origin axis lines on/off (see axisLinesRef). A plain .visible flip on
  // three already-built 2-vertex Lines: no geometry rebuild, nothing per frame.
  useEffect(() => {
    axisLinesRef.current.forEach((l) => { l.visible = !!gridConfig.axes; });
    lastActivityRef.current = Date.now(); // wake the idle-throttled render loop so the change is drawn immediately
  }, [gridConfig.axes]);

  // TASKS.csv #311 — the in-viewport legend's content.
  //
  // "Only what is actually visible", matched to what LayoutModule's syncLegendLithologies already
  // means by it, so the two legends cannot disagree: a layer must be switched ON (layerVisible), the
  // category must not be filtered out (categoryFilter), and at least one row of it must belong to a
  // hole that is not hidden (visibleHoles). Labels and colours go through effectiveLabel/
  // effectiveColor, so a user's legend override (renamed unit, recoloured unit) shows here exactly as
  // it is drawn in the scene.
  //
  // TWO DELIBERATE LIMITS, both stated in the UI rather than hidden:
  //  - It does NOT frustum-cull. "Visible" means switched on, not "happens to be inside the current
  //    camera frustum" — deciding that per category would mean per-frame work, which is exactly the
  //    trade #312 says not to make. Layout's legend sync has the same semantics.
  //  - Numeric layers (geotech/RQD, recovery, SG, mag. susc., assays) are excluded, for the same
  //    reason buildSectionPayload's legendItems excludes them: their colour encodes a continuous
  //    value, so a category list would be either one meaningless swatch or one row per sample. A
  //    continuous colour ramp key is a bigger piece of work and belongs on its own row.
  //
  // Cost: O(rows) over the visible categorical layers, and only when one of those inputs actually
  // changes — never on a camera move and never per frame.
  // TASKS.csv #948 — the surface samples' legend group as drawn, shared with Layout's legend through the store
  const sampleLegendGroup = useMemo(() => surfaceSampleLegendGroup({ samples: placedSurfaceSamples, visible: !!layerVisible.surface_samples, style: layerStyles.surface_samples?.color ? layerStyles.surface_samples : null, anomalyGroup: surfaceAnomaly?.legendGroup || null }), [placedSurfaceSamples, layerVisible.surface_samples, layerStyles.surface_samples, surfaceAnomaly]);
  useEffect(() => { setSurfaceSampleLegend(sampleLegendGroup); }, [sampleLegendGroup, setSurfaceSampleLegend]);
  const overlayLegendGroups = useMemo(() => {
    if (!figureOverlay.enabled || !figureOverlay.legend) return [];
    // TASKS.csv #725 — the same builders the Layout legend uses (lib/legendGroups.js), so the two keys cannot disagree
    const singleColor = Object.fromEntries(CATEGORY_LAYER_KEYS.filter((k) => layerStyles[k]?.color).map((k) => [k, layerStyles[k].color])); // #635
    const groups = [
      ...categoryLegendGroups({ keys: CATEGORY_LAYER_KEYS, layers, layerVisible, hidden: categoryFilter, visibleHoles, singleColor, labelFor: effectiveLabel, colorFor: effectiveColor }),
      ...assayLegendGroups({ assays, assayElements, assayVisible, assayDisplayElements, assayStyle }),
      ...voxelLegendGroups(voxelModels),
    ];
    // TASKS.csv #843 / #948 — the surface samples as the view colours them (the anomaly map's rule and classes, one colour,
    // or by medium), then the Surface Geology map layers and the boundaries
    if (sampleLegendGroup) groups.push({ ...sampleLegendGroup, items: sampleLegendGroup.items.map(([l, c, o]) => [tr(l), c, o]) });
    groups.push(...mapLayerLegendGroups(mapLayers), ...boundaryLegendGroups(boundaries));
    const pushScale = (key, label, model, lo, hi) => groups.push(scaleLegendGroup(key, label, model, lo, hi));
    const gpts = layers?.geophys_pts || [];
    if (layerVisible.geophys_pts && gpts.length) {
      const vals = gpts.map((r) => r.value).filter((v) => typeof v === "number" && Number.isFinite(v));
      if (vals.length) {
        // TASKS.csv #451 — one ramp per survey when several are loaded (each is coloured on its own range)
        const colorer = makeSurveyColorer(gpts.filter((r) => Number.isFinite(r.value)), { stops: geophysPtsStops, colorMode: geophysPtsColorMode, min: geophysPtsMin, max: geophysPtsMax });
        for (const [key, model] of colorer.models) {
          const units = geophysSurveys?.[key]?.units;
          pushScale(`geophys_pts_${key}`, colorer.perSurvey ? `${key}${units ? ` (${units})` : ""}` : `${LAYER_META.geophys_pts?.label || "Geophysics points"}${units ? ` (${units})` : ""}`, model, model.min, model.max);
        }
      }
    }
    return groups;
  }, [sampleLegendGroup, mapLayers, boundaries, layerStyles, figureOverlay.enabled, figureOverlay.legend, layerVisible, layers, categoryFilter, visibleHoles, effectiveLabel, effectiveColor, assayVisible, assayDisplayElements, assayStyle, assays, assayElements, voxelModels, geophysSurveys, geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax]);

  // TASKS.csv #453 — build the clipping planes from the slice settings over the drilled extent (hole
  // traces; the terrain bbox when there is no drilling). Vertical: across the azimuth line, position along
  // its perpendicular; horizontal: an elevation. Thickness 0 = one half-space, else a slab (two planes).
  const sliceExtent = useMemo(() => {
    const ts = tracesRef.current || [];
    const pts = ts.flatMap((t) => t.pts || []);
    if (pts.length) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; }
      return { x0, x1, y0, y1, z0, z1 };
    }
    return null;
  }, [slice3d.on, collars, survey, rebuildSeq]);
  const sliceReadout = useMemo(() => {
    if (!slice3d.on || !sliceExtent) return slice3d.on ? "Load drillholes to set the slice range." : "";
    const o = originRef.current;
    if (slice3d.mode === "horizontal") {
      const elev = sliceExtent.y0 + slice3d.pos * (sliceExtent.y1 - sliceExtent.y0) + o.z;
      return slice3d.thickness > 0 ? `Showing ${Math.round(elev - slice3d.thickness / 2)}–${Math.round(elev + slice3d.thickness / 2)} m elevation` : `Showing everything below ${Math.round(elev)} m elevation`;
    }
    return slice3d.thickness > 0 ? `Vertical slab ${slice3d.thickness} m thick, striking ${slice3d.azimuth}°` : `Everything on one side of a vertical cut striking ${slice3d.azimuth}°`;
  }, [slice3d, sliceExtent]);
  useEffect(() => {
    lastActivityRef.current = Date.now(); // #441 — redraw now
    if (!slice3d.on || !sliceExtent) { slicePlanesRef.current = []; return; }
    const e = sliceExtent, t = slice3d.thickness;
    let n, c; // plane through point c with normal n (scene coords)
    if (slice3d.mode === "horizontal") {
      n = new THREE.Vector3(0, 1, 0);
      c = new THREE.Vector3(0, e.y0 + slice3d.pos * (e.y1 - e.y0), 0);
    } else {
      // Strike azimuth a (clockwise from north). World strike dir (sin a, cos a) -> scene (sin a, 0, -cos a);
      // the slab normal is horizontal and perpendicular to it.
      const a = (slice3d.azimuth * Math.PI) / 180;
      n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const corners = [[e.x0, e.z0], [e.x1, e.z0], [e.x0, e.z1], [e.x1, e.z1]].map(([x, z]) => x * n.x + z * n.z);
      const lo = Math.min(...corners), hi = Math.max(...corners), d = lo + slice3d.pos * (hi - lo);
      c = n.clone().multiplyScalar(d);
    }
    const plane = (normal, point) => new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
    if (t > 0) {
      // keep  |n.(p - c)| <= t/2 : two planes facing inward (three clips the NEGATIVE side of each)
      slicePlanesRef.current = [plane(n.clone().negate(), c.clone().addScaledVector(n, t / 2)), plane(n.clone(), c.clone().addScaledVector(n, -t / 2))];
    } else {
      slicePlanesRef.current = [plane(n.clone().negate(), c)]; // keep everything on the negative-normal side (below / behind)
    }
  }, [slice3d, sliceExtent]);

  // TASKS.csv #311 — title provenance, kept as simple as the row asks for: the project name by
  // default, overridable with a free-text field in the Figure popover (a figure is often "Section
  // 4200N — Main zone", which the project name cannot supply). Blank override = fall back to the
  // project name, so clearing the box restores the default instead of blanking the title.
  // "Untitled project" is store.jsx's own placeholder for a project that has never been named (the
  // bundled sample loader leaves it at that), and printing it onto a figure bound for an investor
  // deck would be worse than printing nothing — so the placeholder falls through to no title at all,
  // and the Figure popover's title box shows the project name as ITS placeholder to say where the
  // title normally comes from.
  const overlayTitle = (figureOverlay.titleText || "").trim() || (project?.name && project.name !== "Untitled project" ? project.name : "");

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
    // TASKS.csv #312 — a layer group now also holds the InstancedMesh batches that DRAW its
    // children (see buildLayerBatches). Those are never pick targets: raycasting an InstancedMesh
    // would test every instance (undoing #304's whole win) and would answer with an instanceId
    // instead of the interval object every consumer here expects. The real per-interval objects are
    // still in this list, unchanged — they simply no longer render.
    Object.values(layerGroupsRef.current).forEach((g) => {
      if (!g || g.visible === false) return;
      for (const c of g.children) if (!c.userData?.pickIgnore) list.push(c);
    });
    return list;
  }, []);
  // TASKS.csv #304 — cached object-level BVH over pickHoverTargets(). See src/lib/pickIndex.js for
  // the measurement that motivated it and for the correctness contract (it only narrows the CANDIDATE
  // list; three.js still computes every hit itself, so results are identical, not approximate).
  //
  // Cache invalidation is deliberately kept here, next to the code that knows how these groups are
  // maintained, rather than inside pickIndex.js. pickTargetsSignature() is O(number of GROUPS) — it
  // never walks the ~12,000 objects — and is recomputed on every single pick, so the index is
  // rebuilt the moment the target list changes shape. It relies on one property of this file that is
  // true throughout: pickable objects are REPLACED (groups cleared and rebuilt), never moved in
  // place. `.visible` flips (visibleHoles / applyCategoryVisibility) and material.color repaints
  // (applyLegendOverrideColors) are the only in-place mutations, and neither affects geometry or
  // matrixWorld, so neither can invalidate the index. Object3D.id is a globally monotonic counter,
  // so a rebuilt group can never reproduce the same (count, first id, last id) triple as the one it
  // replaced. IF YOU EVER ADD CODE THAT MOVES/RESCALES AN ALREADY-BUILT PICKABLE OBJECT (a vertical
  // exaggeration slider is the obvious candidate — none exists today), it must also force a rebuild,
  // or picking will silently go stale.
  //
  // REAL BUG CAUGHT HERE DURING #304's OWN VERIFICATION, worth keeping in mind before touching this:
  // the index is built from each object's matrixWorld, and three.js only recomputes matrixWorld
  // inside renderer.render(). A pointermove landing in the window between a geometry rebuild and the
  // next rendered frame (the render loop is idle-throttled to ~120 ms by #201's own comment below,
  // and stops entirely while the viewer tab is hidden) therefore used to build the whole tree from
  // freshly-created meshes whose matrixWorld was still identity — every box wrong, the tree silently
  // returning nothing but the always-included `rest` list, and NOTHING to invalidate it afterwards
  // because the object list itself had not changed. This reproduced 100% of the time by hovering
  // immediately after loading the sample project: 57 of 129 picks over known-hit screen positions
  // returned a drillhole trace Line instead of the interval mesh in front of it. Two defences now:
  // (1) updateMatrixWorld() immediately before every build, and (2) the sampled world-space
  // translations in the signature below, which would independently force a rebuild once the real
  // matrices land.
  const pickIndexRef = useRef({ sig: null, index: null });
  const pickTargetsSignature = useCallback(() => {
    let s = terrainMeshRef.current ? `t${terrainMeshRef.current.id}` : "t-";
    const tag = (label, children) => {
      const n = children ? children.length : 0;
      s += `|${label}${n}:${n ? children[0].id : 0}:${n ? children[n - 1].id : 0}`;
      // Sampled world translations (O(1) per group, never a walk of the ~12,000 objects): catches
      // "same objects, different matrixWorld", which the id triple above cannot see.
      // TASKS.csv #312 — the InstancedMesh batches are appended AFTER the real objects and sit at
      // the group's own origin, so sampling the literal last child would sample a constant and
      // waste half of this check. Skip back over them (there are only ever a handful per group) so
      // both samples land on real pick targets, exactly as they did before batching existed.
      let last = n - 1;
      while (last > 0 && children[last].userData?.pickIgnore) last--;
      if (n) { const a = children[0].matrixWorld.elements, b = children[last].matrixWorld.elements; s += `@${a[12]},${a[13]},${a[14]},${b[12]},${b[13]},${b[14]}`; }
    };
    tag("v", voxelGroupRef.current?.children);
    tag("o", omfGroupRef.current?.children);
    tag("r", rasterGroupRef.current?.children);
    tag("p", plannedGroupRef.current?.children);
    tag("i", implicitGroupRef.current?.children);
    // boundaryGroup nests one level deeper (a group per boundary), so each sub-group is tagged.
    const bg = boundaryGroupRef.current?.children || [];
    s += `|b${bg.length}`;
    for (let i = 0; i < bg.length; i++) tag(`b${i}_`, bg[i].children);
    const groups = layerGroupsRef.current;
    for (const key in groups) {
      const g = groups[key];
      if (!g || g.visible === false) { s += `|${key}-`; continue; } // mirrors pickHoverTargets' own filter
      tag(key, g.children);
    }
    return s;
  }, []);
  const pickCandidates = useCallback((raycaster) => {
    const cache = pickIndexRef.current;
    let sig = pickTargetsSignature();
    if (cache.sig !== sig || !cache.index) {
      // See the "REAL BUG CAUGHT HERE" note above: matrixWorld is only refreshed by
      // renderer.render(), so a rebuild triggered between a geometry rebuild and the next frame
      // would otherwise bake identity matrices into every box. Update first, then re-read the
      // signature so what gets cached describes the same state the tree was built from. Kept inside
      // the rebuild branch rather than run on every pointermove: it is a full scene-graph traversal,
      // and on the steady-state path (no rebuild) there is nothing for it to do.
      if (sceneRef.current) sceneRef.current.updateMatrixWorld();
      sig = pickTargetsSignature();
      cache.index = buildPickIndex(pickHoverTargets());
      cache.sig = sig;
    }
    return queryPickIndex(cache.index, raycaster);
  }, [pickHoverTargets, pickTargetsSignature]);
  // TASKS.csv #304 — the single "what is under this ray" call. Everything that picks goes through
  // here, so the hover handler can compute ONE sorted hit list and answer both of its questions from
  // it instead of raycasting the same objects twice per pointermove (which is what it used to do:
  // raycastWorldPoint over the full target list for the status-bar readout, then a second, separate
  // intersectObjects over the layer subset for the tooltip — measured at 1.74 ms each).
  const pickHits = useCallback((raycaster) => {
    // TASKS.csv #312 — batched layer objects were moved onto PICK_ONLY_LAYER so the camera stops
    // drawing them individually (their InstancedMesh batch draws them instead). three.js's
    // Raycaster tests object.layers against ITS OWN layers, so without this every batched interval
    // would silently become unpickable. Done here, once, rather than at each raycaster's
    // construction, so every current and future call site of this single pick path is covered.
    // Enabling an extra channel can only ever ADD candidates, never remove one.
    raycaster.layers.enable(PICK_ONLY_LAYER);
    const targets = pickCandidates(raycaster);
    return targets.length ? raycaster.intersectObjects(targets, false) : [];
  }, [pickCandidates]);
  // Converts an already-computed hit list to world coords, falling back to a flat plane at local y=0
  // (the origin's own elevation) when nothing real was hit. Split out of raycastWorldPoint so the
  // hover handler can reuse a hit list it already has.
  const worldPointFromHits = useCallback((raycaster, hits) => {
    const o = originRef.current;
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
  }, []);
  // Shared raycast-and-convert-to-world-coords helper used by both the live status-bar cursor (inside
  // the three.js init effect below) and onMeasureClick further down — one raycaster, nearest hit among
  // pickHoverTargets() above, falling back to a flat plane at local y=0 (the origin's own elevation).
  const raycastWorldPoint = useCallback((raycaster) => worldPointFromHits(raycaster, pickHits(raycaster)), [pickHits, worldPointFromHits]);

  // ---------- three.js init ----------
  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(DEFAULT_BG_COLOR); sceneRef.current = scene;
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
    // TASKS.csv #695 — neither is ever transformed; left auto-updating they force every descendant's world matrix
    // to be recomputed on every frame (see buildLayerBatches)
    scene.matrixAutoUpdate = false; root.matrixAutoUpdate = false;
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

    const mapLayerGroup = new THREE.Group(); mapLayerGroup.name = "mapLayers"; root.add(mapLayerGroup); // TASKS.csv #316
    mapLayerGroupRef.current = mapLayerGroup;
    mapLayerMeshesRef.current = {};
    const sectionImageGroup = new THREE.Group(); sectionImageGroup.name = "sectionImages"; root.add(sectionImageGroup); // TASKS.csv #630
    sectionImageGroupRef.current = sectionImageGroup;
    sectionImageMeshesRef.current = {};
    const surfStructGroup = new THREE.Group(); surfStructGroup.name = "surfaceStructures"; root.add(surfStructGroup); // TASKS.csv #317
    surfStructGroupRef.current = surfStructGroup;
    surfStructObjsRef.current = {};

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
    // TASKS.csv #519 — saved section strings as 3D lines
    const sectionStringsGroup = new THREE.Group(); sectionStringsGroup.name = "sectionStrings"; root.add(sectionStringsGroup);
    sectionStringsGroupRef.current = sectionStringsGroup;
    const sectionLinesGroup = new THREE.Group(); sectionLinesGroup.name = "sectionLines"; root.add(sectionLinesGroup); // #1011
    sectionLinesGroupRef.current = sectionLinesGroup;
    plannedMeshesRef.current = {};

    // TASKS.csv #121 — measurement tool's own group, same reasoning as plannedGroup/voxelGroup.
    const measureGroup = new THREE.Group(); measureGroup.name = "measure"; root.add(measureGroup);
    measureGroupRef.current = measureGroup;

    // See sceneReady's own comment above — lets effects declared earlier in the component (and thus
    // run before this one on initial mount) re-run now that sceneRef.current is actually populated.
    setSceneReady((v) => v + 1);

    // TASKS.csv #308 (2) — lighting was AmbientLight 0.9 + one DirectionalLight 0.6 fixed at world
    // (200, 400, 200). Two problems, both visible on the loaded sample project. (a) The darkest a
    // surface could get was 0.9/(0.9+0.6) = 60% of the brightest — a 1.67:1 shading range across a
    // whole cylinder, which is why interval tubes read as flat coloured strips and generated surfaces
    // as flat-shaded blobs. (b) The light was fixed in WORLD space while the camera orbits, so orbiting
    // to the far side put it behind the geometry and the scene collapsed to pure ambient — the same
    // model looked shaded from one azimuth and flat from the opposite one.
    // Rebalanced to 0.45/0.85 (total illumination essentially unchanged at 1.30 vs 1.50, so nothing
    // goes dark, but the shading range roughly triples to ~2.9:1) and turned into a HEADLIGHT: dl's
    // position is copied from the camera on every camera move inside updateCamera() below. Cost is one
    // Vector3 copy per camera move — not per frame, and not per rendered object — so this is free at
    // the scale that matters here; measured render cost is unchanged (see this row's notes).
    // Deliberately NOT adding shadow maps or an ambient-occlusion pass: those are the usual answers to
    // "make the 3D look better" and both are a real per-frame cost on this project's target hardware.
    // TASKS.csv #376 — x PI. three r160 uses physical light units by default (renderer._useLegacyLights is
    // false, so lights get scaleFactor 1) while Lambert divides by PI, so 0.45 + 0.85 (tuned above in
    // legacy terms) lit a surface at most (0.45+0.85)/PI = 0.41 of its colour in linear light: the #306/#319
    // grade classes rendered far darker than designed (pale L* ~39-62 against a target of 88.9, the high
    // class near-black) and unlit MeshBasic drapes/collars looked much brighter than the tubes beside them.
    // 0.35 + 0.65 (x PI) keeps #308's ~2.9:1 shading range and tops out at exactly 1.0 — a surface facing
    // the headlight shows its designed colour, nothing clips. Same uniforms, zero extra cost.
    scene.add(new THREE.AmbientLight(0xffffff, 0.35 * Math.PI));
    const dl = new THREE.DirectionalLight(0xffffff, 0.65 * Math.PI); dl.position.set(200, 400, 200); scene.add(dl);
    headlightRef.current = dl;
    // The grid itself is now built/rebuilt by a dedicated effect below (see gridGroupRef), driven by
    // gridConfig — replaces this single hardcoded GridHelper so visibility/size/divisions/color/3D
    // mode are all user-adjustable instead of fixed at scene-creation time.
    // TASKS.csv #311 — kept in a ref and toggled by gridConfig.axes (default off; see axisLinesRef's
    // own comment for why they exist at all and why they are hidden rather than removed). Three
    // THREE.Line objects with 2 vertices each — the .visible flip below costs nothing.
    const mkAxis = (dir, color) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(80)]), new THREE.LineBasicMaterial({ color }));
    const axisLines = [
      mkAxis(new THREE.Vector3(1, 0, 0), 0xe05a4a),
      mkAxis(new THREE.Vector3(0, 1, 0), 0x4ac96a),
      mkAxis(new THREE.Vector3(0, 0, -1), 0x4a9be0),
    ];
    axisLines.forEach((l) => { l.visible = false; scene.add(l); }); // real value applied by the gridConfig.axes effect below, which runs after mount
    axisLinesRef.current = axisLines;

    const updateCamera = () => {
      const cs = camState.current;
      camera.position.set(
        cs.target.x + cs.radius * Math.sin(cs.phi) * Math.sin(cs.theta),
        cs.target.y + cs.radius * Math.cos(cs.phi),
        cs.target.z + cs.radius * Math.sin(cs.phi) * Math.cos(cs.theta)
      );
      camera.lookAt(cs.target);
      // TASKS.csv #377 — near plane follows the orbit distance. With near fixed at 0.1 m and far 5,000 km a
      // 24-bit depth buffer resolves only ~2.9 m at the 2,200 m overview (~15 m at 5 km), 10-20x coarser
      // than the drape offset (0.15 m) and map-layer lifts (0.3 m+), so drapes and map layers z-fought the
      // terrain. 1% of the orbit radius gives ~100x the precision at overview; only geometry closer to the
      // camera than that is clipped, and zooming in brings near down with it. Not logarithmicDepthBuffer:
      // that disables early-z, a real per-frame cost on an integrated GPU.
      const wantNear = Math.max(0.1, cs.radius * 0.01);
      if (Math.abs(camera.near - wantNear) > wantNear * 0.05) { camera.near = wantNear; camera.updateProjectionMatrix(); }
      // TASKS.csv #308 (2) — headlight: keep the single DirectionalLight with the camera so the model
      // is lit consistently from every azimuth instead of collapsing to flat ambient on the far side.
      // Raised half an orbit-radius above the camera rather than sitting exactly on it, because a light
      // exactly on the view axis produces almost no gradient across a surface facing the viewer — the
      // offset is what actually gives the cylinders their form. dl.target is not in the scene graph, so
      // its matrixWorld is refreshed by hand (three.js only auto-updates objects it can reach).
      const dl = headlightRef.current;
      if (dl) {
        dl.position.copy(camera.position); dl.position.y += cs.radius * 0.5;
        dl.target.position.copy(cs.target); dl.target.updateMatrixWorld();
      }
      lastActivityRef.current = Date.now(); // every camera move (drag/wheel/fitView/fitBox/compass) counts as activity — see lastActivityRef comment above
      // TASKS.csv #311 — the in-viewport scale bar depends on cs.radius, so it has to be refreshed
      // when the camera actually moves. This is the ONLY hook it gets: it is deliberately NOT in the
      // rAF loop (see ViewportFigureOverlay's header), so an idle or purely-rendering frame does no
      // overlay work at all, and the callback itself skips the DOM write unless the bar changed.
      figureOverlaySignalRef.current?.();
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
      // TASKS.csv #313 — a shorter canvas means fewer pixels across a tube, so the opening view has to
      // be re-clamped or it silently lands looser than MIN_OPENING_TUBE_PX. This is not hypothetical:
      // the autosave-recovery banner appears AFTER the project loads and takes ~41 px off the canvas,
      // which is what made the shipped clamp land at ~73% of its target (measured 1.83 px against a
      // 2.5 px setting). Only applies while the camera is still exactly where the clamp put it.
      applyClampRef.current?.();
      figureOverlaySignalRef.current?.(true); // TASKS.csv #311 — metres-per-pixel depends on the canvas pixel height, so a resize changes the bar even when the camera didn't move. The `true` invalidates the overlay's cached height; this is its ONLY invalidation point, which is why it must stay in resize()
    };
    resize(); const ro = new ResizeObserver(resize); ro.observe(mount);

    // Real bug fix (TASKS.csv #63): hover/right-click hit-testing used to flatten EVERY layer group's
    // children regardless of the group's own .visible flag, so a toggled-off layer's meshes (still
    // present in the scene graph, just not drawn) could still be hit and show a tooltip/context menu
    // for data the user explicitly hid. Centralized here so both call sites below use the same fix.
    // TASKS.csv #304 — this used to build (and separately raycast) a flat list of every visible
    // layer group's children on every pointermove. Both call sites now take the SINGLE sorted hit
    // list pickHits() already produces over the superset of pickable objects, and pick the nearest
    // hit that belongs to a visible layer group out of it. That is exactly what a layer-only
    // raycast returned before: intersectObjects sorts by distance ascending, so the first element
    // of the sorted list that is a visible layer group's direct child IS the nearest layer object,
    // and pickIndex.js preserves original list order so intersectObjects' stable sort still breaks
    // exact-distance ties the same way. #63's fix (never hit-test a toggled-off layer's children)
    // is preserved here by the same `g.visible !== false` filter, just applied to the hit instead of
    // to the input list.
    const firstVisibleLayerHit = (hits) => {
      if (!hits.length) return null;
      const groups = layerGroupsRef.current;
      const visibleGroups = new Set();
      for (const key in groups) { const g = groups[key]; if (g && g.visible !== false) visibleGroups.add(g); }
      for (let i = 0; i < hits.length; i++) if (visibleGroups.has(hits[i].object.parent)) return hits[i];
      return null;
    };

    const onPointerDown = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (e.button === 2) return; // handled by contextmenu event
      if (e.button === 0 && viewDragHookRef.current?.(e, mx, my)) return; // TASKS.csv #813 — e.g. dragging an explicit-surface pick
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
      // TASKS.csv #304 — one raycast, two answers (see firstVisibleLayerHit above and pickHits'
      // own comment): the status-bar readout wants the nearest hit of any kind, the tooltip wants
      // the nearest hit belonging to a visible layer group. Previously these were two full
      // intersectObjects passes over overlapping object lists on every single pointermove.
      const hoverHits = pickHits(raycasterRef.current);
      const worldPt = worldPointFromHits(raycasterRef.current, hoverHits);
      if (worldPt) setCursor(worldPt);
      // hover tooltip on layer objects — real bug fixed here: intersectObjects() is given the raw
      // mesh children directly (not their parent THREE.Group), and Raycaster only skips an object
      // whose OWN .visible is false, not an ancestor's — so a toggled-off layer's group.visible=false
      // never actually stopped its children from being hit-tested, meshes just weren't drawn, and
      // hovering over (say) a hidden lithology interval that happened to sit at the same spot as a
      // visible one would show the wrong tooltip, or a tooltip for data the user just turned off.
      // Filtering to only visible groups' children here (mirrors what actually renders) fixes it.
      const layerHit = firstVisibleLayerHit(hoverHits);
      if (layerHit && layerHit.object.userData?.tip) setTooltip({ x: e.clientX, y: e.clientY, text: layerHit.object.userData.tip });
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
      const menuHit = firstVisibleLayerHit(pickHits(raycasterRef.current)); // TASKS.csv #304 — same single-raycast path as hover
      if (menuHit && menuHit.object.userData?.tip) {
        const tip = menuHit.object.userData.tip;
        setContextMenu({ x: e.clientX, y: e.clientY, hit: { tip, holeId: tip.split("\n")[0], point: menuHit.point.clone() } });
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
        sortVoxelInstancesBackToFront(mesh, cells, camera.position);
      });
      if (didWork) { lastVoxelSortAt = now; lastVoxelSortCamPos.copy(camera.position); }
    };

    const IDLE_AFTER_MS = 400;
    const IDLE_FRAME_INTERVAL_MS = 120; // ~8fps while idle vs. ~60fps (uncapped) while active
    // TASKS.csv #441 — after a longer quiet spell, drop to 1 fps. The ~8 fps idle cap ran forever (~40-60 ms
    // CPU/s plus GPU on the Harry sample, all of it drawing identical frames). What wakes it: every camera
    // move and resize (as before), every ViewerModule commit (the no-deps effect just before the JSX return
    // — nearly every scene change is a React effect), every pointer move over the canvas (drawing and
    // measuring previews), and three's default loading manager finishing a texture. Anything that changes
    // the scene outside all of those still reaches the screen within 1 s, so this stays a throttle and can
    // never leave a stale frame up for good.
    const DEEP_IDLE_AFTER_MS = 3000;
    const DEEP_IDLE_FRAME_INTERVAL_MS = 1000;
    const prevLoadHandler = THREE.DefaultLoadingManager.onLoad;
    THREE.DefaultLoadingManager.onLoad = (...args) => { lastActivityRef.current = Date.now(); prevLoadHandler?.(...args); };
    const wakeOnPointer = () => { lastActivityRef.current = Date.now(); };
    dom.addEventListener("pointermove", wakeOnPointer, { passive: true });
    let raf;
    const animate = () => {
      // TASKS.csv #225 — while hidden (another tab showing), skip the render entirely rather than
      // falling back to the idle-throttled ~8fps: there's no viewer on screen at all, so even that is
      // pure waste. Keep the rAF loop itself ticking (re-arm unconditionally) rather than cancelling
      // it, so there's no separate "restart the loop on reveal" code path to ever miss — see the
      // reveal effect below for why a resize is still needed when this bail lifts.
      if (!visibleRef.current) { raf = requestAnimationFrame(animate); return; }
      const now = Date.now();
      const quietFor = now - lastActivityRef.current;
      const interval = quietFor > DEEP_IDLE_AFTER_MS ? DEEP_IDLE_FRAME_INTERVAL_MS : quietFor > IDLE_AFTER_MS ? IDLE_FRAME_INTERVAL_MS : 0;
      if (now - lastFrameAtRef.current >= interval) {
        resortTransparentVoxels(now);
        { const hl = layerGroupsRef.current?.hole_labels; if (hl?.visible && hl.children.length) fitScreenLabels(hl, camera, mount.clientHeight); } // #379
        renderer.setViewport(0, 0, mount.clientWidth, mount.clientHeight);
        renderer.setScissorTest(false);
        renderer.clippingPlanes = slicePlanesRef.current; // #453 — main scene only
        renderer.render(scene, camera);
        renderer.clippingPlanes = [];
        compass.renderEachFrame(renderer, mount);
        axisGizmo.renderEachFrame(renderer, mount);
        lastFrameAtRef.current = now;
      }
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      dom.removeEventListener("pointermove", wakeOnPointer); // #441
      if (THREE.DefaultLoadingManager.onLoad !== prevLoadHandler) THREE.DefaultLoadingManager.onLoad = prevLoadHandler;
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
        // TASKS.csv #312 — shared prototype geometries are module-level singletons reused by the
        // next mount (and by every other layer right now); disposing one here would pull the buffers
        // out from under them. They are four small primitives, so leaving them is not a leak.
        if (!obj.geometry?.userData?.sharedProto) obj.geometry?.dispose?.();
        obj.dispose?.(); // InstancedMesh instance buffers
        const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        mats.forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
      });
      mount.removeChild(renderer.domElement); renderer.dispose();
    };
  }, [setCursor]);

  // TASKS.csv #313 — the legibility clamp, split out of autoFitInitial so the reveal path below can
  // re-apply it. Returns true when it actually changed the camera.
  //
  // WHICH HEIGHT. The pixel size a tube ends up with is set by the canvas height AT THE MOMENT THE
  // CLAMP RUNS, so the height it measures has to be the one the scene is actually drawn into. This
  // used to read mountRef.clientHeight with an 800 fallback, which is wrong twice over: while the tab
  // is display:none that is 0 and the fallback silently invents a height the canvas does not have
  // (the follow-up this row recorded — the clamp was landing at ~73% of MIN_OPENING_TUBE_PX), and even
  // when visible the mount can be a few tens of pixels shorter than the canvas it contains mid-layout
  // (measured live: mount 721 vs canvas 762 on the sample project). The renderer's own canvas is the
  // authority; the mount and the 800 are fallbacks only for the case where there is no canvas yet.
  // pendingLegibilityRef records that the clamp had to guess, so the reveal effect can redo it against
  // a real canvas — and it stores the radius that was applied, so a user who has since moved the
  // camera is never yanked back.
  const pendingLegibilityRef = useRef(null);
  const applyLegibilityClamp = useCallback((traces, { notify = false } = {}) => {
    if (!traces?.length) return false;
    const canvas = rendererRef.current?.domElement;
    const canvasHeight = canvas?.clientHeight || canvas?.height || 0;
    const pixelHeight = canvasHeight || mountRef.current?.clientHeight || 800;
    const guessed = !canvasHeight;
    const fovDeg = cameraRef.current?.fov || 45;
    const maxRadius = legibilityRadius(LAYER_META.litho.radius * 2, MIN_OPENING_TUBE_PX, fovDeg, pixelHeight);
    if (!(maxRadius > 0) || camState.current.radius <= maxRadius) { pendingLegibilityRef.current = null; return false; }
    // Cell size = roughly the world height the clamped view will show, so "densest" means "the
    // neighbourhood that fills this view with the most drilling", not some scale-free abstraction.
    const centre = densestCentre(traces.flat(), worldHeightAtTargetM(fovDeg, maxRadius) || maxRadius);
    if (centre) camState.current.target.set(centre.x, centre.y, centre.z);
    camState.current.radius = Math.max(80, maxRadius);
    cameraRef.current?.__update?.();
    openingFitRef.current = { traces, radius: camState.current.radius, target: camState.current.target.clone() };
    pendingLegibilityRef.current = guessed ? { traces, radius: camState.current.radius } : null;
    if (notify) setNotices((p) => [...p, notice("Opening view is zoomed to the main drilling so intervals are legible — some holes are outside it. Use Fit (top right of the view) or right-click › Zoom to fit all to frame the whole property.")]); // #567
    return true;
  }, []);

  // Re-run the opening clamp against the canvas as it is NOW. No-op unless the camera is still
  // untouched since the clamp set it (radius and target both), so a user who has zoomed, panned or
  // fitted to everything is never pulled back. The clamp only ever tightens, so a canvas that got
  // TALLER simply leaves the view alone — the tubes are already bigger than the target there.
  const reapplyOpeningFit = useCallback(() => {
    const o = openingFitRef.current;
    if (!o) return;
    if (Math.abs(camState.current.radius - o.radius) > 1e-6 || camState.current.target.distanceTo(o.target) > 1e-6) {
      openingFitRef.current = null;
      return;
    }
    applyLegibilityClamp(o.traces);
  }, [applyLegibilityClamp]);
  applyClampRef.current = reapplyOpeningFit;

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
      // TASKS.csv #313 — if the opening clamp had to guess the canvas height (the project was loaded
      // while this tab was display:none, so there was no canvas to measure), redo it now that there
      // is one. Skipped if the user has moved the camera since: pendingLegibilityRef holds the radius
      // the clamp set, and anything else means the view is theirs now, not the opening view.
      const pending = pendingLegibilityRef.current;
      if (pending && Math.abs(camState.current.radius - pending.radius) < 1e-6) {
        pendingLegibilityRef.current = null;
        applyLegibilityClamp(pending.traces);
      }
      lastActivityRef.current = Date.now();
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, applyLegibilityClamp]);

  // TASKS.csv #313 — DO NOT "fix" the 1.3 here thinking it is arbitrary padding on a conservative
  // diagonal bound. It is not padding: 1/(2 sin(fov/2)) at fov 45 is 1.3066, so this is a snug fit to
  // the box's bounding sphere, i.e. (to within 0.4%, verified by an orientation sweep against the
  // exact per-corner perspective fit — see src/lib/cameraFit.js's header) the tightest radius that
  // frames the box from EVERY orbit angle. Every caller of fitBox is an explicit user "zoom to this"
  // action (zoom-to-layer / zoom-to-custom / zoom-to-fit-all / zoom-to-screen-rect / the context menu
  // / each surface-generation routine), and all of them should keep doing exactly what they say
  // regardless of which way the user then orbits. #313's legibility clamp is deliberately NOT applied
  // here — a user who asks to fit everything must GET everything — only on the one-time opening
  // auto-fit below, which is an editorial choice about a first impression rather than a command.
  const fitBox = useCallback((box, padFactor = 1.3, minRadius = 80) => {
    if (box.isEmpty()) return false;
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
    camState.current.target.copy(center); camState.current.radius = Math.max(minRadius, size * padFactor);
    cameraRef.current?.__update?.();
    return true;
  }, []);
  const fitView = useCallback((traces) => { const box = new THREE.Box3(); traces.forEach((pts) => pts.forEach((p) => box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z)))); fitBox(box); }, [fitBox]);
  // TASKS.csv #313 — the ONE-TIME opening auto-fit, and the only place the legibility clamp applies.
  //
  // Step 1 is the plain fitView above: frame everything. If the whole property is small enough that
  // its tubes are still legible at that distance (a single hole, a tight grid, most of the 6-hole
  // sample_data project), nothing else happens and this is exactly the old behaviour.
  //
  // Step 2 only fires when framing everything would draw a lithology tube thinner than
  // MIN_OPENING_TUBE_PX. Then we cap the radius at the distance where a tube is exactly that wide and
  // re-point the camera at the densest part of the drilling (densestCentre) rather than the centre of
  // the bounding box — on a clustered property those are different places, and a zoomed-in camera
  // aimed at the bbox centre frames the empty ground between clusters, which would replace "my data
  // is invisible" with "my data is missing". Because holes can then be off-screen, and because a user
  // has no way to know that from the picture, this posts a notice saying so and naming the action
  // that undoes it. That notice is not optional politeness — it is what keeps this change honest.
  // `hasIntervalRows` is passed in rather than read from `layers`/`layerVisible` here on purpose: this
  // callback is called from the geometry-rebuild effect, whose dependency array is load-bearing (see
  // its trailing comment — a mere visibility toggle must not re-trigger a rebuild), and closing over
  // layerVisible would drag the whole object into that array.
  const autoFitInitial = useCallback((traces) => {
    const box = new THREE.Box3();
    traces.forEach((pts) => pts.forEach((p) => box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z))));
    if (!fitBox(box)) return;
    // No interval geometry means no tubes to be sub-pixel: a collars/survey-only project (or points
    // and surfaces only) renders 1 px trace lines that look identical at any distance, so clamping in
    // would hide holes for no gain at all. Leave those framed the way they always were.
    // TASKS.csv #313 — "are there tubes on screen to be sub-pixel?", answered from the SCENE, not from
    // React state. Two earlier attempts got this wrong and both failed silently, which is worth
    // recording because the failure mode is identical each time — no error, just the sub-pixel framing
    // this row exists to fix, still there:
    //   1. It began as a second parameter, but the single call site passed only `traces`, so the flag
    //      was always undefined and the clamp below never ran.
    //   2. Deriving it from `layers` + `layerVisible` looked right and still didn't fire: this callback
    //      runs from the geometry-rebuild effect, whose dependency array deliberately does NOT track
    //      `layerVisible`, so at auto-fit time a freshly imported layer is not yet marked visible in
    //      React state even though its geometry has just been built.
    // The layer groups are populated synchronously by the rebuild immediately above, so asking them
    // directly cannot be stale and cannot disagree with what is actually rendered — which is the only
    // thing this check is really about.
    const hasIntervalRows = Object.keys(LAYER_META).some(
      (key) => LAYER_META[key].kind === "interval" && (layerGroupsRef.current[key]?.children.length || 0) > 0,
    );
    if (!hasIntervalRows) return;
    applyLegibilityClamp(traces, { notify: true });
  }, [fitBox, layers, layerVisible, applyLegibilityClamp]);
  const zoomToLayer = useCallback((key) => {
    const group = layerGroupsRef.current[key];
    if (!group || !group.children.length) { setNotices((p) => [...p, notice("{v}: nothing rendered to zoom to.", { v: LAYER_META[key]?.label || key })]); return; }
    fitBox(new THREE.Box3().setFromObject(group));
  }, [fitBox]);
  const zoomToCustom = useCallback((id) => { const g = layerGroupsRef.current[id]; if (g && g.children.length) fitBox(new THREE.Box3().setFromObject(g)); }, [fitBox]);
  const zoomToFitAll = () => fitView(lastTracesRef.current);
  // TASKS.csv #393 — zoom to one hole from the Holes list (its desurveyed trace, scene coords).
  const zoomToHole = useCallback((holeId) => { const t = tracesRef.current.find((x) => x.hole_id === holeId); if (t?.pts?.length) fitView([t.pts]); }, [fitView]);
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

  // ---------- TASKS.csv #650: "View" a structural trend — its ellipsoid, plane and major axis at the drilling's centre ----------
  const trendPreviewRef = useRef(null);
  const trendPreview = useMemo(() => (structuralTrends?.trends || []).find((t) => t.id === trendPreviewId) || null, [structuralTrends, trendPreviewId]);
  useEffect(() => {
    const scene = sceneRef.current; if (!scene) return;
    if (trendPreviewRef.current) { scene.remove(trendPreviewRef.current); disposeThreeGroup(trendPreviewRef.current); trendPreviewRef.current = null; }
    if (!trendPreview) return;
    // at the centre of the current view and a third of the camera distance across, so it is in sight whatever the
    // project's extent (Woodjam's holes span ~5 km: sized from the drilling it engulfed the camera)
    const cs = camState.current;
    if (!cs?.target) return;
    const size = Math.max(10, 0.3 * (cs.radius || 300));
    const t = cleanTrend(trendPreview), b = trendBasis(t);
    const toScene = (v) => new THREE.Vector3(v.x, v.z, -v.y); // (east, north, up) -> scene; a proper rotation
    const basis = new THREE.Matrix4().makeBasis(toScene(b.major), toScene(b.semiMajor), toScene(b.minor));
    const placed = (obj, sxyz) => { obj.matrixAutoUpdate = false; obj.matrix.copy(basis).multiply(new THREE.Matrix4().makeScale(...sxyz)); return obj; };
    const group = new THREE.Group();
    group.add(placed(new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), new THREE.MeshLambertMaterial({ color: TREND_PREVIEW.ellipsoid, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })),
      [size, size * t.ratios.int / t.ratios.max, size * t.ratios.min / t.ratios.max]));
    group.add(placed(new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: TREND_PREVIEW.plane, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })), [size * 1.4, size * 1.4, 1]));
    group.add(placed(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)]), new THREE.LineBasicMaterial({ color: TREND_PREVIEW.axis })), [size * 1.6, 1, 1]));
    group.position.copy(cs.target);
    group.userData = { tip: `${t.name}
${describeTrend(t)}` };
    scene.add(group);
    trendPreviewRef.current = group;
  }, [trendPreview, sceneReady]);

  // ---------- TASKS.csv #16: snapshot the live 3D viewport into a Layout page image ----------
  // TASKS.csv #1005 — Matt: "I get these options when I click on current view on layout. But when I snapshot to layout from
  // 3d view I get the old options". The ribbon's Snapshot used to drop a flat picture (an image element: position, size
  // and nothing else); it now makes the same live Viewport as Layout > Current view (the same capture request), so the
  // frame gets its scale, theme, refresh, true scale, UTM grid, scale bar and north arrow controls.
  const snapshotToLayout = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    requestViewportRender(null, "new", false, false, {}); // the capture effect below answers it; the store opens Layout
    setNotices((p) => [...p, notice("Viewport added to the Layout page: pick its scale, theme or UTM grid there.")]);
  }, [requestViewportRender]);

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
    setNotices((p) => [...p, notice("Saved theme \"{name}\".", { name })]);
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
        setNotices((p) => [...p, notice("Theme \"{name}\" refers to {missing} generated surface(s) that aren't in this project any more: {v}{v2}. Everything else in the theme was applied.", { name: theme.name, missing: missing.length, v: names.slice(0, 3).join(", "), v2: names.length > 3 ? "…" : "" })]);
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
    // TASKS.csv #907 — a requested centre (Layout's "Fit the holes"): the orbit target moves to that world E / N, same
    // elevation, for this capture only - restoreLiveView below puts the user's own camera back
    if (req.centreWorld) {
      const o = originRef.current;
      cs.target.set(req.centreWorld.x - o.x, cs.target.y, o.y - req.centreWorld.y);
      camera.__update?.();
      camera.updateMatrixWorld();
    }
    const fovRad = (camera.fov * Math.PI) / 180;
    // TASKS.csv #69 — true-scale (orthographic) capture. A perspective camera's world-to-pixel
    // scale is only exact AT the target distance (cs.radius) — nearer/farther geometry reads
    // larger/smaller than that ratio, same as a real photo. An orthographic (parallel) projection
    // has no such depth-dependent foreshortening: its frustum's world height is the SAME everywhere
    // along the view direction, so reusing that same height for BOTH the frustum size and the
    // reported scale makes worldHeightAtTarget exact across the whole image, not an estimate valid
    // only at one particular distance. Built fresh per capture (not a persistent second camera) —
    // this never touches the live interactive `camera`, which stays perspective for normal use.
    // TASKS.csv #906 — the capture is drawn at the Layout frame's own aspect (elementW x elementH page px) when the
    // request carries one, so the image fills the frame whatever shape the 3D canvas has (a new viewport, with no frame
    // yet, uses the canvas's). The vertical extent is what the live view frames; the width follows the frame.
    const mountW = mountRef.current.clientWidth, mountH = mountRef.current.clientHeight;
    const frameAspect = req.elementW > 0 && req.elementH > 0;
    const outW = frameAspect ? req.elementW : mountW, outH = frameAspect ? req.elementH : mountH;
    let renderCamera = camera;
    let orthoCamera = null;
    let orthoHalfH = null; // #398
    if (!req.trueScale && frameAspect && (outW !== mountW || outH !== mountH)) {
      // a perspective capture at the frame's aspect: a clone of the live camera (same place, look and vertical field of
      // view), only its aspect differs - the live camera is never touched
      const pc = camera.clone();
      pc.aspect = outW / outH;
      pc.updateProjectionMatrix();
      renderCamera = pc;
    }
    if (req.trueScale) {
      const aspect = outW / outH;
      let halfH = cs.radius * Math.tan(fovRad / 2); // same half-height the perspective camera frames AT the target distance — reused so the orthographic capture shows "the same amount of world" as what was already framed, just without the depth-dependent scale drift
      // TASKS.csv #398 — fixed plot scale: the Layout frame (elementW page px at 96 dpi) must show
      // N x its printed width of world, centred where the camera looks. #906: drawn at the frame's own aspect, so
      // its height shows N x the printed height too - the frame's size on the paper IS the ground it shows.
      if (req.fixedScale > 0 && req.elementW > 0) halfH = fixedScaleHalfHeight(req.fixedScale, req.elementW, aspect); // #961 — tested in layoutGeometry
      const halfW = halfH * aspect;
      orthoHalfH = halfH;
      orthoCamera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, camera.far); // #377 — ortho depth is linear; keep its own small near rather than the perspective one
      if (cs.phi <= 0.0205) {
        // TASKS.csv #981 — a plan capture looks exactly down: the live Top view sits at phi = 0.02 rad (1.15 deg) for the
        // orbit controls' sake, and copying it shifted anything off the target's elevation by 2 m per 100 m of relief
        // against the UTM grid and the overview. Screen-up stays where the live view had it (away from the camera's
        // offset), so the azimuth, the north arrow and the grid's rotation are unchanged.
        orthoCamera.position.set(cs.target.x, cs.target.y + cs.radius, cs.target.z);
        orthoCamera.up.set(-Math.sin(cs.theta), 0, -Math.cos(cs.theta));
        orthoCamera.lookAt(cs.target);
      } else {
        orthoCamera.position.copy(camera.position);
        orthoCamera.quaternion.copy(camera.quaternion);
      }
      orthoCamera.updateProjectionMatrix();
      renderCamera = orthoCamera;
    }
    // No disposal needed for orthoCamera even though it's discarded right after this — a THREE
    // camera holds no GPU resources (no geometry/material/texture), just plain JS-side matrices.
    let dataUrl, shotW = 0, shotH = 0;
    try {
      const shot = captureHiRes(renderer, mountW, mountH, () => { // #380 — print resolution
        fitScreenLabels(layerGroupsRef.current?.hole_labels, renderCamera, outH); // #379
        renderer.clippingPlanes = slicePlanesRef.current; // #453 — the figure shows the slice you see
        renderer.render(scene, renderCamera);
        renderer.clippingPlanes = [];
      }, outW, outH); // #906 — at the frame's aspect
      dataUrl = shot.dataUrl; shotW = shot.width; shotH = shot.height;
    } catch (err) { restoreLiveView(liveViewBeforeRender); resolveViewportRender({ requestId: req.requestId, error: err.message }); return; }
    // TASKS.csv #311 — this used to be the inline `2 * cs.radius * Math.tan(fovRad / 2)`. Same figure,
    // now imported from src/lib/figureScale.js so the Layout scale bar (which this feeds) and the new
    // in-viewport scale bar cannot possibly derive different metres-per-pixel from the same camera.
    // Still exact (not approximate) when req.trueScale is set — see the orthographic branch above.
    const worldHeightAtTarget = orthoHalfH != null ? 2 * orthoHalfH : worldHeightAtTargetM(camera.fov, cs.radius); // #398: the ortho frustum's own height (identical unless a fixed scale set it)
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
    // TASKS.csv #399 — where the view is centred (world E/N) and whether it looks straight down, so Layout
    // can draw a labelled UTM grid over a top-down, true-scale capture. Scene -> world: E = x + ox, N = oy - z.
    // TASKS.csv #907 — read BEFORE restoreLiveView below: it used to be read after, i.e. from the user's own live
    // camera, not the capture's - wrong for a themed viewport whose theme looks elsewhere than the live view, and
    // for a capture centred on the holes (Fit), whose grid would then have been offset by that difference.
    const o = originRef.current;
    const targetWorld = { x: cs.target.x + o.x, y: o.y - cs.target.z };
    const planView = cs.phi <= 0.0205; // within ~1.2 deg of straight down. #398: was "< 0.02", but the Top button sets exactly 0.02, so a Top view never counted as plan and the UTM grid stayed disabled
    // Restore the user's own live view now that every value the capture needed (dataUrl,
    // worldHeightAtTarget, cameraAzimuthDeg, targetWorld, planView) has already been read out of `cs`/the canvas
    // above — this is what actually fixes #202 (see this effect's top comment): without it, the theme
    // applied for this capture was left in place, silently showing up as "my toggled-off layers
    // are back on" whenever the user next looked at the 3D View tab.
    restoreLiveView(liveViewBeforeRender);
    resolveViewportRender({
      requestId: req.requestId, src: dataUrl, naturalW: shotW, naturalH: shotH,
      worldHeightAtTarget, themeName: theme?.name, cameraAzimuthDeg, trueScale: !!req.trueScale, targetWorld, planView, fixedScale: orthoHalfH != null && req.fixedScale > 0 ? req.fixedScale : null,
      // TASKS.csv #948 — a "current view" capture has no theme to read its legend from: the view's own settings (the same
      // bundle a theme saves), kept on the viewport so Layout's "Load from view" works for it
      viewState: theme ? null : liveViewBeforeRender,
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
  const isMcodeKey = (v) => typeof v === "string" && v.startsWith("mcode:"); // TASKS.csv #599
  // TASKS.csv #599 — modelling codes the geologist created or assigned (not every raw code again), with role
  const mcodeDefaultRole = (name) => { const r = roleForLithology(name); return r === "overburden" ? "overburden" : isCrossCuttingRole(r) ? "cross-cutting" : "stratigraphic"; };
  const mcGroupOf = useCallback((v) => lithoGroups.find((g) => (g.codes || []).includes(v))?.name || null, [lithoGroups]);
  const modellingCodeList = useMemo(() => {
    const named = new Set([...Object.values(modellingCodes?.assign || {}), ...(modellingCodes?.codes || []).map((c) => c.name)]);
    if (!named.size) return [];
    return codesInUse(layers.litho, modellingCodes, mcGroupOf, mcodeDefaultRole).filter((c) => named.has(c.name));
  }, [modellingCodes, layers.litho, mcGroupOf]);
  const lithoGroupKey = (g) => `group:${g.id}`;
  // TASKS.csv #810 — what a drawn section contact can be tagged with: modelling codes and group names as well as the
  // logged codes, so a contact can feed a "X (code)" or group unit (the picker used to offer logged codes only)
  const sectionUnitTags = useMemo(() => ({ codes: modellingCodeList.map((c) => c.name), groups: lithoGroups.filter((g) => (g.codes || []).length).map((g) => g.name), explicit: (explicitSurfaces || []).map((d) => d.name) /* #811 */,
    // TASKS.csv #868 — the logged unit an explicit surface is the upper contact of: its lines snap to that unit's tops
    explicitUnits: Object.fromEntries((explicitSurfaces || []).filter((d) => d.contact !== "lower").map((d) => [d.name, (d.unit || d.name).trim()])) }), [modellingCodeList, lithoGroups, explicitSurfaces]);
  // Returns the group object for a `group:` key (null if it was deleted since), else the raw code.
  const resolveLithoTarget = (v) => (isLithoGroupKey(v) ? (lithoGroups.find((g) => g.id === v.slice(6)) || null) : isMcodeKey(v) ? { kind: "mcode", name: v.slice(6) } : v); // #599 mcode:
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
    const last = notices[notices.length - 1];
    const key = notices.length;
    const level = noticeLevel(last);
    setToast({ text: noticeText(last), level, key });
    // TASKS.csv #390 — an error stays until dismissed (a failed save/export that vanished after 5 s was
    // easy to miss); everything else still fades after 5 s.
    if (level === "error") return;
    // TASKS.csv #690 — long, honest result notices (up to ~550 characters, 10-24 s to read) were gone after 5 s: now
    // 60 ms per character, between 5 and 25 s, and the timer stops while the pointer rests on the toast.
    const ms = Math.min(25000, Math.max(5000, 60 * String(noticeText(last) || "").length));
    toastTimerRef.current = { key, ms, started: Date.now(), t: setTimeout(() => setToast((cur) => (cur && cur.key === key ? null : cur)), ms) };
    return () => clearTimeout(toastTimerRef.current?.t);
  }, [notices]);
  const holdToast = useCallback(() => { const tt = toastTimerRef.current; if (tt) clearTimeout(tt.t); }, []);
  const releaseToast = useCallback(() => {
    const tt = toastTimerRef.current;
    if (!tt) return;
    clearTimeout(tt.t);
    tt.t = setTimeout(() => setToast((cur) => (cur && cur.key === tt.key ? null : cur)), 3000);
  }, []);

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
  // geographic axes). Shared by all three modelling tools below — the litho and alteration tools look
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
  // the Modelling tab's domain selector currently holds. Added for the Stereonet's own domain filter,
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
      // #430 — an overturned pick tells GemPy the younger side is the other way (polarity -1)
      orientations.push({ x: api.x, y: api.y, z: api.z, dip: s.dip, azimuth: s.azimuth, hole_id: s.hole_id, ...(s.overturned ? { polarity: -1 } : {}) }); // hole_id: #762 (the sidecar ignores it)
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

  // Shared core for all modelling tools: takes one or more already-gathered {label, meshName, points,
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
  // TASKS.csv #356 — see lastLithBlock.
  const lithUnitColor = (lb, name) => lb.units.find((u) => u.name === name)?.color || colorForLithology(name);
  // TASKS.csv #517 — closed model solids (unit volumes, imported solids) in WORLD coordinates for Grade estimation's
  // "restrict to a modelled volume": [{ id, name, positions (E, N, Z), indices }]. Open surfaces are left out.
  const closedShellsForEstimation = () => {
    const o = originRef.current;
    // TASKS.csv #804 — any body type (grade shells, envelopes, vein solids... not only unit volumes and imports): the
    // estimation dialog still refuses one that is not actually closed
    return (implicitSurfaces || []).filter((sf) => SOLID_SURFACE_TYPES.has(sf.type)).flatMap((sf) => {
      const mesh = implicitMeshesRef.current[sf.id];
      const pos = mesh?.geometry?.attributes?.position?.array;
      if (!pos) return [];
      const n = pos.length / 3, w = new Float64Array(pos.length);
      for (let i = 0; i < n; i++) { w[i * 3] = pos[i * 3] + o.x; w[i * 3 + 1] = o.y - pos[i * 3 + 2]; w[i * 3 + 2] = pos[i * 3 + 1] + o.z; }
      const idx = mesh.geometry.index ? mesh.geometry.index.array : Uint32Array.from({ length: n }, (_, i) => i);
      // TASKS.csv #896 — a unit volume says the block size it was counted at (#877; before that only the cell volume)
      const bs = sf.params?.blockSizeM ? Math.max(...sf.params.blockSizeM) : sf.params?.cellVolumeM3 ? Math.cbrt(sf.params.cellVolumeM3) : null;
      return [{ id: sf.id, name: sf.name, positions: w, indices: idx, ...(sf.type === "unit_volume" && bs ? { blockSizeM: +bs.toFixed(2) } : {}) }];
    });
  };
  // TASKS.csv #802 — a generated / imported surface's mesh in WORLD coordinates (E, N, Z) with its colour, for
  // "Solid blocks from surfaces"
  const surfaceWorldMesh = useCallback((id) => {
    const mesh = implicitMeshesRef.current[id];
    const pos = mesh?.geometry?.attributes?.position?.array;
    if (!pos) return null;
    const o = originRef.current, n = pos.length / 3, w = new Float64Array(pos.length);
    for (let i = 0; i < n; i++) { w[i * 3] = pos[i * 3] + o.x; w[i * 3 + 1] = o.y - pos[i * 3 + 2]; w[i * 3 + 2] = pos[i * 3 + 1] + o.z; }
    const indices = mesh.geometry.index ? mesh.geometry.index.array : Uint32Array.from({ length: n }, (_, i) => i);
    const color = mesh.material?.color ? `#${mesh.material.color.getHexString()}` : null;
    return { positions: w, indices, color };
  }, []);
  // TASKS.csv #570 — explicit wireframes: the outline names drawn on two or more sections, and linking them
  const outlineNames = useMemo(() => {
    const m = new Map();
    // TASKS.csv #860 — count SECTIONS (two outlines on one section read "2 sections" and enabled the button)
    for (const s of sections || []) for (const c of s.contacts || []) if (c.kind === "outline" && c.points?.length >= 3) m.set(c.unit, (m.get(c.unit) || new Set()).add(s.id ?? s.name));
    const fromSections = [...m].filter(([, k]) => k.size >= 2).map(([name, k]) => ({ name, sections: k.size }));
    // TASKS.csv #894 — outlines saved from level plans (boundaries at an elevation, drawn flat) with one name at two or
    // more elevations link too, as a flat-lying body; a name already linked from sections keeps the sections
    const pm = new Map();
    for (const b of boundaries || []) if (b.drapeMode === "flat" && Number.isFinite(b.elevation) && b.polylines?.[0]?.length >= 3 && !m.has(b.name)) pm.set(b.name, (pm.get(b.name) || new Set()).add(Math.round(b.elevation * 10) / 10));
    return [...fromSections, ...[...pm].filter(([, k]) => k.size >= 2).map(([name, k]) => ({ name, sections: k.size, plans: true }))];
  }, [sections, boundaries]);
  const [wireframeName, setWireframeName] = useState("");
  const [wireframeEnds, setWireframeEnds] = useState("flat"); // TASKS.csv #894 — flat / extend / pinch
  // TASKS.csv #878 — products whose sources changed since they were built: a wireframe whose outlines were edited, a unit
  // volume from Solid blocks whose surfaces were rebuilt, edited or removed
  const staleSurfaces = useMemo(() => {
    const m = new Map();
    for (const s of implicitSurfaces) {
      const q = s.params || {};
      if (s.type === "explicit_wireframe" && q.sourceKey && q.body && outlinesKey(sections, q.body) !== q.sourceKey) m.set(s.id, tr("Built from an older state of its outlines: link {body} again to update it.", { body: q.body }));
      else if (s.type === "unit_volume" && q.sourceKey && q.sourceIds && blockSourceKey(q.sourceRecipe, q.sourceIds, implicitSurfaces) !== q.sourceKey) m.set(s.id, tr("Built from an older state of its surfaces (one was rebuilt, edited or removed): build the blocks again to update it."));
    }
    return m;
  }, [implicitSurfaces, sections]);
  // TASKS.csv #874 — the body names already used by outlines, offered when one is drawn on another section
  const outlineNamesOf = (secs) => [...new Set((secs || []).flatMap((s) => (s.contacts || []).filter((c) => c.kind === "outline" && c.unit).map((c) => c.unit)))].sort();
  const linkWireframe = async (name) => {
    const outlines = [];
    for (const s of sections || []) for (const c of s.contacts || []) if (c.kind === "outline" && c.unit === name && c.points?.length >= 3) outlines.push({ ax: s.ax, ay: s.ay, bx: s.bx, by: s.by, section: s.name, points: c.points.filter((p) => [p.x, p.y, p.z].every(Number.isFinite)) });
    try {
      const { linkOutlines, linkPlanOutlines } = await import("../lib/wireframe.js"); // TASKS.csv #903 — loaded on use, not at startup
      // #894 — no section outlines of that name: its level-plan outlines (boundaries drawn flat at their RL)
      const plans = outlines.length ? [] : (boundaries || []).filter((b) => b.name === name && b.drapeMode === "flat" && Number.isFinite(b.elevation) && b.polylines?.[0]?.length >= 3).map((b) => ({ name, rl: b.elevation, points: b.polylines[0].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) }));
      const w = plans.length ? linkPlanOutlines(plans, { ends: wireframeEnds }) : linkOutlines(outlines, { ends: wireframeEnds }); // ends: #894
      if (plans.length) outlines.push(...plans.map((p) => ({ section: `${name} at ${Math.round(p.rl)} m` })));
      // TASKS.csv #860 — the linked mesh must be a valid solid before it is offered for volumes and estimation
      const { validateSolid, isValidSolid } = await import("../lib/meshValidate.js"); // on demand: not in the startup bundle
      const vs = validateSolid(w.positions, w.indices);
      if (!isValidSolid(vs)) throw new Error(tr("The linked outlines do not make a valid solid ({open} open edges, {pairs} self-crossing triangle pairs, {wind} edges facing both ways). Check the outlines' shapes and order, then link again.", { open: vs.openEdges, pairs: vs.selfIntersectingPairs, wind: vs.windingConflicts }));
      const o = originRef.current, scene = new Float32Array(w.positions.length);
      for (let i = 0; i < w.positions.length; i += 3) { scene[i] = w.positions[i] - o.x; scene[i + 1] = w.positions[i + 2] - o.z; scene[i + 2] = o.y - w.positions[i + 1]; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(scene, 3));
      geo.setIndex(new THREE.BufferAttribute(w.indices, 1));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x9b6bd3, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }));
      const nVerts = scene.length / 3, nTris = w.indices.length / 3;
      mesh.userData = { tip: `${name} — explicit wireframe\n${w.sections} section outlines, ${(w.volume / 1e6).toFixed(3)} Mm³` };
      implicitGroupRef.current?.add(mesh);
      // TASKS.csv #874 — re-linking a body replaces its previous solid in place (same id, list entry and style)
      const prev = implicitSurfaces.find((x) => x.type === "explicit_wireframe" && x.params?.body === name);
      const id = prev?.id || `impl_${Date.now()}_wireframe`;
      const old = implicitMeshesRef.current[id];
      if (old) { implicitGroupRef.current?.remove(old); old.geometry?.dispose?.(); old.material?.dispose?.(); }
      implicitMeshesRef.current[id] = mesh;
      setImplicitSurfaces((p) => [...p.filter((x) => x.id !== id), {
        ...(prev || {}), id, name: plans.length ? tr("{name} (wireframe, {n} level plans)", { name, n: w.sections }) : `${name} (wireframe, ${w.sections} sections)`, visible: prev ? prev.visible : true, vertexCount: nVerts, faceCount: nTris,
        type: "explicit_wireframe", relationships: prev?.relationships || [], closure: "closed", edited: false, editCount: 0, edits: [],
        params: { tool: plans.length ? "explicit wireframe from linked level-plan outlines" : "explicit wireframe from linked section outlines", body: name, sections: outlines.map((x) => x.section), pointsPerOutline: w.pointsPerOutline, /* #894: not vertices / sections (extension copies, apexes) */ volumeM3: Math.round(w.volume), ends: wireframeEnds === "extend" ? "extended half a section spacing beyond the first and last outlines (copies of them, flat caps there)" : wireframeEnds === "pinch" ? "pinched out to a point half a section spacing beyond the first and last outlines" : "flat caps on the first and last outline (not extended beyond them)", builtAt: new Date().toISOString(), tiedOutlines: w.tied, foldedStrips: w.twisted.reduce((a, t) => a + t.folded, 0), sourceKey: outlinesKey(sections, name) }, /* tiedOutlines / foldedStrips: #874; sourceKey: #878 */
      }]);
      setNotices((p) => [...p, notice("Linked {n} \"{name}\" outlines into a closed solid: {v} m³. {ends} It is listed with the generated surfaces: volume, export, sections and \"Restrict to a modelled volume\" in Grade estimation.{warn}", { n: w.sections, name, ends: wireframeEnds === "extend" ? tr("Its ends are extended half a section spacing beyond the first and last outlines.") : wireframeEnds === "pinch" ? tr("It pinches out to a point half a section spacing beyond the first and last outlines.") : tr("It ends at the first and last section (flat caps, not extended beyond them)."), v: Math.round(w.volume).toLocaleString(), warn: (w.warnings.length ? tr(" Note: {v}.", { v: w.warnings.join("; ") }) : "") + (prev ? ` ${tr("It replaces the previous solid of {name}.", { name })}` : "") })]); // replaces: #874
    } catch (e) { setNotices((p) => [...p, e]); }
  };
  // TASKS.csv #859 — a vein solid stitched from its hangingwall and footwall surfaces (lib/veinSolid.js, loaded on use)
  const [veinHw, setVeinHw] = useState(""), [veinFw, setVeinFw] = useState("");
  // TASKS.csv #895 — an offset copy of an open surface (lib/offsetSurface.js, loaded on use): along its normal (true
  // thickness, upper side positive) or vertically, as a new generated surface the user can type and use like any other
  const [offsetIn, setOffsetIn] = useState({}); // surface id -> { d, mode }
  // TASKS.csv #895 — a copy of a surface cut to the inside of a project boundary (a claim, an area of interest, a plan
  // outline saved as a boundary), the edge split exactly at the boundary (clipMesh, loaded on use)
  const [clipIn, setClipIn] = useState({}); // surface id -> boundary id
  const makeClippedSurface = async (s) => {
    const b = (boundaries || []).find((x) => x.id === clipIn[s.id]);
    const m = surfaceWorldMesh(s.id);
    if (!b || !m) return;
    try {
      const { clipSurfaceToArea } = await import("../lib/clipMesh.js");
      const r = clipSurfaceToArea(m.positions, m.indices, (x, y) => pointInBoundary(x, y, b.polylines));
      if (!r.indices.length) { setNotices((p) => [...p, notice("\"{name}\" has no part inside \"{b}\": nothing to keep.", { name: s.name, b: b.name })]); return; }
      const o = originRef.current, scene = new Float32Array(r.positions.length);
      for (let i = 0; i < r.positions.length; i += 3) { scene[i] = r.positions[i] - o.x; scene[i + 1] = r.positions[i + 2] - o.z; scene[i + 2] = o.y - r.positions[i + 1]; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(scene, 3));
      geo.setIndex(new THREE.BufferAttribute(r.indices, 1));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x6bb38a, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
      const name = tr("{name} inside {b}", { name: s.name, b: b.name });
      mesh.userData = { tip: `${name}\n${scene.length / 3} vertices` };
      implicitGroupRef.current?.add(mesh);
      const id = `impl_${Date.now()}_clip`;
      implicitMeshesRef.current[id] = mesh;
      setImplicitSurfaces((p) => [...p, { id, name, visible: true, vertexCount: scene.length / 3, faceCount: r.indices.length / 3, type: s.type === "explicit_surface" ? "other" : s.type, relationships: [], closure: null,
        params: { tool: "surface clipped to a boundary", from: s.name, boundary: b.name, trianglesSplit: r.split, trianglesRemoved: r.removed, builtAt: new Date().toISOString() } }]);
      setNotices((p) => [...p, notice("Made \"{name}\": the part of \"{src}\" inside \"{b}\" ({split} triangles cut at the boundary, {removed} outside left out). The original is unchanged.", { name, src: s.name, b: b.name, split: r.split, removed: r.removed })]);
    } catch (e) { setNotices((p) => [...p, e]); }
  };
  const makeOffsetSurface = async (s) => {
    const o2 = offsetIn[s.id] || {}, d = Number(o2.d), mode = o2.mode === "vertical" ? "vertical" : "normal";
    const m = surfaceWorldMesh(s.id);
    if (!m || !Number.isFinite(d) || d === 0) return;
    try {
      const { offsetSurface } = await import("../lib/offsetSurface.js");
      const r = offsetSurface(m.positions, m.indices, d, { mode });
      const o = originRef.current, scene = new Float32Array(r.positions.length);
      for (let i = 0; i < r.positions.length; i += 3) { scene[i] = r.positions[i] - o.x; scene[i + 1] = r.positions[i + 2] - o.z; scene[i + 2] = o.y - r.positions[i + 1]; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(scene, 3));
      geo.setIndex(new THREE.BufferAttribute(r.indices, 1));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x5a9bd4, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
      const ds = `${d > 0 ? "+" : ""}${d}`;
      const name = tr("{name} offset {d} m{v}", { name: s.name, d: ds, v: mode === "vertical" ? tr(" (vertical)") : "" });
      mesh.userData = { tip: `${name}\n${scene.length / 3} vertices` };
      implicitGroupRef.current?.add(mesh);
      const id = `impl_${Date.now()}_offset`;
      implicitMeshesRef.current[id] = mesh;
      setImplicitSurfaces((p) => [...p, { id, name, visible: true, vertexCount: scene.length / 3, faceCount: r.indices.length / 3, type: "other", relationships: [], closure: null,
        params: { tool: "offset copy of a surface", from: s.name, distanceM: d, direction: mode === "vertical" ? "vertical (z + distance)" : "along the surface normal at each vertex (positive = upper side)", builtAt: new Date().toISOString() } }]);
      setNotices((p) => [...p, notice("Made \"{name}\": a copy of \"{src}\" moved {d} m {how}. It is a construction: it follows the original's shape, not data of its own; where the original folds tighter than the offset, the copy can cross itself.", { name, src: s.name, d: ds, how: mode === "vertical" ? tr("vertically") : tr("along its normal (upper side positive)") })]);
    } catch (e) { setNotices((p) => [...p, e]); }
  };
  const buildVeinSolid = async () => {
    const hw = implicitSurfaces.find((x) => x.id === veinHw), fw = implicitSurfaces.find((x) => x.id === veinFw);
    const mh = surfaceWorldMesh(veinHw), mf = surfaceWorldMesh(veinFw);
    if (!hw || !fw || !mh || !mf) return;
    try {
      const { veinSolidFromSurfaces } = await import("../lib/veinSolid.js");
      let w;
      try { w = veinSolidFromSurfaces(mh, mf); } catch (e) { if (String(e.message) === "NO_OVERLAP") throw new Error(tr("\"{a}\" and \"{b}\" do not face each other anywhere, so there is no vein between them.", { a: hw.name, b: fw.name })); throw e; }
      const o = originRef.current, scene = new Float32Array(w.positions.length);
      for (let i = 0; i < w.positions.length; i += 3) { scene[i] = w.positions[i] - o.x; scene[i + 1] = w.positions[i + 2] - o.z; scene[i + 2] = o.y - w.positions[i + 1]; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(scene, 3));
      geo.setIndex(new THREE.BufferAttribute(w.indices, 1));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xd98c3a, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
      const name = tr("{a} – {b} (vein solid)", { a: hw.name, b: fw.name });
      mesh.userData = { tip: `${name}\n${(w.volume / 1e6).toFixed(3)} Mm³, true thickness ${w.thickness.min.toFixed(1)}–${w.thickness.max.toFixed(1)} m` };
      implicitGroupRef.current?.add(mesh);
      const id = `impl_${Date.now()}_veinsolid`;
      implicitMeshesRef.current[id] = mesh;
      setImplicitSurfaces((p) => [...p, {
        id, name, visible: true, vertexCount: scene.length / 3, faceCount: w.indices.length / 3, type: "vein_solid", relationships: [], closure: "closed",
        params: { tool: "vein solid stitched from a hangingwall and a footwall surface", hangingwall: hw.name, footwall: fw.name, volumeM3: Math.round(w.volume), trueThicknessM: { min: +w.thickness.min.toFixed(2), mean: +w.thickness.mean.toFixed(2), max: +w.thickness.max.toFixed(2) },
          attitude: `${w.dip.toFixed(0)}° dip towards ${w.dipDir.toFixed(0)}°`, gridCellM: +w.cellM.toFixed(2), nodesWhereWallsMeet: w.pinchedNodes, ends: "where either wall ends or the walls meet; not extended", builtAt: new Date().toISOString() },
      }]);
      setNotices((p) => [...p, notice("Vein solid from \"{a}\" and \"{b}\": {v} m³, true thickness {t0}–{t1} m (mean {tm} m), {dip}° dip towards {dd}°. It ends where either wall ends and is stepped at {cell} m cells along its edges.{pinch}", {
        a: hw.name, b: fw.name, v: Math.round(w.volume).toLocaleString(), t0: w.thickness.min.toFixed(1), t1: w.thickness.max.toFixed(1), tm: w.thickness.mean.toFixed(1), dip: w.dip.toFixed(0), dd: w.dipDir.toFixed(0), cell: w.cellM.toFixed(1),
        pinch: w.pinchedNodes ? tr(" The walls meet or cross at {n} grid node(s); the solid stops there.", { n: w.pinchedNodes }) : "" })]);
    } catch (e) { setNotices((p) => [...p, e]); }
  };
  const surfaceSolidsBuilt = (lb, sum) => {
    setLastLithBlock(lb);
    setSurfaceSolidsOpen(false);
    // TASKS.csv #877 — each volume with the most a block count can be off by, and where the box (not geology) cuts it
    const bs = blockUnitStats(lb.block), zb = Math.round(bs.baseZ + (lb.origin?.z || 0));
    const units = Object.entries(sum.counts).map(([u, n]) => {
      const q = bs.units[u];
      return tr("{unit} {v} ± {b} Mm³", { unit: u, v: ((n * sum.cellVolume) / 1e6).toFixed(2), b: ((q?.bandM3 || 0) / 1e6).toFixed(2) })
        + (q?.box.includes("base") ? ` ${tr("(to the box base at {z} m)", { z: zb })}` : "") + (q?.box.includes("sides") ? ` ${tr("(cut at the box sides)")}` : "");
    }).join(", ") + (Object.keys(sum.counts).length ? ` — ${tr("± is the most a count of {b} m blocks can be off by (half a block at every contact)", { b: bs.blockM.map((v) => +v.toFixed(1)).join(" × ") })}` : "");
    const partial = Object.entries(sum.coverage).filter(([, f]) => f < 0.999).map(([u, f]) => tr("{unit} covers {pct}% of the box", { unit: u, pct: Math.round(100 * f) }));
    setNotices((p) => [...p, notice("Built {n} blocks ({nx} × {ny} × {nz}) from the surfaces: {units}. Use \"Add unit volumes (closed)\" or \"Add as block model\" in the Last model box above the surface list.{v}", { n: sum.resolution.reduce((a, b) => a * b, 1).toLocaleString(), nx: sum.resolution[0], ny: sum.resolution[1], nz: sum.resolution[2], units: units || tr("no unit cells"), v: (partial.length ? tr(" Beyond a top's footprint the unit above it continues down: {list}.", { list: partial.join("; ") }) : "")
      + (sum.inverted?.baseAboveTop ? tr(" In {n} of {m} columns a unit's base lies above its own top (negative thickness): the blocks there follow the rules but not the geology.", { n: sum.inverted.baseAboveTop, m: sum.inverted.columns }) : "") // #860
      + (sum.inverted?.crossingTops ? tr(" In {n} of {m} columns the tops cross (a lower unit's top above a higher one's): check the stack order and the surfaces there.", { n: sum.inverted.crossingTops, m: sum.inverted.columns }) : "") })]);
  };
  // TASKS.csv #891 — the cheap step (coding the blocks) is guarded at 2 M cells; what follows is not cheap: a block model
  // holds one object per unit cell (~210 bytes each: 1.64 M cells took +340 MB in the #855 review) and unit volumes build
  // shells from them (1.6 s at 1.9 M). Above 300,000 unit cells (~63 MB as a block model), say so and ask.
  const BIG_UNIT_BLOCKS = 300_000;
  const unitCellCount = (lb) => { let n = 0; const ids = lb?.block?.ids || []; for (let i = 0; i < ids.length; i++) if (ids[i] && lb.block.labels[ids[i] - 1] != null) n++; return n; };
  const addLithBlockModel = () => {
    const lb = lastLithBlock; if (!lb) return;
    { const n = unitCellCount(lb); if (n > BIG_UNIT_BLOCKS && !window.confirm(tr("The last model has {n} unit blocks. As a block model they take roughly {mb} MB of memory, which a modest computer may not have to spare; a larger block size keeps it light. Add them anyway?", { n: n.toLocaleString(), mb: Math.round((n * 210) / 1e6) }))) return; } // #891
    const cells = blockToCells(lb.block, lb.origin);
    if (!cells.length) { setNotices((p) => [...p, notice("The last model has no cells below its modelled tops inside the model box — nothing to add.")]); return; }
    const stops = lb.block.labels.map((l, i) => (l == null ? null : { value: i + 1, color: lithUnitColor(lb, l), label: l })).filter(Boolean); // a cell IS the unit: its name, not "Top of .."
    const legend = stops.map((st) => `${st.value} = ${st.label}`).join(", ");
    // #802: blocks built from surfaces open opaque, so they draw as their outer faces (#793) - a GemPy block keeps its look
    addVoxelModel({ name: `Model units: ${lb.title} (${lb.when})`, source: lb.fromSurfaces ? "surfaces" : "gempy", cells, colorMode: "discrete", stops, valueLabels: Object.fromEntries(stops.map((st) => [st.value, st.label])), ...(lb.fromSurfaces ? { opacity: 1 } : {}) });
    setNotices((p) => [...p, lb.fromSurfaces
      ? notice("Added the blocks as a block model: {cells} cells ({legend}). Cells above every top are left out.", { cells: cells.length.toLocaleString(), legend })
      : notice("Added the model's lithology block as a block model: {cells} cells ({legend}). Cells above every modelled top are left out. It is the model, not the logs: see the Model check message for how far they agree.", { cells: cells.length.toLocaleString(), legend })]);
  };
  // TASKS.csv #517 — each modelled unit as a CLOSED shell (the outer faces of its cells, closed at the model box — exact volume at the model cell size):
  // listed with the model surfaces, exportable as DXF / OBJ, cut on sections and plans, measured by the volume
  // readout, and usable to restrict a grade estimate ("inside modelled DACT").
  const addUnitVolumes = () => {
    const lb = lastLithBlock; if (!lb) return;
    { const n = unitCellCount(lb); if (n > BIG_UNIT_BLOCKS && !window.confirm(tr("The last model has {n} unit blocks: building their closed volumes takes a few seconds and makes large meshes. Build them anyway?", { n: n.toLocaleString() }))) return; } // #891
    const o = originRef.current, stamp = Date.now(), added = [], lines = [];
    const ust = blockUnitStats(lb.block); // TASKS.csv #877
    lb.block.labels.forEach((label, k) => {
      if (label == null) return;
      // the block is in the model's API frame; lb.origin is the world origin it was built with
      const s = unitShell(lb.block, label, lb.origin);
      if (!s) return;
      const w = s.positions, scene = new Float32Array(w.length);
      for (let i = 0; i < w.length; i += 3) { scene[i] = w[i] - o.x; scene[i + 1] = w[i + 2] - o.z; scene[i + 2] = o.y - w[i + 1]; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(scene, 3));
      geo.setIndex(new THREE.BufferAttribute(s.indices, 1));
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(lithUnitColor(lb, label)), side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
      const mesh = new THREE.Mesh(geo, mat);
      const vol = meshVolume(w, s.indices);
      const nTris = s.indices.length / 3, nVerts = w.length / 3;
      mesh.userData = { tip: `${label} — unit volume (${lb.title})\n${(vol / 1e6).toFixed(2)} Mm³ inside the model box, ${nTris} triangles` };
      implicitGroupRef.current?.add(mesh);
      const id = `impl_${stamp}_unitvol_${k}`;
      implicitMeshesRef.current[id] = mesh;
      added.push({
        id, name: `${label} volume (${lb.title.replace(/^stack /, "")}, ${lb.when})`, visible: true, vertexCount: nVerts, faceCount: nTris,
        type: "unit_volume", relationships: [], closure: "closed",
        params: { tool: "unit volume from the implicit model's lithology block", unit: label, model: lb.title, builtAt: lb.builtAtIso || lb.when, ...(lb.source ? { sourceKey: lb.source.key, sourceIds: lb.source.ids, sourceRecipe: lb.source.recipe } : {}), /* builtAtIso / source: #878 */ cells: s.cells, cellVolumeM3: +s.cellVolume.toFixed(3), cellsVolumeM3: Math.round(s.blockVolume), shellVolumeM3: Math.round(vol),
          ...(ust.units[label] ? { volumeBandM3: Math.round(ust.units[label].bandM3), blockSizeM: ust.blockM.map((v) => +v.toFixed(2)), cutByBox: ust.units[label].box } : {}), /* TASKS.csv #877 */ note: lb.block.resampledFromTrend ? tr("Built from the trend model resampled onto a real-space grid (#679), so the shell follows that grid's steps; the exact unit volume is the one in the Model check message. Cut at the model box: a unit that continues beyond it is closed there.") : tr("Cut at the model box: a unit that continues beyond it is closed there.") },
      });
      lines.push(tr("{label} {v} Mm³", { label, v: (vol / 1e6).toFixed(2) }));
    });
    if (!added.length) { setNotices((p) => [...p, notice("The last model has no modelled unit cells inside its box — no volumes to build.")]); return; }
    setImplicitSurfaces((p) => [...p, ...added]);
    setNotices((p) => [...p, notice("Added {added} closed unit volume(s) from {title}: {lines} (inside the model box — a unit that continues beyond it is closed at the box). They are listed with the model surfaces: export, sections, the volume readout and \"Restrict to a modelled volume\" in Grade estimation work on them.", { added: added.length, title: lb.title, lines: lines.join(", ") })]);
  };
  const addModelledLayer = () => {
    const lb = lastLithBlock; if (!lb) return;
    // TASKS.csv #756 — the units GemPy evaluated exactly at each interval's midpoint, when the run asked for them
    const exactRows = lb.intervals ? lb.intervals.map((q) => ({ hole_id: q.hole_id, from: q.from, to: q.to, value: q.modelled ?? ABOVE_TOPS, logged: q.logged })) : null;
    const samples = [];
    tracesRef.current.forEach((t) => {
      (importStateRef.current.layers?.litho || []).forEach((r) => {
        if (r.hole_id !== t.hole_id || !Number.isFinite(r.from) || !Number.isFinite(r.to) || r.to <= r.from) return;
        const p = findOnTrace(t.pts, (r.from + r.to) / 2);
        if (!p) return;
        const api = sceneToApi(p);
        samples.push({ hole_id: t.hole_id, from: r.from, to: r.to, x: api.x, y: api.y, z: api.z, logged: r.value });
      });
    });
    const rows = (exactRows || modelledIntervals(lb.block, samples)).map((r) => {
      const unit = lb.units.find((u) => u.name === r.value);
      return { ...r, value: unit?.label || r.value, modelled: true, modelColor: r.value === ABOVE_TOPS ? "#d9dce1" : lithUnitColor(lb, r.value) };
    });
    if (!rows.length) { setNotices((p) => [...p, notice("No logged litho intervals fall inside the last model's box.")]); return; }
    const id = `custom_${Date.now()}`;
    const group = new THREE.Group(); group.name = id;
    layerGroupsRef.current[id] = group;
    sceneRef.current.getObjectByName("root").add(group);
    setCustomLayers((p) => [...p, { id, name: `Modelled: ${lb.title} (${lb.when})`, rows, group }]);
    setNotices((p) => [...p, notice("Added \"Modelled: {title}\" — the model's unit at {rows} logged litho intervals (their midpoints). Open a hole's strip log to see it beside the logged litho.", { title: lb.title, rows: rows.length.toLocaleString() })]);
  };

  // ---------- TASKS.csv #318 — mapped surface contacts ----------
  // World-coordinate [x, y, z] points along a chosen mapped contact, draped on the terrain. `spacing`
  // thins the (5 m-sampled) contact runs so the output is roughly one point per `spacing` metres.
  // Returns [] without a terrain: a map contact has no elevation of its own.
  const mapContactLines = (mc) => {
    const layer = mapLayers.find((l) => l.id === mc?.layerId);
    if (!layer || !terrain) return [];
    const { contacts } = extractMapContacts(layer, layer.styleField, { tolerance: mc.tolerance || 2, spacing: 5 });
    return contacts.find((c) => c.key === mc.contactKey)?.lines || [];
  };
  const mapContactWorldPoints = (mc, spacing) => mapContactLines(mc)
    .flatMap((line) => thinLine(line, spacing))
    .map(([x, y]) => [x, y, sampleTerrainElevation(terrain, x, y)]);
  const surfaceMeasurementsFor = (classes) => surfaceStructures.flatMap((st) => st.rows || []).filter((r) => classes.includes(r.cls))
    .map((r) => ({ ...r, z: terrain ? sampleTerrainElevation(terrain, r.x, r.y) : (r.z ?? originRef.current.z) }));
  const surfaceOrientationsNear = (pts, mc) => {
    const r2 = (mc.radius || 500) ** 2;
    return surfaceMeasurementsFor(mc.classes || []).filter((m) => pts.some(([x, y]) => (x - m.x) ** 2 + (y - m.y) ** 2 <= r2));
  };

  // TASKS.csv #445 step 2 — the modelling runs live in modules/viewer/useModelling.js (moved verbatim); called here,
  // where that code used to sit, so the hook order is unchanged.
  const { addStackUnit, computeIntercepts, faultCandidates, moveStackUnit, removeStackUnit, runAlterationModel, runImplicitModel, runMapModel, runNumericModel, runStackModel, runStructuralModel, runVeinModel } = useModelling({ // runMapModel: #817
    activeInterceptSetRef,
    alterationCellSize,
    alterationSearchRadius,
    trendWarp, // TASKS.csv #650
    apiToScene,
    assayElements,
    assays,
    clipToDomainBoundary,
    clipToTopo,
    collars,
    desurveyMethod,
    domains,
    estimateOrientationFromPoints,
    excludedIntercepts,
    filterRowsByDomain,
    filterRowsBySearchEllipsoid,
    fitBox,
    getProjectToken,
    implicitGroupRef,
    implicitMeshesRef,
    importStateRef,
    includeSectionContacts,
    explicitSurfaces, // TASKS.csv #811 — lines tagged with an explicit surface are not "unmatched" in an implicit run
    interceptInActiveSet,
    isSameProject,
    layers,
    lithoGroups,
    modellingCodes, // TASKS.csv #599
    mapConstraint,
    mapContactWorldPoints,
    mapLayers,
    addRaster, rasters, removeRaster, // TASKS.csv #758
    modelAbortControllerRef,
    modelDomainId,
    modelResolution,
    numericCapValue,
    numericCellSize,
    numericMaxBlocks, setNumericBudgetHint, // TASKS.csv #625
    numericCloseShell,
    numericCompositeLength,
    numericCutoff,
    numericIncludeQAQC,
    numericMethod,
    numericVariogram, // #1015
    numericMinCoverage,
    numericMinHoles,
    numericPadding,
    numericSearchRadius,
    numericSymbol,
    numericUseComposites,
    orientTypes,
    originRef,
    rangeMultiplier,
    thinPicks, thinWindowM, // TASKS.csv #765
    smoothClusters, // TASKS.csv #761
    surfaceDetail, // TASKS.csv #766
    addVoxelModel, // TASKS.csv #757
    resolveLithoTarget,
    sceneToApi,
    searchEllipsoid,
    sections,
    setAlterationBusy,
    setImplicitBusy,
    setImplicitSurfaces,
    setLastLithBlock,
    setNotices,
    setNumericBusy,
    setStackUnits,
    setTaskProgress,
    setVeinBusy,
    softIntercepts,
    stackFaults,
    stackRelation,
    stackUnits,
    structureRowsToOrientations,
    surfaceOrientationsNear,
    survey, // TASKS.csv #991 — surfaceStructures and terrain were passed here but read by neither the hook nor the runs
    terrainForClipRef,
    tracesRef,
    veinCellSize,
    veinDip,
    veinDipDir,
    veinSearchRadius,
  });

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
    // TASKS.csv #414 — parsed in a worker (a 1M-face DXF used to freeze the UI for ~11 s and take ~2 GB),
    // with progress in the status bar, and one surface per DXF layer / OBJ object instead of one merged mesh.
    const progLabel = `Reading ${file.name}`;
    const clearProgress = () => setTaskProgress((cur) => (cur && cur.label === progLabel ? null : cur));
    setTaskProgress({ label: progLabel, pct: 0 });
    try {
      const solid = await parseSolidInWorker(file, (read, total) => setTaskProgress((cur) => (cur && cur.label === progLabel ? { ...cur, pct: Math.round((read / Math.max(1, total)) * 100) } : cur)));
      clearProgress();
      const layered = solid.parts.length > 1;
      // #483: the saved size is the compact form (compactSurfaces.js, ~10 MB per million triangles measured); an
      // upper estimate here, at ~3 bytes per coordinate and ~2 per index, base64
      if (solid.triangleCount > SOLID_FACE_WARN && !window.confirm(tr("\"{name}\" has {triangleCount} triangles{v}. That can make the 3D view slow to move on a modest computer, and it adds up to about {v2} MB to the saved project. Import it anyway?", { name: file.name, triangleCount: solid.triangleCount.toLocaleString(), v: layered ? tr(" in {parts} layers", { parts: solid.parts.length }) : "", v2: Math.round(((solid.vertexCount * 3 * 3 + solid.triangleCount * 3 * 2) * 4) / 3 / 1e6) }))) {
        setNotices((p) => [...p, notice("{name}: import cancelled ({triangleCount} triangles).", { name: file.name, triangleCount: solid.triangleCount.toLocaleString() })]);
        return;
      }
      const bounds = solidBounds(solid.parts);
      const o = originRef.current;
      const label = file.name.replace(/\.(dxf|obj)$/i, "");
      const stamp = Date.now();
      const box = new THREE.Box3();
      const added = solid.parts.map((part, k) => {
        // World (easting, northing, elevation) -> scene, the exact inverse of meshExport.js's
        // sceneVertsToWorld (scene x = east offset, y = elevation offset, z = -(north offset)).
        const w = part.positions, scene = new Float32Array(w.length);
        for (let i = 0; i < w.length; i += 3) { scene[i] = w[i] - o.x; scene[i + 1] = w[i + 2] - o.z; scene[i + 2] = o.y - w[i + 1]; }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(scene, 3));
        geo.setIndex(new THREE.BufferAttribute(part.indices, 1));
        // #483 — normals come from the worker in world axes; scene = (x, elevation, -north), a rotation, so
        // the same component swap applies. (The main-thread fallback parser has none: compute them here.)
        if (part.normals?.length === w.length) {
          const wn = part.normals, sn = new Float32Array(wn.length);
          for (let i = 0; i < wn.length; i += 3) { sn[i] = wn[i]; sn[i + 1] = wn[i + 2]; sn[i + 2] = -wn[i + 1]; }
          geo.setAttribute("normal", new THREE.BufferAttribute(sn, 3));
        } else geo.computeVertexNormals();
        // Translucent grey-blue family, visually distinct from the gold/coloured generated surfaces — an
        // imported reference shape should not look like something this app modelled. Layers get neighbouring
        // tones so a pit shell and its stopes can be told apart (the #52 sync-out saves the material colour).
        const color = IMPORTED_SOLID_COLORS[k % IMPORTED_SOLID_COLORS.length];
        const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.45 });
        const mesh = new THREE.Mesh(geo, mat);
        const name = layered ? `${label} — ${part.layer}` : label;
        const nVerts = w.length / 3, nTris = part.indices.length / 3;
        mesh.userData = { tip: `${name} (imported ${solid.format})\n${nVerts} vertices, ${nTris} triangles` };
        implicitGroupRef.current?.add(mesh);
        const id = `impl_${stamp}_imported${layered ? `_${k}` : ""}`;
        implicitMeshesRef.current[id] = mesh;
        // #491 — was box.expandByObject(mesh), which walks every vertex through the world matrix (~50 ms per
        // 250k vertices). The typed-array bounding box moved by the world matrix is the same box here: the
        // parents only translate and scale (vertical exaggeration).
        geo.computeBoundingBox();
        mesh.updateWorldMatrix(true, false);
        box.union(geo.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
        return {
          id, name: `${name} (imported)`, visible: true,
          vertexCount: nVerts, faceCount: nTris,
          type: "imported", relationships: [], closure: null,
          params: {
            tool: "imported solid", sourceFile: file.name, format: solid.format, ...(layered ? { layer: part.layer } : {}),
            detail: solid.note, vertices: nVerts, triangles: nTris,
            crsAssumed: project?.epsg ? `assumed already in EPSG:${project.epsg}` : "assumed already in the project CRS",
            importedAt: new Date().toISOString(),
          },
        };
      });
      setImplicitSurfaces((p) => [...p, ...added]);
      const bb = bounds
        ? ` Extent: E ${bounds.min.x.toFixed(0)}–${bounds.max.x.toFixed(0)}, N ${bounds.min.y.toFixed(0)}–${bounds.max.y.toFixed(0)}, Z ${bounds.min.z.toFixed(0)}–${bounds.max.z.toFixed(0)}.`
        : "";
      const layerNote = layered ? tr(" One surface per {v} ({v2}).", { v: solid.format === "DXF" ? "layer" : "object", v2: solid.parts.map((p) => p.layer).join(", ") }) : "";
      setNotices((p) => [...p, notice("Imported \"{name}\" as a solid: {vertexCount} vertices / {triangleCount} triangles ({format}, {note}).{layerNote} It appears under Generated surfaces with the same show/hide, remove and query controls.{bb} Coordinates are used AS-IS — a DXF/OBJ carries no CRS, so GeoStrix does not reproject it; if it lands away from your holes, the file is in a different CRS.", { name: file.name, vertexCount: solid.vertexCount.toLocaleString(), triangleCount: solid.triangleCount.toLocaleString(), format: solid.format, note: solid.note, layerNote, bb })]);
      fitBox(box);
    } catch (e) {
      clearProgress();
      setNotices((p) => [...p, errorNotice(tr("{name}: couldn't import as a solid ({v}).", { name: file.name, v: e.message || e }))]); // #739
    }
  }, [fitBox, project?.epsg, setTaskProgress]);



  // TASKS.csv #638 — a triangle mesh in world coordinates (the geoML add-on's contact surface) registered like an imported
  // solid (#148): show / hide, remove, query, export, persistence and section intersection come with it. Optional
  // per-vertex 0–1 values (geoML's uncertainty) colour it light (confident) → dark (uncertain) for this session; the
  // saved surface keeps its plain colour.
  const addWorldMeshSurface = useCallback(({ name, positions, indices, values = null, color = "#c46f2a", opacity = 0.7, params = {} }) => {
    const o = originRef.current;
    const scene = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) { scene[i] = positions[i] - o.x; scene[i + 1] = positions[i + 2] - o.z; scene[i + 2] = o.y - positions[i + 1]; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(scene, 3));
    geo.setIndex(new THREE.BufferAttribute(indices instanceof Uint32Array ? indices : new Uint32Array(indices), 1));
    geo.computeVertexNormals();
    let vertexColors = false;
    if (values && values.length === positions.length / 3) {
      const cols = new Float32Array(positions.length), base = new THREE.Color(color), dark = new THREE.Color("#1d2b53");
      const c = new THREE.Color();
      for (let i = 0; i < values.length; i++) { c.copy(base).lerp(dark, Math.max(0, Math.min(1, values[i]))); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
      geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      vertexColors = true;
    }
    const mat = new THREE.MeshLambertMaterial({ color: vertexColors ? 0xffffff : color, vertexColors, side: THREE.DoubleSide, transparent: opacity < 1, opacity });
    const mesh = new THREE.Mesh(geo, mat);
    const nVerts = positions.length / 3, nTris = indices.length / 3;
    mesh.userData = { tip: `${name}
${nVerts.toLocaleString()} vertices, ${nTris.toLocaleString()} triangles` };
    implicitGroupRef.current?.add(mesh);
    const id = `impl_${Date.now()}_geoml_${Math.random().toString(36).slice(2, 6)}`;
    implicitMeshesRef.current[id] = mesh;
    setImplicitSurfaces((p) => [...p, { id, name, visible: true, vertexCount: nVerts, faceCount: nTris, type: "geoml", relationships: [], closure: null, params: { tool: "geoML (predictive modelling add-on)", vertices: nVerts, triangles: nTris, createdAt: new Date().toISOString(), ...params } }]);
    geo.computeBoundingBox(); mesh.updateWorldMatrix(true, false);
    lastActivityRef.current = Date.now();
    return id;
  }, []);

  // "Project contact to depth": sweep the draped trace down-dip (mapLayers.js projectContactRibbon) and
  // register the result exactly like an imported solid (#148) — in implicitMeshesRef/implicitSurfaces —
  // so it gets show/hide, remove, query, export, persistence and section intersection for free. Tagged
  // type "projected_contact" with the parameters that made it, so it can never be mistaken for a GemPy
  // result: it is a geometric extrapolation of outcrop data, nothing more.
  const projectMapContact = useCallback((settings, contact, layer, measurements) => {
    if (!contact || !terrain) return;
    const o = originRef.current;
    const meas = measurements.map((r) => ({ ...r }));
    let fromData = 0, fromManual = 0;
    const orient = (x, y) => {
      const hit = meas.length ? orientationAt(x, y, meas, settings.radius) : null;
      if (hit) { fromData++; return hit; }
      fromManual++;
      return { dip: settings.manualDip, dipDir: settings.manualDipDir };
    };
    const allV = [];
    const allI = [];
    let clamped = 0;
    contact.lines.forEach((line) => {
      // Trace resampled every 10 m along its length so the draped top edge follows the ground between
      // map vertices, then each vertex swept down-dip.
      const trace = densifyLine(thinLine(line, 10), 10).map(([x, y]) => [x, y, sampleTerrainElevation(terrain, x, y)]);
      if (trace.length < 2) return;
      const rows = Math.max(4, Math.min(30, Math.round(settings.depth / 25)));
      const rb = projectContactRibbon(trace, orient, { depth: settings.depth, rows, minDip: 10 });
      clamped += rb.clampedDips;
      const base = allV.length / 3;
      allV.push(...rb.vertices);
      rb.indices.forEach((i) => allI.push(i + base));
    });
    if (allV.length < 9) { setNotices((p) => [...p, notice("That contact is too short to project.")]); return; }
    const scene = new Float32Array(allV.length);
    for (let i = 0; i < allV.length; i += 3) { scene[i] = allV[i] - o.x; scene[i + 1] = allV[i + 2] - o.z; scene[i + 2] = o.y - allV[i + 1]; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(scene, 3));
    geo.setIndex(allI);
    geo.computeVertexNormals();
    const labelFor = (v) => layer.categories?.find((c) => c.value === v)?.label || v || "(no value)";
    const color = layer.categories?.find((c) => c.value === contact.units[0])?.color || "#c8a24a";
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
    const name = `Projected contact: ${labelFor(contact.units[0])} | ${labelFor(contact.units[1])}`;
    const nVerts = allV.length / 3;
    mesh.userData = { tip: `${name}\n${settings.depth} m down-dip from the mapped trace` };
    implicitGroupRef.current?.add(mesh);
    const id = `impl_${Date.now()}_mapproj`;
    implicitMeshesRef.current[id] = mesh;
    const total = fromData + fromManual || 1;
    setImplicitSurfaces((p) => [...p, {
      id, name, visible: true, color, opacity: 0.7,
      vertexCount: nVerts, faceCount: allI.length / 3,
      type: "projected_contact", relationships: [], closure: null,
      params: {
        tool: "surface map dip projection", mapLayer: layer.name, attribute: layer.styleField, contact: contact.units,
        depthM: settings.depth, measurementTypes: settings.classes, searchRadiusM: settings.radius,
        fallbackDip: settings.manualDip, fallbackDipDirection: settings.manualDipDir,
        traceVerticesDipFromMeasurements: fromData, traceVerticesDipFromFallback: fromManual, dipsClampedTo10: clamped,
        snapToleranceM: settings.tolerance, createdAt: new Date().toISOString(),
      },
    }]);
    const pct = Math.round((100 * fromData) / total);
    setNotices((p) => [...p, notice("{name}: {v} m of mapped contact projected {depth} m below surface ({nVerts} vertices). Dip came from outcrop measurements along {pct}% of the trace{v2}{v3}. This is a straight dip extrapolation of surface data, not a model — check it against any drilling.", { name, v: Math.round(contact.lengthM).toLocaleString(), depth: settings.depth, nVerts: nVerts.toLocaleString(), pct, v2: fromManual ? tr(" and from the typed {manualDip}°→{manualDipDir}° along the rest (no chosen measurement within {radius} m)", { manualDip: settings.manualDip, manualDipDir: settings.manualDipDir, radius: settings.radius }) : "", v3: clamped ? tr("; {clamped} sub-10° dip(s) were steepened to 10°", { clamped }) : "" })]);
  }, [terrain]);

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
  // TASKS.csv #636 — colour / opacity from the surface's right-click menu (lib/surfaceStyle.js); null = reset
  const setSurfaceStyle = useCallback((id, patch) => {
    setImplicitSurfaces((p) => p.map((s) => {
      if (s.id !== id) return s;
      const style = mergeSurfaceStyle(s.style, patch);
      const { style: _old, ...rest } = s;
      return style ? { ...rest, style } : rest;
    }));
  }, []);
  // ...applied to every surface's mesh whenever the list changes, wherever the mesh was built (several places)
  useEffect(() => {
    implicitSurfaces.forEach((s) => applySurfaceStyle(implicitMeshesRef.current[s.id], s));
    // TASKS.csv #795 — big meshes are drawn from a simplified copy; the meshes themselves are untouched
    syncDrawLods(implicitMeshesRef.current, implicitSurfaces, { pickLayer: PICK_ONLY_LAYER, onDone: () => { lastActivityRef.current = Date.now(); setLodSeq((n) => n + 1); } });
  }, [implicitSurfaces]);
  const [lodSeq, setLodSeq] = useState(0); // TASKS.csv #795 — re-render the surface details when a drawing copy is ready
  // TASKS.csv #885 — an explicit surface is rebuilt from its picks, which go with it and come back with Ctrl+Z
  const confirmRemoveSurface = (s) => (s.type === "explicit_surface"
    ? confirmDestructive(tr("Remove the explicit surface \"{name}\" with its picks and lines?", { name: s.name }), { undoable: true })
    : confirmDestructive(tr("Remove surface \"{name}\"?", { name: s.name }), { recover: tr("getting it back means re-running the model.") }));
  const removeImplicitSurface = useCallback((id) => {
    const mesh = implicitMeshesRef.current[id];
    if (mesh) { dropDrawLod(mesh); implicitGroupRef.current?.remove(mesh); mesh.geometry?.dispose?.(); mesh.material?.dispose?.(); delete implicitMeshesRef.current[id]; } // dropDrawLod: #795
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
    // TASKS.csv #885 — an explicit surface's definition goes with its mesh: left behind, the Explicit surface pane rebuilt
    // the "removed" surface under the same id. Definitions are undo-tracked, so Ctrl+Z brings both back.
    setExplicitSurfaces((p) => (p.some((d) => d.surfaceId === id) ? p.filter((d) => d.surfaceId !== id) : p));
  }, []); // store setters are stable
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
      setNotices((n) => [...n, notice("Accepted \"{name}\" as the version you are working from{v}. \"Accepted\" records your choice — it is not a check that this run is correct.", { name, v: others > 0 ? tr(others === 1 ? "; the other version in this lineage was hidden but NOT deleted (it still saves with the project and can be shown again from the list)" : "; the other {others} versions in this lineage were hidden but NOT deleted (they still save with the project and can be shown again from the list)", { others }) : "" })]);
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
    setNotices((n) => [...n, notice("Overlay: the older version is grey-blue, the newer is orange. Other versions of the same surface are hidden (not deleted). Use \"Reset colours\" in the compare dialog to put them back.")]);
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
  const deleteDomain = useCallback((id) => {
    const dom = (modelDomains || []).find((d) => d.id === id); // TASKS.csv #386
    if (!confirmDestructive(tr("Delete model domain \"{v}\" and its fault-side constraints?", { v: dom?.name || "domain" }))) return;
    setDomains((p) => p.filter((d) => d.id !== id));
    if (modelDomainId === id) setModelDomainId("");
  }, [modelDomainId, modelDomains]);
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
      setNotices((p) => [...p, notice("This surface's geometry looks degenerate (empty or non-finite bounds) — nothing to zoom to. Try regenerating it with more/better-spread points.")]);
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
    const epsg = await ensureExportCrs(project); if (!epsg) return; // TASKS.csv #1021 — not the placeholder
    const baseName = (surf.name || "surface").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
    // TASKS.csv #269 — every exported mesh carries its own parameter provenance + the "not a Mineral
    // Resource estimate" stamp, so it can't come back later stripped of the assumptions behind it.
    const prov = surf.params || null;
    // TASKS.csv #1028 (review #1016) — "Enclosed volume" only for a closed mesh: an open sheet has no inside, and the
    // signed-tetrahedron sum it got depends on the scene origin (1.65 / 165 / 137 Mm3 for one sheet)
    const vol = computeMeshVolume(mesh.geometry);
    const extra = { epsg, densityTPerM3: surf.density ?? null, volumeM3: vol.watertight ? vol.volumeM3 : null, ...(vol.watertight ? {} : { openSurface: true }) };
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
      let res = null; // #1042 — "Exported" only when the file was written; Cancel says nothing
      const { exportSurfaceOBJ, exportSurfaceDXF, exportSurfaceGLTF, sceneVertsToWorld } = await import("../lib/meshExport.js"); // #600 startup budget
      if (format === "obj") {
        const content = exportSurfaceOBJ(surf.name, mesh.geometry, originRef.current, prov, extra, { bytes: true }); // #1072 — UTF-8 bytes, not one huge string
        res = await saveFile({ quiet: true, suggestedName: `${baseName}.obj`, filters: [{ name: "Wavefront OBJ", extensions: ["obj"] }], content });
      } else if (format === "dxf") {
        const content = exportSurfaceDXF(surf.name, mesh.geometry, originRef.current, prov, extra, { bytes: true }); // #1072
        res = await saveFile({ quiet: true, suggestedName: `${baseName}.dxf`, filters: [{ name: "AutoCAD DXF", extensions: ["dxf"] }], content });
      } else if (format === "glb") {
        const buf = await exportSurfaceGLTF(surf.name, mesh.geometry, originRef.current, prov, extra);
        res = await saveFile({ quiet: true, suggestedName: `${baseName}.glb`, filters: [{ name: "glTF Binary", extensions: ["glb"] }], content: new Uint8Array(buf) /* #1040 bytes */ });
      } else if (format === "vtk") {
        // TASKS.csv #798 — legacy VTK polydata for ParaView / PyVista (pv.read)
        const { surfaceToVtk } = await import("../lib/vtkExport.js");
        const { vertices, indices } = sceneVertsToWorld(mesh.geometry, originRef.current);
        const content = surfaceToVtk(surf.name, vertices, indices, `EPSG:${epsg}${surf.editCount > 0 ? `, hand-edited ${surf.editCount} time(s)` : ""}`);
        res = await saveFile({ quiet: true, suggestedName: `${baseName}.vtk`, filters: [{ name: "VTK (legacy)", extensions: ["vtk"] }], content, encoding: "text" });
      } else if (format === "omf") {
        // TASKS.csv #411 — OMF v1 for Leapfrog / Datamine / Vulcan / Micromine (writer loaded on first use)
        const { writeOMF } = await import("../lib/omfWriter.js");
        const { vertices, indices } = sceneVertsToWorld(mesh.geometry, originRef.current);
        const desc = `GeoStrix surface, EPSG:${epsg}${extra.volumeM3 != null ? `, enclosed volume ${Math.round(extra.volumeM3)} m3` : ""}${surf.editCount > 0 ? `, hand-edited ${surf.editCount} time(s)` : ""}`;
        const bytes = await writeOMF({ name: surf.name, description: desc, elements: [{ type: "surface", name: surf.name, description: desc, vertices: vertices.flat(), triangles: indices.flat() }] });
        res = await saveFile({ quiet: true, suggestedName: `${baseName}.omf`, filters: [{ name: "Open Mining Format", extensions: ["omf"] }], content: bytes /* #1040 bytes */ });
      }
      if (!res?.ok) { if (res?.error) throw new Error(res.error); return; }
      setNotices((p) => [...p, notice("Exported \"{name}\" as {format} (real-world coordinates).", { name: surf.name, format: format.toUpperCase() })]);
    } catch (err) {
      setNotices((p) => [...p, errorNotice(tr("Export failed for \"{name}\": {message}", { name: surf.name, message: err.message }))]);
    }
  }, [implicitSurfaces, project]);

  // TASKS.csv #188 — "Our planned drill holes need the option to get exported to csv." One row per
  // planned hole, real-world collar (x/y/z — same east/north/elevation convention every other export
  // in this app uses, e.g. exportImplicitSurface above), plus the design orientation/length and a
  // computed toe (bottom-of-hole) position so the CSV is immediately usable for staking/permitting
  // without anyone having to hand-calculate the endpoint from azimuth/dip/length themselves.
  // TASKS.csv #397 — lat/lon, true and magnetic azimuths (declination at TODAY's date — the drilling is
  // about to happen) and KML / GPX for phones and handheld GPS; see rigExport.js.
  // TASKS.csv #1009 — the visible modelled surfaces in world coordinates for the planned holes' pierce points; one object
  // per geometry (and its version), so the mesh query surfacePierces builds for it is reused until the surface changes
  const worldMeshCache = useRef(new WeakMap());
  const pierceSurfaces = useMemo(() => implicitSurfaces.filter((sf) => sf.visible !== false).map((sf) => {
    const g = implicitMeshesRef.current[sf.id]?.geometry;
    if (!g?.attributes?.position) return null;
    const ver = g.attributes.position.version;
    let w = worldMeshCache.current.get(g);
    if (!w || w.ver !== ver || w.name !== sf.name) {
      const { vertices, indices } = sceneVertsToWorldFlat(g, originRef.current);
      w = { id: sf.id, name: sf.name, positions: vertices, indices, ver };
      worldMeshCache.current.set(g, w);
    }
    return w;
  }).filter(Boolean), [implicitSurfaces]);
  const exportPiercePoints = useCallback(async () => {
    const rows = piercePointRows(plannedHoles.map((hole) => ({ hole, pierces: surfacePierces(plannedHoleTrace(hole), pierceSurfaces) })));
    if (!rows.length) { setNotices((p) => [...p, notice("The planned holes cross none of the visible modelled surfaces.")]); return; }
    const base = `${(project.name || "project").replace(/[^\w\- ]/g, "")}_pierce_points`;
    const res = await saveFile({ quiet: "success", suggestedName: `${base}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(rows), encoding: "text" });
    if (res.ok) setNotices((p) => [...p, notice("Exported {n} pierce point(s) of the planned holes.", { n: rows.length })]);
  }, [plannedHoles, pierceSurfaces, project]);

  const exportPlannedHoles = useCallback(async (format = "csv") => {
    if (!plannedHoles.length) { setNotices((p) => [...p, notice("No planned drillholes to export yet.")]); return; }
    const { rigRows, rigKML, rigGPX } = await import("../lib/rigExport.js"); // TASKS.csv #397; loaded on first export (#476)
    const today = new Date().toISOString().slice(0, 10);
    const epsg = await ensureExportCrs(project); if (!epsg) return; // TASKS.csv #1021 — lat / lon and true / magnetic azimuths need the real CRS
    const rows = rigRows(plannedHoles, epsg, today, plannedHoleTrace);
    const base = `${(project.name || "project").replace(/[^\w\- ]/g, "")}_planned_holes`;
    const noLatLon = rows.filter((r) => r.lat === "").length;
    const noMag = rows.filter((r) => r.azimuth_magnetic === "").length;
    let res;
    if (format === "kml") res = await saveFile({ quiet: "success", suggestedName: `${base}.kml`, filters: [{ name: "KML", extensions: ["kml"] }], content: rigKML(rows, `${project.name || "GeoStrix"} planned holes`), encoding: "text" });
    else if (format === "gpx") res = await saveFile({ quiet: "success", suggestedName: `${base}.gpx`, filters: [{ name: "GPX", extensions: ["gpx"] }], content: rigGPX(rows), encoding: "text" });
    else res = await saveFile({ quiet: "success", suggestedName: `${base}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(rows), encoding: "text" });
    if (res.ok) setNotices((p) => [...p, notice("Exported {plannedHoles} planned hole(s) to {format}{v}.{v2}{v3}", { plannedHoles: plannedHoles.length, format: format.toUpperCase(), v: rows[0]?.declination_deg !== "" ? tr(" — magnetic azimuths use the IGRF-14 declination for {today} ({declination_deg}° at the first collar); recheck it if drilling is months away", { today, declination_deg: rows[0].declination_deg }) : "", v2: noLatLon ? tr(" {noLatLon} hole(s) have no latitude/longitude (project CRS not convertible) and are missing from KML/GPX.", { noLatLon }) : "", v3: noMag && !noLatLon ? tr(" {noMag} hole(s) have no magnetic azimuth.", { noMag }) : "" })]);
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

  // ---------- TASKS.csv #551 — assay spheres, geophysics points and surface samples: their own builders ----------
  // These used to be built inside the big rebuild effect below, which listed assayStyle, the assay element picks,
  // the four geophysics legend settings and surface-sample visibility as dependencies — so changing one assay
  // colour or dragging a geophysics legend stop disposed and re-desurveyed EVERY drillhole and rebuilt every
  // litho / alteration / vein tube. Each builder clears and batches only its own group, from the traces
  // (tracesRef) and origin (originRef) the big effect last built. The big effect calls all three at the end of a
  // real rebuild; each small effect re-runs its builder only when its own inputs change (and skips the first run
  // after the big effect already built with the same inputs).
  const sameInputs = (a, b) => !!a && a.length === b.length && a.every((v, i) => v === b[i]);
  const clearGroup = (g) => { if (!g) return; while (g.children.length) { const c = g.children.pop(); if (!c.geometry?.userData?.sharedProto) c.geometry?.dispose?.(); c.material?.map?.dispose?.(); c.material?.dispose?.(); c.dispose?.(); } };
  const assayInputs = [assays, assayDisplayElements, assayStyle, assayElements, assayVisible, collars];
  const assayBuiltRef = useRef(null);
  const buildAssaySpheres = () => {
    const g = layerGroupsRef.current.assay;
    if (!g) return;
    assayBuiltRef.current = assayInputs;
    clearGroup(g);
    if (!assayVisible || !assayDisplayElements.length || !collars.length) return;
    const elementUnits = Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit]));
    const byHole = new Map();
    assays.forEach((a) => { if (!a.hole_id || isMarkedQcRow(a)) return; let arr = byHole.get(a.hole_id); if (!arr) byHole.set(a.hole_id, (arr = [])); arr.push(a); }); // #601 — a standard's grade is not the rock's
    // one size range PER element across all holes (Au in g/t and Cu in % share no scale); p50/p90 for #306's quantile sizes
    const ranges = {};
    assayDisplayElements.forEach((sym) => {
      const vals = assays.filter((a) => a.values[sym] != null).map((a) => a.values[sym]);
      const finite = vals.filter(Number.isFinite).sort((x, y) => x - y);
      const q = (pp) => (finite.length ? finite[Math.min(finite.length - 1, Math.floor(pp * (finite.length - 1)))] : undefined);
      ranges[sym] = { ...minMax(vals), p50: q(0.5), p90: q(0.9) };
    });
    const traceOf = new Map(tracesRef.current.map((t) => [t.hole_id, t.pts]));
    const n = assayDisplayElements.length;
    const errors = [];
    collars.forEach((c) => {
      const pts = traceOf.get(c.hole_id);
      if (!pts?.length) return;
      try {
        // each selected element: its own hue and a small radial offset around the trace, so Au / Cu / Zn at one
        // depth stay separately visible (one element: no offset)
        assayDisplayElements.forEach((sym, idx) => {
          const style = assayStyle[sym];
          const angle = (2 * Math.PI * idx) / n;
          const offX = n > 1 ? Math.cos(angle) * 2.2 : 0, offZ = n > 1 ? Math.sin(angle) * 2.2 : 0;
          (byHole.get(c.hole_id) || []).forEach((a) => {
            const v = a.values[sym];
            if (v == null || !assayPassesCutoff(v, style)) return;
            const pt = findOnTrace(pts, (a.from + a.to) / 2);
            if (!pt) return;
            // #312 — shared prototype + scale; #649 — the element's chosen shape and opacity
            const op = style?.opacity ?? 1, shape = style?.shape || "sphere";
            const mesh = new THREE.Mesh(POINT_PROTO[shape] || PROTO_SPHERE_10, new THREE.MeshLambertMaterial({ color: assayColorFor(v, idx, style), transparent: op < 1, opacity: op, side: shape === "disc" ? THREE.DoubleSide : THREE.FrontSide }));
            mesh.scale.setScalar(assaySizeFor(v, ranges[sym], style)); // #306
            mesh.position.set(pt.x + offX, pt.y, pt.z + offZ);
            mesh.userData = { tip: `${c.hole_id}\n${sym}: ${v} ${elementUnits[sym] || ""}\n${a.from.toFixed(0)}–${a.to.toFixed(0)} m` };
            g.add(mesh);
          });
        });
      } catch (err) { errors.push(`${c.hole_id}: ${err.message}`); }
    });
    buildLayerBatches(g);
    if (errors.length) setNotices((pv) => [...pv, errorNotice(tr("{errors} hole(s) failed to draw assay markers: {v}", { errors: errors.length, v: errors.slice(0, 3).join(" · ") }))]);
  };
  const buildAssaySpheresRef = useRef(buildAssaySpheres);
  buildAssaySpheresRef.current = buildAssaySpheres;

  const geophysInputs = [layers.geophys_pts, geophysSurveys, geophysPtsStops, geophysPtsColorMode, geophysPtsMin, geophysPtsMax, isRowVisibleForBuild, layerStyles.geophys_pts]; // #635 style
  const geophysBuiltRef = useRef(null);
  const buildGeophysPts = () => {
    const g = layerGroupsRef.current.geophys_pts;
    if (!g) return;
    geophysBuiltRef.current = geophysInputs;
    clearGroup(g);
    // scene x = world x - ox, scene y = elevation - oz, scene z = -(northing - oy): the drillholes' convention
    const { x: ox, y: oy, z: oz } = originRef.current;
    const rows = (layers.geophys_pts || []).filter((r) => Number.isFinite(r.z) && isRowVisibleForBuild("geophys_pts", r)); // #431; #365 — no elevation = not drawn
    if (!rows.length) return;
    const colorer = makeSurveyColorer(rows, { stops: geophysPtsStops, colorMode: geophysPtsColorMode, min: geophysPtsMin, max: geophysPtsMax }); // #451 — per survey when several; #122 class breaks
    const errors = [];
    const st = resolveLayerStyle(layerStyles.geophys_pts, "point"); // TASKS.csv #635
    const proto = st.shape === "sphere" ? PROTO_SPHERE_8 : POINT_PROTO[st.shape];
    rows.forEach((row) => {
      try {
        const { color: c0, t } = colorer.colorOf(row);
        const color = st.color || c0;
        const mesh = new THREE.Mesh(proto, new THREE.MeshLambertMaterial({ color, transparent: st.opacity < 1, opacity: st.opacity, side: st.shape === "disc" ? THREE.DoubleSide : THREE.FrontSide })); // #312
        mesh.scale.setScalar((1.4 + 2.8 * t) * st.size);
        mesh.position.set(row.x - ox, row.z - oz, -(row.y - oy));
        mesh.userData = { tip: `${row._src || "Geophysics point"}${row.line != null ? ` · line ${row.line}` : ""}${row.fid != null ? ` · fid ${row.fid}` : ""}\n${row.label || "value"}: ${row.value}${geophysSurveys?.[row._src]?.units ? ` ${geophysSurveys[row._src].units}` : ""}\n${row.x.toFixed(0)}E ${row.y.toFixed(0)}N ${row.z.toFixed(0)}Z` };
        g.add(mesh);
      } catch (err) { errors.push(err.message); }
    });
    buildLayerBatches(g);
    if (errors.length) setNotices((pv) => [...pv, errorNotice(tr("{errors} geophysics point(s) failed to render: {v}", { errors: errors.length, v: errors.slice(0, 3).join(" · ") }))]);
  };
  const buildGeophysPtsRef = useRef(buildGeophysPts);
  buildGeophysPtsRef.current = buildGeophysPts;

  const surfaceInputs = [placedSurfaceSamples, layerVisible.surface_samples, layerStyles.surface_samples, surfaceAnomaly]; // #635 style, #843 anomaly map
  const surfaceBuiltRef = useRef(null);
  const buildSurfaceSamples = () => {
    const g = layerGroupsRef.current.surface_samples;
    if (!g) return;
    surfaceBuiltRef.current = surfaceInputs;
    clearGroup(g);
    // #228 — soil / rock-chip / stream-sediment samples, coloured by medium (one gradient would blend the media)
    if (!layerVisible.surface_samples || !placedSurfaceSamples.length) return;
    const { x: ox, y: oy, z: oz } = originRef.current;
    const errors = [];
    const st = resolveLayerStyle(layerStyles.surface_samples, "point"); // TASKS.csv #635
    const proto = st.shape === "sphere" ? PROTO_SPHERE_8 : POINT_PROTO[st.shape];
    const an = surfaceAnomaly; // #843
    // TASKS.csv #849 — a symbol in proportion to the program's extent: a fixed 1.8 m sphere is a fraction of a pixel over a
    // 20-30 km stream-sediment program (ARIS 42807Z: 21 x 28 km, nothing visible). 1.8 m stays the minimum (a soil grid
    // of ~1 km keeps its look within a few pixels); 1/250 of the extent's diagonal otherwise (~5-7 px across when the whole program fills the view).
    const sx = minMax(placedSurfaceSamples, (p) => p.x), sy = minMax(placedSurfaceSamples, (p) => p.y);
    const baseR = Math.max(1.8, Math.hypot(sx.max - sx.min, sy.max - sy.min) / 250);
    placedSurfaceSamples.forEach((row, i) => {
      try {
        const cl = an ? an.classOf[i] : -2;
        const color = an ? (cl >= 0 ? an.classes[cl].color : an.noDataColor) : (st.color || colorForMedium(row.medium));
        const mesh = new THREE.Mesh(proto, new THREE.MeshLambertMaterial({ color, transparent: st.opacity < 1, opacity: st.opacity, side: st.shape === "disc" ? THREE.DoubleSide : THREE.FrontSide })); // #312
        mesh.scale.setScalar(baseR * st.size * (an?.isolated[i] ? 0.55 : 1)); // #843 — an isolated anomaly is drawn small; #849 size
        mesh.position.set(row.x - ox, row.z - oz, -(row.y - oy));
        mesh.userData = { tip: surfaceSampleTip(row) + (an ? `\n${cl >= 0 ? tr(an.classes[cl].label) : tr("no value")}${an.isolated[i] ? ` · ${tr("isolated anomaly")}` : ""}` : "") };
        g.add(mesh);
      } catch (err) { errors.push(err.message); }
    });
    buildLayerBatches(g);
    if (errors.length) setNotices((pv) => [...pv, errorNotice(tr("{errors} surface sample(s) failed to render: {v}", { errors: errors.length, v: errors.slice(0, 3).join(" · ") }))]);
  };
  const buildSurfaceSamplesRef = useRef(buildSurfaceSamples);
  buildSurfaceSamplesRef.current = buildSurfaceSamples;

  // ---------- rebuild all geometry ----------
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups.litho) return;
    // TASKS.csv #131 — c.material?.map?.dispose?.() added alongside the existing geometry/material
    // disposal: every OTHER mesh type built into these groups uses a plain color-only material (no
    // .map), so this was a harmless no-op for all of them, but hole-label Sprites use a CanvasTexture
    // (SpriteMaterial.map) that this loop would otherwise leak — a growing, uncollectable GPU texture
    // per rebuild — since disposing the material alone does not dispose a texture it merely references.
    // TASKS.csv #312 — two additions: shared prototype geometries (PROTO_CYLINDER etc.) must NOT be
    // disposed here, since every future rebuild and every other layer still references them, and an
    // InstancedMesh batch needs its own .dispose() to release its instance buffers (disposing the
    // geometry/material alone would not, and the geometry is a shared prototype anyway).
    Object.values(groups).forEach((g) => { while (g.children.length) { const c = g.children.pop(); if (!c.geometry?.userData?.sharedProto) c.geometry?.dispose?.(); c.material?.map?.dispose?.(); c.material?.dispose?.(); c.dispose?.(); } });
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
        if (!placedSurfaceSamples.length) return null;
        const sxr = minMax(placedSurfaceSamples, (p) => p.x), syr = minMax(placedSurfaceSamples, (p) => p.y);
        return [sxr.min, syr.min, sxr.max, syr.max];
      })();
      // TASKS.csv #316/#317 — a map-layer-only or outcrop-structure-only project (mapping before any
      // drilling) has the same off-screen risk; both carry world coordinates.
      const mapLayersBbox = (() => {
        const bbs = (mapLayers || []).map((l) => l.bbox).filter(Boolean);
        (surfaceStructures || []).forEach((st) => {
          if (!st.rows?.length) return;
          const xr = minMax(st.rows, (r) => r.x), yr = minMax(st.rows, (r) => r.y);
          bbs.push([xr.min, yr.min, xr.max, yr.max]);
        });
        if (!bbs.length) return null;
        return [arrMin(bbs.map((b) => b[0])), arrMin(bbs.map((b) => b[1])), arrMax(bbs.map((b) => b[2])), arrMax(bbs.map((b) => b[3]))];
      })();
      const anchorBbox = terrain?.bbox || rasters?.[0]?.bbox || boundaryBbox || omfBbox || geophysPtsBbox || surfaceSamplesBbox || mapLayersBbox || null;
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
        } else if (surfaceSamplesBbox && placedSurfaceSamples.length) {
          const zr = minMax(placedSurfaceSamples, (p) => p.z);
          ezMin = zr.min; ezMax = zr.max;
        }
        originRef.current = { x: ox, y: oy, z: (ezMin + ezMax) / 2 };
        syncImplicitOrigin(); // #407
        const { x: rox, y: roy, z: roz } = originRef.current;
        const box = new THREE.Box3(
          new THREE.Vector3(bxmin - rox, ezMin - roz, -(bymax - roy)),
          new THREE.Vector3(bxmax - rox, ezMax - roz, -(bymin - roy)),
        );
        fitBox(box, 1.3);
      }
      // TASKS.csv #312 — this no-collars branch builds geophys_pts/surface_samples itself and then
      // returns before the main path's own buildLayerBatches pass at the end of this effect, so it
      // has to batch what it just built or a collar-less project (a standalone geophysics survey or
      // soil-sample grid, which can easily be thousands of point markers) would keep paying one draw
      // call per point. Same call, same semantics as the main path's.
      Object.values(layerGroupsRef.current).forEach((g) => { if (g) buildLayerBatches(g); });
      // TASKS.csv #551 — geophysics points and surface samples are built by their own builders (below the
      // big effect's own groups), here for a project with no drillholes yet
      buildGeophysPtsRef.current(); buildSurfaceSamplesRef.current(); buildAssaySpheresRef.current();
      return;
    }

    const ox = collars.reduce((s, c) => s + c.x, 0) / collars.length;
    const oy = collars.reduce((s, c) => s + c.y, 0) / collars.length;
    const oz = collars.reduce((s, c) => s + c.z, 0) / collars.length;
    originRef.current = { x: ox, y: oy, z: oz };
    syncImplicitOrigin(); // #407 — re-base surfaces/solids built against an earlier origin

    const allTraces = [];

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
      recovery: groupByHole(layers.recovery), sg: groupByHole(layers.sg), breccia: groupByHole(layers.breccia), structzone: groupByHole(layers.structzone), // #608, #604
    };
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
      const numeric = (rows || []).filter((r) => isRowVisibleForBuild(groupKey, r)).map((r) => r.value).filter((v) => typeof v === "number" && !isNaN(v));
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

      if (!collarMaterialRef.current) collarMaterialRef.current = new THREE.MeshBasicMaterial({ color: collarColorFor(bgColorRef.current) }); // #378
      const marker = new THREE.Mesh(PROTO_SPHERE_12, collarMaterialRef.current); // TASKS.csv #312 — shared prototype + scale (was SphereGeometry(3.2, 12, 12))
      marker.scale.setScalar(3.2);
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
      const buildIntervalTube = (groupKey, opt = {}) => { // opt (#684): { filter, meta } — a point layer drawing its real intervals
        const meta = { ...LAYER_META[groupKey], ...(opt.meta || {}) };
        const st = resolveLayerStyle(layerStyles[groupKey], "interval", { opacity: meta.opacity }); // TASKS.csv #635
        const radius = meta.radius * st.size;
        (rowsByHole[groupKey]?.get(c.hole_id) || []).filter((r) => isRowVisibleForBuild(groupKey, r) && (!opt.filter || opt.filter(r))).forEach((row) => {
         try {
          if (!Number.isFinite(row.from) || !Number.isFinite(row.to)) return; // #613 — null (a blank "to" after a JSON round-trip) passed isNaN
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
            // TASKS.csv #312 — was a per-interval CylinderGeometry(radius, radius, len, 6, 1, false)
            // .translate(0, len/2, 0). Now the shared unit prototype (already translated the same
            // way) with the radius/length carried in .scale instead, which is what lets every
            // straight interval in a layer share ONE InstancedMesh draw call — see PROTO_CYLINDER
            // and buildLayerBatches. Same vertices, same placement; three.js raycasts in local
            // space, so picking is unchanged.
            geo = INTERVAL_PROTO[st.shape];
            const color = st.color || (meta.numeric ? numericIntervalColor(groupKey, row.value) : baseColorForBuild(groupKey, row.value));
            const mat = new THREE.MeshLambertMaterial({ color, transparent: st.opacity < 1, opacity: st.opacity });
            mesh_ = new THREE.Mesh(geo, mat);
            mesh_.scale.set(radius, len, radius);
            mesh_.position.set(p1.x, p1.y, p1.z);
            mesh_.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
          } else {
            const curve = new THREE.CatmullRomCurve3(vecs);
            geo = new THREE.TubeGeometry(curve, Math.max(2, vecs.length * 2), radius, TUBE_SEGMENTS[st.shape], false);
            const color = st.color || (meta.numeric ? numericIntervalColor(groupKey, row.value) : baseColorForBuild(groupKey, row.value));
            const mat = new THREE.MeshLambertMaterial({ color, transparent: st.opacity < 1, opacity: st.opacity });
            mesh_ = new THREE.Mesh(geo, mat);
          }
          const mesh = mesh_;
          const lbl = meta.numeric ? row.value : effectiveLabel(groupKey, row.value);
          // TASKS.csv #208 — surface a mapped Description column (litho's new optional field, or any
          // custom field named "description") in the hover tooltip alongside the other interval layers
          // that share this same tube-building path — harmless no-op for rows that don't have one.
          // TASKS.csv #227 (continuation) — catValue lets the post-hoc applyCategoryVisibility pass
          // (below) decide this mesh's .visible without needing the original row data.
          mesh.userData = { tip: `${c.hole_id}\n${meta.label}: ${lbl}${row.extra != null ? ` (${row.extra}${meta.extraSuffix || ""})` : ""}\n${row.from.toFixed(0)}–${row.to.toFixed(0)} m${row.intensity ? ` · intensity ${row.intensity}` : ""}${Number.isFinite(row.alpha) ? ` · alpha ${row.alpha}°` : ""}${row.description ? `\n${row.description}` : ""}`, catValue: row.value, ...(groupKey === "litho" ? { lithoRow: row } : {}) }; // lithoRow: TASKS.csv #599 picking
          groups[groupKey].add(mesh);
         } catch (err) { buildErrors.push(`${groupKey} ${c.hole_id} ${row.from}-${row.to}: ${err.message}`); }
        });
      };
      buildIntervalTube("litho");
      buildIntervalTube("alt");
      buildIntervalTube("vein");
      buildIntervalTube("breccia"); // #608
      buildIntervalTube("structzone"); // #604
      buildIntervalTube("geotech");
      buildIntervalTube("recovery");
      buildIntervalTube("sg");
      buildIntervalTube("litho_gc");
      buildIntervalTube("alt_gc");

      const buildPointMarkers = (groupKey, filter = null) => {
        const meta = LAYER_META[groupKey];
        const st = resolveLayerStyle(layerStyles[groupKey], "point"); // TASKS.csv #635
        const vals = (rowsByHole[groupKey]?.get(c.hole_id) || []).filter((r) => isRowVisibleForBuild(groupKey, r) && (!filter || filter(r)));
        const { min, max } = globalPointRanges[groupKey] || { min: 0, max: 0 };
        vals.forEach((row) => {
         try {
          const mid = (row.from + row.to) / 2;
          const p = findOnTrace(pts, mid);
          if (!p) return;
          const size = meta.numeric ? 1.6 + 3.5 * (max > min ? (row.value - min) / (max - min) : 0.3) : 2 + Math.min(3, (row.extra || 1) * 0.4);
          const color = st.color || (meta.numeric ? numericLayerColor(groupKey, row.value, { min, max }) : baseColorForBuild(groupKey, row.value));
          const mesh = new THREE.Mesh(POINT_PROTO[st.shape], new THREE.MeshLambertMaterial({ color, transparent: st.opacity < 1, opacity: st.opacity, side: st.shape === "disc" ? THREE.DoubleSide : THREE.FrontSide })); // TASKS.csv #312 — shared prototype + scale; #635 style
          mesh.scale.setScalar(size * st.size);
          mesh.position.set(p.x, p.y, p.z);
          const lbl = meta.numeric ? row.value : effectiveLabel(groupKey, row.value);
          mesh.userData = { tip: `${c.hole_id}\n${meta.label}: ${lbl}${row.extra != null ? ` (${row.extra}%)` : ""}\n@ ${mid.toFixed(0)} m`, catValue: row.value };
          groups[groupKey].add(mesh);
         } catch (err) { buildErrors.push(`${groupKey} ${c.hole_id}: ${err.message}`); }
        });
      };
      // TASKS.csv #684 — a mineralisation log can be an INTERVAL log (Woodjam: 958 rows over 1 m, up to 69 m long), and
      // each row used to become one sphere at its midpoint — a depth that is not in the data. Rows longer than half a
      // metre are drawn as intervals; point-style rows (from = to, as in Harry and the synthetic set) stay markers.
      buildIntervalTube("mnlgy", { filter: isIntervalRow, meta: { radius: 2.8, opacity: 0.85, extraSuffix: "%" } });
      buildPointMarkers("mnlgy", (r) => !isIntervalRow(r));
      buildPointMarkers("magsusc");

      const stStruct = resolveLayerStyle(layerStyles.structure, "plane", { opacity: 0.55 }); // TASKS.csv #635
      (rowsByHole.structure?.get(c.hole_id) || []).filter((s) => isRowVisibleForBuild("structure", s)).forEach((s) => {
        const p = findOnTrace(pts, s.depth);
        if (!p) return;
        // TASKS.csv #394 — a pick without a recorded dip AND dip direction is drawn as a small sphere on the
        // trace, NOT as a plane: it used to default to dip 45 / az 0 and the tooltip then presented
        // "dip 45° / az 0°" as if measured, so alpha-only or unoriented picks looked like real
        // north-dipping planes.
        const oriented = s.dip != null && !isNaN(s.dip) && s.azimuth != null && !isNaN(s.azimuth);
        const color = stStruct.color || baseColorForBuild("structure", s.value);
        if (!oriented) {
          const mark = new THREE.Mesh(PROTO_SPHERE_8, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: stStruct.opacity }));
          mark.scale.setScalar(2.2 * stStruct.size);
          mark.position.set(p.x, p.y, p.z);
          mark.userData = { tip: `${c.hole_id}\nStructure: ${effectiveLabel("structure", s.value)}\norientation not recorded (dip —)\n@ ${s.depth.toFixed(0)} m`, catValue: s.value };
          groups.structure.add(mark);
          return;
        }
        const dip = s.dip;
        const az = s.azimuth;
        const geo = stStruct.shape === "square" ? PROTO_SQUARE : PROTO_CIRCLE_24; // TASKS.csv #312 — shared prototype + scale (was CircleGeometry(6, 24)); #635 shape
        const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: stStruct.opacity < 1, opacity: stStruct.opacity });
        const disc = new THREE.Mesh(geo, mat);
        disc.scale.setScalar(6 * stStruct.size);
        disc.rotation.order = "YXZ";
        disc.rotation.x = Math.PI / 2 - toRad(dip);
        disc.rotation.y = -toRad(az);
        disc.position.set(p.x, p.y, p.z);
        const lbl = effectiveLabel("structure", s.value);
        disc.userData = { tip: `${c.hole_id}\nStructure: ${lbl}\ndip ${dip.toFixed(0)}° / az ${az.toFixed(0)}°\n@ ${s.depth.toFixed(0)} m`, catValue: s.value };
        groups.structure.add(disc);
      });

      customLayers.forEach((layer) => {
        const stI = resolveLayerStyle(layerStyles[`custom:${layer.id}`], "interval"), stP = resolveLayerStyle(layerStyles[`custom:${layer.id}`], "point"); // TASKS.csv #635
        // TASKS.csv #227 — geometry is now built regardless of customVisible (visibility is toggled
        // cheaply afterward via the layer's own group.visible, see the small effect near layerVisible's
        // own visibility effect) so this rebuild no longer needs to re-run every time a custom layer's
        // checkbox is toggled — see customVisible's removal from this effect's own dependency array.
        (customRowsByHoleByLayer.get(layer.id)?.get(c.hole_id) || []).forEach((row) => {
          if (row.to != null && !isNaN(row.to)) {
            const p1 = findOnTrace(pts, row.from), p2 = findOnTrace(pts, row.to);
            const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(p2.x, p2.y, p2.z)]);
            const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 2, 1.6 * stI.size, TUBE_SEGMENTS[stI.shape], false), new THREE.MeshLambertMaterial({ color: stI.color || row.modelColor || hashColor(row.value), transparent: stI.opacity < 1, opacity: stI.opacity })); // #323: a model's own colour; #635 style
            mesh.userData = { tip: `${c.hole_id}\n${layer.name}: ${row.value}\n${row.from.toFixed(0)}–${row.to.toFixed(0)} m` };
            layer.group.add(mesh);
          } else if (row.depth != null && !isNaN(row.depth)) {
            const p = findOnTrace(pts, row.depth);
            const mesh = new THREE.Mesh(POINT_PROTO[stP.shape], new THREE.MeshLambertMaterial({ color: stP.color || hashColor(row.value), transparent: stP.opacity < 1, opacity: stP.opacity, side: stP.shape === "disc" ? THREE.DoubleSide : THREE.FrontSide })); // TASKS.csv #312 — shared prototype + scale; #635 style
            mesh.scale.setScalar(2.4 * stP.size);
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

    // TASKS.csv #312 — every layer group is fully populated at this point, so collapse each group's
    // same-geometry/same-material families into InstancedMesh batches (see buildLayerBatches). This
    // must run BEFORE the applyCategoryVisibility/applyLegendOverrideColors calls below, since both
    // of those mirror their per-object changes into the batches they find.
    Object.values(layerGroupsRef.current).forEach((g) => { if (g) buildLayerBatches(g); });
    // TASKS.csv #551 — assay spheres, geophysics points and surface samples have their own builders (each clears and
    // batches only its own group): run them on the traces and origin just built
    buildAssaySpheresRef.current(); buildGeophysPtsRef.current(); buildSurfaceSamplesRef.current();

    lastTracesRef.current = allTraces;
    if (buildErrors.length) setNotices((p) => [...p, errorNotice(tr("{buildErrors} row(s) failed to render (skipped, rest of the model is unaffected): {v}{v2}", { buildErrors: buildErrors.length, v: buildErrors.slice(0, 3).join(" · "), v2: buildErrors.length > 3 ? "…" : "" }))]);
    if (allTraces.length) {
      if (!hasAutoFitRef.current) { autoFitInitial(allTraces); hasAutoFitRef.current = true; } // TASKS.csv #313 — fitView + a legibility clamp; see autoFitInitial
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
    setTracesSeq((n) => n + 1); // #888 — explicit-surface picks on holes follow the new traces
    // voxelModels here (see the comment above this effect): a mere visibility/opacity/legend toggle
    // must NOT re-trigger this effect's unconditional fitView() call and wipe out the user's pan/zoom.
    // applyCategoryVisibility/applyLegendOverrideColors are deliberately NOT listed either, for the
    // same reason categoryFilter/legendOverride were removed from this array — both are called
    // directly above using whatever this render closed over, not as re-trigger conditions.
  }, [collars, survey, desurveyMethod /* #135 — switching method must rebuild every trace */, layers, customLayers, numericRange, isRowVisibleForBuild, baseColorForBuild, effectiveLabel, numericLayerColor, fitView, layerStyles /* #635 */, anchorSourcesKey /* #435 — extents only, NOT terrain/rasters/boundaries/omfObjects themselves */, mapAnchorKey /* #316 — extents only, NOT mapLayers: a colour edit must not rebuild every drillhole */, voxelGeomSignature, fitBox, rebuildSeq, placedSurfaceSamples /* #606 — and the no-drillhole camera anchor */, holeLabelMode]); // #551: assay / geophysics-legend / surface-visibility inputs moved to their own builders
  // #551 — declared AFTER the big effect: when both fire, the big one builds first and these then see unchanged inputs
  useEffect(() => { if (!sameInputs(assayBuiltRef.current, assayInputs)) buildAssaySpheresRef.current(); }, assayInputs);
  useEffect(() => { if (!sameInputs(geophysBuiltRef.current, geophysInputs)) buildGeophysPtsRef.current(); }, geophysInputs);
  useEffect(() => { if (!sameInputs(surfaceBuiltRef.current, surfaceInputs)) buildSurfaceSamplesRef.current(); }, surfaceInputs);

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
      // TASKS.csv #52 (a) — a sensitivity-spread surface carries its per-vertex spread; recolour from it.
      const hasSpread = Array.isArray(s.spread) && s.spread.length === verts.length / 3;
      if (hasSpread) {
        const scaleMax = s.spreadScaleMax || 1;
        const cols = new Float32Array(s.spread.length * 3);
        s.spread.forEach((v, k) => {
          const c = v == null ? SPREAD_NOT_REPRODUCED : spreadColor(v / scaleMax);
          cols[k * 3] = c[0]; cols[k * 3 + 1] = c[1]; cols[k * 3 + 2] = c[2];
        });
        geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      }
      // TASKS.csv #977 — an explicit surface's extrapolated part, shaded from the hull saved with its parameters
      const shade = !hasSpread && s.params?.supportHull ? supportShadeFactors(verts, s.params.supportHull) : null;
      if (shade) geo.setAttribute("color", new THREE.BufferAttribute(shade, 3));
      const mat = new THREE.MeshLambertMaterial({
        color: hasSpread ? 0xffffff : (s.color ?? 0xc8a24a), vertexColors: hasSpread || !!shade, side: THREE.DoubleSide,
        transparent: true, opacity: s.opacity ?? 0.75,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = s.visible !== false;
      mesh.userData = { tip: `${s.name}\n${(verts.length / 3) | 0} vertices (restored from the project file)`, ...(s.params?.builtKey ? { builtKey: s.params.builtKey } : {}), ...(shade ? { shadeFactors: true } : {}) }; // builtKey: TASKS.csv #886
      group.add(mesh);
      implicitMeshesRef.current[s.id] = mesh;
      surfaceGeomCacheRef.current[s.id] = { uuid: geo.uuid, vertices: verts, indices: idx };
      const { vertices: _v, indices: _i, ...meta } = s;
      restored.push({ ...meta, visible: s.visible !== false });
    });
    surfaceHydrationRef.current = { seq: viewerUiStateSeq, installed: restored };
    setImplicitSurfaces(restored);
    if (restored.length) {
      setNotices((p) => [...p, notice(restored.length > 1 ? "Restored {restored} generated surfaces from the project file, with the parameters that produced them (see each surface's \"Parameters used\")." : "Restored {restored} generated surface from the project file, with the parameters that produced it (see its \"Parameters used\").", { restored: restored.length })]);
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
        // #491 — the flat typed-array walk: same numbers as sceneVertsToWorld + the 1 cm rounding, without a
        // [x, y, z] array per vertex (a 1M-face import spent ~260 ms here on the UI thread).
        const { vertices: flat, indices } = sceneVertsToWorldFlat(geo, o, r2);
        cached = { uuid: geo.uuid, vertices: flat, indices };
        surfaceGeomCacheRef.current[s.id] = cached;
      }
      return {
        ...s,
        ...surfaceBaseLook(mesh), // #636 — the surface's own look; a chosen style is saved separately (s.style)
        vertices: cached?.vertices || [],
        indices: cached?.indices || [],
      };
    });
    // Drop cache entries for surfaces that have been removed, so a long session doesn't hold onto the
    // world-coordinate copy of every mesh the user ever deleted.
    const live = new Set(implicitSurfaces.map((s) => s.id));
    Object.keys(surfaceGeomCacheRef.current).forEach((id) => { if (!live.has(id)) delete surfaceGeomCacheRef.current[id]; });
    setGeneratedSurfaces((prev) => (!payload.length && !(prev || []).length ? prev : payload)); // #478 — no [] over [] at startup
    // DEPS ARE [implicitSurfaces] ONLY, AND THAT IS load-bearing — verified live, not reasoned about.
    // Adding viewerUiStateSeq here (which looks harmless, since the guard above reads it) breaks the
    // restore path: opening a project bumps the seq, so this effect fires in the SAME commit as the
    // hydration effect above, at which point `implicitSurfaces` is still the OUTGOING project's list —
    // it passed both guards and wrote an empty list over the surfaces that had just been loaded from
    // the file. Symptom is nasty and quiet: the restored surfaces render correctly, but the store's
    // copy is empty, so the NEXT save silently drops them. With deps of [implicitSurfaces] alone this
    // effect can only ever run after hydration has already replaced that array, where the identity
    // guard above catches it.
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
    if (!implicitSurfaces.length) { setNotices((p) => [...p, notice("No generated surfaces to check yet.")]); return; }
    setTopologyBusy(true);
    // Deferred a tick so the "Checking..." state actually paints before a multi-second check on large
    // meshes blocks the main thread — same pattern the modelling tools use for their own busy state.
    setTimeout(async () => {
      try {
        const { checkTopology } = await import("../lib/topology.js"); // #90; loaded on first use (#476)
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
          setNotices((p) => [...p, notice("Nothing to check: none of the {surfacesChecked} surface(s) declare a relationship that implies a geometric constraint. Declare \"is below\" / \"is above\" / \"must not cross\" on a surface (expand its row) and run this again.", { surfacesChecked: res.surfacesChecked })]);
        } else if (!res.violations.length) {
          setNotices((p) => [...p, notice("Topology check passed: {checked} check(s) across {surfacesChecked} surface(s), no violations.{v}", { checked: res.checked, surfacesChecked: res.surfacesChecked, v: res.skipped ? tr(" {skipped} declared relationship(s) skipped — either the target surface no longer exists, or the relationship (truncates / terminates against / cuts) is one where an intersection is expected and so has nothing to violate.", { skipped: res.skipped }) : "" })]);
        } else {
          setNotices((p) => [...p, notice("Topology check found {violations} violation(s) in {checked} check(s):", { violations: res.violations.length, checked: res.checked }), ...res.violations.map((v) => `  • ${v.message}`)]);
        }
      } catch (err) {
        setNotices((p) => [...p, errorNotice(tr("Topology check failed: {message}", { message: err.message }))]);
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
    if (!hostMesh || !cutMesh) { setNotices((p) => [...p, notice("Cross-cut failed: one of the two surfaces has no mesh in the scene.")]); return; }
    const geoOf = (m) => ({ positions: m.geometry?.attributes?.position?.array || [], indices: m.geometry?.index?.array || [] });
    setCrossCutBusy(true);
    setTimeout(async () => {
      try {
        const { truncateAgainstSolid, splitAcrossSurface } = await import("../lib/crosscut.js"); // #52 (d); loaded on first use (#476)
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
            setNotices((p) => [...p, notice("\"{name}\" does not divide \"{name2}\": {v}. Nothing was changed.", { name: cutter.name, name2: host.name, v: sp.reason === "no-overlap" ? tr("the two surfaces are nowhere near each other") : tr("the whole surface falls on one side of it") })]);
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
                tool: "fault block split" /* TASKS.csv #52 */, derivedFrom: host.name, fault: cutter.name, block: sense,
                triangles: Math.floor(part.indices.length / 3), components: sense === "+" ? sp.stats.positiveComponents : sp.stats.negativeComponents,
                edgesBeyondTheFaultTip: sp.stats.unresolvedEdges,
                note: tr("Geometry only: the surface is divided where the fault mesh cuts it. NO fault displacement is applied — the blocks are not offset along the fault, because no slip has been measured here."),
                sourceParams: host.params || null, generatedAt: new Date().toISOString(),
              },
            };
          };
          const a = stamp(sp.positive, "block (+ side of fault)", "+");
          const b = stamp(sp.negative, "block (− side of fault)", "-");
          hostMesh.visible = false;
          setImplicitSurfaces((p) => [...p.map((s) => (s.id === hostId ? { ...s, visible: false } : s)), a, b]);
          setNotices((p) => [...p, notice("Split \"{name}\" along fault \"{name2}\": {faceCount} + {faceCount2} triangles in two blocks. The original surface is kept but hidden, so nothing is lost. NO displacement has been applied — the blocks are exactly where the surface already was, just separated at the fault.", { name: host.name, name2: cutter.name, faceCount: a.faceCount.toLocaleString(), faceCount2: b.faceCount.toLocaleString() })]);
          if (sp.stats.unresolvedEdges > 0) {
            setNotices((p) => [...p, notice("\"{name}\" does not span the whole of \"{name2}\": {unresolvedEdges} edge(s) change sides beyond the fault's own extent, where it has no surface to cut against. Those triangles were left whole and assigned to the block holding most of their corners rather than cut at an invented position, so read the division as approximate near the fault's tip.", { name: cutter.name, name2: host.name, unresolvedEdges: sp.stats.unresolvedEdges })]);
          }
          return;
        }
        if (!res.ok) { setNotices((p) => [...p, errorNotice(tr("Cross-cut failed ({reason}).", { reason: res.reason }))]); return; }
        if (!res.changed) {
          setNotices((p) => [...p, notice("\"{name}\" does not cut \"{name2}\" — {v}. Nothing was changed, which is the correct result: a dyke that stops short of a contact does not truncate it.", { name: cutter.name, name2: host.name, v: res.reason === "no-overlap" ? tr("the two bodies do not even overlap in space") : tr("no part of the surface falls inside it") })]);
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
        setNotices((p) => [...p, notice("Truncated \"{name}\" against \"{name2}\": {v} triangle(s) removed and {v2} cut at the contact, leaving {v3}. {v4} Its open edge went from {v5} m to {v6} m.", { name: host.name, name2: cutter.name, v: fmt(st.trianglesDropped), v2: fmt(st.trianglesClipped), v3: fmt(faceCount), v4: st.componentsAfter > st.componentsBefore ? tr("The body cuts right through it — the surface is now {componentsAfter} separate pieces (was {componentsBefore}).", { componentsAfter: st.componentsAfter, componentsBefore: st.componentsBefore }) : tr("The surface is still {componentsAfter} connected piece(s), so the cut is a notch rather than a full severance.", { componentsAfter: st.componentsAfter }), v5: fmt(st.boundaryLengthBeforeM), v6: fmt(st.boundaryLengthAfterM) })]);
        setNotices((p) => [...p, notice("The truncation is not re-run automatically: regenerating either surface produces a fresh, untruncated mesh, and the cut has to be applied again. What was cut is recorded in \"{name}\"'s Parameters used.", { name: host.name })]);
      } catch (err) {
        setNotices((p) => [...p, errorNotice(tr("Cross-cut failed: {message}", { message: err.message }))]);
      } finally {
        setCrossCutBusy(false);
      }
    }, 40);
  }, [implicitSurfaces]);

  // ---------- rebuild raster drapes (TASKS.csv #24, #81) ----------
  // moved to lib/viewer/sceneBuilders.js syncRasterDrapes (TASKS.csv #693); its comments explain the build
  useEffect(() => { if (rasterGroupRef.current) syncRasterDrapes(rasterGroupRef.current, rasterMeshesRef.current, rasters, { origin: originRef.current, terrain, renderer: rendererRef.current }); }, [rasters, collars, terrain, rebuildSeq]);

  // ---------- rebuild boundary polylines (Geosoft .ply import) ----------
  // moved to lib/viewer/sceneBuilders.js syncBoundaries (TASKS.csv #693); its comments explain the build
  useEffect(() => { if (boundaryGroupRef.current) syncBoundaries(boundaryGroupRef.current, boundaryLinesRef.current, boundaries, { origin: originRef.current, terrain }); }, [boundaries, collars, terrain, rebuildSeq]);

  // ---------- rebuild draped map layers (TASKS.csv #316) ----------
  // moved to lib/viewer/sceneBuilders.js syncMapLayers (TASKS.csv #693); its comments explain the build
  useEffect(() => { if (mapLayerGroupRef.current) syncMapLayers(mapLayerGroupRef.current, mapLayerMeshesRef.current, mapLayers, { origin: originRef.current, terrain, renderer: rendererRef.current }); }, [mapLayers, collars, terrain, rebuildSeq]);

  // ---------- georeferenced section images (TASKS.csv #630) ----------
  // moved to lib/viewer/sceneBuilders.js syncSectionImages (TASKS.csv #693); its comments explain the build
  // TASKS.csv #824 — while a section image is being digitized, the other section images are hidden (one standing in front
  // of it would cover the part being drawn)
  const [digitizeImageId, setDigitizeImageId] = useState(null);
  useEffect(() => {
    if (sectionImageGroupRef.current) syncSectionImages(sectionImageGroupRef.current, sectionImageMeshesRef.current, sectionImages, { origin: originRef.current, renderer: rendererRef.current, onTextureLoad: () => { lastActivityRef.current = Date.now(); } });
    if (digitizeImageId) Object.entries(sectionImageMeshesRef.current).forEach(([id, m]) => { if (id !== digitizeImageId) m.visible = false; });
    lastActivityRef.current = Date.now();
  }, [sectionImages, collars, rebuildSeq, digitizeImageId]);

  // ---------- rebuild surface structure symbols (TASKS.csv #317) ----------
  // moved to lib/viewer/sceneBuilders.js syncSurfaceStructures (TASKS.csv #693); its comments explain the build
  useEffect(() => { if (surfStructGroupRef.current) syncSurfaceStructures(surfStructGroupRef.current, surfStructObjsRef.current, surfaceStructures, { origin: originRef.current, terrain }); }, [surfaceStructures, collars, terrain, rebuildSeq]);

  // ---------- rebuild OMF objects (TASKS.csv — Open Mining Format import) ----------
  // moved to lib/viewer/sceneBuilders.js syncOmfObjects (TASKS.csv #693); its comments explain the build
  useEffect(() => { if (omfGroupRef.current) syncOmfObjects(omfGroupRef.current, omfMeshesRef.current, omfObjects, { origin: originRef.current }); }, [omfObjects, collars, rebuildSeq]);

  // ---------- rebuild terrain surface (TASKS.csv #77) ----------
  // moved to lib/viewer/sceneBuilders.js syncTerrain (TASKS.csv #693); its comments explain the build
  useEffect(() => { if (terrainGroupRef.current) terrainMeshRef.current = syncTerrain(terrainGroupRef.current, terrainMeshRef.current, terrain, { origin: originRef.current }); }, [terrain, collars, rebuildSeq]);

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
        mesh.dispose?.(); // TASKS.csv #433 — an InstancedMesh's instance buffers are only freed by its own dispose()
        delete voxelMeshesRef.current[id];
      }
    });
    const { x: ox, y: oy, z: oz } = originRef.current;
    const tmpMatrix = new THREE.Matrix4();
    const tmpColor = new THREE.Color();
    const sliceOn = !!slice3d.on; // TASKS.csv #793 — the exposed-face mesh is only used without a 3D slice
    voxelModels.forEach((model) => {
      const prev = voxelMeshesRef.current[model.id];
      // TASKS.csv #696 — a display-only change (opacity within the transparent range, visibility, name) is applied to
      // the existing mesh. Every model used to be rebuilt on every opacity-slider tick: 539 ms and a 72 MB instance
      // upload per tick for a 1M-cell model, and every OTHER model in the project rebuilt with it.
      if (prev && prev.userData.srcModel && voxelGeometryUnchanged(prev.userData.srcModel, model) && prev.userData.origin === `${ox},${oy},${oz}` && prev.userData.sliceOn === sliceOn) { // sliceOn: #793
        const op = model.opacity ?? 0.85;
        prev.material.opacity = op;
        prev.visible = model.visible !== false;
        prev.userData.srcModel = model;
        return;
      }
      // Otherwise rebuilt from scratch (see comment above) — dispose any previous instance of this model.
      // TASKS.csv #433 — prev.dispose() too: in three r160 the instanceMatrix/instanceColor GPU buffers are
      // released only by InstancedMesh's own 'dispose' event, so every opacity drag, threshold change or
      // visibility toggle (all rebuild this effect) leaked ~7.6 MB per 100k-cell model on the shared-RAM iGPU.
      if (prev) { group.remove(prev); prev.geometry.dispose(); prev.material.dispose(); prev.dispose?.(); delete voxelMeshesRef.current[model.id]; }

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
      const cells = model.cells.filter((c) => c.value >= threshold && c.value <= rangeMax && voxelCellSupported(model, c));
      if (!cells.length) return;

      const opacity = model.opacity ?? 0.85;
      // TASKS.csv #793 — an OPAQUE model on a rectilinear grid (regular, or a tensor mesh): one mesh of its exposed faces (lib/voxelFaces.js), a
      // fraction of the instanced boxes' triangles (a solid 100^3 model: 120k instead of 12M). Same colours and
      // lighting; nothing reads per-instance ids from voxel meshes (they are not pick targets with tooltips).
      // Not while a 3D slice is on: the face mesh is hollow, so a cut through it would show an empty inside where the
      // boxes show the blocks behind the cut.
      const bigTransparent = opacity < 1 && cells.length > TRANSPARENT_BOX_LIMIT; // #904
      if ((opacity >= 1 || bigTransparent) && !sliceOn) {
        const G = voxelGridOf(model);
        const fm = G ? buildExposedFaces(cells, G, { x: ox, y: oy, z: oz }, makeVoxelColorResolverRGB(model), { boundaries: bigTransparent && model.colorMode === "discrete" }) : null;
        if (fm) {
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(fm.positions, 3));
          g.setAttribute("normal", new THREE.BufferAttribute(fm.normals, 3));
          g.setAttribute("color", new THREE.BufferAttribute(fm.colors, 3));
          g.setIndex(new THREE.BufferAttribute(fm.indices, 1));
          // #904 — transparent: blended without a per-frame sort (one mesh of faces), both sides drawn so the far skin shows
          const fmesh = new THREE.Mesh(g, bigTransparent ? new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ vertexColors: true }));
          fmesh.visible = model.visible !== false;
          fmesh.userData.transparentCells = null;
          fmesh.userData.srcModel = model;
          fmesh.userData.origin = `${ox},${oy},${oz}`;
          fmesh.userData.exposedFaces = { faces: fm.faces, cells: cells.length, transparent: bigTransparent };
          fmesh.userData.sliceOn = sliceOn;
          group.add(fmesh);
          voxelMeshesRef.current[model.id] = fmesh;
          return;
        }
      }
      const geometry = new THREE.BoxGeometry(1, 1, 1);
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
      mesh.userData.srcModel = model; // #696
      mesh.userData.origin = `${ox},${oy},${oz}`;
      mesh.userData.sliceOn = sliceOn; // #793
      group.add(mesh);
      voxelMeshesRef.current[model.id] = mesh;
    });
  }, [voxelModels, collars, slice3d.on]); // slice3d.on: #793

  // TASKS.csv #188 — planned drillholes (drillhole planning/targeting module). A planned hole has no
  // downhole survey (it hasn't been drilled yet) — just a collar plus a single design azimuth/dip/
  // length, which is EXACTLY the "no survey stations" branch desurveyHole already supports (see its
  // own comment: "no survey stations -> straight line from collar.azimuth/dip/length"), so this reuses
  // that shared math verbatim rather than re-deriving a straight-line trajectory here. Rendered
  // distinctly from real (drilled) holes — dashed line (LineDashedMaterial, matches the common
  // industry convention of drawing planned/proposed holes dashed on a section) in a bright cyan that
  // doesn't collide with any lithology/alteration/vein color already in use, plus a small diamond-
  // shaped toe marker so the hole's endpoint (not just its direction) is visible at a glance.
  // TASKS.csv #519 — the strings digitised on sections (contacts, faults, free strings) as thin 3D lines at their real
  // x / y / z: before, they were only visible in their own section window (and in the CSV / DXF exports).
  useEffect(() => {
    const group = sectionStringsGroupRef.current;
    if (!group) return;
    group.children.slice().forEach((ch) => { group.remove(ch); ch.geometry?.dispose(); ch.material?.dispose(); });
    if (!showSectionStrings) return;
    const { x: ox, y: oy, z: oz } = originRef.current;
    (sections || []).forEach((s) => (s.contacts || []).forEach((c) => {
      const pts = (c.points || []).filter((p) => [p.x, p.y, p.z].every(Number.isFinite)).map((p) => new THREE.Vector3(p.x - ox, p.z - oz, -(p.y - oy)));
      if (pts.length < 2) return;
      if (c.kind === "outline") pts.push(pts[0].clone()); // #570 — a closed loop
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(c.color || "#e2a63c"), depthTest: true }));
      line.userData = { tip: `${c.unit} (${c.kind === "fault" ? "fault" : c.kind === "string" ? "string" : "upper contact"})\nsection: ${s.name}\n${pts.length} vertices` };
      group.add(line);
    }));
  }, [sections, showSectionStrings]);

  // TASKS.csv #1011 — Matt: "have the cross section display as on the 3d view so I can see it when looking from top. Have
  // it display as a thick line". Each saved section's line A -> B as a flat ribbon (WebGL draws every line 1 px wide, so a
  // thick line is a strip of triangles), laid on the terrain where there is one (2 m above it), else 2 m above the
  // median collar elevation, drawn over everything so it stays visible from above and through the model. Its width follows the
  // section's length (0.6 %, at least 4 m), so it reads at the scale the section is seen at. Labelled by its tooltip.
  useEffect(() => {
    const group = sectionLinesGroupRef.current;
    if (!group) return;
    group.children.slice().forEach((ch) => { group.remove(ch); ch.geometry?.dispose(); ch.material?.dispose(); });
    if (!showSectionLines || !(sections || []).length) return;
    const { x: ox, y: oy, z: oz } = originRef.current;
    // without a terrain, flat at the median collar elevation: a median, because one outlying high collar (Harry's 1,468 m
    // against 1,077-1,160 m) lifted a max-based line ~300 m above the holes and perspective pushed it off screen; flat,
    // because following the nearest collars made it step up and down
    const czs = (collars || []).map((c) => c.z).filter(Number.isFinite).sort((u, v) => u - v);
    const flatZ = czs.length ? czs[czs.length >> 1] : oz;
    (sections || []).forEach((sct) => {
      const { ax, ay, bx, by } = sct;
      if (![ax, ay, bx, by].every(Number.isFinite)) return;
      const L = Math.hypot(bx - ax, by - ay);
      if (!(L > 0)) return;
      const width = Math.max(6, L * 0.02), ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy, ny = ux;
      const n = Math.max(2, Math.min(200, Math.ceil(L / 10)));
      const zs = [];
      for (let k = 0; k <= n; k++) { const g = terrain ? terrainGroundAt(terrain, ax + (bx - ax) * (k / n), ay + (by - ay) * (k / n)) : NaN; zs.push(Number.isFinite(g) ? g + 2 : flatZ + 2); }
      const tip = `${tr("Cross-section: {name}", { name: sct.name })}\n${Math.round(L).toLocaleString()} m, ${tr("azimuth {v}°", { v: Math.round(sct.azimuth ?? 0) })}`;
      // a dark red band on a wider white one (the white also runs a little past both ends)
      [[width * 1.7, "#ffffff", 10], [width, "#c2185b", 11]].forEach(([w, color, order]) => {
        const half = w / 2, ext = (w - width) / 2, pos = [], idx = [];
        for (let k = 0; k <= n; k++) {
          const along = k === 0 ? -ext : k === n ? ext : 0;
          const x = ax + (bx - ax) * (k / n) + ux * along, y = ay + (by - ay) * (k / n) + uy * along;
          for (const sgn of [-1, 1]) { const px = x + sgn * half * nx, py = y + sgn * half * ny; pos.push(px - ox, zs[k] - oz, -(py - oy)); }
          if (k) { const v = 2 * k; idx.push(v - 2, v - 1, v, v - 1, v + 1, v); }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.95 }));
        mesh.renderOrder = order;
        mesh.userData = { tip };
        group.add(mesh);
      });
    });
  }, [sections, showSectionLines, terrain, collars]);

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
        if (child.userData?.pickIgnore) return; // TASKS.csv #312 — an InstancedMesh batch has no tip of its own; its members are handled individually and mirrored by the sync below
        const tip = child.userData?.tip || "";
        const holeId = tip.split("\n")[0];
        child.visible = !(holeId && visibleHoles[holeId] === false);
      });
    });
    syncLayerBatches(); // TASKS.csv #312
  }, [visibleHoles, syncLayerBatches]);

  // ---------- generic import pipeline ----------
  // TASKS.csv #445 step 3 — the import pipeline lives in modules/viewer/useImportPipeline.js (moved verbatim); called here, where that code used to sit, so the hook order is unchanged.
  const { commitImport, handleDrop, importBrowserFile, layerPicker, loadSampleProject, openImportFromRows, openImportModal, processImportQueue, sampleLoading, setLayerPicker } = useImportPipeline({
    addBoundary,
    addRaster,
    collars,
    goToModule, // TASKS.csv #917
    importModal,
    importSolidFile,
    importStateRef,
    layerGroupsRef,
    project,
    sceneRef,
    setCollars,
    setCustomLayers,
    setCustomVisible,
    setDbModalOpen,
    setDragOver,
    setImportModal,
    setLayerVisible,
    setLayers,
    setNotices,
    setNumericRange,
    setSurvey,
    setTaskProgress,
    setVisibleHoles,
  });
  // TASKS.csv #637 — Harry or Woodjam. Woodjam's assays, ZTEM block model and IP lines are not drillhole tables, so they
  // are loaded here (lib/sampleWoodjam.js, lazily) once its tables are queued.
  const loadSample = async (which) => {
    // TASKS.csv #819 — Perk-Rocky is a surface-mapping project with no drillhole tables: its own loader only
    if (which === "perk") {
      try {
        const { loadPerkRocky, PERK_EPSG } = await import("../lib/samplePerkRocky.js");
        if (store.project?.crsSet === false) { store.setEpsg(PERK_EPSG); setNotices((p) => [...p, notice("Project CRS set to {crs} (EPSG:{epsg}), the sample project's coordinate system.", { crs: "NAD83 / UTM zone 10N", epsg: PERK_EPSG })]); }
        else if (store.project?.epsg && Number(store.project.epsg) !== PERK_EPSG) setNotices((p) => [...p, notice("The sample project's coordinates are EPSG:{epsg} ({crs}), but this project is EPSG:{epsg2}: the holes will not line up with anything else in it. Load the sample into a new project.", { epsg: PERK_EPSG, crs: "NAD83 / UTM zone 10N", epsg2: store.project.epsg })]);
        const readFile = async (rel) => (await loadSampleFiles("perk_rocky", [rel]))[0];
        const notes = await loadPerkRocky(readFile, { addMapLayer: store.addMapLayer, addSurfaceStructureSet: store.addSurfaceStructureSet, addTerrain: store.addTerrain }, { projectEpsg: store.project?.crsSet === false ? PERK_EPSG : (store.project?.epsg || PERK_EPSG) });
        setNotices((p) => [...p, ...notes]);
      } catch (e) { setNotices((p) => [...p, errorNotice(tr("Couldn't load the sample project: {message}", { message: e.message }))]); }
      return;
    }
    const ok = await loadSampleProject(which);
    if (ok && which !== "woodjam") { // TASKS.csv #1124 — Harry's assays into Geochem with the drillhole tables
      try {
        const { loadHarryAssays } = await import("../lib/sampleHarry.js");
        const notes = await loadHarryAssays(async (rel) => (await loadSampleFiles("harry_property", [rel]))[0], { setAssays, setAssayElements }, { existingElements: assayElements });
        setNotices((p) => [...p, ...notes]);
      } catch (e) { setNotices((p) => [...p, errorNotice(tr("Harry assays could not be loaded: {message}", { message: e.message }))]); }
    }
    if (!ok || which !== "woodjam") return;
    try {
      const { loadWoodjamExtras, WOODJAM_EPSG } = await import("../lib/sampleWoodjam.js");
      const readFile = async (rel) => (await loadSampleFiles("woodjam", [rel]))[0];
      const notes = await loadWoodjamExtras(readFile, { setAssays, setAssayElements, addVoxelModel, addOmfObject, saveDcipLine },
        { projectEpsg: importStateRef.current?.project?.epsg || WOODJAM_EPSG, maxCells: clampCellBudget(voxelCellBudget) || undefined, existingElements: assayElements }); // existingElements: #722
      setNotices((p) => [...p, ...notes]);
    } catch (e) { setNotices((p) => [...p, errorNotice(tr("The Woodjam sample's assays, IP and ZTEM could not be loaded: {message}", { message: e.message }))]); } // #739
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
      setNotices((p) => [...p, notice("Showing only the {size} of {collars} collar(s) inside \"{name}\" — every other hole is now hidden.", { size: inside.size, collars: collars.length, name: boundary.name })]);
    } else {
      setVisibleHoles((prev) => { const next = { ...prev }; collars.forEach((c) => { if (inside.has(c.hole_id)) next[c.hole_id] = false; }); return next; });
      setNotices((p) => [...p, notice("Hid {size} collar(s) inside \"{name}\".", { size: inside.size, name: boundary.name })]);
    }
  };
  const toggleLayer = (key) => setLayerVisible((p) => ({ ...p, [key]: !p[key] }));
  const toggleCustom = (id) => setCustomVisible((p) => ({ ...p, [id]: p[id] === false ? true : false }));

  // TASKS.csv #635 — Matt: "in the 3d view tab we need the right click menu on the geophysics layers, custom, map and
  // all layers. Also … edit the styles of each layer, colour, size, type (circle, plane, cylinder), etc". Interval /
  // point / structure / geophysics-point / surface-sample / custom layers get a Style… panel (lib/layerStyle.js);
  // every sidebar row gets a right-click menu (rowMenu) with the actions that fit it.
  const styleKindFor = (key) => {
    if (key === "surface_samples") return "point";
    const k = LAYER_META[key]?.kind;
    return k === "interval" ? "interval" : k === "point" || k === "point3d" ? "point" : k === "plane" ? "plane" : null;
  };
  const openLayerStyle = (key, label) => {
    const meta = LAYER_META[key], kind = styleKindFor(key);
    if (!kind) return;
    const sizeNote = kind === "interval" ? tr("Default tube radius {radius} m.", { radius: meta.radius }) : kind === "plane" ? tr("Default disc radius 6 m.") : meta?.numeric ? tr("By default the marker grows with the value; this scales all of them.") : null;
    setStyleTarget({ key, kind, label: label || meta?.label || key, defaults: { opacity: kind === "interval" ? meta.opacity : kind === "plane" ? 0.55 : 1 }, sizeNote, colourKey: meta && !meta.numeric && key !== "geophys_pts" ? key : null });
  };
  const openCustomStyle = (l) => {
    const intervals = (l.rows || []).filter((r) => r.to != null && !isNaN(r.to)).length;
    const kind = intervals >= (l.rows || []).length / 2 ? "interval" : "point";
    setStyleTarget({ key: `custom:${l.id}`, kind, label: l.name, defaults: { opacity: 1 }, sizeNote: kind === "interval" ? tr("Default tube radius 1.6 m.") : tr("Default marker radius 2.4 m.") });
  };
  const openRowMenu = (e, title, items) => { e.preventDefault(); setRowMenu({ x: e.clientX, y: e.clientY, title, items: items.filter(Boolean) }); };
  const zoomToObject = (obj) => { if (obj) { const b = new THREE.Box3().setFromObject(obj); if (!b.isEmpty()) fitBox(b); } };
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
    if (!confirmDestructive(tr("Remove all {n} row(s) from \"{label}\"?", { n, label: LAYER_META[layerKey].label }), { undoable: true })) return; // #386: layers are in Undo
    setLayers((p) => ({ ...p, [layerKey]: [] }));
    setNotices((p) => [...p, notice("Cleared {n} row(s) from {label}.", { n, label: LAYER_META[layerKey].label })]);
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
  // TASKS.csv #1033 (review #1016) — collar / survey dips are stored positive-down (flipDip on import); the attribute
  // table showed that raw, so a dip typed as the import file wrote it (-65) turned the hole upward. Shown and edited
  // negative = down, stored back flipped.
  const flipDipOf = (r) => { const d = typeof r.dip === "string" && r.dip.trim() !== "" ? Number(r.dip) : r.dip; return Number.isFinite(d) ? { ...r, dip: -d } : r; };
  const dipShown = flipDipOf, dipStored = flipDipOf;
  const COLLAR_CORE_KEYS = new Set(["hole_id", "x", "y", "z", "azimuth", "dip", "length"]);
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
          // TASKS.csv #577 — stored azimuths are GRID bearings (project CRS); say so in the field name and give the
          // true-north bearing beside it (grid = true + convergence), so QGIS / a re-import can't take one for the other
          attributes: { hole_id: c.hole_id, azim_grid: c.azimuth ?? null, azim_true: Number.isFinite(c.azimuth) && project?.epsg ? (() => { const cv = trueNorthBearingInGridDeg(c.x, c.y, project.epsg); return Number.isFinite(cv) ? +((((c.azimuth - cv) % 360) + 360) % 360).toFixed(2) : null; })() : null, dip: Number.isFinite(c.dip) ? -c.dip : null, length: c.length ?? null,
            ...Object.fromEntries(Object.entries(c).filter(([k, v]) => !k.startsWith("_") && !COLLAR_CORE_KEYS.has(k) && v !== undefined)) }, // #1034 — custom collar fields (year, target, status ...) were dropped
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
        // #1067 — a structure plane: type, dip, dipdir_grid / dipdir_true, strike_rhr (was a bare "azimuth")
        features.push({ geometry: [p], attributes: key === "structure" ? structureGisAttributes(r, project?.epsg ? trueNorthBearingInGridDeg(p[0], p[1], project.epsg) : null) : stripInternalFields(r) });
      });
      return { features, geomType: "point" };
    }
    return { features: [], geomType: "point" };
  };

  const exportVectorShapefile = async (kind, key, label, built = null) => { // built: #1025 — a map layer / boundary / sample set
    const { features, geomType } = built || buildVectorFeatures(kind, key);
    if (!features.length) { setNotices((p) => [...p, notice("Nothing to export for \"{label}\" — no rows with usable/desurveyed coordinates.", { label })]); return; }
    try {
      const { buildShapefileZip } = await import("../lib/shapefile.js"); // #552 — on demand
      const epsg = await ensureExportCrs(project); if (!epsg) return; // #1021 — the .prj
      const zipBytes = buildShapefileZip({ features, geomType, epsg, baseName: label, keepFieldCase: !!built }); // #1025 — a map layer keeps its field names
      const res = await saveFile({ quiet: true, // TASKS.csv #576 — awaited: success only when it was written
        suggestedName: `${label.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.zip`,
        filters: [{ name: "Shapefile (zipped)", extensions: ["zip"] }],
        content: zipBytes /* #1040 bytes */,
      });
      if (!res?.ok) { if (res?.error) throw new Error(res.error); return; } // cancelled: say nothing
      setNotices((p) => [...p, notice("Exported {features} feature(s) from \"{label}\" as a shapefile (.zip — .shp/.shx/.dbf{v}).", { features: features.length, label, v: project?.epsg ? tr("/.prj") : "" })]);
    } catch (err) {
      setNotices((p) => [...p, errorNotice(tr("Shapefile export failed: {message}", { message: err.message }))]);
    }
  };

  // TASKS.csv #191 — user request: "let's do those 3" (GeoPackage export was the previously-disabled
  // context menu item — "needs an in-browser SQLite writer" — now built on sql.js, see src/lib/gpkg.js).
  const exportVectorGeoPackage = async (kind, key, label, built = null) => { // built: #1025 — a map layer / boundary / sample set
    const { features, geomType } = built || buildVectorFeatures(kind, key);
    if (!features.length) { setNotices((p) => [...p, notice("Nothing to export for \"{label}\" — no rows with usable/desurveyed coordinates.", { label })]); return; }
    try {
      const tableName = label.replace(/[^a-zA-Z0-9_]+/g, "_") || "layer";
      const epsg = await ensureExportCrs(project); if (!epsg) return; // #1021 — the layer's SRS
      const gpkgBytes = await (await loadGpkg()).buildGeoPackage([{ name: tableName, features, geomType, epsg }]); // #439 lazy
      const res = await saveFile({ quiet: true, // TASKS.csv #576 — awaited: success only when it was written
        suggestedName: `${label.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.gpkg`,
        filters: [{ name: "GeoPackage", extensions: ["gpkg"] }],
        content: gpkgBytes /* #1040 bytes */,
      });
      if (!res?.ok) { if (res?.error) throw new Error(res.error); return; } // cancelled: say nothing
      setNotices((p) => [...p, notice("Exported {features} feature(s) from \"{label}\" as a GeoPackage (.gpkg).", { features: features.length, label })]);
    } catch (err) {
      setNotices((p) => [...p, errorNotice(tr("GeoPackage export failed: {message}", { message: err.message }))]);
    }
  };

  // TASKS.csv #1025 (review #1016) — map layers, boundaries / claims, surface samples: Shapefile / GeoPackage / DXF
  // through the writers above, KML (WGS84) and CSV; the features come from lib/overlayExport.js (on demand)
  const exportVectorKML = async (label, built, kmlOpts = {}) => {
    if (!built.features.length) { setNotices((p) => [...p, notice("Nothing to export for \"{label}\" — no rows with usable/desurveyed coordinates.", { label })]); return; }
    try {
      const epsg = await ensureExportCrs(project); if (!epsg) return; // #1021
      const ox = await import("../lib/overlayExport.js");
      const toLonLat = await ox.lonLatTransform(epsg);
      if (!toLonLat) throw new Error(tr("EPSG:{epsg} cannot be converted to latitude / longitude.", { epsg }));
      const res = await saveFile({ quiet: true, suggestedName: `${label.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.kml`, filters: [{ name: "KML", extensions: ["kml"] }], content: ox.featuresToKml(built, { name: label, toLonLat, ...kmlOpts }) });
      if (!res?.ok) { if (res?.error) throw new Error(res.error); return; }
      setNotices((p) => [...p, notice("Exported {features} feature(s) from \"{label}\" as KML (WGS84 latitude / longitude).", { features: built.features.length, label })]);
    } catch (err) {
      setNotices((p) => [...p, errorNotice(tr("KML export failed: {message}", { message: err.message }))]);
    }
  };
  // the row-menu entries; build() -> Promise<{ features, geomType }>, csvRows() optional
  const overlayExportItems = (label, build, { kml = {}, csvRows = null } = {}) => [
    { label: tr("Export Shapefile (.zip)…"), onClick: async () => exportVectorShapefile(null, null, label, await build()) },
    { label: tr("Export GeoPackage (.gpkg)…"), onClick: async () => exportVectorGeoPackage(null, null, label, await build()) },
    { label: tr("Export DXF (.dxf)…"), onClick: async () => exportVectorDXF(null, null, label, (await import("../lib/overlayExport.js")).explodeParts(await build())) },
    { label: tr("Export KML (Google Earth)…"), onClick: async () => exportVectorKML(label, await build(), typeof kml === "function" ? await kml() : kml) },
    csvRows && { label: tr("Export CSV…"), onClick: async () => { const rows = await csvRows(); if (rows.length) saveFile({ quiet: "success", suggestedName: `${label.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(rows), encoding: "text" }); } },
  ].filter(Boolean);
  const overlayLib = () => import("../lib/overlayExport.js");

  // TASKS.csv #128 — DXF export, the CAD/GIS interop format surveyors and mine planners actually work
  // in day to day, alongside Shapefile/GeoPackage above. Same buildVectorFeatures() data path, just a
  // third output format. Elevations are written (#408) and the file is consistent R12 (#578), per src/lib/dxf.js.
  const exportVectorDXF = async (kind, key, label, built = null) => { // built: #1025 — a map layer / boundary / sample set
    const { features, geomType } = built || buildVectorFeatures(kind, key);
    if (!features.length) { setNotices((p) => [...p, notice("Nothing to export for \"{label}\" — no rows with usable/desurveyed coordinates.", { label })]); return; }
    try {
      const { buildDXF } = await import("../lib/dxf.js"); // #552 — on demand
      // #1060 — a drillhole interval / point / structure layer: one DXF layer per logged value, structure picks labelled
      // "dip/dip direction"; collars and traces keep one layer per hole; a map layer or boundary one per category / name
      const valueLayer = !built && kind === "layer" && key ? (f) => `${String(key).toUpperCase()}_${f.attributes?.value ?? f.attributes?.type ?? "NONE"}` : null;
      const pickLabel = !built && key === "structure" ? (f) => { const a = f.attributes || {}; return Number.isFinite(a.dip) ? `${Math.round(a.dip)}/${Number.isFinite(a.dipdir_grid) ? String(Math.round(a.dipdir_grid)).padStart(3, "0") : "?"}` : null; } : null;
      const builtLayer = built?.dxfLayerOf || null;
      const dxfText = buildDXF({ features, geomType, layerOf: valueLayer || builtLayer, labelOf: pickLabel });
      const res = await saveFile({ quiet: true, // TASKS.csv #576 — awaited: success only when it was written
        suggestedName: `${label.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.dxf`,
        filters: [{ name: "DXF", extensions: ["dxf"] }],
        content: dxfText,
      });
      if (!res?.ok) { if (res?.error) throw new Error(res.error); return; } // cancelled: say nothing
      setNotices((p) => [...p, notice("Exported {features} feature(s) from \"{label}\" as a DXF (.dxf, R12, elevations kept). A DXF carries only layer names{v}: use Shapefile or GeoPackage for every attribute.", { features: features.length, label, v: valueLayer ? tr(" (one per logged value{v2})", { v2: pickLabel ? tr(", picks labelled dip/dip direction") : "" }) : "" })]); // #1060
    } catch (err) {
      setNotices((p) => [...p, errorNotice(tr("DXF export failed: {message}", { message: err.message }))]);
    }
  };
  // TASKS.csv #1034 (review #1016) — the drillhole database as tables the CSV importer reads back unaided (lib/drillholeTables.js):
  // one layer as a CSV, or collars + survey + every log as a .zip of CSVs.
  const exportDrillholeTables = async (kind, key, label) => {
    try {
      const T = await import("../lib/drillholeTables.js"); // on demand
      const epsg = await ensureExportCrs(project); if (!epsg) return; // #1021 — the stamp's CRS
      if (kind === "all") {
        const files = T.drillholeTableFiles({ collars, survey, layers, epsg, version: APP_VERSION });
        if (!files.length) { setNotices((p) => [...p, notice("Nothing to export: no collars, survey or hole logs are loaded.")]); return; }
        const { buildZip } = await import("../lib/shapefile.js");
        const enc = new TextEncoder();
        const zip = buildZip(files.map((f) => ({ name: f.name, data: enc.encode(`﻿${f.text}`) }))); // BOM: Excel reads accents (#1097)
        const res = await saveFile({ quiet: true, suggestedName: `${(project?.name || "drillholes").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}_tables.zip`, filters: [{ name: "ZIP of CSV tables", extensions: ["zip"] }], content: zip /* #1040 bytes */ });
        if (!res?.ok) { if (res?.error) throw new Error(res.error); return; }
        setNotices((p) => [...p, notice("Exported {n} drillhole tables ({files}) as CSV in a .zip. Dips are negative = down and azimuths grid, so they import back with the defaults.", { n: files.length, files: files.map((f) => f.name).join(", ") })]);
        return;
      }
      const files = T.drillholeTableFiles({ collars: kind === "collars" ? collars : [], survey: kind === "survey" ? survey : [], layers: kind === "layer" ? { [key]: layers[key] || [] } : {}, epsg, version: APP_VERSION });
      if (!files.length) { setNotices((p) => [...p, notice("Nothing to export for \"{label}\" — it has no rows.", { label })]); return; }
      const res = await saveFile({ quiet: "success", suggestedName: files[0].name, filters: [{ name: "CSV", extensions: ["csv"] }], content: files[0].text });
      if (res?.ok) setNotices((p) => [...p, notice("Exported \"{label}\" as a CSV table that imports back with the defaults (dips negative = down, azimuths grid).", { label })]);
    } catch (err) {
      setNotices((p) => [...p, errorNotice(tr("Table export failed: {message}", { message: err.message }))]);
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
      <LayerRow key={key} label={tr(meta.label)} count={(layers[key] || []).length} visible={layerVisible[key]}
        onToggle={() => toggleLayer(key)}
        onUpload={isGeophys ? () => goToModule("geophysics") : () => fileInputs.current[key].click()}
        onInspect={() => setInspectLayer(key)} onZoom={() => zoomToLayer(key)} onClear={() => clearLayer(key)}
        onContextMenu={(e) => { e.preventDefault(); setLayerContextMenu({ key, label: meta.label, x: e.clientX, y: e.clientY }); }}
        expanded={!!expandedLayers[key]} onToggleExpand={() => setExpandedLayers((p) => ({ ...p, [key]: !p[key] }))}
        input={isGeophys ? null : <input ref={setInputRef(key)} type="file" multiple accept=".csv,.xlsx,.zip,.gpkg,.shp,.dbf,.prj,.cpg,.shx,.kml,.kmz,.las" style={{ display: "none" }} onChange={(e) => { const f = groupShapefileParts(Array.from(e.target.files)).files[0]; if (f) openImportModal(f, key); e.target.value = ""; }} />}
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
    if (!confirmDestructive(tr("Remove all {collars} collar(s)? Every layer's data stays in the project, but nothing will render until collars are re-imported (there's nothing to desurvey against).", { collars: collars.length }), { undoable: true })) return; // #386
    setCollars([]);
    setNotices((p) => [...p, notice("Cleared {collars} collar(s).", { collars: collars.length })]);
  };
  const clearSurvey = () => {
    if (!survey.length) return;
    if (!confirmDestructive(tr("Remove all {survey} survey station(s)? Holes fall back to a straight-hole projection from each collar's own azimuth/dip.", { survey: survey.length }), { undoable: true })) return; // #386
    setSurvey([]);
    setNotices((p) => [...p, notice("Cleared {survey} survey station(s).", { survey: survey.length })]);
  };

  // ---------- cross-section (plan-view draw -> pop-out window) ----------
  // TASKS.csv #617 — which clicks place a section / measure / pick-hole / modelling-code / sculpt point. All five
  // handlers hang off the 3D view's container, so before this (reproduced with real mouse input in the Electron app):
  //   * ending an orbit or pan DRAG fired a click -> a measure point (or section end) wherever the mouse stopped;
  //   * clicking a control drawn OVER the view (Fit / Top / Bottom, the legend, the measure panel's Clear and
  //     Distance/Area pills) bubbled here -> a point under the button (Clear then immediately re-added one);
  //   * snapping the view with the compass (drawn on the canvas) did the same.
  // A pick is now a click on the canvas itself, not on the compass, with the pointer within 4 px of where it went down.
  const isViewClick = (e) => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas || e.target !== canvas) return false;
    const d = mcDownRef.current;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return false;
    const mount = mountRef.current, compass = compassRef.current;
    if (mount && compass?.isOver) { const r = mount.getBoundingClientRect(); if (compass.isOver(mount, e.clientX - r.left, e.clientY - r.top)) return false; }
    return true;
  };
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
  // TASKS.csv #599 — a click (not a drag) on a lithology interval in the Modelling tab: select it, or — when
  // "connect" is armed — give it the first interval's code and draw the tie. Uses the same pick index as the
  // hover tooltip; the lithology layer must be visible to be picked.
  const onMcodeClick = useCallback((e) => {
    if (!mcPickMode || mode !== "modelling") return;
    const d = mcDownRef.current;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    const rect = mountRef.current.getBoundingClientRect();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), cameraRef.current);
    const hit = pickHits(raycaster).find((h) => h.object.userData?.lithoRow && h.object.parent?.visible !== false);
    if (!hit) return;
    const row = hit.object.userData.lithoRow;
    if (mcConnectFrom) {
      if (row.hole_id === mcConnectFrom.hole_id) { setNotices((p) => [...p, notice("Connect: pick the matching interval in ANOTHER hole (or press the connect button again to cancel).")]); return; }
      const code = effectiveCode(mcConnectFrom, modellingCodes, mcGroupOf);
      setModellingCodes((p) => connectIntervals(p, mcConnectFrom, row, layers.litho, mcGroupOf));
      setNotices((p) => [...p, notice("{hole_id} {v}–{v2} m ({value}) connected to {hole_id2}: modelling code {code}.", { hole_id: row.hole_id, v: Number(row.from).toFixed(1), v2: Number(row.to).toFixed(1), value: row.value, hole_id2: mcConnectFrom.hole_id, code })]);
      setMcConnectFrom(null);
    }
    setMcSelected(row);
  }, [mcPickMode, mode, mcConnectFrom, modellingCodes, mcGroupOf, layers.litho, pickHits, setModellingCodes]);
  // TASKS.csv #811 — a click (not a drag) in the 3D view while an explicit surface is picking: the hits go to the
  // Explicit surface panel (loaded on demand), which turns them into a pick
  const explicitClickRef = useRef(null);
  const onExplicitClick = useCallback((e) => {
    if (!explicitPickFor || mode !== "modelling" || !explicitClickRef.current) return;
    const d = mcDownRef.current;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    const rect = mountRef.current.getBoundingClientRect();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), cameraRef.current);
    explicitClickRef.current(pickHits(raycaster).filter((h) => h.object.parent?.visible !== false), raycaster);
  }, [explicitPickFor, mode, pickHits]);
  // the picks of every explicit surface, in its colour, while the Modelling tab is shown
  const explicitOverlayRef = useRef(null);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (!explicitOverlayRef.current) { explicitOverlayRef.current = new THREE.Group(); explicitOverlayRef.current.name = "explicitPicks"; scene.add(explicitOverlayRef.current); }
    const g = explicitOverlayRef.current;
    g.children.slice().forEach((o) => { g.remove(o); o.geometry?.dispose(); o.material?.dispose(); });
    g.visible = mode === "modelling";
    if (mode !== "modelling") return;
    const o = originRef.current;
    (explicitSurfaces || []).forEach((s) => {
      // TASKS.csv #824 — the contact lines digitized on section images, with their vertices
      (s.lines || []).forEach((ln) => {
        if (ln.pts?.length < 2) return;
        const lp = new Float32Array(ln.pts.flatMap((p) => [p.x - o.x, p.z - o.z, o.y - p.y]));
        const lg = new THREE.BufferGeometry();
        lg.setAttribute("position", new THREE.BufferAttribute(lp, 3));
        const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: s.color || "#e07b39", depthTest: false, transparent: true }));
        line.renderOrder = 11;
        g.add(line);
        const vg = new THREE.BufferGeometry();
        vg.setAttribute("position", new THREE.BufferAttribute(lp.slice(), 3));
        const v = new THREE.Points(vg, new THREE.PointsMaterial({ color: s.color || "#e07b39", size: 6, sizeAttenuation: false, depthTest: false, transparent: true }));
        v.renderOrder = 11;
        g.add(v);
      });
      if (!s.picks?.length) return;
      const pos = new Float32Array(s.picks.length * 3);
      s.picks.forEach((p0, i) => {
        // TASKS.csv #888 — a pick on a hole is drawn on the hole's current trace, where the build puts it
        const t = p0.hole_id && Number.isFinite(p0.md) && tracesRef.current.find((tc) => tc.hole_id === p0.hole_id), w = t && findOnTraceWorld(t, p0.md);
        const p = w ? { x: w[0], y: w[1], z: w[2] } : p0;
        pos[3 * i] = p.x - o.x; pos[3 * i + 1] = p.z - o.z; pos[3 * i + 2] = o.y - p.y;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: s.color || "#e07b39", size: s.id === explicitPickFor ? 11 : 8, sizeAttenuation: false, depthTest: false, transparent: true }));
      pts.renderOrder = 11;
      pts.userData.explicitId = s.id; // #813 — the panel moves this surface's points live while a pick is dragged
      g.add(pts);
    });
    lastActivityRef.current = Date.now();
  }, [explicitSurfaces, explicitPickFor, mode, tracesSeq /* #888 */]);
  // TASKS.csv #599 — overlay in the Modelling tab: a tie line (in the code's colour) between the middles of each
  // pair of connected intervals, and the selected / "connect from" interval highlighted along its trace.
  const mcOverlayRef = useRef(null);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (!mcOverlayRef.current) { mcOverlayRef.current = new THREE.Group(); mcOverlayRef.current.name = "modellingCodesOverlay"; scene.add(mcOverlayRef.current); }
    const g = mcOverlayRef.current;
    g.children.slice().forEach((o) => { g.remove(o); o.geometry?.dispose(); o.material?.dispose(); });
    g.visible = mode === "modelling";
    if (mode !== "modelling") return;
    const traceOf = (hole) => tracesRef.current.find((t) => t.hole_id === hole);
    const parseKey = (k) => { const parts = String(k).split("|"); const to = Number(parts.pop()), from = Number(parts.pop()); return { hole_id: parts.join("|"), from, to }; };
    (modellingCodes?.ties || []).forEach((tie) => {
      const a = parseKey(tie.a), b = parseKey(tie.b);
      const ta = traceOf(a.hole_id), tb = traceOf(b.hole_id);
      if (!ta || !tb) return;
      const pa = findOnTrace(ta.pts, (a.from + a.to) / 2), pb = findOnTrace(tb.pts, (b.from + b.to) / 2);
      if (!pa || !pb) return;
      const rowA = (layers.litho || []).find((r) => r.hole_id === a.hole_id && Math.abs(Number(r.from) - a.from) < 1e-3);
      const code = rowA ? effectiveCode(rowA, modellingCodes, mcGroupOf) : null;
      const color = (code && codeInfo(modellingCodes, code).color) || (rowA ? colorForLithology(rowA.value) : "#ffd400");
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pa.x, pa.y, pa.z), new THREE.Vector3(pb.x, pb.y, pb.z)]), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }));
      line.renderOrder = 10;
      g.add(line);
    });
    const highlight = (row, color) => {
      const t = row && traceOf(row.hole_id);
      if (!t) return;
      const n = 8, pts = [];
      for (let i = 0; i <= n; i++) { const p = findOnTrace(t.pts, Number(row.from) + ((Number(row.to) - Number(row.from)) * i) / n); if (p) pts.push(new THREE.Vector3(p.x, p.y, p.z)); }
      if (pts.length < 2) return;
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, (LAYER_META.litho?.radius || 2.2) * 1.8, 8, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }));
      tube.renderOrder = 9;
      g.add(tube);
    };
    highlight(mcSelected, "#ffd400");
    if (mcConnectFrom && mcConnectFrom !== mcSelected) highlight(mcConnectFrom, "#ff8a00");
    lastActivityRef.current = Date.now();
  }, [modellingCodes, mcSelected, mcConnectFrom, mode, layers.litho, collars, survey, mcGroupOf]);
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
  // Flatten every currently-visible layer into plain {color,label} primitives here, in the main
  // window, where all the color/legend/filter logic already lives — so the pop-out window just
  // draws shapes and never needs to know about layer types, filters, or overrides.
  // TASKS.csv #525 — factored out of buildSectionPayload so the level plan colours holes exactly as sections do.
  const layerPrimitivesFor = (holeIds, scope = {}) => {
    const intervals = [];
    // TASKS.csv #137 — SG has no fixed domain the way RQD%/recovery% do (see the main geometry
    // effect's numericIntervalColor comment for the same reasoning) — its actual project min/max
    // is computed once here too, same values that effect's globalPointRanges.sg would produce.
    const sgVals = (layers.sg || []).filter((r) => holeIds.has(r.hole_id) && isRowVisible("sg", r)).map((r) => r.value).filter((v) => typeof v === "number" && !isNaN(v));
    const sgRange = minMax(sgVals);
    ["litho", "alt", "vein", "breccia", "structzone", "geotech", "recovery", "sg", "litho_gc", "alt_gc"].forEach((key) => {
      if (scope.layerKeys != null ? !scope.layerKeys.includes(key) : !layerVisible[key]) return;
      const meta = LAYER_META[key];
      (layers[key] || []).forEach((row) => {
        if (!holeIds.has(row.hole_id) || !isRowVisible(key, row)) return;
        const color = meta.numeric ? numericLayerColor(key, row.value, key === "sg" ? sgRange : { min: 0, max: 100 }) : effectiveColor(key, row.value);
        const label = meta.numeric ? row.value : effectiveLabel(key, row.value);
        intervals.push({ hole_id: row.hole_id, from: row.from, to: row.to, color, label: `${meta.label}: ${label}`, layer: key }); // #392 — layer drives the ribbon offset
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
        // TASKS.csv #684 — a mineralisation INTERVAL is a ribbon over its depths in the section, not a dot at its midpoint
        if (key === "mnlgy" && isIntervalRow(row)) { intervals.push({ hole_id: row.hole_id, from: row.from, to: row.to, color, label: `${meta.label}: ${label}${row.extra != null ? ` (${row.extra}%)` : ""}`, layer: key }); return; }
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
          points.push({ hole_id: a.hole_id, md: mid, color: assayColorFor(v, idx, style), label: `${sym}: ${v}`, assay: { sym, value: v, idx, from: a.from, to: a.to } }); // #392 — drawn as a grade bar
        });
      });
    }

    const showCustomLayers = scope.showCustomLayers != null ? scope.showCustomLayers : true;
    customLayers.forEach((layer) => {
      if (!showCustomLayers) return;
      if (scope.showCustomLayers == null && customVisible[layer.id] === false) return;
      layer.rows.filter((r) => holeIds.has(r.hole_id)).forEach((row) => {
        const color = hashColor(row.value);
        if (row.to != null && !isNaN(row.to)) intervals.push({ hole_id: row.hole_id, from: row.from, to: row.to, color, label: `${layer.name}: ${row.value}`, layer: `custom:${layer.id}` });
        else if (row.depth != null && !isNaN(row.depth)) points.push({ hole_id: row.hole_id, md: row.depth, color, label: `${layer.name}: ${row.value}` });
      });
    });

    return { intervals, points };
  };

  // TASKS.csv #759 — the last model's units on this section as a picture (drawn behind the holes in the section
  // window): exact when the run evaluated this saved section on this same line, else read from the model's block at its
  // cell size, and said so. Nodes above the ground are left out. Coordinates: world E / N / elevation.
  const modelBackdropFor = (a, b, secId, showTerrain, corridor) => {
    const lb = lastLithBlock;
    if (!lb?.block) return null;
    const colorOf = (u) => (u === lb.aboveLabel || /^above the top of /.test(u) ? "#d4d4d4" : lithUnitColor(lb, u));
    const ev = secId && lb.sections?.[secId];
    let grid, units, source;
    if (ev && sameLine({ ax: a.x, ay: a.y, bx: b.x, by: b.y }, ev)) {
      const g = ev.grid;
      grid = { len: g.len, z0: g.z0, z1: g.z1, nx: g.nx, ny: g.ny, dl: g.dl, nodes: Array.from(g.ij, (k) => ({ i: k % g.nx, j: Math.floor(k / g.nx) })) };
      units = unpackUnits(ev.units);
      source = `evaluated exactly every ${Math.round(g.dl)} m`;
    } else {
      const o = lb.origin, [, , , , bz0, bz1] = lb.block.extent, sp = blockSpacing(lb.block);
      const groundAt = terrain && showTerrain ? (x, y) => terrainGroundAt(terrain, x, y) : null; // TASKS.csv #927
      const tracePts = tracesRef.current.flatMap((t) => t.wx.map((x, i) => ({ x, y: t.wy[i], z: t.wz[i] })));
      const [zl, zh] = sectionZRange(tracePts, a, b, corridor, bz0 + o.z, bz1 + o.z);
      grid = sectionGrid(a, b, zl, zh, { maxPts: 40000, minSpacing: Math.max(1, Math.min(sp.horizontal, sp.vertical) / 2), groundAt });
      if (!grid) return null;
      const above = `above the top of ${lb.units[0]?.name || "the model"} (not modelled)`;
      units = grid.nodes.map((n) => { const u = unitAt(lb.block, n.x - o.x, n.y - o.y, n.z - o.z); return u === undefined ? null : u === null ? above : u; });
      source = `read from the model's block (cells about ${Math.round(sp.horizontal)} x ${Math.round(sp.vertical)} m; a model run evaluates the most recent sections exactly)`;
    }
    if (!units.some((u) => u != null)) return null;
    const cv = document.createElement("canvas");
    cv.width = grid.nx; cv.height = grid.ny;
    cv.getContext("2d").putImageData(new ImageData(sectionPixels(grid, units, colorOf), grid.nx, grid.ny), 0, 0);
    const seen = [...new Set(units.filter((u) => u != null))];
    return { name: `Model: ${lb.title} (${lb.when})`, source, len: grid.len, z0: grid.z0, z1: grid.z1, dataUrl: cv.toDataURL("image/png"), legend: seen.map((u) => [`Model: ${u}`, colorOf(u)]) };
  };

  const buildSectionPayload = (a, b, corridor, scope = {}, secId = null) => {
    const azimuth = (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360;
    const holesInBand = tracesRef.current.filter((t) => t.wx.some((wx, i) => distToSegment(wx, t.wy[i], a.x, a.y, b.x, b.y) <= corridor));
    const holeIds = new Set(holesInBand.map((t) => t.hole_id));
    // TASKS.csv #499 — each hole carries the depth runs that are actually inside the corridor and its offset
    // from the line; everything drawn on the hole is clipped to those runs below (sectionCorridor.js).
    const holes = holesInBand.map((t) => {
      const trace = t.pts.map((p, i) => ({ md: p.md, x: t.wx[i], y: t.wy[i], z: t.wz[i] }));
      const cr = corridorRuns(trace, a, b, corridor);
      return { hole_id: t.hole_id, trace, runs: cr.runs, minOffset: cr.minOffset, maxOffset: cr.maxOffset };
    });

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
        if (!voxelCellSupported(model, c)) return; // TASKS.csv #321
        if (distToSegment(c.x, c.y, a.x, a.y, b.x, b.y) > corridor) return;
        const l = along(c.x, c.y);
        const halfWidthL = Math.abs(secUx * (c.dx || 0)) / 2 + Math.abs(secUy * (c.dy || 0)) / 2;
        if (l + halfWidthL < 0 || l - halfWidthL > secLen) return; // entirely off the drawn extent
        rects.push({ l0: l - halfWidthL, l1: l + halfWidthL, z0: c.z - (c.dz || 0) / 2, z1: c.z + (c.dz || 0) / 2, color: colorForVoxelValue(model, c.value) });
      });
      if (rects.length) voxelSlices.push({ id: model.id, name: model.name, rects });
    });

    const { intervals, points } = layerPrimitivesFor(holeIds, scope); // #525 — shared with the level plan

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

    // TASKS.csv #499 — keep only what lies in the corridor: intervals / assay bars clipped to the in-corridor runs,
    // points and structures kept when their depth is in one. (Before, a hole touching the corridor anywhere had
    // its whole log drawn as if on the section.)
    {
      const runsOf = new Map(holes.map((h) => [h.hole_id, h.runs]));
      const clip = (holeId, from, to) => (runsOf.get(holeId) || []).map(([r0, r1]) => [Math.max(from, r0), Math.min(to, r1)]).filter(([f, t]) => t - f > 1e-6);
      const kept = intervals.flatMap((iv) => clip(iv.hole_id, iv.from, iv.to).map(([f, t]) => ({ ...iv, from: f, to: t })));
      intervals.length = 0; intervals.push(...kept);
      const keptPts = points.flatMap((pt) => {
        if (pt.assay) { const c = clip(pt.hole_id, pt.assay.from, pt.assay.to); return c.length ? [{ ...pt, md: (c[0][0] + c[c.length - 1][1]) / 2, assay: { ...pt.assay, from: c[0][0], to: c[c.length - 1][1] } }] : []; }
        return mdInRuns(pt.md, runsOf.get(pt.hole_id)) ? [pt] : [];
      });
      points.length = 0; points.push(...keptPts);
      const keptPlanes = planes.filter((pl) => mdInRuns(pl.depth, runsOf.get(pl.hole_id)));
      planes.length = 0; planes.push(...keptPlanes);
    }

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
      // TASKS.csv #573 — sampled at the DEM's own cell size (was a fixed 100 points: every 50 m on a 5 km section,
      // cutting ridges / gullies a 30 m SRTM or 1 m LiDAR grid has, and the planned-collar snap interpolated across
      // them), at least 100 and at most 2000 points per section — bilinear lookups, once per section build.
      const [txmin, tymin, txmax, tymax] = terrain.bbox;
      const cell = Math.min((txmax - txmin) / Math.max(1, terrain.gridW - 1), (tymax - tymin) / Math.max(1, terrain.gridH - 1));
      const STEPS = Math.max(100, Math.min(2000, Math.ceil(dist / Math.max(cell, 1e-6))));
      const pts = [];
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        // #573 — off the terrain the sampler returns the nearest edge value: leave a gap, not a flat fake ground
        if (x < txmin || x > txmax || y < tymin || y > tymax) continue;
        const el = terrainGroundAt(terrain, x, y); // TASKS.csv #927 — a gap over the fill too
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
    const legendPrefixes = ["litho", "alt", "vein", "breccia", "structzone", "litho_gc", "alt_gc"].map((k) => `${LAYER_META[k].label}: `);
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

    // TASKS.csv #357 — model surfaces and imported solids ON the section. Every visible implicit/solid mesh
    // is cut by the vertical section plane (per-triangle sign test, once per section): the geologist can
    // now see the surface they are correcting on the section they draw contacts on, the Leapfrog/Micromine
    // edit loop. Segments come back in section coordinates (l along the line, z elevation), clipped to the
    // drawn extent. Scene -> world: E = x + ox, N = oy - z, Z = y + oz.
    const surfaceTraces = [];
    {
      const o = originRef.current;
      const nx = -secUy, ny = secUx; // horizontal normal of the section plane
      const nameOf = Object.fromEntries((implicitSurfaces || []).map((sf) => [sf.id, sf.name]));
      Object.entries(implicitMeshesRef.current || {}).forEach(([id, mesh]) => {
        if (!mesh?.visible || !mesh.geometry?.attributes?.position) return;
        const pos = mesh.geometry.attributes.position.array;
        const index = mesh.geometry.index ? mesh.geometry.index.array : null;
        const triCount = index ? index.length / 3 : pos.length / 9;
        const segs = [];
        const P = (vi) => { const E = pos[vi * 3] + o.x, N = o.y - pos[vi * 3 + 2], Z = pos[vi * 3 + 1] + o.z; return { l: along(E, N), d: (E - a.x) * nx + (N - a.y) * ny, z: Z }; };
        for (let t = 0; t < triCount; t++) {
          const i0 = index ? index[t * 3] : t * 3, i1 = index ? index[t * 3 + 1] : t * 3 + 1, i2 = index ? index[t * 3 + 2] : t * 3 + 2;
          const v = [P(i0), P(i1), P(i2)];
          const cut = [];
          for (let e = 0; e < 3; e++) {
            const p = v[e], q = v[(e + 1) % 3];
            if ((p.d <= 0 && q.d > 0) || (p.d > 0 && q.d <= 0)) {
              const f = p.d / (p.d - q.d);
              cut.push([p.l + (q.l - p.l) * f, p.z + (q.z - p.z) * f]);
            }
          }
          if (cut.length === 2 && !(cut[0][0] < 0 && cut[1][0] < 0) && !(cut[0][0] > secLen && cut[1][0] > secLen)) segs.push([cut[0][0], cut[0][1], cut[1][0], cut[1][1]]);
        }
        if (segs.length) surfaceTraces.push({ id, name: nameOf[id] || String(mesh.userData?.tip || id).split("\n")[0], color: `#${(mesh.material?.color?.getHex?.() ?? 0xc8a24a).toString(16).padStart(6, "0")}`, segs });
      });
    }
    // TASKS.csv #395 — planned holes within the corridor, drawn dashed on the section (targeting is done on
    // sections: the next hole goes under the last intercept).
    const plannedOnSection = [];
    (plannedHoles || []).forEach((h) => {
      const tr = plannedHoleTrace(h);
      if (!tr?.length || !tr.some((p) => distToSegment(p.x, p.y, a.x, a.y, b.x, b.y) <= corridor)) return;
      // TASKS.csv #1010 — with the depths along the planned trace (ticks and the end depth on the section) and where it
      // crosses the visible modelled surfaces (#1009), labelled with their depths
      plannedOnSection.push({ name: h.name || h.id, trace: tr.map((p) => ({ x: p.x, y: p.y, z: p.z, md: p.md })), pierces: surfacePierces(tr, pierceSurfaces).map((q) => ({ x: q.x, y: q.y, z: q.z, md: q.md, name: q.surfaceName })) });
    });

    const modelBackdrop = modelBackdropFor(a, b, secId, showTerrain, corridor); // #759
    if (modelBackdrop) modelBackdrop.legend.forEach((it) => legendItems.push(it));
    return { azimuth, holes, intervals, points, planes, elevationProfile, legendItems, voxelSlices, surfaceTraces, plannedHoles: plannedOnSection, modelBackdrop };
  };

  // TASKS.csv #525 — a LEVEL PLAN: everything cut by the horizontal plane z = rl, keeping what lies in the slab
  // rl ± half (hole runs, their logs, assays, structures), plus pierce points, block-model cells at the RL, model
  // surfaces / solids cut by the plane and planned holes. Same layer colours / filters / legend as a section
  // (layerPrimitivesFor). Geometry is in lib/levelPlan.js; coordinates are E / N.
  const buildPlanPayload = (rl, half) => {
    const zmin = rl - half, zmax = rl + half;
    const holes = [];
    for (const t of tracesRef.current) {
      const trace = t.pts.map((p, i) => ({ md: p.md, x: t.wx[i], y: t.wy[i], z: t.wz[i] }));
      if (!trace.length) continue;
      const runs = slabRuns(trace, zmin, zmax);
      // context: the whole hole, thinned to ~200 points
      const k = Math.max(1, Math.floor(trace.length / 200));
      const context = trace.filter((_, i) => i % k === 0 || i === trace.length - 1).map((p) => [p.x, p.y]);
      holes.push({ hole_id: t.hole_id, trace, runs, polylines: tracePolylines(trace, runs), pierce: piercePoints(trace, rl), collar: [trace[0].x, trace[0].y], context });
    }
    const inSlab = holes.filter((h) => h.runs.length);
    const holeIds = new Set(inSlab.map((h) => h.hole_id));
    const { intervals, points } = layerPrimitivesFor(holeIds, {});
    const byId = new Map(holes.map((h) => [h.hole_id, h]));
    const clip = (h, from, to) => h.runs.map(([r0, r1]) => [Math.max(from, r0), Math.min(to, r1)]).filter(([f, t]) => t - f > 1e-6);
    const planIntervals = [];
    intervals.forEach((iv) => {
      const h = byId.get(iv.hole_id); if (!h) return;
      const parts = clip(h, iv.from, iv.to);
      if (parts.length) planIntervals.push({ hole_id: iv.hole_id, layer: iv.layer, color: iv.color, label: iv.label, from: iv.from, to: iv.to, lines: tracePolylines(h.trace, parts) });
    });
    const planPoints = [];
    points.forEach((pt) => {
      const h = byId.get(pt.hole_id); if (!h) return;
      const md = pt.assay ? (pt.assay.from + pt.assay.to) / 2 : pt.md;
      if (!h.runs.some(([a, b]) => md >= a - 1e-9 && md <= b + 1e-9)) return;
      const q = pointAtMd(h.trace, md);
      planPoints.push({ hole_id: pt.hole_id, md, x: q.x, y: q.y, color: pt.color, label: pt.label, assay: pt.assay || null });
    });
    // what each pierce point sits in: the interval of every logged layer at that depth, and the assays there
    holes.forEach((h) => h.pierce.forEach((pc) => {
      pc.logs = intervals.filter((iv) => iv.hole_id === h.hole_id && pc.md >= iv.from && pc.md <= iv.to).map((iv) => ({ label: iv.label, color: iv.color, layer: iv.layer }));
      pc.assays = points.filter((pt) => pt.hole_id === h.hole_id && pt.assay && pc.md >= pt.assay.from && pc.md <= pt.assay.to).map((pt) => pt.label);
    }));
    const structures = [];
    if (layerVisible.structure) {
      (layers.structure || []).forEach((sp) => {
        const h = byId.get(sp.hole_id);
        if (!h || !isRowVisible("structure", sp) || !h.runs.some(([a, b]) => sp.depth >= a && sp.depth <= b)) return;
        const q = pointAtMd(h.trace, Number(sp.depth));
        const oriented = Number.isFinite(Number(sp.dip)) && Number.isFinite(Number(sp.azimuth)) && sp.dip !== null && sp.azimuth !== null;
        structures.push({ hole_id: sp.hole_id, depth: sp.depth, x: q.x, y: q.y, dip: oriented ? Number(sp.dip) : null, dipDir: oriented ? Number(sp.azimuth) : null, color: effectiveColor("structure", sp.value), label: `Structure: ${effectiveLabel("structure", sp.value)}` });
      });
    }
    const voxelSlices = [];
    (voxelModels || []).forEach((model) => {
      if (!model.cells?.length || model.visible === false) return;
      const rects = voxelPlanRects(model.cells.filter((c) => voxelCellSupported(model, c)), rl).map((r) => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, color: colorForVoxelValue(model, r.value) }));
      if (rects.length) voxelSlices.push({ id: model.id, name: model.name, rects });
    });
    const surfaceCuts = [];
    {
      const o = originRef.current;
      const nameOf = Object.fromEntries((implicitSurfaces || []).map((sf) => [sf.id, sf.name]));
      Object.entries(implicitMeshesRef.current || {}).forEach(([id, mesh]) => {
        if (!mesh?.visible || !mesh.geometry?.attributes?.position) return;
        const pos = mesh.geometry.attributes.position.array, n = pos.length / 3;
        const tris = mesh.geometry.index ? mesh.geometry.index.array : Uint32Array.from({ length: n }, (_, i) => i);
        // scene -> world: E = x + ox, N = oy - z, Z = y + oz (as the section cut)
        const segs = meshPlanCut(n, tris, (i) => ({ x: pos[i * 3] + o.x, y: o.y - pos[i * 3 + 2], z: pos[i * 3 + 1] + o.z }), rl);
        if (segs.length) surfaceCuts.push({ id, name: nameOf[id] || String(mesh.userData?.tip || id).split("\n")[0], color: `#${(mesh.material?.color?.getHex?.() ?? 0xc8a24a).toString(16).padStart(6, "0")}`, segs });
      });
    }
    const planned = [];
    (plannedHoles || []).forEach((ph) => {
      const tr = plannedHoleTrace(ph);
      if (!tr?.length) return;
      const runs = slabRuns(tr, zmin, zmax), pierce = piercePoints(tr, rl);
      planned.push({ name: ph.name || ph.id, collar: [tr[0].x, tr[0].y], lines: tracePolylines(tr, runs), pierce, context: tr.map((p) => [p.x, p.y]) });
    });
    const legendSeen = new Set(), legendItems = [];
    [...planIntervals, ...structures].forEach((r) => { const key = `${r.label}|${r.color}`; if (!legendSeen.has(key) && !/^(Geotech|Recovery|Specific gravity)/.test(r.label)) { legendSeen.add(key); legendItems.push([r.label, r.color]); } });
    legendItems.sort((a, b) => a[0].localeCompare(b[0]));
    return { rl, half, holes, intervals: planIntervals, points: planPoints, structures, voxelSlices, surfaceCuts, planned, legendItems };
  };

  // TASKS.csv — cross-section contact drawing. Every launched section is auto-registered in
  // store.sections (id/name/geometry, no contacts yet) the moment it opens, so the pop-out window
  // always has somewhere to persist interpreted contacts to — no separate "save this section" step
  // the user has to remember before drawing. Re-launching the SAME geometry from a fresh 2-point pick
  // still creates a new section entry (matches the pre-existing ephemeral behavior); reopening a
  // previously-saved one goes through reopenSection below instead, which reuses its id/name so drawn
  // contacts keep accumulating on it.
  // TASKS.csv #631 — georeferenced section images lying on this section's line, drawn behind its holes and contacts
  // (lib/sectionGeoref.js sectionImagesOnSection, loaded on demand); each carries its picture for the section window.
  const sectionImagesFor = async (a, b, corridor) => {
    if (!sectionImages.length) return [];
    const { sectionImagesOnSection } = await import("../lib/sectionGeoref.js");
    return sectionImagesOnSection(sectionImages, { ax: a.x, ay: a.y, bx: b.x, by: b.y }, corridor).map((m) => {
      const im = sectionImages.find((i) => i.id === m.id);
      return { ...m, dataUrl: im.dataUrl, width: im.width, height: im.height };
    });
  };
  const launchSection = async () => {
    const [a, b] = sectionPts.current;
    const corridor = sectionCorridor;
    const { azimuth, holes, intervals, points, planes, elevationProfile, legendItems, voxelSlices, surfaceTraces, plannedHoles: plannedOnSection, modelBackdrop } = buildSectionPayload(a, b, corridor);
    const id = `sect_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const name = `Section ${azimuth.toFixed(0)}°`;
    upsertSection({ id, name, ax: a.x, ay: a.y, bx: b.x, by: b.y, azimuth, corridor, contacts: [] });
    // lithoUnits: the same distinct-litho-value list the Modelling tab's unit pickers use (litho_units
    // above) — passed through so the pop-out's "Draw contact" flow can offer a real unit picker instead
    // of a freeform typed name (see SectionWindow.jsx's finishContact comment for why: a contact tied
    // to an actual litho unit, tagged as that unit's upper contact, is what #98 needs to feed drawn
    // contacts into 3D surface generation as real interface points later).
    const sectionImgs = await sectionImagesFor(a, b, corridor);
    openSectionWindow({ id, title: name, section: { ax: a.x, ay: a.y, bx: b.x, by: b.y, azimuth, corridor }, holes, intervals, points, planes, contacts: [], lithoUnits: litho_units, unitTags: sectionUnitTags, elevationProfile, legendItems, voxelSlices, surfaceTraces, plannedHoles: plannedOnSection, sectionImages: sectionImgs, modelBackdrop,
      ghostStrings: (await import("../lib/sectionDigitise.js")).ghostStrings({ id, ax: a.x, ay: a.y, bx: b.x, by: b.y }, sections), /* on use: #903 */ outlineNames: outlineNamesOf(sections) }); // #519; outlineNames: #874
  };

  const reopenSection = useCallback(async (s, { quiet = false } = {}) => { // quiet: TASKS.csv #876 — refresh an open window only
    const a = { x: s.ax, y: s.ay }, b = { x: s.bx, y: s.by };
    const { holes, intervals, points, planes, elevationProfile, legendItems, voxelSlices, surfaceTraces, plannedHoles: plannedOnSection, modelBackdrop } = buildSectionPayload(a, b, s.corridor, s.scope || {}, s.id);
    const sectionImgs = await sectionImagesFor(a, b, s.corridor);
    openSectionWindow({ id: s.id, title: s.name, section: { ax: s.ax, ay: s.ay, bx: s.bx, by: s.by, azimuth: s.azimuth, corridor: s.corridor }, holes, intervals, points, planes, contacts: s.contacts || [], labels: s.labels || null, lithoUnits: litho_units, unitTags: sectionUnitTags, elevationProfile, legendItems, voxelSlices, surfaceTraces, plannedHoles: plannedOnSection, sectionImages: sectionImgs, modelBackdrop,
      ghostStrings: (await import("../lib/sectionDigitise.js")).ghostStrings(s, sections), /* on use: #903 */ outlineNames: outlineNamesOf(sections), ...(quiet ? { refreshOnly: true, ifOpen: true } : {}) }); // #519 — the neighbouring sections' strings; outlineNames: #874; quiet: #876
  }, [layers, layerVisible, customLayers, customVisible, assays, assayVisible, assayDisplayElements, assayStyle, isRowVisible, effectiveColor, effectiveLabel, numericLayerColor, litho_units, sectionUnitTags, terrain, voxelModels, implicitSurfaces, plannedHoles, sections, sectionImages, lastLithBlock, pierceSurfaces]); // pierceSurfaces: #1010

  // TASKS.csv #876 — the section window's ‹ › (previous / next parallel section) and Refresh
  const sectionStepRef = useRef(null);
  sectionStepRef.current = async ({ id, step, refresh }) => {
    const s = (sections || []).find((x) => x.id === id);
    if (!s) return;
    if (refresh) { reopenSection(s); return; }
    const { stepSection } = await import("../lib/sectionDigitise.js"); // on use: #903
    const r = stepSection(s, sections, step, { fallback: Math.max(25, 2 * (s.corridor || sectionCorridor || 25)) });
    if (r.existing) { reopenSection(r.existing); return; }
    const off = Math.round(r.offset);
    openDefinedSection(r.create, `${s.name} ${off > 0 ? "+" : ""}${off} m`);
  };
  useEffect(() => {
    const on = (e) => sectionStepRef.current?.(e.detail || {});
    window.addEventListener("geostrix-section-step", on);
    return () => window.removeEventListener("geostrix-section-step", on);
  }, []);
  // ... and open section windows follow an explicit surface's rebuild: their surface traces are redrawn quietly (a
  // closed window is not reopened, the focus stays where it is, what is being drawn there is kept)
  const explicitBuildKey = (implicitSurfaces || []).filter((x) => x.type === "explicit_surface").map((x) => `${x.id}:${x.params?.builtAt || ""}`).join("|");
  const firstExplicitKey = useRef(explicitBuildKey);
  useEffect(() => {
    if (explicitBuildKey === firstExplicitKey.current) return undefined; // not on load
    firstExplicitKey.current = explicitBuildKey;
    const t = setTimeout(() => { for (const s of sections || []) reopenSection(s, { quiet: true }); }, 800);
    return () => clearTimeout(t);
  }, [explicitBuildKey]); // sections / reopenSection are read at that moment

  // TASKS.csv #393 — sections defined by numbers rather than two clicks: saved to the Cross-sections list
  // (same shape as a drawn one) and opened at once.
  const openDefinedSection = (geom, name) => {
    const s = { id: `sect_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name, ax: geom.ax, ay: geom.ay, bx: geom.bx, by: geom.by, azimuth: geom.azimuth, corridor: sectionCorridor, contacts: [] };
    upsertSection(s);
    reopenSection(s);
    return s;
  };
  const openTypedSection = () => {
    let e = Number(typedSection.e), n = Number(typedSection.n);
    if (typedSection.e === "" || typedSection.n === "" || !Number.isFinite(e) || !Number.isFinite(n)) {
      const ts = tracesRef.current;
      if (!ts.length) { setNotices((p) => [...p, notice("Enter a centre easting and northing — there are no drillholes to centre the section on.")]); return; }
      const xs = ts.flatMap((t) => t.wx), ys = ts.flatMap((t) => t.wy);
      e = (arrMin(xs) + arrMax(xs)) / 2; n = (arrMin(ys) + arrMax(ys)) / 2;
    }
    const g = sectionFromCentre({ e, n, azimuth: Number(typedSection.azimuth) || 0, length: Number(typedSection.length) || 500 });
    openDefinedSection(g, `Section ${Math.round(e)}E ${Math.round(n)}N az ${g.azimuth.toFixed(0)}°`);
  };
  const openHoleSection = useCallback((holeId) => {
    const t = tracesRef.current.find((x) => x.hole_id === holeId);
    const g = t && sectionThroughHole(t.wx, t.wy, { fallbackAzimuth: Number(typedSection.azimuth) || 0 });
    if (!g) { setNotices((p) => [...p, notice("{holeId} has no desurveyed trace to cut a section through.", { holeId })]); return; }
    openDefinedSection(g, `Section through ${holeId} (az ${g.azimuth.toFixed(0)}°)`);
    if (g.vertical) setNotices((p) => [...p, notice("{holeId} is vertical, so it has no bearing of its own — the section runs at the typed azimuth, {azimuth}°.", { holeId, azimuth: g.azimuth.toFixed(0) })]);
  }, [typedSection.azimuth, sectionCorridor, reopenSection, upsertSection]);

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
      setNotices((p) => [...p, notice("Slice series needs a visible voxel/block model or at least one drillhole to know what extent to cover — nothing found.")]);
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

    // TASKS.csv #393 — lines sit on ROUND multiples of the spacing (and are named by that grid line,
    // e.g. "412500E"), as sections on a paper plan are, instead of wherever the data happened to start.
    const lines = fenceLines(tMin, tMax, width, sliceSeriesAzimuth);
    const n = lines.length;

    // TASKS.csv #240 — user report: a single run against a large voxel model produced 3144
    // individual sections with no group to manage them as a unit. Every section this run creates is
    // tagged with ONE shared groupId so the sidebar can collapse them into a single row and
    // deleteSectionGroup can clear the whole run in one action.
    const groupId = addSectionGroup(`Fence series (az ${sliceSeriesAzimuth.toFixed(0)}°, ${width}m)`);
    let created = 0;
    for (let i = 0; i < n; i++) {
      const tCenter = lines[i].t;
      const a = { x: sMin * dirX + tCenter * perpX, y: sMin * dirY + tCenter * perpY };
      const b = { x: sMax * dirX + tCenter * perpX, y: sMax * dirY + tCenter * perpY };
      const id = `sect_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`;
      const name = `Fence ${i + 1}/${n} ${lines[i].name} (az ${sliceSeriesAzimuth.toFixed(0)}°, ${width}m)`;
      upsertSection({ id, name, ax: a.x, ay: a.y, bx: b.x, by: b.y, azimuth: sliceSeriesAzimuth, corridor: width / 2, contacts: [], groupId });
      created++;
    }
    setNotices((p) => [...p, notice(created === 1 ? "Generated {created} section at azimuth {sliceSeriesAzimuth}° — in the Cross-sections list." : "Generated {created} sections spaced {width}m apart at azimuth {sliceSeriesAzimuth}° — grouped together in the Cross-sections list.", { created, width, sliceSeriesAzimuth: sliceSeriesAzimuth.toFixed(0) })]);
  }, [sliceSeriesAzimuth, sliceSeriesWidth, voxelModels, upsertSection, addSectionGroup]);

  // TASKS.csv #441 — any commit of this component may have changed the scene (its effects just ran), so
  // wake the render loop from deep idle. Deliberately no dependency array.
  useEffect(() => { lastActivityRef.current = Date.now(); });

  return (
    <div style={{ display: visible ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0, width: "100%" }}>
      {mode === "view" && (
        <ViewToolbar
          onLevelPlan={() => { if (!tracesRef.current.length) { setNotices((p) => [...p, notice("Load collars first — a level plan cuts the drillholes at an elevation.")]); return; } setLevelPlanOpen(true); }}
          openPopover={openPopover} setOpenPopover={setOpenPopover}
          gridConfig={gridConfig} setGridConfig={setGridConfig}
          figureOverlay={figureOverlay} setFigureOverlay={setFigureOverlay} projectName={project?.name || ""} legendCount={overlayLegendGroups.reduce((n, g) => n + g.items.length + (g.ramp ? 1 : 0), 0)}
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
          show={visible} paneProps={paneProps}
        />
      )}
      {/* TASKS.csv #458 — 3D Modelling ribbon: each modelling tool opens as a pane at the top of the sidebar
          (the generated surfaces and domains stay below it); the analysis plots open directly. */}
      {mode === "modelling" && (
        <Ribbon show={visible} label="3D Modelling tools">
          <RibbonGroup advanced label="Setup">
            <RibbonButton icon={Settings} label="Model settings" tone="model" title="Domain, intercept set, contact orientations, resolution, stiffness, search ellipsoid, anisotropy" {...paneProps("settings")} />
            <RibbonButton icon={Group} label="Litho groups" tone="model" title="Lump lithology codes into modelling units" {...paneProps("groups")} />
            <RibbonButton icon={Waypoints} label="Modelling codes" tone="model" title="Give intervals modelling codes (alternating flows), connect units between holes, set roles and pile order" {...paneProps("mcodes")} />
            <RibbonButton icon={GitCompare} label="Correlation" tone="model" title="Section correlation" {...paneProps("correlation")} />
          </RibbonGroup>
          {/* TASKS.csv #750 — Matt: "predictive could go into 3d modelling as a tool, geoML modelling group. the other one should
              be named gempy modelling group" */}
          <RibbonGroup label="GemPy modelling">
            <RibbonButton icon={Mountain} label="Implicit surface" tone="model" title="Model one unit's top surface (GemPy)" {...paneProps("implicit")} />
            <RibbonButton advanced icon={Layers} label="Strat. stack" tone="model" title="Model a stratigraphic stack of units together (GemPy)" {...paneProps("stack")} />
            <RibbonButton icon={MapIcon} label="Model from map" tone="model" title="A 3D model from the geological map and outcrop measurements alone, no drillholes needed (GemPy)" {...paneProps("mapmodel")} />{/* TASKS.csv #817 */}
          </RibbonGroup>
          {/* TASKS.csv #811 — Matt: "a tool specifically for explicit modelling ... the hard line of the modelled surface" */}
          <RibbonGroup label="Explicit modelling">
            <RibbonButton icon={PenTool} label="Explicit surface" tone="model" title="A surface exactly through your own picks in 3D and lines drawn on sections" {...paneProps("explicit")} />
          </RibbonGroup>
          <RibbonGroup label="geoML modelling">
            <RibbonButton icon={Sparkles} label="geoML models" tone="model" title="Rock-unit and grade models with uncertainty (geoML, Gaussian processes — optional add-on)" {...paneProps("geoml")} />
          </RibbonGroup>
          <RibbonGroup label="Structure">
            <RibbonButton advanced icon={Compass} label="Structures" tone="model" title="Structural modelling from structure picks" {...paneProps("structural")} />
            <RibbonButton icon={Target} label="Stereonet" tone="analyse" title="Stereonet of structure picks (and outcrop measurements)" onClick={() => setStereonetOpen(true)} />
            <RibbonButton advanced icon={Activity} label="Downhole plot" tone="analyse" title="Downhole structure (tadpole) plot" onClick={() => setTadpoleOpen(true)} />
            <RibbonButton advanced icon={Crosshair} label="Core orient." tone="analyse" title="Core orientation (alpha-beta) calculator for non-oriented core" onClick={() => setCoreOrientOpen(true)} />
          </RibbonGroup>
          <RibbonGroup advanced label="Alteration & veins">
            <RibbonButton icon={Droplets} label="Alteration" tone="model" title="Alteration modelling" {...paneProps("alteration")} />
            <RibbonButton icon={Waves} label="Veins / dykes" tone="model" title="Vein / dyke modelling" {...paneProps("vein")} />
          </RibbonGroup>
          <RibbonGroup label="Grade">
            <RibbonButton icon={Gem} label="Grade shell" tone="model" title="Numeric implicit model (grade shell)" {...paneProps("shell")} />
            <RibbonButton icon={Calculator} label="Estimation" tone="model" title="Grade estimation into block models" {...paneProps("gradeEst")} />
            <RibbonButton advanced icon={Spline} label="Variogram" tone="analyse" title="Variogram / spatial continuity" onClick={() => setVariogramOpen(true)} />
          </RibbonGroup>
          <RibbonGroup advanced label="Check">
            <RibbonButton icon={Rows3} label="Fence diagram" tone="analyse" title="Fence / panel correlation diagram" onClick={() => setFenceOpen(true)} />
            <RibbonButton icon={Ruler} label="Surface query" tone="analyse" title="Distance to surfaces / point-in-domain report" onClick={() => setSurfaceQueryOpen(true)} />
          </RibbonGroup>
        </Ribbon>
      )}
      {/* TASKS.csv #820 — Surface Geology ribbon: the mapping workflow (3D model building stays in 3D Modelling) */}
      {mode === "surface" && (
        <Ribbon show={visible} label="Surface geology tools">
          <RibbonGroup label="Geological mapping">
            <RibbonButton icon={MapIcon} label="Geology map" tone="data" title="Geology map layers (GeoPackage / shapefile / MapInfo TAB): import, colour by unit, drape on the terrain" {...paneProps("sgMaps")} />
            <RibbonButton icon={Compass} label="Outcrop structures" tone="data" title="Outcrop structure measurements (CSV / MapInfo points): bedding, foliation, faults, veins" {...paneProps("sgStructs")} />
            <RibbonButton icon={Target} label="Stereonet" tone="analyse" title="Stereonet of the outcrop measurements (and any downhole structure picks)" onClick={() => setStereonetOpen(true)} />
          </RibbonGroup>
          <RibbonGroup label="Next step">
            <RibbonButton icon={Mountain} label="Model it" tone="model" title="Build a 3D model from this map and these measurements: opens 3D Modelling > Model from map" onClick={() => { pendingPaneRef.current = "mapmodel"; store.goToModule("modelling"); }} />
          </RibbonGroup>
        </Ribbon>
      )}
      {/* TASKS.csv #458 — Targeting ribbon */}
      {mode === "targeting" && (
        <Ribbon show={visible} label="Targeting tools">
          <RibbonGroup label="Targets">
            <RibbonButton advanced icon={Box} label="Voxel ranges" tone="view" title="Isolate a value band of a geophysical / block model" {...paneProps("ranges")} />
            <RibbonButton icon={Layers} label="Evidence overlay" tone="model" title="Where the evidence agrees: fuzzy overlay of rasters, map-layer distances and geochemistry; weights of evidence against known occurrences" {...paneProps("overlay")} />{/* TASKS.csv #851 */}
            <RibbonButton icon={Target} label="Planned holes" tone="model" title="Design planned drillholes and check them" {...paneProps("plan")} />
            <RibbonButton icon={MapPin} label="Pick collar" tone="model" active={pickHoleMode} title="Click the 3D view to place a planned hole's collar" onClick={() => { setToolPane("plan"); setPickHoleMode((v) => !v); }} />
          </RibbonGroup>
          <RibbonGroup label="Export planned holes">
            <RibbonButton icon={FileSpreadsheet} label="CSV" tone="output" disabled={!plannedHoles.length} disabledReason="Plan a hole first" title="Collar and toe in project coordinates and lat/lon, azimuth against grid, true and magnetic north" onClick={() => exportPlannedHoles("csv")} />
            <RibbonButton advanced icon={Globe} label="KML" tone="output" disabled={!plannedHoles.length} disabledReason="Plan a hole first" title="Google Earth / phone maps" onClick={() => exportPlannedHoles("kml")} />
            <RibbonButton advanced icon={MapPin} label="GPX" tone="output" disabled={!plannedHoles.length} disabledReason="Plan a hole first" title="Handheld GPS: collar waypoints" onClick={() => exportPlannedHoles("gpx")} />
          </RibbonGroup>
        </Ribbon>
      )}
      <div className="ge-body" style={{ width: "100%" }} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
      <div className="ge-panel-outer" style={{ width: sidebarWidth, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--color-bg)", borderRight: "1px solid var(--color-border)" }}>
      <div className="ge-panel" style={{ padding: "16px 14px", border: "none", width: "100%", flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
        {sidebarTab === "home" && (<>
        {/* TASKS.csv #458 — tool panes opened from the ribbon, above the data */}
        {toolPane === "sectionCoords" && (<>
        {paneHeader("Section by coordinates", Crosshair, "section")}
        {/* TASKS.csv #393 — a section typed as numbers (blank centre = centre of the drilling) */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6, fontSize: "var(--font-size-sm)" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>{tr("Centre E")}<input value={typedSection.e} placeholder={tr("data centre")} onChange={(e) => setTypedSection((s) => ({ ...s, e: e.target.value.replace(/[^0-9.\-]/g, "") }))} style={typedSectionInput} aria-label={tr("Section centre easting")} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>{tr("Centre N")}<input value={typedSection.n} placeholder={tr("data centre")} onChange={(e) => setTypedSection((s) => ({ ...s, n: e.target.value.replace(/[^0-9.\-]/g, "") }))} style={typedSectionInput} aria-label={tr("Section centre northing")} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>{tr("Azimuth (°)")}<input type="number" min="0" max="360" value={typedSection.azimuth} onChange={(e) => setTypedSection((s) => ({ ...s, azimuth: e.target.value }))} style={typedSectionInput} aria-label={tr("Section azimuth")} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>{tr("Length (m)")}<input type="number" min="10" step="50" value={typedSection.length} onChange={(e) => setTypedSection((s) => ({ ...s, length: e.target.value }))} style={typedSectionInput} aria-label={tr("Section length")} /></label>
        </div>
        <button onClick={openTypedSection} style={{ ...pBtn, marginBottom: 4 }} title={tr("Opens a vertical section along the azimuth, centred on the point, with the section tool's Buffer ({sectionCorridor} m). The scissors on each hole in the Holes list cut one in the plane of that hole.", { sectionCorridor })}><Scissors size={14} />{" "}{tr("Open section")}</button>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 12 }}>{tr("Buffer {sectionCorridor} m (set on the section tool). Scissors in the Holes list: a section through that hole.", { sectionCorridor })}</div>

        </>)}
        {toolPane === "slice3d" && (<>
        {paneHeader("3D slice", SquareSplitVertical, "section")}
        {/* TASKS.csv #453 — live 3D slice through everything in the view */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, fontSize: "var(--font-size-base)" }}>
          <span>{tr("Slice the view")}</span>
          <label style={{ display: "flex", alignItems: "center", gap: 4, textTransform: "none", letterSpacing: 0, fontSize: "var(--font-size-sm)", cursor: "pointer" }}>
            <input type="checkbox" checked={slice3d.on} onChange={(e) => setSlice3d((s) => ({ ...s, on: e.target.checked }))} aria-label={tr("3D slice on")} />{" "}{tr("On")}</label>
        </div>
        {slice3d.on && (
          <div style={{ marginBottom: 12, fontSize: "var(--font-size-sm)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={slice3d.mode} onChange={(e) => setSlice3d((s) => ({ ...s, mode: e.target.value }))} style={{ flex: 1 }} aria-label={tr("Slice orientation")}>
                <option value="vertical">{tr("Vertical slab")}</option>
                <option value="horizontal">{tr("Horizontal (level plan)")}</option>
              </select>
              {slice3d.mode === "vertical" && (
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>{tr("Az")}{" "}<input type="number" min="0" max="180" value={slice3d.azimuth} onChange={(e) => setSlice3d((s) => ({ ...s, azimuth: ((Number(e.target.value) % 180) + 180) % 180 }))} style={{ width: 56 }} aria-label={tr("Slice azimuth")} />°</label>
              )}
            </div>
            <input type="range" min="0" max="1" step="0.002" value={slice3d.pos} onChange={(e) => setSlice3d((s) => ({ ...s, pos: Number(e.target.value) }))} aria-label={tr("Slice position")} />
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Thickness")}{" "}<input type="number" min="0" step="5" value={slice3d.thickness} onChange={(e) => setSlice3d((s) => ({ ...s, thickness: Math.max(0, Number(e.target.value) || 0) }))} style={{ width: 64 }} aria-label={tr("Slice thickness")} /> m
              <span style={{ color: "var(--color-text-muted)" }}>{slice3d.thickness > 0 ? "slab" : tr("0 = everything beyond the cut")}</span>
            </label>
            <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>{sliceReadout}</div>
          </div>
        )}

        </>)}
        {toolPane === "fence" && (<>
        {paneHeader("Slice series (fence sections)", Rows3, "section")}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Cuts the visible voxel model(s)/drilling into equal-width parallel sections at a fixed azimuth — each one added to the list below, ready to open individually. Includes the geophysics voxel slice automatically, same as any other section.")}</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField, flex: 1 }}>{tr("Azimuth (°)")}<input type="number" min="0" max="359" step="1" value={sliceSeriesAzimuth} onChange={(e) => setSliceSeriesAzimuth(((Number(e.target.value) || 0) % 360 + 360) % 360)} style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
          </label>
          <label style={{ ...miniField, flex: 1 }}>{tr("Width (m)")}<input type="number" min="1" step="10" value={sliceSeriesWidth} onChange={(e) => setSliceSeriesWidth(Math.max(1, Number(e.target.value) || 50))} style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
          </label>
          <button onClick={generateSliceSeries} style={{ ...pBtn, width: "auto", flexShrink: 0, marginBottom: 0, alignSelf: "flex-end", padding: "6px 10px" }} title={tr("Generate the slice series")}><Scissors size={14} />{" "}{tr("Generate")}</button>
        </div>

        <div style={{ marginBottom: 12 }} />
        </>)}
        {toolPane && <div className="ge-pane-end" role="separator" />}{/* #458 */}
        <div className="ge-section-label">{tr("Geometry")}</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <button onClick={() => fileInputs.current.collar.click()} onContextMenu={(e) => { if (!collars.length) return; e.preventDefault(); setLayerContextMenu({ key: "__collars__", label: "Collars", x: e.clientX, y: e.clientY }); }} style={{ ...pBtn, marginBottom: 0, flex: 1 }} title={tr("Import collars — CSV, shapefile (.zip/.shp), or GeoPackage (.gpkg) — right-click for export/inspect")}><Upload size={14} />{" "}{tr("Collars {v}", { v: collars.length ? `(${collars.length})` : "" })}</button>
          {collars.length > 0 && <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={clearCollars} style={iconBtn} title={tr("Remove all collars")}><Trash2 size={14} /></div>}
        </div>
        <input ref={setInputRef("collar")} type="file" multiple accept=".csv,.xlsx,.zip,.gpkg,.shp,.dbf,.prj,.cpg,.shx,.kml,.kmz,.las" style={{ display: "none" }} onChange={(e) => { const f = groupShapefileParts(Array.from(e.target.files)).files[0]; if (f) openImportModal(f, "collars"); e.target.value = ""; }} />
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <button onClick={() => fileInputs.current.survey.click()} onContextMenu={(e) => { if (!survey.length) return; e.preventDefault(); setLayerContextMenu({ key: "__survey__", label: "Survey", x: e.clientX, y: e.clientY }); }} style={{ ...pBtn, marginBottom: 0, flex: 1 }} title={tr("Import survey — CSV, shapefile (.zip/.shp), or GeoPackage (.gpkg) — right-click for export/inspect")}><Upload size={14} />{" "}{tr("Survey {v}", { v: survey.length ? `(${survey.length})` : "" })}</button>
          {survey.length > 0 && <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={clearSurvey} style={iconBtn} title={tr("Remove all survey stations")}><Trash2 size={14} /></div>}
        </div>
        <input ref={setInputRef("survey")} type="file" multiple accept=".csv,.xlsx,.zip,.gpkg,.shp,.dbf,.prj,.cpg,.shx,.kml,.kmz,.las" style={{ display: "none" }} onChange={(e) => { const f = groupShapefileParts(Array.from(e.target.files)).files[0]; if (f) openImportModal(f, "survey"); e.target.value = ""; }} />

        {/* TASKS.csv #131 — hole (collar) labels, QGIS-specialist audit finding: GeoStrix had no text
            labeling anywhere in the 3D scene at all. Scoped to a small fixed set of label contents
            rather than a full expression language — see holeLabelMode's own declaration comment. Only
            shown once there's something to label, same "don't clutter the sidebar with nothing to
            show" convention every other conditional sidebar section here already follows. */}
        {collars.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", flexShrink: 0 }}>{tr("Hole labels")}</span>
            <select
              value={holeLabelMode}
              onChange={(e) => setHoleLabelMode(e.target.value)}
              style={{ flex: 1, minWidth: 0, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }}
            >
              <option value="none">{tr("Off")}</option>
              <option value="hole_id">{tr("Hole ID")}</option>
              <option value="hole_id_z">{tr("Hole ID + elevation")}</option>
              <option value="hole_id_depth">{tr("Hole ID + total depth")}</option>
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
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <MapPin size={12} />{" "}{tr("Select by location")}</div>
            <select value={selectByLocationBoundaryId} onChange={(e) => setSelectByLocationBoundaryId(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", marginBottom: 5 }}>
              <option value="">{tr("— pick a boundary/claim —")}</option>
              {boundaries.map((b) => <option key={b.id} value={b.id}>{b.name}{b.kind === "claim" ? tr(" (claim)") : ""}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => selectByLocation("isolate")} disabled={!selectByLocationBoundaryId} style={{ ...pBtn, flex: 1, marginBottom: 0, opacity: selectByLocationBoundaryId ? 1 : 0.5, cursor: selectByLocationBoundaryId ? "pointer" : "not-allowed" }} title={tr("Show only collars inside this boundary, hide every other hole")}>{tr("Isolate inside")}</button>
              <button onClick={() => selectByLocation("hide")} disabled={!selectByLocationBoundaryId} style={{ ...pBtn, flex: 1, marginBottom: 0, opacity: selectByLocationBoundaryId ? 1 : 0.5, cursor: selectByLocationBoundaryId ? "pointer" : "not-allowed" }} title={tr("Hide collars inside this boundary, leave every other hole as-is")}>{tr("Hide inside")}</button>
            </div>
          </div>
        )}

        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{tr("Layers")}</span>
          {/* TASKS.csv #76 — create a new named group; layers get sorted into it via the right-click
              menu below ("Add to group…"), a lighter-weight interaction than drag-to-group. */}
          <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => askPrompt("New group name:", "", (name) => { if (name && name.trim()) addLayerGroup(name.trim()); })}
            style={{ cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "var(--font-size-xs)", textTransform: "none", letterSpacing: 0 }} title={tr("New layer group")}>{tr("+ Group")}</span>
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
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => toggleLayerGroupCollapsed(g.id)} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} title={g.collapsed ? tr("Expand group") : tr("Collapse group")}>
                {g.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </div>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                onClick={() => askPrompt("Rename group:", g.name, (name) => { if (name && name.trim()) renameLayerGroup(g.id, name.trim()); })} title={tr("Click to rename")}>
                {g.name} <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>({populatedKeys.length})</span>
              </div>
              {/* Bulk show/hide every layer currently in this group — "on" if ANY member is visible,
                  clicking turns them all off; clicking again (all off) turns them all on. */}
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => { const anyOn = g.keys.some((k) => layerVisible[k]); g.keys.forEach((k) => { if (anyOn ? layerVisible[k] : !layerVisible[k]) toggleLayer(k); }); }}
                style={{ cursor: "pointer", color: g.keys.some((k) => layerVisible[k]) ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }} title={tr("Toggle all layers in this group")}>
                {g.keys.some((k) => layerVisible[k]) ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { if (window.confirm(tr("Delete group \"{name}\"? Its layers stay — they just go back to being ungrouped.", { name: g.name }))) deleteLayerGroup(g.id); }, tr("Delete group \"{name}\" (its layers stay, just ungrouped)", { name: g.name }))} />
            </div>
            {!g.collapsed && (
              <div style={{ padding: "6px 6px 2px" }}>
                {populatedKeys.length === 0
                  ? <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", padding: "2px 4px 6px" }}>{g.keys.length === 0 ? tr("Empty — right-click a layer below and \"Add to group…\"") : tr("Every layer in this group is currently empty (no data loaded).")}</div>
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
            style={{ width: "100%", background: "var(--color-bg-subtle)", border: "1px dashed var(--color-border-light)", borderRadius: 6, padding: "7px 8px", color: "var(--color-text-secondary)", fontSize: "var(--font-size-base)", marginBottom: 4 }}
          >
            <option value="">{tr("+ Add layer…")}</option>
            {emptyLayerKeys.map((key) => <option key={key} value={key}>{LAYER_META[key].label}</option>)}
          </select>
        )}
        {emptyLayerKeys.filter((key) => key !== "geophys_pts").map((key) => (
          <input key={key} ref={setInputRef(key)} type="file" multiple accept=".csv,.xlsx,.zip,.gpkg,.shp,.dbf,.prj,.cpg,.shx,.kml,.kmz,.las" style={{ display: "none" }} onChange={(e) => { const f = groupShapefileParts(Array.from(e.target.files)).files[0]; if (f) openImportModal(f, key); e.target.value = ""; }} />
        ))}

        {/* User request: rasters/terrain show up as toggleable layer rows here too, not just inside
            the Geophysics module's own import panel — and only once something's actually been
            imported, not as a permanent empty section (same "don't clutter the sidebar with nothing
            to show" request that applies to the layer rows above). */}
        {(rasters.length > 0 || terrain) && (
          <>
            <div className="ge-section-label" style={{ marginTop: 16 }}>{tr("Rasters & terrain")}</div>
            {terrain && (
              <div onContextMenu={(e) => openRowMenu(e, terrain.name, [
                  { label: terrain.visible === false ? "Show" : "Hide", onClick: () => updateTerrain?.({ visible: terrain.visible === false }) },
                  { label: tr("Zoom to"), onClick: () => zoomToObject(terrainMeshRef.current) },
                  "-", { label: tr("Colour, drape and remove — Geophysics tab"), onClick: () => goToModule("geophysics") }])} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateTerrain?.({ visible: terrain.visible === false })} style={{ cursor: "pointer", color: terrain.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                  {terrain.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
                </div>
                <Mountain size={14} style={{ color: terrain.color || "var(--color-text-secondary)", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{terrain.name}</span>
                <input
                  type="range" min={0.1} max={1} step={0.05} value={terrain.opacity ?? 1}
                  onChange={(e) => updateTerrain?.({ opacity: Number(e.target.value) })}
                  style={{ width: 46, flexShrink: 0 }} title={tr("Opacity")}
                />
                {/* Color/opacity are also editable right here inline (terrain has no other exotic
                    settings the way rasters' drape-mode/elevation do), but the jump still goes to
                    Geophysics — that's where SRTM/DEM was imported from and where "Remove terrain"
                    lives — for consistency with every other row's edit-jump icon. */}
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("geophysics"), tr("Edit or remove this geophysics layer in the Geophysics tab"))} />
              </div>
            )}
            {rasters.map((r) => (
              <div key={r.id} onContextMenu={(e) => openRowMenu(e, r.name, [
                  { label: r.visible === false ? "Show" : "Hide", onClick: () => updateRaster(r.id, { visible: r.visible === false }) },
                  { label: tr("Zoom to"), onClick: () => zoomToObject(rasterMeshesRef.current[r.id]) },
                  "-", { label: tr("Drape and elevation — Maps tab"), onClick: () => goToModule("maps") },
                  { label: tr("Remove…"), onClick: () => { if (confirmDestructive(tr("Remove raster \"{name}\"?", { name: r.name }))) removeRaster(r.id); } }])} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateRaster(r.id, { visible: r.visible === false })} style={{ cursor: "pointer", color: r.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                  {r.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
                </div>
                <Image size={14} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <input
                  type="range" min={0.1} max={1} step={0.05} value={r.opacity ?? 0.85}
                  onChange={(e) => updateRaster(r.id, { opacity: Number(e.target.value) })}
                  style={{ width: 46, flexShrink: 0 }} title={tr("Opacity")}
                />
                {/* User request ("I wanna be able to edit them from there"): jump to the full raster
                    editor (drape mode terrain/flat, fixed elevation) — the sidebar row only has room
                    for the two quick controls every layer type gets (visibility + opacity), same as
                    the Geophysics section's own ArrowUpRight pattern right below this one. */}
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("maps"), tr("Edit drape mode / elevation for this raster in the Raster tab"))} />
                <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { if (confirmDestructive(tr("Remove raster \"{name}\"?", { name: r.name }))) removeRaster(r.id); }, tr("Remove raster \"{name}\"", { name: r.name }))} />{/* #1088 — confirmed like its menu's Remove… (rasters are not undoable) */}
              </div>
            ))}
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 10 }}>{tr("Imported via the Raster module")}</div>
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
            <div className="ge-section-label" style={{ marginTop: 16 }}>{tr("Geophysics")}</div>
            {boundaries.map((b) => (
              <div key={b.id} onContextMenu={(e) => openRowMenu(e, b.name, [
                  { label: b.visible === false ? "Show" : "Hide", onClick: () => updateBoundary(b.id, { visible: b.visible === false }) },
                  { label: tr("Zoom to"), onClick: () => zoomToObject(boundaryLinesRef.current[b.id]) },
                  "-", ...overlayExportItems(b.name, async () => (await overlayLib()).boundaryFeatures(b), { kml: { colorOf: () => b.color, nameOf: () => b.name } }), // #1025
                  "-", { label: tr("Colour and style — Geophysics tab"), onClick: () => goToModule("geophysics") },
                  { label: tr("Remove…"), onClick: () => { if (confirmDestructive(tr("Remove boundary \"{name}\"?", { name: b.name }))) removeBoundary(b.id); } }])} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateBoundary(b.id, { visible: b.visible === false })} style={{ cursor: "pointer", color: b.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                  {b.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
                </div>
                <Shapes size={14} style={{ color: b.color || "var(--color-text-secondary)", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
                <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>{tr("boundary")}</span>
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("geophysics"), tr("Edit boundary \"{name}\" in the Geophysics tab", { name: b.name }))} />
                <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { if (confirmDestructive(tr("Remove boundary \"{name}\"?", { name: b.name }))) removeBoundary(b.id); }, tr("Remove boundary \"{name}\"", { name: b.name }))} />
              </div>
            ))}
            {omfObjects.map((o) => (
              <div key={o.id} onContextMenu={(e) => openRowMenu(e, o.name, [
                  { label: o.visible === false ? "Show" : "Hide", onClick: () => updateOmfObject(o.id, { visible: o.visible === false }) },
                  { label: tr("Zoom to"), onClick: () => zoomToObject(omfMeshesRef.current[o.id]) },
                  "-", { label: tr("Colour and style — Geophysics tab"), onClick: () => goToModule("geophysics") },
                  { label: tr("Remove…"), onClick: () => { if (confirmDestructive(tr("Remove OMF object \"{name}\"?", { name: o.name }))) removeOmfObject(o.id); } }])} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateOmfObject(o.id, { visible: o.visible === false })} style={{ cursor: "pointer", color: o.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                  {o.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
                </div>
                {o.kind === "points" ? <MapPin size={14} style={{ color: o.color || "var(--color-text-secondary)", flexShrink: 0 }} />
                  : o.kind === "lines" ? <Waypoints size={14} style={{ color: o.color || "var(--color-text-secondary)", flexShrink: 0 }} />
                  : <Triangle size={14} style={{ color: o.color || "var(--color-text-secondary)", flexShrink: 0 }} />}
                <span style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>{tr("OMF {kind}", { kind: o.kind })}</span>
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("geophysics"), tr("Edit OMF object \"{name}\" in the Geophysics tab", { name: o.name }))} />
                <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => removeOmfObject(o.id), tr("Remove OMF object \"{name}\"", { name: o.name }))} />
              </div>
            ))}
            {voxelModels.map((v) => (
              <div key={v.id} onContextMenu={(e) => openRowMenu(e, v.name, [
                  { label: v.visible === false ? "Show" : "Hide", onClick: () => updateVoxelModel(v.id, { visible: v.visible === false }) },
                  { label: tr("Zoom to"), onClick: () => zoomToObject(voxelMeshesRef.current[v.id]) },
                  "-", { label: tr("Legend, classes and palette — Geophysics tab"), onClick: () => goToModule("geophysics") },
                  { label: tr("Remove…"), onClick: () => { if (confirmDestructive(tr("Remove block/voxel model \"{name}\"?", { name: v.name }), { recover: tr("it would have to be re-imported or re-run.") })) removeVoxelModel(v.id); } }])} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateVoxelModel(v.id, { visible: v.visible === false })} style={{ cursor: "pointer", color: v.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                  {v.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
                </div>
                <Box size={14} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
                <input
                  type="range" min={0.1} max={1} step={0.05} value={v.opacity ?? 1}
                  onChange={(e) => updateVoxelModel(v.id, { opacity: Number(e.target.value) })}
                  style={{ width: 46, flexShrink: 0 }} title={(v.cells?.length || 0) > TRANSPARENT_BOX_LIMIT ? tr("Opacity. Over {n} blocks a see-through model is drawn as its outer skin (and, for a unit model, the contacts between units), so it stays fast; use the cutoff or a 3D slice to look inside.", { n: TRANSPARENT_BOX_LIMIT.toLocaleString() }) : tr("Opacity")} /* #904 */
                />
                <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("geophysics"), tr("Edit legend / classify / palette for this model in the Geophysics tab"))} />
                <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { if (confirmDestructive(tr("Remove block/voxel model \"{name}\"?", { name: v.name }), { recover: tr("it would have to be re-imported or re-run.") })) removeVoxelModel(v.id); }, tr("Remove block/voxel model \"{name}\"", { name: v.name }))} />
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
            <div onContextMenu={(e) => openRowMenu(e, `${surfaceSamples.length} surface samples`, [
              { label: layerVisible.surface_samples ? "Hide" : "Show", onClick: () => setLayerVisible((p) => ({ ...p, surface_samples: !p.surface_samples })) },
              { label: tr("Zoom to"), onClick: () => zoomToObject(layerGroupsRef.current.surface_samples) },
              { label: tr("Style (colour, size, shape)…"), onClick: () => openLayerStyle("surface_samples", "Surface samples") },
              // #1025 — every element with its unit, the detection flags, the sample's own columns and its anomaly class
              "-", ...overlayExportItems("surface_samples", async () => (await overlayLib()).surfaceSampleFeatures(surfaceSamples, surfaceElements, surfaceAnomaly ? { result: surfaceAnomaly, drawn: placedSurfaceSamples } : null), {
                kml: { nameOf: (f) => f.attributes.sample_id, colorOf: (f) => (f.attributes.anomalous ? "#d7301f" : "#7a7a7a") },
                csvRows: async () => (await overlayLib()).surfaceSampleRows(surfaceSamples, surfaceElements, surfaceAnomaly ? { result: surfaceAnomaly, drawn: placedSurfaceSamples } : null) }),
              "-", { label: tr("Import or edit samples — Geochem tab"), onClick: () => goToModule("geochem") }])} className="ge-section-label" style={{ marginTop: 16 }}>{tr("Surface samples")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 4 }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setLayerVisible((p) => ({ ...p, surface_samples: !p.surface_samples }))} style={{ cursor: "pointer", color: layerVisible.surface_samples ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                {layerVisible.surface_samples ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <Beaker size={14} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>{tr(surfaceSamples.length === 1 ? "{n} sample" : "{n} samples", { n: surfaceSamples.length })}</span>
              <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("geochem"), tr("Import more assays, or edit them, in the Geochem tab"))} />
            </div>
            {surfaceSamplesUnplaced > 0 && ( // TASKS.csv #606
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", padding: "2px 2px 4px", lineHeight: 1.4 }}>
                {tr(terrain ? "{n} surface sample(s) have no elevation and lie outside the terrain — extend the DEM to cover them." : "{n} surface sample(s) have no elevation and no terrain to sit on — load a DEM or SRTM terrain (Geophysics tab) and they are placed on it.", { n: surfaceSamplesUnplaced })}
              </div>
            )}
            <Suspense fallback={null}><SurfaceAnomalyControls cfg={layerStyles.surface_anomaly} setCfg={(cfg) => setLayerStyles((p) => ({ ...p, surface_anomaly: cfg }))} surfaceSamples={surfaceSamples} surfaceElements={surfaceElements} mapLayers={mapLayers} thresholds={geochemThresholds} result={surfaceAnomaly} drawn={placedSurfaceSamples} /></Suspense>{/* TASKS.csv #843 / #854 */}
            {!surfaceAnomaly && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "2px 2px 8px" }}>
              {Array.from(new Set(surfaceSamples.map((s) => s.medium))).map((m) => (
                <div key={m} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: colorForMedium(m), flexShrink: 0 }} />
                  {m}
                </div>
              ))}
            </div>}
          </>
        )}

        {/* TASKS.csv #155 — Grid and Themes moved off the sidebar into toolbar popovers (Grid3x3 /
            Bookmark icons in the ge-subtoolbar above) — sidebar space is for DATA now, these are
            display settings / saved-view management, i.e. tools. */}

        {assayElements.length > 0 && (
          <>
            <div className="ge-section-label" style={{ marginTop: 16 }}>{tr("Assays")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px 4px" }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAssayVisible((v) => !v)} title={assayVisible ? tr("Hide all assay elements") : tr("Show assay elements")} style={{ cursor: "pointer", color: assayVisible ? "var(--color-accent)" : "var(--color-text-disabled)" }}>{assayVisible ? <Eye size={14} /> : <EyeOff size={14} />}</div>
              <div style={{ flex: 1, fontSize: "var(--font-size-sm)", color: "var(--color-text-caption)" }}>
                {assayDisplayElements.length === 0 ? tr("No elements selected") : tr(assayDisplayElements.length > 1 ? "{n} elements shown" : "{n} element shown", { n: assayDisplayElements.length })}
              </div>
              {assayDisplayElements.length > 0 && (
                <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAssayDisplayElements([])} style={{ cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>{tr("Clear")}</span>
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
                const styled = !!(style && ((style.color && style.color !== defaultHue) || (style.sizeMult != null && style.sizeMult !== 1) || style.minCutoff != null || style.breaks?.length || style.shape || style.opacity != null)); // #649 shape / opacity
                return (
                  <div
                    key={e.symbol}
                    title={on ? tr("Hide {symbol} — right-click for more", { symbol: e.symbol }) : tr("Show {symbol}", { symbol: e.symbol })}
                    onContextMenu={(ev) => openRowMenu(ev, `${e.symbol}${e.unit ? ` (${e.unit})` : ""}`, [ // TASKS.csv #649 — like the other layers (#635)
                      { label: on ? `Hide ${e.symbol}` : `Show ${e.symbol}`, onClick: () => toggleAssayElement(e.symbol) },
                      on && { label: tr("Style (colour, shape, size, classes)…"), onClick: () => setAssayStyleModalSymbol(e.symbol) },
                      on && assayDisplayElements.length > 1 && { label: `Show only ${e.symbol}`, onClick: () => setAssayDisplayElements([e.symbol]) },
                      "-", { label: tr("Import or edit assays — Geochem tab"), onClick: () => goToModule("geochem") }])}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "4px 6px 4px 9px", borderRadius: 12, cursor: "pointer", fontSize: "var(--font-size-base)",
                      // TASKS.csv #306 — the chip BORDER now carries the element's own identity hue
                      // (ASSAY_ELEMENT_COLORS, now colourblind-safe) while the swatch keeps carrying the
                      // grade ramp. Since #247 seeds every newly-toggled element with the same 3-class
                      // ramp, every chip's swatch is the same colour once two or more elements are on,
                      // so the chip row had stopped working as the per-element legend its comment above
                      // claims it is. Border-vs-fill gives both back in the same chip: which element
                      // (border) and what its markers look like (fill).
                      background: on ? "var(--color-bg-subtle)" : "var(--color-bg)", border: `1px solid ${on ? defaultHue : "var(--color-border)"}`, color: on ? "var(--color-text)" : "var(--color-text-caption)",
                    }}
                  >
                    <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => toggleAssayElement(e.symbol)} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      {on && <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />}
                      {e.symbol}
                    </span>
                    {on && (
                      <Settings2
                        size={12}
                        style={{ color: styled ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}
                        {...iconAction((ev) => { ev.stopPropagation(); setAssayStyleModalSymbol(e.symbol); }, tr(styled ? "Style {el} (customized)" : "Style {el}", { el: e.symbol }))}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 10, padding: "0 10px" }}>{tr("{assays} intervals loaded via Geochem module", { assays: assays.length })}</div>
          </>
        )}

        <div className="ge-section-label" style={{ marginTop: 16 }}>{tr("Custom layers")}</div>
        {customLayers.map((l) => (
          <div key={l.id} onContextMenu={(e) => openRowMenu(e, l.name, [
            { label: customVisible[l.id] === false ? "Show" : "Hide", onClick: () => toggleCustom(l.id) },
            { label: tr("Zoom to"), onClick: () => zoomToCustom(l.id) },
            { label: tr("Style (colour, size, shape)…"), onClick: () => openCustomStyle(l) },
            "-", { label: tr("Remove…"), onClick: () => { if (confirmDestructive(tr("Remove the custom layer \"{name}\"?", { name: l.name }))) removeCustomLayer(l.id); } }])} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
            <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => toggleCustom(l.id)} style={{ cursor: "pointer", flex: 1, fontSize: "var(--font-size-base)", color: customVisible[l.id] === false ? "var(--color-text-disabled)" : "var(--color-text)", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {customVisible[l.id] === false ? <EyeOff size={14} /> : <Eye size={14} />} <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span> <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>({l.rows.length})</span>
            </div>
            <Maximize2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => zoomToCustom(l.id), tr("Zoom to custom layer \"{name}\"", { name: l.name }))} />
            <Trash2 size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => removeCustomLayer(l.id), tr("Remove custom layer \"{name}\"", { name: l.name }))} />
          </div>
        ))}
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => fileInputs.current.customCsv.click()} style={{ cursor: "pointer", padding: "8px 10px", background: "var(--color-bg-subtle)", border: "1px dashed var(--color-border-light)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", textAlign: "center" }}>{tr("+ Add CSV layer")}</div>
        <input ref={setInputRef("customCsv")} type="file" multiple accept=".csv,.xlsx,.zip,.gpkg,.shp,.dbf,.prj,.cpg,.shx,.kml,.kmz,.las" style={{ display: "none" }} onChange={(e) => { const f = groupShapefileParts(Array.from(e.target.files)).files[0]; if (f) openImportModal(f, "custom"); e.target.value = ""; }} />

        {/* TASKS.csv #628 — Matt: "I'm importing shp files but there is no way to delete them … I wanna be able to see
            them as layers, just like in qgis". Line / polygon shapefiles and GeoPackage tables go to the project's map
            layers (#609), which were only listed under Geophysics -> Map layers; this lists them here too, QGIS-style:
            show/hide, zoom to, remove. Styling stays in the Geophysics panel (one place for it). */}
        <div className="ge-section-label" style={{ marginTop: 16 }}>{tr("Map layers{v}", { v: mapLayers.length ? ` (${mapLayers.length})` : "" })}</div>
        {mapLayers.map((l) => (
          <div key={l.id} onContextMenu={(e) => openRowMenu(e, l.name, [
            { label: l.visible === false ? "Show" : "Hide", onClick: () => updateMapLayer(l.id, { visible: l.visible === false }) },
            { label: tr("Zoom to"), onClick: () => zoomToObject(mapLayerMeshesRef.current[l.id]) },
            "-", ...overlayExportItems(l.name, async () => (await overlayLib()).mapLayerFeatures(l), { kml: async () => ({ colorOf: (await overlayLib()).mapLayerColorOf(l), nameOf: (f) => String(f.attributes?.[l.styleField] ?? l.name) }) }), // #1025
            "-", { label: tr("Colours, labels and draping — Geophysics tab"), onClick: () => goToModule("geophysics") },
            { label: tr("Remove…"), onClick: () => { if (confirmDestructive(tr("Remove the map layer \"{name}\" from the project?", { name: l.name }))) removeMapLayer(l.id); } }])} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
            <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateMapLayer(l.id, { visible: l.visible === false })} title={`${l.visible === false ? tr("Show") : tr("Hide")} "${l.name}"${l.crsNote ? `\n${l.crsNote}` : ""}`} style={{ cursor: "pointer", flex: 1, fontSize: "var(--font-size-base)", color: l.visible === false ? "var(--color-text-disabled)" : "var(--color-text)", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {l.visible === false ? <EyeOff size={14} /> : <Eye size={14} />} <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span> <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>({l.features.length} {l.geomType})</span>
            </div>
            <Maximize2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { const m = mapLayerMeshesRef.current[l.id]; if (m) fitBox(new THREE.Box3().setFromObject(m)); }, tr("Zoom to map layer \"{name}\"", { name: l.name }))} />
            <Trash2 size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => { if (confirmDestructive(tr("Remove the map layer \"{name}\" from the project?", { name: l.name }))) removeMapLayer(l.id); }, tr("Remove map layer \"{name}\"", { name: l.name }))} />
          </div>
        ))}
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => fileInputs.current.mapLayer.click()} style={{ cursor: "pointer", padding: "8px 10px", background: "var(--color-bg-subtle)", border: "1px dashed var(--color-border-light)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", textAlign: "center" }}>{tr("+ Add map layer (.shp / .zip / .gpkg)")}</div>
        <input ref={setInputRef("mapLayer")} type="file" multiple accept=".zip,.gpkg,.shp,.dbf,.prj,.cpg,.shx" style={{ display: "none" }} onChange={(e) => { groupShapefileParts(Array.from(e.target.files)).files.forEach((f) => openImportModal(f)); e.target.value = ""; }} />
        {mapLayers.length > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 2px 0" }}>{tr("Colours, labels and draping: Geophysics → Map layers.")}</div>}

        {/* TASKS.csv #630 — georeferenced cross-section images standing in the 3D view */}
        <div className="ge-section-label" style={{ marginTop: 16 }}>{tr("Section images{v}", { v: sectionImages.length ? ` (${sectionImages.length})` : "" })}</div>
        {sectionImages.map((im) => (
          <div key={im.id} onContextMenu={(e) => openRowMenu(e, im.name, [
            { label: im.visible === false ? "Show" : "Hide", onClick: () => updateSectionImage(im.id, { visible: im.visible === false }) },
            { label: tr("Zoom to"), onClick: () => zoomToObject(sectionImageMeshesRef.current[im.id]) },
            { label: tr("Opaque"), onClick: () => updateSectionImage(im.id, { opacity: 1 }) },
            { label: tr("Half transparent"), onClick: () => updateSectionImage(im.id, { opacity: 0.5 }) },
            "-", { label: tr("Remove…"), onClick: () => { if (confirmDestructive(tr("Remove the section image \"{name}\" from the project?", { name: im.name }))) removeSectionImage(im.id); } }])} style={{ padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateSectionImage(im.id, { visible: im.visible === false })} title={`${im.visible === false ? tr("Show") : tr("Hide")} "${im.name}"${im.rmse != null ? tr(" (fit error {rmse} m)", { rmse: im.rmse.toFixed(1) }) : ""}`} style={{ cursor: "pointer", flex: 1, fontSize: "var(--font-size-base)", color: im.visible === false ? "var(--color-text-disabled)" : "var(--color-text)", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {im.visible === false ? <EyeOff size={14} /> : <Eye size={14} />} <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{im.name}</span>
              </div>
              <Maximize2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { const m = sectionImageMeshesRef.current[im.id]; if (m) fitBox(new THREE.Box3().setFromObject(m)); }, tr("Zoom to section image \"{name}\"", { name: im.name }))} />
              <Trash2 size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => { if (confirmDestructive(tr("Remove the section image \"{name}\" from the project?", { name: im.name }))) removeSectionImage(im.id); }, tr("Remove section image \"{name}\"", { name: im.name }))} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>{tr("Opacity")}{" "}<input type="range" min={0.1} max={1} step={0.05} value={im.opacity ?? 1} onChange={(e) => updateSectionImage(im.id, { opacity: Number(e.target.value) })} style={{ flex: 1 }} aria-label={tr("Opacity of \"{name}\"", { name: im.name })} />
            </label>
          </div>
        ))}
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setSectionGeorefOpen(true)} style={{ cursor: "pointer", padding: "8px 10px", background: "var(--color-bg-subtle)", border: "1px dashed var(--color-border-light)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", textAlign: "center" }}>{tr("+ Georeference a section image…")}</div>

        {/* TASKS.csv #155 — Snapshot to Layout / Draw cross-section (+ its buffer setting) moved to
            the toolbar above (Camera / Scissors icons) — same reasoning as Grid/Themes above. The
            saved-sections list right below stays here: it's project DATA (like a layer), not a tool. */}

        {/* TASKS.csv — slice series / fence-section generator ("slice the voxel in equal parts on a
            specified azi and width"). Generates N parallel sections tiling the visible voxel model(s)'
            and/or drilling's extent, added to the same saved-sections list below rather than opened all
            at once. */}
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
              <input type="checkbox" checked={selectedSectionIds.has(s.id)} onChange={() => toggleSelected(s.id)} style={{ flexShrink: 0 }} title={tr("Select for bulk edit/rename")} />
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => reopenSection(s)} title={tr("Reopen this section")} style={{ cursor: "pointer", flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                <Scissors size={12} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                {s.contacts?.length > 0 && <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>({tr(s.contacts.length === 1 ? "{n} contact" : "{n} contacts", { n: s.contacts.length })})</span>}
              </div>
              <Layers3 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { setSelectedSectionIds(new Set([s.id])); setSectionEditOpen(true); }, tr("Edit what section \"{name}\" shows", { name: s.name }))} />
              <Pencil size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => askPrompt("Section name?", s.name, (name) => { if (name && name.trim()) renameSection(s.id, name.trim()); }), tr("Rename section \"{name}\"", { name: s.name }))} />
              <X size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => { if (window.confirm(tr("Delete \"{name}\" and any contacts drawn on it?", { name: s.name }))) deleteSection(s.id); }, tr("Delete section \"{name}\"", { name: s.name }))} />
            </div>
          );
          return (
            <>
              <div className="ge-section-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>{tr("Cross-sections ({n})", { n: sections.length })}</span>
                {sections.length > 0 && ( /* TASKS.csv #1011 */
                  <label style={{ display: "flex", alignItems: "center", gap: 3, textTransform: "none", letterSpacing: 0, fontSize: "var(--font-size-xs)", fontWeight: 400 }} title={tr("Draw each saved section's line in the 3D view as a thick line, visible from above")}>
                    <input type="checkbox" checked={showSectionLines} onChange={(e) => setShowSectionLines(e.target.checked)} />{" "}{tr("lines in 3D")}</label>
                )}
                {sections.some((s) => (s.contacts || []).length) && (
                  <label style={{ display: "flex", alignItems: "center", gap: 3, textTransform: "none", letterSpacing: 0, fontSize: "var(--font-size-xs)", fontWeight: 400 }} title={tr("Draw the saved section strings (contacts, faults, strings) as 3D lines in the view")}>
                    <input type="checkbox" checked={showSectionStrings} onChange={(e) => setShowSectionStrings(e.target.checked)} />{" "}{tr("in 3D")}</label>
                )}
                {/* TASKS.csv #409 — digitised contacts/faults/strings out as 3D CSV and DXF */}
                {sections.some((s) => (s.contacts || []).length) && (
                  <span style={{ display: "flex", gap: 8, textTransform: "none", letterSpacing: 0, fontSize: "var(--font-size-xs)" }}>
                    <span role="button" tabIndex={0} onKeyDown={activateOnKey} style={{ cursor: "pointer", color: "var(--color-info)" }} title={tr("Every drawn contact, fault, string and outline: one row per vertex with real x, y, z")}
                      onClick={async () => { const { sectionStringsToRows } = await import("../lib/sectionExport.js"); /* #409; on demand #552 */ const rows = sectionStringsToRows(sections); const res = await saveFile({ quiet: "success", suggestedName: `${(project.name || "project").replace(/[^\w\- ]/g, "")}_section_strings.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(rows), encoding: "text" }); if (res.ok) setNotices((p) => [...p, notice("Exported {rows} vertices of section strings to CSV.", { rows: rows.length })]); }}>{tr("Strings CSV")}</span>
                    <span role="button" tabIndex={0} onKeyDown={activateOnKey} style={{ cursor: "pointer", color: "var(--color-info)" }} title={tr("Every drawn contact, fault, string and outline as a 3D polyline (layer = section_kind_name; outlines closed) — opens in Vulcan, Datamine, Leapfrog, Micromine, QGIS")}
                      onClick={async () => { const { sectionStringsToDXF } = await import("../lib/sectionExport.js"); /* #552 */ const { dxf, count } = sectionStringsToDXF(sections); const res = await saveFile({ quiet: "success", suggestedName: `${(project.name || "project").replace(/[^\w\- ]/g, "")}_section_strings.dxf`, filters: [{ name: "DXF", extensions: ["dxf"] }], content: dxf, encoding: "text" }); if (res.ok) setNotices((p) => [...p, notice("Exported {count} section string(s) to 3D DXF.", { count })]); }}>{tr("DXF")}</span>
                  </span>
                )}
                <span role="button" tabIndex={0} onKeyDown={activateOnKey}
                  onClick={() => { if (confirmDestructive(tr("Delete all {sections} section(s) and any contacts drawn on them?", { sections: sections.length }), { undoable: true })) deleteAllSections(); }}
                  style={{ cursor: "pointer", color: "var(--color-danger-icon)", fontSize: "var(--font-size-xs)", textTransform: "none", letterSpacing: 0 }}
                  title={tr("Delete every section and section group")}
                >{tr("Delete all")}</span>
              </div>
              {/* TASKS.csv #240 follow-up — user request: "edit a single section but also bulk edit a
                  bunch of sections and also bulk rename them." Bar only appears once at least one
                  section is checked (individually or via a group's own select-all checkbox below). */}
              {selectedSectionIds.size > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-selected-bg)", border: "1px solid var(--color-selected-border)", borderRadius: 6, marginBottom: 6, fontSize: "var(--font-size-sm)" }}>
                  <span style={{ flex: 1, color: "var(--color-text)" }}>{tr("{size} selected", { size: selectedSectionIds.size })}</span>
                  <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setSectionEditOpen(true)} style={{ cursor: "pointer", color: "var(--color-primary)" }}>{tr("Edit")}</span>
                  <span role="button" tabIndex={0} onKeyDown={activateOnKey}
                    onClick={() => askPrompt("Base name for the selected sections? (numbered automatically)", "", (base) => { if (base && base.trim()) renameSectionsBulk(Array.from(selectedSectionIds), base.trim()); })}
                    style={{ cursor: "pointer", color: "var(--color-primary)" }}
                  >{tr("Rename")}</span>
                  <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setSelectedSectionIds(new Set())} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }}>{tr("Clear")}</span>
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
                        title={tr("Select every section in this group for bulk edit/rename")} style={{ flexShrink: 0 }}
                      />
                      <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setExpandedSectionGroups((p) => ({ ...p, [g.id]: !p[g.id] }))} title={expanded ? tr("Collapse") : tr("Expand to show individual sections")} style={{ cursor: "pointer", flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                        {expanded ? <ChevronUp size={12} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} /> : <ChevronDown size={12} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} />}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                        <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>({members.length})</span>
                      </div>
                      <X size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => { if (window.confirm(tr("Delete \"{name}\" — all {members} section(s) in this group and any contacts drawn on them?", { name: g.name, members: members.length }))) deleteSectionGroup(g.id); }, tr("Delete section group \"{name}\" and all {members} section(s) in it", { name: g.name, members: members.length }))} />
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

        {sidebarTab === "modelling" && (<>
        {MODELLING_PANES.has(toolPane) && (
          <Suspense fallback={null}>
            <ModellingPanes {...{ tracesSeq, /* #888 */ explicitTrend, /* #881 */ camState, sectionImages, setDigitizeImageId, /* #824 */ runMapModel, MapModelPanel, viewDragHookRef, cameraRef, rendererRef, explicitOverlayRef, ExplicitSurfacePanel, ModellingCodesPane, PredictivePanel, SurfaceGeologyProjection, TrendsPanel, activeInterceptSet, activeInterceptSetId, addLithoGroup, addStackUnit, addVoxelModel, addWorldMeshSurface, alt_units, alterationBusy, alterationCellSize, alterationSearchRadius, alterationTarget, askPrompt, assayElements, assays, clipToDomainBoundary, clipToTopo, collars, desurveyMethod, domains, emptyPaneHint, expandedLithoGroupId, explicitClickRef, explicitPickFor, explicitSnap, explicitSurfaces, faultCandidates, implicitBusy, implicitGroupRef, implicitMeshesRef, implicitSurfaces, implicitTarget, includeSectionContacts, interceptSets, isLithoGroupKey, isMcodeKey, lastActivityRef, layers, lithoGroupCrossCuts, lithoGroupKey, lithoGroupRole, lithoGroups, litho_units, mapConstraint, mapLayers, mcConnectFrom, mcGroupOf, mcPickMode, mcSelected, mcodeDefaultRole, miniField, modelDomainId, modelResolution, modellingCodeList, modellingCodes, moveStackUnit, numericBudgetHint, numericBusy, numericCapValue, numericCellSize, numericCloseShell, numericCompositeLength, numericCutoff, numericIncludeQAQC, numericMaxBlocks, numericMethod, numericVariogram, setNumericVariogram, /* #1015 */ numericMinCoverage, numericMinHoles, numericPadding, numericSearchRadius, numericSymbol, numericUseComposites, orientTypes, orientTypesSel, originRef, paneHeader, projectMapContact, rangeMultiplier, removeImplicitSurface, removeLithoGroup, removeStackUnit, resolveLithoTarget, runAlterationModel, runImplicitModel, runNumericModel, runStackModel, runStructuralModel, runVeinModel, searchEllipsoid, sections, sensBudget, sensN, sensOpen, sensSigmaDeg, sensSigmaPos, setActiveInterceptSetId, setAlterationCellSize, setAlterationSearchRadius, setAlterationTarget, setClipToDomainBoundary, setClipToTopo, setCoreOrientOpen, setExpandedLithoGroupId, setExplicitPickFor, setExplicitSnap, setExplicitSurfaces, setFenceOpen, setGradeEstOpen, setImplicitSurfaces, setImplicitTarget, setIncludeSectionContacts, setMapConstraint, setMcConnectFrom, setMcPickMode, setMcSelected, setModelDomainId, setModelResolution, setModellingCodes, setNotices, setNumericBudgetHint, setNumericCapValue, setNumericCellSize, setNumericCloseShell, setNumericCompositeLength, setNumericCutoff, setNumericIncludeQAQC, setNumericMaxBlocks, setNumericMethod, setNumericMinCoverage, setNumericMinHoles, setNumericPadding, setNumericSearchRadius, setNumericSymbol, setNumericUseComposites, setOrientTypesSel, setRangeMultiplier, setSearchEllipsoid, setSensBudget, setSensN, setSensOpen, setSensSigmaDeg, setSensSigmaPos, setSmoothClusters, setStackAdd, setStackFaults, setStackRelation, setStereonetOpen, setStructuralTarget, setStructuralTrends, setSurfaceDetail, setTadpoleOpen, setThinPicks, setThinWindowM, setTrendPreviewId, setVariogramOpen, setVeinCellSize, setVeinDip, setVeinDipDir, setVeinSearchRadius, setVeinTarget, smoothClusters, stackAdd, stackFaults, stackRelation, stackUnits, struct_types, structuralTarget, structuralTrends, structurePicksWithHoleAttitude, structureTypes, surfaceDetail, surfaceStructures, survey, terrain, thinPicks, thinWindowM, toolPane, tracesRef, trendFor, trendPreviewId, updateLithoGroup, veinBusy, veinCellSize, veinDip, veinDipDir, veinSearchRadius, veinTarget, vein_units, worldPointFromHits }} />
          </Suspense>
        )}{/* TASKS.csv #693 — loaded on demand */}
        {toolPane && <div className="ge-pane-end" role="separator" />}{/* #458 */}
        {/* TASKS.csv #356 — the last run's lithology block, on request (not added automatically: every run
            would otherwise leave another block model and layer behind). */}
        {lastLithBlock && (
          <div style={{ margin: "8px 0 4px", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)", fontSize: "var(--font-size-sm)" }}>
            <div style={{ color: "var(--color-text)", marginBottom: 6 }}>{lastLithBlock.matchedPct != null ? tr("Last model ({title}, {when}) reproduces {pct}% of the logged metres.", { title: lastLithBlock.title, when: lastLithBlock.when, pct: lastLithBlock.matchedPct }) : tr("Last model ({title}, {when}).", { title: lastLithBlock.title, when: lastLithBlock.when })}</div>
            <button onClick={addUnitVolumes} style={{ ...pBtn, marginBottom: 4 }} title={tr("Each modelled unit as a closed solid (its cells, closed at the model box): export as DXF / OBJ, volume / tonnage, cut on sections and plans, and a domain for grade estimation")}><Box size={14} />{" "}{tr("Add unit volumes (closed)")}</button>
            <button onClick={addLithBlockModel} style={{ ...pBtn, marginBottom: 4 }} title={tr("The model's units as a block model: 3D view, slice/cutoff controls and cross-sections, like any other block model. The space above every modelled top is left out.")}><Box size={14} />{" "}{tr("Add as block model")}</button>
            <button onClick={addModelledLayer} style={{ ...pBtn, marginBottom: 0 }} title={tr("An interval layer with the unit the model puts at each logged litho interval — shown next to the logged litho in the strip log, and on the holes in 3D / sections.")}><Layers3 size={14} />{" "}{tr("Add \"modelled unit\" layer to holes")}</button>
          </div>
        )}
        <div className="ge-section-label" style={{ marginTop: 16 }}>{tr("Generated surfaces")}</div>
        {/* TASKS.csv #146 — query the generated surfaces rather than only look at them: how far is each
            hole from this surface, where does it pierce it, and how many downhole metres sit inside it.
            Lives here because every one of those questions is about a surface in this list. */}
        <button
          onClick={() => setSurfaceQueryOpen(true)}
          disabled={!implicitSurfaces.length}
          style={{ ...pBtn, marginBottom: 8, opacity: implicitSurfaces.length ? 1 : 0.5, cursor: implicitSurfaces.length ? "pointer" : "default" }}
          title={tr("Distance-to-surface / point-in-domain report — closest approach and pierce depths for every hole, downhole metres inside a closed shell, and a single-point distance/inside query")}
        ><Ruler size={14} />{" "}{tr("Distance / inside query…")}</button>
        {/* TASKS.csv #148 — overlay an imported solid (pit shell, stope design, someone else's
            wireframe) alongside the generated ones for an as-built vs. as-planned check. Sits in this
            section, not in a separate one, because an imported solid IS an entry in the list below —
            it gets the same show/hide, remove, query and export controls with no parallel code path. */}
        <button
          onClick={() => importSolidRef.current?.click()}
          style={{ ...pBtn, marginBottom: 8 }}
          title={tr("Import a DXF (3DFACE / polyface mesh) or OBJ solid — pit shell, stope design, or a wireframe from another package — and overlay it on the drillholes. Coordinates are used as-is, in the project CRS.")}
        ><Box size={14} />{" "}{tr("Import solid (DXF / OBJ)…")}</button>
        {/* TASKS.csv #802 — solid blocks (unit volumes / a block model) from the surfaces in this list */}
        <button
          onClick={() => setSurfaceSolidsOpen((v) => !v)}
          disabled={!implicitSurfaces.length}
          aria-expanded={surfaceSolidsOpen}
          style={{ ...pBtn, marginBottom: 8, opacity: implicitSurfaces.length ? 1 : 0.5, cursor: implicitSurfaces.length ? "pointer" : "default" }}
          title={implicitSurfaces.length ? tr("Fill a grid of blocks with the units these surfaces bound (open surfaces are unit tops, closed ones are solids), then add the units as closed solids or as a block model") : tr("Build or import a surface first: an explicit surface, an implicit model or an imported solid.") /* TASKS.csv #863 */}
        ><Box size={14} />{" "}{tr("Solid blocks from surfaces…")}</button>
        {/* TASKS.csv #570 — explicit wireframe from outlines drawn on sections */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }} title={tr("Draw an \"Outline (closed, for a solid)\" with the same name on two or more cross-sections; this links them into a closed solid.")}>
          <select value={outlineNames.some((o) => o.name === wireframeName) ? wireframeName : ""} onChange={(e) => setWireframeName(e.target.value)} disabled={!outlineNames.length} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Section outlines to link")}>
            <option value="">{outlineNames.length ? tr("Section outlines…") : tr("No section outlines yet")}</option>
            {outlineNames.map((o) => <option key={o.name} value={o.name}>{o.plans ? tr("{name} ({n} level plans)", { name: o.name, n: o.sections }) : tr("{name} ({n} sections)", { name: o.name, n: o.sections })}</option>)}
          </select>
          <select value={wireframeEnds} onChange={(e) => setWireframeEnds(e.target.value)} style={{ ...smallSel, width: 92, flexShrink: 0 }} aria-label={tr("Ends of the solid")} title={tr("How the solid ends beyond the first and last outline: flat at them, extended half a section spacing, or pinched out to a point half a spacing beyond")}>{/* TASKS.csv #894 */}
            <option value="flat">{tr("Flat ends")}</option><option value="extend">{tr("Extend ½ spacing")}</option><option value="pinch">{tr("Pinch out")}</option>
          </select>
          <button onClick={() => linkWireframe(wireframeName)} disabled={!outlineNames.some((o) => o.name === wireframeName)} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 8px", opacity: outlineNames.some((o) => o.name === wireframeName) ? 1 : 0.5 }}>{tr("Link into a solid")}</button>
        </div>
        {/* TASKS.csv #859 — vein solid from two surfaces */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }} title={tr("A vein or dyke as a closed solid between its hangingwall and footwall surfaces (any dip, vertical included), with its true thickness")}>
          <span style={{ fontSize: "var(--font-size-xs)", width: "100%" }}>{tr("Vein solid from two surfaces")}</span>
          {[[veinHw, setVeinHw, "Hangingwall…"], [veinFw, setVeinFw, "Footwall…"]].map(([v, set, ph]) => (
            <select key={ph} value={implicitSurfaces.some((x) => x.id === v) ? v : ""} onChange={(e) => set(e.target.value)} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr(ph)}>
              <option value="">{tr(ph)}</option>
              {implicitSurfaces.filter((x) => !SOLID_SURFACE_TYPES.has(x.type) || x.type === "imported").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}{/* imported: a wall from another package */}
            </select>
          ))}
          <button onClick={buildVeinSolid} disabled={!veinHw || !veinFw || veinHw === veinFw} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 8px", opacity: veinHw && veinFw && veinHw !== veinFw ? 1 : 0.5 }}>{tr("Make the solid")}</button>
        </div>
        {surfaceSolidsOpen && (<Suspense fallback={null}>
          <SurfaceSolidsPanel
            surfaces={implicitSurfaces} explicitDefs={explicitSurfaces || []} /* #830 */ worldMesh={surfaceWorldMesh} origin={originRef.current}
            terrain={terrain} sampleGround={(x, y) => terrainGroundAt(terrain, x, y)}
            onBuilt={surfaceSolidsBuilt} onError={(e) => setNotices((p) => [...p, e])} onClose={() => setSurfaceSolidsOpen(false)}
            pBtn={pBtn} smallSel={smallSel} numInput={smallSel}
          />
        </Suspense>)}
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
          title={tr("Check the generated surfaces against the relationships declared on them (expand a surface's row to declare one): surfaces that intersect where they shouldn't, a surface on the wrong side of one it is declared below/above, and contact surfaces that fold back over themselves.")}
        ><ShieldAlert size={14} /> {topologyBusy ? tr("Checking relationships…") : tr("Check relationships")}</button>
        {implicitSurfaces.length === 0 && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 10, lineHeight: 1.4 }}>{tr("None yet — run one of the tools above. Generated surfaces now save with the project (mesh, type, declared relationships and the parameters that produced them), so a reported volume or tonnage can be reproduced after a restart. Binding a surface to a saved theme is still a follow-up.")}</div>
        )}
        {implicitSurfaces.map((s) => {
          const expanded = expandedSurfaceId === s.id;
          const otherSurfaces = implicitSurfaces.filter((o) => o.id !== s.id);
          const stale = staleSurfaces.get(s.id); // TASKS.csv #878
          return (
            <div key={s.id} onContextMenu={(e) => openRowMenu(e, s.name, [ // TASKS.csv #635
              { label: s.visible ? "Hide" : "Show", onClick: () => toggleImplicitSurface(s.id) },
              { label: tr("Zoom to"), onClick: () => zoomToImplicitSurface(s.id) },
              { label: expanded ? "Close type & relationships" : "Type & relationships…", onClick: () => setExpandedSurfaceId(expanded ? null : s.id) },
              { label: tr("Style (colour, opacity)…"), onClick: () => setStyleTarget({ key: `surface:${s.id}`, kind: "surface", label: s.name, surfaceId: s.id, defaults: { opacity: surfaceBaseLook(implicitMeshesRef.current[s.id]).opacity } }) }, // #636
              "-", { label: tr("Remove…"), onClick: () => { if (confirmRemoveSurface(s)) removeImplicitSurface(s.id); } }])}
              style={{ background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => toggleImplicitSurface(s.id)} style={{ cursor: "pointer", color: s.visible ? "var(--color-accent)" : "var(--color-text-disabled)" }}>{s.visible ? <Eye size={14} /> : <EyeOff size={14} />}</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tr("{vertexCount} vertices, {faceCount} faces", { vertexCount: s.vertexCount, faceCount: s.faceCount })}>{s.name}</div>
                {/* TASKS.csv #93 — version badge, only when this surface is actually part of a lineage,
                    so a project with no re-runs looks exactly as it did before. */}
                {(() => {
                  const info = surfaceLineageInfo.byId.get(s.id);
                  if (!info || info.lineage.length < 2) return null;
                  return (
                    <span
                      style={{ flexShrink: 0, fontSize: "var(--font-size-xs)", color: s.accepted ? "#20512f" : "var(--color-text-secondary)", background: s.accepted ? "#eaf3ec" : "#e8eaee", border: `1px solid ${s.accepted ? "#c6e0cb" : "var(--color-border)"}`, borderRadius: 4, padding: "1px 4px" }}
                      title={s.accepted ? tr("Version {v} of {lineage} — marked as the version you are working from (a record of your choice, not a validation of the run)", { v: info.index + 1, lineage: info.lineage.length }) : tr("Version {v} of {lineage} of this surface", { v: info.index + 1, lineage: info.lineage.length })}
                    >v{info.index + 1}/{info.lineage.length}{s.accepted ? " ✓" : ""}</span>
                  );
                })()}
                {/* TASKS.csv #83 — expand to set this surface's geological type + declared
                    relationships to other surfaces (metadata only for now — see this entry's own
                    TASKS.csv note on what reads it later: #88 constraints, #90 topology checks). */}
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setExpandedSurfaceId(expanded ? null : s.id)} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} title={tr("Type & relationships")}>
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
                <Maximize2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => zoomToImplicitSurface(s.id), tr("Zoom to surface \"{name}\"", { name: s.name }))} />
                <X size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => { if (confirmRemoveSurface(s)) removeImplicitSurface(s.id); }, tr("Remove surface \"{name}\"", { name: s.name }))} />
              </div>
              {stale && <div style={{ padding: "0 8px 6px", fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)" }}>{stale}</div>}
              {expanded && (
                <div style={{ padding: "0 8px 8px", borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>
                  {/* TASKS.csv #91/#92 — data-support display for surfaces that carry a classification. */}
                  {s.surfaceSupportCounts && (
                    <div style={{ marginBottom: 8 }}>
                      <button
                        onClick={() => toggleSurfaceSupportColors(s.id)}
                        style={{ width: "100%", padding: "5px 0", borderRadius: 5, fontSize: "var(--font-size-sm)", cursor: "pointer", border: "1px solid var(--color-border-light)", background: s.supportColored ? "#eef3ee" : "transparent", color: "var(--color-text-secondary)" }}
                      >
                        {s.supportColored ? tr("Show normal colours") : tr("Colour by data support")}
                      </button>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 5, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                        {["interpolated", "extrapolated", "unsupported"].map((k) => (
                          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: SUPPORT_COLORS[k], display: "inline-block" }} />
                            {(s.surfaceSupportCounts[k] || 0).toLocaleString()} {k}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.45 }}>{tr("Counted over this surface's own vertices. Green means the composites that produced that part of the surface bracket it on all three axes from at least two holes. A geometric data-support measure — not a confidence interval or a kriging variance.")}</div>
                    </div>
                  )}
                  <label style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>{tr("Type")}<select value={s.type || "other"} onChange={(e) => setSurfaceType(s.id, e.target.value)} style={{ ...smallSel, width: "100%", marginTop: 3 }}>
                      {SURFACE_TYPES.map((t) => <option key={t.key} value={t.key}>{tr(t.label)}</option>)}{/* tr: TASKS.csv #893 */}
                    </select>
                  </label>
                  {/* TASKS.csv #804 — Matt: "I change the type of mineralization but it doesn't do anything". Say what it does. */}
                  <div style={{ fontSize: "var(--font-size-xs)", color: SOLID_SURFACE_TYPES.has(s.type) && expandedSurfaceVolume && !expandedSurfaceVolume.watertight ? "var(--color-warn-text)" : "var(--color-text-muted)", marginTop: -2, marginBottom: 8, lineHeight: 1.45 }}>
                    {SOLID_SURFACE_TYPES.has(s.type) && expandedSurfaceVolume && !expandedSurfaceVolume.watertight
                      ? tr("This surface is open ({n} open edges), so it has no inside: a type cannot turn it into a solid. To get solid bodies from contact surfaces, use \"Solid blocks from surfaces…\" above, then \"Add unit volumes (closed)\".", { n: expandedSurfaceVolume.openEdgeCount.toLocaleString() })
                      : tr("The type is a label: it does not change the mesh. It is read by \"Check relationships\", it decides whether a closed surface is offered in Grade estimation's \"Restrict to a modelled volume\" (bodies: envelopes, vein / dyke solids, breccias, unit volumes, imported solids), and it sets the role \"Solid blocks from surfaces\" proposes.")}
                  </div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: 4 }}>{tr("Relationships to other surfaces")}</div>
                  {(s.relationships || []).length === 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6 }}>{tr("None declared.")}</div>}
                  {(s.relationships || []).map((r, i) => {
                    const target = implicitSurfaces.find((o) => o.id === r.targetId);
                    const relLabel = RELATION_TYPES.find((rt) => rt.key === r.relation)?.label || r.relation;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--font-size-sm)", marginBottom: 4 }}>
                        <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {relLabel} <span style={{ color: "var(--color-text-secondary)" }}>{target ? target.name : tr("(removed surface)")}</span>
                        </div>
                        <X size={12} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => removeSurfaceRelationship(s.id, i), tr("Remove this relationship from surface \"{name}\"", { name: s.name }))} />
                      </div>
                    );
                  })}
                  {otherSurfaces.length > 0 ? (
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      <select value={relationDraft.relation} onChange={(e) => setRelationDraft((p) => ({ ...p, relation: e.target.value }))} style={{ ...smallSel, flex: 1 }}>
                        {RELATION_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                      <select value={relationDraft.targetId} onChange={(e) => setRelationDraft((p) => ({ ...p, targetId: e.target.value }))} style={{ ...smallSel, flex: 1 }}>
                        <option value="">{tr("— surface —")}</option>
                        {otherSurfaces.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      <button
                        onClick={() => { if (relationDraft.targetId) { addSurfaceRelationship(s.id, relationDraft.relation, relationDraft.targetId); setRelationDraft((p) => ({ ...p, targetId: "" })); } }}
                        style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "4px 8px" }}
                      >+</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Generate another surface to declare a relationship to it.")}</div>
                  )}

                  {/* TASKS.csv #52 (d) — CROSS-CUTTING. The stack tool excludes veins and dykes by
                      design (see #61), so a dyke and the contacts it cuts were previously two
                      unrelated meshes drawn through each other. This applies the cut. */}
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 10, marginBottom: 4, borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>{tr("Cross-cutting")}</div>
                  {otherSurfaces.length > 0 ? (
                    <>
                      <div style={{ display: "flex", gap: 4 }}>
                        <select value={cutterDraft} onChange={(e) => setCutterDraft(e.target.value)} style={{ ...smallSel, flex: 1 }}>
                          <option value="">{tr("— cut this surface with… —")}</option>
                          {otherSurfaces.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <button
                          disabled={!cutterDraft || crossCutBusy}
                          onClick={() => runCrossCut(s.id, cutterDraft)}
                          style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "4px 8px", opacity: !cutterDraft || crossCutBusy ? 0.5 : 1, cursor: !cutterDraft || crossCutBusy ? "default" : "pointer" }}
                        >{crossCutBusy ? tr("Cutting…") : tr("Apply")}</button>
                      </div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.45 }}>{tr("A closed body (a vein/dyke solid, a shell) removes the part of this surface inside it and leaves a clean truncation. An open surface (a fault) divides this one into two fault blocks instead — geometry only, with no displacement applied. If the cutting body doesn't reach this surface, nothing changes and it says so. Regenerating either surface undoes the cut; what was cut is recorded below under Parameters used.")}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Model a dyke, vein or fault to cut this surface with it.")}</div>
                  )}

                  {/* TASKS.csv #140 — volume/tonnage. Only meaningful for a genuinely closed solid, so a
                      non-watertight mesh (e.g. a clipped-open surface, a fault plane, a draped contact
                      sheet) still shows the raw divergence-theorem number but flags it rather than
                      presenting it with false confidence. */}
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 10, marginBottom: 4, borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>{tr("Volume & tonnage")}</div>
                  {implicitMeshesRef.current[s.id]?.userData?.lod && lodSeq >= 0 && ( /* TASKS.csv #795 */
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4 }}>{tr("Drawn with {n} of {m} triangles to keep the view smooth; volumes, sections and exports use the full mesh.", { n: Math.round(implicitMeshesRef.current[s.id].userData.lod.triangles).toLocaleString(), m: Math.round(implicitMeshesRef.current[s.id].userData.lod.full).toLocaleString() })}</div>
                  )}
                  {expandedSurfaceVolume ? (
                    <>
                      {/* TASKS.csv #268 — computeMeshVolume documents that it assumes scene units are
                          metres; the panel printed m³/t unconditionally. A project left in geographic
                          degrees, or in feet, produced a confidently-labelled number in the wrong unit
                          with no complaint. dataQC already warns about a missing EPSG; that warning
                          never reached here. */}
                      {isMetricProjectedEpsg(project?.epsg) !== true ? (
                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-icon-strong)", lineHeight: 1.45, marginBottom: 6 }}>
                          {tr("{v} Volume and tonnage assume the coordinates are in metres, so nothing here can be reported in m³ or tonnes until a projected, metre-based CRS is set (Project settings). The mesh itself is unaffected.", { v: project?.epsg
                            ? tr("This project's CRS (EPSG:{epsg}) isn't a projected, metre-based system — or isn't one GeoStrix can confirm as one.", { epsg: project.epsg })
                            : tr("No CRS is set for this project.") })}</div>
                      ) : (
                      <>
                      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 4 }}>{tr("Volume:")}{" "}<strong>{expandedSurfaceVolume.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³</strong>
                      </div>
                      {/* TASKS.csv #257 — an ARTIFICIALLY closed shell is watertight, so the old
                          !watertight-only caution never fired for the single most misleading case in
                          the whole tool. Closure mode is recorded on the surface at generation time. */}
                      {s.closure === "artificial" && (
                        <div style={{ fontSize: "var(--font-size-xs)", color: "#a5691f", marginBottom: 6, lineHeight: 1.45 }}>
                          <strong>{tr("This shell was closed artificially.")}</strong>{" "}{tr("Part of its boundary is not a grade boundary — it is where the search radius ran out of samples. The volume therefore depends on your search radius, not only on the data: doubling the search radius roughly multiplies the volume by eight. Treat it as a visualization of where grades might extend, not a measured volume.")}</div>
                      )}
                      {/* TASKS.csv #263 — the watertight test is a manifold test, not a connectivity
                          test: two disjoint balloons 200 m apart are each closed and report as one
                          volume. Union-find over the indexed mesh says how many bodies there really are. */}
                      {expandedSurfaceVolume.componentCount > 1 && (
                        <div style={{ fontSize: "var(--font-size-xs)", color: "#a5691f", marginBottom: 6, lineHeight: 1.45 }}>{tx("This shell is {bodies} totalling {vol} m³, not one continuous body.", { bodies: <strong>{tr("{n} separate bodies", { n: expandedSurfaceVolume.componentCount })}</strong>, vol: expandedSurfaceVolume.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 }) })}</div>
                      )}
                      {!expandedSurfaceVolume.watertight && (
                        <div style={{ fontSize: "var(--font-size-xs)", color: "#a5691f", marginBottom: 6, lineHeight: 1.4 }}>{tr("{v} That can mean several things: it's a single draped contact or fault sheet rather than a solid; it was clipped against a modelling domain; or the shell reaches the edge of the estimated region (the shell is only closed there when \"Close shell artificially\" is ticked). The volume above is computed anyway but doesn't represent a real enclosed shape — treat it as informational only.", { v: tr(expandedSurfaceVolume.openEdgeCount === 1 ? "This surface isn't a closed solid ({n} open edge)." : "This surface isn't a closed solid ({n} open edges).", { n: expandedSurfaceVolume.openEdgeCount }) })}</div>
                      )}
                      {/* TASKS.csv #270 (LOW-2) — a tonnage with no grade beside it invites quoting the
                          CUTOFF as the grade. Report the interpolated mean inside the shell instead. */}
                      {s.params?.meanGradeInShell != null && (
                        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 4 }}>{tr("Mean interpolated grade inside the shell:")}{" "}<strong>{s.params.meanGradeInShell.toFixed(3)} {PRECIOUS_METALS.has(s.params.element) && s.params.unit === "ppm" ? "g/t" : s.params.unit}</strong>
                          <span style={{ color: "var(--color-text-muted)" }}>{" "}{tr("— not a resource grade (no dilution, no recovery, no declustering; it is the mean of the interpolated cells at or above the {cutoff} cutoff).", { cutoff: s.params.cutoff })}</span>
                        </div>
                      )}
                      {/* TASKS.csv #264 — no more silent 2.7 prefill: a bold tonnage the user never
                          authorised a density for is exactly the number that gets quoted. */}
                      <label style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ flexShrink: 0 }}>{tr("Density (t/m³ or g/cm³)")}</span>
                        <input
                          type="number" min={0} step={0.01} placeholder={tr("required")}
                          value={s.density ?? ""}
                          onChange={(e) => setSurfaceDensity(s.id, e.target.value === "" ? "" : Number(e.target.value))}
                          style={{ ...smallSel, width: 70 }}
                        />
                      </label>
                      {(() => {
                        const tonnage = computeTonnage(expandedSurfaceVolume.volumeM3, Number(s.density));
                        return tonnage != null ? (
                          <>
                            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>{tr("Tonnage:")}{" "}<strong>{tonnage.toLocaleString(undefined, { maximumFractionDigits: 0 })} t</strong>
                            </div>
                            {/* TASKS.csv #269 — permanent, beside the figure, not buried in helper text. */}
                            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "6px 7px", marginTop: 5, lineHeight: 1.45 }}>
                              <strong>{tr("Exploration target volume only — not a Mineral Resource.")}</strong>{" "}{tr("Public disclosure of a tonnage requires an estimate prepared by a Qualified Person.")}{/* TASKS.csv #264 */}
                              {" "}{tr("In-situ, dry, undiluted tonnes at the density you entered. No mining dilution, mining recovery, metallurgical recovery or moisture is applied. Bulk density here is a single assumed value, not a measured one — a real estimate uses measured SG by domain.")}</div>
                          </>
                        ) : (
                          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Enter a bulk density to compute tonnage — there is no default, because the tonnage is only as real as the density behind it.")}</div>
                        );
                      })()}
                      </>
                      )}
                      {/* TASKS.csv #270 (LOW-3) — the parameter block that produced this surface, so a
                          number can be reproduced and audited rather than re-derived from memory. */}
                      {s.params && (
                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
                          <div style={{ color: "var(--color-text-muted)", marginBottom: 2 }}>{tr("Parameters used")}</div>
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
                            <>{tr("{el} cutoff {cutoff} {unit} · {method} · search {search} m{unlimited} · {cell} m cells · pad {pad} m · {samples} · cap {cap} · min {minHoles} hole(s) · QC {qc} · closure {closure} · {points} sample points · {cells} cells estimated{single}", {
                              el: s.params.element, cutoff: s.params.cutoff, unit: s.params.unit, method: String(s.params.method).toUpperCase(), search: Math.round(s.params.searchRadiusM),
                              unlimited: s.params.searchRadiusWasUnlimited ? tr(" (unlimited, capped at the grid diagonal)") : "", cell: s.params.cellSizeM, pad: s.params.paddingM,
                              samples: s.params.composited ? tr("{n} m composites", { n: s.params.compositeLengthM }) : tr("raw intervals"), cap: s.params.capValue == null ? tr("none") : s.params.capValue,
                              minHoles: s.params.minHoles, qc: s.params.includeQAQC ? tr("included") : tr("excluded"), closure: s.params.closure, points: s.params.samplePoints,
                              cells: s.params.cellsEstimated.toLocaleString(), single: s.params.singleHoleCells ? tr(" ({n} from a single hole)", { n: s.params.singleHoleCells.toLocaleString() }) : "" })}</>
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
                          <div style={{ color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Generated {when}. Saved with the project, so this record — and the surface it describes — survives a restart; the mesh export carries the same stamp.", { when: new Date(s.params.generatedAt).toLocaleString() })}</div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("No mesh geometry found for this surface.")}</div>
                  )}

                  {/* TASKS.csv #145 — manual sculpting of this surface, plus its hand-edit provenance.
                      Placed directly under the volume/tonnage block on purpose: an edit changes the
                      enclosed volume, and the number it changes is the one immediately above. */}
                  {/* TASKS.csv #879 — an explicit surface is rebuilt from its picks on every edit, which would silently undo a
                      sculpt while its hand-edit stamp stayed: it is edited through its picks instead */}
                  {s.type === "explicit_surface"
                    ? <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 6 }}>{tr("Explicit surfaces are not sculpted: the next rebuild from the picks would undo it. Move, add or remove picks in the Explicit surface pane instead.")}</div>
                    : <SculptPanel surface={s} sculpt={sculpt} pBtn={pBtn} smallSel={smallSel} />}
                  {s.closure !== "closed" && !["unit_volume", "vein_solid", "explicit_wireframe"].includes(s.type) && ( // TASKS.csv #895 — an offset copy (open surfaces; an imported sheet too)
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }} title={tr("A copy of this surface moved by a distance: along its normal (a true thickness, positive = its upper side) or vertically. For example a hangingwall from a footwall plus the vein's width.")}>
                      <span style={{ flexShrink: 0 }}>{tr("Offset copy")}</span>
                      <input type="number" step={1} value={offsetIn[s.id]?.d ?? ""} placeholder="m" onChange={(e) => setOffsetIn((p) => ({ ...p, [s.id]: { ...p[s.id], d: e.target.value } }))} style={{ ...smallSel, width: 56 }} aria-label={tr("Offset distance (m)")} />
                      <select value={offsetIn[s.id]?.mode || "normal"} onChange={(e) => setOffsetIn((p) => ({ ...p, [s.id]: { ...p[s.id], mode: e.target.value } }))} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Offset direction")}>
                        <option value="normal">{tr("along its normal")}</option><option value="vertical">{tr("vertically")}</option>
                      </select>
                      <button onClick={() => makeOffsetSurface(s)} disabled={!(Number(offsetIn[s.id]?.d) !== 0 && Number.isFinite(Number(offsetIn[s.id]?.d)))} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 7px" }}>{tr("Make")}</button>
                    </div>
                  )}
                  {(boundaries || []).length > 0 && ( // TASKS.csv #895 — a copy cut to a project boundary
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }} title={tr("A copy of this surface cut to the inside of a project boundary, seen from above; the edge is cut exactly at the boundary. The original is unchanged.")}>
                      <span style={{ flexShrink: 0 }}>{tr("Clip to")}</span>
                      <select value={clipIn[s.id] || ""} onChange={(e) => setClipIn((p) => ({ ...p, [s.id]: e.target.value }))} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Boundary to clip to")}>
                        <option value="">{tr("Boundary…")}</option>
                        {boundaries.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <button onClick={() => makeClippedSurface(s)} disabled={!clipIn[s.id]} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 7px" }}>{tr("Make")}</button>
                    </div>
                  )}

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
                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 10, marginBottom: 4, borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>{tr("Version {n} of {total}", { n: vNum, total: chain.length })}
                          {s.accepted && <span style={{ color: "#20512f", background: "#f1f7f2", border: "1px solid #c6e0cb", borderRadius: 4, padding: "1px 5px", marginLeft: 6 }}>{tr("accepted")}</span>}
                        </div>
                        <label style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                          <span style={{ flexShrink: 0 }}>{tr("New version of")}</span>
                          <select
                            value={s.supersedes || ""}
                            onChange={(e) => setSurfaceSupersedes(s.id, e.target.value)}
                            style={{ ...smallSel, flex: 1, minWidth: 0 }}
                            title={tr("Record that this run replaces an earlier one. Both runs stay in the project — this only links them so they can be compared.")}
                          >
                            <option value="">{tr("— nothing (this is an original run) —")}</option>
                            {cands.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </label>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            onClick={() => setCompareVersionsFor(s.id)}
                            disabled={chain.length < 2}
                            style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: "var(--font-size-sm)", opacity: chain.length < 2 ? 0.5 : 1, cursor: chain.length < 2 ? "default" : "pointer" }}
                            title={chain.length < 2 ? tr("Link this surface to an earlier run first") : tr("Compare this version against another run of the same surface: volume delta, how far the surface moved, and which parameters changed")}
                          ><GitCompare size={12} />{" "}{tr("Compare versions…")}</button>
                          <button
                            onClick={() => acceptSurfaceVersion(s.id)}
                            style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: "var(--font-size-sm)" }}
                            title={tr("Mark this run as the version you are working from. Hides the other versions of this surface — it does not delete them, and it is not a check that this run is correct.")}
                          ><Check size={12} /> {s.accepted ? tr("Accepted") : tr("Accept this version")}</button>
                        </div>
                        {chain.length > 1 && (
                          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.45 }}>{tr("Every version keeps its own mesh and its own parameter block, so nothing is overwritten and nothing is dropped on save — which also means each one costs its own space in the project file. Delete a version you no longer want with the × on its row; GeoStrix will not do it for you.")}</div>
                        )}
                      </>
                    );
                  })()}

                  {/* TASKS.csv #143 — export to a standard mesh format, at real-world project coordinates
                      (not GeoStrix's internal scene-space), for handoff to other software. */}
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 10, marginBottom: 4, borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>{tr("Export mesh")}</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => exportImplicitSurface(s.id, "obj")} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: "var(--font-size-sm)" }} title={tr("Wavefront OBJ — universal, human-readable")}>{tr("OBJ")}</button>
                    <button onClick={() => exportImplicitSurface(s.id, "dxf")} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: "var(--font-size-sm)" }} title={tr("AutoCAD DXF (3DFACE) — Vulcan/Surpac/Datamine and most mining software read this")}>{tr("DXF")}</button>
                    <button onClick={() => exportImplicitSurface(s.id, "glb")} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: "var(--font-size-sm)" }} title={tr("glTF Binary — modern standard, keeps normals, good for Blender/web viewers")}>{tr("glTF")}</button>
                    <button onClick={() => exportImplicitSurface(s.id, "vtk")} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: "var(--font-size-sm)" }} title={tr("VTK (legacy) — opens in ParaView and PyVista")}>{tr("VTK")}</button>
                    <button onClick={() => exportImplicitSurface(s.id, "omf")} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "5px 6px", fontSize: "var(--font-size-sm)" }} title={tr("Open Mining Format v1 — Leapfrog, Datamine, Vulcan, Micromine and Geosoft read it")}>{tr("OMF")}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="ge-section-label" style={{ marginTop: 16 }}>{tr("Domains")}</div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("A domain is one or more faults plus which side of each — an AND of constraints, so you can bound a domain between two faults, not just split the property in two. Pick which fault surfaces to use as constraints below (any generated surface typed \"Fault\" above); the domain fails open (matches everything) until it has at least one constraint, and again for any constraint whose fault surface gets deleted. Domains save with the project, along with the surfaces they reference.")}</div>
        {(() => { const faultSurfaces = implicitSurfaces.filter((s) => s.type === "fault"); return (
        <>
        {domains.length === 0 && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("None yet.")}</div>
        )}
        {domains.map((d) => {
          const expanded = expandedDomainId === d.id;
          return (
            <div key={d.id} style={{ background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
                <GitFork size={14} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setExpandedDomainId(expanded ? null : d.id)} style={{ cursor: "pointer", flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tr(d.constraints.length === 1 ? "{constraints} constraint" : "{constraints} constraints", { constraints: d.constraints.length })}>{d.name}</div>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setExpandedDomainId(expanded ? null : d.id)} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }}>
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
                <X size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => deleteDomain(d.id), tr("Delete domain \"{name}\"", { name: d.name }))} />
              </div>
              {expanded && (
                <div style={{ padding: "0 8px 8px", borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: 4 }}>{tr("Fault-side constraints")}</div>
                  {d.constraints.length === 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6 }}>{tr("None declared — matches the whole property.")}</div>}
                  {d.constraints.map((c, i) => {
                    const fault = implicitSurfaces.find((s) => s.id === c.faultId);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--font-size-sm)", marginBottom: 4 }}>
                        <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {fault ? fault.name : tr("(deleted fault)")} <span style={{ color: "var(--color-text-secondary)" }}>{tr("— side {v}", { v: c.side === 1 ? "A" : "B" })}</span>
                        </div>
                        <button onClick={() => flipDomainConstraint(d.id, i)} title={tr("Flip side")} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 7px", fontSize: "var(--font-size-xs)" }}>{tr("Flip")}</button>
                        <X size={12} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => removeDomainConstraint(d.id, i), tr("Remove this fault constraint from domain \"{name}\"", { name: d.name }))} />
                      </div>
                    );
                  })}
                  {faultSurfaces.length > 0 ? (
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      <select value={domainConstraintDraft.faultId} onChange={(e) => setDomainConstraintDraft((p) => ({ ...p, faultId: e.target.value }))} style={{ ...smallSel, flex: 1 }}>
                        <option value="">{tr("— fault surface —")}</option>
                        {faultSurfaces.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      <select value={domainConstraintDraft.side} onChange={(e) => setDomainConstraintDraft((p) => ({ ...p, side: Number(e.target.value) }))} style={{ ...smallSel, width: 68 }}>
                        <option value={1}>{tr("Side A")}</option>
                        <option value={-1}>{tr("Side B")}</option>
                      </select>
                      <button
                        onClick={() => { if (domainConstraintDraft.faultId) { addDomainConstraint(d.id, domainConstraintDraft.faultId, domainConstraintDraft.side); setDomainConstraintDraft((p) => ({ ...p, faultId: "" })); } }}
                        style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "4px 8px" }}
                      >+</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("No fault surfaces yet — generate one with the Structural tool above and set its type to \"Fault\".")}</div>
                  )}
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 8 }}>{tr("{n} of {total} collars fall inside this domain (collar-only estimate — the modelling tools above classify each control point individually).", { n: countCollarsInDomain(d), total: collars.length })}</div>
                </div>
              )}
            </div>
          );
        })}
        </>
        ); })()}
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => askPrompt("Domain name?", "", (name) => { if (name && name.trim()) setExpandedDomainId(addDomain(name.trim())); })} style={{ cursor: "pointer", padding: "8px 10px", background: "var(--color-bg-subtle)", border: "1px dashed var(--color-border-light)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", textAlign: "center", marginBottom: 4 }}>{tr("+ Domain")}</div>
        </>)}

        {sidebarTab === "surface" && (<>
        {toolPane === "sgMaps" && paneHeader("Geology map", MapIcon, "data")}
        {toolPane === "sgStructs" && paneHeader("Outcrop structures", Compass, "data")}
        <Suspense fallback={null}>
          <SurfaceMappingPanel part={toolPane === "sgMaps" ? "maps" : toolPane === "sgStructs" ? "structures" : null} pBtn={pBtn} numInput={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", width: 70 }} />
        </Suspense>
        </>)}{/* TASKS.csv #820 */}

        {sidebarTab === "targeting" && (<>
        {toolPane === "ranges" && (<>
        {paneHeader("Voxel value ranges", Box, "view")}
        <div className="ge-section-label">{tr("Geophysical voxel ranges")}</div>
        {voxelModels.length === 0 ? (
          <div style={{ padding: "8px 10px", background: "var(--color-bg-subtle)", border: "1px dashed var(--color-border-light)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-muted)", marginBottom: 12 }}>{tr("No voxel/block models loaded yet — import one from the Geophysics tab first, then come back here to isolate a value range (e.g. just a mag high, or an IP high band).")}</div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            {voxelModels.map((model) => <VoxelRangeRow key={model.id} model={model} onUpdate={updateVoxelModel} />)}
          </div>
        )}

        </>)}
        {toolPane === "overlay" && ( // TASKS.csv #851
          <Suspense fallback={null}><EvidenceOverlayPane onClose={() => setToolPane(null)} /></Suspense>
        )}
        {toolPane === "plan" && (<>
        {paneHeader("Planned drillholes", Target, "model")}
        <div className="ge-section-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{tr("Planned drillholes ({n})", { n: plannedHoles.length })}</span>
          {plannedHoles.length > 0 && (
            <FileBarChart2 size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => exportPlannedHoles("csv"), tr("Export all planned holes to CSV"))} />
          )}
        </div>
        <PlannedHoleAddForm onAdd={addPlannedHole} pickMode={pickHoleMode} onStartPick={() => setPickHoleMode((v) => !v)} pickedPoint={pickedHolePoint} collars={collars} />
        {plannedHoles.length === 0 ? (
          <div style={{ padding: "8px 10px", background: "var(--color-bg-subtle)", border: "1px dashed var(--color-border-light)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-muted)", marginTop: 8 }}>{tr("No planned holes yet — add a collar position and design orientation above. A planned hole renders as a dashed cyan line (distinct from real, drilled holes) in the 3D view, in every module tab.")}</div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {plannedHoles.map((hole) => (
              <PlannedHoleRow key={hole.id} hole={hole} onUpdate={updatePlannedHole} onRemove={removePlannedHole} collars={collars} survey={survey} />
            ))}
          </div>
        )}
        {plannedHoles.length > 0 && (<>
          <button onClick={() => exportPlannedHoles("csv")} style={{ ...pBtn, marginTop: 8 }} title={tr("Collar and toe in project coordinates and lat/lon, azimuth against grid, true and magnetic north (today's declination)")}><FileBarChart2 size={14} />{" "}{tr(plannedHoles.length === 1 ? "Export {n} planned hole to CSV" : "Export {n} planned holes to CSV", { n: plannedHoles.length })}</button>
          {/* TASKS.csv #397 */}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => exportPlannedHoles("kml")} style={{ ...pBtn, flex: 1, justifyContent: "center" }} title={tr("Google Earth / phone maps: collars and collar-to-toe lines")}>{tr("KML")}</button>
            <button onClick={() => exportPlannedHoles("gpx")} style={{ ...pBtn, flex: 1, justifyContent: "center" }} title={tr("Handheld GPS: collar waypoints")}>{tr("GPX")}</button>
          </div>
        </>)}
        {plannedHoles.length > 0 && (
          <PlannedHoleChecks plannedHoles={plannedHoles} collars={collars} survey={survey} voxelModels={voxelModels} desurveyMethod={desurveyMethod} surfaces={pierceSurfaces} onExportPierces={exportPiercePoints} />
        )}
        </>)}
        {toolPane && <div className="ge-pane-end" role="separator" />}{/* #458 */}
        </>)}

        {collars.length > 0 && (
          <>
            <div className="ge-section-label" style={{ marginTop: 16 }}>{tr("Holes ({n})", { n: collars.length })}</div>
            {/* TASKS.csv #222 — a filter box, the other half of the audit's "no virtualization/filter"
                finding; finding one hole by ID in a 200+ hole project by eye alone was the real
                usability gap, not just the render cost (fixed separately via HoleRow's memoization). */}
            {collars.length > 8 && (
              <input placeholder={tr("Filter holes…")} value={holeFilter} onChange={(e) => setHoleFilter(e.target.value)} style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit", marginBottom: 4 }} />
            )}
            {collars.filter((c) => !holeFilter || c.hole_id.toLowerCase().includes(holeFilter.toLowerCase())).map((c) => (
              <HoleRow key={c.hole_id} hole_id={c.hole_id} visible={visibleHoles[c.hole_id]} onToggle={toggleHole} onOpenStripLog={setStripLogHoleId} onSection={openHoleSection} onZoom={zoomToHole} />
            ))}
          </>
        )}

        {/* TASKS.csv #298 — deliberately NOT a live region: the floating toast above already announces
            each new notice, and a second live region over the same message would make a screen reader
            read every message twice. This is the persistent record of the same messages, so it just
            gets a name so it can be found by landmark/region navigation. */}
        {notices.length > 0 && (
          <div role="region" aria-label={tr("Recent messages")} style={{ marginTop: 14, padding: "8px 10px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-caption)", lineHeight: 1.5, maxHeight: 140, overflowY: "auto" }}>
            {notices.slice(-6).map((n, i) => (noticeLevel(n) === "error"
              ? <div key={i} style={{ marginBottom: 4, color: "var(--color-danger-fg)", display: "flex", gap: 5, alignItems: "flex-start" }}><AlertTriangle size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} /><span>{noticeText(n)}</span></div>
              : <div key={i} style={{ marginBottom: 4 }}>{noticeText(n)}</div>))}
          </div>
        )}
      </div>

      {sidebarTab === "home" && (<>
        <PanelSplitHandle height={browserHeight} onResize={setBrowserHeight} invert title={tr("Drag to resize the Browser panel")} />
        <div style={{ height: browserHeight, flexShrink: 0 }}>
          <Suspense fallback={null}><DbBrowserPanel onImportFile={importBrowserFile} onImportRows={openImportFromRows} onError={(m) => setNotices((p) => [...p, m])} /></Suspense>
        </div>
      </>)}
      </div>

      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      {/* TASKS.csv #145 — sculpt.handleViewClick joins the same click chain as the section/measure/
          pick-hole tools; it is a no-op unless sculpt mode is on for a specific surface. */}
      {/* TASKS.csv #389 — was role=button + activateOnKey, so Enter/Space fired a synthetic click with no
          pointer position and placed a bogus section/measure/pick point. The 3D view is a pointer surface,
          not a button: a labelled, focusable application region with no keyboard click. */}
      <div ref={viewFocusRef} role="application" aria-label={tr("3D view")} tabIndex={0} className="ge-main" onKeyDown={onViewKeyDown} onPointerDownCapture={(e) => { mcDownRef.current = { x: e.clientX, y: e.clientY }; }} onClick={(e) => { if (!isViewClick(e)) return; onSectionClick(e); onMeasureClick(e); onPickHoleClick(e); onMcodeClick(e); onExplicitClick(e); sculpt.handleViewClick(e); }} style={{ cursor: sectionMode || rectZoomMode || measureMode || pickHoleMode || ((mcPickMode || explicitPickFor) && mode === "modelling") || sculpt.targetId ? "crosshair" : "default" }}>
        <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
        {/* TASKS.csv #311 — figure furniture (title / legend / scale bar) for the screenshot people
            actually take. Rendered only once there is data to annotate, so the #294 empty state is
            never covered by a title card describing an empty project. Pointer-transparent throughout
            (see the component) so hover picking and orbit drags are untouched, and it is DOM rather
            than WebGL, so it adds no draw calls and nothing to the render loop (#312).
            NOT captured by snapshotToLayout / doCaptureViewportRender, and that is deliberate: both
            read pixels back from renderer.domElement.toDataURL(), which sees only the WebGL canvas,
            so a Layout page built from a snapshot gets the bare view and Layout's own legend/scale/
            north-arrow elements — no duplicated, half-scaled second legend baked into the image. */}
        {(!!collars.length || !!surfaceSamples.length || !!(mapLayers || []).length) && ( // #848 — a soil / stream program with no drilling gets its legend and scale too; #948 — and a map with no samples
          <ViewportFigureOverlay
            config={figureOverlay}
            title={overlayTitle}
            legendGroups={overlayLegendGroups}
            camStateRef={camState}
            cameraRef={cameraRef}
            mountRef={mountRef}
            camSignalRef={figureOverlaySignalRef}
          />
        )}
        {/* TASKS.csv #294 — the fresh-project empty state. This used to be a single grey line
            ("Import collars, or drag a CSV in") on the very first tab every user lands on, while
            Geochem and Geophysics both had full multi-paragraph empty states explaining every
            accepted format in the reader's own vocabulary. Ported that same pattern here: what the
            tab is for, exactly what a collar file needs, what else can be dropped, and — per
            TASKS.csv #293 — a one-click way to see the app working with real data before you've
            got any of your own. The wrapper stays pointerEvents:none so it never eats an orbit
            drag on the canvas behind it; only the card itself re-enables pointer events. */}
        {/* TASKS.csv #309 — the card chrome now lives in components/EmptyState.jsx and is shared with
            Geochem, Raster and Geophysics, whose empty states were each a different visual language.
            The COPY here is unchanged from #294: this screen was singled out by the design review as
            the best in the app and the model the others should follow, so it was extracted, not
            rewritten. EmptyState's `children` slot exists precisely so this tab keeps its three
            paragraphs while the shorter tabs get a one-sentence card. */}
        {/* TASKS.csv #316 — a mapping-stage project (terrain, a geology map, outcrop structures, rasters,
            no drillholes yet) is not "nothing loaded"; the card sat on top of exactly what was imported. */}
        {/* TASKS.csv #848 — nor is a soil / stream-sediment program with no drilling (the card covered the samples) */}
        {!collars.length && !terrain && !rasters.length && !mapLayers.length && !surfaceStructures.length && !surfaceSamples.length && (
          <EmptyState
            headline={mode === "surface" ? tr("Import a geological map and outcrop measurements — or load the Perk-Rocky mapping sample") : mode === "modelling" ? tr("Load drillholes first — modelling works from collars, lithology and structure") : mode === "targeting" ? tr("Load drillholes first — targeting plans holes against your drilling and models") : tr("Nothing loaded yet")} /* #567 */
            actionLabel={sampleLoading ? tr("Loading sample project…") : tr("Sample: Harry property (37 holes)")}
            onAction={() => loadSample("harry")}
            actionDisabled={sampleLoading}
            actionTitle={tr("Load the bundled Harry property sample project — 37 real drillholes from BC's public ARIS database, with synthesized interval layers")}
            secondary={<><button type="button" onClick={() => loadSample("woodjam")} disabled={sampleLoading} title={tr("Load the bundled Woodjam sample project — 19 diamond drillholes (2023) with real logs, surveys, oriented structures and assays, six IP lines and the ZTEM 3D inversion, from BC's public assessment report 41597")} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--color-accent)", background: "var(--color-bg)", color: "var(--color-accent-dark)", fontSize: "var(--font-size-base)", fontWeight: 600, cursor: sampleLoading ? "default" : "pointer", opacity: sampleLoading ? 0.6 : 1 }}>{tr("Sample: Woodjam (19 holes, IP, ZTEM)")}</button><button type="button" onClick={() => loadSample("perk")} disabled={sampleLoading} title={tr("Load the bundled Perk-Rocky sample — a 2024 surface-mapping project (geological map, structure lines and 147 outcrop measurements as MapInfo files, with a Copernicus terrain), no drillholes: try 3D Modelling > Model from map")} style={{ marginLeft: 8, padding: "8px 14px", borderRadius: 6, border: "1px solid var(--color-accent)", background: "var(--color-bg)", color: "var(--color-accent-dark)", fontSize: "var(--font-size-base)", fontWeight: 600, cursor: sampleLoading ? "default" : "pointer", opacity: sampleLoading ? 0.6 : 1 }}>{tr("Sample: Perk-Rocky (mapping, no holes)")}</button>{/* TASKS.csv #819 */}</>}
            footnote={tr("No data of your own yet? Three real projects from BC's public assessment reports are bundled. Harry (report #37584): 37 holes with assays; some interval layers are synthesized — its README says which. Woodjam (report #41597): 19 holes from 2023 with their real logs, gyro surveys, oriented structures and assays, six IP lines and the ZTEM 3D inversion — nothing synthesized. Perk-Rocky (report #42317): 2024 surface mapping only — the geological map, structures and outcrop measurements as delivered, on a Copernicus terrain — to model from the map.")}
          >
            <>
              <div style={{ marginBottom: 8 }}>{tx("This is the 3D view — drillhole traces in real world coordinates, with lithology, alteration, veining, geotech and assay data hung off them downhole. Everything starts from a {collar} file.", { collar: <b>{tr("collar")}</b> })}</div>
              <div style={{ marginBottom: 8 }}>{tx("Use the {collars} button under {geometry} in the panel on the left (or File ▸ Import CSV, Ctrl+I), or drag a file straight onto this view. Collars: a CSV (or zipped shapefile / GeoPackage) with a hole ID and x/y/z — {cols}, plus optional {az}, {dip} and {len}. Column names are guessed for you (easting/northing/elevation and friends all work) and anything ambiguous opens a mapping dialog rather than importing wrong.", { collars: <b>{tr("Collars")}</b>, geometry: <b>{tr("Geometry")}</b>, cols: <code>hole_id, x, y, z</code>, az: <code>azimuth</code>, dip: <code>dip</code>, len: <code>length</code> })}</div>
              <div style={{ marginBottom: 12 }}>{tx("Then add downhole survey stations, and any interval layers you have (lithology, alteration, veins, mineralization, geotech, mag susceptibility, structure). Assays live in the {geochem} tab; survey lines and geophysical grids in {geophysics}; GeoTIFFs, satellite imagery, terrain and map layers in {maps}. Coordinates are reprojected to the project CRS on import if the source CRS differs.", { geochem: <b>{tr("Geochem")}</b>, geophysics: <b>{tr("Geophysics")}</b>, maps: <b>{tr("Maps")}</b> })}</div>
            </>
          </EmptyState>
        )}
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}>
          <button onClick={() => setShowLocator((v) => !v)} title={tr("Toggle locator map (shows your project's real-world location)")} style={{ ...iconBtn, ...(showLocator ? { background: "var(--color-divider)", borderColor: "var(--color-selected-border)" } : {}) }}><MapIcon size={14} /></button>
          <button onClick={() => { setRebuildSeq((n) => n + 1); setNotices((p) => [...p, notice("View refreshed — geometry rebuilt from current data")]); }} title={tr("Refresh view (force full geometry rebuild)")} style={iconBtn}><RefreshCw size={14} /></button>
          <button onClick={resetView} title={tr("Reset orientation")} style={iconBtn}><RotateCcw size={14} /></button>
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
          <button onClick={() => { camState.current.phi = 0.02; cameraRef.current.__update(); }} style={miniBtn}>{tr("Top")}</button>
          <button onClick={() => { camState.current.phi = Math.PI - 0.02; cameraRef.current.__update(); }} style={miniBtn}>{tr("Bottom")}</button>
          <button onClick={() => zoomToFitAll()} style={miniBtn} title={tr("Zoom to fit all (also: right-click the view)")} aria-label={tr("Zoom to fit all")}>{tr("Fit")}</button>{/* #567 — the keyboard / visible path the notices pointed to */}
        </div>
        {/* TASKS.csv #189 — the old "■ East ■ Elevation ■ North" text legend used to render here;
            replaced by axisGizmo (created above, rendered every frame via the same viewport/scissor
            technique CompassRose uses), a real camera-synced N/E/Z arrow-triad drawn directly onto
            the canvas at this same bottom-left corner — no DOM element needed for it anymore. */}
        {sectionMode && sectionPreview && (
          <div style={{ position: "absolute", top: 12, left: 12, fontSize: "var(--font-size-sm)", color: "var(--color-success-fg)", background: "var(--color-bg)", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-success-border)" }}>{tr("Start point set — click the end point")}</div>
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
          aria-live={toast?.level === "error" ? "assertive" : "polite"}
          aria-atomic="true"
          style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", maxWidth: "70%", pointerEvents: "none" }}
        >
          {toast && toast.level === "error" && (
            // #390 — errors: danger colours, an icon, and a close button (pointer events back on for it)
            <div key={toast.key} role="alert" style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "var(--font-size-base)", color: "var(--color-danger-text)", background: "var(--color-danger-bg)", padding: "8px 10px 8px 12px", borderRadius: 7, border: "1px solid var(--color-danger-border-strong)", boxShadow: "0 4px 14px rgba(0,0,0,0.4)", pointerEvents: "auto" }}>
              <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1, color: "var(--color-danger-icon)" }} />
              <span style={{ flex: 1 }}>{toast.text}</span>
              <button type="button" aria-label={tr("Dismiss message")} title={tr("Dismiss")} onClick={() => setToast(null)} style={{ flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-danger-text)", display: "flex" }}><X size={14} /></button>
            </div>
          )}
          {toast && toast.level !== "error" && (
            // #690 — hovering keeps it up; a Dismiss button as errors have
            <div key={toast.key} onMouseEnter={holdToast} onMouseLeave={releaseToast} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "var(--font-size-base)", color: "var(--color-text)", background: "var(--color-bg)", padding: "8px 10px 8px 14px", borderRadius: 7, border: "1px solid var(--color-border-light)", boxShadow: "0 4px 14px rgba(0,0,0,0.4)", pointerEvents: "auto" }}>
              <span style={{ flex: 1 }}>{toast.text}</span>
              <button type="button" aria-label={tr("Dismiss message")} title={tr("Dismiss")} onClick={() => setToast(null)} style={{ flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-text-secondary)", display: "flex" }}><X size={14} /></button>
            </div>
          )}
        </div>
        {/* TASKS.csv #198 (part 3) — QGIS-style "enter a Layout Viewport" banner. Everything below the
            camera is already live and interactive (the existing orbit-drag/wheel handlers on this same
            canvas), so this banner is the ONLY new UI the feature needs — just a way to tell the user
            they're editing a specific Viewport and to explicitly commit or discard the new camera
            angle before leaving. */}
        {interactiveViewportSession && (
          <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, fontSize: "var(--font-size-base)", color: "var(--color-text)", background: "var(--color-bg)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border-light)", boxShadow: "0 4px 14px rgba(0,0,0,0.4)", zIndex: 20 }}>
            <span>{tr("Editing Layout viewport — drag to orbit, scroll to zoom")}</span>
            <button onClick={doExitInteractiveViewport} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 10px", fontSize: "var(--font-size-base)" }}>{tr("Update Viewport & Return to Layout")}</button>
            <button onClick={doCancelInteractiveViewport} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "5px 10px", fontSize: "var(--font-size-base)", background: "transparent", border: "1px solid var(--color-border-light)", color: "var(--color-text-secondary)" }}>{tr("Cancel")}</button>
          </div>
        )}
        {rectZoomMode && !rectVisual && (
          <div style={{ position: "absolute", top: 12, left: 12, fontSize: "var(--font-size-sm)", color: "var(--color-success-fg)", background: "var(--color-bg)", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-success-border)" }}>{tr("Drag a rectangle to zoom in — right-click to cancel")}</div>
        )}
        {rectVisual && (
          <div style={{ position: "absolute", left: rectVisual.x, top: rectVisual.y, width: rectVisual.w, height: rectVisual.h, border: "1.5px dashed var(--color-info)", background: "rgba(74,155,224,0.12)", pointerEvents: "none" }} />
        )}
        <div ref={tooltipElRef} style={{ display: "none", position: "fixed", left: 0, top: 0, background: "var(--color-divider)", border: "1px solid var(--color-border-light)", borderRadius: 6, padding: "8px 10px", fontSize: "var(--font-size-base)", whiteSpace: "pre-line", pointerEvents: "none", zIndex: 10, maxWidth: 220 }} />
      </div>

      {contextMenu && (
        <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}>
          <div ref={contextMenuRef} role="menu" aria-label={tr("3D view menu")} onKeyDown={onContextMenuKeyDown} onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, background: "var(--color-divider)", border: "1px solid var(--color-border-light)", borderRadius: 8, padding: 6, fontSize: "var(--font-size-base)", minWidth: 180, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
            {contextMenu.hit ? (
              <>
                <div style={{ padding: "6px 10px", color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", whiteSpace: "pre-line", borderBottom: "1px solid var(--color-border)", marginBottom: 4 }}>{contextMenu.hit.tip}</div>
                <ContextItem label={tr("Zoom here")} onClick={() => { zoomToPoint(contextMenu.hit.point); setContextMenu(null); }} />
                <ContextItem label={tr("Hide {holeId}", { holeId: contextMenu.hit.holeId })} onClick={() => { toggleHole(contextMenu.hit.holeId); setContextMenu(null); }} />
                <ContextItem label={tr("Copy details")} onClick={() => { copyText(contextMenu.hit.tip); setContextMenu(null); }} />
                <ContextItem label={tr("Zoom to selected area…")} onClick={() => { setSectionMode(false); setMeasureMode(null); setRectZoomMode(true); setContextMenu(null); }} />
                <ContextItem label={tr("Zoom to fit all")} onClick={() => { zoomToFitAll(); setContextMenu(null); }} />
                <ContextItem label={tr("Reset orientation")} onClick={() => { resetView(); setContextMenu(null); }} />
              </>
            ) : (
              <>
                <ContextItem label={tr("Zoom to selected area…")} onClick={() => { setSectionMode(false); setMeasureMode(null); setRectZoomMode(true); setContextMenu(null); }} />
                <ContextItem label={tr("Zoom to fit all")} onClick={() => { zoomToFitAll(); setContextMenu(null); }} />
                <ContextItem label={tr("Reset orientation")} onClick={() => { resetView(); setContextMenu(null); }} />
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
                <span>{tr("Background colour")}</span>
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
          <div ref={layerMenuKeys.menuRef} role="menu" aria-label={tr("{label} menu", { label: layerContextMenu.label })} onKeyDown={layerMenuKeys.onKeyDown} onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: layerContextMenu.x, top: layerContextMenu.y, background: "var(--color-divider)", border: "1px solid var(--color-border-light)", borderRadius: 8, padding: 6, fontSize: "var(--font-size-base)", minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
            <div style={{ padding: "4px 10px 6px", color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", borderBottom: "1px solid var(--color-border)", marginBottom: 4 }}>{layerContextMenu.label}</div>
            {!isVector && <>
              <ContextItem label={tr("Zoom to layer")} onClick={() => { zoomToLayer(layerContextMenu.key); setLayerContextMenu(null); }} />
              <ContextItem label={layerVisible[layerContextMenu.key] ? tr("Hide layer") : tr("Show layer")} onClick={() => { toggleLayer(layerContextMenu.key); setLayerContextMenu(null); }} />
              {styleKindFor(layerContextMenu.key) && <ContextItem label={tr("Style (colour, size, shape)…")} onClick={() => { openLayerStyle(layerContextMenu.key, layerContextMenu.label); setLayerContextMenu(null); }} />}
              <ContextItem label={tr("Clear layer data…")} onClick={() => { clearLayer(layerContextMenu.key); setLayerContextMenu(null); }} />
            </>}
            {/* TASKS.csv — export/inspect, the same for real layers and the collars/survey sentinels. */}
            <div style={{ borderTop: "1px solid var(--color-border)", margin: "4px 0" }} />
            <ContextItem label={tr("Export Shapefile (.zip)…")} onClick={() => { exportVectorShapefile(vectorKind, layerContextMenu.key, layerContextMenu.label); setLayerContextMenu(null); }} />
            <ContextItem label={tr("Export GeoPackage (.gpkg)…")} onClick={() => { exportVectorGeoPackage(vectorKind, layerContextMenu.key, layerContextMenu.label); setLayerContextMenu(null); }} />
            <ContextItem label={tr("Export DXF (.dxf)…")} onClick={() => { exportVectorDXF(vectorKind, layerContextMenu.key, layerContextMenu.label); setLayerContextMenu(null); }} />
            {layerContextMenu.key !== "geophys_pts" && <ContextItem label={tr("Export CSV table (imports back)…")} onClick={() => { exportDrillholeTables(vectorKind, layerContextMenu.key, layerContextMenu.label); setLayerContextMenu(null); }} />}
            <ContextItem label={tr("Export all drillhole tables (.zip of CSV)…")} onClick={() => { exportDrillholeTables("all"); setLayerContextMenu(null); }} />
            <ContextItem label={tr("Inspect / edit table…")} onClick={() => { setAttrTableTarget({ kind: vectorKind, key: layerContextMenu.key, label: layerContextMenu.label }); setLayerContextMenu(null); }} />
            {!isVector && <>
              {/* TASKS.csv #76 — sort this layer into a named group (or back out of one). */}
              {layerGroups.length > 0 && <div style={{ borderTop: "1px solid var(--color-border)", margin: "4px 0" }} />}
              {layerGroups.map((g) => {
                const alreadyIn = g.keys.includes(layerContextMenu.key);
                return (
                  <ContextItem key={g.id} label={alreadyIn ? `✓ ${g.name}` : tr("Add to \"{name}\"", { name: g.name })}
                    onClick={() => { setLayerGroupFor(layerContextMenu.key, alreadyIn ? null : g.id); setLayerContextMenu(null); }} />
                );
              })}
              {layerGroups.some((g) => g.keys.includes(layerContextMenu.key)) && (
                <ContextItem label={tr("Remove from group")} onClick={() => { setLayerGroupFor(layerContextMenu.key, null); setLayerContextMenu(null); }} />
              )}
              <ContextItem label={tr("New group…")} onClick={() => {
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

      {rowMenu && ( // TASKS.csv #635
        <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setRowMenu(null)} onContextMenu={(e) => { e.preventDefault(); setRowMenu(null); }}>
          <div ref={rowMenuKeys.menuRef} role="menu" aria-label={tr("{title} menu", { title: rowMenu.title })} onKeyDown={rowMenuKeys.onKeyDown} onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: Math.max(4, Math.min(rowMenu.x, window.innerWidth - 240)), top: Math.max(4, Math.min(rowMenu.y, window.innerHeight - 44 - rowMenu.items.length * 30)), background: "var(--color-divider)", border: "1px solid var(--color-border-light)", borderRadius: 8, padding: 6, fontSize: "var(--font-size-base)", minWidth: 220, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
            <div style={{ padding: "4px 10px 6px", color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", borderBottom: "1px solid var(--color-border)", marginBottom: 4, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rowMenu.title}</div>
            {rowMenu.items.map((it, i) => (it === "-"
              ? <div key={i} style={{ borderTop: "1px solid var(--color-border)", margin: "4px 0" }} />
              : <ContextItem key={i} label={it.label} onClick={() => { setRowMenu(null); it.onClick(); }} />))}
          </div>
        </div>
      )}
      {styleTarget && (
        <Suspense fallback={null}>
          <LayerStyleModal target={{ ...styleTarget, onEditColours: styleTarget.colourKey ? () => setInspectLayer(styleTarget.colourKey) : null }}
            style={styleTarget.surfaceId ? implicitSurfaces.find((x) => x.id === styleTarget.surfaceId)?.style : layerStyles[styleTarget.key]}
            onChange={(patch) => (styleTarget.surfaceId ? setSurfaceStyle(styleTarget.surfaceId, patch) : setLayerStyle(styleTarget.key, styleTarget.kind, patch))}
            onReset={() => (styleTarget.surfaceId ? setSurfaceStyle(styleTarget.surfaceId, null) : setLayerStyle(styleTarget.key, styleTarget.kind, null))}
            onClose={() => setStyleTarget(null)} />
        </Suspense>
      )}
      {attrTableTarget && (
        <AttributeTableModal
          title={attrTableTarget.kind === "collars" || attrTableTarget.kind === "survey" ? tr("{label} (dip negative = down)", { label: attrTableTarget.label }) : attrTableTarget.label}
          rows={attrTableTarget.kind === "collars" ? collars.map(dipShown) : attrTableTarget.kind === "survey" ? survey.map(dipShown) : (layers[attrTableTarget.key] || [])}
          onSave={(newRows) => {
            if (attrTableTarget.kind === "collars") setCollars(newRows.map(dipStored));
            else if (attrTableTarget.kind === "survey") setSurvey(newRows.map(dipStored));
            else replaceLayer(attrTableTarget.key, newRows);
            setNotices((p) => [...p, notice("Saved edits to \"{label}\" ({newRows} row(s)).", { label: attrTableTarget.label, newRows: newRows.length })]);
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
              setNotices((p) => [...p, notice(ids.length === 1 ? "Updated content scope for {ids} section — reopen it to see the change." : "Updated content scope for {ids} sections — reopen them to see the change.", { ids: ids.length })]);
            }}
          />
        );
      })()}
      {qcModalOpen && <DataQCModal onCancel={() => setQcModalOpen(false)} />}
      {sectionGeorefOpen && (
        <Suspense fallback={null}>
          <SectionGeorefModal sections={sections} onClose={() => setSectionGeorefOpen(false)}
            onImport={(img) => { addSectionImage(img); setSectionGeorefOpen(false); setNotices((p) => [...p, notice("{name}: placed in 3D on its section line{v} — listed under Section images.", { name: img.name, v: img.rmse != null ? tr(" (fit error {rmse} m)", { rmse: img.rmse.toFixed(1) }) : "" })]); }} />
        </Suspense>
      )}
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
          colorFor={effectiveColor} labelFor={effectiveLabel} // TASKS.csv #402 — the user's legend colours/names
          modelledLayers={customLayers.filter((l) => l.rows?.[0]?.modelled)} // TASKS.csv #356
          assayColor={(sym, v) => assayColorFor(v, Math.max(0, assayDisplayElements.indexOf(sym)), assayStyle[sym])}
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
          volumeShells={closedShellsForEstimation()}
          trend={trendFor("estimation")} // TASKS.csv #650
          groundAt={terrain ? (x, y) => terrainGroundAt(terrain, x, y) : null} // TASKS.csv #803, #927
          onAddModel={(model) => { const id = addVoxelModel(model); setNotices((p) => [...p, notice("Added block model \"{name}\" ({cells} cells).", { name: model.name, cells: model.cells.length.toLocaleString() })]); return id; }}
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
          Modelling sidebar so the fields it just wrote are actually visible — writing state into a
          panel the user can't see would look like nothing happened. */}
      {stereonetOpen && (
        <StereonetModal
          picks={structurePicksWithHoleAttitude}
          surfacePicks={(surfaceStructures || []).flatMap((st) => st.rows || []).filter((r) => Number.isFinite(r.dip) && Number.isFinite(r.dipDir)).map((r) => ({ value: `${r.cls || "structure"} (outcrop)`, dip: r.dip, azimuth: r.dipDir, x: r.x, y: r.y, outcrop: true }))} // TASKS.csv #428
          domains={domains}
          domainFilter={domainStereonetFilter}
          onClose={() => setStereonetOpen(false)}
          onUseAsTrend={({ azimuth, dip }) => {
            // TASKS.csv #650 — a new named trend from the mean plane (pitch 90 = down dip, the old behaviour)
            const t = { ...cleanTrend({ name: `Stereonet mean (${dip.toFixed(0)}° → ${azimuth.toFixed(0)}°)`, dip: Math.round(dip * 10) / 10, dipAzimuth: Math.round(azimuth * 10) / 10, pitch: 90 }), id: `trend_${Date.now().toString(36)}` };
            setStructuralTrends((s) => ({ ...s, trends: [...(s.trends || []), t] }));
            setStereonetOpen(false);
            goToModule("modelling");
            setNotices((p) => [...p, notice("Trend \"{name}\" added from the stereonet mean orientation — choose which models use it in 3D Modelling → Model settings → Structural trends.", { name: t.name })]);
          }}
        />
      )}
      {/* TASKS.csv #277 — downhole structural (tadpole) plot. Fed the SAME hole-attitude-enriched picks
          the stereonet's Terzaghi correction uses, so alpha means one thing across both tools. */}
      {levelPlanOpen && (() => {
        // TASKS.csv #525 — elevation range of the loaded holes (loops, not Math.min(...) over every vertex, #371)
        let z0 = Infinity, z1 = -Infinity;
        tracesRef.current.forEach((t) => t.wz.forEach((z) => { if (z < z0) z0 = z; if (z > z1) z1 = z; }));
        if (!Number.isFinite(z0)) return null;
        return (
          <LevelPlanWindow
            build={buildPlanPayload}
            zRange={[z0, z1]}
            defaultRl={(z0 + z1) / 2}
            onClose={() => setLevelPlanOpen(false)}
            onSaveBoundary={(pts, rl, name) => addBoundary({ name, polylines: [pts.map(([x, y]) => ({ x, y }))], elevation: rl, drapeMode: "flat" })}
            onAddToLayout={(img) => { addLayoutImage(img); goToModule("layout"); }}
          />
        );
      })()}
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
          outcropMeasurements={(surfaceStructures || []).flatMap((st) => st.rows || [])} // TASKS.csv #428
          addFieldRef={addFieldRef}
          removeFieldRef={removeFieldRef}
          onSaveStructurePick={(row) => {
            setLayers((p) => ({ ...p, structure: [...(p.structure || []), row] }));
            setNotices((p) => [...p, notice("Saved \"{value}\" to the Structure layer ({hole_id} @ {depth}m, dip {dip}° / dipdir {azimuth}°).", { value: row.value, hole_id: row.hole_id, depth: row.depth, dip: row.dip, azimuth: row.azimuth })]);
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
          <div style={{ fontSize: "var(--font-size-xl)", color: "var(--color-accent)", background: "var(--color-bg)", padding: "14px 22px", borderRadius: 8, border: "1px solid var(--color-accent)", textAlign: "center" }}>{tr("Drop CSV(s) to import")}<div style={{ fontSize: "var(--font-size-base)", color: "var(--color-success-fg)", marginTop: 4, fontWeight: 400 }}>{tr("Drop several at once — each auto-detects its layer, or asks if unsure")}</div></div>
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
// to (a modal-open setter, or a one-shot action). Modelling mode doesn't render this yet (TASKS.csv
// #155 follow-up) — its sidebar is unchanged for now.
function ViewToolbar({
  openPopover, setOpenPopover, gridConfig, setGridConfig,
  figureOverlay, setFigureOverlay, projectName, legendCount, // TASKS.csv #311
  themes, themeNameDraft, setThemeNameDraft, captureCurrentTheme, applyTheme,
  renamingThemeId, setRenamingThemeId, renameDraft, setRenameDraft, renameTheme, deleteTheme,
  onDbConnect, onQc, qcDisabled, onBoundaryIntercepts, boundaryDisabled, onSqlWorkspace, sqlDisabled,
  onSnapshot, snapshotDisabled, sectionMode, onToggleSection, sectionCorridor, setSectionCorridor,
  measureMode, onToggleMeasure, onSwitchMeasureMode, measurePts, clearMeasure,
  show, paneProps, // TASKS.csv #458
  onLevelPlan, // TASKS.csv #525
}) {
  const toggle = (name) => setOpenPopover((p) => (p === name ? null : name));
  return (
    <Ribbon show={show} label="3D View tools">
      <RibbonGroup label="View">
        <div className="ge-ribbon-cell ge-adv">
          <HoverToolInfo title={tr("Grid")} text={tr("Toggles the ground reference grid on or off, and lets you resize it, change its division spacing/colour, or add two vertical wall grids for a full 3D reference box. Turn it off if it's cluttering a dense model or a figure you're about to snapshot.")} suppress={openPopover === "grid"}>
            <button className={`ge-ribbon-btn ${openPopover === "grid" ? "active" : ""}`} aria-expanded={openPopover === "grid"} aria-haspopup="dialog" onClick={() => toggle("grid")}><Grid3x3 size={22} strokeWidth={1.7} color={RIBBON_TONES.view} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Grid")}</span></button>
          </HoverToolInfo>
          {openPopover === "grid" && (
            <div style={popoverStyle}>
              <div style={popoverHeader}>{tr("Grid")}<X size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setOpenPopover(null), tr("Close the grid settings popover"))} /></div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setGridConfig((g) => ({ ...g, visible: !g.visible }))} style={{ cursor: "pointer", color: gridConfig.visible ? "var(--color-accent)" : "var(--color-text-disabled)" }}>
                  {gridConfig.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </div>
                <div style={{ flex: 1, fontSize: "var(--font-size-base)", color: gridConfig.visible ? "var(--color-text)" : "var(--color-text-faint)" }}>{tr("Show grid")}</div>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer" }} title={tr("Add two vertical wall grids to the ground grid, forming a 3D reference box")}>
                  <input type="checkbox" checked={gridConfig.mode === "3d"} onChange={(e) => setGridConfig((g) => ({ ...g, mode: e.target.checked ? "3d" : "ground" }))} /> 3D
                </label>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="number" title={tr("Grid size (m)")} value={gridConfig.size} onChange={(e) => setGridConfig((g) => ({ ...g, size: Math.max(10, Number(e.target.value) || g.size) }))} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", fontFamily: "inherit" }} />
                <input type="number" title={tr("Divisions")} value={gridConfig.divisions} onChange={(e) => setGridConfig((g) => ({ ...g, divisions: Math.max(1, Number(e.target.value) || g.divisions) }))} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", fontFamily: "inherit" }} />
                <input type="color" title={tr("Grid colour")} value={gridConfig.color} onChange={(e) => setGridConfig((g) => ({ ...g, color: e.target.value }))} style={{ width: 30, height: 28, padding: 0, border: "1px solid var(--color-border)", borderRadius: 5, background: "none", cursor: "pointer" }} />
              </div>
              {/* TASKS.csv #311 — the world-origin axis lines, grouped here because they are the same
                  kind of reference-furniture decision as the grid. Off by default now (they sit at the
                  arbitrary project origin and are the most debug-view-looking thing in a screenshot);
                  switching them on still gives colours that agree with the corner gizmo, per #189. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginTop: 8, cursor: "pointer" }} title={tr("Draw the red/green/blue X/Y/Z axis lines at the project origin. Off by default — the corner gizmo already shows orientation, and these sit at an arbitrary point relative to your data.")}>
                <input type="checkbox" checked={!!gridConfig.axes} onChange={(e) => setGridConfig((g) => ({ ...g, axes: e.target.checked }))} />{" "}{tr("Origin axis lines")}</label>
            </div>
          )}
        </div>
        <div className="ge-ribbon-cell ge-adv">
          <HoverToolInfo title={tr("Figure overlay")} text={tr("Draws a title, a legend of the categories currently switched on, and a scale bar over the 3D view, so a screenshot of this view can go straight into a report or a deck without being re-annotated. On by default; the setting is saved with the project. For a full report figure — page, north arrow, true-scale capture, PDF — use the Layout tab.")} suppress={openPopover === "figure"}>
            <button className={`ge-ribbon-btn ${openPopover === "figure" ? "active" : ""}`} aria-expanded={openPopover === "figure"} aria-haspopup="dialog" onClick={() => toggle("figure")}><LayoutTemplate size={22} strokeWidth={1.7} color={RIBBON_TONES.view} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Figure")}</span></button>
          </HoverToolInfo>
          {openPopover === "figure" && (
            <div style={{ ...popoverStyle, width: 268 }}>
              <div style={popoverHeader}>{tr("Figure overlay")}<X size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setOpenPopover(null), tr("Close the figure overlay popover"))} /></div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 8 }}>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setFigureOverlay((f) => ({ ...f, enabled: !f.enabled }))} style={{ cursor: "pointer", color: figureOverlay.enabled ? "var(--color-accent)" : "var(--color-text-disabled)" }} {...iconAction(() => setFigureOverlay((f) => ({ ...f, enabled: !f.enabled })), tr("Toggle the figure overlay"))}>
                  {figureOverlay.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                </div>
                <div style={{ flex: 1, fontSize: "var(--font-size-base)", color: figureOverlay.enabled ? "var(--color-text)" : "var(--color-text-faint)" }}>{tr("Show overlay")}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8, opacity: figureOverlay.enabled ? 1 : 0.45 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                  <input type="checkbox" disabled={!figureOverlay.enabled} checked={!!figureOverlay.title} onChange={(e) => setFigureOverlay((f) => ({ ...f, title: e.target.checked }))} />{" "}{tr("Title")}</label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                  <input type="checkbox" disabled={!figureOverlay.enabled} checked={!!figureOverlay.legend} onChange={(e) => setFigureOverlay((f) => ({ ...f, legend: e.target.checked }))} />{" "}{tr("Legend{v}", { v: legendCount ? ` (${legendCount} shown)` : tr(" (nothing switched on)") })}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                  <input type="checkbox" disabled={!figureOverlay.enabled} checked={!!figureOverlay.scale} onChange={(e) => setFigureOverlay((f) => ({ ...f, scale: e.target.checked }))} />{" "}{tr("Scale bar")}</label>
              </div>
              <input
                type="text" disabled={!figureOverlay.enabled}
                placeholder={projectName || tr("Figure title…")}
                value={figureOverlay.titleText || ""}
                onChange={(e) => setFigureOverlay((f) => ({ ...f, titleText: e.target.value }))}
                title={tr("Overrides the project name in the overlay title. Leave blank to use the project name.")}
                style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit", marginBottom: 8, opacity: figureOverlay.enabled ? 1 : 0.45 }}
              />
              {/* The scale-bar honesty statement. A perspective camera has no single scale — the bar is
                  exact only in the plane through the point you are orbiting around. Saying so here (and
                  on the bar itself, "at view centre") is the whole reason this is a popover: an
                  authoritative-looking bar that is quietly wrong at the depth the reader cares about
                  would be worse than no bar at all. */}
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-caption)", lineHeight: 1.5 }}>{tr("The scale bar is exact at the")}{" "}<b>{tr("view centre")}</b>{" "}{tr("— the point you orbit around. This is a perspective view, so anything nearer the camera reads larger than the bar says and anything farther reads smaller. For a figure where the scale must hold everywhere, add a Viewport on the")}{" "}<b>{tr("Layout")}</b>{" "}{tr("tab and tick")}{" "}<b>{tr("True scale (orthographic)")}</b>{" "}{tr("there.")}<br />{tr("The legend lists the categories currently switched on in this view — not everything in the project, and not filtered by what happens to be on screen.")}</div>
            </div>
          )}
        </div>
        <div className="ge-ribbon-cell ge-adv">
          <HoverToolInfo title={tr("Themes")} text={tr("Saves the current view — visible layers, active filters, grid settings, and camera position — as a named theme you can reload later with one click, or bind to a Viewport element on a Layout page so a report figure re-frames itself automatically.")} suppress={openPopover === "themes"}>
            <button className={`ge-ribbon-btn ${openPopover === "themes" ? "active" : ""}`} aria-expanded={openPopover === "themes"} aria-haspopup="dialog" onClick={() => toggle("themes")}><Bookmark size={22} strokeWidth={1.7} color={RIBBON_TONES.view} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Themes")}</span></button>
          </HoverToolInfo>
          {openPopover === "themes" && (
            <div style={{ ...popoverStyle, width: 260 }}>
              <div style={popoverHeader}>{tr("Themes")}<X size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setOpenPopover(null), tr("Close the themes popover"))} /></div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input
                  type="text" placeholder={tr("Theme name…")} value={themeNameDraft}
                  onChange={(e) => setThemeNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && themeNameDraft.trim()) { captureCurrentTheme(themeNameDraft.trim()); setThemeNameDraft(""); } }}
                  style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}
                />
                <button
                  onClick={() => { if (themeNameDraft.trim()) { captureCurrentTheme(themeNameDraft.trim()); setThemeNameDraft(""); } }}
                  disabled={!themeNameDraft.trim()}
                  title={tr("Save the current view (layers, filters, grid, camera, and which generated surfaces are shown) as a named theme")}
                  style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "6px 9px", opacity: themeNameDraft.trim() ? 1 : 0.5, cursor: themeNameDraft.trim() ? "pointer" : "default" }}
                ><BookmarkPlus size={14} /></button>
              </div>
              {themes.length === 0 && (
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4, lineHeight: 1.4 }}>{tr("Save the current view as a theme to reload it later, or bind it to a Viewport element on the Layout page.")}</div>
              )}
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {themes.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
                    {renamingThemeId === t.id ? (
                      <input
                        autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => { if (renameDraft.trim()) renameTheme(t.id, renameDraft.trim()); setRenamingThemeId(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenamingThemeId(null); }}
                        style={{ flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid #3a4658", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}
                      />
                    ) : (
                      <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => applyTheme(t)} title={tr("Apply this theme's layers, filters, grid, camera position, and the generated surfaces it was saved with")} style={{ cursor: "pointer", flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                        <Bookmark size={14} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                      </div>
                    )}
                    <Pencil size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { setRenamingThemeId(t.id); setRenameDraft(t.name); }, tr("Rename theme \"{name}\"", { name: t.name }))} />
                    <X size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => { if (confirmDestructive(tr("Delete theme \"{name}\"?", { name: t.name }))) deleteTheme(t.id); }, tr("Delete theme \"{name}\"", { name: t.name }))} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <RibbonButton advanced icon={SquareSplitVertical} label="3D slice" tone="section" title="Cut the view with a moving vertical or horizontal slab" {...paneProps("slice3d")} />
      </RibbonGroup>
      <RibbonGroup label="Sections">
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Draw cross-section")} text={sectionMode ? tr("Active — click 2 points on the plan view to draw the section, or click the button again to cancel. Drillholes, layers, and voxels all get projected onto it, opening in its own window. Every currently visible layer gets carried into the section; the Buffer setting controls how far off the line a hole/point can be and still be included.") : tr("Click two points on the plan view to slice a vertical section through the model along that line — drillholes, layers, and voxels all get projected onto it, opening in its own window. Every currently visible layer gets carried into the section; the Buffer setting controls how far off the line a hole/point can be and still be included.")}>
            <button className={`ge-ribbon-btn ${sectionMode ? "active" : ""}`} aria-pressed={!!(sectionMode)} onClick={onToggleSection}><Scissors size={22} strokeWidth={1.7} color={RIBBON_TONES.section} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Draw section")}</span></button>
          </HoverToolInfo>
        </div>
        {sectionMode && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginLeft: 4 }} title={tr("Every currently visible layer (litho, alteration, assays, structure, custom…) gets carried into the section")}>{tr("Buffer (m)")}<input type="number" value={sectionCorridor} onChange={(e) => setSectionCorridor(Math.max(1, Number(e.target.value) || 100))} style={{ width: 60, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", fontFamily: "inherit" }} />
          </label>
        )}
        <RibbonButton advanced icon={Crosshair} label="By coordinates" tone="section" title="Open a section from a centre, azimuth and length — or through a hole (scissors in the Holes list)" {...paneProps("sectionCoords")} />
        <RibbonButton advanced icon={Rows3} label="Fence series" tone="section" title="Parallel sections at a set azimuth and spacing, on round grid lines" {...paneProps("fence")} />
        <RibbonButton advanced icon={Layers3} label="Level plan" tone="section" title="Horizontal section (level plan) at an RL: pierce points, logs and assays in a slab, block-model cells and surfaces cut at that elevation" onClick={onLevelPlan} />
      </RibbonGroup>
      <RibbonGroup label="Measure & check">
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Measure")} text={measureMode ? tr("Active — click points on the model to measure, or click the button again to stop. Distance mode chains a running line — each click extends it, showing the total path length, the straight-line start-to-end distance, and the last segment's own length/bearing/elevation change. Area mode builds a polygon — the closing edge back to your first point is drawn dashed automatically, and the readout shows the plan-view (horizontal) area and perimeter. Switch between the two with the Distance/Area pills in the readout.") : tr("Click points on the model (plan or 3D) to measure. Distance mode chains a running line — each click extends it, showing the total path length, the straight-line start-to-end distance, and the last segment's own length/bearing/elevation change. Area mode builds a polygon — the closing edge back to your first point is drawn dashed automatically, and the readout shows the plan-view (horizontal) area and perimeter. Switch between the two with the Distance/Area pills that appear once measuring is on.")}>
            <button className={`ge-ribbon-btn ${measureMode ? "active" : ""}`} aria-pressed={!!(measureMode)} onClick={onToggleMeasure}><Ruler size={22} strokeWidth={1.7} color={RIBBON_TONES.analyse} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Measure")}</span></button>
          </HoverToolInfo>
        </div>
        {measureMode && <MeasureResults mode={measureMode} pts={measurePts} onClear={clearMeasure} onSwitchMode={onSwitchMeasureMode} />}
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Run data QC")} text={qcDisabled ? tr("Load some collars/survey data first. Scans the currently loaded collars, survey, and interval data for common drilling-data mistakes — duplicate hole IDs, out-of-order or overlapping depths, survey stations beyond a hole's stated length, and similar — and lists everything it finds so you can fix it before modelling.") : tr("Scans the currently loaded collars, survey, and interval data for common drilling-data mistakes — duplicate hole IDs, out-of-order or overlapping depths, survey stations beyond a hole's stated length, and similar — and lists everything it finds so you can fix it before modelling.")}>
            <button className={`ge-ribbon-btn${qcDisabled ? " is-disabled" : ""}`} onClick={qcDisabled ? undefined : onQc} aria-disabled={qcDisabled || undefined}><ShieldAlert size={22} strokeWidth={1.7} color={RIBBON_TONES.analyse} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Data QC")}</span></button>
          </HoverToolInfo>
        </div>
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Boundary intercepts")} text={boundaryDisabled ? tr("Load some lithology/alteration interval data first. Lists every geological unit boundary (top of each litho/alteration interval) resolved to a real 3D position along each hole — the same control points the implicit-modelling tools use — so you can review, exclude, or mark individual points \"soft\" before running a surface.") : tr("Lists every geological unit boundary (top of each litho/alteration interval) resolved to a real 3D position along each hole — the same control points the implicit-modelling tools use — so you can review, exclude, or mark individual points \"soft\" before running a surface.")}>
            <button className={`ge-ribbon-btn${boundaryDisabled ? " is-disabled" : ""}`} onClick={boundaryDisabled ? undefined : onBoundaryIntercepts} aria-disabled={boundaryDisabled || undefined}><Milestone size={22} strokeWidth={1.7} color={RIBBON_TONES.analyse} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Intercepts")}</span></button>
          </HoverToolInfo>
        </div>
      </RibbonGroup>
      <RibbonGroup advanced label="Database">
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Connect database")} text={tr("Connects directly to a PostgreSQL database and pulls collars, survey, or other tables straight in — no CSV export/import round trip needed if your data already lives in a database.")}>
            <button className="ge-ribbon-btn" onClick={onDbConnect}><Database size={22} strokeWidth={1.7} color={RIBBON_TONES.data} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Database")}</span></button>
          </HoverToolInfo>
        </div>
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("SQL workspace")} text={sqlDisabled ? tr("Load some data first. Ad hoc SQL queries against whatever's currently loaded (collars, survey, layers, assays, boundaries) — no Postgres connection needed. Also reachable from the Geochem module's toolbar.") : tr("Ad hoc SQL queries against whatever's currently loaded (collars, survey, layers, assays, boundaries) — no Postgres connection needed. Also reachable from the Geochem module's toolbar.")}>
            <button className={`ge-ribbon-btn${sqlDisabled ? " is-disabled" : ""}`} onClick={sqlDisabled ? undefined : onSqlWorkspace} aria-disabled={sqlDisabled || undefined}><TerminalSquare size={22} strokeWidth={1.7} color={RIBBON_TONES.data} aria-hidden="true" /><span className="ge-ribbon-label">{tr("SQL")}</span></button>
          </HoverToolInfo>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Output">
        <div className="ge-ribbon-cell">
          <HoverToolInfo title={tr("Snapshot to Layout")} text={snapshotDisabled ? tr("Load some data first. Captures the current 3D view exactly as it's framed right now and drops it onto the Layout page as a fixed image — good for a report figure that shouldn't change if you keep exploring the model afterward. For a figure that stays live and re-frames itself, use a Theme + Viewport instead.") : tr("Captures the current 3D view exactly as it's framed right now and drops it onto the Layout page as a fixed image — good for a report figure that shouldn't change if you keep exploring the model afterward. For a figure that stays live and re-frames itself, use a Theme + Viewport instead.")}>
            <button className={`ge-ribbon-btn${snapshotDisabled ? " is-disabled" : ""}`} onClick={snapshotDisabled ? undefined : onSnapshot} aria-disabled={snapshotDisabled || undefined}><Camera size={22} strokeWidth={1.7} color={RIBBON_TONES.output} aria-hidden="true" /><span className="ge-ribbon-label">{tr("Snapshot")}</span></button>
          </HoverToolInfo>
        </div>
      </RibbonGroup>
    </Ribbon>
  );
}
const popoverStyle = { position: "absolute", top: "calc(100% + 4px)", left: 0, width: 230, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.12)", padding: 10, zIndex: 50 };
const popoverHeader = { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" };

function ContextItem({ label, onClick, disabled, title }) {
  if (disabled) {
    return <div role="menuitem" aria-disabled="true" title={title} style={{ padding: "7px 10px", borderRadius: 5, cursor: "default", color: "var(--color-text-disabled)" }}>{label}</div>;
  }
  // TASKS.csv #730 — menuitem (was button); tabIndex 0 stays, #575's menuItemsOf finds items by it
  return <div role="menuitem" tabIndex={0} onKeyDown={activateOnKey} onClick={onClick} title={title} onMouseEnter={(e) => (e.currentTarget.style.background = "#242e3c")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")} style={{ padding: "7px 10px", borderRadius: 5, cursor: "pointer", color: "var(--color-text)" }}>{label}</div>;
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
const typedSectionInput = { width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }; // #393
const HoleRow = React.memo(function HoleRow({ hole_id, visible, onToggle, onOpenStripLog, onSection, onZoom }) {
  return (
    <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onToggle(hole_id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 5, cursor: "pointer", fontSize: "var(--font-size-base)", color: visible === false ? "var(--color-text-disabled)" : "var(--color-text)" }}>
      {visible === false ? <EyeOff size={12} /> : <Eye size={12} />}
      <span style={{ flex: 1 }}>{hole_id}</span>
      {onZoom && ( /* TASKS.csv #393 — zoom the 3D view to this hole */
        <span role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Zoom to {hole_id}", { hole_id })}
          onClick={(e) => { e.stopPropagation(); onZoom(hole_id); }}
          title={tr("Zoom to {hole_id}", { hole_id })}
          style={{ display: "flex", alignItems: "center", color: "var(--color-text-muted)", padding: 2, borderRadius: 4 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#1a2028")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#65717e")}
        >
          <Maximize2 size={12} />
        </span>
      )}
      {onSection && ( /* TASKS.csv #393 — section in the plane of this hole */
        <span role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Section through {hole_id}", { hole_id })}
          onClick={(e) => { e.stopPropagation(); onSection(hole_id); }}
          title={tr("Section through {hole_id} — along the hole's own bearing, Buffer from the section tool", { hole_id })}
          style={{ display: "flex", alignItems: "center", color: "var(--color-text-muted)", padding: 2, borderRadius: 4 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#1a2028")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#65717e")}
        >
          <Scissors size={12} />
        </span>
      )}
      <span role="button" tabIndex={0} onKeyDown={activateOnKey}
        onClick={(e) => { e.stopPropagation(); onOpenStripLog(hole_id); }}
        title={tr("Strip log — {hole_id}", { hole_id })}
        style={{ display: "flex", alignItems: "center", color: "var(--color-text-muted)", padding: 2, borderRadius: 4 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#1a2028")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#65717e")}
      >
        <FileBarChart2 size={12} />
      </span>
    </div>
  );
});

function LayerRow({ label, count, visible, onToggle, onUpload, onInspect, onZoom, onClear, onContextMenu, input, expanded, onToggleExpand, children }) {
  return (
    <div style={{ background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }} onContextMenu={onContextMenu}>
      {/* #386 — gap 9 (was 6): the zoom / filter / clear icons sat exactly on the WCAG 2.5.8 24 px spacing limit */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px" }}>
        {/* TASKS.csv #66 — inline expand (category chips + sources) without opening the full
            LayerInspector modal. Only offered once there's something to expand. */}
        {count > 0 && onToggleExpand ? (
          <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onToggleExpand} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} title={expanded ? tr("Collapse") : tr("Expand")} aria-label={`${expanded ? tr("Collapse") : tr("Expand")} ${label}`} aria-expanded={!!expanded}>{/* #596 */}
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        ) : <div style={{ width: 13, flexShrink: 0 }} />}
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onToggle} style={{ cursor: "pointer", color: visible ? "var(--color-accent)" : "var(--color-text-disabled)" }} title={visible ? tr("Hide layer") : tr("Show layer")} aria-label={`${visible ? tr("Hide") : tr("Show")} ${label}`}>{visible ? <Eye size={14} /> : <EyeOff size={14} />}</div>
        <div style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: visible ? "var(--color-text)" : "var(--color-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        {count > 0 && <Maximize2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(onZoom, tr("Zoom to the {label} layer", { label }))} />}
        {count > 0 && <ListFilter size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(onInspect, tr("Filter / legend / sources for the {label} layer (full view)", { label }))} />}
        {/* TASKS.csv #63 — "unload" this layer's data entirely. Separate from the per-source removal
            inside the inspector (ListFilter above) — this is the "I don't want this tab's data at all
            anymore" case, the inspector handles "just pull out one of several CSVs I merged in". */}
        {count > 0 && onClear && <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(onClear, tr("Remove all data from the {label} layer", { label }))} />}
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onUpload} style={{ cursor: "pointer", fontSize: "var(--font-size-sm)", color: count ? "var(--color-accent)" : "var(--color-text-muted)", flexShrink: 0 }} title={tr("Import CSV")} aria-label={count ? tr("Import CSV into {label} ({count} rows)", { label, count }) : tr("Import CSV into {label}", { label })}>{count ? `${count}` : <Upload size={12} />}</div>
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
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 5 }}>{tr("Symbology — {values} {v}{v2}", { values: values.length.toLocaleString(), v: tr(values.length === 1 ? "value" : "values"), v2: values.length > 0 && ` (${min.toLocaleString(undefined, { maximumFractionDigits: 2 })} – ${max.toLocaleString(undefined, { maximumFractionDigits: 2 })})` })}
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
        <input type="number" min="2" max="12" value={classCount} onChange={(e) => setClassCount(Math.max(2, Math.min(12, Number(e.target.value) || 5)))}
          title={tr("Number of classes")} style={{ width: 40, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }} />
        <select value={method} onChange={(e) => setMethod(e.target.value)} title={tr("How the class breaks are computed")}
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>
          <option value="equal">{tr("Linear (equal interval)")}</option>
          <option value="log">{tr("Log-linear")}</option>
          <option value="quantile">{tr("Histogram equalization (quantile)")}</option>
          <option value="normal">{tr("Normal distribution")}</option>
          {/* TASKS.csv #291 — QGIS parity, see GeophysicsModule's copy of this picker. */}
          <option value="jenks">{tr("Natural breaks (Jenks)")}</option>
        </select>
        <select value={palette} onChange={(e) => setPalette(e.target.value)} title={tr("Colour ramp")}
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", maxWidth: 110 }}>
          {Object.entries(PALETTES).map(([k, p]) => <option key={k} value={k}>{p.label.split(" — ")[0]}</option>)}
        </select>
        <button onClick={apply} disabled={!values.length}
          style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--color-selected-border)", background: values.length ? "var(--color-selected-bg)" : "var(--color-bg-subtle)", color: "var(--color-primary)", fontSize: "var(--font-size-sm)", cursor: values.length ? "pointer" : "default", opacity: values.length ? 1 : 0.5 }}
        >{tr("Classify")}</button>
        {stops.length > 0 && (
          <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onChange(null)} title={tr("Remove the custom classes and go back to the default ramp")}
            style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-icon)", cursor: "pointer" }}>{tr("Reset")}</span>
        )}
      </div>
      {stops.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
              <input type="checkbox" checked={sym.colorMode !== "discrete"}
                onChange={(e) => onChange({ ...sym, colorMode: e.target.checked ? "continuous" : "discrete" })} />{tr("Blend between classes")}</label>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 150, overflowY: "auto" }}>
            {stops.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--font-size-sm)" }}>
                <input type="color" value={s.color}
                  onChange={(e) => { const next = stops.map((x, j) => j === i ? { ...x, color: e.target.value } : x); onChange({ ...sym, stops: next }); }}
                  style={{ width: 22, height: 16, padding: 0, border: "1px solid var(--color-border-light)", borderRadius: 3, background: "none", cursor: "pointer", flexShrink: 0 }} />
                <input type="number" value={s.value}
                  onChange={(e) => { const next = stops.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x); onChange({ ...sym, stops: next }); }}
                  title={tr("Lower bound of this class")}
                  style={{ flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "2px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }} />
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
              <span role="button" tabIndex={0} onKeyDown={activateOnKey}
                key={value}
                onClick={(e) => (e.shiftKey ? onIsolate(value) : onToggleCategory(value))}
                title={tr("{lbl} ({count}) — click to toggle, shift-click to show only this one", { lbl, count })}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 10,
                  fontSize: "var(--font-size-xs)", cursor: "pointer", border: `1px solid ${hidden ? "var(--color-border-light)" : color}`,
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
            <div key={src} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", marginBottom: 3 }}>
              <div style={{ flex: 1, minWidth: 0, color: "var(--color-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={src}>{src}</div>
              <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>{count}</span>
              <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-faint)", flexShrink: 0 }} {...iconAction(() => onRemoveSource(src), tr("Remove the {count} row(s) imported from \"{src}\"", { count, src }))} />
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
  const box = { display: "flex", alignItems: "center", gap: 10, marginLeft: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "5px 10px" };
  const clearBtn = { display: "flex", alignItems: "center", gap: 3, cursor: "pointer", color: "var(--color-danger-icon)", fontSize: "var(--font-size-sm)", flexShrink: 0 };
  const pillWrap = { display: "flex", alignItems: "center", gap: 2, background: "#e8eaed", borderRadius: 5, padding: 2, flexShrink: 0 };
  const pill = (active) => ({ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: "var(--font-size-sm)", color: active ? "var(--color-text)" : "var(--color-text-faint)", background: active ? "var(--color-bg)" : "transparent", boxShadow: active ? "0 1px 2px rgba(0,0,0,0.1)" : "none" });

  const modeSwitch = (
    <div style={pillWrap}>
      <span role="button" tabIndex={0} onKeyDown={activateOnKey} style={pill(mode === "distance")} onClick={() => onSwitchMode("distance")}>{tr("Distance")}</span>
      <span role="button" tabIndex={0} onKeyDown={activateOnKey} style={pill(mode === "area")} onClick={() => onSwitchMode("area")}>{tr("Area")}</span>
    </div>
  );

  if (mode === "distance") {
    if (pts.length < 2) {
      return (
        <div style={box}>
          {modeSwitch}
          <span>{pts.length === 0 ? tr("Click on the model to start measuring…") : tr("1 point placed — click to add the next.")}</span>
          {pts.length > 0 && <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onClear} style={clearBtn}><X size={12} />{" "}{tr("Clear")}</span>}
        </div>
      );
    }
    const totalPath = polylineLength(pts, false);
    const straight = segmentStats(pts[0], pts[pts.length - 1]);
    const last = segmentStats(pts[pts.length - 2], pts[pts.length - 1]);
    return (
      <div style={box}>
        {modeSwitch}
        <span><b style={{ color: "var(--color-text)" }}>{tr("Total:")}</b> {fmtLen(totalPath)}</span>
        {pts.length > 2 && <span><b style={{ color: "var(--color-text)" }}>{tr("Straight-line:")}</b> {fmtLen(straight.dist3d)}</span>}
        <span><b style={{ color: "var(--color-text)" }}>{tr("Last segment:")}</b> {tr("{v} @ {azimuth}° (Δelev {v2}{vert} m)", { v: fmtLen(last.dist3d), azimuth: last.azimuth.toFixed(1), v2: last.vert >= 0 ? "+" : "", vert: last.vert.toFixed(1) })}</span>
        <span style={{ color: "var(--color-text-muted)" }}>{tr("{pts} pt(s)", { pts: pts.length })}</span>
        <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onClear} style={clearBtn}><X size={12} />{" "}{tr("Clear")}</span>
      </div>
    );
  }

  // area mode
  if (pts.length < 3) {
    return (
      <div style={box}>
        {modeSwitch}
        <span>{tr("{pts} point(s) placed — need at least 3 to compute an area.", { pts: pts.length })}</span>
        {pts.length > 0 && <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onClear} style={clearBtn}><X size={12} />{" "}{tr("Clear")}</span>}
      </div>
    );
  }
  const area = polygonArea(pts);
  const perimeter = polylineLength(pts, true);
  return (
    <div style={box}>
      {modeSwitch}
      <span><b style={{ color: "var(--color-text)" }}>{tr("Area:")}</b> {fmtArea(area)}</span>
      <span><b style={{ color: "var(--color-text)" }}>{tr("Perimeter:")}</b> {fmtLen(perimeter)}</span>
      <span style={{ color: "var(--color-text-muted)" }}>{tr("{pts} pt(s)", { pts: pts.length })}</span>
      <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={onClear} style={clearBtn}><X size={12} />{" "}{tr("Clear")}</span>
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
  const visibleCount = model.cells.filter((c) => c.value >= dispMin && c.value <= dispMax && voxelCellSupported(model, c)).length;
  const isFiltered = dispMin > model.min || dispMax < model.max;
  return (
    <div style={{ marginTop: 8, padding: "8px 9px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onUpdate(model.id, { visible: model.visible === false })} style={{ cursor: "pointer", color: model.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }} title={model.visible !== false ? tr("Hide") : tr("Show")}>
          {model.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{model.name}</div>
        {isFiltered && <span style={{ color: "var(--color-info)", fontSize: "var(--font-size-xs)", flexShrink: 0 }} title={tr("A range filter is active on this model")}>{tr("band")}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
        <span style={{ color: "var(--color-text-faint)", width: 30, flexShrink: 0 }}>{tr("Min")}</span>
        <input type="range" min={model.min} max={model.max} step={(model.max - model.min) / 200 || 0.01} value={dispMin} onChange={(e) => onMinInput(Math.min(Number(e.target.value), dispMax))} style={{ flex: 1 }} />
        <span style={{ color: "var(--color-text-secondary)", width: 58, textAlign: "right", flexShrink: 0 }}>{dispMin.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
        <span style={{ color: "var(--color-text-faint)", width: 30, flexShrink: 0 }}>{tr("Max")}</span>
        <input type="range" min={model.min} max={model.max} step={(model.max - model.min) / 200 || 0.01} value={dispMax} onChange={(e) => onMaxInput(Math.max(Number(e.target.value), dispMin))} style={{ flex: 1 }} />
        <span style={{ color: "var(--color-text-secondary)", width: 58, textAlign: "right", flexShrink: 0 }}>{dispMax.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
        <span>{tr("Showing {visibleCount} of {cells} cell(s)", { visibleCount: visibleCount.toLocaleString(), cells: model.cells.length.toLocaleString() })}</span>
        {isFiltered && <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={reset} style={{ cursor: "pointer", color: "var(--color-info)" }}>{tr("Reset")}</span>}
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
      <input placeholder={tr("Hole name (optional)")} value={draft.name} onChange={(e) => set("name", e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", fontSize: "var(--font-size-base)", color: "var(--color-text)", marginBottom: 5 }} />
      {collars.length > 0 && (
        <select
          value={fromCollarId}
          onChange={(e) => applyFromCollar(e.target.value)}
          style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 5 }}
          title={tr("Fill E/N/Elev below from an existing real collar, to design a new hole starting there")}
        >
          <option value="">{tr("Collar (E/N/Elev): custom, typed below")}</option>
          {collars.map((c) => <option key={c.hole_id} value={c.hole_id}>{c.hole_id}</option>)}
        </select>
      )}
      <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
        <NumField label="E" value={draft.x} onChange={(v) => set("x", v)} />
        <NumField label="N" value={draft.y} onChange={(v) => set("y", v)} />
        <NumField label={tr("Elev")} value={draft.z} onChange={(v) => set("z", v)} />
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
        <NumField label={tr("Az°")} value={draft.azimuth} onChange={(v) => set("azimuth", v)} />
        <NumField label={tr("Dip°")} value={draft.dip} onChange={(v) => set("dip", v)} />
        <NumField label={tr("Length m")} value={draft.length} onChange={(v) => set("length", v)} />
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <button
          onClick={onStartPick}
          style={{ ...miniBtn, flex: 1, background: pickMode ? "var(--color-primary)" : miniBtn.background, border: pickMode ? "1px solid var(--color-primary)" : miniBtn.border, color: pickMode ? "var(--color-bg)" : miniBtn.color }}
          title={tr("Click, then click anywhere in the 3D view to place a hole there")}
        >
          {pickMode ? tr("Click on the view…") : tr("Pick on view")}
        </button>
        <button onClick={submit} disabled={!canAdd} style={{ ...miniBtn, flex: 1, background: canAdd ? "var(--color-selected-bg)" : "var(--color-bg-subtle)", borderColor: canAdd ? "var(--color-selected-border)" : "var(--color-border-light)", opacity: canAdd ? 1 : 0.5 }}>{tr("+ Add hole")}</button>
      </div>
      <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 7, paddingTop: 7 }}>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4 }}>{tr("Solve azimuth/dip/length to hit a target from the E/N/Elev above")}</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
          <NumField label={tr("Target E")} value={target.x} onChange={(v) => setTarget((p) => ({ ...p, x: v }))} />
          <NumField label={tr("Target N")} value={target.y} onChange={(v) => setTarget((p) => ({ ...p, y: v }))} />
          <NumField label={tr("Target Elev")} value={target.z} onChange={(v) => setTarget((p) => ({ ...p, z: v }))} />
        </div>
        <button onClick={solveTarget} disabled={!targetReady || !fromReady} style={{ ...miniBtn, width: "100%", background: targetReady && fromReady ? "var(--color-selected-bg)" : "var(--color-bg-subtle)", borderColor: targetReady && fromReady ? "var(--color-selected-border)" : "var(--color-border-light)", opacity: targetReady && fromReady ? 1 : 0.5 }}>{tr("Solve az/dip/length to target")}</button>
      </div>
    </div>
  );
}
function NumField({ label, value, onChange, placeholder }) {
  return (
    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--font-size-xs)", color: "var(--color-text-faint)" }}>
      {label}
      <input type="number" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 5px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }} />
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
// (the sums live in lib/plannedHoleChecks.js since TASKS.csv #1039)
const cellsVersions = new WeakMap();
let cellsVersionSeq = 0;
function cellsVersion(cells) { if (!cells) return 0; let v = cellsVersions.get(cells); if (!v) { v = ++cellsVersionSeq; cellsVersions.set(cells, v); } return v; }
function PlannedHoleChecks({ plannedHoles, collars, survey, voxelModels, desurveyMethod, surfaces = [], onExportPierces }) { // #135; surfaces: #1009
  const [minSpacing, setMinSpacing] = useState(25);
  // TASKS.csv #1009 — where each planned hole crosses the visible modelled surfaces (downhole depth, vertical depth, angle)
  // TASKS.csv #1039 — keyed on the holes' geometry, not the array: typing a name or a note re-ran every check (1-8 s per
  // character on a large project). The drilled traces and each narrowed model's in-band blocks are indexed once.
  const geomKey = planGeometryKey(plannedHoles);
  const holesRef = useRef(plannedHoles);
  holesRef.current = plannedHoles;
  const pierces = useMemo(() => new Map(holesRef.current.map((h) => [h.id, surfacePierces(plannedHoleTrace(h), surfaces)])), [geomKey, surfaces]);
  const [costPerM, setCostPerM] = useState("");
  const drilled = useMemo(() => drilledTraceIndex(collars, survey, desurveyMethod), [collars, survey, desurveyMethod]);
  const targetKey = voxelModels.filter(isTargetModel).map((m) => `${m.id}|${m.threshold}|${m.rangeMax}|${m.min}|${m.max}|${m.supportCutoff ?? ""}|${cellsVersion(m.cells)}`).join(";"); // not opacity / colour
  const modelsRef = useRef(voxelModels);
  modelsRef.current = voxelModels;
  const targets = useMemo(() => modelsRef.current.filter(isTargetModel).map(targetBandIndex), [targetKey]);
  const checked = useMemo(() => planChecks(holesRef.current, drilled, targets, plannedHoleTrace), [geomKey, drilled, targets]);
  const results = checked.map((r) => ({ ...r, hole: plannedHoles.find((h) => h.id === r.hole.id) || r.hole })); // the current name
  const totalM = plannedHoles.reduce((s, h) => s + (Number(h.length) || 0), 0);
  const rate = Number(costPerM);
  const totalCost = costPerM !== "" && Number.isFinite(rate) && rate > 0 ? totalM * rate : null;
  const anyTargetModel = voxelModels.some(isTargetModel);

  return (
    <div style={{ marginTop: 10, padding: "9px 10px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6 }}>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", fontWeight: 600, marginBottom: 6 }}>{tr("Planned hole checks")}</div>
      <div style={{ display: "flex", gap: 4, marginBottom: 7 }}>
        <NumField label={tr("Min. spacing (m)")} value={minSpacing} onChange={(v) => setMinSpacing(v === "" ? 0 : Math.max(0, v))} />
        <NumField label={tr("Cost ($/m)")} value={costPerM} placeholder={tr("enter your rate")} onChange={setCostPerM} />
      </div>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 7 }}>
        {tr("{plannedHoles} {v}, {totalM} m total{v2}", { plannedHoles: plannedHoles.length, v: tr(plannedHoles.length === 1 ? "hole" : "holes"), totalM: totalM.toLocaleString(), v2: totalCost != null ? tr(" — est. ${totalCost} at ${rate}/m", { totalCost: totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 }), rate }) : "" })}
      </div>
      {voxelModels.length > 0 && !anyTargetModel && (
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 7, lineHeight: 1.4 }}>{tr("Narrow a voxel model's Min/Max range above (in \"Geophysical voxel ranges\") to check planned holes against a target band.")}</div>
      )}
      {results.map(({ hole, nearestReal, targetHits }) => {
        const tooClose = nearestReal && nearestReal.distance < minSpacing;
        return (
          <div key={hole.id} style={{ padding: "6px 8px", marginBottom: 5, borderRadius: 5, background: tooClose ? "var(--color-danger-bg-soft)" : "var(--color-bg-subtle)", border: `1px solid ${tooClose ? "var(--color-danger-fg)" : "var(--color-border)"}`, fontSize: "var(--font-size-sm)" }}>
            <div style={{ color: "var(--color-text)", marginBottom: 2 }}>{hole.name || tr("Planned hole")}</div>
            {nearestReal ? (
              <div style={{ color: tooClose ? "var(--color-danger-fg)" : "var(--color-text-caption)" }}>{tr("Nearest existing hole: {hole_id} — {distance} m{v}", { hole_id: nearestReal.hole_id, distance: nearestReal.distance.toFixed(1), v: tooClose ? tr(" (within the {minSpacing} m minimum)", { minSpacing }) : "" })}
              </div>
            ) : (
              <div style={{ color: "var(--color-text-muted)" }}>{tr("No existing drilled holes to compare against.")}</div>
            )}
            {targetHits.length > 0 && (
              <div style={{ color: "var(--color-info)", marginTop: 2 }}>
                {targetHits.map((h) => `${h.metres.toFixed(0)} m in "${h.modelName}"'s target band`).join("; ")}
              </div>
            )}
            {/* TASKS.csv #1009 — pierce points */}
            {surfaces.length > 0 && (() => {
              const ps = pierces.get(hole.id) || [];
              if (!ps.length) return <div style={{ color: "var(--color-text-muted)", marginTop: 3 }}>{tr("Crosses none of the visible modelled surfaces.")}</div>;
              return (
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4, fontSize: "var(--font-size-sm)" }}>
                  <thead><tr style={{ color: "var(--color-text-muted)", textAlign: "right" }}>
                    <th style={{ textAlign: "left", fontWeight: 500 }}>{tr("Surface")}</th>
                    <th style={{ fontWeight: 500 }} title={tr("Downhole depth along the planned trace (lift and drift included)")}>{tr("Depth (m)")}</th>
                    <th style={{ fontWeight: 500 }} title={tr("Vertical depth below the collar")}>{tr("Vert. (m)")}</th>
                    <th style={{ fontWeight: 500 }} title={tr("Angle between the hole and the surface where they meet: 90° is square on; a low angle gives a long, oblique intercept")}>{tr("Angle (°)")}</th>
                  </tr></thead>
                  <tbody>{ps.map((p, i) => (
                    <tr key={i} style={{ textAlign: "right", color: "var(--color-text)" }} title={`E ${p.x.toFixed(1)}  N ${p.y.toFixed(1)}  ${tr("elevation")} ${p.z.toFixed(1)}`}>
                      <td style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{p.surfaceName}</td>
                      <td>{p.md.toFixed(1)}</td><td>{p.verticalDepth.toFixed(1)}</td><td>{p.angle == null ? "—" : p.angle.toFixed(0)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              );
            })()}
          </div>
        );
      })}
      {surfaces.length > 0 && onExportPierces && (
        <button onClick={onExportPierces} style={{ width: "100%", marginTop: 4, padding: "5px 8px", fontSize: "var(--font-size-sm)", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 5, cursor: "pointer", color: "var(--color-text)" }}
          title={tr("Every planned hole's crossings of the visible modelled surfaces: hole, surface, downhole and vertical depth, easting, northing, elevation and angle")}>{tr("Export pierce points (CSV)")}</button>
      )}
      {surfaces.length === 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{tr("Build or show a modelled surface (3D Modelling) to list where the planned holes cross it.")}</div>}
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
    <div style={{ marginBottom: 6, padding: "7px 9px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onUpdate(hole.id, { visible: hole.visible === false })} style={{ cursor: "pointer", color: hole.visible !== false ? "#22c9e0" : "var(--color-text-disabled)", flexShrink: 0 }} title={hole.visible !== false ? tr("Hide") : tr("Show")}>
          {hole.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
        </div>
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setExpanded((v) => !v)} style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>{hole.name || tr("Planned hole")}</div>
        {expanded ? <ChevronUp size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setExpanded(false), tr("Collapse this planned hole"))} /> : <ChevronDown size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => setExpanded(true), tr("Expand this planned hole"))} />}
        <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { if (window.confirm(tr("Remove planned hole \"{v}\"?", { v: hole.name || hole.id }))) onRemove(hole.id); }, tr("Remove planned hole \"{v}\"", { v: hole.name || hole.id }))} />
      </div>
      <div style={{ marginTop: 3, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("Az {v}° / Dip {v2}° / {v3} m{v4}", { v: Math.round(hole.azimuth), v2: Math.round(hole.dip), v3: Math.round(hole.length), v4: toe ? tr(" — toe E {x} N {y} Elev {z}", { x: toe.x.toFixed(0), y: toe.y.toFixed(0), z: toe.z.toFixed(0) }) : "" })}
      </div>
      {expanded && (
        <div style={{ marginTop: 6, borderTop: "1px solid var(--color-divider)", paddingTop: 6 }}>
          <input placeholder={tr("Name")} value={hole.name || ""} onChange={(e) => onUpdate(hole.id, { name: e.target.value })} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", fontSize: "var(--font-size-base)", color: "var(--color-text)", marginBottom: 5 }} />
          <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
            <NumField label="E" value={hole.x} onChange={(v) => onUpdate(hole.id, { x: v })} />
            <NumField label="N" value={hole.y} onChange={(v) => onUpdate(hole.id, { y: v })} />
            <NumField label={tr("Elev")} value={hole.z} onChange={(v) => onUpdate(hole.id, { z: v })} />
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
            <NumField label={tr("Az°")} value={hole.azimuth} onChange={(v) => onUpdate(hole.id, { azimuth: v })} />
            <NumField label={tr("Dip°")} value={hole.dip} onChange={(v) => onUpdate(hole.id, { dip: v })} />
            <NumField label={tr("Length m")} value={hole.length} onChange={(v) => onUpdate(hole.id, { length: v })} />
          </div>
          <textarea placeholder={tr("Notes")} value={hole.notes || ""} onChange={(e) => onUpdate(hole.id, { notes: e.target.value })} rows={2} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", resize: "vertical" }} />
          {/* TASKS.csv #119 - drill-to-target solver and planned-vs-as-drilled comparison. `raw` is
              this row's already-built trace, so the panel never desurveys the planned hole again. */}
          <PlannedHoleTargeting hole={hole} onUpdate={onUpdate} plannedPts={raw} collars={collars} survey={survey} />
        </div>
      )}
    </div>
  );
}

const miniBtn = { width: 60, padding: "5px 0", borderRadius: 6, fontSize: "var(--font-size-sm)", cursor: "pointer", border: "1px solid var(--color-border-light)", background: "var(--color-bg-subtle)", color: "var(--color-text-secondary)" };
const iconBtn = { width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", cursor: "pointer" };
const miniField = { flex: 1, display: "flex", flexDirection: "column", gap: 3, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
