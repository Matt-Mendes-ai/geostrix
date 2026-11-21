// TASKS.csv #3943 — choosing the bars along the trace: in the Mineralization panel, the minerals (up to six) drawn as bars beside the holes;
// the Assays section's 'Bars' is AssayBarsToggle.jsx. The choice is the layer's style (`bars`), saved with the view.
import React, { useMemo, useRef } from "react";
import { MAX_BARS } from "../lib/traceBarsData.js";
import { mineralBarChoices } from "../lib/totalSulphides.js";
import { t as tr } from "../lib/i18n.js";

const chip = (on, colour) => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 7px", borderRadius: 10, cursor: "pointer", fontSize: "var(--font-size-xs)", border: `1px solid ${on ? colour || "var(--color-accent)" : "var(--color-border-light)"}`, color: on ? "var(--color-text)" : "var(--color-text-muted)", background: on ? "var(--color-divider)" : "transparent" });

export function MineralBarsChooser({ rows, style, onStyle, colourOf }) {
  const choices = useMemo(() => mineralBarChoices(rows), [rows]);
  const latest = useRef(null); // two clicks before the style comes back: the second builds on the first
  if (!choices.length) return null;
  const on = (style?.bars || []).filter((id) => choices.some((c) => c.id === id));
  latest.current = on;
  const toggle = (id) => { const cur = latest.current; const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_BARS ? cur : [...cur, id]; latest.current = next; onStyle?.({ bars: next }); };
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-divider)", fontSize: "var(--font-size-sm)" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr("Bars")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {choices.map((c) => {
          const sel = on.includes(c.id), colour = colourOf?.(c.id);
          return (
            <span key={c.id} role="checkbox" aria-checked={sel} tabIndex={0} onClick={() => toggle(c.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(c.id); } }} style={chip(sel, colour)}>
              {colour && <span style={{ width: 8, height: 4, background: colour, borderRadius: 1, opacity: sel ? 1 : 0.4 }} />}{c.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default MineralBarsChooser; // loaded when the Mineralization panel opens (ViewerParts)
