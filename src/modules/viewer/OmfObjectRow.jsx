// TASKS.csv #3895 — an imported OMF point set, line set or surface in StrixViewer's "Boundaries and models" list: show / hide, its name, its
// colour and opacity right here (they were only in the Geophysics tab), zoom to, and remove. Moved out of ViewerModule.jsx (its size cap).
import React from "react";
import { Eye, EyeOff, MapPin, Waypoints, Triangle, Maximize2, Trash2 } from "../../components/icons.js";
import { activateOnKey, iconAction } from "../../lib/a11y.js";
import { confirmDestructive } from "../../lib/confirmDestructive.js";
import { t as tr } from "../../lib/i18n.js";

const OPACITIES = [1, 0.75, 0.5, 0.25];

export default function OmfObjectRow({ o, update, remove, zoom, openRowMenu }) {
  const shown = o.visible !== false, colour = o.color || "#5a9bd4", opacity = Number.isFinite(o.opacity) ? o.opacity : 1;
  const ask = async () => { if (await confirmDestructive(tr("Remove OMF object \"{name}\"?", { name: o.name }))) remove(o.id); };
  const Icon = o.kind === "points" ? MapPin : o.kind === "lines" ? Waypoints : Triangle;
  return (
    <div onContextMenu={(e) => openRowMenu(e, o.name, [{ label: shown ? "Hide" : "Show", onClick: () => update(o.id, { visible: !shown }) }, { label: tr("Zoom to"), onClick: zoom }, "-", { label: tr("Remove…"), onClick: ask }])}
      style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
      <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => update(o.id, { visible: !shown })} aria-label={shown ? tr("Hide") : tr("Show")} style={{ cursor: "pointer", color: shown ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
        {shown ? <Eye size={14} /> : <EyeOff size={14} />}
      </div>
      <Icon size={14} style={{ color: colour, flexShrink: 0 }} />
      <span title={o.name} style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
      <input type="color" value={colour} onChange={(e) => update(o.id, { color: e.target.value })} aria-label={tr("Colour of {name}", { name: o.name })} title={tr("Colour")} style={{ width: 20, height: 18, padding: 0, border: "none", background: "none", cursor: "pointer", flexShrink: 0 }} />
      {o.kind === "surface" && (
        <select value={opacity} onChange={(e) => update(o.id, { opacity: Number(e.target.value) })} aria-label={tr("Opacity of {name}", { name: o.name })} title={tr("Opacity")} style={{ fontSize: "var(--font-size-xs)", padding: "0 2px", flexShrink: 0 }}>
          {OPACITIES.map((v) => <option key={v} value={v}>{`${Math.round(v * 100)} %`}</option>)}
        </select>
      )}
      <Maximize2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(zoom, tr("Zoom to"))} />
      <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(ask, tr("Remove OMF object \"{name}\"", { name: o.name }))} />
    </div>
  );
}
