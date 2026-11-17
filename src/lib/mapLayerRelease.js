// TASKS.csv #2824 (follow-up of #2806) — a removed big map layer stayed in memory after it had left the project AND the undo history (the cap's drop,
// a New project, the oldest step pushed out). Found with a heap snapshot (four synthetic layers of 125,000 vertices added and removed, then New project:
// the first layer's features were still alive): the retaining path ran from a live DOM element's React props (an onClick closure) through the closure
// context of an older render of the 3D View (V8 keeps one context per render, shared by every closure made in it), whose `mapLayers` was the list
// holding that layer. Any long-lived memoized callback made while a layer was in the project can keep that render's context, and so the layer, alive;
// there is no one closure to fix. So the layer's data is let go once nothing in the project can bring it back: its features array is emptied in place,
// and a stale context then holds an empty array.
//   noteRemovedLayers(prev, next) — the big layers (BIG_VERTICES or more) in `prev` and not in `next` are remembered (by WeakRef: remembering one does
//   not keep it).
//   releaseUnheld(lists) — every remembered layer not in any of `lists` (the project's map layers, every undo / redo step's, the step under way, the
//   other workspace tabs') is emptied; one still held stays remembered. -> { released, names }
import { vertexCount, BIG_VERTICES } from "./undoMapLayerCap.js";

const tracked = new Map(); // WeakRef(features) -> the layer's name

export function noteRemovedLayers(prev, next, big = BIG_VERTICES) {
  if (!prev?.length || prev === next) return 0;
  const still = new Set((next || []).map((l) => l?.features).filter(Boolean));
  let n = 0;
  for (const l of prev) {
    const f = l?.features;
    if (!Array.isArray(f) || !f.length || still.has(f) || vertexCount(f) < big) continue;
    tracked.set(new WeakRef(f), l.name || l.id || "");
    n++;
  }
  return n;
}

export function releaseUnheld(lists) {
  const live = new Set();
  for (const list of lists || []) for (const l of list || []) if (l?.features) live.add(l.features);
  const names = [];
  for (const [ref, name] of [...tracked]) {
    const f = ref.deref();
    if (!f) { tracked.delete(ref); continue; } // collected already
    if (live.has(f)) continue; // still in the project, the history or another tab
    f.length = 0;
    tracked.delete(ref);
    names.push(name);
  }
  return { released: names.length, names };
}

// the layers remembered and not yet released or collected (tests)
export const trackedLayers = () => [...tracked.values()];
