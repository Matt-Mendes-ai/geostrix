// TASKS.csv #4006 — the Faults pane's own builder: a fault surface from EVERY kind of fault evidence (the other fault tools each read one kind).
// Each kind is ticked and counted; each item (a structure, a logged code, a mapped or drawn line, a section string) goes to a named fault or is
// left out; one fault or several. A fault with no measured orientation takes a plane fitted through its points, or the dip you give. The
// extent: through the model box, a finite fault (its evidence plus a margin), or until another fault. Solved by the same implicit route as
// Structures (GemPy), one surface a fault; then the model check (its points the surface misses by more than N m) and Use in the stack.
import React, { useEffect, useMemo, useState } from "react";
import { t as tr } from "../../lib/i18n.js";
import { requestModuleAction } from "../../lib/menuRequests.js";
import { useStore } from "../../lib/store.jsx";
import { smallSel } from "../../lib/sidebarStyles.js";
import NumberInput from "../../components/NumberInput.jsx";
import { faultSpec } from "../../lib/faultEvidence.js";
import { gatherFaultEvidence, keepInsideWorld, downDipReach } from "./faultGather.js";
import { buildMeshQuery, closestPointOnMesh } from "../../lib/meshQuery.js";
import { colorForStructure } from "../../lib/layers.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const warn = { ...note, color: "var(--color-warn-text)" };
const KINDS = ["pick", "logged", "outcrop", "mapped", "drawn", "string"];
const kindName = (k) => ({ pick: tr("Oriented fault picks"), logged: tr("Logged fault intervals"), outcrop: tr("Outcrop fault measurements"), mapped: tr("Mapped fault lines"), drawn: tr("Drawn fault lines"), string: tr("Section fault strings") })[k];
const MAX_FAULTS = 6;
const LINE_KINDS = new Set(["mapped", "drawn", "string"]);
const rad = (d) => (d * Math.PI) / 180;
// "{n} point" / "{n} points" etc.: each form its own key
const count = (n, what) => ({
  point: n === 1 ? tr("{n} point", { n }) : tr("{n} points", { n }),
  orientation: n === 1 ? tr("{n} orientation", { n }) : tr("{n} orientations", { n }),
  item: n === 1 ? tr("{n} item", { n }) : tr("{n} items", { n }),
})[what];

// the plane of a fault for its extent, through the points' centre: the mean of its measured orientations when it has any (points from a
// map trace lie along the ground, and a plane fitted through them follows the topography, not the fault), else the plane fitted through them
function planeOf(spec) {
  const os = spec.orientations || [];
  if (!os.length && spec.plane && !spec.plane.flat) return spec.plane;
  const pts = spec.points, n = pts.length || 1;
  const c = pts.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n, z: a.z + p.z / n }), { x: 0, y: 0, z: 0 });
  const m = os.reduce((a, q) => [a[0] + Math.sin(rad(q.dip)) * Math.sin(rad(q.azimuth)), a[1] + Math.sin(rad(q.dip)) * Math.cos(rad(q.azimuth)), a[2] + Math.cos(rad(q.dip))], [0, 0, 0]);
  const l = Math.hypot(m[0], m[1], m[2]) || 1; // upward normals, so they add without cancelling
  return { centroid: c, normal: [m[0] / l, m[1] / l, m[2] / l] };
}

export default function FaultBuilder(props) {
  const { pBtn, tracesRef, tracesSeq, mapLayers, sections, terrain, surfaceStructures, originRef, implicitSurfaces, runStructuralModel, implicitBusy, setStackFaults, stackFaults } = props;
  const { layers = {}, generatedSurfaces = [] } = useStore() || {};
  const items = useMemo(() => gatherFaultEvidence({ traces: tracesRef?.current || [], layers, surfaceStructures, mapLayers, sections, terrain }), [tracesSeq, tracesRef, layers, surfaceStructures, mapLayers, sections, terrain]); // tracesSeq: the traces' version (tracesRef is a ref)
  const [off, setOff] = useState({}); // kind -> true: not used
  const [assign, setAssign] = useState({}); // item id -> fault index (0..), or -1: left out; unset: fault 0
  const [names, setNames] = useState([tr("Fault {n}", { n: 1 })]);
  const [dips, setDips] = useState({}); // fault index -> { dip, dipDir } for a fault with no orientation
  const [extent, setExtent] = useState("box");
  const [marginM, setMarginM] = useState(200);
  const [until, setUntil] = useState("");
  const [said, setSaid] = useState([]);
  const [checkN, setCheckN] = useState(10);
  const [checks, setChecks] = useState({}); // surface id -> { n, over }
  useEffect(() => { if (names.length > MAX_FAULTS) setNames((p) => p.slice(0, MAX_FAULTS)); }, [names.length]);

  const byKind = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, items.filter((it) => it.kind === k)])), [items]);
  // unset: Fault 1, except lines when there are several of a kind (each mapped or drawn line, or section string, is likely its own fault:
  // lumping a map's faults into one surface would be wrong), which start left out for you to give each its fault
  const faultOf = (it) => (off[it.kind] ? -1 : assign[it.id] ?? (LINE_KINDS.has(it.kind) && byKind[it.kind].length > 1 ? -1 : 0));
  const faults = names.map((name, i) => {
    const its = items.filter((it) => faultOf(it) === i);
    const d = dips[i] || {};
    return { i, name, items: its, spec: its.length ? faultSpec(its, { dip: d.dip ?? null, dipDir: d.dipDir ?? null }) : null };
  });
  const faultSurfaces = (implicitSurfaces || []).filter((s) => s.type === "fault");
  const built = (generatedSurfaces || []).filter((s) => s.params?.faultEvidence);

  const build = () => {
    const o = originRef?.current || { x: 0, y: 0, z: 0 }, msgs = [], specs = [];
    const other = extent === "until" ? (generatedSurfaces || []).find((s) => s.id === until) : null;
    if (extent === "until" && !other) msgs.push(tr("Choose the fault the new faults end at."));
    for (const f of faults) {
      if (!f.spec) continue;
      if (!f.spec.ok) { msgs.push(f.spec.why === "no-orientation" ? tr("{name}: its points lie along one line, which fits no plane; give it a dip and a dip direction.", { name: f.name }) : tr("{name}: no point of its evidence could be placed.", { name: f.name })); continue; }
      if (extent === "until" && !other) continue;
      const plane = planeOf(f.spec);
      const keepInside = keepInsideWorld({ extent, points: f.spec.points, plane, marginM, other: other ? { positions: other.vertices, indices: other.indices } : null });
      const kinds = {}; for (const it of f.items) kinds[it.kind] = (kinds[it.kind] || 0) + 1;
      const deep = f.items.some((it) => it.holes) ? null : downDipReach(f.spec.points, plane, extent === "finite" ? marginM : 0); // no holes: the box reaches down dip
      specs.push({
        label: `Fault: ${f.name}`, meshName: f.name, color: colorForStructure("FLT"), type: "fault", needsHoles: f.items.some((it) => it.kind === "pick" || it.kind === "logged"),
        points: f.spec.points.map((p) => ({ x: p.x - o.x, y: p.y - o.y, z: p.z - o.z })),
        orientations: f.spec.orientations.map((q) => ({ x: q.x - o.x, y: q.y - o.y, z: q.z - o.z, dip: q.dip, azimuth: q.azimuth })),
        keepInside,
        ...(deep ? { boxPts: [{ x: deep.x - o.x, y: deep.y - o.y, z: deep.z - o.z }] } : {}),
        params: { faultEvidence: { kinds, items: f.items.map((it) => it.name).slice(0, 30), extent, ...(extent === "finite" ? { marginM } : {}), ...(other ? { endsAt: other.name } : {}), guess: f.spec.guess, ...(f.spec.said.some((x) => x.key === "fitted") ? { orientationFitted: true } : {}) } },
      });
    }
    setSaid(msgs);
    if (specs.length) runStructuralModel?.(null, { faultSpecs: specs });
  };

  // the model check: how many of a built fault's points it misses by more than N m (world positions and the inputs kept on it)
  const check = (s) => {
    const q = buildMeshQuery(s.vertices, s.indices), pts = s.params?.inputs?.points || [];
    let over = 0, n = 0;
    for (const [x, y, z] of pts) { const near = q ? closestPointOnMesh(q, { x, y, z }) : null; if (!near) continue; n++; if (near.distance > checkN) over++; }
    setChecks((p) => ({ ...p, [s.id]: { n, over, at: checkN } }));
  };
  const addToStack = (s) => {
    const k = `surf|${s.id}`;
    setStackFaults?.((p) => (p.includes(k) || p.length >= 6 ? p : [...p, k]));
    requestModuleAction("open-pane", { pane: "stack" });
  };

  const small = { ...pBtn, width: "auto", display: "inline-flex", marginBottom: 0, padding: "2px 8px" };
  const nOk = faults.filter((f) => f.spec?.ok).length;
  return (
    <div data-fault-builder="" style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", marginTop: 8 }}>
      <div style={{ fontWeight: 600 }}>{tr("Build a fault from all the evidence")}</div>
      <div style={note}>{tr("Every kind of fault evidence at once; each item goes to a fault you name, or is left out.")}</div>
      {!items.length && <div style={{ ...note, marginTop: 4 }}>{tr("No fault evidence yet: fault picks, logged fault intervals, mapped or drawn fault lines, or fault strings on a section.")}</div>}
      {KINDS.filter((k) => byKind[k].length).map((k) => (
        <div key={k} data-fault-kind={k} style={{ marginTop: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 500 }}>
            <input type="checkbox" checked={!off[k]} onChange={(e) => setOff((p) => ({ ...p, [k]: !e.target.checked }))} />
            {kindName(k)} <span style={note}>{byKind[k].length}</span>
          </label>
          {!off[k] && LINE_KINDS.has(k) && byKind[k].length > 1 && <div style={{ ...note, paddingLeft: 18 }}>{tr("Each line is likely its own fault: they start left out; give each line its fault.")}</div>}
          {!off[k] && <div style={{ maxHeight: 140, overflowY: "auto", paddingLeft: 18 }}>
            {byKind[k].map((it) => (
              <div key={it.id} data-fault-item={it.id} style={{ display: "flex", alignItems: "center", gap: 6, ...note, color: "var(--color-text-secondary)" }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.name}>
                  {it.name} · {it.points.length === 1 ? tr("{n} point", { n: 1 }) : tr("{n} points", { n: it.points.length })}{it.orientations.length ? ` · ${tr("{n} with a dip", { n: it.orientations.length })}` : ""}{it.dipSource === "default" ? ` · ${tr("dip {d}° (the type's default)", { d: it.orientations[0]?.dip })}` : ""}{it.level != null ? ` · ${tr("RL {z} m", { z: it.level })}` : ""}
                </span>
                <select value={faultOf(it)} onChange={(e) => { const v = Number(e.target.value); if (v === names.length) setNames((p) => [...p, tr("Fault {n}", { n: p.length + 1 })]); setAssign((p) => ({ ...p, [it.id]: v })); }} style={{ ...smallSel, flex: "0 0 auto", maxWidth: 110 }} aria-label={tr("The fault {item} belongs to", { item: it.name })}>
                  {names.map((n, i) => <option key={i} value={i}>{n}</option>)}
                  {names.length < MAX_FAULTS && <option value={names.length}>{tr("New fault")}</option>}
                  <option value={-1}>{tr("Leave out")}</option>
                </select>
              </div>
            ))}
          </div>}
        </div>
      ))}
      {items.length > 0 && faults.filter((f) => f.items.length).map((f) => (
        <div key={f.i} data-fault={f.i} style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid var(--color-divider)" }}>
          <input value={f.name} onChange={(e) => setNames((p) => p.map((x, i) => (i === f.i ? e.target.value : x)))} aria-label={tr("Fault name")} style={{ ...smallSel, width: "100%", fontWeight: 500 }} />
          {f.spec?.ok && <div style={note}>{tr("{points} and {orientations} from {items}.", { points: count(f.spec.points.length, "point"), orientations: count(f.spec.orientations.length, "orientation"), items: count(f.items.length, "item") })}{f.spec.said.some((x) => x.key === "fitted") ? ` ${tr("No measured dip: a plane through the points, dipping {dip}° towards {dir}°.", { dip: Math.round(f.spec.plane.dip), dir: Math.round(f.spec.plane.dipDir) })}` : ""}</div>}
          {f.spec && !f.spec.ok && f.spec.why === "no-orientation" && <div style={warn}>{tr("Its points lie along one line, which fits no plane: give it a dip and a dip direction.")}</div>}
          {f.spec && (!f.spec.ok || f.spec.said.some((x) => x.key === "user-dip")) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, ...note }}>
              {tr("Dip")} <NumberInput value={dips[f.i]?.dip ?? null} allowEmpty min={0} max={90} onChange={(v) => setDips((p) => ({ ...p, [f.i]: { ...(p[f.i] || {}), dip: v } }))} aria-label={tr("Dip")} style={{ width: 48 }} />
              {tr("towards")} <NumberInput value={dips[f.i]?.dipDir ?? null} allowEmpty min={0} max={360} onChange={(v) => setDips((p) => ({ ...p, [f.i]: { ...(p[f.i] || {}), dipDir: v } }))} aria-label={tr("Dip direction")} style={{ width: 52 }} />°
            </div>
          )}
          {f.spec?.guess && <div style={warn}>{tr("A guess: few points, or one hole's picks only. Check it against the logs and sections before you use it.")}</div>}
        </div>
      ))}
      {nOk > 0 && <>
        <label style={{ display: "block", marginTop: 8, ...note }}>{tr("Extent")}
          <select value={extent} onChange={(e) => setExtent(e.target.value)} style={{ ...smallSel, display: "block", width: "100%", marginTop: 2 }} aria-label={tr("Extent")}>
            <option value="box">{tr("Through the model box")}</option>
            <option value="finite">{tr("A finite fault: its evidence plus a margin")}</option>
            <option value="until" disabled={!faultSurfaces.length}>{tr("Until another fault")}</option>
          </select>
        </label>
        {extent === "finite" && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, ...note }}>{tr("Margin")} <NumberInput value={marginM} min={0} onChange={(v) => setMarginM(v ?? 0)} aria-label={tr("Margin (m)")} style={{ width: 60 }} /> m</div>}
        {extent === "until" && <select value={until} onChange={(e) => setUntil(e.target.value)} style={{ ...smallSel, width: "100%", marginTop: 3 }} aria-label={tr("The fault it ends at")}>
          <option value="">{tr("Choose a fault surface…")}</option>
          {faultSurfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>}
        <div style={{ ...note, marginTop: 3 }}>{extent === "box" ? tr("Through the model box, the surface runs past its evidence: there it is extrapolated, not observed.") : extent === "finite" ? tr("The surface stops at an ellipse around its evidence plus the margin, in the fault's plane; down dip it reaches at least half its length along strike.") : tr("The surface stops at the other fault, on the side its evidence is on.")}</div>
        <button type="button" style={{ ...pBtn, marginTop: 6 }} disabled={implicitBusy} onClick={build}>{nOk === 1 ? tr("Build the fault surface") : tr("Build {n} fault surfaces", { n: nOk })}</button>
      </>}
      {said.map((m) => <div key={m} style={warn}>{m}</div>)}
      {built.length > 0 && (
        <div data-fault-built="" style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid var(--color-divider)" }}>
          <div style={{ fontWeight: 500 }}>{tr("Built here")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, ...note }}>{tr("Check: points missed by more than")} <NumberInput value={checkN} min={0} onChange={(v) => setCheckN(v ?? 10)} aria-label={tr("Distance (m)")} style={{ width: 48 }} /> m</div>
          {built.map((s) => {
            const fit = s.params?.contactFit, c = checks[s.id], inStack = (stackFaults || []).includes(`surf|${s.id}`);
            return (
              <div key={s.id} data-fault-surface={s.id} style={{ padding: "3px 0" }}>
                <div style={{ fontWeight: 500 }}>{s.name}{s.params.faultEvidence.guess ? <span style={{ ...warn, marginLeft: 6 }}>{tr("a guess")}</span> : null}</div>
                {fit && <div style={note}>{tr("Misses its {points} by {t} m typically, {w} m at worst.", { points: count(fit.points, "point"), t: fit.typicalMissM, w: fit.worstMissM })}</div>}
                {c && <div style={c.over ? warn : note}>{tr("{over} of its {points} are more than {m} m from the surface.", { over: c.over, points: count(c.n, "point"), m: c.at })}</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                  <button type="button" style={small} onClick={() => check(s)}>{tr("Check")}</button>
                  <button type="button" style={small} disabled={inStack} onClick={() => addToStack(s)} title={tr("Strat. stack: the units are offset across it, solved with the stack. In the stack a fault runs through the whole model box.")}>{inStack ? tr("In the stack") : tr("Use in the stack")}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
