import React, { useMemo, useState } from "react";
import { useVirtualRows } from "../lib/useVirtualRows.js"; // TASKS.csv #1186, #1278
import { X, Download } from "./icons.js";
import { valueIn } from "../lib/geochem.js";
import { saveFile } from "../lib/desktop.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { isoconRows } from "../lib/analysisExports.js"; // TASKS.csv #1083

// TASKS.csv #23 — Isocon / mass-balance calculator (Grant 1986; MacLean & Barrett 1993).
//
// Method: pick a group of intervals to average as the "precursor" (least-altered equivalent) and
// a group to average as the "altered" rock. For elements the user marks immobile, conservation of
// absolute mass means C_altered,i / C_precursor,i should equal a single constant Mo/M (the ratio of
// precursor mass to altered mass for the same reference volume) — that's the isocon slope. Once the
// slope is pinned down from the immobile elements, every other element's mass change follows:
//   %Δmass(i) = 100 * ( (C_altered,i / C_precursor,i) / slope  -  1 )
// This is the standard closed-form equivalent of fitting a graphical isocon line through the origin;
// see Grant (1986) "The isocon diagram — a simple solution to Gresens' equation" and MacLean &
// Barrett (1993) for the VMS-alteration application this is aimed at.
const DEFAULT_IMMOBILE = ["Al", "Ti", "Zr"];

export default function IsoconTool({ assays, assayElements, onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const symbols = assayElements.map((e) => e.symbol);

  const [precursorIds, setPrecursorIds] = useState(new Set());
  const [alteredIds, setAlteredIds] = useState(new Set());
  const [immobile, setImmobile] = useState(new Set(symbols.filter((s) => DEFAULT_IMMOBILE.includes(s))));
  const [filterText, setFilterText] = useState("");

  const rowId = (a, i) => `${a.hole_id}|${a.from}|${a.to}|${i}`;
  const rows = useMemo(() => assays.map((a, i) => ({ a, id: rowId(a, i) })), [assays]);
  const filtered = filterText
    ? rows.filter(({ a }) => a.hole_id.toLowerCase().includes(filterText.toLowerCase()))
    : rows;

  const toggle = (set, setSet, id) => {
    setSet((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  // Average each element (in ppm, via valueIn) across a selected group of intervals.
  const average = (idSet) => {
    const chosen = rows.filter((r) => idSet.has(r.id)).map((r) => r.a);
    if (!chosen.length) return null;
    const out = {};
    symbols.forEach((sym) => {
      const vals = chosen.map((a) => valueIn(a, sym, "ppm", elementUnits)).filter((v) => v != null);
      out[sym] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    });
    return { n: chosen.length, values: out };
  };

  const precursor = useMemo(() => average(precursorIds), [precursorIds, assays, elementUnits]);
  const altered = useMemo(() => average(alteredIds), [alteredIds, assays, elementUnits]);

  const result = useMemo(() => {
    if (!precursor || !altered) return null;
    const immobileList = symbols.filter((s) => immobile.has(s) && precursor.values[s] != null && altered.values[s] != null && precursor.values[s] > 0);
    if (!immobileList.length) return { error: "Pick at least one immobile element that has data in both groups." };
    const ratios = immobileList.map((s) => altered.values[s] / precursor.values[s]);
    const slope = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    // spread across the immobile set is the honesty check — if "immobile" elements disagree a lot,
    // either the pairing is wrong or one of them wasn't actually immobile in this alteration system
    const spread = ratios.length > 1 ? Math.sqrt(ratios.reduce((s, r) => s + (r - slope) ** 2, 0) / ratios.length) / slope : 0;
    const bulkMassChangePct = (1 / slope - 1) * 100;
    const table = symbols
      .filter((s) => precursor.values[s] != null && altered.values[s] != null && precursor.values[s] > 0)
      .map((s) => {
        const ratio = altered.values[s] / precursor.values[s];
        const pct = 100 * (ratio / slope - 1);
        return { symbol: s, precursor: precursor.values[s], altered: altered.values[s], ratio, pct, isImmobile: immobile.has(s) };
      })
      .sort((a, b) => a.pct - b.pct);
    return { slope, spread, bulkMassChangePct, table, immobileList };
  }, [precursor, altered, immobile, symbols]);

  const exportCSV = () => {
    if (!result || result.error) return;
    const csv = toExportCsv(isoconRows(result.table)); // #1083 — rows in lib, tested
    const header = `# Isocon mass-balance — precursor n=${precursor.n}, altered n=${altered.n}, slope(Mo/M)=${result.slope.toFixed(4)}, bulk mass change=${result.bulkMassChangePct.toFixed(1)}%\n`;
    saveFile({ suggestedName: "isocon_mass_balance.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: header + csv });
  };

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Isocon / mass-change calculator")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Grant (1986) isocon method, closed-form via immobile-element ratios (MacLean & Barrett 1993).")}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{tr("Check intervals into a")}{" "}<b style={{ color: "var(--color-success-fg)" }}>{tr("precursor")}</b>{" "}{tr("group (least-altered equivalent of the protolith) and an")}{" "}<b style={{ color: "var(--color-danger-fg)" }}>{tr("altered")}</b>{" "}{tr("group (the rock you want the mass change of). Each group is averaged in ppm. Pick which elements were immobile during alteration — Al, Ti, Zr are reasonable defaults for VMS/epithermal systems, but confirm with an immobile-element plot (e.g. Th/Yb vs Nb/Yb, or the Zr/TiO₂ vs Nb/Y diagram) first if unsure.")}</div>

          <input
            placeholder={tr("Filter by hole ID…")}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{ ...sel, width: "100%" }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <IntervalList title={tr("Precursor")} color="#8fd9ab" rows={filtered} idSet={precursorIds} onToggle={(id) => toggle(precursorIds, setPrecursorIds, id)} n={precursor?.n} />
            <IntervalList title={tr("Altered")} color="#e08a8a" rows={filtered} idSet={alteredIds} onToggle={(id) => toggle(alteredIds, setAlteredIds, id)} n={altered?.n} />
          </div>

          <div>
            <div style={label}>{tr("Immobile elements ({size} selected)", { size: immobile.size })}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {symbols.map((s) => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5, background: immobile.has(s) ? "var(--color-success-bg)" : "var(--color-bg-subtle)", border: `1px solid ${immobile.has(s) ? "var(--color-success-border)" : "var(--color-border)"}`, fontSize: "var(--font-size-base)", color: immobile.has(s) ? "var(--color-success-text)" : "var(--color-text-secondary)", cursor: "pointer" }}>
                  <input type="checkbox" checked={immobile.has(s)} onChange={() => toggle(immobile, setImmobile, s)} style={{ display: "none" }} />
                  {s}
                </label>
              ))}
            </div>
          </div>

          {result?.error && (
            <div style={{ padding: "10px 12px", background: "#241f14", border: "1px solid #4a3d1e", borderRadius: 8, fontSize: "var(--font-size-base)", color: "#d8c080" }}>{result.error}</div>
          )}

          {result && !result.error && (
            <>
              <div style={{ display: "flex", gap: 16, padding: "10px 14px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: "var(--font-size-base)" }}>
                <div><span style={{ color: "var(--color-text-muted)" }}>{tr("Isocon slope (Mo/M):")}</span> <b style={{ color: "var(--color-text)" }}>{result.slope.toFixed(3)}</b></div>
                <div><span style={{ color: "var(--color-text-muted)" }}>{tr("Bulk mass change:")}</span> <b style={{ color: result.bulkMassChangePct >= 0 ? "var(--color-success-fg)" : "var(--color-danger-fg)" }}>{result.bulkMassChangePct >= 0 ? "+" : ""}{result.bulkMassChangePct.toFixed(1)}%</b></div>
                <div><span style={{ color: "var(--color-text-muted)" }}>{tr("Immobile-set agreement:")}</span> <b style={{ color: result.spread < 0.1 ? "var(--color-success-fg)" : "#d8c080" }}>{tr("±{v}% CV", { v: (result.spread * 100).toFixed(0) })}</b></div>
              </div>
              {result.spread >= 0.1 && (
                <div style={{ fontSize: "var(--font-size-sm)", color: "#8a6a3a" }}>{tr("The immobile elements you picked don't agree tightly (ratio spread ≥10%) — one of them may not actually be immobile in this system, or the two groups aren't a real precursor/altered pair. Treat the numbers below cautiously.")}</div>
              )}

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-base)" }}>
                <thead>
                  <tr style={{ color: "var(--color-text-muted)", textAlign: "start" }}>
                    <th style={th}>{tr("Element")}</th><th style={th}>{tr("Precursor (ppm)")}</th><th style={th}>{tr("Altered (ppm)")}</th><th style={th}>{tr("Ratio")}</th><th style={th}>{tr("Mass change")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.table.map((r) => (
                    <tr key={r.symbol} style={{ borderTop: "1px solid #eceef1" }}>
                      <td style={td}>{r.symbol} {r.isImmobile && <span style={{ color: "#5a7290", fontSize: "var(--font-size-xs)" }}>{tr("(immobile)")}</span>}</td>
                      <td style={td}>{r.precursor.toFixed(2)}</td>
                      <td style={td}>{r.altered.toFixed(2)}</td>
                      <td style={td}>{r.ratio.toFixed(3)}</td>
                      <td style={{ ...td, color: r.pct >= 0 ? "var(--color-success-fg)" : "var(--color-danger-fg)" }}>{r.pct >= 0 ? "+" : ""}{r.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button onClick={exportCSV} style={{ ...btn(true), alignSelf: "flex-start", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                <Download size={14} />{" "}{tr("Export mass-balance table (CSV)")}</button>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>{tr("Close")}</button>
        </div>
      </div>
    </div>
  );
}

// TASKS.csv #1186, #1278 — every interval twice as a real checkbox was 7,582 of them on Woodjam: 554 ms to open, 100 ms per tick
const INTERVAL_ROW_H = 24;
function IntervalList({ title, color, rows, idSet, onToggle, n }) {
  const { scrollRef, onScroll, startIndex, endIndex, topPad, bottomPad } = useVirtualRows(rows.length, INTERVAL_ROW_H, { containerHeight: 180 });
  return (
    <div>
      <div style={{ ...label, color, marginBottom: 4 }}>{title} {n ? tr("({n} intervals, avg)", { n }) : ""}</div>
      <div ref={scrollRef} onScroll={onScroll} style={{ height: rows.length ? Math.min(180, rows.length * INTERVAL_ROW_H + 8) : undefined, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 6, padding: 4, boxSizing: "border-box" }}>
        {topPad > 0 && <div style={{ height: topPad }} />}
        {rows.slice(startIndex, endIndex).map(({ a, id }) => (
          <label key={id} style={{ display: "flex", alignItems: "center", gap: 6, height: INTERVAL_ROW_H, boxSizing: "border-box", padding: "0 6px", fontSize: "var(--font-size-sm)", color: idSet.has(id) ? "var(--color-text)" : "var(--color-text-secondary)", cursor: "pointer" }}>
            <input type="checkbox" checked={idSet.has(id)} onChange={() => onToggle(id)} />
            {a.hole_id} {a.from}–{a.to}m
          </label>
        ))}
        {bottomPad > 0 && <div style={{ height: bottomPad }} />}
        {rows.length === 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", padding: 4 }}>{tr("No intervals match.")}</div>}
      </div>
    </div>
  );
}

const panel = { width: "min(760px, 94vw)", maxHeight: "88vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });
const th = { padding: "4px 8px", fontWeight: 500 };
const td = { padding: "4px 8px" };
