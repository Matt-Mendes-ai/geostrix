// TASKS.csv #1425 / #1708 — the Geophysics tab's downhole logs: mag susc, SG, RQD, recovery or a numeric custom field by a logged
// code (box plot) and against an assay element (scatter, Spearman). The same sources Estimation and Grade shell take (#1741).
import React, { useMemo } from "react";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { Activity } from "./icons.js";
import { numericSourceChoices, sourceAssays } from "../lib/numericSources.js";
import { domainLayerChoices, foldDomainRows } from "../lib/domainLayers.js"; // foldDomainRows: TASKS.csv #2790
import { LAYER_META } from "../lib/layers.js";
import { groupLogByCode, rankLogGroups, codeTable, ratioComparable, assayIndex, logVsAssayIndexed, logVsModel, NOT_LOGGED, strideSample, SCATTER_MAX, allAboveZero, countAtOrBelowZero, sig3, orderLogSources, logScaleFor } from "../lib/downholeLogs.js"; // logVsModel: #1595; strideSample: #2331; logScaleSuits...: #2558; groupLogByCode / rankLogGroups: #2948
import { BoxPlots } from "./GradeStatistics.jsx";
import { smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";
import { useKeptState, scopeOf } from "../lib/keptState.js"; // TASKS.csv #2394 — the choices survive the pane closing (per project)
import { useStore } from "../lib/store.jsx";
import { useLeadCommodity } from "../lib/useLeadCommodity.js"; // TASKS.csv #2967 — the opening element: the project's lead commodity (#2908)
import { useDeferredMemo, DEFER_ROWS } from "../lib/useDeferredMemo.js"; // TASKS.csv #2948
import { logUnitChoices } from "../lib/logUnits.js"; // TASKS.csv #2952
import { quantileSorted } from "../lib/arrayStats.js"; // TASKS.csv #2953 — the whiskers
import { implausibleReadings } from "../lib/logUnits.js"; // TASKS.csv #2953

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", fontSize: "var(--font-size-sm)", marginBottom: 6 };

// xs / ys (TASKS.csv #3078): the pairs as two typed columns (the log against an element), read in place; pairs: [[x, y]] (against a model)
function Scatter({ pairs = null, xs = null, ys = null, xLabel, yLabel, logX, logY, fit = null }) { // fit: TASKS.csv #2954 — the log = a + b x element line, drawn on linear axes
  const w = 300, h = 220, pl = 44, pb = 30, pr = 8, pt = 8;
  const fx = logX ? (v) => Math.log10(v) : (v) => v, fy = logY ? (v) => Math.log10(v) : (v) => v;
  // TASKS.csv #2948 — the points, their box and the drawn subset are kept while the pairs and axes stay (0.4 s at 480,000 pairs, paid again on
  // every change of the pane, the ranking included)
  const { pts, drawn, x0, x1, y0, y1 } = useMemo(() => {
    if (xs) { // #3078 — the points kept by the axes as indices, and only the drawn ones (every n-th and the four extremes, as strideSample) made
      const keep = new Int32Array(xs.length);
      let m = 0, a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, ia0 = 0, ia1 = 0, ib0 = 0, ib1 = 0;
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i], y = ys[i];
        if ((logX && !(x > 0)) || (logY && !(y > 0))) continue;
        const X = fx(x), Y = fy(y);
        if (X < a0) { a0 = X; ia0 = m; } if (X > a1) { a1 = X; ia1 = m; } if (Y < b0) { b0 = Y; ib0 = m; } if (Y > b1) { b1 = Y; ib1 = m; }
        keep[m++] = i;
      }
      const step = m > SCATTER_MAX ? Math.ceil(m / SCATTER_MAX) : 1, chosen = new Set();
      for (let j = 0; j < m; j += step) chosen.add(j);
      if (step > 1) [ia0, ia1, ib0, ib1].forEach((j) => chosen.add(j));
      const points = [...chosen].sort((a, b) => a - b).map((j) => [fx(xs[keep[j]]), fy(ys[keep[j]])]);
      return { pts: { length: m }, drawn: { points, step }, x0: a0, x1: a1, y0: b0, y1: b1 };
    }
    const p = pairs.filter(([x, y]) => (!logX || x > 0) && (!logY || y > 0)).map(([x, y]) => [fx(x), fy(y)]);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, y] of p) { if (x < a0) a0 = x; if (x > a1) a1 = x; if (y < b0) b0 = y; if (y > b1) b1 = y; }
    return { pts: p, drawn: strideSample(p), x0: a0, x1: a1, y0: b0, y1: b1 }; // #2331 — a few thousand drawn, the axes and statistics from every pair
  }, [pairs, xs, ys, logX, logY]);
  if (pts.length < 3) return <div style={note}>{tr("Too few readings above zero for a log-scale plot.")}</div>;
  const sx = (x) => pl + ((x - x0) / ((x1 - x0) || 1)) * (w - pl - pr), sy = (y) => h - pb - ((y - y0) / ((y1 - y0) || 1)) * (h - pb - pt);
  const lab = (v, log) => (log ? 10 ** v : v).toLocaleString(undefined, { maximumSignificantDigits: log ? 2 : 3 }); // #2558 — 0.000457, not 0
  return (
    <>
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("{y} against {x}", { x: xLabel, y: yLabel })} style={{ display: "block", background: "#fff", border: "1px solid var(--color-border)", borderRadius: 6 }}>
      <line x1={pl} y1={pt} x2={pl} y2={h - pb} stroke="#94a1b0" /><line x1={pl} y1={h - pb} x2={w - pr} y2={h - pb} stroke="#94a1b0" />
      {drawn.points.map(([x, y], i) => <circle key={i} cx={sx(x)} cy={sy(y)} r="2" fill="#2f6db5" fillOpacity="0.55" />)}
      {fit && !logX && !logY && (() => { // #2954 — x = a + b y across the plotted element range, cut to the plotted log range
        const ends = [y0, y1].map((y) => [fit.a + fit.b * y, y]).map(([x, y]) => (x < x0 && fit.b ? [x0, (x0 - fit.a) / fit.b] : x > x1 && fit.b ? [x1, (x1 - fit.a) / fit.b] : [x, y]));
        return <line x1={sx(ends[0][0])} y1={sy(ends[0][1])} x2={sx(ends[1][0])} y2={sy(ends[1][1])} stroke="#c0392b" strokeWidth="1.5" />;
      })()}
      <text x={pl} y={h - pb + 12} fontSize="8" fill="#55606e">{lab(x0, logX)}</text>
      <text x={w - pr} y={h - pb + 12} fontSize="8" fill="#55606e" textAnchor="end">{lab(x1, logX)}</text>
      <text x={(pl + w - pr) / 2} y={h - 4} fontSize="9" fill="#55606e" textAnchor="middle">{xLabel}{logX ? ` (${tr("log scale")})` : ""}</text>
      <text x={pl - 3} y={h - pb} fontSize="8" fill="#55606e" textAnchor="end">{lab(y0, logY)}</text>
      <text x={pl - 3} y={pt + 8} fontSize="8" fill="#55606e" textAnchor="end">{lab(y1, logY)}</text>
      <text x={10} y={(pt + h - pb) / 2} fontSize="9" fill="#55606e" textAnchor="middle" transform={`rotate(-90 10 ${(pt + h - pb) / 2})`}>{yLabel}{logY ? ` (${tr("log scale")})` : ""}</text>
    </svg>
    {drawn.step > 1 && <div style={note}>{tr("{k} of {n} pairs drawn (every {s}th, and the extremes); the statistics use all of them.", { k: drawn.points.length.toLocaleString(), n: pts.length.toLocaleString(), s: drawn.step })}</div>}
    </>
  );
}

// TASKS.csv #2951 (review #2876, WA iron) — every code's figures, not the top 8 of a sentence where codes of 9 bins led and the strands that
// carry the tonnage were never printed: n, mean (a binned log's bins weighed by their readings), median, P10, P90, sortable by any column,
// the codes under the minimum count greyed and listed last, and a Copy (tab-separated, with the unit, for a spreadsheet)
const fig = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(4))) : "");
function CodeTable({ rows, order, minCount, unit, binned, keptScope }) {
  const [sortBy, setSortBy] = useKeptState(keptScope, "dhlogs.tableSort", "rank"); // #2394 — every choice of the pane kept per project
  const rank = new Map(order.map((k, i) => [k, i]));
  const sorted = [...rows].sort((a, b) => {
    const ra = a.n < minCount, rb = b.n < minCount;
    if (ra !== rb) return ra ? 1 : -1;
    if (sortBy === "rank") return (rank.get(a.key) ?? 1e9) - (rank.get(b.key) ?? 1e9);
    if (sortBy === "key") return String(a.key).localeCompare(String(b.key), undefined, { numeric: true });
    return (b[sortBy] ?? -Infinity) - (a[sortBy] ?? -Infinity);
  });
  const u = unit ? ` (${unit})` : "";
  const cols = [["key", tr("Code")], ["n", binned ? tr("Bins") : tr("Readings")], ["mean", tr("Mean")], ["median", tr("Median")], ["p10", "P10"], ["p90", "P90"]];
  const copy = async (e) => {
    const b = e.currentTarget; // the button says "Copied" for two seconds (a flash, not a choice: no state)
    const head = ["Code", binned ? "Bins" : "Readings", ...(binned ? ["Readings"] : []), `Mean${u}`, `Median${u}`, `P10${u}`, `P90${u}`].join("\t"); // export text: English (CLAUDE.md)
    const body = sorted.map((r) => [r.key === NOT_LOGGED ? NOT_LOGGED : String(r.key ?? "").trim() === "" ? "(blank)" : String(r.key), r.n, ...(binned ? [r.readings] : []), fig(r.mean), fig(r.median), fig(r.p10), fig(r.p90)].join("\t"));
    try { await navigator.clipboard.writeText([head, ...body].join("\n")); b.textContent = tr("Copied"); setTimeout(() => { b.textContent = tr("Copy table"); }, 2000); } catch { /* no clipboard */ }
  };
  const th = { textAlign: "right", fontWeight: 600, padding: "2px 4px", cursor: "pointer", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--color-bg)" };
  return (
    <div>
      <div style={{ maxHeight: 240, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 4 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-xs)" }} aria-label={tr("Figures per code")}>
          <thead><tr>{cols.map(([k, label]) => <th key={k} style={{ ...th, textAlign: k === "key" ? "left" : "right" }} onClick={() => setSortBy(sortBy === k ? "rank" : k)} aria-sort={sortBy === k ? "descending" : "none"} title={tr("Sort by this column (again: back to the box plot's order)")}>{label}{sortBy === k ? " ▾" : ""}</th>)}</tr></thead>
          <tbody>{sorted.map((r) => (
            <tr key={String(r.key)} style={{ color: r.n < minCount ? "var(--color-text-muted)" : "inherit", opacity: r.n < minCount ? 0.7 : 1 }}>
              <td style={{ padding: "1px 4px" }} title={codeLabel(r.key)}>{codeLabel(r.key, 18)}</td>
              <td style={{ padding: "1px 4px", textAlign: "right" }} title={binned ? tr("{n} readings", { n: r.readings.toLocaleString() }) : undefined}>{r.n.toLocaleString()}</td>
              {["mean", "median", "p10", "p90"].map((k) => <td key={k} style={{ padding: "1px 4px", textAlign: "right" }}>{fig(r[k])}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <button type="button" onClick={copy} style={{ ...smallSel, cursor: "pointer" }}>{tr("Copy table")}</button>
        {unit && <span style={note}>{tr("Values in {u}.", { u: unit })}</span>}
      </div>
    </div>
  );
}

// TASKS.csv #2952 (review #2876, WA iron) — a log layer's unit could not be stated anywhere: Density_Best, Gamma_Best and Suscep_Best stayed "in
// the layer's own units" here, on the axes and in the 3D legend. Typed here (the usual ones offered for the kind of log its name says), it is
// the layer's unit (customLayers[].unit), which every label already follows (#2396). Uncontrolled: set on Enter or leaving the box.
function LogUnitField({ layer, onSet }) {
  const choices = logUnitChoices(layer?.name);
  const listId = `logunits-${layer?.id}`;
  const commit = (e) => { const v = e.currentTarget.value.trim(); if (v !== String(layer?.unit || "")) onSet(v); };
  return (
    <label style={{ ...row, justifyContent: "flex-start", gap: 6 }}>{tr("Unit")}
      <input key={`${layer?.id}:${layer?.unit || ""}`} defaultValue={layer?.unit || ""} list={listId} placeholder={tr("not stated")} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(e); }}
        style={{ ...smallSel, width: 90 }} aria-label={tr("Unit of this log")} title={tr("The unit the readings are in: every label, axis and the 3D legend show it.")} />
      <datalist id={listId}>{choices.map((u) => <option key={u} value={u} />)}</datalist>
    </label>
  );
}

// TASKS.csv #2953 (review #2876, WA iron) — a valid range for the log, stored on the layer (customLayers[].validRange) and honoured wherever
// the layer is read (numericSources sourceAssays: Downhole logs, Estimation, Grade shell). Blank ends are open. Uncontrolled, as the unit.
function ValidRangeField({ layer, onSet }) {
  const [lo, hi] = Array.isArray(layer?.validRange) ? layer.validRange : [null, null];
  const read = (form) => { const a = form.querySelector('[data-end="lo"]').value.trim(), b = form.querySelector('[data-end="hi"]').value.trim(); return [a === "" ? null : Number(a), b === "" ? null : Number(b)]; };
  const commit = (e) => {
    const [a, b] = read(e.currentTarget.closest("label"));
    if ((a != null && !Number.isFinite(a)) || (b != null && !Number.isFinite(b))) return;
    if (a === (lo ?? null) && b === (hi ?? null)) return;
    onSet(a == null && b == null ? undefined : [a, b]);
  };
  const box = (end, v) => <input key={`${layer?.id}:${end}:${v ?? ""}`} data-end={end} type="number" step="any" defaultValue={v ?? ""} placeholder={end === "lo" ? tr("from") : tr("to")}
    onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(e); }} style={{ ...smallSel, width: 70 }} aria-label={end === "lo" ? tr("Valid range from") : tr("Valid range to")} />;
  return (
    <label style={{ ...row, justifyContent: "flex-start", gap: 6 }} title={tr("Readings outside this range are left out of Downhole logs, Estimation and Grade shell. Blank: no limit at that end.")}>
      {tr("Valid range")}{box("lo", lo)}{box("hi", hi)}
    </label>
  );
}

// TASKS.csv #2401 (review #2325, WA uranium) — a blank code was an unlabelled group ('E3 78.4 ·  37.2 · QB 34.3'), and long code names were cut
// at the left of the box plot ('gnesium_Clays', ':not logged)'): '(blank)' for an empty code, '(not logged)' as before, and a long name
// shortened at its end (max characters) so its start stays readable
function codeLabel(k, max = 0) {
  const t = k === NOT_LOGGED ? tr("(not logged)") : String(k ?? "").trim() === "" ? tr("(blank)") : String(k);
  return max && t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
export default function DownholeLogsPane({ layers, customLayers = [], assays = [], assayElements = [], onClose, onEstimate = null }) {
  // TASKS.csv #2558 — a model evaluated onto the holes is not a log: it opened as the Log and was then compared with itself (Spearman 1.00)
  const modelIds = useMemo(() => new Set(customLayers.filter((l) => l.sourceModel != null || (l.rows || []).some((r) => r.modelled)).map((l) => l.id)), [customLayers]);
  // TASKS.csv #2967 — built-in and imported logs in one list, the most readings first (orderLogSources): it opened on 'Recovery (3,408)'
  const sources = useMemo(() => orderLogSources(numericSourceChoices({ layers, customLayers, models: false }).filter((s) => s.layerId == null || !modelIds.has(s.layerId))), [layers, customLayers, modelIds]);
  // TASKS.csv #2394 (review #2325) — the pane forgot its log, code layer, element and model on reopen, and the stall of picking the log
  // again was paid every time: kept per project as Geochem's and Geophysics' panels keep theirs (#1284)
  const keptScope = scopeOf(useStore().getProjectToken());
  const [sourceKey, setSourceKey] = useKeptState(keptScope, "dhlogs.source", "");
  const source = sources.find((s) => s.key === sourceKey) || sources[0] || null;
  const data = useMemo(() => (source ? sourceAssays(source, { layers, customLayers }) : null), [source, layers, customLayers]);
  const { setCustomLayers } = useStore(); // #2952 — the log's unit, typed in the pane
  const logLayer = source?.layerId != null && source.field === "value" ? customLayers.find((c) => c.id === source.layerId) : null;
  const layerNotes = source?.layerId != null ? String(customLayers.find((c) => c.id === source.layerId)?.notes || "").trim() : ""; // TASKS.csv #2775
  const domains = useMemo(() => domainLayerChoices(layers, customLayers, (k) => tr(LAYER_META[k]?.label || k)), [layers, customLayers]);
  const [domainKey, setDomainKey] = useKeptState(keptScope, "dhlogs.domain", "");
  const domain = domains.find((d) => d.key === domainKey) || domains[0] || null;
  // #2558 — the log scale follows the data (all above zero, over a decade). TASKS.csv #2967 — the choice is kept PER LOG ({ [source key]:
  // "log" | "linear" }, absent = automatic) and Automatic can be chosen again: one tick on the density log set every log, for good
  const [scaleBy, setScaleBy] = useKeptState(keptScope, "dhlogs.scaleBy", {});
  const logValues = useMemo(() => (data ? data.assays.map((r) => r.values?.[data.symbol]) : []), [data]);
  // TASKS.csv #2245 (review #2174) — a log the sources say is linear (RQD, recovery, SG: LOG_SOURCES logScale false) opens linear: RQD went to a
  // log axis up to '1.00e+3 %' because one reading was 1,000 %. An imported log's Automatic follows its readings (logScaleFor, #2967)
  const scale = logScaleFor(source, logValues, source ? scaleBy?.[source.key] : null), logScale = scale.log;
  const setScale = (v) => { if (!source) return; setScaleBy((m) => { const n = { ...(m || {}) }; if (v === "auto") delete n[source.key]; else n[source.key] = v; return n; }); };
  const overPct = useMemo(() => (source?.unit === "%" ? logValues.filter((v) => Number.isFinite(v) && v > 100).length : 0), [source, logValues]); // #2245
  const logHidden = logScale ? countAtOrBelowZero(logValues) : 0;
  // TASKS.csv #2393 — rank the codes by the median (default), the mean, P90 or the share of readings above a value
  const [rankStat, setRankStat] = useKeptState(keptScope, "dhlogs.rankStat", "median");
  const [rankAbove, setRankAbove] = useKeptState(keptScope, "dhlogs.rankAbove", "100");
  // TASKS.csv #2790 — spellings that differ only by case or spaces are one code (foldDomainRows, as Estimation #2427 and Isocon #2787 do)
  const domainFold = useMemo(() => (domain ? foldDomainRows(domain.rows) : null), [domain]);
  // TASKS.csv #2948 — grouped once per (log, code layer); a ranking change only re-reads the kept, sorted arrays (2.1 s at 484,531 bins before)
  // and on a big log the grouping and the pairings run just after the next paint, the pane saying what it is doing meanwhile
  const nRows = data?.assays.length || 0, heavy = nRows > DEFER_ROWS;
  const { value: grouped, pending: groupPending } = useDeferredMemo(() => (data && domainFold ? groupLogByCode(data.assays, data.symbol, domainFold.rows) : null), [data, domainFold], heavy);
  const groups = useMemo(() => (grouped ? rankLogGroups(grouped, { stat: rankStat, above: Number(rankAbove) }) : []), [grouped, rankStat, rankAbove]);
  const nOfCode = useMemo(() => new Map(groups.map((g) => [g.key, g.n])), [groups]);
  // TASKS.csv #2951 — codes under the minimum count go last (box plot, sentence, table): nine bins no longer outrank 29,000
  const [minCountText, setMinCountText] = useKeptState(keptScope, "dhlogs.minCount", "30");
  const minCount = Math.max(1, Math.round(Number(minCountText)) || 1);
  const ranked = useMemo(() => { const common = groups.filter((g) => g.n >= minCount), rare = groups.filter((g) => g.n < minCount); return { common, rare, all: [...common, ...rare] }; }, [groups, minCount]);
  const table = useMemo(() => (grouped ? codeTable(grouped) : []), [grouped]);
  // TASKS.csv #2953 — whiskers at P2 and P98 of each code (they were the minimum and maximum: one bad bin set the whole axis), and how many
  // readings lie beyond them
  const boxes = useMemo(() => {
    let beyond = 0;
    const gs = ranked.all.map((g) => {
      const s = grouped?.get(g.key)?.sorted;
      if (!s?.length) return g;
      const lo = quantileSorted(s, 0.02), hi = quantileSorted(s, 0.98);
      for (let i = 0; i < s.length && s[i] < lo; i++) beyond++;
      for (let i = s.length - 1; i >= 0 && s[i] > hi; i--) beyond++;
      return { ...g, stats: { ...g.stats, min: lo, max: hi } };
    });
    return { groups: gs, beyond };
  }, [ranked, grouped]);
  const tableWeighted = table.some((r) => r.weighted);
  const symbols = assayElements.map((e) => e.symbol);
  const [element, setElement] = useKeptState(keptScope, "dhlogs.element", "");
  const lead = useLeadCommodity(); // #2967 — the project's lead commodity (#2908: Fe on an iron project), not the first symbol of the alphabet
  const el = symbols.includes(element) ? element : symbols.includes(lead) ? lead : symbols[0] || "";
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  // TASKS.csv #2954 — pair each reading, or the log's mean over each assay sample (one pair per sample: four bins of one sample are not four pairs)
  const [pairOn, setPairOn] = useKeptState(keptScope, "dhlogs.pairOn", "reading");
  // TASKS.csv #3078 — which assay interval holds each reading is found once per (log, assay table); an element or Pair on change reads only
  // the values through it (logVsAssay is the two together)
  const { value: vsIndex, pending: idxPending } = useDeferredMemo(() => (data ? assayIndex(data.assays, data.symbol, assays) : null), [data, assays], heavy);
  const { value: vs, pending: vsOwnPending } = useDeferredMemo(() => (vsIndex && el ? logVsAssayIndexed(vsIndex, el, elementUnits, { perSample: pairOn === "sample" }) : null), [vsIndex, el, elementUnits, pairOn], heavy); // #2948
  const vsPending = idxPending || vsOwnPending;
  const vsLogX = useMemo(() => !!vs && allAboveZero(vs.xs), [vs]), vsLogY = useMemo(() => !!vs && allAboveZero(vs.ys), [vs]); // #3078 — the typed columns // #2948 — once per pairing, not per render
  const unitOf = (u) => (u === "as logged" ? "" : u);
  const implausible = useMemo(() => implausibleReadings(logValues, unitOf(source?.unit || "")), [logValues, source]); // #2953 — after unitOf (declared above: a render-time TDZ otherwise)
  // TASKS.csv #1595 — against a block model evaluated onto the holes (Block models > Evaluate onto drillholes)
  const onHoles = useMemo(() => customLayers.filter((l) => (l.rows || []).some((r) => r.modelled && (r.numeric || (typeof r.value === "number" && Number.isFinite(r.value))))) /* rows from Evaluate (the store's copy keeps only id / name / rows). #2240: and drops 'numeric', so a modelled row with a number counts (categorical evaluations carry text) */, [customLayers]);
  const [modelLayerId, setModelLayerId] = useKeptState(keptScope, "dhlogs.model", "");
  const modelLayer = onHoles.find((l) => String(l.id) === modelLayerId) || onHoles[0] || null;
  const { value: vm, pending: vmPending } = useDeferredMemo(() => (data && modelLayer ? logVsModel(data.assays, data.symbol, modelLayer.rows) : null), [data, modelLayer], heavy); // #2948
  const vmLogX = useMemo(() => !!vm && allAboveZero(vm.pairs.map((p) => p[0])), [vm]), vmLogY = useMemo(() => !!vm && allAboveZero(vm.pairs.map((p) => p[1])), [vm]);
  const working = (text) => <div style={note} role="status">{text}</div>;
  return (
    <>
      <TaskPaneHeader title={tr("Downhole logs")} helpId="downhole-logs" icon={Activity} tone="analyse" onClose={onClose} />
      {!sources.length ? (
        <div style={note}>{tr("No downhole log yet: import mag susc, SG, RQD or recovery readings as a drillhole layer (3D View > Add layer), or a custom layer with a numeric column.")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={note}>{tr("Petrophysics from the holes: a log by the logged code at each reading (magnetite destruction shows as a low mag-susc class), and against an assay element reading by reading.")}</div>
          <label style={row}>{tr("Log")}
            <select value={source?.key || ""} onChange={(e) => setSourceKey(e.target.value)} style={{ ...smallSel, maxWidth: 190 }} aria-label={tr("Downhole log")}>
              {sources.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.n.toLocaleString()})</option>)}
            </select></label>
          {data && <div style={note}>{tr(source?.binM === "assay" ? "{n} assay-interval bins, in {u}{v}." /* #3039 */ : source?.binM ? "{n} bins of {b} m, in {u}{v}." : unitOf(source?.unit) ? "{n} readings, in {u}{v}." : "{n} readings, values as logged{v}.", { n: data.assays.length.toLocaleString(), b: source?.binM, u: unitOf(source?.unit) || tr("the layer's own units"), v: data.pointRows ? tr("; {p} depth-only readings are given {s} m of core each", { p: data.pointRows.toLocaleString(), s: data.pointSupport }) : "" })}</div>}
          {logLayer && <LogUnitField layer={logLayer} onSet={(u) => setCustomLayers((p) => p.map((c) => (c.id === logLayer.id ? { ...c, unit: u || undefined } : c)))} />}{/* #2952 */}
          {logLayer && <ValidRangeField layer={logLayer} onSet={(r) => setCustomLayers((p) => p.map((c) => (c.id === logLayer.id ? { ...c, validRange: r } : c)))} />}{/* #2953 */}
          {data?.outOfRange > 0 && <div style={note}>{tr("{k} reading(s) outside the valid range ({lo} to {hi}) are left out here and in Estimation and Grade shell.", { k: data.outOfRange.toLocaleString(), lo: Number.isFinite(data.validRange[0]) ? data.validRange[0] : "…", hi: Number.isFinite(data.validRange[1]) ? data.validRange[1] : "…" })}</div>}
          {implausible && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr(implausible.rule === "density" ? "{n} reading(s) are outside {lo} to {hi} {u}, denser or lighter than any rock: check them, or set a valid range." : "{n} reading(s) are below 0, which a reading in {u} cannot be: check them, or set a valid range.", { n: implausible.n.toLocaleString(), lo: implausible.lo, hi: implausible.hi, u: implausible.unit })}</div>}
          {layerNotes && <div style={{ ...note, color: "var(--color-text-muted)", whiteSpace: "pre-wrap" }}>{tr("Layer notes: {v}", { v: layerNotes })}</div>}{/* TASKS.csv #2775 — the import's notes (what was left out, where readings sit), as the 3D View's row shows them (#2432); English project text */}
          {overPct > 0 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("{n} reading(s) are above 100 %, which a percentage cannot be: check them (Data QC lists them). They are drawn as logged.", { n: overPct.toLocaleString() })}</div>}{/* #2245 */}
          <label style={row}>{tr("By code of")}
            <select value={domain?.key || ""} onChange={(e) => setDomainKey(e.target.value)} style={{ ...smallSel, maxWidth: 190 }} aria-label={tr("Group readings by")} disabled={!domains.length}>
              {!domains.length && <option value="">{tr("— no logged codes —")}</option>}
              {domains.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select></label>
          {domainFold?.folded.length > 0 && <div style={note}>{tr("Spellings that differ only by case or spaces are one domain here: {list}.", { list: domainFold.folded.map((f) => f.codes.join(" = ")).join("; ") })}</div>}{/* #2790 */}
          <label style={row}>{tr("Scale")}{/* #2967 — per log, with Automatic */}
            <select value={scale.auto ? "auto" : scale.log ? "log" : "linear"} onChange={(e) => setScale(e.target.value)} style={{ ...smallSel, maxWidth: 190 }} aria-label={tr("Scale of this log")} disabled={!source}>
              <option value="auto">{scale.autoLog ? tr("Automatic (logarithmic)") : tr("Automatic (linear)")}</option>
              <option value="log">{tr("Logarithmic")}</option>
              <option value="linear">{tr("Linear")}</option>
            </select></label>
          {logHidden > 0 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("{k} of {n} readings are zero or negative and are not shown on the log scale.", { k: logHidden.toLocaleString(), n: logValues.filter(Number.isFinite).length.toLocaleString() })}</div>}
          {groupPending ? working(tr("Grouping {n} readings by {layer}…", { n: nRows.toLocaleString(), layer: domain?.label || "" })) : groups.length > 0 ? (
            <>
              <BoxPlots fit groups={boxes.groups} /* #2951: common codes first; #2953: whiskers P2-P98 */ domainLabel={(k) => `${codeLabel(k, 16)} (${nOfCode.get(k)?.toLocaleString()})`} /* #2401 */ logScale={logScale} unit={unitOf(source.unit)} />
              {boxes.beyond > 0 && <div style={note}>{tr("Whiskers run from P2 to P98 of each code, so a stray reading cannot squash the plot; {k} reading(s) lie beyond them.", { k: boxes.beyond.toLocaleString() })}</div>}{/* #2953 */}
              <label style={{ ...row, justifyContent: "flex-start", gap: 6 }}>{tr("Rank codes by")}
                <select value={rankStat} onChange={(e) => setRankStat(e.target.value)} style={smallSel} aria-label={tr("Rank codes by")}>
                  <option value="median">{tr("Median")}</option><option value="mean">{tr("Mean")}</option><option value="p90">P90</option><option value="above">{tr("Share above a value")}</option>
                </select>
                {rankStat === "above" && <input type="number" step="any" value={rankAbove} onChange={(e) => setRankAbove(e.target.value)} aria-label={tr("Value the share is counted above")} style={{ ...smallSel, width: 70 }} />}
              </label>{/* #2393 */}
              <div style={note}>{rankStat === "above"
                ? tr("Share of readings above {v} per code, highest first: {list}.", { v: rankAbove, list: (ranked.common.length ? ranked.common : groups).slice(0, 8).map((g) => `${g.key === NOT_LOGGED ? tr("(not logged)") : g.key} ${Math.round(g.value)}% (${(g.nAbove ?? 0).toLocaleString()} of ${g.n.toLocaleString()})`).join(" · ") })
                : tr(rankStat === "mean" ? "Mean per code, highest first: {list}." : rankStat === "p90" ? "P90 per code, highest first: {list}." : "Median per code, highest first: {list}.", { list: (ranked.common.length ? ranked.common : groups).slice(0, 8).map((g) => `${codeLabel(g.key)} ${Number(g.value.toPrecision(3))}`).join(" · ") /* #2401; #2951: codes under the minimum count left out */ })}</div>
              <label style={{ ...row, justifyContent: "flex-start", gap: 6 }}>{tr("Minimum count")}
                <input type="number" min={1} step={1} value={minCountText} onChange={(e) => setMinCountText(e.target.value)} style={{ ...smallSel, width: 70 }} aria-label={tr("Minimum count of a code")} />
              </label>
              {table.some((r) => r.n < minCount) && <div style={note}>{tr(source?.binM ? "{k} code(s) with fewer than {n} bins are greyed and listed last." : "{k} code(s) with fewer than {n} readings are greyed and listed last.", { k: table.filter((r) => r.n < minCount).length, n: minCount.toLocaleString() })}</div>}{/* counted in the table: it lists every code, the box plot only those of 3 or more */}
              <CodeTable rows={table} order={ranked.all.map((g) => g.key)} minCount={minCount} unit={unitOf(source.unit)} binned={!!source?.binM} keptScope={keptScope} />
              {tableWeighted && <div style={note}>{tr("Means weigh each bin by its number of readings; the median and percentiles are of the bins.")}</div>}
            </>
          ) : domain && <div style={note}>{tr("No code of {layer} has three or more readings of this log.", { layer: domain.label })}</div>}
          {symbols.length > 0 && (
            <>
              <label style={{ ...row, marginTop: 8 }}>{tr("Against element")}
                <select value={el} onChange={(e) => setElement(e.target.value)} style={{ ...smallSel, maxWidth: 190 }} aria-label={tr("Assay element to compare")}>
                  {symbols.map((s) => <option key={s} value={s}>{s} ({elementUnits[s] || "ppm"})</option>)}
                </select></label>
              <label style={row}>{tr("Pair on")}
                <select value={pairOn} onChange={(e) => setPairOn(e.target.value)} style={{ ...smallSel, maxWidth: 190 }} aria-label={tr("Pair the log with the assays on")}>
                  <option value="reading">{tr("Each reading")}</option><option value="sample">{tr("The log's mean over each sample")}</option>
                </select></label>{/* #2954 */}
              {vsPending ? working(tr("Pairing {n} readings with the {el} assays…", { n: nRows.toLocaleString(), el })) : vs && vs.n >= 3 ? (
                <>
                  {logScale && !vsLogX && <div style={note}>{tr("The scatter keeps a linear axis for the log: {n} of its readings are zero or negative.", { n: vs.xs.reduce((k, x) => k + (x > 0 ? 0 : 1), 0).toLocaleString() })}</div>}{/* #2953 */}
                  <Scatter xs={vs.xs} ys={vs.ys} xLabel={`${source.label}${unitOf(source.unit) && !source.label.includes(`(${unitOf(source.unit)})`) ? ` (${unitOf(source.unit)})` : ""}`} yLabel={`${el} (${vs.unit})`} logX={logScale && vsLogX} logY={logScale && vsLogY} fit={vs.fit} />
                  <div style={note}>{vs.perSample ? (logScale
                    ? tr("{n} assay samples, each paired with the log's mean over the readings inside it. Spearman rank correlation {r}; Pearson on log10 values {rLog} ({k} pairs above zero).", { n: vs.n.toLocaleString(), r: Number.isFinite(vs.r) ? vs.r.toFixed(2) : "—", rLog: Number.isFinite(vs.rLog) ? vs.rLog.toFixed(2) : "—", k: (vs.nLog ?? 0).toLocaleString() })
                    : tr("{n} assay samples, each paired with the log's mean over the readings inside it. Spearman rank correlation {r}; Pearson {rLin}.", { n: vs.n.toLocaleString(), r: Number.isFinite(vs.r) ? vs.r.toFixed(2) : "—", rLin: Number.isFinite(vs.rLin) ? vs.rLin.toFixed(2) : "—" }))
                    : logScale
                    ? tr("{n} readings inside an assay interval of the same hole. Spearman rank correlation {r}; Pearson on log10 values {rLog} ({k} pairs above zero).", { n: vs.n.toLocaleString(), r: Number.isFinite(vs.r) ? vs.r.toFixed(2) : "—", rLog: Number.isFinite(vs.rLog) ? vs.rLog.toFixed(2) : "—", k: (vs.nLog ?? 0).toLocaleString() })
                    : tr("{n} readings inside an assay interval of the same hole. Spearman rank correlation {r}; Pearson {rLin}.", { n: vs.n.toLocaleString(), r: Number.isFinite(vs.r) ? vs.r.toFixed(2) : "—", rLin: Number.isFinite(vs.rLin) ? vs.rLin.toFixed(2) : "—" })}{Number.isFinite(vs.medianRatio) && ratioComparable(`${source.label} ${source.unit || ""}`, el) /* #2954 — only one quantity against itself (eU3O8 against U3O8) */ ? " " + tr("Log / assay: median {m}, length-weighted {w} (in the units shown; a gamma log against its assays reads the disequilibrium here).", { m: vs.medianRatio.toPrecision(3), w: Number.isFinite(vs.weightedRatio) ? vs.weightedRatio.toPrecision(3) : "—" }) : ""}</div>{/* ratios: #2353 */}
                  {vs.fit && <div style={note}>{tr("Least-squares line: {log} = {a} + {b} × {el} ({n} pairs).", { log: source.label, a: sig3(vs.fit.a), b: sig3(vs.fit.b), el, n: vs.fit.n.toLocaleString() })}</div>}{/* #2954 */}
                </>
              ) : <div style={note}>{tr("Fewer than three readings fall inside an assay interval of the same hole.")}</div>}
            </>
          )}
          {onHoles.length > 0 ? (
            <>
              <label style={{ ...row, marginTop: 8 }}>{tr("Against a model on the holes")}
                <select value={modelLayer ? String(modelLayer.id) : ""} onChange={(e) => setModelLayerId(e.target.value)} style={{ ...smallSel, maxWidth: 190 }} aria-label={tr("Block model evaluated onto the holes")}>
                  {onHoles.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
                </select></label>
              {vmPending ? working(tr("Pairing {n} readings with the model…", { n: nRows.toLocaleString() })) : vm && vm.n >= 3 ? (
                <>
                  <Scatter pairs={vm.pairs} xLabel={`${source.label}${unitOf(source.unit) && !source.label.includes(`(${unitOf(source.unit)})`) ? ` (${unitOf(source.unit)})` : ""}`} yLabel={modelLayer.unit ? `${tr("Model")} (${modelLayer.unit})` : tr("Model")} logX={logScale && vmLogX} logY={logScale && vmLogY} />
                  <div style={note}>{logScale
                    ? tr("{n} readings inside a model cell the same hole crosses. Spearman rank correlation {r} (the same in any units); Pearson on log10 values {rLog} ({k} pairs above zero). Median of the log {a}, of the model {b}, each in its own unit.", { n: vm.n.toLocaleString(), r: Number.isFinite(vm.r) ? vm.r.toFixed(2) : "—", rLog: Number.isFinite(vm.rLog) ? vm.rLog.toFixed(2) : "—", k: (vm.nLog ?? 0).toLocaleString(), a: sig3(vm.medianLog), b: sig3(vm.medianModel) })
                    : tr("{n} readings inside a model cell the same hole crosses. Spearman rank correlation {r} (the same in any units); Pearson {rLin}. Median of the log {a}, of the model {b}, each in its own unit.", { n: vm.n.toLocaleString(), r: Number.isFinite(vm.r) ? vm.r.toFixed(2) : "—", rLin: Number.isFinite(vm.rLin) ? vm.rLin.toFixed(2) : "—", a: sig3(vm.medianLog), b: sig3(vm.medianModel) })}</div>
                  {Number.isFinite(vm.r) && Math.abs(vm.r) < 0.2 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("The model hardly follows the logged values along the holes (|Spearman| under 0.2): its cells may be too coarse, or it images something the core does not record.")}</div>}
                </>
              ) : <div style={note}>{tr("Fewer than three readings fall inside a cell of this model.")}</div>}
            </>
          ) : <div style={{ ...note, marginTop: 8 }}>{tr("To compare this log with a block model, evaluate the model onto the holes first (Block models > the model's drillhole icon); it then appears here.")}</div>}
          <div style={{ ...note, marginTop: 8 }}>{tr("To grid this log into a block model or shell it, use 3D Modelling > Estimation or Grade shell and pick it as the source.")}{onEstimate && <>{" "}<button type="button" onClick={onEstimate} style={{ ...smallSel, cursor: "pointer" }}>{tr("Open 3D Modelling")}</button></>}</div>
        </div>
      )}
    </>
  );
}
