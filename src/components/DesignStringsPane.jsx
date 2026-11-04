// TASKS.csv #1876 / #1877 — the Mine Design tab's DESIGN STRINGS: free 3D polylines and polygons drawn in the view (the click lands
// on whatever is under the cursor, or on an elevation plane; Shift keeps the next leg on a grid direction; vertices snap to
// other vertices and collars, and to a grid), typed by coordinate or distance-and-bearing, edited vertex by vertex, offset,
// joined, split; DXF and CSV out, DXF in. SOLIDS from them: a closed string extruded between two elevations, or closed strings on
// levels lofted into one body, with volume and what a block model holds inside. Geometry in lib/designStrings.js and
// lib/stringSolids.js. Every number is the user's.
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { PenTool, Download, Upload, X, Trash2, Plus, Box, Maximize2 } from "./icons.js";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { stringStats, offsetString, joinStrings, splitString, reverseString, fromDistanceBearing, orthoPoint, snapToGrid, bearingOf, stringRows, stringFeatures, stringsFromDxf } from "../lib/designStrings.js";
import { extrudeString, loftStrings, solidTonnage } from "../lib/stringSolids.js";
import { categoricalModels } from "../lib/geologyForward.js";
import { buildDXF } from "../lib/dxf.js";
import { toExportCsv, crsCell } from "../lib/tabular.js";
import { saveFile } from "../lib/desktop.js";
import { iconAction } from "../lib/a11y.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { collarGround } from "../lib/pitShell.js"; // #1905
import { terrainGroundAt } from "../lib/viewer/geomath.js";
import { t as tr } from "../lib/i18n.js";

const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", marginTop: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const warn = { ...note, color: "var(--color-warn-text-strong)", marginTop: 4 };
const label = { ...note, marginTop: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 };
const num = { ...smallSel, width: 72 };
const COLOURS = ["#1971c2", "#e8590c", "#2f9e44", "#ae3ec9", "#f08c00", "#0c8599"];
const m1 = (v) => (Math.round(v * 10) / 10).toLocaleString();
const num0 = (s) => (s === "" || s == null || !Number.isFinite(Number(s)) ? null : Number(s));
const big = (v) => new Intl.NumberFormat(undefined, { notation: "compact", maximumSignificantDigits: 3 }).format(v);
const draw = { target: null, planeZ: "", snap: true, grid: "" }; // #1360 — the drawing settings outlive the pane (this session); target null: not chosen yet (#1905)
let nextId = 1;

// a number taken when you leave the cell (#1363)
function Cell({ value, onCommit, width = 60, ariaLabel, placeholder }) {
  const [reset, setReset] = useState(0);
  return <input type="number" step="any" key={`${value}|${reset}`} defaultValue={value ?? ""} placeholder={placeholder} aria-label={ariaLabel} style={{ ...smallSel, width }}
    onBlur={(e) => { const v = num0(e.target.value); if (v !== (value ?? null) && onCommit(v) === false) setReset((k) => k + 1); }} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />;
}

// view: { scene, camera, renderer, activity, dragHook, origin, worldPointAt } (refs; worldPointAt(clientX, clientY) -> world point
// under the cursor on any drawn feature, or null); onAdd as the pit pane's (a solid into the generated surfaces)
export default function DesignStringsPane({ view, onAdd, onClose }) {
  const { designStrings = [], setDesignStrings, collars = [], voxelModels = [], project, terrain } = useStore();
  const [activeId, setActiveId] = useState(() => designStrings[designStrings.length - 1]?.id ?? null);
  const [drawing, setDrawing] = useState(false);
  // #1905 — the ground: the terrain, else interpolated between the collars (as the pit and dump panes take it); the default target
  const groundAt = useMemo(() => (terrain ? (x, y) => terrainGroundAt(terrain, x, y) : collarGround(collars)), [terrain, collars]);
  const [target, setTargetState] = useState(draw.target || (groundAt ? "ground" : "hit"));
  const [planeZ, setPlaneZState] = useState(draw.planeZ);
  const [snap, setSnapState] = useState(draw.snap);
  const [grid, setGridState] = useState(draw.grid);
  const setTarget = (v) => { draw.target = v; setTargetState(v); };
  const setPlaneZ = (v) => { draw.planeZ = v; setPlaneZState(v); };
  const setSnap = (v) => { draw.snap = v; setSnapState(v); };
  const setGrid = (v) => { draw.grid = v; setGridState(v); };
  const [hover, setHover] = useState(null);
  const [typed, setTyped] = useState({ x: "", y: "", z: "", dist: "", bearing: "", grade: "0" });
  const [tool, setTool] = useState({ offset: "", dE: "", dN: "", dZ: "", joinId: "", splitAt: "" });
  const [solid, setSolid] = useState({ zBottom: "", zTop: "", modelId: "", density: "", loft: [] });
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  const string = designStrings.find((s) => s.id === activeId) || null;
  useEffect(() => { if (!string && designStrings.length) setActiveId(designStrings[designStrings.length - 1].id); }, [string, designStrings]);
  const stats = useMemo(() => (string ? stringStats(string.vertices, string.closed) : null), [string]);
  const update = (patch, id = activeId) => setDesignStrings((L) => L.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  // #1910 — a name already in the list gets a (2), (3) ... suffix
  const addString = (s) => { const id = `string_${Date.now()}_${nextId++}`; setDesignStrings((L) => { const taken = new Set(L.map((x) => x.name)); let name = s.name, k = 2; while (taken.has(name)) name = `${s.name} (${k++})`; return [...L, { id, color: COLOURS[L.length % COLOURS.length], visible: true, closed: false, vertices: [], ...s, name }]; }); return id; };
  const newString = () => { const id = addString({ name: tr("String {n}", { n: designStrings.length + 1 }) }); setActiveId(id); setMsg(null); };
  const appendVertex = (p) => update({ vertices: [...string.vertices, p.map((v) => +v.toFixed(3))] });
  const models = useMemo(() => { const cat = new Set(categoricalModels(voxelModels)); return voxelModels.filter((m) => m.cells?.length && !cat.has(m)); }, [voxelModels]);

  // ---------- drawing in the 3D view ----------
  const state = useRef();
  state.current = { string, target, planeZ: num0(planeZ), snap, grid: num0(grid) || 0, appendVertex, collars, strings: designStrings, groundAt };
  useEffect(() => {
    const dom = view?.renderer.current?.domElement, scene = view?.scene.current;
    if (!drawing || !dom || !scene) return undefined;
    const prevCursor = dom.style.cursor;
    dom.style.cursor = "crosshair";
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const preview = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: "#ffd400", dashSize: 6, gapSize: 3, depthTest: false, transparent: true }));
    preview.renderOrder = 11; preview.frustumCulled = false; preview.name = "designStringPreview";
    scene.add(preview);
    const toScene = (v) => { const o = view.origin.current; return new THREE.Vector3(v[0] - o.x, v[2] - o.z, -(v[1] - o.y)); };
    const pointAt = (ev) => {
      const s = state.current, o = view.origin.current;
      let p = null, on = null;
      if (s.target === "hit" || s.target === "ground") { const w = view.worldPointAt?.(ev.clientX, ev.clientY); if (w) { p = [w.x, w.y, w.z]; on = w.on || null; } }
      // #1905 — on the ground: the E, N of what is under the cursor (or the plane), the Z from the terrain or the collars
      if (p && s.target === "ground" && s.groundAt) { const g = s.groundAt(p[0], p[1]); if (Number.isFinite(g)) { p = [p[0], p[1], g]; on = "ground"; } }
      if (!p) {
        const level = Number.isFinite(s.planeZ) ? s.planeZ : (s.string?.vertices.length ? s.string.vertices[s.string.vertices.length - 1][2] : o.z);
        const rect = dom.getBoundingClientRect();
        ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -(((ev.clientY - rect.top) / rect.height) * 2 + 1) + 2);
        ray.setFromCamera(ndc, view.camera.current);
        plane.constant = -(level - o.z);
        if (!ray.ray.intersectPlane(plane, hit)) return null;
        p = [hit.x + o.x, o.y - hit.z, level];
      }
      const last = s.string?.vertices[s.string.vertices.length - 1] || null;
      let snapped = null;
      if (ev.shiftKey && last) p = orthoPoint(last, p);
      if (s.grid > 0) p = snapToGrid(p, s.grid);
      if (s.snap) {
        // TASKS.csv #1909 — the snap is judged on the SCREEN: a candidate within 12 px of the cursor's pixel takes the point,
        // with its own Z, whatever surface lies over it (a collar under a dump still snaps); the hover names what it snapped to
        const rect = dom.getBoundingClientRect(), cam = view.camera.current;
        let best = null, bestD = 12;
        const tryCand = (v, label) => {
          const q = toScene(v).project(cam);
          if (q.z > 1) return; // behind the camera
          const d = Math.hypot(((q.x + 1) / 2) * rect.width + rect.left - ev.clientX, ((1 - q.y) / 2) * rect.height + rect.top - ev.clientY);
          if (d < bestD) { bestD = d; best = { p: v, label }; }
        };
        s.strings.forEach((st) => st.vertices.forEach((v, i) => { if (!(st.id === s.string?.id && i === st.vertices.length - 1)) tryCand(v, tr("{name} vertex {n}", { name: st.name, n: i + 1 })); }));
        s.collars.forEach((c) => { if ([c.x, c.y, c.z].every(Number.isFinite)) tryCand([c.x, c.y, c.z], String(c.hole_id ?? c.id ?? "")); });
        if (best) { p = best.p.slice(); snapped = best.label; }
      }
      return { p, snapped, on };
    };
    const onMove = (ev) => {
      const s = state.current, r = pointAt(ev);
      view.activity.current = Date.now();
      if (!r) { preview.visible = false; setHover(null); return; }
      const last = s.string?.vertices[s.string.vertices.length - 1] || null;
      const pts = last ? [last, r.p] : [r.p];
      if (s.string?.closed && s.string.vertices.length > 1) pts.push(s.string.vertices[0]);
      preview.geometry.dispose();
      preview.geometry = new THREE.BufferGeometry().setFromPoints(pts.map(toScene));
      preview.computeLineDistances();
      preview.visible = pts.length > 1;
      setHover({ p: r.p, snapped: r.snapped, on: r.on, dist: last ? Math.hypot(r.p[0] - last[0], r.p[1] - last[1]) : null, bearing: last ? bearingOf(last, r.p) : null, dz: last ? r.p[2] - last[2] : null });
    };
    dom.addEventListener("pointermove", onMove);
    view.dragHook.current = (e) => {
      const x0 = e.clientX, y0 = e.clientY;
      const onUp = (ev) => {
        window.removeEventListener("pointerup", onUp);
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 5) return; // a drag is not a click
        const r = pointAt(ev);
        if (r && state.current.string) state.current.appendVertex(r.p);
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

  // TASKS.csv #1907 — while the pane is open and nothing is being drawn, a click (no drag) on a string in the view selects it:
  // the nearest string whose segment passes within 8 px of the click, judged on the screen. The press is not claimed, so an
  // orbit still starts from it. TASKS.csv #1876 (its "not done" list) — a press within 8 px of a vertex of the ACTIVE string
  // claims it and drags that vertex: in plan on the level the vertex is at (its Z stays), or on the ground when that is the
  // drawing target. Every move is one store update, which the undo debounce folds into one step.
  useEffect(() => {
    const dom = view?.renderer.current?.domElement;
    if (drawing || !dom) return undefined;
    const toScene = (v) => { const o = view.origin.current; return new THREE.Vector3(v[0] - o.x, v[2] - o.z, -(v[1] - o.y)); };
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const planePoint = (ev, z) => {
      const rect = dom.getBoundingClientRect(), o = view.origin.current, cam = view.camera.current;
      if (!cam) return null;
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -(((ev.clientY - rect.top) / rect.height) * 2 + 1) + 2);
      ray.setFromCamera(ndc, cam);
      plane.constant = -(z - o.z);
      return ray.ray.intersectPlane(plane, hit) ? [hit.x + o.x, o.y - hit.z] : null;
    };
    const nearestVertex = (ev, st) => {
      const rect = dom.getBoundingClientRect(), cam = view.camera.current;
      if (!cam || !st) return -1;
      let best = -1, bestD = 12; // the same 12 px the snap uses
      st.vertices.forEach((v, i) => { const q = toScene(v).project(cam); if (q.z > 1) return; const d = Math.hypot(((q.x + 1) / 2) * rect.width + rect.left - ev.clientX, ((1 - q.y) / 2) * rect.height + rect.top - ev.clientY); if (d < bestD) { bestD = d; best = i; } });
      return best;
    };
    const pick = (ev) => {
      const rect = dom.getBoundingClientRect(), cam = view.camera.current;
      if (!cam) return null;
      const px = (v) => { const q = toScene(v).project(cam); return q.z > 1 ? null : [((q.x + 1) / 2) * rect.width + rect.left, ((1 - q.y) / 2) * rect.height + rect.top]; };
      const segDist = (a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy; const t = L > 0 ? Math.max(0, Math.min(1, ((ev.clientX - a[0]) * vx + (ev.clientY - a[1]) * vy) / L)) : 0; return Math.hypot(a[0] + t * vx - ev.clientX, a[1] + t * vy - ev.clientY); };
      let best = null, bestD = 8;
      for (const st of state.current.strings) {
        if (st.visible === false || !st.vertices.length) continue;
        const pts = st.vertices.map(px);
        const n = pts.length, m = st.closed && n > 2 ? n : n - 1;
        for (let i = 0; i < Math.max(1, m); i++) { const a = pts[i], b = pts[(i + 1) % n] || a; if (!a || !b) continue; const d = segDist(a, b); if (d < bestD) { bestD = d; best = st; } }
      }
      return best;
    };
    view.dragHook.current = (e) => {
      const x0 = e.clientX, y0 = e.clientY, s = state.current, st = s.string;
      const vi = st && st.visible !== false ? nearestVertex(e, st) : -1;
      if (vi >= 0) {
        const z0v = st.vertices[vi][2];
        const onMove = (ev) => {
          const p = planePoint(ev, z0v); if (!p) return;
          const g = s.target === "ground" && s.groundAt ? s.groundAt(p[0], p[1]) : NaN, z = Number.isFinite(g) ? g : z0v;
          const v = [+p[0].toFixed(3), +p[1].toFixed(3), +z.toFixed(3)];
          update({ vertices: st.vertices.map((q, i) => (i === vi ? v : q)) }, st.id);
          setHover({ p: v, snapped: null, on: null, dist: null, drag: vi + 1 });
          view.activity.current = Date.now();
        };
        const onUp = () => { window.removeEventListener("pointermove", onMove, true); window.removeEventListener("pointerup", onUp, true); setHover(null); };
        window.addEventListener("pointermove", onMove, true); window.addEventListener("pointerup", onUp, true);
        return true; // the press is ours: no orbit
      }
      // capture: the viewer's own orbit handlers on window run on the bubble phase and may stop the event there
      const onUp = (ev) => { window.removeEventListener("pointerup", onUp, true); if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 5) return; const hit = pick(ev); if (hit) { setActiveId(hit.id); setMsg(null); } };
      window.addEventListener("pointerup", onUp, true);
      return false;
    };
    return () => { view.dragHook.current = null; };
  }, [drawing, view]);

  // ---------- typed vertices and tools ----------
  const addTyped = () => { const p = [num0(typed.x), num0(typed.y), num0(typed.z)]; if (p.some((v) => v == null)) return; appendVertex(p); setTyped((t) => ({ ...t, x: "", y: "", z: "" })); };
  const addFromLast = () => {
    const last = string.vertices[string.vertices.length - 1], d = num0(typed.dist), b = num0(typed.bearing);
    if (!last || !(d > 0) || b == null) return;
    appendVertex(fromDistanceBearing(last, { distance: d, bearing: b, grade: num0(typed.grade) || 0 }));
    setTyped((t) => ({ ...t, dist: "" }));
  };
  const setVertex = (i, k, v) => { if (v == null) return false; update({ vertices: string.vertices.map((p, j) => (j === i ? p.map((c, kk) => (kk === k ? v : c)) : p)) }); };
  const deleteVertex = (i) => update({ vertices: string.vertices.filter((_, j) => j !== i) });
  const insertAfter = (i) => { const a = string.vertices[i], b = string.vertices[(i + 1) % string.vertices.length] || a; const m = a.map((c, k) => +((c + b[k]) / 2).toFixed(3)); update({ vertices: [...string.vertices.slice(0, i + 1), m, ...string.vertices.slice(i + 1)] }); };
  const doOffset = () => {
    const d = num0(tool.offset); if (!d) return;
    const vertices = offsetString(string.vertices, d, string.closed);
    const id = addString({ name: tr("{name} offset {d} m", { name: string.name, d }), closed: string.closed, vertices: vertices.map((p) => p.map((v) => +v.toFixed(3))) });
    setActiveId(id); setMsg(tr("Offset copy made. An inside corner tighter than the offset folds the copy back on itself there: check the corners."));
  };
  const doDuplicate = () => { const dE = num0(tool.dE) || 0, dN = num0(tool.dN) || 0, dZ = num0(tool.dZ) || 0; const id = addString({ name: tr("{name} copy", { name: string.name }), closed: string.closed, color: string.color, vertices: string.vertices.map((p) => [+(p[0] + dE).toFixed(3), +(p[1] + dN).toFixed(3), +(p[2] + dZ).toFixed(3)]) }); setActiveId(id); };
  const doJoin = () => { if (string.closed) { setMsg(tr("\"{name}\" is closed: open it first (Open) to join another string on at its end.", { name: string.name })); return; } const other = designStrings.find((s) => s.id === tool.joinId); if (!other) return; update({ vertices: joinStrings(string.vertices, other.vertices), closed: false }); setDesignStrings((L) => L.filter((s) => s.id !== other.id)); setTool((t) => ({ ...t, joinId: "" })); }; // closed strings are not offered (#1911)
  const doSplit = () => { const i = (num0(tool.splitAt) ?? 0) - 1, parts = splitString(string.vertices, i); if (!parts) { setMsg(tr("Split at a vertex between the first and the last.")); return; } update({ vertices: parts[0], closed: false }); addString({ name: tr("{name} (2)", { name: string.name }), color: string.color, vertices: parts[1] }); };
  const removeString = () => { const rest = designStrings.filter((s) => s.id !== string.id); setDesignStrings(rest); setActiveId(rest[rest.length - 1]?.id ?? null); setDrawing(false); setMsg(tr("\"{name}\" deleted: Undo (Ctrl+Z) brings it back.", { name: string.name })); }; // the notice: #1754

  // ---------- solids ----------
  const model = models.find((m) => (m.id ?? m.name) === solid.modelId) || null;
  const density = num0(solid.density);
  const finishSolid = (name, r, how, prefix = "") => {
    // #1904 — the tonnes are the solid's own volume at the density; the blocks (counted whole by their centre) give the grade only
    const tonnage = model && density > 0 ? solidTonnage(r.positions, r.indices, model.cells, density) : null;
    const tonnes = density > 0 ? r.volume * density : null, blockM = model?.cells?.[0]?.dx;
    onAdd?.({ name, positions: r.positions, indices: r.indices, volumeM3: r.volume, type: "design_solid", closure: "closed", color: "#5c7cfa", tag: "string",
      tip: tr("Solid from design strings ({how}): a drawn shape, not a modelled one", { how }),
      params: { tool: `solid from design strings (${how})`, strings: how === "extrude" ? [string.name] : solid.loft.map((id) => designStrings.find((s) => s.id === id)?.name), volumeM3: Math.round(r.volume), ...(tonnes != null ? { density, tonnes: Math.round(tonnes) } : {}), ...(tonnage ? { blockModel: model.name, blockSizeM: blockM, blocksInside: tonnage.blocks, blockTonnes: Math.round(tonnage.tonnes), meanGrade: tonnage.meanGrade == null ? null : +tonnage.meanGrade.toPrecision(4), gradeFrom: "blocks whose centre lies inside, counted whole" } : {}), warnings: r.warnings || [], generatedAt: new Date().toISOString() } });
    setMsg(prefix + (tonnage
      ? tr("\"{name}\": {v} m³ = {t} t at {d} t/m³{g} from {n} block(s) of {m} ({b} m, counted whole by their centre).", { name, v: big(r.volume), t: big(tonnes), d: density, n: tonnage.blocks, m: model.name, b: blockM, g: tonnage.meanGrade == null ? tr("; no grade") : tr("; mean grade {g}", { g: Number(tonnage.meanGrade.toPrecision(3)) }) })
      : tonnes != null ? tr("\"{name}\": {v} m³ = {t} t at {d} t/m³. Choose a block model for its grade.", { name, v: big(r.volume), t: big(tonnes), d: density })
      : tr("\"{name}\": {v} m³. Enter a density for its tonnes, and a block model for its grade.", { name, v: big(r.volume) })));
  };
  const doExtrude = () => {
    const z0 = num0(solid.zBottom), z1 = num0(solid.zTop);
    if (!string?.closed || string.vertices.length < 3 || z0 == null || z1 == null) return;
    try { const r = extrudeString(string.vertices, Math.min(z0, z1), Math.max(z0, z1)); if (!r) { setMsg(tr("The string could not be extruded: it needs three or more points and a height.")); return; } finishSolid(tr("{name} extruded {a} to {b} m", { name: string.name, a: Math.min(z0, z1), b: Math.max(z0, z1) }), r, "extrude", z0 > z1 ? tr("Bottom and top were swapped. ") : ""); } // swap note: #1908
    catch (e) { setMsg(e.message || String(e)); }
  };
  const doLoft = () => {
    const picked = designStrings.filter((s) => solid.loft.includes(s.id) && s.closed && s.vertices.length > 2);
    if (picked.length < 2) return;
    try { const r = loftStrings(picked); if (!r || r.failed) { setMsg(r?.failed === "same-level" ? tr("Two of the strings are on the same elevation: a loft needs one closed string per level.") : tr("The strings could not be lofted.")); return; } finishSolid(tr("Loft of {list}", { list: picked.map((s) => s.name).join(", ") }), r, "loft"); if (r.warnings?.length) setMsg((m) => `${m || ""} ${r.warnings.join(" ")}`); }
    catch (e) { setMsg(e.message || String(e)); }
  };

  // ---------- files ----------
  const exportCsv = () => saveFile({ suggestedName: "design_strings.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(stringRows(designStrings).map((r) => ({ ...r, crs: crsCell(project) }))) });
  const exportDxf = () => saveFile({ suggestedName: "design_strings.dxf", filters: [{ name: "DXF", extensions: ["dxf"] }], content: buildDXF({ features: stringFeatures(designStrings), geomType: "line", layerOf: (f) => f.attributes.name, colorOf: (f) => f.attributes.color }) });
  const importDxf = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      // #1906 — a polyline with no Z goes on the drawing plane when one is typed, else on the ground (terrain or collars), else 0
      const z = target === "plane" ? num0(planeZ) : null; // the plane counts only while it is the target (#1938)
      const zDefault = z != null ? z : groundAt ? (x, y) => { const g = groundAt(x, y); return Number.isFinite(g) ? +g.toFixed(2) : 0; } : 0;
      const { strings, skipped, flat } = stringsFromDxf(text, { zDefault, baseName: file.name.replace(/\.dxf$/i, "") });
      if (!strings.length) { setMsg(tr("No polylines in {f}.", { f: file.name })); return; }
      strings.forEach((s) => addString({ name: s.name, closed: s.closed, vertices: s.vertices }));
      const skippedN = Object.values(skipped || {}).reduce((a, b) => a + b, 0);
      const flatText = !flat ? "" : z != null ? tr("; {k} string(s) with no Z put at {z} m (the drawing plane)", { k: flat, z }) : groundAt ? tr("; {k} string(s) with no Z draped on the ground ({src})", { k: flat, src: terrain ? tr("the terrain") : tr("interpolated between the collars") }) : tr("; {k} string(s) with no Z put at 0 m: no terrain, collars or drawing plane to take it from", { k: flat });
      setMsg(tr("{n} string(s) from {f}, taken as {crs}{z}{sk}.", { n: strings.length, f: file.name, crs: crsCell(project) || tr("the project's coordinates"), z: flatText, sk: skippedN ? tr("; {k} other entities skipped", { k: skippedN }) : "" }));
    } catch (e) { setMsg(e.message || String(e)); }
  };
  const closedStrings = designStrings.filter((s) => s.closed && s.vertices.length > 2);

  return (
    <div>
      <TaskPaneHeader title="Design strings" icon={PenTool} tone="model" onClose={onClose} />
      <div style={note}>{tr("Free polylines and polygons in 3D: draw them in the view, type them, offset, join and split them, and turn closed ones into solids. DXF in and out.")} {tr("Drawn shapes, not modelled ones: they are not shown in sections or level plans, and a solid is the strings' plan outline between elevations.")}</div>{/* #1913 */}
      <input ref={fileRef} type="file" accept=".dxf" style={{ display: "none" }} onChange={(e) => { importDxf(e.target.files?.[0]); e.target.value = ""; }} />

      <div style={label}>{tr("String")}</div>
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        <select value={activeId ?? ""} onChange={(e) => { setActiveId(e.target.value); setDrawing(false); }} disabled={!designStrings.length} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Design string")}>
          {!designStrings.length && <option value="">{tr("No strings yet")}</option>}
          {designStrings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {string?.vertices?.length > 0 && view?.zoomTo && <Maximize2 size={14} style={{ cursor: "pointer", flexShrink: 0, alignSelf: "center" }} {...iconAction(() => view.zoomTo(string.vertices), tr("Zoom to this string"))} />}{/* #1892 */}
        <button onClick={newString} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 8px" }}><Plus size={13} /> {tr("New string")}</button>
      </div>
      {string && !drawing && <div style={note}>{tr("In the view: click a string to select it; drag a vertex of the selected string to move it (on its own level, or on the ground when that is the drawing target).")}</div>}{/* #1907 / #1876 */}
      {string && (<>
        <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
          <input key={string.id} defaultValue={string.name} onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== string.name) update({ name: n }); }} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Name of the string")} />
          <input type="color" value={string.color} onChange={(e) => update({ color: e.target.value })} aria-label={tr("Colour of the string")} style={{ width: 24, height: 22, padding: 0, border: "none", background: "none" }} />
          <label style={{ ...note, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}><input type="checkbox" checked={!!string.closed} onChange={(e) => update({ closed: e.target.checked })} />{tr("Closed")}</label>
          <label style={{ ...note, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}><input type="checkbox" checked={string.visible !== false} onChange={(e) => update({ visible: e.target.checked })} />{tr("Show")}</label>
          <Trash2 size={14} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} {...iconAction(removeString, tr("Delete this string"))} />
        </div>

        <div style={label}>{tr("Draw")}</div>
        <label style={row}>{tr("Clicks land on")}<select value={target} onChange={(e) => setTarget(e.target.value)} style={{ ...smallSel, width: 150 }} aria-label={tr("Where a click lands")}>{groundAt && <option value="ground">{terrain ? tr("the ground (terrain)") : tr("the ground (between the collars)")}</option>}<option value="hit">{tr("what is under the cursor")}</option><option value="plane">{tr("an elevation plane")}</option></select></label>{/* ground: #1905 */}
        {target === "plane" && <label style={row}>{tr("Plane elevation (m)")}<input type="number" step="any" value={planeZ} onChange={(e) => setPlaneZ(e.target.value)} placeholder={tr("last vertex")} style={num} aria-label={tr("Elevation of the drawing plane")} /></label>}
        <div style={{ ...row, justifyContent: "flex-start", gap: 10 }}>
          <label style={{ ...note, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }} title={tr("Within about 12 pixels of another vertex or a collar the click takes that point.")}><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />{tr("Snap to vertices and collars")}</label>
          <label style={{ ...note, display: "flex", alignItems: "center", gap: 3 }}>{tr("Grid (m)")}<input type="number" min={0} step="any" value={grid} onChange={(e) => setGrid(e.target.value)} placeholder={tr("off")} style={{ ...smallSel, width: 52 }} aria-label={tr("Grid the clicks snap to")} /></label>
        </div>
        <button onClick={() => setDrawing((d) => !d)} aria-pressed={drawing} style={{ ...pBtn, marginTop: 6, background: drawing ? "var(--color-selected-bg)" : undefined }}>
          <PenTool size={14} /> {drawing ? tr("Click points in the view. Shift: a grid direction. Esc stops; right-drag moves the view") : tr("Draw in the 3D view")}
        </button>
        {!drawing && hover?.drag && <div style={note}>{tr("Moving vertex {n}: E {x}, N {y}, Z {z}", { n: hover.drag, x: m1(hover.p[0]), y: m1(hover.p[1]), z: m1(hover.p[2]) })}</div>}{/* #1876 drag */}
        {drawing && hover && <div style={note}>{hover.dist != null ? tr("Next: {d} m on {b}°, {dz} m in Z{s}", { d: m1(hover.dist), b: Math.round(hover.bearing), dz: m1(hover.dz), s: hover.snapped ? tr(" (snapped to {name})", { name: hover.snapped }) : "" }) : tr("E {x}, N {y}, Z {z}{s}", { x: m1(hover.p[0]), y: m1(hover.p[1]), z: m1(hover.p[2]), s: hover.snapped ? tr(" (snapped to {name})", { name: hover.snapped }) : "" })}{hover.on && !hover.snapped ? ` ${hover.on === "ground" ? tr("(on the ground)") : tr("(on {name})", { name: hover.on })}` : ""}</div>}{/* on: #1905 */}
        <div style={{ ...row, flexWrap: "wrap", gap: 3 }}>
          <Cell value={num0(typed.x)} width={66} placeholder="E" ariaLabel={tr("Easting of the vertex")} onCommit={(v) => setTyped((t) => ({ ...t, x: v == null ? "" : String(v) }))} />
          <Cell value={num0(typed.y)} width={70} placeholder="N" ariaLabel={tr("Northing of the vertex")} onCommit={(v) => setTyped((t) => ({ ...t, y: v == null ? "" : String(v) }))} />
          <Cell value={num0(typed.z)} width={52} placeholder="Z" ariaLabel={tr("Elevation of the vertex")} onCommit={(v) => setTyped((t) => ({ ...t, z: v == null ? "" : String(v) }))} />
          <button onClick={addTyped} disabled={[typed.x, typed.y, typed.z].some((v) => num0(v) == null)} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 6px" }}>{tr("Add vertex")}</button>
        </div>
        {string.vertices.length > 0 && (
          <div style={{ ...row, flexWrap: "wrap", gap: 3 }}>
            <Cell value={num0(typed.dist)} width={56} placeholder={tr("length")} ariaLabel={tr("Distance to the next vertex")} onCommit={(v) => setTyped((t) => ({ ...t, dist: v == null ? "" : String(v) }))} />
            <Cell value={num0(typed.bearing)} width={52} placeholder={tr("az °")} ariaLabel={tr("Bearing to the next vertex")} onCommit={(v) => setTyped((t) => ({ ...t, bearing: v == null ? "" : String(v) }))} />
            <Cell value={num0(typed.grade)} width={46} placeholder="%" ariaLabel={tr("Grade to the next vertex")} onCommit={(v) => setTyped((t) => ({ ...t, grade: v == null ? "0" : String(v) }))} />
            <button onClick={addFromLast} disabled={!(num0(typed.dist) > 0) || num0(typed.bearing) == null} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 6px" }}>{tr("Add from last")}</button>
          </div>
        )}

        {string.vertices.length > 0 && (<>
          <div style={label}>{tr("Vertices ({n})", { n: string.vertices.length })}</div>
          <div style={{ maxHeight: 180, overflow: "auto" }}>
            {string.vertices.map((p, i) => (
              <div key={i} style={{ ...row, gap: 3, marginTop: 2 }}>
                <span style={{ width: 18, flexShrink: 0, fontSize: "var(--font-size-xs)" }}>{i + 1}</span>
                {[0, 1, 2].map((k) => <Cell key={k} value={p[k]} width={k === 2 ? 52 : 66} ariaLabel={tr("Vertex {n} {axis}", { n: i + 1, axis: ["E", "N", "Z"][k] })} onCommit={(v) => setVertex(i, k, v)} />)}
                <Plus size={12} style={{ cursor: "pointer", flexShrink: 0 }} {...iconAction(() => insertAfter(i), tr("Insert a vertex after {n}", { n: i + 1 }))} />
                <X size={12} style={{ cursor: "pointer", flexShrink: 0 }} {...iconAction(() => deleteVertex(i), tr("Remove vertex {n}", { n: i + 1 }))} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6, padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
            <div style={row}><span>{tr("Length in plan / 3D")}</span><b>{m1(stats.length2d)} / {m1(stats.length3d)} m</b></div>
            {string.closed && <div style={row}><span>{tr("Area in plan")}</span><b>{stats.area >= 10000 ? `${(stats.area / 10000).toFixed(2)} ha` : `${m1(stats.area)} m²`}</b></div>}{/* two decimals as the dump pane: #1913 */}
            <div style={row}><span>{tr("Elevation")}</span><b>{m1(stats.box[2])} – {m1(stats.box[5])} m</b></div>
          </div>

          <div style={label}>{tr("Tools")}</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
            <button onClick={() => update({ vertices: reverseString(string.vertices) })} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 8px" }}>{tr("Reverse")}</button>
            <button onClick={() => update({ closed: !string.closed })} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 8px" }}>{string.closed ? tr("Open") : tr("Close")}</button>
          </div>
          <div style={{ ...row, flexWrap: "wrap", gap: 3 }}>
            <Cell value={num0(tool.offset)} width={56} placeholder={tr("m")} ariaLabel={tr("Offset distance")} onCommit={(v) => setTool((t) => ({ ...t, offset: v == null ? "" : String(v) }))} />
            <button onClick={doOffset} disabled={!num0(tool.offset) || string.vertices.length < 2} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "3px 6px" }} title={tr("A parallel copy in plan: to the right of the direction of travel, outward on a closed string; negative goes the other way.")}>{tr("Offset copy")}</button>
          </div>
          <div style={{ ...row, flexWrap: "wrap", gap: 3 }}>
            {["dE", "dN", "dZ"].map((k) => <Cell key={k} value={num0(tool[k])} width={50} placeholder={k} ariaLabel={tr("Copy shift {k}", { k })} onCommit={(v) => setTool((t) => ({ ...t, [k]: v == null ? "" : String(v) }))} />)}
            <button onClick={doDuplicate} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "3px 6px" }}>{tr("Copy shifted")}</button>
          </div>
          {designStrings.length > 1 && (
            <div style={{ ...row, flexWrap: "wrap", gap: 3 }}>
              <select value={tool.joinId} onChange={(e) => setTool((t) => ({ ...t, joinId: e.target.value }))} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("String to join")}><option value="">{tr("— join with —")}</option>{designStrings.filter((s) => s.id !== string.id && !s.closed).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <button onClick={doJoin} disabled={!tool.joinId || string.closed} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 6px", opacity: string.closed ? 0.5 : 1 }} title={string.closed ? tr("A closed string cannot take another on: open it first.") : tr("The other string is added on at the nearest ends and removed.")}>{tr("Join")}</button>{/* closed: #1937 */}
            </div>
          )}
          {string.vertices.length > 2 && (
            <div style={{ ...row, flexWrap: "wrap", gap: 3 }}>
              <Cell value={num0(tool.splitAt)} width={52} placeholder={tr("vertex")} ariaLabel={tr("Vertex to split at")} onCommit={(v) => setTool((t) => ({ ...t, splitAt: v == null ? "" : String(v) }))} />
              <button onClick={doSplit} disabled={!(num0(tool.splitAt) > 1 && num0(tool.splitAt) < string.vertices.length)} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, padding: "3px 6px" }}>{tr("Split at vertex")}</button>
            </div>
          )}
        </>)}
      </>)}

      {closedStrings.length > 0 && (<>
        <div style={label}>{tr("Solids from strings")}</div>
        <label style={row}>{tr("Block model")}<select value={solid.modelId} onChange={(e) => setSolid((s) => ({ ...s, modelId: e.target.value }))} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Block model counted inside the solid")}><option value="">{tr("— none —")}</option>{models.map((m) => <option key={m.id ?? m.name} value={m.id ?? m.name}>{m.name}</option>)}</select></label>
        <label style={row}>{tr("Density (t/m³)")}<input type="number" min={0} step="any" value={solid.density} onChange={(e) => setSolid((s) => ({ ...s, density: e.target.value }))} style={num} aria-label={tr("Density of the rock in the solid")} /></label>
        {string?.closed && string.vertices.length > 2 && (
          <div style={{ ...row, flexWrap: "wrap", gap: 3 }}>
            <span style={note}>{tr("Extrude \"{name}\"", { name: string.name })}</span>
            <Cell value={num0(solid.zBottom)} width={60} placeholder={tr("from Z")} ariaLabel={tr("Bottom elevation of the solid")} onCommit={(v) => setSolid((s) => ({ ...s, zBottom: v == null ? "" : String(v) }))} />
            <Cell value={num0(solid.zTop)} width={60} placeholder={tr("to Z")} ariaLabel={tr("Top elevation of the solid")} onCommit={(v) => setSolid((s) => ({ ...s, zTop: v == null ? "" : String(v) }))} />
            <button onClick={doExtrude} disabled={num0(solid.zBottom) == null || num0(solid.zTop) == null || num0(solid.zBottom) === num0(solid.zTop)} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 6px" }}><Box size={13} /> {tr("Make solid")}</button>
          </div>
        )}
        {closedStrings.length > 1 && (
          <div style={{ marginTop: 4 }}>
            <div style={note}>{tr("Loft closed strings on different levels into one body:")} {tr("An extrude uses the plan outline only; a loft takes each ring flat at its mean elevation.")}</div>{/* #1908 */}
            {closedStrings.map((s) => <label key={s.id} style={{ ...note, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}><input type="checkbox" checked={solid.loft.includes(s.id)} onChange={(e) => setSolid((o) => ({ ...o, loft: e.target.checked ? [...o.loft, s.id] : o.loft.filter((id) => id !== s.id) }))} />{s.name} <span style={{ color: "var(--color-text-muted)" }}>{(() => { const b = stringStats(s.vertices, true).box, mean = s.vertices.reduce((a, p) => a + p[2], 0) / s.vertices.length; return b[5] - b[2] > 1 ? tr("({z} m, sloped {lo}–{hi}: taken flat at its mean)", { z: m1(mean), lo: m1(b[2]), hi: m1(b[5]) }) : `(${m1(mean)} m)`; })()}</span></label>)}{/* the loft's own level: #1908 */}
            <button onClick={doLoft} disabled={solid.loft.filter((id) => closedStrings.some((s) => s.id === id)).length < 2} style={{ ...pBtn, marginTop: 4 }}><Box size={13} /> {tr("Loft into a solid")}</button>
          </div>
        )}
        <div style={note}>{tr("A solid joins the generated surfaces (3D Modelling) with its volume and, at a density, its tonnes; a block model gives its mean grade from the blocks whose centre lies inside.")}</div>{/* #1936 */}
      </>)}

      {msg && <div style={warn}>{msg}</div>}
      <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
        <button onClick={() => fileRef.current?.click()} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0 }} title={tr("Polylines of a DXF as strings, taken as the project's coordinates")}><Upload size={13} /> {tr("Import DXF")}</button>
        {designStrings.some((s) => s.vertices.length > 1) && <button onClick={exportDxf} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0 }}><Download size={13} /> DXF</button>}
        {designStrings.some((s) => s.vertices.length) && <button onClick={exportCsv} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0 }}><Download size={13} /> CSV</button>}
      </div>
    </div>
  );
}
