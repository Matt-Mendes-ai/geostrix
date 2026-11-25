// TASKS.csv #4012 — "Group these as one Mineralization layer": the custom layers that each hold one mineral's per cent (a mineral database imported as one
// numeric layer per mineral) become the fields of one wide-form Mineralization layer (lib/groupMinerals.js). Opened from the Custom layers heading.
// ctx is the 3D View's own setters, so this lazy file needs nothing of the project itself; the change is one Undo step and says what it did.
import React, { useMemo, useState } from "react";
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap)
import { backdropProps } from "../lib/modalStyles.js";
import { t as tr } from "../lib/i18n.js";
import { infoNotice } from "../lib/notices.js";
import { numericCustomChoices } from "../lib/customBars.js";
import { groupMinerals, groupProblems } from "../lib/groupMinerals.js";
import { rowsOf } from "../lib/rowTable.js";

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };

// -> the sentence the notice says; counts are written as 'name: n' so no wording depends on a plural (a group is always 2 or more layers)
export const groupedText = (s) => tr("Grouped {layers} layers: fields {fields}, intervals {intervals}, holes {holes}.", { layers: s.layers, fields: s.fields, intervals: s.intervals.toLocaleString(), holes: s.holes.toLocaleString() })
  + (s.skipped ? " " + tr("Rows left out (several minerals under one per cent): {skipped}.", { skipped: s.skipped }) : "");

export default function GroupMineralsModal({ customLayers, mnlgy, ids, ctx, onClose }) {
  const [at, setAt] = useState(0); // TASKS.csv #4073 — the step on screen
  const choices = useMemo(() => numericCustomChoices(customLayers), [customLayers]);
  const [sel, setSel] = useState(() => new Set(ids?.length ? ids : choices.map((c) => c.id)));
  const [remove, setRemove] = useState(false);
  const picked = useMemo(() => (customLayers || []).filter((l) => sel.has(l.id)), [customLayers, sel]);
  const hasOld = useMemo(() => (rowsOf(mnlgy) || []).length > 0, [mnlgy]);
  const problems = useMemo(() => groupProblems(picked), [picked]);
  const fresh = useMemo(() => (problems.length ? null : groupMinerals(picked)), [picked, problems]);
  const merged = useMemo(() => (problems.length || !hasOld ? null : groupMinerals(picked, mnlgy)), [picked, problems, hasOld, mnlgy]);
  const problemText = (p) => (p.kind === "few" ? tr("Tick at least two layers.") : p.kind === "empty" ? tr("No intervals to group in: {names}.", { names: p.names.join(", ") }) : tr("Per cent layers only; not in per cent: {units}.", { units: p.units.join(", ") }));
  const apply = (res) => {
    if (!res?.rows?.length) return;
    ctx.undoCheckpoint?.(); // what you did before stays its own step
    ctx.setLayers((p) => ({ ...p, mnlgy: res.rows }));
    ctx.setLayerVisible((p) => ({ ...p, mnlgy: true }));
    for (const l of picked) { if (remove) ctx.removeCustomLayer(l.id); else ctx.setCustomVisible((p) => ({ ...p, [l.id]: false })); }
    ctx.setNotices((p) => [...p, infoNotice(groupedText(res.stats))]);
    setTimeout(() => ctx.undoCheckpoint?.(), 400); // the change closes as one step
    onClose();
  };
  const stat = (r, what) => r && tr("{what}: fields {fields}, intervals {intervals}, holes {holes}.", { what, fields: r.stats.fields, intervals: r.stats.intervals.toLocaleString(), holes: r.stats.holes.toLocaleString() });
  const toggle = (id) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ok = !problems.length && fresh?.rows?.length;
  // TASKS.csv #4073 (Matt: "similar for all pop up windows"; "too wordy … cut, don't just cap") — two steps, one question each: which layers (Layers,
  // with what is wrong with the pick under it), then how they go in (Group: remove or hide them, the preview, and the action). With a Mineralization
  // layer already there the gold primary is Merge and Replace is the secondary beside its own preview, and the line saying Replace swaps the layer stays
  // seen there; with none the primary is Group. What a ticked layer becomes and what Merge does are in the Help card. A press on the backdrop still closes it.
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{tr("Mineralization")}</summary>
      <div style={note}>{tr("Each ticked layer becomes a mineral field, joined by hole and depth.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("Merge adds these minerals to the Mineralization layer; Replace swaps it for them.")}</div>
    </details>
  );
  const steps = [
    { key: "layers", label: tr("Layers"), primary: { label: tr("Next"), disabled: !ok }, render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div data-group-layers style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
          {choices.map((c) => (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>
              <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.label}>{c.label}</span>
              {c.unit && <span style={{ color: "var(--color-text-caption)", fontSize: "var(--font-size-sm)" }}>{c.unit}</span>}
            </label>
          ))}
          {!choices.length && <div style={note}>{tr("No numeric interval layers.")}</div>}
        </div>
        {problems.map((p) => <div key={p.kind} role="alert" style={{ ...note, color: "var(--color-warn-text)" }}>{problemText(p)}</div>)}
        {fresh && !fresh.rows.length && <div style={note}>{tr("No mineral above zero.")}</div>}
      </div>
    ) },
    { key: "group", label: tr("Group"), primary: hasOld ? { label: tr("Merge"), onClick: () => apply(merged), disabled: !ok || !merged?.rows?.length } : { label: tr("Group"), onClick: () => apply(fresh), disabled: !ok }, render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>
          <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />{tr("Remove the layers afterwards (otherwise hidden)")}</label>
        {hasOld && <div style={{ ...note, color: "var(--color-text-secondary)" }}>{tr("Replace swaps the Mineralization layer for these.")}</div>}
        {ok && merged && <div data-group-preview-merge style={note}>{stat(merged, tr("Merge"))}</div>}
        {ok && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div data-group-preview style={{ ...note, flex: 1 }}>{stat(fresh, hasOld ? tr("Replace") : tr("Group"))}</div>
            {hasOld && <button type="button" disabled={!ok} onClick={() => apply(fresh)} className="gs-btn gs-btn--sm">{tr("Replace")}</button>}
          </div>
        )}
      </div>
    ) },
  ];
  const heading = tr("Group as Mineralization…"); // the dialog's name, seen (a JSX title= would count it as a tooltip)
  return <StepDialog title={heading} onClose={onClose} steps={steps} at={at} onAt={setAt} help={help} width="min(520px, 92vw)" overlayProps={backdropProps(onClose)} />;
}
