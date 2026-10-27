// TASKS.csv #844 — the survey planner: a soil grid over an area, or stream-sediment sites above confluences from the
// terrain, numbered with the program's own QC slots, drawn on the map and exported for the crew (GPX, KML, CSV and a
// printable field sheet). Maths in lib/surveyPlan.js; stream routing shared with the Catchments panel (#845).
import React, { useEffect, useMemo, useState } from "react";
import { X, Download } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { soilGrid, streamSites, numberSamples, planGpx, planKml, planCsvRows, planFieldSheet } from "../lib/surveyPlan.js";
import { routeTerrainAsync } from "../lib/hydrologyClient.js";
import { pointTransform, crsName } from "../lib/reproject.js";
import { ensureExportCrs } from "../lib/projectCrsRequest.js"; // TASKS.csv #1021
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { saveFile } from "../lib/desktop.js";
import { overlay, backdropProps, sel, panel, header, rowBtn as btn } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped

const DEFAULT_QC = [{ kind: "standard", every: 20, label: "standard", on: true }, { kind: "blank", every: 30, label: "blank", on: true }, { kind: "duplicate", every: 20, label: "field duplicate", on: true }];
const LS = "geostrix.surveyPlanner";
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } };

export default function SurveyPlannerPanel({ onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const { boundaries = [], terrain, surfaceSamples = [], project, addBoundary } = useStore();
  const prefs = useMemo(loadPrefs, []);
  const [mode, setMode] = useState(prefs.mode || "soil");
  const [areaId, setAreaId] = useState("");
  const [rect, setRect] = useState({ x0: "", y0: "", x1: "", y1: "" });
  const [grid, setGrid] = useState({ azimuth: 0, lineSpacing: 100, stationSpacing: 25, stagger: false, ...(prefs.grid || {}) });
  const [streams, setStreams] = useState({ orders: [1, 2], minAreaKm2: 0.5, maxAreaKm2: 20, ...(prefs.streams || {}) });
  const [num, setNum] = useState({ prefix: "", start: 1, digits: 5, perDay: 40, ...(prefs.num || {}) });
  const [qc, setQc] = useState(prefs.qc || DEFAULT_QC);
  const [route, setRoute] = useState(null);
  const [routeErr, setRouteErr] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify({ mode, grid, streams, num, qc })); } catch { /* private window */ } }, [mode, grid, streams, num, qc]);
  useEffect(() => { if (mode !== "streams" || !terrain || route) return; routeTerrainAsync(terrain).then(setRoute).catch((e) => setRouteErr(e.message)); }, [mode, terrain, route]);

  // the area: a boundary's first ring, the terrain or the samples' extent, or typed corners (project CRS)
  const areas = useMemo(() => {
    const out = [];
    // closed outlines only: open lines (a stream network, follow-up reaches, a survey line) are not areas
    boundaries.forEach((b) => { const ring = (b.polylines || []).find((l, i) => l.length >= 3 && b.closedFlags?.[i] !== false); if (ring) out.push({ id: `b:${b.id}`, label: tr("Boundary: {name}", { name: b.name }), ring: ring.map((p) => [p.x, p.y]) }); });
    const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    if (terrain?.bbox) out.push({ id: "terrain", label: tr("The terrain's extent"), ring: box(...terrain.bbox) });
    const pts = surfaceSamples.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));
    if (pts.length) { const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y); out.push({ id: "samples", label: tr("Around the surface samples"), ring: box(Math.min(...xs) - 200, Math.min(...ys) - 200, Math.max(...xs) + 200, Math.max(...ys) + 200) }); }
    const r = rect; if ([r.x0, r.y0, r.x1, r.y1].every((v) => v !== "" && Number.isFinite(Number(v))) && Number(r.x1) > Number(r.x0) && Number(r.y1) > Number(r.y0)) out.push({ id: "rect", label: tr("Typed corners"), ring: box(Number(r.x0), Number(r.y0), Number(r.x1), Number(r.y1)) });
    return out;
  }, [boundaries, terrain, surfaceSamples, rect]);
  const area = areas.find((a) => a.id === areaId) || null;

  const plan = useMemo(() => {
    if (mode === "soil") {
      if (!area) return null;
      const g = soilGrid(area.ring, grid);
      return { sites: g.stations, lines: g.lines, lineKm: g.lineKm, truncated: g.truncated };
    }
    if (!route || !terrain) return null;
    const sites = streamSites(route, terrain, { ...streams, polygon: area?.ring || null }).map((s, i) => ({ ...s, name: `Site ${i + 1} (order ${s.order}, ${s.areaKm2.toFixed(2)} km²)` }));
    return { sites, lines: [], lineKm: null };
  }, [mode, area, grid, route, terrain, streams]);
  const rows = useMemo(() => (plan ? numberSamples(plan.sites, { prefix: num.prefix, start: Number(num.start) || 1, digits: Number(num.digits) || 5, qc: qc.filter((q) => q.on) }) : []), [plan, num, qc]);
  const nQc = rows.filter((r) => r.kind !== "sample").length;
  const title = mode === "soil" ? `Soil grid: ${grid.lineSpacing} x ${grid.stationSpacing} m, lines at ${grid.azimuth}°` : `Stream sites: order ${streams.orders.join(", ")}, ${streams.minAreaKm2}-${streams.maxAreaKm2} km²`;

  const draw = () => {
    if (mode === "soil") addBoundary({ name: title, polylines: plan.lines.map((l) => l.map(([x, y]) => ({ x, y }))), closedFlags: plan.lines.map(() => false), color: "#8a6a45", drapeMode: terrain ? "terrain" : "flat", lift: 2 });
    else {
      const r = Math.max(15, ...(terrain ? [(terrain.bbox[2] - terrain.bbox[0]) / 250] : [15]));
      addBoundary({ name: title, polylines: plan.sites.flatMap((s) => [[{ x: s.x - r, y: s.y - r }, { x: s.x + r, y: s.y + r }], [{ x: s.x - r, y: s.y + r }, { x: s.x + r, y: s.y - r }]]), closedFlags: plan.sites.flatMap(() => [false, false]), color: "#2f7fc1", drapeMode: terrain ? "terrain" : "flat", lift: 4 });
    }
    setMsg(tr("Added the plan to the map as lines ({n} sites).", { n: plan.sites.length }));
  };
  // TASKS.csv #1021 — the coordinate system is asked for if it was never chosen (the GPS files and the CSV's lat / lon
  // used the placeholder), and raw x / y are never written as latitude / longitude
  const save = async (ext, build, kind) => {
    const epsg = await ensureExportCrs(project); if (!epsg) return;
    const T = pointTransform(epsg, 4326);
    if (!T) { setMsg(tr("EPSG:{epsg} could not be converted to latitude / longitude, so no GPS file was written.", { epsg })); return; }
    saveFile({ suggestedName: `survey_plan.${ext}`, filters: [{ name: kind, extensions: [ext] }], content: build((x, y) => T(x, y), epsg) });
  };

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panelBox} role="dialog" aria-modal="true" aria-label={tr("Survey planner")} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Survey planner")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("A soil grid or stream-sediment sites, numbered with your QC inserts, for the field crew")}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div role="tablist" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--color-border)" }}>
            {[["soil", "Soil grid"], ["streams", "Stream sites"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} style={{ ...tabBtn, borderBottom: mode === k ? "2px solid var(--color-accent)" : "2px solid transparent", color: mode === k ? "var(--color-text)" : "var(--color-text-secondary)" }}>{tr(l)}</button>)}
          </div>
          <div style={rowS}>
            <label style={ctl}>{mode === "soil" ? tr("Area") : tr("Area (optional)")}<select value={areaId} onChange={(e) => setAreaId(e.target.value)} style={{ ...sel, display: "block", marginTop: 4, maxWidth: 260 }}>
              <option value="">{mode === "soil" ? tr("— choose —") : tr("Whole terrain")}</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select></label>
            {["x0", "y0", "x1", "y1"].map((k) => <label key={k} style={ctl}>{{ x0: tr("West (E)"), y0: tr("South (N)"), x1: tr("East (E)"), y1: tr("North (N)") }[k]}<input type="number" value={rect[k]} onChange={(e) => { setRect((r) => ({ ...r, [k]: e.target.value })); setAreaId("rect"); }} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} /></label>)}
          </div>
          {mode === "soil" ? (
            <div style={rowS}>
              <label style={ctl}>{tr("Line azimuth (°)")}<input type="number" min="0" max="359" value={grid.azimuth} onChange={(e) => setGrid((g) => ({ ...g, azimuth: ((Number(e.target.value) % 360) + 360) % 360 }))} style={inp} /></label>
              <label style={ctl}>{tr("Line spacing (m)")}<input type="number" min="5" value={grid.lineSpacing} onChange={(e) => setGrid((g) => ({ ...g, lineSpacing: Math.max(5, Number(e.target.value) || 100) }))} style={inp} /></label>
              <label style={ctl}>{tr("Station spacing (m)")}<input type="number" min="1" value={grid.stationSpacing} onChange={(e) => setGrid((g) => ({ ...g, stationSpacing: Math.max(1, Number(e.target.value) || 25) }))} style={inp} /></label>
              <label style={{ ...ctl, display: "flex", alignItems: "center", gap: 5, marginTop: 16 }}><input type="checkbox" checked={grid.stagger} onChange={(e) => setGrid((g) => ({ ...g, stagger: e.target.checked }))} />{tr("Stagger alternate lines")}</label>
              <div style={{ ...note, flexBasis: "100%" }}>{tr("Lines usually run across the expected strike; a target should be crossed by at least two or three stations, so set the station spacing from the anomaly width you expect (Rose, Hawkes & Webb 1979).")}</div>
            </div>
          ) : (
            <div style={rowS}>
              {!terrain ? <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("Stream sites come from the terrain: load or fetch terrain over the area first (Maps tab).")}</div> : !route ? <div style={note}>{routeErr ? tr("Routing failed: {m}", { m: routeErr }) : tr("Routing the terrain…")}</div> : null}
              <span style={ctl}>{tr("Strahler orders")}</span>
              {[1, 2, 3, 4].map((o) => <label key={o} style={{ ...ctl, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={streams.orders.includes(o)} onChange={(e) => setStreams((s) => ({ ...s, orders: e.target.checked ? [...s.orders, o].sort() : s.orders.filter((x) => x !== o) }))} />{o}</label>)}
              <label style={ctl}>{tr("Catchment from (km²)")}<input type="number" min="0.01" step="0.1" value={streams.minAreaKm2} onChange={(e) => setStreams((s) => ({ ...s, minAreaKm2: Math.max(0.01, Number(e.target.value) || 0.5) }))} style={inp} /></label>
              <label style={ctl}>{tr("to (km²)")}<input type="number" min="0.1" step="1" value={streams.maxAreaKm2} onChange={(e) => setStreams((s) => ({ ...s, maxAreaKm2: Math.max(0.1, Number(e.target.value) || 20) }))} style={inp} /></label>
              <div style={{ ...note, flexBasis: "100%" }}>{tr("A site is proposed on each tributary just above its confluence with an equal or larger stream, so it samples that catchment only. Regional programs often aim at one site per few square kilometres; check access in the field.")}</div>
            </div>
          )}
          <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={rowS}>
              <label style={ctl}>{tr("Sample number prefix")}<input value={num.prefix} onChange={(e) => setNum((n) => ({ ...n, prefix: e.target.value }))} placeholder="SL24-" style={{ ...inp, width: 90 }} /></label>
              <label style={ctl}>{tr("First number")}<input type="number" min="0" value={num.start} onChange={(e) => setNum((n) => ({ ...n, start: e.target.value }))} style={inp} /></label>
              <label style={ctl}>{tr("Digits")}<input type="number" min="1" max="9" value={num.digits} onChange={(e) => setNum((n) => ({ ...n, digits: e.target.value }))} style={{ ...inp, width: 60 }} /></label>
              <label style={ctl}>{tr("Samples a day (crew)")}<input type="number" min="1" value={num.perDay} onChange={(e) => setNum((n) => ({ ...n, perDay: Math.max(1, Number(e.target.value) || 40) }))} style={inp} /></label>
            </div>
            <div style={rowS}>
              <span style={ctl}>{tr("QC inserts")}</span>
              {qc.map((q, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-sm)" }}>
                  <input type="checkbox" checked={q.on} onChange={(e) => setQc((l) => l.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} aria-label={tr("Use this insert")} />
                  <input value={q.label} onChange={(e) => setQc((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={{ ...sel, width: 120 }} aria-label={tr("Insert name")} />
                  {tr("every")}<input type="number" min="2" value={q.every} onChange={(e) => setQc((l) => l.map((x, j) => (j === i ? { ...x, every: Math.max(2, Number(e.target.value) || 20) } : x)))} style={{ ...sel, width: 56 }} aria-label={tr("Every N samples")} />
                  <button type="button" style={linkBtn} onClick={() => setQc((l) => l.filter((_, j) => j !== i))} aria-label={tr("Remove this insert")}>×</button>
                </span>
              ))}
              <select value="" onChange={(e) => { if (e.target.value) setQc((l) => [...l, { kind: e.target.value, every: 25, label: e.target.value === "duplicate" ? "duplicate" : e.target.value, on: true }]); }} style={sel} aria-label={tr("Add an insert")}>
                <option value="">{tr("+ add an insert")}</option><option value="standard">{tr("standard")}</option><option value="blank">{tr("blank")}</option><option value="duplicate">{tr("duplicate (same site)")}</option>
              </select>
            </div>
          </div>
          {plan && (
            <>
              <div style={{ ...note, color: "var(--color-text)" }}>
                {tr("{n} sites → {total} numbers ({qc} QC inserts){km}; about {days} field days at {perDay} samples a day.", { n: plan.sites.length.toLocaleString(), total: rows.length.toLocaleString(), qc: nQc, km: plan.lineKm != null ? tr(", {km} line-km", { km: plan.lineKm.toFixed(1) }) : "", days: Math.ceil(plan.sites.length / num.perDay), perDay: num.perDay })}
                {plan.truncated ? " " + tr("Stopped at 50,000 stations: widen the spacing.") : ""}
              </div>
              <div style={rowS}>
                <button type="button" style={btn(true)} onClick={draw} disabled={!plan.sites.length}>{tr("Show on the map")}</button>
                <button type="button" style={dl} onClick={() => save("gpx", (ll) => planGpx(rows, plan.sites, ll, title), "GPX")} disabled={!rows.length}><Download size={14} />GPX</button>
                <button type="button" style={dl} onClick={() => save("kml", (ll) => planKml(rows, plan.sites, ll, title), "KML")} disabled={!rows.length}><Download size={14} />KML</button>
                <button type="button" style={dl} onClick={() => save("csv", (ll) => toExportCsv(planCsvRows(rows, plan.sites, ll)), "CSV")} disabled={!rows.length}><Download size={14} />CSV</button>
                <button type="button" style={dl} onClick={() => save("html", (_ll, epsg) => planFieldSheet(rows, plan.sites, { title, crs: `${crsName(epsg) || ""} (EPSG:${epsg})` }), "HTML")} disabled={!rows.length}><Download size={14} />{tr("Field sheet (print)")}</button>
              </div>
              {msg && <div style={note}>{msg}</div>}
              <div style={note}>{tr("GPX and KML are in WGS 84 for a handheld GPS or a phone. A soil grid's KML shows the lines (the numbered stations are in a folder that starts hidden); its GPX has the lines as tracks and the stations as waypoints. Stream sites are points. QC inserts are in the CSV and the field sheet, in the order they go into the sample stream. Duplicates are taken at the site of the sample they follow.")}</div>
            </>
          )}
        </div>
        <div style={{ display: "flex", padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}><span style={{ flex: 1 }} /><button type="button" style={btn(false)} onClick={onClose}>{tr("Close")}</button></div>
      </div>
    </div>
  );
}

const panelBox = panel({ width: "min(1000px, 96vw)", maxHeight: "92vh" }); // TASKS.csv #997 — the shared modal chrome
const ctl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const rowS = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" };
const inp = { ...sel, display: "block", marginTop: 4, width: 80 };
const tabBtn = { background: "none", border: "none", padding: "6px 10px", cursor: "pointer", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const linkBtn = { background: "none", border: "none", padding: "0 2px", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const dl = { ...btn(false), display: "flex", alignItems: "center", gap: 6 };
