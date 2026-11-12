// TASKS.csv #2767 (#2630 (2)) — edit a finished interpretation line's vertices in the 3D view: its vertices show as handles, a press within
// 12 px of one drags it (in plan, at the vertex's own level: the terrain under it, else the layer's elevation), snapping to a collar, a logged
// boundary or a trace as the drawing does when the pane's switch is on; the release commits one store update. The same pattern as the Mine
// Design strings' vertex drag (DesignStringsPane, #1876): the 3D View's dragHook claims the press, so the view does not orbit.
//
// view: { scene, camera, renderer, dragHook, origin, activity } (refs, from ViewerModule); layer / index: the line being edited (null: off);
// groundAt(x, y): terrain elevation or NaN; snap: { on, ctx() -> { traces, layers, visible } }; onMove(vi, [x, y], tie | null).
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { snapInterpretClick } from "../lib/viewer/interpretSnap.js";

const HANDLE_PX = 12;

export function useInterpretVertexEdit({ view, layer, index, groundAt, snap, onMove }) {
  const part = index != null ? layer?.features?.[index]?.parts?.[0] : null;
  const live = useRef(null); live.current = { snap, onMove }; // read at drag time: the latest snap switch, traces and store update
  useEffect(() => {
    const scene = view?.scene?.current, dom = view?.renderer?.current?.domElement;
    if (!part || !scene || !dom || !view.dragHook) return undefined;
    const o = () => view.origin.current;
    const zAt = (x, y) => { const g = groundAt ? groundAt(x, y) : NaN; return Number.isFinite(g) ? g : Number.isFinite(layer.elevation) ? layer.elevation : 0; };
    const toScene = (x, y, z) => new THREE.Vector3(x - o().x, z - o().z, -(y - o().y));
    const verts = part.map(([x, y]) => [x, y, zAt(x, y)]);
    // handles: screen-size points, always on top
    const handles = new THREE.Points(new THREE.BufferGeometry().setFromPoints(verts.map((v) => toScene(...v))), new THREE.PointsMaterial({ color: 0xd97706, size: 9, sizeAttenuation: false, depthTest: false }));
    handles.renderOrder = 999;
    scene.add(handles);
    const preview = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xd97706, depthTest: false }));
    preview.renderOrder = 999; preview.visible = false;
    scene.add(preview);
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const setRay = (ev) => { const r = dom.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, view.camera.current); return r; };
    const nearest = (ev) => {
      const r = dom.getBoundingClientRect(), cam = view.camera.current;
      let best = -1, bestD = HANDLE_PX;
      verts.forEach((v, i) => { const q = toScene(...v).project(cam); if (q.z > 1) return; const d = Math.hypot(((q.x + 1) / 2) * r.width + r.left - ev.clientX, ((1 - q.y) / 2) * r.height + r.top - ev.clientY); if (d < bestD) { bestD = d; best = i; } });
      return best;
    };
    view.dragHook.current = (e) => {
      const vi = nearest(e);
      if (vi < 0) return false; // not on a vertex: the press orbits as usual
      const x0 = e.clientX, y0 = e.clientY;
      let last = null;
      const onPtr = (ev) => {
        const r = setRay(ev);
        plane.constant = -(verts[vi][2] - o().z);
        if (!ray.ray.intersectPlane(plane, hit)) return;
        let w = { x: hit.x + o().x, y: o().y - hit.z, z: verts[vi][2] };
        const sn = live.current.snap;
        if (sn?.on) w = snapInterpretClick(w, ray.ray, { on: true, ...(sn.ctx?.() || {}), origin: o(), camera: view.camera.current, heightPx: r.height }) || w;
        last = w;
        const pts = verts.map((v, i) => (i === vi ? toScene(w.x, w.y, v[2]) : toScene(...v)));
        preview.geometry.dispose(); preview.geometry = new THREE.BufferGeometry().setFromPoints(pts); preview.visible = true;
        if (view.activity) view.activity.current = Date.now();
      };
      const onUp = (ev) => {
        window.removeEventListener("pointermove", onPtr, true); window.removeEventListener("pointerup", onUp, true);
        preview.visible = false;
        if (last && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 2) live.current.onMove(vi, [last.x, last.y], last.snap || null);
        if (view.activity) view.activity.current = Date.now();
      };
      window.addEventListener("pointermove", onPtr, true); window.addEventListener("pointerup", onUp, true);
      return true; // the press is ours: no orbit
    };
    if (view.activity) view.activity.current = Date.now();
    return () => {
      view.dragHook.current = null;
      scene.remove(handles); handles.geometry.dispose(); handles.material.dispose();
      scene.remove(preview); preview.geometry.dispose(); preview.material.dispose();
      if (view.activity) view.activity.current = Date.now();
    };
  }, [part, layer?.elevation, view, groundAt]);
}
