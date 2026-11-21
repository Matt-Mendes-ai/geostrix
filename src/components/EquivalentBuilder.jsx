// TASKS.csv #3923 — the metal-equivalent form of the Calculated element panel: the base metal, the metals added to it, and the price and recovery the user types for
// each. Nothing is filled in. lib/equivalentElement.js turns the inputs into the formula the panel stores.
import React from "react";
import { PRECIOUS_METALS } from "../lib/geochem.js";
import { t as tr } from "../lib/i18n.js";
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926

const inp = { width: 78, fontSize: "var(--font-size-sm)" };

export default function EquivalentBuilder({ elements, eq, onChange, result }) {
  const real = (elements || []).filter((e) => !e.calculated);
  const set = (patch) => onChange({ ...eq, ...patch });
  const row = (s, patch) => set({ rows: { ...eq.rows, [s]: { ...eq.rows?.[s], ...patch } } });
  const priceUnit = (s) => (PRECIOUS_METALS.has(s) ? "$/oz" : "$/lb");
  const metalRow = (s, label) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {tr("price")} <NumberInput allowEmpty min="0" value={eq.rows?.[s]?.price ?? ""} onChange={(v) => row(s, { price: v == null ? "" : String(v) })} style={inp} aria-label={tr("{s} price", { s })} />
      {priceUnit(s)} {tr("recovery")} <NumberInput allowEmpty min="1" max="100" value={eq.rows?.[s]?.recovery ?? ""} onChange={(v) => row(s, { recovery: v == null ? "" : String(v) })} style={{ ...inp, width: 56 }} aria-label={tr("{s} recovery %", { s })} /> %
      {label}
    </span>
  );
  const problem = result?.problem;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
      <div style={{ color: "var(--color-text-muted)", lineHeight: 1.4 }}>{tr("Prices and recoveries are the ones you type: nothing is filled in. A sample missing any of the metals gets no equivalent.")}</div>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Base metal (the equivalent is in its unit)")}
        <select value={eq.base || ""} onChange={(e) => set({ base: e.target.value })} style={{ fontSize: "var(--font-size-sm)" }} aria-label={tr("Base metal")}>
          {real.map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol}</option>)}
        </select>
      </label>
      {eq.base && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ minWidth: 34 }}>{eq.base}</span>{metalRow(eq.base)}</div>}
      <div style={{ color: "var(--color-text-secondary)" }}>{tr("Metals added to it")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 190, overflowY: "auto" }}>
        {real.filter((e) => e.symbol !== eq.base).map((e) => (
          <div key={e.symbol} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 52, cursor: "pointer" }}>
              <input type="checkbox" checked={!!eq.rows?.[e.symbol]?.on} onChange={(ev) => row(e.symbol, { on: ev.target.checked })} aria-label={tr("Add {s} to the equivalent", { s: e.symbol })} />{e.symbol}
            </label>
            {eq.rows?.[e.symbol]?.on && metalRow(e.symbol)}
          </div>
        ))}
      </div>
      {result?.ready
        ? <div style={{ color: "var(--color-text-muted)" }}>{result.text}</div>
        : <div style={{ color: "var(--color-danger-icon-strong)" }}>{problem === "others" ? tr("Tick at least one metal to add to the base metal.") : problem === "inputs" ? tr("Enter a price and recovery for every metal ticked: no equivalent is made until all are entered.") : tr("Pick the base metal.")}</div>}
    </div>
  );
}
