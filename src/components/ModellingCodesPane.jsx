// TASKS.csv #599 — the Modelling codes pane (3D Modelling tab). The code list (colour, role, pile order),
import { iconAction } from "../lib/a11y.js"; // TASKS.csv #687
// optional auto-numbering of alternating flows, and the interval picked in the 3D view: its code can be
// changed, or it can be connected to an interval in another hole (both get the same code; a tie line is
// drawn). The picking itself lives in ViewerModule (the 3D scene); this pane only edits `modellingCodes`.
// Logic is in lib/modellingCodes.js (tested); nothing here decides a contact.
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Crosshair, Waypoints, X, RotateCcw, Layers3, Square } from "./icons.js";
import { CODE_ROLES, codesInUse, autoNumber, effectiveCode, rowKey, codedRuns } from "../lib/modellingCodes.js";
import { colorForLithology, LAYER_META } from "../lib/layers.js";
import { findOnTrace } from "../lib/viewer/modelHelpers.js";
import { combineSelection, intervalTouchesBox, holesOf, rowsBetween, codeRowsAs, holesWithRepeats } from "../lib/intervalBox.js"; // TASKS.csv #1333
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

const ROLE_HELP = {
  stratigraphic: "a layer in the pile: its top is a contact where it sits below a younger layer",
  intrusion: "intrudes the pile: what sits directly below it is not given a top there",
  "cross-cutting": "fault / dyke / breccia: kept out of the stratigraphic stack",
  overburden: "casing / overburden: the rock below it is not given a top there",
  ignore: "not modelled; the rock below it is not given a top there",
};

// #1333 — the drawn lithology intervals touched by a box in screen pixels: a mesh that is hidden, or in a hidden layer, is not drawn
function intervalsInBox(view, box, rect) {
  const group = view.groups.current?.litho, cam = view.camera.current;
  if (!group || group.visible === false || !cam) return [];
  const traces = new Map(view.traces.current.map((t) => [t.hole_id, t])), v = new THREE.Vector3(), seen = new Set(), out = [];
  const screen = (p) => { v.set(p.x, p.y, p.z).project(cam); return v.z > 1 ? null : [(v.x + 1) / 2 * rect.width, (1 - v.y) / 2 * rect.height]; };
  group.children.forEach((m) => {
    const row = m.userData?.lithoRow, t = row && m.visible !== false && traces.get(row.hole_id);
    if (!t || seen.has(rowKey(row))) return;
    const from = Number(row.from), to = Number(row.to), pts = [];
    for (let i = 0; i <= 4; i++) { const p = findOnTrace(t.pts, from + ((to - from) * i) / 4); pts.push(p ? screen(p) : null); }
    if (intervalTouchesBox(pts, box)) { seen.add(rowKey(row)); out.push(row); }
  });
  return out;
}

function selectionOverlay(rows, traces) {
  const byHole = new Map(traces.map((t) => [t.hole_id, t])), segs = [];
  rows.forEach((r) => {
    const t = byHole.get(r.hole_id);
    if (!t) return;
    const from = Number(r.from), to = Number(r.to);
    let a = findOnTrace(t.pts, from);
    for (let i = 1; a && i <= 4; i++) { const b = findOnTrace(t.pts, from + ((to - from) * i) / 4); if (b) { segs.push([a, b]); a = b; } }
  });
  const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: "#ffd400", transparent: true, opacity: 0.55, depthWrite: false, depthTest: false }), segs.length);
  const radius = (LAYER_META.litho?.radius || 2.2) * 1.8, up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), m = new THREE.Matrix4();
  segs.forEach(([a, b], i) => {
    d.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = d.length();
    q.setFromUnitVectors(up, len > 1e-6 ? d.divideScalar(len) : up);
    mesh.setMatrixAt(i, m.compose(p.set(a.x, a.y, a.z), q, s.set(radius, Math.max(len, 1e-3), radius)));
  });
  mesh.renderOrder = 9;
  mesh.frustumCulled = false;
  // zoomed out a tube is thinner than a pixel, and a voxel model can hide it: a line keeps a selection in sight at any scale
  const lineGeo = new THREE.BufferGeometry().setFromPoints(segs.flatMap(([a, b]) => [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]));
  const line = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: "#ffd400", depthTest: false, transparent: true }));
  line.renderOrder = 10;
  line.frustumCulled = false;
  const group = new THREE.Group();
  group.name = "modellingCodesBoxSelection";
  group.add(mesh, line);
  return group;
}

export default function ModellingCodesPane({ litho, modellingCodes, setModellingCodes, groupOf, defaultRole, pickMode, setPickMode, selected, setSelected, connectFrom, setConnectFrom, askPrompt, pBtn, inputStyle, view, onBuildBody }) {
  const mc = modellingCodes || { codes: [], assign: {}, ties: [] };
  const codes = useMemo(() => codesInUse(litho, mc, groupOf, defaultRole), [litho, mc, groupOf, defaultRole]);
  const counts = useMemo(() => {
    const m = new Map();
    codedRuns(litho, mc, groupOf).forEach((run) => m.set(run.code, (m.get(run.code) || 0) + 1));
    return m;
  }, [litho, mc, groupOf]);
  const loggedCodes = useMemo(() => [...new Set((litho || []).map((r) => String(r.value ?? "").trim()).filter(Boolean))].sort(), [litho]);
  const [numberCodes, setNumberCodes] = useState([]);
  const overrides = Object.keys(mc.assign || {}).length;

  // TASKS.csv #1333 — drag a box in the 3D view: every drawn interval it touches is selected, at any depth, so a unit hidden
  // in the legend is left out. Held here, not in the project: the codes they are given are what is saved.
  const [boxOn, setBoxOn] = useState(false);
  const [boxRows, setBoxRows] = useState([]);
  const [fillBetween, setFillBetween] = useState(false);
  const [boxResult, setBoxResult] = useState(null);
  const between = useMemo(() => (boxRows.length ? rowsBetween(litho, boxRows) : []), [litho, boxRows]);
  const boxRowsRef = useRef(boxRows);
  boxRowsRef.current = boxRows;
  useEffect(() => {
    const dom = view?.renderer.current?.domElement;
    if (!boxOn || !dom) return undefined;
    const prevCursor = dom.style.cursor;
    dom.style.cursor = "crosshair";
    view.dragHook.current = (e, mx, my) => {
      const mode = e.shiftKey ? "add" : e.ctrlKey ? "remove" : "replace";
      const band = document.createElement("div");
      band.style.cssText = "position:fixed;border:1px dashed #ffd400;background:rgba(255,212,0,0.12);pointer-events:none;z-index:50";
      document.body.appendChild(band);
      const rect = dom.getBoundingClientRect();
      const boxOf = (ev) => { const x = ev.clientX - rect.left, y = ev.clientY - rect.top; return { x0: Math.min(mx, x), x1: Math.max(mx, x), y0: Math.min(my, y), y1: Math.max(my, y) }; };
      const onMove = (ev) => { const b = boxOf(ev); band.style.left = `${rect.left + b.x0}px`; band.style.top = `${rect.top + b.y0}px`; band.style.width = `${b.x1 - b.x0}px`; band.style.height = `${b.y1 - b.y0}px`; };
      const onUp = (ev) => {
        dom.removeEventListener("pointermove", onMove);
        dom.removeEventListener("pointerup", onUp);
        dom.removeEventListener("pointercancel", onUp);
        try { dom.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        band.remove();
        const b = boxOf(ev);
        if (ev.type === "pointercancel" || (b.x1 - b.x0 < 4 && b.y1 - b.y0 < 4)) return;
        setBoxRows(combineSelection(boxRowsRef.current, intervalsInBox(view, b, rect), mode));
        setBoxResult(null);
      };
      dom.setPointerCapture(e.pointerId);
      dom.addEventListener("pointermove", onMove);
      dom.addEventListener("pointerup", onUp);
      dom.addEventListener("pointercancel", onUp);
      return true;
    };
    // Escape stops the box and keeps the selection: it reaches this first, or the 3D view's Escape would close the pane with it
    const onKey = (e) => {
      if (e.key !== "Escape" || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || document.querySelector("[role=dialog], [aria-modal=true]")) return;
      e.stopImmediatePropagation();
      setBoxOn(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => { view.dragHook.current = null; dom.style.cursor = prevCursor; window.removeEventListener("keydown", onKey, true); };
  }, [boxOn, view]);
  // the selected intervals, highlighted along their traces: one draw call however many there are
  useEffect(() => {
    const scene = view?.scene.current;
    if (!scene || !boxRows.length) return undefined;
    const overlay = selectionOverlay(boxRows, view.traces.current);
    scene.add(overlay);
    view.activity.current = Date.now();
    return () => { scene.remove(overlay); overlay.children.forEach((o) => { o.geometry.dispose(); o.material.dispose(); o.dispose?.(); }); view.activity.current = Date.now(); };
  }, [boxRows, view]);
  const codeBoxRows = (code) => {
    const rows = fillBetween ? [...boxRows, ...between] : boxRows;
    const next = codeRowsAs(mc, rows, code);
    setModellingCodes((p) => codeRowsAs(p || mc, rows, code));
    setBoxResult({ code, n: rows.length, holes: holesOf(rows), repeats: holesWithRepeats(litho, next, code, groupOf) });
    setBoxRows([]);
  };
  const boxBreakdown = useMemo(() => {
    const m = new Map();
    boxRows.forEach((r) => m.set(r.value, (m.get(r.value) || 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v, n]) => `${v} ${n}`).join(" · ");
  }, [boxRows]);

  const setCode = (name, patch) => setModellingCodes((p) => {
    const list = [...(p?.codes || [])];
    const i = list.findIndex((c) => c.name === name);
    if (i < 0) list.push({ name, ...patch }); else list[i] = { ...list[i], ...patch };
    return { ...(p || mc), codes: list };
  });
  const moveCode = (name, dir) => { // pile order: place every listed code, then swap two neighbours
    const names = codes.map((c) => c.name);
    const i = names.indexOf(name), j = i + dir;
    if (i < 0 || j < 0 || j >= names.length) return;
    [names[i], names[j]] = [names[j], names[i]];
    setModellingCodes((p) => {
      const list = [...(p?.codes || [])];
      names.forEach((n, k) => { const at = list.findIndex((c) => c.name === n); if (at < 0) list.push({ name: n, order: k + 1 }); else list[at] = { ...list[at], order: k + 1 }; });
      return { ...(p || mc), codes: list };
    });
  };
  const assignSelected = (code) => {
    if (!selected) return;
    const run = codedRuns(litho.filter((r) => r.hole_id === selected.hole_id), mc, groupOf).find((x) => x.rows.some((r) => rowKey(r) === rowKey(selected)));
    setModellingCodes((p) => {
      const assign = { ...(p?.assign || {}) };
      (run ? run.rows : [selected]).forEach((r) => { if (code == null) delete assign[rowKey(r)]; else assign[rowKey(r)] = code; });
      const list = p?.codes || [];
      return { ...(p || mc), assign, codes: code == null || list.some((c) => c.name === code) ? list : [...list, { name: code }] };
    });
  };
  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  const selCode = selected ? effectiveCode(selected, mc, groupOf) : null;

  return (
    <div style={{ fontSize: "var(--font-size-sm)" }}>
      <div style={{ ...small, marginBottom: 8 }}>{tr("Each logged interval has a")}{" "}<b>{tr("modelling code")}</b>{tr(": its logged code (or lithology group) unless you change it. Give alternating flows their own codes (DAC1, AND1, DAC2…) and connect them between holes. Contacts are taken where the code changes down-hole, and only below a younger stratigraphic unit — never below casing, an intrusion, a gap or at a hole start. Codes you create appear in the Implicit surface and Strat. stack pickers.")}</div>

      <div className="ge-section-label">{tr("Pick intervals in the 3D view")}</div>
      <button onClick={() => { setBoxOn(false); setPickMode(!pickMode); setConnectFrom(null); }} aria-pressed={pickMode} style={{ ...pBtn, marginTop: 4, background: pickMode ? "var(--color-selected-bg)" : undefined }}>
        <Crosshair size={14} /> {pickMode ? tr("Picking: click an interval on a hole (click again to stop)") : tr("Pick an interval")}
      </button>
      <button onClick={() => { setPickMode(false); setConnectFrom(null); setBoxOn(!boxOn); }} aria-pressed={boxOn} style={{ ...pBtn, marginTop: 4, background: boxOn ? "var(--color-selected-bg)" : undefined }}>
        <Square size={14} /> {boxOn ? tr("Drag a box in the 3D view. Shift adds, Ctrl removes (click here to stop)") : tr("Select intervals with a box")}
      </button>
      {boxOn && !boxRows.length && !boxResult && <div style={{ ...small, marginTop: 4 }}>{tr("Every drawn interval the box touches is selected, at any depth. Hide units in the legend first to leave them out. Right-drag still moves the view.")}</div>}
      {boxRows.length > 0 && (
        <div style={{ marginTop: 6, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b>{tr("{n} interval(s) in {holes} hole(s)", { n: boxRows.length, holes: holesOf(boxRows) })}</b>
            <X size={14} style={{ cursor: "pointer" }} {...iconAction(() => setBoxRows([]), tr("Clear selection"))} />
          </div>
          <div style={small}>{boxBreakdown}</div>
          {between.length > 0 && <label style={{ ...small, display: "flex", gap: 4, alignItems: "center", marginTop: 4, cursor: "pointer" }}><input type="checkbox" checked={fillBetween} onChange={(e) => setFillBetween(e.target.checked)} />{tr("Also include the {n} interval(s) between them in each hole", { n: between.length })}</label>}
          <select value="" onChange={(e) => { if (e.target.value === "__new") askPrompt("New modelling code:", String(boxRows[0].value), (n) => { if (n && n.trim()) codeBoxRows(n.trim()); }); else if (e.target.value) codeBoxRows(e.target.value); }} style={{ ...inputStyle, width: "100%", marginTop: 5 }} aria-label={tr("Modelling code of the selected intervals")}>
            <option value="">{tr("Give them a code…")}</option>
            <option value="__new">{tr("New code…")}</option>
            {codes.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      )}
      {boxResult && (
        <div style={{ marginTop: 6, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
          <b>{tr("{n} interval(s) in {holes} hole(s) are now {code}.", boxResult)}</b>
          {boxResult.repeats > 0 && <div style={{ ...small, marginTop: 3 }}>{tr("{repeats} hole(s) have {code} in more than one separate run. A closed body treats them as one unit; an implicit surface would use the top of every run.", boxResult)}</div>}
          {onBuildBody && <button onClick={() => onBuildBody(boxResult.code)} style={{ ...pBtn, marginTop: 5, marginBottom: 0 }}><Layers3 size={14} /> {tr("Build a closed body from {code}", boxResult)}</button>}
        </div>
      )}
      {selected && (
        <div style={{ marginTop: 6, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b>{selected.hole_id} · {Number(selected.from).toFixed(1)}–{Number(selected.to).toFixed(1)} m</b>
            <X size={14} style={{ cursor: "pointer" }} {...iconAction(() => { setSelected(null); setConnectFrom(null); }, tr("Clear selection"))} />
          </div>
          <div style={small}>{tr("Logged as")}{" "}<b>{selected.value}</b>{" "}{tr("· modelling code")}{" "}<b>{selCode}</b>{mc.assign?.[rowKey(selected)] ? tr(" (set by you)") : tr(" (default)")}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
            <select value={selCode} onChange={(e) => (e.target.value === "__new" ? askPrompt("New modelling code:", `${selected.value}1`, (n) => { if (n && n.trim()) assignSelected(n.trim()); }) : assignSelected(e.target.value))} style={{ ...inputStyle, flex: 1, minWidth: 0 }} aria-label={tr("Modelling code of the selected interval")}>
              {codes.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              <option value="__new">{tr("New code…")}</option>
            </select>
            <button onClick={() => assignSelected(null)} title={tr("Back to the logged code (or its group)")} aria-label={tr("Reset to the logged code")} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 6px" }}><RotateCcw size={12} /></button>
          </div>
          <button onClick={() => { setBoxOn(false); setConnectFrom(connectFrom ? null : selected); setPickMode(true); }} style={{ ...pBtn, marginTop: 5, marginBottom: 0, background: connectFrom ? "var(--color-selected-bg)" : undefined }}>
            <Waypoints size={14} /> {connectFrom ? tr("Click the matching interval in another hole (gets {selCode})…", { selCode }) : tr("Connect to an interval in another hole")}
          </button>
        </div>
      )}

      <div className="ge-section-label" style={{ marginTop: 12 }}>{tr("Codes (youngest at the top)")}</div>
      <div style={small}>{tr("Order sets which unit is younger where two meet; a code you haven't placed keeps the order of the stack you run.")}</div>
      {codes.map((c, i) => (
        <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
          <input type="color" value={c.color || colorForLithology(c.name)} onChange={(e) => setCode(c.name, { color: e.target.value })} aria-label={tr("Colour of {name}", { name: c.name })} style={{ width: 22, height: 20, padding: 0, border: "none", background: "none" }} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }} title={tr("{v} interval run(s)", { v: counts.get(c.name) || 0 })}>{c.name} <span style={small}>({counts.get(c.name) || 0})</span></span>
          <select value={c.role} onChange={(e) => setCode(c.name, { role: e.target.value })} title={tr(ROLE_HELP[c.role])} aria-label={tr("Role of {name}", { name: c.name })} style={{ ...inputStyle, width: 104, flex: "none" }}>
            {CODE_ROLES.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
          </select>
          <button onClick={() => moveCode(c.name, -1)} disabled={i === 0} aria-label={tr("Move {name} up (younger)", { name: c.name })} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 5px" }}>▲</button>
          <button onClick={() => moveCode(c.name, 1)} disabled={i === codes.length - 1} aria-label={tr("Move {name} down (older)", { name: c.name })} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 5px" }}>▼</button>
        </div>
      ))}

      <div className="ge-section-label" style={{ marginTop: 12 }}>{tr("Auto-number alternations (optional)")}</div>
      <div style={small}>{tr("Numbers each repeated logged unit top-down in every hole (DAC → DAC1, DAC2…) as a starting point. The numbers are per hole, so a flow that pinches out needs fixing by connecting intervals.")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
        {loggedCodes.map((c) => (
          <label key={c} style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
            <input type="checkbox" checked={numberCodes.includes(c)} onChange={(e) => setNumberCodes((p) => (e.target.checked ? [...p, c] : p.filter((x) => x !== c)))} />{c}
          </label>
        ))}
      </div>
      <button disabled={!numberCodes.length} onClick={() => {
        const go = () => setModellingCodes((p) => ({ ...(p || mc), assign: autoNumber(litho, numberCodes, { ...(p || mc), assign: Object.fromEntries(Object.entries(p?.assign || {}).filter(([k]) => !litho.some((r) => rowKey(r) === k && numberCodes.includes(String(r.value))))) }, groupOf) }));
        const touched = litho.filter((r) => numberCodes.includes(String(r.value)) && mc.assign?.[rowKey(r)]).length;
        if (touched && !window.confirm(tr("{touched} of these intervals already have a code you set. Auto-numbering replaces them. Continue?", { touched }))) return;
        go();
      }} style={{ ...pBtn, marginTop: 6, opacity: numberCodes.length ? 1 : 0.5 }}>{tr("Auto-number {v}", { v: numberCodes.join(", ") || "…" })}</button>

      <div style={{ ...small, marginTop: 10 }}>
        {tr("{overrides} interval(s) with a code you set · {n} connection(s) drawn.", { overrides, n: (mc.ties || []).length })}{overrides > 0 && <> <span style={{ textDecoration: "underline", cursor: "pointer" }} {...iconAction(() => { if (window.confirm(tr("Reset all {overrides} interval code(s) to their logged codes and remove the connections? (Undo can bring them back.)", { overrides }))) setModellingCodes((p) => ({ ...(p || mc), assign: {}, ties: [] })); }, tr("Reset all interval codes"))}>{tr("Reset all")}</span></>}
      </div>
    </div>
  );
}
