// TASKS.csv #316/#317 — sidebar panel (Geophysics & GIS module) for surface mapping data:
//   * Map layers: GeoPackage / shapefile polygons, lines or points, styled by an attribute (optionally
//     from a QGIS .qml picked in the same dialog), draped on the terrain in the 3D view.
//   * Surface structures: outcrop strike/dip CSVs rendered as dip symbols on the terrain.
// Its own component rather than more inline JSX in GeophysicsModule (already ~1,500 lines); it talks
// to the store directly, the same way AddWebLayerModal does.
import React, { useMemo, useRef, useState } from "react";
import SourceCrsField from "../components/SourceCrsField.jsx"; // TASKS.csv #488
import AzimuthRefPicker from "./AzimuthRefPicker.jsx"; // TASKS.csv #547
import { bearingsToGrid, northRefText, loadIgrf } from "../lib/azimuthRef.js";
import Papa from "papaparse";
import { Eye, EyeOff, Trash2, Map as MapIcon, Compass, ChevronDown, ChevronRight, Palette, Crosshair } from "./icons.js"; // Crosshair: #2793
import { requestPlanZoom } from "../lib/planZoom.js"; // TASKS.csv #2793
import { useStore } from "../lib/store.jsx";
import InfoButton from "./InfoButton.jsx";
import { parseShapefileZip, parseShapefileParts, listZipNames, readZipEntries } from "../lib/shapefile.js";
import { parseGeoPackage } from "../lib/gpkg.js";
import { guessEpsgFromPrjWkt, reprojectXY, getProj4DefSync, crsName, pointTransform, turnGridBearing, bearingTurn } from "../lib/reproject.js";
import { buildLayer, findField, autoColorFor, projectClipBox } from "../lib/mapLayerBuild.js"; // TASKS.csv #609 — shared with the 3D-view drop
import { askAdoptCrs } from "../lib/adoptCrs.js"; // TASKS.csv #607
import {
  parseQmlStyle, autoCategories, applyQmlToCategories,
  guessStructureColumns, parseStructureRows, bestStationColumn /* #1826 */, STRUCTURE_CLASS_COLORS, STRUCTURE_CLASS_LABELS, STRUCTURE_CLASSES, structureClass, structureCodeKey, /* #2266 */
} from "../lib/mapLayers.js";
import { downholeTableColumns, structureCodeColumn } from "../lib/downholeTableGuess.js"; // TASKS.csv #1722
import { uniqueLayerName } from "../lib/interpretation.js"; // TASKS.csv #2573
import { defaultDiscSize, discSizeMax } from "../lib/outcropDiscSize.js"; // TASKS.csv #2412
import { SYMBOLS, FAMILIES, familyFor, projectSymbolChoices, symbolSvg, typeKey } from "../lib/structureSymbols.js"; // TASKS.csv #3066

import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { featureCountText } from "../lib/featureCount.js"; // TASKS.csv #1116
import MapImportReview from "./MapImportReview.jsx"; // TASKS.csv #1325
import { classifyTables, needsImportReview, isCoveringPolygon } from "../lib/mapImportReview.js";
import { CATEGORICAL_SAFE_COLORS } from "../lib/layers.js";
import { saveFile } from "../lib/desktop.js";
import { collarSubcrop, subcropLayer, roleWithCodes, subcropLeftOut, holeStartCodes } from "../lib/collarSubcrop.js"; // TASKS.csv #1719; roleWithCodes: #2407; subcropLeftOut: #2566; holeStartCodes: #2956
import { outlineLayer, defaultReach, medianSpacing } from "../lib/subcropOutlines.js"; // TASKS.csv #2956
import { loggedCodeSpellings, withLogColours } from "../lib/logColours.js"; // TASKS.csv #2970
import { categoryColor, LAYER_META } from "../lib/layers.js"; // TASKS.csv #1719 — the logs' own colours
import { ensureExportCrs } from "../lib/projectCrsRequest.js"; // TASKS.csv #1021
import { toExportCsv } from "../lib/tabular.js";
import { checkGpkgSize } from "../lib/gpkgSize.js"; // TASKS.csv #1716
import { readGeoPackageNear, GPKG_IN_PLACE_BYTES } from "../lib/gpkgInPlace.js"; // TASKS.csv #1716
import { canReadGpkgInPlace, tabSiblingShapefile } from "../lib/desktop.js"; // tabSiblingShapefile: #1349
import CoveringLayers from "./CoveringLayers.jsx"; // TASKS.csv #1823
import { graduatedStyle, graduatedCategories, parseBreaks, isNumericField } from "../lib/mapGraduated.js"; // TASKS.csv #1600
import { projectTargetEpsg } from "../lib/projectTarget.js"; // TASKS.csv #2287 — no reprojection INTO the placeholder CRS
import { tieOf, fileToLocal, bearingToLocal } from "../lib/localGridTie.js"; // TASKS.csv #2320
import { symbolPng, symbolIconPath } from "../lib/structureSymbolPng.js"; // TASKS.csv #3066 — the USGS symbols replace #2681's strike icon
import { symbolForReading } from "../lib/structureSymbols.js"; // TASKS.csv #3066
import { mineGridOf, mineSourceOf, isMineSource, mineChoiceToProject, mineSourceSentence } from "../lib/mineGrid.js"; // TASKS.csv #2586; the mine-grid Source CRS: #2684
import { collarsLookUnderground } from "../lib/pitShell.js"; // TASKS.csv #2265
import { structureGroundCounts, surfaceFlatElevation } from "../lib/viewer/surfacePlacement.js"; import { terrainGroundAt } from "../lib/viewer/geomath.js"; // TASKS.csv #2485 (2); surfaceFlatElevation: #2753

// TASKS.csv #2093 / #1826 — the structure import's skipped rows, one reason each (parseStructureRows' skipWhy)
export function skipReasons(w = {}, names = {}) { // names: the rows skipped for no direction (#2958)
  return [
    w.noMeasurement && tr("{n} with no measurement at all", { n: w.noMeasurement }),
    w.noXY && tr("{n} with no easting or northing", { n: w.noXY }),
    w.noDip && tr("{n} with a bearing but no dip (a chip line or a trend, not a plane)", { n: w.noDip }),
    w.badDip && tr("{n} with a dip that is not a number from 0 to 90", { n: w.badDip }),
    w.bearingUnread && tr("{n} with a dip direction or strike that is not a number (a quadrant bearing such as N45E is not read)", { n: w.bearingUnread }),
    w.noDirection && tr("{n} with a dip over 0 but no dip direction or strike ({rows})", { n: w.noDirection, rows: (names.noDirection || []).slice(0, 8).join(", ") + ((names.noDirection || []).length > 8 ? "…" : "") }), // #2958
  ].filter(Boolean).join("; ");
}

export default function SurfaceMappingPanel({ pBtn, numInput, part = null }) { // part: "maps" | "structures" | null = both (TASKS.csv #458)
  const {
    project, terrain, projectIsEmpty, setEpsg, // #607
    mapLayers, addMapLayer, updateMapLayer, removeMapLayer, goToModule /* #2793 */,
    surfaceStructures, addSurfaceStructureSet, updateSurfaceStructureSet, removeSurfaceStructureSet,
  collars = [], /* #1325 */ surfaceSamples = [], /* #1715 */ survey = [], layers = {}, desurveyMethod, viewerUiState, /* #1719 */ setStructureCodeClasses /* #2266 */, modellingCodes /* #2407 */, setModellingCodes /* #2956 */ } = useStore();
  const mapInput = useRef(null);
  const qmlInput = useRef(null);
  const qmlTargetRef = useRef(null);
  const structInput = useRef(null);
  const [mapMsg, setMapMsg] = useState(null);
  const [structMsg, setStructMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openLegend, setOpenLegend] = useState({});
  const [pendingStruct, setPendingStruct] = useState(null); // { name, rows, headers, cols }
  // TASKS.csv #2970 — a map unit named like a logged code takes the logs' colour (at import, and whenever 'Colour by' returns to the field)
  const logSpell = useMemo(() => loggedCodeSpellings(layers.litho), [layers.litho]);
  // TASKS.csv #3066 — the USGS (FGDC) symbol per structure type: the project's choices (kept on the sets, set.symbolByType), else the default
  // from the type's words; a change applies to every set that has the type
  const symbolChoices = useMemo(() => projectSymbolChoices(surfaceStructures), [surfaceStructures]);
  const setTypeSymbol = (key, family) => { for (const set of surfaceStructures) if ((set.rows || []).some((r) => typeKey(r.type || r.cls) === key)) updateSurfaceStructureSet(set.id, { symbolByType: { ...(set.symbolByType || {}), [key]: family } }); };
  const logColourOf = (u) => categoryColor(viewerUiState?.legendOverride?.litho?.[u], LAYER_META.litho, u);
  const logCats = (layer, cats) => withLogColours(cats, logSpell, logColourOf, { byCount: !!(layer.subcropFromCollars || layer.subcropOutlines) });
  const [subDepth, setSubDepth] = useState(""); // TASKS.csv #2956 — blank: the first unit under the cover; a number: the unit that far down each hole
  const [subcropCard, setSubcropCard] = useState(null); // TASKS.csv #2956 — { name, pts, reach, depth } after a subcrop run
  const [typing, setTyping] = useState(null); // TASKS.csv #1719 — one measurement typed in: { station, x, y, z, type, dip, dipDir, comment }
  const [mapSourceEpsg, setMapSourceEpsg] = useState(""); // #488 — "" = the file's own CRS

  // TASKS.csv #1025 (review #1016, structural geologist) — an outcrop set back out: GeoPackage (POINT Z), KML (the icon
  // turned to the true strike, the dip as its name) or CSV, with dip, dip direction and right-hand-rule strike in grid
  // and true north (they are stored in grid north since #547)
  const exportStructSet = async (s, fmt) => {
    try {
      // TASKS.csv #2267 (review #2174) — the CSV needs no CRS: on a project with none it is written in the project's own grid, the true-north
      // columns left blank; KML and GeoPackage still ask
      const local = project?.crsSet === false && fmt === "csv";
      const epsg = local ? null : await ensureExportCrs(project); if (!local && !epsg) return;
      const ox = await import("../lib/overlayExport.js");
      const { sampleTerrainElevation } = await import("../lib/viewer/geomath.js");
      const zAt = terrain ? (x, y) => sampleTerrainElevation(terrain, x, y) : null; // #1206
      const base = (s.name || "structures").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase() || "structures";
      let res;
      if (fmt === "csv") res = await saveFile({ quiet: "success", suggestedName: `${base}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(ox.surfaceStructureRows(s, epsg, zAt)), encoding: "text" });
      else if (fmt === "kml") {
        const toLonLat = await ox.lonLatTransform(epsg);
        if (!toLonLat) throw new Error(tr("EPSG:{epsg} cannot be converted to latitude / longitude.", { epsg }));
        // TASKS.csv #3066 — each reading's USGS (FGDC) symbol, one PNG per symbol used, turned by its strike like #2681's icon
        const symOf = (f) => symbolForReading({ type: f.attributes.type, cls: f.attributes.cls, dip: f.attributes.dip === "" ? NaN : Number(f.attributes.dip) }, symbolChoices).symbol;
        const feats = ox.surfaceStructureFeatures(s, epsg, zAt), used = new Map();
        for (const f of feats.features) { const sym = symOf(f); used.set(symbolIconPath(sym), sym); }
        const kml = ox.featuresToKml(feats, { name: s.name, toLonLat, nameOf: (f) => (f.attributes.dip !== "" ? `${Math.round(f.attributes.dip)}°` : ""), colorOf: (f) => STRUCTURE_CLASS_COLORS[f.attributes.cls] || "#555555", headingOf: (f) => (f.attributes.strike_rhr_true !== "" ? f.attributes.strike_rhr_true : null), iconOf: (f) => symbolIconPath(symOf(f)) /* #3066 */ });
        // TASKS.csv #2681 — a .kmz: the KML and the strike-symbol icon it points at, so Google Earth turns a dip symbol, not its pushpin
        const { buildZip } = await import("../lib/shapefile.js");
        const kmz = buildZip([{ name: "doc.kml", data: new TextEncoder().encode(kml) }, ...[...used].map(([path, sym]) => ({ name: path, data: symbolPng(sym, 64) }))]);
        res = await saveFile({ quiet: "success", suggestedName: `${base}.kmz`, filters: [{ name: "KMZ", extensions: ["kmz"] }], content: kmz });
      } else {
        const bytes = await (await import("../lib/gpkg.js")).buildGeoPackage([{ name: base, ...ox.surfaceStructureFeatures(s, epsg, zAt), epsg }]);
        res = await saveFile({ quiet: "success", suggestedName: `${base}.gpkg`, filters: [{ name: "GeoPackage", extensions: ["gpkg"] }], content: bytes });
      }
      if (res && !res.ok && res.error) throw new Error(res.error);
    } catch (err) { setStructMsg({ ok: false, text: tr("Export failed: {message}", { message: err.message }) }); }
  };

  const [importReview, setImportReview] = useState(null); // #1325 — { rows, resolve }
  const importMaps = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true); setMapMsg(null);
    const lower = (f) => f.name.toLowerCase();
    const base = (f) => f.name.replace(/\.[^.]+$/, "");
    const qmlFiles = files.filter((f) => lower(f).endsWith(".qml"));
    const qmlByBase = {};
    for (const f of qmlFiles) qmlByBase[base(f).toLowerCase()] = parseQmlStyle(await f.text());
    // A single .qml in the selection styles every layer imported with it, whatever its name — that's the
    // common case (a .gpkg and its exported style, named differently like Matt's sample pair).
    const soleQml = qmlFiles.length === 1 ? qmlByBase[base(qmlFiles[0]).toLowerCase()] : null;
    const done = [];
    const failed = [];
    const looseShp = {};
    files.forEach((f) => { const m = lower(f).match(/\.(shp|dbf|prj|cpg)$/); if (m) (looseShp[base(f)] ||= {})[m[1]] = f; }); // #415 .cpg
    let projectEpsg = projectTargetEpsg(project), empty = projectIsEmpty; // projectTargetEpsg: #2287 // #607 — the first layer of an empty project may set its CRS
    // TASKS.csv #1325 — everything is read first, then sorted, and only then added: see reviewTables below
    const queued = [];
    const addParsed = (parsed, sourceName, opts = {}) => { queued.push({ parsed, sourceName, opts }); };
    let colourAt = mapLayers.length, layersAdded = 0;
    const tableOnly = []; // #1325 — attribute tables: nothing wrong with them, but nothing to draw
    const addNow = (parsed, sourceName, { wgs84 = false } = {}) => {
      // TASKS.csv #1250 — "wj — wj (points)": a family name that repeats the file name reads "wj — points", as the other importers' do
      if (parsed.name && String(parsed.name).startsWith(`${sourceName} (`)) parsed = { ...parsed, name: parsed.name.slice(sourceName.length + 2).replace(/\)$/, "") };
      const qml = qmlByBase[sourceName.toLowerCase()] || soleQml || null;
      // #1106 — a GPX / GeoJSON file is in longitude / latitude: never offered as the project CRS (not metric)
      const mineSrc = isMineSource(mapSourceEpsg), srcOv = wgs84 && mineSrc ? "" : mapSourceEpsg; // #2684 — a GPX / GeoJSON / KML is longitude / latitude, never on the mine grid
      const adopted = wgs84 || mineSrc ? null : askAdoptCrs({ isEmpty: empty, currentEpsg: projectEpsg, declaredEpsg: mapSourceEpsg || parsed.epsg, fileName: sourceName });
      if (adopted) { setEpsg(adopted); projectEpsg = adopted; done.push(tr("project CRS set to EPSG:{epsg}", { epsg: adopted })); }
      empty = false;
      // #1715 — clipped to the project area (collars, surface samples) when there is one
      let layer = buildLayer(parsed, { sourceName, projectEpsg, qml, sourceOverride: srcOv, mineSource: mineSourceOf(project) /* #2684 */, tie: tieOf(project) /* #2320 */, mineGrid: srcOv ? null : mineGridOf(project), collars /* #2586 */, clipTo: projectClipBox([...(collars || []), ...(surfaceSamples || [])]) });
      if (layer?.outside) { failed.push(tr("{name}: none of its {n} features comes within reach of the project's holes and samples, so nothing was imported (check its CRS if it should).", { name: sourceName, n: layer.outside.toLocaleString() })); return; }
      if (!layer) { failed.push(tr("{name}: no usable features", { name: `${sourceName}${parsed.name ? ` (${parsed.name})` : ""}` })); return; }
      if (!qml && !layer.styleBreaks && layer.categories.length > 1) layer = { ...layer, categories: logCats(layer, layer.categories) }; // #2970 — the logs' colours
      // #1325 — a layer with no units to tell apart gets a colour of its own: a batch used to be one amber
      if (!qml && layer.categories.length <= 1) { const color = CATEGORICAL_SAFE_COLORS[colourAt % CATEGORICAL_SAFE_COLORS.length]; layer = { ...layer, color, categories: layer.categories.map((c) => ({ ...c, color })) }; }
      colourAt++;
      if (!qml && isCoveringPolygon(layer.name, layer.geomType)) layer = { ...layer, opacity: 0.08, showOutlines: true }; // #1325
      layersAdded++;
      // file: #1601 — points and lines at their own elevations. TASKS.csv #1606 (review #1497, Lawyers) — with no terrain yet the layer is still
      // 'terrain' (drawn flat at its elevation until one exists, sceneBuilders.syncMapLayers), so a terrain built later drapes it: as 'flat'
      // it stayed at 1,834 m over the new terrain until 'Drape on terrain' was ticked on each card
      addMapLayer({ ...layer, drapeMode: !terrain && layer.hasZ && layer.geomType !== "polygon" ? "file" : "terrain" });
      // TASKS.csv #1116 — whole phrases (the geometry name used to take an English "s")
      // #1716 — read in place: one line, counted against the whole table, not against the rows the R-tree returned
      if (parsed.inPlace) done.push(tr("{name}: {kept} of its {total} features lie near the project, read from the file in place; the rest, far from the holes and samples, were left out.", { name: layer.name, kept: layer.features.length.toLocaleString(), total: parsed.inPlace.total.toLocaleString() }));
      else if (layer.clipped) done.push(tr("{name}: {kept} of its {total} features lie near the project; the rest, far from the holes and samples, were left out.", { name: layer.name, kept: layer.clipped.kept.toLocaleString(), total: layer.clipped.total.toLocaleString() })); // #1715
      done.push(`${layer.name}: ${featureCountText(layer.features.length, layer.geomType)}${layer.skipped ? ` (${tr("{n} empty/unsupported skipped", { n: layer.skipped })})` : ""}, ${layer.crsNote}${qml ? `, ${tr("styled from .qml")}` : ""}`);
    };
    for (const f of files) {
      const n = lower(f);
      try {
        if (n.endsWith(".gpx") || n.endsWith(".geojson") || n.endsWith(".json")) {
          // TASKS.csv #1106 — GPX (waypoints, tracks, routes) and GeoJSON, one layer per geometry kind, reprojected from WGS 84
          const { parseGPX, gpxToLayers, parseGeoJSON } = await import("../lib/gpxGeojson.js");
          const text = await f.text();
          const layers = n.endsWith(".gpx") ? gpxToLayers(parseGPX(text)) : parseGeoJSON(text).layers;
          if (!layers.length) throw new Error(tr("no points, lines or polygons in this file"));
          layers.forEach((l) => addParsed({ ...l, name: layers.length > 1 ? l.name : null }, base(f), { wgs84: l.epsg === 4326 }));
        } else if (n.endsWith(".kml") || n.endsWith(".kmz")) { // #1247
          const { readKmlFile, kmlToMapLayers } = await import("../lib/kml.js");
          const layers = kmlToMapLayers((await readKmlFile(f)).features);
          if (!layers.length) throw new Error(tr("no points, lines or polygons in this file"));
          layers.forEach((l) => addParsed({ ...l, name: layers.length > 1 ? l.name : null }, base(f), { wgs84: true }));
        } else if (n.endsWith(".gpkg")) {
          // #1716 — a big file is opened in place by the desktop app and only the features around the project are read
          const near = f.size > GPKG_IN_PLACE_BYTES && canReadGpkgInPlace() && !isMineSource(mapSourceEpsg) /* #2684 — the clip box is in the project CRS, not the grid's */
            ? await readGeoPackageNear(f, { clipBox: projectClipBox([...(collars || []), ...(surfaceSamples || [])]), projectEpsg, sourceEpsg: mapSourceEpsg || null })
            : null;
          if (near) {
            if (!near.layers.length) throw new Error(tr("none of its {n} feature tables has anything within reach of the project's holes and samples, so nothing was imported (check its CRS if it should).", { n: near.outside.length }));
            near.layers.forEach((l) => {
              addParsed(l, base(f));
              if (l.inPlace.truncated) failed.push(tr("{name}: only the first {kept} features near the project were read; export a smaller area from QGIS for the rest.", { name: l.name, kept: l.inPlace.kept.toLocaleString() }));
            });
            continue;
          }
          checkGpkgSize(f); // #1716 — refused before reading when too big
          const { layers } = await parseGeoPackage(await f.arrayBuffer());
          const usable = layers.filter((l) => l.features.length);
          if (!usable.length) throw new Error(tr("no feature tables with geometry"));
          usable.forEach((l) => addParsed(l, base(f)));
        } else if (n.endsWith(".zip")) {
          // TASKS.csv #627 — a zipped GeoPackage (no .shp inside): unpack only the .gpkg file(s) and read them as above
          const zbuf = await f.arrayBuffer();
          const zipNames = await listZipNames(zbuf);
          const gpkgs = zipNames.filter((x) => /\.gpkg$/i.test(x));
          if (gpkgs.length && !zipNames.some((x) => /\.shp$/i.test(x))) {
            for (const g of gpkgs) {
              let entry;
              // #1716 — over the zip limit: the .gpkg itself can be read around the project in the desktop app
              try { entry = (await readZipEntries(zbuf, { test: (x) => x === g }))[g]; } catch (e) { throw new Error(canReadGpkgInPlace() && /uncompressed/.test(e.message) ? `${e.message} ${tr("Unzip it and import the .gpkg itself: GeoStrix then reads only the features around the project's holes and samples.")}` : e.message); }
              const { layers } = await parseGeoPackage(entry);
              const usable = layers.filter((l) => l.features.length);
              if (!usable.length) throw new Error(tr("no feature tables with geometry in {g}", { g }));
              usable.forEach((l) => addParsed(l, base(f)));
            }
            continue;
          }
          const first = await parseShapefileZip(zbuf);
          const names = first.layerNames || [first.layerName];
          for (const ln of names) {
            const p = ln === first.layerName ? first : await parseShapefileZip(zbuf, ln);
            addParsed({ ...p, name: names.length > 1 ? ln : null, epsg: guessEpsgFromPrjWkt(p.prjWkt) }, base(f));
          }
        }
      } catch (err) {
        failed.push(`${f.name}: ${err.message}`);
      }
    }
    // TASKS.csv #818 — MapInfo TAB (.TAB + .MAP + .ID [+ .DAT]), grouped by base name ignoring case (ARIS sets mix .TAB / .tab)
    const tabGroups = {};
    files.forEach((f) => { const m = lower(f).match(/\.(tab|map|id|dat)$/); if (m) (tabGroups[base(f).toLowerCase()] ||= { name: base(f) })[m[1]] = f; });
    for (const g of Object.values(tabGroups)) {
      if (!g.tab) continue;
      try {
        // TASKS.csv #1349 — a .TAB that only points at other data: a shapefile beside it (read: the .shp picked too, or from the .TAB's
        // own folder), a saved query or a linked spreadsheet / database (said plainly; they used to be 'not supported' or 'no map objects')
        if (!g.map || !g.id) {
          const { parseTabHeader } = await import("../lib/mapinfoTab.js");
          const type = parseTabHeader(new Uint8Array(await g.tab.arrayBuffer())).tableType;
          if (type === "SHAPEFILE") {
            if (Object.keys(looseShp).some((k) => k.toLowerCase() === g.name.toLowerCase() && looseShp[k].shp)) continue; // read below as a shapefile
            const r = await tabSiblingShapefile(g.tab);
            if (!r.ok) { failed.push(tr("{name}.TAB is a MapInfo wrapper around a shapefile: select {name}.shp with its .dbf and .prj too.", { name: g.name })); continue; }
            const txt = (u) => (u ? new TextDecoder().decode(u) : null);
            const p = parseShapefileParts({ shp: r.parts.shp, dbf: r.parts.dbf || null, cpg: txt(r.parts.cpg) }, 0, txt(r.parts.prj));
            if (!r.parts.dbf) failed.push(tr("{name}.shp: no matching .dbf selected — imported without attributes, so it can't be styled by unit", { name: g.name }));
            addParsed({ ...p, name: null, epsg: guessEpsgFromPrjWkt(p.prjWkt) }, g.name);
            continue;
          }
          if (type === "QUERY") { failed.push(tr("{name}.TAB is a saved MapInfo query: it holds no data of its own.", { name: g.name })); continue; }
          if (type && !["NATIVE", "LINKED", "DBF"].includes(type)) { failed.push(tr("{name}.TAB is linked to a {type} file that holds its data: import that table instead.", { name: g.name, type })); continue; }
          tableOnly.push(g.name); continue;
        }
        const { parseMapInfoTab } = await import("../lib/mapinfoTab.js");
        const bytes = async (f) => (f ? new Uint8Array(await f.arrayBuffer()) : null);
        const { layers } = parseMapInfoTab({ tab: await bytes(g.tab), map: await bytes(g.map), id: await bytes(g.id), dat: await bytes(g.dat), name: g.name });
        if (!g.dat) failed.push(tr("{name}: no .DAT selected — imported without attributes, so it can't be styled by unit", { name: g.name }));
        layers.forEach((l) => addParsed({ features: l.features, geomType: l.geomType, name: layers.length > 1 ? l.name : null, epsg: l.epsg, skippedCount: l.skippedCount }, g.name));
      } catch (err) {
        failed.push(`${g.name}.TAB: ${err.message}`);
      }
    }
    // TASKS.csv #945 — MapInfo interchange (.MIF [+ .MID]), grouped by base name ignoring case, as the TAB above
    const mifGroups = {};
    files.forEach((f) => { const m = lower(f).match(/\.(mif|mid)$/); if (m) (mifGroups[base(f).toLowerCase()] ||= { name: base(f) })[m[1]] = f; });
    for (const g of Object.values(mifGroups)) {
      if (!g.mif) { failed.push(tr("{name}.MID has no .MIF beside it: select both files.", { name: g.name })); continue; }
      try {
        const { parseMapInfoMif } = await import("../lib/mapinfoMif.js");
        const bytes = async (f) => (f ? new Uint8Array(await f.arrayBuffer()) : null);
        const { layers } = parseMapInfoMif({ mif: await bytes(g.mif), mid: await bytes(g.mid), name: g.name });
        if (!g.mid) failed.push(tr("{name}: no .MID selected — imported without attributes, so it can't be styled by unit", { name: g.name }));
        layers.forEach((l) => addParsed({ features: l.features, geomType: l.geomType, name: layers.length > 1 ? l.name : null, epsg: l.epsg, skippedCount: l.skippedCount }, g.name));
      } catch (err) {
        failed.push(`${g.name}.MIF: ${err.message}`);
      }
    }
    for (const [b, parts] of Object.entries(looseShp)) {
      if (!parts.shp) continue;
      try {
        const p = parseShapefileParts({
          shp: new Uint8Array(await parts.shp.arrayBuffer()),
          dbf: parts.dbf ? new Uint8Array(await parts.dbf.arrayBuffer()) : null,
          cpg: parts.cpg ? await parts.cpg.text() : null,
        }, 0, parts.prj ? await parts.prj.text() : null);
        if (!parts.dbf) failed.push(tr("{name}.shp: no matching .dbf selected — imported without attributes, so it can't be styled by unit", { name: b }));
        addParsed({ ...p, name: null, epsg: guessEpsgFromPrjWkt(p.prjWkt) }, b);
      } catch (err) {
        failed.push(`${b}.shp: ${err.message}`);
      }
    }
    // TASKS.csv #1325 — sort what was read; ask only when some of it does not belong on this map
    let leftOut = 0;
    {
      // TASKS.csv #1717 (review #1645, Copley) — one row per table / layer of a file, not one per file: a seven-table GeoPackage was ONE
      // tick box, so the geology polygons and contacts could not be taken without 386,025 lake polygons
      const keyOf = (q) => (q.parsed.name ? `${q.sourceName} — ${q.parsed.name}` : q.sourceName);
      const byTable = new Map();
      for (const q of queued) { const k = keyOf(q); if (!byTable.has(k)) byTable.set(k, { name: k, epsg: isMineSource(mapSourceEpsg) ? (q.opts.wgs84 ? 4326 : null) /* #2684 */ : mapSourceEpsg ? Number(mapSourceEpsg) : q.opts.wgs84 ? 4326 : Number(q.parsed.epsg) || null, layers: [], items: [] }); }
      for (const q of queued) { const t = byTable.get(keyOf(q)); t.layers.push(q.parsed); t.items.push(q); if (!t.epsg && q.parsed.epsg) t.epsg = Number(q.parsed.epsg); }
      const tables = [...byTable.values()];
      const counts = new Map();
      tables.forEach((t) => { if (t.epsg) counts.set(t.epsg, (counts.get(t.epsg) || 0) + 1); });
      const common = Number(projectEpsg) || [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const reviewTie = tieOf(project); // TASKS.csv #2320 — on a tied local grid the boxes are compared in grid metres, through the tie
      const toCommon = (b, epsg) => {
        if (reviewTie && Number(epsg)) {
          const c = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(([x, y]) => fileToLocal(reviewTie, x, y, epsg));
          return c.every(Boolean) ? [Math.min(...c.map((p) => p.x)), Math.min(...c.map((p) => p.y)), Math.max(...c.map((p) => p.x)), Math.max(...c.map((p) => p.y))] : null;
        }
        if (Number(epsg) === common) return b;
        if (!common || !getProj4DefSync(epsg) || !getProj4DefSync(common)) return null;
        const c = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(([x, y]) => reprojectXY(x, y, epsg, common));
        return c.every(Boolean) ? [Math.min(...c.map((p) => p.x)), Math.min(...c.map((p) => p.y)), Math.max(...c.map((p) => p.x)), Math.max(...c.map((p) => p.y))] : null;
      };
      const held = [...mapLayers.map((l) => l.bbox).filter(Boolean), ...collars.filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y)).map((c) => [c.x, c.y, c.x, c.y])];
      const refBox = held.length ? [Math.min(...held.map((b) => b[0])), Math.min(...held.map((b) => b[1])), Math.max(...held.map((b) => b[2])), Math.max(...held.map((b) => b[3]))] : null;
      const rows = classifyTables(tables, { toCommon, refBox });
      let keep = new Set(tables.map((t) => t.name));
      // TASKS.csv #1720 (review #1645, Copley) — the review's state ({ rows, resolve }) stays referenced by React's previous render of this
      // panel until it renders again, and the rows reach every parsed table: cancelling a 791 MB GeoPackage's review held 2.7 GB until an
      // unrelated pane switch. The tables are emptied in place once the review is answered (the chosen ones are in the store by then).
      const release = () => { for (const t of tables) { t.layers.length = 0; t.items.length = 0; } rows.length = 0; queued.length = 0; };
      if (needsImportReview(rows)) {
        const chosen = await new Promise((resolve) => setImportReview({ rows, resolve }));
        setImportReview(null);
        keep = chosen || new Set();
        if (!chosen) { release(); setBusy(false); setMapMsg(null); return; } // Cancel: nothing changes
        leftOut = tables.length - keep.size;
      }
      for (const t of tables) if (keep.has(t.name)) for (const q of t.items) addNow(q.parsed, q.sourceName, q.opts);
      release();
    }
    // TASKS.csv #1248 — a file no branch above takes vanished without a word
    for (const f of files) if (/\.(csv|txt|xlsx|xls)$/i.test(f.name)) failed.push(tr("{name}: a table, not a map layer. Sample points with coordinates (rock, soil, stream) go in Geochem > Surface samples; structural measurements in Outcrop structures.", { name: f.name })); // #1600
    else if (!/\.(gpkg|zip|shp|shx|dbf|prj|cpg|sbn|sbx|qix|tab|map|id|dat|ind|mif|mid|gpx|geojson|json|kml|kmz|qml)$/i.test(f.name)) failed.push(tr("{name}: not a format this importer reads (.gpkg, .zip, .shp, .tab, .mif, .gpx, .geojson, .kml, .kmz).", { name: f.name }));
    if (qmlFiles.length && !files.some((f) => /\.(gpkg|zip|shp|tab|mif)$/i.test(f.name))) failed.push(tr("A .qml on its own doesn't import anything — use the .qml button on a layer's card to apply it to an existing layer."));
    setBusy(false);
    // #1325 — past a few layers the list is a wall of text: each layer's own note is under Map layers
    const summary = done.length > 6 ? tr("Imported {n} layers.", { n: layersAdded }) + (leftOut ? ` ${tr("Left out {n} tables.", { n: leftOut })}` : "") : done.length ? tr("Imported {done}.", { done: done.join("; ") }) + (leftOut ? ` ${tr("Left out {n} tables.", { n: leftOut })}` : "") : "";
    const tablesNote = tableOnly.length ? tr("{n} attribute table(s) have no map objects, so they were not added: {names}. Import them from the tab their data belongs to.", { n: tableOnly.length, names: tableOnly.join(", ") }) : "";
    setMapMsg({ ok: !failed.length, text: [summary, tablesNote, failed.length ? tr("Problems: {failed}", { failed: failed.join("; ") }) : ""].filter(Boolean).join(" ") });
  };

  const applyQmlToLayer = async (file) => {
    const layer = mapLayers.find((l) => l.id === qmlTargetRef.current);
    if (!file || !layer) return;
    const qml = parseQmlStyle(await file.text());
    if (!qml) { setMapMsg({ ok: false, text: tr("{name}: no categorized style found (only QGIS \"Categorized\" styles are read).", { name: file.name }) }); return; }
    const field = findField(layer.fields, qml.field);
    if (!field) { setMapMsg({ ok: false, text: tr("{name} styles the \"{field}\" attribute, which \"{name2}\" doesn't have (it has: {fields}).", { name: file.name, field: qml.field, name2: layer.name, fields: layer.fields.join(", ") }) }); return; }
    const cats = applyQmlToCategories(autoCategories(layer.features, field, autoColorFor()), qml);
    const matched = cats.filter((c) => qml.categories.some((q) => q.value === c.value)).length;
    updateMapLayer(layer.id, { styleField: field, categories: cats, opacity: Math.max(0.15, qml.opacity) });
    setMapMsg({ ok: true, text: tr("Applied {name} to \"{name2}\": {matched} of {cats} unit(s) matched a style category.", { name: file.name, name2: layer.name, matched, cats: cats.length }) });
  };

  // TASKS.csv #1719 / #2956 — the subcrop from collars (the button's body, a function since #2956 so 'Make it again' can run it); replace: the
  // layer a previous run made, removed first
  const makeSubcrop = (replace = null) => {
    // TASKS.csv #2265 (review #2174) — on a project drilled from underground the 'top of each hole' is a drill position on a mine level,
    // not the surface: asked first, named for what it is. (Its NPRC / Unknown 'units' are cover since #2227: roleForLithology reads the notes.)
    const ug = collarsLookUnderground(collars, survey);
    if (ug.underground && !window.confirm(tr("The collars look underground ({upward} hole(s) drilled upward, {stacked} pair(s) of collars stacked over each other): these points would be the first logged unit at the drill positions on the mine levels, not a subcrop map. Make them anyway?", { upward: ug.upward, stacked: ug.stacked }))) return;
    const rep = { lateStart: [] }; // TASKS.csv #2411 / #2570 — logs that start below the collar
    const depth = String(subDepth).trim() === "" ? null : Number(subDepth); // #2956
    if (depth != null && !(depth >= 0)) { setMapMsg({ ok: false, text: tr("The depth below the collar must be a number of metres, 0 or more.") }); return; }
    const pts = collarSubcrop({ collars, survey, litho: layers.litho, desurveyMethod, roleOf: roleWithCodes(modellingCodes), report: rep, atDepthM: depth }); // roleOf: #2407; atDepthM: #2956
    const late = rep.lateStart.length ? tr("{n} hole(s) whose log starts below the collar ({a}–{b} m down: an unlogged precollar, or logging only where something was met) were left out: their first logged unit is a point down the hole, not a subcrop ({ids}).", { n: rep.lateStart.length, a: Math.round(Math.min(...rep.lateStart.map((h) => h.logStart)) * 10) / 10, b: Math.round(Math.max(...rep.lateStart.map((h) => h.logStart)) * 10) / 10, ids: rep.lateStart.slice(0, 5).map((h) => h.hole_id).join(", ") + (rep.lateStart.length > 5 ? ", …" : "") }) : "";
    if (!pts.length) { setMapMsg({ ok: false, text: [depth != null ? tr("No hole's log covers {d} m down.", { d: depth }) /* #2956 */ : tr("No hole has a logged unit under its overburden / casing to place."), late].filter(Boolean).join(" ") }); return; }
    const base = depth != null ? tr("Units {d} m below the collars", { d: depth }) : ug.underground ? tr("Units at the collars") : tr("Subcrop from collars"); // #2265; at a depth: #2956
    if (replace) removeMapLayer(replace.id); // #2956 — 'Make it again' replaces the layer it made
    let name = base; for (let k = 2; mapLayers.some((l) => l.name === name && l.id !== replace?.id); k++) name = `${base} (${k})`;
    const layer = subcropLayer(pts, name, (u) => categoryColor(viewerUiState?.legendOverride?.litho?.[u], LAYER_META.litho, u));
    addMapLayer({ ...layer, drapeMode: terrain ? "terrain" : "file" });
    const skipped = collars.length - pts.length - rep.lateStart.length - (rep.notAtDepth || 0); // the late starts are said on their own (#2411)
    setSubcropCard({ name, pts, reach: String(defaultReach(pts)), depth }); // #2956
    setMapMsg({ ok: true, text: [depth != null ? tr("{name}: {n} point(s), {units} unit(s): the unit logged {d} m down each hole, at the hole's position at that depth.", { name, n: pts.length, units: layer.categories.length, d: depth }) /* #2956 */ : tr("{name}: {n} point(s), {units} unit(s): the first logged unit under the overburden / casing / no recovery at the top of each hole, at the hole's position at that depth. A start for the map, not a mapped outcrop.", { name, n: pts.length, units: layer.categories.length }),
      rep.notAtDepth ? tr("{n} hole(s) whose log does not cover {d} m down were left out.", { n: rep.notAtDepth, d: depth }) : "" /* #2956 */, skipped > 0 ? (() => { const lo = subcropLeftOut({ collars, litho: layers.litho, roleOf: roleWithCodes(modellingCodes) }); return tr("{n} hole(s) were left out: {a} with no lithology log, {b} with only blank codes, {c} with only cover (overburden / casing / no recovery).", { n: skipped, a: lo.noLog, b: lo.blankOnly, c: lo.coverOnly }); })() /* #2566 — the reason, not one guess for all */ : "", late, depth == null ? tr("Each point keeps the depth of the cover above it (cover_m): 'Colour by depth of cover' below maps it.") : ""].filter(Boolean).join(" ") }); // cover_m: #2956
  };
  // TASKS.csv #2956 — a code ticked as cover in the subcrop card: its role written as 3D Modelling > Modelling codes would (unticked: stratigraphic)
  const setCoverRole = (code, on) => setModellingCodes((p) => {
    const base = p || { codes: [], assign: {}, ties: [] }, list = [...(base.codes || [])];
    const i = list.findIndex((c) => String(c.name).trim().toUpperCase() === code.toUpperCase()), role = on ? "overburden" : "stratigraphic";
    if (i < 0) list.push({ name: code, role }); else list[i] = { ...list[i], role };
    return { ...base, codes: list };
  });
  const outlineSubcrop = () => {
    const c = subcropCard, reachM = Number(c?.reach);
    if (!c || !(reachM > 0)) { setMapMsg({ ok: false, text: tr("Give the distance from the holes as a number of metres above 0.") }); return; }
    const base = tr("{name} outlines", { name: c.name });
    let name = base; for (let k = 2; mapLayers.some((l) => l.name === name); k++) name = `${base} (${k})`;
    const layer = outlineLayer(c.pts, name, (u) => categoryColor(viewerUiState?.legendOverride?.litho?.[u], LAYER_META.litho, u), { reachM });
    if (!layer.features.length) { setMapMsg({ ok: false, text: tr("No outline could be made from these points.") }); return; }
    addMapLayer(layer);
    setMapMsg({ ok: true, text: tr("{name}: {n} polygon(s), {units} unit(s): each hole's nearest-hole area, cut back to {r} m from the hole (the median hole spacing is {s} m). A unit map from the drilling, not a mapped outline: Model it can build from it.", { name, n: layer.features.length, units: layer.categories.length, r: reachM, s: Math.round(medianSpacing(c.pts)) }) });
  };
  const changeStyleField = (layer, field) => {
    const grad = graduatedStyle(layer.features, field); // TASKS.csv #1600 - a numeric field in classes
    updateMapLayer(layer.id, grad ? { styleField: field, ...grad } : { styleField: field, styleBreaks: null, categories: logCats(layer, autoCategories(layer.features, field, autoColorFor())) /* #2970 */ });
  };
  const setBreaks = (layer, text) => { // #1600
    const b = parseBreaks(text);
    if (b.length) updateMapLayer(layer.id, { styleBreaks: b, categories: graduatedCategories(layer.features, layer.styleField, b) });
  };
  const eachValue = (layer) => updateMapLayer(layer.id, { styleBreaks: null, categories: logCats(layer, autoCategories(layer.features, layer.styleField, autoColorFor())) /* #2970 */ });

  const readStructCsv = async (fileList) => {
    const all = Array.from(fileList || []);
    // TASKS.csv #818 — a MapInfo point table (.TAB + .MAP + .ID + .DAT): its points' attributes become the rows, with
    // the point coordinates added as Easting / Northing, then the same column check as a CSV
    const tabFile = all.find((f) => /\.(tab|mif)$/i.test(f.name)), isMif = !!tabFile && /\.mif$/i.test(tabFile.name); // .mif: #945
    if (tabFile) {
      setStructMsg(null);
      const stem = tabFile.name.replace(/\.[^.]+$/, "").toLowerCase();
      const part = (ext) => all.find((f) => f.name.toLowerCase() === `${stem}.${ext}`);
      try {
        const bytes = async (f) => (f ? new Uint8Array(await f.arrayBuffer()) : null);
        let layers;
        if (isMif) {
          if (!part("mid")) throw new Error(tr("Select the .MIF together with its .MID file (the measurements are in the .MID)."));
          const { parseMapInfoMif } = await import("../lib/mapinfoMif.js");
          ({ layers } = parseMapInfoMif({ mif: await bytes(tabFile), mid: await bytes(part("mid")), name: tabFile.name.replace(/\.[^.]+$/, "") }));
        } else {
          if (!part("map") || !part("id")) throw new Error(tr("Select the .TAB together with its .MAP, .ID and .DAT files."));
          const { parseMapInfoTab } = await import("../lib/mapinfoTab.js");
          ({ layers } = parseMapInfoTab({ tab: await bytes(tabFile), map: await bytes(part("map")), id: await bytes(part("id")), dat: await bytes(part("dat")), name: tabFile.name.replace(/\.[^.]+$/, "") }));
        }
        const pts = layers.find((l) => l.geomType === "point" && !l.isText);
        if (!pts) throw new Error(tr("{name} has no point features to read as measurements.", { name: tabFile.name }));
        const rows = pts.features.map((f) => ({ ...f.attributes, Easting: f.geometry[0][0], Northing: f.geometry[0][1] }));
        const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        const cols = guessStructureColumns(headers);
        cols.x = "Easting"; cols.y = "Northing"; // the geometry itself, whatever columns the table also carries
        setPendingStruct({ name: tabFile.name.replace(/\.[^.]+$/, ""), rows, headers, cols, sourceEpsg: String(pts.epsg || project?.epsg || "") });
      } catch (err) { setStructMsg({ ok: false, text: err.message }); }
      return;
    }
    const file = all[0];
    if (!file) return;
    setStructMsg(null);
    // latin1: field notebooks exported from Excel carry Windows-1252 degree signs ("156°/-54°" in the
    // sample file), which a UTF-8 decode turns into replacement characters.
    const buf = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
    const res = Papa.parse(text, { header: true, skipEmptyLines: true });
    const headers = res.meta.fields || [];
    const cols = guessStructureColumns(headers);
    // TASKS.csv #1722 — a hole id with down-hole depths and no easting / northing: a drillhole table, said, not opened as outcrops
    cols.station = bestStationColumn(headers, res.data, cols); // TASKS.csv #1826 — the one filled on the measured rows
    if (!cols.type) cols.type = structureCodeColumn(headers); // #1722 — Struc_Code
    const dh = downholeTableColumns(headers, cols);
    if (dh) {
      setStructMsg({ ok: false, text: tr("{name} looks like a downhole table ({cols}: a hole id and down-hole depths, no easting or northing). Outcrop measurements need map coordinates: import this file in the 3D View (drag it onto the view), where downhole structure logs go.", { name: file.name, cols: [dh.hole, dh.from, dh.to, dh.depth, ...dh.angles.slice(0, 2)].filter(Boolean).join(", ") }) });
      return;
    }
    // Header hints like "Easting UTM09" say the zone but not the datum, so the source CRS defaults to the
    // project's and is shown for the user to correct (NAD83 vs NAD83(CSRS) is only ~1-2 m, but a zone
    // or NAD27 mix-up is hundreds of metres).
    setPendingStruct({ name: file.name.replace(/\.[^.]+$/, ""), rows: res.data, headers, cols, sourceEpsg: project?.epsg ? String(project.epsg) : "" });
  };

  const commitStructs = async () => {
    const p = pendingStruct;
    if (!p) return;
    const north = p.north || { ref: "grid", date: "" }; // #547
    if (north.ref === "magnetic" && !north.date) { setStructMsg({ ok: false, text: tr("Enter the date the measurements were taken — the magnetic declination depends on it.") }); return; }
    if (!p.cols.x || !p.cols.y || !p.cols.dip || (!p.cols.dipDir && !p.cols.strike)) {
      setStructMsg({ ok: false, text: tr("Pick at least easting, northing, dip, and either dip direction or strike.") });
      return;
    }
    // TASKS.csv #2266 — the classes picked on the card for codes no rule knows, kept for this project (later imports, typed measurements)
    const picked = Object.fromEntries(Object.entries(p.codeClasses || {}).filter(([, v]) => v && v !== "other"));
    const codeClasses = { ...(project?.structureCodeClasses || {}), ...picked };
    const out = parseStructureRows(p.rows, p.cols, codeClasses);
    if (!out.rows.length) { setStructMsg({ ok: false, text: tr("No rows had usable coordinates and dip.") }); return; }
    if (Object.keys(picked).length) {
      setStructureCodeClasses(picked);
      // the sets already loaded with those codes take the class too, so one code is not two classes in the project
      surfaceStructures.forEach((set) => {
        if (!(set.rows || []).some((r) => picked[structureCodeKey(r.type)] && r.cls !== picked[structureCodeKey(r.type)])) return;
        updateSurfaceStructureSet(set.id, { rows: set.rows.map((r) => (picked[structureCodeKey(r.type)] ? { ...r, cls: picked[structureCodeKey(r.type)] } : r)) });
      });
    }
    const src = isMineSource(p.sourceEpsg) ? 0 : Number(p.sourceEpsg), dst = Number(project?.epsg);
    let crsNote = "", mineTurned = false; // mineTurned: #2684 — the grid bearings were said as the mine grid's
    const gridTie = tieOf(project); // TASKS.csv #2320 — a local-grid project: a file with a CRS comes into the grid through its tie
    if (isMineSource(p.sourceEpsg)) { // TASKS.csv #2684 — 'Local mine grid (no CRS)': read on the grid, a grid bearing turned by the grid's rotation
      const ms = mineSourceOf(project), T = ms?.kind === "tie" ? mineChoiceToProject(ms, dst) : null;
      const rot = ms?.mg?.tie?.rotationDeg || 0, turn = (d) => Math.round((((d - rot) % 360) + 360) % 360 * 100) / 100;
      if (T) out.rows.forEach((r) => {
        const [x, y] = T(r.x, r.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        r.x = x; r.y = y;
        if (north.ref === "grid" && Number.isFinite(r.dipDir)) { r.dipDir = turn(r.dipDir); if (Number.isFinite(r.strike)) r.strike = turn(r.strike); }
      });
      mineTurned = !!(T && north.ref === "grid");
      crsNote = mineSourceSentence(ms, dst) + (T && north.ref === "grid" && rot ? " " + tr("Dip directions were turned from the mine grid's north to the project grid's ({deg}°).", { deg: (-rot).toFixed(2) }) : "");
    } else if (gridTie && src && src !== dst) {
      let n = 0;
      out.rows.forEach((r) => {
        const t = fileToLocal(gridTie, r.x, r.y, src);
        if (!t) return;
        r.x = t.x; r.y = t.y; n++;
        if (north.ref === "grid" && Number.isFinite(r.dipDir)) { r.dipDir = bearingToLocal(gridTie, r.dipDir); if (Number.isFinite(r.strike)) r.strike = bearingToLocal(gridTie, r.strike); }
      });
      crsNote = " " + tr("{n} brought into the local grid through its tie to EPSG:{tie}.", { n, tie: gridTie.epsg });
    } else if (project?.crsSet === false && project?.localGrid) {
      // a local grid with no tie: the numbers are kept (never 'reprojected' into the placeholder CRS)
    } else if (src && dst && src !== dst) {
      // #547 — a true / magnetic bearing doesn't depend on the CRS: only grid bearings are turned with the grid
      const gridNorth = north.ref === "grid";
      if (!getProj4DefSync(src) || !getProj4DefSync(dst)) { setStructMsg({ ok: false, text: tr("EPSG:{src} isn't a CRS GeoStrix can reproject from — leave it as the project's EPSG:{dst} if the coordinates are already in it.", { src, dst }) }); return; }
      // TASKS.csv #490 — dip directions are relative to the file's grid north: turn them (and the strike, by the
      // same angle) with the convergence difference, as a project CRS change does.
      const T = pointTransform(src, dst);
      let maxTurn = 0;
      out.rows.forEach((r) => {
        const t = reprojectXY(r.x, r.y, src, dst);
        if (!t) return;
        if (gridNorth && Number.isFinite(r.dipDir)) {
          const d = turnGridBearing(T, r.x, r.y, r.dipDir), turn = bearingTurn(r.dipDir, d);
          maxTurn = Math.max(maxTurn, Math.abs(turn));
          if (Number.isFinite(r.strike)) r.strike = Math.round(((r.strike + turn) % 360 + 360) % 360 * 100) / 100;
          r.dipDir = d;
        }
        r.x = t.x; r.y = t.y;
      });
      crsNote = tr(" Reprojected EPSG:{src} → EPSG:{dst}{v}.", { src, dst, v: gridNorth ? tr("; dip directions turned to the project grid (up to {maxTurn}°)", { maxTurn: maxTurn.toFixed(2) }) : "" });
    }
    // TASKS.csv #547 — dip directions / strikes measured from true or magnetic north -> project grid north, per location
    // TASKS.csv #2091 (review #2013) — grid north is the picker's default: said in the notice, so a compass notebook is not imported rotated unseen
    let northNote = north.ref === "grid" && !mineTurned ? tr(" Dip directions were taken as grid north (the project grid); for compass or true-north readings, set North on the import card and import again.") : "", rows = out.rows;
    if (north.ref !== "grid") {
      // TASKS.csv #2262 — dst is the PLACEHOLDER epsg while the CRS is not set (truthy), so this message never showed and the convergence of
      // BC UTM 9N was applied to a WA mine grid: test crsSet too
      if (!dst || project?.crsSet === false) { setStructMsg({ ok: false, text: tr("The project has no coordinate system yet, so true / magnetic north can't be converted to grid north. Choose the project CRS first.") }); return; }
      if (north.ref === "magnetic") { try { await loadIgrf(); } catch { setStructMsg({ ok: false, text: tr("Couldn't load the magnetic field model (IGRF) — nothing was imported.") }); return; } }
      const c = bearingsToGrid(out.rows, north.ref, dst, north.date);
      rows = c.rows;
      northNote = tr(" {converted} dip direction(s) converted from {v} to grid north{v2}.", { converted: c.converted, v: northRefText(north.ref, north.date, c.example), v2: c.failed ? tr("; {failed} could not be converted and were left as they were", { failed: c.failed }) : "" });
    }
    // TASKS.csv #1719 — typed measurements gather in one set per north reference instead of a set each
    const typedSet = p.typed ? surfaceStructures.find((s) => s.typed && s.azimuthRef === north.ref && (north.ref !== "magnetic" || s.azimuthDate === north.date)) : null;
    if (typedSet) updateSurfaceStructureSet(typedSet.id, { rows: [...typedSet.rows, ...rows] });
    else addSurfaceStructureSet({ name: uniqueLayerName(p.name, surfaceStructures) /* #2573 — a second set from one file (true, then magnetic north) is numbered */, rows, ...(p.typed ? {} : { size: defaultDiscSize(rows) }) /* #2412 — sized from the readings' spacing */, snapToTerrain: true, azimuthRef: north.ref, ...(north.ref === "magnetic" ? { azimuthDate: north.date } : {}), ...(p.typed ? { typed: true } : {}) });
    const noZ = out.rows.filter((r) => r.z == null).length;
    // TASKS.csv #2082 — the type codes no class knows: said, so 'Other' on the stereonet is not taken for nothing
    const otherTypes = [...new Set(out.rows.filter((r) => r.cls === "other" && String(r.type || "").trim()).map((r) => String(r.type).trim()))];
    setStructMsg({
      ok: !out.skipped,
      text: tr("Imported {rows} measurement(s) from {name}.", { rows: out.rows.length, name: p.name })
        + (out.skipped ? tr(" Skipped {skipped} row(s): {why}.", { skipped: out.skipped, why: skipReasons(out.skipWhy, out.skipNames) }) : "") // #2093 — each reason apart
        + (out.horizontal ? tr(" {n} horizontal reading(s) (dip 0, no dip direction) kept as flat planes: a cross on the map, a pole at the centre of the stereonet.", { n: out.horizontal }) : "") // #2958
        + (out.derivedFromStrike ? (out.strikeRule === "lhr" ? tr(" {derivedFromStrike} dip direction(s) derived from strike by the left-hand rule (strike − 90°).", { derivedFromStrike: out.derivedFromStrike }) : tr(" {derivedFromStrike} dip direction(s) derived from strike by the right-hand rule.", { derivedFromStrike: out.derivedFromStrike })) : "")
        + (out.fromQuadrant ? tr(" {n} dip direction(s) taken from the strike and the dip quadrant.", { n: out.fromQuadrant }) : "") // #2083
        + (out.quadrantUnread ? tr(" {n} dip quadrant(s) could not be read (not N, NE, E…), so the strike convention was used there.", { n: out.quadrantUnread }) : "")
        + (out.rhrMismatches ? (out.strikeRule === "lhr" ? tr(" {rhrMismatches} row(s) have a strike and dip direction that aren't 90° apart by the left-hand rule — the dip direction was used; check whether those strikes are right-hand-rule.", { rhrMismatches: out.rhrMismatches }) : tr(" {rhrMismatches} row(s) have a strike and dip direction that aren't 90° apart — the dip direction was used; check whether those strikes are left-hand-rule.", { rhrMismatches: out.rhrMismatches })) : "")
        + (noZ ? (terrain ? structNoZText(noZ, structureGroundCounts(out.rows, terrain, terrainGroundAt)) : tr(" {noZ} had no elevation: drawn flat until a terrain is loaded (Maps > Terrain), then placed on it.", { noZ })) : "") // #1448 — they were said to 'sit on the terrain' with none loaded
        + (otherTypes.length ? tr(" Type code(s) {codes} are classed as Other: not a fault, breccia, vein, contact, joint, bedding, foliation or cleavage code GeoStrix knows. Pick a class for each on the import card (kept for this project), or rename them in the file.", { codes: otherTypes.slice(0, 8).join(", ") + (otherTypes.length > 8 ? "…" : "") }) : "") // #2082
        + crsNote + northNote,
    });
    setPendingStruct(null);
  };

  // TASKS.csv #2485 (2) — of the measurements with no elevation, how many found the terrain's ground and how many lie outside it or
  // over its gaps (a TIN's voids, a DEM's no-data), where they are drawn at the terrain's edge or filled level, not on ground
  // TASKS.csv #2753 — since side 6's e3aa5f76 the ones off the terrain or over a gap are drawn flat at the samples' plan elevation (the flatZ the 3D View
  // uses: lib/viewer/surfacePlacement.js surfaceFlatElevation), not at its edge or filled level
  const structNoZText = (noZ, g) => (g.off ? tr(" {noZ} had no elevation: {ground} sit on the terrain; {off} lie outside it or over its gaps and are drawn flat at {z} m, the samples' plan elevation.", { noZ, ground: g.ground, off: g.off, z: Math.round(surfaceFlatElevation(collars, surfaceSamples, collars.length > 1 && collarsLookUnderground(collars, survey).underground)).toLocaleString() }) : tr(" {noZ} had no elevation and sit on the terrain{v}.", { noZ, v: "" }));
  // TASKS.csv #2266 — the pending file's type codes that would be Other (no rule, no class kept for this project), most frequent first
  const unknownCodes = useMemo(() => {
    const col = pendingStruct?.cols?.type;
    if (!col || pendingStruct.typed) return [];
    const m = new Map();
    pendingStruct.rows.forEach((r) => { const k = structureCodeKey(r[col]); if (k && structureClass(k, project?.structureCodeClasses) === "other") m.set(k, (m.get(k) || 0) + 1); });
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [pendingStruct?.rows, pendingStruct?.cols?.type, pendingStruct?.typed, project?.structureCodeClasses]);
  const card = { marginTop: 10, padding: "9px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)" };
  const row = { display: "flex", alignItems: "center", gap: 6, marginTop: 7 };
  const lbl = { color: "var(--color-text-faint)", width: 58, flexShrink: 0 };
  const msgBox = (m) => m && (
    <div style={{ marginTop: 8, padding: "8px 10px", background: m.ok ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${m.ok ? "var(--color-border)" : "var(--color-danger-border)"}`, borderRadius: 6, fontSize: "var(--font-size-base)", color: m.ok ? "var(--color-text-secondary)" : "var(--color-danger-text)", lineHeight: 1.5 }}>{m.text}</div>
  );
  const select = { ...numInput, flex: 1, minWidth: 0 };

  return (
    <>
      {importReview && <MapImportReview rows={importReview.rows} onCancel={() => importReview.resolve(null)} onConfirm={(on) => importReview.resolve(on)} />}
      {part !== "structures" && (<>
      <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>{tr("Map layers")}<InfoButton title={tr("Map layers")} text={tr("Import surface mapping — a geology map, alteration or outcrop polygons, fault traces, sample points — from a GeoPackage (.gpkg), shapefile (.zip, or .shp with its .dbf/.prj), MapInfo TAB (with its .map/.id/.dat) or MIF (with its .mid), GPX, GeoJSON or KML / KMZ and drape it on the terrain in the 3D view, coloured by an attribute. Select a QGIS style (.qml) in the same dialog to reuse your map's colours; otherwise each unit gets its own colour, editable below. Every feature table in a GeoPackage becomes its own layer. Polygons keep their holes and multipart pieces. A layer with a known CRS is reprojected into the project's EPSG ({v}). Mapped contacts between units can be projected underground from the 3D Modelling tab.", { v: project?.epsg ?? "?" })} />
      </div>
      <SourceCrsField
        value={mapSourceEpsg} onChange={(c) => setMapSourceEpsg(c === "" ? "" : String(c))} mineGrid={mineSourceOf(project) /* #2684 */}
        defaultText={project?.crsSet === false ? tr("From the file (.prj / GeoPackage), else the project CRS (not chosen yet)") /* #2262 */ : tr("From the file (.prj / GeoPackage), else the project CRS ({v})", { v: crsName(project?.epsg) || tr("EPSG:{v}", { v: project?.epsg ?? "?" }) })}
        title={tr("Leave it on the file's own CRS. Change it when a shapefile has no .prj or a wrong one.")}
      />
      <button onClick={() => mapInput.current.click()} style={pBtn} disabled={busy} title={tr("Formats: GeoPackage, shapefile (.zip / .shp), MapInfo .tab / .mif, .gpx, .geojson, .kml")}>
        <MapIcon size={14} /> {busy ? tr("Importing…") : tr("Import map layer…")}
      </button>
      <input ref={mapInput} type="file" accept=".gpkg,.zip,.shp,.dbf,.prj,.shx,.cpg,.qml,.tab,.map,.id,.dat,.mif,.mid,.gpx,.geojson,.json,.kml,.kmz" multiple style={{ display: "none" }}
        onChange={(e) => { importMaps(e.target.files); e.target.value = ""; }} />
      <input ref={qmlInput} type="file" accept=".qml" style={{ display: "none" }}
        onChange={(e) => { applyQmlToLayer(e.target.files[0]); e.target.value = ""; }} />
      {/* TASKS.csv #1719 (review #1645, Copley) — the collars' top-of-hole lithology as a starting map */}
      {collars.length > 0 && (layers.litho || []).length > 0 && (
        <button onClick={() => makeSubcrop()} style={{ ...pBtn, marginTop: 6 }} title={tr("A point map layer at each hole: the first logged unit under its overburden, casing or no recovery, coloured like the logs. It lists the hole and the depth of cover in its attributes.")}>
          <MapIcon size={14} /> {tr("Subcrop from collars")}
        </button>
      )}
      {collars.length > 0 && (layers.litho || []).length > 0 && ( /* TASKS.csv #2956 — or the unit at a depth down each hole */
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
          <span>{tr("Unit at")}</span>
          <input type="number" min={0} value={subDepth} onChange={(e) => setSubDepth(e.target.value)} placeholder={tr("under cover")} aria-label={tr("Depth below the collar for the subcrop, m (blank: the first unit under the cover)")} style={{ ...numInput, width: 90 }} />
          <span>{tr("m down each hole")}</span>
        </div>
      )}
      {msgBox(mapMsg)}
      {subcropCard && mapLayers.some((l) => l.name === subcropCard.name) && (() => { /* TASKS.csv #2956 — what the holes start in, cover, outlines */
        const layer = mapLayers.find((l) => l.name === subcropCard.name);
        const starts = holeStartCodes({ collars, litho: layers.litho, roleOf: roleWithCodes(modellingCodes) }), total = starts.reduce((a, c) => a + c.holes, 0) || 1;
        return (
          <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
            <div style={{ marginBottom: 4 }}>{tr("What the holes start in (the first logged code at the collar). Tick the codes that are cover and make it again: the map then shows the first unit under them. A tick sets the code's role to overburden, as 3D Modelling > Modelling codes does.")}</div>
            {starts.slice(0, 10).map((c) => (
              <label key={c.code} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={c.role === "overburden" || c.role === "no recovery"} onChange={(e) => setCoverRole(c.code, e.target.checked)} aria-label={tr("{code} is cover", { code: c.code })} />
                <span style={{ flex: 1 }}>{c.code}</span><span>{tr("{n} hole(s), {p}%", { n: c.holes, p: Math.round((100 * c.holes) / total) })}</span>
              </label>
            ))}
            {starts.length > 10 && <div>{tr("…and {n} more code(s): all of them are in 3D Modelling > Modelling codes.", { n: starts.length - 10 })}</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button onClick={() => makeSubcrop(layer)} style={{ ...pBtn, marginBottom: 0, flex: 1, justifyContent: "center" }}>{tr("Make it again")}</button>
              {subcropCard.depth == null && <button onClick={() => changeStyleField(layer, "cover_m")} style={{ ...pBtn, marginBottom: 0, flex: 1, justifyContent: "center" }}>{tr("Colour by depth of cover")}</button>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <span>{tr("Outline the units out to")}</span>
              <input type="number" min={1} value={subcropCard.reach} onChange={(e) => setSubcropCard((c) => ({ ...c, reach: e.target.value }))} aria-label={tr("Outline distance from the holes, m")} style={{ ...numInput, width: 70 }} />
              <span>{tr("m from a hole")}</span>
              <button onClick={outlineSubcrop} title={tr("A polygon map: each hole's nearest-hole area, cut back to this distance from the hole, with the unit of its point. Model it can build from it.")} style={{ ...pBtn, marginBottom: 0, width: "auto" }}>{tr("Outline")}</button>
            </div>
          </div>
        );
      })()}
      {mapLayers.map((l) => {
        const legendOpen = !!openLegend[l.id];
        return (
          <div key={l.id} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateMapLayer(l.id, { visible: l.visible === false })} style={{ cursor: "pointer", color: l.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                {l.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${l.name}\n${l.crsNote || ""}`}>{l.name}</div>
              <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>{featureCountText(l.features.length, l.geomType) /* #1448 — was '710 polygon' */}</span>
              {Array.isArray(l.bbox) && l.bbox.every(Number.isFinite) && <Crosshair role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} /* TASKS.csv #2793 — as Maps' raster / boundary / claim cards (#2657) */
                aria-label={tr("Zoom the plan to \"{name}\"", { name: l.name })} title={tr("Zoom the plan to \"{name}\"", { name: l.name })} onClick={() => { goToModule("maps"); requestPlanZoom(l.bbox); }} />}
              <Trash2 aria-label={tr("Remove map layer \"{name}\"", { name: l.name })} title={tr("Remove map layer \"{name}\"", { name: l.name })} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(tr("Remove \"{name}\"?", { name: l.name }))) removeMapLayer(l.id); }} />
            </div>
            <label style={{ ...row, cursor: terrain ? "pointer" : "default", opacity: terrain ? 1 : 0.45 }}>
              <input type="checkbox" checked={l.drapeMode === "terrain" && !!terrain} disabled={!terrain} title={!terrain && l.drapeMode === "terrain" ? tr("Flat for now: it drapes on the terrain once one is loaded.") : undefined} /* #1606 */
                onChange={(e) => updateMapLayer(l.id, { drapeMode: e.target.checked ? "terrain" : "flat" })} />
              <span style={{ color: "var(--color-text-caption)" }}>{tr("Drape on terrain{v}", { v: !terrain ? tr(" (import or fetch a DEM first, or offline: Geophysics > Block models > Terrain from the model's top)") /* #1824 */ : "" })}</span>
            </label>
            {l.hasZ && !(l.drapeMode === "terrain" && terrain) && ( /* TASKS.csv #1601 - a polygon: outlines only (a drape is a flat picture) */
              <label style={{ ...row, cursor: "pointer" }}>
                <input type="checkbox" checked={l.drapeMode === "file"} onChange={(e) => updateMapLayer(l.id, { drapeMode: e.target.checked ? "file" : "flat" })} />
                <span style={{ color: "var(--color-text-caption)" }}>{l.geomType === "polygon" ? tr("Outlines at the file's own elevations") : tr("At the file's own elevations")}</span>
              </label>
            )}
            {!(l.drapeMode === "terrain" && terrain) && l.drapeMode !== "file" && (
              <div style={row}>
                <span style={lbl}>{tr("Elev.")}</span>
                <input type="number" value={Math.round(l.elevation || 0)} onChange={(e) => updateMapLayer(l.id, { elevation: Number(e.target.value) })} style={numInput} />
              </div>
            )}
            <div style={row}>
              <span style={lbl}>{tr("Opacity")}</span>
              <input type="range" min={0.05} max={1} step={0.05} value={l.opacity ?? 0.6} onChange={(e) => updateMapLayer(l.id, { opacity: Number(e.target.value) })} style={{ flex: 1 }} />
              <span style={{ color: "var(--color-text-muted)", width: 30, textAlign: "right" }}>{Math.round((l.opacity ?? 0.6) * 100)}%</span>
            </div>
            {l.fields.length > 0 && (
              <div style={row}>
                <span style={lbl}>{tr("Colour by")}</span>
                <select value={l.styleField || ""} onChange={(e) => changeStyleField(l, e.target.value)} style={select}>
                  {l.fields.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <button title={tr("Apply a QGIS .qml style to this layer")} onClick={() => { qmlTargetRef.current = l.id; qmlInput.current.click(); }}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 7px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)", cursor: "pointer", flexShrink: 0 }}>
                  <Palette size={12} />{" "}{tr(".qml")}</button>
              </div>
            )}
            {l.styleBreaks?.length > 0 && ( /* TASKS.csv #1600 - graduated classes, breaks typed lowest first */
              <div style={row}>
                <span style={lbl}>{tr("Classes")}</span>
                <input key={l.styleBreaks.join(",")} defaultValue={l.styleBreaks.join(", ")} onBlur={(e) => setBreaks(l, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  title={tr("Class breaks, lowest first (e.g. 0.1, 0.5, 1, 5): each class runs from one break up to the next")} aria-label={tr("Class breaks")} style={select} />
                <button onClick={() => eachValue(l)} title={tr("One colour per distinct value instead of classes")} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 7px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)", cursor: "pointer", flexShrink: 0 }}>{tr("Each value")}</button>
              </div>
            )}
            {!l.styleBreaks?.length && l.categories?.length > 12 && isNumericField(l.features, l.styleField) && ( /* #1600 */
              <div style={row}>
                <span style={lbl} />
                <button onClick={() => changeStyleField(l, l.styleField)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 7px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)", cursor: "pointer", flexShrink: 0 }}>{tr("Graduated classes")}</button>
              </div>
            )}
            {l.geomType === "polygon" && (
              <label style={{ ...row, cursor: "pointer" }}>
                <input type="checkbox" checked={l.showOutlines !== false} onChange={(e) => updateMapLayer(l.id, { showOutlines: e.target.checked })} />
                <span style={{ color: "var(--color-text-caption)" }}>{tr("Polygon outlines")}</span>
              </label>
            )}
            {l.categories?.length > 0 && (
              <>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setOpenLegend((p) => ({ ...p, [l.id]: !legendOpen }))} style={{ ...row, cursor: "pointer", color: "var(--color-text-secondary)" }}>
                  {legendOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>{l.styleBreaks?.length ? tr("Legend ({n} classes)", { n: l.categories.length }) : tr("Legend ({categories} {v})", { categories: l.categories.length, v: tr(l.categories.length === 1 ? "unit" : "units") })}</span>
                  {!legendOpen && (
                    <span style={{ display: "flex", gap: 2, marginLeft: "auto", overflow: "hidden" }}>
                      {l.categories.slice(0, 14).map((c) => <span key={String(c.value)} style={{ width: 9, height: 9, borderRadius: 2, background: c.color, opacity: c.visible === false ? 0.25 : 1, flexShrink: 0 }} />)}
                    </span>
                  )}
                </div>
                {legendOpen && (
                  <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 3 }}>
                    {/* TASKS.csv #2005 — units named by age ('Late Jurassic') in the international time scale's colours, from Macrostrat */}
                    <button type="button" style={{ ...pBtn, padding: "2px 6px", width: "auto", fontSize: "var(--font-size-xs)", marginBottom: 4 }} title={tr("Colour the units whose name gives an age (Late Jurassic, Eocene ...) in the international time scale's colours (Macrostrat, CC BY 4.0, included with GeoStrix: no internet needed). The others keep their colours.")}
                      onClick={async () => {
                        try {
                          const { bundledTimeScaleIntervals, timeScaleColours } = await import("../lib/macrostratColours.js"); // #2690 — bundled, offline
                          const hits = timeScaleColours(l.categories.map((c) => ({ value: c.value, label: c.label })), await bundledTimeScaleIntervals());
                          const byValue = new Map(hits.map((h) => [h.value, h.color]));
                          updateMapLayer(l.id, (cur) => ({ categories: cur.categories.map((x) => (byValue.has(x.value) ? { ...x, color: byValue.get(x.value) } : x)) }));
                          setMapMsg({ ok: true, text: tr("\"{name}\": {n} of {total} units coloured by the time scale (Macrostrat, CC BY 4.0); the others keep their colours.", { name: l.name, n: hits.length, total: l.categories.length }) });
                        } catch (e) { setMapMsg({ ok: false, text: tr("Macrostrat: {message}", { message: e.message }) }); } // #2415; offline since #2690
                      }}>{tr("Time-scale colours")}</button>{/* TASKS.csv #2690: bundled, so no '(online)' (#2415) */}
                    {l.categories.map((c, ci) => (
                      <div key={String(c.value)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked={c.visible !== false} title={tr("Show this unit")}
                          onChange={(e) => updateMapLayer(l.id, (cur) => ({ categories: cur.categories.map((x, xi) => xi === ci ? { ...x, visible: e.target.checked } : x) }))} />
                        <input type="color" value={/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : "#999999"}
                          onChange={(e) => updateMapLayer(l.id, (cur) => ({ categories: cur.categories.map((x, xi) => xi === ci ? { ...x, color: e.target.value } : x) }))}
                          style={{ width: 22, height: 18, padding: 0, border: "1px solid var(--color-border)", borderRadius: 3, background: "transparent", flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--font-size-sm)" }} title={c.label}>{c.label}</span>
                        {c.count != null && <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>{c.count}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {l.crsNote && <div style={{ marginTop: 6, color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>{l.crsNote}</div>}
          </div>
        );
      })}

      {part === "maps" && <CoveringLayers />}{/* TASKS.csv #1823 — in the Geology map pane; the tab's home has 'On the map' (#1597) */}
      </>)}
      {part !== "maps" && (<>
      <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>{tr("Surface structures")}<InfoButton title={tr("Surface structures")} text={tr("Import outcrop structural measurements from a CSV or a MapInfo point table (TAB or MIF) — easting, northing, optional elevation, dip, and dip direction and/or strike (right-hand rule), plus a structure type and comments if present. Each measurement is drawn in the 3D view as a disc lying in the measured plane, coloured by type (fault, bedding, foliation, vein, joint, contact…). Rows without an elevation sit on the terrain. These measurements are what the 3D Modelling tab uses to set the dip when projecting mapped contacts underground.")} />
      </div>
      {!terrain && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 8 }}>{tr("No terrain yet: make one in Maps > Terrain (fetch one, import a DEM, or offline from points, or from the project's samples and collars). Map layers and measurements then sit on the ground.")}</div>}{/* TASKS.csv #1719 */}
      <button onClick={() => structInput.current.click()} style={pBtn} title={tr("Formats: .csv, MapInfo .tab / .mif")}>
        <Compass size={14} />{" "}{tr("Import structure measurements…")}</button>
      <div style={{ display: "flex", gap: 6, marginTop: -2, marginBottom: 8 }}>{/* TASKS.csv #1719 — start mapping without a file */}
        <button onClick={() => setTyping((t) => (t ? null : {}))} style={{ ...pBtn, marginBottom: 0, flex: 1, justifyContent: "center" }} aria-expanded={!!typing}>{tr("Add a measurement")}</button>
        <button onClick={() => saveFile({ quiet: "success", suggestedName: "outcrop_measurements_template.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: "Station,Easting,Northing,Elevation,Type,Dip,Dip direction,Comments\r\n" })}
          title={tr("A CSV with the column headers this importer reads, to fill in a spreadsheet")} style={{ ...pBtn, marginBottom: 0, flex: 1, justifyContent: "center" }}>{tr("Template CSV")}</button>
      </div>
      {typing && (
        <div style={card}>
              <div key="station" style={row}><span style={lbl}>{tr("Station")}</span><input type="text" value={typing.station ?? ""} onChange={(e) => setTyping((p) => ({ ...p, station: e.target.value }))} placeholder={tr("optional")} aria-label={tr("Station")} style={select} /></div>
              <div key="x" style={row}><span style={lbl}>{tr("Easting")}</span><input type="number" value={typing.x ?? ""} onChange={(e) => setTyping((p) => ({ ...p, x: e.target.value }))} placeholder={""} aria-label={tr("Easting")} style={select} /></div>
              <div key="y" style={row}><span style={lbl}>{tr("Northing")}</span><input type="number" value={typing.y ?? ""} onChange={(e) => setTyping((p) => ({ ...p, y: e.target.value }))} placeholder={""} aria-label={tr("Northing")} style={select} /></div>
              <div key="z" style={row}><span style={lbl}>{tr("Elevation")}</span><input type="number" value={typing.z ?? ""} onChange={(e) => setTyping((p) => ({ ...p, z: e.target.value }))} placeholder={tr("optional")} aria-label={tr("Elevation")} style={select} /></div>
              <div key="type" style={row}><span style={lbl}>{tr("Type")}</span><input type="text" value={typing.type ?? ""} onChange={(e) => setTyping((p) => ({ ...p, type: e.target.value }))} placeholder={tr("optional")} aria-label={tr("Type")} style={select} /></div>
              <div key="dip" style={row}><span style={lbl}>{tr("Dip")}</span><input type="number" value={typing.dip ?? ""} onChange={(e) => setTyping((p) => ({ ...p, dip: e.target.value }))} placeholder={""} aria-label={tr("Dip")} style={select} /></div>
              <div key="dipDir" style={row}><span style={lbl}>{tr("Dip direction")}</span><input type="number" value={typing.dipDir ?? ""} onChange={(e) => setTyping((p) => ({ ...p, dipDir: e.target.value }))} placeholder={""} aria-label={tr("Dip direction")} style={select} /></div>
              <div key="comment" style={row}><span style={lbl}>{tr("Comments")}</span><input type="text" value={typing.comment ?? ""} onChange={(e) => setTyping((p) => ({ ...p, comment: e.target.value }))} placeholder={tr("optional")} aria-label={tr("Comments")} style={select} /></div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={() => {
              const n = (v) => (String(v ?? "").trim() === "" ? NaN : Number(String(v).replace(",", ".")));
              // TASKS.csv #2958 — a horizontal reading (dip 0) needs no dip direction
              if (![typing.x, typing.y, typing.dip].every((v) => Number.isFinite(n(v))) || !(Number.isFinite(n(typing.dipDir)) || n(typing.dip) === 0)) { setStructMsg({ ok: false, text: tr("Type at least the easting, northing, dip and dip direction (a horizontal reading, dip 0, needs no direction).") }); return; }
              // TASKS.csv #2974 (6) — the ranges checked here, the value named: dip 95 / dip direction 400 went to the card, whose Import then said
              // only 'No rows had usable coordinates and dip.'
              if (!(n(typing.dip) >= 0 && n(typing.dip) <= 90)) { setStructMsg({ ok: false, text: tr("The dip must be from 0 to 90° (typed: {v}).", { v: typing.dip }) }); return; }
              if (Number.isFinite(n(typing.dipDir)) && !(n(typing.dipDir) >= 0 && n(typing.dipDir) <= 360)) { setStructMsg({ ok: false, text: tr("The dip direction must be from 0 to 360° (typed: {v}).", { v: typing.dipDir }) }); return; }
              const headers = ["Station", "Easting", "Northing", "Elevation", "Type", "Dip", "Dip direction", "Comments"];
              const rowObj = { Station: typing.station || "", Easting: typing.x, Northing: typing.y, Elevation: typing.z || "", Type: typing.type || "", Dip: typing.dip, "Dip direction": typing.dipDir, Comments: typing.comment || "" };
              setPendingStruct({ name: "Typed measurements", typed: true, rows: [rowObj], headers, cols: { x: "Easting", y: "Northing", z: Number.isFinite(n(typing.z)) ? "Elevation" : null, dip: "Dip", dipDir: "Dip direction", strike: null, type: "Type", station: "Station", comment: "Comments" }, sourceEpsg: project?.epsg ? String(project.epsg) : "" });
              setTyping(null); setStructMsg(null);
            }} style={{ ...pBtn, marginBottom: 0, justifyContent: "center" }}>{tr("Check and add")}</button>
            <button onClick={() => setTyping(null)} style={{ ...pBtn, marginBottom: 0, justifyContent: "center" }}>{tr("Cancel")}</button>
          </div>
        </div>
      )}
      <input ref={structInput} type="file" accept=".csv,.txt,.tab,.map,.id,.dat,.mif,.mid" multiple style={{ display: "none" }}
        onChange={(e) => { readStructCsv(e.target.files); e.target.value = ""; }} />
      {pendingStruct && (
        <div style={card}>
          <div style={{ color: "var(--color-text)", marginBottom: 4 }}>{tr("{name}: {rows} rows — check the columns", { name: pendingStruct.name, rows: pendingStruct.rows.length })}</div>
          {[["x", tr("Easting")], ["y", tr("Northing")], ["z", tr("Elevation")], ["dip", tr("Dip")], ["dipDir", tr("Dip dir.")], ["strike", tr("Strike")], ["dipQuad", tr("Dip quadrant")], ["type", tr("Type")], ["station", tr("Station")], ["comment", tr("Comments")]].map(([k, label]) => ( /* station: #1442; dipQuad: #2083 */
            <div key={k} style={row}>
              <span style={lbl}>{label}</span>
              <select value={pendingStruct.cols[k] || ""} onChange={(e) => setPendingStruct((p) => ({ ...p, cols: { ...p.cols, [k]: e.target.value || null } }))} style={select}>
                <option value="">{tr("(none)")}</option>
                {pendingStruct.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
          {pendingStruct.cols.strike && ( /* TASKS.csv #2083 — how a strike becomes a dip direction where the file gives none */
            <div style={row} title={tr("Used for rows with a strike and no dip direction (and no dip quadrant). Right-hand rule: the plane dips to the right of the strike, dip direction = strike + 90°. Left-hand rule: to the left, strike − 90°.")}>
              <span style={lbl}>{tr("Strikes")}</span>
              <select value={pendingStruct.cols.strikeRule || "rhr"} onChange={(e) => setPendingStruct((p) => ({ ...p, cols: { ...p.cols, strikeRule: e.target.value } }))} style={select} aria-label={tr("Strike convention")}>
                <option value="rhr">{tr("Right-hand rule (dip direction = strike + 90°)")}</option>
                <option value="lhr">{tr("Left-hand rule (dip direction = strike − 90°)")}</option>
              </select>
            </div>
          )}
          <SourceCrsField
            value={pendingStruct.sourceEpsg ?? ""} onChange={(c) => setPendingStruct((p) => ({ ...p, sourceEpsg: c === "" ? "" : String(c) }))} mineGrid={mineSourceOf(project) /* #2684 */}
            defaultText={project?.crsSet === false ? tr("The project CRS — not chosen yet") /* #2262 */ : tr("Same as project — {v}", { v: crsName(project?.epsg) || tr("EPSG:{v}", { v: project?.epsg ?? "?" }) })}
            title={tr("The CRS of this file's easting/northing. It is reprojected into the project CRS on import.")}
          />
          <AzimuthRefPicker value={pendingStruct.north} onChange={(n) => setPendingStruct((p) => ({ ...p, north: n }))} selectStyle={select} labelStyle={lbl} rowStyle={row} />
          {unknownCodes.length > 0 && ( /* TASKS.csv #2266 — a class for each type code no rule knows, in place of 'rename them in the file' */
            <div style={{ marginTop: 7 }}>
              <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", lineHeight: 1.4 }}>{tr("Type codes GeoStrix doesn't know would be classed Other. Pick a class for each (kept for this project):")}</div>
              {unknownCodes.slice(0, 12).map(([code, n]) => (
                <div key={code} style={row}>
                  <span style={{ ...lbl, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={code}>{code} ({n})</span>
                  <select value={pendingStruct.codeClasses?.[code] || "other"} onChange={(e) => setPendingStruct((p) => ({ ...p, codeClasses: { ...(p.codeClasses || {}), [code]: e.target.value } }))} style={select} aria-label={tr("Class for code {code}", { code })}>
                    {STRUCTURE_CLASSES.map((c) => <option key={c} value={c}>{tr(STRUCTURE_CLASS_LABELS[c])}</option>)}
                  </select>
                </div>
              ))}
              {unknownCodes.length > 12 && <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>{tr("and {n} more code(s)", { n: unknownCodes.length - 12 })}</div>}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
            <button onClick={commitStructs} style={{ ...pBtn, marginBottom: 0, justifyContent: "center" }}>{tr("Import")}</button>
            <button onClick={() => { setPendingStruct(null); setStructMsg(null); /* #1722 — the column check's message goes with it */ }} style={{ ...pBtn, marginBottom: 0, justifyContent: "center" }}>{tr("Cancel")}</button>
          </div>
        </div>
      )}
      {msgBox(structMsg)}
      {surfaceStructures.map((s) => {
        // #3066 — one line per structure type (the file's own type words; a row with none goes under its class)
        const types = new Map();
        s.rows.forEach((r) => { const k = typeKey(r.type || r.cls); const e = types.get(k) || { name: String(r.type || "").trim() || tr(STRUCTURE_CLASS_LABELS[r.cls] || r.cls), type: r.type || r.cls, cls: r.cls, n: 0 }; e.n++; types.set(k, e); });
        return (
          <div key={s.id} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateSurfaceStructureSet(s.id, { visible: s.visible === false })} style={{ cursor: "pointer", color: s.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                {s.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
              <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }} title={s.azimuthRef && s.azimuthRef !== "grid" ? tr(s.azimuthRef === "magnetic" ? "Measured from magnetic north{v}; converted to grid north at import" : "Measured from true north{v}; converted to grid north at import", { v: s.azimuthDate ? tr(" on {date}", { date: s.azimuthDate }) : "" }) : tr("Dip directions in project grid north")}>{s.rows.length}{s.azimuthRef === "magnetic" ? " · MN" : s.azimuthRef === "true" ? " · TN" : ""}</span>
              <select value="" onChange={(e) => { const f = e.target.value; e.target.value = ""; if (f) exportStructSet(s, f); }} aria-label={tr("Export structure set \"{name}\"", { name: s.name })} title={tr("Export: dip, dip direction and strike (right-hand rule) in grid and true north")} style={{ ...select, width: "auto", flexShrink: 0, padding: "1px 2px", fontSize: "var(--font-size-xs)" }}>
                <option value="">{tr("Export…")}</option><option value="gpkg">GeoPackage</option><option value="kml">{tr("KMZ (Google Earth, with strike symbols)") /* #2681 */}</option><option value="csv">CSV</option>
              </select>
              <Trash2 aria-label={tr("Remove structure set \"{name}\"", { name: s.name })} title={tr("Remove structure set \"{name}\"", { name: s.name })} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(tr("Remove \"{name}\"?", { name: s.name }))) { removeSurfaceStructureSet(s.id); setStructMsg(null); /* #2573 — its import notice goes with it */ } }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 7 }}>{/* #3066 — the symbol of each type, and the choice of it */}
              {[...types].map(([k, t]) => { const fam = familyFor(t.type, t.cls, symbolChoices), sym = SYMBOLS[FAMILIES[fam].inclined]; return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
                  <span title={tr("FGDC {n}: {name}", { n: sym.fgdc, name: sym.name })} style={{ display: "flex", flexShrink: 0, background: "#fff", borderRadius: 3 }} dangerouslySetInnerHTML={{ __html: symbolSvg(sym, { px: 22, color: STRUCTURE_CLASS_COLORS[t.cls] || "#333" }) }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name} {t.n}</span>
                  <select value={fam} onChange={(e) => setTypeSymbol(k, e.target.value)} aria-label={tr("Symbol for {type}", { type: t.name })} title={tr("The USGS (FGDC) symbol for {type}: each reading takes its inclined, vertical or horizontal form by its own dip. Kept with the project.", { type: t.name })} style={{ ...select, flex: "none", maxWidth: 150 }}>
                    {Object.entries(FAMILIES).map(([id, f]) => <option key={id} value={id}>{tr(f.label)}</option>)}
                  </select>
                </div>
              ); })}
            </div>
            <div style={row}>
              <span style={lbl} title={tr("The length of the symbol's strike line on the ground (the 5.0 mm of the USGS standard); its other parts scale with it")}>{tr("Symbol size")}</span>{/* #3066: discs are for drillhole structures */}
              <input type="range" min={5} max={discSizeMax(s.rows, s.size) /* #2412 — grows with the set's extent */} step={5} value={s.size ?? 25} onChange={(e) => updateSurfaceStructureSet(s.id, { size: Number(e.target.value) })} style={{ flex: 1 }} />
              <span style={{ color: "var(--color-text-muted)", width: 40, textAlign: "right" }}>{s.size ?? 25} m</span>
            </div>
            <label style={{ ...row, cursor: terrain ? "pointer" : "default", opacity: terrain ? 1 : 0.45 }}>
              <input type="checkbox" checked={s.snapToTerrain !== false} disabled={!terrain} onChange={(e) => updateSurfaceStructureSet(s.id, { snapToTerrain: e.target.checked })} />
              <span style={{ color: "var(--color-text-caption)" }} title={tr("GPS elevations are often tens of metres off the DEM; snapping sits every symbol on the ground. Off: rows with a recorded elevation use it.")}>{tr("Sit every measurement on the terrain")}</span>
            </label>
            <label style={{ ...row, cursor: "pointer" }}>{/* TASKS.csv #1443 — the dip beside each symbol, the map convention */}
              <input type="checkbox" checked={s.labels === "dip"} onChange={(e) => updateSurfaceStructureSet(s.id, { labels: e.target.checked ? "dip" : "none" })} />
              <span style={{ color: "var(--color-text-caption)" }} title={tr("The dip, in degrees, beside each symbol in the 3D view; labels that would overprint are hidden until you zoom in.")}>{tr("Dip labels")}</span>
            </label>
          </div>
        );
      })}
      </>)}
    </>
  );
}
