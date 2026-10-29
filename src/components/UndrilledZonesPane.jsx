// TASKS.csv #1139 — the Targeting pane for undrilled zones: the parts of a modelled unit (a closed solid) farther than a
// chosen distance from every drillhole, as a closed solid in the 3D view with the volumes. Maths in lib/undrilledZones.js.
import React, { useMemo, useState } from "react";
import { Crosshair } from "./icons.js";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { desurveyHole } from "../lib/desurvey.js";
import { plannedTrace } from "../lib/holePlanning.js";
import { isMeshClosed } from "../lib/meshQuery.js";
import { unitShell } from "../lib/unitVolumes.js";
import { undrilledZones, defaultCellSize } from "../lib/undrilledZones.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";

const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" };
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const mm3 = (v) => (v >= 1e5 ? `${(v / 1e6).toFixed(2)} Mm³` : `${Math.round(v).toLocaleString()} m³`);

// solids: [{ id, name, positions (world E, N, Z), indices }] (ViewerModule closedShellsForEstimation).
// onAdd({ name, positions, indices, volumeM3, params, tip }) adds the zones as a closed solid.
export default function UndrilledZonesPane({ solids = [], onAdd, onClose }) {
  const { collars = [], survey = [], plannedHoles = [], desurveyMethod } = useStore();
  const [unitId, setUnitId] = useState("");
  const [coverM, setCoverM] = useState(25);
  const [cellText, setCellText] = useState("");
  const [insideOnly, setInsideOnly] = useState(false);
  const [withPlanned, setWithPlanned] = useState(false);
  const [minText, setMinText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [result, setResult] = useState(null);
  const unit = solids.find((s) => s.id === unitId) || null;
  const autoCell = useMemo(() => (unit && coverM > 0 ? defaultCellSize(unit.positions, coverM) : null), [unit, coverM]);

  const traces = () => {
    const by = new Map();
    for (const s of survey) { if (!by.has(s.hole_id)) by.set(s.hole_id, []); by.get(s.hole_id).push(s); }
    const out = [];
    for (const c of collars) {
      if (![c.x, c.y, c.z].every(Number.isFinite)) continue;
      const t = desurveyHole(c, by.get(c.hole_id) || [], desurveyMethod);
      if (t.length > 1) out.push(t);
    }
    const drilled = out.length;
    if (withPlanned) for (const h of plannedHoles) { const t = plannedTrace(h); if (t.length > 1) out.push(t); }
    return { traces: out, drilled, planned: out.length - drilled };
  };

  const run = () => {
    if (!unit) return;
    const closed = isMeshClosed(unit.positions, unit.indices);
    if (!closed.closed) { setMsg({ ok: false, text: tr("\"{name}\" is not a closed solid ({n} open edges), so its inside is not defined. Close it first, or build the unit as a closed volume.", { name: unit.name, n: closed.boundaryEdges }) }); return; }
    setBusy(true); setMsg(null); setResult(null);
    setTimeout(() => { // let the busy state paint
      try {
        const t = traces();
        const r = undrilledZones({ solid: unit, traces: t.traces, coverM: Number(coverM), cellM: Number(cellText) || 0, insideOnly, minZoneM3: Number(minText) || 0 });
        setResult({ ...r, unitName: unit.name, coverM: Number(coverM), insideOnly, holes: t });
      } catch (e) { setMsg({ ok: false, text: e.message }); }
      setBusy(false);
    }, 30);
  };

  const add = () => {
    const r = result; if (!r) return;
    const s = unitShell(r.block, "not covered");
    if (!s) return;
    const volumeM3 = r.uncoveredCells * r.cellVolume - r.ignored.cells * r.cellVolume;
    const name = tr("Not covered by drilling (> {d} m): {unit}", { d: r.coverM, unit: r.unitName });
    onAdd?.({
      name, positions: s.positions, indices: s.indices, volumeM3,
      tip: tr(r.zones.length === 1 ? "{name}\n{v} in 1 zone, {pct}% of the unit" : "{name}\n{v} in {n} zones, {pct}% of the unit", { name, v: mm3(volumeM3), n: r.zones.length, pct: ((100 * volumeM3) / (r.unitCells * r.cellVolume)).toFixed(1) }),
      // project data: English, like every other solid's params (#786)
      params: { tool: "undrilled zones (#1139)", unit: r.unitName, coverageDistanceM: r.coverM, blockSizeM: [0, 1, 2].map(() => +r.cellM.toFixed(2)) /* [dx, dy, dz] like a unit volume */, onlyHolesInsideUnit: r.insideOnly,
        drilledHoles: r.holes.drilled, plannedHolesCounted: r.holes.planned, unitVolumeM3: Math.round(r.unitCells * r.cellVolume), volumeM3: Math.round(volumeM3),
        zones: r.zones.length, smallGapsLeftOut: r.ignored.zones, builtAt: new Date().toISOString(),
        note: `Blocks of the unit whose centre is more than ${r.coverM} m from every hole trace (3D distance to the desurveyed trace). Not covered by drilling, not a resource or a target ranking.` },
    });
    setMsg({ ok: true, text: tr("Added \"{name}\" to the model surfaces: export it, slice it in sections, or turn it off there.", { name }) });
  };

  const unitV = result ? result.unitCells * result.cellVolume : 0;
  const openV = result ? (result.uncoveredCells - result.ignored.cells) * result.cellVolume : 0;
  return (
    <>
      <TaskPaneHeader title={tr("Undrilled zones")} icon={Crosshair} tone="model" onClose={onClose} />
      <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: "var(--font-size-sm)" }}>
        <div style={note}>{tr("The parts of a modelled unit farther than a chosen distance from every drillhole: where the unit has not been tested yet.")}</div>
        {!solids.length && <div style={{ ...note, color: "var(--color-danger-fg)" }}>{tr("No modelled solids yet. Build a closed unit in 3D Modelling (unit volumes, an envelope, a vein solid or an imported solid) first.")}</div>}
        <select value={unitId} onChange={(e) => { setUnitId(e.target.value); setResult(null); }} style={{ ...smallSel, width: "100%" }} aria-label={tr("Modelled unit")}>
          <option value="">{tr("Modelled unit…")}</option>
          {solids.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label style={row} title={tr("A block of the unit counts as covered when a drillhole passes within this distance of it")}>{tr("Covered within (m of a hole)")}
          <input type="number" min="1" step="5" value={coverM} onChange={(e) => setCoverM(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: 70 }} /></label>
        <label style={row}>{tr("Block size (m)")}
          <input type="number" min="0" step="any" value={cellText} placeholder={autoCell ? tr("auto {v}", { v: autoCell }) : tr("auto")} onChange={(e) => setCellText(e.target.value)} style={{ ...smallSel, width: 70 }} /></label>
        <label style={row} title={tr("Gaps smaller than this are left out of the zones (they are counted)")}>{tr("Ignore gaps under (m³)")}
          <input type="number" min="0" step="any" value={minText} placeholder="0" onChange={(e) => setMinText(e.target.value)} style={{ ...smallSel, width: 90 }} /></label>
        <label style={{ display: "flex", gap: 5, alignItems: "flex-start", cursor: "pointer" }}><input type="checkbox" checked={insideOnly} onChange={(e) => setInsideOnly(e.target.checked)} />
          <span>{tr("Count only the parts of holes inside the unit")}<span style={{ ...note, display: "block" }}>{tr("Off: a hole just outside still tests the contact beside it.")}</span></span></label>
        <label style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={withPlanned} onChange={(e) => setWithPlanned(e.target.checked)} disabled={!plannedHoles.length} />
          {tr("Count planned holes as drilled ({n})", { n: plannedHoles.length })}</label>
        <button onClick={run} disabled={!unit || busy || !(coverM > 0)} style={{ ...pBtn, justifyContent: "center", opacity: unit && !busy && coverM > 0 ? 1 : 0.5, marginBottom: 0 }}>{busy ? tr("Measuring…") : tr("Find undrilled zones")}</button>
        {msg && <div role="status" style={{ ...note, color: msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-fg)" }}>{msg.text}</div>}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, border: "1px solid var(--color-border)", borderRadius: 6, padding: 8 }}>
            <div style={{ color: "var(--color-text)" }}>{tr("{pct}% of {unit} ({v}) is within {d} m of a hole.", { pct: ((100 * result.coveredCells) / Math.max(1, result.unitCells)).toFixed(1), unit: result.unitName, v: mm3(unitV), d: result.coverM })}</div>
            <div style={{ color: openV > 0 ? "var(--color-text)" : "var(--color-text-secondary)", fontWeight: 600 }}>
              {result.zones.length ? tr(result.zones.length === 1 ? "Not covered: {v} in 1 zone." : "Not covered: {v} in {n} zones.", { v: mm3(openV), n: result.zones.length }) : tr("Every part of the unit is within the distance of a hole.")}</div>
            {result.ignored.zones > 0 && <div style={note}>{tr(result.ignored.zones === 1 ? "1 smaller gap ({v}) left out." : "{n} smaller gaps ({v}) left out.", { n: result.ignored.zones, v: mm3(result.ignored.cells * result.cellVolume) })}</div>}
            {result.zones.slice(0, 8).map((z, i) => (
              <div key={i} style={{ ...note, color: "var(--color-text-secondary)" }}>{tr("{i}. {v} around E {x}, N {y}, elevation {z}", { i: i + 1, v: mm3(z.volumeM3), x: Math.round(z.centre.x).toLocaleString(), y: Math.round(z.centre.y).toLocaleString(), z: Math.round(z.centre.z).toLocaleString() })}</div>
            ))}
            {result.zones.length > 8 && <div style={note}>{tr("… and {n} more.", { n: result.zones.length - 8 })}</div>}
            <div style={note}>{tr(result.holes.planned ? "{drilled} drilled and {planned} planned holes; {b} m blocks, measured from each block's centre to the hole traces in 3D." : "{drilled} drilled holes; {b} m blocks, measured from each block's centre to the hole traces in 3D.", { drilled: result.holes.drilled, planned: result.holes.planned, b: +result.cellM.toFixed(2) })}</div>
            {result.zones.length > 0 && <button onClick={add} style={{ ...pBtn, justifyContent: "center", marginBottom: 0 }}>{tr("Add the zones to the 3D view")}</button>}
          </div>
        )}
      </div>
    </>
  );
}
