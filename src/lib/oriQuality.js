// TASKS.csv #1545 (review #1497, Lawyers) — orientation-line quality per structure pick. On oriented-core projects the first
// QC step is to drop (or down-weight) the picks taken where the orientation line was poor: Lawyers logs it as its own
// interval table ("OriCore": Ori Line Quality 1 / 2 / 3 over 1,728 intervals in 104 holes, with angle_difference and
// confidence), which imports as a custom layer. A pick's quality is its own field when the structure file had one, else
// the quality of the custom-layer interval holding its depth. Pure: no React, no three.js.
export const ORI_LAYER_RE = /ori.?core|ori.?line|orient\w*.?(line|qual)|line.?qual/i;
export const PICK_QUALITY_FIELDS = ["ori_quality", "oriQuality", "orientation_quality", "line_quality", "lineQuality", "ori_line_quality", "quality"];

const qualityOf = (v) => { if (v == null || String(v).trim() === "") return null; const q = Number(v); return Number.isFinite(q) && q >= 0 && q <= 5 && q === Math.round(q) ? q : null; }; // a blank is no quality, not 0

// The custom layer that carries the orientation-line quality: named for it, interval rows, and most values a small whole number
export function findOriQualityLayer(customLayers) {
  for (const l of customLayers || []) {
    if (!ORI_LAYER_RE.test(String(l?.name ?? ""))) continue;
    const rows = l.rows || [];
    if (!rows.length) continue;
    let ok = 0, seen = 0;
    for (const r of rows) { if (r.value == null || r.value === "") continue; seen++; if (qualityOf(r.value) != null) ok++; }
    if (seen && ok >= seen * 0.5) return l;
  }
  return null;
}

// hole_id -> intervals sorted by from, for the lookup
export function oriQualityIndex(layer) {
  const idx = new Map();
  for (const r of layer?.rows || []) {
    const q = qualityOf(r.value), from = Number(r.from), to = Number(r.to);
    if (q == null || !Number.isFinite(from) || !Number.isFinite(to) || r.hole_id == null) continue;
    const k = String(r.hole_id).trim();
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push({ from: Math.min(from, to), to: Math.max(from, to), q, angleDifference: Number(r.angle_difference), confidence: Number(r.confidence) });
  }
  for (const list of idx.values()) list.sort((a, b) => a.from - b.from);
  return idx;
}

// the quality the layer logs at this hole and depth (the interval holding it; the last interval's end counts), or null
export function qualityAt(index, holeId, depth) {
  const list = index?.get(String(holeId ?? "").trim());
  if (!list || !Number.isFinite(depth)) return null;
  for (let i = 0; i < list.length; i++) { const iv = list[i]; if (depth >= iv.from && (depth < iv.to || (i === list.length - 1 && depth <= iv.to))) return iv.q; }
  return null;
}

// a pick's quality: its own field first, else the custom layer's interval; null = unknown
export function pickQuality(pick, index = null) {
  for (const f of PICK_QUALITY_FIELDS) { if (pick?.[f] != null && pick[f] !== "") { const q = qualityOf(pick[f]); if (q != null) return q; } }
  return index ? qualityAt(index, pick?.hole_id, Number(pick?.depth)) : null;
}

export function qualityLevels(index) {
  const s = new Set();
  for (const list of index?.values() || []) for (const iv of list) s.add(iv.q);
  return [...s].sort((a, b) => a - b);
}

// keeps the picks whose quality is at most maxQ; a pick with no quality is kept and counted
export function filterByQuality(picks, maxQ, index = null) {
  const q = maxQ === "" || maxQ == null ? NaN : Number(maxQ);
  if (!Number.isFinite(q)) return { kept: picks || [], dropped: 0, unknown: 0, total: (picks || []).length };
  const kept = []; let dropped = 0, unknown = 0;
  for (const p of picks || []) {
    const pq = p.outcrop ? null : pickQuality(p, index);
    if (pq == null) { unknown++; kept.push(p); continue; }
    if (pq <= q) kept.push(p); else dropped++;
  }
  return { kept, dropped, unknown, total: (picks || []).length };
}

// one sentence for the dialogs
export function qualityNote(res, maxQ, tr) {
  if (!res || maxQ === "" || maxQ == null || !Number.isFinite(Number(maxQ))) return "";
  return tr("{dropped} of {n} downhole picks left out (orientation-line quality above {q}); {unknown} with no quality kept.", { dropped: res.dropped.toLocaleString(), n: res.total.toLocaleString(), q: maxQ, unknown: res.unknown.toLocaleString() });
}
