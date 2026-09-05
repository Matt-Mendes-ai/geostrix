// TASKS.csv #145 — MANUAL SURFACE EDITING / SCULPTING: the interaction layer.
//
// All of the maths lives in sculpt.js (three.js-free, verified in bare Node against analytic ground
// truth). This hook is only the wiring: picking a point on a real surface with the real camera,
// previewing the edit live, committing it, and undoing it.
//
// It lives in its own file rather than inside ViewerModule.jsx for the obvious reason (that file is
// already ~380 KB) and one less obvious one: ViewerModule is under concurrent edit by other work, so
// a self-contained hook plus a component keeps this feature's footprint in the shared file down to a
// handful of lines instead of a large new region.
//
// ---------------------------------------------------------------------------------------------
// WHY CLICK-THEN-OFFSET, NOT CLICK-AND-DRAG.
//
// The obvious sculpt gesture is drag-on-the-mesh. It was deliberately not built, for two reasons:
//   1. ViewerModule implements its own orbit/pan on pointerdown/pointermove over the same canvas. A
//      drag-to-sculpt mode has to fight that, and the failure mode is the surface lurching while the
//      camera also spins — the exact "looks right in code, wrong against a real camera" trap.
//   2. It is worse for the actual job. A geologist correcting a contact knows the number: "this
//      hanging wall is about 4 m too shallow here." A numeric offset with a numeric radius is
//      reproducible, is recordable in provenance as an exact quantity, and can be typed again on a
//      neighbouring patch to match. A mouse drag is none of those things.
// So: click the surface to place the brush, then set radius and offset as numbers, watching the live
// preview, then Apply. The camera is never touched.
//
// ---------------------------------------------------------------------------------------------
// COORDINATE FRAME. Everything here works in SCENE space — the frame the meshes are already in, the
// frame the raycaster returns hits in, and (being a rigid motion away from project coordinates) a
// frame where one unit is one metre. The existing world<->scene convention is used unchanged and only
// for DISPLAY of the anchor position (world = [sx + ox, oy - sz, sy + oz], the same inverse
// meshExport.js's sceneVertsToWorld and the #52 hydration effect both use). No new transform is
// invented here.
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  computeVertexNormals, buildBrush, brushNormal, applyBrush, trianglesUnderBrush,
  expandForNormals, updatePatchNormals, countFlippedTriangles, signedVolume, volumeDelta,
  captureUndo, restoreUndo,
} from "./sculpt.js";

const DEFAULT_RADIUS = 25; // metres — a sensible starting brush for a drillhole-scale contact
const MAX_HISTORY = 30;

export function useSculpt({ surfaces, meshesRef, groupRef, mountRef, cameraRef, originRef, setImplicitSurfaces, setNotices, onGeometryEdited }) {
  const [targetId, setTargetId] = useState(null);
  const [radius, setRadiusState] = useState(DEFAULT_RADIUS);
  const [offset, setOffsetState] = useState(0);
  const [axis, setAxisState] = useState("normal"); // "normal" | "vertical"
  // Everything the UI needs to render, kept as state; everything the maths needs, kept in a ref (typed
  // arrays and a BVH-sized brush have no business triggering React renders).
  const [anchorInfo, setAnchorInfo] = useState(null);
  const [historyDepth, setHistoryDepth] = useState(0);
  const anchorRef = useRef(null);
  const historyRef = useRef({}); // surfaceId -> [{record, }]
  const markerRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());

  const notify = useCallback((msg) => setNotices?.((p) => [...p, msg]), [setNotices]);

  // BUG FOUND IN LIVE TESTING, not by reading the code. The surface being sculpted was removed from
  // the scene while sculpt mode was on (in that session, by a hot reload wiping the surface list; a
  // user pressing the row's X does exactly the same thing). `targetId` then pointed at a surface that
  // no longer existed, and because the "Sculpt this surface" button is disabled while ANY surface is
  // being sculpted, every remaining surface's button was greyed out — with no visible sculpt panel
  // anywhere to press "done" in. A dead-end state with no way out except reloading the app.
  //
  // Deliberately not solved by hooking removeImplicitSurface: this covers every way a surface can
  // stop existing (removal, a project being opened, a hot reload, a failed hydration), not just the
  // one button.
  useEffect(() => {
    if (!targetId || !surfaces) return;
    if (surfaces.some((s) => s.id === targetId)) return;
    anchorRef.current = null;
    setAnchorInfo(null);
    setOffsetState(0);
    setTargetId(null);
    // Marker teardown inlined rather than calling clearMarker(), which is declared below this effect.
    const m = markerRef.current;
    if (m) {
      m.parent?.remove(m);
      m.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      markerRef.current = null;
    }
  }, [targetId, surfaces]);

  // ---- the brush marker (a ring on the surface + an arrow showing the offset) --------------------
  // depthTest:false so the ring stays visible when the brush sits on the far side of the shell —
  // otherwise the one moment you most need to see where the brush is (editing a surface you are
  // looking through) is the moment it disappears.
  const clearMarker = useCallback(() => {
    const m = markerRef.current;
    if (!m) return;
    m.parent?.remove(m);
    m.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    markerRef.current = null;
  }, []);

  const drawMarker = useCallback((center, dir, r, off) => {
    clearMarker();
    const group = groupRef?.current;
    if (!group) return;
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0x2f6fd0, depthTest: false, transparent: true, opacity: 0.95 });
    // Circle of radius r in the plane perpendicular to dir, centred on the anchor.
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const n = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    const u = new THREE.Vector3().crossVectors(up, n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push(
        center.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * r,
        center.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * r,
        center.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * r,
      );
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const ring = new THREE.Line(cg, mat);
    ring.renderOrder = 999;
    g.add(ring);
    // Offset arrow: from the anchor to where the centre vertex will end up (weight 1 there, so the
    // arrow tip is literally the new position of the vertex nearest the click).
    const ag = new THREE.BufferGeometry();
    ag.setAttribute("position", new THREE.Float32BufferAttribute([
      center.x, center.y, center.z,
      center.x + n.x * off, center.y + n.y * off, center.z + n.z * off,
    ], 3));
    const arrow = new THREE.Line(ag, new THREE.LineBasicMaterial({ color: 0xd0662f, depthTest: false, transparent: true, opacity: 0.95 }));
    arrow.renderOrder = 999;
    g.add(arrow);
    group.add(g);
    markerRef.current = g;
  }, [clearMarker, groupRef]);

  // ---- geometry plumbing ------------------------------------------------------------------------
  // Push the current position array into the GPU buffer and re-shade only the affected patch.
  // computeBoundingSphere/Box are NOT optional: three.js caches them, and raycasting (which is how the
  // next brush gets placed) tests the bounding sphere first — a vertex pushed outside a stale sphere
  // becomes unclickable.
  const refreshGeometry = useCallback((mesh, patch) => {
    const geo = mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    const nrm = geo.attributes.normal;
    if (nrm && patch) {
      updatePatchNormals(geo.attributes.position.array, geo.index.array, patch, nrm.array);
      nrm.needsUpdate = true;
    } else {
      geo.computeVertexNormals();
    }
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
  }, []);

  const sceneToWorld = useCallback((p) => {
    const o = originRef?.current || { x: 0, y: 0, z: 0 };
    return { x: p.x + o.x, y: o.y - p.z, z: p.y + o.z };
  }, [originRef]);

  // ---- placing / previewing ---------------------------------------------------------------------
  // Restore whatever the pending (uncommitted) preview moved, straight back from the untouched base
  // copy. Called before every re-apply so a preview is always evaluated from the ORIGINAL geometry
  // rather than accumulated on top of the last preview.
  const revertPreview = useCallback(() => {
    const a = anchorRef.current;
    if (!a) return;
    const mesh = meshesRef.current[a.surfaceId];
    if (!mesh?.geometry) return;
    const pos = mesh.geometry.attributes.position.array;
    for (let k = 0; k < a.brush.count; k++) {
      const i = a.brush.indices[k] * 3;
      pos[i] = a.base[i]; pos[i + 1] = a.base[i + 1]; pos[i + 2] = a.base[i + 2];
    }
    refreshGeometry(mesh, a.patch);
  }, [meshesRef, refreshGeometry]);

  const applyPreview = useCallback((a, off, ax) => {
    const mesh = meshesRef.current[a.surfaceId];
    if (!mesh?.geometry) return null;
    const pos = mesh.geometry.attributes.position.array;
    const dir = ax === "vertical" ? { x: 0, y: 1, z: 0 } : a.normal;
    applyBrush(a.base, a.brush, dir, off, pos);
    refreshGeometry(mesh, a.patch);
    // O(brush) exact volume change — see sculpt.js volumeDelta. Reported live, and it is the real
    // number, not an estimate: the divergence-theorem sum is per-triangle, so the untouched triangles
    // cancel exactly.
    const dV = volumeDelta(a.base, pos, mesh.geometry.index.array, a.tris);
    const flip = countFlippedTriangles(a.base, pos, mesh.geometry.index.array, a.tris);
    drawMarker(a.center, dir, a.brush.radius, off);
    return { dV, flipped: flip.flipped, dir };
  }, [meshesRef, refreshGeometry, drawMarker]);

  const placeAnchor = useCallback((surfaceId, center, r) => {
    const mesh = meshesRef.current[surfaceId];
    const geo = mesh?.geometry;
    if (!geo?.index) { notify("This surface has no indexed geometry, so it can't be sculpted."); return; }
    const t0 = performance.now();
    const pos = geo.attributes.position.array;
    const idx = geo.index.array;
    // The base copy is the pending edit's "before". It is also the undo source, and the buffer every
    // preview is re-evaluated from.
    const base = Float32Array.from(pos);
    const brush = buildBrush(base, center, r);
    if (!brush.count) {
      notify(`No vertices within ${r} m of that point — increase the brush radius and click again. (A coarse marching-cubes surface can have several metres between vertices.)`);
      return;
    }
    const normals = computeVertexNormals(base, idx);
    const tris = trianglesUnderBrush(idx, brush);
    const patch = expandForNormals(idx, tris, base.length / 3);
    const normal = brushNormal(normals, brush) || { x: 0, y: 1, z: 0 };
    const baseVolume = Math.abs(signedVolume(base, idx));
    const buildMs = performance.now() - t0;
    const a = { surfaceId, center, base, brush, tris, patch, normal, baseVolume, buildMs };
    anchorRef.current = a;
    const w = sceneToWorld(center);
    setAnchorInfo({
      surfaceId,
      world: { x: Math.round(w.x * 100) / 100, y: Math.round(w.y * 100) / 100, z: Math.round(w.z * 100) / 100 },
      vertices: brush.count,
      triangles: tris.length,
      totalVertices: base.length / 3,
      normal: { x: +normal.x.toFixed(3), y: +normal.y.toFixed(3), z: +normal.z.toFixed(3) },
      baseVolume,
      buildMs: +buildMs.toFixed(1),
      dV: 0, flipped: 0,
    });
    setOffsetState(0);
    drawMarker(center, normal, r, 0);
  }, [meshesRef, notify, sceneToWorld, drawMarker]);

  // ---- the click handler ViewerModule hangs off the 3D view -------------------------------------
  const handleViewClick = useCallback((e) => {
    if (!targetId) return;
    const mesh = meshesRef.current[targetId];
    const mount = mountRef.current;
    const camera = cameraRef.current;
    if (!mesh || !mount || !camera) return;
    if (!mesh.visible) { notify("That surface is hidden — show it before sculpting."); return; }
    const rect = mount.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycasterRef.current.setFromCamera(new THREE.Vector2(mx, my), camera);
    // Only this surface is a raycast target, deliberately: clicking "through" a drillhole trace or a
    // terrain drape that happens to sit in front of the patch you are aiming at should still land on
    // the surface being edited, not silently do nothing.
    const hits = raycasterRef.current.intersectObject(mesh, false);
    if (!hits.length) { notify("That click didn't land on the surface being sculpted. Aim at the surface itself (it is drawn translucent — the nearest point on it under the cursor is what gets picked)."); return; }
    if (anchorRef.current) revertPreview();
    clearMarker();
    placeAnchor(targetId, { x: hits[0].point.x, y: hits[0].point.y, z: hits[0].point.z }, radius);
  }, [targetId, meshesRef, mountRef, cameraRef, radius, notify, revertPreview, clearMarker, placeAnchor]);

  // ---- UI setters that re-evaluate the preview ---------------------------------------------------
  const setOffset = useCallback((v) => {
    const off = Number.isFinite(+v) ? +v : 0;
    setOffsetState(off);
    const a = anchorRef.current;
    if (!a) return;
    const res = applyPreview(a, off, axis);
    if (res) setAnchorInfo((p) => p && { ...p, dV: res.dV, flipped: res.flipped });
  }, [applyPreview, axis]);

  const setAxis = useCallback((v) => {
    setAxisState(v);
    const a = anchorRef.current;
    if (!a) return;
    revertPreview();
    const res = applyPreview(a, offset, v);
    if (res) setAnchorInfo((p) => p && { ...p, dV: res.dV, flipped: res.flipped });
  }, [applyPreview, revertPreview, offset]);

  // Changing the radius rebuilds the brush entirely. The old preview must be reverted FIRST: a
  // shrinking radius would otherwise strand the vertices that were inside the old brush but are
  // outside the new one, permanently displaced and no longer under anyone's control.
  const setRadius = useCallback((v) => {
    const r = Number.isFinite(+v) && +v > 0 ? +v : DEFAULT_RADIUS;
    setRadiusState(r);
    const a = anchorRef.current;
    if (!a) return;
    revertPreview();
    const center = a.center, sid = a.surfaceId;
    anchorRef.current = null;
    placeAnchor(sid, center, r);
    // placeAnchor resets the offset to 0 (the brush it just built is a different brush); re-apply the
    // offset the user had dialled in so changing the radius doesn't wipe their in-progress edit.
    const na = anchorRef.current;
    if (na && offset) {
      setOffsetState(offset);
      const res = applyPreview(na, offset, axis);
      if (res) setAnchorInfo((p) => p && { ...p, dV: res.dV, flipped: res.flipped });
    }
  }, [revertPreview, placeAnchor, applyPreview, offset, axis]);

  // ---- commit -----------------------------------------------------------------------------------
  const apply = useCallback(() => {
    const a = anchorRef.current;
    if (!a) return;
    if (!offset) { notify("Offset is 0 — nothing to apply."); return; }
    const mesh = meshesRef.current[a.surfaceId];
    const geo = mesh?.geometry;
    if (!geo) return;
    const t0 = performance.now();
    const pos = geo.attributes.position.array;
    const idx = geo.index.array;
    const dir = axis === "vertical" ? { x: 0, y: 1, z: 0 } : a.normal;
    // Undo record captures the ORIGINAL coordinates of exactly the vertices this brush moved (a few KB,
    // vs. a megabyte for a whole-mesh snapshot — see sculpt.js captureUndo).
    const record = captureUndo(a.base, a.brush);
    const volAfter = Math.abs(signedVolume(pos, idx));
    const flip = countFlippedTriangles(a.base, pos, idx, a.tris);
    const w = sceneToWorld(a.center);
    const edit = {
      at: new Date().toISOString(),
      axis, offsetM: +offset.toFixed(3), radiusM: a.brush.radius,
      verticesMoved: a.brush.count,
      anchorEasting: Math.round(w.x * 100) / 100,
      anchorNorthing: Math.round(w.y * 100) / 100,
      anchorElevation: Math.round(w.z * 100) / 100,
      volumeBeforeM3: a.baseVolume,
      volumeAfterM3: volAfter,
      flippedTriangles: flip.flipped,
    };
    historyRef.current[a.surfaceId] = [...(historyRef.current[a.surfaceId] || []), record].slice(-MAX_HISTORY);
    setHistoryDepth(historyRef.current[a.surfaceId].length);

    // PROVENANCE. A hand-edited surface is no longer the output of its stated parameters, and anyone
    // reading its export six months later has to be able to see that. `edited`/`editCount`/`edits` go
    // on the surface (which persists through store.jsx's generatedSurfaces, TASKS.csv #52), and
    // `params.manuallyEdited` goes into the params block that meshExport.js's provenanceLines stamps
    // into every OBJ/DXF/glTF. Both, not one: the surface fields drive the panel, the params flag
    // travels with the mesh out of the app.
    setImplicitSurfaces((p) => p.map((s) => s.id !== a.surfaceId ? s : {
      ...s,
      edited: true,
      editCount: (s.editCount || 0) + 1,
      edits: [...(s.edits || []), edit].slice(-MAX_HISTORY),
      params: s.params ? { ...s.params, manuallyEdited: true, manualEditCount: (s.editCount || 0) + 1, lastManualEditAt: edit.at } : s.params,
    }));
    // The #52 sync-out effect caches the world-space serialisation of each mesh keyed on the
    // GEOMETRY'S uuid, so that a pure metadata edit doesn't re-serialise tens of thousands of vertices.
    // Sculpting mutates the position buffer IN PLACE — the uuid does not change — so without this the
    // edit would render correctly and then be silently dropped from the saved project file. Dropping
    // the cache entry is what makes the next sync-out re-read the real geometry.
    onGeometryEdited?.(a.surfaceId);

    anchorRef.current = null;
    setAnchorInfo(null);
    setOffsetState(0);
    clearMarker();
    const dV = volAfter - a.baseVolume;
    const ms = performance.now() - t0;
    notify(
      `Sculpted "${(mesh.userData?.tip || "surface").split("\n")[0]}": moved ${a.brush.count.toLocaleString()} vertices by up to ${offset.toFixed(2)} m ` +
      `${axis === "vertical" ? "vertically" : "along the surface normal"} within a ${a.brush.radius} m brush at ` +
      `${edit.anchorEasting.toFixed(1)} E / ${edit.anchorNorthing.toFixed(1)} N / ${edit.anchorElevation.toFixed(1)} m. ` +
      `Enclosed volume ${a.baseVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} → ${volAfter.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³ ` +
      `(${dV >= 0 ? "+" : ""}${dV.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³) — any tonnage shown for this surface has been recomputed from the new volume. ` +
      `The surface is now flagged as hand-edited and its mesh exports say so. ` +
      `Connectivity is untouched, so it is exactly as watertight as it was before.` +
      (flip.flipped ? ` WARNING: ${flip.flipped} triangle(s) are now inside out — the patch has been pushed through the surface. Undo and use a smaller offset or a larger radius; the volume above cannot be trusted while that is true.` : "") +
      ` (${ms.toFixed(0)} ms)`,
    );
  }, [offset, axis, meshesRef, setImplicitSurfaces, onGeometryEdited, clearMarker, notify, sceneToWorld]);

  const cancelAnchor = useCallback(() => {
    if (!anchorRef.current) return;
    revertPreview();
    anchorRef.current = null;
    setAnchorInfo(null);
    setOffsetState(0);
    clearMarker();
  }, [revertPreview, clearMarker]);

  // ---- undo -------------------------------------------------------------------------------------
  // A LOCAL stack, not store.jsx's global undo. That is deliberate and documented in TASKS.csv #145:
  // `generatedSurfaces` was explicitly excluded from the store's undo snapshot for measured
  // performance reasons (that snapshot JSON.stringify-compares every tracked field on every change,
  // and a surface mesh is tens of thousands of coordinates), so putting sculpt undo there would
  // re-introduce exactly the cost that exclusion was measured to avoid. A sparse per-edit delta here
  // costs a few KB per step and restores bit-exactly.
  //
  // The trade-off, stated honestly rather than hidden: this history is SESSION-LOCAL. It does not
  // persist, so after a save/reload the edits are permanent (and, having gone through the project
  // file's 1 cm coordinate rounding, would not restore bit-exactly anyway).
  const undo = useCallback((surfaceId) => {
    const stack = historyRef.current[surfaceId];
    if (!stack?.length) return;
    if (anchorRef.current?.surfaceId === surfaceId) cancelAnchor();
    const mesh = meshesRef.current[surfaceId];
    const geo = mesh?.geometry;
    if (!geo) return;
    const record = stack[stack.length - 1];
    historyRef.current[surfaceId] = stack.slice(0, -1);
    setHistoryDepth(historyRef.current[surfaceId].length);
    const pos = geo.attributes.position.array;
    restoreUndo(pos, record);
    geo.computeVertexNormals(); // full recompute: an undo is rare and correctness beats 3 ms here
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const vol = Math.abs(signedVolume(pos, geo.index.array));
    setImplicitSurfaces((p) => p.map((s) => {
      if (s.id !== surfaceId) return s;
      const edits = (s.edits || []).slice(0, -1);
      const count = Math.max(0, (s.editCount || 0) - 1);
      return {
        ...s,
        edited: count > 0,
        editCount: count,
        edits,
        params: s.params ? { ...s.params, manuallyEdited: count > 0, manualEditCount: count } : s.params,
      };
    }));
    onGeometryEdited?.(surfaceId);
    notify(`Undid the last sculpt on this surface (${record.indices.length.toLocaleString()} vertices restored exactly). Enclosed volume is now ${vol.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³.`);
  }, [meshesRef, setImplicitSurfaces, onGeometryEdited, notify, cancelAnchor]);

  const begin = useCallback((id) => {
    if (anchorRef.current) cancelAnchor();
    setTargetId(id);
    setHistoryDepth((historyRef.current[id] || []).length);
    notify("Sculpt mode: click on the surface in the 3D view to place the brush, then set the radius and offset. Nothing changes until you press Apply.");
  }, [cancelAnchor, notify]);

  const end = useCallback(() => {
    if (anchorRef.current) { cancelAnchor(); notify("Sculpt mode off — the un-applied preview was discarded."); }
    setTargetId(null);
  }, [cancelAnchor, notify]);

  return {
    targetId, begin, end, handleViewClick,
    radius, setRadius, offset, setOffset, axis, setAxis,
    anchorInfo, apply, cancelAnchor, undo, historyDepth,
  };
}
