// TASKS.csv #138 — Micromine-specialist audit finding: "GeoStrix's export story is CSV/PNG/SVG/PDF
// per-tool; there's no consolidated project-level report generator" (unlike Micromine's own report
// writer, which spits out a standard tabular hole-summary/intercept table directly). Scoped to a
// single consolidated CSV rather than real .xlsx/.docx output — this app has no spreadsheet/document
// library dependency today (grep of package.json confirms it), and adding one just for this report
// would be a real new dependency for a feature every other export in the app already handles via
// plain CSV. Sections are stacked in one file with a blank row + a "=== NAME ===" header row between
// them, the same lightweight technique any CSV-based multi-table export uses — not as polished as
// real Excel sheets, but zero new dependencies and consistent with every other export in this app.
import React, { useMemo } from "react";
import { X, Download, FileBarChart2 } from "lucide-react";
import Papa from "papaparse";
import { saveFile } from "../lib/desktop.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { LAYER_META } from "../lib/layers.js";
import { valueIn } from "../lib/geochem.js";
import { overlay } from "../lib/modalStyles.js";

function elementStats(rows, elements) {
  const unitOf = Object.fromEntries(elements.map((e) => [e.symbol, e.unit]));
  return elements.map((e) => {
    const vals = rows.map((r) => valueIn(r, e.symbol, unitOf[e.symbol] || "ppm", unitOf)).filter((v) => v != null);
    if (!vals.length) return { symbol: e.symbol, unit: unitOf[e.symbol] || "ppm", n: 0, mean: "", min: "", max: "" };
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    return { symbol: e.symbol, unit: unitOf[e.symbol] || "ppm", n: vals.length, mean: mean.toFixed(3), min: Math.min(...vals).toFixed(3), max: Math.max(...vals).toFixed(3) };
  });
}

export default function ProjectReportModal({ store, onClose }) {
  useEscapeKey(onClose);
  const { project, collars, survey, layers, assays, assayElements, surfaceSamples, surfaceElements } = store;

  const report = useMemo(() => {
    const surveyByHole = new Map();
    survey.forEach((s) => { if (!surveyByHole.has(s.hole_id)) surveyByHole.set(s.hole_id, []); surveyByHole.get(s.hole_id).push(s); });
    const totalMetres = collars.reduce((sum, c) => {
      const hs = surveyByHole.get(c.hole_id);
      const maxDepth = hs?.length ? Math.max(...hs.map((s) => s.depth)) : (c.length || 0);
      return sum + (Number.isFinite(maxDepth) ? maxDepth : 0);
    }, 0);

    const layerCounts = Object.keys(LAYER_META)
      .filter((k) => k !== "geophys_pts" && (layers[k]?.length || 0) > 0)
      .map((k) => ({ key: k, label: LAYER_META[k].label, count: layers[k].length }));

    const assayStats = assayElements.length ? elementStats(assays, assayElements) : [];
    const surfaceStats = surfaceElements.length ? elementStats(surfaceSamples, surfaceElements) : [];
    const mediumCounts = {};
    surfaceSamples.forEach((s) => { mediumCounts[s.medium] = (mediumCounts[s.medium] || 0) + 1; });

    return { totalMetres, layerCounts, assayStats, surfaceStats, mediumCounts };
  }, [collars, survey, layers, assays, assayElements, surfaceSamples, surfaceElements]);

  const exportCSV = () => {
    const rows = [];
    rows.push(["=== PROJECT ==="]);
    rows.push(["Name", project.name || "Untitled project"]);
    rows.push(["EPSG", project.epsg ?? ""]);
    rows.push(["Generated", new Date().toISOString().slice(0, 19).replace("T", " ")]);
    rows.push(["Drillholes", collars.length]);
    rows.push(["Total metres drilled", report.totalMetres.toFixed(1)]);
    rows.push(["Surface samples", surfaceSamples.length]);
    rows.push([]);

    rows.push(["=== DRILLHOLES ==="]);
    rows.push(["hole_id", "x", "y", "z", "azimuth", "dip", "length"]);
    collars.forEach((c) => rows.push([c.hole_id, c.x, c.y, c.z, c.azimuth ?? "", c.dip ?? "", c.length ?? ""]));
    rows.push([]);

    if (report.layerCounts.length) {
      rows.push(["=== LAYER ROW COUNTS ==="]);
      rows.push(["Layer", "Rows"]);
      report.layerCounts.forEach((l) => rows.push([l.label, l.count]));
      rows.push([]);
    }

    if (report.assayStats.length) {
      rows.push(["=== ASSAY STATISTICS (all domains combined) ==="]);
      rows.push(["Element", "Unit", "n", "Mean", "Min", "Max"]);
      report.assayStats.forEach((s) => rows.push([s.symbol, s.unit, s.n, s.mean, s.min, s.max]));
      rows.push([]);
    }

    if (Object.keys(report.mediumCounts).length) {
      rows.push(["=== SURFACE SAMPLES BY MEDIUM ==="]);
      rows.push(["Medium", "Count"]);
      Object.entries(report.mediumCounts).forEach(([m, n]) => rows.push([m, n]));
      rows.push([]);
    }

    if (report.surfaceStats.length) {
      rows.push(["=== SURFACE SAMPLE STATISTICS (all media combined) ==="]);
      rows.push(["Element", "Unit", "n", "Mean", "Min", "Max"]);
      report.surfaceStats.forEach((s) => rows.push([s.symbol, s.unit, s.n, s.mean, s.min, s.max]));
    }

    const csv = Papa.unparse(rows);
    saveFile({ suggestedName: `${(project.name || "project").replace(/[^\w\- ]/g, "")}_report.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: csv });
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileBarChart2 size={17} style={{ color: "#8a6a1f" }} />
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Project report</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            <StatCard label="Drillholes" value={collars.length} />
            <StatCard label="Total metres" value={report.totalMetres.toFixed(0)} />
            <StatCard label="Surface samples" value={surfaceSamples.length} />
            <StatCard label="Layers with data" value={report.layerCounts.length} />
          </div>

          {report.assayStats.length > 0 && (
            <div>
              <div style={label}>Assay statistics</div>
              <MiniTable rows={report.assayStats} />
            </div>
          )}

          {report.surfaceStats.length > 0 && (
            <div>
              <div style={label}>Surface sample statistics</div>
              <MiniTable rows={report.surfaceStats} />
            </div>
          )}

          {!collars.length && !surfaceSamples.length && (
            <div style={{ fontSize: 12, color: "#55606e", padding: 8 }}>Import drillholes or surface samples to generate a report.</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Close</button>
          <button onClick={exportCSV} style={{ ...btn(true), flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} disabled={!collars.length && !surfaceSamples.length}>
            <Download size={13} /> Export report (CSV)
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label: l, value }) {
  return (
    <div style={{ background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 18, color: "#1a2028", fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "#94a1b0" }}>{l}</div>
    </div>
  );
}

function MiniTable({ rows }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid #d9dce1", borderRadius: 6 }}>
      <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>Element</th><th style={th}>Unit</th><th style={th}>n</th><th style={th}>Mean</th><th style={th}>Min</th><th style={th}>Max</th>
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

const panel = { width: "min(560px, 92vw)", maxHeight: "86vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const label = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0", marginBottom: 8 };
const th = { padding: "4px 8px", color: "#55606e", fontWeight: 500, textAlign: "right", borderBottom: "1px solid #d9dce1" };
const td = { padding: "4px 8px", color: "#1a2028", textAlign: "right" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
