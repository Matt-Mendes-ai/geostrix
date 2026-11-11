// TASKS.csv #1425 / #1708 — the Geophysics tab's downhole logs: mag susc, SG, RQD, recovery or a numeric custom field by a logged
// code (box plot) and against an assay element (scatter, Spearman). The same sources Estimation and Grade shell take (#1741).
import React, { useMemo } from "react";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { Activity } from "./icons.js";
import { numericSourceChoices, sourceAssays } from "../lib/numericSources.js";
import { domainLayerChoices } from "../lib/domainLayers.js";
import { LAYER_META } from "../lib/layers.js";
import { logByCode, logVsAssay, logVsModel, NOT_LOGGED, strideSample } from "../lib/downholeLogs.js"; // logVsModel: #1595; strideSample: #2331
import { BoxPlots } from "./GradeStatistics.jsx";
import { smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";
import { useKeptState, scopeOf } from "../lib/keptState.js"; // TASKS.csv #2394 — the choices survive the pane closing (per project)
import { useStore } from "../lib/store.jsx";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", fontSize: "var(--font-size-sm)", marginBottom: 6 };

function Scatter({ pairs, xLabel, yLabel, logX, logY }) {
  const w = 300, h = 220, pl = 44, pb = 30, pr = 8, pt = 8;
  const fx = logX ? (v) => Math.log10(v) : (v) => v, fy = logY ? (v) => Math.log10(v) : (v) => v;
  const pts = pairs.filter(([x, y]) => (!logX || x > 0) && (!logY || y > 0)).map(([x, y]) => [fx(x), fy(y)]);
  if (pts.length < 3) return <div style={note}>{tr("Too few readings above zero for a log-scale plot.")}</div>;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const sx = (x) => pl + ((x - x0) / ((x1 - x0) || 1)) * (w - pl - pr), sy = (y) => h - pb - ((y - y0) / ((y1 - y0) || 1)) * (h - pb - pt);
  const lab = (v, log) => (log ? Number((10 ** v).toPrecision(2)) : Number(v.toPrecision(3))).toLocaleString();
  const drawn = strideSample(pts); // #2331 — a few thousand drawn, the axes and statistics from every pair
  return (
    <>
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("{y} against {x}", { x: xLabel, y: yLabel })} style={{ display: "block", background: "#fff", border: "1px solid var(--color-border)", borderRadius: 6 }}>
      <line x1={pl} y1={pt} x2={pl} y2={h - pb} stroke="#94a1b0" /><line x1={pl} y1={h - pb} x2={w - pr} y2={h - pb} stroke="#94a1b0" />
      {drawn.points.map(([x, y], i) => <circle key={i} cx={sx(x)} cy={sy(y)} r="2" fill="#2f6db5" fillOpacity="0.55" />)}
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

export default function DownholeLogsPane({ layers, customLayers = [], assays = [], assayElements = [], onClose, onEstimate = null }) {
  const sources = useMemo(() => numericSourceChoices({ layers, customLayers }), [layers, customLayers]);
  // TASKS.csv #2394 (review #2325) — the pane forgot its log, code layer, element and model on reopen, and the stall of picking the log
  // again was paid every time: kept per project as Geochem's and Geophysics' panels keep theirs (#1284)
  const keptScope = scopeOf(useStore().getProjectToken());
  const [sourceKey, setSourceKey] = useKeptState(keptScope, "dhlogs.source", "");
  const source = sources.find((s) => s.key === sourceKey) || sources[0] || null;
  const data = useMemo(() => (source ? sourceAssays(source, { layers, customLayers }) : null), [source, layers, customLayers]);
  const domains = useMemo(() => domainLayerChoices(layers, customLayers, (k) => tr(LAYER_META[k]?.label || k)), [layers, customLayers]);
  const [domainKey, setDomainKey] = useKeptState(keptScope, "dhlogs.domain", "");
  const domain = domains.find((d) => d.key === domainKey) || domains[0] || null;
  const [logScale, setLogScale] = useKeptState(keptScope, "dhlogs.logScale", true);
  // TASKS.csv #2393 — rank the codes by the median (default), the mean, P90 or the share of readings above a value
  const [rankStat, setRankStat] = useKeptState(keptScope, "dhlogs.rankStat", "median");
  const [rankAbove, setRankAbove] = useKeptState(keptScope, "dhlogs.rankAbove", "100");
  const groups = useMemo(() => (data && domain ? logByCode(data.assays, data.symbol, domain.rows, { stat: rankStat, above: Number(rankAbove) }) : []), [data, domain, rankStat, rankAbove]);
  const symbols = assayElements.map((e) => e.symbol);
  const [element, setElement] = useKeptState(keptScope, "dhlogs.element", "");
  const el = symbols.includes(element) ? element : symbols[0] || "";
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const vs = useMemo(() => (data && el ? logVsAssay(data.assays, data.symbol, assays, el, elementUnits) : null), [data, assays, el, elementUnits]);
  const unitOf = (u) => (u === "as logged" ? "" : u);
  // TASKS.csv #1595 — against a block model evaluated onto the holes (Block models > Evaluate onto drillholes)
  const onHoles = useMemo(() => customLayers.filter((l) => (l.rows || []).some((r) => r.modelled && (r.numeric || (typeof r.value === "number" && Number.isFinite(r.value))))) /* rows from Evaluate (the store's copy keeps only id / name / rows). #2240: and drops 'numeric', so a modelled row with a number counts (categorical evaluations carry text) */, [customLayers]);
  const [modelLayerId, setModelLayerId] = useKeptState(keptScope, "dhlogs.model", "");
  const modelLayer = onHoles.find((l) => String(l.id) === modelLayerId) || onHoles[0] || null;
  const vm = useMemo(() => (data && modelLayer ? logVsModel(data.assays, data.symbol, modelLayer.rows) : null), [data, modelLayer]);
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
          {data && <div style={note}>{tr(source?.binM ? "{n} bins of {b} m, in {u}{v}." : unitOf(source?.unit) ? "{n} readings, in {u}{v}." : "{n} readings, values as logged{v}.", { n: data.assays.length.toLocaleString(), b: source?.binM, u: unitOf(source?.unit) || tr("the layer's own units"), v: data.pointRows ? tr("; {p} depth-only readings are given {s} m of core each", { p: data.pointRows.toLocaleString(), s: data.pointSupport }) : "" })}</div>}
          <label style={row}>{tr("By code of")}
            <select value={domain?.key || ""} onChange={(e) => setDomainKey(e.target.value)} style={{ ...smallSel, maxWidth: 190 }} aria-label={tr("Group readings by")} disabled={!domains.length}>
              {!domains.length && <option value="">{tr("— no logged codes —")}</option>}
              {domains.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select></label>
          <label style={{ ...row, justifyContent: "flex-start" }}><input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />{tr("Log scale")}</label>
          {groups.length > 0 ? (
            <>
              <BoxPlots fit groups={groups} domainLabel={(k) => `${k === NOT_LOGGED ? tr("(not logged)") : k} (${groups.find((g) => g.key === k)?.n.toLocaleString()})`} logScale={logScale} unit={unitOf(source.unit)} />
              <label style={{ ...row, justifyContent: "flex-start", gap: 6 }}>{tr("Rank codes by")}
                <select value={rankStat} onChange={(e) => setRankStat(e.target.value)} style={smallSel} aria-label={tr("Rank codes by")}>
                  <option value="median">{tr("Median")}</option><option value="mean">{tr("Mean")}</option><option value="p90">P90</option><option value="above">{tr("Share above a value")}</option>
                </select>
                {rankStat === "above" && <input type="number" step="any" value={rankAbove} onChange={(e) => setRankAbove(e.target.value)} aria-label={tr("Value the share is counted above")} style={{ ...smallSel, width: 70 }} />}
              </label>{/* #2393 */}
              <div style={note}>{rankStat === "above"
                ? tr("Share of readings above {v} per code, highest first: {list}.", { v: rankAbove, list: groups.slice(0, 8).map((g) => `${g.key === NOT_LOGGED ? tr("(not logged)") : g.key} ${Math.round(g.value)}% (${(g.nAbove ?? 0).toLocaleString()} of ${g.n.toLocaleString()})`).join(" · ") })
                : tr(rankStat === "mean" ? "Mean per code, highest first: {list}." : rankStat === "p90" ? "P90 per code, highest first: {list}." : "Median per code, highest first: {list}.", { list: groups.slice(0, 8).map((g) => `${g.key === NOT_LOGGED ? tr("(not logged)") : g.key} ${Number(g.value.toPrecision(3))}`).join(" · ") })}</div>
            </>
          ) : domain && <div style={note}>{tr("No code of {layer} has three or more readings of this log.", { layer: domain.label })}</div>}
          {symbols.length > 0 && (
            <>
              <label style={{ ...row, marginTop: 8 }}>{tr("Against element")}
                <select value={el} onChange={(e) => setElement(e.target.value)} style={{ ...smallSel, maxWidth: 190 }} aria-label={tr("Assay element to compare")}>
                  {symbols.map((s) => <option key={s} value={s}>{s} ({elementUnits[s] || "ppm"})</option>)}
                </select></label>
              {vs && vs.n >= 3 ? (
                <>
                  <Scatter pairs={vs.pairs} xLabel={`${source.label}${unitOf(source.unit) && !source.label.includes(`(${unitOf(source.unit)})`) ? ` (${unitOf(source.unit)})` : ""}`} yLabel={`${el} (${vs.unit})`} logX={logScale} logY={logScale} />
                  <div style={note}>{tr("{n} readings inside an assay interval of the same hole. Spearman rank correlation {r}; Pearson on log10 values {rLog}.", { n: vs.n.toLocaleString(), r: Number.isFinite(vs.r) ? vs.r.toFixed(2) : "—", rLog: Number.isFinite(vs.rLog) ? vs.rLog.toFixed(2) : "—" })}{Number.isFinite(vs.medianRatio) ? " " + tr("Log / assay: median {m}, length-weighted {w} (in the units shown; a gamma log against its assays reads the disequilibrium here).", { m: vs.medianRatio.toPrecision(3), w: Number.isFinite(vs.weightedRatio) ? vs.weightedRatio.toPrecision(3) : "—" }) : ""}</div>{/* ratios: #2353 */}
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
              {vm && vm.n >= 3 ? (
                <>
                  <Scatter pairs={vm.pairs} xLabel={`${source.label}${unitOf(source.unit) && !source.label.includes(`(${unitOf(source.unit)})`) ? ` (${unitOf(source.unit)})` : ""}`} yLabel={modelLayer.unit ? `${tr("Model")} (${modelLayer.unit})` : tr("Model")} logX={logScale} logY={logScale} />
                  <div style={note}>{tr("{n} readings inside a model cell the same hole crosses. Spearman rank correlation {r} (the same in any units); Pearson on log10 values {rLog}. Median of the log {a}, of the model {b}, each in its own unit.", { n: vm.n.toLocaleString(), r: Number.isFinite(vm.r) ? vm.r.toFixed(2) : "—", rLog: Number.isFinite(vm.rLog) ? vm.rLog.toFixed(2) : "—", a: Number(vm.medianLog.toPrecision(3)).toLocaleString(), b: Number(vm.medianModel.toPrecision(3)).toLocaleString() })}</div>
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
