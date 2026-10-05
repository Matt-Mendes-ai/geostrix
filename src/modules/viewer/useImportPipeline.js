// TASKS.csv #445 step 3 — the viewer's import pipeline: file -> mapping dialog (openImportModal, importBrowserFile,
// openImportFromRows), the commit into the store (commitImportData, commitImport), the multi-file drag-and-drop
// queue (processImportQueue, handleDrop) and the sample-project loader, moved out of ViewerModule.jsx VERBATIM
// (by script; relative import paths re-based to this folder). ViewerModule calls this hook at the same point in
// its body as the code used to run, so React's hook order (the useState / useRef / useCallback inside) and every
// closure see exactly the same values as before. `ctx` = what the code reads from the component, listed by an
// eslint-scope analysis; the return = what the rest of ViewerModule uses.
import { useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { reprojectXY, pointTransform, turnGridBearing, bearingTurn, crsName } from "../../lib/reproject.js";
import { surveyAzimuthDipAt } from "../../lib/desurvey.js";
import { azimuthToGridOffset, wrap360 } from "../../lib/azimuthRef.js";
import { orientFromAlphaBeta } from "../../lib/coreOrientation.js";
import { fitSimilarity, parseControlPoints, transformImportRows } from "../../lib/localGrid.js";
import { loadSampleFiles } from "../../lib/desktop.js";
import { dxfToBoundaries } from "../../lib/dxf.js";
import { isXlsxName, xlsxToCsvFiles } from "../../lib/xlsx.js"; // TASKS.csv #605
import { LAYER_META, TARGET_SCHEMAS, guessColumn, guessColumnExact, guessMapping, guessTargetFor, schemaSatisfied, num, replaceRowsByHole, EPSG_COL_ALIASES, diffCollarImport, mergeCollar, minMax, pickRankedCollarRows } from "../../lib/layers.js";
import { normInterval, applyCustomFields, normNumericInterval, normStructure, loadRaster, looksLikeAssay, parseVectorFile, groupShapefileParts } from "../../lib/viewer/importHelpers.js"; // groupShapefileParts: #600

export function useImportPipeline(ctx) {
  const {
    addBoundary,
    addRaster,
    collars,
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

  const openImportModal = (file, forceTarget, chosenLayer = null) => {
    parseVectorFile(file, (data, err, meta) => {
      // TASKS.csv #288 — a multi-layer .zip/.gpkg reports its layers instead of importing the first
      // one; put the picker up and come back through this same function with the chosen layer name.
      if (meta?.layerOptions) { setLayerPicker({ file, forceTarget, options: meta.layerOptions }); return; }
      if (err || !data || !data.length) { setNotices((p) => [...p, `${file.name}: couldn't read ${err ? "file (" + err + ")" : "— no rows found"}.`]); return; }
      const headers = meta?.headers || Object.keys(data[0]);
      if (!forceTarget && looksLikeAssay(headers)) {
        setNotices((p) => [...p, `${file.name} looks like assay data — import it from the Geochem module instead (it needs the element checklist).`]);
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
        const { raster, msg } = await (await loadRaster()).buildRasterImport(file, { epsg: project?.epsg, defaultElevation });
        addRaster(raster);
        setNotices((p) => [...p, `${msg} Set its elevation/opacity (or a Source CRS, if it landed in the wrong place) on the Raster tab.`]);
      } catch (err) { setNotices((p) => [...p, `${file.name}: ${err.message}`]); }
      return;
    }
    if (/\.dxf$/.test(name)) {
      try {
        // TASKS.csv #408 — one boundary per DXF layer, keeping Z; a face-only DXF is a solid.
        const specs = dxfToBoundaries(await file.text(), file.name.replace(/\.dxf$/i, ""));
        specs.forEach((sp) => addBoundary({ ...sp, elevation: defaultElevation }));
        const n3d = specs.filter((sp) => sp.useVertexZ).length;
        setNotices((p) => [...p, `Imported "${file.name}" as ${specs.length} boundary layer(s) (${specs.reduce((t, sp) => t + sp.polylines.length, 0)} string(s))${n3d ? `, ${n3d} with real 3D elevations` : ""} — edit or remove them under Geophysics → Boundaries. DXF coordinates are assumed to already be in the project's EPSG.`]);
      } catch (err) {
        if (err.facesOnly) { importSolidFile(file); return; } // #408 — 3DFACE / polyface only: import as a solid
        setNotices((p) => [...p, `${file.name}: couldn't read DXF (${err.message}).`]);
      }
      return;
    }
    openImportModal(file);
  };

  // same pipeline as CSV import, just fed from a database query result instead of a parsed file
  const openImportFromRows = ({ headers, rows, sourceName }) => {
    if (!rows.length) return;
    if (looksLikeAssay(headers)) { setNotices((p) => [...p, `${sourceName} looks like assay data — import it from the Geochem module instead.`]); return; }
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
  const commitImportData = ({ target, mapping, allRows, dipConvention, fileName, sourceEpsg, perRowEpsgCol, customFields, azimuthRef, azimuthDate, betaRefLine, azimuthGridEpsg }) => {
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
        if (key && o === undefined) { o = azimuthToGridOffset(azimuthRef, loc.x, loc.y, epsg, azimuthDate); cache.set(key, o); }
        if (!o) { failed.add(r.hole_id); return r; }
        fixed++; if (!example) example = o;
        return { ...r, azimuth: wrap360(r.azimuth + o.offset) };
      });
      const what = azimuthRef === "magnetic" ? `magnetic north (IGRF-14 at ${azimuthDate}: declination ${example?.declination >= 0 ? "+" : ""}${example?.declination?.toFixed(2)}°, grid convergence ${example?.convergence >= 0 ? "+" : ""}${example?.convergence?.toFixed(2)}° at the first hole)` : `true north (grid convergence ${example?.convergence >= 0 ? "+" : ""}${example?.convergence?.toFixed(2)}° at the first hole)`;
      const note = (fixed ? ` ${fixed} azimuth(s) converted from ${what} to grid north.` : "")
        + (failed.size ? ` ${failed.size} hole(s) could not be converted (no collar location or project CRS) and were left as-is: ${[...failed].slice(0, 6).join(", ")}.` : "");
      return { rows: out, note };
    };
    // TASKS.csv #490 — survey / structure azimuths measured from the grid north of ANOTHER CRS (e.g. a survey
    // file from a contractor working in the neighbouring UTM zone). These files have no coordinates, so each
    // hole's collar (project CRS) is taken back into that CRS and the bearing is rebuilt in the project grid.
    function applyGridOf(rows, locate) {
      const projEpsg = (importStateRef.current.project || project)?.epsg;
      if (target === "collars" || !azimuthGridEpsg || !projEpsg || Number(azimuthGridEpsg) === Number(projEpsg)) return { rows, note: "" };
      const fwd = pointTransform(azimuthGridEpsg, projEpsg), inv = pointTransform(projEpsg, azimuthGridEpsg);
      if (!fwd || !inv) return { rows, note: ` Azimuths left as they are: EPSG:${azimuthGridEpsg} isn't a CRS GeoStrix can convert.` };
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
      const note = (fixed ? ` ${fixed} azimuth(s) turned from the grid north of ${crsName(azimuthGridEpsg) || `EPSG:${azimuthGridEpsg}`} to the project grid (up to ${maxTurn.toFixed(2)}°).` : "")
        + (failed.size ? ` ${failed.size} hole(s) have no collar yet, so their azimuths were left as they are: ${[...failed].slice(0, 6).join(", ")}.` : "");
      return { rows: out, note };
    }
    if (azimuthRef === "magnetic" && !/^\d{4}-\d{2}-\d{2}$/.test(azimuthDate || "")) {
      setNotices((p) => [...p, `${fileName}: magnetic azimuths need the survey date to work out the declination — nothing was imported.`]);
      return false;
    }
    const liveCollarAt = (() => { const m = new Map((importStateRef.current.collars || []).map((c) => [c.hole_id, c])); return (r) => m.get(r.hole_id) || null; })();
    const schema = TARGET_SCHEMAS[target];
    const missing = schema.fields.filter((f) => f.required && !mapping[f.key]);
    if (missing.length) { setNotices((p) => [...p, `${fileName}: map required field(s) — ${missing.map((f) => f.label).join(", ")}`]); return false; }
    const flipDip = (raw) => (dipConvention === "neg_down" ? -raw : raw);

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
      if (noCoords.length) setNotices((p) => [...p, `${fileName}: ${noCoords.length} collar(s) skipped — missing or non-numeric X, Y or Z (${noCoords.slice(0, 8).join(", ")}${noCoords.length > 8 ? ", …" : ""}). Fix them in the file and re-import.`]);
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
        if (reprojectedCount) parts.push(`reprojected ${reprojectedCount} row(s) from EPSG:${okEpsgs.join("/")} to the project's EPSG:${toEpsg}`);
        if (unreprojectedCount) parts.push(`left ${unreprojectedCount} row(s) unchanged${badEpsgs.length ? ` (unrecognized EPSG:${badEpsgs.join("/")})` : " (already the project CRS, or no source CRS given)"}`);
        if (turned) parts.push(`turned ${turned} grid azimuth(s) to the project grid (up to ${maxTurn.toFixed(2)}°)`);
        reprojectNote = parts.length ? ` On import: ${parts.join("; ")}.` : "";
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
          `${fileName} contains ${diff.changed.length} hole(s) that already exist in this project with DIFFERENT values:\n\n${preview}` +
          `${diff.changed.length > 6 ? `\n  …and ${diff.changed.length - 6} more` : ""}\n\n` +
          `OK — overwrite those ${diff.changed.length} collar(s) with this file's values (the old ones are lost).\n` +
          `Cancel — keep the existing collars and import only the ${diff.newHoles.length} new hole(s).`
        );
      }
      // #600 — merged field by field (mergeCollar): a value the file lacks never wipes the existing one, and
      // a value the existing collar lacks is filled in even when the overwrite was declined.
      const prevById = new Map(liveCollars.map((c) => [c.hole_id, c]));
      const applied = rows.map((r) => (prevById.has(r.hole_id) ? mergeCollar(prevById.get(r.hole_id), r, overwriteExisting) : r));
      setCollars((prev) => Array.from(new Map([...prev, ...applied].map((c) => [c.hole_id, c])).values()));
      setVisibleHoles((prev) => ({ ...prev, ...Object.fromEntries(applied.map((r) => [r.hole_id, true])) }));
      // The specific accounting the finding asked for ("12 of 40 collars already existed; 3 had
      // different coordinates and were updated") rather than a bare "Loaded N collars".
      const parts = [];
      if (diff.newHoles.length) parts.push(`${diff.newHoles.length} new`);
      if (diff.changed.length) parts.push(overwriteExisting ? `${diff.changed.length} existing hole(s) updated with different values` : `${diff.changed.length} existing hole(s) left untouched (you chose not to overwrite)`);
      if (diff.filled.length) parts.push(`${diff.filled.length} existing hole(s) completed with values they did not have (${[...new Set(diff.filled.flatMap((f) => f.fields))].join(", ")})`); // #600
      if (diff.unchanged.length) parts.push(`${diff.unchanged.length} already present and identical`);
      if (ranked.dropped) parts.push(`${ranked.holes.length} hole(s) had several location records (${ranked.dropped} extra rows) — kept the lowest "${ranked.rankColumn}" for each: ${ranked.holes.slice(0, 5).join(", ")}${ranked.holes.length > 5 ? ", …" : ""}`);
      if (diff.duplicatesInFile.length) parts.push(`${diff.duplicatesInFile.length} duplicate hole_id row(s) WITHIN the file itself (the last row of each hole won: ${[...new Set(diff.duplicatesInFile)].slice(0, 5).join(", ")})`);
      setNotices((p) => [...p, `Loaded ${new Set(rows.map((r) => r.hole_id)).size} collars from ${fileName}${parts.length ? ` — ${parts.join("; ")}` : ""}.${reprojectNote}${azc.note}`]);
    } else if (target === "survey") {
      const all = allRows.map((r) => applyCustomFields({ hole_id: String(r[mapping.hole_id] ?? "").trim(), depth: num(r[mapping.depth]), azimuth: num(r[mapping.azimuth]), dip: flipDip(num(r[mapping.dip])), _src: fileName }, r, customFields)).filter((r) => r.hole_id && !isNaN(r.depth));
      // TASKS.csv #337/#339 — a station with a blank or non-numeric azimuth/dip used to be kept and turned
      // every coordinate below it into NaN (or, blank = 0, into a horizontal hole). Skip and report it.
      const bad = all.filter((r) => !Number.isFinite(r.azimuth) || !Number.isFinite(r.dip));
      const azs = applyAzimuthRef(all.filter((r) => Number.isFinite(r.azimuth) && Number.isFinite(r.dip)), liveCollarAt); // #396
      const rows = azs.rows;
      // TASKS.csv #336 — a hole's survey in this file REPLACES its earlier survey (with _src stamped so
      // the layer inspector can tell imports apart); undo restores the old one.
      const keep = batchRowsRef.current;
      const replaced = replaceRowsByHole(importStateRef.current.survey, rows, keep).replacedHoles; // for the notice only
      setSurvey((prev) => replaceRowsByHole(prev, keepBatch(rows), keep).rows);
      setNotices((p) => [...p, `Loaded ${rows.length} survey stations from ${fileName}.`
        + (replaced.length ? ` Replaced the earlier survey of ${replaced.length} hole(s) (${replaced.slice(0, 6).join(", ")}${replaced.length > 6 ? ", …" : ""}) — Ctrl+Z to undo.` : "")
        + (bad.length ? ` Skipped ${bad.length} station(s) with a missing or non-numeric azimuth/dip (${[...new Set(bad.map((r) => `${r.hole_id}@${r.depth}`))].slice(0, 5).join(", ")}).` : "")
        + azs.note]);
    } else if (target === "structure") {
      let structRows = allRows.map((r) => ({ ...normStructure(r, mapping, customFields, dipConvention), _src: fileName })).filter((r) => r.hole_id && !isNaN(r.depth));
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
          if (o.error) { abFailed.push(`${r.hole_id}@${r.depth} (${o.error})`); return r; }
          abDone++;
          return { ...r, dip: o.dipDeg, azimuth: o.dipDirDeg, orientedFrom: `alpha/beta, ${betaRefLine === "top" ? "top" : "bottom"}-of-hole line`, _abGrid: true };
        });
      }
      const azst0 = applyAzimuthRef(structRows.filter((r) => !r._abGrid), liveCollarAt); // #396
      const azst = { rows: [...azst0.rows, ...structRows.filter((r) => r._abGrid).map(({ _abGrid, ...r }) => r)], note: azst0.note };
      if (abDone || abFailed.length) setNotices((p) => [...p, `${fileName}: ${abDone} pick(s) oriented from alpha/beta using each hole's survey.${abFailed.length ? ` ${abFailed.length} could not be oriented and are shown as unoriented: ${abFailed.slice(0, 5).join("; ")}${abFailed.length > 5 ? "; …" : ""}.` : ""}`]);
      const rows = azst.rows;
      if (azst.note) setNotices((p) => [...p, `${fileName}:${azst.note}`]);
      // TASKS.csv #426 — say how many orientations were out of range (dropped to unknown, not guessed).
      const badDip = mapping.dip ? allRows.filter((r) => { const d = num(r[mapping.dip]); return Number.isFinite(d) && (dipConvention === "neg_down" ? Math.abs(d) > 90 : (d < 0 || d > 90)); }).length : 0;
      if (badDip) setNotices((p) => [...p, `${fileName}: ${badDip} structure dip(s) outside 0-90° were set to unknown.`]);
      const keep = batchRowsRef.current;
      const replaced = replaceRowsByHole(importStateRef.current.layers?.structure, rows, keep).replacedHoles;
      setLayers((p) => ({ ...p, structure: replaceRowsByHole(p.structure, keepBatch(rows), keep).rows })); // TASKS.csv #336
      if (replaced.length) setNotices((p) => [...p, `${fileName}: replaced the earlier structure picks of ${replaced.length} hole(s) — Ctrl+Z to undo.`]);
      setLayerVisible((p) => ({ ...p, structure: true }));
      setNotices((p) => [...p, `Loaded ${rows.length} structure points from ${fileName}.`]);
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
      setNotices((p) => [...p, `Added "${fileName}" as a custom layer (${rows.length} rows).`]);
    } else {
      // _src (source filename) is stamped on every row here — TASKS.csv #63: lets the layer inspector
      // (LayerInspector.jsx) break a layer down by which import it came from, since it's common to
      // build up one layer (e.g. lithology) from several CSVs (different holes, different field
      // seasons) and later want to pull just one of those back out without clearing the whole layer.
      const numeric = LAYER_META[target].numeric;
      const rows = (numeric ? allRows.map((r) => normNumericInterval(r, mapping, customFields)).filter((r) => r.hole_id && !isNaN(r.from) && !isNaN(r.value))
        : allRows.map((r) => normInterval(r, mapping, customFields)).filter((r) => r.hole_id && !isNaN(r.from))).map((r) => ({ ...r, _src: fileName }));
      // TASKS.csv #336 — rows for a hole already in this layer replace that hole's earlier rows.
      const keep = batchRowsRef.current;
      const replaced = replaceRowsByHole(importStateRef.current.layers?.[target], rows, keep).replacedHoles;
      setLayers((p) => ({ ...p, [target]: replaceRowsByHole(p[target], keepBatch(rows), keep).rows }));
      setLayerVisible((p) => ({ ...p, [target]: true }));
      if (numeric) { const vals = rows.map((r) => r.value); setNumericRange((p) => ({ ...p, [target]: minMax(vals) })); } // not Math.min/max(...) — see layers.js's minMax comment
      setNotices((p) => [...p, `Loaded ${rows.length} rows into ${LAYER_META[target].label} from ${fileName}.`
        + (replaced.length ? ` Replaced the earlier rows of ${replaced.length} hole(s) (${replaced.slice(0, 6).join(", ")}${replaced.length > 6 ? ", …" : ""}) — Ctrl+Z to undo.` : "")]);
    }
    return true;
  };

  // Modal's "Import" button: commit whatever's currently in importModal state, then close it and
  // let the multi-file queue (if there is one) move on to the next file.
  const commitImport = () => {
    if (!importModal) return;
    // TASKS.csv #412 — feet and local mine grid are applied to the raw rows before the normal import.
    let modalData = importModal;
    const units = importModal.units || "m";
    const gridOn = importModal.target === "collars" && importModal.localGridOn;
    if (units === "ft" || gridOn || Number(importModal.zShift)) {
      let grid = null;
      if (gridOn) {
        try { grid = fitSimilarity(parseControlPoints(importModal.localGridText)); }
        catch (e) { setNotices((p) => [...p, `${importModal.fileName}: local grid — ${e.message} Nothing was imported.`]); return; }
        if (importModal.sourceEpsg && Number(importModal.sourceEpsg) !== Number(project?.epsg)) {
          setNotices((p) => [...p, `${importModal.fileName}: a local-grid transform gives project coordinates directly — clear Source CRS (it is set to EPSG:${importModal.sourceEpsg}). Nothing was imported.`]);
          return;
        }
      }
      const zShift = importModal.target === "collars" ? Number(importModal.zShift) || 0 : 0;
      const t = transformImportRows(importModal.allRows, importModal.mapping, { units, grid, zShift });
      modalData = { ...importModal, allRows: t.rows };
      setNotices((p) => [...p, `${importModal.fileName}:${units === "ft" ? " depths/lengths" + (importModal.mapping.z ? " and elevations" : "") + " converted from feet to metres (x 0.3048)." : ""}${grid ? ` ${t.moved} collar(s) moved from the local grid to EPSG:${project?.epsg} (scale ${grid.scale.toFixed(6)}, rotation ${grid.rotationDeg.toFixed(3)}°, RMS ${grid.rmsM.toFixed(2)} m over ${grid.n} control points)${t.turned ? `; ${t.turned} azimuth(s) turned with the grid (${(-grid.rotationDeg).toFixed(3)}°)` : ""}.` : ""}${zShift ? ` Elevations shifted by ${zShift} m.` : ""}`]);
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
      if (err || !data || !data.length) { setNotices((p) => [...p, `${file.name}: couldn't read ${err ? "file (" + err + ")" : "— no rows found"}.`]); processImportQueue(); return; }
      const headers = meta?.headers || Object.keys(data[0]);
      if (meta?.note) setNotices((p) => [...p, `${file.name}:${meta.note}`]);
      if (looksLikeAssay(headers)) {
        setNotices((p) => [...p, `${file.name} looks like assay data — import it from the Geochem module instead (it needs the element checklist).`]);
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
      const modalData = { file, fileName: file.name, headers, rowCount: data.length, sampleRows: data.slice(0, 5), allRows: data, target, mapping, dipConvention: "neg_down" };
      if (confident) {
        commitImportData(modalData);
        processImportQueue();
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
    let files = grouped.files.filter((f) => /\.(csv|zip|gpkg|shp|kml|kmz|xlsx)$/i.test(f.name)); // kml/kmz: #424, xlsx: #605
    const skipped = grouped.files.length - files.length + grouped.unmatched.length;
    if (!files.length) { setNotices((p) => [...p, "Only .csv, .xlsx, .zip (shapefile), .shp, .gpkg or .kml/.kmz files can be dropped in directly."]); return; }
    if (skipped) setNotices((p) => [...p, `${skipped} unrecognized file(s) skipped.`]);
    // TASKS.csv #605 — an Excel workbook becomes one CSV per non-empty sheet ("Book - Sheet.csv"), queued like
    // dropped CSVs: same detection (the sheet name is the hint), same dialogs.
    if (files.some((f) => isXlsxName(f.name))) {
      const expanded = [];
      for (const f of files) {
        if (!isXlsxName(f.name)) { expanded.push(f); continue; }
        try {
          const sheets = await xlsxToCsvFiles(new Uint8Array(await f.arrayBuffer()), f.name);
          setNotices((p) => [...p, `${f.name}: ${sheets.length} sheet(s) with data — ${sheets.map((s) => `${s.sheet} (${s.rows})`).join(", ")}. Each is imported like a CSV.`]);
          sheets.forEach((s) => expanded.push(new File([s.text], s.name, { type: "text/csv" })));
        } catch (err) { setNotices((p) => [...p, `${f.name}: could not read the workbook (${err.message}).`]); }
      }
      files = expanded;
      if (!files.length) return;
    }
    if (files.length === 1) { openImportModal(files[0]); return; }
    // TASKS.csv #229 — ignore a second drop-queue start while one is still draining (see
    // importActiveRef's own comment above processImportQueue) instead of stomping the in-flight queue.
    if (importActiveRef.current) { setNotices((p) => [...p, "Already importing a previous drop — please wait for it to finish before dropping more files."]); return; }
    importActiveRef.current = true;
    batchRowsRef.current = new WeakSet(); // #605
    setNotices((p) => [...p, `Importing ${files.length} files — auto-detecting each one, will ask when unsure…`]);
    importQueueTotalRef.current = files.length;
    importQueueRef.current = files;
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
  // reject it here with a notice), and the user is pointed there by the closing notice instead.
  const [sampleLoading, setSampleLoading] = useState(false);
  const SAMPLE_FILES = ["collars.csv", "litho.csv", "alt.csv", "vein.csv", "mnlgy.csv", "geotech.csv", "magsusc.csv", "structure.csv"];
  const loadSampleProject = async () => {
    if (sampleLoading || importActiveRef.current) return;
    setSampleLoading(true);
    try {
      const files = await loadSampleFiles("harry_property", SAMPLE_FILES);
      setNotices((p) => [...p, `Loading the Harry property sample project — 37 real drillholes from BC's public ARIS database (report #37584), with the interval layers synthesized around the real assay anomalies. See sample_data/harry_property/README.md for exactly what's real vs. synthetic. Assays for these holes can be imported from the Geochem tab (sample_data/harry_property/assay_wide.csv).`]);
      importActiveRef.current = true;
      batchRowsRef.current = new WeakSet(); // #605
      importQueueTotalRef.current = files.length;
      importQueueRef.current = files;
      processImportQueue();
    } catch (err) {
      setNotices((p) => [...p, `Couldn't load the sample project: ${err.message}`]);
    } finally {
      setSampleLoading(false);
    }
  };

  return { commitImport, handleDrop, importBrowserFile, layerPicker, loadSampleProject, openImportFromRows, openImportModal, processImportQueue, sampleLoading, setLayerPicker };
}
