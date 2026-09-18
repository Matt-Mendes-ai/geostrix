// TASKS.csv #316/#317 — sidebar panel (Geophysics & GIS module) for surface mapping data:
//   * Map layers: GeoPackage / shapefile polygons, lines or points, styled by an attribute (optionally
//     from a QGIS .qml picked in the same dialog), draped on the terrain in the 3D view.
//   * Surface structures: outcrop strike/dip CSVs rendered as dip symbols on the terrain.
// Its own component rather than more inline JSX in GeophysicsModule (already ~1,500 lines); it talks
// to the store directly, the same way AddWebLayerModal does.
import React, { useRef, useState } from "react";
import Papa from "papaparse";
import { Eye, EyeOff, Trash2, Map as MapIcon, Compass, ChevronDown, ChevronRight, Palette } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import InfoButton from "./InfoButton.jsx";
import { parseShapefileZip, parseShapefileParts } from "../lib/shapefile.js";
import { parseGeoPackage } from "../lib/gpkg.js";
import { guessEpsgFromPrjWkt, reprojectXY, getProj4DefSync } from "../lib/reproject.js";
import { CATEGORICAL_SAFE_COLORS } from "../lib/layers.js";
import {
  parseQmlStyle, autoCategories, applyQmlToCategories, guessStyleField, normalizeMapLayer,
  guessStructureColumns, parseStructureRows, STRUCTURE_CLASS_COLORS, STRUCTURE_CLASS_LABELS,
} from "../lib/mapLayers.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements

// A .qml names its attribute as QGIS saw it ("lith"); the same layer exported as a shapefile comes back
// with DBF-uppercased names ("LITH"). Match case-insensitively and use the layer's own spelling.
const findField = (fields, name) => (name ? fields.find((f) => f.toLowerCase() === String(name).toLowerCase()) || null : null);

const autoColorFor = () => {
  let i = 0;
  const seen = new Map();
  return (value) => {
    if (!seen.has(value)) seen.set(value, CATEGORICAL_SAFE_COLORS[i++ % CATEGORICAL_SAFE_COLORS.length]);
    return seen.get(value);
  };
};

// Builds a store-ready map layer from a parsed vector layer. Reprojects into the project CRS when the
// source CRS is known and differs (and both are codes reproject.js can build); otherwise the coordinates
// are taken as already being in the project CRS, and the returned note says so.
function buildLayer(parsed, { sourceName, projectEpsg, qml }) {
  const src = parsed.epsg ? Number(parsed.epsg) : null;
  const dst = projectEpsg ? Number(projectEpsg) : null;
  let transform;
  let crsNote;
  if (src && dst && src !== dst && getProj4DefSync(src) && getProj4DefSync(dst)) {
    transform = (x, y) => { const r = reprojectXY(x, y, src, dst); return r ? [r.x, r.y] : [x, y]; };
    crsNote = `reprojected EPSG:${src} → EPSG:${dst}`;
  } else if (src && dst && src !== dst) {
    crsNote = `source EPSG:${src} could not be reprojected — assumed to already match EPSG:${dst}`;
  } else if (!src) {
    crsNote = `no CRS in file — assumed EPSG:${dst ?? "?"}`;
  } else {
    crsNote = `EPSG:${src}`;
  }
  const norm = normalizeMapLayer(parsed, transform);
  if (!norm.features.length) return null;
  const qmlField = findField(norm.fields, qml?.field);
  const styleField = qmlField || guessStyleField(norm.fields);
  let categories = styleField ? autoCategories(norm.features, styleField, autoColorFor()) : [];
  if (qml && qmlField) categories = applyQmlToCategories(categories, qml);
  return {
    name: norm.name && norm.name !== sourceName ? `${sourceName} — ${norm.name}` : sourceName,
    sourceName, geomType: norm.geomType, features: norm.features, fields: norm.fields, bbox: norm.bbox,
    styleField, categories,
    opacity: qml ? Math.max(0.15, qml.opacity) : (norm.geomType === "polygon" ? 0.6 : 1),
    sourceEpsg: src, crsNote, skipped: parsed.skippedCount || 0,
  };
}

export default function SurfaceMappingPanel({ pBtn, numInput }) {
  const {
    project, terrain,
    mapLayers, addMapLayer, updateMapLayer, removeMapLayer,
    surfaceStructures, addSurfaceStructureSet, updateSurfaceStructureSet, removeSurfaceStructureSet,
  } = useStore();
  const mapInput = useRef(null);
  const qmlInput = useRef(null);
  const qmlTargetRef = useRef(null);
  const structInput = useRef(null);
  const [mapMsg, setMapMsg] = useState(null);
  const [structMsg, setStructMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openLegend, setOpenLegend] = useState({});
  const [pendingStruct, setPendingStruct] = useState(null); // { name, rows, headers, cols }

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
    files.forEach((f) => { const m = lower(f).match(/\.(shp|dbf|prj)$/); if (m) (looseShp[base(f)] ||= {})[m[1]] = f; });
    const addParsed = (parsed, sourceName) => {
      const qml = qmlByBase[sourceName.toLowerCase()] || soleQml || null;
      const layer = buildLayer(parsed, { sourceName, projectEpsg: project?.epsg, qml });
      if (!layer) { failed.push(`${sourceName}${parsed.name ? ` (${parsed.name})` : ""}: no usable features`); return; }
      addMapLayer({ ...layer, drapeMode: terrain ? "terrain" : "flat" });
      done.push(`${layer.name}: ${layer.features.length} ${layer.geomType}${layer.features.length === 1 ? "" : "s"}${layer.skipped ? ` (${layer.skipped} empty/unsupported skipped)` : ""}, ${layer.crsNote}${qml ? ", styled from .qml" : ""}`);
    };
    for (const f of files) {
      const n = lower(f);
      try {
        if (n.endsWith(".gpkg")) {
          const { layers } = await parseGeoPackage(await f.arrayBuffer());
          const usable = layers.filter((l) => l.features.length);
          if (!usable.length) throw new Error("no feature tables with geometry");
          usable.forEach((l) => addParsed(l, base(f)));
        } else if (n.endsWith(".zip")) {
          const first = await parseShapefileZip(await f.arrayBuffer());
          const names = first.layerNames || [first.layerName];
          for (const ln of names) {
            const p = ln === first.layerName ? first : await parseShapefileZip(await f.arrayBuffer(), ln);
            addParsed({ ...p, name: names.length > 1 ? ln : null, epsg: guessEpsgFromPrjWkt(p.prjWkt) }, base(f));
          }
        }
      } catch (err) {
        failed.push(`${f.name}: ${err.message}`);
      }
    }
    for (const [b, parts] of Object.entries(looseShp)) {
      if (!parts.shp) continue;
      try {
        const p = parseShapefileParts({
          shp: new Uint8Array(await parts.shp.arrayBuffer()),
          dbf: parts.dbf ? new Uint8Array(await parts.dbf.arrayBuffer()) : null,
        }, 0, parts.prj ? await parts.prj.text() : null);
        if (!parts.dbf) failed.push(`${b}.shp: no matching .dbf selected — imported without attributes, so it can't be styled by unit`);
        addParsed({ ...p, name: null, epsg: guessEpsgFromPrjWkt(p.prjWkt) }, b);
      } catch (err) {
        failed.push(`${b}.shp: ${err.message}`);
      }
    }
    if (qmlFiles.length && !files.some((f) => /\.(gpkg|zip|shp)$/i.test(f.name))) failed.push("A .qml on its own doesn't import anything — use a layer's Style button to apply it to an existing layer.");
    setBusy(false);
    setMapMsg({ ok: !failed.length, text: [done.length ? `Imported ${done.join("; ")}.` : "", failed.length ? `Problems: ${failed.join("; ")}` : ""].filter(Boolean).join(" ") });
  };

  const applyQmlToLayer = async (file) => {
    const layer = mapLayers.find((l) => l.id === qmlTargetRef.current);
    if (!file || !layer) return;
    const qml = parseQmlStyle(await file.text());
    if (!qml) { setMapMsg({ ok: false, text: `${file.name}: no categorized style found (only QGIS "Categorized" styles are read).` }); return; }
    const field = findField(layer.fields, qml.field);
    if (!field) { setMapMsg({ ok: false, text: `${file.name} styles the "${qml.field}" attribute, which "${layer.name}" doesn't have (it has: ${layer.fields.join(", ")}).` }); return; }
    const cats = applyQmlToCategories(autoCategories(layer.features, field, autoColorFor()), qml);
    const matched = cats.filter((c) => qml.categories.some((q) => q.value === c.value)).length;
    updateMapLayer(layer.id, { styleField: field, categories: cats, opacity: Math.max(0.15, qml.opacity) });
    setMapMsg({ ok: true, text: `Applied ${file.name} to "${layer.name}": ${matched} of ${cats.length} unit(s) matched a style category.` });
  };

  const changeStyleField = (layer, field) => {
    updateMapLayer(layer.id, { styleField: field, categories: autoCategories(layer.features, field, autoColorFor()) });
  };

  const readStructCsv = async (file) => {
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

  const commitStructs = () => {
    const p = pendingStruct;
    if (!p) return;
    if (!p.cols.x || !p.cols.y || !p.cols.dip || (!p.cols.dipDir && !p.cols.strike)) {
      setStructMsg({ ok: false, text: "Pick at least easting, northing, dip, and either dip direction or strike." });
      return;
    }
    const out = parseStructureRows(p.rows, p.cols);
    if (!out.rows.length) { setStructMsg({ ok: false, text: "No rows had usable coordinates and dip." }); return; }
    const src = Number(p.sourceEpsg), dst = Number(project?.epsg);
    let crsNote = "";
    if (src && dst && src !== dst) {
      if (!getProj4DefSync(src) || !getProj4DefSync(dst)) { setStructMsg({ ok: false, text: `EPSG:${src} isn't a CRS GeoStrix can reproject from — leave it as the project's EPSG:${dst} if the coordinates are already in it.` }); return; }
      out.rows.forEach((r) => { const t = reprojectXY(r.x, r.y, src, dst); if (t) { r.x = t.x; r.y = t.y; } });
      crsNote = ` Reprojected EPSG:${src} → EPSG:${dst}.`;
    }
    addSurfaceStructureSet({ name: p.name, rows: out.rows, snapToTerrain: true });
    const noZ = out.rows.filter((r) => r.z == null).length;
    setStructMsg({
      ok: !out.skipped,
      text: `Imported ${out.rows.length} measurement(s) from ${p.name}.`
        + (out.skipped ? ` Skipped ${out.skipped} row(s) missing coordinates or a valid 0–90° dip.` : "")
        + (out.derivedFromStrike ? ` ${out.derivedFromStrike} dip direction(s) derived from strike by the right-hand rule.` : "")
        + (out.rhrMismatches ? ` ${out.rhrMismatches} row(s) have a strike and dip direction that aren't 90° apart — the dip direction was used; check whether those strikes are left-hand-rule.` : "")
        + (noZ ? ` ${noZ} had no elevation and sit on the terrain${terrain ? "" : " once one is loaded"}.` : "")
        + crsNote,
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
      <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
        Map layers (GeoPackage / shapefile)
        <InfoButton title="Map layers" text={`Import surface mapping — a geology map, alteration or outcrop polygons, fault traces, sample points — from a GeoPackage (.gpkg) or shapefile (.zip, or .shp with its .dbf/.prj) and drape it on the terrain in the 3D view, coloured by an attribute. Select a QGIS style (.qml) in the same dialog to reuse your map's colours; otherwise each unit gets its own colour, editable below. Every feature table in a GeoPackage becomes its own layer. Polygons keep their holes and multipart pieces. A layer with a known CRS is reprojected into the project's EPSG (${project?.epsg ?? "?"}). Mapped contacts between units can be projected underground from the 3D Modeling tab.`} />
      </div>
      <button onClick={() => mapInput.current.click()} style={pBtn} disabled={busy}>
        <MapIcon size={14} /> {busy ? "Importing…" : "Import map layer (.gpkg / .zip / .shp + .qml)…"}
      </button>
      <input ref={mapInput} type="file" accept=".gpkg,.zip,.shp,.dbf,.prj,.shx,.cpg,.qml" multiple style={{ display: "none" }}
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
              <Trash2 aria-label={`Remove map layer "${l.name}"`} title={`Remove map layer "${l.name}"`} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(`Remove "${l.name}"?`)) removeMapLayer(l.id); }} />
            </div>
            <label style={{ ...row, cursor: terrain ? "pointer" : "default", opacity: terrain ? 1 : 0.45 }}>
              <input type="checkbox" checked={l.drapeMode === "terrain" && !!terrain} disabled={!terrain}
                onChange={(e) => updateMapLayer(l.id, { drapeMode: e.target.checked ? "terrain" : "flat" })} />
              <span style={{ color: "var(--color-text-caption)" }}>Drape on terrain{!terrain ? " (import or fetch a DEM above first)" : ""}</span>
            </label>
            {!(l.drapeMode === "terrain" && terrain) && (
              <div style={row}>
                <span style={lbl}>Elev.</span>
                <input type="number" value={Math.round(l.elevation || 0)} onChange={(e) => updateMapLayer(l.id, { elevation: Number(e.target.value) })} style={numInput} />
              </div>
            )}
            <div style={row}>
              <span style={lbl}>Opacity</span>
              <input type="range" min={0.05} max={1} step={0.05} value={l.opacity ?? 0.6} onChange={(e) => updateMapLayer(l.id, { opacity: Number(e.target.value) })} style={{ flex: 1 }} />
              <span style={{ color: "var(--color-text-muted)", width: 30, textAlign: "right" }}>{Math.round((l.opacity ?? 0.6) * 100)}%</span>
            </div>
            {l.fields.length > 0 && (
              <div style={row}>
                <span style={lbl}>Colour by</span>
                <select value={l.styleField || ""} onChange={(e) => changeStyleField(l, e.target.value)} style={select}>
                  {l.fields.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <button title="Apply a QGIS .qml style to this layer" onClick={() => { qmlTargetRef.current = l.id; qmlInput.current.click(); }}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 7px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)", cursor: "pointer", flexShrink: 0 }}>
                  <Palette size={11} /> .qml
                </button>
              </div>
            )}
            {l.geomType === "polygon" && (
              <label style={{ ...row, cursor: "pointer" }}>
                <input type="checkbox" checked={l.showOutlines !== false} onChange={(e) => updateMapLayer(l.id, { showOutlines: e.target.checked })} />
                <span style={{ color: "var(--color-text-caption)" }}>Polygon outlines</span>
              </label>
            )}
            {l.categories?.length > 0 && (
              <>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setOpenLegend((p) => ({ ...p, [l.id]: !legendOpen }))} style={{ ...row, cursor: "pointer", color: "var(--color-text-secondary)" }}>
                  {legendOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>Legend ({l.categories.length} unit{l.categories.length === 1 ? "" : "s"})</span>
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
                        <input type="checkbox" checked={c.visible !== false} title="Show this unit"
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

      <div className="ge-section-label" style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
        Surface structures (outcrop measurements)
        <InfoButton title="Surface structures" text="Import outcrop structural measurements from a CSV — easting, northing, optional elevation, dip, and dip direction and/or strike (right-hand rule), plus a structure type and comments if present. Each measurement is drawn in the 3D view as a disc lying in the measured plane, coloured by type (fault, bedding, foliation, vein, joint, contact…). Rows without an elevation sit on the terrain. These measurements are what the 3D Modeling tab uses to set the dip when projecting mapped contacts underground." />
      </div>
      <button onClick={() => structInput.current.click()} style={pBtn}>
        <Compass size={14} /> Import structure measurements (.csv)…
      </button>
      <input ref={structInput} type="file" accept=".csv,.txt" style={{ display: "none" }}
        onChange={(e) => { readStructCsv(e.target.files[0]); e.target.value = ""; }} />
      {pendingStruct && (
        <div style={card}>
          <div style={{ color: "var(--color-text)", marginBottom: 4 }}>{pendingStruct.name}: {pendingStruct.rows.length} rows — check the columns</div>
          {[["x", "Easting"], ["y", "Northing"], ["z", "Elevation"], ["dip", "Dip"], ["dipDir", "Dip dir."], ["strike", "Strike"], ["type", "Type"], ["comment", "Comments"]].map(([k, label]) => (
            <div key={k} style={row}>
              <span style={lbl}>{label}</span>
              <select value={pendingStruct.cols[k] || ""} onChange={(e) => setPendingStruct((p) => ({ ...p, cols: { ...p.cols, [k]: e.target.value || null } }))} style={select}>
                <option value="">(none)</option>
                {pendingStruct.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
          <div style={row} title="EPSG code of this file's easting/northing. Defaults to the project's; change it if the file is in another datum or zone (e.g. 26909 = NAD83 UTM 9N) and it will be reprojected.">
            <span style={lbl}>Source EPSG</span>
            <input type="number" value={pendingStruct.sourceEpsg} onChange={(e) => setPendingStruct((p) => ({ ...p, sourceEpsg: e.target.value }))} style={numInput} />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
            <button onClick={commitStructs} style={{ ...pBtn, marginBottom: 0, justifyContent: "center" }}>Import</button>
            <button onClick={() => setPendingStruct(null)} style={{ ...pBtn, marginBottom: 0, justifyContent: "center" }}>Cancel</button>
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
              <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>{s.rows.length}</span>
              <Trash2 aria-label={`Remove structure set "${s.name}"`} title={`Remove structure set "${s.name}"`} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} onClick={() => { if (window.confirm(`Remove "${s.name}"?`)) removeSurfaceStructureSet(s.id); }} />
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
              <span style={lbl}>Disc size</span>
              <input type="range" min={5} max={200} step={5} value={s.size ?? 25} onChange={(e) => updateSurfaceStructureSet(s.id, { size: Number(e.target.value) })} style={{ flex: 1 }} />
              <span style={{ color: "var(--color-text-muted)", width: 40, textAlign: "right" }}>{s.size ?? 25} m</span>
            </div>
            <label style={{ ...row, cursor: terrain ? "pointer" : "default", opacity: terrain ? 1 : 0.45 }}>
              <input type="checkbox" checked={s.snapToTerrain !== false} disabled={!terrain} onChange={(e) => updateSurfaceStructureSet(s.id, { snapToTerrain: e.target.checked })} />
              <span style={{ color: "var(--color-text-caption)" }} title="GPS elevations are often tens of metres off the DEM; snapping sits every symbol on the ground. Off: rows with a recorded elevation use it.">Sit every measurement on the terrain</span>
            </label>
          </div>
        );
      })}
    </>
  );
}
