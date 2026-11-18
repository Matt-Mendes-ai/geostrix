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

// TASKS.csv #3881 (follow-up of #2824) — the same stale-render-context retention for the other big removed things. Measured in the running app (four synthetic payloads
// added and removed, then New project; the heap after 3 forced GCs, a WeakRef on each): a removed raster, block model or point cloud stayed alive through an older
// render's context (the first one added, or the last, stayed after New project), a closed project tab's payload the same. A map layer is let go by emptying its shared
// features array; these are let go by emptying the REMOVED object's own big fields (its picture, cells, vertices, tables), never an array another object may share: a
// stale context then holds a shell. Only an object that left its list for good (its id is no longer there) and that no list of the project, of any undo / redo step or of
// another workspace tab holds.
//   noteRemovedItems(key, prev, next) — the big items (BIG_BYTES or more) of `prev` whose id is not in `next` are remembered by WeakRef.
//   releaseUnheldItems(key, lists)   — every remembered item of that kind that is in none of `lists` is emptied. -> { released, names }
export const BIG_BYTES = 1000000;
const BIG_STRING = 100000, BIG_ARRAY = 1000;
// about how many bytes an item holds in the fields released below (a string, a typed array, an array of numbers / objects, a nested object)
export function itemBytes(v, depth = 0) {
  if (typeof v === "string") return v.length;
  if (ArrayBuffer.isView(v)) return v.byteLength;
  if (!v || typeof v !== "object" || depth > 3) return 0;
  if (Array.isArray(v)) {
    if (!v.length) return 0;
    if (typeof v[0] === "number") return v.length * 8;
    return v.length >= BIG_ARRAY ? v.length * 64 : v.reduce((n, x) => n + itemBytes(x, depth + 1), 0);
  }
  let n = 0;
  for (const k of Object.keys(v)) n += itemBytes(v[k], depth + 1);
  return n;
}
// the item's big fields replaced by empty ones, in place, one level at a time (its own property, never the shared array's contents)
export function emptyBigFields(item, depth = 0) {
  if (!item || typeof item !== "object" || depth > 3) return;
  for (const k of Object.keys(item)) {
    const v = item[k];
    if (typeof v === "string") { if (v.length >= BIG_STRING) item[k] = ""; }
    else if (ArrayBuffer.isView(v)) { if (v.length >= BIG_ARRAY) item[k] = new v.constructor(0); }
    else if (Array.isArray(v)) { if (v.length >= BIG_ARRAY) item[k] = []; else for (const x of v) emptyBigFields(x, depth + 1); }
    else if (v && typeof v === "object") emptyBigFields(v, depth + 1);
  }
}

const trackedItems = new Map(); // WeakRef(item) -> { key, name }

// TASKS.csv #3885 — an item REPLACED by an updated copy with the same id (a recolour, a reproject that makes a new picture, new cells) is remembered
// too: the old object left the list as surely as a removed one, and a stale context kept its old big field. Emptying it reassigns the OLD object's
// own properties only, so a field the new copy shares (the same string or array) stays whole in the new copy.
export function noteRemovedItems(key, prev, next, big = BIG_BYTES) {
  if (!prev?.length || prev === next) return 0;
  const byId = new Map((next || []).filter((x) => x?.id != null).map((x) => [x.id, x]));
  const inNext = new Set(next || []);
  let n = 0;
  for (const x of prev) {
    if (!x || typeof x !== "object" || inNext.has(x) || (x.id != null && byId.get(x.id) === x) || itemBytes(x) < big) continue;
    trackedItems.set(new WeakRef(x), { key, name: x.name || x.id || "" });
    n++;
  }
  return n;
}

export function releaseUnheldItems(key, lists) {
  const live = new Set();
  for (const list of lists || []) for (const x of list || []) if (x && typeof x === "object") live.add(x);
  const names = [];
  for (const [ref, info] of [...trackedItems]) {
    if (info.key !== key) continue;
    const x = ref.deref();
    if (!x) { trackedItems.delete(ref); continue; }
    if (live.has(x)) continue;
    emptyBigFields(x);
    trackedItems.delete(ref);
    names.push(info.name);
  }
  return { released: names.length, names };
}
export const trackedItemCount = (key) => [...trackedItems.values()].filter((i) => !key || i.key === key).length;

// a closed workspace tab: its stored payload (the project it held) is let go the same way once the tab has left the list for good. A payload's fields are DETACHED, not
// emptied (a payload's arrays can be the very arrays a project loaded from it is using).
const trackedPayloads = new Map(); // WeakRef(payload) -> the tab's name
// TASKS.csv #3885 — and a payload a tab still in the list no longer holds (switchToTab sets the tab coming forward to payload null: its data is live
// now, and the old payload object, kept by a stale context, would hold that data after it is replaced); detached once no tab holds it
export function noteClosedTabs(prev, next) {
  if (!prev?.length || prev === next) return 0;
  const byId = new Map((next || []).map((t) => [t?.id, t]));
  let n = 0;
  for (const t of prev) {
    if (!t?.payload || typeof t.payload !== "object") continue;
    const now = byId.get(t.id);
    if (now && now.payload === t.payload) continue; // the same tab, the same payload
    trackedPayloads.set(new WeakRef(t.payload), t.name || t.id || ""); n++;
  }
  return n;
}
export function releaseClosedTabs(currentTabs) {
  const held = new Set((currentTabs || []).map((t) => t?.payload).filter(Boolean));
  const names = [];
  for (const [ref, name] of [...trackedPayloads]) {
    const p = ref.deref();
    if (!p) { trackedPayloads.delete(ref); continue; }
    if (held.has(p)) continue;
    for (const k of Object.keys(p)) delete p[k];
    trackedPayloads.delete(ref);
    names.push(name);
  }
  return { released: names.length, names };
}
