// TASKS.csv #3943 — choosing the bars along the trace: in the Mineralization panel, the minerals (up to six) drawn as bars beside the holes;
// the Assays section's 'Bars' is AssayBarsToggle.jsx. The choice is the layer's style (`bars`), saved with the view.
import React, { useMemo, useRef } from "react";
import { MAX_BARS } from "../lib/traceBarsData.js";
import { mineralBarChoices } from "../lib/totalSulphides.js";
import { numericCustomChoices, customBarColour, barLayers } from "../lib/customBars.js"; // TASKS.csv #4008
import { t as tr } from "../lib/i18n.js";

const chip = (on, colour) => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 7px", borderRadius: 10, cursor: "pointer", fontSize: "var(--font-size-xs)", border: `1px solid ${on ? colour || "var(--color-accent)" : "var(--color-border-light)"}`, color: on ? "var(--color-text)" : "var(--color-text-muted)", background: on ? "var(--color-divider)" : "transparent" });

// custom (#4008): { layers, styles, set(id, on) } — the numeric custom layers listed after the minerals; one choice each (its style `bar`), up to six lanes in all
export function MineralBarsChooser({ rows, style, onStyle, colourOf, custom = null }) {
  const choices = useMemo(() => mineralBarChoices(rows), [rows]);
  const customChoices = useMemo(() => numericCustomChoices(custom?.layers), [custom?.layers]);
  const latest = useRef(null); // two clicks before the style comes back: the second builds on the first
  if (!choices.length && !customChoices.length) return null;
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
      {customChoices.length > 0 && (
        <>
          <div style={{ margin: "6px 0 4px", color: "var(--color-text-secondary)", fontSize: "var(--font-size-xs)" }}>{tr("Custom layers")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {customChoices.map((c) => {
              const layer = custom.layers.find((l) => l.id === c.id), sel = !!custom.styles?.[`custom:${c.id}`]?.bar;
              const full = !sel && on.length + barLayers(custom.layers, {}, custom.styles).length >= MAX_BARS, colour = customBarColour(layer, sel ? barLayers(custom.layers, {}, custom.styles).findIndex((l) => l.id === c.id) + on.length : 0, custom.styles);
              return (
                <span key={c.id} role="checkbox" aria-checked={sel} aria-disabled={full} tabIndex={0} title={c.unit || undefined} onClick={() => { if (!full) custom.set(c.id, !sel); }} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !full) { e.preventDefault(); custom.set(c.id, !sel); } }} style={{ ...chip(sel, colour), opacity: full ? 0.5 : 1 }}>
                  <span style={{ width: 8, height: 4, background: colour, borderRadius: 1, opacity: sel ? 1 : 0.4 }} />{c.label}
                </span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default MineralBarsChooser; // loaded when the Mineralization panel opens (ViewerParts)
