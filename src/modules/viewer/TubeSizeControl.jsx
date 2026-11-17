// TASKS.csv #3668 — the interval tubes' size choice in the Figure overlay popover, saved with the view (figureOverlay.tubeSize { mode, px }): Auto (never thinner than 1.5 px:
// the look since #3643), the true radius, at least N px, or a fixed N px (lib/viewer/tubeShader.js tubeSizeUniforms). One choice for every hole layer (the tubes share one shader).
import React from "react";
import { t as tr } from "../../lib/i18n.js";

export default function TubeSizeControl({ figureOverlay, setFigureOverlay }) {
  const ts = figureOverlay.tubeSize || { mode: "auto" };
  const set = (v) => setFigureOverlay((f) => ({ ...f, tubeSize: v }));
  const needsPx = ts.mode === "atLeast" || ts.mode === "fixed";
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", marginBottom: 8 }} title={tr("How the drilled intervals' tubes are drawn from far out. Auto never draws them thinner than 1.5 px; True radius draws them as thin as they really are; At least keeps a pixel floor you choose; Fixed draws every tube the same width on screen.")}>
      {tr("Interval tubes")}
      <select aria-label={tr("Interval tube size")} value={ts.mode || "auto"} onChange={(e) => set(e.target.value === "atLeast" || e.target.value === "fixed" ? { mode: e.target.value, px: ts.px > 0 ? ts.px : 3 } : { mode: e.target.value })} style={{ fontSize: "var(--font-size-sm)", padding: "2px 4px" }}>
        <option value="auto">{tr("Auto")}</option><option value="true">{tr("True radius")}</option><option value="atLeast">{tr("At least (px)")}</option><option value="fixed">{tr("Fixed (px)")}</option>
      </select>
      {needsPx && <input type="number" min={0.5} step={0.5} aria-label={tr("Tube width in pixels")} value={ts.px} onChange={(e) => { const v = Number(e.target.value); if (v > 0) set({ mode: ts.mode, px: v }); }} style={{ width: 56, fontSize: "var(--font-size-sm)" }} />}
    </label>
  );
}
