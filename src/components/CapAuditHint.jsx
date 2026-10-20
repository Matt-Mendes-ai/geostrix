// TASKS.csv #533 — under a high-grade cap box: one-click P97.5 / P99 caps (length-weighted, on the same raw samples the
// cap is applied to — QC inserts already excluded by the caller) and the audit a reviewer needs to judge the cap:
// how many samples it cuts and what share of the metal it removes.
import React, { useMemo } from "react";
import { capAudit, capAuditText, lengthWeightedPercentile } from "../lib/geochem.js";

const fmt = (v) => (v == null ? "—" : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3));

export default function CapAuditHint({ assays, symbol, unit, elementUnits, capValue, onSetCap, unitLabel }) {
  const pcts = useMemo(() => (symbol ? { p975: lengthWeightedPercentile(assays, symbol, unit, elementUnits, 97.5), p99: lengthWeightedPercentile(assays, symbol, unit, elementUnits, 99) } : null), [assays, symbol, unit, elementUnits]);
  const audit = useMemo(() => (symbol && capValue != null && capValue > 0 ? capAudit(assays, symbol, unit, elementUnits, capValue) : null), [assays, symbol, unit, elementUnits, capValue]);
  if (!pcts) return null;
  const btn = { background: "none", border: "1px solid var(--color-border)", borderRadius: 4, padding: "1px 6px", cursor: "pointer", fontSize: "var(--font-size-sm)", color: "var(--color-text)", fontFamily: "inherit" };
  return (
    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span title="Length-weighted: a 10 m sample counts ten times a 1 m sample">Cap at the length-weighted</span>
        <button type="button" style={btn} disabled={pcts.p975 == null} onClick={() => onSetCap(pcts.p975)}>P97.5 = {fmt(pcts.p975)}</button>
        <button type="button" style={btn} disabled={pcts.p99 == null} onClick={() => onSetCap(pcts.p99)}>P99 = {fmt(pcts.p99)}</button>
        <span style={{ color: "var(--color-text-muted)" }}>{unitLabel || unit}</span>
      </div>
      {audit && (
        <div role="status" style={{ color: audit.pctMetalRemoved > 20 ? "var(--color-warn-text-strong)" : "var(--color-text-secondary)" }}>
          {capAuditText(audit, unitLabel || unit)}.{audit.pctMetalRemoved > 20 ? " That is a lot of metal for a cap to remove — check the cap against the grade distribution and the geology." : ""}
        </div>
      )}
    </div>
  );
}
