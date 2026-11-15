// TASKS.csv #3252 (Main's condition on phase 3) — 'Detail tiles' on the terrain and raster cards of the 3D View: the switch (kept on this
// computer), why the terrain tiles start off here, and when the budget has cut them back to keep the view smooth.
import React, { useEffect, useState } from "react";
import { t as tr } from "../../lib/i18n.js";
import { lodBudget } from "../../lib/viewer/lodBudget.js";

export default function DetailTilesToggle({ kind, on, offReason = null, chosen = false, onChange }) {
  const [factor, setFactor] = useState(1);
  useEffect(() => { if (!on) return undefined; const id = setInterval(() => setFactor(lodBudget.factor()), 2000); return () => clearInterval(id); }, [on]);
  const why = !on && !chosen && offReason ? (offReason === "memory" ? tr("Off by default on this computer (8 GB of memory or less).") : offReason === "software" ? tr("Off by default on this computer (no graphics card: software drawing).") : tr("Off by default on this computer (integrated graphics).")) : null;
  return (
    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "-4px 0 6px 28px", lineHeight: 1.4 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }} title={kind === "terrain" ? tr("Finer ground near the camera, read from the terrain's source as you look (display only: checks, sections and mine design keep the saved grid).") : tr("Finer imagery near the camera, read from the picture's source as you look.")}>
        <input type="checkbox" checked={!!on} onChange={(e) => onChange(e.target.checked)} />{tr("Detail tiles")}
      </label>
      {why && <span> {why}</span>}
      {on && factor < 1 && <span> {tr("Cut back to {pct} % to keep the view smooth.", { pct: Math.round(factor * 100) })}</span>}
    </div>
  );
}
