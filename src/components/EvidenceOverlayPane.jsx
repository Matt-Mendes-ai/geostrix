// TASKS.csv #851 — the evidence overlay pane of Targeting mode: evidence layers (value rasters, distance to map-layer
// features, surface geochemistry) on one grid, fuzzy memberships and an operator, optional known occurrences for
// weights of evidence and a prediction-area plot; the score goes on the map as a raster drape (with its values, so
// the Raster module exports it as GeoTIFF, #854). Maths and the caveats in lib/evidence.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Layers } from "./icons.js";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { pickDefaultReachM, medianSiteSpacing } from "../lib/evidenceSources.js"; // TASKS.csv #1179; #1451
import { drilledCollars } from "../lib/collarStatus.js"; // TASKS.csv #2097
import { mainClusters } from "../lib/dataClusters.js"; // TASKS.csv #1449 / #1450
import { quantileSorted } from "../lib/arrayStats.js"; // TASKS.csv #1281
import { defaultEvidenceEnds, gradeEndsFromSamples, topScoreShare } from "../lib/evidenceEnds.js"; // TASKS.csv #1565; gradeEndsFromSamples: #2099; topScoreShare: #2448
import { topCells } from "../lib/evidence.js"; // TASKS.csv #1456
import { evidenceCoverage, LOW_COVERAGE, scoreBlockers } from "../lib/evidence.js"; // TASKS.csv #2252
import { drilledTrainingMask, evidenceGrid, evidenceExtent, rasterEvidence, distanceEvidence, pointEvidence, sampleValues, membership, fuzzyCombine, FUZZY_OPERATORS, trainingCells, trainingCoverage, bestCutoff, MIN_SIDE, posterior, predictionArea, scoreImage, isOverlayOutput, coveringLayers } from "../lib/evidence.js"; // coveringLayers: #1563
import { cachedEvidence, evidenceDeps, gridSignature } from "../lib/evidenceCache.js"; // TASKS.csv #1457, #1560
import { DRILL_REACH_M, surveyNames, surveyPoints, reachFromSpacing, reachFromNeighbours, voxelColumnEvidence, voxelZRange, holeTraces, holeGradePoints, structureCodes, structureParts, drilledParts /* #1456 */, rasterFloorZ, elementsWithValues, numericLayerFields, layerFieldPoints, zoneCodes, zoneParts, levelSet, targetElevation /* #2326 */ } from "../lib/evidenceSources.js"; // numericLayerFields, layerFieldPoints, zoneCodes, zoneParts: TASKS.csv #1728 // TASKS.csv #1154; elementsWithValues: #1723
const LEVEL_KINDS = new Set(["grade", "pxrf", "numeric", "zone", "pick", "voxel"]); // TASKS.csv #2326 — the cards a Level filters
import { categoricalModels } from "../lib/geologyForward.js";
import { PATHFINDER_PRESETS } from "../lib/anomalyMap.js";
import { valueIn } from "../lib/geochem.js";
import { excludeQAQC, isPxrfRow } from "../lib/qaqc.js"; // isPxrfRow: TASKS.csv #1723
import { f32ToB64 } from "../lib/inversion.js";
import { gridToGeoTIFF, saveGeoTIFF } from "../lib/gridExport.js";
import { ensureExportCrs } from "../lib/projectCrsRequest.js"; // TASKS.csv #1021
import { fontSizes } from "../lib/theme.js";
import { pBtn as sidebarBtn, smallSel } from "../lib/sidebarStyles.js"; // TASKS.csv #997
import { t as tr } from "../lib/i18n.js";
import { LAYER_META } from "../lib/layers.js"; // TASKS.csv #1728
const CODED_LAYERS = ["litho", "alt", "vein", "breccia", "weath", "mnlgy", "structzone", "litho_gc", "alt_gc"]; // TASKS.csv #1455 — the coded logs offered as "distance to"
import { SURVEY_METHODS } from "../lib/geophysSurveys.js"; // TASKS.csv #1209

const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? "—" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : Math.abs(v) >= 10 ? v.toFixed(1) : Math.abs(v) >= 0.1 || v === 0 ? v.toFixed(d) : v.toPrecision(2)); // a small cutoff keeps its digits, not "-0.00"
const numText = (v) => (Number.isFinite(v) ? String(+v.toPrecision(3)) : ""); // what a number input can hold
let nextId = 1;
const DRILL_KINDS = new Set(["grade", "pxrf", "pick", "numeric", "zone"]); // TASKS.csv #1458 — evidence projected up from the holes

import { SOLID_SURFACE_TYPES } from "../lib/viewer/modelHelpers.js"; // TASKS.csv #1567
import { solidFootprintEvidence } from "../lib/evidence.js"; // TASKS.csv #1567
export default function EvidenceOverlayPane({ onClose, onPlanTo = null, solids = [], solidMesh = null }) { // onPlanTo: #1456; solids, solidMesh: #1567
  const { rasters = [], mapLayers = [], surfaceSamples = [], surfaceElements = [], terrain, collars = [], survey = [], assays = [], assayElements = [], layers: projectLayers, customLayers = [], voxelModels = [], project, addRaster, updateRaster, updateVoxelModel, evidenceOverlay, setEvidenceOverlay, geophysSurveys = {} } = useStore();
  const units = useMemo(() => Object.fromEntries(surfaceElements.map((e) => [e.symbol, e.unit])), [surfaceElements]);
  const assayUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const [layers, setLayers] = useState([]); // [{ id, kind, label, ref, shape, low, high, values }]
  const [operator, setOperator] = useState("gamma");
  const [gamma, setGamma] = useState(0.9);
  const [floor, setFloor] = useState(0.01); // TASKS.csv #1555 — memberships run 0.01-0.99 so no single evidence vetoes a cell
  const [training, setTraining] = useState({ source: "none", layerId: "", symbol: assayElements[0]?.symbol || surfaceElements[0]?.symbol || "", min: "" });
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState(null);
  const [cover, setCover] = useState(null); // #1563 — { rasters, models } over the score just sent to the map
  const cleanAssays = useMemo(() => excludeQAQC(assays), [assays]); // TASKS.csv #933: standards and blanks are not grades; #1673: nor pXRF
  // TASKS.csv #1723 (review #1645, Copley) — pXRF readings are screening numbers, not assays: two 0 m readings of 5,700 ppm Cu made two
  // barren collars Cu targets as strong as the mineralization. Lab grades only in "grade along the holes" and the occurrences;
  // pXRF offered apart, labelled, for whoever wants it; an element with no lab value is not a grade source.
  const pxrfAssays = useMemo(() => (assays || []).filter(isPxrfRow), [assays]);
  const labElements = useMemo(() => elementsWithValues(cleanAssays, assayElements, assayUnits), [cleanAssays, assayElements, assayUnits]);
  const pxrfElements = useMemo(() => elementsWithValues(pxrfAssays, assayElements, assayUnits), [pxrfAssays, assayElements, assayUnits]);
  // TASKS.csv #1830 (review #1646, Kodiak) — the overlay's own outputs (score / posterior sent to the map) are neither evidence nor
  // extent: offered as a source the score could be fed back into itself, and its half-cell-wider box grew the grid by a column,
  // which cleared the result on screen and re-sampled every layer (2.09 s)
  const valueRasters = useMemo(() => rasters.filter((r) => r.grid && !isOverlayOutput(r)), [rasters]);
  const pointLayers = useMemo(() => mapLayers.filter((l) => l.geomType === "point" && l.features?.length), [mapLayers]);

  const geophysPts = projectLayers?.geophys_pts, structurePicks = projectLayers?.structure;
  const traces = useMemo(() => holeTraces(drilledCollars(collars).collars, survey, project?.desurveyMethod), [collars, survey, project?.desurveyMethod]); // drilledCollars: #2097 — a proposed collar is not drilled ground
  // TASKS.csv #1727 (review #1645, Copley) — the grid around the drilling grows with the largest reach a drillhole evidence was given
  // (a 1,000 m reach ran into the edge of a box that ended 250 m past the outer holes), and a drill-only overlay says what it ranks
  const drillPad = useMemo(() => Math.max(DRILL_REACH_M, ...layers.filter((l) => l.kind === "grade" || l.kind === "pxrf").map((l) => Number(l.reach) || 0)), [layers]);
  // TASKS.csv #1458 — the elevation range the drillhole evidence is projected from (the desurveyed traces)
  const drillZ = useMemo(() => { let a = Infinity, b = -Infinity; for (const t of traces.values()) for (const p of t) { if (p.z < a) a = p.z; if (p.z > b) b = p.z; } return a <= b ? [a, b] : null; }, [traces]);
  const drillOnly = layers.length > 0 && layers.every((l) => l.kind === "grade" || l.kind === "pxrf" || l.kind === "pick" || l.kind === "numeric" || l.kind === "zone");
  // TASKS.csv #1728 — numeric downhole layers and numeric custom-layer fields along the holes; logged interval zones as distances
  const numericLayerSources = useMemo(() => {
    if (!traces.size) return [];
    const out = [];
    for (const [key, meta] of Object.entries(LAYER_META)) {
      if (!meta.numeric || key === "geophys_pts" || !projectLayers?.[key]?.length) continue;
      if (numericLayerFields(projectLayers[key]).includes("value")) out.push({ key: `num:${key}:value`, label: tr("Drillholes: {name} along the holes", { name: tr(meta.label) }), kind: "numeric", ref: `${key}:value` });
    }
    for (const cl of customLayers) for (const f of numericLayerFields(cl.rows)) out.push({ key: `num:custom:${cl.id}:${f}`, label: tr("Drillholes: {layer} {field} along the holes", { layer: cl.name, field: f }), kind: "numeric", ref: `custom:${cl.id}:${f}` });
    return out;
  }, [traces, projectLayers, customLayers]);
  // TASKS.csv #1455 (review #1352, Silvertip) — every coded log as "distance to" evidence (codes logged at least 3 times), and a
  // mineralization code's percent along the holes
  const codedSources = useMemo(() => {
    if (!traces.size) return [];
    const out = [];
    for (const key of CODED_LAYERS) {
      const rows = projectLayers?.[key]; if (!rows?.length) continue;
      const name = tr(LAYER_META[key]?.label || key);
      zoneCodes(rows, traces, { min: 3 }).forEach((code) => out.push({ key: `zone:${key}:${code}`, label: tr("Distance to logged {layer}: {code}", { layer: name, code }), kind: "zone", ref: `${key}:${code}` }));
      if (key === "mnlgy") {
        const pct = new Map();
        for (const r of rows) { const code = String(r.value ?? "").trim(); if (code && typeof r.extra === "number" && Number.isFinite(r.extra)) pct.set(code, (pct.get(code) || 0) + 1); }
        [...pct].filter(([, n]) => n >= 5).map(([c]) => c).sort().forEach((code) => out.push({ key: `num:coded:mnlgy:${code}:extra`, label: tr("Drillholes: {code} % along the holes", { code }), kind: "numeric", ref: `coded:mnlgy:${code}:extra` }));
      }
    }
    return out;
  }, [traces, projectLayers]);
  const numericRowsOf = (ref) => {
    const m = /^custom:(.+):([^:]+)$/.exec(ref); if (m) { const cl = customLayers.find((c) => String(c.id) === m[1]); return { rows: cl?.rows || [], field: m[2] }; }
    const c = /^coded:([^:]+):(.+):([^:]+)$/.exec(ref); if (c) return { rows: (projectLayers?.[c[1]] || []).filter((r) => String(r.value ?? "").trim() === c[2]), field: c[3] }; // #1455 — one code's rows
    const [key, field] = ref.split(":"); return { rows: projectLayers?.[key] || [], field };
  };
  // TASKS.csv #1450 — surface samples far from the rest (Silvertip's 5 rocks 45 km south) do not size the grid or a reach
  const sampleCore = useMemo(() => { const { keep, dropped } = mainClusters(surfaceSamples); return { samples: surfaceSamples.filter((_, i) => keep[i]), dropped }; }, [surfaceSamples]);
  const media = useMemo(() => { const m = new Map(); sampleCore.samples.forEach((s) => m.set(s.medium || "", (m.get(s.medium || "") || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]).map(([k]) => k); }, [sampleCore]);
  // TASKS.csv #1450 (review #1352, Silvertip) — the area and cell size are the geologist's: "all" sources (as before), the surface samples,
  // the drilling, or a typed box; the cell is typed or automatic (the longest side / 500). With a terrain and "all", the terrain's grid.
  const [gridArea, setGridArea] = useState("all"); // "all" | "samples" | "drilling" | "model" (#1834) | "box"
  const [gridCell, setGridCell] = useState(""); // "" = automatic
  const [gridBox, setGridBox] = useState(["", "", "", ""]);
  const extents = useMemo(() => {
    const mk = () => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; return { grow: (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); }, box: () => (x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null) }; };
    const all = mk(), smp = mk(), drl = mk(), mdl = mk(); // mdl: #1834 — the block models' footprint (Kodiak: the 2 x 2 km IP block inside a 19 x 31 km soil program)
    valueRasters.forEach((r) => { const g = r.grid; all.grow(g.x0 - g.dx / 2, g.yTop - g.ny * g.dy + g.dy / 2, g.x0 + g.nx * g.dx - g.dx / 2, g.yTop + g.dy / 2); });
    mapLayers.forEach((l) => { if (l.bbox) all.grow(...l.bbox); });
    sampleCore.samples.forEach((s) => { if (Number.isFinite(s.x) && Number.isFinite(s.y)) { all.grow(s.x - 200, s.y - 200, s.x + 200, s.y + 200); smp.grow(s.x - 200, s.y - 200, s.x + 200, s.y + 200); } });
    // TASKS.csv #1154 — a project of holes, surveys or block models has an extent too
    for (const t of traces.values()) for (const p of t) { all.grow(p.x - drillPad, p.y - drillPad, p.x + drillPad, p.y + drillPad); drl.grow(p.x - drillPad, p.y - drillPad, p.x + drillPad, p.y + drillPad); } // drillPad: #1727
    (geophysPts || []).forEach((r) => { if (Number.isFinite(r.x) && Number.isFinite(r.y)) all.grow(r.x, r.y, r.x, r.y); });
    voxelModels.forEach((m) => (m.cells || []).forEach((c) => { if (Number.isFinite(c.x) && Number.isFinite(c.y)) { all.grow(c.x - c.dx / 2, c.y - c.dy / 2, c.x + c.dx / 2, c.y + c.dy / 2); mdl.grow(c.x - c.dx / 2, c.y - c.dy / 2, c.x + c.dx / 2, c.y + c.dy / 2); } }));
    return { all: all.box(), samples: smp.box(), drilling: drl.box(), model: mdl.box() };
  }, [valueRasters, mapLayers, sampleCore, traces, geophysPts, voxelModels, drillPad]);
  const cellTyped = Number(gridCell) > 0 ? Number(gridCell) : null;
  // TASKS.csv #2326 (review #2174, WA gold) — a Level (RL from / to) for every hole-based card and the block columns without their own band
  const [levelText, setLevelText] = useState(["", ""]);
  const level = useMemo(() => { const v = levelText.map((t) => (t === "" ? null : Number(t))).map((x) => (Number.isFinite(x) ? x : null)); return v[0] == null && v[1] == null ? null : { zMin: v[0] != null && v[1] != null ? Math.min(v[0], v[1]) : v[0], zMax: v[0] != null && v[1] != null ? Math.max(v[0], v[1]) : v[1] }; }, [levelText]);
  const grid = useMemo(() => {
    if (terrain && gridArea === "all" && !cellTyped) return evidenceGrid({ terrain });
    const ext = evidenceExtent(gridArea, extents, gridBox.map((v) => (v === "" ? NaN : Number(v))));
    return ext ? evidenceGrid({ extent: ext, cellSize: cellTyped }) : null;
  }, [terrain, gridArea, cellTyped, extents, gridBox]);

  // evidence sources the project offers
  const sources = useMemo(() => {
    const out = [];
    valueRasters.forEach((r) => out.push({ key: `raster:${r.id}`, label: tr("Raster: {name}", { name: r.name }), kind: "raster", ref: r.id }));
    mapLayers.forEach((l) => out.push({ key: `dist:${l.id}`, label: tr("Distance to: {name}", { name: l.name }), kind: "distance", ref: l.id }));
    surfaceElements.forEach((e) => out.push({ key: `el:${e.symbol}`, label: tr("Samples: {sym} (robust z)", { sym: e.symbol }), kind: "element", ref: e.symbol }));
    if (surfaceElements.length) PATHFINDER_PRESETS.forEach((p) => out.push({ key: `ix:${p.id}`, label: tr("Samples: {name} index", { name: tr(p.label) }), kind: "index", ref: p.id }));
    // TASKS.csv #1154 — what a drilling project holds: surveys, block models, grades along the holes, logged structures
    surveyNames(geophysPts).forEach((k) => out.push({ key: `geo:${k}`, label: tr("Geophysics: {name}", { name: SURVEY_METHODS[geophysSurveys[k]?.method] ? `${tr(SURVEY_METHODS[geophysSurveys[k].method].label)} — ${k}` : k }), kind: "survey", ref: k } /* #1209 */));
    const categorical = new Set(categoricalModels(voxelModels));
    voxelModels.filter((m) => m.cells?.length && !categorical.has(m)).forEach((m) => {
      out.push({ key: `vox:max:${m.id ?? m.name}`, label: tr("Block model: {name} (highest in each column)", { name: m.name }), kind: "voxel", ref: m.id ?? m.name, how: "max" });
      out.push({ key: `vox:min:${m.id ?? m.name}`, label: tr("Block model: {name} (lowest in each column)", { name: m.name }), kind: "voxel", ref: m.id ?? m.name, how: "min" });
      out.push({ key: `vox:mean:${m.id ?? m.name}`, label: tr("Block model: {name} (mean in each column)", { name: m.name }), kind: "voxel", ref: m.id ?? m.name, how: "mean" }); // #1831
    });
    if (traces.size) labElements.forEach((e) => out.push({ key: `grade:${e.symbol}`, label: tr("Drillholes: {sym} grade along the holes", { sym: e.symbol }), kind: "grade", ref: e.symbol })); // #1723: lab assays only
    if (traces.size) pxrfElements.forEach((e) => out.push({ key: `pxrf:${e.symbol}`, label: tr("Drillholes: {sym} pXRF along the holes (screening readings, not assays)", { sym: e.symbol }), kind: "pxrf", ref: e.symbol })); // #1723
    structureCodes(structurePicks, traces).forEach((code) => out.push({ key: `pick:${code}`, label: tr("Distance to logged structure: {code}", { code }), kind: "pick", ref: code }));
    if (traces.size) out.push({ key: "drilled", label: tr("Distance to drilling (hole traces, in plan)"), kind: "drilled", ref: "traces" }); // #1456 — far from every hole = untested
    // #1567 — a modelled body (grade shell, envelope, imported isosurface): the distance in plan to its footprint
    if (solidMesh) (solids || []).filter((s) => SOLID_SURFACE_TYPES.has(s.type)).forEach((s) => out.push({ key: `solid:${s.id}`, label: tr("Distance in plan to the body: {name}", { name: s.name }), kind: "solid", ref: s.id }));
    out.push(...numericLayerSources); // #1728
    out.push(...codedSources); // #1455 / #1728 — distance to a logged code, a mineral's percent
    return out;
  }, [valueRasters, mapLayers, surfaceElements, geophysPts, voxelModels, traces, labElements, pxrfElements, structurePicks, numericLayerSources, codedSources, solids, solidMesh]);
  // #1567 — rasters that are pictures (RGB, no values) cannot be evidence: said, so three geophysics maps on screen and none in the list is explained
  const pictureRasters = useMemo(() => rasters.filter((r) => !r.grid && !isOverlayOutput(r)), [rasters]);

  // #1457 — through the cache: a reopened pane, or the same layer added again, reuses values computed from the same grid and data
  const computeValues = (src, opts = {}, lv = level) => (grid ? cachedEvidence(
    `${gridSignature(grid)}|${src.kind}|${src.ref}|${src.how || ""}|${opts.field || ""}|${opts.value ?? ""}|${opts.reach || ""}|${opts.zMin ?? ""}|${opts.zMax ?? ""}|L${LEVEL_KINDS.has(src.kind) ? `${lv?.zMin ?? ""}:${lv?.zMax ?? ""}` : ""}`, // L: #2326
    evidenceDeps(src, opts, { rasters, mapLayers, surfaceSamples, surfaceElements, collars, survey, desurveyMethod: project?.desurveyMethod, assays, assayElements, voxelModels, geophysPts, structurePicks, projectLayers, customLayers, solids }), // #1560: only what this source reads
    () => computeValuesNow(src, opts, lv),
  ) : null);
  const computeValuesNow = (src, opts = {}, lv = null) => {
    if (!grid) return null;
    if (src.kind === "raster") { const r = valueRasters.find((x) => x.id === src.ref); return r ? rasterEvidence(grid, r.grid) : null; }
    if (src.kind === "distance") {
      const l = mapLayers.find((x) => String(x.id) === String(src.ref)); if (!l) return null;
      const feats = opts.field ? l.features.filter((f) => String(f.attributes?.[opts.field] ?? "") === String(opts.value)) : l.features;
      return distanceEvidence(grid, feats.flatMap((f) => f.parts));
    }
    if (src.kind === "voxel") { const m = voxelModels.find((x) => (x.id ?? x.name) === src.ref); const own = opts.zMin != null || opts.zMax != null; return m ? voxelColumnEvidence(grid, m, src.how, own ? { zMin: opts.zMin, zMax: opts.zMax } : { zMin: lv?.zMin ?? null, zMax: lv?.zMax ?? null }) : null; } // #1831 — an elevation band; else the Level (#2326)
    if (src.kind === "pick") return distanceEvidence(grid, structureParts(structurePicks, src.ref, traces, lv)); // lv: #2326
    if (src.kind === "drilled") return distanceEvidence(grid, drilledParts(traces)); // #1456
    if (src.kind === "solid") { const m = solidMesh?.(src.ref); return m?.vertices?.length ? solidFootprintEvidence(grid, m.vertices, m.indices) : null; } // #1567
    if (src.kind === "numeric") { const { rows, field } = numericRowsOf(src.ref); return pointEvidence(grid, layerFieldPoints(rows, field, traces, undefined, lv), { maxDistance: opts.reach || DRILL_REACH_M }); } // #1728; lv: #2326
    if (src.kind === "zone") { const i = src.ref.indexOf(":"); return distanceEvidence(grid, zoneParts(projectLayers?.[src.ref.slice(0, i)], src.ref.slice(i + 1), traces, undefined, lv)); } // #1728 / #1455 — ref = layer:code
    if (src.kind === "survey") { const pts = surveyPoints(geophysPts, src.ref); return pointEvidence(grid, pts, { maxDistance: opts.reach || reachFromSpacing(pts, 4) }); }
    if (src.kind === "grade") return pointEvidence(grid, holeGradePoints(cleanAssays, src.ref, assayUnits[src.ref] || "ppm", assayUnits, traces, undefined, lv), { maxDistance: opts.reach || DRILL_REACH_M });
    if (src.kind === "pxrf") return pointEvidence(grid, holeGradePoints(pxrfAssays, src.ref, assayUnits[src.ref] || "ppm", assayUnits, traces, undefined, lv), { maxDistance: opts.reach || DRILL_REACH_M }); // #1723
    const all = sampleValues(surfaceSamples, src.kind === "element" ? { kind: "element", symbol: src.ref } : { kind: "index", preset: src.ref }, units);
    // #1449 — one medium at a time when the layer names one (value = medium): soils and streams are not one surface
    const pts = opts.field === "medium" ? all.filter((_, i) => (surfaceSamples[i].medium || "") === opts.value) : all;
    return pointEvidence(grid, pts, { maxDistance: opts.reach || reachOfMedium(opts.field === "medium" ? opts.value : null) });
  };
  // samples reach about two spacings of their own medium: a regional stream program gets kilometres, a soil grid tens
  // of metres (#1449 — one reach for all media gave Silvertip's soils 2.5 km); far outliers do not count (#1450); the spacing is
  // the median nearest-neighbour distance (#1829 / #1561: the bounding box of seven soil grids gave Kodiak's 48 m soils 700 m)
  const reachOfMedium = (medium) => reachFromNeighbours(medium == null ? sampleCore.samples : sampleCore.samples.filter((s) => (s.medium || "") === medium));
  const reachOf = (src, medium = null) => (src.kind === "grade" || src.kind === "pxrf" || src.kind === "numeric" ? DRILL_REACH_M : src.kind === "survey" ? reachFromSpacing(surveyPoints(geophysPts, src.ref), 4) : reachOfMedium(medium));
  // TASKS.csv #2099 — a drill-grade card's ends from the lab assays of its element (QC and pXRF excluded), length-weighted P50 / P95
  const gradeEnds = (sym) => gradeEndsFromSamples(cleanAssays, (a) => valueIn(a, sym, assayUnits[sym] || "ppm", assayUnits), { mapped: holeGradePoints(cleanAssays, sym, assayUnits[sym] || "ppm", assayUnits, traces, undefined, level).map((p) => p.value) }); // mapped: #2448
  const addLayer = (key) => {
    const src = sources.find((s) => s.key === key); if (!src) return;
    // #1449 — sample evidence starts on the medium with the most samples when there are several (changeable on the card)
    const medium = (src.kind === "element" || src.kind === "index") && media.length > 1 ? media[0] : null;
    const pick = medium != null ? { field: "medium", value: medium, reach: reachOf(src, medium) } : {};
    const values = computeValues(src, pick);
    if (!values) { setMsg(tr("No grid yet: load terrain, a raster, a map layer or samples first.")); return; }
    const finite = values.filter(Number.isFinite);
    if (!finite.length) { setMsg(tr("\"{name}\" has no values over the grid.", { name: src.label })); return; }
    finite.sort(); // TASKS.csv #1281 — one numeric sort of the typed copy, not a comparator sort per quantile (a third of the stall)
    const dec = src.kind === "distance" || src.kind === "solid" /* #1567 */ || src.kind === "pick" || src.kind === "zone", low0 = dec ? 0 : quantileSorted(finite, 0.1), high0 = src.kind === "pick" || src.kind === "zone" ? Math.max(3 * Math.max(grid.dx, grid.dy), pickDefaultReachM(quantileSorted(finite, 0.5), (medianSiteSpacing(collars) || 0) / 3)) /* #1451: one site spacing, at least 3 cells */ : dec ? quantileSorted(finite, 0.5) : quantileSorted(finite, 0.9); // #1179
    let low = low0, high = high0; // let: #2099 (a drill grade takes its assays' ends)
    let log = (src.kind === "grade" || src.kind === "pxrf") && low > 0 && high > low; // #1555: a drill grade ramps on its logarithm (10th -> 90th percentile of a lognormal grade is otherwise flat over most of the holes)
    // #2099 — where the ends came from, said on the card; a drill grade's from its assays
    let endsFrom = dec ? null : { kind: "grid", q: [10, 90] };
    const ge = src.kind === "grade" ? gradeEnds(src.ref) : null;
    if (ge) { low = ge.low; high = ge.high; log = true; endsFrom = { kind: "assays", q: ge.q, n: ge.n, highFrom: ge.highFrom, m: ge.m }; }
    // TASKS.csv #1456 — distance to drilling rises with distance: 0 on a trace, full membership from half the spacing between drill sites
    // (the median, #1451; else the median distance over the grid), at least 3 cells — "untested" is the geologist's to set on the card
    if (src.kind === "drilled") { const site = medianSiteSpacing(collars); const hi = Math.max(3 * Math.max(grid.dx, grid.dy), site ? site / 2 : quantileSorted(finite, 0.5)); setLayers((L) => [...L, { id: nextId++, ...src, shape: "increasing", low: 0, high: hi, log: false, lowText: "0", highText: numText(hi), field: "", value: "", reach: null, values }]); setResult(null); setMsg(null); return; }
    setLayers((L) => [...L, { id: nextId++, ...src, shape: dec ? "decreasing" : "increasing", low, high, log, endsFrom, lowText: numText(low), highText: numText(high), field: pick.field || "", value: pick.value ?? "", reach: pick.reach || reachOf(src), values }]);
    setResult(null); setMsg(null);
  };
  // the grid changed under the layers (terrain loaded, a source removed): re-sample every evidence on the new grid
  const n = grid ? grid.nx * grid.ny : 0;
  useEffect(() => {
    setLayers((L) => (L.some((l) => l.values.length !== n) ? L.map((l) => { const v = computeValues(l, l); return v ? { ...l, values: v } : l; }) : L));
    setResult((r) => (r && r.n !== n ? null : r));
  }, [n]); // the cell count is the signal; computeValues is rebuilt each render
  // #2326 — the Level changed: the hole-based cards and the block columns without their own band are read again
  const levelKey = level ? `${level.zMin ?? ""}:${level.zMax ?? ""}` : "";
  const levelSeen = useRef(levelKey);
  useEffect(() => {
    if (levelSeen.current === levelKey) return;
    levelSeen.current = levelKey;
    setLayers((L) => L.map((l) => { if (!LEVEL_KINDS.has(l.kind)) return l; const v = computeValues(l, l); return v ? { ...l, values: v } : l; }));
    setResult(null);
  }, [levelKey]);
  // TASKS.csv #1003 — the recipe is saved with the project (evidenceOverlay, format v18): which sources, their memberships
  // and filters, the operator and the training points; not the values, which are recomputed from the sources. Restored
  // once when the pane opens on a project that has one (a source no longer in the project is left out, and said).
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !grid) return;
    restored.current = true;
    const R = evidenceOverlay;
    if (!R) return;
    if (R.operator) setOperator(R.operator);
    if (Number.isFinite(R.gamma)) setGamma(R.gamma);
    if (R.grid) { setGridArea(R.grid.area || "all"); setGridCell(R.grid.cell > 0 ? String(R.grid.cell) : ""); if (Array.isArray(R.grid.box)) setGridBox(R.grid.box.map((v) => (Number.isFinite(v) ? String(v) : ""))); } // #1450
    setFloor(Number.isFinite(R.floor) ? R.floor : 0); // #1555: a recipe saved before the floor existed keeps its 0-1 ramps
    const lvSaved = R.level && (Number.isFinite(R.level.zMin) || Number.isFinite(R.level.zMax)) ? { zMin: Number.isFinite(R.level.zMin) ? R.level.zMin : null, zMax: Number.isFinite(R.level.zMax) ? R.level.zMax : null } : null; // #2326
    if (lvSaved) { setLevelText([lvSaved.zMin != null ? String(lvSaved.zMin) : "", lvSaved.zMax != null ? String(lvSaved.zMax) : ""]); levelSeen.current = `${lvSaved.zMin ?? ""}:${lvSaved.zMax ?? ""}`; }
    if (R.training) setTraining((t) => ({ ...t, ...R.training }));
    const missing = [];
    const back = (R.layers || []).flatMap((l) => {
      const src = sources.find((x) => x.key === l.key);
      if (!src) { missing.push(l.label || l.key); return []; }
      const band = { zMin: Number.isFinite(l.zMin) ? l.zMin : null, zMax: Number.isFinite(l.zMax) ? l.zMax : null }; // #1831
      const values = computeValues(src, { field: l.field, value: l.value, reach: l.reach, ...band }, lvSaved);
      return values ? [{ id: nextId++, ...src, shape: l.shape, low: l.low, high: l.high, log: !!l.log, lowText: numText(l.low), highText: numText(l.high), endsEdited: true /* #1565 — a saved card's ends were chosen */, field: l.field || "", value: l.value || "", reach: l.reach || reachOf(src), ...band, values }] : [];
    });
    setLayers(back);
    if (missing.length) setMsg(tr("Restored the saved overlay without {list}: not in this project any more.", { list: missing.join(", ") }));
  }, [grid, evidenceOverlay]); // once, when there is a grid; sources / computeValues are read at that moment
  const recipe = useMemo(() => ({
    layers: layers.map((l) => ({ key: l.key, kind: l.kind, ref: l.ref, label: l.label, shape: l.shape, low: l.low, high: l.high, ...(l.log ? { log: true } : {}), field: l.field || "", value: l.value || "", reach: l.reach, ...(l.kind === "voxel" ? { zMin: l.zMin ?? null, zMax: l.zMax ?? null } : {}) })),
    operator, gamma, floor, training,
    ...(gridArea !== "all" || cellTyped ? { grid: { area: gridArea, cell: cellTyped, ...(gridArea === "box" ? { box: gridBox.map((v) => (v === "" ? null : Number(v))) } : {}) } } : {}), // #1450
    ...(level ? { level } : {}), // #2326
  }), [layers, operator, gamma, floor, training, gridArea, cellTyped, gridBox, level]);
  useEffect(() => {
    if (!restored.current) return; // never write an empty recipe over the saved one before it has been read
    const next = recipe.layers.length ? recipe : null;
    if (JSON.stringify(next) !== JSON.stringify(evidenceOverlay ?? null)) setEvidenceOverlay(next);
  }, [recipe]); // evidenceOverlay is compared, not a trigger
  const updateLayer = (id, patch, recompute = false) => setLayers((L) => L.map((l) => {
    if (l.id !== id) return l;
    const next = { ...l, ...patch };
    if (recompute) {
      const v = computeValues(next, { field: next.field, value: next.value, reach: next.reach, zMin: next.zMin, zMax: next.zMax });
      if (v) {
        next.values = v;
        // #1565 — new values, new default ends, unless the user typed one (endsEdited); the log ramp follows as on Add
        const ge = !next.endsEdited && next.kind === "grade" ? gradeEnds(next.ref) : null; // #2099 — the assays' ends do not move with the grid
        const ends = next.endsEdited ? null : ge || defaultEvidenceEnds(next.kind, v);
        if (ends) Object.assign(next, { low: ends.low, high: ends.high, lowText: numText(ends.low), highText: numText(ends.high), ...(next.kind === "grade" || next.kind === "pxrf" ? { log: ends.log } : {}) });
      }
    }
    return next;
  }));

  // training points
  // TASKS.csv #2618 (re-test of #2446) — drillhole occurrences and the drilled cells are binned finer than a grid cell (a quarter of it), so
  // each cell that holds a sample counts: the 25 m grade bins made '2,137 drilled cells' where 4,558 ten-metre cells hold a sample
  const cellBin = Math.max(0.5, (grid?.dx || 25) / 4);
  const trainingPoints = useMemo(() => {
    const t = training, min = t.min === "" ? NaN : Number(t.min);
    if (t.source === "layer") { const l = pointLayers.find((x) => String(x.id) === String(t.layerId)); return l ? l.features.map((f) => ({ x: f.parts[0][0][0], y: f.parts[0][0][1] })) : []; }
    if (t.source === "collars" && t.symbol && Number.isFinite(min)) {
      // TASKS.csv #933 — standards, blanks and duplicates filed under a real hole id are not grades of that hole: a CRM in
      // a barren hole's sample stream would make it a "known occurrence" (every other grade consumer filters them too)
      // TASKS.csv #1452 (review #1352) — where the grade is along the hole, not its collar: Silvertip's mineralised fans collapsed to
      // two pad cells (and every threshold gave the same three), though the grades lie 300-1,300 m down holes spread hundreds of metres
      return holeGradePoints(cleanAssays, t.symbol, assayUnits[t.symbol] || "ppm", assayUnits, traces, cellBin).filter((p) => p.value >= min).map((p) => ({ x: p.x, y: p.y })); // cellBin: #2618
    }
    if (t.source === "samples" && t.symbol && Number.isFinite(min)) return surfaceSamples.filter((s) => { const v = valueIn(s, t.symbol, units[t.symbol] || "ppm", units); return v != null && v >= min; }).map((s) => ({ x: s.x, y: s.y }));
    return [];
  }, [training, pointLayers, cleanAssays, traces, surfaceSamples, assayUnits, units, cellBin]);
  // TASKS.csv #2446 — every sample of the training element along the holes (any value): the drilled cells the weights are trained on
  const sampledPoints = useMemo(() => (training.source === "collars" && training.symbol ? holeGradePoints(cleanAssays, training.symbol, assayUnits[training.symbol] || "ppm", assayUnits, traces, cellBin).map((p) => ({ x: p.x, y: p.y })) : []), [training.source, training.symbol, cleanAssays, traces, assayUnits, cellBin]);
  // #2618 — the holes behind those cells: with a sample of the element, and with one at or over the cut-off
  const trainingHoles = useMemo(() => {
    if (training.source !== "collars" || !training.symbol) return null;
    const min = training.min === "" ? NaN : Number(training.min), u = assayUnits[training.symbol] || "ppm", any = new Set(), hit = new Set();
    for (const a of cleanAssays) { if (!traces.has(a.hole_id)) continue; const v = valueIn(a, training.symbol, u, assayUnits); if (v == null) continue; any.add(a.hole_id); if (Number.isFinite(min) && v >= min) hit.add(a.hole_id); }
    return { any: any.size, hit: hit.size };
  }, [training, cleanAssays, traces, assayUnits]);
  const circular = (training.source === "samples" && layers.some((l) => (l.kind === "element" && l.ref === training.symbol) || l.kind === "index"))
    || (training.source === "collars" && layers.some((l) => l.kind === "grade" && l.ref === training.symbol));

  const compute = () => {
    if (!grid || !layers.length) return;
    if (layers.some((l) => !Number.isFinite(l.low) || !Number.isFinite(l.high) || l.values.length !== n)) { setMsg(tr("Set both membership points (0 = and 1 =) on every evidence.")); return; }
    const members = layers.map((l) => membership(l.values, { ...l, floor }));
    const fuzzy = fuzzyCombine(members, operator, gamma);
    const valid = new Uint8Array(n);
    let minScore = Infinity;
    for (let k = 0; k < n; k++) { valid[k] = Number.isFinite(fuzzy[k]) ? 1 : 0; if (valid[k] && fuzzy[k] < minScore) minScore = fuzzy[k]; }
    const nValid = valid.reduce((a, v) => a + v, 0);
    let atMin = 0; // #1555 — how many scored cells sit at the lowest score (one evidence's membership vetoed them)
    for (let k = 0; k < n; k++) if (valid[k] && fuzzy[k] <= minScore + 1e-6) atMin++;
    const out = { fuzzy, nValid, n, atMin, minScore: nValid ? minScore : NaN, wofe: null, pa: null, paPost: null, blockers: scoreBlockers(layers, nValid, n, operator) }; // blockers: #2252
    // #2446 — drillhole occurrences are trained on the drilled cells only (hits against misses); the undrilled ground is neither
    const drilled = training.source === "collars" && sampledPoints.length ? drilledTrainingMask(grid, sampledPoints, valid) : null;
    const trainMask = drilled ? drilled.mask : valid;
    const D = trainingCells(grid, trainingPoints, trainMask);
    out.cover = trainingPoints.length ? trainingCoverage(grid, trainingPoints, valid) : null; // #1558
    if (D.size >= 3 && (!drilled || drilled.n - D.size >= 3)) {
      const rowsW = [], chosen = [];
      const N = drilled ? drilled.n : nValid, ND = D.size; // #1556: the prior over the study area (every valid cell), not one layer's cells; #2446: the drilled cells
      // TASKS.csv #2098 (review #2013, Woodjam) — every card gets a row: one with no usable cutoff (no occurrence where it has a value: soils
      // 10 km from the drilling) was left out without a word, and the 'no usable cutoff' text below could never show
      layers.forEach((l) => { const bc = bestCutoff(l.values, D, trainMask, { direction: l.shape }); rowsW.push(bc.best ? { id: l.id /* #1566 */, label: l.label, nMissing: bc.nMissing, nCells: bc.N, ...bc.best, values: l.values, direction: l.shape } : { id: l.id, label: l.label, none: true, nCells: bc.N, ndHere: bc.ND, nMissing: bc.nMissing }); });
      // TASKS.csv #1559 — a layer whose best cutoff is thin (fewer than MIN_SIDE occurrence cells on a side) stays out of the posterior
      // when sound layers exist: its W- of -2.35 +/- 1.00 came from one cell. With no sound layer at all, every layer is used.
      const anySound = rowsW.some((r) => !r.none && !r.thin);
      rowsW.forEach((r) => { r.used = !r.none && (!r.thin || !anySound); if (r.used) chosen.push({ values: r.values, cutoff: r.cutoff, direction: r.direction, wPlus: r.wPlus, wMinus: r.wMinus }); });
      if (chosen.length) { const post = posterior(chosen, valid, N, ND, { countMask: drilled ? trainMask : null }); out.wofe = { rows: rowsW, N, ND, post, nD: D.size, anyMissing: rowsW.some((r) => r.nMissing > 0), drilled: !!drilled, symbol: training.symbol, holes: trainingHoles }; out.paPost = predictionArea(post.prob, D, valid); }
      else if (rowsW.length) out.wofeNone = { rows: rowsW, ND }; // #2098 — no card gave a weight: said, not silent
      out.pa = predictionArea(fuzzy, D, valid);
    } else if (drilled && D.size >= 3) out.fewMisses = { hits: D.size, drilled: drilled.n }; // #2446 — almost every drilled cell is a hit: nothing to weigh against
    else if (trainingPoints.length) out.fewPoints = D.size;
    // #2326 — the hole-based point cards' points (with their elevation, inside the level), for the target handed to Planned holes
    out.level = level;
    out.topShare = topScoreShare(fuzzy); // #2448 — said when over a third of the scored cells are at the top
    out.cardPts = layers.filter((l) => l.kind === "grade" || l.kind === "pxrf" || l.kind === "numeric").map((l) => {
      const reach = l.reach || DRILL_REACH_M;
      if (l.kind === "numeric") { const { rows, field } = numericRowsOf(l.ref); return { pts: layerFieldPoints(rows, field, traces, undefined, level), reach }; }
      return { pts: holeGradePoints(l.kind === "pxrf" ? pxrfAssays : cleanAssays, l.ref, assayUnits[l.ref] || "ppm", assayUnits, traces, undefined, level), reach };
    });
    setResult(out); setMsg(null);
  };
  const toMap = (which) => {
    const score = which === "posterior" ? result.wofe.post.prob : result.fuzzy;
    const img = scoreImage(score, grid.nx, grid.ny), c = document.createElement("canvas");
    c.width = img.width; c.height = img.height; c.getContext("2d").putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    const name = which === "posterior" ? tr("Plan-view weights-of-evidence posterior ({n} occurrence cells)", { n: result.wofe.nD }) /* #1558: cells, not points; plan view: #1458 */ : tr("Plan-view fuzzy overlay ({op}) of {n} evidence layers", { op: operator === "gamma" ? `gamma ${gamma}` : operator, n: layers.length });
    const valid = score.reduce((a, v) => a + (Number.isFinite(v) ? 1 : 0), 0);
    const floorZ = terrain ? null : rasterFloorZ(traces); // TASKS.csv #1204 — a sheet at the origin elevation cut through the holes and hid them from above
    addRaster({ name, bbox: [grid.x0 - grid.dx / 2, grid.yTop + grid.dy / 2 - grid.ny * grid.dy, grid.x0 - grid.dx / 2 + grid.nx * grid.dx, grid.yTop + grid.dy / 2], dataUrl: c.toDataURL("image/png"), drapeMode: terrain ? "terrain" : "flat", opacity: 0.75, ...(floorZ != null ? { elevation: floorZ } : {}),
      grid: { nx: grid.nx, ny: grid.ny, x0: grid.x0, yTop: grid.yTop, dx: grid.dx, dy: grid.dy, values: f32ToB64(score), valid, averagedBy: 1, sourceSize: [grid.nx, grid.ny] },
      params: { tool: which === "posterior" ? "weights of evidence (posterior probability)" : "fuzzy overlay", recipe, trainingPoints: trainingPoints.length, builtAt: new Date().toISOString() } }); // TASKS.csv #1003 — how it was made
    // #1563 — the drapes and block models over it in plan (the new raster is not in `rasters` yet)
    const box = [grid.x0 - grid.dx / 2, grid.yTop + grid.dy / 2 - grid.ny * grid.dy, grid.x0 - grid.dx / 2 + grid.nx * grid.dx, grid.yTop + grid.dy / 2];
    const cv = coveringLayers(box, rasters, voxelModels);
    const text = floorZ != null ? tr("Added \"{name}\" to the map, flat at elevation {z} m (below the deepest hole) because the project has no terrain. Change its elevation under Maps; its values export as GeoTIFF from the Raster module.", { name, z: floorZ }) : tr("Added \"{name}\" to the map (its values export as GeoTIFF from the Raster module).", { name });
    setMsg(text); setCover(cv.rasters.length + cv.models.length ? { ...cv, forMsg: text } : null);
  };
  const toTif = async (which) => { const epsg = await ensureExportCrs(project); if (!epsg) return; /* #1021 */ const score = which === "posterior" ? result.wofe.post.prob : result.fuzzy; saveGeoTIFF(`${which === "posterior" ? "wofe_posterior" : "fuzzy_overlay"}.tif`, gridToGeoTIFF({ ...grid, bands: [{ values: score }], epsg })); };

  return (
    <>
      <TaskPaneHeader title={tr("Evidence overlay")} helpId="evidence-overlay" icon={Layers} tone="model" onClose={onClose} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "var(--font-size-sm)" }}>
        {/* TASKS.csv #1458 (review #1352, Silvertip) — said plainly: the score ranks places in plan; a target 300-1,300 m deep gets its depth
            from the holes and models themselves, not from this map */}
        <div style={note}>{tr("Plan view: every evidence is one value per map cell. Drillhole grades, logged codes and block models are projected to the surface, so the score ranks places in plan; the depth to drill comes from the holes and models themselves.")}{drillZ && layers.some((l) => DRILL_KINDS.has(l.kind)) ? " " + tr("The drillhole evidence here comes from holes between {top} and {bottom} m RL.", { top: Math.round(drillZ[1]).toLocaleString(), bottom: Math.round(drillZ[0]).toLocaleString() }) : ""}</div>
        <div style={note}>{grid ? tr("Grid: {nx} × {ny} cells of {dx} × {dy} m{src}.", { nx: grid.nx, ny: grid.ny, dx: Math.round(grid.dx), dy: Math.round(grid.dy), src: grid.from === "terrain" ? tr(" (the terrain)") : gridArea === "samples" ? tr(" (the surface samples)") : gridArea === "drilling" ? tr(" (the drilling)") : gridArea === "model" ? tr(" (the block models)") : gridArea === "box" ? tr(" (the typed box)") : tr(" (the data's extent)") /* area: #1450 */ }) : tr("No grid yet: load terrain, a raster, a map layer or samples first.")}{grid && grid.from !== "terrain" && sampleCore.dropped > 0 ? tr(" {n} surface sample(s) far from the rest are outside it.", { n: sampleCore.dropped }) : ""}</div>
        {/* TASKS.csv #1450 — the area and the cell size the scores are computed on */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <label style={row}>{tr("Area")}<select value={gridArea} onChange={(e) => { setGridArea(e.target.value); setResult(null); }} style={sel} aria-label={tr("Grid area")}>
            <option value="all">{terrain ? tr("the terrain / every source") : tr("every source")}</option>
            {extents.samples && <option value="samples">{tr("the surface samples")}</option>}
            {extents.drilling && <option value="drilling">{tr("the drilling")}</option>}
            {extents.model && <option value="model">{tr("the block models' footprint")}</option>}{/* #1834 */}
            <option value="box">{tr("a box (typed)")}</option>
          </select></label>
          <label style={row} title={tr("Blank = automatic: the longest side / 500, coarsened if the grid would pass its cell limit. A soil grid at 25-50 m wants a cell of about half its spacing.")}>{tr("Cell (m)")}<input type="number" min="1" step="5" value={gridCell} placeholder={tr("auto")} onChange={(e) => { setGridCell(e.target.value); setResult(null); }} style={{ ...sel, width: 64 }} aria-label={tr("Grid cell size (m)")} /></label>
          <label style={row} title={tr("Blank = every depth. On a deposit drilled from underground, the hole-based cards otherwise project every depth onto one plan.")}>{tr("Level RL (m)")}<input type="number" step="10" value={levelText[0]} placeholder={tr("from")} onChange={(e) => setLevelText((t) => [e.target.value, t[1]])} style={{ ...sel, width: 64 }} aria-label={tr("Level from (m RL)")} />–<input type="number" step="10" value={levelText[1]} placeholder={tr("to")} onChange={(e) => setLevelText((t) => [t[0], e.target.value])} style={{ ...sel, width: 64 }} aria-label={tr("Level to (m RL)")} /></label>{/* #2326 */}
        </div>
        {gridArea === "box" && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[tr("West (E)"), tr("South (N)"), tr("East (E)"), tr("North (N)")].map((lab, i) => (
              <input key={i} type="number" step="any" value={gridBox[i]} placeholder={lab} aria-label={lab} title={lab} onChange={(e) => { const v = e.target.value; setGridBox((b) => b.map((x, j) => (j === i ? v : x))); setResult(null); }} style={{ ...sel, width: 92 }} />
            ))}
          </div>
        )}
        {grid && cellTyped && Math.round(grid.dx) > Math.round(cellTyped) && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("The {c} m cell would make more cells than the grid can hold over this area, so it was coarsened to {d} m. A smaller area keeps it.", { c: cellTyped, d: Math.round(grid.dx) })}</div>}
        <select value="" onChange={(e) => addLayer(e.target.value)} style={sel} aria-label={tr("Add evidence")} disabled={!grid || !sources.length}>
          <option value="">{tr("+ add evidence…")}</option>
          {sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {/* TASKS.csv #2010 — a multiband satellite picture becomes evidence through a band ratio, made in Maps */}
        {pictureRasters.length > 0 && <div style={note}>{tr("A multiband satellite scene (Sentinel-2, Landsat, ASTER) scores after a band ratio: Maps > Spectral index makes iron oxide, clay / hydroxyl or your own ratio (b4 / b2…) as a raster with values, listed here.")}</div>}
        {pictureRasters.length > 0 && <div style={note}>{tr("{n} raster(s) are pictures without values ({names}): a colour image has no numbers to score. Import the data grid (a single-band GeoTIFF, .grd or .gxf) to use it as evidence.", { n: pictureRasters.length, names: pictureRasters.slice(0, 3).map((r) => r.name).join(", ") + (pictureRasters.length > 3 ? ", …" : "") })}</div>}{/* #1567 */}
        {grid && !sources.length && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("Nothing in this project can be used as evidence yet. Evidence comes from a raster with values, a map layer, surface samples, a geophysics survey, a block model, assays or logged structures.")}</div>}
        {layers.map((l) => (
          <div key={l.id} style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text)" }} title={l.label}>{l.label}</span><button type="button" style={linkBtn} onClick={() => { setLayers((L) => L.filter((x) => x.id !== l.id)); setResult(null); }} aria-label={tr("Remove this evidence")}>×</button></div>
            {l.values?.length > 0 && (() => { const c = evidenceCoverage(l.values); return <div style={{ fontSize: "var(--font-size-xs)", color: c < LOW_COVERAGE ? "var(--color-warn-text)" : "var(--color-text-muted)" }}>{c < LOW_COVERAGE ? tr("Values on {p}% of the grid only: with fuzzy AND, the algebraic product or gamma every other cell scores nothing.", { p: (c * 100).toFixed(c < 0.01 ? 2 : 1) }) : tr("Values on {p}% of the grid.", { p: Math.round(c * 100) })}</div>; })()}{/* #2252 */}
            {l.kind === "distance" && (() => { const ml = mapLayers.find((x) => String(x.id) === String(l.ref)); const vals = l.field ? [...new Set((ml?.features || []).map((f) => String(f.attributes?.[l.field] ?? "")))].slice(0, 60) : []; return (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <select value={l.field} onChange={(e) => updateLayer(l.id, { field: e.target.value, value: "" }, false)} style={sel} aria-label={tr("Only features where")}><option value="">{tr("every feature")}</option>{(ml?.fields || []).map((f) => <option key={f} value={f}>{f}</option>)}</select>
                {l.field && <select value={l.value} onChange={(e) => updateLayer(l.id, { value: e.target.value }, true)} style={sel} aria-label={tr("equals")}><option value="">{tr("— value —")}</option>{vals.map((v) => <option key={v} value={v}>{v || "(blank)"}</option>)}</select>}
              </div>); })()}
            {(l.kind === "element" || l.kind === "index") && media.length > 1 && <label style={row}>{tr("Samples")}<select value={l.field === "medium" ? l.value : "\u0000all"} onChange={(e) => { const m = e.target.value === "\u0000all" ? null : e.target.value; updateLayer(l.id, m == null ? { field: "", value: "", reach: reachOf(l) } : { field: "medium", value: m, reach: reachOf(l, m) }, true); }} style={sel} aria-label={tr("Samples of one medium")}>{media.map((m) => <option key={m} value={m}>{m || tr("(no medium)")}</option>)}<option value={"\u0000all"}>{tr("all media together")}</option></select></label>}
            {l.kind === "voxel" && (() => { // TASKS.csv #1831 — the elevation band the column is read over (blank = the whole column)
              const zr = voxelZRange(voxelModels.find((x) => (x.id ?? x.name) === l.ref));
              const setZ = (k, txt) => { const v = txt === "" ? null : Number(txt); updateLayer(l.id, { [k]: Number.isFinite(v) ? v : null }, true); };
              return (<div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                <label style={row}>{tr("Elevation from (m)")}<input type="number" step="10" value={l.zMin ?? ""} placeholder={zr ? String(Math.round(zr[0])) : ""} onChange={(e) => setZ("zMin", e.target.value)} style={{ ...sel, width: 70 }} /></label>
                <label style={row}>{tr("to (m)")}<input type="number" step="10" value={l.zMax ?? ""} placeholder={zr ? String(Math.round(zr[1])) : ""} onChange={(e) => setZ("zMax", e.target.value)} style={{ ...sel, width: 70 }} /></label>
                {l.zMin == null && l.zMax == null && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)" }}>{zr ? tr("Whole column: every depth of the model ({z0}–{z1} m RL) counts, projected to the map. Set an elevation band to read one level.", { z0: Math.round(zr[0]).toLocaleString(), z1: Math.round(zr[1]).toLocaleString() }) /* #1458 */ : tr("Whole column: every depth of the model counts. Set an elevation band to read one level.")}</span>}
              </div>);
            })()}
            {(l.kind === "element" || l.kind === "index" || l.kind === "survey" || l.kind === "grade" || l.kind === "pxrf" || l.kind === "numeric") && <label style={row}>{tr("Reach (m)")}<input type="number" min="10" step="50" value={l.reach} onChange={(e) => updateLayer(l.id, { reach: Math.max(10, Number(e.target.value) || reachOf(l, l.field === "medium" ? l.value : null)) }, true)} style={{ ...sel, width: 70 }} /></label>}
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <select value={l.shape} onChange={(e) => updateLayer(l.id, { shape: e.target.value })} style={sel} aria-label={tr("Membership")}><option value="increasing">{tr("favourable when high")}</option><option value="decreasing">{tr("favourable when low")}</option></select>
              <label style={row}>{l.shape === "decreasing" ? "1" : "0"} ={" "}<input type="number" step="any" value={l.lowText} onChange={(e) => updateLayer(l.id, { lowText: e.target.value, low: e.target.value === "" ? NaN : Number(e.target.value), endsEdited: true /* #1565 */ })} style={{ ...sel, width: 76 }} aria-label={l.shape === "decreasing" ? tr("Membership 1 at") : tr("Membership 0 at")} /></label>
              <label style={row}>{l.shape === "decreasing" ? "0" : "1"} ={" "}<input type="number" step="any" value={l.highText} onChange={(e) => updateLayer(l.id, { highText: e.target.value, high: e.target.value === "" ? NaN : Number(e.target.value), endsEdited: true /* #1565 */ })} style={{ ...sel, width: 76 }} aria-label={l.shape === "decreasing" ? tr("Membership 0 at") : tr("Membership 1 at")} /></label>
              {l.kind !== "distance" && l.kind !== "pick" && l.low > 0 && l.high > 0 && <label style={{ ...row, cursor: "pointer" }} title={tr("The ramp runs on the logarithm of the values: even steps in grade ratio, as a lognormal grade is spread. Off, it runs on the values and is flat over most of a skewed layer.")}><input type="checkbox" checked={!!l.log} onChange={(e) => updateLayer(l.id, { log: e.target.checked })} />{tr("log ramp")}</label>}{/* #1555 */}
            </div>
            {l.endsFrom && !l.endsEdited && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.35 }}>{l.endsFrom.kind === "assays" && l.endsFrom.highFrom === "mapped" ? tr("Ends: the {a}th percentile of the {n} {sym} assays (length-weighted, QC left out) and the 90th percentile of the {m} values this card maps (each 25 m bin's highest along the holes), which is above the assays' {b}th. Set them from your own cut-offs.", { a: l.endsFrom.q[0], b: l.endsFrom.q[1], n: l.endsFrom.n.toLocaleString(), m: (l.endsFrom.m || 0).toLocaleString(), sym: l.ref }) /* #2448 */ : l.endsFrom.kind === "assays" ? tr("Ends: the {a}th and {b}th percentile of the {n} {sym} assays (length-weighted, QC left out). Set them from your own cut-offs.", { a: l.endsFrom.q[0], b: l.endsFrom.q[1], n: l.endsFrom.n.toLocaleString(), sym: l.ref }) : tr("Ends: the {a}th and {b}th percentile of this evidence over the grid, not of your deposit. Set them from your own cut-offs.", { a: l.endsFrom.q[0], b: l.endsFrom.q[1] })}</div>}{/* #2099 */}
          </div>
        ))}
        {layers.length > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <label style={row}>{tr("Combine")}<select value={operator} onChange={(e) => setOperator(e.target.value)} style={sel}>{FUZZY_OPERATORS.map((o) => <option key={o} value={o}>{tr({ and: "fuzzy AND (min)", or: "fuzzy OR (max)", product: "algebraic product", sum: "algebraic sum", gamma: "gamma" }[o])}</option>)}</select></label>
            {operator === "gamma" && <label style={row}>γ<input type="number" min="0" max="1" step="0.05" value={gamma} onChange={(e) => setGamma(Math.max(0, Math.min(1, Number(e.target.value))))} style={{ ...sel, width: 60 }} /></label>}
            {/* TASKS.csv #1555 — one membership of exactly 0 zeroes the product, and so AND, product and gamma, whatever the other evidence says */}
            <label style={{ ...row, cursor: "pointer" }} title={tr("Memberships run from 0.01 to 0.99 instead of 0 to 1, so an evidence at its lowest cannot veto a cell on its own under AND, product or gamma: the cell keeps a low score and its rank among the others. Off, a cell with any membership at 0 scores exactly 0.")}><input type="checkbox" checked={floor > 0} onChange={(e) => { setFloor(e.target.checked ? 0.01 : 0); setResult(null); }} />{tr("no single evidence vetoes a cell (0.01–0.99)")}</label>
          </div>
        )}
        <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ color: "var(--color-text-secondary)" }}>{tr("Known occurrences (optional, for weights of evidence)")}</div>
          <select value={training.source} onChange={(e) => setTraining((t) => ({ ...t, source: e.target.value }))} style={sel} aria-label={tr("Known occurrences")}>
            <option value="none">{tr("none")}</option>
            {pointLayers.length > 0 && <option value="layer">{tr("a point map layer")}</option>}
            {collars.length > 0 && labElements.length > 0 && <option value="collars">{tr("drillholes with a grade")}</option>}{/* #1723: lab grades */}
            {surfaceSamples.length > 0 && <option value="samples">{tr("surface samples above a value")}</option>}
          </select>
          {training.source === "layer" && <select value={training.layerId} onChange={(e) => setTraining((t) => ({ ...t, layerId: e.target.value }))} style={sel}><option value="">{tr("— choose —")}</option>{pointLayers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
          {(training.source === "collars" || training.source === "samples") && (
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <select value={training.symbol} onChange={(e) => setTraining((t) => ({ ...t, symbol: e.target.value }))} style={sel}>{(training.source === "collars" ? labElements : surfaceElements).map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol} ({e.unit})</option>)}</select>
              ≥ <input type="number" step="any" value={training.min} onChange={(e) => setTraining((t) => ({ ...t, min: e.target.value }))} style={{ ...sel, width: 80 }} aria-label={tr("At least")} />
            </div>
          )}
          {training.source !== "none" && <div style={note}>{tr("{n} occurrence points.", { n: trainingPoints.length })}{training.source === "collars" && pxrfAssays.length ? " " + tr("Lab assays only: the {n} pXRF readings are not occurrences.", { n: pxrfAssays.length.toLocaleString() }) : ""}{circular ? " " + tr("Circular: the same samples are evidence and occurrences, so the weights will flatter the evidence.") : ""}</div>}{/* pXRF: #1723 */}
        </div>
        <button type="button" style={{ ...pBtn, ...(grid && layers.length ? null : { opacity: 0.5, cursor: "default" }) }} onClick={compute} disabled={!grid || !layers.length}>{tr("Compute")}</button>
        {grid && !layers.length && sources.length > 0 && <div style={note}>{tr("Add at least one evidence from the list above, then Compute.")}</div>}
        {msg && <div style={note}>{msg}</div>}
        {msg && cover && cover.forMsg === msg && ( // #1563 — the score cannot be seen under these from here; one click hides them (the 3D View's eyes bring them back)
          <div style={{ ...note, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span>{tr("It lies under {list} in plan.", { list: [...cover.rasters, ...cover.models].map((x) => `\"${x.name}\"`).join(", ") })}</span>
            <button type="button" style={{ ...sel, cursor: "pointer" }} onClick={() => { cover.rasters.forEach((r) => updateRaster(r.id, { visible: false })); cover.models.forEach((m) => updateVoxelModel(m.id, { visible: false })); setCover(null); setMsg(tr("Hid {n} layer(s) over the score; show them again with their eyes in the 3D View.", { n: cover.rasters.length + cover.models.length })); }}>
              {tr("Hide those {n}", { n: cover.rasters.length + cover.models.length })}</button>
          </div>
        )}
        {result && (
          <>
            {result.blockers?.length > 0 && <div role="alert" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", lineHeight: 1.45 }}>{tr("{v} cells have every evidence, so the score is empty or nearly so. Fewest values: {list}. Combine with fuzzy OR or the algebraic sum (they skip a missing evidence), or remove those.", { v: result.nValid.toLocaleString(), list: result.blockers.map((b) => `${b.label} (${(b.coverage * 100).toFixed(b.coverage < 0.01 ? 2 : 1)}%)`).join(", ") })}</div>}{/* #2252 */}
            <div style={note}>{tr("Fuzzy score on {v} of {n} cells (the rest lack an evidence).", { v: result.nValid.toLocaleString(), n: result.n.toLocaleString() })}{result.fewMisses ? " " + tr("{h} of the {n} drilled cells hold a hole over the cut-off: weights of evidence need at least 3 without one to weigh against.", { h: result.fewMisses.hits, n: result.fewMisses.drilled }) : ""}{result.fewPoints != null ? " " + tr("Only {k} occurrence cells: weights of evidence need at least 3.", { k: result.fewPoints }) : ""}</div>
            {result.nValid > 0 && result.atMin / result.nValid > 0.5 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("{p}% of the scored cells sit at the lowest score ({v}): an evidence's membership is at its floor there and the operator keeps the floor. The top cells are only those no evidence vetoed, not the most favourable. Turn on the 0.01–0.99 floor, widen the 0 = points, or combine with OR / algebraic sum.", { p: Math.round((100 * result.atMin) / result.nValid), v: fmt(result.minScore) })}</div>}{/* #1555 */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button type="button" style={{ ...pBtn, opacity: result.nValid ? 1 : 0.5 }} disabled={!result.nValid} onClick={() => toMap("fuzzy")}>{tr("Fuzzy score → map")}</button>
              <button type="button" style={{ ...pBtn, display: "flex", alignItems: "center", gap: 4, opacity: result.nValid ? 1 : 0.5 }} disabled={!result.nValid} onClick={() => toTif("fuzzy")}><Download size={12} />GeoTIFF</button>{/* #2252 — never an empty score */}
            </div>
            {result.topShare && result.topShare.share > 1 / 3 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("{pct} % of the scored cells are at the top score ({top}): the 1 = point of a card sits under most of what it maps, so these cells cannot be told apart. Raise the 1 = point.", { pct: Math.round(result.topShare.share * 100), top: fmt(result.topShare.top, 3) })}</div>}{/* #2448 */}
            <TopPlaces score={result.fuzzy} grid={grid} onPlanTo={onPlanTo} note={note} pBtn={pBtn} cardPts={result.cardPts} level={result.level} /* #1456; cardPts / level: #2326 */ />
            {!result.wofe && result.wofeNone && ( /* TASKS.csv #2098 */
              <div style={{ ...note, color: "var(--color-warn-text)", marginTop: 4 }}>{tr("Weights of evidence: no card gives a weight with these {d} occurrence cells: {list}.", { d: result.wofeNone.ND, list: result.wofeNone.rows.map((r) => `${r.label} (${r.ndHere ?? 0} of them where it has a value)`).join("; ") })}</div>
            )}
            {result.wofe && (
              <>
                <div style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>{result.wofe.drilled /* #2446 */
                  ? tr("Weights of evidence over the {n} drilled cells (grid cells holding a {sym} sample, in {h} holes): {d} with a sample at or over the cut-off (in {hh} holes) against {m} without. Undrilled ground is not counted as barren; the posterior is the chance that a hole drilled in a cell would meet the cut-off.", { n: result.wofe.N.toLocaleString(), sym: result.wofe.symbol, d: result.wofe.ND.toLocaleString(), m: (result.wofe.N - result.wofe.ND).toLocaleString(), h: (result.wofe.holes?.any ?? 0).toLocaleString(), hh: (result.wofe.holes?.hit ?? 0).toLocaleString() }) /* #2618 */
                  : tr("Weights of evidence: {d} occurrence cells in {n} cells", { d: result.wofe.ND, n: result.wofe.N.toLocaleString() })}</div>
                {result.cover && (result.cover.droppedCells > 0 || result.cover.inGrid < result.cover.points) && <div style={{ ...note, marginTop: 2, color: result.cover.droppedShare > 0.25 ? "var(--color-warn-text)" : undefined }}>{tr("{p} occurrence points in {c} cells; {d} cell(s) lie outside the area where every evidence has a value and are not used ({pct} %).{v}", { p: result.cover.points.toLocaleString(), c: result.cover.cells.toLocaleString(), d: result.cover.droppedCells.toLocaleString(), pct: Math.round(result.cover.droppedShare * 100), v: result.cover.inGrid < result.cover.points ? " " + tr("{m} point(s) are outside the grid.", { m: (result.cover.points - result.cover.inGrid).toLocaleString() }) : "" })}</div>}{/* #1558 */}
                {result.wofe.anyMissing && <div style={{ ...note, marginTop: 2 }}>{tr("An evidence's weights come from the cells where it has a value; where it has none it adds nothing to the posterior (weight 0), so the score cannot reach past the drilled ground on drill evidence alone.")}</div>}{/* #1556 */}
                {result.wofe.ND < 10 && <div style={{ color: "var(--color-warn-text)", marginTop: 2 }}>{tr("Fewer than 10 occurrence cells: the weights, the posterior and the prediction-area figures are not interpretable — read them as a sketch.")}</div>}{/* #1452 */}
                {result.wofe.rows.map((r, i) => { // wrapped lines, not a table: the sidebar is narrow
                  // TASKS.csv #1566 (review #1497, Lawyers) — a negative contrast: the occurrences sit on the other side of the cutoff, so the
                  // card's 'favourable when high' (or low) is the wrong way round for the fuzzy score. It was printed bold like strong
                  // evidence. Its weights stay in the posterior (a negative W+ lowers the probability inside the pattern, as weights of
                  // evidence intends); the card's direction is what to fix, one click.
                  const against = !r.none && r.studC < 0, strongAgainst = against && r.studC <= -2;
                  return (
                  <div key={i} style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4 }}>
                    <div style={{ color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.label}>{r.label}</div>
                    <div style={{ color: against ? "var(--color-warn-text)" : "var(--color-text-secondary)", fontWeight: !r.none && r.studC >= 2 ? 600 : 400 }}>{r.none ? (r.ndHere === 0 ? tr("no weight: no occurrence lies where this evidence has a value (0 of {nd} occurrence cells in its {n} cells)", { nd: result.wofe?.ND ?? "", n: (r.nCells ?? 0).toLocaleString() }) : tr("no usable cutoff ({k} of the occurrence cells lie where this evidence has a value)", { k: r.ndHere })) /* #2098 */ : (r.corrected ? tr("every occurrence inside the pattern: 0.5 added to the zero count · ") : "") + tr("cutoff {c} · W+ {wp} ± {sp} · W− {wm} ± {sm} · C/s {s}", { c: fmt(r.cutoff), wp: fmt(r.wPlus), sp: fmt(r.sPlus), wm: fmt(r.wMinus), sm: fmt(r.sMinus), s: fmt(r.studC, 1) })}{!r.none && " · " + tr("{a} of {d} occurrence cells inside the pattern ({b} cells)", { a: r.nBD, d: r.nD, b: r.nB.toLocaleString() })}{/* !r.none: #2098 */}{r.thin ? " · " + tr("thin: fewer than {m} occurrence cells on one side, a weak basis for this weight", { m: MIN_SIDE }) + (r.used === false ? " · " + tr("left out of the posterior") : "") : ""}{/* #1559 */}{r.nMissing > 0 ? " · " + tr("on {n} cells with a value; {m} without count 0", { n: r.nCells.toLocaleString(), m: r.nMissing.toLocaleString() }) : ""}</div>
                    {against && (
                      <div style={{ color: "var(--color-warn-text)" }}>
                        {tr(r.direction === "decreasing" ? "Points the other way: the occurrences sit where this evidence is HIGH (C/s {s}), but the card scores it favourable when low, so the fuzzy score counts it against them." : "Points the other way: the occurrences sit where this evidence is LOW (C/s {s}), but the card scores it favourable when high, so the fuzzy score counts it against them.", { s: fmt(r.studC, 1) })}
                        {strongAgainst ? "" : " " + tr("Weak either way (|C/s| under 2).")}{" "}
                        <button type="button" style={linkBtn} onClick={() => { updateLayer(r.id, { shape: r.direction === "decreasing" ? "increasing" : "decreasing" }); setResult(null); }}>{tr(r.direction === "decreasing" ? "Make it favourable when high" : "Make it favourable when low")}</button>
                      </div>
                    )}
                  </div>
                  );
                })}
                <div style={{ ...note, color: result.wofe.post.ratio < 0.85 ? "var(--color-warn-text)" : undefined }}>{tr("Conditional independence check: the posterior predicts {e} occurrences for {d} known (ratio {r}).", { e: result.wofe.post.expected.toFixed(1), d: result.wofe.ND, r: result.wofe.post.ratio.toFixed(2) })}{result.wofe.post.ratio < 0.85 ? " " + tr("Under 0.85: the layers double-count each other; the posterior is too high.") : ""}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button type="button" style={pBtn} onClick={() => toMap("posterior")}>{tr("Posterior → map")}</button>
                  <button type="button" style={{ ...pBtn, display: "flex", alignItems: "center", gap: 4 }} onClick={() => toTif("posterior")}><Download size={12} />GeoTIFF</button>
                </div>
                <TopPlaces score={result.wofe.post.prob} grid={grid} onPlanTo={onPlanTo} note={note} pBtn={pBtn} posterior cardPts={result.cardPts} level={result.level} /* #1456; #2326 */ />
              </>
            )}
            {(result.pa || result.paPost) && <PAPlot fuzzy={result.pa} post={result.paPost} />}
            {drillOnly && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("All the evidence comes from the {n} drillholes, so the score exists only within {reach} m of their traces: it ranks drilled ground, not untested targets. A surface evidence (a survey, a raster, soil or rock samples, a map layer) is what can score beyond the holes.", { n: traces.size, reach: Math.round(drillPad) })}</div>}{/* #1727 */}
            <div style={note}>{tr("A fuzzy overlay only says where the chosen evidence agrees under your memberships. Weights are statistics of a few points over many cells: with few points they are unstable (± shown), the layers are assumed independent given the occurrences, and when the occurrences are the drilled targets the result is circular. Treat the score as a ranking of where to look, not a probability of a deposit.")}</div>
          </>
        )}
      </div>
    </>
  );
}

// prediction rate and occupied area against the score threshold rank; the P-A point where they cross
// TASKS.csv #1456 (review #1352, Silvertip) — the overlay's best places as a short list, each one a click from a planned hole: the
// target's easting / northing go to Planned holes; a plan-view score has no depth, so the target elevation is left for the geologist
function TopPlaces({ score, grid, onPlanTo, note, pBtn, posterior = false, cardPts = null, level = null /* #2326 */ }) {
  const top = useMemo(() => topCells(score, grid, { n: 5 }), [score, grid]);
  const zs = useMemo(() => top.map((c) => targetElevation(c, cardPts, grid, level)), [top, cardPts, grid, level]); // #2326
  if (!top.length) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ color: "var(--color-text-secondary)" }}>{posterior ? tr("Highest posterior (at least {d} m apart):", { d: Math.round(5 * Math.max(grid.dx, grid.dy)) }) : tr("Highest fuzzy scores (at least {d} m apart):", { d: Math.round(5 * Math.max(grid.dx, grid.dy)) })}</div>
      {levelSet(level) && <div style={note}>{tr("Read at RL {a} to {b} m (the Level).", { a: level.zMin != null ? Math.round(level.zMin).toLocaleString() : "…", b: level.zMax != null ? Math.round(level.zMax).toLocaleString() : "…" })}</div>}{/* #2326 */}
      {top.some((c) => c.tied) && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("Some of these score the same (a plateau of equal cells): those are ranked by the mean score of the cells around them, so treat their order as a tie.")}</div>}{/* #2255 */}
      {top.map((c, k) => (
        <div key={k} style={{ ...note, display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary)" }}>
          <span style={{ flex: 1, minWidth: 0 }}>{tr("{k}. {score} at E {x}, N {y}", { k: k + 1, score: fmt(c.score, 3), x: Math.round(c.x).toLocaleString(), y: Math.round(c.y).toLocaleString() })}{c.tied ? " " + tr("(tied)") : ""}</span>
          {onPlanTo && <button type="button" style={{ ...pBtn, padding: "2px 7px", flexShrink: 0 }} onClick={() => onPlanTo({ x: c.x, y: c.y, z: zs[k]?.z ?? null })} title={zs[k]?.from === "point" ? tr("Opens Planned holes with this easting and northing as the target, at RL {z} m: the highest value of the first grade / numeric card within {r} m of this cell (and the Level). Check it there.", { z: Math.round(zs[k].z).toLocaleString(), r: Math.round(zs[k].within) }) : zs[k]?.from === "level" ? tr("Opens Planned holes with this easting and northing as the target, at RL {z} m: the middle of the Level (no grade point in this cell). Check it there.", { z: Math.round(zs[k].z).toLocaleString() }) : tr("Opens Planned holes with this easting and northing as the target; type the target elevation there (the score is in plan, it has no depth).")}>{tr("Plan a hole to here")}</button>}
        </div>
      ))}
    </div>
  );
}

function PAPlot({ fuzzy, post }) {
  const w = 280, h = 150, pl = 28, pr = 8, pt = 8, pb = 20;
  const X = (i, n) => pl + (i / (n - 1)) * (w - pl - pr), Y = (v) => h - pb - v * (h - pb - pt);
  const line = (c, key, colour, dash) => c && <polyline points={c.curve.map((p, i) => `${X(i, c.curve.length)},${Y(p[key])}`).join(" ")} style={{ fill: "none", stroke: colour, strokeWidth: 1.5, strokeDasharray: dash }} />;
  const pt1 = fuzzy?.point, pt2 = post?.point, st1 = fuzzy?.step, st2 = post?.step; // #1555: a step where no threshold reaches the crossing
  const stepText = (s) => tr("no threshold reaches the crossing: the score jumps from {r1}% in {a1}% of the area to {r2}% in {a2}% (Nd {nd} at the nearer one)", { r1: (100 * s.below.rate).toFixed(0), a1: (100 * s.below.area).toFixed(0), r2: (100 * s.above.rate).toFixed(0), a2: (100 * s.above.area).toFixed(0), nd: Number.isFinite(s.nd) ? s.nd.toFixed(1) : "—" });
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("Prediction-area plot")} style={{ display: "block" }}>
        <line x1={pl} x2={w - pr} y1={h - pb} y2={h - pb} style={{ stroke: "var(--color-border)" }} /><line x1={pl} x2={pl} y1={pt} y2={h - pb} style={{ stroke: "var(--color-border)" }} />
        {[0, 0.5, 1].map((v) => <text key={v} x={pl - 3} y={Y(v) + 3} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{v * 100}%</text>)}
        {line(fuzzy, "rate", "#D55E00")}{line(fuzzy, "area", "#D55E00", "3 3")}{line(post, "rate", "#0072B2")}{line(post, "area", "#0072B2", "3 3")}
        <text x={w - pr} y={h - 5} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{tr("score threshold, low → high")}</text>
      </svg>
      <div style={note}>
        {tr("Solid: share of occurrences predicted; dashed: share of the area. Where they cross:")}{" "}
        {pt1 && <span style={{ color: "#D55E00" }}>{tr("fuzzy {r}% in {a}% of the area (Nd {nd})", { r: (100 * pt1.rate).toFixed(0), a: (100 * pt1.area).toFixed(0), nd: pt1.nd.toFixed(1) })}</span>}
        {!pt1 && st1 && <span style={{ color: "#D55E00" }}>{tr("fuzzy")}: {stepText(st1)}</span>}{(pt1 || st1) && (pt2 || st2) ? " · " : ""}
        {pt2 && <span style={{ color: "#0072B2" }}>{tr("posterior {r}% in {a}% of the area (Nd {nd})", { r: (100 * pt2.rate).toFixed(0), a: (100 * pt2.area).toFixed(0), nd: pt2.nd.toFixed(1) })}</span>}
        {!pt2 && st2 && <span style={{ color: "#0072B2" }}>{tr("posterior")}: {stepText(st2)}</span>}
        {" "}{tr("(Yousefi & Carranza 2015; Nd = 1 is no better than chance)")}
      </div>
    </div>
  );
}

// TASKS.csv #997 — the sidebar's shared controls (sidebarStyles.js, #704), not a seventh button and select shape; the
// buttons sit in rows here, so not full width
const sel = { ...smallSel, fontFamily: "inherit", maxWidth: "100%" };
const row = { display: "flex", alignItems: "center", gap: 4, color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const linkBtn = { background: "none", border: "none", padding: "0 2px", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const pBtn = { ...sidebarBtn, width: "auto", marginBottom: 0, fontFamily: "inherit" };
