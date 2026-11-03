// TASKS.csv #1342 — the Mine Design tab's drift, tunnel, ramp and decline linework. Draw by clicking in the 3D view (the point is
// taken on the level the line has reached, so a top view is the natural one), or type a segment. Grade and radius are what the
// next segment gets; every segment stays editable, and a change moves everything after it. Geometry in lib/designLines.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Spline, Download, X, Trash2, Plus } from "./icons.js";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { computeLine, segmentsToPoint, runAboveGround, gradeRatio, designLineRows, designLineFeatures } from "../lib/designLines.js";
import { terrainGroundAt } from "../lib/viewer/geomath.js";
import { buildDXF } from "../lib/dxf.js";
import { toExportCsv, crsCell } from "../lib/tabular.js";
import { saveFile } from "../lib/desktop.js";
import { iconAction } from "../lib/a11y.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";
import { median } from "../lib/arrayStats.js";

const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", marginTop: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const warn = { ...note, color: "var(--color-warn-text-strong)", marginTop: 4 };
const num = { ...smallSel, width: 72 };
const label = { ...note, marginTop: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 };
const COLOURS = ["#e8590c", "#1971c2", "#2f9e44", "#ae3ec9", "#f08c00", "#0c8599"];
const m1 = (v) => (Math.round(v * 10) / 10).toLocaleString();
const num0 = (s) => (s === "" || s == null || !Number.isFinite(Number(s)) ? null : Number(s));

// a number that is only taken when you leave it, so "-" and "1." can be typed on the way to -1.5
function Cell({ value, onCommit, width = 54, ariaLabel, placeholder }) {
  return <input type="number" step="any" key={String(value)} defaultValue={value ?? ""} placeholder={placeholder} aria-label={ariaLabel} style={{ ...smallSel, width }}
    onBlur={(e) => { const v = num0(e.target.value); if (v !== (value ?? null)) onCommit(v); }} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />;
}

// view: { scene, camera, renderer, activity, dragHook, origin } (refs)
export default function DesignLinesPane({ view, onClose }) {
  const { designLines = [], setDesignLines, collars = [], terrain, project } = useStore();
  const [activeId, setActiveId] = useState(() => designLines[designLines.length - 1]?.id ?? null);
  const [grade, setGrade] = useState("0");
  const [radius, setRadius] = useState("");
  const [lengthText, setLengthText] = useState("");
  const [azText, setAzText] = useState("");
  const [angleText, setAngleText] = useState("");
  const [turn, setTurn] = useState("right");
  const [drawing, setDrawing] = useState(false);
  const [hover, setHover] = useState(null);
  const line = designLines.find((l) => l.id === activeId) || null;
  const c = useMemo(() => (line?.start ? computeLine(line) : null), [line]);
  const update = (patch) => setDesignLines((L) => L.map((l) => (l.id === activeId ? { ...l, ...patch } : l)));
  const appendSegments = (segs) => setDesignLines((L) => L.map((l) => (l.id === activeId ? { ...l, segments: [...l.segments, ...segs] } : l)));
  const updateSegment = (i, patch) => update({ segments: line.segments.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  const newLine = () => {
    const id = `line_${Date.now()}`, z = median(collars.map((k) => k.z).filter(Number.isFinite));
    setDesignLines((L) => [...L, { id, name: tr("Line {n}", { n: L.length + 1 }), color: COLOURS[L.length % COLOURS.length], visible: true, start: { x: null, y: null, z: Number.isFinite(z) ? Math.round(z) : null }, azimuth: null, segments: [] }]);
    setActiveId(id); setDrawing(false);
  };
  const started = line && Number.isFinite(line.start?.x) && Number.isFinite(line.start?.y) && Number.isFinite(line.start?.z);
  const canDraw = line && Number.isFinite(line.start?.z);

  // ---------- drawing in the 3D view ----------
  const state = useRef(); // the effect below lives as long as the drawing does, and reads the latest of these
  state.current = { line, started, grade: Number(grade) || 0, radius: Number(radius) > 0 ? Number(radius) : 0, appendSegments, update };
  useEffect(() => {
    const dom = view?.renderer.current?.domElement, scene = view?.scene.current;
    if (!drawing || !dom || !scene) return undefined;
    const prevCursor = dom.style.cursor;
    dom.style.cursor = "crosshair";
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const preview = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: "#ffd400", dashSize: 6, gapSize: 3, depthTest: false, transparent: true }));
    preview.renderOrder = 11; preview.frustumCulled = false; preview.name = "designLinePreview";
    scene.add(preview);
    const toScene = (v) => { const o = view.origin.current; return new THREE.Vector3(v[0] - o.x, v[2] - o.z, -(v[1] - o.y)); };
    // the plan point under the cursor, on the level the line has reached
    const pointAt = (ev) => {
      const s = state.current, rect = dom.getBoundingClientRect(), o = view.origin.current;
      const level = s.started ? computeLine(s.line).end[2] : s.line.start.z;
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -(((ev.clientY - rect.top) / rect.height) * 2 - 1));
      ray.setFromCamera(ndc, view.camera.current);
      plane.constant = -(level - o.z);
      return ray.ray.intersectPlane(plane, hit) ? [hit.x + o.x, o.y - hit.z, level] : null;
    };
    const onMove = (ev) => {
      const s = state.current, p = pointAt(ev);
      if (!p || !s.started) { preview.visible = false; setHover(null); view.activity.current = Date.now(); return; }
      const r = segmentsToPoint(s.line, p, { radius: s.radius, grade: s.grade });
      if (!r.segments.length) { preview.visible = false; setHover(r.insideCircle ? { inside: true } : null); view.activity.current = Date.now(); return; }
      const base = computeLine(s.line), next = computeLine({ start: { x: base.end[0], y: base.end[1], z: base.end[2] }, azimuth: base.azimuth, segments: r.segments });
      preview.geometry.dispose();
      preview.geometry = new THREE.BufferGeometry().setFromPoints(next.vertices.map(toScene));
      preview.computeLineDistances();
      preview.visible = true;
      setHover({ length: next.length, azimuth: next.azimuth, endZ: next.end[2], hasCurve: r.segments.some((q) => q.type === "curve") });
      view.activity.current = Date.now();
    };
    dom.addEventListener("pointermove", onMove);
    view.dragHook.current = (e) => {
      const x0 = e.clientX, y0 = e.clientY;
      const onUp = (ev) => {
        window.removeEventListener("pointerup", onUp);
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 5) return; // a drag is not a click
        const s = state.current, p = pointAt(ev);
        if (!p) return;
        if (!s.started) { s.update({ start: { x: +p[0].toFixed(2), y: +p[1].toFixed(2), z: s.line.start.z } }); return; }
        const r = segmentsToPoint(s.line, p, { radius: s.radius, grade: s.grade });
        if (r.segments.length) s.appendSegments(r.segments);
      };
      window.addEventListener("pointerup", onUp);
      return true;
    };
    const onKey = (ev) => {
      if (ev.key !== "Escape" || /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName || "")) return;
      ev.stopImmediatePropagation();
      setDrawing(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      dom.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey, true);
      view.dragHook.current = null;
      dom.style.cursor = prevCursor;
      scene.remove(preview); preview.geometry.dispose(); preview.material.dispose();
      view.activity.current = Date.now();
      setHover(null);
    };
  }, [drawing, activeId, view]);

  // ---------- typing a segment ----------
  const addStraight = () => {
    const len = Number(lengthText);
    if (!(len > 0)) return;
    appendSegments([{ type: "straight", length: len, azimuth: num0(azText), grade: Number(grade) || 0 }]);
    setLengthText(""); setAzText("");
  };
  const addCurve = () => {
    const R = Number(radius), a = Number(angleText);
    if (!(R > 0) || !(a > 0)) return;
    appendSegments([{ type: "curve", radius: R, turn, angle: a, grade: Number(grade) || 0 }]);
    setAngleText("");
  };
  const above = useMemo(() => (c && terrain ? runAboveGround(c.vertices, (x, y) => terrainGroundAt(terrain, x, y)) : 0), [c, terrain]);

  const exportCsv = () => saveFile({ suggestedName: "design_lines.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(designLineRows(designLines).map((r) => ({ ...r, crs: crsCell(project) }))) });
  const exportDxf = () => saveFile({ suggestedName: "design_lines.dxf", filters: [{ name: "DXF", extensions: ["dxf"] }], content: buildDXF({ features: designLineFeatures(designLines), geomType: "line", layerOf: (f) => f.attributes.name }) });

  return (
    <div>
      <TaskPaneHeader title="Drifts and ramps" icon={Spline} tone="model" onClose={onClose} />
      <div style={note}>{tr("Design lines for drifts, tunnels, ramps and declines: straights and curves, each at its own grade. They are centrelines, with no profile, ventilation or geotechnical check.")}</div>

      <div style={label}>{tr("Line")}</div>
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        <select value={activeId ?? ""} onChange={(e) => { setActiveId(e.target.value); setDrawing(false); }} disabled={!designLines.length} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Design line")}>
          {!designLines.length && <option value="">{tr("No lines yet")}</option>}
          {designLines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button onClick={newLine} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 8px" }}><Plus size={13} /> {tr("New line")}</button>
      </div>
      {line && (<>
        <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
          <input key={line.id} defaultValue={line.name} onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== line.name) update({ name: n }); }} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Name of the line")} />
          <input type="color" value={line.color} onChange={(e) => update({ color: e.target.value })} aria-label={tr("Colour of the line")} style={{ width: 24, height: 22, padding: 0, border: "none", background: "none" }} />
          <label style={{ ...note, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}><input type="checkbox" checked={line.visible !== false} onChange={(e) => update({ visible: e.target.checked })} />{tr("Show")}</label>
          <Trash2 size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => { setDesignLines((L) => L.filter((l) => l.id !== line.id)); setActiveId(null); setDrawing(false); }, tr("Delete this line"))} />
        </div>

        <div style={label}>{tr("Start")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
          {[["x", "E"], ["y", "N"], ["z", "Z"]].map(([k, l]) => <label key={k} style={{ ...note, minWidth: 0 }}>{l}<Cell value={line.start?.[k]} width="100%" ariaLabel={tr("Start {axis}", { axis: l })} onCommit={(v) => update({ start: { ...line.start, [k]: v } })} /></label>)}
          <label style={{ ...note, minWidth: 0 }} title={tr("Which way the line sets off, clockwise from north. Blank: the first straight decides.")}>{tr("Heading °")}<Cell value={line.azimuth} width="100%" ariaLabel={tr("Heading at the start")} onCommit={(v) => update({ azimuth: v })} /></label>
        </div>
        {!canDraw && <div style={warn}>{tr("Enter the start elevation (Z): clicks in the view are taken on that level.")}</div>}

        <div style={label}>{tr("Next segment")}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <label style={{ ...row, marginTop: 0 }}>{tr("Grade (%)")}<input type="number" step="any" value={grade} onChange={(e) => setGrade(e.target.value)} style={num} aria-label={tr("Grade of the next segment")} title={tr("Rise over run in the direction of travel: 1 climbs, -2 goes down.")} /></label>
          <label style={{ ...row, marginTop: 0 }}>{tr("Radius (m)")}<input type="number" min={0} step="any" value={radius} onChange={(e) => setRadius(e.target.value)} placeholder={tr("sharp")} style={num} aria-label={tr("Curve radius of the next segment")} title={tr("The turning radius in plan. When drawing, each click curves off the line's heading at this radius, then runs straight to the point. Blank: a sharp corner.")} /></label>
        </div>
        {gradeRatio(Number(grade)) && <div style={{ ...note, marginTop: 2 }}>{tr("{ratio} {dir}", { ratio: gradeRatio(Number(grade)), dir: Number(grade) > 0 ? tr("up") : tr("down") })}</div>}
        <button onClick={() => setDrawing((d) => !d)} disabled={!canDraw} aria-pressed={drawing} style={{ ...pBtn, marginTop: 6, background: drawing ? "var(--color-selected-bg)" : undefined, opacity: canDraw ? 1 : 0.5 }}>
          <Spline size={14} /> {drawing ? tr("Click points in the view. Esc stops; right-drag moves the view") : tr("Draw in the 3D view")}
        </button>
        {drawing && !started && <div style={note}>{tr("The first click places the start.")}</div>}
        {drawing && hover?.inside && <div style={warn}>{tr("That point is inside the turning circle: pick one farther off, or a smaller radius.")}</div>}
        {drawing && hover && !hover.inside && <div style={note}>{tr("Next: {l} m, leaving on azimuth {a}°, ending at Z {z}{c}", { l: m1(hover.length), a: Math.round(hover.azimuth), z: m1(hover.endZ), c: hover.hasCurve ? tr(", with a curve") : "" })}</div>}
        {started && (
          <div style={{ marginTop: 4 }}>
            <div style={{ ...row, flexWrap: "wrap" }}>
              <Cell value={num0(lengthText)} ariaLabel={tr("Length of the straight")} placeholder={tr("length")} onCommit={(v) => setLengthText(v == null ? "" : String(v))} />
              <Cell value={num0(azText)} ariaLabel={tr("Azimuth of the straight")} placeholder={tr("az °")} onCommit={(v) => setAzText(v == null ? "" : String(v))} />
              <button onClick={addStraight} disabled={!(Number(lengthText) > 0)} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "3px 6px" }}>{tr("Add straight")}</button>
            </div>
            <div style={{ ...row, flexWrap: "wrap" }}>
              <Cell value={num0(angleText)} ariaLabel={tr("Angle of the curve")} placeholder={tr("angle °")} onCommit={(v) => setAngleText(v == null ? "" : String(v))} />
              <select value={turn} onChange={(e) => setTurn(e.target.value)} style={{ ...smallSel, width: 62 }} aria-label={tr("Direction of the curve")}><option value="right">{tr("right")}</option><option value="left">{tr("left")}</option></select>
              <button onClick={addCurve} disabled={!(Number(radius) > 0 && Number(angleText) > 0)} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "3px 6px" }}>{tr("Add curve")}</button>
            </div>
            <div style={note}>{tr("A curve can pass 360° for a spiral ramp. It uses the radius above.")}</div>
          </div>
        )}

        {c && c.segments.length > 0 && (<>
          <div style={label}>{tr("Segments")}</div>
          {c.segments.map((s, i) => (
            <div key={i} style={{ ...row, gap: 3 }}>
              <span style={{ width: 16, flexShrink: 0 }}>{i + 1}</span>
              {s.type === "curve"
                ? <><Cell value={s.radius} width={52} ariaLabel={tr("Radius of segment {n}", { n: i + 1 })} onCommit={(v) => v > 0 && updateSegment(i, { radius: v })} /><span style={note}>R</span>
                    <Cell value={s.angle} width={46} ariaLabel={tr("Angle of segment {n}", { n: i + 1 })} onCommit={(v) => v > 0 && updateSegment(i, { angle: v })} /><span style={note}>{s.turn === "left" ? tr("° left") : tr("° right")}</span></>
                : <><Cell value={+s.length.toFixed(2)} width={66} ariaLabel={tr("Length of segment {n}", { n: i + 1 })} onCommit={(v) => v > 0 && updateSegment(i, { length: v })} /><span style={note}>m</span>
                    <Cell value={+s.azimuthOut.toFixed(1)} width={46} ariaLabel={tr("Azimuth of segment {n}", { n: i + 1 })} onCommit={(v) => updateSegment(i, { azimuth: v })} /><span style={note}>°</span></>}
              <Cell value={s.grade} width={52} ariaLabel={tr("Grade of segment {n}", { n: i + 1 })} onCommit={(v) => updateSegment(i, { grade: v ?? 0 })} /><span style={note}>%</span>
              <X size={12} style={{ cursor: "pointer", flexShrink: 0 }} {...iconAction(() => update({ segments: line.segments.filter((_, k) => k !== i) }), tr("Remove segment {n}", { n: i + 1 }))} />
            </div>
          ))}
          <div style={{ marginTop: 6, padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
            <div style={row}><span>{tr("Driven length")}</span><b>{m1(c.length)} m</b></div>
            <div style={row}><span>{tr("Elevation change")}</span><b>{c.dz >= 0 ? "+" : ""}{m1(c.dz)} m</b></div>
            <div style={row}><span>{tr("End")}</span><b>{m1(c.end[0])}, {m1(c.end[1])}, {m1(c.end[2])}</b></div>
            <div style={row}><span>{tr("Steepest grade")}</span><b>{m1(c.steepest)} %</b></div>
            {c.minRadius != null && <div style={row}><span>{tr("Tightest radius")}</span><b>{m1(c.minRadius)} m</b></div>}
            {above > 0.5 && <div style={warn}>{tr("{m} m of this line, in plan, is above the terrain.", { m: m1(above) })}</div>}
          </div>
        </>)}
      </>)}
      {designLines.some((l) => l.segments.length) && (
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          <button onClick={exportDxf} style={{ ...pBtn, marginBottom: 0 }}><Download size={13} /> DXF</button>
          <button onClick={exportCsv} style={{ ...pBtn, marginBottom: 0 }}><Download size={13} /> CSV</button>
        </div>
      )}
    </div>
  );
}
