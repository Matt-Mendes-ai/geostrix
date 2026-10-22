// TASKS.csv #802 — "Solid blocks from surfaces": pick which generated / imported surfaces are unit tops and which are
// closed solids, a cell size and a base, and build a block of units (lib/surfaceSolids.js). The result becomes the
// 3D Modelling pane's "last model", so its existing actions apply unchanged: closed unit volumes (#517), a block model
// (#356), the modelled-unit layer on the holes and the section backdrop (#759).
import React, { useMemo, useState } from "react";
import { Box, X as XIcon } from "./icons.js";
import { t as tr } from "../lib/i18n.js";
import { surfacesToBlock, suggestCellSize } from "../lib/surfaceSolids.js";
import { isMeshClosed } from "../lib/meshQuery.js";
import { SOLID_SURFACE_TYPES } from "../lib/viewer/modelHelpers.js"; // TASKS.csv #804

const zStats = (pos) => {
  const zs = [];
  for (let i = 2; i < pos.length; i += 3) zs.push(pos[i]);
  zs.sort((a, b) => a - b);
  return { min: zs[0], max: zs[zs.length - 1], median: zs[zs.length >> 1] };
};

// surfaces: the Generated surfaces list; worldMesh(id) -> { positions (E, N, Z), indices, color } | null;
// origin: the scene origin (the block is built in that offset frame, as GemPy's is); onBuilt(lastModel, summary)
export default function SurfaceSolidsPanel({ surfaces, worldMesh, origin, terrain, sampleGround, onBuilt, onError, onClose, pBtn, smallSel, numInput }) {
  // geometry and a default role for each surface, once per panel opening
  const items = useMemo(() => (surfaces || []).map((s) => {
    const m = worldMesh(s.id);
    if (!m || m.indices.length < 3) return null;
    const closed = s.type === "unit_volume" || s.closure === "closed" || isMeshClosed(m.positions, m.indices).closed;
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (let i = 0; i < m.positions.length; i += 3) { const x = m.positions[i], y = m.positions[i + 1]; if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    return { id: s.id, name: s.name, mesh: m, closed, xy: [xmin, xmax, ymin, ymax], z: zStats(m.positions), defaultRole: s.type === "unit_volume" ? "none" : closed ? "solid" : (s.type === "fault" || s.type === "vein_hangingwall" || s.type === "vein_footwall" || SOLID_SURFACE_TYPES.has(s.type)) ? "none" : "top" }; // unit volumes are this tool's own output; faults / vein walls are steep, not unit tops; an OPEN body (#804) has no inside and is no top either
  }).filter(Boolean), [surfaces, worldMesh]);
  const [roles, setRoles] = useState({});
  const roleOf = (it) => roles[it.id] ?? it.defaultRole;
  const { used, tops, solids } = useMemo(() => {
    const role = (it) => roles[it.id] ?? it.defaultRole;
    const u = items.filter((it) => role(it) !== "none");
    // tops in stack order: highest median elevation first
    return { used: u, tops: u.filter((it) => role(it) === "top").sort((a, b) => b.z.median - a.z.median), solids: u.filter((it) => role(it) === "solid") };
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
  const cell = Number(cellIn) > 0 ? Number(cellIn) : auto?.cell;
  const base = baseIn !== "" && Number.isFinite(Number(baseIn)) ? Number(baseIn) : auto?.extent[4];
  const box = auto && [auto.extent[0], auto.extent[1], auto.extent[2], auto.extent[3], Math.min(base, auto.extent[5] - (cell || 1)), auto.extent[5] + (cell || 0)];
  const nCells = box && cell ? Math.round((box[1] - box[0]) / cell) * Math.round((box[3] - box[2]) / cell) * Math.round((box[5] - box[4]) / cell) : 0;

  const build = () => {
    try {
      const o = origin;
      const toApi = (it) => { const p = it.mesh.positions, q = new Float64Array(p.length); for (let i = 0; i < p.length; i += 3) { q[i] = p[i] - o.x; q[i + 1] = p[i + 1] - o.y; q[i + 2] = p[i + 2] - o.z; } return { name: it.name, positions: q, indices: it.mesh.indices }; };
      const extent = [box[0] - o.x, box[1] - o.x, box[2] - o.y, box[3] - o.y, box[4] - o.z, box[5] - o.z];
      const ground = cutGround && terrain ? (x, y) => { const g = sampleGround(x + o.x, y + o.y); return Number.isFinite(g) ? g - o.z : NaN; } : null;
      const r = surfacesToBlock({ tops: tops.map(toApi), solids: solids.map(toApi), extent, cell, ground });
      // a surface's own colour, unless an earlier unit already has it (imported solids all share one default): then
      // null, and the pane colours the unit by its name like a logged code
      const seen = new Set();
      const units = [...tops, ...solids].map((it) => { const c = it.mesh.color && !seen.has(it.mesh.color) ? it.mesh.color : null; if (c) seen.add(c); return { name: it.name, label: it.name, color: c }; });
      const title = tr("solids from {n} surface(s)", { n: tops.length + solids.length });
      onBuilt({ block: r.block, units, origin: { ...o }, when: new Date().toLocaleTimeString(), title, matchedPct: null, fromSurfaces: true },
        { counts: r.counts, coverage: r.coverage, cellVolume: r.cellVolume, resolution: r.block.resolution });
    } catch (e) { onError(e); }
  };

  const row = { display: "flex", alignItems: "center", gap: 6, marginBottom: 5, fontSize: "var(--font-size-sm)" };
  return (
    <div style={{ margin: "4px 0 10px", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, color: "var(--color-text)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
        <Box size={14} aria-hidden="true" /><span style={{ flex: 1 }}>{tr("Solid blocks from surfaces")}</span>
        <XIcon size={14} role="button" tabIndex={0} aria-label={tr("Close")} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClose(); }} />
      </div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45, marginBottom: 8 }}>{tr("Fills a grid of blocks with units. An open surface is the TOP of a unit: its unit runs down to the next top below (tops are stacked by elevation). A closed surface's inside is a unit of its own, over the stack. Then add the units as closed solids or as a block model.")}</div>
      {!items.length && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("No surfaces with geometry yet: model or import one first.")}</div>}
      {items.map((it) => (
        <div key={it.id} style={row}>
          <select value={roleOf(it)} onChange={(e) => setRoles((p) => ({ ...p, [it.id]: e.target.value }))} style={{ ...smallSel, width: 112, flexShrink: 0 }} aria-label={tr("Role of \"{name}\"", { name: it.name })}>
            <option value="top">{tr("Top of a unit")}</option>
            <option value="solid" disabled={!it.closed}>{tr("Solid (inside)")}</option>
            <option value="none">{tr("Not used")}</option>
          </select>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.name}>{it.name}</span>
          <span style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>{it.closed ? tr("closed") : tr("open")}</span>
        </div>
      ))}
      {tops.length > 1 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6 }}>{tr("Stack, top to bottom: {list}", { list: tops.map((t) => t.name).join(" › ") })}</div>}
      {auto && (<>
        <div style={row}>
          <span style={{ width: 90, flexShrink: 0, color: "var(--color-text-secondary)" }}>{tr("Block size (m)")}</span>
          <input type="number" min="0" value={cellIn} placeholder={String(auto.cell)} onChange={(e) => setCellIn(e.target.value)} style={{ ...numInput, width: 80, flex: "none" }} aria-label={tr("Block size (m)")} />
        </div>
        <div style={row} title={tr("Where the lowest unit stops: it has no surface below it.")}>
          <span style={{ width: 90, flexShrink: 0, color: "var(--color-text-secondary)" }}>{tr("Base (m)")}</span>
          <input type="number" value={baseIn} placeholder={String(Math.round(auto.extent[4]))} onChange={(e) => setBaseIn(e.target.value)} style={{ ...numInput, width: 80, flex: "none" }} aria-label={tr("Base elevation (m)")} />
        </div>
        {terrain && <label style={{ ...row, cursor: "pointer", color: "var(--color-text-secondary)" }}><input type="checkbox" checked={cutGround} onChange={(e) => setCutGround(e.target.checked)} />{tr("Cut at the terrain (nothing above the ground)")}</label>}
        <div style={{ fontSize: "var(--font-size-xs)", color: nCells > 2_000_000 ? "var(--color-warn-text)" : "var(--color-text-muted)", marginBottom: 6 }}>{nCells > 2_000_000 ? tr("{n} blocks: over the 2,000,000 limit — use a larger block size.", { n: nCells.toLocaleString() }) : tr("{n} blocks in the box.", { n: nCells.toLocaleString() })}</div>
      </>)}
      <button onClick={build} disabled={!used.length || !cell || nCells > 2_000_000} style={{ ...pBtn, marginBottom: 0, opacity: used.length && nCells <= 2_000_000 ? 1 : 0.5 }}><Box size={14} />{" "}{tr("Build the blocks")}</button>
    </div>
  );
}
