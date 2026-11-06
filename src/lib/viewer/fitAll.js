// TASKS.csv #1407 (review #1352, Silvertip) — 'Zoom to fit all' framed only the hole traces and block models (the same view as Fit), so
// Silvertip's 21 x 28 km of stream samples, the rocks 45 km south and the map layers were never brought into view. This is the box of
// everything SHOWN under the scene's data root: a hidden layer or group is skipped with its children, and so are labels (sprites, sized
// in screen pixels) and the measuring tool's own marks. The grid, the axes and the lights are outside the root and never count.
import * as THREE from "three";

const SKIP_GROUPS = new Set(["hole_labels", "outcrop_labels", "sample_labels", "measure"]);

// The object's own extent (not its children's), in world coordinates; false when it has none
function ownBox(o, out) {
  if (o.isSprite) return false;
  if (o.boundingBox !== undefined) { // InstancedMesh / BatchedMesh: the box over every instance
    if (o.boundingBox === null) o.computeBoundingBox();
    out.copy(o.boundingBox);
  } else {
    const g = o.geometry;
    if (!g?.attributes?.position) return false;
    if (!g.boundingBox) g.computeBoundingBox();
    out.copy(g.boundingBox);
  }
  if (out.isEmpty() || ![out.min.x, out.min.y, out.min.z, out.max.x, out.max.y, out.max.z].every(Number.isFinite)) return false;
  out.applyMatrix4(o.matrixWorld);
  return true;
}

export function visibleSceneBox(root) {
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  if (!root) return box;
  root.updateWorldMatrix(true, true);
  const walk = (o) => {
    if (!o.visible || SKIP_GROUPS.has(o.name)) return;
    if (ownBox(o, tmp)) box.union(tmp);
    for (const c of o.children) walk(c);
  };
  for (const c of root.children) walk(c);
  return box;
}
