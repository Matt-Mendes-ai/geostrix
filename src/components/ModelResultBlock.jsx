// TASKS.csv #3988 (Matt, 2026-11-21: "the add as block model menu and build blocks should be close to each other. Perhaps have them pinned at the top of the side panel.") —
// one Result block at the top of the 3D Modelling side panel, stuck there while the rest scrolls under it: the last model's line, Build the blocks (its settings folded
// under it, the block count in one line), then the three Add buttons, in the order a user takes them. No behaviour of its own: the buttons are the ones that were in the
// "Last model" card, the build panel is SurfaceSolidsPanel in its inline form, and every setting is still there. Shown once a model exists, or while the build panel is open.
import React, { useState } from "react";
import { Box, Layers3, ChevronDown, ChevronUp, X } from "./icons.js";
import { t as tr } from "../lib/i18n.js";

export default function ModelResultBlock({ last, stale, buildPanel, onClose, onUnitVolumes, onBlockModel, onModelledLayer, pBtn }) {
  // a short panel starts folded to its heading line; the chevron opens it
  const [open, setOpen] = useState(() => (typeof window === "undefined" ? true : window.innerHeight >= 700));
  const line = last
    ? (stale ? tr("Built from a lithology log that has changed since:") + " " : "") + (last.matchedPct != null ? tr("Last model ({title}, {when}) reproduces {pct}% of the logged metres.", { title: last.title, when: last.when, pct: last.matchedPct }) : tr("Last model ({title}, {when}).", { title: last.title, when: last.when }))
    : tr("No model yet.");
  const can = !!last && !last.structural; // a structural model has no litho block to add (#1554)
  const why = !last ? tr("Build the blocks first.") : null;
  const addBtn = (onClick, Icon, label, title, tail) => <button onClick={onClick} disabled={!can && !!why} title={why || title} style={{ ...pBtn, marginBottom: tail ? 0 : 4, opacity: !can && why ? 0.5 : 1, cursor: !can && why ? "default" : "pointer" }}><Icon size={14} />{" "}{label}</button>;
  return (
    <div data-result-block="" style={{ position: "sticky", top: 0, zIndex: 4, margin: "8px 0 8px", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)", boxShadow: "0 2px 6px rgba(0,0,0,0.12)", fontSize: "var(--font-size-sm)", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: open ? 6 : 0 }}>
        <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", opacity: stale ? 0.55 : 1, ...(open ? null : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }) }} title={open ? undefined : line}><b>{tr("Result")}</b>{" · "}{line}</div>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? tr("Fold the result block") : tr("Open the result block")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: 0, flexShrink: 0 }}>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
        {!last && onClose && <button type="button" onClick={onClose} aria-label={tr("Close")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: 0, flexShrink: 0 }}><X size={14} /></button>}
      </div>
      {open && (<>
        {buildPanel}
        <div style={{ marginTop: 8 }}>
          {last?.structural ? null : (<>
            {addBtn(onUnitVolumes, Box, tr("Add unit volumes (closed)"), tr("Each modelled unit as a closed solid (closed at the model box): export as DXF / OBJ, volume / tonnage, cut on sections and plans, and a grade-estimation domain"))}
            {addBtn(onBlockModel, Box, tr("Add as block model"), tr("The model's units as a block model, with the 3D view, slice, cutoff and section tools of any block model. The space above every modelled top is left out."))}
            {addBtn(onModelledLayer, Layers3, tr("Add \"modelled unit\" layer to holes"), tr("An interval layer of the modelled unit at each logged litho interval, shown beside the logged litho in the strip log and on the holes in 3D and sections."), true)}
          </>)}
          {why && <div style={{ marginTop: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{why}</div>}
        </div>
      </>)}
    </div>
  );
}
