// TASKS.csv #1950 / #1951 (Vulcan workflow review) — CLIP a closed solid by a surface (the terrain, a contact, a fault, any
// generated surface) keeping one side, and COMBINE two closed solids (intersection, union, difference). Maths in
// lib/solidBoolean.js; the result is a new generated surface with its volume, its closure stated honestly (the seam of a cut
// is two edge loops on the same curve, see the lib's header), never a change to the inputs.
import React, { useMemo, useState } from "react";
import { X } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";
import { clipSolidBySurface, solidBoolean, terrainPatchMesh, meanNormalZ, meshBounds } from "../lib/solidBoolean.js";
import { isMeshClosed } from "../lib/meshQuery.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 };
const warn = { ...note, color: "var(--color-warn-text-strong)" };
const row = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 };
const big = (v) => Math.round(v).toLocaleString();

// solid: { id, name }; surfaces: every generated surface; meshOf(id) -> { positions, indices } in world E, N, Z or null;
// groundAt(x, y) -> elevation or NaN (null without a terrain); onAdd(spec) -> id (the same spec addUndrilledSolid takes)
export default function SolidToolsModal({ solid, surfaces = [], meshOf, groundAt = null, hasTerrain = false, onAdd, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const others = useMemo(() => surfaces.filter((s) => s.id !== solid.id), [surfaces, solid.id]);
  const [cutterId, setCutterId] = useState(hasTerrain ? "terrain" : others[0]?.id || "");
  const [keep, setKeep] = useState("positive");
  const [otherId, setOtherId] = useState(others.find((s) => s.closure === "closed")?.id || "");
  const [op, setOp] = useState("intersection");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const me = useMemo(() => meshOf(solid.id), [meshOf, solid.id]);
  const meClosed = useMemo(() => (me ? isMeshClosed(me.positions, me.indices) : null), [me]);
  const cutterMesh = useMemo(() => {
    if (cutterId === "terrain") { if (!groundAt || !me) return null; return terrainPatchMesh(groundAt, meshBounds(me.positions, 0.05 * Math.max(1, Math.hypot(meshBounds(me.positions).x1 - meshBounds(me.positions).x0, meshBounds(me.positions).y1 - meshBounds(me.positions).y0)))); }
    return cutterId ? meshOf(cutterId) : null;
  }, [cutterId, groundAt, me, meshOf]);
  const cutterName = cutterId === "terrain" ? tr("the terrain") : others.find((s) => s.id === cutterId)?.name || "";
  const faces = cutterMesh ? meanNormalZ(cutterMesh.positions, cutterMesh.indices) : 0; // +1: its positive side is above
  const sideLabel = (side) => (faces === 0 ? (side === "positive" ? tr("the side the surface faces") : tr("the other side")) : (side === "positive") === (faces > 0) ? tr("above it") : tr("below it"));
  const taken = new Set(surfaces.map((s) => s.name));
  const unique = (base) => { let name = base; for (let k = 2; taken.has(name); k++) name = `${base} (${k})`; return name; };
  const report = (r, name) => {
    const closure = r.closed ? tr("closed") : tr("not closed: the seam of the cut is two edge loops on one curve ({n} open edges), so a closure check will say open; the volume is exact to the cut tolerance", { n: r.boundaryEdges });
    return tr("Added \"{name}\": {v} m³, {c}{k}.", { name, v: big(r.volumeM3), c: closure, k: r.components > 1 ? tr("; {k} separate pieces", { k: r.components }) : "" });
  };
  const runClip = () => {
    if (!me || !cutterMesh) return;
    setBusy("clip"); setMsg(null);
    setTimeout(() => {
      try {
        const r = clipSolidBySurface(me, cutterMesh, { keep });
        if (!r.ok) { setMsg(r.reason === "no-overlap" ? tr("\"{s}\" does not reach \"{c}\": nothing to cut.", { s: solid.name, c: cutterName }) : tr("The clip failed: {v}", { v: r.reason })); return; }
        if (r.empty) { setMsg(tr("Nothing of \"{s}\" lies {side} \"{c}\".", { s: solid.name, side: sideLabel(keep), c: cutterName })); return; }
        if (r.unchanged) { setMsg(tr("All of \"{s}\" already lies {side} \"{c}\": nothing was cut, so nothing was added.", { s: solid.name, side: sideLabel(keep), c: cutterName })); return; }
        const name = unique(tr("{s} {side} {c}", { s: solid.name, side: sideLabel(keep), c: cutterName }));
        onAdd({ name, positions: r.positions, indices: r.indices, volumeM3: r.volumeM3, type: "clipped_solid", closure: r.closed ? "closed" : "open", color: "#7c4dff", tag: "clipped",
          tip: tr("{s} clipped {side} {c}", { s: solid.name, side: sideLabel(keep), c: cutterName }),
          params: { tool: "solid clipped by a surface (exact cut at the crossings; the surface inside the solid is the cap)", source: solid.name, sourceId: solid.id, cutter: cutterName, cutterId, keep: sideLabel(keep), volumeM3: Math.round(r.volumeM3), closed: r.closed, seamOpenEdges: r.boundaryEdges, components: r.components, capTriangles: r.capTriangles, unresolvedEdges: r.unresolvedEdges, generatedAt: new Date().toISOString() } });
        setMsg(report(r, name) + (r.unresolvedEdges ? ` ${tr("{n} edge(s) crossed the surface where it does not reach: those triangles were left whole, so the cut is approximate there.", { n: r.unresolvedEdges })}` : "") + (cutterId === "terrain" && cutterMesh.missing ? ` ${tr("The terrain has no data under {n} of the {m} sample points: the solid was not cut there.", { n: cutterMesh.missing, m: cutterMesh.sampled })}` : ""));
      } catch (e) { setMsg(tr("The clip failed: {v}", { v: e.message || e })); }
      finally { setBusy(null); }
    }, 30);
  };
  const other = others.find((s) => s.id === otherId) || null;
  const runBoolean = () => {
    if (!me || !other) return;
    const om = meshOf(other.id); if (!om) return;
    setBusy("bool"); setMsg(null);
    setTimeout(() => {
      try {
        const r = solidBoolean(me, om, op);
        if (!r.ok) { setMsg(r.reason === "cutter-not-closed" ? tr("One of the solids is not closed ({n} open edges): a boolean needs two closed solids. Solid blocks from surfaces codes a grid by units instead.", { n: r.closure?.boundaryEdges ?? "?" }) : tr("The operation failed: {v}", { v: r.reason })); return; }
        if (r.empty) { setMsg(tr("\"{a}\" and \"{b}\" share no volume.", { a: solid.name, b: other.name })); return; }
        const opText = { intersection: tr("∩"), union: tr("∪"), difference: tr("−") }[op];
        const name = unique(`${solid.name} ${opText} ${other.name}`);
        onAdd({ name, positions: r.positions, indices: r.indices, volumeM3: r.volumeM3, type: "boolean_solid", closure: r.closed ? "closed" : "open", color: "#00897b", tag: "boolean",
          tip: tr("{op} of {a} and {b}", { op: { intersection: tr("Intersection"), union: tr("Union"), difference: tr("Difference") }[op], a: solid.name, b: other.name }),
          params: { tool: "boolean of two solids (each cut exactly at its crossings with the other)", operation: op, a: solid.name, aId: solid.id, b: other.name, bId: other.id, volumeM3: Math.round(r.volumeM3), closed: r.closed, seamOpenEdges: r.boundaryEdges, components: r.components, reason: r.reason || null, generatedAt: new Date().toISOString() } });
        setMsg(report(r, name) + (r.reason === "apart" ? ` ${tr("The two solids do not touch.")}` : ""));
      } catch (e) { setMsg(tr("The operation failed: {v}", { v: e.message || e })); }
      finally { setBusy(null); }
    }, 30);
  };
  const inp = { ...smallSel, width: 0, flex: 1, minWidth: 160 };
  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div role="dialog" aria-modal="true" aria-label={tr("Solid tools")} onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 94vw)", maxHeight: "90vh", overflowY: "auto", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 16, boxShadow: "0 8px 30px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600 }}>{tr("Solid tools: {name}", { name: solid.name })}</div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        {!me && <div style={warn}>{tr("This surface's mesh is not in the view.")}</div>}
        {meClosed && !meClosed.closed && <div style={warn}>{tr("\"{name}\" is not closed ({n} open edges): a clip can still cut it, but it has no inside, so it cannot be combined with another solid and its result has no volume to trust.", { name: solid.name, n: meClosed.boundaryEdges })}</div>}
        <div style={{ fontWeight: 600, marginTop: 8 }}>{tr("Clip by a surface")}</div>
        <div style={note}>{tr("Keep the part of the solid on one side of a surface: a body cut at the ground, an ore solid trimmed at a fault or a contact. The cut is exact at the crossings; the surface inside the solid becomes the cap.")}</div>
        <div style={row}>
          <select value={cutterId} onChange={(e) => setCutterId(e.target.value)} style={inp} aria-label={tr("Surface to clip by")}>
            {hasTerrain && <option value="terrain">{tr("the terrain")}</option>}
            {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            {!hasTerrain && !others.length && <option value="">{tr("— no surface to clip by —")}</option>}
          </select>
          <select value={keep} onChange={(e) => setKeep(e.target.value)} style={{ ...smallSel, width: 150 }} aria-label={tr("Side to keep")}><option value="positive">{tr("keep {side}", { side: sideLabel("positive") })}</option><option value="negative">{tr("keep {side}", { side: sideLabel("negative") })}</option></select>
          <button onClick={runClip} disabled={!me || !cutterMesh || !!busy} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "4px 10px", opacity: !me || !cutterMesh || busy ? 0.5 : 1 }}>{busy === "clip" ? tr("Cutting…") : tr("Clip")}</button>
        </div>
        {cutterId === "terrain" && cutterMesh && <div style={note}>{tr("The terrain is sampled on a {n}-point grid over the solid's extent.", { n: cutterMesh.sampled.toLocaleString() })}</div>}
        <div style={{ fontWeight: 600, marginTop: 14 }}>{tr("Combine with another solid")}</div>
        <div style={note}>{tr("The common volume (ore inside a stope shape), the union (two lenses as one domain) or the difference (a vein with a dyke taken out), each as a new solid with its volume. Both must be closed.")}</div>
        <div style={row}>
          <select value={op} onChange={(e) => setOp(e.target.value)} style={{ ...smallSel, width: 170 }} aria-label={tr("Operation")}><option value="intersection">{tr("intersection (common volume)")}</option><option value="union">{tr("union")}</option><option value="difference">{tr("difference (this minus the other)")}</option></select>
          <select value={otherId} onChange={(e) => setOtherId(e.target.value)} style={inp} aria-label={tr("The other solid")}>
            {!others.length && <option value="">{tr("— no other surface —")}</option>}
            {others.map((s) => <option key={s.id} value={s.id}>{s.name}{s.closure === "closed" ? "" : tr(" (not closed)")}</option>)}
          </select>
          <button onClick={runBoolean} disabled={!me || !other || !!busy || (meClosed && !meClosed.closed)} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "4px 10px", opacity: !me || !other || busy || (meClosed && !meClosed.closed) ? 0.5 : 1 }}>{busy === "bool" ? tr("Combining…") : tr("Combine")}</button>
        </div>
        {msg && <div style={{ ...note, marginTop: 10, color: "var(--color-text)" }}>{msg}</div>}
        <div style={{ ...note, marginTop: 10 }}>{tr("The result is a new surface in Generated surfaces; the inputs are not changed. A grade-tonnage inside it (Block models › Grade-tonnage) needs it closed.")}</div>
      </div>
    </div>
  );
}
