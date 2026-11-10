// TASKS.csv #1139 — the Targeting pane for undrilled zones: the parts of a modelled unit (a closed solid) farther than a
// chosen distance from every drillhole, as a closed solid in the 3D view with the volumes. Maths in lib/undrilledZones.js.
import React, { useMemo, useState } from "react";
import { Crosshair } from "./icons.js";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { desurveyHole, holeAttitudeAssumed } from "../lib/desurvey.js"; // holeAttitudeAssumed: #2097
import { drilledCollars } from "../lib/collarStatus.js"; // #2097
import { plannedTrace } from "../lib/holePlanning.js";
import { isMeshClosed } from "../lib/meshQuery.js";
import { solidChoices } from "../lib/solidChoices.js"; // TASKS.csv #1564
import { unitShell } from "../lib/unitVolumes.js";
import { undrilledZones, defaultCellSize, defaultCoverM } from "../lib/undrilledZones.js"; // defaultCoverM: #2452
import { medianSiteSpacing } from "../lib/evidenceSources.js"; // TASKS.csv #2452
import { collarGround, collarsLookUnderground } from "../lib/pitShell.js"; // TASKS.csv #1557 — the ground between the collars; #2249: unless they are underground
import { unitSupport } from "../lib/unitSupport.js"; // TASKS.csv #1725 — a one-hole / extrapolated shell is said
import { terrainGroundAt } from "../lib/viewer/geomath.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";

const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" };
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
// #1564 — what to do with an open mesh: the routes GeoStrix has (there is no general 'close this mesh' tool)
const OPEN_ROUTE = "An open mesh has no inside. For an imported isosurface cut off at its model's edge, make the shell from the block model itself (Targeting > Voxel ranges > Shell at this range), which closes along the grid's edge; for a unit, build it as a closed volume in 3D Modelling (unit volumes, an envelope, a vein solid, or a solid linked from section outlines).";
const mm3 = (v) => (v >= 1e5 ? `${(v / 1e6).toFixed(2)} Mm³` : `${Math.round(v).toLocaleString()} m³`);

// solids: [{ id, name, positions (world E, N, Z), indices }] (ViewerModule closedShellsForEstimation).
// onAdd({ name, positions, indices, volumeM3, params, tip }) adds the zones as a closed solid.
// TASKS.csv #1456 — the last result outlives the pane (as PitShellPane's does, #1341): "Plan a hole to here" opens the Planned
// holes pane, and coming back should not mean measuring again
let lastResult = null;
export default function UndrilledZonesPane({ solids = [], onAdd, onClose, onPlanTo = null }) {
  const { collars = [], survey = [], plannedHoles = [], desurveyMethod, terrain } = useStore(); // terrain: #1557
  const [unitId, setUnitId] = useState("");
  // TASKS.csv #2452 (review #2325, WA uranium) — "Covered within" from the drilling: half the median drill-site spacing (sites 77 m apart ->
  // 40 m), not 25 m whatever the spacing (83 % of the 200 ppm sheet "not covered" on the WA grid, as one zone)
  const siteSpacing = useMemo(() => medianSiteSpacing(drilledCollars(collars).collars), [collars]);
  const [coverM, setCoverM] = useState(() => defaultCoverM(siteSpacing));
  const [cellText, setCellText] = useState("");
  const [insideOnly, setInsideOnly] = useState(false);
  const [withPlanned, setWithPlanned] = useState(false);
  const [minText, setMinText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [result, setResultState] = useState(() => lastResult);
  const setResult = (r) => { lastResult = r; setResultState(r); };
  const unit = solids.find((s) => s.id === unitId) || null;
  // TASKS.csv #1564 — closed solids first with their volumes (two 'Au > 1 ppm shell' could not be told apart), open meshes apart and
  // not selectable: Lawyers' 12 imported VLF isosurfaces were offered and each refused only after Run
  const choices = solidChoices(solids);
  const autoCell = useMemo(() => (unit && coverM > 0 ? defaultCellSize(unit.positions, coverM) : null), [unit, coverM]);
  // TASKS.csv #1725 — a grade shell built from one hole, or mostly extrapolated: its undrilled parts are where it is least known
  const support = useMemo(() => (unit ? unitSupport(unit.params) : null), [unit]);
  const pct = (v) => Math.round(100 * v);
  const supportText = support?.weak ? (
    (support.oneHoleShare ?? 0) >= 0.5
      ? tr("\"{name}\" rests on one hole: {p}% of its cells are informed by a single hole{e}. Away from that hole its shape is the interpolator's, not the rock's, so the parts not covered are where the shell is least known — not where grade is expected.", { name: unit.name, p: pct(support.oneHoleShare), e: support.extrapolatedShare != null ? tr(" and {q}% of its boundary is extrapolated", { q: pct(support.extrapolatedShare) }) : "" })
      : tr("\"{name}\" is mostly extrapolated: {q}% of its boundary is carried out beyond the data rather than bracketed by it. Its parts not covered are where the shell is least known — not where grade is expected.", { name: unit.name, q: pct(support.extrapolatedShare) })
  ) : null;

  const traces = () => {
    const by = new Map();
    for (const s of survey) { if (!by.has(s.hole_id)) by.set(s.hole_id, []); by.get(s.hole_id).push(s); }
    const out = [];
    const { collars: drilledList, proposed } = drilledCollars(collars); // #2097 — a collar marked proposed is not drilled ground
    let assumed = 0;
    for (const c of drilledList) {
      if (![c.x, c.y, c.z].every(Number.isFinite)) continue;
      const hs = by.get(c.hole_id) || [];
      const t = desurveyHole(c, hs, desurveyMethod);
      if (t.length > 1) { out.push(t); if (holeAttitudeAssumed(c, hs)) assumed++; }
    }
    const drilled = out.length;
    if (withPlanned) for (const h of plannedHoles) { const t = plannedTrace(h); if (t.length > 1) out.push(t); }
    return { traces: out, drilled, planned: out.length - drilled, assumed, proposed: proposed.length };
  };

  const run = () => {
    if (!unit) return;
    const closed = isMeshClosed(unit.positions, unit.indices);
    if (!closed.closed) { setMsg({ ok: false, text: tr("\"{name}\" is not a closed solid ({n} open edges), so its inside is not defined.", { name: unit.name, n: closed.boundaryEdges }) + " " + tr(OPEN_ROUTE, { n: 1 }) }); return; }
    setBusy(true); setMsg(null); setResult(null);
    setTimeout(() => { // let the busy state paint
      try {
        const t = traces();
        // #1557 — blocks above the ground are not the unit: the terrain, else the ground between the collars (as the pit shell, #1353)
        // TASKS.csv #2249 — collars drilled from underground are not the ground: 15 % of a 1 g/t shell (48 % of the 3 g/t) was dropped as "air"
        const ug = terrain ? null : collarsLookUnderground(collars, survey);
        const groundAt = terrain ? (x, y) => terrainGroundAt(terrain, x, y) : ug?.underground ? null : collarGround(collars);
        const r = undrilledZones({ solid: unit, traces: t.traces, coverM: Number(coverM), cellM: Number(cellText) || 0, insideOnly, minZoneM3: Number(minText) || 0, groundAt });
        setResult({ ...r, unitName: unit.name, coverM: Number(coverM), insideOnly, holes: t, groundFrom: terrain ? "terrain" : groundAt ? "collars" : null, underground: ug?.underground ? ug : null });
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
        drilledHoles: r.holes.drilled, plannedHolesCounted: r.holes.planned, ...(r.holes.assumed ? { drilledHolesAssumedVertical: r.holes.assumed } : {}), ...(r.holes.proposed ? { proposedCollarsLeftOut: r.holes.proposed } : {}), /* #2097 */ unitVolumeM3: Math.round(r.unitCells * r.cellVolume), volumeM3: Math.round(volumeM3),
        zones: r.zones.length, smallGapsLeftOut: r.ignored.zones, builtAt: new Date().toISOString(),
        note: `Blocks of the unit whose centre is more than ${r.coverM} m from every hole trace (3D distance to the desurveyed trace). Not covered by drilling, not a resource or a target ranking.` },
    });
    setMsg({ ok: true, text: tr("Added \"{name}\" to the model surfaces: export it, slice it in sections, or turn it off there.", { name }) });
  };

  const unitV = result ? result.unitCells * result.cellVolume : 0;
  const openV = result ? (result.uncoveredCells - result.ignored.cells) * result.cellVolume : 0;
  return (
    <>
      <TaskPaneHeader title={tr("Undrilled zones")} helpId="undrilled-zones" icon={Crosshair} tone="model" onClose={onClose} />
      <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: "var(--font-size-sm)" }}>
        <div style={note}>{tr("The parts of a modelled unit farther than a chosen distance from every drillhole: where the unit has not been tested yet.")}</div>
        {!solids.length && <div style={{ ...note, color: "var(--color-danger-fg)" }}>{tr("No modelled solids yet. Build a closed unit in 3D Modelling (unit volumes, an envelope, a vein solid or an imported solid), or make a shell of a block model's value range (Targeting > Voxel ranges > Shell at this range), first.")}</div>}
        {!collars.length && solids.length > 0 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr(plannedHoles.length ? "No drillholes yet: every part of a unit is undrilled. The {n} planned hole(s) are the only coverage that can be counted." : "No drillholes yet: every part of a unit is undrilled. Plan holes (Targeting > Planned holes) and count them here to see what they would leave untested.", { n: plannedHoles.length })}</div>}{/* TASKS.csv #1833 — Kodiak: zero holes, said instead of a 0 % figure */}
        <select value={unitId} onChange={(e) => { setUnitId(e.target.value); setResult(null); }} style={{ ...smallSel, width: "100%" }} aria-label={tr("Modelled unit")}>
          <option value="">{tr("Modelled unit…")}</option>
          {choices.closed.map((s) => <option key={s.id} value={s.id}>{tr("{name} — {v}", { name: s.name, v: mm3(s.volumeM3) })}</option>)}
          {choices.open.length > 0 && (
            <optgroup label={tr("Open meshes (no inside to search)")}>
              {choices.open.map((s) => <option key={s.id} value={s.id} disabled>{tr("{name} (open: {n} edges)", { name: s.name, n: s.openEdges.toLocaleString() })}</option>)}
            </optgroup>
          )}
        </select>
        {choices.open.length > 0 && <div style={note}>{tr(OPEN_ROUTE, { n: choices.open.length })}</div>}
        {supportText && <div style={{ ...note, color: "var(--color-warn-text)" }}>{supportText}</div>}{/* #1725 */}
        {unit && !support && unit.type === "geophysical_shell" && <div style={note}>{tr("\"{name}\" was cut from a block model that records no drillhole support per cell (an imported or geophysical model), so nothing here says how well drilled its shape is.", { name: unit.name })}</div>}{/* #2096 */}
        <label style={row} title={tr("A block of the unit counts as covered when a drillhole passes within this distance of it")}>{tr("Covered within (m of a hole)")}
          <input type="number" min="1" step="5" value={coverM} onChange={(e) => setCoverM(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: 70 }} /></label>
        {siteSpacing > 0 && <div style={note}>{tr("Drill sites are typically {s} m apart; covered within starts at half that.", { s: Math.round(siteSpacing) })}</div>}{/* #2452 */}
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
            {supportText && openV > 0 && <div style={{ ...note, color: "var(--color-warn-text)" }}>{supportText}</div>}{/* #1725 — beside the zones and their Plan buttons */}
            <div style={{ color: openV > 0 ? "var(--color-text)" : "var(--color-text-secondary)", fontWeight: 600 }}>
              {result.zones.length ? tr(result.zones.length === 1 ? "Not covered: {v} in 1 zone." : "Not covered: {v} in {n} zones.", { v: mm3(openV), n: result.zones.length }) : tr("Every part of the unit is within the distance of a hole.")}</div>
            {result.underground && <div style={note}>{tr("No part of the solid was cut as air: the collars look like underground collars ({upward} hole(s) drilled upward, {stacked} pair(s) of collars stacked over each other), so they are not a ground surface. Load a terrain to cut at the surface.", { upward: result.underground.upward, stacked: result.underground.stacked })}</div>}{/* #2249 */}
            {result.aboveGroundCells > 0 && <div style={note}>{tr(result.groundFrom === "terrain" ? "{v} of the solid lies above the terrain and was left out (air, not the unit)." : "{v} of the solid lies above the ground between the collars and was left out (air, not the unit; load a terrain for the real surface).", { v: mm3(result.aboveGroundCells * result.cellVolume) })}</div>}
            {result.ignored.zones > 0 && <div style={note}>{tr(result.ignored.zones === 1 ? "1 smaller gap ({v}) left out." : "{n} smaller gaps ({v}) left out.", { n: result.ignored.zones, v: mm3(result.ignored.cells * result.cellVolume) })}</div>}
            {result.zones.slice(0, 8).map((z, i) => (
              <div key={i} style={{ ...note, color: "var(--color-text-secondary)" }}>{onPlanTo && <button onClick={() => onPlanTo(z.target || z.centre)} style={planBtn} title={tr("Open Planned holes aimed at the zone's point farthest from the drilling: choose a collar, then Solve")}>{/* #1724 */}{tr("Plan a hole to here")}</button>}{tr("{i}. {v} around E {x}, N {y}, elevation {z}", { i: i + 1, v: mm3(z.volumeM3), x: Math.round(z.centre.x).toLocaleString(), y: Math.round(z.centre.y).toLocaleString(), z: Math.round(z.centre.z).toLocaleString() })}</div>
            ))}
            {result.zones.length > 8 && <div style={note}>{tr("… and {n} more.", { n: result.zones.length - 8 })}</div>}
            <div style={note}>{tr(result.holes.planned ? "{drilled} drilled and {planned} planned holes; {b} m blocks, measured from each block's centre to the hole traces in 3D." : "{drilled} drilled holes; {b} m blocks, measured from each block's centre to the hole traces in 3D.", { drilled: result.holes.drilled, planned: result.holes.planned, b: +result.cellM.toFixed(2) })}{result.holes.assumed ? " " + tr("{n} of the drilled holes have no survey and no azimuth / dip and are taken as vertical.", { n: result.holes.assumed }) : ""}{result.holes.proposed ? " " + tr("{n} collar(s) whose status is proposed are not counted.", { n: result.holes.proposed }) : ""}</div>{/* #2097 */}
            {result.cellM > result.coverM && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("The blocks ({b} m) are coarser than the coverage distance ({c} m): a block counts as covered by where its centre falls, so the covered share and the smallest zones move with the block grid. Type a smaller block size if the unit's box allows it.", { b: +result.cellM.toFixed(2), c: result.coverM })}</div>}{/* #1568 */}
            {result.zones.length > 0 && <button onClick={add} style={{ ...pBtn, justifyContent: "center", marginBottom: 0 }}>{tr("Add the zones to the 3D view")}</button>}
          </div>
        )}
      </div>
    </>
  );
}
const planBtn = { float: "right", marginLeft: 6, padding: "1px 6px", fontSize: "var(--font-size-xs)", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer", color: "var(--color-text-secondary)" }; // #1456
