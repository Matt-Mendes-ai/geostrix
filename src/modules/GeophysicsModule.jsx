import React, { Suspense, useEffect, useMemo, useRef, useState } from "react"; // Suspense: TASKS.csv #1425
import { ensureProjectCrs, ensureExportCrs } from "../lib/projectCrsRequest.js"; // TASKS.csv #615; export: #1021
import { exportCrs, terrainToWorld, tiedExportNote } from "../lib/tiedExport.js"; // TASKS.csv #2322 — a tied local grid's exports through its tie
import { useModuleAction, requestModuleAction } from "../lib/menuRequests.js"; // TASKS.csv #565; requestModuleAction: #1152
import { askAdoptCrs, projectEpsgChooser, medianLonLat } from "../lib/adoptCrs.js"; // TASKS.csv #607; medianLonLat: #2833
import { gemHeaderEpsg, KEEP_CHOICES, suggestKeepEvery, everyNth, batchSurveyName, pairGpsFile } from "../lib/xyzBatch.js"; // TASKS.csv #1329
import BlockModelMappingModal from "../components/BlockModelMappingModal.jsx"; // TASKS.csv #410
import { guessBlockModelMapping, numericColumns, importBlockModelAttrs } from "../lib/blockModelCsv.js"; // importBlockModelAttrs: #1671 (in a worker)
import { parseTableFile, toExportCsv, skipPreamble } from "../lib/tabular.js"; // TASKS.csv #444; toExportCsv: #1094; skipPreamble: #1666
import { guessGeophysColumns, rowsToGeophysPoints } from "../lib/geophysColumns.js"; // TASKS.csv #484
import SourceCrsField from "../components/SourceCrsField.jsx"; // TASKS.csv #488
import Papa from "papaparse";
import { zeroMeansMissing } from "../lib/missingElevation.js"; // TASKS.csv #1436
import { suspectElevationIds, elevationTrust } from "../lib/collarElevationTrust.js"; // TASKS.csv #2987 (the shared rule, #3004)
import { logReadingCounts } from "../lib/inversionLogSources.js"; // TASKS.csv #2950
import { mainClusters } from "../lib/dataClusters.js"; // TASKS.csv #1461
import { fetchAreaBox, modelGapKm } from "../lib/dataExtent.js"; // #1461; modelGapKm: #1427
import { Radio, Upload, Trash2, ArrowRight, Eye, EyeOff, Loader2, Mountain, Triangle, Box, MapPin, Waypoints, Plus, Palette, Download, Flag, Globe, ArrowDownToLine, PackageOpen, Scale, Crosshair } from "../components/icons.js"; // Crosshair: #2657
import { requestPlanZoom, polylinesBox } from "../lib/planZoom.js"; // TASKS.csv #2657 // Scale: #1052
import { lazyModal } from "../lib/lazyModal.jsx";
import { withSetColumns } from "../lib/estimateSet.js"; // TASKS.csv #3014 part c — a set member exported with its siblings' columns
import { sampleModelOnHoles } from "../lib/voxelSample.js"; // TASKS.csv #323
import { logStops, SEQUENTIAL_ANCHORS, b64ToF32 } from "../lib/inversion.js"; // TASKS.csv #481; b64ToF32: #2846
import { SURVEY_METHODS, unitsForMethod, robustRange, SURVEY_METHOD_GROUPS, guessSurveyMethodFrom, diurnalApplies /* #1586 */, Z_MEANINGS, surveyKey, surveyStats, aglToElevation, replaceSurveyPoints, surveyExportRows } from "../lib/geophysSurveys.js"; // surveyExportRows: #1094 // TASKS.csv #451; replaceSurveyPoints #600
import { radiometricChannels, otherMeasurementColumns, isMultiRadiometric, channelKey, withValueChannel, tickedChannels, ratioJobs, ratioOf } from "../lib/radiometricChannels.js"; // TASKS.csv #2395
import { terrainElevationAt } from "../lib/inversion.js";
import { downholeLikeness } from "../lib/downholeLikeness.js"; // TASKS.csv #1709
import AddWebLayerModal from "../components/AddWebLayerModal.jsx";
const MacrostratModal = React.lazy(() => import("../components/MacrostratModal.jsx")); // TASKS.csv #2005
import { useStore } from "../lib/store.jsx";
import { classifyBreaks, PALETTES, paletteShortName /* #1859 */, paletteColorsHex , colorForVoxelValue, readableValues /* #1422 */, rangeText /* #2402 */, classCountNote /* #1430 */ } from "../lib/layers.js";
import StopValueInput from "../components/StopValueInput.jsx"; // TASKS.csv #1422
import { parseDEMFiles, buildRasterImport, terrainToGeoTIFFArrayBuffer } from "../lib/raster.js";
import { boundaryAreaHectares } from "../lib/geoprocessing.js";
import { saveFile, safeFileName, runPfieldsJob } from "../lib/desktop.js"; // safeFileName: #1114; runPfieldsJob: #2846 (the spline)
import { blockModelCsvText, blockModelParamLines } from "../lib/blockModelExport.js"; // TASKS.csv #411; #1041
import { stampLines, withStamp, stampBeside, stampPlacement, stampEpsg } from "../lib/provenance.js"; // TASKS.csv #404/#411
import { version as APP_VERSION } from "../../package.json"; // TASKS.csv #529
import InfoButton from "../components/InfoButton.jsx";
import { fetchSRTMTerrain, collarGroundMisfit, findBetterUtmZone } from "../lib/srtmFetch.js";
import { fetchCopernicusTerrain } from "../lib/copernicusDem.js"; // TASKS.csv #814
import { toLonLat, reprojectXY, crsName, pointTransform, getProj4Def, isMetricProjectedEpsg, isGeographicCrs } from "../lib/reproject.js"; // isMetricProjectedEpsg: #2127; isGeographicCrs: #2832
import { geosoftHeaderEpsg, xyLookLikeDegrees } from "../lib/stationDegrees.js"; // TASKS.csv #2832
import { omfToProjectObjectsAsync } from "../lib/omfImport.js"; // TASKS.csv #637; #1280
import { isDcip2dMeshText } from "../lib/ubc2d.js"; // TASKS.csv #1348
import { parseUBCMesh, isUBCMeshText, parseUBCModelStream, maskAirCells, ubcMeshToCells, cellValueRange, MAX_CELLS, planCoarsenFactors, coarsenUBCModel, coarsenRecord, wantsLogMean, MEAN_RULE } from "../lib/voxel.js"; // coarsenRecord: #1095
import { parsePLYBoundary, parseXYZ, guessXyzChannels } from "../lib/geosoft.js";
import { gridPairs, stationPlacer, nearestStationZ, looksLikeLocalGrid } from "../lib/gridFromStations.js"; // TASKS.csv #1326
import { parseStationFile } from "../lib/dcipStations.js";
import { gemHeaderInfo, fileNameDate, parseBaseStation, diurnalCorrect, batchDiurnalPlan } from "../lib/diurnal.js"; // fileNameDate…: TASKS.csv #1585
import DiurnalCorrectionBox from "../components/DiurnalCorrectionBox.jsx";
import { parseDXF, dxfToBoundaries, dxfSkippedText } from "../lib/dxf.js";
import { readKmlFile, kmlToProjectPolylines } from "../lib/kml.js"; // TASKS.csv #424
import { parseShapefileZip, parseShapefileParts } from "../lib/shapefile.js";
import { groupShapefileParts } from "../lib/viewer/importHelpers.js"; // TASKS.csv #2121 — a loose .shp with its .prj / .dbf / .cpg
import { parseGeoPackage } from "../lib/gpkg.js";
import { idwGridToRasterInput, gridValuesToRasterInput, snappedGridExtent, suggestBlankingDistance, suggestIdwCell, uniqueName } from "../lib/idw.js"; // suggestIdwCell, uniqueName: #2562; gridValuesToRasterInput, snappedGridExtent: #2846, #2872
import { surveySplineRequest, splineFinish, gridMethodTag } from "../lib/surveyGrid.js"; // TASKS.csv #2846
import { gridSurveyAsync } from "../lib/surveyGridClient.js"; // #2846 — minimum curvature in a worker
import { MINCURV_MAX_CELLS, SPLINE_MAX_CELLS } from "../lib/sampleGrid.js"; // #2846
import { hillshadeToRasterInput, terrainDerivativeToRasterInput, autoZFactor, earlierDerivatives } from "../lib/hillshade.js"; // derivatives: TASKS.csv #797; autoZFactor: #2460; earlierDerivatives: #1764
import { contourTerrain } from "../lib/contours.js";
import SpatialAnalysis from "../components/SpatialAnalysis.jsx";
import BasemapView from "../components/BasemapView.jsx";
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";
import EmptyState from "../components/EmptyState.jsx"; // TASKS.csv #309
import InversionPanel from "../components/InversionPanel.jsx"; // TASKS.csv #321 — SimPEG
import DcipPanel from "../components/DcipPanel.jsx"; // TASKS.csv #322 — 2D DC resistivity / IP
import { Ribbon, RibbonGroup, RibbonButton, TaskPaneHeader } from "../components/Ribbon.jsx"; // TASKS.csv #458
import { Activity as RActivity } from "../components/icons.js"; // TASKS.csv #1425
const DownholeLogsPane = React.lazy(() => import("../components/DownholeLogsPane.jsx")); // TASKS.csv #1425
const MtSoundingsPane = React.lazy(() => import("../components/MtSoundingsPane.jsx")); // TASKS.csv #1989
const FdemPane = React.lazy(() => import("../components/FdemPane.jsx")); // TASKS.csv #1986
const EqsGridBox = React.lazy(() => import("../components/EqsGridBox.jsx")); // TASKS.csv #1985
const GravityReductionBox = React.lazy(() => import("../components/GravityReductionBox.jsx")); // TASKS.csv #1985
import { Layers as RLayers /* #1986 */, Waves as RWaves /* #1989 */, Zap as RZap, Radar as RRadar, Magnet as RMagnet, Mountain as RMountain, Shapes as RShapes, Globe as RGlobe, Flag as RFlag, Settings2 as RSettings2, Package as RPackage, Box as RBox } from "../components/icons.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { arrMin, arrMax, median } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread); median: #2239
import { unreadableFormatAdvice, textTableRefusal } from "../lib/unreadableFormats.js"; // TASKS.csv #603; textTableRefusal: #2847
import { t as tr } from "../lib/i18n.js";
import { decadesBetween, isLogSpaced, logViridisStops } from "../lib/pointSurveyScale.js"; // TASKS.csv #1787
import { defaultModelLegend } from "../lib/modelDefaultStops.js"; // TASKS.csv #2400
import { guessVoxelProperty, isLogProperty, propertyRamp, parseGradeLabel } from "../lib/voxelProperty.js"; // TASKS.csv #1786; propertyRamp: #1788; parseGradeLabel: #2667
import { cloudShape } from "../lib/cloudShape.js"; // TASKS.csv #1783
import { defaultDrapeElevation, rasterDrapeElevation, drapeElevationNote, planElevation } from "../lib/drapeElevation.js"; // planElevation: #2294; // TASKS.csv #1856; rasterDrapeElevation: #1505
import { collarTerrainOffset } from "../lib/terrainCheck.js"; // TASKS.csv #1620
import { voxelStretch, sortedShownValues } from "../lib/voxelStretch.js"; // TASKS.csv #1812 / #1781
import { VoxelRangeRow } from "./viewer/ViewerParts.jsx"; // TASKS.csv #1780
import { terrainFromBlockModel } from "../lib/terrainFromModel.js"; // TASKS.csv #1806
import { confirmReplaceTerrain, replacedTerrainNote } from "../lib/terrainReplace.js"; // TASKS.csv #2554
import { guessQualityColumn, filterSignalQuality, despikeAlongLines } from "../lib/surveyClean.js"; // TASKS.csv #1583 // TASKS.csv #786
import { mineGridOf, mineSourceOf, isMineSource, mineRowsToProject } from "../lib/mineGrid.js"; // TASKS.csv #2586; the mine-grid Source CRS: #2684
import { tieOf, fileToLocal, localToWorld } from "../lib/localGridTie.js"; // TASKS.csv #2587 — a tied local grid's way in; localToWorld: #2648
import { tieTerrainToLocal } from "../lib/terrainTie.js"; // TASKS.csv #2648
import { farFromCollars, farLabel } from "../lib/landingCheck.js"; // TASKS.csv #2590
import { collarCentreLonLat } from "../lib/projectCrs.js"; // TASKS.csv #2465
import { niceContourInterval, terrainRange, MIN_CONTOUR_INTERVAL } from "../lib/contourInterval.js"; // TASKS.csv #2462
import { vectorToBoundaryPolylines, boundaryCrsTransform, claimsFromVector, isAreaBoundary, fileStem, crsLabel } from "../lib/boundaryImport.js"; // crsLabel: #2467; // fileStem: #1767; // TASKS.csv #1035; claims per feature: #1970; isAreaBoundary: #1466
import { clampCellBudget, MIN_CELL_BUDGET, MAX_BLOCK_MODEL_BUDGET } from "../lib/estimationMeta.js"; // TASKS.csv #1074
import { checkGpkgSize } from "../lib/gpkgSize.js"; // TASKS.csv #1716
import { sniffTable, estimateRows, streamTableRows, streamXyzRows, headText } from "../lib/streamTable.js"; // TASKS.csv #1351
import { parseDfn, parseGdfText, streamGdfRows, gdfPair } from "../lib/asegGdf.js"; // TASKS.csv #1990 — ASEG-GDF2
import { useSetTaskProgress } from "../lib/store.jsx"; // TASKS.csv #1351
// TASKS.csv #1351 — a point-survey CSV over this size is streamed and thinned on the way in instead of read whole
const STREAM_FROM_BYTES = 150e6;
import { usePrompt } from "../components/usePrompt.jsx"; // TASKS.csv #1779
import LidarImportBox from "../components/LidarImportBox.jsx"; // TASKS.csv #1994
import { lidarResultToProject, CLASS_NAMES } from "../lib/lidar.js"; // TASKS.csv #1994 — small, and the box imports it anyway
import { fillNoData } from "../lib/demFill.js"; // TASKS.csv #1994
import { offersGradeTonnage } from "../lib/gradeTonnage.js"; // TASKS.csv #1592
import { collarsLookUnderground } from "../lib/pitShell.js"; // TASKS.csv #2263
import { collarBenches, pickBenchGround, surfaceMisfit, BENCH_DZ_M, BENCH_R_M } from "../lib/collarBenches.js"; // TASKS.csv #2589
import { projectTargetEpsg } from "../lib/projectTarget.js"; // TASKS.csv #2287 — no reprojection INTO the placeholder CRS
import { pointsAlongOneLine, surveyLabel } from "../lib/rasterMethod.js"; // TASKS.csv #2557; surveyLabel: #2559
const GradeTonnageModal = lazyModal(() => import("../components/GradeTonnageModal.jsx")); // TASKS.csv #1052 — loaded when opened

// TASKS.csv #309 — the format reference that USED to be this tab's entire empty state: a twelve-line
// centre-aligned block of ~10px grey prose that the design review flagged as reference material
// standing in for an invitation to act. The text is unchanged (it is accurate and hard-won — the
// "no public spec" notes in particular are the outcome of real investigation); only its placement
// moved, behind the InfoButton disclosure this module already uses eight times for exactly this job.
const FORMAT_REFERENCE = "CSV: x/y/z (or easting/northing/elevation, lon/lat) plus a value (mag, TMI, gravity, reading...); headers like Easting_X or Raw_Mag_nT are recognized, and anything unclear opens a column picker. "
  + "GeoTIFF: any georeferenced grid, orthophoto, or elevation/DEM — a filename with \"dem\"/\"srtm\"/\"elev\"/"
  + "\"terrain\"/\"topo\" in it is treated as elevation data, otherwise it's imported as a flat raster drape. "
  + ".gxf grids always import as a raster drape. .ply/.dxf import as a boundary polyline; .xyz opens a column "
  + "picker (Geosoft line/profile data, e.g. airborne survey exports). UBC mesh+model and block-model CSV "
  + "import (in the sidebar) render as coloured 3D blocks — Geosoft's binary voxel format stays "
  + "unsupported, there is no public spec to implement against.";

// TASKS.csv #25 — CSV point-cloud import (x, y, z, value[, label]) for raw geophysics survey data
// (mag, IP, gravity, radiometrics — whatever a field instrument or a processed grid export spits
// out as points). Deliberately its OWN small parser rather than routing through ViewerModule's
// ImportMappingModal/TARGET_SCHEMAS pipeline: every existing target schema in layers.js assumes a
// hole_id + depth (interval or hole-relative point) row, since everything else in the app desurveys
// against a drillhole trace. Geophysics points are raw world coordinates with no hole to desurvey
// against, so they need a different (much simpler) shape — just world x/y/z plus a scalar value —
// and get rendered directly by ViewerModule's geometry-rebuild effect as their own "point3d" layer
// kind (see LAYER_META.geophys_pts in layers.js), co-visualized in the same 3D scene as drillholes
// per the user's request rather than a separate scene here.
// TASKS.csv #365 — a blank or missing z is kept as null ("elevation not recorded"), never 0 or an invented
// elevation: ground mag files usually have no elevation column, and the inversion's "sensor at a fixed
// height above terrain" mode is exactly how such data must be used.
// TASKS.csv #484 — which column is which is decided per file by src/lib/geophysColumns.js (words in the
// headers, e.g. Easting_X / Raw_Mag_nT), with the column picker as the fallback.

// TASKS.csv #749 — embedded: shown inside the Maps tab for one of its map panes (terrain, map layers, web layers,
// boundaries, claims): no ribbon of its own (the Maps tab's ribbon picks the pane) and no main area.
export default function GeophysicsModule({ embedded = false, forcePane = null, onMain3d = null } = {}) {
  const [resultSlot, setResultSlot] = useState(null); // #1199
  // TASKS.csv #1979 — Matt: "can we also have the view in the geophysics module?" The main area shows the 3D View's own viewport
  // (App lays it beside this sidebar: the one scene, no second renderer) unless a pane has put results there (an inversion's
  // or a DC/IP line's section), or the project has nothing to draw yet (the empty-state card then)
  const [hasResults, setHasResults] = useState(false);
  useEffect(() => {
    if (!resultSlot) return undefined;
    const check = () => setHasResults(resultSlot.childElementCount > 0);
    check();
    const mo = new MutationObserver(check);
    mo.observe(resultSlot, { childList: true });
    return () => mo.disconnect();
  }, [resultSlot]);
  const [geoPaneState, setGeoPane] = useState("points"); // TASKS.csv #458 — the sidebar shows the tool picked on the ribbon
  const geoPane = forcePane || geoPaneState; // #749 — the Maps tab chooses the pane
  const geoBtn = (id) => ({ active: geoPane === id, onClick: () => setGeoPane(id) });
  const [mtDrop, setMtDrop] = useState(null); // TASKS.csv #1989 — .edi files dropped on the tab, for the MT pane
  const [fdemDrop, setFdemDrop] = useState(null); // TASKS.csv #1986 — Aarhus Workbench .xyz exports dropped on the tab, for the FDEM pane
  const [eqsFor, setEqsFor] = useState(null); // TASKS.csv #1985 — the survey whose equivalent-source box is open
  const [gravFor, setGravFor] = useState(null); // TASKS.csv #1985 — the survey whose gravity-reduction box is open
  const {
    layers, replaceLayer, goToModule, collars, rasters, addRaster, updateRaster /* #1764 */, project, surfaceSamples, // #845 — the terrain picker over a samples-only project
    terrain, addTerrain, updateTerrain, removeTerrain,
    geophysPtsStops, setGeophysPtsStops, geophysPtsColorMode, setGeophysPtsColorMode,
    geophysPtsMin, setGeophysPtsMin, geophysPtsMax, setGeophysPtsMax,
    voxelModels, addVoxelModel, updateVoxelModel, removeVoxelModel, dcipLines, // dcipLines: #1176
    voxelCellBudget, setVoxelCellBudget,
    survey, desurveyMethod, setCustomLayers, // TASKS.csv #323 — evaluate a model onto the drillholes
    geophysSurveys, updateGeophysSurvey, setLayers, // TASKS.csv #451
    boundaries, addBoundary, updateBoundary, removeBoundary,
    omfObjects, addOmfObject, updateOmfObject, removeOmfObject,
    projectIsEmpty, setEpsg, // TASKS.csv #607
    addMapLayer, // TASKS.csv #544 — WFS polygons/lines with their attributes
    mapLayers, // TASKS.csv #815 — the fetch area of a project without drillholes
    assays, assayElements, customLayers, // TASKS.csv #1425 — the downhole logs pane
  } = useStore();
  // TASKS.csv #323 — a block model's value along each hole, as a downhole layer ("On holes: <model>"). Numeric
  // models show as a bar track in the strip log beside the logs; discrete ones (a GemPy unit block) as units.
  // TASKS.csv #328 — the export package (module loaded on first use: it brings the GeoTIFF writer)
  const exportModelPackage = async (model) => {
    const epsg = await ensureExportCrs(project); if (!epsg) return; // #1021
    const { buildModelExportZip } = await import("../lib/modelExport.js");
    const r = await buildModelExportZip(bmWithSet ? withSetColumns(model, voxelModels) : model, epsg); // #3014 part c — the OMF carries the set's arrays
    if (r.error) { setVoxelError({ text: tr("Could not export \"{name}\": {error}", { name: model.name, error: r.error }) }); return; }
    const res = await saveFile({ quiet: "success", suggestedName: `${r.base}_export.zip`, filters: [{ name: "Zip", extensions: ["zip"] }], content: r.zip /* #1040 bytes */ });
    if (res?.ok) setVoxelError({ info: true, text: tr("Exported \"{name}\": {files} files ({n} depth slices).{v}", { name: model.name, files: r.files.length, n: r.files.filter((f) => f.endsWith(".tif")).length, v: r.warnings.length ? " " + r.warnings.join(" ") : "" }) });
  };
  // TASKS.csv #2248 (review #2174) — 'Evaluate onto the drillholes' showed nothing while it ran (31 s under load on a 36,267-cell
  // estimate and 245 holes; 0.6 s for 36,000 cells and 245 surveyed holes here): a busy line first, the time it took after, and no second
  // run while one is going
  const evaluatingRef = useRef(false);
  const evaluateOnHoles = async (model) => {
    if (evaluatingRef.current) return;
    // TASKS.csv #1791 (review #1646, Kodiak) — with no collars no hole can be placed: 'No drillhole passes through' read as if holes had missed it
    if (!(collars || []).some((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y) && Number.isFinite(c?.z))) { setVoxelError({ text: tr("No drillholes can be placed: the project has no collar coordinates. Import the collars to evaluate \"{name}\" along the holes.", { name: model.name }) }); return; }
    evaluatingRef.current = true;
    const nHoles = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y) && Number.isFinite(c?.z)).length;
    setVoxelError({ info: true, text: tr("Evaluating \"{name}\" ({cells} cells) along {holes} hole(s)…", { name: model.name, cells: (model.cells?.length || 0).toLocaleString(), holes: nHoles.toLocaleString() }) });
    await new Promise((r) => setTimeout(r, 30)); // let the line paint before the work holds the window
    const t0 = performance.now();
    let rows, holes;
    try { ({ rows, holes } = sampleModelOnHoles({ model, collars, survey, desurveyMethod })); } finally { evaluatingRef.current = false; }
    const secs = (performance.now() - t0) / 1000;
    if (!rows.length) { setVoxelError({ text: tr("No drillhole passes through \"{name}\".", { name: model.name }) }); return; }
    const discrete = model.colorMode === "discrete";
    const labelOf = (v) => (model.valueLabels && model.valueLabels[v]) || v;
    const out = rows.map((r) => ({ ...r, value: discrete ? labelOf(r.value) : r.value, modelled: true, ...(discrete ? {} : { numeric: true }), modelColor: colorForVoxelValue(model, r.value) }));
    const id = `custom_${Date.now()}`;
    setCustomLayers((p) => [...p, { id, name: `On holes: ${model.name}`, rows: out, sourceModel: model.id, unit: model.property || model.unitLabel || null }]);
    setVoxelError({ info: true, text: tr("Added \"On holes: {name}\" — the model's value in {rows} cell crossing(s) along {holes} hole(s). Open a hole's strip log to compare it with the logs, or Downhole logs for a cross-plot against one.", { name: model.name, rows: rows.length.toLocaleString(), holes }) + " " + tr("({s} s)", { s: secs < 10 ? secs.toFixed(1) : Math.round(secs) }) });
  };
  // User question after the MAX_CELLS coarsening budget was lowered (perf investigation done in this
  // sandbox, which has no real GPU — see voxel.js's MAX_CELLS comment): "do you think we can increase
  // the 100,000 3d budget? Is it gonna make GeoStrix crash?" Rather than hand-picking a new number for
  // everyone based on this sandbox's own software-rendered measurements (which may not reflect Matt's
  // actual hardware at all), this is now an adjustable per-session setting — see the "3D view cell
  // budget" control near the UBC/OMF import buttons below — defaulting to voxel.js's own MAX_CELLS.
  const effectiveMaxCells = clampCellBudget(voxelCellBudget) || MAX_CELLS; // clamped on use too: #1074
  const [error, setError] = useState(null);
  const [rasterError, setRasterError] = useState(null);
  const [terrainError, setTerrainError] = useState(null);
  const [terrainBusy, setTerrainBusy] = useState(false);
  const [demSourceEpsg, setDemSourceEpsg] = useState(""); // TASKS.csv #419 — DEM source CRS override
  const [demCrop, setDemCrop] = useState(true); // TASKS.csv #422 — crop DEM imports to the drillholes
  const [demCropBuffer, setDemCropBuffer] = useState("2000");
  const [srtmProgress, setSrtmProgress] = useState(null); // { done, total } | null
  // TASKS.csv #796 — nodes on the terrain's long side for the next fetch / import; a per-computer preference
  // (localStorage), Standard by default so a modest laptop never gets a big grid it did not ask for
  const [terrainDetail, setTerrainDetailState] = useState(() => { try { return Number(localStorage.getItem("geostrix.terrainDetail")) || 200; } catch { return 200; } });
  const setTerrainDetail = (v) => { setTerrainDetailState(v); try { localStorage.setItem("geostrix.terrainDetail", String(v)); } catch { /* private window */ } };
  // TASKS.csv #979 — the block-model CSV's column names, a per-computer preference like the one above
  const [bmNames, setBmNamesState] = useState(() => { try { return localStorage.getItem("geostrix.blockCsvNames") === "micromine" ? "micromine" : "datamine"; } catch { return "datamine"; } });
  const setBmNames = (v) => { setBmNamesState(v); try { localStorage.setItem("geostrix.blockCsvNames", v); } catch { /* private window */ } };
  // TASKS.csv #1061 — where the provenance notes go: "auto" (beside for Micromine names), "inline" (# lines) or "beside" (.zip)
  const [bmStamp, setBmStampState] = useState(() => { try { return localStorage.getItem("geostrix.blockCsvStamp") || "auto"; } catch { return "auto"; } });
  const setBmStamp = (v) => { setBmStampState(v); try { localStorage.setItem("geostrix.blockCsvStamp", v); } catch { /* private window */ } };
  // TASKS.csv #3014 part c — exports of a set member carry the set's other elements as columns (CSV) / arrays (VTK, OMF); off by default, so a CSV keeps its shape
  const [bmWithSet, setBmWithSetState] = useState(() => { try { return localStorage.getItem("geostrix.blockExportWithSet") === "1"; } catch { return false; } });
  const setBmWithSet = (v) => { setBmWithSetState(v); try { localStorage.setItem("geostrix.blockExportWithSet", v ? "1" : "0"); } catch { /* private window */ } };
  // TASKS.csv #814 — which online elevation model the terrain fetch reads (a per-computer preference, like the detail)
  const [terrainSource, setTerrainSourceState] = useState(() => { try { return localStorage.getItem("geostrix.terrainSource") || "aws"; } catch { return "aws"; } });
  const setTerrainSource = (v) => { setTerrainSourceState(v); try { localStorage.setItem("geostrix.terrainSource", v); } catch { /* private window */ } };
  const [srtmPickerOpen, setSrtmPickerOpen] = useState(false);
  const [srtmSeedBbox, setSrtmSeedBbox] = useState(null); // [lonMin, latMin, lonMax, latMax] | null
  const [srtmSeedLonLat, setSrtmSeedLonLat] = useState(null); // { lon, lat } | null — TASKS.csv #200 "Locate" button
  const [srtmAreaOptions, setSrtmAreaOptions] = useState(null); // [{id, label, bboxLonLat}] | null — TASKS.csv #200
  const [webLayerModalOpen, setWebLayerModalOpen] = useState(false);
  const [macrostratOpen, setMacrostratOpen] = useState(false); // TASKS.csv #2005
  const [webLayerDefaultBbox, setWebLayerDefaultBbox] = useState(null); // [lonMin,latMin,lonMax,latMax] | null — TASKS.csv #127
  const [voxelError, setVoxelError] = useState(null);
  const [bmPending, setBmPending] = useState(null); // TASKS.csv #410 — a parsed block-model CSV awaiting column confirmation
  const [voxelBusy, setVoxelBusy] = useState(false);
  const [voxelProgress, setVoxelProgress] = useState(null);
  const [boundaryError, setBoundaryError] = useState(null);
  const [claimMsg, setClaimMsg] = useState(null); // TASKS.csv #1970 — the Claims pane's own import message (it showed only under Boundaries)
  const [boundarySource, setBoundarySource] = useState(""); // TASKS.csv #2684 — the Boundaries / Claims panes' Source CRS: "" (the file's own), an EPSG code or "mine"
  const [omfError, setOmfError] = useState(null);
  const [omfBusy, setOmfBusy] = useState(false);
  const [omfChoices, setOmfChoices] = useState(null); // TASKS.csv #1970 — { file, choices: [{ volume, shown, attributes }] }
  const [omfPick, setOmfPick] = useState({});
  const omfInput = useRef(null);
  const [idwOpen, setIdwOpen] = useState(false); // TASKS.csv #235 — grid geophys_pts to a raster (IDW)
  const [idwCellText, setIdwCellText] = useState(""); // TASKS.csv #2562 — blank: from the station spacing (idwCellSize below)
  const [idwPower, setIdwPower] = useState(2);
  const [idwStretch, setIdwStretch] = useState("p2-98"); // TASKS.csv #372
  const [idwSurvey, setIdwSurvey] = useState(""); // TASKS.csv #538 — one survey at a time ("" = the only / first one)
  const [idwBlank, setIdwBlank] = useState(""); // #538 — blanking distance (m); "" = the suggested default
  const [idwMethod, setIdwMethod] = useState("idw"); // TASKS.csv #2846 — or "mincurv", "spline" (lib/surveyGrid.js)
  const [idwTension, setIdwTension] = useState(0.25); // #2846 — GMT's suggestion for potential fields
  const [idwBusy, setIdwBusy] = useState(null); // #2846
  const idwCancel = useRef(null); // #2846 — stops the minimum-curvature worker
  const [hillshadeOpen, setHillshadeOpen] = useState(false); // TASKS.csv #237 — terrain hillshade
  // TASKS.csv #237 sub-item (2) — terrain contours. 50 m default interval: a sensible starting point
  // for the mountainous BC terrain this app's users actually work in, and coarse enough that a first
  // click on a large DEM returns quickly rather than appearing to hang.
  const [contourOpen, setContourOpen] = useState(false);
  const [contourMsg, setContourMsg] = useState(null); // TASKS.csv #1759 — shown in the Terrain pane, not the Point survey pane's box
  const [contourInterval, setContourInterval] = useState(50);
  const [contourTyped, setContourTyped] = useState(false); // TASKS.csv #2462 — a typed interval is kept; else the form opens on the terrain's own step
  const [contourClamped, setContourClamped] = useState(null); // #2462 — what was typed when it was raised to the smallest interval
  const [contourColor, setContourColor] = useState("#8a6a45");
  const [hillshadeAzimuth, setHillshadeAzimuth] = useState(315);
  const [hillshadeAltitude, setHillshadeAltitude] = useState(45);
  const [derivKind, setDerivKind] = useState("hillshade"); // TASKS.csv #797
  const [xyzError, setXyzError] = useState(null);
  const [xyzPending, setXyzPending] = useState(null); // { fileName, columns, rows, xCol, yCol, zCol, valueCol, labelCol } | null
  const [dragOver, setDragOver] = useState(false);
  // TASKS.csv #120 — optional source EPSG for x/y/z point-cloud imports below (plain CSV + .xyz),
  // same "reproject at import" approach used for collars (ImportMappingModal) and DEM rasters
  // (parseDEMFiles). Shared by both importers since a geologist bringing in mixed-CRS geophysics
  // files one after another would otherwise need to re-type the code for every file.
  const [geophysSourceEpsg, setGeophysSourceEpsg] = useState(() => keptGeophysSourceEpsg); // TASKS.csv #2871 — kept across a remount
  const [spatialOpen, setSpatialOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();
  const fileInput = useRef(null);
  useModuleAction(["import-points"], () => fileInput.current?.click()); // TASKS.csv #565 — File > Import CSV here
  // TASKS.csv #1417 (review #1352) — a 3D View block-model row's palette link opened the Point survey pane: it now opens Block
  // models and brings that model's card into view (and outlines it briefly)
  useModuleAction(["edit-block-model"], (_a, p) => {
    setGeoPane("voxel");
    // TASKS.csv #1593 (review #1497, Lawyers) — 'Edit legend / classify / palette' landed on the cards with no legend open: the card opens
    // its legend editor (a card that mounts after this, on the pane switch, reads the request when it mounts)
    if (p?.id != null) { pendingLegend = { id: String(p.id), at: Date.now() }; window.dispatchEvent(new CustomEvent(OPEN_LEGEND_EVENT, { detail: { id: String(p.id) } })); }
    setTimeout(() => {
      const el = p?.id ? [...document.querySelectorAll(`[data-voxel-id="${CSS.escape(String(p.id))}"]`)].find((e) => e.offsetParent) : null; // the visible copy (the Maps tab can embed this module too)
      if (!el) return;
      el.scrollIntoView({ block: "start", behavior: "smooth" });
      el.style.outline = "2px solid var(--color-accent)";
      setTimeout(() => { el.style.outline = ""; }, 1800);
    }, 120);
  });
  const terrainInput = useRef(null);
  const ubcInput = useRef(null);
  const blockModelInput = useRef(null);
  const sgridInput = useRef(null); // TASKS.csv #2726 — a GOCAD SGrid with its side files
  const boundaryInput = useRef(null);
  const claimInput = useRef(null);
  const xyzInput = useRef(null);
  const gridGpsInput = useRef(null); // #1326
  const batchBaseInput = useRef(null); // #1585 — base-station files for a multi-file walk-mag import
  const rows = layers.geophys_pts || [];
  const drawnRange = useMemo(() => robustRange(rows.map((r) => r.value)), [rows]); // TASKS.csv #1177 — the range the 3D colours use
  const surveyList = useMemo(() => surveyStats(rows), [rows]); // TASKS.csv #451
  // TASKS.csv #1587 (review #1497, Lawyers) — with several surveys the legend below edits ONE survey's own legend
  // (geophysSurveys[key].legend, read by makeSurveyColorer); the global stops / mode / range were ignored in 3D then, and the
  // classes were cut across nT and % values together.
  const [legendSurvey, setLegendSurvey] = useState("");
  const manySurveys = surveyList.length > 1;
  const legendKey = surveyList.some((s) => s.key === legendSurvey) ? legendSurvey : surveyList[0]?.key || "";
  const legendRows = useMemo(() => (manySurveys ? rows.filter((r) => surveyKey(r) === legendKey) : rows), [manySurveys, rows, legendKey]);
  const legendDrawn = useMemo(() => robustRange(legendRows.map((r) => r.value)), [legendRows]);
  const legendRange = useMemo(() => { let a = null, b = null; for (const r of legendRows) { const v = r.value; if (typeof v !== "number" || isNaN(v)) continue; if (a === null || v < a) a = v; if (b === null || v > b) b = v; } return { min: a, max: b }; }, [legendRows]);
  const legendMeta = (manySurveys && geophysSurveys[legendKey]?.legend) || null;
  // TASKS.csv #1787 — the point-survey legend's edits, routed to the survey's own legend (#1587) or the one flat layer's store fields
  const ptsLegendUpdate = (_id, patch) => {
    if (manySurveys) { updateGeophysSurvey(legendKey, { legend: { ...(geophysSurveys[legendKey]?.legend || {}), ...patch } }); return; } // #1587
    if ("min" in patch) setGeophysPtsMin(patch.min);
    if ("max" in patch) setGeophysPtsMax(patch.max);
    if ("colorMode" in patch) setGeophysPtsColorMode(patch.colorMode);
    if ("stops" in patch) setGeophysPtsStops(patch.stops);
  };
  // TASKS.csv #1094 — one survey's points as CSV (x, y, z, the value as "<method>_<unit>", line / fiducial / label), stamped
  const exportSurvey = (key) => {
    const meta = geophysSurveys[key] || {}, pts = rows.filter((r) => surveyKey(r) === key);
    const { rows: out, valueName } = surveyExportRows(pts, meta);
    const stamp = stampLines({ tool: "Geophysics survey points", version: APP_VERSION, epsg: stampEpsg(project) /* #2195 */, params: [
      `Survey: ${key} | ${pts.length} point(s) | method: ${meta.method ? SURVEY_METHODS[meta.method]?.label || meta.method : "not set"} | units: ${meta.units || "not set"}`,
      `${valueName}: the value as stored in GeoStrix (after any diurnal correction or levelling applied at import) | z: ${Z_MEANINGS[meta.zMeaning] || "as imported"}${pts.some((r) => Number.isFinite(r.zAgl)) ? " | height_agl: the radar-altimeter height the elevation was computed from" : ""}`,
    ] });
    saveFile({ suggestedName: `${String(key).replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_")}_points.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: withStamp(toExportCsv(out), stamp) });
  };
  // TASKS.csv #538 — gridding used EVERY imported survey at once (a mag survey in nT blended with a gravity or
  // radiometric one) and filled the whole bounding box. Now one survey, blanked beyond a distance from the data.
  const idwKey = surveyList.some((s) => s.key === idwSurvey) ? idwSurvey : surveyList[0]?.key || "";
  const idwRows = useMemo(() => (idwOpen ? rows.filter((r) => surveyKey(r) === idwKey) : []), [idwOpen, rows, idwKey]);
  // TASKS.csv #1783 (review #1646, Kodiak) — a 3D point cloud (an inversion model imported as points) is gridded one depth slice at a time
  const idwShape = useMemo(() => (idwRows.length ? cloudShape(idwRows) : null), [idwRows]);
  const [idwZ, setIdwZ] = useState({ lo: "", hi: "" });
  const idwSlice = useMemo(() => {
    if (!idwShape?.is3D) return idwRows;
    const lo = idwZ.lo === "" ? -Infinity : Number(idwZ.lo), hi = idwZ.hi === "" ? Infinity : Number(idwZ.hi);
    return idwRows.filter((r) => Number.isFinite(r.z) && r.z >= lo && r.z <= hi);
  }, [idwRows, idwShape, idwZ]);
  const idwSuggest = useMemo(() => (idwSlice.length ? suggestBlankingDistance(idwSlice) : null), [idwSlice]); // the slice's own spacing (#1783)
  const idwAutoCell = suggestIdwCell(idwSuggest?.spacing) || 25; // #2562 — a quarter to a half of the spacing
  const idwCellSize = idwCellText === "" ? idwAutoCell : Math.max(0.1, Number(idwCellText) || idwAutoCell);
  // #451 — radar-altimeter heights -> elevations on the loaded terrain
  const convertAgl = (key) => {
    if (!terrain) return;
    const { rows: out, done, outside } = aglToElevation(layers.geophys_pts || [], key, (x, y) => terrainElevationAt(terrain, x, y));
    setLayers((l) => ({ ...l, geophys_pts: out }));
    setError({ info: true, text: tr("\"{key}\": {done} point(s) now at terrain + their height above ground{v}. The original heights are kept on each point.", { key, done: done.toLocaleString(), v: outside ? tr("; {outside} outside the terrain have no elevation (not drawn)", { outside }) : "" }) });
  };

  const importFile = async (file) => {
    if (!file) return;
    setError(null);
    { const refusal = await textTableRefusal(file); if (refusal) { setError(refusal); return; } } // #2847 — a .gdb or any binary file
    // TASKS.csv #481 — check the header BEFORE parsing: a 320 MB ZTEM inversion mesh CSV (7.2 M cells with
    // I, J, K and centroid columns) was read whole as "survey points" and froze the app.
    const head = await file.slice(0, 64 * 1024).text().catch(() => "");
    const firstLine = (head.split(/\r?\n/)[0] || "").toLowerCase();
    const cols = firstLine.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const blocky = (cols.includes("i") && cols.includes("j") && cols.includes("k")) || /centroid|xinc|yinc|zinc|\bdx\b|block/.test(firstLine);
    if (blocky) {
      setError(tr("\"{name}\" looks like a BLOCK MODEL (cell indices / cell-centre columns{v}), not a point survey. Import it under Geophysics → Block models: the UBC mesh + model files (.msh + .mod) or OMF if you have them (streamed and reduced to fit the 3D view), or \"Block model CSV\" for smaller files.", { name: file.name, v: file.size > 50e6 ? tr(", {v} MB", { v: (file.size / 1e6).toFixed(0) }) : "" }));
      return;
    }
    if (file.size > STREAM_FROM_BYTES) { await openStreamedCsv(file, head); return; } // #1351 — was refused above 150 MB
    parseTableFile(file).then((t) => { // TASKS.csv #444 — shared reader: comma decimals + encoding fallback
        const res = { data: t.rows, meta: { fields: t.headers }, note: t.note };
        // TASKS.csv #484 — columns are matched on the words in each header (Easting_X, Raw_Mag_nT...), once per
        // file. Not sure which is which -> the column picker below (shared with .xyz), never a dead end.
        const cols = guessGeophysColumns(res.meta.fields || []);
        const openPicker = (why, extra = {}) => {
          setXyzPending({ headerEpsg: geosoftHeaderEpsg(head) /* #2832 */, ...extra, fileName: file.name, columns: res.meta.fields || [], rows: res.data, source: "csv", xCol: cols.x, yCol: cols.y, zCol: cols.z, valueCol: cols.value, lineCol: cols.line, fidCol: cols.fid, labelCol: cols.label, ...cleaningDefaults(res.meta.fields || []) /* #1583 */ });
          setError({ info: true, text: tr("{why} Pick the columns below, then Import.", { why }) });
        };
        if (!cols.ok) {
          const missing = [!cols.x && "X / easting", !cols.y && "Y / northing", !cols.value && "the measured value"].filter(Boolean).join(", ");
          openPicker(tr("\"{name}\": couldn't tell which column is {missing} from the headers ({fields}).", { name: file.name, missing, fields: (res.meta.fields || []).join(", ") || tr("none") }));
          return;
        }
        // TASKS.csv #2395 — several radiometric channels (TC, K, eU, eTh): the picker, each ticked channel its own survey
        if (isMultiRadiometric(cols.valueCandidates)) {
          const ch = radiometricChannels(cols.valueCandidates);
          openPicker(tr("\"{name}\" holds {n} radiometric channels ({list}): tick the ones to import, each as its own survey.", { name: file.name, n: ch.length, list: ch.map((c) => c.col).join(", ") }), { channels: ch.map((c) => c.col), channelPick: ch.map((c) => c.col), channelRatios: ratioJobs(ch).length > 0 });
          return;
        }
        // TASKS.csv #2081 — several kinds of measurement (MX beside RHO): the picker, each ticked column its own survey
        { const more = otherMeasurementColumns(res.meta.fields || [], res.data, cols); if (more.length) { const ch = [cols.value, ...more]; openPicker(tr("\"{name}\" holds several measurements ({list}): tick the ones to import, each as its own survey.", { name: file.name, list: ch.join(", ") }), { channels: ch, channelPick: ch, channelRatios: false }); return; } }
        const parsed = rowsToGeophysPoints(res.data, cols);
        const bad = parsed.filter((r) => !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.value));
        let good = parsed.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.value)).map((r) => ({ ...r, _src: file.name }));
        const noZ = good.filter((r) => r.z == null).length; // #365
        if (!good.length) {
          openPicker(tr("\"{name}\": none of its {n} row(s) had numbers in {x} / {y} / {value}.", { name: file.name, n: res.data.length.toLocaleString(), x: cols.x, y: cols.y, value: cols.value }));
          return;
        }
        // Longitude/latitude columns and no Source CRS typed: they can only be WGS84.
        const mineSrc = isMineSource(geophysSourceEpsg); // #2684 — 'Local mine grid' as the Source CRS
        // TASKS.csv #2832 — no Source CRS set: the file's Geosoft header ('/ Projection:"WGS 84"', '/ Unit:dega'), else X / Y that can only be
        // degrees in a projected project (Blake River's columns are called X and Y): never metres in a 1.3 m pillar
        const hdrEpsg = !mineSrc && !geophysSourceEpsg && !cols.geographic ? geosoftHeaderEpsg(head) : null;
        const projected = project?.crsSet !== false && !!project?.epsg && !isGeographicCrs(project.epsg);
        const asDegrees = !mineSrc && !geophysSourceEpsg && !cols.geographic && !hdrEpsg && projected && xyLookLikeDegrees(res.data, cols.x, cols.y);
        const srcEpsg = mineSrc ? "" : geophysSourceEpsg || (cols.geographic ? "4326" : "") || (hdrEpsg ? String(hdrEpsg) : "") || (asDegrees ? "4326" : "");
        let reprojectNote = hdrEpsg ? " " + tr("Its header names {crs} (EPSG:{epsg}), so its X / Y were read in it.", { crs: crsName(hdrEpsg) || `EPSG:${hdrEpsg}`, epsg: hdrEpsg })
          : asDegrees ? " " + tr("Every X is within ±180 and every Y within ±90, so they were read as WGS 84 longitude / latitude; set the Source CRS if they are in another datum.") : "";
        if (mineSrc) { const m = mineRowsToProject(good, project); good = m.rows; reprojectNote = m.note; }
        else if (srcEpsg && project?.epsg && Number(srcEpsg) !== Number(project.epsg)) {
          let failed = 0;
          good = good.map((r) => {
            const p = reprojectXY(r.x, r.y, srcEpsg, project.epsg);
            if (!p) { failed++; return r; }
            return { ...r, x: p.x, y: p.y };
          });
          reprojectNote += failed // += : #2832 keeps the header / degrees sentence before it
            ? tr(" Couldn't resolve a proj4 definition for EPSG:{srcEpsg} or EPSG:{epsg} — no reprojection happened.", { srcEpsg, epsg: project.epsg })
            : tr(" Reprojected from EPSG:{srcEpsg}{v} to the project's EPSG:{epsg}.", { srcEpsg, v: !geophysSourceEpsg && cols.geographic ? tr(" (longitude/latitude columns)") : "", epsg: project.epsg });
        }
        const replacedN = replaceSurveyPoints(rows, good).replaced; // #600 — for the notice; the update below does the same
        setLayers((l) => ({ ...l, geophys_pts: replaceSurveyPoints(l.geophys_pts, good).rows }));
        { const g = guessSurveyMethodFrom(cols.value, good.map((r) => r.label)); if (g && !geophysSurveys[file.name]?.method) updateGeophysSurvey(file.name, { method: g, units: SURVEY_METHODS[g].units }); } // #1151 — from the value column's name
        if (replacedN) reprojectNote += tr(" Replaced the {replacedN} point(s) of the earlier import of this file.", { replacedN: replacedN.toLocaleString() });
        const zNote = noZ ? tr(" {noZ} point(s) have no elevation: they are kept for modelling with \"sensor at a fixed height above terrain\", and are not drawn in 3D.", { noZ }) : ""; // #365
        const readNote = res.note ? ` ${res.note.trim()}` : ""; // #444 — comma decimals / encoding, said out loud
        // TASKS.csv #1709 (review #1645, Copley) — 2,619 downhole susceptibility readings imported as a surface survey without a word
        const dh = downholeLikeness(good, collars, terrain ? (x, y) => terrainElevationAt(terrain, x, y) : null);
        const dhNote = dh?.isDownhole ? tr(" These look like downhole readings, not survey stations: {pct}% of the points sit more than 10 m below the {ground} (typically {med} m, up to {max} m). A point survey is read as the ground surface: gridding flattens every depth into one cell, and the inversion would take them as stations. Import such a log with the drillholes instead, and use the inversion's drillhole-constraint option; the survey is labelled \"downhole readings\" so the tools can say so.", { pct: Math.round(100 * dh.share), ground: terrain ? tr("terrain") : tr("nearest collar"), med: Math.round(dh.medianDropM), max: Math.round(dh.maxDropM) }) : "";
        if (dh?.isDownhole && !geophysSurveys[file.name]?.method) updateGeophysSurvey(file.name, { method: "magsus_downhole", units: SURVEY_METHODS.magsus_downhole.units });
        const others = cols.valueCandidates.filter((c) => c !== cols.value);
        const colNote = tr(" Columns: X = {x}, Y = {y}, Z = {v}, value = {value}{v2}.", { x: cols.x, y: cols.y, v: cols.z || "(none)", value: cols.value, v2: others.length ? tr(" (also looked like measurements: {others} — import again and pick one to use it instead)", { others: others.join(", ") }) : "" });
        setError({ info: true, text: tr("Imported {good} point(s) from \"{name}\"{v}.{colNote}{zNote}{reprojectNote}{readNote}{dhNote}", { dhNote, good: good.length.toLocaleString(), name: file.name, v: bad.length ? tr("; skipped {bad} row(s) missing x/y or a value", { bad: bad.length }) : "", colNote, zNote, reprojectNote, readNote }) });
    }).catch((err) => setError(tr("Could not parse {name}: {message}", { name: file.name, message: err.message })));
  };

  // Default drape elevation: average collar elevation if holes are loaded (drapes usually make most
  // sense roughly at surface/collar level), otherwise 0 — either way it's just a starting point, the
  // per-raster elevation slider below moves it.
  const drapeAt = useMemo(() => defaultDrapeElevation({ collars, voxelModels, surfaceSamples }), [collars, voxelModels, surfaceSamples]); // #2075 — and where it came from
  const defaultElevation = drapeAt.z; // #1856
  // TASKS.csv #2294 — boundaries and claims are surface features: on a project drilled from underground the highest collar (the #2269 rule), not
  // the collar median, a mine level half-way down the fans
  const boundaryElevation = useMemo(() => planElevation({ collars, survey, voxelModels, surfaceSamples }).z, [collars, survey, voxelModels, surfaceSamples]);

  // TASKS.csv — raster import UI itself moved to its own Raster module (user request); this stays
  // here ONLY so a .tif/.gxf dropped directly on the Geophysics tab (see onDrop below) still imports
  // exactly like before instead of forcing a tab-switch mid-drag. Uses the same buildRasterImport()
  // helper (raster.js) the Raster module's own import button calls — one shared parse/message path.
  const importRaster = async (file) => {
    if (!file) return;
    setRasterError({ info: true, text: tr("Importing {name}…", { name: file.name }) }); // a large GeoTIFF takes a few seconds
    try {
      const { raster, msg } = await buildRasterImport(file, { epsg: projectTargetEpsg(project), defaultElevation, chooseProjectEpsg: projectEpsgChooser({ isEmpty: projectIsEmpty, setEpsg, fileName: file.name }), tie: tieOf(project) }); // #607; tie: #2587
      const drape = rasterDrapeElevation({ collars, voxelModels, surfaceSamples, bbox: raster.bbox, rasters, fileName: file.name, stations: layers?.geophys_pts /* #2868 */ }); // #1856; #1505
      addRaster({ ...raster, elevation: drape.z });
      setRasterError({ info: true, text: tr("{msg} (Tip: raster imports now have their own \"Raster\" tab — this drop still works here too.)", { msg: `${msg} ${drapeElevationNote(drape)}` }) });
    } catch (err) {
      setRasterError({ info: false, text: err.message });
    }
  };

  // TASKS.csv #77 — SRTM/DEM import (GeoTIFF only, see raster.js's readDemTile comment on why .hgt
  // isn't supported). Replaces any existing terrain — the store only holds one at a time (see
  // store.jsx's note on why a list wasn't worth the extra UI for a first pass) — but accepts MULTIPLE
  // files in one go and mosaics them into that one terrain surface (bug fix + feature, user report:
  // two adjacent SRTM tiles wouldn't display and the user wanted them combined into one DEM — see
  // raster.js parseDEMFiles's header comment for the full story). Also now reprojects a geographic
  // (lon/lat) source into the project's own EPSG automatically when it can — that's the actual fix for
  // "imported but won't display": an un-reprojected lon/lat DEM was landing at coordinates numerically
  // unrelated to (and roughly 500,000 units away from) the rest of a UTM-metres project.
  const importTerrain = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    setTerrainError(null);
    setTerrainBusy(true);
    try {
      // TASKS.csv #422 — crop to the drillholes (+ buffer) unless the user wants the whole tile.
      const cc = (collars || []).filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));
      const cropTo = demCrop && cc.length ? (() => { const xs = cc.map((c) => c.x), ys = cc.map((c) => c.y); const b = Math.max(1000, Number(demCropBuffer) || 2000); return [arrMin(xs) - b, arrMin(ys) - b, arrMax(xs) + b, arrMax(ys) + b]; })() : null;
      const tie = tieOf(project); // TASKS.csv #2648 — a tied local grid: the DEM comes into the grid through the tie
      const parsed = await parseDEMFiles(files, tie ? null : project?.epsg, demSourceEpsg.trim() || null, { cropTo, gridMax: terrainDetail, tie, mineSource: mineSourceOf(project) /* #2684 */, chooseProjectEpsg: projectEpsgChooser({ isEmpty: projectIsEmpty, setEpsg, fileName: files[0]?.name || "the DEM" }) }); // override: #419; chooser: #607
      const [xmin, ymin, xmax, ymax] = parsed.bbox;
      if (terrain && !window.confirm(tr("Replace the current terrain (\"{name}\") with \"{name2}\"? Only one terrain surface is supported at a time.", { name: terrain.name, name2: parsed.name }))) {
        setTerrainBusy(false);
        return;
      }
      addTerrain({ name: parsed.name, bbox: parsed.bbox, gridW: parsed.gridW, gridH: parsed.gridH, elevations: parsed.elevations, noDataMask: parsed.noDataMask || null }); // noDataMask: #421
      const metric = isMetricProjectedEpsg(project?.epsg); // #2127 — metres on a metric project
      let msg = metric ? tr("Imported \"{name}\" as a {gridW}×{gridH} terrain mesh (source {srcWidth}×{srcHeight}px, {v} × {v2} m){v3}.", { name: parsed.name, gridW: parsed.gridW, gridH: parsed.gridH, srcWidth: parsed.srcWidth, srcHeight: parsed.srcHeight, v: Math.round(xmax - xmin).toLocaleString(), v2: Math.round(ymax - ymin).toLocaleString(), v3: parsed.tileCount > 1 ? tr(" from {tileCount} merged tiles", { tileCount: parsed.tileCount }) : "" }) : tr("Imported \"{name}\" as a {gridW}×{gridH} terrain mesh (source {srcWidth}×{srcHeight}px, {v}×{v2} world units){v3}.", { name: parsed.name, gridW: parsed.gridW, gridH: parsed.gridH, srcWidth: parsed.srcWidth, srcHeight: parsed.srcHeight, v: (xmax - xmin).toFixed(0), v2: (ymax - ymin).toFixed(0), v3: parsed.tileCount > 1 ? tr(" from {tileCount} merged tiles", { tileCount: parsed.tileCount }) : "" });
      if (parsed.reprojectedTo) {
        msg += tr(" Reprojected from {v}EPSG:{epsgTag} to the project's EPSG:{reprojectedTo} on import.", { v: parsed.epsgOverridden ? tr("the Source CRS you set, ") : tr("its native "), epsgTag: parsed.epsgTag, reprojectedTo: parsed.reprojectedTo });
      }
      const srcCell = parsed.srcCellM ?? Math.sqrt(((parsed.bbox[2] - parsed.bbox[0]) * (parsed.bbox[3] - parsed.bbox[1])) / Math.max(1, parsed.readPixels)); // srcCellM: a tied grid's source cell, measured before the tie (#2648)
      if (parsed.cropped) { // #422
        msg += tr(" Cropped to the drillholes + {v} m: read {readPixels} of {fullPixels} source pixels. Source cell ~{src} m, mesh spacing ~{v2} m{finer}.", { v: Math.max(1000, Number(demCropBuffer) || 2000), readPixels: parsed.readPixels.toLocaleString(), fullPixels: parsed.fullPixels.toLocaleString(), v2: (((parsed.bbox[2] - parsed.bbox[0]) / Math.max(1, parsed.gridW - 1))).toFixed(0), src: Math.round(srcCell), finer: srcCell > 1.5 * (parsed.bbox[2] - parsed.bbox[0]) / Math.max(1, parsed.gridW - 1) ? tr(" (finer than the source: it interpolates, it adds no detail)") : "" }); // #1249
      } else if (parsed.reprojectNote) {
        msg += tr(" Note: {reprojectNote}", { reprojectNote: parsed.reprojectNote });
      } else if (!tie && parsed.epsgTag && project?.epsg && Number(parsed.epsgTag) !== Number(project.epsg)) {
        msg += tr(" Note: this file's own CRS tag (EPSG:{epsgTag}) doesn't match the project's EPSG:{epsg} — no reprojection happens on import.", { epsgTag: parsed.epsgTag, epsg: project.epsg });
      }
      if (parsed.tiedNote) msg += " " + parsed.tiedNote; // #2648 — said whether cropped or not
      if (parsed.noDataNote) msg += parsed.noDataNote; // #421
      // TASKS.csv #1620 — the new ground against the collars, as the online fetch already checks: a terrain in the wrong units or datum shows here
      const dz = collarTerrainOffset(cc, { bbox: parsed.bbox, gridW: parsed.gridW, gridH: parsed.gridH, elevations: parsed.elevations, noDataMask: parsed.noDataMask || null });
      if (dz && Math.abs(dz.median) > 100) msg += " " + tr("The {n} collars over it sit a median {d} m {dir} this terrain: check its units and vertical datum before relying on it.", { n: dz.n, d: Math.round(Math.abs(dz.median)).toLocaleString(), dir: dz.median > 0 ? tr("above") : tr("below") });
      setTerrainError({ info: !(dz && Math.abs(dz.median) > 100), text: msg });
    } catch (err) {
      setTerrainError({ info: false, text: err.message });
    } finally {
      setTerrainBusy(false);
    }
  };

  // TASKS.csv #894 — terrain from survey points (CSV / TXT / XYZ: x, y, z columns) or contour lines and points in a DXF,
  // for a project with no DEM: a TIN sampled onto the usual node grid (lib/terrainFromPoints.js, loaded on use). Points
  // are taken to be in the project CRS; a file whose X / Y all fit longitude / latitude is reprojected from WGS 84.
  const pointsTerrainInput = useRef(null);
  // TASKS.csv #1599 — the triangulation, the replace check and the report, shared by a points / contours file and the project's own samples and collars
  // misfitAt / benchNote (TASKS.csv #2589): the points the surface is measured against, and what was done where collars stack
  const finishPointsTerrain = async ({ points, lines, what, name, sourceFile, reprojected, misfitAt = null, benchNote = "", leftOutNote = "", spacingFit = false }) => {
    const { terrainFromPointsAsync } = await import("../lib/terrainFromPoints.js");
    const t = await terrainFromPointsAsync({ points, lines }, { gridMax: terrainDetail, spacingFit }); // #986 — in a worker; spacingFit: #3036
    if (!confirmReplaceTerrain(terrain, name)) return; // #2554 — the shared question
    const replaced = replacedTerrainNote(terrain);
    const built = { name, bbox: t.bbox, gridW: t.gridW, gridH: t.gridH, elevations: t.elevations, noDataMask: t.noDataMask || null, source: { kind: "tin from points", file: sourceFile, points: t.stats.points, nodeM: t.stats.cellM } };
    addTerrain(built);
    let msg = replaced + tr("Built \"{name}\" from {what}: a triangulated surface of {tri} triangles sampled on a {gridW}×{gridH} grid (nodes ~{cell} m apart).", { name, what, tri: t.stats.triangles.toLocaleString(), gridW: t.gridW, gridH: t.gridH, cell: t.stats.cellM.toFixed(1) });
    if (reprojected) msg += " " + tr("The coordinates read as longitude / latitude and were reprojected from WGS 84 to the project's EPSG:{epsg}.", { epsg: project.epsg });
    // TASKS.csv #3036 — the node spacing follows the points' spacing, within the Terrain detail and the finest grid
    if (t.stats.gridFromSpacing) msg += " " + tr("The grid follows the points' spacing (median {s} m to the nearest neighbour): {n} nodes along the long side rather than the {d} of the Terrain detail.", { s: t.stats.spacingM.toFixed(0), n: t.stats.nodes.toLocaleString(), d: terrainDetail.toLocaleString() });
    if (t.stats.spacingM > 0 && t.stats.cellM > 1.5 * t.stats.spacingM) msg += " " + tr("The points are closer together (median {s} m) than the finest grid over their whole extent can show (nodes ~{cell} m apart): a terrain over a smaller area, or a DEM, gives finer ground.", { s: t.stats.spacingM.toFixed(0), cell: t.stats.cellM.toFixed(0) });
    // TASKS.csv #3034 — the nodes beside points on the edge of their area
    if (t.stats.pointNodes) msg += " " + tr("{n} node(s) beside points at the edge of their area (outside every triangle) take the nearby points' elevations, so every point has ground.", { n: t.stats.pointNodes.toLocaleString() });
    if (leftOutNote) msg += " " + leftOutNote; // #2987
    if (t.stats.densifyCapped) msg += " " + tr("The contour lines were given a vertex every {m} m rather than every half node spacing ({h} m), to keep the triangulation to about four points per grid node.", { m: t.stats.densifyStepM.toFixed(1), h: t.stats.halfCellM.toFixed(1) }); // #986
    if (t.stats.longDropped) msg += " " + tr("{n} triangle(s) with an edge over {m} m were left out, so no ground is invented across gaps in the data.", { n: t.stats.longDropped, m: Math.round(t.stats.maxEdgeM) });
    if (lines.length && t.stats.flatPct >= 5) msg += " " + tr("{pct}% of the triangles are flat (all three corners on one contour): terraces on hilltops and valley floors, where contours alone do not say how the ground continues.", { pct: t.stats.flatPct.toFixed(0) });
    if (t.stats.filledCount) msg += " " + tr("{pct}% of the grid ({n} cells) lies outside the triangulated points and is left out of the 3D surface. The modelling tools, inversions and collar checks read no ground there (stations, collars or a flat ground stand in); only map layers draped on the terrain sit at the mean elevation {z} m.", { pct: t.stats.filledPct.toFixed(1), n: t.stats.filledCount.toLocaleString(), z: t.stats.fillValue.toFixed(0) });
    if (benchNote) msg += " " + benchNote; // #2589
    if (misfitAt?.length) { // #2589 — the surface against the collars it was built from
      const m = surfaceMisfit(misfitAt, built, BENCH_DZ_M);
      if (m.n) msg += " " + tr("Against the {n} collars it was built from: median {med} m off, worst {worst} m ({id}), {over} more than {lim} m off.", { n: m.n.toLocaleString(), med: m.median.toFixed(2), worst: (m.worst.dz > 0 ? "+" : "") + m.worst.dz.toFixed(1), id: m.worst.id ?? "?", over: m.over.toLocaleString(), lim: BENCH_DZ_M })
        + (m.noGround ? " " + tr("{n} collar(s) lie where the surface has no ground.", { n: m.noGround.toLocaleString() }) : "");
    }
    setTerrainError({ info: true, text: msg });
  };
  // TASKS.csv #1599 — a terrain from the elevations already in the project (offline): Lawyers' 4,520 lidar-elevated samples and 446 collars
  const projectZPoints = useMemo(() => {
    const pick = (rows) => (rows || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).map((p) => ({ x: p.x, y: p.y, z: p.z, ...(p.hole_id != null ? { hole_id: p.hole_id } : {}) })); // hole_id: #2589
    // TASKS.csv #2987 (review #2876, WA iron) — collars whose elevation the import filled (13 at the median 438.8 m) were taken as surveyed
    // ground and read as pit benches beside their surveyed twins; two at 0 m were dropped without a word. Only collars whose elevation is
    // measured are used (the shared rule, collarElevationTrust.js #3004: 'assumed' and 'suspect' are left out, and named)
    const suspect = suspectElevationIds(collars);
    const trustOf = (c) => elevationTrust(c, suspect);
    const measured = (collars || []).filter((c) => trustOf(c) === "measured");
    const collarsOut = (collars || []).filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.y) && trustOf(c) !== "measured").map((c) => ({ hole_id: c.hole_id, why: trustOf(c) }));
    const s = pick(surfaceSamples), c = pick(measured), zeroMissing = zeroMeansMissing([...s, ...c].map((p) => p.z));
    const keep = (p) => !(zeroMissing && p.z === 0);
    return { points: [...s, ...c].filter(keep), samples: s.filter(keep).length, collars: c.filter(keep).length, samplePts: s.filter(keep), collarPts: c.filter(keep), collarsOut }; // samplePts / collarPts: #2589; collarsOut: #2987
  }, [surfaceSamples, collars]);
  // TASKS.csv #2465 (review #2325, WA uranium) — the two NRCan sources were offered on a Western Australian project: off where the collars
  // are plainly outside Canada (its bounding box, with a degree to spare)
  const outsideCanada = useMemo(() => { const at = project?.crsSet !== false && project?.epsg ? collarCentreLonLat(collars, project.epsg) : null; return !!at && !(at.lat > 40.5 && at.lat < 84 && at.lon > -142 && at.lon < -51); }, [collars, project?.epsg, project?.crsSet]);
  // TASKS.csv #2589 — collars stacked at one spot at different RLs (pit benches of different dates): which ground the terrain takes
  const benches = useMemo(() => collarBenches(projectZPoints.collarPts), [projectZPoints]);
  const [benchMode, setBenchMode] = useState("all");
  // TASKS.csv #2987 — which collars the terrain leaves out, and why (named, the first few)
  const collarsOutNote = (out) => {
    if (!out?.length) return "";
    const nA = out.filter((o) => o.why === "assumed").length, nS = out.length - nA;
    const ids = out.slice(0, 6).map((o) => o.hole_id).join(", ") + (out.length > 6 ? ", …" : "");
    return tr("{n} collar(s) are left out: {a} with an elevation the import filled in, {s} with one that looks like a missing value ({ids}).", { n: out.length.toLocaleString(), a: nA.toLocaleString(), s: nS.toLocaleString(), ids });
  };
  const terrainFromProject = async () => {
    setTerrainError(null);
    setTerrainBusy(true);
    try {
      const { samples, samplePts, collarPts } = projectZPoints;
      const picked = pickBenchGround(collarPts, benches.n ? benchMode : "all"); // #2589
      const points = [...samplePts, ...picked.points], nc = picked.points.length;
      const benchNote = !benches.n ? ""
        : benchMode === "lowest" ? tr("Where collars stack at one spot, the lowest was kept ({n} higher collar(s) left out): the surface is the latest pit floor there, not the original topography.", { n: picked.dropped.toLocaleString() })
        : benchMode === "highest" ? tr("Where collars stack at one spot, the highest was kept ({n} lower collar(s) left out): the surface is the nearest to the original ground there, and the pit floor is not in it.", { n: picked.dropped.toLocaleString() })
        : tr("{n} collars share a spot (within {r} m) with a collar {dz} m or more higher or lower, in {spots} place(s), up to {max} m apart: benches drilled at different dates? The surface through all of them is a mined surface there, not the topography; 'Where collars stack' can keep the lowest or the highest.", { n: benches.n.toLocaleString(), r: BENCH_R_M, dz: BENCH_DZ_M, spots: benches.spots.toLocaleString(), max: benches.maxDz.toFixed(1) });
      // TASKS.csv #2263 (review #2174) — collars drilled from underground levels make a surface through the mine, not the ground (a TIN at
      // RL 102-351 under a surface near 400): ask, and name it for what it is
      const ug = collarsLookUnderground(collars, survey);
      if (ug.underground && !window.confirm(tr("The collars look like underground collars ({upward} hole(s) drilled upward, {stacked} pair(s) of collars stacked over each other): a surface through them runs through the mine levels, not the ground.", { upward: ug.upward, stacked: ug.stacked }) + "\n\n" + tr("OK — build it anyway, named 'Surface through the collars'.") + "\n" + tr("Cancel — don't build it (import a DEM or fetch SRTM for the real ground)."))) return;
      await finishPointsTerrain({ points, lines: [], what: tr("{s} surface sample(s) and {c} collar(s) of this project", { s: samples, c: nc }), name: ug.underground ? "Surface through the collars" : "Terrain from samples and collars", sourceFile: "project surface samples and collars", reprojected: false, misfitAt: picked.points, benchNote, leftOutNote: collarsOutNote(projectZPoints.collarsOut), spacingFit: true }); // name: #2263; misfitAt, benchNote: #2589; leftOutNote: #2987; spacingFit: #3036
    } catch (err) {
      setTerrainError({ info: false, text: err.message });
    } finally {
      setTerrainBusy(false);
    }
  };
  const importPointsTerrain = async (file) => {
    if (!file) return;
    setTerrainError(null);
    setTerrainBusy(true);
    try {
      const raw = await file.text();
      let text = /\.dxf$/i.test(file.name) ? raw : skipPreamble(raw).text; // #1666 — a contractor's notes above the header
      // TASKS.csv #1589 — a GEM / Geosoft .xyz ('/X Y elev rawmag ...' header lines, 'line 6412.1' markers) is read by the Point
      // survey's own parser and laid out as a table (a missing cell written NaN keeps the columns aligned); it was refused as
      // 'no X, Y and elevation columns found'
      if (/\.xyz$/i.test(file.name) && /^\s*\//.test(raw)) { const { columns, rows: xr } = parseXYZ(raw); text = [columns.join(" "), ...xr.map((r) => columns.map((c) => (r[c] == null || r[c] === "" ? "NaN" : r[c])).join(" "))].join("\n"); }
      let points = [], lines = [], what;
      if (/\.dxf$/i.test(file.name)) {
        const d = parseDXF(text);
        for (const pl of d.polylines || []) {
          const pts = pl.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
          if (pts.length === 1) points.push(pts[0]); else if (pts.length > 1) lines.push(pts);
        }
        if (!points.length && !lines.length) throw new Error(tr("{name} has no strings or points with elevations (a plan drawing at elevation 0 has none): a terrain needs heights.", { name: file.name }));
        what = tr("{l} contour line(s) and {p} point(s)", { l: lines.length, p: points.length });
      } else {
        const spaced = /\.xyz$/i.test(file.name) || !/[,;\t]/.test(text.slice(0, 2000)); // XYZ / whitespace-separated: runs of spaces are one separator
        const rows = Papa.parse(text.trim(), { skipEmptyLines: true, delimiter: spaced ? " " : "" }).data.map((r) => (spaced ? r.filter((c) => String(c).trim() !== "") : r));
        const numeric = (r) => r.slice(0, 3).every((c) => Number.isFinite(Number(String(c).replace(",", "."))));
        const header = rows.length && !numeric(rows[0]) ? rows[0] : null;
        const { guessXYZ } = await import("../lib/terrainFromPoints.js");
        const g = header ? guessXYZ(header) : { x: 0, y: 1, z: 2 };
        const col = (k) => (header ? header.indexOf(g[k]) : g[k]);
        const [ix, iy, iz] = [col("x"), col("y"), col("z")];
        if (ix < 0 || iy < 0 || iz < 0) throw new Error(tr("{name}: no X, Y and elevation columns found (headers such as Easting, Northing, Elevation, or three numbers per line).", { name: file.name }));
        // TASKS.csv #1436 — a blank cell is no value (Number("") is 0: Silvertip's blank elevations became sea level), and a 0 among
        // elevations well above sea level is a missing one too (zeroMeansMissing, #1394): a pit to 6 m at the drill pads otherwise
        const n = (v) => { const t = String(v ?? "").trim(); return t === "" ? NaN : Number(t.replace(",", ".")); };
        const read = (header ? rows.slice(1) : rows).map((r) => ({ x: n(r[ix]), y: n(r[iy]), z: n(r[iz]) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        const zeroMissing = zeroMeansMissing(read.map((p) => p.z));
        points = read.filter((p) => Number.isFinite(p.z) && !(zeroMissing && p.z === 0));
        const left = read.length - points.length;
        what = tr("{n} point(s)", { n: points.length }) + (left ? tr(" ({n} left out: no elevation, or 0 among elevations well above sea level)", { n: left }) : "");
      }
      // longitude / latitude in a projected project: reproject from WGS 84
      const all = [...points, ...lines.flat()];
      let reprojected = false;
      if (project?.epsg && Number(project.epsg) !== 4326 && all.length && all.every((p) => Math.abs(p.x) <= 180 && Math.abs(p.y) <= 90)) {
        const mv = (p) => { const q = reprojectXY(p.x, p.y, 4326, Number(project.epsg)); return q ? { x: q.x, y: q.y, z: p.z } : { x: NaN, y: NaN, z: p.z }; };
        points = points.map(mv); lines = lines.map((l) => l.map(mv)); reprojected = true;
      }
      await finishPointsTerrain({ points, lines, what, name: file.name.replace(/\.[^.]+$/, ""), sourceFile: file.name, reprojected });
    } catch (err) {
      setTerrainError({ info: false, text: err.message });
    } finally {
      setTerrainBusy(false);
    }
  };

  // TASKS.csv #1994 — a lidar point cloud (LAS / LAZ / COPC): the header is read at once and shown with the choices; Import
  // reads the points in a worker, then builds the terrain from the ground points and / or adds a thinned cloud as a point survey
  const [lidarPending, setLidarPending] = useState(null); // { file, info, epsg }
  const [lidarBusy, setLidarBusy] = useState(false);
  const lidarInput = useRef(null);
  // only the instance showing the Terrain pane (the Maps tab's) answers: the Geophysics tab may be mounted too
  useModuleAction(["open-lidar"], (_a, p) => { if (forcePane === "terrain" && p?.file) openLidar(p.file); });
  const openLidar = async (file) => {
    if (!file) return;
    setTerrainError(null);
    try {
      const { inspectLidarFile } = await import("../lib/lidarImport.js");
      const info = await inspectLidarFile(file);
      let epsg = project?.epsg;
      if (info.crs.epsg) { const adopted = askAdoptCrs({ isEmpty: projectIsEmpty, currentEpsg: epsg, declaredEpsg: info.crs.epsg, fileName: file.name }); if (adopted) { setEpsg(adopted); epsg = adopted; } }
      setLidarPending({ file, info, epsg });
    } catch (err) {
      setTerrainError({ info: false, text: tr("Could not read {name}: {message}", { name: file.name, message: err.message }) });
    }
  };
  const confirmLidar = async ({ wantTerrain, wantCloud, target, cloudClasses, colourBy }) => {
    const { file, info, epsg } = lidarPending, h = info.header, name = file.name.replace(/\.(copc\.)?la[sz]$/i, "");
    if (wantTerrain && terrain && !window.confirm(tr("Replace the current terrain (\"{name}\") with \"{name2}\"? Only one terrain surface is supported at a time.", { name: terrain.name, name2: name }))) return;
    setLidarBusy(true);
    const label = tr("Reading {name}", { name: file.name }), t0 = Date.now();
    try {
      const L = await import("../lib/lidarImport.js");
      const plan = await L.lidarCrsPlan(info, epsg);
      if (plan.problem) throw new Error(plan.problem === "file" ? tr("Its coordinate system (EPSG:{code}) is not one GeoStrix can convert, so the points cannot be placed in this project's EPSG:{p}.", { code: plan.fileEpsg, p: epsg }) : tr("The project's coordinate system (EPSG:{code}) is not one GeoStrix can convert to.", { code: epsg }));
      const toRead = L.pointsToRead(info), cell = L.lidarCellSize(h, terrainDetail, toRead);
      const keepEvery = wantCloud ? Math.max(1, Math.floor(toRead / (4 * target))) : 1;
      const res = await L.readLidarAsync(file, { cellSize: cell, keepEvery, maxCloud: 8 * target + 1, cloudClasses, wantCloud }, (f) => setTaskProgress?.({ label, pct: Math.round(f * 100) }));
      setTaskProgress?.(null);
      const out = lidarResultToProject(res, { reproject: plan.reproject, zFactor: plan.zFactor, hFactor: plan.hFactor, colourBy, src: file.name, wantTerrain });
      const msg = [];
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      msg.push(res.read.kind === "COPC"
        ? tr("Read \"{file}\" in {s} s: the first {d} of {levels} levels of its octree, {read} of {all} points.", { file: file.name, s: secs, d: res.read.maxDepth + 1, levels: res.read.levels, read: res.seen.toLocaleString(), all: res.read.allPoints.toLocaleString() })
        : tr("Read all {n} points of \"{file}\" in {s} s.", { n: res.seen.toLocaleString(), file: file.name, s: secs }));
      const top = Object.entries(res.classCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, k]) => `${tr(CLASS_NAMES[c] || "Class {c}", { c })} ${k.toLocaleString()}`).join(", ");
      if (top) msg.push(tr("Classes: {list}.", { list: top }));
      if (res.noise || res.withheld) msg.push(tr("{noise} noise and {withheld} withheld point(s) left out.", { noise: res.noise.toLocaleString(), withheld: res.withheld.toLocaleString() }));
      if (plan.reproject) msg.push(tr("Reprojected from EPSG:{a} to the project's EPSG:{b}.", { a: plan.fileEpsg, b: epsg }));
      if (plan.noCrs) msg.push(tr("The file names no coordinate system: its coordinates were taken as the project's (EPSG:{code}).", { code: epsg }));
      if (Math.abs(plan.zFactor - 1) > 1e-9) msg.push(tr("Heights multiplied by {f}: the file gives them in another unit than the project's.", { f: +plan.zFactor.toFixed(7) }));
      if (wantTerrain) {
        const sf = out.surface;
        if (!out.terrain) msg.push(tr("No terrain: too few points to grid."));
        else {
          let built;
          if (out.terrain.kind === "grid") {
            const fill = fillNoData(out.terrain.values);
            built = { bbox: out.terrain.bbox, gridW: out.terrain.gridW, gridH: out.terrain.gridH, elevations: fill.elevations, noDataMask: fill.noDataMask || null };
          } else {
            const { terrainFromPointsAsync } = await import("../lib/terrainFromPoints.js");
            const t = await terrainFromPointsAsync({ points: out.terrain.points, lines: [] }, { gridMax: terrainDetail });
            built = { bbox: t.bbox, gridW: t.gridW, gridH: t.gridH, elevations: t.elevations, noDataMask: t.noDataMask || null };
          }
          addTerrain({ name, ...built, source: { kind: "lidar ground", file: file.name, from: sf.from, cellM: +sf.cellM.toFixed(2), points: res.seen } });
          msg.push(sf.from === "ground"
            ? tr("Terrain \"{name}\": the mean of the ground points in {w}×{h} cells of {c} m.", { name, w: sf.gridW, h: sf.gridH, c: sf.cellM.toFixed(1) })
            : tr("Terrain \"{name}\": the file has no ground-classified points, so each of the {w}×{h} cells of {c} m takes its lowest point. Where no pulse reached the ground (dense trees, roofs) that is the top of the trees or the roof.", { name, w: sf.gridW, h: sf.gridH, c: sf.cellM.toFixed(1) }));
          if (sf.filled) msg.push(tr("{n} cell(s) with no ground point (under buildings, water, gaps between flight lines) were filled from their neighbours, up to {m} m away.", { n: sf.filled.toLocaleString(), m: Math.round(sf.fillM) }));
          if (sf.empty) msg.push(tr("{n} cell(s) further than that are left out of the 3D surface.", { n: sf.empty.toLocaleString() }));
          if (out.terrain.kind === "points") msg.push(tr("The cells were reprojected and triangulated onto a {w}×{h} grid in the project's coordinates.", { w: built.gridW, h: built.gridH }));
        }
      }
      if (wantCloud) {
        const { rows, every } = L.thinTo(out.rows, target);
        if (!rows.length) msg.push(tr("No points for the 3D View: none of that kind in the file."));
        else {
          setLayers((l) => ({ ...l, geophys_pts: replaceSurveyPoints(l.geophys_pts, rows).rows }));
          updateGeophysSurvey(file.name, { method: "lidar", units: colourBy === "elevation" ? (Math.abs(plan.zFactor - plan.zFile) < 1e-9 ? "m" : "") : "" });
          const kept = keepEvery * every;
          const what = colourBy === "intensity" ? tr("intensity") : colourBy === "class" ? tr("classification code") : tr("elevation");
          msg.push(kept > 1
            ? tr("Point cloud \"{file}\": {n} points in the 3D View (1 in {k} of those read), coloured by {what}.", { file: file.name, n: rows.length.toLocaleString(), k: kept.toLocaleString(), what })
            : tr("Point cloud \"{file}\": all {n} points read are in the 3D View, coloured by {what}.", { file: file.name, n: rows.length.toLocaleString(), what }));
        }
      }
      setLidarPending(null);
      setTerrainError({ info: true, text: msg.join(" ") });
    } catch (err) {
      setTaskProgress?.(null);
      setTerrainError({ info: false, text: tr("Could not read {name}: {message}", { name: file.name, message: err.message }) });
    } finally {
      setLidarBusy(false);
    }
  };

  // TASKS.csv #203 — "We need options to export the generated SRTM, at least to geotiff." The merged/
  // processed terrain (whatever was actually used — imported DEM tiles, or a fetched SRTM area) had no
  // way back out for another tool or for archiving. See raster.js's terrainToGeoTIFFArrayBuffer for the
  // actual writer (geotiff package's own writeArrayBuffer, not hand-rolled).
  const exportTerrainGeoTIFF = async () => {
    if (!terrain) return;
    const ex = await exportCrs(project); if (!ex) return; // #1021; #2322 — a tied local grid: resampled through its tie
    const epsg = ex.epsg;
    try {
      const bytes = new Uint8Array(terrainToGeoTIFFArrayBuffer(terrainToWorld(terrain, ex.tie), epsg)); // #1040 — bytes over IPC
      const masked = terrainToGeoTIFFArrayBuffer.lastMasked || 0; // #1020
      const res = await saveFile({ suggestedName: `${safeFileName(terrain.name.replace(/\.(tif|tiff)$/i, ""), "terrain")}.tif`, filters: [{ name: "GeoTIFF", extensions: ["tif"] }], content: bytes });
      if (res?.ok && masked) setTerrainError({ info: true, text: tr("{n} terrain nodes had no data (filled for display only) and are written as no-data (-9999).", { n: masked.toLocaleString() }) + tiedExportNote(ex.tie) });
      else if (res?.ok && ex.tie) setTerrainError({ info: true, text: tiedExportNote(ex.tie).trim() });
    } catch (err) {
      setTerrainError({ info: false, text: tr("Couldn't export terrain: {message}", { message: err.message }) });
    }
  };

  // TASKS.csv — SRTM auto-fetch: fetch elevation for the current project area directly (see
  // src/lib/srtmFetch.js's header comment for the data source and why it's not literally usgs.gov),
  // instead of the manual "go find a DEM file, download it, import it" flow above. Bbox comes from the
  // loaded collars (with a margin so the terrain extends a bit past the drillholes, same idea as any
  // "zoom to fit" padding elsewhere in the app) — reprojected corner-by-corner to lon/lat since a
  // margin-expanded UTM box isn't itself a lon/lat-aligned box, so all 4 corners are checked and the
  // min/max taken, not just the center reprojected and a lon/lat margin re-applied.
  // User request (TASKS.csv): "an option to draw a rectangle on the view when we click on generate
  // SRTM so we can get it expanded to where we wish" — the old flow computed this bbox and fetched
  // immediately with no way to see or adjust it first. Now "Fetch terrain for this area" (was "Fetch SRTM", renamed in #815) opens
  // BasemapView in "draw" mode, pre-seeded with this same collar-derived bbox (still the sensible
  // default — most of the time the drillholes ARE the area of interest) as an editable rectangle: the
  // user can accept it as-is with one click, or pan/redraw to widen or shift it before confirming.
  // TASKS.csv #2648 — a point of the project to lon / lat: on a tied local grid through the tie (grid -> its CRS -> WGS 84)
  const lonLatOf = (x, y) => { const tie = tieOf(project); if (!tie) return toLonLat(x, y, project.epsg); const w = localToWorld(tie, x, y); return toLonLat(w.x, w.y, tie.epsg); };
  const defaultSrtmBboxLonLat = async () => {
    if (!project?.epsg && !tieOf(project)) return null;
    if (!collars.length) {
      // TASKS.csv #815 — no drillholes (a mapping project such as Perk-Rocky): the loaded terrain's extent, else the map
      // layers', so the picker opens over the project and not wherever the map last was
      let box = terrain?.bbox || null;
      if (!box) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const l of mapLayers || []) for (const f of l.features || []) for (const part of f.parts || [f.geometry || []]) for (const p of part) {
          if (Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
        }
        if (x1 > x0 && y1 > y0) box = [x0, y0, x1, y1];
      }
      if (!box) box = surfaceSampleBox(); // TASKS.csv #845 — a soil / stream program with no drilling: its samples' area
      if (!box) return null;
      const lls = await Promise.all([[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].map(([x, y]) => lonLatOf(x, y)));
      if (lls.some((ll) => !ll)) return null;
      return [arrMin(lls.map((ll) => ll.lon)), arrMin(lls.map((ll) => ll.lat)), arrMax(lls.map((ll) => ll.lon)), arrMax(lls.map((ll) => ll.lat))];
    }
    // #1461 — the collars and the surface samples near them (the soil grid), not the collars alone
    const [xmin, ymin, xmax, ymax] = fetchAreaBox(collars, surfaceSamples);
    const corners = [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]];
    const lonLats = await Promise.all(corners.map(([x, y]) => lonLatOf(x, y)));
    if (lonLats.some((ll) => !ll)) return null;
    const lons = lonLats.map((ll) => ll.lon), lats = lonLats.map((ll) => ll.lat);
    return [arrMin(lons), arrMin(lats), arrMax(lons), arrMax(lats)];
  };

  // TASKS.csv #200 — "the option to select a polygon or a raster to use as boundary": reprojects
  // each already-imported boundary/raster's own extent (project EPSG) to lon/lat so the SRTM picker
  // can offer it as a ready-made fetch area, same idea as the collar-derived seed bbox above but for
  // layers instead of drillholes. Boundaries store polylines, not a bbox, so it's computed here from
  // every vertex across every loop; rasters already carry their own bbox.
  // TASKS.csv #845 — the surface samples' extent with a margin (10 %, at least 1 km: a stream site's catchment reaches well
  // beyond the sites), in project coordinates, or null
  // TASKS.csv #1427 — a model far from the drilling (another property, or a neighbouring UTM zone) is said, not drawn off-screen
  const farNote = (cells) => { const km = modelGapKm(cells, collars, terrain?.bbox); return km != null && km > 20 ? ` ${tr("It lies {km} km from the drillholes: check its coordinate system (a neighbouring UTM zone?).", { km: Math.round(km).toLocaleString() })} ` : ""; };
  const surfaceSampleBox = () => {
    const { keep } = mainClusters(surfaceSamples || []); // #1461 — not the 5 rocks 45 km south (a 42 x 67 km area on Silvertip)
    const pts = (surfaceSamples || []).filter((p, i) => keep[i] && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!pts.length) return null;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = arrMin(xs), x1 = arrMax(xs), y0 = arrMin(ys), y1 = arrMax(ys);
    const m = Math.max(1000, 0.1 * Math.max(x1 - x0, y1 - y0));
    return [x0 - m, y0 - m, x1 + m, y1 + m];
  };
  const buildSrtmAreaOptions = async () => {
    if (!project?.epsg && !tieOf(project)) return [];
    const jobs = [];
    const sb = surfaceSampleBox(); // #845
    if (sb) jobs.push({ id: "surface_samples", label: tr("Around the surface samples"), xmin: sb[0], ymin: sb[1], xmax: sb[2], ymax: sb[3] });
    for (const b of boundaries) {
      if (!isAreaBoundary(b)) continue; // #1466 — contours and other open lines are not an area
      const xs = [], ys = [];
      for (const loop of b.polylines || []) for (const p of loop) { xs.push(p.x); ys.push(p.y); }
      if (!xs.length) continue;
      jobs.push({ id: `boundary_${b.id}`, label: `Boundary: ${b.name}`, xmin: arrMin(xs), xmax: arrMax(xs), ymin: arrMin(ys), ymax: arrMax(ys) });
    }
    for (const r of rasters) {
      if (!r.bbox) continue;
      const [xmin, ymin, xmax, ymax] = r.bbox;
      jobs.push({ id: `raster_${r.id}`, label: `Raster: ${r.name}`, xmin, xmax, ymin, ymax });
    }
    const options = await Promise.all(jobs.map(async (j) => {
      const corners = [[j.xmin, j.ymin], [j.xmax, j.ymin], [j.xmax, j.ymax], [j.xmin, j.ymax]];
      const lonLats = await Promise.all(corners.map(([x, y]) => lonLatOf(x, y)));
      if (lonLats.some((ll) => !ll)) return null;
      const lons = lonLats.map((ll) => ll.lon), lats = lonLats.map((ll) => ll.lat);
      return { id: j.id, label: farLabel(j.label, farFromCollars([j.xmin, j.ymin, j.xmax, j.ymax], collars)), bboxLonLat: [arrMin(lons), arrMin(lats), arrMax(lons), arrMax(lats)] }; // farLabel: #2590
    }));
    return options.filter(Boolean);
  };

  // TASKS.csv #615 — terrain is fetched for wherever the project CRS puts the data: a CRS never chosen is asked for
  // first, then the picker re-opens on the next render (its area seeds read the project CRS from this render).
  const openSrtmPickerRef = useRef(null);
  const openSrtmPicker = async () => {
    if (project?.crsSet === false && !tieOf(project)) { // #2648 — a tied local grid fetches through its tie
      const chosen = await ensureProjectCrs(project, tr("Terrain is downloaded for the place your coordinates point to, so the project needs its coordinate system first."));
      if (chosen) setTimeout(() => openSrtmPickerRef.current?.(), 0);
      return;
    }
    if (!project?.epsg && !tieOf(project)) {
      setTerrainError({ info: false, text: tr("Project EPSG isn't set — can't reproject fetched elevation into project coordinates.") });
      return;
    }
    setTerrainError(null);
    const seed = await defaultSrtmBboxLonLat();
    if (collars.length && !seed) {
      setTerrainError({ info: false, text: tr("Couldn't convert the project's EPSG:{epsg} to lon/lat (unrecognized code) — automatic SRTM fetch needs that conversion. Use manual GeoTIFF import instead.", { epsg: tieOf(project)?.epsg ?? project.epsg }) });
      return;
    }
    setSrtmSeedBbox(seed);
    setSrtmSeedLonLat(seed ? { lon: (seed[0] + seed[2]) / 2, lat: (seed[1] + seed[3]) / 2 } : null);
    setSrtmAreaOptions(await buildSrtmAreaOptions());
    setSrtmPickerOpen(true);
  };
  openSrtmPickerRef.current = openSrtmPicker;

  const relabelNote = useRef(""); // #614
  const runSrtmFetch = async (bboxLonLat, epsgOverride = null) => {
    const [lonMin, latMin, lonMax, latMax] = bboxLonLat;
    const tie = epsgOverride ? null : tieOf(project); // TASKS.csv #2648 — a tied local grid: fetched in the tie's CRS, then brought into the grid
    const targetEpsg = epsgOverride || (tie ? Number(tie.epsg) : project.epsg); // #614 — a zone fix re-fetches before the new label reaches this closure
    if (terrain && !epsgOverride && !window.confirm(tr("Replace the current terrain (\"{name}\") with freshly fetched terrain for this area? Only one terrain surface is supported at a time.", { name: terrain.name }))) {
      return;
    }
    setSrtmPickerOpen(false);
    setTerrainBusy(true);
    setSrtmProgress({ done: 0, total: 1 });
    try {
      const nrcan = terrainSource === "mrdem" || terrainSource === "hrdem"; // TASKS.csv #815
      const fetcher = nrcan ? (await import("../lib/nrcanDem.js")).fetchNrcanTerrain : terrainSource === "copernicus" ? fetchCopernicusTerrain : fetchSRTMTerrain; // #814
      let parsed = await fetcher({
        lonMin, latMin, lonMax, latMax, targetEpsg, gridMax: terrainDetail, // #796
        onProgress: (done, total) => setSrtmProgress({ done, total }),
        source: terrainSource,
      });
      let tieNote = "";
      if (tie) { // #2648
        const local = tieTerrainToLocal(parsed, tie, targetEpsg, terrainDetail);
        if (!local) throw new Error(tr("The fetched terrain could not be brought into the local grid through its tie to EPSG:{epsg}.", { epsg: targetEpsg }));
        parsed = local;
        tieNote = " " + tr("It was fetched in EPSG:{epsg} and brought into the local grid through the grid's tie, and resampled onto the grid's own north.", { epsg: targetEpsg });
      }
      // TASKS.csv #614 — collars hundreds of metres off the fetched ground: is the project in the wrong UTM zone?
      const misfit = tie ? null : collarGroundMisfit(collars, parsed); // #2648 — not on a tied grid: its CRS is the tie, not a UTM zone to relabel
      let misfitNote = "";
      if (tie) {
        const cc = (collars || []).filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));
        const dz = collarTerrainOffset(cc, parsed);
        if (dz && Math.abs(dz.median) > 100) misfitNote = " " + tr("The {n} collars over it sit a median {d} m {dir} this terrain: check its units and vertical datum before relying on it.", { n: dz.n, d: Math.round(Math.abs(dz.median)).toLocaleString(), dir: dz.median > 0 ? tr("above") : tr("below") });
      }
      if (misfit && misfit.medianDz > 100) {
        setSrtmProgress(null);
        setTerrainError({ info: true, text: tr("The collars sit a median {v} m off this terrain — checking whether the project's CRS is one UTM zone off…", { v: Math.round(misfit.medianDz) }) });
        const better = await findBetterUtmZone(collars, targetEpsg, misfit);
        if (better && window.confirm(tr("The {n} collars sit a median {v} m above or below the terrain fetched for {v2}, but read as {name} they sit within {v3} m of the ground.\n\nThe project CRS is probably the wrong UTM zone (new projects start as EPSG:3156, zone 9N; a collar CSV carries no CRS).\n\nOK — relabel the project as {name} (EPSG:{code}; no coordinates change) and fetch the terrain there.\nCancel — keep this terrain.", { n: misfit.n, v: Math.round(misfit.medianDz), v2: crsName(targetEpsg) || tr("EPSG:{targetEpsg}", { targetEpsg }), name: better.name, v3: Math.round(better.medianDz), code: better.code }))) {
          setEpsg(better.code);
          const T = pointTransform(better.code, 4326);
          const [bx0, by0, bx1, by1] = parsed.bbox;
          const c = [[bx0, by0], [bx1, by0], [bx0, by1], [bx1, by1]].map(([x, y]) => T(x, y));
          relabelNote.current = tr(" Project CRS relabelled from EPSG:{targetEpsg} to {name} (EPSG:{code}): the collars sit on the ground there. Re-fetch any satellite imagery, hillshade or other online layer — those were fetched for the old zone.", { targetEpsg, name: better.name, code: better.code });
          return await runSrtmFetch([Math.min(...c.map((p) => p[0])), Math.min(...c.map((p) => p[1])), Math.max(...c.map((p) => p[0])), Math.max(...c.map((p) => p[1]))], better.code);
        }
        misfitNote = better
          ? tr(" The collars sit a median {v} m off this terrain (in {name} they would sit within {v2} m) — kept as you chose.", { v: Math.round(misfit.medianDz), name: better.name, v2: Math.round(better.medianDz) })
          : tr(" The collars sit a median {v} m off this terrain, and no neighbouring UTM zone fits better: check the project CRS and the collar elevations (feet? a local datum?).", { v: Math.round(misfit.medianDz) });
      }
      addTerrain({ name: parsed.name, bbox: parsed.bbox, gridW: parsed.gridW, gridH: parsed.gridH, elevations: parsed.elevations, noDataMask: parsed.noDataMask || null, source: parsed.source || null }); // noDataMask: #421; source: #726
      const [txmin, tymin, txmax, tymax] = parsed.bbox;
      let msg = (tie ? Math.abs((tie.scale || 1) - 1) < 0.01 : isMetricProjectedEpsg(project?.epsg)) // #2127 — metres on a metric project; a tied grid in metres: #2648
        ? tr("Fetched and imported \"{name}\" as a {gridW}×{gridH} terrain mesh covering {v} × {v2} m for the area you drew.", { name: parsed.name, gridW: parsed.gridW, gridH: parsed.gridH, v: Math.round(txmax - txmin).toLocaleString(), v2: Math.round(tymax - tymin).toLocaleString() })
        : tr("Fetched and imported \"{name}\" as a {gridW}×{gridH} terrain mesh covering {v}×{v2} world units for the area you drew.", { name: parsed.name, gridW: parsed.gridW, gridH: parsed.gridH, v: (txmax - txmin).toFixed(0), v2: (tymax - tymin).toFixed(0) });
      if (parsed.source) msg += parsed.source.zoom != null
        ? tr(" Source: {service}, zoom {zoom} (its own pixels ~{v} m), resampled to nodes ~{v2} m apart — features smaller than that are smoothed out.", { service: parsed.source.service, zoom: parsed.source.zoom, v: Math.round(parsed.source.sourcePixelM), v2: Math.round(parsed.source.nodeM) }) // #726
        : parsed.source.bareEarth
          ? tr(" Source: {service}, resampled to nodes ~{v2} m apart. It is a bare-earth terrain model (forest removed).", { service: parsed.source.service, v2: Math.round(parsed.source.nodeM) }) // #815
          : tr(" Source: {service}, resampled to nodes ~{v2} m apart. It is a surface model: in forest it reads some metres above the ground.", { service: parsed.source.service, v2: Math.round(parsed.source.nodeM) }); // #814
      // TASKS.csv #814 — cones in the AWS tiles that Copernicus GLO-30 does not have: reported, not changed
      if (parsed.suspectCones?.length) {
        const fmt = (c) => (Number.isFinite(c.x) ? `${Math.round(c.x).toLocaleString()} E ${Math.round(c.y).toLocaleString()} N` : `${c.lon.toFixed(4)}, ${c.lat.toFixed(4)}`) + tr(" ({v} m high{v2})", { v: Math.round(c.riseM), v2: c.copRiseM == null ? "" : tr("; Copernicus {v} m", { v: Math.round(c.copRiseM) }) });
        msg += tr(parsed.suspectCones.length === 1 ? " Warning: {n} isolated cone in the AWS tiles that Copernicus GLO-30 does not show — most likely a source artifact: {list}. The data were not changed; to avoid it, choose Copernicus GLO-30 as the online source and fetch again." : " Warning: {n} isolated cones in the AWS tiles that Copernicus GLO-30 does not show — most likely source artifacts: {list}. The data were not changed; to avoid them, choose Copernicus GLO-30 as the online source and fetch again.", { n: parsed.suspectCones.length, list: parsed.suspectCones.slice(0, 4).map(fmt).join("; ") });
      }
      if (parsed.conesUnchecked) msg += tr(" {n} isolated cone(s) could not be checked against Copernicus GLO-30 (no connection to it).", { n: parsed.conesUnchecked });
      if (parsed.spikesRemoved) msg += tr(parsed.spikesRemoved === 1 ? " {n} isolated spike or pit in the source data (a pixel tens of metres off all its neighbours) was replaced by its neighbours' median." : " {n} isolated spikes or pits in the source data (pixels tens of metres off all their neighbours) were replaced by their neighbours' median.", { n: parsed.spikesRemoved }); // TASKS.csv #799
      if (parsed.reprojectedTo) msg += tr(" Reprojected from WGS84 to the project's EPSG:{reprojectedTo}.", { reprojectedTo: parsed.reprojectedTo });
      else if (parsed.reprojectNote) msg += tr(" Note: {reprojectNote}", { reprojectNote: parsed.reprojectNote });
      if (parsed.failedTiles) msg += tr(" {failedTiles} tile(s) failed to download — check your connection.", { failedTiles: parsed.failedTiles });
      if (parsed.noDataNote) msg += parsed.noDataNote; // #421
      msg += tieNote + misfitNote + relabelNote.current; relabelNote.current = ""; // #614; tieNote: #2648
      setTerrainError({ info: true, text: msg });
    } catch (err) {
      setTerrainError({ info: false, text: err.message });
    } finally {
      setTerrainBusy(false);
      setSrtmProgress(null);
    }
  };

  // Geosoft .ply boundary import (survey of a real Oasis montaj sample dataset — see TASKS.csv note
  // and src/lib/geosoft.js's parsePLYBoundary comment for the reverse-engineered format), plus DXF
  // (TASKS.csv #128 — "DXF is the lingua franca between GIS/CAD in exploration... claim maps, section
  // templates from surveyors/CAD"), dispatched by extension — both parsers produce the identical
  // {polylines} shape, so they share this one import path and both land as ordinary boundaries.
  // Accepts multiple files at once, mixed formats — real properties often ship several boundary files
  // together (survey area, claim block, blind-grid extent, etc.) and there's no reason to force
  // one-at-a-time like terrain's single-surface limit; each file becomes its own boundary entry.
  //
  // TASKS.csv #237 (Micromine-specialist audit finding: "claim/tenure import only accepts .ply/.dxf,
  // not the shapefile/KML format BC's Mineral Titles Online actually distributes claims in") — added
  // shapefile (.zip/.shp) and GeoPackage (.gpkg), the two vector formats this app already has full,
  // battle-tested parsers for elsewhere (collar/survey import, #190/#191). Every FEATURE in the file
  // becomes its own polyline within the boundary's `polylines` array — the same "one boundary can hold
  // several separate rings" shape .ply/DXF multi-poly files already produce — rather than one boundary
  // per feature, matching how a real claim-block shapefile (several adjacent/separate blocks in one
  // file) is normally meant to be treated as a single layer. KML was NOT added: it needs its own XML
  // parser (a different format entirely, not a shapefile variant), out of scope for this pass — flagged
  // as still open.
  // TASKS.csv #2467 — a KML / GPX / GeoJSON is longitude / latitude: said like any other import's CRS
  const lonLatNote = (tie) => (!tie && !(project?.crsSet !== false && project?.epsg) ? null : tie ? tr("its longitude / latitude (WGS 84) was brought into the local grid through its tie to EPSG:{tie}", { tie: tie.epsg }) : tr("its longitude / latitude (WGS 84) was reprojected to the project's {dst}", { dst: crsLabel(project?.epsg) }));
  // TASKS.csv #2684 — KML / GPX / GeoJSON are longitude / latitude by their spec: a Source CRS chosen in the pane is not used for them, and said
  const withLonLatSource = (note) => (boundarySource ? [note, tr("the Source CRS was not used: KML, GPX and GeoJSON are longitude / latitude")].filter(Boolean).join("; ") : note);
  // TASKS.csv #2684 — a .ply / .dxf states no CRS: a Source CRS chosen in the pane (a code, or 'Local mine grid') places its strings. -> { map, note } | null
  async function plainSourceTransform() {
    if (!boundarySource) return null;
    const { T, note } = await boundaryCrsTransform({ src: null, dst: projectTargetEpsg(project), tie: tieOf(project), source: boundarySource, mineSource: mineSourceOf(project) });
    return { map: (pls) => (T ? pls.map((pl) => pl.map((pt) => { const [x, y] = T(pt.x, pt.y); return Number.isFinite(x) && Number.isFinite(y) ? { ...pt, x, y } : pt; })) : pls), note };
  }
  async function shapeFileToPolylines(file) {
    const name = file.name.toLowerCase();
    // TASKS.csv #424 — KML/KMZ (MTO claims, Google Earth, phone waypoints). Always WGS84, so it is
    // reprojected to the project CRS here, unlike the other formats which are assumed to be in it.
    if (name.endsWith(".kml") || name.endsWith(".kmz")) {
      const { features } = await readKmlFile(file);
      const tie = tieOf(project); // #2587
      if (tie) await getProj4Def(Number(tie.epsg)); // a registry code loads on demand (#834)
      const { polylines, failed, featureOf, attributes } = kmlToProjectPolylines(features, project?.epsg, { toLocal: tie ? (x, y, from) => fileToLocal(tie, x, y, from) : null }); // featureOf, attributes: #2742
      if (!polylines.length) throw new Error(failed ? tr("KML coordinates could not be converted to EPSG:{v}.", { v: project?.epsg }) : tr("No lines or polygons found in this KML (points are imported through the 3D View importer)."));
      return { polylines, featureOf, attributes, note: withLonLatSource(lonLatNote(tie)) }; // #2467; #2684; featureOf / attributes: #2742 — one claim per Placemark
    }
    // TASKS.csv #1106 — GPX tracks / routes and GeoJSON lines / polygons, WGS 84 (or a GeoJSON "crs" EPSG) to the project CRS
    if (name.endsWith(".gpx") || name.endsWith(".geojson") || name.endsWith(".json")) {
      const { parseGPX, gpxToLayers, parseGeoJSON, layersToBoundaryPolylines } = await import("../lib/gpxGeojson.js");
      const text = await file.text();
      const layers = name.endsWith(".gpx") ? gpxToLayers(parseGPX(text)) : parseGeoJSON(text).layers;
      const tie = tieOf(project); // #2587
      if (tie) await getProj4Def(Number(tie.epsg)); // a registry code loads on demand (#834)
      const { polylines, closedFlags, failed, partNames, featureOf, attributes } = layersToBoundaryPolylines(layers, project?.epsg, reprojectXY, tie ? (x, y, from) => fileToLocal(tie, x, y, from) : null); // closedFlags: #1760; partNames: #1767
      if (!polylines.length) throw new Error(failed ? tr("Coordinates could not be converted to EPSG:{v}.", { v: project?.epsg }) : tr("No lines or polygons found in this file (GPX waypoints and GeoJSON points are imported as a map layer in Surface Geology)."));
      return { polylines, closedFlags, featureOf, attributes, ...(partNames ? { partNames } : {}), note: withLonLatSource(lonLatNote(tie)) }; // note: #2467; #2684; featureOf / attributes: #2742 — one claim per feature
    }
    // TASKS.csv #1035 — every part of every feature, reprojected from the file's own CRS (lib/boundaryImport.js)
    if (name.endsWith(".zip") || name.endsWith(".shp")) {
      const buf = await file.arrayBuffer();
      // TASKS.csv #2121 (review #2013, Woodjam) — a loose .shp is read with the .prj / .dbf / .cpg chosen beside it (groupShapefileParts
      // in the import handlers), as the map-layer importer does: alone, a zone 9N file landed 409 km off as 'it states no CRS'
      const parts = file.shpParts || {};
      const parsed = name.endsWith(".zip") ? await parseShapefileZip(buf) : parseShapefileParts({ shp: new Uint8Array(buf), dbf: parts.dbf ? new Uint8Array(await parts.dbf.arrayBuffer()) : null, cpg: parts.cpg ? await parts.cpg.text() : null }, 0, parts.prj ? await parts.prj.text() : null);
      const r = await vectorToBoundaryPolylines(parsed, projectTargetEpsg(project), { mineGrid: mineGridOf(project), collars, tie: tieOf(project), source: boundarySource, mineSource: mineSourceOf(project) }); // mineGrid: #2586; tie: #2587; source: #2684
      // TASKS.csv #2122 (review #2013, Woodjam) — points are not a boundary or a claim: 8 collars became an empty '0 part(s)' boundary,
      // 691 an empty 'Active' claim of 0 ha
      if (!r.polylines.length) throw new Error(parsed.geomType === "point"
        ? tr("it holds points, not lines or polygons: import collars in the 3D View, samples in Geochem, or any points as a map layer in Surface Geology.")
        : tr("no lines or polygons were found in it."));
      if (name.endsWith(".shp") && !parts.prj && !parsed.prjWkt && !r.mineGrid /* #2586 */ && !boundarySource /* #2684 */) r.note = tr("no .prj was read with it (select the .zip, or the .prj with the .shp): the coordinates were taken as EPSG:{dst}, check where it lies", { dst: project?.epsg });
      return r;
    }
    if (name.endsWith(".gpkg")) {
      checkGpkgSize(file); // #1716
      const buf = await file.arrayBuffer();
      const { layers } = await parseGeoPackage(buf);
      // TASKS.csv #1970 — every table with lines or polygons (only the first table with features was read, the rest left out unsaid)
      const parts = [];
      for (const layer of layers) {
        if (!layer.features.length) continue;
        const r = await vectorToBoundaryPolylines(layer, projectTargetEpsg(project), { mineGrid: mineGridOf(project), collars, tie: tieOf(project), source: boundarySource, mineSource: mineSourceOf(project) }); // #2586; tie: #2587; source: #2684
        if (r.polylines.length) parts.push({ ...r, table: layer.name });
      }
      if (!parts.length) throw new Error(tr("No usable features found in this GeoPackage."));
      return parts.length === 1 ? parts[0] : { multi: parts };
    }
    return null; // not a vector format this helper handles — caller falls back to .ply/.dxf
  }
  const importBoundaries = async (fileList) => {
    const files = groupShapefileParts(Array.from(fileList || []).filter(Boolean)).files; // #2121 — a .shp's .prj / .dbf / .cpg go with it
    if (!files.length) return;
    setBoundaryError(null);
    let imported = 0;
    const failed = [], dxfNotes = [], solids = []; // dxfNotes: #550; solids: #1503
    for (const file of files) {
      try {
        const shapePolylines = await shapeFileToPolylines(file);
        if (shapePolylines?.multi) { // #1970 — a GeoPackage with several tables: one boundary per table
          for (const p of shapePolylines.multi) {
            addBoundary({ name: `${fileStem(file.name)}: ${p.table}`, polylines: p.polylines, closedFlags: p.closedFlags, ...(p.partNames ? { partNames: p.partNames } : {}), elevation: boundaryElevation }); // fileStem, partNames: #1767
            imported++;
            if (p.note) dxfNotes.push(`${file.name}: ${p.table}: ${p.note}`);
          }
          continue;
        }
        if (!shapePolylines && /\.dxf$/i.test(file.name)) {
          // TASKS.csv #408 — one boundary per DXF layer, keeping 3D elevations.
          const specs = dxfToBoundaries(await file.text(), file.name);
          const st = await plainSourceTransform(); // #2684
          if (st?.note) dxfNotes.push(`${file.name}: ${st.note}`);
          specs.forEach((sp) => { addBoundary({ ...sp, ...(st ? { polylines: st.map(sp.polylines) } : {}), elevation: boundaryElevation }); imported++; });
          const sk = dxfSkippedText(specs[0]?.dxfSkipped); // #550 — say what was left out
          if (sk || specs[0]?.dxfZerosDropped) dxfNotes.push(`${file.name}: ${[specs[0]?.dxfZerosDropped ? "every string had elevation 0, read as a 2D plan" : "", sk].filter(Boolean).join("; ")}`);
          continue;
        }
        let polylines, closedFlags, partNames;
        if (shapePolylines) {
          ({ polylines, closedFlags, partNames } = shapePolylines); // partNames: #1767
          if (shapePolylines.note) dxfNotes.push(`${file.name}: ${shapePolylines.note}`); // #1035 — the CRS said
        } else {
          const text = await file.text();
          ({ polylines } = parsePLYBoundary(text));
          const st = await plainSourceTransform(); // #2684
          if (st) { polylines = st.map(polylines); if (st.note) dxfNotes.push(`${file.name}: ${st.note}`); }
        }
        addBoundary({ name: fileStem(file.name), polylines, ...(closedFlags ? { closedFlags } : {}), ...(partNames ? { partNames } : {}), elevation: boundaryElevation }); // fileStem, partNames: #1767 — the claims path already named by the stem
        imported++;
      } catch (err) {
        if (err.facesOnly) { solids.push(file); continue; } // TASKS.csv #1503 — 3DFACE / polyface only: a solid, for the 3D View's solid import
        failed.push(`${file.name}: ${err.message}`);
      }
    }
    // TASKS.csv #1503 (review #1497, Lawyers) — a face-only DXF (an inversion isosurface) dropped here went nowhere: the error
    // sat in boundaryError, which only the Boundaries pane shows. The solid goes to the 3D View's importer (as the 3D View's own
    // drop does), and the message is shown where the user is: the banner under the ribbon when the Boundaries pane is not open.
    if (solids.length) { goToModule("viewer"); requestModuleAction("import-solid", { files: solids }); }
    let msg = imported ? tr("Imported {imported} boundary file(s) ({v} total).", { imported, v: boundaries.length + imported }) : "";
    if (solids.length) msg += `${msg ? " " : ""}${tr("{names}: only faces (a solid, not strings) — handed to the 3D View's solid import.", { names: solids.map((f) => f.name).join(", ") })}`;
    if (dxfNotes.length) msg += ` ${dxfNotes.join(" ")}.`; // #550
    if (failed.length) msg += tr("{v}Failed: {failed}", { v: msg ? " " : "", failed: failed.join("; ") });
    if (msg) (geoPane === "boundaries" ? setBoundaryError : setRasterError)({ info: (!!imported || !!solids.length) && !failed.length, text: msg }); // #1503 — visible on every pane
  };

  // TASKS.csv #126 — mineral claim/tenure layer, distinct from a generic boundary. QGIS-specialist and
  // Micromine-specialist audits both flagged the same gap: boundaries import fine, but there's nowhere
  // to track claim-specific attributes (tenure number, status, expiry) or see a claim's area — BC
  // Golden Triangle geologists track MTO claims constantly alongside drillhole data. Reuses `boundaries`
  // itself (same store collection, same .ply parser, same 3D rendering ViewerModule already has) rather
  // than a whole new store/render path — a claim IS a boundary, just tagged kind:"claim" with a few
  // extra fields the Boundaries UI below doesn't show and doesn't need to. Status drives a default
  // color (active/pending/expired) so a claim's standing is visible at a glance in the 3D view, same as
  // the rest of this app's status-implies-color conventions (e.g. QAQC-style pass/fail coloring).
  const claims = boundaries.filter((b) => b.kind === "claim");
  const nonClaimBoundaries = boundaries.filter((b) => b.kind !== "claim");
  const MAX_CLAIMS_PER_FILE = 300; // TASKS.csv #1970 — a province-wide tenure file is not a claim list for one property
  const claimStatusColor = (status) => status === "expired" ? "#d9534f" : status === "pending" ? "#e2a63c" : "#3ca65e";
  const importClaims = async (fileList) => {
    const files = groupShapefileParts(Array.from(fileList || []).filter(Boolean)).files; // #2121
    if (!files.length) return;
    setClaimMsg(null);
    let imported = 0;
    const failed = [], notes = [];
    for (const file of files) {
      try {
        const shapePolylines = await shapeFileToPolylines(file);
        const base = file.name.replace(/\.(ply|dxf|zip|shp|gpkg|kml|kmz|gpx|geojson|json)$/i, "");
        const addClaim = (c) => {
          addBoundary({ name: c.name, polylines: c.polylines, ...(c.closedFlags ? { closedFlags: c.closedFlags } : {}), elevation: boundaryElevation, kind: "claim", status: c.status || "active", tenureNumber: c.tenureNumber || "", expiryDate: c.expiryDate || "", color: claimStatusColor(c.status || "active") }); // status from the file: #2466
          imported++;
        };
        // TASKS.csv #2122 — a claim is an area: a file of open lines (the 9 IP lines became nine 0 ha 'claims') goes to Boundaries instead
        if (shapePolylines && (shapePolylines.multi || [shapePolylines]).every((p) => p.closedFlags?.length && p.closedFlags.every((f) => !f))) throw new Error(tr("it holds open lines, not polygons: a claim is an area. Import it as a boundary."));
        if (shapePolylines) {
          // TASKS.csv #1970 — a tenure file holds one feature per claim: one claim each (tenure number, name, good-to date from the
          // attributes), every GeoPackage table; a file of more than MAX_CLAIMS_PER_FILE features stays one claim and says so
          for (const p of shapePolylines.multi || [shapePolylines]) {
            const label = shapePolylines.multi ? `${base}: ${p.table}` : base;
            if (p.note) notes.push(`${file.name}: ${p.note}`); // #1035
            const split = claimsFromVector(p, label, MAX_CLAIMS_PER_FILE);
            if (split) { split.forEach(addClaim); continue; }
            addClaim({ name: label, polylines: p.polylines, closedFlags: p.closedFlags });
            const nf = new Set(p.featureOf || []).size;
            if (nf > MAX_CLAIMS_PER_FILE) notes.push(tr("{name}: {n} features, more than {max}, imported as one claim", { name: label, n: nf.toLocaleString(), max: MAX_CLAIMS_PER_FILE }));
          }
        } else {
          const text = await file.text();
          const isDxf = /\.dxf$/i.test(file.name);
          const st = await plainSourceTransform(); // #2684
          if (st?.note) notes.push(`${file.name}: ${st.note}`);
          const pls = (isDxf ? parseDXF(text) : parsePLYBoundary(text)).polylines;
          addClaim({ name: base, polylines: st ? st.map(pls) : pls });
        }
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`);
      }
    }
    let msg = imported ? tr("Imported {imported} claim(s) ({v} total).", { imported, v: claims.length + imported }) : "";
    if (notes.length) msg += ` ${notes.join(" ")}.`; // #1035
    if (failed.length) msg += tr("{v}Failed: {failed}", { v: msg ? " " : "", failed: failed.join("; ") });
    if (msg) setClaimMsg({ info: !!imported && !failed.length, text: msg });
  };

  // TASKS.csv — Open Mining Format (OMF) import. User request: "let's build a tool to import OMF
  // files. I can export that from geosoft software" — see src/lib/omf.js's header comment for the
  // format details. A single .omf project can mix point/line/surface/volume elements together, so this
  // is one button that routes each parsed element to wherever it belongs: points/lines/triangulated
  // surfaces become generic omfObjects (rendered by ViewerModule, visibility/color list below, same
  // pattern as boundaries above); volume elements (tensor-grid block models) convert straight into the
  // existing voxel cell shape and go through addVoxelModel, reusing that renderer rather than a new one.
  // TASKS.csv #1596 — crop a block model to the drilled area (+ a buffer) before it is coarsened
  const [omfCrop, setOmfCrop] = useState({ on: false, buffer: "500" });
  const omfCropBox = () => {
    if (!omfCrop.on) return null;
    const b = Math.max(0, Number(omfCrop.buffer) || 0), pts = (collars || []).filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));
    if (!pts.length) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of pts) { if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y; }
    return { x0: x0 - b, x1: x1 + b, y0: y0 - b, y1: y1 + b };
  };
  const importOmf = async (file, opts = {}) => { // opts: { attribute, volume, volumesOnly } — another attribute of one volume (#1970)
    if (!file) return;
    { const crop = omfCropBox(); if (crop) opts = { ...opts, crop }; } // #1596
    setOmfError(null);
    setOmfBusy(true);
    try {
      const buf = await file.arrayBuffer();
      // TASKS.csv #637 — the element conversion lives in lib/omfImport.js (shared with the Woodjam sample project)
      const res = await omfToProjectObjectsAsync(buf, effectiveMaxCells, opts);
      // TASKS.csv #1202 — pillar 3: a budget the geologist raised once should not fill a modest laptop unasked (about 0.4 GB per million blocks, as the budget's own tooltip says)
      const blocks = res.voxelModels.reduce((n, m) => n + (m.cells?.length || 0), 0);
      if (blocks > 500000 && !window.confirm(tr("\"{name}\" holds {n} blocks, about {gb} GB of memory while it is open. A modest laptop can slow down or run out. Import it? (Lowering the cell budget above coarsens it.)", { name: file.name, n: blocks.toLocaleString(), gb: (blocks * 0.4e-6).toFixed(1) }))) { setOmfError({ info: true, text: tr("\"{name}\" was not imported.", { name: file.name }) }); return; }
      const pointsCount = res.omfObjects.filter((o) => o.kind === "points").length, linesCount = res.omfObjects.filter((o) => o.kind === "lines").length;
      const surfacesCount = res.omfObjects.filter((o) => o.kind === "surface").length, volumesCount = res.voxelModels.length;
      res.omfObjects.forEach((o) => addOmfObject(o));
      res.voxelModels.forEach((m) => addVoxelModel(m));
      const skipped = res.skipped, coarsenNotes = res.notes;
      const parts = [];
      if (pointsCount) parts.push(tr("{pointsCount} point set(s)", { pointsCount }));
      if (linesCount) parts.push(tr("{linesCount} line set(s)", { linesCount }));
      if (surfacesCount) parts.push(tr("{surfacesCount} surface(s)", { surfacesCount }));
      if (volumesCount) parts.push(tr("{volumesCount} block model(s)", { volumesCount }));
      let msg = parts.length ? tr("Imported \"{name}\" — {parts}.", { name: file.name, parts: parts.join(", ") }) : tr("\"{name}\" parsed but nothing usable was found.", { name: file.name });
      if (coarsenNotes.length) msg += ` ${coarsenNotes.join(" ")}`;
      if (!opts.volume) { // #1970 — a volume's other numeric attributes (two inversion iterations, conductivity and chargeability)
        setOmfChoices(res.choices?.length ? { file, choices: res.choices } : null); setOmfPick({});
        (res.choices || []).forEach((c) => { msg += tr(" \"{volume}\" shows {shown}; the file also holds {others}: pick another below to add it as a block model.", { volume: c.volume, shown: c.shown, others: c.attributes.filter((a) => a !== c.shown).join(", ") }); });
      }
      if (skipped.length) msg += tr(" Skipped: {skipped}.", { skipped: skipped.join("; ") });
      msg += farNote(res.voxelModels.flatMap((m) => m.cells || [])); // #1427
      setOmfError({ info: parts.length > 0, text: msg });
    } catch (err) {
      setOmfError({ info: false, text: err.message });
    } finally {
      setOmfBusy(false);
    }
  };

  // Geosoft .xyz line/profile import — unlike every other importer here, the column layout isn't
  // fixed (a real airborne survey export can carry a dozen+ geophysics channels alongside X/Y), so
  // this is a two-step flow: parse the file and show a column-picker (X/Y auto-detected by name where
  // possible) rather than guess which channel the user wants as the point-cloud "value". Confirmed
  // rows feed the SAME layers.geophys_pts layer the CSV importer above uses (mergeLayer), reusing its
  // existing point-cloud rendering rather than introducing a new layer kind for what's structurally
  // the same shape (world x/y/z + a scalar value).
  const XY_NAME_HINTS = { x: ["x", "east", "easting", "lon", "long", "longitude"], y: ["y", "north", "northing", "lat", "latitude"] };
  const guessColumn = (columns, hints) => columns.find((c) => hints.some((h) => c.toLowerCase() === h)) || columns.find((c) => hints.some((h) => c.toLowerCase().includes(h))) || "";
  // TASKS.csv #1583 — the rover readings' signal quality (a GEM sq column) and an along-line despike, chosen in the picker:
  // a quality floor of 50 (the base-station reader's) when the file has such a column, the despike off until ticked
  // TASKS.csv #1351 — a CSV too big to read whole: its header and first rows choose the columns, the reading count is estimated from
  // their mean length, and the picker offers how many readings to keep (the batch import's own rule as the default); Import streams it
  const setTaskProgress = useSetTaskProgress();
  const openStreamedCsv = async (file) => {
    const sn = sniffTable(await file.slice(0, 512 * 1024).text().catch(() => ""));
    if (!sn || !sn.sample.length) { setError(tr("\"{name}\" is {v} MB and its first lines have no header GeoStrix can read (a delimited line of column names).", { name: file.name, v: (file.size / 1e6).toFixed(0) })); return; }
    const estimate = estimateRows(file.size, sn), keepEvery = suggestKeepEvery(estimate, undefined, (layers.geophys_pts || []).length);
    const cols = guessGeophysColumns(sn.headers);
    setXyzPending({ fileName: file.name, columns: sn.headers, rows: sn.sample, source: "csv", xCol: cols.x, yCol: cols.y, zCol: cols.z, valueCol: cols.value, lineCol: cols.line, fidCol: cols.fid, labelCol: cols.label, ...cleaningDefaults(sn.headers),
      stream: { file, delimiter: sn.delimiter, headers: sn.headers, skipLines: sn.headerLine + 1, estimate, keepEvery } });
    setError({ info: true, text: tr("\"{name}\" is {v} MB, about {rows} readings: too big to read whole on most computers. Check the columns and how many readings to keep below, then Import: the file is read in pieces and only the kept readings and columns are held.", { name: file.name, v: (file.size / 1e6).toFixed(0), rows: estimate.toLocaleString() }) });
  };
  const confirmStreamed = async () => {
    const p = xyzPending, st = p.stream;
    if (!p.xCol || !p.yCol || !p.valueCol) { setXyzError({ info: false, text: tr("Pick an X, Y, and Value column before importing.") }); return; }
    const keep = [...new Set([p.xCol, p.yCol, p.zCol, p.valueCol, p.lineCol, p.fidCol, p.labelCol, p.sqCol].filter(Boolean))];
    const label = tr("Reading {name}", { name: p.fileName });
    setXyzPending((q) => (q ? { ...q, streaming: true } : q));
    try {
      const onProgress = (f) => setTaskProgress?.({ label, pct: Math.round(f * 100) });
      const { rows, seen } = st.kind === "gdf" ? await streamGdfRows(st.file, { layout: st.layout, keep, every: st.keepEvery, onProgress }) // #1990
        : st.kind === "xyz" // #1351 — a Geosoft .xyz, by parseXYZ's rules
        ? await streamXyzRows(st.file, { columns: st.columns, keep, every: st.keepEvery, onProgress })
        : await streamTableRows(st.file, { delimiter: st.delimiter, headers: st.headers, keep, every: st.keepEvery, skipLines: st.skipLines, onProgress });
      setTaskProgress?.(null);
      confirmImportXYZ(rows, st.keepEvery > 1 ? tr(" Kept 1 in {n} of the file's {seen} readings (read in pieces: it is {v} MB).", { n: st.keepEvery, seen: seen.toLocaleString(), v: (st.file.size / 1e6).toFixed(0) }) : tr(" Read in pieces ({seen} readings, {v} MB).", { seen: seen.toLocaleString(), v: (st.file.size / 1e6).toFixed(0) }));
    } catch (err) {
      setTaskProgress?.(null);
      setXyzPending((q) => (q ? { ...q, streaming: false } : q));
      setXyzError({ info: false, text: tr("Could not read {name}: {message}", { name: p.fileName, message: err.message }) });
    }
  };
  const cleaningDefaults = (columns) => { const sqCol = guessQualityColumn(columns); return { sqCol, minQuality: sqCol ? 50 : 0, despike: false }; };
  const cleanRows = (rows, pending, valueOf, lineOf) => {
    const q = filterSignalQuality(rows, pending.sqCol, pending.minQuality);
    const d = pending.despike ? despikeAlongLines(q.rows, valueOf, lineOf) : { rows: q.rows, dropped: 0 };
    return { rows: d.rows, lowQuality: q.dropped, spikes: d.dropped };
  };
  const cleaningNote = (c) => (c.lowQuality || c.spikes ? " " + [c.lowQuality ? tr("Dropped {n} reading(s) with signal quality under {q}.", { n: c.lowQuality.toLocaleString(), q: xyzPending?.minQuality ?? 50 }) : "", c.spikes ? tr("Dropped {n} spike(s) more than 6 MAD from the running median along their line.", { n: c.spikes.toLocaleString() }) : ""].filter(Boolean).join(" ") : "");
  const importXYZFile = async (file) => {
    if (!file) return;
    setXyzError(null);
    { const refusal = await textTableRefusal(file); if (refusal) { setXyzError({ info: false, text: refusal }); return; } } // #2847
    try {
      if (file.size > STREAM_FROM_BYTES) { // TASKS.csv #1351 — header and sample from the first part; Import streams the rest, thinned
        const head = await headText(file);
        const { columns, rows: sample } = parseXYZ(head);
        const g = guessXyzChannels(columns, sample), estimate = Math.round((sample.length / Math.max(1, head.length)) * file.size);
        setXyzPending({ fileName: file.name, columns, rows: sample, xCol: guessColumn(columns, XY_NAME_HINTS.x), yCol: guessColumn(columns, XY_NAME_HINTS.y), zCol: g.z, valueCol: g.value, header: gemHeaderInfo(head), headerEpsg: gemHeaderEpsg(head) || geosoftHeaderEpsg(head) /* #2832 */, ...cleaningDefaults(columns),
          stream: { file, kind: "xyz", columns, estimate, keepEvery: suggestKeepEvery(estimate, undefined, (layers.geophys_pts || []).length) } });
        setXyzError({ info: true, text: tr("\"{name}\" is {v} MB, about {rows} readings: too big to read whole on most computers. Check the columns and how many readings to keep below, then Import: the file is read in pieces and only the kept readings and columns are held.", { name: file.name, v: (file.size / 1e6).toFixed(0), rows: estimate.toLocaleString() }) });
        return;
      }
      const text = await file.text();
      const { columns, rows: parsedRows } = parseXYZ(text);
      const g = guessXyzChannels(columns, parsedRows); // #600 — first guesses; the picker still shows every column
      setXyzPending({
        fileName: file.name,
        columns,
        rows: parsedRows,
        xCol: guessColumn(columns, XY_NAME_HINTS.x),
        yCol: guessColumn(columns, XY_NAME_HINTS.y),
        zCol: g.z,
        valueCol: g.value,
        header: gemHeaderInfo(text), // #610 — survey date / UTC offset, for matching base-station files
        headerEpsg: gemHeaderEpsg(text) || geosoftHeaderEpsg(text), // #1329; a Geosoft header: #2832
        ...cleaningDefaults(columns), // #1583
      });
    } catch (err) {
      setXyzError({ info: false, text: tr("Could not parse {name}: {message}", { name: file.name, message: err.message }) });
    }
  };
  // TASKS.csv #1329 — several files: one set of columns for all, read one at a time so nothing holds every raw row at once. GPS files in the selection go with the surveys named like them.
  // TASKS.csv #1990 — an ASEG-GDF2 survey: the .dfn names the columns and their widths, the .dat holds the records (streamed when big)
  const importGdf = async ({ dfn, dat }) => {
    setXyzError(null);
    try {
      const layout = parseDfn(await dfn.text());
      if (!layout.columns.length) throw new Error(tr("{name} defines no data fields", { name: dfn.name }));
      const big = dat.size > STREAM_FROM_BYTES;
      const text = big ? await headText(dat) : await dat.text();
      const { rows, seen } = parseGdfText(text, layout);
      if (!rows.length) throw new Error(tr("no line of {name} matches the record layout in {dfn}", { name: dat.name, dfn: dfn.name }));
      const columns = layout.columns, g = guessXyzChannels(columns, rows);
      const estimate = big ? Math.round((seen / Math.max(1, text.length)) * dat.size) : seen;
      setXyzPending({ fileName: dat.name, columns, rows, source: "csv", xCol: guessColumn(columns, XY_NAME_HINTS.x), yCol: guessColumn(columns, XY_NAME_HINTS.y), zCol: g.z, valueCol: g.value,
        lineCol: columns.find((c) => /^(line|line_?no|lineno|flight|flight_?line)$/i.test(c)) || "", ...cleaningDefaults(columns),
        ...(big ? { stream: { file: dat, kind: "gdf", layout, columns, estimate, keepEvery: suggestKeepEvery(estimate, undefined, (layers.geophys_pts || []).length) } } : {}) });
      if (big) setXyzError({ info: true, text: tr("\"{name}\" is {v} MB, about {rows} readings: too big to read whole on most computers. Check the columns and how many readings to keep below, then Import: the file is read in pieces and only the kept readings and columns are held.", { name: dat.name, v: (dat.size / 1e6).toFixed(0), rows: estimate.toLocaleString() }) });
    } catch (err) {
      setXyzError({ info: false, text: tr("Could not parse {name}: {message}", { name: dat?.name || dfn?.name, message: err.message }) });
    }
  };
  // TASKS.csv #1992 — a GOCAD VSet (.vs): its points (Z as elevation, ZPOSITIVE Depth turned round) and their PROPERTIES as columns, into
  // the same column picker. Several VSets in one file are one survey with a 'set' column (their names).
  const importVSet = async (file) => {
    setXyzError(null);
    try {
      const { parseGocad } = await import("../lib/gocad.js");
      const sets = parseGocad(await file.text()).filter((o) => o.type.toLowerCase() === "vset" && o.points.length);
      if (!sets.length) throw new Error(tr("no GOCAD VSet with points in it"));
      const props = [...new Set(sets.flatMap((o) => o.properties))];
      const columns = ["X", "Y", "Z", ...props, ...(sets.length > 1 ? ["set"] : [])];
      const rows = sets.flatMap((o) => o.points.map((pt) => { const r = { X: pt.x, Y: pt.y, Z: pt.z }; o.properties.forEach((k, i) => { r[k] = pt.values[i]; }); if (sets.length > 1) r.set = o.name; return r; }));
      const g = guessXyzChannels(columns.filter((c) => c !== "set"), rows);
      setXyzPending({ fileName: file.name, columns, rows, source: "csv", xCol: "X", yCol: "Y", zCol: "Z", valueCol: props.includes(g.value) ? g.value : props[0] || "Z", lineCol: "", ...cleaningDefaults(columns) });
    } catch (err) {
      setXyzError({ info: false, text: tr("Could not parse {name}: {message}", { name: file.name, message: err.message }) });
    }
  };
  const importXYZFiles = async (fileList) => {
    const all = Array.from(fileList || []);
    { const pair = gdfPair(all); if (pair) { importGdf(pair); return; } } // #1990
    { const vs = all.find((f) => /\.vs$/i.test(f.name)); if (vs) { importVSet(vs); return; } } // #1992
    const gpsFiles = all.filter((f) => /\.(txt|gpx|wpt)$/i.test(f.name)), files = all.filter((f) => !gpsFiles.includes(f));
    if (!files.length) { setXyzError({ info: false, text: tr("Select at least one survey file with the GPS file.") }); return; }
    if (files.length === 1 && !gpsFiles.length) { importXYZFile(files[0]); return; }
    setXyzError(null);
    { const refused = (await Promise.all(all.map(textTableRefusal))).filter(Boolean); if (refused.length) { setXyzError({ info: false, text: refused.join(" ") }); return; } } // #2847
    try {
      const text = await files[0].text();
      const { columns, rows: parsedRows } = parseXYZ(text);
      const g = guessXyzChannels(columns, parsedRows);
      const bytes = files.reduce((a, f) => a + f.size, 0), estimate = Math.round((parsedRows.length / Math.max(1, files[0].size)) * bytes);
      setXyzPending({ fileName: files[0].name, columns, rows: parsedRows, xCol: guessColumn(columns, XY_NAME_HINTS.x), yCol: guessColumn(columns, XY_NAME_HINTS.y), zCol: g.z, valueCol: g.value, header: gemHeaderInfo(text), headerEpsg: gemHeaderEpsg(text), ...cleaningDefaults(columns) /* #1583 */,
        batch: { files, gpsFiles, estimate, keepEvery: suggestKeepEvery(estimate, 100000, (layers.geophys_pts || []).length), timeCol: columns.find((c) => /^time$/i.test(c)) || columns.find((c) => /time/i.test(c)) || null, bases: [] } }); // #1582 — counts what is already drawn; timeCol / bases: #1585
    } catch (err) {
      setXyzError({ info: false, text: tr("Could not parse {name}: {message}", { name: files[0].name, message: err.message }) });
    }
  };
  // TASKS.csv #1585 — base-station files for the whole batch: each rover file is corrected against the bases of its own day
  const addBatchBases = async (fileList) => {
    const files = Array.from(fileList || []); if (!files.length) return;
    const parsed = [], failed = [];
    for (const f of files) { try { parsed.push(parseBaseStation(await f.text(), { name: f.name })); } catch (err) { failed.push(err.message); } }
    setXyzPending((p) => (p?.batch ? { ...p, batch: { ...p.batch, bases: [...p.batch.bases.filter((b) => !parsed.some((n) => n.name === b.name)), ...parsed] } } : p));
    if (failed.length) setXyzError({ info: false, text: tr("Not used: {v}", { v: failed.join("; ") }) });
  };
  const confirmBatchXYZ = async () => {
    const { xCol, yCol, zCol, valueCol, batch } = xyzPending;
    if (!xCol || !yCol || !valueCol) { setXyzError({ info: false, text: tr("Pick an X, Y, and Value column before importing.") }); return; }
    const { files, gpsFiles, keepEvery } = batch;
    const merged = files.length > 5; // each file its own survey and colour scale when few; a day's walking files are one survey
    const surveyName = merged ? batchSurveyName(files.map((f) => f.name)) : null;
    const placers = new Map(), failed = [], collected = [];
    let target = project?.epsg, asked = false, read = 0, kept = 0, lowQuality = 0, spikes = 0; // lowQuality, spikes: #1583
    const cleaning = { sqCol: xyzPending.sqCol, minQuality: xyzPending.minQuality, despike: xyzPending.despike }, minQ = xyzPending.minQuality;
    const bases = batch.bases || [], timeCol = batch.timeCol; // #1585
    let dcFiles = 0, dcUsed = 0, dcLeft = 0; const noBase = []; // #1585
    let mineNote = ""; // #2684
    setXyzPending(null);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setXyzError({ info: true, text: tr("Importing {name} ({i} of {n})…", { name: f.name, i: i + 1, n: files.length }) });
      await new Promise((r) => setTimeout(r, 0));
      try {
        const text = await f.text();
        const { columns, rows: raw } = parseXYZ(text);
        if (!columns.includes(xCol) || !columns.includes(yCol) || !columns.includes(valueCol)) throw new Error(tr("it has no {x}, {y} or {v} column.", { x: xCol, y: yCol, v: valueCol }));
        read += raw.length;
        const base = f.name.replace(/\.[^.]+$/, "");
        const cleaned = cleanRows(raw, cleaning, (r) => r[valueCol], (r) => r._line ?? null); // #1583
        lowQuality += cleaned.lowQuality; spikes += cleaned.spikes;
        // #1585 — the day's base(s): by the header date, else the file name's; a reading the bases do not cover is left out, not guessed
        if (bases.length) {
          const day = gemHeaderInfo(text).date || fileNameDate(f.name);
          const dayBases = day ? bases.filter((b) => b.date === day) : [];
          if (dayBases.length && timeCol && columns.includes(timeCol)) {
            const res = diurnalCorrect(cleaned.rows.map((r) => r[timeCol]), cleaned.rows.map((r) => r[valueCol]), dayBases);
            cleaned.rows = cleaned.rows.map((r, k) => ({ ...r, [valueCol]: res.corrected[k] }));
            dcFiles++; dcUsed += res.used; dcLeft += res.outside + res.gaps + res.noTime;
          } else noBase.push(day ? `${f.name} (${day})` : `${f.name} (${tr("day unknown")})`);
        }
        let mapped = cleaned.rows.map((r) => ({ x: r[xCol], y: r[yCol], z: zCol && Number.isFinite(r[zCol]) ? r[zCol] : null, value: r[valueCol], ...(r._line != null ? { line: merged ? `${base} ${r._line}` : String(r._line), label: `Line ${r._line}` } : {}), _src: surveyName || f.name }))
          .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.value) && !(r.x === 0 && r.y === 0)); // #538 — no GPS fix
        mapped = everyNth(mapped, keepEvery);
        const gpsName = pairGpsFile(f.name, gpsFiles.map((g) => g.name));
        let mineSrc = isMineSource(geophysSourceEpsg); // #2684
        let srcEpsg = mineSrc ? null : geophysSourceEpsg || gemHeaderEpsg(text) || null;
        if (gpsName) {
          if (!placers.has(gpsName)) { const sf = parseStationFile(await gpsFiles.find((g) => g.name === gpsName).text(), gpsName), pairs = gridPairs(sf.lines); placers.set(gpsName, { placer: stationPlacer(pairs), pairs, epsg: sf.epsg }); }
          const pl = placers.get(gpsName);
          mapped = mapped.map((r) => { const p = pl.placer.place(r.x, r.y); return p ? { ...r, x: p.x, y: p.y, z: r.z ?? nearestStationZ(pl.pairs, r.x, r.y) } : null; }).filter(Boolean);
          srcEpsg = pl.epsg || srcEpsg;
          if (pl.epsg) mineSrc = false; // the GPS file's own CRS places them
        }
        if (mineSrc) { const m = mineRowsToProject(mapped, project); mapped = m.rows; mineNote = m.note.trim(); }
        if (srcEpsg && !asked) { asked = true; const adopted = askAdoptCrs({ isEmpty: projectIsEmpty, currentEpsg: project?.epsg, declaredEpsg: srcEpsg, fileName: f.name, at: isGeographicCrs(Number(srcEpsg)) ? medianLonLat(mapped) : null, crsSet: project?.crsSet === true }); if (adopted) { setEpsg(adopted); target = adopted; } } // at, crsSet: #2833
        if (srcEpsg && target && Number(srcEpsg) !== Number(target)) mapped = mapped.map((r) => { const p = reprojectXY(r.x, r.y, srcEpsg, target); return p ? { ...r, x: p.x, y: p.y } : r; });
        kept += mapped.length;
        collected.push(mapped);
      } catch (err) {
        failed.push(`${f.name}: ${err.message}`);
      }
    }
    const points = collected.flat();
    if (points.length) {
      setLayers((l) => ({ ...l, geophys_pts: replaceSurveyPoints(l.geophys_pts, points).rows }));
      const g = guessSurveyMethodFrom(valueCol, [], { instrument: xyzPending.header?.instrument, columns: xyzPending.columns }); // hints: #1586
      if (g) for (const src of new Set(points.map((r) => r._src))) if (!geophysSurveys[src]?.method) updateGeophysSurvey(src, { method: g, units: SURVEY_METHODS[g].units });
    }
    setXyzError({ info: !failed.length, text: [
      tr("Imported {kept} point(s) from {n} of {total} files ({read} readings in them).", { kept: kept.toLocaleString(), n: files.length - failed.length, total: files.length, read: read.toLocaleString() }),
      mineNote, // #2684
      keepEvery > 1 ? tr("Kept 1 reading in {n}: a short anomaly between kept readings is not shown.", { n: keepEvery }) : "",
      lowQuality ? tr("Dropped {n} reading(s) with signal quality under {q}.", { n: lowQuality.toLocaleString(), q: minQ }) : "", // #1583
      spikes ? tr("Dropped {n} spike(s) more than 6 MAD from the running median along their line.", { n: spikes.toLocaleString() }) : "",
      // #1585 — said either way: corrected against which days, or not corrected at all
      bases.length ? tr("Diurnal-corrected {files} of {n} files against their day's base ({used} readings; {left} left out: outside the base coverage, in a gap over a minute or without a time).", { files: dcFiles, n: files.length - failed.length, used: dcUsed.toLocaleString(), left: dcLeft.toLocaleString() }) : "",
      bases.length && noBase.length ? tr("No base for {v}: imported raw.", { v: noBase.join(", ") }) : "",
      !bases.length && timeCol && xyzPending.source !== "csv" ? tr("Not diurnal-corrected: no base-station files were loaded.") : "",
      failed.length ? tr("Problems: {failed}", { failed: failed.join("; ") }) : "",
    ].filter(Boolean).join(" ") });
  };
  // TASKS.csv #1326 — a survey in its own grid, placed from the GPS file naming the same stations
  const placeLocalGrid = async (file) => {
    if (!file || !xyzPending) return;
    try {
      const sf = parseStationFile(await file.text(), file.name);
      const pairs = gridPairs(sf.lines), placer = stationPlacer(pairs);
      if (!placer.lines) throw new Error(tr("{name} has no stations named by grid position, like \"9000N 4650E\".", { name: file.name }));
      const { fileName } = xyzPending;
      setXyzPending((p) => ({ ...p, grid: { name: file.name, placer, pairs, epsg: sf.epsg } }));
      setXyzError({ info: true, text: tr("{fileName} will be placed from {name}: {stations} stations on {lines} lines. Readings follow their own line between stations.", { fileName, name: file.name, stations: placer.stations, lines: placer.lines }) });
    } catch (err) {
      setXyzError({ info: false, text: tr("Could not read {name}: {message}", { name: file.name, message: err.message }) });
    }
  };
  const confirmImportXYZ = (streamedRows = null, streamNote = "") => {
    if (!xyzPending) return;
    if (xyzPending.batch) { confirmBatchXYZ(); return; } // #1329
    if (xyzPending.stream && !Array.isArray(streamedRows)) { confirmStreamed(); return; } // #1351 — read the whole file first, thinned
    const { fileName, xCol, yCol, zCol, valueCol } = xyzPending;
    const parsedRows = Array.isArray(streamedRows) ? streamedRows : xyzPending.rows;
    if (!xCol || !yCol || !valueCol) {
      setXyzError({ info: false, text: tr("Pick an X, Y, and Value column before importing.") });
      return;
    }
    // TASKS.csv #1583 — the signal-quality floor and the despike, before anything else reads the values
    const cleaned = cleanRows(parsedRows, xyzPending, (r) => Number(r[valueCol]), (r) => (xyzPending.source === "csv" ? (xyzPending.lineCol ? r[xyzPending.lineCol] : null) : r._line ?? null));
    const cleanedRows = cleaned.rows;
    // TASKS.csv #2395 — a multi-channel radiometric file: one survey per ticked channel (file · channel), and the eU/eTh, K/eTh ratios
    const rad = xyzPending.channels ? radiometricChannels(xyzPending.channels) : null;
    const jobs = rad && xyzPending.source === "csv" ? [
      ...tickedChannels(xyzPending.channels, xyzPending.channelPick).map((c) => ({ src: channelKey(fileName, c.col), col: c.col, method: c.method })), // #2081 any kind of measurement; #2840 a column added under Value
      ...(xyzPending.channelRatios ? ratioJobs(rad).map((r) => ({ src: channelKey(fileName, r.label), ratio: r, method: r.method })) : []),
    ] : null;
    if (jobs && !jobs.length) { setXyzError({ info: false, text: tr("Tick at least one channel to import.") }); return; }
    // TASKS.csv #484 — a CSV that fell through to the picker: same row mapping as the automatic path
    const asPoints = (srcRows, col, src) => rowsToGeophysPoints(srcRows, { x: xCol, y: yCol, z: zCol, value: col, line: xyzPending.lineCol, fid: xyzPending.fidCol, label: xyzPending.labelCol })
      .map((r) => ({ ...r, _src: src }))
      .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.value));
    let mapped = jobs
      ? jobs.flatMap((j) => (j.ratio ? asPoints(cleanedRows.map((r) => ({ ...r, __ratio: ratioOf(r, j.ratio) })), "__ratio", j.src) : asPoints(cleanedRows, j.col, j.src)))
      : xyzPending.source === "csv"
      ? asPoints(cleanedRows, valueCol, fileName)
      : cleanedRows
      .map((r) => ({
        // TASKS.csv #365 — no z column means "elevation not recorded" (null), not the mean collar elevation.
        x: r[xCol], y: r[yCol], z: zCol && Number.isFinite(r[zCol]) ? r[zCol] : null, value: r[valueCol],
        label: r._line !== null && r._line !== undefined ? `Line ${r._line}` : undefined,
        ...(r._line !== null && r._line !== undefined ? { line: String(r._line) } : {}), // #327
        _src: fileName,
      }))
      .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.value));
    // TASKS.csv #538 (found testing) — a GPS rover logs X = Y = 0 while it has no fix (Lawyers 2021-06-19: 5 readings,
    // 0 satellites); taken as real they sat 6,000 km from the survey and made its extent (and any grid) absurd.
    const noFix = mapped.filter((r) => r.x === 0 && r.y === 0).length;
    if (noFix) mapped = mapped.filter((r) => !(r.x === 0 && r.y === 0));
    if (!mapped.length) {
      setXyzError({ info: false, text: tr("None of the {parsedRows} row(s) had usable values in the chosen columns (likely all \"*\"/no-data for this combination) — try different columns.", { parsedRows: parsedRows.length }) });
      return;
    }
    let reprojectNote = streamNote; // #1351
    // #1326 — the local grid first: its GPS file says what CRS the result is in
    const placed = xyzPending.grid;
    if (placed) {
      let off = 0, none = 0;
      mapped = mapped.map((r) => {
        const p = placed.placer.place(r.x, r.y);
        if (!p) { none++; return null; }
        if (!p.onLine) off++;
        return { ...r, x: p.x, y: p.y, z: r.z ?? nearestStationZ(placed.pairs, r.x, r.y) };
      }).filter(Boolean);
      reprojectNote += tr(" Placed from {name}.", { name: placed.name });
      if (off) reprojectNote += tr(" {n} reading(s) have no GPS stations on their line: placed by a fit across the grid, good to about {rms} m.", { n: off.toLocaleString(), rms: Math.round(placed.placer.fit?.rms ?? 0) });
      if (none) reprojectNote += tr(" Left out {n} reading(s) that could not be placed.", { n: none.toLocaleString() });
    }
    // an empty project is offered the GPS file's CRS, as every other import offers its own (#607): its placeholder zone can be the wrong one
    const mineSrc = !placed?.epsg && isMineSource(geophysSourceEpsg); // #2684 — 'Local mine grid' as the Source CRS (a GPS file's own CRS wins)
    if (mineSrc) { const m = mineRowsToProject(mapped, project); mapped = m.rows; reprojectNote += m.note; }
    // TASKS.csv #2832 — nothing stated and X / Y that can only be degrees in a projected project: read as WGS 84 longitude / latitude, and said
    const pickerDegrees = !placed?.epsg && !mineSrc && !geophysSourceEpsg && !xyzPending.headerEpsg && project?.crsSet !== false && !!project?.epsg && !isGeographicCrs(project.epsg) && xyLookLikeDegrees(xyzPending.rows, xyzPending.xCol, xyzPending.yCol);
    if (pickerDegrees) reprojectNote += " " + tr("Every X is within ±180 and every Y within ±90, so they were read as WGS 84 longitude / latitude; set the Source CRS if they are in another datum.");
    const statedEpsg = placed?.epsg || (mineSrc ? null : geophysSourceEpsg) || (mineSrc ? null : xyzPending.headerEpsg) || (pickerDegrees ? 4326 : null) || null; // headerEpsg: #1329 — a GEM file says, a Source CRS set by hand still wins; degrees: #2832
    // TASKS.csv #2833 — the stations' place for a CRS in degrees (the metric CRS there is offered, never the degrees themselves), and nothing asked
    // once the project's CRS was chosen (it was replaced by EPSG:4269 on OK)
    const adopted = statedEpsg ? askAdoptCrs({ isEmpty: projectIsEmpty, currentEpsg: project?.epsg, declaredEpsg: statedEpsg, fileName, at: isGeographicCrs(Number(statedEpsg)) ? medianLonLat(mapped) : null, crsSet: project?.crsSet === true }) : null;
    if (adopted) { setEpsg(adopted); reprojectNote += tr(" Project CRS set to EPSG:{epsg}.", { epsg: adopted }); }
    const targetEpsg = adopted || project?.epsg;
    const sourceEpsgNow = statedEpsg;
    if (sourceEpsgNow && targetEpsg && Number(sourceEpsgNow) !== Number(targetEpsg)) {
      const geophysSourceEpsg = sourceEpsgNow;
      let failed = 0;
      mapped = mapped.map((r) => {
        const p = reprojectXY(r.x, r.y, geophysSourceEpsg, targetEpsg);
        if (!p) { failed++; return r; }
        return { ...r, x: p.x, y: p.y };
      });
      reprojectNote += failed // += (#2832): it overwrote the notes before it (the degrees / header sentence, a GPS placement, 'Project CRS set to')
        ? tr(" Couldn't resolve a proj4 definition for EPSG:{geophysSourceEpsg} or EPSG:{epsg} — no reprojection happened.", { geophysSourceEpsg, epsg: targetEpsg })
        : tr(" Reprojected from EPSG:{geophysSourceEpsg} to the project's EPSG:{epsg}.", { geophysSourceEpsg, epsg: targetEpsg });
    }
    const replacedN = replaceSurveyPoints(rows, mapped).replaced; // #600 — re-import replaces, does not double
    setLayers((l) => ({ ...l, geophys_pts: replaceSurveyPoints(l.geophys_pts, mapped).rows }));
    if (jobs) for (const j of jobs) if (j.method && SURVEY_METHODS[j.method] && !geophysSurveys[j.src]?.method) updateGeophysSurvey(j.src, { method: j.method, units: SURVEY_METHODS[j.method].units }); // #2395; a channel whose name says nothing: #2081
    if (!jobs) { const g = guessSurveyMethodFrom(valueCol, mapped.map((r) => r.label), { instrument: xyzPending.header?.instrument, columns: xyzPending.columns }); if (g && !geophysSurveys[fileName]?.method) updateGeophysSurvey(fileName, { method: g, units: SURVEY_METHODS[g].units }); } // #1151; hints: #1586
    if (replacedN) reprojectNote += tr(" Replaced the {replacedN} point(s) of the earlier import of this file.", { replacedN: replacedN.toLocaleString() });
    const skipped = (jobs ? cleanedRows.length * jobs.length : cleanedRows.length) - mapped.length - noFix; // #538; #2395: per channel survey
    if (jobs) reprojectNote += tr(" As {k} survey(s): {list}.", { k: jobs.length, list: jobs.map((j) => j.src).join(", ") }); // #2395 — the no-fix readings are reported separately; #1583: after the cleaning
    if (noFix) reprojectNote += tr(" Left out {noFix} reading(s) at X = 0, Y = 0 (no GPS fix).", { noFix });
    const dcNote = /_dc$/.test(valueCol) && xyzPending.diurnalNote ? ` ${xyzPending.diurnalNote}` : ""; // #610
    setXyzError({ info: true, text: tr("Imported {mapped} point(s) from \"{fileName}\"{v}.{reprojectNote}{dcNote}", { mapped: mapped.length, fileName, v: skipped ? tr(" (skipped {skipped} row(s) with {v} values in the chosen columns)", { skipped, v: xyzPending.source === "csv" ? tr("blank or non-numeric") : tr("no-data \"*\"") }) : "", reprojectNote, dcNote }) + cleaningNote(cleaned) /* #1583 */ });
    setXyzPending(null);
    if (xyzPending.source === "csv") setError(null);
  };

  // TASKS.csv #28 — UBC-GIF tensor mesh (.msh) + model (.mod/.con/.den) import. Both files are picked
  // in one multi-file dialog and matched by extension (.msh is the mesh, whichever other file was
  // picked is the model) rather than a two-step wizard — a UBC mesh/model pair is always distributed
  // as exactly two files together, so this is the same click either way with less UI.
  // TASKS.csv #1806 — the top of a block model's non-air cells as a terrain (lib/terrainFromModel.js)
  const terrainFromModelTop = (model) => {
    const t = terrainFromBlockModel(model.cells);
    if (!t) { setVoxelError({ info: false, text: tr("\"{name}\" gives no terrain: fewer than 2 × 2 columns with a value.", { name: model.name }) }); return; }
    const name = tr("Top of {name} (block model)", { name: model.name });
    if (!confirmReplaceTerrain(terrain, name)) return; // #2554 — it replaced the loaded terrain, said only after the fact
    const replaced = replacedTerrainNote(terrain);
    addTerrain({ name, bbox: t.bbox, gridW: t.gridW, gridH: t.gridH, elevations: t.elevations, noDataMask: t.noDataMask, source: { kind: "top of a block model", model: model.name, columns: t.stats.columns, nodeM: t.stats.nodeM.map((v) => Math.round(v * 10) / 10) } });
    setVoxelError({ info: true, text: replaced + tr("Added the terrain \"{name}\": {w} × {h} nodes at {dx} × {dy} m from the top cell of {cols} column(s), {zmin} to {zmax} m{v}. It is the mesh's own ground, as fine as its columns and only where the mesh is{v2}. Samples with no elevation now sit on it; sections take its profile.", { name, w: t.gridW, h: t.gridH, dx: Math.round(t.stats.nodeM[0] * 10) / 10, dy: Math.round(t.stats.nodeM[1] * 10) / 10, cols: t.stats.columns.toLocaleString(), zmin: Math.round(t.stats.relief[0]), zmax: Math.round(t.stats.relief[1]), v: t.stats.empty ? tr(", {n} node(s) with no column marked as no ground", { n: t.stats.empty.toLocaleString() }) : "", v2: "" /* #2554: said by "Replaced the terrain" first */ }) });
  };
  // TASKS.csv #2726 — a GOCAD SGrid (.sg) chosen with its side files (points, properties): one block model per property it can read, its
  // nodes or cell centres resampled onto an east / north / up lattice (lib/gocadSgrid.js), then the Voxet path (#2632: voxetToUbc, the cell
  // budget's block-averaging, ubcMeshToCells)
  const importSgrid = async (fileList) => {
    const files = Array.from(fileList || []);
    const sg = files.find((f) => /\.sg$/i.test(f.name));
    if (!sg) { setVoxelError({ info: false, text: tr("Choose the .sg file together with the files it names (its points file and a file per property).") }); return; }
    setVoxelError(null); setVoxelBusy(true);
    try {
      const [sgl, vx] = await Promise.all([import("../lib/gocadSgrid.js"), import("../lib/gocadVoxet.js")]);
      const h = sgl.parseSgridHeader(await sg.text());
      const pf = vx.findPropFile({ file: h.pointsFile }, files);
      if (!pf) throw new Error(tr("its points file ({file}) was not chosen with it.", { file: h.pointsFile }));
      const smp = sgl.sgridSamples(h, sgl.readSgridPoints(new Uint8Array(await pf.arrayBuffer()), h));
      const L = sgl.sgridLattice(smp);
      const made = [], missing = [], failed = [];
      let coarse = null;
      for (const prop of h.props) {
        const f = vx.findPropFile(prop, files);
        if (!f) { missing.push(`${prop.name} (${prop.file || "?"})`); continue; }
        try {
          const vals = sgl.readSgridValues(new Uint8Array(await f.arrayBuffer()), prop, smp.count);
          let { mesh, values } = vx.voxetToUbc(L.header, sgl.resampleSgrid(L, vals));
          const { fx, fy, fz } = planCoarsenFactors(mesh.nx, mesh.ny, mesh.nz, effectiveMaxCells);
          if (fx > 1 || fy > 1 || fz > 1) { ({ mesh, values } = coarsenUBCModel(mesh, values, fx, fy, fz, { log: wantsLogMean(values, prop.name) })); coarse = { fx, fy, fz }; }
          const cells = ubcMeshToCells(mesh, Array.from(values));
          if (!cells.length) { failed.push(tr("{name}: no value other than no-data", { name: prop.name })); continue; }
          const { min, max } = cellValueRange(cells);
          addVoxelModel({ name: `${h.name || sg.name.replace(/\.sg$/i, "")} — ${prop.name}${prop.unit ? ` (${prop.unit})` : ""}`, source: "gocad", cells, min, max, property: prop.name, ...(prop.unit ? { unit: prop.unit } : {}),
            params: { tool: "GOCAD SGrid import", file: sg.name, sgridNodes: h.n, alignment: h.align, lattice: L.header.n, blockM: L.step.map((s) => +s.toFixed(3)), reachM: +L.reach.toFixed(3), ...(coarse ? { coarsened: [coarse.fx, coarse.fy, coarse.fz] } : {}) } });
          made.push(`${prop.name} (${cells.length.toLocaleString()} blocks)`);
        } catch (err) { failed.push(err.message); }
      }
      const [nx, ny, nz] = L.header.n, [dx, dy, dz] = L.step.map((s) => +s.toFixed(1));
      const parts = [made.length ? tr("Imported the GOCAD SGrid \"{name}\" as {n} block model(s): {list}. Its {nu} × {nv} × {nw} nodes ({on}) were resampled onto {nx} × {ny} × {nz} blocks of {dx} × {dy} × {dz} m along east, north and up, each taking the value of the nearest {what} within {reach} m (blocks farther from every one are left empty). Its coordinates are taken as the project's (GOCAD files carry no EPSG code).", { name: h.name || sg.name, n: made.length, list: made.join(", "), nu: h.n[0], nv: h.n[1], nw: h.n[2], on: h.align === "CELLS" ? tr("values on the cells") : tr("values on the nodes"), nx, ny, nz, dx, dy, dz, what: h.align === "CELLS" ? tr("cell centre") : tr("node"), reach: +L.reach.toFixed(1) }) : "",
        coarse ? tr("Averaged {fx} × {fy} × {fz} nodes into each block to stay within the block budget.", coarse) : "",
        missing.length ? tr("Not chosen with it, so not read: {list}. Choose the .sg together with the files its PROP_FILE lines name.", { list: missing.join(", ") }) : "",
        failed.length ? tr("Could not read: {list}.", { list: failed.join("; ") }) : ""].filter(Boolean).join(" ");
      setVoxelError({ info: made.length > 0 && !failed.length, text: made.length ? parts : tr("{name}: no block model made. {why}", { name: sg.name, why: parts || tr("The SGrid names no property.") }) });
    } catch (err) {
      setVoxelError({ info: false, text: tr("{name}: couldn't read the GOCAD SGrid ({message}).", { name: sg.name, message: err.message }) });
    } finally { setVoxelBusy(false); }
  };
  const importUBC = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setVoxelError(null);
    setVoxelBusy(true);
    setVoxelProgress(null);
    try {
      // TASKS.csv #1658 (review #1646, Kodiak) — the mesh by its content, not its name: SJ Geophysics delivered "3dmesh_utm.txt" (nx ny nz,
      // then the origin), which a .msh-only test refused. A .msh name still wins; every other file is a model on that mesh (#1669: each
      // imported, named after its own file, so the resistivity and chargeability of one mesh are no longer both "3dmesh_utm").
      const looksLikeMesh = async (f) => { try { return isUBCMeshText(await f.slice(0, 2048).text()); } catch { return false; } };
      let meshFile = files.find((f) => /\.msh$/i.test(f.name)) || null;
      if (!meshFile) for (const f of files) { if (f.size < 5e6 && await looksLikeMesh(f)) { meshFile = f; break; } }
      const modelFiles = files.filter((f) => f !== meshFile);
      if (!meshFile || !modelFiles.length) {
        throw new Error(tr("Select the mesh file (.msh, or a text mesh such as mesh.txt) and its model file(s) (.mod / .con / .den / .sus / .res / .chg) together."));
      }
      const meshText = await meshFile.text();
      const infoNotes = [];
      for (const modelFile of modelFiles) {
      // TASKS.csv #1348 — a DCIP2D mesh (11 of ARIS 42641Z's lines) is not a 3D mesh: say where it goes
      if (isDcip2dMeshText(meshText)) throw new Error(tr("This is a UBC DCIP2D (2D) mesh: import it with DC / IP > Import a UBC DCIP2D inversion (mesh + model), with its .con / .chg model and the line's topography and station files."));
      let mesh = parseUBCMesh(meshText);
      const modelName = modelFile.name.replace(/\.([a-z0-9]+)$/i, " ($1)"); // "MPD-2023_dcinv3d_r2i10 (res)" 
      // Read the model file as a stream rather than meshFile.text()-style whole-file-into-one-string —
      // a real UBC-GIF inversion model can be 500MB+ of plain-text numbers, and streaming avoids ever
      // holding the full text AND a full tokenized array in memory at once. See voxel.js's
      // parseUBCModelStream header comment for the OneDrive-placeholder investigation this came out of.
      let values = await parseUBCModelStream(modelFile, mesh, (n) => setVoxelProgress(n));
      setVoxelProgress(null);
      // TASKS.csv #481 — SimPEG / UBC air cells (1e-8) are no-data, before any block-averaging
      const air = maskAirCells(values);
      // User report: a real UBC-GIF inversion mesh (41,841,072 cells) used to hard-fail the import
      // outright. Instead of rejecting it, block-average it down to GeoStrix's MAX_CELLS budget (see
      // voxel.js's coarsenUBCModel) — the mesh still imports and renders, just at reduced resolution,
      // with the reduction reported below rather than silently applied.
      const rawTotal = mesh.nx * mesh.ny * mesh.nz;
      let coarsenNote = "", coarsenedFrom = null, coarsenMeanNote = ""; // coarsenMeanNote: #1785
      if (rawTotal > effectiveMaxCells) {
        const { fx, fy, fz } = planCoarsenFactors(mesh.nx, mesh.ny, mesh.nz, effectiveMaxCells);
        const shape = [mesh.nx, mesh.ny, mesh.nz], fine = values; // #1095 — before averaging
        const log = wantsLogMean(values, guessVoxelProperty(modelFile.name)); // #1785 — resistivity / conductivity on their logs; .chg not (#1786)
        const coarsened = coarsenUBCModel(mesh, values, fx, fy, fz, { log });
        coarsenedFrom = coarsenRecord({ shape, factors: [fx, fy, fz], cellsTo: coarsened.mesh.nx * coarsened.mesh.ny * coarsened.mesh.nz, values: fine, valid: (v) => Number.isFinite(v) && v > -99999, rule: log ? MEAN_RULE.log : MEAN_RULE.arithmetic });
        if (log) coarsenMeanNote = tr(" Merged on the logs (geometric means), as a resistivity or conductivity model should be, so a .res and a .con of the same inversion give the same model.");
        mesh = coarsened.mesh; values = coarsened.values;
        const coarseTotal = mesh.nx * mesh.ny * mesh.nz;
        coarsenNote = tr(" Original mesh had {rawTotal} cells — over GeoStrix's {effectiveMaxCells}-cell budget for staying responsive in the 3D view, so it was block-averaged down (merging {fx}×{fy}×{fz} fine cells into each coarse cell) to {coarseTotal} cells. Raise the \"3D view cell budget\" setting above and re-import if you want finer detail.", { rawTotal: rawTotal.toLocaleString(), effectiveMaxCells: effectiveMaxCells.toLocaleString(), fx, fy, fz, coarseTotal: coarseTotal.toLocaleString() });
        coarsenNote += coarsenMeanNote; // #1785
      }
      const cells = ubcMeshToCells(mesh, values);
      if (!cells.length) throw new Error(tr("Every cell in this model is no-data — nothing to render."));
      const { min, max } = cellValueRange(cells);
      // #481 — a positive model spanning 2+ decades (conductivity, resistivity) gets log-spaced colours;
      // on a linear ramp almost every cell of a ZTEM conductivity model (1e-5 .. 0.1 S/m) was one colour.
      const logColours = isLogProperty(guessVoxelProperty(modelFile.name), min, max); // #1786 — a .chg is not log-normal
      const ramp = propertyRamp(guessVoxelProperty(modelFile.name)); // #1788 — resistivity low = red
      addVoxelModel({ name: modelName, source: "ubc", cells, min, max, ...(coarsenedFrom ? { params: { coarsenedFrom } } : {}) /* #1095 */, ...(logColours ? { stops: logStops(min, max, ramp?.anchors || SEQUENTIAL_ANCHORS), colorMode: "continuous", logScale: true /* #1780: log-stepped range sliders */, ...(ramp?.palette ? { palette: ramp.palette } : {}) } : {}) });
      infoNotes.push(farNote(cells) + tr("Imported \"{name}\" — {nx}×{ny}×{nz} mesh, {cells} cell(s) with data.{v}{v2}{coarsenNote}", { name: modelName, nx: mesh.nx, ny: mesh.ny, nz: mesh.nz, cells: cells.length.toLocaleString(), v: air.count ? tr(" {count} cells at {v} (the value this model uses for air above the ground) were treated as air (no data).", { count: air.count.toLocaleString(), v: Number(air.value).toPrecision(3) }) : "", v2: logColours ? tr(" Values span {min} to {max} ({v} decades), so colours are log-spaced.", { min: min.toPrecision(2), max: max.toPrecision(2), v: Math.round(Math.log10(max / min)) }) : "", coarsenNote }));
      }
      setVoxelError({ info: true, text: infoNotes.join(" ") });
    } catch (err) {
      setVoxelError({ info: false, text: err.message });
    } finally {
      setVoxelBusy(false);
      setVoxelProgress(null);
    }
  };

  // TASKS.csv #27 — block-model CSV import, the pragmatic substitute for a Geosoft voxel binary
  // reader (no public spec to implement against — see src/lib/voxel.js's header comment). Shares the
  // same voxel renderer/store slot as UBC mesh imports above.
  // TASKS.csv #190/#191 briefly also added shapefile/.gpkg import for block models here (a block
  // model is naturally a point cloud, so the same parseBlockModelCSV could run on flattened shapefile/
  // GeoPackage rows) — removed again per user feedback ("I don't think there's a voxel in shp or
  // gpkg so we can delete those 2 buttons"): real block-model exports in practice are CSV or a UBC
  // mesh, not a point shapefile/GeoPackage, so the two extra import paths were more confusing (an
  // unlikely-to-be-used option next to the two that are) than useful. (#410: the CSV path now goes through
  // BlockModelMappingModal + lib/blockModelCsv.js; finishBlockModelImport / parseBlockModelCSV are no longer used here.)
  // stays — the plain CSV path (importBlockModelCSV, below) still uses it, unchanged.
  const importBlockModelCSV = (file) => {
    if (!file) return;
    setVoxelError(null);
    // TASKS.csv #482 — this reader holds the whole file (and every row as an object) in memory; a 320 MB
    // inversion-mesh CSV would freeze the app the way #481's point import did. Large models have streamed routes.
    if (file.size > 150e6) {
      setVoxelError({ info: false, text: tr("\"{name}\" is {v} MB — too large for the block-model CSV reader. Import the same model as UBC (.msh + .mod) or OMF, which are streamed and reduced to fit the 3D view.", { name: file.name, v: (file.size / 1e6).toFixed(0) }) });
      return;
    }
    parseTableFile(file) // TASKS.csv #444 — comma decimals (Datamine/Micromine exports on a European locale) + encoding fallback
      .then((t) => {
        // TASKS.csv #410 — confirm the columns first (BlockModelMappingModal) instead of fixed synonyms.
        if (!t.rows.length) { setVoxelError({ info: false, text: tr("{name}: no rows.", { name: file.name }) }); return; }
        setBmPending({ file, fileName: file.name, rows: t.rows, headers: t.headers, numeric: numericColumns(t.headers, t.rows), guess: guessBlockModelMapping(t.headers, t.rows), note: t.note });
      })
      .catch((err) => setVoxelError({ info: false, text: tr("Could not parse {name}: {message}", { name: file.name, message: err.message }) }));
  };
  // TASKS.csv #410 — one block model per chosen attribute; over the cell budget, volume-weighted merge.
  // TASKS.csv #1671 (review #1646, Kodiak) — the cells are built and merged in a worker (lib/blockModelCsv.worker.js reads the file again):
  // Kodiak's 380,250-row model froze the window 2.05 s on Import. The same function runs here if no worker starts.
  const blockModelAttrsAsync = async (p, base, mapping, attrs) => {
    const here = () => importBlockModelAttrs(p.rows, base, mapping, attrs, effectiveMaxCells);
    if (typeof Worker === "undefined" || !p.file) return here();
    const buf = await p.file.arrayBuffer();
    const out = await new Promise((resolve) => {
      let w;
      try { w = new Worker(new URL("../lib/blockModelCsv.worker.js", import.meta.url), { type: "module" }); } catch { resolve(null); return; }
      w.onmessage = (e) => { w.terminate(); resolve(e.data.failed ? null : e.data.out); };
      w.onerror = (e) => { e.preventDefault?.(); w.terminate(); resolve(null); };
      w.postMessage({ buf, base, mapping, attrs, maxCells: effectiveMaxCells }, [buf]);
    });
    return out || here();
  };
  const importMappedBlockModel = async (mapping, attrs) => {
    const p = bmPending; setBmPending(null);
    if (!p) return;
    const base = p.fileName.replace(/\.csv$/i, "");
    const msgs = [];
    setVoxelError({ info: true, text: tr("Importing \"{fileName}\"…", { fileName: p.fileName }) });
    const results = await blockModelAttrsAsync(p, base, mapping, attrs);
    results.forEach(({ attr, empty, raw: rawCount, badRows, inferred, air, guessed, logMean, cells, factors, sourceM3, mergedM3 }) => {
      if (empty) { msgs.push(tr("{attr}: no usable rows (x/y/z and {attr} all need numbers).", { attr })); return; }
      const { min, max } = cellValueRange(cells);
      // TASKS.csv #1662 — the UBC rule (#481): a positive property spanning two decades or more gets log-spaced colours and log-stepped sliders
      const logColours = isLogProperty(guessed, min, max); // #1786
      const ramp = propertyRamp(guessed); // #1788 — resistivity low = red
      addVoxelModel({ name: `${base} (${attr})`, source: "csv", cells, min, max, ...(guessed ? { property: guessed } : {}), ...(logColours ? { stops: logStops(min, max, ramp?.anchors || SEQUENTIAL_ANCHORS), colorMode: "continuous", logScale: true, ...(ramp?.palette ? { palette: ramp.palette } : {}) } : {}) });
      let m = farNote(cells) + tr("{attr}: {n} block(s)", { attr, n: cells.length.toLocaleString() }); // far: #1427
      if (air) m += tr(", {n} block(s) at {v} (the value this model uses for air above the ground) left out", { n: air.count.toLocaleString(), v: Number(air.value).toExponential(2) }); // #1662
      if (logColours) m += tr(", log-spaced colours (the values span {d} decades)", { d: Math.log10(max / min).toFixed(1) });
      if (guessed) m += tr(", values read as {p} from the name (change it under Values are)", { p: tr(guessed) }); // #1786
      if (factors) m += tr(" ({raw} merged {fx}×{fy}×{fz} to fit the {budget}-cell budget — volume-weighted means)", { raw: rawCount.toLocaleString(), fx: factors.fx, fy: factors.fy, fz: factors.fz, budget: effectiveMaxCells.toLocaleString() });
      if (factors && logMean) m += tr(", merged on the logs (geometric means: a log-normal property)"); // #1785
      // TASKS.csv #943 — merged blocks are full cells: where the model did not fill them, they are larger than it
      if (factors && mergedM3 > sourceM3 * 1.005) m += tr(". The merged blocks are full cells and cover {pct}% more volume than the model's own blocks ({src} m³): each keeps the share it really holds (COVERAGE in the CSV, VTK and OMF exports; VOLUME_M3 in the CSV). Take volume and tonnage from those, or import the model without merging (raise the 3D view cell budget)", { pct: (((mergedM3 - sourceM3) / sourceM3) * 100).toFixed(0), src: Math.round(sourceM3).toLocaleString() });
      if (badRows) m += tr(", {n} row(s) without numbers skipped", { n: badRows.toLocaleString() });
      msgs.push(m + ".");
      if (inferred && msgs.length === 1) msgs.push(tr("Block size inferred from centroid spacing: {v} — check it matches the model.", { v: ["dx", "dy", "dz"].map((k) => (inferred[k] != null ? (inferred[k].variable ? `${k} ${+inferred[k].min.toFixed(3)}–${+inferred[k].max.toFixed(3)} (${tr("variable")})` : `${k} ${+inferred[k].min.toFixed(3)}`) : null)).filter(Boolean).join(", ") })); // variable widths: #1662
    });
    setVoxelError({ info: true, text: tr("Imported \"{fileName}\": {msgs}{v}", { fileName: p.fileName, msgs: msgs.join(" "), v: p.note ? ` ${p.note.trim()}` : "" }) });
  };
  // Plain loop, not Math.min(...vals)/Math.max(...vals) — a large geophysics point cloud (real
  // airborne survey exports easily run into hundreds of thousands of points) can exceed the JS
  // engine's argument-spread limit and crash with "Maximum call stack size exceeded" (found and
  // fixed for the same reason in voxel.js's cellValueRange during the UBC-mesh coarsening work).
  let min = null, max = null;
  for (const r of rows) {
    const v = r.value;
    if (typeof v !== "number" || isNaN(v)) continue;
    if (min === null || v < min) min = v;
    if (max === null || v > max) max = v;
  }

  // TASKS.csv #2848 (GSC review B15) — files dropped on this tab: on its sidebar, and (since #2848) on the 3D viewport it shows beside the sidebar
  // once data is loaded (ViewerModule, bare, forwards its drops as 'geophysics-drop'), where a drop did nothing and said nothing
  const dropFiles = async (files) => { // async: #1994 reads the first bytes of a .las (the files are taken before the first await)
        // Bug-hunt pass: this used to pick only the FIRST csv and FIRST tif via .find(), silently
        // dropping every other file in a multi-file drag (e.g. several GeoTIFFs at once) with no
        // notice — process every matching file instead. Only one terrain is supported at a time (see
        // importTerrain's own confirm-to-replace prompt), so multiple DEM-looking tifs still only end
        // up as one terrain, but every raster/CSV dropped together now actually imports.
        const csvs = files.filter((f) => f.name.toLowerCase().endsWith(".csv"));
        const tifs = files.filter((f) => /\.tiff?$/i.test(f.name));
        const gxfs = files.filter((f) => /\.(gxf|grd)$/i.test(f.name)); // grd: #2855 — a Geosoft / Surfer grid, read as Maps and the 3D View read it
        const plys = files.filter((f) => /\.(ply|dxf)$/i.test(f.name));
        // TASKS.csv #1986 — an Aarhus Workbench export ("/INFO" then a Workbench line) is FDEM soundings or models, not a Geosoft XYZ
        const xyzAll = files.filter((f) => /\.xyz$/i.test(f.name)), wbs = [];
        for (const f of xyzAll) { const head = await f.slice(0, 400).text().catch(() => ""); if (/^\s*\/INFO\s*[\r\n]+\s*\/[^\n]*Workbench/i.test(head)) wbs.push(f); }
        const xyzs = xyzAll.filter((f) => !wbs.includes(f));
        if (wbs.length) { setFdemDrop(wbs); setGeoPane("fdem"); }
        { const pair = gdfPair(files); if (pair) importGdf(pair); } // TASKS.csv #1990 — an ASEG-GDF2 .dfn + .dat dropped together
        { const vs = files.find((f) => /\.vs$/i.test(f.name)); if (vs) importVSet(vs); } // TASKS.csv #1992 — a GOCAD point set
        // TASKS.csv #603 — a closed format (Geosoft .gdb / binary .grd, .dwg, Access) says how to get it out; such
        // files used to be ignored here without a word
        const advice = files.map((f) => unreadableFormatAdvice(f.name)).filter(Boolean);
        // TASKS.csv #1667 — every other file this tab does not read is named too (a UBC .msh / .den went nowhere without a word)
        // TASKS.csv #1994 — a lidar cloud: .laz, or a .las starting with the LAS signature (a LAS well log is text, read in the 3D View)
        const lasFiles = files.filter((f) => /\.la[sz]$/i.test(f.name));
        const lidarFiles = [];
        for (const f of lasFiles) { const b = new Uint8Array(await f.slice(0, 4).arrayBuffer()); if (/\.laz$/i.test(f.name) || (b[0] === 0x4c && b[1] === 0x41 && b[2] === 0x53 && b[3] === 0x46)) lidarFiles.push(f); else advice.push(tr("{name} is a LAS well log: drop it on the 3D View, which reads downhole logs.", { name: f.name })); }
        if (lidarFiles.length) { if (geoPane === "terrain") openLidar(lidarFiles[0]); else { goToModule("maps"); requestModuleAction("maps-lidar", { file: lidarFiles[0] }); } if (lidarFiles.length > 1) advice.push(tr("Opened \"{name}\". Lidar files are imported one at a time: import it, then drop the next.", { name: lidarFiles[0].name })); }
        const other = files.filter((f) => !/\.(csv|tiff?|gxf|grd|ply|dxf|xyz|edi|las|laz|vs)$/i.test(f.name) && !(/\.(dfn|dat)$/i.test(f.name) && gdfPair(files)) /* #1990 / #1992: read above */ && !unreadableFormatAdvice(f.name)).map((f) => f.name);
        if (other.length) advice.push(tr("Not imported from this drop: {names}. Dropped here, this tab reads CSV, GeoTIFF, GXF, .grd, XYZ, PLY / DXF, EDI (MT soundings) and LAS / LAZ lidar; a UBC mesh and model go through Block models.", { names: other.slice(0, 6).join(", ") + (other.length > 6 ? " …" : "") }));
        // TASKS.csv #1989 — MT / AMT soundings go to their own pane, which reads them
        const edis = files.filter((f) => /\.edi$/i.test(f.name));
        if (edis.length) { setMtDrop(edis); setGeoPane("mt"); }
        if (advice.length) setRasterError({ info: true, text: advice.join(" ") });
        // A dropped .tif is ambiguous between a raster drape (#24) and a DEM (#77) — both are plain
        // georeferenced GeoTIFFs, nothing in the file format itself says which. Heuristic: a filename
        // that reads as elevation data goes to the dedicated terrain importer; anything else keeps the
        // long-standing raster-drape behavior. The terrain section below also has its own explicit
        // drop target/button for when the filename doesn't give it away. .gxf (#26) always goes to the
        // raster drape — GXF grids in practice are geophysical value grids, not elevation.
        if (csvs.length || xyzs.length) setGeoPane("points"); // #2848 — the column picker is on the Point survey pane
        csvs.forEach((csv) => importFile(csv));
        // DEM-looking tifs are batched into ONE importTerrain call so multiple adjacent tiles (e.g. two
        // SRTM tiles dropped together) mosaic into a single terrain surface instead of each replacing
        // the last — everything else keeps importing one file at a time as before.
        const demTifs = tifs.filter((tif) => /dem|dtm|dsm|srtm|elev|terrain|topo/i.test(tif.name)); // dtm / dsm: #1351 (a drone DTM)
        const drapeTifs = tifs.filter((tif) => !/dem|dtm|dsm|srtm|elev|terrain|topo/i.test(tif.name));
        if (demTifs.length) importTerrain(demTifs);
        drapeTifs.forEach((tif) => importRaster(tif));
        gxfs.forEach((gxf) => importRaster(gxf));
        if (plys.length) importBoundaries(plys);
        // .xyz needs a column-picker (its layout isn't fixed — see importXYZFile) which can only show
        // one file at a time; a multi-.xyz drop opens the picker for the first and leaves the rest for
        // a follow-up drop/click rather than silently skipping them with no explanation.
        if (xyzs.length > 1) importXYZFiles(xyzs); // #1329
        else if (xyzs.length) {
          importXYZFile(xyzs[0]);
          if (xyzs.length > 1) setXyzError({ info: true, text: tr("Opened the column picker for \"{name}\". Import it, then drop the other {v} file(s) one at a time — .xyz files need their columns picked individually.", { name: xyzs[0].name, v: xyzs.length - 1 }) });
        }
  };
  useModuleAction(["geophysics-drop"], (_a, p) => { if (p?.files?.length) dropFiles(p.files); }); // #2848
  const show3d = !embedded && !!onMain3d && !hasResults && (collars.length > 0 || rows.length > 0 || rasters.length > 0 || !!terrain || boundaries.length > 0 || voxelModels.length > 0 || dcipLines.length > 0 || (surfaceSamples || []).length > 0); // #1979
  useEffect(() => { onMain3d?.(show3d); }, [onMain3d, show3d]);
  useEffect(() => () => onMain3d?.(false), [onMain3d]); // leaving the tab: the viewport goes back to the 3D View
  return (
    <div
      className="ge-body"
      style={embedded || show3d ? { flex: "0 0 auto", minWidth: 0 } : { width: "100%" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); dropFiles(Array.from(e.dataTransfer.files || [])); }} // #2848 — the body is dropFiles
    >
      <div className="ge-panel" style={{ padding: "16px 14px", overflowY: "auto", width: sidebarWidth }}>
        {/* TASKS.csv #458 — Geophysics ribbon: each button shows that tool in the sidebar */}
        <Ribbon label="Geophysics tools" show={!embedded}>
          <RibbonGroup label="Surveys">
            <RibbonButton icon={RRadar} label="Point survey" tone="data" title="Import a mag / gravity / IP / radiometric point survey (CSV or Geosoft .xyz)" {...geoBtn("points")} />
            <RibbonButton advanced icon={RMagnet} label="Inversion" tone="model" title="Magnetics / gravity inversion and forward modelling (SimPEG)" {...geoBtn("inversion")} />
            <RibbonButton advanced icon={RZap} label="DC / IP" tone="model" title="2D DC resistivity / IP line inversion (SimPEG)" {...geoBtn("dcip")} />
            <RibbonButton advanced icon={RWaves} label="MT / AMT" tone="data" title="MT / AMT soundings from EDI files: curves, pseudosections and approximate depths" {...geoBtn("mt")} />{/* TASKS.csv #1989 */}
            <RibbonButton advanced icon={RLayers} label="FDEM 1D" tone="model" title="Ground loop-loop EM (DUALEM, GEM-2): conductivity against depth under each sounding, a 1D inversion" {...geoBtn("fdem")} />{/* TASKS.csv #1986 */}
          </RibbonGroup>
          {/* #749 — Terrain, map layers, web layers, boundaries and claims moved to the Maps tab */}
          <RibbonGroup label="Models">
            <RibbonButton icon={RBox} label="Block models" tone="data" title="Voxel / block models (UBC mesh, block model CSV), colours and cutoffs" {...geoBtn("voxel")} />
            <RibbonButton advanced icon={RPackage} label="OMF" tone="data" title="Import an Open Mining Format (.omf) file" {...geoBtn("omf")} />
            <RibbonButton advanced icon={RSettings2} label="Cell budget" tone="view" title="How many voxel cells the 3D view may draw" {...geoBtn("budget")} />
          </RibbonGroup>
          <RibbonGroup label="Drillholes">{/* TASKS.csv #1425 */}
            <RibbonButton icon={RActivity} label="Downhole logs" tone="analyse" title="Mag susc, SG, RQD, recovery or a numeric custom field by lithology / alteration code (box plot) and against an assay element (Spearman)" {...geoBtn("logs")} />
          </RibbonGroup>
        </Ribbon>
        {/* Raster import UI itself lives in the Raster tab now — this banner only ever shows up if a
            .tif/.gxf was dropped directly on THIS tab (still supported, see onDrop above), so the
            result is visible without needing the full raster list/controls here too. */}
        {rasterError && (
          <div style={{ marginBottom: 12, padding: "8px 10px", background: rasterError.info ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${rasterError.info ? "var(--color-border)" : "var(--color-danger-border)"}`, borderRadius: 6, fontSize: "var(--font-size-base)", color: rasterError.info ? "var(--color-text-secondary)" : "var(--color-danger-text)", lineHeight: 1.5 }}>
            {rasterError.text}
          </div>
        )}
        {/* TASKS.csv #617 — the point-survey file input lives OUTSIDE the pane: the empty-state "Import CSV…" and
            File > Import CSV (Ctrl+I) click it too, and did nothing whenever another pane (Terrain, Inversion…) was open */}
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.dat,.txt" /* #2017 — a contractor's space-aligned .dat table reads too */
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files[0]; importFile(f); e.target.value = ""; }}
        />
        {geoPane === "points" && (<>
        <TaskPaneHeader title="Point survey (CSV / XYZ)" icon={RRadar} tone="data" />
        <div className="ge-section-label" style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>{tr("Point cloud (CSV)")}<InfoButton title={tr("Point cloud (CSV)")} text={tr("Import a CSV point cloud (x, y, z, value) — mag, IP, gravity, radiometrics, or any other point-sampled survey. Points render in the same 3D scene as drillholes for co-visualization (see the \"Geophysics points\" layer on the Viewer’s Home tab).")} />
        </div>

        {/* TASKS.csv #120 — optional source EPSG, shared by the CSV and .xyz importers below. Left
            blank, x/y is assumed to already be in the project's EPSG (unchanged behavior). */}
        <SourceCrsField
          value={geophysSourceEpsg} onChange={(c) => { const v = c === "" ? "" : String(c); keptGeophysSourceEpsg = v; setGeophysSourceEpsg(v); } /* #2871 */} mineGrid={mineSourceOf(project) /* #2684 */}
          defaultText={project?.crsSet === false ? tr("The project CRS — not chosen yet") /* #2242: never the placeholder as the project's */ : tr("Same as project — {crs} (longitude/latitude columns: WGS 84)", { crs: crsName(project?.epsg) || `EPSG:${project?.epsg ?? "?"}` })}
          title={tr("The CRS these points' x/y are in. They are reprojected into the project CRS on import.")}
        />

        <button onClick={() => fileInput.current.click()} style={pBtn}>
          <Upload size={14} />{" "}{tr("Import CSV…")}</button>

        {/* Geosoft .xyz line/profile import — its column layout isn't fixed like the CSV importer
            above (a real airborne survey export carries a dozen+ geophysics channels), so this is a
            picker rather than a name-guessed single button — see importXYZFile/confirmImportXYZ. */}
        <button onClick={() => xyzInput.current.click()} style={{ ...pBtn, marginTop: 6 }}>
          <MapPin size={14} />{" "}{tr("Import survey .xyz (one or many)…")}</button>
        <input
          ref={xyzInput}
          type="file"
          accept=".xyz,.fld,.bse,.txt,.gpx,.wpt,.dfn,.dat,.vs"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { importXYZFiles(e.target.files); e.target.value = ""; }}
        />
        {/* TASKS.csv #451 / #327 — the loaded surveys, each with what it is */}
        {surveyList.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="ge-section-label" style={{ marginBottom: 6 }}>{tr("Surveys loaded")}</div>
            {surveyList.map((sv) => {
              const meta = geophysSurveys[sv.key] || {};
              return (
                <div key={sv.key} style={{ marginBottom: 8, padding: "8px 9px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-sm)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text)" }} title={sv.key}>{sv.key}</span>
                    {/* TASKS.csv #2871 — buttons, not bare svg elements */}
                    <button type="button" aria-label={tr("Export the points of \"{key}\" (CSV)", { key: sv.key })} title={tr("Export the points of \"{key}\" (CSV)", { key: sv.key })} style={iconBtn} onClick={() => exportSurvey(sv.key)}><Download size={12} aria-hidden="true" /></button>{/* #1094 */}
                    <button type="button" aria-label={tr("Remove survey \"{key}\"", { key: sv.key })} title={tr("Remove survey \"{key}\"", { key: sv.key })} style={iconBtn}
                      onClick={() => { if (window.confirm(tr("Remove the {count} points of \"{key}\"?", { count: sv.count.toLocaleString(), key: sv.key }))) setLayers((l) => ({ ...l, geophys_pts: (l.geophys_pts || []).filter((r) => surveyKey(r) !== sv.key) })); }}><Trash2 size={12} aria-hidden="true" /></button>
                  </div>
                  <div style={{ color: "var(--color-text-muted)", marginTop: 2 }}>
                    {tr("{count} points{v}, {withZ} with elevation · values {v2}{v3}", { count: sv.count.toLocaleString(), v: sv.lines ? `, ${sv.lines} line(s)` : "", withZ: sv.withZ.toLocaleString(), v2: Number.isFinite(sv.min) ? rangeText(sv.min, sv.max) /* #2402 — 57,392 to 57,571, not 5.739e+4 */ : "—", v3: meta.units ? ` ${meta.units}` : "" })}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
                    <select value={meta.method || ""} aria-label={tr("Method of \"{key}\"", { key: sv.key })} style={{ ...numInput, width: "auto", flex: 1, minWidth: 0 }}
                      onChange={(e) => updateGeophysSurvey(sv.key, { method: e.target.value, ...unitsForMethod(meta, e.target.value) })}>
                      <option value="">{tr("Method…")}</option>
                      {Object.entries(SURVEY_METHOD_GROUPS).map(([g, gl]) => <optgroup key={g} label={tr(gl)}>{Object.entries(SURVEY_METHODS).filter(([, m]) => m.group === g).map(([k, m]) => <option key={k} value={k}>{tr(m.label)}</option>)}</optgroup>)}{/* #1151 */}
                    </select>
                    <input value={meta.units || ""} placeholder={tr("units")} aria-label={tr("Units of \"{key}\"", { key: sv.key })} onChange={(e) => updateGeophysSurvey(sv.key, { units: e.target.value })} style={{ ...numInput, width: 58, flex: "none" }} />
                  </div>
                  <select value={meta.zMeaning || (sv.withZ ? "elevation" : "none")} aria-label={tr("What z means in \"{key}\"", { key: sv.key })} style={{ ...numInput, width: "100%", marginTop: 5 }}
                    onChange={(e) => updateGeophysSurvey(sv.key, { zMeaning: e.target.value })}>
                    {Object.entries(Z_MEANINGS).map(([k, label]) => <option key={k} value={k}>{tr(label)}</option>)}{/* #1974 */}
                  </select>
                  {/* TASKS.csv #1985 — gridded on one level with equivalent sources (Harmonica, in the Python engine) */}
                  {!["euler_depth", "mt_bostick", "lidar", "em1d_cond"].includes(meta.method) /* derived points at depth, not readings; lidar: #1994; em1d_cond: #1986 */ && <button type="button" onClick={() => setEqsFor(eqsFor === sv.key ? null : sv.key)} style={{ ...pBtn, marginTop: 5, marginBottom: 0 }} title={tr("Grid the readings on one level with equivalent sources (Harmonica): readings at different heights come out on a level surface, and a higher level continues the survey upward")}>{tr("Grid with equivalent sources…")}</button>}
                  {eqsFor === sv.key && <Suspense fallback={null}><EqsGridBox survey={sv.key} rows={rows} units={meta.units || ""} method={meta.method || null} /* #2639 */ addRaster={addRaster} defaultElevation={defaultElevation} numInput={numInput} pBtn={pBtn} /></Suspense>}
                  {/* TASKS.csv #1985 — free-air and Bouguer anomalies of a gravity survey (or of values that look like absolute gravity) */}
                  {(["grav", "grav_fa"].includes(meta.method) || (Number.isFinite(sv.min) && sv.min > 900000)) && <button type="button" onClick={() => setGravFor(gravFor === sv.key ? null : sv.key)} style={{ ...pBtn, marginTop: 5, marginBottom: 0 }} title={tr("Free-air anomaly (observed less normal gravity) and Bouguer anomaly (less the Bouguer plate or the terrain's gravity), in the Python engine")}><Scale size={14} />{tr("Gravity reductions…")}</button>}
                  {gravFor === sv.key && <Suspense fallback={null}><GravityReductionBox survey={sv.key} method={meta.method || null} /* #2841 */ rows={rows} epsg={project?.epsg} terrain={terrain} setLayers={setLayers} updateGeophysSurvey={updateGeophysSurvey} numInput={numInput} pBtn={pBtn} /></Suspense>}
                  {/* TASKS.csv #1152 — interpretation lines over this survey, drawn in the 3D view */}
                  <button type="button" onClick={() => { goToModule("viewer"); requestModuleAction("interpret-lines", { survey: sv.key }); }} style={{ ...pBtn, marginTop: 5, marginBottom: 0 }} title={tr("Draw faults, contacts and lineaments over this survey in the 3D view; they become a map layer")}>{tr("Draw interpretation lines…")}</button>
                  {(meta.zMeaning === "agl") && (
                    <button type="button" disabled={!terrain} onClick={() => convertAgl(sv.key)} style={{ ...pBtn, marginTop: 5, opacity: terrain ? 1 : 0.5 }}
                      title={terrain ? tr("elevation = terrain + the height in z (the heights are kept, so this can be redone after loading a better terrain)") : tr("Load a terrain first")}>
                      {sv.withAgl ? tr("Recompute elevations from the terrain") : tr("Convert heights to elevations (terrain + height)")}
                    </button>
                  )}
                  {meta.zMeaning === "agl" && !terrain && ( /* TASKS.csv #2244 — the disabled button said why only on hover */
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 3 }}>{tr("Needs a terrain: load or build one under Maps > Terrain (a DEM, a fetch, or the project's own collars).")}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {xyzPending && (
          <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
            <div style={{ color: "var(--color-text)", marginBottom: 8 }}>{xyzPending.stream /* #1351 */ ? tr("\"{fileName}\" — about {rows} readings, {columns} column(s), read in pieces (the first {n} rows are shown). Pick which columns to import as points:", { fileName: xyzPending.fileName, rows: xyzPending.stream.estimate.toLocaleString(), columns: xyzPending.columns.length, n: xyzPending.rows.length.toLocaleString() }) : tr("\"{fileName}\" — {rows} row(s), {columns} column(s). Pick which columns to import as points:", { fileName: xyzPending.fileName, rows: xyzPending.rows.length.toLocaleString(), columns: xyzPending.columns.length })}</div>
            {[
              ["X", "xCol"], ["Y", "yCol"], [tr("Value"), "valueCol"], [tr("Z / elevation (optional)"), "zCol"],
            ].map(([label, key]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                <span style={{ color: "var(--color-text-faint)", width: 140, flexShrink: 0 }}>{label}</span>
                <select
                  value={xyzPending[key]}
                  onChange={(e) => setXyzPending((p) => ({ ...p, [key]: e.target.value, ...(key === "valueCol" && p.channels ? withValueChannel(p.channels, p.channelPick, e.target.value) : {}) }))} /* #2840 */
                  style={{ ...numInput, width: "auto", flex: 1, minWidth: 0 }}
                >
                  <option value="">{key === "zCol" ? tr("(none — elevation not recorded)") : tr("(choose a column)")}</option>
                  {xyzPending.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
            {xyzPending.channels && ( /* TASKS.csv #2395 — each ticked channel its own survey; the ratios from the same stations */
              <div style={{ marginTop: 8 }}>
                <div style={{ color: "var(--color-text-faint)", marginBottom: 4 }}>{tr("Import each ticked channel as its own survey:")}</div>
                <div style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-xs)", marginBottom: 4 }}>{tr("Choose another column under Value to add it here (observed gravity, for example).")}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {xyzPending.channels.map((c) => (
                    <label key={c} style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={(xyzPending.channelPick || []).includes(c)} onChange={(e) => setXyzPending((p) => ({ ...p, channelPick: e.target.checked ? [...(p.channelPick || []), c] : (p.channelPick || []).filter((x) => x !== c) }))} aria-label={tr("Import channel {c}", { c })} />{c}</label>
                  ))}
                </div>
                {ratioJobs(radiometricChannels(xyzPending.channels)).length > 0 && (
                  <label style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}><input type="checkbox" checked={!!xyzPending.channelRatios} onChange={(e) => setXyzPending((p) => ({ ...p, channelRatios: e.target.checked }))} />{tr("Also make the {list} ratio survey(s) from the same stations", { list: ratioJobs(radiometricChannels(xyzPending.channels)).map((r) => r.label).join(" and ") })}</label>
                )}
              </div>
            )}
            {/* TASKS.csv #1583 — a signal-quality floor (a GEM sq column) and an along-line despike */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }} title={tr("A GEM magnetometer writes a signal quality (0-99) beside each reading; the base-station reader already drops readings under 50. Below the floor the reading is a dropout or a spike (2,105 or 167,300 nT in a 56,500 nT survey) and is left out.")}>
              <span style={{ color: "var(--color-text-faint)", width: 140, flexShrink: 0 }}>{tr("Signal quality")}</span>
              <select value={xyzPending.sqCol || ""} aria-label={tr("Signal quality column")} onChange={(e) => setXyzPending((p) => ({ ...p, sqCol: e.target.value, minQuality: e.target.value ? (p.minQuality || 50) : 0 }))} style={{ ...numInput, width: "auto", flex: 1, minWidth: 0 }}>
                <option value="">{tr("(no quality column)")}</option>
                {xyzPending.columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {xyzPending.sqCol && <label style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>{tr("drop under")}<input type="number" min="0" max="99" step="1" value={xyzPending.minQuality ?? 50} aria-label={tr("Drop readings with signal quality under")} onChange={(e) => setXyzPending((p) => ({ ...p, minQuality: Math.max(0, Math.min(99, Number(e.target.value) || 0)) }))} style={{ ...numInput, width: 56 }} /></label>}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, cursor: "pointer" }} title={tr("Each reading is compared with the median of the 11 readings around it on its line; one more than 6 MAD (and at least 20 nT) away is dropped as a spike. A real anomaly over tens of readings moves the running median with it and stays.")}>
              <span style={{ color: "var(--color-text-faint)", width: 140, flexShrink: 0 }}>{tr("Despike")}</span>
              <input type="checkbox" checked={!!xyzPending.despike} onChange={(e) => setXyzPending((p) => ({ ...p, despike: e.target.checked }))} />
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("drop readings more than 6 MAD from the running median along their line")}</span>
            </label>
            {xyzPending.stream && ( /* TASKS.csv #1351 — how many readings of the big file to keep */
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: "var(--font-size-sm)" }} title={tr("Every reading is one point in the 3D view, and hundreds of thousands make it slow and the project file large. Thinning keeps the map of the survey, but a short anomaly between kept readings is lost.")}>
                <span style={{ color: "var(--color-text-faint)", width: 140, flexShrink: 0 }}>{tr("Keep")}</span>
                <select value={xyzPending.stream.keepEvery} aria-label={tr("How many readings to keep")} onChange={(e) => setXyzPending((p) => ({ ...p, stream: { ...p.stream, keepEvery: Number(e.target.value) } }))} style={{ flex: 1, minWidth: 0 }}>
                  {KEEP_CHOICES.map((n) => <option key={n} value={n}>{n === 1 ? tr("Every reading (about {rows} points)", { rows: xyzPending.stream.estimate.toLocaleString() }) : tr("1 in {n} (about {rows} points)", { n, rows: Math.round(xyzPending.stream.estimate / n).toLocaleString() })}</option>)}
                </select>
              </label>
            )}
            {xyzPending.batch && (
              <div style={{ marginTop: 8, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                <div>{tr("{n} files, about {rows} readings. These columns apply to all of them; the first file is shown.", { n: xyzPending.batch.files.length, rows: xyzPending.batch.estimate.toLocaleString() })}{xyzPending.batch.gpsFiles.length ? ` ${tr("{n} GPS file(s) are used for the surveys named like them.", { n: xyzPending.batch.gpsFiles.length })}` : ""}</div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }} title={tr("Every reading is one point in the 3D view, and hundreds of thousands make it slow and the project file large. Thinning keeps the map of the survey, but a short anomaly between kept readings is lost.")}>
                  <span style={{ color: "var(--color-text-faint)", width: 140, flexShrink: 0 }}>{tr("Keep")}</span>
                  <select value={xyzPending.batch.keepEvery} aria-label={tr("How many readings to keep")} onChange={(e) => setXyzPending((p) => ({ ...p, batch: { ...p.batch, keepEvery: Number(e.target.value) } }))} style={{ flex: 1, minWidth: 0 }}>
                    {KEEP_CHOICES.map((n) => <option key={n} value={n}>{n === 1 ? tr("Every reading (about {rows} points)", { rows: xyzPending.batch.estimate.toLocaleString() }) : tr("1 in {n} (about {rows} points)", { n, rows: Math.round(xyzPending.batch.estimate / n).toLocaleString() })}</option>)}
                  </select>
                </label>
                {xyzPending.batch.timeCol && xyzPending.source !== "csv" && diurnalApplies(xyzPending.valueCol, { instrument: xyzPending.header?.instrument, columns: xyzPending.columns }) /* #1586 */ && (() => { // #1585 — base stations for every day of the batch
                  const plan = batchDiurnalPlan(xyzPending.batch.files.map((f) => f.name), xyzPending.batch.bases);
                  return (
                    <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid var(--color-border)" }}>
                      <div style={{ color: "var(--color-text)", fontWeight: 600, marginBottom: 2 }}>{tr("Diurnal correction (base station)")}</div>
                      <div style={{ color: "var(--color-text-faint)", lineHeight: 1.4 }}>{tr("Load the base-station files of every day (GEM .tbl / .b). Each survey file is corrected against the base of its own day, read from its header or its yyyymmdd name; the Value column is the raw reading and \"{time}\" the time.", { time: xyzPending.batch.timeCol })}</div>
                      {xyzPending.batch.bases.length > 0 && <div style={{ marginTop: 4 }}>{tr("{n} base file(s) for {days} day(s): {v}", { n: xyzPending.batch.bases.length, days: plan.days.length, v: plan.days.join(", ") })}{plan.basesWithoutDay.length ? ` ${tr("No day could be read from {v}; they are not used.", { v: plan.basesWithoutDay.join(", ") })}` : ""}</div>}
                      {xyzPending.batch.bases.length > 0 && <div style={{ marginTop: 2, color: plan.withoutBase.length ? "var(--color-warn-text)" : "var(--color-text-secondary)" }}>{plan.withoutBase.length ? tr("No base for {n} of {total} survey files: {v} — they will be imported raw.", { n: plan.withoutBase.length, total: plan.files.length, v: plan.withoutBase.map((f) => f.name).join(", ") }) : tr("Every survey file has a base for its day.")}</div>}
                      <button type="button" onClick={() => batchBaseInput.current?.click()} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}>{xyzPending.batch.bases.length ? tr("Add more base files…") : tr("Load base-station files…")}</button>
                      <input ref={batchBaseInput} type="file" multiple accept=".tbl,.b,.txt,.dat,.csv" style={{ display: "none" }} onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; addBatchBases(fs); }} />
                    </div>
                  );
                })()}
              </div>
            )}
            {!geophysSourceEpsg && !xyzPending.headerEpsg && project?.crsSet !== false && !!project?.epsg && !isGeographicCrs(project.epsg) && xyLookLikeDegrees(xyzPending.rows, xyzPending.xCol, xyzPending.yCol) && ( /* TASKS.csv #2832 */
              <div style={{ marginTop: 8, padding: "6px 8px", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, color: "var(--color-warn-text)", fontSize: "var(--font-size-sm)" }}>
                {tr("{x} and {y} are all within ±180 / ±90: longitude and latitude, not metres. They will be read as WGS 84 and reprojected into the project CRS; set the Source CRS above if they are in another datum (NAD83, NAD27…).", { x: xyzPending.xCol, y: xyzPending.yCol })}
              </div>
            )}
            {xyzPending.headerEpsg && !geophysSourceEpsg && ( /* TASKS.csv #2832 — said before Import, not only after */
              <div style={{ marginTop: 8, color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>{tr("The file's header names {crs} (EPSG:{epsg}): its X / Y are read in it.", { crs: crsName(xyzPending.headerEpsg) || `EPSG:${xyzPending.headerEpsg}`, epsg: xyzPending.headerEpsg })}</div>
            )}
            {!xyzPending.batch?.gpsFiles.length && !xyzPending.grid && looksLikeLocalGrid(xyzPending.rows, xyzPending.xCol, xyzPending.yCol) && (
              <div style={{ marginTop: 8, padding: "6px 8px", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, color: "var(--color-warn-text)", fontSize: "var(--font-size-sm)" }}>
                {tr("These look like local grid coordinates, not map coordinates: without placing them they land far from your other data. The survey's GPS file, with stations named like \"9000N 4650E\", can place them.")}
                <button type="button" onClick={() => gridGpsInput.current?.click()} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}>{tr("Load the GPS file…")}</button>
                <input ref={gridGpsInput} type="file" accept=".txt,.csv,.dat,.gpx,.wpt" style={{ display: "none" }} onChange={(e) => { placeLocalGrid(e.target.files[0]); e.target.value = ""; }} />
              </div>
            )}
            {xyzPending.source !== "csv" && !xyzPending.batch && diurnalApplies(xyzPending.valueCol, { instrument: xyzPending.header?.instrument, columns: xyzPending.columns }) /* #1586 — a magnetics step */ && <DiurnalCorrectionBox key={xyzPending.fileName} pending={xyzPending} setPending={setXyzPending} numInput={numInput} pBtn={pBtn} />}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => confirmImportXYZ()} disabled={!!xyzPending.streaming} style={{ ...pBtn, marginBottom: 0, flex: 1, justifyContent: "center" }}>
                {xyzPending.streaming ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}{" "}{xyzPending.streaming ? tr("Reading…") : tr("Import")}</button>
              <button onClick={() => setXyzPending(null)} style={{ ...pBtn, marginBottom: 0, width: 90, justifyContent: "center", color: "var(--color-text-secondary)" }}>{tr("Cancel")}</button>
            </div>
          </div>
        )}
        {xyzError && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: xyzError.info ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${xyzError.info ? "var(--color-border)" : "var(--color-danger-border)"}`, borderRadius: 6, fontSize: "var(--font-size-base)", color: xyzError.info ? "var(--color-text-secondary)" : "var(--color-danger-text)", lineHeight: 1.5 }}>
            {xyzError.text}
          </div>
        )}

        {error && (() => {
          // #484 — {info, text} renders neutral (success / "pick the columns"); a plain string is an error
          const info = typeof error === "object" && error.info;
          return (
            <div style={{ marginTop: 8, padding: "8px 10px", background: info ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${info ? "var(--color-border)" : "var(--color-danger-border)"}`, borderRadius: 6, fontSize: "var(--font-size-base)", color: info ? "var(--color-text-secondary)" : "var(--color-danger-text)", lineHeight: 1.5 }}>
              {typeof error === "object" ? error.text : error}
            </div>
          );
        })()}

        {rows.length > 0 && (
          <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
            <div style={{ color: "var(--color-text)", marginBottom: 4 }}>{tr("{rows} {v} loaded", { rows: rows.length, v: tr(rows.length === 1 ? "point" : "points") })}</div>
            {manySurveys && ( // #1587 — which survey the legend below edits
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, marginBottom: 4, fontSize: "var(--font-size-sm)" }}>
                <span style={{ color: "var(--color-text-faint)", flexShrink: 0 }}>{tr("Survey")}</span>
                <select value={legendKey} onChange={(e) => { setLegendSurvey(e.target.value); setIdwSurvey(e.target.value); /* #2562 — one choice for the pane */ }} aria-label={tr("Survey whose legend to edit")} style={{ ...numInput, flex: 1, minWidth: 0 }}>
                  {surveyList.map((s) => <option key={s.key} value={s.key}>{s.key} ({s.count.toLocaleString()}{geophysSurveys[s.key]?.units ? `, ${geophysSurveys[s.key].units}` : ""})</option>)}
                </select>
              </div>
            )}
            {manySurveys && <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", marginBottom: 4, lineHeight: 1.4 }}>{tr("Each survey is coloured on its own 2–98 percentile range until its legend is edited here; the legend below is this survey's.")}</div>}
            {(manySurveys ? legendRange.min : min) !== null && (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>{tr("Value range: {min} – {max}", { min: (manySurveys ? legendRange.min : min).toLocaleString(), max: (manySurveys ? legendRange.max : max).toLocaleString() })}{manySurveys && geophysSurveys[legendKey]?.units ? ` ${geophysSurveys[legendKey].units}` : ""}</div>
            )}
            {min !== null && (manySurveys ? legendMeta?.min == null && legendMeta?.max == null : geophysPtsMin == null && geophysPtsMax == null) && <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", marginTop: 2, lineHeight: 1.4 }}>{tr("Colours use the 2–98 percentile of the values, so a few extreme readings do not wash out the map. Edit a limit to change it.")}</div>/* #1177 */}
            {/* TASKS.csv #122 — same graduated/classed symbology (user-defined class breaks, adjustable
                palette) voxel models already have, reused directly: geophysPtsModel below is shaped
                exactly like a real voxel model ({min,max,colorMode,stops,cells}) so VoxelLegendEditor
                — built generically against that shape, not tied to actual voxel-model objects — works
                unchanged. geophysPtsOnUpdate routes its onUpdate(id, patch) calls to the store fields
                instead of a per-model update, since geophys_pts is one flat layer, not a list. */}
            {min !== null && (() => { // TASKS.csv #1787 — Linear / Log colour scale for a positive survey (log: viridis on log-spaced stops)
              const cur = manySurveys ? { min: legendMeta?.min ?? legendDrawn.min, max: legendMeta?.max ?? legendDrawn.max, stops: legendMeta?.stops || [] } : { min: geophysPtsMin ?? drawnRange.min, max: geophysPtsMax ?? drawnRange.max, stops: geophysPtsStops };
              if (!((manySurveys ? legendRange.min : min) > 0) || !(cur.min > 0 && cur.max > cur.min)) return null;
              const isLog = isLogSpaced(cur.stops), dec = decadesBetween(cur.min, cur.max);
              return (
                <div style={{ marginTop: 6, fontSize: "var(--font-size-sm)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--color-text-faint)", width: 62, flexShrink: 0 }}>{tr("Colour scale")}</span>
                    <select value={isLog ? "log" : "linear"} aria-label={tr("Colour scale of the point survey")} style={{ ...numInput, flex: 1, minWidth: 0 }}
                      onChange={(e) => ptsLegendUpdate("geophys_pts", e.target.value === "log" ? { stops: logViridisStops(cur.min, cur.max), colorMode: "continuous" } : { stops: [] })}>
                      <option value="linear">{tr("Linear")}</option>
                      <option value="log">{tr("Log (each decade the same share of the colours)")}</option>
                    </select>
                  </div>
                  {!isLog && dec >= 2 && <div style={{ color: "var(--color-warn-text)", fontSize: "var(--font-size-xs)", marginTop: 3, lineHeight: 1.4 }}>{tr("These values span {d} decades: on a linear scale most points share the lowest colours. A log scale spreads them.", { d: dec.toFixed(1) })}</div>}
                </div>
              );
            })()}
            {min !== null && (
              <VoxelLegendEditor
                key={manySurveys ? legendKey : "all"}
                model={manySurveys
                  ? { id: "geophys_pts", min: legendMeta?.min ?? legendDrawn.min, max: legendMeta?.max ?? legendDrawn.max, colorMode: legendMeta?.colorMode || "continuous", stops: legendMeta?.stops || [], cells: legendRows } // #1587 — this survey's own legend
                  : { id: "geophys_pts", min: geophysPtsMin ?? drawnRange.min, max: geophysPtsMax ?? drawnRange.max, colorMode: geophysPtsColorMode, stops: geophysPtsStops, cells: rows }}
                onUpdate={ptsLegendUpdate} /* #1787 — the same routing, shared with the colour-scale choice */
              />
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => goToModule("viewer")} style={{ ...pBtn, marginBottom: 0, flex: 1, justifyContent: "center" }}>{tr("View in 3D")}{" "}<ArrowRight size={14} />
              </button>
              <button
                onClick={() => { if (window.confirm(tr("Clear all {rows} geophysics point(s)?", { rows: rows.length }))) { replaceLayer("geophys_pts", []); setError(null); setXyzError(null); /* #2871 — no 'Imported 7809 point(s)' left on screen */ } }}
                style={{ ...pBtn, marginBottom: 0, width: 90, justifyContent: "center", color: "var(--color-danger-fg)" }}
              >
                <Trash2 size={14} />{" "}{tr("Clear")}</button>
            </div>
            {/* TASKS.csv #51 — Voronoi/Delaunay tessellation + polygonal declustering, over whatever
                point cloud is currently loaded. Needs >=3 points to be meaningful (see SpatialAnalysis's
                own guard), so only shown once points exist rather than as a separately-gated button. */}
            <button onClick={() => setSpatialOpen(true)} style={{ ...pBtn, marginTop: 8, marginBottom: 0, justifyContent: "center" }}>
              <Triangle size={14} />{" "}{tr("Spatial analysis (Voronoi / declustering)…")}</button>
            {/* TASKS.csv #235 — grid this point cloud into a raster (inverse-distance weighting), pure JS. */}
            <button onClick={() => setIdwOpen((v) => !v)} style={{ ...pBtn, marginTop: 8, marginBottom: 0, justifyContent: "center", background: idwOpen ? "var(--color-selected-bg)" : undefined }}>
              <Box size={14} />{" "}{tr("Grid to raster (IDW, minimum curvature, spline)…")}</button>
            {idwOpen && (
              <div style={{ marginTop: 8, padding: "9px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>{/* TASKS.csv #2846 */}
                  <span style={{ color: "var(--color-text-faint)", width: 70, flexShrink: 0 }}>{tr("Method")}</span>
                  <select value={idwMethod} onChange={(e) => setIdwMethod(e.target.value)} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Gridding method")}>
                    <option value="idw">{tr("IDW")}</option><option value="mincurv">{tr("Minimum curvature")}</option><option value="spline">{tr("Spline (Python engine)")}</option>
                  </select>
                </div>
                <div style={{ color: "var(--color-text-secondary)", marginBottom: 8, lineHeight: 1.5 }}>{idwMethod === "mincurv" ? tr("A tensioned minimum-curvature surface through the stations, the usual gridder for gravity and magnetic stations: smooth between them, so its derivatives show the geology rather than the station pattern. Tension 0.25 is the usual choice for potential fields.") : idwMethod === "spline" ? tr("Verde's biharmonic spline on block medians of the stations, its damping chosen by cross-validation, in the Python engine: smooth, and slower than minimum curvature on a large survey.") : tr("Interpolates a regular raster over this point cloud's own extent using inverse-distance weighting — a quick-look grid, not a geostatistically rigorous one (no variogram/kriging). Good for visualizing trend/coverage, not for resource estimation.")}</div>
                {idwShape?.is3D && ( // #1783
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: "var(--color-warn-text)", fontSize: "var(--font-size-sm)", lineHeight: 1.4, marginBottom: 4 }}>{tr("This is a 3D point cloud, not a surface survey: {n} points from {lo} to {hi} m elevation (within a plan cell their elevations spread {k}× the cell). A raster flattens every depth into one value per cell, so grid one depth slice at a time.", { n: idwShape.n.toLocaleString(), lo: Math.round(idwShape.zMin).toLocaleString(), hi: Math.round(idwShape.zMax).toLocaleString(), k: idwShape.spread.toFixed(0) })}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: "var(--color-text-faint)", width: 70, flexShrink: 0 }}>{tr("Slice z (m)")}</span>
                      <input type="number" step="any" value={idwZ.lo} placeholder={String(Math.round(idwShape.zMin))} onChange={(e) => setIdwZ((z) => ({ ...z, lo: e.target.value }))} style={{ ...numInput, width: 80 }} aria-label={tr("Lowest elevation of the slice")} />
                      <span style={{ color: "var(--color-text-muted)" }}>{tr("to")}</span>
                      <input type="number" step="any" value={idwZ.hi} placeholder={String(Math.round(idwShape.zMax))} onChange={(e) => setIdwZ((z) => ({ ...z, hi: e.target.value }))} style={{ ...numInput, width: 80 }} aria-label={tr("Highest elevation of the slice")} />
                      <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{tr("{n} points in the slice", { n: idwSlice.length.toLocaleString() })}</span>
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ color: "var(--color-text-faint)", width: 70, flexShrink: 0 }}>{tr("Cell size")}</span>
                  <input type="number" min="0.1" step="any" value={idwCellText} placeholder={String(idwAutoCell)} onChange={(e) => setIdwCellText(e.target.value)} style={numInput} aria-label={tr("Cell size")} />
                </div>
                {idwSuggest && idwCellText === "" && <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", marginBottom: 6 }}>{tr("Cell {c} m by default: a quarter to a half of the median spacing ({s} m).", { c: idwAutoCell, s: idwSuggest.spacing.toFixed(1) })}</div>}{/* #2562 */}
                {idwMethod === "idw" && <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <span style={{ color: "var(--color-text-faint)", width: 70, flexShrink: 0 }} title={tr("How sharply influence falls off with distance — higher means nearer points dominate more.")}>{tr("Power")}</span>
                  <input type="number" min="0.5" step="0.5" value={idwPower} onChange={(e) => setIdwPower(Math.max(0.5, Number(e.target.value) || 2))} style={numInput} />
                </div>}
                {idwMethod === "mincurv" && <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>{/* #2846 */}
                  <span style={{ color: "var(--color-text-faint)", width: 70, flexShrink: 0 }} title={tr("0 is pure minimum curvature (smoothest; overshoots most between stations), 1 a membrane (no overshoot, tent-shaped between stations).")}>{tr("Tension")}</span>
                  <input type="number" min="0" max="1" step="0.05" value={idwTension} onChange={(e) => setIdwTension(Math.min(1, Math.max(0, Number(e.target.value) || 0)))} style={numInput} aria-label={tr("Tension")} />
                </div>}
                {/* TASKS.csv #538 — which survey, and how far from the data a cell may be */}
                {surveyList.length > 1 && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ color: "var(--color-text-faint)", width: 70, flexShrink: 0 }}>{tr("Survey")}</span>
                    <select value={idwKey} onChange={(e) => { setIdwSurvey(e.target.value); setLegendSurvey(e.target.value); /* #2562 */ }} style={{ ...numInput, flex: 1, minWidth: 0 }} aria-label={tr("Survey to grid")}>
                      {surveyList.map((s) => <option key={s.key} value={s.key}>{s.key} ({s.count.toLocaleString()})</option>)}
                    </select>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }} title={tr("Cells farther than this from every point are left empty (transparent) instead of extrapolated. Default: 1.5x the median spacing between lines (2x the station spacing for scattered stations). 0 = fill everything.")}>
                  <span style={{ color: "var(--color-text-faint)", width: 70, flexShrink: 0 }}>{tr("Blank > (m)")}</span>
                  <input type="number" min="0" step="any" value={idwBlank} placeholder={idwSuggest ? String(Math.round(idwSuggest.distance)) : "none"} onChange={(e) => setIdwBlank(e.target.value)} style={numInput} aria-label={tr("Blanking distance")} />
                </div>
                {idwSuggest && idwBlank === "" && <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", marginBottom: 6 }}>{tr("Default {v} m: median {basis} {spacing} m.", { v: Math.round(idwSuggest.distance), basis: idwSuggest.basis, spacing: idwSuggest.spacing.toFixed(1) })}</div>}
                {/* TASKS.csv #372 — colour stretch */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }} title={tr("Percentile clip: the 2nd-98th percentile spans the colours, extremes saturate (default). Equalize: every colour covers the same number of cells (shows texture; colour no longer scales with value). Linear: min to max (a few extreme values squeeze everything else into one colour).")}>
                  <span style={{ color: "var(--color-text-faint)", width: 70, flexShrink: 0 }}>{tr("Colours")}</span>
                  <select value={idwStretch} onChange={(e) => setIdwStretch(e.target.value)} style={{ ...numInput, flex: 1 }} aria-label={tr("Colour stretch")}>
                    <option value="p2-98">{tr("2-98% percentile clip")}</option>
                    <option value="equalise">{tr("Histogram equalized")}</option>
                    <option value="linear">{tr("Linear min-max")}</option>
                  </select>
                </div>
                {idwBusy && <div role="status" style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", marginBottom: 6 }}><span style={{ flex: 1 }}>{idwBusy}</span>{idwMethod === "mincurv" && <button type="button" onClick={() => idwCancel.current?.()} style={{ ...pBtn, width: "auto", marginTop: 0, marginBottom: 0 }}>{tr("Cancel")}</button>}</div>}
                <button
                  disabled={!!idwBusy}
                  onClick={async () => {
                    const pts = idwSlice; // #1783 — a 3D cloud: the chosen depth slice
                    if (!pts.length) { setError(tr("No points in that elevation slice.")); return; }
                    // TASKS.csv #2557 — a single traverse became an 80 x 1 'grid' that RTP then filtered as a map
                    if (pointsAlongOneLine(pts, idwCellSize)) { setError(tr("The {n} points lie along one line: a grid of them is a single row of cells, which the map filters (RTP, derivatives…) would treat as a map. Plot the line as a profile instead.", { n: pts.length.toLocaleString() })); return; }
                    const sliceTag = idwShape?.is3D ? ` z ${idwZ.lo === "" ? Math.round(idwShape.zMin) : idwZ.lo}–${idwZ.hi === "" ? Math.round(idwShape.zMax) : idwZ.hi} m` : "";
                    const xs = pts.map((r) => r.x), ys = pts.map((r) => r.y);
                    const { xmin, xmax, ymin, ymax } = snappedGridExtent({ xmin: arrMin(xs), xmax: arrMax(xs), ymin: arrMin(ys), ymax: arrMax(ys) }, idwCellSize); // #2872 — nodes on multiples of the cell, every station inside
                    const gridW = Math.round((xmax - xmin) / idwCellSize), gridH = Math.round((ymax - ymin) / idwCellSize);
                    if (gridW * gridH > 4_000_000) { setError(tr("That cell size would produce a {gridW}×{gridH} grid — too large. Use a bigger cell size.", { gridW, gridH })); return; }
                    const blank = idwBlank === "" ? idwSuggest?.distance ?? Infinity : Number(idwBlank) > 0 ? Number(idwBlank) : Infinity; // #538
                    const label = surveyLabel(idwKey); // #2559 — 'file.csv · K_pct' kept its channel ('[^.]+$' took '.csv · K_pct' off)
                    const tag = gridMethodTag(idwMethod, idwTension); // #2846
                    const gName = uniqueName(`${label}${sliceTag} ${tag} ${idwCellSize} m${Number.isFinite(blank) ? `, blanked > ${Math.round(blank)} m` : ""}`, rasters.map((x) => x.name)); // sliceTag: #1783; uniqueName: #2562
                    let raster, how = {};
                    if (idwMethod === "idw") raster = idwGridToRasterInput(pts, { xmin, ymin, xmax, ymax, cellSize: idwCellSize, power: idwPower, stretch: idwStretch, maxDistance: blank, name: gName });
                    else { // TASKS.csv #2846 — minimum curvature (here, in JS) or the spline (the Python engine), through Geochem's gridder
                      const gOpts = { cell: idwCellSize, blank, method: idwMethod, tension: idwTension };
                      let res;
                      if (idwMethod === "spline") {
                        const sp = surveySplineRequest(pts, gOpts);
                        if (sp.error) res = sp;
                        else {
                          setIdwBusy(tr("Starting the Python engine…"));
                          const job = await runPfieldsJob(sp.request, { onProgress: (q) => setIdwBusy(q.message || tr("Working…")) });
                          setIdwBusy(null);
                          if (!job.ok) { setError(tr("The spline failed: {message}", { message: job.error })); return; }
                          res = splineFinish(sp.plan, b64ToF32(job.data.values), job.data);
                        }
                      } else {
                        setIdwBusy(tr("Gridding {n} stations by minimum curvature…", { n: pts.length.toLocaleString() }));
                        const job = gridSurveyAsync(pts, gOpts); // a worker: tens of seconds on a large survey
                        idwCancel.current = job.cancel;
                        try { res = await job.promise; } catch (err) { setIdwBusy(null); idwCancel.current = null; setError(tr("Minimum curvature failed: {message}", { message: err.message })); return; }
                        setIdwBusy(null); idwCancel.current = null;
                        if (res.cancelled) { setError({ info: true, text: tr("Cancelled.") }); return; }
                      }
                      if (res.error === "mincurvCells") { setError(tr("Minimum curvature takes grids up to {max} cells, and this one is {gridW}×{gridH}. Use a bigger cell size, or IDW.", { max: MINCURV_MAX_CELLS.toLocaleString(), gridW: res.nx, gridH: res.ny })); return; }
                      if (res.error === "splineCells") { setError(tr("The spline takes grids up to {max} cells, and this one is {gridW}×{gridH}. Use a bigger cell size.", { max: SPLINE_MAX_CELLS.toLocaleString(), gridW: res.nx, gridH: res.ny })); return; }
                      if (res.error === "cells") { setError(tr("That cell size would produce a {gridW}×{gridH} grid — too large. Use a bigger cell size.", { gridW: res.nx, gridH: res.ny })); return; }
                      if (res.error) { setError(tr("Too few points to grid ({n}): at least 3 with a value are needed.", { n: res.n ?? 0 })); return; }
                      raster = gridValuesToRasterInput(res.grid.values, res.grid.nx, res.grid.ny, { xmin: res.bbox[0], ymax: res.bbox[3], cellSize: res.cellM, name: gName, stretch: idwStretch });
                      how = idwMethod === "mincurv" ? { tension: idwTension, iterations: res.iterations } : { damping: res.damping, cvR2: res.cvScore, splinePoints: res.splinePoints, blockM: res.blockM };
                    }
                    // TASKS.csv #2239 (review #2174) — stations with elevations are drawn at THEIR median elevation: a ground-mag grid at z 400 went to the
                    // collars' median (192.55 m, an underground mine level), 207 m under the survey and through the holes. The collar median only when
                    // the points have no z.
                    const ptsZs = pts.map((r) => r.z).filter(Number.isFinite), ptsZ = ptsZs.length ? median(ptsZs) : null;
                    const gridElev = ptsZ != null ? ptsZ : defaultElevation;
                    addRaster({ ...raster, elevation: gridElev, provenance: { tool: idwMethod === "mincurv" ? "Point survey gridding (minimum curvature with tension)" : idwMethod === "spline" ? "Point survey gridding (Verde biharmonic spline on block medians, damping by blocked cross-validation)" : "IDW gridding", survey: idwKey, points: pts.length, cellM: idwCellSize, ...(idwMethod === "idw" ? { power: idwPower } : how) /* #2846 */, blankingM: Number.isFinite(blank) ? Math.round(blank) : null, blankingBasis: idwBlank === "" && idwSuggest ? `1.5x / 2x the median ${idwSuggest.basis} (${idwSuggest.spacing.toFixed(1)} m)` : "entered" }, surveyMethod: geophysSurveys?.[idwKey]?.method || undefined, units: geophysSurveys?.[idwKey]?.units || undefined /* #2557 */ });
                    const cells = raster.grid.nx * raster.grid.ny;
                    // TASKS.csv #2075 (review #2013, Geophysics) — where the raster is drawn: Woodjam's n = 1 grid went flat at 965 m (the collars' median,
                    // 10 km away) while its ground is 1,062-1,116 m, and nothing said so
                    const where = terrain ? tr(" Draped on the terrain.") : ptsZ != null ? tr(" Drawn flat at {z} m, the stations' median elevation (there is no terrain to drape it on).", { z: Math.round(ptsZ).toLocaleString() }) : tr(" Drawn flat at {z} m ({basis}), not on the ground: there is no terrain. Add one (Maps > Terrain) to drape it, or set its elevation on its card.", { z: Math.round(defaultElevation).toLocaleString(), basis: drapeAt.source === "collars" ? tr("the collars' median elevation") : drapeAt.source === "model" ? tr("the top of {model}", { model: drapeAt.model }) : drapeAt.source === "samples" ? tr("the surface samples' median elevation") : tr("no elevation known") });
                    const idwArgs = { idwKey, pts: pts.length.toLocaleString(), idwCellSize, valid: raster.grid.valid.toLocaleString(), cells: cells.toLocaleString(), v: Number.isFinite(blank) ? tr("; cells more than {v} m from any point are left empty", { v: Math.round(blank) }) : "" };
                    // TASKS.csv #2557 — the map filters are for magnetic and gravity grids; a radiometric / EM grid is not told they work on it
                    const group = SURVEY_METHODS[geophysSurveys?.[idwKey]?.method]?.group;
                    const potential = ["mag", "grav"].includes(group) || !geophysSurveys?.[idwKey]?.method;
                    // TASKS.csv #2870 — a gravity grid is not offered RTP (filterBlockedBy): the line names the filters that do work on it
                    const kept = !potential ? tr("Gridded \"{idwKey}\" ({pts} points) at {idwCellSize} m: {valid} of {cells} cells have a value{v}. The grid's values are kept for its colours and the ternary image; the map filters are for magnetic and gravity grids.", idwArgs)
                      : group === "grav" ? tr("Gridded \"{idwKey}\" ({pts} points) at {idwCellSize} m: {valid} of {cells} cells have a value{v}. The grid's values are kept, so the raster filters (derivatives, continuation…) work on it.", idwArgs)
                      : tr("Gridded \"{idwKey}\" ({pts} points) at {idwCellSize} m: {valid} of {cells} cells have a value{v}. The grid's values are kept, so the raster filters (RTP, derivatives…) work on it.", idwArgs);
                    // TASKS.csv #2846 — what the method was, and (IDW) what its derivatives show
                    const howText = idwMethod === "mincurv" ? tr(" Minimum curvature, tension {t} ({it} iterations).", { t: idwTension, it: (how.iterations ?? 0).toLocaleString() })
                      : idwMethod === "spline" ? tr(" Spline: fitted to {pts} block median(s) {b} m across; damping {d} chosen by cross-validation, R² {r} on the held-out blocks.", { pts: (how.splinePoints ?? 0).toLocaleString(), b: Math.round(how.blockM ?? idwCellSize), d: how.damping == null ? tr("none") : String(how.damping), r: Number.isFinite(how.cvR2) ? how.cvR2.toFixed(2) : "–" })
                      : potential ? tr(" Derivatives of an IDW grid show the station pattern (a bull's-eye at each station): grid with minimum curvature for derivatives.") : "";
                    setError({ info: true, text: kept + howText + where }); // where: #2075
                    setIdwOpen(false);
                  }}
                  style={{ ...pBtn, marginBottom: 0, justifyContent: "center" }}
                >{tr("Generate raster")}</button>
              </div>
            )}
          </div>
        )}

        {/* TASKS.csv #321 — SimPEG magnetics/gravity forward modelling and inversion, fed by the survey
            points above (and the terrain below); results land in Voxel / block models.
            TASKS.csv #457 — moved up here, directly under the survey it works on: below Boundaries, as a
            collapsed grey caption, the user could not find it at all. */}
        </>)}
        {geoPane === "inversion" && (<>
        <TaskPaneHeader title="Mag / gravity inversion (SimPEG)" icon={RMagnet} tone="model" />
        <InversionPanel pBtn={pBtn} numInput={numInput} inPane resultSlot={resultSlot} />

        </>)}
        {geoPane === "dcip" && (<>
        <TaskPaneHeader title="DC resistivity / IP line (2D, SimPEG)" icon={RZap} tone="model" />
        <DcipPanel pBtn={pBtn} numInput={numInput} resultSlot={resultSlot} />
        </>)}
        {geoPane === "terrain" && (<>
        <TaskPaneHeader title="Terrain (SRTM / DEM)" icon={RMountain} tone="data" />
        <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>{tr("Terrain (SRTM/DEM)")}<InfoButton title={tr("Terrain (SRTM/DEM)")} text={tr("Import a georeferenced elevation GeoTIFF (SRTM or any other DEM) to build real terrain geometry in the 3D view, instead of a flat ground plane — raster drapes above can then optionally conform to it (\"Drape on terrain\" per raster) instead of sitting at a fixed elevation. Select multiple adjacent tiles at once (e.g. two neighbouring SRTM tiles) to merge them into one terrain surface. A geographic (lon/lat) source is automatically reprojected into the project’s own EPSG if possible, so it lines up with the rest of the project. Downsampled to a modest mesh resolution regardless of source size. Only one terrain surface per project.")} />
        </div>
        {/* TASKS.csv #419 — for a DEM with no CRS tag or a wrong one */}
        <SourceCrsField
          label={tr("DEM source CRS")} value={demSourceEpsg} onChange={(c) => setDemSourceEpsg(c === "" ? "" : String(c))} mineGrid={mineSourceOf(project) /* #2684 */}
          defaultText={tr("From the file's own CRS tag")}
          title={tr("Leave it on the file's own tag. Change it when the DEM has no tag or a wrong one (e.g. NAD83 / BC Albers for a BC TRIM DEM, NAD83(CSRS) longitude/latitude for NRCan CDEM).")}
        />
        {(collars || []).length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer" }} title={tr("Reads only the part of each DEM tile around the drillholes, at a resolution that suits the 200 x 200 terrain grid — much less memory than decoding whole tiles, and much finer cells. Untick to import whole tiles.")}>
            <input type="checkbox" checked={demCrop} onChange={(e) => setDemCrop(e.target.checked)} />{" "}{tr("Crop to the drillholes +")}<input type="number" min="1000" step="500" value={demCropBuffer} onChange={(e) => setDemCropBuffer(e.target.value)} style={{ ...numInput, width: 70, flex: "none" }} aria-label={tr("Crop buffer in metres")} /> m
          </label>
        )}
        {/* TASKS.csv #814 — online elevation model */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
          <span style={{ flexShrink: 0 }}>{tr("Online source")}</span>
          <select value={terrainSource} onChange={(e) => setTerrainSource(e.target.value)} style={{ ...numInput, width: "auto", flex: 1 }} aria-label={tr("Online source")}
            title={tr("AWS Terrain Tiles: SRTM blended with national models (CDEM in Canada), up to ~5 m pixels; the fetch checks it for isolated cones against Copernicus and warns. Copernicus GLO-30: one consistent global model, ~30 m, a surface model (forest adds some metres). NRCan MRDEM-30 (Canada only): 30 m bare-earth terrain, using lidar where it exists. NRCan HRDEM: 1 m lidar terrain where a survey has been flown, MRDEM-30 elsewhere.")}>
            <option value="aws">{tr("AWS Terrain Tiles (SRTM / CDEM blend)")}</option>
            <option value="copernicus">{tr("Copernicus GLO-30 (~30 m)")}</option>
            <option value="mrdem" disabled={outsideCanada && terrainSource !== "mrdem"}>{tr("NRCan MRDEM-30 (Canada, bare earth)")}</option>{/* TASKS.csv #815; disabled outside Canada: #2465 */}
            <option value="hrdem" disabled={outsideCanada && terrainSource !== "hrdem"}>{tr("NRCan HRDEM lidar (Canada, where flown)")}</option>
          </select>
        </div>
        {/* TASKS.csv #796 — terrain detail */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
          <span style={{ flexShrink: 0 }}>{tr("Terrain detail")}</span>
          <select value={terrainDetail} onChange={(e) => setTerrainDetail(Number(e.target.value))} style={{ ...numInput, width: "auto", flex: 1 }} aria-label={tr("Terrain detail")}
            title={tr("Nodes along the terrain's longer side, for the next fetch or import. High and Very high are drawn as an adaptive mesh: many triangles where the ground is rough, few where it is smooth, about 110,000 to 160,000 in all.")}>
            <option value={200}>{tr("Standard (200 nodes)")}</option>
            <option value={513}>{tr("High (513 nodes)")}</option>
            <option value={1025}>{tr("Very high (1,025 nodes)")}</option>
          </select>
        </div>
        {terrainDetail > 200 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tr("Finer ground for the next fetch or import: about {mb} MB in memory, {mb2} MB in the project file, and up to a second to build the mesh.", { mb: terrainDetail > 600 ? 9 : 2, mb2: terrainDetail > 600 ? 6 : 1.5 })}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => terrainInput.current.click()} style={{ ...pBtn, flex: 1 }} disabled={terrainBusy}>
            {terrainBusy && !srtmProgress ? <Loader2 size={14} className="spin" /> : <Mountain size={14} />} {terrainBusy && !srtmProgress ? tr("Reading…") : terrain ? tr("Replace terrain…") : tr("Import SRTM/DEM…")}
          </button>
          <button
            onClick={openSrtmPicker}
            style={{ ...pBtn, flex: 1 }}
            disabled={terrainBusy}
            title={tr("Pick an area on a map and fetch elevation for it — no manual download needed")}
          >
            {srtmProgress ? <Loader2 size={14} className="spin" /> : <Radio size={14} />} {srtmProgress ? tr("Fetching {done}/{total}…", { done: srtmProgress.done, total: srtmProgress.total }) : tr("Fetch terrain for this area")}
          </button>
        </div>
        <button onClick={() => pointsTerrainInput.current.click()} style={{ ...pBtn, marginTop: 6 }} disabled={terrainBusy}
          title={tr("Survey points (CSV, TXT or XYZ with X, Y and elevation) or contour lines and spot heights in a DXF: triangulated into a terrain, for a property with no elevation model")}>
          <Triangle size={14} /> {tr("Terrain from points or contours…")}
        </button>{/* TASKS.csv #894 */}
        <button onClick={() => lidarInput.current.click()} style={{ ...pBtn, marginTop: 6 }} disabled={terrainBusy || lidarBusy}
          title={tr("A lidar point cloud (LAS, LAZ or COPC): a terrain from its ground-classified points, and a thinned cloud in the 3D View")}>
          <Mountain size={14} /> {tr("Lidar point cloud (LAS / LAZ)…")}
        </button>{/* TASKS.csv #1994 */}
        <input ref={lidarInput} type="file" accept=".las,.laz" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) openLidar(f); e.target.value = ""; }} />
        {lidarPending && <LidarImportBox key={lidarPending.file.name + lidarPending.file.size} pending={lidarPending} projectEpsg={lidarPending.epsg} busy={lidarBusy} onImport={confirmLidar} onCancel={() => setLidarPending(null)} btn={pBtn} />}
        {projectZPoints.points.length >= 3 && (
          <button onClick={terrainFromProject} style={{ ...pBtn, marginTop: 6 }} disabled={terrainBusy}
            title={tr("Triangulates the elevations the project's surface samples and drill collars already carry: offline, no file needed. Only as good as those elevations (GPS heights are rough).")}>
            <Triangle size={14} /> {tr("Terrain from this project's samples and collars ({n})", { n: projectZPoints.points.length.toLocaleString() })}
          </button>
        )}{/* TASKS.csv #1599 */}
        {projectZPoints.collarsOut.length > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.4 }}>{collarsOutNote(projectZPoints.collarsOut)}</div>}{/* TASKS.csv #2987 */}
        {projectZPoints.points.length >= 3 && benches.n > 0 && ( /* TASKS.csv #2589 */
          <label style={{ display: "block", marginTop: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
            {tr("Where collars stack ({n} collars share a spot with one {dz} m or more higher or lower, up to {max} m)", { n: benches.n.toLocaleString(), dz: BENCH_DZ_M, max: benches.maxDz.toFixed(1) })}
            <select value={benchMode} onChange={(e) => setBenchMode(e.target.value)} style={{ ...numInput, width: "100%", marginTop: 3 }}>
              <option value="all">{tr("Keep them all")}</option>
              <option value="lowest">{tr("Keep the lowest (the latest pit floor)")}</option>
              <option value="highest">{tr("Keep the highest (nearest the original ground)")}</option>
            </select>
          </label>
        )}
        <input ref={pointsTerrainInput} type="file" accept=".csv,.txt,.xyz,.dxf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importPointsTerrain(f); e.target.value = ""; }} />
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 4 }}>{tr("\"Fetch terrain for this area\" opens a map to draw the exact area you want — pre-filled around your drillholes, or your terrain or map layers if there are none; pan or redraw to widen or shift it. Public elevation data from the online source chosen above, no account and no manual download needed.")}</div>
        {srtmPickerOpen && (
          <BasemapView
            mode="draw"
            title={tr("Draw the area to fetch terrain for")} // #815
            lon={srtmSeedLonLat?.lon}
            lat={srtmSeedLonLat?.lat}
            initialBboxLonLat={srtmSeedBbox}
            areaOptions={srtmAreaOptions}
            onClose={() => setSrtmPickerOpen(false)}
            onConfirm={runSrtmFetch}
          />
        )}
        <input
          ref={terrainInput}
          type="file"
          accept=".tif,.tiff"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { const files = e.target.files; importTerrain(files); e.target.value = ""; }}
        />
        {terrainError && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: terrainError.info ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${terrainError.info ? "var(--color-border)" : "var(--color-danger-border)"}`, borderRadius: 6, fontSize: "var(--font-size-base)", color: terrainError.info ? "var(--color-text-secondary)" : "var(--color-danger-text)", lineHeight: 1.5 }}>
            {terrainError.text}
          </div>
        )}
        {terrain && (
          <div style={{ marginTop: 10, padding: "9px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateTerrain({ visible: terrain.visible === false })} style={{ cursor: "pointer", color: terrain.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                {terrain.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{terrain.name}</div>
              <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>{terrain.gridW}×{terrain.gridH}</span>
              <Trash2 aria-label={tr("Remove terrain \"{name}\"", { name: terrain.name })} title={tr("Remove terrain \"{name}\"", { name: terrain.name })} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(tr("Remove the terrain surface \"{name}\"? Any rasters draped on it will fall back to a flat elevation.", { name: terrain.name }))) removeTerrain(); }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
              <span style={{ color: "var(--color-text-faint)", width: 46, flexShrink: 0 }}>{tr("Colour")}</span>
              <input type="color" value={terrain.color || "#8a7f68"} onChange={(e) => updateTerrain({ color: e.target.value })} style={{ width: 26, height: 22, padding: 0, border: "1px solid var(--color-border)", borderRadius: 4, background: "transparent" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ color: "var(--color-text-faint)", width: 46, flexShrink: 0 }}>{tr("Opacity")}</span>
              <input type="range" min={0.1} max={1} step={0.05} value={terrain.opacity ?? 1} onChange={(e) => updateTerrain({ opacity: Number(e.target.value) })} style={{ flex: 1 }} />
            </div>
            <button onClick={exportTerrainGeoTIFF} style={{ ...pBtn, marginTop: 8, marginBottom: 0 }} title={tr("Export the merged/processed terrain's elevation grid as a single-band GeoTIFF")}>
              <Download size={14} />{" "}{tr("Export to GeoTIFF…")}</button>
            {/* TASKS.csv #237 — raster derivative: hillshade from the terrain's own elevation grid,
                standard Horn-method slope/aspect shading (same algorithm GDAL/QGIS's own hillshade tools
                use). Lands as an ordinary raster drape, same pipeline as every other raster source. */}
            <button onClick={() => setHillshadeOpen((v) => !v)} style={{ ...pBtn, marginTop: 6, marginBottom: 0, background: hillshadeOpen ? "var(--color-selected-bg)" : undefined }}>
              <Mountain size={14} />{" "}{tr("Hillshade, slope, aspect…")}</button>
            {hillshadeOpen && (
              <div style={{ marginTop: 6, padding: "8px 9px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                {/* TASKS.csv #797 — which terrain derivative */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ color: "var(--color-text-faint)", width: 60, flexShrink: 0 }}>{tr("Product")}</span>
                  <select value={derivKind} onChange={(e) => setDerivKind(e.target.value)} style={{ ...numInput, width: "auto", flex: 1 }} aria-label={tr("Terrain derivative")}>
                    <option value="hillshade">{tr("Hillshade (one sun)")}</option>
                    <option value="multi">{tr("Multidirectional hillshade")}</option>
                    <option value="slope">{tr("Slope (degrees)")}</option>
                    <option value="aspect">{tr("Aspect (direction the slope faces)")}</option>
                    <option value="curvature">{tr("Curvature (ridges / hollows)")}</option>
                  </select>
                </div>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tr({
                  hillshade: "Lit by one sun: structures parallel to the light direction disappear.",
                  multi: "Lit from 225°, 270°, 315° and 360°, each weighted by the slope's facing (GDAL's multidirectional method): structures at every strike show, useful for lineaments.",
                  slope: "Steepness from the terrain grid: white flat, dark steep (the darkest grey is the 98th percentile).",
                  aspect: "The compass direction each slope faces, as a colour wheel: north red, east yellow-green, south cyan, west blue; flat ground grey.",
                  curvature: "Convex (ridges, spurs) red, concave (hollows, gullies) blue, planar white - from the terrain grid's own spacing, so it sees landforms that size and larger.",
                }[derivKind])}</div>
                {derivKind === "hillshade" && <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ color: "var(--color-text-faint)", width: 60, flexShrink: 0 }} title={tr("Compass direction the light comes FROM (0=N, 90=E, 180=S, 270=W).")}>{tr("Sun azimuth")}</span>
                  <input type="number" min="0" max="360" value={hillshadeAzimuth} onChange={(e) => setHillshadeAzimuth(((Number(e.target.value) || 0) % 360 + 360) % 360)} style={numInput} />
                </div>}
                {(derivKind === "hillshade" || derivKind === "multi") && <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ color: "var(--color-text-faint)", width: 60, flexShrink: 0 }} title={tr("Height of the sun above the horizon, in degrees.")}>{tr("Sun altitude")}</span>
                  <input type="number" min="1" max="90" value={hillshadeAltitude} onChange={(e) => setHillshadeAltitude(Math.max(1, Math.min(90, Number(e.target.value) || 45)))} style={numInput} />
                </div>}
                <button
                  onClick={() => {
                    // TASKS.csv #2460 — a hillshade exaggerated by the terrain's own slopes (1x on rugged ground), the factor in its name and message
                    const shade = derivKind === "hillshade" || derivKind === "multi";
                    const zf = shade ? autoZFactor(terrain) : 1, zTag = zf > 1 ? `_x${zf}` : "";
                    const raster = derivKind === "hillshade"
                      ? hillshadeToRasterInput(terrain, { azimuthDeg: hillshadeAzimuth, altitudeDeg: hillshadeAltitude, zFactor: zf, name: `hillshade${zTag}_${terrain.name}` })
                      : terrainDerivativeToRasterInput(terrain, derivKind, { altitudeDeg: hillshadeAltitude, zFactor: zf, name: `${derivKind === "multi" ? "hillshade_multi" : derivKind}${zTag}_${terrain.name}` });
                    const { scale, ...r } = raster;
                    // #1626 — which terrain it was made from, so a replaced terrain can say this one is stale; its unit for the value grid
                    const unit = derivKind === "slope" ? "degrees" : derivKind === "aspect" ? "degrees from grid north" : derivKind === "curvature" ? "1/100 m" : null;
                    const earlier = earlierDerivatives(rasters, terrain); // #1764 — the new one is the one shown
                    earlier.forEach((x) => updateRaster(x.id, { visible: false }));
                    addRaster({ ...r, elevation: defaultElevation, drapeMode: "terrain", terrainDerivative: { kind: derivKind, terrainId: terrain.id ?? null, terrainName: terrain.name || "", unit } });
                    const hid = earlier.length ? " " + tr("{n} earlier derivative(s) of this terrain were hidden so this one shows: {names}. Tick them in the GeoTIFF / GXF list to show them again.", { n: earlier.length, names: earlier.map((x) => x.name).join(", ") }) : "";
                    if (shade && zf > 1) setTerrainError({ info: true, text: tr("Hillshade with a vertical exaggeration of {z}x, chosen from this terrain's slopes (its steepest 2 % shown near 30°): on low relief a true-scale hillshade is one flat grey.", { z: zf }) }); // #2460
                    else if (scale) setTerrainError({ info: true, text: derivKind === "slope" ? tr("Slope draped on the terrain: white {min}° or flatter, darkest grey {max}° or steeper (this terrain's 2-98 % range).", { min: +scale.min.toPrecision(2), max: +scale.max.toPrecision(2) }) /* #2460 */ : tr("Curvature draped on the terrain: red convex, blue concave, saturated at ±{max} (1/100 m).", { max: +scale.max.toPrecision(2) }) + (r.grid ? " " + tr("Its values are kept: export them, restyle them, or use them as targeting evidence from the raster's card.") : "") });
                    else setTerrainError(derivKind === "aspect" ? { info: true, text: tr("Aspect draped on the terrain: the direction each slope faces, in degrees clockwise from grid north (red north, yellow-green east, cyan south, blue-magenta west; grey flat). Its values are kept.") } : null); // #1626 — the previous product's message was left showing
                    if (hid) setTerrainError((prev) => ({ info: true, text: (prev?.text ? prev.text + " " : "") + hid.trim() })); // #1764
                    setHillshadeOpen(false);
                  }}
                  style={{ ...pBtn, marginBottom: 0, justifyContent: "center" }}
                >{tr("Generate")}</button>
              </div>
            )}

            {/* TASKS.csv #237 sub-item (2) — the other half of the original "no raster derivatives
                (contours, hillshade)" finding. Marching squares over the same terrain grid; output
                lands as ordinary BOUNDARY polylines (not a raster) since contours are genuinely
                vector data, and that pipeline already gives them colour, opacity and drape-on-terrain
                for free. One boundary per contour level so individual levels can be styled/hidden. */}
            <button onClick={() => { if (!contourOpen && !contourTyped) { const r = terrainRange(terrain); if (r) setContourInterval(niceContourInterval(r[0], r[1])); } setContourOpen((v) => !v); }} style={{ ...pBtn, marginTop: 6, marginBottom: 0, background: contourOpen ? "var(--color-selected-bg)" : undefined }}>{/* #2462 — the interval from the relief */}
              <Waypoints size={14} />{" "}{tr("Generate contours…")}</button>
            {contourMsg && ( /* #1759 */
              <div style={{ marginTop: 6, padding: "6px 8px", fontSize: "var(--font-size-sm)", borderRadius: 6, background: typeof contourMsg === "object" && contourMsg.info ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", color: typeof contourMsg === "object" && contourMsg.info ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>{typeof contourMsg === "object" ? contourMsg.text : contourMsg}</div>
            )}
            {contourOpen && (
              <div style={{ marginTop: 6, padding: "8px 9px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ color: "var(--color-text-faint)", width: 60, flexShrink: 0 }} title={tr("Vertical spacing between contour lines, in the DEM's own elevation units (metres).")}>{tr("Interval (m)")}</span>
                  <input type="number" min={MIN_CONTOUR_INTERVAL} step="any" value={contourInterval} onChange={(e) => { const v = Number(e.target.value); setContourTyped(true); if (e.target.value === "" || !Number.isFinite(v)) return; setContourClamped(v < MIN_CONTOUR_INTERVAL ? v : null); setContourInterval(Math.max(MIN_CONTOUR_INTERVAL, v)); }} style={numInput} />
                </div>
                {contourClamped != null && <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", margin: "-2px 0 6px" }}>{tr("{v} m was raised to {min} m, the smallest interval.", { v: contourClamped, min: MIN_CONTOUR_INTERVAL })}</div>}{/* #2462 */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ color: "var(--color-text-faint)", width: 60, flexShrink: 0 }} title={tr("Colour of the contour lines (all levels are one boundary).")}>{tr("Colour")}</span>
                  <input type="color" value={contourColor} onChange={(e) => setContourColor(e.target.value)} style={{ width: 30, height: 20, padding: 0, border: "1px solid var(--color-border-light)", borderRadius: 3, background: "none", cursor: "pointer" }} />
                </div>
                <button
                  onClick={() => {
                    setContourMsg(null);
                    const { levels, truncated, min, max } = contourTerrain(terrain, { interval: contourInterval });
                    if (!levels.length) {
                      setContourMsg(tr("No contours generated — the terrain spans {v}–{v2} m, so an interval of {contourInterval} m doesn't cross it anywhere. Try a smaller interval.", { v: Number.isFinite(min) ? min.toFixed(1) : "?", v2: Number.isFinite(max) ? max.toFixed(1) : "?", contourInterval }));
                      return;
                    }
                    // TASKS.csv #1466 (review #1352) — one boundary holding every level (each line at its own height), not one per level: 28
                    // entries for the Silvertip soil terrain flooded the Boundaries list and every area picker. A line that does not close on
                    // itself is flagged open, so area pickers leave it out.
                    const lines = [], closed = [], lineLevels = [];
                    levels.forEach(({ level, polylines }) => polylines.forEach((pl) => {
                      lines.push(pl.map((p) => ({ ...p, z: level })));
                      const a = pl[0], b = pl[pl.length - 1];
                      closed.push(pl.length > 3 && Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
                      lineLevels.push(level);
                    }));
                    // TASKS.csv #2462 — the same terrain at the same interval again replaces its contours (each repeat added an identical boundary)
                    const same = (boundaries || []).filter((b) => b.contourInterval === contourInterval && b.contourTerrain === terrain.name);
                    same.forEach((b) => removeBoundary(b.id));
                    addBoundary({ contourTerrain: terrain.name, name: tr("{terrain} contours ({interval} m)", { terrain: terrain.name, interval: contourInterval }), polylines: lines, closedFlags: closed, contourLevels: lineLevels, contourInterval: contourInterval, useVertexZ: true, color: contourColor, drapeMode: "flat" }); // contourInterval: #1466, its index contours
                    setContourMsg({ info: true, text: tr(levels.length === 1 ? "Generated {levels} contour level ({contourInterval} m interval) as one boundary.{v2}" : "Generated {levels} contour levels ({contourInterval} m interval) as one boundary.{v2}", { levels: levels.length, contourInterval, v2: truncated ? tr(" Stopped at the 200-level cap — use a larger interval for full coverage.") : "" }) + (same.length ? tr(" It replaces the earlier contours of this terrain at this interval.") : "") }); // #2462
                    setContourOpen(false);
                  }}
                  style={{ ...pBtn, marginBottom: 0, justifyContent: "center" }}
                >{tr("Generate")}</button>
              </div>
            )}
          </div>
        )}

        </>)}
        {geoPane === "boundaries" && (<>
        <TaskPaneHeader title="Boundaries" icon={RShapes} tone="data" />
        <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>{tr("Boundaries (.ply / DXF / shapefile / GeoPackage)")}<InfoButton title={tr("Boundaries")} text={tr("Import a Geosoft .ply boundary/polygon export, a DXF file, a shapefile (.zip/.shp), a GeoPackage (.gpkg), KML/KMZ, GPX or GeoJSON — property lines, claim blocks, survey/blind-grid extents, section templates from a surveyor or CAD/GIS package — as a polyline in the 3D view. Select multiple files at once, mixed formats if you like. DXF: only LINE/LWPOLYLINE/POLYLINE/POINT entities are read (2D plan-view CAD data, not 3D solids/text/blocks). Shapefile: every feature in the file becomes its own part of the same boundary. GeoPackage: each table with lines or polygons becomes its own boundary. Shapefile and GeoPackage are reprojected from their own CRS to the project's EPSG ({v}); KML/KMZ, GPX and GeoJSON from WGS 84. .ply and DXF files are taken to be in the project's EPSG already. A shapefile or GeoPackage that states no CRS is taken to be in the project's EPSG, and the import message says so: check where it lies.", { v: project?.crsSet === false ? tr("not chosen yet") : project?.epsg ?? "?" } /* #2289 */)} />
        </div>
        <SourceCrsField /* TASKS.csv #2684 — over the file's own CRS (.prj / GeoPackage); places a .ply / .dxf, which states none */
          value={boundarySource} onChange={(c) => setBoundarySource(c === "" ? "" : String(c))} mineGrid={mineSourceOf(project)}
          defaultText={tr("From the file (.prj / GeoPackage), else the project CRS")}
          title={tr("Leave it on the file's own CRS. Change it when a shapefile has no .prj or a wrong one, or for a .ply / .dxf on a mine grid or in another CRS. KML, GPX and GeoJSON are always longitude / latitude.")}
        />
        <button onClick={() => boundaryInput.current.click()} style={pBtn}>
          <Waypoints size={14} />{" "}{tr("Import boundary (.ply / .dxf / .zip / .shp / .gpkg / .kml / .gpx / .geojson)…")}</button>
        <input
          ref={boundaryInput}
          type="file"
          accept=".ply,.dxf,.zip,.shp,.prj,.dbf,.shx,.cpg,.gpkg,.kml,.kmz,.gpx,.geojson,.json" /* .prj .dbf .shx .cpg: #2121 */
          multiple
          style={{ display: "none" }}
          onChange={(e) => { importBoundaries(e.target.files); e.target.value = ""; }}
        />
        {boundaryError && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: boundaryError.info ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${boundaryError.info ? "var(--color-border)" : "var(--color-danger-border)"}`, borderRadius: 6, fontSize: "var(--font-size-base)", color: boundaryError.info ? "var(--color-text-secondary)" : "var(--color-danger-text)", lineHeight: 1.5 }}>
            {boundaryError.text}
          </div>
        )}
        {nonClaimBoundaries.map((b) => (
          <div key={b.id} style={{ marginTop: 10, padding: "9px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateBoundary(b.id, { visible: b.visible === false })} style={{ cursor: "pointer", color: b.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                {b.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
              <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }} title={b.partNames?.some(Boolean) ? b.partNames.filter(Boolean).join(", ") : undefined}>{tr("{v} part(s)", { v: b.polylines?.length || 0 })}</span>
              {polylinesBox(b.polylines) && <Crosshair role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Zoom the plan to \"{name}\"", { name: b.name })} title={tr("Zoom the plan to \"{name}\"", { name: b.name })} onClick={() => requestPlanZoom(polylinesBox(b.polylines))} />}{/* TASKS.csv #2657 */}
              <Trash2 aria-label={tr("Remove boundary \"{name}\"", { name: b.name })} title={tr("Remove boundary \"{name}\"", { name: b.name })} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(tr("Remove \"{name}\"?", { name: b.name }))) removeBoundary(b.id); }} />
            </div>
            {b.partNames?.some(Boolean) && ( /* TASKS.csv #2673 — the parts' names as labels in the 3D view (hovering a part names it anyway) */
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, cursor: "pointer", color: "var(--color-text-caption)", fontSize: "var(--font-size-sm)" }}>
                <input type="checkbox" checked={!!b.partLabels} onChange={(e) => updateBoundary(b.id, { partLabels: e.target.checked })} />{tr("Label the parts in the 3D view")}
              </label>
            )}
            {b.partNames?.some(Boolean) && ( /* TASKS.csv #1767 — the parts' own names, from the file */
              <div style={{ marginTop: 5, color: "var(--color-text-caption)", fontSize: "var(--font-size-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={[...new Set(b.partNames.filter(Boolean))].join(", ")}>{tr("Parts: {names}", { names: [...new Set(b.partNames.filter(Boolean))].join(", ") })}</div>
            )}
            {b.useVertexZ ? ( /* TASKS.csv #1630 — a contour set is drawn at its own levels: 'Drape' and 'Elev. 0' did nothing */
              <div style={{ marginTop: 7, color: "var(--color-text-caption)" }}>{tr("Drawn at its own levels (each contour at its elevation).")}</div>
            ) : (<>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, cursor: terrain ? "pointer" : "default", opacity: terrain ? 1 : 0.45 }}>
              <input type="checkbox" checked={b.drapeMode === "terrain"} disabled={!terrain}
                onChange={(e) => updateBoundary(b.id, { drapeMode: e.target.checked ? "terrain" : "flat" })} />
              <span style={{ color: "var(--color-text-caption)" }}>{tr("Drape on terrain{v}", { v: !terrain ? tr(" (import a DEM in Terrain first)") : "" })}</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, opacity: b.drapeMode === "terrain" ? 0.4 : 1 }}>
              <span style={{ color: "var(--color-text-faint)", width: 46, flexShrink: 0 }}>{tr("Elev.")}</span>
              <input type="number" value={Math.round(b.elevation)} disabled={b.drapeMode === "terrain"} onChange={(e) => updateBoundary(b.id, { elevation: Number(e.target.value) })} style={numInput} />
            </div>
            </>)}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ color: "var(--color-text-faint)", width: 46, flexShrink: 0 }}>{tr("Colour")}</span>
              <input type="color" value={b.color || "#e2a63c"} onChange={(e) => updateBoundary(b.id, { color: e.target.value })} style={{ width: 26, height: 22, padding: 0, border: "1px solid var(--color-border)", borderRadius: 4, background: "transparent" }} />
            </div>
            {(b.contourLevels || []).length > 0 && ( /* TASKS.csv #1466 / #1622 — a contour layer's labels in the 3D View */
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, cursor: "pointer" }}
                title={tr("Writes the level on the index contours in the 3D View (every fifth level of a regular series, every level of a few chosen ones); the other levels are drawn fainter.")}>
                <input type="checkbox" checked={b.contourLabels !== false} onChange={(e) => updateBoundary(b.id, { contourLabels: e.target.checked })} />
                <span style={{ color: "var(--color-text-caption)" }}>{tr("Label index contours")}</span>
              </label>
            )}
          </div>
        ))}

        </>)}
        {geoPane === "web" && (<>
        {/* TASKS.csv #543 — this dialog sat inside the Terrain pane, so "Add web layer" in this pane never showed it */}
        {webLayerModalOpen && (
          <AddWebLayerModal
            onClose={() => setWebLayerModalOpen(false)}
            addRaster={addRaster}
            addBoundary={addBoundary}
            addMapLayer={addMapLayer}
            projectEpsg={project?.epsg}
            defaultBboxLonLat={webLayerDefaultBbox}
          />
        )}
        <TaskPaneHeader title="Web layers (WMS / WFS)" icon={RGlobe} tone="data" />
        <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>{tr("Web layers (WMS / WFS)")}<InfoButton title={tr("Web layers")} text={tr("Add a layer directly from a government/company OGC service URL — the same kind of WMS (provincial bedrock geology, airborne mag) or WFS (claim-tenure) layer you'd add in QGIS. A WMS layer imports as a raster drape for a chosen area; a WFS layer imports as a Map layer that keeps its attributes, or as boundary lines if you choose.")} />
        </div>
        <button onClick={async () => {
          // #615 — a web map is fetched for wherever the project CRS puts the data: choose it first when it never was
          if (project?.crsSet === false) { if (await ensureProjectCrs(project, tr("Web map layers are downloaded for the place your coordinates point to, so the project needs its coordinate system first."))) setWebLayerModalOpen(true); return; }
          setWebLayerDefaultBbox(await defaultSrtmBboxLonLat()); setWebLayerModalOpen(true);
        }} style={pBtn}>
          <Globe size={14} />{" "}{tr("Add web layer (WMS / WFS)…")}</button>
        {/* TASKS.csv #2005 — Macrostrat's world geologic map (CC BY 4.0) for the project area, and the units at its centre */}
        <button onClick={async () => {
          if (project?.crsSet === false) { if (!(await ensureProjectCrs(project, tr("Web map layers are downloaded for the place your coordinates point to, so the project needs its coordinate system first.")))) return; }
          setWebLayerDefaultBbox(await defaultSrtmBboxLonLat()); setMacrostratOpen(true);
        }} style={pBtn} title={tr("Macrostrat's compilation of geologic maps (CC BY 4.0) for the project area, and the map units at its centre with their original maps")}>
          <Globe size={14} />{" "}{tr("Macrostrat geology…")}</button>
        {macrostratOpen && <React.Suspense fallback={null}><MacrostratModal onClose={() => setMacrostratOpen(false)} addRaster={addRaster} addMapLayer={addMapLayer} /* #2012 */ projectEpsg={project?.epsg} bboxLonLat={webLayerDefaultBbox} /></React.Suspense>}

        </>)}
        {geoPane === "claims" && (<>
        <TaskPaneHeader title="Mineral claims / tenure" icon={RFlag} tone="data" />
        <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>{tr("Mineral claims / tenure")}<InfoButton title={tr("Mineral claims / tenure")} text={tr("Import a claim/tenure boundary — .ply, DXF, shapefile (.zip/.shp), GeoPackage (.gpkg), KML/KMZ, GPX or GeoJSON, the same formats as the Boundaries pane (BC's Mineral Titles Online distributes claims as shapefiles, not .ply) — tracked with its own tenure number, status, and expiry date, and its area computed automatically (hectares, holes taken away). A shapefile or GeoPackage with several features (up to 300) becomes one claim per feature, its tenure number, name and good-to date read from attribute columns named that way. Status sets a default colour (active = green, pending = amber, expired = red) so standing is visible at a glance in the 3D view — still overridable per claim. Shapefile and GeoPackage are reprojected from their own CRS to the project's EPSG; KML/KMZ, GPX and GeoJSON from WGS 84; .ply and DXF files are taken to be in the project's EPSG already. A shapefile or GeoPackage that states no CRS is taken to be in the project's EPSG, and the import message says so: check where it lies.")} />
        </div>
        <SourceCrsField /* TASKS.csv #2684 — over the file's own CRS (.prj / GeoPackage); places a .ply / .dxf, which states none */
          value={boundarySource} onChange={(c) => setBoundarySource(c === "" ? "" : String(c))} mineGrid={mineSourceOf(project)}
          defaultText={tr("From the file (.prj / GeoPackage), else the project CRS")}
          title={tr("Leave it on the file's own CRS. Change it when a shapefile has no .prj or a wrong one, or for a .ply / .dxf on a mine grid or in another CRS. KML, GPX and GeoJSON are always longitude / latitude.")}
        />
        <button onClick={() => claimInput.current.click()} style={pBtn}>
          <Flag size={14} />{" "}{tr("Import claim boundary (.ply / .dxf / .zip / .shp / .gpkg / .kml / .gpx / .geojson)…")}</button>
        <input
          ref={claimInput}
          type="file"
          accept=".ply,.dxf,.zip,.shp,.prj,.dbf,.shx,.cpg,.gpkg,.kml,.kmz,.gpx,.geojson,.json" /* .prj .dbf .shx .cpg: #2121 */
          multiple
          style={{ display: "none" }}
          onChange={(e) => { importClaims(e.target.files); e.target.value = ""; }}
        />
        {claimMsg && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: claimMsg.info ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${claimMsg.info ? "var(--color-border)" : "var(--color-danger-border)"}`, borderRadius: 6, fontSize: "var(--font-size-base)", color: claimMsg.info ? "var(--color-text-secondary)" : "var(--color-danger-text)", lineHeight: 1.5 }}>
            {claimMsg.text}
          </div>
        )}
        {claims.length === 0 && (
          <div style={{ marginTop: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("No claims imported yet.")}</div>
        )}
        {claims.map((c) => (
          <div key={c.id} style={{ marginTop: 10, padding: "9px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateBoundary(c.id, { visible: c.visible === false })} style={{ cursor: "pointer", color: c.visible !== false ? (c.color || "#3ca65e") : "var(--color-text-disabled)", flexShrink: 0 }}>
                {c.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <input
                value={c.name} onChange={(e) => updateBoundary(c.id, { name: e.target.value })}
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: "var(--color-text)", fontSize: "var(--font-size-base)", padding: 0 }}
              />
              {polylinesBox(c.polylines) && <Crosshair role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Zoom the plan to \"{name}\"", { name: c.name })} title={tr("Zoom the plan to \"{name}\"", { name: c.name })} onClick={() => requestPlanZoom(polylinesBox(c.polylines))} />}{/* TASKS.csv #2657 */}
              <Trash2 aria-label={tr("Remove claim \"{name}\"", { name: c.name })} title={tr("Remove claim \"{name}\"", { name: c.name })} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(tr("Remove claim \"{name}\"?", { name: c.name }))) removeBoundary(c.id); }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
              <span style={{ color: "var(--color-text-faint)", width: 60, flexShrink: 0 }}>{tr("Tenure #")}</span>
              <input value={c.tenureNumber || ""} placeholder={tr("e.g. the tenure or tenement number")} /* #2465 — not a BC-style number everywhere */ onChange={(e) => updateBoundary(c.id, { tenureNumber: e.target.value })} style={{ ...numInput, flex: 1 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ color: "var(--color-text-faint)", width: 60, flexShrink: 0 }}>{tr("Status")}</span>
              <select
                value={c.status || "active"}
                onChange={(e) => updateBoundary(c.id, { status: e.target.value, color: claimStatusColor(e.target.value) })}
                style={{ ...numInput, flex: 1 }}
              >
                <option value="active">{tr("Active")}</option>
                <option value="pending">{tr("Pending")}</option>
                <option value="expired">{tr("Expired")}</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ color: "var(--color-text-faint)", width: 60, flexShrink: 0 }}>{tr("Expiry")}</span>
              <input type="date" value={c.expiryDate || ""} onChange={(e) => updateBoundary(c.id, { expiryDate: e.target.value })} style={{ ...numInput, flex: 1 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, fontSize: "var(--font-size-sm)", color: "var(--color-text-faint)" }}>
              <span style={{ width: 60, flexShrink: 0 }}>{tr("Area")}</span>
              <span>{tr("{v} ha", { v: boundaryAreaHectares(c.polylines).toLocaleString(undefined, { maximumFractionDigits: 1 }) })}</span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, cursor: terrain ? "pointer" : "default", opacity: terrain ? 1 : 0.45 }}>
              <input type="checkbox" checked={c.drapeMode === "terrain"} disabled={!terrain}
                onChange={(e) => updateBoundary(c.id, { drapeMode: e.target.checked ? "terrain" : "flat" })} />
              <span style={{ color: "var(--color-text-caption)" }}>{tr("Drape on terrain{v}", { v: !terrain ? tr(" (import a DEM in Terrain first)") : "" })}</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, opacity: c.drapeMode === "terrain" ? 0.4 : 1 }}>
              <span style={{ color: "var(--color-text-faint)", width: 60, flexShrink: 0 }}>{tr("Elev.")}</span>
              <input type="number" value={Math.round(c.elevation)} disabled={c.drapeMode === "terrain"} onChange={(e) => updateBoundary(c.id, { elevation: Number(e.target.value) })} style={{ ...numInput, flex: 1 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ color: "var(--color-text-faint)", width: 60, flexShrink: 0 }}>{tr("Colour")}</span>
              <input type="color" value={c.color || claimStatusColor(c.status)} onChange={(e) => updateBoundary(c.id, { color: e.target.value })} style={{ width: 26, height: 22, padding: 0, border: "1px solid var(--color-border)", borderRadius: 4, background: "transparent" }} />
            </div>
          </div>
        ))}

        {/* User question: "do you think we can increase the 100,000 3d budget? Is it gonna make GeoStrix
            crash?" — this budget (voxel.js's MAX_CELLS) was picked from THIS DEV SANDBOX's own render
            timing (no real GPU here, so it's a conservative guess, not a hard technical ceiling on
            Matt's actual machine) — see voxel.js's header comment. #1074: it CAN run out of memory
            (~0.4 GB per million cells, #661), so it stops at MAX_BLOCK_MODEL_BUDGET (2 million).
            Made adjustable here so Matt can raise
            it and see how his own hardware handles it, applies to both the OMF and UBC import sections
            below (both already accepted a maxCells parameter, just previously always the same
            hardcoded default). */}
        </>)}
        {geoPane === "mt" && (<Suspense fallback={null}><MtSoundingsPane layers={layers} setLayers={setLayers} geophysSurveys={geophysSurveys} updateGeophysSurvey={updateGeophysSurvey} project={project} setEpsg={setEpsg} projectIsEmpty={projectIsEmpty} pendingFiles={mtDrop} onPendingDone={() => setMtDrop(null)} onClose={() => setGeoPane(null)} /></Suspense>)}{/* TASKS.csv #1989 */}
        {geoPane === "fdem" && (<Suspense fallback={null}><FdemPane layers={layers} setLayers={setLayers} geophysSurveys={geophysSurveys} updateGeophysSurvey={updateGeophysSurvey} project={project} setEpsg={setEpsg} projectIsEmpty={projectIsEmpty} pendingFiles={fdemDrop} onPendingDone={() => setFdemDrop(null)} onClose={() => setGeoPane(null)} /></Suspense>)}{/* TASKS.csv #1986 */}
        {geoPane === "logs" && (<Suspense fallback={null}><DownholeLogsPane layers={layers} customLayers={customLayers} assays={assays} assayElements={assayElements} onClose={() => setGeoPane(null)} onEstimate={() => goToModule("modelling")} /></Suspense>)}{/* TASKS.csv #1425 */}
        {geoPane === "budget" && (<>
        <TaskPaneHeader title="3D view cell budget" icon={RSettings2} tone="view" />
        <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>{tr("3D view cell budget")}<InfoButton title={tr("3D view cell budget")} text={tr("A large OMF/UBC block model gets block-averaged down to this many cells before it's rendered, to keep the 3D view responsive. Higher = more detail but slower to render (especially on older/integrated GPUs) and more memory: about 0.4 GB per million cells, so it stops at {max} cells, above which GeoStrix can run out of memory. Only affects new imports, not models already in the project. Remembered on this computer.", { max: MAX_BLOCK_MODEL_BUDGET.toLocaleString() })} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <input
            type="number" min={MIN_CELL_BUDGET} max={MAX_BLOCK_MODEL_BUDGET} step={10000}
            value={voxelCellBudget ?? MAX_CELLS}
            onChange={(e) => { const v = Number(e.target.value); setVoxelCellBudget(Number.isFinite(v) && v > 0 ? v : null); }}
            onBlur={() => setVoxelCellBudget(clampCellBudget(voxelCellBudget))} // #1074 — clamped once typing ends (and on use)
            style={{ ...numInput, width: 100 }}
          />
          <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{tr("cells (default {MAX_CELLS})", { MAX_CELLS: MAX_CELLS.toLocaleString() })}</span>
          {voxelCellBudget != null && (
            <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setVoxelCellBudget(null)} style={{ cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)", marginLeft: "auto" }}>{tr("Reset to default")}</span>
          )}
        </div>
        {/* TASKS.csv #2969 — what the number costs and what it does, where it is set (the pane said only 'cells (default 100,000)') */}
        <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", lineHeight: 1.45, marginBottom: 12 }}>{tr("A model of {cells} cells takes about {gb} GB of memory while it is open. A UBC mesh, OMF volume or block-model CSV with more cells is merged into bigger blocks on import, and the import message says by how much.", { cells: clampCellBudget(voxelCellBudget ?? MAX_CELLS).toLocaleString(), gb: (clampCellBudget(voxelCellBudget ?? MAX_CELLS) * 0.4e-6).toFixed(2) })}</div>

        </>)}
        {geoPane === "omf" && (<>
        <TaskPaneHeader title="Open Mining Format (.omf)" icon={RPackage} tone="data" />
        <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>{tr("Open Mining Format (.omf)")}<InfoButton title={tr("Open Mining Format (.omf)")} text={tr("Import an .omf project — exported from Oasis montaj/Geosoft, Leapfrog, or any other tool that supports the format. A single file can carry point sets, line sets (veins/faults/traces), triangulated surfaces (contacts/wireframes), and block models all together; each is routed to the right renderer automatically. Only OMF v1 is supported so far (the version most exporters, including Oasis montaj/Leapfrog, still actually produce) — v2 files are detected and reported rather than silently mishandled. Grid-based (non-triangulated) surfaces aren't implemented yet.")} />
        </div>
        {/* TASKS.csv #1596 — keep the native cells where the holes are instead of coarsening the whole district */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", marginBottom: 6, flexWrap: "wrap", color: collars.length ? "var(--color-text)" : "var(--color-text-muted)" }}
          title={tr("A block model larger than the cell budget is coarsened (its blocks merged) to fit. Cropping it first to the drilled area keeps its own cell size there, instead of merged blocks over the whole model.")}>
          <input type="checkbox" checked={omfCrop.on && collars.length > 0} disabled={!collars.length} onChange={(e) => setOmfCrop((p) => ({ ...p, on: e.target.checked }))} />
          {tr("Crop block models to the drillholes +")}
          <input type="number" min="0" step="100" value={omfCrop.buffer} onChange={(e) => setOmfCrop((p) => ({ ...p, buffer: e.target.value }))} style={{ width: 64 }} aria-label={tr("Crop buffer around the drillholes (m)")} disabled={!collars.length} /> m
        </label>
        <button onClick={() => omfInput.current.click()} style={pBtn} disabled={omfBusy}>
          {omfBusy ? <Loader2 size={14} className="spin" /> : <Box size={14} />} {omfBusy ? tr("Reading…") : tr("Import OMF (.omf)…")}
        </button>
        <input
          ref={omfInput}
          type="file"
          accept=".omf"
          style={{ display: "none" }}
          onChange={(e) => { importOmf(e.target.files[0]); e.target.value = ""; }}
        />
        {omfError && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: omfError.info ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${omfError.info ? "var(--color-border)" : "var(--color-danger-border)"}`, borderRadius: 6, fontSize: "var(--font-size-base)", color: omfError.info ? "var(--color-text-secondary)" : "var(--color-danger-text)", lineHeight: 1.5 }}>
            {omfError.text}
          </div>
        )}
        {omfChoices?.choices.map((c) => {
          const others = c.attributes.filter((a) => a !== c.shown), pick = omfPick[c.volume] ?? others[0];
          return (
            <div key={c.volume} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <select value={pick} onChange={(e) => setOmfPick((p) => ({ ...p, [c.volume]: e.target.value }))} aria-label={tr("Another attribute of \"{volume}\"", { volume: c.volume })} title={c.volume} style={{ ...numInput, flex: 1, minWidth: 0 }}>
                {others.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <button onClick={() => importOmf(omfChoices.file, { attribute: pick, volume: c.volume, volumesOnly: true })} disabled={omfBusy} style={{ ...pBtn, width: "auto", marginBottom: 0, flexShrink: 0 }}>{tr("Add as a block model")}</button>
            </div>
          );
        })}
        {omfObjects.map((o) => (
          <div key={o.id} style={{ marginTop: 10, padding: "9px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateOmfObject(o.id, { visible: o.visible === false })} style={{ cursor: "pointer", color: o.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                {o.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</div>
              <span style={{ color: "var(--color-text-muted)", flexShrink: 0, textTransform: "capitalize" }}>{o.kind}</span>
              <Trash2 aria-label={tr("Remove \"{name}\"", { name: o.name })} title={tr("Remove \"{name}\"", { name: o.name })} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(tr("Remove \"{name}\"?", { name: o.name }))) removeOmfObject(o.id); }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
              <span style={{ color: "var(--color-text-faint)", width: 46, flexShrink: 0 }}>{tr("Colour")}</span>
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : "#5a9bd4"} onChange={(e) => updateOmfObject(o.id, { color: e.target.value })} style={{ width: 26, height: 22, padding: 0, border: "1px solid var(--color-border)", borderRadius: 4, background: "transparent" }} />
            </div>
          </div>
        ))}

        </>)}
        {geoPane === "voxel" && (<>
        <TaskPaneHeader title="Voxel / block models" icon={RBox} tone="data" />
        <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>{tr("Block models")}<InfoButton title={tr("Voxel / block models")} text={tr("Import a UBC-GIF tensor mesh (select the .msh mesh file together with its matching model file, e.g. .mod/.con/.den, in one dialog), or a block-model CSV export (x/y/z centroid, cell size, and a value column; the common exchange format from Datamine, Micromine, Surpac, Vulcan, Leapfrog and similar). Geosoft's own proprietary voxel format isn't supported — no public spec to implement against, same reasoning as .grd elsewhere — the CSV path covers the same underlying need. Rendered as coloured 3D blocks with an adjustable value cutoff.")} />
        </div>
        <button onClick={() => ubcInput.current.click()} style={pBtn} disabled={voxelBusy}>
          {voxelBusy ? <Loader2 size={14} className="spin" /> : <Box size={14} />} {voxelBusy ? (voxelProgress ? tr("Reading… {voxelProgress} values", { voxelProgress: voxelProgress.toLocaleString() }) : tr("Reading…")) : tr("Import UBC mesh + model…")}
        </button>
        <input
          ref={ubcInput}
          type="file"
          accept=".msh,.mod,.con,.den,.sus,.res,.chg,.sen,.txt"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { importUBC(e.target.files); e.target.value = ""; }}
        />
        <button onClick={() => blockModelInput.current.click()} style={pBtn}>
          <Upload size={14} />{" "}{tr("Import block model CSV…")}</button>
        <input
          ref={blockModelInput}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files[0]; importBlockModelCSV(f); e.target.value = ""; }}
        />
        <button onClick={() => sgridInput.current.click()} style={pBtn} disabled={voxelBusy} /* TASKS.csv #2726 */
          title={tr("A GOCAD stratigraphic grid: select the .sg file together with its points file and its property files (names like model__points@@, model__Density@@).")}>
          <Box size={14} />{" "}{tr("Import GOCAD SGrid (.sg + its side files)…")}</button>
        <input
          ref={sgridInput}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { importSgrid(e.target.files); e.target.value = ""; }}
        />
        {voxelError && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: voxelError.info ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${voxelError.info ? "var(--color-border)" : "var(--color-danger-border)"}`, borderRadius: 6, fontSize: "var(--font-size-base)", color: voxelError.info ? "var(--color-text-secondary)" : "var(--color-danger-text)", lineHeight: 1.5 }}>
            {voxelError.text}
          </div>
        )}
        {voxelModels.length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }} title={tr("The column names the CSV export writes for the block centres and sizes")}>
            {tr("CSV column names")}
            <select value={bmNames} onChange={(e) => setBmNames(e.target.value)} style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-sm)" }} aria-label={tr("Block-model CSV column names")}>
              <option value="datamine">{tr("XC, YC, ZC, XINC… (Datamine, Vulcan, Surpac, Leapfrog)")}</option>
              <option value="micromine">{tr("EAST, NORTH, RL, _EAST… (Micromine)")}</option>
            </select>
          </label>
        )}
        {voxelModels.length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }} title={tr("The export's parameters and its not-a-resource statement: as # lines above the CSV header, or in a separate text file saved with it in a .zip (Micromine, Datamine and Vulcan do not skip # lines).")}>
            {tr("Provenance notes")}
            <select value={bmStamp} onChange={(e) => setBmStamp(e.target.value)} style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-sm)" }} aria-label={tr("Provenance notes")}>
              <option value="auto">{tr("automatic (beside the CSV for Micromine names)")}</option>
              <option value="inline">{tr("in the CSV (# lines above the header)")}</option>
              <option value="beside">{tr("beside the CSV (.zip with a _provenance.txt)")}</option>
            </select>
          </label>
        )}
        {voxelModels.some((m) => m.params?.set) && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }} title={tr("A model estimated with other elements in one run (a set) is exported with their values as extra columns on the same blocks: CSV columns, VTK and OMF arrays")}>{/* #3014 part c */}
            <input type="checkbox" checked={bmWithSet} onChange={(e) => setBmWithSet(e.target.checked)} />{tr("Exports carry the other elements of a model's set")}
          </label>
        )}
        {voxelModels.map((v) => (
          <VoxelModelRow key={v.id} withSet={bmWithSet} /* #3014 part c */ epsg={stampEpsg(project)} /* #1052 */ others={voxelModels} /* #1808 */ model={v} onUpdate={updateVoxelModel} onRemove={removeVoxelModel} onEvaluate={evaluateOnHoles} onExportPackage={exportModelPackage} onShell={(m, opts = {}) => { goToModule("viewer"); requestModuleAction("voxel-shell", { id: m.id, model: m, largestOnly: !!opts.largestOnly }); }} /* #1780; largestOnly: #1840 */ onTerrain={terrainFromModelTop} /* #1806 */ getEpsg={() => ensureExportCrs(project)} /* #1021 */ csvNames={bmNames} stampChoice={bmStamp} />
        ))}

        <div style={{ marginTop: 16, fontSize: "var(--font-size-base)", color: "var(--color-text-caption)", lineHeight: 1.6 }}>
          {/* #1434 — the .grd bullet went: Geosoft and Surfer .grd grids are read since v0.1.99 (Raster tab) */}
          <div style={{ color: "var(--color-text)", marginBottom: 6 }}>{tr("Not read yet:")}</div>
          <div>{tr("• Geosoft voxel (.geosoft_voxel): a proprietary binary with no public spec. Export the voxel from Oasis montaj as a CSV and use \"Import block model CSV…\" above.")}</div>
        </div>
        </>)}
      </div>

      {bmPending && (
        <BlockModelMappingModal fileName={bmPending.fileName} headers={bmPending.headers} numeric={bmPending.numeric} rowCount={bmPending.rows.length}
          guess={bmPending.guess} maxCells={effectiveMaxCells} onImport={importMappedBlockModel} onClose={() => setBmPending(null)} />
      )}
      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      {!embedded && (<div
        className="ge-main"
        style={{ display: show3d ? "none" : "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14, color: "var(--color-text-muted)", border: dragOver ? "2px dashed var(--color-info)" : "2px dashed transparent", borderRadius: 8 }}
      >
        {/* TASKS.csv #309 — this used to be a 40px faint icon over a TWELVE-LINE centre-aligned
            paragraph of format reference (GeoTIFF/GXF/.ply/.dxf/.xyz/UBC), which the design review
            called "close to unreadable as a block, and reference material rather than an invitation
            to do anything". The reference text is NOT deleted — it is good and specific — it moves
            behind the InfoButton progressive-disclosure component this module already uses eight
            times elsewhere, so it is one click away instead of being the whole screen. What's left
            is the shared EmptyState card the other three data tabs now use. */}
        <div className="ge-geo-results" ref={setResultSlot} />{/* #1199 */}
        <div className="ge-geo-empty">
        <EmptyState
          icon={<Radio size={18} />}
          headline={(() => {
            // Built as a list-and-join rather than chained ternaries (the pre-#77-fix version of this
            // string) — that approach stopped scaling once boundaries joined rasters/terrain as a
            // third thing that may or may not be loaded.
            const parts = [];
            if (rows.length) parts.push(tr("{rows} geophysics point(s)", { rows: rows.length }));
            if (rasters.length) parts.push(tr("{rasters} raster drape(s)", { rasters: rasters.length }));
            if (terrain) parts.push(tr("a terrain surface"));
            if (boundaries.length) parts.push(tr("{boundaries} boundary(ies)", { boundaries: boundaries.length }));
            if (voxelModels.length) parts.push(tr("{n} block model(s)", { n: voxelModels.length })); // TASKS.csv #1176
            if (dcipLines.length) parts.push(tr("{n} DC/IP line(s)", { n: dcipLines.length }));
            // TASKS.csv #1425 — a drill-only project has downhole geophysics: say so, and where it is used
            const { ms, sg } = logReadingCounts({ layers, customLayers }); // #2950 — and the custom log layers named for the property
            if (!parts.length) return ms || sg ? tr("No surface geophysics yet; {ms} mag-susc and {sg} SG readings in the drillholes — see Downhole logs, or 3D Modelling > Estimation / Grade shell to grid them", { ms: ms.toLocaleString(), sg: sg.toLocaleString() }) : tr("No geophysics data yet");
            const joined = parts.length > 1 ? tr("{list} and {last}", { list: parts.slice(0, -1).join(", "), last: parts[parts.length - 1] }) : parts[0];
            return tr("{items} loaded", { items: joined });
          })()}
          // TASKS.csv #1434 (review #1352) — on DC / IP this card's 'Import CSV…' opened the point-survey importer; a line comes in through
          // the sidebar's own button, so the card says that instead
          actionLabel={geoPane === "dcip" ? null : geoPane === "points" ? tr("Import CSV…") : tr("Import a point survey (CSV)…")}
          onAction={geoPane === "dcip" ? null : () => fileInput.current?.click()}
          actionTitle={tr("Pick a point-cloud CSV — x/y/z plus a value column")}
          secondary={<InfoButton title={tr("Every supported format")} width={430} text={tr(FORMAT_REFERENCE)} />}
          footnote={tr("Or drag a file straight onto this pane. Everything imported here renders in the 3D View alongside your drillholes.")}
        >
          {geoPane === "dcip" && <div style={{ marginBottom: 12 }}>{tr("A DC / IP line comes in through \"Import line (CSV / .dat)…\" in the sidebar: a CSV, or a contractor TDIP .dat / .ipg file.")}</div>}
          <div style={{ marginBottom: 12 }}>{tr("Point-cloud surveys (mag, IP, gravity, radiometrics), gridded geophysics, terrain and boundary geometry. Drag a CSV, GeoTIFF, Geosoft")}{" "}<code>.gxf</code>, <code>.ply</code>/<code>.dxf</code>{" "}{tr("or")}{" "}<code>.xyz</code>{" "}{tr("here, or use the buttons on the left — the")}{" "}<b>i</b>{" "}{tr("beside the button lists exactly what each format does on import.")}</div>
        </EmptyState>
        </div>
      </div>)}

      {spatialOpen && <SpatialAnalysis points={rows} surveys={surveyList.map((s) => ({ ...s, units: geophysSurveys[s.key]?.units || "", method: geophysSurveys[s.key]?.method || null }))} /* #1588 — one survey at a time */ onClose={() => setSpatialOpen(false)} />}
    </div>
  );
}

// TASKS.csv #27/#28 — one row per loaded voxel/block model. The threshold slider is debounced locally
// (a plain useState for the displayed value, only pushed to the store — which triggers ViewerModule's
// full InstancedMesh rebuild, real work for a model with tens of thousands of cells — after 150ms of
// no further dragging) rather than updating the store on every native `input` event a range slider
// fires continuously during a drag, which would otherwise rebuild the whole 3D mesh on every pixel of
// movement.
// TASKS.csv #411 — see blockModelExport.js
async function exportBlockModelCSV(model, epsg, names = "datamine", stampChoice = "auto") {
  const csv = await blockModelCsvText(model, names); // names: #979; #1041 — written straight from the cells, in chunks
  const stamp = stampLines({ tool: "Block model export", version: APP_VERSION, epsg, params: blockModelParamLines(model) }); // #529 — version + CRS
  const base = safeFileName(model.name || "block_model", "block_model").slice(0, 80); // TASKS.csv #1214 — "45.5m" read 455m
  if (stampPlacement(stampChoice, names) === "beside") { // #1061 — a clean CSV and its notes, in one .zip
    const { buildZip } = await import("../lib/shapefile.js");
    const enc = new TextEncoder();
    const zip = buildZip(stampBeside(csv, stamp, base).map((f) => ({ name: f.name, data: enc.encode(f.text) })));
    saveFile({ suggestedName: `${base}.zip`, filters: [{ name: "Zip (CSV + provenance)", extensions: ["zip"] }], content: zip });
    return;
  }
  saveFile({ suggestedName: `${base}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: withStamp(csv, stamp), encoding: "text" });
}
// TASKS.csv #798 — the block model as a VTK file for ParaView / PyVista (lib/vtkExport.js)
async function exportBlockModelVTK(model, epsg) {
  const { blockModelToVtk } = await import("../lib/vtkExport.js");
  const { bytes } = blockModelToVtk(model, `v${APP_VERSION} | EPSG:${epsg ?? "?"}${model.property ? `, ${model.property}` : ""}${model.params?.coarsenedFrom ? ` | block-averaged ${model.params.coarsenedFrom.factors.join("x")} on import` : ""}`); // #1095
  saveFile({ suggestedName: `${String(model.name || "block_model").replace(/[^\w\- ]/g, "").slice(0, 80)}.vtk`, filters: [{ name: "VTK (legacy)", extensions: ["vtk"] }], content: bytes /* #1040 bytes */ });
}
// TASKS.csv #711 — what an imported volume's values can be (the units the rest of the app uses)
// TASKS.csv #1779 (review #1646, Kodiak) — chargeability in both conventions: the integral Mx in ms (SJ Geophysics and many contractors:
// "Mx (in ms): calculated apparent chargeability") beside mV/V; the legend, the section key and the exports carry whichever is chosen
const VOXEL_PROPERTIES = ["Conductivity (S/m)", "Resistivity (ohm·m)", "Chargeability (mV/V)", "Chargeability (ms)", "Susceptibility (SI)", "Susceptibility (×10⁻³ SI)" /* #2667 — KT-10 / KT-20 / SM-30 logs */, "Density (g/cc)", "Density contrast (g/cc)"];
// TASKS.csv #1178 — a conductivity cutoff read "0" with 5,765 cells hidden: three significant figures, whatever the size
export const sigFigs = (v) => (Number.isFinite(v) ? (v === 0 ? "0" : Number(v.toPrecision(3)).toLocaleString(undefined, { maximumSignificantDigits: 3 })) : "—");
// #1593 — the 3D View's palette link opens one card's legend
const OPEN_LEGEND_EVENT = "geostrix-open-voxel-legend";
let pendingLegend = null; // { id, at }
// TASKS.csv #2871 (GSC review B23) — the Point survey Source CRS, for the app session: the tab remounts when it is left (changing the project CRS
// from another tab, say) and the box was back on 'Same as project', so the next longitude / latitude import went in as degrees again
let keptGeophysSourceEpsg = "";
const iconBtn = { border: 0, background: "none", padding: 0, display: "flex", cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }; // #2871
function useOpenLegendRequest(model, open) {
  useEffect(() => {
    const id = String(model.id);
    if (pendingLegend && pendingLegend.id === id && Date.now() - pendingLegend.at < 5000) { pendingLegend = null; open(); }
    const on = (e) => { if (e.detail?.id === id) { pendingLegend = null; open(); } };
    window.addEventListener(OPEN_LEGEND_EVENT, on);
    return () => window.removeEventListener(OPEN_LEGEND_EVENT, on);
  }, [model.id]);
}
function VoxelModelRow({ withSet = false /* #3014 part c */, others = null, model, onUpdate, onRemove, onEvaluate, onExportPackage, getEpsg, csvNames = "datamine", stampChoice = "auto", epsg = null, onShell = null, onTerrain = null }) {
  const [askPrompt, promptEl] = usePrompt(); // TASKS.csv #1779 — window.prompt throws in Electron
  const [gtOpen, setGtOpen] = useState(false); // TASKS.csv #1052
  const [displayOpacity, setDisplayOpacity] = useState(model.opacity ?? 0.85);
  const [legendOpen, setLegendOpen] = useState(false);
  useOpenLegendRequest(model, () => setLegendOpen(true)); // #1593
  const opacityDebounceRef = useRef(null);
  // Opacity is debounced the same way as threshold — ViewerModule's voxel effect rebuilds the whole
  // InstancedMesh on ANY model field change (same brute-force-rebuild approach the raster/terrain
  // effects already use), so a bare onChange here would rebuild a model that could be tens of
  // thousands of instances on every pixel of a drag.
  const onOpacityInput = (v) => {
    setDisplayOpacity(v);
    if (opacityDebounceRef.current) clearTimeout(opacityDebounceRef.current);
    opacityDebounceRef.current = setTimeout(() => onUpdate(model.id, { opacity: v }), 150);
  };
  // TASKS.csv #404 — estimated / support-index models were labelled "CSV"; they now say what they are,
  // and hovering the label shows the parameters that produced them.
  // #1842 — a model of named units (solids from surfaces, a GemPy block) is not a CSV and its codes are not grades
  const categorical = !!model.valueLabels;
  const sourceLabel = categorical && (model.source === "surfaces" || model.source === "gempy") ? tr("Modelled units") : model.source === "ubc" ? "UBC" : model.source === "omf" ? "OMF" : model.source === "simpeg" ? "SimPEG"
    : String(model.source || "").startsWith("estimate-") ? tr("Estimate") : String(model.source || "").startsWith("support-index-") ? tr("Support index")
    : model.source === "kriging-variance" ? tr("Kriging variance") : model.source === "geoml" ? "geoML" : "CSV"; // #1418 — kriging variance / geoML were "CSV"
  const p = model.params;
  const paramsTitle = p && p.tool === "Grade estimation"
    ? `${p.tool}: ${p.element}, ${p.method}, ${p.cellSizeM} m cells, search ${p.searchRadiusM} m${p.searchRadiusWasUnlimited ? " (unlimited, capped at grid diagonal)" : ""}, ${p.minSamples}-${p.maxSamples} samples, min ${p.minHoles} holes, ${p.composited ? `${p.compositeLengthM} m composites (min coverage ${Math.round((p.minCoverage || 0) * 100)}%)` : "raw intervals"}, cap ${p.capValue ?? "none"}, QAQC ${p.includeQAQC ? "included" : "excluded"}${p.domain ? `, domain ${p.domain}${p.restrictToDomain ? " (restricted)" : ""}` : ""}${p.searchTrend?.name ? `, trend "${p.searchTrend.name}"${p.searchTrend.ellipsoidM ? ` (ellipsoid ${p.searchTrend.ellipsoidM.map((v) => +Number(v).toFixed(2)).join(" : ")})` : ""}` : ""}${p.gridFrom ? `, grid: ${p.gridFrom}` : ""}, desurvey ${p.desurveyMethod}, ${p.samplePoints} sample points, ${p.generatedAt}${p.value ? `. Values: ${p.value}` : ""}. Not a Mineral Resource estimate.`
    : undefined;
  return (
    <div data-voxel-id={model.id} /* #1417 — the 3D View's link scrolls here */ style={{ marginTop: 10, padding: "9px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" }}>
      {promptEl}
      <div style={{ color: "var(--color-text)", overflowWrap: "anywhere", lineHeight: 1.3, marginBottom: 3 }}>{model.name}</div>{/* #1178: seven icons squeezed it to one letter */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onUpdate(model.id, { visible: model.visible === false })} aria-label={tr("Show or hide {name}", { name: model.name })} aria-pressed={model.visible !== false} title={tr("Show or hide {name}", { name: model.name })} /* #2969 */ style={{ cursor: "pointer", color: model.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
          {model.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
        </div>
        <div style={{ flex: 1 }} />
        <span title={paramsTitle} style={{ color: "var(--color-text-muted)", flexShrink: 0, cursor: paramsTitle ? "help" : undefined }}>{sourceLabel} · {model.cells.length.toLocaleString()}</span>
        <Palette role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: legendOpen ? "var(--color-info)" : "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => setLegendOpen((v) => !v)} title={tr("Edit colour legend / range / classification")} aria-label={tr("Edit colour legend / range / classification")} aria-expanded={legendOpen} /* #2969 */ />
        {/* TASKS.csv #323 — the model's value along every drillhole, as a downhole layer (strip log, 3D, CSV) */}
        {onEvaluate && <ArrowDownToLine role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Evaluate block model \"{name}\" onto the drillholes", { name: model.name })} title={tr("Evaluate onto drillholes — the model's value in every cell each hole passes through, as a downhole layer to compare with the logs in the strip log")} onClick={() => onEvaluate(model)} />}
        {/* TASKS.csv #328 — UBC mesh/model, .obs data, GeoTIFF depth slices and provenance.txt in one zip */}
        {onExportPackage && <PackageOpen role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Export block model \"{name}\" for other software", { name: model.name })} title={tr("Export for other software (zip): UBC mesh + model, .obs observed/predicted data (SimPEG inversions), GeoTIFF depth slices, provenance.txt")} onClick={() => onExportPackage(model)} />}
        {/* TASKS.csv #1052 — grade-tonnage table / curve at cutoffs and an entered density */}
        {/* #1201 — a tonnage of conductivity is not a resource figure: not offered on a physical-property model */}
        {offersGradeTonnage(model, { categorical, geophysProperty: (p) => VOXEL_PROPERTIES.includes(p) }) /* #1577, #1592 — lib/gradeTonnage.js */ && <Scale role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Grade-tonnage table for \"{name}\"", { name: model.name })} title={tr("Grade-tonnage table for \"{name}\"", { name: model.name })} onClick={() => setGtOpen(true)} />}
        {/* TASKS.csv #411 — block model out for estimation/mine-planning software */}
        <Download role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Export block model \"{name}\" as CSV", { name: model.name })} title={csvNames === "micromine" ? tr("Export as block-model CSV (EAST, NORTH, RL, _EAST, _NORTH, _RL, value: Micromine names)") : tr("Export as block-model CSV (XC, YC, ZC, XINC, YINC, ZINC, value)")} onClick={async () => { const e = await getEpsg(); if (e) exportBlockModelCSV(withSet ? withSetColumns(model, others) : model, e, csvNames, stampChoice); }} />
        <Box role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} aria-label={tr("Export block model \"{name}\" as VTK", { name: model.name })} title={tr("Export as VTK for ParaView / PyVista (empty blocks are NaN)")} onClick={async () => { const e = await getEpsg(); if (e) exportBlockModelVTK(withSet ? withSetColumns(model, others) : model, e); }} />{/* TASKS.csv #798 */}
        <Trash2 aria-label={tr("Remove block model \"{name}\"", { name: model.name })} title={tr("Remove block model \"{name}\"", { name: model.name })} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(tr("Remove \"{name}\"?", { name: model.name }))) onRemove(model.id); }} />
      </div>
      {/* TASKS.csv #711 — an OMF / UBC volume names no property or unit, so the legend, inspector and exports could only
          show the attribute name: the user says what the values are (stored as model.property). */}
      {!categorical && ( // #1786 — every block model of values (a CSV import too), not only OMF / UBC
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
          <span style={{ color: "var(--color-text-faint)", width: 62, flexShrink: 0 }}>{tr("Values are")}</span>
          <select value={model.params?.declaredGrade && !model.property ? "__grade" /* #2667 */ : VOXEL_PROPERTIES.includes(model.property) ? model.property : model.property ? "__other" : ""} aria-label={tr("What the values of \"{name}\" are", { name: model.name })}
            onChange={(e) => { const v = e.target.value;
              // TASKS.csv #2667 — a grade: its element and unit (Grade-tonnage then offered on a CSV model); a property chosen after one drops it
              if (v === "__grade") { askPrompt(tr("Which element and unit are the values? (e.g. Cu ppm, Au g/t, Fe %)"), model.params?.declaredGrade ? `${model.params.element} ${model.params.unit}` : "", (txt) => { const g = parseGradeLabel(txt); if (g) onUpdate(model.id, { property: null, propertyChosen: true, params: { ...(model.params || {}), element: g.element, unit: g.unit, declaredGrade: true } }); }); return; }
              if (model.params?.declaredGrade) { const { element: _e, unit: _u, declaredGrade: _d, ...rest } = model.params; onUpdate(model.id, { params: rest }); }
              if (v === "__other") { askPrompt(tr("What are the values (property and unit)?"), model.property || "", (other) => { if (other && other.trim()) onUpdate(model.id, { property: other.trim(), propertyChosen: true }); }); return; } onUpdate(model.id, { property: v || null, propertyChosen: true }); }}
            style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-sm)", padding: "2px 4px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text)" }}>
            {/* TASKS.csv #2067 (review #2013) — an estimate knows its element and unit (params): said here, not set as property, which would
                rename its export column (lib/blockModelExport.js) */}
            <option value="">{!model.property && model.params?.element && !model.params?.declaredGrade ? (model.params.unit ? tr("{el} ({unit}), from the estimate", { el: model.params.element, unit: model.params.unit }) : tr("{el}, from the estimate", { el: model.params.element })) : tr("Not stated (the file names no unit)")}</option>
            {VOXEL_PROPERTIES.map((v) => <option key={v} value={v}>{tr(v)}</option>)}
            <option value="__grade">{model.params?.declaredGrade ? tr("{el} ({unit}), a grade", { el: model.params.element, unit: model.params.unit }) : tr("A grade (element, unit)…")}</option>{/* #2667 */}
            <option value="__other">{model.property && !VOXEL_PROPERTIES.includes(model.property) ? model.property : tr("Other…")}</option>
          </select>
        </div>
      )}
      {/* TASKS.csv #1780 (review #1646, Kodiak) — the one-sided "value >= cutoff" slider could only hide the conductors on a resistivity
          model: the same Min / Max range the Targeting sidebar has (typed values, log steps on a model whose values span decades),
          and the range as a closed solid */}
      <VoxelRangeRow compact model={model} onUpdate={onUpdate} onShell={onShell} others={others} />{/* others: #1808 */}
      <div style={{ marginTop: 2, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("Range {min} to {max}", { min: sigFigs(model.min), max: sigFigs(model.max) })}</div>
      {/* TASKS.csv #1806 (review #1646, Kodiak) — an inversion mesh carries the topography as its air / ground boundary: a terrain from it,
          offline, for the samples with no elevation, the sections' profile and the clip at topography */}
      {onTerrain && (model.source === "ubc" || model.source === "omf" || model.source === "simpeg") && (
        <button type="button" onClick={() => onTerrain(model)} style={{ ...pBtn, marginTop: 6, marginBottom: 0, fontSize: "var(--font-size-sm)" }} title={tr("The uppermost cell of every column of this model is the ground there (the air cells above it are no-data), so the model's top is a terrain: samples with no elevation sit on it, sections get its profile, and surfaces can be cut at it. No download. It is only as fine as the mesh's columns, and only where the mesh is.")}>{tr("Terrain from the model's top (offline)")}</button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
        <span style={{ color: "var(--color-text-faint)", width: 62, flexShrink: 0 }}>{tr("Opacity")}</span>
        <input type="range" min={0.1} max={1} step={0.05} value={displayOpacity} onChange={(e) => onOpacityInput(Number(e.target.value))} style={{ flex: 1, minWidth: 0 }} />
      </div>
      {legendOpen && <VoxelLegendEditor model={model} onUpdate={onUpdate} />}
      {gtOpen && <GradeTonnageModal model={model} epsg={epsg} onClose={() => setGtOpen(false)} />}
    </div>
  );
}

// User request (after seeing a real OMF block-model import): "Can we also import the colour legend.
// And we will need it on the layers panel. There we should be able to edit the colours, ranges,
// classify, etc." — this is the layers-panel legend editor. It works on model.stops (an ordered
// {value,color} list — imported straight from the OMF file's own ScalarColormap when present, see
// omf.js's convertColormap / GeophysicsModule's importOmf) plus model.colorMode ("continuous", the
// default, interpolates between bracketing stops the same way the source OMF gradient would;
// "discrete" steps to the nearest lower stop's color, i.e. classic classified/choropleth symbology).
// A model with no stops yet (a fresh UBC/CSV import, or an OMF file with no embedded legend) falls
// back to the original 2-color magColor gradient in the 3D view (see layers.js's colorForVoxelValue)
// until the user either classifies it here or the next OMF import brings its own legend in.
function VoxelLegendEditor({ model, onUpdate }) {
  const [method, setMethod] = useState("equal");
  const [classCount, setClassCount] = useState(5);
  const [classNote, setClassNote] = useState(""); // #1430
  // User request: "Can we have some gradient colour pallets options for the voxels legends? Get some
  // that are typically used in geophysics and name them with the suggested geophysical survey type
  // use." — see layers.js's PALETTES for the actual named ramps (Geosoft-style spectrum, rainbow,
  // resistivity/IP, viridis, diverging blue-white-red for residual/anomaly grids, grayscale). This
  // picker drives both the Classify action below (colors its generated stops) and the standalone
  // "Recolor with this palette" button (re-themes the model's EXISTING stop values/positions, e.g. an
  // OMF-imported legend, without re-running classification).
  // TASKS.csv #1788 — the palette the model's colours came from (model.palette), else 'The model's own colours' when it has stops: the
  // dropdown read 'Viridis' over a cream-to-plum legend
  const [palette, setPalette] = useState(() => (model.palette && PALETTES[model.palette] ? model.palette : (model.stops || []).length ? "__own" : "viridis")); // #382 — was the isoluminant blue-red
  const stops = model.stops || [];
  const shown = useMemo(() => readableValues([...stops.map((s) => s.value), model.max]), [stops, model.max]); // #1422 — the stops (and the max) as read
  // #1790; TASKS.csv #2969 — at layers.js rangeText's precision (the units of the larger end, #2402), as the Stretch beside it reads: the
  // boxes said 53000 / 53200 beside '2–98 % of the points (52,986 to 53,168)'
  const rangeShown = useMemo(() => { const m = Math.max(Math.abs(model.min), Math.abs(model.max)); return readableValues([model.min, model.max], Math.max(3, m >= 1 ? Math.floor(Math.log10(m)) + 1 : 3)); }, [model.min, model.max]);

  const setStops = (next, extra = {}) => onUpdate(model.id, { stops: next, ...extra });

  const updateStop = (i, patch) => {
    const next = stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    setStops(next);
  };
  const removeStop = (i) => setStops(stops.filter((_, idx) => idx !== i));
  const addStop = () => {
    const mid = stops.length ? stops[stops.length - 1].value : model.max;
    setStops([...stops, { value: mid, color: "#5a9bd4" }].sort((a, b) => a.value - b.value));
  };
  const recolorWithPalette = () => {
    if (!stops.length) return;
    if (!PALETTES[palette]) return; // #1788 — 'the model's own colours' is not a palette to recolour with
    const colors = paletteColorsHex(palette, stops.length);
    setStops(stops.map((s, i) => ({ ...s, color: colors[i] })), { palette }); // #1788 — remembered for the dropdown
  };
  // TASKS.csv #1781 (review #1646, Kodiak) — classes from the cells SHOWN: air and the cells outside the Min / Max range left out (a
  // quantile class 1 was 'to -1', the air slab; with a cutoff of 8 every visible cell fell in the top class). Log needs positive
  // values; Jenks on more than 50,000 values runs on an even sample (2.8 s on 380,250 cells froze the window).
  const shownValues = () => {
    const s = sortedShownValues(model) || [];
    const lo = Number.isFinite(model.threshold) ? model.threshold : -Infinity, hi = Number.isFinite(model.rangeMax) ? model.rangeMax : Infinity;
    let v = Array.from(s).filter((x) => x >= lo && x <= hi && (method !== "log" || x > 0));
    if (method === "jenks" && v.length > 50000) { const k = v.length / 50000; v = Array.from({ length: 50000 }, (_, i) => v[Math.floor(i * k)]); }
    return v;
  };
  const applyClassify = () => {
    const breaks = classifyBreaks(shownValues(), classCount, method);
    setClassNote(classCountNote(breaks, classCount, method));
    if (!breaks.length) return;
    const own = stops.map((s) => s.color); // #1788 — classes in the model's own colours when no palette is chosen
    const colors = PALETTES[palette] || !own.length ? paletteColorsHex(PALETTES[palette] ? palette : "viridis", breaks.length) : breaks.map((_, i) => own[Math.round((i * (own.length - 1)) / Math.max(1, breaks.length - 1))]);
    setStops(breaks.map((v, i) => ({ value: v, color: colors[i] })), { colorMode: "discrete" });
  };
  const resetToDefault = () => { const d = defaultModelLegend(model); setStops(d.stops, { colorMode: d.colorMode }); }; // #2400 — continuous again, and a log model's own log ramp

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--color-text-faint)", width: 62, flexShrink: 0 }}>{tr("Range")}</span>
        {/* TASKS.csv #1790 (review #1646, Kodiak) — read as '14.9', not '14.915215962069169' (stored values kept until edited, #1422) */}
        <StopValueInput value={model.min} shown={rangeShown[0]} onCommit={(v) => onUpdate(model.id, { min: v, stretch: "minmax" })} style={{ ...numInput, width: 70 }} ariaLabel={tr("Range minimum of \"{name}\"", { name: model.name ?? tr("Geophysics points") /* #2871 */ })} />
        <span style={{ color: "var(--color-text-muted)" }}>{tr("to")}</span>
        <StopValueInput value={model.max} shown={rangeShown[1]} onCommit={(v) => onUpdate(model.id, { max: v, stretch: "minmax" })} style={{ ...numInput, width: 70 }} ariaLabel={tr("Range maximum of \"{name}\"", { name: model.name ?? tr("Geophysics points") })} />
      </div>
      {!stops.length && ( // TASKS.csv #1812 — the default gradient's stretch
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
          <span style={{ color: "var(--color-text-faint)", width: 62, flexShrink: 0 }}>{tr("Stretch")}</span>
          <select value={model.stretch === "minmax" ? "minmax" : "p2-98"} onChange={(e) => onUpdate(model.id, { stretch: e.target.value === "minmax" ? "minmax" : null })} style={{ ...numInput, flex: 1 }} aria-label={tr("Colour stretch of \"{name}\"", { name: model.name ?? tr("Geophysics points") })}>
            <option value="p2-98">{(() => { const r = voxelStretch({ ...model, stretch: null }); const pts = model.id === "geophys_pts"; /* #2247 */ const lim = r ? rangeText(r[0], r[1], true) : null; /* #2402 — the limits at the Range boxes' precision ('57400 to 57500' for 57,407 to 57,530) */ return r ? (pts ? tr("2–98 % of the points ({lo} to {hi})", { lo: lim[0], hi: lim[1] }) : tr("2–98 % of the cells ({lo} to {hi})", { lo: lim[0], hi: lim[1] })) : pts ? tr("2–98 % of the points") : tr("2–98 % of the cells"); })()}</option>
            <option value="minmax">{tr("The range above (min to max)")}</option>
          </select>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
        <span style={{ color: "var(--color-text-faint)", width: 62, flexShrink: 0 }}>{tr("Style")}</span>
        <select value={model.colorMode || "continuous"} onChange={(e) => onUpdate(model.id, { colorMode: e.target.value })} style={{ ...numInput, flex: 1 }}>
          <option value="continuous">{tr("Continuous gradient")}</option>
          <option value="discrete">{tr("Classified (stepped)")}</option>
        </select>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ color: "var(--color-text-faint)", marginBottom: 4 }}>{tr("Colour legend {v}", { v: stops.length ? tr(stops.length === 1 ? "({n} stop)" : "({n} stops)", { n: stops.length }) /* #1116 */ : tr("(default gradient — no custom stops yet)") })}
        </div>
        {stops.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : "#5a9bd4"} onChange={(e) => updateStop(i, { color: e.target.value })} style={{ width: 24, height: 20, padding: 0, border: "1px solid var(--color-border)", borderRadius: 4, background: "transparent", flexShrink: 0 }} />
            <StopValueInput value={s.value} shown={shown[i]} onCommit={(v) => updateStop(i, { value: v })} style={{ ...numInput, flex: 1 }} ariaLabel={tr("Value of colour stop {n}", { n: i + 1 })} />
            {model.colorMode === "discrete" && (
              <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", width: 60, flexShrink: 0 }}>
                {i < stops.length - 1 ? tr("to {v}", { v: shown[i + 1] }) : tr("to {max} (max)", { max: shown[stops.length] })}
              </span>
            )}
            <Trash2 aria-label={tr("Remove this colour stop")} title={tr("Remove this colour stop")} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-muted)", flexShrink: 0 }} onClick={() => removeStop(i)} />
          </div>
        ))}
        {/* User report: "the values never got to the max value" — each stop's own number IS its class's
            LOWER bound (standard equal-interval/quantile convention), so the topmost stop's number is
            naturally short of the true max by one class-width — that's correct, not a bug, but it reads
            as broken with nothing showing the top class actually still reaches the real max. The "to …"
            captions above make each row's actual covered range explicit instead of a bare number. */}
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <button onClick={addStop} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, justifyContent: "center" }}><Plus size={12} />{" "}{tr("Add stop")}</button>
          {stops.length > 0 && (
            <button onClick={resetToDefault} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, justifyContent: "center" }}>{tr("Reset to default")}</button>
          )}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ color: "var(--color-text-faint)", marginBottom: 4 }}>{tr("Colour palette")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <select value={palette} onChange={(e) => setPalette(e.target.value)} style={{ ...numInput, flex: 1 }} title={PALETTES[palette]?.label}>
            {/* #1433 — the short name in the list (the full description widened the sidebar to 488 px); the full text on hover */}
            {palette === "__own" && <option value="__own">{tr("The model's own colours")}</option>}{/* #1788 */}
            {Object.entries(PALETTES).map(([key, p]) => <option key={key} value={key} title={p.label}>{paletteShortName(key)}</option>)}
          </select>
          {stops.length > 0 && PALETTES[palette] && (
            <button onClick={recolorWithPalette} style={{ ...pBtn, width: "auto", marginBottom: 0 }} title={tr("Re-colour the existing stops with this palette, keeping their current values")}>{tr("Recolour")}</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 2, marginTop: 4, height: 10, borderRadius: 3, overflow: "hidden" }}>
          {(PALETTES[palette] ? paletteColorsHex(palette, 24) : stops.map((s) => s.color)).map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ color: "var(--color-text-faint)", marginBottom: 4 }}>{tr("Classify")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ ...numInput, flex: 1 }}>
            <option value="equal">{tr("Linear (equal interval)")}</option>
            <option value="log">{tr("Log-linear")}</option>
            <option value="quantile">{tr("Histogram equalization (quantile)")}</option>
            <option value="normal">{tr("Normal distribution")}</option>
            <option value="lognormal">{tr("Log-normal distribution (positive values)")}</option>{/* #1594 */}
            {/* TASKS.csv #291 — QGIS parity: natural breaks minimizes within-class variance, the
                right default for the clustered background + anomalous tail real survey data has. */}
            <option value="jenks">{tr("Natural breaks (Jenks)")}</option>
          </select>
          <input type="number" min={2} max={64} value={classCount} onChange={(e) => setClassCount(Number(e.target.value))} style={{ ...numInput, width: 44, flex: "none" }} /* #1433 */ />
          <button onClick={applyClassify} style={{ ...pBtn, width: "auto", marginBottom: 0 }}>{tr("Apply")}</button>
        </div>
        {classNote && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: 3 }}>{classNote}</div>} {/* #1430 */}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 3, lineHeight: 1.4 }}>{(model.id === "geophys_pts" /* #2247 — the editor is shared with point surveys */ ? tr("Generates {classCount} classes from this survey's point values and switches to classified (stepped) styling.", { classCount }) : tr("Generates {classCount} classes from this model's actual cell values and switches to classified (stepped) styling.", { classCount }))}</div>
      </div>
    </div>
  );
}

const pBtn ={ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px", marginBottom: 6, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: "var(--font-size-base)", cursor: "pointer" };
const numInput = { flex: 1, minWidth: 0 /* #1433 */, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text)", fontSize: "var(--font-size-sm)", padding: "3px 6px" };
