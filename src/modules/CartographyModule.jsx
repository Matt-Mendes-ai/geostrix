// TASKS.csv #485 / #486 / #487 — Cartography: the project's coordinate reference system in one place, QGIS
// style. User request (2026-09-27): "we need a better way of setting up the epsg for the project ... all data
// that is imported will be reprojected to that CRS set by the user ... create its own tab ... called
// cartography. and let's add tools like reproject a layer or file or voxel".
//   * Project CRS — pick it by name; with data loaded, either move everything into it (projectReproject.js)
//     or only relabel (the data was already in it and the label was wrong).
//   * Reproject a layer — one object imported in the wrong CRS ("it was really EPSG:X") moved into the
//     project CRS.
//   * Reproject a file — a CSV's x/y columns from one CRS to another, saved as a new CSV; or (#487) a zipped
//     shapefile, every layer and vertex, saved as a new zip with a .prj for the new CRS; or a GeoTIFF, warped
//     and saved as a new GeoTIFF (nothing imported).
// Every importer still reprojects INTO the project CRS on import (its Source CRS box); #488 moves those boxes
// onto the same picker.
import { confirmDestructive } from "../lib/confirmDestructive.js"; // TASKS.csv #528
import React, { useMemo, useState } from "react";
import { Globe2, Layers, FileSpreadsheet, Loader2, CheckCircle2 } from "../components/icons.js";
import { useStore } from "../lib/store.jsx";
import { Ribbon, RibbonGroup, RibbonButton, TaskPaneHeader } from "../components/Ribbon.jsx";
import CrsPicker from "../components/CrsPicker.jsx";
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";
import { crsName, isMetricProjectedEpsg, pointTransform, getProj4DefSync, isGeographicCrs } from "../lib/reproject.js";
import { trueNorthBearingInGridDeg } from "../lib/inversion.js";
import { parseTableFile, toExportCsv } from "../lib/tabular.js";
import { guessGeophysColumns } from "../lib/geophysColumns.js";
import { saveFile } from "../lib/desktop.js";
import SourceCrsField from "../components/SourceCrsField.jsx";
import { readShapefileLayers, reprojectShapefileZip, reportShapefileText, readGeoTiffInfo, reprojectGeoTiff, reportGeoTiffText } from "../lib/fileReproject.js"; // #487
import { uint8ToBase64 } from "../lib/modelExport.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786 — messages in the interface language

const btn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "8px 10px", marginTop: 8, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: "var(--font-size-base)", cursor: "pointer", fontFamily: "inherit" };
const primary = { ...btn, background: "var(--color-accent)", borderColor: "var(--color-accent-dark)", color: "#fff" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5, marginTop: 8 };
const box = (ok) => ({ marginTop: 10, padding: "8px 10px", borderRadius: 6, fontSize: "var(--font-size-base)", lineHeight: 1.5, background: ok ? "var(--color-bg-subtle)" : "var(--color-danger-bg)", border: `1px solid ${ok ? "var(--color-border)" : "var(--color-danger-border)"}`, color: ok ? "var(--color-text-secondary)" : "var(--color-danger-text)" });
const selectStyle = { width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 7px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const nameOf = (epsg) => `${crsName(epsg) || "Unrecognized CRS"} (EPSG:${epsg})`;

function reportText(report, verb) {
  const parts = Object.entries(report.counts || {}).map(([k, n]) => `${n.toLocaleString()} ${k}`);
  return `${verb}${parts.length ? `: ${parts.join(", ")}` : ""}.${report.notes?.length ? ` ${report.notes.join(" ")}` : ""}`;
}

// TASKS.csv #749 — embedded: inside the Maps tab, whose ribbon picks the pane (crs / layer / file); no ribbon of its own.
export default function CartographyModule({ embedded = false, forcePane = null } = {}) {
  const store = useStore();
  const { project, setEpsg, reprojectProjectTo, reprojectObjectTo, collars, layers, voxelModels, generatedSurfaces, rasters, boundaries, mapLayers, surfaceStructures, omfObjects, terrain, plannedHoles, surfaceSamples, sections } = store;
  const [paneState, setPane] = useState("crs");
  const pane = forcePane || paneState; // #749
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const run = async (fn) => { setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg({ ok: false, text: e.message || String(e) }); } finally { setBusy(false); } };

  // ---- what's loaded (and where) ----
  const inventory = useMemo(() => {
    const items = [];
    if (collars.length) items.push({ key: "drillholes", kind: "drillholes", label: `Drillholes (${collars.length} collars, their surveys and structure picks)` });
    if (plannedHoles?.length) items.push({ key: "plannedHoles", kind: "plannedHoles", label: `Planned holes (${plannedHoles.length})` });
    const surveys = new Map();
    (layers.geophys_pts || []).forEach((r) => surveys.set(r._src || "unnamed", (surveys.get(r._src || "unnamed") || 0) + 1));
    surveys.forEach((n, src) => items.push({ key: `survey:${src}`, kind: "survey", id: src, label: `Point survey: ${src} (${n.toLocaleString()} points)` }));
    if (surfaceSamples?.length) items.push({ key: "surfaceSamples", kind: "surfaceSamples", label: `Surface geochem samples (${surfaceSamples.length})` });
    (voxelModels || []).forEach((m) => items.push({ key: `voxelModels:${m.id}`, kind: "voxelModels", id: m.id, label: `Voxel model: ${m.name}` }));
    (generatedSurfaces || []).forEach((s) => items.push({ key: `generatedSurfaces:${s.id}`, kind: "generatedSurfaces", id: s.id, label: `Surface: ${s.name}` }));
    (rasters || []).forEach((r) => items.push({ key: `rasters:${r.id}`, kind: "rasters", id: r.id, label: `Raster: ${r.name}` }));
    if (terrain) items.push({ key: "terrain", kind: "terrain", label: `Terrain: ${terrain.name || "surface"}` });
    (boundaries || []).forEach((b) => items.push({ key: `boundaries:${b.id}`, kind: "boundaries", id: b.id, label: `Boundary: ${b.name}` }));
    (mapLayers || []).forEach((l) => items.push({ key: `mapLayers:${l.id}`, kind: "mapLayers", id: l.id, label: `Map layer: ${l.name}` }));
    (surfaceStructures || []).forEach((st) => items.push({ key: `surfaceStructures:${st.id}`, kind: "surfaceStructures", id: st.id, label: `Outcrop structures: ${st.name}` }));
    (omfObjects || []).forEach((o) => items.push({ key: `omfObjects:${o.id}`, kind: "omfObjects", id: o.id, label: `OMF object: ${o.name}` }));
    return items;
  }, [collars, plannedHoles, layers.geophys_pts, surfaceSamples, voxelModels, generatedSurfaces, rasters, terrain, boundaries, mapLayers, surfaceStructures, omfObjects]);
  const hasData = inventory.length > 0 || (sections?.length || 0) > 0;

  // a representative location for the summary (first collar, else the first survey point)
  const anchor = collars[0] || (layers.geophys_pts || [])[0] || null;
  const lonLat = useMemo(() => {
    if (!anchor) return null;
    const t = pointTransform(project.epsg, 4326);
    return t ? t(anchor.x, anchor.y) : null;
  }, [anchor, project.epsg]);
  const convergence = anchor ? trueNorthBearingInGridDeg(anchor.x, anchor.y, project.epsg) : null;
  const metric = isMetricProjectedEpsg(project.epsg);
  const isGeographic = (epsg) => /\+proj=longlat/.test(getProj4DefSync(epsg) || ""); // #613

  // ---- project CRS pane ----
  const [newCrs, setNewCrs] = useState(null);
  const [rotate, setRotate] = useState(true);
  const changing = newCrs && Number(newCrs) !== Number(project.epsg);
  const setOnly = () => { setEpsg(Number(newCrs)); setMsg({ ok: true, text: tr("Project CRS set to {v}. No coordinates were changed.", { v: nameOf(newCrs) }) }); setNewCrs(null); };
  const moveAll = () => {
    // TASKS.csv #528 — one click moved every object and cleared Undo, picked from a long list of look-alike names
    const from = project.epsg, to = Number(newCrs);
    if (!confirmDestructive(tr("Move every loaded object from {v} to {v2}?", { v: nameOf(from), v2: nameOf(to) }), { recover: tr("Undo history is cleared, and moving back re-samples raster images.") })) return;
    return run(async () => {
    const report = await reprojectProjectTo(to, { rotateAzimuths: rotate });
    setMsg({ ok: true, text: tr("{v} Undo history was cleared.", { v: reportText(report, `Moved the project from ${nameOf(from)} to ${nameOf(to)}`) }) });
    setNewCrs(null);
    });
  };

  // ---- reproject a layer pane ----
  const [objKey, setObjKey] = useState("");
  const [objFrom, setObjFrom] = useState(null);
  const obj = inventory.find((i) => i.key === objKey);
  const moveObject = () => run(async () => {
    const report = await reprojectObjectTo({ kind: obj.kind, id: obj.id }, Number(objFrom), { rotateAzimuths: rotate });
    setMsg({ ok: true, text: reportText(report, `${obj.label} moved from ${nameOf(objFrom)} into the project CRS, ${nameOf(project.epsg)}`) });
  });

  // ---- reproject a file pane ----
  const [file, setFile] = useState(null); // CSV: { name, headers, rows, xCol, yCol }; #487 shapefile: { kind: "shp", name, bytes, layers }; GeoTIFF: { kind: "tif", name, bytes, epsg, width, height, bands }
  const [fileFrom, setFileFrom] = useState(null);
  const [fileTo, setFileTo] = useState(null);
  const pickFile = (f) => run(async () => {
    if (/\.zip$/i.test(f.name)) { // #487 — a zipped shapefile (one or more layers)
      const bytes = new Uint8Array(await f.arrayBuffer());
      const { layers } = await readShapefileLayers(bytes);
      setFile({ kind: "shp", name: f.name, bytes, layers });
      setFileFrom(null); // "" = each layer's own .prj
      const noPrj = layers.filter((l) => !l.epsg).map((l) => l.name);
      setMsg({ ok: true, text: tr("\"{name}\": {layers} layer(s), {v} features.{v2} Choose \"To\", then save.", { name: f.name, layers: layers.length, v: layers.reduce((n, l) => n + l.features.length, 0).toLocaleString(), v2: noPrj.length ? tr(" No recognisable .prj for {noPrj} — choose \"From\".", { noPrj: noPrj.join(", ") }) : "" }) });
      return;
    }
    if (/\.tiff?$/i.test(f.name)) { // #487 — a GeoTIFF
      const bytes = new Uint8Array(await f.arrayBuffer());
      const { epsg, width, height, bands } = await readGeoTiffInfo(bytes);
      setFile({ kind: "tif", name: f.name, bytes, epsg, width, height, bands });
      setFileFrom(null);
      setMsg({ ok: true, text: tr("\"{name}\": {width} × {height}, {bands} band(s), {v}. Choose \"To\", then save.", { name: f.name, width: width.toLocaleString(), height: height.toLocaleString(), bands, v: epsg ? nameOf(epsg) : tr("no EPSG code in its tags — choose \"From\"") }) });
      return;
    }
    const t = await parseTableFile(f);
    const g = guessGeophysColumns(t.headers);
    setFile({ name: f.name, headers: t.headers, rows: t.rows, xCol: g.x, yCol: g.y });
    if (g.geographic) setFileFrom(4326);
    setMsg({ ok: true, text: tr("\"{name}\": {rows} rows. Check the X / Y columns and both CRSs, then save.", { name: f.name, rows: t.rows.length.toLocaleString() }) });
  });
  const saveReprojectedShp = () => run(async () => {
    const { bytes, report } = await reprojectShapefileZip(file.bytes, fileFrom || null, fileTo);
    const base = file.name.replace(/\.[^.]+$/, "");
    const res = await saveFile({ quiet: true, suggestedName: `${base}_EPSG${fileTo}.zip`, filters: [{ name: "Shapefile (zipped)", extensions: ["zip"] }], content: uint8ToBase64(bytes), encoding: "base64" });
    if (!res?.ok) { if (res?.error) throw new Error(res.error); setMsg(null); return; } // cancelled in the dialog
    setMsg({ ok: true, text: reportShapefileText(report, fileTo) });
  });
  const saveReprojectedTif = () => run(async () => {
    const { bytes, report } = await reprojectGeoTiff(file.bytes, fileFrom || null, fileTo);
    const base = file.name.replace(/\.[^.]+$/, "");
    const res = await saveFile({ quiet: true, suggestedName: `${base}_EPSG${fileTo}.tif`, filters: [{ name: "GeoTIFF", extensions: ["tif", "tiff"] }], content: uint8ToBase64(bytes), encoding: "base64" });
    if (!res?.ok) { if (res?.error) throw new Error(res.error); setMsg(null); return; } // cancelled in the dialog
    setMsg({ ok: true, text: reportGeoTiffText(report, fileTo) });
  });
  const saveReprojected = () => run(async () => {
    const T = pointTransform(fileFrom, fileTo);
    if (!T) throw new Error(tr("Pick both CRSs."));
    const xName = `${file.xCol}_EPSG${fileTo}`, yName = `${file.yCol}_EPSG${fileTo}`;
    let bad = 0;
    const geo = isGeographicCrs(fileTo); // #1036 — from the definition: 8 decimals of a degree, 3 of a metre
    const rows = file.rows.map((r) => {
      const num = (v) => (v === "" || v == null ? NaN : Number(v)); // a blank cell is missing, not 0
      const x = num(r[file.xCol]), y = num(r[file.yCol]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { bad++; return { ...r, [xName]: "", [yName]: "" }; }
      const [nx, ny] = T(x, y);
      return { ...r, [xName]: +nx.toFixed(geo ? 8 : 3), [yName]: +ny.toFixed(geo ? 8 : 3) };
    });
    const base = file.name.replace(/\.[^.]+$/, "");
    const res = await saveFile({ quiet: true, suggestedName: `${base}_EPSG${fileTo}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(rows, { columns: [...file.headers, xName, yName] }) });
    if (!res?.ok) { if (res?.error) throw new Error(res.error); setMsg(null); return; } // cancelled in the dialog
    setMsg({ ok: true, text: tr("Saved {rows} rows with two new columns, {xName} and {yName} ({v}); the original columns are kept.{v2}", { rows: rows.length.toLocaleString(), xName, yName, v: nameOf(fileTo), v2: bad ? tr(" {bad} row(s) had no usable X/Y and were left blank.", { bad }) : "" }) });
  });

  return (
    <div className="ge-body" style={{ width: "100%" }}>
      <div className="ge-panel" style={{ padding: "16px 14px", overflowY: "auto", width: sidebarWidth }}>
        <Ribbon label="Cartography tools" show={!embedded}>
          <RibbonGroup label="Project">
            <RibbonButton icon={Globe2} label="Project CRS" active={pane === "crs"} onClick={() => { setPane("crs"); setMsg(null); }} title="The coordinate reference system every import is reprojected into — change it, and optionally move all loaded data with it" />
          </RibbonGroup>
          <RibbonGroup advanced label="Reproject">
            <RibbonButton icon={Layers} label="A layer" active={pane === "layer"} onClick={() => { setPane("layer"); setMsg(null); }} title="One layer, survey, voxel model, surface or raster was imported in the wrong CRS: move it into the project CRS" />
            <RibbonButton icon={FileSpreadsheet} label="A file" active={pane === "file"} onClick={() => { setPane("file"); setMsg(null); }} title="Reproject a CSV's X/Y columns, a zipped shapefile or a GeoTIFF from one CRS to another and save it as a new file" />
          </RibbonGroup>
        </Ribbon>

        {pane === "crs" && (
          <>
            <TaskPaneHeader icon={Globe2} title="Project CRS" />
            <div style={note}>{tr("Every file you import is reprojected into this CRS (its own")}{" "}<em>{tr("Source CRS")}</em>{" "}{tr("box says what the file is in). Current:")}{" "}<b>{project.crsSet === false ? tr("not chosen yet") : nameOf(project.epsg)}</b>.{project.crsSet === false ? tr(" Pick the CRS your coordinates are in — nothing is converted.") : ""}</div>
            <div style={{ marginTop: 12 }}><CrsPicker label={tr("Change to")} value={newCrs || project.epsg} onChange={setNewCrs} /></div>
            {changing && isGeographic(newCrs) && (
              /* TASKS.csv #613 — a geographic CRS (WGS 84 lat/long, NAD83 geographic…) can't be the project CRS: the 3D
                 scene, depths, distances and grids are metres, so collars in degrees put every hole on one point with
                 traces hundreds of "degrees" long (Matt's WGS 84 test: all holes fanned out of one spot). */
              <div role="alert" style={{ ...note, color: "var(--color-warn-text-strong)" }}>
                {tr("{v} is geographic (latitude/longitude in degrees). The 3D view, hole depths, distances and grids all work in metres, so the project needs a projected CRS — for British Columbia, NAD83 / UTM zone 9N or 10N, or NAD83 / BC Albers. To hand data to someone in WGS 84, use", { v: nameOf(newCrs) })}{" "}<b>{tr("A file")}</b>{" "}{tr("in the ribbon above: it writes a reprojected copy and leaves the project as it is.")}</div>
            )}
            {(changing || project.crsSet === false) && newCrs && !isGeographic(newCrs) && (
              hasData && project.crsSet !== false ? ( /* #615 — "reproject FROM" an unchosen placeholder means nothing: only set the label */
                <>
                  <div style={note}>{tr("The project already holds data in {v}. What should happen to it?", { v: nameOf(project.epsg) })}</div>
                  <label style={{ ...note, display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} style={{ marginTop: 3 }} />
                    <span>{tr("Turn azimuths and dip directions with grid north, so holes and structures keep pointing the same way on the ground (recommended).")}</span>
                  </label>
                  <button style={primary} disabled={busy} onClick={moveAll}>{busy ? <Loader2 size={14} className="spin" /> : <Globe2 size={14} />}{" "}{tr("Reproject all data to {v}", { v: crsName(newCrs) || tr("EPSG:{newCrs}", { newCrs }) })}</button>
                  <button style={btn} disabled={busy} onClick={setOnly} title={tr("Use this when the label was wrong: the coordinates already ARE in the new CRS")}>{tr("Only change the label (the data is already in it)")}</button>
                </>
              ) : (
                <button style={primary} onClick={setOnly}><CheckCircle2 size={14} />{" "}{tr("Use {v}", { v: crsName(newCrs) || tr("EPSG:{newCrs}", { newCrs }) })}</button>
              )
            )}
          </>
        )}

        {pane === "layer" && (
          <>
            <TaskPaneHeader icon={Layers} title="Reproject a layer" />
            <div style={note}>{tr("For something that landed in the wrong place because it was imported with the wrong CRS: pick it, say which CRS its coordinates are")}{" "}<em>{tr("really")}</em>{" "}{tr("in, and it is moved into the project CRS ({v}).", { v: nameOf(project.epsg) })}</div>
            {inventory.length ? (
              <>
                <select value={objKey} onChange={(e) => setObjKey(e.target.value)} style={{ ...selectStyle, marginTop: 10 }} aria-label={tr("Layer to reproject")}>
                  <option value="">{tr("Choose a layer…")}</option>
                  {inventory.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
                </select>
                <div style={{ marginTop: 10 }}><CrsPicker label={tr("Its coordinates are really in")} value={objFrom} onChange={setObjFrom} height={150} /></div>
                <button style={primary} disabled={busy || !obj || !objFrom || Number(objFrom) === Number(project.epsg)} onClick={moveObject}>
                  {busy ? <Loader2 size={14} className="spin" /> : <Layers size={14} />}{" "}{tr("Reproject into the project CRS")}</button>
              </>
            ) : <div style={box(true)}>{tr("Nothing with map coordinates is loaded yet.")}</div>}
          </>
        )}

        {pane === "file" && (
          <>
            <TaskPaneHeader icon={FileSpreadsheet} title="Reproject a file" />
            <div style={note}>{tr("A CSV: its X/Y columns are converted and saved as a copy with two new columns. A zipped shapefile: every layer and vertex is converted and saved as a new zip with a .prj for the new CRS. A GeoTIFF: warped into the new CRS (bilinear for decimal grids such as DEMs, nearest for classes and imagery) and saved as a new GeoTIFF. Nothing is imported into the project.")}</div>
            <label style={{ ...btn, marginTop: 10 }}>
              <FileSpreadsheet size={14} /> {file ? file.name : tr("Choose a CSV, zipped shapefile or GeoTIFF…")}
              <input type="file" accept=".csv,.txt,.zip,.tif,.tiff" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ""; }} />
            </label>
            {file?.kind === "tif" && (
              <>
                <div style={{ marginTop: 10 }}>
                  <SourceCrsField label={tr("From")} value={fileFrom ?? ""} onChange={(c) => setFileFrom(c === "" ? null : Number(c))}
                    defaultText={file.epsg ? tr("The file's own tag — {v}", { v: nameOf(file.epsg) }) : tr("Choose — the file has no EPSG tag")}
                    title={tr("Leave it on the file's tag unless that is missing or wrong.")} />
                </div>
                <div style={{ marginTop: 4 }}><CrsPicker label={tr("To")} value={fileTo} onChange={setFileTo} height={120} /></div>
                <button style={primary} disabled={busy || !fileTo || (!fileFrom && !file.epsg)} onClick={saveReprojectedTif}>
                  {busy ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />}{" "}{tr("Save reprojected GeoTIFF…")}</button>
              </>
            )}
            {file?.kind === "shp" && (
              <>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                  {file.layers.map((l) => <li key={l.name}>{tr("{name}: {features} {geomType} feature(s) · {v}", { name: l.name, features: l.features.length.toLocaleString(), geomType: l.geomType, v: l.epsg ? nameOf(l.epsg) : l.hasPrj ? tr(".prj not recognized") : tr("no .prj") })}</li>)}
                </ul>
                <div style={{ marginTop: 10 }}>
                  <SourceCrsField label={tr("From")} value={fileFrom ?? ""} onChange={(c) => setFileFrom(c === "" ? null : Number(c))}
                    defaultText={file.layers.every((l) => l.epsg) ? tr("Each layer's own .prj") : tr("Choose — not every layer has a recognisable .prj")}
                    title={tr("Leave it on the .prj unless that is missing or wrong.")} />
                </div>
                <div style={{ marginTop: 4 }}><CrsPicker label={tr("To")} value={fileTo} onChange={setFileTo} height={120} /></div>
                <button style={primary} disabled={busy || !fileTo || (!fileFrom && !file.layers.every((l) => l.epsg))} onClick={saveReprojectedShp}>
                  {busy ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />}{" "}{tr("Save reprojected shapefile…")}</button>
              </>
            )}
            {file && !file.kind && (
              <>
                {[[tr("X / easting / longitude"), "xCol"], [tr("Y / northing / latitude"), "yCol"]].map(([lab, key]) => (
                  <label key={key} style={{ display: "block", marginTop: 8, fontSize: "var(--font-size-sm)", color: "var(--color-text-caption)" }}>
                    {lab}
                    <select value={file[key]} onChange={(e) => setFile((f) => ({ ...f, [key]: e.target.value }))} style={{ ...selectStyle, marginTop: 3 }}>
                      <option value="">{tr("(choose a column)")}</option>
                      {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                ))}
                <div style={{ marginTop: 10 }}><CrsPicker label={tr("From (the file's CRS)")} value={fileFrom} onChange={setFileFrom} height={120} /></div>
                <div style={{ marginTop: 10 }}><CrsPicker label={tr("To")} value={fileTo} onChange={setFileTo} height={120} /></div>
                <button style={primary} disabled={busy || !file.xCol || !file.yCol || !fileFrom || !fileTo} onClick={saveReprojected}>
                  {busy ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />}{" "}{tr("Save reprojected CSV…")}</button>
              </>
            )}
          </>
        )}

        {msg && <div role="status" style={box(msg.ok)}>{msg.text}</div>}
      </div>
      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      {/* main area: the project's CRS at a glance, and what is loaded */}
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px", color: "var(--color-text)" }}>
        <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 600 }}>{crsName(project.epsg) || tr("Unrecognized CRS")}</div>
        <div style={{ color: "var(--color-text-muted)", marginTop: 2 }}>{tr("EPSG:{epsg} · {v}", { epsg: project.epsg, v: metric === true ? tr("projected, metres") : metric === false ? tr("geographic (degrees) — distances, volumes and grids need a projected CRS") : tr("GeoStrix has no definition for this code: imports cannot be reprojected into it") })}</div>
        {lonLat && (
          <div style={{ ...note, fontSize: "var(--font-size-base)" }}>{tr("Project location: {v}°{v2}, {v3}°{v4}", { v: Math.abs(lonLat[1]).toFixed(4), v2: lonLat[1] >= 0 ? "N" : "S", v3: Math.abs(lonLat[0]).toFixed(4), v4: lonLat[0] >= 0 ? "E" : "W" })}
            {convergence != null && <>{" "}{tr("· grid convergence here {v}{convergence}° (true north is {v2}° {v3} of grid north)", { v: convergence >= 0 ? "+" : "", convergence: convergence.toFixed(2), v2: Math.abs(convergence).toFixed(2), v3: convergence >= 0 ? tr("east") : tr("west") })}</>}
          </div>
        )}
        <div style={{ marginTop: 18, fontSize: "var(--font-size-sm)", color: "var(--color-text-caption)", textTransform: "uppercase", letterSpacing: 0.5 }}>{tr("Loaded data ({inventory})", { inventory: inventory.length })}</div>
        {inventory.length ? (
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            {inventory.map((i) => <li key={i.key}>{i.label}</li>)}
            {sections?.length ? <li>{tr("Sections ({sections}) — move with the project", { sections: sections.length })}</li> : null}
          </ul>
        ) : <div style={note}>{tr("Nothing loaded yet. Set the project CRS first: every import is then reprojected into it.")}</div>}
      </div>
    </div>
  );
}
