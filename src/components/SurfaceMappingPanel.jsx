// TASKS.csv #316/#317 — sidebar panel (Geophysics & GIS module) for surface mapping data:
//   * Map layers: GeoPackage / shapefile polygons, lines or points, styled by an attribute (optionally
//     from a QGIS .qml picked in the same dialog), draped on the terrain in the 3D view.
//   * Surface structures: outcrop strike/dip CSVs rendered as dip symbols on the terrain.
// Its own component rather than more inline JSX in GeophysicsModule (already ~1,500 lines); it talks
// to the store directly, the same way AddWebLayerModal does.
import React, { useRef, useState } from "react";
import SourceCrsField from "../components/SourceCrsField.jsx"; // TASKS.csv #488
import AzimuthRefPicker from "./AzimuthRefPicker.jsx"; // TASKS.csv #547
import { bearingsToGrid, northRefText, loadIgrf } from "../lib/azimuthRef.js";
import Papa from "papaparse";
import { Eye, EyeOff, Trash2, Map as MapIcon, Compass, ChevronDown, ChevronRight, Palette } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import InfoButton from "./InfoButton.jsx";
import { parseShapefileZip, parseShapefileParts, listZipNames, readZipEntries } from "../lib/shapefile.js";
import { parseGeoPackage } from "../lib/gpkg.js";
import { guessEpsgFromPrjWkt, reprojectXY, getProj4DefSync, crsName, pointTransform, turnGridBearing, bearingTurn } from "../lib/reproject.js";
import { buildLayer, findField, autoColorFor, projectClipBox } from "../lib/mapLayerBuild.js"; // TASKS.csv #609 — shared with the 3D-view drop
import { askAdoptCrs } from "../lib/adoptCrs.js"; // TASKS.csv #607
import {
  parseQmlStyle, autoCategories, applyQmlToCategories,
  guessStructureColumns, parseStructureRows, STRUCTURE_CLASS_COLORS, STRUCTURE_CLASS_LABELS,
} from "../lib/mapLayers.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { featureCountText } from "../lib/featureCount.js"; // TASKS.csv #1116
import MapImportReview from "./MapImportReview.jsx"; // TASKS.csv #1325
import { classifyTables, needsImportReview, isCoveringPolygon } from "../lib/mapImportReview.js";
import { CATEGORICAL_SAFE_COLORS } from "../lib/layers.js";
import { saveFile } from "../lib/desktop.js";
import { ensureExportCrs } from "../lib/projectCrsRequest.js"; // TASKS.csv #1021
import { toExportCsv } from "../lib/tabular.js";
import { checkGpkgSize } from "../lib/gpkgSize.js"; // TASKS.csv #1716
import { readGeoPackageNear, GPKG_IN_PLACE_BYTES } from "../lib/gpkgInPlace.js"; // TASKS.csv #1716
import { canReadGpkgInPlace } from "../lib/desktop.js";

export default function SurfaceMappingPanel({ pBtn, numInput, part = null }) { // part: "maps" | "structures" | null = both (TASKS.csv #458)
  const {
    project, terrain, projectIsEmpty, setEpsg, // #607
    mapLayers, addMapLayer, updateMapLayer, removeMapLayer,
    surfaceStructures, addSurfaceStructureSet, updateSurfaceStructureSet, removeSurfaceStructureSet,
  collars = [], /* #1325 */ surfaceSamples = [], /* #1715 */ } = useStore();
  const mapInput = useRef(null);
  const qmlInput = useRef(null);
  const qmlTargetRef = useRef(null);
  const structInput = useRef(null);
  const [mapMsg, setMapMsg] = useState(null);
  const [structMsg, setStructMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openLegend, setOpenLegend] = useState({});
  const [pendingStruct, setPendingStruct] = useState(null); // { name, rows, headers, cols }
  const [mapSourceEpsg, setMapSourceEpsg] = useState(""); // #488 — "" = the file's own CRS

  // TASKS.csv #1025 (review #1016, structural geologist) — an outcrop set back out: GeoPackage (POINT Z), KML (the icon
  // turned to the true strike, the dip as its name) or CSV, with dip, dip direction and right-hand-rule strike in grid
  // and true north (they are stored in grid north since #547)
  const exportStructSet = async (s, fmt) => {
    try {
      const epsg = await ensureExportCrs(project); if (!epsg) return;
      const ox = await import("../lib/overlayExport.js");
      const { sampleTerrainElevation } = await import("../lib/viewer/geomath.js");
      const zAt = terrain ? (x, y) => sampleTerrainElevation(terrain, x, y) : null; // #1206
      const base = (s.name || "structures").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase() || "structures";
      let res;
      if (fmt === "csv") res = await saveFile({ quiet: "success", suggestedName: `${base}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(ox.surfaceStructureRows(s, epsg, zAt)), encoding: "text" });
      else if (fmt === "kml") {
        const toLonLat = await ox.lonLatTransform(epsg);
        if (!toLonLat) throw new Error(tr("EPSG:{epsg} cannot be converted to latitude / longitude.", { epsg }));
        const kml = ox.featuresToKml(ox.surfaceStructureFeatures(s, epsg, zAt), { name: s.name, toLonLat, nameOf: (f) => (f.attributes.dip !== "" ? `${Math.round(f.attributes.dip)}°` : ""), colorOf: (f) => STRUCTURE_CLASS_COLORS[f.attributes.cls] || "#555555", headingOf: (f) => (f.attributes.strike_rhr_true !== "" ? f.attributes.strike_rhr_true : null) });
        res = await saveFile({ quiet: "success", suggestedName: `${base}.kml`, filters: [{ name: "KML", extensions: ["kml"] }], content: kml });
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
    let projectEpsg = project?.epsg, empty = projectIsEmpty; // #607 — the first layer of an empty project may set its CRS
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
      const adopted = wgs84 ? null : askAdoptCrs({ isEmpty: empty, currentEpsg: projectEpsg, declaredEpsg: mapSourceEpsg || parsed.epsg, fileName: sourceName });
      if (adopted) { setEpsg(adopted); projectEpsg = adopted; done.push(tr("project CRS set to EPSG:{epsg}", { epsg: adopted })); }
      empty = false;
      // #1715 — clipped to the project area (collars, surface samples) when there is one
      let layer = buildLayer(parsed, { sourceName, projectEpsg, qml, sourceOverride: mapSourceEpsg, clipTo: projectClipBox([...(collars || []), ...(surfaceSamples || [])]) });
      if (layer?.outside) { failed.push(tr("{name}: none of its {n} features comes within reach of the project's holes and samples, so nothing was imported (check its CRS if it should).", { name: sourceName, n: layer.outside.toLocaleString() })); return; }
      if (!layer) { failed.push(tr("{name}: no usable features", { name: `${sourceName}${parsed.name ? ` (${parsed.name})` : ""}` })); return; }
      // #1325 — a layer with no units to tell apart gets a colour of its own: a batch used to be one amber
      if (!qml && layer.categories.length <= 1) { const color = CATEGORICAL_SAFE_COLORS[colourAt % CATEGORICAL_SAFE_COLORS.length]; layer = { ...layer, color, categories: layer.categories.map((c) => ({ ...c, color })) }; }
      colourAt++;
      if (!qml && isCoveringPolygon(layer.name, layer.geomType)) layer = { ...layer, opacity: 0.08, showOutlines: true }; // #1325
      layersAdded++;
      addMapLayer({ ...layer, drapeMode: terrain ? "terrain" : "flat" });
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
          const near = f.size > GPKG_IN_PLACE_BYTES && canReadGpkgInPlace()
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
        if (!g.map || !g.id) { tableOnly.push(g.name); continue; }
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
      const byTable = new Map();
      for (const q of queued) (byTable.get(q.sourceName) || byTable.set(q.sourceName, { name: q.sourceName, epsg: mapSourceEpsg ? Number(mapSourceEpsg) : q.opts.wgs84 ? 4326 : Number(q.parsed.epsg) || null, layers: [], items: [] }).get(q.sourceName));
      for (const q of queued) { const t = byTable.get(q.sourceName); t.layers.push(q.parsed); t.items.push(q); if (!t.epsg && q.parsed.epsg) t.epsg = Number(q.parsed.epsg); }
      const tables = [...byTable.values()];
      const counts = new Map();
      tables.forEach((t) => { if (t.epsg) counts.set(t.epsg, (counts.get(t.epsg) || 0) + 1); });
      const common = Number(projectEpsg) || [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const toCommon = (b, epsg) => {
        if (Number(epsg) === common) return b;
        if (!common || !getProj4DefSync(epsg) || !getProj4DefSync(common)) return null;
        const c = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(([x, y]) => reprojectXY(x, y, epsg, common));
        return c.every(Boolean) ? [Math.min(...c.map((p) => p.x)), Math.min(...c.map((p) => p.y)), Math.max(...c.map((p) => p.x)), Math.max(...c.map((p) => p.y))] : null;
      };
      const held = [...mapLayers.map((l) => l.bbox).filter(Boolean), ...collars.filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y)).map((c) => [c.x, c.y, c.x, c.y])];
      const refBox = held.length ? [Math.min(...held.map((b) => b[0])), Math.min(...held.map((b) => b[1])), Math.max(...held.map((b) => b[2])), Math.max(...held.map((b) => b[3]))] : null;
      const rows = classifyTables(tables, { toCommon, refBox });
      let keep = new Set(tables.map((t) => t.name));
      if (needsImportReview(rows)) {
        const chosen = await new Promise((resolve) => setImportReview({ rows, resolve }));
        setImportReview(null);
        keep = chosen || new Set();
        if (!chosen) { setBusy(false); setMapMsg(null); return; } // Cancel: nothing changes
        leftOut = tables.length - keep.size;
      }
      for (const t of tables) if (keep.has(t.name)) for (const q of t.items) addNow(q.parsed, q.sourceName, q.opts);
    }
    // TASKS.csv #1248 — a file no branch above takes vanished without a word
    for (const f of files) if (!/\.(gpkg|zip|shp|shx|dbf|prj|cpg|sbn|sbx|qix|tab|map|id|dat|ind|mif|mid|gpx|geojson|json|kml|kmz|qml)$/i.test(f.name)) failed.push(tr("{name}: not a format this importer reads (.gpkg, .zip, .shp, .tab, .mif, .gpx, .geojson, .kml, .kmz).", { name: f.name }));
    if (qmlFiles.length && !files.some((f) => /\.(gpkg|zip|shp|tab|mif)$/i.test(f.name))) failed.push(tr("A .qml on its own doesn't import anything — use a layer's Style button to apply it to an existing layer."));
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

  const changeStyleField = (layer, field) => {
    updateMapLayer(layer.id, { styleField: field, categories: autoCategories(layer.features, field, autoColorFor()) });
  };

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
    const out = parseStructureRows(p.rows, p.cols);
    if (!out.rows.length) { setStructMsg({ ok: false, text: tr("No rows had usable coordinates and dip.") }); return; }
    const src = Number(p.sourceEpsg), dst = Number(project?.epsg);
    let crsNote = "";
    if (src && dst && src !== dst) {
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
    let northNote = "", rows = out.rows;
    if (north.ref !== "grid") {
      if (!dst) { setStructMsg({ ok: false, text: tr("The project has no coordinate system yet, so true / magnetic north can't be converted to grid north. Choose the project CRS first.") }); return; }
      if (north.ref === "magnetic") { try { await loadIgrf(); } catch { setStructMsg({ ok: false, text: tr("Couldn't load the magnetic field model (IGRF) — nothing was imported.") }); return; } }
      const c = bearingsToGrid(out.rows, north.ref, dst, north.date);
      rows = c.rows;
      northNote = tr(" {converted} dip direction(s) converted from {v} to grid north{v2}.", { converted: c.converted, v: northRefText(north.ref, north.date, c.example), v2: c.failed ? tr("; {failed} could not be converted and were left as they were", { failed: c.failed }) : "" });
    }
    addSurfaceStructureSet({ name: p.name, rows, snapToTerrain: true, azimuthRef: north.ref, ...(north.ref === "magnetic" ? { azimuthDate: north.date } : {}) });
    const noZ = out.rows.filter((r) => r.z == null).length;
    setStructMsg({
      ok: !out.skipped,
      text: tr("Imported {rows} measurement(s) from {name}.", { rows: out.rows.length, name: p.name })
        + (out.skipped ? tr(" Skipped {skipped} row(s) missing coordinates or a valid 0–90° dip.", { skipped: out.skipped }) : "")
        + (out.derivedFromStrike ? tr(" {derivedFromStrike} dip direction(s) derived from strike by the right-hand rule.", { derivedFromStrike: out.derivedFromStrike }) : "")
        + (out.rhrMismatches ? tr(" {rhrMismatches} row(s) have a strike and dip direction that aren't 90° apart — the dip direction was used; check whether those strikes are left-hand-rule.", { rhrMismatches: out.rhrMismatches }) : "")
        + (noZ ? tr(" {noZ} had no elevation and sit on the terrain{v}.", { noZ, v: terrain ? "" : tr(" once one is loaded") }) : "")
        + crsNote + northNote,
    });
    setPendingStruct(null);
  };

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
      <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>{tr("Map layers")}<InfoButton title={tr("Map layers")} text={tr("Import surface mapping — a geology map, alteration or outcrop polygons, fault traces, sample points — from a GeoPackage (.gpkg) or shapefile (.zip, or .shp with its .dbf/.prj) and drape it on the terrain in the 3D view, coloured by an attribute. Select a QGIS style (.qml) in the same dialog to reuse your map's colours; otherwise each unit gets its own colour, editable below. Every feature table in a GeoPackage becomes its own layer. Polygons keep their holes and multipart pieces. A layer with a known CRS is reprojected into the project's EPSG ({v}). Mapped contacts between units can be projected underground from the 3D Modelling tab.", { v: project?.epsg ?? "?" })} />
      </div>
      <SourceCrsField
        value={mapSourceEpsg} onChange={(c) => setMapSourceEpsg(c === "" ? "" : String(c))}
        defaultText={tr("From the file (.prj / GeoPackage), else the project CRS ({v})", { v: crsName(project?.epsg) || tr("EPSG:{v}", { v: project?.epsg ?? "?" }) })}
        title={tr("Leave it on the file's own CRS. Change it when a shapefile has no .prj or a wrong one.")}
      />
      <button onClick={() => mapInput.current.click()} style={pBtn} disabled={busy} title={tr("Formats: GeoPackage, shapefile (.zip / .shp), MapInfo .tab / .mif, .gpx, .geojson, .kml")}>
        <MapIcon size={14} /> {busy ? tr("Importing…") : tr("Import map layer…")}
      </button>
      <input ref={mapInput} type="file" accept=".gpkg,.zip,.shp,.dbf,.prj,.shx,.cpg,.qml,.tab,.map,.id,.dat,.mif,.mid,.gpx,.geojson,.json,.kml,.kmz" multiple style={{ display: "none" }}
        onChange={(e) => { importMaps(e.target.files); e.target.value = ""; }} />
      <input ref={qmlInput} type="file" accept=".qml" style={{ display: "none" }}
        onChange={(e) => { applyQmlToLayer(e.target.files[0]); e.target.value = ""; }} />
      {msgBox(mapMsg)}
      {mapLayers.map((l) => {
        const legendOpen = !!openLegend[l.id];
        return (
          <div key={l.id} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateMapLayer(l.id, { visible: l.visible === false })} style={{ cursor: "pointer", color: l.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                {l.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${l.name}\n${l.crsNote || ""}`}>{l.name}</div>
              <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>{l.features.length} {l.geomType}</span>
              <Trash2 aria-label={tr("Remove map layer \"{name}\"", { name: l.name })} title={tr("Remove map layer \"{name}\"", { name: l.name })} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(tr("Remove \"{name}\"?", { name: l.name }))) removeMapLayer(l.id); }} />
            </div>
            <label style={{ ...row, cursor: terrain ? "pointer" : "default", opacity: terrain ? 1 : 0.45 }}>
              <input type="checkbox" checked={l.drapeMode === "terrain" && !!terrain} disabled={!terrain}
                onChange={(e) => updateMapLayer(l.id, { drapeMode: e.target.checked ? "terrain" : "flat" })} />
              <span style={{ color: "var(--color-text-caption)" }}>{tr("Drape on terrain{v}", { v: !terrain ? tr(" (import or fetch a DEM above first)") : "" })}</span>
            </label>
            {!(l.drapeMode === "terrain" && terrain) && (
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
                  <span>{tr("Legend ({categories} {v})", { categories: l.categories.length, v: tr(l.categories.length === 1 ? "unit" : "units") })}</span>
                  {!legendOpen && (
                    <span style={{ display: "flex", gap: 2, marginLeft: "auto", overflow: "hidden" }}>
                      {l.categories.slice(0, 14).map((c) => <span key={String(c.value)} style={{ width: 9, height: 9, borderRadius: 2, background: c.color, opacity: c.visible === false ? 0.25 : 1, flexShrink: 0 }} />)}
                    </span>
                  )}
                </div>
                {legendOpen && (
                  <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 3 }}>
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

      </>)}
      {part !== "maps" && (<>
      <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>{tr("Surface structures")}<InfoButton title={tr("Surface structures")} text={tr("Import outcrop structural measurements from a CSV — easting, northing, optional elevation, dip, and dip direction and/or strike (right-hand rule), plus a structure type and comments if present. Each measurement is drawn in the 3D view as a disc lying in the measured plane, coloured by type (fault, bedding, foliation, vein, joint, contact…). Rows without an elevation sit on the terrain. These measurements are what the 3D Modelling tab uses to set the dip when projecting mapped contacts underground.")} />
      </div>
      <button onClick={() => structInput.current.click()} style={pBtn} title={tr("Formats: .csv, MapInfo .tab / .mif")}>
        <Compass size={14} />{" "}{tr("Import structure measurements…")}</button>
      <input ref={structInput} type="file" accept=".csv,.txt,.tab,.map,.id,.dat,.mif,.mid" multiple style={{ display: "none" }}
        onChange={(e) => { readStructCsv(e.target.files); e.target.value = ""; }} />
      {pendingStruct && (
        <div style={card}>
          <div style={{ color: "var(--color-text)", marginBottom: 4 }}>{tr("{name}: {rows} rows — check the columns", { name: pendingStruct.name, rows: pendingStruct.rows.length })}</div>
          {[["x", tr("Easting")], ["y", tr("Northing")], ["z", tr("Elevation")], ["dip", tr("Dip")], ["dipDir", tr("Dip dir.")], ["strike", tr("Strike")], ["type", tr("Type")], ["station", tr("Station")], ["comment", tr("Comments")]].map(([k, label]) => ( /* station: #1442 */
            <div key={k} style={row}>
              <span style={lbl}>{label}</span>
              <select value={pendingStruct.cols[k] || ""} onChange={(e) => setPendingStruct((p) => ({ ...p, cols: { ...p.cols, [k]: e.target.value || null } }))} style={select}>
                <option value="">{tr("(none)")}</option>
                {pendingStruct.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
          <SourceCrsField
            value={pendingStruct.sourceEpsg ?? ""} onChange={(c) => setPendingStruct((p) => ({ ...p, sourceEpsg: c === "" ? "" : String(c) }))}
            defaultText={tr("Same as project — {v}", { v: crsName(project?.epsg) || tr("EPSG:{v}", { v: project?.epsg ?? "?" }) })}
            title={tr("The CRS of this file's easting/northing. It is reprojected into the project CRS on import.")}
          />
          <AzimuthRefPicker value={pendingStruct.north} onChange={(n) => setPendingStruct((p) => ({ ...p, north: n }))} selectStyle={select} labelStyle={lbl} rowStyle={row} />
          <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
            <button onClick={commitStructs} style={{ ...pBtn, marginBottom: 0, justifyContent: "center" }}>{tr("Import")}</button>
            <button onClick={() => setPendingStruct(null)} style={{ ...pBtn, marginBottom: 0, justifyContent: "center" }}>{tr("Cancel")}</button>
          </div>
        </div>
      )}
      {msgBox(structMsg)}
      {surfaceStructures.map((s) => {
        const counts = {};
        s.rows.forEach((r) => { counts[r.cls] = (counts[r.cls] || 0) + 1; });
        return (
          <div key={s.id} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateSurfaceStructureSet(s.id, { visible: s.visible === false })} style={{ cursor: "pointer", color: s.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
                {s.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
              <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }} title={s.azimuthRef && s.azimuthRef !== "grid" ? tr("Measured from {azimuthRef} north{v}; converted to grid north at import (#547)", { azimuthRef: s.azimuthRef, v: s.azimuthDate ? ` on ${s.azimuthDate}` : "" }) : tr("Dip directions in project grid north")}>{s.rows.length}{s.azimuthRef === "magnetic" ? " · MN" : s.azimuthRef === "true" ? " · TN" : ""}</span>
              <select value="" onChange={(e) => { const f = e.target.value; e.target.value = ""; if (f) exportStructSet(s, f); }} aria-label={tr("Export structure set \"{name}\"", { name: s.name })} title={tr("Export: dip, dip direction and strike (right-hand rule) in grid and true north")} style={{ ...select, width: "auto", flexShrink: 0, padding: "1px 2px", fontSize: "var(--font-size-xs)" }}>
                <option value="">{tr("Export…")}</option><option value="gpkg">GeoPackage</option><option value="kml">{tr("KML (Google Earth)")}</option><option value="csv">CSV</option>
              </select>
              <Trash2 aria-label={tr("Remove structure set \"{name}\"", { name: s.name })} title={tr("Remove structure set \"{name}\"", { name: s.name })} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(tr("Remove \"{name}\"?", { name: s.name }))) removeSurfaceStructureSet(s.id); }} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", marginTop: 7 }}>
              {Object.entries(counts).map(([cls, n]) => (
                <span key={cls} style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: STRUCTURE_CLASS_COLORS[cls], border: "1px solid var(--color-border)" }} />
                  {STRUCTURE_CLASS_LABELS[cls]} {n}
                </span>
              ))}
            </div>
            <div style={row}>
              <span style={lbl}>{tr("Disc size")}</span>
              <input type="range" min={5} max={200} step={5} value={s.size ?? 25} onChange={(e) => updateSurfaceStructureSet(s.id, { size: Number(e.target.value) })} style={{ flex: 1 }} />
              <span style={{ color: "var(--color-text-muted)", width: 40, textAlign: "right" }}>{s.size ?? 25} m</span>
            </div>
            <label style={{ ...row, cursor: terrain ? "pointer" : "default", opacity: terrain ? 1 : 0.45 }}>
              <input type="checkbox" checked={s.snapToTerrain !== false} disabled={!terrain} onChange={(e) => updateSurfaceStructureSet(s.id, { snapToTerrain: e.target.checked })} />
              <span style={{ color: "var(--color-text-caption)" }} title={tr("GPS elevations are often tens of metres off the DEM; snapping sits every symbol on the ground. Off: rows with a recorded elevation use it.")}>{tr("Sit every measurement on the terrain")}</span>
            </label>
          </div>
        );
      })}
      </>)}
    </>
  );
}
