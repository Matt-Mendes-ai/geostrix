// TASKS.csv #3553 (Fireweed rehearsal, Macpass) — a numeric hole layer coloured by one of its kept text columns: 'Colour by: method' lists MEAS /
// REG / LAB-SPG04 with their colours and counts; a click hides or shows a value in the 3D view, shift-click shows only that one. The choice lives
// in the layer's symbology (sym.byField = { field, hidden }); `children` (the value's classes and ramp) shows while the layer is coloured by its value.
import React, { useMemo } from "react";
import { keptTextFields, fieldValueColours, BLANK } from "../lib/fieldColours.js";
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";

export default function FieldColourPanel({ rows, sym, onChange, children = null }) {
  const fields = useMemo(() => keptTextFields(rows), [rows]);
  const by = sym?.byField;
  const cur = by?.field ? fields.find((f) => f.field === by.field) : null;
  const colours = useMemo(() => (cur ? fieldValueColours(cur.values) : null), [cur]);
  if (!fields.length) return children;
  const hidden = new Set(by?.hidden || []);
  const set = (byField) => {
    const rest = { ...(sym || {}) };
    delete rest.byField;
    const next = byField ? { ...rest, byField } : rest;
    onChange(Object.keys(next).length ? next : null);
  };
  const toggle = (v, only) => set({ field: cur.field, hidden: only ? cur.values.map(([x]) => x).filter((x) => x !== v) : hidden.has(v) ? [...hidden].filter((x) => x !== v) : [...hidden, v] });
  return (
    <>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6 }}>
        {tr("Colour by")}
        <select value={cur ? cur.field : ""} onChange={(e) => set(e.target.value ? { field: e.target.value, hidden: [] } : null)} style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-sm)" }}
          title={tr("Colour the intervals by the value, or by a text column the import kept (a method, a flag); each of its values can be hidden")}>
          <option value="">{tr("the value")}</option>
          {fields.map((f) => <option key={f.field} value={f.field}>{f.field}</option>)}
        </select>
      </label>
      {cur ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
          {cur.values.map(([v, n]) => {
            const off = hidden.has(v), color = colours.get(v), lbl = v === BLANK ? tr("(blank)") : v;
            return (
              <span key={v} role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={(e) => toggle(v, e.shiftKey)}
                title={tr("{lbl} ({count}) — click to toggle, shift-click to show only this one", { lbl, count: n.toLocaleString() })}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 10, fontSize: "var(--font-size-xs)", cursor: "pointer", border: `1px solid ${off ? "var(--color-border-light)" : color}`, color: off ? "var(--color-text-disabled)" : "var(--color-text)", background: off ? "transparent" : "var(--color-divider)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, opacity: off ? 0.35 : 1 }} />
                {lbl} <span style={{ color: "var(--color-text-muted)" }}>{n.toLocaleString()}</span>
              </span>
            );
          })}
        </div>
      ) : children}
    </>
  );
}
