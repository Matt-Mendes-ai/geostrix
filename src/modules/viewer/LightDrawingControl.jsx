// TASKS.csv #3620 — the 'Drawing' choice of the 3D View's sidebar: Auto (light drawing for a software renderer, full for a GPU), Light, or Full, kept on this computer
// (lib/viewer/lightDrawing.js, localStorage). A change decides again at once and the scene is rebuilt (onChange).
import React, { useState } from "react";
import { t as tr } from "../../lib/i18n.js";
import { lightPref, applyLightPref, isLight } from "../../lib/viewer/lightDrawing.js";

export default function LightDrawingControl({ onChange }) {
  const [pref, setPref] = useState(lightPref);
  const choose = (v) => { setPref(v); applyLightPref(v); onChange?.(); };
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", marginBottom: 8 }} title={tr("Light drawing uses fewer triangles (assays along the hole, simpler solids, big interval layers as ribbons, coarser detail from afar): for a computer without a working graphics driver. Auto turns it on for a software renderer.")}>
      {tr("Drawing")}
      <select aria-label={tr("Drawing")} value={pref} onChange={(e) => choose(e.target.value)} style={{ fontSize: "var(--font-size-sm)" }}>
        <option value="auto">{isLight() && pref === "auto" ? tr("Auto (light: software renderer)") : tr("Auto")}</option>
        <option value="on">{tr("Light")}</option>
        <option value="off">{tr("Full")}</option>
      </select>
    </label>
  );
}
