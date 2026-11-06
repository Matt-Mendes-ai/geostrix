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

// The labels' screen boxes (pixels, centred) through `camera` on a width x height viewport; null behind the camera.
// TASKS.csv #1770 — shared by the live declutter and the Layout capture's overlap count.
export function labelBoxes(group, camera, width, height, labelPx = 16) {
  const e = camera.matrixWorldInverse.elements, p = camera.projectionMatrix.elements;
  return group.children.map((sp) => {
    const { x, y, z } = sp.position;
    const cx = e[0] * x + e[4] * y + e[8] * z + e[12], cy = e[1] * x + e[5] * y + e[9] * z + e[13], cz = e[2] * x + e[6] * y + e[10] * z + e[14], cw = e[3] * x + e[7] * y + e[11] * z + e[15];
    const w = p[3] * cx + p[7] * cy + p[11] * cz + p[15] * cw;
    if (!(w > 0)) return null;
    return { x: ((p[0] * cx + p[4] * cy + p[8] * cz + p[12] * cw) / w) * 0.5 * width, y: ((p[1] * cx + p[5] * cy + p[9] * cz + p[13] * cw) / w) * 0.5 * height, w: labelPx * (sp.material?.userData?.labelAspect || 4), h: labelPx };
  });
}

// TASKS.csv #1770 (review #1645, Copley) — a Layout capture is a drill plan: every hole keeps its label (the live declutter's
// hidden labels are shown for the render and put back after), and the labels that would overlap one already placed at
// the capture's size are counted, so the page can say so instead of a label going missing in silence.
// draw(): the render. -> the number of labels overlapping another at this size.
export function withEveryLabel(group, camera, width, height, draw, labelPx = 16) {
  const was = group ? group.children.map((sp) => sp.visible) : null;
  if (group) group.children.forEach((sp) => { sp.visible = true; });
  try { draw(); } finally { if (group) group.children.forEach((sp, i) => { sp.visible = was[i]; }); }
  if (!group || !group.visible || !group.children.length) return 0;
  return labelsToShow(labelBoxes(group, camera, width, height, labelPx)).filter((s) => s === false).length;
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
  const show = labelsToShow(labelBoxes(group, camera, width, height, labelPx));
  // TASKS.csv #1533 (review #1497, Lawyers) — a label of a hole hidden in the Holes list stays hidden (it was shown again here each
  // idle frame: 95 labels of hidden holes on screen); its first tip line is the hole id, as the visibleHoles effect reads it
  const hidden = (sp) => sp.userData?.holeHidden === true;
  group.children.forEach((sp, i) => { sp.visible = !hidden(sp) && show[i] !== false; });
}

// TASKS.csv #1443 (review #1352, Silvertip) — labels that carry their own text: the dip beside each outcrop symbol and a sample's
// id or one element's value beside each surface sample. Same sprites, same per-frame declutter as the hole labels.
// items: [{ x, y, z (scene), text, tip? }]; lift: metres above the anchor.
export function syncTextLabels(group, items, makeSprite, lift = 6) {
  if (!group) return 0;
  while (group.children.length) { const c = group.children.pop(); c.material?.map?.dispose?.(); c.material?.dispose?.(); c.geometry?.dispose?.(); }
  for (const it of items || []) {
    if (it.text == null || it.text === "") continue;
    const sprite = makeSprite(String(it.text));
    sprite.position.set(it.x, it.y + lift, it.z);
    sprite.userData = { tip: it.tip || String(it.text) };
    group.add(sprite);
  }
  return group.children.length;
}
const shortNum = (v) => (Math.abs(v) >= 100 ? String(Math.round(v)) : Math.abs(v) >= 10 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : String(+v.toPrecision(2)));
// mode: "none" | "id" | "el:<symbol>" -> the label text, or null when the sample has nothing to say
export function sampleLabelText(row, mode) {
  if (!row || !mode || mode === "none") return null;
  if (mode === "id") { const id = row.sample_id; return id != null && String(id).trim() !== "" ? String(id) : null; }
  if (mode.startsWith("el:")) { const v = Number(row.values?.[mode.slice(3)]); return Number.isFinite(v) ? shortNum(v) : null; }
  return null;
}
export const dipLabelText = (r) => (r && Number.isFinite(Number(r.dip)) ? String(Math.round(Number(r.dip))) : null);
