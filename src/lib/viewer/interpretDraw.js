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
