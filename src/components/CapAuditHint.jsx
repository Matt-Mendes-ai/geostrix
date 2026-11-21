// TASKS.csv #533 — under a high-grade cap box: one-click P97.5 / P99 caps (length-weighted, on the same raw samples the
// cap is applied to — QC inserts already excluded by the caller) and the audit a reviewer needs to judge the cap:
// how many samples it cuts and what share of the metal it removes.
import React, { useMemo, useState } from "react";
import { mineralisedPercentiles } from "../lib/mineralisedPercentiles.js"; // TASKS.csv #3758
import { capAudit, capAuditText, lengthWeightedPercentile, resolvedSegments, valueLengthArrays } from "../lib/geochem.js";
import MetalAtRiskTable from "./MetalAtRiskTable.jsx"; // TASKS.csv #3746
import { capAboveZone, capWarningText, CAP_WARN_PCT } from "../lib/capWarning.js"; // TASKS.csv #1676
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

const fmt = (v) => (v == null ? "—" : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3));

export default function CapAuditHint({ assays, symbol, unit, elementUnits, capValue, onSetCap, unitLabel, toShown = (v) => v }) { // toShown: the stored -> display-unit conversion (#3475); capValue and the work stay stored
  const allPcts = useMemo(() => (symbol ? { p975: lengthWeightedPercentile(assays, symbol, unit, elementUnits, 97.5), p99: lengthWeightedPercentile(assays, symbol, unit, elementUnits, 99) } : null), [assays, symbol, unit, elementUnits]);
  const audit = useMemo(() => (symbol && capValue != null && capValue > 0 ? capAudit(assays, symbol, unit, elementUnits, capValue) : null), [assays, symbol, unit, elementUnits, capValue]);
  const warn = useMemo(() => (audit && audit.pctMetalRemoved > CAP_WARN_PCT ? capWarningText(audit.pctMetalRemoved, capAboveZone(resolvedSegments(assays, symbol, unit, elementUnits), audit.capValue)) : ""), [audit, assays, symbol, unit, elementUnits]); // #1676
  // TASKS.csv #3746 — the metal each one-click cap would remove, said on the button before it is clicked, and the metal-at-risk table of the top samples
  const arr = useMemo(() => (symbol ? valueLengthArrays(assays, symbol, unit, elementUnits) : null), [assays, symbol, unit, elementUnits]);
  // TASKS.csv #3758 — the percentiles over the mineralised samples (at or above where the grades split, read from the data), or over all samples
  const minPcts = useMemo(() => (arr ? mineralisedPercentiles(arr.values, arr.lengths) : null), [arr]);
  const [over, setOver] = useState("mineralised");
  const pcts = over === "mineralised" && minPcts ? minPcts : allPcts;
  const removes = (c) => (c != null && symbol ? capAudit(assays, symbol, unit, elementUnits, c).pctMetalRemoved : null);
  const r975 = useMemo(() => removes(pcts?.p975), [pcts, assays]); // the metal removed: over all the samples either way
  const r99 = useMemo(() => removes(pcts?.p99), [pcts, assays]);
  if (!pcts) return null;
  const btn = { background: "none", border: "1px solid var(--color-border)", borderRadius: 4, padding: "1px 6px", cursor: "pointer", fontSize: "var(--font-size-sm)", color: "var(--color-text)", fontFamily: "inherit" };
  return (
    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span title={tr("Length-weighted: a 10 m sample counts ten times a 1 m sample")}>{tr("Cap at the length-weighted")}</span>
        {minPcts && (
          <select value={over} onChange={(e) => setOver(e.target.value)} aria-label={tr("Percentiles of")} style={{ fontSize: "var(--font-size-sm)" }}
            title={tr("Mineralized samples are those at or above {cut} {unit}, where these grades split into a background and a higher group. Over all samples, a mostly barren column's percentiles can fall inside the ore.", { cut: fmt(toShown(minPcts.cut)), unit: unitLabel || unit })}>
            <option value="mineralised">{tr("of the {n} mineralised samples (≥ {cut})", { n: minPcts.n, cut: fmt(toShown(minPcts.cut)) })}</option>
            <option value="all">{tr("of all samples")}</option>
          </select>
        )}
        <button type="button" style={btn} disabled={pcts.p975 == null} onClick={() => onSetCap(pcts.p975)} title={r975 != null ? tr("This cap removes {pct} % of the metal (grade × length).", { pct: r975.toFixed(1) }) : undefined}>P97.5 = {fmt(toShown(pcts.p975))}{r975 != null ? ` (${tr("removes {pct} % of the metal", { pct: r975.toFixed(1) })})` : ""}</button>
        <button type="button" style={btn} disabled={pcts.p99 == null} onClick={() => onSetCap(pcts.p99)} title={r99 != null ? tr("This cap removes {pct} % of the metal (grade × length).", { pct: r99.toFixed(1) }) : undefined}>P99 = {fmt(toShown(pcts.p99))}{r99 != null ? ` (${tr("removes {pct} % of the metal", { pct: r99.toFixed(1) })})` : ""}</button>
        <span style={{ color: "var(--color-text-muted)" }}>{unitLabel || unit}</span>
      </div>
      {arr && arr.values.length > 1 && <MetalAtRiskTable values={arr.values} weights={arr.lengths} unitLabel={unitLabel || unit} toShown={toShown} onSetCap={onSetCap} />}
      {audit && (
        <div role="status" style={{ color: warn ? "var(--color-warn-text-strong)" : "var(--color-text-secondary)" }}>
          {capAuditText({ ...audit, capValue: +toShown(audit.capValue).toPrecision(6) }, unitLabel || unit)}.{warn ? " " + warn : ""}{/* #1676 — the same warning as Grade stats, from 10 % */}
        </div>
      )}
    </div>
  );
}
