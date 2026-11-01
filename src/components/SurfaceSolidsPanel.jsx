// TASKS.csv #802 — "Solid blocks from surfaces": pick which generated / imported surfaces are unit tops and which are
// closed solids, a cell size and a base, and build a block of units (lib/surfaceSolids.js). The result becomes the
// 3D Modelling pane's "last model", so its existing actions apply unchanged: closed unit volumes (#517), a block model
// (#356), the modelled-unit layer on the holes and the section backdrop (#759).
import React, { useMemo, useState } from "react";
import { Box, X as XIcon } from "./icons.js";
import { t as tr } from "../lib/i18n.js";
import { surfacesToBlock, suggestCellSize } from "../lib/surfaceSolids.js";
import { isMeshClosed } from "../lib/meshQuery.js";
import { validateSolid } from "../lib/meshValidate.js"; // TASKS.csv #860
import { SOLID_SURFACE_TYPES } from "../lib/viewer/modelHelpers.js"; // TASKS.csv #804
import { unitOf, contactOf, layerLabel } from "../lib/explicitUnits.js"; // TASKS.csv #830
import { stackOrder } from "../lib/stackOrder.js"; // TASKS.csv #873
import { blockSourceKey } from "../lib/explicitLog.js"; // TASKS.csv #878

const zStats = (pos) => {
  const zs = [];
  for (let i = 2; i < pos.length; i += 3) zs.push(pos[i]);
  zs.sort((a, b) => a - b);
  return { min: zs[0], max: zs[zs.length - 1], median: zs[zs.length >> 1] };
};

// surfaces: the Generated surfaces list; worldMesh(id) -> { positions (E, N, Z), indices, color } | null;
// origin: the scene origin (the block is built in that offset frame, as GemPy's is); onBuilt(lastModel, summary)
export default function SurfaceSolidsPanel({ surfaces, explicitDefs = [], worldMesh, origin, terrain, sampleGround, onBuilt, onError, onClose, pBtn, smallSel, numInput }) {
  // geometry and a default role for each surface, once per panel opening
  const items = useMemo(() => (surfaces || []).map((s) => {
    const m = worldMesh(s.id);
    const d = explicitDefs.find((x) => x.surfaceId === s.id); // #830 — an explicit surface knows its unit and contact
    if (!m || m.indices.length < 3) return null;
    let closed = s.type === "unit_volume" || s.closure === "closed" || isMeshClosed(m.positions, m.indices).closed;
    // TASKS.csv #860 — closed is not enough: inside a self-intersection the parity test that codes a solid is wrong
    const v = closed && s.type !== "unit_volume" ? validateSolid(m.positions, m.indices) : null;
    const broken = v && (v.selfIntersectingPairs > 0 || v.nonManifoldEdges > 0 || v.windingConflicts > 0) ? v : null;
    if (broken) closed = false;
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (let i = 0; i < m.positions.length; i += 3) { const x = m.positions[i], y = m.positions[i + 1]; if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    // TASKS.csv #859 — a steep surface is a wall, not a top: vertical rays meet it over a sliver of the box and the rules
    // fill the rest (+186 % at 45°, +238 % at 70°, nothing at 90° in the #855 review). Area-weighted dip of its faces.
    let ax = 0, ay = 0, az = 0;
    for (let t = 0; t < m.indices.length; t += 3) {
      const P = m.positions, a = m.indices[t] * 3, b = m.indices[t + 1] * 3, c = m.indices[t + 2] * 3;
      const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0], s = nz < 0 ? -1 : 1;
      ax += s * nx; ay += s * ny; az += s * nz;
    }
    const dip = (Math.atan2(Math.hypot(ax, ay), Math.abs(az)) * 180) / Math.PI;
    const steep = !closed && Math.round(dip) >= 70, leaning = !closed && Math.round(dip) > 45 && !steep; // refuse from 70° (the review: +238 % at 70°), warn above 45°
    return { broken, dip, steep, leaning, id: s.id, name: s.name, unit: d ? layerLabel(d) : s.name, baseUnit: d ? unitOf(d) : s.name, mesh: m, closed, xy: [xmin, xmax, ymin, ymax], z: zStats(m.positions), defaultRole: s.type === "unit_volume" ? "none" : closed ? "solid" : d ? (contactOf(d) === "lower" ? "base" : "top") : (s.type === "fault" || s.type === "vein_hangingwall" || s.type === "vein_footwall" || SOLID_SURFACE_TYPES.has(s.type)) ? "none" : "top" }; // unit volumes are this tool's own output; faults / vein walls are steep, not unit tops; an OPEN body (#804) has no inside and is no top either
  }).filter(Boolean), [surfaces, worldMesh, explicitDefs]);
  const [roles, setRoles] = useState({});
  const roleOf = (it) => roles[it.id] ?? (it.steep ? "none" : it.defaultRole);
  const { used, tops, solids } = useMemo(() => {
    const role = (it) => roles[it.id] ?? (it.steep ? "none" : it.defaultRole);
    const u = items.filter((it) => role(it) !== "none");
    // contacts (#830: upper and lower) in stack order, top first. TASKS.csv #873 — by comparing each pair where both
    // exist, not by median elevation: a dipping top and base picked over different areas had the base's median higher
    const c = u.filter((it) => role(it) === "top" || role(it) === "base");
    const { rank } = stackOrder(c.map((it) => ({ id: it.id, positions: it.mesh.positions, indices: it.mesh.indices })));
    return { used: u, tops: c.sort((a, b) => rank[a.id] - rank[b.id]), solids: u.filter((it) => role(it) === "solid") };
  }, [items, roles]);
  const auto = useMemo(() => {
    if (!used.length) return null;
    const xmin = Math.min(...used.map((it) => it.xy[0])), xmax = Math.max(...used.map((it) => it.xy[1]));
    const ymin = Math.min(...used.map((it) => it.xy[2])), ymax = Math.max(...used.map((it) => it.xy[3]));
    const zlo = Math.min(...used.map((it) => it.z.min)), zhi = Math.max(...used.map((it) => it.z.max));
    const span = Math.max(1, zhi - zlo);
    // the lowest top's unit has no surface below it: by default it goes down a quarter of the stack's height
    const base = tops.length ? Math.min(zlo, ...tops.map((it) => it.z.min)) - 0.25 * span : zlo;
    const extent = [xmin, xmax, ymin, ymax, base, zhi];
    return { extent, cell: suggestCellSize(extent) };
  }, [used, tops]);
  const [cellIn, setCellIn] = useState("");
  const [baseIn, setBaseIn] = useState("");
  const [cutGround, setCutGround] = useState(!!terrain);
  const [extend, setExtend] = useState(true); // TASKS.csv #1138 — continue each contact to the box, so units end where contacts meet
  const cell = Number(cellIn) > 0 ? Number(cellIn) : auto?.cell;
  const base = baseIn !== "" && Number.isFinite(Number(baseIn)) ? Number(baseIn) : auto?.extent[4];
  const box = auto && [auto.extent[0], auto.extent[1], auto.extent[2], auto.extent[3], Math.min(base, auto.extent[5] - (cell || 1)), auto.extent[5] + (cell || 0)];
  const nCells = box && cell ? Math.round((box[1] - box[0]) / cell) * Math.round((box[3] - box[2]) / cell) * Math.round((box[5] - box[4]) / cell) : 0;

  const build = () => {
    try {
      const o = origin;
      const toApi = (it) => { const p = it.mesh.positions, q = new Float64Array(p.length); for (let i = 0; i < p.length; i += 3) { q[i] = p[i] - o.x; q[i + 1] = p[i + 1] - o.y; q[i + 2] = p[i + 2] - o.z; } return { name: it.name, unit: it.unit, role: roleOf(it) === "base" ? "base" : "top", positions: q, indices: it.mesh.indices }; };
      const extent = [box[0] - o.x, box[1] - o.x, box[2] - o.y, box[3] - o.y, box[4] - o.z, box[5] - o.z];
      const ground = cutGround && terrain ? (x, y) => { const g = sampleGround(x + o.x, y + o.y); return Number.isFinite(g) ? g - o.z : NaN; } : null;
      const r = surfacesToBlock({ tops: tops.map(toApi), solids: solids.map(toApi), extent, cell, ground, extend });
      // a surface's own colour, unless an earlier unit already has it (imported solids all share one default): then
      // null, and the pane colours the unit by its name like a logged code. #830 / #832: one entry per unit (several
      // contacts can bound one), and the layers of one unit (Basalt A, Basalt B) may share a colour
      const seen = new Map(), done = new Set(), units = [];
      for (const it of [...tops.map((t) => ({ ...t, label: t.unit })), ...solids.map((t) => ({ ...t, label: t.name, baseUnit: t.name }))]) {
        if (done.has(it.label)) continue;
        done.add(it.label);
        const c = it.mesh.color && (!seen.has(it.mesh.color) || seen.get(it.mesh.color) === it.baseUnit) ? it.mesh.color : null;
        if (c) seen.set(c, it.baseUnit);
        units.push({ name: it.label, label: it.label, color: c });
      }
      const title = tr("solids from {n} surface(s)", { n: tops.length + solids.length });
      // TASKS.csv #878 — an ISO time for the record, and what it was built from (to flag its volumes when a source changes)
      const recipe = { roles: Object.fromEntries(used.map((it) => [it.id, roleOf(it)])), cell, base, cutGround: !!(cutGround && terrain), extend };
      const sourceIds = used.map((it) => it.id);
      onBuilt({ block: r.block, units, origin: { ...o }, when: new Date().toLocaleTimeString(), builtAtIso: new Date().toISOString(), title, matchedPct: null, fromSurfaces: true,
        source: { recipe, ids: sourceIds, key: blockSourceKey(recipe, sourceIds, surfaces) } },
        { counts: r.counts, notExtended: r.notExtended, coverage: r.coverage, cellVolume: r.cellVolume, resolution: r.block.resolution, inverted: r.inverted, extended: extend }); // inverted: #860; extended: #1138
    } catch (e) { onError(e); }
  };

  const row = { display: "flex", alignItems: "center", gap: 6, marginBottom: 5, fontSize: "var(--font-size-sm)" };
  return (
    <div style={{ margin: "4px 0 10px", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, color: "var(--color-text)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
        <Box size={14} aria-hidden="true" /><span style={{ flex: 1 }}>{tr("Solid blocks from surfaces")}</span>
        <XIcon size={14} role="button" tabIndex={0} aria-label={tr("Close")} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClose(); }} />
      </div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45, marginBottom: 8 }}>{tr("Fills a grid of blocks with units. An open surface is the TOP of a unit: its unit runs down to the next top below (tops are stacked by elevation). A closed surface's inside is a unit of its own, over the stack. Then add the units as closed solids or as a block model.")}{" "}{tr("A surface set as the base of a unit has that unit above it, back up to its top; below a base the next unit starts at its own top.")}</div>
      {!items.length && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("No surfaces with geometry yet: model or import one first.")}</div>}
      {items.map((it) => (
        <div key={it.id} style={row}>
          <select value={roleOf(it)} onChange={(e) => setRoles((p) => ({ ...p, [it.id]: e.target.value }))} style={{ ...smallSel, width: 112, flexShrink: 0 }} aria-label={tr("Role of \"{name}\"", { name: it.name })}>
            <option value="top" disabled={it.steep}>{tr("Top of a unit")}</option>
            <option value="base" disabled={it.closed || it.steep}>{tr("Base of a unit")}</option>
            <option value="solid" disabled={!it.closed}>{tr("Solid (inside)")}</option>
            <option value="none">{tr("Not used")}</option>
          </select>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.unit !== it.name ? tr("{name} — a contact of {unit}", { name: it.name, unit: it.unit }) : it.name}>{it.name}{it.unit !== it.name && <span style={{ color: "var(--color-text-muted)" }}> · {it.unit}</span>}</span>
          <span style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>{it.steep || it.leaning ? <span title={it.steep ? tr("A wall, not a top: dips {d}°. Vertical columns meet it over a sliver of the box, so it cannot bound units here. For a vein or dyke use Vein solid from two surfaces.", { d: it.dip.toFixed(0) }) : tr("Dips {d}°: blocks coded from a top this steep are approximate near its edges. For a vein or dyke use Vein solid from two surfaces.", { d: it.dip.toFixed(0) })}>{tr("dips {d}°", { d: it.dip.toFixed(0) })}</span> : it.broken ? <span title={tr("Closed, but it crosses itself ({n} triangle pairs) or its faces point both ways, so it has no well-defined inside. Fix or rebuild it before using it as a solid.", { n: it.broken.selfIntersectingPairs })}>{tr("crosses itself")}</span> : it.closed ? tr("closed") : tr("open")}</span>
        </div>
      ))}
      {tops.length > 1 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6 }}>{tr("Stack, top to bottom: {list}", { list: tops.map((t) => (roleOf(t) === "base" ? tr("base of {unit}", { unit: t.unit }) : t.unit === t.name ? t.name : tr("top of {unit}", { unit: t.unit }))).join(" › ") })}</div>}
      {auto && (<>
        <div style={row}>
          <span style={{ width: 90, flexShrink: 0, color: "var(--color-text-secondary)" }}>{tr("Block size (m)")}</span>
          <input type="number" min="0" value={cellIn} placeholder={String(auto.cell)} onChange={(e) => setCellIn(e.target.value)} style={{ ...numInput, width: 80, flex: "none" }} aria-label={tr("Block size (m)")} />
        </div>
        <div style={row} title={tr("Where the lowest unit stops: it has no surface below it.")}>
          <span style={{ width: 90, flexShrink: 0, color: "var(--color-text-secondary)" }}>{tr("Base (m)")}</span>
          <input type="number" value={baseIn} placeholder={String(Math.round(auto.extent[4]))} onChange={(e) => setBaseIn(e.target.value)} style={{ ...numInput, width: 80, flex: "none" }} aria-label={tr("Base elevation (m)")} />
        </div>
        <label style={{ ...row, cursor: "pointer", color: "var(--color-text-secondary)" }} title={tr("Each contact is carried past its own edge along its dip to the edge of the box, so a unit ends where its contacts meet. Untick to stop every contact at its own edge (the unit then ends in a vertical wall there).")}><input type="checkbox" checked={extend} onChange={(e) => setExtend(e.target.checked)} />{tr("Extend contacts until they meet")}</label>
        {terrain && <label style={{ ...row, cursor: "pointer", color: "var(--color-text-secondary)" }}><input type="checkbox" checked={cutGround} onChange={(e) => setCutGround(e.target.checked)} />{tr("Cut at the terrain (nothing above the ground)")}</label>}
        <div style={{ fontSize: "var(--font-size-xs)", color: nCells > 300_000 ? "var(--color-warn-text)" : "var(--color-text-muted)", marginBottom: 6 }}>{nCells > 2_000_000 ? tr("{n} blocks: over the 2,000,000 limit — use a larger block size.", { n: nCells.toLocaleString() }) : nCells > 300_000 ? tr("{n} blocks in the box: building them is quick, but adding them afterwards as a block model or as unit volumes is slow and memory-hungry at this size. A larger block size keeps it light.", { n: nCells.toLocaleString() }) /* #891 */ : tr("{n} blocks in the box.", { n: nCells.toLocaleString() })}</div>
      </>)}
      <button onClick={build} disabled={!used.length || !cell || nCells > 2_000_000} style={{ ...pBtn, marginBottom: 0, opacity: used.length && nCells <= 2_000_000 ? 1 : 0.5 }}><Box size={14} />{" "}{tr("Build the blocks")}</button>
    </div>
  );
}
