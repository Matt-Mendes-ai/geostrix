// TASKS.csv #844 — the survey planner: a soil grid over an area, or stream-sediment sites above confluences from the
// terrain, numbered with the program's own QC slots, drawn on the map and exported for the crew (GPX, KML, CSV and a
// printable field sheet). Maths in lib/surveyPlan.js; stream routing shared with the Catchments panel (#845).
import React, { useEffect, useMemo, useState } from "react";
import { Download } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { mainClusters } from "../lib/dataClusters.js"; // TASKS.csv #1385
import { sampleAreas, coverage } from "../lib/sampleAreas.js"; // TASKS.csv #1795
import { soilGrid, streamSites, numberSamples, planGpx, planKml, planCsvRows, planFieldSheet } from "../lib/surveyPlan.js";
import { routeTerrainAsync } from "../lib/hydrologyClient.js";
import { pointTransform, crsName } from "../lib/reproject.js";
import { loadIgrf, gridBearingAsTrueMagnetic, bearingPhrase } from "../lib/azimuthRef.js"; // TASKS.csv #1024
import { exportCrs, exportXY, bearingToWorld } from "../lib/tiedExport.js"; // TASKS.csv #1021; a tied local grid: #2322
import { saveFile } from "../lib/desktop.js";
import { backdropProps, sel } from "../lib/modalStyles.js";
import { openHelp } from "../lib/help.js"; // TASKS.csv #4042
import { t as tr } from "../lib/i18n.js";
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4087 — the shared step shell (Escape and the focus trap)
import { StepChoices } from "./StepPane.jsx";
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { localDate } from "../lib/localDate.js"; // TASKS.csv #2358
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926 — '0,05' and '0.05' both read

const DEFAULT_QC = [{ kind: "standard", every: 20, label: "standard", on: true }, { kind: "blank", every: 30, label: "blank", on: true }, { kind: "duplicate", every: 20, label: "field duplicate", on: true }];
const LS = "geostrix.surveyPlanner";
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } };

export default function SurveyPlannerPanel({ onClose, initialMode = null }) { // initialMode: TASKS.csv #4042 ("streams" from the terrain)
  const [at, setAt] = useState(0); // TASKS.csv #4087 — the step on screen
  const { boundaries = [], terrain, surfaceSamples = [], project, addBoundary } = useStore();
  const prefs = useMemo(loadPrefs, []);
  const [mode, setMode] = useState(initialMode || prefs.mode || "soil");
  const [areaId, setAreaId] = useState("");
  const [rect, setRect] = useState({ x0: "", y0: "", x1: "", y1: "" });
  const [grid, setGrid] = useState({ azimuth: 0, lineSpacing: 100, stationSpacing: 25, stagger: false, serpentine: true, ...(prefs.grid || {}) }); // serpentine: #1046
  const [streams, setStreams] = useState({ orders: [1, 2], minAreaKm2: 0.5, maxAreaKm2: 20, ...(prefs.streams || {}) });
  const [num, setNum] = useState({ prefix: "", start: 1, digits: 5, perDay: 40, ...(prefs.num || {}) });
  const [qc, setQc] = useState(prefs.qc || DEFAULT_QC);
  const [route, setRoute] = useState(null);
  const [routeErr, setRouteErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [surveyDate, setSurveyDate] = useState(() => localDate()); // #1024 — the declination's date; #2358: the local calendar's, not UTC
  const [igrfReady, setIgrfReady] = useState(false);
  useEffect(() => { if (mode === "soil") loadIgrf().then(() => setIgrfReady(true)).catch(() => {}); }, [mode]);
  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify({ mode, grid, streams, num, qc })); } catch { /* private window */ } }, [mode, grid, streams, num, qc]);
  useEffect(() => { if (mode !== "streams" || !terrain || route) return; routeTerrainAsync(terrain).then(setRoute).catch((e) => setRouteErr(e.message)); }, [mode, terrain, route]);

  // the area: a boundary's first ring, the terrain or the samples' extent, or typed corners (project CRS)
  const areas = useMemo(() => {
    const out = [];
    // closed outlines only: open lines (a stream network, follow-up reaches, a survey line) are not areas
    boundaries.forEach((b) => { const ring = (b.polylines || []).find((l, i) => l.length >= 3 && b.closedFlags?.[i] !== false); if (ring) out.push({ id: `b:${b.id}`, label: tr("Boundary: {name}", { name: b.name }), ring: ring.map((p) => [p.x, p.y]) }); });
    const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    if (terrain?.bbox) out.push({ id: "terrain", label: tr("The terrain's extent"), ring: box(...terrain.bbox) });
    const core = mainClusters(surfaceSamples).keep; // #1385 — not the 5 rocks 45 km south (50,001 soil sites, 1,251 field days on Silvertip)
    const pts = surfaceSamples.filter((s, i) => core[i] && Number.isFinite(s.x) && Number.isFinite(s.y));
    // #1795 — one area per grid (a Target-like column, else spatial clusters), before the box around them all
    const grids = sampleAreas(pts);
    (grids?.areas || []).forEach((a, i) => out.push({ id: `grid:${i}`, label: grids.by === "cluster" ? tr("Around sample cluster {name} ({n} samples)", { name: a.name, n: a.n.toLocaleString() }) : tr("Around the samples of {name} ({n})", { name: a.name, n: a.n.toLocaleString() }), ring: box(...a.box), box: a.box }));
    if (pts.length) { const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), b = [Math.min(...xs) - 200, Math.min(...ys) - 200, Math.max(...xs) + 200, Math.max(...ys) + 200]; out.push({ id: "samples", label: grids ? tr("Around all the surface samples") : tr("Around the surface samples"), ring: box(...b), box: b }); }
    const r = rect; if ([r.x0, r.y0, r.x1, r.y1].every((v) => v !== "" && Number.isFinite(Number(v))) && Number(r.x1) > Number(r.x0) && Number(r.y1) > Number(r.y0)) out.push({ id: "rect", label: tr("Typed corners"), ring: box(Number(r.x0), Number(r.y0), Number(r.x1), Number(r.y1)) });
    return out;
  }, [boundaries, terrain, surfaceSamples, rect]);
  const area = areas.find((a) => a.id === areaId) || null;
  // #1795 — how much of a samples box is near a sample (a box spanning several grids is mostly empty ground)
  const areaCover = useMemo(() => (area?.box && (area.id === "samples" || area.id.startsWith("grid:")) ? coverage(area.box, surfaceSamples) : null), [area, surfaceSamples]);
  const pickArea = (id) => { setAreaId(id); const a = areas.find((x) => x.id === id); if (a?.box) setRect({ x0: Math.round(a.box[0]), y0: Math.round(a.box[1]), x1: Math.round(a.box[2]), y1: Math.round(a.box[3]) }); }; // the corners show the extent used

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
  // TASKS.csv #1024 — the line bearing as grid, true and magnetic at the area's centre (a crew on a compass walking the
  // grid bearing drifted 250-300 m per km at Harry / Woodjam); in the title (KML / GPX name, field sheet heading) and CSV
  const centre = area ? [area.ring.reduce((s, p) => s + p[0], 0) / area.ring.length, area.ring.reduce((s, p) => s + p[1], 0) / area.ring.length] : null;
  // tie (#2322): on a tied local grid the bearing is turned to the tie CRS's grid and taken at the centre's place in it
  const bearingFor = (epsg, tie = null) => {
    if (!(mode === "soil" && centre && epsg && igrfReady)) return null;
    const c = exportXY(tie)(centre[0], centre[1]);
    return gridBearingAsTrueMagnetic(bearingToWorld(tie, grid.azimuth), c[0], c[1], epsg, surveyDate);
  };
  const shownEpsg = project?.crsSet !== false && project?.epsg ? Number(project.epsg) : null;
  const bearing = bearingFor(shownEpsg);
  const titleFor = (b, tie = null) => (mode === "soil" ? `Soil grid: ${grid.lineSpacing} x ${grid.stationSpacing} m, lines at ${bearingPhrase(b, bearingToWorld(tie, grid.azimuth))}` : title);
  const title = mode === "soil" ? `Soil grid: ${grid.lineSpacing} x ${grid.stationSpacing} m, lines at ${grid.azimuth}° grid` : `Stream sites: order ${streams.orders.join(", ")}, ${streams.minAreaKm2}-${streams.maxAreaKm2} km²`;

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
    const ex = await exportCrs(project); if (!ex) return; // #2322 — a tied local grid: through its tie
    const { epsg, tie } = ex, T = pointTransform(epsg, 4326), P = exportXY(tie);
    if (!T) { setMsg(tr("EPSG:{epsg} could not be converted to latitude / longitude, so no GPS file was written.", { epsg })); return; }
    const b = bearingFor(epsg, tie); // #1024 — with the CRS just chosen, if it was asked for
    saveFile({ suggestedName: `survey_plan.${ext}`, filters: [{ name: kind, extensions: [ext] }], content: build((x, y) => T(...P(x, y)), epsg, titleFor(b, tie), b) });
  };

  // TASKS.csv #4087 — on the shared step shell (StepDialog, #4073): Area (a soil grid or stream sites, and where), Grid / Streams (the spacing or the stream
  // sizes), Numbering (the prefix and the QC inserts), Plan (the counts, the files for the crew, and Show on the map, the gold primary). The notes are on the Help card.
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{tr("Survey planner")}</summary>
      <div style={note}>{tr("A soil grid or stream-sediment sites, numbered with your QC inserts, for the field crew")}</div>
      <div style={{ ...note, marginTop: 6 }}>{mode === "soil"
        ? tr("Lines usually run across the expected strike; a target should be crossed by at least two or three stations, so set the station spacing from the anomaly width you expect (Rose, Hawkes & Webb 1979).")
        : tr("One site per tributary, just above its confluence with an equal or larger stream, so it samples that catchment only. Regional programs often use one site per few square kilometres; check access in the field.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("A soil grid's KML shows the lines (stations in a folder that starts hidden); its GPX has the lines as tracks and the stations as waypoints. Stream sites are points. The CSV and field sheet list QC inserts in sample order; duplicates are taken at the site of the sample they follow.")}</div>
      <button data-btn-own="" type="button" onClick={() => openHelp("survey-planner")} style={{ background: "none", border: "none", padding: 0, marginTop: 6, cursor: "pointer", color: "var(--color-accent-dark)", fontSize: "var(--font-size-sm)", textDecoration: "underline" }}>{tr("Help: {name}", { name: tr("Survey planner") })}</button>{/* TASKS.csv #4042 */}
    </details>
  );
  const body = (children) => <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>;
  const steps = [
    { key: "area", label: tr("Area"), primary: { label: mode === "soil" ? tr("Next: grid") : tr("Next: streams"), disabled: mode === "soil" && !area }, hint: mode === "soil" && !area ? tr("Choose an area.") : "", render: () => body(<>
          <StepChoices value={mode} onChange={setMode} label={tr("Survey planner")} columns={2} options={[{ value: "soil", label: tr("Soil grid") }, { value: "streams", label: tr("Stream sites") }]} />
          <div style={rowS}>
            <label style={ctl}>{mode === "soil" ? tr("Area") : tr("Area (optional)")}<select value={areaId} onChange={(e) => pickArea(e.target.value)} style={{ ...sel, display: "block", marginTop: 4, maxWidth: 260 }}>
              <option value="">{mode === "soil" ? tr("— choose —") : tr("Whole terrain")}</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select></label>
            {["x0", "y0", "x1", "y1"].map((k) => <label key={k} style={ctl}>{{ x0: tr("West (E)"), y0: tr("South (N)"), x1: tr("East (E)"), y1: tr("North (N)") }[k]}<NumberInput allowEmpty value={rect[k] === "" ? null : rect[k]} onChange={(v) => { setRect((r) => ({ ...r, [k]: v == null ? "" : String(v) })); setAreaId("rect"); }} style={{ ...sel, display: "block", marginTop: 4, width: 100 }} wrapStyle={{ display: "flex" }} /></label>)}
          </div>
          {areaCover != null && areaCover < 0.25 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)" }}>{tr("Only {pct} % of this area lies within 250 m of a sample: it spans the ground between separate grids. Pick one grid's area, or type the corners.", { pct: Math.round(areaCover * 100) })}</div>}{/* #1795 */}
    </>) },
    { key: "spacing", label: mode === "soil" ? tr("Grid") : tr("Streams"), primary: { label: tr("Next: numbering") }, render: () => body(<>
          {mode === "soil" ? (
            <div style={rowS}>
              <label style={ctl}>{tr("Line azimuth (°)")}<NumberInput value={grid.azimuth} onChange={(v) => setGrid((g) => ({ ...g, azimuth: ((v % 360) + 360) % 360 }))} style={inp} wrapStyle={{ display: "flex" }} />{/* #3926 — wrapped to 0-359 as before, not refused */}</label>
              <label style={ctl}>{tr("Line spacing (m)")}<NumberInput min={5} value={grid.lineSpacing} onChange={(v) => setGrid((g) => ({ ...g, lineSpacing: v }))} style={inp} wrapStyle={{ display: "flex" }} /></label>
              <label style={ctl}>{tr("Station spacing (m)")}<NumberInput min={1} value={grid.stationSpacing} onChange={(v) => setGrid((g) => ({ ...g, stationSpacing: v }))} style={inp} wrapStyle={{ display: "flex" }} /></label>
              <label style={ctl}>{tr("Survey date (declination)")}<input type="date" value={surveyDate} onChange={(e) => setSurveyDate(e.target.value)} style={{ ...inp, width: 130 }} /></label>
              <label style={{ ...ctl, display: "flex", alignItems: "center", gap: 5, marginTop: 16 }}><input type="checkbox" checked={grid.stagger} onChange={(e) => setGrid((g) => ({ ...g, stagger: e.target.checked }))} />{tr("Stagger alternate lines")}</label>
              <label style={{ ...ctl, display: "flex", alignItems: "center", gap: 5, marginTop: 16 }} title={tr("Number the samples up one line and down the next, the way a crew walks the grid. Off: every line from the same end.")}><input type="checkbox" checked={grid.serpentine !== false} onChange={(e) => setGrid((g) => ({ ...g, serpentine: e.target.checked }))} />{tr("Serpentine numbering")}</label>
              <div style={{ ...note, flexBasis: "100%", color: "var(--color-text)" }}>{bearing
                ? (bearing.magnetic != null
                  ? tr("Line bearing: {g}° grid, {t}° true, {m}° magnetic (declination {d}° on {date}, IGRF-14). A crew on a compass walks the magnetic bearing.", { g: bearing.grid, t: bearing.true, m: bearing.magnetic, d: bearing.declination, date: bearing.date })
                  : tr("Line bearing: {g}° grid, {t}° true (no magnetic bearing for this date).", { g: bearing.grid, t: bearing.true }))
                : tr("The line azimuth is a grid bearing (project CRS). Choose an area to see it as true and magnetic bearings.")}</div>
            </div>
          ) : (
            <div style={rowS}>
              {!terrain ? <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("Stream sites come from the terrain: load or fetch terrain over the area first, or build one offline from points or contours (Maps > Terrain).")}</div> : !route ? <div style={note}>{routeErr ? tr("Routing failed: {m}", { m: routeErr }) : tr("Routing the terrain…")}</div> : null}
              <span style={ctl}>{tr("Strahler orders")}</span>
              {[1, 2, 3, 4].map((o) => <label key={o} style={{ ...ctl, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={streams.orders.includes(o)} onChange={(e) => setStreams((s) => ({ ...s, orders: e.target.checked ? [...s.orders, o].sort() : s.orders.filter((x) => x !== o) }))} />{o}</label>)}
              <label style={ctl}>{tr("Catchment from (km²)")}<NumberInput min={0.01} step={0.1} value={streams.minAreaKm2} onChange={(v) => setStreams((s) => ({ ...s, minAreaKm2: v }))} style={inp} wrapStyle={{ display: "flex" }} /></label>
              <label style={ctl}>{tr("to (km²)")}<NumberInput min={0.1} step={1} value={streams.maxAreaKm2} onChange={(v) => setStreams((s) => ({ ...s, maxAreaKm2: v }))} style={inp} wrapStyle={{ display: "flex" }} /></label>
            </div>
          )}
    </>) },
    { key: "numbers", label: tr("Numbering"), primary: { label: tr("Next: plan") }, render: () => body(<>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={rowS}>
              <label style={ctl}>{tr("Sample number prefix")}<input value={num.prefix} onChange={(e) => setNum((n) => ({ ...n, prefix: e.target.value }))} placeholder="SL24-" style={{ ...inp, width: 90 }} /></label>
              <label style={ctl}>{tr("First number")}<NumberInput allowEmpty min={0} step={1} value={num.start === "" ? null : num.start} onChange={(v) => setNum((n) => ({ ...n, start: v == null ? "" : String(v) }))} style={inp} wrapStyle={{ display: "flex" }} /></label>
              <label style={ctl}>{tr("Digits")}<NumberInput allowEmpty min={1} max={9} step={1} value={num.digits === "" ? null : num.digits} onChange={(v) => setNum((n) => ({ ...n, digits: v == null ? "" : String(v) }))} style={{ ...inp, width: 60 }} wrapStyle={{ display: "flex" }} /></label>
              <label style={ctl}>{tr("Samples a day (crew)")}<NumberInput min={1} value={num.perDay} onChange={(v) => setNum((n) => ({ ...n, perDay: v }))} style={inp} wrapStyle={{ display: "flex" }} /></label>
            </div>
            <div style={rowS}>
              <span style={ctl}>{tr("QC inserts")}</span>
              {qc.map((q, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-sm)" }}>
                  <input type="checkbox" checked={q.on} onChange={(e) => setQc((l) => l.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} aria-label={tr("Use this insert")} />
                  <input value={q.label} onChange={(e) => setQc((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={{ ...sel, width: 120 }} aria-label={tr("Insert name")} />
                  {tr("every")}<NumberInput min={2} step={1} value={q.every} onChange={(v) => setQc((l) => l.map((x, j) => (j === i ? { ...x, every: v } : x)))} style={{ ...sel, width: 56 }} aria-label={tr("Every N samples")} />
                  <button data-btn-own="" type="button" style={linkBtn} onClick={() => setQc((l) => l.filter((_, j) => j !== i))} aria-label={tr("Remove this insert")}>×</button>
                </span>
              ))}
              <select value="" onChange={(e) => { if (e.target.value) setQc((l) => [...l, { kind: e.target.value, every: 25, label: e.target.value === "duplicate" ? "duplicate" : e.target.value, on: true }]); }} style={sel} aria-label={tr("Add an insert")}>
                <option value="">{tr("+ add an insert")}</option><option value="standard">{tr("standard")}</option><option value="blank">{tr("blank")}</option><option value="duplicate">{tr("duplicate (same site)")}</option>
              </select>
            </div>
          </div>
    </>) },
    { key: "plan", label: tr("Plan"), primary: { label: tr("Show on the map"), onClick: draw, disabled: !plan?.sites.length }, hint: !plan ? (mode === "soil" ? tr("Choose an area.") : "") : "", render: () => body(<>
          {plan && (
            <>
              <div style={{ ...note, color: "var(--color-text)" }}>
                {tr("{n} sites → {total} numbers ({qc} QC inserts){km}; about {days} field days at {perDay} samples a day.", { n: plan.sites.length.toLocaleString(), total: rows.length.toLocaleString(), qc: nQc, km: plan.lineKm != null ? tr(", {km} line-km", { km: plan.lineKm.toFixed(1) }) : "", days: Math.ceil(plan.sites.length / num.perDay), perDay: num.perDay })}
                {plan.truncated ? " " + tr("Stopped at 50,000 stations: widen the spacing.") : ""}
              </div>
              <div style={rowS}>
                <button type="button" className="gs-btn" onClick={() => save("gpx", (ll, _e, t) => planGpx(rows, plan.sites, ll, t), "GPX")} disabled={!rows.length}><Download size={14} />GPX</button>
                <button type="button" className="gs-btn" onClick={() => save("kml", (ll, _e, t) => planKml(rows, plan.sites, ll, t), "KML")} disabled={!rows.length}><Download size={14} />KML</button>
                <button type="button" className="gs-btn" onClick={() => save("csv", (ll, e, _t, b) => toExportCsv(planCsvRows(rows, plan.sites, ll).map((r) => ({ ...r, crs: `EPSG:${e}` /* #1064 — x / y */, ...(mode === "soil" ? { line_bearing_grid: grid.azimuth, line_bearing_true: b?.true ?? "", line_bearing_magnetic: b?.magnetic ?? "", declination_date: b?.date ?? "" } : {}) }))), "CSV")} disabled={!rows.length}><Download size={14} />CSV</button>
                <button type="button" className="gs-btn" onClick={() => save("html", (_ll, epsg, t) => planFieldSheet(rows, plan.sites, { title: t, crs: `${crsName(epsg) || ""} (EPSG:${epsg})` }), "HTML")} disabled={!rows.length}><Download size={14} />{tr("Field sheet (print)")}</button>
              </div>
              {msg && <div style={note}>{msg}</div>}
              <div style={note}>{tr("GPX and KML are WGS 84, for a handheld GPS or phone.")}</div>
            </>
          )}
    </>) },
  ];
  return <StepDialog title={tr("Survey planner")} onClose={onClose} steps={steps} at={at} onAt={setAt} help={help} width="min(1000px, 96vw)" overlayProps={backdropProps(onClose)} />;
}

const ctl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const rowS = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" };
const inp = { ...sel, display: "block", marginTop: 4, width: 80 };
const linkBtn = { background: "none", border: "none", padding: "0 2px", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
