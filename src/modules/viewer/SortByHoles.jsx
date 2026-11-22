// TASKS.csv #3994 (Matt, v0.2.6, Century) — "Sort by the holes" above the stratigraphic stack's list, at any time (the run's own question offers it too): a preview of the moves
// (lib/holesOrder.js: the fewest moves, units the holes never show together keep their place, contradictions listed and not forced), then Apply, then Undo. A marked unconformity is kept by its
// unit, so it goes with it. The plan is the parent's (computed from the logs and the stack); this only draws it and sets the order.
import React, { useEffect, useState } from "react";
import { t as tr } from "../../lib/i18n.js";
import { movesText } from "../../lib/holesOrder.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginTop: 4 };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// plan: holesOrderPlan(...) of the stack as it is now; label(unit) -> the name shown; setStackUnits(order); pBtn: the pane's button style
export function contradictionText(c, label) {
  return c.kind === "loop"
    ? tr("{units}: each pair is clear in the holes, but together they go round in a circle", { units: [...new Set(c.units)].map(label).join(", ") })
    : tr("{a} / {b}: {x} holes one way, {y} the other", { a: label(c.units[0]), b: label(c.units[1]), x: c.aAbove, y: c.bAbove });
}

export default function SortByHoles({ stackUnits, plan, label, setStackUnits, pBtn }) {
  const [preview, setPreview] = useState(false);
  const [undo, setUndo] = useState(null); // { before, after }: the order before the last sort, and the one it made
  useEffect(() => { if (undo && !same(undo.after, stackUnits)) setUndo(null); }, [stackUnits, undo]); // another edit of the list: Undo would take that back too
  useEffect(() => { if (stackUnits.length < 2) setPreview(false); }, [stackUnits.length]);
  if (stackUnits.length < 2) return null;
  const apply = () => { setUndo({ before: [...stackUnits], after: [...plan.order] }); setStackUnits([...plan.order]); setPreview(false); };
  const small = { ...pBtn, width: "auto", display: "inline-flex", marginBottom: 0, padding: "2px 8px" };
  const open = !!plan && preview;
  return (
    <div data-sort-by-holes="" style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <button type="button" style={small} onClick={() => setPreview((v) => !v)} aria-expanded={open}
          title={tr("Put the units in the order the holes log them, youngest first, changing as little as it can. You see the moves before anything changes.")}>{tr("Sort by the holes")}</button>
        {undo && <><span style={{ ...note, marginTop: 0 }}>{tr("Sorted by the holes.")}</span><button type="button" style={small} onClick={() => { setStackUnits(undo.before); setUndo(null); }}>{tr("Undo")}</button></>}
      </div>
      {open && (
        <div role="group" aria-label={tr("Sort by the holes")} style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", marginTop: 6, background: "var(--color-bg-subtle)", fontSize: "var(--font-size-xs)", lineHeight: 1.45 }}>
          {plan.same
            ? <div>{tr("The holes give no reason to move a unit: the order already follows them where they speak.")}</div>
            : <div>{tr("Moves: {moves}.", { moves: movesText(plan, label, { up: (u, n) => tr("{unit} up {n}", { unit: u, n }), down: (u, n) => tr("{unit} down {n}", { unit: u, n }), more: (n) => tr("and {n} more", { n }) }).join(", ") })}</div>}
          {plan.kept.length > 0 && <div style={note}>{plan.kept.length === 1
            ? tr("{n} unit stays where it is: the holes do not show it with another unit in three or more holes.", { n: plan.kept.length })
            : tr("{n} units stay where they are: the holes do not show them with another unit in three or more holes.", { n: plan.kept.length })}</div>}
          {plan.contradictions.length > 0 && <div role="note" style={{ ...note, color: "var(--color-warn-text)" }}>{tr("Not settled by the holes (kept as you set them): {list}.", { list: plan.contradictions.slice(0, 4).map((c) => contradictionText(c, label)).join("; ") })}</div>}
          {!plan.same && <div style={note}>{tr("A marked unconformity goes with its unit.")}</div>}
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {!plan.same && <button type="button" style={{ ...small, fontWeight: 600 }} onClick={apply}>{tr("Apply")}</button>}
            <button type="button" style={small} onClick={() => setPreview(false)}>{plan.same ? tr("Close") : tr("Cancel")}</button>
          </div>
        </div>
      )}
      {!open && plan && plan.contradictions.length > 0 && <div role="note" style={{ ...note, color: "var(--color-warn-text)" }}>{tr("Not settled by the holes (kept as you set them): {list}.", { list: plan.contradictions.slice(0, 4).map((c) => contradictionText(c, label)).join("; ") })}</div>}
    </div>
  );
}
