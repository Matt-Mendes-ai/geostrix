// TASKS.csv #1152 — the interpretation line being drawn, in the 3D scene: a line through the clicks with a marker at each,
// drawn over everything (no depth test) so it reads over the terrain and the survey from any zoom; the markers are a
// fixed size on screen (sizeAttenuation off), not metres, so they show at a whole-survey zoom. Rebuilt from scratch on
// every change (a few points).
import * as THREE from "three";

export function syncInterpretPreview(group, pts, origin, color = "#e36414") {
  while (group.children.length) { const c = group.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); }
  if (!pts.length) return;
  const { x: ox, y: oy, z: oz } = origin, lift = 1.5;
  const scene = pts.map((p) => new THREE.Vector3(p.x - ox, p.z - oz + lift, -(p.y - oy)));
  const dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints(scene), new THREE.PointsMaterial({ color, size: 9, sizeAttenuation: false, depthTest: false, transparent: true }));
  dots.renderOrder = 60;
  group.add(dots);
  if (scene.length > 1) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(scene), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
    line.renderOrder = 60;
    group.add(line);
  }
}

// TASKS.csv #2414 / #2682 — a unit polygon closes on a click within max(1 m, 2 % of the outline's size, the click included) of its
// first corner. One rule for the click (UnitPolygonPane) and the hover highlight below.
export function closesRing(corners, p) {
  if (!p || !(corners?.length >= 3)) return false;
  let x0 = p.x, y0 = p.y, x1 = p.x, y1 = p.y;
  for (const q of corners) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  return Math.hypot(p.x - corners[0].x, p.y - corners[0].y) <= Math.max(1, 0.02 * Math.hypot(x1 - x0, y1 - y0));
}

// TASKS.csv #2682 — while a unit polygon is drawn (drawing.ring), its first corner shows a bigger, lighter marker when a click at the
// cursor's world point p would close the ring. The marker lives in the preview group, so syncInterpretPreview's rebuild removes it.
export function hoverFirstCorner(group, drawing, p, origin) {
  if (!group) return false;
  let m = group.children.find((c) => c.userData.firstCorner);
  const hot = !!(drawing?.on && drawing.ring && closesRing(drawing.points, p));
  if (!hot) { if (m) m.visible = false; return false; }
  if (!m) {
    const a = drawing.points[0], { x: ox, y: oy, z: oz } = origin;
    m = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x - ox, a.z - oz + 1.5, -(a.y - oy))]),
      new THREE.PointsMaterial({ color: "#ffd166", size: 17, sizeAttenuation: false, depthTest: false, transparent: true }));
    m.userData.firstCorner = true; m.renderOrder = 61;
    group.add(m);
  }
  m.visible = true;
  return true;
}
