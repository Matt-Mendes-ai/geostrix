// TASKS.csv #1277 — the collar labels of the 3D view, rebuilt on their own. They used to be built inside the drillhole
// rebuild effect with holeLabelMode in its dependencies, so the Hole labels dropdown rebuilt every drillhole (190-360 ms and
// ~24 MB of garbage on 19 holes, even switching labels off). The rebuild now records one anchor per hole and draws the
// labels from them; a mode change redraws only the labels. anchors: [{ id, x, y, z (scene), zWorld, depth }].
export function holeLabelText(a, mode) {
  if (mode === "hole_id_z") return `${a.id} (${a.zWorld.toFixed(0)}m)`;
  if (mode === "hole_id_depth") return `${a.id} (${+a.depth.toFixed(1)}m)`; // #1259 — a driller's EOH: 438.5, not 439
  return a.id;
}

// group: the hole_labels THREE.Group; makeSprite(text) -> a sprite. Clears what was there (textures included) first.
export function syncHoleLabels(group, anchors, mode, makeSprite) {
  if (!group) return 0;
  while (group.children.length) { const c = group.children.pop(); c.material?.map?.dispose?.(); c.material?.dispose?.(); c.geometry?.dispose?.(); }
  if (mode === "none") return 0;
  for (const a of anchors || []) {
    const sprite = makeSprite(holeLabelText(a, mode));
    sprite.position.set(a.x, a.y + 6, a.z); // above the collar marker, as before
    sprite.userData = { tip: `${a.id}\nLabel` };
    group.add(sprite);
  }
  return group.children.length;
}

// TASKS.csv #1294 — labels keep their on-screen size while collars close up, so at Fit five of them overprinted into nothing. When the camera has stopped (never
// per frame), the labels that would overlap one already placed are hidden, in hole order; zooming in brings them back. labels: [{ x, y, w, h }] in pixels.
export function labelsToShow(labels, gap = 2) {
  const placed = [];
  return labels.map((b) => {
    if (!b) return false;
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y0 = b.y - b.h / 2, y1 = b.y + b.h / 2;
    if (placed.some((p) => x0 < p.x1 + gap && p.x0 < x1 + gap && y0 < p.y1 + gap && p.y0 < y1 + gap)) return false;
    placed.push({ x0, x1, y0, y1 });
    return true;
  });
}

const IDLE_MS = 150;
const idle = new WeakMap();
// Call every frame; does its work once, IDLE_MS after the camera or the viewport last changed.
export function declutterHoleLabels(group, camera, width, height, labelPx = 16, now = Date.now()) {
  const m = camera.matrixWorldInverse.elements, key = `${m.join()},${camera.zoom},${width},${height},${group.children.length}`;
  let st = idle.get(group);
  if (!st) idle.set(group, (st = { key: null, at: 0, done: false }));
  if (key !== st.key) { st.key = key; st.at = now; st.done = false; return; }
  if (st.done || now - st.at < IDLE_MS) return;
  st.done = true;
  const v = { x: 0, y: 0, z: 0 };
  const boxes = group.children.map((sp) => {
    v.x = sp.position.x; v.y = sp.position.y; v.z = sp.position.z;
    const e = camera.matrixWorldInverse.elements, p = camera.projectionMatrix.elements;
    const cx = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12], cy = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13], cz = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14], cw = e[3] * v.x + e[7] * v.y + e[11] * v.z + e[15];
    const w = p[3] * cx + p[7] * cy + p[11] * cz + p[15] * cw;
    if (!(w > 0)) return null;
    return { x: ((p[0] * cx + p[4] * cy + p[8] * cz + p[12] * cw) / w) * 0.5 * width, y: ((p[1] * cx + p[5] * cy + p[9] * cz + p[13] * cw) / w) * 0.5 * height, w: labelPx * (sp.material?.userData?.labelAspect || 4), h: labelPx };
  });
  const show = labelsToShow(boxes);
  group.children.forEach((sp, i) => { sp.visible = show[i] !== false; });
}
