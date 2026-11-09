// TASKS.csv #1875 — NESTED PITS: the pit shell at a series of revenue factors (the price scaled by 0.3 ... 1.2), every shell on one
// grid so they nest, each reported at the ENTERED price (#1609: a revenue-factor shell used to be valued at the scaled price),
// with a chart of tonnes and value against the factor; then a schedule: the shells mined in turn as pushbacks, top bench down,
// at a mining rate, each block's cash discounted from the time it is mined, giving an NPV per shell. A screen of how much the
// pit depends on price and on time, not a mine plan or a valuation. Maths in lib/pitShell.js runPitSeries; every number is the
// user's (#264: no price, rate or discount is assumed).
import React, { useMemo, useRef, useState } from "react";
import { Layers, Download, Eye, EyeOff } from "./icons.js";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { runPitSeriesAsync } from "../lib/pitSeriesClient.js";
import { gradeCandidate } from "../lib/gradeCandidate.js"; // #1848
import { categoricalModels } from "../lib/geologyForward.js";
import { PRICE_UNITS, pitMetalOf, elementOfModel } from "../lib/pitShell.js";
import { valueUnit } from "../lib/blockModelExport.js";
import { toExportCsv, crsCell } from "../lib/tabular.js";
import { saveFile } from "../lib/desktop.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";

const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", marginTop: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const warn = { ...note, color: "var(--color-warn-text-strong)", marginTop: 4 };
const num = { ...smallSel, width: 84 };
const big = (v) => new Intl.NumberFormat(undefined, { notation: "compact", maximumSignificantDigits: 3 }).format(v);
const G_PER_OZ = 31.1034768;
const SHELL_COLOURS = ["#6a994e", "#a7c957", "#f2cc8f", "#e07a5f", "#b5651d", "#9c6644", "#8338ec", "#3a86ff", "#ff006e", "#fb5607", "#ffbe0b", "#80ed99"];
let kept = null; // #1356 — the last series outlives the pane (this session)

// the factors from "0.3-1.2 step 0.1" or "0.5, 0.8, 1, 1.2"
export function parseFactors(text) {
  const t = String(text || "").trim();
  const m = /^(-?[\d.]+)\s*(?:-|to)\s*(-?[\d.]+)\s*(?:step|by|\/)\s*([\d.]+)$/i.exec(t);
  if (m) { const a = +m[1], b = +m[2], st = +m[3]; if (!(st > 0) || b < a) return []; const out = []; for (let v = a; v <= b + 1e-9; v += st) out.push(+v.toFixed(6)); return out; }
  return [...new Set(t.split(/[,\s;]+/).map(Number).filter((v) => Number.isFinite(v) && v > 0))].sort((a, b) => a - b); // unique, ascending: #1901
}
// the values a list dropped (zero, negative): said beside the count (#1901)
export function droppedFactors(text) {
  const t = String(text || "").trim();
  if (/^(-?[\d.]+)\s*(?:-|to)\s*(-?[\d.]+)\s*(?:step|by|\/)\s*([\d.]+)$/i.test(t)) return [];
  return t.split(/[,\s;]+/).filter((x) => x !== "").map(Number).filter((v) => Number.isFinite(v) && !(v > 0));
}

// surfaces: the generated surfaces (the last pit shell's inputs are the defaults); onAdd / onToggle / onRemove as the pit pane's
export default function NestedPitsPane({ surfaces = [], onAdd, onToggle, onRemove, onClose }) {
  const { voxelModels = [], terrain, collars = [], project } = useStore();
  const models = useMemo(() => { const cat = new Set(categoricalModels(voxelModels)); return voxelModels.filter((m) => gradeCandidate(m, (x) => cat.has(x))); }, [voxelModels]);
  // TASKS.csv #1971 — the shell whose inputs the series takes: picked, the latest by default (a shell of a series is not an inputs' source)
  const pitChoices = useMemo(() => surfaces.filter((s) => s.type === "pit_shell" && s.params?.inputs && !s.params?.seriesId), [surfaces]);
  const [pitId, setPitId] = useState(() => kept?.pitId ?? null);
  const lastPit = useMemo(() => pitChoices.find((s) => s.id === pitId) || pitChoices[pitChoices.length - 1] || null, [pitChoices, pitId]);
  const inputs = lastPit?.params?.inputs || null;
  const model = useMemo(() => (inputs ? models.find((m) => (m.id ?? m.name) === inputs.modelId) || models.find((m) => m.name === lastPit?.params?.blockModel) || null : null), [inputs, models, lastPit]);
  const [f, setF] = useState(() => ({ factors: kept?.factorsText || "0.3-1.2 step 0.1", rate: kept?.rateText || "", discount: kept?.discountText || "" }));
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [res, setRes] = useState(() => (kept && kept.pitId === lastPit?.id ? kept : null));
  const job = useRef(null);
  const factors = useMemo(() => parseFactors(f.factors), [f.factors]);
  const unit = inputs ? (model && valueUnit(model)) || inputs.unit || lastPit?.params?.gradeUnit || "" : "";
  const element = elementOfModel(model);
  const metal = unit ? pitMetalOf(unit, element) : null;
  const priceLabel = metal && inputs ? (PRICE_UNITS[metal.unit].find(([k]) => k === inputs.priceUnit) || [])[1] || "" : "";
  // TASKS.csv #1917 — the shell's by-product model, for the series; gone from the project: the series cannot run as the shell did
  const byModel = inputs?.by ? models.find((m) => (m.id ?? m.name) === inputs.by.modelId) || models.find((m) => m.name === lastPit?.params?.byProduct?.blockModel) || null : null;
  const byMissing = !!inputs?.by && !byModel, byEl = inputs?.by?.element || byModel?.name || "";
  const byPriceLabel = inputs?.by ? (PRICE_UNITS[pitMetalOf(inputs.by.unit, inputs.by.element)?.unit || "g"].find(([k]) => k === inputs.by.priceUnit) || [])[1] || "" : "";
  const rate = Number(f.rate) > 0 ? Number(f.rate) : null, discount = f.discount === "" ? null : Number(f.discount);
  const shells = useMemo(() => surfaces.filter((s) => s.type === "pit_shell" && s.params?.seriesId), [surfaces]);

  const run = async () => {
    if (!inputs || !model || !factors.length || byMissing) return;
    setBusy({ idx: 0, of: factors.length }); setMsg(null);
    const t0 = performance.now();
    try {
      job.current = runPitSeriesAsync(model, { ...inputs, unit, element }, factors, { rate, discountPct: Number.isFinite(discount) ? discount : null, terrain, collars, byModel /* #1917 */, onProgress: (p) => setBusy(p) });
      const r = await job.current.promise;
      if (r.cancelled) { setMsg(tr("Cancelled: nothing was added.")); return; }
      if (r.failed === "underground") { setMsg(tr("The collars look like underground drill positions ({upward} hole(s) drilled upward, {stacked} pair(s) of collars stacked over each other): no ground surface is known, so no pit is cut from them. Load a terrain (Maps > Terrain) for the real surface.", { upward: r.underground?.upward ?? 0, stacked: r.underground?.stacked ?? 0 })); return; } // #2276
      if (r.failed || r.empty) { setMsg(r.empty ? tr("At these inputs no block pays for the rock over it at the largest factor, so there is no pit.") : tr("The series failed: {v}", { v: r.failed })); return; }
      const seconds = Math.round((performance.now() - t0) / 100) / 10;
      if (kept?.seriesId && onRemove) surfaces.filter((s) => s.params?.seriesId === kept.seriesId).forEach((s) => onRemove(s.id)); // #1931 — the earlier series' shells go
      kept = { ...r, seconds, pitId: lastPit.id, factorsText: f.factors, rateText: f.rate, discountText: f.discount, unit, priceLabel, price: inputs.price, seriesId: `series_${Date.now()}`, shown: {} };
      setRes(kept);
    } catch (e) { setMsg(tr("The series failed: {v}", { v: e.message || e })); }
    finally { setBusy(null); job.current = null; }
  };
  const cancel = () => job.current?.cancel();
  // a shell into the view (once), or its surface shown / hidden
  const showShell = (i) => {
    const r = res.runs[i];
    if (!r.positions) return;
    const existing = shells.find((s) => s.params?.seriesId === res.seriesId && s.params?.revenueFactor === r.rf);
    if (existing) { onToggle?.(existing.id); return; }
    onAdd?.({
      name: tr("Pit shell: {model} at {price} {unit} x{rf}, {slope}°{sec}", { model: model?.name || lastPit.params.blockModel, price: res.price, unit: res.priceLabel, rf: r.rf, slope: inputs.slopeDeg, sec: inputs.sectorSlopes ? tr(" (by sector)") : "" }), // sec: #1897
      positions: r.positions, indices: r.indices, type: "pit_shell", closure: null, color: SHELL_COLOURS[i % SHELL_COLOURS.length], tag: "pit",
      tip: tr("Conceptual pit shell at revenue factor {rf}: not a mine plan, a Reserve or a Resource", { rf: r.rf }),
      params: { tool: "conceptual pit shell (maximum closure, exact), nested series", inputs: { ...inputs, revenueFactor: r.rf, unit: valueUnit(model) ? "" : unit }, blockModel: model?.name, gradeUnit: unit, revenueFactor: r.rf, seriesId: res.seriesId,
        oreTonnes: Math.round(r.oreT), wasteTonnes: Math.round(r.wasteT), stripRatio: r.stripRatio == null ? null : +r.stripRatio.toFixed(2), meanGrade: r.meanGrade == null ? null : +r.meanGrade.toPrecision(4), containedMetal: Math.round(r.metalU * res.metalFactor), containedMetalUnit: res.metalUnit,
        cutoffGrade: +res.cutoffBase.toPrecision(3), undiscountedMargin: Math.round(r.moneyBase), valuedAt: "the entered price",
        ...(inputs.by && res.byMetalUnit ? { byProduct: { blockModel: lastPit.params?.byProduct?.blockModel || byModel?.name || null, element: byEl, gradeUnit: inputs.by.unit, price: inputs.by.price, priceUnit: inputs.by.priceUnit, recovery: inputs.by.recovery, meanGrade: r.meanGrade2 == null ? null : +r.meanGrade2.toPrecision(4), containedMetal: Math.round((r.metalU2 || 0) * res.byMetalFactor), containedMetalUnit: res.byMetalUnit }, cutoffBasis: lastPit.params?.cutoffBasis || null } : {}), /* #1917 */ npv: r.npv == null ? null : Math.round(r.npv), yearsToMine: r.years == null ? null : +r.years.toFixed(1), miningRateTpa: res.rate, discountPct: res.discountPct, maxDepthM: Math.round(r.maxDepth), gridCellM: res.cell.map((v) => +v.toFixed(1)), groundFrom: res.groundSource, reachesModelBase: r.touchesBase,
        caution: "conceptual: one of a nested series, valued at the entered price; the schedule mines the shells as pushbacks at one rate with no stockpiles, ramps, dilution, capital or closure; not a Mineral Reserve or Resource", generatedAt: new Date().toISOString() },
    });
  };
  const shownState = (i) => { const r = res.runs[i]; const s = shells.find((x) => x.params?.seriesId === res.seriesId && x.params?.revenueFactor === r.rf); return s ? (s.visible ? "on" : "off") : null; };
  const metalText = (r) => { const m = r.metalU * res.metalFactor; return res.metalUnit === "g" ? `${big(m / G_PER_OZ)} oz` : `${big(m)} t`; };
  const byMetalText = (r) => { const m = (r.metalU2 || 0) * res.byMetalFactor; return res.byMetalUnit === "g" ? `${big(m / G_PER_OZ)} oz` : `${big(m)} t`; }; // #1917
  const exportCsv = () => saveFile({ suggestedName: "nested_pits.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv([
    ...res.runs.map((r) => ({ section: "shell", revenue_factor: r.rf, price: res.price, price_unit: res.priceLabel, ore_t: Math.round(r.oreT), [`mean_grade_${res.unit.replace("%", "pct")}`]: r.meanGrade == null ? "" : +r.meanGrade.toPrecision(4), contained_metal: Math.round(r.metalU * res.metalFactor), metal_unit: res.metalUnit, waste_t: Math.round(r.wasteT), strip_ratio: r.stripRatio == null ? "" : +r.stripRatio.toFixed(2), max_depth_m: Math.round(r.maxDepth), undiscounted_margin_at_entered_price: Math.round(r.moneyBase), years_to_mine: r.years == null ? "" : +r.years.toFixed(2), npv: r.npv == null ? "" : Math.round(r.npv), ...(inputs?.by && res.byMetalUnit ? { by_product: byEl, by_product_mean_grade: r.meanGrade2 == null ? "" : +r.meanGrade2.toPrecision(4), by_product_contained_metal: Math.round((r.metalU2 || 0) * res.byMetalFactor), by_product_metal_unit: res.byMetalUnit } : {}) /* #1917 */, crs: crsCell(project) })),
    ...res.yearly.map((y) => ({ section: "year", year: y.year, rock_t: Math.round(y.rockT), ore_t: Math.round(y.oreT), cash_undiscounted: Math.round(y.cash) })),
  ]) });
  const line = (label, v) => <div style={row}><span>{label}</span><b>{v}</b></div>;

  return (
    <div>
      <TaskPaneHeader title="Nested pits" icon={Layers} tone="model" onClose={onClose} />
      <div style={note}>{tr("The pit shell at a series of revenue factors (the price scaled), all on one grid so they nest, each reported at the entered price. With a mining rate and a discount rate the shells are mined in turn as pushbacks, top bench down, and each gets a net present value. It is a screen of how much the pit depends on price and time, not a mine plan or a valuation.")}</div>
      {!lastPit && <div style={warn}>{tr("It needs a pit shell: run Pit shell first. Its price, costs, density and slope are the series' inputs.")}</div>}
      {pitChoices.length > 1 && (
        <label style={row}>{tr("Pit shell")}<select value={lastPit?.id || ""} onChange={(e) => { const id = e.target.value; setPitId(id); setRes(kept && kept.pitId === id ? kept : null); setMsg(null); }} disabled={!!busy} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Pit shell whose inputs the series takes")}>
          {pitChoices.map((s) => <option key={s.id} value={s.id}>{String(s.name).replace(/^Pit shell: /, "")}</option>)}
        </select></label>
      )}
      {lastPit && !model && <div style={warn}>{tr("The block model the shell was run on (\"{m}\") is not in the project any more.", { m: lastPit.params?.blockModel || "?" })}</div>}
      {lastPit && model && (<>
        <div style={{ ...note, marginTop: 4 }}>{tr("From \"{pit}\": {price} {unit}, recovery {rec} %, mining ${mc}/t, processing ${pc}/t, density {d}, slope {s}°{sec}.", { pit: String(lastPit.name).replace(/^Pit shell: /, ""), price: inputs.price, unit: priceLabel, rec: inputs.recovery, mc: inputs.miningCost, pc: inputs.processingCost, d: inputs.density, s: inputs.slopeDeg, sec: inputs.sectorSlopes ? tr(" (by sector)") : "" })}</div>{/* sec: #1897 */}
        {inputs.by && !byMissing && <div style={note}>{tr("By-product: {el} at {price} {unit}, recovery {rec} %.", { el: byEl, price: inputs.by.price, unit: byPriceLabel, rec: inputs.by.recovery })}</div>}{/* #1917 */}
        {byMissing && <div style={warn}>{tr("The by-product model the shell was run with (\"{m}\") is not in the project any more.", { m: lastPit.params?.byProduct?.blockModel || "?" })}</div>}
        <label style={row}>{tr("Revenue factors")}<input value={f.factors} onChange={(e) => setF((p) => ({ ...p, factors: e.target.value }))} style={{ ...smallSel, width: 130 }} aria-label={tr("Revenue factors of the series")} title={tr("A range with a step, or a list: 0.3-1.2 step 0.1, or 0.5, 0.8, 1, 1.2")} /></label>
        <div style={note}>{factors.length ? tr("{n} factor(s): {list}", { n: factors.length, list: factors.join(", ") }) : tr("Enter a range with a step, or a list of factors.")}{droppedFactors(f.factors).length > 0 && <> {tr("Ignored: {list} (a factor must be above 0).", { list: droppedFactors(f.factors).join(", ") })}</>}</div>
        <label style={row}>{tr("Mining rate (t rock / year)")}<input type="number" min={0} step="any" value={f.rate} onChange={(e) => setF((p) => ({ ...p, rate: e.target.value }))} style={num} aria-label={tr("Mining rate")} placeholder={tr("optional")} /></label>
        <label style={row}>{tr("Discount rate (% / year)")}<input type="number" min={0} step="any" value={f.discount} onChange={(e) => setF((p) => ({ ...p, discount: e.target.value }))} style={num} aria-label={tr("Discount rate")} placeholder={tr("optional")} disabled={!rate} /></label>
        {busy == null
          ? <button onClick={run} disabled={!factors.length || byMissing} style={{ ...pBtn, marginTop: 8, opacity: factors.length && !byMissing ? 1 : 0.5 }}><Layers size={14} /> {tr("Run the series")}</button>
          : <button onClick={cancel} style={{ ...pBtn, marginTop: 8 }}>{tr("Solving shell {i} of {n}: cancel", { i: (busy.idx || 0) + 1, n: busy.of || factors.length })}</button>}
      </>)}
      {msg && <div style={warn}>{msg}</div>}
      {res && (
        <div style={{ marginTop: 8 }}>
          <Chart runs={res.runs} best={res.bestNpv} />
          <div style={{ marginTop: 6, maxHeight: 260, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 4 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--font-size-xs)" }}>
              <thead><tr style={{ position: "sticky", top: 0, background: "var(--color-bg)" }}>{["RF", tr("Ore t"), tr("Grade"), tr("Strip"), tr("Margin"), ...(res.rate ? [tr("Years"), ...(res.discountPct != null ? [tr("NPV")] : [])] : []), ""].map((h, i) => <th key={i} style={{ textAlign: "right", padding: "2px 4px", borderBottom: "1px solid var(--color-border)", fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>{res.runs.map((r, i) => (
                <tr key={r.rf} style={{ background: i === res.bestNpv ? "var(--color-selected-bg)" : undefined }}>
                  <td style={cellStyle}>{r.rf}</td><td style={cellStyle}>{r.blocks ? big(r.oreT) : "—"}</td><td style={cellStyle}>{r.meanGrade == null ? "—" : Number(r.meanGrade.toPrecision(3))}</td><td style={cellStyle}>{r.stripRatio == null ? "—" : r.stripRatio.toFixed(2)}</td><td style={cellStyle}>{r.blocks ? `$${big(r.moneyBase)}` : "—"}</td>
                  {res.rate && <td style={cellStyle}>{r.blocks ? r.years.toFixed(1) : "—"}</td>}
                  {res.rate && res.discountPct != null && <td style={cellStyle}>{r.blocks ? `$${big(r.npv)}` : "—"}</td>}
                  <td style={{ ...cellStyle, padding: 0 }}>{r.positions && <button onClick={() => showShell(i)} style={iconBtnStyle} aria-label={shownState(i) === "on" ? tr("Hide the shell at {rf}", { rf: r.rf }) : tr("Show the shell at {rf}", { rf: r.rf })} title={shownState(i) === "on" ? tr("Hide") : tr("Show in the 3D view")}>{shownState(i) === "on" ? <Eye size={12} /> : <EyeOff size={12} />}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ ...note, marginTop: 4 }}>{tr("Grade in {unit}; margin and NPV at the entered price, {price} {pu}. The eye puts a shell in the view (its colour follows the row).", { unit: res.unit, price: res.price, pu: res.priceLabel })}</div>
          {res.bestNpv >= 0 && line(tr("Best NPV"), tr("factor {rf}: ${npv} over {y} years", { rf: res.runs[res.bestNpv].rf, npv: big(res.runs[res.bestNpv].npv), y: res.runs[res.bestNpv].years.toFixed(1) }))}
          {res.bestMoney >= 0 && line(tr("Largest undiscounted margin"), tr("factor {rf}: ${v}", { rf: res.runs[res.bestMoney].rf, v: big(res.runs[res.bestMoney].moneyBase) }))}
          {res.bestMoney >= 0 && line(tr("Contained metal at it"), metalText(res.runs[res.bestMoney]))}
          {res.bestMoney >= 0 && inputs?.by && res.byMetalUnit && line(tr("Contained {el} at it", { el: byEl }), byMetalText(res.runs[res.bestMoney]))}{/* #1917 */}
          {line(tr("Grid cell"), `${res.cell.map((v) => Math.round(v * 10) / 10).join(" × ")} m`)}
          {(() => { // TASKS.csv #2108 (review #2013, Woodjam) — the series' one grid is sized for its largest factor; when it is not the shell's, factor 1 differs from it
            const sc = lastPit?.params?.gridCellM, rc = res.cell.map((v) => +v.toFixed(1));
            if (!Array.isArray(sc) || sc.length !== 3 || sc.every((v, i) => Math.abs(v - rc[i]) <= 0.05 * Math.max(1, v))) return null;
            const one = res.runs.find((r) => r.rf === 1), shellOre = lastPit.params?.oreTonnes;
            return <div style={warn}>{one && Number.isFinite(shellOre)
              ? tr("The series runs on one grid sized for its largest factor ({c} m; the shell's was {s} m), so its factor-1 row ({a} t of ore) differs from the shell it was run from ({b} t).", { c: rc.join(" × "), s: sc.join(" × "), a: big(one.oreT), b: big(shellOre) })
              : tr("The series runs on one grid sized for its largest factor ({c} m; the shell's was {s} m), so its shells are not on the shell's own grid.", { c: rc.join(" × "), s: sc.join(" × ") })}</div>;
          })()}
          {line(tr("Solved in"), `${res.seconds} s`)}
          {res.groundSource === "collars" && <div style={note}>{tr("The ground is interpolated between the collars, not a terrain.")}</div>}
          {res.groundSource === "model top" && <div style={note}>{tr("The ground is the top of the block model's columns, interpolated between them, not a terrain.")}</div>}{/* #1850 */}
          {res.coarsened && <div style={warn}>{tr("The grid was made coarser to stay within the limit, so the walls are coarser than the block model.")}</div>}
          {res.runs.some((r) => r.touchesBase) && <div style={warn}>{tr("A shell reaches the bottom of the block model: it may go deeper if the body does.")}</div>}
          <button onClick={exportCsv} style={{ ...pBtn, marginTop: 6 }}><Download size={13} /> {tr("Shells and years CSV")}</button>
          <div style={{ ...note, marginTop: 4 }}>{tr("Conceptual, from your inputs and this block model: the schedule has no stockpiles, ramps, dilution, capital or closure, and each shell is mined whole before the next. Not a Mineral Reserve, a Resource or a value of the project.")}</div>
        </div>
      )}
    </div>
  );
}

// tonnes (bars) and margin / NPV (lines) against the revenue factor
function Chart({ runs, best }) {
  const W = 240, H = 120, L = 34, R = 34, T = 8, B = 18, n = runs.length;
  if (!n) return null;
  const x = (i) => L + ((i + 0.5) / n) * (W - L - R), bw = Math.max(2, ((W - L - R) / n) * 0.6);
  const tMax = Math.max(1, ...runs.map((r) => r.rockT)), vs = runs.flatMap((r) => [r.moneyBase, r.npv ?? r.moneyBase]), vMin = Math.min(0, ...vs), vMax = Math.max(1, ...vs);
  const yT = (v) => T + (1 - v / tMax) * (H - T - B), yV = (v) => T + (1 - (v - vMin) / (vMax - vMin)) * (H - T - B);
  const path = (key) => runs.map((r, i) => (r[key] == null ? null : `${x(i).toFixed(1)},${yV(r[key]).toFixed(1)}`)).filter(Boolean).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", direction: "ltr" }} role="img" aria-label={tr("Rock tonnes, margin and NPV against the revenue factor")}>
      {runs.map((r, i) => <rect key={i} x={x(i) - bw / 2} y={yT(r.rockT)} width={bw} height={yT(0) - yT(r.rockT)} fill={i === best ? "var(--color-accent)" : "var(--color-border)"} />)}
      <polyline points={path("moneyBase")} fill="none" stroke="#e8590c" strokeWidth="1.5" />
      {runs.some((r) => r.npv != null) && <polyline points={path("npv")} fill="none" stroke="#1971c2" strokeWidth="1.5" strokeDasharray="4 2" />}
      {runs.map((r, i) => <text key={i} x={x(i)} y={H - 5} fontSize="7" textAnchor="middle" fill="var(--color-text-muted)">{r.rf}</text>)}
      <text x={2} y={T + 8} fontSize="7" fill="var(--color-text-muted)">{big(tMax)} t</text>
      <text x={W - 2} y={T + 8} fontSize="7" textAnchor="end" fill="#e8590c">${big(vMax)}</text>
      <text x={W - 2} y={H - B} fontSize="7" textAnchor="end" fill="#e8590c">${big(vMin)}</text>
      <text x={L} y={H - 5} fontSize="7" fill="var(--color-text-muted)" textAnchor="end">RF</text>
    </svg>
  );
}
const cellStyle = { textAlign: "right", padding: "2px 4px", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap" };
const iconBtnStyle = { display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 18, padding: 0, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" };
