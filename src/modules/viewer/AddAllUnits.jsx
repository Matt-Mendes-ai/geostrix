// TASKS.csv #3999 (Matt, v0.2.6, WA zinc-copper) — Strat. stack, "Add all": every modelling code, every logged code, or the logged codes that reach a share of the logged metres, put in the stack
// already in the order the holes give (lib/stackAddAll.js on lib/holesOrder.js), with a preview (TASKS.csv #4025: one Ctrl+Z step; the in-pane Undo went). What the stack does not take stays out and is said in one line; units already in it are
// kept; over GemPy's limit the person chooses a cut-down (the units with the most logged metres) or all of them. The candidates and the stack are the pane's; this draws the choice.
import React, { useState } from "react";
import { t as tr } from "../../lib/i18n.js";
import { chooseUnits, planAddAll, cutOrder, leftOutLine, DEFAULT_MIN_PCT } from "../../lib/stackAddAll.js";
import { GEMPY_MAX_SURFACES } from "../../lib/gempyLimits.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginTop: 4 };
const WHY = { "left out": "left out", "cover / casing": "cover / casing", "no recovery": "no recovery", "cross-cutting": "cross-cutting" };

// candidates: lib/stackAddAll addAllCandidates(...); rows: Lithology; codesOf(unit): the logged values that are that unit; label(unit): the name shown
export default function AddAllUnits({ open, setOpen, stackUnits, setStackUnits, rows, candidates, codesOf, label, pBtn }) {
  const hasModelling = !!candidates?.modelling.length;
  const [mode, setMode] = useState(null); // null: modelling codes when there are any, else the share
  const [minPct, setMinPct] = useState(DEFAULT_MIN_PCT);
  const [cut, setCut] = useState(true); // over the limit: cut down (true) or add all (false)
  const small = { ...pBtn, width: "auto", display: "inline-flex", marginBottom: 0, padding: "2px 8px" };
  const m = mode || (hasModelling ? "modelling" : "share");
  const choice = candidates ? chooseUnits(candidates, m, minPct) : { add: [], rare: [] };
  const plan = candidates ? planAddAll(rows, stackUnits, choice.add, codesOf) : null;
  const final = plan && plan.over && cut ? cutOrder(rows, stackUnits, choice.add, codesOf) : plan;
  const apply = () => { setStackUnits([...final.order]); setOpen(false); };
  const counts = { modelling: candidates?.modelling.length || 0, logged: candidates?.logged.length || 0, share: chooseUnits(candidates || { modelling: [], logged: [], total: 0 }, "share", minPct).add.length };
  const opt = { display: "flex", alignItems: "center", gap: 6, margin: "2px 0" };
  return (
    <div data-add-all="">
      {open && candidates && (
        <div role="group" aria-label={tr("Add all units")} style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", marginBottom: 8, background: "var(--color-bg-subtle)", fontSize: "var(--font-size-xs)", lineHeight: 1.45 }}>
          <label style={opt}><input type="radio" name="add-all-mode" checked={m === "modelling"} disabled={!counts.modelling} onChange={() => setMode("modelling")} />{tr("All modelling codes ({n})", { n: counts.modelling })}</label>
          <label style={opt}><input type="radio" name="add-all-mode" checked={m === "logged"} disabled={!counts.logged} onChange={() => setMode("logged")} />{tr("All logged codes ({n})", { n: counts.logged })}</label>
          <label style={opt}><input type="radio" name="add-all-mode" checked={m === "share"} onChange={() => setMode("share")} />{tr("Logged codes with at least")}
            <input type="number" min="0" max="100" step="0.5" value={minPct} aria-label={tr("Share of the logged metres (%)")} onChange={(e) => { setMode("share"); setMinPct(e.target.value); }} style={{ width: 52 }} />{tr("% of the logged metres ({n})", { n: counts.share })}</label>
          {m === "share" && choice.rare.length > 0 && <div style={note}>{tr("Under {pct} % of the logged metres, left out: {names}.", { pct: minPct, names: choice.rare.slice(0, 8).map((x) => x.label).join(", ") + (choice.rare.length > 8 ? ` (+${choice.rare.length - 8})` : "") })}</div>}
          {leftOutLine(candidates.leftOut).map((l) => <div key={l.why} style={note}>{tr("Not added ({why}): {names}.", { why: tr(WHY[l.why] || l.why), names: l.names.join(", ") + (l.more ? ` (+${l.more})` : "") })}</div>)}
          {!choice.add.length
            ? <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("No code to add with this choice.")}</div>
            : <>
              <div style={{ marginTop: 6 }}>{tr("Order, youngest first: {order}.", { order: final.order.slice(0, 20).map(label).join(", ") + (final.order.length > 20 ? ` (+${final.order.length - 20})` : "") })}</div>
              {plan.over > 0 && (
                <div role="note" style={{ ...note, color: "var(--color-warn-text)" }}>
                  <div>{tr("This is {n} units: GemPy takes at most {max} in one model.", { n: plan.order.length, max: GEMPY_MAX_SURFACES })}</div>
                  <label style={opt}><input type="radio" name="add-all-cut" checked={cut} onChange={() => setCut(true)} />{tr("Cut down to the {max} with the most logged metres", { max: GEMPY_MAX_SURFACES })}</label>
                  <label style={opt}><input type="radio" name="add-all-cut" checked={!cut} onChange={() => setCut(false)} />{tr("Add all {n} (the Layer-cake method has no limit)", { n: plan.order.length })}</label>
                  {cut && <div>{tr("Left out by the cut: {list}.", { list: plan.cut.dropped.slice(0, 8).map((d) => `${d.label} (${Math.round(d.metres)} m)`).join(", ") + (plan.cut.dropped.length > 8 ? ` (+${plan.cut.dropped.length - 8})` : "") })}</div>}
                </div>
              )}
            </>}
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {choice.add.length > 0 && <button type="button" style={{ ...small, fontWeight: 600 }} onClick={apply}>{tr("Add {n} units", { n: final.added.length })}</button>}
            <button type="button" style={small} onClick={() => setOpen(false)}>{tr("Cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
