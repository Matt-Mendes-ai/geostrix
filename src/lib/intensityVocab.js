// TASKS.csv #2230 (review #2174, WA gold) — alteration intensities logged as letters (W / M / S / I on 11,558 intervals) gave the halo no
// intensity floor: the floor took numeric fields only, so 'ASRC moderate or stronger' could not be modelled. A field whose values are a known
// intensity vocabulary is ranked, and the floor reads 'at least M'. The ranks are an ORDER, not measurements: only >= is used. Pure.
const RANKS = [
  [/^(n|nil|none|absent|no|0)$/i, 0],
  [/^(t|tr|trace|vw|v\.?\s*weak|very\s*weak|weak\s*-\s*trace)$/i, 1],
  [/^(w|wk|weak|wea|slight|sl)$/i, 2],
  [/^(m|mod|moderate|med|medium|w-m|wm)$/i, 3],
  [/^(s|st|str|strong|m-s|ms)$/i, 4],
  [/^(vs|v\.?\s*strong|very\s*strong|i|int|intense|p|perv|pervasive|x|extreme|complete|c)$/i, 5],
];
export const INTENSITY_SCALE = "none 0 < trace 1 < weak 2 < moderate 3 < strong 4 < intense / pervasive 5";
export function intensityRank(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  for (const [re, r] of RANKS) if (re.test(s)) return r;
  return null;
}
const SKIP = new Set(["hole_id", "from", "to", "depth", "value", "_src", "codes", "all_codes", "alt_style"]);
// fields of a log whose filled values are (90 % or more) intensity words or letters, with two or more different ranks -> [{ field, levels:
// [{ label, rank }] ordered by rank (the spellings the log uses) }]
export function intensityVocabFields(rows, { min = 5 } = {}) {
  const seen = new Map();
  for (const r of rows || []) for (const k of Object.keys(r || {})) {
    if (SKIP.has(k)) continue;
    const v = r[k];
    if (v == null || v === "" || typeof v === "number") continue;
    let s = seen.get(k); if (!s) seen.set(k, (s = { filled: 0, ranked: 0, labels: new Map() }));
    s.filled++;
    const rk = intensityRank(v);
    if (rk != null) { s.ranked++; const lab = String(v).trim(); if (!s.labels.has(lab)) s.labels.set(lab, rk); }
  }
  const out = [];
  for (const [field, s] of seen) {
    if (s.filled < min || s.ranked < 0.9 * s.filled) continue;
    const levels = [...s.labels].map(([label, rank]) => ({ label, rank })).sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
    if (new Set(levels.map((l) => l.rank)).size < 2) continue;
    out.push({ field, levels });
  }
  return out;
}
