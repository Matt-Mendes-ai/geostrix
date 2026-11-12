import React, { useMemo, useState } from "react";
import { isBelowDetection } from "../lib/assayFlags.js"; // TASKS.csv #2505
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
import { useStore } from "../lib/store.jsx"; // TASKS.csv #1521 — the logs, for "add by filter"
import { labAssays } from "../lib/qaqc.js"; // TASKS.csv #2348 — lab grades only (#1673)
import { sharedImmobile, groupMeans, MIN_GROUP_N } from "../lib/isoconGroups.js"; // TASKS.csv #2348
import { domainLayerChoices, domainOfInterval } from "../lib/domainLayers.js"; // #1521
import { holesMatching } from "../lib/holeFilter.js"; // #1521
import { LAYER_META } from "../lib/layers.js"; // #1521
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
const USUAL_IMMOBILE = ["Al", "Ti", "Zr", "Nb", "Y", "Hf", "Th"]; // #2197 — the elements usually taken as immobile

export default function IsoconTool({ assays: assaysIn, assayElements, onClose }) {
  const assays = useMemo(() => labAssays(assaysIn), [assaysIn]), pxrfLeft = (assaysIn || []).length - assays.length; // #2348 — as Correlation / Grade stats
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const symbols = assayElements.map((e) => e.symbol);
  // TASKS.csv #1521 (review #1497, Lawyers) — a calculated element (an alteration index, a metal equivalent) is not a concentration: it
  // stays out of the immobile list and the mass-balance table, and is named under the table
  const calcSymbols = useMemo(() => assayElements.filter((e) => e.calculated).map((e) => e.symbol), [assayElements]);
  const concSymbols = useMemo(() => assayElements.filter((e) => !e.calculated).map((e) => e.symbol), [assayElements]);

  const [precursorIds, setPrecursorIds] = useState(new Set());
  const [alteredIds, setAlteredIds] = useState(new Set());
  const [immobile, setImmobile] = useState(new Set(concSymbols.filter((s) => DEFAULT_IMMOBILE.includes(s))));
  const [filterText, setFilterText] = useState("");

  const rowId = (a, i) => `${a.hole_id}|${a.from}|${a.to}|${i}`;
  const rows = useMemo(() => assays.map((a, i) => ({ a, id: rowId(a, i) })), [assays]);
  const filtered = filterText
    ? rows.filter(({ a }) => a.hole_id.toLowerCase().includes(filterText.toLowerCase()))
    : rows;

  const toggle = (set, setSet, id) => {
    setSet((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  // TASKS.csv #1521 — a group built by a filter instead of one tick at a time (83,670 rows on Lawyers): a log code at the interval's
  // midpoint (lithology, alteration, a custom layer), an element or index range, holes and a depth range; the matches are added to a group
  const { layers = {}, customLayers = [] } = useStore();
  const [flt, setFlt] = useState({ layer: "", code: "", layer2: "", code2: "", sym: "", min: "", max: "", holes: "", from: "", to: "" }); // layer2 / code2: #2514
  const domainChoices = useMemo(() => domainLayerChoices(layers, customLayers, (k) => tr(LAYER_META[k]?.label || k)), [layers, customLayers]);
  const domainRows = useMemo(() => domainChoices.find((c) => c.key === flt.layer)?.rows || null, [domainChoices, flt.layer]);
  const codes = useMemo(() => (domainRows ? [...new Set(domainRows.map((r) => String(r.value ?? "")).filter(Boolean))].sort() : []), [domainRows]);
  // TASKS.csv #2514 (review #2486) — a second log condition, joined by AND: 'fresh pegmatite' (rock = P and weathering = FR) against
  // 'weathered pegmatite' (rock = P and weathering = W) could not be built with one layer
  const domainRows2 = useMemo(() => domainChoices.find((c) => c.key === flt.layer2)?.rows || null, [domainChoices, flt.layer2]);
  const codes2 = useMemo(() => (domainRows2 ? [...new Set(domainRows2.map((r) => String(r.value ?? "")).filter(Boolean))].sort() : []), [domainRows2]);
  const matchIds = useMemo(() => {
    const active = flt.code || flt.code2 || flt.sym || flt.holes.trim() || flt.from !== "" || flt.to !== "";
    if (!active) return [];
    const codeOf = flt.code && domainRows ? domainOfInterval(domainRows) : null;
    const codeOf2 = flt.code2 && domainRows2 ? domainOfInterval(domainRows2) : null; // #2514
    const lo = flt.min === "" ? -Infinity : Number(flt.min), hi = flt.max === "" ? Infinity : Number(flt.max);
    const d0 = flt.from === "" ? -Infinity : Number(flt.from), d1 = flt.to === "" ? Infinity : Number(flt.to);
    const holeOk = flt.holes.trim() ? new Set(holesMatching([...new Set(rows.map((r) => r.a.hole_id))], flt.holes)) : null;
    return rows.filter(({ a }) => {
      if (holeOk && !holeOk.has(a.hole_id)) return false;
      const mid = (Number(a.from) + Number(a.to)) / 2;
      if (Number.isFinite(mid) ? mid < d0 || mid > d1 : d0 !== -Infinity || d1 !== Infinity) return false;
      if (codeOf && codeOf(a) !== flt.code) return false;
      if (codeOf2 && codeOf2(a) !== flt.code2) return false; // #2514 — and the second log
      if (flt.sym) { const v = valueIn(a, flt.sym, elementUnits[flt.sym] || "ppm", elementUnits); if (v == null || !Number.isFinite(v) || v < lo || v > hi) return false; }
      return true;
    }).map((r) => r.id);
  }, [rows, flt, domainRows, domainRows2, elementUnits]);
  const addMatches = (setSet) => setSet((prev) => new Set([...prev, ...matchIds]));

  // Average each element (in ppm, via valueIn) across a selected group of intervals. #2348 — by default over the samples that carry every
  // immobile element both groups have (one set of samples for the whole mass balance), each mean with its n
  const valueOf = (a, sym) => valueIn(a, sym, "ppm", elementUnits);
  const [commonOnly, setCommonOnly] = useState(true);
  const groupRows = (idSet) => rows.filter((r) => idSet.has(r.id)).map((r) => r.a);
  const imm = useMemo(() => sharedImmobile(groupRows(precursorIds), groupRows(alteredIds), [...immobile], valueOf), [precursorIds, alteredIds, immobile, assays, elementUnits]);
  const means = (idSet) => {
    const chosen = groupRows(idSet);
    const strict = commonOnly && imm.shared.length ? groupMeans(chosen, symbols, valueOf, imm.shared, isBelowDetection) : null;
    return strict && strict.used > 0 ? { ...strict, restricted: true } : groupMeans(chosen, symbols, valueOf, [], isBelowDetection); // #2505
  };
  const precursor = useMemo(() => means(precursorIds), [precursorIds, assays, elementUnits, commonOnly, imm]);
  const altered = useMemo(() => means(alteredIds), [alteredIds, assays, elementUnits, commonOnly, imm]);

  const result = useMemo(() => {
    if (!precursor || !altered) return null;
    const immobileList = concSymbols.filter((s) => immobile.has(s) && precursor.values[s] != null && altered.values[s] != null && precursor.values[s] > 0);
    if (!immobileList.length) return { error: "Pick at least one immobile element that has data in both groups." };
    const ratios = immobileList.map((s) => altered.values[s] / precursor.values[s]);
    const slope = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    // spread across the immobile set is the honesty check — if "immobile" elements disagree a lot,
    // either the pairing is wrong or one of them wasn't actually immobile in this alteration system
    const spread = ratios.length > 1 ? Math.sqrt(ratios.reduce((s, r) => s + (r - slope) ** 2, 0) / ratios.length) / slope : 0;
    const bulkMassChangePct = (1 / slope - 1) * 100;
    const table = concSymbols // #1521 — no mass change for an index
      .filter((s) => precursor.values[s] != null && altered.values[s] != null && precursor.values[s] > 0)
      .map((s) => {
        const ratio = altered.values[s] / precursor.values[s];
        const pct = 100 * (ratio / slope - 1);
        return { symbol: s, precursor: precursor.values[s], altered: altered.values[s], ratio, pct, isImmobile: immobile.has(s), precursorN: precursor.ns[s], alteredN: altered.ns[s], precursorLt: precursor.lts?.[s] || 0, alteredLt: altered.lts?.[s] || 0 }; // n: #2348; lt: #2505
      })
      .sort((a, b) => a.pct - b.pct);
    return { slope, spread, bulkMassChangePct, table, immobileList };
  }, [precursor, altered, immobile, concSymbols]);

  const exportCSV = () => {
    if (!result || result.error) return;
    const csv = toExportCsv(isoconRows(result.table)); // #1083 — rows in lib, tested
    const header = `# Isocon mass-balance — precursor n=${precursor.n}, altered n=${altered.n}, slope(Mo/M)=${result.slope.toFixed(4)}, bulk mass change=${result.bulkMassChangePct.toFixed(1)}%\n`;
    saveFile({ suggestedName: "isocon_mass_balance.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: header + csv });
  };

  // TASKS.csv #2197 (review #2174, WA gold) — with gold the only element the dialog opened normally, listed every interval and offered Au as
  // 'immobile', and only said it could not run once both groups were filled. Isocon needs a suite with an immobile element: said at once.
  const immobileKnown = concSymbols.filter((s) => USUAL_IMMOBILE.includes(s));
  if (concSymbols.length < 2) {
    return (
      <div style={overlay} {...backdropProps(onClose)}>
        <div style={{ ...panel, width: 460 }} role="dialog" aria-modal="true" aria-label={tr("Isocon / mass-change calculator")} onClick={(e) => e.stopPropagation()}>
          <div style={header}>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Isocon / mass-change calculator")}</div>
            <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
          </div>
          <div role="note" style={{ padding: 16, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{tr("Isocon compares a multi-element suite between a precursor and an altered rock, anchored on an element that stayed put (Al, Ti, Zr, Nb or Y). This project's assays have {list} only, so there is nothing to calculate.", { list: concSymbols.join(", ") || "—" })}</div>
        </div>
      </div>
    );
  }
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
          {!immobileKnown.length && <div role="note" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)" }}>{tr("None of Al, Ti, Zr, Nb or Y is in this project's assays. Isocon rests on an element that stayed put: pick one you know was immobile here, or the result means little.")}</div>}{/* #2197 */}
          <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{tr("Check intervals into a")}{" "}<b style={{ color: "var(--color-success-fg)" }}>{tr("precursor")}</b>{" "}{tr("group (least-altered equivalent of the protolith) and an")}{" "}<b style={{ color: "var(--color-danger-fg)" }}>{tr("altered")}</b>{" "}{tr("group (the rock you want the mass change of). Each group is averaged in ppm. Pick which elements were immobile during alteration — Al, Ti, Zr are reasonable first choices for many hydrothermal systems, but confirm with an immobile-element plot (e.g. Th/Yb vs Nb/Yb, or the Zr/TiO₂ vs Nb/Y diagram) first if unsure.")}</div>

          <input
            placeholder={tr("Filter by hole ID…")}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{ ...sel, width: "100%" }}
          />

          <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>{/* TASKS.csv #1521 */}
            <div style={label}>{tr("Add intervals by filter")}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: "var(--font-size-sm)" }}>
              <select value={flt.layer} onChange={(e) => setFlt((f) => ({ ...f, layer: e.target.value, code: "" }))} style={sel} aria-label={tr("Layer")} title={tr("The log whose code at the interval's midpoint must match")}>
                <option value="">{tr("— any layer —")}</option>{domainChoices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              {flt.layer && <select value={flt.code} onChange={(e) => setFlt((f) => ({ ...f, code: e.target.value }))} style={sel} aria-label={tr("Code")}><option value="">{tr("— any code —")}</option>{codes.map((v) => <option key={v} value={v}>{v}</option>)}</select>}
              {flt.code && <>{/* #2514 — and a second log */}<span style={{ color: "var(--color-text-muted)" }}>{tr("and")}</span>
                <select value={flt.layer2} onChange={(e) => setFlt((f) => ({ ...f, layer2: e.target.value, code2: "" }))} style={sel} aria-label={tr("Second layer")} title={tr("A second log whose code must match too, e.g. the weathering of the same rock")}>
                  <option value="">{tr("— any layer —")}</option>{domainChoices.filter((c) => c.key !== flt.layer).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                {flt.layer2 && <select value={flt.code2} onChange={(e) => setFlt((f) => ({ ...f, code2: e.target.value }))} style={sel} aria-label={tr("Second code")}><option value="">{tr("— any code —")}</option>{codes2.map((v) => <option key={v} value={v}>{v}</option>)}</select>}</>}
              <select value={flt.sym} onChange={(e) => setFlt((f) => ({ ...f, sym: e.target.value }))} style={sel} aria-label={tr("Element")} title={tr("An element or index whose value must lie in the range")}>
                <option value="">{tr("— any element —")}</option>{symbols.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {flt.sym && <><input type="number" step="any" placeholder={tr("min")} value={flt.min} onChange={(e) => setFlt((f) => ({ ...f, min: e.target.value }))} style={{ ...sel, width: 80 }} aria-label={tr("Minimum")} /><input type="number" step="any" placeholder={tr("max")} value={flt.max} onChange={(e) => setFlt((f) => ({ ...f, max: e.target.value }))} style={{ ...sel, width: 80 }} aria-label={tr("Maximum")} /><span style={{ color: "var(--color-text-muted)" }}>{elementUnits[flt.sym] || "ppm"}</span></>}
              <input placeholder={tr("Holes (PS-26, GS-21)")} value={flt.holes} onChange={(e) => setFlt((f) => ({ ...f, holes: e.target.value }))} style={{ ...sel, width: 140 }} aria-label={tr("Holes")} />
              <input type="number" step="any" placeholder={tr("from m")} value={flt.from} onChange={(e) => setFlt((f) => ({ ...f, from: e.target.value }))} style={{ ...sel, width: 80 }} aria-label={tr("Depth from (m)")} />
              <input type="number" step="any" placeholder={tr("to m")} value={flt.to} onChange={(e) => setFlt((f) => ({ ...f, to: e.target.value }))} style={{ ...sel, width: 80 }} aria-label={tr("Depth to (m)")} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
              <span>{tr("{n} intervals match", { n: matchIds.length.toLocaleString() })}</span>
              <button disabled={!matchIds.length} onClick={() => addMatches(setPrecursorIds)} style={{ ...sel, cursor: "pointer" }}>{tr("Add to precursor")}</button>
              <button disabled={!matchIds.length} onClick={() => addMatches(setAlteredIds)} style={{ ...sel, cursor: "pointer" }}>{tr("Add to altered")}</button>
              <button disabled={!precursorIds.size} onClick={() => setPrecursorIds(new Set())} style={{ ...sel, cursor: "pointer" }}>{tr("Clear precursor")}</button>
              <button disabled={!alteredIds.size} onClick={() => setAlteredIds(new Set())} style={{ ...sel, cursor: "pointer" }}>{tr("Clear altered")}</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <IntervalList title={tr("Precursor")} color="#8fd9ab" rows={filtered} idSet={precursorIds} onToggle={(id) => toggle(precursorIds, setPrecursorIds, id)} n={precursor?.n} />
            <IntervalList title={tr("Altered")} color="#e08a8a" rows={filtered} idSet={alteredIds} onToggle={(id) => toggle(alteredIds, setAlteredIds, id)} n={altered?.n} />
          </div>

          <div>
            <div style={label}>{tr("Immobile elements ({size} selected)", { size: immobile.size })}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {concSymbols.map((s) => (
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

              {/* TASKS.csv #2348 — which samples the means come from */}
              {pxrfLeft > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("{n} pXRF reading(s) left out: the grades here come from lab assays only.", { n: pxrfLeft.toLocaleString() })}</div>}
              <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: "var(--font-size-sm)" }}><input type="checkbox" checked={commonOnly} onChange={(e) => setCommonOnly(e.target.checked)} />{tr("Only samples with every immobile element")}</label>
              {precursor.restricted && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Means over the samples that carry {list}: {a} of {b} precursor and {c} of {d} altered samples. Each mean shows its n; under {m} it is greyed.", { list: imm.shared.join(", "), a: precursor.used.toLocaleString(), b: precursor.n.toLocaleString(), c: altered.used.toLocaleString(), d: altered.n.toLocaleString(), m: MIN_GROUP_N })}</div>}
              {commonOnly && imm.shared.length > 0 && !precursor.restricted && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)" }}>{tr("No sample of a group carries every immobile element: each element is averaged over the samples that have it (see each n).")}</div>}
              {imm.missing.map((m) => <div key={m.symbol} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)" }}>{m.group === "both" ? tr("{s}: no value in either group, left out of the immobile set.", { s: m.symbol }) : m.group === "precursor" ? tr("{s}: no value in the precursor group, left out of the immobile set.", { s: m.symbol }) : tr("{s}: no value in the altered group, left out of the immobile set.", { s: m.symbol })}</div>)}
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
                      <td style={{ ...td, ...(r.precursorN < MIN_GROUP_N ? { color: "var(--color-text-muted)" } : {}) }}>{r.precursor.toFixed(2)} <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>n {r.precursorN}{r.precursorLt ? `, ${tr("{n} <DL", { n: r.precursorLt })}` : ""}</span></td>
                      <td style={{ ...td, ...(r.alteredN < MIN_GROUP_N ? { color: "var(--color-text-muted)" } : {}) }}>{r.altered.toFixed(2)} <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>n {r.alteredN}{r.alteredLt ? `, ${tr("{n} <DL", { n: r.alteredLt })}` : ""}</span></td>
                      <td style={td}>{r.ratio.toFixed(3)}</td>
                      <td style={{ ...td, color: r.pct >= 0 ? "var(--color-success-fg)" : "var(--color-danger-fg)" }}>{r.pct >= 0 ? "+" : ""}{r.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {calcSymbols.length > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Left out of the mass balance (calculated indices and equivalents, not concentrations): {list}", { list: calcSymbols.join(", ") })}</div>}{/* #1521 */}

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
