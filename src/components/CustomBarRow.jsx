// TASKS.csv #4008 — a numeric custom layer's 'Bars' in its Style dialog: its values drawn as a bar beside the hole (3D and the section window), in its own
// colour, sharing a scale with the other bars of the same unit (lib/customBars.js). The same choice is listed in the Mineralization panel's Bars chooser.
import React from "react";
import { t as tr } from "../lib/i18n.js";

export default function CustomBarRow({ style, onChange, row, lbl }) {
  return (
    <div style={row}>
      <span style={lbl}>{tr("Bars")}</span>
      <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: "var(--font-size-sm)" }}>
        <input type="checkbox" checked={!!style?.bar} onChange={(e) => onChange({ bar: e.target.checked ? true : null })} />{tr("A bar beside the trace, its length following the value")}
      </label>
    </div>
  );
}
