import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, ShieldAlert, AlertTriangle, Info, RefreshCw, Download } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { runDataQC, collarTerrainOffsets, qcIssueRows } from "../lib/dataQC.js"; // qcIssueRows: #1111
import { saveFile } from "../lib/desktop.js";
import { toExportCsv } from "../lib/tabular.js";
import { stampLines, withStamp } from "../lib/provenance.js";
import { normalizeDesurveyMethod } from "../lib/desurvey.js";
import { version as APP_VERSION } from "../../package.json";
import { useVirtualRows } from "../lib/useVirtualRows.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements

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

export default function DataQCModal({ onCancel }) {
  useEscapeKey(onCancel); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const { project, collars, survey, layers, boundaries, assays, terrain, setCollars } = useStore();
  // TASKS.csv #558 — collars vs the loaded terrain, with an adjustable threshold and an (undoable) snap
  const [terrainThreshold, setTerrainThreshold] = useState(15);
  // TASKS.csv #723 — the dogleg warning level (deg per 30 m), remembered on this computer: ordinary deviated
  // holes run 3-7 deg/30 m, so the fixed 3 left a permanent yellow list. Errors stay at 10 (or the warning, if higher).
  const [doglegWarn, setDoglegWarn] = useState(() => { try { return Number(localStorage.getItem("geostrix.qc.doglegWarn")) || 3; } catch { return 3; } });
  useEffect(() => { try { if (Number(doglegWarn) > 0) localStorage.setItem("geostrix.qc.doglegWarn", String(doglegWarn)); } catch { /* storage unavailable */ } }, [doglegWarn]);
  const warnDeg = Number(doglegWarn) > 0 ? Number(doglegWarn) : 3;
  const qcArgs = () => ({ project, collars, survey, layers, boundaries, assays, terrain, terrainThreshold: Number(terrainThreshold) > 0 ? Number(terrainThreshold) : 15, doglegWarn: warnDeg, doglegError: Math.max(10, warnDeg) });
  const ranWith = useRef(null); // TASKS.csv #1269 — the thresholds of the run on screen: the export's stamp must describe its issues, not the boxes
  const runQC = () => { ranWith.current = { warnDeg, terrainThreshold: Number(terrainThreshold) > 0 ? Number(terrainThreshold) : 15 }; return runDataQC(qcArgs()); };
  const [result, setResult] = useState(runQC);
  const terrainOff = useMemo(() => (terrain ? collarTerrainOffsets(collars, terrain).filter((o) => Math.abs(o.dz) > (Number(terrainThreshold) > 0 ? Number(terrainThreshold) : 15)) : []), [collars, terrain, terrainThreshold]);
  const snapToTerrain = () => {
    if (!terrainOff.length) return;
    if (!window.confirm(tr("Set the elevation of {terrainOff} collar(s) to the terrain \"{v}\" (worst: {hole_id}, {v2}{dz} m)?\n\nEach keeps its old elevation in \"z_before_snap\". Ctrl+Z undoes it.", { terrainOff: terrainOff.length, v: terrain.name || "DEM", hole_id: terrainOff[0].hole_id, v2: terrainOff[0].dz > 0 ? "+" : "", dz: terrainOff[0].dz.toFixed(1) }))) return;
    const byId = new Map(terrainOff.map((o) => [o.hole_id, o]));
    setCollars((prev) => prev.map((c) => (byId.has(c.hole_id) ? { ...c, z_before_snap: c.z, z: Math.round(byId.get(c.hole_id).dem * 100) / 100, z_source: `terrain: ${terrain.name || "DEM"}` } : c)));
    rerunAfterSnap.current = true; // re-run once the new collars are in (an immediate re-run saw the old ones)
  };
  const rerunAfterSnap = useRef(false);
  useEffect(() => { if (rerunAfterSnap.current) { rerunAfterSnap.current = false; setResult(runQC()); } }, [collars]);
  const [filter, setFilter] = useState(new Set(["error", "warning", "info"]));
  const [categoryFilter, setCategoryFilter] = useState("all");

  const categories = useMemo(() => Array.from(result.byCategory.keys()).sort(), [result]);
  const shown = useMemo(() => result.issues.filter((i) => filter.has(i.severity) && (categoryFilter === "all" || i.category === categoryFilter)), [result, filter, categoryFilter]);

  // TASKS.csv #1111 — every issue (not just the filtered view) as a CSV, stamped with the project, CRS, desurvey method,
  // the thresholds used and the counts
  const exportIssues = () => {
    const stamp = stampLines({ tool: "Drillhole data QA/QC", version: APP_VERSION, epsg: project?.epsg, params: [
      `Project: ${project?.name || "untitled"} | desurvey: ${normalizeDesurveyMethod(project?.desurveyMethod)}`,
      `Holes: ${collars.length} collars, ${survey.length} survey stations | dogleg warning ${ranWith.current.warnDeg} deg / 30 m, error ${Math.max(10, ranWith.current.warnDeg)}${terrain ? ` | collar vs terrain threshold ${ranWith.current.terrainThreshold} m` : ""}`,
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
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onCancel} />
        </div>

        <div style={{ padding: "16px 16px 0", flexShrink: 0 }}>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 12, lineHeight: 1.5 }}>{tr("Checks collar coordinates, survey trajectories, assay results, and every logged interval/point layer for the kinds of problems that quietly distort a modelled surface — before you get as far as modelling. Doesn't fix anything automatically; re-import or hand-correct the source data and re-run.")}</div>

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {(["error", "warning", "info"]).map((sev) => {
              const meta = SEVERITY_META[sev];
              const Icon = meta.icon;
              const active = filter.has(sev);
              return (
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} key={sev} onClick={() => toggleSeverity(sev)}
                  style={{ flex: 1, cursor: "pointer", padding: "9px 10px", borderRadius: 7, background: active ? "var(--color-bg-subtle)" : "var(--color-bg)", border: `1px solid ${active ? meta.color : "var(--color-border)"}`, opacity: active ? 1 : 0.5, textAlign: "center" }}>
                  <Icon size={14} color={meta.color} style={{ marginBottom: 3 }} />
                  <div style={{ fontSize: "var(--font-size-xl)", color: "var(--color-text)", fontWeight: 600 }}>{result.summary[sev] || 0}</div>
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
        </div>

        {result.issues.length === 0 ? (
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
                <div key={startIndex + i} style={{ display: "flex", gap: 8, padding: "7px 8px", borderBottom: "1px solid var(--color-border-subtle)", height: ISSUE_ROW_H, boxSizing: "border-box" }}>
                  <Icon size={14} color={meta.color} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{issue.message}</div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 1 }}>{issue.category}{issue.holeId ? ` — ${issue.holeId}` : ""}</div>
                  </div>
                </div>
              );
            })}
            <div style={{ height: bottomPad }} />
          </div>
        )}

        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "flex-end" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginRight: 8 }} title={tr("Survey bends sharper than this are warned about. Ordinary deviated holes bend 3-7° per 30 m; bends of 10° per 30 m or more are always errors. Remembered on this computer.")}>{tr("Dogleg over")}<input type="number" min="0.5" step="0.5" value={doglegWarn} onChange={(e) => setDoglegWarn(e.target.value)} style={{ width: 54, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "2px 4px", color: "var(--color-text)", fontFamily: "inherit" }} aria-label={tr("Dogleg warning threshold (degrees per 30 m)")} /> °/30 m
          </span>
          {terrain && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginRight: 8 }} title={tr("Collars further than this from the loaded terrain are flagged (an auto-fetched terrain: ~15 m or more; LiDAR: a few metres){v}", { v: terrain.source?.nodeM ? tr(". This terrain's nodes are ~{v} m apart.", { v: Math.round(terrain.source.nodeM) }) : "" })}>{tr("Collar vs terrain over")}<input type="number" min="0.5" step="0.5" value={terrainThreshold} onChange={(e) => setTerrainThreshold(e.target.value)} style={{ width: 54, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "2px 4px", color: "var(--color-text)", fontFamily: "inherit" }} aria-label={tr("Collar vs terrain threshold (m)")} /> m
              {terrainOff.length > 0 && <button onClick={snapToTerrain} style={rerunBtn} title={tr("Set those collars' elevation to the terrain (undoable; the old value is kept)")}>{tr("Snap {n} to terrain", { n: terrainOff.length })}</button>}
            </span>
          )}
          <button onClick={exportIssues} disabled={!result.issues.length} style={{ ...rerunBtn, marginRight: 8, opacity: result.issues.length ? 1 : 0.5 }} title={tr("Save every issue (severity, category, hole, message) as a CSV, with the project, CRS, desurvey method and thresholds in its header")}>
            <Download size={14} />{" "}{tr("Export CSV")}</button>
          <button onClick={() => setResult(runQC())} style={rerunBtn}>
            <RefreshCw size={14} />{" "}{tr("Re-run")}</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(640px, 92vw)", maxHeight: "88vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "7px 9px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const rerunBtn = { display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: "var(--font-size-base)", cursor: "pointer" };
