// TASKS.csv #1425 / #1708 — the Geophysics tab's downhole logs: mag susc, SG, RQD, recovery or a numeric custom field by a logged
// code (box plot) and against an assay element (scatter, Spearman). The same sources Estimation and Grade shell take (#1741).
import React, { useMemo, useState } from "react";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { Activity } from "./icons.js";
import { numericSourceChoices, sourceAssays } from "../lib/numericSources.js";
import { domainLayerChoices } from "../lib/domainLayers.js";
import { LAYER_META } from "../lib/layers.js";
import { logByCode, logVsAssay, NOT_LOGGED } from "../lib/downholeLogs.js";
import { BoxPlots } from "./GradeStatistics.jsx";
import { smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";

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
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("{y} against {x}", { x: xLabel, y: yLabel })} style={{ display: "block", background: "#fff", border: "1px solid var(--color-border)", borderRadius: 6 }}>
      <line x1={pl} y1={pt} x2={pl} y2={h - pb} stroke="#94a1b0" /><line x1={pl} y1={h - pb} x2={w - pr} y2={h - pb} stroke="#94a1b0" />
      {pts.map(([x, y], i) => <circle key={i} cx={sx(x)} cy={sy(y)} r="2" fill="#2f6db5" fillOpacity="0.55" />)}
      <text x={pl} y={h - pb + 12} fontSize="8" fill="#55606e">{lab(x0, logX)}</text>
      <text x={w - pr} y={h - pb + 12} fontSize="8" fill="#55606e" textAnchor="end">{lab(x1, logX)}</text>
      <text x={(pl + w - pr) / 2} y={h - 4} fontSize="9" fill="#55606e" textAnchor="middle">{xLabel}{logX ? ` (${tr("log scale")})` : ""}</text>
      <text x={pl - 3} y={h - pb} fontSize="8" fill="#55606e" textAnchor="end">{lab(y0, logY)}</text>
      <text x={pl - 3} y={pt + 8} fontSize="8" fill="#55606e" textAnchor="end">{lab(y1, logY)}</text>
      <text x={10} y={(pt + h - pb) / 2} fontSize="9" fill="#55606e" textAnchor="middle" transform={`rotate(-90 10 ${(pt + h - pb) / 2})`}>{yLabel}{logY ? ` (${tr("log scale")})` : ""}</text>
    </svg>
  );
}

export default function DownholeLogsPane({ layers, customLayers = [], assays = [], assayElements = [], onClose, onEstimate = null }) {
  const sources = useMemo(() => numericSourceChoices({ layers, customLayers }), [layers, customLayers]);
  const [sourceKey, setSourceKey] = useState("");
  const source = sources.find((s) => s.key === sourceKey) || sources[0] || null;
  const data = useMemo(() => (source ? sourceAssays(source, { layers, customLayers }) : null), [source, layers, customLayers]);
  const domains = useMemo(() => domainLayerChoices(layers, customLayers, (k) => tr(LAYER_META[k]?.label || k)), [layers, customLayers]);
  const [domainKey, setDomainKey] = useState("");
  const domain = domains.find((d) => d.key === domainKey) || domains[0] || null;
  const [logScale, setLogScale] = useState(true);
  const groups = useMemo(() => (data && domain ? logByCode(data.assays, data.symbol, domain.rows) : []), [data, domain]);
  const symbols = assayElements.map((e) => e.symbol);
  const [element, setElement] = useState("");
  const el = symbols.includes(element) ? element : symbols[0] || "";
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const vs = useMemo(() => (data && el ? logVsAssay(data.assays, data.symbol, assays, el, elementUnits) : null), [data, assays, el, elementUnits]);
  const unitOf = (u) => (u === "as logged" ? "" : u);
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
          {data && <div style={note}>{tr("{n} readings, values as logged{v}.", { n: data.assays.length.toLocaleString(), v: data.pointRows ? tr("; {p} depth-only readings are given {s} m of core each", { p: data.pointRows.toLocaleString(), s: data.pointSupport }) : "" })}</div>}
          <label style={row}>{tr("By code of")}
            <select value={domain?.key || ""} onChange={(e) => setDomainKey(e.target.value)} style={{ ...smallSel, maxWidth: 190 }} aria-label={tr("Group readings by")} disabled={!domains.length}>
              {!domains.length && <option value="">{tr("— no logged codes —")}</option>}
              {domains.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select></label>
          <label style={{ ...row, justifyContent: "flex-start" }}><input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />{tr("Log scale")}</label>
          {groups.length > 0 ? (
            <>
              <BoxPlots fit groups={groups} domainLabel={(k) => `${k === NOT_LOGGED ? tr("(not logged)") : k} (${groups.find((g) => g.key === k)?.n.toLocaleString()})`} logScale={logScale} unit={unitOf(source.unit)} />
              <div style={note}>{tr("Median per code, highest first: {list}.", { list: groups.slice(0, 6).map((g) => `${g.key === NOT_LOGGED ? tr("(not logged)") : g.key} ${Number(g.stats.median.toPrecision(3))}`).join(" · ") })}</div>
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
                  <Scatter pairs={vs.pairs} xLabel={`${source.label}${unitOf(source.unit) ? ` (${unitOf(source.unit)})` : ""}`} yLabel={`${el} (${vs.unit})`} logX={logScale} logY={logScale} />
                  <div style={note}>{tr("{n} readings inside an assay interval of the same hole. Spearman rank correlation {r}; Pearson on log10 values {rLog}.", { n: vs.n.toLocaleString(), r: Number.isFinite(vs.r) ? vs.r.toFixed(2) : "—", rLog: Number.isFinite(vs.rLog) ? vs.rLog.toFixed(2) : "—" })}</div>
                </>
              ) : <div style={note}>{tr("Fewer than three readings fall inside an assay interval of the same hole.")}</div>}
            </>
          )}
          <div style={{ ...note, marginTop: 8 }}>{tr("To grid this log into a block model or shell it, use 3D Modelling > Estimation or Grade shell and pick it as the source.")}{onEstimate && <>{" "}<button type="button" onClick={onEstimate} style={{ ...smallSel, cursor: "pointer" }}>{tr("Open 3D Modelling")}</button></>}</div>
        </div>
      )}
    </>
  );
}
