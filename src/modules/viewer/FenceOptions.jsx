// TASKS.csv #1180 — what a fence series will cover and how many sections that makes, before any is created. Mounted only while its pane is open.
// TASKS.csv #3971 (Matt: "I want to have the option to draw a box here before generating fence series and that will be my boundary for the
// fence series") — the Area the series covers: all the drilling (as before), a box drawn on the view from above (turned to the series azimuth,
// its corners dragged), or the box round a boundary or claim (#3954's list, lib/fetchAreas.js). The box is drawn on the view while this pane is
// open; the count is the box's. The choice is saved with the project (ViewerModule fenceArea), so a rerun uses the same box.
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { t as tr } from "../../lib/i18n.js";
import { colors } from "../../lib/theme.js";
import { fenceExtentPoints } from "../../lib/sectionDefs.js";
import { fenceTracesOf } from "../../lib/holeFilter.js"; // TASKS.csv #3561
import { fetchAreaChoices } from "../../lib/fetchAreas.js";
import { fenceLinesInBox, areaBox, boxCorners, boxFromCorners, moveCorner } from "../../lib/fenceBox.js";
import NumberInput from "../../components/NumberInput.jsx"; // TASKS.csv #4004 — #3954's Margin (m) for a boundary or claim

// the box on the view (an outline and its four corner handles, over everything), and the pointer: a corner dragged, or a new box drawn
function useBoxOnView(view, box, azimuth, drawing, level, onBox) {
  const st = useRef(); st.current = { view, box, azimuth, drawing, level, onBox };
  const scene = view?.scene?.current;
  useEffect(() => {
    const v = st.current.view;
    if (!scene || !box) return undefined;
    const o = v.origin.current, z = level - o.z;
    const cs = boxCorners(box, azimuth).map((c) => new THREE.Vector3(c.x - o.x, z, -(c.y - o.y)));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(cs), new THREE.LineBasicMaterial({ color: colors.primary, depthTest: false, transparent: true }));
    const handles = new THREE.Points(new THREE.BufferGeometry().setFromPoints(cs), new THREE.PointsMaterial({ color: colors.primary, size: 9, sizeAttenuation: false, depthTest: false, transparent: true }));
    for (const m of [line, handles]) { m.renderOrder = 12; m.frustumCulled = false; m.name = "fenceSeriesBox"; }
    scene.add(line, handles); v.activity.current = Date.now();
    return () => { scene.remove(line, handles); line.geometry.dispose(); line.material.dispose(); handles.geometry.dispose(); handles.material.dispose(); v.activity.current = Date.now(); };
  }, [scene, box, azimuth, level]);
  const dom = view?.renderer?.current?.domElement;
  useEffect(() => {
    const v = st.current.view;
    if (!dom || !v?.dragHook) return undefined;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ground = (ev) => { // the plan point under the pointer, on the box's level
      const s = st.current, rect = dom.getBoundingClientRect(), o = s.view.origin.current;
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -(((ev.clientY - rect.top) / rect.height) * 2 - 1));
      ray.setFromCamera(ndc, s.view.camera.current);
      plane.constant = -(s.level - o.z);
      return ray.ray.intersectPlane(plane, hit) ? { x: hit.x + o.x, y: o.y - hit.z } : null;
    };
    const onScreen = (p) => {
      const s = st.current, o = s.view.origin.current, rect = dom.getBoundingClientRect();
      const q = new THREE.Vector3(p.x - o.x, s.level - o.z, -(p.y - o.y)).project(s.view.camera.current);
      return { x: rect.left + ((q.x + 1) / 2) * rect.width, y: rect.top + ((1 - q.y) / 2) * rect.height };
    };
    const prev = v.dragHook.current;
    const hook = (e, ...rest) => {
      const s = st.current;
      let corner = -1;
      if (s.box) boxCorners(s.box, s.azimuth).forEach((c, i) => { const p = onScreen(c); if (Math.hypot(p.x - e.clientX, p.y - e.clientY) <= 9) corner = i; });
      if (corner < 0 && !s.drawing) return prev ? prev(e, ...rest) : false; // not ours: the view orbits as usual
      const start = ground(e);
      if (!start) return false;
      const from = s.box;
      const onMove = (ev) => {
        const p = ground(ev), t = st.current;
        if (!p) return;
        const b = corner >= 0 ? moveCorner(from, t.azimuth, corner, p) : boxFromCorners(start, p, t.azimuth);
        if (b.len > 1 && b.wid > 1) t.onBox(b, false);
        t.view.activity.current = Date.now();
      };
      const onUp = (ev) => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); onMove(ev); st.current.onBox(null, true); };
      window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
      return true;
    };
    v.dragHook.current = hook;
    const cursor = dom.style.cursor;
    if (drawing) dom.style.cursor = "crosshair";
    return () => { if (v.dragHook.current === hook) v.dragHook.current = prev || null; dom.style.cursor = cursor; };
  }, [dom, drawing]);
}

export default function FenceOptions({ voxelModels, tracesRef, tracesSeq, visibleHoles, azimuth, width, cover, setCover, labelStyle, area = null, setArea, boundaries = [], topView, view }) {
  // tracesSeq says the ref's traces changed
  const all = tracesRef.current, traces = useMemo(() => fenceTracesOf(all, visibleHoles), [all, tracesSeq, visibleHoles]); // #3561
  const pts = useMemo(() => fenceExtentPoints(voxelModels, traces, cover), [voxelModels, traces, cover]);
  // #3971 — the area: its box (a drag in progress shows its draft until the pointer is let go: one change saved, not one per move)
  const [drawing, setDrawing] = useState(false), [draft, setDraft] = useState(null), draftRef = useRef(null);
  const saved = useMemo(() => areaBox(area, azimuth, boundaries), [area, azimuth, boundaries]);
  const box = draft || saved;
  const r = useMemo(() => fenceLinesInBox(pts, azimuth, width, traces, box), [pts, azimuth, width, traces, box]);
  const n = r.lines.length;
  const outlines = useMemo(() => fetchAreaChoices({ boundaries }, { marginM: 0 }).filter((c) => c.kind === "boundary" || c.kind === "claim"), [boundaries]);
  const level = useMemo(() => { let z = -Infinity; for (const t of traces || []) for (const v of t.wz || []) if (v > z) z = v; return Number.isFinite(z) ? z : view?.origin?.current?.z ?? 0; }, [traces, view]);
  useBoxOnView(view, box, azimuth, drawing, level, (b, done) => {
    if (b) { draftRef.current = b; setDraft(b); }
    if (done) { if (draftRef.current) setArea?.({ kind: "box", box: draftRef.current }); draftRef.current = null; setDraft(null); setDrawing(false); }
  });
  const value = drawing ? "draw" : !area || area.kind === "all" ? "all" : area.kind === "box" ? "box" : `b:${area.id}`;
  const choose = (v) => {
    setDrawing(v === "draw");
    if (v === "draw") topView?.();
    else if (v === "all") setArea?.(null);
    else if (v.startsWith("b:")) setArea?.({ kind: "boundary", id: v.slice(2), ...(area?.margin > 0 ? { margin: area.margin } : {}) }); // #4004 — the margin kept from one boundary to the next
  };
  return (
    <>
      <label style={{ ...labelStyle, display: "flex", gap: 6, alignItems: "center" }}>{tr("Area")}
        <select value={value} onChange={(e) => choose(e.target.value)} aria-label={tr("Area")} style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-sm)" }}>
          <option value="all">{tr("All the drilling")}</option>
          {area?.kind === "box" && <option value="box">{tr("The box drawn")}</option>}
          <option value="draw">{tr("Draw a box…")}</option>
          {outlines.map((c) => <option key={c.id} value={`b:${c.id.replace(/^boundary_/, "")}`}>{c.label}</option>)}
        </select>
      </label>
      {(drawing || area?.kind === "box") && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6 }}>{drawing ? tr("Drag on the view, or on Maps › Fence box, to draw it.") /* #4004 */ : tr("Drag a corner to change it.")}</div>}
      {area?.kind === "boundary" && ( /* TASKS.csv #4004 — the box round a boundary or claim, widened by a margin on every side (0 allowed) */
        <label style={{ ...labelStyle, display: "flex", gap: 6, alignItems: "center" }}>{tr("Margin (m)")}
          <NumberInput value={area.margin || 0} min={0} step={50} onChange={(m) => setArea?.({ ...area, margin: Math.max(0, Number(m) || 0) })} aria-label={tr("Margin (m)")} style={{ width: 64, fontSize: "var(--font-size-sm)" }} />
        </label>
      )}
      <label style={{ ...labelStyle, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} />{tr("Also cover the visible block models")}</label>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 12 }} data-fence-count={n}>{tr("This makes {n} section(s).", { n })}{traces.length < (all || []).length ? " " + tr("Over the {shown} of {total} holes shown.", { shown: traces.length.toLocaleString(), total: all.length.toLocaleString() }) : ""}{r.empty > 0 ? " " + tr("{e} slab(s) with no hole or model cell are skipped.", { e: r.empty }) : ""}</div>{/* #2040 */}
    </>
  );
}
