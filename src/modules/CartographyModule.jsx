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
import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import { Globe2, Layers, FileSpreadsheet, Loader2, CheckCircle2 } from "../components/icons.js";
import { useStore } from "../lib/store.jsx";
import { Ribbon, RibbonGroup, RibbonButton, TaskPaneHeader } from "../components/Ribbon.jsx";
import CrsPicker from "../components/CrsPicker.jsx";
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";
import { crsName, isMetricProjectedEpsg, pointTransform, getProj4DefSync } from "../lib/reproject.js";
import { trueNorthBearingInGridDeg } from "../lib/inversion.js";
import { parseTableFile } from "../lib/tabular.js";
import { guessGeophysColumns } from "../lib/geophysColumns.js";
import { saveFile } from "../lib/desktop.js";
import SourceCrsField from "../components/SourceCrsField.jsx";
import { readShapefileLayers, reprojectShapefileZip, reportShapefileText, readGeoTiffInfo, reprojectGeoTiff, reportGeoTiffText } from "../lib/fileReproject.js"; // #487
import { uint8ToBase64 } from "../lib/modelExport.js";

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

export default function CartographyModule() {
  const store = useStore();
  const { project, setEpsg, reprojectProjectTo, reprojectObjectTo, collars, layers, voxelModels, generatedSurfaces, rasters, boundaries, mapLayers, surfaceStructures, omfObjects, terrain, plannedHoles, surfaceSamples, sections } = store;
  const [pane, setPane] = useState("crs");
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
  const setOnly = () => { setEpsg(Number(newCrs)); setMsg({ ok: true, text: `Project CRS set to ${nameOf(newCrs)}. No coordinates were changed.` }); setNewCrs(null); };
  const moveAll = () => run(async () => {
    const from = project.epsg, to = Number(newCrs);
    const report = await reprojectProjectTo(to, { rotateAzimuths: rotate });
    setMsg({ ok: true, text: reportText(report, `Moved the project from ${nameOf(from)} to ${nameOf(to)}`) });
    setNewCrs(null);
  });

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
      setMsg({ ok: true, text: `"${f.name}": ${layers.length} layer(s), ${layers.reduce((n, l) => n + l.features.length, 0).toLocaleString()} features.${noPrj.length ? ` No recognisable .prj for ${noPrj.join(", ")} — choose "From".` : ""} Choose "To", then save.` });
      return;
    }
    if (/\.tiff?$/i.test(f.name)) { // #487 — a GeoTIFF
      const bytes = new Uint8Array(await f.arrayBuffer());
      const { epsg, width, height, bands } = await readGeoTiffInfo(bytes);
      setFile({ kind: "tif", name: f.name, bytes, epsg, width, height, bands });
      setFileFrom(null);
      setMsg({ ok: true, text: `"${f.name}": ${width.toLocaleString()} × ${height.toLocaleString()}, ${bands} band(s), ${epsg ? nameOf(epsg) : "no EPSG code in its tags — choose \"From\""}. Choose "To", then save.` });
      return;
    }
    const t = await parseTableFile(f);
    const g = guessGeophysColumns(t.headers);
    setFile({ name: f.name, headers: t.headers, rows: t.rows, xCol: g.x, yCol: g.y });
    if (g.geographic) setFileFrom(4326);
    setMsg({ ok: true, text: `"${f.name}": ${t.rows.length.toLocaleString()} rows. Check the X / Y columns and both CRSs, then save.` });
  });
  const saveReprojectedShp = () => run(async () => {
    const { bytes, report } = await reprojectShapefileZip(file.bytes, fileFrom || null, fileTo);
    const base = file.name.replace(/\.[^.]+$/, "");
    const res = await saveFile({ suggestedName: `${base}_EPSG${fileTo}.zip`, filters: [{ name: "Shapefile (zipped)", extensions: ["zip"] }], content: uint8ToBase64(bytes), encoding: "base64" });
    if (!res?.ok) { if (res?.error) throw new Error(res.error); setMsg(null); return; } // cancelled in the dialog
    setMsg({ ok: true, text: reportShapefileText(report, fileTo) });
  });
  const saveReprojectedTif = () => run(async () => {
    const { bytes, report } = await reprojectGeoTiff(file.bytes, fileFrom || null, fileTo);
    const base = file.name.replace(/\.[^.]+$/, "");
    const res = await saveFile({ suggestedName: `${base}_EPSG${fileTo}.tif`, filters: [{ name: "GeoTIFF", extensions: ["tif", "tiff"] }], content: uint8ToBase64(bytes), encoding: "base64" });
    if (!res?.ok) { if (res?.error) throw new Error(res.error); setMsg(null); return; } // cancelled in the dialog
    setMsg({ ok: true, text: reportGeoTiffText(report, fileTo) });
  });
  const saveReprojected = () => run(async () => {
    const T = pointTransform(fileFrom, fileTo);
    if (!T) throw new Error("Pick both CRSs.");
    const xName = `${file.xCol}_EPSG${fileTo}`, yName = `${file.yCol}_EPSG${fileTo}`;
    let bad = 0;
    const rows = file.rows.map((r) => {
      const num = (v) => (v === "" || v == null ? NaN : Number(v)); // a blank cell is missing, not 0
      const x = num(r[file.xCol]), y = num(r[file.yCol]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { bad++; return { ...r, [xName]: "", [yName]: "" }; }
      const [nx, ny] = T(x, y);
      const geo = /longitude/.test(crsName(fileTo) || "");
      return { ...r, [xName]: +nx.toFixed(geo ? 8 : 3), [yName]: +ny.toFixed(geo ? 8 : 3) };
    });
    const base = file.name.replace(/\.[^.]+$/, "");
    const res = await saveFile({ suggestedName: `${base}_EPSG${fileTo}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: Papa.unparse(rows, { columns: [...file.headers, xName, yName] }) });
    if (!res?.ok) { if (res?.error) throw new Error(res.error); setMsg(null); return; } // cancelled in the dialog
    setMsg({ ok: true, text: `Saved ${rows.length.toLocaleString()} rows with two new columns, ${xName} and ${yName} (${nameOf(fileTo)}); the original columns are kept.${bad ? ` ${bad} row(s) had no usable X/Y and were left blank.` : ""}` });
  });

  return (
    <div className="ge-body" style={{ width: "100%" }}>
      <div className="ge-panel" style={{ padding: "16px 14px", overflowY: "auto", width: sidebarWidth }}>
        <Ribbon label="Cartography tools">
          <RibbonGroup label="Project">
            <RibbonButton icon={Globe2} label="Project CRS" active={pane === "crs"} onClick={() => { setPane("crs"); setMsg(null); }} title="The coordinate reference system every import is reprojected into — change it, and optionally move all loaded data with it" />
          </RibbonGroup>
          <RibbonGroup label="Reproject">
            <RibbonButton icon={Layers} label="A layer" active={pane === "layer"} onClick={() => { setPane("layer"); setMsg(null); }} title="One layer, survey, voxel model, surface or raster was imported in the wrong CRS: move it into the project CRS" />
            <RibbonButton icon={FileSpreadsheet} label="A file" active={pane === "file"} onClick={() => { setPane("file"); setMsg(null); }} title="Reproject a CSV's X/Y columns, a zipped shapefile or a GeoTIFF from one CRS to another and save it as a new file" />
          </RibbonGroup>
        </Ribbon>

        {pane === "crs" && (
          <>
            <TaskPaneHeader icon={Globe2} title="Project CRS" />
            <div style={note}>Every file you import is reprojected into this CRS (its own <em>Source CRS</em> box says what the file is in). Current: <b>{project.crsSet === false ? "not chosen yet" : nameOf(project.epsg)}</b>.{project.crsSet === false ? " Pick the CRS your coordinates are in — nothing is converted." : ""}</div>
            <div style={{ marginTop: 12 }}><CrsPicker label="Change to" value={newCrs || project.epsg} onChange={setNewCrs} /></div>
            {changing && isGeographic(newCrs) && (
              /* TASKS.csv #613 — a geographic CRS (WGS 84 lat/long, NAD83 geographic…) can't be the project CRS: the 3D
                 scene, depths, distances and grids are metres, so collars in degrees put every hole on one point with
                 traces hundreds of "degrees" long (Matt's WGS 84 test: all holes fanned out of one spot). */
              <div role="alert" style={{ ...note, color: "var(--color-warn-text-strong)" }}>
                {nameOf(newCrs)} is geographic (latitude/longitude in degrees). The 3D view, hole depths, distances and grids all work in metres, so the project needs a projected CRS — for British Columbia, NAD83 / UTM zone 9N or 10N, or NAD83 / BC Albers. To hand data to someone in WGS 84, use <b>A file</b> in the ribbon above: it writes a reprojected copy and leaves the project as it is.
              </div>
            )}
            {(changing || project.crsSet === false) && newCrs && !isGeographic(newCrs) && (
              hasData && project.crsSet !== false ? ( /* #615 — "reproject FROM" an unchosen placeholder means nothing: only set the label */
                <>
                  <div style={note}>The project already holds data in {nameOf(project.epsg)}. What should happen to it?</div>
                  <label style={{ ...note, display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} style={{ marginTop: 3 }} />
                    <span>Turn azimuths and dip directions with grid north, so holes and structures keep pointing the same way on the ground (recommended).</span>
                  </label>
                  <button style={primary} disabled={busy} onClick={moveAll}>{busy ? <Loader2 size={14} className="spin" /> : <Globe2 size={14} />} Reproject all data to {crsName(newCrs) || `EPSG:${newCrs}`}</button>
                  <button style={btn} disabled={busy} onClick={setOnly} title="Use this when the label was wrong: the coordinates already ARE in the new CRS">Only change the label (the data is already in it)</button>
                </>
              ) : (
                <button style={primary} onClick={setOnly}><CheckCircle2 size={14} /> Use {crsName(newCrs) || `EPSG:${newCrs}`}</button>
              )
            )}
          </>
        )}

        {pane === "layer" && (
          <>
            <TaskPaneHeader icon={Layers} title="Reproject a layer" />
            <div style={note}>For something that landed in the wrong place because it was imported with the wrong CRS: pick it, say which CRS its coordinates are <em>really</em> in, and it is moved into the project CRS ({nameOf(project.epsg)}).</div>
            {inventory.length ? (
              <>
                <select value={objKey} onChange={(e) => setObjKey(e.target.value)} style={{ ...selectStyle, marginTop: 10 }} aria-label="Layer to reproject">
                  <option value="">Choose a layer…</option>
                  {inventory.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
                </select>
                <div style={{ marginTop: 10 }}><CrsPicker label="Its coordinates are really in" value={objFrom} onChange={setObjFrom} height={150} /></div>
                <button style={primary} disabled={busy || !obj || !objFrom || Number(objFrom) === Number(project.epsg)} onClick={moveObject}>
                  {busy ? <Loader2 size={14} className="spin" /> : <Layers size={14} />} Reproject into the project CRS
                </button>
              </>
            ) : <div style={box(true)}>Nothing with map coordinates is loaded yet.</div>}
          </>
        )}

        {pane === "file" && (
          <>
            <TaskPaneHeader icon={FileSpreadsheet} title="Reproject a file" />
            <div style={note}>A CSV: its X/Y columns are converted and saved as a copy with two new columns. A zipped shapefile: every layer and vertex is converted and saved as a new zip with a .prj for the new CRS. A GeoTIFF: warped into the new CRS (bilinear for decimal grids such as DEMs, nearest for classes and imagery) and saved as a new GeoTIFF. Nothing is imported into the project.</div>
            <label style={{ ...btn, marginTop: 10 }}>
              <FileSpreadsheet size={14} /> {file ? file.name : "Choose a CSV, zipped shapefile or GeoTIFF…"}
              <input type="file" accept=".csv,.txt,.zip,.tif,.tiff" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ""; }} />
            </label>
            {file?.kind === "tif" && (
              <>
                <div style={{ marginTop: 10 }}>
                  <SourceCrsField label="From" value={fileFrom ?? ""} onChange={(c) => setFileFrom(c === "" ? null : Number(c))}
                    defaultText={file.epsg ? `The file's own tag — ${nameOf(file.epsg)}` : "Choose — the file has no EPSG tag"}
                    title="Leave it on the file's tag unless that is missing or wrong." />
                </div>
                <div style={{ marginTop: 4 }}><CrsPicker label="To" value={fileTo} onChange={setFileTo} height={120} /></div>
                <button style={primary} disabled={busy || !fileTo || (!fileFrom && !file.epsg)} onClick={saveReprojectedTif}>
                  {busy ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />} Save reprojected GeoTIFF…
                </button>
              </>
            )}
            {file?.kind === "shp" && (
              <>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                  {file.layers.map((l) => <li key={l.name}>{l.name}: {l.features.length.toLocaleString()} {l.geomType} feature(s) · {l.epsg ? nameOf(l.epsg) : l.hasPrj ? ".prj not recognized" : "no .prj"}</li>)}
                </ul>
                <div style={{ marginTop: 10 }}>
                  <SourceCrsField label="From" value={fileFrom ?? ""} onChange={(c) => setFileFrom(c === "" ? null : Number(c))}
                    defaultText={file.layers.every((l) => l.epsg) ? "Each layer's own .prj" : "Choose — not every layer has a recognisable .prj"}
                    title="Leave it on the .prj unless that is missing or wrong." />
                </div>
                <div style={{ marginTop: 4 }}><CrsPicker label="To" value={fileTo} onChange={setFileTo} height={120} /></div>
                <button style={primary} disabled={busy || !fileTo || (!fileFrom && !file.layers.every((l) => l.epsg))} onClick={saveReprojectedShp}>
                  {busy ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />} Save reprojected shapefile…
                </button>
              </>
            )}
            {file && !file.kind && (
              <>
                {[["X / easting / longitude", "xCol"], ["Y / northing / latitude", "yCol"]].map(([lab, key]) => (
                  <label key={key} style={{ display: "block", marginTop: 8, fontSize: "var(--font-size-sm)", color: "var(--color-text-caption)" }}>
                    {lab}
                    <select value={file[key]} onChange={(e) => setFile((f) => ({ ...f, [key]: e.target.value }))} style={{ ...selectStyle, marginTop: 3 }}>
                      <option value="">(choose a column)</option>
                      {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                ))}
                <div style={{ marginTop: 10 }}><CrsPicker label="From (the file's CRS)" value={fileFrom} onChange={setFileFrom} height={120} /></div>
                <div style={{ marginTop: 10 }}><CrsPicker label="To" value={fileTo} onChange={setFileTo} height={120} /></div>
                <button style={primary} disabled={busy || !file.xCol || !file.yCol || !fileFrom || !fileTo} onClick={saveReprojected}>
                  {busy ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />} Save reprojected CSV…
                </button>
              </>
            )}
          </>
        )}

        {msg && <div role="status" style={box(msg.ok)}>{msg.text}</div>}
      </div>
      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      {/* main area: the project's CRS at a glance, and what is loaded */}
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px", color: "var(--color-text)" }}>
        <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 600 }}>{crsName(project.epsg) || "Unrecognized CRS"}</div>
        <div style={{ color: "var(--color-text-muted)", marginTop: 2 }}>EPSG:{project.epsg} · {metric === true ? "projected, metres" : metric === false ? "geographic (degrees) — distances, volumes and grids need a projected CRS" : "GeoStrix has no definition for this code: imports cannot be reprojected into it"}</div>
        {lonLat && (
          <div style={{ ...note, fontSize: "var(--font-size-base)" }}>
            Project location: {Math.abs(lonLat[1]).toFixed(4)}°{lonLat[1] >= 0 ? "N" : "S"}, {Math.abs(lonLat[0]).toFixed(4)}°{lonLat[0] >= 0 ? "E" : "W"}
            {convergence != null && <> · grid convergence here {convergence >= 0 ? "+" : ""}{convergence.toFixed(2)}° (true north is {Math.abs(convergence).toFixed(2)}° {convergence >= 0 ? "east" : "west"} of grid north)</>}
          </div>
        )}
        <div style={{ marginTop: 18, fontSize: "var(--font-size-sm)", color: "var(--color-text-caption)", textTransform: "uppercase", letterSpacing: 0.5 }}>Loaded data ({inventory.length})</div>
        {inventory.length ? (
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            {inventory.map((i) => <li key={i.key}>{i.label}</li>)}
            {sections?.length ? <li>Sections ({sections.length}) — move with the project</li> : null}
          </ul>
        ) : <div style={note}>Nothing loaded yet. Set the project CRS first: every import is then reprojected into it.</div>}
      </div>
    </div>
  );
}
