import React from "react";
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926

// TASKS.csv #1208 — a cutoff can be typed ("above 20 mV/V", "0.05 S/m", or "0,05"), and reads to the model's precision: the slider's readout said 0.2 for 0.196
export default function VoxelRangeNumber({ value, label, onCommit }) {
  const show = (v) => String(Number(Number(v).toPrecision(4)));
  return <NumberInput aria-label={label} value={Number(show(value))} onChange={(v) => { if (v != null && show(v) !== show(value)) onCommit(v); }}
    style={{ width: 66, flexShrink: 0, padding: "2px 3px", textAlign: "right", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }} />;
}
