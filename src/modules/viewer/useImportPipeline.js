// TASKS.csv #445 step 3 — the viewer's import pipeline: file -> mapping dialog (openImportModal, importBrowserFile,
// openImportFromRows), the commit into the store (commitImportData, commitImport), the multi-file drag-and-drop
// queue (processImportQueue, handleDrop) and the sample-project loader, moved out of ViewerModule.jsx VERBATIM
// (by script; relative import paths re-based to this folder). ViewerModule calls this hook at the same point in
// its body as the code used to run, so React's hook order (the useState / useRef / useCallback inside) and every
// closure see exactly the same values as before. `ctx` = what the code reads from the component, listed by an
// eslint-scope analysis; the return = what the rest of ViewerModule uses.
import { useRef, useState, useCallback } from "react";
import { errorNotice, notice, appendNotice } from "../../lib/notices.js"; // TASKS.csv #739 — caught errors show as errors whatever their wording
import * as THREE from "three";
import { reprojectXY, pointTransform, turnGridBearing, bearingTurn, crsName, guessEpsgFromPrjWkt } from "../../lib/reproject.js";
import { surveyAzimuthDipAt } from "../../lib/desurvey.js";
import { azimuthToGridOffset, wrap360, loadIgrf } from "../../lib/azimuthRef.js"; // loadIgrf: #552
import { orientFromAlphaBeta, reorientAlphaBetaPicks } from "../../lib/coreOrientation.js";
import { fitSimilarity, parseControlPoints, transformImportRows } from "../../lib/localGrid.js";
import { loadSampleFiles } from "../../lib/desktop.js";
const isXlsxName = (name) => /\.xlsx$/i.test(String(name || "")); // TASKS.csv #605 (same test as xlsx.js; the reader itself loads on demand, #552)
import { buildLayer } from "../../lib/mapLayerBuild.js"; // TASKS.csv #609
import { askAdoptCrs } from "../../lib/adoptCrs.js"; // TASKS.csv #607
import { requestProjectCrs } from "../../lib/projectCrsRequest.js"; // TASKS.csv #615
import { LAYER_META, TARGET_SCHEMAS, guessColumn, guessColumnExact, guessMapping, guessTargetFor, schemaSatisfied, num, replaceRowsByHole, replaceNote, EPSG_COL_ALIASES, diffCollarImport, mergeCollar, minMax, pickRankedCollarRows } from "../../lib/layers.js";
import { normInterval, applyCustomFields, normNumericInterval, normStructure, skippedRowsText, strikeStats, loadRaster, looksLikeAssay, isSurfaceSampleTable, parseVectorFile, groupShapefileParts, orderImportFiles } from "../../lib/viewer/importHelpers.js"; // groupShapefileParts / orderImportFiles: #600
import { unreadableFormatAdvice } from "../../lib/unreadableFormats.js"; // TASKS.csv #603
import { t as tr } from "../../lib/i18n.js"; // TASKS.csv #786
import { requestModuleAction } from "../../lib/menuRequests.js"; // TASKS.csv #917

export function useImportPipeline(ctx) {
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
  } = ctx;

  // TASKS.csv #609 — a LINE or POLYGON shapefile (IP lines, claim outlines, a geology map) is map data, not a
  // drillhole table: it used to fall to the collar guess and open the mapping dialog. It goes to Map layers
  // (the Geophysics tab's panel) through the same builder, draped on the terrain when there is one.
  // TASKS.csv #607 — an empty project may take the file's declared CRS (lib/adoptCrs.js). Returns the CRS to import into.
  const adoptCrsIfEmpty = (declared, fileName) => {
    const live = importStateRef.current;
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
    const layer = buildLayer({ ...parsed, epsg: guessEpsgFromPrjWkt(parsed.prjWkt) }, { sourceName, projectEpsg: live.project?.epsg, qml: null, sourceOverride: null });
    if (!layer) { setNotices((p) => [...p, notice("{name}: no usable line / polygon features.", { name: file.name })]); return; }
    live.addMapLayer({ ...layer, drapeMode: live.terrain ? "terrain" : "flat" });
    setNotices((p) => [...p, notice("{name}: {features} {geomType}{v} added to Map layers (left panel; remove or hide it there), {crsNote}{v2}. Lines and polygons are map data, not drillhole tables.", { name: file.name, features: layer.features.length, geomType: layer.geomType, v: layer.features.length === 1 ? "" : "s", crsNote: layer.crsNote, v2: live.terrain ? tr(", draped on the terrain") : "" })]);
  };
  const isMapGeometry = (meta) => meta?.vector && meta.vector.geomType && meta.vector.geomType !== "point";

  const openImportModal = (file, forceTarget, chosenLayer = null) => {
    parseVectorFile(file, (data, err, meta) => {
      // TASKS.csv #288 — a multi-layer .zip/.gpkg reports its layers instead of importing the first
      // one; put the picker up and come back through this same function with the chosen layer name.
      if (meta?.layerOptions) { setLayerPicker({ file, forceTarget, options: meta.layerOptions }); return; }
      if (err || !data || !data.length) { setNotices((p) => [...p, notice("{name}: couldn't read {v}.", { name: file.name, v: err ? "file (" + err + ")" : tr("— no rows found") })]); return; }
      if (isMapGeometry(meta) && forceTarget !== "custom") { sendToMapLayers(file, meta.vector); return; } // #609
      const headers = meta?.headers || Object.keys(data[0]);
      if (!forceTarget && looksLikeAssay(headers, file.name)) { // file.name: #1105
        setNotices((p) => [...p, notice("{name} looks like assay data — import it from the Geochem module instead (it needs the element checklist).", { name: file.name })]);
        return;
      }
      const target = forceTarget || guessTargetFor(headers, file.name); // #605: the file name as a hint
      const mapping = guessMapping(target, headers); // #426
      const perRowEpsgCol = guessColumn(headers, EPSG_COL_ALIASES);
      setImportModal({ file, fileName: file.name, headers, rowCount: data.length, sampleRows: data.slice(0, 5), allRows: data, target, mapping, dipConvention: "neg_down", perRowEpsgCol, sourceEpsg: meta?.detectedEpsg ? String(meta.detectedEpsg) : "" });
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
  const importBrowserFile = async (file) => {
    const name = (file?.name || "").toLowerCase();
    // Drape elevation default, same rule RasterModule/GeophysicsModule use: roughly collar level if
    // holes are loaded, else 0. The per-raster elevation control on the Raster tab moves it after.
    const defaultElevation = collars.length ? collars.reduce((s, c) => s + c.z, 0) / collars.length : 0;
    if (/\.(tiff?|gxf)$/.test(name)) {
      try {
        const live = importStateRef.current;
        const chooseProjectEpsg = (src, cur) => adoptCrsIfEmpty(src, file.name) || cur; // #607
        const { raster, msg } = await (await loadRaster()).buildRasterImport(file, { epsg: live.project?.epsg ?? project?.epsg, defaultElevation, chooseProjectEpsg });
        addRaster(raster);
        setNotices((p) => [...p, notice("{msg} Set its elevation/opacity (or a Source CRS, if it landed in the wrong place) on the Maps tab.", { msg })]);
      } catch (err) { setNotices((p) => [...p, errorNotice(`${file.name}: ${err.message}`)]); } // #739
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
  const openImportFromRows = async ({ headers, rows, sourceName }) => {
    if (!rows.length) return;
    // TASKS.csv #917 — Matt: "the geochem module doesn't give me an option to import assays straight from the database".
    // An assay table (from the Browser panel or Connect to database) is handed to Geochem's assay dialog, which needs
    // the element checklist, instead of a notice telling the user to go there.
    // #952 — a long table (analyte + value columns, one row per element) has no element columns to count
    if (looksLikeAssay(headers, sourceName) || (await import("../../lib/longAssays.js")).detectLongAssay(headers)) { // on demand: off the startup bundle
      setDbModalOpen(false);
      requestModuleAction("import-assay-rows", { headers, rows, sourceName });
      goToModule("geochem");
      setNotices((p) => [...p, isSurfaceSampleTable(headers) // #975 — Geochem opens a surface-sample table in its surface import
        ? notice("{name} looks like a table of surface samples (coordinates, no from / to), so it opened in Geochem's surface-sample import, where you choose the elements.", { name: sourceName })
        : notice("{name} looks like an assay table, so it opened in Geochem's assay import, where you choose the elements.", { name: sourceName })]); // #995 — the tab switch is said
      return;
    }
    const target = guessTargetFor(headers, sourceName); // #605
    const mapping = guessMapping(target, headers); // #426
    const perRowEpsgCol = guessColumn(headers, EPSG_COL_ALIASES);
    setImportModal({ fileName: sourceName, headers, rowCount: rows.length, sampleRows: rows.slice(0, 5), allRows: rows, target, mapping, dipConvention: "neg_down", perRowEpsgCol });
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
  const commitImportData = ({ target, mapping, allRows, dipConvention, fileName, sourceEpsg, perRowEpsgCol, customFields, azimuthRef, azimuthDate, betaRefLine, azimuthGridEpsg, unseen = false }) => {
    // TASKS.csv #396 — convert azimuths measured from true or magnetic north to the project grid, per hole
    // location (declination and convergence vary across a property). Returns the rows plus a notice.
    const applyAzimuthRef = (rows, locate) => {
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
    if (azimuthRef === "magnetic" && !/^\d{4}-\d{2}-\d{2}$/.test(azimuthDate || "")) {
      setNotices((p) => [...p, notice("{fileName}: magnetic azimuths need the survey date to work out the declination — nothing was imported.", { fileName })]);
      return false;
    }
    const liveCollarAt = (() => { const m = new Map((importStateRef.current.collars || []).map((c) => [c.hole_id, c])); return (r) => m.get(r.hole_id) || null; })();
    const schema = TARGET_SCHEMAS[target];
    const missing = schema.fields.filter((f) => f.required && !mapping[f.key]);
    if (missing.length) { setNotices((p) => [...p, notice("{fileName}: map required field(s) — {v}", { fileName, v: missing.map((f) => f.label).join(", ") })]); return false; }
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
      let rows = ranked.rows.map((r) => applyCustomFields({
        // TASKS.csv #337 — num(): a blank cell is missing (NaN), not 0 (a blank RL used to put the collar at sea level).
        hole_id: String(r[mapping.hole_id] ?? "").trim(), x: num(r[mapping.x]), y: num(r[mapping.y]), z: num(r[mapping.z]),
        azimuth: mapping.azimuth ? num(r[mapping.azimuth]) : undefined,
        dip: mapping.dip ? flipDip(num(r[mapping.dip])) : undefined,
        length: mapping.length ? num(r[mapping.length]) : undefined,
        // Per-row source EPSG (TASKS.csv #205), carried alongside the row only long enough to drive
        // the reprojection pass below — stripped before the collar is stored.
        _rowEpsg: perRowEpsgCol ? String(r[perRowEpsgCol] ?? "").trim() : "",
      }, r, customFields));
      // TASKS.csv #337 — a collar without all three coordinates can't be placed; skip it and say which,
      // instead of the old behaviour of keeping it at z = 0.
      const noCoords = rows.filter((r) => r.hole_id && !(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z))).map((r) => r.hole_id);
      rows = rows.filter((r) => r.hole_id && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z));
      if (noCoords.length) setNotices((p) => [...p, notice("{fileName}: {noCoords} collar(s) skipped — missing or non-numeric X, Y or Z ({v}{v2}). Fix them in the file and re-import.", { fileName, noCoords: noCoords.length, v: noCoords.slice(0, 8).join(", "), v2: noCoords.length > 8 ? ", …" : "" })]);
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
      if (liveProject?.epsg && (perRowEpsgCol || (sourceEpsg && Number(sourceEpsg) !== Number(liveProject.epsg)))) {
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
      if (diff.changed.length) {
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
      const applied = rows.map((r) => (prevById.has(r.hole_id) ? mergeCollar(prevById.get(r.hole_id), r, overwriteExisting) : r));
      setCollars((prev) => Array.from(new Map([...prev, ...applied].map((c) => [c.hole_id, c])).values()));
      reorientAfter(new Set(applied.map((r) => r.hole_id)), null, applied, fileName); // #548 — a collar's az / dip orients a hole without a survey
      setVisibleHoles((prev) => ({ ...prev, ...Object.fromEntries(applied.map((r) => [r.hole_id, true])) }));
      // The specific accounting the finding asked for ("12 of 40 collars already existed; 3 had
      // different coordinates and were updated") rather than a bare "Loaded N collars".
      const parts = [];
      if (diff.newHoles.length) parts.push(tr("{newHoles} new", { newHoles: diff.newHoles.length }));
      if (diff.changed.length) parts.push(overwriteExisting ? tr("{changed} existing hole(s) updated with different values", { changed: diff.changed.length }) : tr("{changed} existing hole(s) left untouched (you chose not to overwrite)", { changed: diff.changed.length }));
      if (diff.filled.length) parts.push(tr("{filled} existing hole(s) completed with values they did not have ({v})", { filled: diff.filled.length, v: [...new Set(diff.filled.flatMap((f) => f.fields))].join(", ") })); // #600
      if (diff.unchanged.length) parts.push(tr("{unchanged} already present and identical", { unchanged: diff.unchanged.length }));
      if (ranked.dropped) parts.push(tr("{holes} hole(s) had several location records ({dropped} extra rows) — kept the lowest \"{rankColumn}\" for each: {holes2}{v}", { holes: ranked.holes.length, dropped: ranked.dropped, rankColumn: ranked.rankColumn, holes2: ranked.holes.slice(0, 5).join(", "), v: ranked.holes.length > 5 ? ", …" : "" }));
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
      const rows = azs.rows;
      // TASKS.csv #336 — a hole's survey in this file REPLACES its earlier survey (with _src stamped so
      // the layer inspector can tell imports apart); undo restores the old one.
      const keep = batchRowsRef.current;
      const replaced = replaceRowsByHole(importStateRef.current.survey, rows, keep); // for the notice only (#582: replaced / appended)
      setSurvey((prev) => replaceRowsByHole(prev, keepBatch(rows), keep).rows);
      reorientAfter(new Set(rows.map((r) => r.hole_id)), replaceRowsByHole(importStateRef.current.survey, rows, keep).rows, null, fileName); // #548
      setNotices((p) => [...p, tr("Loaded {rows} survey stations from {fileName}.", { rows: rows.length, fileName })
        + replaceNote(replaced, "survey")
        + (bad.length ? tr(" Skipped {bad} station(s) with a missing or non-numeric azimuth/dip ({v}).", { bad: bad.length, v: [...new Set(bad.map((r) => `${r.hole_id}@${r.depth}`))].slice(0, 5).join(", ") }) : "")
        + skippedRowsText(svDropped, allRows.length) + azs.note]);
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
      if (abDone || abFailed.length) setNotices((p) => [...p, notice("{fileName}: {abDone} pick(s) oriented from alpha/beta using each hole's survey, beta measured clockwise from the {v}-of-hole line looking down-hole{v2}.{v3}", { fileName, abDone, v: betaRefLine === "top" ? tr("top") : tr("bottom"), v2: unseen ? tr(" (assumed: the file was imported without the dialog; import it through Import CSV to choose the top-of-hole line)") : "", v3: abFailed.length ? tr(" {abFailed} could not be oriented and are shown as unoriented: {v}{v2}.", { abFailed: abFailed.length, v: abFailed.slice(0, 5).join("; "), v2: abFailed.length > 5 ? "; …" : "" }) : "" })]);
      const rows = azst.rows;
      if (azst.note) setNotices((p) => [...p, `${fileName}:${azst.note}`]);
      // TASKS.csv #426 — say how many orientations were out of range (dropped to unknown, not guessed).
      const negDip = mapping.dip ? allRows.filter((r) => { const d = num(r[mapping.dip]); return Number.isFinite(d) && d < 0; }).length : 0; // #719
      const badDip = mapping.dip ? allRows.filter((r) => { const d = num(r[mapping.dip]); return Number.isFinite(d) && (d < 0 || d > 90); }).length : 0;
      if (badDip) setNotices((p) => [...p, notice("{fileName}: {badDip} structure dip(s) outside 0-90° were set to unknown{v}.", { fileName, badDip, v: negDip ? tr(" ({negDip} negative: a structure's dip is 0-90° below horizontal, so a minus sign is read as an error, not as \"down\")", { negDip }) : "" })]);
      { // TASKS.csv #584 — say what the strike column did
        const ss = strikeStats(allRows, mapping);
        if (ss.derived || ss.mismatches) setNotices((p) => [...p, `${fileName}:${ss.derived ? tr(" {derived} dip direction(s) derived from strike by the right-hand rule (dip direction = strike + 90°).", { derived: ss.derived }) : ""}${ss.mismatches ? tr(" {mismatches} row(s) have a strike and a dip direction that are not 90° apart (right-hand rule) — the dip direction was used; check whether those strikes follow another convention.", { mismatches: ss.mismatches }) : ""}`]);
      }
      const keep = batchRowsRef.current;
      const replaced = replaceRowsByHole(importStateRef.current.layers?.structure, rows, keep);
      setLayers((p) => ({ ...p, structure: replaceRowsByHole(p.structure, keepBatch(rows), keep).rows })); // TASKS.csv #336
      if (replaced.replacedHoles.length || replaced.appendedHoles.length) setNotices((p) => [...p, `${fileName}:${replaceNote(replaced, "structure picks")}`]); // #582
      setLayerVisible((p) => ({ ...p, structure: true }));
      setNotices((p) => [...p, appendNotice(notice("Loaded {rows} structure points from {fileName}.", { rows: rows.length, fileName }), skippedRowsText(stDropped, allRows.length))]); // #1070
    } else if (target === "custom") {
      const rows = allRows.map((r) => applyCustomFields({
        hole_id: String(r[mapping.hole_id] ?? "").trim(),
        from: mapping.from ? num(r[mapping.from]) : undefined, to: mapping.to ? num(r[mapping.to]) : undefined,
        depth: mapping.depth ? num(r[mapping.depth]) : undefined, value: r[mapping.value],
      }, r, customFields)).filter((r) => r.hole_id);
      const id = `custom_${Date.now()}`;
      const group = new THREE.Group(); group.name = id;
      layerGroupsRef.current[id] = group;
      sceneRef.current.getObjectByName("root").add(group);
      setCustomLayers((p) => [...p, { id, name: fileName.replace(/\.csv$/i, ""), rows, group }]);
      setCustomVisible((p) => ({ ...p, [id]: true }));
      setNotices((p) => [...p, notice("Added \"{fileName}\" as a custom layer ({rows} rows).", { fileName, rows: rows.length })]);
    } else {
      // _src (source filename) is stamped on every row here — TASKS.csv #63: lets the layer inspector
      // (LayerInspector.jsx) break a layer down by which import it came from, since it's common to
      // build up one layer (e.g. lithology) from several CSVs (different holes, different field
      // seasons) and later want to pull just one of those back out without clearing the whole layer.
      const numeric = LAYER_META[target].numeric;
      // #1070 — what is left out, and why, goes into the notice
      const dropped = [];
      const rows = allRows.map((raw) => {
        const r = numeric ? normNumericInterval(raw, mapping, customFields) : normInterval(raw, mapping, customFields);
        const why = !r.hole_id ? "no hole id" : isNaN(r.from) ? "no from" : numeric && isNaN(r.value) ? "no value" : null;
        if (why) { dropped.push({ reason: why, example: why === "no from" ? raw[mapping.from] : why === "no value" ? raw[mapping.value] : null }); return null; }
        return { ...r, _src: fileName };
      }).filter(Boolean);
      // TASKS.csv #336 — rows for a hole already in this layer replace that hole's earlier rows.
      const keep = batchRowsRef.current;
      const replaced = replaceRowsByHole(importStateRef.current.layers?.[target], rows, keep); // #582: replaced / appended
      setLayers((p) => ({ ...p, [target]: replaceRowsByHole(p[target], keepBatch(rows), keep).rows }));
      setLayerVisible((p) => ({ ...p, [target]: true }));
      if (numeric) { const vals = rows.map((r) => r.value); setNumericRange((p) => ({ ...p, [target]: minMax(vals) })); } // not Math.min/max(...) — see layers.js's minMax comment
      // TASKS.csv #540 — what is wrong with these rows, said now (Data QC loads on demand: not in the startup bundle)
      const liveAtImport = importStateRef.current;
      import("../../lib/dataQC.js").then(({ importCheckSummary }) => {
        const msg = importCheckSummary(rows, liveAtImport.collars, liveAtImport.survey, `${LAYER_META[target].label} rows from ${fileName}`);
        if (msg) setNotices((p) => [...p, msg]);
      }).catch(() => {});
      setNotices((p) => [...p, tr("Loaded {rows} rows into {label} from {fileName}.", { rows: rows.length, label: LAYER_META[target].label, fileName })
        + replaceNote(replaced, "rows") + skippedRowsText(dropped, allRows.length)]);
    }
    return true;
  };

  // TASKS.csv #615 — collar coordinates with no CRS of their own, into a project whose CRS was never chosen: ask
  // which CRS they are in BEFORE they are placed (a CSV can't say, and the placeholder used to be taken as the
  // answer). "Decide later" imports them anyway; the status bar keeps saying "CRS: not set".
  const askCrsForCollars = async (m) => {
    const live = importStateRef.current;
    if (m.target !== "collars" || live.project?.crsSet !== false || m.sourceEpsg || m.perRowEpsgCol || m.localGridOn) return;
    const xc = m.mapping?.x, yc = m.mapping?.y;
    const pts = xc && yc ? (m.allRows || []).map((r) => ({ x: parseFloat(String(r[xc]).replace(",", ".")), y: parseFloat(String(r[yc]).replace(",", ".")) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) : null;
    const chosen = await requestProjectCrs(`${String(m.fileName).replace(/ \(\d+ more queued\)$/, "")}: which coordinate system are these collar coordinates in? They are placed as they are, with no conversion.`, pts);
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
      }
      const zShift = importModal.target === "collars" ? Number(importModal.zShift) || 0 : 0;
      const t = transformImportRows(importModal.allRows, importModal.mapping, { units, grid, zShift });
      modalData = { ...importModal, allRows: t.rows };
      setNotices((p) => [...p, `${importModal.fileName}:${units === "ft" ? " depths/lengths" + (importModal.mapping.z ? tr(" and elevations") : "") + " converted from feet to metres (x 0.3048)." : ""}${grid ? tr(" {moved} collar(s) moved from the local grid to EPSG:{v} (scale {scale}, rotation {rotationDeg}°, RMS {rmsM} m over {n} control points){v2}.", { moved: t.moved, v: project?.epsg, scale: grid.scale.toFixed(6), rotationDeg: grid.rotationDeg.toFixed(3), rmsM: grid.rmsM.toFixed(2), n: grid.n, v2: t.turned ? tr("; {turned} azimuth(s) turned with the grid ({v}°)", { turned: t.turned, v: (-grid.rotationDeg).toFixed(3) }) : "" }) : ""}${zShift ? tr(" Elevations shifted by {zShift} m.", { zShift }) : ""}`]);
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
  const processImportQueue = useCallback(() => {
    const file = importQueueRef.current.shift();
    if (!file) { importActiveRef.current = false; batchRowsRef.current = null; setTaskProgress?.(null); importQueueTotalRef.current = 0; return; }
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
      if (looksLikeAssay(headers, file.name)) { // file.name: #1105
        setNotices((p) => [...p, notice("{name} looks like assay data — import it from the Geochem module instead (it needs the element checklist).", { name: file.name })]);
        processImportQueue();
        return;
      }
      const target = guessTargetFor(headers, file.name); // #605
      const schema = TARGET_SCHEMAS[target];
      const mapping = guessMapping(target, headers); // #426
      const missingRequired = schema.fields.filter((f) => f.required && !mapping[f.key]).concat(schemaSatisfied(target, mapping) || !schema.oneOf ? [] : [{ key: "oneOf", label: "From / To or Depth" }]); // #605
      // TASKS.csv #335 — only commit unseen when every REQUIRED column matched a header exactly (not
      // just by substring), and — for tables with a dip — when every dip in the file is <= 0, i.e.
      // actually consistent with the "negative = down" convention this path assumes. A positive-down
      // export (Datamine style) used to be committed silently and plotted every hole pointing up.
      const exactRequired = schema.fields.filter((f) => f.required).every((f) => mapping[f.key] && guessColumnExact(headers, f.aliases) === mapping[f.key]);
      const dipCol = schema.dipConvention || target === "survey" ? mapping.dip : null;
      const dipsAgree = !dipCol || data.every((r) => { const d = Number(r[dipCol]); return r[dipCol] == null || r[dipCol] === "" || !Number.isFinite(d) || d <= 0; });
      const confident = target !== "custom" && missingRequired.length === 0 && exactRequired && dipsAgree;
      // TASKS.csv #609 — the file's own CRS (.prj / GeoPackage) and a per-row EPSG column, as openImportModal passes
      // them: a queued shapefile used to be committed with no Source CRS, so its collars stayed in their own UTM
      // zone's numbers inside a project in another zone (~400 km from the same drop's reprojected map layers).
      const modalData = { file, fileName: file.name, headers, rowCount: data.length, sampleRows: data.slice(0, 5), allRows: data, target, mapping, dipConvention: "neg_down",
        sourceEpsg: meta?.detectedEpsg ? String(meta.detectedEpsg) : "", perRowEpsgCol: guessColumn(headers, EPSG_COL_ALIASES) };
      if (confident) {
        askCrsForCollars(modalData).then(() => { commitImportData({ ...modalData, unseen: true }); processImportQueue(); }); // #615; unseen: #715 — no dialog, so its defaults are assumptions
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
  const handleDrop = async (e) => {
    e.preventDefault(); setDragOver(false);
    const grouped = groupShapefileParts(Array.from(e.dataTransfer.files || [])); // #600: loose .shp + .dbf/.prj
    // TASKS.csv #600 (40958Z) — grids (.tif/.gxf), CAD lines / solids (.dxf) and .obj solids dropped here used to
    // be refused ("Only .csv … can be dropped") although the Browser panel and the Raster / 3D Modelling buttons
    // import them: they go to those same handlers (importBrowserFile / importSolidFile), outside the table queue.
    const direct = grouped.files.filter((f) => /\.(tiff?|gxf|dxf|obj)$/i.test(f.name));
    for (const f of direct) { if (/\.obj$/i.test(f.name)) importSolidFile(f); else await importBrowserFile(f); }
    let files = grouped.files.filter((f) => /\.(csv|zip|gpkg|shp|kml|kmz|xlsx|las)$/i.test(f.name)); // kml/kmz: #424, xlsx: #605, las: #492
    // TASKS.csv #603 — a closed format (Geosoft .gdb / .grd, .dwg, Access) gets the way out, not "unrecognized"
    const advised = grouped.files.map((f) => unreadableFormatAdvice(f.name)).filter(Boolean);
    if (advised.length) setNotices((p) => [...p, ...advised]);
    const skipped = grouped.files.length - files.length - direct.length - advised.length + grouped.unmatched.length;
    if (!files.length) {
      if (!direct.length && !advised.length) setNotices((p) => [...p, notice("Only .csv, .xlsx, .zip (shapefile), .shp, .gpkg, .kml/.kmz, .las logs, GeoTIFF / .gxf grids and .dxf / .obj files can be dropped in directly.")]);
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
          const { xlsxToCsvFiles } = await import("../../lib/xlsx.js"); // #552
          const sheets = await xlsxToCsvFiles(new Uint8Array(await f.arrayBuffer()), f.name);
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

  return { commitImport, handleDrop, importBrowserFile, layerPicker, loadSampleProject, openImportFromRows, openImportModal, processImportQueue, sampleLoading, setLayerPicker };
}
