// TASKS.csv #4012 — "Group these as one Mineralization layer": the custom layers that each hold one mineral's per cent (a mineral database imported as one
// numeric layer per mineral) become the fields of one wide-form Mineralization layer (lib/groupMinerals.js). Opened from the Custom layers heading.
// ctx is the 3D View's own setters, so this lazy file needs nothing of the project itself; the change is one Undo step and says what it did.
import React, { useMemo, useState } from "react";
import { X } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps, panel as panelOf, header, rowBtn } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";
import { infoNotice } from "../lib/notices.js";
import { numericCustomChoices } from "../lib/customBars.js";
import { groupMinerals, groupProblems } from "../lib/groupMinerals.js";
import { rowsOf } from "../lib/rowTable.js";

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };

// -> the sentence the notice says (also the preview's numbers); counts are written as 'name: n' so no wording depends on a plural
export const groupedText = (s, merged) => tr("Grouped {layers} custom layers into the Mineralization layer: fields {fields}, intervals {intervals}, holes {holes}. Undo takes it back in one step.", { layers: s.layers, fields: s.fields, intervals: s.intervals.toLocaleString(), holes: s.holes.toLocaleString() })
  + (merged && s.kept ? " " + tr("Kept from the layer that was there: fields {kept}.", { kept: s.kept }) : "") + (s.skipped ? " " + tr("Rows left out (several minerals under one per cent): {skipped}.", { skipped: s.skipped }) : "");

export default function GroupMineralsModal({ customLayers, mnlgy, ids, ctx, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const choices = useMemo(() => numericCustomChoices(customLayers), [customLayers]);
  const [sel, setSel] = useState(() => new Set(ids?.length ? ids : choices.map((c) => c.id)));
  const [remove, setRemove] = useState(false);
  const picked = useMemo(() => (customLayers || []).filter((l) => sel.has(l.id)), [customLayers, sel]);
  const hasOld = useMemo(() => (rowsOf(mnlgy) || []).length > 0, [mnlgy]);
  const problems = useMemo(() => groupProblems(picked), [picked]);
  const fresh = useMemo(() => (problems.length ? null : groupMinerals(picked)), [picked, problems]);
  const merged = useMemo(() => (problems.length || !hasOld ? null : groupMinerals(picked, mnlgy)), [picked, problems, hasOld, mnlgy]);
  const problemText = (p) => (p.kind === "few" ? tr("Tick at least two layers.") : p.kind === "empty" ? tr("No intervals to group in: {names}.", { names: p.names.join(", ") }) : tr("The Mineralization layer holds per cents; not in per cent: {units}.", { units: p.units.join(", ") }));
  const apply = (res, merge) => {
    if (!res?.rows?.length) return;
    ctx.undoCheckpoint?.(); // what you did before stays its own step
    ctx.setLayers((p) => ({ ...p, mnlgy: res.rows }));
    ctx.setLayerVisible((p) => ({ ...p, mnlgy: true }));
    for (const l of picked) { if (remove) ctx.removeCustomLayer(l.id); else ctx.setCustomVisible((p) => ({ ...p, [l.id]: false })); }
    ctx.setNotices((p) => [...p, infoNotice(groupedText(res.stats, merge))]);
    setTimeout(() => ctx.undoCheckpoint?.(), 400); // the change closes as one step
    onClose();
  };
  const stat = (r, what) => r && tr("{what}: fields {fields}, intervals {intervals}, holes {holes}.", { what, fields: r.stats.fields, intervals: r.stats.intervals.toLocaleString(), holes: r.stats.holes.toLocaleString() }) + (r.stats.split ? " " + tr("Intervals cut where the layers differ: {split}.", { split: r.stats.split.toLocaleString() }) : "");
  const toggle = (id) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ok = !problems.length && fresh?.rows?.length;
  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={{ ...panelOf({ width: 520, maxWidth: "92vw", maxHeight: "88vh" }) }} role="dialog" aria-modal="true" aria-label={tr("Group as one Mineralization layer")} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Group as one Mineralization layer")}</div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        <div style={{ padding: 14, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={note}>{tr("Each ticked layer becomes a mineral field of one Mineralization layer, joined by hole and depth. Where the layers' intervals differ, the intervals are cut at every boundary; each interval's code is its dominant mineral and its amount the total.")}</div>
          <div data-group-layers style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
            {choices.map((c) => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>
                <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.label}>{c.label}</span>
                {c.unit && <span style={{ color: "var(--color-text-caption)", fontSize: "var(--font-size-sm)" }}>{c.unit}</span>}
              </label>
            ))}
            {!choices.length && <div style={note}>{tr("No custom layer here holds numbers by interval.")}</div>}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>
            <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />{tr("Remove the custom layers afterwards (otherwise they stay, hidden)")}</label>
          {problems.map((p) => <div key={p.kind} role="alert" style={{ ...note, color: "var(--color-warn-text)" }}>{problemText(p)}</div>)}
          {ok && <div data-group-preview style={note}>{stat(fresh, hasOld ? tr("Replace") : tr("Group"))}</div>}
          {ok && merged && <div data-group-preview-merge style={note}>{stat(merged, tr("Merge"))}</div>}
          {fresh && !fresh.rows.length && <div style={note}>{tr("None of these layers has a mineral above zero.")}</div>}
          {hasOld && <div style={note}>{tr("A Mineralization layer is already here. Merge adds these minerals to it; Replace puts these in its place. Either is one Undo.")}</div>}
        </div>
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={rowBtn(false)}>{tr("Cancel")}</button>
          {hasOld ? (<>
            <button disabled={!ok} onClick={() => apply(fresh, false)} style={{ ...rowBtn(false), opacity: ok ? 1 : 0.5 }}>{tr("Replace")}</button>
            <button disabled={!ok || !merged?.rows?.length} onClick={() => apply(merged, true)} style={{ ...rowBtn(true), opacity: ok ? 1 : 0.5 }}>{tr("Merge")}</button>
          </>) : <button disabled={!ok} onClick={() => apply(fresh, false)} style={{ ...rowBtn(true), opacity: ok ? 1 : 0.5 }}>{tr("Group")}</button>}
        </div>
      </div>
    </div>
  );
}
