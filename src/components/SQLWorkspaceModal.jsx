import React, { useEffect, useMemo, useState } from "react";
import { X, Play, Download, Database } from "./icons.js";
import { saveFile } from "../lib/desktop.js";
import { buildWorkspaceDatabase, runQuery } from "../lib/sqlWorkspace.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { sqlCellText } from "../lib/sqlTables.js"; // TASKS.csv #2521
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { sqlResultRows } from "../lib/tableExports.js"; // TASKS.csv #1083
import { defaultQueryFor, sqlColumnLabel } from "../lib/sqlDefaults.js"; // TASKS.csv #2034 / #2360 / #2204
import { leadFor } from "../lib/useLeadCommodity.js"; // TASKS.csv #2360

// TASKS.csv #50 — ad hoc SQL against whatever's currently loaded (collars/survey/assays/layers/
// boundaries), no Postgres connection needed. sqlWorkspace.js builds the in-memory database and runs
// queries; this is just the editor/results UI, same modal chrome as GradeStatistics.jsx/QAQCPanel.jsx.
// TASKS.csv #2034 / #2360 — the opening query is built in lib/sqlDefaults.js: the lead element, highest first, from / to quoted

export default function SQLWorkspaceModal({ collars, survey, layers, assays, assayElements, boundaries, surfaceSamples = [], surfaceElements = [], customLayers = [], onClose }) { // surface*: TASKS.csv #1799; customLayers: #1516
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const [state, setState] = useState({ status: "loading" }); // loading | ready | error
  const [progress, setProgress] = useState(null); // #1516 — { table, done, total } between chunks of a big table
  const [sql, setSql] = useState("");
  const [result, setResult] = useState(null); // { columns, rows } | null
  const [queryError, setQueryError] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    buildWorkspaceDatabase({ collars, survey, layers, assays, assayElements, boundaries, surfaceSamples, surfaceElements, customLayers }, (p) => { if (!cancelled) setProgress(p); }) // #1516
      .then(({ db, tables }) => {
        if (cancelled) return;
        setState({ status: "ready", db, tables });
        setSql(defaultQueryFor(tables, leadFor(assays, assayElements))); // #2360 — the project's lead commodity
      })
      .catch((err) => { if (!cancelled) setState({ status: "error", message: err.message }); });
    return () => { cancelled = true; };
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
    // #1083 — positional: keyed by name, two columns of the same name (a.hole_id, b.hole_id) kept only one
    saveFile({ suggestedName: "sql_query_result.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(sqlResultRows(result.columns, result.rows)) });
  };

  const emptyLoaded = useMemo(() => !collars.length && !assays.length && !surfaceSamples.length && !Object.values(layers || {}).some((r) => r?.length) && !customLayers.some((l) => l.rows?.length), [collars, survey, layers, assays, surfaceSamples, customLayers]);

  return (
    <div style={overlay}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("SQL workspace")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Ad hoc SQL against whatever's currently loaded — a snapshot taken when this opened, not a live connection.")}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
          <div style={{ width: 200, flexShrink: 0, overflow: "auto" }}>
            <div style={label}><Database size={12} style={{ marginRight: 4, verticalAlign: -1 }} />{tr("Tables")}</div>
            {state.status === "loading" && <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{progress ? tr("Building… {table}: {done} of {total} rows", { table: progress.table, done: progress.done.toLocaleString(), total: progress.total.toLocaleString() }) : tr("Building…")}</div>}
            {state.status === "ready" && state.tables.length === 0 && <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-muted)" }}>{tr("Nothing loaded yet — import collars/assays/layers first.")}</div>}
            {state.status === "ready" && state.tables.map((t) => (
              <div key={t.name} style={{ marginBottom: 8, fontSize: "var(--font-size-sm)" }}>
                <div style={{ fontWeight: 600, color: "var(--color-text)" }}>{t.name}</div>
                <div style={{ color: "var(--color-text-muted)", lineHeight: 1.5 }}>{t.columns.map(sqlColumnLabel).join(", ")}</div>{/* #2204 — as a query must write them */}
              </div>
            ))}
            {state.status === "ready" && state.tables.some((t) => t.columns.some((c) => sqlColumnLabel(c) !== c)) && (
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{tr("Columns shown in double quotes (\"from\", \"to\") are SQL words or unusual names: write them with the quotes, e.g. SUM(\"to\" - \"from\") for the metres sampled.")}</div>
            )}
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            {state.status === "error" && (
              <div style={{ padding: "8px 10px", background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-danger-text)" }}>{tr("Couldn't set up the SQL engine: {message}", { message: state.message })}</div>
            )}
            {emptyLoaded && state.status === "ready" && (
              <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-muted)" }}>{tr("No data loaded yet — import collars, assays, or a layer first, then reopen this workspace.")}</div>
            )}
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              placeholder={tr("SELECT * FROM assays WHERE Au > 1;")}
              spellCheck={false}
              style={{ width: "100%", height: 100, fontFamily: "monospace", fontSize: "var(--font-size-base)", padding: 10, border: "1px solid var(--color-border)", borderRadius: 6, resize: "vertical", color: "var(--color-text)" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={run} disabled={state.status !== "ready" || running} style={{ ...btn(true), display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", opacity: state.status === "ready" && !running ? 1 : 0.5, cursor: state.status === "ready" && !running ? "pointer" : "not-allowed" }}>
                <Play size={14} /> {running ? tr("Running…") : tr("Run query")}
              </button>
              {result && result.rows.length > 0 && (
                <button onClick={exportCSV} style={{ ...btn(false), display: "flex", alignItems: "center", gap: 6, padding: "7px 14px" }}>
                  <Download size={14} />{" "}{tr("Export CSV")}</button>
              )}
            </div>
            {queryError && (
              <div style={{ padding: "8px 10px", background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-danger-text)" }}>{queryError}</div>
            )}
            {result && (
              <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginBottom: 4 }}>{result.rows.length}{" "}{tr(result.rows.length === 1 ? "row" : "rows")}</div>
                {result.rows.length > 0 && (
                  <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
                    <thead><tr>{result.columns.map((c) => <th key={c} style={th}>{c}</th>)}</tr></thead>
                    <tbody>
                      {result.rows.slice(0, 500).map((row, i) => (
                        <tr key={i}>{row.map((v, j) => <td key={j} style={td}>{v === null ? "—" : sqlCellText(v)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {result.rows.length > 500 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 4 }}>{tr("Showing the first 500 of {rows} rows — export to CSV for the full result.", { rows: result.rows.length })}</div>}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>{tr("Close")}</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(1000px, 96vw)", height: "min(720px, 92vh)", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });
const th = { padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "start", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, background: "var(--color-bg)" };
const td = { padding: "4px 8px", color: "var(--color-text)", textAlign: "start", fontFamily: "'Exo 2', system-ui, sans-serif", whiteSpace: "nowrap" };
