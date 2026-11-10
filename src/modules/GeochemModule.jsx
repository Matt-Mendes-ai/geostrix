import { qcColumns, qcFields } from "../lib/assayQcColumns.js"; // TASKS.csv #1184
import { zeroMeansMissing } from "../lib/missingElevation.js"; // TASKS.csv #1394
import React, { useState, useRef, useMemo, useEffect, Suspense } from "react";
import { useKeptState, scopeOf } from "../lib/keptState.js"; // TASKS.csv #1284
import { useModuleAction } from "../lib/menuRequests.js"; // TASKS.csv #565
import { joinBySampleId } from "../lib/surfaceJoin.js"; // TASKS.csv #1670
import { parseTableOrWorkbook, isXlsxName } from "../lib/xlsx.js"; // TASKS.csv #444 shared reader; #605 .xlsx
import { num, guessColumn, TARGET_SCHEMAS, colorForLithology, CATEGORICAL_SAFE_COLORS, hashColor, colorForVoxelValue } from "../lib/layers.js"; // colours: #1091
import { gradeStops } from "../lib/inversion.js"; // TASKS.csv #1091 — the grade ramp block models use (#702) // TASKS.csv #508; guessColumn #600 — blank / "NA" -> NaN, never 0
import { didYouMean } from "../lib/holeIds.js"; // TASKS.csv #541
import { reprojectXY, crsName } from "../lib/reproject.js"; // TASKS.csv #600 — surface samples into the project CRS
import { askAdoptCrs } from "../lib/adoptCrs.js"; // TASKS.csv #607
import { lonLatColumns } from "../lib/projectCrs.js"; // TASKS.csv #1149
import { Ribbon, RibbonGroup, RibbonButton } from "../components/Ribbon.jsx"; // TASKS.csv #458
import { MapPin as GMapPin, Triangle as GTriangle, Shapes as GShapes, BarChart3 as GBarChart, Award as GAward, Rows3 as GRows, Sheet as GSheet, Image as GImage } from "../components/icons.js";
import { Upload, Download, FlaskConical, Beaker, Scale, Grid3x3, ShieldCheck, TerminalSquare, Sigma, FileCheck, X, AlertTriangle, Globe, Database } from "../components/icons.js";
import { noticeText, noticeLevel, errorNotice, notice } from "../lib/notices.js"; // TASKS.csv #729
import { addCalculatedElement, CALC_PRESETS } from "../lib/calcElement.js"; // TASKS.csv #401
import { useStore, useSetTaskProgress } from "../lib/store.jsx"; // useSetTaskProgress: #2164
import { elementColumnStats } from "../lib/assayColumnScan.js"; // TASKS.csv #2164
const ELEMENT_SCAN_CHUNKED_ROWS = 50000; // #2164 — below this the element columns are counted at once
import { saveFile, loadSampleFiles } from "../lib/desktop.js"; // loadSampleFiles: TASKS.csv #391
import { repeatColumns, columnDetectionLimit, isElementColumn, inferUnit, pickElementColumns, assayExportRows, parseAssayValue, valueIn, readAssayCell, columnPositiveMax, convertUnit, mergeAssayRows, holesWithChangedIntervals, dropHoleAssays, blankDetectionLimit, isBlankAssayCell, oxideOfHeader, fromOxideHeader, oxideUnit, surfaceAttrColumns, surfaceAttrs, mergeSurfaceSamples, otherMediumTwins } from "../lib/geochem.js"; // otherMediumTwins: #2085
import { DIAGRAMS, SPIDER_DIAGRAMS, GEOCHEM_METHODS, diagramExportRows, protolithForSample, PROVISIONAL_ALTERATION_BOXES, GEOCHEM_LABELS, reeProfile, loggedCodeAt, isSedimentaryCode, mergeClassRuns, FITTED_PROTOLITH, fitLeastAlteredBox, nameAiUpTrend } from "../lib/geochemDiagrams.js"; // fitted: #2028; nameAiUpTrend: #2145
import { qcRecordFromFileRow, emptySurfaceQc, looksLikeQcTypeColumn, mergeQcRecords } from "../lib/surfaceQaqc.js"; // TASKS.csv #842; looksLikeQcTypeColumn, mergeQcRecords: #1794
import { mapInChunks } from "../lib/mapInChunks.js"; // TASKS.csv #583
import { detectLongAssay, pivotLongAssays, longAssayNote } from "../lib/longAssays.js"; // TASKS.csv #623
import { isSurfaceSampleTable, SURFACE_XY_ALIASES } from "../lib/viewer/importHelpers.js"; // TASKS.csv #975
import { assayFileSummary, removeAssayFile, removeAssayElement, carbonateShare, VOLCANIC_DIAGRAMS } from "../lib/geochem.js"; // TASKS.csv #624; carbonateShare: #1392
import { confirmDestructive } from "../lib/confirmDestructive.js"; // TASKS.csv #624
import GeochemPlot from "../components/GeochemPlot.jsx";
import { lithologyBySample, lithologyCounts, NOT_LOGGED } from "../lib/sampleLithology.js"; // TASKS.csv #619
import AssayImportModal from "../components/AssayImportModal.jsx";
import { dbImportRecord, upsertDbImport } from "../lib/dbImports.js"; // TASKS.csv #1963
import LabCertificateModal from "../components/LabCertificateModal.jsx"; // TASKS.csv #601
import { isLabCertificateText, parseLabCertificate, combineCertificates, joinCertificatesToAssays, suggestQcTypes, qcRowPlacement, indexAssaysForPlacement } from "../lib/labCertificate.js"; // TASKS.csv #601
import AlterationBoxModal from "../components/AlterationBoxModal.jsx"; // TASKS.csv #503
import SurfaceImportModal, { SURFACE_MEDIA } from "../components/SurfaceImportModal.jsx";
// TASKS.csv #1794 — the medium a cell names (the import's own list and aliases), for telling a medium column from a QC-type column
const surfaceMediumOf = (m) => (SURFACE_MEDIA.includes(m) ? m : /rock|grab|chip|outcrop|float|channel|soil|silt|stream|sediment|moss|talus|bleg|\bhmc\b|heavy.?min|concentrate|water/.test(m) ? m : null);
import IsoconTool from "../components/IsoconTool.jsx";
import CorrelationMatrix from "../components/CorrelationMatrix.jsx";
import BestIntercepts from "../components/BestIntercepts.jsx";
import CompositingModal from "../components/CompositingModal.jsx";
import GradeStatistics from "../components/GradeStatistics.jsx";
const ThresholdToolkit = React.lazy(() => import("../components/ThresholdToolkit.jsx")); // TASKS.csv #841
const SurfaceQaqcPanel = React.lazy(() => import("../components/SurfaceQaqcPanel.jsx")); // TASKS.csv #842
const DatabaseConnectModal = React.lazy(() => import("../components/DatabaseConnectModal.jsx")); // TASKS.csv #917
const CatchmentsPanel = React.lazy(() => import("../components/CatchmentsPanel.jsx")); // TASKS.csv #845
const SurfacePlanMap = React.lazy(() => import("../components/SurfacePlanMap.jsx")); // TASKS.csv #1792 / #1864
const SurveyPlannerPanel = React.lazy(() => import("../components/SurveyPlannerPanel.jsx")); // TASKS.csv #844
const DomainsPanel = React.lazy(() => import("../components/DomainsPanel.jsx")); // TASKS.csv #852
const LevellingPanel = React.lazy(() => import("../components/LevellingPanel.jsx")); // TASKS.csv #1001
const PublicGeochemModal = React.lazy(() => import("../components/PublicGeochemModal.jsx")); // TASKS.csv #846
import QAQCPanel from "../components/QAQCPanel.jsx";
// TASKS.csv #224 — see ViewerModule.jsx's own comment on this same lazy import (sql.js's 658KB wasm
// was pulled in on every app launch via this static import chain, regardless of whether SQL workspace
// was ever opened).
const SQLWorkspaceModal = React.lazy(() => import("../components/SQLWorkspaceModal.jsx"));
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";
import EmptyState, { emptyStateSecondaryBtn } from "../components/EmptyState.jsx"; // TASKS.csv #309

const ALL_DIAGRAMS = { ...DIAGRAMS, ...SPIDER_DIAGRAMS };
// TASKS.csv #1678 — the X-Y scatter: its axes are chosen on the tab, so it is built there (lib/geochemXY.js); this stands in until they are
const XY_ENTRY = { id: "xy", label: "X–Y scatter (choose the axes)", requires: [], xLabel: "", yLabel: "", xRange: [0, 1], yRange: [0, 1], project: () => null };
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
import { labAssays, isPxrfRow, sampleTypeClass, classifyQAQCRow } from "../lib/qaqc.js"; // TASKS.csv #1673; sampleTypeClass: #1661; classifyQAQCRow: #2027
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { exportSvgMarkup } from "../lib/svgExport.js"; // TASKS.csv #1089 — font, size, no UI chrome
import { geochemFurniture } from "../lib/figureFurniture.js"; // TASKS.csv #1017
import { stampLines, withStamp } from "../lib/provenance.js"; // TASKS.csv #1212
import { version as APP_VERSION } from "../../package.json"; // TASKS.csv #1212
import { useTabNotices } from "../lib/useTabNotices.js"; // TASKS.csv #1203
import SampleGridPanel from "../components/SampleGridPanel.jsx"; // TASKS.csv #1622
import { methodColumnFor, methodsIn, partialDigestionFor } from "../lib/digestion.js"; // TASKS.csv #1518
import { axisOf, xyDiagram } from "../lib/geochemXY.js"; // TASKS.csv #1678
import { numericSourceChoices } from "../lib/numericSources.js"; // TASKS.csv #1678
import { requestProjectCrs } from "../lib/projectCrsRequest.js"; // TASKS.csv #1445
import { tieOf, fileToLocal } from "../lib/localGridTie.js"; // TASKS.csv #2320
import { flagColumns, flagQualifier, censoredSamples } from "../lib/assayFlags.js"; // TASKS.csv #2018
import { groupShapefileParts, parseVectorFile } from "../lib/viewer/importHelpers.js"; // TASKS.csv #2016
const VECTOR_FILE = /\.(shp|zip|gpkg|kml|kmz)$/i; // #2016 — sample points from GIS files
const OWN_CRS = "(own CRS)"; // #2016 — sourceEpsgFrom when the CRS came from a .prj / GeoPackage SRS, not a column
const SHP_GROUP = (list) => groupShapefileParts(list).files; // a .shp with its .dbf / .prj / .cpg as one file (#2121's rule)

const KEY_MAX = 16; // TASKS.csv #1519 — the on-screen colour key's entries

// TASKS.csv #1670 — the sample-number column of a surface table (the import and the join of a second file)
const SURFACE_ID_ALIASES = ["sample_id", "sampleid", "samp_num", "sample_num", "sample_number", "samp_id", "sample", "sample_no"];

export default function GeochemModule() {
  const store = useStore();
  const setTaskProgress = useSetTaskProgress(); // #2164
  const keptScope = scopeOf(store.getProjectToken()); // TASKS.csv #1284 — survives a tab switch
  const { assays, setAssays, assayElements, setAssayElements, surfaceSamples, setSurfaceSamples, surfaceElements, setSurfaceElements, geochemThresholds, setGeochemThresholds, surfaceQc, setSurfaceQc, mapLayers, replaceLayer, layers, collars, survey, boundaries, alterationBoxes, setAlterationBoxes, project, projectIsEmpty, setEpsg, viewerUiState } = store; // viewerUiState: #1091 (the 3D legend's colour edits)
  const [altBoxOpen, setAltBoxOpen] = useState(false); // TASKS.csv #503
  const assayHoleIds = useMemo(() => new Set(assays.map((a) => a.hole_id)), [assays]);

  const [diagramId, setDiagramId] = useKeptState(keptScope, "geochem.diagramId", "boxplot");
  const [xyX, setXyX] = useKeptState(keptScope, "geochem.xyX", ""); // #1678 — "el:Cu" or a numeric source key
  const [xyY, setXyY] = useKeptState(keptScope, "geochem.xyY", "");
  const [colorMode, setColorMode] = useKeptState(keptScope, "geochem.colorMode", "hole"); // hole | element | lithology (#619) | uniform
  // TASKS.csv #619 — plot only samples from chosen logged lithologies (null = every sample)
  const [lithFilter, setLithFilter] = useKeptState(keptScope, "geochem.lithFilter", null); // null | Set of codes (NOT_LOGGED = samples with no log)
  // TASKS.csv #1673 (review #1645, Copley) — the diagrams and the lithology filter plotted lab assays and pXRF readings together without
  // a word (2,095 points, 556 of them screening readings): the plots take one source, lab by default, pXRF or both on request
  const [plotSource, setPlotSource] = useKeptState(keptScope, "geochem.plotSource", "lab");
  const hasPxrf = useMemo(() => assays.some(isPxrfRow), [assays]);
  const sourceAll = useMemo(() => (!hasPxrf || plotSource === "both" ? assays : assays.filter((a) => (plotSource === "pxrf" ? isPxrfRow(a) : !isPxrfRow(a)))), [assays, hasPxrf, plotSource]);
  // TASKS.csv #2027 (review #2013, Woodjam) — QC inserts (standards, blanks, duplicates) are not rocks: 109 CRM pulps and 56 blanks sat
  // among the drill samples on every diagram ('1964 of 1964 samples plotted'). Left out by default, as Grade stats / Best intercepts /
  // Compositing do (#219), with a tick to plot them.
  const [plotQc, setPlotQc] = useKeptState(keptScope, "geochem.plotQc", false);
  const qcInSource = useMemo(() => sourceAll.filter((a) => classifyQAQCRow(a) !== "regular").length, [sourceAll]);
  const sourceRows = useMemo(() => (plotQc || !qcInSource ? sourceAll : sourceAll.filter((a) => classifyQAQCRow(a) === "regular")), [sourceAll, plotQc, qcInSource]);
  const [lithMenuOpen, setLithMenuOpen] = useState(false);
  const [colorElement, setColorElement] = useKeptState(keptScope, "geochem.colorElement", null);
  // TASKS.csv #1091 — the element to colour by: the one chosen, else Au, else the first. colorElement is set only when an
  // assay file is imported here, so an opened project or a sample showed "by element" with every point the uniform blue
  // while the drop-down displayed its first option.
  const colorEl = colorElement && assayElements.some((e) => e.symbol === colorElement) ? colorElement : (assayElements.find((e) => e.symbol === "Au") || assayElements[0])?.symbol || null;
  const [assayModal, setAssayModal] = useState(null);
  const [certReview, setCertReview] = useState(null); // TASKS.csv #601
  const [surfaceModal, setSurfaceModal] = useState(null);
  const [isoconOpen, setIsoconOpen] = useState(false);
  // TASKS.csv #401 — calculated element (vectoring index) panel
  const [calc, setCalc] = useState(null); // null | { name, expr, msg }
  const [corrOpen, setCorrOpen] = useState(false);
  const [bestIntOpen, setBestIntOpen] = useState(false);
  const [compositingOpen, setCompositingOpen] = useState(false);
  const [gradeStatsOpen, setGradeStatsOpen] = useState(false);
  const [thresholdsOpen, setThresholdsOpen] = useState(false); // TASKS.csv #841
  const [planMapOpen, setPlanMapOpen] = useState(false); // TASKS.csv #1792 / #1864
  const [surfaceQcOpen, setSurfaceQcOpen] = useState(false); // TASKS.csv #842
  const [catchmentsOpen, setCatchmentsOpen] = useState(false); // TASKS.csv #845
  const [plannerOpen, setPlannerOpen] = useState(false); // TASKS.csv #844
  const [publicOpen, setPublicOpen] = useState(false); // TASKS.csv #846
  const [domainsOpen, setDomainsOpen] = useState(false); // TASKS.csv #852
  const [levellingOpen, setLevellingOpen] = useState(false); // TASKS.csv #1001
  const [qaqcOpen, setQaqcOpen] = useState(false);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [notices, setNotices] = useTabNotices(useStore().activeTabId); // #1203
  const [dragOver, setDragOver] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();
  const fileRef = useRef(null);
  const pxrfRef = useRef(null);
  const surfaceFileRef = useRef(null);
  const certRef = useRef(null); // TASKS.csv #601
  // TASKS.csv #565 — File > Import CSV / Import Assays / Import pXRF
  useModuleAction(["import-assays", "import-pxrf"], (a) => (a === "import-pxrf" ? pxrfRef : fileRef).current?.click());
  // TASKS.csv #1350 — an assay file dropped on the 3D View (alone or in a drill folder) opens here, as if picked with Import
  // TASKS.csv #1652 (review #1645, Copley) — every assay-like file of a 3D View drop, one after another (only the first was opened: the pXRF
  // file got '1 more assay file(s) to import from the Geochem tab' and had to be found and dropped again), each routed by its name as
  // this tab's own drop does (pxrf / xrf -> the pXRF import)
  useModuleAction(["import-assay-file"], (_a, p) => { const fs = p?.files || (p?.file ? [p.file] : []); enqueueAssayFiles(fs); });
  // TASKS.csv #917 — assays straight from a database: this tab's Database button, or a table the 3D View's database
  // Browser panel recognized as assays and handed over
  const [dbOpen, setDbOpen] = useState(false);
  // TASKS.csv #975 — a surface-sample table (coordinates, no from / to) from a database opens in the surface import
  useModuleAction(["import-assay-rows"], (_a, p) => {
    if (!p?.rows?.length) return;
    const file = { name: p.sourceName, dbSource: p.dbSource || null }; // dbSource: TASKS.csv #1963
    if (isSurfaceSampleTable(p.headers)) {
      const pv = detectLongAssay(p.headers) ? pivotLongAssays(p.rows, p.headers, (sym) => inferUnit(sym, sym), (a) => isElementColumn(a)) : null;
      if (pv?.rows.length) setNotices((q) => [...q, `${p.sourceName}: ${longAssayNote(pv.report)}`]);
      openSurfaceRows(file, pv?.rows.length ? pv.headers : p.headers, pv?.rows.length ? pv.rows : p.rows);
      return;
    }
    openTable(file, p.headers, p.rows, false);
  });
  // TASKS.csv #1963 — "Reload from database" on the 3D View: an assay table pulled again, committed with the saved choices
  useModuleAction(["reload-assay-rows"], (_a, p) => {
    if (!p?.rows?.length || !p.saved) return;
    const file = { name: p.saved.fileName || "db table", dbSource: p.dbSource || null };
    commitAssayImport({ ...p.saved, file, fileName: file.name, headers: p.headers || p.saved.headers, sampleRows: p.rows.slice(0, 5), allRows: p.rows, busy: false });
  });
  const svgRef = useRef(null);

  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  // TASKS.csv #1678 — the X-Y scatter's axes: elements, then the numeric downhole logs and custom-layer fields (read at each sample's depth)
  const xyChoices = useMemo(() => numericSourceChoices({ layers: store.layers, customLayers: store.customLayers }), [store.layers, store.customLayers]);
  // TASKS.csv #2193 (review #2174) — with one element Y defaulted to '' and the select showed its first option (Au) over an empty plot: the
  // second element, else the first downhole log (Au vs RQD / recovery), else the one element again; never a blank shown as a choice
  const xyKeyX = xyX || (assayElements[0] ? `el:${assayElements[0].symbol}` : ""), xyKeyY = xyY || (assayElements[1] ? `el:${assayElements[1].symbol}` : xyChoices[0]?.key || (assayElements[0] ? `el:${assayElements[0].symbol}` : ""));
  const xyDiag = useMemo(() => {
    if (diagramId !== "xy") return null;
    const choice = (key) => { if (!key) return null; if (key.startsWith("el:")) { const e = assayElements.find((x) => x.symbol === key.slice(3)); return e ? { kind: "element", symbol: e.symbol, unit: e.unit } : null; } return xyChoices.find((c) => c.key === key) || null; };
    const ctx = { layers: store.layers, customLayers: store.customLayers };
    return xyDiagram(axisOf(choice(xyKeyX), ctx), axisOf(choice(xyKeyY), ctx), sourceRows, elementUnits);
  }, [diagramId, xyKeyX, xyKeyY, xyChoices, assayElements, sourceRows, elementUnits, store.layers, store.customLayers]);
  // TASKS.csv #1091 (review #1016, software artist) — holes from the colour-blind-safe categorical palette, in name order
  // (golden-angle HSL at one lightness put neighbouring hues at the same lightness, not dichromat-safe)
  const holeColors = useMemo(() => {
    const holes = Array.from(new Set(assays.map((a) => a.hole_id))).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    const map = {};
    holes.forEach((h, i) => { map[h] = i < CATEGORICAL_SAFE_COLORS.length ? CATEGORICAL_SAFE_COLORS[i] : hashColor(String(h)); });
    return map;
  }, [assays]);

  // TASKS.csv #619 — each sample's logged lithology (largest overlap with the 3D View's lithology log)
  const sampleLith = useMemo(() => lithologyBySample(assays, layers?.litho), [assays, layers?.litho]);
  const lithCounts = useMemo(() => lithologyCounts(sampleLith), [sampleLith]);
  const hasLithLog = (layers?.litho || []).length > 0;
  // TASKS.csv #1091 — a code is the colour it is everywhere else (3D view, strip log, section, Layout legend): the
  // lithology palette plus the user's legend edits. It was hsl by rank in this plot's counts, so it differed from the
  // 3D view and moved whenever the lithology filter changed the ranks.
  const lithOverride = viewerUiState?.legendOverride?.litho;
  const lithColors = useMemo(() => Object.fromEntries(lithCounts.map(([k]) => [k, k === NOT_LOGGED ? "#b8bec7" : lithOverride?.[k]?.color || colorForLithology(k)])), [lithCounts, lithOverride]);
  const plotted = useMemo(() => (lithFilter ? sourceRows.filter((a) => lithFilter.has(sampleLith.get(a) ?? NOT_LOGGED)) : sourceRows), [sourceRows, lithFilter, sampleLith]); // sourceRows: #1673
  // TASKS.csv #1519 — the holes plotted, for the on-screen key of 'by hole' (only worked out in that mode: 83,670 samples on Lawyers)
  const plottedHoles = useMemo(() => (colorMode === "hole" ? [...new Set(plotted.map((a) => a.hole_id))] : []), [colorMode, plotted]);
  const describeSample = (sm) => {
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2).replace(/\.?0+$/, "") : "?");
    return [
      `${sm.hole_id}  ${num(sm.from)}–${num(sm.to)} m`,
      `Sample ID: ${sm.sample_id || "— (none in the assay file)"}`,
      `Lithology (logged): ${hasLithLog ? sampleLith.get(sm) ?? "not logged here" : "no lithology log loaded"}`,
    ];
  };
  // TASKS.csv #619 (#618 click review) — the element colour range was recomputed over ALL assays for EVERY point
  // (6,297 samples: ~40 million value lookups per redraw, enough to freeze the tab); now once per change
  // TASKS.csv #1091 — the grade ramp (viridis, log-spaced when the values span two decades or more: gradeStops, #702);
  // it was a linear blue-red RGB blend over min-max, so a skewed Au or Cu put nearly every sample at the blue end
  // TASKS.csv #1393 — the colour scale in the element's own unit (Pb held in % read '0.4 ... 120000 ppm (log)')
  const colorUnit = (colorEl && elementUnits[colorEl]) || "ppm";
  const colorRange = useMemo(() => {
    if (colorMode !== "element" || !colorEl) return null;
    const vals = assays.map((a) => valueIn(a, colorEl, colorUnit, elementUnits)).filter((x) => x != null);
    if (!vals.length) return null;
    const pos = vals.filter((v) => v > 0), min = pos.length ? arrMin(pos) : arrMin(vals), max = arrMax(vals);
    const stops = gradeStops(min, max);
    return { min, max, stops, log: min > 0 && max / min >= 100 };
  }, [colorMode, colorEl, colorUnit, assays, elementUnits]);
  // TASKS.csv #1519 — one function per colour choice (not per render), so the plot's cached points image is redrawn only when the
  // colours change: a new function every render redrew 83,670 points on any re-render of this tab
  const colorBy = useMemo(() => { const fn = (sample) => {
    if (colorMode === "uniform") return "#4a9be0";
    if (colorMode === "hole") return holeColors[sample.hole_id] || "#55606e";
    if (colorMode === "lithology") return lithColors[sampleLith.get(sample) ?? NOT_LOGGED] || "#b8bec7";
    if (colorMode === "element" && colorEl) {
      const v = valueIn(sample, colorEl, colorUnit, elementUnits);
      if (v == null || !colorRange) return "#eef1f4";
      return colorForVoxelValue({ stops: colorRange.stops, colorMode: "continuous" }, Math.max(colorRange.min, v)); // #1091
    }
    return "#4a9be0";
  };
  // with colour by element, the plot draws low values first and high values on top
  fn.rank = colorMode === "element" && colorEl ? (sample) => valueIn(sample, colorEl, colorUnit, elementUnits) ?? -Infinity : null;
  return fn; }, [colorMode, colorEl, colorUnit, holeColors, lithColors, sampleLith, colorRange, elementUnits]);

  const diagram = diagramId === "xy" ? xyDiag || XY_ENTRY : ALL_DIAGRAMS[diagramId]; // xy: #1678
  // TASKS.csv #1392 — a volcanic-protolith diagram on mostly calcareous samples says so (see carbonateShare)
  const carbShare = useMemo(() => carbonateShare(assays, elementUnits), [assays, elementUnits]);
  const carbonateNote = VOLCANIC_DIAGRAMS.includes(diagramId) && carbShare != null && carbShare > 1 / 3 ? tr("{pct} % of the samples hold 10 % Ca or more (carbonate rock): this diagram assumes a volcanic protolith, so read it with care here.", { pct: Math.round(carbShare * 100) }) : "";
  // #1519 — how many samples the diagram can place: computed once per diagram / sample set, not on every render (it projected
  // all 83,670 samples again in the caption and the export furniture)
  // TASKS.csv #2018 — the half-detection sentence counts the plotted samples that hold a '<' value for the diagram's elements
  const censoredCount = useMemo(() => censoredSamples(plotted, diagram.spider ? diagram.order : diagram.requires), [plotted, diagram]);
  const plottedCount = useMemo(() => (diagram.spider ? plotted.filter((a) => reeProfile(a, elementUnits, diagram.order, diagram.norm).some((p) => p.value != null)).length : plotted.filter((a) => diagram.project(a, elementUnits)).length), [diagram, plotted, elementUnits]);
  const availableSymbols = new Set(assayElements.map((e) => e.symbol));
  const missingForDiagram = diagram.requires.filter((s) => !availableSymbols.has(s));

  // TASKS.csv #391 — the Harry property sample's assays (the same shipped file the 3D View's "Load sample
  // project" notice points to), through the normal assay import so every check and notice is the usual one.
  const [sampleLoading, setSampleLoading] = useState(false);
  const loadSampleAssays = async () => {
    setSampleLoading(true);
    try {
      const [file] = await loadSampleFiles("harry_property", ["assay_wide.csv"]);
      // TASKS.csv #716 — this sample's README: below-detection results were left blank in the extraction, so an empty
      // element cell here means "below detection", not "not assayed" (the dialog still lets the user choose)
      handleFile(file, false, { blankMode: "bdl", blankNote: tr("This bundled sample's README says below-detection results (\"<0.001\" in the source) were left blank, so \"Below detection\" is selected.") });
    } catch (err) {
      setNotices((p) => [...p, errorNotice(tr("Couldn't load the sample assays: {message}", { message: err.message }))]);
    } finally {
      setSampleLoading(false);
    }
  };
  // TASKS.csv #605 — an .xlsx gives its sheet with the most element columns (an MX "Assay Samples" sheet)
  const elementScore = (headers) => headers.filter((h) => isElementColumn(h)).length;
  // #1652 — a queue of dropped / handed-over files: the next opens when the assay dialog closes (committed or cancelled), or at once
  // when a file opens no dialog (an empty file, a surface-sample table goes to its own import)
  const fileQueueRef = useRef([]);
  const queueBusyRef = useRef(false);
  const assayOpenRef = useRef(false);
  const nextQueuedFile = () => {
    if (queueBusyRef.current || assayOpenRef.current) return;
    const f = fileQueueRef.current.shift();
    if (!f) return;
    queueBusyRef.current = true;
    handleFile(f, /pxrf|xrf/i.test(f.name)).finally(() => { queueBusyRef.current = false; setTimeout(() => { if (!assayOpenRef.current) nextQueuedFile(); }, 0); });
  };
  const enqueueAssayFiles = (files) => { fileQueueRef.current.push(...files); nextQueuedFile(); };
  useEffect(() => { assayOpenRef.current = !!assayModal; if (!assayModal) nextQueuedFile(); }, [assayModal]);
  // TASKS.csv #2016 — a table, or the rows of a point shapefile / GeoPackage / KML (read here, or already read by the 3D view's drop:
  // file.parsedTable). Lines and polygons are not samples.
  const readSampleTable = (file) => {
    if (file.parsedTable) return Promise.resolve({ rows: file.parsedTable.rows, headers: file.parsedTable.headers, note: "" });
    if (!VECTOR_FILE.test(file.name)) return parseTableOrWorkbook(file, elementScore, { columnar: true });
    return new Promise((resolve, reject) => parseVectorFile(file, (rows, err, meta) => {
      if (meta?.layerOptions) { reject(new Error(tr("it holds several layers: drop it on the 3D view to pick one."))); return; }
      if (err || !rows?.length) { reject(new Error(err || tr("no rows found"))); return; }
      if (meta?.vector?.geomType && meta.vector.geomType !== "point") { reject(new Error(tr("it holds lines or polygons, not sample points: import it as a map layer."))); return; }
      file.parsedTable = { rows, headers: meta?.headers || Object.keys(rows[0]), sourceEpsg: meta?.detectedEpsg || null };
      resolve({ rows, headers: file.parsedTable.headers, note: "" });
    }));
  };
  const handleFile = (file, isPxrf, preset = null) => { // preset: #716 — dialog defaults for a known file
    // TASKS.csv #2164 — a big file says it is being read (110 MB took 6-30 s with nothing on screen)
    const readLabel = file.size >= 20e6 ? tr("Reading {name}…", { name: file.name }) : null;
    if (readLabel) setTaskProgress({ label: readLabel, indeterminate: true });
    return readSampleTable(file).finally(() => { if (readLabel) setTaskProgress((cur) => (cur?.label === readLabel ? null : cur)); }).catch((e) => { setNotices((p) => [...p, errorNotice(tr("{name}: {error}", { name: file.name, error: e?.message || String(e) }))]); return { rows: [], headers: [], note: "", failed: true }; }).then((t) => {
        if (t.failed) return; // TASKS.csv #444 — shared reader: comma decimals + encoding fallback; #611 big files held as columns
        const res = { data: t.rows, meta: { fields: t.headers }, note: t.note };
        // TASKS.csv #284 — comma-decimal (European-locale) assay values parse as strings, which
        // Number()s to NaN and silently drops the sample. Same shared fix as the collar/interval
        // import path (src/lib/numberLocale.js) — and the note is surfaced, not swallowed.
        const data = res.data, note = res.note ? ` ${res.note.trim()}` : "";
        if (!data.length) { setNotices((p) => [...p, errorNotice(tr("{name}: empty file.", { name: file.name }))]); return; }
        if (note) setNotices((p) => [...p, `${file.name}:${note}`]);
        openTable(file, t.headers, data, isPxrf, preset); // #611 — a columnar row has no own keys (was Object.keys(data[0]))
    });
  };
  // a parsed table - a file, or rows from a database (#917, `file` is then just { name })
  const openTable = (file, headers, data, isPxrf, preset = null) => {
    // TASKS.csv #623 — a long export (analyte + concentration / value + units + method + flag, one row per element)
    // becomes one row per sample with an element column each, then goes through the normal wide import
    const pv = detectLongAssay(headers) ? pivotLongAssays(data, headers, (sym) => inferUnit(sym, sym), (a) => isElementColumn(a)) : null;
    if (pv && pv.rows.length) {
      setNotices((p) => [...p, `${file.name}: ${longAssayNote(pv.report)}`]);
      openAssayModal(file, pv.headers, pv.rows, isPxrf, preset);
      return;
    }
    // TASKS.csv #1086 (review #1016, onboarding) — a table with coordinates and no from / to is surface samples (soils,
    // silts, rocks): it went down the drill-assay path and ended as "{n} row(s) skipped: no hole id, or a blank from or to"
    // with no pointer to the Surface samples import. It now opens that dialog, with a notice saying why.
    if (!preset && isSurfaceSampleTable(headers)) { // the #975 test the database path already uses
      setNotices((p) => [...p, tr("{name}: coordinates and no from / to depths, so it was opened as surface samples (soils, silts, rocks). Drillhole assays need a hole ID and from / to.", { name: file.name })]);
      openSurfaceRows(file, headers, data);
      return;
    }
    openAssayModal(file, headers, data, isPxrf, preset);
  };

  const openAssayModal = (file, headers, data, isPxrf, preset = null) => {
    assayOpenRef.current = true; // #1652 — at once: the queue checks it before React has run the effect that would
    // TASKS.csv #600 (40958Z) — the shared column matcher: "To (m)" / "Hole ID" style headers, and no bare
    // substring match on a short alias ("to" inside any header that contains those two letters)
    const guess = (aliases) => guessColumn(headers, aliases);
    // the interval schemas' own alias lists (sampfrom / sampto / geolto... — "SAMPTO" only matched the bare "to")
    const aliasesOf = (key) => TARGET_SCHEMAS.litho.fields.find((f) => f.key === key).aliases;
    const holeCol = guess(aliasesOf("hole_id"));
    const fromCol = guess(aliasesOf("from"));
    const toCol = guess(aliasesOf("to"));
    const isLong = headers.some((h) => /^(analyte|element)$/i.test(h.trim())) && headers.some((h) => /^(abundance|value|result)$/i.test(h.trim()));
    if (isLong) {
      const analyteCol = guess(["analyte", "element"]);
      const valueCol = guess(["abundance", "value", "result"]);
      const methodCol = guess(["method"]);
      const methods = methodCol ? Array.from(new Set(data.map((r) => r[methodCol]).filter(Boolean))) : [];
      const analytes = Array.from(new Set(data.map((r) => r[analyteCol]).filter(Boolean)));
      const elements = analytes.filter(isElementColumn).map((sym) => ({ symbol: sym, header: sym, unit: inferUnit(sym, sym), checked: true }));
      setAssayModal({ file, fileName: file.name, format: "long", isPxrf, headers, sampleRows: data.slice(0, 5), allRows: data, mapping: { hole_id: holeCol, from: fromCol, to: toCol, analyte: analyteCol, value: valueCol, method: methodCol }, qc: qcColumns(headers), methods, selectedMethod: methods[0] || null, elements, ...preset });
    } else {
      // TASKS.csv #210 — a single lab export can carry more than one column for the same element
      // (e.g. this session's real pXRF sample data has "Ag_XRF_Corrected_ppm_D", "Ag_pXRF_ppm", AND
      // "Ag_Error_pXRF_ppm" all matching isElementColumn's front-token match) — one row per matching
      // header would show duplicate "Ag" checkboxes and, if more than one got checked, silently let
      // whichever happened to be LAST in header order win in commitAssayImport's values[e.symbol]
      // assignment. Dedupe to one row per symbol, preferring the first non-"error" match (an
      // uncertainty/error-margin column is never the intended assay value) — the header dropdown in
      // AssayImportModal lets the user repoint any row at a different column, including one of the
      // other candidates this dedupe didn't pick, or a column the auto-detector missed entirely.
      // TASKS.csv #600 / #542 — the most complete column per element, an over-limit (ore-grade) column when one
      // exists, descriptive / error columns skipped, implausible default-% units corrected (pickElementColumns).
      // TASKS.csv #2164 — a big table's element columns are counted in one chunked pass (status-bar progress) before the dialog opens: one
      // pass per column on the main thread froze the window (0.85 s on 590,000 rows x 30 elements)
      const openWide = (stats) => {
        const elements = pickElementColumns(headers, data, stats).map((e) => ({ ...e, mainHeader: e.header, checked: e.n > 0 })); // #1389 — a column with no value in any row stays unticked
        setAssayModal({ file, fileName: file.name, format: "wide", isPxrf, headers, sampleRows: data.slice(0, 5), allRows: data, mapping: { hole_id: holeCol, from: fromCol, to: toCol }, qc: qcColumns(headers), methods: [], selectedMethod: null, elements, ...preset });
      };
      if (data.length < ELEMENT_SCAN_CHUNKED_ROWS) { openWide(null); return; }
      const scanLabel = tr("Checking the element columns of {name}…", { name: file.name });
      setTaskProgress({ label: scanLabel, pct: 0 });
      elementColumnStats(data, headers, { onProgress: (f) => setTaskProgress((cur) => (cur?.label === scanLabel ? { ...cur, pct: f * 100 } : cur)) })
        .then(openWide)
        .finally(() => setTaskProgress((cur) => (cur?.label === scanLabel ? null : cur)));
    }
  };

  // TASKS.csv #601 — lab certificates: parse, join to the loaded assays by sample id, compare values, and suggest a QC
  // type for each certificate sample the drillhole data doesn't have. Nothing is written until the review is accepted.
  const handleCertificates = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const parsed = [], skipped = [];
    for (const f of files) {
      const text = await f.text();
      if (!isLabCertificateText(text)) { skipped.push(f.name); continue; }
      parsed.push(parseLabCertificate(text, f.name));
    }
    if (skipped.length) setNotices((p) => [...p, errorNotice(tr("Not a lab certificate (no \"<id> - Finalized\" title with SAMPLE / DESCRIPTION rows), skipped: {skipped}.", { skipped: skipped.join(", ") }))]);
    if (!parsed.length) return;
    const all = combineCertificates(parsed);
    const join = joinCertificatesToAssays(all.rows, assays);
    if (!join.matched.length) {
      setNotices((p) => [...p, errorNotice(tr("None of the {rows} certificate samples matches a loaded assay's sample id{v}. Certificates are joined to the drill samples by sample id.", { rows: all.rows.length.toLocaleString(), v: join.assaysWithoutId ? tr(" ({assaysWithoutId} assay rows carry no sample id — import the drill samples with their sample-number column)", { assaysWithoutId: join.assaysWithoutId.toLocaleString() }) : "" }))]);
      return;
    }
    const columns = parsed.flatMap((p) => p.columns).filter((c, i, a) => a.findIndex((x) => x.header === c.header) === i);
    const elementCols = pickElementColumns(all.headers.filter((h) => h !== "sample_id" && h !== "certificate"), all.rows);
    // value check + what the certificates could add
    let mismatchCount = 0, fillable = 0; const mismatchExamples = [], fillElements = new Set();
    for (const { cert, assay } of join.matched) {
      for (const e of elementCols) {
        const raw = String(cert[e.header] ?? "").trim();
        if (!raw || /^[<>]/.test(raw)) continue;
        const v = parseAssayValue(raw);
        if (v == null || !Number.isFinite(v)) continue;
        const db = assay.values?.[e.symbol];
        if (db == null) { fillable++; fillElements.add(e.symbol); continue; }
        const c = convertUnit(v, e.unit, elementUnits[e.symbol] || e.unit);
        if (Math.abs(c - db) > 0.02 * Math.max(Math.abs(c), Math.abs(db)) && Math.abs(c - db) > 1e-9) {
          mismatchCount++;
          if (mismatchExamples.length < 4) mismatchExamples.push(`${assay.sample_id} ${e.symbol}: database ${db}, certificate ${c} ${elementUnits[e.symbol] || e.unit}`);
        }
      }
    }
    const suggestions = suggestQcTypes(join.unmatched, join.matched.map((m) => m.cert), columns)
      .map((s, i) => ({ ...s, certificate: join.unmatched[i].certificate }));
    setCertReview({
      all, elementCols, suggestions, fill: fillable > 0,
      summary: { certificates: parsed.length, rows: all.rows.length, matched: join.matched.length, unmatched: join.unmatched.length, mismatchCount, mismatchExamples, fillable, fillElements: [...fillElements].slice(0, 12), labs: [...new Set(parsed.map((p) => p.meta.project).filter(Boolean))].join(", ") },
      matched: join.matched,
    });
  };

  const commitCertificates = (review) => {
    const { all, elementCols, suggestions, fill, matched } = review;
    const certById = new Map(all.rows.map((r) => [String(r.sample_id).trim().toUpperCase(), r]));
    const { byId, byPrefix } = indexAssaysForPlacement(assays);
    const certHeaders = elementCols.flatMap((e) => [e.header, ...(e.overLimit ? [e.overLimit.header] : [])]);
    const rows = []; let unplaced = 0;
    const counts = { standard: 0, blank: 0, duplicate: 0 };
    for (const s of suggestions) {
      if (!counts.hasOwnProperty(s.type)) continue; // "unclassified" = not imported
      const cert = certById.get(String(s.sample_id).trim().toUpperCase());
      const placed = qcRowPlacement(s, { byId, byPrefix });
      if (!cert || !placed) { unplaced++; continue; }
      const { own, ...place } = placed;
      const row = { ...place, sample_type: s.type, sample_id: s.sample_id, parent_id: s.type === "duplicate" ? (s.parent_id || "") : "", qc_code: s.type === "standard" ? (s.qc_code || "") : "" };
      certHeaders.forEach((h) => { row[h] = cert[h]; });
      rows.push(row); counts[s.type]++;
    }
    let filled = 0;
    if (fill) {
      for (const { cert, assay } of matched) {
        const row = { hole_id: assay.hole_id, from: assay.from, to: assay.to, sample_id: assay.sample_id, sample_type: assay.sample_type || "", parent_id: assay.parent_id || "", qc_code: assay.qc_code || "" };
        let any = false;
        for (const e of elementCols) {
          const has = assay.values?.[e.symbol] != null;
          row[e.header] = has ? "" : cert[e.header];
          if (e.overLimit) row[e.overLimit.header] = has ? "" : cert[e.overLimit.header];
          if (!has && String(cert[e.header] ?? "").trim()) { any = true; filled++; }
        }
        if (any) rows.push(row);
      }
    }
    if (!rows.length) { setCertReview(null); return; }
    commitAssayImport({
      format: "wide", isPxrf: false, negativeMode: "bdl", blankMode: "missing",
      headers: ["hole_id", "from", "to", "sample_type", "sample_id", "parent_id", "qc_code", ...certHeaders],
      allRows: rows, mapping: { hole_id: "hole_id", from: "from", to: "to" },
      elements: elementCols.map((e) => ({ ...e, mainHeader: e.header, checked: true })),
    });
    setNotices((p) => [...p, notice("Lab certificates: imported {standard} standard(s), {blank} blank(s) and {duplicate} duplicate(s) as QC samples{v}{v2}. They are in the QAQC panel; intercepts, statistics and models leave them out.", { standard: counts.standard, blank: counts.blank, duplicate: counts.duplicate, v: fill && filled ? tr(", and filled {filled} missing value(s) of the drill samples", { filled: filled.toLocaleString() }) : "", v2: unplaced ? tr("; {unplaced} could not be placed (no drill sample with a nearby number or the given parent)", { unplaced }) : "" })]);
    setCertReview(null);
  };

  const commitAssayImport = async (modal) => {
    if (modal.busy) return; // #583 — one import at a time (the row build below yields to the UI)
    const { format, allRows, mapping, selectedMethod, elements } = modal;
    // TASKS.csv #1518 — each element's method code(s) (a wide file's '<el>_analysis_code' column, a long file's chosen method), kept
    // on its element so the immobile-element tools can say when a partial digestion measured them
    const chosen = elements.filter((e) => e.checked).map((e) => { const ms = format === "wide" ? methodsIn(allRows, methodColumnFor(modal.headers || Object.keys(allRows[0] || {}), e.symbol)) : selectedMethod ? [String(selectedMethod)] : []; return ms.length ? { ...e, methods: ms } : e; });
    if (!mapping.hole_id || !mapping.from || !mapping.to) { setNotices((p) => [...p, errorNotice(tr("Map hole ID, from, and to columns."))]); return; }
    if (!chosen.length) { setNotices((p) => [...p, errorNotice(tr("Tick or add at least one element to import."))]); return; } // TASKS.csv #2183
    // TASKS.csv #1963 — a table pulled from a database: its record (profile, schema, table, these element and option choices)
    if (modal.file?.dbSource?.profile && store.setDbImports) { const rec = dbImportRecord(modal, modal.file.dbSource, "assays"); if (rec) store.setDbImports((prev) => upsertDbImport(prev, rec)); }
    // TASKS.csv #334 — the project keeps ONE unit per element (assayElements) and valueIn reads every
    // stored value in it, so importing a batch in a different unit used to silently rescale all the
    // EARLIER values (Au in ppm, then a ppb batch: every earlier Au read 1000x too low). Incoming values
    // are now converted into the unit the project already uses for that element, and the notice says so.
    const existingUnit = Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit]));
    const chosenBySymbol = new Map(chosen.map((e) => [e.symbol, e]));
    const converted = chosen.filter((e) => existingUnit[e.symbol] && existingUnit[e.symbol] !== e.unit);
    // TASKS.csv #333 — negative lab/database codes resolved at import (see readAssayCell).
    const negativeMode = modal.negativeMode || "bdl";
    let negBdl = 0, negMissing = 0, negOver = 0;
    const textCodes = { bdl: 0, nodl: 0, na: 0, nodlCols: new Set() }; // #2158
    // #1648 — each column's largest positive value, once: a negative code at that size is its upper limit
    const colMaxCache = new Map();
    const colMaxOf = (header) => { if (modal.overLimitCodes === false) return 0; let m = colMaxCache.get(header); if (m === undefined) { m = columnPositiveMax(modal.allRows, header); colMaxCache.set(header, m); } return m; };
    const oxideNotes = new Set(); // #403
    const oxideCache = new Map(); // #583 — per header, not per cell (2.3 M lookups on a 190,000-row file)
    const oxideOf = (header) => { let o = oxideCache.get(header); if (o === undefined) { o = oxideOfHeader(header) || null; oxideCache.set(header, o); } return o; };
    const dlCache = new Map(); // #2158 — each column's detection limit, once
    const dlOf = (header) => { let d = dlCache.get(header); if (d === undefined) { d = columnDetectionLimit((modal.allRows || []).map((r) => r[header])); dlCache.set(header, d); } return d; };
    const read = (raw, sym, header) => {
      const c = readAssayCell(raw, negativeMode, colMaxOf(header), dlOf(header));
      if (c.kind === "txt_bdl") textCodes.bdl++; else if (c.kind === "txt_bdl_nodl") { textCodes.nodl++; textCodes.nodlCols.add(sym); } else if (c.kind === "na_text") textCodes.na++; // #2158
      if (c.kind === "neg_bdl") negBdl++;
      else if (c.kind === "neg_missing") negMissing++;
      else if (c.kind === "neg_over") negOver++;
      const e = chosenBySymbol.get(sym);
      // TASKS.csv #403 — an oxide column (SiO2, Fe2O3T...) is stored as element wt%.
      const ox = oxideOf(header);
      if (ox && c.value != null) oxideNotes.add(`${ox.oxide} → ${ox.symbol} (÷${ox.factor})`);
      const elemPct = ox ? fromOxideHeader(c.value, header) : c.value;
      return { v: e ? convertUnit(elemPct, ox ? oxideUnit(header) : e.unit, existingUnit[sym] || (ox ? oxideUnit(header) : e.unit)) : elemPct, q: c.qualifier }; // oxideUnit: #2157
    };
    // TASKS.csv #400 — keep a QC-type and a sample-id column when the file has them (acQuire / MX exports
    // mark standards / blanks / duplicates there, under the real hole_id). Auto-detected by header name.
    // #400 — the original a duplicate was split from, and which CRM a standard is. #1184: as mapped in the dialog
    const qcCols = modal.qc || qcColumns(modal.headers);
    const tagQC = (out, r) => Object.assign(out, qcFields(r, qcCols));
    let rows = [];
    // TASKS.csv #508 — Number("") / Number(null) is 0, so a blank from or to used to become a phantom 0 m
    // interval (a real 2-3 m @ 10 g/t read as 5.5 g/t once averaged with it). Such rows are skipped and counted.
    // TASKS.csv #1661 (review #1646, Kodiak) — a row MARKED as a standard / blank / duplicate is a QC record and needs no depths: it is
    // kept (from / to null) for QAQC, as the surface import keeps its inserts (#842); only an unmarked row without depths is skipped
    const qcNoDepth = { standard: 0, blank: 0, duplicate: 0 };
    const validInterval = (r) => { if (!r.hole_id) return false; if (Number.isFinite(r.from) && Number.isFinite(r.to)) return true; const c = sampleTypeClass(r.sample_type); if (c === "standard" || c === "blank" || c === "duplicate") { qcNoDepth[c]++; r.from = null; r.to = null; return true; } return false; };
    let skippedNoDepth = 0;
    const overLimitFilled = new Map(); // #600 / #542 — element -> samples filled from the ore-grade column
    // TASKS.csv #502 — what an EMPTY element cell means in this file (the import dialog asks when there are
    // any): "missing" = not assayed (default; excluded from grades everywhere, reported as unsampled), or
    // "bdl" = below detection, stored as '<DL' at half the limit like any lab '<x'. The limit per element is
    // the lab's most common '<x' in that column, else the lowest value reported (blankDetectionLimit). A row
    // whose element cells are ALL empty had nothing analysed, so it stays not-assayed either way.
    const blankMode = modal.blankMode || "missing";
    const blankLimits = new Map(), blankBdl = new Map(), blankNoLimit = new Set();
    if (blankMode === "bdl") {
      chosen.forEach((e) => blankLimits.set(e.symbol, blankDetectionLimit(format === "wide"
        ? allRows.map((r) => r[e.header])
        : allRows.filter((r) => (!mapping.method || r[mapping.method] === selectedMethod) && isElementColumn(String(r[mapping.analyte] ?? "")) === e.symbol).map((r) => r[mapping.value]))));
    }
    // TASKS.csv #1677 (review #1645, Copley) — an exact 0 in a pXRF file is 'not detected' (Copley: Cu 166, Mo 334, Ag 547 of 556 readings):
    // stored as measured zeros they tied every rank, made Nb/Y = 0 and log10(0) (#1672). When the dialog says below detection (the pXRF
    // default), a zero becomes '<' at half the smallest reading in its column; with no reading at all in the column it is left out.
    const zeroMode = modal.zeroMode || (modal.isPxrf ? "bdl" : "real");
    const zeroLimits = new Map(); let zeroBdl = 0, zeroNoLimit = 0;
    const zeroAsBdl = (cell, sym, header) => {
      if (zeroMode !== "bdl" || parseAssayValue(cell) !== 0) return null;
      let L = zeroLimits.get(header);
      if (L === undefined) { L = Infinity; for (const r of allRows) { const x = parseAssayValue(format === "wide" ? r[header] : r[mapping.value]); if (x > 0 && x < L) L = x; } zeroLimits.set(header, L); }
      if (!Number.isFinite(L)) { zeroNoLimit++; return { v: null, q: null }; }
      zeroBdl++;
      return read(`<${L}`, sym, header);
    };
    const blankAsBdl = (sym, header) => {
      const L = blankLimits.get(sym);
      if (!L?.limit) { blankNoLimit.add(sym); return null; }
      blankBdl.set(sym, (blankBdl.get(sym) || 0) + 1);
      return read(`<${L.limit}`, sym, header);
    };
    // TASKS.csv #2018 — a '<el>_flag' column beside an element (LDL / UDL) gives its rows their qualifier; the value is kept as the file has it
    const flagCols = format === "wide" ? flagColumns(modal.headers || Object.keys(allRows[0] || {}), chosen) : new Map();
    const flagged = new Map(); // symbol -> { lo, hi }
    const repeatsKept = new Map(); // #2194 — repeat column -> rows kept as QC duplicates
    if (format === "wide") {
      // TASKS.csv #583 — built in chunks that yield to the UI (190,000 rows x 12 elements was a 1.45 s freeze)
      if (allRows.length > 20000) setAssayModal((m) => (m ? { ...m, busy: true } : m));
      rows = await mapInChunks(allRows, (r) => {
        const values = {};
        // TASKS.csv #261 — keep the censoring qualifier ('<' below detection / '>' over-range) alongside
        // the substituted number so the substitution stops being invisible downstream (dataQC warns on
        // over-range rows; nothing else has to care).
        const quals = {};
        const valueSources = {}; // #542 — element -> the ore-grade column a value came from
        const anyResult = blankMode === "bdl" && chosen.some((e) => !isBlankAssayCell(r[e.header])); // #502
        chosen.forEach((e) => {
          const cell = r[e.header]; // #583 — read once (a columnar row's value is a getter)
          let { v, q } = zeroAsBdl(cell, e.symbol, e.header) || read(cell, e.symbol, e.header); // #1677
          // #600 / #542 — a sample at the main column's cap takes its ore-grade re-assay (converted to the main
          // column's unit) when the file has one; only while the element still reads the auto-picked column
          const ol = e.overLimit && e.header === e.mainHeader ? e.overLimit : null;
          if (ol && parseAssayValue(cell) === ol.limit) {
            const og = parseAssayValue(r[ol.header]);
            if (og != null && Number.isFinite(og)) {
              v = convertUnit(og, ol.unit, existingUnit[e.symbol] || e.unit); q = null;
              overLimitFilled.set(e.symbol, (overLimitFilled.get(e.symbol) || 0) + 1);
              valueSources[e.symbol] = ol.header;
            }
          }
          if (v == null && anyResult && isBlankAssayCell(cell)) ({ v, q } = blankAsBdl(e.symbol, e.header) || { v, q });
          if (v != null && !q && flagCols.has(e.symbol)) { // #2018
            const fq = flagQualifier(r[flagCols.get(e.symbol)]);
            if (fq) { q = fq; const f = flagged.get(e.symbol) || { lo: 0, hi: 0 }; if (fq === "<") f.lo++; else f.hi++; flagged.set(e.symbol, f); }
          }
          if (v != null) {
            values[e.symbol] = v;
            if (q) quals[e.symbol] = q;
          }
        });
        const out = { hole_id: String(r[mapping.hole_id] ?? "").trim(), from: num(r[mapping.from]), to: num(r[mapping.to]), values, source: modal.isPxrf ? "pXRF" : "assay", ...(modal.fileName ? { srcFile: modal.fileName } : {}) }; // srcFile: #624
        if (Object.keys(quals).length) out.qualifiers = quals;
        if (Object.keys(valueSources).length) out.valueSources = valueSources; // #542 — which method each over-limit value is
        return tagQC(out, r);
      });
      setAssayModal((m) => (m ? { ...m, busy: false } : m));
      // TASKS.csv #2194 — each lab repeat cell (AuRp1, Au_Dup...) becomes a QC duplicate row on its original's interval, its parent the
      // original's sample id: QAQC's duplicate pairing reads it ("lab repeat" = a pulp repeat, #534)
      if (modal.keepRepeats !== false) {
        for (const rc of repeatColumns(modal.headers || Object.keys(allRows[0] || {}), chosen)) {
          let n = 0;
          allRows.forEach((r, i) => {
            const cell = r[rc.header];
            if (isBlankAssayCell(cell)) return;
            const { v, q } = read(cell, rc.symbol, rc.header);
            if (v == null) return;
            const orig = rows[i], sid = orig?.sample_id ?? null;
            const rep = { hole_id: orig?.hole_id ?? String(r[mapping.hole_id] ?? "").trim(), from: num(r[mapping.from]), to: num(r[mapping.to]), values: { [rc.symbol]: v }, source: "assay",
              ...(modal.fileName ? { srcFile: modal.fileName } : {}), sample_type: "lab repeat", sample_id: `${sid ?? `${r[mapping.hole_id]}:${r[mapping.from]}`}#${rc.header}`, ...(sid ? { parent_id: sid } : {}) };
            if (q) rep.qualifiers = { [rc.symbol]: q };
            rows.push(rep); n++;
          });
          if (n) repeatsKept.set(rc.header, n);
        }
      }
      const before = rows.length;
      rows = rows.filter(validInterval);
      skippedNoDepth = before - rows.length;
    } else {
      const byInterval = new Map();
      allRows.filter((r) => !mapping.method || r[mapping.method] === selectedMethod).forEach((r) => {
        const sym = isElementColumn(String(r[mapping.analyte] ?? ""));
        if (!sym || !chosen.find((c) => c.symbol === sym)) return;
        const hole = String(r[mapping.hole_id] ?? "").trim(), from = num(r[mapping.from]), to = num(r[mapping.to]);
        const key = `${hole}|${from}|${to}`;
        if (!byInterval.has(key)) byInterval.set(key, tagQC({ hole_id: hole, from, to, values: {}, source: modal.isPxrf ? "pXRF" : "assay", ...(modal.fileName ? { srcFile: modal.fileName } : {}) }, r)); // srcFile: #624
        let { v, q } = zeroAsBdl(r[mapping.value], sym, String(r[mapping.analyte] ?? "")) || read(r[mapping.value], sym, String(r[mapping.analyte] ?? "")); // TASKS.csv #261 qualifiers, #333 negatives, #334 units, #403 oxides; #1677 zeros
        if (v == null && blankMode === "bdl" && isBlankAssayCell(r[mapping.value])) ({ v, q } = blankAsBdl(sym, String(r[mapping.analyte] ?? "")) || { v, q }); // #502
        if (v != null) {
          const target = byInterval.get(key);
          target.values[sym] = v;
          if (q) { if (!target.qualifiers) target.qualifiers = {}; target.qualifiers[sym] = q; }
        }
      });
      const all = Array.from(byInterval.values());
      rows = all.filter(validInterval);
      skippedNoDepth = all.length - rows.length;
    }
    // TASKS.csv #336 — same hole/from/to merges into the existing row instead of duplicating it.
    // TASKS.csv #530 — a corrected file whose intervals changed for some holes: replace those holes (asked), else
    // the stale intervals stay beside the new ones and every intercept averages both
    const changed = holesWithChangedIntervals(assays, rows);
    let replaceHoles = [];
    if (changed.length) {
      const ok = window.confirm(
        tr("{n} hole(s) in this file have different sample intervals from the assays already loaded (e.g. {examples}).", { n: changed.length, examples: changed.slice(0, 3).map((h) => tr("{hole}: old {interval} not in the file", { hole: h.hole_id, interval: h.example })).join("; ") + (changed.length > 3 ? "; …" : "") }) + "\n\n" +
        tr("OK — REPLACE those holes' assays with this file's (a corrected or re-split file).") + "\n" +
        tr("Cancel — keep both (the old intervals stay beside the new ones; intercepts and statistics then see both)."));
      if (ok) replaceHoles = changed;
    }
    const base = replaceHoles.length ? dropHoleAssays(assays, replaceHoles) : assays;
    // #583 — merged ONCE (it was run twice, ~0.3 s each on 190,000 rows); recomputed only if the store moved on
    const mergeRes = mergeAssayRows(base, rows);
    const { merged: mergedCount, repeatedInFile } = mergeRes;
    setAssays((prev) => (prev === assays ? mergeRes.rows : mergeAssayRows(replaceHoles.length ? dropHoleAssays(prev, replaceHoles) : prev, rows).rows));
    // Existing elements keep their unit (#334); only new symbols add an entry.
    setAssayElements((prev) => { const merged = new Map(prev.map((e) => [e.symbol, e])); chosen.forEach((e) => { if (merged.has(e.symbol) && e.methods) { const m = merged.get(e.symbol); merged.set(e.symbol, { ...m, methods: [...new Set([...(m.methods || []), ...e.methods])] }); } /* #1518 */ if (!merged.has(e.symbol)) merged.set(e.symbol, oxideOfHeader(e.header) ? { ...e, unit: oxideUnit(e.header) } : e); }); return Array.from(merged.values()); }); // #403: oxide-sourced elements are stored in % (#2157: or the ppm / ppb the header says)
    if (!colorElement && chosen.length) setColorElement((chosen.find((e) => e.symbol === "Au") || chosen[0]).symbol);
    const more = (list, k) => list.slice(0, k).map((h) => h.hole_id).join(", ") + (list.length > k ? ", …" : "");
    const extra = [
      converted.length ? tr("Converted {list} to match the unit already used in this project.", { list: converted.map((e) => `${e.symbol} ${e.unit} → ${existingUnit[e.symbol]}`).join(", ") }) : null,
      negBdl ? tr("{n} negative value(s) read as below detection (e.g. -0.005 → \"<0.005\", stored at half).", { n: negBdl }) : null,
      negMissing ? tr("{n} negative value(s) treated as not assayed.", { n: negMissing }) : null,
      zeroBdl ? tr("{n} zero value(s) read as below detection (stored as \"<\" at half the smallest reading in their column).", { n: zeroBdl }) : null, // #1677
      zeroNoLimit ? tr("{n} zero value(s) left out: their column has no reading above zero to set a detection limit.", { n: zeroNoLimit }) : null,
      negOver ? tr("{n} negative value(s) read as over the upper limit (e.g. -10 → \">10\", stored at the limit).", { n: negOver }) : null, // #1648
      repeatsKept.size ? tr("{n} lab repeat(s) kept as QC duplicates of their samples ({list}): QAQC > Duplicates pairs them.", { n: [...repeatsKept.values()].reduce((a, b) => a + b, 0).toLocaleString(), list: [...repeatsKept].map(([h, k]) => `${h} ${k}`).join(", ") }) : null, // #2194
      textCodes.bdl ? tr("{n} cell(s) written as below detection (\"<LOD\", BDL, ND...) read at half their column's detection limit.", { n: textCodes.bdl.toLocaleString() }) : null, // #2158
      textCodes.nodl ? tr("{n} cell(s) written as below detection left blank: their column ({list}) states no detection limit to use.", { n: textCodes.nodl.toLocaleString(), list: [...textCodes.nodlCols].join(", ") }) : null,
      textCodes.na ? tr("{n} cell(s) marked not assayed (NULL, X, N/A, NS, -...) left blank.", { n: textCodes.na.toLocaleString() }) : null,
      mergedCount ? tr("{n} interval(s) were already loaded and were updated in place, not duplicated.", { n: mergedCount }) : null,
      (() => { // #541 — ids that miss a collar only by case / spaces / hyphens
        const ids = new Set(collars.map((c) => c.hole_id)); if (!ids.size) return null;
        const near = new Map(); rows.forEach((r) => { if (ids.has(r.hole_id) || near.has(r.hole_id)) return; const m = /Did you mean "([^"]+)"/.exec(didYouMean(ids, r.hole_id)); if (m) near.set(r.hole_id, m[1]); });
        return near.size ? tr("{n} hole id(s) match a collar only if case / spaces / hyphens are ignored ({examples}) — kept as typed; fix them in the file to attach these assays.", { n: near.size, examples: [...near].slice(0, 4).map(([x, y]) => `"${x}" → "${y}"`).join(", ") }) : null;
      })(),
      replaceHoles.length ? tr("Replaced the assays of {n} hole(s) whose sample intervals changed ({holes}).", { n: replaceHoles.length, holes: more(replaceHoles, 6) }) : null, // #530
      changed.length && !replaceHoles.length ? tr("{n} hole(s) kept their old intervals beside this file's different ones ({holes}) — Data QC lists the overlaps.", { n: changed.length, holes: more(changed, 6) }) : null, // #530
      skippedNoDepth ? tr("{n} row(s) skipped: no hole id, or a blank / non-numeric from or to depth.", { n: skippedNoDepth }) : null, // #508
      qcNoDepth.standard + qcNoDepth.blank + qcNoDepth.duplicate ? tr("{n} QC insert(s) without depths kept for QAQC ({s} standard(s), {b} blank(s), {d} duplicate(s)).", { n: qcNoDepth.standard + qcNoDepth.blank + qcNoDepth.duplicate, s: qcNoDepth.standard, b: qcNoDepth.blank, d: qcNoDepth.duplicate }) : null, // #1661
      overLimitFilled.size ? tr("Over-limit samples filled from the ore-grade column: {list}.", { list: [...overLimitFilled].map(([sym, n]) => { const e = chosen.find((x) => x.symbol === sym); return tr("{symbol} {n} (at {limit} {unit} in \"{header}\", from \"{source}\")", { symbol: sym, n, limit: e.overLimit.limit, unit: e.unit, header: e.header, source: e.overLimit.header }); }).join("; ") }) : null, // #600 / #542
      flagged.size ? tr("Qualifiers from the flag columns: {list} (the values kept as the file has them).", { list: [...flagged].map(([sym, f]) => [f.lo ? tr("{symbol} {n} below detection", { symbol: sym, n: f.lo.toLocaleString() }) : null, f.hi ? tr("{symbol} {n} over range", { symbol: sym, n: f.hi.toLocaleString() }) : null].filter(Boolean).join(", ")).join("; ") }) : null, // #2018
      blankBdl.size ? tr("Empty cells read as below detection: {list}; stored at half the limit and flagged '<'.", { list: [...blankBdl].map(([sym, n]) => { const L = blankLimits.get(sym); return tr(L.basis === "lt" ? "{symbol} {n} at <{limit} (the lab's most common '<' limit in the file)" : "{symbol} {n} at <{limit} (the lowest value reported — no '<' limit in the file)", { symbol: sym, n, limit: L.limit }); }).join("; ") }) : null, // #502
      blankNoLimit.size ? tr("No detection limit could be found for {list} (no '<' values and no reported values), so their empty cells stay not assayed.", { list: [...blankNoLimit].join(", ") }) : null,
      // #510 — same-interval rows in ONE file are kept, not merged: usually field / lab duplicates
      repeatedInFile ? tr("{n} interval(s) appear more than once in this file (often field or lab duplicates) — all kept as separate rows; Data QC and Best Intercepts flag them as overlaps.", { n: repeatedInFile }) : null,
      oxideNotes.size ? tr("Whole-rock oxide columns stored as element wt% ({list}); diagrams convert back to oxides.", { list: [...oxideNotes].join(", ") }) : null,
    ].filter(Boolean).join(" ");
    import("../lib/dataQC.js").then(({ importCheckSummary }) => { const msg = importCheckSummary(rows, collars, store.survey, tr("assay rows")); if (msg) setNotices((p) => [...p, msg]); }).catch(() => {}); // TASKS.csv #1268
    setNotices((p) => [...p, notice("Loaded {rows} {v} intervals ({chosen} elements).{v2}", { rows: rows.length, v: modal.isPxrf ? tr("pXRF") : tr("assay"), chosen: chosen.length, v2: extra ? " " + extra : "" })]);
    setAssayModal(null);
  };

  // TASKS.csv #228 — surface geochemistry (soil/rock-chip/stream-sediment/talus-fines) import. Reuses
  // the exact same isElementColumn/inferUnit dedupe-by-symbol logic the wide-format assay path above
  // already uses (see that branch's own TASKS.csv #210 comment for why the dedupe matters) — surface
  // sample lab exports have the same "more than one candidate column per element" problem.
  const handleSurfaceFile = (file) => {
    readSampleTable(file).catch((e) => { setNotices((p) => [...p, errorNotice(tr("{name}: {error}", { name: file.name, error: e?.message || String(e) }))]); return null; }).then((t) => { // #2016
        if (!t) return; // TASKS.csv #444 — shared reader: comma decimals + encoding fallback; #611 big files held as columns
        const note = t.note ? ` ${t.note.trim()}` : ""; // TASKS.csv #284
        if (!t.rows.length) { setNotices((p) => [...p, errorNotice(tr("{name}: empty file.", { name: file.name }))]); return; }
        if (note) setNotices((p) => [...p, `${file.name}:${note}`]);
        openSurfaceRows(file, t.headers, t.rows); // #611 — a columnar row has no own keys: the headers come from the reader
    });
  };
  // TASKS.csv #1670 (review #1646, Kodiak) — the second workbook of a soil program (field data + lab assays): its columns are added to these
  // rows by sample ID, then the dialog is read again (elements, columns) keeping what was already chosen in it
  const joinSurfaceFile = (file) => {
    const m = surfaceModal;
    if (!m) return;
    const warn = (text) => setSurfaceModal((p) => p && { ...p, joinNote: { warn: true, text } });
    if (!m.mapping.sample_id) { warn(tr("Map the Sample ID column first: the other file's rows are matched to these by it.")); return; }
    parseTableOrWorkbook(file, elementScore, { columnar: true }).then((t) => {
      const aid = guessColumn(t.headers, SURFACE_ID_ALIASES);
      if (!t.rows.length || !aid) { warn(tr("{name} has no sample ID column (sample_id, samp_num, sample number…), so its rows cannot be matched to these.", { name: file.name })); return; }
      const j = joinBySampleId({ headers: m.headers, rows: m.allRows, idCol: m.mapping.sample_id }, { headers: t.headers, rows: t.rows, idCol: aid });
      const text = [
        tr("{name}: {added} column(s) added by sample ID (\"{a}\" = \"{b}\"); {matched} of {rows} samples matched.", { name: file.name, added: j.added.length, a: aid, b: m.mapping.sample_id, matched: j.matched.toLocaleString(), rows: m.allRows.length.toLocaleString() }),
        j.addOnly ? tr("{n} of its sample IDs are not in this file and were left out.", { n: j.addOnly.toLocaleString() }) : "",
        j.filled ? tr("{n} blank cell(s) of the columns both files have were filled from it.", { n: j.filled.toLocaleString() }) : "",
        j.addDuplicates ? tr("{n} sample ID(s) appear more than once in it: the first row of each was used.", { n: j.addDuplicates.toLocaleString() }) : "",
      ].filter(Boolean).join(" ");
      openSurfaceRows(m.file, j.headers, j.rows, { prev: m, joinNote: { warn: j.matched === 0, text } });
    }).catch((e) => warn(tr("{name} could not be read: {error}", { name: file.name, error: e?.message || String(e) })));
  };
  // the surface-sample import dialog for a table already read: from a file, or rows from a database (#975)
  const openSurfaceRows = (file, headers, data, keep = null) => { // keep: #1670 — { prev: the dialog before a join, joinNote }
        // TASKS.csv #600 (40958Z) — the shared matcher + MX-style names: e_utm / n_utm, elev_m, samp_num, samp_type
        const guess = (aliases) => guessColumn(headers, aliases);
        const mapping = {
          x: guess(SURFACE_XY_ALIASES.x),
          y: guess(SURFACE_XY_ALIASES.y),
          z: guess(["z", "elevation", "elev", "elev_m", "rl", "elev_dem_m"]),
          sample_id: guess(SURFACE_ID_ALIASES), // #1670: shared with the join below
          medium: guess(["medium", "sample_medium", "samp_type", "sample_type", "smpl_medium", "type"]),
          qcType: guess(["qc_type", "qctype", "qaqc_type", "qaqc", "sample_class", "qc_code_type", "control_type"]), // TASKS.csv #1794
        };
        // TASKS.csv #1794 (review #1646, Kodiak) — a guessed medium column that holds QC labels (REG / DUP / Control) is the QC type
        if (mapping.medium && looksLikeQcTypeColumn(data.map((r) => r[mapping.medium]), surfaceMediumOf)) { if (!mapping.qcType) mapping.qcType = mapping.medium; mapping.medium = ""; }
        // Bug found live-testing this feature: a bare "y" (northing) header false-positives against
        // isElementColumn as the element symbol Y (yttrium) — same first-token match logic that
        // correctly handles "Ag_XRF_..." also matches a coordinate column that just happens to BE an
        // element symbol. x/y/z/sample_id/medium are excluded from element detection since whichever
        // columns they resolved to are already spoken for by the mapping above, never a real analyte.
        const llCols = !mapping.x && !mapping.y ? lonLatColumns(headers, data) : null; // #1149 — not elements either
        const mappedCols = new Set([...Object.values(mapping).filter(Boolean), ...(llCols ? [llCols.x, llCols.y] : [])]);
        // TASKS.csv #600 — the same column choice as drillhole assays (pickElementColumns): the most complete
        // numeric column per element, over-limit column paired, descriptive columns skipped. The old
        // first-match dedupe took "au_cert_num" (a certificate number) as Au and "v_datum" as vanadium in an
        // MX soil export (ARIS 42648Z).
        const elements = pickElementColumns(headers.filter((h) => !mappedCols.has(h)), data).map((e) => ({ ...e, mainHeader: e.header, checked: e.n > 0 })); // #1389 — a column with no value in any row stays unticked
        // TASKS.csv #600 — a CRS tag column (srid_source / epsg...) with one recognised code pre-fills the Source CRS.
        const crsCol = headers.find((h) => /^(srid(_source)?|source_srid|epsg(_srid)?|source_epsg|crs_epsg)$/i.test(h.trim()));
        const codes = crsCol ? [...new Set(data.map((r) => Number(r[crsCol])).filter((v) => Number.isInteger(v) && v > 0))] : [];
        let sourceEpsg = codes.length === 1 && crsName(codes[0]) ? String(codes[0]) : "";
        let sourceEpsgFrom = sourceEpsg ? crsCol : null;
        const fileEpsg = file?.parsedTable?.sourceEpsg; // #2016 — a shapefile's .prj / a GeoPackage's SRS
        if (!sourceEpsg && fileEpsg && crsName(fileEpsg)) { sourceEpsg = String(fileEpsg); sourceEpsgFrom = OWN_CRS; }
        // TASKS.csv #1149 — no easting / northing, but longitude / latitude columns: mapped, and in WGS 84 unless a CRS column says otherwise
        const ll = !mapping.x && !mapping.y ? lonLatColumns(headers, data) : null;
        if (ll) { mapping.x = ll.x; mapping.y = ll.y; if (!sourceEpsg) { sourceEpsg = "4326"; sourceEpsgFrom = `${ll.x} / ${ll.y}`; } }
        const prev = keep?.prev; // #1670 — after a join: the choices already made in the dialog stand
        setSurfaceModal(prev ? {
          ...prev, headers, allRows: data,
          mapping: { ...mapping, ...Object.fromEntries(Object.entries(prev.mapping).filter(([, v]) => v)) },
          sourceEpsg: prev.sourceEpsg || sourceEpsg, sourceEpsgFrom: prev.sourceEpsg ? prev.sourceEpsgFrom : sourceEpsgFrom,
          elements: [...elements.map((e) => { const o = prev.elements.find((x) => x.symbol === e.symbol); return o ? { ...e, checked: o.checked, unit: o.unit, header: headers.includes(o.header) ? o.header : e.header } : e; }),
            ...prev.elements.filter((o) => !elements.some((e) => e.symbol === o.symbol))],
          joinNote: keep.joinNote,
        } : {
          file, fileName: file.name, headers, allRows: data,
          mapping, sourceEpsg, sourceEpsgFrom,
          defaultMedium: "soil", elements,
        });
  };

  // TASKS.csv #846 — a public survey's samples for the area (PublicGeochemModal), into the normal surface-sample import:
  // lon / lat (WGS 84; NAD83 / GDA94 differ by about a metre) with the columns already mapped
  const openPublicImport = ({ headers, rows, entry, notes, checked }) => {
    const mapping = { x: "longitude", y: "latitude", z: rows.some((r) => String(r.elevation ?? "").trim() !== "") ? "elevation" : null, sample_id: "sample_id", medium: "medium" };
    const mapped = new Set(["longitude", "latitude", "elevation", "sample_id", "medium"]);
    const elements = pickElementColumns(headers.filter((h) => !mapped.has(h)), rows).map((e) => ({ ...e, mainHeader: e.header, checked: e.n > 0 })); // #1389 — a column with no value in any row stays unticked
    // a survey's other analyses of an element (Cu by AAS and by ICP-MS) are not sample attributes: only the chosen column is read
    const attrExclude = headers.filter((h) => !mapped.has(h) && isElementColumn(h));
    setPublicOpen(false);
    setSurfaceModal({
      file: null, fileName: entry.name, headers, allRows: rows, mapping, sourceEpsg: entry.sourceEpsg || "4326", sourceEpsgFrom: null, // NURE: NAD27 (#905)
      defaultMedium: "stream sediment", elements, attrExclude,
      publicNote: [tr("Source: {agency}, {name}, under the {licence}. {attribution}", { agency: entry.agency, name: entry.name, licence: entry.licence, attribution: entry.attribution }), ...(checked ? [tr("Catalogue entry last checked {date}.", { date: checked })] : []), ...notes].join(" "), // TASKS.csv #930
    });
  };

  const commitSurfaceImport = async (modal) => {
    const { allRows, mapping, elements, defaultMedium } = modal;
    const chosen = elements.filter((e) => e.checked);
    if (!mapping.x || !mapping.y) { setNotices((p) => [...p, errorNotice(tr("Map the X and Y columns."))]); return; }
    // TASKS.csv #606 — Z is optional: a blank z, or a Z column that is 0 on every row (an MX soil export whose
    // elevation was never filled in), is MISSING, not sea level; the 3D view places those samples on the terrain.
    // #1394 — and a 0 among real elevations well above sea level is missing too (zeroMeansMissing)
    const zeroMissing = !!mapping.z && zeroMeansMissing(allRows.map((r) => num(r[mapping.z])));
    const zOf = (r) => { if (!mapping.z) return null; const v = num(r[mapping.z]); return Number.isFinite(v) && !(v === 0 && zeroMissing) ? v : null; };
    const mediaSet = new Set(SURFACE_MEDIA);
    // TASKS.csv #600 (40958Z) — the words exports use for a medium: an MX rock file says "rock", which used to
    // fall back to the default ("soil"), so every rock sample was labelled soil
    // TASKS.csv #845 — the stream media apart: moss mat, heavy-mineral concentrate, BLEG and water are not active sediment
    const mediumAlias = (m) => (/rock|grab|chip|outcrop|float|channel/.test(m) ? "rock chip" : /moss/.test(m) ? "moss mat" : /\bhmc\b|heavy.?min|concentrate|\bpan\b/.test(m) ? "heavy mineral concentrate" : /bleg|bulk.?leach/.test(m) ? "BLEG" : /water/.test(m) ? "stream water" : /stream|silt|sediment|\bsed\b/.test(m) ? "stream sediment" : /talus/.test(m) ? "talus fines" : /soil|b.?horizon/.test(m) ? "soil" : null);
    // TASKS.csv #333/#334 — same rules as drillhole assays: negative codes are never grades (-0.005 read as
    // below detection, <= -99 as not assayed), and an element already in the project keeps its unit.
    const existingUnit = Object.fromEntries(surfaceElements.map((e) => [e.symbol, e.unit]));
    const converted = chosen.filter((e) => existingUnit[e.symbol] && existingUnit[e.symbol] !== e.unit);
    let negBdl = 0, negMissing = 0;
    const overLimitFilled = new Map(); // #600 — as in commitAssayImport
    const svDlCache = new Map(); // #2158 — each column's detection limit, for '<LOD' / BDL and the -1 / -9 codes
    const svDlOf = (h) => { let d = svDlCache.get(h); if (d === undefined) { d = columnDetectionLimit((modal.allRows || []).map((x) => x[h])); svDlCache.set(h, d); } return d; };
    // TASKS.csv #600 — surface samples in another CRS are reprojected into the project CRS like collars are
    // (they used to be stored as-is, so an MX soil file in UTM 10 sat ~400 km from collars reprojected to UTM 9).
    const fromEpsg = modal.sourceEpsg ? Number(modal.sourceEpsg) : null;
    let toEpsg = project?.epsg ? Number(project.epsg) : null;
    // #1148 — where the rows are, in case they are in latitude / longitude: the metric CRS for that place is offered, not degrees
    const rowAt = allRows.map((r) => ({ lon: num(r[mapping.x]), lat: num(r[mapping.y]) })).find((q) => Number.isFinite(q.lon) && Number.isFinite(q.lat) && Math.abs(q.lon) <= 180 && Math.abs(q.lat) <= 90) || null;
    // TASKS.csv #1445 (review #1352) — the dialog says 'GeoStrix asks on import' when the project CRS was never chosen, and nothing asked:
    // rocks.csv came in with the project still 'CRS: not set'. Now it asks, as a collar import does, showing where the samples would land
    // (projected coordinates; latitude / longitude goes through the adopt step below, #1148). 'Decide later' imports them as before.
    if (project?.crsSet === false && !project?.localGrid /* #2180 */ && !fromEpsg && !rowAt) {
      const pts = allRows.slice(0, 2000).map((r) => ({ x: num(r[mapping.x]), y: num(r[mapping.y]) })).filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
      const picked = await requestProjectCrs(tr("These samples' coordinates need the project's coordinate system: choose the one they are in."), pts);
      if (picked) toEpsg = Number(picked);
    }
    const adopted = askAdoptCrs({ isEmpty: projectIsEmpty, currentEpsg: toEpsg, declaredEpsg: fromEpsg, fileName: modal.fileName, at: rowAt }); // #607
    if (adopted) { setEpsg(adopted); toEpsg = adopted; setNotices((p) => [...p, notice("Project CRS set to {v} (EPSG:{adopted}) from {fileName}.", { v: crsName(adopted), adopted, fileName: modal.fileName })]); }
    // TASKS.csv #2320 — a local-grid project: samples in a CRS come into the grid through its tie; with no tie their numbers are kept
    const gridTie = tieOf(project), localNoTie = project?.crsSet === false && project?.localGrid && !gridTie;
    const doReproject = !localNoTie && fromEpsg && toEpsg && fromEpsg !== toEpsg;
    let reprojectFailed = 0;
    const allHeaders = modal.headers || Object.keys(allRows[0] || {});
    // TASKS.csv #842 — a parent / original-sample column pairs a field duplicate with its original
    const parentCol = allHeaders.find((h) => /^(parent|orig(inal)?)[\s_-]*(sample)?[\s_-]*(id|no|number|#)?$|^dup(licate)?[\s_-]*of$/i.test(String(h).trim())) || null;
    const attrCols = surfaceAttrColumns(allHeaders, allRows, { ...mapping, parent: parentCol }, elements).filter((h) => !modal.attrExclude?.includes(h)); // TASKS.csv #841; attrExclude: #846
    const qcRecords = []; // TASKS.csv #842 — rows the sample-type column marks as standard / blank / duplicate
    const flagCols = flagColumns(allHeaders, chosen), flaggedLo = new Map(); // TASKS.csv #2018 — '<el>_flag' = LDL: below detection
    const mappedRows = allRows.map((r) => {
      const values = {};
      const bdl = []; // TASKS.csv #841 — elements reported below detection (stored at half the limit), for the censored share
      const nd = []; // TASKS.csv #931 — elements a public layer reported as 0 (below detection or not analysed: it does not say), no value
      chosen.forEach((e) => {
        const c = readAssayCell(r[e.header], "bdl", 0, svDlOf(e.header)); // svDlOf: #2158
        if (c.qualifier === "<") bdl.push(e.symbol);
        else if (c.value != null && !c.qualifier && flagCols.has(e.symbol) && flagQualifier(r[flagCols.get(e.symbol)]) === "<") { bdl.push(e.symbol); flaggedLo.set(e.symbol, (flaggedLo.get(e.symbol) || 0) + 1); } // #2018
        if (c.value == null && r.zeroReported?.includes(e.header)) nd.push(e.symbol);
        if (c.kind === "neg_bdl") negBdl++; else if (c.kind === "neg_missing") negMissing++;
        const ox = oxideOfHeader(e.header); // TASKS.csv #403
        let v = convertUnit(fromOxideHeader(c.value, e.header), ox ? oxideUnit(e.header) : e.unit, existingUnit[e.symbol] || (ox ? oxideUnit(e.header) : e.unit)); // oxideUnit: #2157
        const ol = e.overLimit && e.header === e.mainHeader ? e.overLimit : null;
        if (ol && parseAssayValue(r[e.header]) === ol.limit) {
          const og = parseAssayValue(r[ol.header]);
          if (og != null && Number.isFinite(og)) { v = convertUnit(og, ol.unit, existingUnit[e.symbol] || e.unit); overLimitFilled.set(e.symbol, (overLimitFilled.get(e.symbol) || 0) + 1); }
        }
        if (v != null) values[e.symbol] = v;
      });
      const rawMedium = mapping.medium ? String(r[mapping.medium] ?? "").trim().toLowerCase() : "";
      const qcCol = mapping.qcType || mapping.medium; // #1794 — the QC-type column when there is one, else the medium column as before
      if (qcCol) { // TASKS.csv #842 — QC inserts are not samples: kept for QA/QC, with or without coordinates
        const rec = qcRecordFromFileRow({ sample_id: mapping.sample_id ? String(r[mapping.sample_id] ?? "").trim() : "", type: String(r[qcCol] ?? "").trim(), values, bdl, parent_id: parentCol ? String(r[parentCol] ?? "").trim() || null : null, ...surfaceAttrs(r, attrCols) });
        if (rec) { rec.batch = rec.attrs?.[Object.keys(rec.attrs || {}).find((k) => /cert|batch|job|work\s*order/i.test(k))] ?? null; qcRecords.push(rec); return null; }
      }
      let x = num(r[mapping.x]), y = num(r[mapping.y]);
      if (doReproject && Number.isFinite(x) && Number.isFinite(y)) {
        const p = gridTie ? fileToLocal(gridTie, x, y, fromEpsg) : reprojectXY(x, y, fromEpsg, toEpsg); // gridTie: #2320
        if (p) ({ x, y } = p); else { reprojectFailed++; x = NaN; }
      }
      return {
        sample_id: mapping.sample_id ? String(r[mapping.sample_id] ?? "").trim() : "",
        x, y, z: zOf(r), // #508 / #606 — a blank (or all-zero) z is missing, not sea level
        medium: mediaSet.has(rawMedium) ? rawMedium : (mediumAlias(rawMedium) || defaultMedium), // #600: "rock" -> rock chip
        values,
        ...(bdl.length ? { bdl } : {}),
        ...(nd.length ? { nd } : {}),
        ...surfaceAttrs(r, attrCols),
      };
    });
    // TASKS.csv #1664 (review #1646, Kodiak) — a sample row with no coordinates was dropped with no word (181 Kodiak control rows vanished
    // before #1794 classed them as QC): every one left out is counted in the notice (a reprojection failure is counted on its own)
    let rows = mappedRows.filter((r) => r && Number.isFinite(r.x) && Number.isFinite(r.y));
    // TASKS.csv #2085 — sample ids already in the project under another medium at the same place: update them, or add them anyway, asked
    let twinNote = "";
    const twins = otherMediumTwins(surfaceSamples, rows);
    if (twins.n) {
      const had = Object.entries(twins.media).map(([m, k]) => `${m} ${k}`).join(", ");
      const newMedia = [...new Set([...twins.existing.keys()].map((r) => r.medium))].join(", ");
      if (window.confirm(tr("{n} of these sample ids are already in the project at the same positions (within 1 m), as {had}; this import would add them as {media}.", { n: twins.n, had, media: newMedia }) + "\n\n" + tr("OK — update those samples (they keep their medium).") + "\n" + tr("Cancel — choose whether to add them as new samples."))) {
        rows = rows.map((r) => (twins.existing.has(r) ? { ...r, medium: twins.existing.get(r) } : r));
        twinNote = tr("{n} sample id(s) matched samples already in the project as {had} at the same positions: those were updated, keeping their medium.", { n: twins.n, had });
      } else if (window.confirm(tr("Add the {n} sample(s) as {media} anyway? They sit on samples already in the project ({had}). Cancel stops the import.", { n: twins.n, media: newMedia, had }))) {
        twinNote = tr("{n} sample(s) were added as {media} at the positions of samples already in the project as {had}.", { n: twins.n, media: newMedia, had });
      } else { setNotices((p) => [...p, notice("Surface sample import cancelled: nothing was added.")]); return; }
    }
    const noXY = mappedRows.filter((r) => r && !(Number.isFinite(r.x) && Number.isFinite(r.y))).length - reprojectFailed;
    const noZ = rows.filter((r) => r.z == null).length;
    // TASKS.csv #842; #1794 — merged by kind and sample id: a re-import replaces the QC records it already brought instead of doubling them
    const qcMerge = qcRecords.length ? mergeQcRecords(surfaceQc?.records || [], qcRecords) : null;
    if (qcMerge) setSurfaceQc((prev) => ({ ...(prev || emptySurfaceQc()), records: mergeQcRecords(prev?.records || [], qcRecords).records }));
    // TASKS.csv #954 — merged by (sample_id, medium) onto the samples already loaded, not appended. Computed from the
    // current samples (not inside the setter) so the notice can say how many were updated.
    const merged = mergeSurfaceSamples(surfaceSamples, rows);
    setSurfaceSamples(merged.samples);
    setSurfaceElements((prev) => { const merged = new Map(prev.map((e) => [e.symbol, e])); chosen.forEach((e) => { if (!merged.has(e.symbol)) merged.set(e.symbol, oxideOfHeader(e.header) ? { ...e, unit: oxideUnit(e.header) } : e); }); return Array.from(merged.values()); }); // #403; oxideUnit: #2157
    const extra = [
      modal.publicNote || null, // TASKS.csv #846
      twinNote || null, // #2085
      qcMerge?.replaced ? tr("{n} QC insert(s) were already held from an earlier import and were updated, not added again.", { n: qcMerge.replaced }) : null, // #1794
      merged.updated ? tr("{updated} of them matched samples already in the project by sample id and medium and updated them ({added} added).", { updated: merged.updated, added: merged.added }) : null, // #954
      converted.length ? `Converted ${converted.map((e) => `${e.symbol} ${e.unit} → ${existingUnit[e.symbol]}`).join(", ")} to match the unit already used in this project.` : null,
      negBdl ? `${negBdl} negative value(s) read as below detection.` : null,
      negMissing ? `${negMissing} value(s) ≤ -99 treated as not assayed (no-data codes).` : null,
      flaggedLo.size ? tr("Below detection from the flag columns: {list} (the values kept as the file has them).", { list: [...flaggedLo].map(([sym, n]) => `${sym} ${n.toLocaleString()}`).join(", ") }) : null, // #2018
      overLimitFilled.size ? `Over-limit samples filled from the ore-grade column: ${[...overLimitFilled].map(([sym, n]) => `${sym} ${n}`).join(", ")}.` : null,
      qcRecords.length ? `${qcRecords.length} QC insert(s) (${["standard", "blank", "duplicate"].map((k) => `${qcRecords.filter((q) => q.kind === k).length} ${k}`).join(", ")}) kept apart for Surface QA/QC, not as samples.` : null,
      noXY > 0 ? tr("{n} row(s) with no easting / northing were left out (not QC inserts: their type was not standard, blank or duplicate).", { n: noXY }) : null, // #1664
      noZ ? `${noZ} sample(s) have no elevation${zeroMissing ? ` (a 0 in the "${mapping.z}" column is read as no elevation)` : ""} — ${store.terrain ? "the 3D view places them on the terrain" : "with no terrain the 3D view draws them flat (at the highest collar on a project drilled from underground, else the median collar) until a terrain is loaded"}.` : null, // no terrain: #2264
      doReproject ? `Reprojected from EPSG:${fromEpsg} to the project's EPSG:${toEpsg}${reprojectFailed ? ` (${reprojectFailed} row(s) could not be converted and were skipped)` : ""}.` : null,
    ].filter(Boolean).join(" ");
    setNotices((p) => [...p, notice("Loaded {rows} surface samples ({chosen} elements). Switch to 3D View to see them.{v}", { rows: rows.length, chosen: chosen.length, v: extra ? " " + extra : "" })]);
    setSurfaceModal(null);
  };

  // TASKS.csv #78 — drag-and-drop as a consistent import method across all data types. Geochem was
  // the one importer left button-only (ViewerModule's CSV importer and GeophysicsModule's CSV/GeoTIFF/
  // GXF importer both already support it) — same file/name-heuristic pattern as GeophysicsModule's
  // dem/srtm/elev heuristic for choosing terrain vs raster drape: a dropped filename containing
  // "pxrf" or "xrf" goes to the pXRF path, everything else defaults to the assay path (matching the
  // button layout's own ordering — "Import assays" is the primary action, pXRF is the secondary one).
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    // #2016 — a sample shapefile (with its .dbf / .prj / .cpg), GeoPackage or KML too
    const files = SHP_GROUP(Array.from(e.dataTransfer.files || [])).filter((f) => f.name.toLowerCase().endsWith(".csv") || isXlsxName(f.name) || VECTOR_FILE.test(f.name)); // #605
    const skipped = e.dataTransfer.files.length - files.length;
    if (!files.length) { setNotices((p) => [...p, errorNotice(tr("Only .csv, .xlsx, shapefile (.shp / .zip), GeoPackage or KML files can be dropped in directly."))]); return; }
    if (skipped) setNotices((p) => [...p, notice("{skipped} other file(s) skipped.", { skipped })]);
    enqueueAssayFiles(files); // #1652 — one after another (several at once all opened the one dialog)
  };

  const runMethod = (methodKey, altSetup = null) => {
    const method = GEOCHEM_METHODS[methodKey];
    const missing = method.requires.filter((s) => !availableSymbols.has(s));
    if (missing.length) { setNotices((p) => [...p, errorNotice(tr("{label}: missing {missing}.", { label: tr(method.label), missing: missing.join(", ") }))]); return; }
    // TASKS.csv #503 — the box plot needs its protolith set-up first (dialog), then classifies per sample
    if (methodKey === "alteration_boxplot" && !altSetup) { setAltBoxOpen(true); return; }
    const targetKey = method.target === "litho" ? "litho_gc" : "alt_gc";
    // TASKS.csv #1380 — replacing a geochem layer asks first (Winchester silently replaced Jensen's)
    if ((layers[targetKey] || []).length && !window.confirm(tr("Replace the {n} intervals already in the {v} layer?", { n: layers[targetKey].length, v: method.target === "litho" ? tr("Lithology (geochem)") : tr("Alteration (geochem)") }))) return;
    let lithoByHole = null, noProtolith = 0;
    const sedSkipped = {}; // #1380 — logged code -> samples left out of a volcanic classifier
    if ((altSetup && altSetup.source === "logged") || method.volcanicOnly) {
      lithoByHole = new Map();
      (layers.litho || []).forEach((r) => { if (!lithoByHole.has(r.hole_id)) lithoByHole.set(r.hole_id, []); lithoByHole.get(r.hole_id).push(r); });
    }
    const counts = {};
    const labAll = labAssays(assays), pxrfLeft = assays.length - labAll.length; // #1673 — a classification layer from lab assays only
    const labRows = labAll.filter((a) => classifyQAQCRow(a) === "regular"), qcLeft = labAll.length - labRows.length; // #2027 — a standard or a blank is not a rock to classify (it made zero-length intervals on real holes)
    // TASKS.csv #2028 — 'box from my least-altered samples': fitted to the AI / CCPI of the samples whose logged alteration is one of the codes chosen
    let fitted = null;
    // the logged alteration by hole: the fitted box (#2028) and the AI-up trend's name (#2145) read it
    const altByHole = new Map();
    if (altSetup) (layers.alt || []).forEach((r) => { if (!altByHole.has(r.hole_id)) altByHole.set(r.hole_id, []); altByHole.get(r.hole_id).push(r); });
    const trendRoles = altSetup?.trendRoles && Object.values(altSetup.trendRoles).some(Boolean) ? altSetup.trendRoles : null;
    const trendBasis = { log: 0, chem: 0 }; // #2145 — how each AI-up sample was named
    if (altSetup?.source === FITTED_PROTOLITH) {
      const codes = new Set(altSetup.fitCodes || []);
      const pts = labRows.filter((a) => codes.has(loggedCodeAt(a, altByHole))).map((a) => { const q = DIAGRAMS.boxplot.project(a, elementUnits); return q ? { ai: q.y, ccpi: q.x } : null; }).filter(Boolean);
      fitted = fitLeastAlteredBox(pts);
      if (!fitted) { setNotices((p) => [...p, errorNotice(tr("Only {n} lab sample(s) with Na, K, Mg, Ca and Fe lie in the alteration logged {codes}: a least-altered box needs at least 5. Choose more codes, or a protolith.", { n: pts.length, codes: [...codes].join(", ") || "—" }))]); return; }
    }
    const rows = labRows.map((a) => {
      let opts;
      if (altSetup && fitted) opts = { protolith: FITTED_PROTOLITH, boxes: { ...altSetup.boxes, [FITTED_PROTOLITH]: fitted } }; // #2028
      else if (altSetup) {
        const protolith = protolithForSample(a, { fixed: altSetup.source === "logged" ? null : altSetup.source, lithoByHole, map: altSetup.map });
        if (!protolith) { noProtolith++; return null; }
        opts = { protolith, boxes: altSetup.boxes };
      }
      if (method.volcanicOnly) { const code = loggedCodeAt(a, lithoByHole); if (isSedimentaryCode(code)) { sedSkipped[code] = (sedSkipped[code] || 0) + 1; return null; } }
      let value = method.classify(a.values, elementUnits, a, opts);
      if (!value) return null;
      if (value === "SER" && altSetup) { value = nameAiUpTrend(value, trendRoles ? loggedCodeAt(a, altByHole) : null, trendRoles); trendBasis[value === "SER" ? "chem" : "log"]++; } // #2145
      counts[value] = (counts[value] || 0) + 1;
      return { hole_id: a.hole_id, from: a.from, to: a.to, value };
    }).filter(Boolean);
    const runs = mergeClassRuns(rows); // #1513 — touching samples of one class: one interval
    if (pxrfLeft) setNotices((p) => [...p, notice("{n} pXRF reading(s) were left out of the classification: it uses lab assays only.", { n: pxrfLeft })]); // #1673
    if (qcLeft) setNotices((p) => [...p, notice("{n} QC insert(s) (standards, blanks, duplicates) were left out of the classification: they are not rock samples.", { n: qcLeft })]); // #2027
    replaceLayer(targetKey, runs);
    // #1393 — with no class counted, ' {v}.' left a lone '.' ("layer. . 1339 sample(s) not classified")
    const countList = Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${GEOCHEM_LABELS[k] || k} ${n}`).join(", ");
    const detail = altSetup ? tr(countList ? " {v}.{v2}{v3} Screening level: protolith assumed." : "{v2}{v3} Screening level: protolith assumed.", { v: countList, v2: noProtolith ? tr(" {noProtolith} sample(s) not classified: no protolith (unmapped lithology code or no logged interval).", { noProtolith }) : "", v3: JSON.stringify(altSetup.boxes) === JSON.stringify(PROVISIONAL_ALTERATION_BOXES) ? tr(" Box limits are the PROVISIONAL defaults (not yet checked against Large et al. 2001).") : tr(" Box limits: your edited values.") }) : "";
    const fitText = fitted ? tr(" Least-altered box fitted to the {n} samples logged {codes}: AI {a0}–{a1}, CCPI {c0}–{c1} (5th to 95th percentile).", { n: fitted.n, codes: (altSetup.fitCodes || []).join(", "), a0: fitted.ai[0], a1: fitted.ai[1], c0: fitted.ccpi[0], c1: fitted.ccpi[1] }) : ""; // #2028
    const trendText = trendBasis.log + trendBasis.chem ? (trendBasis.log ? tr(" AI-up trend: {log} sample(s) named potassic or phyllic from the logged alteration, {chem} by geochemistry only (joint name; the Molar K/Al vs Na/Al diagram separates them).", trendBasis) : tr(" AI-up trend: all {chem} sample(s) by geochemistry only (joint name; no logged code is marked potassic or phyllic; the Molar K/Al vs Na/Al diagram separates them).", trendBasis)) : ""; // #2145
    const sedN = Object.values(sedSkipped).reduce((s, n) => s + n, 0);
    const sedText = sedN ? tr(" {n} sample(s) in logged sedimentary or carbonate codes ({codes}) were not classified: this classifier is for volcanic rocks.", { n: sedN, codes: Object.entries(sedSkipped).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(", ") }) : "";
    const jensenText = methodKey === "litho_jensen" ? tr(" The classes are a simplified threshold split of the cation ternary, not the published Jensen fields.") : "";
    setNotices((p) => [...p, notice(runs.length ? "Generated {rows} intervals from {n} samples → {v} layer (touching samples of one class are joined).{detail} Switch to 3D View to see it." : "No interval was generated from {n} samples, so the {v} layer is empty.{detail}", { rows: runs.length, n: rows.length, v: method.target === "litho" ? tr("Lithology (geochem)") : tr("Alteration (geochem)"), detail: (fitted ? (countList ? ` ${countList}.` : "") + fitText + tr(" Screening level.") : detail) + trendText + sedText + jensenText })]); // fitted: #2028; trendText: #2145
    { const pd = partialDigestionFor(assayElements, method.requires); if (pd.length) setNotices((p) => [...p, notice("Partial digestion: {list}. A four-acid or aqua-regia digestion does not fully dissolve zircon and other resistant minerals, so Zr and Hf (and partly Nb, Ta, Y and the REE) read low and the fields shift. Immobile-element diagrams and classifiers need a total (fusion / lithium-borate) digestion.", { list: pd.map(([s, m]) => `${s} ${m}`).join(", ") })]); } // #1518
  };

  // ---------- exports ----------
  // TASKS.csv #1048 — what the page shows around the diagram goes into the file: the diagram, the sample count, the
  // half-detection-limit rule and a key for the colouring (export text in English)
  // TASKS.csv #1091 — five values along the element ramp (log-spaced when the ramp is), for the on-screen and exported keys
  const elementKey = () => {
    if (!colorRange) return [];
    const { min, max, log } = colorRange;
    return [0, 0.25, 0.5, 0.75, 1].map((t) => { const v = log ? 10 ** (Math.log10(min) + (Math.log10(max) - Math.log10(min)) * t) : min + (max - min) * t; return { v, color: colorForVoxelValue({ stops: colorRange.stops, colorMode: "continuous" }, v) }; });
  };
  const plotFurniture = () => {
    const n = plottedCount; // #1519
    const keyItems = colorMode === "hole" ? [...new Set(plotted.map((a) => a.hole_id))].map((h) => ({ label: String(h), color: holeColors[h] || "#55606e", shape: "dot" }))
      : colorMode === "lithology" ? lithCounts.filter(([k]) => !lithFilter || lithFilter.has(k)).map(([k]) => ({ label: k === NOT_LOGGED ? "not logged" : String(k), color: lithColors[k] || "#b8bec7", shape: "dot" }))
      : colorMode === "element" && colorRange ? elementKey().map(({ v, color }) => ({ label: `${+v.toPrecision(3)} ${colorUnit}`, color, shape: "dot" }))
      : [];
    const keyTitle = colorMode === "hole" ? "Hole" : colorMode === "lithology" ? "Lithology" : colorMode === "element" ? `${colorEl} (${colorRange?.log ? "log" : "linear"} scale)` : "";
    const pdx = partialDigestionFor(assayElements, diagram.requires); // #1518 — the warning travels with the exported figure
    return geochemFurniture({ title: diagram.label, caption: (carbonateNote ? `${carbonateNote} ` : "") + (pdx.length ? `${diagram.caption} ${tr("Partial digestion: {list}. A four-acid or aqua-regia digestion does not fully dissolve zircon and other resistant minerals, so Zr and Hf (and partly Nb, Ta, Y and the REE) read low and the fields shift. Immobile-element diagrams and classifiers need a total (fusion / lithium-borate) digestion.", { list: pdx.map(([s, m]) => `${s} ${m}`).join(", ") })}` : diagram.caption), plotted: n, total: assays.length, spider: !!diagram.spider, hidden: lithFilter ? assays.length - plotted.length : null, keyTitle, keyItems, date: new Date().toISOString().slice(0, 10), censored: censoredCount }); // #1017 — in lib, tested; censored: #2018
  };
  const exportPlotSVG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = exportSvgMarkup(svg, { furniture: plotFurniture() }).markup;
    saveFile({ suggestedName: `${diagramId}.svg`, filters: [{ name: "SVG", extensions: ["svg"] }], content: xml });
  };
  const exportPlotPNG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const { markup: xml, width: fw, height: fh } = exportSvgMarkup(svg, { furniture: plotFurniture() }); // #1048
    const img = new Image();
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1240; canvas.height = Math.round((1240 * fh) / fw); // the figure's own aspect, caption band included
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const b64 = canvas.toDataURL("image/png").split(",")[1];
      saveFile({ suggestedName: `${diagramId}.png`, filters: [{ name: "PNG", extensions: ["png"] }], content: b64, encoding: "base64" });
    };
    img.src = url;
  };
  const exportProjectedCSV = () => {
    const rows = diagramExportRows(plotted, diagram, elementUnits); // #1083 — in lib, tested; plotted: #2027 — the samples the diagram shows (QC inserts, the other source and the lithology filter as on screen)
    const csv = withStamp(toExportCsv(rows), stampLines({ tool: `Plot data: ${diagram.label || diagramId}`, version: APP_VERSION, params: [diagram.xLabel ? `x: ${diagram.xLabel}` : "", diagram.yLabel ? `y: ${diagram.yLabel}` : "", `Element units: ${Object.entries(elementUnits || {}).map(([k, v]) => `${k} ${v}`).join(", ")}`] })); // #1212
    saveFile({ suggestedName: `${diagramId}_projected.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: csv });
  };
  const exportAssaysCSV = () => {
    const csv = toExportCsv(assayExportRows(assays, assayElements)); // TASKS.csv #1016 — units, < / > qualifiers and QC columns kept
    saveFile({ suggestedName: "assays.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: csv });
  };

  // TASKS.csv #1682 (review #1645, Copley) — the Simple ribbon follows the data: the surface-sample tools wait in Advanced until there are
  // surface samples (a drill-only project showed four of them greyed out), and QAQC / Correlation / Compositing join Simple once there are
  // drill assays (they were behind '+15 Show all')
  const hasSurfaceData = !!(surfaceSamples.length || surfaceElements.length || surfaceQc?.records?.length);
  return (
    <div
      className="ge-body"
      style={{ width: "100%", border: dragOver ? "2px dashed #4a9be0" : "2px dashed transparent", borderRadius: 8 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* left panel */}
      <div className="ge-panel" style={{ padding: "16px 14px", width: sidebarWidth }}>
        {/* TASKS.csv #458 — Geochem ribbon: every tool that used to be a button in this sidebar. */}
        <Ribbon label="Geochem tools">
          <RibbonGroup label="Import">
            <RibbonButton icon={Upload} label="Assays" tone="data" title="Import drillhole assays (CSV)" onClick={() => fileRef.current.click()} />
            <RibbonButton icon={Database} label="Database" tone="data" title="Import drillhole assays straight from a database (PostgreSQL or MySQL): a table or a query" onClick={() => setDbOpen(true)} />{/* TASKS.csv #917 */}
            <RibbonButton advanced icon={Beaker} label="pXRF" tone="data" title="Import pXRF readings (CSV)" onClick={() => pxrfRef.current.click()} />
            <RibbonButton advanced icon={FileCheck} label="Lab certificates" tone="data" disabled={!assays.length} disabledReason="Import the drill samples (hole, from, to, sample id) first" title={assays.length ? "Lab certificates (ALS CSV): join them to the drill samples by sample id, check the values, and review GeoStrix's QC-type suggestions for the samples only the lab has (blanks, standards, duplicates)" : "Import the drill samples (hole, from, to, sample id) first — certificates are joined to them by sample id"} onClick={() => certRef.current.click()} />
            <RibbonButton icon={GMapPin} label="Surface samples" tone="data" title="Soil, rock-chip, stream-sediment or talus-fines samples (CSV) — no drillhole needed" onClick={() => surfaceFileRef.current.click()} />
            <RibbonButton icon={Globe} label="Public data" tone="data" title="Public geochemistry: government stream-sediment surveys (BC RGS, Australia's NGSA and others) for the project area, with their licences" onClick={() => setPublicOpen(true)} />{/* TASKS.csv #846 */}
          </RibbonGroup>
          <RibbonGroup advanced label="Classify">
            <RibbonButton icon={FlaskConical} label="AI / CCPI" tone="analyse" disabled={!assayElements.length} disabledReason="Import assays first" title="Alteration from geochem (Ishikawa AI / CCPI box plot) — screening level" onClick={() => runMethod("alteration_boxplot")} />
            <RibbonButton icon={GTriangle} label="Winchester" tone="analyse" disabled={!assayElements.length} disabledReason="Import assays first" title="Lithology from immobile elements (Winchester & Floyd) — screening level" onClick={() => runMethod("litho_winchester")} />
            <RibbonButton icon={GShapes} label="Jensen" tone="analyse" disabled={!assayElements.length} disabledReason="Import assays first" title="Lithology (Jensen cation plot) — screening level" onClick={() => runMethod("litho_jensen")} />
          </RibbonGroup>
          <RibbonGroup advanced label="Calculate">
            <RibbonButton icon={Sigma} label="Calc. element" tone="analyse" disabled={!assayElements.length && !surfaceElements.length} disabledReason="Import assays or surface samples first" active={!!calc} title="Add a calculated element from a formula (AI, CCPI, ratios...) — usable everywhere a real element is" onClick={() => setCalc((c) => (c ? null : { name: "", expr: "", unit: "index", msg: null, source: assayElements.length ? "assays" : "surface" }))} />{/* source: TASKS.csv #1799 */}
            <RibbonButton icon={Scale} label="Isocon" tone="analyse" disabled={assayElements.filter((e) => !e.calculated).length < 2} disabledReason={assayElements.length ? "Isocon needs at least two assayed elements, one of them immobile (Al, Ti, Zr)" : "Import assays first"} /* #2197 */ title="Isocon / mass-change calculator" onClick={() => setIsoconOpen(true)} />
          </RibbonGroup>
          <RibbonGroup label="Analyze">
            <RibbonButton advanced={!assayElements.length && !surfaceElements.length} icon={Grid3x3} label="Correlation" tone="analyse" disabled={!assayElements.length && !surfaceElements.length} disabledReason="Import assays or surface samples first" title="Correlation matrix" onClick={() => setCorrOpen(true)} />
            <RibbonButton icon={GBarChart} label="Grade stats" tone="analyse" disabled={!(assayElements.length || surfaceElements.length)} disabledReason="Import assays or surface samples first" title="Grade statistics (assays or surface samples)" onClick={() => setGradeStatsOpen(true)} />
            <RibbonButton advanced={!hasSurfaceData} icon={GBarChart} label="Thresholds" tone="analyse" disabled={!surfaceElements.length && !(assays.length && assayElements.length)} disabledReason="Import surface samples or drill assays first" /* drill: #2196 */ title="Anomaly thresholds for soil and stream-sediment samples, and length-weighted for drill assays, judged within populations" onClick={() => setThresholdsOpen(true)} />{/* TASKS.csv #841 */}
            <RibbonButton advanced={!hasSurfaceData} icon={GMapPin} label="Plan map" tone="output" disabled={!surfaceSamples.length} disabledReason="Import surface samples first" title="Surface samples in plan, classed by the saved threshold, over a block-model level slice: to Layout or PNG" onClick={() => setPlanMapOpen(true)} />{/* TASKS.csv #1792 / #1864 */}
            <RibbonButton advanced icon={GBarChart} label="Level surveys" tone="analyse" disabled={!surfaceElements.length} disabledReason="Import surface samples first" title="Bring one survey's values to another's level (tie samples first), as a new column" onClick={() => setLevellingOpen(true)} />{/* TASKS.csv #1001 */}
            <RibbonButton advanced={!hasSurfaceData} icon={GBarChart} label="Domains" tone="analyse" disabled={surfaceElements.length < 2} disabledReason="Import surface samples with several elements first" title="Geochemical domains: log-ratio principal components and k-means on the surface samples, written back as a column for the Thresholds populations" onClick={() => setDomainsOpen(true)} />{/* TASKS.csv #852 */}
            <RibbonButton advanced={!hasSurfaceData} icon={GMapPin} label="Catchments" tone="analyse" disabled={!surfaceSamples.length} disabledReason="Import surface samples first" title="Stream-sediment catchments from the terrain: dilution correction (Hawkes), drainage ranking, follow-up reaches" onClick={() => setCatchmentsOpen(true)} />{/* TASKS.csv #845 */}
            <RibbonButton icon={GMapPin} label="Plan survey" tone="data" title="Plan a soil grid or stream-sediment sites, numbered with your QC inserts: GPX, KML, CSV and a printable field sheet" onClick={() => setPlannerOpen(true)} />{/* TASKS.csv #844 */}
            <RibbonButton advanced={!assayElements.length} icon={ShieldCheck} label="QAQC" tone="analyse" disabled={!assayElements.length} disabledReason="Import assays first" title="QAQC: standards, blanks, duplicates" onClick={() => setQaqcOpen(true)} />
            <RibbonButton advanced={!hasSurfaceData} icon={ShieldCheck} label="Surface QAQC" tone="analyse" disabled={!(surfaceSamples.length || surfaceQc?.records?.length)} disabledReason="Import surface samples first" title="QA/QC of soil and stream-sediment programs: lab certificates, your standards, blanks and duplicates, insertion rates per batch" onClick={() => setSurfaceQcOpen(true)} />{/* TASKS.csv #842 */}
            <RibbonButton advanced icon={TerminalSquare} label="SQL" tone="data" disabled={!assayElements.length && !surfaceSamples.length} disabledReason="Import assays or surface samples first" title="SQL workspace" onClick={() => setSqlOpen(true)} />
          </RibbonGroup>
          <RibbonGroup label="Report">
            <RibbonButton icon={GAward} label="Best intercepts" tone="output" disabled={!assayElements.length} disabledReason="Import assays first" title="Best-intercept report" onClick={() => setBestIntOpen(true)} />
            <RibbonButton advanced={!assayElements.length} icon={GRows} label="Compositing" tone="output" disabled={!assayElements.length} disabledReason="Import assays first" title="Downhole compositing" onClick={() => setCompositingOpen(true)} />
          </RibbonGroup>
          <RibbonGroup label="Export">
            <RibbonButton advanced icon={GSheet} label="Assays CSV" tone="output" disabled={!assayElements.length} disabledReason="Import assays first" title="Assays → CSV" onClick={exportAssaysCSV} />
            <RibbonButton advanced icon={Download} label="Plot data" tone="output" disabled={!assayElements.length} disabledReason="Import assays first" title="Plot data → CSV" onClick={exportProjectedCSV} />
            <RibbonButton icon={GImage} label="Plot PNG" tone="output" disabled={!assayElements.length} disabledReason="Import assays first" title="Plot → PNG" onClick={exportPlotPNG} />
            <RibbonButton advanced icon={GImage} label="Plot SVG" tone="output" disabled={!assayElements.length} disabledReason="Import assays first" title="Plot → SVG" onClick={exportPlotSVG} />
          </RibbonGroup>
        </Ribbon>
        <input ref={certRef} type="file" accept=".csv" multiple style={{ display: "none" }} onChange={(e) => { handleCertificates(e.target.files); e.target.value = ""; }} />
        <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f, false); e.target.value = ""; }} />
        <input ref={pxrfRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f, true); e.target.value = ""; }} />
        <input ref={surfaceFileRef} type="file" multiple accept=".csv,.xlsx,.shp,.dbf,.prj,.cpg,.shx,.zip,.gpkg,.kml,.kmz" /* #2016 */ style={{ display: "none" }} onChange={(e) => { const f = SHP_GROUP(Array.from(e.target.files || []))[0]; if (f) handleSurfaceFile(f); e.target.value = ""; }} />

        <div className="ge-section-label">{tr("Assays & pXRF")}</div>
        <div style={{ fontSize: 11, color: "#65717e", margin: "10px 0 4px" }}>
          {assays.length ? tr("{assays} intervals · {assayElements} elements", { assays: assays.length, assayElements: assayElements.length }) : tr("No assays loaded")}
        </div>
        {/* TASKS.csv #624 — remove what was imported: a whole file, one element, or everything (all undoable) */}
        {assays.length > 0 && <AssayRemovePanel assays={assays} assayElements={assayElements} setAssays={setAssays} setAssayElements={setAssayElements} setNotices={setNotices} colorElement={colorElement} setColorElement={setColorElement} />}
        <div className="ge-section-label" style={{ marginTop: 14 }}>{tr("Surface samples")}</div>
        <div style={{ fontSize: 11, color: "#65717e", margin: "10px 0 4px" }}>
          {surfaceSamples.length ? tr("{surfaceSamples} samples · {surfaceElements} elements", { surfaceSamples: surfaceSamples.length, surfaceElements: surfaceElements.length }) : tr("No surface samples loaded")}
        </div>
        <div style={{ fontSize: 10, color: "#65717e", marginTop: 2, lineHeight: 1.4 }}>{tr("Or drag a CSV or Excel workbook (.xlsx — the sheet with the most element columns is read) anywhere on this page — filenames with \"pxrf\"/\"xrf\" go to the pXRF path, a table with x/y and no from / to opens as surface samples, everything else imports as assays.")}</div>
        {assayElements.length > 0 && <div style={{ fontSize: 10, color: "#65717e", marginTop: 8, lineHeight: 1.5 }}>{tr("Screening-level classifications — a first pass, not a substitute for a proper plot and petrologic review.")}</div>}

        <SampleGridPanel setNotices={setNotices} />{/* TASKS.csv #1622 — a soil grid */}

        {/* TASKS.csv #401 — calculated element form, opened from the ribbon */}
        {calc && (assayElements.length > 0 || surfaceElements.length > 0) && (() => {
          // TASKS.csv #1799 (review #1646, Kodiak) — a soil Cu + Au index is a calculated element on the surface samples
          const onSurface = calc.source === "surface" && surfaceElements.length > 0, calcEls = onSurface ? surfaceElements : assayElements;
          return (
          <>
            <div className="ge-section-label" style={{ marginTop: 18 }}>{tr("Calculated element")}</div>
              <div style={{ padding: 8, border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-sm)", display: "flex", flexDirection: "column", gap: 6 }}>
                {assayElements.length > 0 && surfaceElements.length > 0 && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Data source")}<select value={onSurface ? "surface" : "assays"} onChange={(e) => setCalc((c) => ({ ...c, source: e.target.value, msg: null }))} style={{ fontSize: "var(--font-size-sm)" }} aria-label={tr("Data source")}><option value="assays">{tr("Drillhole assays")}</option><option value="surface">{tr("Surface samples")}</option></select></label>}
                <select value="" onChange={(e) => { const p = CALC_PRESETS.find((x) => x.name === e.target.value); if (p) setCalc((c) => ({ source: c?.source, name: p.name, expr: p.expr, unit: "index", msg: { ok: true, text: `${tr(p.label)}. ${tr(p.unitNote)}.` } })); }} style={{ fontSize: "var(--font-size-sm)" }} aria-label={tr("Preset")}>
                  <option value="">{tr("Preset… (or write your own below)")}</option>
                  {CALC_PRESETS.map((p) => <option key={p.name} value={p.name} disabled={!p.needs.every((s) => calcEls.some((e) => e.symbol === s))}>{tr(p.label)}{p.needs.every((s) => calcEls.some((e) => e.symbol === s)) ? "" : tr(" — needs {list}", { list: p.needs.join(", ") })}</option>)}
                </select>
                <input value={calc.name} onChange={(e) => setCalc((c) => ({ ...c, name: e.target.value }))} placeholder={tr("Name, e.g. AI")} aria-label={tr("Calculated element name")} style={{ fontSize: "var(--font-size-sm)" }} />
                {/* TASKS.csv #1749 (review #1645, Copley) — a metal-equivalent (CuEq, AuEq) is a grade, not an index: with a grade unit its estimate can be priced in the pit shell */}
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Unit")}<select value={calc.unit || "index"} onChange={(e) => setCalc((c) => ({ ...c, unit: e.target.value }))} style={{ fontSize: "var(--font-size-sm)" }} aria-label={tr("Unit of the calculated element")} title={tr("An index has no unit. A metal-equivalent (CuEq, AuEq) takes the grade unit its formula gives, % or g/t, so an estimate of it can be priced in the pit shell.")}>{["index", "%", "g/t", "ppm", "ppb"].map((u) => <option key={u} value={u}>{u === "index" ? tr("index (no unit)") : u}</option>)}</select></label>
                <textarea value={calc.expr} onChange={(e) => setCalc((c) => ({ ...c, expr: e.target.value }))} rows={3} placeholder={tr("Formula over element symbols, e.g. 100*Zn/(Zn+Pb)")} aria-label={tr("Calculated element formula")} style={{ fontSize: "var(--font-size-sm)", fontFamily: "monospace" }} />
                <div style={{ color: "var(--color-text-muted)" }}>{tr("Elements are read in their stored units ({v}{v2}). Rows missing any element in the formula get no value.", { v: calcEls.slice(0, 6).map((e) => `${e.symbol} ${e.unit}`).join(", "), v2: calcEls.length > 6 ? ", …" : "" })}</div>
                {calc.msg && <div style={{ color: calc.msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-icon-strong)" }}>{calc.msg.text}</div>}
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...genBtn, flex: 1 }} onClick={() => {
                    try {
                      if (onSurface) { // #1799 — stored on the surface samples like an imported element: plan map, thresholds, grade stats take it
                        const r = addCalculatedElement(surfaceSamples, surfaceElements, calc.name, calc.expr, calc.unit || "index");
                        setSurfaceSamples(r.assays);
                        setSurfaceElements((prev) => [...prev, r.element]);
                        setNotices((p) => [...p, notice("Added calculated element {symbol} = {expr} on {computed} surface sample(s) (range {min}–{max}){v}. The plan map, thresholds, grade stats and correlation can use it. It is not recalculated if the samples are re-imported.", { symbol: r.element.symbol, expr: r.element.calculated.expr, computed: r.computed.toLocaleString(), min: r.min.toFixed(2), max: r.max.toFixed(2), v: r.skipped ? tr("; {skipped} sample(s) missing an element in the formula have no value", { skipped: r.skipped.toLocaleString() }) : "" })]);
                        setCalc(null);
                        return;
                      }
                      const r = addCalculatedElement(assays, assayElements, calc.name, calc.expr, calc.unit || "index"); // unit: #1749
                      setAssays(r.assays);
                      setAssayElements((prev) => [...prev, r.element]);
                      setNotices((p) => [...p, notice("Added calculated element {symbol} = {expr} on {computed} assay interval(s) (range {min}–{max}){v}. It can now be shown downhole, in 3D and on sections like any element. It is not recalculated if assays are re-imported.", { symbol: r.element.symbol, expr: r.element.calculated.expr, computed: r.computed.toLocaleString(), min: r.min.toFixed(2), max: r.max.toFixed(2), v: r.skipped ? tr("; {skipped} interval(s) missing an element in the formula have no value", { skipped: r.skipped.toLocaleString() }) : "" })]);
                      setCalc(null);
                    } catch (err) { setCalc((c) => ({ ...c, msg: { ok: false, text: err.message } })); }
                  }}>{tr("Add")}</button>
                  <button style={{ ...panelBtn, flex: 1 }} onClick={() => setCalc(null)}>{tr("Cancel")}</button>
                </div>
              </div>
          </>
          );
        })()}

        {/* TASKS.csv #298 — this module has no floating toast of its own (unlike the 3D View), so this
            list is the ONLY surface a setNotices() message appears on while the user is in Geochem —
            which made every one of those messages completely silent to a screen reader. It's the live
            region here, rather than merely labelled as it is in ViewerModule (where the toast already
            announces and a second live region would double up). aria-live is on a wrapper that always
            renders, so the region exists before the first message lands — a live region inserted at
            the same moment as its text is routinely missed. */}
        <div aria-live="polite" aria-relevant="additions text" aria-label={tr("Import and analysis messages")}>
          {notices.length > 0 && (
            // TASKS.csv #729 — #390's severity and #384's contrast here too: a failure gets an icon and the danger
            // colour, the rest the caption grey (4.98:1, was #7b8794 at 3.66:1); the newest message is bold.
            <div style={{ marginTop: 16, padding: "8px 10px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-caption)", lineHeight: 1.5, maxHeight: 160, overflowY: "auto" }}>
              {notices.filter((n, i, a) => i === 0 || noticeText(n) !== noticeText(a[i - 1])).slice(-6).map((n, i, shown) => { /* #1223 — one repeated message, once */
                const last = i === shown.length - 1 ? { fontWeight: 600 } : null;
                return noticeLevel(n) === "error"
                  ? <div key={i} style={{ marginBottom: 4, color: "var(--color-danger-fg)", display: "flex", gap: 5, alignItems: "flex-start", ...last }}><AlertTriangle size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} /><span><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{tr("Error:")}{" "}</span>{noticeText(n)}</span></div>
                  : <div key={i} style={{ marginBottom: 4, ...last }}>{noticeText(n)}</div>;
              })}
            </div>
          )}
        </div>
      </div>

      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      {/* main plot area */}
      <div className="ge-main" style={{ display: "flex", flexDirection: "column", padding: 20, overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <select aria-label={tr("Diagram")} value={diagramId} onChange={(e) => setDiagramId(e.target.value)} style={selectStyle}>
            {[...Object.values(ALL_DIAGRAMS), XY_ENTRY].map((d) => <option key={d.id} value={d.id}>{tr(d.label)}</option>)}
          </select>
          {diagramId === "xy" && ( /* TASKS.csv #1678 — the scatter's two axes */
            <>
              {[["X", xyKeyX, setXyX], ["Y", xyKeyY, setXyY]].map(([axis, value, set]) => (
                <label key={axis} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11.5, color: "#55606e" }}>{axis}
                  <select aria-label={tr("{axis} axis", { axis })} value={value} onChange={(e) => set(e.target.value)} style={{ ...selectStyle, padding: "5px 8px", maxWidth: 220 }}>
                    {!value && <option value="">{tr("— choose —")}</option>}{/* #2193 */}
                    <optgroup label={tr("Elements")}>{assayElements.map((e) => <option key={e.symbol} value={`el:${e.symbol}`}>{e.unit ? `${e.symbol} (${e.unit})` : e.symbol}</option>)}</optgroup>
                    {xyChoices.length > 0 && <optgroup label={tr("Downhole logs and custom fields (at each sample's depth)")}>{xyChoices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</optgroup>}
                  </select>
                </label>
              ))}
            </>
          )}
          {hasPxrf && ( /* TASKS.csv #1673 — which rows the plot uses */
            <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: "#55606e" }} title={tr("Portable XRF readings are screening numbers (zero-length points, 'not detected' zeros, a bad reading at 36,096 ppm Rb): plotted apart from the lab assays unless you choose both.")}>{tr("Samples:")}<select aria-label={tr("Samples plotted")} value={plotSource} onChange={(e) => setPlotSource(e.target.value)} style={{ ...selectStyle, padding: "5px 8px" }}>
              <option value="lab">{tr("Lab assays")}</option><option value="pxrf">{tr("pXRF readings (screening)")}</option><option value="both">{tr("Lab + pXRF")}</option>
            </select></div>
          )}
          {qcInSource > 0 && ( /* TASKS.csv #2027 */
            <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 11.5, color: "#55606e", cursor: "pointer" }} title={tr("Standards, blanks and duplicates are left out of the diagrams, as they are of the grade tools. Tick to plot them, e.g. to see where a standard falls.")}>
              <input type="checkbox" checked={!!plotQc} onChange={(e) => setPlotQc(e.target.checked)} />{tr("Plot the {n} QC insert(s)", { n: qcInSource.toLocaleString() })}
            </label>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: "#55606e" }}>{tr("Colour:")}<select aria-label={tr("Colour by")} value={colorMode} onChange={(e) => setColorMode(e.target.value)} style={{ ...selectStyle, padding: "5px 8px" }}>
              <option value="hole">{tr("by hole")}</option>
              <option value="element">{tr("by element")}</option>
              <option value="lithology" disabled={!hasLithLog}>{tr("by logged lithology")}</option>
              <option value="uniform">{tr("uniform")}</option>
            </select>
            {colorMode === "element" && (
              <select value={colorEl || ""} onChange={(e) => setColorElement(e.target.value)} style={{ ...selectStyle, padding: "5px 8px" }}>
                {assayElements.map((el) => <option key={el.symbol} value={el.symbol}>{el.symbol}</option>)}
              </select>
            )}
            {/* TASKS.csv #1091 — the ramp's key: five values, log-spaced when the ramp is */}
            {colorMode === "element" && colorRange && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-xs)", color: "#55606e" }} title={colorRange.log ? tr("Log scale: the values span two decades or more") : tr("Linear scale")}>
                {elementKey().map(({ v, color }, i) => <span key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}><span style={{ width: 9, height: 9, borderRadius: 5, background: color, border: "1px solid rgba(0,0,0,0.15)" }} />{+v.toPrecision(2)}</span>)}
                <span>{tr("{unit} ({v})", { unit: colorUnit, v: colorRange.log ? tr("log") : tr("linear") })}</span>
              </span>
            )}
            {/* TASKS.csv #1519 (review #1497) — 'by hole' and 'by logged lithology' had no key on screen (the export had one) */}
            {(colorMode === "lithology" || (colorMode === "hole" && plottedHoles.length <= KEY_MAX)) && (() => {
              const items = colorMode === "hole" ? plottedHoles.map((h) => [String(h), holeColors[h] || "#55606e"])
                : lithCounts.filter(([k]) => !lithFilter || lithFilter.has(k)).map(([k]) => [k === NOT_LOGGED ? tr("not logged") : String(k), lithColors[k] || "#b8bec7"]);
              return (
                <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: "var(--font-size-xs)", color: "#55606e", maxWidth: 520 }}>
                  {items.slice(0, KEY_MAX).map(([label, color]) => <span key={label} style={{ display: "flex", alignItems: "center", gap: 2 }}><span style={{ width: 9, height: 9, borderRadius: 5, background: color, border: "1px solid rgba(0,0,0,0.15)" }} />{label}</span>)}
                  {items.length > KEY_MAX && <span>{tr("+ {n} more (the exported figure lists them all)", { n: items.length - KEY_MAX })}</span>}
                </span>
              );
            })()}
            {colorMode === "hole" && plottedHoles.length > KEY_MAX && <span style={{ fontSize: "var(--font-size-xs)", color: "#55606e" }}>{tr("{n} holes, one colour each: too many for a key here (the exported figure lists them; filter the holes to read one)", { n: plottedHoles.length })}</span>}
          </div>
          {/* TASKS.csv #619 — filter by logged lithology (the 3D View's lithology log, matched by largest overlap) */}
          <div style={{ position: "relative", display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: "#55606e" }}>{tr("Lithology:")}<button type="button" onClick={() => setLithMenuOpen((o) => !o)} disabled={!hasLithLog || !assays.length} aria-expanded={lithMenuOpen} aria-haspopup="true"
              title={hasLithLog ? tr("Plot only samples from the chosen logged lithologies") : tr("Load a lithology log in the 3D View to filter by it")}
              style={{ ...selectStyle, padding: "5px 8px", cursor: hasLithLog ? "pointer" : "not-allowed", opacity: hasLithLog ? 1 : 0.55 }}>
              {!hasLithLog ? tr("no log loaded") : !lithFilter ? tr("all ({lithCounts})", { lithCounts: lithCounts.length }) : tr("{size} of {lithCounts} selected", { size: lithFilter.size, lithCounts: lithCounts.length })} ▾
            </button>
            {lithMenuOpen && hasLithLog && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setLithMenuOpen(false)} />
                <div role="menu" onKeyDown={(e) => { if (e.key === "Escape") setLithMenuOpen(false); }} style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 21, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.15)", padding: 8, minWidth: 220, maxHeight: 360, overflowY: "auto" }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <button type="button" onClick={() => setLithFilter(null)} style={{ ...selectStyle, padding: "3px 8px" }}>{tr("All")}</button>
                    <button type="button" onClick={() => setLithFilter(new Set())} style={{ ...selectStyle, padding: "3px 8px" }}>{tr("None")}</button>
                  </div>
                  {lithCounts.map(([code, n]) => {
                    const on = !lithFilter || lithFilter.has(code);
                    const toggle = () => setLithFilter((prev) => { const next = new Set(prev || lithCounts.map(([k]) => k)); if (next.has(code)) next.delete(code); else next.add(code); return next.size === lithCounts.length ? null : next; });
                    return (
                      <label key={code} role="menuitemcheckbox" aria-checked={on} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 2px", cursor: "pointer", fontSize: 12, color: "var(--color-text)" }}>
                        <input type="checkbox" checked={on} onChange={toggle} />
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: lithColors[code], flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{code === NOT_LOGGED ? tr("not logged") : code}</span>
                        <span style={{ color: "var(--color-text-muted)" }}>{n}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ fontSize: 11, color: "#65717e", marginBottom: 10 }}>{tr(diagram.caption)}</div>
        {carbonateNote && <div style={{ fontSize: 11, color: "var(--color-warn-text)", marginBottom: 10, lineHeight: 1.4 }}>{carbonateNote}</div>} {/* #1392 */}
        {(() => { const pd = partialDigestionFor(assayElements, diagram.requires); return pd.length ? <div style={{ fontSize: 11, color: "var(--color-warn-text)", marginBottom: 10, lineHeight: 1.4 }}>{tr("Partial digestion: {list}. A four-acid or aqua-regia digestion does not fully dissolve zircon and other resistant minerals, so Zr and Hf (and partly Nb, Ta, Y and the REE) read low and the fields shift. Immobile-element diagrams and classifiers need a total (fusion / lithium-borate) digestion.", { list: pd.map(([s, m]) => `${s} ${m}`).join(", ") })}</div> : null; })()}{/* #1518 */}

        {assays.length > 0 && missingForDiagram.length > 0 && (
          <div style={{ padding: "10px 12px", background: "#241f14", border: "1px solid #4a3d1e", borderRadius: 8, fontSize: 12, color: "#d8c080", marginBottom: 12 }}>{tr("This diagram needs {requires} — missing {missingForDiagram}. Points that can't be projected are dropped.", { requires: diagram.requires.join(", "), missingForDiagram: missingForDiagram.join(", ") })}</div>
        )}

        {assays.length === 0 ? (
          // TASKS.csv #309 — was a single line of centred grey text, one of four different
          // empty-state treatments across the app's seven tabs. Now the shared EmptyState card (see
          // components/EmptyState.jsx), same as 3D View / Raster / Geophysics. `position: relative`
          // on the wrapper because EmptyState positions itself absolutely into its container.
          <div style={{ flex: 1, position: "relative", minHeight: 260 }}>
            <EmptyState
              icon={<FlaskConical size={18} />}
              headline={surfaceSamples.length ? tr("{n} surface samples loaded; the diagrams here plot drillhole assays", { n: surfaceSamples.length.toLocaleString() }) : tr("No assay data yet")} /* #1086 */
              actionLabel={tr("Import assays…")}
              onAction={() => fileRef.current.click()}
              actionTitle={tr("Pick an assay CSV — a hole ID, from/to depths, and one column per element")}
              secondary={
                <>
                  <button onClick={() => pxrfRef.current.click()} style={emptyStateSecondaryBtn} title={tr("Import a pXRF export instead")}>{tr("Import pXRF…")}</button>
                  {/* TASKS.csv #391 — the empty Geochem tab offered imports only; the sample assays ship with the app */}
                  <button onClick={loadSampleAssays} disabled={sampleLoading} style={emptyStateSecondaryBtn} title={tr("The Harry property sample: assays of 37 real drillholes from BC's public ARIS database (report #37584)")}>
                    {sampleLoading ? tr("Loading sample…") : tr("Load sample assays")}
                  </button>
                </>
              }
              footnote={tr("An assay CSV needs a hole ID, from/to depths and one column per element. A table with x/y (easting / northing) and no from/to opens as surface samples instead.")}
            >
              <div style={{ marginBottom: 12 }}>{tr("Ternary, bivariate and REE-spider diagrams over your assay or pXRF data, plus alteration indices, correlation matrices, QAQC and downhole compositing. Import a file to start plotting.")}</div>
              {surfaceSamples.length > 0 && <div style={{ marginBottom: 12 }}>{tr("Your surface samples are used by Thresholds, Grade stats, Correlation, Calc. element, SQL, Domains, Catchments and Surface QAQC in the ribbon above, and are drawn in the 3D View and on the Maps tab.")}</div>}{/* #1086 */}
            </EmptyState>
          </div>
        ) : (
          <div style={{ maxWidth: 680 }}>
            <GeochemPlot diagramId={diagramId} diagramOverride={diagramId === "xy" ? diagram : null} samples={plotted} elementUnits={elementUnits} colorBy={colorBy} svgRef={svgRef} altBoxes={alterationBoxes?.boxes || PROVISIONAL_ALTERATION_BOXES} describe={describeSample} /> {/* plotted / describe: #619 */}
            <div style={{ fontSize: "var(--font-size-xs)", color: "#65717e", marginTop: 8 }}>
              {((o) => o.v + o.v2 + (censoredCount ? " " + tr(censoredCount === 1 ? "1 of them holds a below-detection value ('<'), plotted at half the detection limit or at the value the source file stored." : "{n} of them hold a below-detection value ('<'), plotted at half the detection limit or at the value the source file stored.", { n: censoredCount.toLocaleString() }) : "") /* #2018 — only when there are some */)({ v: diagram.spider
                ? tr("{n} of {assays} samples have at least one plottable element.", { n: plottedCount, assays: sourceRows.length })
                : tr("{n} of {assays} samples plotted.", { n: plottedCount, assays: sourceRows.length }) + (plottedCount === 0 && sourceRows.length && !missingForDiagram.length && diagram.requires.length ? " " + ((absent) => (absent.length ? tr("None of these samples has {list}.", { list: absent.join(", ") }) : tr("No sample has {requires} all together (they may come from different files, e.g. a lab assay and a pXRF reading).", { requires: diagram.requires.join(", ") })))(diagram.requires.filter((sym) => !sourceRows.some((r) => Number.isFinite(r.values?.[sym])))) : ""), /* plottedCount: #1519; the reason for none: #1679 (Copley TAS: Si only in the pXRF, Na only in the lab assays) */ v2: (lithFilter ? tr(" {v} hidden by the lithology filter.", { v: sourceRows.length - plotted.length }) : "") + (hasPxrf && plotSource !== "both" ? " " + (plotSource === "pxrf" ? tr("{k} lab assay(s) left out: pXRF readings only.", { k: (assays.length - sourceAll.length).toLocaleString() }) : tr("{k} pXRF reading(s) left out: lab assays only.", { k: (assays.length - sourceAll.length).toLocaleString() })) : "") + (qcInSource && !plotQc ? " " + tr("{k} QC insert(s) (standards, blanks, duplicates) left out.", { k: qcInSource.toLocaleString() }) : "") /* #2027 */ })}</div>
          </div>
        )}
      </div>

      {altBoxOpen && (
        <AlterationBoxModal
          saved={alterationBoxes}
          lithoCodes={[...new Set((layers.litho || []).filter((r) => assayHoleIds.has(r.hole_id)).map((r) => String(r.value ?? "").trim()).filter(Boolean))].sort()}
          altCodes={[...new Set((layers.alt || []).filter((r) => assayHoleIds.has(r.hole_id)).map((r) => String(r.value ?? "").trim()).filter(Boolean))].sort()} /* #2028 */
          onCancel={() => setAltBoxOpen(false)}
          onRun={(setup) => { setAlterationBoxes(setup); setAltBoxOpen(false); runMethod("alteration_boxplot", setup); }}
        />
      )}
      {assayModal && (
        <AssayImportModal
          modal={assayModal}
          existingUnits={elementUnits}
          onChange={setAssayModal}
          onCancel={() => setAssayModal(null)}
          onCommit={() => commitAssayImport(assayModal)}
        />
      )}

      {certReview && (
        <LabCertificateModal review={certReview} assays={assays} onChange={setCertReview} onCancel={() => setCertReview(null)} onCommit={() => commitCertificates(certReview)} />
      )}

      {surfaceModal && (
        <SurfaceImportModal
          modal={surfaceModal}
          onChange={setSurfaceModal}
          onCancel={() => setSurfaceModal(null)}
          onCommit={() => commitSurfaceImport(surfaceModal)}
          onJoinFile={joinSurfaceFile}
          projectEpsg={project?.epsg}
        />
      )}

      {isoconOpen && (
        <IsoconTool
          assays={assays}
          assayElements={assayElements}
          onClose={() => setIsoconOpen(false)}
        />
      )}

      {corrOpen && (
        <CorrelationMatrix
          assays={assays}
          assayElements={assayElements}
          surfaceSamples={surfaceSamples} /* TASKS.csv #1799 */
          surfaceElements={surfaceElements}
          onClose={() => setCorrOpen(false)}
        />
      )}

      {bestIntOpen && (
        <BestIntercepts
          assays={assays}
          assayElements={assayElements}
          collars={collars}
          survey={survey}
          layers={layers}
          onClose={() => setBestIntOpen(false)}
        />
      )}

      {compositingOpen && (
        <CompositingModal
          assays={assays}
          assayElements={assayElements}
          layers={layers}
          onClose={() => setCompositingOpen(false)}
        />
      )}

      {levellingOpen && ( // TASKS.csv #1001
        <React.Suspense fallback={null}><LevellingPanel onClose={() => setLevellingOpen(false)} /></React.Suspense>
      )}
      {domainsOpen && ( // TASKS.csv #852
        <React.Suspense fallback={null}><DomainsPanel onClose={() => setDomainsOpen(false)} /></React.Suspense>
      )}

      {dbOpen && ( // TASKS.csv #917
        <React.Suspense fallback={null}><DatabaseConnectModal initialSql="SELECT * FROM assays LIMIT 500;" onCancel={() => setDbOpen(false)} onResults={({ headers, rows, sourceName }) => { setDbOpen(false); if (rows.length) openTable({ name: sourceName }, headers, rows, false); }} /></React.Suspense>
      )}
      {publicOpen && ( // TASKS.csv #846
        <React.Suspense fallback={null}><PublicGeochemModal onLoaded={openPublicImport} onClose={() => setPublicOpen(false)} /></React.Suspense>
      )}

      {plannerOpen && ( // TASKS.csv #844
        <React.Suspense fallback={null}><SurveyPlannerPanel onClose={() => setPlannerOpen(false)} /></React.Suspense>
      )}

      {catchmentsOpen && ( // TASKS.csv #845
        <React.Suspense fallback={null}><CatchmentsPanel onClose={() => setCatchmentsOpen(false)} /></React.Suspense>
      )}

      {surfaceQcOpen && ( // TASKS.csv #842
        <React.Suspense fallback={null}><SurfaceQaqcPanel onClose={() => setSurfaceQcOpen(false)} /></React.Suspense>
      )}

      {planMapOpen && ( // TASKS.csv #1792 / #1864
        <React.Suspense fallback={null}><SurfacePlanMap onClose={() => setPlanMapOpen(false)} /></React.Suspense>
      )}

      {thresholdsOpen && ( // TASKS.csv #841
        <React.Suspense fallback={null}>
          <ThresholdToolkit surfaceSamples={surfaceSamples} surfaceElements={surfaceElements} mapLayers={mapLayers} geochemThresholds={geochemThresholds} setGeochemThresholds={setGeochemThresholds} onClose={() => setThresholdsOpen(false)} assays={assays} assayElements={assayElements} projectLayers={store.layers} /* drill assays: #2196 */ />
        </React.Suspense>
      )}

      {gradeStatsOpen && (
        <GradeStatistics
          assays={assays}
          assayElements={assayElements}
          layers={layers}
          surfaceSamples={surfaceSamples}
          surfaceElements={surfaceElements}
          onClose={() => setGradeStatsOpen(false)}
        />
      )}

      {qaqcOpen && (
        <QAQCPanel
          assays={assays}
          assayElements={assayElements}
          onClose={() => setQaqcOpen(false)}
        />
      )}

      {sqlOpen && (
        <Suspense fallback={null}>
          <SQLWorkspaceModal
            collars={collars}
            survey={survey}
            layers={layers}
            assays={assays}
            assayElements={assayElements}
            boundaries={boundaries}
            surfaceSamples={surfaceSamples} /* TASKS.csv #1799 */
            surfaceElements={surfaceElements}
            customLayers={store.customLayers || []} /* TASKS.csv #1516 */
            onClose={() => setSqlOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

const panelBtn = { display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px", marginBottom: 6, background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, color: "#1a2028", fontSize: 12, cursor: "pointer" };
const genBtn = { ...panelBtn, background: "#1e3629", border: "1px solid #3d6b52", color: "#8fd9ab" };
const selectStyle = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "7px 10px", color: "#1a2028", fontSize: 12.5 };

// TASKS.csv #624 — "currently there is no way to deleted imported assays". The imported files (each interval
// remembers which file it came from), the elements, and Remove all — every removal goes through the undo history.
function AssayRemovePanel({ assays, assayElements, setAssays, setAssayElements, setNotices, colorElement, setColorElement }) {
  const [open, setOpen] = useState(false);
  const files = useMemo(() => (open ? assayFileSummary(assays) : []), [open, assays]);
  const xBtn = { background: "none", border: "none", cursor: "pointer", color: "var(--color-danger-icon)", padding: "0 2px", lineHeight: 1 };
  const row = { display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", padding: "2px 0" };
  const dropUnusedElements = (rows) => {
    const used = new Set(); rows.forEach((r) => Object.keys(r.values || {}).forEach((k) => used.add(k)));
    setAssayElements((prev) => prev.filter((e) => used.has(e.symbol)));
    if (colorElement && !used.has(colorElement)) setColorElement(null);
  };
  const removeFile = (f) => {
    const label = f.file == null ? "the assays imported before file names were recorded" : `"${f.file}"`;
    if (!confirmDestructive(tr("Remove {label} ({intervals} interval(s))?", { label, intervals: f.intervals.toLocaleString() }), { undoable: true })) return;
    const r = removeAssayFile(assays, f.file);
    setAssays(r.assays); dropUnusedElements(r.assays);
    setNotices((p) => [...p, notice("Removed {removed} assay interval(s) from {label}.{v} Ctrl+Z to undo.", { removed: r.removed.toLocaleString(), label, v: r.keptShared ? tr(" {keptShared} interval(s) also came from another file and were kept (their values can't be separated by file).", { keptShared: r.keptShared.toLocaleString() }) : "" })]);
  };
  const removeElement = (sym) => {
    if (!confirmDestructive(tr("Remove {sym} from every assay interval?", { sym }), { undoable: true })) return;
    const r = removeAssayElement(assays, sym);
    setAssays(r.assays);
    setAssayElements((prev) => prev.filter((e) => e.symbol !== sym));
    if (colorElement === sym) setColorElement(null);
    setNotices((p) => [...p, notice("Removed {sym} from {cleared} interval(s){v}. Ctrl+Z to undo.", { sym, cleared: r.cleared.toLocaleString(), v: r.emptied ? tr("; {emptied} interval(s) had no other element and were removed", { emptied: r.emptied.toLocaleString() }) : "" })]);
  };
  const removeAll = () => {
    if (!confirmDestructive(tr("Remove all {assays} assay intervals and {assayElements} element(s)?", { assays: assays.length.toLocaleString(), assayElements: assayElements.length }), { undoable: true })) return;
    setAssays([]); setAssayElements([]); setColorElement(null);
    setNotices((p) => [...p, notice("Removed all assays. Ctrl+Z to undo.")]);
  };
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} style={{ fontSize: "var(--font-size-sm)", marginBottom: 6 }}>
      <summary style={{ cursor: "pointer", color: "var(--color-text-secondary)" }}>{tr("Imported files & elements — remove…")}</summary>
      {open && (
        <div style={{ paddingTop: 4 }}>
          <div style={{ color: "var(--color-text-muted)", margin: "2px 0" }}>{tr("Files")}</div>
          {files.map((f) => (
            <div key={f.file ?? "(untracked)"} style={row}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.file ?? tr("Imported before GeoStrix recorded file names")}>{f.file ?? tr("(imported earlier — file not recorded)")}</span>
              <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>{f.intervals.toLocaleString()}</span>
              <button type="button" style={xBtn} onClick={() => removeFile(f)} aria-label={tr("Remove assays from {v}", { v: f.file ?? tr("files imported earlier") })} title={tr("Remove this file's assay intervals")}><X size={14} /></button>
            </div>
          ))}
          <div style={{ color: "var(--color-text-muted)", margin: "6px 0 2px" }}>{tr("Elements")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {assayElements.map((e) => (
              <span key={e.symbol} style={{ display: "inline-flex", alignItems: "center", gap: 2, border: "1px solid var(--color-border)", borderRadius: 4, padding: "1px 2px 1px 6px" }}>
                {e.symbol}
                <button type="button" style={xBtn} onClick={() => removeElement(e.symbol)} aria-label={tr("Remove element {symbol}", { symbol: e.symbol })} title={tr("Remove {symbol} from every interval", { symbol: e.symbol })}><X size={12} /></button>
              </span>
            ))}
          </div>
          <button type="button" onClick={removeAll} style={{ marginTop: 8, width: "100%", padding: "5px 8px", border: "1px solid var(--color-danger-fg)", color: "var(--color-danger-fg)", background: "var(--color-bg)", borderRadius: 5, cursor: "pointer" }}>{tr("Remove all assays")}</button>
        </div>
      )}
    </details>
  );
}
