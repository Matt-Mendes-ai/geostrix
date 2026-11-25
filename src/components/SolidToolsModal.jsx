// TASKS.csv #1950 / #1951 (Vulcan workflow review) — CLIP a closed solid by a surface (the terrain, a contact, a fault, any
// generated surface) keeping one side, and COMBINE two closed solids (intersection, union, difference). Maths in
// lib/solidBoolean.js; the result is a new generated surface with its volume, its closure stated honestly (the seam of a cut
// is two edge loops on the same curve, see the lib's header), never a change to the inputs.
// TASKS.csv #4073 — on the shared StepDialog: 1 Tool (clip or combine, the one the data allows chosen), 2 Setup (the surface or the
// other solid, pre-filled), 3 Result (the new surface's volume, closure and pieces as numbers). The explanations are in the Help card.
import React, { useMemo, useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { clipSolidBySurface, solidBoolean, terrainPatchMesh, meanNormalZ, meshBounds } from "../lib/solidBoolean.js";
import { isMeshClosed } from "../lib/meshQuery.js";
import { smallSel } from "../lib/sidebarStyles.js";
import StepDialog, { stepDialogStyles } from "./StepDialog.jsx"; // TASKS.csv #4073
import { StepNumbers } from "./StepPane.jsx";

const { note, label, warn } = stepDialogStyles;
const big = (v) => Math.round(v).toLocaleString();

// solid: { id, name }; surfaces: every generated surface; meshOf(id) -> { positions, indices } in world E, N, Z or null;
// groundAt(x, y) -> elevation or NaN (null without a terrain); onAdd(spec) -> id (the same spec addUndrilledSolid takes)
export default function SolidToolsModal({ solid, surfaces = [], meshOf, groundAt = null, hasTerrain = false, onAdd, onClose }) {
  const others = useMemo(() => surfaces.filter((s) => s.id !== solid.id), [surfaces, solid.id]);
  const [cutterId, setCutterId] = useState(hasTerrain ? "terrain" : others[0]?.id || "");
  const [keep, setKeep] = useState("positive");
  const [otherId, setOtherId] = useState(others.find((s) => s.closure === "closed")?.id || "");
  const [op, setOp] = useState("intersection");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null); // why nothing was added (said under the Setup step)
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null); // { name, volumeM3, closed, boundaryEdges, components, notes }
  const me = useMemo(() => meshOf(solid.id), [meshOf, solid.id]);
  const meClosed = useMemo(() => (me ? isMeshClosed(me.positions, me.indices) : null), [me]);
  const canCombine = !(meClosed && !meClosed.closed) && others.some((s) => s.closure === "closed");
  const [tool, setTool] = useState(() => (hasTerrain || others.length || !canCombine ? "clip" : "combine")); // #4073 — pre-filled: what the data allows
  const [step, setStep] = useState(0);
  const cutterMesh = useMemo(() => {
    if (cutterId === "terrain") { if (!groundAt || !me) return null; return terrainPatchMesh(groundAt, meshBounds(me.positions, 0.05 * Math.max(1, Math.hypot(meshBounds(me.positions).x1 - meshBounds(me.positions).x0, meshBounds(me.positions).y1 - meshBounds(me.positions).y0)))); }
    return cutterId ? meshOf(cutterId) : null;
  }, [cutterId, groundAt, me, meshOf]);
  const cutterName = cutterId === "terrain" ? tr("the terrain") : others.find((s) => s.id === cutterId)?.name || "";
  const faces = cutterMesh ? meanNormalZ(cutterMesh.positions, cutterMesh.indices) : 0; // +1: its positive side is above
  const sideLabel = (side) => (faces === 0 ? (side === "positive" ? tr("the side the surface faces") : tr("the other side")) : (side === "positive") === (faces > 0) ? tr("above it") : tr("below it"));
  const taken = new Set(surfaces.map((s) => s.name));
  const unique = (base) => { let name = base; for (let k = 2; taken.has(name); k++) name = `${base} (${k})`; return name; };
  const finish = (r, name, notes) => { setDone({ name, volumeM3: r.volumeM3, closed: r.closed, boundaryEdges: r.boundaryEdges, components: r.components, notes: notes.filter(Boolean) }); setStep(2); };
  const runClip = () => {
    if (!me || !cutterMesh) return;
    setBusy("clip"); setMsg(null); setError(null);
    setTimeout(() => {
      try {
        const r = clipSolidBySurface(me, cutterMesh, { keep });
        if (!r.ok) { if (r.reason === "no-overlap") setMsg(tr("\"{s}\" does not reach \"{c}\": nothing to cut.", { s: solid.name, c: cutterName })); else setError(tr("The clip failed: {v}", { v: r.reason })); return; }
        if (r.empty) { setMsg(tr("Nothing of \"{s}\" lies {side} \"{c}\".", { s: solid.name, side: sideLabel(keep), c: cutterName })); return; }
        if (r.unchanged) { setMsg(tr("All of \"{s}\" already lies {side} \"{c}\": nothing was cut, so nothing was added.", { s: solid.name, side: sideLabel(keep), c: cutterName })); return; }
        const name = unique(tr("{s} {side} {c}", { s: solid.name, side: sideLabel(keep), c: cutterName }));
        onAdd({ name, positions: r.positions, indices: r.indices, volumeM3: r.volumeM3, type: "clipped_solid", closure: r.closed ? "closed" : "open", color: "#7c4dff", tag: "clipped",
          tip: tr("{s} clipped {side} {c}", { s: solid.name, side: sideLabel(keep), c: cutterName }),
          params: { tool: "solid clipped by a surface (exact cut at the crossings; the surface inside the solid is the cap)", source: solid.name, sourceId: solid.id, cutter: cutterName, cutterId, keep: sideLabel(keep), volumeM3: Math.round(r.volumeM3), closed: r.closed, seamOpenEdges: r.boundaryEdges, components: r.components, capTriangles: r.capTriangles, unresolvedEdges: r.unresolvedEdges, generatedAt: new Date().toISOString() } });
        finish(r, name, [r.unresolvedEdges && tr("{n} edge(s) crossed the surface where it does not reach: those triangles were left whole, so the cut is approximate there.", { n: r.unresolvedEdges }),
          cutterId === "terrain" && cutterMesh.missing && tr("The terrain has no data under {n} of the {m} sample points: the solid was not cut there.", { n: cutterMesh.missing, m: cutterMesh.sampled })]);
      } catch (e) { setError(tr("The clip failed: {v}", { v: e.message || e })); }
      finally { setBusy(null); }
    }, 30);
  };
  const other = others.find((s) => s.id === otherId) || null;
  const runBoolean = () => {
    if (!me || !other) return;
    const om = meshOf(other.id); if (!om) return;
    setBusy("bool"); setMsg(null); setError(null);
    setTimeout(() => {
      try {
        const r = solidBoolean(me, om, op);
        if (!r.ok) { setError(r.reason === "cutter-not-closed" ? tr("One of the solids is not closed ({n} open edges): a boolean needs two closed solids. Solid blocks from surfaces codes a grid by units instead.", { n: r.closure?.boundaryEdges ?? "?" }) : tr("The operation failed: {v}", { v: r.reason })); return; }
        if (r.empty) { setMsg(tr("\"{a}\" and \"{b}\" share no volume.", { a: solid.name, b: other.name })); return; }
        const opText = { intersection: tr("∩"), union: tr("∪"), difference: tr("−") }[op];
        const name = unique(`${solid.name} ${opText} ${other.name}`);
        onAdd({ name, positions: r.positions, indices: r.indices, volumeM3: r.volumeM3, type: "boolean_solid", closure: r.closed ? "closed" : "open", color: "#00897b", tag: "boolean",
          tip: tr("{op} of {a} and {b}", { op: { intersection: tr("Intersection"), union: tr("Union"), difference: tr("Difference") }[op], a: solid.name, b: other.name }),
          params: { tool: "boolean of two solids (each cut exactly at its crossings with the other)", operation: op, a: solid.name, aId: solid.id, b: other.name, bId: other.id, volumeM3: Math.round(r.volumeM3), closed: r.closed, seamOpenEdges: r.boundaryEdges, components: r.components, reason: r.reason || null, generatedAt: new Date().toISOString() } });
        finish(r, name, [r.reason === "apart" && tr("The two solids do not touch.")]);
      } catch (e) { setError(tr("The operation failed: {v}", { v: e.message || e })); }
      finally { setBusy(null); }
    }, 30);
  };
  const inp = { ...smallSel, width: "100%" };
  const choice = (k, title, sub, disabled) => (
    <button key={k} type="button" data-btn-own aria-pressed={tool === k} disabled={disabled} onClick={() => { setTool(k); setMsg(null); setError(null); }}
      style={{ flex: "1 1 200px", textAlign: "start", padding: "10px 12px", borderRadius: 8, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1, background: tool === k ? "var(--color-selected-bg)" : "var(--color-bg)",
        border: `1px solid ${tool === k ? "var(--color-selected-border)" : "var(--color-border)"}`, color: "var(--color-text)", fontFamily: "inherit" }}>
      <div style={{ fontWeight: 600 }}>{title}</div><div style={note}>{sub}</div>
    </button>
  );
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-accent-dark)", marginBottom: 6, cursor: "pointer" }}>{tr("How it works")}</summary>
      <div style={note}><b>{tr("Clip")}</b> {tr("Keep the part of the solid on one side of a surface: a body cut at the ground, or ore trimmed at a fault. The surface inside the solid becomes the cap.")}</div>
      <div style={note}><b>{tr("Combine")}</b> {tr("Intersection (ore inside a stope shape), union (two lenses as one domain) or difference (a vein minus a dyke), each as a new solid with its volume. Both must be closed.")}</div>
      <div style={note}><b>{tr("Closed")}</b> {tr("A cut's seam is two loops on one curve, so a closure check can say open; the volume is exact to the cut tolerance.")}</div>
      <div style={note}>{tr("The result is a new surface in Generated surfaces; the inputs are not changed. A grade-tonnage inside it (Block models › Grade-tonnage) needs it closed.")}</div>
    </details>
  );
  const setupClip = (
    <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={label}>{tr("Surface to clip by")}</div>
      <select value={cutterId} onChange={(e) => { setCutterId(e.target.value); setMsg(null); }} style={inp} aria-label={tr("Surface to clip by")}>
        {hasTerrain && <option value="terrain">{tr("the terrain")}</option>}
        {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        {!hasTerrain && !others.length && <option value="">{tr("— no surface to clip by —")}</option>}
      </select>
      <div style={label}>{tr("Side to keep")}</div>
      <select value={keep} onChange={(e) => { setKeep(e.target.value); setMsg(null); }} style={inp} aria-label={tr("Side to keep")}><option value="positive">{tr("keep {side}", { side: sideLabel("positive") })}</option><option value="negative">{tr("keep {side}", { side: sideLabel("negative") })}</option></select>
      {cutterId === "terrain" && cutterMesh && <div style={note}>{tr("The terrain is sampled on a {n}-point grid over the solid's extent.", { n: cutterMesh.sampled.toLocaleString() })}</div>}
    </div>
  );
  const setupCombine = (
    <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={label}>{tr("Operation")}</div>
      <select value={op} onChange={(e) => { setOp(e.target.value); setMsg(null); }} style={inp} aria-label={tr("Operation")}><option value="intersection">{tr("intersection (common volume)")}</option><option value="union">{tr("union")}</option><option value="difference">{tr("difference (this minus the other)")}</option></select>
      <div style={label}>{tr("The other solid")}</div>
      <select value={otherId} onChange={(e) => { setOtherId(e.target.value); setMsg(null); }} style={inp} aria-label={tr("The other solid")}>
        {!others.length && <option value="">{tr("— no other surface —")}</option>}
        {others.map((s) => <option key={s.id} value={s.id}>{s.name}{s.closure === "closed" ? "" : tr(" (not closed)")}</option>)}
      </select>
    </div>
  );
  const clip = tool === "clip";
  const ready = clip ? !!me && !!cutterMesh : !!me && !!other && !(meClosed && !meClosed.closed);
  const steps = [
    { key: "tool", label: tr("Tool"), render: () => (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {choice("clip", tr("Clip by a surface"), tr("Keep one side of a surface."), !hasTerrain && !others.length)}
          {choice("combine", tr("Combine with another solid"), tr("Intersection, union or difference."), !canCombine)}
        </div>
        {!me && <div style={warn}>{tr("This surface's mesh is not in the view.")}</div>}
        {meClosed && !meClosed.closed && <div style={warn}>{tr("\"{name}\" is not closed ({n} open edges): it can be clipped, but not combined with another solid, and the clip has no volume to trust.", { name: solid.name, n: meClosed.boundaryEdges })}</div>}
      </div>
    ), primary: { label: tr("Next"), disabled: !me } },
    { key: "setup", label: tr("Setup"), render: () => (clip ? setupClip : setupCombine), hint: msg || "",
      primary: { label: busy ? (busy === "clip" ? tr("Cutting…") : tr("Combining…")) : clip ? tr("Clip") : tr("Combine"), onClick: clip ? runClip : runBoolean, disabled: !ready || !!busy } },
    { key: "result", label: tr("Result"), render: () => (done ? (
      <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontWeight: 600 }}>{tr("Added \"{name}\".", { name: done.name })}</div>
        <div style={{ maxWidth: 380 }}><StepNumbers rows={[{ label: tr("Volume"), value: `${big(done.volumeM3)} m³` }, { label: tr("Closed"), value: done.closed ? tr("Yes") : tr("no ({openEdgeCount} open edges)", { openEdgeCount: done.boundaryEdges }), level: done.closed ? undefined : "some" }, done.components > 1 && { label: tr("Separate bodies"), value: String(done.components) }]} /></div>
        {done.notes.map((n) => <div key={n} style={warn}>{n}</div>)}
      </div>
    ) : <div style={note}>{tr("Nothing added yet.")}</div>), primary: { label: tr("Done"), onClick: onClose } },
  ];
  const heading = tr("Solid tools: {name}", { name: solid.name }); // the dialog's name (a title= attribute would read as a tooltip to scripts/word-count.mjs)
  return <StepDialog title={heading} onClose={onClose} steps={steps} at={step} onAt={(i) => { setStep(i); if (i < 2) setDone(null); }} help={help} error={error} width="min(640px, 96vw)" />;
}
