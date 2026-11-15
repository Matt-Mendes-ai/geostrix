// TASKS.csv #3570 (Fireweed rehearsal, Macpass) — 'Zoom to NB23-033' framed the hole in a crowd of 80 unlabelled traces without marking it, and
// the label declutter kept others. After the zoom the hole found is drawn over the scene in yellow for a few seconds, with its own label always
// drawn (a sprite outside the decluttered hole labels). Everything is removed and disposed after `ms`, or when another hole is marked.
import * as THREE from "three";
import { makeTextSprite, fitScreenLabels } from "../../lib/viewer/textSprite.js";

const MARK = "zoom_mark";
export function markZoomedHole(root, camera, mountEl, hole, ms = 6000) {
  if (!root || !camera || !hole?.pts?.length) return null;
  clearMark(root);
  const g = new THREE.Group(); g.name = MARK; g.userData.noPick = true;
  const pts = hole.pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.length > 1 ? pts : [pts[0], pts[0].clone().add(new THREE.Vector3(0, -1, 0))]), new THREE.LineBasicMaterial({ color: 0xffd400, depthTest: false, transparent: true }));
  line.renderOrder = 998; line.frustumCulled = false; g.add(line);
  const labels = new THREE.Group(); g.add(labels);
  const sp = makeTextSprite(String(hole.hole_id), { color: "#1a2028", bg: "rgba(255,212,0,0.95)" });
  sp.position.set(pts[0].x, pts[0].y + 6, pts[0].z); sp.material.depthTest = false; sp.renderOrder = 999; labels.add(sp);
  root.add(g);
  let raf = 0, alive = true;
  const tick = () => { if (!alive) return; fitScreenLabels(labels, camera, mountEl?.clientHeight || 600); raf = requestAnimationFrame(tick); };
  tick();
  const done = () => { if (!alive) return; alive = false; cancelAnimationFrame(raf); clearMark(root); };
  g.userData.done = done;
  setTimeout(done, ms);
  return done;
}
export function clearMark(root) {
  const old = root?.getObjectByName?.(MARK);
  if (!old) return;
  old.userData.done = null;
  root.remove(old);
  old.traverse((o) => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.(); });
}
