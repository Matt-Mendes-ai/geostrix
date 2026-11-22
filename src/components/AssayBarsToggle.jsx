// TASKS.csv #3943 — the Assays section's 'Bars': the shown elements drawn as bars beside the trace instead of markers (the first six when more
// are shown). The choice is the 'assay' style's `bars`, saved with the view; the bars are drawn by lib/viewer/useTraceBars.js.
import React from "react";
import { t as tr } from "../lib/i18n.js";

const MAX = 6; // lib/traceBarsData.js MAX_BARS (not imported: this sits in the startup bundle)

export default function AssayBarsToggle({ style, onStyle, count }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "0 10px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
      <input type="checkbox" checked={!!style?.bars} onChange={(e) => onStyle?.({ bars: e.target.checked || null })} />{tr("Bars")}
      {style?.bars && count > MAX && <span style={{ color: "var(--color-text-muted)" }}>{tr("(the first {n})", { n: MAX })}</span>}
    </label>
  );
}
