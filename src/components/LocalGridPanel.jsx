// TASKS.csv #2288 (review #2174, WA gold; Matt's decision 2026-11-09) — Maps > Project CRS on a project with no CRS: keep the coordinates
// as a named local mine grid (#2180) and, optionally, tie that grid to a real CRS with 2-3 control points (local -> CRS, a least-squares
// similarity, lib/localGrid.js) or an origin, a rotation and a scale. The tie brings files that carry their own CRS into the grid.
import React, { useMemo, useState } from "react";
import CrsPicker from "./CrsPicker.jsx";
import { useStore } from "../lib/store.jsx";
import { tieFromControlPoints, tieFromOrigin, localToWorld, tieOf } from "../lib/localGridTie.js";
import { pointTransform, crsName } from "../lib/reproject.js";
import { formatLonLat } from "../lib/projectCrs.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const row = { display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const num = (v) => (v === "" || v == null ? NaN : Number(v));

export default function LocalGridPanel() {
  const { project, collars = [], setLocalGrid, setLocalGridTie, setLocalGridDatum } = useStore();
  const lg = project.localGrid || null, saved = tieOf(project);
  const [name, setName] = useState(lg?.name || "");
  const [epsg, setEpsgTie] = useState(saved?.epsg || null);
  const [mode, setMode] = useState(saved?.mode || "points");
  const [text, setText] = useState(saved?.controlText || "");
  const [o, setO] = useState(() => ({ lx: "", ly: "", wx: "", wy: "", rot: "0", scale: "1", ...(saved?.mode === "origin" ? { lx: String(saved.origin.lx), ly: String(saved.origin.ly), wx: String(saved.origin.wx), wy: String(saved.origin.wy), rot: String(saved.rotationDeg), scale: String(saved.scale) } : {}) }));
  const [msg, setMsg] = useState(null);
  const [rl, setRl] = useState(lg?.rlOffset != null ? String(lg.rlOffset) : ""), [north, setNorth] = useState(lg?.northDeg != null ? String(lg.northDeg) : ""); // #2691 / #2661
  const fit = useMemo(() => {
    if (!epsg) return null;
    try {
      return { tie: mode === "points" ? tieFromControlPoints(text, epsg) : tieFromOrigin({ lx: num(o.lx), ly: num(o.ly), wx: num(o.wx), wy: num(o.wy), rotationDeg: num(o.rot), scale: num(o.scale), epsg }) };
    } catch (e) { return { error: e.message }; }
  }, [epsg, mode, text, o]);
  // where the collars' centre lands through the tie: the check that the tie is the right one
  const landing = useMemo(() => {
    if (!fit?.tie || !collars.length) return null;
    const cs = collars.filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));
    if (!cs.length) return null;
    const w = localToWorld(fit.tie, cs.reduce((s, c) => s + c.x, 0) / cs.length, cs.reduce((s, c) => s + c.y, 0) / cs.length);
    const t = pointTransform(fit.tie.epsg, 4326), ll = t ? t(w.x, w.y) : null;
    return ll && Number.isFinite(ll[0]) ? { lon: ll[0], lat: ll[1] } : null;
  }, [fit, collars]);

  if (!lg) {
    return (
      <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "8px 10px", marginTop: 10 }}>
        <div style={note}>{tr("No CRS chosen. If the coordinates are a local mine grid, keep them as one: nothing is asked again on import, and the grid can be tied to a real CRS later.")}</div>
        <button type="button" onClick={() => setLocalGrid("")} style={{ ...pBtn, marginTop: 6, marginBottom: 0, justifyContent: "center" }}>{tr("Keep the coordinates as a local mine grid")}</button>
      </div>
    );
  }
  const save = () => {
    if (!fit?.tie) return;
    setLocalGridTie(fit.tie);
    setMsg(tr("Tied to {crs} (EPSG:{epsg}). Files with their own coordinate system are brought into the local grid through it on import.", { crs: crsName(fit.tie.epsg) || "", epsg: fit.tie.epsg }));
  };
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "8px 10px", marginTop: 10 }}>
      <div style={{ fontWeight: 600, color: "var(--color-text)", fontSize: "var(--font-size-sm)" }}>{tr("Local mine grid")}</div>
      <label style={row}>{tr("Name")}<input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setLocalGrid(name)} placeholder={tr("e.g. Wallaby mine grid")} aria-label={tr("Local grid name")} style={{ ...smallSel, flex: 1, minWidth: 0 }} /></label>
      {/* TASKS.csv #2691 / #2661 — the grid's RL datum and, with no tie, its north */}
      <label style={row} title={tr("Grid RL = elevation + this offset (a mine datum of +1000: RL 1,250 is 250 m above sea level). Blank: the RLs are elevations.")}>{tr("RL datum: grid RL = elevation +")}<input type="number" step="any" value={rl} onChange={(e) => setRl(e.target.value)} onBlur={() => setLocalGridDatum({ rlOffset: rl })} placeholder={tr("blank")} aria-label={tr("RL datum offset (m)")} style={{ ...smallSel, width: 80 }} />{tr("m")}</label>
      <label style={row} title={tr("For a grid not tied to a CRS: how far grid north is turned from true north, east positive (west negative). A true-north survey is converted with it on import. A tie, when there is one, knows its own rotation.")}>{tr("Grid north is")}<input type="number" step="any" value={north} disabled={!!saved} onChange={(e) => setNorth(e.target.value)} onBlur={() => setLocalGridDatum({ northDeg: north })} placeholder={saved ? tr("from the tie") : tr("blank")} aria-label={tr("Grid north from true north (degrees, east positive)")} style={{ ...smallSel, width: 80 }} />{tr("° east of true north")}</label>
      {north !== "" && !(Math.abs(Number(north)) <= 180) && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("Between -180 and 180°.")}</div>}
      <div style={{ ...note, marginTop: 8 }}>{saved
        ? tr("Tied to {crs} (EPSG:{epsg}): rotation {rot}°, scale {scale}{rms}.", { crs: crsName(saved.epsg) || "", epsg: saved.epsg, rot: saved.rotationDeg.toFixed(4), scale: saved.scale.toFixed(6), rms: saved.rmsM != null ? tr(", {rms} m RMS over {n} control points", { rms: saved.rmsM.toFixed(3), n: saved.n }) : "" })
        : tr("Not tied to a real CRS. Optional: a tie brings files with their own CRS (an MGA collar file, a .prj) into this grid. Exports with a coordinate system stay unavailable on a local grid.")}</div>
      <div style={{ marginTop: 6 }}><CrsPicker label={tr("Tie to")} value={epsg} onChange={setEpsgTie} height={140} hideMap /></div>
      <label style={row}>{tr("From")}<select value={mode} onChange={(e) => setMode(e.target.value)} style={{ ...smallSel, flex: 1 }} aria-label={tr("How the tie is given")}>
        <option value="points">{tr("2-3 control points (least squares)")}</option>
        <option value="origin">{tr("An origin, a rotation and a scale")}</option>
      </select></label>
      {mode === "points" ? (
        <>
          <div style={{ ...note, marginTop: 6 }}>{tr("One point per line: local easting, local northing, then the same point's easting and northing in the CRS above (a surveyed pin, a hole tied in by both).")}</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} spellCheck={false} placeholder={"32000 808000 412345.6 6612345.6\n32500 808400 412810.2 6612770.9"} aria-label={tr("Control points")} style={{ ...smallSel, width: "100%", boxSizing: "border-box", marginTop: 4, fontFamily: "monospace" }} />
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 6 }}>
          {[["lx", tr("Local E")], ["ly", tr("Local N")], ["wx", tr("CRS E")], ["wy", tr("CRS N")], ["rot", tr("Rotation (°, anticlockwise)")], ["scale", tr("Scale")]].map(([k, l]) => (
            <label key={k} style={{ ...note, display: "flex", flexDirection: "column" }}>{l}<input type="number" step="any" value={o[k]} onChange={(e) => setO((p) => ({ ...p, [k]: e.target.value }))} style={smallSel} aria-label={l} /></label>
          ))}
        </div>
      )}
      {fit?.error && epsg && <div style={{ ...note, color: "var(--color-warn-text)", marginTop: 4 }}>{fit.error}</div>}
      {fit?.tie && (
        <div style={{ ...note, color: "var(--color-text-secondary)", marginTop: 6 }}>
          {tr("Rotation {rot}°, scale {scale}", { rot: fit.tie.rotationDeg.toFixed(4), scale: fit.tie.scale.toFixed(6) })}
          {fit.tie.rmsM != null && <>{" · "}{tr("{rms} m RMS; residuals {list} m", { rms: fit.tie.rmsM.toFixed(3), list: fit.tie.residuals.map((r) => r.toFixed(3)).join(", ") })}</>}
          {fit.tie.n === 2 && fit.tie.mode === "points" && <>{" · "}{tr("two points fit exactly: a third shows whether the tie is right")}</>}
          {Math.abs(fit.tie.scale - 1) > 0.01 && <span style={{ color: "var(--color-warn-text)" }}>{" · "}{tr("the scale is {pct}% off 1: a unit (feet?) or a wrong point", { pct: (Math.abs(fit.tie.scale - 1) * 100).toFixed(1) })}</span>}
          {landing && <div>{tr("The collars' centre would be at {at}.", { at: formatLonLat(landing) })}</div>}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button type="button" onClick={save} disabled={!fit?.tie} style={{ ...pBtn, flex: 1, marginBottom: 0, justifyContent: "center", opacity: fit?.tie ? 1 : 0.5 }}>{tr("Save the tie")}</button>
        {saved && <button type="button" onClick={() => { setLocalGridTie(null); setMsg(tr("The tie was removed: the grid stands on its own again.")); }} style={{ ...pBtn, width: "auto", marginBottom: 0 }}>{tr("Remove the tie")}</button>}
      </div>
      {msg && <div role="status" style={{ ...note, marginTop: 6 }}>{msg}</div>}
    </div>
  );
}
