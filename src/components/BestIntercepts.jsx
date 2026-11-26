import { dropIdleStarterMapFurniture } from "../lib/layoutLinks.js"; // TASKS.csv #3863
import React, { useEffect, useMemo, useRef, useState } from "react";
import { openHelp } from "../lib/help.js"; // TASKS.csv #3578
import { stampedCsv } from "../lib/csvStampPref.js"; // TASKS.csv #3614
import CsvStampToggle from "./CsvStampToggle.jsx";
import { drillThresholdOffers, sortedThresholdOffers } from "../lib/thresholds.js"; // TASKS.csv #2347; sorted: #3160
import { X, Download, Sheet } from "./icons.js";
import { preferredElement, rememberElement } from "../lib/preferredElement.js"; // TASKS.csv #1678
import { useLeadCommodity } from "../lib/useLeadCommodity.js"; // #1523 — the project's lead commodity
import { interceptGradeLength, interceptSampledM, interceptOpenEnds } from "../lib/geochem.js"; // TASKS.csv #2475; interceptOpenEnds: #2608
import { computeBestIntercepts, makeRangeAverager, domainsForInterval, attachIncluding, metalEquivalent, metalEquivalentFormula, PRECIOUS_METALS, TRADED_OXIDE /* #2731 */, withMetalEquivalent, gradeUnitLabel } from "../lib/geochem.js"; // attachIncluding, metal equivalent: #402
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
import { customDomainOptions, attributeDomainOptions, attributeDomainLabel } from "../lib/customDomains.js"; // TASKS.csv #3759 (8)
import { useKeptState, keptIn, scopeOf } from "../lib/keptState.js"; // TASKS.csv #3223 — the dialog's settings kept with the project
import { stampLines, ASSAY_READING_RULES, stampEpsg } from "../lib/provenance.js"; // TASKS.csv #404
import { version as APP_VERSION } from "../../package.json";
import { LAYER_META } from "../lib/layers.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { interceptRows, optionalInterceptColumns } from "../lib/drillReportExport.js"; // TASKS.csv #1083, #1290
import { localDate } from "../lib/localDate.js"; // TASKS.csv #2358
import { cutoffOnElementChange, rememberInterceptCutoff } from "../lib/interceptCutoff.js"; // TASKS.csv #2513; remember: #3069
import { interceptTablePlan, interceptCount, columnFormat, spreadFormat, continuationRanges, sortIntercepts, filterIntercepts } from "../lib/interceptTable.js"; // continuationRanges: #2708; sort, filter: #3565
import { holeTotalRows } from "../lib/drillReportExport.js"; // TASKS.csv #3699
import { DISPLAY_UNITS, isPlainUnit, displayFactor, toDisplay, fromDisplay, unitSlug } from "../lib/displayUnits.js"; // TASKS.csv #3236
import { BULK_COMMODITIES } from "../lib/preferredElement.js"; // TASKS.csv #2923 — no metal equivalent for a bulk commodity
import { elementOptionLabel, isLoiHeader } from "../lib/geochem.js"; // TASKS.csv #2923 — 'Si as SiO2' in the price rows; isLoiHeader: #2924 // TASKS.csv #2200 / #2479; columnFormat: #3019
import { pagePx, pageFormatOf, addPagesOnPaper } from "../lib/pageFormats.js"; // TASKS.csv #2479; addPagesOnPaper: #3370
import { creditsElement } from "../lib/layoutCredits.js"; // TASKS.csv #3854
import { projectCredits } from "../lib/credits.js"; // TASKS.csv #3854
import { holeTotals, holeTotalsDisplay, holeExtraMeans } from "../lib/accumulation.js"; // TASKS.csv #2419 — Total per hole; holeExtraMeans: #3566
import { compositeSources } from "../lib/compositeSources.js"; // TASKS.csv #3584; a source of its own: #3744 / #3750
import { densityRangeOf } from "../lib/densityRange.js"; // TASKS.csv #3682
import { densityLookup } from "../lib/densityWeight.js"; // TASKS.csv #3562 — grades weighted by length x density
import { weightedPercentile } from "../lib/probPlot.js"; // TASKS.csv #3752 — the length-weighted percentile, as Grade stats reads it
import { toFixedHalfUp } from "../lib/numberFormat.js"; // TASKS.csv #3754 (9)
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926
import MoreFold from "./MoreFold.jsx"; // TASKS.csv #4070 part 5
const PENALTY_ELEMENTS = new Set(["As", "Sb", "Bi", "Hg"]); // TASKS.csv #3754 (7) — elements a smelter penalizes, so a price box makes no sense for them

const RESULT_ROW_H = 26; // TASKS.csv #222 — matches AttributeTableModal's row-windowing pattern

// TASKS.csv #132 — "Best-intercept / downhole intersection reporting (grade x length above a
// cutoff)". Micromine-specialist audit finding: a daily-use tool for target generation and reporting
// that GeoStrix had no equivalent of — the composite math itself lives in lib/geochem.js's
// computeBestIntercepts (grouped by hole, internal-dilution bridging, length-weighted grade); this is
// just the control panel + results table + CSV export around it.
const ALSO_MAX = 16; // TASKS.csv #2356 — above this many other elements, 'Also show' lists only the ticked ones

export default function BestIntercepts({ assays: assaysTable, assayElements: elementsTable, collars, survey, layers, onClose }) {
  // TASKS.csv #3584 — the kept composites layers (Compositing > Keep as a layer) are elements too, cut at the composites' own length
  const keptLayers = useStore().customLayers;
  // TASKS.csv #3744 / #3750 — each kept layer is a source of its own, one element per composited element ('Au (2 m composites)'); the chosen element's
  // source is the only table read (the raw assays never take the composites' rows: keeping a layer changed the raw Au table, 164 -> 165 intercepts)
  const comp = useMemo(() => compositeSources(keptLayers), [keptLayers]);
  const compElements = useMemo(() => comp.sources.flatMap((src) => src.elements.map((e) => ({ symbol: e.symbol, unit: e.unit }))), [comp]);
  const assayElements = useMemo(() => (compElements.length ? [...(elementsTable || []), ...compElements.filter((e) => !(elementsTable || []).some((x) => x.symbol === e.symbol))] : elementsTable), [elementsTable, compElements]);
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const { desurveyMethod, project, getProjectToken, setLayoutElements, addLayoutPages: addPagesRaw, setLayoutPageFormat, switchLayoutPage, setDisplayUnit, layoutElements = [], layoutPages = [], activeLayoutPageId, goToModule, geochemThresholds = [], terrain = null, rasters = [] } = useStore(); // addLayoutPages: #3019 // layoutElements / pages: #2479 // TASKS.csv #135 — true-width needs the project's own trace; layout: #911; geochemThresholds: #2347
  // TASKS.csv #3370 — its own page and continuation pages are laid out for the active page's paper, so they are made on it
  const addLayoutPages = typeof addPagesRaw === "function" ? (pgs) => addPagesOnPaper(addPagesRaw, setLayoutPageFormat, pgs, layoutPages.find((pg) => pg.id === activeLayoutPageId)?.format) : undefined;
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const symbols = assayElements.map((e) => e.symbol);
  const lead = useLeadCommodity();
  const [symbol, setSymbolRaw] = useState(() => preferredElement(symbols, "intercepts", lead) || "Au");
  const setSymbol = (v) => { setSymbolRaw(v); rememberElement("intercepts", typeof v === "string" ? v : null); }; // #1678 — kept for next time
  const unit = elementUnits[symbol] || "ppm";
  const chosenSrc = comp.bySymbol.get(symbol) || null; // #3744 — a kept composites layer, or the assay table
  const assaysIn = chosenSrc ? chosenSrc.assays : assaysTable;
  const assays = useMemo(() => labAssays(assaysIn), [assaysIn]), pxrfLeft = (assaysIn || []).length - assays.length; // #1673 — lab grades only
  // 'Also show' and the metal equivalent: the chosen source's elements (a composites layer's other elements, averaged on the composites)
  const alsoSymbols = useMemo(() => (chosenSrc ? chosenSrc.elements.map((e) => e.symbol) : (elementsTable || []).map((e) => e.symbol)), [chosenSrc, elementsTable]);
  // TASKS.csv #1680 (review #1645, Copley) — what the reader sees: g/t for a precious metal in ppm, and on request % for a base metal in
  // ppm ('15.65 m @ 0.79 % Cu', not '7900 ppm'). Display only: the cutoff, the computation and the CSV's stored-unit columns are unchanged.
  const unitL = gradeUnitLabel(symbol, unit);
  // TASKS.csv #3223 (review #3195, Galore Creek) — every setting was lost when the dialog closed (cut-off back to the P90, dilution 2, no
  // Also show, empty prices): they are kept per project for the session (lib/keptState, as Geochem's own choices are)
  const keptScope = scopeOf(getProjectToken?.());
  const [asPct, setAsPct] = useKeptState(keptScope, "bi.asPct", false);
  const [continuePages, setContinuePages] = useKeptState(keptScope, "bi.continuePages", false); // TASKS.csv #2708
  const pctOk = unit === "ppm" && !PRECIOUS_METALS.has(symbol);
  // TASKS.csv #3236 — the unit shown is the project's choice for the element (project.displayUnits, set in 'Show in' below, kept with the
  // project, store setDisplayUnit); a session's 'Show as %' (#3223, before #3236) moves into it once
  const chosen = project?.displayUnits?.[symbol];
  const shownUnit = isPlainUnit(unit) && isPlainUnit(chosen) ? chosen : null;
  useEffect(() => { if (asPct) { if (pctOk && !chosen) setDisplayUnit(symbol, "%"); setAsPct(false); } }, [asPct, pctOk, chosen, symbol]);
  const conv = shownUnit != null && displayFactor(unit, shownUnit) !== 1; // a converted value
  const pct = conv; // the name the code below reads (#3221): 'the grades are shown converted'
  const dispUnit = shownUnit || unitL; // a chosen unit, else the stored one's label (g/t for a precious metal in ppm, #1680)
  const dg = (v) => (conv ? toDisplay(v, unit, shownUnit) : v);
  // TASKS.csv #3221 (review #3195, Galore Creek) — 'Show as %' left the cut-off and 'Including at' boxes in ppm (a 0.2 typed for 0.2 % was a
  // 0.2 ppm cut-off) and the CuEq column in ppm: with it on, the boxes are typed in % and stored in ppm, rounded so the box shows what was typed
  const toStored = (v) => (conv ? fromDisplay(v, unit, shownUnit) : v), shownBox = (v) => (conv ? +toDisplay(v, unit, shownUnit).toPrecision(12) : v); // #3236 — any plain unit
  // TASKS.csv #1387 (review #1352) — a cutoff belongs to its element: Ag 30 ppm became "Cutoff (%) = 30" for Pb. Each element keeps
  // the cutoff last used with it; one not used yet starts at its 90th percentile (one significant figure), said in the box's tooltip.
  // #1678 — the element the tool opens on too (it opened at 0.5 whatever the element: every Cu interval in ppm passed)
  // #3223 — the median and Q3 too, offered beside the P90 suggestion (a porphyry is reported near its median, not its P90)
  // TASKS.csv #3752 (Scottie Gold) — the percentile of the grades weighted by interval length, as Grade stats reads it (the count-based one gave 0.151 where Grade stats said P90
  // 0.100: two tools of one module, two numbers); the box takes it to ONE significant figure (a round cut-off) and the note names the exact figure; the median / Q3 buttons keep two
  const quantileRaw = (sym, q) => {
    const rows = assays.map((a) => ({ v: Number(a.values?.[sym]), w: Number(a.to) - Number(a.from) })).filter((r) => Number.isFinite(r.v) && r.v > 0);
    if (!rows.length) return null;
    const p = weightedPercentile(rows.map((r) => r.v), rows.map((r) => (r.w > 0 ? r.w : 1)), q * 100);
    return Number.isFinite(p) && p > 0 ? p : null;
  };
  const quantileOf = (sym, q, sig = 1) => { const p = quantileRaw(sym, q); return p == null ? null : Number(p.toPrecision(sig)); };
  const p90Of = (sym) => quantileOf(sym, 0.9);
  const [cutoff, setCutoff] = useKeptState(keptScope, "bi.cutoff", () => p90Of(symbol) ?? 0.5);
  const kept0 = keptIn(keptScope);
  if (!kept0.has("bi.cutoffBySymbol")) kept0.set("bi.cutoffBySymbol", {});
  const cutoffBySymbol = useRef(kept0.get("bi.cutoffBySymbol")); // #3223 — kept with the rest
  const suggestCutoff = (sym) => p90Of(sym) ?? cutoff;
  const [suggested, setSuggested] = useKeptState(keptScope, "bi.suggested", () => p90Of(symbol)); // #1678 — the tooltip says the opening cutoff is a suggestion too
  const [cutoffNote, setCutoffNote] = useState(null); // TASKS.csv #2513 — what an element change did to the cut-off
  // TASKS.csv #3069 — a cut-off the user set (not the P90 suggestion) is offered in Grade stats for the same element, this session only
  useEffect(() => { if (suggested == null || cutoff !== suggested) rememberInterceptCutoff(project?.name, symbol, unit, cutoff); }, [cutoff, suggested, symbol, unit, project?.name]);
  const changeSymbol = (sym) => {
    cutoffBySymbol.current[symbol] = cutoff;
    const r = cutoffOnElementChange({ cutoff, typed: suggested == null || cutoff !== suggested, fromUnit: elementUnits[symbol], toUnit: elementUnits[sym], kept: cutoffBySymbol.current[sym] ?? null, suggestion: suggestCutoff(sym) });
    setSymbol(sym); setCutoff(r.cutoff); setSuggested(r.suggested ? r.cutoff : null);
    setCutoffNote(r.note ? { ...r.note, from: symbol, to: sym } : null);
  };
  const [maxInternalDilution, setMaxInternalDilution] = useKeptState(keptScope, "bi.dilution", 2); // kept: #3223
  const [minLength, setMinLength] = useKeptState(keptScope, "bi.minLength", 0);
  const [showAll, setShowAll] = useState(false); // TASKS.csv #4102 — the first 20 rows of the table (the CSV and the Layout table have them all); Show all lists the rest
  const SHOW_FIRST = 20;
  const [perHole, setPerHole] = useState(false); // TASKS.csv #2419 — the intercepts summed per hole (total downhole length, grade × length)
  // TASKS.csv #3562 — the project's Specific gravity layer, when it has readings: 'Weight grades by' length or length × density. #3565 — the table's order and a hole filter.
  const densityRange = densityRangeOf(project), density = useMemo(() => densityLookup(layers?.sg, densityRange), [layers?.sg, densityRange.min, densityRange.max]); // the project's density range: #3682
  const [weightBy, setWeightBy] = useKeptState(keptScope, "bi.weightBy", "length");
  const densityAt = weightBy === "density" && density ? density : null;
  const [sortKey, setSortKey] = useKeptState(keptScope, "bi.sortKey", "gl");
  const [sortDesc, setSortDesc] = useKeptState(keptScope, "bi.sortDesc", true);
  const [holeFilter, setHoleFilter] = useState("");
  const [inclFor, setInclFor] = useState(null); // #3565 — the row whose every 'including' line is listed under the table
  const [minGradeLen, setMinGradeLen] = useKeptState(keptScope, "bi.minGradeLen", 0); // grade × length screening cutoff, e.g. "gram-metres"
  const [includeCutoff, setIncludeCutoff] = useKeptState(keptScope, "bi.includeCutoff", ""); // TASKS.csv #402 — "" = off
  // TASKS.csv #3747 (Scottie Gold review, nuggety gold) — an optional top cut, stored like the cut-off (blank = uncut, the default): each sample cut to it inside an intercept, the cut grade shown beside the uncut one
  const [topCutKept, setTopCut] = useKeptState(keptScope, "bi.topCut", "");
  const topCutStored = topCutKept !== "" && Number(topCutKept) > 0 ? Number(topCutKept) : null;
  // TASKS.csv #402 — metal equivalent: prices/recoveries are ENTERED, never defaulted.
  const [meqOn, setMeqOn] = useKeptState(keptScope, "bi.meqOn", false);
  const [meqInputs, setMeqInputs] = useKeptState(keptScope, "bi.meqInputs", {}); // symbol -> { price, recovery (%) }
  // TASKS.csv #230 — extra elements shown alongside the primary (compositing-anchor) element, e.g.
  // "what's the Ag and Cu over this Au intercept?" — the compositing/cutoff/dilution logic still only
  // ever runs against ONE element (`symbol`, below); these are just additional length-weighted
  // averages over each already-composited interval's fixed from/to window (see avgGradeInRange).
  const [extraSymbolsKept, setExtraSymbols] = useKeptState(keptScope, "bi.extraSymbols", []);
  const extraSymbols = useMemo(() => extraSymbolsKept.filter((s) => alsoSymbols.includes(s)), [extraSymbolsKept, alsoSymbols]); // #3744 — only the chosen source's
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
  // TASKS.csv #3759 (8) — the host domain also offers what Grade statistics, Thresholds and Compositing offer: the sample fields kept at the assay import (Sample · Zone), the collar fields,
  // and the fields of the project's custom interval layers
  const extraDomains = useMemo(() => [...attributeDomainOptions(assaysTable, collars), ...customDomainOptions(keptLayers, { layers, labelOf: (k) => tr(LAYER_META[k]?.label || k) }, { groupTop: 12 })], [assaysTable, collars, keptLayers, layers]);
  const [domainLayer, setDomainLayer] = useState("");
  const domainExtra = extraDomains.find((d) => d.key === domainLayer) || null;
  const domainRows = domainLayer ? (domainExtra ? domainExtra.rows : layers?.[domainLayer] || []) : null;
  const qaqcExcludedCount = useMemo(() => assays.length - excludeQAQC(assays).length, [assays]);
  const reportAssays = useMemo(() => (includeQAQC ? assays : excludeQAQC(assays)), [assays, includeQAQC]);

  // TASKS.csv #504 — built once per assay table / domain layer, NOT per keystroke in the cutoff boxes: the
  // averager groups by hole and caches each hole's resolved segments; the domain rows are grouped by hole so
  // each intercept scans only its own hole (domainsForInterval filters by hole anyway: same result).
  const rangeAvg = useMemo(() => makeRangeAverager(reportAssays, elementUnits, densityAt), [reportAssays, elementUnits, densityAt]); // densityAt: #3562
  const domainByHole = useMemo(() => {
    if (!domainRows) return null;
    const m = new Map();
    domainRows.forEach((d) => { if (!m.has(d.hole_id)) m.set(d.hole_id, []); m.get(d.hole_id).push(d); });
    return m;
  }, [domainRows]);
  // TASKS.csv #402 — the metal equivalent; #1387: above the results, which can now be cut on it (per sample) instead of on `symbol`
  // TASKS.csv #2923 (review #2876, WA iron) — iron ore is sold per tonne at a price for a reference grade with penalties for SiO2, Al2O3 and P:
  // an equivalent that adds them as payable metals has the wrong sign, so a bulk commodity (Fe, Mn, Al) is offered none
  const bulkLead = BULK_COMMODITIES.has(symbol);
  const meqSymbols = useMemo(() => [symbol, ...extraSymbols].filter((s) => !isLoiHeader(s)), [symbol, extraSymbols]); // #2924 — LOI is not a metal to price
  const meqMetals = useMemo(() => (meqOn && !bulkLead ? meqSymbols.map((s) => ({ symbol: s, unit: elementUnits[s] || "ppm", price: Number(meqInputs[s]?.price), recovery: Number(meqInputs[s]?.recovery) / 100, oxide: !!TRADED_OXIDE[s] && meqInputs[s]?.oxide !== false /* #2731 — per lb of the traded oxide unless unticked */ })) : []), [meqOn, symbol, extraSymbols, elementUnits, meqInputs, bulkLead, meqSymbols]);
  const meqReady = meqOn && meqMetals.length > 1 && meqMetals.every((m) => m.price > 0 && m.recovery > 0 && m.recovery <= 1);
  const [cutOnEq, setCutOnEq] = useKeptState(keptScope, "bi.cutOnEq", false);
  const onEq = cutOnEq && meqReady;
  const gradeSym = onEq ? `${symbol}Eq` : symbol; // what the intercepts are cut on and what their grade is
  const shownExtras = useMemo(() => (onEq ? [symbol, ...extraSymbols] : extraSymbols), [onEq, symbol, extraSymbols]); // cut on the equivalent: the base metal's own grade is shown beside it
  const meqCol = meqReady && !onEq; // the equivalent as an extra column only when it is not already the grade
  const eqData = useMemo(() => (onEq ? withMetalEquivalent(reportAssays, meqMetals, elementUnits) : null), [onEq, reportAssays, meqMetals, elementUnits]);
  const ranked = useMemo(() => {
    if (!symbol) return [];
    const A = eqData ? eqData.rows : reportAssays, S = eqData ? eqData.symbol : symbol, U = eqData ? eqData.units : elementUnits;
    let rows = computeBestIntercepts(A, S, unit, U, { cutoff, maxInternalDilution, minLength, densityAt, topCut: topCutStored });
    // TASKS.csv #402 — including sub-intercepts at the higher cutoff, same rules.
    const incC = Number(includeCutoff);
    if (includeCutoff !== "" && Number.isFinite(incC) && incC > cutoff) {
      const stats = rows.stats;
      rows = attachIncluding(rows, computeBestIntercepts(A, S, unit, U, { cutoff: incC, maxInternalDilution, minLength, densityAt }));
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
  }, [reportAssays, symbol, unit, elementUnits, cutoff, maxInternalDilution, minLength, minGradeLen, shownExtras, eqData, tracesByHole, twDipDir, twDip, domainByHole, rangeAvg, includeCutoff, densityAt, topCutStored]);
  // TASKS.csv #3565 — the order (a heading click; grade × length, best first, until one is clicked) and the hole filter: the CSV and the Layout table follow what is shown
  const results = useMemo(() => {
    const f = filterIntercepts(ranked, holeFilter);
    if (sortKey === "gl" && sortDesc) { if (f === ranked) return ranked; f.stats = ranked.stats; return f; }
    return sortIntercepts(f, sortKey, sortDesc);
  }, [ranked, holeFilter, sortKey, sortDesc]);
  const sortBy = (key) => { if (sortKey === key) setSortDesc(!sortDesc); else { setSortKey(key); setSortDesc(key !== "hole" && key !== "from" && key !== "to"); } };
  const sortTh = (key, label, title) => <th style={{ ...th, cursor: "pointer", userSelect: "none" }} title={title || tr("Click to sort by this column")} aria-sort={sortKey === key ? (sortDesc ? "descending" : "ascending") : "none"} tabIndex={0} onClick={() => sortBy(key)} onKeyDown={activateOnKey}>{label}{sortKey === key ? (sortDesc ? " ▼" : " ▲") : ""}</th>;
  // TASKS.csv #3562 — how the grades were weighted: by length x density, by length where no density reaches the intercepts, and the assayed samples that had none
  const weightedRows = ranked.filter((r) => r.weighting === "density").length;
  const noDensitySamples = ranked.reduce((t, r) => t + (r.noDensityN || 0), 0), noDensityMetres = ranked.reduce((t, r) => t + (r.noDensityM || 0), 0);
  const weightedOn = !!densityAt && weightedRows > 0;
  const byDens = tr("by length × density");
  const weightNote = weightedOn ? (noDensitySamples > 0 ? tr("Weighted by length × density. {n} sample(s), {m} m, have no density: the intercept's mean is used.", { n: noDensitySamples.toLocaleString(), m: noDensityMetres.toFixed(2) }) : tr("Grades are weighted by length × density (the project's Specific gravity layer).")) : tr("Grades are weighted by length.");
  // TASKS.csv #3747 — a table of grades says whether they are cut: uncut (the default) or the top cut applied, in the dialog, the Layout note and the CSV
  const cutNote = topCutStored != null
    ? tr("Grade is uncut; the cut column caps each sample at {cut} {unit}.", { cut: +shownBox(topCutStored).toPrecision(6), unit: dispUnit })
    : tr("Grades are uncut: no top cut has been applied.");
  const concentrated = ranked.filter((r) => r.concentration && r.concentration.top2 >= 0.5).length; // #3747 — intercepts that are mostly one or two samples
  // TASKS.csv #3579 — the below-detection sentence only for a project that has a below-detection result in the elements shown
  const hasBelowDet = useMemo(() => { const sy = [symbol, ...extraSymbols]; return reportAssays.some((a) => a.qualifiers && sy.some((x) => a.qualifiers[x] === "<")); }, [reportAssays, symbol, extraSymbols]);
  const incOn = includeCutoff !== "" && Number(includeCutoff) > cutoff; // #402
  const rowKey = (r) => `${r.hole_id}|${r.from}|${r.to}`; // #3565
  const inclRow = inclFor ? results.find((r) => rowKey(r) === inclFor) : null;
  const meqFor = (r) => (meqReady ? metalEquivalent({ [symbol]: r.avgGrade, ...r.extras }, meqMetals) : null);
  const incText = (h) => `${h.length.toFixed(2)} m @ ${h.overRange ? ">=" : ""}${+dg(h.avgGrade).toPrecision(4)} ${dispUnit} (${h.from.toFixed(2)}-${h.to.toFixed(2)})`; // dg: #1680; the unit: #3565

  // "V1 (62%)" for a dominated intercept, "V1 62% · S5 38%" when it genuinely straddles — a report
  // that collapsed a contact-straddling intercept to just its dominant unit would hide exactly the
  // geology this column exists to surface.
  const domainLabel = (d) => {
    if (!d || !d.parts.length) return "—";
    if (d.parts.length === 1) return d.parts[0].value;
    return d.parts.slice(0, 3).map((p) => `${p.value} ${Math.round(p.fraction * 100)}%`).join(" · ");
  };
  // TASKS.csv #2511 — the grade column with one number of decimals for all its rows ('1.77', '0.8187', '2' read ragged): enough for the
  // largest grade to show 4 significant figures
  const gradeDecimals = useMemo(() => { let hi = 0; for (const r of results) { const v = Math.abs(dg(r.avgGrade)); if (v > hi) hi = v; } return hi > 0 ? Math.max(0, Math.min(4, 3 - Math.floor(Math.log10(hi)))) : 2; }, [results, pct]);
  const gradeCol = (v) => (Number.isFinite(v) ? toFixedHalfUp(v, gradeDecimals) : ""); // #3754 (9) — 4.895 reads 4.90, not 4.89
  // TASKS.csv #3565 — grade × length and each 'Also show' column with one number of decimals (204.09, 11.306, 14.962 and 0.07751, 41.77, 3.085 read ragged)
  const glFmt = useMemo(() => columnFormat(results.map((r) => dg(interceptGradeLength(r)))), [results, pct]);
  const exFmt = useMemo(() => Object.fromEntries(shownExtras.map((s) => [s, spreadFormat(results.map((r) => (r.extras?.[s] == null ? null : s === symbol ? dg(r.extras[s]) : r.extras[s])))])), [results, shownExtras, symbol, pct]);
  const { scrollRef, onScroll, startIndex, endIndex, topPad, bottomPad } = useVirtualRows(showAll ? results.length : Math.min(results.length, SHOW_FIRST), RESULT_ROW_H, { containerHeight: 380 });
  // TASKS.csv #3160 (#2925 (9), review #2876) — 'Total per hole' took 2.3 s on its first click: every hole's row was drawn (and summed again
  // on each render). The totals are kept with the results and the rows windowed as the intercepts' are
  const holeRows = useMemo(() => { // #3566 — with the 'Also show' elements' means
    if (!(perHole && results.length)) return [];
    const ex = holeExtraMeans(results, shownExtras);
    return holeTotalsDisplay(holeTotals(results), dg).map((h) => ({ ...h, extras: ex.get(h.hole_id) || {} }));
  }, [perHole, results, pct, shownExtras]); // #3218 — in the shown unit (dg reads pct)
  const hv = useVirtualRows(showAll ? holeRows.length : Math.min(holeRows.length, SHOW_FIRST), RESULT_ROW_H, { containerHeight: 380 });
  // #3566 — the interval table's number format (decimals from the largest value of each column), not three decimals everywhere
  const hGT = useMemo(() => columnFormat(holeRows.map((h) => h.gt)), [holeRows]), hGrade = useMemo(() => columnFormat(holeRows.map((h) => h.meanGrade)), [holeRows]);
  const hExtra = useMemo(() => Object.fromEntries(shownExtras.map((s) => [s, columnFormat(holeRows.map((h) => (h.extras?.[s] == null ? null : s === symbol ? dg(h.extras[s]) : h.extras[s])))])), [holeRows, shownExtras, symbol, pct]);

  // TASKS.csv #911 — the results as a table on the active Layout page (a copy: send again after changing the settings)
  const toLayout = () => {
    // TASKS.csv #2479 — the table is ranked by grade x length, so that column goes on the sheet; #2200 / #2479 — as many rows as fit a free spot
    // TASKS.csv #3019 (review #2876, WA iron) — the 'Also show' elements go on the sheet too (the dialog and the CSV had SiO2, Al2O3, P beside
    // each Fe intercept; the printed table had Fe alone), the table widened for them; with no clear spot on the page it starts a page of its own
    const pageFmt = pageFormatOf(layoutPages.find((pg) => pg.id === activeLayoutPageId)), pageSize = pagePx(pageFmt);
    // TASKS.csv #3876 (#3758) — the share of each intercept's metal in its two richest samples (from four samples up), as the dialog's column: a column of its own
    const concCol = results.some((r) => r.concentration);
    const tableW = Math.min(pageSize.w - 80, 560 + 70 * (shownExtras.length + (concCol ? 1 : 0)));
    // TASKS.csv #3854 — a page of its own gets the data credit along its foot (the store adds it): its table is planned above that line, not over it
    const credit = projectCredits(terrain, rasters, project?.dataCredit), newPage = credit ? [creditsElement(pageFmt, credit)] : [];
    let plan = interceptTablePlan(layoutElements, pageSize, { total: results.length, w: tableW });
    const ownPage = plan.overlaps && typeof addLayoutPages === "function";
    if (ownPage) plan = interceptTablePlan(newPage, pageSize, { total: results.length, w: tableW });
    const columns = [tr("Hole"), tr("From (m)"), tr("To (m)"), tr("Length (m, downhole)") /* #3747 */, ...(twEnabled ? [tr("True width (m)")] : []), `${gradeSym} (${dispUnit}${weightedOn ? `, ${byDens}` : ""})` /* #3562 */, ...(topCutStored != null ? [tr("{symbol} cut to {cut} ({unit})", { symbol: gradeSym, cut: +shownBox(topCutStored).toPrecision(6), unit: dispUnit })] : []) /* #3747 */, tr("Grade × length ({unit} × m)", { unit: dispUnit }), ...(concCol ? [tr("Metal in the two richest samples (%)")] : []) /* #3876 (#3758) */, ...shownExtras.map((s) => `${s} (${gradeUnitLabel(s, elementUnits[s])})`), ...(incOn ? [tr("Including")] : [])]; // dispUnit: #1680; extras: #3019
    // TASKS.csv #2708 — with 'Continue on new pages' every intercept is printed: the first table's rows here, the rest on pages of their own
    const cont = continuePages && plan.more > 0 && typeof addLayoutPages === "function";
    const printed = cont ? results.length : plan.shown;
    const open = interceptOpenEnds(results.slice(0, printed), reportAssays, symbol, collars); // #2608 — a length that is a minimum
    // #3019 — one number of decimals per column (the grade printed '56.07', '59', '58.6'); #2708 — over every printed row, one format on all pages
    const shownRows = results.slice(0, printed), fGrade = columnFormat(shownRows.map((r) => dg(r.avgGrade))), fGT = columnFormat(shownRows.map((r) => dg(interceptGradeLength(r)))), fExtra = Object.fromEntries(shownExtras.map((s) => [s, columnFormat(shownRows.map((r) => r.extras?.[s]))]));
    const allRows = results.slice(0, printed).map((r, i) => [String(r.hole_id), Number(r.from).toFixed(2), Number(r.to).toFixed(2), `${r.unsampledM > 0.05 ? tr("{len} ({s} sampled)", { len: r.length.toFixed(2), s: interceptSampledM(r).toFixed(2) }) : r.length.toFixed(2)}${open[i].top || open[i].bottom ? "+" : ""}` /* #2475; + open: #2608 */, ...(twEnabled ? [r.tw ? r.tw.trueWidth.toFixed(2) : ""] : []), `${r.overRange ? "≥" : ""}${fGrade(dg(r.avgGrade))}`, ...(topCutStored != null ? [r.cutGrade == null ? "" : fGrade(dg(r.cutGrade))] : []) /* #3747 */, fGT(dg(interceptGradeLength(r))) /* #2479; fixed decimals: #3019 */, ...(concCol ? [r.concentration ? String(Math.round(r.concentration.top2 * 100)) : "—"] : []) /* #3876 (#3758) */, ...shownExtras.map((s) => (r.extras?.[s] == null ? "—" : fExtra[s](r.extras[s]))), ...(incOn ? [r.including ? incText(r.including[0]) : ""] : [])]);
    const from = tr("{symbol} ≥ {cutoff} {unit}, dilution ≤ {dil} m, min {min} m", { symbol: gradeSym, cutoff, unit: unitL, dil: maxInternalDilution, min: minLength });
    // TASKS.csv #936 — a printed intercept table is what gets lifted into a report or a news release: it carries the
    // caveats the dialog and the CSV stamp give (QC, over-range, below detection, true width, screening)
    const note = [
      includeQAQC ? tr("QC samples (standards, blanks, duplicates) are included.") : qaqcExcludedCount > 0 ? tr("{n} QC sample(s) (standards, blanks, duplicates) excluded.", { n: qaqcExcludedCount }) : "",
      results.some((r) => r.overRange) ? tr("≥: contains an over-range result counted at its ceiling; the true grade is at least this.") : "",
      weightNote, // #3562 — which weighting the grades have
      cutNote, // #3747 — uncut, or cut to a stated value
      concCol ? tr("Metal in the two richest samples: their share of grade × length (—: under four samples).") : "", // #3876 (#3758)
      hasBelowDet ? tr("Below-detection results are taken at half the detection limit.") : "", // #3579 — only where there are some
      results.slice(0, printed).some((r) => r.unsampledM > 0.05) ? tr("Where a length shows sampled metres, the rest has no result: grade is over the samples only.") : "", // #2475
      open.some((o) => o.top || o.bottom) ? tr("+: reaches the hole's first or last sample: the length is a minimum.") : "", // #2608
      twEnabled ? tr("True width to a structure dipping {dip}° towards {dipDir}°.", { dip: twDip, dipDir: twDipDir }) : tr("Lengths are downhole, not true widths."),
      tr("Screening tool: verify any intercept against the raw assay certificates before reporting it."),
    ].filter(Boolean).join(" ");
    const rows = allRows.slice(0, plan.shown);
    const tail = (text) => [text, ...columns.slice(1).map(() => "")];
    const carriesOn = tail(tr("Continued on the next page")); // #2708
    const stamp = Date.now();
    // TASKS.csv #3866 — one alignment for a column through the document: the numbers right, the hole and the 'Including' text left (a column was right-aligned only on a page where every cell was a bare number: '3.70+' made it left)
    const align = columns.map((_, j) => (j === 0 || (incOn && j === columns.length - 1) ? "left" : "right"));
    const table = { id: `table_${stamp}`, type: "table", source: "static", align, x: plan.x, y: plan.y /* #2479 — a free spot (was 60, 60 over the title); a second send takes the next free spot */, w: tableW /* #3019 */, fontPt: 7, frameWidth: 1,
      title: tr("Best intercepts: {from}", { from }), from, note, columns, rows: plan.more > 0 ? [...rows, cont ? carriesOn : tail(tr("… and {n} more intercept(s), not shown on this sheet", { n: plan.more })) /* #2608 — the sheet's reader has no CSV */] : rows };
    // #2708 — the continuation tables, one per new page, at the top-left margin; the caveats stay on the first table
    const ranges = cont ? continuationRanges(plan.shown, results.length, pageSize, { w: tableW, elements: newPage /* #3854 */ }) : [];
    const contPages = ranges.map(([a, b], k) => ({ name: tr("Best intercepts ({n})", { n: k + 2 }), batch: `intercepts_${stamp}`,
      elements: [{ ...table, id: `table_${stamp}_${k + 1}`, x: 40, y: 40, note: "", title: tr("Best intercepts, continued: {from}", { from }), rows: [...allRows.slice(a, b), ...(b < results.length ? [carriesOn] : [])] }] }));
    if (ownPage) addLayoutPages([{ name: tr("Best intercepts"), elements: [table], ...(cont ? { batch: `intercepts_${stamp}` } : {}) }, ...contPages]); // #3019 — the active page had no clear spot for it
    else {
      setLayoutElements((els) => dropIdleStarterMapFurniture([...els, table]).els); // TASKS.csv #3863 — a table is not a map: the starter page's bar and arrow go (Undo brings them back)
      if (contPages.length) { addLayoutPages(contPages); switchLayoutPage?.(activeLayoutPageId); } // #2708 — back to the page the table starts on
    }
    goToModule("layout");
    onClose();
  };
  const exportCSV = () => {
    // TASKS.csv #1047 (review #1016) — where each intercept is: the collar (E, N, RL, grid azimuth, dip negative = down,
    // EOH) and the intercept's midpoint on the desurveyed trace (project desurvey method), for a press-release table or a
    // grade-thickness long section without a join in Excel
    const loc = interceptLocations(results, collars, survey, desurveyMethod, tracesByHole);
    const rows = interceptRows(results, { symbol: gradeSym, unit, loc, trueWidth: twEnabled ? { dipDir: twDipDir, dip: twDip } : null, domain: !!domainLayer, // #1083 — in lib, tested
      extraSymbols: shownExtras, elementUnits, including: incOn ? { cutoff: includeCutoff, text: incText } : null, meq: meqCol ? meqFor : null, weighted: weightedOn /* #3562 */, topCut: topCutStored, concentration: true /* #3747 */ });
    // #1680 — beside the stored-unit column (avg_<sym>_<stored unit>); #3236 — named for the unit shown, and said in the header
    if (conv) rows.forEach((row, i) => { row[`avg_${gradeSym}_${unitSlug(dispUnit)}`] = +dg(results[i].avgGrade).toPrecision(6); });
    // TASKS.csv #404 — the parameters behind these intercepts, at the top of the file.
    const stampParams = [
      `Element: ${gradeSym} (${unit})${onEq ? " (per-sample metal equivalent)" : ""} | cutoff: ${cutoff} | max consecutive internal dilution: ${maxInternalDilution} m | min intercept length: ${minLength} m | min grade x length: ${minGradeLen}`,
      ...(conv ? [`Display unit: ${gradeSym} is shown in ${dispUnit}; the avg_${gradeSym}_${unitSlug(dispUnit)} column is in ${dispUnit}, every other grade column and the cutoff above in ${unit} (as stored)`] : []), // TASKS.csv #3236
      // TASKS.csv #501/#502 — this now describes what computeBestIntercepts actually does (it used to dilute at zero)
      `Grades: ${weightedOn ? `weighted by length x density (the project's Specific gravity layer; an assayed sample with no density takes the intercept's mean density: ${noDensitySamples} such sample(s), ${noDensityMetres.toFixed(2)} m), over assayed metres only;` : "length-weighted over assayed metres only;"} unsampled / not-assayed metres inside an intercept are left out of the grade and reported per row (unsampled_or_unassayed_m), not diluted in at zero. Empty cells were read at import as either not assayed or below detection ('<DL' at half), as chosen for each file.`,
      topCutStored != null ? `Top cut: each sample cut to ${topCutStored} ${unit} inside an intercept; avg_${gradeSym}_${unit} is UNCUT, avg_${gradeSym}_${unit}_cut is the cut grade, samples_cut counts the samples cut` : "Top cut: none, the grades are UNCUT", // #3747
      "Length is downhole, along the hole, not a true width (see the true width columns when a structure is stated); metal_in_top2_samples_pct is the share of an intercept's grade x length held by its two richest samples (from four samples up)", // #3747
      `QAQC inserts: ${includeQAQC ? "INCLUDED" : `excluded (${qaqcExcludedCount} rows)`}`,
      ASSAY_READING_RULES,
      twEnabled ? `True width: from a ${twDipDir}/${twDip} (dip direction/dip) structure against hole traces desurveyed by ${desurveyMethod || "minimum curvature"}` : "True width: not computed (lengths are downhole)",
      domainLayer ? `Host domain from layer: ${domainExtra ? domainExtra.label : domainLayer}` : null,
      incOn ? `Including sub-intercepts: cutoff ${includeCutoff} ${unit}, same dilution and minimum-length rules, attached to the containing intercept` : null,
      meqReady ? `Metal equivalent (prices and recoveries entered by the user, ${localDate() /* #2358 */}): ${metalEquivalentFormula(meqMetals)}. ${onEq ? `Intercepts are cut on ${gradeSym}, computed per sample; a sample missing any of the metals has no equivalent and is left out of the grade as unassayed.` : `Intercepts are cut on ${symbol} alone, not on the equivalent.`}` : null,
      extraSymbols.length ? `Also averaged over each intercept: ${extraSymbols.join(", ")}` : null,
      holeFilter.trim() ? `Holes shown: those containing "${holeFilter.trim()}"` : null, // #3565
      `Order: ${sortKey === "gl" && sortDesc ? "grade x length, best first" : `${sortKey === "hole" ? "hole, then depth" : sortKey} ${sortDesc ? "descending" : "ascending"}`}`, // #3565
      `Intercepts: ${results.length}`,
    ];
    const stamp = stampLines({ tool: "Best intercepts", version: APP_VERSION, epsg: stampEpsg(project) /* #2195 */, params: stampParams });
    // TASKS.csv #3699 — with 'Total per hole' on, the table on screen is the file: one row a hole, the stamp saying so
    if (perHole && holeRows.length) {
      const holes = holeTotalRows(holeRows, { symbol: gradeSym, dispUnit: unitSlug(dispUnit), weighted: weightedOn, extraSymbols: shownExtras,
        extraUnitOf: (s) => (s === symbol && pct ? unitSlug(dispUnit) : elementUnits[s] || "ppm"), extraValueOf: (s, v) => (s === symbol ? dg(v) : v) });
      const stampH = stampLines({ tool: "Best intercepts, total per hole", version: APP_VERSION, epsg: stampEpsg(project), params: [
        ...stampParams.filter((l) => l && !/^(Order|Intercepts):/.test(l)),
        `Total per hole: each hole's intercepts summed: their total downhole length (not a true thickness), grade x length over the sampled metres (in ${dispUnit} x m), the mean grade over those metres${weightedOn ? " (by length x density)" : ""}${shownExtras.length ? ", and each 'Also show' element's mean over the intercepts, weighted by their lengths" : ""}`,
        `Holes: ${holes.length}; intercepts: ${results.length}`,
      ] });
      saveFile({ suggestedName: `best_intercepts_per_hole_${gradeSym}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: stampedCsv(toExportCsv(holes), stampH) });
      return;
    }
    saveFile({ suggestedName: `best_intercepts_${gradeSym}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: stampedCsv(toExportCsv(rows), stamp) /* TASKS.csv #3614 — the # lines only when asked */ });
  };

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Best intercepts")}</div>
            {/* TASKS.csv #4102 — the intro, "Lengths are downhole" and the uncut caution are in the "?" card; what is said here is true of THIS data */}
            {qaqcExcludedCount > 0 && !includeQAQC && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr(" {qaqcExcludedCount} QC sample(s) (standards/blanks/duplicates) excluded.", { qaqcExcludedCount }).trim()}</div>}
            {(topCutStored != null || concentrated > 0) && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{topCutStored != null ? cutNote : ""}{concentrated > 0 ? (topCutStored != null ? " " : "") + tr("{n} intercept(s) have half their metal in two samples (last column).", { n: concentrated.toLocaleString() }) : ""}</div>}{/* #3747 */}
            {pxrfLeft > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("{n} pXRF reading(s) left out: the grades here come from lab assays only.", { n: pxrfLeft })}</div>}{/* #1673 */}
            </div>
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>{/* TASKS.csv #3578 — the help page of this dialog */}<button data-btn-own="" type="button" className="ge-pane-close ge-pane-help" onClick={() => openHelp("best-intercepts")} aria-label={tr("Help: {name}", { name: tr("Best intercepts") })} title={tr("Help for this tool (F1, works offline)")}>?</button><X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} /></span>
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel}>{tr("Element")}<select value={symbol} onChange={(e) => { changeSymbol(e.target.value); setExtraSymbols((p) => p.filter((s) => s !== e.target.value)); }} style={inp}>
                {symbols.map((s) => <option key={s} value={s}>{s} ({gradeUnitLabel(s, elementUnits[s])})</option>)}
              </select>
            </label>
            {isPlainUnit(unit) && <label style={fieldLabel} title={tr("Unit for {symbol}: here, in Layout and the CSV. Type the cut-off in it; stored values do not change.", { symbol })}>{tr("Show in")}
              <select value={shownUnit || ""} onChange={(e) => setDisplayUnit(symbol, e.target.value || null)} style={inp} aria-label={tr("Show in")}>
                <option value="">{tr("As stored ({unit})", { unit: unitL })}</option>
                {DISPLAY_UNITS.filter((u) => u !== unitL).map((u) => <option key={u} value={u}>{u}</option>)}
              </select></label>}{/* TASKS.csv #3236 */}
            <label style={fieldLabel}>{tr("Cutoff ({unit})", { unit: dispUnit /* #3221 */ })}<NumberInput value={shownBox(cutoff)} onChange={(v) => { setCutoff(toStored(v ?? 0)); setSuggested(null); setCutoffNote(null); }} style={inp} title={suggested != null && cutoff === suggested ? tr("Suggested: this element's 90th percentile. Set the cutoff you report at.") : undefined} />
            </label>
            {suggested != null && cutoff === suggested && (() => { const med = quantileOf(symbol, 0.5, 2), q3 = quantileOf(symbol, 0.75, 2), p90Exact = quantileRaw(symbol, 0.9); return ( /* TASKS.csv #3223 — said beside the box, not only in its tooltip */
              <div role="status" style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", lineHeight: 1.4 }}>
                <span>{p90Exact != null ? tr("Suggested: P90 ({v}, length-weighted), rounded. Or try:", { v: +shownBox(p90Exact).toPrecision(3) }) : tr("Suggested: the 90th percentile. Set the cut-off you report at, or try:")}</span>
                {[[tr("median"), med], [tr("Q3"), q3]].filter(([, v]) => v != null && v !== cutoff).map(([name, v]) => <button className="gs-btn gs-btn--sm" key={name} type="button" onClick={() => { setCutoff(v); setSuggested(null); setCutoffNote(null); }}>{`${name} ${+shownBox(v).toPrecision(4)}`}</button>)}
              </div>); })()}
            {cutoffNote && <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{/* TASKS.csv #2513 */}{cutoffNote.kind === "kept" ? tr("Cut-off {v} kept from {from} (the same unit).", { v: cutoffNote.value, from: cutoffNote.from }) : cutoffNote.kind === "restored" ? tr("Cut-off back to {v}, the one last used for {to}.", { v: cutoffNote.value, to: cutoffNote.to }) : tr("Cut-off reset to the suggestion for {to} ({v}): {to} is not in {from}'s unit.", { v: cutoffNote.value, to: cutoffNote.to, from: cutoffNote.from })}</div>}
            {(() => { const offers = sortedThresholdOffers(drillThresholdOffers(geochemThresholds, symbol, unit)); return offers.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", alignItems: "center" }}>{/* #2347 — offered, never applied */}
              <span>{tr("Saved threshold:")}</span>
              {/* TASKS.csv #3160 (#2925 (1), review #2876) — the four largest populations of 24 (all waste on an iron ore) were the only buttons: every
                  population is offered, highest first, as buttons up to four and as a menu past that */}
              {offers.length > 4 && <select value="" onChange={(e) => { const o = offers.find((x) => x.key === e.target.value); if (o) { setCutoff(o.value); setSuggested(null); } }} aria-label={tr("Saved threshold")} style={{ ...inp, width: "auto", padding: "1px 4px" }}>
                <option value="">{tr("{n} populations, highest first…", { n: offers.length })}</option>
                {offers.map((o) => <option key={o.key} value={o.key}>{`${o.population ? `${o.population.split(": ").pop()} ` : ""}${+shownBox(Number(o.value)).toPrecision(4)}`}</option>)}
              </select>}
              {offers.length <= 4 && offers.map((o) => <button className="gs-btn gs-btn--sm" key={o.key} type="button" onClick={() => { setCutoff(o.value); setSuggested(null); }} title={tr("{rule}{pop}, decided {date}. Click to use it as the cutoff.", { rule: o.rule, pop: o.population ? ` (${o.population})` : "", date: o.decided })}>{o.population ? `${o.population.split(": ").pop()} ` : ""}{+shownBox(Number(o.value)).toPrecision(4)}</button>)}
            </div> : null; })()}
            <label style={fieldLabel} title={tr("Below-cutoff core between two above-cutoff samples still folded into one intercept, diluting its grade.")}>{tr("Max internal dilution (m)")}<NumberInput min="0" value={maxInternalDilution} onChange={(v) => setMaxInternalDilution(Math.max(0, v ?? 0))} style={inp} />
            </label>
            <label style={fieldLabel}>{tr("Min length (m)")}<NumberInput min="0" value={minLength} onChange={(v) => setMinLength(Math.max(0, v ?? 0))} style={inp} />
            </label>
            {maxInternalDilution === 2 && minLength === 0 && <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", alignSelf: "center" }}>{tr("Starting values: set the ones your report uses.")}</span>}{/* #3579 */}
          </div>
          {/* TASKS.csv #4070 part 5 — the rarer settings (the higher cut-off, the top cut, the weighting, the metal equivalent, the extra elements, the true width, the host unit, the QC samples) behind one closed fold: the dialog opens on the element, the cut-off, the dilution and the length */}
          <MoreFold summary={tr("Fine-tune…")} data-fine-tune="best-intercepts">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {qaqcExcludedCount > 0 && (
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title={tr("Include standards, blanks and duplicates. Left out by default so they cannot show as a false best intercept.")}>
              <input type="checkbox" checked={includeQAQC} onChange={(e) => setIncludeQAQC(e.target.checked)} />{tr("Include QC samples (standards/blanks/duplicates) in this report")}</label>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel} title={tr("'Including' sub-intercepts at this higher cutoff, inside their intercept (42 m @ 1.2, including 6 m @ 5.1).")}>{tr("Including at ≥")}<NumberInput allowEmpty min="0" value={includeCutoff === "" ? null : shownBox(Number(includeCutoff))} placeholder={tr("off")} onChange={(v) => setIncludeCutoff(v == null ? "" : String(toStored(v)))} style={inp} aria-label={tr("Including cutoff")} />
            </label>
            <label style={fieldLabel} title={tr("A top cut: each sample's grade is capped at this value; the cut grade shows beside the uncut one.")}>{tr("Top cut ≤")}<NumberInput allowEmpty min="0" value={topCutKept === "" ? null : shownBox(Number(topCutKept))} placeholder={tr("uncut")} onChange={(v) => setTopCut(v == null ? "" : String(toStored(v)))} style={inp} aria-label={tr("Top cut")} />{/* #3747 */}
            </label>
            <label style={fieldLabel} title={tr("Hide intercepts below this grade × length (e.g. gram-metres). 0 shows all.")}>{tr("Min grade × length")}<NumberInput min="0" value={minGradeLen} onChange={(v) => setMinGradeLen(Math.max(0, v ?? 0))} style={inp} />
            </label>
            {density && <label style={fieldLabel} title={tr("Weight grades by metres, or by metres × each sample's density (Specific gravity layer). No density: the others' mean.")}>{tr("Weight grades by")}
              <select value={weightBy} onChange={(e) => setWeightBy(e.target.value)} style={inp} aria-label={tr("Weight grades by")}>
                <option value="length">{tr("Length")}</option>
                <option value="density">{tr("Length × density")}</option>
              </select>
            </label>}
          </div>
          {/* TASKS.csv #402 — metal equivalent from the element + the 'Also show' elements below. */}
          {alsoSymbols.length > 1 && bulkLead && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{tr("No metal equivalent for {symbol}: it is sold per tonne at a reference-grade price, not as payable metals.", { symbol })}</div>}{/* #2923 */}
          {alsoSymbols.length > 1 && !bulkLead && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={meqOn} onChange={(e) => setMeqOn(e.target.checked)} />{" "}{tr("Metal equivalent ({symbol}Eq) from {symbol} and the \"Also show\" elements", { symbol })}</label>
              {meqOn && (
                <div style={{ marginTop: 6, marginLeft: 22, display: "flex", flexDirection: "column", gap: 4 }}>
                  {meqSymbols.filter((s) => !PENALTY_ELEMENTS.has(s) || s === symbol).map((s) => ( /* #2924 — no LOI row; #3754 (7) — no price row for a penalty element (As, Sb, Bi, Hg): nobody is paid for it */
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ minWidth: 34 }}>{elementOptionLabel(s, elementUnits[s]) /* #2923 */}</span>{tr("price")}{" "}<NumberInput allowEmpty min="0" value={meqInputs[s]?.price ?? ""} onChange={(v) => setMeqInputs((p) => ({ ...p, [s]: { ...p[s], price: v == null ? "" : String(v) } }))} style={{ ...inp, width: 80 }} aria-label={tr("{s} price", { s })} /> {TRADED_OXIDE[s] ? <label style={{ display: "inline-flex", alignItems: "center", gap: 3 }} title={TRADED_OXIDE[s].per === "t" ? tr("{oxide} is how {s} is sold: the price per tonne of {oxide} becomes one per tonne of {s} ({f}).", { oxide: TRADED_OXIDE[s].oxide, s, f: TRADED_OXIDE[s].factor }) /* #2771 */ : tr("{oxide} is how {s} is sold: the price per pound of {oxide} becomes one per pound of {s} ({f}).", { oxide: TRADED_OXIDE[s].oxide, s, f: TRADED_OXIDE[s].factor })}><input type="checkbox" checked={meqInputs[s]?.oxide !== false} onChange={(e) => setMeqInputs((p) => ({ ...p, [s]: { ...p[s], oxide: e.target.checked } }))} />{`$/${TRADED_OXIDE[s].per || "lb"} ${TRADED_OXIDE[s].oxide}` /* per t: #2771 */}</label> : null}{tr("{v}recovery", { v: TRADED_OXIDE[s] && meqInputs[s]?.oxide !== false ? " " : (PRECIOUS_METALS.has(s) ? "$/oz" : "$/lb") + " " /* #2923 — '$/lbrecovery' */ })}{/* oxide: #2731 */}{" "}<NumberInput allowEmpty min="1" max="100" value={meqInputs[s]?.recovery ?? ""} onChange={(v) => setMeqInputs((p) => ({ ...p, [s]: { ...p[s], recovery: v == null ? "" : String(v) } }))} style={{ ...inp, width: 60 }} aria-label={tr("{s} recovery %", { s })} /> %
                    </div>
                  ))}
                  <div style={{ color: meqReady ? "var(--color-text-muted)" : "var(--color-danger-icon-strong)" }}>
                    {extraSymbols.length === 0 ? tr("Pick at least one other element under \"Also show\".") : meqReady ? metalEquivalentFormula(meqMetals) : tr("Enter a price and recovery for every element: no equivalent until all are set.")}
                  </div>
                  {meqReady && ( // TASKS.csv #1387
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title={tr("The equivalent is computed per sample and intercepts are built on it. A sample missing a metal is left out.")}>
                      <input type="checkbox" checked={cutOnEq} onChange={(e) => setCutOnEq(e.target.checked)} />{tr("Cut the intercepts on {symbol}Eq, not on {symbol} alone", { symbol })}
                    </label>
                  )}
                </div>
              )}
            </div>
          )}
          {alsoSymbols.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }} title={tr("Extra elements: length-weighted average over each interval; intercepts are still built on the primary element.")}>
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Also show:")}</span>
              {/* TASKS.csv #2356 (review #2325) — a 63-element suite filled half the dialog with tick boxes: above ALSO_MAX elements only the
                  ticked ones are shown (click to remove), the others are in an 'Add an element' list */}
              {(alsoSymbols.length - 1 > ALSO_MAX ? extraSymbols.filter((s) => s !== symbol) : alsoSymbols.filter((s) => s !== symbol)).map((s) => (
                <label key={s} style={{ fontSize: "var(--font-size-sm)", color: extraSymbols.includes(s) ? "var(--color-text)" : "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 3, cursor: "pointer", padding: "3px 7px", borderRadius: 5, border: `1px solid ${extraSymbols.includes(s) ? "var(--color-success-border)" : "var(--color-border)"}` }}>
                  <input type="checkbox" checked={extraSymbols.includes(s)} onChange={() => toggleExtraSymbol(s)} style={{ margin: 0 }} />
                  {s} ({gradeUnitLabel(s, elementUnits[s])})
                </label>
              ))}
              {alsoSymbols.length - 1 > ALSO_MAX && (
                <select aria-label={tr("Add an element")} value="" onChange={(e) => { if (e.target.value) toggleExtraSymbol(e.target.value); }} style={{ fontSize: "var(--font-size-sm)", padding: "3px 6px" }}>
                  <option value="">{tr("Add an element… ({n} more)", { n: alsoSymbols.filter((s) => s !== symbol && !extraSymbols.includes(s)).length })}</option>
                  {alsoSymbols.filter((s) => s !== symbol && !extraSymbols.includes(s)).map((s) => <option key={s} value={s}>{`${s} (${gradeUnitLabel(s, elementUnits[s])})`}</option>)}{/* #3280 (4) — as the Element menu: 'Au (g/t)', not 'Au (ppm)' */}
                </select>
              )}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "7px 9px", background: twEnabled ? "var(--color-selected-bg)" : "var(--color-bg-subtle)", border: `1px solid ${twEnabled ? "var(--color-selected-border)" : "var(--color-border)"}`, borderRadius: 6 }}>
            <label style={{ fontSize: "var(--font-size-sm)", color: collars?.length ? "var(--color-text)" : "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 5, cursor: collars?.length ? "pointer" : "default" }}
              title={collars?.length ? tr("Correct each intercept's downhole length to a true (perpendicular) thickness across the structure.") : tr("Needs collar (and ideally survey) data loaded to know each hole's orientation.")}>
              <input type="checkbox" checked={twOn} disabled={!collars?.length} onChange={(e) => setTwOn(e.target.checked)} style={{ margin: 0 }} />{tr("True width")}</label>
            {twOn && (
              <>
                <label style={{ ...fieldLabel, flexDirection: "row", alignItems: "center", gap: 4 }} title={tr("Dip direction (dip azimuth) of the mineralized structure — 0=N, 90=E.")}>{tr("Structure dip dir")}<NumberInput allowEmpty value={twDipDirText} onChange={(v) => setTwDipDirText(v == null ? "" : String(v))} style={{ ...inp, width: 60 }} aria-label={tr("Structure dip direction")} />
                </label>
                <label style={{ ...fieldLabel, flexDirection: "row", alignItems: "center", gap: 4 }} title={tr("Dip of the mineralized structure, degrees below horizontal.")}>{tr("dip")}<NumberInput allowEmpty min="0" max="90" value={twDipText} onChange={(v) => setTwDipText(v == null ? "" : String(v))} style={{ ...inp, width: 55 }} aria-label={tr("Structure dip")} />
                </label>
                {/* TASKS.csv #3160 (#2925 (7), review #2876) — flat bedding (a bedded iron ore, a palaeochannel) in one click: dip 0, the direction irrelevant */}
                <button className="gs-btn gs-btn--sm" type="button" onClick={() => { setTwDipDirText("0"); setTwDipText("0"); }} title={tr("A horizontal structure (flat bedding): the true width of a vertical hole is its downhole length.")}>{tr("flat (0 / 0)")}</button>
              </>
            )}
            {!collars?.length && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Import collars to enable.")}</span>}
            {twEnabled && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>{tr("Width × |cos θ| to the structure's pole — a factor near 1 means a well-oriented hole.")}</span>}
            {twOn && !twReady && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-icon-strong)" }}>{tr("Enter dip direction and dip (0-90°): no true width until both are set.")}</span>}
          </div>
          {/* TASKS.csv #230 — host domain/lithology per intercept. */}
          {(domainLayerOptions.length > 0 || extraDomains.length > 0) && (
            <label style={{ ...fieldLabel, flexDirection: "row", alignItems: "center", gap: 6 }}
              title={tr("Show which logged unit each intercept sits in — and, when it straddles a contact, the split between units.")}>{tr("Host domain")}<select value={domainLayer} onChange={(e) => setDomainLayer(e.target.value)} style={{ ...inp, width: "auto" }}>
                <option value="">{tr("(none)")}</option>
                {domainLayerOptions.map((k) => <option key={k} value={k}>{LAYER_META[k]?.label || k}</option>)}
                {extraDomains.map((d) => <option key={d.key} value={d.key}>{attributeDomainLabel(d, tr)}</option>)}{/* #3759 (8) */}
              </select>
            </label>
          )}
            </div>
          </MoreFold>

          {ranked.length > 0 && <label style={{ ...fieldLabel, flexDirection: "row", alignItems: "center", gap: 6 }}>{tr("Hole contains")}<input type="search" value={holeFilter} onChange={(e) => setHoleFilter(e.target.value)} style={{ ...inp, width: 150 }} aria-label={tr("Show only the holes whose name contains")} placeholder={tr("hole name")} />{holeFilter.trim() && <span>{tr("{n} of {total} intercepts", { n: results.length.toLocaleString(), total: ranked.length.toLocaleString() })}</span>}</label>}{/* #3565 */}
          {results.length > 0 && (() => { const c = interceptCount(results); return <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{/* TASKS.csv #2200 — how many, with the filters above */}{c.n === 1 ? tr("1 intercept, in 1 hole") : c.holes === 1 ? tr("{n} intercepts, in 1 hole", { n: c.n.toLocaleString() }) : tr("{n} intercepts, in {holes} holes", { n: c.n.toLocaleString(), holes: c.holes.toLocaleString() })}</div>; })()}
          {results.length > 0 && <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer" }} title={tr("Each hole's intercepts summed: downhole length, grade × length and 'Also show' means. For a 2D map: 3D Modelling › Estimation › Grade × thickness in plan.")}><input type="checkbox" checked={perHole} onChange={(e) => setPerHole(e.target.checked)} />{tr("Total per hole")}</label>}{/* #2419 */}
          {perHole && results.length > 0 && (() => { const hs = holeRows; return (
            <div ref={hv.scrollRef} onScroll={hv.onScroll} style={{ overflow: "auto", maxHeight: 380, minHeight: 120, flexShrink: 0 }}>{/* windowed: #3160 */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-base)" }}>
                <thead><tr style={{ position: "sticky", top: 0, background: "var(--color-bg)" }}>{[tr("Hole"), tr("Intercepts"), tr("Total length (m, downhole)"), tr("Grade × length ({unit} × m)", { unit: dispUnit }), `${gradeSym} (${dispUnit}${weightedOn ? `, ${byDens}` : ""})`, ...shownExtras.map((s) => `${s} (${s === symbol && pct ? dispUnit : gradeUnitLabel(s, elementUnits[s])}${weightedOn ? `, ${byDens}` : ""})`)].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{hv.topPad > 0 && <tr style={{ height: hv.topPad }}><td colSpan={5 + shownExtras.length} style={{ padding: 0, border: "none" }} /></tr>}{hs.slice(hv.startIndex, hv.endIndex).map((h) => <tr key={h.hole_id} style={{ height: RESULT_ROW_H, boxSizing: "border-box" }}><td style={td}>{h.hole_id}</td><td style={td}>{h.intercepts}</td><td style={td}>{h.thicknessM.toFixed(2)}</td><td style={td}>{hGT(h.gt)}</td><td style={td}>{h.meanGrade == null ? "—" : hGrade(h.meanGrade)}</td>{shownExtras.map((s) => <td key={s} style={td}>{h.extras?.[s] == null ? "—" : hExtra[s]((s === symbol ? dg(h.extras[s]) : h.extras[s]))}</td>)}</tr>)}{hv.bottomPad > 0 && <tr style={{ height: hv.bottomPad }}><td colSpan={5 + shownExtras.length} style={{ padding: 0, border: "none" }} /></tr>}</tbody>
              </table>
            </div>); })()}
          {perHole && results.length > 0 && !showAll && holeRows.length > SHOW_FIRST && <button type="button" className="gs-btn gs-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowAll(true)}>{tr("Show all {n}", { n: holeRows.length.toLocaleString() })}</button>}
          {perHole && results.length > 0 ? null : symbols.length === 0 ? (
            <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No assay elements loaded — import assays first.")}</div>
          ) : results.length === 0 ? (
            <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{holeFilter.trim() && ranked.length > 0 ? tr("No intercept is in a hole whose name contains \"{text}\".", { text: holeFilter.trim() }) : tr("No intervals meet these criteria — try a lower cutoff or shorter minimum length.")}</div>
          ) : (
            <div ref={scrollRef} onScroll={onScroll} style={{ overflow: "auto", maxHeight: 380, minHeight: 180, flexShrink: 0 }}>{/* #1183: the controls above scroll away; the table keeps its rows */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-base)" }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "var(--color-bg)" }}>
                    {sortTh("hole", tr("Hole"), tr("Click to sort by hole, then depth"))}
                    {sortTh("from", tr("From"))}
                    {sortTh("to", tr("To"))}
                    {sortTh("length", tr("Length (m, downhole)") /* #3747 */)}
                    {twEnabled && <th style={th} title={tr("Downhole length corrected to a true thickness perpendicular to the stated structure.")}>{tr("True width (m)")}</th>}
                    {twEnabled && <th style={th} title={tr("|cos θ| between hole and structure pole: 1 = perpendicular (ideal); near 0 = a grazing cut, its width inflated.")}>{tr("Factor")}</th>}
                    {domainLayer && <th style={th} title={tr("Logged unit(s) hosting this intercept. Percentages shown when it straddles a contact.")}>{tr("Host")}</th>}
                    {sortTh("grade", weightedOn ? tr("Avg {symbol} ({unit}, by length × density)", { symbol: gradeSym, unit: dispUnit }) : tr("Avg {symbol} ({unit})", { symbol: gradeSym, unit: dispUnit }))}
                    {topCutStored != null && <th style={th} title={tr("Each sample limited to the top cut inside the intercept; the grade column before it is uncut.")}>{tr("{symbol} cut to {cut} ({unit})", { symbol: gradeSym, cut: +shownBox(topCutStored).toPrecision(6), unit: dispUnit })}</th>}{/* #3747 */}
                    {sortTh("gl", tr("Grade × length ({unit} × m)", { unit: dispUnit }) /* #2511 — its unit */, tr("Click to sort by grade × length: best intercepts first"))}
                    {optionalInterceptColumns({ including: incOn, metalEquivalent: meqCol }).map((c) => (c === "including"
                      ? <th key={c} style={th}>{tr("Including (≥ {includeCutoff})", { includeCutoff: `${shownBox(Number(includeCutoff))} ${dispUnit}` /* #3221 */ })}</th>
                      : <th key={c} style={th} title={metalEquivalentFormula(meqMetals)}>{tr("{symbol}Eq ({unit})", { symbol, unit: dispUnit /* #3221 */ })}</th>))}
                    {shownExtras.map((s) => <React.Fragment key={s}>{sortTh(`extra:${s}`, weightedOn ? tr("Avg {s} ({v}, by length × density)", { s, v: s === symbol && pct ? dispUnit : gradeUnitLabel(s, elementUnits[s] || "ppm") }) : tr("Avg {s} ({v})", { s, v: s === symbol && pct ? dispUnit : gradeUnitLabel(s, elementUnits[s] || "ppm") /* #3221; #3236 — the unit shown; #3579 — one unit per metal (g/t, as the Element list says) */ }))}</React.Fragment>)}
                    {sortTh("samples", tr("Samples ≥ cutoff"), tr("The assay intervals in the intercept at or above the cutoff"))}{/* #1393 — it counts those only */}
                    <th style={th} title={tr("Share of grade × length in the two richest samples (from four samples): high means a few carry the grade.")}>{tr("Metal in top 2 samples")}</th>{/* #3747 */}
                  </tr>
                </thead>
                <tbody>
                  {topPad > 0 && <tr style={{ height: topPad }}><td colSpan={8 + (topCutStored != null ? 1 : 0) + shownExtras.length + (twEnabled ? 2 : 0) + (domainLayer ? 1 : 0) + (incOn ? 1 : 0) + (meqCol ? 1 : 0)} style={{ padding: 0, border: "none" }} /></tr>}
                  {results.slice(startIndex, endIndex).map((r, i) => (
                    <tr key={startIndex + i} style={{ borderBottom: "1px solid var(--color-hover-bg)", height: RESULT_ROW_H, boxSizing: "border-box" }}>
                      <td style={td}>{r.hole_id}</td>
                      <td style={td}>{r.from.toFixed(2)}</td>
                      <td style={td}>{r.to.toFixed(2)}</td>
                      <td style={td} title={r.unsampledM > 0.05 ? tr("{u} m of this intercept has no result: the grade and grade × length are over the {s} m sampled.", { u: r.unsampledM.toFixed(2), s: interceptSampledM(r).toFixed(2) }) : undefined}>{r.unsampledM > 0.05 ? tr("{len} ({s} sampled)", { len: r.length.toFixed(2), s: interceptSampledM(r).toFixed(2) }) : r.length.toFixed(2)}</td>{/* #2511 — the unsampled metres shown in the dialog too (#2475 did the sheet) */}
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
                          d?.overlapping ? tr("Fix the overlapping intervals in this hole's log: a metre logged as more than one unit sums above 100%.") : null,
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
                          r.unsampledM > 1e-6 ? tr("{unsampledM} m of this intercept has no {symbol} result: left out of the grade, which is over assayed metres only.", { unsampledM: r.unsampledM.toFixed(2), symbol: gradeSym }) : null,
                          r.overlapM > 1e-6 ? tr("{overlapM} m is covered by overlapping assay rows with different results; their average is used.", { overlapM: r.overlapM.toFixed(2) }) : null,
                          r.weighting === "density" ? tr("Weighted by length × density: {byLength} by length alone; mean density {rho} t/m³.", { byLength: gradeCol(dg(r.avgGradeByLength)), rho: +r.meanDensity.toPrecision(4) }) : r.weighting === "length" ? tr("No density in this intercept: its grade is by length.") : null,
                          r.noDensityM > 1e-6 ? tr("{m} m of assayed samples here have no density and took the mean of the rest.", { m: r.noDensityM.toFixed(2) }) : null,
                        ].filter(Boolean).join(" ") || undefined}>
                        {r.overRange ? "≥ " : ""}{gradeCol(dg(r.avgGrade))}{r.overlapM > 1e-6 ? " ⚠" : ""}{/* #2511 — one number of decimals down the column */}
                      </td>
                      {topCutStored != null && <td style={td} title={r.cutN ? tr("{n} sample(s) cut to the top cut in this intercept.", { n: r.cutN }) : undefined}>{r.cutGrade == null ? "—" : gradeCol(dg(r.cutGrade))}{r.cutN ? " ✂" : ""}</td>}{/* #3747 */}
                      <td style={td}>{glFmt(dg(interceptGradeLength(r)))}</td>{/* #2475; one number of decimals down the column: #3565 */}
                      {/* TASKS.csv #1164 — the same order as the header: Including, then the equivalent */}
                      {optionalInterceptColumns({ including: incOn, metalEquivalent: meqCol }).map((c) => (c === "including"
                        ? <td key={c} style={{ ...td, whiteSpace: "nowrap" }} title={r.including ? r.including.map(incText).join("; ") : undefined}>{r.including ? incText(r.including[0]) : "—"}{r.including && r.including.length > 1 && <button data-btn-own="" type="button" onClick={() => setInclFor(inclFor === rowKey(r) ? null : rowKey(r))} aria-expanded={inclFor === rowKey(r)} aria-label={tr("Show every 'including' line of this intercept")} style={{ marginInlineStart: 6, border: "1px solid var(--color-border)", borderRadius: 4, background: "transparent", color: "var(--color-accent-dark)", cursor: "pointer", fontSize: "var(--font-size-sm)", padding: "0 5px" }}>{`+${r.including.length - 1}`}</button>}</td>
                        : <td key={c} style={td}>{(() => { const v = meqFor(r); return v == null ? "—" : `${r.overRange ? "≥ " : ""}${+dg(v).toPrecision(4)}`; })()}</td>))}{/* dg: #3221 */}
                      {shownExtras.map((s) => <td key={s} style={td}>{r.extras[s] == null ? "—" : exFmt[s]((s === symbol ? dg(r.extras[s]) : r.extras[s]))}</td>)}
                      <td style={td}>{r.intervals}</td>
                      <td style={{ ...td, color: r.concentration && r.concentration.top2 >= 0.5 ? "var(--color-warn-text)" : undefined, fontWeight: r.concentration && r.concentration.top2 >= 0.5 ? 600 : 400 }} title={r.concentration ? tr("The richest sample holds {a} % of this intercept's metal, the two richest {b} %, of {n} samples.", { a: Math.round(r.concentration.top1 * 100), b: Math.round(r.concentration.top2 * 100), n: r.concentration.samples }) : tr("Fewer than four samples: not assessed.")}>{r.concentration ? `${Math.round(r.concentration.top2 * 100)} %` : "—"}</td>{/* #3747 */}
                    </tr>
                  ))}
                  {bottomPad > 0 && <tr style={{ height: bottomPad }}><td colSpan={8 + (topCutStored != null ? 1 : 0) + shownExtras.length + (twEnabled ? 2 : 0) + (domainLayer ? 1 : 0) + (incOn ? 1 : 0) + (meqCol ? 1 : 0)} style={{ padding: 0, border: "none" }} /></tr>}
                </tbody>
              </table>
            </div>
          )}
          {!perHole && results.length > SHOW_FIRST && !showAll && <button type="button" className="gs-btn gs-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowAll(true)}>{tr("Show all {n}", { n: results.length.toLocaleString() })}</button>}{/* TASKS.csv #4102 */}

          {inclRow?.including && <div role="region" aria-label={tr("Including lines")} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 10px" }}>{/* #3565 — every 'including' line of one intercept */}
            <div style={{ fontWeight: 600 }}>{tr("{hole} {from}–{to} m: including", { hole: inclRow.hole_id, from: inclRow.from.toFixed(2), to: inclRow.to.toFixed(2) })}</div>
            {inclRow.including.map((h) => <div key={`${h.from}-${h.to}`}>{incText(h)}</div>)}
          </div>}
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
            {/* TASKS.csv #331/#333 — say what was done to the data, not just the result. */}
            {results.stats && (results.stats.duplicatesSkipped > 0 || results.stats.overlappingRows > 0 || results.stats.negativeValues > 0) && (
              <div style={{ color: "var(--color-text-secondary)", marginBottom: 4 }}>
                {tr("{v}. Fix these in the source data for a clean report.", { v: [
                  results.stats.duplicatesSkipped > 0 ? tr("{duplicatesSkipped} exact duplicate row(s) counted once", { duplicatesSkipped: results.stats.duplicatesSkipped }) : null,
                  results.stats.overlappingRows > 0 ? tr("{overlappingRows} row(s) overlap another in the same hole: each metre counts once, differing {symbol} results are averaged (⚠ in the table)", { overlappingRows: results.stats.overlappingRows, symbol }) : null,
                  results.stats.negativeValues > 0 ? tr("{negativeValues} negative {symbol} value(s) treated as not assayed (negative numbers are detection-limit or no-data codes, not grades)", { negativeValues: results.stats.negativeValues, symbol }) : null,
                ].filter(Boolean).join(". ") })}</div>
            )}{weightedOn && noDensitySamples > 0 ? weightNote : null}{/* #3562 weighting: only where a sample has no density; the rest (never below the cutoff, the sort order, below detection, screening only) is in the "?" card: #4102 */}

        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)", alignItems: "center", flexWrap: "wrap" }}>{/* TASKS.csv #4086 — the gold Export sits in the bar beside Close: in view at 1366x768 without scrolling the table */}
          <button className="gs-btn" style={{ flex: 1 }} onClick={onClose}>{tr("Close")}</button>
          <label style={{ display: "flex", alignItems: "center", gap: 5, alignSelf: "center", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }} title={tr("Intercepts that do not fit go on new Layout pages instead of a closing count row")}>
            <input type="checkbox" checked={continuePages} onChange={(e) => setContinuePages(e.target.checked)} />{tr("Continue on new pages")}</label>{/* TASKS.csv #2708 */}
          <CsvStampToggle />{/* TASKS.csv #3614 */}
          <button className="gs-btn" onClick={toLayout} disabled={results.length === 0} title={tr("Put the best intercepts on the Layout page as a table (the CSV has them all)")}>
            <Sheet size={14} />{" "}{tr("To Layout")}</button>{/* TASKS.csv #911 */}
          <button className="gs-btn gs-btn--primary" style={{ flex: 2, justifyContent: "center" }} onClick={exportCSV} disabled={results.length === 0}>
            <Download size={14} />{" "}{perHole ? tr("Export totals per hole (CSV)") : tr("Export report (CSV)")}</button>{/* TASKS.csv #3699 — the button says which table it writes */}
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(1500px, 96vw)", /* #3565 — the dialog uses the window: 880 px cut the last columns off */ maxHeight: "88vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const fieldLabel = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", flexDirection: "column", gap: 4 };
const inp = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit", width: 130 };
const th = { textAlign: "start", padding: "6px 8px", color: "var(--color-text-muted)", fontWeight: 500, borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, background: "var(--color-bg)", whiteSpace: "nowrap" };
const td = { padding: "5px 8px", color: "var(--color-text-strong)", whiteSpace: "nowrap" };
