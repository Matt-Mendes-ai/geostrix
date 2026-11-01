import React, { useEffect, useState } from "react";

// TASKS.csv #1208 — a cutoff can be typed ("above 20 mV/V", "0.05 S/m"), and reads to the model's precision: the slider's readout said 0.2 for 0.196
export default function VoxelRangeNumber({ value, label, onCommit }) {
  const show = (v) => String(Number(Number(v).toPrecision(4)));
  const [text, setText] = useState(show(value));
  useEffect(() => { setText(show(value)); }, [value]);
  const commit = () => { const v = Number(text); if (text.trim() !== "" && Number.isFinite(v)) { if (show(v) !== show(value)) onCommit(v); } else setText(show(value)); };
  return <input type="number" step="any" aria-label={label} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    style={{ width: 66, flexShrink: 0, padding: "2px 3px", textAlign: "right", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }} />;
}
