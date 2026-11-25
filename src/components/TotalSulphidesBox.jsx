// TASKS.csv #3941 (Matt's first-time test) — the Mineralization layer's Total sulphides, in its sidebar panel: the layer's own codes as a tick
// list (the ones lib/totalSulphides.js knows as sulphides ticked; any can be changed), a button that writes the total on every interval (a field
// like any other: Identify, the Data table, exports), and once it is there: colour by it and show from a lowest total. A layer with codes but
// no per cent says so instead of a total of zeros. The ticks and the two choices are the layer's style (saved with the project's view).
import React, { useMemo } from "react";
import { useStore } from "../lib/store.jsx";
import { mineralCodesOf, defaultSulphideTicks, withTotalSulphides, TOTAL_SULPHIDES_FIELD } from "../lib/totalSulphides.js";
import NumberInput from "./NumberInput.jsx";
import { t as tr } from "../lib/i18n.js";

const box = { marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-divider)", fontSize: "var(--font-size-sm)" };
const chip = (on) => ({ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 10, cursor: "pointer", fontSize: "var(--font-size-xs)", border: `1px solid ${on ? "var(--color-accent)" : "var(--color-border-light)"}`, color: on ? "var(--color-text)" : "var(--color-text-muted)" });

export default function TotalSulphidesBox({ rows, style, onStyle }) {
  const { replaceLayer } = useStore() || {};
  const info = useMemo(() => mineralCodesOf(rows), [rows]);
  const has = useMemo(() => (rows || []).some((r) => r && TOTAL_SULPHIDES_FIELD in r), [rows]);
  const ticked = style?.sulphideCodes || defaultSulphideTicks(info);
  const write = (codes) => {
    const out = withTotalSulphides(rows, codes, info);
    if (out.rows !== rows && replaceLayer) replaceLayer("mnlgy", out.rows);
    return out;
  };
  const toggle = (key) => {
    const next = ticked.includes(key) ? ticked.filter((k) => k !== key) : [...ticked, key];
    onStyle?.({ sulphideCodes: next });
    if (has) write(next);
  };
  if (!info.codes.length) return null;
  const mixed = has ? withTotalSulphides(rows, ticked, info).mixed : 0;
  return (
    <div style={box}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr("Total sulphides")}</div>
      {!info.hasPct ? <div style={{ color: "var(--color-text-muted)" }}>{tr("No percentage column: there is no total to add.")}</div> : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {info.codes.map((c) => (
              <label key={c.key} style={chip(ticked.includes(c.key))} title={c.sulphide ? `${c.sulphide} · ${c.n}` : String(c.n)}>
                <input type="checkbox" checked={ticked.includes(c.key)} onChange={() => toggle(c.key)} style={{ margin: 0 }} />{c.code}
              </label>
            ))}
          </div>
          {!has && <button className="gs-btn gs-btn--sm" type="button" onClick={() => { onStyle?.({ sulphideCodes: ticked }); write(ticked); }} disabled={!ticked.length}>{tr("Add Total sulphides")}</button>}
          {has && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={style?.colourBy === TOTAL_SULPHIDES_FIELD} onChange={(e) => onStyle?.({ colourBy: e.target.checked ? TOTAL_SULPHIDES_FIELD : "value" })} />{tr("Colour by it")}
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {tr("Show from")}<NumberInput value={style?.sulphideMin ?? null} allowEmpty min={0} max={100} onChange={(v) => onStyle?.({ sulphideMin: Number.isFinite(v) && v > 0 ? v : null })} style={{ width: 52 }} aria-label={tr("Show from")} />%
              </label>
            </div>
          )}
          {mixed > 0 && <div style={{ color: "var(--color-text-muted)", marginTop: 4 }}>{tr("{n} row(s) list sulphides with other minerals under one per cent: left out.", { n: mixed })}</div>}
        </>
      )}
    </div>
  );
}
