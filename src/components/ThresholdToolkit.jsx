// TASKS.csv #841 — anomaly thresholds for surface geochemistry (soil, stream sediment, talus, rock chip), judged
// within populations. Matt: "start on 841" (docs/ideas/soils-stream-sediments.md 4.1 + 3.1). The candidate rules are
// shown side by side for every population, drawn on the histogram and the probability plot of the population in
// view, with their assumptions; the geologist picks one and it is saved with the project (store.geochemThresholds),
// so the anomaly maps of #843 can print the rule in their legend. Maths in lib/thresholds.js.
import React, { useEffect, useMemo, useState } from "react";
import { preferredElement } from "../lib/preferredElement.js"; // TASKS.csv #1523
import { useLeadCommodity } from "../lib/useLeadCommodity.js"; // #1523 — Au on an Au-Ag project
import { X, Download } from "./icons.js";
import { valueIn } from "../lib/geochem.js";
import { THRESHOLD_METHODS, MIN_N_BREAKS, MIN_N_ROBUST, candidateThresholds, groupOptions, groupKeyFn, populations, normalQuantile, hasMixedSources, intervalLength, DRILL_DOMAINS, drillDomainKeyFn } from "../lib/thresholds.js"; import { thresholdUnreachable, usableDefaultMethod } from "../lib/thresholds.js"; // drill: TASKS.csv #2196
import { censoringFloor, formatLimit } from "../lib/qaqc.js"; // TASKS.csv #1520; formatLimit: #2503
import { attributeDomainOptions, attributeDomainLabel } from "../lib/customDomains.js"; // #2504
import { useStore } from "../lib/store.jsx"; // #2504 — the collars
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { saveFile } from "../lib/desktop.js";
import { overlay, backdropProps, sel, th, td, label, panel, header, rowBtn as btn } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { fontSizes } from "../lib/theme.js";
import { t as tr } from "../lib/i18n.js";
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { thresholdRows, drillThresholdRows } from "../lib/analysisExports.js"; // TASKS.csv #1083; drill: #2196
import { localDate } from "../lib/localDate.js"; // TASKS.csv #2358

// Okabe & Ito (2008) colour-blind-safe palette, one colour per method (SVG presentation, so plain hex)
const METHOD_COLOURS = { p90: "#999999", p95: "#56B4E9", p98: "#0072B2", mean2sd: "#E69F00", median2mad: "#009E73", tukey: "#CC79A7", probbreak: "#D55E00" };
const fmt = (v) => (v == null || !Number.isFinite(v) ? "—" : v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toPrecision(2));

export default function ThresholdToolkit({ surfaceSamples = [], surfaceElements = [], mapLayers = [], geochemThresholds = [], setGeochemThresholds, onClose, assays = [], assayElements = [], projectLayers = {} /* #2196 */ }) {
  useEscapeKey(onClose);
  useFocusTrap();
  // TASKS.csv #2196 (Matt's decision 2026-11-09) — drill assays as a second source: length-weighted, populations by a logged domain at
  // each interval's middle (Lithology / Alteration / Weathering), saved apart from the surface threshold of the same element
  const drillAssays = useMemo(() => assays.filter((a) => intervalLength(a) != null), [assays]);
  const { collars = [] } = useStore(); // #2504
  const [source, setSource] = useState(() => (surfaceElements.length ? "surface" : "drill"));
  const drill = source === "drill";
  const elements = drill ? assayElements : surfaceElements, data = drill ? drillAssays : surfaceSamples;
  const units = useMemo(() => Object.fromEntries(elements.map((e) => [e.symbol, e.unit])), [elements]);
  const lead = useLeadCommodity();
  const [symbol, setSymbol] = useState(() => preferredElement(elements.map((e) => e.symbol), null, lead)); // #1523 — the project's lead commodity, not the first stored (S)
  const isMine = (r) => r.symbol === symbol && (r.source === "drill") === drill; // #2196
  const saved = geochemThresholds.find(isMine) || null;
  // TASKS.csv #2504 — the sample type and the collar's categorical fields as drill populations (RC / core / aircore), beside the logs
  const attrDomains = useMemo(() => (drill ? attributeDomainOptions(drillAssays, collars) : []), [drill, drillAssays, collars]);
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
  // TASKS.csv #1520 — values on a censoring floor (half the limit substituted in the file) count as <DL, as flagged ones do
  // #2503 — a value the lab flagged '<' (surface: bdl; drill: the qualifier) is below detection by the file's own word: the floor guess of
  // #1520 runs only on the unflagged values, for files that arrive with half the limit already substituted
  const flaggedLt = (s) => !!s.bdl?.includes(symbol) || s.qualifiers?.[symbol] === "<";
  const floor = useMemo(() => censoringFloor(data.filter((s) => !flaggedLt(s)).map((s) => valueIn(s, symbol, unit, units))), [data, symbol, unit, units]); // flaggedLt reads symbol only
  const keyOfNow = () => (drill ? drillDomainKeyFn(groupBy, domainLayers) /* #2504: + attribute domains */ : groupKeyFn(groupBy, mapLayers, surfaceSamples)); // samples: #1796 — split by medium; drill: #2196
  const pops = useMemo(() => {
    const keyOf = keyOfNow();
    return populations(data, { valueOf: (s) => valueIn(s, symbol, unit, units), censoredOf: (s) => flaggedLt(s) || (floor != null && Math.abs(valueIn(s, symbol, unit, units) - floor.floor) <= floor.floor * 1e-9), zeroOf: (s) => !!s.nd?.includes(symbol), keyOf, ...(drill ? { weightOf: intervalLength } : {}) }) // zeroOf: #931; weightOf: #2196
      .map((p) => ({ ...p, cand: candidateThresholds(p.summary) }));
  }, [data, drill, symbol, unit, units, groupBy, mapLayers, projectLayers, floor]);
  const [viewKey, setViewKey] = useState(null);
  const view = pops.find((p) => p.key === viewKey) || pops[0] || null;
  // TASKS.csv #2507 — with no saved rule, open on a rule every population can reach, or on none (a rule above every sample is no threshold)
  useEffect(() => { if (!saved && pops.length) setMethod((m) => usableDefaultMethod(pops, m || "median2mad", unit)); }, [pops, symbol]); // saved / unit follow symbol and pops
  const unreachableIn = (id) => pops.filter((p) => thresholdUnreachable(p.cand.values[id], p.summary, unit));
  const chosenUnusable = method ? unreachableIn(method).length > 0 : true;
  const unusableRules = THRESHOLD_METHODS.filter((m) => unreachableIn(m.id).length > 0);
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

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panelBox} role="dialog" aria-modal="true" aria-label={tr("Anomaly thresholds")} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Anomaly thresholds")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{drill ? tr("Drill assays, length-weighted: candidate thresholds side by side, judged within each population") : tr("Surface samples: candidate thresholds side by side, judged within each population")}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            {surfaceElements.length > 0 && drillAssays.length > 0 && assayElements.length > 0 && ( // #2196
              <label style={ctl}>{tr("Source")}<select value={source} onChange={(e) => switchSource(e.target.value)} aria-label={tr("Threshold source")} style={{ ...sel, display: "block", marginTop: 4 }}>
                <option value="surface">{tr("Surface samples")}</option>
                <option value="drill">{tr("Drill assays (length-weighted)")}</option>
              </select></label>
            )}
            <label style={ctl}>{tr("Element")}<select value={symbol} onChange={(e) => { setSymbol(e.target.value); setViewKey(null); }} style={{ ...sel, display: "block", marginTop: 4 }}>
              {elements.map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol} ({e.unit})</option>)}
            </select></label>
            <label style={ctl}>{tr("Populations")}<select value={groupBy} onChange={(e) => { setGroupBy(e.target.value); setViewKey(null); }} style={{ ...sel, display: "block", marginTop: 4, maxWidth: 320 }}>
              {gOpts.map((o) => <option key={o.value} value={o.value}>{o.kind === "column" ? tr("Column: {v}", { v: o.label }) : o.kind === "labmeta" ? tr("Lab column: {v}", { v: o.label }) /* #1828 */ : o.kind === "map" ? tr("Map: {v}", { v: o.label }) : o.kind === "attribute" ? attributeDomainLabel(o.d, tr) : tr(o.label)}</option>)}
            </select></label>
          </div>
          {drill
            ? <div style={note}>{tr("Each assay counts by its length: a 3 m interval three times a 1 m one, so close sampling in the ore does not outweigh the background. Judge each domain against its own population: group by the lithology, alteration or weathering code each interval overlaps most. The histogram counts intervals.")}</div>
            : <div style={note}>{tr("A soil over basalt and one over granite, or a B and a C horizon, have different backgrounds: judge each against its own population. Group by medium, by any column of your sample file (horizon, landform, lab, year...), or by the map unit each sample falls in.")}</div>}
          {mixedSources && <div style={{ ...note, color: groupBy === "medium_source" || groupBy === "attr:source" ? undefined : "var(--color-warn-text)" }}>{tr("Public survey samples and your own are judged apart by default (medium and source): different labs, methods and decades. GeoStrix does not level one survey to another.")}</div>}
          {saved && (
            <div style={{ ...note, color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px" }}>
              {tr("Saved for {symbol}: {rule}, populations by {groups}, decided {date}.", { symbol, rule: tr(saved.methodLabel), groups: saved.groupLabel, date: saved.decided })}
            </div>
          )}

          {!pops.length ? (
            <div style={note}>{drill ? tr("No positive {symbol} values in the drill assays.", { symbol }) : tr("No positive {symbol} values in the surface samples.", { symbol })}</div>
          ) : (
            <>
              <div style={{ overflowX: "auto", flexShrink: 0 }}>{/* #1384: in the column body an overflow box shrank to a 25 px header strip */}
                <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: "start" }}>{tr("Population")}</th><th style={th}>n</th><th style={th} title={tr("Share of values reported below the detection limit (stored at half the limit)")}>{tr("<DL %")}</th>
                      {THRESHOLD_METHODS.map((m) => (
                        <th key={m.id} style={{ ...th, cursor: "pointer", background: method === m.id ? "var(--color-selected-bg)" : undefined }} title={`${tr(m.label)}${m.ref ? ` (${m.ref})` : ""}: ${tr(m.assumption)}`} onClick={() => setMethod(m.id)}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: METHOD_COLOURS[m.id], marginRight: 4 }} />{tr(m.label)}
                        </th>
                      ))}
                      <th style={th} title={tr("Samples at or above the chosen threshold")}>{tr("Above")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pops.map((p) => (
                      <tr key={p.key} onClick={() => setViewKey(p.key)} style={{ cursor: "pointer", background: view?.key === p.key ? "var(--color-bg-subtle)" : undefined }}>
                        <td style={{ ...td, textAlign: "start" }}>{groupLabel(p.key)}</td>
                        <td style={td}>{p.summary.n}</td>
                        <td style={{ ...td, color: p.summary.censoredPct > 30 || p.zero ? "var(--color-warn-text)" : undefined }} title={p.zero ? tr("{n} more reported as 0 by the source (below detection or not analysed: the layer does not say), not in n or these statistics", { n: p.zero }) : undefined}>{p.zero ? tr("{pct} (+{n} at 0)", { pct: Math.round(p.summary.censoredPct), n: p.zero }) : Math.round(p.summary.censoredPct)}</td>
                        {THRESHOLD_METHODS.map((m) => { const off = thresholdUnreachable(p.cand.values[m.id], p.summary, unit); /* #2507 */ return <td key={m.id} title={off ? tr("Above every sample of this population (its highest is {max} {unit}): no anomaly by this rule", { max: fmt(p.summary.max), unit }) : undefined} style={{ ...td, fontWeight: method === m.id ? 600 : 400, background: method === m.id ? "var(--color-selected-bg)" : undefined, color: off ? "var(--color-text-disabled)" : undefined, textDecoration: off ? "line-through" : undefined }}>{fmt(p.cand.values[m.id])}</td>; })}
                        <td style={td}>{p.cand.values[method] == null ? "—" : p.values.filter((v) => v >= p.cand.values[method]).length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={note}>{tr("Values in {unit}. Click a column to choose its rule, a row to plot that population. Robust rules need at least {a} samples; the probability-plot break needs {b} and is suggested only where the plot really bends.", { unit, a: MIN_N_ROBUST, b: MIN_N_BREAKS })}</div>
              {unusableRules.length > 0 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("Struck through: {rules} land above every sample of their population (or over 100 %): such a rule finds no anomaly here, often a sign of two populations. The probability plot's break and the Populations selector separate them; these rules cannot be saved.", { rules: unusableRules.map((m) => tr(m.label)).join(", ") })}</div>}{/* #2507 */}
              {view && view.zero > 0 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("{zero} {symbol} result(s) in \"{pop}\" were reported as 0 by the source (below detection or not analysed: the layer does not say). They are left out of n and of every threshold here; if they are below detection, the thresholds read high.", { zero: view.zero, symbol, pop: groupLabel(view.key) })}</div>}
              {floor && <div style={note}>{tr("{pct} % of the {el} values sit on {floor} {unit}, probably half the detection limit {dl} substituted before import: counted as <DL.", { pct: Math.round(floor.share * 100), el: symbol, floor: formatLimit(floor.floor), unit, dl: formatLimit(floor.dl) })}</div>}{/* #1520 */}
              {view && view.summary.censoredPct > 30 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("{pct}% of {symbol} in \"{pop}\" is below detection: its statistics are mostly about the detection limit.", { pct: Math.round(view.summary.censoredPct), symbol, pop: groupLabel(view.key) })}</div>}

              {view && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 360px", minWidth: 0 }}>
                    <div style={label}>{tr("Histogram — {pop}, log₁₀ {symbol}", { pop: groupLabel(view.key), symbol })}</div>
                    <LogHistogram summary={view.summary} values={view.cand.values} method={method} unit={unit} />
                  </div>
                  <div style={{ flex: "1 1 360px", minWidth: 0 }}>
                    <div style={label}>{tr("Probability plot — {pop}", { pop: groupLabel(view.key) })}</div>
                    <ProbabilityPlot prob={view.cand.prob} values={view.cand.values} method={method} unit={unit} />
                  </div>
                </div>
              )}

              <div>
                <div style={label}>{tr("The rules")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: "var(--font-size-sm)" }}>
                  {THRESHOLD_METHODS.map((m) => (
                    <React.Fragment key={m.id}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", whiteSpace: "nowrap" }}>
                        <input type="radio" name="th-method" checked={method === m.id} onChange={() => setMethod(m.id)} />
                        <span style={{ display: "inline-block", width: 10, height: 3, background: METHOD_COLOURS[m.id] }} />{tr(m.label)}
                      </label>
                      <span style={{ color: "var(--color-text-secondary)" }}>{m.ref ? `${m.ref}. ` : ""}{tr(m.assumption)}</span>
                    </React.Fragment>
                  ))}
                </div>
                <div style={{ ...note, marginTop: 6 }}>{tr("Geologists disagree on which rule is right, and none of them knows the geology. The threshold you save is a decision: it is stored with the project, with the date and rule, so it can be reviewed.")}</div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)", flexWrap: "wrap" }}>
          <button type="button" onClick={save} disabled={!pops.length || chosenUnusable /* #2507 */} style={{ ...btn(true), opacity: !pops.length || chosenUnusable ? 0.5 : 1 }}>{method ? tr("Save {rule} for {symbol}", { rule: tr(THRESHOLD_METHODS.find((m) => m.id === method)?.label || ""), symbol }) : tr("Choose a rule (click its column)")}</button>
          {saved && <button type="button" onClick={clear} style={btn(false)}>{tr("Remove saved rule")}</button>}
          <button type="button" onClick={exportCsv} disabled={!pops.length} style={{ ...btn(false), display: "flex", alignItems: "center", gap: 6 }}><Download size={14} />{tr("Samples with z-scores (CSV)")}</button>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={btn(false)}>{tr("Close")}</button>
        </div>
      </div>
    </div>
  );
}

// Histogram of log10 values with a vertical line per candidate (the chosen one thick)
function LogHistogram({ summary, values, method, unit }) {
  const w = 420, h = 190, pl = 34, pb = 30, pr = 8, pt = 8;
  const L = summary.sortedLog, lo = L[0], hi = L[L.length - 1];
  const tVals = Object.values(values).filter((v) => v > 0).map(Math.log10);
  const x0 = Math.min(lo, ...tVals), x1 = Math.max(hi, ...tVals) + 1e-9, nb = Math.max(8, Math.min(40, Math.round(Math.sqrt(L.length) * 1.5)));
  const bins = new Array(nb).fill(0);
  L.forEach((v) => { bins[Math.min(nb - 1, Math.floor(((v - x0) / (x1 - x0)) * nb))]++; });
  const maxC = Math.max(...bins), X = (v) => pl + ((v - x0) / (x1 - x0)) * (w - pl - pr), Y = (c) => h - pb - (c / maxC) * (h - pb - pt);
  const ticks = []; for (let d = Math.floor(x0); d <= Math.ceil(x1); d++) if (d >= x0 - 1e-9 && d <= x1) ticks.push(d);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("Histogram of log values with the candidate thresholds")} style={{ display: "block" }}>
      {bins.map((c, i) => <rect key={i} x={X(x0 + (i * (x1 - x0)) / nb) + 0.5} y={Y(c)} width={Math.max(0.5, (w - pl - pr) / nb - 1)} height={h - pb - Y(c)} style={{ fill: "var(--color-border-light)" }} />)}
      <line x1={pl} x2={w - pr} y1={h - pb} y2={h - pb} style={{ stroke: "var(--color-border)" }} />
      {ticks.map((d) => <text key={d} x={X(d)} y={h - pb + 13} textAnchor="middle" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{fmt(10 ** d)}</text>)}
      <text x={w - pr} y={h - 3} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{unit}</text>
      {THRESHOLD_METHODS.map((m) => values[m.id] > 0 && <line key={m.id} x1={X(Math.log10(values[m.id]))} x2={X(Math.log10(values[m.id]))} y1={pt} y2={h - pb} style={{ stroke: METHOD_COLOURS[m.id], strokeWidth: m.id === method ? 2.5 : 1, strokeDasharray: m.id === method ? undefined : "3 3" }} />)}
    </svg>
  );
}

// Normal score (x) against log10 value (y); candidates as horizontal lines, the suggested break marked
function ProbabilityPlot({ prob, values, method, unit }) {
  if (!prob?.points?.length) return null;
  const w = 420, h = 190, pl = 40, pb = 26, pr = 8, pt = 8, P = prob.points;
  const ys = P.map((p) => p[1]), tVals = Object.values(values).filter((v) => v > 0).map(Math.log10);
  const y0 = Math.min(...ys, ...tVals), y1 = Math.max(...ys, ...tVals) + 1e-9, x0 = P[0][0], x1 = P[P.length - 1][0] + 1e-9;
  const X = (v) => pl + ((v - x0) / (x1 - x0)) * (w - pl - pr), Y = (v) => h - pb - ((v - y0) / (y1 - y0)) * (h - pb - pt);
  const step = Math.max(1, Math.floor(P.length / 800)); // draw at most ~800 points
  const pctTicks = [0.01, 0.1, 0.5, 0.9, 0.99].map((q) => [q, normalQuantile(q)]).filter(([, z]) => z >= x0 && z <= x1);
  const yTicks = []; for (let d = Math.floor(y0); d <= Math.ceil(y1); d++) if (d >= y0 - 1e-9 && d <= y1) yTicks.push(d);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("Probability plot with the candidate thresholds")} style={{ display: "block" }}>
      <line x1={pl} x2={pl} y1={pt} y2={h - pb} style={{ stroke: "var(--color-border)" }} />
      <line x1={pl} x2={w - pr} y1={h - pb} y2={h - pb} style={{ stroke: "var(--color-border)" }} />
      {yTicks.map((d) => <text key={d} x={pl - 4} y={Y(d) + 3} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{fmt(10 ** d)}</text>)}
      {pctTicks.map(([q, z]) => <text key={q} x={X(z)} y={h - pb + 13} textAnchor="middle" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{`${q * 100}%`}</text>)}
      <text x={w - pr} y={h - 2} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{tr("cumulative %")}</text>
      <text x={4} y={pt + 8} fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{unit}</text>
      {THRESHOLD_METHODS.map((m) => values[m.id] > 0 && <line key={m.id} x1={pl} x2={w - pr} y1={Y(Math.log10(values[m.id]))} y2={Y(Math.log10(values[m.id]))} style={{ stroke: METHOD_COLOURS[m.id], strokeWidth: m.id === method ? 2.5 : 1, strokeDasharray: m.id === method ? undefined : "3 3" }} />)}
      {P.filter((_, i) => i % step === 0).map(([x, y], i) => <circle key={i} cx={X(x)} cy={Y(y)} r={1.6} style={{ fill: "var(--color-text-secondary)" }} />)}
      {prob.breakIndex != null && <circle cx={X(P[prob.breakIndex][0])} cy={Y(P[prob.breakIndex][1])} r={4.5} style={{ fill: "none", stroke: METHOD_COLOURS.probbreak, strokeWidth: 2 }} />}
    </svg>
  );
}
const panelBox = panel({ width: "min(1100px, 96vw)", maxHeight: "92vh" }); // TASKS.csv #997 — the shared modal chrome
const ctl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };
