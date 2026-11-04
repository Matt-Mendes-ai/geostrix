// TASKS.csv #1341 — the Mine Design tab's pit shell: a block model and your own economics in, the pit that makes the most
// undiscounted money out, as a surface in the 3D view with what it holds. Every number is the user's: no default price, cost or
// density (a default would read as a fact, as #264). Maths in lib/pitShell.js; framing from #836.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pickaxe, Eye, EyeOff, Trash2, Pencil } from "./icons.js";
import { confirmDestructive } from "../lib/confirmDestructive.js"; // #1498
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { PRICE_UNITS, pitEconomics, pitMetalOf, elementOfModel, SECTORS, hasSectorSlopes } from "../lib/pitShell.js"; // pitMetalOf / elementOfModel: #1748; SECTORS: #1881
import { sgSummary } from "../lib/gradeTonnage.js";
import { valueUnit } from "../lib/blockModelExport.js";
import { categoricalModels } from "../lib/geologyForward.js";
import { gradeCandidate } from "../lib/gradeCandidate.js"; // #1848
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
const EMPTY = { price: "", priceUnit: "", recovery: "", miningCost: "", processingCost: "", density: "", slopeDeg: "", revenueFactor: "1", size: "", unit: "", sectorSlopes: {} }; // sectorSlopes: #1881
const SECTOR_GRID = [["NW", "N", "NE"], ["W", null, "E"], ["SW", "S", "SE"]]; // the compass layout of the sector slopes
const PRICE_UNIT_MASS = { g: { g: 1, oz: 31.1034768 }, t: { t: 1, lb: 1 / 2204.62262 } }; // #1898 — the mass each price unit prices
const FIELDS = ["price", "recovery", "miningCost", "processingCost", "density", "slopeDeg"];
let kept = null; // #1356 — the last result, shown again when the pane or the tab comes back (this session)

// surfaces: the project's generated surfaces (the last pit's inputs come back from its saved parameters).
// onAdd({ name, positions, indices, params, tip, type, closure, color, tag }) puts the pit in the 3D view; onToggle(id) shows/hides a surface;
// onRemove(id) deletes one (#1498).
export default function PitShellPane({ surfaces = [], onAdd, onToggle, onRemove, onClose }) {
  const { voxelModels = [], terrain, layers, collars = [] } = useStore();
  // a grade: a unit that counts metal first, then none stated (an import may simply not say); never a resistivity, a variance, an inversion or a category
  const models = useMemo(() => {
    const cat = new Set(categoricalModels(voxelModels));
    return voxelModels.filter((m) => gradeCandidate(m, (x) => cat.has(x)))
      .sort((a, c) => (valueUnit(c) ? 1 : 0) - (valueUnit(a) ? 1 : 0));
  }, [voxelModels]);
  const last = useMemo(() => [...surfaces].reverse().find((s) => s.type === "pit_shell")?.params?.inputs || null, [surfaces]);
  const [modelId, setModelId] = useState(() => (models.find((m) => (m.id ?? m.name) === last?.modelId) ? last.modelId : models[0]?.id ?? models[0]?.name ?? ""));
  const [f, setF] = useState(() => ({ ...EMPTY, ...(last || {}) }));
  const [busy, setBusy] = useState(null);
  const [res, setRes] = useState(() => (kept && models.some((m) => m.name === kept.model) ? kept : null));
  const [hideEarlier, setHideEarlier] = useState(true);
  const [msg, setMsg] = useState(null);
  const [showSectors, setShowSectors] = useState(() => hasSectorSlopes(last?.sectorSlopes)); // #1881
  const sectorBad = SECTORS.some((k) => { const v = f.sectorSlopes?.[k]; return v !== "" && v != null && !(Number(v) > 0 && Number(v) < 90); });
  const setSector = (k, v) => { setF((p) => ({ ...p, sectorSlopes: { ...(p.sectorSlopes || {}), [k]: v } })); setMsg(null); };
  // TASKS.csv #1613 (review #1497, Lawyers) — the figures belong to one pit: once it is removed (here, or from 3D Modelling's
  // surfaces list) they go too, as does a "no pit" message once the inputs it describes are changed
  const resGone = !!res?.pitId && !surfaces.some((s) => s.id === res.pitId);
  useEffect(() => { if (resGone) { setRes(null); if (kept?.pitId === res.pitId) kept = null; } }, [resGone]);
  // TASKS.csv #1498 — Matt: "currently there is no way to turn off or remove or edit the pit shell". The pits are listed here with a
  // show / hide eye, Edit (their saved inputs back in the form; the next run replaces that pit) and delete.
  const pits = surfaces.filter((s) => s.type === "pit_shell");
  const [editingId, setEditingId] = useState(null);
  const editing = pits.find((s) => s.id === editingId) || null;
  const editPit = (s) => {
    const inp = s.params?.inputs || {};
    if (inp.modelId != null && models.some((m) => (m.id ?? m.name) === inp.modelId)) setModelId(inp.modelId);
    setF({ ...EMPTY, ...Object.fromEntries(Object.entries(inp).filter(([k]) => k in EMPTY && k !== "sectorSlopes").map(([k, v]) => [k, v == null ? "" : String(v)])), sectorSlopes: Object.fromEntries(SECTORS.map((k) => [k, inp.sectorSlopes?.[k] == null ? "" : String(inp.sectorSlopes[k])])) }); // sectorSlopes: #1881
    setShowSectors(hasSectorSlopes(inp.sectorSlopes));
    setEditingId(s.id); setMsg(null);
  };
  const removePit = (s) => {
    if (!confirmDestructive(tr("Remove the pit \"{name}\"?", { name: s.name }), { recover: tr("run it again with the same inputs (Edit keeps them until then).") })) return;
    if (editingId === s.id) setEditingId(null);
    onRemove?.(s.id);
  };
  const job = useRef(null);
  const model = models.find((m) => (m.id ?? m.name) === modelId) || null;
  const stated = model ? valueUnit(model) : null, unit = stated || f.unit;
  const element = elementOfModel(model); // #1748 — copper in ppm is still sold by the pound
  const metal = unit ? pitMetalOf(unit, element) : null;
  const prices = metal ? PRICE_UNITS[metal.unit] : null, priceUnit = prices?.some(([k]) => k === f.priceUnit) ? f.priceUnit : prices?.[0][0];
  const sg = useMemo(() => sgSummary(layers?.sg), [layers?.sg]);
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setMsg(null); }; // #1613
  // #1355 — a price belongs to the unit it was typed in: switching from a % model ($/lb) to a ppm one ($/oz) blanks it, never re-reads it
  const priceStale = f.price !== "" && !!f.priceUnit && !!prices && !prices.some(([k]) => k === f.priceUnit);
  const setPrice = (e) => setF((p) => ({ ...p, price: e.target.value, priceUnit }));
  // #1898 — switching the picker converts the typed price to the new unit (1,800 $/oz is 57.87 $/g; 4 $/lb is 8,818 $/t)
  const setPriceUnit = (e) => {
    const to = e.target.value, from = priceUnit, n = Number(f.price);
    const F = metal?.unit === "g" ? PRICE_UNIT_MASS.g : PRICE_UNIT_MASS.t;
    const conv = n > 0 && from && from !== to && F[from] != null && F[to] != null ? n * (F[to] / F[from]) : null;
    setF((p) => ({ ...p, priceUnit: to, price: conv == null ? p.price : String(+conv.toPrecision(6)) }));
    setMsg(conv == null ? null : tr("The price was converted to {unit}: {v}.", { unit: (prices.find(([k]) => k === to) || [])[1] || to, v: +conv.toPrecision(6) }));
  };
  const value = (k) => (k === "price" && priceStale ? NaN : Number(f[k]));
  const missing = !model || !metal || FIELDS.some((k) => !(value(k) > 0)) || value("slopeDeg") >= 90 || value("recovery") > 100 || !(Number(f.revenueFactor) > 0) || sectorBad; // revenue factor: #1363; sectorBad: #1881
  const cutoff = !missing ? pitEconomics({ unit, element, price: value("price"), priceUnit, recovery: value("recovery"), processingCost: value("processingCost"), revenueFactor: Number(f.revenueFactor) || 1 })?.cutoff : null;

  const run = async () => {
    const rf = Number(f.revenueFactor) > 0 ? Number(f.revenueFactor) : 1, size = Number(f.size) > 0 ? Number(f.size) : null;
    // #1881 — the sector slopes that are set, as numbers; none set: no key at all, so an older project's inputs read the same
    const sectors = Object.fromEntries(SECTORS.filter((k) => Number(f.sectorSlopes?.[k]) > 0 && Number(f.sectorSlopes?.[k]) < 90).map((k) => [k, Number(f.sectorSlopes[k])]));
    const inputs = { unit, element, price: value("price"), priceUnit, recovery: value("recovery"), miningCost: value("miningCost"), processingCost: value("processingCost"), density: value("density"), slopeDeg: value("slopeDeg"), revenueFactor: rf, size, ...(Object.keys(sectors).length ? { sectorSlopes: sectors } : {}) };
    setBusy(0); setMsg(null); // the previous result stays until a new one arrives (#1366)
    const t0 = performance.now();
    try {
      job.current = runPitShellAsync(model, inputs, terrain, (phases) => setBusy(phases), collars); // collars: the ground when there is no terrain (#1353)
      const r = await job.current.promise;
      if (r.cancelled) { setMsg(tr("Cancelled: nothing was added.")); return; }
      setRes(null); kept = null;
      if (r.failed || r.empty) { setMsg(r.empty ? tr("At these inputs no block pays for the rock over it, so there is no pit. Cut-off grade {c} {unit}.", { c: Number(r.cutoff.toPrecision(3)), unit }) : tr("The block model has no blocks with values.")); return; }
      const seconds = Math.round((performance.now() - t0) / 100) / 10, rfText = rf !== 1 ? ` x${rf}` : "";
      const cellText = size || r.coarsened ? tr(", {c} m cells", { c: Math.round(r.cell[0] * 10) / 10 }) : ""; // #1900 — a typed or coarsened size names the pit
      const support = model.cells.some((c) => Number.isFinite(c.nHoles)); // #1354 — the estimate says how many holes informed each block
      kept = { ...r, unit, seconds, hasTerrain: !!terrain, model: model.name, slopeDeg: inputs.slopeDeg, sectorSlopes: inputs.sectorSlopes || null, support };
      setRes(kept);
      const contained = r.metalU * r.metalFactor;
      if (hideEarlier) surfaces.filter((s) => s.type === "pit_shell" && s.visible && s.id !== editingId).forEach((s) => onToggle?.(s.id)); // #1356 — one pit on view at a time
      if (editingId) { onRemove?.(editingId); setEditingId(null); } // #1498 — the edited pit is replaced by the new run
      const priceLabel = (prices.find(([k]) => k === priceUnit) || [])[1] || "";
      const pitId = onAdd({
        // #1356 — named by what usually changes between runs, so a list of pits can be told apart
        name: tr("Pit shell: {model} at {price} {unit}, {slope}°{rf}{sec}{cells}", { model: model.name, price: inputs.price, unit: priceLabel, slope: inputs.slopeDeg, rf: rfText, sec: inputs.sectorSlopes ? tr(" (by sector)") : "", cells: cellText }), positions: r.positions, indices: r.indices, type: "pit_shell", closure: null, color: "#b5651d", tag: "pit",
        tip: tr("Conceptual pit shell: not a mine plan, a Reserve or a Resource"),
        params: { tool: "conceptual pit shell (maximum closure, exact)", inputs: { ...inputs, priceUnit, modelId, unit: stated ? "" : unit }, blockModel: model.name, gradeUnit: unit, oreTonnes: Math.round(r.oreT), wasteTonnes: Math.round(r.wasteT), stripRatio: r.stripRatio == null ? null : +r.stripRatio.toFixed(2), meanGrade: r.meanGrade == null ? null : +r.meanGrade.toPrecision(4), containedMetal: Math.round(contained), containedMetalUnit: r.metalUnit, cutoffGrade: +r.cutoff.toPrecision(3), undiscountedMargin: Math.round(r.money), maxDepthM: Math.round(r.maxDepth), wallAnglesDeg: [+r.walls.flattest.toFixed(1), +r.walls.steepest.toFixed(1)], gridCellM: r.cell.map((v) => +v.toFixed(1)), rockOutsideBlockModelShare: +r.barrenShare.toFixed(3), noTerrainShare: +r.topAssumed.toFixed(3), groundFrom: r.groundSource, ...(support ? { oreSingleHoleShare: +r.oreSingleHoleShare.toFixed(3), oreExtrapolatedShare: +r.oreExtrapolatedShare.toFixed(3) } : {}), reachesModelBase: r.touchesBase, caution: "conceptual: undiscounted, no ramps, berms, dilution or scheduling; not a Mineral Reserve or Resource", generatedAt: new Date().toISOString() },
      });
      if (pitId) { kept = { ...kept, pitId }; setRes(kept); } // #1613 — the result knows its pit
    } catch (e) {
      setMsg(tr("The pit run failed: {v}", { v: e.message || e }));
    } finally {
      setBusy(null); job.current = null;
    }
  };
  const cancel = () => job.current?.cancel();
  const metalText = (r) => { const m = r.metalU * r.metalFactor; return r.metalUnit === "g" ? `${big(m / G_PER_OZ)} oz` : `${big(m)} t (${big(m * 2204.62262)} lb)`; }; // #1748 — and pounds
  const line = (label, v) => <div style={row}><span>{label}</span><b>{v}</b></div>;
  const field = (k, label, extra = {}) => <label style={row}>{label}<input type="number" min={0} step="any" value={f[k]} onChange={set(k)} style={num} {...extra} /></label>;

  return (
    <div>
      <TaskPaneHeader title="Pit shell" icon={Pickaxe} tone="model" onClose={onClose} />
      <div style={note}>{tr("The pit that makes the most money at your prices and costs, solved exactly. It answers whether a body sits shallow enough for a pit. It has no discounting, ramps, berms or dilution, so it is not a mine plan, a Reserve or a Resource.")}</div>
      {!models.length && <div style={warn}>{tr("It needs a block model of grades. Estimate one (3D Modelling > Estimation) or import one.")}</div>}
      {!models.length && voxelModels.length > 0 && ( // #1849 — why the project's models are not offered
        <div style={note}>{tr("Not offered: {list}. Geophysical, categorical and estimation-quality models are not grades.", { list: voxelModels.slice(0, 4).map((m) => `${m.name}${m.property ? ` (${m.property})` : ""}`).join(", ") + (voxelModels.length > 4 ? ", …" : "") })}</div>
      )}
      {models.length > 0 && (<>
        <label style={row}>{tr("Block model")}<select value={modelId} onChange={(e) => setModelId(e.target.value)} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Block model of the pit")}>
          {models.map((m) => <option key={m.id ?? m.name} value={m.id ?? m.name}>{m.name}</option>)}
        </select></label>
        {model && !stated && <label style={row}>{tr("Its grades are in")}<select value={f.unit} onChange={set("unit")} style={num} aria-label={tr("Grade unit of the block model")}><option value="">{tr("— choose —")}</option>{GRADE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>}
        <label style={row}>{tr("Metal price")}<span style={{ display: "flex", gap: 4 }}><input type="number" min={0} step="any" value={priceStale ? "" : f.price} onChange={setPrice} style={num} aria-label={tr("Metal price")} />
          <select value={priceUnit || ""} onChange={setPriceUnit} disabled={!prices} style={{ ...smallSel, width: 62 }} aria-label={tr("Price unit")}>{(prices || []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></span></label>
        {priceStale && <div style={warn}>{tr("The price was entered for another metal unit: enter it again for this block model.")}</div>}
        {field("recovery", tr("Metallurgical recovery (%)"))}
        {field("miningCost", tr("Mining cost ($/t rock)"))}
        {field("processingCost", tr("Processing cost ($/t ore)"))}
        {field("density", tr("Density (t/m³)"))}
        {sg && !f.density && <div style={{ ...note, marginTop: 2 }}><button onClick={() => setF((p) => ({ ...p, density: String(sg.mean) }))} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 6px" }}>{tr("Use the logged mean, {v}", { v: sg.mean })}</button></div>}
        {field("slopeDeg", tr("Overall slope (°)"))}
        {/* TASKS.csv #1881 — a slope per wall sector: the wall on that side of the pit; blank takes the overall slope */}
        <div style={{ ...note, marginTop: 2 }}><button onClick={() => setShowSectors((v) => !v)} style={linkBtn} aria-expanded={showSectors}>{showSectors ? tr("Hide the slope by wall sector") : tr("Slope by wall sector…")}</button></div>
        {showSectors && (
          <div style={{ marginTop: 4 }}>
            <div style={note}>{tr("The wall on each side of the pit: blank takes the overall slope. From a geotechnical study, not a guess.")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, marginTop: 4 }}>
              {SECTOR_GRID.flat().map((k, i) => (k
                ? <label key={k} style={{ ...note, display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}><span style={{ width: 20, textAlign: "right", flexShrink: 0 }}>{k}</span><input type="number" min={1} max={89} step="any" value={f.sectorSlopes?.[k] ?? ""} onChange={(e) => setSector(k, e.target.value)} placeholder={f.slopeDeg || "°"} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Slope of the {k} wall", { k })} /></label>
                : <span key={`c${i}`} style={{ ...note, textAlign: "center", alignSelf: "center" }}>°</span>))}
            </div>
            {sectorBad && <div style={warn}>{tr("A sector slope must be between 0 and 90°.")}</div>}
          </div>
        )}
        {field("revenueFactor", tr("Revenue factor"), { title: tr("Multiplies the price: below 1 gives a smaller pit, a quick test of how much it depends on price.") })}
        {field("size", tr("Pit block size (m)"), { placeholder: tr("auto"), title: tr("Blank: the block model's own size. A larger size runs faster and draws coarser walls; a block keeps its own ore or waste decision either way.") })}
        {cutoff != null && <div style={{ ...note, marginTop: 4 }}>{tr("Cut-off grade at these inputs: {c} {unit}.", { c: Number(cutoff.toPrecision(3)), unit })}</div>}
        {!terrain && <div style={warn}>{collars.some((c) => Number.isFinite(c.z))
          ? tr("No terrain is loaded, so the ground is interpolated between the {n} collar elevations. Load a terrain in Maps for the real surface.", { n: collars.filter((c) => Number.isFinite(c.z)).length })
          : tr("No terrain is loaded, so the top of the block model is taken as the ground and no overburden above it is costed. Load one in Maps.")}</div>}
        {surfaces.some((s) => s.type === "pit_shell" && s.visible) && <label style={{ ...row, justifyContent: "flex-start" }}><input type="checkbox" checked={hideEarlier} onChange={(e) => setHideEarlier(e.target.checked)} />{tr("Hide the earlier pits")}</label>}
        {busy == null
          ? <button onClick={run} disabled={missing} style={{ ...pBtn, marginTop: 8, opacity: missing ? 0.5 : 1 }}><Pickaxe size={14} /> {editing ? tr("Run and replace the pit") : tr("Run the pit shell")}</button>
          : <button onClick={cancel} style={{ ...pBtn, marginTop: 8 }}>{tr("Solving ({n}): cancel", { n: busy })}</button>}
        {missing && busy == null && <div style={note}>{tr("Enter every number above: none has a default, because the result is only as good as they are.")}</div>}
        {editing && <div style={{ ...note, marginTop: 4 }}>{tr("Editing \"{name}\": its inputs are in the form; running replaces it.", { name: editing.name })} <button onClick={() => setEditingId(null)} style={linkBtn}>{tr("Stop editing")}</button></div>}
      </>)}
      {pits.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...row, marginTop: 0, fontWeight: 600, color: "var(--color-text)" }}>{tr("Pits ({n})", { n: pits.length })}</div>
          {pits.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, padding: "4px 6px", border: `1px solid ${s.id === editingId ? "var(--color-selected-border)" : "var(--color-border)"}`, borderRadius: 5, background: "var(--color-bg-subtle)", fontSize: "var(--font-size-sm)" }}>
              <button onClick={() => onToggle?.(s.id)} style={iconBtnStyle} aria-label={s.visible ? tr("Hide {name}", { name: s.name }) : tr("Show {name}", { name: s.name })} title={s.visible ? tr("Hide") : tr("Show")}>{s.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
              <span title={s.name} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: s.visible ? "var(--color-text)" : "var(--color-text-muted)" }}>{String(s.name).replace(/^Pit shell: /, "")}</span>
              {Number.isFinite(s.params?.oreTonnes) && <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>{`${big(s.params.oreTonnes)} t`}</span>}
              <button onClick={() => editPit(s)} style={iconBtnStyle} aria-label={tr("Edit {name}", { name: s.name })} title={tr("Put this pit's inputs in the form; the next run replaces it")}><Pencil size={13} /></button>
              <button onClick={() => removePit(s)} style={iconBtnStyle} aria-label={tr("Remove {name}", { name: s.name })} title={tr("Remove")}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
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
          {!res.sectorSlopes && (res.walls.steepest - res.slopeDeg > 3 || res.slopeDeg - res.walls.flattest > 3) && <div style={warn}>{tr("The walls stand {f}–{s}° for a typed {a}°: on {c} m cells the arc pattern cannot draw {a}° exactly, so read the attained angles, and compare runs at the angles it can draw.", { f: res.walls.flattest.toFixed(0), s: res.walls.steepest.toFixed(0), a: res.slopeDeg, c: Math.round(res.cell[0] * 10) / 10 })}</div>}{/* #1896 */}
          {res.walls.bySector && res.sectorSlopes && <div style={note}>{tr("By wall: {list} (a wall a little off a sector's centre grades towards its neighbours).", { list: SECTORS.filter((k) => res.walls.bySector[k] != null).map((k) => `${k} ${res.walls.bySector[k].toFixed(0)}°`).join(", ") })}</div>}{/* #1881 */}
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
const iconBtnStyle = { display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, padding: 0, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }; // #1498
const linkBtn = { background: "none", border: "none", padding: 0, color: "var(--color-accent)", cursor: "pointer", fontSize: "inherit", textDecoration: "underline" };
