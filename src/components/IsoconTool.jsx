import React, { useMemo, useState } from "react";
import { X, Download } from "lucide-react";
import { valueIn } from "../lib/geochem.js";
import { saveFile } from "../lib/desktop.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import Papa from "papaparse";
import { overlay } from "../lib/modalStyles.js";

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
    const csv = Papa.unparse(result.table.map((r) => ({
      element: r.symbol, precursor_ppm: r.precursor.toFixed(3), altered_ppm: r.altered.toFixed(3),
      ratio_altered_precursor: r.ratio.toFixed(4), mass_change_pct: r.pct.toFixed(1), used_as_immobile: r.isImmobile ? "yes" : "no",
    })));
    const header = `# Isocon mass-balance — precursor n=${precursor.n}, altered n=${altered.n}, slope(Mo/M)=${result.slope.toFixed(4)}, bulk mass change=${result.bulkMassChangePct.toFixed(1)}%\n`;
    saveFile({ suggestedName: "isocon_mass_balance.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: header + csv });
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Isocon / mass-change calculator</div>
            <div style={{ fontSize: 11, color: "#94a1b0", marginTop: 2 }}>Grant (1986) isocon method, closed-form via immobile-element ratios (MacLean &amp; Barrett 1993).</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 11.5, color: "#55606e", lineHeight: 1.5 }}>
            Check intervals into a <b style={{ color: "#8fd9ab" }}>precursor</b> group (least-altered equivalent of the protolith) and an <b style={{ color: "#e08a8a" }}>altered</b> group (the rock you want the mass change of). Each group is averaged in ppm. Pick which elements were immobile during alteration — Al, Ti, Zr are reasonable defaults for VMS/epithermal systems, but confirm with an immobile-element plot (e.g. Th/Yb vs Nb/Yb, or the Zr/TiO₂ vs Nb/Y diagram) first if unsure.
          </div>

          <input
            placeholder="Filter by hole ID…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{ ...sel, width: "100%" }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <IntervalList title="Precursor" color="#8fd9ab" rows={filtered} idSet={precursorIds} onToggle={(id) => toggle(precursorIds, setPrecursorIds, id)} n={precursor?.n} />
            <IntervalList title="Altered" color="#e08a8a" rows={filtered} idSet={alteredIds} onToggle={(id) => toggle(alteredIds, setAlteredIds, id)} n={altered?.n} />
          </div>

          <div>
            <div style={label}>Immobile elements ({immobile.size} selected)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {symbols.map((s) => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5, background: immobile.has(s) ? "#1e3629" : "#f4f5f7", border: `1px solid ${immobile.has(s) ? "#3d6b52" : "#d9dce1"}`, fontSize: 11.5, color: immobile.has(s) ? "#8fd9ab" : "#55606e", cursor: "pointer" }}>
                  <input type="checkbox" checked={immobile.has(s)} onChange={() => toggle(immobile, setImmobile, s)} style={{ display: "none" }} />
                  {s}
                </label>
              ))}
            </div>
          </div>

          {result?.error && (
            <div style={{ padding: "10px 12px", background: "#241f14", border: "1px solid #4a3d1e", borderRadius: 8, fontSize: 12, color: "#d8c080" }}>{result.error}</div>
          )}

          {result && !result.error && (
            <>
              <div style={{ display: "flex", gap: 16, padding: "10px 14px", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 8, fontSize: 12.5 }}>
                <div><span style={{ color: "#94a1b0" }}>Isocon slope (Mo/M):</span> <b style={{ color: "#1a2028" }}>{result.slope.toFixed(3)}</b></div>
                <div><span style={{ color: "#94a1b0" }}>Bulk mass change:</span> <b style={{ color: result.bulkMassChangePct >= 0 ? "#8fd9ab" : "#e08a8a" }}>{result.bulkMassChangePct >= 0 ? "+" : ""}{result.bulkMassChangePct.toFixed(1)}%</b></div>
                <div><span style={{ color: "#94a1b0" }}>Immobile-set agreement:</span> <b style={{ color: result.spread < 0.1 ? "#8fd9ab" : "#d8c080" }}>±{(result.spread * 100).toFixed(0)}% CV</b></div>
              </div>
              {result.spread >= 0.1 && (
                <div style={{ fontSize: 10.5, color: "#8a6a3a" }}>The immobile elements you picked don't agree tightly (ratio spread ≥10%) — one of them may not actually be immobile in this system, or the two groups aren't a real precursor/altered pair. Treat the numbers below cautiously.</div>
              )}

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                <thead>
                  <tr style={{ color: "#94a1b0", textAlign: "left" }}>
                    <th style={th}>Element</th><th style={th}>Precursor (ppm)</th><th style={th}>Altered (ppm)</th><th style={th}>Ratio</th><th style={th}>Mass change</th>
                  </tr>
                </thead>
                <tbody>
                  {result.table.map((r) => (
                    <tr key={r.symbol} style={{ borderTop: "1px solid #eceef1" }}>
                      <td style={td}>{r.symbol} {r.isImmobile && <span style={{ color: "#5a7290", fontSize: 9.5 }}>(immobile)</span>}</td>
                      <td style={td}>{r.precursor.toFixed(2)}</td>
                      <td style={td}>{r.altered.toFixed(2)}</td>
                      <td style={td}>{r.ratio.toFixed(3)}</td>
                      <td style={{ ...td, color: r.pct >= 0 ? "#8fd9ab" : "#e08a8a" }}>{r.pct >= 0 ? "+" : ""}{r.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button onClick={exportCSV} style={{ ...btn(true), alignSelf: "flex-start", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                <Download size={13} /> Export mass-balance table (CSV)
              </button>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

function IntervalList({ title, color, rows, idSet, onToggle, n }) {
  return (
    <div>
      <div style={{ ...label, color, marginBottom: 4 }}>{title} {n ? `(${n} intervals, avg)` : ""}</div>
      <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #d9dce1", borderRadius: 6, padding: 4 }}>
        {rows.map(({ a, id }) => (
          <label key={id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", fontSize: 11, color: idSet.has(id) ? "#1a2028" : "#55606e", cursor: "pointer" }}>
            <input type="checkbox" checked={idSet.has(id)} onChange={() => onToggle(id)} />
            {a.hole_id} {a.from}–{a.to}m
          </label>
        ))}
        {rows.length === 0 && <div style={{ fontSize: 11, color: "#94a1b0", padding: 4 }}>No intervals match.</div>}
      </div>
    </div>
  );
}

const panel = { width: "min(760px, 94vw)", maxHeight: "88vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const label = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0", marginBottom: 8 };
const sel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
const th = { padding: "4px 8px", fontWeight: 500 };
const td = { padding: "4px 8px" };
