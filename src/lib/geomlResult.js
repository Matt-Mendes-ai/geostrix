// TASKS.csv #4028 (Matt, 2026-11-22: "yes") — a geoML run lands in a RESULT, not in the project. What the run built (the unit's closed body or its open contact, a grade run's
// shells, the probability / grade blocks) waits here, with the lines that say what it is (volumes, the intercept / samples check); the Result block at the top of the 3D
// Modelling panel (components/GeomlResultBlock.jsx) shows it and its Add buttons put a group in the project, and Undo takes exactly that group out again. A new run
// replaces the pending result; a project change drops it. One result at a time, like lib/geomlRun.js's run. Pure: no React, no DOM (the block reads it with useSyncExternalStore).
//
// a result: { id, label, kind: "domain" | "grade", lines: [text], groups: [{ key, kind, surfaces: [spec], voxels: [spec], count }], added: { [key]: { surfaceIds, voxelIds } }, seq }
//   group kinds: "bodies" (a unit's closed body), "contact" (a layered unit's open contact), "shells" (a grade run's closed shells), "blocks" (the run's block model)
//   a surface spec is what addWorldMeshSurface takes ({ name, positions, indices, type, closure, color, opacity, values, params }); a voxel spec what addVoxelModel takes
let current = null, seq = 0;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export const subscribeResult = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getResult = () => current;
export const clearResult = () => { if (current) { current = null; notify(); } };
// a project change: the ViewerModule stamps the result with the counter of the project it landed in (seq), and drops one from another project
export const stampResult = (stamp) => { if (current && current.seq == null) { current = { ...current, seq: stamp }; notify(); } };

export function newResult(label, kind) {
  const res = { id: `geoml_result_${Date.now()}_${++seq}`, label, kind, lines: [], groups: [], added: {}, seq: null };
  const group = (key, k) => res.groups.find((g) => g.key === key) || (res.groups.push({ key, kind: k || key, surfaces: [], voxels: [], count: 0 }), res.groups[res.groups.length - 1]);
  return {
    res,
    line: (text) => { if (text) res.lines.push(text); },
    surface: (key, spec, kind) => { const g = group(key, kind); g.surfaces.push(spec); g.count = g.surfaces.length + g.voxels.length; },
    voxel: (key, spec, kind) => { const g = group(key, kind); g.voxels.push(spec); g.count = g.surfaces.length + g.voxels.length; },
    done: () => res,
  };
}

// the run's result is now the pending one (the earlier pending result, added or not, is dropped from the block: what was added stays in the project)
export function setResult(res) { current = res; notify(); }

// puts a group in the project -> { surfaceIds, voxelIds }; the group is marked added (a second click does nothing)
export function addGroup(key, { addSurface, addVoxelModel }) {
  const res = current;
  const g = res?.groups.find((x) => x.key === key);
  if (!g || res.added[key]) return null;
  const surfaceIds = g.surfaces.map((s) => addSurface(s)).filter(Boolean);
  const voxelIds = g.voxels.map((v) => addVoxelModel(v)).filter(Boolean);
  current = { ...res, added: { ...res.added, [key]: { surfaceIds, voxelIds } } };
  notify();
  return { surfaceIds, voxelIds };
}

// takes exactly what that group added out of the project again, in one step, and marks it not added
export function undoGroup(key, { removeSurface, removeVoxelModel }) {
  const res = current, a = res?.added[key];
  if (!a) return false;
  for (const id of a.surfaceIds) removeSurface(id);
  for (const id of a.voxelIds) removeVoxelModel(id);
  const added = { ...res.added }; delete added[key];
  current = { ...res, added };
  notify();
  return true;
}
