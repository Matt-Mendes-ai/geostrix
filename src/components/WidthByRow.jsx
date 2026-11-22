// TASKS.csv #3942 — the Mineralization layer's 'Width by' in its Style dialog: None, Total sulphides (once it is added, #3941) or one mineral's
// per cent, and the value drawn at full width (blank: the 98th percentile). The rules are in lib/widthBy.js.
import React, { useMemo } from "react";
import { widthScale } from "../lib/widthBy.js";
import { widthChoices } from "../lib/totalSulphides.js";
import NumberInput from "./NumberInput.jsx";
import { t as tr } from "../lib/i18n.js";

export default function WidthByRow({ rows, style, onChange, row, lbl, select }) {
  const choices = useMemo(() => widthChoices(rows), [rows]);
  const scale = useMemo(() => widthScale(rows, style), [rows, style]);
  if (!choices.length) return null;
  const by = choices.some((c) => c.id === style?.widthBy) ? style.widthBy : "";
  return (
    <>
      <div style={row}>
        <span style={lbl}>{tr("Width by")}</span>
        <select value={by} onChange={(e) => onChange({ widthBy: e.target.value || null })} aria-label={tr("Width by")} style={select}>
          <option value="">{tr("None")}</option>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      {by && (
        <div style={row}>
          <span style={lbl}>{tr("Full width at")}</span>
          <NumberInput value={style?.widthFull ?? null} allowEmpty min={0} onChange={(v) => onChange({ widthFull: v > 0 ? v : null })} placeholder={scale?.auto ? String(+scale.full.toPrecision(3)) : ""} aria-label={tr("Full width at")} style={{ width: 70 }} />
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>%</span>
        </div>
      )}
    </>
  );
}
