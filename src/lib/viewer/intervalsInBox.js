// TASKS.csv #1333 — the drawn lithology intervals touched by a box in screen pixels (Modelling codes and Correlation's "Select intervals
// with a box"); an interval that is hidden, or in a hidden layer, is not drawn and is left out.
// TASKS.csv #3998 — it found nothing on any project: it walked the litho group's children for userData.lithoRow, and since #1540 / #1643
// the intervals are batched (a batch keeps its members, a compact batch a view per row), so no child held a row. It walks every member
// (eachLayerMember) as the pick does.
// view: { groups, camera, traces } (refs, from ViewerModule); box: { x0, x1, y0, y1 } in pixels of rect (the canvas's client rect)
import * as THREE from "three";
import { eachLayerMember } from "./layerBatches.js";
import { findOnTrace } from "./modelHelpers.js";
import { intervalTouchesBox } from "../intervalBox.js";
import { rowKey } from "../modellingCodes.js";

export function intervalsInBox(view, box, rect) {
  const group = view.groups.current?.litho, cam = view.camera.current;
  if (!group || group.visible === false || !cam) return [];
  const traces = new Map(view.traces.current.map((t) => [t.hole_id, t])), v = new THREE.Vector3(), seen = new Set(), out = [];
  const screen = (p) => { v.set(p.x, p.y, p.z).project(cam); return v.z > 1 ? null : [(v.x + 1) / 2 * rect.width, (1 - v.y) / 2 * rect.height]; };
  eachLayerMember(group, (m) => {
    const row = m.userData?.lithoRow, t = row && m.visible !== false && traces.get(row.hole_id);
    if (!t || seen.has(rowKey(row))) return;
    const from = Number(row.from), to = Number(row.to), pts = [];
    for (let i = 0; i <= 4; i++) { const p = findOnTrace(t.pts, from + ((to - from) * i) / 4); pts.push(p ? screen(p) : null); }
    if (intervalTouchesBox(pts, box)) { seen.add(rowKey(row)); out.push(row); }
  });
  return out;
}
