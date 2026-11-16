// TASKS.csv #3686 (rehearsal round 3) — re-importing corrected assays replaced the values and nothing told the shells and block models made from the old ones. Like layerStamp (the lithology log of a surface), a short stamp of
// the assay table: the row count and a 32-bit FNV-1a hash of every row's hole, from, to and each element's value and qualifier. A grade shell or an estimate keeps the stamp of the assays it read (params.assayStamp); when the
// assays are replaced or edited the stamps differ and the result is marked 'assays changed since'. A change detector, not cryptographic. A result made before stamps existed has none: unknown, never stale. Pure.
const OFFSET = 0x811c9dc5, PRIME = 0x01000193;
const mix = (h, s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, PRIME); } h ^= 0x1f; return Math.imul(h, PRIME); };
const cache = new WeakMap(); // the app replaces the array when the assays change: the array is the key
export function assayStamp(rows) {
  if (rows && typeof rows === "object") { const hit = cache.get(rows); if (hit !== undefined) return hit; const v = stampOf(rows); cache.set(rows, v); return v; }
  return stampOf(rows);
}
function stampOf(rows) {
  let h = OFFSET, n = 0;
  for (const r of rows || []) {
    if (!r) continue;
    h = mix(h, String(r.hole_id ?? "")); h = mix(h, String(r.from ?? "")); h = mix(h, String(r.to ?? ""));
    const v = r.values || {};
    for (const k of Object.keys(v).sort()) { h = mix(h, k); h = mix(h, String(v[k] ?? "")); const q = r.qualifiers?.[k]; if (q) h = mix(h, q); }
    n++;
  }
  return `${n}:${(h >>> 0).toString(16).padStart(8, "0")}`;
}
// what an import changed in the assays already loaded: rows by hole|from|to; -> { updated: intervals present before and after, valuesChanged: element values that differ, holes: [hole ids with a changed value] }
export function assayChanges(before, after) {
  const old = new Map();
  for (const r of before || []) if (r) old.set(`${r.hole_id}|${r.from}|${r.to}`, r);
  let updated = 0, valuesChanged = 0; const holes = new Set();
  for (const r of after || []) {
    const o = r && old.get(`${r.hole_id}|${r.from}|${r.to}`);
    if (!o || o === r) continue;
    updated++;
    for (const k of Object.keys(o.values || {})) {
      const a = o.values[k], b = r.values?.[k];
      if (b !== undefined && !(Object.is(a, b) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a))))) { valuesChanged++; holes.add(r.hole_id); }
    }
  }
  return { updated, valuesChanged, holes: [...holes] };
}
