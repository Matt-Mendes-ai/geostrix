// TASKS.csv #2934 (WA iron review) — the vertical exaggeration on the view itself, under Top / Bottom / Fit, in both ribbon modes. It was only
// the second row of Advanced > Figure, and the Simple ribbon had none: on a 21.6 x 17.4 km field of 50 m holes, a hole is about one pixel
// long at Fit, so no log or grade could be seen without it. The same setting as the Figure popover (figureOverlay.ve, saved with the view).
import React from "react";
import { t as tr } from "../../lib/i18n.js";
import { VE_CHOICES, veOf } from "./verticalExaggeration.js";
import { miniBtn } from "./ViewerParts.jsx";

export default function ViewVeSelect({ figureOverlay, setFigureOverlay }) {
  const ve = veOf(figureOverlay?.ve);
  return (
    <select aria-label={tr("Vertical exaggeration")} title={tr("Vertical exaggeration")} value={ve} onChange={(e) => setFigureOverlay((f) => ({ ...f, ve: Number(e.target.value) }))}
      style={{ ...miniBtn, padding: "4px 2px", color: ve > 1 ? "var(--color-accent-dark)" : miniBtn.color, fontWeight: ve > 1 ? 600 : 400 }}>
      {VE_CHOICES.map((v) => <option key={v} value={v}>{tr("VE {n}x", { n: v })}</option>)}
    </select>
  );
}
