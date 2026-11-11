import React, { useMemo, useRef, useState } from "react";
import { drillThresholdOffers } from "../lib/thresholds.js"; // TASKS.csv #2347
import { X, Download, Sheet } from "./icons.js";
import { preferredElement, rememberElement } from "../lib/preferredElement.js"; // TASKS.csv #1678
import { useLeadCommodity } from "../lib/useLeadCommodity.js"; // #1523 — the project's lead commodity
import { interceptGradeLength, interceptSampledM, interceptOpenEnds } from "../lib/geochem.js"; // TASKS.csv #2475; interceptOpenEnds: #2608
import { computeBestIntercepts, makeRangeAverager, domainsForInterval, attachIncluding, metalEquivalent, metalEquivalentFormula, PRECIOUS_METALS, withMetalEquivalent, gradeUnitLabel } from "../lib/geochem.js"; // attachIncluding, metal equivalent: #402
import { excludeQAQC, labAssays } from "../lib/qaqc.js";
import { desurveyHole } from "../lib/desurvey.js";
import { interceptLocations } from "../lib/interceptLocation.js"; // TASKS.csv #1047
import { trueWidthForIntercept } from "../lib/trueWidth.js";
import { useVirtualRows } from "../lib/useVirtualRows.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { saveFile } from "../lib/desktop.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { useStore } from "../lib/store.jsx"; // TASKS.csv #135 — project desurvey method
import { stampLines, withStamp, ASSAY_READING_RULES, stampEpsg } from "../lib/provenance.js"; // TASKS.csv #404
import { version as APP_VERSION } from "../../package.json";
import { LAYER_META } from "../lib/layers.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { interceptRows, optionalInterceptColumns } from "../lib/drillReportExport.js"; // TASKS.csv #1083, #1290
import { localDate } from "../lib/localDate.js"; // TASKS.csv #2358

const RESULT_ROW_H = 26; // TASKS.csv #222 — matches AttributeTableModal's row-windowing pattern

// TASKS.csv #132 — "Best-intercept / downhole intersection reporting (grade x length above a
// cutoff)". Micromine-specialist audit finding: a daily-use tool for target generation and reporting
// that GeoStrix had no equivalent of — the composite math itself lives in lib/geochem.js's
// computeBestIntercepts (grouped by hole, internal-dilution bridging, length-weighted grade); this is
// just the control panel + results table + CSV export around it.
export default function BestIntercepts({ assays: assaysIn, assayElements, collars, survey, layers, onClose }) {
  const assays = useMemo(() => labAssays(assaysIn), [assaysIn]), pxrfLeft = (assaysIn || []).length - assays.length; // #1673 — lab grades only
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const { desurveyMethod, project, setLayoutElements, goToModule, geochemThresholds = [] } = useStore(); // TASKS.csv #135 — true-width needs the project's own trace; layout: #911; geochemThresholds: #2347
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const symbols = assayElements.map((e) => e.symbol);
  const lead = useLeadCommodity();
  const [symbol, setSymbolRaw] = useState(() => preferredElement(symbols, "intercepts", lead) || "Au");
  const setSymbol = (v) => { setSymbolRaw(v); rememberElement("intercepts", typeof v === "string" ? v : null); }; // #1678 — kept for next time
  const unit = elementUnits[symbol] || "ppm";
  // TASKS.csv #1680 (review #1645, Copley) — what the reader sees: g/t for a precious metal in ppm, and on request % for a base metal in
  // ppm ('15.65 m @ 0.79 % Cu', not '7900 ppm'). Display only: the cutoff, the computation and the CSV's stored-unit columns are unchanged.
  const unitL = gradeUnitLabel(symbol, unit);
  const [asPct, setAsPct] = useState(false);
  const pctOk = unit === "ppm" && !PRECIOUS_METALS.has(symbol);
  const pct = pctOk && asPct;
  const dispUnit = pct ? "%" : unitL;
  const dg = (v) => (pct ? v / 1e4 : v);
  // TASKS.csv #1387 (review #1352) — a cutoff belongs to its element: Ag 30 ppm became "Cutoff (%) = 30" for Pb. Each element keeps
  // the cutoff last used with it; one not used yet starts at its 90th percentile (one significant figure), said in the box's tooltip.
  // #1678 — the element the tool opens on too (it opened at 0.5 whatever the element: every Cu interval in ppm passed)
  const p90Of = (sym) => {
    const v = assays.map((a) => Number(a.values?.[sym])).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    if (!v.length) return null;
    const p = v[Math.floor(0.9 * (v.length - 1))], mag = 10 ** Math.floor(Math.log10(p));
    return Number((Math.round(p / mag) * mag).toPrecision(1));
  };
  const [cutoff, setCutoff] = useState(() => p90Of(symbol) ?? 0.5);
  const cutoffBySymbol = useRef({});
  const suggestCutoff = (sym) => p90Of(sym) ?? cutoff;
  const [suggested, setSuggested] = useState(() => p90Of(symbol)); // #1678 — the tooltip says the opening cutoff is a suggestion too
  const changeSymbol = (sym) => {
    cutoffBySymbol.current[symbol] = cutoff;
    const kept = cutoffBySymbol.current[sym], next = kept ?? suggestCutoff(sym);
    setSymbol(sym); setCutoff(next); setSuggested(kept == null ? next : null);
  };
  const [maxInternalDilution, setMaxInternalDilution] = useState(2);
  const [minLength, setMinLength] = useState(0);
  const [minGradeLen, setMinGradeLen] = useState(0); // grade × length screening cutoff, e.g. "gram-metres"
  const [includeCutoff, setIncludeCutoff] = useState(""); // TASKS.csv #402 — "" = off
  // TASKS.csv #402 — metal equivalent: prices/recoveries are ENTERED, never defaulted.
  const [meqOn, setMeqOn] = useState(false);
  const [meqInputs, setMeqInputs] = useState({}); // symbol -> { price, recovery (%) }
  // TASKS.csv #230 — extra elements shown alongside the primary (compositing-anchor) element, e.g.
  // "what's the Ag and Cu over this Au intercept?" — the compositing/cutoff/dilution logic still only
  // ever runs against ONE element (`symbol`, below); these are just additional length-weighted
  // averages over each already-composited interval's fixed from/to window (see avgGradeInRange).
  const [extraSymbols, setExtraSymbols] = useState([]);
  const toggleExtraSymbol = (s) => setExtraSymbols((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  // TASKS.csv #219 — QC samples (standards/blanks/duplicates) default OUT of this report, same as
  // every other stat/report tool this pass touched — a synthetic standard has no business turning up
  // as a "best intercept" next to real drillhole intervals. Left togglable in case a project's lab
  // naming doesn't match the default patterns and a user wants to sanity-check what's being excluded.
  const [includeQAQC, setIncludeQAQC] = useState(false);
  // TASKS.csv #230 — true (structure-corrected) width. Off by default: it requires the user to state
  // the mineralized structure's orientation, and there's no way to infer that reliably from assay
  // data alone, so silently guessing one would produce confidently-wrong numbers in a report. Once
  // enabled, the reported width is downholeLength × |ĥ·n̂| (see trueWidth.js for the derivation).
  const [twOn, setTwOn] = useState(false);
  // TASKS.csv #1525 (review #1497, Lawyers) — the plane starts empty: a default 090/60 printed factors of 0.12-0.16 on the top intercepts
  // from an orientation nobody entered (#264: no default numbers that read as facts). Widths appear once both are typed.
  const [twDipDirText, setTwDipDirText] = useState("");
  const [twDipText, setTwDipText] = useState("");
  const twDipDir = twDipDirText.trim() === "" ? NaN : ((Number(twDipDirText) % 360) + 360) % 360;
  const twDip = twDipText.trim() === "" ? NaN : Number(twDipText);
  const twReady = Number.isFinite(twDipDir) && Number.isFinite(twDip) && twDip >= 0 && twDip <= 90;
  const twEnabled = twOn && twReady; // every column, export and stamp below reads this
  // Desurveyed trace per hole, built once — trueWidth needs the hole's actual direction ACROSS each
  // intercept, which for a real surveyed (curved) hole differs from its collar orientation.
  const tracesByHole = useMemo(() => {
    if (!twEnabled || !collars?.length) return null;
    const byHole = new Map();
    survey?.forEach((s) => { if (!byHole.has(s.hole_id)) byHole.set(s.hole_id, []); byHole.get(s.hole_id).push(s); });
    const out = new Map();
    collars.forEach((c) => {
      const t = desurveyHole(c, byHole.get(c.hole_id) || [], desurveyMethod); // TASKS.csv #135
      if (t.length) out.set(c.hole_id, t);
    });
    return out;
  }, [twEnabled, collars, survey, desurveyMethod]); // #135 — recompute traces when the method changes
  // TASKS.csv #230 — host domain/lithology per intercept. Any interval layer works (the helper takes
  // rows, not a hard-coded `litho`), so the picker offers whichever interval layers actually have
  // data — lithology is the usual choice but alteration or a custom layer is equally valid.
  const domainLayerOptions = useMemo(
    () => ["litho", "alt", "vein", "breccia", "weath", "structzone", "mnlgy", "litho_gc", "alt_gc"].filter((k) => (layers?.[k] || []).length > 0),
    [layers]
  );
  const [domainLayer, setDomainLayer] = useState("");
  const domainRows = domainLayer ? (layers?.[domainLayer] || []) : null;
  const qaqcExcludedCount = useMemo(() => assays.length - excludeQAQC(assays).length, [assays]);
  const reportAssays = useMemo(() => (includeQAQC ? assays : excludeQAQC(assays)), [assays, includeQAQC]);

  // TASKS.csv #504 — built once per assay table / domain layer, NOT per keystroke in the cutoff boxes: the
  // averager groups by hole and caches each hole's resolved segments; the domain rows are grouped by hole so
  // each intercept scans only its own hole (domainsForInterval filters by hole anyway: same result).
  const rangeAvg = useMemo(() => makeRangeAverager(reportAssays, elementUnits), [reportAssays, elementUnits]);
  const domainByHole = useMemo(() => {
    if (!domainRows) return null;
    const m = new Map();
    domainRows.forEach((d) => { if (!m.has(d.hole_id)) m.set(d.hole_id, []); m.get(d.hole_id).push(d); });
    return m;
  }, [domainRows]);
  // TASKS.csv #402 — the metal equivalent; #1387: above the results, which can now be cut on it (per sample) instead of on `symbol`
  const meqMetals = useMemo(() => (meqOn ? [symbol, ...extraSymbols].map((s) => ({ symbol: s, unit: elementUnits[s] || "ppm", price: Number(meqInputs[s]?.price), recovery: Number(meqInputs[s]?.recovery) / 100 })) : []), [meqOn, symbol, extraSymbols, elementUnits, meqInputs]);
  const meqReady = meqOn && meqMetals.length > 1 && meqMetals.every((m) => m.price > 0 && m.recovery > 0 && m.recovery <= 1);
  const [cutOnEq, setCutOnEq] = useState(false);
  const onEq = cutOnEq && meqReady;
  const gradeSym = onEq ? `${symbol}Eq` : symbol; // what the intercepts are cut on and what their grade is
  const shownExtras = useMemo(() => (onEq ? [symbol, ...extraSymbols] : extraSymbols), [onEq, symbol, extraSymbols]); // cut on the equivalent: the base metal's own grade is shown beside it
  const meqCol = meqReady && !onEq; // the equivalent as an extra column only when it is not already the grade
  const eqData = useMemo(() => (onEq ? withMetalEquivalent(reportAssays, meqMetals, elementUnits) : null), [onEq, reportAssays, meqMetals, elementUnits]);
  const results = useMemo(() => {
    if (!symbol) return [];
    const A = eqData ? eqData.rows : reportAssays, S = eqData ? eqData.symbol : symbol, U = eqData ? eqData.units : elementUnits;
    let rows = computeBestIntercepts(A, S, unit, U, { cutoff, maxInternalDilution, minLength });
    // TASKS.csv #402 — including sub-intercepts at the higher cutoff, same rules.
    const incC = Number(includeCutoff);
    if (includeCutoff !== "" && Number.isFinite(incC) && incC > cutoff) {
      const stats = rows.stats;
      rows = attachIncluding(rows, computeBestIntercepts(A, S, unit, U, { cutoff: incC, maxInternalDilution, minLength }));
      rows.stats = stats;
    }
    const out = rows.filter((r) => interceptGradeLength(r) >= minGradeLen - 1e-9).map((r) => ({ // #2475
      ...r,
      extras: Object.fromEntries(shownExtras.map((s) => [s, rangeAvg(r.hole_id, r.from, r.to, s, elementUnits[s] || "ppm")])),
      // null (not a fallback to downhole length) whenever the geometry can't be resolved — see
      // trueWidth.js: showing the UNCORRECTED number under a "True width" heading would be worse
      // than showing nothing.
      tw: tracesByHole ? trueWidthForIntercept(tracesByHole.get(r.hole_id), r.from, r.to, twDipDir, twDip) : null,
      dom: domainByHole ? domainsForInterval(domainByHole.get(r.hole_id) || [], r.hole_id, r.from, r.to) : null,
    }));
    out.stats = rows.stats; // TASKS.csv #331/#333 — duplicates skipped, overlapping rows, negative codes
    return out;
  }, [reportAssays, symbol, unit, elementUnits, cutoff, maxInternalDilution, minLength, minGradeLen, shownExtras, eqData, tracesByHole, twDipDir, twDip, domainByHole, rangeAvg, includeCutoff]);
  const incOn = includeCutoff !== "" && Number(includeCutoff) > cutoff; // #402
  const meqFor = (r) => (meqReady ? metalEquivalent({ [symbol]: r.avgGrade, ...r.extras }, meqMetals) : null);
  const incText = (h) => `${h.length.toFixed(2)} m @ ${h.overRange ? ">=" : ""}${+dg(h.avgGrade).toPrecision(4)} (${h.from.toFixed(2)}-${h.to.toFixed(2)})`; // dg: #1680

  // "V1 (62%)" for a dominated intercept, "V1 62% · S5 38%" when it genuinely straddles — a report
  // that collapsed a contact-straddling intercept to just its dominant unit would hide exactly the
  // geology this column exists to surface.
  const domainLabel = (d) => {
    if (!d || !d.parts.length) return "—";
    if (d.parts.length === 1) return d.parts[0].value;
    return d.parts.slice(0, 3).map((p) => `${p.value} ${Math.round(p.fraction * 100)}%`).join(" · ");
  };
  const { scrollRef, onScroll, startIndex, endIndex, topPad, bottomPad } = useVirtualRows(results.length, RESULT_ROW_H, { containerHeight: 380 });

  // TASKS.csv #911 — the results as a table on the active Layout page (a copy: send again after changing the settings)
  const toLayout = () => {
    const columns = [tr("Hole"), tr("From (m)"), tr("To (m)"), tr("Length (m)"), ...(twEnabled ? [tr("True width (m)")] : []), `${gradeSym} (${dispUnit})`, ...(incOn ? [tr("Including")] : [])]; // dispUnit: #1680
    const open = interceptOpenEnds(results.slice(0, 60), reportAssays, symbol, collars); // #2608 — a length that is a minimum
    const rows = results.slice(0, 60).map((r, i) => [String(r.hole_id), Number(r.from).toFixed(2), Number(r.to).toFixed(2), `${r.unsampledM > 0.05 ? tr("{len} ({s} sampled)", { len: r.length.toFixed(2), s: interceptSampledM(r).toFixed(2) }) : r.length.toFixed(2)}${open[i].top || open[i].bottom ? "+" : ""}` /* #2475; + open: #2608 */, ...(twEnabled ? [r.tw ? r.tw.trueWidth.toFixed(2) : ""] : []), `${r.overRange ? "≥" : ""}${+dg(r.avgGrade).toPrecision(4)}`, ...(incOn ? [r.including ? incText(r.including[0]) : ""] : [])]);
    const from = tr("{symbol} ≥ {cutoff} {unit}, dilution ≤ {dil} m, min {min} m", { symbol: gradeSym, cutoff, unit: unitL, dil: maxInternalDilution, min: minLength });
    // TASKS.csv #936 — a printed intercept table is what gets lifted into a report or a news release: it carries the
    // caveats the dialog and the CSV stamp give (QC, over-range, below detection, true width, screening)
    const note = [
      includeQAQC ? tr("QC samples (standards, blanks, duplicates) are included.") : qaqcExcludedCount > 0 ? tr("{n} QC sample(s) (standards, blanks, duplicates) excluded.", { n: qaqcExcludedCount }) : "",
      results.some((r) => r.overRange) ? tr("≥: contains an over-range result counted at its ceiling; the true grade is at least this.") : "",
      tr("Below-detection results are taken at half the detection limit."),
      results.slice(0, 60).some((r) => r.unsampledM > 0.05) ? tr("Where a length shows its sampled metres, the rest of the interval has no result: the grade and grade × length are over the samples only.") : "", // #2475
      open.some((o) => o.top || o.bottom) ? tr("+: the intercept starts at the hole's first sample or ends at its last sample or the end of the hole, so the mineralization may continue: the length is a minimum.") : "", // #2608
      twEnabled ? tr("True width to a structure dipping {dip}° towards {dipDir}°.", { dip: twDip, dipDir: twDipDir }) : tr("Lengths are downhole, not true widths."),
      tr("Screening tool: verify any intercept against the raw assay certificates before reporting it."),
    ].filter(Boolean).join(" ");
    setLayoutElements((els) => [...els, { id: `table_${Date.now()}`, type: "table", source: "static", x: 60 + 24 * els.filter((e) => e.type === "table").length, y: 60 + 24 * els.filter((e) => e.type === "table").length /* #2608 — a second send no longer lands exactly on the first */, w: 520, fontPt: 7, frameWidth: 1,
      title: tr("Best intercepts: {from}", { from }), from, note, columns, rows: results.length > 60 ? [...rows, [tr("… and {n} more intercept(s), not shown on this sheet", { n: results.length - 60 }) /* #2608 — the sheet's reader has no CSV */, ...columns.slice(1).map(() => "")]] : rows }]);
    goToModule("layout");
    onClose();
  };
  const exportCSV = () => {
    // TASKS.csv #1047 (review #1016) — where each intercept is: the collar (E, N, RL, grid azimuth, dip negative = down,
    // EOH) and the intercept's midpoint on the desurveyed trace (project desurvey method), for a press-release table or a
    // grade-thickness long section without a join in Excel
    const loc = interceptLocations(results, collars, survey, desurveyMethod, tracesByHole);
    const rows = interceptRows(results, { symbol: gradeSym, unit, loc, trueWidth: twEnabled ? { dipDir: twDipDir, dip: twDip } : null, domain: !!domainLayer, // #1083 — in lib, tested
      extraSymbols: shownExtras, elementUnits, including: incOn ? { cutoff: includeCutoff, text: incText } : null, meq: meqCol ? meqFor : null });
    if (pct) rows.forEach((row, i) => { row[`avg_${gradeSym}_pct`] = +(results[i].avgGrade / 1e4).toPrecision(6); }); // #1680 — beside the stored ppm column
    // TASKS.csv #404 — the parameters behind these intercepts, at the top of the file.
    const stamp = stampLines({ tool: "Best intercepts", version: APP_VERSION, epsg: stampEpsg(project) /* #2195 */, params: [
      `Element: ${gradeSym} (${unit})${onEq ? " (per-sample metal equivalent)" : ""} | cutoff: ${cutoff} | max consecutive internal dilution: ${maxInternalDilution} m | min intercept length: ${minLength} m | min grade x length: ${minGradeLen}`,
      // TASKS.csv #501/#502 — this now describes what computeBestIntercepts actually does (it used to dilute at zero)
      `Grades: length-weighted over assayed metres only; unsampled / not-assayed metres inside an intercept are left out of the grade and reported per row (unsampled_or_unassayed_m), not diluted in at zero. Empty cells were read at import as either not assayed or below detection ('<DL' at half), as chosen for each file.`,
      `QAQC inserts: ${includeQAQC ? "INCLUDED" : `excluded (${qaqcExcludedCount} rows)`}`,
      ASSAY_READING_RULES,
      twEnabled ? `True width: from a ${twDipDir}/${twDip} (dip direction/dip) structure against hole traces desurveyed by ${desurveyMethod || "minimum curvature"}` : "True width: not computed (lengths are downhole)",
      domainLayer ? `Host domain from layer: ${domainLayer}` : null,
      incOn ? `Including sub-intercepts: cutoff ${includeCutoff} ${unit}, same dilution and minimum-length rules, attached to the containing intercept` : null,
      meqReady ? `Metal equivalent (prices and recoveries entered by the user, ${localDate() /* #2358 */}): ${metalEquivalentFormula(meqMetals)}. ${onEq ? `Intercepts are cut on ${gradeSym}, computed per sample; a sample missing any of the metals has no equivalent and is left out of the grade as unassayed.` : `Intercepts are cut on ${symbol} alone, not on the equivalent.`}` : null,
      extraSymbols.length ? `Also averaged over each intercept: ${extraSymbols.join(", ")}` : null,
      `Intercepts: ${results.length}`,
    ] });
    saveFile({ suggestedName: `best_intercepts_${gradeSym}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: withStamp(toExportCsv(rows), stamp) });
  };

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Best-intercept report")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Composited downhole intersections above a cutoff, with an internal-dilution allowance — {assays} intervals loaded.{v}", { assays: assays.length, v: qaqcExcludedCount > 0 && !includeQAQC ? tr(" {qaqcExcludedCount} QC sample(s) (standards/blanks/duplicates) excluded.", { qaqcExcludedCount }) : "" })}
            {pxrfLeft > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("{n} pXRF reading(s) left out: the grades here come from lab assays only.", { n: pxrfLeft })}</div>}{/* #1673 */}
            </div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {qaqcExcludedCount > 0 && (
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title={tr("QC samples (standards/blanks/duplicates, detected by hole_id naming) are excluded by default so they can't turn up as a false 'best intercept' — check this to include them anyway.")}>
              <input type="checkbox" checked={includeQAQC} onChange={(e) => setIncludeQAQC(e.target.checked)} />{tr("Include QC samples (standards/blanks/duplicates) in this report")}</label>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel}>{tr("Element")}<select value={symbol} onChange={(e) => { changeSymbol(e.target.value); setExtraSymbols((p) => p.filter((s) => s !== e.target.value)); }} style={inp}>
                {symbols.map((s) => <option key={s} value={s}>{s} ({gradeUnitLabel(s, elementUnits[s])})</option>)}
              </select>
            </label>
            {pctOk && <label style={{ ...fieldLabel, flexDirection: "row", alignItems: "center", gap: 4, cursor: "pointer" }} title={tr("Show the grades as % (ppm / 10,000) in the table, the Layout table and an extra CSV column. The cutoff stays in ppm.")}><input type="checkbox" checked={asPct} onChange={(e) => setAsPct(e.target.checked)} />{tr("Show as %")}</label>}
            <label style={fieldLabel}>{tr("Cutoff ({unit})", { unit: unitL })}<input type="number" step="any" value={cutoff} onChange={(e) => { setCutoff(Number(e.target.value) || 0); setSuggested(null); }} style={inp} title={suggested != null && cutoff === suggested ? tr("Suggested: this element's 90th percentile. Set the cutoff you report at.") : undefined} />
            </label>
            {(() => { const offers = drillThresholdOffers(geochemThresholds, symbol, unit).slice(0, 4); return offers.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", alignItems: "center" }}>{/* #2347 — offered, never applied */}
              <span>{tr("Saved threshold:")}</span>
              {offers.map((o) => <button key={o.key} type="button" onClick={() => { setCutoff(o.value); setSuggested(null); }} style={{ ...inp, width: "auto", cursor: "pointer", padding: "1px 6px" }} title={tr("{rule}{pop}, decided {date}. Click to use it as the cutoff.", { rule: o.rule, pop: o.population ? ` (${o.population})` : "", date: o.decided })}>{o.population ? `${o.population.split(": ").pop()} ` : ""}{+Number(o.value).toPrecision(4)}</button>)}
            </div> : null; })()}
            <label style={fieldLabel} title={tr("How much below-cutoff ('waste') core between two above-cutoff samples is still folded into one intercept, diluting its grade, rather than splitting the intercept in two.")}>{tr("Max internal dilution (m)")}<input type="number" step="any" min="0" value={maxInternalDilution} onChange={(e) => setMaxInternalDilution(Math.max(0, Number(e.target.value) || 0))} style={inp} />
            </label>
            <label style={fieldLabel}>{tr("Min length (m)")}<input type="number" step="any" min="0" value={minLength} onChange={(e) => setMinLength(Math.max(0, Number(e.target.value) || 0))} style={inp} />
            </label>
            <label style={fieldLabel} title={tr("'Including' sub-intercepts: intercepts at this higher cutoff, built with the same dilution and minimum-length rules, reported inside the intercept that contains them (e.g. 42 m @ 1.2, including 6 m @ 5.1). Leave empty for none.")}>{tr("Including at ≥")}<input type="number" step="any" min="0" value={includeCutoff} placeholder={tr("off")} onChange={(e) => setIncludeCutoff(e.target.value)} style={inp} aria-label={tr("Including cutoff")} />
            </label>
            <label style={fieldLabel} title={tr("Screen out intercepts below this grade × length (e.g. gram-metres for Au in g/t) — leave at 0 to show every intercept meeting the length/cutoff criteria above.")}>{tr("Min grade × length")}<input type="number" step="any" min="0" value={minGradeLen} onChange={(e) => setMinGradeLen(Math.max(0, Number(e.target.value) || 0))} style={inp} />
            </label>
          </div>

          {/* TASKS.csv #402 — metal equivalent from the element + the 'Also show' elements below. */}
          {symbols.length > 1 && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={meqOn} onChange={(e) => setMeqOn(e.target.checked)} />{" "}{tr("Metal equivalent ({symbol}Eq) from {symbol} and the \"Also show\" elements", { symbol })}</label>
              {meqOn && (
                <div style={{ marginTop: 6, marginLeft: 22, display: "flex", flexDirection: "column", gap: 4 }}>
                  {[symbol, ...extraSymbols].map((s) => (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 34 }}>{s}</span>{tr("price")}{" "}<input type="number" min="0" step="any" value={meqInputs[s]?.price ?? ""} onChange={(e) => setMeqInputs((p) => ({ ...p, [s]: { ...p[s], price: e.target.value } }))} style={{ ...inp, width: 80 }} aria-label={tr("{s} price", { s })} /> {tr("{v}recovery", { v: PRECIOUS_METALS.has(s) ? "$/oz" : "$/lb" })}{" "}<input type="number" min="1" max="100" step="any" value={meqInputs[s]?.recovery ?? ""} onChange={(e) => setMeqInputs((p) => ({ ...p, [s]: { ...p[s], recovery: e.target.value } }))} style={{ ...inp, width: 60 }} aria-label={tr("{s} recovery %", { s })} /> %
                    </div>
                  ))}
                  <div style={{ color: meqReady ? "var(--color-text-muted)" : "var(--color-danger-icon-strong)" }}>
                    {extraSymbols.length === 0 ? tr("Pick at least one other element under \"Also show\".") : meqReady ? metalEquivalentFormula(meqMetals) : tr("Enter a price and recovery for every element — no equivalent is shown until all are entered.")}
                  </div>
                  {meqReady && ( // TASKS.csv #1387
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title={tr("The equivalent is computed for each sample and the intercepts are built on it, with the same cutoff, dilution and length rules. A sample missing any of the metals is left out of the grade, as an unassayed one is.")}>
                      <input type="checkbox" checked={cutOnEq} onChange={(e) => setCutOnEq(e.target.checked)} />{tr("Cut the intercepts on {symbol}Eq, not on {symbol} alone", { symbol })}
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          {symbols.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }} title={tr("Extra elements' length-weighted average over each already-composited interval — the intercept itself is still only built/cut off against the primary Element above.")}>
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Also show:")}</span>
              {symbols.filter((s) => s !== symbol).map((s) => (
                <label key={s} style={{ fontSize: "var(--font-size-sm)", color: extraSymbols.includes(s) ? "var(--color-text)" : "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 3, cursor: "pointer", padding: "3px 7px", borderRadius: 5, border: `1px solid ${extraSymbols.includes(s) ? "var(--color-success-border)" : "var(--color-border)"}` }}>
                  <input type="checkbox" checked={extraSymbols.includes(s)} onChange={() => toggleExtraSymbol(s)} style={{ margin: 0 }} />
                  {s} ({elementUnits[s] || "ppm"})
                </label>
              ))}
            </div>
          )}

          {/* TASKS.csv #230 — true (structure-corrected) width. Requires the user to state the
              mineralized structure's orientation: it can't be inferred from assay data, and guessing
              would put confidently-wrong widths in a report. Disabled with an explanation when there's
              no collar geometry loaded, rather than silently doing nothing. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "7px 9px", background: twEnabled ? "var(--color-selected-bg)" : "var(--color-bg-subtle)", border: `1px solid ${twEnabled ? "var(--color-selected-border)" : "var(--color-border)"}`, borderRadius: 6 }}>
            <label style={{ fontSize: "var(--font-size-sm)", color: collars?.length ? "var(--color-text)" : "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 5, cursor: collars?.length ? "pointer" : "default" }}
              title={collars?.length ? tr("Correct each intercept's downhole length to a true (perpendicular) thickness across the structure.") : tr("Needs collar (and ideally survey) data loaded to know each hole's orientation.")}>
              <input type="checkbox" checked={twOn} disabled={!collars?.length} onChange={(e) => setTwOn(e.target.checked)} style={{ margin: 0 }} />{tr("True width")}</label>
            {twOn && (
              <>
                <label style={{ ...fieldLabel, flexDirection: "row", alignItems: "center", gap: 4 }} title={tr("Dip direction (dip azimuth) of the mineralized structure — 0=N, 90=E.")}>{tr("Structure dip dir")}<input type="number" step="any" value={twDipDirText} onChange={(e) => setTwDipDirText(e.target.value)} style={{ ...inp, width: 60 }} aria-label={tr("Structure dip direction")} />
                </label>
                <label style={{ ...fieldLabel, flexDirection: "row", alignItems: "center", gap: 4 }} title={tr("Dip of the mineralized structure, degrees below horizontal.")}>{tr("dip")}<input type="number" step="any" min="0" max="90" value={twDipText} onChange={(e) => setTwDipText(e.target.value)} style={{ ...inp, width: 55 }} aria-label={tr("Structure dip")} />
                </label>
              </>
            )}
            {!collars?.length && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Import collars to enable.")}</span>}
            {twEnabled && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>{tr("Width × |cos θ| to the structure's pole — a factor near 1 means a well-oriented hole.")}</span>}
            {twOn && !twReady && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-icon-strong)" }}>{tr("Enter the mineralized structure's dip direction and dip (0-90°): no true width is shown until both are set.")}</span>}
          </div>

          {/* TASKS.csv #230 — host domain/lithology per intercept. */}
          {domainLayerOptions.length > 0 && (
            <label style={{ ...fieldLabel, flexDirection: "row", alignItems: "center", gap: 6 }}
              title={tr("Show which logged unit each intercept sits in — and, when it straddles a contact, the split between units.")}>{tr("Host domain")}<select value={domainLayer} onChange={(e) => setDomainLayer(e.target.value)} style={{ ...inp, width: "auto" }}>
                <option value="">{tr("(none)")}</option>
                {domainLayerOptions.map((k) => <option key={k} value={k}>{LAYER_META[k]?.label || k}</option>)}
              </select>
            </label>
          )}

          {symbols.length === 0 ? (
            <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No assay elements loaded — import assays first.")}</div>
          ) : results.length === 0 ? (
            <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No intervals meet these criteria — try a lower cutoff or shorter minimum length.")}</div>
          ) : (
            <div ref={scrollRef} onScroll={onScroll} style={{ overflow: "auto", maxHeight: 380, minHeight: 180, flexShrink: 0 }}>{/* #1183: the controls above scroll away; the table keeps its rows */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-base)" }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "var(--color-bg)" }}>
                    <th style={th}>{tr("Hole")}</th>
                    <th style={th}>{tr("From")}</th>
                    <th style={th}>{tr("To")}</th>
                    <th style={th}>{tr("Length (m)")}</th>
                    {twEnabled && <th style={th} title={tr("Downhole length corrected to a true thickness perpendicular to the stated structure.")}>{tr("True width (m)")}</th>}
                    {twEnabled && <th style={th} title={tr("|cos θ| between the hole and the structure's pole. 1.0 = hole perpendicular to the structure (ideal); near 0 = a grazing intersection whose downhole width is badly inflated.")}>{tr("Factor")}</th>}
                    {domainLayer && <th style={th} title={tr("Logged unit(s) hosting this intercept. Percentages shown when it straddles a contact.")}>{tr("Host")}</th>}
                    <th style={th}>{tr("Avg {symbol} ({unit})", { symbol: gradeSym, unit: dispUnit })}</th>
                    <th style={th}>{tr("Grade × length")}</th>
                    {optionalInterceptColumns({ including: incOn, metalEquivalent: meqCol }).map((c) => (c === "including"
                      ? <th key={c} style={th}>{tr("Including (≥ {includeCutoff})", { includeCutoff })}</th>
                      : <th key={c} style={th} title={metalEquivalentFormula(meqMetals)}>{tr("{symbol}Eq ({unit})", { symbol, unit })}</th>))}
                    {shownExtras.map((s) => <th key={s} style={th}>{tr("Avg {s} ({v})", { s, v: elementUnits[s] || tr("ppm") })}</th>)}
                    <th style={th} title={tr("The assay intervals in the intercept at or above the cutoff")}>{tr("Samples ≥ cutoff")}</th>{/* #1393 — it counts those only */}
                  </tr>
                </thead>
                <tbody>
                  {topPad > 0 && <tr style={{ height: topPad }}><td colSpan={7 + shownExtras.length + (twEnabled ? 2 : 0) + (domainLayer ? 1 : 0) + (incOn ? 1 : 0) + (meqCol ? 1 : 0)} style={{ padding: 0, border: "none" }} /></tr>}
                  {results.slice(startIndex, endIndex).map((r, i) => (
                    <tr key={startIndex + i} style={{ borderBottom: "1px solid var(--color-hover-bg)", height: RESULT_ROW_H, boxSizing: "border-box" }}>
                      <td style={td}>{r.hole_id}</td>
                      <td style={td}>{r.from.toFixed(2)}</td>
                      <td style={td}>{r.to.toFixed(2)}</td>
                      <td style={td}>{r.length.toFixed(2)}</td>
                      {twEnabled && <td style={td}>{r.tw ? r.tw.trueWidth.toFixed(2) : "—"}</td>}
                      {twEnabled && <td style={{ ...td, color: r.tw && r.tw.factor < 0.5 ? "#b06a1f" : undefined }} title={r.tw && r.tw.factor < 0.5 ? tr("Oblique intersection — the downhole width overstates true thickness by more than 2x.") : undefined}>{r.tw ? r.tw.factor.toFixed(3) : "—"}</td>}
                      {domainLayer && (() => {
                        const d = r.dom;
                        const partial = d && d.parts.length > 0 && d.covered < 0.99;
                        // Overlap is a genuine data-quality problem (the same metre logged as two
                        // different units), and it's why the percentages can sum above 100% — say so
                        // rather than letting the row look simply wrong.
                        const notes = [
                          partial ? tr("Only {v}% of this intercept has a logged unit — the remainder is unlogged.", { v: Math.round(d.covered * 100) }) : null,
                          d?.overlapping ? tr("This hole's log has OVERLAPPING intervals here (the same metre logged as more than one unit), so these percentages sum above 100%. Worth fixing in the source log.") : null,
                        ].filter(Boolean);
                        return (
                          <td style={{ ...td, color: d?.overlapping ? "#b06a1f" : undefined }} title={notes.length ? notes.join(" ") : undefined}>
                            {domainLabel(d)}{partial ? " *" : ""}{d?.overlapping ? " ⚠" : ""}
                          </td>
                        );
                      })()}
                      <td style={{ ...td, fontWeight: 600, color: "var(--color-text)" }}
                        title={[
                          r.overRange ? tr("Contains an over-range ('>') result, counted at its detection ceiling — the true grade is at least this.") : null,
                          r.unsampledM > 1e-6 ? tr("{unsampledM} m inside this intercept has no {symbol} result (unsampled or not assayed): it is left out of the grade, which is over the assayed metres only.", { unsampledM: r.unsampledM.toFixed(2), symbol: gradeSym }) : null,
                          r.overlapM > 1e-6 ? tr("{overlapM} m is covered by overlapping assay rows with different results; their average is used.", { overlapM: r.overlapM.toFixed(2) }) : null,
                        ].filter(Boolean).join(" ") || undefined}>
                        {r.overRange ? "≥ " : ""}{+dg(r.avgGrade).toPrecision(4)}{r.overlapM > 1e-6 ? " ⚠" : ""}
                      </td>
                      <td style={td}>{+dg(interceptGradeLength(r)).toPrecision(5)}</td>{/* #2475 */}
                      {/* TASKS.csv #1164 — the same order as the header: Including, then the equivalent */}
                      {optionalInterceptColumns({ including: incOn, metalEquivalent: meqCol }).map((c) => (c === "including"
                        ? <td key={c} style={{ ...td, whiteSpace: "nowrap" }} title={r.including ? r.including.map(incText).join("; ") : undefined}>{r.including ? `${incText(r.including[0])}${r.including.length > 1 ? ` +${r.including.length - 1}` : ""}` : "—"}</td>
                        : <td key={c} style={td}>{(() => { const v = meqFor(r); return v == null ? "—" : `${r.overRange ? "≥ " : ""}${+v.toPrecision(4)}`; })()}</td>))}
                      {shownExtras.map((s) => <td key={s} style={td}>{r.extras[s] == null ? "—" : +r.extras[s].toPrecision(4)}</td>)}
                      <td style={td}>{r.intervals}</td>
                    </tr>
                  ))}
                  {bottomPad > 0 && <tr style={{ height: bottomPad }}><td colSpan={7 + shownExtras.length + (twEnabled ? 2 : 0) + (domainLayer ? 1 : 0) + (incOn ? 1 : 0) + (meqCol ? 1 : 0)} style={{ padding: 0, border: "none" }} /></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
            {/* TASKS.csv #331/#333 — say what was done to the data, not just the result. */}
            {results.stats && (results.stats.duplicatesSkipped > 0 || results.stats.overlappingRows > 0 || results.stats.negativeValues > 0) && (
              <div style={{ color: "var(--color-text-secondary)", marginBottom: 4 }}>
                {tr("{v}. Fix these in the source data for a clean report.", { v: [
                  results.stats.duplicatesSkipped > 0 ? tr("{duplicatesSkipped} exact duplicate row(s) counted once", { duplicatesSkipped: results.stats.duplicatesSkipped }) : null,
                  results.stats.overlappingRows > 0 ? tr("{overlappingRows} row(s) overlap another row in the same hole — each metre is counted once, and where overlapping {symbol} results differ their average is used (⚠ in the table)", { overlappingRows: results.stats.overlappingRows, symbol }) : null,
                  results.stats.negativeValues > 0 ? tr("{negativeValues} negative {symbol} value(s) treated as not assayed (negative numbers are detection-limit or no-data codes, not grades)", { negativeValues: results.stats.negativeValues, symbol }) : null,
                ].filter(Boolean).join(". ") })}</div>
            )}{tr("Intercepts never average below the cutoff: internal dilution is only bridged while the result stays at or above it. \"≥\" marks a grade that contains an over-range result. Sorted by grade × length (best intercepts first). Below-detection assay values are already substituted at half the detection limit (same convention as the plots). This is a screening tool — verify any intercept you plan to report externally against the raw assay certificates.")}</div>

          <button onClick={exportCSV} disabled={results.length === 0} style={{ ...btn(true), alignSelf: "flex-start", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6, opacity: results.length === 0 ? 0.5 : 1 }}>
            <Download size={14} />{" "}{tr("Export report (CSV)")}</button>
          <button onClick={toLayout} disabled={results.length === 0} title={tr("Put these intercepts on the current Layout page as a table (the best 60; the CSV has them all)")} style={{ ...btn(false), alignSelf: "flex-start", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6, opacity: results.length === 0 ? 0.5 : 1 }}>
            <Sheet size={14} />{" "}{tr("To Layout")}</button>{/* TASKS.csv #911 */}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>{tr("Close")}</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(880px, 95vw)", maxHeight: "88vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const fieldLabel = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", flexDirection: "column", gap: 4 };
const inp = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit", width: 130 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });
const th = { textAlign: "start", padding: "6px 8px", color: "var(--color-text-muted)", fontWeight: 500, borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, background: "var(--color-bg)", whiteSpace: "nowrap" };
const td = { padding: "5px 8px", color: "var(--color-text-strong)", whiteSpace: "nowrap" };
