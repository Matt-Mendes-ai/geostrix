import React from "react";
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";
import { basisChoices } from "../lib/oxideBasisChange.js";
import { confirmDestructive } from "../lib/confirmDestructive.js";
import { notice } from "../lib/notices.js";

// TASKS.csv #2627 — beside an element: which basis its grades are reported as (Li as Li "%" or as Li2O "% Li2O"). Changing it converts every
// stored number of the element with its unit (store.setElementBasis, one undoable step). Shown only for an element that has an oxide and a
// % / ppm / ppb unit. `surface`: the surface samples' element instead of the drill assays'. onNotice(text): the result, for the module's notices.
export default function ElementBasisSelect({ element, surface = false, onNotice }) {
  const { setElementBasis } = useStore();
  const choices = basisChoices(element);
  if (choices.length < 2) return null;
  const label = (c) => (c.oxide ? tr("as {oxide}", { oxide: c.oxide }) : tr("as {symbol}", { symbol: element.symbol }));
  const change = (unit) => {
    const to = choices.find((c) => c.unit === unit);
    if (!to || unit === element.unit) return;
    const q = tr("Report {symbol} {basis}? Every stored {symbol} value is converted, {from} → {to}. Cut-offs and colour ranges already typed for {symbol} keep their numbers: check them after.", { symbol: element.symbol, basis: label(to), from: element.unit, to: unit });
    if (!confirmDestructive(q, { undoable: true })) return;
    const r = setElementBasis(element.symbol, unit, { surface });
    if (r?.error) { onNotice?.(notice("{symbol} was not converted.", { symbol: element.symbol })); return; }
    const th = r.thresholdsChanged ? " " + tr("{n} threshold rule(s) decided for {symbol} converted with it.", { n: r.thresholdsChanged, symbol: element.symbol }) : "";
    const n = notice("{symbol} is now reported {basis}: {n} row(s) converted from {from} to {to} (× {factor}). Ctrl+Z to undo.", { symbol: element.symbol, basis: label(to), n: r.changed.toLocaleString(), from: r.from, to: r.to, factor: Number(r.factor.toPrecision(5)) });
    onNotice?.(th ? { ...n, text: n.text + th } : n);
  };
  return (
    <select value={element.unit} onChange={(e) => change(e.target.value)} aria-label={tr("{symbol} reported as", { symbol: element.symbol })}
      title={tr("The basis {symbol}'s grades are reported in. Changing it converts every stored value (undoable).", { symbol: element.symbol })}
      style={{ fontSize: "var(--font-size-xs)", padding: "0 2px", border: "1px solid var(--color-border)", borderRadius: 3, background: "var(--color-bg)", color: "var(--color-text-secondary)", fontFamily: "inherit", maxWidth: 90 }}>
      {choices.map((c) => <option key={c.unit} value={c.unit}>{label(c)} ({c.unit})</option>)}
    </select>
  );
}
