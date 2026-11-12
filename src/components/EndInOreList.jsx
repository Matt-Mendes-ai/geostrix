// TASKS.csv #2965 (review #2876, WA iron) — which holes stopped in ore: the next program on a drilled-out field deepens them, and nothing in
// Targeting listed them (6 of the 6,031 assayed holes there end with their last Fe sample at or above 55 %, 5 of them at total depth). The
// holes whose last sample of an element is at or above a typed cut-off (none is chosen for you), the highest first, each with 'Plan a deeper
// hole here' (Planned holes opens with the end of that sample as the target; deepen it there).
import React, { useMemo, useState } from "react";
import { holesEndingAbove } from "../lib/evidenceSources.js";
import { checkableHoleLengths } from "../lib/dataQC.js";
import { valueIn } from "../lib/geochem.js";
import { t as tr } from "../lib/i18n.js";

const SHOWN = 12;

export default function EndInOreList({ assays, elements, units, traces, collars, survey, onPlanTo, sel, pBtn, note }) {
  const [symbol, setSymbol] = useState(elements?.[0]?.symbol || "");
  const [cut, setCut] = useState("");
  const lengths = useMemo(() => checkableHoleLengths(collars, survey), [collars, survey]);
  const c = cut === "" ? NaN : Number(cut);
  const list = useMemo(() => {
    if (!symbol || !Number.isFinite(c)) return null;
    const u = units?.[symbol] || "ppm";
    return holesEndingAbove(assays, (a) => valueIn(a, symbol, u, units), c, traces, (h) => lengths.get(h)?.length ?? null);
  }, [symbol, c, assays, units, traces, lengths]);
  const u = units?.[symbol] || "ppm";
  const num = (v) => String(Number(Number(v).toPrecision(4)));
  return (
    <details style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: 6 }}>
      <summary style={{ cursor: "pointer", color: "var(--color-text-secondary)" }}>{tr("Holes that stopped in ore")}</summary>
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={sel} aria-label={tr("Element")}>{(elements || []).map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol} ({e.unit})</option>)}</select>
        {tr("last sample ≥")}<input type="number" step="any" value={cut} onChange={(e) => setCut(e.target.value)} style={{ ...sel, width: 70 }} aria-label={tr("Cut-off of the last sample")} />
      </div>
      {list == null ? <div style={note}>{tr("Type a cut-off: the holes whose last sample of the element is at or above it are listed.")}</div>
        : !list.length ? <div style={note}>{tr("No hole ends with its last {el} sample at or above {c} {u}.", { el: symbol, c: num(c), u })}</div>
        : <>
          <div style={note}>{tr("{n} hole(s) end with their last {el} sample at or above {c} {u}; {k} of them at the hole's length.", { n: list.length, el: symbol, c: num(c), u, k: list.filter((h) => h.atEnd).length })}</div>
          {list.slice(0, SHOWN).map((h) => (
            <div key={h.hole_id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--font-size-sm)" }}>
              <span style={{ flex: 1, minWidth: 0 }}>{h.length != null
                ? tr("{hole}: {v} {u} {el} at {a}–{b} m, of {l} m", { hole: h.hole_id, v: num(h.value), u, el: symbol, a: num(h.from), b: num(h.to), l: num(h.length) })
                : tr("{hole}: {v} {u} {el} at {a}–{b} m", { hole: h.hole_id, v: num(h.value), u, el: symbol, a: num(h.from), b: num(h.to) })}</span>
              {onPlanTo && <button type="button" style={{ ...pBtn, padding: "2px 7px", flexShrink: 0, width: "auto", marginBottom: 0 }} onClick={() => onPlanTo({ x: h.x, y: h.y, z: h.z })} title={tr("Opens Planned holes with the end of this sample as the target (RL {z} m): deepen the target there.", { z: Math.round(h.z) })}>{tr("Plan a deeper hole here")}</button>}
            </div>))}
          {list.length > SHOWN && <div style={note}>{tr("{n} more.", { n: list.length - SHOWN })}</div>}
        </>}
    </details>
  );
}
