import React, { useRef, useState } from "react";
import Papa from "papaparse";
import { Radio, Upload, Trash2, ArrowRight, Eye, EyeOff, Loader2, Mountain, Triangle, Box, MapPin, Waypoints, Plus, Palette, Download, Flag } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { getCol, classifyBreaks, rampColorsHex, PALETTES, paletteColorsHex } from "../lib/layers.js";
import { parseDEMFiles, buildRasterImport, terrainToGeoTIFFBase64 } from "../lib/raster.js";
import { boundaryAreaHectares } from "../lib/geoprocessing.js";
import { saveFile } from "../lib/desktop.js";
import InfoButton from "../components/InfoButton.jsx";
import { fetchSRTMTerrain } from "../lib/srtmFetch.js";
import { toLonLat, reprojectXY } from "../lib/reproject.js";
import { parseOMF, omfVolumeToCells } from "../lib/omf.js";
import { parseUBCMesh, parseUBCModel, parseUBCModelStream, ubcMeshToCells, parseBlockModelCSV, cellValueRange, MAX_CELLS, planCoarsenFactors, coarsenUBCModel } from "../lib/voxel.js";
import { parsePLYBoundary, parseXYZ } from "../lib/geosoft.js";
import SpatialAnalysis from "../components/SpatialAnalysis.jsx";
import BasemapView from "../components/BasemapView.jsx";
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";

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
function normGeophysRow(r) {
  const x = Number(getCol(r, ["x", "easting", "east"]));
  const y = Number(getCol(r, ["y", "northing", "north"]));
  const z = Number(getCol(r, ["z", "elevation", "elev"]));
  const value = Number(getCol(r, ["value", "val", "reading", "mag", "response"]));
  const label = getCol(r, ["label", "channel", "field", "survey"]);
  return { x, y, z, value, label: label !== undefined ? String(label) : undefined };
}

export default function GeophysicsModule() {
  const {
    layers, mergeLayer, replaceLayer, goToModule, collars, rasters, addRaster, project,
    terrain, addTerrain, updateTerrain, removeTerrain,
    geophysPtsStops, setGeophysPtsStops, geophysPtsColorMode, setGeophysPtsColorMode,
    geophysPtsMin, setGeophysPtsMin, geophysPtsMax, setGeophysPtsMax,
    voxelModels, addVoxelModel, updateVoxelModel, removeVoxelModel,
    voxelCellBudget, setVoxelCellBudget,
    boundaries, addBoundary, updateBoundary, removeBoundary,
    omfObjects, addOmfObject, updateOmfObject, removeOmfObject,
  } = useStore();
  // User question after the MAX_CELLS coarsening budget was lowered (perf investigation done in this
  // sandbox, which has no real GPU — see voxel.js's MAX_CELLS comment): "do you think we can increase
  // the 100,000 3d budget? Is it gonna make GeoStrix crash?" Rather than hand-picking a new number for
  // everyone based on this sandbox's own software-rendered measurements (which may not reflect Matt's
  // actual hardware at all), this is now an adjustable per-session setting — see the "3D view cell
  // budget" control near the UBC/OMF import buttons below — defaulting to voxel.js's own MAX_CELLS.
  const effectiveMaxCells = voxelCellBudget || MAX_CELLS;
  const [error, setError] = useState(null);
  const [rasterError, setRasterError] = useState(null);
  const [rasterBusy, setRasterBusy] = useState(false);
  const [terrainError, setTerrainError] = useState(null);
  const [terrainBusy, setTerrainBusy] = useState(false);
  const [srtmProgress, setSrtmProgress] = useState(null); // { done, total } | null
  const [srtmPickerOpen, setSrtmPickerOpen] = useState(false);
  const [srtmSeedBbox, setSrtmSeedBbox] = useState(null); // [lonMin, latMin, lonMax, latMax] | null
  const [srtmSeedLonLat, setSrtmSeedLonLat] = useState(null); // { lon, lat } | null — TASKS.csv #200 "Locate" button
  const [srtmAreaOptions, setSrtmAreaOptions] = useState(null); // [{id, label, bboxLonLat}] | null — TASKS.csv #200
  const [voxelError, setVoxelError] = useState(null);
  const [voxelBusy, setVoxelBusy] = useState(false);
  const [voxelProgress, setVoxelProgress] = useState(null);
  const [boundaryError, setBoundaryError] = useState(null);
  const [omfError, setOmfError] = useState(null);
  const [omfBusy, setOmfBusy] = useState(false);
  const omfInput = useRef(null);
  const [xyzError, setXyzError] = useState(null);
  const [xyzPending, setXyzPending] = useState(null); // { fileName, columns, rows, xCol, yCol, zCol, valueCol, labelCol } | null
  const [dragOver, setDragOver] = useState(false);
  // TASKS.csv #120 — optional source EPSG for x/y/z point-cloud imports below (plain CSV + .xyz),
  // same "reproject at import" approach used for collars (ImportMappingModal) and DEM rasters
  // (parseDEMFiles). Shared by both importers since a geologist bringing in mixed-CRS geophysics
  // files one after another would otherwise need to re-type the code for every file.
  const [geophysSourceEpsg, setGeophysSourceEpsg] = useState("");
  const [spatialOpen, setSpatialOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();
  const fileInput = useRef(null);
  const terrainInput = useRef(null);
  const ubcInput = useRef(null);
  const blockModelInput = useRef(null);
  const boundaryInput = useRef(null);
  const claimInput = useRef(null);
  const xyzInput = useRef(null);
  const rows = layers.geophys_pts || [];

  const importFile = (file) => {
    if (!file) return;
    setError(null);
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (res) => {
        const parsed = res.data.map(normGeophysRow);
        const bad = parsed.filter((r) => !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.z) || !Number.isFinite(r.value));
        let good = parsed.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z) && Number.isFinite(r.value)).map((r) => ({ ...r, _src: file.name }));
        if (!good.length) {
          setError(`No usable rows found — looked for x/y/z (or easting/northing/elevation) and a value (or reading/mag/response) column. Got headers: ${res.meta.fields?.join(", ") || "(none)"}.`);
          return;
        }
        let reprojectNote = "";
        if (geophysSourceEpsg && project?.epsg && Number(geophysSourceEpsg) !== Number(project.epsg)) {
          let failed = 0;
          good = good.map((r) => {
            const p = reprojectXY(r.x, r.y, geophysSourceEpsg, project.epsg);
            if (!p) { failed++; return r; }
            return { ...r, x: p.x, y: p.y };
          });
          reprojectNote = failed
            ? ` Couldn't resolve a proj4 definition for EPSG:${geophysSourceEpsg} or EPSG:${project.epsg} — no reprojection happened.`
            : ` Reprojected from EPSG:${geophysSourceEpsg} to the project's EPSG:${project.epsg}.`;
        }
        mergeLayer("geophys_pts", good);
        if (bad.length) setError(`Imported ${good.length} point(s); skipped ${bad.length} row(s) missing x/y/z or a value.${reprojectNote}`);
        else if (reprojectNote) setError(`Imported ${good.length} point(s).${reprojectNote}`);
      },
      error: (err) => setError(`Could not parse ${file.name}: ${err.message}`),
    });
  };

  // Default drape elevation: average collar elevation if holes are loaded (drapes usually make most
  // sense roughly at surface/collar level), otherwise 0 — either way it's just a starting point, the
  // per-raster elevation slider below moves it.
  const defaultElevation = collars.length ? collars.reduce((s, c) => s + c.z, 0) / collars.length : 0;

  // TASKS.csv — raster import UI itself moved to its own Raster module (user request); this stays
  // here ONLY so a .tif/.gxf dropped directly on the Geophysics tab (see onDrop below) still imports
  // exactly like before instead of forcing a tab-switch mid-drag. Uses the same buildRasterImport()
  // helper (raster.js) the Raster module's own import button calls — one shared parse/message path.
  const importRaster = async (file) => {
    if (!file) return;
    setRasterError(null);
    setRasterBusy(true);
    try {
      const { raster, msg } = await buildRasterImport(file, { epsg: project?.epsg, defaultElevation });
      addRaster(raster);
      setRasterError({ info: true, text: `${msg} (Tip: raster imports now have their own "Raster" tab — this drop still works here too.)` });
    } catch (err) {
      setRasterError({ info: false, text: err.message });
    } finally {
      setRasterBusy(false);
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
      const parsed = await parseDEMFiles(files, project?.epsg);
      const [xmin, ymin, xmax, ymax] = parsed.bbox;
      if (terrain && !window.confirm(`Replace the current terrain ("${terrain.name}") with "${parsed.name}"? Only one terrain surface is supported at a time.`)) {
        setTerrainBusy(false);
        return;
      }
      addTerrain({ name: parsed.name, bbox: parsed.bbox, gridW: parsed.gridW, gridH: parsed.gridH, elevations: parsed.elevations });
      let msg = `Imported "${parsed.name}" as a ${parsed.gridW}×${parsed.gridH} terrain mesh (source ${parsed.srcWidth}×${parsed.srcHeight}px, ${(xmax - xmin).toFixed(0)}×${(ymax - ymin).toFixed(0)} world units)${parsed.tileCount > 1 ? ` from ${parsed.tileCount} merged tiles` : ""}.`;
      if (parsed.reprojectedTo) {
        msg += ` Reprojected from its native EPSG:${parsed.epsgTag} to the project's EPSG:${parsed.reprojectedTo} on import.`;
      } else if (parsed.reprojectNote) {
        msg += ` Note: ${parsed.reprojectNote}`;
      } else if (parsed.epsgTag && project?.epsg && Number(parsed.epsgTag) !== Number(project.epsg)) {
        msg += ` Note: this file's own CRS tag (EPSG:${parsed.epsgTag}) doesn't match the project's EPSG:${project.epsg} — no reprojection happens on import.`;
      }
      setTerrainError({ info: true, text: msg });
    } catch (err) {
      setTerrainError({ info: false, text: err.message });
    } finally {
      setTerrainBusy(false);
    }
  };

  // TASKS.csv #203 — "We need options to export the generated SRTM, at least to geotiff." The merged/
  // processed terrain (whatever was actually used — imported DEM tiles, or a fetched SRTM area) had no
  // way back out for another tool or for archiving. See raster.js's terrainToGeoTIFFBase64 for the
  // actual writer (geotiff package's own writeArrayBuffer, not hand-rolled).
  const exportTerrainGeoTIFF = () => {
    if (!terrain) return;
    try {
      const base64 = terrainToGeoTIFFBase64(terrain, project?.epsg);
      saveFile({ suggestedName: `${terrain.name.replace(/\.(tif|tiff)$/i, "")}.tif`, filters: [{ name: "GeoTIFF", extensions: ["tif"] }], content: base64, encoding: "base64" });
    } catch (err) {
      setTerrainError({ info: false, text: `Couldn't export terrain: ${err.message}` });
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
  // immediately with no way to see or adjust it first. Now "Fetch SRTM for this area" opens
  // BasemapView in "draw" mode, pre-seeded with this same collar-derived bbox (still the sensible
  // default — most of the time the drillholes ARE the area of interest) as an editable rectangle: the
  // user can accept it as-is with one click, or pan/redraw to widen or shift it before confirming.
  const defaultSrtmBboxLonLat = async () => {
    if (!collars.length || !project?.epsg) return null;
    const xs = collars.map((c) => c.x), ys = collars.map((c) => c.y);
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    const marginX = Math.max((xmax - xmin) * 0.25, 200), marginY = Math.max((ymax - ymin) * 0.25, 200);
    const corners = [
      [xmin - marginX, ymin - marginY], [xmax + marginX, ymin - marginY],
      [xmax + marginX, ymax + marginY], [xmin - marginX, ymax + marginY],
    ];
    const lonLats = await Promise.all(corners.map(([x, y]) => toLonLat(x, y, project.epsg)));
    if (lonLats.some((ll) => !ll)) return null;
    const lons = lonLats.map((ll) => ll.lon), lats = lonLats.map((ll) => ll.lat);
    return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  };

  // TASKS.csv #200 — "the option to select a polygon or a raster to use as boundary": reprojects
  // each already-imported boundary/raster's own extent (project EPSG) to lon/lat so the SRTM picker
  // can offer it as a ready-made fetch area, same idea as the collar-derived seed bbox above but for
  // layers instead of drillholes. Boundaries store polylines, not a bbox, so it's computed here from
  // every vertex across every loop; rasters already carry their own bbox.
  const buildSrtmAreaOptions = async () => {
    if (!project?.epsg) return [];
    const jobs = [];
    for (const b of boundaries) {
      const xs = [], ys = [];
      for (const loop of b.polylines || []) for (const p of loop) { xs.push(p.x); ys.push(p.y); }
      if (!xs.length) continue;
      jobs.push({ id: `boundary_${b.id}`, label: `Boundary: ${b.name}`, xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) });
    }
    for (const r of rasters) {
      if (!r.bbox) continue;
      const [xmin, ymin, xmax, ymax] = r.bbox;
      jobs.push({ id: `raster_${r.id}`, label: `Raster: ${r.name}`, xmin, xmax, ymin, ymax });
    }
    const options = await Promise.all(jobs.map(async (j) => {
      const corners = [[j.xmin, j.ymin], [j.xmax, j.ymin], [j.xmax, j.ymax], [j.xmin, j.ymax]];
      const lonLats = await Promise.all(corners.map(([x, y]) => toLonLat(x, y, project.epsg)));
      if (lonLats.some((ll) => !ll)) return null;
      const lons = lonLats.map((ll) => ll.lon), lats = lonLats.map((ll) => ll.lat);
      return { id: j.id, label: j.label, bboxLonLat: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] };
    }));
    return options.filter(Boolean);
  };

  const openSrtmPicker = async () => {
    if (!project?.epsg) {
      setTerrainError({ info: false, text: "Project EPSG isn't set — can't reproject fetched elevation into project coordinates." });
      return;
    }
    setTerrainError(null);
    const seed = await defaultSrtmBboxLonLat();
    if (collars.length && !seed) {
      setTerrainError({ info: false, text: `Couldn't convert the project's EPSG:${project.epsg} to lon/lat (unrecognized code) — automatic SRTM fetch needs that conversion. Use manual GeoTIFF import instead.` });
      return;
    }
    setSrtmSeedBbox(seed);
    setSrtmSeedLonLat(seed ? { lon: (seed[0] + seed[2]) / 2, lat: (seed[1] + seed[3]) / 2 } : null);
    setSrtmAreaOptions(await buildSrtmAreaOptions());
    setSrtmPickerOpen(true);
  };

  const runSrtmFetch = async (bboxLonLat) => {
    const [lonMin, latMin, lonMax, latMax] = bboxLonLat;
    if (terrain && !window.confirm(`Replace the current terrain ("${terrain.name}") with freshly-fetched SRTM for this area? Only one terrain surface is supported at a time.`)) {
      return;
    }
    setSrtmPickerOpen(false);
    setTerrainBusy(true);
    setSrtmProgress({ done: 0, total: 1 });
    try {
      const parsed = await fetchSRTMTerrain({
        lonMin, latMin, lonMax, latMax, targetEpsg: project.epsg,
        onProgress: (done, total) => setSrtmProgress({ done, total }),
      });
      addTerrain({ name: parsed.name, bbox: parsed.bbox, gridW: parsed.gridW, gridH: parsed.gridH, elevations: parsed.elevations });
      const [txmin, tymin, txmax, tymax] = parsed.bbox;
      let msg = `Fetched and imported "${parsed.name}" as a ${parsed.gridW}×${parsed.gridH} terrain mesh covering ${(txmax - txmin).toFixed(0)}×${(tymax - tymin).toFixed(0)} world units for the area you drew.`;
      if (parsed.reprojectedTo) msg += ` Reprojected from WGS84 to the project's EPSG:${parsed.reprojectedTo}.`;
      else if (parsed.reprojectNote) msg += ` Note: ${parsed.reprojectNote}`;
      if (parsed.failedTiles) msg += ` (${parsed.failedTiles} tile(s) failed to download and were filled with the mean elevation of the rest — check your connection if this area looks patchy.)`;
      setTerrainError({ info: true, text: msg });
    } catch (err) {
      setTerrainError({ info: false, text: err.message });
    } finally {
      setTerrainBusy(false);
      setSrtmProgress(null);
    }
  };

  // Geosoft .ply boundary import (survey of a real Oasis montaj sample dataset — see TASKS.csv note
  // and src/lib/geosoft.js's parsePLYBoundary comment for the reverse-engineered format). Accepts
  // multiple files at once — real properties often ship several boundary files together (survey area,
  // claim block, blind-grid extent, etc.) and there's no reason to force one-at-a-time like terrain's
  // single-surface limit; each file becomes its own boundary entry.
  const importBoundaries = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    setBoundaryError(null);
    let imported = 0;
    const failed = [];
    for (const file of files) {
      try {
        const text = await file.text();
        const { polylines } = parsePLYBoundary(text);
        addBoundary({ name: file.name, polylines, elevation: defaultElevation });
        imported++;
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`);
      }
    }
    let msg = imported ? `Imported ${imported} boundary file(s) (${boundaries.length + imported} total).` : "";
    if (failed.length) msg += `${msg ? " " : ""}Failed: ${failed.join("; ")}`;
    if (msg) setBoundaryError({ info: !!imported && !failed.length, text: msg });
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
  const claimStatusColor = (status) => status === "expired" ? "#d9534f" : status === "pending" ? "#e2a63c" : "#3ca65e";
  const importClaims = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    setBoundaryError(null);
    let imported = 0;
    const failed = [];
    for (const file of files) {
      try {
        const text = await file.text();
        const { polylines } = parsePLYBoundary(text);
        addBoundary({ name: file.name.replace(/\.ply$/i, ""), polylines, elevation: defaultElevation, kind: "claim", status: "active", tenureNumber: "", expiryDate: "", color: claimStatusColor("active") });
        imported++;
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`);
      }
    }
    let msg = imported ? `Imported ${imported} claim boundary file(s) (${claims.length + imported} total).` : "";
    if (failed.length) msg += `${msg ? " " : ""}Failed: ${failed.join("; ")}`;
    if (msg) setBoundaryError({ info: !!imported && !failed.length, text: msg });
  };

  // TASKS.csv — Open Mining Format (OMF) import. User request: "let's build a tool to import OMF
  // files. I can export that from geosoft software" — see src/lib/omf.js's header comment for the
  // format details. A single .omf project can mix point/line/surface/volume elements together, so this
  // is one button that routes each parsed element to wherever it belongs: points/lines/triangulated
  // surfaces become generic omfObjects (rendered by ViewerModule, visibility/color list below, same
  // pattern as boundaries above); volume elements (tensor-grid block models) convert straight into the
  // existing voxel cell shape and go through addVoxelModel, reusing that renderer rather than a new one.
  const importOmf = async (file) => {
    if (!file) return;
    setOmfError(null);
    setOmfBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const project = await parseOMF(buf);
      let pointsCount = 0, linesCount = 0, surfacesCount = 0, volumesCount = 0;
      const skipped = [];
      const coarsenNotes = [];
      for (const el of project.elements) {
        if (el.kind === "skipped") { skipped.push(`${el.name} (${el.reason})`); continue; }
        if (el.kind === "points" || el.kind === "lines" || el.kind === "surface") {
          const hex = el.color ? `#${el.color.slice(0, 3).map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}` : undefined;
          addOmfObject({
            name: el.name, description: el.description, kind: el.kind,
            color: hex,
            origin: el.origin, vertices: el.vertices, segments: el.segments, triangles: el.triangles,
            attributes: el.attributes,
          });
          if (el.kind === "points") pointsCount++; else if (el.kind === "lines") linesCount++; else surfacesCount++;
        } else if (el.kind === "volume") {
          // #159 follow-up (real Geosoft export, "resistivity.omf": 126x246x102 = 3,161,592 cells —
          // over 12x MAX_CELLS): omfVolumeToCells now coarsens internally, same block-averaging
          // approach as the UBC importer's #158 fix, so this can never hang/crash the 3D view on a
          // large real-world block model the way it did before this fix.
          const { cells, attrName, availableAttrs, coarsenNote, colormap } = omfVolumeToCells(el, null, effectiveMaxCells);
          if (!cells.length) {
            skipped.push(`${el.name} (volume has no numeric cell attribute to render${availableAttrs?.length ? ` — found: ${availableAttrs.join(", ")}, none usable` : ""})`);
            continue;
          }
          const { min, max } = cellValueRange(cells);
          // User request: "Can we also import the colour legend" — turn the OMF file's own
          // ScalarColormap gradient (see omf.js's convertColormap) into this app's {value,color} stops,
          // spread evenly across the colormap's own limits (falling back to this cell set's actual
          // min/max if the file didn't record limits). Continuous mode matches how OMF itself renders
          // a gradient legend. If the file had no embedded colormap, leave stops unset — the model
          // keeps using the original 2-color magColor gradient, unchanged from before this feature.
          let colorInit = {};
          if (colormap?.gradient?.length) {
            const g = colormap.gradient;
            const [lo, hi] = Array.isArray(colormap.limits) && colormap.limits.length === 2 ? colormap.limits : [min, max];
            const stops = g.map((color, i) => ({ value: lo + (g.length > 1 ? (i / (g.length - 1)) * (hi - lo) : 0), color }));
            colorInit = { colorMode: "continuous", stops };
          }
          addVoxelModel({ name: `${el.name} (${attrName})`, source: "omf", cells, min, max, ...colorInit });
          volumesCount++;
          if (coarsenNote) coarsenNotes.push(`${el.name}: ${coarsenNote}`);
        }
      }
      const parts = [];
      if (pointsCount) parts.push(`${pointsCount} point set(s)`);
      if (linesCount) parts.push(`${linesCount} line set(s)`);
      if (surfacesCount) parts.push(`${surfacesCount} surface(s)`);
      if (volumesCount) parts.push(`${volumesCount} block model(s)`);
      let msg = parts.length ? `Imported "${file.name}" — ${parts.join(", ")}.` : `"${file.name}" parsed but nothing usable was found.`;
      if (coarsenNotes.length) msg += ` ${coarsenNotes.join(" ")}`;
      if (skipped.length) msg += ` Skipped: ${skipped.join("; ")}.`;
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
  const importXYZFile = async (file) => {
    if (!file) return;
    setXyzError(null);
    try {
      const text = await file.text();
      const { columns, rows: parsedRows } = parseXYZ(text);
      setXyzPending({
        fileName: file.name,
        columns,
        rows: parsedRows,
        xCol: guessColumn(columns, XY_NAME_HINTS.x),
        yCol: guessColumn(columns, XY_NAME_HINTS.y),
        zCol: "",
        valueCol: "",
      });
    } catch (err) {
      setXyzError({ info: false, text: `Could not parse ${file.name}: ${err.message}` });
    }
  };
  const confirmImportXYZ = () => {
    if (!xyzPending) return;
    const { fileName, rows: parsedRows, xCol, yCol, zCol, valueCol } = xyzPending;
    if (!xCol || !yCol || !valueCol) {
      setXyzError({ info: false, text: "Pick an X, Y, and Value column before importing." });
      return;
    }
    let mapped = parsedRows
      .map((r) => ({
        x: r[xCol], y: r[yCol], z: zCol ? r[zCol] : defaultElevation, value: r[valueCol],
        label: r._line !== null && r._line !== undefined ? `Line ${r._line}` : undefined,
        _src: fileName,
      }))
      .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z) && Number.isFinite(r.value));
    if (!mapped.length) {
      setXyzError({ info: false, text: `None of the ${parsedRows.length} row(s) had usable values in the chosen columns (likely all "*"/no-data for this combination) — try different columns.` });
      return;
    }
    let reprojectNote = "";
    if (geophysSourceEpsg && project?.epsg && Number(geophysSourceEpsg) !== Number(project.epsg)) {
      let failed = 0;
      mapped = mapped.map((r) => {
        const p = reprojectXY(r.x, r.y, geophysSourceEpsg, project.epsg);
        if (!p) { failed++; return r; }
        return { ...r, x: p.x, y: p.y };
      });
      reprojectNote = failed
        ? ` Couldn't resolve a proj4 definition for EPSG:${geophysSourceEpsg} or EPSG:${project.epsg} — no reprojection happened.`
        : ` Reprojected from EPSG:${geophysSourceEpsg} to the project's EPSG:${project.epsg}.`;
    }
    mergeLayer("geophys_pts", mapped);
    const skipped = parsedRows.length - mapped.length;
    setXyzError({ info: true, text: `Imported ${mapped.length} point(s) from "${fileName}"${skipped ? ` (skipped ${skipped} row(s) with no-data "*" in the chosen columns)` : ""}.${reprojectNote}` });
    setXyzPending(null);
  };

  // TASKS.csv #28 — UBC-GIF tensor mesh (.msh) + model (.mod/.con/.den) import. Both files are picked
  // in one multi-file dialog and matched by extension (.msh is the mesh, whichever other file was
  // picked is the model) rather than a two-step wizard — a UBC mesh/model pair is always distributed
  // as exactly two files together, so this is the same click either way with less UI.
  const importUBC = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setVoxelError(null);
    setVoxelBusy(true);
    setVoxelProgress(null);
    try {
      const meshFile = files.find((f) => /\.msh$/i.test(f.name));
      const modelFile = files.find((f) => f !== meshFile);
      if (!meshFile || !modelFile) {
        throw new Error("Select both the .msh mesh file and its matching model file (.mod/.con/.den/etc.) together.");
      }
      const meshText = await meshFile.text();
      let mesh = parseUBCMesh(meshText);
      // Read the model file as a stream rather than meshFile.text()-style whole-file-into-one-string —
      // a real UBC-GIF inversion model can be 500MB+ of plain-text numbers, and streaming avoids ever
      // holding the full text AND a full tokenized array in memory at once. See voxel.js's
      // parseUBCModelStream header comment for the OneDrive-placeholder investigation this came out of.
      let values = await parseUBCModelStream(modelFile, mesh, (n) => setVoxelProgress(n));
      setVoxelProgress(null);
      // User report: a real UBC-GIF inversion mesh (41,841,072 cells) used to hard-fail the import
      // outright. Instead of rejecting it, block-average it down to GeoStrix's MAX_CELLS budget (see
      // voxel.js's coarsenUBCModel) — the mesh still imports and renders, just at reduced resolution,
      // with the reduction reported below rather than silently applied.
      const rawTotal = mesh.nx * mesh.ny * mesh.nz;
      let coarsenNote = "";
      if (rawTotal > effectiveMaxCells) {
        const { fx, fy, fz } = planCoarsenFactors(mesh.nx, mesh.ny, mesh.nz, effectiveMaxCells);
        const coarsened = coarsenUBCModel(mesh, values, fx, fy, fz);
        mesh = coarsened.mesh; values = coarsened.values;
        const coarseTotal = mesh.nx * mesh.ny * mesh.nz;
        coarsenNote = ` Original mesh had ${rawTotal.toLocaleString()} cells — over GeoStrix's ${effectiveMaxCells.toLocaleString()}-cell budget for staying responsive in the 3D view, so it was block-averaged down (merging ${fx}×${fy}×${fz} fine cells into each coarse cell) to ${coarseTotal.toLocaleString()} cells. Raise the "3D view cell budget" setting above and re-import if you want finer detail.`;
      }
      const cells = ubcMeshToCells(mesh, values);
      if (!cells.length) throw new Error("Every cell in this model is no-data — nothing to render.");
      const { min, max } = cellValueRange(cells);
      addVoxelModel({ name: meshFile.name.replace(/\.msh$/i, ""), source: "ubc", cells, min, max });
      setVoxelError({
        info: true,
        text: `Imported "${meshFile.name}" — ${mesh.nx}×${mesh.ny}×${mesh.nz} mesh, ${cells.length.toLocaleString()} cell(s) with data.${coarsenNote}`,
      });
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
  // unlikely-to-be-used option next to the two that are) than useful. finishBlockModelImport itself
  // stays — the plain CSV path (importBlockModelCSV, below) still uses it, unchanged.
  const finishBlockModelImport = (fileName, rows, headerCount, note) => {
    try {
      const { cells, badRows, inferredSize } = parseBlockModelCSV(rows);
      if (!cells.length) {
        setVoxelError({ info: false, text: `No usable rows — looked for x/y/z (or easting/northing/elevation) and a value column. Got ${headerCount} column(s).` });
        return;
      }
      const { min, max } = cellValueRange(cells);
      addVoxelModel({ name: fileName.replace(/\.(csv|zip|gpkg|shp)$/i, ""), source: "csv", cells, min, max });
      let msg = `Imported "${fileName}" — ${cells.length.toLocaleString()} block(s).`;
      if (badRows) msg += ` Skipped ${badRows} row(s) missing x/y/z or a value.`;
      if (inferredSize) msg += " Cell size wasn't given for every row, so it was inferred per axis from the smallest gap between distinct centroid coordinates — double-check this matches your model's real block size if cells look mis-sized.";
      if (note) msg += note;
      setVoxelError({ info: true, text: msg });
    } catch (err) {
      setVoxelError({ info: false, text: err.message });
    }
  };
  const importBlockModelCSV = (file) => {
    if (!file) return;
    setVoxelError(null);
    Papa.parse(file, {
      header: true, dynamicTyping: true, skipEmptyLines: true,
      complete: (res) => finishBlockModelImport(file.name, res.data, res.meta.fields?.length || 0),
      error: (err) => setVoxelError({ info: false, text: `Could not parse ${file.name}: ${err.message}` }),
    });
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

  return (
    <div
      className="ge-body"
      style={{ width: "100%" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragOver(false);
        const files = Array.from(e.dataTransfer.files || []);
        // Bug-hunt pass: this used to pick only the FIRST csv and FIRST tif via .find(), silently
        // dropping every other file in a multi-file drag (e.g. several GeoTIFFs at once) with no
        // notice — process every matching file instead. Only one terrain is supported at a time (see
        // importTerrain's own confirm-to-replace prompt), so multiple DEM-looking tifs still only end
        // up as one terrain, but every raster/CSV dropped together now actually imports.
        const csvs = files.filter((f) => f.name.toLowerCase().endsWith(".csv"));
        const tifs = files.filter((f) => /\.tiff?$/i.test(f.name));
        const gxfs = files.filter((f) => /\.gxf$/i.test(f.name));
        const plys = files.filter((f) => /\.ply$/i.test(f.name));
        const xyzs = files.filter((f) => /\.xyz$/i.test(f.name));
        // A dropped .tif is ambiguous between a raster drape (#24) and a DEM (#77) — both are plain
        // georeferenced GeoTIFFs, nothing in the file format itself says which. Heuristic: a filename
        // that reads as elevation data goes to the dedicated terrain importer; anything else keeps the
        // long-standing raster-drape behavior. The terrain section below also has its own explicit
        // drop target/button for when the filename doesn't give it away. .gxf (#26) always goes to the
        // raster drape — GXF grids in practice are geophysical value grids, not elevation.
        csvs.forEach((csv) => importFile(csv));
        // DEM-looking tifs are batched into ONE importTerrain call so multiple adjacent tiles (e.g. two
        // SRTM tiles dropped together) mosaic into a single terrain surface instead of each replacing
        // the last — everything else keeps importing one file at a time as before.
        const demTifs = tifs.filter((tif) => /dem|srtm|elev|terrain|topo/i.test(tif.name));
        const drapeTifs = tifs.filter((tif) => !/dem|srtm|elev|terrain|topo/i.test(tif.name));
        if (demTifs.length) importTerrain(demTifs);
        drapeTifs.forEach((tif) => importRaster(tif));
        gxfs.forEach((gxf) => importRaster(gxf));
        if (plys.length) importBoundaries(plys);
        // .xyz needs a column-picker (its layout isn't fixed — see importXYZFile) which can only show
        // one file at a time; a multi-.xyz drop opens the picker for the first and leaves the rest for
        // a follow-up drop/click rather than silently skipping them with no explanation.
        if (xyzs.length) {
          importXYZFile(xyzs[0]);
          if (xyzs.length > 1) setXyzError({ info: true, text: `Opened the column picker for "${xyzs[0].name}". Import it, then drop the other ${xyzs.length - 1} file(s) one at a time — .xyz files need their columns picked individually.` });
        }
      }}
    >
      <div className="ge-panel" style={{ padding: "16px 14px", overflowY: "auto", width: sidebarWidth }}>
        {/* Raster import UI itself lives in the Raster tab now — this banner only ever shows up if a
            .tif/.gxf was dropped directly on THIS tab (still supported, see onDrop above), so the
            result is visible without needing the full raster list/controls here too. */}
        {rasterError && (
          <div style={{ marginBottom: 12, padding: "8px 10px", background: rasterError.info ? "#f4f5f7" : "#2a1f1f", border: `1px solid ${rasterError.info ? "#d9dce1" : "#4a2f2f"}`, borderRadius: 6, fontSize: 11.5, color: rasterError.info ? "#55606e" : "#e0a0a0", lineHeight: 1.5 }}>
            {rasterError.text}
          </div>
        )}
        <div className="ge-section-label" style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
          Point cloud (CSV)
          <InfoButton title="Point cloud (CSV)" text={'Import a CSV point cloud (x, y, z, value) — mag, IP, gravity, radiometrics, or any other point-sampled survey. Points render in the same 3D scene as drillholes for co-visualization (see the "Geophysics points" layer on the Viewer’s Home tab).'} />
        </div>

        {/* TASKS.csv #120 — optional source EPSG, shared by the CSV and .xyz importers below. Left
            blank, x/y is assumed to already be in the project's EPSG (unchanged behavior). */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: "#6b7684", flexShrink: 0 }}>Source CRS (EPSG)</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder={`optional — assumes EPSG:${project?.epsg ?? "?"}`}
            value={geophysSourceEpsg}
            onChange={(e) => setGeophysSourceEpsg(e.target.value.replace(/[^0-9]/g, ""))}
            style={{ ...numInput, width: "auto", flex: 1 }}
            title="If these points' x/y are in a different EPSG than the project, enter it here — reprojected into the project CRS on import."
          />
        </div>

        <button onClick={() => fileInput.current.click()} style={pBtn}>
          <Upload size={13} /> Import CSV…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files[0]; importFile(f); e.target.value = ""; }}
        />

        {/* Geosoft .xyz line/profile import — its column layout isn't fixed like the CSV importer
            above (a real airborne survey export carries a dozen+ geophysics channels), so this is a
            picker rather than a name-guessed single button — see importXYZFile/confirmImportXYZ. */}
        <button onClick={() => xyzInput.current.click()} style={{ ...pBtn, marginTop: 6 }}>
          <MapPin size={13} /> Import Geosoft .xyz…
        </button>
        <input
          ref={xyzInput}
          type="file"
          accept=".xyz"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files[0]; importXYZFile(f); e.target.value = ""; }}
        />
        {xyzPending && (
          <div style={{ marginTop: 8, padding: "10px 12px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 11.5 }}>
            <div style={{ color: "#1a2028", marginBottom: 8 }}>
              "{xyzPending.fileName}" — {xyzPending.rows.length.toLocaleString()} row(s), {xyzPending.columns.length} column(s). Pick which columns to import as points:
            </div>
            {[
              ["X", "xCol"], ["Y", "yCol"], ["Value", "valueCol"], ["Z / elevation (optional)", "zCol"],
            ].map(([label, key]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                <span style={{ color: "#6b7684", width: 140, flexShrink: 0 }}>{label}</span>
                <select
                  value={xyzPending[key]}
                  onChange={(e) => setXyzPending((p) => ({ ...p, [key]: e.target.value }))}
                  style={{ ...numInput, width: "auto", flex: 1 }}
                >
                  <option value="">{key === "zCol" ? `(none — use ${Math.round(defaultElevation)})` : "(choose a column)"}</option>
                  {xyzPending.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={confirmImportXYZ} style={{ ...pBtn, marginBottom: 0, flex: 1, justifyContent: "center" }}>
                <Upload size={13} /> Import
              </button>
              <button onClick={() => setXyzPending(null)} style={{ ...pBtn, marginBottom: 0, width: 90, justifyContent: "center", color: "#55606e" }}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {xyzError && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: xyzError.info ? "#f4f5f7" : "#2a1f1f", border: `1px solid ${xyzError.info ? "#d9dce1" : "#4a2f2f"}`, borderRadius: 6, fontSize: 11.5, color: xyzError.info ? "#55606e" : "#e0a0a0", lineHeight: 1.5 }}>
            {xyzError.text}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: "#2a1f1f", border: "1px solid #4a2f2f", borderRadius: 6, fontSize: 11.5, color: "#e0a0a0", lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        {rows.length > 0 && (
          <div style={{ marginTop: 14, padding: "10px 12px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 12 }}>
            <div style={{ color: "#1a2028", marginBottom: 4 }}>{rows.length} point{rows.length === 1 ? "" : "s"} loaded</div>
            {min !== null && (
              <div style={{ color: "#55606e", fontSize: 11 }}>Value range: {min.toLocaleString()} – {max.toLocaleString()}</div>
            )}
            {/* TASKS.csv #122 — same graduated/classed symbology (user-defined class breaks, adjustable
                palette) voxel models already have, reused directly: geophysPtsModel below is shaped
                exactly like a real voxel model ({min,max,colorMode,stops,cells}) so VoxelLegendEditor
                — built generically against that shape, not tied to actual voxel-model objects — works
                unchanged. geophysPtsOnUpdate routes its onUpdate(id, patch) calls to the store fields
                instead of a per-model update, since geophys_pts is one flat layer, not a list. */}
            {min !== null && (
              <VoxelLegendEditor
                model={{ id: "geophys_pts", min: geophysPtsMin ?? min, max: geophysPtsMax ?? max, colorMode: geophysPtsColorMode, stops: geophysPtsStops, cells: rows }}
                onUpdate={(_id, patch) => {
                  if ("min" in patch) setGeophysPtsMin(patch.min);
                  if ("max" in patch) setGeophysPtsMax(patch.max);
                  if ("colorMode" in patch) setGeophysPtsColorMode(patch.colorMode);
                  if ("stops" in patch) setGeophysPtsStops(patch.stops);
                }}
              />
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => goToModule("viewer")} style={{ ...pBtn, marginBottom: 0, flex: 1, justifyContent: "center" }}>
                View in 3D <ArrowRight size={13} />
              </button>
              <button
                onClick={() => { if (window.confirm(`Clear all ${rows.length} geophysics point(s)?`)) replaceLayer("geophys_pts", []); }}
                style={{ ...pBtn, marginBottom: 0, width: 90, justifyContent: "center", color: "#e0a0a0" }}
              >
                <Trash2 size={13} /> Clear
              </button>
            </div>
            {/* TASKS.csv #51 — Voronoi/Delaunay tessellation + polygonal declustering, over whatever
                point cloud is currently loaded. Needs >=3 points to be meaningful (see SpatialAnalysis's
                own guard), so only shown once points exist rather than as a separately-gated button. */}
            <button onClick={() => setSpatialOpen(true)} style={{ ...pBtn, marginTop: 8, marginBottom: 0, justifyContent: "center" }}>
              <Triangle size={13} /> Spatial analysis (Voronoi / declustering)…
            </button>
          </div>
        )}

        <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
          Terrain (SRTM/DEM)
          <InfoButton title="Terrain (SRTM/DEM)" text={'Import a georeferenced elevation GeoTIFF (SRTM or any other DEM) to build real terrain geometry in the 3D view, instead of a flat ground plane — raster drapes above can then optionally conform to it ("Drape on terrain" per raster) instead of sitting at a fixed elevation. Select multiple adjacent tiles at once (e.g. two neighboring SRTM tiles) to merge them into one terrain surface. A geographic (lon/lat) source is automatically reprojected into the project’s own EPSG if possible, so it lines up with the rest of the project. Downsampled to a modest mesh resolution regardless of source size. Only one terrain surface per project.'} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => terrainInput.current.click()} style={{ ...pBtn, flex: 1 }} disabled={terrainBusy}>
            {terrainBusy && !srtmProgress ? <Loader2 size={13} className="spin" /> : <Mountain size={13} />} {terrainBusy && !srtmProgress ? "Reading…" : terrain ? "Replace terrain…" : "Import SRTM/DEM…"}
          </button>
          <button
            onClick={openSrtmPicker}
            style={{ ...pBtn, flex: 1 }}
            disabled={terrainBusy}
            title="Pick an area on a map and fetch elevation for it — no manual download needed"
          >
            {srtmProgress ? <Loader2 size={13} className="spin" /> : <Radio size={13} />} {srtmProgress ? `Fetching ${srtmProgress.done}/${srtmProgress.total}…` : "Fetch SRTM for this area"}
          </button>
        </div>
        <div style={{ fontSize: 10.5, color: "#94a1b0", marginTop: 4 }}>
          "Fetch SRTM for this area" opens a map to draw the exact area you want — pre-filled around your drillholes if any are loaded, but you can pan/redraw to widen or shift it. Pulls public elevation data, no manual USGS download needed. Sourced from AWS's public Terrain Tiles (SRTM-heritage, no account required), not usgs.gov directly.
        </div>
        {srtmPickerOpen && (
          <BasemapView
            mode="draw"
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
          <div style={{ marginTop: 8, padding: "8px 10px", background: terrainError.info ? "#f4f5f7" : "#2a1f1f", border: `1px solid ${terrainError.info ? "#d9dce1" : "#4a2f2f"}`, borderRadius: 6, fontSize: 11.5, color: terrainError.info ? "#55606e" : "#e0a0a0", lineHeight: 1.5 }}>
            {terrainError.text}
          </div>
        )}
        {terrain && (
          <div style={{ marginTop: 10, padding: "9px 10px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 11.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div onClick={() => updateTerrain({ visible: terrain.visible === false })} style={{ cursor: "pointer", color: terrain.visible !== false ? "#e2a63c" : "#9aa5b3", flexShrink: 0 }}>
                {terrain.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{terrain.name}</div>
              <span style={{ color: "#94a1b0", flexShrink: 0 }}>{terrain.gridW}×{terrain.gridH}</span>
              <Trash2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => { if (window.confirm(`Remove the terrain surface "${terrain.name}"? Any rasters draped on it will fall back to a flat elevation.`)) removeTerrain(); }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
              <span style={{ color: "#6b7684", width: 46, flexShrink: 0 }}>Color</span>
              <input type="color" value={terrain.color || "#8a7f68"} onChange={(e) => updateTerrain({ color: e.target.value })} style={{ width: 26, height: 22, padding: 0, border: "1px solid #d9dce1", borderRadius: 4, background: "transparent" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ color: "#6b7684", width: 46, flexShrink: 0 }}>Opacity</span>
              <input type="range" min={0.1} max={1} step={0.05} value={terrain.opacity ?? 1} onChange={(e) => updateTerrain({ opacity: Number(e.target.value) })} style={{ flex: 1 }} />
            </div>
            <button onClick={exportTerrainGeoTIFF} style={{ ...pBtn, marginTop: 8, marginBottom: 0 }} title="Export the merged/processed terrain's elevation grid as a single-band GeoTIFF">
              <Download size={13} /> Export to GeoTIFF…
            </button>
          </div>
        )}

        <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
          Boundaries (Geosoft .ply)
          <InfoButton title="Boundaries (Geosoft .ply)" text={`Import a Geosoft .ply boundary/polygon export (property lines, claim blocks, survey/blind-grid extents) as a polyline in the 3D view. Select multiple files at once if you have several. Assumes the file's own coordinates already match the project's EPSG (${project?.epsg ?? "?"}) — there's no on-import reprojection for this format yet.`} />
        </div>
        <button onClick={() => boundaryInput.current.click()} style={pBtn}>
          <Waypoints size={13} /> Import .ply boundary…
        </button>
        <input
          ref={boundaryInput}
          type="file"
          accept=".ply"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { importBoundaries(e.target.files); e.target.value = ""; }}
        />
        {boundaryError && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: boundaryError.info ? "#f4f5f7" : "#2a1f1f", border: `1px solid ${boundaryError.info ? "#d9dce1" : "#4a2f2f"}`, borderRadius: 6, fontSize: 11.5, color: boundaryError.info ? "#55606e" : "#e0a0a0", lineHeight: 1.5 }}>
            {boundaryError.text}
          </div>
        )}
        {nonClaimBoundaries.map((b) => (
          <div key={b.id} style={{ marginTop: 10, padding: "9px 10px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 11.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div onClick={() => updateBoundary(b.id, { visible: b.visible === false })} style={{ cursor: "pointer", color: b.visible !== false ? "#e2a63c" : "#9aa5b3", flexShrink: 0 }}>
                {b.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
              <span style={{ color: "#94a1b0", flexShrink: 0 }}>{b.polylines?.length || 0} part(s)</span>
              <Trash2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => { if (window.confirm(`Remove "${b.name}"?`)) removeBoundary(b.id); }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, cursor: terrain ? "pointer" : "default", opacity: terrain ? 1 : 0.45 }}>
              <input type="checkbox" checked={b.drapeMode === "terrain"} disabled={!terrain}
                onChange={(e) => updateBoundary(b.id, { drapeMode: e.target.checked ? "terrain" : "flat" })} />
              <span style={{ color: "#7b8794" }}>Drape on terrain{!terrain ? " (import a DEM above first)" : ""}</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, opacity: b.drapeMode === "terrain" ? 0.4 : 1 }}>
              <span style={{ color: "#6b7684", width: 46, flexShrink: 0 }}>Elev.</span>
              <input type="number" value={Math.round(b.elevation)} disabled={b.drapeMode === "terrain"} onChange={(e) => updateBoundary(b.id, { elevation: Number(e.target.value) })} style={numInput} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ color: "#6b7684", width: 46, flexShrink: 0 }}>Color</span>
              <input type="color" value={b.color || "#e2a63c"} onChange={(e) => updateBoundary(b.id, { color: e.target.value })} style={{ width: 26, height: 22, padding: 0, border: "1px solid #d9dce1", borderRadius: 4, background: "transparent" }} />
            </div>
          </div>
        ))}

        <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
          Mineral claims / tenure
          <InfoButton title="Mineral claims / tenure" text="Import a claim/tenure boundary (same Geosoft .ply polygon format as Boundaries above), tracked with its own tenure number, status, and expiry date, and its area computed automatically (hectares). Status sets a default color (active = green, pending = amber, expired = red) so standing is visible at a glance in the 3D view — still overridable per claim. Assumes the file's own coordinates already match the project's EPSG." />
        </div>
        <button onClick={() => claimInput.current.click()} style={pBtn}>
          <Flag size={13} /> Import claim boundary (.ply)…
        </button>
        <input
          ref={claimInput}
          type="file"
          accept=".ply"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { importClaims(e.target.files); e.target.value = ""; }}
        />
        {claims.length === 0 && (
          <div style={{ marginTop: 4, fontSize: 11, color: "#94a1b0" }}>No claims imported yet.</div>
        )}
        {claims.map((c) => (
          <div key={c.id} style={{ marginTop: 10, padding: "9px 10px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 11.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div onClick={() => updateBoundary(c.id, { visible: c.visible === false })} style={{ cursor: "pointer", color: c.visible !== false ? (c.color || "#3ca65e") : "#9aa5b3", flexShrink: 0 }}>
                {c.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
              </div>
              <input
                value={c.name} onChange={(e) => updateBoundary(c.id, { name: e.target.value })}
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: "#1a2028", fontSize: 11.5, padding: 0 }}
              />
              <Trash2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => { if (window.confirm(`Remove claim "${c.name}"?`)) removeBoundary(c.id); }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
              <span style={{ color: "#6b7684", width: 60, flexShrink: 0 }}>Tenure #</span>
              <input value={c.tenureNumber || ""} placeholder="e.g. 1234567" onChange={(e) => updateBoundary(c.id, { tenureNumber: e.target.value })} style={{ ...numInput, flex: 1 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ color: "#6b7684", width: 60, flexShrink: 0 }}>Status</span>
              <select
                value={c.status || "active"}
                onChange={(e) => updateBoundary(c.id, { status: e.target.value, color: claimStatusColor(e.target.value) })}
                style={{ ...numInput, flex: 1 }}
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ color: "#6b7684", width: 60, flexShrink: 0 }}>Expiry</span>
              <input type="date" value={c.expiryDate || ""} onChange={(e) => updateBoundary(c.id, { expiryDate: e.target.value })} style={{ ...numInput, flex: 1 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, fontSize: 11, color: "#6b7684" }}>
              <span style={{ width: 60, flexShrink: 0 }}>Area</span>
              <span>{boundaryAreaHectares(c.polylines).toLocaleString(undefined, { maximumFractionDigits: 1 })} ha</span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, cursor: terrain ? "pointer" : "default", opacity: terrain ? 1 : 0.45 }}>
              <input type="checkbox" checked={c.drapeMode === "terrain"} disabled={!terrain}
                onChange={(e) => updateBoundary(c.id, { drapeMode: e.target.checked ? "terrain" : "flat" })} />
              <span style={{ color: "#7b8794" }}>Drape on terrain{!terrain ? " (import a DEM above first)" : ""}</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, opacity: c.drapeMode === "terrain" ? 0.4 : 1 }}>
              <span style={{ color: "#6b7684", width: 60, flexShrink: 0 }}>Elev.</span>
              <input type="number" value={Math.round(c.elevation)} disabled={c.drapeMode === "terrain"} onChange={(e) => updateBoundary(c.id, { elevation: Number(e.target.value) })} style={{ ...numInput, flex: 1 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <span style={{ color: "#6b7684", width: 60, flexShrink: 0 }}>Color</span>
              <input type="color" value={c.color || claimStatusColor(c.status)} onChange={(e) => updateBoundary(c.id, { color: e.target.value })} style={{ width: 26, height: 22, padding: 0, border: "1px solid #d9dce1", borderRadius: 4, background: "transparent" }} />
            </div>
          </div>
        ))}

        {/* User question: "do you think we can increase the 100,000 3d budget? Is it gonna make GeoStrix
            crash?" — this budget (voxel.js's MAX_CELLS) was picked from THIS DEV SANDBOX's own render
            timing (no real GPU here, so it's a conservative guess, not a hard technical ceiling on
            Matt's actual machine) — see voxel.js's header comment. It's not going to crash the app
            either way — a too-high budget just means a slower/less-responsive 3D view while that many
            InstancedMesh instances render, not a hard failure. Made adjustable here so Matt can raise
            it and see how his own hardware handles it, applies to both the OMF and UBC import sections
            below (both already accepted a maxCells parameter, just previously always the same
            hardcoded default). */}
        <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
          3D view cell budget
          <InfoButton title="3D view cell budget" text="A large OMF/UBC block model gets block-averaged down to this many cells before it's rendered, to keep the 3D view responsive. Higher = more detail but slower to render (especially on older/integrated GPUs) — it won't crash GeoStrix either way, just gets laggier. Only affects new imports, not models already in the project." />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <input
            type="number" min={10000} max={2000000} step={10000}
            value={effectiveMaxCells}
            onChange={(e) => { const v = Number(e.target.value); setVoxelCellBudget(Number.isFinite(v) && v > 0 ? v : null); }}
            style={{ ...numInput, width: 100 }}
          />
          <span style={{ color: "#94a1b0", fontSize: 11 }}>cells (default {MAX_CELLS.toLocaleString()})</span>
          {voxelCellBudget != null && (
            <span onClick={() => setVoxelCellBudget(null)} style={{ cursor: "pointer", color: "#55606e", fontSize: 10.5, marginLeft: "auto" }}>Reset to default</span>
          )}
        </div>

        <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
          Open Mining Format (.omf)
          <InfoButton title="Open Mining Format (.omf)" text="Import an .omf project — exported from Oasis montaj/Geosoft, Leapfrog, or any other tool that supports the format. A single file can carry point sets, line sets (veins/faults/traces), triangulated surfaces (contacts/wireframes), and block models all together; each is routed to the right renderer automatically. Only OMF v1 is supported so far (the version most exporters, including Oasis montaj/Leapfrog, still actually produce) — v2 files are detected and reported rather than silently mishandled. Grid-based (non-triangulated) surfaces aren't implemented yet." />
        </div>
        <button onClick={() => omfInput.current.click()} style={pBtn} disabled={omfBusy}>
          {omfBusy ? <Loader2 size={13} className="spin" /> : <Box size={13} />} {omfBusy ? "Reading…" : "Import OMF (.omf)…"}
        </button>
        <input
          ref={omfInput}
          type="file"
          accept=".omf"
          style={{ display: "none" }}
          onChange={(e) => { importOmf(e.target.files[0]); e.target.value = ""; }}
        />
        {omfError && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: omfError.info ? "#f4f5f7" : "#2a1f1f", border: `1px solid ${omfError.info ? "#d9dce1" : "#4a2f2f"}`, borderRadius: 6, fontSize: 11.5, color: omfError.info ? "#55606e" : "#e0a0a0", lineHeight: 1.5 }}>
            {omfError.text}
          </div>
        )}
        {omfObjects.map((o) => (
          <div key={o.id} style={{ marginTop: 10, padding: "9px 10px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 11.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div onClick={() => updateOmfObject(o.id, { visible: o.visible === false })} style={{ cursor: "pointer", color: o.visible !== false ? "#e2a63c" : "#9aa5b3", flexShrink: 0 }}>
                {o.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</div>
              <span style={{ color: "#94a1b0", flexShrink: 0, textTransform: "capitalize" }}>{o.kind}</span>
              <Trash2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => { if (window.confirm(`Remove "${o.name}"?`)) removeOmfObject(o.id); }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
              <span style={{ color: "#6b7684", width: 46, flexShrink: 0 }}>Color</span>
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : "#5a9bd4"} onChange={(e) => updateOmfObject(o.id, { color: e.target.value })} style={{ width: 26, height: 22, padding: 0, border: "1px solid #d9dce1", borderRadius: 4, background: "transparent" }} />
            </div>
          </div>
        ))}

        <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
          Voxel / block models (UBC mesh, block model CSV)
          <InfoButton title="Voxel / block models" text="Import a UBC-GIF tensor mesh (select the .msh mesh file together with its matching model file, e.g. .mod/.con/.den, in one dialog), or a block-model CSV export (x/y/z centroid, cell size, and a value column; the common exchange format from Datamine, Micromine, Surpac, Vulcan, Leapfrog and similar). Geosoft's own proprietary voxel format isn't supported — no public spec to implement against, same reasoning as .grd elsewhere — the CSV path covers the same underlying need. Rendered as coloured 3D blocks with an adjustable value cutoff." />
        </div>
        <button onClick={() => ubcInput.current.click()} style={pBtn} disabled={voxelBusy}>
          {voxelBusy ? <Loader2 size={13} className="spin" /> : <Box size={13} />} {voxelBusy ? (voxelProgress ? `Reading… ${voxelProgress.toLocaleString()} values` : "Reading…") : "Import UBC mesh + model…"}
        </button>
        <input
          ref={ubcInput}
          type="file"
          accept=".msh,.mod,.con,.den,.txt"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { importUBC(e.target.files); e.target.value = ""; }}
        />
        <button onClick={() => blockModelInput.current.click()} style={pBtn}>
          <Upload size={13} /> Import block model CSV…
        </button>
        <input
          ref={blockModelInput}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files[0]; importBlockModelCSV(f); e.target.value = ""; }}
        />
        {voxelError && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: voxelError.info ? "#f4f5f7" : "#2a1f1f", border: `1px solid ${voxelError.info ? "#d9dce1" : "#4a2f2f"}`, borderRadius: 6, fontSize: 11.5, color: voxelError.info ? "#55606e" : "#e0a0a0", lineHeight: 1.5 }}>
            {voxelError.text}
          </div>
        )}
        {voxelModels.map((v) => (
          <VoxelModelRow key={v.id} model={v} onUpdate={updateVoxelModel} onRemove={removeVoxelModel} />
        ))}

        <div style={{ marginTop: 16, fontSize: 11.5, color: "#7b8794", lineHeight: 1.6 }}>
          <div style={{ color: "#1a2028", marginBottom: 6 }}>Also planned:</div>
          <div>• Geosoft binary grid (.grd) — no public format spec, so lower confidence than .gxf above</div>
          <div>• Geosoft voxel (.geosoft_voxel) — proprietary binary, no public spec (see the voxel section above for the CSV-based alternative that's supported instead)</div>
        </div>
      </div>

      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      <div
        className="ge-main"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14, color: "#94a1b0", border: dragOver ? "2px dashed #4a9be0" : "2px dashed transparent", borderRadius: 8 }}
      >
        <Radio size={40} style={{ opacity: 0.4 }} />
        <div style={{ maxWidth: 460, textAlign: "center", fontSize: 12.5, lineHeight: 1.6 }}>
          {(() => {
            // Built as a list-and-join rather than chained ternaries (the pre-#77-fix version of this
            // string) — that approach stopped scaling once boundaries joined rasters/terrain as a
            // third thing that may or may not be loaded.
            const parts = [];
            if (rows.length) parts.push(`${rows.length} geophysics point(s)`);
            if (rasters.length) parts.push(`${rasters.length} raster drape(s)`);
            if (terrain) parts.push("a terrain surface");
            if (boundaries.length) parts.push(`${boundaries.length} boundary(ies)`);
            if (parts.length) {
              const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
              return `${joined} loaded. Drag another CSV, GeoTIFF, .ply, or .xyz here to add more, or head to the 3D View to see everything alongside your drillholes.`;
            }
            return "Drag a CSV, GeoTIFF, Geosoft .gxf grid, .ply boundary, or .xyz line data here, or use the buttons on the left. CSV: x/y/z (or easting/northing/elevation) plus a value (or reading/mag/response). GeoTIFF: any georeferenced grid, orthophoto, or elevation/DEM (a filename with \"dem\"/\"srtm\"/\"elev\"/\"terrain\"/\"topo\" in it is treated as elevation data — otherwise it's imported as a flat raster drape). .gxf grids always import as a raster drape. .ply imports as a boundary polyline; .xyz opens a column picker (Geosoft line/profile data, e.g. airborne survey exports). UBC mesh+model and block-model CSV import (below) render as coloured 3D blocks — Geosoft's own binary .grd/voxel formats stay unsupported, no public spec to implement against.";
          })()}
        </div>
      </div>

      {spatialOpen && <SpatialAnalysis points={rows} onClose={() => setSpatialOpen(false)} />}
    </div>
  );
}

// TASKS.csv #27/#28 — one row per loaded voxel/block model. The threshold slider is debounced locally
// (a plain useState for the displayed value, only pushed to the store — which triggers ViewerModule's
// full InstancedMesh rebuild, real work for a model with tens of thousands of cells — after 150ms of
// no further dragging) rather than updating the store on every native `input` event a range slider
// fires continuously during a drag, which would otherwise rebuild the whole 3D mesh on every pixel of
// movement.
function VoxelModelRow({ model, onUpdate, onRemove }) {
  const [displayThreshold, setDisplayThreshold] = useState(model.threshold);
  const [displayOpacity, setDisplayOpacity] = useState(model.opacity ?? 0.85);
  const [legendOpen, setLegendOpen] = useState(false);
  const debounceRef = useRef(null);
  const opacityDebounceRef = useRef(null);
  const onThresholdInput = (v) => {
    setDisplayThreshold(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onUpdate(model.id, { threshold: v }), 150);
  };
  // Opacity is debounced the same way as threshold — ViewerModule's voxel effect rebuilds the whole
  // InstancedMesh on ANY model field change (same brute-force-rebuild approach the raster/terrain
  // effects already use), so a bare onChange here would rebuild a model that could be tens of
  // thousands of instances on every pixel of a drag.
  const onOpacityInput = (v) => {
    setDisplayOpacity(v);
    if (opacityDebounceRef.current) clearTimeout(opacityDebounceRef.current);
    opacityDebounceRef.current = setTimeout(() => onUpdate(model.id, { opacity: v }), 150);
  };
  const visibleCount = model.cells.filter((c) => c.value >= displayThreshold).length;
  const sourceLabel = model.source === "ubc" ? "UBC" : model.source === "omf" ? "OMF" : "CSV";
  return (
    <div style={{ marginTop: 10, padding: "9px 10px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 11.5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div onClick={() => onUpdate(model.id, { visible: model.visible === false })} style={{ cursor: "pointer", color: model.visible !== false ? "#e2a63c" : "#9aa5b3", flexShrink: 0 }}>
          {model.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, color: "#1a2028", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{model.name}</div>
        <span style={{ color: "#94a1b0", flexShrink: 0 }}>{sourceLabel} · {model.cells.length.toLocaleString()}</span>
        <Palette size={12} style={{ cursor: "pointer", color: legendOpen ? "#4a9be0" : "#55606e", flexShrink: 0 }} onClick={() => setLegendOpen((v) => !v)} title="Edit color legend / range / classification" />
        <Trash2 size={12} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => { if (window.confirm(`Remove "${model.name}"?`)) onRemove(model.id); }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
        <span style={{ color: "#6b7684", width: 62, flexShrink: 0 }}>Cutoff</span>
        <input type="range" min={model.min} max={model.max} step={(model.max - model.min) / 100 || 0.01} value={displayThreshold} onChange={(e) => onThresholdInput(Number(e.target.value))} style={{ flex: 1 }} />
        <span style={{ color: "#55606e", width: 60, textAlign: "right", flexShrink: 0 }}>{displayThreshold.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>
      <div style={{ marginTop: 3, fontSize: 10.5, color: "#94a1b0" }}>
        Showing {visibleCount.toLocaleString()} of {model.cells.length.toLocaleString()} cell(s) (value ≥ cutoff) — range {model.min.toLocaleString(undefined, { maximumFractionDigits: 2 })} to {model.max.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
        <span style={{ color: "#6b7684", width: 62, flexShrink: 0 }}>Opacity</span>
        <input type="range" min={0.1} max={1} step={0.05} value={displayOpacity} onChange={(e) => onOpacityInput(Number(e.target.value))} style={{ flex: 1 }} />
      </div>
      {legendOpen && <VoxelLegendEditor model={model} onUpdate={onUpdate} />}
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
  // User request: "Can we have some gradient colour pallets options for the voxels legends? Get some
  // that are typically used in geophysics and name them with the suggested geophysical survey type
  // use." — see layers.js's PALETTES for the actual named ramps (Geosoft-style spectrum, rainbow,
  // resistivity/IP, viridis, diverging blue-white-red for residual/anomaly grids, grayscale). This
  // picker drives both the Classify action below (colors its generated stops) and the standalone
  // "Recolor with this palette" button (re-themes the model's EXISTING stop values/positions, e.g. an
  // OMF-imported legend, without re-running classification).
  const [palette, setPalette] = useState("default");
  const stops = model.stops || [];

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
    const colors = paletteColorsHex(palette, stops.length);
    setStops(stops.map((s, i) => ({ ...s, color: colors[i] })));
  };
  const applyClassify = () => {
    const breaks = classifyBreaks(model.cells.map((c) => c.value), classCount, method);
    if (!breaks.length) return;
    const colors = paletteColorsHex(palette, breaks.length);
    setStops(breaks.map((v, i) => ({ value: v, color: colors[i] })), { colorMode: "discrete" });
  };
  const resetToDefault = () => setStops([]);

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #d9dce1" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "#6b7684", width: 62, flexShrink: 0 }}>Range</span>
        <input type="number" value={model.min} onChange={(e) => onUpdate(model.id, { min: Number(e.target.value) })} style={{ ...numInput, width: 70 }} />
        <span style={{ color: "#94a1b0" }}>to</span>
        <input type="number" value={model.max} onChange={(e) => onUpdate(model.id, { max: Number(e.target.value) })} style={{ ...numInput, width: 70 }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
        <span style={{ color: "#6b7684", width: 62, flexShrink: 0 }}>Style</span>
        <select value={model.colorMode || "continuous"} onChange={(e) => onUpdate(model.id, { colorMode: e.target.value })} style={{ ...numInput, flex: 1 }}>
          <option value="continuous">Continuous gradient</option>
          <option value="discrete">Classified (stepped)</option>
        </select>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ color: "#6b7684", marginBottom: 4 }}>
          Color legend {stops.length ? `(${stops.length} stop${stops.length === 1 ? "" : "s"})` : "(default gradient — no custom stops yet)"}
        </div>
        {stops.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : "#5a9bd4"} onChange={(e) => updateStop(i, { color: e.target.value })} style={{ width: 24, height: 20, padding: 0, border: "1px solid #d9dce1", borderRadius: 4, background: "transparent", flexShrink: 0 }} />
            <input type="number" value={s.value} onChange={(e) => updateStop(i, { value: Number(e.target.value) })} style={{ ...numInput, flex: 1 }} />
            {model.colorMode === "discrete" && (
              <span style={{ color: "#94a1b0", fontSize: 10, width: 60, flexShrink: 0 }}>
                {i < stops.length - 1 ? `to ${(stops[i + 1].value)}` : `to ${model.max} (max)`}
              </span>
            )}
            <Trash2 size={11} style={{ cursor: "pointer", color: "#94a1b0", flexShrink: 0 }} onClick={() => removeStop(i)} />
          </div>
        ))}
        {/* User report: "the values never got to the max value" — each stop's own number IS its class's
            LOWER bound (standard equal-interval/quantile convention), so the topmost stop's number is
            naturally short of the true max by one class-width — that's correct, not a bug, but it reads
            as broken with nothing showing the top class actually still reaches the real max. The "to …"
            captions above make each row's actual covered range explicit instead of a bare number. */}
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <button onClick={addStop} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, justifyContent: "center" }}><Plus size={12} /> Add stop</button>
          {stops.length > 0 && (
            <button onClick={resetToDefault} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, justifyContent: "center" }}>Reset to default</button>
          )}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ color: "#6b7684", marginBottom: 4 }}>Color palette</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <select value={palette} onChange={(e) => setPalette(e.target.value)} style={{ ...numInput, flex: 1 }}>
            {Object.entries(PALETTES).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
          </select>
          {stops.length > 0 && (
            <button onClick={recolorWithPalette} style={{ ...pBtn, width: "auto", marginBottom: 0 }} title="Re-color the existing stops with this palette, keeping their current values">Recolor</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 2, marginTop: 4, height: 10, borderRadius: 3, overflow: "hidden" }}>
          {paletteColorsHex(palette, 24).map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ color: "#6b7684", marginBottom: 4 }}>Classify</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ ...numInput, flex: 1 }}>
            <option value="equal">Equal interval</option>
            <option value="quantile">Quantile</option>
          </select>
          <input type="number" min={2} max={64} value={classCount} onChange={(e) => setClassCount(Number(e.target.value))} style={{ ...numInput, width: 44 }} />
          <button onClick={applyClassify} style={{ ...pBtn, width: "auto", marginBottom: 0 }}>Apply</button>
        </div>
        <div style={{ fontSize: 10, color: "#94a1b0", marginTop: 3, lineHeight: 1.4 }}>
          Generates {classCount} classes from this model's actual cell values and switches to classified (stepped) styling.
        </div>
      </div>
    </div>
  );
}

const pBtn ={ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px", marginBottom: 6, background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, color: "#1a2028", fontSize: 12, cursor: "pointer" };
const numInput = { flex: 1, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 4, color: "#1a2028", fontSize: 11, padding: "3px 6px" };
