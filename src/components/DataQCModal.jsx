import React, { useMemo, useState } from "react";
import { X, ShieldAlert, AlertTriangle, Info, RefreshCw } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { runDataQC } from "../lib/dataQC.js";
import { useVirtualRows } from "../lib/useVirtualRows.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { overlay } from "../lib/modalStyles.js";

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
  error: { icon: ShieldAlert, color: "#e0716a", label: "Error" },
  warning: { icon: AlertTriangle, color: "#e2a63c", label: "Warning" },
  info: { icon: Info, color: "#6fa8dc", label: "Info" },
};

export default function DataQCModal({ onCancel }) {
  useEscapeKey(onCancel); // TASKS.csv #238
  const { project, collars, survey, layers, boundaries, assays } = useStore();
  const [result, setResult] = useState(() => runDataQC({ project, collars, survey, layers, boundaries, assays }));
  const [filter, setFilter] = useState(new Set(["error", "warning", "info"]));
  const [categoryFilter, setCategoryFilter] = useState("all");

  const categories = useMemo(() => Array.from(result.byCategory.keys()).sort(), [result]);
  const shown = useMemo(() => result.issues.filter((i) => filter.has(i.severity) && (categoryFilter === "all" || i.category === categoryFilter)), [result, filter, categoryFilter]);

  const toggleSeverity = (sev) => setFilter((p) => { const n = new Set(p); if (n.has(sev)) n.delete(sev); else n.add(sev); return n; });
  const { scrollRef, onScroll, startIndex, endIndex, topPad, bottomPad } = useVirtualRows(shown.length, ISSUE_ROW_H);

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldAlert size={16} color="#55606e" />
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Drillhole data QA/QC</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onCancel} />
        </div>

        <div style={{ padding: "16px 16px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "#55606e", marginBottom: 12, lineHeight: 1.5 }}>
            Checks collar coordinates, survey trajectories, assay results, and every logged interval/point layer for
            the kinds of problems that quietly distort a modelled surface — before you get as far as
            modelling. Doesn't fix anything automatically; re-import or hand-correct the source data
            and re-run.
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {(["error", "warning", "info"]).map((sev) => {
              const meta = SEVERITY_META[sev];
              const Icon = meta.icon;
              const active = filter.has(sev);
              return (
                <div key={sev} onClick={() => toggleSeverity(sev)}
                  style={{ flex: 1, cursor: "pointer", padding: "9px 10px", borderRadius: 7, background: active ? "#f4f5f7" : "#ffffff", border: `1px solid ${active ? meta.color : "#d9dce1"}`, opacity: active ? 1 : 0.5, textAlign: "center" }}>
                  <Icon size={15} color={meta.color} style={{ marginBottom: 3 }} />
                  <div style={{ fontSize: 17, color: "#1a2028", fontWeight: 600 }}>{result.summary[sev] || 0}</div>
                  <div style={{ fontSize: 9.5, color: "#55606e", textTransform: "uppercase", letterSpacing: "0.06em" }}>{meta.label}{result.summary[sev] === 1 ? "" : "s"}</div>
                </div>
              );
            })}
          </div>

          {categories.length > 0 && (
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ ...sel, width: "100%", marginBottom: 10 }}>
              <option value="all">All categories ({result.issues.length})</option>
              {categories.map((c) => <option key={c} value={c}>{c} ({result.byCategory.get(c).length})</option>)}
            </select>
          )}
        </div>

        {result.issues.length === 0 ? (
          <div style={{ padding: "20px 10px", textAlign: "center", color: "#7fd9c9", fontSize: 12.5 }}>No issues found — collars, survey, and every layer look internally consistent.</div>
        ) : shown.length === 0 ? (
          <div style={{ padding: "16px 10px", textAlign: "center", color: "#94a1b0", fontSize: 12 }}>No issues match the current filters.</div>
        ) : (
          <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px" }}>
            <div style={{ height: topPad }} />
            {shown.slice(startIndex, endIndex).map((issue, i) => {
              const meta = SEVERITY_META[issue.severity];
              const Icon = meta.icon;
              return (
                <div key={startIndex + i} style={{ display: "flex", gap: 8, padding: "7px 8px", borderBottom: "1px solid #e6e8eb", height: ISSUE_ROW_H, boxSizing: "border-box" }}>
                  <Icon size={13} color={meta.color} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: "#1a2028", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{issue.message}</div>
                    <div style={{ fontSize: 9.5, color: "#94a1b0", marginTop: 1 }}>{issue.category}{issue.holeId ? ` — ${issue.holeId}` : ""}</div>
                  </div>
                </div>
              );
            })}
            <div style={{ height: bottomPad }} />
          </div>
        )}

        <div style={{ padding: "10px 16px", borderTop: "1px solid #d9dce1", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setResult(runDataQC({ project, collars, survey, layers, boundaries, assays }))} style={rerunBtn}>
            <RefreshCw size={13} /> Re-run
          </button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(640px, 92vw)", maxHeight: "88vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const sel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "7px 9px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" };
const rerunBtn = { display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, color: "#1a2028", fontSize: 12, cursor: "pointer" };
