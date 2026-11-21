import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, ShieldAlert, AlertTriangle, Info, RefreshCw, Download } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { runDataQCSliced, collarTerrainOffsets, qcIssueRows, qcSorted, DOGLEG_ERROR_DEFAULT, terrainNodeM } from "../lib/dataQC.js"; // qcIssueRows: #1111; Sliced: #3136
import { saveFile } from "../lib/desktop.js";
import { openHelp } from "../lib/help.js"; // TASKS.csv #3528
import { openDataTable } from "../lib/dataTableRequests.js"; // TASKS.csv #3569
import { qcKey, qcTableRequest } from "../lib/qcActions.js";
import { densityRangeOf } from "../lib/densityRange.js"; // TASKS.csv #3587
import { toExportCsv } from "../lib/tabular.js";
import { stampLines, withStamp, stampEpsg } from "../lib/provenance.js";
import { normalizeDesurveyMethod } from "../lib/desurvey.js";
import { version as APP_VERSION } from "../../package.json";
import { useVirtualRows } from "../lib/useVirtualRows.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import NumberInput from "./NumberInput.jsx";
import { askConfirm } from "../lib/confirmDialog.js"; // TASKS.csv #3957 // TASKS.csv #3926

// TASKS.csv #222 — a real project's QC pass can run into the thousands of issues (measured: 26,762 DOM
// nodes at 3000 synthetic issues, 12,819 on the real 37-hole Harry property set's own 1483 issues) with
// no cap/paging before this fix. Fixed-height row windowing (see useVirtualRows.js) — 52px comfortably
// fits the category/holeId line plus a 2-line message; the message itself is clamped to 2 lines
// (-webkit-line-clamp) so an unusually long one truncates with an ellipsis instead of overflowing its
// fixed-height row and overlapping its neighbor.
const ISSUE_ROW_H = 52;

// TASKS.csv #82 — drillhole data QA/QC (layer 1 of the geological-modelling architecture the user
// laid out — see #82's TASKS.csv note for the full plan). Runs on demand (not live on every
// keystroke/import — a full project's worth of intervals is cheap but not free to re-check on every
// render) via a "Run QC" button in ViewerModule's Home tab sidebar, opening this modal.
const SEVERITY_META = {
  error: { icon: ShieldAlert, color: "#e0716a", label: "Error", plural: "Errors" },
  warning: { icon: AlertTriangle, color: "#e2a63c", label: "Warning", plural: "Warnings" },
  info: { icon: Info, color: "#6fa8dc", label: "Info", plural: "Infos" },
};

const NOT_YET = { issues: [], byCategory: new Map(), summary: {} }; // #3099 — before the check has run

export default function DataQCModal({ onCancel, onZoomHole = null /* TASKS.csv #3569 — find the hole in 3D */ }) {
  useEscapeKey(onCancel); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const { project, collars, survey, layers, boundaries, assays, assayElements, terrain, setCollars, customLayers, setProjectDensityRange, setProjectQcChecked } = useStore(); // customLayers: #2493; assayElements: #3569; the setters: #3587 / #3569
  // TASKS.csv #558 — collars vs the loaded terrain, with an adjustable threshold and an (undoable) snap
  const [terrainThreshold, setTerrainThreshold] = useState(15);
  // TASKS.csv #723 — the dogleg warning level (deg per 30 m), remembered on this computer: ordinary deviated
  // holes run 3-7 deg/30 m, so the fixed 3 left a permanent yellow list. Errors stay at 10 (or the warning, if higher).
  const [doglegWarn, setDoglegWarn] = useState(() => { try { return Number(localStorage.getItem("geostrix.qc.doglegWarn")) || 3; } catch { return 3; } });
  useEffect(() => { try { if (Number(doglegWarn) > 0) localStorage.setItem("geostrix.qc.doglegWarn", String(doglegWarn)); } catch { /* storage unavailable */ } }, [doglegWarn]);
  const warnDeg = Number(doglegWarn) > 0 ? Number(doglegWarn) : 3;
  const densityRange = densityRangeOf(project); // TASKS.csv #3587 — the plausible density (t/m³), a project setting
  const qcArgs = () => ({ project, collars, survey, layers, boundaries, assays, assayElements, densityRange, terrain, customLayers, terrainThreshold: Number(terrainThreshold) > 0 ? Number(terrainThreshold) : 15, doglegWarn: warnDeg, doglegError: Math.max(DOGLEG_ERROR_DEFAULT, warnDeg) }); // #3526 — 20°/30 m, not 10
  const ranWith = useRef(null); // TASKS.csv #1269 — the thresholds of the run on screen: the export's stamp must describe its issues, not the boxes
  // TASKS.csv #3136 — the check runs a slice at a time (lib/dataQC.js runDataQCSliced): the window keeps painting and taking input, the
  // status line says how far it is, and a newer run (Re-run, a snap to the terrain, closing the dialog) supersedes the one under way
  const runGen = useRef(0);
  const [progress, setProgress] = useState(null); // { step, of } while a run is under way
  const check = () => {
    const gen = ++runGen.current, thresholds = { warnDeg, terrainThreshold: Number(terrainThreshold) > 0 ? Number(terrainThreshold) : 15 };
    setProgress({ step: 0, of: 5 });
    runDataQCSliced(qcArgs(), { onProgress: (p) => { if (runGen.current === gen) setProgress(p); }, cancelled: () => runGen.current !== gen })
      .then((r) => { if (r && runGen.current === gen) { ranWith.current = thresholds; setResult(r); setProgress(null); } }, (e) => { if (runGen.current === gen) { setProgress(null); console.error(e); } });
  };
  useEffect(() => () => { runGen.current++; }, []); // closed: the run under way stops
  // TASKS.csv #3099 (#2937, WA iron) — the check took 1.4 s (148,000 assays, 150,455 intervals) before the dialog appeared. It opens at once
  // with 'Checking …' and runs just after it is painted (a worker would first copy all those rows across, about as long as the check).
  const [ran, setResult] = useState(null);
  useEffect(() => { const f = requestAnimationFrame(() => check()); return () => cancelAnimationFrame(f); }, []); // after a frame: painted first
  const result = ran || NOT_YET;
  const terrainOff = useMemo(() => (terrain ? collarTerrainOffsets(collars, terrain).filter((o) => Math.abs(o.dz) > (Number(terrainThreshold) > 0 ? Number(terrainThreshold) : 15)) : []), [collars, terrain, terrainThreshold]);
  const snapToTerrain = async () => {
    if (!terrainOff.length) return;
    if (!await askConfirm(tr("Set the elevation of {terrainOff} collar(s) to the terrain \"{v}\" (worst: {hole_id}, {v2}{dz} m)?\n\nEach keeps its old elevation in \"z_before_snap\". Ctrl+Z undoes it.", { terrainOff: terrainOff.length, v: terrain.name || "DEM", hole_id: terrainOff[0].hole_id, v2: terrainOff[0].dz > 0 ? "+" : "", dz: terrainOff[0].dz.toFixed(1) }))) return;
    const byId = new Map(terrainOff.map((o) => [o.hole_id, o]));
    setCollars((prev) => prev.map((c) => (byId.has(c.hole_id) ? { ...c, z_before_snap: c.z, z: Math.round(byId.get(c.hole_id).dem * 100) / 100, z_source: `terrain: ${terrain.name || "DEM"}` } : c)));
    rerunAfterSnap.current = true; // re-run once the new collars are in (an immediate re-run saw the old ones)
  };
  const rerunAfterSnap = useRef(false), rerunAfterRange = useRef(false);
  useEffect(() => { if (rerunAfterRange.current) { rerunAfterRange.current = false; check(); } }, [project?.densityRange]); // the new range, then the check (an immediate re-run read the old one)
  const [dMin, setDMin] = useState(String(densityRange.min)), [dMax, setDMax] = useState(String(densityRange.max));
  const applyDensity = (minT = dMin, maxT = dMax) => { const a = Number(minT), b = Number(maxT); if (!(Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b > a)) { setDMin(String(densityRange.min)); setDMax(String(densityRange.max)); return; } if (a === densityRange.min && b === densityRange.max) return; rerunAfterRange.current = true; setProjectDensityRange?.({ min: a, max: b }); };
  useEffect(() => { if (rerunAfterSnap.current) { rerunAfterSnap.current = false; check(); } }, [collars]);
  const [filter, setFilter] = useState(new Set(["error", "warning", "info"]));
  // TASKS.csv #3569 — rows marked as checked (kept on this computer, per project): dimmed, or left out of the list with the box
  const checked = useMemo(() => new Set(project?.qcChecked || []), [project?.qcChecked]); // TASKS.csv #3587 (store grant) — kept in the project file, so the marks travel with it
  const [hideChecked, setHideChecked] = useState(false);
  const toggleChecked = (issue) => { const n = new Set(checked), k = qcKey(issue); if (n.has(k)) n.delete(k); else n.add(k); setProjectQcChecked?.([...n]); };
  const [categoryFilter, setCategoryFilter] = useState("all");

  const categories = useMemo(() => Array.from(result.byCategory.keys()).sort(), [result]);
  // TASKS.csv #3526 — worst first: errors, then warnings, then notes, and within each the ordinary rows before the survey bends (flagged minor, a row per hole); the order they came in otherwise
  const shown = useMemo(() => qcSorted(result.issues.filter((i) => filter.has(i.severity) && (categoryFilter === "all" || i.category === categoryFilter) && !(hideChecked && checked.has(qcKey(i))))), [result, filter, categoryFilter, hideChecked, checked]);
  const checkedHere = useMemo(() => result.issues.reduce((n, i) => n + (checked.has(qcKey(i)) ? 1 : 0), 0), [result, checked]);

  // TASKS.csv #1111 — every issue (not just the filtered view) as a CSV, stamped with the project, CRS, desurvey method,
  // the thresholds used and the counts
  const exportIssues = () => {
    const stamp = stampLines({ tool: "Drillhole data QA/QC", version: APP_VERSION, epsg: stampEpsg(project) /* #2195 */, params: [
      `Project: ${project?.name || "untitled"} | desurvey: ${normalizeDesurveyMethod(project?.desurveyMethod)}`,
      `Holes: ${collars.length} collars, ${survey.length} survey stations | dogleg warning ${ranWith.current.warnDeg} deg / 30 m, error ${Math.max(DOGLEG_ERROR_DEFAULT, ranWith.current.warnDeg)}${terrain ? ` | collar vs terrain threshold ${ranWith.current.terrainThreshold} m` : ""}`,
      `Issues: ${result.summary.error || 0} error(s), ${result.summary.warning || 0} warning(s), ${result.summary.info || 0} information`,
    ] });
    const name = String(project?.name || "project").replace(/[^a-z0-9_-]+/gi, "_");
    saveFile({ suggestedName: `${name}_data_qc.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: withStamp(toExportCsv(qcIssueRows(result.issues)), stamp) });
  };
  const toggleSeverity = (sev) => setFilter((p) => { const n = new Set(p); if (n.has(sev)) n.delete(sev); else n.add(sev); return n; });
  const { scrollRef, onScroll, startIndex, endIndex, topPad, bottomPad } = useVirtualRows(shown.length, ISSUE_ROW_H);

  return (
    <div style={overlay} {...backdropProps(onCancel)}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldAlert size={18} color="#55606e" />
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Drillhole data QA/QC")}</div>
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>{/* TASKS.csv #3528 — the help page of this dialog */}<button type="button" className="ge-pane-close ge-pane-help" onClick={() => openHelp("data-qc")} aria-label={tr("Help: {name}", { name: tr("Drillhole data QA/QC") })} title={tr("Help for this tool (F1, works offline)")}>?</button><X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onCancel} /></span>
        </div>

        <div style={{ padding: "16px 16px 0", flexShrink: 0 }}>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 12, lineHeight: 1.5 }}>{tr("Checks collars, surveys, assays and logs for problems that distort a model. It fixes nothing: correct the source and run it again.")}</div>

          {(!ran || progress) && <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 10 }}>{progress?.step ? tr("Checking {n} holes… ({k} of {m})", { n: (collars || []).length, k: progress.step, m: progress.of }) : tr("Checking {n} holes…", { n: (collars || []).length })}</div>}{/* #3099; progress: #3136 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {(["error", "warning", "info"]).map((sev) => {
              const meta = SEVERITY_META[sev];
              const Icon = meta.icon;
              const active = filter.has(sev);
              return (
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} key={sev} onClick={() => toggleSeverity(sev)}
                  style={{ flex: 1, cursor: "pointer", padding: "9px 10px", borderRadius: 7, background: active ? "var(--color-bg-subtle)" : "var(--color-bg)", border: `1px solid ${active ? meta.color : "var(--color-border)"}`, opacity: active ? 1 : 0.5, textAlign: "center" }}>
                  <Icon size={14} color={meta.color} style={{ marginBottom: 3 }} />
                  <div style={{ fontSize: "var(--font-size-xl)", color: "var(--color-text)", fontWeight: 600 }}>{ran ? (result.summary[sev] || 0) : "…" /* TASKS.csv #3532 — no verdict before the first check has run */}</div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{tr(result.summary[sev] === 1 ? meta.label : meta.plural)}</div>
                </div>
              );
            })}
          </div>

          {categories.length > 0 && (
            <select aria-label={tr("Filter by category")} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ ...sel, width: "100%", marginBottom: 10 }}>
              <option value="all">{tr("All categories ({n})", { n: result.issues.length })}</option>
              {categories.map((c) => <option key={c} value={c}>{tr(c)} ({result.byCategory.get(c).length})</option>)}
            </select>
          )}
          {checkedHere > 0 && <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 10, cursor: "pointer" }}><input type="checkbox" checked={hideChecked} onChange={(e) => setHideChecked(e.target.checked)} />{tr("Hide the {n} rows marked as checked", { n: checkedHere })}</label> /* TASKS.csv #3569 */}
        </div>

        {!ran ? null /* #3532 — nothing is said (not "No issues found") until a result exists */ : result.issues.length === 0 ? (
          <div style={{ padding: "20px 10px", textAlign: "center", color: "#7fd9c9", fontSize: "var(--font-size-base)" }}>{tr("No issues found — collars, survey, and every layer look internally consistent.")}</div>
        ) : shown.length === 0 ? (
          <div style={{ padding: "16px 10px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-base)" }}>{tr("No issues match the current filters.")}</div>
        ) : (
          <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px" }}>
            <div style={{ height: topPad }} />
            {shown.slice(startIndex, endIndex).map((issue, i) => {
              const meta = SEVERITY_META[issue.severity];
              const Icon = meta.icon;
              return (
                <div key={startIndex + i} style={{ display: "flex", gap: 8, padding: "7px 8px", borderBottom: "1px solid var(--color-border-subtle)", height: ISSUE_ROW_H, boxSizing: "border-box", opacity: checked.has(qcKey(issue)) ? 0.5 : 1 }}>
                  <Icon size={14} color={meta.color} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{issue.message}</div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 1 }}>{issue.category}{issue.holeId ? ` — ${issue.holeId}` : ""}{checked.has(qcKey(issue)) ? ` · ${tr("checked")}` : ""}</div>
                  </div>
                  {/* TASKS.csv #3569 — a row can be acted on: its interval in the table, its hole in 3D, marked as checked (undone by the same button) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0, justifyContent: "center" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {qcTableRequest(issue) && <button type="button" style={rowBtn} onClick={() => openDataTable(qcTableRequest(issue))} title={tr("Open the table at this row")}>{tr("Table")}</button>}
                      {onZoomHole && issue.holeId && <button type="button" style={rowBtn} onClick={() => onZoomHole(issue.holeId)} title={tr("Find the hole in the 3D view")}>{tr("Find")}</button>}
                    </div>
                    <button type="button" style={rowBtn} onClick={() => toggleChecked(issue)} aria-pressed={checked.has(qcKey(issue))} title={tr("Mark as checked and kept (kept with the project; click again to undo)")}>{checked.has(qcKey(issue)) ? tr("Unmark") : tr("Checked")}</button>
                  </div>
                </div>
              );
            })}
            <div style={{ height: bottomPad }} />
          </div>
        )}

        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "flex-end", flexWrap: "wrap", rowGap: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginRight: 8 }} title={tr("The densities this project accepts (t/m³). A value outside is flagged and left out of the density mean the tonnages use; raise the top for massive sulphide.")}>{/* TASKS.csv #3587 */}
            {tr("Density (t/m³)")}
            <NumberInput min="0" value={dMin} onChange={(v) => { const t = String(v ?? ""); setDMin(t); applyDensity(t, dMax); }} aria-label={tr("Plausible density, lowest (t/m³)")} style={{ ...sel, width: 56, padding: "3px 6px" }} />–
            <NumberInput min="0" value={dMax} onChange={(v) => { const t = String(v ?? ""); setDMax(t); applyDensity(dMin, t); }} aria-label={tr("Plausible density, highest (t/m³)")} style={{ ...sel, width: 56, padding: "3px 6px" }} />
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginRight: 8 }} title={tr("Bends sharper than this are listed, one row per hole. Deviated holes bend 3–7° per 30 m; under 2° is not counted; 20° per 30 m (over 5°) is an error.")}>{tr("Dogleg over")}<NumberInput min="0.5" step="0.5" value={doglegWarn} onChange={(v) => setDoglegWarn(v)} style={{ width: 54, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "2px 4px", color: "var(--color-text)", fontFamily: "inherit" }} aria-label={tr("Dogleg warning threshold (degrees per 30 m)")} /> °/30 m
          </span>
          {terrain && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginRight: 8 }} title={tr("Collars further than this from the loaded terrain are flagged (an auto-fetched terrain: ~15 m or more; LiDAR: a few metres){v}", { v: terrainNodeM(terrain) ? tr(". This terrain's nodes are ~{v} m apart.", { v: Math.round(terrainNodeM(terrain)) }) : "" /* #3807 — [dx, dy] read too */ })}>{tr("Collar vs terrain over")}<NumberInput min="0.5" step="0.5" value={terrainThreshold} onChange={(v) => setTerrainThreshold(v)} style={{ width: 54, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "2px 4px", color: "var(--color-text)", fontFamily: "inherit" }} aria-label={tr("Collar vs terrain threshold (m)")} /> m
              {terrainOff.length > 0 && <button onClick={snapToTerrain} style={rerunBtn} title={tr("Set those collars' elevation to the terrain (undoable; the old value is kept)")}>{tr("Snap {n} to terrain", { n: terrainOff.length })}</button>}
            </span>
          )}
          <button onClick={exportIssues} disabled={!result.issues.length} style={{ ...rerunBtn, marginRight: 8, opacity: result.issues.length ? 1 : 0.5 }} title={tr("Save every issue (severity, category, hole, message) as a CSV, with the project, CRS, desurvey method and thresholds in its header")}>
            <Download size={14} />{" "}{tr("Export CSV")}</button>
          <button onClick={check} disabled={!!progress} style={{ ...rerunBtn, opacity: progress ? 0.5 : 1 }}>
            <RefreshCw size={14} />{" "}{tr("Re-run")}</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(640px, 92vw)", maxHeight: "88vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "7px 9px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const rowBtn = { padding: "1px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text)", fontSize: "var(--font-size-xs)", cursor: "pointer", fontFamily: "inherit" };
const rerunBtn = { display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: "var(--font-size-base)", cursor: "pointer" };
