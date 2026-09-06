import React, { useEffect, useMemo, useState } from "react";
import { X, Play, Download, Database } from "lucide-react";
import Papa from "papaparse";
import { saveFile } from "../lib/desktop.js";
import { buildWorkspaceDatabase, runQuery } from "../lib/sqlWorkspace.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";

// TASKS.csv #50 — ad hoc SQL against whatever's currently loaded (collars/survey/assays/layers/
// boundaries), no Postgres connection needed. sqlWorkspace.js builds the in-memory database and runs
// queries; this is just the editor/results UI, same modal chrome as GradeStatistics.jsx/QAQCPanel.jsx.
function defaultQueryFor(tables) {
  const assaysTable = tables.find((t) => t.name === "assays");
  if (assaysTable) {
    const numericCol = assaysTable.columns.find((c) => !["hole_id", "from", "to", "source"].includes(c));
    if (numericCol) return `SELECT * FROM assays WHERE "${numericCol}" > 1 ORDER BY "${numericCol}" DESC LIMIT 100;`;
  }
  if (tables.some((t) => t.name === "collars")) return "SELECT * FROM collars LIMIT 100;";
  return tables.length ? `SELECT * FROM "${tables[0].name}" LIMIT 100;` : "";
}

export default function SQLWorkspaceModal({ collars, survey, layers, assays, assayElements, boundaries, onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const [state, setState] = useState({ status: "loading" }); // loading | ready | error
  const [sql, setSql] = useState("");
  const [result, setResult] = useState(null); // { columns, rows } | null
  const [queryError, setQueryError] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    buildWorkspaceDatabase({ collars, survey, layers, assays, assayElements, boundaries })
      .then(({ db, tables }) => {
        if (cancelled) return;
        setState({ status: "ready", db, tables });
        setSql(defaultQueryFor(tables));
      })
      .catch((err) => { if (!cancelled) setState({ status: "error", message: err.message }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = () => {
    if (state.status !== "ready" || !sql.trim()) return;
    setRunning(true);
    setQueryError(null);
    try {
      setResult(runQuery(state.db, sql));
    } catch (err) {
      setQueryError(err.message);
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const exportCSV = () => {
    if (!result || !result.rows.length) return;
    const rowsOut = result.rows.map((row) => Object.fromEntries(result.columns.map((c, i) => [c, row[i]])));
    saveFile({ suggestedName: "sql_query_result.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: Papa.unparse(rowsOut) });
  };

  const emptyLoaded = useMemo(() => !collars.length && !assays.length && !Object.values(layers || {}).some((r) => r?.length), [collars, survey, layers, assays]);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>SQL workspace</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>Ad hoc SQL against whatever's currently loaded — a snapshot taken when this opened, not a live connection.</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
          <div style={{ width: 200, flexShrink: 0, overflow: "auto" }}>
            <div style={label}><Database size={12} style={{ marginRight: 4, verticalAlign: -1 }} />Tables</div>
            {state.status === "loading" && <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>Building…</div>}
            {state.status === "ready" && state.tables.length === 0 && <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-muted)" }}>Nothing loaded yet — import collars/assays/layers first.</div>}
            {state.status === "ready" && state.tables.map((t) => (
              <div key={t.name} style={{ marginBottom: 8, fontSize: "var(--font-size-sm)" }}>
                <div style={{ fontWeight: 600, color: "var(--color-text)" }}>{t.name}</div>
                <div style={{ color: "var(--color-text-muted)", lineHeight: 1.5 }}>{t.columns.join(", ")}</div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            {state.status === "error" && (
              <div style={{ padding: "8px 10px", background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-danger-text)" }}>Couldn't set up the SQL engine: {state.message}</div>
            )}
            {emptyLoaded && state.status === "ready" && (
              <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-muted)" }}>No data loaded yet — import collars, assays, or a layer first, then reopen this workspace.</div>
            )}
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              placeholder="SELECT * FROM assays WHERE Au > 1;"
              spellCheck={false}
              style={{ width: "100%", height: 100, fontFamily: "monospace", fontSize: "var(--font-size-base)", padding: 10, border: "1px solid var(--color-border)", borderRadius: 6, resize: "vertical", color: "var(--color-text)" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={run} disabled={state.status !== "ready" || running} style={{ ...btn(true), display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", opacity: state.status === "ready" && !running ? 1 : 0.5, cursor: state.status === "ready" && !running ? "pointer" : "not-allowed" }}>
                <Play size={14} /> {running ? "Running…" : "Run query"}
              </button>
              {result && result.rows.length > 0 && (
                <button onClick={exportCSV} style={{ ...btn(false), display: "flex", alignItems: "center", gap: 6, padding: "7px 14px" }}>
                  <Download size={14} /> Export CSV
                </button>
              )}
            </div>
            {queryError && (
              <div style={{ padding: "8px 10px", background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-danger-text)" }}>{queryError}</div>
            )}
            {result && (
              <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginBottom: 4 }}>{result.rows.length} row{result.rows.length === 1 ? "" : "s"}</div>
                {result.rows.length > 0 && (
                  <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
                    <thead><tr>{result.columns.map((c) => <th key={c} style={th}>{c}</th>)}</tr></thead>
                    <tbody>
                      {result.rows.slice(0, 500).map((row, i) => (
                        <tr key={i}>{row.map((v, j) => <td key={j} style={td}>{v === null ? "—" : String(v)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {result.rows.length > 500 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 4 }}>Showing the first 500 of {result.rows.length} rows — export to CSV for the full result.</div>}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(1000px, 96vw)", height: "min(720px, 92vh)", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });
const th = { padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "left", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, background: "var(--color-bg)" };
const td = { padding: "4px 8px", color: "var(--color-text)", textAlign: "left", fontFamily: "'Exo 2', system-ui, sans-serif", whiteSpace: "nowrap" };
