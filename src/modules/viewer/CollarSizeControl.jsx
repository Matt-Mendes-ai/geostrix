// TASKS.csv #2823 — the collar markers' size in the Figure overlay popover, beside the vertical exaggeration, saved with the view
// (figureOverlay.collarSize): Auto (from the drilling, lib/viewer/collarMarkerSize.js), a radius in m, or Off (the holes stay).
// Choosing a radius starts it at 3.2 m, the size every marker had before, to edit from there.
import React from "react";
import { t as tr } from "../../lib/i18n.js";
import { DEFAULT_COLLAR_RADIUS } from "../../lib/viewer/collarMarkerSize.js";

export default function CollarSizeControl({ figureOverlay, setFigureOverlay }) {
  const cms = figureOverlay.collarSize;
  const set = (v) => setFigureOverlay((f) => ({ ...f, collarSize: v }));
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", marginBottom: 8 }} title={tr("Auto sizes the collar markers from the drilling: small where the holes are short and close together (an underground drive), as before on spread drilling. Off hides them and keeps the holes.")}>
      {tr("Collar markers")}
      <select aria-label={tr("Collar markers")} value={cms === "off" ? "off" : cms > 0 ? "m" : "auto"} onChange={(e) => set({ auto: "auto", off: "off", m: DEFAULT_COLLAR_RADIUS }[e.target.value])} style={{ fontSize: "var(--font-size-sm)", padding: "2px 4px" }}>
        <option value="auto">{tr("Auto")}</option><option value="m">{tr("Radius (m)")}</option><option value="off">{tr("Off")}</option>
      </select>
      {cms > 0 && <input type="number" min={0.01} step={0.1} aria-label={tr("Radius (m)")} value={cms} onChange={(e) => { const v = Number(e.target.value); if (v > 0) set(v); }} style={{ width: 56, fontSize: "var(--font-size-sm)" }} />}
    </label>
  );
}
