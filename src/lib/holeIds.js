// TASKS.csv #541 — a hole id that misses the collar table only by case, spaces, hyphens or underscores ("ddh-01" vs
// "DDH-01", "DDH 01"): logging sheets and lab files typed by different people. Never matched silently (some
// databases do use case-distinct ids) — the orphan message just names the likely collar.
const idKey = (id) => String(id ?? "").toLowerCase().replace(/[\s_-]+/g, "");
const nearIdCache = new WeakMap();
export function didYouMean(collarIds, id) {
  if (!collarIds || !collarIds.size) return "";
  let m = nearIdCache.get(collarIds);
  if (!m) { m = new Map(); for (const c of collarIds) { const k = idKey(c); if (!m.has(k)) m.set(k, c); } nearIdCache.set(collarIds, m); }
  const hit = m.get(idKey(id));
  return hit && hit !== id ? ` Did you mean "${hit}"? It differs only in case, spaces, hyphens or underscores — fix the id in the file (GeoStrix doesn't merge them on its own).` : "";
}
