// TASKS.csv #1571 (review #1497, Lawyers) — what can be an estimation / variogram domain: every CATEGORICAL interval layer, the
// built-in logs and the custom layers too (Lawyers' "Min Domain" custom layer - CC1-3, AGB2-3, DR2-3, ML, EX, waste - is the
// assessment report's estimation domain and was not offered). A layer of numbers is not a domain (#1413), a point layer has no
// interval to be in, and a layer whose intervals overlap in the same hole (vein types) has no single domain at a depth: offered,
// flagged, with the share of overlapping intervals so the dialogs can say how a depth is resolved. Pure.
import { caseVariantGroups } from "./lithoGroups.js"; // #2427
const BUILT_IN = ["litho", "alt", "vein", "breccia", "weath", "structzone", "geotech"]; // weath: #2162

export function isNumericLayer(rows) {
  let n = 0, num = 0;
  for (const r of rows || []) { if (r.value == null || r.value === "") continue; n++; if (Number.isFinite(Number(r.value))) num++; }
  return n > 0 && num / n > 0.8;
}

// the share of a layer's intervals that overlap another interval of the same hole (by more than 1 cm)
export function overlapShare(rows) {
  const byHole = new Map();
  for (const r of rows || []) { const f = Number(r.from), t = Number(r.to); if (!(t > f) || r.hole_id == null) continue; (byHole.get(r.hole_id) || byHole.set(r.hole_id, []).get(r.hole_id)).push([f, t]); }
  let n = 0, over = 0;
  for (const iv of byHole.values()) {
    iv.sort((a, b) => a[0] - b[0]);
    let maxEnd = -Infinity, prev = -1;
    const flag = new Uint8Array(iv.length);
    iv.forEach(([f, t], i) => { if (f < maxEnd - 0.01) { flag[i] = 1; if (prev >= 0) flag[prev] = 1; } if (t > maxEnd) { maxEnd = t; prev = i; } });
    n += iv.length; over += flag.reduce((a, b) => a + b, 0);
  }
  return n ? over / n : 0;
}

// layers: the project's built-in layers { litho: [...] ... }; customLayers: [{ id, name, rows }]; labelOf(key) -> the built-in label.
// -> [{ key, label, rows, custom, overlap }]: built-in first, then custom layers by name
export function domainLayerChoices(layers, customLayers, labelOf = (k) => k) {
  const out = [];
  for (const k of BUILT_IN) { const rows = layers?.[k] || []; if (rows.length && !isNumericLayer(rows)) out.push({ key: k, label: labelOf(k), rows, custom: false, overlap: overlapShare(rows) }); }
  for (const c of [...(customLayers || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const rows = (c.rows || []).filter((r) => Number.isFinite(Number(r.from)) && Number.isFinite(Number(r.to)) && Number(r.to) > Number(r.from));
    if (rows.length < 2 || isNumericLayer(rows)) continue;
    out.push({ key: `custom:${c.id}`, label: c.name, rows: rows.map((r) => ({ hole_id: r.hole_id, from: Number(r.from), to: Number(r.to), value: r.value == null ? r.value : String(r.value) })), custom: true, overlap: overlapShare(rows) });
  }
  return out;
}

// TASKS.csv #2427 (review #2325, WA uranium) — Dcb (1,252 samples), DCB (733) and DCb (11) were three domains, capped and searched apart.
// For Estimation and the Variogram only (domainLayerChoices stays as it is for the other tools): spellings that differ only by case or
// spaces become the most logged one. -> { rows (values replaced), folded: [{ name, codes }] }
export function foldDomainRows(rows) {
  const sug = caseVariantGroups(rows);
  if (!sug.length) return { rows, folded: [] };
  const to = new Map();
  for (const s of sug) for (const c of s.codes) to.set(c, s.codes[0]);
  return { rows: (rows || []).map((r) => (r.value != null && to.has(String(r.value)) && String(r.value) !== to.get(String(r.value)) ? { ...r, value: to.get(String(r.value)) } : r)), folded: sug.map((s) => ({ name: s.codes[0], codes: s.codes })) };
}

// each raw assay interval's domain: the value of the domain row covering its midpoint (the first by depth when they overlap)
export function domainOfInterval(domainRows) {
  const byHole = new Map();
  for (const d of domainRows || []) { if (!(Number(d.to) > Number(d.from))) continue; (byHole.get(d.hole_id) || byHole.set(d.hole_id, []).get(d.hole_id)).push(d); }
  byHole.forEach((r) => r.sort((a, b) => a.from - b.from));
  return (a) => { const rows = byHole.get(a.hole_id); if (!rows) return null; const m = (Number(a.from) + Number(a.to)) / 2; const hit = rows.find((r) => m >= r.from && m < r.to); return hit ? String(hit.value ?? "") : null; };
}
