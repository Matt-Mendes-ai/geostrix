// TASKS.csv #3926 — a number box that reads what a person types: '0,05' and '0.05' both give 0.05, an entry it cannot read is shown with a plain
// line (not dropped, as <input type="number"> did with a comma), and '1.234,5' is refused rather than guessed. Parses on blur and on Enter.
// value: the number (or null / ''); onChange(number) (null when emptied and allowEmpty); min / max / step as the native box (step: the arrow keys).
import React, { useEffect, useRef, useState } from "react";
import { parseDecimal, decimalText } from "../lib/parseDecimal.js";
import { t as tr } from "../lib/i18n.js";

export default function NumberInput({ value, onChange, min = null, max = null, step = null, allowEmpty = false, placeholder, style, "aria-label": ariaLabel, title, id, disabled = false }) {
  const [text, setText] = useState(decimalText(value)), [error, setError] = useState(null), editing = useRef(false);
  useEffect(() => { if (!editing.current) { setText(decimalText(value)); setError(null); } }, [value]);
  const commit = (raw) => {
    editing.current = false;
    const r = parseDecimal(raw);
    if (!r.ok) { setError(r.error === "ambiguous" ? tr("Write the number with one decimal mark and no thousands separator, e.g. 1234.5") : tr("This is not a number: use digits and one decimal mark, e.g. 0.05 or 0,05")); return; }
    if (r.empty) { if (allowEmpty) { setError(null); setText(""); onChange?.(null); } else { setText(decimalText(value)); setError(null); } return; }
    if ((min != null && r.value < min) || (max != null && r.value > max)) { setError(min != null && max != null ? tr("Enter a number from {min} to {max}", { min, max }) : min != null ? tr("Enter a number of {min} or more", { min }) : tr("Enter a number of {max} or less", { max })); return; }
    setError(null); setText(decimalText(r.value)); onChange?.(r.value);
  };
  const nudge = (dir) => { const r = parseDecimal(text), base = r.ok && !r.empty ? r.value : Number(value) || 0, s = step || 1, v = +(base + dir * s).toPrecision(12); commit(String(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)))); };
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <input id={id} type="text" inputMode="decimal" value={text} placeholder={placeholder} disabled={disabled} title={title} aria-label={ariaLabel} aria-invalid={error ? true : undefined}
        onChange={(e) => { editing.current = true; setText(e.target.value); if (error) setError(null); }} onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(e.currentTarget.value); } else if (e.key === "ArrowUp") { e.preventDefault(); nudge(1); } else if (e.key === "ArrowDown") { e.preventDefault(); nudge(-1); } }}
        style={{ ...style, ...(error ? { borderColor: "var(--color-danger-solid)" } : {}) }} />
      {error && <span role="alert" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-solid)", lineHeight: 1.3, maxWidth: 220 }}>{error}</span>}
    </span>
  );
}
