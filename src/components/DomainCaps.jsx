// TASKS.csv #1571 (review #1497, Lawyers) — caps per domain: the length-weighted P97.5 / P99 of each domain's own samples and the share of
// its metal a cap removes. A district-wide P99 of 2.04 g/t removed 35 % of the metal, because the district is mostly waste; within the
// mineralized domains the percentiles are the ones a cap should come from. caps: { domain value: text }; blank = the global cap.
import React, { useMemo } from "react";
import { lengthWeightedPercentile, capAudit } from "../lib/geochem.js";
import { domainOfInterval } from "../lib/domainLayers.js";
import { t as tr } from "../lib/i18n.js";

const fmt = (v) => (v == null || !Number.isFinite(v) ? "—" : Math.abs(v) >= 100 ? String(Math.round(v)) : String(+v.toPrecision(3)));

export default function DomainCaps({ assays, symbol, unit, elementUnits, domainRows, caps, setCaps }) {
  const rows = useMemo(() => {
    if (!symbol || !domainRows) return [];
    const dom = domainOfInterval(domainRows), by = new Map();
    for (const a of assays || []) { if (a.values?.[symbol] == null) continue; const d = dom(a); if (d == null || d === "") continue; (by.get(d) || by.set(d, []).get(d)).push(a); }
    return [...by].map(([d, list]) => ({ d, n: list.length, p975: lengthWeightedPercentile(list, symbol, unit, elementUnits, 97.5), p99: lengthWeightedPercentile(list, symbol, unit, elementUnits, 99), list }))
      .sort((a, b) => b.n - a.n).slice(0, 24);
  }, [assays, symbol, unit, elementUnits, domainRows]);
  if (!rows.length) return null;
  const set = (d, v) => setCaps((c) => ({ ...c, [d]: v }));
  const btn = { background: "none", border: "1px solid var(--color-border)", borderRadius: 4, padding: "0 5px", cursor: "pointer", fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
  return (
    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px" }}>
      <div style={{ marginBottom: 4 }} title={tr("A cap here applies to the composites of that domain only; blank = the cap below. The percentiles are length-weighted over that domain's own samples.")}>{tr("Cap per domain ({unit})", { unit })}</div>
      {rows.map((r) => {
        const cap = Number(caps[r.d]) > 0 ? Number(caps[r.d]) : null;
        const audit = cap ? capAudit(r.list, symbol, unit, elementUnits, cap) : null;
        return (
          <div key={r.d} style={{ display: "flex", alignItems: "center", gap: 5, padding: "1px 0", flexWrap: "wrap" }}>
            <span style={{ width: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text)" }} title={r.d}>{r.d}</span>
            <span style={{ width: 52, color: "var(--color-text-muted)" }}>{tr("{n} smp", { n: r.n })}</span>
            <button type="button" style={btn} disabled={r.p975 == null} onClick={() => set(r.d, String(+r.p975.toPrecision(4)))}>P97.5 {fmt(r.p975)}</button>
            <button type="button" style={btn} disabled={r.p99 == null} onClick={() => set(r.d, String(+r.p99.toPrecision(4)))}>P99 {fmt(r.p99)}</button>
            <input type="number" min="0" step="any" value={caps[r.d] ?? ""} placeholder={tr("global")} onChange={(e) => set(r.d, e.target.value)} aria-label={tr("Cap for domain {d}", { d: r.d })} style={{ width: 62, fontSize: "var(--font-size-xs)" }} />
            {audit && <span style={{ color: audit.pctMetalRemoved > 20 ? "var(--color-warn-text)" : "var(--color-text-muted)" }}>{tr("{c} of {n} capped, {m}% of the metal", { c: audit.nCapped, n: audit.nSamples, m: audit.pctMetalRemoved.toFixed(1) })}</span>}
          </div>
        );
      })}
    </div>
  );
}
