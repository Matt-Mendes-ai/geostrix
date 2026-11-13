// TASKS.csv #2584 (Matt's decision, 2026-11-11) — where the ground between the collars stands in for a terrain, a pit's benches put
// collars of different levels side by side; collarGround (lib/pitShell.js collarBenches) then uses the lowest collar there and leaves
// the higher ones out. Every tool that uses that ground says so here, with the check's own thresholds, never silently.
// The text is lib/collarLevelsText.js (TASKS.csv #2962: it also names the collars left out).
import React, { useMemo } from "react";
import { collarLevelsText } from "../lib/collarLevelsText.js";

export { collarLevelsText };

export default function CollarLevelsNote({ collars, style = null }) {
  const text = useMemo(() => collarLevelsText(collars), [collars]);
  if (!text) return null;
  return <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", lineHeight: 1.4, marginTop: 4, ...(style || {}) }}>{text}</div>;
}
