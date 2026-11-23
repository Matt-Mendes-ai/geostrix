// TASKS.csv #4028 (Matt, 2026-11-22: "yes") — the Result block of a geoML run (lib/geomlResult.js), looking and sitting like the other tools' (ModelResultBlock, #3988): what the run
// built (its lines: volumes, the intercept / samples check), then one Add button per group in the order a user takes them. Nothing is in the project until a button is
// clicked; an added group says so and has an Undo that takes out exactly what it added, in one step. A new run replaces the result; the X drops it.
import React, { useState, useSyncExternalStore } from "react";
import { Box, ChevronDown, ChevronUp, X } from "./icons.js";
import { t as tr } from "../lib/i18n.js";
import { subscribeResult, getResult, addGroup, undoGroup, clearResult } from "../lib/geomlResult.js";

// the words of each group's button: the other tools' where the idea is the same (Add unit volumes (closed), Add as block model)
export const groupLabel = (kind) => (kind === "bodies" ? tr("Add unit volumes (closed)") : kind === "shells" ? tr("Add grade shells (closed)") : kind === "contact" ? tr("Add the contact surface") : tr("Add as block model"));

export default function GeomlResultBlock({ addSurface, addVoxelModel, removeSurface, removeVoxelModel, sticky = true, pBtn }) {
  const res = useSyncExternalStore(subscribeResult, getResult);
  const [open, setOpen] = useState(() => (typeof window === "undefined" ? true : window.innerHeight >= 700));
  if (!res) return null;
  const order = ["bodies", "shells", "contact", "blocks"];
  const groups = [...res.groups].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return (
    <>
      <div style={{ height: 8 }} aria-hidden="true" />
      <div data-result-block="" data-geoml-result="" style={{ position: sticky ? "sticky" : "static", top: 0, zIndex: 4, margin: "0 0 8px", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)", boxShadow: "0 2px 6px rgba(0,0,0,0.12)", fontSize: "var(--font-size-sm)", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: open ? 6 : 0 }}>
          <div style={{ flex: 1, minWidth: 0, color: "var(--color-text)", ...(open ? null : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }) }}><b>{tr("Result")}</b>{" · "}{tr("geoML: {label}", { label: res.label })}</div>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? tr("Fold the result block") : tr("Open the result block")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: 0, flexShrink: 0 }}>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          <button type="button" onClick={clearResult} aria-label={tr("Close")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: 0, flexShrink: 0 }}><X size={14} /></button>
        </div>
        {open && (<>
          {res.lines.map((l, i) => <div key={i} style={{ fontSize: "var(--font-size-xs)", color: i === 0 ? "var(--color-text)" : "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 2 }}>{l}</div>)}
          <div style={{ marginTop: 8 }}>
            {groups.map((g) => {
              const done = !!res.added[g.key];
              return (
                <div key={g.key} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                  <button type="button" disabled={done} onClick={() => addGroup(g.key, { addSurface, addVoxelModel })} style={{ ...pBtn, marginBottom: 0, flex: 1, opacity: done ? 0.55 : 1, cursor: done ? "default" : "pointer" }}><Box size={14} />{" "}{groupLabel(g.kind)}</button>
                  {done && <button type="button" onClick={() => undoGroup(g.key, { removeSurface, removeVoxelModel })} style={{ fontSize: "var(--font-size-xs)", background: "none", border: "none", color: "var(--color-info)", cursor: "pointer", flexShrink: 0 }}>{tr("Added")}{" · "}{tr("Undo")}</button>}
                </div>
              );
            })}
          </div>
        </>)}
      </div>
    </>
  );
}
