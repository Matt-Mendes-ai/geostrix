// TASKS.csv #1341 — the Mine Design tab's pit shell: a block model and your own economics in, the pit that makes the most
// undiscounted money out, as a surface in the 3D view with what it holds. Every number is the user's: no default price, cost or
// density (a default would read as a fact, as #264). Maths in lib/pitShell.js; framing from #836.
import React, { useMemo, useRef, useState } from "react";
import { Pickaxe } from "./icons.js";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { PRICE_UNITS, pitEconomics } from "../lib/pitShell.js";
import { metalOf, sgSummary } from "../lib/gradeTonnage.js";
import { valueUnit } from "../lib/blockModelExport.js";
import { categoricalModels } from "../lib/geologyForward.js";
import { runPitShellAsync } from "../lib/pitShellClient.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";

const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", marginTop: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const warn = { ...note, color: "var(--color-warn-text-strong)", marginTop: 4 };
const num = { ...smallSel, width: 84 };
const big = (v) => new Intl.NumberFormat(undefined, { notation: "compact", maximumSignificantDigits: 3 }).format(v);
const G_PER_OZ = 31.1034768;
const GRADE_UNITS = ["g/t", "ppm", "ppb", "%"];
const EMPTY = { price: "", priceUnit: "", recovery: "", miningCost: "", processingCost: "", density: "", slopeDeg: "", revenueFactor: "1", size: "", unit: "" };
const FIELDS = ["price", "recovery", "miningCost", "processingCost", "density", "slopeDeg"];
let kept = null; // #1356 — the last result, shown again when the pane or the tab comes back (this session)

// surfaces: the project's generated surfaces (the last pit's inputs come back from its saved parameters).
// onAdd({ name, positions, indices, params, tip, type, closure, color, tag }) puts the pit in the 3D view; onToggle(id) shows/hides a surface.
export default function PitShellPane({ surfaces = [], onAdd, onToggle, onClose }) {
  const { voxelModels = [], terrain, layers, collars = [] } = useStore();
  // a grade: a unit that counts metal first, then none stated (an import may simply not say); never a resistivity, a variance, an inversion or a category
  const models = useMemo(() => {
    const cat = new Set(categoricalModels(voxelModels));
    return voxelModels.filter((m) => m.cells?.length && !cat.has(m) && !m.method && !/^(support-index|kriging-variance|geoml|simpeg)/.test(String(m.source || "")) && (valueUnit(m) ? metalOf(valueUnit(m)) : !/ztem|conductiv|resistiv|chargeab|suscept|magnet|inversion/i.test(`${m.name} ${m.property || ""}`)))
      .sort((a, c) => (valueUnit(c) ? 1 : 0) - (valueUnit(a) ? 1 : 0));
  }, [voxelModels]);
  const last = useMemo(() => [...surfaces].reverse().find((s) => s.type === "pit_shell")?.params?.inputs || null, [surfaces]);
  const [modelId, setModelId] = useState(() => (models.find((m) => (m.id ?? m.name) === last?.modelId) ? last.modelId : models[0]?.id ?? models[0]?.name ?? ""));
  const [f, setF] = useState(() => ({ ...EMPTY, ...(last || {}) }));
  const [busy, setBusy] = useState(null);
  const [res, setRes] = useState(() => (kept && models.some((m) => m.name === kept.model) ? kept : null));
  const [hideEarlier, setHideEarlier] = useState(true);
  const [msg, setMsg] = useState(null);
  const job = useRef(null);
  const model = models.find((m) => (m.id ?? m.name) === modelId) || null;
  const stated = model ? valueUnit(model) : null, unit = stated || f.unit;
  const metal = unit ? metalOf(unit) : null;
  const prices = metal ? PRICE_UNITS[metal.unit] : null, priceUnit = prices?.some(([k]) => k === f.priceUnit) ? f.priceUnit : prices?.[0][0];
  const sg = useMemo(() => sgSummary(layers?.sg), [layers?.sg]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  // #1355 — a price belongs to the unit it was typed in: switching from a % model ($/lb) to a ppm one ($/oz) blanks it, never re-reads it
  const priceStale = f.price !== "" && !!f.priceUnit && !!prices && !prices.some(([k]) => k === f.priceUnit);
  const setPrice = (e) => setF((p) => ({ ...p, price: e.target.value, priceUnit }));
  const value = (k) => (k === "price" && priceStale ? NaN : Number(f[k]));
  const missing = !model || !metal || FIELDS.some((k) => !(value(k) > 0)) || value("slopeDeg") >= 90 || value("recovery") > 100 || !(Number(f.revenueFactor) > 0); // revenue factor: #1363
  const cutoff = !missing ? pitEconomics({ unit, price: value("price"), priceUnit, recovery: value("recovery"), processingCost: value("processingCost"), revenueFactor: Number(f.revenueFactor) || 1 })?.cutoff : null;

  const run = async () => {
    const rf = Number(f.revenueFactor) > 0 ? Number(f.revenueFactor) : 1, size = Number(f.size) > 0 ? Number(f.size) : null;
    const inputs = { unit, price: value("price"), priceUnit, recovery: value("recovery"), miningCost: value("miningCost"), processingCost: value("processingCost"), density: value("density"), slopeDeg: value("slopeDeg"), revenueFactor: rf, size };
    setBusy(0); setMsg(null); // the previous result stays until a new one arrives (#1366)
    const t0 = performance.now();
    try {
      job.current = runPitShellAsync(model, inputs, terrain, (phases) => setBusy(phases), collars); // collars: the ground when there is no terrain (#1353)
      const r = await job.current.promise;
      if (r.cancelled) { setMsg(tr("Cancelled: nothing was added.")); return; }
      setRes(null); kept = null;
      if (r.failed || r.empty) { setMsg(r.empty ? tr("At these inputs no block pays for the rock over it, so there is no pit. Cut-off grade {c} {unit}.", { c: Number(r.cutoff.toPrecision(3)), unit }) : tr("The block model has no blocks with values.")); return; }
      const seconds = Math.round((performance.now() - t0) / 100) / 10, rfText = rf !== 1 ? ` x${rf}` : "";
      const support = model.cells.some((c) => Number.isFinite(c.nHoles)); // #1354 — the estimate says how many holes informed each block
      kept = { ...r, unit, seconds, hasTerrain: !!terrain, model: model.name, slopeDeg: inputs.slopeDeg, support };
      setRes(kept);
      const contained = r.metalU * r.metalFactor;
      if (hideEarlier) surfaces.filter((s) => s.type === "pit_shell" && s.visible).forEach((s) => onToggle?.(s.id)); // #1356 — one pit on view at a time
      const priceLabel = (prices.find(([k]) => k === priceUnit) || [])[1] || "";
      onAdd({
        // #1356 — named by what usually changes between runs, so a list of pits can be told apart
        name: tr("Pit shell: {model} at {price} {unit}, {slope}°{rf}", { model: model.name, price: inputs.price, unit: priceLabel, slope: inputs.slopeDeg, rf: rfText }), positions: r.positions, indices: r.indices, type: "pit_shell", closure: null, color: "#b5651d", tag: "pit",
        tip: tr("Conceptual pit shell: not a mine plan, a Reserve or a Resource"),
        params: { tool: "conceptual pit shell (maximum closure, exact)", inputs: { ...inputs, priceUnit, modelId, unit: stated ? "" : unit }, blockModel: model.name, gradeUnit: unit, oreTonnes: Math.round(r.oreT), wasteTonnes: Math.round(r.wasteT), stripRatio: r.stripRatio == null ? null : +r.stripRatio.toFixed(2), meanGrade: r.meanGrade == null ? null : +r.meanGrade.toPrecision(4), containedMetal: Math.round(contained), containedMetalUnit: r.metalUnit, cutoffGrade: +r.cutoff.toPrecision(3), undiscountedMargin: Math.round(r.money), maxDepthM: Math.round(r.maxDepth), wallAnglesDeg: [+r.walls.flattest.toFixed(1), +r.walls.steepest.toFixed(1)], gridCellM: r.cell.map((v) => +v.toFixed(1)), rockOutsideBlockModelShare: +r.barrenShare.toFixed(3), noTerrainShare: +r.topAssumed.toFixed(3), groundFrom: r.groundSource, ...(support ? { oreSingleHoleShare: +r.oreSingleHoleShare.toFixed(3), oreExtrapolatedShare: +r.oreExtrapolatedShare.toFixed(3) } : {}), reachesModelBase: r.touchesBase, caution: "conceptual: undiscounted, no ramps, berms, dilution or scheduling; not a Mineral Reserve or Resource", generatedAt: new Date().toISOString() },
      });
    } catch (e) {
      setMsg(tr("The pit run failed: {v}", { v: e.message || e }));
    } finally {
      setBusy(null); job.current = null;
    }
  };
  const cancel = () => job.current?.cancel();
  const metalText = (r) => { const m = r.metalU * r.metalFactor; return r.metalUnit === "g" ? `${big(m / G_PER_OZ)} oz` : `${big(m)} t`; };
  const line = (label, v) => <div style={row}><span>{label}</span><b>{v}</b></div>;
  const field = (k, label, extra = {}) => <label style={row}>{label}<input type="number" min={0} step="any" value={f[k]} onChange={set(k)} style={num} {...extra} /></label>;

  return (
    <div>
      <TaskPaneHeader title="Pit shell" icon={Pickaxe} tone="model" onClose={onClose} />
      <div style={note}>{tr("The pit that makes the most money at your prices and costs, solved exactly. It answers whether a body sits shallow enough for a pit. It has no discounting, ramps, berms or dilution, so it is not a mine plan, a Reserve or a Resource.")}</div>
      {!models.length && <div style={warn}>{tr("It needs a block model of grades. Estimate one (3D Modelling > Estimation) or import one.")}</div>}
      {models.length > 0 && (<>
        <label style={row}>{tr("Block model")}<select value={modelId} onChange={(e) => setModelId(e.target.value)} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Block model of the pit")}>
          {models.map((m) => <option key={m.id ?? m.name} value={m.id ?? m.name}>{m.name}</option>)}
        </select></label>
        {model && !stated && <label style={row}>{tr("Its grades are in")}<select value={f.unit} onChange={set("unit")} style={num} aria-label={tr("Grade unit of the block model")}><option value="">{tr("— choose —")}</option>{GRADE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>}
        <label style={row}>{tr("Metal price")}<span style={{ display: "flex", gap: 4 }}><input type="number" min={0} step="any" value={priceStale ? "" : f.price} onChange={setPrice} style={num} aria-label={tr("Metal price")} />
          <select value={priceUnit || ""} onChange={set("priceUnit")} disabled={!prices} style={{ ...smallSel, width: 62 }} aria-label={tr("Price unit")}>{(prices || []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></span></label>
        {priceStale && <div style={warn}>{tr("The price was entered for another metal unit: enter it again for this block model.")}</div>}
        {field("recovery", tr("Metallurgical recovery (%)"))}
        {field("miningCost", tr("Mining cost ($/t rock)"))}
        {field("processingCost", tr("Processing cost ($/t ore)"))}
        {field("density", tr("Density (t/m³)"))}
        {sg && !f.density && <div style={{ ...note, marginTop: 2 }}><button onClick={() => setF((p) => ({ ...p, density: String(sg.mean) }))} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 6px" }}>{tr("Use the logged mean, {v}", { v: sg.mean })}</button></div>}
        {field("slopeDeg", tr("Overall slope (°)"))}
        {field("revenueFactor", tr("Revenue factor"), { title: tr("Multiplies the price: below 1 gives a smaller pit, a quick test of how much it depends on price.") })}
        {field("size", tr("Pit block size (m)"), { placeholder: tr("auto"), title: tr("Blank: the block model's own size. A larger size runs faster and draws coarser walls; a block keeps its own ore or waste decision either way.") })}
        {cutoff != null && <div style={{ ...note, marginTop: 4 }}>{tr("Cut-off grade at these inputs: {c} {unit}.", { c: Number(cutoff.toPrecision(3)), unit })}</div>}
        {!terrain && <div style={warn}>{collars.some((c) => Number.isFinite(c.z))
          ? tr("No terrain is loaded, so the ground is interpolated between the {n} collar elevations. Load a terrain in Maps for the real surface.", { n: collars.filter((c) => Number.isFinite(c.z)).length })
          : tr("No terrain is loaded, so the top of the block model is taken as the ground and no overburden above it is costed. Load one in Maps.")}</div>}
        {surfaces.some((s) => s.type === "pit_shell" && s.visible) && <label style={{ ...row, justifyContent: "flex-start" }}><input type="checkbox" checked={hideEarlier} onChange={(e) => setHideEarlier(e.target.checked)} />{tr("Hide the earlier pits")}</label>}
        {busy == null
          ? <button onClick={run} disabled={missing} style={{ ...pBtn, marginTop: 8, opacity: missing ? 0.5 : 1 }}><Pickaxe size={14} /> {tr("Run the pit shell")}</button>
          : <button onClick={cancel} style={{ ...pBtn, marginTop: 8 }}>{tr("Solving ({n}): cancel", { n: busy })}</button>}
        {missing && busy == null && <div style={note}>{tr("Enter every number above: none has a default, because the result is only as good as they are.")}</div>}
      </>)}
      {msg && <div style={warn}>{msg}</div>}
      {res && (
        <div style={{ marginTop: 8, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
          {line(tr("Ore"), `${big(res.oreT)} t`)}
          {line(tr("Mean grade"), `${Number(res.meanGrade.toPrecision(3))} ${res.unit}`)}
          {res.support && line(tr("Ore from one hole / extrapolated"), `${Math.round(res.oreSingleHoleShare * 100)} % / ${Math.round(res.oreExtrapolatedShare * 100)} %`)}
          {line(tr("Contained metal"), metalText(res))}
          {line(tr("Waste"), `${big(res.wasteT)} t`)}
          {line(tr("Strip ratio"), res.stripRatio == null ? "—" : res.stripRatio.toFixed(2))}
          {line(tr("Pit depth"), `${Math.round(res.maxDepth)} m`)}
          {line(tr("Undiscounted margin"), `$${big(res.money)}`)}
          {line(tr("Walls stand at"), `${res.walls.flattest.toFixed(0)}–${res.walls.steepest.toFixed(0)}°`)}
          {line(tr("Grid cell"), `${res.cell.map((v) => Math.round(v * 10) / 10).join(" × ")} m`)}
          {line(tr("Solved in"), `${res.seconds} s`)}
          {res.support && res.oreExtrapolatedShare > 0.5 && <div style={warn}>{tr("Most of this ore is in blocks the estimate classed as extrapolated: the pit rests on grades the drilling does not surround.")}</div>}
          {(res.slopeDeg > 65 || res.maxDepth > 500) && <div style={warn}>{tr("Steeper than 65° overall or deeper than 500 m is beyond most open pits: treat it as a sign the body is an underground question.")}</div>}
          {res.groundSource === "collars" && <div style={note}>{tr("The ground is interpolated between the collars, not a terrain.")}</div>}
          {res.touchesBase && <div style={warn}>{tr("The pit reaches the bottom of the block model: it may go deeper if the body does.")}</div>}
          {res.touchesEdge && <div style={warn}>{tr("The pit reaches the edge of the grid, so it was cut off there.")}</div>}
          {res.barrenShare > 0.02 && <div style={warn}>{tr("{p} % of the rock in this pit is outside the block model and counted as barren: undrilled rock could hold ore or need a different cost.", { p: Math.round(res.barrenShare * 100) })}</div>}
          {res.hasTerrain && res.topAssumed > 0.02 && <div style={warn}>{tr("The terrain does not cover {p} % of the grid; the top of the block model stands in there.", { p: Math.round(res.topAssumed * 100) })}</div>}
          {res.coarsened && <div style={warn}>{tr("The grid was made coarser to stay within the limit, so the walls are coarser than the block model.")}</div>}
          <div style={{ ...note, marginTop: 4 }}>{tr("Conceptual, from your inputs and this block model. It is not a Mineral Reserve or Resource, and the margin is not a value of the project.")}</div>
        </div>
      )}
    </div>
  );
}
