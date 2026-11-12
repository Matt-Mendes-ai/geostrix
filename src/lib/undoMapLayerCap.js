// TASKS.csv #2806 (from #2769's heap check) — map layers are undoable (#2769), so every undo step keeps the map layers of its moment: a
// removed or replaced layer stays in memory for up to UNDO_MAX (60) steps. Measured: a 1 M-vertex geology map is ~50 MB, so a few imports
// and removals could hold hundreds of MB that nothing shows. The history now keeps at most KEEP_REMOVED big layers that are no longer in the
// project (nor in the redo steps); an older one is dropped from every undo step that holds it, so an Undo that far back restores the map
// layers without it (the other layers of that step as they were). Small layers are never dropped. A layer is known by its `features` array:
// a style or visibility edit makes a new layer object that shares it, so it is not a second copy. Pure.
// Dropping one is said once (Main, 2026-11-12): cappedNotice(names), shown by the store.
import { t as tr } from "./i18n.js";

export const KEEP_REMOVED = 3; // big removed layers the history keeps (the newest)
export const BIG_VERTICES = 100000; // a layer this big or bigger (~5 MB) counts; smaller ones are kept whatever their number

const VERTS = new WeakMap();
// vertices of a map layer's features (parts -> rings -> points, or a point's single coordinate), counted once per features array
export function vertexCount(features) {
  if (!Array.isArray(features)) return 0;
  let n = VERTS.get(features);
  if (n != null) return n;
  n = 0;
  const walk = (a) => { if (!Array.isArray(a)) return; if (a.length && typeof a[0] === "number") { n++; return; } for (const x of a) walk(x); };
  for (const f of features) walk(f?.parts ?? f?.coordinates ?? f?.geometry?.coordinates);
  VERTS.set(features, n);
  return n;
}

// steps: the undo steps, oldest first ({ mapLayers, ... } snapshots); held: the map-layer lists that must stay whole (the project now,
// the redo steps). -> { steps (the same array when nothing changed), dropped (layers dropped from the history), names (their names) }
export function capRemovedMapLayers(steps, held, { keep = KEEP_REMOVED, big = BIG_VERTICES } = {}) {
  const live = new Set();
  for (const list of held || []) for (const l of list || []) if (l?.features) live.add(l.features);
  const kept = new Set(), drop = new Set();
  for (let i = (steps || []).length - 1; i >= 0; i--) {
    for (const l of steps[i]?.mapLayers || []) {
      const f = l?.features;
      if (!f || live.has(f) || kept.has(f) || drop.has(f) || vertexCount(f) < big) continue;
      (kept.size < keep ? kept : drop).add(f);
    }
  }
  if (!drop.size) return { steps, dropped: 0, names: [] };
  const names = [];
  for (const s of steps) for (const l of s?.mapLayers || []) if (drop.has(l?.features) && !names.includes(l.name || l.id)) names.push(l.name || l.id);
  const out = steps.map((s) => (s?.mapLayers?.some((l) => drop.has(l?.features)) ? { ...s, mapLayers: s.mapLayers.filter((l) => !drop.has(l?.features)) } : s));
  return { steps: out, dropped: drop.size, names };
}

// the notice when big layers leave the older undo steps (said once: a dropped layer is gone from every step, so it is not dropped again)
export function cappedNotice(names, keep = KEEP_REMOVED) {
  if (!names?.length) return "";
  return names.length === 1
    ? tr("The map layer \"{name}\" is too large to keep in the older undo steps: undo can bring back the last {n} removed large layers.", { name: names[0], n: keep })
    : tr("The map layers {names} are too large to keep in the older undo steps: undo can bring back the last {n} removed large layers.", { names: names.map((x) => `"${x}"`).join(", "), n: keep });
}
