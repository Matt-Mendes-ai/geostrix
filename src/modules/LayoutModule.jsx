import React, { useState, useRef, useEffect, useMemo } from "react";
import { customLegendGroups } from "../lib/customColour.js"; // TASKS.csv #2472
import { Ribbon, RibbonGroup, RibbonButton } from "../components/Ribbon.jsx"; // TASKS.csv #458
import { confirmDestructive } from "../lib/confirmDestructive.js"; // TASKS.csv #386
import { MapPinned, Plus, X, Maximize2, Sheet, Image as ImageIcon, Type, Compass, Ruler, FileDown, MonitorPlay, RefreshCw, Grid3x3, Trash2, Square, ArrowUpRight, Pencil, MessageSquare, Save, FolderOpen, LogIn, Bold, Italic, AlignLeft, AlignCenter, AlignRight, Camera, LayoutGrid, Lock, LayoutTemplate, Download, Upload, HardDrive } from "../components/icons.js";
import { newTitleBlock, STOCK_TEMPLATES, stockTemplateElements, templateFile, parseTemplateFile, templateElements } from "../lib/layoutTitleBlock.js"; // TASKS.csv #1868; templateElements: #1487
import ComputerTemplates from "../components/ComputerTemplates.jsx"; // TASKS.csv #1487
import { keepTemplateOnComputer } from "../lib/computerTemplates.js"; // TASKS.csv #1487
import { hasComputerTemplates } from "../lib/desktop.js"; // TASKS.csv #1487
import GenerateAtlasModal from "../components/GenerateAtlasModal.jsx";
import PatternSwatch from "../components/PatternSwatch.jsx"; // TASKS.csv #1995
import { savePDF, saveFile, exportPDFData, canvasPngBytes, sendSectionResnap } from "../lib/desktop.js"; // saveFile / exportPDFData: TASKS.csv #909 Export PNG; canvasPngBytes: #1040; sendSectionResnap: #1485
import { pdfOptions } from "../lib/pageFormats.js"; // TASKS.csv #511
import { useStore, useSetTaskProgress } from "../lib/store.jsx"; // useSetTaskProgress: #1644
import PromptModal from "../components/PromptModal.jsx";
import { minMax, LAYER_META } from "../lib/layers.js";
import { categoryLegendGroups, assayLegendGroups, voxelLegendGroups, rasterLegendGroups, legendGroupsToItems, LEGEND_CATEGORY_KEYS, mapLayerLegendGroups, boundaryLegendGroups, swatchShape, capLegendGroups, outcropLegendGroup } from "../lib/legendGroups.js"; // TASKS.csv #725; #948; #1633; outcropLegendGroup: #1437
import { niceScaleNumber } from "../lib/figureScale.js"; // TASKS.csv #311 — shared with the 3D viewport's scale bar
import { collarTableSlice, continuationTables, collarsWithSurveyAttitude } from "../lib/collarTable.js"; // TASKS.csv #1638; collarsWithSurveyAttitude: #2133
import { fitDrillPlan, filterHoles, allHolesSteep, STEEP_DIP } from "../lib/drillPlan.js"; // TASKS.csv #1639; allHolesSteep: #2473
import DrillPlanColourControls from "../components/DrillPlanColourControls.jsx"; // TASKS.csv #2473
import DrillPlanElement, { drillPlanDrawing } from "../components/DrillPlanElement.jsx"; // TASKS.csv #1639
import { withLiveScaleBars, relinkCopies, tieStarterFurniture, northRotationOf, insertScaleBar, scaleBarTargets, bindScaleBar } from "../lib/layoutLinks.js"; // TASKS.csv #909 / #920 / #924 / #1632
import { legibleGridStep, keepLabelsApart } from "../lib/layoutGeometry.js"; // TASKS.csv #1488
import { worldToVp, capturedSize, metresPerPagePx, groundFrameSize, obliqueCapture, viewportScaleText, pageScaleText, utmGridReady, niceGridStep, overviewPolygon, holesInFrame, snapToGuides, sectionScaleDenom, sectionWidthForScale, sectionScaleText, sectionTextPt, sectionTextFactor, isDepthImage, depthScaleDenom, depthHeightForScale } from "../lib/layoutGeometry.js"; // TASKS.csv #961 / #946; sectionTextPt: #1485; section scale: #944
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements

// A simple drag-and-drop page-layout canvas. Elements are absolutely positioned on an A4-landscape
// page; "Export PDF" prints the page via the Electron main process (or the browser print dialog).

import { PAGE_FORMATS, pageFormatOf, pagePx, pageMm, pageCssName } from "../lib/pageFormats.js"; // TASKS.csv #398; mm / named pages: #908
import { azimuthToGridOffset, setIgrfModule } from "../lib/azimuthRef.js"; // TASKS.csv #399 — GN/TN/MN diagram
import { localDate, collarDrillDate, schematicAngles, rayTip, yearLater, keepOnSheet, DIAGRAM_W, DIAGRAM_H, ORIGIN } from "../lib/northDiagram.js"; // TASKS.csv #1773 / #2137 / #2310 / #2478 / #2613
import * as igrfModule from "../lib/igrf.js"; // #552 — Layout is a lazy chunk: it brings IGRF with it
setIgrfModule(igrfModule);
import { printPt, printPx, colors } from "../lib/theme.js"; // TASKS.csv #585 — page text on the PRINT scale (was #385 screen sizes)
// TASKS.csv #966 — one ink for page text and frames (was #222, #1a1a1a and #1a2028 side by side), and page text sizes in
// points on the #585 print scale: legend items / headings / ramp labels and callouts 8 pt, the legend title and a new
// text box 10 pt, a table 8 pt by default (was 7, the caption step). Title / text boxes store px (as before, so saved
// pages keep their look) and the sidebar edits them in pt.
const INK = colors.text;
const PX_PER_PT = 96 / 72;
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786 — messages in the interface language
import { crsName } from "../lib/reproject.js"; // TASKS.csv #947
import { projectCredits } from "../lib/credits.js"; // TASKS.csv #949
import { groupSectionLegend } from "../lib/sectionLegend.js"; // TASKS.csv #1127 / #1128
import { firstLegendGroups, rankLegendGroups, legendGroupCount } from "../lib/legendGroups.js"; // rank / count: #1482 // TASKS.csv #1224
import { numericLayerLegendGroups } from "../lib/legendGroups.js"; // TASKS.csv #1482 — the RQD / recovery / SG / mag susc ramps
import { frameTest, samplesInFrame, mapLayersInFrame } from "../lib/legendFrame.js"; // TASKS.csv #2134
import { legendFit } from "../lib/legendFit.js"; // TASKS.csv #2134
import { holeAttitudeAssumed } from "../lib/desurvey.js"; // TASKS.csv #2134 — the notice counts the assumed-vertical holes
import { freeSpot, placeCollarTable } from "../lib/layoutPlace.js"; // TASKS.csv #1484 — new items into free space; #2135 the collar table
import { roundScale } from "../lib/layoutGeometry.js"; // TASKS.csv #1486
import { numericClips, numericLayerColorFn } from "../lib/numericClip.js"; // TASKS.csv #1482
import { categoryColor, categoryLabel } from "../lib/layers.js"; // TASKS.csv #1289
import { legendSyncState, staleBoundLegends } from "../lib/layoutLegendSync.js"; // TASKS.csv #2471
import { roundLongNumbersInSnapshot } from "../lib/svgNumbers.js"; // TASKS.csv #2603
// (The page size used to be a fixed `const A4 = { w: 1123, h: 794 }` here; it is now per page — see
// `A4` inside the component, kept under that name so every existing use follows the chosen format.)
const SCALE_BAR_PX = 180; // default/initial bar length (px) for a freshly-added, never-synced scale bar
const PX_PER_MM = 96 / 25.4; // matches the ~96dpi assumption used throughout Layout (scale bar, viewport scale estimate)
const DEFAULT_PX_PER_METER = SCALE_BAR_PX / 100; // a plain "Add scale bar" starts at 100 m / 180 px, same as before this element gained a real px-per-metre ratio
// TASKS.csv #907 — the plot scales exploration figures are drawn at (Matt: "set a scale eg 1:5000, 1:10000")
const SCALE_PRESETS = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 250000, 500000, 1000000]; // 250k-1M: #2132 (a district fit read 'custom')

// "Customize the scale bar by changing the number, but without changing the scale — if I change 200
// to 300 the SIZE of the bar has to change." A scale element now carries pxPerMeter: how many on-page
// pixels one real-world metre occupies, fixed at whatever the last sync established (or the default
// above for a freeform bar that's never been synced to a view). The bar's rendered length is always
// `meters * pxPerMeter` (see the "scale" branch of LayoutElement below) — so typing a new distance
// into the "Scale length (m)" field grows/shrinks the bar to match, instead of silently relabeling a
// fixed-width bar with a number that no longer matches its own printed length.
// TASKS.csv #311 — niceScaleNumber used to be defined right here. It moved to src/lib/figureScale.js
// (imported above, unchanged in behaviour) when #311 put a scale bar in the 3D viewport itself: the
// viewport bar and this page's bar now round and derive metres-per-pixel through the SAME module, so
// the two can never quietly disagree about what a metre is.

// TASKS.csv #923 — the seq of the last print request carried out; module scope, so it outlives a remount
let handledPrintSeq = null;
// TASKS.csv #956 — the collar table re-rendered on every mousemove of any drag and re-sorted every collar with
// localeCompare(…, { numeric: true }), which builds a collator per comparison (5,000 collars: ~410 ms a render). One
// shared collator, and the sorted copy is cached per collars array (a new array only when the collars change).
const holeCollator = new Intl.Collator(undefined, { numeric: true });
const sortedCollarsCache = new WeakMap();
function sortedCollars(collars) {
  let cs = sortedCollarsCache.get(collars);
  if (!cs) { cs = [...collars].sort((a, b) => holeCollator.compare(String(a.hole_id), String(b.hole_id))); sortedCollarsCache.set(collars, cs); }
  return cs;
}

// TASKS.csv #1484 — Layout's own copy / paste buffer (elements as JSON), kept for the app session across pages and tabs
let layoutClipboard = null;

export default function LayoutModule() {
  const {
    pendingLayoutImages, consumeLayoutImage,
    themes, requestViewportRender, goToModule,
    layoutSelectRequest, setLayoutSelectRequest,
    // TASKS.csv #68 — page contents now live in the store (layoutElements/setLayoutElements),
    // renamed locally to `elements`/`setElements` so the rest of this file — written against a plain
    // local useState — didn't need to change. Previously this was `useState([...4 starter
    // elements])` right here, which reset to that same starter set every time LayoutModule
    // unmounted (i.e. every trip to another tab, including the Viewer round-trip that "Add
    // viewport"/"Refresh" themselves force) — a real layout could be wiped out just by using its own
    // core feature. Now it survives tab switches and round-trips through project save/load.
    layoutElements: elements, setLayoutElements: setElements,
    layoutTemplates, addLayoutTemplate, deleteLayoutTemplate,
    // TASKS.csv #69 — multiple layout pages per project (see store.jsx's own comment on
    // layoutPages/layoutElements for how these two coexist: `elements`/`setElements` above already
    // transparently follow whichever page is active).
    layoutPages, activeLayoutPageId, switchLayoutPage, addLayoutPage, addLayoutPages, renameLayoutPage, deleteLayoutPage, setLayoutPageFormat, sendLayoutElement, // #1484
    // Legend "load lithologies from the bound view" (below) needs the actual litho rows — a theme
    // only records which units were filtered/hidden at capture time, not the vocabulary itself.
    // TASKS.csv #130 — collars/sections needed for the Atlas batch-page-generation feature below.
    layers, collars, sections, project, survey, // survey: #1476
    surfaceSamples, boundaries, // TASKS.csv #907 — what "Fit the holes" fits when there are no holes
    mapLayers, surfaceSampleLegend, // TASKS.csv #948 — the Surface Geology map's legend groups
    surfaceStructures, // TASKS.csv #1437 — the outcrop sets' legend group
    assays, assayElements, voxelModels, // TASKS.csv #725 — the legend loads assay classes and block-model keys too
    // TASKS.csv #101 — same "must survive the Viewer round-trip unmount" reasoning as elements/
    // layoutSelectRequest above: local state here would silently drop the grid's viewport binding
    // every time Enter/Refresh switches away to the 3D View tab and back.
    gridBoundViewportId, setGridBoundViewportId, gridMeters, setGridMeters,
    layoutPrintRequest, requestLayoutPrint, // TASKS.csv #908
    terrain, rasters, // TASKS.csv #949 — {credits}
    viewerUiState, // TASKS.csv #1092 — legendOverride for the Atlas strip logs
    customLayers = [], // TASKS.csv #2472 — the custom layers' legend groups
    viewportBatchDone, setViewportBatchDone, // TASKS.csv #1644 — an atlas's maps centred on their holes
  } = useStore();
  const setTaskProgress = useSetTaskProgress();
  useEffect(() => { if (viewportBatchDone) setTaskProgress?.(null); }, [viewportBatchDone, setTaskProgress]);
  const [selected, setSelected] = useState(null);
  // TASKS.csv #398 — the active page's paper size in screen px (96 dpi); named A4 for the existing uses.
  const activePage = layoutPages.find((pg) => pg.id === activeLayoutPageId);
  const pageFormat = pageFormatOf(activePage);
  const A4 = pagePx(pageFormat);
  const [atlasModalOpen, setAtlasModalOpen] = useState(false); // TASKS.csv #130
  // TASKS.csv #909 — zoom of the layout canvas (QGIS: the sheet scaled to the window; an A3 did not fit a laptop and
  // scrolled). "fit" shows the whole sheet (never above 100 %); the sheet itself stays 96-dpi px, scaled with a CSS
  // transform, and every mouse coordinate on it divides by the zoom (zoomRef, read inside the drag / resize / freehand
  // handlers). Remembered on this computer, not in the project.
  const [zoomChoice, setZoomChoice] = useState(() => { try { return localStorage.getItem("geostrix.layoutZoom") || "fit"; } catch { return "fit"; } });
  const setZoom = (v) => { setZoomChoice(v); try { localStorage.setItem("geostrix.layoutZoom", v); } catch { /* storage unavailable */ } };
  const areaRef = useRef(null);
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setAreaSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setAreaSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const fitZoom = areaSize.w ? Math.max(0.1, Math.min(1, (areaSize.w - 78) / A4.w, (areaSize.h - 78) / A4.h)) : 1;
  const zoom = zoomChoice === "fit" ? fitZoom : Number(zoomChoice) || 1;
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  // TASKS.csv #909 — "Export PNG" resolution (dpi), remembered on this computer
  const [pngDpi, setPngDpi] = useState(() => { try { return Number(localStorage.getItem("geostrix.layoutPngDpi")) || 300; } catch { return 300; } });
  // TASKS.csv #908 — Export PDF prints a PRINT ROOT, not the live screen. The old path printed the window through the
  // @media print stylesheet: the rulers, the Simple / Advanced toggle and a tab button survived (3 pages, the first two
  // near-empty), the sheet sat 12 mm off the paper's corner, and Chromium shrank the overflowing content by 0.3 % to
  // fit - so a 1:5,000 plot was not 1:5,000. Now every page is rendered at exactly its paper size in mm with its own
  // @page size (preferCSSPageSize), the chrome is hidden by class, and the file is named after the project.
  const [printing, setPrinting] = useState(null);
  const [exportNote, setExportNote] = useState(null); // { text, error } shown in the page bar (notices are per module, not in the store)
  const printRootRef = useRef(null);
  useEffect(() => { if (!exportNote) return undefined; const t = setTimeout(() => setExportNote(null), 12000); return () => clearTimeout(t); }, [exportNote]);
  // TASKS.csv #923 — one export per request: the store keeps the last request, and this module remounts on every visit
  // to the Layout tab, so "if (layoutPrintRequest)" re-ran the last PDF / PNG export (save dialog and all) each time
  useEffect(() => {
    if (!layoutPrintRequest || layoutPrintRequest.seq === handledPrintSeq) return;
    handledPrintSeq = layoutPrintRequest.seq;
    // TASKS.csv #1481 (review #1352) — anything past the paper's edge was cut from the PDF / PNG in silence (a 73-row legend, an
    // arrow left outside after a switch to portrait): the page on screen is measured first, and the export asks
    const pg = pageRef.current;
    if (pg) {
      const r = pg.getBoundingClientRect();
      const off = [...pg.querySelectorAll("[data-el-id]")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 1 || b.bottom > r.bottom + 1 || b.left < r.left - 1 || b.top < r.top - 1); }).length;
      if (off && !window.confirm(tr("{n} element(s) on this page reach past its edge and will be cut off in the export. Export anyway?", { n: off }))) return;
    }
    // TASKS.csv #2471 — a legend whose viewport was refreshed after it was loaded, and whose rows were edited, still lists the old view
    const staleLegends = staleBoundLegends(layoutPages).length;
    if (staleLegends && !window.confirm(tr(staleLegends === 1 ? "{n} legend is out of step with its viewport: the viewport was refreshed after the legend was loaded, and the legend's rows were edited, so they were kept. Export anyway?" : "{n} legends are out of step with their viewports: each viewport was refreshed after its legend was loaded, and the legend's rows were edited, so they were kept. Export anyway?", { n: staleLegends }))) return;
    setPrinting(layoutPrintRequest);
  }, [layoutPrintRequest]);
  useEffect(() => {
    if (!printing) return;
    let cancelled = false;
    (async () => {
      try {
        const imgs = [...(printRootRef.current?.querySelectorAll("img") || [])];
        await Promise.all(imgs.map((im) => im.decode().catch(() => null)));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (cancelled) return;
        const base = String(project?.name || "layout").replace(/[^\w.-]+/g, "_");
        if (printing.kind === "png") {
          // TASKS.csv #909 — the current page as a PNG at pngDpi: the same print as the PDF, rendered by pdfjs (the
          // #633 reader), so the image is the printed page pixel for pixel - text, grid lines and all
          const pageNo = Math.max(1, layoutPages.findIndex((pg) => pg.id === activeLayoutPageId) + 1);
          const r = await exportPDFData({ preferCSSPageSize: true });
          if (!r?.ok) throw new Error(r?.message || tr("The image export needs the desktop app."));
          const bytes = r.bytes; // #922 — a Uint8Array from the main process, no base64
          const { openPdf, renderPdfPage } = await import("../lib/pdfPages.js");
          const doc = await openPdf(bytes);
          const [wmm, hmm] = pageMm(layoutPages[pageNo - 1]?.format);
          const dpi = printing.dpi || 300;
          const canvas = await renderPdfPage(doc, pageNo, (Math.max(wmm, hmm) / 25.4) * dpi);
          const png = await canvasPngBytes(canvas); // #1040 — an A3 page at 300 dpi is ~17 Mpx
          const name = `${base}_p${pageNo}_${dpi}dpi.png`;
          const res = await saveFile({ quiet: "success", suggestedName: name, filters: [{ name: "PNG", extensions: ["png"] }], content: png });
          if (res?.ok) setExportNote({ text: tr("Exported page {n} as a {w} × {h} px PNG ({dpi} dpi) to {path}.", { n: pageNo, w: canvas.width, h: canvas.height, dpi, path: res.filePath || name }), error: false });
          return;
        }
        const name = `${base}.pdf`;
        const res = await savePDF(name, { ...pdfOptions(layoutPages[0]?.format), preferCSSPageSize: true });
        if (res?.ok) setExportNote({ text: tr("Exported {n} page(s) to {path}.", { n: layoutPages.length, path: res.filePath || name }), error: false });
      } catch (e) { setExportNote({ text: e.message || String(e), error: true }); }
      finally { if (!cancelled) setPrinting(null); }
    })();
    return () => { cancelled = true; };
  }, [printing]);
  // User request: "let's make some keyboard shortcuts. Like on layout we could have delete key to
  // delete the selected item, and ctrl + click to select multiple items." `selected` stays the single
  // "active" element (the one the properties sidebar edits — multi-selection doesn't get its own bulk-
  // edit panel, out of scope here). `multiSelected` is a separate id set for bulk delete/move only;
  // it's empty/single-member in the normal case and only becomes meaningful once the user starts
  // Ctrl+clicking a second element.
  const [multiSelected, setMultiSelected] = useState(() => new Set());
  // User-facing feedback for the scale-bar/legend sync actions — these used to fail silently (a
  // missing theme, a hidden layer, no captured scale yet), which reads as "the button just doesn't do
  // anything." Now every path — success or a specific reason it can't — sets a short message shown
  // right under the button; cleared when selection changes so a stale message from a different element
  // doesn't linger.
  const [syncNotice, setSyncNotice] = useState("");
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();
  const dragState = useRef(null);
  const pageRef = useRef(null);
  const logoInput = useRef(null);
  const templateInput = useRef(null); // TASKS.csv #1868 — Import template

  // TASKS.csv #19 — more shapes/annotation tools. Rect/arrow/callout are click-to-place-then-adjust
  // (like every other element here); freehand is the odd one out — it needs to capture a drag
  // gesture rather than being placed then resized, so it gets its own "drawing mode" toggle and
  // window-level mousemove/mouseup listeners (same pattern SectionWindow.jsx's contact-drawing tool
  // uses, just single-shot instead of multi-point-click).
  const [freehandTool, setFreehandTool] = useState(false);
  // TASKS.csv #910 — smart guides: the lines a drag is snapping to right now ([{ axis: "x" | "y", at }], page px)
  const [guides, setGuides] = useState([]);
  const [freehandPoints, setFreehandPoints] = useState([]);
  const freehandDrawing = useRef(false);
  // Bug fix (user report: "free hand tool in layout is creating numerous lines"). Points were tracked
  // ONLY in the freehandPoints state and read back out via a setFreehandPoints functional updater in
  // onUp — which also called setElements/setSelected *inside* that updater. Calling other components'
  // setState from inside a setState updater function runs during React's render phase (confirmed via
  // React's own "Cannot update a component while rendering a different component" console warning,
  // reproduced with Playwright), which is undefined-behavior territory — React is allowed to invoke a
  // functional updater more than once, and each invocation was pushing a fresh freehand element onto
  // the page, so a single stroke could commit itself multiple times. Fixed by tracking the in-progress
  // stroke in a plain ref (read directly in onUp, no functional-updater trick) and only ever calling
  // setElements/setSelected/setFreehandPoints from the actual event handler body, never from inside
  // another setState's updater.
  const freehandPointsRef = useRef([]);

  // TASKS.csv #18 — saved layout templates.
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // TASKS.csv #78 — drag-and-drop image import onto the page (see onPageDrop below).
  const [dragOverPage, setDragOverPage] = useState(false);

  // TASKS.csv #67 — QGIS-style alignment grid + rulers. Local view-state only (like `selected`
  // below), not persisted with the project — a display aid, not page content. gridMm is the grid
  // spacing AND the snap increment when dragging (real print-composer tools tie these together too).
  const [showGrid, setShowGrid] = useState(false);
  const [gridMm, setGridMm] = useState(10);
  // TASKS.csv #101 — the page's own grid was always paper-space (mm), with no way to lay a
  // real-world-scaled grid (e.g. "100m grid") directly over a bound Viewport the way a printed topo
  // sheet would. Binding to a viewport switches the grid's unit from mm to metres and derives its
  // pixel spacing from that viewport's OWN captured scale (worldHeightAtTarget / its pixel height —
  // the same FOV/target-distance math #46/#69 already compute) instead of a fixed mm value — since
  // this is a plain derived read of that element's current state (not copied/cached anywhere), it
  // automatically follows the viewport's scale whenever it's refreshed/rebound. gridBoundViewportId
  // and gridMeters themselves come from the store (destructured above), NOT local useState — see
  // that destructure's own comment for why local state doesn't survive the Enter/Refresh round trip.

  // ---- Viewport element (TASKS.csv #46): bound to a theme (#45), re-rendered on demand via the
  // request/result round-trip in store.jsx (LayoutModule and ViewerModule are never both mounted).
  // TASKS.csv #70 — the pending-request bookkeeping and the "apply the result to layoutElements"
  // logic used to live here as local refs/state, which broke because LayoutModule itself unmounts
  // during the round-trip (see the long comment in store.jsx next to viewportPendingRequest). Both
  // now live in the store, which never unmounts; this component just kicks off the request and
  // consumes `layoutSelectRequest` to select whatever the store just created/refreshed.
  const [themePickerFor, setThemePickerFor] = useState(null); // null | "new" | elementId — which viewport is choosing/rebinding a theme

  // TASKS.csv #16/#17: drain any 3D-viewport / cross-section snapshots that were queued while this
  // module wasn't mounted (ViewerModule and the section pop-out both push onto the store's queue and
  // don't care whether Layout happens to be open). Each becomes an "image" element sized to fit the
  // page while preserving its captured aspect ratio, staggered slightly so several in a row don't
  // land exactly on top of each other.
  useEffect(() => {
    if (!pendingLayoutImages.length) return;
    const maxW = A4.w - 160;
    // TASKS.csv #1485 — a snapshot taken again for an element already on the page replaces its picture (its place and width stay)
    const replacing = pendingLayoutImages.filter((img) => img.replaceElementId && elements.some((el) => el.id === img.replaceElementId));
    if (replacing.length) {
      // Larger text grows the figure's margins, so the new picture spans more metres across: its width is set again for the plot
      // scale the element had, and if the text then prints off 7 pt the section is asked once more (at most 3 rounds; it converges).
      let again = 0;
      const next = new Map();
      for (const img of replacing) {
        const el = elements.find((e) => e.id === img.replaceElementId);
        const aspect = img.naturalW && img.naturalH ? img.naturalW / img.naturalH : el.aspect;
        const world = img.worldWidthAtCaptureM ?? el.worldWidthAtCaptureM, denom = sectionScaleDenom(el);
        const w = denom && world ? Math.round(sectionWidthForScale({ worldWidthAtCaptureM: world }, denom)) : el.w;
        const upd = { ...el, src: img.src, naturalW: img.naturalW, naturalH: img.naturalH, aspect, w, h: Math.round(w / aspect), textFactor: img.textFactor || 1, legendItems: img.legendItems || el.legendItems, worldWidthAtCaptureM: world };
        next.set(el.id, upd);
        const pt = sectionTextPt(upd), round = Number(img.resnapRound) || 0;
        if (pt != null && Math.abs(pt - 7) > 0.7 && round < 3 && upd.sectionTabId) { sendSectionResnap({ tabId: upd.sectionTabId, elementId: upd.id, textFactor: +((upd.textFactor * 7) / pt).toFixed(3), round: round + 1 }); again++; }
      }
      setElements((els) => els.map((el) => next.get(el.id) || el));
      replacing.forEach((img) => consumeLayoutImage(img.id));
      setSyncNotice(again ? tr("Snapshot taken again; adjusting its text once more for the plot scale…") : tr("Snapshot taken again with its text at print size, at the same plot scale."));
    }
    const placedSoFar = [...elements]; // #1484 — each snapshot into the page's free space, not stacked at (90, 90)
    const additions = pendingLayoutImages.filter((img) => !replacing.includes(img)).map((img) => {
      const aspect = img.naturalW && img.naturalH ? img.naturalW / img.naturalH : 16 / 9;
      // TASKS.csv #1480 — a tall image (a strip log) fits the sheet's height too; it ran off the page at 700 px wide
      const maxH = A4.h - 160, w = Math.round(Math.min(maxW, 700, maxH * aspect));
      const h = Math.round(w / aspect);
      const spot = freeSpot(placedSoFar, w, h, A4); placedSoFar.push({ ...spot, w, h });
      // worldWidthAtCaptureM (cross-section snapshots only — see SectionWindow.jsx's
      // snapshotToLayout) is the real-world horizontal span the image represented at its native
      // naturalW pixel width; carried through so a scale bar can be assigned to it below, the same
      // way viewport snapshots already carry worldHeightAtTarget.
      // legendItems (cross-section snapshots only — see SectionWindow.jsx's snapshotToLayout and
      // ViewerModule's buildSectionPayload): the exact {label,color} pairs actually drawn in this
      // section, so a legend bound to this image (see syncLegendFromView below) can match it
      // without needing a live theme, which a flattened snapshot doesn't have.
      return { id: img.id, type: "image", label: img.label || "Snapshot", src: img.src, aspect, x: spot.x, y: spot.y, w, h, worldWidthAtCaptureM: img.worldWidthAtCaptureM ?? null, verticalExaggeration: img.verticalExaggeration ?? null /* #944 */, sectionAzimuth: Number.isFinite(img.sectionAzimuth) ? img.sectionAzimuth : null /* #1489 */, depthHeightAtCaptureM: img.depthHeightAtCaptureM ?? null /* #1480 */, planMap: !!img.planMap /* #1864 */, naturalW: img.naturalW, naturalH: img.naturalH, legendItems: img.legendItems || null, sectionTabId: img.sectionTabId || null, textFactor: img.textFactor || 1 /* #1485 */ };
    });
    // TASKS.csv #1128 — a cross-section snapshot comes with its legend as a Layout element (movable, editable, bound to
    // the snapshot so "Sync" refreshes it), right of the image when it fits on the sheet, else below it
    const legends = additions.filter((a) => a.legendItems?.length).map((a) => {
      const right = a.x + a.w + 16, fits = right + 170 <= A4.w;
      return { id: `legend_${a.id}`, type: "legend", x: fits ? right : a.x, y: fits ? a.y : a.y + a.h + 16, items: groupSectionLegend(a.legendItems), boundViewportId: a.id };
    });
    if (!additions.length) return;
    setElements((els) => additions.reduce((page, a) => tieStarterFurniture(page, a), [...els, ...additions, ...legends])); // #1320
    setSelected(additions[additions.length - 1]?.id ?? null);
    additions.forEach((img) => consumeLayoutImage(img.id));
  }, [pendingLayoutImages, consumeLayoutImage]);

  useEffect(() => { setSyncNotice(""); }, [selected]);

  // TASKS.csv #2603 — a section snapshot already on a sheet keeps the labels it was drawn with: one from before #2515 prints grades as
  // '2.2915408556696244 % Li'. Each snapshot's text is checked once (numbersChecked) and its long numbers rounded as a grade is now.
  useEffect(() => {
    const todo = elements.filter((el) => el.type === "image" && !el.numbersChecked && /^data:image\/svg\+xml;base64,/.test(el.src || ""));
    if (!todo.length) return;
    const fixed = new Map(todo.map((el) => { const r = roundLongNumbersInSnapshot(el.src); return [el.id, r]; }));
    setElements((els) => els.map((el) => (fixed.has(el.id) ? { ...el, numbersChecked: true, ...(fixed.get(el.id).n ? { src: fixed.get(el.id).src, numbersRounded: (el.numbersRounded || 0) + fixed.get(el.id).n } : {}) } : el)));
  }, [elements]);

  // Kick off a (re-)render of a theme for a Viewport element. targetElementId is "new" to create a
  // fresh element once the render comes back, or an existing element's id to refresh it in place.
  // TASKS.csv #69 — trueScale threads through to ViewerModule's capture effect (see store.jsx's
  // requestViewportRender and ViewerModule's viewportRenderRequestSeq effect): when set, the capture
  // uses an orthographic camera instead of the live perspective one, which makes the computed
  // world-scale exact everywhere in the image rather than only approximately right at the camera's
  // target distance (see ViewportControls' scale readout below for the user-facing explanation).
  const startViewportRender = (themeId, targetElementId, trueScale, opts = {}) => {
    // A falsy themeId means "just capture the current live view, no theme involved" — see the new
    // "Add viewport from current view" button and ViewportControls' "— current view (no theme) —"
    // option above. Only a genuinely non-falsy-but-unresolvable themeId (a stale/deleted theme id) is
    // treated as an error here.
    const theme = themeId ? themes.find((t) => t.id === themeId) : null;
    if (themeId && !theme) return;
    if (targetElementId !== "new") {
      setElements((els) => els.map((el) => el.id === targetElementId ? { ...el, themeId, refreshing: true } : el));
    }
    requestViewportRender(themeId, targetElementId, trueScale, false, opts);
    setThemePickerFor(null);
    goToModule("viewer");
  };

  // TASKS.csv #198 (part 3) — "Enter" an existing Viewport for live orbit/pan/zoom instead of an
  // instant re-render. Only makes sense for an EXISTING element (never "new" — you can't enter a
  // viewport that doesn't exist yet), so this only gets wired up from ViewportControls, not the
  // "Add viewport" theme picker. Same shape as startViewportRender, just with interactive:true —
  // ViewerModule's render effect (see its own long comment) does the rest: apply the theme, then
  // wait for the user to exit instead of auto-capturing after 400ms.
  const startInteractiveViewportEdit = (themeId, targetElementId, trueScale, opts = {}) => {
    // TASKS.csv #1006 — Matt: "the enter and adjust view button doesn't work". It returned here for every viewport made
    // from the current view (no theme), which is what Current view and the 3D View's Snapshot create; ViewerModule's
    // session handles no theme (it adjusts the live view). Only a theme that no longer exists stops it, as in
    // startViewportRender.
    const theme = themeId ? themes.find((t) => t.id === themeId) : null;
    if (themeId && !theme) return;
    setElements((els) => els.map((el) => el.id === targetElementId ? { ...el, themeId, refreshing: true } : el));
    requestViewportRender(themeId, targetElementId, trueScale, true, opts);
    setThemePickerFor(null);
    goToModule("viewer");
  };

  // Store applies the render result to layoutElements itself (it survives the unmount this round-trip
  // causes) and drops the target element's id into layoutSelectRequest as a one-shot "select this
  // when you're next mounted" signal — pick it up and clear it so it doesn't re-fire.
  useEffect(() => {
    if (!layoutSelectRequest) return;
    setSelected(layoutSelectRequest);
    setLayoutSelectRequest(null);
  }, [layoutSelectRequest, setLayoutSelectRequest]);

  const onDown = (e, el) => {
    // Ctrl/Cmd+click toggles this element in/out of the multi-selection instead of starting a drag or
    // replacing the current selection — the standard "add to selection" gesture (Illustrator, Figma,
    // QGIS's own print composer). Seeds the group from whatever was singly-selected before the first
    // Ctrl+click, so "select A, then Ctrl+click B" ends up with {A,B} selected, not just {B}.
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      setMultiSelected((prev) => {
        const base = prev.size > 1 ? prev : new Set(selected ? [selected] : []);
        const next = new Set(base);
        if (next.has(el.id)) next.delete(el.id); else next.add(el.id);
        return next;
      });
      setSelected(el.id);
      return;
    }
    const isGroupDrag = multiSelected.has(el.id) && multiSelected.size > 1;
    if (!isGroupDrag) setMultiSelected(new Set());
    setSelected(el.id);
    if (el.locked) return; // TASKS.csv #909 — selectable and editable, not movable
    const rect = pageRef.current.getBoundingClientRect();
    dragState.current = isGroupDrag
      ? {
          id: el.id, offX: (e.clientX - rect.left) / zoomRef.current - el.x, offY: (e.clientY - rect.top) / zoomRef.current - el.y, // / zoom: #909
          groupOrigin: new Map(elements.filter((e2) => multiSelected.has(e2.id) && !e2.locked).map((e2) => [e2.id, { x: e2.x, y: e2.y }])), // locked members stay: #909
        }
      : { id: el.id, offX: (e.clientX - rect.left) / zoomRef.current - el.x, offY: (e.clientY - rect.top) / zoomRef.current - el.y, groupOrigin: null, guide: dragGuide(el) };
  };
  // TASKS.csv #910 — what a single drag can snap to: the other elements' edges and centres (as drawn), the page's edges,
  // centre and 10 mm margins; plus where the dragged element's drawn box sits relative to its x / y
  const dragGuide = (el) => {
    const b = boxOf(el.id);
    if (!b) return null;
    const m = 10 * PX_PER_MM;
    const xs = [0, m, A4.w / 2, A4.w - m, A4.w], ys = [0, m, A4.h / 2, A4.h - m, A4.h];
    for (const o of elements) {
      if (o.id === el.id) continue;
      const ob = boxOf(o.id);
      if (!ob) continue;
      xs.push(ob.x, ob.x + ob.w / 2, ob.x + ob.w); ys.push(ob.y, ob.y + ob.h / 2, ob.y + ob.h);
    }
    return { bx: b.x - el.x, by: b.y - el.y, bw: b.w, bh: b.h, xs, ys };
  };
  // TASKS.csv #907 — "Fit the holes": the smallest round scale (1 / 1.5 / 2 / 2.5 / 3 / 4 / 5 / 6 / 8 x 10^n - finer than
  // the presets, since a wide landscape frame over N-S data jumped from a needed 1:25,934 straight to 1:50,000) at which
  // the project's located data - collars, else surface samples, else boundaries - fits this frame with a 10 % margin, seen
  // the way the viewport's last capture looked (its azimuth), centred on that data, then a refresh at that scale and
  // centre. The check is in plan: for an oblique view the vertical extent is not a map distance, so it is approximate
  // there and exact for a top-down view.
  const fitViewport = async (sel) => {
    const pts = [];
    // TASKS.csv #2304 (review #2174) — the points of the holes drawn as assumed verticals (no survey, no azimuth / dip) kept apart too, so
    // the note blames them only when they do widen the frame (on the WA project they sit inside the fans)
    const surveyedIds = new Set((survey || []).map((s) => s.hole_id));
    const isAssumed = (c) => !surveyedIds.has(c.hole_id) && (!Number.isFinite(c.azimuth) || !Number.isFinite(c.dip));
    const assumedIds = new Set((collars || []).filter(isAssumed).map((c) => c.hole_id)), ptsDrilled = [];
    for (const c of collars || []) if (Number.isFinite(c.x) && Number.isFinite(c.y)) { pts.push([c.x, c.y]); if (!assumedIds.has(c.hole_id)) ptsDrilled.push([c.x, c.y]); }
    // #1476 — the holes, not only their collars: Silvertip's 1,300 m fans ran off the frame. Each desurveyed trace point counts.
    const { holeTraces } = await import("../lib/evidenceSources.js"); // loaded on use: not on the startup path
    for (const [hid, t] of holeTraces(collars, survey, project?.desurveyMethod)) for (const p of t) if (Number.isFinite(p.x) && Number.isFinite(p.y)) { pts.push([p.x, p.y]); if (!assumedIds.has(hid)) ptsDrilled.push([p.x, p.y]); }
    // #1866 (review #1646, Kodiak) — no holes: the visible block models' ground footprint first (the 2 km IP model was a speck at
    // 1:300,000 when the 19 x 31 km soil program decided the fit), then the samples, the map layers, the boundaries
    if (!pts.length) { const { modelFootprint } = await import("../lib/surfacePlan.js"); for (const m of voxelModels || []) { if (m.visible === false) continue; const b = modelFootprint(m); if (b) pts.push([b[0], b[1]], [b[2], b[3]]); } }
    if (!pts.length) for (const s of surfaceSamples || []) if (Number.isFinite(s.x) && Number.isFinite(s.y)) pts.push([s.x, s.y]);
    if (!pts.length) for (const l of mapLayers || []) if (l.visible !== false && Array.isArray(l.bbox)) pts.push([l.bbox[0], l.bbox[1]], [l.bbox[2], l.bbox[3]]);
    if (!pts.length) for (const b of boundaries || []) for (const pl of b.polylines || []) for (const p of pl) if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) pts.push([p.x, p.y]);
    if (!pts.length) { setSyncNotice(tr("Nothing to fit: the project has no located data yet.")); return; }
    const beta = (-(sel.cameraAzimuthDeg || 0) * Math.PI) / 180, cb = Math.cos(beta), sb = Math.sin(beta);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [E, N] of pts) { const u = E * cb - N * sb, v = -(E * sb + N * cb); if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    const um = (u0 + u1) / 2, vm = (v0 + v1) / 2; // the box's middle, back to world (the inverse of the rotation above)
    const centreWorld = { x: um * cb - vm * sb, y: -(um * sb + vm * cb) };
    const frameWm = (sel.w / 96) * 0.0254, frameHm = (sel.h / 96) * 0.0254;
    const roundScaleFor = (U0, U1, V0, V1) => { const nd = Math.max(((U1 - U0) * 1.1) / frameWm, ((V1 - V0) * 1.1) / frameHm, 1); const mg = 10 ** Math.floor(Math.log10(nd)); return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => Math.round(m * mg)).find((n) => n >= nd); };
    const scale = roundScaleFor(u0, u1, v0, v1);
    // #2304 — the scale the drilled holes alone would take: the assumed ones widen the frame only when it is smaller
    let scaleDrilled = scale;
    if (assumedIds.size && ptsDrilled.length && ptsDrilled.length < pts.length) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [E, N] of ptsDrilled) { const u = E * cb - N * sb, v = -(E * sb + N * cb); if (u < a0) a0 = u; if (u > a1) a1 = u; if (v < b0) b0 = v; if (v > b1) b1 = v; }
      scaleDrilled = roundScaleFor(a0, a1, b0, b1);
    }
    // TASKS.csv #2132 (review #2013, Woodjam) — what was fitted, kept on the viewport and shown under the Fit button while the scale is the
    // fitted one: 534 district collars with no survey and no azimuth / dip (drawn as assumed vertical holes since #2014) took the fit to
    // 1:500,000 with the 10 drilled holes as specks, and nothing said why. (A notice would be cleared by the refresh re-selecting the frame.)
    const nHoles = (collars || []).filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y)).length;
    const assumed = (collars || []).filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y) && assumedIds.has(c.hole_id)).length;
    updateSelected({ fixedScale: scale, trueScale: true, fitInfo: nHoles ? { scale, holes: nHoles, assumed, ...(assumed && scaleDrilled < scale ? { drilledScale: scaleDrilled } : {}) } : null }); // drilledScale: #2304
    startViewportRender(sel.themeId, sel.id, true, { fixedScale: scale, elementW: sel.w, elementH: sel.h, centreWorld });
  };
  // TASKS.csv #906 — a resize handle was pressed (see Handles / the resize branch of the drag effect above)
  const onResizeStart = (e, el, handle) => {
    setSelected(el.id);
    setMultiSelected(new Set());
    const rect = pageRef.current.getBoundingClientRect();
    const z = zoomRef.current; // #909
    const px = (e.clientX - rect.left) / z, py = (e.clientY - rect.top) / z;
    const box = e.currentTarget.parentElement?.getBoundingClientRect();
    const w0 = el.w ?? (box ? box.width / z : 100), h0 = el.h ?? (box ? box.height / z : 0);
    let arrow = null;
    if (el.type === "arrow") { // the tail's page position: it stays put while the tip is dragged
      const rad = (el.angle * Math.PI) / 180, ax = Math.cos(rad) * el.length, ay = Math.sin(rad) * el.length, pad = 12;
      arrow = { x: el.x + (ax < 0 ? Math.abs(ax) + pad : pad), y: el.y + (ay < 0 ? Math.abs(ay) + pad : pad) };
    }
    const g = dragGuide(el); // #910 — the edges snap to the same lines (x / y of the box itself are the element's)
    dragState.current = { resize: handle, id: el.id, startX: px, startY: py, x0: el.x, y0: el.y, w0, h0, lockAspect: ASPECT_LOCKED.has(el.type) || e.shiftKey, widthOnly: WIDTH_ONLY.has(el.type), arrow, guide: g };
  };
  // TASKS.csv #101 — derived (not stored) so it always reflects the bound viewport's LATEST scale.
  // Falls back to null (and the grid behaves exactly as before, mm-based) if nothing's bound, the
  // bound element was deleted, or that viewport hasn't been rendered yet (no worldHeightAtTarget/h
  // to compute a scale from).
  const boundViewportEl = gridBoundViewportId ? elements.find((el) => el.id === gridBoundViewportId && el.type === "viewport") : null;
  const metersPerPx = boundViewportEl ? metresPerPagePx(boundViewportEl) : null; // capH: #906
  const gridSnapPx = metersPerPx ? gridMeters / metersPerPx : gridMm * PX_PER_MM;
  // A bound viewport that gets deleted (or was never a viewport to begin with) shouldn't leave a
  // stale, silently-ignored id sitting in the picker — snap back to "None" so the UI stays truthful.
  useEffect(() => {
    if (gridBoundViewportId && !boundViewportEl) setGridBoundViewportId("");
  }, [gridBoundViewportId, boundViewportEl]);

  // Bound at the window level (not just on the page div) so a fast drag that outruns the cursor past
  // the page edge — or into the sidebar — doesn't leave dragState "stuck": mousemove/mouseup only
  // fired while the cursor stayed over .ge-main before, so releasing the button anywhere else left
  // the element following the cursor indefinitely until the next click landed back inside .ge-main.
  useEffect(() => {
    const snapPx = gridSnapPx;
    const onMove = (e) => {
      if (!dragState.current || !pageRef.current) return;
      const rect = pageRef.current.getBoundingClientRect();
      const z = zoomRef.current; // #909
      let x = (e.clientX - rect.left) / z - dragState.current.offX;
      let y = (e.clientY - rect.top) / z - dragState.current.offY;
      if (showGrid) { x = Math.round(x / snapPx) * snapPx; y = Math.round(y / snapPx) * snapPx; }
      // TASKS.csv #910 — smart guides (grid off; Alt drags freely): the dragged box's left / centre / right and top /
      // middle / bottom snap to the other elements' and the page's lines within 5 screen px
      const g = dragState.current.guide;
      if (g && !showGrid && !dragState.current.resize && !e.altKey) {
        const thr = 5 / z;
        const sx = snapToGuides([x + g.bx, x + g.bx + g.bw / 2, x + g.bx + g.bw], g.xs, thr);
        const sy = snapToGuides([y + g.by, y + g.by + g.bh / 2, y + g.by + g.bh], g.ys, thr);
        x += sx.delta; y += sy.delta;
        const next = [...(sx.at != null ? [{ axis: "x", at: sx.at }] : []), ...(sy.at != null ? [{ axis: "y", at: sy.at }] : [])];
        setGuides((p) => (p.length === next.length && p.every((q, i) => q.axis === next[i].axis && q.at === next[i].at) ? p : next));
      }
      x = Math.round(x); y = Math.round(y);
      // TASKS.csv #906 — a handle drag: the moving edge(s) follow the cursor (snapped to the grid when it is on); Shift,
      // or a type whose aspect is locked (an image, a logo), keeps the shape; an arrow's tip drag re-aims and re-lengthens
      // it around its tail. x / y / w are whole px; the height of an aspect-locked box is kept exact (#398: rounding it
      // would shift 1:1000 to 1:998).
      if (dragState.current.resize) {
        const d = dragState.current, hnd = d.resize;
        const px = (e.clientX - rect.left) / zoomRef.current, py = (e.clientY - rect.top) / zoomRef.current; // #909
        if (d.arrow) {
          const vx = px - d.arrow.x, vy = py - d.arrow.y;
          const length = Math.max(10, Math.hypot(vx, vy)), angle = (Math.atan2(vy, vx) * 180) / Math.PI;
          const ax = Math.cos((angle * Math.PI) / 180) * length, ay = Math.sin((angle * Math.PI) / 180) * length, pad = 12;
          const x1 = ax < 0 ? Math.abs(ax) + pad : pad, y1 = ay < 0 ? Math.abs(ay) + pad : pad;
          setElements((els) => els.map((el) => el.id === d.id ? { ...el, length: Math.round(length), angle: Math.round(angle * 10) / 10, x: Math.round(d.arrow.x - x1), y: Math.round(d.arrow.y - y1) } : el));
          return;
        }
        const dx = px - d.startX, dy = py - d.startY, minW = 20, minH = 20;
        // #910 — with the grid off a moving edge snaps to the smart guides instead (Alt: freely)
        const hits = [];
        const guideSnap = (v, axis) => {
          if (!d.guide || e.altKey) return v;
          const r = snapToGuides([v], axis === "x" ? d.guide.xs : d.guide.ys, 5 / zoomRef.current);
          if (r.at != null) hits.push({ axis, at: r.at });
          return v + r.delta;
        };
        const snapX = (v) => (showGrid ? Math.round(v / snapPx) * snapPx : guideSnap(v, "x"));
        const snapY = (v) => (showGrid ? Math.round(v / snapPx) * snapPx : guideSnap(v, "y"));
        let x = d.x0, y = d.y0, w = d.w0, h = d.h0;
        if (hnd.includes("e")) w = Math.max(minW, snapX(d.x0 + d.w0 + dx) - d.x0);
        if (hnd.includes("w")) { const nx = Math.min(snapX(d.x0 + dx), d.x0 + d.w0 - minW); w = d.x0 + d.w0 - nx; x = nx; }
        if (!d.widthOnly) {
          if (hnd.includes("s")) h = Math.max(minH, snapY(d.y0 + d.h0 + dy) - d.y0);
          if (hnd.includes("n")) { const ny = Math.min(snapY(d.y0 + dy), d.y0 + d.h0 - minH); h = d.y0 + d.h0 - ny; y = ny; }
          if (d.lockAspect && d.h0 > 0) {
            const a = d.w0 / d.h0;
            const byW = hnd === "e" || hnd === "w" || (hnd !== "n" && hnd !== "s" && Math.abs(dx) >= Math.abs(dy)); // the dominant delta wins on a corner
            if (byW) h = w / a; else w = h * a;
            if (hnd.includes("w")) x = d.x0 + d.w0 - w;
            if (hnd.includes("n")) y = d.y0 + d.h0 - h;
          }
        }
        if (!showGrid) setGuides(d.lockAspect ? [] : hits); // an aspect-locked box moves the other edge too: no line to show
        const hOut = d.widthOnly ? {} : { h: d.lockAspect ? Math.round(h * 100) / 100 : Math.round(h) };
        setElements((els) => els.map((el) => el.id === d.id ? { ...el, x: Math.round(x), y: Math.round(y), w: Math.round(w), ...hOut } : el));
        return;
      }
      const { id, groupOrigin } = dragState.current;
      if (groupOrigin) {
        // Multi-element drag (started on a member of a >1 Ctrl+click selection): move every selected
        // element by the same delta the primary (grabbed) element moved, so the group's relative
        // layout is preserved rather than everything collapsing onto the cursor.
        const origin = groupOrigin.get(id);
        const dx = x - origin.x, dy = y - origin.y;
        setElements((els) => els.map((el) => groupOrigin.has(el.id) ? { ...el, x: groupOrigin.get(el.id).x + dx, y: groupOrigin.get(el.id).y + dy } : el));
      } else {
        setElements((els) => els.map((el) => el.id === id ? { ...el, x, y } : el));
      }
    };
    const onUp = () => { dragState.current = null; setGuides([]); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    // TASKS.csv #207 — same "OS steals input mid-drag" safety net as SidebarResizeHandle.jsx (a
    // screenshot tool/Alt-Tab/notification stealing window focus mid-drag could otherwise leave an
    // element following the cursor indefinitely, same failure mode the comment above already fixed
    // for "released outside .ge-main" — this covers "released outside the window/app entirely").
    window.addEventListener("blur", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); window.removeEventListener("blur", onUp); };
  }, [showGrid, gridSnapPx]);

  const addElement = (type) => {
    const id = `${type}_${Date.now()}`;
    const base = { id, type, x: 100, y: 100 };
    if (type === "text") base.text = "Text", base.w = 200;
    if (type === "titleblock") Object.assign(base, newTitleBlock(id, Math.max(20, A4.w - 400), Math.max(20, A4.h - 260))); // TASKS.csv #1868 — bottom right
    if (type === "logo") logoInput.current.click();
    if (type === "scale") { base.meters = 100; base.pxPerMeter = DEFAULT_PX_PER_METER; Object.assign(base, insertScaleBar(base, elements, selected)); if (!base.boundTo) Object.assign(base, freeSpot(elements, 260, 50, A4)); /* #2135 */ base.y = Math.min(base.y, A4.h - 50); } // #1635 — bound to the selected / only view
    if (type === "north") { // TASKS.csv #1632 — tied to the selected view, else the page's only view with a camera azimuth
      const views = elements.filter((el) => el.type === "viewport" && el.cameraAzimuthDeg != null);
      const vp = views.find((v) => v.id === selected) || (views.length === 1 ? views[0] : null);
      if (vp) { base.boundTo = vp.id; base.rotation = northRotationOf(vp); }
    }
    if (type === "text" || type === "north") Object.assign(base, freeSpot(elements, type === "text" ? 200 : 60, type === "text" ? 40 : 80, A4)); // #1484
    if (type === "legend") {
      // TASKS.csv #1224 — what the 3D view shows now, bound to the page's viewport if there is just one: a stock row on a printed figure says nothing true
      const only = elements.filter((el) => el.type === "viewport");
      const { items } = legendFromView(viewerUiState || {}, { frameHoles: only.length === 1 ? holesInFrame(only[0], collars) : null, frame: only.length === 1 ? frameTest(only[0]) : null }); // #1633; frame: #2134
      // the whole view can run off the page: Load from view brings the rest. #1482 — samples and grades first, and a line says what was left out
      const ranked = rankLegendGroups(items), kept = firstLegendGroups(ranked), left = legendGroupCount(ranked) - legendGroupCount(kept);
      base.items = items.length ? (left > 0 ? [...kept, [tr("+ {n} more group(s): Load from view adds them", { n: left }), null, { heading: true }]] : kept) : [["Item", "#55606e"]];
      const viewports = elements.filter((el) => el.type === "viewport");
      if (viewports.length === 1) Object.assign(base, { boundViewportId: viewports[0].id, loadedItems: base.items, loadedCapturedAt: viewports[0].capturedAt || null }); // stamp: #2471
      Object.assign(base, freeSpot(elements, 220, Math.min(A4.h - 80, 30 + 15 * base.items.length), A4)); // #1484
    }
    // TASKS.csv #19 — shapes/annotation
    if (type === "rect") { base.w = 180; base.h = 110; base.stroke = "#1a2028"; base.strokeWidth = 2; base.fill = "#ffffff"; base.fillOpacity = 0; }
    if (type === "arrow") { base.length = 140; base.angle = 0; base.stroke = "#1a2028"; base.strokeWidth = 2.5; }
    if (type === "callout") { base.text = "Note"; base.w = 180; base.fill = "#fff9e0"; base.stroke = "#c9a227"; }
    // TASKS.csv #1640 (review #1497, Lawyers) — the shapes too go into the page's free space (#1484 placed the views, text, north arrow and
    // legend): a rectangle, an arrow and a callout all landed at (100, 100), on each other and on the plan
    if (type === "rect" || type === "arrow" || type === "callout") Object.assign(base, freeSpot(elements, type === "arrow" ? base.length : base.w, type === "rect" ? base.h : type === "arrow" ? 30 : 60, A4));
    // TASKS.csv #911 — a drillhole collar table, live from the project's collars (static tables come from Best intercepts)
    if (type === "drillplan") { // TASKS.csv #1639 — every hole at a round scale
      Object.assign(base, { x: 60, y: 80, w: Math.min(760, A4.w - 120), h: Math.min(480, A4.h - 180), labels: "all", fontPt: 7, frameWidth: 1 });
      Object.assign(base, freeSpot(elements, base.w, base.h, A4)); // #2135 — it landed at (60, 80) over the views
      Object.assign(base, fitDrillPlan(collars, base.w, base.h, SCALE_PRESETS) || { scale: 10000, centre: { x: 0, y: 0 } });
    }
    if (type === "table") { base.source = "collars"; base.title = "Drillhole collars"; base.w = 520; base.fontPt = 7; Object.assign(base, placeCollarTable(elements, A4, { w: 520, fontPt: 7, total: collars.length })); /* #1638 fits the sheet; #2135 free space */ base.frameWidth = 1; }
    // TASKS.csv #2302 (review #2174) — a drill plan ties the page's starter scale bar as a snapshot does (#1320): a '100 m' bar at 1:2,380 stood
    // beside a 1:20,000 plan
    if (type !== "logo") setElements((els) => (type === "drillplan" ? tieStarterFurniture([...els, base], base) : [...els, base]));
    setSelected(type !== "logo" ? id : null);
  };

  // TASKS.csv #19 — freehand pen. Toggled on from the palette; the next mousedown-drag on the page
  // captures points (in page-relative px, same coordinate space as every other element's x/y — the
  // page is CSS-scaled by the zoom since #909, so clientX/Y minus the page's origin is divided by it)
  // until mouseup, then commits a single "freehand" element and turns the tool back off — a one-shot
  // draw, not a persistent mode, so it can't be left on by accident.
  const startFreehand = (e) => {
    if (!freehandTool) return;
    freehandDrawing.current = true;
    const rect = pageRef.current.getBoundingClientRect();
    const first = [(e.clientX - rect.left) / zoomRef.current, (e.clientY - rect.top) / zoomRef.current]; // / zoom: #909
    freehandPointsRef.current = [first];
    setFreehandPoints([first]);
  };
  useEffect(() => {
    if (!freehandTool) return;
    const onMove = (e) => {
      if (!freehandDrawing.current || !pageRef.current) return;
      const rect = pageRef.current.getBoundingClientRect();
      freehandPointsRef.current = [...freehandPointsRef.current, [(e.clientX - rect.left) / zoomRef.current, (e.clientY - rect.top) / zoomRef.current]]; // / zoom: #909
      setFreehandPoints(freehandPointsRef.current);
    };
    const onUp = () => {
      if (!freehandDrawing.current) return;
      freehandDrawing.current = false;
      const pts = freehandPointsRef.current;
      freehandPointsRef.current = [];
      if (pts.length >= 2) {
        const { min: minX } = minMax(pts.map((p) => p[0]));
        const { min: minY } = minMax(pts.map((p) => p[1]));
        const id = `freehand_${Date.now()}`;
        const rel = pts.map(([x, y]) => [x - minX, y - minY]);
        setElements((els) => [...els, { id, type: "freehand", x: minX, y: minY, points: rel, stroke: "#1a2028", strokeWidth: 2 }]);
        setSelected(id);
      }
      setFreehandPoints([]);
      setFreehandTool(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    // TASKS.csv #207 — same "OS steals input mid-drag" safety net as the element-drag effect above:
    // without this, losing window focus mid-stroke (screenshot tool, Alt-Tab) would leave
    // freehandDrawing/freehandTool stuck true forever with nothing left to commit or cancel it.
    // Treated the same as a real mouseup (commit whatever's been drawn so far) rather than discarding
    // it, since that's the existing onUp behavior for an early release too.
    window.addEventListener("blur", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); window.removeEventListener("blur", onUp); };
  }, [freehandTool]);

  // Bug fix (user report — see PromptModal.jsx's header comment): window.prompt() doesn't reliably
  // work in Electron's renderer, so both "name this" flows below used it silently failed to appear.
  const [promptState, setPromptState] = useState(null); // { title, defaultValue, onSubmit } | null
  const askPrompt = (title, defaultValue, onSubmit) => setPromptState({ title, defaultValue: defaultValue || "", onSubmit });

  const saveAsTemplate = () => {
    askPrompt(tr("Template name?"), "", (name) => { // #1868 — the prompt's title was not translated
      if (!name || !name.trim()) return;
      // #1868 / #1487 — with its paper size and orientation, and without this project's snapshots (templateElements)
      const t = templateElements(elements);
      addLayoutTemplate(name.trim(), t.elements, pageFormat);
      setTemplatesOpen(true);
      setTemplateMsg(t.dropped || t.cleared ? tr("Saved the template \"{name}\" in this project: the page's layout without this project's pictures ({d} snapshot(s) left out, {v} viewport(s) kept as empty frames to refresh).", { name: name.trim(), d: t.dropped, v: t.cleared }) : tr("Saved the template \"{name}\" in this project.", { name: name.trim() }));
    });
  };
  // TASKS.csv #1487 — a project template kept on this computer, for every project
  const [computerTplKey, setComputerTplKey] = useState(0);
  const keepOnComputer = async (tpl) => {
    const r = await keepTemplateOnComputer(tpl);
    if (!r.ok) { setTemplateMsg(r.error); return; }
    setTemplateMsg(r.replaced ? tr("Replaced the template \"{name}\" on this computer: every project now offers this version.", { name: tpl.name }) : tr("Kept the template \"{name}\" on this computer: every project offers it now.", { name: tpl.name }));
    setComputerTplKey((k) => k + 1);
  };
  const loadTemplate = (tpl) => {
    if (elements.length && !window.confirm(tr("Replace the current page with \"{name}\"? (Ctrl+Z undoes this.)", { name: tr(tpl.name) }))) return; // #1487 — layoutPages are in the undo history
    if (tpl.format) setLayoutPageFormat(activeLayoutPageId, tpl.format); // #1868 — a template keeps its paper size and orientation
    if (tpl.stock) { setElements(stockTemplateElements(tpl)); setSelected(null); setTemplatesOpen(false); return; } // #1868 — a starter template
    const idMap = new Map(tpl.elements.map((el) => [el.id, `${el.type}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`]));
    setElements(relinkCopies(tpl.elements.map((el) => ({ ...el, id: idMap.get(el.id) })), idMap, true)); // #924
    setSelected(null);
    setTemplatesOpen(false);
  };

  // TASKS.csv #1868 — a template as a small file, so next year's report starts from it in another project
  const [templateMsg, setTemplateMsg] = useState(null);
  const exportTemplate = (tpl) => saveFile({ suggestedName: `${String(tpl.name).replace(/[^\w.-]+/g, "_").slice(0, 60) || "template"}.geostrix-layout.json`, filters: [{ name: "GeoStrix layout template", extensions: ["json"] }], content: templateFile(tpl) });
  const onTemplateFile = (e) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    if (f.size > 25 * 1024 * 1024) { setTemplateMsg(tr("That file is too large for a layout template.")); return; }
    f.text().then((text) => {
      try {
        const t = parseTemplateFile(text, f.name.replace(/\.(geostrix-layout\.)?json$/i, ""));
        addLayoutTemplate(t.name, t.elements, t.format);
        setTemplateMsg(t.dropped ? tr("Imported the template \"{name}\" ({n} element(s)); {d} element(s) it could not use were left out.", { name: t.name, n: t.elements.length, d: t.dropped }) : tr("Imported the template \"{name}\" ({n} element(s)).", { name: t.name, n: t.elements.length }));
      } catch (err) { setTemplateMsg(err.message); }
    });
  };
  const onLogoFile = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setElements((els) => [...els, { id: `logo_${Date.now()}`, type: "logo", ...freeSpot(els, 160, 80, A4) /* #1484 */, src: reader.result, w: 160 }]);
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  const updateSelected = (patch) => setElements((els) => els.map((el) => el.id === selected ? { ...el, ...patch } : el));
  // Deleting a viewport/section also drops any scale bar bound to it (an orphaned bar with no view to
  // describe would just be confusing) and un-binds any legend that was reading lithologies from it
  // (the legend itself stays — just reverts to a plain manually-editable one). Generalized to a set of
  // ids (not just the single `selected`) so the Delete-key shortcut can remove an entire Ctrl+click
  // multi-selection in one go, with the same bound-element cleanup applied per deleted id.
  const removeElementsByIds = (ids) => {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    if (!idSet.size) return;
    setElements((els) => els
      .filter((el) => !idSet.has(el.id) && !idSet.has(el.boundTo))
      .map((el) => idSet.has(el.boundViewportId) ? { ...el, boundViewportId: null } : el));
    setSelected(null);
    setMultiSelected(new Set());
  };
  const removeSelected = () => removeElementsByIds(multiSelected.size > 1 ? multiSelected : (selected ? [selected] : []));

  // User request: "delete key to delete the selected item[s]". Deletes the whole Ctrl+click
  // multi-selection when there is one, else the single selected element — same target resolution
  // removeSelected() above uses, so this is just wiring a key to the existing action. Skipped while
  // focus is in a text input/textarea/contentEditable (a page-title or callout text field, an element's
  // sidebar name field, etc.) so Backspace still edits text as expected instead of deleting the element.
  // TASKS.csv #909 — QGIS's item tools: z-order, duplicate (Ctrl+D), nudge with the arrow keys (1 mm, Shift 10 mm),
  // lock, align / distribute a multi-selection. Boxes for aligning are measured on the page (data-el-id), so a text
  // whose height is its content's, or a rotated viewport, aligns by what is drawn.
  const selectionIds = () => (multiSelected.size > 1 ? [...multiSelected] : selected ? [selected] : []);
  const reorderSelected = (where) => setElements((els) => {
    const i = els.findIndex((e) => e.id === selected);
    if (i < 0) return els;
    const copy = els.slice(); const [el] = copy.splice(i, 1);
    return where === "front" ? [...copy, el] : [el, ...copy];
  });
  const duplicateSelected = () => {
    const ids = selectionIds();
    if (!ids.length) return;
    const off = Math.round(5 * PX_PER_MM);
    const idMap = new Map(ids.map((id) => [id, `${(elements.find((e) => e.id === id) || {}).type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`]));
    const copies = relinkCopies(elements.filter((e) => ids.includes(e.id)).map((e) => ({ ...e, id: idMap.get(e.id), x: e.x + off, y: e.y + off, locked: false })), idMap, false); // #924
    setElements((els) => [...els, ...copies]);
    setSelected(copies[copies.length - 1].id);
    setMultiSelected(new Set(copies.length > 1 ? copies.map((c) => c.id) : []));
  };
  // TASKS.csv #1484 — Ctrl+C / Ctrl+V, also between pages (the clipboard is module-level: it outlives a page switch or a trip to
  // another tab). Pasted onto another page an element keeps its place; on the same page it lands 5 mm along, as Duplicate does.
  const copySelected = () => {
    const ids = selectionIds();
    if (!ids.length) return false;
    layoutClipboard = { pageId: activeLayoutPageId, els: JSON.parse(JSON.stringify(elements.filter((e) => ids.includes(e.id)))) };
    setSyncNotice(tr(ids.length === 1 ? "Copied 1 element: Ctrl+V pastes it on any page." : "Copied {n} elements: Ctrl+V pastes them on any page.", { n: ids.length }));
    return true;
  };
  const pasteClipboard = () => {
    if (!layoutClipboard?.els?.length) return false;
    const off = layoutClipboard.pageId === activeLayoutPageId ? Math.round(5 * PX_PER_MM) : 0;
    const idMap = new Map(layoutClipboard.els.map((e) => [e.id, `${e.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`]));
    const copies = relinkCopies(layoutClipboard.els.map((e) => ({ ...e, id: idMap.get(e.id), x: e.x + off, y: e.y + off, locked: false })), idMap, false); // #924
    setElements((els) => [...els, ...copies]);
    setSelected(copies[copies.length - 1].id);
    setMultiSelected(new Set(copies.length > 1 ? copies.map((c) => c.id) : []));
    return true;
  };
  const nudgeSelected = (dx, dy) => {
    const ids = new Set(selectionIds());
    if (!ids.size) return;
    // TASKS.csv #980 — to the nearest 0.1 mm, not the whole px: 1 mm is 3.78 px, and rounding to 4 px made ten 1 mm presses 10.58 mm
    const r = (v) => (Math.round((v * 10) / PX_PER_MM) / 10) * PX_PER_MM;
    setElements((els) => els.map((e) => (ids.has(e.id) && !e.locked ? { ...e, x: r(e.x + dx), y: r(e.y + dy) } : e)));
  };
  const boxOf = (id) => {
    const d = pageRef.current?.querySelector(`[data-el-id="${id}"]`);
    if (!d) return null;
    const pr = pageRef.current.getBoundingClientRect(), z = zoomRef.current;
    let r = d.getBoundingClientRect();
    // TASKS.csv #998 — a viewport's frame is drawn outside its box (#906): guides, margins and alignment measure the
    // drawn edge, so two framed views line up by their frames and a frame snapped to a margin sits on it
    const f = d.querySelector(":scope > [data-frame]");
    if (f) { const fr = f.getBoundingClientRect(); const L = Math.min(r.left, fr.left), T = Math.min(r.top, fr.top); r = { left: L, top: T, width: Math.max(r.right, fr.right) - L, height: Math.max(r.bottom, fr.bottom) - T }; }
    return { x: (r.left - pr.left) / z, y: (r.top - pr.top) / z, w: r.width / z, h: r.height / z };
  };
  const alignSelected = (how) => {
    const boxes = [...multiSelected].map((id) => ({ id, b: boxOf(id) })).filter((x) => x.b);
    if (boxes.length < 2) return;
    const L = Math.min(...boxes.map((x) => x.b.x)), R = Math.max(...boxes.map((x) => x.b.x + x.b.w)), T = Math.min(...boxes.map((x) => x.b.y)), B = Math.max(...boxes.map((x) => x.b.y + x.b.h));
    const moves = new Map(boxes.map((x) => [x.id, {
      dx: how === "left" ? L - x.b.x : how === "right" ? R - x.b.w - x.b.x : how === "hcentre" ? (L + R) / 2 - x.b.w / 2 - x.b.x : 0,
      dy: how === "top" ? T - x.b.y : how === "bottom" ? B - x.b.h - x.b.y : how === "vcentre" ? (T + B) / 2 - x.b.h / 2 - x.b.y : 0,
    }]));
    setElements((els) => els.map((e) => { const m = moves.get(e.id); return m && !e.locked ? { ...e, x: Math.round(e.x + m.dx), y: Math.round(e.y + m.dy) } : e; }));
  };
  const distributeSelected = (axis) => {
    const boxes = [...multiSelected].map((id) => ({ id, b: boxOf(id) })).filter((x) => x.b);
    if (boxes.length < 3) return;
    const k = axis === "h" ? "x" : "y", s = axis === "h" ? "w" : "h";
    boxes.sort((p, q) => p.b[k] - q.b[k]);
    const first = boxes[0].b[k], last = boxes[boxes.length - 1].b[k] + boxes[boxes.length - 1].b[s];
    const gap = (last - first - boxes.reduce((t, x) => t + x.b[s], 0)) / (boxes.length - 1);
    const moves = new Map(); let at = first;
    for (const x of boxes) { moves.set(x.id, at - x.b[k]); at += x.b[s] + gap; }
    setElements((els) => els.map((e) => { const d = moves.get(e.id); return d != null && !e.locked ? { ...e, [k]: Math.round(e[k] + d) } : e; }));
  };
  useEffect(() => {
    const onKeyDown = (e) => {
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active?.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) { if (selected) { e.preventDefault(); duplicateSelected(); } return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) { if (copySelected()) e.preventDefault(); return; } // #1484
      if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) { if (pasteClipboard()) e.preventDefault(); return; }
      if (e.key.startsWith("Arrow")) {
        if (!selected) return;
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * PX_PER_MM;
        nudgeSelected(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (multiSelected.size > 1) { e.preventDefault(); removeElementsByIds(multiSelected); }
      else if (selected) { e.preventDefault(); removeElementsByIds([selected]); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, multiSelected, elements, activeLayoutPageId]); // activeLayoutPageId: #1484
  // TASKS.csv #909 — dynamic text: {project} {date} {page} {pages} {pagename} {scale} in a title or text (QGIS's
  // expressions, the few a figure's title block needs); {scale} is the page's first fixed-scale viewport, else its
  // first true-scale one, else the approximate scale of the first viewport
  const activePageIndex = Math.max(0, layoutPages.findIndex((pg) => pg.id === activeLayoutPageId));
  const credits = useMemo(() => projectCredits(terrain, rasters), [terrain, rasters]); // TASKS.csv #949
  // TASKS.csv #1483 — a collar with no azimuth / dip of its own (Silvertip's) takes its shallowest survey station's, marked so
  const tableCollars = useMemo(() => collarsWithSurveyAttitude(collars, survey), [collars, survey]); // #1483 / #1771 / #2133 (lib/collarTable.js)
  const textCtx = useMemo(() => ({ ...textContextFor(elements, project, activePage, activePageIndex, layoutPages.length, tableCollars, credits), assays, assayElements /* #2473 — a drill plan coloured by grade */ }), [elements, project, activePage, activePageIndex, layoutPages.length, tableCollars, credits, assays, assayElements]);

  // "Each viewport and cross section need an option to assign a scale bar to it" — previously there
  // was only ever ONE scale-bar element on a page (onSyncScaleBar found-or-created the single
  // `type === "scale"` element, full stop), so a page with two viewports/sections at different scales
  // had no way to give each its own correct bar. Now every scale element carries a `boundTo: elId`
  // back-reference; syncing a given viewport/section finds-or-creates the ONE scale element bound to
  // THAT element specifically, dropped just under it so it's obviously "this bar belongs to this
  // view". Legacy free-floating scale bars (no boundTo, added via the toolbar's plain "Add scale bar")
  // are left alone by this — they're a different, still-supported use case (a bar that isn't tied to
  // any one view, e.g. a page-wide reference scale).
  const syncScaleBarForElement = (sel, worldSizeM, pxSizeOnPage) => {
    if (!worldSizeM || !pxSizeOnPage) {
      setSyncNotice(tr("No scale data available yet for this element — for a viewport, click \"Refresh from theme\" first; for a cross-section, re-snapshot it from the section pop-out."));
      return;
    }
    // pxPerMeter is the TRUE on-page pixel-per-metre ratio implied by this element's own captured
    // geometry (worldSizeM real metres shown across pxSizeOnPage on-page pixels) — not tied to the
    // arbitrary SCALE_BAR_PX constant. The bar is rendered at meters*pxPerMeter (see LayoutElement's
    // "scale" branch), so once this ratio is set it stays fixed even as `meters` is hand-edited
    // afterward — exactly what makes editing the number resize the bar instead of just relabeling it.
    const pxPerMeter = pxSizeOnPage / worldSizeM;
    // Suggest a "nice" round distance close to the old default 180px-wide bar's span, purely as a
    // sensible starting number — the user can retype it to anything and the bar will resize to match.
    const meters = niceScaleNumber(SCALE_BAR_PX / pxPerMeter);
    setElements((els) => {
      const existing = els.find((el) => el.type === "scale" && el.boundTo === sel.id);
      if (existing) return els.map((el) => el === existing ? { ...el, meters, pxPerMeter } : el);
      return [...els, { id: `scale_${Date.now()}`, type: "scale", boundTo: sel.id, x: sel.x, y: sel.y + (sel.h || 0) + 14, meters, pxPerMeter }];
    });
    setSyncNotice(tr("Scale bar assigned ({meters} m): it follows this view's scale; edit the number any time and the bar resizes to match.", { meters: meters.toLocaleString() }));
  };

  // "The legend should be able to load the lithologies present in the view attached to it" — a legend
  // element gains an optional `boundViewportId` (set from the dropdown in its property panel below);
  // this reads that viewport's saved theme (layerVisible.litho + categoryFilter.litho, the same fields
  // ViewerModule itself uses to decide what's on screen — see captureCurrentTheme there) against the
  // ACTUAL litho vocabulary in `layers.litho` (a theme only stores which units are hidden, not the
  // full unit list, since that list can grow after the theme was saved) to build the item list.
  // TASKS.csv #1633 — frameHoles (holesInFrame of the bound frame, or null): only the holes the frame shows give categories
  const legendFromView = (theme, { frameHoles = null, frame = null } = {}) => {
    // TASKS.csv #2134 — the frame filters the surface samples and the map layers too: none inside drops the group, and the media /
    // classes are those found inside
    const sampleGroup = (() => {
      if (!surfaceSampleLegend || !frame) return surfaceSampleLegend;
      const inside = samplesInFrame(frame, surfaceSamples);
      if (!inside.length) return null;
      if (surfaceSampleLegend.key !== "surface_samples" || surfaceSampleLegend.items.length === 1) return surfaceSampleLegend;
      const media = new Set(inside.map((s) => s.medium || "(no medium)"));
      return { ...surfaceSampleLegend, items: surfaceSampleLegend.items.filter(([l]) => media.has(l)) };
    })();
    const shownMapLayers = mapLayersInFrame(frame, (mapLayers || []).map((l) => ({ ...l, allCategories: l.categories })));
    // #2134 — the assay classes and numeric logs (RQD, SG, mag susc…) from the holes the frame shows: they were listed from every hole
    const inFrame = (rows) => (frameHoles && Array.isArray(rows) ? rows.filter((r) => frameHoles.has(r.hole_id)) : rows);
    const frameLayers = frameHoles ? Object.fromEntries(Object.entries(layers || {}).map(([k, v]) => [k, inFrame(v)])) : layers;
    // TASKS.csv #725 — everything the bound view draws, not only lithology: every categorical layer the theme shows
    // (minus its hidden categories and holes, with its label / colour overrides), its assay grade classes, and the
    // visible block models (classes, or a ramp) — the same builders as the 3D view's figure overlay.
    const ov = theme.legendOverride || {};
    const labelFor = (k, v) => categoryLabel(ov[k]?.[v], LAYER_META[k], v); // #1289
    const colorFor = (k, v) => categoryColor(ov[k]?.[v], LAYER_META[k], v);
    const layerVisible = { litho: true, ...(theme.layerVisible || {}) }; // a theme saved before a layer existed: lithology on, the rest off
    const groups = [
      ...categoryLegendGroups({ keys: LEGEND_CATEGORY_KEYS, layers, layerVisible, placed: new Set((collars || []).map((c) => String(c.hole_id))) /* #1867 */, hidden: theme.categoryFilter || {}, visibleHoles: frameHoles ? { ...(theme.visibleHoles || {}), ...Object.fromEntries(collars.filter((c) => !frameHoles.has(c.hole_id)).map((c) => [c.hole_id, false])) } : theme.visibleHoles || {}, singleColor: Object.fromEntries(LEGEND_CATEGORY_KEYS.filter((k) => theme.layerStyles?.[k]?.color).map((k) => [k, theme.layerStyles[k].color])), labelFor, colorFor }), // #1288
      ...assayLegendGroups({ assays: inFrame(assays), assayElements, assayVisible: theme.assayVisible !== false, assayDisplayElements: theme.assayDisplayElements || (theme.assayDisplayElement ? [theme.assayDisplayElement] : []), assayStyle: theme.assayStyle || {} }),
      ...voxelLegendGroups(voxelModels), ...rasterLegendGroups(rasters), // #1236
      // TASKS.csv #2472 (review #2325) — the custom layers the view draws (a stratigraphic unit, a gamma log): the 3D legend lists them and
      // the sheet's did not; the same builder, its rows narrowed to the frame's holes
      ...customLegendGroups(frameHoles ? customLayers.map((l) => ({ ...l, rows: inFrame(l.rows) })) : customLayers, theme.customVisible || viewerUiState?.customVisible || {}, theme.layerStyles || viewerUiState?.layerStyles || {}),
      // TASKS.csv #1482 — the numeric logs the view colours its holes by (RQD, recovery, SG, mag susc), as the 3D legend shows them
      ...(() => { const sym = theme.numericSymbology || viewerUiState?.numericSymbology || {}, clips = numericClips(layers); return numericLayerLegendGroups({ layers: frameLayers, layerVisible, colorOf: numericLayerColorFn(sym, clips), symbology: sym, clips }); })(), // frameLayers: #2134 (the clips stay the whole project's, as the 3D view colours)
      // TASKS.csv #948 — the Surface Geology map: surface samples as the 3D view colours them, map layers, boundaries
      ...(sampleGroup ? [sampleGroup] : []), ...(outcropLegendGroup({ surfaceStructures }) ? [outcropLegendGroup({ surfaceStructures })] : []) /* #1437 */, ...mapLayerLegendGroups(shownMapLayers), ...boundaryLegendGroups(boundaries),
    ];
    // #1633 — a long group keeps its most frequent entries and says how many it left out
    const items = legendGroupsToItems(capLegendGroups(groups, 12, (n) => tr("+ {n} more (fewer intervals; edit the legend to add them)", { n })));
    return { groups, items };
  };
  // TASKS.csv #2471 — auto: the bound viewport was refreshed and the legend's rows were the loaded ones (legendSyncState "reload");
  // each load records the rows and the capture it came from (loadedItems / loadedCapturedAt), so a later refresh can tell
  const syncLegendFromView = (legendId, { auto = false } = {}) => {
    const legend = elements.find((el) => el.id === legendId);
    if (!legend) return;
    const say = auto ? () => {} : setSyncNotice;
    if (!legend.boundViewportId) { say(tr("Pick a bound viewport or cross-section above first.")); return; }
    const vp = elements.find((el) => el.id === legend.boundViewportId);
    if (!vp) { say(tr("That viewport/section no longer exists on this page — pick a different one.")); return; }
    const stamp = (items) => ({ items, loadedItems: items, loadedCapturedAt: vp.capturedAt || null, autoReloaded: auto }); // autoReloaded: said in the viewport's sidebar

    // Cross-section snapshots (type "image") carry their own pre-computed legendItems — the exact
    // {label,color} pairs drawn in that section (litho/alt/vein/structure), built once in
    // ViewerModule's buildSectionPayload and threaded through snapshotToLayout. No live theme to
    // look up here (a flattened image has none), so this is a direct copy rather than a rebuild —
    // "sync" just means "refresh from whatever this snapshot was captured with".
    if (vp.type === "image") {
      const items = groupSectionLegend(vp.legendItems); // #1127 — a snapshot taken before grouping is grouped here
      if (!items.length) { say(tr("This cross-section snapshot has no litho/alteration/vein/structure data to show — nothing to load.")); return; }
      setElements((els) => els.map((el) => el.id === legendId ? { ...el, ...stamp(items) } : el));
      setSyncNotice(tr(items.length === 1 ? "Loaded {items} category from \"{v2}\"." : "Loaded {items} categories from \"{v2}\".", { items: items.length, v2: vp.label || vp.id }));
      return;
    }

    // TASKS.csv #948 — a viewport captured from the current view (no theme) carries that view's own settings
    const theme = themes.find((t) => t.id === vp.themeId) || (!vp.themeId && vp.viewState ? { ...vp.viewState, name: tr("the current view") } : null);
    if (!theme) { say(tr("This viewport's saved theme could no longer be found (it may have been renamed or deleted) — rebind the viewport to a theme in its own panel, or resave that theme, then sync again.")); return; }
    const frameHoles = holesInFrame(vp, collars); // #1633 — a top-down true-scale frame: what it shows; else the whole view
    const { groups, items } = legendFromView(theme, { frameHoles, frame: frameTest(vp) }); // frame: #2134
    if (!items.length) { setElements((els) => els.map((el) => el.id === legendId ? { ...el, ...stamp([]) } : el)); setSyncNotice(tr("Nothing that view shows has a legend: no visible category layer, assay classes, block model, surface samples, map layer or boundary.")); return; }
    setElements((els) => els.map((el) => el.id === legendId ? { ...el, ...stamp(items) } : el));
    setSyncNotice(tr(groups.length === 1 ? "Loaded {n} legend group from \"{name}\"." : "Loaded {n} legend groups from \"{name}\".", { n: groups.length, name: theme.name })
      + (frameHoles ? tr(" Categories from the {h} of {all} holes inside the frame.", { h: frameHoles.size, all: collars.length }) : "")
      + (() => { // #2134 — the collars with no survey or attitude are drawn as assumed vertical holes (#2014): say how many of those counted
        if (!frameHoles?.size) return "";
        const surveyed = new Set((survey || []).map((s) => s.hole_id));
        const a = collars.filter((c) => frameHoles.has(c.hole_id) && holeAttitudeAssumed(c, surveyed.has(c.hole_id) ? [{}] : [])).length;
        return a ? tr(a === 1 ? " {a} of them has no survey or attitude and is drawn as an assumed vertical hole." : " {a} of them have no survey or attitude and are drawn as assumed vertical holes.", { a }) : "";
      })());
  };

  // TASKS.csv #2471 — a refreshed viewport reloads the legends bound to it whose rows are still the loaded ones
  useEffect(() => {
    const byId = new Map(elements.map((e) => [e.id, e]));
    elements.filter((e) => e.type === "legend" && legendSyncState(e, byId.get(e.boundViewportId)) === "reload").forEach((l) => syncLegendFromView(l.id, { auto: true }));
  }, [elements]);

  // TASKS.csv #78 — drag-and-drop as a consistent import method. Layout's own "asset" is an image
  // (logo aside, which stays its own small fixed-size button flow since it's meant to be one
  // consistent letterhead mark, not a general photo drop) — dropping any image file onto the page adds
  // it as a normal "image" element (same type/behavior as a 3D View/section snapshot) sized to fit,
  // placed at the drop point rather than always the same fixed corner so multiple drops don't stack.
  const onPageDrop = (e) => {
    e.preventDefault(); setDragOverPage(false);
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const rect = pageRef.current.getBoundingClientRect();
    // TASKS.csv #990 — the sheet is CSS-scaled by the zoom (#909): screen px / zoom = page px, kept on the page
    const z = zoomRef.current || 1;
    const dropX = Math.min(Math.max(0, (e.clientX - rect.left) / z), Math.max(0, rect.width / z - 40)), dropY = Math.min(Math.max(0, (e.clientY - rect.top) / z), Math.max(0, rect.height / z - 40));
    files.forEach((f, i) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new window.Image();
        img.onload = () => {
          const aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 16 / 9;
          const w = Math.min(A4.w - 160, 400);
          const h = Math.round(w / aspect);
          const id = `image_${Date.now()}_${i}`;
          setElements((els) => [...els, { id, type: "image", label: f.name, src: reader.result, aspect, x: dropX + i * 20, y: dropY + i * 20, w, h }]);
          setSelected(id);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    });
  };

  const sel = elements.find((el) => el.id === selected);

  return (
    <div className="ge-body" style={{ width: "100%" }}>
      {printing && <LayoutPrintRoot ref={printRootRef} pages={layoutPages} project={project} collars={tableCollars} credits={credits} assays={assays} assayElements={assayElements} />}{/* TASKS.csv #908 */}
      <div className="ge-panel" style={{ padding: "16px 14px", width: sidebarWidth }}>
        {/* TASKS.csv #458 — Layout ribbon (replaces the #65 icon palette and the Templates / Output buttons). */}
        <Ribbon label="Layout tools">
          <RibbonGroup label="Insert">
            <RibbonButton icon={Type} label="Text" tone="output" title="Add text" onClick={() => addElement("text")} />
            <RibbonButton advanced icon={ImageIcon} label="Logo" tone="output" title="Add company logo" onClick={() => addElement("logo")} />
            <RibbonButton icon={Compass} label="North arrow" tone="output" title="Add north arrow" onClick={() => addElement("north")} />
            <RibbonButton icon={Ruler} label="Scale bar" tone="output" title="Add scale bar" onClick={() => addElement("scale")} />
            <RibbonButton icon={Plus} label="Legend" tone="output" title="Add legend" onClick={() => addElement("legend")} />
            <RibbonButton icon={LayoutTemplate} label="Title block" tone="output" title="Add a title block: a ruled box of labelled fields (title, company, project, claims, map sheet, figure, author, date, scale, datum, page), the project, date, scale and datum filled in" onClick={() => addElement("titleblock")} />{/* TASKS.csv #1868 */}
            <RibbonButton advanced icon={Sheet} label="Collar table" tone="output" title="Add a table of the drillhole collars (hole, easting, northing, elevation, azimuth, dip, depth), kept up to date with the project. Best intercepts puts its results on the page from its own window." onClick={() => addElement("table")} />{/* TASKS.csv #911 */}
          </RibbonGroup>
          <RibbonGroup label="Views">
            <RibbonButton icon={Camera} label="Current view" tone="view" title="Add a viewport snapshot of the current 3D View (no theme needed)" onClick={() => startViewportRender(null, "new")} />
            <RibbonButton icon={MapPinned} label="Drill plan" tone="view" disabled={!collars.length} title="A drill-hole location plan: collar symbols, traces and labels at a true scale, drawn from the collars (not a 3D capture)" onClick={() => addElement("drillplan")} />{/* TASKS.csv #1639 */}
            <RibbonButton advanced icon={MonitorPlay} label="Theme view" tone="view" disabled={!themes.length} active={themePickerFor === "new"} title={themes.length ? "Add a live-bound viewport of a saved 3D View theme (pick it in the sidebar)" : "Save a theme in the 3D View first (Themes on its ribbon)"} onClick={() => setThemePickerFor(themePickerFor === "new" ? null : "new")} />
          </RibbonGroup>
          <RibbonGroup advanced label="Draw">
            <RibbonButton icon={Square} label="Rectangle" tone="neutral" title="Add rectangle" onClick={() => addElement("rect")} />
            <RibbonButton icon={ArrowUpRight} label="Arrow" tone="neutral" title="Add arrow" onClick={() => addElement("arrow")} />
            <RibbonButton icon={MessageSquare} label="Callout" tone="neutral" title="Add callout" onClick={() => addElement("callout")} />
            <RibbonButton icon={Pencil} label="Freehand" tone="neutral" active={freehandTool} title={freehandTool ? "Click and drag on the page to draw — click again to cancel" : "Freehand pen — click, then drag on the page"} onClick={() => setFreehandTool((v) => !v)} />
          </RibbonGroup>
          <RibbonGroup advanced label="Page">
            <RibbonButton icon={Grid3x3} label="Grid + snap" tone="view" active={showGrid} title="Show the alignment grid and snap elements to it (spacing in the sidebar)" onClick={() => setShowGrid((v) => !v)} />
            <RibbonButton icon={Save} label="Save template" tone="data" title="Save this page as a reusable template" onClick={saveAsTemplate} />
            <RibbonButton icon={FolderOpen} label={tr("Templates ({n})", { n: layoutTemplates.length + STOCK_TEMPLATES.length })} tone="data" active={templatesOpen} title="Starter templates, the ones saved in this project, and Import (list in the sidebar)" onClick={() => setTemplatesOpen((v) => !v)} />
          </RibbonGroup>
          <RibbonGroup label="Output">
            <RibbonButton icon={FileDown} label="Export PDF" tone="output" title="Export every page as a PDF, each at its own paper size and orientation" onClick={() => requestLayoutPrint()} />
            <RibbonButton icon={ImageIcon} label="Export PNG" tone="output" title="Export the current page as a PNG image, at the resolution chosen in the page bar" onClick={() => requestLayoutPrint({ kind: "png", dpi: pngDpi })} />{/* TASKS.csv #909 */}{/* #511 — the page's own size / orientation, as Ctrl+P does (#398) */}
          </RibbonGroup>
        </Ribbon>
        {viewportBatchDone && ( /* TASKS.csv #1644 */
          <div role="status" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, padding: "7px 10px", background: viewportBatchDone.failed ? "var(--color-warn-bg)" : "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-sm)", lineHeight: 1.45 }}>
            <span style={{ flex: 1 }}>{[
              tr("Centred the map on its hole on {n} of {t} atlas page(s), at the template's scale.", { n: viewportBatchDone.done - viewportBatchDone.failed, t: viewportBatchDone.total }),
              viewportBatchDone.cancelled ? tr("Cancelled: the other pages keep the template's map, with their hole marked.") : "",
              viewportBatchDone.failed ? tr("{n} page(s) could not be captured and keep the template's map.", { n: viewportBatchDone.failed }) : "",
            ].filter(Boolean).join(" ")}</span>
            <button type="button" onClick={() => setViewportBatchDone(null)} aria-label={tr("Close")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={14} /></button>
          </div>
        )}
        <input ref={logoInput} type="file" accept="image/*" style={{ display: "none" }} onChange={onLogoFile} />
        <input ref={templateInput} type="file" accept=".json" style={{ display: "none" }} onChange={onTemplateFile} aria-label={tr("Import a layout template")} />{/* #1868 */}
        {themePickerFor === "new" && (
          <div style={{ marginBottom: 8, padding: 8, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6 }}>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6 }}>{tr("Pick a theme:")}</div>
            {themes.map((t) => (
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} key={t.id} onClick={() => startViewportRender(t.id, "new")} style={{ padding: "5px 7px", fontSize: "var(--font-size-base)", color: "var(--color-text)", cursor: "pointer", borderRadius: 4 }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-hover-bg)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                {t.name}
              </div>
            ))}
          </div>
        )}

        {!sel && multiSelected.size <= 1 && ( /* TASKS.csv #993 — the page's interactions, said once where they are used */
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45, marginTop: 14 }}>
            {elements.length ? tr("Click an element to edit it, Ctrl+click for several (to align or spread them). Drag the handles to resize; Shift keeps the shape. Alt drags past the guides. Arrow keys nudge 1 mm, Shift+arrow 10 mm.") : tr("The sheet is empty: add a view of the 3D scene (Current view), then a title, north arrow, scale bar and legend from Insert.")}
          </div>
        )}
        {multiSelected.size > 1 && ( /* TASKS.csv #909 — align / distribute the multi-selection */
          <div style={{ marginTop: 18 }}>
            <div className="ge-section-label">{tr("{n} selected", { n: multiSelected.size })}</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
              {[["left", tr("Align left")], ["hcentre", tr("Align centre")], ["right", tr("Align right")], ["top", tr("Align top")], ["vcentre", tr("Align middle")], ["bottom", tr("Align bottom")]].map(([k, l]) => (
                <button key={k} onClick={() => alignSelected(k)} style={smallBtn}>{l}</button>
              ))}
              <button onClick={() => distributeSelected("h")} style={smallBtn} title={tr("Equal gaps left to right (3 or more elements)")}>{tr("Spread across")}</button>
              <button onClick={() => distributeSelected("v")} style={smallBtn} title={tr("Equal gaps top to bottom (3 or more elements)")}>{tr("Spread down")}</button>
              <button onClick={duplicateSelected} style={smallBtn}>{tr("Duplicate")}</button>
            </div>
          </div>
        )}
        {sel && (
          <>
            <div className="ge-section-label" style={{ marginTop: 18 }}>{tr("Selected: {type}", { type: sel.type })}</div>
            <PlaceControls sel={sel} updateSelected={updateSelected} />{/* TASKS.csv #906 — position and size in mm */}
            <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>{/* TASKS.csv #909 */}
              <button onClick={() => reorderSelected("front")} title={tr("Bring to front")} style={smallBtn}>{tr("To front")}</button>
              <button onClick={() => reorderSelected("back")} title={tr("Send to back")} style={smallBtn}>{tr("To back")}</button>
              <button onClick={duplicateSelected} title={tr("Duplicate (Ctrl+D). Arrow keys move the selection 1 mm, with Shift 10 mm.")} style={smallBtn}>{tr("Duplicate")}</button>
              {layoutPages.length > 1 && ( /* TASKS.csv #1484 — to another page */
                <select value="" onChange={(e) => { const [how, id] = e.target.value.split(":"); if (!id) return; sendLayoutElement(sel.id, id, how === "move"); if (how === "move") setSelected(null); }} style={{ ...smallBtn, cursor: "pointer" }} aria-label={tr("Copy or move to another page")}>
                  <option value="">{tr("To another page…")}</option>
                  {layoutPages.filter((p) => p.id !== activeLayoutPageId).flatMap((p) => [<option key={`c${p.id}`} value={`copy:${p.id}`}>{tr("Copy to {page}", { page: p.name })}</option>, <option key={`m${p.id}`} value={`move:${p.id}`}>{tr("Move to {page}", { page: p.name })}</option>])}
                </select>
              )}
              <label style={{ ...smallBtn, cursor: "pointer" }} title={tr("A locked element cannot be moved or resized (it can still be edited and deleted)")}><input type="checkbox" checked={!!sel.locked} onChange={(e) => updateSelected({ locked: e.target.checked })} />{tr("Lock")}</label>
            </div>
            {"text" in sel && (sel.type === "text" /* #1868 — several lines (a title block, a note) */
              ? <textarea value={sel.text} onChange={(e) => updateSelected({ text: e.target.value })} rows={Math.min(8, Math.max(2, String(sel.text || "").split("\n").length))} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} aria-label={tr("Text")} />
              : <input value={sel.text} onChange={(e) => updateSelected({ text: e.target.value })} style={inp} />
            )}
            {sel.type === "titleblock" && <TitleBlockControls sel={sel} updateSelected={updateSelected} />}{/* TASKS.csv #1868 */}
            {(sel.type === "title" || sel.type === "text") && (
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: -4, marginBottom: 8, lineHeight: 1.4 }} title={tr("Filled in when the page is shown and printed: the project's name, today's date, this page's number and name, the number of pages, the scale of the page's viewport, the project's coordinate system, the credit lines the licences of fetched terrain and imagery ask for.")}>{tr("Placeholders: {project} {date} {page} {pages} {pagename} {scale} {crs} {credits}")}</div>
            )}{/* TASKS.csv #909 */}
            {/* TASKS.csv #102 — font controls for text elements (title/text). Not callout, which
                already has its own distinct sticky-note styling (fill/border) and fixed text look —
                adding font controls there wasn't asked for and risks changing an established look. */}
            {(sel.type === "text" || sel.type === "title") && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", flex: 1 }}>{tr("Size (pt)")}<input type="number" min="5" step="0.5" value={Math.round(((sel.fontSize ?? (sel.type === "title" ? 26 : printPx(printPt.body))) / PX_PER_PT) * 2) / 2} onChange={(e) => updateSelected({ fontSize: printPx(Math.max(5, Number(e.target.value) || printPt.body)) })} style={{ ...inp, marginTop: 4, marginBottom: 0 }} />
                  </label>
                  <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Colour")}<input type="color" value={sel.color || INK} onChange={(e) => updateSelected({ color: e.target.value })} style={{ display: "block", marginTop: 4, width: 34, height: 30, padding: 0, border: "1px solid var(--color-border)", borderRadius: 5, background: "none", cursor: "pointer" }} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                  <ToolIconBtn icon={<Bold size={14} />} title={tr("Bold")} onClick={() => updateSelected({ bold: !(sel.bold ?? sel.type === "title") })} active={sel.bold ?? sel.type === "title"} />
                  <ToolIconBtn icon={<Italic size={14} />} title={tr("Italic")} onClick={() => updateSelected({ italic: !sel.italic })} active={!!sel.italic} />
                  <ToolIconBtn icon={<AlignLeft size={14} />} title={tr("Align left")} onClick={() => updateSelected({ align: "left" })} active={(sel.align || "left") === "left"} />
                  <ToolIconBtn icon={<AlignCenter size={14} />} title={tr("Align centre")} onClick={() => updateSelected({ align: "center" })} active={sel.align === "center"} />
                  <ToolIconBtn icon={<AlignRight size={14} />} title={tr("Align right")} onClick={() => updateSelected({ align: "right" })} active={sel.align === "right"} />
                </div>
              </div>
            )}
            {/* TASKS.csv #102 — frame/border customization (already built for viewport, see
                ViewportControls below) extended to text/title/legend elements, reusing the exact same
                frameWidth/frameColor/frameStyle fields and control shape rather than a second UI. */}
            {(sel.type === "text" || sel.type === "title" || sel.type === "legend") && (
              <FrameControls sel={sel} updateSelected={updateSelected} />
            )}
            {sel.type === "table" && ( /* TASKS.csv #911 */
              <>
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Table title")}<input value={sel.title || ""} onChange={(e) => updateSelected({ title: e.target.value })} style={inp} /></label>
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Note under the table")}<textarea rows={3} value={sel.note || ""} onChange={(e) => updateSelected({ note: e.target.value })} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></label>{/* TASKS.csv #936 */}
                <div style={{ display: "flex", gap: 6 }}>
                  <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", flex: 1 }}>{tr("Text size (pt)")}<input type="number" min="5" max="14" step="0.5" value={sel.fontPt || printPt.small} onChange={(e) => updateSelected({ fontPt: Math.max(5, Math.min(14, Number(e.target.value) || printPt.small)) })} style={inp} /></label>
                  {sel.source === "collars" && <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", flex: 1 }}>{tr("Rows at most")}<input type="number" min="1" step="1" value={sel.maxRows || 40} onChange={(e) => updateSelected({ maxRows: Math.max(1, Math.round(Number(e.target.value) || 40)) })} style={inp} /></label>}
                </div>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: -4, marginBottom: 8, lineHeight: 1.4 }}>
                  {sel.source === "collars" ? tr("Kept up to date with the project's collars, sorted by hole; holes beyond the row limit are counted in the last line.") : tr("A copy of the results when it was sent (from {from}); send it again to update it.", { from: sel.from || tr("Best intercepts") })}</div>
                {sel.source === "collars" && (() => { // TASKS.csv #1638 — an appendix of every hole: a first row, a filter, continuation pages
                  const sl = collarTableSlice(sortedCollars(tableCollars || []), { firstRow: sel.firstRow, maxRows: sel.maxRows, filter: sel.holeFilter });
                  const conts = sl.after > 0 ? continuationTables(sel, sl.total) : [];
                  return (<>
                    <div style={{ display: "flex", gap: 6 }}>
                      <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", flex: 1 }}>{tr("First row")}<input type="number" min="1" step="1" value={sel.firstRow || 1} onChange={(e) => updateSelected({ firstRow: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={inp} /></label>
                      <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", flex: 1 }}>{tr("Holes containing")}<input type="text" value={sel.holeFilter || ""} placeholder={tr("all")} onChange={(e) => updateSelected({ holeFilter: e.target.value, firstRow: 1 })} style={inp} /></label>
                    </div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: -4, marginBottom: 6 }}>{tr("Rows {a}–{b} of {n}.", { a: sl.total ? sl.start + 1 : 0, b: sl.end, n: sl.total })}</div>
                    {conts.length > 0 && <button onClick={() => addLayoutPages(conts.map((t, i) => ({ name: `${activePage?.name || tr("Collars")} (${i + 2})`, elements: [t], batch: `collars_${sel.id}` })))} style={{ ...pBtn, marginBottom: 8 }}>{tr("Continue on {n} new page(s)", { n: conts.length })}</button>}
                  </>);
                })()}
                <FrameControls sel={sel} updateSelected={updateSelected} />
              </>
            )}
            {sel.type === "scale" && (() => { // TASKS.csv #1635 — what the bar measures
              const ts = scaleBarTargets(elements);
              return (<>
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>{tr("Bound to")}<select value={sel.boundTo || ""} onChange={(e) => { const v = ts.find((t) => t.id === e.target.value); updateSelected(v ? bindScaleBar(sel, v) : { boundTo: null }); }} style={{ ...inp, marginTop: 4 }}>
                    <option value="">{tr("Nothing (a free bar)")}</option>
                    {ts.map((v) => <option key={v.id} value={v.id}>{v.type === "drillplan" ? tr("Drill plan") : v.type === "viewport" ? viewportName(v, elements.filter((e) => e.type === "viewport").findIndex((e) => e.id === v.id), themes) /* #1489 */ : tr("{v} (cross-section)", { v: v.label || v.id })}</option>)}
                  </select>
                </label>
                {!sel.boundTo && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Not tied to a view: its length is not a distance on any map of this page. Bind it to a view above (it then follows that view's scale).")}</div>}
              </>);
            })()}
            {"meters" in sel && (
              <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Scale length (m)")}<input type="number" value={sel.meters} onChange={(e) => updateSelected({ meters: Number(e.target.value) })} style={inp} />
              </label>
            )}
            {/* Manual rotation for elements other than "viewport" (which has its own Rotation field
                inside ViewportControls below) — mainly for the north arrow (TASKS.csv #67), whether
                set by hand or nudged after "Sync north arrow". */}
            {sel.type === "north" && (() => {
              // TASKS.csv #1632 — a tied arrow shows its view's live angle; typing an angle unties it
              const live = sel.boundTo ? northRotationOf(elements.find((v) => v.id === sel.boundTo)) : null;
              return (<>
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Rotation (°)")}<input type="number" value={Math.round((live ?? sel.rotation ?? 0) * 10) / 10} onChange={(e) => updateSelected({ rotation: Number(e.target.value) || 0, boundTo: null })} style={inp} />
                </label>
                {live != null && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: -4, marginBottom: 6 }}>{tr("Follows its view's north. Typing an angle frees it.")}</div>}
              </>);
            })()}
            {/* TASKS.csv #399 — grid / true / magnetic north diagram. Assessment-report maps are expected to
                declare which north they show; the plain arrow is GRID north. Convergence and IGRF-14
                declination are computed for a date at the centre of the first top-down viewport capture on
                this page (or the collars' centroid), and printed with the diagram. */}
            {sel.type === "north" && (() => {
              const vp = elements.find((e) => e.type === "viewport" && e.targetWorld);
              const at = vp ? vp.targetWorld : collars.length ? { x: collars.reduce((t, c) => t + c.x, 0) / collars.length, y: collars.reduce((t, c) => t + c.y, 0) / collars.length } : null;
              // TASKS.csv #2310 — the local calendar date, not UTC; #1773 — the collars' drilling date first (the latest program), else today
              const drill = collarDrillDate(collars);
              const date = sel.declDate || drill?.date || localDate();
              const compute = () => {
                // TASKS.csv #2299 — not from the placeholder CRS: true and magnetic north need the map's real location
                if (project?.crsSet === false) { updateSelected({ decl: null, declError: tr("This project has no coordinate system set, so true and magnetic north can't be computed. Set the CRS in the status bar; the plain arrow shows grid north.") }); return; }
                const o = at && project?.epsg ? azimuthToGridOffset("magnetic", at.x, at.y, project.epsg, date) : null;
                if (!o) { updateSelected({ decl: null, declError: at ? "Couldn't compute it for this project's coordinate system or date." : "Needs a viewport capture or collars to know where the map is." }); return; }
                // TASKS.csv #2478 — the yearly change at this place, from IGRF a year later (the caption printed a fixed 0.1-0.2°/yr)
                const o2 = azimuthToGridOffset("magnetic", at.x, at.y, project.epsg, yearLater(date));
                const rate = o2 && Number.isFinite(o2.declination) ? o2.declination - o.declination : null;
                // #1773 / #2137 — the diagram grows from the 54 px arrow to its own box: kept on the sheet
                updateSelected({ decl: { convergence: o.convergence, declination: o.declination, date, at, rate }, declError: null, ...keepOnSheet(sel.x, sel.y, A4.w, A4.h) });
              };
              return (
                <div style={{ marginTop: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="date" value={date} onChange={(e) => updateSelected({ declDate: e.target.value })} aria-label={tr("Declination date")} style={{ ...inp, width: 130 }} />
                    <button onClick={compute} style={{ ...pBtn, marginBottom: 0 }}>{sel.decl ? tr("Update GN/TN/MN") : tr("Show grid / true / magnetic north")}</button>
                  </div>
                  {sel.decl && <button onClick={() => updateSelected({ decl: null })} style={{ ...pBtn, marginTop: 4, marginBottom: 0 }}>{tr("Back to a plain north arrow")}</button>}
                  {!sel.declDate && drill && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>{tr("Date from the collars' {field} (the latest drilling). Change it for another date.", { field: drill.field })}</div>}{/* #1773 */}
                  {sel.declError && <div style={{ color: "var(--color-danger-fg)", marginTop: 4 }}>{sel.declError}</div>}
                </div>
              );
            })()}
            {/* Legend editing (TASKS.csv — "edit all elements", per the Castilla example the user
                referenced: add/rename/recolor/remove/reorder rows). Previously el.items was a fixed
                array set at creation with no way to touch it afterward. */}
            {"items" in sel && (
              <div style={{ marginTop: 4 }}>
                {/* "The legend should be able to load the lithologies present in the view attached to
                    it." Bind this legend to one of the page's viewport elements, then pull the
                    lithology units actually visible in that viewport's saved theme (color + name via
                    the same colorForLithology/UNIT_NAMES the 3D viewer itself uses). */}
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>{tr("Bound viewport / cross-section")}<select value={sel.boundViewportId || ""} onChange={(e) => updateSelected({ boundViewportId: e.target.value || null })} style={{ ...inp, marginTop: 4 }}>
                    <option value="">{tr("— none —")}</option>
                    {elements.filter((el) => el.type === "viewport").map((el, i) => (
                      <option key={el.id} value={el.id}>{viewportName(el, i, themes)}</option>
                    ))}
                    {/* Cross-section snapshots (type "image") carry their own legendItems, computed
                        from exactly what was drawn in that section — see snapshotToLayout/
                        buildSectionPayload. Only images that actually have legend data are listed;
                        a plain photo/logo dropped onto the page has nothing to sync from. */}
                    {elements.filter((el) => el.type === "image" && el.legendItems && el.legendItems.length).map((el) => (
                      <option key={el.id} value={el.id}>{tr("{v} (cross-section)", { v: el.label || el.id })}</option>
                    ))}
                  </select>
                </label>
                <button onClick={() => syncLegendFromView(sel.id)} disabled={!sel.boundViewportId} style={{ ...pBtn, opacity: sel.boundViewportId ? 1 : 0.5 }}>
                  <RefreshCw size={12} />{" "}{tr("Load from view / section")}</button>
                {legendSyncState(sel, elements.find((el) => el.id === sel.boundViewportId)) === "stale" && ( /* TASKS.csv #2471 */
                  <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text-strong)", margin: "4px 0 8px", lineHeight: 1.4 }}>
                    {tr("Out of step with its viewport: the viewport was refreshed after these rows were loaded, and they were edited (or loaded before this check existed), so they were kept. Load from view to update them.")}</div>
                )}
                {syncNotice && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-accent-dark)", margin: "4px 0 8px", lineHeight: 1.4 }}>{syncNotice}</div>}
                {sel.items.map(([name, color, opt], i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                    {opt?.heading || opt?.ramp || opt?.note /* TASKS.csv #725 — a group heading or a ramp has no single colour; #1633 a note */
                      ? <span title={opt.ramp ? tr("Colour scale") : opt.note ? tr("Note") : tr("Group heading")} style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 4, border: "1px solid var(--color-border)", background: opt.ramp ? `linear-gradient(to right, ${opt.ramp.colors.join(", ")})` : "transparent" }} />
                      : <input type="color" value={color} onChange={(e) => {
                        const items = sel.items.map((it, j) => j === i ? [it[0], e.target.value, ...it.slice(2)] : it);
                        updateSelected({ items });
                      }} style={{ width: 24, height: 24, padding: 0, border: "1px solid var(--color-border)", borderRadius: 4, background: "transparent", flexShrink: 0 }} />}
                    <input value={name} onChange={(e) => {
                      const items = sel.items.map((it, j) => j === i ? [e.target.value, ...it.slice(1)] : it);
                      updateSelected({ items });
                    }} style={{ ...inp, marginBottom: 0, flex: 1 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => { if (i === 0) return; const items = sel.items.slice(); [items[i - 1], items[i]] = [items[i], items[i - 1]]; updateSelected({ items }); }}
                        style={{ cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "var(--color-border-light)" : "var(--color-text-secondary)", fontSize: "var(--font-size-xs)", lineHeight: 1 }} title={tr("Move up")}>▲</div>
                      <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => { if (i === sel.items.length - 1) return; const items = sel.items.slice(); [items[i + 1], items[i]] = [items[i], items[i + 1]]; updateSelected({ items }); }}
                        style={{ cursor: i === sel.items.length - 1 ? "default" : "pointer", color: i === sel.items.length - 1 ? "var(--color-border-light)" : "var(--color-text-secondary)", fontSize: "var(--font-size-xs)", lineHeight: 1 }} title={tr("Move down")}>▼</div>
                    </div>
                    <Trash2 aria-label={tr("Remove this item")} title={tr("Remove this item")} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: sel.items.length > 1 ? "pointer" : "default", color: sel.items.length > 1 ? "var(--color-text-secondary)" : "var(--color-border-light)", flexShrink: 0 }}
                      onClick={() => { if (sel.items.length <= 1) return; updateSelected({ items: sel.items.filter((_, j) => j !== i) }); }} />
                  </div>
                ))}
                <button onClick={() => updateSelected({ items: [...sel.items, ["Item", "#55606e"]] })} style={{ ...pBtn, marginTop: 2 }}>
                  <Plus size={12} />{" "}{tr("Add row")}</button>
              </div>
            )}
            {sel.type === "viewport" && (
              <ViewportControls crsUnset={project?.crsSet === false} steepHoles={!!(sel.planView && sel.trueScale && allHolesSteep(tableCollars, holesInFrame(sel, tableCollars)))} /* #2473 */
                legendReloaded={elements.some((el) => el.type === "legend" && el.boundViewportId === sel.id && el.autoReloaded && el.loadedCapturedAt === sel.capturedAt)} /* #2471 */
                sel={sel} themes={themes} updateSelected={updateSelected} syncNotice={syncNotice}
                onRefresh={() => startViewportRender(sel.themeId, sel.id, sel.trueScale, { fixedScale: sel.fixedScale, elementW: sel.w, elementH: sel.h })}
                onRebind={(themeId) => startViewportRender(themeId, sel.id, sel.trueScale, { fixedScale: sel.fixedScale, elementW: sel.w, elementH: sel.h })}
                onEnter={() => startInteractiveViewportEdit(sel.themeId, sel.id, sel.trueScale, { fixedScale: sel.fixedScale, elementW: sel.w, elementH: sel.h })}
                onFit={() => fitViewport(sel)} hasHoles={(collars || []).length > 0} /* #1866 — the button's label */
                // TASKS.csv #1007 — Matt: "when I select the scale, it won't change. it only changes when I click on fit all
                // holes". Choosing a scale only stored it and waited for a Refresh; it now re-captures at once, centred where
                // the last capture was (as Fit does), so the frame shows that scale straight away. 0 = free (as framed).
                onRescale={(scale) => {
                  updateSelected(scale > 0 ? { fixedScale: scale, trueScale: true } : { fixedScale: 0 });
                  startViewportRender(sel.themeId, sel.id, scale > 0 ? true : sel.trueScale, { fixedScale: scale > 0 ? scale : 0, elementW: sel.w, elementH: sel.h, ...(sel.targetWorld ? { centreWorld: sel.targetWorld } : {}) });
                }}
                others={elements.filter((o) => o.type === "viewport" && o.id !== sel.id)} allViewports={elements.filter((o) => o.type === "viewport")} /* #1489 — numbered by page order */
                onSyncScaleBar={() => syncScaleBarForElement(sel, sel.worldHeightAtTarget, capturedSize(sel).h)}
                onSyncNorth={() => {
                  // TASKS.csv #67 — same pattern as onSyncScaleBar just above: apply this viewport's
                  // captured camera azimuth to the nearest existing north-arrow element, or add one if
                  // there isn't one yet. See the cameraAzimuthDeg comment in ViewerModule.jsx for how
                  // that angle is derived (reuses the compass rose's own -theta formula).
                  if (sel.cameraAzimuthDeg == null) return;
                  // #1477 — a frame turned on the sheet turns its north with it: the arrow is the camera azimuth plus the frame's rotation
                  // #1632 — and the arrow is tied to this view from now on (it follows refreshes, fits and rescales)
                  const deg = northRotationOf(sel);
                  setElements((els) => {
                    const hasNorth = els.some((el) => el.type === "north");
                    if (hasNorth) return els.map((el) => el.type === "north" ? { ...el, rotation: deg, boundTo: sel.id } : el);
                    return [...els, { id: `north_${Date.now()}`, type: "north", x: 1000, y: 40, rotation: deg, boundTo: sel.id }];
                  });
                }}
              />
            )}
            {/* "Each viewport and cross section need an option to assign a scale bar to it." Cross-
                section snapshots carry worldWidthAtCaptureM (see SectionWindow.jsx's snapshotToLayout)
                only when they came from the pop-out's "Snapshot to Layout" button — a plain imported
                photo or logo has no known real-world scale, so this stays hidden for those. */}
            {isDepthImage(sel) && <DepthScaleControls sel={sel} pageH={A4.h} updateSelected={updateSelected} /> /* TASKS.csv #1480 */}
            {sel.type === "image" && sel.worldWidthAtCaptureM != null && (
              <>
                <SectionScaleControls sel={sel} pageW={A4.w} pageH={A4.h} updateSelected={updateSelected} />
                <button onClick={() => syncScaleBarForElement(sel, sel.worldWidthAtCaptureM, sel.w)} style={{ ...pBtn, marginTop: 4 }}>
                  <Ruler size={12} />{" "}{sel.planMap ? tr("Assign scale bar to this map") : tr("Assign scale bar to this section")}</button>
                {syncNotice && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-accent-dark)", margin: "4px 0 8px", lineHeight: 1.4 }}>{syncNotice}</div>}
              </>
            )}
            {/* A plain imported photo/logo ("image" with no worldWidthAtCaptureM) has no known
                real-world scale — nothing to assign here, silently (no button shown at all), same as
                before. */}
            {/* TASKS.csv #19 — shape/annotation property editors */}
            {sel.type === "drillplan" && (() => { // TASKS.csv #1639 — the drill plan's scale, extent, labels and colours
              const dd = drillPlanDrawing(sel, tableCollars || [], assays, assayElements); // assays: #2473
              return (<>
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>{tr("Scale 1 :")}<select value={String(sel.scale)} onChange={(e) => updateSelected({ scale: Number(e.target.value) })} style={{ ...inp, marginTop: 4 }}>
                  {[...new Set([...SCALE_PRESETS, sel.scale])].sort((a, b) => a - b).map((s) => <option key={s} value={String(s)}>{Number(s).toLocaleString()}</option>)}
                </select></label>
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }} title={tr("The coordinate grid's spacing in metres. Blank: about five lines across the frame; 0: no grid.")}>{tr("Grid (m)")}<input type="number" min="0" step="any" value={sel.gridM ?? ""} placeholder={tr("auto")} onChange={(e) => updateSelected({ gridM: e.target.value === "" ? undefined : Number(e.target.value) })} style={{ width: 80 }} aria-label={tr("Grid spacing (m)")} /></label>{/* #2301 */}
                <div style={{ display: "flex", gap: 6 }}>
                  <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", flex: 1 }}>{tr("Centre E")}<input type="number" value={Math.round(sel.centre?.x || 0)} onChange={(e) => updateSelected({ centre: { ...sel.centre, x: Number(e.target.value) } })} style={inp} /></label>
                  <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", flex: 1 }}>{tr("Centre N")}<input type="number" value={Math.round(sel.centre?.y || 0)} onChange={(e) => updateSelected({ centre: { ...sel.centre, y: Number(e.target.value) } })} style={inp} /></label>
                </div>
                <button onClick={() => { const fit = fitDrillPlan(filterHoles(tableCollars || [], sel.holeFilter), sel.w, sel.h, SCALE_PRESETS); if (fit) updateSelected(fit); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "6px 10px", marginBottom: 8, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text-secondary)", fontSize: "var(--font-size-base)", cursor: "pointer" }}><Maximize2 size={14} />{" "}{tr("Fit the holes at a round scale")}</button>
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>{tr("Holes containing")}<input type="text" value={sel.holeFilter || ""} placeholder={tr("all")} onChange={(e) => updateSelected({ holeFilter: e.target.value })} style={{ ...inp, marginTop: 4 }} /></label>
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>{tr("Labels")}<select value={sel.labels || "all"} onChange={(e) => updateSelected({ labels: e.target.value })} style={{ ...inp, marginTop: 4 }}>
                  <option value="all">{tr("Every hole with room for one")}</option>
                  <option value="none">{tr("None")}</option>
                </select></label>
                {sel.labels !== "none" && <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>{tr("Label only holes containing")}<input type="text" value={sel.labelFilter || ""} placeholder={tr("all")} onChange={(e) => updateSelected({ labelFilter: e.target.value })} style={{ ...inp, marginTop: 4 }} /></label>}
                <DrillPlanColourControls sel={sel} updateSelected={updateSelected} collars={tableCollars || []} assayElements={assayElements} colouring={dd.colouring} inp={inp} />{/* TASKS.csv #2473 — replaces the series tick */}
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>{tr("Text size (pt)")}<input type="number" min="5" max="12" step="0.5" value={sel.fontPt || 7} onChange={(e) => updateSelected({ fontPt: Math.max(5, Math.min(12, Number(e.target.value) || 7)) })} style={{ ...inp, marginTop: 4 }} /></label>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("{n} hole(s) in the frame; {p} of {l} labelled ({s} without a label where it would overlap another).", { n: dd.holes.length, p: dd.labels.placed.length, l: dd.labelled, s: dd.labels.skipped })} {tr("Drawn from the collars, not the 3D view: traces run straight from each collar's azimuth, dip and length. Insert > Scale bar binds to it.")}</div>
                <FrameControls sel={sel} updateSelected={updateSelected} />
              </>);
            })()}
            {sel.type === "rect" && (
              <>
                <ColorRow label={tr("Stroke")} value={sel.stroke} onChange={(v) => updateSelected({ stroke: v })} />
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Stroke width")}<input type="number" min="0" value={sel.strokeWidth} onChange={(e) => updateSelected({ strokeWidth: Math.max(0, Number(e.target.value) || 0) })} style={inp} />
                </label>
                <ColorRow label={tr("Fill")} value={sel.fill} onChange={(v) => updateSelected({ fill: v })} />
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <input type="checkbox" checked={sel.fillOpacity > 0} onChange={(e) => updateSelected({ fillOpacity: e.target.checked ? 1 : 0 })} />{" "}{tr("Filled")}</label>
              </>
            )}
            {sel.type === "arrow" && (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", flex: 1 }}>{tr("Length")}<input type="number" min="10" value={sel.length} onChange={(e) => updateSelected({ length: Math.max(10, Number(e.target.value) || sel.length) })} style={{ ...inp, marginTop: 4, marginBottom: 0 }} />
                  </label>
                  <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", flex: 1 }}>{tr("Angle (°)")}<input type="number" value={sel.angle} onChange={(e) => updateSelected({ angle: Number(e.target.value) || 0 })} style={{ ...inp, marginTop: 4, marginBottom: 0 }} />
                  </label>
                </div>
                <ColorRow label={tr("Colour")} value={sel.stroke} onChange={(v) => updateSelected({ stroke: v })} />
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Stroke width")}<input type="number" min="0.5" value={sel.strokeWidth} onChange={(e) => updateSelected({ strokeWidth: Math.max(0.5, Number(e.target.value) || 1) })} style={inp} />
                </label>
              </>
            )}
            {sel.type === "callout" && (
              <>
                <ColorRow label={tr("Fill")} value={sel.fill} onChange={(v) => updateSelected({ fill: v })} />
                <ColorRow label={tr("Border")} value={sel.stroke} onChange={(v) => updateSelected({ stroke: v })} />
              </>
            )}
            {sel.type === "freehand" && (
              <>
                <ColorRow label={tr("Colour")} value={sel.stroke} onChange={(v) => updateSelected({ stroke: v })} />
                <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Stroke width")}<input type="number" min="0.5" value={sel.strokeWidth} onChange={(e) => updateSelected({ strokeWidth: Math.max(0.5, Number(e.target.value) || 1) })} style={inp} />
                </label>
              </>
            )}
            <button onClick={removeSelected} style={{ ...pBtn, background: "#2a1a1a", border: "1px solid var(--color-danger-border-strong)", color: "var(--color-danger-text)", marginTop: 10 }}>{tr("Remove element")}</button>
          </>
        )}

        {/* TASKS.csv #18 — saved layout templates */}
        {templatesOpen && <div className="ge-section-label" style={{ marginTop: 20 }}>{tr("Templates")}</div>}
        {templatesOpen && ( /* TASKS.csv #1868 — starter templates first, then this project's, then Import */
          <div style={{ marginBottom: 8, padding: 6, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6 }}>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", padding: "2px 7px" }}>{tr("Starter templates: a neatline, a figure title and a title block at the paper size named; add the map or section view after.")}</div>
            {STOCK_TEMPLATES.map((t) => <div key={t.id} role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => loadTemplate({ ...t, stock: true })} style={{ padding: "5px 7px", fontSize: "var(--font-size-base)", color: "var(--color-text)", cursor: "pointer", borderRadius: 4 }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-hover-bg)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{tr(t.name)}</div>)}
            {layoutTemplates.length > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", padding: "6px 7px 2px", borderTop: "1px solid var(--color-border)", marginTop: 4 }}>{tr("Saved in this project")}</div>}
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {layoutTemplates.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", borderRadius: 4 }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-hover-bg)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => loadTemplate(t)} style={{ flex: 1, fontSize: "var(--font-size-base)", color: "var(--color-text)", cursor: "pointer" }}>{t.name}</span>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("{elements} el.", { elements: t.elements.length })}</span>
                <Download role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} aria-label={tr("Export the template \"{name}\" as a file", { name: t.name })} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => exportTemplate(t)} />{/* #1868 */}
                {hasComputerTemplates() && <HardDrive role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} aria-label={tr("Keep the template \"{name}\" on this computer, for every project", { name: t.name })} title={tr("Keep the template \"{name}\" on this computer, for every project", { name: t.name })} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => keepOnComputer(t)} />}{/* #1487 */}
                <Trash2 role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} onClick={() => { if (confirmDestructive(tr("Delete template \"{name}\"?", { name: t.name }))) deleteLayoutTemplate(t.id); }} aria-label={tr("Delete template \"{name}\"", { name: t.name })} title={tr("Delete template \"{name}\"", { name: t.name })} />
              </div>
            ))}
          </div>
            <ComputerTemplates onLoad={loadTemplate} refreshKey={computerTplKey} onMessage={setTemplateMsg} />{/* #1487 */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", borderTop: "1px solid var(--color-border)", marginTop: 4, paddingTop: 6 }}>
              <button type="button" onClick={() => templateInput.current?.click()} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-sm)", padding: "3px 8px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg-subtle)", color: "var(--color-text)", cursor: "pointer" }}><Upload size={12} /> {tr("Import template…")}</button>
            </div>
            {templateMsg && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", padding: "4px 7px", lineHeight: 1.4 }}>{templateMsg}</div>}
          </div>
        )}

        {/* TASKS.csv #67 — QGIS-style alignment grid + rulers. */}
        <div className="ge-section-label" style={{ marginTop: 20 }}>{tr("View")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
          <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setShowGrid((v) => !v)} style={{ cursor: "pointer", color: showGrid ? "var(--color-accent)" : "var(--color-text-disabled)" }} title={showGrid ? tr("Hide grid") : tr("Show grid")}>
            <Grid3x3 size={14} />
          </div>
          <div style={{ flex: 1, fontSize: "var(--font-size-base)", color: showGrid ? "var(--color-text)" : "var(--color-text-faint)" }}>{tr("Grid + snap")}</div>
          {metersPerPx ? (
            <>
              <input type="number" min={1} value={gridMeters} onChange={(e) => setGridMeters(Math.max(1, Number(e.target.value) || 100))} style={{ width: 46, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text)", fontSize: "var(--font-size-sm)", padding: "3px 5px" }} />
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>m</span>
            </>
          ) : (
            <>
              <input type="number" min={1} value={gridMm} onChange={(e) => setGridMm(Math.max(1, Number(e.target.value) || 10))} style={{ width: 46, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text)", fontSize: "var(--font-size-sm)", padding: "3px 5px" }} />
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("mm")}</span>
            </>
          )}
        </div>
        {/* TASKS.csv #101 — bind the grid's real-world spacing to a Viewport's own captured scale
            instead of a fixed paper-space mm value, so a "100m grid" can sit directly over the map
            the way a printed topo sheet's grid would, staying correct across refreshes/rebinds. */}
        <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>{tr("Bind grid to viewport")}<select value={gridBoundViewportId} onChange={(e) => setGridBoundViewportId(e.target.value)} style={inp}>
            <option value="">{tr("None — free {gridMm}mm grid", { gridMm })}</option>
            {elements.filter((el) => el.type === "viewport").map((el, i) => (
              <option key={el.id} value={el.id}>
                {viewportName(el, i, themes)}{el.worldHeightAtTarget ? "" : tr(" (not rendered yet)")}
              </option>
            ))}
          </select>
        </label>
        {gridBoundViewportId && !metersPerPx && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 10, lineHeight: 1.4 }}>{tr("This viewport hasn't been rendered yet — use \"Refresh from theme\" on it once to get a real-world scale to bind to.")}</div>
        )}
        {metersPerPx && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 10, lineHeight: 1.4 }}>{tr("Grid spacing is locked to {gridMeters}m in the real world using this viewport's current scale — recomputes automatically whenever it's refreshed or rebound.", { gridMeters })}</div>
        )}

        <div className="ge-section-label" style={{ marginTop: 20 }}>{tr("Adding views")}</div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 8, lineHeight: 1.5 }}>{tr("Use")}{" "}<b>{tr("Current view")}</b>{" "}{tr("or")}{" "}<b>{tr("Theme view")}</b>{" "}{tr("on this tab's ribbon,")}{" "}<b>{tr("Snapshot")}</b>{" "}{tr("on the 3D View ribbon (Output), or the snapshot button in a cross-section pop-out, to put a view on the page below — drag to place it, drag its handles to resize it, and pick its scale in the sidebar.")}</div>
      </div>

      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      <div className="ge-main" style={{ overflow: "auto", background: "#0a0d11", padding: 0, display: "flex", flexDirection: "column" }}>
        {/* TASKS.csv #69 — multiple layout pages. Own row above the page canvas rather than folded
            into the sidebar, so it reads as "which page am I looking at" the same way browser/editor
            tabs do, right next to the thing it switches. Hidden on print (see app.css) — only the
            active page's canvas below should ever end up on paper. */}
        <div className="ge-layout-pagebar" style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 30px 0", flexShrink: 0, minWidth: 0 }}>
          {/* TASKS.csv #1636 — the tabs scroll in their own strip; the page controls after it stay on screen (44 atlas pages pushed them off) */}
          <div className="ge-layout-pagetabs" style={{ display: "flex", alignItems: "center", gap: 4, flex: "1 1 auto", minWidth: 60, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "thin" }}>
          {layoutPages.map((p) => {
            const isActive = p.id === activeLayoutPageId;
            return (
              <div role="button" tabIndex={0} onKeyDown={activateOnKey}
                key={p.id}
                onClick={() => switchLayoutPage(p.id)}
                title={p.name}
                style={{
                  display: "flex", alignItems: "center", gap: 6, maxWidth: 160, padding: "5px 9px",
                  background: isActive ? "var(--color-bg-subtle)" : "var(--color-bg)", border: `1px solid ${isActive ? "var(--color-selected-border)" : "#f0f1f3"}`,
                  borderBottom: isActive ? "1px solid var(--color-bg-subtle)" : "1px solid #f0f1f3", borderRadius: "6px 6px 0 0",
                  color: isActive ? "var(--color-text)" : "var(--color-text-faint)", fontSize: "var(--font-size-base)", cursor: "pointer", position: "relative", top: 1,
                }}
              >
                <span
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  onDoubleClick={(e) => { e.stopPropagation(); askPrompt("Rename page", p.name, (name) => { if (name) renameLayoutPage(p.id, name); }); }}
                >
                  {p.name}
                </span>
                <Trash2 role="button" tabIndex={0} onKeyDown={activateOnKey}
                  aria-label={tr("Delete page \"{name}\"", { name: p.name })} title={tr("Delete page \"{name}\"", { name: p.name })} /* TASKS.csv #238 — was keyboard-reachable but nameless */
                  size={12}
                  style={{ flexShrink: 0, color: "var(--color-text-muted)" }}
                  onClick={(e) => { e.stopPropagation(); if (window.confirm(tr("Delete page \"{name}\"? (Ctrl+Z undoes this.)", { name: p.name }))) deleteLayoutPage(p.id); }}
                />
              </div>
            );
          })}
          <button
            onClick={() => addLayoutPage()}
            title={tr("Add page")}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, marginBottom: 2, background: "transparent", border: "1px solid transparent", borderRadius: 5, color: "var(--color-text-muted)", cursor: "pointer" }}
          >
            <Plus size={14} />
          </button>
          </div>
          {layoutPages.length > 8 && ( /* #1636 — a picker for many pages */
            <select value={activeLayoutPageId} onChange={(e) => switchLayoutPage(e.target.value)} aria-label={tr("Go to page")} title={tr("Go to page")}
              style={{ height: 22, marginBottom: 2, marginLeft: 4, maxWidth: 170, flexShrink: 0, fontSize: "var(--font-size-sm)", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", color: "var(--color-text)" }}>
              {layoutPages.map((p, i) => <option key={p.id} value={p.id}>{`${i + 1}. ${p.name}`}</option>)}
            </select>
          )}
          {activePage?.batch && (() => { // #1636 — the generated pages of this one's run, in one action
            const ids = layoutPages.filter((p) => p.batch === activePage.batch).map((p) => p.id);
            return ids.length > 1 ? <button onClick={() => { if (window.confirm(tr("Delete the {n} pages generated with this one? (Ctrl+Z undoes this.)", { n: ids.length }))) deleteLayoutPage(ids); }}
              style={{ height: 22, marginBottom: 2, marginLeft: 4, padding: "0 8px", flexShrink: 0, background: "transparent", border: "1px solid var(--color-border)", borderRadius: 5, color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)", cursor: "pointer" }}>
              {tr("Remove these {n} generated pages", { n: ids.length })}</button> : null;
          })()}
          {/* TASKS.csv #398 — paper size / orientation of this page (also used for its PDF export). */}
          <select
            value={pageFormat.size}
            onChange={(e) => setLayoutPageFormat(activeLayoutPageId, { ...pageFormat, size: e.target.value })}
            aria-label={tr("Paper size")} title={tr("Paper size of this page (also used for its PDF export)")}
            style={{ height: 22, marginBottom: 2, marginLeft: 8, fontSize: "var(--font-size-sm)", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", color: "var(--color-text)" }}
          >
            {Object.entries(PAGE_FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
          </select>
          <select
            value={pageFormat.orientation}
            onChange={(e) => setLayoutPageFormat(activeLayoutPageId, { ...pageFormat, orientation: e.target.value })}
            aria-label={tr("Orientation")} title={tr("Page orientation")}
            style={{ height: 22, marginBottom: 2, marginLeft: 4, fontSize: "var(--font-size-sm)", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", color: "var(--color-text)" }}
          >
            <option value="landscape">{tr("Landscape")}</option>
            <option value="portrait">{tr("Portrait")}</option>
          </select>
          {/* TASKS.csv #909 — canvas zoom and the PNG export's resolution */}
          <select value={zoomChoice} onChange={(e) => setZoom(e.target.value)} aria-label={tr("Zoom")} title={tr("Zoom of the sheet on screen (the paper size does not change)")}
            style={{ height: 22, marginBottom: 2, marginLeft: 8, fontSize: "var(--font-size-sm)", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", color: "var(--color-text)" }}>
            <option value="fit">{tr("Fit page ({pct} %)", { pct: Math.round(fitZoom * 100) })}</option>
            {[0.5, 0.75, 1, 1.5, 2].map((z) => <option key={z} value={String(z)}>{Math.round(z * 100)} %</option>)}
          </select>
          <select value={String(pngDpi)} onChange={(e) => { const v = Number(e.target.value) || 300; setPngDpi(v); try { localStorage.setItem("geostrix.layoutPngDpi", String(v)); } catch { /* storage unavailable */ } }} aria-label={tr("PNG resolution")} title={tr("Resolution of Export PNG")}
            style={{ height: 22, marginBottom: 2, marginLeft: 4, fontSize: "var(--font-size-sm)", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", color: "var(--color-text)" }}>
            {[150, 200, 300].map((d) => <option key={d} value={String(d)}>{tr("PNG {dpi} dpi", { dpi: d })}</option>)}
          </select>
          <button
            onClick={() => setAtlasModalOpen(true)}
            title={tr("Generate atlas — batch-create one page per drillhole/section from the current page as a template")}
            style={{ display: "flex", alignItems: "center", gap: 4, height: 22, marginBottom: 2, marginLeft: 4, padding: "0 8px", background: "transparent", border: "1px solid var(--color-border)", borderRadius: 5, color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)", cursor: "pointer" }}
          >
            <LayoutGrid size={12} />{" "}{tr("Atlas…")}</button>
          {exportNote && ( /* TASKS.csv #908 */
            <span role={exportNote.error ? "alert" : "status"} style={{ marginLeft: 10, marginBottom: 2, fontSize: "var(--font-size-sm)", color: exportNote.error ? "var(--color-danger-fg)" : "var(--color-accent-dark)", display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={exportNote.text}>
              {exportNote.text}
              <X size={12} role="button" tabIndex={0} aria-label={tr("Dismiss message")} style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => setExportNote(null)} onKeyDown={activateOnKey} />
            </span>
          )}
        </div>
        {atlasModalOpen && (
          <GenerateAtlasModal
            onClose={() => setAtlasModalOpen(false)}
            templateElements={elements}
            collars={tableCollars} /* #1772 — the same survey fallback as the collar table */
            layers={layers}
            legendOverride={viewerUiState?.legendOverride} // TASKS.csv #1092 — the 3D legend's colours / names
            sections={sections}
            addLayoutPages={addLayoutPages}
            page={A4}
            assays={assays} assayElements={assayElements} /* #1480 — assay tracks on the strip logs */
          />
        )}
        {/* TASKS.csv #788 — the sheet is physical paper (rulers from the left, x in mm): it stays left-to-right in Arabic, or an RTL scroll would open on the page's right edge */}
        <div dir="ltr" ref={areaRef} style={{ overflow: "auto", padding: 30, flex: 1 }}>
        <div style={{ width: (18 + A4.w) * zoom, height: (18 + A4.h) * zoom, margin: "0 auto" }}>{/* TASKS.csv #909 — the scaled sheet's footprint, so the area scrolls to it */}
        <div style={{ display: "inline-grid", gridTemplateColumns: "18px auto", gridTemplateRows: "18px auto", transform: `scale(${zoom})`, transformOrigin: "top left", "--lz": zoom }}>{/* --lz: TASKS.csv #965 — the editing chrome divides by it to keep its screen size */}
          <div />
          <Ruler2D axis="x" length={A4.w} mmStep={gridMm} />
          <Ruler2D axis="y" length={A4.h} mmStep={gridMm} />
          <div
            ref={pageRef}
            className="ge-layout-page"
            style={{
              width: A4.w, height: A4.h, background: "#fbfbf8", position: "relative", boxShadow: "0 4px 30px rgba(0,0,0,0.5)",
              cursor: freehandTool ? "crosshair" : "default",
              outline: dragOverPage ? "2px dashed var(--color-info)" : "none", outlineOffset: 2,
              backgroundImage: showGrid
                ? `linear-gradient(to right, rgba(74,155,224,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(74,155,224,0.18) 1px, transparent 1px)`
                : "none",
              backgroundSize: showGrid ? `${gridSnapPx}px ${gridSnapPx}px` : "auto",
            }}
            // Bug fix, part of the "creating numerous lines" report: starting a freehand stroke on top
            // of an existing element (the default title/legend/north-arrow/scale-bar all sit on a
            // fresh page) used to hit that ELEMENT's own onMouseDown first (which calls
            // e.stopPropagation()), so the click selected/dragged that element instead of drawing —
            // the freehand tool stayed "on" the whole time since startFreehand() was never reached to
            // turn it off, so the very next click ANYWHERE (even an unrelated selection click) would
            // also try to draw, compounding into stray strokes. Capturing mousedown here, before it
            // reaches any child element, means a freehand stroke always starts exactly where the user
            // pressed down, regardless of what's underneath — and reliably turns the tool back off on
            // mouseup every time.
            onMouseDownCapture={(e) => { if (freehandTool) { e.stopPropagation(); startFreehand(e); } }}
            onMouseDown={(e) => { if (freehandTool) return; setSelected(null); setMultiSelected(new Set()); }}
            onDragOver={(e) => { e.preventDefault(); setDragOverPage(true); }}
            onDragLeave={() => setDragOverPage(false)}
            onDrop={onPageDrop}
          >
          {/* TASKS.csv #993 — a locked element is marked on the sheet (not in print): it ignored drags with no sign why */}
          {elements.filter((el) => el.locked).map((el) => (
            <Lock key={`lock_${el.id}`} size={11} aria-hidden="true" style={{ position: "absolute", left: el.x - 13, top: el.y - 13, color: "var(--color-text-muted)", pointerEvents: "none", zIndex: 4 }} />
          ))}
          {withLiveScaleBars(elements).map((el) => (
            <LayoutElement key={el.id} el={el} selected={selected === el.id} multiSelected={multiSelected.size > 1 && multiSelected.has(el.id)} onDown={(e) => { e.stopPropagation(); onDown(e, el); }} onSelect={(id) => { if (selected !== id) { setSelected(id); setMultiSelected(new Set()); } }} onResizeStart={onResizeStart} ctx={textCtx} />
          ))}
          {guides.map((g, i) => ( /* TASKS.csv #910 */
            <div key={`guide${i}`} style={g.axis === "x"
              ? { position: "absolute", left: g.at, top: 0, width: 0, height: A4.h, borderLeft: "calc(1px / var(--lz, 1)) dashed var(--color-guide)", pointerEvents: "none", zIndex: 5 }
              : { position: "absolute", top: g.at, left: 0, height: 0, width: A4.w, borderTop: "calc(1px / var(--lz, 1)) dashed var(--color-guide)", pointerEvents: "none", zIndex: 5 }} />
          ))}
          {freehandPoints.length > 1 && (
            <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }} width={A4.w} height={A4.h}>
              <polyline points={freehandPoints.map((p) => p.join(",")).join(" ")} fill="none" stroke="#4a9be0" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
          )}
          </div>
        </div>
        </div>
        </div>
      </div>
      {promptState && (
        <PromptModal
          title={promptState.title}
          defaultValue={promptState.defaultValue}
          onCancel={() => setPromptState(null)}
          onConfirm={(value) => { promptState.onSubmit(value); setPromptState(null); }}
        />
      )}
    </div>
  );
}

// TASKS.csv #67 — a plain CSS/SVG ruler bar (top: horizontal, left: vertical) with tick marks every
// mmStep and a numbered label every 5th tick, matching the page's own ~96dpi assumption (PX_PER_MM).
// Purely a visual reference alongside the grid overlay — not interactive (no drag-to-place guides).
function Ruler2D({ axis, length, mmStep }) {
  const ticks = [];
  for (let mm = 0, i = 0; mm * PX_PER_MM <= length; mm += mmStep, i++) {
    ticks.push({ px: mm * PX_PER_MM, major: i % 5 === 0, mm });
  }
  const isX = axis === "x";
  return (
    <div style={{ position: "relative", width: isX ? length : 18, height: isX ? 18 : length, background: "var(--color-bg)", overflow: "hidden", flexShrink: 0 }}>
      {ticks.map((t, i) => (
        <div key={i} style={isX
          ? { position: "absolute", left: t.px, top: 0, width: 1, height: t.major ? 10 : 5, background: "#eef1f4" }
          : { position: "absolute", top: t.px, left: 0, height: 1, width: t.major ? 10 : 5, background: "#eef1f4" }
        } />
      ))}
      {ticks.filter((t) => t.major).map((t, i) => (
        <div key={`l${i}`} style={isX
          ? { position: "absolute", left: t.px + 2, top: 9, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontFamily: "'Exo 2', system-ui, sans-serif" }
          : { position: "absolute", top: t.px + 2, left: 9, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontFamily: "'Exo 2', system-ui, sans-serif", writingMode: "vertical-rl" }
        }>{t.mm}</div>
      ))}
    </div>
  );
}

// Sidebar controls for a selected "viewport" element (TASKS.csv #46): rebind to a different theme,
// refresh (re-render the same theme — picks up any data/view changes made since it was last
// captured), rotate, customize the frame (QGIS-style border), and see/apply the approximate scale.
// TASKS.csv #399 — labelled UTM coordinate grid over a viewport. Only offered for a TOP-DOWN, TRUE-SCALE
// (orthographic) capture: then every pixel is the same size on the ground, so easting/northing lines
// can be placed exactly. A perspective or oblique capture has no single metres-per-pixel, and a grid on
// it would be a confident-looking fiction. Lines follow the capture's camera azimuth (a rotated map gets
// rotated grid lines); labels sit where each line meets the frame.
// TASKS.csv #1489 — one name for a viewport in every list (the legend binding showed 'viewport_1793684369148', the grid binding
// two identical 'Viewport' entries, the overview list 'Viewport 1 (1 : 25,000)'): its theme's name or 'Viewport n' by its order
// on the page, and the scale it was set to
function viewportName(el, i, themes) {
  const theme = (themes || []).find((t) => t.id === el.themeId)?.name;
  return `${theme || tr("Viewport {n}", { n: i + 1 })}${el.fixedScale > 0 ? ` (1 : ${el.fixedScale.toLocaleString()})` : ""}`;
}
function UtmGridOverlay({ el, crs = "" }) {
  const W = el.w, H = el.h, m = el.worldHeightAtTarget / H; // metres per page px
  // screen-up points at bearing beta = -azimuth (see ViewerModule's cameraAzimuthDeg comment)
  const beta = (-(el.cameraAzimuthDeg || 0) * Math.PI) / 180, cb = Math.cos(beta), sb = Math.sin(beta);
  const E0 = el.targetWorld.x, N0 = el.targetWorld.y;
  // world of a page point (u right, v down, from the centre): E = E0 + m(u cb - v sb), N = N0 - m(u sb + v cb)
  const corners = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]].map(([u, v]) => [E0 + m * (u * cb - v * sb), N0 - m * (u * sb + v * cb)]);
  const eMin = Math.min(...corners.map((c) => c[0])), eMax = Math.max(...corners.map((c) => c[0]));
  const nMin = Math.min(...corners.map((c) => c[1])), nMax = Math.max(...corners.map((c) => c[1]));
  const step = legibleGridStep(el.utmGridStep > 0 ? el.utmGridStep : niceGridStep(Math.max(eMax - eMin, nMax - nMin)), m).step; // #1488 — never closer than 10 mm on paper
  // A line {p : n . p = c} (page px, centred) clipped to the frame; returns its two end points.
  const clip = (nx, ny, c) => {
    const pts = [];
    const tryPt = (u, v) => { if (u >= -W / 2 - 1e-6 && u <= W / 2 + 1e-6 && v >= -H / 2 - 1e-6 && v <= H / 2 + 1e-6) pts.push([u, v]); };
    if (Math.abs(ny) > 1e-9) { tryPt(-W / 2, (c + nx * W / 2) / ny); tryPt(W / 2, (c - nx * W / 2) / ny); }
    if (Math.abs(nx) > 1e-9) { tryPt((c + ny * H / 2) / nx, -H / 2); tryPt((c - ny * H / 2) / nx, H / 2); }
    return pts.length >= 2 ? [pts[0], pts[pts.length - 1]] : null;
  };
  const lines = [];
  for (let e = Math.ceil(eMin / step) * step; e <= eMax; e += step) {
    const seg = clip(cb, -sb, (e - E0) / m); // E = e  <=>  u cb - v sb = (e - E0)/m
    if (seg) lines.push({ key: `e${e}`, seg, label: `${Math.round(e).toLocaleString()} E` });
  }
  for (let n = Math.ceil(nMin / step) * step; n <= nMax; n += step) {
    const seg = clip(-sb, -cb, (n - N0) / m); // N = n  <=>  -(u sb + v cb) = (n - N0)/m
    if (seg) lines.push({ key: `n${n}`, seg, label: `${Math.round(n).toLocaleString()} N` });
  }
  const toPx = ([u, v]) => [u + W / 2, v + H / 2];
  // #1488 — a label that would print over another (or over the grid's own note, bottom left) is left off; its line stays
  const fpx = printPx(printPt.caption), estW = (s) => s.length * fpx * 0.56;
  const gridNote = crs ? tr("Grid: {crs}, {step} m", { crs, step: step.toLocaleString() }) : tr("Grid: {step} m", { step: step.toLocaleString() });
  const placed = lines.map((l) => {
    const [a, b] = l.seg.map(toPx);
    const lab = a[1] <= b[1] ? a : b; // label at the end nearer the top (or left) edge
    return { a, b, x: Math.min(W - 2, Math.max(2, lab[0] + 2)), y: Math.min(H - 3, Math.max(9, lab[1] + 9)) };
  });
  const show = keepLabelsApart([{ x: 3, y: H - 3 - fpx, w: estW(gridNote), h: fpx }, ...placed.map((p, i) => ({ x: p.x, y: p.y - fpx, w: estW(lines[i].label), h: fpx }))]).slice(1);
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {lines.map((l, i) => {
        const { a, b, x, y } = placed[i];
        return (
          <g key={l.key}>
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#1a2028" strokeOpacity="0.45" strokeWidth="0.6" />
            {show[i] && <text x={x} y={y} fontSize={fpx} fill="#1a2028" fontFamily="'Exo 2', system-ui, sans-serif" style={{ paintOrder: "stroke", stroke: "#ffffff", strokeWidth: 2.5 }}>{l.label}</text>}
          </g>
        );
      })}
      {/* TASKS.csv #947 — which grid this is, once, in the corner */}
      <text x={3} y={H - 3} fontSize={printPx(printPt.caption)} fill="#1a2028" fontFamily="'Exo 2', system-ui, sans-serif" style={{ paintOrder: "stroke", stroke: "#ffffff", strokeWidth: 2.5 }}>
        {gridNote}</text>
    </svg>
  );
}

// TASKS.csv #944 / Matt (2026-10-27): "still don't see the same viewport options as current view" on a cross-section
// snapshot. A section snapshot is a drawing, not a 3D camera, so theme / refresh / enter / UTM grid do not apply; what a
// printed section needs is its plot scale. Its full width shows worldWidthAtCaptureM metres, so the scale is known: shown
// here, and the #907 preset picker sets the width that gives 1 : N (the height follows the snapshot's aspect).
// TASKS.csv #1868 — the title block's rows: a label and a value each (placeholders allowed), added, removed and reordered
function TitleBlockControls({ sel, updateSelected }) {
  const rows = sel.rows || [];
  const setRow = (i, k, v) => updateSelected({ rows: rows.map((r, j) => (j === i ? (k === 0 ? [v, r[1]] : [r[0], v]) : r)) });
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= rows.length) return; const n = rows.slice(); [n[i], n[j]] = [n[j], n[i]]; updateSelected({ rows: n }); };
  const small = { fontSize: "var(--font-size-sm)", padding: "2px 4px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", color: "var(--color-text)", minWidth: 0 };
  const btn = { ...small, cursor: "pointer", padding: "0 5px", flexShrink: 0 };
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4, lineHeight: 1.4 }}>{tr("Label and value of each row. Values can use {project}, {date}, {scale}, {crs}, {page} and {pages}; the first row prints bold.")}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 3, marginBottom: 3 }}>
          <input value={r[0]} onChange={(e) => setRow(i, 0, e.target.value)} style={{ ...small, width: "36%" }} aria-label={tr("Label of row {n}", { n: i + 1 })} />
          <input value={r[1]} onChange={(e) => setRow(i, 1, e.target.value)} style={{ ...small, flex: 1 }} aria-label={tr("Value of row {n}", { n: i + 1 })} />
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={btn} aria-label={tr("Move row {n} up", { n: i + 1 })}>↑</button>
          <button type="button" onClick={() => updateSelected({ rows: rows.filter((_, j) => j !== i) })} style={btn} aria-label={tr("Remove row {n}", { n: i + 1 })}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
        <button type="button" onClick={() => updateSelected({ rows: [...rows, ["Label", ""]] })} style={{ ...btn, padding: "2px 8px" }}>{tr("Add row")}</button>
        <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>{tr("Size (pt)")}<input type="number" min="5" max="16" step="0.5" value={sel.fontPt || 8} onChange={(e) => updateSelected({ fontPt: Math.max(5, Math.min(16, Number(e.target.value) || 8)) })} style={{ ...small, width: 52 }} /></label>
      </div>
    </div>
  );
}
// TASKS.csv #1480 (review #1352) — a strip log at an exact depth scale: its height sized so a metre of hole is 1/N m of paper (the width
// follows), and what that is in millimetres per 10 m, the way a printed log is read
const DEPTH_PRESETS = [200, 500, 1000, 2000, 2500, 5000, 10000];
function DepthScaleControls({ sel, pageH, updateSelected }) {
  const [custom, setCustom] = useState(false);
  const d = depthScaleDenom(sel), n = d ? Math.round(d) : 0;
  const preset = DEPTH_PRESETS.find((p) => Math.abs(d - p) < 0.5);
  const choice = custom ? "custom" : preset ? String(preset) : "";
  const aspect = sel.aspect || (sel.naturalW && sel.naturalH ? sel.naturalW / sel.naturalH : 1);
  const setScale = (k) => { if (!(k > 0)) return; const h = depthHeightForScale(sel, k); updateSelected({ h, w: h * aspect }); };
  return (
    <div style={{ marginTop: 4, marginBottom: 6 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", marginBottom: 4 }}
        title={tr("Plot this strip log at an exact depth scale: its height is set so a metre of hole is 1/N of a metre on paper.")}>{tr("Depth 1 :")}
        <select value={choice} aria-label={tr("Strip log depth scale")} onChange={(e) => {
          const v = e.target.value;
          if (v === "custom") { setCustom(true); return; }
          setCustom(false);
          if (v) setScale(Number(v));
        }} style={{ ...inp, flex: 1, marginTop: 0, marginBottom: 0, padding: "4px 6px", fontSize: "var(--font-size-sm)" }}>
          <option value="">{tr("as sized (1 : {n})", { n: n.toLocaleString() })}</option>
          {DEPTH_PRESETS.map((p) => <option key={p} value={String(p)}>{p.toLocaleString()}</option>)}
          <option value="custom">{tr("custom…")}</option>
        </select>
        {choice === "custom" && (
          <input type="number" min="1" step="any" defaultValue={n || ""} aria-label={tr("Strip log depth scale denominator")}
            onBlur={(e) => setScale(Number(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            style={{ width: 72, fontSize: "var(--font-size-sm)" }} />
        )}
      </label>
      {d > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 4 }}>{tr("{mm} mm of paper per 10 m of hole", { mm: +(10000 / d).toPrecision(3) })}</div>}
      {/* TASKS.csv #1641 — the size its 9.5 px labels print at here (the strip log window's advice used to stay behind in the 3D View) */}
      {sel.naturalH > 0 && sel.h > 0 && (() => { const pt = (9.5 * (sel.h / sel.naturalH) * 72) / 96; return (
        <div style={{ fontSize: "var(--font-size-xs)", color: pt < 6 ? "var(--color-warn-text)" : "var(--color-text-muted)", marginBottom: 4, lineHeight: 1.4 }}>{pt < 6
          ? tr("Its labels print at about {pt} pt at this size: give it more height, or send a shorter depth range from the strip log window.", { pt: pt.toFixed(1) })
          : tr("Its labels print at about {pt} pt.", { pt: pt.toFixed(1) })}</div>
      ); })()}
      {sel.h > pageH && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", lineHeight: 1.4 }}>{tr("At this scale the log is taller than the page: a larger depth scale (1 : N with a bigger N) fits it, or a taller page.")}</div>}
    </div>
  );
}
function SectionScaleControls({ sel, pageW, pageH, updateSelected }) {
  const [custom, setCustom] = useState(false);
  const [resnapNote, setResnapNote] = useState(""); // #1485
  const d = sectionScaleDenom(sel), n = d ? Math.round(d) : 0;
  const preset = SCALE_PRESETS.find((p) => Math.abs(d - p) < 0.5);
  const choice = custom ? "custom" : preset ? String(preset) : "";
  const setScale = (k) => { if (!(k > 0)) return; const w = sectionWidthForScale(sel, k); updateSelected({ w, h: w / (sel.aspect || (sel.naturalW && sel.naturalH ? sel.naturalW / sel.naturalH : 1)) }); };
  const tooBig = sel.w > pageW || sel.h > pageH;
  return (
    <div style={{ marginTop: 4, marginBottom: 6 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", marginBottom: 4 }}
        title={tr("Plot this section at an exact horizontal scale: the snapshot is sized on the page so its length along the section is at 1 : N.")}>{tr("Scale 1 :")}
        <select value={choice} aria-label={tr("Section plot scale")} onChange={(e) => {
          const v = e.target.value;
          if (v === "custom") { setCustom(true); return; }
          setCustom(false);
          if (v) setScale(Number(v));
        }} style={{ ...inp, flex: 1, marginTop: 0, marginBottom: 0, padding: "4px 6px", fontSize: "var(--font-size-sm)" }}>
          <option value="">{tr("as sized (1 : {n})", { n: n.toLocaleString() })}</option>
          {SCALE_PRESETS.map((p) => <option key={p} value={String(p)}>{p.toLocaleString()}</option>)}
          <option value="custom">{tr("custom…")}</option>
        </select>
        {choice === "custom" && (
          <input type="number" min="1" step="any" defaultValue={n || ""} aria-label={tr("Section plot scale denominator")}
            onBlur={(e) => setScale(Number(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            style={{ width: 72, fontSize: "var(--font-size-sm)" }} />
        )}
      </label>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 4 }}>{sectionScaleText(sel)}</div>
      {sel.numbersRounded > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4, lineHeight: 1.4 }}>{tr(sel.numbersRounded === 1 ? "1 long number in this snapshot's labels was rounded to 4 significant figures, as grades now print." : "{n} long numbers in this snapshot's labels were rounded to 4 significant figures, as grades now print.", { n: sel.numbersRounded })}</div>}{/* #2603 */}
      {(() => { // TASKS.csv #1485 — the plot scale changes the geometry, not the type: say what the text prints at, and take the snapshot again for this width
        const pt = sectionTextPt(sel); if (pt == null || sel.planMap) return null;
        const off = Math.abs(pt - 7) > 1;
        return (
          <div style={{ fontSize: "var(--font-size-xs)", color: off ? "var(--color-warn-text)" : "var(--color-text-muted)", marginBottom: 4, lineHeight: 1.4 }}>
            {off ? tr("Its smallest text prints at about {pt} pt at this width (the snapshot was drawn for about 7 pt).", { pt }) : tr("Its smallest text prints at about {pt} pt.", { pt })}
            {(off || sel.sectionTabId) && (sel.sectionTabId /* #2603 — offered on every section snapshot, not only when the text size is off */
              ? <> <button type="button" onClick={() => { const ok = sendSectionResnap({ tabId: sel.sectionTabId, elementId: sel.id, textFactor: sectionTextFactor(sel) }); setResnapNote(ok ? tr("Asked the section window to snapshot again with the text at print size. If the section is closed, open it again and snapshot from there.") : tr("Could not reach the section window.")); }} style={{ ...inp, width: "auto", marginTop: 4, padding: "3px 8px", cursor: "pointer" }}>{tr("Re-snapshot with the text at print size")}</button></>
              : <> {tr("Open the section again and snapshot it from there to get the text at print size.")}</>)}
            {resnapNote && <div style={{ marginTop: 3 }}>{resnapNote}</div>}
          </div>
        );
      })()}
      {tooBig && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 4, lineHeight: 1.4 }}>{tr("At this scale the section is larger than the page: choose a smaller scale (a larger number), a larger page, or the other orientation.")}</div>}
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 }}>{sel.planMap ? tr("A plan map from Geochem, drawn as it was when sent: to change it, make a new one from Geochem > Plan map. Resizing it changes its scale.") : tr("A cross-section snapshot is a drawing of the section as it was when taken, so it has no theme, refresh or 3D camera to adjust. To change what it shows, take a new snapshot from the cross-section window. The scale is horizontal, along the section; resizing the snapshot changes it.")}</div>
    </div>
  );
}

function ViewportControls({ steepHoles = false, legendReloaded = false, sel, themes, updateSelected, onRefresh, onRebind, onEnter, onFit, onRescale, onSyncScaleBar, onSyncNorth, syncNotice, others = [], allViewports = [], hasHoles = true, crsUnset = false }) {
  // TASKS.csv #907 — the scale picker: a preset, "custom" (a typed 1:N), or free (whatever the 3D view frames)
  const [customScale, setCustomScale] = useState(false);
  const scaleChoice = customScale || (sel.fixedScale > 0 && !SCALE_PRESETS.includes(sel.fixedScale)) ? "custom" : sel.fixedScale > 0 ? String(sel.fixedScale) : "";
  // TASKS.csv #69 — the "~" prefix and hedge text below only apply to a perspective capture (the
  // ordinary, pre-#69 default) — sel.trueScale means the LAST capture was rendered with an
  // orthographic camera (see startViewportRender/ViewerModule's capture effect), which makes
  // worldHeightAtTarget an exact figure, not an estimate at one particular distance.
  const scaleText = viewportScaleText(sel); // #906 / #961
  const oblique = obliqueCapture(sel); // TASKS.csv #946
  const frameChanged = !!(sel.capW && sel.capH && (Math.round(sel.w) !== Math.round(sel.capW) || Math.round(sel.h) !== Math.round(sel.capH))); // #906
  const gridOk = utmGridReady(sel); // TASKS.csv #399
  return (
    <div style={{ marginTop: 4 }}>
      {sel.samplesUnplaced > 0 && ( // TASKS.csv #1864 — the 3D view could not place these, so no capture holds them
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 6, lineHeight: 1.4 }}>{tr(sel.samplesUnplaced === 1 ? "{n} surface sample is not in this frame: it lies over a void of the terrain, with no ground to sit on. Geochem > Plan map draws every sample by X / Y." : "{n} surface samples are not in this frame: they lie over a void of the terrain, with no ground to sit on. Geochem > Plan map draws every sample by X / Y.", { n: sel.samplesUnplaced.toLocaleString() })}</div>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: gridOk ? "var(--color-text)" : "var(--color-text-muted)", marginBottom: 6, cursor: gridOk ? "pointer" : "default" }}
        title={gridOk ? tr("Draw labelled easting/northing lines over this view") : tr("Needs a top-down, true-scale capture: set the 3D view to Top, tick true scale, and refresh this viewport.")}>
        <input type="checkbox" disabled={!gridOk} checked={!!sel.utmGrid && gridOk} onChange={(e) => updateSelected({ utmGrid: e.target.checked })} />{crsUnset ? tr("Coordinate grid (labelled)") /* #2300: local metres are not UTM */ : tr("UTM grid (labelled)")}{gridOk && sel.utmGrid && (
          <input type="number" min="1" step="any" placeholder={tr("auto")} value={sel.utmGridStep || ""} onChange={(e) => updateSelected({ utmGridStep: Number(e.target.value) || 0 })}
            aria-label={tr("Grid spacing (m)")} title={tr("Grid spacing in metres (blank = automatic)")} style={{ width: 60, marginLeft: "auto", fontSize: "var(--font-size-sm)" }} />
        )}
      </label>
      {!gridOk && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: -4, marginBottom: 6 }}>{tr("A UTM grid needs a top-down, true-scale capture.")}</div>}
      {gridOk && sel.utmGrid && sel.utmGridStep > 0 && (() => { // TASKS.csv #1488 — a spacing too tight to read is drawn wider, and said so
        const g = legibleGridStep(sel.utmGridStep, metresPerPagePx(sel));
        return g.bumped ? <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: -4, marginBottom: 6, lineHeight: 1.4 }}>{tr("{typed} m would put the grid lines {mm} mm apart on paper at this scale, too close to read: drawn every {step} m.", { typed: sel.utmGridStep.toLocaleString(), mm: g.mm.toFixed(1), step: g.step.toLocaleString() })}</div> : null;
      })()}
      <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Theme")}<select value={sel.themeId || ""} onChange={(e) => onRebind(e.target.value || null)} style={inp}>
          {/* TASKS.csv — "add a viewport with the current view, not only when saving a theme." A
              viewport can now exist with no bound theme at all (themeId: null) — "Refresh from theme"
              below still works for it (re-captures whatever's live right now), it just has nothing to
              rebind BACK to if the user picks this option again later. */}
          <option value="">{tr("— current view (no theme) —")}</option>
          {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <button onClick={onRefresh} disabled={sel.refreshing} style={{ ...pBtn, opacity: sel.refreshing ? 0.6 : 1 }}>
        <RefreshCw size={14} /> {sel.refreshing ? tr("Rendering…") : tr("Refresh from theme")}
      </button>
      {/* TASKS.csv #2471 — when the picture was taken: the 3D view may have changed since */}
      {sel.capturedAt > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: -4, marginBottom: 6, lineHeight: 1.4 }}>{tr("Captured {when}. Changes in the 3D view since then show after a refresh.", { when: new Date(sel.capturedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) })}{legendReloaded ? " " + tr("The bound legend reloaded with the refreshed viewport.") : ""}</div>}
      {/* TASKS.csv #198 (part 3) — QGIS-style "enter" a viewport: switches to the 3D View tab with
          this viewport's theme/camera live, ready for real orbit/pan/zoom, instead of an instant
          re-render. See startInteractiveViewportEdit above and ViewerModule's interactive-session
          banner for the other half of this flow. */}
      <button onClick={onEnter} disabled={sel.refreshing} title={tr("Switch to the 3D View tab and interactively orbit/pan/zoom this viewport's camera, then bring the new angle back here")} style={{ ...pBtn, opacity: sel.refreshing ? 0.6 : 1 }}>
        <LogIn size={14} />{" "}{tr("Enter & adjust view…")}</button>
      {sel.fixedScale > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: -4, marginBottom: 6, lineHeight: 1.4 }}>{tr("This frame has a fixed scale (1:{s}): in the 3D view only where you centre it is used, not the zoom. Set Scale to \"free (as framed)\" to use the zoom.", { s: Number(sel.fixedScale).toLocaleString() })}</div>}{/* TASKS.csv #1486 */}
      {/* TASKS.csv #1486 — what the zoom in 'Enter & adjust view' framed, when it was far from the fixed scale: one click uses it */}
      {sel.fixedScale > 0 && sel.adjustZoomScale > 0 && Math.abs(sel.adjustZoomScale / sel.fixedScale - 1) > 0.05 && (() => { const z = roundScale(sel.adjustZoomScale); return (
        <div style={{ fontSize: "var(--font-size-sm)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Your zoom in the 3D view framed about 1:{z}; the frame kept 1:{s}.", { z: z.toLocaleString(), s: Number(sel.fixedScale).toLocaleString() })}{" "}
          <button style={{ ...smallBtn, marginTop: 4 }} onClick={() => { updateSelected({ adjustZoomScale: null }); onRescale(z); }}>{tr("Use 1:{z}", { z: z.toLocaleString() })}</button>
        </div>); })()}
      {/* TASKS.csv #69 — true-scale (orthographic) capture. Takes effect on the NEXT refresh, not
          retroactively on the image already captured — toggling it alone doesn't re-render. */}
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", marginBottom: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={!!sel.trueScale} onChange={(e) => updateSelected({ trueScale: e.target.checked })} />{tr("True scale (orthographic) — exact, not just at the camera's focus point. Refresh to apply.")}</label>
      {/* TASKS.csv #398 / #907 — the plot scale. The frame's size on the paper is the ground it shows at 1:N (#906:
          the capture is drawn at the frame's own aspect), centred where the camera looks or, with Fit, on the data. */}
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", marginBottom: 4 }}
        title={tr("Plot this viewport at an exact scale. The frame's size on the paper is the ground it shows: resize it for more or less ground, then refresh. Turns on true scale.")}>{tr("Scale 1 :")}
        <select value={scaleChoice} aria-label={tr("Plot scale")} onChange={(e) => {
          const v = e.target.value;
          if (v === "") { setCustomScale(false); onRescale(0); } // #1007 — applied at once
          else if (v === "custom") { setCustomScale(true); if (!(sel.fixedScale > 0)) updateSelected({ fixedScale: 1000, trueScale: true }); }
          else { setCustomScale(false); onRescale(Number(v)); }
        }} style={{ ...inp, flex: 1, marginTop: 0, marginBottom: 0, padding: "4px 6px", fontSize: "var(--font-size-sm)" }}>
          <option value="">{tr("free (as framed)")}</option>
          {SCALE_PRESETS.map((n) => <option key={n} value={String(n)}>{n.toLocaleString()}</option>)}
          <option value="custom">{tr("custom…")}</option>
        </select>
        {scaleChoice === "custom" && (
          <input type="number" min="1" step="any" value={sel.fixedScale || ""} aria-label={tr("Fixed plot scale denominator")}
            onChange={(e) => { const n = Number(e.target.value) || 0; updateSelected(n > 0 ? { fixedScale: n, trueScale: true } : { fixedScale: 0 }); }}
            onBlur={() => { if (sel.fixedScale > 0 && sel.capturedFixedScale !== sel.fixedScale) onRescale(sel.fixedScale); }} // #1007 — a typed scale applies on leaving the box or Enter
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            style={{ width: 72, fontSize: "var(--font-size-sm)" }} />
        )}
      </label>
      {others.length > 0 && ( /* TASKS.csv #912 — an overview (inset) map */
        <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }} title={tr("Draw another viewport's ground extent on this one, as on an inset location map. Both need a top-down, true-scale capture.")}>{tr("Show the extent of")}
          <select value={sel.overviewOf || ""} onChange={(e) => updateSelected({ overviewOf: e.target.value || null })} style={inp}>
            <option value="">{tr("— none —")}</option>
            {others.map((o) => <option key={o.id} value={o.id}>{viewportName(o, allViewports.findIndex((v) => v.id === o.id), themes)}</option>)}
          </select>
        </label>
      )}
      {sel.overviewOf && !overviewPolygon(sel, others.find((o) => o.id === sel.overviewOf)) && (
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: -4, marginBottom: 8, lineHeight: 1.4 }}>{tr("The extent shows when both viewports are top-down, true-scale captures: set the 3D view to Top, pick a scale, and refresh each.")}</div>
      )}
      <button onClick={onFit} disabled={sel.refreshing} title={hasHoles ? tr("Pick the round scale at which all the drillholes (or the surface samples / boundaries) fit this frame, centre the view on them, and refresh") : tr("Pick the round scale at which the visible block models (else the surface samples, map layers or boundaries) fit this frame, centre the view on them, and refresh")} style={{ ...pBtn, opacity: sel.refreshing ? 0.6 : 1 }}>
        <Maximize2 size={14} />{" "}{hasHoles ? tr("Fit the holes at a round scale") : tr("Fit the data at a round scale")}</button>
      {sel.fitInfo && sel.fitInfo.scale === sel.fixedScale && ( /* TASKS.csv #2132 — what the fit framed */
        <div style={{ fontSize: "var(--font-size-xs)", color: sel.fitInfo.drilledScale ? "var(--color-warn-text)" : "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>
          {tr("Fitted {n} hole(s) at 1:{scale}.", { n: sel.fitInfo.holes.toLocaleString(), scale: sel.fitInfo.scale.toLocaleString() })}
          {sel.fitInfo.drilledScale > 0 && " " + tr("{k} of them have no survey and no azimuth / dip (drawn as assumed vertical holes) and widen the frame: the drilled holes alone would fit at 1:{s}. Set the scale by hand, or remove those collars.", { k: sel.fitInfo.assumed.toLocaleString(), s: sel.fitInfo.drilledScale.toLocaleString() })}{/* #2304 — only when they do */}
        </div>
      )}
      {steepHoles && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tr("Every hole in this frame is steeper than {d}°, so a top-down view draws each one as a point. Insert > Drill plan draws a collar map, coloured by a collar field or a grade if you like.", { d: STEEP_DIP })}</div>}{/* TASKS.csv #2473 */}
      {sel.fixedScale > 0 && (
        <div style={{ fontSize: "var(--font-size-xs)", color: sel.capturedFixedScale === sel.fixedScale ? "var(--color-success-fg)" : "var(--color-warn-text)", marginBottom: 8, lineHeight: 1.4 }}>
          {sel.capturedFixedScale === sel.fixedScale
            ? oblique ? tr("Captured at 1 : {fixedScale} in the view plane (oblique view, not a map scale). Set the 3D view to Top and refresh for a map at this scale.", { fixedScale: sel.fixedScale.toLocaleString() })
            : tr("Captured at 1 : {fixedScale}: the frame shows {w} × {h} m. Resize it and refresh to show more or less ground at this scale.", { fixedScale: sel.fixedScale.toLocaleString(), w: Math.round(groundFrameSize(sel.fixedScale, sel).w).toLocaleString(), h: Math.round(groundFrameSize(sel.fixedScale, sel).h).toLocaleString() })
            : tr("Refresh to capture at this scale.")}</div>
      )}
      {frameChanged && (
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 8, lineHeight: 1.4 }}>{tr("The frame was resized since its capture: the image keeps its scale and size until you refresh, which fills the frame.")}</div>
      )}
      <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Rotation (°)")}<input type="number" value={sel.rotation || 0} onChange={(e) => updateSelected({ rotation: Number(e.target.value) || 0 })} style={inp} />
      </label>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", flex: 1 }}>{tr("Frame width")}<input type="number" min="0" value={sel.frameWidth ?? 1} onChange={(e) => updateSelected({ frameWidth: Math.max(0, Number(e.target.value) || 0) })} style={{ ...inp, marginTop: 4 }} />
        </label>
        <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Colour")}<input type="color" value={sel.frameColor || INK} onChange={(e) => updateSelected({ frameColor: e.target.value })} style={{ display: "block", marginTop: 4, width: 34, height: 30, padding: 0, border: "1px solid var(--color-border)", borderRadius: 5, background: "none", cursor: "pointer" }} />
        </label>
      </div>
      <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Frame style")}<select value={sel.frameStyle || "solid"} onChange={(e) => updateSelected({ frameStyle: e.target.value })} style={inp}>
          <option value="solid">{tr("Solid")}</option>
          <option value="dashed">{tr("Dashed")}</option>
          <option value="double">{tr("Double")}</option>
        </select>
      </label>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6, lineHeight: 1.5 }}>
        {oblique ? tr("Scale in the view plane") : sel.trueScale ? tr("Scale") : tr("Approx. scale")}: <span style={{ color: "var(--color-text)" }}>{scaleText || "—"}</span><br />
        <span style={{ color: "var(--color-text-muted)" }}>
          {oblique
            ? tr("Oblique view: distances along the line of sight are foreshortened, so this is not a map scale. Set the 3D view to Top and refresh for one.")
            : sel.trueScale
            ? tr("Orthographic capture — this ratio is exact across the whole image, not just at one distance.")
            : tr("Estimated at the theme's camera target distance — perspective view, so scale drifts slightly nearer/farther from that point. Check \"True scale\" above and refresh for an exact figure.")}
        </span>
      </div>
      <button onClick={onSyncScaleBar} disabled={!scaleText} style={{ ...pBtn, opacity: scaleText ? 1 : 0.5 }}>
        <Ruler size={14} />{" "}{tr("Assign scale bar to this view")}</button>
      {syncNotice && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-accent-dark)", margin: "4px 0 8px", lineHeight: 1.4 }}>{syncNotice}</div>}
      {/* TASKS.csv #67 — cameraAzimuthDeg is computed in ViewerModule.jsx (see that comment for the
          worked-through, numerically-checked derivation of the CSS rotation angle). */}
      <button onClick={onSyncNorth} disabled={sel.cameraAzimuthDeg == null} style={{ ...pBtn, opacity: sel.cameraAzimuthDeg == null ? 0.5 : 1 }}>
        <Compass size={14} />{" "}{tr("Sync north arrow")}</button>
    </div>
  );
}

// TASKS.csv #906 — where the selected element sits and how big it is, in millimetres on the paper (the rulers' and the
// grid's unit, as in QGIS); an aspect-locked image keeps its shape when its width is typed.
function PlaceControls({ sel, updateSelected }) {
  const mm = (px) => Math.round((px / PX_PER_MM) * 10) / 10;
  const toPx = (v) => Number(v) * PX_PER_MM;
  const field = (label, key, min) => (
    <label key={key} style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", flex: 1, minWidth: 0 }}>{label}
      <input type="number" step="0.1" value={mm(sel[key] || 0)} onChange={(e) => {
        const v = Number(e.target.value);
        if (!Number.isFinite(v)) return;
        const px = min != null ? Math.max(min * PX_PER_MM, toPx(v)) : toPx(v);
        if (key === "w" && ASPECT_LOCKED.has(sel.type) && sel.aspect) updateSelected({ w: px, h: px / sel.aspect });
        else updateSelected({ [key]: px });
      }} style={{ ...inp, marginTop: 4, marginBottom: 0, padding: "5px 6px" }} />
    </label>
  );
  const hasW = sel.w != null && (BOX_TYPES.has(sel.type) || WIDTH_ONLY.has(sel.type)), hasH = sel.h != null && BOX_TYPES.has(sel.type);
  return (
    <div style={{ display: "flex", gap: 5, marginBottom: 8 }} title={tr("Position and size on the paper, in millimetres (the rulers' unit). Drag an element's handles to resize it; Shift keeps its shape.")}>
      {field(tr("X (mm)"), "x")}{field(tr("Y (mm)"), "y")}{hasW && field(tr("W (mm)"), "w", 5)}{hasH && field(tr("H (mm)"), "h", 5)}
    </div>
  );
}

// TASKS.csv #102 — same width/style math the "viewport" branch below already uses (double style
// triples the drawn width so it actually reads as a double rule at small sizes), shared here for
// title/text/legend. `fallback` lets legend keep its pre-existing plain "1px solid #ccc" look when
// no frame has been explicitly set, instead of suddenly losing its border.
function frameBorder(el, fallback = "none") {
  if (!el.frameWidth) return fallback;
  const style = el.frameStyle === "double" ? "double" : el.frameStyle === "dashed" ? "dashed" : "solid";
  const w = el.frameStyle === "double" ? Math.max(3, el.frameWidth * 3) : el.frameWidth;
  return `${w}px ${style} ${el.frameColor || INK}`;
}

// TASKS.csv #908 — every page at its paper size, in mm, for printToPDF; shown only under @media print (app.css), its
// siblings hidden. A named @page per distinct format lets one PDF hold A4 landscape and A3 portrait pages.
const LayoutPrintRoot = React.forwardRef(function LayoutPrintRoot({ pages, project, collars, credits = "", assays = null, assayElements = null }, ref) { // assays: #2473
  const formats = [...new Map(pages.map((pg) => { const f = pageFormatOf(pg); return [pageCssName(f), f]; })).values()];
  const css = formats.map((f) => { const [w, h] = pageMm(f), n = pageCssName(f); return `@page ${n} { size: ${w}mm ${h}mm; margin: 0; }\n.ge-print-${n} { page: ${n}; }`; }).join("\n");
  return (
    <div ref={ref} className="ge-print-root" dir="ltr">
      <style>{css}</style>
      {pages.map((pg, i) => {
        const f = pageFormatOf(pg), [w, h] = pageMm(f);
        return (
          <div key={pg.id} className={`ge-print-page ge-print-${pageCssName(f)}`} style={{ width: `${w}mm`, height: `${h}mm` }}>
            {withLiveScaleBars(pg.elements).map((el) => <LayoutElement key={el.id} el={el} selected={false} multiSelected={false} print onDown={() => {}} ctx={{ ...textContextFor(pg.elements || [], project, pg, i, pages.length, collars, credits), assays, assayElements }} />)}
          </div>
        );
      })}
    </div>
  );
});

// TASKS.csv #906 — resize handles: 8 for a free box, the 4 corners where the aspect is locked, left / right for an
// element that wraps text to its width, the tip of an arrow. Drawn on the single selected element only.
const BOX_TYPES = new Set(["viewport", "image", "rect", "logo"]);
const ASPECT_LOCKED = new Set(["image", "logo"]);
const WIDTH_ONLY = new Set(["title", "text", "callout", "legend", "table", "titleblock"]); // titleblock: #1868
const HANDLES_FOR = { drillplan: ["nw", "n", "ne", "e", "se", "s", "sw", "w"], titleblock: ["e", "w"], viewport: ["nw", "n", "ne", "e", "se", "s", "sw", "w"], rect: ["nw", "n", "ne", "e", "se", "s", "sw", "w"], image: ["nw", "ne", "se", "sw"], logo: ["nw", "ne", "se", "sw"], title: ["e", "w"], text: ["e", "w"], callout: ["e", "w"], legend: ["e", "w"], table: ["e", "w"] };
const HANDLE_CURSOR = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize", tip: "crosshair" };
const HANDLE_POS = { n: { left: "50%", top: 0 }, s: { left: "50%", top: "100%" }, e: { left: "100%", top: "50%" }, w: { left: 0, top: "50%" }, ne: { left: "100%", top: 0 }, nw: { left: 0, top: 0 }, se: { left: "100%", top: "100%" }, sw: { left: 0, top: "100%" } };
function Handles({ which, onStart, at = {} }) {
  return which.map((h) => (
    <div key={h} data-handle={h} role="presentation" title={h === "tip" ? tr("Drag the tip to aim and lengthen the arrow") : undefined}
      style={{ position: "absolute", width: "calc(11px / var(--lz, 1))", height: "calc(11px / var(--lz, 1))", background: "#fff", border: "calc(1.5px / var(--lz, 1)) solid var(--color-info)", borderRadius: 2, boxSizing: "border-box", zIndex: 2, transform: "translate(-50%, -50%)", cursor: HANDLE_CURSOR[h], ...(HANDLE_POS[h] || at[h] || {}) }}
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onStart(e, h); }} />
  ));
}


// TASKS.csv #909 — the dynamic-text context of a page, and the fill
const PLACEHOLDER = /\{(project|date|page|pages|pagename|scale|crs|credits)\}/g; // credits: TASKS.csv #949
// TASKS.csv #947 — a map frame with a UTM grid never said which datum and zone: {crs} and the grid's caption print it
// TASKS.csv #2300 (review #2174) — with the CRS not set, project.epsg is a placeholder (BC UTM 9N): the title block and grid caption named it on a
// WA mine grid. Only a chosen CRS is named.
function crsText(epsg, crsSet = true) {
  if (crsSet === false) return tr("Local grid (no coordinate system set)");
  if (!epsg) return "";
  const name = crsName(epsg);
  return name ? `${name} (EPSG:${epsg})` : `EPSG:${epsg}`;
}
function textContextFor(els, project, page, index, count, collars = null, credits = "") {
  const today = new Date(), p2 = (v) => String(v).padStart(2, "0"); // #1489 — ISO: '11/2/2026' read as 11 February to many readers
  // gridCaption (#2301): what a drill plan's grid numbers are
  const gridCaption = project?.crsSet === false ? (project?.localGrid?.name ? `local grid: ${project.localGrid.name}` : "local mine grid, no CRS") : project?.epsg ? `EPSG:${project.epsg}` : "";
  return { gridCaption, project: project?.name || "", date: `${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`, page: String(index + 1), pages: String(count), pagename: page?.name || "", scale: pageScaleText(els), crs: crsText(project?.epsg, project?.crsSet), credits, collars, els, pageH: pagePx(pageFormatOf(page)).h, pageW: pagePx(pageFormatOf(page)).w /* #2134 */ }; // collars: the #911 table; els: the #912 overview; pageH: #1480
}
const fillText = (text, ctx) => (ctx && typeof text === "string" && text.includes("{") ? text.replace(PLACEHOLDER, (m, k) => (ctx[k] != null ? ctx[k] : m)) : text);

function LayoutElement({ el, selected, multiSelected, onDown, print = false, onResizeStart, ctx = null, onSelect = null }) {
  // TASKS.csv #965 — reachable from the keyboard: Tab focuses an element and selects it, so the mm fields, arrow nudges
  // and Delete work without a mouse (the print copy gets none of this)
  const kb = onSelect && !print ? { tabIndex: 0, onFocus: (e) => { if (e.target === e.currentTarget && e.currentTarget.matches?.(":focus-visible")) onSelect(el.id); }, /* keyboard focus only: a click also focuses, and must not undo a Ctrl+click multi-selection */ "aria-label": tr("{type} element", { type: el.type }) } : {};
  const handles = selected && !print && !multiSelected && !el.locked && onResizeStart && HANDLES_FOR[el.type] ? <Handles which={HANDLES_FOR[el.type]} onStart={(e, h) => onResizeStart(e, el, h)} /> : null; // #906; locked: #909
  // multiSelected (part of a Ctrl+click bulk selection, but not the single "active" element) gets a
  // dashed outline so a multi-selection reads visually distinct from the one element whose properties
  // are actually showing in the sidebar. print (#908): no selection marks, no "Rendering..." overlay.
  // TASKS.csv #965 — handles, outline and guides keep their screen size at any sheet zoom (at Fit on a laptop they were 5 px / 0.9 px)
  const outline = !print && selected ? "calc(1.5px / var(--lz, 1)) solid var(--color-info)" : !print && multiSelected ? "calc(1.5px / var(--lz, 1)) dashed var(--color-info)" : "none";
  const wrap = { position: "absolute", left: el.x, top: el.y, cursor: el.locked ? "default" : "move", outline, outlineOffset: 3 };
  // TASKS.csv #102 — font controls (size/color/bold/italic/align) + the same frame/border fields
  // ViewportControls already uses for viewport elements. frameBorder(el) below builds the CSS border
  // shorthand shared by title/text/legend; a frameWidth of 0 (the default for these types — see
  // FrameControls' own comment) renders as "none", so nothing looks different for any element that
  // predates this feature.
  if (el.type === "title") {
    const b = frameBorder(el);
    return (
      <div style={{ ...wrap, width: el.w, border: b, padding: b !== "none" ? 8 : 0, boxSizing: "border-box" }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
        <div style={{ fontSize: el.fontSize ?? 26, fontWeight: (el.bold ?? true) ? 700 : 400, fontStyle: el.italic ? "italic" : "normal", textAlign: el.align || "left", color: el.color || INK, fontFamily: "'Exo 2', system-ui, sans-serif" }}>{fillText(el.text, ctx)}</div>
        {handles}
      </div>
    );
  }
  if (el.type === "text") {
    const b = frameBorder(el);
    return (
      <div style={{ ...wrap, width: el.w, border: b, padding: b !== "none" ? 8 : 0, boxSizing: "border-box" }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
        <div style={{ fontSize: el.fontSize ?? printPx(printPt.body), fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? "italic" : "normal", textAlign: el.align || "left", color: el.color || INK, whiteSpace: "pre-wrap" /* #1868 */ }}>{fillText(el.text, ctx)}</div>
        {handles}
      </div>
    );
  }
  if (el.type === "titleblock") { // TASKS.csv #1868 — a ruled box of labelled fields, values through the page placeholders
    const fs = printPx(el.fontPt || 8), line = `${Math.max(0.5, el.frameWidth ?? 1)}px solid ${el.frameColor || INK}`;
    return (
      <div style={{ ...wrap, width: el.w || 340, background: "#fff", border: line, boxSizing: "border-box" }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: fs, color: INK, fontFamily: "'Exo 2', system-ui, sans-serif" }}>
          <tbody>{(el.rows || []).map(([label, value], i) => (
            <tr key={i} style={{ borderTop: i ? line : "none" }}>
              <td style={{ padding: "2px 6px", width: "34%", borderRight: line, color: "#55606e", fontSize: Math.max(6, fs * 0.85), verticalAlign: "top", whiteSpace: "nowrap" }}>{label}</td>
              <td style={{ padding: "2px 6px", fontWeight: i === 0 ? 700 : 400, whiteSpace: "pre-wrap", verticalAlign: "top" }}>{fillText(value, ctx) || "\u00a0"}</td>
            </tr>
          ))}</tbody>
        </table>
        {handles}
      </div>
    );
  }
  if (el.type === "logo") return (
    <div style={{ ...wrap, width: el.w }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
      <img src={el.src} alt={tr("logo")} style={{ width: "100%", display: "block" }} draggable={false} />
      {handles}
    </div>
  );
  if (el.type === "image") {
    if (!el.src) return null; // defensive: a malformed/partial snapshot shouldn't take the whole page down
    return (
      <div style={{ ...wrap, width: el.w || 200, height: el.h || 120 }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
        <img src={el.src} alt={el.label || "snapshot"} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#fff" }} draggable={false} />
        {handles}
      </div>
    );
  }
  if (el.type === "viewport") {
    const borderStyle = el.frameStyle === "double" ? "double" : el.frameStyle === "dashed" ? "dashed" : "solid";
    const frameW = el.frameStyle === "double" ? Math.max(3, (el.frameWidth || 1) * 3) : (el.frameWidth || 0);
    // TASKS.csv #906 — w x h is the IMAGE area and the frame is drawn outside it (the border used to sit inside the box,
    // so a 700 px frame showed its 926 m over 698 px: 1 : 5,014, not 1 : 5,000). The image is shown at the size it was
    // captured for (capW x capH, centred), so resizing the frame never rescales it: the frame shows white where no
    // ground was captured until the next refresh fills it. An older capture with no capW is fitted as before.
    const W = el.w || 400, H = el.h || 260, imgW = el.capW || W, imgH = el.capH || H;
    return (
      <div
        style={{ ...wrap, width: W, height: H, transform: `rotate(${el.rotation || 0}deg)`, transformOrigin: "center center", outlineOffset: 3 + frameW /* #998 — outside the frame, or a double frame hid it */ }}
        onMouseDown={onDown} data-el-id={el.id} {...kb}
      >
        <div style={{ width: "100%", height: "100%", background: "#fff", position: "relative", overflow: "hidden" }}>
          {el.src && <img src={el.src} alt={tr("viewport")} style={{ position: "absolute", left: (W - imgW) / 2, top: (H - imgH) / 2, width: imgW, height: imgH, display: "block" }} draggable={false} />}
          {el.utmGrid && utmGridReady(el) && <div style={{ position: "absolute", left: (W - imgW) / 2, top: (H - imgH) / 2, width: imgW, height: imgH }}><UtmGridOverlay el={{ ...el, w: imgW, h: imgH }} crs={ctx?.crs || ""} /></div>}
          {el.overviewOf && (() => { /* TASKS.csv #912 — another viewport's ground footprint, as a rectangle */
            const poly = overviewPolygon(el, (ctx?.els || []).find((v) => v.id === el.overviewOf));
            return poly ? (
              <svg style={{ position: "absolute", left: (W - imgW) / 2, top: (H - imgH) / 2, overflow: "visible", pointerEvents: "none" }} width={imgW} height={imgH}>
                <polygon points={poly.map((p) => p.join(",")).join(" ")} fill="rgba(224,64,64,0.12)" stroke="#d62f2f" strokeWidth="1.5" />
              </svg>
            ) : null;
          })()}
          {el.markHole && (() => { /* TASKS.csv #1644 — an atlas page's hole on the template's map */
            const [u, v] = worldToVp(el, el.markHole.x, el.markHole.y), inFrame = Math.abs(u) <= W / 2 - 4 && Math.abs(v) <= H / 2 - 4;
            const font = { fontSize: printPx(printPt.small), fontFamily: "'Exo 2', system-ui, sans-serif", fontWeight: 700 };
            return inFrame ? (
              <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }} width={W} height={H}>
                <circle cx={W / 2 + u} cy={H / 2 + v} r={8} fill="none" stroke="#ffffff" strokeWidth={4} />
                <circle cx={W / 2 + u} cy={H / 2 + v} r={8} fill="none" stroke="#d62f2f" strokeWidth={2} />
                <text x={W / 2 + u + 11} y={H / 2 + v + 4} fill="#d62f2f" stroke="#ffffff" strokeWidth={3} paintOrder="stroke" style={font}>{el.markHole.id}</text>
              </svg>
            ) : <div style={{ position: "absolute", left: 6, top: 6, padding: "2px 6px", background: "rgba(255,255,255,0.88)", color: "#d62f2f", pointerEvents: "none", ...font }}>{tr("{id} is outside this map", { id: el.markHole.id })}</div>;
          })()}
          {el.refreshing && !print && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.75)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--font-size-base)", color: "#333", fontFamily: "'Exo 2', system-ui, sans-serif" }}>{tr("Rendering…")}</div>
          )}
        </div>
        {frameW > 0 && <div data-frame="" style={{ position: "absolute", inset: -frameW, border: `${frameW}px ${borderStyle} ${el.frameColor || INK}`, pointerEvents: "none" }} />}
        {handles}
      </div>
    );
  }
  // TASKS.csv #67 — el.rotation (set manually, or via "Sync north arrow" on a bound viewport) rotates
  // the whole glyph around its own center rather than the page's drag-anchor corner.
  // TASKS.csv #399 — GN/TN/MN declination diagram variant of the north element.
  if (el.type === "north" && el.decl) {
    const { convergence, declination, date, rate } = el.decl;
    const mnTrue = convergence + declination; // magnetic north's bearing measured from grid north
    const fmt = (a) => `${Math.abs(a).toFixed(1)}° ${a >= 0 ? "E" : "W"}`;
    // TASKS.csv #2478 — schematic angles (a 0.4° ray was the GN line); #2613 — each label on its own ray's side
    const ang = schematicAngles(convergence, mnTrue);
    const t = rayTip(ang.tn, 58), m = rayTip(ang.mn, 52), cap = printPx(printPt.caption);
    const rateText = Number.isFinite(rate) ? tr("IGRF-14; changes {v}° {d} a year here", { v: Math.abs(rate) < 0.005 ? "<0.01" : Math.abs(rate).toFixed(2), d: rate >= 0 ? "E" : "W" }) : tr("IGRF-14"); // #2478
    return (
      <div style={{ ...wrap }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
        <svg width={DIAGRAM_W} height={DIAGRAM_H} viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`} style={{ fontFamily: "'Exo 2', system-ui, sans-serif" }}>{/* #585 — 170 wide: the 7 pt captions need up to 149 px */}
          {/* TASKS.csv #2137 — only the rays turn with a bound oblique view; the captions stay level */}
          <g transform={el.rotation ? `rotate(${el.rotation} ${ORIGIN.x} ${ORIGIN.y})` : undefined}>
            <line x1={ORIGIN.x} y1={ORIGIN.y} x2={ORIGIN.x} y2="14" stroke="#1a2028" strokeWidth="1.6" />
            <text x={ORIGIN.x} y="10" fontSize={printPx(printPt.small)} fontWeight="700" textAnchor="middle" fill="#1a2028">GN</text>
            <line x1={ORIGIN.x} y1={ORIGIN.y} x2={t.x} y2={t.y} stroke="#1a2028" strokeWidth="1.2" />
            <text x={t.x} y={t.y - 4} fontSize={printPx(printPt.small)} textAnchor="middle" fill="#1a2028">★</text>
            <line x1={ORIGIN.x} y1={ORIGIN.y} x2={m.x} y2={m.y} stroke="#1a2028" strokeWidth="1.2" strokeDasharray="4 2" />
            <text x={m.labelX} y={m.y - 2} fontSize={printPx(printPt.small)} fontWeight="700" textAnchor={m.anchor} fill="#1a2028">MN</text>
          </g>
          <text x="4" y="98" fontSize={cap} fill="#1a2028">{tr("True north {v} of grid north", { v: fmt(convergence) })}</text>
          <text x="4" y="109" fontSize={cap} fill="#1a2028">{tr("Magnetic declination {v} ({year})", { v: fmt(declination), year: date.slice(0, 4) })}</text>
          <text x="4" y="120" fontSize={cap} fill="#55606e">{rateText}</text>
          {ang.schematic && <text x="4" y="131" fontSize={cap} fill="#55606e">{tr("Angles not to scale")}</text>}
        </svg>
      </div>
    );
  }
  if (el.type === "north") return (
    <div style={{ ...wrap, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined, transformOrigin: "27px 35px" }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
      <svg width="54" height="70" viewBox="0 0 54 70">
        <polygon points="27,4 38,44 27,36 16,44" fill="#ffffff" stroke="#1a2028" strokeWidth="1.5" strokeLinejoin="round" />
        <polygon points="27,4 38,44 27,36" fill="#666" />
        <text x="27" y="64" fontSize={printPx(printPt.label)} fontWeight="700" textAnchor="middle" fill="#1a2028" fontFamily="'Exo 2', system-ui, sans-serif">N</text>
      </svg>
    </div>
  );
  if (el.type === "scale") {
    // "Customize the scale bar by changing the number, but without changing the scale — if I change
    // 200 to 300 the SIZE has to change." The bar's on-page length now tracks el.meters at whatever
    // real pixel-per-metre ratio was last established (by syncing to a view, or the plain default for
    // a freeform bar that's never been synced) — see pxPerMeter's definition up top — instead of a
    // fixed 180px that only ever changed its printed label.
    const px = Math.max(2, Math.round((el.meters || 100) * (el.pxPerMeter || DEFAULT_PX_PER_METER))); // #920 — no 20 px floor: the bar is as long as its label says
    return (
      <div style={wrap} onMouseDown={onDown} data-el-id={el.id} {...kb}>
        <svg width={px + 4} height={el.viewPlane ? 44 : 34} style={{ overflow: "visible" }}>
          <rect x="2" y="4" width={px / 2} height="10" fill="#1a2028" />
          <rect x={2 + px / 2} y="4" width={px / 2} height="10" fill="#fbfbf8" stroke="#1a2028" />
          <rect x="2" y="4" width={px} height="10" fill="none" stroke="#1a2028" />
          <text x="2" y="28" fontSize={printPx(printPt.small)} fill="#1a2028" fontFamily="'Exo 2', system-ui, sans-serif">0</text>
          <text x={px + 2} y="28" fontSize={printPx(printPt.small)} textAnchor="end" fill="#1a2028" fontFamily="'Exo 2', system-ui, sans-serif">{el.meters} m</text>
          {el.viewPlane && <text x="2" y="40" fontSize={printPx(printPt.small)} fill="#1a2028" fontFamily="'Exo 2', system-ui, sans-serif">{tr("in the view plane (oblique view)")}</text>}
        </svg>
      </div>
    );
  }
  // TASKS.csv #1480 / #1637 — a long bound legend (a strip log's or a section's 40+ rows) ran past the page foot: it now flows into as many
  // columns (up to 4) as it needs to end above the sheet's bottom margin, from the rows' printed heights
  // TASKS.csv #2134 — held to the room right of the legend too; rows past the sheet are left out and counted
  const legendLay = el.type === "legend" ? (() => {
    const row = (it) => (it?.[2]?.heading ? printPx(printPt.small) + 8 : it?.[2]?.note ? printPx(printPt.caption) + 4 : it?.[2]?.ramp ? 44 : Math.max(17, printPx(printPt.small) + 5));
    const labelW = (it) => (it?.[2]?.ramp ? 152 : String(it?.[0] ?? "").length * printPx(printPt.small) * 0.55);
    return legendFit(el.items || [], { x: Number(el.x) || 0, y: Number(el.y) || 0, pageW: ctx?.pageW || 1123, pageH: ctx?.pageH || 794, rowH: row, labelW });
  })() : { cols: 1, shown: 0, left: 0 };
  const legendCols = legendLay.cols;
  const legendItems = el.type === "legend" ? (legendLay.left ? [...(el.items || []).slice(0, legendLay.shown), [tr("+ {n} more row(s) do not fit on the sheet: move the legend up or left, or edit it", { n: legendLay.left }), null, { note: true }]] : el.items || []) : [];
  if (el.type === "legend") return (
    <div style={{ ...wrap, background: "#fff", border: frameBorder(el, "1px solid #ccc"), padding: "8px 12px", minWidth: 150 * legendCols, width: legendCols > 1 ? undefined : el.w || undefined, boxSizing: "border-box" }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
      {handles}
      <div style={{ fontSize: printPx(printPt.body), fontWeight: 700, color: INK, marginBottom: 6, fontFamily: "'Exo 2', system-ui, sans-serif" }}>{tr("Legend")}</div>
      <div style={legendCols > 1 ? { columnCount: legendCols, columnGap: 18 } : undefined}>
      {legendItems.map(([name, color, opt], i) => opt?.heading ? ( /* TASKS.csv #725 — a group heading; legendItems: #2134 */
        <div key={i} style={{ fontSize: printPx(printPt.small), fontWeight: 700, color: INK, margin: i ? "6px 0 2px" : "0 0 2px", breakAfter: "avoid" /* #1480 — a heading never ends a column */ }}>{name}</div>
      ) : opt?.note ? ( /* TASKS.csv #1633 — what a capped group left out */
        <div key={i} style={{ fontSize: printPx(printPt.caption), fontStyle: "italic", color: "#55606e", margin: "0 0 3px 28px", maxWidth: 200 /* #2134 — a long note wraps, it does not widen the legend past the sheet */ }}>{name}</div>
      ) : opt?.ramp ? ( /* a block model's continuous scale */
        <div key={i} style={{ marginBottom: 4, breakInside: "avoid" }}>
          <div style={{ fontSize: printPx(printPt.small), fontWeight: 700, color: INK, marginTop: i ? 6 : 0 }}>{name}{opt.ramp.log ? tr(" · log scale") : ""}</div>
          <div style={{ height: 10, width: 150, border: "1px solid #999", background: `linear-gradient(to right, ${opt.ramp.colors.join(", ")})` }} />
          <div style={{ display: "flex", justifyContent: "space-between", width: 152, fontSize: printPx(printPt.small), color: INK }}><span>{opt.ramp.minLabel}</span><span>{opt.ramp.maxLabel}</span></div>
        </div>
      ) : (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, breakInside: "avoid" /* #1480 — a row is never split between columns */ }}>
          <span style={{ width: 20, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>{opt?.pattern != null ? <PatternSwatch code={opt.pattern} color={color} size={14} style={{ ...swatchShape(opt?.kind, 14), display: "inline-block", border: "1px solid #999" }} /> /* #1995 — the FGDC pattern the section / strip log draws */ : <span style={{ ...swatchShape(opt?.kind, 14), background: color, opacity: opt?.opacity ?? 1 /* #1122 — the map layer's drape opacity */, display: "inline-block", border: opt?.kind === "line" ? "none" : "1px solid #999" }} />}</span>{/* #948 — square / line / dot */}
          <span style={{ fontSize: printPx(printPt.small), color: INK }}>{name}</span>
        </div>
      ))}
      </div>
    </div>
  );
  // TASKS.csv #911 — a table: live drillhole collars, or a static copy (Best intercepts' results). Print typography (pt),
  // numbers right-aligned in tabular figures, a hairline grid; rows beyond the limit are counted, not dropped silently.
  if (el.type === "table") {
    let columns = el.columns || [], rows = el.rows || [], more = 0, surveyNote = null, head = null, nextRow = 0; // head, nextRow: #1638
    if (el.source === "collars") {
      const cs = sortedCollars(ctx?.collars || []);
      const f = (v, d) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v).toFixed(d) : "");
      columns = [tr("Hole"), tr("Easting"), tr("Northing"), tr("Elev. (m)"), tr("Azimuth (grid)") /* #1771 — GeoStrix keeps grid azimuths */, tr("Dip"), tr("Depth (m)")];
      const sl = collarTableSlice(cs, { firstRow: el.firstRow, maxRows: el.maxRows, filter: el.holeFilter }); // #1638
      const star = (v, fromSurvey) => (v !== "" && fromSurvey ? `${v}*` : v); // #1483 — from the first survey station; #1771 each value its own flag
      rows = sl.rows.map((c) => [String(c.hole_id ?? ""), f(c.x, 0), f(c.y, 0), f(c.z, 1), Number.isFinite(c.azSurvey) ? `${f(c.azimuth, 0)}†` /* #2133 */ : star(f(c.azimuth, 0), c.azFromSurvey ?? c.orientFromSurvey), star(f(Number.isFinite(c.dip) ? -c.dip : "", 0), c.dipFromSurvey ?? c.orientFromSurvey) /* #1033 — negative = down, as imported */, f(c.length, 1)]);
      more = sl.after; head = sl.start > 0 || el.holeFilter ? tr("Rows {a}–{b} of {n}", { a: sl.total ? sl.start + 1 : 0, b: sl.end, n: sl.total }) + (el.holeFilter ? ` (${el.holeFilter})` : "") : null; nextRow = sl.end + 1;
      if (sl.rows.some((c) => c.orientFromSurvey)) surveyNote = tr("* From the shallowest survey station: the collar record has none for that value.");
      // #2133 — a collar azimuth that disagrees with the survey: the collar file's north reference, or a planned azimuth
      const differs = sl.rows.filter((c) => Number.isFinite(c.azSurvey));
      if (differs.length) surveyNote = (surveyNote ? surveyNote + " " : "") + tr("† The collar record's azimuth, which differs from the hole's shallowest survey station (grid north) by more than 0.5°: {list}. The collar file may use another north reference, or hold the planned azimuth.", { list: differs.slice(0, 6).map((c) => `${c.hole_id} ${f(c.azSurvey, 1)}`).join(", ") + (differs.length > 6 ? ` (+${differs.length - 6})` : "") });
    }
    const fs = printPx(el.fontPt || printPt.small), cell = { padding: `${Math.round(fs * 0.25)}px ${Math.round(fs * 0.5)}px`, borderBottom: "1px solid #c9ced4" /* #999 — 0.26 mm on paper like the scale bar; 0.5 px vanished on screen at Fit zoom */, whiteSpace: "nowrap" };
    const numeric = columns.map((_, j) => rows.length > 0 && rows.every((r) => r[j] === "" || /^[-+≥<>]?[\d.,]+[*†]?$/.test(String(r[j])))); // \*: #1483; †: #2133
    return (
      <div style={{ ...wrap, width: el.w || 520, background: "#fff", border: frameBorder(el), padding: 6, boxSizing: "border-box", fontFamily: "'Exo 2', system-ui, sans-serif", color: "#1a2028" }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
        {el.title && <div style={{ fontSize: printPx((el.fontPt || printPt.small) + 2), fontWeight: 700, marginBottom: 4 }}>{fillText(el.title, ctx)}</div>}
        {head && <div style={{ fontSize: fs, color: "#555", marginBottom: 3 }}>{head}</div>}{/* #1638 */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: fs, fontVariantNumeric: "tabular-nums", tableLayout: "auto" }}>
          <thead><tr>{columns.map((h, j) => <th key={j} style={{ ...cell, textAlign: numeric[j] ? "right" : "left", fontWeight: 600, borderBottom: "1px solid #1a2028" }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} style={{ ...cell, textAlign: numeric[j] ? "right" : "left" }}>{v}</td>)}</tr>)}
            {!rows.length && <tr><td colSpan={Math.max(1, columns.length)} style={{ ...cell, color: "#777" }}>{el.source === "collars" ? (el.holeFilter ? tr("No hole id contains \"{f}\".", { f: el.holeFilter }) : tr("No collars in the project yet.")) : tr("No rows.")}</td></tr>}
            {more > 0 && <tr><td colSpan={columns.length} style={{ ...cell, color: "#555", fontStyle: "italic" }}>{tr("… and {n} more hole(s), from row {r}: a table with that First row, or Continue on new pages", { n: more, r: nextRow })}</td></tr>}
          </tbody>
        </table>
        {surveyNote && <div style={{ fontSize: printPx(Math.max(5, (el.fontPt || printPt.small) - 1)), fontStyle: "italic", color: "#3a424c", marginTop: 4, lineHeight: 1.35, whiteSpace: "normal" }}>{surveyNote}</div>}
        {el.note && <div style={{ fontSize: printPx(Math.max(5, (el.fontPt || printPt.small) - 1)), fontStyle: "italic", color: "#3a424c", marginTop: 4, lineHeight: 1.35, whiteSpace: "normal" }}>{fillText(el.note, ctx)}</div>}{/* TASKS.csv #936 */}
        {handles}
      </div>
    );
  }
  // TASKS.csv #19 — shapes/annotation tools
  if (el.type === "drillplan") return ( /* TASKS.csv #1639 */
    <div style={{ ...wrap, width: el.w, height: el.h, border: frameBorder(el), boxSizing: "content-box" }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
      <DrillPlanElement el={el} collars={ctx?.collars || []} gridCaption={ctx?.gridCaption || ""} assays={ctx?.assays || null} assayElements={ctx?.assayElements || null} />{/* gridCaption: #2301; assays: #2473 */}
      {handles}
    </div>
  );
  if (el.type === "rect") return (
    <div style={{ ...wrap, width: el.w, height: el.h }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
      <svg width={el.w} height={el.h} style={{ display: "block" }}>
        <rect x={(el.strokeWidth || 0) / 2} y={(el.strokeWidth || 0) / 2} width={Math.max(0, el.w - (el.strokeWidth || 0))} height={Math.max(0, el.h - (el.strokeWidth || 0))}
          fill={el.fillOpacity > 0 ? el.fill : "none"} stroke={el.stroke} strokeWidth={el.strokeWidth} />
      </svg>
      {handles}
    </div>
  );
  if (el.type === "arrow") {
    const rad = (el.angle * Math.PI) / 180;
    const dx = Math.cos(rad) * el.length, dy = Math.sin(rad) * el.length;
    const pad = 12; // room for the arrowhead so it isn't clipped by the svg bounds
    const w = Math.abs(dx) + pad * 2, h = Math.abs(dy) + pad * 2;
    const x1 = dx < 0 ? w - pad : pad, y1 = dy < 0 ? h - pad : pad;
    const x2 = x1 + dx, y2 = y1 + dy;
    const headLen = 10, headAngle = Math.PI / 7;
    const hx1 = x2 - headLen * Math.cos(rad - headAngle), hy1 = y2 - headLen * Math.sin(rad - headAngle);
    const hx2 = x2 - headLen * Math.cos(rad + headAngle), hy2 = y2 - headLen * Math.sin(rad + headAngle);
    return (
      <div style={{ ...wrap, width: w, height: h }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
        <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={el.stroke} strokeWidth={el.strokeWidth} />
          <polyline points={`${hx1},${hy1} ${x2},${y2} ${hx2},${hy2}`} fill="none" stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        {selected && !print && !multiSelected && !el.locked && onResizeStart && <Handles which={["tip"]} at={{ tip: { left: x2, top: y2 } }} onStart={(e, h) => onResizeStart(e, el, h)} />}{/* #906 */}
      </div>
    );
  }
  if (el.type === "callout") return (
    <div style={{ ...wrap, width: el.w, background: el.fill, border: `1.5px solid ${el.stroke}`, borderRadius: 6, padding: "8px 12px", position: "absolute", boxSizing: "border-box" }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
      <div style={{ fontSize: printPx(printPt.small), color: INK, fontFamily: "'Exo 2', system-ui, sans-serif" }}>{el.text}</div>
      {handles}
      <svg width="16" height="10" style={{ position: "absolute", left: 14, bottom: -9 }}>
        <polygon points="0,0 16,0 5,10" fill={el.fill} stroke={el.stroke} strokeWidth="1.5" />
      </svg>
    </div>
  );
  if (el.type === "freehand") {
    // minMax (a plain reduce loop) rather than Math.max(...xs) — spreading a large array as call
    // arguments can exceed the JS engine's argument-count limit; a careful/slow freehand stroke can
    // rack up thousands of points, so this avoids the same crash class fixed elsewhere in the app
    // (see layers.js's minMax header comment).
    const w = minMax(el.points.map((p) => p[0])).max + 4, h = minMax(el.points.map((p) => p[1])).max + 4;
    return (
      <div style={{ ...wrap, width: w, height: h }} onMouseDown={onDown} data-el-id={el.id} {...kb}>
        <svg width={w} height={h} style={{ display: "block" }}>
          <polyline points={el.points.map((p) => p.join(",")).join(" ")} fill="none" stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return null;
}

// TASKS.csv #19 — small labeled color-swatch input, reused across the new shape/annotation property
// editors (rect/arrow/callout) instead of repeating the same label+input markup three times.
function ColorRow({ label, value, onChange }) {
  return (
    <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ flex: 1 }}>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 30, height: 26, padding: 0, border: "1px solid var(--color-border)", borderRadius: 4, background: "transparent", cursor: "pointer" }} />
    </label>
  );
}

// TASKS.csv #102 — reusable frame/border controls (width, color, style), same fields ViewportControls
// already uses inline for "viewport" elements, now shared with text/title/legend too instead of
// building a second UI. frameWidth defaults to 0 here (no border) rather than viewport's own 1,
// since a fresh text/title/legend element never had a border before this — a default width of 0
// means nothing changes for existing elements until the user explicitly turns one on.
function FrameControls({ sel, updateSelected }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", flex: 1 }}>{tr("Frame width")}<input type="number" min="0" value={sel.frameWidth ?? 0} onChange={(e) => updateSelected({ frameWidth: Math.max(0, Number(e.target.value) || 0) })} style={{ ...inp, marginTop: 4, marginBottom: 0 }} />
        </label>
        <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Colour")}<input type="color" value={sel.frameColor || INK} onChange={(e) => updateSelected({ frameColor: e.target.value })} style={{ display: "block", marginTop: 4, width: 34, height: 30, padding: 0, border: "1px solid var(--color-border)", borderRadius: 5, background: "none", cursor: "pointer" }} />
        </label>
      </div>
      <label style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Frame style")}<select value={sel.frameStyle || "solid"} onChange={(e) => updateSelected({ frameStyle: e.target.value })} style={inp}>
          <option value="solid">{tr("Solid")}</option>
          <option value="dashed">{tr("Dashed")}</option>
          <option value="double">{tr("Double")}</option>
        </select>
      </label>
    </div>
  );
}

const pBtn = { display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px", marginBottom: 6, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: "var(--font-size-base)", cursor: "pointer" };
const smallBtn = { display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: "var(--font-size-sm)", cursor: "pointer" }; // TASKS.csv #909
const inp = { width: "100%", marginTop: 4, marginBottom: 8, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" };

// TASKS.csv #65 — icon-only tool button, full name shown on hover via the native `title` attribute.
function ToolIconBtn({ icon, title, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? "#26344a" : "var(--color-bg-subtle)", border: `1px solid ${active ? "var(--color-info)" : "var(--color-border)"}`,
        borderRadius: 6, color: disabled ? "#4a5260" : "var(--color-text)", cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1, flexShrink: 0,
      }}
    >{icon}</button>
  );
}
