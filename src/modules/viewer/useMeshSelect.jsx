import React, { useRef, useState } from "react";
import { Raycaster } from "three";
import { viewNdc } from "../../lib/viewer/clickPoint.js";
import { lazyPart } from "../../lib/lazyModal.jsx";

// TASKS.csv #3991 — click a mesh in the 3D view to select it (viewer/MeshSelect.jsx: the highlight, the bar, the pieces, the keys).
// TASKS.csv #3996 — only this check stays in the startup bundle: a click that hits a model or OMF surface loads MeshSelect, which takes over
// the clicks from then on, the first one replayed. A click on nothing loads nothing.
const MeshSelect = lazyPart(() => import("./MeshSelect.jsx"));

export function useMeshSelect(r) {
  const [first, setFirst] = useState(null);
  const clickRef = useRef(null);
  const handleViewClick = (e) => {
    if (clickRef.current) { clickRef.current(e); return; }
    if (first) return; // loading
    const mount = r.mountRef.current, cam = r.cameraRef.current;
    if (!mount || !cam) return;
    const rc = new Raycaster();
    rc.setFromCamera(viewNdc(e, mount.getBoundingClientRect(), r.mcDownRef.current), cam);
    const meshes = new Set([...Object.values(r.implicitMeshesRef.current || {}), ...Object.values(r.omfMeshesRef.current || {})]);
    const hit = r.pickHits(rc).some((h) => { for (let o = h.object; o; o = o.parent) if (meshes.has(o)) return true; return false; });
    if (hit) setFirst({ clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey, metaKey: e.metaKey, down: r.mcDownRef.current ? { ...r.mcDownRef.current } : null });
  };
  return { handleViewClick, bar: first ? <MeshSelect r={r} clickRef={clickRef} first={first} /> : null };
}
