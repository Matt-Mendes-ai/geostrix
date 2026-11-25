// TASKS.csv #282 — the warn-before-you-pull confirmation of useTablePull (#921: shared by the Browser panel and the
// Connect to database dialog). Nothing has been fetched beyond the COUNT(*), so cancelling here costs nothing.
import React from "react";
import { AlertTriangle } from "./icons.js";
import { ROW_WARN_THRESHOLD } from "../lib/useTablePull.js";
import { t as tr } from "../lib/i18n.js";

export default function TablePullConfirm({ pending, onFirst, onAll, onCancel }) {
  if (!pending) return null;
  return (
    <div style={{ marginBottom: 6, padding: "7px 8px", background: "#fdf6e6", border: "1px solid #e2c98a", borderRadius: 5, color: "#6b5a2a", lineHeight: 1.45 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600, marginBottom: 3 }}>
        <AlertTriangle size={12} /> {tr("{total} rows", { total: pending.total.toLocaleString() })}</div>
      <div style={{ marginBottom: 6 }}>
        {tr("{table_schema}.{table_name} is large. Loading all of it pulls every row into memory at once and can take a while on a modest machine.", { table_schema: pending.t.table_schema, table_name: pending.t.table_name })}</div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <button className="gs-btn gs-btn--sm" onClick={onFirst}>{tr("First {ROW_WARN_THRESHOLD}", { ROW_WARN_THRESHOLD: ROW_WARN_THRESHOLD.toLocaleString() })}</button>
        <button className="gs-btn gs-btn--primary gs-btn--sm" onClick={onAll}>{tr("Import all")}</button>
        <button className="gs-btn gs-btn--sm" onClick={onCancel}>{tr("Cancel")}</button>
      </div>
    </div>
  );
}

