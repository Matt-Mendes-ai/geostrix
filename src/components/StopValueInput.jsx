// TASKS.csv #1422 (review #1352, Silvertip) — a legend stop's value is shown with the fewest significant figures that keep the stops
// apart ('0.128', not '0.12831663191540246'); what the user types is kept as typed while they type. `shown` is the rounded value
// for display (readableValues over the whole stop list); `value` is the stored one. A change from outside (Classify, Recolour,
// another stop) resets the text to the rounded value; the stored values are not rounded until the user edits one: leaving the box untouched (the
// blur commits what it shows) hands back the rounded text, which is not an edit, so it is not stored.
import React from "react";
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926 — '0,05' and '0.05'; the stop is committed when the box is left or Enter is pressed

export default function StopValueInput({ value, shown, onCommit, style, title, ariaLabel }) {
  return <NumberInput value={shown ?? value} onChange={(v) => { if (v != null && v !== value && !(shown != null && v === Number(shown))) onCommit(v); }} style={style} title={title} aria-label={ariaLabel} />;
}
