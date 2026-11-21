// TASKS.csv #1625 (review #1497, Lawyers) — a plan of the Maps tab's own data in its main pane. It showed a fixed card ('switch tabs
// to see them'), so every raster, terrain or boundary edit was made blind and checked by a trip to the 3D View (1.5-36 s on Lawyers).
// A light 2D canvas, north up: the terrain's hillshade, the rasters at their extents (opacity, transparent colour #1623), the map
// layers, boundaries, collars and surface samples; wheel to zoom, drag to pan, Fit, the cursor's E / N and a scale bar. Pictures are
// decoded once and map layers drawn once per style into a cached bitmap, so a pan redraws bitmaps; the 3D scene is not touched.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { fontSizes, uiFontPx } from "../lib/theme.js"; // TASKS.csv #3900 T2
import { useTextSize } from "../lib/useTextSize.js";
import { useKept, planScope } from "../lib/planKept.js"; // TASKS.csv #3604
import { useHoleVisibility, hiddenIn, checkedOnly } from "../lib/holeVisibilityShare.js"; // TASKS.csv #3605
import { useStore, useSetCursor } from "../lib/store.jsx"; // useSetCursor: TASKS.csv #3467 — the status bar's E / N follow the plan's cursor
import { t as tr } from "../lib/i18n.js";
import { gradeUnitLabel } from "../lib/geochemColumns.js"; // TASKS.csv #3831
import { colorForMedium } from "../lib/layers.js"; // TASKS.csv #3830
import { niceScaleBar } from "../lib/surfacePlan.js";
import { hillshadeRGBA } from "../lib/hillshade.js"; // TASKS.csv #2990 — the no-data cells transparent
import { decodeNoDataMask } from "../lib/demFill.js"; // TASKS.csv #2990
import { drawMapLayer, mapStyleSignature, mapTextureSize } from "../lib/mapLayers.js";
import { keyedCanvas } from "../lib/rasterKey.js";
import { planDataExtent, planFarLayers } from "../lib/mapsPlan.js"; // planFarLayers: TASKS.csv #2125
import { figureSamples, colourFromStops } from "../lib/sampleGrid.js"; // TASKS.csv #1622
import { collarColourFields, collarFieldsLeftOut, perHoleAssay, collarColouring, parseBreaks, collarShapeFields, collarShapes, declutterLabels } from "../lib/collarMapStyle.js"; // TASKS.csv #2459; left out: #3340; declutterLabels: #3883 (#3830)
import { sampleColourChoices, sampleColouring, sampleDotRadius } from "../lib/sampleMapStyle.js"; // TASKS.csv #3883 (#3830) — the samples coloured / sized, with ids and a legend
import { planTraces, highestAt, drawTraces } from "../lib/planTraces.js"; // TASKS.csv #3337 — the holes' traces in plan
import { surveysOnPlan, surveyOutlineBoundary, ringArea } from "../lib/planSurveys.js"; // TASKS.csv #3342 — the point surveys on the plan
import { drawCallouts } from "../lib/collarCallouts.js"; // TASKS.csv #3397 — holes from one pad: one ring and a callout listing them
import { contourLabelSpots } from "../lib/contourLabels.js"; // TASKS.csv #3505 — the index contours' levels on the plan
import { collarSpacing, dotStyle, dotsInView, drawDots, polylineInView, drawShapedDots, dotKey, SIZE_SCALE, shapePath } from "../lib/planDots.js"; // TASKS.csv #2988 / #2989
import HoleValueGridPanel from "./HoleValueGridPanel.jsx"; // TASKS.csv #2658
import PlanModelsList from "./PlanModelsList.jsx"; // TASKS.csv #3829 — the block models and surfaces on the plan
import { planGridStep, planGridLines, gridLabel, measureLine, distanceText } from "../lib/planGrid.js"; // TASKS.csv #2128
import { trueNorthBearingInGridDeg } from "../lib/inversion.js"; // TASKS.csv #2128 — the convergence at the measured line
import { usePlanZoom, viewForBox } from "../lib/planZoom.js"; // TASKS.csv #2657
import { errorNotice } from "../lib/notices.js"; // TASKS.csv #3491
import { usePlanRecapture, recaptureFields } from "../lib/planRecapture.js"; // TASKS.csv #3491 — Layout asks for a fresh capture at a placed snapshot's size
import { usePlanGt, showGtOnPlan, gtRadius, gtLegend } from "../lib/planGt.js"; // TASKS.csv #2755
import { topRasterValueAt } from "../lib/planRasterValue.js"; // TASKS.csv #2853 — the value under the cursor
import { planLodTiles, tilesInView, tilePixelM, lodSourceKey, tileKey } from "../lib/lodTiles.js";
const CAPTURE_MAX_TILES = 600, CAPTURE_WAIT_MS = 20000; // TASKS.csv #3252 phase 4 — Snapshot to Layout's detail tiles (600 x 256 KB in memory at most) // TASKS.csv #3252 — detail tiles where the plan looks
import { pointTransform, isGeographicCrs } from "../lib/reproject.js";
import { graticule, graticuleLabel } from "../lib/planGraticule.js"; // TASKS.csv #3466 // TASKS.csv #2998 — longitude / latitude under the cursor
import { perHoleValuesOf, perHoleFigureAtIntercepts } from "../lib/holeValueGrid.js"; // TASKS.csv #2658; perHoleValuesOf: #2991 (a coded log's values too)

const imageCache = new Map(); // dataUrl (+ key colour) -> { img, ready }
function cachedImage(url, keyColour, onReady) {
  const k = keyColour ? `${keyColour}|${url}` : url;
  let e = imageCache.get(k);
  if (!e) {
    e = { img: null, ready: false };
    imageCache.set(k, e);
    const im = new Image();
    im.onload = () => { e.img = keyColour ? keyedCanvas(im, keyColour) : im; e.ready = true; onReady(); };
    im.src = url;
    if (imageCache.size > 64) imageCache.delete(imageCache.keys().next().value);
  }
  return e.ready ? e.img : null;
}

function hillshadeCanvas(t) {
  const c = document.createElement("canvas");
  c.width = t.gridW; c.height = t.gridH;
  const ctx = c.getContext("2d"), img = ctx.createImageData(t.gridW, t.gridH);
  img.data.set(hillshadeRGBA(t, decodeNoDataMask(t.noDataMask))); // #2990 — filled (no-data) cells left transparent
  ctx.putImageData(img, 0, 0);
  return c;
}


// TASKS.csv #3342 — the point surveys' colours on the plan (none of them the collars' black or the samples' grey)
// TASKS.csv #3456 — a legend glyph of one of the five shapes (the same paths the plan draws)
function ShapeGlyph({ shape }) {
  const ref = React.useRef(null);
  React.useEffect(() => { const c = ref.current?.getContext("2d"); if (!c) return; c.clearRect(0, 0, 14, 14); c.beginPath(); shapePath(c, shape, 7, 7, 4.5); c.fillStyle = "#5a6472"; c.fill(); c.strokeStyle = "#14181e"; c.lineWidth = 1; c.stroke(); }, [shape]);
  return <canvas ref={ref} width={14} height={14} style={{ width: 14, height: 14, flex: "0 0 auto" }} aria-hidden="true" />;
}
// TASKS.csv #3484 — the pixel ratio of a Layout snapshot of a w x h (CSS px) plan: 300 dpi of A3's long side, in [2 dpr, 8], within 36 megapixels
export const SHEET_LONG_PX = 4961; // 420 mm at 300 dpi
export const snapshotRatio = (w, h, dpr = 1) => Math.min(8, Math.max(2 * dpr, SHEET_LONG_PX / Math.max(1, w, h)), Math.sqrt(36e6 / Math.max(1, w * h)));
const CONTOUR_SPOTS = new WeakMap(); // TASKS.csv #3505 — a contour layer's label spots, worked out once per layer object
const SURVEY_COLOURS = ["#0e7490", "#b45309", "#7c3aed", "#be185d", "#15803d", "#1d4ed8"];
// TASKS.csv #2998 — '  ·  57.1291°N 131.4509°W' (null transform or a failed conversion: nothing)
const lonLatText = (T, c) => {
  if (!T) return "";
  try { const [lon, lat] = T(c.x, c.y); return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? `  ·  ${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? "E" : "W"}` : ""; } catch { return ""; }
};
// TASKS.csv #2853 — the top visible grid's value at the cursor, after the E / N
const cursorValueText = (rasters, c) => { const t = topRasterValueAt(rasters, c.x, c.y); return t ? `  ·  ${t.name.length > 28 ? `…${t.name.slice(-27)}` : t.name}: ${t.value.toLocaleString(undefined, { maximumSignificantDigits: 4 })}${t.unit ? ` ${t.unit}` : ""}` : ""; };
export default function MapsPlanView() {
  const { voxelModels = [], generatedSurfaces = [], rasters = [], terrain, mapLayers = [], boundaries = [], collars: allCollars = [], surfaceSamples = [], surfaceElements = [] /* #3883 (#3830) */, assays = [], assayElements = [], layers = {}, customLayers = [], project, survey = [], desurveyMethod, addLayoutImage, goToModule, mapLayoutPagesElements /* #3491 */, setNotices /* #3491 */, addBoundary, updateRaster, updateTerrain } = useStore(); // updateRaster, updateTerrain: #3463 // addBoundary: #3342 // addLayoutImage / goToModule: #3194 // assays: #2459; layers, customLayers: #2658; project: #2128; survey, desurveyMethod: #2991 (a coded RL figure)
  const scope = planScope(project, allCollars); // TASKS.csv #3604 — the set-up kept for the session
  // TASKS.csv #3605 — the plan follows the holes checked in the 3D View (a switch below says so and shows them all)
  const vis = useHoleVisibility(), hiddenN = hiddenIn(allCollars, vis), [onlyChecked, setOnlyChecked] = useKept(scope, "onlyChecked", true);
  const collars = useMemo(() => (onlyChecked ? checkedOnly(allCollars, vis) : allCollars), [allCollars, vis, onlyChecked]);
  // TASKS.csv #2998 / #2298 — the cursor's longitude / latitude beside its E / N (a projected project CRS only), so a zone edge or a point from a
  // report in degrees can be found on the plan, and the readout says which frame its E / N are in
  const toLonLat = project?.crsSet !== false && project?.epsg && !isGeographicCrs(project.epsg) ? pointTransform(project.epsg, 4326) : null; // looked up as the cursor moves: the registry may load after the plan
  const frameText = project?.crsSet === false ? tr(" (local grid)") : "";
  const [chipOpen, setChipOpen] = useState(true); // TASKS.csv #3458 — the Collars panel and its legend can be folded off the plan
  const setStatusCursor = useSetCursor();
  const [captureDpr, setCaptureDpr] = useState(null); // TASKS.csv #3228 step B — the pixel ratio of the Layout snapshot (null: the screen's)
  const drawnDpr = useRef(0);
  const dragSnap = useRef(null); // TASKS.csv #3049 — the picture moved while a drag lasts
  const chipRef = useRef(null); // the Collars chip, for the callouts to keep clear of (#3405)
  // TASKS.csv #3252 phase 1 — a raster with a source description (raster.lod) gets detail tiles where the plan looks: the loader (and the
  // Planetary Computer reader behind it) is loaded the first time one is shown
  const lodRasters = useMemo(() => rasters.filter((r) => r.lod && r.visible !== false && r.bbox), [rasters]);
  const lodLoader = useRef(null);
  const [lodReady, setLodReady] = useState(false);
  const [lodStatus, setLodStatus] = useState(null);
  useEffect(() => {
    if (!lodRasters.length || lodLoader.current) return undefined;
    let off = null, live = true;
    import("../lib/lodTileLoader.js").then((m) => { if (!live) return; lodLoader.current = m; off = m.onLodStatus(setLodStatus); setLodReady(true); });
    return () => { live = false; off?.(); };
  }, [lodRasters.length > 0]);
  const wrapRef = useRef(null), canvasRef = useRef(null), layerCache = useRef(new Map()), drag = useRef(null), gridDrawn = useRef(false); // gridDrawn: #3194
  const [liveSize, setSize] = useState({ w: 800, h: 600 });
  // TASKS.csv #3491 — while Layout's fresh capture is drawn the plan is drawn at the size and view it asked for (the picture's own, not the screen's)
  const [recapture, setRecapture] = useState(null); // { w, h, view } | null
  const [textSizeNow] = useTextSize(); // TASKS.csv #3900 T2 — the labels redraw at a new text size
  const size = useMemo(() => (recapture ? { w: recapture.w, h: recapture.h } : liveSize), [recapture, liveSize]);
  const [view, setView] = useKept(scope, "view", null); // { cx, cy, mPerPx }
  const [cursor, setCursor] = useState(null);
  const [tick, setTick] = useState(0); // an image finished decoding
  // TASKS.csv #3342 — the Geophysics point surveys (thinned to 5,000 points each), drawn on the plan in a colour each, listed with their outline
  const surveys = useMemo(() => surveysOnPlan(layers.geophys_pts), [layers.geophys_pts]);
  const [surveysHidden, setSurveysHidden] = useState(() => new Set());
  const [samplesOn, setSamplesOn] = useState(true); // TASKS.csv #3830 — the plan's surface samples, on or off
  // TASKS.csv #3883 (#3830) — the samples coloured or sized by an element or a field (a Zone), their ids, a legend: the Collars panel's treatment for samples
  const [sampleBy, setSampleBy] = useKept(scope, "sampleBy", "");
  const [sampleSized, setSampleSized] = useKept(scope, "sampleSized", false);
  const [sampleIds, setSampleIds] = useKept(scope, "sampleIds", false);
  const sampleChoices = useMemo(() => sampleColourChoices(surfaceSamples, surfaceElements), [surfaceSamples, surfaceElements]);
  const sampleCol = useMemo(() => (sampleChoices.some((c) => c.key === sampleBy) ? sampleColouring(surfaceSamples, sampleBy) : null), [surfaceSamples, sampleBy, sampleChoices]);
  const [outlineNote, setOutlineNote] = useState("");
  const extent = useMemo(() => planDataExtent({ rasters, terrain, mapLayers, boundaries, collars, surfaceSamples, surveys }), [rasters, terrain, mapLayers, boundaries, collars, surfaceSamples, surveys]);
  const farLayers = useMemo(() => planFarLayers({ rasters, terrain, mapLayers, boundaries, collars, surveys, surfaceSamples }), [rasters, terrain, mapLayers, boundaries, collars, surveys, surfaceSamples]); // #2125; surfaceSamples: #3830
  // TASKS.csv #2459 / #2591 — collars coloured by a collar field or a per-hole assay statistic, and labelled with their ids
  const [colourBy, setColourBy] = useKept(scope, "colourBy", ""); // "" | "f:<field>" | "max:<element>" | "mean:<element>"
  const [showIds, setShowIds] = useKept(scope, "showIds", false);
  const [idsLeftOut, setIdsLeftOut] = useState(0); // TASKS.csv #3505 — hole ids with no room at this zoom
  // TASKS.csv #2755 — 3D Modelling > Grade × thickness in plan's per-hole totals, sent with 'Show on the Maps plan': circles sized by GT
  const gtPlan = usePlanGt();
  const gtMax = useMemo(() => { let m = 0; for (const h of gtPlan?.holes || []) if (h.gt > m) m = h.gt; return m; }, [gtPlan]);
  // TASKS.csv #2128 — a coordinate grid (on by default) and a two-click measure (session state)
  const [showGrid, setShowGrid] = useKept(scope, "showGrid", true);
  const [showLonLat, setShowLonLat] = useKept(scope, "showLonLat", false); // TASKS.csv #3466 — a longitude / latitude graticule beside the E / N grid (a projected CRS only)
  const [measuring, setMeasuring] = useState(false);
  const [mPts, setMPts] = useState([]);
  const colourFields = useMemo(() => collarColourFields(collars), [collars]);
  const fieldsLeftOut = useMemo(() => collarFieldsLeftOut(collars), [collars]); // #3340 — named in the menu, not silently dropped
  // TASKS.csv #3337 — each hole's desurveyed trace in plan with a tick at its toe, on by default when any hole ends more than 10 m from its
  // collar; with a per-hole highest value the dot can sit where that value is down the hole ('at the intercept')
  const planT = useMemo(() => planTraces(collars, survey, desurveyMethod), [collars, survey, desurveyMethod]);
  const [tracesPicked, setTracesPicked] = useKept(scope, "tracesPicked", null); // null: the default above
  const showTraces = tracesPicked ?? planT.longReach > 0;
  const [colourAt, setColourAt] = useKept(scope, "colourAt", "collar"); // "collar" | "intercept"
  const spacingM = useMemo(() => collarSpacing(collars), [collars]); // #2989 — the holes' typical spacing, for the dot size
  // TASKS.csv #3456 / #3457 — the symbol: a shape by a collar field of up to 5 values, a size by the per-hole value's class
  const shapeFields = useMemo(() => collarShapeFields(collars), [collars]);
  const [shapeBy, setShapeBy] = useKept(scope, "shapeBy", "");
  const shapes = useMemo(() => (shapeBy ? collarShapes(collars, shapeBy) : null), [collars, shapeBy]);
  const [sizeBy, setSizeBy] = useKept(scope, "sizeBy", false);
  const [breaksText, setBreaksText] = useKept(scope, "breaksText", ""); // #3050 — typed class breaks for a numeric colouring
  const breaks = useMemo(() => parseBreaks(breaksText), [breaksText]);
  const colouring = useMemo(() => {
    if (!colourBy) return null;
    const [kind, key] = [colourBy.slice(0, colourBy.indexOf(":")), colourBy.slice(colourBy.indexOf(":") + 1)];
    return kind === "f" ? collarColouring(collars, { field: key, breaks }) : collarColouring(collars, { values: perHoleAssay(assays, key, kind), breaks });
  }, [colourBy, collars, assays, breaks]);
  const atIntercept = colourAt === "intercept" && colourBy.startsWith("max:") && planT.traces.size > 0;
  const dotCollars = useMemo(() => {
    if (!atIntercept) return collars;
    const at = highestAt(assays, colourBy.slice(4), planT.traces);
    return collars.map((c) => { const p = at.get(String(c.hole_id)); return p ? { ...c, x: p.x, y: p.y } : c; });
  }, [atIntercept, collars, assays, colourBy, planT]);
  const hill = useMemo(() => (terrain?.elevations?.length && terrain.gridW > 2 ? hillshadeCanvas(terrain) : null), [terrain]);
  // TASKS.csv #1622 (review #1497) — a gridded surface-sample element in one figure: the top visible geochemistry grid, its samples
  // drawn on top in the grid's own colours (a sample's colour against the grid around it shows what the gridding did), its contour
  // layers, and a legend with the method and its parameters
  const figure = useMemo(() => {
    const r = [...rasters].reverse().find((x) => x.visible !== false && x.geochem && x.colourStops?.length);
    if (!r) return null;
    const contours = boundaries.filter((b) => b.visible !== false && b.contourLevels?.length && (b.sourceRaster === r.id || (!b.sourceRaster && String(b.name || "").startsWith(`${r.name} contours`))));
    const levels = [...new Set(contours.flatMap((b) => b.contourLevels))].sort((a, b) => a - b);
    return { r, pts: r.geochem.source === "holes" ? holeFigurePoints(r.geochem, { collars, assays, assayElements, layers, customLayers, survey, desurveyMethod }) : figureSamples(surfaceSamples, r.geochem), log: r.colourStyle?.stretch === "log", levels }; // holes: #2658
  }, [rasters, boundaries, surfaceSamples, collars, assays, assayElements, layers, customLayers, survey, desurveyMethod]); // survey, desurveyMethod: #2991

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(200, el.clientWidth), h: Math.max(160, el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!extent]); // the frame exists only once there is data
  const fit = () => { if (extent) setView({ cx: (extent[0] + extent[2]) / 2, cy: (extent[1] + extent[3]) / 2, mPerPx: Math.max((extent[2] - extent[0]) / size.w, (extent[3] - extent[1]) / size.h) * 1.08 }); };
  usePlanZoom((bbox) => setView(viewForBox(bbox, size.w, size.h))); // #2657 — a card's 'Zoom to'
  // TASKS.csv #3491 (a hook: before the plan's early return; it reads the plan's state when the request arrives) — Layout asks for the picture again at a placed snapshot's frame size and dpi (lib/planRecapture.js): the same ground and centre, the
  // plan as it is now (its layers and colours), then back to Layout with the element's picture replaced
  const recaptureBusy = useRef(false);
  usePlanRecapture(async (spec) => {
    if (!spec || recaptureBusy.current) return;
    recaptureBusy.current = true;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const hadGrid = showGrid;
    let ok = false;
    try {
      const { mapSnapshotPayload } = await import("../lib/mapSnapshot.js");
      if (hadGrid) { setShowGrid(false); for (let i = 0; i < 30 && gridDrawn.current; i++) await frame(); }
      setRecapture({ w: spec.w, h: spec.h, view: spec.view });
      setCaptureDpr(spec.ratio);
      const wantW = Math.round(spec.w * spec.ratio);
      for (let i = 0; i < 120 && !(canvasRef.current?.width === wantW && drawnDpr.current === spec.ratio); i++) await frame();
      const cv = canvasRef.current;
      if (!cv || cv.width !== wantW) throw new Error(tr("The map did not finish drawing at that size."));
      const src = cv.toDataURL("image/png");
      const collarTitle = collarHeading();
      const fields = recaptureFields(snapshotPayloadOf(mapSnapshotPayload, src, cv.width, cv.height, spec.view, { w: spec.w, h: spec.h }, collarTitle));
      mapLayoutPagesElements((els) => els.map((e) => (e.id === spec.elementId ? { ...e, ...fields } : e)));
      ok = true;
    } catch (err) {
      setNotices((p) => [...p, errorNotice(tr("Could not draw the map again for Layout: {message}", { message: err.message }))]);
    } finally {
      setRecapture(null); setCaptureDpr(null);
      if (hadGrid) setShowGrid(true);
      recaptureBusy.current = false;
    }
    if (ok) goToModule("layout");
  });
  const v = recapture?.view || view || (extent ? { cx: (extent[0] + extent[2]) / 2, cy: (extent[1] + extent[3]) / 2, mPerPx: Math.max((extent[2] - extent[0]) / size.w, (extent[3] - extent[1]) / size.h) * 1.08 } : null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !v) return;
    const dpr = captureDpr || window.devicePixelRatio || 1; // TASKS.csv #3228 step B — twice the pixels while Snapshot to Layout captures
    // TASKS.csv #3900 T2 — map labels on screen follow the text size; a capture for Layout (captureDpr set) keeps the Normal sizes, as before
    const labelPx = (step) => (captureDpr ? fontSizes[step] : uiFontPx(step));
    // TASKS.csv #3049 (measured first: a pan frame took 134 ms at Fit on a 6,390-collar project with five rasters and 1,040 contour lines, 17 ms
    // zoomed in) — while the mouse drags, the picture the plan showed when the drag began is moved instead of the layers being drawn again; the
    // strip the move uncovers is background until the button is released, which draws everything at the new place
    const snap = dragSnap.current;
    if (drag.current && snap && snap.mPerPx === v.mPerPx && snap.w === cv.width && snap.h === cv.height) {
      const c2 = cv.getContext("2d");
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.fillStyle = "#f4f5f2"; c2.fillRect(0, 0, cv.width, cv.height);
      c2.drawImage(snap.canvas, Math.round(((snap.cx - v.cx) / v.mPerPx) * dpr), Math.round(((v.cy - snap.cy) / v.mPerPx) * dpr));
      return;
    }
    cv.width = Math.round(size.w * dpr); cv.height = Math.round(size.h * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#f4f5f2"; ctx.fillRect(0, 0, size.w, size.h);
    const left = v.cx - (size.w / 2) * v.mPerPx, top = v.cy + (size.h / 2) * v.mPerPx;
    const X = (x) => (x - left) / v.mPerPx, Y = (y) => (top - y) / v.mPerPx;
    const drawAt = (img, b, alpha = 1) => { if (!img) return; ctx.globalAlpha = alpha; ctx.drawImage(img, X(b[0]), Y(b[3]), (b[2] - b[0]) / v.mPerPx, (b[3] - b[1]) / v.mPerPx); ctx.globalAlpha = 1; };
    const redraw = () => setTick((t) => t + 1);
    if (hill && terrain.visible !== false) drawAt(hill, terrain.bbox, 0.9); // #3463 — the terrain's eye is honoured on the plan
    const viewBoxL = [left, top - size.h * v.mPerPx, left + size.w * v.mPerPx, top];
    rasters.forEach((r) => {
      if (r.visible !== false && r.dataUrl && r.bbox) drawAt(cachedImage(r.dataUrl, !r.grid ? r.keyColour : null, redraw), r.bbox, r.opacity ?? 0.85);
      // #3252 — the detail tiles already read, over the fetched picture, coarse to fine, inside the raster's own box
      const L = lodLoader.current;
      if (!L || !r.lod || r.visible === false || !r.bbox) return;
      // TASKS.csv #3252 phase 4 — while Snapshot to Layout draws at its finer pixel ratio, the tiles of that pixel (not the screen's)
      const capFactor = (window.devicePixelRatio || 1) / dpr, plan = planLodTiles(r, viewBoxL, v.mPerPx * capFactor, capFactor < 1 ? { maxTiles: CAPTURE_MAX_TILES } : undefined);
      if (!plan) return;
      const src = lodSourceKey(r), base = r.pixelM > 0 ? r.pixelM : plan.root.side / 4096;
      ctx.save();
      ctx.beginPath(); ctx.rect(X(r.bbox[0]), Y(r.bbox[3]), (r.bbox[2] - r.bbox[0]) / v.mPerPx, (r.bbox[3] - r.bbox[1]) / v.mPerPx); ctx.clip();
      ctx.globalAlpha = r.opacity ?? 0.85;
      ctx.imageSmoothingEnabled = true;
      for (let z = 0; z <= plan.level; z++) {
        if (tilePixelM(plan.root, z) >= base * 0.99) continue; // no finer than the picture under it
        for (const t of tilesInView(plan.root, z, viewBoxL, r.bbox)) {
          const img = L.lodTileImage(tileKey(src, t.z, t.x, t.y));
          if (img && !L.isEmptyTile(img)) ctx.drawImage(img, X(t.box[0]), Y(t.box[3]), (t.box[2] - t.box[0]) / v.mPerPx, (t.box[3] - t.box[1]) / v.mPerPx);
        }
      }
      ctx.restore();
    });
    mapLayers.forEach((l) => {
      if (l.visible === false || !l.bbox || !l.features?.length) return;
      const sig = mapStyleSignature(l), hit = layerCache.current.get(l.id);
      let c = hit && hit.sig === sig ? hit.canvas : null;
      if (!c) {
        const long = Math.max(l.bbox[2] - l.bbox[0], l.bbox[3] - l.bbox[1]);
        const { width, height } = mapTextureSize(l.bbox, { targetMetresPerPixel: Math.max(0.5, long / 2048), maxSize: 2048 });
        c = document.createElement("canvas"); c.width = width; c.height = height;
        drawMapLayer(c.getContext("2d"), l, l.bbox, width, height);
        layerCache.current.set(l.id, { sig, canvas: c });
      }
      drawAt(c, l.bbox, l.opacity ?? 0.6);
    });
    if (showGrid) { // #2128 — light lines at a round spacing, labelled on the top and left edges
      const step = planGridStep(v.mPerPx), { xs, ys } = planGridLines({ left, top, w: size.w, h: size.h, mPerPx: v.mPerPx }, step);
      ctx.strokeStyle = "rgba(30,40,52,0.16)"; ctx.lineWidth = 1;
      ctx.beginPath();
      xs.forEach((x) => { const px = Math.round(X(x)) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, size.h); });
      ys.forEach((y) => { const py = Math.round(Y(y)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(size.w, py); });
      ctx.stroke();
      ctx.font = `${labelPx("xs")}px sans-serif`; ctx.fillStyle = "rgba(30,40,52,0.7)"; ctx.textBaseline = "top";
      xs.forEach((x) => ctx.fillText(gridLabel(x, "E"), X(x) + 3, 3));
      ctx.textBaseline = "bottom";
      ys.forEach((y) => ctx.fillText(gridLabel(y, "N"), 3, Y(y) - 2));
    }
    ctx.lineJoin = "round";
    if (showLonLat && project?.crsSet !== false && project?.epsg && !isGeographicCrs(project.epsg)) { // #3466
      const toLL = pointTransform(project.epsg, 4326), toXY = pointTransform(4326, project.epsg);
      const g = toLL && toXY ? graticule([left, top - size.h * v.mPerPx, left + size.w * v.mPerPx, top], toLL, toXY) : null;
      if (g) {
        ctx.save(); ctx.strokeStyle = "rgba(30,90,170,0.55)"; ctx.setLineDash([5, 4]); ctx.lineWidth = 1; ctx.fillStyle = "rgba(20,70,140,0.95)"; ctx.font = `${labelPx("xs")}px sans-serif`;
        ctx.beginPath();
        for (const ln of g.lines) ln.pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
        ctx.stroke(); ctx.setLineDash([]);
        for (const ln of g.lines) { // a label where the line enters the view: longitudes along the bottom, latitudes down the right
          const pts = ln.pts.map((p) => [X(p.x), Y(p.y)]).filter(([px, py]) => px >= 0 && px <= size.w && py >= 0 && py <= size.h);
          if (!pts.length) continue;
          const pick = ln.kind === "lon" ? pts.reduce((a, b) => (b[1] > a[1] ? b : a)) : pts.reduce((a, b) => (b[0] > a[0] ? b : a));
          ctx.textAlign = ln.kind === "lon" ? "center" : "right";
          ctx.fillText(graticuleLabel(ln.kind, ln.value, g.step), ln.kind === "lon" ? pick[0] : pick[0] - 3, ln.kind === "lon" ? pick[1] - 3 : pick[1] - 2);
        }
        ctx.restore();
      }
    }
    // TASKS.csv #2988 — the lines in view only (each line's box computed once), one path and one stroke per boundary
    const viewBox = [left, top - size.h * v.mPerPx, left + size.w * v.mPerPx, top];
    boundaries.forEach((b) => {
      if (b.visible === false) return;
      ctx.strokeStyle = b.color || "#e2a63c"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      (b.polylines || []).forEach((pl) => { if (pl.length < 2 || !polylineInView(pl, viewBox)) return; pl.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); });
      ctx.stroke();
      // TASKS.csv #3505 — a contour layer's index contours labelled with their level, as in 3D, when its 'Label index contours' is ticked
      if (b.contourLevels?.length && b.contourLabels !== false) {
        let spots = CONTOUR_SPOTS.get(b);
        if (!spots) { spots = contourLabelSpots(b); CONTOUR_SPOTS.set(b, spots); }
        ctx.save(); ctx.font = `${labelPx("xs")}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.fillStyle = "#1a2028";
        for (const s of spots) {
          const sx = X(s.x), sy = Y(s.y);
          if (sx < -20 || sy < -10 || sx > size.w + 20 || sy > size.h + 10) continue;
          ctx.strokeText(s.text, sx, sy); ctx.fillText(s.text, sx, sy);
        }
        ctx.restore();
      }
      // TASKS.csv #3234 — the parts' names at each part's centre, when the boundary's row asks for them (#2673's 'Label the parts'), as in 3D
      if (b.partLabels && b.partNames?.some(Boolean)) {
        ctx.save(); ctx.font = `${labelPx("sm")}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.fillStyle = "#1a2028";
        (b.polylines || []).forEach((pl, i) => {
          const name = b.partNames[i];
          if (!name || !pl?.length || !polylineInView(pl, viewBox)) return;
          let sx = 0, sy = 0; for (const q of pl) { sx += q.x; sy += q.y; }
          const cx = X(sx / pl.length), cy = Y(sy / pl.length);
          ctx.strokeText(String(name), cx, cy); ctx.fillText(String(name), cx, cy);
        });
        ctx.restore();
      }
    });
    surveys.forEach((s, i) => { // #3342 — small squares, one colour per survey, under the samples and collars
      if (surveysHidden.has(s.key) || s.box[2] < viewBox[0] || s.box[0] > viewBox[2] || s.box[3] < viewBox[1] || s.box[1] > viewBox[3]) return;
      ctx.fillStyle = SURVEY_COLOURS[i % SURVEY_COLOURS.length];
      const xy = s.xy;
      for (let k = 0; k < xy.length; k += 2) { const px = X(xy[k]), py = Y(xy[k + 1]); if (px >= -3 && py >= -3 && px <= size.w + 3 && py <= size.h + 3) ctx.fillRect(px - 1.5, py - 1.5, 3, 3); }
    });
    // TASKS.csv #3830 — 266 rock samples were 2 x 2 px grey squares: a 5 px disc in the colour of its medium (as the 3D view draws it), on an eye of its own in 'Layers on the plan'
    // #3883 (#3830) — coloured by the chosen element or field (no value: a grey ring), sized by the value's class when asked, the ids decluttered
    const sampleLabels = [];
    if (samplesOn) surfaceSamples.forEach((s, i) => {
      if (!Number.isFinite(s.x)) return; const px = X(s.x), py = Y(s.y); if (px < -8 || py < -8 || px > size.w + 8 || py > size.h + 8) return;
      const col = sampleCol ? sampleCol.colourOfIndex(i) : colorForMedium(s.medium), r = sampleDotRadius(sampleCol ? sampleCol.classOfIndex(i) : -1, sampleSized && sampleCol?.kind === "number");
      ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832);
      if (col) { ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = "rgba(255,255,255,0.85)"; } else { ctx.lineWidth = 1.2; ctx.strokeStyle = "#8a929c"; }
      ctx.stroke();
      if (sampleIds && s.sample_id != null && s.sample_id !== "") sampleLabels.push({ x: px + r + 2, y: py - 6, text: String(s.sample_id) });
    });
    if (sampleLabels.length) {
      ctx.font = `${labelPx("xs")}px 'Exo 2', system-ui, sans-serif`; ctx.textBaseline = "top"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.fillStyle = "#1a2028";
      for (const { i } of declutterLabels(sampleLabels, 64, 12)) { const l = sampleLabels[i]; ctx.strokeText(l.text, l.x, l.y); ctx.fillText(l.text, l.x, l.y); }
    }
    if (figure) {
      ctx.lineWidth = 0.8; ctx.strokeStyle = "rgba(20,24,30,0.85)";
      const rad = Math.max(2.2, Math.min(4.5, 3 * Math.sqrt(30 / Math.max(1, v.mPerPx)))); // smaller when zoomed out
      for (const q of figure.pts) {
        const c = colourFromStops(figure.r.colourStops, q.v, figure.log);
        if (!c) continue;
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    // TASKS.csv #2988 / #2989 — the dots in view only, one path per colour (was a beginPath / fill / stroke per hole); the dot shrinks with the
    // holes' spacing on screen and loses its outline when the dots would touch (#2459: a hole with no value under the colouring: a grey ring)
    const ds = dotStyle(spacingM, v.mPerPx, !!colouring);
    if (showTraces && planT.traces.size) drawTraces(ctx, planT.traces, X, Y, viewBox, { tickPx: Math.max(2.5, ds.r + 1.5) }); // #3337 — under the dots
    const sized = sizeBy && colouring?.kind === "number" && colouring.classOf;
    if (shapes || sized) { // #3456 / #3457 — one path per colour, shape and size class
      const keyOf = (c) => dotKey(colouring ? colouring.colourOf(c) : "#1a2028", shapes ? shapes.shapeOf(c) : 0, sized ? Math.max(0, colouring.classOf(c)) : 2);
      drawShapedDots(ctx, dotsInView(dotCollars, keyOf, X, Y, size.w, size.h, ds.r * 1.7 + 1), { ...ds, stroke: colouring ? "#1a2028" : "#ffffff" });
    } else drawDots(ctx, dotsInView(dotCollars, colouring ? (c) => colouring.colourOf(c) : () => "#1a2028", X, Y, size.w, size.h, ds.r + 1), { ...ds, stroke: colouring ? "#1a2028" : "#ffffff" });
    if (gtPlan && gtMax > 0) { // #2755 — at each hole's intercept position (holeTotals: their length-weighted mid-points), area in proportion to GT
      ctx.lineWidth = 1;
      for (const h of gtPlan.holes) {
        if (!Number.isFinite(h.x) || !Number.isFinite(h.y)) continue;
        const r = gtRadius(h.gt, gtMax);
        ctx.beginPath(); ctx.arc(X(h.x), Y(h.y), r ?? 3, 0, Math.PI * 2);
        if (r) { ctx.fillStyle = "rgba(194,65,12,0.55)"; ctx.fill(); }
        ctx.strokeStyle = "#7c2d12"; ctx.stroke(); // a hole assayed with no intercept: a hollow ring (GT 0)
      }
    }
    if (showIds) { // #2459 — the hole ids, decluttered: a label that would overlap one already drawn is left out
      // TASKS.csv #3397 (Matt) — holes that start at one spot (a pad) were drawn as one dot and one id: a ring round them and a callout box
      // listing each id with its colour-by swatch, clear of the other labels; a single hole keeps its id. Snapshot to Layout captures it.
      const keepClear = []; // #3405 — boxes stay clear of the Collars chip and the grid's edge labels
      const cr = chipRef.current;
      if (cr) keepClear.push({ x0: cr.offsetLeft, y0: cr.offsetTop, x1: cr.offsetLeft + cr.offsetWidth, y1: cr.offsetTop + cr.offsetHeight });
      if (showGrid) keepClear.push({ x0: 0, y0: 0, x1: size.w, y1: 14 }, { x0: 0, y0: 0, x1: 58, y1: size.h });
      drawCallouts(ctx, dotCollars /* #3832: the id beside the dot it names, at the intercept when the colour is drawn there */, X, Y, size, { colourOf: colouring ? (c) => colouring.colourOf(c) : undefined, dotR: ds.r, mPerPx: v.mPerPx, more: (n) => tr("+{n} more", { n }), keepClear, report: (r) => setIdsLeftOut(r.leftOut), fontPx: labelPx("xs") /* #3900 */ });
    }
    if (measuring && mPts.length) { // #2128 — the measured line
      ctx.strokeStyle = "#c2185b"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath(); mPts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#c2185b"; mPts.forEach((p) => { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 3.5, 0, Math.PI * 2); ctx.fill(); });
    }
    gridDrawn.current = showGrid; // #3194 — what the canvas holds now
    drawnDpr.current = dpr; // #3228
  }, [v?.cx, v?.cy, v?.mPerPx, size, lodReady /* #3252 */, captureDpr /* #3228 */, chipOpen /* #3458: its size changes the callouts */, samplesOn /* #3830 */, sampleCol, sampleSized, sampleIds /* #3883 (#3830) */, rasters, terrain, hill, mapLayers, boundaries, collars, surfaceSamples, tick, figure, colouring, spacingM /* #2989 */, showTraces, planT, dotCollars /* #3337 */, shapes, sizeBy /* #3456 / #3457 */, surveys, surveysHidden /* #3342 */, showIds, showGrid, showLonLat /* #3466 */, measuring, mPts, gtPlan, gtMax, textSizeNow /* #3900 */]); // gtPlan: #2755

  // TASKS.csv #3252 — once the view has settled (250 ms), ask for the detail tiles it shows; each one that arrives redraws the plan
  useEffect(() => {
    const L = lodLoader.current;
    if (!L || !v || !lodRasters.length) return undefined;
    const id = setTimeout(() => {
      const left = v.cx - (size.w / 2) * v.mPerPx, top = v.cy + (size.h / 2) * v.mPerPx;
      const viewBox = [left, top - size.h * v.mPerPx, left + size.w * v.mPerPx, top];
      const wanted = [];
      for (const r of lodRasters) { const plan = planLodTiles(r, viewBox, v.mPerPx); if (plan) wanted.push({ src: lodSourceKey(r), lod: r.lod, tiles: plan.tiles }); }
      L.wantLodTiles(wanted, [v.cx, v.cy], () => setTick((t) => t + 1));
    }, 250);
    return () => clearTimeout(id);
  }, [v?.cx, v?.cy, v?.mPerPx, size, lodRasters, lodReady]);

  if (!extent || !v) return null;
  const sb = niceScaleBar(v.mPerPx, 140);
  const toWorld = (px, py) => ({ x: v.cx + (px - size.w / 2) * v.mPerPx, y: v.cy - (py - size.h / 2) * v.mPerPx });
  const onWheel = (e) => {
    const r = canvasRef.current.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, at = toWorld(px, py);
    const m = v.mPerPx * (e.deltaY > 0 ? 1.2 : 1 / 1.2);
    setView({ mPerPx: m, cx: at.x - (px - size.w / 2) * m, cy: at.y + (py - size.h / 2) * m });
  };
  const onDown = (e) => {
    drag.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy };
    const cv = canvasRef.current; // #3049 — what the plan shows now, to be moved while the drag lasts
    if (cv && cv.width > 0) { const c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height; c.getContext("2d").drawImage(cv, 0, 0); dragSnap.current = { canvas: c, cx: v.cx, cy: v.cy, mPerPx: v.mPerPx, w: cv.width, h: cv.height }; }
  };
  // #2128 — a click (not a drag) while measuring sets a point; a third click starts a new line
  const measureClick = (e) => {
    const d = drag.current;
    if (!measuring || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    const r = canvasRef.current.getBoundingClientRect(), p = toWorld(e.clientX - r.left, e.clientY - r.top);
    setMPts((q) => (q.length >= 2 ? [p] : [...q, p]));
  };
  const onMove = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const wp = toWorld(e.clientX - r.left, e.clientY - r.top);
    setCursor(wp);
    setStatusCursor({ x: wp.x, y: wp.y, z: null }); // #3467
    const d = drag.current;
    if (d) setView({ mPerPx: v.mPerPx, cx: d.cx - (e.clientX - d.x) * v.mPerPx, cy: d.cy + (e.clientY - d.y) * v.mPerPx });
  };
  const onUp = (e) => { if (e) measureClick(e); const was = drag.current; drag.current = null; if (was && dragSnap.current) { dragSnap.current = null; setTick((t) => t + 1); } }; // #3049 — release: draw every layer at the new place
  // #2128 — the measured line's distance and grid bearing, and where true north is there (a projected project CRS only)
  const measured = measuring && mPts.length === 2 ? (() => {
    const m = measureLine(mPts[0], mPts[1]);
    const conv = project?.crsSet !== false && project?.epsg ? trueNorthBearingInGridDeg((mPts[0].x + mPts[1].x) / 2, (mPts[0].y + mPts[1].y) / 2, project.epsg) : null;
    return { ...m, conv: Number.isFinite(conv) ? conv : null };
  })() : null;
  // the payload of a picture of the plan as it is drawn now (Snapshot to Layout, and Layout's fresh capture at a frame's size, #3491)
  // TASKS.csv #3831 — the collar legend's heading, said in full on the plan AND on the sheet: the statistic, the element and its unit as the Grade tools say it (g/t for gold stored in ppm), and for the highest of a hole that it is one sample, uncut
  const collarHeading = () => {
    if (!colouring) return "";
    const [kind, key] = [colourBy.slice(0, colourBy.indexOf(":")), colourBy.slice(colourBy.indexOf(":") + 1)];
    const unit = assayElements.find((e) => e.symbol === key)?.unit, lbl = unit ? gradeUnitLabel(key, unit) : "";
    if (kind === "max") return lbl ? tr("Highest {el} in the hole ({unit}, single sample, uncut)", { el: key, unit: lbl }) : tr("Highest {el} in the hole{u}", { el: key, u: "" });
    if (kind === "mean") return tr("{el}{u}, length-weighted mean of the hole", { el: key, u: lbl ? ` (${lbl})` : "" });
    return key;
  };
  const snapshotPayloadOf = (mapSnapshotPayload, src, pxW, pxH, vv, sz, collarTitle) => mapSnapshotPayload({ src, pxW, pxH, view: vv, size: sz, mapLayers, boundaries, rasters, collarLegend: colouring?.legend ? colouring.legend.map((l) => (l.other ? { ...l, label: tr("Other: {n} values ({holes} holes)", { n: l.other.length, holes: l.holes.toLocaleString() }) } : l)) : null, /* #3340 */ collarTitle, collars: collars.filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y)).length, samples: samplesOn ? surfaceSamples.filter((s) => Number.isFinite(s.x)).length : 0, /* #3883 (#3830): switched off, not in the legend */ sampleLegend: samplesOn && sampleCol ? sampleCol.legend.map((l) => (l.other ? { ...l, label: tr("Other: {n} values ({count} samples)", { n: l.other.length, count: l.holes.toLocaleString() }) } : l)) : null, sampleTitle: sampleChoices.find((c) => c.key === sampleBy)?.label || "", sampleNoValue: samplesOn && sampleCol ? sampleCol.noValue || 0 : 0, label: project?.name ? `Map view: ${project.name}` : "Map view" });
  // TASKS.csv #3194 (Matt) — the view as it is on screen, to the Layout page (lib/mapSnapshot.js, loaded on use): north up, at its scale,
  // with its centre and extent for Layout's scale bar and coordinate grid, and a legend of what it draws
  const toLayout = async () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const { mapSnapshotPayload } = await import("../lib/mapSnapshot.js");
    // the plan's own grid is left off the picture (its labels shrink with it): Layout draws a labelled one at the sheet's scale, ticked when
    // the plan's was on. The canvas is redrawn without it, captured, and the grid put back.
    const hadGrid = showGrid;
    if (hadGrid) {
      setShowGrid(false);
      for (let i = 0; i < 30 && gridDrawn.current; i++) await new Promise((r) => requestAnimationFrame(r));
    }
    const collarTitle = collarHeading(); // TASKS.csv #3831 — the full heading, not the element symbol
    // TASKS.csv #3228 / #3484 — the plan drawn again for the Layout sheet at 300 dpi of a full A3 sheet's width (4,961 px along its long side: the
    // largest the snapshot is likely to be placed at; one placed smaller prints finer still), at least twice the screen's pixels, at most 8x and
    // 36 megapixels; then back. The drawing is the screen's, scaled (dots, lines and text keep their size on the sheet).
    const want = snapshotRatio(size.w, size.h, window.devicePixelRatio || 1);
    if (want > (window.devicePixelRatio || 1)) { setCaptureDpr(want); for (let i = 0; i < 60 && drawnDpr.current !== want; i++) await new Promise((r) => requestAnimationFrame(r)); }
    // TASKS.csv #3252 phase 4 (Matt's decision 4) — the imagery's detail tiles at the snapshot's own pixel (its mPerPx over the capture ratio), read
    // before the picture is taken (at most CAPTURE_WAIT_MS; what is not read by then keeps the coarser tile or the fetched picture)
    const L = lodLoader.current;
    if (L && lodRasters.length && want > (window.devicePixelRatio || 1)) {
      const mpp = (v.mPerPx * (window.devicePixelRatio || 1)) / want, left = v.cx - (size.w / 2) * v.mPerPx, top = v.cy + (size.h / 2) * v.mPerPx;
      const viewBox = [left, top - size.h * v.mPerPx, left + size.w * v.mPerPx, top], wanted = [];
      for (const r of lodRasters) { const plan = planLodTiles(r, viewBox, mpp, { maxTiles: CAPTURE_MAX_TILES }); if (plan) wanted.push({ src: lodSourceKey(r), lod: r.lod, tiles: plan.tiles }); }
      if (wanted.length) {
        await new Promise((resolve) => {
          let off = null;
          const end = setTimeout(() => { off?.(); resolve(); }, CAPTURE_WAIT_MS);
          off = L.onLodStatus((st) => { if (st.loading === 0) { clearTimeout(end); off?.(); resolve(); } });
          L.wantLodTiles(wanted, [v.cx, v.cy], () => setTick((t) => t + 1));
        });
        setTick((t) => t + 1);
        for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
      }
    }
    const src = cv.toDataURL("image/png");
    setCaptureDpr(null);
    if (hadGrid) setShowGrid(true);
    addLayoutImage({ ...snapshotPayloadOf(mapSnapshotPayload, src, cv.width, cv.height, v, size, collarTitle), utmGrid: hadGrid });
    goToModule("layout");
  };
  const chip = { position: "absolute", background: "rgba(255,255,255,0.9)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "3px 7px", fontSize: "var(--font-size-sm)", color: "#1a2028" };
  return (
    <div ref={wrapRef} className="ge-maps-plan" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ width: size.w, height: size.h, display: "block", cursor: drag.current ? "grabbing" : "crosshair" }} aria-label={tr("Plan of the map data")}
        onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { onUp(); setCursor(null); setStatusCursor({ x: null, y: null, z: null }); }} onDoubleClick={measuring ? undefined : fit /* #2128 — a double-click while measuring sets points */} />
      {figure && <FigureLegend f={figure} chip={chip} />}
      {(collars.length > 0 || hiddenN > 0) && ( /* TASKS.csv #2459 / #2591 — the collars' colour and labels, and their legend */
        <div ref={chipRef} style={{ ...chip, left: 10, top: 10, maxWidth: 270, display: "flex", flexDirection: "column", gap: 4, lineHeight: 1.35 }} onMouseDown={(e) => e.stopPropagation()}>
          {hiddenN > 0 && ( /* TASKS.csv #3605 */
            <label style={{ display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={onlyChecked} onChange={(e) => setOnlyChecked(e.target.checked)} />{tr("Only the {shown} of {total} holes checked in StrixViewer", { shown: (allCollars.length - hiddenN).toLocaleString(), total: allCollars.length.toLocaleString() })}</label>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {tr("Collars")}
            <select value={colourBy} onChange={(e) => setColourBy(e.target.value)} aria-label={tr("Colour collars by")} style={{ fontSize: "var(--font-size-sm)", flex: 1, minWidth: 0 }}>
              <option value="">{tr("One colour")}</option>
              {colourFields.length > 0 && <optgroup label={tr("Collar field")}>{colourFields.map((f) => <option key={f.key} value={`f:${f.key}`}>{f.grouped ? tr("{field} ({n} values: the commonest 15, the rest as other)", { field: f.key, n: f.values }) : f.key}</option>)}</optgroup>}
              {fieldsLeftOut.length > 0 && <optgroup label={tr("Too many values to colour by")}>{fieldsLeftOut.map((f) => <option key={f.key} disabled value="">{tr("{field}: {n} values", { field: f.key, n: f.values.toLocaleString() })}</option>)}</optgroup>/* #3340 */}
              {assayElements.length > 0 && <optgroup label={tr("Per hole, from the assays")}>
                {assayElements.flatMap((e) => [<option key={`max:${e.symbol}`} value={`max:${e.symbol}`}>{tr("Highest {el} in the hole", { el: e.symbol })}</option>, <option key={`mean:${e.symbol}`} value={`mean:${e.symbol}`}>{tr("{el}, length-weighted mean of the hole", { el: e.symbol })}</option>])}
              </optgroup>}
            </select>
            <button type="button" onClick={() => setChipOpen((o) => !o)} aria-expanded={chipOpen} aria-label={chipOpen ? tr("Fold the Collars panel") : tr("Unfold the Collars panel")} title={chipOpen ? tr("Fold the Collars panel and its legend out of the way") : tr("Unfold the Collars panel")}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "inherit", fontSize: "var(--font-size-sm)" }}>{chipOpen ? "▾" : "▸"}</button>{/* TASKS.csv #3458 */}
          </label>
          {chipOpen && <>
          {shapeFields.length > 0 && ( /* TASKS.csv #3456 — a second variable: the symbol's shape */
            <label style={{ display: "flex", alignItems: "center", gap: 5 }}>{tr("Shape by")}
              <select value={shapeBy} onChange={(e) => setShapeBy(e.target.value)} aria-label={tr("Shape collars by")} style={{ fontSize: "var(--font-size-sm)", flex: 1, minWidth: 0 }}>
                <option value="">{tr("One shape")}</option>
                {shapeFields.map((f) => <option key={f.key} value={f.key}>{f.key}</option>)}
              </select>
            </label>
          )}
          {colouring?.kind === "number" && ( /* TASKS.csv #3457 — the size follows the value's class */
            <label style={{ display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={sizeBy} onChange={(e) => setSizeBy(e.target.checked)} />{tr("Size by the value's class")}</label>
          )}
          {colouring?.kind === "number" && ( /* TASKS.csv #3050 — the class breaks typed, not only the quintiles */
            <label style={{ display: "flex", alignItems: "center", gap: 5 }}>{tr("Class breaks")}
              <input value={breaksText} onChange={(e) => setBreaksText(e.target.value)} placeholder={tr("quintiles, or e.g. 50, 55, 60")} aria-label={tr("Class breaks of the collar colours")} style={{ fontSize: "var(--font-size-sm)", flex: 1, minWidth: 0 }} />
            </label>
          )}
          {colourBy.startsWith("max:") && planT.traces.size > 0 && ( /* TASKS.csv #3337 */
            <label style={{ display: "flex", alignItems: "center", gap: 5 }}>{tr("Colour at")}
              <select value={colourAt} onChange={(e) => setColourAt(e.target.value)} aria-label={tr("Where the colour is drawn")} style={{ fontSize: "var(--font-size-sm)", flex: 1, minWidth: 0 }}>
                <option value="collar">{tr("the collar")}</option>
                <option value="intercept">{tr("the highest interval, down the hole")}</option>
              </select>
            </label>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={showIds} onChange={(e) => setShowIds(e.target.checked)} />{tr("Hole ids")}{showIds && idsLeftOut > 0 && <span style={{ color: "var(--color-text-muted)" }}> {tr("({n} left out: they overlap, zoom in)", { n: idsLeftOut.toLocaleString() }) /* TASKS.csv #3505 */}</span>}</label>
          {planT.traces.size > 0 && ( /* TASKS.csv #3337 */
            <label style={{ display: "flex", alignItems: "center", gap: 5 }} title={tr("{n} of the holes end more than 10 m from their collar in plan (up to {m} m)", { n: planT.longReach.toLocaleString(), m: Math.round(planT.reachMax).toLocaleString() })}>
              <input type="checkbox" checked={showTraces} onChange={(e) => setTracesPicked(e.target.checked)} />{tr("Hole traces (a tick at the toe)")}</label>
          )}
          <HoleValueGridPanel /> {/* TASKS.csv #2658 */}
          {gtPlan && gtMax > 0 && ( /* TASKS.csv #2755 */
            <div aria-label={tr("Grade × thickness legend")} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--font-size-xs)", fontVariantNumeric: "tabular-nums" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>{tr("GT per hole ({u}), from 3D Modelling > Grade × thickness in plan", { u: gtPlan.label })}
                <button type="button" onClick={() => showGtOnPlan(null)} style={{ marginLeft: "auto", fontSize: "var(--font-size-xs)", background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0 }}>{tr("Clear")}</button></span>
              <span style={{ color: "var(--color-text-muted)" }}>{gtPlan.title}</span>
              <span style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                {gtLegend(gtMax).map((l) => <span key={l.gt} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}><svg width={l.r * 2 + 2} height={l.r * 2 + 2} aria-hidden="true"><circle cx={l.r + 1} cy={l.r + 1} r={l.r} fill="rgba(194,65,12,0.55)" stroke="#7c2d12" /></svg>{l.gt.toLocaleString()}</span>)}
                <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}><svg width={8} height={8} aria-hidden="true"><circle cx={4} cy={4} r={3} fill="none" stroke="#7c2d12" /></svg>0</span>
              </span>
              <span style={{ color: "var(--color-text-muted)" }}>{tr("Circle area in proportion to GT; a hollow ring is a hole assayed with no intercept. Each sits at its intercepts' mid-point.")}</span>
            </div>
          )}
          {colouring && (
            <div aria-label={tr("Collar legend")} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--font-size-xs)", fontVariantNumeric: "tabular-nums", maxHeight: 220, overflowY: "auto" }}>
              {/* TASKS.csv #2989 — the legend says what it shows, with the element's unit */}
              <span style={{ fontWeight: 600 }}>{collarHeading()}</span>
              {colouring.legend.map((l, li) => <span key={l.label} title={l.other ? l.other.join(", ") : undefined} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9 * (sizeBy && colouring.kind === "number" ? SIZE_SCALE[li] ?? 1 : 1), height: 9 * (sizeBy && colouring.kind === "number" ? SIZE_SCALE[li] ?? 1 : 1), borderRadius: "50%", border: "1px solid #14181e", background: l.colour, flex: "0 0 auto" }} />{l.other ? tr("Other: {n} values ({holes} holes)", { n: l.other.length, holes: l.holes.toLocaleString() }) /* #3340 */ : l.label}</span>)}
              {shapes && ( /* TASKS.csv #3456 — what each shape stands for */
                <div aria-label={tr("Shape legend")} style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 3 }}>
                  <span style={{ fontWeight: 600 }}>{shapeBy}</span>
                  {shapes.legend.map((l) => <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}><ShapeGlyph shape={l.shape} />{l.label} ({l.count.toLocaleString()})</span>)}
                </div>
              )}
              {atIntercept ? <span>{tr("Each dot sits at the mid-point of its hole's highest interval; the line runs from the collar.")}</span> : null}
              {(colourBy.startsWith("max:") || colourBy.startsWith("mean:")) && !breaks.length ? <span>{colouring.noValue ? tr("Classes at the quintiles of the holes' values; a grey ring is a hole with no value ({n}).", { n: colouring.noValue.toLocaleString() }) : tr("Classes at the quintiles of the holes' values; a grey ring is a hole with no value.")}{/* counts: #3351 */}</span> : null}
            </div>
          )}
          </>}
        </div>
      )}
      <div style={{ ...chip, left: 10, bottom: 10, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ width: sb.px, height: 5, background: "#1a2028" }} />
        <span>{sb.label}</span>
      </div>
      <div style={{ ...chip, right: 10, top: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontWeight: 700 }} title={tr("Grid north: the plan is drawn on the project's grid, north up. True north differs by the grid convergence (Maps > Project CRS, or Measure).")}>{tr("N ↑")}</span>{/* TASKS.csv #3352 */}
        <button onClick={fit} style={{ fontSize: "var(--font-size-sm)", padding: "1px 7px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", cursor: "pointer" }}>{tr("Fit")}</button>
        <label style={{ display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />{tr("Grid")}</label>{/* #2128 */}
        {project?.crsSet !== false && project?.epsg && !isGeographicCrs(project.epsg) && <label style={{ display: "flex", alignItems: "center", gap: 3 }} title={tr("Longitude / latitude lines over the plan, to find a zone edge or a point given in degrees")}><input type="checkbox" checked={showLonLat} onChange={(e) => setShowLonLat(e.target.checked)} />{tr("Lon / lat")}</label>}{/* TASKS.csv #3466 */}
        <button onClick={toLayout} title={tr("Put this view on the Layout page, north up at its scale, with a legend of its layers")} style={{ fontSize: "var(--font-size-sm)", padding: "1px 7px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", cursor: "pointer" }}>{tr("Snapshot to Layout")}</button>{/* #3194 — the 3D View's own words for the same thing */}
        <button onClick={() => { setMeasuring((m) => !m); setMPts([]); }} aria-pressed={measuring} style={{ fontSize: "var(--font-size-sm)", padding: "1px 7px", border: `1px solid ${measuring ? "var(--color-selected-border)" : "var(--color-border)"}`, borderRadius: 4, background: measuring ? "var(--color-selected-bg)" : "var(--color-bg)", cursor: "pointer" }}>{tr("Measure")}</button>
      </div>
      {measuring && ( /* TASKS.csv #2128 */
        <div role="status" aria-label={tr("Measured line")} style={{ ...chip, right: 10, bottom: 40, maxWidth: 340, lineHeight: 1.4, fontVariantNumeric: "tabular-nums" }}>
          {measured
            ? <>{tr("{d} on the grid · grid bearing {b}°", { d: distanceText(measured.distM), b: measured.bearingDeg.toFixed(1) })}{measured.conv != null && Math.abs(measured.conv) >= 0.01 ? " " + tr("(true north is {c}° {dir} of grid north here)", { c: Math.abs(measured.conv).toFixed(2), dir: measured.conv >= 0 ? tr("east") : tr("west") }) : ""}</>
            : tr("Click two points on the plan to measure between them.")}
        </div>
      )}
      {surveys.length > 0 && ( /* TASKS.csv #3342 — the point surveys, each with its outline as a boundary */
        <div aria-label={tr("Point surveys on the plan")} style={{ ...chip, left: 10, bottom: 56, maxWidth: 300, maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3, lineHeight: 1.35, fontSize: "var(--font-size-xs)" }} onMouseDown={(e) => e.stopPropagation()}>
          <span style={{ fontWeight: 600 }}>{tr("Point surveys (Geophysics)")}</span>
          {surveys.map((s, i) => (
            <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <input type="checkbox" checked={!surveysHidden.has(s.key)} aria-label={tr("Show {name} on the plan", { name: s.name })} onChange={(e) => setSurveysHidden((h) => { const n = new Set(h); if (e.target.checked) n.delete(s.key); else n.add(s.key); return n; })} />
              <span style={{ width: 8, height: 8, background: SURVEY_COLOURS[i % SURVEY_COLOURS.length], flex: "0 0 auto" }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.name}>{tr("{name} ({n})", { name: s.name, n: s.n.toLocaleString() })}</span>
              <button type="button" style={{ fontSize: "var(--font-size-xs)", background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0 }}
                title={tr("Add the survey's outline (the convex hull of its points) to Boundaries")}
                onClick={() => { const b = surveyOutlineBoundary(layers.geophys_pts, s.key); if (!b) { setOutlineNote(tr("{name}: too few points for an outline.", { name: s.name })); return; } addBoundary(b); setOutlineNote(tr("Added \"{name}\" to Boundaries: the convex hull of {n} points, {ha} ha.", { name: b.name, n: s.n.toLocaleString(), ha: (ringArea(b.polylines[0]) / 1e4).toLocaleString(undefined, { maximumFractionDigits: 1 }) })); }}>{tr("Outline as boundary")}</button>
            </span>
          ))}
          {outlineNote && <span role="status" style={{ color: "var(--color-text-muted)" }}>{outlineNote}</span>}
        </div>
      )}
      {(rasters.length > 0 || terrain || surfaceSamples.length > 0 || voxelModels.length > 0 || generatedSurfaces.length > 0) && ( /* TASKS.csv #3463 — the plan's rasters and terrain switched on and off from the plan itself; #3830 — the surface samples too */
        <details style={{ ...chip, right: 10, bottom: 40, maxWidth: 260, maxHeight: 220, overflowY: "auto", fontSize: "var(--font-size-xs)" }} onMouseDown={(e) => e.stopPropagation()}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>{tr("Layers on the plan")}</summary>
          {terrain && <label style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}><input type="checkbox" checked={terrain.visible !== false} onChange={(e) => updateTerrain({ visible: e.target.checked })} aria-label={tr("Show the terrain on the plan")} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={terrain.name}>{tr("Terrain: {name}", { name: terrain.name || tr("hillshade") })}</span></label>}
          {surfaceSamples.length > 0 && <><label style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}><input type="checkbox" checked={samplesOn} onChange={(e) => setSamplesOn(e.target.checked)} aria-label={tr("Show the surface samples on the plan")} />{tr("Surface samples ({n})", { n: surfaceSamples.length.toLocaleString() })}</label>{samplesOn && sampleChoices.length > 0 && ( /* TASKS.csv #3883 (#3830) */
            <div data-sample-style="" style={{ marginLeft: 20, display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
              <label>{tr("Colour samples by")} <select value={sampleCol ? sampleBy : ""} onChange={(e) => setSampleBy(e.target.value)} style={{ fontSize: "var(--font-size-xs)", maxWidth: 140 }}>
                <option value="">{tr("their medium")}</option>
                {sampleChoices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select></label>
              {sampleCol?.kind === "number" && <label style={{ display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={!!sampleSized} onChange={(e) => setSampleSized(e.target.checked)} />{tr("Size by value")}</label>}
              <label style={{ display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={!!sampleIds} onChange={(e) => setSampleIds(e.target.checked)} />{tr("Sample ids")}</label>
              {sampleCol && (
                <div aria-label={tr("Sample legend")} style={{ display: "flex", flexDirection: "column", gap: 2, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ fontWeight: 600 }}>{sampleChoices.find((c) => c.key === sampleBy)?.label}</span>
                  {sampleCol.legend.map((l, li) => <span key={l.label} title={l.other ? l.other.join(", ") : undefined} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 2 * sampleDotRadius(li, sampleSized && sampleCol.kind === "number"), height: 2 * sampleDotRadius(li, sampleSized && sampleCol.kind === "number"), borderRadius: "50%", background: l.colour, flex: "none" }} />{l.label}</span>)}
                  {sampleCol.noValue > 0 && <span>{tr("A grey ring: no value ({n}).", { n: sampleCol.noValue.toLocaleString() })}</span>}
                </div>
              )}
            </div>
          )}</>}{/* TASKS.csv #3830 */}
          {rasters.map((r) => <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}><input type="checkbox" checked={r.visible !== false} onChange={(e) => updateRaster(r.id, { visible: e.target.checked })} aria-label={tr("Show {name} on the plan", { name: r.name })} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{r.name}</span></label>)}
        <PlanModelsList />
        </details>
      )}
      {farLayers.length > 0 && ( /* TASKS.csv #2125 — what Fit leaves out */
        <div role="note" style={{ ...chip, right: 10, top: 44, maxWidth: 340, lineHeight: 1.4 }}>
          {tr("Fit frames the drillholes and leaves out {n} layer(s) far from them: {names}.", { n: farLayers.length, names: farLayers.slice(0, 3).map((l) => `${l.name} (${Math.round(l.far.distM / 1000).toLocaleString()} km)`).join(", ") + (farLayers.length > 3 ? ", …" : "") })}
        </div>
      )}
      <div style={{ ...chip, right: 10, bottom: 10, fontVariantNumeric: "tabular-nums" }}>
        {lodStatus?.loading ? <span style={{ marginRight: 8 }}>{tr("Reading detail ({n} tiles)…", { n: lodStatus.loading.toLocaleString() })}</span> : null}{/* #3252 */}
        {!lodStatus?.loading && lodStatus?.failed ? <span style={{ marginRight: 8 }} title={lodStatus.lastError || ""}>{tr("{n} detail tile(s) could not be read (offline?): the fetched picture shows there", { n: lodStatus.failed.toLocaleString() })}</span> : null}
        {cursor ? `E ${Math.round(cursor.x).toLocaleString()}  N ${Math.round(cursor.y).toLocaleString()}${frameText}${lonLatText(toLonLat, cursor)}${cursorValueText(rasters, cursor)}` : tr("Plan view · wheel to zoom, drag to pan, double-click to fit · drape and 3D in StrixViewer")}
      </div>
    </div>
  );
}

// TASKS.csv #2658 — a per-hole value grid's figure points: the collars with the value the grid was made from (recomputed: the project
// file does not keep a second copy), [{ x, y, v }]
function holeFigurePoints(g, ctx) {
  if (g.placeAt === "intercept") return perHoleFigureAtIntercepts(g, ctx); // #3350 — each dot where the grid used its value
  const vals = perHoleValuesOf(g, ctx); // #2991 — a coded log (thickness, depth or RL of a strand) as well as an assay or a numeric log
  const out = [];
  for (const c of ctx.collars || []) { const v = vals.get(c.hole_id); if (Number.isFinite(v) && Number.isFinite(c.x) && Number.isFinite(c.y)) out.push({ x: c.x, y: c.y, v }); }
  return out;
}

// TASKS.csv #1622 — the figure's legend: the grid, how it was made, its colour scale in the unit, the samples and the contour levels
const fmtV = (x) => (Math.abs(x) > 0 && Math.abs(x) < 0.01 ? Number(x.toPrecision(2)).toString() : Number(x.toPrecision(3)).toLocaleString());
function FigureLegend({ f, chip }) {
  const g = f.r.geochem, stops = f.r.colourStops, unit = g.unit || "";
  const how = g.method === "mincurv" ? tr("minimum curvature, tension {t}", { t: g.tension }) : g.method === "natneigh" ? tr("natural neighbour") : g.method === "spline" ? tr("spline") : tr("IDW power {pw}", { pw: g.power ?? 2 }); // #1985 spline
  const parts = [how, tr("{c} m cells", { c: g.cellM }), g.log ? tr("on log10 values") : null, g.blankM ? tr("blank beyond {d} m", { d: g.blankM }) : null].filter(Boolean);
  const grad = `linear-gradient(to right, ${stops.map((s, i) => `${s.color} ${Math.round((100 * i) / Math.max(1, stops.length - 1))}%`).join(", ")})`;
  return (
    <div style={{ ...chip, left: 10, bottom: 52, maxWidth: 300, display: "flex", flexDirection: "column", gap: 4, lineHeight: 1.35 }} aria-label={tr("Figure legend")}>
      <span style={{ fontWeight: 700 }}>{f.r.name}</span>
      <span style={{ fontSize: "var(--font-size-xs)" }}>{parts.join(" · ")}</span>
      <div style={{ height: 9, background: grad, border: "1px solid rgba(0,0,0,0.25)" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-xs)", fontVariantNumeric: "tabular-nums" }}>
        <span>{fmtV(stops[0].value)}</span><span>{f.log ? tr("{unit}, log scale", { unit }) : unit}</span><span>{fmtV(stops[stops.length - 1].value)}</span>
      </div>
      <span style={{ fontSize: "var(--font-size-xs)", display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", border: "1px solid #14181e", background: stops[Math.floor(stops.length / 2)].color, flex: "0 0 auto" }} />
        {g.source === "holes" ? (g.placeAt === "intercept" ? tr("{n} holes at their intercepts, on the grid's colour scale", { n: f.pts.length.toLocaleString() }) /* #3350 */ : tr("{n} holes at their collars, on the grid's colour scale", { n: f.pts.length.toLocaleString() })) /* #2658 */ : tr("{n} {el} samples{m}, on the grid's colour scale", { n: f.pts.length.toLocaleString(), el: g.symbol, m: g.medium ? tr(" ({medium})", { medium: g.medium }) : "" })}
      </span>
      {f.levels.length > 0 && <span style={{ fontSize: "var(--font-size-xs)", display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 0, borderTop: "2px solid #d62f2f", flex: "0 0 auto" }} />{tr("Contours: {levels} {unit}", { levels: f.levels.map(fmtV).join(", "), unit })}</span>}
    </div>
  );
}
