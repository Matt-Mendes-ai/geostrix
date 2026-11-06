// TASKS.csv #1422 (review #1352, Silvertip) — a legend stop's value is shown with the fewest significant figures that keep the stops
// apart ('0.128', not '0.12831663191540246'); what the user types is kept as typed while they type. `shown` is the rounded value
// for display (readableValues over the whole stop list); `value` is the stored one. A change from outside (Classify, Recolour,
// another stop) resets the text to the rounded value; the stored values are not rounded until the user edits one.
import React, { useEffect, useState } from "react";

export default function StopValueInput({ value, shown, onCommit, style, title, ariaLabel }) {
  const [text, setText] = useState(String(shown ?? value));
  useEffect(() => { setText((t) => (t !== "" && Number(t) === value ? t : String(shown ?? value))); }, [value, shown]);
  return (
    <input type="number" value={text} title={title} aria-label={ariaLabel} style={style}
      onChange={(e) => { const t = e.target.value; setText(t); const v = Number(t); if (t.trim() !== "" && Number.isFinite(v)) onCommit(v); }} />
  );
}
