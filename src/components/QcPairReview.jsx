// TASKS.csv #3549 — QC links, step 2 (option D): the pairs of rows over the same hole and interval in assays that carry no sample ids, listed for the user to confirm one by one (lib/qcPairSuggest.js). Nothing is
// written until a pair is ticked and 'Mark ... as duplicates' is pressed; a pair with identical values is flagged (it may be the same file imported twice).
import React, { useMemo, useState } from "react";
import { suggestPairs, applyPairs } from "../lib/qcPairSuggest.js";
import { valueIn } from "../lib/geochem.js";
import { fmtNum, t as tr } from "../lib/i18n.js";

const SHOWN = 200;
export default function QcPairReview({ assays, symbol, unit, elementUnits, unitLabel, onApply, onClose }) {
  const { pairs, ambiguous } = useMemo(() => suggestPairs(assays), [assays]);
  const [ticked, setTicked] = useState(() => new Set());
  const rows = useMemo(() => pairs.slice(0, SHOWN).map((p) => {
    const v1 = valueIn(assays[p.original], symbol, unit, elementUnits), v2 = valueIn(assays[p.duplicate], symbol, unit, elementUnits);
    return { ...p, v1, v2 };
  }), [pairs, assays, symbol, unit, elementUnits]);
  const toggle = (k) => setTicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const differ = pairs.filter((p) => !p.identical).length;
  const cell = { padding: "2px 8px", textAlign: "start" };
  return (
    <div role="region" aria-label={tr("Repeated intervals")} style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: 10, margin: "8px 0", fontSize: "var(--font-size-sm)" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr("Repeated intervals: which are duplicates?")}</div>
      <div style={{ color: "var(--color-text-secondary)", lineHeight: 1.45, marginBottom: 6 }}>{tr("With no sample ids, two rows over one hole and interval may be a field duplicate and its original, a lab re-assay or a double import. Nothing is marked until you tick it; the earlier row is the original.")}</div>
      {pairs.length === 0 ? <div>{tr("No pair of rows over one hole and interval was found.")}</div> : (
        <>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={cell} /><th style={cell}>{tr("Hole")}</th><th style={cell}>{tr("From–to (m)")}</th><th style={cell}>{tr("{el} ({unit}), original", { el: symbol, unit: unitLabel })}</th><th style={cell}>{tr("{el} ({unit}), repeat", { el: symbol, unit: unitLabel })}</th><th style={cell} /></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.key}>
                    <td style={cell}><input type="checkbox" checked={ticked.has(p.key)} onChange={() => toggle(p.key)} aria-label={tr("Mark {hole} {from}–{to} as a duplicate", { hole: p.hole_id, from: p.from, to: p.to })} /></td>
                    <td style={cell}>{p.hole_id}</td><td style={cell}>{p.from}–{p.to}</td>
                    <td style={cell}>{p.v1 == null ? "—" : fmtNum(p.v1, { maximumSignificantDigits: 4 })}</td><td style={cell}>{p.v2 == null ? "—" : fmtNum(p.v2, { maximumSignificantDigits: 4 })}</td>
                    <td style={{ ...cell, color: "var(--color-warn-text)" }}>{p.identical ? tr("identical values: a double import?") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pairs.length > SHOWN && <div style={{ marginTop: 4 }}>{tr("The first {n} of {all} pairs are listed.", { n: SHOWN, all: fmtNum(pairs.length) })}</div>}
        </>
      )}
      {ambiguous > 0 && <div style={{ marginTop: 4, color: "var(--color-text-secondary)" }}>{tr("{n} rows sit on an interval met three or more times: not suggested (which one is the original?).", { n: fmtNum(ambiguous) })}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {differ > 0 && <button className="gs-btn gs-btn--sm" type="button" onClick={() => setTicked(new Set(pairs.filter((p) => !p.identical).map((p) => p.key)))}>{tr("Tick the {n} pairs whose values differ", { n: fmtNum(differ) })}</button>}
        {ticked.size > 0 && <button className="gs-btn gs-btn--sm" type="button" onClick={() => setTicked(new Set())}>{tr("Untick all")}</button>}
        <button className="gs-btn gs-btn--primary" type="button" disabled={!ticked.size} onClick={() => { const r = applyPairs(assays, pairs.filter((p) => ticked.has(p.key))); onApply(r.rows, r.marked); }}>{tr("Mark {n} as duplicates", { n: fmtNum(ticked.size) })}</button>
        <button className="gs-btn" type="button" onClick={onClose}>{tr("Close")}</button>
      </div>
    </div>
  );
}
