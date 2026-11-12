// TASKS.csv #1324 — the Identify tool's state and click. Its logic (lib/viewer/identify.js) and panel load with the first use: the 3D view's startup pays nothing for them.
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const MARKER_GEO = new THREE.SphereGeometry(1, 12, 12);

export function useIdentify(r) {
  const [on, setOn] = useState(false);
  const [result, setResult] = useState(null); // { items, shown }
  const markerRef = useRef(null);
  // TASKS.csv #2796 — the press's own position: a click event's clientX / clientY are whole pixels, the pointer events' (and so the hover
  // tooltip's) are not on a scaled display, and Identify answered 'Nothing here' where the tooltip showed an interval (WA lithium, CLDD009)
  const downRef = useRef(null);
  useEffect(() => {
    if (!on) return undefined;
    const f = (e) => { downRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointerdown", f, true);
    return () => window.removeEventListener("pointerdown", f, true);
  }, [on]);
  const clearMarker = useCallback(() => {
    const m = markerRef.current;
    if (m) { m.parent?.remove(m); m.material.dispose(); markerRef.current = null; if (r.lastActivityRef) r.lastActivityRef.current = Date.now(); }
  }, [r.lastActivityRef]);
  const mark = useCallback((item, distance) => {
    clearMarker();
    if (!item || !r.sceneRef.current) return;
    const m = new THREE.Mesh(MARKER_GEO, new THREE.MeshBasicMaterial({ color: 0xe5197d, depthTest: false, transparent: true, opacity: 0.9 }));
    m.renderOrder = 20;
    m.position.copy(item.point);
    m.scale.setScalar(Math.max(0.05, distance * 0.006));
    r.sceneRef.current.add(m);
    markerRef.current = m;
    if (r.lastActivityRef) r.lastActivityRef.current = Date.now();
  }, [clearMarker, r.sceneRef, r.lastActivityRef]);
  const stop = useCallback(() => { setOn(false); setResult(null); clearMarker(); }, [clearMarker]);
  useEffect(() => clearMarker, [clearMarker]);

  const handleViewClick = async (e) => {
    if (!on) return;
    const { identifyAt, clickPoint } = await import("../../lib/viewer/identify.js");
    const p = clickPoint(e, downRef.current); // #2796
    const items = identifyAt(r, p.x, p.y);
    setResult({ items, shown: 0 });
    mark(items[0], items.length ? items[0].point.distanceTo(r.cameraRef.current.position) : 0);
  };
  const show = (i) => {
    setResult((s) => ({ ...s, shown: i }));
    const it = result?.items[i];
    if (it) mark(it, it.point.distanceTo(r.cameraRef.current.position));
  };
  return { on, setOn, stop, result, show, handleViewClick };
}
