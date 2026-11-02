// TASKS.csv #1333 — selecting many drillhole intervals with a box dragged in the 3D view, and giving them one modelling
// code. Matt: "drag and create a new selection instead of picking one by one. each hole will have multiple selected
// intervals and I want to model that as one unit". Pure; the drag and the scene are in ModellingCodesPane.
import { codedRuns, rowKey, EMPTY_MODELLING_CODES } from "./modellingCodes.js";

// Does a screen segment touch a box { x0, y0, x1, y1 }? Clipped against each side in turn (Liang-Barsky).
export function segmentTouchesBox(a, b, box) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a[0] - box.x0], [dx, box.x1 - a[0]], [-dy, a[1] - box.y0], [dy, box.y1 - a[1]]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

// An interval as a line of screen points; null marks a point behind the camera, and a segment with one is skipped
export function intervalTouchesBox(screenPts, box) {
  for (let i = 0; i < screenPts.length; i++) {
    const a = screenPts[i], b = screenPts[i + 1];
    if (a && !b && screenPts.length === 1) return segmentTouchesBox(a, a, box);
    if (a && b && segmentTouchesBox(a, b, box)) return true;
  }
  return false;
}

// A new drag replaces the selection; Shift adds to it, Ctrl takes away from it
export function combineSelection(current, found, mode) {
  if (mode === "replace") return found;
  const keys = new Set(found.map(rowKey));
  if (mode === "remove") return current.filter((r) => !keys.has(rowKey(r)));
  const have = new Set(current.map(rowKey));
  return [...current, ...found.filter((r) => !have.has(rowKey(r)))];
}

export const holesOf = (rows) => new Set(rows.map((r) => r.hole_id)).size;

// The rows not selected that lie between the first and last selected interval of their hole
export function rowsBetween(lithoRows, selected) {
  const span = new Map(), keys = new Set(selected.map(rowKey));
  selected.forEach((r) => {
    const s = span.get(r.hole_id);
    span.set(r.hole_id, s ? { from: Math.min(s.from, Number(r.from)), to: Math.max(s.to, Number(r.to)) } : { from: Number(r.from), to: Number(r.to) });
  });
  return (lithoRows || []).filter((r) => {
    const s = span.get(r.hole_id);
    return s && Number(r.from) >= s.from && Number(r.to) <= s.to && !keys.has(rowKey(r));
  });
}

// The new `modellingCodes`, with every row given the code and the code listed
export function codeRowsAs(mc, rows, code) {
  const base = mc || EMPTY_MODELLING_CODES;
  const assign = { ...(base.assign || {}) };
  rows.forEach((r) => { assign[rowKey(r)] = code; });
  const list = base.codes || [];
  return { ...base, assign, codes: list.some((c) => c.name === code) ? list : [...list, { name: code }] };
}

// How many holes hold a code in more than one separate run: each run has its own top, which a contact surface would
// try to pass through, while a closed body treats them as one unit
export function holesWithRepeats(lithoRows, mc, code, groupOf) {
  const n = new Map();
  codedRuns(lithoRows, mc, groupOf).forEach((run) => { if (run.code === code) n.set(run.hole_id, (n.get(run.hole_id) || 0) + 1); });
  return [...n.values()].filter((c) => c > 1).length;
}
