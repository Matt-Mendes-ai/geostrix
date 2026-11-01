// TASKS.csv #138 — Micromine-specialist audit finding: "GeoStrix's export story is CSV/PNG/SVG/PDF
// per-tool; there's no consolidated project-level report generator" (unlike Micromine's own report
// writer, which spits out a standard tabular hole-summary/intercept table directly). Scoped to a
// single consolidated CSV rather than real .xlsx/.docx output — this app has no spreadsheet/document
// library dependency today (grep of package.json confirms it), and adding one just for this report
// would be a real new dependency for a feature every other export in the app already handles via
// plain CSV. Sections are stacked in one file with a blank row + a "=== NAME ===" header row between
// them, the same lightweight technique any CSV-based multi-table export uses — not as polished as
// real Excel sheets, but zero new dependencies and consistent with every other export in this app.
const gradeText = (v) => (Number.isFinite(v) ? (v !== 0 && Math.abs(v) < 0.01 ? String(Number(v.toPrecision(3))) : v.toFixed(3)) : "—"); // TASKS.csv #1213, as Grade statistics
import React, { useMemo } from "react";
import { X, Download, FileBarChart2 } from "./icons.js";
import { saveFile } from "../lib/desktop.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { LAYER_META } from "../lib/layers.js";
import { valueIn } from "../lib/geochem.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
import { excludeQAQC } from "../lib/qaqc.js"; // TASKS.csv #405
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { projectReportRows } from "../lib/analysisExports.js"; // TASKS.csv #1083

// TASKS.csv #405 — `weighted` (drillhole assays): the mean is length-weighted (interval to - from), the
// same basis as Grade Statistics (#267); an unweighted mean over 0.3 m and 3 m intervals is biased toward
// the short, usually mineralised, samples. Intervals without a usable length are left out of the mean
// and counted. Surface samples have no length, so their mean stays a plain average (and says so).
function elementStats(rows, elements, weighted = false) {
  const unitOf = Object.fromEntries(elements.map((e) => [e.symbol, e.unit]));
  return elements.map((e) => {
    const pairs = rows.map((r) => ({ v: valueIn(r, e.symbol, unitOf[e.symbol] || "ppm", unitOf), w: weighted ? Number(r.to) - Number(r.from) : 1 })).filter((p) => p.v != null);
    const unit = unitOf[e.symbol] || "ppm";
    if (!pairs.length) return { symbol: e.symbol, unit, n: 0, metres: "", mean: "", min: "", max: "", noLength: 0 };
    const usable = pairs.filter((p) => Number.isFinite(p.w) && p.w > 0);
    const W = usable.reduce((s, p) => s + p.w, 0);
    const mean = W > 0 ? usable.reduce((s, p) => s + p.w * p.v, 0) / W : null;
    const vals = pairs.map((p) => p.v);
    return { symbol: e.symbol, unit, n: pairs.length, metres: weighted ? W.toFixed(1) : "", mean: mean == null ? "" : gradeText(mean), min: gradeText(arrMin(vals)), max: gradeText(arrMax(vals)), noLength: pairs.length - usable.length };
  });
}

export default function ProjectReportModal({ store, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap(); // TASKS.csv #238
  const { project, collars, survey, layers, assays, assayElements, surfaceSamples, surfaceElements } = store;

  const report = useMemo(() => {
    const surveyByHole = new Map();
    survey.forEach((s) => { if (!surveyByHole.has(s.hole_id)) surveyByHole.set(s.hole_id, []); surveyByHole.get(s.hole_id).push(s); });
    // TASKS.csv #405/#339 — end of hole = the deeper of the collar length and the last survey station.
    const totalMetres = collars.reduce((sum, c) => {
      const hs = surveyByHole.get(c.hole_id);
      const surveyMax = hs?.length ? arrMax(hs.map((s) => s.depth).filter(Number.isFinite)) : -Infinity;
      const maxDepth = Math.max(Number.isFinite(c.length) ? c.length : 0, surveyMax);
      return sum + (Number.isFinite(maxDepth) ? maxDepth : 0);
    }, 0);

    const layerCounts = Object.keys(LAYER_META)
      .filter((k) => k !== "geophys_pts" && (layers[k]?.length || 0) > 0)
      .map((k) => ({ key: k, label: LAYER_META[k].label, count: layers[k].length }));

    // TASKS.csv #405 — QAQC inserts (standards, blanks, duplicates) are not samples of the ground (#219).
    const realAssays = excludeQAQC(assays);
    const qaqcExcluded = assays.length - realAssays.length;
    const assayStats = assayElements.length ? elementStats(realAssays, assayElements, true) : [];
    const surfaceStats = surfaceElements.length ? elementStats(surfaceSamples, surfaceElements) : [];
    const mediumCounts = {};
    surfaceSamples.forEach((s) => { mediumCounts[s.medium] = (mediumCounts[s.medium] || 0) + 1; });

    return { totalMetres, layerCounts, assayStats, surfaceStats, mediumCounts, qaqcExcluded };
  }, [collars, survey, layers, assays, assayElements, surfaceSamples, surfaceElements]);

  const exportCSV = () => {
    const rows = projectReportRows({ project, collars, surfaceSampleCount: surfaceSamples.length, report, generated: new Date().toISOString().slice(0, 19).replace("T", " ") }); // #1083 — in lib, tested

    const csv = toExportCsv(rows);
    saveFile({ suggestedName: `${(project.name || "project").replace(/[^\w\- ]/g, "")}_report.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: csv });
  };

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileBarChart2 size={18} style={{ color: "var(--color-accent-dark)" }} />
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Project report")}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            <StatCard label={tr("Drillholes")} value={collars.length} />
            <StatCard label={tr("Total metres")} value={report.totalMetres.toFixed(0)} />
            <StatCard label={tr("Surface samples")} value={surfaceSamples.length} />
            <StatCard label={tr("Layers with data")} value={report.layerCounts.length} />
          </div>

          {report.assayStats.length > 0 && (
            <div>
              <div style={label}>{tr("Assay statistics")}</div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginBottom: 6 }}>{tr("Length-weighted mean; QAQC inserts excluded{v}; all domains combined, not composited or capped.", { v: report.qaqcExcluded ? ` (${report.qaqcExcluded} rows)` : "" })}</div>
              <MiniTable rows={report.assayStats} />
            </div>
          )}

          {report.surfaceStats.length > 0 && (
            <div>
              <div style={label}>{tr("Surface sample statistics (unweighted mean)")}</div>
              <MiniTable rows={report.surfaceStats} />
            </div>
          )}

          {!collars.length && !surfaceSamples.length && (
            <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("Import drillholes or surface samples to generate a report.")}</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>{tr("Close")}</button>
          <button onClick={exportCSV} style={{ ...btn(true), flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} disabled={!collars.length && !surfaceSamples.length}>
            <Download size={14} />{" "}{tr("Export report (CSV)")}</button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label: l, value }) {
  return (
    <div style={{ background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: "var(--font-size-xl)", color: "var(--color-text)", fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{l}</div>
    </div>
  );
}

function MiniTable({ rows }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: 6 }}>
      <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>{tr("Element")}</th><th style={th}>{tr("Unit")}</th><th style={th}>n</th><th style={th}>{tr("Mean")}</th><th style={th}>{tr("Min")}</th><th style={th}>{tr("Max")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol}>
              <td style={td}>{r.symbol}</td><td style={td}>{r.unit}</td><td style={td}>{r.n}</td><td style={td}>{r.mean}</td><td style={td}>{r.min}</td><td style={td}>{r.max}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const panel = { width: "min(560px, 92vw)", maxHeight: "86vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 };
const th = { padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "right", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "4px 8px", color: "var(--color-text)", textAlign: "right" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });
