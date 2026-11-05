// TASKS.csv #1342 — the Mine Design tab's drift, tunnel, ramp and decline linework. Draw by clicking in the 3D view (the point is
// taken on the level the line has reached, so a top view is the natural one), or type a segment. Grade and radius are what the
// next segment gets; every segment stays editable, and a change moves everything after it. Geometry in lib/designLines.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Spline, Download, X, Trash2, Plus, Maximize2 } from "./icons.js";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { computeLine, segmentsToPoint, runAboveGround, gradeRatio, designLineRows, designLineFeatures, selfClearance, declineToTarget, clearanceTo, sharpCorners, developmentRows, profileArea, profileMesh, profileHalfAlong, passDirection } from "../lib/designLines.js"; // #1878; profileHalfAlong / passDirection: #1924; profileMesh: #1954
import { holeTraces } from "../lib/evidenceSources.js"; // #1878 — the drillhole traces the clearance is checked against
import { plannedTrace } from "../lib/holePlanning.js"; // #1878 — a planned hole's toe as a target
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
const m2 = (v) => (Math.round(v * 100) / 100).toLocaleString();
const cellStyle = { textAlign: "right", padding: "2px 3px", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap" };
const num0 = (s) => (s === "" || s == null || !Number.isFinite(Number(s)) ? null : Number(s));
const nextSeg = { grade: "0", radius: "" }; // #1360 — the next segment's grade and radius outlive the pane (this session)
const toTargetDefaults = { maxGrade: "", minRadius: "", pillar: "", density: "" }; // #1878 — kept this session too
const fmtEN = (v) => Math.round(v).toLocaleString(); // #1853 — a coordinate readout that is not confused with its own thousands separators
const nearestZ = (pts, x, y) => pts.reduce((b, k) => (Number.isFinite(k.z) && (!b || Math.hypot(k.x - x, k.y - y) < Math.hypot(b.x - x, b.y - y)) ? k : b), null)?.z;

// a number that is only taken when you leave it, so "-" and "1." can be typed on the way to -1.5. onCommit returning false
// refuses the number, and the cell goes back to the stored value instead of showing what was refused (#1363)
function Cell({ value, onCommit, width = 54, ariaLabel, placeholder }) {
  const [reset, setReset] = useState(0);
  return <input type="number" step="any" key={`${value}|${reset}`} defaultValue={value ?? ""} placeholder={placeholder} aria-label={ariaLabel} style={{ ...smallSel, width }}
    onBlur={(e) => { const v = num0(e.target.value); if (v !== (value ?? null) && onCommit(v) === false) setReset((k) => k + 1); }} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />;
}

// view: { scene, camera, renderer, activity, dragHook, origin } (refs)
export default function DesignLinesPane({ view, onAdd, surfaces = [], onClose }) { // onAdd / surfaces: the opening as a solid (#1954)
  const { designLines = [], setDesignLines, collars = [], survey = [], plannedHoles = [], terrain, project } = useStore();
  const [activeId, setActiveId] = useState(() => designLines[designLines.length - 1]?.id ?? null);
  const [grade, setGradeState] = useState(nextSeg.grade);
  const [radius, setRadiusState] = useState(nextSeg.radius);
  const setGrade = (v) => { nextSeg.grade = v; setGradeState(v); };
  const setRadius = (v) => { nextSeg.radius = v; setRadiusState(v); };
  const [lengthText, setLengthText] = useState("");
  const [azText, setAzText] = useState("");
  const [angleText, setAngleText] = useState("");
  const [turn, setTurn] = useState("right");
  const [drawing, setDrawing] = useState(false);
  const [hover, setHover] = useState(null);
  // TASKS.csv #1878 — a decline to a target, a development profile, clearance to other lines and drillholes
  const [tgt, setTgt] = useState({ x: "", y: "", z: "", holeId: "", maxGrade: toTargetDefaults.maxGrade, minRadius: toTargetDefaults.minRadius });
  const [picking, setPicking] = useState(false);
  const [pickedOn, setPickedOn] = useState(null); // #1891 — what the last pick landed on
  const [pillar, setPillarState] = useState(toTargetDefaults.pillar);
  const [density, setDensityState] = useState(toTargetDefaults.density);
  const setPillar = (v) => { toTargetDefaults.pillar = v; setPillarState(v); };
  const setDensity = (v) => { toTargetDefaults.density = v; setDensityState(v); };
  const [toTargetMsg, setToTargetMsg] = useState(null);
  const [msg, setMsg] = useState(null); // #1754 — a deletion says that Undo brings the line back
  // TASKS.csv #1954 (Vulcan review) — the opening (the profile swept along the line) as a closed solid in Generated surfaces: for
  // the engineer's DXF / OBJ, a query against the holes, or taking it out of a stope later. The tube drawn in the view is display only.
  const addOpening = () => {
    if (!c || !onAdd || !(line?.profile?.width > 0 && line?.profile?.height > 0)) return;
    const pm = profileMesh(c.vertices.map((v) => [v[0], v[1], v[2]]), line.profile);
    if (!pm || !(pm.volume > 0)) { setMsg(tr("The line is too short for an opening.")); return; }
    const taken = new Set(surfaces.map((s) => s.name)), base = tr("{name} opening {w} x {h} m", { name: line.name, w: line.profile.width, h: line.profile.height });
    let name = base; for (let k = 2; taken.has(name); k++) name = `${base} (${k})`;
    const dens = num0(density) > 0 ? num0(density) : null, area = profileArea(line.profile);
    onAdd({ name, positions: pm.positions, indices: pm.indices, volumeM3: pm.volume, type: "development", closure: "closed", color: line.color || "#4c6ef5", tag: "opening",
      tip: tr("{name}: {w} x {h} m {shape} opening along the line", { name: line.name, w: line.profile.width, h: line.profile.height, shape: line.profile.shape === "arched" ? tr("arched") : tr("flat back") }),
      params: { tool: "development opening (profile swept along a design line)", line: line.name, lineId: line.id, profile: { width: line.profile.width, height: line.profile.height, shape: line.profile.shape || "flat" }, lengthM: +c.length.toFixed(1), sectionAreaM2: +area.toFixed(2), volumeM3: Math.round(pm.volume), density: dens, tonnes: dens ? Math.round(pm.volume * dens) : null, generatedAt: new Date().toISOString() } });
    setMsg(tr("Added \"{name}\": {v} m³{t}. It is listed in 3D Modelling › Generated surfaces, where it can be exported or queried.", { name, v: Math.round(pm.volume).toLocaleString(), t: dens ? tr(", {t} t at {d} t/m³", { t: Math.round(pm.volume * dens).toLocaleString(), d: dens }) : "" }));
  };
  const line = designLines.find((l) => l.id === activeId) || null;
  // #1357 — after a delete or an undo the active line can be gone: the last line takes over, so the editor never goes blank
  useEffect(() => { if (!line && designLines.length) setActiveId(designLines[designLines.length - 1].id); }, [line, designLines]);
  const c = useMemo(() => (line?.start ? computeLine(line) : null), [line]);
  const update = (patch) => setDesignLines((L) => L.map((l) => (l.id === activeId ? { ...l, ...patch } : l)));
  const appendSegments = (segs) => setDesignLines((L) => L.map((l) => (l.id === activeId ? { ...l, segments: [...l.segments, ...segs] } : l)));
  const updateSegment = (i, patch) => update({ segments: line.segments.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  const newLine = () => {
    const id = `line_${Date.now()}`, z = median(collars.map((k) => k.z).filter(Number.isFinite));
    setDesignLines((L) => [...L, { id, name: tr("Line {n}", { n: L.length + 1 }), color: COLOURS[L.length % COLOURS.length], visible: true, start: { x: null, y: null, z: Number.isFinite(z) ? Math.round(z) : null, zAuto: true }, azimuth: null, segments: [] }]);
    setActiveId(id); setDrawing(false);
  };
  const started = line && Number.isFinite(line.start?.x) && Number.isFinite(line.start?.y) && Number.isFinite(line.start?.z);
  const canDraw = line && Number.isFinite(line.start?.z);
  // #1612 / #1851 — the ground at a point: the terrain, else the nearest collar; null when the project knows no ground
  const groundAt = (x, y) => { const g = terrain ? terrainGroundAt(terrain, x, y) : nearestZ(collars, x, y); return Number.isFinite(g) ? g : null; };
  const groundKnown = !!terrain || collars.some((k) => Number.isFinite(k.z));
  const collarZs = collars.map((k) => k.z).filter(Number.isFinite);
  // #1852 — a start far outside any elevation the project knows (or the planet) is probably a slip
  const startZOdd = line && Number.isFinite(line.start?.z) && (line.start.z > 9000 || line.start.z < -500 || (collarZs.length && (line.start.z > Math.max(...collarZs) + 1500 || line.start.z < Math.min(...collarZs) - 3000)));
  // #1612 — a typed start takes the ground under it when nobody typed a Z
  const setStart = (k, v) => {
    const next = { ...line.start, [k]: v, ...(k === "z" ? { zAuto: false } : {}) };
    if (k !== "z" && next.zAuto && Number.isFinite(next.x) && Number.isFinite(next.y)) { const g = groundAt(next.x, next.y); if (Number.isFinite(g)) next.z = Math.round(g); }
    update({ start: next });
  };
  const traces = useMemo(() => [...holeTraces(collars, survey, project?.desurveyMethod)].map(([name, pts]) => ({ name, vertices: pts.map((p) => [p.x, p.y, p.z]) })), [collars, survey, project?.desurveyMethod]);
  const otherLines = useMemo(() => designLines.filter((l) => l.id !== activeId && Number.isFinite(l.start?.x) && l.segments?.length).map((l) => ({ name: l.name, vertices: computeLine(l).vertices.map((v) => [v[0], v[1], v[2]]) })), [designLines, activeId]);
  const nearLine = useMemo(() => (c && otherLines.length ? clearanceTo(c, otherLines, 200) : null), [c, otherLines]);
  const nearHole = useMemo(() => (c && traces.length ? clearanceTo(c, traces, 200) : null), [c, traces]);
  const corners = useMemo(() => (c ? sharpCorners(c) : []), [c]);
  const pillarM = num0(pillar);
  // #1889 — clearanceTo measures centreline to centreline (or hole trace); with a profile the rock left is that less half the width
  // on this side, and less half the other line's width too. Without a profile the figures stay centreline figures and say so.
  // TASKS.csv #1924 — the half-extent taken off follows the pass DIRECTION: beside another drift it is half the width, under or over
  // one (a spiral's stacked turns, a hole passing over the back) half the height; the label says which it mostly is
  const halfW = line?.profile?.width > 0 ? line.profile.width / 2 : 0;
  const otherProfile = nearLine ? designLines.find((l) => l.name === nearLine.name)?.profile || null : null;
  const wallHole = nearHole ? Math.max(0, nearHole.distance - profileHalfAlong(nearHole, line?.profile)) : null;
  const wallLine = nearLine ? Math.max(0, nearLine.distance - profileHalfAlong(nearLine, line?.profile) - profileHalfAlong(nearLine, otherProfile)) : null;
  const passLabel = (base, pass = null) => (halfW > 0 ? (passDirection(pass).vertical > 0.7 ? tr("{label} (back to floor)", { label: base }) : tr("{label} (wall to wall)", { label: base })) : tr("{label} (centreline)", { label: base }));
  const targetPoint = () => {
    if (tgt.holeId) { const h = plannedHoles.find((p) => p.id === tgt.holeId); const tr0 = h ? plannedTrace(h) : []; const toe = tr0[tr0.length - 1]; return toe ? [toe.x, toe.y, toe.z] : null; }
    const p = [num0(tgt.x), num0(tgt.y), num0(tgt.z)];
    return p.every((v) => v != null) ? p : null;
  };
  const designToTarget = () => {
    const target = targetPoint(); if (!target || !started) return;
    const r = declineToTarget(line, target, { maxGrade: num0(tgt.maxGrade) || 0, minRadius: num0(tgt.minRadius) || 0 });
    if (r.insideCircle) { setToTargetMsg(tr("The target is inside the turning circle: a smaller radius, or start farther off.")); return; }
    if (r.needsGrade) { setToTargetMsg(tr("Enter the maximum grade: the target is at another elevation.")); return; }
    if (r.needsRadius) { setToTargetMsg(tr("Enter the minimum radius: the route needs a spiral to lose that much elevation.")); return; }
    if (!r.segments.length) { setToTargetMsg(tr("Nothing to add: the line already ends at the target.")); return; }
    appendSegments(r.segments);
    // #1895 — the lengths quoted are driven lengths, as the segments and totals count them
    setToTargetMsg(r.turns > 0 ? tr("{n} spiral turn(s) at {r} m, then {l} m at {g} % to the target: {total} m driven.", { n: r.turns, r: num0(tgt.minRadius), l: m1(r.routeLength), g: m1(r.grade), total: m1(r.length) }) : tr("{l} m at {g} % to the target.", { l: m1(r.length), g: m1(r.grade) }));
  };
  // a one-shot pick of the target in the view (#1878), through the same drag hook the drawing uses
  useEffect(() => {
    const dom = view?.renderer.current?.domElement;
    if (!picking || !dom) return undefined;
    const prev = dom.style.cursor; dom.style.cursor = "crosshair";
    view.dragHook.current = (e) => {
      const x0 = e.clientX, y0 = e.clientY;
      const onUp = (ev) => {
        window.removeEventListener("pointerup", onUp);
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 5) return;
        const w = view.worldPointAt?.(ev.clientX, ev.clientY);
        if (w) { setTgt((t) => ({ ...t, x: String(+w.x.toFixed(2)), y: String(+w.y.toFixed(2)), z: String(+w.z.toFixed(2)), holeId: "" })); setPickedOn({ on: w.on || null, z: w.z }); }
        else setPickedOn({ miss: true }); // #1921
        setPicking(false);
      };
      window.addEventListener("pointerup", onUp);
      return true;
    };
    const onKey = (ev) => { if (ev.key === "Escape") { ev.stopImmediatePropagation(); setPicking(false); } };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); view.dragHook.current = null; dom.style.cursor = prev; };
  }, [picking, view]);
  const devRows = useMemo(() => developmentRows(designLines.filter((l) => Number.isFinite(l.start?.x) && l.segments?.length), { density: num0(density) }), [designLines, density]);
  const exportDevCsv = () => saveFile({ suggestedName: "development.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(devRows.map((r) => ({ ...r, crs: crsCell(project) }))) });

  // ---------- drawing in the 3D view ----------
  const state = useRef(); // the effect below lives as long as the drawing does, and reads the latest of these
  state.current = { line, started, grade: Number(grade) || 0, radius: Number(radius) > 0 ? Number(radius) : 0, appendSegments, update, terrain, collars };
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
        if (!s.started) {
          // #1359 — a start Z nobody typed is the ground under the click (terrain, else the nearest collar), not one median for the whole property
          const g = s.line.start.zAuto ? (s.terrain ? terrainGroundAt(s.terrain, p[0], p[1]) : nearestZ(s.collars, p[0], p[1])) : null;
          s.update({ start: { x: +p[0].toFixed(2), y: +p[1].toFixed(2), z: Number.isFinite(g) ? Math.round(g) : s.line.start.z } });
          return;
        }
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
  const clearance = useMemo(() => (c && c.vertices.length > 2 ? selfClearance(c) : null), [c]);
  const wallSelf = clearance ? Math.max(0, clearance.distance - 2 * profileHalfAlong(clearance, line?.profile)) : null; // #1889 (declared after clearance: TDZ otherwise); along the pass: #1924

  const exportCsv = () => saveFile({ suggestedName: "design_lines.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(designLineRows(designLines).map((r) => ({ ...r, crs: crsCell(project) }))) });
  const exportDxf = () => saveFile({ suggestedName: "design_lines.dxf", filters: [{ name: "DXF", extensions: ["dxf"] }], content: buildDXF({ features: designLineFeatures(designLines), geomType: "line", layerOf: (f) => f.attributes.name, colorOf: (f) => f.attributes.color }) });

  return (
    <div>
      <TaskPaneHeader title="Drifts and ramps" icon={Spline} tone="model" onClose={onClose} />
      <div style={note}>{tr("Design lines for drifts, tunnels, ramps and declines: straights and curves, each at its own grade. Each line can carry a profile for clearance checks and be added as a solid of the opening; there is no ventilation or geotechnical check.")}</div>

      <div style={label}>{tr("Line")}</div>
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        <select value={activeId ?? ""} onChange={(e) => { setActiveId(e.target.value); setDrawing(false); }} disabled={!designLines.length} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Design line")}>
          {!designLines.length && <option value="">{tr("No lines yet")}</option>}
          {designLines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {c && c.vertices?.length > 0 && view?.zoomTo && <Maximize2 size={14} style={{ cursor: "pointer", flexShrink: 0, alignSelf: "center" }} {...iconAction(() => view.zoomTo(c.vertices), tr("Zoom to this line"))} />}{/* #1892 */}
        <button onClick={newLine} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 8px" }}><Plus size={13} /> {tr("New line")}</button>
      </div>
      {msg && <div style={note}>{msg}</div>}{/* #1754 */}
      {line && (<>
        <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
          <input key={line.id} defaultValue={line.name} onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== line.name) update({ name: n }); }} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Name of the line")} />
          <input type="color" value={line.color} onChange={(e) => update({ color: e.target.value })} aria-label={tr("Colour of the line")} style={{ width: 24, height: 22, padding: 0, border: "none", background: "none" }} />
          <label style={{ ...note, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}><input type="checkbox" checked={line.visible !== false} onChange={(e) => update({ visible: e.target.checked })} />{tr("Show")}</label>
          <Trash2 size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(() => { const rest = designLines.filter((l) => l.id !== line.id); setDesignLines((L) => L.filter((l) => l.id !== line.id)); setActiveId(rest[rest.length - 1]?.id ?? null); setDrawing(false); setMsg(tr("\"{name}\" deleted: Undo (Ctrl+Z) brings it back.", { name: line.name })); }, tr("Delete this line"))} />
        </div>

        <div style={label}>{tr("Start")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
          {[["x", "E"], ["y", "N"], ["z", "Z"]].map(([k, l]) => <label key={k} style={{ ...note, minWidth: 0 }}>{l}<Cell value={line.start?.[k]} width="100%" ariaLabel={tr("Start {axis}", { axis: l })} onCommit={(v) => setStart(k, v)} /></label>)}
          <label style={{ ...note, minWidth: 0 }} title={tr("Which way the line sets off, clockwise from north. Blank: the first straight decides.")}>{tr("Heading °")}<Cell value={line.azimuth} width="100%" ariaLabel={tr("Heading at the start")} onCommit={(v) => update({ azimuth: v })} /></label>
        </div>
        {!canDraw && <div style={warn}>{groundKnown ? tr("Enter the start elevation (Z): clicks in the view are taken on that level.") : tr("Enter the start elevation (Z): the project has no terrain or collars to take the ground from. Clicks in the view are taken on that level.")}</div>}
        {line.start?.zAuto && Number.isFinite(line.start?.z) && started && <div style={note}>{tr("Start Z taken from {src} under the start.", { src: terrain ? tr("the terrain") : tr("the nearest collar") })}</div>}
        {startZOdd && <div style={warn}>{tr("Start Z {z} m is far from every elevation this project knows: check it.", { z: fmtEN(line.start.z) })}</div>}

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

        {started && (<>
          <div style={label}>{tr("To a target")}</div>
          <div style={note}>{tr("The line goes on to a point at no more than the maximum grade, with curves no tighter than the minimum radius: a curve off its heading and a straight, with whole spiral turns first when that run cannot lose the elevation.")}</div>
          <div style={{ ...row, flexWrap: "wrap", gap: 3 }}>
            <Cell value={num0(tgt.x)} width={66} placeholder="E" ariaLabel={tr("Target easting")} onCommit={(v) => setTgt((t) => ({ ...t, x: v == null ? "" : String(v), holeId: "" }))} />
            <Cell value={num0(tgt.y)} width={70} placeholder="N" ariaLabel={tr("Target northing")} onCommit={(v) => setTgt((t) => ({ ...t, y: v == null ? "" : String(v), holeId: "" }))} />
            <Cell value={num0(tgt.z)} width={52} placeholder="Z" ariaLabel={tr("Target elevation")} onCommit={(v) => setTgt((t) => ({ ...t, z: v == null ? "" : String(v), holeId: "" }))} />
            <button onClick={() => setPicking((p) => !p)} aria-pressed={picking} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 6px", background: picking ? "var(--color-selected-bg)" : undefined }}>{picking ? tr("Click the target…") : tr("Pick in view")}</button>
          </div>
          {plannedHoles.length > 0 && <label style={row}>{tr("Or a planned hole's toe")}<select value={tgt.holeId} onChange={(e) => setTgt((t) => ({ ...t, holeId: e.target.value }))} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Planned hole whose toe is the target")}><option value="">{tr("— none —")}</option>{plannedHoles.map((h) => <option key={h.id} value={h.id}>{h.name || h.id}</option>)}</select></label>}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <label style={{ ...row, marginTop: 0 }}>{tr("Max grade (%)")}<input type="number" min={0} step="any" value={tgt.maxGrade} onChange={(e) => { toTargetDefaults.maxGrade = e.target.value; setTgt((t) => ({ ...t, maxGrade: e.target.value })); }} style={num} aria-label={tr("Maximum grade to the target")} /></label>
            <label style={{ ...row, marginTop: 0 }}>{tr("Min radius (m)")}<input type="number" min={0} step="any" value={tgt.minRadius} onChange={(e) => { toTargetDefaults.minRadius = e.target.value; setTgt((t) => ({ ...t, minRadius: e.target.value })); }} style={num} aria-label={tr("Minimum curve radius to the target")} /></label>
          </div>
          {pickedOn?.miss && <div style={note}>{tr("Nothing under the cursor there: the target was not changed.")}</div>}{/* #1921 */}
          {pickedOn && !pickedOn.miss && !tgt.holeId && <div style={note}>{pickedOn.on ? tr("Picked on {name} at Z {z}: set the Z by hand if that is not the elevation you mean.", { name: pickedOn.on, z: m1(pickedOn.z) }) : tr("Picked on the flat reference plane (nothing drawn under the cursor): set the Z by hand.")}</div>}{/* #1891 */}
          <button onClick={designToTarget} disabled={!targetPoint()} style={{ ...pBtn, marginTop: 4, opacity: targetPoint() ? 1 : 0.5 }}><Spline size={14} /> {tr("Design to the target")}</button>
          {toTargetMsg && <div style={note}>{toTargetMsg}</div>}
        </>)}
        {c && c.segments.length > 0 && (<>
          <div style={label}>{tr("Segments")}</div>
          {c.segments.map((s, i) => (
            <div key={i} style={{ ...row, gap: 3 }}>
              <span style={{ width: 16, flexShrink: 0 }}>{i + 1}</span>
              {s.type === "curve"
                ? <><Cell value={s.radius} width={52} ariaLabel={tr("Radius of segment {n}", { n: i + 1 })} onCommit={(v) => v > 0 && updateSegment(i, { radius: v })} /><span style={note}>R</span>
                    <Cell value={+s.angle.toFixed(1)} width={64} ariaLabel={tr("Angle of segment {n}", { n: i + 1 })} onCommit={(v) => v > 0 && updateSegment(i, { angle: v })} /><span style={note}>{s.turn === "left" ? tr("° left") : tr("° right")}</span></>
                : <><Cell value={+s.length.toFixed(2)} width={66} ariaLabel={tr("Length of segment {n}", { n: i + 1 })} onCommit={(v) => v > 0 && updateSegment(i, { length: v })} /><span style={note}>m</span>
                    <Cell value={+s.azimuthOut.toFixed(1)} width={56} ariaLabel={tr("Azimuth of segment {n}", { n: i + 1 })} onCommit={(v) => updateSegment(i, { azimuth: v })} /><span style={note}>°</span></>}
              <Cell value={s.grade} width={52} ariaLabel={tr("Grade of segment {n}", { n: i + 1 })} onCommit={(v) => updateSegment(i, { grade: v ?? 0 })} /><span style={note}>%</span>
              <X size={12} style={{ cursor: "pointer", flexShrink: 0 }} {...iconAction(() => update({ segments: line.segments.filter((_, k) => k !== i) }), tr("Remove segment {n}", { n: i + 1 }))} />
            </div>
          ))}
          <div style={{ marginTop: 6, padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
            <div style={row}><span>{tr("Driven length")}</span><b>{m1(c.length)} m</b></div>
            <div style={row}><span>{tr("Elevation change")}</span><b>{c.dz >= 0 ? "+" : ""}{m1(c.dz)} m</b></div>
            <div style={row}><span>{tr("End")}</span><b>{`E ${fmtEN(c.end[0])} N ${fmtEN(c.end[1])} Z ${m1(c.end[2])}`}</b></div>{/* #1853 */}
            <div style={row}><span>{tr("Steepest grade")}</span><b>{m1(c.steepest)} %</b></div>
            {c.minRadius != null && !corners.length && <div style={row}><span>{tr("Tightest radius")}</span><b>{m1(c.minRadius)} m</b></div>}
            {corners.length > 0 && <div style={warn}>{tr("{n} sharp corner(s) (segment {list}): a typed azimuth turned the line without a curve, which no machine can drive. Add a curve or match the heading.", { n: corners.length, list: corners.map((k) => `${k.segment} (${k.turn}°)`).join(", ") })}</div>}{/* #1611 */}
            {nearLine && <div style={row}><span title={halfW > 0 ? tr("Centreline to centreline: {m} m", { m: m1(nearLine.distance) }) : undefined}>{passLabel(tr("Closest pass to another line"), nearLine)}</span><b>{m1(wallLine)} m ({nearLine.name})</b></div>}{/* #1889 */}
            {nearHole && <div style={row}><span title={halfW > 0 ? tr("Centreline to hole: {m} m", { m: m1(nearHole.distance) }) : undefined}>{passLabel(tr("Closest pass to a drillhole"), nearHole)}</span><b>{m1(wallHole)} m ({nearHole.name})</b></div>}
            {pillarM > 0 && ((wallLine != null && wallLine < pillarM) || (wallHole != null && wallHole < pillarM) || (wallSelf != null && wallSelf < pillarM)) && <div style={warn}>{tr("Less than the {p} m pillar is left somewhere: see the passes above.", { p: pillarM })}</div>}
            {pillarM > 0 && halfW === 0 && <div style={note}>{tr("The passes are centreline figures: set a profile width to measure the rock left wall to wall.")}</div>}
            {clearance && <div style={row}><span title={tr("The nearest the line passes to another part of itself, as between the turns of a spiral: the rock left between them. Between stacked turns the profile's height is taken off (back to floor), beside each other its width (wall to wall).")}>{passLabel(tr("Closest pass to itself"), clearance)}</span><b>{m1(wallSelf)} m</b></div>}{/* #1924 */}
            {clearance && wallSelf < 10 && <div style={warn}>{tr("The line passes within {m} m of itself near {x}, {y}, {z}: it may run through its own opening.", { m: m1(wallSelf), x: m1(clearance.at[0]), y: m1(clearance.at[1]), z: m1(clearance.at[2]) })}</div>}
            {above > 0.5 && <div style={warn}>{tr("{m} m of this line, in plan, is above the terrain.", { m: m1(above) })}</div>}
            {!terrain && <div style={note}>{tr("No terrain: the line is not checked against the ground.")}</div>}
          </div>
          <div style={label}>{tr("Profile and clearance")}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            <label style={{ ...row, marginTop: 0 }}>{tr("Width (m)")}<Cell value={line.profile?.width ?? null} width={52} ariaLabel={tr("Profile width")} onCommit={(v) => update({ profile: { ...(line.profile || { shape: "flat" }), width: v } })} /></label>
            <label style={{ ...row, marginTop: 0 }}>{tr("Height (m)")}<Cell value={line.profile?.height ?? null} width={52} ariaLabel={tr("Profile height")} onCommit={(v) => update({ profile: { ...(line.profile || { shape: "flat" }), height: v } })} /></label>
            <select value={line.profile?.shape || "flat"} onChange={(e) => update({ profile: { ...(line.profile || {}), shape: e.target.value } })} style={{ ...smallSel, width: 72 }} aria-label={tr("Profile shape")}><option value="flat">{tr("flat back")}</option><option value="arched">{tr("arched")}</option></select>
          </div>
          {line.profile?.width > 0 && line.profile?.height > 0 && onAdd && <div style={{ marginTop: 4 }}><button onClick={addOpening} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 8px" }} title={tr("The swept profile as a closed solid in Generated surfaces: export it, query it against the holes, take it out of a stope.")}>{tr("Add the opening as a solid")}</button></div>}{/* #1954 */}
          {line.profile?.width > 0 && line.profile?.height > 0 && <div style={note}>{tr("{a} m² section, {v} m³ along this line{t}. The profile is drawn in the view.", { a: m2(profileArea(line.profile)), v: Math.round(profileArea(line.profile) * c.length).toLocaleString(), t: num0(density) > 0 ? tr(", {t} t at {d} t/m³", { t: Math.round(profileArea(line.profile) * c.length * num0(density)).toLocaleString(), d: num0(density) }) : "" })}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <label style={{ ...row, marginTop: 0 }}>{tr("Density (t/m³)")}<input type="number" min={0} step="any" value={density} onChange={(e) => setDensity(e.target.value)} style={num} aria-label={tr("Rock density for the excavation tonnes")} /></label>
            <label style={{ ...row, marginTop: 0 }} title={tr("The rock to keep between this line and any other line or drillhole; a pass closer than it is flagged.")}>{tr("Pillar (m)")}<input type="number" min={0} step="any" value={pillar} onChange={(e) => setPillar(e.target.value)} style={num} aria-label={tr("Pillar to keep")} /></label>
          </div>
        </>)}
        {devRows.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={label}>{tr("Development")}</div>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--font-size-xs)", marginTop: 4 }}>
              <thead><tr>{[tr("Line"), tr("m"), tr("Level"), tr("Ramp"), tr("m³"), tr("t")].map((h) => <th key={h} style={{ textAlign: "right", padding: "2px 3px", borderBottom: "1px solid var(--color-border)", fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>{devRows.map((r) => <tr key={r.line}><td style={{ ...cellStyle, textAlign: "left" }}>{r.line}</td><td style={cellStyle}>{r.length_m.toLocaleString()}</td><td style={cellStyle}>{r.level_m.toLocaleString()}</td><td style={cellStyle}>{r.ramp_m.toLocaleString()}</td><td style={cellStyle}>{r.volume_m3 === "" ? "—" : r.volume_m3.toLocaleString()}</td><td style={cellStyle}>{r.tonnes === "" ? "—" : r.tonnes.toLocaleString()}</td></tr>)}</tbody>
            </table>
            <div style={note}>{tr("Level: segments within 2 % of flat; ramp: the rest. m³ and t need a profile on the line and a density.")}</div>
            <button onClick={exportDevCsv} style={{ ...pBtn, marginTop: 4 }}><Download size={13} /> {tr("Development CSV")}</button>
          </div>
        )}
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
