// TASKS.csv #4022 (Matt, v0.2.8: a way to remove all the units from the Strat. stack) — "Remove all" beside "Add all" (#3999), shown from two units up:
// asked first ('Remove the N units from the stack?'), then the units and their unconformity marks (#1309) go together, and a line under the buttons
// says so with Undo (and, once undone, Redo), as Add all's does: the stack is session state, not in the project's Ctrl+Z history. A pending
// 'Sort by the holes' preview (#3994) goes with the units (it shows only from two units up). Another edit of the stack takes the line away.
import React, { useEffect, useState } from "react";
import { t as tr } from "../../lib/i18n.js";
import { askConfirm } from "../../lib/confirmDialog.js";

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 6 };

// -> { button (beside Add all; null under two units), line (the Undo / Redo line; null when there is nothing to say) }
export function useRemoveAllUnits({ stackUnits, setStackUnits, stackBreaks, setStackBreaks, pBtn }) {
  const [last, setLast] = useState(null); // { units, breaks, removed }
  useEffect(() => { // another edit of the stack: the line would take that back too
    if (last && (last.removed ? stackUnits.length > 0 : !same(last.units, stackUnits))) setLast(null);
  }, [stackUnits, last]);
  const clear = () => { setStackUnits([]); setStackBreaks([]); };
  const remove = async () => {
    const n = stackUnits.length;
    if (!(await askConfirm(tr("Remove the {n} units from the stack? Undo, under the buttons, puts them back.", { n }), { okLabel: tr("Remove all"), destructive: true }))) return;
    setLast({ units: [...stackUnits], breaks: [...(stackBreaks || [])], removed: true });
    clear();
  };
  const small = { ...pBtn, width: "auto", display: "inline-flex", marginBottom: 0, padding: "2px 8px" };
  const button = stackUnits.length >= 2
    ? <button type="button" onClick={remove} style={{ ...pBtn, width: "auto", marginBottom: 0, flex: "0 0 auto" }} data-remove-all="">{tr("Remove all")}</button>
    : null;
  const line = last ? (
    <div role="status" style={note} data-remove-all-line="">
      {last.removed
        ? <><span>{tr("Removed {n} units.", { n: last.units.length })}</span><button type="button" style={small} onClick={() => { setStackUnits([...last.units]); setStackBreaks([...last.breaks]); setLast({ ...last, removed: false }); }}>{tr("Undo")}</button></>
        : <><span>{tr("Put back {n} units.", { n: last.units.length })}</span><button type="button" style={small} onClick={() => { clear(); setLast({ ...last, removed: true }); }}>{tr("Redo")}</button></>}
    </div>
  ) : null;
  return { button, line };
}
