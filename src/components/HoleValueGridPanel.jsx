// TASKS.csv #2658 — Maps plan > Collars > Grid a per-hole value: one value per hole (highest, length-weighted mean, or depth of the first
// interval at or over a threshold, of an assay element or a numeric log; lib/holeValueGrid.js) gridded at the collars with the
// surface-sample gridding (lib/sampleGrid.js, #1622), so the raster is contoured and shown in the plan's figure like a soil grid.
import React, { useMemo, useState } from "react";
import { gradeUnitLabel } from "../lib/geochemColumns.js"; // TASKS.csv #3749
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";
import { gridSamples, logByDefault, samplePoints, suggestSampleGrid, MINCURV_MAX_CELLS } from "../lib/sampleGrid.js";
import { holeValueSources, holeValueRows, perHoleValue, holeValueMeta, perHoleSpan, holeSamplesAt, perHoleCoded, placementAdvice } from "../lib/holeValueGrid.js"; // perHoleSpan, holeSamplesAt: #2745; perHoleCoded: #2991
import { preferredElement } from "../lib/preferredElement.js"; // TASKS.csv #3353 (7) — opens on the lead commodity, not the suite's first element
import { useLeadCommodity } from "../lib/useLeadCommodity.js";
import { LAYER_META } from "../lib/layers.js"; // TASKS.csv #2991 — a built-in log's name
import { rasterColourFields } from "../lib/rasterColour.js";
import { f32ToB64 } from "../lib/inversion.js";
import { defaultDrapeElevation } from "../lib/drapeElevation.js";
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926
import StepPane, { StepNumbers } from "./StepPane.jsx"; // TASKS.csv #4088

const KEY = "value";

// TASKS.csv #2991 — what a coded-log grid stands for, in English (project data: the raster's name). -> { unit: "m", what }
function codedMeta(layer, codes, st, vertical) {
  const c = `${layer} ${codes.join(" + ")}`;
  const what = st === "thick" ? `${c} thickness` : st === "topRL" ? `RL of the top of ${c}` : st === "baseRL" ? `RL of the base of ${c}` : `${vertical ? "vertical depth" : "depth"} to the ${st === "base" ? "base" : "top"} of ${c}`;
  return { unit: "m", what };
}

export default function HoleValueGridPanel() {
  const { collars = [], assays = [], assayElements = [], layers = {}, customLayers = [], addRaster, voxelModels, surfaceSamples, survey = [], desurveyMethod, project } = useStore(); // survey, desurveyMethod: #2745; project: #3116
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [stat, setStat] = useState("max");
  const [threshold, setThreshold] = useState("");
  const [logChoice, setLogChoice] = useState(null); // null: the unit's default
  const [method, setMethod] = useState("idw");
  const [cell, setCell] = useState("");
  const [blank, setBlank] = useState("");
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(null); // the last run's numbers (TASKS.csv #4088)
  // TASKS.csv #2745 — each value where its interval lies down the desurveyed hole (an inclined hole's intercept is not under its collar), and a
  // threshold depth as vertical depth below the collar
  const [placeAtChoice, setPlaceAtChoice] = useState(null); // TASKS.csv #3826 — null: the intercept when the holes are fans, else the collar
  const [depthAs, setDepthAs] = useState("along");
  const sources = useMemo(() => (open ? holeValueSources({ assayElements, layers, customLayers, labelOf: (k) => LAYER_META[k]?.label || k, logValidRange: project?.logValidRange || null }) : []), [open, assayElements, layers, customLayers, project?.logValidRange]); // #3116
  const lead = useLeadCommodity();
  const leadSource = useMemo(() => { const assay = sources.filter((x) => x.kind === "assay"); const sym = preferredElement(assay.map((x) => x.symbol), null, lead); return assay.find((x) => x.symbol === sym) || null; }, [sources, lead]);
  const source = sources.find((s) => s.id === sourceId) || leadSource || sources[0] || null; // TASKS.csv #3353 (7)
  // TASKS.csv #2991 (WA iron review) — a coded log (a strand, a lithology): the chosen code(s), and thickness, depth or RL of their top / base
  const coded = source?.kind === "coded";
  const [codes, setCodes] = useState([]);
  const codesOn = coded ? (codes.filter((c) => source.codes.some((x) => x.code === c)).length ? codes.filter((c) => source.codes.some((x) => x.code === c)) : [source.codes[0].code]) : [];
  const CODED_STATS = ["thick", "top", "base", "topRL", "baseRL"];
  const st = coded ? (CODED_STATS.includes(stat) ? stat : "thick") : CODED_STATS.includes(stat) ? "max" : stat;
  const codedBase = st === "topRL" ? "top" : st === "baseRL" ? "base" : st;
  const codedRes = useMemo(() => (coded ? perHoleCoded(source.rows, codesOn, codedBase) : null), [coded, source, codesOn.join("\u0001"), codedBase]);
  const values = useMemo(() => (coded ? codedRes.values : source ? perHoleValue(holeValueRows(source, { assays, layers, customLayers }), source.symbol, st, { threshold }) : new Map()), [coded, codedRes, source, st, threshold, assays, layers, customLayers]);
  const rows = useMemo(() => (source && !coded ? holeValueRows(source, { assays, layers, customLayers }) : []), [source, coded, assays, layers, customLayers]);
  const isDepth = st === "firstOver" || st === "top" || st === "base";
  const vertical = isDepth && depthAs === "vertical";
  const rl = st === "topRL" || st === "baseRL";
  const spans = useMemo(() => (coded ? codedRes.spans : source ? perHoleSpan(rows, source.symbol, st, { threshold }) : new Map()), [coded, codedRes, rows, source, st, threshold]);
  const placedAt = (at) => holeSamplesAt(collars, values, spans, { key: KEY, survey, desurveyMethod, verticalDepth: vertical, at, rl });
  // TASKS.csv #3826 — both placements are worked out (the advice compares them); the grid uses the one chosen, or the intercept when the holes are fans
  const pCollar = useMemo(() => (open ? placedAt("collar") : null), [open, collars, values, spans, survey, desurveyMethod, vertical, rl]);
  const pIntercept = useMemo(() => (open ? placedAt("intercept") : null), [open, collars, values, spans, survey, desurveyMethod, vertical, rl]);
  const collarGrid = useMemo(() => (pCollar && pCollar.samples.length >= 3 ? suggestSampleGrid(samplePoints(pCollar.samples, KEY).points) : null), [pCollar]);
  const advice = useMemo(() => (pCollar && pIntercept ? placementAdvice(pCollar.samples, pIntercept.samples, Number(cell) > 0 ? Number(cell) : collarGrid?.cellM) : null), [pCollar, pIntercept, cell, collarGrid]);
  const placeAt = placeAtChoice || (advice?.intercept ? "intercept" : "collar");
  const placed = (placeAt === "intercept" ? pIntercept : pCollar) || { samples: [], atCollar: 0, noRl: 0 };
  const samples = placed.samples;
  const log = st === "firstOver" || coded ? false : logChoice ?? logByDefault(source?.unit);
  const suggestion = useMemo(() => (samples.length >= 3 ? suggestSampleGrid(samplePoints(samples, KEY).points) : null), [samples]);
  if (!collars.length) return null;
  const inp = { width: "100%", boxSizing: "border-box", fontSize: "var(--font-size-sm)", padding: "2px 4px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", color: "var(--color-text)" };
  const lbl = { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
  const run = () => {
    setMsg(null);
    if (st === "firstOver" && !Number.isFinite(Number(threshold === "" ? NaN : threshold))) { setMsg({ err: true, text: tr("Type the threshold the depth is measured to.") }); return; }
    const res = gridSamples(samples, KEY, { log, cellM: cell === "" ? suggestion?.cellM : Number(cell), blankM: blank === "" ? suggestion?.blankM : Number(blank), method });
    if (res.error === "few") { setMsg({ err: true, text: tr("Too few holes with a value to grid ({n}): at least 3 are needed.", { n: res.n }) }); return; }
    if (res.error === "mincurvCells") { setMsg({ err: true, text: tr("Minimum curvature takes grids up to {max} cells, and this one is {gridW}×{gridH}. Use a bigger cell size, or IDW.", { max: MINCURV_MAX_CELLS.toLocaleString(), gridW: res.nx, gridH: res.ny }) }); return; }
    if (res.error === "natneighWork") { setMsg({ err: true, text: tr("Natural neighbour at this cell size is far finer than the sample spacing ({gridW}×{gridH} cells): use a bigger cell size.", { gridW: res.nx, gridH: res.ny }) }); return; }
    if (res.error === "cells") { setMsg({ err: true, text: tr("That cell size would produce a {gridW}×{gridH} grid — too large. Use a bigger cell size.", { gridW: res.nx, gridH: res.ny }) }); return; }
    const { grid, bbox } = res;
    const { unit, what } = coded ? codedMeta(source.symbol, codesOn, st, vertical) : holeValueMeta(source, st, threshold, { verticalDepth: vertical }); // #2991
    const colour = rasterColourFields(grid.values, grid.nx, grid.ny, { palette: "viridis", stretch: log ? "log" : "p2-98", invert: false });
    const how = method === "mincurv" ? "min. curvature T0.25" : method === "natneigh" ? "nat. neighbour" : "IDW";
    const drape = defaultDrapeElevation({ collars, voxelModels, surfaceSamples, bbox });
    addRaster({
      name: `${what} per hole${unit ? ` (${source?.symbol ? gradeUnitLabel(source.symbol, unit) : unit})` : ""}${placeAt === "intercept" ? " at intercepts" : ""} ${how}${log ? " log10" : ""} ${res.cellM} m`, bbox, ...colour, elevation: drape.z, // at intercepts: #3350
      grid: { nx: grid.nx, ny: grid.ny, x0: grid.x0, yTop: grid.yTop, dx: grid.dx, dy: grid.dy, values: f32ToB64(grid.values), valid: res.valid },
      // source "holes": the figure draws the collars with their values, not surface samples (MapsPlanView)
      geochem: { symbol: source.symbol, unit, log, medium: null, samples: res.points, cellM: res.cellM, method, ...(method === "mincurv" ? { tension: 0.25 } : method === "natneigh" ? {} : { power: 2 }), blankM: res.blankM, source: "holes", placeAt, sourceId: source.id, stat: st, ...(st === "firstOver" ? { threshold: Number(threshold) } : {}), ...(coded ? { codes: codesOn } : {}), ...(vertical ? { verticalDepth: true } : {}) },
      provenance: { tool: `Per-hole value gridding (${what}, at the ${placeAt === "intercept" ? "intercepts, on the desurveyed holes" : "collars"}; ${method === "mincurv" ? "minimum curvature with tension" : method === "natneigh" ? "natural neighbour, discrete Sibson" : "inverse distance weighting"})` },
    });
    // TASKS.csv #4088 — the result in numbers, as the soil grid's (the long sentence is gone: its facts are rows, its explanations tooltips)
    const rowsOut = [
      { label: tr("Holes gridded"), value: res.points.toLocaleString(), title: coded && st === "thick" ? tr("A hole logged without the chosen code(s) counts as 0 m thick; a hole not logged in the layer has no value.") : undefined },
      { label: tr("Cell (m)"), value: res.cellM },
      { label: tr("Cells with a value"), value: `${res.valid.toLocaleString()} / ${(grid.nx * grid.ny).toLocaleString()}` },
      log && res.nonPositive ? { label: tr("Left out of the log10 grid"), value: res.nonPositive, level: "some", title: tr("Zero or negative values.") } : null,
      placeAt === "collar" && advice && advice.padHoles > 0 ? { label: tr("Holes sharing a collar point"), value: advice.padHoles.toLocaleString(), level: "some", title: tr("Their values are combined there, one cell for each pad.") } : null,
      placed.noRl ? { label: tr("Holes with no RL"), value: placed.noRl.toLocaleString(), level: "some", title: tr("No trace or collar elevation: left out.") } : null,
      collars.length > res.points ? { label: tr("Holes without a value"), value: (collars.length - res.points).toLocaleString(), level: "muted", title: tr("Not a zero.") } : null,
    ];
    setDone({ key: Date.now(), rows: rowsOut });
  };
  // TASKS.csv #4088 (side 4, Main's list) — the inline panel as steps like the soil grid's: What (the value, per hole), Where (placed at, depth), How (method, cell, blank), then
  // Grid to raster as the one gold primary and a Result in numbers; the explanations that crowded it are tooltips and the Help page.
  const whatStep = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={lbl}>{tr("Value")}<select value={source.id} onChange={(e) => { setSourceId(e.target.value); setLogChoice(null); }} aria-label={tr("Per-hole value source")} style={inp}>
        {sources.map((s) => <option key={s.id} value={s.id}>{s.unit ? `${s.label || s.symbol} (${s.unitLabel || gradeUnitLabel(s.symbol, s.unit)})` : s.label || s.symbol}</option>)}{/* label: #3116 — a log's range / despike said */}
      </select></label>
      {coded && <label style={lbl}>{tr("Code(s)")}<select multiple size={Math.min(5, source.codes.length)} value={codesOn} onChange={(e) => setCodes([...e.target.selectedOptions].map((o) => o.value))} aria-label={tr("Codes of the layer")} style={inp}>
        {source.codes.map((c) => <option key={c.code} value={c.code}>{`${c.code} (${c.n.toLocaleString()})`}</option>)}
      </select></label>}
      <label style={lbl}>{tr("Per hole")}<select value={st} onChange={(e) => setStat(e.target.value)} aria-label={tr("Per-hole statistic")} style={inp}>
        {coded ? <>{/* TASKS.csv #2991 */}
          <option value="thick">{tr("Thickness of the code(s)")}</option>
          <option value="top">{tr("Depth to their top (the cover)")}</option>
          <option value="base">{tr("Depth to their base")}</option>
          <option value="topRL">{tr("RL of their top")}</option>
          <option value="baseRL">{tr("RL of their base")}</option>
        </> : <>
          <option value="max">{tr("Highest value")}</option>
          <option value="mean">{tr("Length-weighted mean")}</option>
          <option value="firstOver">{tr("Depth of the first value over a threshold")}</option>
        </>}
      </select></label>
      {st === "firstOver" && <label style={lbl}>{tr("Threshold ({unit})", { unit: source.unit || tr("as logged") })}<NumberInput allowEmpty value={threshold} onChange={(v) => { setThreshold(v == null ? "" : String(v)); setMsg(null); }} aria-label={tr("Threshold")} style={inp} /></label>}
      {st === "firstOver" && threshold === "" && <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)" }}>{tr("Type the threshold.")}</div>}{/* TASKS.csv #3459 */}
    </div>
  );
  const whereStep = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={lbl}>{tr("Placed at")}<select value={placeAt} onChange={(e) => setPlaceAtChoice(e.target.value)} aria-label={tr("Where each hole's value is placed")} style={inp}>
        <option value="collar">{tr("The collar")}</option><option value="intercept">{tr("The intercept")}</option>
      </select></label>
      {isDepth && <label style={lbl}>{tr("Depth")}<select value={depthAs} onChange={(e) => setDepthAs(e.target.value)} aria-label={tr("How the depth is measured")} style={inp}>
        <option value="along">{tr("Down the hole")}</option><option value="vertical">{tr("Vertical")}</option>
      </select></label>}
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }} title={placeAt === "intercept" ? tr("Each is placed at the middle of its interval down the desurveyed hole.") : tr("Each is placed at its collar, not at the intercept.")}>{tr("{n} of {total} holes have a value.", { n: samples.length.toLocaleString(), total: collars.length.toLocaleString() })}{placeAt === "intercept" && placed.atCollar ? " " + tr("{m} have no trace and stay at the collar.", { m: placed.atCollar.toLocaleString() }) : ""}</div>
      {advice && advice.padHoles > 0 && <div role="note" style={{ fontSize: "var(--font-size-xs)", color: placeAt === "collar" && advice.apart > 0 ? "var(--color-warn-text)" : "var(--color-text-muted)" }}>{placeAt === "intercept" ? (placeAtChoice ? "" : tr("{n} of {total} holes share {k} collar points and their values part by over a cell, so they are placed at their intercepts.", { n: advice.padHoles.toLocaleString(), total: advice.holes.toLocaleString(), k: advice.pads.toLocaleString() })) : tr("{n} of {total} holes share {k} collar points: combined, one cell for each pad.", { n: advice.padHoles.toLocaleString(), total: advice.holes.toLocaleString(), k: advice.pads.toLocaleString() })}</div>}{/* TASKS.csv #3826 */}
    </div>
  );
  const howStep = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={lbl}>{tr("Method")}<select value={method} onChange={(e) => setMethod(e.target.value)} aria-label={tr("Gridding method")} style={inp}>
        <option value="idw">{tr("IDW")}</option><option value="mincurv">{tr("Minimum curvature")}</option><option value="natneigh">{tr("Natural neighbour")}</option>
      </select></label>
      <div style={{ display: "flex", gap: 5 }}>
        <label style={lbl}>{tr("Cell (m)")}<NumberInput allowEmpty min="1" value={cell} placeholder={suggestion ? String(suggestion.cellM) : ""} onChange={(v) => setCell(v == null ? "" : String(v))} style={inp} /></label>
        <label style={lbl}>{tr("Blank beyond (m)")}<NumberInput allowEmpty min="0" value={blank} placeholder={suggestion ? String(suggestion.blankM) : ""} onChange={(v) => setBlank(v == null ? "" : String(v))} style={inp} /></label>
      </div>
      {st !== "firstOver" && !coded && <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--font-size-xs)", cursor: "pointer" }}><input type="checkbox" checked={log} onChange={(e) => setLogChoice(e.target.checked)} />{tr("Interpolate log10 of the values")}</label>}
    </div>
  );
  return (
    <div>
      <button className="gs-btn gs-btn--block gs-btn--sm" style={{ marginBottom: 0 }} onClick={() => { setOpen((o) => !o); setMsg(null); }} aria-expanded={open}>{tr("Grid a per-hole value…")}</button>
      {open && !sources.length && <div style={{ fontSize: "var(--font-size-xs)", marginTop: 4 }}>{tr("No assays or numeric downhole logs.")}</div>}
      {open && source && (
        <div style={{ marginTop: 6, padding: 8, border: "1px solid var(--color-border)", borderRadius: 6 }}>
          <StepPane id="maps-hole-value" helpPage="import-assays" label={tr("Grid a per-hole value")}
            steps={[{ key: "what", label: tr("What"), body: whatStep }, { key: "where", label: tr("Where"), body: whereStep }, { key: "how", label: tr("How"), body: howStep }]}
            action={{ label: tr("Grid to raster"), onClick: run, disabled: samples.length < 3, attrs: { "data-grid-run": "" } }}
            message={msg ? { text: msg.text, level: msg.err ? "error" : "info" } : null}
            result={{ key: done?.key ?? null, body: done ? <StepNumbers rows={done.rows} /> : null }} />
        </div>
      )}
    </div>
  );
}
