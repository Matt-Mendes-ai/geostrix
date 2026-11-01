// TASKS.csv #1277 — the collar labels of the 3D view, rebuilt on their own. They used to be built inside the drillhole
// rebuild effect with holeLabelMode in its dependencies, so the Hole labels dropdown rebuilt every drillhole (190-360 ms and
// ~24 MB of garbage on 19 holes, even switching labels off). The rebuild now records one anchor per hole and draws the
// labels from them; a mode change redraws only the labels. anchors: [{ id, x, y, z (scene), zWorld, depth }].
export function holeLabelText(a, mode) {
  if (mode === "hole_id_z") return `${a.id} (${a.zWorld.toFixed(0)}m)`;
  if (mode === "hole_id_depth") return `${a.id} (${a.depth.toFixed(0)}m)`;
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
