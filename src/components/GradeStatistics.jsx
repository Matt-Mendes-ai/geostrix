import React, { useMemo, useState } from "react";
import { X, Download } from "./icons.js";
import { valueIn, resolvedSegments, histogramWantsLog } from "../lib/geochem.js"; // resolvedSegments: #1099; histogramWantsLog: #1524
import { useStore } from "../lib/store.jsx";
import { stampLines, withStamp, ASSAY_READING_RULES } from "../lib/provenance.js"; // TASKS.csv #1099
import { version as APP_VERSION } from "../../package.json";
import { excludeQAQC, labAssays } from "../lib/qaqc.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { LAYER_META, UNIT_NAMES } from "../lib/layers.js";
import { saveFile } from "../lib/desktop.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements

// TASKS.csv #136 — univariate grade statistics per domain: a prerequisite step before any estimation
// work or capping decision (per the Micromine-specialist audit this was logged from), adjacent to but
// distinct from the multi-element Correlation Matrix (#21) — this is ONE element's own distribution,
// broken out by domain, not element-vs-element relationships.

// TASKS.csv #1515 / #1678 — interval layers only: magsusc and structure are point readings (no from / to), and as domains they gave
// "(unclassified) 1537 / 0.15 1 / 0.515 1"
const DOMAIN_LAYER_KEYS = ["litho", "alt", "vein", "breccia", "structzone", "geotech"];
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
import { fontSizes } from "../lib/theme.js"; // TASKS.csv #385 — SVG font-size attributes on the type scale
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { gradeStatsRows } from "../lib/analysisExports.js"; // TASKS.csv #1083
import { weightedProbPoints, weightedPercentile, capEffect, thinToPixels } from "../lib/probPlot.js"; // TASKS.csv #1388; thinToPixels: #1512
import { normalQuantile } from "../lib/thresholds.js";
import { capAboveZone, capWarningText } from "../lib/capWarning.js"; // TASKS.csv #1676
import { preferredElement, rememberElement } from "../lib/preferredElement.js"; // TASKS.csv #1678
import { customDomainOptions, isCategoricalLayer, domainIndex, domainAtMid } from "../lib/customDomains.js"; // TASKS.csv #1678; #1515

// Sample statistics (n-1 denominator for variance/stdev, the standard convention for a sample rather
// than a full population — grade data is always a sample of the deposit, never the whole thing).
//
// TASKS.csv #267 — optionally LENGTH-WEIGHTED. This panel used to report a plain arithmetic mean over
// raw assay rows of wildly varying interval length, and capping decisions and "average grade of the
// deposit" statements get made off it. An unweighted mean over 0.3 m and 3 m intervals is biased toward
// whatever gets sampled at short intervals — which in practice is the mineralised zone, so the bias
// runs upward exactly where it matters. Weights here are the interval lengths; the variance uses the
// standard unbiased estimator for RELIABILITY weights (denominator V1 - V2/V1, which reduces to the
// familiar n-1 when every weight is 1, so the unweighted path is unchanged), and the quantiles are
// cumulative-weight quantiles (the value at which half the sampled METRES sit below, not half the rows).
function computeStats(values, weights = null) {
  const n = values.length;
  if (!n) return null;
  const w = weights && weights.length === n ? weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0)) : values.map(() => 1);
  const V1 = w.reduce((s, x) => s + x, 0);
  if (!(V1 > 0)) return null;
  const V2 = w.reduce((s, x) => s + x * x, 0);
  const mean = values.reduce((s, v, i) => s + w[i] * v, 0) / V1;
  // Unbiased variance for RELIABILITY weights. Reduces to the familiar n-1 denominator whenever every
  // weight is equal (V1 = n, V2 = n, so V1 - V2/V1 = n - 1), so the unweighted view is unchanged.
  const denom = V1 - V2 / V1;
  const variance = denom > 0 ? values.reduce((s, v, i) => s + w[i] * (v - mean) ** 2, 0) / denom : 0;
  const stdev = Math.sqrt(variance);
  const cv = mean !== 0 ? (stdev / mean) * 100 : null;

  // Weighted quantiles. Weights are normalised to average 1 (scale-invariant: metres vs centimetres
  // give the same answer, and a total sampled length under 1 m is still well defined), then each value
  // occupies a span of that many "slots" on the cumulative axis and the classic idx = p * (n - 1)
  // linear-interpolation rule is applied over those slots. Two properties verified in Node: equal
  // weights reproduce the old formula exactly, and an integer-weighted sample gives exactly the same
  // quantiles as the expanded sample it stands for (a 9 m interval at 1 g/t behaves like nine 1 m
  // intervals at 1 g/t) — which is the whole point of length-weighting.
  const pairs = values.map((v, i) => ({ v, w: (w[i] * n) / V1 })).sort((a, b) => a.v - b.v);
  const sorted = pairs.map((x) => x.v);
  const valueAtSlot = (k) => {
    const t = k + 0.5;
    let cum = 0;
    for (let i = 0; i < pairs.length; i++) {
      if (t < cum + pairs[i].w) return pairs[i].v;
      cum += pairs[i].w;
    }
    return pairs[pairs.length - 1].v;
  };
  const quantile = (p) => {
    if (n === 1) return pairs[0].v;
    const idx = p * (n - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    const a = valueAtSlot(lo), b = valueAtSlot(hi);
    return a + (b - a) * (idx - lo);
  };
  const median = quantile(0.5);
  return { n, mean, median, stdev, variance, cv, min: sorted[0], max: sorted[sorted.length - 1], q1: quantile(0.25), q3: quantile(0.75), sorted, totalLength: weights ? V1 : null };
}

// TASKS.csv #1515 — the domain lookup (midpoint in an interval of the hole) is lib/customDomains.js domainIndex / domainAtMid, indexed by hole

function niceBinCount(n) {
  // Sturges' rule, clamped to a sane range for a small UI histogram.
  return Math.max(6, Math.min(24, Math.round(Math.log2(n) + 1)));
}

export default function GradeStatistics({ assays: assaysIn, assayElements, layers, surfaceSamples = [], surfaceElements = [], onClose }) {
  const assays = useMemo(() => labAssays(assaysIn), [assaysIn]), pxrfLeft = (assaysIn || []).length - assays.length; // #1673 — lab grades only
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const { project } = useStore(); // #1099 — the CRS line of the export stamp
  // TASKS.csv #228 — surface geochemistry has no downhole domain (litho/alt/etc are interval layers
  // tied to hole_id/from/to, which surface samples don't have) but DOES have its own natural grouping
  // dimension, sampling medium (soil/rock chip/stream sediment/...), so "source" picks which dataset
  // this whole panel reports on rather than trying to merge two differently-shaped datasets into one
  // set of domain options. valueIn() itself is already source-agnostic (just reads `sample.values`),
  // so only the domain-grouping and QAQC-exclusion logic below actually branches on source.
  const [source, setSource] = useState("assays"); // "assays" | "surface"
  const surfaceElementUnits = useMemo(() => Object.fromEntries(surfaceElements.map((e) => [e.symbol, e.unit])), [surfaceElements]);
  const activeElements = source === "surface" ? surfaceElements : assayElements;
  const [symbol, setSymbolRaw] = useState(() => preferredElement(assayElements.map((e) => e.symbol), "gradestats"));
  const setSymbol = (v) => { setSymbolRaw(v); rememberElement("gradestats", typeof v === "string" ? v : null); }; // #1678
  const [domainKey, setDomainKey] = useState("");
  const [logChoice, setLogChoice] = useState(null); // #1524 — { key, on }: a tick for this source and element; otherwise the data decides
  const [lengthWeighted, setLengthWeighted] = useState(true); // TASKS.csv #267
  // TASKS.csv #219 — QC samples (standards/blanks/duplicates) default OUT of grade statistics, same
  // as Best Intercepts/Compositing — a standard's own repeat-insertion grade shouldn't skew a domain's
  // mean/stdev/CV.
  const [includeQAQC, setIncludeQAQC] = useState(false);
  const qaqcExcludedCount = useMemo(() => assays.length - excludeQAQC(assays).length, [assays]);
  const statsAssays = useMemo(() => (includeQAQC ? assays : excludeQAQC(assays)), [assays, includeQAQC]);

  const { customLayers = [] } = useStore(); // #1678
  const customDomains = useMemo(() => (source === "assays" ? customDomainOptions(customLayers) : []), [customLayers, source]);
  const domainOptions = useMemo(() => (source === "assays" ? DOMAIN_LAYER_KEYS.filter((k) => (layers[k] || []).length > 0 && isCategoricalLayer(layers[k])) : []), [source, layers]); // #1515 — categories only
  const customDomain = customDomains.find((d) => d.key === domainKey) || null;
  const domainRows = domainKey ? (customDomain ? customDomain.rows : layers[domainKey]) : null;
  const domainIdx = useMemo(() => (domainRows ? domainIndex(domainRows) : null), [domainRows]); // #1515
  const domainName = (k) => customDomains.find((d) => d.key === k)?.label || LAYER_META[k]?.label || k; // #1678
  const domainLabel = (v) => (domainKey === "litho" ? (UNIT_NAMES[v] || v) : v === "All" || v === "(unclassified)" ? tr(v) : v); // #786: the two built-in group names

  // Per-sample {value, domain} pairs — every row that has a real numeric value for the selected
  // element (log scale needs strictly positive values; a handful of at/below-zero rows, e.g. a
  // below-detection row already halved by parseAssayValue's "<" handling, are excluded from the log
  // view specifically rather than silently breaking the whole chart). Surface samples group by their
  // own sampling medium instead of a downhole domain layer — see `source`'s own comment above.
  const rows = useMemo(() => {
    if (source === "surface") {
      return surfaceSamples.map((s) => {
        const v = valueIn(s, symbol, surfaceElementUnits[symbol] || "ppm", surfaceElementUnits);
        if (v == null) return null;
        return { value: v, weight: 1, domain: s.medium || "(unclassified)" }; // surface samples have no interval length
      }).filter(Boolean);
    }
    // TASKS.csv #1099 (review #1016) — resolved segments, as the cap audit / compositing / estimation use them: a metre
    // logged twice (overlapping or repeated rows) counts once, negative lab codes are not assays. Raw rows counted the
    // repeats twice, so this panel's percentiles disagreed with the cap audit's.
    return resolvedSegments(statsAssays, symbol, elementUnits[symbol] || "ppm", elementUnits).map((s) => {
      const domain = domainIdx ? domainAtMid(domainIdx, s.hole_id, s.from, s.to) : "All"; // #1515 — indexed
      return { value: s.value, weight: s.to - s.from, domain }; // weight: #267
    });
  }, [source, surfaceSamples, statsAssays, symbol, elementUnits, surfaceElementUnits, domainIdx]);

  // TASKS.csv #267 — weighting only applies to drillhole assays (surface samples have no interval
  // length), and only when every row in the group actually has a usable length.
  const weightingActive = source === "assays" && lengthWeighted && rows.length > 0 && rows.every((r) => r.weight > 0);
  const groups = useMemo(() => {
    const byDomain = new Map();
    rows.forEach((r) => {
      const key = r.domain == null ? "(unclassified)" : r.domain;
      if (!byDomain.has(key)) byDomain.set(key, []);
      byDomain.get(key).push(r);
    });
    return Array.from(byDomain.entries())
      .map(([key, rs]) => ({ key, stats: computeStats(rs.map((r) => r.value), weightingActive ? rs.map((r) => r.weight) : null) }))
      .filter((g) => g.stats)
      .sort((a, b) => b.stats.n - a.stats.n);
  }, [rows, weightingActive]);

  // TASKS.csv #1388 — the log-probability plot: each domain's points, and the cap candidates Compositing offers (the
  // length-weighted P97.5 and P99 of all the intervals) plus a cap to test, with what it would remove
  const [capTest, setCapTest] = useState("");
  const prob = useMemo(() => {
    const byDomain = new Map();
    rows.forEach((r) => { const k = r.domain == null ? "(unclassified)" : r.domain; if (!byDomain.has(k)) byDomain.set(k, []); byDomain.get(k).push(r); });
    const series = groups.map((g) => { const rs = byDomain.get(g.key) || []; return { key: g.key, ...weightedProbPoints(rs.map((r) => r.value), weightingActive ? rs.map((r) => r.weight) : null) }; });
    const vs = rows.map((r) => r.value), ws = weightingActive ? rows.map((r) => r.weight) : null;
    return { series, vs, ws, p975: weightedPercentile(vs, ws, 97.5), p99: weightedPercentile(vs, ws, 99) };
  }, [rows, groups, weightingActive]);
  const capValue = capTest === "" ? null : Number(capTest);
  const capFx = Number.isFinite(capValue) && capValue > 0 ? capEffect(prob.vs, prob.ws, capValue) : null;
  // #1676 — the warning Compositing gives, with the zone the capped samples form (drillhole assays only: surface samples have no depth)
  const capWarn = useMemo(() => (capFx ? capWarningText(capFx.pctMetalRemoved, source === "assays" ? capAboveZone(resolvedSegments(statsAssays, symbol, elementUnits[symbol] || "ppm", elementUnits), capValue) : null) : ""), [capFx?.pctMetalRemoved, capValue, source, statsAssays, symbol, elementUnits]);
  const allValues = rows.map((r) => r.value);
  const overallStats = useMemo(() => computeStats(allValues, weightingActive ? rows.map((r) => r.weight) : null), [rows, allValues, weightingActive]);
  const logKey = `${source}:${symbol}`;
  const logScale = logChoice?.key === logKey ? logChoice.on : histogramWantsLog(overallStats); // #1524 — a skewed grade opens on log
  const setLogScale = (on) => setLogChoice({ key: logKey, on });

  const histogram = useMemo(() => {
    if (!overallStats) return null;
    const vals = logScale ? allValues.filter((v) => v > 0).map((v) => Math.log10(v)) : allValues;
    if (!vals.length) return null;
    const min = arrMin(vals), max = arrMax(vals);
    const binCount = niceBinCount(vals.length);
    const width = (max - min) || 1;
    const binW = width / binCount;
    const bins = new Array(binCount).fill(0);
    vals.forEach((v) => {
      let i = Math.floor((v - min) / binW);
      if (i >= binCount) i = binCount - 1;
      if (i < 0) i = 0;
      bins[i]++;
    });
    return { bins, min, max, binW, maxCount: arrMax(bins), leftOut: allValues.length - vals.length }; // leftOut: #1524
  }, [allValues, logScale, overallStats]);

  const exportCSV = () => {
    // TASKS.csv #1099 — the unit in the column names and a provenance stamp, as every other estimation-adjacent CSV (#404)
    const unit = (source === "surface" ? surfaceElementUnits[symbol] : elementUnits[symbol]) || "ppm";
    const rowsOut = gradeStatsRows(groups, { unit, label: (k) => (domainKey === "litho" ? domainLabel(k) : k), weighted: weightingActive }); // #1083 — rows in lib, tested
    const stamp = stampLines({ tool: "Grade statistics", version: APP_VERSION, epsg: project?.epsg, params: [
      `Element: ${symbol} (${unit}) | source: ${source === "surface" ? "surface samples (one sample = weight 1)" : "drillhole assays"} | domains: ${domainKey ? domainName(domainKey) : "none (all samples)"}`,
      `Basis: ${weightingActive ? "length-weighted (interval length)" : "unweighted arithmetic"}; sample (n-1) variance`,
      ...(source === "surface" ? [] : [
        `QAQC inserts: ${includeQAQC ? "INCLUDED" : `excluded (${qaqcExcludedCount} rows)`}`,
        "Samples: resolved assay segments as compositing uses them (overlapping or repeated intervals counted once, exact duplicates dropped, negative lab codes not assayed)",
        ASSAY_READING_RULES,
      ]),
      "No high-grade cap applied",
    ] });
    saveFile({ suggestedName: `${symbol}_grade_statistics.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: withStamp(toExportCsv(rowsOut), stamp) });
  };

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Grade statistics")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Univariate distribution per domain — {v}{v2}", { v: source === "surface" ? tr("{surfaceSamples} surface samples loaded.", { surfaceSamples: surfaceSamples.length }) : tr("{assays} intervals loaded.", { assays: assays.length }), v2: source === "assays" && qaqcExcludedCount > 0 && !includeQAQC ? tr(" {qaqcExcludedCount} QC sample(s) (standards/blanks/duplicates) excluded.", { qaqcExcludedCount }) : "" })}
            {pxrfLeft > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("{n} pXRF reading(s) left out: the grades here come from lab assays only.", { n: pxrfLeft })}</div>}{/* #1673 */}
            </div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {surfaceSamples.length > 0 && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Data source")}<select
                  value={source}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSource(next);
                    const els = next === "surface" ? surfaceElements : assayElements;
                    setSymbolRaw(els.some((e) => e.symbol === symbol) ? symbol : preferredElement(els.map((e) => e.symbol))); // #1678; #1523 — Au stays Au when the other source has it
                    setDomainKey("");
                  }}
                  style={{ ...sel, display: "block", marginTop: 4 }}
                >
                  <option value="assays">{tr("Drillhole assays")}</option>
                  <option value="surface">{tr("Surface samples")}</option>
                </select>
              </label>
            </div>
          )}
          {source === "assays" && qaqcExcludedCount > 0 && (
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title={tr("QC samples (standards/blanks/duplicates, detected by hole_id naming) are excluded by default so a standard's own repeat-insertion grade can't skew a domain's mean/stdev/CV — check this to include them anyway.")}>
              <input type="checkbox" checked={includeQAQC} onChange={(e) => setIncludeQAQC(e.target.checked)} />{tr("Include QC samples (standards/blanks/duplicates) in this report")}</label>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Element")}<select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ ...sel, display: "block", marginTop: 4 }}>
                {activeElements.map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol}</option>)}
              </select>
            </label>
            {source === "assays" ? (
              <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Domain (optional)")}<select value={domainKey} onChange={(e) => setDomainKey(e.target.value)} style={{ ...sel, display: "block", marginTop: 4 }}>
                  <option value="">{tr("— none, all intervals together —")}</option>
                  {domainOptions.map((k) => <option key={k} value={k}>{LAYER_META[k].label}</option>)}
                  {customDomains.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}{/* #1678 */}
                </select>
              </label>
            ) : (
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginBottom: 6 }}>{tr("Grouped by sampling medium")}</div>
            )}
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />{" "}{tr("Log-scale histogram")}</label>
            {/* TASKS.csv #267 */}
            {source === "assays" && (
              <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }} title={tr("Weight every statistic by the assay interval's own length. An unweighted mean over 0.3m and 3m intervals is biased toward whatever gets sampled at short intervals — in practice the mineralized zone.")}>
                <input type="checkbox" checked={lengthWeighted} onChange={(e) => setLengthWeighted(e.target.checked)} />{" "}{tr("Length-weight")}</label>
            )}
          </div>
          {/* TASKS.csv #267 — the panel now always states which mean it is showing. Capping decisions
              and "average grade" statements get made off this table. */}
          <div style={{ fontSize: "var(--font-size-sm)", color: weightingActive ? "var(--color-text-secondary)" : "var(--color-warn-text)", lineHeight: 1.45 }}>
            {source === "surface"
              ? tr("Statistics on surface samples — point samples with no interval length, so no weighting applies.")
              : weightingActive
                ? tr("Length-weighted statistics on the assay intervals as compositing reads them, a repeated or overlapping interval counted once ({v} of sampled core). Compositing to a regular length first is still the more standard basis for a capping decision.", { v: overallStats ? `${overallStats.totalLength.toFixed(1)} m` : "—" })
                : tr("Statistics on raw assay intervals — NOT length-weighted{v}. A 0.3 m interval counts exactly as much as a 3 m one. Composite first, or tick \"Length-weight\", for a weighted distribution.", { v: lengthWeighted ? tr(" (some intervals have no usable from/to length, so weighting was skipped)") : "" })}
          </div>

          {!overallStats ? (
            <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No {symbol} values found in the loaded {v} data.", { symbol, v: source === "surface" ? tr("surface sample") : tr("assay") })}</div>
          ) : (
            <>
              <div>
                <div style={label}>{tr("Distribution — {symbol} ({v}){v2}", { symbol, v: elementUnits[symbol] || tr("ppm"), v2: logScale ? tr(", log₁₀ scale") : "" })}</div>
                <Histogram data={histogram} unit={elementUnits[symbol] || "ppm"} logScale={logScale} />
                {logScale && histogram?.leftOut > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("{n} zero or negative values are not on the log scale.", { n: histogram.leftOut.toLocaleString() })}</div>}
              </div>

              <div>
                <div style={label}>{tr("By domain — {groups} {v}", { groups: groups.length, v: tr(groups.length === 1 ? "group" : "groups") })}</div>
                <BoxPlots groups={groups} domainLabel={domainLabel} logScale={logScale} unit={elementUnits[symbol] || "ppm"} />
              </div>

              {/* TASKS.csv #1388 */}
              <div>
                <div style={label}>{tr("Log-probability plot — {symbol} ({v}){v2}", { symbol, v: elementUnits[symbol] || tr("ppm"), v2: weightingActive ? tr(", length-weighted") : "" })}</div>
                <ProbPlot prob={prob} cap={capFx ? capValue : null} domainLabel={domainLabel} unit={elementUnits[symbol] || "ppm"} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginTop: 4 }}>
                  <span>{tr("P97.5 = {a}, P99 = {b} {unit} (the percentiles Compositing offers as caps)", { a: gradeText(prob.p975), b: gradeText(prob.p99), unit: elementUnits[symbol] || "ppm" })}</span>
                  <label style={{ display: "flex", alignItems: "center", gap: 5 }}>{tr("Cap to test")}<input type="number" min="0" step="any" value={capTest} onChange={(e) => setCapTest(e.target.value)} style={{ ...sel, width: 80 }} aria-label={tr("Cap to test")} /></label>
                  {capFx && <span>{weightingActive ? tr("{above} of {n} samples above it; {pct}% of the metal (grade × length) removed", { above: capFx.above, n: capFx.n, pct: capFx.pctMetalRemoved.toFixed(1) }) : tr("{above} of {n} samples above it", { above: capFx.above, n: capFx.n })}</span>}
                </div>
                {capWarn && <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text-strong)", marginTop: 3, lineHeight: 1.4 }}>{capWarn}</div>}{/* #1676 */}
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 2, lineHeight: 1.4 }}>{tr("Each population plots as a straight line on these axes (log-normal); a bend or a step in the high tail is where a second population starts, the usual place to cap (Sinclair 1976). Values of 0 count in the cumulative % but cannot be drawn on a log axis.")}</div>
              </div>

              <div style={{ overflowX: "auto", flexShrink: 0 }}>{/* #1384: in the column body an overflow box shrank to a 25 px header strip */}
                <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={th}>{tr("Domain")}</th><th style={th}>n</th><th style={th}>{tr("Mean")}</th><th style={th}>{tr("Median")}</th>
                      <th style={th}>{tr("Stdev")}</th><th style={th}>{tr("CV%")}</th><th style={th}>{tr("Min")}</th><th style={th}>Q1</th><th style={th}>Q3</th><th style={th}>{tr("Max")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g.key}>
                        <td style={td}>{domainLabel(g.key)}</td>
                        <td style={td}>{g.stats.n}</td>
                        <td style={td}>{gradeText(g.stats.mean)}</td>
                        <td style={td}>{gradeText(g.stats.median)}</td>
                        <td style={td}>{gradeText(g.stats.stdev)}</td>
                        <td style={td}>{g.stats.cv == null ? "—" : g.stats.cv.toFixed(0)}</td>
                        <td style={td}>{gradeText(g.stats.min)}</td>
                        <td style={td}>{gradeText(g.stats.q1)}</td>
                        <td style={td}>{gradeText(g.stats.q3)}</td>
                        <td style={td}>{gradeText(g.stats.max)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button onClick={exportCSV} style={{ ...btn(true), alignSelf: "flex-start", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                <Download size={14} />{" "}{tr("Export statistics (CSV)")}</button>
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

function Histogram({ data, unit, logScale }) {
  if (!data) return <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("No values to plot.")}</div>;
  const w = 640, h = 160, padL = 40, padB = 20;
  const plotW = w - padL - 10, plotH = h - padB - 10;
  const barW = plotW / data.bins.length;
  return (
    <svg width={w} height={h} style={{ maxWidth: "100%" }}>
      {data.bins.map((count, i) => {
        const barH = data.maxCount ? (count / data.maxCount) * plotH : 0;
        return (
          <rect key={i} x={padL + i * barW} y={10 + plotH - barH} width={Math.max(0, barW - 1)} height={barH} fill="#4a9be0" />
        );
      })}
      <line x1={padL} y1={10 + plotH} x2={padL + plotW} y2={10 + plotH} stroke="#c7ccd3" />
      <text x={padL} y={h - 4} fontSize={fontSizes.xs} fill="#55606e">{(logScale ? Math.pow(10, data.min) : data.min).toFixed(logScale ? 3 : 2)}</text>
      <text x={padL + plotW} y={h - 4} fontSize={fontSizes.xs} fill="#55606e" textAnchor="end">{(logScale ? Math.pow(10, data.max) : data.max).toFixed(logScale ? 3 : 2)} {unit}</text>
      <text x={4} y={16} fontSize={fontSizes.xs} fill="#55606e">{data.maxCount}</text>
    </svg>
  );
}

// Simple box-and-whisker per domain group: whiskers to actual min/max (not a Tukey 1.5*IQR fence with
// separate outlier points — a lighter first pass; worth revisiting if capping/outlier work needs the
// distinction later).
// TASKS.csv #1213 — half a detection limit of 0.0005 g/t printed as 0.001. Small values keep their significant figures.
export const gradeText = (v) => (Number.isFinite(v) ? (v !== 0 && Math.abs(v) < 0.01 ? String(Number(v.toPrecision(3))) : v.toFixed(3)) : "—");
// TASKS.csv #1185 — the same log axis as the histogram: on a linear axis a four-decade Cu distribution left every median in a corner. A value
// of zero or below sits at the smallest positive one.
export function boxPlotScale(stats, logScale, x0, x1) {
  const all = stats.flatMap((s) => [s.min, s.q1, s.median, s.q3, s.max]);
  const pos = all.filter((v) => v > 0);
  const log = logScale && pos.length > 0;
  const low = log ? Math.min(...pos) : Math.min(...all), high = Math.max(...all);
  const f = log ? (v) => Math.log10(Math.max(v, low)) : (v) => v;
  const span = f(high) - f(low) || 1;
  return { x: (v) => x0 + ((f(v) - f(low)) / span) * (x1 - x0), low, high };
}

function BoxPlots({ groups, domainLabel, logScale, unit, fit = false }) { // fit: TASKS.csv #1425 — scaled to a narrow pane instead of clipped
  if (!groups.length) return null;
  const w = fit ? 360 : 640, rowH = fit ? 26 : 34, padL = fit ? 110 : 90, padR = 20;
  const h = groups.length * rowH + 34;
  const { x, low, high } = boxPlotScale(groups.map((g) => g.stats), logScale, padL, w - padR); // TASKS.csv #1185
  return (
    <svg width={fit ? "100%" : w} height={fit ? undefined : h} viewBox={fit ? `0 0 ${w} ${h}` : undefined} style={{ maxWidth: "100%", display: "block" }}>
      {groups.map((g, i) => {
        const y = 10 + i * rowH + rowH / 2;
        const s = g.stats;
        return (
          <g key={g.key}>
            <text x={padL - 8} y={y + 4} fontSize={fontSizes.sm} fill="#1a2028" textAnchor="end">{domainLabel(g.key)}</text>
            <line x1={x(s.min)} y1={y} x2={x(s.max)} y2={y} stroke="#55606e" strokeWidth="1" />
            <line x1={x(s.min)} y1={y - 5} x2={x(s.min)} y2={y + 5} stroke="#55606e" strokeWidth="1" />
            <line x1={x(s.max)} y1={y - 5} x2={x(s.max)} y2={y + 5} stroke="#55606e" strokeWidth="1" />
            <rect x={x(s.q1)} y={y - 8} width={Math.max(1, x(s.q3) - x(s.q1))} height={16} fill="#4a9be0" fillOpacity="0.35" stroke="#4a9be0" />
            <line x1={x(s.median)} y1={y - 8} x2={x(s.median)} y2={y + 8} stroke="#1e5a9c" strokeWidth="2" />
          </g>
        );
      })}
      <text x={padL} y={h - 6} fontSize={fontSizes.xs} fill="#55606e">{low.toPrecision(3)}</text>
      <text x={w - padR} y={h - 6} fontSize={fontSizes.xs} fill="#55606e" textAnchor="end">{high.toPrecision(3)} {unit}{logScale ? ` (${tr("log scale")})` : ""}</text>
    </svg>
  );
}

const panel = { width: "min(820px, 95vw)", maxHeight: "88vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });
const th = { padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "right", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "4px 8px", color: "var(--color-text)", textAlign: "right", fontFamily: "'Exo 2', system-ui, sans-serif" };

// TASKS.csv #1388 — normal score of the cumulative length share against log10 grade, one colour per domain; the cap lines
const PROB_COLOURS = ["#2f6db5", "#c9863d", "#3d9a5b", "#b5463f", "#7a5aa8", "#2a9aa0", "#9a7a2a", "#5a6472"];
function ProbPlot({ prob, cap, domainLabel, unit }) {
  const all = prob.series.flatMap((s) => s.points);
  if (all.length < 3) return <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("Too few values above zero for a probability plot.")}</div>;
  const w = 640, h = 220, pl = 46, pb = 26, pr = 90, pt = 8;
  const lines = [[prob.p975, "P97.5", "#b5463f"], [prob.p99, "P99", "#7a1f1f"], [cap, tr("cap"), "#1a2028"]].filter(([v]) => v > 0);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of all) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  for (const [v] of lines) { const l = Math.log10(v); if (l < y0) y0 = l; if (l > y1) y1 = l; }
  y1 += 1e-9; x1 += 1e-9;
  const X = (v) => pl + ((v - x0) / (x1 - x0)) * (w - pl - pr), Y = (v) => h - pb - ((v - y0) / (y1 - y0)) * (h - pb - pt);
  const pct = [0.001, 0.01, 0.1, 0.5, 0.9, 0.99, 0.999].map((q) => [q, normalQuantile(q)]).filter(([, z]) => z >= x0 && z <= x1);
  const dec = []; for (let d = Math.floor(y0); d <= Math.ceil(y1); d++) if (d >= y0 - 1e-9 && d <= y1) dec.push(d);
  const fmtV = (v) => String(+v.toPrecision(3));
  const dashed = (name) => name === "P97.5" || name === "P99";
  // the line labels, top down, at least 11 px apart (a cap equal to P99 printed over its label)
  const labelY = new Map();
  [...lines].sort((p, q) => q[0] - p[0]).reduce((prev, [v, name]) => { const y = Math.max(Y(Math.log10(v)) + 3, prev + 11); labelY.set(name, y); return y; }, -Infinity);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} style={{ maxWidth: "100%", display: "block" }} role="img" aria-label={tr("Log-probability plot")}>
      <line x1={pl} x2={pl} y1={pt} y2={h - pb} style={{ stroke: "var(--color-border)" }} />
      <line x1={pl} x2={w - pr} y1={h - pb} y2={h - pb} style={{ stroke: "var(--color-border)" }} />
      {dec.map((d) => <g key={d}><line x1={pl} x2={w - pr} y1={Y(d)} y2={Y(d)} style={{ stroke: "var(--color-hover-bg)" }} /><text x={pl - 4} y={Y(d) + 3} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{fmtV(10 ** d)}</text></g>)}
      {pct.map(([q, z]) => <text key={q} x={X(z)} y={h - pb + 13} textAnchor="middle" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{`${+(q * 100).toFixed(1)}%`}</text>)}
      <text x={w - pr} y={h - 2} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{tr("cumulative %")}</text>
      <text x={4} y={pt + 8} fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{unit}</text>
      {lines.map(([v, name, c]) => <g key={name}><line x1={pl} x2={w - pr} y1={Y(Math.log10(v))} y2={Y(Math.log10(v))} stroke={c} strokeWidth={dashed(name) ? 1 : 1.6} strokeDasharray={dashed(name) ? "5 3" : undefined} /><text x={w - pr + 4} y={labelY.get(name)} fontSize={fontSizes.xs} fill={c}>{`${name} ${fmtV(v)}`}</text></g>)}
      {prob.series.map((s, si) => { const c = PROB_COLOURS[si] || "#9aa5b3"; return <g key={s.key}>{thinToPixels(s.points, X, Y).map(([x, y], i) => <circle key={i} cx={X(x)} cy={Y(y)} r={1.7} fill={c} />)}</g>; })}{/* #1512 — one point per pixel, the tail kept */}
      {prob.series.length > 1 && prob.series.slice(0, PROB_COLOURS.length).map((s, si) => <text key={s.key} x={pl + 6} y={pt + 10 + si * 11} fontSize={fontSizes.xs} fill={PROB_COLOURS[si]}>{domainLabel(s.key)}</text>)}
    </svg>
  );
}
export { BoxPlots }; // TASKS.csv #1425 — the Downhole logs pane draws the same box plots
