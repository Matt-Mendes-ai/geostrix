// TASKS.csv #599 — the Modelling codes pane (3D Modelling tab). The code list (colour, role, pile order),
import { roleIsAssumed } from "../lib/layers.js"; // TASKS.csv #2537
import { iconAction } from "../lib/a11y.js"; // TASKS.csv #687
// optional auto-numbering of alternating flows, and the interval picked in the 3D view: its code can be
// changed, or it can be connected to an interval in another hole (both get the same code; a tie line is
// drawn). The picking itself lives in ViewerModule (the 3D scene); this pane only edits `modellingCodes`.
// Logic is in lib/modellingCodes.js (tested); nothing here decides a contact.
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { gradeUnitLabel } from "../lib/geochem.js"; // TASKS.csv #2634
import { placeRuns, fitSheetAttitude, refineSheetAttitude, attitudeNormal, correlateSheets, sheetAssign } from "../lib/sheetCorrelation.js"; // TASKS.csv #2625 / #2635
import { Crosshair, Waypoints, X, RotateCcw, Layers3, Square } from "./icons.js";
import { CODE_ROLES, codesInUse, autoNumber, inheritNumberedRoles, effectiveCode, rowKey, codedRuns } from "../lib/modellingCodes.js";
import { orderFromHoles } from "../lib/pileTops.js"; // TASKS.csv #2926
import { colorForLithology, LAYER_META } from "../lib/layers.js";
import { findOnTrace } from "../lib/viewer/modelHelpers.js";
import { combineSelection, intervalTouchesBox, holesOf, rowsBetween, codeRowsAs, holesWithRepeats, rowsOfCode, replaceCodeWith, uncodeRows, holeCounts } from "../lib/intervalBox.js"; // TASKS.csv #1333, #1337
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

// TASKS.csv #2722 — sheet n's colour in the preview: ten distinct hues in turn, so neighbouring sheets never share one
const SHEET_COLOURS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#42d4f4", "#f032e6", "#9a6324", "#808000", "#000075"];
export const sheetColour = (n) => SHEET_COLOURS[(Math.max(1, n) - 1) % SHEET_COLOURS.length];

// colorOf(row) -> a colour per row (TASKS.csv #2722: the previewed sheets, each in its own); none = the selection's yellow
function selectionOverlay(rows, traces, colorOf = null) {
  const byHole = new Map(traces.map((t) => [t.hole_id, t])), segs = [], cols = [];
  rows.forEach((r) => {
    const t = byHole.get(r.hole_id);
    if (!t) return;
    const from = Number(r.from), to = Number(r.to);
    let a = findOnTrace(t.pts, from);
    const col = colorOf ? new THREE.Color(colorOf(r)) : null;
    for (let i = 1; a && i <= 4; i++) { const b = findOnTrace(t.pts, from + ((to - from) * i) / 4); if (b) { segs.push([a, b]); cols.push(col); a = b; } }
  });
  const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: colorOf ? "#ffffff" : "#ffd400", transparent: true, opacity: colorOf ? 0.85 : 0.55, depthWrite: false, depthTest: false }), segs.length);
  const radius = (LAYER_META.litho?.radius || 2.2) * 1.8, up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), m = new THREE.Matrix4();
  segs.forEach(([a, b], i) => {
    d.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = d.length();
    q.setFromUnitVectors(up, len > 1e-6 ? d.divideScalar(len) : up);
    mesh.setMatrixAt(i, m.compose(p.set(a.x, a.y, a.z), q, s.set(radius, Math.max(len, 1e-3), radius)));
    if (cols[i]) mesh.setColorAt(i, cols[i]);
  });
  mesh.renderOrder = 9;
  mesh.frustumCulled = false;
  // zoomed out a tube is thinner than a pixel, and a voxel model can hide it: a line keeps a selection in sight at any scale
  const lineGeo = new THREE.BufferGeometry().setFromPoints(segs.flatMap(([a, b]) => [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]));
  if (colorOf) lineGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols.flatMap((c) => [c.r, c.g, c.b, c.r, c.g, c.b]), 3));
  const line = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: colorOf ? "#ffffff" : "#ffd400", vertexColors: !!colorOf, depthTest: false, transparent: true }));
  line.renderOrder = 10;
  line.frustumCulled = false;
  const group = new THREE.Group();
  group.name = "modellingCodesBoxSelection";
  group.add(mesh, line);
  return group;
}

// TASKS.csv #2054 (review #2013, Woodjam) — focus "correlate": the hole-to-hole tools only (pick / connect, auto-number, sheet correlation), for the
// Correlation pane, which held only a Fence launcher; the codes list and closed bodies stay in Modelling codes
export default function ModellingCodesPane({ focus = null, inArea = null, litho, modellingCodes, setModellingCodes, groupOf, defaultRole, pickMode, setPickMode, selected, setSelected, connectFrom, setConnectFrom, askPrompt, pBtn, unitBody, setUnitBody, inputStyle, view, onBuildBody, assayElements = [] /* #2634 */, positionAt = null /* #2625 */ }) {
  const mc = modellingCodes || { codes: [], assign: {}, ties: [] };
  const codes = useMemo(() => codesInUse(litho, mc, groupOf, defaultRole), [litho, mc, groupOf, defaultRole]);
  // TASKS.csv #3148 — the coded runs depend on the per-interval overrides only (not on the codes' order, roles or colours), so a reorder
  // ('Use the order from the holes', the arrows) no longer re-derives them from 150,000 rows; the counts and the order from the holes share them
  const assignOnly = mc.assign;
  const runsAll = useMemo(() => codedRuns(litho, { assign: assignOnly }, groupOf), [litho, assignOnly, groupOf]);
  const counts = useMemo(() => {
    const m = new Map();
    runsAll.forEach((run) => m.set(run.code, (m.get(run.code) || 0) + 1));
    return m;
  }, [runsAll]);
  const loggedCodes = useMemo(() => [...new Set((litho || []).map((r) => String(r.value ?? "").trim()).filter(Boolean))].sort(), [litho]);
  const [numberCodes, setNumberCodes] = useState([]);
  const overrides = Object.keys(mc.assign || {}).length;

  // TASKS.csv #1333 — drag a box in the 3D view: every drawn interval it touches is selected, at any depth, so a unit hidden
  // in the legend is left out. Held here, not in the project: the codes they are given are what is saved.
  const [boxOn, setBoxOn] = useState(false);
  const [boxRows, setBoxRows] = useState([]);
  const [fillBetween, setFillBetween] = useState(false);
  const [boxResult, setBoxResult] = useState(null);
  const [boxConflict, setBoxConflict] = useState(null); // #1337 — the chosen code already holds other intervals: replace or add
  const [bodyCode, setBodyCode] = useState(""); // TASKS.csv #1340
  const [numberMsg, setNumberMsg] = useState(""); // TASKS.csv #2533
  // TASKS.csv #2625 / #2635 — sheets correlated between holes along an attitude (fitted to the runs, or typed); gap blank = the median run
  const [sheetAtt, setSheetAtt] = useState({ mode: "fitted", dip: "", dipDir: "", gap: "" });
  const [sheetMsg, setSheetMsg] = useState("");
  // TASKS.csv #2537 — a role no rule gave (no name, notes or group rule) and the geologist has not set
  const assumedRole = (name) => !(mc?.codes || []).some((x) => x.name === name && x.role) && !(groupOf && groupOf(name)) && roleIsAssumed(name);
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
        setBoxConflict(null);
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
  const boxSelection = () => (fillBetween ? [...boxRows, ...between] : boxRows);
  const codeBoxRows = (code, replace = false) => {
    const rows = boxSelection(), apply = (m) => (replace ? replaceCodeWith(m, rows, code) : codeRowsAs(m, rows, code));
    const next = apply(mc), all = rowsOfCode(litho, next, code, groupOf);
    setModellingCodes((p) => apply(p || mc));
    setBoxResult({ code, n: rows.length, holes: holesOf(rows), repeats: holesWithRepeats(litho, next, code, groupOf), total: all.length, totalHoles: holesOf(all) });
    setBoxRows([]);
    setBoxConflict(null);
  };
  // #1337 — coding into a code that holds other intervals is a choice, not a silent merge
  const chooseBoxCode = (code) => {
    const keys = new Set(boxSelection().map(rowKey)), others = rowsOfCode(litho, mc, code, groupOf).filter((r) => !keys.has(rowKey(r)));
    if (others.length) setBoxConflict({ code, others: others.length, holes: holesOf(others) });
    else codeBoxRows(code);
  };
  const uncodeBoxRows = () => {
    const rows = boxSelection();
    setModellingCodes((p) => uncodeRows(p || mc, rows));
    setBoxResult({ cleared: true, n: rows.length, holes: holesOf(rows) });
    setBoxRows([]);
    setBoxConflict(null);
  };
  const showCode = (code) => { setBoxRows(rowsOfCode(litho, mc, code, groupOf)); setBoxResult(null); setBoxConflict(null); };
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
  // TASKS.csv #2926 (review #2876, WA iron) — 34 codes listed alphabetically under 'youngest at the top': the order the holes give, one click
  // away (the codes they do not place keep theirs, after the placed ones). Computed when asked: a pass over the whole log.
  const [holesNote, setHolesNote] = useState(null);
  const applyHolesOrder = () => {
    const names = codes.map((c) => c.name);
    const runs = runsAll.map((r) => ({ hole_id: r.hole_id, from: r.from, value: r.code })); // #3148
    const r = orderFromHoles(runs, names);
    if (!r.placed) { setHolesNote(tr("The holes do not place any of these codes against another (too few holes log two of them).")); return; }
    setModellingCodes((p) => {
      const list = [...(p?.codes || [])];
      r.order.forEach((n, k) => { const at = list.findIndex((c) => c.name === n); if (at < 0) list.push({ name: n, order: k + 1 }); else list[at] = { ...list[at], order: k + 1 }; });
      return { ...(p || mc), codes: list };
    });
    setHolesNote(r.conflicts.length ? tr("Put in the order the holes give, youngest first ({n} pair(s) were the other way up).", { n: r.conflicts.length }) : tr("Already in the order the holes give."));
  };
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
  // TASKS.csv #2722 — the matched sheets drawn in 3D before the codes are written; a change of codes or attitude drops the preview
  const [sheetPreview, setSheetPreview] = useState(null);
  useEffect(() => { setSheetPreview(null); }, [numberCodes, sheetAtt, litho]);
  useEffect(() => {
    const scene = view?.scene.current;
    if (!scene || !sheetPreview?.length) return undefined;
    const overlay = selectionOverlay(sheetPreview, view.traces.current, (q) => sheetColour(q.sheet));
    overlay.name = "modellingCodesSheetPreview";
    scene.add(overlay);
    view.activity.current = Date.now();
    return () => { scene.remove(overlay); overlay.children.forEach((o) => { o.geometry.dispose(); o.material.dispose(); o.dispose?.(); }); view.activity.current = Date.now(); };
  }, [sheetPreview, view]);
  const selCode = selected ? effectiveCode(selected, mc, groupOf) : null;

  // TASKS.csv #2625 / #2635 — the sheets matched along the attitude; #2722 — computed apart from the button so the matched sheets can be
  // drawn in 3D before any code is written. -> { rows, assign, msgs, preview: [{ hole_id, from, to, sheet, code }] }
  const computeSheets = () => {
          const rows = inArea ? litho.filter((r) => inArea(r.hole_id)) : litho; // the Model area, as Auto-number (#2533)
          const plain = { ...mc, assign: {} };
          const all = codedRuns(rows, plain, groupOf);
          const keys = new Set(rows.filter((r) => numberCodes.includes(String(r.value))).map(rowKey)); // one pass, as Auto-number
          const msgs = [], preview = []; let assign = Object.fromEntries(Object.entries(mc.assign || {}).filter(([k]) => !keys.has(k)));
          for (const base of numberCodes) {
            const placed = placeRuns(all.filter((run) => run.code === base), positionAt);
            if (placed.length < 2) { msgs.push(tr("{code}: fewer than two runs could be placed in 3D.", { code: base })); continue; }
            const fit0 = sheetAtt.mode === "fitted" ? fitSheetAttitude(placed) : null;
            if (sheetAtt.mode === "fitted" && !fit0) { msgs.push(tr("{code}: the runs do not define a plane (too few, or along one line of holes): type an attitude.", { code: base })); continue; }
            const lens0 = placed.map((q) => q.run.to - q.run.from).sort((a, b) => a - b), gap0 = Number(sheetAtt.gap) > 0 ? Number(sheetAtt.gap) : lens0[lens0.length >> 1];
            const fit = fit0 ? refineSheetAttitude(placed, fit0, gap0) : null; // the swarm's own plane, not one plane through every sheet
            const att = fit || { dip: Number(sheetAtt.dip), dipDirection: Number(sheetAtt.dipDir) };
            const lens = placed.map((q) => q.run.to - q.run.from).sort((a, b) => a - b), med = lens[lens.length >> 1];
            const gap = Number(sheetAtt.gap) > 0 ? Number(sheetAtt.gap) : med;
            const res = correlateSheets(placed, fit ? fit.normal : attitudeNormal(att.dip, att.dipDirection), gap);
            for (const sh of res.sheets) for (const run of sh.runs) preview.push({ hole_id: run.hole_id, from: run.from, to: run.to, sheet: sh.n, code: base }); // #2722
            assign = sheetAssign(res.sheets, base, rowKey, assign);
            msgs.push(tr("{code}: {runs} run(s) in {h} hole(s) matched into {s} sheet(s) along {dip}° → {dd}° ({how}), {g} m gap.", { code: base, runs: placed.length, h: new Set(placed.map((q) => q.run.hole_id)).size, s: res.sheets.length, dip: Math.round(att.dip), dd: Math.round(att.dipDirection), how: fit ? tr("fitted to the runs") : tr("typed"), g: +gap.toFixed(1) })
              + (res.twice ? " " + tr("{n} time(s) a hole cuts one sheet twice: lower the gap, or the sheets are not parallel here.", { n: res.twice }) : ""));
          }
          return { rows, assign, msgs, preview };
  };
  return (
    <div style={{ fontSize: "var(--font-size-sm)" }}>
      {focus === "correlate" ? <div style={{ ...small, marginBottom: 8 }}>{tr("Hole-to-hole correlation: pick an interval and connect it to the same unit in the next hole, number alternating flows, or match a swarm of sheets between holes. The codes, their order and roles, and closed bodies are in Modelling codes.")}</div> /* TASKS.csv #2054 */ : (
        <div style={{ ...small, marginBottom: 8 }}>{tr("Each logged interval has a")}{" "}<b>{tr("modelling code")}</b>{tr(": its logged code (or lithology group) unless you change it. Give alternating flows their own codes (DAC1, AND1, DAC2…) and connect them between holes. Contacts are taken where the code changes down-hole, and only below a younger stratigraphic unit — never below casing, an intrusion, a gap or at a hole start. Codes you create appear in the Implicit surface and Strat. stack pickers.")}</div>
      )}

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
          {/* #1337 — a box selects through the whole depth of the view: every hole is named, and can be left out */}
          <div style={{ ...small, display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4, maxHeight: 96, overflowY: "auto" }}>
            {holeCounts(boxRows).map(([h, n]) => (
              <span key={h} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "0 4px", border: "1px solid var(--color-border)", borderRadius: 4 }}>{h} ({n})<X size={10} style={{ cursor: "pointer" }} {...iconAction(() => { setBoxRows((p) => p.filter((r) => r.hole_id !== h)); setBoxConflict(null); }, tr("Leave hole {h} out of the selection", { h }))} /></span>
            ))}
          </div>
          {between.length > 0 && <label style={{ ...small, display: "flex", gap: 4, alignItems: "center", marginTop: 4, cursor: "pointer" }}><input type="checkbox" checked={fillBetween} onChange={(e) => setFillBetween(e.target.checked)} />{tr("Also include the {n} interval(s) between them in each hole", { n: between.length })}</label>}
          <select value="" onChange={(e) => { if (e.target.value === "__new") askPrompt("New modelling code:", String(boxRows[0].value), (n) => { if (n && n.trim()) chooseBoxCode(n.trim()); }); else if (e.target.value === "__logged") uncodeBoxRows(); else if (e.target.value) chooseBoxCode(e.target.value); }} style={{ ...inputStyle, width: "100%", marginTop: 5 }} aria-label={tr("Modelling code of the selected intervals")}>
            <option value="">{tr("Give them a code…")}</option>
            <option value="__new">{tr("New code…")}</option>
            <option value="__logged">{tr("Back to the logged code (or its group)")}</option>
            {codes.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          {boxConflict && (
            <div style={{ ...small, marginTop: 5 }}>
              {tr("{code} already holds {others} other interval(s) in {holes} hole(s).", boxConflict)}
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <button onClick={() => codeBoxRows(boxConflict.code, true)} style={{ ...pBtn, marginBottom: 0 }}>{tr("Replace them")}</button>
                <button onClick={() => codeBoxRows(boxConflict.code)} style={{ ...pBtn, marginBottom: 0 }}>{tr("Add to them")}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {boxResult?.cleared && (
        <div style={{ marginTop: 6, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
          <b>{tr("{n} interval(s) in {holes} hole(s) are back to their logged code.", boxResult)}</b>
        </div>
      )}
      {boxResult && !boxResult.cleared && (
        <div style={{ marginTop: 6, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
          <b>{tr("{n} interval(s) in {holes} hole(s) are now {code}.", boxResult)}</b>
          {boxResult.total > boxResult.n && <div style={{ ...small, marginTop: 3 }}>{tr("{code} now holds {total} interval(s) in {totalHoles} hole(s) in all.", boxResult)}</div>}
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

      {/* TASKS.csv #1340 — a rock unit's body is built here, with its own settings, not from the Alteration pane. #1339 — the threshold, not the search, joins bodies. */}
      {focus !== "correlate" && onBuildBody && unitBody && (<>
        <div className="ge-section-label" style={{ marginTop: 12 }}>{tr("Closed body of a unit")}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <select value={bodyCode} onChange={(e) => setBodyCode(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }} aria-label={tr("Modelling code of the closed body")}>
            <option value="">{tr("Choose a code…")}</option>
            {codes.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }} title={tr("How much of the nearby samples' weight must be inside the unit for a point to count as inside it. 0.5 stops about halfway to the nearest other interval. Lower values join separate bodies and grow the volume past what was logged.")}>{tr("Inside at")}
            <select value={unitBody.iso} onChange={(e) => setUnitBody((b) => ({ ...b, iso: Number(e.target.value) }))} style={inputStyle} aria-label={tr("Threshold of the closed body")}>
              {[0.5, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>{tr("Search (m)")}<input type="number" min={0} step={50} value={unitBody.search || ""} placeholder={tr("auto")} onChange={(e) => setUnitBody((b) => ({ ...b, search: Math.max(0, Number(e.target.value) || 0) }))} style={{ ...inputStyle, width: 64 }} /></label>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>{tr("Cell size (m)")}<input type="number" min={0} step={5} value={unitBody.cell || ""} placeholder={tr("auto")} onChange={(e) => setUnitBody((b) => ({ ...b, cell: Math.max(0, Number(e.target.value) || 0) }))} style={{ ...inputStyle, width: 64 }} /></label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><input type="checkbox" checked={unitBody.largest} onChange={(e) => setUnitBody((b) => ({ ...b, largest: e.target.checked }))} />{tr("Keep only the largest body")}</label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }} title={tr("Drilled metres with no rock code (and holes with no log) count as outside the unit instead of unknown: right for grade-control holes logged only where the unit is")}><input type="checkbox" checked={!!unitBody.unloggedOutside} onChange={(e) => setUnitBody((b) => ({ ...b, unloggedOutside: e.target.checked }))} />{tr("Treat unlogged metres as outside")}</label>{/* #2531 */}
        </div>
        {assayElements.length > 0 && ( /* TASKS.csv #2634 — where the log is blank, an assay cut-off decides (no default cut-off: the user types it) */
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }} title={tr("Where a hole has no rock code but is assayed for this element, the assay decides: at or above the cut-off is inside the unit, below it outside. The blank metres with no assay follow the box above. Leave the element empty to read the log only.")}>
            <span>{tr("Blank log read from an assay")}</span>
            <select value={unitBody.assaySymbol || ""} onChange={(e) => setUnitBody((b) => ({ ...b, assaySymbol: e.target.value }))} style={inputStyle} aria-label={tr("Element that decides where the log is blank")}>
              <option value="">{tr("none")}</option>
              {assayElements.map((el) => <option key={el.symbol} value={el.symbol}>{el.symbol}</option>)}
            </select>
            {unitBody.assaySymbol && (<label style={{ display: "flex", alignItems: "center", gap: 4 }}>{tr("at or above ({unit})", { unit: gradeUnitLabel(unitBody.assaySymbol, (assayElements.find((el) => el.symbol === unitBody.assaySymbol) || {}).unit) })}
              <input type="number" min={0} step="any" value={unitBody.assayCutoff ?? ""} placeholder={tr("cut-off")} onChange={(e) => setUnitBody((b) => ({ ...b, assayCutoff: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) }))} style={{ ...inputStyle, width: 70 }} aria-label={tr("Cut-off where the log is blank")} /></label>)}
          </div>
        )}
        <div style={{ ...small, marginTop: 3 }}>{tr("Inside: the code's intervals. Outside: every other logged lithology interval (and, when ticked, the unlogged metres). It follows the geology trend in Model settings. A lower Inside at joins separate bodies; a larger search rarely does.")}</div>
        <button onClick={() => onBuildBody(bodyCode)} disabled={!bodyCode} style={{ ...pBtn, marginTop: 5, marginBottom: 0, opacity: bodyCode ? 1 : 0.5 }}><Layers3 size={14} /> {bodyCode ? tr("Build a closed body from {code}", { code: bodyCode }) : tr("Build a closed body")}</button>
      </>)}

      {focus !== "correlate" && (<>{/* #2054 */}
      <div className="ge-section-label" style={{ marginTop: 12 }}>{tr("Codes (youngest at the top)")}</div>
      <div style={small}>{tr("Order sets which unit is younger where two meet; a code you haven't placed keeps the order of the stack you run.")}</div>
      {codes.length > 1 && <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 }}>{/* #2926 */}
        <button type="button" onClick={applyHolesOrder} title={tr("Down each hole the unit that starts higher is the younger; counted over the holes that log both, pair by pair (the Strat. stack's own check).")} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "2px 7px" }}>{tr("Use the order from the holes")}</button>
        {holesNote && <span role="status" style={small}>{holesNote}</span>}
      </div>}
      <div style={small}>{tr("Roles are suggested from each code's name and, when the import kept a notes column, from what its intervals say (dyke, lost core, monzonite ...). A code nothing recognises is assumed stratigraphic: check the roles before modelling.")}</div>{/* #2046 */}
      {codes.map((c, i) => (
        <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
          <input type="color" value={c.color || colorForLithology(c.name)} onChange={(e) => setCode(c.name, { color: e.target.value })} aria-label={tr("Colour of {name}", { name: c.name })} style={{ width: 22, height: 20, padding: 0, border: "none", background: "none" }} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }} title={tr("{v} interval run(s)", { v: counts.get(c.name) || 0 })}>{c.name} <span style={small}>({counts.get(c.name) || 0})</span></span>
          <button onClick={() => showCode(c.name)} title={tr("Show the intervals of {name}", { name: c.name })} aria-label={tr("Show the intervals of {name}", { name: c.name })} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "2px 4px" }}><Square size={11} /></button>
          <select value={c.role} onChange={(e) => setCode(c.name, { role: e.target.value })} title={assumedRole(c.name) ? tr("Not recognized: assumed stratigraphic. Check it before modelling.") : tr(ROLE_HELP[c.role])} aria-label={tr("Role of {name}", { name: c.name })} style={{ ...inputStyle, width: 104, flex: "none", ...(assumedRole(c.name) ? { color: "var(--color-text-muted)", fontStyle: "italic" } : {}) }}>{/* #2537 — an assumed role looks assumed */}
            {CODE_ROLES.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
          </select>
          <button onClick={() => moveCode(c.name, -1)} disabled={i === 0} aria-label={tr("Move {name} up (younger)", { name: c.name })} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 5px" }}>▲</button>
          <button onClick={() => moveCode(c.name, 1)} disabled={i === codes.length - 1} aria-label={tr("Move {name} down (older)", { name: c.name })} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 5px" }}>▼</button>
        </div>
      ))}
      </>)}

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
        // TASKS.csv #2533 (review #2486) — Auto-number re-coded 3,870 intervals in all 2,248 holes, not the 30 checked ones, and said nothing:
        // it follows the Model area (the holes checked, when it says so) and says what it did
        const rows = inArea ? litho.filter((r) => inArea(r.hole_id)) : litho;
        const keys = new Set(rows.filter((r) => numberCodes.includes(String(r.value))).map(rowKey));
        const go = () => setModellingCodes((p) => { const base = p || mc; const assign = autoNumber(rows, numberCodes, { ...base, assign: Object.fromEntries(Object.entries(p?.assign || {}).filter(([k]) => !keys.has(k))) }, groupOf); return { ...base, assign, codes: inheritNumberedRoles(base, assign, numberCodes) /* #2532 — P1 ... take P's role */ }; });
        const touched = rows.filter((r) => numberCodes.includes(String(r.value)) && mc.assign?.[rowKey(r)]).length;
        if (touched && !window.confirm(tr("{touched} of these intervals already have a code you set. Auto-numbering replaces them. Continue?", { touched }))) return;
        go();
        setNumberMsg(tr("Numbered {n} interval(s) of {codes} in {h} hole(s){area}.", { n: keys.size.toLocaleString(), codes: numberCodes.join(", "), h: new Set(rows.filter((r) => keys.has(rowKey(r))).map((r) => r.hole_id)).size.toLocaleString(), area: inArea ? tr(" (the holes checked: Model area)") : "" })); // #2533
      }} style={{ ...pBtn, marginTop: 6, opacity: numberCodes.length ? 1 : 0.5 }}>{tr("Auto-number {v}", { v: numberCodes.join(", ") || "…" })}</button>
      {numberMsg && <div role="status" style={{ ...small, marginTop: 3 }}>{numberMsg}</div>}{/* #2533 */}
      {positionAt && (<>{/* TASKS.csv #2625 / #2635 — a sheet swarm: the runs matched between holes along an attitude, not counted per hole */}
        <div className="ge-section-label" style={{ marginTop: 10 }}>{tr("Correlate sheets between holes (optional)")}</div>
        <div style={small}>{tr("For a swarm of parallel sheets (pegmatites, dykes, stacked reefs): the runs of each code ticked above are matched between holes along an attitude instead of counted per hole, and numbered from the top (P → P1, P2…), so the Vein tool can model each sheet. Sheets that split or cross need connecting by hand.")}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
          <select value={sheetAtt.mode} onChange={(e) => setSheetAtt((a) => ({ ...a, mode: e.target.value }))} style={inputStyle} aria-label={tr("Attitude of the sheets")}>
            <option value="fitted">{tr("Attitude fitted to the runs")}</option>
            <option value="typed">{tr("Attitude I type")}</option>
          </select>
          {sheetAtt.mode === "typed" && (<>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>{tr("Dip")}<input type="number" min={0} max={90} step="any" value={sheetAtt.dip} onChange={(e) => setSheetAtt((a) => ({ ...a, dip: e.target.value }))} style={{ ...inputStyle, width: 56 }} aria-label={tr("Dip of the sheets")} /></label>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>{tr("Dip direction")}<input type="number" min={0} max={360} step="any" value={sheetAtt.dipDir} onChange={(e) => setSheetAtt((a) => ({ ...a, dipDir: e.target.value }))} style={{ ...inputStyle, width: 60 }} aria-label={tr("Dip direction of the sheets")} /></label>
          </>)}
          <label style={{ display: "flex", alignItems: "center", gap: 4 }} title={tr("The largest distance across the sheets between two runs of one sheet. Blank = the median logged run of the code.")}>{tr("Gap (m)")}<input type="number" min={0} step="any" value={sheetAtt.gap} placeholder={tr("auto")} onChange={(e) => setSheetAtt((a) => ({ ...a, gap: e.target.value }))} style={{ ...inputStyle, width: 56 }} aria-label={tr("Gap between sheets (m)")} /></label>
        </div>
        <button disabled={!numberCodes.length || (sheetAtt.mode === "typed" && !(sheetAtt.dip !== "" && sheetAtt.dipDir !== ""))} onClick={() => {
          const { rows, assign, msgs } = computeSheets(); // #2722 — the same matching the preview shows
          const touched = rows.filter((r) => numberCodes.includes(String(r.value)) && mc.assign?.[rowKey(r)]).length;
          if (touched && !window.confirm(tr("{touched} of these intervals already have a code you set. Auto-numbering replaces them. Continue?", { touched }))) return;
          setModellingCodes((p) => { const base = p || mc; return { ...base, assign, codes: inheritNumberedRoles(base, assign, numberCodes) }; });
          setSheetMsg(msgs.join(" ")); setSheetPreview(null);
        }} style={{ ...pBtn, marginTop: 6, opacity: numberCodes.length ? 1 : 0.5 }}>{tr("Correlate {v} into sheets", { v: numberCodes.join(", ") || "…" })}</button>
        {view && <button aria-pressed={!!sheetPreview} disabled={!numberCodes.length || (sheetAtt.mode === "typed" && !(sheetAtt.dip !== "" && sheetAtt.dipDir !== ""))} onClick={() => {
          if (sheetPreview) { setSheetPreview(null); return; }
          const r = computeSheets();
          setSheetPreview(r.preview); setSheetMsg(r.msgs.join(" "));
        }} style={{ ...pBtn, marginTop: 4, opacity: numberCodes.length ? 1 : 0.5, background: sheetPreview ? "var(--color-selected-bg)" : undefined }}
          title={tr("Draws the runs matched into each sheet in its own colour on the holes, without writing any code: a wrong match can be seen, and the gap or the attitude changed, first.")}>{sheetPreview ? tr("Previewing the sheets in 3D (click to stop)") : tr("Preview the sheets in 3D")}</button>}{/* #2722 */}
        {sheetPreview && sheetPreview.length > 0 && <div style={{ ...small, display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>{[...new Map(sheetPreview.map((q) => [`${q.code}${q.sheet}`, q])).values()].map((q) => <span key={`${q.code}${q.sheet}`} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: sheetColour(q.sheet) }} />{`${q.code}${q.sheet}`}</span>)}</div>}
        {sheetMsg && <div role="status" style={{ ...small, marginTop: 3 }}>{sheetMsg}</div>}
      </>)}

      <div style={{ ...small, marginTop: 10 }}>
        {tr("{overrides} interval(s) with a code you set · {n} connection(s) drawn.", { overrides, n: (mc.ties || []).length })}{overrides > 0 && <> <span style={{ textDecoration: "underline", cursor: "pointer" }} {...iconAction(() => { if (window.confirm(tr("Reset all {overrides} interval code(s) to their logged codes and remove the connections? (Undo can bring them back.)", { overrides }))) setModellingCodes((p) => ({ ...(p || mc), assign: {}, ties: [] })); }, tr("Reset all interval codes"))}>{tr("Reset all")}</span></>}
      </div>
    </div>
  );
}
