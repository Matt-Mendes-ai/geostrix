// TASKS.csv #445 step 3 — the viewer's import pipeline: file -> mapping dialog (openImportModal, importBrowserFile,
// openImportFromRows), the commit into the store (commitImportData, commitImport), the multi-file drag-and-drop
// queue (processImportQueue, handleDrop) and the sample-project loader, moved out of ViewerModule.jsx VERBATIM
// (by script; relative import paths re-based to this folder). ViewerModule calls this hook at the same point in
// its body as the code used to run, so React's hook order (the useState / useRef / useCallback inside) and every
// closure see exactly the same values as before. `ctx` = what the code reads from the component, listed by an
// eslint-scope analysis; the return = what the rest of ViewerModule uses.
import { dbImportRecord, upsertDbImport } from "../../lib/dbImports.js"; // TASKS.csv #1963
import { pullAllRows } from "../../lib/useTablePull.js"; // TASKS.csv #1963
import { lonLatForCollars } from "../../lib/projectCrs.js"; // TASKS.csv #1235
import { featureCountText } from "../../lib/featureCount.js"; // TASKS.csv #1116
import { useRef, useState, useCallback } from "react";
import { errorNotice, notice, appendNotice } from "../../lib/notices.js"; // TASKS.csv #739 — caught errors show as errors whatever their wording
import * as THREE from "three";
import { reprojectXY, pointTransform, turnGridBearing, bearingTurn, crsName, guessEpsgFromPrjWkt } from "../../lib/reproject.js";
import { surveyAzimuthDipAt, holeAttitudeAssumed } from "../../lib/desurvey.js"; // holeAttitudeAssumed: #2014
import { fillMissingCollarZ, settleAssumedZ } from "../../lib/collarElevation.js"; // TASKS.csv #2169
import { markSuspectElevations } from "../../lib/collarElevationTrust.js"; // TASKS.csv #3004 / #2896
import { terrainGroundAt } from "../../lib/viewer/geomath.js"; // #2169 — a collar with no elevation on the terrain
import { azimuthToGridOffset, wrap360, loadIgrf, detectAzimuthRef } from "../../lib/azimuthRef.js"; // loadIgrf: #552; detectAzimuthRef: #1647
import { orientFromAlphaBeta, reorientAlphaBetaPicks } from "../../lib/coreOrientation.js";
import { fitSimilarity, parseControlPoints, transformImportRows } from "../../lib/localGrid.js";
import { tieOf, fileToLocal, bearingToLocal } from "../../lib/localGridTie.js"; // TASKS.csv #2288
import { localGridAzimuthOffset } from "../../lib/localGridNorth.js"; // TASKS.csv #2491
import { untiedNorthOf, trueToUntiedGrid } from "../../lib/localGridDatum.js"; // TASKS.csv #2661
import { mineGridOf } from "../../lib/mineGrid.js"; // TASKS.csv #2586
import { dipConventionFields, upwardHoles } from "../../lib/dipSign.js"; // TASKS.csv #2886
import { codeColumnGuess } from "../../lib/valueGuess.js"; // TASKS.csv #2889
import { codeOverlap, otherCodeSystem } from "../../lib/codeOverlap.js"; // TASKS.csv #2893
import { recoveryColumns, recoveryPct } from "../../lib/recoveryCalc.js"; // TASKS.csv #2891
import { logChannelsFor, defaultLogBin, logChannelRows, unitFromHeader, channelNoData, noDataText, logBinEstimate, needsBinning, logReadings } from "../../lib/downholeLogChannels.js"; // logReadings: #3038
import { logTableFits } from "../../lib/logOnRead.js"; // TASKS.csv #3038 // TASKS.csv #2160; no-data: #2332; logBinEstimate: #2885
import { loadSampleFiles, readSiblingFiles } from "../../lib/desktop.js";
const isXlsxName = (name) => /\.xlsx$/i.test(String(name || "")); // TASKS.csv #605 (same test as xlsx.js; the reader itself loads on demand, #552)
import { buildLayer, sameMapLayer } from "../../lib/mapLayerBuild.js"; // TASKS.csv #609; sameMapLayer: #2019
import { askAdoptCrs } from "../../lib/adoptCrs.js"; // TASKS.csv #607
import { requestProjectCrs } from "../../lib/projectCrsRequest.js"; // TASKS.csv #615
import { collarAlwaysKept, firstPerHole } from "../../lib/collarAttrs.js"; // TASKS.csv #2492 / #2190; firstPerHole: #2172
import { surveyMethodKey, surveyMethodByHole, foldCaseVariants } from "../../lib/surveyMethod.js"; // TASKS.csv #2494
import { fullestTypeColumn } from "../../lib/downholeTableGuess.js"; // TASKS.csv #2188
import { holeTypeColumn, normalizeHoleType } from "../../lib/holeType.js"; // TASKS.csv #2161
import { eventNotes } from "../../lib/downholeEvents.js"; // TASKS.csv #2317
import { applyRowFilter, defaultRowFilter, overlapSummary, overlapWorthSaying } from "../../lib/importRowFilter.js"; // TASKS.csv #2330; overlap: #2391
import { isNullSentinel, LAYER_META, TARGET_SCHEMAS, guessColumn, guessColumnExact, guessMapping, guessTargetFor, schemaSatisfied, num, replaceRowsByHole, keepDerivedPicks, isDerivedPick, replaceNote, EPSG_COL_ALIASES, diffCollarImport, mergeCollar, minMax, pickRankedCollarRows } from "../../lib/layers.js";
import { alterationStyleFromName, styledAltValue, isBlankCode, NO_CODE, blankCodeText } from "../../lib/viewer/importHelpers.js"; // TASKS.csv #1511; isBlankCode: #2182
import { fillDownHoleIds, numberedSiblings, allCodesOf, normInterval, applyCustomFields, normNumericInterval, normStructure, skippedRowsText, strikeStats, loadRaster, looksLikeAssay, isSurfaceSampleTable, looksLikeSurfaceSamples /* #2268 */, parseVectorFile, groupShapefileParts, orderImportFiles } from "../../lib/viewer/importHelpers.js"; // groupShapefileParts / orderImportFiles: #600
import { unreadableFormatAdvice } from "../../lib/unreadableFormats.js"; // TASKS.csv #603
import { t as tr } from "../../lib/i18n.js"; // TASKS.csv #786
import { requestModuleAction, useModuleAction } from "../../lib/menuRequests.js"; // TASKS.csv #917; useModuleAction: #2019
import { autoExtraFields, companionLayer, surveyMethodFields, columnsLeftOut } from "../../lib/viewer/autoExtras.js"; // TASKS.csv #1501; surveyMethodFields: #2187
import { surfaceAttrColumns, surfaceAttrs } from "../../lib/geochem.js"; // TASKS.csv #1504 — unmapped collar columns kept as attrs
import { rasterDrapeElevation, drapeElevationNote, planElevation } from "../../lib/drapeElevation.js"; // TASKS.csv #1505; planElevation: #2294
import { projectTargetEpsg } from "../../lib/projectTarget.js"; // TASKS.csv #2287 — no reprojection INTO the placeholder CRS
import { looksLikeUbcMesh } from "../../lib/leapfrogMsh.js"; // TASKS.csv #1991
import { useStore } from "../../lib/store.jsx"; // TASKS.csv #2632 — addVoxelModel for a GOCAD Voxet, without threading it through ViewerModule

const AZ_TARGETS = new Set(["collars", "survey", "structure"]); // TASKS.csv #1647 — tables with an azimuth
// TASKS.csv #2886 — the dip column whose signs decide the pre-selected convention (collars and surveys)
const dipColOf = (target, mapping) => (target === "collars" || target === "survey" ? mapping?.dip || null : null);

export function useImportPipeline(ctx) {
  const { addVoxelModel, fillCodeDictionary, recordImportLeftOut } = useStore(); // #2632; fillCodeDictionary: #2163; recordImportLeftOut: #2493
  const {
    addBoundary,
    addRaster,
    collars,
    goToModule,
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
    connectDb = null, dbConnections = [], dbImports = [], setDbImports = null, // TASKS.csv #1963
  } = ctx;

  // TASKS.csv #609 — a LINE or POLYGON shapefile (IP lines, claim outlines, a geology map) is map data, not a
  // drillhole table: it used to fall to the collar guess and open the mapping dialog. It goes to Map layers
  // (the Geophysics tab's panel) through the same builder, draped on the terrain when there is one.
  // TASKS.csv #607 — an empty project may take the file's declared CRS (lib/adoptCrs.js). Returns the CRS to import into.
  const adoptCrsIfEmpty = (declared, fileName) => {
    const live = importStateRef.current;
    // TASKS.csv #2288 — a local-grid project (#2180) keeps its grid: a file's declared CRS is brought in through the tie, never adopted
    // (found live: an MGA collar file silently ended the local grid and set EPSG:28351 as the project CRS)
    if (live.project?.crsSet === false && live.project?.localGrid) return null;
    // TASKS.csv #615 — a project whose CRS was never chosen simply takes the file's declared one
    if (live.project?.crsSet === false && Number(declared) > 0 && crsName(declared) && live.setEpsg) {
      const d = Number(declared);
      live.setEpsg(d);
      importStateRef.current = { ...live, project: { ...live.project, epsg: d, crsSet: true }, projectIsEmpty: false };
      setNotices((p) => [...p, notice("Project CRS set to {v} (EPSG:{d}), the CRS {fileName} declares.", { v: crsName(d), d, fileName })]);
      return d;
    }
    const d = askAdoptCrs({ isEmpty: live.projectIsEmpty, currentEpsg: live.project?.epsg, declaredEpsg: declared, fileName });
    if (!d || !live.setEpsg) return Number(live.project?.epsg);
    live.setEpsg(d);
    // the rest of this import (and of a queued drop, until the next render refreshes the ref) sees it now
    importStateRef.current = { ...live, project: { ...live.project, epsg: d }, projectIsEmpty: false };
    setNotices((p) => [...p, notice("Project CRS set to {v} (EPSG:{d}) from {fileName}.", { v: crsName(d), d, fileName })]);
    return d;
  };

  const sendToMapLayers = (file, parsed) => {
    adoptCrsIfEmpty(guessEpsgFromPrjWkt(parsed.prjWkt), file.name); // #607
    const live = importStateRef.current;
    const sourceName = file.name.replace(/\.(shp|zip)$/i, "");
    const layer = buildLayer({ ...parsed, epsg: guessEpsgFromPrjWkt(parsed.prjWkt) }, { sourceName, projectEpsg: projectTargetEpsg(live.project), tie: tieOf(live.project) /* #2320 */, mineGrid: mineGridOf(live.project), collars: live.collars /* #2586 */, qml: null, sourceOverride: null });
    if (!layer) { setNotices((p) => [...p, notice("{name}: no usable line / polygon features.", { name: file.name })]); return; }
    const twin = sameMapLayer(live.mapLayers, layer); // #2019 — the same file again: not a second copy
    if (twin) { setNotices((p) => [...p, notice("{name} is already in Map layers as \"{layer}\" ({features}): not added again.", { name: file.name, layer: twin.name, features: featureCountText(layer.features.length, layer.geomType) })]); return; }
    live.addMapLayer({ ...layer, drapeMode: "terrain" }); // #1606 — flat until a terrain exists, then draped (was 'flat' for good when imported before one)
    setNotices((p) => [...p, notice("{name}: {features} added to Map layers (left panel; remove or hide it there), {crsNote}{v2}. Lines and polygons are map data, not drillhole tables.", { name: file.name, features: featureCountText(layer.features.length, layer.geomType) /* #1116 */, crsNote: layer.crsNote, v2: live.terrain ? tr(", draped on the terrain") : "" })]);
  };
  const isMapGeometry = (meta) => meta?.vector && meta.vector.geomType && meta.vector.geomType !== "point";
  // TASKS.csv #2019 — files dropped on the Maps tab that need this import (points, tables, layer pickers), with what Maps already did
  useModuleAction(["import-dropped-files"], (_a, p) => {
    const extra = [...(p?.notes || []), ...(p?.others?.length ? [notice("{names}: not a file the map or this import reads.", { names: p.others.slice(0, 4).join(", ") + (p.others.length > 4 ? "…" : "") })] : [])];
    if (extra.length) setNotices((q) => [...q, ...extra]);
    if (p?.files?.length) handleDrop({ preventDefault() {}, dataTransfer: { files: p.files } });
  });

  const openImportModal = (file, forceTarget, chosenLayer = null) => {
    parseVectorFile(file, (data, err, meta) => {
      // TASKS.csv #288 — a multi-layer .zip/.gpkg reports its layers instead of importing the first
      // one; put the picker up and come back through this same function with the chosen layer name.
      if (meta?.layerOptions) { setLayerPicker({ file, forceTarget, options: meta.layerOptions }); return; }
      if (err || !data || !data.length) { setNotices((p) => [...p, notice("{name}: couldn't read {v}.", { name: file.name, v: err ? "file (" + err + ")" : tr("— no rows found") })]); return; }
      if (isMapGeometry(meta) && forceTarget !== "custom") { sendToMapLayers(file, meta.vector); return; } // #609
      const headers = meta?.headers || Object.keys(data[0]);
      if (!forceTarget && (looksLikeAssay(headers, file.name, data) || looksLikeSurfaceSamples(headers, data))) { // file.name: #1105; data: #2185; soils: #2268
        assayHandoffRef.current.push(assayHandoffOf(file, data, headers, meta)); handOverAssays(); // #1350; #2016
        return;
      }
      const target = forceTarget || guessTargetFor(headers, file.name, data); // #605: the file name as a hint; data: #2884
      const ll = lonLatForCollars(target, guessMapping(target, headers), headers, data); // #1235
      const mapping0 = azColFor(target, headers, data, ll ? ll.mapping : guessMapping(target, headers)); // #426; #2015
      const codeGuess = codeColumnGuess(target, headers, data, mapping0), mapping = codeGuess ? { ...mapping0, value: codeGuess.col } : mapping0; // #2889 — no name matched: the file's one code column, said as a guess
      const perRowEpsgCol = guessColumn(headers, EPSG_COL_ALIASES);
      setImportModal({ ...(codeGuess ? { valueGuess: codeGuess } : {}), ...azRefFor(target, headers, data), ...(target === "survey" ? { customFields: surveyMethodFields(headers, data) } : {}) /* #2187 */, file, fileName: file.name, headers, rowCount: meta?.logTable ? meta.logTable.n : data.length, sampleRows: data.slice(0, 5), allRows: data, ...(meta?.logTable ? { logTable: meta.logTable } : {}) /* #3038 */, target, mapping, ...(forceTarget ? {} : guardGuess(target, mapping, headers, data, file.name)), ...dipConventionFields(data, dipColOf(target, mapping)) /* #2886 */, perRowEpsgCol, sourceEpsg: ll ? ll.sourceEpsg : meta?.detectedEpsg ? String(meta.detectedEpsg) : "" });
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
  const importBrowserFile = async (file, filePath) => { // filePath: the Browser panel's (#2725)
    const name = (file?.name || "").toLowerCase();
    // Drape elevation default, the rule RasterModule / GeophysicsModule use (#1505: above the collars under it, stacked over an
    // earlier raster, or at the depth the file name says). The per-raster elevation control on the Maps tab moves it after.
    // TASKS.csv #2294 — DXF lines without their own z: the #2269 rule (the highest collar on a project drilled from underground)
    const liveNow = importStateRef.current, defaultElevation = planElevation({ collars: liveNow.collars || collars, survey: liveNow.survey || [], voxelModels: liveNow.voxelModels || [], surfaceSamples: liveNow.surfaceSamples || [] }).z;
    if (/\.(tiff?|gxf|grd)$/.test(name)) { // grd: #1347
      try {
        const live = importStateRef.current;
        const chooseProjectEpsg = (src, cur) => adoptCrsIfEmpty(src, file.name) || cur; // #607
        const { raster, msg } = await (await loadRaster()).buildRasterImport(file, { epsg: projectTargetEpsg(live.project || project), defaultElevation, chooseProjectEpsg });
        const drape = rasterDrapeElevation({ collars: live.collars || collars, voxelModels: live.voxelModels || [], surfaceSamples: live.surfaceSamples || [], bbox: raster.bbox, rasters: live.rasters || [], fileName: file.name }); // #1505
        addRaster({ ...raster, elevation: drape.z });
        setNotices((p) => [...p, notice("{msg} {v} Set its opacity (or a Source CRS, if it landed in the wrong place) on the Maps tab.", { msg, v: drapeElevationNote(drape) })]);
      } catch (err) { setNotices((p) => [...p, errorNotice(`${file.name}: ${err.message}`)]); } // #739
      return;
    }
    // TASKS.csv #1992 — a GOCAD PLine (.pl): one boundary layer per PLine object, its vertices' own elevations kept
    // TASKS.csv #2725 — a GOCAD Voxet picked in the Browser panel: its PROP_FILE side files are read from the .vo's own folder
    if (/\.vo$/.test(name)) { await importVoxet(file, filePath ? (h) => readSiblingFiles(filePath, h.props.map((p) => p.file)) : [file], !!filePath); return; }
    if (/\.pl$/.test(name)) {
      try {
        const { parseGocad, gocadCrsText } = await import("../../lib/gocad.js");
        const objs = parseGocad(await file.text()), plines = objs.filter((o) => o.type.toLowerCase() === "pline" && o.lines.length);
        if (!plines.length) throw new Error(tr("no GOCAD PLine with segments in it"));
        for (const o of plines) addBoundary({ name: o.name, polylines: o.lines, closedFlags: o.lines.map(() => false), useVertexZ: true, elevation: defaultElevation });
        const crs = gocadCrsText(plines[0].crs);
        setNotices((p) => [...p, notice("Imported \"{name}\" as {n} boundary layer(s) ({lines} line(s)) with their own elevations — edit or remove them under Geophysics → Boundaries. GOCAD coordinates are assumed to already be in the project's coordinate system{v}.", { name: file.name, n: plines.length, lines: plines.reduce((s, o) => s + o.lines.length, 0), v: crs ? tr(" (the file names \"{crs}\")", { crs }) : "" })]);
      } catch (err) { setNotices((p) => [...p, errorNotice(tr("{name}: couldn't read GOCAD ({message}).", { name: file.name, message: err.message }))]); }
      return;
    }
    if (/\.dxf$/.test(name)) {
      try {
        // TASKS.csv #408 — one boundary per DXF layer, keeping Z; a face-only DXF is a solid.
        const { dxfToBoundaries, dxfSkippedText } = await import("../../lib/dxf.js"); // #552 — on demand; dxfSkippedText: #550
        const specs = dxfToBoundaries(await file.text(), file.name.replace(/\.dxf$/i, ""));
        specs.forEach((sp) => addBoundary({ ...sp, elevation: defaultElevation }));
        const n3d = specs.filter((sp) => sp.useVertexZ).length;
        setNotices((p) => [...p, notice("Imported \"{name}\" as {specs} boundary layer(s) ({v} string(s)){v2} — edit or remove them under Geophysics → Boundaries. DXF coordinates are assumed to already be in the project's EPSG.{v3}{v4}", { name: file.name, specs: specs.length, v: specs.reduce((t, sp) => t + sp.polylines.length, 0), v2: n3d ? tr(", {n3d} with real 3D elevations", { n3d }) : "", v3: specs[0]?.dxfZerosDropped ? tr(" Every string had elevation 0, so the file was read as a 2D plan (no elevation).") : "", v4: dxfSkippedText(specs[0]?.dxfSkipped) ? ` ${dxfSkippedText(specs[0].dxfSkipped)[0].toUpperCase()}${dxfSkippedText(specs[0].dxfSkipped).slice(1)}.` : "" })]); // #550
      } catch (err) {
        if (err.facesOnly) { importSolidFile(file); return; } // #408 — 3DFACE / polyface only: import as a solid
        setNotices((p) => [...p, errorNotice(tr("{name}: couldn't read DXF ({message}).", { name: file.name, message: err.message }))]);
      }
      return;
    }
    openImportModal(file);
  };

  // same pipeline as CSV import, just fed from a database query result instead of a parsed file
  const openImportFromRows = async ({ headers, rows, sourceName, dbSource = null }) => { // dbSource: TASKS.csv #1963
    if (!rows.length) return;
    // TASKS.csv #917 — Matt: "the geochem module doesn't give me an option to import assays straight from the database".
    // An assay table (from the Browser panel or Connect to database) is handed to Geochem's assay dialog, which needs
    // the element checklist, instead of a notice telling the user to go there.
    // #952 — a long table (analyte + value columns, one row per element) has no element columns to count
    if (looksLikeAssay(headers, sourceName, rows) || (await import("../../lib/longAssays.js")).detectLongAssay(headers)) { // rows: #2185 — // on demand: off the startup bundle
      setDbModalOpen(false);
      requestModuleAction("import-assay-rows", { headers, rows, sourceName, dbSource });
      goToModule("geochem");
      setNotices((p) => [...p, isSurfaceSampleTable(headers) // #975 — Geochem opens a surface-sample table in its surface import
        ? notice("{name} looks like a table of surface samples (coordinates, no from / to), so it opened in Geochem's surface-sample import, where you choose the elements.", { name: sourceName })
        : notice("{name} looks like an assay table, so it opened in Geochem's assay import, where you choose the elements.", { name: sourceName })]); // #995 — the tab switch is said
      return;
    }
    const target = guessTargetFor(headers, sourceName, rows); // #605; rows: #2884
    const ll = lonLatForCollars(target, guessMapping(target, headers), headers, rows); // #1235
    const mapping0 = azColFor(target, headers, rows, ll ? ll.mapping : guessMapping(target, headers)); // #426; #2015
    const codeGuess = codeColumnGuess(target, headers, rows, mapping0), mapping = codeGuess ? { ...mapping0, value: codeGuess.col } : mapping0; // #2889
    const perRowEpsgCol = guessColumn(headers, EPSG_COL_ALIASES);
    setImportModal({ dbSource, ...(codeGuess ? { valueGuess: codeGuess } : {}), ...azRefFor(target, headers, rows), fileName: sourceName, headers, rowCount: rows.length, sampleRows: rows.slice(0, 5), allRows: rows, target, mapping, ...guardGuess(target, mapping, headers, rows, sourceName), ...dipConventionFields(rows, dipColOf(target, mapping)) /* #2886 */, perRowEpsgCol, ...(ll ? { sourceEpsg: ll.sourceEpsg } : {}) });
    setDbModalOpen(false);
  };

  // Does the actual import given a fully-resolved {target, mapping, allRows, dipConvention, fileName}
  // — split out from the modal's "Import" button handler so a multi-file drag-and-drop (see
  // handleDrop/processImportQueue below) can commit files it's confident about without ever opening
  // the modal, while still routing through the exact same logic or one that needs confirmation.
  // Returns false (and leaves the caller to show a notice) if required fields aren't mapped.
  // TASKS.csv #605 — the rows committed so far by the drop being drained (null outside a multi-file drop):
  // a later file of the SAME drop adds to them instead of replacing them by hole (replaceRowsByHole keepRows).
  const batchRowsRef = useRef(null);
  const keepBatch = (rows) => { if (batchRowsRef.current) rows.forEach((r) => batchRowsRef.current.add(r)); return rows; };
  // TASKS.csv #1647 — the north a file states for its azimuths (collars, survey, structures), pre-set in the dialog
  // TASKS.csv #1649 / #1502 (reviews #1645 Copley, #1497 Lawyers) — a guessed log layer that already holds rows from ANOTHER file for
  // the same holes: importing there replaces (or, in one drop, mixes into) the real log. Copley's QuickLog was pre-set to Alteration
  // (279 rows of the real log), SWIR_Halo to Veins; Lawyers' Vein Min was appended into Mineralization unseen.
  // -> { target, n, src, holes } or null.
  const layerOverlap = (target, mapping, rows, fileName) => {
    if (!LAYER_META[target] || !mapping?.hole_id) return null;
    const existing = importStateRef.current.layers?.[target];
    if (!existing?.length) return null;
    const name = String(fileName ?? "").replace(/ \(\d+ more queued\)$/, "");
    const holes = new Set(rows.map((r) => String(r[mapping.hole_id] ?? "").trim()).filter(Boolean));
    const bySrc = new Map(); let n = 0; const hit = new Set();
    for (const r of existing) if (holes.has(r.hole_id) && r._src !== name) { n++; hit.add(r.hole_id); bySrc.set(r._src || "", (bySrc.get(r._src || "") || 0) + 1); }
    if (!n) return null;
    const src = [...bySrc.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { target, n, src, holes: hit.size };
  };
  // the dialog's pre-set: such a guess becomes a custom layer, and the dialog says why (#1649)
  const guardGuess = (target, mapping, headers, rows, fileName) => {
    const ov = layerOverlap(target, mapping, rows, fileName);
    return ov ? { target: "custom", mapping: guessMapping("custom", headers), guessNote: ov } : { target, mapping };
  };
  const azRefFor = (target, headers, rows) => { const d = AZ_TARGETS.has(target) ? detectAzimuthRef(headers, rows) : null; return d?.ref ? { azimuthRef: d.ref, azimuthRefFrom: d.col, ...(d.also ? { azimuthRefAlso: d.also } : {}) } : {}; }; // also: #2154
  // TASKS.csv #2015 — a survey sheet's corrected azimuth column (grid when filled, else true north) is the one read
  const azColFor = (target, headers, rows, mapping) => { if (target === "structure" && mapping?.value) return { ...mapping, value: fullestTypeColumn(headers, rows, mapping.value) }; /* #2188 — the fullest of several *_StrucType columns */ if (target !== "survey" && target !== "collars") return mapping; /* collars: #2154 (Azimuth_MAG beside Azimuth_TRUE) */ const d = detectAzimuthRef(headers, rows); return d?.azimuthCol ? { ...mapping, azimuth: d.azimuthCol } : mapping; };
  // TASKS.csv #2341 — the file's columns this import did not read, named in the notice ("Add one under Extra fields to keep it")
  const leftOutText = (data, rows, extra = []) => {
    const hdrs = data.headers?.length ? data.headers : Object.keys(rows?.[0] || {});
    const left = columnsLeftOut(hdrs, rows, [...Object.values(data.mapping || {}), ...(data.customFields || []).map((f) => f.column), data.perRowEpsgCol, data.rowFilter?.col, ...extra]);
    return left.length ? " " + tr("{n} column(s) of the file were not imported: {cols}. Add one under Extra fields in the import dialog to keep it.", { n: left.length, cols: left.slice(0, 8).join(", ") + (left.length > 8 ? ", …" : "") }) : "";
  };
  const commitImportData = (data) => {
    const { target, mapping, allRows: allRowsIn, dipConvention, fileName: shownName, sourceEpsg, perRowEpsgCol, customFields, azimuthRef, azimuthDate, betaRefLine, azimuthGridEpsg, unseen = false, dbSource = null, reload = null } = data; // dbSource, reload: #1963 (reload: an object the collar diff is written to; no overwrite question)
    // TASKS.csv #1506 (review #1497) — the dialog's title carries the drop's queue count ("Min Domain.csv (10 more queued)"), and it
    // became the custom layer's name, each row's source (_src) and every notice: the bare file name from here on
    const fileName = String(shownName ?? "").replace(/ \(\d+ more queued\)$/, "");
    // TASKS.csv #2330 — the row filter: the user's, else a Superseded / Current flag column's preset (also on a drop committed unseen)
    const rowFilter = data.rowFilter !== undefined ? data.rowFilter : defaultRowFilter(Object.keys(allRowsIn?.[0] || {}).length ? Object.keys(allRowsIn[0]) : (data.headers || []), allRowsIn);
    const { rows: allRows, dropped: rowsFiltered } = applyRowFilter(allRowsIn, rowFilter);
    // TASKS.csv #2391 — an interval table whose rows overlap within a hole: say how many, and the column that probably marks the out-of-date ones
    if (mapping?.hole_id && mapping?.from && mapping?.to && target !== "assays") {
      const o = overlapSummary(allRows, { hole: mapping.hole_id, from: mapping.from, to: mapping.to }, Object.keys(allRows?.[0] || {}));
      if (overlapWorthSaying(o) && o.col) setNotices((p) => [...p, notice("{fileName}: {n} of {total} interval(s) overlap another of the same hole, in {holes} hole(s); {pct}% of them have {col} = {value}, which may mark the out-of-date rows: the import's row filter can leave them out.", { fileName, n: o.n.toLocaleString(), total: o.total.toLocaleString(), holes: o.holes, pct: Math.round(o.share * 100), col: o.col, value: o.value || "(blank)" })]);
    }
    if (rowsFiltered) setNotices((p) => [...p, notice("{fileName}: {n} row(s) left out by the row filter ({col} kept only where it is {values}).", { fileName, n: rowsFiltered.toLocaleString(), col: rowFilter.col, values: rowFilter.keep.map((v) => v || "(blank)").join(", ") })]);
    // TASKS.csv #2159 — the mapped columns' no-data codes (-999, -999.25, -9999, -99999), read as missing by num(): counted and said once
    {
      const cols = [...new Set(Object.values(mapping || {}).filter(Boolean))], hits = new Map();
      for (const r of allRows || []) for (const c of cols) { const v = r[c]; if (v != null && v !== "" && isNullSentinel(v)) hits.set(c, (hits.get(c) || 0) + 1); }
      if (hits.size) setNotices((p) => [...p, notice("{fileName}: {n} value(s) written as a no-data code (-999, -999.25, -9999, -99999) were read as missing: {cols}.", { fileName, n: [...hits.values()].reduce((a, b) => a + b, 0).toLocaleString(), cols: [...hits].map(([c, k]) => `${c} ${k.toLocaleString()}`).join(", ") })]);
    }
    // TASKS.csv #396 — convert azimuths measured from true or magnetic north to the project grid, per hole
    // location (declination and convergence vary across a property). Returns the rows plus a notice.
    const applyAzimuthRef = (rows, locate) => {
      // TASKS.csv #2179 (review #2174, WA mine grid) — with no project CRS chosen, true / magnetic north (and another CRS's grid north)
      // were converted with the PLACEHOLDER's grid convergence (EPSG:3156, British Columbia) for a Western Australian mine grid
      const crsUnset = (importStateRef.current.project || project)?.crsSet === false;
      const converting = (azimuthRef && azimuthRef !== "grid") || (azimuthGridEpsg && target !== "collars");
      if (crsUnset && converting && rows.some((r) => Number.isFinite(r.azimuth))) {
        // TASKS.csv #2491 — a local grid tied to a CRS (#2288) knows its north: true / magnetic -> the tie CRS's grid -> the local grid
        const live = importStateRef.current.project || project, tie = tieOf(live);
        // TASKS.csv #2661 — an untied grid with its north typed (Maps > Project CRS > Local mine grid): a true bearing B is B - north
        const typedNorth = !tie ? untiedNorthOf(live) : null;
        if (typedNorth != null && azimuthRef === "true" && !(azimuthGridEpsg && target !== "collars")) {
          let fixed = 0;
          const out = rows.map((r) => { if (!Number.isFinite(r.azimuth)) return r; fixed++; return { ...r, azimuth: trueToUntiedGrid(r.azimuth, typedNorth) }; });
          return { rows: out, note: fixed ? tr(" {fixed} azimuth(s) converted from true north to the local grid's north, which the project gives as {deg}° from true north (east positive).", { fixed, deg: typedNorth }) : "", converted: fixed > 0 };
        }
        if (tie && (azimuthRef === "true" || azimuthRef === "magnetic") && !(azimuthGridEpsg && target !== "collars")) {
          let fixed = 0, example = null; const failed = new Set();
          const out = rows.map((r) => {
            if (!Number.isFinite(r.azimuth)) return r;
            const loc = locate(r);
            let o = null; try { o = loc ? localGridAzimuthOffset(azimuthRef, tie, loc.x, loc.y, azimuthDate) : null; } catch { o = null; }
            if (!o) { failed.add(r.hole_id); return r; }
            fixed++; if (!example) example = o;
            return { ...r, azimuth: wrap360(r.azimuth + o.offset) };
          });
          const sgn = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
          const note = (fixed ? tr(" {fixed} azimuth(s) converted from {north} to the local grid's north through its tie to EPSG:{epsg} (at the first hole: {parts}).", { fixed, north: azimuthRef === "magnetic" ? tr("magnetic north") : tr("true north"), epsg: tie.epsg, parts: [example.declination != null ? tr("declination {v}°", { v: sgn(example.declination) }) : "", tr("grid convergence {v}°", { v: sgn(example.convergence) }), tr("grid rotation {v}°", { v: sgn(example.rotationDeg) })].filter(Boolean).join(", ") }) : "")
            + (failed.size ? tr(" {size} hole(s) could not be converted (no collar location) and were left as-is: {v}.", { size: failed.size, v: [...failed].slice(0, 6).join(", ") }) : "");
          return { rows: out, note, converted: fixed > 0 };
        }
        if (live?.localGrid) return { rows, note: tr(" The azimuths were left as they are in the file, measured from {north}: this project is on a local grid with no tie to a coordinate system, so the grid's own north is not known. Tie the grid in Maps > Coordinates (control points, or an origin and a rotation), then import this file again.", { north: azimuthRef === "magnetic" ? tr("magnetic north") : azimuthRef === "true" ? tr("true north") : tr("another grid's north") }), crsUnset: true }; // #2491
        return { rows, note: tr(" The azimuths could not be converted to grid north and were left as they are in the file: that needs the project CRS, which isn't chosen yet (status bar). Choose it, then import this file again."), crsUnset: true };
      }
      if (!azimuthRef || azimuthRef === "grid") return applyGridOf(rows, locate);
      const epsg = (importStateRef.current.project || project)?.epsg;
      const cache = new Map();
      let fixed = 0; const failed = new Set(); let example = null;
      const out = rows.map((r) => {
        if (!Number.isFinite(r.azimuth)) return r;
        const loc = locate(r);
        const key = loc ? `${Math.round(loc.x / 100)},${Math.round(loc.y / 100)}` : null; // 100 m cells: same offset to <0.01 deg
        let o = key ? cache.get(key) : null;
        if (key && o === undefined) { try { o = azimuthToGridOffset(azimuthRef, loc.x, loc.y, epsg, azimuthDate); } catch { o = null; } cache.set(key, o); }
        if (!o) { failed.add(r.hole_id); return r; }
        fixed++; if (!example) example = o;
        return { ...r, azimuth: wrap360(r.azimuth + o.offset) };
      });
      const what = azimuthRef === "magnetic" ? `magnetic north (IGRF-14 at ${azimuthDate}: declination ${example?.declination >= 0 ? "+" : ""}${example?.declination?.toFixed(2)}°, grid convergence ${example?.convergence >= 0 ? "+" : ""}${example?.convergence?.toFixed(2)}° at the first hole)` : `true north (grid convergence ${example?.convergence >= 0 ? "+" : ""}${example?.convergence?.toFixed(2)}° at the first hole)`;
      const note = (fixed ? tr(" {fixed} azimuth(s) converted from {what} to grid north.", { fixed, what }) : "")
        + (failed.size ? tr(" {size} hole(s) could not be converted (no collar location or project CRS) and were left as-is: {v}.", { size: failed.size, v: [...failed].slice(0, 6).join(", ") }) : "");
      return { rows: out, note };
    };
    // TASKS.csv #490 — survey / structure azimuths measured from the grid north of ANOTHER CRS (e.g. a survey
    // file from a contractor working in the neighbouring UTM zone). These files have no coordinates, so each
    // hole's collar (project CRS) is taken back into that CRS and the bearing is rebuilt in the project grid.
    function applyGridOf(rows, locate) {
      const projEpsg = (importStateRef.current.project || project)?.epsg;
      if (target === "collars" || !azimuthGridEpsg || !projEpsg || Number(azimuthGridEpsg) === Number(projEpsg)) return { rows, note: "" };
      const fwd = pointTransform(azimuthGridEpsg, projEpsg), inv = pointTransform(projEpsg, azimuthGridEpsg);
      if (!fwd || !inv) return { rows, note: tr(" Azimuths left as they are: EPSG:{azimuthGridEpsg} isn't a CRS GeoStrix can convert.", { azimuthGridEpsg }) };
      let fixed = 0, maxTurn = 0; const failed = new Set();
      const out = rows.map((r) => {
        if (!Number.isFinite(r.azimuth)) return r;
        const loc = locate(r);
        if (!loc || !Number.isFinite(loc.x) || !Number.isFinite(loc.y)) { failed.add(r.hole_id); return r; }
        const [sx, sy] = inv(loc.x, loc.y);
        const a = turnGridBearing(fwd, sx, sy, r.azimuth);
        fixed++; maxTurn = Math.max(maxTurn, Math.abs(bearingTurn(r.azimuth, a)));
        return { ...r, azimuth: a };
      });
      const note = (fixed ? tr(" {fixed} azimuth(s) turned from the grid north of {v} to the project grid (up to {maxTurn}°).", { fixed, v: crsName(azimuthGridEpsg) || tr("EPSG:{azimuthGridEpsg}", { azimuthGridEpsg }), maxTurn: maxTurn.toFixed(2) }) : "")
        + (failed.size ? tr(" {size} hole(s) have no collar yet, so their azimuths were left as they are: {v}.", { size: failed.size, v: [...failed].slice(0, 6).join(", ") }) : "");
      return { rows: out, note };
    }
    if (AZ_TARGETS.has(target) && azimuthRef === "magnetic" && !/^\d{4}-\d{2}-\d{2}$/.test(azimuthDate || "")) { // AZ_TARGETS: #2895 — a magnetic choice left from another kind does not block a log
      setNotices((p) => [...p, notice("{fileName}: magnetic azimuths need the survey date to work out the declination — nothing was imported.", { fileName })]);
      return false;
    }
    const liveCollarAt = (() => { const m = new Map((importStateRef.current.collars || []).map((c) => [c.hole_id, c])); return (r) => m.get(r.hole_id) || null; })();
    const schema = TARGET_SCHEMAS[target];
    const logChans = logChannelsFor(target, Object.keys(allRows[0] || {}), allRows, mapping, data.logChannels); // #2160 — the channels are the values
    // TASKS.csv #2891 — Recovery % with no Value column: computed from core loss (or recovered length) and the drilled run, unless declined
    const recCalc = target === "recovery" && !mapping.value && !data.recoveryCalcOff ? recoveryColumns(Object.keys(allRows[0] || {})) : null;
    const missing = schema.fields.filter((f) => f.required && !mapping[f.key] && !(logChans && f.key === "value") && !(recCalc && f.key === "value"));
    if (missing.length) { setNotices((p) => [...p, notice("{fileName}: map required field(s) — {v}", { fileName, v: missing.map((f) => f.label).join(", ") })]); return false; }
    // TASKS.csv #1963 — a table pulled from a database: its record (profile, schema, table, these choices) for "Reload from database"
    if (dbSource?.profile && setDbImports) { const rec = dbImportRecord(data, dbSource, target); if (rec) setDbImports((prev) => upsertDbImport(prev, rec)); }
    const flipDip = (raw) => (dipConvention === "neg_down" ? -raw : raw);
    // TASKS.csv #548 — alpha/beta picks were oriented from the survey present at THEIR import; a new survey or
    // collar for those holes re-derives them (logged dip / dip direction and calculator results are left alone).
    const reorientAfter = (holeIds, newSurvey, newCollars, srcName) => {
      const st = importStateRef.current.layers?.structure;
      if (!st?.length) return;
      const survey = newSurvey || importStateRef.current.survey || [];
      const byHole = new Map();
      survey.forEach((sv) => { if (!byHole.has(sv.hole_id)) byHole.set(sv.hole_id, []); byHole.get(sv.hole_id).push(sv); });
      const cm = new Map((importStateRef.current.collars || []).map((c) => [c.hole_id, c]));
      (newCollars || []).forEach((c) => cm.set(c.hole_id, { ...(cm.get(c.hole_id) || {}), ...c }));
      const res = reorientAlphaBetaPicks(st, (h) => cm.get(h) || null, byHole, holeIds, surveyAzimuthDipAt);
      if (!res.derived) return;
      if (res.changed) setLayers((p) => ({ ...p, structure: reorientAlphaBetaPicks(p.structure, (h) => cm.get(h) || null, byHole, holeIds, surveyAzimuthDipAt).rows }));
      const moved = res.changed - res.newlyOriented, src = newSurvey ? "survey" : "collars";
      const said = [res.newlyOriented ? `oriented ${res.newlyOriented} alpha/beta structure pick(s) that had no hole direction until this ${src}` : "", moved ? `re-oriented ${moved} alpha/beta pick(s) from the new ${src} (largest change ${res.maxChangeDeg.toFixed(1)}°)` : ""].filter(Boolean).join("; ");
      if (said || res.failed.length) setNotices((p) => [...p, `${srcName}: ${said || tr("no alpha/beta pick changed")}${res.failed.length ? tr("; {failed} still could not be oriented (kept as they were): {v}{v2}", { failed: res.failed.length, v: res.failed.slice(0, 4).join("; "), v2: res.failed.length > 4 ? "; …" : "" }) : ""}.`]);
    };

    if (target === "collars") {
      const ranked = pickRankedCollarRows(allRows, mapping.hole_id, allRows.length ? Object.keys(allRows[0]) : []); // #600
      // TASKS.csv #1504 (review #1497, Lawyers) — the collar file's other columns (year, drill type, prospect, status, dates, comments)
      // were dropped without a word: kept as attrs (the surface-sample rule, #841: a column with up to 100 distinct values, or free text)
      const collarHdrs = allRows.length ? Object.keys(allRows[0]) : [], attrMapping = { ...mapping, _epsg: perRowEpsgCol || null, ...Object.fromEntries((customFields || []).map((f, k) => [`_c${k}`, f.column])) };
      const attrCols = surfaceAttrColumns(collarHdrs, ranked.rows, attrMapping);
      // TASKS.csv #2492 — a second set of coordinate columns (GBMG_East / GBMG_North / GBMG_RL beside the MGA ones used) is kept with each
      // hole whatever its number of distinct values; the columns still left out are named in the notice (#2190: STARTDATE, ENDDATE)
      for (const c of collarAlwaysKept(collarHdrs, attrMapping)) if (!attrCols.includes(c)) attrCols.push(c); // and date columns: #2190
      const notKept = collarHdrs.filter((h) => h && !attrCols.includes(h) && !Object.values(attrMapping).includes(h) && ranked.rows.some((r) => String(r[h] ?? "").trim() !== ""));
      // TASKS.csv #2161 — the drilling method normalized ("hole type": RC, Diamond (DD), RC + diamond tail, Aircore (AC), RAB...) beside the file's own column
      const htCol = holeTypeColumn(allRows.length ? Object.keys(allRows[0]) : []);
      const withHoleType = (a, r) => { const ht = htCol ? normalizeHoleType(r[htCol]) : null; return ht ? { attrs: { ...(a.attrs || {}), "hole type": ht } } : a; };
      let rows = ranked.rows.map((r) => applyCustomFields({
        // TASKS.csv #337 — num(): a blank cell is missing (NaN), not 0 (a blank RL used to put the collar at sea level).
        hole_id: String(r[mapping.hole_id] ?? "").trim(), x: num(r[mapping.x]), y: num(r[mapping.y]), z: num(r[mapping.z]),
        azimuth: mapping.azimuth ? num(r[mapping.azimuth]) : undefined,
        dip: mapping.dip ? flipDip(num(r[mapping.dip])) : undefined,
        length: mapping.length ? num(r[mapping.length]) : undefined,
        // Per-row source EPSG (TASKS.csv #205), carried alongside the row only long enough to drive
        // the reprojection pass below — stripped before the collar is stored.
        _rowEpsg: perRowEpsgCol ? String(r[perRowEpsgCol] ?? "").trim() : "",
        ...withHoleType(surfaceAttrs(r, attrCols), r), // #1504; hole type: #2161
      }, r, customFields));
      // TASKS.csv #337 — a collar without all three coordinates can't be placed; skip it and say which,
      // instead of the old behaviour of keeping it at z = 0.
      // TASKS.csv #2169 — a blank ELEVATION no longer skips the collar: it gets an assumed one after reprojection (fillMissingCollarZ below)
      const noCoords = rows.filter((r) => r.hole_id && !(Number.isFinite(r.x) && Number.isFinite(r.y))).map((r) => r.hole_id);
      rows = rows.filter((r) => r.hole_id && Number.isFinite(r.x) && Number.isFinite(r.y));
      const repeats = ranked.rankColumn ? { dropped: 0, holes: [] } : firstPerHole(rows); // TASKS.csv #2172 — a repeated hole id: the first row kept, counted
      if (repeats.dropped) rows = repeats.rows;
      if (noCoords.length) setNotices((p) => [...p, notice("{fileName}: {noCoords} collar(s) skipped — missing or non-numeric X or Y ({v}{v2}). Fix them in the file and re-import.", { fileName, noCoords: noCoords.length, v: noCoords.slice(0, 8).join(", "), v2: noCoords.length > 8 ? ", …" : "" })]);
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
      // #607 — the file's one declared CRS (Source CRS, or a per-row EPSG column with a single value) may become
      // the project CRS when nothing is loaded yet
      const rowCodes = [...new Set(rows.map((r) => r._rowEpsg).filter(Boolean))];
      const declaredEpsg = rowCodes.length === 1 && (!sourceEpsg || Number(sourceEpsg) === Number(rowCodes[0])) ? rowCodes[0] : (!rowCodes.length ? sourceEpsg : null);
      if (declaredEpsg) adoptCrsIfEmpty(declaredEpsg, fileName);
      const liveProject = importStateRef.current.project || project; // stale-closure fix, see liveCollars below
      // TASKS.csv #2288 — a local-grid project (#2180): rows that declare a CRS go INTO the grid through its tie; with no tie they stay as
      // they are (never 'reprojected' into the placeholder EPSG), and the notice says which
      const gridTie = liveProject?.crsSet === false && liveProject?.localGrid ? tieOf(liveProject) : null;
      if (liveProject?.crsSet === false && liveProject?.localGrid && (perRowEpsgCol || sourceEpsg)) {
        let moved = 0, kept = 0, failed = 0;
        rows.forEach((r) => {
          const fromEpsg = Number(r._rowEpsg || sourceEpsg) || null;
          if (!fromEpsg) { kept++; return; }
          if (!gridTie) { kept++; return; }
          const p = fileToLocal(gridTie, r.x, r.y, fromEpsg);
          if (!p) { failed++; return; }
          r.x = p.x; r.y = p.y; moved++;
          if (Number.isFinite(r.azimuth) && (!azimuthRef || azimuthRef === "grid")) r.azimuth = bearingToLocal(gridTie, r.azimuth);
        });
        reprojectNote = gridTie
          ? " " + tr("On import: {moved} row(s) brought into the local grid through its tie to EPSG:{tie}{v}.", { moved, tie: gridTie.epsg, v: failed ? tr("; {failed} could not be placed and kept their numbers", { failed }) : "" })
          : " " + tr("The file declares a coordinate system, but this project is on a local mine grid with no tie to one: the {kept} row(s) keep their numbers. Tie the grid to a CRS in Maps > Project CRS to bring such files in.", { kept });
      } else if (liveProject?.epsg && (perRowEpsgCol || (sourceEpsg && Number(sourceEpsg) !== Number(liveProject.epsg)))) {
        const toEpsg = liveProject.epsg;
        const groups = new Map(); // fromEpsg key ("" = fall back to global sourceEpsg) -> rows in that group
        rows.forEach((r) => {
          const key = r._rowEpsg || "";
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(r);
        });
        let reprojectedCount = 0, unreprojectedCount = 0, turned = 0, maxTurn = 0;
        const okEpsgs = [], badEpsgs = [];
        // TASKS.csv #490 — a grid azimuth is relative to the SOURCE grid's north; turn it with the convergence
        // difference (true / magnetic azimuths are converted from the project-CRS location further down).
        const gridAz = !azimuthRef || azimuthRef === "grid";
        for (const [rowEpsgKey, groupRows] of groups) {
          const fromEpsg = rowEpsgKey || sourceEpsg;
          if (!fromEpsg || Number(fromEpsg) === Number(toEpsg)) { unreprojectedCount += groupRows.length; continue; }
          let groupFailed = 0;
          const T = gridAz ? pointTransform(fromEpsg, toEpsg) : null;
          groupRows.forEach((r) => {
            const p = reprojectXY(r.x, r.y, fromEpsg, toEpsg);
            if (!p) { groupFailed++; return; }
            if (T && Number.isFinite(r.azimuth)) {
              const a = turnGridBearing(T, r.x, r.y, r.azimuth);
              maxTurn = Math.max(maxTurn, Math.abs(bearingTurn(r.azimuth, a))); turned++;
              r.azimuth = a;
            }
            r.x = p.x; r.y = p.y;
          });
          if (groupFailed && !badEpsgs.includes(fromEpsg)) badEpsgs.push(fromEpsg);
          unreprojectedCount += groupFailed;
          const succeeded = groupRows.length - groupFailed;
          if (succeeded) { reprojectedCount += succeeded; if (!okEpsgs.includes(fromEpsg)) okEpsgs.push(fromEpsg); }
        }
        const parts = [];
        if (reprojectedCount) parts.push(tr("reprojected {reprojectedCount} row(s) from EPSG:{okEpsgs} to the project's EPSG:{toEpsg}", { reprojectedCount, okEpsgs: okEpsgs.join("/"), toEpsg }));
        if (unreprojectedCount) parts.push(tr("left {unreprojectedCount} row(s) unchanged{v}", { unreprojectedCount, v: badEpsgs.length ? tr(" (unrecognized EPSG:{badEpsgs})", { badEpsgs: badEpsgs.join("/") }) : tr(" (already the project CRS, or no source CRS given)") }));
        if (turned) parts.push(tr("turned {turned} grid azimuth(s) to the project grid (up to {maxTurn}°)", { turned, maxTurn: maxTurn.toFixed(2) }));
        reprojectNote = parts.length ? tr(" On import: {parts}.", { parts: parts.join("; ") }) : "";
      }
      rows = rows.map(({ _rowEpsg, ...rest }) => rest);
      // TASKS.csv #2169 — collars with no elevation: the terrain at the collar, else the median collar elevation, else 0 m, flagged
      const terrainNow = importStateRef.current.terrain;
      const zFill = fillMissingCollarZ(rows, { existing: importStateRef.current.collars || [], groundAt: terrainNow ? (x, y) => terrainGroundAt(terrainNow, x, y) : null });
      rows = zFill.rows;

      // TASKS.csv #283 — this used to be a bare last-write-wins merge
      // (`new Map([...collars, ...rows].map(c => [c.hole_id, c]))`): re-dropping a collar file
      // silently replaced every matching hole's coordinates with no diff and no chance to say no,
      // which is quietly destructive when the file was grabbed from the wrong folder. Now the diff is
      // computed FIRST (diffCollarImport, layers.js — pure and unit-verified) and the user is only
      // interrupted when it would actually change something: a re-import of the identical file, or one
      // that only adds new holes, still commits straight through with no extra click.
      // BUG FIX (found verifying #407, 2026-09-23): commitImportData is reached from the multi-file queue
      // (processImportQueue, a useCallback created once), whose closure holds the FIRST render's `collars`
      // (usually []), so a multi-file drop merged against an empty list and REPLACED every existing collar
      // (the 37-hole sample became 2 holes after dropping a 2-hole collar file). Read the latest collars.
      const azc = applyAzimuthRef(rows, (r) => r); // #396 — collar's own (project-CRS) location
      rows = azc.rows;
      const liveCollars = importStateRef.current.collars || [];
      const diff = diffCollarImport(liveCollars, rows);
      let overwriteExisting = true;
      if (reload) { reload.changedHoles = diff.changed.length; reload.newHoles = diff.newHoles.length; } // #1963 — a reload takes the database's values and reports them
      if (diff.changed.length && !reload) {
        const preview = diff.changed.slice(0, 6).map((c) => {
          const moved = c.shift > 1e-6 ? ` — moves ${c.shift < 10 ? c.shift.toFixed(2) : c.shift.toFixed(0)} world units` : "";
          return `  • ${c.hole_id}: ${c.fields.join(", ")} differ${moved}`;
        }).join("\n");
        overwriteExisting = window.confirm(
          tr("{fileName} contains {changed} hole(s) that already exist in this project with DIFFERENT values:\n\n{preview}", { fileName, changed: diff.changed.length, preview }) +
          `${diff.changed.length > 6 ? tr("\n  …and {v} more", { v: diff.changed.length - 6 }) : ""}\n\n` +
          tr("OK — overwrite those {changed} collar(s) with this file's values (the old ones are lost).\n", { changed: diff.changed.length }) +
          tr("Cancel — keep the existing collars and import only the {newHoles} new hole(s).", { newHoles: diff.newHoles.length })
        );
      }
      // #600 — merged field by field (mergeCollar): a value the file lacks never wipes the existing one, and
      // a value the existing collar lacks is filled in even when the overwrite was declined.
      const prevById = new Map(liveCollars.map((c) => [c.hole_id, c]));
      const applied = rows.map((r) => (prevById.has(r.hole_id) ? settleAssumedZ(mergeCollar(prevById.get(r.hole_id), r, overwriteExisting), r) : r)); // settleAssumedZ: #2169
      // TASKS.csv #3004 / #2896 — the shared elevation rule: collars whose file elevation is probably a missing value (0 m among collars on
      // raised ground, or a stray far from all the others) are marked zSuspect, kept where the file puts them, and named in the notice
      setCollars((prev) => markSuspectElevations(Array.from(new Map([...prev, ...applied].map((c) => [c.hole_id, c])).values())).collars);
      const zTrust = markSuspectElevations(Array.from(new Map([...liveCollars, ...applied].map((c) => [c.hole_id, c])).values()));
      const appliedIds = new Set(applied.map((r) => r.hole_id)), suspectHere = zTrust.ids.filter((id) => appliedIds.has(id));
      reorientAfter(new Set(applied.map((r) => r.hole_id)), null, applied, fileName); // #548 — a collar's az / dip orients a hole without a survey
      setVisibleHoles((prev) => ({ ...prev, ...Object.fromEntries(applied.map((r) => [r.hole_id, true])) }));
      // The specific accounting the finding asked for ("12 of 40 collars already existed; 3 had
      // different coordinates and were updated") rather than a bare "Loaded N collars".
      const parts = [];
      if (diff.newHoles.length) parts.push(tr("{newHoles} new", { newHoles: diff.newHoles.length }));
      if (diff.changed.length) parts.push(overwriteExisting ? tr("{changed} existing hole(s) updated with different values", { changed: diff.changed.length }) : tr("{changed} existing hole(s) left untouched (you chose not to overwrite)", { changed: diff.changed.length }));
      if (diff.filled.length) parts.push(tr("{filled} existing hole(s) completed with values they did not have ({v})", { filled: diff.filled.length, v: ((fs) => fs.slice(0, 8).join(", ") + (fs.length > 8 ? "…" : ""))([...new Set(diff.filled.flatMap((f) => f.fields))]) })); // #600; at most 8 names: #1655 (29 kept columns were all listed)
      if (diff.unchanged.length) parts.push(tr("{unchanged} already present and identical", { unchanged: diff.unchanged.length }));
      if (repeats.dropped) parts.push(tr("{n} row(s) shared a hole id with an earlier row of the file; the first was kept ({ids})", { n: repeats.dropped, ids: repeats.holes.slice(0, 6).join(", ") + (repeats.holes.length > 6 ? ", …" : "") })); // #2172
      if (ranked.dropped) parts.push(tr("{holes} hole(s) had several location records ({dropped} extra rows) — kept the lowest \"{rankColumn}\" for each: {holes2}{v}", { holes: ranked.holes.length, dropped: ranked.dropped, rankColumn: ranked.rankColumn, holes2: ranked.holes.slice(0, 5).join(", "), v: ranked.holes.length > 5 ? ", …" : "" }));
      if (attrCols.length) parts.push(tr("{n} more column(s) kept with each hole (Identify shows them): {cols}", { n: attrCols.length, cols: attrCols.slice(0, 8).join(", ") + (attrCols.length > 8 ? "…" : "") })); // #1504
      if (notKept.length) parts.push(tr("{n} column(s) not imported, each with more than 100 different values (add one under Extra fields to keep it): {cols}", { n: notKept.length, cols: notKept.slice(0, 8).join(", ") + (notKept.length > 8 ? "…" : "") })); // #2492 / #2190
      // #2014 (review #2013, Woodjam) — 534 of 544 district collars had no azimuth / dip column and no survey: they were counted
      // ("Holes: 544") and never drawn, and this notice did not say so. They are now drawn as assumed vertical holes; say it here.
      const surveyedHoles = new Set((importStateRef.current.survey || []).map((sv) => sv.hole_id));
      const assumedVertical = applied.filter((c) => !surveyedHoles.has(c.hole_id) && holeAttitudeAssumed(c, []));
      if (assumedVertical.length) parts.push(tr("{n} hole(s) have no azimuth / dip and no survey: drawn as ASSUMED vertical holes (a collar marker and a dashed stick of the hole length), flagged in Data QC", { n: assumedVertical.length }));
      if (!surveyedHoles.size && assumedVertical.length < applied.length) parts.push(tr("no survey loaded, so each hole is drawn straight from its collar azimuth, dip and length")); // #1504
      { // TASKS.csv #2169 — said in the notice, with how each was placed
        const zc = zFill.counts, how = [];
        if (zc.terrain) how.push(tr("{n} on the terrain", { n: zc.terrain }));
        if (zc.median) how.push(tr("{n} at the median collar elevation ({z} m)", { n: zc.median, z: Math.round(zFill.medianZ) }));
        if (zc.zero) how.push(tr("{n} at 0 m (no terrain and no other elevation)", { n: zc.zero }));
        if (how.length) parts.push(tr("{n} collar(s) had no elevation and were placed at an ASSUMED one ({how}), flagged in Data QC", { n: zc.terrain + zc.median + zc.zero, how: how.join(", ") }));
        if (zc.kept) parts.push(tr("{n} hole(s) with no elevation in the file kept the one they already had", { n: zc.kept }));
      }
      { const up = upwardHoles(rows), list = up.slice(0, 5).join(", "); if (up.length) parts.push(up.length > 5 // #2886
        ? tr("{n} hole(s) point upward (a dip above horizontal: right for underground up-holes; for surface drilling, re-import with the other dip sign convention): {list} and {more} more", { n: up.length, list, more: up.length - 5 })
        : tr("{n} hole(s) point upward (a dip above horizontal: right for underground up-holes; for surface drilling, re-import with the other dip sign convention): {list}", { n: up.length, list })); }
      if (suspectHere.length) { // #2896 — said here and in Data QC
        const byId = new Map(applied.map((r) => [r.hole_id, r])), list = suspectHere.slice(0, 5).map((id) => `${id} (${Math.round(byId.get(id)?.z)} m)`).join(", ");
        parts.push(zTrust.range
          ? tr("{n} collar elevation(s) look like a missing value, far from the other collars ({lo}–{hi} m): {list}. They are placed as the file says, marked as suspect, and flagged in Data QC", { n: suspectHere.length, lo: Math.round(zTrust.range[0]), hi: Math.round(zTrust.range[1]), list: list + (suspectHere.length > 5 ? " …" : "") })
          : tr("{n} collar elevation(s) look like a missing value: {list}. They are placed as the file says, marked as suspect, and flagged in Data QC", { n: suspectHere.length, list }));
      }
      if (diff.duplicatesInFile.length) parts.push(tr("{duplicatesInFile} duplicate hole_id row(s) WITHIN the file itself (the last row of each hole won: {v})", { duplicatesInFile: diff.duplicatesInFile.length, v: [...new Set(diff.duplicatesInFile)].slice(0, 5).join(", ") }));
      setNotices((p) => [...p, notice("Loaded {size} collars from {fileName}{v}.{reprojectNote}{note}", { size: new Set(rows.map((r) => r.hole_id)).size, fileName, v: parts.length ? ` — ${parts.join("; ")}` : "", reprojectNote, note: azc.note })]);
    } else if (target === "survey") {
      const svDropped = []; // #1070
      const all = allRows.map((r) => applyCustomFields({ hole_id: String(r[mapping.hole_id] ?? "").trim(), depth: num(r[mapping.depth]), azimuth: num(r[mapping.azimuth]), dip: flipDip(num(r[mapping.dip])), _src: fileName }, r, customFields)).filter((r, k) => {
        if (r.hole_id && !isNaN(r.depth)) return true;
        svDropped.push({ reason: !r.hole_id ? "no hole id" : "no depth", example: allRows[k][mapping.depth] }); return false;
      });
      // TASKS.csv #337/#339 — a station with a blank or non-numeric azimuth/dip used to be kept and turned
      // every coordinate below it into NaN (or, blank = 0, into a horizontal hole). Skip and report it.
      const bad = all.filter((r) => !Number.isFinite(r.azimuth) || !Number.isFinite(r.dip));
      const azs = applyAzimuthRef(all.filter((r) => Number.isFinite(r.azimuth) && Number.isFinite(r.dip)), liveCollarAt); // #396
      // TASKS.csv #2494 — the method column's case variants folded (Gyro / GYRO), and each hole's survey measured or assumed
      const methodKey = surveyMethodKey(azs.rows), methodFold = methodKey ? foldCaseVariants(surveyMethodByHole(azs.rows, methodKey)?.values || new Map()) : new Map();
      const rows = methodFold.size ? azs.rows.map((r) => (methodFold.has(String(r[methodKey] ?? "").trim()) ? { ...r, [methodKey]: methodFold.get(String(r[methodKey]).trim()) } : r)) : azs.rows;
      const methodSum = methodKey ? surveyMethodByHole(rows, methodKey) : null;
      // TASKS.csv #336 — a hole's survey in this file REPLACES its earlier survey (with _src stamped so
      // the layer inspector can tell imports apart); undo restores the old one.
      const keep = batchRowsRef.current;
      const replaced = replaceRowsByHole(importStateRef.current.survey, rows, keep); // for the notice only (#582: replaced / appended)
      // TASKS.csv #2187 — upward stations (internal dips are positive down) and the holes still without a survey, said in the notice
      let svExtraNote = "";
      {
        const up = rows.filter((r) => r.dip < 0), upHoles = new Set(up.map((r) => r.hole_id));
        if (up.length) svExtraNote += dipConvention === "pos_down" // #2886 — the sign that points up depends on the convention chosen
          ? tr(" {n} station(s) in {h} hole(s) point upward (a negative dip, read with positive = down): upholes, or a sign error in the file?", { n: up.length, h: upHoles.size })
          : tr(" {n} station(s) in {h} hole(s) point upward (a positive dip, read with negative = down): upholes, or a sign error in the file?", { n: up.length, h: upHoles.size });
        const surveyed = new Set(replaced.rows.map((r) => r.hole_id)), cols = importStateRef.current.collars || [];
        const none = cols.filter((c) => !surveyed.has(c.hole_id)).map((c) => c.hole_id);
        if (cols.length && none.length) svExtraNote += tr(" {n} hole(s) still have no survey ({ids}).", { n: none.length, ids: none.slice(0, 5).join(", ") + (none.length > 5 ? " …" : "") });
      }
      setSurvey((prev) => replaceRowsByHole(prev, keepBatch(rows), keep, { identical: false }).rows); // #2799 — rows only
      // #2494 — the hole's survey method on its collar (an attr: the hole list's 'By a collar field' and 'Colour holes by' offer it)
      if (methodSum) setCollars((prev) => prev.map((c) => (methodSum.byHole.has(c.hole_id) ? { ...c, attrs: { ...(c.attrs || {}), "survey method": methodSum.byHole.get(c.hole_id) } } : c)));
      reorientAfter(new Set(rows.map((r) => r.hole_id)), replaceRowsByHole(importStateRef.current.survey, rows, keep, { identical: false }).rows, null, fileName); // #548
      // TASKS.csv #1268 — the same row check the interval layers get; a station has one depth
      import("../../lib/dataQC.js").then(({ importCheckSummary }) => {
        const msg = importCheckSummary(rows.map((r) => ({ hole_id: r.hole_id, from: r.depth, to: r.depth })), importStateRef.current.collars, null, `survey stations from ${fileName}`);
        if (msg) setNotices((p) => [...p, msg]);
      }).catch(() => {});
      // TASKS.csv #2491 — "converted to grid" only when they were: a refusal (no CRS, an untied local grid) says they were left as in the file
      const azNorth = (ref, res) => (ref === "true" || ref === "magnetic" ? (res.crsUnset ? tr(ref === "true" ? "true north, left as in the file" : "magnetic north, left as in the file") : tr(ref === "true" ? "true north, converted to grid" : "magnetic north, converted to grid")) : tr("grid north"));
      setNotices((p) => [...p, tr("Loaded {rows} survey stations from {fileName}.", { rows: rows.length, fileName }) + leftOutText(data, allRows, [data.azimuthRefFrom, ...(data.azimuthRefAlso || []).map((a) => a.col)]) /* #2341 */
        + replaceNote(replaced, "survey")
        + (bad.length ? tr(" Skipped {bad} station(s) with a missing or non-numeric azimuth/dip ({v}).", { bad: bad.length, v: [...new Set(bad.map((r) => `${r.hole_id}@${r.depth}`))].slice(0, 5).join(", ") }) : "")
        + skippedRowsText(svDropped, allRows.length) + azs.note
        + (data.azimuthRefFrom && mapping.azimuth === data.azimuthRefFrom ? tr(" Azimuths read from the {col} column ({north}).", { col: mapping.azimuth, north: azNorth(azimuthRef, azs) }) : "") // #2015; magnetic: #2154
        + (data.azimuthRefFrom && mapping.azimuth !== data.azimuthRefFrom && azimuthRef ? tr(" North reference from the {col} column ({north}).", { col: data.azimuthRefFrom, north: azNorth(azimuthRef, azs) }) : "") // #2154 (AZIMUTHGRIDNAME)
        + svExtraNote
        + (methodSum ? tr(" {col}: {assumed} of {n} hole(s) have only assumed survey stations (their direction was not measured), {measured} measured; each hole's collar now says 'survey method: assumed / measured' (hole list filter and colour, Identify).", { col: methodSum.key, assumed: methodSum.assumed.length, n: methodSum.byHole.size, measured: methodSum.measured }) + (methodFold.size ? tr(" Spellings folded: {list}.", { list: [...methodFold].map(([a, b]) => `${a} → ${b}`).join(", ") }) : "") : "") // #2494
        + (unseen && !azimuthRef && !azimuthGridEpsg ? tr(" Azimuths taken as grid north: the file does not say which north (import it on its own to choose true or magnetic north).") : "")]); // #1647
    } else if (target === "structure") {
      // TASKS.csv #719 — no sign convention for structure dips: the "negative = down" radio is shown only for collars and
      // survey, so a minus sign here is a logging error (unknown, counted below), not a 45 degree plane
      const stDropped = []; // #1070
      let structRows = allRows.map((r) => ({ ...normStructure(r, mapping, customFields, null), _src: fileName })).filter((r, k) => {
        if (r.hole_id && !isNaN(r.depth)) return true;
        stDropped.push({ reason: !r.hole_id ? "no hole id" : "no depth", example: allRows[k][mapping.depth] }); return false;
      });
      // TASKS.csv #427 — oriented-core alpha/beta -> true dip / dip direction, per pick, from the hole's
      // survey at that depth (desurvey.surveyAzimuthDipAt). Only for picks with no dip/dip direction of
      // their own; raw alpha/beta stay on the pick. Converted results are already grid-referenced (they
      // come from the hole's grid azimuths), so they skip the azimuth-reference step below.
      let abDone = 0; const abFailed = [];
      if (mapping.alpha && mapping.beta) {
        const surveyByHole = new Map();
        (importStateRef.current.survey || []).forEach((sv) => { if (!surveyByHole.has(sv.hole_id)) surveyByHole.set(sv.hole_id, []); surveyByHole.get(sv.hole_id).push(sv); });
        structRows = structRows.map((r) => {
          if (Number.isFinite(r.dip) && Number.isFinite(r.azimuth)) return r;
          if (!Number.isFinite(r.alpha) || !Number.isFinite(r.beta)) return r; // alpha-only stays unoriented
          const collar = liveCollarAt(r);
          const att = collar ? surveyAzimuthDipAt(collar, surveyByHole.get(r.hole_id) || [], r.depth) : null;
          const o = att ? orientFromAlphaBeta({ alphaDeg: r.alpha, betaDeg: r.beta, holeAzDeg: att.azimuth, holeDipDeg: att.dip, useTop: betaRefLine === "top" }) : { error: "no collar/survey for this hole" };
          if (o.error) { abFailed.push(`${r.hole_id}@${r.depth} (${o.error})`); return { ...r, abRef: betaRefLine === "top" ? "top" : "bottom" }; } // #548 — oriented later, when its survey / collar arrives
          abDone++;
          return { ...r, dip: o.dipDeg, azimuth: o.dipDirDeg, orientedFrom: `alpha/beta, ${betaRefLine === "top" ? "top" : "bottom"}-of-hole line`, abRef: betaRefLine === "top" ? "top" : "bottom", _abGrid: true }; // #548 — abRef: re-derived when the survey changes
        });
      }
      const azst0 = applyAzimuthRef(structRows.filter((r) => !r._abGrid), liveCollarAt); // #396
      const azst = { rows: [...azst0.rows, ...structRows.filter((r) => r._abGrid).map(({ _abGrid, ...r }) => r)], note: azst0.note };
      // TASKS.csv #2188 — picks with an alpha and no beta are kept unoriented: counted with the others (they were silent)
      const alphaOnly = mapping.alpha ? structRows.filter((r) => Number.isFinite(r.alpha) && !Number.isFinite(r.beta) && !(Number.isFinite(r.dip) && Number.isFinite(r.azimuth))).length : 0;
      if (alphaOnly) setNotices((p) => [...p, notice("{fileName}: {n} pick(s) have an alpha angle and no beta: kept unoriented (the stereonet counts them; the core orientation calculator can orient them from a reference).", { fileName, n: alphaOnly })]);
      if (abDone || abFailed.length) setNotices((p) => [...p, notice("{fileName}: {abDone} pick(s) oriented from alpha/beta using each hole's survey, beta measured clockwise from the {v}-of-hole line looking down-hole{v2}.{v3}", { fileName, abDone, v: betaRefLine === "top" ? tr("top") : tr("bottom"), v2: unseen ? tr(" (assumed: the file was imported without the dialog; import it through Import CSV to choose the top-of-hole line)") : "", v3: abFailed.length ? tr(" {abFailed} could not be oriented and are shown as unoriented: {v}{v2}.", { abFailed: abFailed.length, v: abFailed.slice(0, 5).join("; "), v2: abFailed.length > 5 ? "; …" : "" }) : "" })]);
      const rows = azst.rows;
      if (azst.note) setNotices((p) => [...p, `${fileName}:${azst.note}`]);
      // TASKS.csv #426 — say how many orientations were out of range (dropped to unknown, not guessed).
      const negDip = mapping.dip ? allRows.filter((r) => { const d = num(r[mapping.dip]); return Number.isFinite(d) && d < 0; }).length : 0; // #719
      const badDip = mapping.dip ? allRows.filter((r) => { const d = num(r[mapping.dip]); return Number.isFinite(d) && (d < 0 || d > 90); }).length : 0;
      if (badDip) setNotices((p) => [...p, { ...notice("{fileName}: {badDip} structure dip(s) outside 0-90° were set to unknown{v}.", { fileName, badDip, v: negDip ? tr(" ({negDip} negative: a structure's dip is 0-90° below horizontal, so a minus sign is read as an error, not as \"down\")", { negDip }) : "" }), level: "error" }]); // #1232 — data was dropped: it stays until read
      { // TASKS.csv #584 — say what the strike column did
        const ss = strikeStats(allRows, mapping);
        if (ss.derived || ss.mismatches) setNotices((p) => [...p, `${fileName}:${ss.derived ? tr(" {derived} dip direction(s) derived from strike by the right-hand rule (dip direction = strike + 90°).", { derived: ss.derived }) : ""}${ss.mismatches ? tr(" {mismatches} row(s) have a strike and a dip direction that are not 90° apart (right-hand rule) — the dip direction was used; check whether those strikes follow another convention.", { mismatches: ss.mismatches }) : ""}`]);
      }
      const keep = keepDerivedPicks(batchRowsRef.current); // #1234 — a pick worked out in the app is not the earlier file's data
      const replaced = replaceRowsByHole(importStateRef.current.layers?.structure, rows, keep);
      setLayers((p) => ({ ...p, structure: replaceRowsByHole(p.structure, keepBatch(rows), keep, { identical: false }).rows })); // #2799 // TASKS.csv #336
      if (replaced.replacedHoles.length || replaced.appendedHoles.length) setNotices((p) => [...p, `${fileName}:${replaceNote(replaced, "structure picks")}`]); // #582
      { const holes = new Set(rows.map((r) => r.hole_id)), saved = (importStateRef.current.layers?.structure || []).filter((r) => isDerivedPick(r) && holes.has(r.hole_id)).length; if (saved) setNotices((p) => [...p, tr("{saved} pick(s) from the Core orientation calculator were kept in these holes.", { saved })]); } // #1234
      setLayerVisible((p) => ({ ...p, structure: true }));
      setNotices((p) => [...p, appendNotice(notice("Loaded {rows} structure points from {fileName}.", { rows: rows.length, fileName }), skippedRowsText(stDropped, allRows.length))]); // #1070
    } else if (logChans) {
      // TASKS.csv #2160 (Matt's decision 2026-11-09) — a downhole log: one numeric layer per ticked channel, the unit from the column
      // name; binned (mean, min, max per bin) when chosen, which the dialog proposes when the readings would not fit
      const chans = logChans;
      const src = data.logTable || allRows, readings = logReadings(src); // #3038 — every reading of a log read into typed columns
      const binM = data.logBinM !== undefined ? data.logBinM : defaultLogBin(readings, chans.length, needsBinning(readings, chans.length) ? logBinEstimate(src, mapping) : null); // #2885 — the bin that fits, as the dialog shows
      const base = String(fileName).replace(/\.(csv|txt|las|xlsx?)$/i, "");
      const made = [];
      chans.forEach((col, k) => {
        const nd = data.logKeepNoData ? null : channelNoData(src, col, unitFromHeader(col)); // #2332 — no-data codes left out unless kept
        const out = logChannelRows(src, mapping, col, binM, nd?.values || null);
        if (!out.rows.length) return;
        const unit = String(data.logUnits?.[col] ?? unitFromHeader(col)).trim(); // TASKS.csv #2952 — the unit typed beside the channel in the import (side 2, agreed with Main)
        const id = `custom_${Date.now()}_${k}`;
        const group = new THREE.Group(); group.name = id;
        layerGroupsRef.current[id] = group;
        sceneRef.current.getObjectByName("root").add(group);
        const name = `${base}: ${col}`;
        const rowsOut = out.rows; for (const r of rowsOut) r._src = fileName; // #2885 — stamped in place, not a second copy of every row
        // TASKS.csv #2329 — a From / To log: each reading placed at its interval's middle, said in the layer's notes (project text: English)
        const mid = !mapping.depth && mapping.from && mapping.to ? `Each reading placed at the middle of its ${mapping.from}-${mapping.to} interval.` : "";
        const binNote = out.binned ? `Binned on import to ${binM} m: mean of ${out.readings} reading(s), with each bin's min and max (fields min, max, n). Source: ${fileName}.` : "";
        const ndNote = nd && out.dropped ? `Left out on import as no-data codes: ${out.dropped} value(s) (${noDataText(nd)}).` : ""; // #2332
        setCustomLayers((p) => [...p, { id, name, rows: rowsOut, group, unit: unit || undefined, ...(out.binned ? { binM } : {}), ...(binNote || mid || ndNote ? { notes: [binNote, mid, ndNote].filter(Boolean).join(" ") } : {}) }]);
        setCustomVisible((p) => ({ ...p, [id]: k === 0 }));
        made.push(`${col}${unit ? ` (${unit})` : ""}: ${out.rows.length.toLocaleString()}${out.skipped ? ` (${out.skipped} without a number)` : ""}${out.dropped ? ` (${out.dropped.toLocaleString()} no-data value(s) left out: ${noDataText(nd)})` : ""}`); // dropped: #2332
      });
      setNotices((p) => [...p, tr("{fileName}: {n} downhole log channel(s) imported as numeric layers{v}: {list}. The first is shown; the others are in the Layers list.", { fileName, n: made.length, v: binM ? tr(", averaged to {b} m bins (mean, with min and max)", { b: binM }) : tr(", every reading kept"), list: made.join("; ") })]);
    } else if (target === "custom") {
      // TASKS.csv #2338 (review #2325, WA uranium) — the custom route kept rows with a blank value (155 of geology_current.csv) and rows
      // with no interval and no depth (all 424 of a gamma calibration table: From only), said "Added ... (424 rows)" and drew nothing.
      // They are left out and counted as the built-in routes do (#2182); with nothing left to draw, nothing is added.
      const cDropped = [];
      const rows = [];
      for (const r of allRows) {
        const row = applyCustomFields({
          hole_id: String(r[mapping.hole_id] ?? "").trim(),
          from: mapping.from ? num(r[mapping.from]) : undefined, to: mapping.to ? num(r[mapping.to]) : undefined,
          depth: mapping.depth ? num(r[mapping.depth]) : undefined, value: r[mapping.value],
        }, r, customFields);
        if (!row.hole_id) { cDropped.push({ reason: "no hole id" }); continue; }
        if (isBlankCode(row.value)) { cDropped.push({ reason: "no code" }); continue; }
        if (!Number.isFinite(row.depth) && !(Number.isFinite(row.from) && Number.isFinite(row.to))) { cDropped.push({ reason: "no interval", example: row.hole_id }); continue; }
        rows.push(row);
      }
      const layerName = String(data.customName || "").trim() || (mapping.value ? `${String(fileName).replace(/\.csv$/i, "")}: ${mapping.value}` : String(fileName).replace(/\.csv$/i, "")); // #2338
      if (!rows.length) {
        setNotices((p) => [...p, errorNotice(tr("{fileName}: nothing was added as a custom layer: no row has both a value and an interval (From and To) or a Depth, so there is nothing to draw down the holes.{v}", { fileName, v: skippedRowsText(cDropped, allRows.length) }))]);
      } else {
      const id = `custom_${Date.now()}`;
      const group = new THREE.Group(); group.name = id;
      layerGroupsRef.current[id] = group;
      sceneRef.current.getObjectByName("root").add(group);
      // TASKS.csv #2317 — depth picks by code (regolith events): the layer says what the known codes stand for, and the notice where they go
      const evNotes = mapping.depth && !mapping.from && !mapping.to ? eventNotes(rows) : null;
      setCustomLayers((p) => [...p, { id, name: layerName, rows, group, ...(evNotes ? { notes: evNotes } : {}) }]);
      setCustomVisible((p) => ({ ...p, [id]: true }));
      setNotices((p) => [...p, evNotes
        ? notice("Added \"{fileName}\" as a layer of depth picks ({rows} rows, {codes}): drawn on the traces, and offered as picks in the Explicit surface tool (one per hole) for a surface such as the base of oxidation.", { fileName, rows: rows.length, codes: [...new Set(rows.map((r) => String(r.value ?? "").trim()).filter(Boolean))].slice(0, 8).join(", ") })
        : appendNotice(notice("Added \"{name}\" as a custom layer ({rows} rows).", { name: layerName, rows: rows.length }), skippedRowsText(cDropped, allRows.length))]); // #2338
      }
    } else {
      // _src (source filename) is stamped on every row here — TASKS.csv #63: lets the layer inspector
      // (LayerInspector.jsx) break a layer down by which import it came from, since it's common to
      // build up one layer (e.g. lithology) from several CSVs (different holes, different field
      // seasons) and later want to pull just one of those back out without clearing the whole layer.
      const numeric = LAYER_META[target].numeric;
      // #1070 — what is left out, and why, goes into the notice
      const dropped = [];
      const { rows: filledRows, filled: idsFilled } = fillDownHoleIds(allRows, mapping); // #1665 — continuation rows with a blank hole id
      const sib = numeric ? null : numberedSiblings(Object.keys(allRows[0] || {}), mapping.value, mapping.extra); // #1650 — Min_Code1..n
      const altStyle = target === "alt" ? String(data.altStyle ?? alterationStyleFromName(fileName)).trim() : ""; // #1511 — 'Oxidation: Pchy'
      const styleCode = (v) => (altStyle && v != null && v !== "" ? styledAltValue(altStyle, v) : v);
      let codesKept = 0, codesRows = 0, blankRows = 0, blankTookNext = 0, blankKept = 0; // blank*: #2493
      const rows = filledRows.map((raw) => {
        const r = numeric ? normNumericInterval(raw, mapping, customFields) : normInterval(raw, mapping, customFields);
        if (recCalc) r.value = recoveryPct(raw, recCalc, mapping); // #2891
        let extra = 0; // #2874 — this row's count of codes beyond the drawn one
        if (sib) { const a = allCodesOf(raw, sib); if (a.extra) { r.all_codes = a.all; r.codes = a.codes; codesKept += a.extra; codesRows++; extra = a.extra; } } // codes: #1650
        if (altStyle) { r.value = styleCode(r.value); r.alt_style = altStyle; if (Array.isArray(r.codes)) r.codes = r.codes.map(styleCode); } // #1511
        // #2182 — a blank code: the next numbered code if the row has one (Min_Code2), else the row is skipped and counted, not 'Unknown'
        // #2493 — or, when the dialog's "keep blank codes as (no code)" is ticked, kept as that explicit class (the log stays continuous)
        if (!numeric && isBlankCode(raw[mapping.value])) { blankRows++; const next = Array.isArray(r.codes) ? r.codes.find((c) => !isBlankCode(c)) : null; if (next) { r.value = String(next).trim(); blankTookNext++; if (extra) { codesKept--; if (extra === 1) codesRows--; } /* #2874 — that code is drawn now, not 'not drawn' */ } else if (data.keepBlankCodes) { r.value = NO_CODE; blankKept++; } else r.value = null; }
        const why = !r.hole_id ? "no hole id" : isNaN(r.from) ? "no from" : numeric && isNaN(r.value) ? "no value" : !numeric && r.value == null ? "no code" : null;
        if (why) { dropped.push({ reason: why, example: why === "no from" ? raw[mapping.from] : why === "no value" ? raw[mapping.value] : null }); return null; }
        return { ...r, _src: fileName };
      }).filter(Boolean);
      // TASKS.csv #336 — rows for a hole already in this layer replace that hole's earlier rows.
      const keep = batchRowsRef.current;
      const replaced = replaceRowsByHole(importStateRef.current.layers?.[target], rows, keep); // #582: replaced / appended
      setLayers((p) => ({ ...p, [target]: replaceRowsByHole(p[target], keepBatch(rows), keep, { identical: false }).rows })); // #2799 — rows only
      setLayerVisible((p) => ({ ...p, [target]: true }));
      // TASKS.csv #2493 — the rows the import left out, kept with the project for Data QC (lib/importLeftOut.js); this file's entry replaced
      recordImportLeftOut?.(target, fileName, dropped, allRows.length);
      const dictAdded = !numeric && fillCodeDictionary ? fillCodeDictionary(target, rows) : 0; // TASKS.csv #2163 — codes with no meaning yet take the description logged beside them
      if (numeric) { const vals = rows.map((r) => r.value); setNumericRange((p) => ({ ...p, [target]: minMax(vals) })); } // not Math.min/max(...) — see layers.js's minMax comment
      // TASKS.csv #540 — what is wrong with these rows, said now (Data QC loads on demand: not in the startup bundle)
      const liveAtImport = importStateRef.current;
      import("../../lib/dataQC.js").then(({ importCheckSummary, PLAUSIBLE_RANGE }) => {
        const msg = importCheckSummary(rows, liveAtImport.collars, liveAtImport.survey, `${LAYER_META[target].label} rows from ${fileName}`, PLAUSIBLE_RANGE[target] || null); // #1508 — and values no rock has
        if (msg) setNotices((p) => [...p, msg]);
      }).catch(() => {});
      setNotices((p) => [...p, tr("Loaded {rows} rows into {label} from {fileName}.", { rows: rows.length, label: LAYER_META[target].label, fileName })
        + (recCalc ? " " + (recCalc.loss // #2891 — said: the file had no percentage
          ? tr("Recovery % computed from {loss} and {run}: (run − loss) / run × 100.", { loss: recCalc.loss, run: recCalc.drilled || tr("To − From") })
          : tr("Recovery % computed from {rec} and {run}: recovered / run × 100.", { rec: recCalc.recovered, run: recCalc.drilled || tr("To − From") })) : "")
        + replaceNote(replaced, "rows") + skippedRowsText(blankRows ? dropped.filter((d) => d.reason !== "no code") : dropped, allRows.length) /* #2900 (3) — blank codes are said once, by blankCodeText */ + leftOutText(data, allRows, [...(sib?.codes || []), ...(recCalc ? [recCalc.loss, recCalc.recovered, recCalc.drilled].filter(Boolean) : [])]) /* #2341; the columns Recovery % was computed from: #2891 */
        + (codesKept ? " " + tr("{n} more code(s) in {cols} on {m} interval(s) are not drawn (each interval is coloured by {first}); every code is kept on its interval as all_codes, which Identify lists. Hiding the first code in the legend shows such an interval in its next code's colour.", { n: codesKept, m: codesRows, cols: sib.codes.length > 1 ? `${sib.codes[0]}–${sib.codes[sib.codes.length - 1]}` : sib.codes[0], first: sib.first }) : "") // #1650; one column named once: #2153
        + (idsFilled ? " " + tr("{n} row(s) with a blank hole id took the hole id of the row above, their depths continuing it: check them if the file is laid out otherwise.", { n: idsFilled }) : "") // #1665
        + (blankRows ? " " + blankCodeText(mapping.value, blankRows, allRows.length, blankTookNext, blankKept) : "") // #2493 — always said
        + (dictAdded ? " " + (dictAdded === 1 ? tr("1 code took its meaning from the description logged beside it (the code dictionary in the layer's inspector, where it can be edited).") : tr("{n} codes took their meaning from the description logged beside them (the code dictionary in the layer's inspector, where they can be edited).", { n: dictAdded })) : "")]); // #2163
    }
    return true;
  };

  // TASKS.csv #615 — collar coordinates with no CRS of their own, into a project whose CRS was never chosen: ask
  // which CRS they are in BEFORE they are placed (a CSV can't say, and the placeholder used to be taken as the
  // answer). "Decide later" imports them anyway; the status bar keeps saying "CRS: not set".
  const askCrsForCollars = async (m) => {
    const live = importStateRef.current;
    if (m.target !== "collars" || live.project?.crsSet !== false || live.project?.localGrid || m.sourceEpsg || m.perRowEpsgCol || m.localGridOn) return; // localGrid: #2180 — not asked again
    const xc = m.mapping?.x, yc = m.mapping?.y;
    const pts = xc && yc ? (m.allRows || []).map((r) => ({ x: parseFloat(String(r[xc]).replace(",", ".")), y: parseFloat(String(r[yc]).replace(",", ".")) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) : null;
    const { epsgFromColumns, gridFrameFromRows, smallGridCoordinates, crsFamilyFromColumns } = await import("../../lib/crsFromColumns.js"); // #1345 — the headers may name it
    const hdrs = m.headers || Object.keys((m.allRows || [])[0] || {}), file = String(m.fileName).replace(/ \(\d+ more queued\)$/, "");
    // TASKS.csv #2155 / #2156 / #2181 — or the rows' own grid name (GRIDNAME = MGA94_51), a local grid, frames mixed in one file, eastings no zone has
    const frame = gridFrameFromRows(hdrs, m.allRows), small = smallGridCoordinates(pts);
    // TASKS.csv #2495 — the MAPPED coordinate columns named after a grid family (MGA_E / MGA_N): its zones, each with where the collars land
    // (one code when the header names the zone and datum, MGA94_50_E: chosen like a named CRS)
    const family = crsFamilyFromColumns([xc, yc].filter(Boolean));
    const byHeader = epsgFromColumns(hdrs) || (family?.codes.length === 1 ? family.codes[0] : null), named = byHeader || frame?.epsg || null;
    const zones = !named && family && !frame?.local && !small ? family : null; // not over a local grid's own warning
    const fr = (g) => tr("{name}: {n} row(s)", { name: g.name, n: g.rows });
    const warn = [
      frame?.mixed ? tr("The {col} column names more than one frame ({list}): these rows are not in one coordinate system, so no single CRS places them all. Import the groups as separate files.", { col: frame.cols.join(" / "), list: frame.groups.slice(0, 4).map(fr).join(", ") }) : "",
      !frame?.mixed && frame?.local ? tr("The {col} column names a local grid ({name}), not a map projection: no CRS here places these collars on the map.", { col: frame.cols.join(" / "), name: frame.groups[0].name }) : "",
      small && !frame?.local ? tr("{n} of {of} collars have eastings {x0}–{x1} and northings {y0}–{y1}, which no UTM / MGA zone has: they look like a local mine grid.", { n: small.n, of: small.of, x0: Math.round(small.x[0]).toLocaleString(), x1: Math.round(small.x[1]).toLocaleString(), y0: Math.round(small.y[0]).toLocaleString(), y1: Math.round(small.y[1]).toLocaleString() }) : "",
    ].filter(Boolean).join(" ");
    const chosen = await requestProjectCrs((named
      ? (byHeader ? tr("{file}: the column names say these collars are in EPSG:{code}, chosen below. Check it on the map, then use it. They are placed as they are, with no conversion.", { file, code: named })
        : tr("{file}: the {col} column says {name} (EPSG:{code}), chosen below. Check it on the map, then use it. They are placed as they are, with no conversion.", { file, col: frame.cols.join(" / "), name: frame.groups[0].name, code: named }))
      : zones ? tr("{file}: the {cols} column names say {grid} coordinates, but not the zone: each zone below shows where these collars would land. They are placed as they are, with no conversion.", { file, cols: zones.cols.join(" / "), grid: zones.grid }) // #2495
      : `${file}: which coordinate system are these collar coordinates in? They are placed as they are, with no conversion.`) + (warn ? ` ${warn}` : ""), pts, named, { family: zones });
    if (chosen) importStateRef.current = { ...importStateRef.current, project: { ...importStateRef.current.project, epsg: chosen, crsSet: true } };
  };

  // Modal's "Import" button: commit whatever's currently in importModal state, then close it and
  // let the multi-file queue (if there is one) move on to the next file.
  // TASKS.csv #548 (found testing) — a second click on Import while the first was still awaiting (the CRS prompt,
  // the IGRF chunk) committed the SAME file again and advanced the queue once per click: four clicks imported the
  // collars four times and silently skipped the next three queued files (headers, survey). One commit at a time.
  const commitBusyRef = useRef(false);
  const commitImport = async () => {
    if (!importModal || commitBusyRef.current) return;
    commitBusyRef.current = true;
    try { await commitImportOnce(); } finally { commitBusyRef.current = false; }
  };
  const commitImportOnce = async () => {
    await askCrsForCollars(importModal); // #615
    if (importModal.azimuthRef === "magnetic") { try { await loadIgrf(); } catch { /* offline chunk load failed: the conversion reports the holes it couldn't convert */ } } // #552
    // TASKS.csv #412 — feet and local mine grid are applied to the raw rows before the normal import.
    let modalData = importModal;
    // TASKS.csv #3038 — a big log read into typed columns stands for this import only as the log it was read as: the same hole and depth
    // columns, its channels, metres, no grid or shift, no row filter. Anything else reads the file again as rows, as before.
    if (modalData.logTable) {
      const chans = logChannelsFor(modalData.target, modalData.headers, modalData.allRows, modalData.mapping, modalData.logChannels);
      const rf = modalData.rowFilter !== undefined ? modalData.rowFilter : defaultRowFilter(modalData.headers, modalData.allRows);
      const plain = (modalData.units || "m") === "m" && !(modalData.target === "collars" && modalData.localGridOn) && !Number(modalData.zShift);
      if (!(chans && plain && !rf?.col && logTableFits(modalData.logTable, modalData.mapping, chans))) {
        setNotices((p) => [...p, notice("{fileName}: read again in full for this import: it was read for its log channels only.", { fileName: modalData.fileName })]);
        const { parseTableFile } = await import("../../lib/tabular.js");
        const t = await parseTableFile(modalData.file);
        modalData = { ...modalData, allRows: t.rows, rowCount: t.rows.length, logTable: undefined };
      }
    }
    const units = importModal.units || "m";
    const gridOn = importModal.target === "collars" && importModal.localGridOn;
    if (units === "ft" || gridOn || Number(importModal.zShift)) {
      let grid = null;
      if (gridOn) {
        try { grid = fitSimilarity(parseControlPoints(importModal.localGridText)); }
        catch (e) { setNotices((p) => [...p, errorNotice(tr("{fileName}: local grid — {message} Nothing was imported.", { fileName: importModal.fileName, message: e.message }))]); return; } // #739
        if (importModal.sourceEpsg && Number(importModal.sourceEpsg) !== Number(project?.epsg)) {
          setNotices((p) => [...p, notice("{fileName}: a local-grid transform gives project coordinates directly — clear Source CRS (it is set to EPSG:{sourceEpsg}). Nothing was imported.", { fileName: importModal.fileName, sourceEpsg: importModal.sourceEpsg })]);
          return;
        }
        // TASKS.csv #2489 (review #2486, WA lithium) — the control points' map side is in some CRS, and on a project with none chosen (a
        // local-grid project, #2180) the notice said the collars moved 'to EPSG:3156', the placeholder, and nothing asked. Ask which CRS the
        // control points are in, with the collars where they would land as the check; none chosen, nothing is imported (as the tick says).
        if (importStateRef.current.project?.crsSet === false) {
          const xc = importModal.mapping?.x, yc = importModal.mapping?.y;
          const landed = transformImportRows(importModal.allRows, importModal.mapping, { units, grid, zShift: 0 }).rows;
          const pts = xc && yc ? landed.map((r) => ({ x: parseFloat(String(r[xc])), y: parseFloat(String(r[yc])) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) : null;
          const chosen = await requestProjectCrs(tr("{fileName}: the control points turn these mine-grid coordinates into map coordinates. Which coordinate system are the control points' map coordinates in? The collars are placed in it.", { fileName: importModal.fileName }), pts, null, { noLocalGrid: true }); // noLocalGrid: #2621
          if (!chosen) { setNotices((p) => [...p, notice("{fileName}: the local-grid transform needs the coordinate system its control points are in, and none was chosen. Nothing was imported.", { fileName: importModal.fileName })]); return; }
          importStateRef.current = { ...importStateRef.current, project: { ...importStateRef.current.project, epsg: chosen, crsSet: true, localGrid: null } };
        }
      }
      const zShift = importModal.target === "collars" ? Number(importModal.zShift) || 0 : 0;
      const t = transformImportRows(importModal.allRows, importModal.mapping, { units, grid, zShift });
      modalData = { ...importModal, allRows: t.rows };
      setNotices((p) => [...p, `${importModal.fileName}:${units === "ft" ? " depths/lengths" + (importModal.mapping.z ? tr(" and elevations") : "") + " converted from feet to metres (x 0.3048)." : ""}${grid ? tr(" {moved} collar(s) moved from the local grid to EPSG:{v} (scale {scale}, rotation {rotationDeg}° counter-clockwise from the local grid to the map, RMS {rmsM} m over {n} control points){v2}.", { moved: t.moved, v: importStateRef.current.project?.epsg ?? project?.epsg /* #2489: the CRS just chosen, never a placeholder */, scale: grid.scale.toFixed(6), rotationDeg: grid.rotationDeg.toFixed(3), rmsM: grid.rmsM.toFixed(2), n: grid.n, v2: t.turned ? tr("; {turned} azimuth(s) turned with the grid ({v}°)", { turned: t.turned, v: (-grid.rotationDeg).toFixed(3) }) : "" }) : ""}${zShift ? tr(" Elevations shifted by {zShift} m.", { zShift }) : ""}`]);
    }
    commitImportData(modalData);
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
  // TASKS.csv #1350 — an assay file dropped here went no further than "import it from the Geochem module instead": a dead end
  // for someone who dropped the whole drill folder (42807Z). It is now handed to the Geochem assay import (which has the element
  // checklist) — at once for a single file, after the rest of the queue for a folder, so this view's own dialogs come first.
  const assayHandoffRef = useRef([]);
  // TASKS.csv #2016 (review #2013, Import) — a point shapefile / GeoPackage / KML of samples was handed to Geochem as its File, which read the
  // binary .shp as text ('0 elements recognized', NUL column names). Its rows are already read here: they go on with their headers and the
  // CRS of its .prj / SRS (a CSV or workbook still goes as the File, which Geochem reads itself).
  const assayHandoffOf = (file, rows, headers, meta) => {
    if (isSurfaceSampleTable(headers)) surfaceHandoffRef.current.add(file.name); // #2268 — said as surface samples, where Geochem opens them
    return /\.(shp|zip|gpkg|kml|kmz)$/i.test(file.name) || meta?.vector
      ? { name: file.name, parsedTable: { headers, rows, sourceEpsg: meta?.detectedEpsg || null } }
      : file;
  };
  const surfaceHandoffRef = useRef(new Set());
  const handOverAssays = () => {
    const files = assayHandoffRef.current.splice(0);
    if (!files.length) return;
    goToModule("geochem");
    requestModuleAction("import-assay-file", { files }); // #1652 — all of them, in turn
    const surface = surfaceHandoffRef.current.has(files[0].name); surfaceHandoffRef.current.clear();
    setNotices((p) => [...p, surface ? notice("{name} looks like a table of surface samples (coordinates, no from / to, no hole ID), so it opened in Geochem's surface-sample import, where you choose the elements. Not samples? Cancel there and use + Add CSV layer in the 3D View's sidebar to import it as a layer of your own.", { name: files[0].name }) /* #2268 */ : notice("{name} is assay data: it is open in the Geochem assay import, which asks which columns are elements. Not assays? Cancel there and use + Add CSV layer in the 3D View's sidebar to import it as a layer of your own.", { name: files[0].name }), // the way out: #2185
      ...(files.length > 1 ? [notice("{n} more assay file(s) follow in the Geochem import, one after another: {list}.", { n: files.length - 1, list: files.slice(1).map((f) => f.name).join(", ") })] : [])]);
  };
  const processImportQueue = useCallback(() => {
    const file = importQueueRef.current.shift();
    if (!file) { importActiveRef.current = false; batchRowsRef.current = null; setTaskProgress?.(null); importQueueTotalRef.current = 0; handOverAssays(); return; } // #1350
    const total = importQueueTotalRef.current || importQueueRef.current.length + 1;
    const doneCount = total - importQueueRef.current.length; // this file counts as "now processing"
    setTaskProgress?.({ label: `Importing files (${doneCount}/${total}): ${file.name}`, pct: Math.round((doneCount / total) * 100) });
    parseVectorFile(file, (data, err, meta) => {
      // TASKS.csv #288 — a multi-layer .zip/.gpkg in a multi-file drop opens the picker and pauses the
      // queue here; the picker's own onPick/onCancel resumes it (openImportModal -> mapping modal ->
      // commitImport/cancel -> processImportQueue), so the queue can't advance past an unanswered
      // question or double-import the same file.
      if (meta?.layerOptions) { setLayerPicker({ file, options: meta.layerOptions }); return; }
      if (err || !data || !data.length) { setNotices((p) => [...p, notice("{name}: couldn't read {v}.", { name: file.name, v: err ? "file (" + err + ")" : tr("— no rows found") })]); processImportQueue(); return; }
      if (isMapGeometry(meta)) { sendToMapLayers(file, meta.vector); processImportQueue(); return; } // #609
      const headers = meta?.headers || Object.keys(data[0]);
      if (meta?.note) setNotices((p) => [...p, `${file.name}:${meta.note}`]);
      if (looksLikeAssay(headers, file.name, data) || looksLikeSurfaceSamples(headers, data)) { // file.name: #1105; data: #2185; soils: #2268
        assayHandoffRef.current.push(assayHandoffOf(file, data, headers, meta)); // #1350 — to the Geochem import when the queue is done; #2016
        processImportQueue();
        return;
      }
      const target = guessTargetFor(headers, file.name, data); // #605; data: #2884
      const schema = TARGET_SCHEMAS[target];
      const queueLl = lonLatForCollars(target, guessMapping(target, headers), headers, data); // #1235
      const mapping0 = azColFor(target, headers, data, queueLl ? queueLl.mapping : guessMapping(target, headers)); // #426; #2015
      const codeGuess = codeColumnGuess(target, headers, data, mapping0), mapping = codeGuess ? { ...mapping0, value: codeGuess.col } : mapping0; // #2889 — a guess: never 'exact', so the dialog opens
      const missingRequired = schema.fields.filter((f) => f.required && !mapping[f.key]).concat(schemaSatisfied(target, mapping) || !schema.oneOf ? [] : [{ key: "oneOf", label: "From / To or Depth" }]); // #605
      // TASKS.csv #335 — only commit unseen when every REQUIRED column matched a header exactly (not
      // just by substring), and — for tables with a dip — when every dip in the file is <= 0, i.e.
      // actually consistent with the "negative = down" convention this path assumes. A positive-down
      // export (Datamine style) used to be committed silently and plotted every hole pointing up.
      // #2015 — the survey's corrected azimuth column, picked from the file's own north columns, counts as an exact match
      const azColPicked = target === "survey" || target === "collars" ? detectAzimuthRef(headers, data)?.azimuthCol : null; // collars: #2154
      const exactRequired = schema.fields.filter((f) => f.required).every((f) => mapping[f.key] && (guessColumnExact(headers, f.aliases) === mapping[f.key] || (f.key === "azimuth" && azColPicked && mapping.azimuth === azColPicked)));
      const dipCol = schema.dipConvention || target === "survey" ? mapping.dip : null;
      const dipsAgree = !dipCol || data.every((r) => { const d = Number(r[dipCol]); return r[dipCol] == null || r[dipCol] === "" || !Number.isFinite(d) || d <= 0; });
      // #1647 — a stated north: true is converted unseen; magnetic (needs a date) or a mix of norths opens the dialog
      const azDetected = AZ_TARGETS.has(target) ? detectAzimuthRef(headers, data) : null;
      const azOk = !azDetected || (!azDetected.mixed && azDetected.ref !== "magnetic" && !azDetected.hint && !azDetected.also); // hint (#2015): gyros only, no corrected column: asked; also (#2154): two azimuth columns, asked
      const guarded = guardGuess(target, mapping, headers, data, file.name); // #1649 — never unseen into another file's log
      // TASKS.csv #2893 — never unseen into a code layer whose codes this file shares none of (another code system: the dialog says so)
      const otherCodes = !LAYER_META[target]?.numeric && otherCodeSystem(codeOverlap(importStateRef.current.layers?.[target], data, mapping.value, mapping.hole_id));
      const confident = target !== "custom" && !guarded.guessNote && missingRequired.length === 0 && exactRequired && dipsAgree && azOk && !otherCodes;
      // TASKS.csv #609 — the file's own CRS (.prj / GeoPackage) and a per-row EPSG column, as openImportModal passes
      // them: a queued shapefile used to be committed with no Source CRS, so its collars stayed in their own UTM
      // zone's numbers inside a project in another zone (~400 km from the same drop's reprojected map layers).
      // TASKS.csv #2899 — a queued survey gets the same pre-added instrument / method field as one dropped alone (#2187)
      const modalData = { ...(codeGuess ? { valueGuess: codeGuess } : {}), ...(target === "survey" ? { customFields: surveyMethodFields(headers, data) } : {}), ...azRefFor(target, headers, data), file, fileName: file.name, headers, rowCount: meta?.logTable ? meta.logTable.n : data.length, sampleRows: data.slice(0, 5), allRows: data, ...(meta?.logTable ? { logTable: meta.logTable } : {}) /* #3038 */, target, mapping, ...dipConventionFields(data, dipColOf(target, mapping)) /* #2886 */,
        sourceEpsg: queueLl ? queueLl.sourceEpsg : meta?.detectedEpsg ? String(meta.detectedEpsg) : "", perRowEpsgCol: guessColumn(headers, EPSG_COL_ALIASES), ...guarded };
      if (confident) {
        // TASKS.csv #1501 — a log's other columns as extra fields, and a Geotech table's Recovery % as that layer too (collars keep
        // theirs as attrs, #1504; a survey has no others worth keeping)
        const comp = companionLayer(target, headers);
        const extras = target === "collars" ? [] : target === "survey" ? surveyMethodFields(headers, data) /* #2187 */ : autoExtraFields(headers, data, mapping, { exclude: [modalData.perRowEpsgCol, comp?.column].filter(Boolean) });
        askCrsForCollars(modalData).then(() => {
          commitImportData({ ...modalData, customFields: extras, unseen: true }); // #615; unseen: #715 — no dialog, so its defaults are assumptions
          if (comp) commitImportData({ ...modalData, target: comp.target, mapping: { ...mapping, value: comp.column }, customFields: [], unseen: true });
          const said = [extras.length ? tr("kept {n} more column(s) with each row (Identify shows them): {cols}", { n: extras.length, cols: extras.slice(0, 8).map((f) => f.column).join(", ") + (extras.length > 8 ? "…" : "") }) : "", comp ? tr("its \"{col}\" column also filled {layer}", { col: comp.column, layer: LAYER_META[comp.target]?.label || comp.target }) : ""].filter(Boolean);
          if (said.length) setNotices((p) => [...p, `${file.name}: ${said.join("; ")}.`]);
          processImportQueue();
        });
      } else {
        const remaining = importQueueRef.current.length;
        setImportModal({ ...modalData, fileName: remaining ? `${file.name} (${remaining} more queued)` : file.name });
      }
    });
  }, [setTaskProgress]);

  // TASKS.csv #190/#191 — .zip (shapefile bundle) and .gpkg accepted here alongside .csv, matching
  // the file inputs' own accept="" lists below. A bare .shp (no surrounding .zip) is also accepted —
  // its .dbf / .prj / .cpg dropped in the SAME drop are paired with it by basename (groupShapefileParts, #600);
  // a .shp dropped alone imports coordinates only, and the notice says to bring its .dbf and .prj.
  // TASKS.csv #2632 — a GOCAD Voxet (.vo) dropped with its property side files: one block model per property it can read. -> the side files used
  const importVoxet = async (vo, allIn, fromFolder = false) => { // allIn: the dropped files, or (header) => the side files (#2725)
    const used = [];
    try {
      const vx = await import("../../lib/gocadVoxet.js"), vox = await import("../../lib/voxel.js");
      const h = vx.parseVoxetHeader(await vo.text()), n = h.n[0] * h.n[1] * h.n[2];
      // TASKS.csv #2692 — a rotated voxet is resampled onto an east / north / up lattice (each block the nearest voxet node), and says so
      const lattice = vx.isVoxetAligned(h) ? null : vx.alignedLattice(h), g = vx.voxetGrid(lattice ? lattice.header : h);
      const made = [], missing = [], failed = [], all = typeof allIn === "function" ? await allIn(h) : allIn;
      let coarse = null;
      for (const prop of h.props) {
        const f = vx.findPropFile(prop, all);
        if (!f) { missing.push(`${prop.name} (${prop.file || "?"})`); continue; }
        used.push(f.name);
        try {
          const vals = vx.readVoxetValues(new Uint8Array(await f.arrayBuffer()), prop, n);
          let { mesh, values } = lattice ? vx.voxetToUbc(lattice.header, vx.resampleVoxet(lattice, vals)) : vx.voxetToUbc(h, vals);
          const { fx, fy, fz } = vox.planCoarsenFactors(mesh.nx, mesh.ny, mesh.nz, vox.MAX_CELLS);
          if (fx > 1 || fy > 1 || fz > 1) { ({ mesh, values } = vox.coarsenUBCModel(mesh, values, fx, fy, fz, { log: vox.wantsLogMean(values, prop.name) })); coarse = { fx, fy, fz }; }
          const cells = vox.ubcMeshToCells(mesh, Array.from(values));
          if (!cells.length) { failed.push(tr("{name}: no value other than no-data", { name: prop.name })); continue; }
          const { min, max } = vox.cellValueRange(cells);
          const name = `${h.name || vo.name.replace(/\.vo$/i, "")} — ${prop.name}${prop.unit ? ` (${prop.unit})` : ""}`;
          addVoxelModel({ name, source: "gocad", cells, min, max, property: prop.name, ...(prop.unit ? { unit: prop.unit } : {}), params: { tool: "GOCAD Voxet import", file: vo.name, nodes: [g.nx, g.ny, g.nz], nodeStepM: g.step.map((s) => +s.toFixed(4)), ...(lattice ? { resampledFrom: { nodes: h.n, rotationDeg: +lattice.rotationDeg.toFixed(2) } } : {}) /* #2692 */, ...(coarse ? { coarsenedBy: [coarse.fx, coarse.fy, coarse.fz] } : {}) } });
          made.push(`${prop.name} (${cells.length.toLocaleString()} blocks)`);
        } catch (err) { failed.push(err.message); }
      }
      const parts = [made.length ? tr("Imported the GOCAD Voxet \"{name}\" as {n} block model(s): {list}; {nx} × {ny} × {nz} nodes, each a block of {dx} × {dy} × {dz} m centred on its node. Its coordinates are taken as the project's (GOCAD files carry no EPSG code).", { name: h.name || vo.name, n: made.length, list: made.join(", "), nx: g.nx, ny: g.ny, nz: g.nz, dx: +g.step[0].toFixed(2), dy: +g.step[1].toFixed(2), dz: +g.step[2].toFixed(2) }) : "",
        made.length && lattice ? tr("The Voxet is rotated ({deg}° from east in plan), so it was resampled onto a lattice along east, north and up of {nx} × {ny} × {nz} blocks of {dx} × {dy} × {dz} m, each taking the value of the nearest voxet node (blocks outside the voxet are left empty).", { deg: +lattice.rotationDeg.toFixed(1), nx: g.nx, ny: g.ny, nz: g.nz, dx: +lattice.step[0].toFixed(2), dy: +lattice.step[1].toFixed(2), dz: +lattice.step[2].toFixed(2) }) : "",
        coarse ? tr("Averaged {fx} × {fy} × {fz} nodes into each block to stay within the block budget.", coarse) : "",
        missing.length ? (fromFolder ? tr("Not found beside the .vo in its folder, so not read: {list}.", { list: missing.join(", ") }) : tr("Not in the drop, so not read: {list}. Drop the .vo together with the files its PROP_FILE lines name.", { list: missing.join(", ") })) : "",
        failed.length ? tr("Could not read: {list}.", { list: failed.join("; ") }) : ""].filter(Boolean).join(" ");
      setNotices((p) => [...p, made.length ? parts : errorNotice(tr("{name}: no block model made. {why}", { name: vo.name, why: parts || tr("The Voxet names no property.") }))]);
    } catch (err) { setNotices((p) => [...p, errorNotice(tr("{name}: couldn't read the GOCAD Voxet ({message}).", { name: vo.name, message: err.message }))]); }
    return used;
  };
  const handleDrop = async (e) => {
    e.preventDefault(); setDragOver(false);
    const grouped = groupShapefileParts(Array.from(e.dataTransfer.files || [])); // #600: loose .shp + .dbf/.prj
    // TASKS.csv #2632 — GOCAD Voxets with their side files, read first; their side files are not 'unrecognized'
    const voFiles = grouped.files.filter((f) => /\.vo$/i.test(f.name)), voSide = new Set();
    for (const f of voFiles) (await importVoxet(f, grouped.files)).forEach((name) => voSide.add(name));
    // TASKS.csv #600 (40958Z) — grids (.tif/.gxf), CAD lines / solids (.dxf) and .obj solids dropped here used to
    // be refused ("Only .csv … can be dropped") although the Browser panel and the Raster / 3D Modelling buttons
    // import them: they go to those same handlers (importBrowserFile / importSolidFile), outside the table queue.
    const direct = grouped.files.filter((f) => /\.(tiff?|gxf|grd|dxf|obj|ts|gp|pl)$/i.test(f.name)); // grd: #1347; ts / gp / pl: GOCAD, #1992
    for (const f of direct) { if (/\.(obj|ts|gp)$/i.test(f.name)) importSolidFile(f); else await importBrowserFile(f); }
    // TASKS.csv #1992 — a GOCAD VSet (points with properties) is a point survey: read on the Geophysics tab
    const vsNames = grouped.files.filter((f) => /\.vs$/i.test(f.name)).map((f) => f.name);
    // TASKS.csv #1991 — a Leapfrog .msh is a solid; a UBC-GIF tensor mesh (also .msh, text 'NX NY NZ') is a block model mesh
    const mshAdvice = [];
    for (const f of grouped.files.filter((x) => /\.msh$/i.test(x.name))) {
      if (looksLikeUbcMesh(new Uint8Array(await f.slice(0, 400).arrayBuffer()))) mshAdvice.push(notice("{name}: a UBC-GIF mesh. Load it with its model file in Geophysics > Block models.", { name: f.name }));
      else importSolidFile(f);
    }
    const mshCount = grouped.files.filter((x) => /\.msh$/i.test(x.name)).length;
    let files = grouped.files.filter((f) => /\.(csv|zip|gpkg|shp|kml|kmz|xlsx|las)$/i.test(f.name)); // kml/kmz: #424, xlsx: #605, las: #492
    // TASKS.csv #603 — a closed format (Geosoft .gdb / .grd, .dwg, Access) gets the way out, not "unrecognized"
    const advised = grouped.files.map((f) => unreadableFormatAdvice(f.name)).filter(Boolean);
    advised.push(...mshAdvice);
    if (vsNames.length) advised.push(notice("{names}: GOCAD point sets are read as point surveys: drop them on the Geophysics tab, or use Geophysics > Point survey > Import survey.", { names: vsNames.slice(0, 4).join(", ") + (vsNames.length > 4 ? " …" : "") }));
    // TASKS.csv #1989 — MT / AMT soundings are read on the Geophysics tab, not here
    const ediNames = grouped.files.filter((f) => /\.edi$/i.test(f.name)).map((f) => f.name);
    if (ediNames.length) advised.push(notice("{names}: MT / AMT soundings are read on the Geophysics tab. Drop the .edi files there, or use Geophysics > MT / AMT.", { names: ediNames.slice(0, 4).join(", ") + (ediNames.length > 4 ? " …" : "") }));
    // TASKS.csv #1994 — a lidar point cloud (.laz, or a binary .las starting "LASF"; a LAS well log is text) goes to the Geophysics tab
    const lidarNames = [];
    for (const f of grouped.files.filter((x) => /\.la[sz]$/i.test(x.name))) {
      const b = /\.laz$/i.test(f.name) ? null : new Uint8Array(await f.slice(0, 4).arrayBuffer());
      if (!b || (b[0] === 0x4c && b[1] === 0x41 && b[2] === 0x53 && b[3] === 0x46)) lidarNames.push(f.name);
    }
    if (lidarNames.length) {
      files = files.filter((f) => !lidarNames.includes(f.name));
      goToModule("maps"); requestModuleAction("maps-lidar", { file: grouped.files.find((f) => f.name === lidarNames[0]) }); // Maps > Terrain reads it
      advised.push(notice(lidarNames.length > 1 ? "{names}: lidar point clouds, read in Maps > Terrain one at a time. The first is open there; drop the others there after it." : "{names}: a lidar point cloud, opened in Maps > Terrain.", { names: lidarNames.slice(0, 4).join(", ") + (lidarNames.length > 4 ? " …" : "") }));
    }
    if (advised.length) setNotices((p) => [...p, ...advised]);
    const skipped = grouped.files.length - files.length - direct.length - advised.length - voFiles.length - voSide.size /* #2632 */ - (mshCount - mshAdvice.length) /* #1991: the Leapfrog meshes went to the solid import */ - Math.max(0, vsNames.length - 1) /* #1992 */ - Math.max(0, ediNames.length - 1) /* #1989: one notice for all of them */ - Math.max(0, lidarNames.length - 1) /* #1994 */ + grouped.unmatched.length;
    if (!files.length) {
      if (!direct.length && !advised.length && !mshCount && !voFiles.length) setNotices((p) => [...p, notice("Only .csv, .xlsx, .zip (shapefile), .shp, .gpkg, .kml/.kmz, .las logs, GeoTIFF / .gxf grids and .dxf / .obj files can be dropped in directly.")]);
      else if (skipped) setNotices((p) => [...p, notice("{skipped} unrecognized file(s) skipped.", { skipped })]);
      return;
    }
    if (skipped) setNotices((p) => [...p, notice("{skipped} unrecognized file(s) skipped.", { skipped })]);
    // TASKS.csv #605 — an Excel workbook becomes one CSV per non-empty sheet ("Book - Sheet.csv"), queued like
    // dropped CSVs: same detection (the sheet name is the hint), same dialogs.
    if (files.some((f) => isXlsxName(f.name))) {
      const expanded = [];
      for (const f of files) {
        if (!isXlsxName(f.name)) { expanded.push(f); continue; }
        try {
          const { xlsxToCsvFilesAsync } = await import("../../lib/xlsx.js"); // #552; in a worker: #1671
          const sheets = await xlsxToCsvFilesAsync(new Uint8Array(await f.arrayBuffer()), f.name);
          setNotices((p) => [...p, notice("{name}: {sheets} sheet(s) with data — {v}. Each is imported like a CSV.", { name: f.name, sheets: sheets.length, v: sheets.map((s) => `${s.sheet} (${s.rows})`).join(", ") })]);
          sheets.forEach((s) => expanded.push(new File([s.text], s.name, { type: "text/csv" })));
        } catch (err) { setNotices((p) => [...p, errorNotice(tr("{name}: could not read the workbook ({message}).", { name: f.name, message: err.message }))]); }
      }
      files = expanded;
      if (!files.length) return;
    }
    if (files.length === 1) { openImportModal(files[0]); return; }
    // TASKS.csv #229 — ignore a second drop-queue start while one is still draining (see
    // importActiveRef's own comment above processImportQueue) instead of stomping the in-flight queue.
    if (importActiveRef.current) { setNotices((p) => [...p, notice("Already importing a previous drop — please wait for it to finish before dropping more files.")]); return; }
    importActiveRef.current = true;
    batchRowsRef.current = new WeakSet(); // #605
    setNotices((p) => [...p, notice("Importing {files} files — auto-detecting each one, will ask when unsure…", { files: files.length })]);
    importQueueTotalRef.current = files.length;
    importQueueRef.current = await orderImportFiles(files); // #600: collars, then surveys, then the rest
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
  // reject it here with a notice). Since TASKS.csv #1124 the caller loads them (lib/sampleHarry.js).
  const [sampleLoading, setSampleLoading] = useState(false);
  // TASKS.csv #637 — two bundled sample projects; Woodjam's assays / ZTEM model / IP lines are loaded by the caller
  // (lib/sampleWoodjam.js) — only the drillhole tables go through this queue.
  const SAMPLES = {
    harry: {
      dir: "harry_property", epsg: 3156, crs: "NAD83(CSRS) / UTM zone 9N",
      files: ["collars.csv", "litho.csv", "alt.csv", "vein.csv", "mnlgy.csv", "geotech.csv", "magsusc.csv", "structure.csv"],
      notice: "Loading the Harry property sample project — 37 real drillholes from BC's public ARIS database (report #37584), with the interval layers synthesized around the real assay anomalies. See sample_data/harry_property/README.md for exactly what's real vs. synthetic. Their assays (assay_wide.csv) are loaded into the Geochem tab too.",
    },
    woodjam: {
      dir: "woodjam", epsg: 26910, crs: "NAD83 / UTM zone 10N",
      files: ["collars.csv", "survey.csv", "litho.csv", "alt.csv", "vein.csv", "mnlgy.csv", "geotech.csv", "magsusc.csv", "sg.csv", "structure.csv"],
      notice: "Loading the Woodjam sample project — 19 diamond drillholes from 2023 with their real logs, gyro surveys, oriented structures and assays, plus the 2023 IP lines and ZTEM 3D inversion, all from BC's public assessment report #41597. Nothing in it is synthesized (sample_data/woodjam/README.md).",
    },
    // TASKS.csv #1346 — ARIS 42807; its assays and rock / soil / stream samples are loaded by the caller (lib/sampleSilvertip.js)
    silvertip: {
      dir: "silvertip", epsg: 26909, crs: "NAD83 / UTM zone 9N",
      files: ["collars.csv", "survey.csv", "litho.csv", "alt.csv", "breccia.csv", "vein.csv", "mnlgy.csv", "struct_zones.csv", "geotech.csv", "recovery.csv", "magsusc.csv", "structure.csv"],
      notice: "Loading the Silvertip sample project — 9 deep diamond drillholes from 2024 (to 1,323 m) with their logs, surveys, oriented structures and assays, plus 168 rock, 282 soil and 156 stream-sediment samples, all from BC's public assessment report #42807. Nothing in it is synthesized (sample_data/silvertip/README.md).",
    },
    // TASKS.csv #2168 — WAMEX report A87304 (Western Australia, CC BY 4.0); its assays and gamma log are loaded by the caller (lib/sampleWaUranium.js)
    wa_uranium: {
      dir: "wa_uranium", epsg: 28351, crs: "GDA94 / MGA zone 51",
      files: ["collars.csv", "survey.csv", "litho.csv", "alt.csv", "weath.csv"], // weath.csv: TASKS.csv #2342 — the oxidation state as Weathering
      notice: "Loading the Western Australian palaeochannel-uranium sample project — 430 aircore and diamond drillholes from 2009-2010 with their lithology and alteration logs, multi-element assays and a downhole gamma / eU3O8 log, from the State's open-file WAMEX drillhole database (report A87304, CC BY 4.0). Nothing in it is synthesized (sample_data/wa_uranium/README.md).",
    },
    // TASKS.csv #3107 — its assays and other parts are loaded by the caller (lib/sampleWa.js)
    wa_iron: {
      dir: "wa_iron", epsg: 28350, crs: "GDA94 / MGA zone 50",
      files: ["collars.csv", "survey.csv", "litho.csv"],
      notice: "WA bedded iron (WAMEX report A119232): 147 shallow holes from 2018 on one block of a flat-lying iron deposit under cover, with strand logs, XRF assays, downhole density, gamma and magnetic-susceptibility logs, and Geoscience Australia's magnetic grid over it — nothing synthesized.",
    },
    // TASKS.csv #3107 — its assays and other parts are loaded by the caller (lib/sampleWa.js)
    wa_lead_zinc: {
      dir: "wa_lead_zinc", epsg: 28352, crs: "GDA94 / MGA zone 52",
      files: ["collars.csv", "survey.csv", "litho.csv", "weath.csv", "sg.csv"],
      notice: "WA lead-silver-zinc (WAMEX report A91581): 99 shallow holes from 2010 on a carbonate-hosted deposit in the east Kimberley, with lithology, weathering, assays and specific gravity — nothing synthesized.",
    },
    // TASKS.csv #3107 — its assays and other parts are loaded by the caller (lib/sampleWa.js)
    wa_zinc_copper: {
      dir: "wa_zinc_copper", epsg: 28350, crs: "GDA94 / MGA zone 50",
      files: ["collars.csv", "survey.csv", "litho.csv", "weath.csv", "alt.csv", "mnlgy.csv"],
      notice: "WA zinc-copper (WAMEX report A77713): 32 holes from 2007 on sulphide prospects in felsic volcanic rocks of the east Pilbara, with logs and assays, and 157 soil and 46 stream-sediment samples — nothing synthesized.",
    },
    // TASKS.csv #3107 — its assays and other parts are loaded by the caller (lib/sampleWa.js)
    wa_gold: {
      dir: "wa_gold", epsg: 28351, crs: "GDA94 / MGA zone 51",
      files: ["collars.csv", "survey.csv", "litho.csv", "weath.csv", "alt.csv", "vein.csv", "structure.csv"],
      notice: "WA lode gold (WAMEX report A122506): 66 inclined holes from 2018-2019 on a gold prospect east of Kalgoorlie, with lithology, alteration, veining, oriented structures and 14,664 gold assays — nothing synthesized.",
    },
  };
  const loadSampleProject = async (which = "harry") => {
    if (sampleLoading || importActiveRef.current) return false;
    const S = SAMPLES[which] || SAMPLES.harry;
    setSampleLoading(true);
    try {
      const files = await loadSampleFiles(S.dir, S.files);
      // TASKS.csv #617 — the sample's CRS is known: set it when the project's CRS was never chosen, instead of
      // stopping on #615's "which CRS are these collars in?" dialog
      const live = importStateRef.current;
      if (live.project?.crsSet === false && live.setEpsg) {
        live.setEpsg(S.epsg);
        importStateRef.current = { ...live, project: { ...live.project, epsg: S.epsg, crsSet: true } };
        setNotices((p) => [...p, notice("Project CRS set to {crs} (EPSG:{epsg}), the sample project's coordinate system.", { crs: S.crs, epsg: S.epsg })]);
      } else if (live.project?.epsg && Number(live.project.epsg) !== S.epsg) {
        setNotices((p) => [...p, notice("The sample project's coordinates are EPSG:{epsg} ({crs}), but this project is EPSG:{epsg2}: the holes will not line up with anything else in it. Load the sample into a new project.", { epsg: S.epsg, crs: S.crs, epsg2: live.project.epsg })]);
      }
      setNotices((p) => [...p, notice(S.notice)]); // #786 — the two SAMPLES notices are in the dictionaries
      importActiveRef.current = true;
      batchRowsRef.current = new WeakSet(); // #605
      importQueueTotalRef.current = files.length;
      importQueueRef.current = files;
      processImportQueue();
      return true;
    } catch (err) {
      setNotices((p) => [...p, errorNotice(tr("Couldn't load the sample project: {message}", { message: err.message }))]);
      return false;
    } finally {
      setSampleLoading(false);
    }
  };

  // #1649 — for the dialog: what importing this file as its CURRENT type would replace
  const importOverlap = (m) => (m ? layerOverlap(m.target, m.mapping, m.allRows || [], m.fileName) : null);
  // TASKS.csv #1963 — Matt: "the option on the 3d view to reload the imported layers from the database ... a reload data button.
  // That way I don't have to search for the schema in the database and load it again." Every recorded import is pulled again
  // through its saved profile (the live connection, or a new one: a remembered password connects without asking, #621) and
  // committed through the same dialog choices; assay tables go back through Geochem's commit. Says what each table gave.
  const reloadDbImports = async () => {
    const recs = dbImports || [];
    if (!recs.length) { setNotices((p) => [...p, notice("Nothing to reload: no layer of this project was imported from a database yet (Browser panel > a database table, or Database on the ribbon).")]); return; }
    if (!connectDb) return;
    const lines = [];
    let assayRecs = 0;
    for (const rec of recs) {
      const src = rec.dbSource || {};
      const label = `${src.schema ? `${src.schema}.` : ""}${src.table}`;
      const profile = (dbConnections || []).find((p) => p.name === src.profile);
      if (!profile) { lines.push(tr("{table}: the connection profile \"{name}\" is not on this computer (Database > connect with that name, or reimport).", { table: label, name: src.profile })); continue; }
      const con = await connectDb(profile);
      if (!con.ok) { lines.push(`${label}: ${con.error || tr("could not connect")}`); continue; }
      setTaskProgress?.({ label: tr("Reloading {table}", { table: label }), pct: 5 });
      const pulled = await pullAllRows({ liveId: con.id, engine: profile.engine || "postgres", schema: src.schema, table: src.table, limit: src.limit, setTaskProgress, label: tr("Reloading {table}", { table: label }) });
      setTaskProgress?.(null);
      if (!pulled.ok) { lines.push(`${label}: ${pulled.error}`); continue; }
      if (!pulled.rows.length) { lines.push(tr("{table}: the table is empty now; its rows were left as they were.", { table: label })); continue; }
      if (rec.target === "assays") {
        assayRecs++;
        requestModuleAction("reload-assay-rows", { saved: rec.choices, rows: pulled.rows, headers: pulled.fields, dbSource: src });
        lines.push(tr("{table} → assays: {n} row(s) pulled, committed through Geochem's assay import with the saved elements and options.", { table: label, n: pulled.rows.length.toLocaleString() }));
        continue;
      }
      const live = importStateRef.current;
      const before = rec.target === "collars" ? (live.collars || []).length : rec.target === "survey" ? (live.survey || []).length : (live.layers?.[rec.target] || []).length;
      const report = {};
      const ok = commitImportData({ ...rec.choices, target: rec.target, fileName: rec.fileName, allRows: pulled.rows, headers: pulled.fields, unseen: true, dbSource: src, reload: report });
      lines.push(ok === false
        ? tr("{table} → {target}: the saved column mapping no longer fits the table (a column was renamed?) — reimport it once from the Browser panel.", { table: label, target: rec.target })
        : tr("{table} → {target}: {n} row(s) pulled{v} (the layer had {before} row(s) before){v2}.", { table: label, target: rec.target, n: pulled.rows.length.toLocaleString(), v: pulled.truncated ? tr(", the first {k} of {total}", { k: pulled.rows.length.toLocaleString(), total: pulled.total.toLocaleString() }) : "", before: before.toLocaleString(), v2: report.changedHoles != null ? tr("; {changed} existing hole(s) took the database's values, {fresh} new", { changed: report.changedHoles, fresh: report.newHoles }) : "" }));
    }
    if (assayRecs) goToModule("geochem");
    setNotices((p) => [...p, notice("Reloaded from the database: {lines}", { lines: lines.join(" · ") })]);
  };

  return { commitImport, handleDrop, importBrowserFile, importOverlap, layerPicker, loadSampleProject, openImportFromRows, openImportModal, processImportQueue, sampleLoading, setLayerPicker, reloadDbImports };
}
