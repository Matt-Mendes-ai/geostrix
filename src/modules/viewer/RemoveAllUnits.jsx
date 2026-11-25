// TASKS.csv #4022 (Matt, v0.2.8: a way to remove all the units from the Strat. stack) — "Remove all" beside "Add all" (#3999), shown from two units up,
// asked first; the units and their unconformity marks (#1309) go together, and a pending 'Sort by the holes' preview (#3994) with them (it shows only
// from two units up). TASKS.csv #4025: the stack is the project's now, so this is one Ctrl+Z step and the in-pane Undo / Redo line went.
import React from "react";
import { t as tr } from "../../lib/i18n.js";
import { askConfirm } from "../../lib/confirmDialog.js";

export default function RemoveAllUnits({ stackUnits, setStackUnits, setStackBreaks, pBtn }) {
  if (stackUnits.length < 2) return null;
  const remove = async () => {
    if (!(await askConfirm(tr("Remove the {n} units from the stack? (Ctrl+Z undoes this.)", { n: stackUnits.length }), { okLabel: tr("Remove all"), destructive: true }))) return;
    setStackUnits([]); setStackBreaks([]); // one render: one step
  };
  return <button type="button" onClick={remove} className="gs-btn gs-btn--block" style={{ width: "auto", marginBottom: 0, flex: "0 0 auto" }} data-remove-all="">{tr("Remove all")}</button>;
}
