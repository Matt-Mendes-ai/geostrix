// TASKS.csv #2586 (review #2486, WA lithium) — Maps > Project CRS on a project WITH a CRS: a named mine grid beside it. The tie (mine grid ->
// the project CRS, lib/localGridTie.js) is fitted from 2+ control points, or from collars that carry both pairs of coordinates (GBMG_East /
// GBMG_North beside MGA: every collar a control point, scale / rotation / RMS shown). A file with no CRS whose coordinates lie on that grid
// is then read on it (lib/mineGrid.js readsAsMineGrid). project.localGrid (no CRS, #2180 / #2288) is not touched.
import React, { useMemo, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { tieFromControlPoints } from "../lib/localGridTie.js";
import { mineGridOf, collarCoordinateFields, collarControlText } from "../lib/mineGrid.js";
import { crsName } from "../lib/reproject.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const row = { display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };

export default function MineGridPanel() {
  const { project, collars = [], setMineGrid } = useStore();
  const saved = mineGridOf(project);
  const [name, setName] = useState(project.mineGrid?.name || "");
  const fields = useMemo(() => collarCoordinateFields(collars), [collars]);
  const [eField, setEField] = useState(() => fields.find((f) => /east|_e$|^e$|x$/i.test(f) && !/mga|utm/i.test(f)) || "");
  const [nField, setNField] = useState(() => fields.find((f) => /north|_n$|^n$|y$/i.test(f) && !/mga|utm/i.test(f)) || "");
  const [mode, setMode] = useState(fields.length >= 2 ? "collars" : "points");
  const [text, setText] = useState(saved?.tie?.mode === "points" && saved.tie.from !== "collars" ? saved.tie.controlText || "" : "");
  const [msg, setMsg] = useState(null);
  const fit = useMemo(() => {
    try {
      const src = mode === "collars" ? (eField && nField && eField !== nField ? collarControlText(collars, eField, nField) : "") : text;
      if (!src.trim()) return null;
      const tie = tieFromControlPoints(src, project.epsg);
      return { tie: mode === "collars" ? { ...tie, from: "collars", fields: [eField, nField], controlText: "", residuals: [] } : tie };
    } catch (e) { return { error: e.message }; }
  }, [mode, eField, nField, text, collars, project.epsg]);
  const save = () => {
    if (!fit?.tie) return;
    setMineGrid({ name: name.trim(), tie: fit.tie });
    setMsg(tr("Saved. A file with no coordinate system whose coordinates lie on this grid (where the collars are on it) is read on it and brought into EPSG:{epsg}.", { epsg: project.epsg }));
  };
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "8px 10px", marginTop: 10 }}>
      <div style={{ fontWeight: 600, color: "var(--color-text)", fontSize: "var(--font-size-sm)" }}>{tr("Mine grid beside this CRS")}</div>
      <div style={{ ...note, marginTop: 4 }}>{saved
        ? tr("\"{name}\" tied to {crs}: rotation {rot}°, scale {scale}{rms}.", { name: saved.name || tr("Mine grid"), crs: crsName(saved.tie.epsg) || `EPSG:${saved.tie.epsg}`, rot: saved.tie.rotationDeg.toFixed(4), scale: saved.tie.scale.toFixed(6), rms: saved.tie.rmsM != null ? tr(", {rms} m RMS over {n} point(s)", { rms: saved.tie.rmsM.toFixed(3), n: saved.tie.n }) : "" })
        : tr("Optional: a local mine grid the plans, pit designs and pick-ups are drawn on. Files with no coordinate system whose coordinates lie on it are then read on it instead of being taken as this CRS.")}</div>
      <label style={row}>{tr("Name")}<input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("e.g. Wallaby mine grid")} aria-label={tr("Mine grid name")} style={{ ...smallSel, flex: 1, minWidth: 0 }} /></label>
      <label style={row}>{tr("From")}<select value={mode} onChange={(e) => setMode(e.target.value)} style={{ ...smallSel, flex: 1 }} aria-label={tr("How the mine grid is tied")}>
        {fields.length >= 2 && <option value="collars">{tr("The collars' mine-grid columns")}</option>}
        <option value="points">{tr("2-3 control points (least squares)")}</option>
      </select></label>
      {mode === "collars" ? (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <select value={eField} onChange={(e) => setEField(e.target.value)} aria-label={tr("Mine grid easting column")} style={{ ...smallSel, flex: 1, minWidth: 0 }}><option value="">{tr("Easting…")}</option>{fields.map((f) => <option key={f} value={f}>{f}</option>)}</select>
          <select value={nField} onChange={(e) => setNField(e.target.value)} aria-label={tr("Mine grid northing column")} style={{ ...smallSel, flex: 1, minWidth: 0 }}><option value="">{tr("Northing…")}</option>{fields.map((f) => <option key={f} value={f}>{f}</option>)}</select>
        </div>
      ) : (
        <>
          <div style={{ ...note, marginTop: 6 }}>{tr("One point per line: mine-grid easting, mine-grid northing, then the same point's easting and northing in the project CRS.")}</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} spellCheck={false} placeholder={"9500 10700 413601.6 6251524.7\n10500 10700 414564.2 6251794.3"} aria-label={tr("Mine grid control points")} style={{ ...smallSel, width: "100%", boxSizing: "border-box", marginTop: 4, fontFamily: "monospace" }} />
        </>
      )}
      {fit?.error && <div style={{ ...note, color: "var(--color-warn-text)", marginTop: 4 }}>{fit.error}</div>}
      {fit?.tie && (
        <div style={{ ...note, color: "var(--color-text-secondary)", marginTop: 6 }}>
          {tr("Rotation {rot}°, scale {scale}", { rot: fit.tie.rotationDeg.toFixed(4), scale: fit.tie.scale.toFixed(6) })}{" · "}{tr("{rms} m RMS over {n} point(s)", { rms: fit.tie.rmsM.toFixed(3), n: fit.tie.n })}
          {Math.abs(fit.tie.scale - 1) > 0.01 && <span style={{ color: "var(--color-warn-text)" }}>{" · "}{tr("the scale is {pct}% off 1: a unit (feet?) or a wrong point", { pct: (Math.abs(fit.tie.scale - 1) * 100).toFixed(1) })}</span>}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button type="button" onClick={save} disabled={!fit?.tie} style={{ ...pBtn, flex: 1, marginBottom: 0, justifyContent: "center", opacity: fit?.tie ? 1 : 0.5 }}>{tr("Save the mine grid")}</button>
        {saved && <button type="button" onClick={() => { setMineGrid(null); setMsg(tr("The mine grid was removed.")); }} style={{ ...pBtn, width: "auto", marginBottom: 0 }}>{tr("Remove")}</button>}
      </div>
      {msg && <div role="status" style={{ ...note, marginTop: 6 }}>{msg}</div>}
    </div>
  );
}
