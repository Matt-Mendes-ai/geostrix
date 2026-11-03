// TASKS.csv #1631 (review #1497, Lawyers) — Layout pages and templates hold their images as data URLs, and every copy of an element
// (an atlas page, a duplicated page, a template) carried its own copy into the project file: a 44-page atlas took Lawyers from
// 55.7 MB to 104.8 MB, 50.5 MB of layoutPages for 10.3 MB of distinct images, and a 446-hole atlas (~490 MB) would reach V8's
// string limit and could not be saved. In memory the copies are one shared string; in the file each distinct image is now written
// once, in `images`, and an element's field holds { __img: index }. Written only when an image repeats, so a project without
// repeats keeps the plain array it always had.
const MIN_LEN = 2048; // a data URL shorter than this is cheaper inline than as a reference

const isImage = (v) => typeof v === "string" && v.length >= MIN_LEN && v.startsWith("data:");

function walk(v, fn) {
  if (Array.isArray(v)) {
    let out = null;
    for (let i = 0; i < v.length; i++) {
      const w = fn(v[i]) ?? walk(v[i], fn);
      if (w !== v[i]) { out ??= v.slice(); out[i] = w; }
    }
    return out || v;
  }
  if (v && typeof v === "object") {
    let out = null;
    for (const k of Object.keys(v)) {
      const w = fn(v[k]) ?? walk(v[k], fn);
      if (w !== v[k]) { out ??= { ...v }; out[k] = w; }
    }
    return out || v;
  }
  return v;
}

// pages (or templates): an array -> the same array, or { __layoutImages: 1, images, items } when some image repeats
export function poolLayoutImages(list) {
  if (!Array.isArray(list) || !list.length) return list;
  const seen = new Map();
  let repeats = 0;
  walk(list, (v) => { if (isImage(v)) { if (seen.has(v)) repeats++; else seen.set(v, seen.size); } return undefined; });
  if (!repeats) return list;
  const images = [...seen.keys()];
  return { __layoutImages: 1, images, items: walk(list, (v) => (isImage(v) ? { __img: seen.get(v) } : undefined)) };
}

// the reverse: a pooled value -> the array (each reference back to its one shared string); anything else unchanged
export function expandLayoutImages(stored) {
  if (!stored || !stored.__layoutImages) return stored;
  const { images = [], items = [] } = stored;
  return walk(items, (v) => (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 1 && Number.isInteger(v.__img) ? images[v.__img] ?? null : undefined));
}
