// TASKS.csv #841 — anomaly thresholds for surface geochemistry (soil, stream sediment, talus, rock chip), judged
// within populations. Matt: "start on 841" (docs/ideas/soils-stream-sediments.md 4.1 + 3.1). The candidate rules are
// shown side by side for every population, drawn on the histogram and the probability plot of the population in
// view, with their assumptions; the geologist picks one and it is saved with the project (store.geochemThresholds),
// so the anomaly maps of #843 can print the rule in their legend. Maths in lib/thresholds.js.
import React, { useEffect, useMemo, useState } from "react";
import { preferredElement } from "../lib/preferredElement.js"; // TASKS.csv #1523
import { useLeadCommodity } from "../lib/useLeadCommodity.js"; // #1523 — Au on an Au-Ag project
import { Download } from "./icons.js";
import { valueIn } from "../lib/geochem.js";
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #2902 — no Math.min / max(...spread) over a population (#371)
import { THRESHOLD_METHODS, MIN_N_BREAKS, MIN_N_ROBUST, candidateThresholds, groupOptions, groupKeyFn, populations, normalQuantile, hasMixedSources, intervalLength, DRILL_DOMAINS, drillDomainKeyFn } from "../lib/thresholds.js"; import { thresholdUnreachable, usableDefaultMethod, LOG_RULES, thresholdScale, ARITH_RULES, isLowRule } from "../lib/thresholds.js"; import { linTicks } from "./GeochemPlot.jsx"; // ARITH_RULES / isLowRule: #3173; // LOG_RULES, thresholdScale, linTicks: #3070 // drill: TASKS.csv #2196
import { DISPLAY_UNITS, isPlainUnit, displayUnitOf, displayFactor, toDisplay } from "../lib/displayUnits.js"; // TASKS.csv #3236 / #3290
import { gradeUnitLabel } from "../lib/geochemColumns.js"; // TASKS.csv #3749 — g/t for a precious metal stored in ppm, in every label here
import { formatLimit, fileCensoring } from "../lib/qaqc.js"; // fileCensoring: #3083 (censoringFloor / reportedStep / zeroResults through it) // TASKS.csv #1520; formatLimit: #2503; reportedStep / zeroResults: #2913
import { attributeDomainOptions, attributeDomainLabel, customDomainOptions } from "../lib/customDomains.js"; // #2504; customDomainOptions: #3108
import { LAYER_META } from "../lib/layers.js"; // TASKS.csv #3108 — the built-in logs' names for their extra fields
import { useStore } from "../lib/store.jsx"; // #2504 — the collars
import { saveFile } from "../lib/desktop.js";
import { backdropProps, sel, th, td, label } from "../lib/modalStyles.js";
import { fontSizes } from "../lib/theme.js";
import { t as tr } from "../lib/i18n.js";
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { thresholdRows, drillThresholdRows } from "../lib/analysisExports.js"; // TASKS.csv #1083; drill: #2196
import { localDate } from "../lib/localDate.js"; // TASKS.csv #2358
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap)

// Okabe & Ito (2008) colour-blind-safe palette, one colour per method (SVG presentation, so plain hex)
const METHOD_COLOURS = { p90: "#999999", p95: "#56B4E9", p98: "#0072B2", mean2sd: "#E69F00", median2mad: "#009E73", tukey: "#CC79A7", probbreak: "#D55E00" };
const fmt = (v) => (v == null || !Number.isFinite(v) ? "—" : v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toPrecision(2));

export default function ThresholdToolkit({ surfaceSamples = [], surfaceElements = [], mapLayers = [], geochemThresholds = [], setGeochemThresholds, onClose, assays = [], assayElements = [], projectLayers = {} /* #2196 */ }) {
  // TASKS.csv #2196 (Matt's decision 2026-11-09) — drill assays as a second source: length-weighted, populations by a logged domain at
  // each interval's middle (Lithology / Alteration / Weathering), saved apart from the surface threshold of the same element
  const drillAssays = useMemo(() => assays.filter((a) => intervalLength(a) != null), [assays]);
  const { collars = [], customLayers = [], project, setDisplayUnit } = useStore(); // #2504; customLayers: #3108; project / setDisplayUnit: #3236
  const [source, setSource] = useState(() => (surfaceElements.length ? "surface" : "drill"));
  const drill = source === "drill";
  const elements = drill ? assayElements : surfaceElements, data = drill ? drillAssays : surfaceSamples;
  const units = useMemo(() => Object.fromEntries(elements.map((e) => [e.symbol, e.unit])), [elements]);
  const lead = useLeadCommodity();
  const [symbol, setSymbol] = useState(() => preferredElement(elements.map((e) => e.symbol), null, lead)); // #1523 — the project's lead commodity, not the first stored (S)
  const isMine = (r) => r.symbol === symbol && (r.source === "drill") === drill; // #2196
  const saved = geochemThresholds.find(isMine) || null;
  // TASKS.csv #2504 — the sample type and the collar's categorical fields as drill populations (RC / core / aircore), beside the logs
  // TASKS.csv #3108 (split from #2915) — and the custom layers' code fields (and the built-in logs' extra ones), as Grade stats and Compositing
  // offer them: a field of more than 30 codes as its 12 commonest and the rest as 'other'
  const attrDomains = useMemo(() => (drill ? [...attributeDomainOptions(drillAssays, collars), ...customDomainOptions(customLayers, { layers: projectLayers, labelOf: (k) => tr(LAYER_META[k]?.label || k) }, { groupTop: 12 })] : []), [drill, drillAssays, collars, customLayers, projectLayers]);
  const domainLayers = useMemo(() => (attrDomains.length ? { ...projectLayers, ...Object.fromEntries(attrDomains.map((d) => [d.key, d.rows])) } : projectLayers), [attrDomains, projectLayers]);
  const gOpts = useMemo(() => (drill ? [...DRILL_DOMAINS.filter((d) => d.value === "none" || projectLayers?.[d.value]?.length).map((d) => ({ ...d, kind: "builtin" })), ...attrDomains.map((d) => ({ value: d.key, label: d.label, kind: "attribute", d }))] : groupOptions(surfaceSamples, mapLayers)), [drill, surfaceSamples, mapLayers, projectLayers, attrDomains]);
  const mixedSources = useMemo(() => !drill && hasMixedSources(surfaceSamples), [drill, surfaceSamples]); // TASKS.csv #932
  const [groupBy, setGroupBy] = useState(() => saved?.groupBy || (drill ? "none" : mixedSources ? "medium_source" : new Set(surfaceSamples.map((s) => s.medium)).size > 1 ? "medium" : "none"));
  const switchSource = (s) => { // #2196 — the other source's elements, its saved rule or the default populations
    const els = s === "drill" ? assayElements : surfaceElements;
    const sym = els.some((e) => e.symbol === symbol) ? symbol : preferredElement(els.map((e) => e.symbol), null, lead);
    const sv = geochemThresholds.find((r) => r.symbol === sym && (r.source === "drill") === (s === "drill"));
    setSource(s); setSymbol(sym); setViewKey(null);
    setGroupBy(sv?.groupBy || (s === "drill" ? "none" : hasMixedSources(surfaceSamples) ? "medium_source" : new Set(surfaceSamples.map((x) => x.medium)).size > 1 ? "medium" : "none"));
    if (sv) setMethod(sv.method);
  };
  const [method, setMethod] = useState(saved?.method || "median2mad");
  useEffect(() => { if (saved) { setGroupBy(gOpts.some((o) => o.value === saved.groupBy) ? saved.groupBy : "none"); setMethod(saved.method); } }, [symbol]); // re-read the saved rule when the element changes

  const unit = units[symbol] || "ppm";
  // TASKS.csv #3236 / #3290 — the element in the project's display unit (project.displayUnits, as Best intercepts and Grade stats): the table, the notes and the
  // plot axes. The rules are worked, and a saved threshold is kept, in the stored unit (the record names it): display only.
  const shownUnit = displayUnitOf(project, symbol, unit), dk = displayFactor(unit, shownUnit);
  const sh = (v) => (v == null || !Number.isFinite(v) || dk === 1 ? v : toDisplay(v, unit, shownUnit));
  const dispUnit = gradeUnitLabel(symbol, shownUnit), storedLabel = gradeUnitLabel(symbol, unit); // #3749 — labels only; dk and the rules stay in the stored unit
  // TASKS.csv #1520 — values on a censoring floor (half the limit substituted in the file) count as <DL, as flagged ones do
  // #2503 — a value the lab flagged '<' (surface: bdl; drill: the qualifier) is below detection by the file's own word: the floor guess of
  // #1520 runs only on the unflagged values, for files that arrive with half the limit already substituted
  const flaggedLt = (s) => !!s.bdl?.includes(symbol) || s.qualifiers?.[symbol] === "<";
  // #2913 — with the zeros the file holds: zeros below the minimum make it the reporting step, not half a limit (no floor, no <DL)
  const { floor, step } = useMemo(() => fileCensoring(data, symbol, unit, units), [data, symbol, unit, units]); // #3083 — the one rule Grade stats uses too (flaggedLt's test)
  const floorOnly = useMemo(() => floor != null && !data.some(flaggedLt), [floor, data, symbol]); // TASKS.csv #3243 (flaggedLt reads symbol) — no result flagged '<': the count is the floor guess
  const keyOfNow = () => (drill ? drillDomainKeyFn(groupBy, domainLayers) /* #2504: + attribute domains */ : groupKeyFn(groupBy, mapLayers, surfaceSamples)); // samples: #1796 — split by medium; drill: #2196
  const pops = useMemo(() => {
    const keyOf = keyOfNow();
    return populations(data, { valueOf: (s) => valueIn(s, symbol, unit, units), censoredOf: (s) => flaggedLt(s) || (floor != null && Math.abs(valueIn(s, symbol, unit, units) - floor.floor) <= floor.floor * 1e-9), zeroOf: (s) => !!s.nd?.includes(symbol), keyOf, ...(drill ? { weightOf: intervalLength } : {}) }) // zeroOf: #931; weightOf: #2196
      .map((p) => ({ ...p, cand: candidateThresholds(p.summary) }));
  }, [data, drill, symbol, unit, units, groupBy, mapLayers, projectLayers, floor]);
  const [viewKey, setViewKey] = useState(null);
  const view = pops.find((p) => p.key === viewKey) || pops[0] || null;
  // TASKS.csv #3070 — a percentage-scale major (Fe, SiO2) opens on arithmetic axes without the log rules; the tick (kept per element and
  // source) brings them back, and a saved log rule opens on log
  const autoScale = useMemo(() => thresholdScale(pops, unit), [pops, unit]);
  const [logChoice, setLogChoice] = useState(null);
  const scaleKey = `${source}|${symbol}`;
  const logOn = logChoice?.key === scaleKey ? logChoice.on : autoScale === "log" || (!!saved && LOG_RULES.has(saved.method));
  // #3173 — the log rules on log axes, the rules on the values (mean ± 2 SD, the arithmetic break) on arithmetic ones; the percentiles on both
  const shownMethods = logOn ? THRESHOLD_METHODS.filter((m) => !ARITH_RULES.has(m.id)) : THRESHOLD_METHODS.filter((m) => !LOG_RULES.has(m.id));
  // TASKS.csv #2507 — with no saved rule, open on a rule every population can reach, or on none (a rule above every sample is no threshold)
  useEffect(() => { if (!saved && pops.length) setMethod((m) => usableDefaultMethod(pops, m || (logOn ? "median2mad" : null), unit)); }, [pops, symbol]); // saved / unit / logOn follow symbol and pops
  useEffect(() => { if ((!logOn && LOG_RULES.has(method)) || (logOn && ARITH_RULES.has(method))) setMethod(null); }, [logOn, method]); // #3070 / #3173 — no hidden rule stays chosen
  const unreachableIn = (id) => pops.filter((p) => thresholdUnreachable(p.cand.values[id], p.summary, unit, isLowRule(id))); // low: #3173
  const chosenUnusable = method ? unreachableIn(method).length > 0 : true;
  const unusableRules = shownMethods.filter((m) => unreachableIn(m.id).length > 0);
  const groupLabel = (k) => (k === "All" ? (drill ? tr("All assays") : tr("All samples")) : k);
  const gLabel = gOpts.find((o) => o.value === groupBy)?.label || groupBy;

  const save = () => {
    const m = THRESHOLD_METHODS.find((x) => x.id === method);
    const rec = {
      symbol, unit, groupBy, groupLabel: gLabel, method, methodLabel: m.label, ref: m.ref,
      values: Object.fromEntries(pops.map((p) => [p.key, p.cand.values[method] ?? null])),
      n: Object.fromEntries(pops.map((p) => [p.key, p.summary.n])),
      censoredPct: Object.fromEntries(pops.map((p) => [p.key, Math.round(p.summary.censoredPct * 10) / 10])),
      ...(pops.some((p) => p.zero) ? { reportedZero: Object.fromEntries(pops.map((p) => [p.key, p.zero])) } : {}), // #931
      decided: localDate(), // #2358 — the local calendar's date, not UTC
      ...(isLowRule(method) ? { direction: "below" } : {}), // #3173 — a depletion: the anomaly maps flag the low side, the cut-off offers skip it
      ...(drill ? { source: "drill", weighting: "length" } : {}), // #2196 — kept apart from the surface rule; project text stays English
    };
    setGeochemThresholds((prev) => [...(prev || []).filter((r) => !isMine(r)), rec]);
  };
  const clear = () => setGeochemThresholds((prev) => (prev || []).filter((r) => !isMine(r)));

  const exportCsv = () => {
    const keyOf = keyOfNow(); // #1796; drill: #2196
    const rows = (drill ? drillThresholdRows : thresholdRows)(data, { symbol, unit, units, pops, keyOf, method, methodLabel: THRESHOLD_METHODS.find((x) => x.id === method)?.label || "none chosen" }); // #1083 — rows in lib, tested; #2507: none chosen
    saveFile({ suggestedName: `${symbol}_${drill ? "drill_" : ""}thresholds.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(rows) });
  };

  // TASKS.csv #4070 (Geochem panes) — on the shared step shell (StepDialog): Data (the source, element, unit and populations, with the saved rule), Rules (the
  // candidates side by side; a column or a rule picks one, a row the population to plot) and Plots (the histogram and the probability plot of one population;
  // Save, the gold primary). How each source is weighted, how to read the table and that the rule is a decision moved into the Help card.
  const [at, setAt] = useState(0);
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{tr("Anomaly thresholds")}</summary>
      <div style={note}>{drill ? tr("Drill assays, length-weighted: candidate thresholds side by side, judged within each population") : tr("Surface samples: candidate thresholds side by side, judged within each population")}</div>
      <div style={{ ...note, marginTop: 6 }}>{drill ? tr("Each assay counts by its length, so close sampling in the ore does not outweigh the background. Group by the lithology, alteration or weathering code each interval overlaps most. The histogram counts intervals.") : tr("Soils over basalt and granite, or in B and C horizons, have different backgrounds: judge each on its own. Group by medium, any sample-file column, or map unit.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("Robust rules need at least {a} samples, the probability-plot break {b}.", { a: MIN_N_ROBUST, b: MIN_N_BREAKS })}</div>
      {!logOn && autoScale === "linear" && <div style={{ ...note, marginTop: 6 }}>{tr("{symbol} reads as a major element: the plots and rules use the values themselves, and the log rules are behind the tick. A major is often read by its cut-offs too (Grade stats, Above cut-off).", { symbol }) /* #3173 */}</div>}
      <div style={{ ...note, marginTop: 6 }}>{tr("Geologists disagree on the right rule. The threshold you save is a decision, stored with its date and rule for review.")}</div>
    </details>
  );
  const ruleLabel = method ? tr(THRESHOLD_METHODS.find((m) => m.id === method)?.label || "") : "";
  const saveStep = { label: method ? tr("Save {rule} for {symbol}", { rule: ruleLabel, symbol }) : tr("Choose a rule (click its column)"), onClick: save, disabled: !pops.length || chosenUnusable /* #2507 */ };
  const noPops = !pops.length ? (drill ? tr("No positive {symbol} values in the drill assays.", { symbol }) : tr("No positive {symbol} values in the surface samples.", { symbol })) : "";
  const steps = [
    { key: "data", label: tr("Data"), primary: { label: tr("Next: rules"), disabled: !pops.length }, hint: noPops, render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          {surfaceElements.length > 0 && drillAssays.length > 0 && assayElements.length > 0 && ( // #2196
            <label style={ctl}>{tr("Source")}<select value={source} onChange={(e) => switchSource(e.target.value)} aria-label={tr("Threshold source")} style={{ ...sel, display: "block", marginTop: 4 }}>
              <option value="surface">{tr("Surface samples")}</option>
              <option value="drill">{tr("Drill assays (length-weighted)")}</option>
            </select></label>
          )}
          <label style={ctl}>{tr("Element")}<select value={symbol} onChange={(e) => { setSymbol(e.target.value); setViewKey(null); }} style={{ ...sel, display: "block", marginTop: 4 }}>
            {elements.map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol} ({gradeUnitLabel(e.symbol, e.unit)})</option>)}
          </select></label>
          {isPlainUnit(unit) && typeof setDisplayUnit === "function" && <label style={ctl} title={tr("The unit {symbol} is shown in here and in Best intercepts and Grade stats. Display only: the rules are worked in the stored unit.", { symbol })}>{tr("Show in")}
            <select value={project?.displayUnits?.[symbol] && project.displayUnits[symbol] !== unit && project.displayUnits[symbol] !== storedLabel ? project.displayUnits[symbol] : ""} onChange={(e) => setDisplayUnit(symbol, e.target.value || null)} style={{ ...sel, display: "block", marginTop: 4 }} aria-label={tr("Show in")}>
              <option value="">{tr("As stored ({unit})", { unit: storedLabel })}</option>
              {DISPLAY_UNITS.filter((u) => u !== unit && u !== storedLabel).map((u) => <option key={u} value={u}>{u}</option>)}
            </select></label>}{/* #3236 / #3290 */}
          <label style={ctl}>{tr("Populations")}<select value={groupBy} onChange={(e) => { setGroupBy(e.target.value); setViewKey(null); }} style={{ ...sel, display: "block", marginTop: 4, maxWidth: 320 }}>
            {gOpts.map((o) => <option key={o.value} value={o.value}>{o.kind === "column" ? tr("Column: {v}", { v: o.label }) : o.kind === "labmeta" ? tr("Lab column: {v}", { v: o.label }) /* #1828 */ : o.kind === "map" ? tr("Map: {v}", { v: o.label }) : o.kind === "attribute" ? attributeDomainLabel(o.d, tr) : tr(o.label)}</option>)}
          </select></label>
        </div>
        {mixedSources && <div style={{ ...note, color: groupBy === "medium_source" || groupBy === "attr:source" ? undefined : "var(--color-warn-text)" }}>{tr("Public survey samples and your own are judged apart by default, as labs, methods and decades differ. GeoStrix does not level one survey to another.")}</div>}
        {saved && (
          <div style={{ ...note, color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px" }}>
            {tr("Saved for {symbol}: {rule}, populations by {groups}, decided {date}.", { symbol, rule: tr(saved.methodLabel), groups: saved.groupLabel, date: saved.decided })}
          </div>
        )}
      </div>
    ) },
    { key: "rules", label: tr("Rules"), primary: { label: tr("Next: plots"), disabled: !pops.length }, render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ overflowX: "auto", flexShrink: 0 }}>{/* #1384: in the column body an overflow box shrank to a 25 px header strip */}
          <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "start" }}>{tr("Population")}</th><th style={th}>n</th><th style={th} title={floorOnly ? tr("No result is flagged '<': this is the share on the column's lowest value, read as half a substituted limit (a guess).") : tr("Share of values reported below the detection limit (stored at half the limit)")}>{tr("On the floor %")}</th>{/* #3243 */}
                {shownMethods.map((m) => (
                  <th key={m.id} style={{ ...th, cursor: "pointer", background: method === m.id ? "var(--color-selected-bg)" : undefined }} title={`${tr(m.label)}${m.ref ? ` (${m.ref})` : ""}: ${tr(m.assumption)}`} onClick={() => setMethod(m.id)}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: METHOD_COLOURS[m.id], marginRight: 4 }} />{tr(m.label)}
                  </th>
                ))}
                <th style={th} title={isLowRule(method) ? tr("Samples at or below the chosen threshold") : tr("Samples at or above the chosen threshold")}>{isLowRule(method) ? tr("Below") : tr("Above")}</th>
              </tr>
            </thead>
            <tbody>
              {pops.map((p) => (
                <tr key={p.key} onClick={() => setViewKey(p.key)} style={{ cursor: "pointer", background: view?.key === p.key ? "var(--color-bg-subtle)" : undefined }}>
                  <td style={{ ...td, textAlign: "start" }}>{groupLabel(p.key)}</td>
                  <td style={td}>{p.summary.n}</td>
                  <td style={{ ...td, color: p.summary.censoredPct > 30 || p.zero ? "var(--color-warn-text)" : undefined }} title={p.zero ? tr("{n} more reported as 0 by the source (below detection or not analysed: the layer does not say), not in n or these statistics", { n: p.zero }) : undefined}>{p.zero ? tr("{pct} (+{n} at 0)", { pct: Math.round(p.summary.censoredPct), n: p.zero }) : Math.round(p.summary.censoredPct)}</td>
                  {shownMethods.map((m) => { const off = thresholdUnreachable(p.cand.values[m.id], p.summary, unit, !!m.low); /* #2507 */ return <td key={m.id} title={off ? tr("Above every sample of this population (its highest is {max} {unit}): no anomaly by this rule", { max: fmt(sh(p.summary.max)), unit: dispUnit }) : undefined} style={{ ...td, fontWeight: method === m.id ? 600 : 400, background: method === m.id ? "var(--color-selected-bg)" : undefined, color: off ? "var(--color-text-disabled)" : undefined, textDecoration: off ? "line-through" : undefined }}>{fmt(sh(p.cand.values[m.id]))}</td>; })}
                  <td style={td}>{p.cand.values[method] == null ? "—" : p.values.filter((v) => (isLowRule(method) ? v <= p.cand.values[method] : v >= p.cand.values[method])).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={note}>{tr("Values in {unit}; click a column to pick its rule.", { unit: dispUnit })}</div>
        <label style={{ ...note, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="checkbox" checked={logOn} onChange={(e) => setLogChoice({ key: scaleKey, on: e.target.checked })} />{tr("Log scale and the log rules")}</label>{/* #3070 */}
        {!logOn && autoScale !== "linear" && <div style={note}>{tr("Arithmetic scale: the log rules are not offered.")}</div>}
        {unusableRules.length > 0 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("Struck through: {rules} land above every sample (or over 100 %) and find no anomaly here, often a sign of two populations. Separate them with the Populations selector; these rules cannot be saved.", { rules: unusableRules.map((m) => tr(m.label)).join(", ") })}</div>}{/* #2507 */}
        {view && view.zero > 0 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("{zero} {symbol} result(s) in \"{pop}\" are 0 in the source (below detection or not analyzed: the layer does not say) and are left out of n and every threshold. If below detection, the thresholds read high.", { zero: view.zero, symbol, pop: groupLabel(view.key) })}</div>}
        {floor && <div style={note}>{tr("{pct} % of the {el} values sit on {floor} {unit}, probably half the detection limit {dl} substituted before import: counted as <DL.", { pct: Math.round(floor.share * 100), el: symbol, floor: formatLimit(sh(floor.floor)), unit: dispUnit, dl: formatLimit(sh(floor.dl)) })}</div>}{/* #1520 */}
        {step && <div style={note}>{tr("{el} is reported to {step} {unit}, with {n} results of 0 below it: {step} is the reporting step, not half a limit, so it is not counted as <DL.", { el: symbol, step: formatLimit(sh(step.step)), unit: dispUnit, n: step.zeros.toLocaleString() })}</div>}{/* #2913 */}
        {view && view.summary.censoredPct > 30 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("{pct}% of {symbol} in \"{pop}\" is below detection: its statistics are mostly about the detection limit.", { pct: Math.round(view.summary.censoredPct), symbol, pop: groupLabel(view.key) })}</div>}
        <div>
          <div style={label}>{tr("The rules")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: "var(--font-size-sm)" }}>
            {shownMethods.map((m) => (
              <label key={m.id} title={`${m.ref ? `${m.ref}. ` : ""}${tr(m.assumption)}`} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="radio" name="th-method" checked={method === m.id} onChange={() => setMethod(m.id)} />
                <span style={{ display: "inline-block", width: 10, height: 3, background: METHOD_COLOURS[m.id] }} />{tr(m.label)}
              </label>
            ))}
          </div>
        </div>
      </div>
    ) },
    { key: "plots", label: tr("Plots"), primary: saveStep, render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          {pops.length > 1 && <label style={ctl}>{tr("Population")}<select value={view?.key ?? ""} onChange={(e) => setViewKey(e.target.value)} style={{ ...sel, display: "block", marginTop: 4, maxWidth: 320 }}>
            {pops.map((p) => <option key={p.key} value={p.key}>{groupLabel(p.key)}</option>)}
          </select></label>}
          <span style={{ flex: 1 }} />
          {saved && <button className="gs-btn" type="button" onClick={clear}>{tr("Remove saved rule")}</button>}
          <button className="gs-btn" type="button" onClick={exportCsv} disabled={!pops.length}><Download size={14} />{tr("Samples with z-scores (CSV)")}</button>
        </div>
        {view && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 360px", minWidth: 0 }}>
              <div style={label}>{logOn ? tr("Histogram — {pop}, log₁₀ {symbol}", { pop: groupLabel(view.key), symbol }) : tr("Histogram — {pop}, {symbol}", { pop: groupLabel(view.key), symbol })}</div>
              <LogHistogram summary={view.summary} values={pickValues(view.cand.values, shownMethods)} method={method} unit={dispUnit} k={dk} log={logOn} />
            </div>
            <div style={{ flex: "1 1 360px", minWidth: 0 }}>
              <div style={label}>{tr("Probability plot — {pop}", { pop: groupLabel(view.key) })}</div>
              <ProbabilityPlot prob={view.cand.prob} values={pickValues(view.cand.values, shownMethods)} method={method} unit={dispUnit} k={dk} log={logOn} />
            </div>
          </div>
        )}
      </div>
    ) },
  ];
  const heading = tr("Anomaly thresholds"); // the dialog's name, seen (not a tooltip)
  return <StepDialog title={heading} onClose={onClose} steps={steps} at={at} onAt={setAt} help={help} width="min(1100px, 96vw)" overlayProps={backdropProps(onClose)} />;
}

// TASKS.csv #3070 — the candidates of the rules shown only (a hidden log rule draws no line)
const pickValues = (values, shown) => Object.fromEntries(shown.map((m) => [m.id, values[m.id]]));
// the axis: log10 decades, or (#3070, a percentage-scale major) arithmetic with round ticks; f maps a value to the axis, inv back
const axisOf = (log) => (log ? { f: Math.log10, inv: (d) => 10 ** d, ticks: (a, b) => { const t = []; for (let d = Math.floor(a); d <= Math.ceil(b); d++) if (d >= a - 1e-9 && d <= b) t.push(d); return t; } } : { f: (v) => v, inv: (v) => v, ticks: (a, b) => linTicks(a, b, 5).filter((t) => t >= a - 1e-9 && t <= b) });
// Histogram of log10 values (or of the values, #3070) with a vertical line per candidate (the chosen one thick)
function LogHistogram({ summary, values, method, unit, k = 1, log = true }) { // k: the stored -> shown unit factor (axis labels only, #3236)
  const w = 420, h = 190, pl = 34, pb = 30, pr = 8, pt = 8;
  const ax = axisOf(log), L = log ? summary.sortedLog : summary.sorted, lo = L[0], hi = L[L.length - 1];
  const tVals = Object.values(values).filter((v) => v > 0).map(ax.f);
  const x0 = Math.min(lo, ...tVals), x1 = Math.max(hi, ...tVals) + 1e-9, nb = Math.max(8, Math.min(40, Math.round(Math.sqrt(L.length) * 1.5)));
  const bins = new Array(nb).fill(0);
  L.forEach((v) => { bins[Math.min(nb - 1, Math.floor(((v - x0) / (x1 - x0)) * nb))]++; });
  const maxC = arrMax(bins), X = (v) => pl + ((v - x0) / (x1 - x0)) * (w - pl - pr), Y = (c) => h - pb - (c / maxC) * (h - pb - pt);
  const ticks = ax.ticks(x0, x1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={log ? tr("Histogram of log values with the candidate thresholds") : tr("Histogram of the values with the candidate thresholds")} style={{ display: "block" }}>
      {bins.map((c, i) => <rect key={i} x={X(x0 + (i * (x1 - x0)) / nb) + 0.5} y={Y(c)} width={Math.max(0.5, (w - pl - pr) / nb - 1)} height={h - pb - Y(c)} style={{ fill: "var(--color-border-light)" }} />)}
      <line x1={pl} x2={w - pr} y1={h - pb} y2={h - pb} style={{ stroke: "var(--color-border)" }} />
      {ticks.map((d) => <text key={d} x={X(d)} y={h - pb + 13} textAnchor="middle" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{fmt(ax.inv(d) * k)}</text>)}
      <text x={w - pr} y={h - 3} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{unit}</text>
      {THRESHOLD_METHODS.map((m) => values[m.id] > 0 && <line key={m.id} x1={X(ax.f(values[m.id]))} x2={X(ax.f(values[m.id]))} y1={pt} y2={h - pb} style={{ stroke: METHOD_COLOURS[m.id], strokeWidth: m.id === method ? 2.5 : 1, strokeDasharray: m.id === method ? undefined : "3 3" }} />)}
    </svg>
  );
}

// Normal score (x) against log10 value (y; the value itself on an arithmetic axis, #3070); candidates as horizontal lines, the break marked
function ProbabilityPlot({ prob, values, method, unit, k = 1, log = true }) {
  if (!prob?.points?.length) return null;
  const w = 420, h = 190, pl = 40, pb = 26, pr = 8, pt = 8, ax = axisOf(log);
  const P = log ? prob.points : prob.points.map(([z, l]) => [z, 10 ** l]); // prob.points hold log10 values
  const ys = P.map((p) => p[1]), tVals = Object.values(values).filter((v) => v > 0).map(ax.f);
  // TASKS.csv #2902 (WA iron review) — ys has one point per sample: Math.min(...ys) on Fe's 147,659 values overflowed the call stack and
  // closed the Geochem tab ('Maximum call stack size exceeded'); arrMin / arrMax loop, the few candidate lines are compared after
  const y0 = Math.min(arrMin(ys), ...tVals), y1 = Math.max(arrMax(ys), ...tVals) + 1e-9, x0 = P[0][0], x1 = P[P.length - 1][0] + 1e-9;
  const X = (v) => pl + ((v - x0) / (x1 - x0)) * (w - pl - pr), Y = (v) => h - pb - ((v - y0) / (y1 - y0)) * (h - pb - pt);
  const step = Math.max(1, Math.floor(P.length / 800)); // draw at most ~800 points
  const pctTicks = [0.01, 0.1, 0.5, 0.9, 0.99].map((q) => [q, normalQuantile(q)]).filter(([, z]) => z >= x0 && z <= x1);
  const yTicks = ax.ticks(y0, y1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("Probability plot with the candidate thresholds")} style={{ display: "block" }}>
      <line x1={pl} x2={pl} y1={pt} y2={h - pb} style={{ stroke: "var(--color-border)" }} />
      <line x1={pl} x2={w - pr} y1={h - pb} y2={h - pb} style={{ stroke: "var(--color-border)" }} />
      {yTicks.map((d) => <text key={d} x={pl - 4} y={Y(d) + 3} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{fmt(ax.inv(d) * k)}</text>)}
      {pctTicks.map(([q, z]) => <text key={q} x={X(z)} y={h - pb + 13} textAnchor="middle" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{`${q * 100}%`}</text>)}
      <text x={w - pr} y={h - 2} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{tr("cumulative %")}</text>
      <text x={4} y={pt + 8} fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{unit}</text>
      {THRESHOLD_METHODS.map((m) => values[m.id] > 0 && <line key={m.id} x1={pl} x2={w - pr} y1={Y(ax.f(values[m.id]))} y2={Y(ax.f(values[m.id]))} style={{ stroke: METHOD_COLOURS[m.id], strokeWidth: m.id === method ? 2.5 : 1, strokeDasharray: m.id === method ? undefined : "3 3" }} />)}
      {P.filter((_, i) => i % step === 0).map(([x, y], i) => <circle key={i} cx={X(x)} cy={Y(y)} r={1.6} style={{ fill: "var(--color-text-secondary)" }} />)}
      {log && prob.breakIndex != null && <circle cx={X(P[prob.breakIndex][0])} cy={Y(P[prob.breakIndex][1])} r={4.5} style={{ fill: "none", stroke: METHOD_COLOURS.probbreak, strokeWidth: 2 }} />}
    </svg>
  );
}
const ctl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };
